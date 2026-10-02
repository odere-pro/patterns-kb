# Favourites

## Intent

A star per page: on the page under its title, and on its row in every hub that lists it.

## Purpose

A reader keeps a short list of pages near the top. The authored picks (`favourite: true` in a page's frontmatter) are the default; the reader's own toggles override them.

## Gotchas

The store under `kb-favourites-v1` holds overrides only, never the whole list: flipping a page back to its authored answer deletes its key (`src/lib/store.ts`). The key is the retired HTML site's, so a returning reader's marks survive.

The starting `aria-pressed` is data: the module reads it as the authored answer before it paints anything. Render it from the frontmatter, never hard-code it.

## Tradeoffs

Per browser, not per reader: nothing leaves the machine, and nothing follows the reader to another one.
