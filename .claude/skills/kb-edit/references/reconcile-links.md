# Reconciling a page's references

> Detail for the "When an edit changes what the page uses" section of
> [SKILL.md](../SKILL.md). Read it when an edit changed what a page leans on and you need
> to know every place that fact is recorded.

## The four carriers

A page's connection to the rest of the KB is not one thing. It is four, written by
different hands, checked by different rules.

| carrier | looks like | written by | checked by |
|---|---|---|---|
| typed relation | one record `{ a, verb, b, note_a, note_b }` in `docs/data/relations.json`, rendered into **both** pages' relationships blocks | `kb.mjs link` / `unlink` | the `relations` gate — closed verb, both notes, both pages exist, one edge per pair |
| prose link | `[outbox](../patterns/…/outbox.md)` inside a sentence | you, by hand | the `repo-links` gate — that the file and the anchor exist |
| mermaid click | `click N "/patterns/…/outbox.html"` inside a mermaid fence — a route, not a file path | you, by hand | the `site-links` gate on `make site-build` — that the built link resolves |
| membership | a theme's tour step · a pattern's fluency note, both in `docs/data/learning-paths.json` · a hazard's `mitigation` prose | you, by hand | the `learning-paths` gate for the stage's route; the rest not at all |

`kb.mjs refs <id>` reports all four off the page and the data files as they stand, plus the
**untyped** set — prose links and mermaid clicks with no typed relation behind them.

Nothing checks the inverse — a typed relation whose prose has moved on. That is the
judgment the tools leave you, and the reason to run `refs` rather than trust a green
`make validate`.

## Worked example

`docs/designs/persona-identification.md` was rewritten: the flow moved off change-data
capture onto an inbox table, worker pools started claiming tasks with `SKIP LOCKED`, and the
sanctions step became a fan-out. Three kinds of drift in one edit.

**Dropped** — the design no longer reads events off the database log:

```
node scripts/kb.mjs unlink persona-identification change-data-capture
```

One record gone from `relations.json`. The `Demonstrated by` group on `change-data-capture`
survives because other designs are still in it; had it been the last item, the group's label
would have gone too rather than standing over an empty list.

**Added** — the design now does four things it did not before. Prose link first, in the
sentence that actually makes the claim, then the edge:

```
node scripts/kb.mjs link persona-identification demonstrates inbox \
  --note "every vendor callback lands as an inbox row unique on flow, step and the provider's own request id, in the same transaction as its effect" \
  --note-back "a KYC flow deduping vendor callbacks at the boundary, in the same transaction as the effect they trigger"
```

The two notes are not the same sentence. From the design, the note says **what this system
does**; from the pattern, it says **what this design shows about the pattern**. Same for
`competing-consumers`, `scatter-gather` and `kiss`.

**Kept, but changed** — the design still demonstrates `saga` and `claim-check`, only the
mechanism moved (S3 became "a storage key", saga steps became "flow steps"). No
link/unlink here: rewrite the edge's `note_a` and `note_b` in `relations.json`. An edge that
is still true with a stale note is the failure mode nothing catches.

Then `make gen && make validate`, and confirm with `refs` and `backlinks`.

## Failure signatures

| finding | source | means |
|---|---|---|
| a record's verb is not closed, or not its pair's first verb | the `relations` gate | `relations.json` was hand-edited — re-write the edge with `unlink` and `link` |
| a record is missing `note_a` or `note_b` | the `relations` gate | the one-way edge of the HTML era, made by hand — use `link` |
| a record names a page that is not a row of the structure file | the `relations` gate | the edge outlived its page, or names a slug that never existed |
| the same pair twice, or `x variant-of y` beside `y variant-of x` | the `relations` gate | a duplicate or a contradiction — `unlink` and link once |
| a missing file or anchor | the `repo-links` gate | a prose link outlived its target |
| a link on the built page that goes nowhere | the `site-links` gate | a mermaid click outlived its target |
| `a already relates to b via "…"` | `kb.mjs link` | an edge exists — `unlink` it first if you are re-typing it |

## Things you do not have to do

- **The relationships block.** It sits between `<!-- relationships:start -->` and
  `<!-- relationships:end -->`, and `make gen` rewrites it from `relations.json`. Never
  hand-edit it; never treat it as a carrier to reconcile.
- **The hub, the map, the search.** All built on the site build from the pages and the
  data files.
- **Emptied groups.** A group with no edge left under it is simply not rendered, so no
  label is left standing over an empty list.

An emptied `relationships` block is structurally valid, so a page can legitimately end up
with the heading and nothing under it. That is a content signal, not a build error — a
pattern that relates to nothing is usually a page that is not finished.
