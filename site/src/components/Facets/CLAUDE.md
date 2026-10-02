# Facets

## Intent

The filter bar above a hub's list: a rail per tag facet, a chip per value the rows share, and Favourites only.

## Purpose

A hub of thirty rows answers "which of these are about consistency" without a search.

## Gotchas

The Starred chip (the reader's stars plus the editors' picks) sits on its own "Show:" row, which hides with the chip while no row is starred. "Clear filters" shows while any filter is on, and a filter that leaves no row says "No pages match these filters." in place of the count. The scroll position rides in the history entry's state, so Back returns the reader to where they were.

A chip exists only for a value two or more rows share and not every row holds (`src/lib/facets.ts`); a hub of fewer than four rows gets no bar, and neither does a larger one with no chip and no page row to star.

The bar sits inside the knowledge region, where a skip marker is a finding: it is plain decoration a reader reads through. The noscript rule in `Head.astro` hides it when no script runs.

Rows carry their keys in `data-kb-facet-keys`, a hook, never a fact: the row's classes would make a fact there a two-layer breach,.

## Tradeoffs

Rows are hidden, never removed or reordered: the numbers keep the reading order, and clearing the filter restores the list exactly.
