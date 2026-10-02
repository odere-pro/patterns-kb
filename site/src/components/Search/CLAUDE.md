# Search

## Intent

The search box: a header button (Ctrl K, ⌘ K or `/`) and a dialog listing every page that matches. A glossary definition the query names sits above the pages; up to three the query only begins to type ("gen" → "generalizes") sit after them.

## Purpose

A reader finds a page by its name or by what went wrong, from a folder with no server, ranked by one rule that `kb.mjs find` shares.

## Gotchas

Each row carries a kind badge, the last word of the page's categories when it is one of the seven kind words (`kindLabel`); the not-found page is never a result. The shortcut cap is decided once from the user agent (`shortcutLabel`). A button with `data-kb-search-prefill` opens the box already filled in (HomeSearch).

Ranking lives in `tools/src/lib/search-score.ts`, never here: change it there, where the relevance fixture measures it and the search oracle (`docs/data/search-oracle.json`) holds the named queries. A missed query is added to the oracle first.

The payload carries the tag labels and the synonym table the rule reads; this module hands them to it from `window.kb` and owns neither.

The link is the option: each row is an `li` with `role="presentation"` and the `a` inside it carries `role="option"`, `aria-selected` and the id `aria-activedescendant` points at, so no control sits inside another. The active-row class stays on the `li`.

Rows and snippets are built from text nodes, never from a string of HTML; the payload is data.

The note is the live region: never give it `hidden`, which takes it out of the accessibility tree.

## Tradeoffs

Search is a way to reach a page, not a full-text index: the payload carries each page's declared facts (title, kind, description, tags, categories, aliases, `solves`, H2 and H3 headings, row anchors, prerequisite edges) and none of its prose, and a row quotes the `solves` phrase the query landed in. A query only the prose answers finds nothing; `kb.mjs find` reads the prose.

The payload loads the first time the box opens, never with the page, so a reader who never searches never downloads it; the first open shows a short loading note.
