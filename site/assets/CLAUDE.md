# site/assets — presentation and derived data

Two kinds of file live here, and the split is the rule.

## Generated — never edit

| file | emitted by |
|---|---|
| `graph.json` · `catalog.json` · `catalog.js` · `graphdata.js` | `scripts/build.mjs` |

Regenerate with `make all`; `make check` fails when any is stale.

## Hand-authored

Everything else — `theme.js`, `lens.js`, `search.js`, `favourites.js`, `progress.js`,
`sketch.js`, `diagram.js`, `vocab.js`, `graph-core.js`, `graph-view.js`, the CSS, the
vendored libraries. Edits here cannot break KB validity, so the post-edit hook only syntax-checks
`.js` files (`node --check`). Vendored libraries (`vendor/`) are third-party — update by
replacing the file and its LICENSE, never by editing.

## The ⌘K palette (`palette.js`)

One keystroke to anywhere, on **every** page. It **scores nothing of its own**: `catalog.js` is
the data, `search.js` exposes `window.KB_MATCHES`, and `palette.js` orders and caps. That is a
third consumer of the hub scorer, so the ranking is the hub's by construction.

All three are `PAGE_SCRIPTS` entries (`SCRIPTS_BASE` in `lib/model.mjs`), so the 382 KB pages
get them from the generated body-end region and the order is stated once. `vocab.html`,
`map/stack.html`, `index.html` and `map/graph.html` are not built by `build-pages.mjs`, so
their own builders carry the tags.

**Two keys, one rule** — and it is the rule, not a per-page list:

