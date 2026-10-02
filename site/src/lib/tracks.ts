// The Start-here tracks, ready to render: each track's themes joined to their
// tours, so the home page can name a step and count how much of it is practiced.
//
// docs/data/tracks.json holds the tracks and the tiers (tools/src/lib/tracks.ts
// reads it, and the tracks gate holds it to the published themes). A theme
// becomes a step only when it has a tour (tours.ts); the practiced hook of a
// track is the union of its tours' page slugs, the keys the practiced store
// uses, so a track counts the pages its themes walk, each once.
import { readTracks, TIERS, type Tier } from '../../../tools/src/lib/tracks';
import { repoRoot } from './repo-root';
import { readTours, type Tour } from './tours';

/** The words a reader sees for each tier. */
export const TIER_LABEL: Readonly<Record<Tier, string>> = {
  intro: 'Intro',
  core: 'Core',
  advanced: 'Advanced',
};

/** One step of a track: a theme, by name, with its tier when the file gives one. */
export interface StartStep {
  /** The theme's slug. */
  id: string;
  /** The theme's name, as its page titles it. */
  label: string;
  /** The theme page's route, the step's link. */
  route: string;
  /** The tier the tracks file gives the theme, when it does. */
  tier?: Tier;
}

export interface StartTrack {
  id: string;
  label: string;
  blurb: string;
  steps: StartStep[];
  /** The slug of every page the track's tours walk, each once, for the practiced count. */
  slugs: string[];
}

/** The tier of a page slug, or undefined when the tracks file does not tier it. */
export function tierOfSlug(slug: string, root: string = repoRoot()): Tier | undefined {
  return readTracks(root)?.tiers[slug];
}

/**
 * Every track whose themes have tours, in the file's order. A theme with no
 * tour is left out of its track, and a track left with no theme is dropped,
 * so the home page never renders an empty list.
 */
export function startTracks(
  root: string = repoRoot(),
  tours: readonly Tour[] = readTours(root),
): StartTrack[] {
  const file = readTracks(root);
  if (file === null) return [];
  const byId = new Map(tours.map((t) => [t.id, t]));
  const out: StartTrack[] = [];
  for (const t of file.tracks) {
    const steps: StartStep[] = [];
    const slugs = new Set<string>();
    for (const id of t.themes) {
      const tour = byId.get(id);
      if (tour === undefined) continue;
      const tier = file.tiers[id];
      steps.push({
        id,
        label: tour.label,
        route: tour.route,
        ...(tier === undefined ? {} : { tier }),
      });
      for (const s of tour.slugs) slugs.add(s);
    }
    if (steps.length > 0)
      out.push({ id: t.id, label: t.label, blurb: t.blurb, steps, slugs: [...slugs] });
  }
  return out;
}

export { TIERS };
