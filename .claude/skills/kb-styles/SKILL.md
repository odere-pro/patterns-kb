---
name: kb-styles
description: Change the patterns-kb site's CSS — the design tokens in tokens.css (palette, type scale, spacing, light/dark pairing), hub.css, pattern.css, the section colour mechanism, and the rules for adding a component class. Use when someone asks to "change the colours", "add a CSS class", "restyle the tiles", "fix the dark theme", "adjust spacing or type size", "make this responsive", "the layout breaks on mobile", or reports anything visual that is not on the graph page (that one is kb-graph).
---

# Styling the site

Seven stylesheets — four leaves, plus three aggregators that assemble them for a page's
one `<link>`:

| File | Scope | Owner |
|---|---|---|
| `tokens.css` | the design system — palette, fonts, type scale, spacing, both themes, the fixed control cluster | this skill |
| `hub.css` | `site/index.html` only | this skill |
| `pattern.css` | every content page's blocks | this skill |
| `graph.css` | the interactive graph canvas | **kb-graph** |
| `palette.css` / `diagram-zoom.css` | the ⌘K overlay / the diagram viewer, shared across families | this skill |
| `kb-page.css` | `@import`s `tokens, palette, diagram-zoom, pattern` — the one link every content page, `vocab.html` and `map/stack.html` carry | this skill |
| `kb-hub.css` / `kb-graph.css` | the same idea for the hub (`tokens, palette, hub`) and the graph (`+ graph.css`) | this skill |

A page links **exactly one** aggregator; the load order is the `@import` list inside it,
stated once. There is no build step, no preprocessor and no CDN — plain CSS, vendored
fonts, shipped as-is. Keep it that way.

**Adding a stylesheet to the content family is one `@import` line in `kb-page.css`** (and
`kb-graph.css` if the graph needs it too), never a new `<link>` on a page —
`scripts/audit-assets.mjs` fails any page carrying more than one stylesheet link.

**Keep the aggregators flat.** `palette.css` and `diagram-zoom.css` used to `@import` from
inside `pattern.css`; both moved up into the aggregators directly, because a nested
`@import` cannot be discovered until the importing sheet has been fetched AND parsed — one
render-blocking round trip becomes two, on every page, before first paint. Any new
`@import` belongs in the aggregator, not nested one level deeper.

## Never hardcode a colour

Every colour is a token, and every token has a **light value and a dark value**. Adding a
raw hex is how the dark theme breaks.

```
--paper --paper-raised --ink --ink-soft --line --grid
--accent / --accent-soft     blue    (elevations and the conceptual sections)
--brass  / --brass-soft      gold    (lenses)
--hazard / --hazard-soft     rust    (hazards)
--ok     / --ok-soft         green
--stress                     emphasis text — see below
```

**`--stress` is the one token picked for contrast rather than for hue**: 9.22:1 on light
paper against 9.25:1 on dark. Every other coloured token is picked for its hue and lands
where it lands — `--accent` is 5.86:1 light and 7.27:1 dark, and a design page's
`--band-color` mix is 5.1:1 light against ink's 14.9:1 — so coloured *text* painted with
them reads weaker than the ink beside it in one theme and fine in the other. Use
`--stress` whenever colour has to carry emphasis on running text (heading ranks 3 and 4, a
question stem, an NFR label, the `.subline`); use `--band-color` for borders, fills and the
small-caps card labels, where the contrast never has to hold at prose size.

A new colour means **three** edits in `tokens.css`, not one: the `:root` light value, the
`@media (prefers-color-scheme: dark)` block, and the `:root[data-theme="dark"]` block. The
last is what the manual theme toggle sets, so a token defined in only the first two silently
ignores the toggle.

The single exception in the corpus is the favourite gold `#e0a800`, which is deliberately
the same in both themes.

Also fixed: `--radius`, the `--text-*` scale (`--text-title` is the one fluid `clamp()`),
`--space-1..8`, the golden-ratio `--pad-*` triple, `--content-width` and `--measure`.
Reach for a token before inventing a number.

## The five heading ranks

A page carries five heading roles, and each has exactly one rule in `pattern.css`. Reach
for the rank, never for a new font-size.

| rank | role | selector | size |
|---|---|---|---|
| H1 | the page | `.doc-title` | `--text-title` |
| H2 | the block | `.doc-h` | `--text-h2`, mono caps, band bar |
| H3 | a group of running content | `.doc-section > .prose > h3`, `.entity-group > h3`, `.endpoint-group > h3` | `--text-h3`, `--stress`, rule above |
| H4 | one named thing inside a group | `.doc-section > .prose > h4`, `.entity h4`, `.requirements h4`, `.tour-step h3` | `--text-h4`, mono 600 |
| H5 | the label ON A CARD | `.tradeoffs .col h3`, `.usage h3`, `.explain-item h3`, `.prod-group h3`, `.requirements h3` | `--text-xs`, mono caps, per-card colour |

**H3 and H4 sit above `--text-body`; H5 sits well below it.** That split is the rank
system's whole content: a heading that titles running content must outrank the paragraph
under it, while a card label sits on a box whose border already does the separating. Before
this existed, seven card-scoped rules rendered every heading at 0.75–0.9rem under
1.06–1.19rem body, so a deep-dive title read as smaller than its own prose.

