/**
 * The published surface, read from the structure file of the measured tree.
 * Every consumer reads it through here at run time (structure-C9), so a fixture
 * tree is what these readers must answer about — never this checkout.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  areaRoute,
  GENERATED,
  mirrored,
  pageRoute,
  publishedPages,
  routesBySource,
  SITE,
  STRUCTURE,
  structure,
  tupleLiteral,
} from './published.js';
import { makeSandbox, type Sandbox } from './sandbox.js';

const hub = { description: 'd', intro: 'i', tags: ['caching', 'latency'] };
const FILE = {
  version: 1,
  updated: '2026-09-24',
  note: 'n',
  areas: [
    {
      id: 'patterns',
      label: 'Patterns',
      hub,
      pages: [
        { slug: 'cache-aside', label: 'Cache-Aside', source: 'docs/patterns/cache-aside.md', route: '/patterns/caching/cache-aside.html' },
        { slug: 'home-tour', label: 'Tour', source: SITE },
      ],
    },
    { id: 'map', label: 'Map', nav: 'link', generated: 'gen-map', hub, pages: [{ slug: 'stack', label: 'Stack', source: GENERATED }] },
    {
      id: 'reference',
      label: 'Reference',
      nav: 'none',
      hub,
      pages: [{ slug: 'glossary', label: 'Glossary', source: 'docs/reference/glossary.md' }],
    },
  ],
};

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
  sb.write(STRUCTURE, JSON.stringify(FILE));
});
afterEach(() => sb.cleanup());

describe('structure', () => {
  it('reads the areas of the measured tree', () => {
    expect(structure(sb.dir).map((a) => a.id)).toEqual(['patterns', 'map', 'reference']);
  });

  it('throws on a file with no areas list, and on malformed JSON', () => {
    sb.write(STRUCTURE, '{"sections": []}');
    expect(() => structure(sb.dir)).toThrow('has no `areas` list');
    sb.write(STRUCTURE, '{ nope');
    expect(() => structure(sb.dir)).toThrow();
  });
});

describe('routes', () => {
  it('gives an area /<id>/ and a row its own route, else /<area>/<slug>/', () => {
    expect(areaRoute('map')).toBe('/map/');
    expect(pageRoute('patterns', { slug: 'x' })).toBe('/patterns/x/');
    expect(pageRoute('patterns', { slug: 'x', route: '/p/x.html' })).toBe('/p/x.html');
  });

  it('lists every row in area order then page order, resolved', () => {
    expect(publishedPages(sb.dir)).toEqual([
      { area: 'patterns', slug: 'cache-aside', label: 'Cache-Aside', source: 'docs/patterns/cache-aside.md', route: '/patterns/caching/cache-aside.html' },
      { area: 'patterns', slug: 'home-tour', label: 'Tour', source: SITE, route: '/patterns/home-tour/' },
      { area: 'map', slug: 'stack', label: 'Stack', source: GENERATED, route: '/map/stack/' },
    ]);
  });

  it('leaves the rows of an unpublished (`none`) area out of the list and the link map', () => {
    expect(publishedPages(sb.dir).some((p) => p.area === 'reference')).toBe(false);
    expect(routesBySource(sb.dir).has('docs/reference/glossary.md')).toBe(false);
  });

  it('maps only a mirrored page\'s source to its route', () => {
    expect(mirrored({ source: SITE })).toBe(false);
    expect(mirrored({ source: GENERATED })).toBe(false);
    expect(mirrored({ source: 'docs/x.md' })).toBe(true);
    expect([...routesBySource(sb.dir)]).toEqual([['docs/patterns/cache-aside.md', '/patterns/caching/cache-aside.html']]);
  });
});

describe('tupleLiteral', () => {
  it('reads a flat tuple, either quote, with or without a type annotation', () => {
    expect(tupleLiteral(`export const TAGS = ['a', "b"] as const;`, 'TAGS')).toEqual(['a', 'b']);
    expect(tupleLiteral(`const AREAS: readonly string[] = [\n  'x',\n  'y',\n];`, 'AREAS')).toEqual(['x', 'y']);
    expect(tupleLiteral(`export const TAGS = [];`, 'TAGS')).toEqual([]);
  });

  it('answers null when the declaration is not there in that shape', () => {
    expect(tupleLiteral(`export const TAGS = new Set(['a']);`, 'TAGS')).toBeNull();
    expect(tupleLiteral(`export const OTHER = ['a'];`, 'TAGS')).toBeNull();
  });

  it('does not count a member commented out, in either comment form', () => {
    expect(tupleLiteral(`export const TAGS = [\n  'a',\n  // 'edge',\n  'b',\n] as const;`, 'TAGS')).toEqual(['a', 'b']);
    expect(tupleLiteral(`export const TAGS = ['a', /* 'edge', */ 'b'];`, 'TAGS')).toEqual(['a', 'b']);
    expect(tupleLiteral(`export const TAGS = ['a', /* 'b',\n  'c', */];`, 'TAGS')).toEqual(['a']);
  });

  it('reads an apostrophe, a quote or a bracket inside a comment as comment text', () => {
    const text = `export const AREAS = [\n  // the band's leaf areas\n  'caching',\n  // see "x" and [y]\n  'messaging',\n];`;
    expect(tupleLiteral(text, 'AREAS')).toEqual(['caching', 'messaging']);
  });

  it('answers null for a body that is not one flat list of quoted ids', () => {
    for (const text of [
      `export const TAGS = [['a', 'b'], 'c'];`, // nested
      `export const TAGS = [...BASE, 'c'];`, // a spread
      `export const TAGS = ['a', b];`, // a bare word
      `export const TAGS = ['a' 'b'];`, // no comma between two ids
      `export const TAGS = [, 'a'];`, // a comma before any id
      `export const TAGS = ['a',, 'b'];`, // two commas
      `export const TAGS = ['a', 'b'`, // never closed
      `export const TAGS = ['a', /* never closed ];`, // a comment never closed
    ]) {
      expect(tupleLiteral(text, 'TAGS'), text).toBeNull();
    }
  });
});
