---
name: kb-verify
description: Run and interpret the patterns-kb build and verification loop — make all, make check's eleven sub-steps, make test, the worklist reports (report-lens, report-links, report-vocab, report-variation-links), and the multi-session lock and staged-tree rules. Use when someone asks "why is make check failing", "what does this build error mean", "regenerate everything", "is the KB green", "why is graph.json stale after make all", "what should I run before committing", or when a build step fails and it is not obvious which skill owns the fix.
---

# The build and verify loop

Nothing about the site is hand-maintained twice. The pages are the source of truth and
everything else is projected from them:

```
make all      # regenerate every derived artifact from the pages
make check    # verify nothing is stale, dangling or contradictory (11 steps)
make test     # smoke-test the builders against the fixture corpus
make          # list every target
```

`make all` takes a repo lock (`scripts/with-lock.mjs`) because six builders read back what
`build.mjs` writes. `make check` and the single-builder targets do not.

## The two-build gotcha

`make all` runs `build.mjs` **before** `build-pages.mjs`. When an edit is *structural* —
new blocks, new element ids, a changed `data-kb-group`, anything `build-pages.mjs` rewrites
inside the page — the graph was derived from the pages **as they were at the start of the
run**, and `make check` then reports `graph.json is STALE`.

That is not a broken build. Run it again:

```bash
make all && make all && make check
```

The second pass sees the rewritten pages and converges. A content-only edit needs one pass.

## Reading a `make check` failure

Each step has an owner. Match the message, then go to the skill that owns it.

| Message | What it means | Owner |
|---|---|---|
| `graph.json is STALE` | pages changed since the graph was derived | run `make all` again — see above |
| `N page(s) STALE` | a generated region inside a page is out of date | `make all` |
| `index.html is STALE` | the hub does not match its builder's output | **kb-hub** |
| `vocab.html is STALE` | the ontology page lags the vocabularies | **kb-vocab** |
| `map/graph.html` / `map/stack.html is STALE` | a band, group or relation change | **kb-hub**, **kb-graph** |
| `N CLAUDE.md file(s) STALE` | a folder's page list or group changed | `make all` |
| `on no hub section` | a non-pattern page is in no ordering array | **kb-hub** |
| `lives in X but its band/group means Y` | path disagrees with the attributes | **kb-move** |
| dangling href / mermaid click target | a link resolves to nothing | **kb-move** (if a move caused it), else fix the link |
| a mermaid diagram fails to parse | syntax the vendored engine rejects | **diagram-draw** |
| one-way, dangling or contradictory relation | an edge declared on one page only | **kb-edit** |
| `TOUR WITHOUT FLUENCY` / `FLUENCY WITHOUT TOUR` | theme membership declared on one side | **kb-edit** |
| an undocumented `data-kb-*`, or a tag used on <3 pages | vocabulary drift | **kb-vocab** |
| a block renders empty at a lens | a list tagged entirely up a level | **kb-explain** |

Two things `make check` **cannot** catch, so check them by hand when relevant:

- **Fragments.** `check-links.mjs` strips `#anchor` before resolving, so a renamed hub
  anchor is silently dead across ~757 corpus links. The gate for that is in **kb-hub**.
- **A consistently wrong builder.** Every `--check` compares a builder against its own
  output, so a bug that changes both passes unnoticed. That is what `make test` is for.

## The worklists — reports, not gates

These print work to consider. None of them fails a build, and none should be "cleared" for
its own sake.

| Command | Surfaces | Owner |
|---|---|---|
| `node scripts/report-vocab.mjs` | tag drift, unbridged pages, tag audit | **kb-vocab** |
| `node scripts/report-lens.mjs` | pages outside the per-kind sizing bands (`--strict` gates) | **kb-explain** |
| `node scripts/report-links.mjs` | prose that names a page it never links | **kb-edit** |
| `node scripts/report-variation-links.mjs` | `variations` entries naming an unlinked page | **kb-edit** |

`report-links.mjs` is deliberately noisy — "Gateway", "Saga" and "Repository" are ordinary
English at least as often as they are page titles. Review, do not clear.

## Working alongside another session

Another agent or session may be editing this repo at the same time. Three rules:

- **Never `make all` while authoring agents are still writing.** You will build a graph from
  a half-written corpus, and every artifact will agree with each other and with nothing.
- **Stage exact paths.** `git add <path> <path>`, never `git add -A` or a directory — you
  will sweep up another session's in-flight work.
- **The pre-commit hook validates the STAGED tree**, via `KB_ROOT` pointed at an extract. So
  a commit of `model.mjs` without the pages it regenerated is rejected, correctly. Commit a
  change and its derived artifacts together.

A transient `make test` failure right after another session touched `scripts/lib/` is
usually that session mid-write. Re-run before investigating.

## `KB_ROOT`

Every builder honours `KB_ROOT` to point at another corpus — the fixture used by
`make test`, and the staged extract used by the pre-commit hook. Without it a
`KB_ROOT=… make check` would silently validate the working tree instead, which is the exact
hole a staged-tree check exists to close. Preserve it in any new builder.

## Before you commit

```bash
make all && make check && make test
git status --porcelain          # confirm the diff is only what you meant to change
```
