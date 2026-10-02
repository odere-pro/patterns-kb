# Practiced

## Intent

A check per page, "I have worked through this", a count on each hub of how many of its rows are done, and "n of m practiced" for each tour.

## Purpose

A reader working through an area sees where they are without keeping a list of their own.

## Gotchas

The store key is `elevation-map-progress-v1`, the retired HTML site's, so a returning reader's marks survive; its values are `true` only, and unmarking deletes the key.

The count is of the toggles on the page, one per slug: a hub counts the pages it lists, never pages under a nested area it links.

A tour is a theme page's walk (`docs/data/learning-paths.json`, read through `src/lib/tours.ts`). Its page list is baked into the markup as `data-kb-practiced-tour="a b c"` and counted in the browser against the stored marks, so it counts pages that are not on the page and works from a folder; a theme page carries the count under its title (skip-marked chrome, from PageTitle), and the home page lists only the tours with a mark. The home list names a tour and does not link it: the link gate holds every page to one hub, and the home page counts as one.

## Tradeoffs

Per browser, like Favourites: private, and lost with the browser's storage.
