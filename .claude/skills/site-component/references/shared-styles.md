# Shared stylesheets

The paint every component shares, and the rules every stylesheet on the site keeps. The
[site-component](../SKILL.md) skill routes here for a change under `site/src/styles/`, or for
anything visual that is not one component's own.

The site's paint is three shared stylesheets plus one stylesheet per component. Starlight
supplies the colours and type scale as custom properties (`--sl-color-*`, `--sl-text-*`), so a
rule that reads them is right in light and dark with no second rule.

| File | Scope | Owner |
|---|---|---|
| `site/src/styles/tokens.css` | the shared decisions: spacing scale `--kb-space-1..4`, `--kb-pad` / `--kb-gap`, `--kb-radius`, `--kb-border`, the backdrop, the reader's marks, the diagram palette | this page |
| `site/src/styles/layout.css` | the frame every component sits in, and the Starlight rules overridden outright | this page |
| `site/src/styles/primitives.css` | shapes more than one component reuses (`.kb-card` and its parts) | this page |
| `site/src/components/<Name>/<name>.css` | one component's own classes | its component folder ([site-component](../SKILL.md)) |

Every stylesheet reaches the page through the `customCss` list in `site/astro.config.mjs`;
there is no per-page `<link>`. Each file's opening comment says why it exists — read it before
changing the file.

## Making a style change

1. **Find the right file.** A value two components share is a token; the frame is
   `layout.css`; a shape two components reuse is `primitives.css`; everything else is the
   component's own stylesheet ([site-component](../SKILL.md)). A class used by exactly one component
   does not belong in `primitives.css`.
2. **Reach for a token before a number.** Every gap or pad is one of the four spacing steps;
   every colour is a `--sl-color-*` or a `--kb-*` token built from one.
3. **Never write a colour literal outside `tokens.css`.** A hex, `rgb()` or `hsl()` value in
   any other stylesheet under `site/src` is a finding of the `site-tokens` gate. A colour
   nothing supplies goes into `tokens.css` once, under a name, and every rule points at the
   name.
4. **Keep facts out of classes.** A class is paint and starts `kb-`; a fact is a bare
   `data-*` on a class-free element. Never read a class for meaning, and never put a fact
   in one.
5. **Build and look** — see "Done means" below.

## Colour

Colours come from Starlight's semantic properties, which already pair light and dark. The few
decisions Starlight does not make live in `tokens.css`:

- the reader's marks — `--kb-favourite`, `--kb-practiced`;
- the diagram palette — `--kb-diagram-*`. Mermaid draws at build time with one fixed theme;
  `DiagramTools/diagram-tools.css` repaints it from these, so one build reads right in both
  themes. Retheme diagrams here, not in the diagram source.
- the modal backdrop — `--kb-backdrop`, one literal for every `::backdrop`.

## Running text

A rule that styles running prose sets neither `color` nor `font-size`: the body text is
Starlight's, set once. A hard-coded size (`0.9rem`) survives every later change to the scale;
where mono has to be held back inside prose, use a relative `em`.

Grey (`--sl-color-gray-*`) is for text that is **about** the content — a caption, a gloss,
breadcrumbs, chrome — never for the content itself. Grey on primary content reads as misfiled.

## Hiding things

Reuse an existing mechanism rather than adding one: a disclosure is a `<details>`; the
`hidden` attribute hides what the hub's filter bar leaves out (`Facets`). Text hidden that way
stays in the page for search and for a machine reader.

## Breakpoints

Starlight's own breakpoints govern the frame; `layout.css` states where it departs from them
(the left sidebar folds into its drawer below 97.5rem). Prefer an intrinsic rule — `flex-wrap`
with a basis, `minmax()` in a grid — to a new media query, and honour
`prefers-reduced-motion`.

## `<summary>` needs its own marker

Setting `display: flex` or `grid` on a `<summary>` removes the disclosure triangle in Chromium
and WebKit. A new `<details>` styled that way draws its own chevron, flipped by
`details[open]`, or it ships with no affordance.

## Done means

- `make gate G=check-site-tokens` passes: no colour literal outside `tokens.css`.
- `make site-build` exits 0.
- The changed pages, opened from `site/dist/` on disk, checked at 375 / 768 / 1280 widths and
  in both themes, set both by the OS and by the site's theme toggle.
- Checked in Chrome **and** Safari when a `<details>`, `:has()` or `::marker` rule changed.
- After a change to a remark or rehype plugin, `make site-clean` ran first: Astro's render
  cache otherwise rebuilds unchanged pages from the last build's HTML.
