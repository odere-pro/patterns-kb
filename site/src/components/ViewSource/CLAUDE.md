# ViewSource

## Intent

A "View source" link in a page's controls row that opens the markdown file the page is built from.

## Purpose

A reader who wants the raw page, to copy it, diff it or see how it is written, gets it in one click without finding the repository.

## Gotchas

The link targets `<route minus .html>.md`, a copy the post-build pass ships beside the page (`copySources` in `tools/src/site/site-portable.ts`); `check-site-portable` holds every copy byte-equal to its file under `docs/`. Built output stays untracked, so the copy exists only after a build.

The href is root-absolute in the markup and becomes depth-relative in the post-build pass like every other link; an extension already on it is left alone. Only page-tree pages render the row, which is exactly the pages that have a source (`isPage` in `src/lib/routes.ts`).

It is a plain anchor, so it works with scripts off and needs no `data-kb-*` hook.

## Tradeoffs

Shipping the markdown adds roughly the size of `docs/` to the built site, in return for a link that works offline from a folder.
