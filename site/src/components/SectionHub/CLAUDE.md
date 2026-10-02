# SectionHub

## Intent

The body of a hub page: its entries, in groups, as a numbered list or as cards. The list puts the practiced count and the Facets bar first, and gives each row its facet keys, a favourite star and a practiced check.

## Purpose

A hub's whole job is to list what is inside; tools/src/site/gen-site-hubs.ts assembles the groups and this renders them.

## Gotchas

Group labels are `h2`s, so every hub has an outline. The list is an `<ol>` counting across groups, because the order is the structure file's reading order. A row holds only spans and an anchor, or Starlight's list spacing breaks the rows apart.

## Tradeoffs

One component, two variants: the list for hubs, cards for the home page.
