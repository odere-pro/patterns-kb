/**
 * The HTML home page's anchors on the new home page: every id the HTML pages
 * linked into lands on a card, each id once.
 */
import { describe, expect, it } from 'vitest';

import structure from '../../../docs/data/site-structure.json';

import { ATLAS_ANCHORS, atlasAnchors } from './atlas';

describe('the atlas anchors', () => {
  it('names each id once, on a top-level area the structure file holds', () => {
    const all = Object.values(ATLAS_ANCHORS).flat();
    expect(new Set(all).size).toBe(all.length);
    const top = new Set(structure.areas.filter((a) => !('nestUnder' in a)).map((a) => a.id));
    for (const area of Object.keys(ATLAS_ANCHORS)) expect(top.has(area), area).toBe(true);
    expect(atlasAnchors('hazards')).toEqual(['hazards-h']);
    expect(atlasAnchors('map')).toEqual([]);
  });
});
