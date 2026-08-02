---
name: kb-move
description: Move a patterns-kb page to a different band or group — the file move, the data-kb-group rewrite (kb.mjs has no setter for it), and the relative links that break in both directions. Use when someone asks to "move this pattern to another band", "this belongs under Resilience not Routing", "regroup these pages", "change a page's band", "re-file this page", or when make check reports that a page's path disagrees with its band or group.
---

# Moving a page

A page's **path must match its `data-kb-band` and `data-kb-group`** — `folderFor()` in
`scripts/lib/model.mjs` resolves one from the other, and `validate.mjs` fails the build when
they disagree. So re-filing a page is never just a `git mv`, and never just an attribute
edit. Decide which of the three shapes you are in before touching anything.

## Which move is this?

| Situation | Cost |
|---|---|
| **Regroup inside a band, groups share a folder** (`dir` alias) | one attribute per page. No file move, no link changes. |
| **Regroup inside a band, different folders** | file move + attribute + links |
| **Different band** | file move + two attributes + links, and the page's own `../` depth may change |

**Prefer the first.** A group may carry an optional `dir` in `BANDS` so two groups share one
directory — that is how `distributed-routing`/`distributed-scale` and
`distributed-coordination`/`distributed-data` were split without moving 27 files. If the
move is editorial (this subsection got too big, these pages belong together) and the pages
stay in the same band, add a group with a `dir` alias instead of moving files. The page
still declares its own group honestly; only the folder is shared.

Adding the group itself is the **kb-hub** skill.

## Why links break, and in which direction

The site uses **relative links only** — it must work from `file://`. So a move breaks links
two ways, and they fail differently:

- **Outbound** — every `../` inside the moved page. These break only when the move changes
  the page's **depth**. `patterns/distributed/routing/x.html` →
  `patterns/distributed/coordination/x.html` is the same depth and outbound links survive;
  `patterns/enterprise/x.html` → `patterns/distributed/resilience/x.html` is one level
  deeper and every `../` in the file is now wrong. This used to include four hand-authored
  `../assets/*` tags in `<head>` — now it is two, and both are `kb:generated`, so
  `make all` re-derives them from the page's own new path with no manual fix at all.
- **Inbound** — every link from another page to this one. These break on **any** move.
  Sibling links (`./foo.html`) from pages left behind become `../<newfolder>/foo.html`.

`node scripts/check-links.mjs` (part of `make check`) catches both. It resolves `href`,
`src` and mermaid click targets — but it **strips `#fragment` first**, so a moved page that
other pages deep-link into by anchor is checked only as far as the file.

## The procedure

1. **Confirm the target exists.** The band and group must already be in `BANDS`. If you are
   inventing one, that is a hub change first — **kb-hub**.

2. **Move the file** (skip when the groups share a `dir`):
   ```bash
   git mv site/patterns/<old>/<id>.html site/patterns/<new>/<id>.html
   ```

3. **Rewrite the attributes.** `kb.mjs set` handles `--aliases`, `--tags`, `--solves` and
   `--favourite` — it has **no `--band` or `--group`**. For one or two pages, edit
   `data-kb-band` / `data-kb-group` on `main.doc-wrap` directly. For a batch, write a
   migration under `scripts/migrations/` rather than editing by hand: see
   `2026-08-distributed-group-split.mjs` for the shape — a hard-coded id map, anchored on
   `data-kb-id` so a stray attribute elsewhere cannot match, idempotent, `--dry` first,
   `KB_ROOT`-aware.

4. **Fix the links.** Run `make check` and let `check-links.mjs` list them. Fix outbound
   first (they are all in the one moved file), then inbound.

5. **Regenerate and verify:**
   ```bash
   make all && make check && make test
   ```

## What moves with it, that you did not edit

- **JSON-LD.** `build-pages.mjs` projects `data-kb-group` into every page's `kb:group`, so
  each moved page gets a second diff from `make all`. `make check` fails until you run it.
- **The per-folder `CLAUDE.md`.** `build-claude.mjs` rewrites the briefings for both the old
  and new folders — page lists, counts, and the sentence naming which groups live there.
- **The hub, graph and stack pages**, which read band and group from `graph.json`.

Commit all of it **together**: the pre-commit hook validates the **staged** tree, so a
commit of the pages without the regenerated artifacts is rejected.

## What does not move

Visitor state is safe. `elevation-map-progress-v1` and `kb-favourites-v1` key by **page id**,
and `kb-graph-settings` keys band filters by band id. Nothing keys on group or on path, so
no move loses anyone's progress or favourites.

A page's `data-kb-order` is a sort key **within its group**. After a move its number is
interleaved with its new neighbours' — legal, and worth renumbering only if the resulting
order reads wrong on the hub.

## Self-check

1. `make check` — clean, including `check-links.mjs`.
2. `node scripts/kb.mjs get <id>` resolves, and `node scripts/kb.mjs ls --band <band>` lists
   it under the new band.
3. `git diff --stat` shows the moved file, its attribute change, its JSON-LD, the two
   folder briefings, and the derived artifacts — **nothing else**.
4. Open the moved page from `file://` and click its breadcrumb and prev/next. Those are
   generated with the page's own depth and are the first thing a bad `../` shows up in.
