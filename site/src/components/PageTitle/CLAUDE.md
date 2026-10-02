# PageTitle

## Intent

Breadcrumbs, Starlight's title, then the intro, around a class-free `data-page-head` block; on a page, the reader's controls under it (favourite, practiced, and a "View source" link to the page's markdown).

## Purpose

Gives every page the same opening, and the title block a machine reader looks for around the H1.

## Gotchas

The not-found page keeps the `data-page-head` block around its title but has no trail and no purpose line.

The `data-page-head` wrapper must stay class-free: it is a data block, and the site data-layer gate fails a page whose H1 sits in no title block. The home page is the root: it gets Starlight's title alone, with no trail and no title block (blocks-C6), kept by route here.

The controls row sits after that block, never in it, and is skip-marked: it is chrome. It is fixed in the window's bottom corner so the star and the check stay in reach. A theme page, which is a tour, also gets "n of m practiced" for the pages its tour walks, skip-marked and outside the region like the row. A hub, the home page and a generated map page get none (`isPage` in `src/lib/routes.ts`); a hub's rows carry the star and the check.

## Tradeoffs

One override owns the whole opening, so no page hand-rolls it.
