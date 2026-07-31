---
name: kb-site-ui
description: Change or debug the KB site's client UI layer — the fixed control cluster (theme toggle, reading-level lens, floating Practiced button), the hub's search/facets/favourites filter, the practiced tracker and its counters, or any hand-authored file in site/assets. Use when someone asks to "change the lens buttons", "the theme toggle is broken", "practiced state isn't saving", "search doesn't hide chips", "move the floating controls", or reports anything broken in the site's interactive behavior outside the graph page (that one is kb-graph).
---

# The site UI layer

Everything interactive on the KB site outside `map/graph.html` lives in a handful of
hand-authored files under `site/assets/`. They are presentation only — none of them can
break KB validity, so the post-edit hook merely syntax-checks `.js` (`node --check`).
The pages carry **no UI markup**: every control is injected at runtime by its script, so
a UI change never touches a page.

## The files and what owns what

| file | owns | localStorage key |
|---|---|---|
| `theme.js` | light/dark toggle (`.theme-toggle`), auto→light→dark; fires `kb-theme-change`; also the legacy-anchor shim (`#framing/#statement/#problem` → `#description`) | `kb-theme` |
| `lens.js` | reading-level lens (`.lens-group`, three `.lens-btn`); sets `html[data-lens]`; **expert = absence** of both the key and the attribute; fires `kb-lens-change` | `kb-lens` |
| `progress.js` | practiced tracking everywhere: hub `input.chip-box`, page `input.practice-box`, the floating `.practice-toggle`, hub counters, `#reset-btn` | `elevation-map-progress-v1` |
| `favourites.js` | favourites everywhere: hub `button.chip-fav`, the injected page `.favourite` + floating `.fav-toggle`, and the ★ filter button (toggles `body.fav-only`, self-hides when nothing is favourited) | `kb-favourites-v1` |
| `search.js` | hub search + facet rails over `window.KB_CATALOG`; hides non-matches via the `hidden` property; exposes `window.KB_MATCHES` for the graph | — |
| `diagram.js` | mermaid init + re-render on `kb-theme-change`, `kb-lens-change`, OS scheme change | — |
| `sketch.js` | lazy highlight.js on `details.sketch` open | — |
| `hub.css` / `tokens.css` / `pattern.css` | all styling; `tokens.css` holds the control cluster and the lens visibility rules | — |

`catalog.js` and `graphdata.js` are **generated** (scripts/build.mjs) — never edit.

## The fixed control cluster

Four floating controls, all `position: fixed`, all injected at runtime:

- `.theme-toggle` — top `0.9rem`, right `0.9rem` (theme.js, every page)
- `.lens-group` — top `0.9rem`, right `3.4rem`; drops to bottom-right under 620px
- `.practice-toggle` — top `3.4rem`, right `0.9rem`, **content pages only**
  (progress.js injects it iff `input.practice-box[data-id]` exists — the hub has chips
  instead). It proxies the metarow checkbox: click → flip `pageBox.checked` → dispatch
  `change`, so the checkbox stays the single source of the change event and the store
  write. `aria-pressed` mirrors state; practiced paints `--ok` green.
- `.fav-toggle` — top `5.9rem`, right `0.9rem`, **content pages only** (favourites.js
  injects it iff `main.doc-wrap[data-kb-id]` exists). Unlike the practiced toggle it
  proxies nothing — favourites.js also injects the metarow `.favourite` button, so both
  controls call the same `toggle(id)` and are repainted together. Gold `#e0a800`.

Adding a fifth control: inject from its own script, style it in `tokens.css` next to
these, give it an `aria-pressed`/`aria-label`, and pick a slot that survives the 620px
breakpoint (the lens group moves to the bottom edge there). The right column is filling
up — a fifth would land at `8.4rem`, which starts to crowd short pages.

## Rules that keep this layer sane

- **State on `<html>` or `<body>`, styling in CSS** — scripts toggle classes/attributes
  (`data-theme`, `data-lens`, `fav-only`, `is-done`), never set inline styles.
- **Default = absence.** Expert lens and auto theme are stored by *removing* the key and
  attribute, so a fresh visitor needs no JS-applied state.
- **`[hidden] { display: none !important }`** in hub.css backs search.js's use of the
  `hidden` property — several hub elements set an explicit `display`, which would
  otherwise override the UA rule. Don't remove it; don't add a fourth hide mechanism
  (we have: `hidden` for search, `body.fav-only` CSS for the ★ filter, `data-kb-level`/
  `data-kb-register` CSS for the lens).
- **Everything must work from `file://`** — no fetch, data ships as scripts.
- Head scripts (`theme.js`, `lens.js`) run pre-paint — keep them tiny and synchronous;
  body-end scripts (`progress.js`, `search.js`, …) may touch the DOM directly.

## Verifying a change

One state model is covered by `node --test` — `scripts/test/favourites.test.mjs` runs
favourites.js against a DOM stub, because its override-vs-default store has cases you
cannot see by looking (opting out of an authored pick, opting back in, the filter
emptying under the visitor). Extend that stub when the script starts querying something
new. Everything else — layout, pointer behaviour, appearance — is browser-verified
(`make serve`, or open the file directly to prove `file://` still works):

1. Toggle theme and lens on a pattern page — mermaid re-renders, choice survives reload.
2. Click the floating ✓ on a page → reload the hub: chip checked, counters moved,
   group/band counts right; Reset clears everything including the floating ✓.
3. Click the floating ★ on a page → reload the hub: that chip's star is now solid and the
   ★ filter keeps it. Unstar an authored favourite → it stays unstarred across a reload.
4. Hub search for a symptom — non-matching chips actually disappear, empty groups
   collapse; ★ filter composes with an active search.
5. Keyboard: every injected control reachable by Tab, actionable by Enter/Space, with a
   truthful `aria-label`/`aria-pressed`. On a theme card the star must toggle without
   following the card's link.
