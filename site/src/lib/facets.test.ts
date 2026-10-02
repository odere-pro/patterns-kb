/**
 * The hub's filter rails: which chips a set of entries earns, and the keys an
 * entry answers to.
 */
import { describe, expect, it } from 'vitest';

import { chipLabel, entryKeys, facetOf, facetRails } from './facets';

const terms = [
  { id: 'caching', facet: 'topic' },
  { id: 'resilience', facet: 'topic' },
  { id: 'latency', facet: 'skill' },
  { id: 'read-optimization', facet: 'skill' },
  { id: 'cloud', facet: 'language' },
];
const facets = ['topic', 'skill', 'language'];
const entry = (tags: string[]) => ({ tags });

describe('entryKeys', () => {
  it('gives each tag its facet and drops a tag the file does not list', () => {
    expect(entryKeys(entry(['caching', 'latency', 'unknown']), terms)).toEqual([
      'topic:caching',
      'skill:latency',
    ]);
    expect(entryKeys({}, terms)).toEqual([]);
  });

  it('reads the facets from the real tag file by default', () => {
    expect(facetOf('no-such-tag')).toBeUndefined();
    expect(typeof facetOf('caching')).toBe('string');
  });
});

describe('facetRails', () => {
  it('offers a value two or more entries share and not all of them, rail by rail', () => {
    const rails = facetRails(
      [
        entry(['caching', 'latency', 'cloud']),
        entry(['caching', 'read-optimization', 'cloud']),
        entry(['resilience', 'latency', 'cloud']),
        entry(['resilience', 'read-optimization', 'cloud']),
      ],
      facets,
      terms,
    );
    expect(rails).toEqual([
      {
        id: 'topic',
        label: 'Topic',
        chips: [
          { key: 'topic:caching', label: 'caching' },
          { key: 'topic:resilience', label: 'resilience' },
        ],
      },
      {
        id: 'skill',
        label: 'Skill',
        chips: [
          { key: 'skill:latency', label: 'latency' },
          { key: 'skill:read-optimization', label: 'read optimization' },
        ],
      },
    ]);
  });

  it('counts an entry that repeats a tag once, and offers nothing for one entry', () => {
    expect(facetRails([entry(['caching', 'caching']), entry(['latency'])], facets, terms)).toEqual(
      [],
    );
    expect(facetRails([entry(['caching'])], facets, terms)).toEqual([]);
  });

  it('reads the real facets when none are given', () => {
    expect(facetRails([entry([]), entry([])])).toEqual([]);
  });

  it('says a value with spaces for its hyphens', () => {
    expect(chipLabel('read-optimization')).toBe('read optimization');
  });
});