| key | does |
|---|---|
| **⌘K** (Ctrl+K) | opens the palette, on every page without exception |
| **/** | focuses the page's OWN search box where it has one, else opens the palette |

⌘K meaning the same thing everywhere is the point. `/` stays local because filtering in place
beats a modal where a page can do it: the hub keeps a match inside its section so you see WHERE
a page sits, and the graph queries its own canvas. `search.js` and `graph-view.js` each bind
only `/`; **neither binds ⌘K any more** — two handlers on one chord is exactly how the palette
stopped opening on those two pages.

Contracts, each with a test in `scripts/test/palette.test.mjs`:

- **`.controls, #graph-search` gates the key, not the install.** The presence check is read once
  at bind time and decides only whether the palette declines `/`. It stays a check on their
  markup rather than a page-name list, because whoever renders those owns the local key.
- **Depth is derived, not injected.** Catalog paths are site-root-relative and the script runs
  at four depths with no build-time global, so `prefixFromHrefs()` reads the page's own
  `assets/tokens.css` href and strips the tail. Get this wrong and every result 404s on 382
  pages with no build error — `check-links.mjs` cannot see an href computed at runtime, which
  is why there is a test case per depth.
- **`window.KB_PALETTE` is the test seam** (`prefixFromHrefs`, `rank`, `limit`), exposed the
  same way `search.js` exposes `KB_MATCHES`. Logic that moves out of it stops being tested.

The overlay is the site's first `<dialog>`. Its rules live in **`palette.css`**, pulled in by an
`@import` at the top of both `pattern.css` and `hub.css` — the hub links neither `pattern.css`
nor anything else that carried them, and `<head>` links stay authored on the 382 content pages,
so importing is what gets one source to both page families without a 382-head sweep. It themes
purely off `tokens.css` variables and sits at `z-index: 100`, above the fixed control cluster's 50.

**`.prod` in `pattern.css` is the site's only outbound link class.** It styles the vendor
documentation links on `map/stack.html` and marks them with a trailing ↗, because everything
else here is relative and stays put. The URLs are not authored in any page — they come from
`scripts/lib/products.mjs`, the single registry `make check` gates. See the root CLAUDE.md for
the carve-out to "relative links only".

`graph-core.js` is the exception to "verified by hand": it is covered by
`scripts/test/graph-core.test.mjs` (`make test`), which loads the shipped file the way
the page does. Logic that moves out of it stops being tested.

`vocab.js` follows the same split for the same reason. It runs vocab.html's two modes by
RELOCATING the rendered `.vocab-item` nodes into an A-Z list and back, and restores the
grouped view from a snapshot taken at load — restoring by re-sorting instead would quietly
alphabetise the relation verbs out of their editorial order and the blocks out of skeleton
order, and the page would still render. So the ordering is DOM-free, exported as
`window.KB_VOCAB_SORT`, and covered by `scripts/test/vocab-sort.test.mjs`; the file guards
on `typeof document` so the test loads it with no DOM stub at all.

## Diagram zoom (`diagram-zoom.js` + `diagram-zoom.css`)

A diagram fails in one of two directions: a board carrying a whole system fits its column and
its labels shrink past reading, or a schema renders at natural size and you lose your place
scrolling inside it. Both are the same missing verb. Every `figure.diagram` now gets a
`− / + / % / ⤢` strip, drag-pan, and a full-screen `<dialog class="dzoom">`.

Four things are load-bearing:

- **It RELOCATES the `<pre class="mermaid">` into the viewer and back, never clones it** — the
  same move `vocab.js` makes above, for a sharper reason. A clone duplicates the SVG's id, and
  mermaid scopes both its injected `<style>` block and its `url(#marker-…)` arrowheads by that
  id. A `.dz-slot` holds the removed height so nothing behind the dialog reflows.
- **Everything it injects lives outside the `<pre>`.** `diagram.js`'s `rerender()` restores
  `el.textContent` from `el.dataset.src` on every theme and lens change; anything parked inside
  is destroyed by it.
- **`kb-diagram-render` is the seam**, fired by `diagram.js` at the end of every render pass
  including the empty one. But an event cannot be caught late, and `diagram.js` starts its first
  pass one script tag earlier — so `sync()` also runs on load and at `window.load`, and is
  idempotent precisely so all three are safe.
- **Inline fit is capped at 1 and bounds the WIDTH only.** That reproduces what mermaid's own
  `useMaxWidth` already did, so ~600 figures are pixel-identical and nothing inline is ever
  clipped until the reader zooms. The viewer fits both axes and magnifies, which is what makes
  an unreadable board readable. `er: { useMaxWidth: false }` was removed from `diagram.js` in
  the same change: the viewer carries ER detail now.

`window.KB_DIAGRAM_ZOOM` (`fit`, `zoomAt`, `clampPan`, `labelFor`) is the test seam, covered by
`scripts/test/diagram-zoom.test.mjs`. Note that `pattern.css`'s dark-mode erDiagram row fix is
scoped to `.diagram svg[…]` and stops matching once the `<pre>` is relocated, so
`diagram-zoom.css` restates it under `.dz-stage` — drop that and the schema goes white-on-white
in the viewer in dark mode.

## The interactive graph (`map/graph.html`) is three layers

| layer | file | owner |
|---|---|---|
| shell (header, empty SVG, settings-panel skeleton, noscript) | `map/graph.html` | generated by `scripts/build-graph-page.mjs` |
| data (`window.KB_GRAPH`: nodes, typed relations) | `graphdata.js` | generated by `scripts/build.mjs` |
| runtime (live force layout, panel, groups) | `graph-view.js` + `graph.css` | hand-authored |
| pure core (`window.KB_GRAPH_CORE`: edge dedupe + orientation, query language, filter/orphan pass, settings migration) | `graph-core.js` | hand-authored, unit-tested |

The core loads before the runtime and knows nothing about d3, the DOM or storage — that
is what makes it testable. New graph logic belongs there unless it touches the canvas.

Contracts the layers share — break one and the page silently degrades:

- **Family canonicalization** — a directional verb pair collapses onto its sorted-first
  verb. `build-graph-page.mjs` (legend buttons), `graph-core.js` (`familyOf`, edge
  orientation) and `graph.css` (`fam-*` colors) all use the same rule and must agree;
  the test asserts all three still do.
- **Two catalog couplings** — `search.js` exposes `window.KB_MATCHES` (the hub scorer,
  used by the graph's free-text queries), and `graph-view.js` joins `window.KB_CATALOG`
  by id at load for tags/aliases (they are deliberately not duplicated into graphdata).
- **Classes + numeric CSS custom properties only** — `graph-view.js` toggles classes and
  sets `--gv-*` numbers; every color lives in `graph.css` keyed off theme tokens, so the
  theme switch recolors the canvas (arrowheads and group palette included) with no JS.
- **Data ships as a script, not a fetch** — `fetch()` is blocked on `file://`, and the
  site must work from `file://`.
- **Settings persist in localStorage** (`kb-graph-settings`, versioned); `#n=<id>` in
  the URL hash deep-links a selected node. Search query, selection and zoom do not
  persist.
- **Visitor state is shared with the rest of the site** — `graph-view.js` reads and
  writes `kb-favourites-v1` (favourites.js: overrides only over the authored pick) and
  `elevation-map-progress-v1` (progress.js) itself, because the graph page loads neither
  script, and re-folds them on a `storage` event so an open map keeps up with another tab.
  Same stores, same rules, three writers.

Changing graph behavior? Use the **kb-graph** skill — it carries the full contract and
the manual verification checklist.
