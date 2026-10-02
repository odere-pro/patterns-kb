# Breadcrumbs

## Intent

The trail above every page's title: Home, every hub above the page, then the page.

## Purpose

Tells a reader where they are and gives one click to each enclosing hub. Rendered by PageTitle.astro.

## Gotchas

The marks page is a tool outside the tree: its trail is Home › My marks, and the not-found page has none (`TOOL_ROUTES` in `src/lib/routes.ts`).

The hubs come from the page's `area` and the structure file through `src/lib/routes.ts`, never from folders: two areas share a folder and three tiers file their pages flat. The home page renders no trail.

## Tradeoffs

Chrome, so the nav carries `data-kb-skip`; a machine reader loses nothing, since the article block already carries the area.
