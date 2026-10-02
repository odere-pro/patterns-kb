/**
 * The tag list's one reader. Each helper answers the question its caller
 * actually has — which facet, which heading, which topic — and none of them
 * throws on a list that is not in shape: that is the gate's finding to make.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeSandbox, type Sandbox } from './sandbox.js';
import {
  CLASSES,
  COUNTS,
  facetById,
  facetRank,
  FACETS,
  labelById,
  loadTagList,
  parseTagList,
  TAG_LIST,
  termsOf,
  topicOf,
} from './tags.js';

const LIST = {
  facets: { topic: 'about', skill: 'doing', language: 'machinery' },
  terms: [
    { id: 'caching', facet: 'topic', label: 'Caching' },
    { id: 'latency', facet: 'skill' },
    { id: 'cloud', facet: 'language' },
    { id: 'bare', facet: 'topic', label: '' },
    { id: 7, facet: 'skill' },
    { id: 'no-facet' },
  ],
};

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

describe('the constants', () => {
  it('writes facets topic first, then skill, then language', () => {
    expect(FACETS).toEqual(['topic', 'skill', 'language']);
    expect(CLASSES).toEqual(['page', 'exercise']);
  });

  it('gives an exercise a higher floor and the same ceiling as a page', () => {
    // An exercise may span topics where a page may not, so its floor is higher;
    // it is mirrored as a page, so its ceiling cannot be.
    expect(COUNTS.exercise.min).toBeGreaterThan(COUNTS.page.min);
    expect(COUNTS.exercise.max).toBe(COUNTS.page.max);
    expect(COUNTS.page).toEqual({ min: 2, max: 5 });
  });
});

describe('parseTagList and loadTagList', () => {
  it('parses an object and refuses anything else', () => {
    expect(parseTagList('{"facets":{}}')).toEqual({ facets: {} });
    expect(parseTagList('[1]')).toBeNull();
    expect(parseTagList('null')).toBeNull();
    expect(parseTagList('{ nope')).toBeNull();
  });

  it('reads the list from the measured tree, and says why it cannot', () => {
    expect(() => loadTagList(sb.dir)).toThrow(`${TAG_LIST}: missing`);
    sb.write(TAG_LIST, '"a string"');
    expect(() => loadTagList(sb.dir)).toThrow('is not a JSON object');
    sb.write(TAG_LIST, JSON.stringify(LIST));
    expect(termsOf(loadTagList(sb.dir))).toHaveLength(6);
  });
});

describe('the lookups', () => {
  it('termsOf is empty when terms is not a list', () => {
    expect(termsOf({ terms: {} })).toEqual([]);
    expect(termsOf({})).toEqual([]);
  });

  it('facetById skips a term with no string id or no facet', () => {
    expect([...facetById(LIST)]).toEqual([
      ['caching', 'topic'],
      ['latency', 'skill'],
      ['cloud', 'language'],
      ['bare', 'topic'],
    ]);
  });

  it('labelById falls back to the id where a label is missing or empty', () => {
    const m = labelById(LIST);
    expect(m.get('caching')).toBe('Caching');
    expect(m.get('bare')).toBe('bare');
    expect(m.get('latency')).toBe('latency');
    expect(m.has('7')).toBe(false);
  });

  it('facetRank puts an undeclared facet last', () => {
    expect(facetRank('topic')).toBe(0);
    expect(facetRank('language')).toBe(2);
    expect(facetRank('audience')).toBe(3);
    expect(facetRank(undefined)).toBe(3);
  });

  it('topicOf is the first topic a page carries', () => {
    const facet = facetById(LIST);
    expect(topicOf(['latency', 'caching', 'bare'], facet)).toBe('caching');
    expect(topicOf(['latency', 'cloud'], facet)).toBeUndefined();
  });
});
