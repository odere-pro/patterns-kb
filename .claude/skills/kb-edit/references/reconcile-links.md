# Reconciling a page's references

> Detail for the "When an edit changes what the page uses" section of
> [SKILL.md](../SKILL.md). Read it when an edit changed what a page leans on and you need
> to know every place that fact is recorded.

## The four carriers

A page's connection to the rest of the KB is not one thing. It is four, written by
different hands, checked by different rules.

| carrier | looks like | written by | checked by |
|---|---|---|---|
| typed relation | `<div class="rel-item" data-kb-rel="demonstrates" data-kb-to="outbox">` on **both** pages | `kb.mjs link` / `unlink` | `make check` — one-way, dangling, contradictory |
| prose link | `<a href="../patterns/…/outbox.html">outbox</a>` inside a sentence | you, by hand | `check-links.mjs` — only that the file exists |
| mermaid click | `click N "../patterns/…/outbox.html"` inside `pre.mermaid` | you, by hand | `check-links.mjs` — same |
| membership | a theme's `data-kb-member` tour step · a pattern's `.fluency-item` · a hazard's `mitigation` rel-list | you, by hand | `make check` for the member id; the rest not at all |

`kb.mjs refs <id>` reports all four off the page itself, plus the **untyped** set — prose
links and mermaid clicks with no typed relation behind them.

Nothing checks the inverse — a typed relation whose prose has moved on. That is the
judgment the tools leave you, and the reason to run `refs` rather than trust a green
`make check`.

## Worked example

`site/designs/persona-identification.html` was rewritten: the flow moved off change-data
capture onto an inbox table, worker pools started claiming tasks with `SKIP LOCKED`, and the
sanctions step became a fan-out. Three kinds of drift in one edit.

**Dropped** — the design no longer derives events from the database log:

```
node scripts/kb.mjs unlink persona-identification change-data-capture
```

Two files, one line each. The `Demonstrated by` group on `change-data-capture` survives
because other designs are still in it; had it been the last item, the group's label would
have gone too rather than standing over an empty list.

**Added** — the design now does four things it did not before. Prose link first, in the
sentence that actually makes the claim, then the edge:

```
node scripts/kb.mjs link persona-identification demonstrates inbox \
  --note "every vendor callback lands as an inbox row unique on flow, step and the provider's own request id, in the same transaction as its effect" \
  --note-back "a KYC flow deduping vendor callbacks at the boundary, in the same transaction as the effect they trigger"
```

The two notes are not the same sentence. From the design, the note says *what this system
does*; from the pattern, it says *what this design shows about the pattern*. Same for
`competing-consumers`, `scatter-gather` and `kiss`.

**Kept, but changed** — the design still demonstrates `saga` and `claim-check`, only the
mechanism moved (S3 became "a storage key", saga steps became "flow steps"). No
link/unlink here: edit the `.rel-note` text on both pages by hand. An edge that is still
true with a stale note is the failure mode nothing catches.

Then `make all && make check`, and confirm with `refs` and `backlinks`.

## Failure signatures

| message | source | means |
|---|---|---|
| `one-way: a -verb-> b has no "…" back` | `build.mjs` | a `rel-item` was hand-edited on one page only — use `link`/`unlink` |
| `UNEXPECTED on <path>: verb -> id` | `audit-relations.mjs` | the page declares an edge `graph.json` does not have — run `make all` |
| `MISSING on <path>: verb -> id` | `audit-relations.mjs` | the reverse: stale `graph.json` again, or a hand-deleted item |
| `DANGLING LINKS … -> ../x.html` | `check-links.mjs` | a prose link or mermaid click outlived its target |
| `conflicting directional edges` | `build.mjs` | both pages claim the same direction (two `variant-of`, no `has-variant`) |
| `a already relates to b via "…"` | `kb.mjs link` | an edge exists — `unlink` it first if you are re-typing it |

## Things you do not have to do

- **JSON-LD.** The `kb:demonstrated-by` entries in `<head>` are inside
  `<!-- kb:generated -->` and reprojected by `make all` from the page's own attributes.
  Never hand-edit them; never treat them as a carrier to reconcile.
- **Stub neighbours.** `graph.json.stubNeighbors` is derived. Unlinking the last edge to a
  page-less id drops it automatically.
- **The hub, the map, the catalog, the search.** All derived. `make all` is the whole job.
- **Emptied groups.** `unlink` takes the `rel-group` with its last item, and leaves no
  blank-line seam behind it.

An emptied `relationships` section is structurally valid, so a page can legitimately end up
with the heading and nothing under it. That is a content signal, not a build error — a
pattern that relates to nothing is usually a page that is not finished.
