// The HTML home page's section anchors, kept on the new home page.
//
// The HTML home page (the "atlas", site/index.html before the cutover) gave
// each band, lens and top-level section an id, and 382 pages linked into it
// by one of them — `index.html#band-dist-h` from every network pattern's
// foot, `#hazards-h`, `#lens-msg-h` and the rest — as may any bookmark a
// reader kept. The new home page lists the top-level areas as cards, so each
// old id lands on the card of the area that now holds what it named: every
// band and lens is a pattern group, so those land on the Patterns card.
//
// The ids are anchors only, empty and inline inside the card's title, so a
// link to one scrolls to the card and nothing else about the card changes.

/** The old home page's anchor ids, by the top-level area whose card now answers them. */
export const ATLAS_ANCHORS: Readonly<Record<string, readonly string[]>> = {
  patterns: [
    'band-gof-h',
    'band-ent-h',
    'band-arch-h',
    'band-dist-h',
    'lenses-h',
    'lens-conc-h',
    'lens-msg-h',
    'lens-cache-h',
    'lens-ddd-h',
    'lens-fp-h',
    'lens-test-h',
    'lens-sec-h',
    'lens-fe-h',
    'lens-ml-h',
  ],
  hazards: ['hazards-h'],
  designs: ['design-cases-h'],
  themes: ['themes-h'],
  principles: ['principles-h', 'principles-craft-h', 'principles-systems-h'],
  capabilities: ['capabilities-h'],
  comparisons: ['comparisons-h'],
};

/** The old anchors an area's home card carries; none for an area the old page had no section for. */
export function atlasAnchors(area: string): string[] {
  return [...(ATLAS_ANCHORS[area] ?? [])];
}
