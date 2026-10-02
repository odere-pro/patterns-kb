---
description: "Every command, flag, path, gate, generator, workflow step and count a page or harness file names is a claim about this tree; fix each claim in the change that renames, moves, removes or reflags what it names. Use when changing the Makefile, a script, a gate, a generator, a hook or a CI workflow."
paths: ["Makefile", "scripts/*.mjs", "scripts/*.sh", "tools/src/**", ".github/workflows/**", ".claude/hooks/**", ".githooks/**", "tests/*.sh"]
---

# Claims

**Question:** which claims does this change break?

The pages, the top-level markdown files and the harness files (every `CLAUDE.md`, the rules,
skills and agents) name commands, flags, paths, gates, generators, workflow steps and counts.
Each is a statement about this tree that a reader acts on, and it goes stale the moment the
thing it names moves. The change that moves it is the only cheap moment to fix it.

## The must

Before finishing a change that renames, moves, removes or reflags a `make` target, a program,
a flag, a gate, a generator, a workflow step or a path, search for the old name and fix every
claim naming it, in the same change:

```bash
git grep -n "<old name>" -- '*.md' .claude .githooks Makefile
```

- **A behaviour change without a rename is still a claim change.** A new flag, a new branch,
  a changed default: the page describing that surface describes the old behaviour until you
  touch it.
- **Rewrite a claim; never delete it to make it true.** A page that stops naming the command
  teaches nobody.
- **A change that reshapes a whole behaviour runs the sweep.** When a phase lands or a tool
  retires, many pages describe the old world at once: run the
  [docs-sweep](../skills/docs-sweep/SKILL.md) skill before the change merges.
- **Fix generated text through its source.** A marked block (`<!-- name:start -->`) or a
  stamped file changes only through its data file and the command its stamp names.

## Counted claims

A sentence that counts things goes stale the day the set changes. Prefer a count a generator
fills, such as the `gate-count` block on the triage page. Where a literal number must stand
(the page counts in the root layer and the README), recount it in the change that changes the
set.

## What holds it

The claim gate, [check-claims.ts](../../tools/src/gates/check-claims.ts), holds the floor: every
`make` target, single-gate run and program path in a shell-labelled fence resolves. So label a
command fence `bash`, write a placeholder as `<name>`, and end a line that must not be judged
with `# claim-ok`. Everything else a page claims, from a flag's meaning to a count in prose, is
this rule's and review's.
