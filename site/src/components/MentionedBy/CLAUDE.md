# MentionedBy

## Intent

The aside under a page listing the pages whose prose links to it without a typed relation.

## Purpose

A prose link is a real connection its target page could not otherwise show; the aside shows it there, and no one keeps the list.

## Gotchas

Built from every published page's markdown on each build (`tools/src/lib/site-mentions.ts`), not from the page's own text: it sits in this component, outside the markdown Astro caches per page, so a new mention on one page reaches the other page's aside on the next build.

Links inside generated marked blocks and a theme's `siblings` list are declared already and never count.

## Tradeoffs

Chrome, skip-marked and outside the knowledge region: a machine reader reads the same links on the pages that make them, so the aside adds nothing to the data layer.
