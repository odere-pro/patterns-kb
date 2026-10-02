/**
 * The corpus: pages placed by the structure file and kind by folder, the
 * frontmatter read in one spawn, the tour memberships, and the root.
 */

import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { writeKbFixture } from '../lib/fixtures.js';
import { makeSandbox, type Sandbox } from '../lib/sandbox.js';

import { Corpus, KbError, KIND_SEQ, metaOf, readModel, readOtherRows, readPages, REPO, rootFrom } from './corpus.js';

let sb: Sandbox;
beforeAll(() => {
  sb = makeSandbox();
  writeKbFixture(sb.dir);
});
afterAll(() => sb.cleanup());

describe('the pages', () => {
  it('places each page by its structure row: kind by folder, band and group by area', () => {
    const pages = readPages(sb.dir, readModel(sb.dir));
    expect(pages.map((p) => `${p.slug}:${p.kind}:${p.band}:${p.group}:${p.area}`)).toEqual([
      'breaker:pattern:distributed:distributed-resilience:distributed-resilience',
      'retry:pattern:distributed:distributed-resilience:distributed-resilience',
      'queue:pattern:messaging:messaging:messaging',
      'storm:hazard:hazard:hazard:hazards',
      'shortener:design:design:design:designs-mid',
      'loop:theme:theme:theme:designs-mid',
      'steady:theme:theme:theme:themes',
      'quick:principle:principle:principle:principles',
      'queues:capability:capability:capability:capabilities',
      'brokers:comparison:comparison:comparison:comparisons',
    ]);
    expect(pages[0]).toMatchObject({ route: '/patterns/distributed/resilience/breaker.html', path: 'patterns/distributed/resilience/breaker.html' });
    // The listing: kind by KIND_SEQ first, reading order within a kind.
    expect(new Corpus(sb.dir).listing.map((p) => p.slug)).toEqual(['breaker', 'retry', 'queue', 'storm', 'loop', 'steady', 'quick', 'shortener', 'queues', 'brokers']);
    expect(KIND_SEQ).toEqual(['pattern', 'hazard', 'theme', 'principle', 'design', 'capability', 'comparison']);
    expect(new Corpus(sb.dir).otherRows).toEqual([{ source: 'docs/reference/notes.md', route: '/reference/notes.html', area: 'reference' }]);
  });

  it('files a pattern listed on the patterns area itself under that band, and skips a row outside docs/', () => {
    const odd = makeSandbox();
    try {
      writeKbFixture(odd.dir);
      odd.write(
        'docs/data/site-structure.json',
        JSON.stringify({
          areas: [
            { id: 'patterns', pages: [{ slug: 'top', source: 'docs/patterns/top.md', route: '/patterns/top.html' }] },
            { id: 'elsewhere', pages: [{ slug: 'x', source: 'other/patterns/x.md', route: '/x.html' }, { slug: 'y', source: 'y.md', route: '/y.html' }] },
            { id: 'empty' },
          ],
        }),
      );
      expect(readPages(odd.dir, readModel(odd.dir)).map((p) => `${p.slug}:${p.band}`)).toEqual(['top:patterns']);
      // What readPages leaves out, each row with the area that lists it.
      expect(readOtherRows(odd.dir, readModel(odd.dir))).toEqual([
        { source: 'other/patterns/x.md', route: '/x.html', area: 'elsewhere' },
        { source: 'y.md', route: '/y.html', area: 'elsewhere' },
      ]);
      odd.write('docs/data/site-structure.json', '{}');
      expect(readPages(odd.dir, readModel(odd.dir))).toEqual([]);
      expect(readOtherRows(odd.dir, readModel(odd.dir))).toEqual([]);
    } finally {
      odd.cleanup();
    }
  });

  it('reads the content model: kinds, labelled verbs in display order, languages', () => {
    const m = readModel(REPO);
    expect(m.kinds.map((k) => k.id)).toEqual(['pattern', 'hazard', 'theme', 'principle', 'design', 'capability', 'comparison']);
    expect(m.verbs['combines-with']).toEqual({ label: 'Combines with', inverse: 'combines-with', symmetric: true });
    expect(m.verbs['prerequisite']).toEqual({ label: 'Requires', inverse: 'enables' });
    expect(m.relOrder.slice(0, 2)).toEqual(['Combines with', 'Alternative to']);
    expect(m.sketchLangs).toContain('typescript');
    expect(m.sketchLangs).toContain('go');
    expect(m.sketchOnly).toEqual({ go: { kind: 'pattern', area: 'concurrency' } });
    expect(m.groups['tradeoffs']).toEqual({ fact: 'polarity', values: ['pro', 'con'] });
  });
});

