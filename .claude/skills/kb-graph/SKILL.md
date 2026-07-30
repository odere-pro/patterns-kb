---
name: kb-graph
description: Change or debug the interactive relationship graph and architecture builder (site/map/graph.html) — the d3 canvas, Explore/Build modes, the verb legend, the builder presets, or the graph's data projection. Use when someone asks to "change the graph page", "add a builder preset", "the graph doesn't render", "tweak the force layout", "add a filter to the map", or reports anything broken on the interactive graph.
---

# The interactive graph & builder

One page, three layers, three owners. Edit the right layer or the build overwrites you.

| layer | file | owner | regenerate |
|---|---|---|---|
| shell — header, mode tabs, verb legend, controls, empty SVG, noscript fallback | `site/map/graph.html` | `scripts/build-graph-page.mjs` | `make graph-page` |
| data — `window.KB_GRAPH`: nodes, typed relations, presets, counts | `site/assets/graphdata.js` | `scripts/build.mjs` | `make graph` |
| runtime — force layout, Explore/Build, panel, hash state | `site/assets/graph-view.js` + `graph.css` | hand-authored | — |

Never edit `graph.html` or `graphdata.js` directly — change the emitting script and run
`make all`. The runtime and its CSS are yours to edit; the post-edit hook syntax-checks
the `.js`.

## Where each concern lives

| to change | edit |
|---|---|
| what data a node carries into the graph | the `graphdata` projection in `scripts/build.mjs` |
| legend, controls, tabs, page prose, noscript | `scripts/build-graph-page.mjs`, then `make graph-page` |
| builder presets (seed shapes + candidates) | `BUILDER_PRESETS` in `scripts/lib/model.mjs` |
| layout physics, interactions, derivation rules | `site/assets/graph-view.js` |
| any color, size, dash, dim/lit styling | `site/assets/graph.css` (never inline in JS) |

## Invariants

- **Family canonicalization**: a directional verb pair collapses onto its sorted-first
  verb; symmetric verbs are their own family. `build-graph-page.mjs` (legend `data-family`
  and `fam-*` class), `graph-view.js` (`familyOf`) and `graph.css` (`fam-*` colors) all
  implement the same rule. Change it in all three or edges lose their legend/colors.
- **Classes only in JS**: `graph-view.js` toggles classes (`selected`, `lit`, `dim`,
  `applied`, `suggested`, `excluded`, `fam-*`, `kind-*`, `band-*`); colors live in
  `graph.css` keyed off theme tokens, so theme switching needs no JS.
- **Build mode derives wholesale**: everything renders from `{seed, applied}` on every
  change, never incrementally — that is what makes un-apply trivially correct. Keep it
  that way.
- **State is the URL hash** (`#b=1&mode=build&seed=preset:http-api&on=a,b,c`): shareable
  and reload-restorable.
- **`window.KB_MATCHES`** (from `search.js`) powers symptom search — the only coupling.
- **Preset rot fails the build**: a `BUILDER_PRESETS` candidate id with no page fails
  `make check` (build.mjs) and `make test` (builders.test.mjs).
- **No fetch, no CDN**: data ships as scripts (`file://` must work); d3 is vendored at
  `site/assets/vendor/d3.min.js` with its LICENSE.

## Adding or changing a preset

1. Edit `BUILDER_PRESETS` in `scripts/lib/model.mjs` — id, label, and the load-bearing
   dozen candidate ids (curation is editorial; see TODO.md item 3).
2. `make all && make check && make test` — a wrong id fails here, not silently.

## Verification checklist (no automated browser tests exist)

`make serve`, open `http://localhost:8000/map/graph.html`, then:

1. Console has no errors; the canvas settles once and does not jitter.
2. Explore: click a node → `selected` on it, `lit` on neighbours, `dim` elsewhere;
   kind/band/favourite filters and each legend toggle add/remove edges.
3. Build: seed a preset → suggestions highlight; apply a pattern with an unmet
   `requires` → warning appears, applying the prerequisite clears it; apply a pattern
   with an `alternative-to` neighbour → that node renders excluded (dimmed, not hidden).
4. Hash: after a few applies, reload — the full stack restores.
5. Theme: toggle light/dark — canvas recolors with no JS errors.
6. Symptom search (both modes) returns sensible patterns for
   "one slow dependency blocks my threads".
