---
name: kb-site-ui
description: Change or debug the KB site's client UI layer — the fixed control cluster (theme toggle, reading-level lens, floating Practiced button), the hub's search/facets/favourites filter, the collapsible sections, the practiced tracker and its counters, or any hand-authored script in site/assets. Use when someone asks to "change the lens buttons", "the theme toggle is broken", "practiced state isn't saving", "search doesn't hide tiles", "sections won't stay collapsed", "move the floating controls", or reports anything broken in the site's interactive behavior outside the graph page (that one is kb-graph). Hub markup is kb-hub; CSS is kb-styles.
---

# The site UI layer

Everything interactive on the KB site outside `map/graph.html` lives in a handful of
hand-authored files under `site/assets/`. They are presentation only — none of them can
break KB validity, so the post-edit hook merely syntax-checks `.js` (`node --check`).

**Content pages carry no UI markup** — every floating control is injected at runtime, so a
change there never touches a page. **The hub is the exception.** Its tiles ship their own
checkbox, star and `data-id`, and its sections ship as `<details open data-collapse>`, all
emitted by `scripts/build-hub.mjs`. So a change to what a hub control *is* lives in that
builder (**kb-hub**); a change to how it *behaves* lives here.

## The files and what owns what

| file | owns | localStorage key |
|---|---|---|
| `theme.js` | light/dark toggle (`.theme-toggle`), auto→light→dark; fires `kb-theme-change`; also the legacy-anchor shim (`#framing/#statement/#problem` → `#description`) | `kb-theme` |
| `lens.js` | reading-level lens (`.lens-group`, three `.lens-btn`); sets `html[data-lens]`; **expert = absence** of both the key and the attribute; fires `kb-lens-change` | `kb-lens` |
| `progress.js` | practiced tracking everywhere: hub `input.chip-box`, page `input.practice-box`, the floating `.practice-toggle`, hub counters, `#reset-btn` | `elevation-map-progress-v1` |
| `favourites.js` | favourites everywhere: hub `button.chip-fav`, the injected page `.favourite` + floating `.fav-toggle`, and the ★ filter button (toggles `body.fav-only`, self-hides when nothing is favourited) | `kb-favourites-v1` |
| `search.js` | hub search + facet rails over `window.KB_CATALOG`; hides non-matching `.chip[data-id]` and the containers they empty via the `hidden` property; holds sections open while a query is live; exposes `window.KB_MATCHES` for the graph | — |
| `collapse.js` | hub section/subsection disclosure: seeds from the rendered `open`, stores **overrides only**, exposes `window.KB_COLLAPSE.hold(reason, on)`, opens the `<details>` chain for `location.hash`, forces open for print | `kb-collapse-v1` |
| `diagram.js` | mermaid init + re-render on `kb-theme-change`, `kb-lens-change`, OS scheme change; fires `kb-diagram-render` at the end of every pass | — |
| `diagram-zoom.js` | per-figure zoom strip (− / + / % / ⤢), drag-pan, and the full-screen `<dialog class="dzoom">`; exposes `window.KB_DIAGRAM_ZOOM` | — |
| `sketch.js` | lazy highlight.js on `details.sketch` open (never throwing — an unknown language downgrades that one sketch, not the loop); injects the floating `.sketch-toggle` (**left** edge — see the cluster below); opens every sketch for print and restores after. Sketches are collapsed in the markup and their state does **not** persist — the language set, the vendored grammars and the `hljs-*` colours are the **kb-sketch** skill | — |
| `hub.css` / `tokens.css` / `pattern.css` | all styling; `tokens.css` holds the control cluster and the lens visibility rules | — |
| `kb.js` | the loader every page's `<head>` carries — see below | — |

`catalog.js` and `graphdata.js` are **generated** (scripts/build.mjs) — never edit. So is
`site/index.html` (scripts/build-hub.mjs), which `make check` compares byte for byte, and
so is every page's `<head>` asset pair (`scripts/build-pages.mjs`, from `PAGE_ASSETS` in
`lib/model.mjs`).

## Adding a client script

A page's entire asset wiring is one stylesheet link and one script tag:

