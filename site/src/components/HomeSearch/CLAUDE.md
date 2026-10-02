# HomeSearch

## Intent

The home page's search prompt: one line, and one example symptom ("one slow dependency blocks my threads") that opens the search dialog already filled in.

## Purpose

A new reader does not know that the box takes a symptom as well as a name; the example shows it and answers it with one click.

## Gotchas

No script of its own. The button carries Search's `data-kb-search-open` plus `data-kb-search-prefill`, and `search.client.ts` opens the dialog with that text ranked. The noscript rule in `Head.astro` hides it, since a click does nothing without the bundle; `tools/src/lib/site-noise.ts` holds the same line.

The example is a prop with a default, used by `src/content/docs/index.mdx`. Its wrapper's `id="search"` is the address the not-found page's search link opens. A page of the corpus should rank first for it, which `home-search.render.test.ts` checks against the real payload text rules.

## Tradeoffs

The example is hand-picked, not drawn from the data: a random symptom would change between builds and make the home page unrepeatable.
