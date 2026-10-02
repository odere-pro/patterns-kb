# Working in tests/

The bash test suite: one `*.test.sh` per hook under `.claude/hooks/`, each run in its own
process and sandbox by [run.sh](run.sh), with the assertions and sandbox helpers in
[lib.sh](lib.sh). The TypeScript suite lives under `tools/` ([its layer](../tools/CLAUDE.md)).

```bash
bash tests/run.sh                          # every file, one line each
bash tests/run.sh guard -v                 # one file, every assertion
KB_TEST_BASH=/bin/bash bash tests/run.sh   # under the stock macOS bash 3.2
```

`make validate` runs the same suite as the `tests-bash` gate, one finding per failed assertion.

## Conventions

- **A hook's test is `hooks/<hook name>.test.sh`, and it names the hook.** The
  test-colocation gate fails a hook without one.
- **Start a file with `make_sandbox`.** It gives the file a private HOME, project directory
  and git repository, and points `CLAUDE_PROJECT_DIR` there, so no case touches the real tree.
- **Prove silence as well as output**: the ordinary input, garbage on stdin, no `jq` on PATH
  (`path_without jq`), and an unchanged tree (`tree_digest`).
- **Name the spec scenario in the label** (`hooks-O1: …`), so a finding points at the
  criterion it breaks.
- **Write for bash 3.2**: no associative arrays, no `${var,,}`, no `mapfile`. A hook runs
  under whatever `bash` the contributor has.

## Don't

- **Don't `set -e` in a test file.** One failure must not hide the rest; the EXIT trap in
  `lib.sh` sets the status.
- **Don't install another EXIT trap**, or source a script that does. It replaces the one in
  `lib.sh`, and the file then exits 0 with its failures printed.
- **Don't add a guard row without its cases**: the deny in every command position, the
  corrected form allowed, and the command named only as an argument or as text in a message
  or heredoc allowed (`assert_text_only`).