```html
<link rel="stylesheet" href="../assets/kb-page.css">
<script src="../assets/kb.js" data-profile="pattern"></script>
```

`kb.js` is the manifest. Adding a control means adding its file to the right list inside
`assets/kb.js`, not touching a page:

- **`pre`** (per profile) — runs parser-blocking, WITHOUT `defer`, before first paint.
  Reserve this for `theme.js`/`lens.js`-class scripts: anything that must stamp `<html>`
  before the reader sees a flash of the wrong state. Adding a second pre-paint script
  slows every page's first paint — do this rarely.
- **`tail`** (`BASE`, shared by every content kind, plus `CODE` for `pattern`/`design`) —
  written WITH `defer`, so the browser fetches every tail script in parallel and executes
  them in written order after parsing, before `DOMContentLoaded` — exactly what a run of
  blocking body-end tags used to give, without blocking on 3.5MB of mermaid. Order still
  matters for the three dependent pairs stated in `kb.js`'s comments: mermaid before
  `diagram.js`, `diagram.js` before `diagram-zoom.js`, `catalog.js` → `search.js` →
  `palette.js`. Append after those unless the new script has its own dependency.

`scripts/audit-assets.mjs` (`make check`) fails if `kb.js` names a file that does not
exist, or if a page carries any `<script>` besides its one loader and the JSON-LD block —
that second rule is what makes the old drift (53 pages silently missing `favourites.js`)
impossible now.

## The fixed control cluster

Six floating controls, all `position: fixed`, all injected at runtime, five on the RIGHT
edge and one on the LEFT. **Sizes and offsets are tokens, not constants** — `--control-size` (2.8rem, the
smallest square that clears the 44px touch-target minimum), `--control-edge` (0.9rem
from the viewport edge), `--control-gap` and `--control-step` (one whole slot). They
were hand-typed as `0.9 / 3.4 / 5.9rem` and every one had to be re-derived by hand
whenever the box changed, so the stack now counts slots:

- `.theme-toggle` — slot 0 (theme.js, every page)
- `.lens-group` — top row, one step left of the toggles; height `--control-size`; drops
  to bottom-right under 620px
- `.practice-toggle` — slot 1, **content pages only** (progress.js injects it iff
  `input.practice-box[data-id]` exists — the hub has chips instead). It proxies the
  metarow checkbox: click → flip `pageBox.checked` → dispatch `change`, so the checkbox
  stays the single source of the change event and the store write. `aria-pressed`
  mirrors state; practiced paints `--ok` green.
- `.fav-toggle` — slot 2, **content pages only** (favourites.js injects it iff
  `main.doc-wrap[data-kb-id]` exists). Unlike the practiced toggle it proxies nothing —
  favourites.js also injects the metarow `.favourite` button, so both controls call the
  same `toggle(id)` and are repainted together. Gold `#e0a800`.
- `.section-nav` — vertically centred, below the stack: a flex column of at most two
  `.section-nav-btn` arrows (section-nav.js, content pages over two viewports tall).
- `.sketch-toggle` — the **left** edge, top slot, and the only thing there (sketch.js
  injects it iff the page carries 2+ `details.sketch`). `▾` expands every sketch, `▴`
  collapses them; the glyph names the action, `aria-expanded` carries the state and paints
  it `--accent`. **Why the left**: as a chip inside the entities block, right-aligned under
  the heading, it landed directly beneath `.lens-group` at the same edge and read as more
  chrome — reported missing twice while sitting in the DOM. A control that shares a corner
  with other chrome is invisible.

The five square controls share one box rule in `tokens.css`; only position, glyph and
pressed colour differ. A new control joins that selector list rather than copying the
box a sixth time.

**`.doc-wrap` reserves BOTH columns** with a `padding-right`/`padding-left` pair that
subtracts the page's own gutter, so no control ever renders over prose. The page keeps no guaranteed gutter —
`--content-width` is `clamp(66rem, 57rem + 14vw, 81rem)` — so below about 1230px the
wrap runs edge to edge and without the reservation the arrows sit on the last characters
of every line. Changing `--control-size` means checking that reservation still clears it.