**H5 and H3 are both `<h3>` in the markup, and both must stay `<h3>`.** `validate.mjs`
strips `h2, h3` before asking whether a block renders empty at a lens; demote a card label
to `<h4>` and its own text starts satisfying that gate, so a reader at basic could meet a
heading with nothing under it.

**`.subline`** is the smaller second line under a title — a routing tag, a store name, a
scope clause — in the title's own colour. It is a `<span>` **inside** the heading, never a
sibling element, because `build-pages.mjs` mints ids off child combinators
(`.prose > h3`, `.prose > p`, `.nonfunctional > ul > li`) and anything inserted between a
parent and those children freezes the ids silently. It sets `display: block` and resets
weight, case and tracking, so it needs no `<br>` on either side.

## The one body rank

Everything the reader came to read is **`--ink` at `--text-body`**, and both are set once,
on `body`, in `tokens.css`. A paragraph, a list item, a tradeoff claim, a production signal,
an explain rung, an entity description, a decision-table cell: one colour, one size, light
and dark alike.

**So a rule that styles running text sets neither `color` nor `font-size`.** If you are
typing either into a rule whose selector ends in `p`, `li`, `dd` or `td`, that is the defect,
not the fix. Ten rules did, and the page paid for it in eight different (colour, size) pairs
for what is one thing.

Two failure modes to recognise, because both looked reasonable when they were written:

- **`--text-md` is not the body size.** It is a flat `1rem`; it is the ⌘K palette's rung
  (`palette.css`) and nothing else. Six card components reached for it *as* the body token
  while `--text-body` was still a fluid clamp, so the card text came out 6% smaller than the
  prose beside it on a phone and 16% smaller on a desktop — a gap that widened as the screen
  got wider, which is why nobody caught it on a laptop.
- **A hard-coded `font-size`** (`0.95rem`, `0.9rem`) bypasses the scale, so it survives every
  later change to the scale. Where mono genuinely needs holding back inside prose, use a
  relative `em` — `.prose code` is `0.85em`, `.prod-group li strong` is `0.9em` — so it tracks
  the rank instead of pinning a number that has to be re-derived.

### When grey is right

`--ink-soft` is for text that is **about** the content, never for the content:

| grey earns it | it does not |
|---|---|
| `.doc-essence` — the page's one-line thesis | a paragraph in a block |
| `.diagram figcaption` — a caption | the sentence that says what an entity IS |
| the gloss beside a term (`.wild-item span`, `.rel-note`, `.fluency-item span`) | a tour step's argument |
| chrome — `.crumb`, `.badge.muted`, `.practice`, `.docnav` | a decision-table cell |
| footer furniture — `.mentions-lead`, `.mention-kind`, `.doc-note` | a usage smell line |
| code comments (`.hljs-comment`, kb-sketch's map) | a tradeoff claim |

The test is whether the sentence would still be there if the block were cut to the bone.
An entity's description would; the caption under its diagram would not.

Grey on primary content does not read as "secondary" — it reads as *misfiled*. Both columns
above were populated from the same corpus, and the right-hand one is what it looked like
before this rule existed: `.entity > p` grey made every entity description read as a caption
for a schema that was collapsed and therefore not on screen.

### Checking it

```
grep -n 'text-md' site/assets/pattern.css          # want nothing — that token is palette-only
grep -c 'font-size: [0-9]' site/assets/pattern.css # want this trending down, each survivor chrome or code
```

Neither is a build gate. `make check` does not read CSS at all, so the stylesheet is held by
this skill and by looking at the page in both themes.

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

## The `hljs-*` map is closed against what the corpus emits

`pattern.css` maps highlight.js scopes onto the palette tokens, and the set is derived rather
than copied from an upstream theme: adding a rule for a scope no grammar produces is
indistinguishable from missing the one that matters. `hljs-attribute` sat unstyled while every
API contract's headers rendered in flat ink, and `hljs-subst` inherited the string colour so
`${…}` vanished into the text around it. Before touching those rules, run the corpus tally in
the **kb-sketch** skill — it highlights all 356 sketches with the shipped bundle and counts
the scopes.

## Breakpoints

One per stylesheet, and they are deliberately not identical — each matches where *its* own
layout actually breaks:

```
hub.css      640px      pattern.css  620px      graph.css  900px
tokens.css   620px      (shared chrome: the fixed control cluster)
```

Also honour `@media (prefers-reduced-motion: reduce)`, already handled in `tokens.css`.

**Prefer an intrinsic rule to a fifth breakpoint.** Two layouts here adapt with no media
query at all, because the space they respond to is not the viewport:

- `.doc-wrap`'s `padding-right` reserves the fixed control column by subtracting the
  page's own gutter — `max(<normal padding>, calc(4.3rem - max(0px, (100vw -
  var(--content-width)) / 2)))`. The inner `max` floors the gutter at zero, without
  which a viewport narrower than `--content-width` would *add* padding on exactly the
  phones that can least afford it.
- `.rel-item` / `.fluency-item` / `.wild-item` put the name and its note side by side
  while the note has room and stack them when it does not, via `flex-wrap` plus
  `flex: 1 1 24ch` on the note. The name is `white-space: nowrap` and never yields, so
  without a basis the note shrank to one word wide and forty lines tall.

Both sit inside a reserved column or a grouped block, so a viewport breakpoint would be
measuring the wrong thing.

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
