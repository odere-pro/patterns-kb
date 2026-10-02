# SiteMap

## Intent

The home page's cards: one per top-level area, read from the structure file, each carrying the old home page's anchor ids for its area (`src/lib/atlas.ts`).

## Purpose

Sends a new reader into the right area without a second copy of any area's name, summary or route.

## Gotchas

Each hub card carries a count of the pages beneath its area (`src/lib/counts.ts`), computed from the structure rows at build time.

Routes come from `tools/src/lib/site-routes.ts`, the same answer the hub generator uses, so a card cannot point where no hub is. A `link` area (no hub) has a card that opens its one page, and an unpublished `none` area has no card.

## Tradeoffs

A component where hand-written cards would be simpler, and would drift the first time an area moved.