Adding a sixth control: inject from its own script, add it to the shared box selector in
`tokens.css`, give it an `aria-pressed`/`aria-label`, and take the next slot with
`calc(var(--control-edge) + 3 * var(--control-step))`. The right column is filling up —
slot 3 starts to crowd short pages.

### section-nav.js

Injects the up/down pair. Three things about it are load-bearing:

- **The stop list is `section.doc-section` plus every `h3[id]` inside one.** The id is
  not a filter bolted on: a stop needs an anchor for `scrollIntoView` and
  `replaceState`, and the build stamps an id onto exactly the headings that are real
  sub-sections. Card labels ("Basic", "Pros", "Functional") carry none and are skipped
  for free — which is why a case study gains its deep dives as stops while a pattern or
  theme page gains nothing.
- **Each arrow exists only while it has somewhere to go** — no up arrow at the top, no
  down arrow at the bottom. Detaching rather than disabling matches how every other
  control expresses "does not apply here", so it adds no new hide mechanism. The
  down arrow needs an explicit `atBottom()` guard: the last block starts within the
  final screenful, so its top never reaches the reading line however far you scroll.
- **It re-syncs on more than scroll** — `kb-lens-change` (a deep dive tagged expert
  disappears at basic, changing the stop list) and a `ResizeObserver` on `document.body`
  (mermaid replaces each diagram long after the script runs, and a page only becomes
  two viewports tall once its diagrams land).

## Rules that keep this layer sane

- **State on `<html>` or `<body>`, styling in CSS** — scripts toggle classes/attributes
  (`data-theme`, `data-lens`, `fav-only`, `is-done`), never set inline styles.
- **Default = absence.** Expert lens and auto theme are stored by *removing* the key and
  attribute, so a fresh visitor needs no JS-applied state.
- **`[hidden] { display: none !important }`** in hub.css backs search.js's use of the
  `hidden` property, and is load-bearing twice: several hub elements set an explicit
  `display`, and a collapsed `<details>` is `display: block`, so nothing else would hide a
  whole section a query emptied. **There are exactly four hide mechanisms — don't add a
  fifth**: `hidden` for search, `body.fav-only` CSS for the ★ filter, `data-kb-level`/
  `data-kb-register` CSS for the lens, and `<details open>` for hub collapse.
- **Forcing sections open goes through `KB_COLLAPSE.hold(reason, on)`, never `.open`.**
  It is keyed by reason, so clearing a search cannot re-collapse a section the ★ filter
  still needs open, and it never writes the visitor's store. Both search.js and
  favourites.js use it; anything else that hides tiles must too, or matches end up inside
  collapsed sections where nobody can see them.
- **`toggle` fires asynchronously.** A plain "am I applying right now?" flag is false again
  by the time collapse.js's own events arrive, which is why `paint()` issues one credit per
  self-write and the handler spends it. Do not replace that with a boolean.
- **Everything must work from `file://`** — no fetch, data ships as scripts.
- **Pre-paint scripts** (`theme.js`, `lens.js`, run without `defer` from `kb.js`'s `pre`
  list) stay tiny and synchronous; **deferred scripts** (`progress.js`, `search.js`, … —
  `kb.js`'s `tail` list) may touch the DOM directly, since `defer` guarantees the document
  has finished parsing before any of them runs.

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
4. Hub search for a symptom — non-matching tiles actually disappear, empty subsections and
   whole sections collapse; ★ filter composes with an active search.
5. **Collapse.** Close two sections and reload — still closed. Search while they are closed
   — every section opens and the matching one stands alone; clear it — exactly those two
   close again and nothing else changed. Engage ★, then clear a search — sections stay
   open. Follow a jumpnav link into a closed section — it opens and scrolls. ⌘P — the print
   preview shows everything expanded.
6. Keyboard: every control reachable by Tab, actionable by Enter/Space, with a truthful
   `aria-label`/`aria-pressed`. A `<summary>` must announce its expanded state and show a
   focus ring. On a tile the star must toggle without following the tile's link.

A note on browser-verifying: serving over HTTP caches assets hard, and a stale `hub.css` or
`progress.js` looks exactly like a broken one. If a change appears not to apply, confirm it
is not the cache before debugging — re-request with a cache-busting query, or use the second
port in `.claude/launch.json` for a clean origin.
