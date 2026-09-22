# Harness optimization — working plan

Branch: `harness/optimize` (from `main` @ `3f5c601`). Delete this file, or move
what survives into `CLAUDE.md` / `.claude/rules/`, before the PR merges.

## Goal

Optimize the repo's data harness following a cookbook the owner supplies. The
cookbook is the spec: do not start changes before it arrives.

## Workflow

1. All changes land on `harness/optimize` only. `main` is untouched until the PR.
2. One small commit per coherent change, conventional subject (≤72 chars), no
   AI attribution. Stage exact paths, never `git add -A` or a directory: another
   session may have work in the same tree.
3. `make all && make check` green before every push. The pre-commit hook
   (`git config core.hooksPath .githooks`) runs `make check` on the staged tree.
4. Push after each commit, so the branch is the handoff between machines.
5. When the owner confirms the result, open a PR `harness/optimize` → `main` with
   a summary and test plan. Merge only on the owner's explicit go-ahead.

## Status

- [x] Branch created and pushed
- [ ] Cookbook received (paste or commit it under `plans/`)
- [ ] Changes applied, per cookbook step
- [ ] Owner review
- [ ] PR opened and merged

Update this checklist in the same commit as the work it tracks.

## Picking up on another machine

`main` was force-pushed on 2026-09-23 (work email scrubbed from history). A
clone older than that must not push its old `main`.

```bash
git fetch origin
git switch harness/optimize   # or: git switch -c harness/optimize origin/harness/optimize
git config core.hooksPath .githooks
```

An old clone's local `main` should be reset: `git switch main && git reset --hard origin/main`.

Then tell the new Claude session: "Read `plans/harness-optimize.md` and continue
from its Status."
