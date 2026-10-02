# Grouping a design's "Patterns it demonstrates" block

**The block is generated; only the grouping is yours.** Every row is one edge record in
[relations.json](../../../../docs/data/relations.json), written by `kb.mjs link`, and the
build splices the block from it (`gen-relations`, `make gen`) — the `<!-- relationships:start -->`
marked block on the page is never hand-edited. What a human adds on top is the arrangement:
past roughly ten rows, a flat list stops being a list and becomes a wall, and the reader loses
the one thing the block could tell them — where in this design each pattern shows up.

## Write every row with `kb.mjs link` — never by hand

```
node scripts/kb.mjs link <design> demonstrates <pattern> --note "…" --note-back "…" --group "Vendor resilience"
node scripts/kb.mjs unlink <design> <pattern>
```

`link` writes the one record both pages render from — the design's row and the pattern's
"Demonstrated by" backlink. `--group` is the heading the design's side sits under, when it is
not the verb's own label ("Demonstrates"); it is stored as that side's `group_*`. Re-typing a
note or moving a row to another group is `unlink` then `link … --group "…"` — there is no
edit-in-place. Group order on a page follows the order of its records, unless the file's
`group_order` pins it.

## Check the threshold

**Group past roughly ten rows.** Below that, the one flat "Demonstrates" group is correct and
most design pages stay that way — a corpus page carries about eight rows, where headings would
add structure to something that has none. Grouping is a response to volume, not a default.

## Group the rows by concern

- **The note says why the pattern is here, in one clause.** It is the only prose the block
  carries; the mechanism belongs in `deepdives`, the choice in
  [kb-design-sizing](../../kb-design-sizing/SKILL.md).
- **Group by concern in this design, not by KB taxonomy.** "Vendor resilience" tells the
  reader where to look; "Distributed · resilience" only repeats the path the link already
  goes to.
- **3-6 groups.** Fewer and you have not broken up the wall; more and each group is a row or
  two, which is the flat list again with extra headings.
- **Every row in exactly one group.** A pattern that serves two concerns goes in the one its
  note argues for.
- **Group names must be findable on the page** — each name matches a stage in `architecture`
  or a dive in `deepdives`. A group name that names nothing on the page means the grouping is
  invented or the design is missing the argument.
- **Order the groups to follow the architecture**, so the block reads in the same direction as
  the page above it.
- Short noun phrases, no trailing punctuation.

## Keep it grouped after every `link`

On a grouped page, a `link` without `--group` lands in a fresh flat "Demonstrates" group. Pass
`--group` with the right concern on every new `link` to a grouped design; if one slipped
through, `unlink` it and `link` it again with `--group`.

## Worked example

`persona-identification` — 20 rows under one "Demonstrates" label became the same 20 rows,
notes unchanged, under five concerns that follow the architecture: Orchestration & state,
Vendor resilience, Queue & delivery, Payloads & PII, Tenancy & restraint. Only the `group_*`
values changed.

## Done means

- Every row was written by `kb.mjs link`, and a regroup was `unlink` then `link --group`, with
  the note text unchanged.
- The page clears the threshold before it is grouped — under ~10 rows, a flat group is right.
- Group names name concerns in this design, findable in `architecture` or `deepdives` — 3-6 of
  them, in the page's own order, every row in exactly one.
- No stray flat "Demonstrates" group is left on a grouped page.
- `make gen && make validate` pass (the `relations` gate among them), and
  `node scripts/kb.mjs get <id> --block relationships` reads it back clean.
