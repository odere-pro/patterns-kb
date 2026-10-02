# PrerequisiteCard

## Intent

The card at the top of a page's body: the pages to read first, then the pages beside it, from `docs/data/prerequisites.json`.

## Purpose

Reading order says what comes next, not what a reader must know first; the card shows that one record of the prerequisite graph on its own page (spec kb.learning.prerequisites, prerequisites-C8).

## Gotchas

Each link shows the one-line reason from `docs/data/relations.json`, read from this page's side of the edge (`src/lib/relation-notes.ts`). A row shows five links and folds the rest behind a `<details>` "See all N".

The outer `<div>` is a data block: class-free, carrying `data-requires` and `data-related` (ids joined by commas) and nothing else. It is knowledge, so no skip marker. It has no heading, or it would join the page's outline and manifest headings. Its render test holds its facts and each link's label, route and title to the file on the real tree (`prerequisite-card.render.test.ts`); the search payload carries no page text, its words included, and carries the edges as fields instead. The file is read again whenever its modification time moves, so `astro dev` shows an edit without a restart.

## Tradeoffs

Labels and routes come from the file, not the pages, so the graph has one home; the file's freshness gate keeps them equal to the pages.

Each neighbour's definition is only the link's `title`, a tooltip: keyboard, touch and most screen-reader users never see it. The spec asks the card for links and facts only (prerequisites-C8), and the definition is the linked page's own first line, one step away; showing it inline would double the card's height on every page.
