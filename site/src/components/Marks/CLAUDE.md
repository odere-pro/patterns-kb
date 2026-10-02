# Marks

## Intent

The "My marks" page body: every favourite and practiced page the reader has marked, across all hubs, with Export, Import and Reset.

## Purpose

Marks live in one browser's storage, so a reader needs a way to see them together, carry them to another browser and clear them.

## Gotchas

Favourites are two lists: "Yours" (the store's `true` entries) and "Suggested" (the editors' picks, `favourite: true` in the payload, until the reader unstars one).

The page is `src/pages/marks.astro`, a Starlight page outside the content folder: no source under `docs/`, no row in the structure file. The header links to it from `SocialIcons`.

The lists draw from the search payload (`search-index.js`, added as a classic script on load, so it works from file://); a stored slug no payload page has goes under "No longer in the site" with a Remove button. Page slugs are unique across areas, which `check-site-structure` holds.

The export is `{ version: 1, favourites, practiced }`; Import rejects anything else whole and merges a valid file over the stores (the file wins a shared slug).

## Tradeoffs

Per browser, like Favourites and Practiced: Export and Import are the only way across browsers, and Reset is a `confirm` dialog rather than an undo.
