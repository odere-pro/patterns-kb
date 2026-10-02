---
description: "What a comment in this repo's code may say: the mechanism and its reason, in the present tense, with no issue number, date, history, first person or person's name. Use when writing or changing a comment in a script, a gate, a hook, a workflow, the Makefile or the site runtime."
paths: ["scripts/*.mjs", "scripts/*.sh", "tools/**", "tests/**", ".claude/hooks/**", ".claude/workflows/**", ".githooks/**", "Makefile", "site/src/**/*.ts", "site/src/**/*.astro", "site/src/**/*.css", "site/astro.config.mjs"]
---

# Code comments

**Question:** what may a comment say?

A comment is read by whoever opens the file next, months from now, with no memory of the
change that put it there. Write for that reader: state what the code does that the code
cannot say for itself, and why it is that way. The history is in `git log`, and `git blame`
is one command away; a comment that carries history goes stale the moment anything moves.

## Write it without history

- **No issue, pull request or commit references.** The number belongs in the commit message.
- **No dates and no release names.** Either one dates the file rather than explaining it.
- **No history.** Not `used to`, `no longer`, `previously`, `until now`. State the rule the
  code enforces now; the reason it exists is the failure it prevents.
- **No first person.** Not `we`, `our`, `I`. Say what the code does. Second person addressing
  the next author (`raise it when you raise coverage`) is fine.
- **No person's name.** `git blame` already names the author.
- **No temporal words.** Not `today`, `currently`, `for now`, `recently`. `for now` promises a
  follow-up nothing tracks.

The past tense is allowed for one thing: a failure the code is built to prevent, told without
saying when it happened. A criterion read out of somebody else's documentation is pinned with
its URL and the date it was read; that date is a citation, not this repo's history.

## Write it readable

- **Say why, not what.** A comment that renames the line under it is noise. The ones worth
  writing carry a constraint, a trap, an ordering that matters, or the reason an obvious
  simpler shape does not work.
- **Full sentences, ordinary words**, wrapped near the file's line length.
- **One idea per paragraph.** A block answering three questions is three paragraphs.
- **No commented-out code**, and no `TODO`, `FIXME`, `XXX` or `HACK`. Delete the code; git has
  it. Unfinished work goes to [the backlog](../../plans/backlog.md), and a trap to
  [the inbox](../../docs/inbox.md).

## Prefer a block above the code

- **Every file gets a header comment**: `/** … */` in TypeScript and JavaScript, a `#` block
  under the shebang in shell. It says what the file is for, what the caller may assume, what
  it deliberately does not do, and its usage line.
- **Every exported symbol gets a doc comment**, so an editor shows it at the call site.
- **Above, not beside.** A trailing comment is for a fragment of a few words. Anything with a
  reason in it goes on its own lines above the statement.

## The test

Read the comment with the diff hidden and the history unavailable. If it only makes sense to
someone who watched the change land, rewrite it into the rule the code follows and put the
story in the commit message.

## What holds it

Review holds this rule; no gate enforces it. A comment naming a path or a command is a claim
like any other: [claims.md](claims.md).
