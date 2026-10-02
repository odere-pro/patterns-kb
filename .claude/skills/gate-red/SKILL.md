---
name: gate-red
description: "Diagnose a red check gate, local or in CI: find the owning gate, its triage section and the one command that reproduces it, then fix the cause. Use when make validate, make site-build, the pre-commit hook or a CI step fails and the failure line is unclear, or when asked what to run before committing. Not for writing a new gate or for warnings."
---

# A gate is red

Every red has an owning gate, a registry row in `docs/data/gates.json` and a section on the
[triage page](../../../docs/reference/triage.md); the job is to find them, not to guess. A fix
that moves the red to another gate is not a fix, so the loop ends on the whole set, not on the
gate you started from.

1. **Take the first failure line.** A registered gate prints `[name] FAIL <file>: <what>`,
   `[name] FAIL <file>:<line>: <what>` or `<RULE-ID> <file>:<line> <message>`; the bracketed
   name is the registry `id`. Take the top of the output, not the last line: a later failure is
   often a symptom of the first one, not a second bug.
2. **Hand it to the [gate-triage](../../agents/gate-triage.md) agent** and read its five
   answers: the gate, what it protects, why it is red, the repro and the fix. Do not read the
   registry, the triage page or the gate's source yourself first; keeping that reading out of
   your context is the agent's job.
3. **Reproduce it alone**, with the agent's repro — the row's own command:

   ```bash
   make gate G=<stem>
   ```

   Add `ARGS=--check` for a generator. A failing vitest file reruns with
   `make tools-test T=<name>`, the bash suite with `bash tests/run.sh`.
4. **Fix the cause** at the file and line the finding names. A file a generator writes, or a
   generated marked block, is fixed at its source — the markdown page or the `docs/data/` file
   it is built from — then rebuilt with `make gen`, never edited in place. When the gate itself
   is wrong, fix it under `tools/src/gates/` with its test in the same change, and run
   `make gates` if its registry row changed.
5. **Close the loop** on the whole set, and on the site build when the red gate runs there:

   ```bash
   make gen && make validate
   make site-build
   ```

   Or `make verify` for the lot: it runs `make site-build`, `make site-e2e` and `make validate`
   in that order.

6. **Home the trap.** A trap the red taught you that has no home goes to the
   [inbox](../../../docs/inbox.md); when your fix gave an open entry its home, retire it with
   the [retire-gotcha](../retire-gotcha/SKILL.md) skill.

## When the red is not your bug

Another session may be editing this repo at the same time.

- **The pre-commit hook checks the staged tree**, not the working tree: it extracts the index
  to a temp folder and runs the checks there. A commit of a data file without the files it
  builds is rejected, correctly; commit a change and what it generates together.
- **Stage exact paths**, never `git add -A` or a directory: you would sweep up another
  session's half-written work and its red with it.
- **A red that appears right after another session touched `tools/`** is usually that session
  mid-write, and a test that fails only on a timeout is usually load: re-run that one gate or
  test file alone before diagnosing.

## Done means

- The gate that was red passes alone.
- `make validate` exits 0, and `make site-build` too when the red was a site gate.
- `git status --porcelain` shows only the diff you meant to make.
- The trap the red taught, if any, is in the inbox or retired from it.
