// The tours a reader can walk, for the "n of m practiced" lines.
//
// A theme page is a tour (docs/data/learning-paths.json: one profile per
// theme, whose stages are the pages its tour visits). The profile's id is the
// theme page's slug, and a stage's slug is the last part of its route, which
// is also the key the practiced store uses (store.ts). The page list is baked
// into the markup at build time; the browser only counts it against the
// reader's own marks (practiced.client.ts).
import fs from 'node:fs';
import path from 'node:path';

import { placedPages, type Structure } from '../../../tools/src/lib/site-routes';
import { repoRoot, STRUCTURE_FILE } from './repo-root';

/** A profile as the learning-paths file holds it, narrowed to what a count needs. */
export interface Profile {
  id: string;
  label: string;
  stages: readonly string[];
}

/** One tour: its theme page and the slugs of the pages it walks, each once. */
export interface Tour {
  /** The theme page's slug, which is the profile's id. */
  id: string;
  /** The theme's name. */
  label: string;
  /** The theme page's route. */
  route: string;
  /** The slug of every page the tour visits, in tour order, each once. */
  slugs: string[];
}

/** The folder a theme page's route sits in. A few themes are filed under a case-study area, so the route says it, not the area. */
const THEME_FOLDER = '/themes/';

/** The practiced store's key for a route: its last segment without `.html`. */
export function slugOfRoute(route: string): string {
  return (route.split('/').pop() as string).replace(/\.html$/, '');
}

/**
 * Every tour whose theme page the structure file places, in the profiles'
 * order. A profile with no theme page has nowhere to show its count and is
 * left out.
 */
export function toursOf(profiles: readonly Profile[], structure: Structure): Tour[] {
  const themes = new Map(
    placedPages(structure)
      .filter((p) => p.route.startsWith(THEME_FOLDER))
      .map((p) => [slugOfRoute(p.route), p.route]),
  );
  const out: Tour[] = [];
  for (const p of profiles) {
    const route = themes.get(p.id);
    if (route === undefined) continue;
    out.push({
      id: p.id,
      label: p.label,
      route,
      slugs: [...new Set(p.stages.map(slugOfRoute))],
    });
  }
  return out;
}

/** The tour whose theme page is at `route`, or undefined for any other page. */
export function tourAt(tours: readonly Tour[], route: string | null): Tour | undefined {
  return route === null ? undefined : tours.find((t) => t.route === route);
}

/** The learning-paths file, repo-relative. */
export const LEARNING_PATHS = 'docs/data/learning-paths.json';

/**
 * The tours of the repository the build runs in. A tree without the learning
 * paths file has no tours, so a build of it shows no count anywhere.
 */
export function readTours(root: string = repoRoot()): Tour[] {
  const file = path.join(root, LEARNING_PATHS);
  if (!fs.existsSync(file)) return [];
  const { profiles } = JSON.parse(fs.readFileSync(file, 'utf8')) as { profiles: Profile[] };
  const structure = JSON.parse(
    fs.readFileSync(path.join(root, STRUCTURE_FILE), 'utf8'),
  ) as Structure;
  return toursOf(profiles, structure);
}
