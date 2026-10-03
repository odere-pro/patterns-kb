/**
 * The page tree as search payload pages: what a fixture tree yields, the
 * category chain, the tag labels and the synonym merge, and the real tree.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeKbFixture } from './fixtures.js';
import { makeSandbox, REPO_ROOT, type Sandbox } from './sandbox.js';
import { categoriesFor, readSynonymTable, readTagLabels, searchTree } from './search-tree.js';
import type { Structure } from './site-routes.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

const STRUCTURE: Structure = {
  areas: [
    { id: 'patterns', label: 'Patterns', hub: { description: '', intro: '', tags: [] }, pages: [] },
    { id: 'ml', label: 'Machine Learning', nestUnder: 'patterns', hub: { description: '', intro: '', tags: [] }, pages: [] },
    { id: 'designs', label: 'Case Studies', hub: { description: '', intro: '', tags: [] }, pages: [] },
  ],
};

describe('categoriesFor', () => {
  it('lists the area chain’s labels, outermost first, then the kind the source folder names', () => {
    expect(categoriesFor(STRUCTURE, 'ml', 'docs/patterns/ml/rag.md')).toEqual(['Patterns', 'Machine Learning', 'pattern']);
    expect(categoriesFor(STRUCTURE, 'designs', 'docs/themes/bot-detection.md')).toEqual(['Case Studies', 'theme']);
    expect(categoriesFor(STRUCTURE, 'designs', 'docs/designs/bitly.md')).toEqual(['Case Studies', 'case study']);
  });

  it('takes the kind from the top area when the source is not under docs/', () => {
    expect(categoriesFor(STRUCTURE, 'ml', 'generated')).toEqual(['Patterns', 'Machine Learning', 'pattern']);
  });
});

describe('the tag labels and the synonym table', () => {
  it('reads the tags that carry a label, and none from an absent file', () => {
    expect(readTagLabels(sb.dir)).toEqual({});
    sb.write('docs/data/tags.json', JSON.stringify({ terms: [{ id: 'caching', label: 'Caching' }, { id: 'edge' }, { label: 'No id' }, { id: 'empty', label: '' }] }));
    expect(readTagLabels(sb.dir)).toEqual({ caching: 'Caching' });
    sb.write('docs/data/tags.json', '{}');
    expect(readTagLabels(sb.dir)).toEqual({});
  });

  it('layers the curated map over the expansions, and reads an absent file as empty', () => {
    expect(readSynonymTable(sb.dir)).toEqual({});
    sb.write('docs/data/search-synonyms.json', JSON.stringify({ curated: { ai: ['agent'] }, expansions: { ai: ['model'], hang: ['wait'] } }));
    expect(readSynonymTable(sb.dir)).toEqual({ hang: ['wait'], ai: ['agent'] });
    sb.write('docs/data/search-synonyms.json', '{}');
    expect(readSynonymTable(sb.dir)).toEqual({});
  });
});

describe('searchTree', () => {
  it('states each page’s facts as the payload does, with its kb.mjs identity', () => {
    writeKbFixture(sb.dir);
    const tree = searchTree(sb.dir);
    const breaker = tree.pages.find((p) => p.title === 'Breaker');
    expect(breaker).toMatchObject({ kind: 'patterns', area: 'distributed-resilience', aliases: ['CB', 'fuse'], headings: [] });
    expect(breaker?.categories).toEqual(['patterns', 'distributed', 'distributed-resilience', 'pattern']);
    expect(tree.meta.get(breaker?.route as string)).toEqual({ id: 'breaker', kind: 'pattern', band: 'distributed' });
    expect(tree.synonyms).toEqual({ stall: ['hang'], fuse: ['breaker'], hang: ['wait'] });
    const loop = tree.pages.find((p) => p.title === 'Loop');
    expect(tree.meta.get(loop?.route as string)).toEqual({ id: 'loop', kind: 'theme', band: 'theme' });
    expect(loop?.categories.at(-1)).toBe('theme');
  });

  it('reads a frontmatter key the page leaves out as empty, not as a missing value', () => {
    writeKbFixture(sb.dir);
    const file = 'docs/patterns/messaging/queue.md';
    sb.write(file, sb.read(file).replace(/^description:.*\n/m, ''));
    expect(searchTree(sb.dir).pages.find((p) => p.title === 'Queue')?.description).toBe('');
  });

  it('skips a row whose file is gone', () => {
    writeKbFixture(sb.dir);
    sb.rm('docs/patterns/messaging/queue.md');
    expect(searchTree(sb.dir).pages.map((p) => p.title)).not.toContain('Queue');
  });

  it('reads the real tree: every page has categories, and the kb.mjs id of each route', () => {
    const tree = searchTree(REPO_ROOT);
    expect(tree.pages.length).toBeGreaterThan(300);
    expect(tree.pages.every((p) => p.categories.length >= 2)).toBe(true);
    expect(tree.meta.get('/patterns/distributed/resilience/circuit-breaker.html')).toEqual({ id: 'circuit-breaker', kind: 'pattern', band: 'distributed' });
    expect(Object.keys(tree.tagLabels)).toContain('machine-learning');
  });
});
