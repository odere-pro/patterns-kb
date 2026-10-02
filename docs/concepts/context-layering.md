---
title: Context layering
description: How CLAUDE.md is split into a root layer and one layer per governed directory so every fact has one home, and what the context-layers gate holds.
area: reference
owner: Oleksandr Derechei
tags: [modularity, separation-of-concerns]
status: stable
---

# Context layering

This repo keeps a **root layer**, `CLAUDE.md`, plus one layer per governed directory, and
each fact lives in exactly one file. The context-layers gate,
[`check-claude-md.ts`](../../tools/src/gates/check-claude-md.ts), holds the rules below in
`make validate` and in CI.

## Routed context

Every fact has one home. The root holds only what is true everywhere: the source of truth,
how to read and write the KB, which skill owns a request, and how to share the tree with
other sessions. A directory's layer holds only what someone changing files there needs.
Everything else is a link to the file that owns it: a rule under `.claude/rules/`, a skill,
a page under `docs/`, a program's header comment.

A layer never restates a fact that lives elsewhere. A line copied down from the root, or up
from an authority doc, is a fact with two homes: delete one and link to the other. The gate
catches a verbatim copy of a long root line; review catches the paraphrase.

One list repeats on purpose. The root names every skill once, alphabetically, so a session
knows every skill's name from its first read; which skill owns which job lives only in
[skill-routing.md](skill-routing.md).

## How loading works

Claude Code reads the root layer at session start, and a directory's layer when the session
works with files there. A session editing a gate pays for `tools/CLAUDE.md` and nothing
else, so the root is the expensive layer: every session reads it. Put a fact in a directory
layer when it can go there.

A rule under `.claude/rules/` with `paths` in its frontmatter loads only when a session
touches a matching file. A shell command touches none in that sense, so a page changed
through `kb.mjs` loads neither page rule, and the root layer tells a session to open them
first. A rule without `paths` loads at session start, like the root, so only a rule
governing an act with no file may omit them. The rule format and the five core rules
are in [`tools/src/lib/rules.ts`](../../tools/src/lib/rules.ts).

## What a directory layer holds

In order: what the directory is, in one plain paragraph; its conventions, as imperatives; a
`Don't` heading naming mistakes actually made there; and links to the files that own the
details. The gate requires the `Don't` heading with something under it and at least one
repo-relative link, and every link in any layer must resolve. It reads headings and links
outside fenced blocks only: a `# Don't` comment in a shell sample is not the heading.

## Budgets

`ROOT_BUDGET`, `LAYER_BUDGET` and `NESTED_MAX_LINES` in the gate are the budgets, and its
summary line prints the root's count against its budget. Over budget is a routing problem,
not a prose problem: move a fact to its single source and leave a link, never compress the
prose to fit. A layer at its budget takes a new fact only by moving an old one out, in the
same change.

After an edit to a layer, the advisory hook,
[`after-write.sh`](../../.claude/hooks/after-write.sh), prints its count once it is within
`ADVISORY_MARGIN` words of its budget, the margin included, and says when it is over. It
reads `ROOT_BUDGET`, `LAYER_BUDGET` and `ADVISORY_MARGIN` out of the gate, so the gate stays
their only home; a nested layer draws no note.

## The governed set

The gate computes it each run: every top-level directory that is not dot-prefixed and not
in `EXEMPT`, which names each exempt directory with its reason. A directory added tomorrow
is governed tomorrow and fails the gate until it has a layer. `plans/` is exempt because
its files are working plans a person opens on purpose, each deleted or folded into `docs/`
and `.claude/rules/` when its work lands.

A deeper directory carries a layer only when `EXTRA_DIR_LAYERS` names it, and none does
today. Every folder under a `NESTING_ROOTS` entry carries a nested layer: the four headings
Intent, Purpose, Gotchas and Tradeoffs, no `Don't` and no link required. Its one entry,
`site/src/components`, holds one folder per component of the site.

## Placement

A `CLAUDE.md` anywhere else is a placement finding, unless
[the allowlist](../data/allow/context-layers.json) excuses it with an owner, a date and a
reason. It ships empty.

An entry excuses the place only: an excused layer's links must still resolve, and it may
copy no root line.

The placement walk reads the disk, not the git index. It skips installed code, build output,
the root `tmp/` and the second checkouts under `.claude/worktrees/`.

## Maintenance

A change that alters a directory updates its layer in that change, and a change creating a
governed directory creates its layer. There is no separate cleanup pass: a layer nobody
maintains is worse than none, because a session believes it.

`make gate G=check-claude-md ARGS=--fix` only appends a missing heading with one question
under it. The finding stays until a person writes the answer: that run exits 1, and so does
every later one, since a heading holding only the question is an empty heading.
