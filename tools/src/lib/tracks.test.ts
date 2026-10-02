/** The tracks file's reader: shaping, dropping the malformed, and the missing-file case. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { REPO_ROOT } from './sandbox.js';
import { isTier, readTracks, shapeTracks, tierOf, TIERS, TRACKS_FILE } from './tracks.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function rootWith(text: string | null): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-tracks-'));
  dirs.push(root);
  if (text !== null) {
    fs.mkdirSync(path.join(root, 'docs/data'), { recursive: true });
    fs.writeFileSync(path.join(root, TRACKS_FILE), text);
  }
  return root;
}

const good = { id: 'a', label: 'A', blurb: 'b', themes: ['x', 'y', 'z'] };

describe('tracks', () => {
  it('lists the tiers easiest first', () => {
    expect(TIERS).toEqual(['intro', 'core', 'advanced']);
    expect(isTier('core')).toBe(true);
    expect(isTier('level')).toBe(false);
    expect(isTier(3)).toBe(false);
  });

  it('keeps well-formed tracks and tiers', () => {
    const t = shapeTracks({ tracks: [good], tiers: { x: 'intro' } });
    expect(t).toEqual({ tracks: [good], tiers: { x: 'intro' } });
    expect(tierOf(t, 'x')).toBe('intro');
    expect(tierOf(t, 'nope')).toBeUndefined();
    expect(tierOf(null, 'x')).toBeUndefined();
  });

  it('drops a track missing a field or holding a non-text theme, and a tier outside the set', () => {
    const t = shapeTracks({
      tracks: [good, { id: 'b', label: 'B', themes: ['x'] }, { ...good, id: 'c', themes: ['x', 3] }, 'junk'],
      tiers: { x: 'hard', y: 'advanced' },
    });
    expect(t?.tracks.map((k) => k.id)).toEqual(['a']);
    expect(t?.tiers).toEqual({ y: 'advanced' });
  });

  it('answers null for a value that is not an object, and empty lists for an object with neither key', () => {
    expect(shapeTracks([])).toBeNull();
    expect(shapeTracks('x')).toBeNull();
    expect(shapeTracks({})).toEqual({ tracks: [], tiers: {} });
    expect(shapeTracks({ tracks: 'x', tiers: [] })).toEqual({ tracks: [], tiers: {} });
  });

  it('reads the file under a root, and answers null for a missing or unparsable one', () => {
    expect(readTracks(rootWith(JSON.stringify({ tracks: [good], tiers: {} })))?.tracks).toHaveLength(1);
    expect(readTracks(rootWith(null))).toBeNull();
    expect(readTracks(rootWith('{ not json'))).toBeNull();
  });

  it('reads the real file: 4 to 6 tracks and a tier for every listed theme', () => {
    const t = readTracks(REPO_ROOT);
    expect(t?.tracks.length).toBeGreaterThanOrEqual(4);
    expect(t?.tracks.length).toBeLessThanOrEqual(6);
    for (const k of t?.tracks ?? []) for (const s of k.themes) expect(t?.tiers[s]).toBeDefined();
  });
});
