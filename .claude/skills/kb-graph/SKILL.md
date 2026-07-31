---
name: kb-graph
description: Change or debug the interactive graph explorer (site/map/graph.html) — the live d3 canvas, the settings panel (filters, query language, groups, display, forces), the verb legend, or the graph's data projection. Use when someone asks to "change the graph page", "add a filter to the map", "the graph doesn't render", "tweak the physics", "add a group color", or reports anything broken on the interactive graph.
---

# The interactive graph explorer

One page, three layers, three owners. Edit the right layer or the build overwrites you.

| layer | file | owner | regenerate |
|---|---|---|---|
| shell — header, empty SVG, settings-panel skeleton, noscript fallback | `site/map/graph.html` | `scripts/build-graph-page.mjs` | `make graph-page` |
| data — `window.KB_GRAPH`: nodes, typed relations, counts | `site/assets/graphdata.js` | `scripts/build.mjs` | `make graph` |
| runtime — live force layout, panel behavior, queries, groups | `site/assets/graph-view.js` + `graph.css` | hand-authored | — |

Never edit `graph.html` or `graphdata.js` directly — change the emitting script and run
`make all`. The runtime and its CSS are yours to edit; the post-edit hook syntax-checks
the `.js`. Tags and aliases are NOT in graphdata — the runtime joins them at load from
`window.KB_CATALOG` (catalog.js, also loaded on the page).

## Where each concern lives

| to change | edit |
|---|---|
| what data a node carries into the graph | the `graphdata` projection in `scripts/build.mjs` |
| panel skeleton, control ids, slider ranges/defaults, page prose | `scripts/build-graph-page.mjs`, then `make graph-page` |
| physics, interactions, query grammar, groups, persistence | `site/assets/graph-view.js` |
| any color, dash, opacity, size styling | `site/assets/graph.css` (never literal colors in JS) |

## Invariants

- **Family canonicalization**: a directional verb pair collapses onto its sorted-first
  verb; symmetric verbs are their own family. `build-graph-page.mjs` (legend
  `data-family`), `graph-view.js` (`familyOf`, edge orientation, marker ids) and
  `graph.css` (`fam-*` colors) all implement the same rule. Change it in all three.
- **Presentation discipline**: `graph-view.js` toggles classes and sets NUMERIC CSS
  custom properties (`--gv-node-scale`, `--gv-edge-w`, `--gv-label-alpha`); every color
  lives in `graph.css` keyed off theme tokens, so themes recolor with zero JS. The
  group palette is 8 fixed classes (`grp-1..8`), never arbitrary hex.
- **Live physics**: the sim pre-settles synchronously (no visible explosion), then runs
  warm at `alphaTarget(0.01)`; drag pins `fx/fy` and reheats; the sim pauses on hidden
  tab / off-screen canvas (IntersectionObserver). Init transforms are applied WITHOUT
  d3 transitions — rAF never fires in a hidden page.
- **Query grammar** (filter search + group queries share `compileQuery`): AND of
  space-separated terms, `-` negates; `tag:x` (tag substring), `kind:x` / `band:x`
  (exact), `fav:true|false`; bare words form one phrase matched by substring on
  id/name/aliases OR via `window.KB_MATCHES` (search.js — the only search coupling).
  Empty query: match-all as a filter, match-nothing as a group.
- **Persistence**: one versioned localStorage key `kb-graph-settings`
  (`{v:1, filters, families, groups, display, forces}`). Corrupt or wrong version →
  defaults. The search query, selection and zoom are deliberately NOT persisted.
- **Deep link**: `#n=<node-id>` selects and centers a node; written via
  `history.replaceState` on select/deselect.
- **Orphans toggle** is dynamic: a node is an orphan if no visible edge (family on,
  other endpoint passing the filters) touches it. Diverges from Obsidian's static
  "no links at all" on purpose — `demonstrated-by` defaults off here.
- **Arrows**: directional edges are oriented along the canonical verb at dedupe time and
  drawn as 3-point paths with `marker-mid` (attribute, not CSS — external-stylesheet
  `url()` breaks in Chromium); each marker's inner path carries `fam-* arrowhead` so
  CSS colors it.
- **No fetch, no CDN**: data ships as scripts (`file://` must work); d3 is vendored at
  `site/assets/vendor/d3.min.js` with its LICENSE.

## Verification checklist (no automated browser tests exist)

`make serve`, open `http://localhost:8000/map/graph.html`, then:

1. Console clean; graph appears already settled, drifting gently; drag is springy and
   the node floats free on release (not pinned).
2. Filters: `cache`, `tag:caching`, `tag:caching -kind:design`, `fav:true`, kind
   toggles, band select, favourites, orphans (with `demonstrated-by` off, case studies
   vanish). Escape clears the search.
3. Links: each family toggles its edges; `demonstrated-by` off by default.
4. Groups: add `tag:caching` → recolor; overlapping second group → first wins; reorder
   flips the winner; remove restores band colors; empty query colors nothing.
5. Display: arrows per-family colored and hidden with their family; node size, link
   thickness, text-fade sliders respond live.
6. Forces: all four sliders retune the live layout; extremes don't explode; Fit
   recovers the view.
7. Select → `#n=<id>` in the URL; reload restores the selection centered at 1.6×;
   dblclick and `o` open the page; Tab/Enter keyboard path works.
8. Reload restores all settings; Restore defaults resets live; a corrupted
   `kb-graph-settings` value falls back to defaults.
9. Theme toggle recolors nodes, edges, arrowheads and group swatches.
10. Narrow viewport (≤900px): panel stacks below the canvas with sections closed;
    resizing refits the view. Noscript fallback renders.
