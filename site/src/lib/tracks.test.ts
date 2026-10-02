/** The Start-here tracks joined to their tours: the join, the drops, and the real file. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import structureFile from '../../../docs/data/site-structure.json';
import { TRACKS_FILE } from '../../../tools/src/lib/tracks';

import { STRUCTURE_FILE } from './repo-root';
import { startTracks, TIER_LABEL, tierOfSlug } from './tracks';
import { LEARNING_PATHS, readTours } from './tours';

/** A root holding the real structure file, the given learning paths and the given tracks file. */
function root(tracks: unknown, profiles: unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-start-'));
  fs.mkdirSync(path.join(dir, 'docs/data'), { recursive: true });
  fs.writeFileSync(path.join(dir, STRUCTURE_FILE), JSON.stringify(structureFile));
  fs.writeFileSync(path.join(dir, LEARNING_PATHS), JSON.stringify({ profiles }));
  if (tracks !== null) fs.writeFileSync(path.join(dir, TRACKS_FILE), JSON.stringify(tracks));
  return dir;
}

const profile = (id: string, stages: string[]) => ({ id, label: id.toUpperCase(), stages });

describe('startTracks', () => {
  const tracks = {
    tracks: [
      { id: 'one', label: 'One', blurb: 'b', themes: ['caching', 'resilience', 'ghost'] },
      { id: 'two', label: 'Two', blurb: 'b', themes: ['ghost'] },
    ],
    tiers: { caching: 'intro' },
  };
  const profiles = [
    profile('caching', ['/patterns/caching/cdn.html', '/patterns/caching/cache-aside.html']),
    profile('resilience', ['/patterns/caching/cdn.html', '/patterns/resilience/bulkhead.html']),
  ];

  it('joins each theme to its tour, with the tier the file gives and the union of the tours’ slugs', () => {
    const [one] = startTracks(root(tracks, profiles));
    expect(one?.steps).toEqual([
      { id: 'caching', label: 'CACHING', route: '/themes/caching.html', tier: 'intro' },
      { id: 'resilience', label: 'RESILIENCE', route: '/themes/resilience.html' },
    ]);
    expect(one?.slugs).toEqual(['cdn', 'cache-aside', 'bulkhead']);
  });

  it('drops a theme with no tour, and a track left with no theme', () => {
    expect(startTracks(root(tracks, profiles)).map((t) => t.id)).toEqual(['one']);
  });

  it('answers an empty list for a tree with no tracks file', () => {
    expect(startTracks(root(null, profiles))).toEqual([]);
  });

  it('labels every tier', () => {
    expect(TIER_LABEL).toEqual({ intro: 'Intro', core: 'Core', advanced: 'Advanced' });
    expect(tierOfSlug('caching', root(tracks, profiles))).toBe('intro');
    expect(tierOfSlug('nope', root(tracks, profiles))).toBeUndefined();
  });
});

describe('the real tracks', () => {
  it('give 4 to 6 tracks, every theme a tour and a tier', () => {
    const all = startTracks();
    expect(all.length).toBeGreaterThanOrEqual(4);
    expect(all.length).toBeLessThanOrEqual(6);
    const tours = new Set(readTours().map((t) => t.id));
    for (const t of all) {
      expect(t.slugs.length, t.id).toBeGreaterThan(0);
      for (const s of t.steps) {
        expect(tours.has(s.id), s.id).toBe(true);
        expect(s.tier, s.id).toBeDefined();
      }
    }
  });
});
