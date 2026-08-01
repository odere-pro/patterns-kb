---
name: kb-styles
description: Change the patterns-kb site's CSS — the design tokens in tokens.css (palette, type scale, spacing, light/dark pairing), hub.css, pattern.css, the section colour mechanism, and the rules for adding a component class. Use when someone asks to "change the colours", "add a CSS class", "restyle the tiles", "fix the dark theme", "adjust spacing or type size", "make this responsive", "the layout breaks on mobile", or reports anything visual that is not on the graph page (that one is kb-graph).
---

# Styling the site

Four stylesheets, and the split is the rule:

| File | Scope | Owner |
|---|---|---|
| `tokens.css` | the design system — palette, fonts, type scale, spacing, both themes, the fixed control cluster | this skill |
| `hub.css` | `site/index.html` only | this skill |
| `pattern.css` | every content page's blocks | this skill |
| `graph.css` | the interactive graph canvas | **kb-graph** |

`tokens.css` loads **first**, then exactly one of `hub.css` / `pattern.css`. Nothing else.
There is no build step, no preprocessor and no CDN — plain CSS, vendored fonts, shipped
as-is. Keep it that way.

## Never hardcode a colour

Every colour is a token, and every token has a **light value and a dark value**. Adding a
raw hex is how the dark theme breaks.

```
--paper --paper-raised --ink --ink-soft --line --grid
--accent / --accent-soft     blue    (elevations and the conceptual sections)
--brass  / --brass-soft      gold    (lenses)
--hazard / --hazard-soft     rust    (hazards)
--ok     / --ok-soft         green
```

A new colour means **three** edits in `tokens.css`, not one: the `:root` light value, the
`@media (prefers-color-scheme: dark)` block, and the `:root[data-theme="dark"]` block. The
last is what the manual theme toggle sets, so a token defined in only the first two silently
ignores the toggle.

The single exception in the corpus is the favourite gold `#e0a800`, which is deliberately
the same in both themes.

Also fixed: `--radius`, the `--text-*` scale (`--text-body` and `--text-title` are fluid
`clamp()`), `--space-1..8`, the golden-ratio `--pad-*` triple, and `--content-width`.
Reach for a token before inventing a number.

## Section colour is one custom property, set once

`hub.css` gives `.sec` a `--band-color` / `--band-soft` pair and **everything below reads
it** — the numeral, the count pill, the checkbox border and its checked fill, the tile hover,
the card stripe. A section changes colour by getting `data-tone="brass"` or
`data-tone="hazard"` in `build-hub.mjs`; the default is blue.

So: **do not add per-section colour rules.** If a section needs a colour, it needs a tone.
Adding a fourth tone is one line in `hub.css` plus the field in the builder — **kb-hub**.

## Hiding things: there are four mechanisms and no fifth

| Mechanism | Owner | Used for |
|---|---|---|
| the `hidden` property | `search.js` | non-matching tiles and the containers they empty |
| `body.fav-only` + `:has()` | `favourites.js` | the ★ filter |
| `data-kb-level` / `data-kb-register` | `lens.js` | the reading-level lens |
| `<details open>` | `collapse.js` | hub sections and subsections |

`hub.css`'s `[hidden] { display: none !important; }` is **load-bearing twice**: the explicit
`display` on `.chip` would beat the UA default, and a collapsed `<details>` is
`display: block`, so nothing else would hide a whole section a query emptied. Do not remove
it, and do not add a fifth way to hide something — reuse one of the four.

The `:has()` rules for `fav-only` name their containers explicitly. A new wrapper element
around tiles must be added there, or the ★ filter leaves an empty box behind.

## `<summary>` needs its own chevron

Setting `display: flex` or `grid` on a `<summary>` removes the disclosure triangle in
Chromium and WebKit; `list-style: none` covers Firefox. The hub therefore suppresses all
three (`::-webkit-details-marker` too) and draws a rotated-border chevron in
`.sec-head::after` / `.sub > summary::after`, flipped by `details[open]`. Any new
`<details>` needs the same treatment or it ships with no affordance at all.

## Breakpoints

One per stylesheet, and they are deliberately not identical — each matches where *its* own
layout actually breaks:

```
hub.css      640px      pattern.css  620px      graph.css  900px
tokens.css   620px      (shared chrome: the fixed control cluster)
```

Also honour `@media (prefers-reduced-motion: reduce)`, already handled in `tokens.css`.

## Adding a component class

1. **Check it is not already there.** `.chip` carries the flex column, padding,
   `position: relative` and the border for every tile on the hub; a variant is a modifier
   (`.chip--card`), not a new element with duplicated rules.
2. Name it for what it *is*, not how it looks. `class` is presentation and carries no data —
   never read it for meaning, and never encode meaning in it. That separation is what lets
   the site be restyled without damaging knowledge.
3. Use tokens for every colour, size and space.
4. If the markup comes from a builder (`build-hub.mjs`, `build-pages.mjs`,
   `lib/template.mjs`), the class ships from there — never by editing generated HTML.

## Verifying a change

There is no test for CSS. Look at it:

```bash
make serve      # http://localhost:8000
```

- Three widths — 375 / 768 / 1280.
- **Both themes, both ways**: the OS setting *and* the in-page toggle
  (`:root[data-theme]`). A token missing from the third block passes the first check and
  fails the second.
- Chrome **and** Safari when a `<details>`, `:has()` or `::marker` rule changed.
- If you changed a hiding rule, re-run the interaction checklist in **kb-site-ui**.

Serving over HTTP caches aggressively — a stale stylesheet looks exactly like a broken one.
When a change seems not to apply, confirm before debugging it: re-request the file with a
cache-busting query, or use the second port in `.claude/launch.json` for a clean origin.
