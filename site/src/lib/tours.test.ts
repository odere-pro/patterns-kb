/**
 * The tour list the "n of m practiced" lines are built from: a small structure
 * for the rules, and one pass over the real files for the promise that every
 * theme page is a tour whose stages are pages the practiced store can key.
 */
import { describe, expect, it } from 'vitest';

import pathsFile from '../../../docs/data/learning-paths.json';
import structureFile from '../../../docs/data/site-structure.json';
import type { Structure } from '../../../tools/src/lib/site-routes';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { STRUCTURE_FILE } from './repo-root';
import { LEARNING_PATHS, readTours, slugOfRoute, tourAt, toursOf, type Profile } from './tours';

const hub = { description: 'd', intro: 'i', tags: [] };
const page = (slug: string) => ({ slug, label: slug, source: `docs/x/${slug}.md` });
const tiny: Structure = {
  areas: [
    { id: 'patterns', label: 'Patterns', hub, pages: [] },
    {
      id: 'caching',
      label: 'Caching',
      nestUnder: 'patterns',
      hub,
      pages: [page('cdn'), page('cache-aside')],
    },
    { id: 'themes', label: 'Themes', hub, pages: [page('caching'), page('resilience')] },
    {
      id: 'designs',
      label: 'Case Studies',
      hub,
      pages: [{ ...page('bot-detection'), route: '/themes/bot-detection.html' }, page('uber')],
    },
  ],
};
const profile = (id: string, stages: string[]): Profile => ({
  id,
  label: id.toUpperCase(),
  stages,
});

describe('slugOfRoute', () => {
  it('is the last segment without its extension, the practiced store’s key', () => {
    expect(slugOfRoute('/patterns/caching/cdn.html')).toBe('cdn');
    expect(slugOfRoute('/themes/caching.html')).toBe('caching');
  });
});

describe('toursOf', () => {
  it('lists each theme page’s tour with its stage slugs once, in tour order', () => {
    const tours = toursOf(
      [
        profile('caching', [
          '/patterns/caching/cdn.html',
          '/patterns/caching/cache-aside.html',
          '/patterns/caching/cdn.html',
        ]),
      ],
      tiny,
    );
    expect(tours).toHaveLength(1);
    expect(tours[0]?.id).toBe('caching');
    expect(tours[0]?.label).toBe('CACHING');
    expect(tours[0]?.route).toBe('/themes/caching.html');
    expect(tours[0]?.slugs).toEqual(['cdn', 'cache-aside']);
  });

  it('finds a theme page by its route, even when its row is filed under another area', () => {
    const tours = toursOf([profile('bot-detection', ['/a/x.html'])], tiny);
    expect(tours[0]?.route).toBe('/themes/bot-detection.html');
  });

  it('leaves out a profile that no theme page carries, and a page that is no theme', () => {
    const tours = toursOf([profile('cdn', ['/a/b.html']), profile('nowhere', ['/a/c.html'])], tiny);
    expect(tours).toEqual([]);
  });

  it('keeps the profiles’ order', () => {
    const tours = toursOf(
      [profile('resilience', ['/a/x.html']), profile('caching', ['/a/y.html'])],
      tiny,
    );
    expect(tours.map((t) => t.id)).toEqual(['resilience', 'caching']);
  });
});

describe('tourAt', () => {
  const tours = toursOf([profile('caching', ['/a/x.html'])], tiny);

  it('finds the tour of a theme page and nothing for any other route', () => {
    expect(tourAt(tours, '/themes/caching.html')?.id).toBe('caching');
    expect(tourAt(tours, '/patterns/caching/cdn.html')).toBeUndefined();
    expect(tourAt(tours, null)).toBeUndefined();
  });
});

describe('the real tours', () => {
  const tours = toursOf(
    (pathsFile as { profiles: Profile[] }).profiles,
    structureFile as Structure,
  );

  it('give every profile a theme page and at least one stage', () => {
    expect(tours).toHaveLength((pathsFile as { profiles: Profile[] }).profiles.length);
    for (const t of tours) {
      expect(t.route).toMatch(/^\/.+\.html$/);
      expect(t.slugs.length, t.id).toBeGreaterThan(0);
    }
  });
});

describe('readTours', () => {
  it('reads the repository it runs in: every profile has a tour', () => {
    expect(readTours()).toHaveLength((pathsFile as { profiles: Profile[] }).profiles.length);
  });

  it('gives no tour to a tree without the learning paths file', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-tours-'));
    expect(fs.existsSync(path.join(empty, LEARNING_PATHS))).toBe(false);
    expect(readTours(empty)).toEqual([]);
  });

  it('reads the file at the root it is given', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-tours-'));
    fs.mkdirSync(path.join(root, 'docs/data'), { recursive: true });
    fs.writeFileSync(path.join(root, STRUCTURE_FILE), JSON.stringify(structureFile));
    fs.writeFileSync(
      path.join(root, LEARNING_PATHS),
      JSON.stringify({
        profiles: [{ id: 'caching', label: 'Caching', stages: ['/patterns/caching/cdn.html'] }],
      }),
    );
    const tours = readTours(root);
    expect(tours.map((t) => t.id)).toEqual(['caching']);
    expect(tours[0]?.slugs).toEqual(['cdn']);
  });
});
