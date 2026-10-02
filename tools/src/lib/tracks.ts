/**
 * The Start-here tracks and page tiers, as `docs/data/tracks.json` holds them,
 * read the same way by the tracks gate and by the site's StartHere component.
 *
 * A track is a short ordered list of theme slugs (a theme slug is a
 * learning-paths profile id); `tiers` maps a page slug to `intro`, `core` or
 * `advanced`. The tier lives in this file and never in a page's frontmatter, so
 * the closed page key list stays closed. This module only reads and shapes: it
 * judges nothing about whether a slug is published, which is the gate's job.
 *
 * Usage: `readTracks(root)` returns the file's tracks and tiers, or null when
 * the file is absent or does not have the expected shape.
 */

import fs from 'node:fs';
import path from 'node:path';

export const TRACKS_FILE = 'docs/data/tracks.json';

/** The tier values, easiest first. */
export const TIERS = ['intro', 'core', 'advanced'] as const;
export type Tier = (typeof TIERS)[number];

/** One Start-here track: a heading, a line saying who it is for, and its themes in reading order. */
export interface Track {
  readonly id: string;
  readonly label: string;
  readonly blurb: string;
  readonly themes: readonly string[];
}

export interface Tracks {
  readonly tracks: readonly Track[];
  readonly tiers: Readonly<Record<string, Tier>>;
}

/** Every key the file may hold, in the order it writes them. */
export const FILE_KEYS = ['version', 'updated', 'note', 'tracks', 'tiers'] as const;
export const TRACK_KEYS = ['id', 'label', 'blurb', 'themes'] as const;

/** How many tracks the home page shows, and how many themes one track walks. */
export const TRACK_COUNT = { min: 4, max: 6 } as const;
export const THEME_COUNT = { min: 3, max: 6 } as const;

export const isTier = (v: unknown): v is Tier => typeof v === 'string' && (TIERS as readonly string[]).includes(v);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The tracks and tiers of a parsed file, keeping only well-formed entries: a
 * track missing a text field or a theme list is dropped, and a tier outside
 * `TIERS` is dropped. The gate reports each of those; the site just renders
 * what is sound.
 */
export function shapeTracks(value: unknown): Tracks | null {
  if (!isObj(value)) return null;
  const tracks: Track[] = [];
  for (const t of Array.isArray(value['tracks']) ? (value['tracks'] as unknown[]) : []) {
    if (!isObj(t)) continue;
    const { id, label, blurb, themes } = t;
    if (typeof id !== 'string' || typeof label !== 'string' || typeof blurb !== 'string' || !Array.isArray(themes)) continue;
    if (!themes.every((s) => typeof s === 'string')) continue;
    tracks.push({ id, label, blurb, themes: themes as string[] });
  }
  const tiers: Record<string, Tier> = {};
  const raw = value['tiers'];
  for (const [slug, tier] of Object.entries(isObj(raw) ? raw : {})) if (isTier(tier)) tiers[slug] = tier;
  return { tracks, tiers };
}

/** The tracks file under `root`, or null when it is absent, not JSON or not an object. */
export function readTracks(root: string): Tracks | null {
  const file = path.join(root, TRACKS_FILE);
  if (!fs.existsSync(file)) return null;
  try {
    return shapeTracks(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

/** A page's tier, or undefined for a page the file does not tier. */
export function tierOf(tracks: Tracks | null, slug: string): Tier | undefined {
  return tracks?.tiers[slug];
}
