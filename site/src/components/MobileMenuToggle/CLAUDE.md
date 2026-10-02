# MobileMenuToggle

## Intent

The menu button that opens the sidebar as a drawer below 76rem.

## Purpose

Keeps the navigation reachable at every width, from a folder too: the behaviour rides in the bundle.

## Gotchas

State is `data-kb-menu-open` on the button's wrapper, not `aria-expanded` on a generic div. Starlight 0.42 shows the pane with `display`, so the drawer opens and closes with `display` (`src/styles/layout.css`).

## Tradeoffs

A replacement for upstream's module script, so upstream fixes to its drawer do not reach this one.
