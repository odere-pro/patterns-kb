# StartHere

## Intent

The home page's Start-here block (the home page's "next steps"): a handful of tracks, each an ordered list of themes from the gentlest to the hardest, with each theme's tier and an "n of m practiced" count per track.

## Purpose

A reader who does not yet know the vocabulary gets a path to begin on, instead of choosing among 51 themes.

## Gotchas

The tracks and the tiers are `docs/data/tracks.json`, joined to the tours by `src/lib/tracks.ts`; the tracks gate (`make gate G=check-tracks`) holds every listed theme to a published, non-draft page with a tour and a tier. A tier lives in that file, never in a page's frontmatter.

Every step is a real `<a href>` to its theme page, and the heading carries `id="next-steps"`. The link gate (C7) holds each page to exactly one hub and counts the home page as one, but `hubBody()` counts a hub's links only in the knowledge region before the element with that id. So the block must sit after `<SiteMap />` on the home page (order: HomeSearch, SiteMap, StartHere, Practiced), where its theme links are onward links and not a second hub. Move it above the site map, or drop the id, and every theme linked here is counted twice and the gate goes red. Nothing after the block is counted either, so nothing there may be a page's only hub link: the My marks sentence, whose link `/marks.html` the gate needs counted, sits between the site map and this block.

A track's count is the practiced hook `data-kb-practiced-tour` holding the union of its tours' page slugs, counted by `practiced.client.ts` against the stored marks; this component ships no script. The block sits inside the knowledge region, so it carries no `data-kb-skip` (the absence gate fails a skip marker there); its links are plain content.

## Tradeoffs

The link gate does not count this block, so a theme dropped from the site map is not rescued by being listed here. Tracks are hand-ordered in the data file, so a new theme is a decision, not an automatic entry.
