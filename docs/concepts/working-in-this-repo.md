---
title: Working in this repo
description: Sharing a tree other sessions edit at once — atomic writes, the staged-tree pre-commit, staging and restoring files, what runs around an edit.
area: reference
owner: Oleksandr Derechei
tags: [concurrency, isolation]
status: stable
---

# Working in this repo

More than one agent edits this repo at a time, and the files `make gen` writes are shared
mutable state. Two mechanisms carry that, so the protocol a session follows is short:
[the root layer](../../CLAUDE.md) states it, and this page says why each part exists.

## Atomic writes

Every generated file is written atomically, through `emit` in
[`tools/src/lib/generated.ts`](../../tools/src/lib/generated.ts), so a reader never sees a
truncated `relations.json` or reference page: without it, a gate in one session dies with
`SyntaxError: Unexpected end of JSON input` while another is in the middle of `make gen`.
`emit` also leaves a file alone when its bytes already match, so two sessions running
`make gen` over the same sources write nothing twice.

## The staged-tree pre-commit

[`.githooks/pre-commit`](../../.githooks/pre-commit) runs the registered gates on the staged
tree. A freshness gate compares its output against the working tree, so a green working tree
proves nothing about what you are committing: that is how a generated file once shipped
without the source that produced it, turning `main` red. Git runs it only once
`core.hooksPath` points at `.githooks/`, which is why the root layer asks for that setting once
per clone.

It runs when the staged change touches anything a gate reads — `docs/`, `tools/`, `site/`,
`scripts/`, `tests/`, `.claude/`, `.githooks/`, the workflows, the Makefile, a `CLAUDE.md`, `README.md` or the
package files — and runs the driver's `--changed` mode with the staged paths, so only the
gates that scan them run. A staged deletion runs every gate, since what a deleted file breaks
is somewhere else. The site-build gates never run there: they need a fresh build. The reader
flows (`make site-e2e`, about ten seconds) do, when the staged change touches `site/src/`, the
site build's programs, `docs/data/site-structure.json` or the flows under `tools/e2e/`, and a
built site exists: they run the staged flows on the last build of the working tree, and skip
with one line when there is none. Several gates ask
git for the tracked file list, so the extracted tree gets a throwaway repository holding a
copy of the staged index; it never points git at this repository, because the test suites
make sandbox repositories whose git commands would then act on this one. The `build-untracked`
gate fails a commit that tracks built output, such as `site/dist/` or an `.html` file.

## Staging and restoring

The root layer gives the directives; these are the reasons behind them.

- **Why exact paths.** Another session's half-finished work usually sits in the same tree,
  and `git add -A`, `.` or a directory stages it with yours. The same goes for a file that
  carries someone else's changes too, which is why only your own hunks go in.
- **Why `git show HEAD`.** `git checkout -- <path>` restores from the index, which other
  sessions stage into and which lags `HEAD`, so it can swap your file for an older version
  without a word.
- **Why not `--amend`.** `git commit --amend` would commit another session's staged work under
  your message. Build the commit from `HEAD`'s tree with `git commit-tree`, then move the
  branch with `git update-ref`, passing the old value so it refuses if `HEAD` moved.

## Around every edit and shell command

Two hooks, wired in `.claude/settings.json`, run around a session's tool calls. Neither
blocks a session, and neither runs a build.

- **After an edit**, [`after-write.sh`](../../.claude/hooks/after-write.sh) names what the
  edit owes. Its header lists every case; they are, in short: a stamped file, the command
  that rebuilds it; a file in an ignored output folder such as `tools/coverage/` or
  `site/dist/`, that the next run replaces it; a data file, what reads it and the command to
  run; a skill, agent or rule, the two harness gates; a context layer near or over its budget,
  the count. Any other edit draws nothing: a page, a script, the Makefile or a hook draws no
  note, and `make validate` and the pre-commit hook still hold them.
- **Before a shell command**, [`guard-commands.sh`](../../.claude/hooks/guard-commands.sh)
  denies the handful of commands that succeed in this shared tree and leave the wrong answer
  behind, the ones above among them, and says what to run instead.

Running the build stays yours: nothing runs a gate after an edit, so run
`make gen && make validate` before you commit, and the pre-commit hook runs the gates on the
staged tree. A skill or brief that says a hook runs a check after each edit is stale: fix
it in the change that finds it.

To test the built site by hand, and to watch a change turn a gate or a reader flow red, follow
[Testing the site](testing-the-site.md).

## Commands that keep their prompt

`permissions.allow` in `.claude/settings.json` lets a session run, with no prompt, the
commands the harness tells it to run: `make`, `kb.mjs` and the other repo programs, the git
reads, and read-only tools such as `grep`, `find`, `jq` and `ls`. It holds two writes: `git add`,
the step that stages exact paths, and `mkdir -p tmp/designs/`, the scratch folder the
**sys-design** skill writes into. `find` and `sort` stay on it although a flag
makes each one write (`find -delete` or `-exec`, `sort -o`): that is the owner's accepted
risk. Nothing on it runs whatever it is handed.

The route gate, [check-harness-routes.ts](../../tools/src/gates/check-harness-routes.ts),
holds both sides. It fails an allow entry that lets a write run with no prompt (`WRITES` in
the same file: `rm`, `cp`, `mv`, `tee`, `curl`, `git commit`, `git push`, `node -e` and the
rest), whether the entry names the write or a wildcard such as `git:*` reaches it. And it
reads the commands every skill, agent, rule, workflow and `CLAUDE.md` layer names, and fails
one that neither the allow list nor the list below covers, because a session that follows it
stops on a prompt nobody chose. It reads a line of a `bash`, `sh`, `shell`, `zsh` or
`console` fence, whatever its first word; a line of an unlabelled fence or an inline code
span when its first word is a known program (`PROGRAMS` in
[permissions.ts](../../tools/src/lib/permissions.ts)); and no other fence (`text`, `json`).
A command written with a placeholder (`rm <file>`) is checked by the part before it, and only
a wildcard entry can cover it. The list below is `PROMPT_KEPT` in the gate, and a test keeps
this table equal to it.

| Command | Why it keeps its prompt |
| --- | --- |
| `sed` | It edits files in place with `-i`, and a page change goes through the `kb.mjs` writers. |
| `node -e` | It runs whatever code it is handed, so allowing it allows everything. |
| `git mv` | It moves tracked files in a tree other sessions share. |
| `git config` | It changes how git behaves for every session in the clone. |
| `gh issue` | It writes to GitHub, where other people read it. |
| `gh api` | It can write anything the token can, and a read looks like a write. |
| `head` | Read-only, but not on the allow list the owner chose; a skill that pipes into it prompts once. |
| `git checkout` | It overwrites a file from the index other sessions share; restore with `git show HEAD:<path>` instead. |
| `bash tests/run.sh` | The owner allowed the whole-suite run exactly; one file with its flags asks first. |

Any other write (`rm`, `cp`, `mv`, `git commit`) stays off both lists: a harness file that
names one fails the route gate until the owner decides which list it belongs on. The hooks
under `.claude/hooks/` are programs, not instructions a session follows, so the gate does
not read them for commands.