describe('lookups and facts', () => {
  it('finds a page by slug and route, and names the near misses of one it lacks', () => {
    const c = new Corpus(sb.dir);
    expect(c.page('storm')?.source).toBe('docs/hazards/storm.md');
    expect(c.byRoute('/themes/steady.html')?.slug).toBe('steady');
    expect(() => c.need('que')).toThrow(new KbError('unknown id: que\ndid you mean: queue, queues'));
    expect(() => c.need(undefined)).toThrow(new KbError('unknown id: (none given)'));
  });

  it('reads every page’s frontmatter in one pass; lists split, a scalar list as one item', () => {
    const c = new Corpus(sb.dir);
    expect(c.meta('breaker')).toEqual({
      title: 'Breaker',
      essence: 'The breaker page',
      aliases: ['CB', 'fuse'],
      tags: ['resilience', 'latency'],
      solves: ['my threads hang on a dead dependency', 'one failing call, and the whole service falls'],
      favourite: true,
    });
    expect(c.meta('nope')).toEqual(metaOf({}));
    expect(c.frontmatter('breaker')).toMatchObject({ area: 'distributed-resilience', favourite: 'true', tags: ['resilience', 'latency'] });
    expect(c.frontmatter('nope')).toEqual({});
    expect(metaOf({ aliases: 'CB', tags: '', title: ['not', 'a', 'string'] })).toMatchObject({ title: '', aliases: ['CB'], tags: [] });
  });

  it('reads a page’s text once, and names a file it cannot read', () => {
    const odd = makeSandbox();
    try {
      writeKbFixture(odd.dir);
      odd.rm('docs/hazards/storm.md');
      const c = new Corpus(odd.dir);
      expect(c.meta('storm')).toEqual(metaOf({}));
      expect(() => c.text('storm')).toThrow(new KbError('storm: cannot read docs/hazards/storm.md'));
      expect(c.text('quick')).toBe(c.text('quick'));
      expect(c.cached('k', () => 1)).toBe(1);
      expect(c.cached('k', () => 2)).toBe(1);
      for (const p of c.pages) odd.rm(p.source);
      expect(new Corpus(odd.dir).meta('quick')).toEqual(metaOf({}));
    } finally {
      odd.cleanup();
    }
  });

  it('names the themes whose tour holds a page, with its role, and a theme’s members', () => {
    const c = new Corpus(sb.dir);
    expect(c.themesOf('retry')).toEqual([{ id: 'steady', name: 'Steady', role: 'Ride out blips', href: 'themes/steady.html' }]);
    expect(c.themesOf('storm')).toEqual([]);
    expect(c.membersOf('steady')).toEqual([
      { id: 'breaker', role: 'Stop hammering it' },
      { id: 'retry', role: 'Ride out blips' },
    ]);
    expect(c.membersOf('breaker')).toEqual([]);
  });

  it('gives a member with no note an empty role, and skips a profile with no theme page', () => {
    const odd = makeSandbox();
    try {
      writeKbFixture(odd.dir);
      odd.write(
        'docs/data/learning-paths.json',
        JSON.stringify({ profiles: [{ id: 'steady', stages: ['/hazards/storm.html'] }, { id: 'ghost', stages: ['/hazards/storm.html'] }], notes: {} }),
      );
      const c = new Corpus(odd.dir);
      expect(c.themesOf('storm')).toEqual([{ id: 'steady', name: 'Steady', role: '', href: 'themes/steady.html' }]);
      expect(c.membersOf('steady')).toEqual([{ id: 'storm', role: '' }]);
    } finally {
      odd.cleanup();
    }
  });
});

describe('rootFrom', () => {
  it('takes KB_ROOT when set, this repo otherwise', () => {
    expect(rootFrom({ KB_ROOT: 'x/y' })).toBe(path.resolve('x/y'));
    expect(rootFrom({ KB_ROOT: '' })).toBe(REPO);
    expect(rootFrom({})).toBe(REPO);
  });
});
