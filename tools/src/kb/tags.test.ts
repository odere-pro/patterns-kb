/**
 * The tag-list rules the writers and the lint hold a page to: read from a
 * tag list of any shape, switched on by the first topic, and worded as the
 * tags gate words them (tools/src/gates/check-tags.ts on the tags lane).
 */

import { describe, expect, it } from 'vitest';

import { FACET_ORDER, tagListProblems, tagRules } from './tags.js';

const rules = tagRules([
  { id: 'caching', facet: 'topic', applies: ['page'] },
  { id: 'messaging', facet: 'topic', applies: ['page'] },
  { id: 'latency', facet: 'skill', applies: ['page', 'exercise'] },
  { id: 'typescript', facet: 'language', applies: ['page'] },
  { id: 'drills', facet: 'skill', applies: ['exercise'] },
]);

describe('tagRules', () => {
  it('reads each term’s facet and page classes, and whether any term is a topic', () => {
    expect(rules.faceted).toBe(true);
    expect(rules.terms.get('latency')).toEqual({ facet: 'skill', applies: ['page', 'exercise'] });
    expect(FACET_ORDER).toEqual(['topic', 'skill', 'language']);
  });

  it('skips what is not a term, and reads a missing facet or applies as none', () => {
    const odd = tagRules([null, 'caching', { facet: 'topic' }, { id: 'bare' }, { id: 'odd', facet: 3, applies: 'page' }]);
    expect([...odd.terms.keys()]).toEqual(['bare', 'odd']);
    expect(odd.terms.get('bare')).toEqual({ facet: '', applies: [] });
    expect(odd.faceted).toBe(false);
    expect(tagRules(undefined).terms.size).toBe(0);
    expect(tagListProblems(['bare'], odd)).toEqual(['tag "bare" does not apply to a page — widen its applies or pick another']);
  });
});

describe('tagListProblems', () => {
  it('passes one topic first, then skills, then languages', () => {
    expect(tagListProblems(['caching', 'latency', 'typescript'], rules)).toEqual([]);
  });

  it('names the first tag out of facet order, once', () => {
    expect(tagListProblems(['latency', 'caching', 'typescript', 'latency'], rules)).toEqual([
      'tag "latency" is written twice',
      'tags are out of facet order at "caching" — topics first, then skills, then languages',
    ]);
    // A facet the list does not order sorts last.
    const loose = tagRules([
      { id: 'caching', facet: 'topic', applies: ['page'] },
      { id: 'mystery', facet: 'other', applies: ['page'] },
      { id: 'typescript', facet: 'language', applies: ['page'] },
    ]);
    expect(tagListProblems(['caching', 'mystery', 'typescript'], loose)).toEqual([
      'tags are out of facet order at "typescript" — topics first, then skills, then languages',
    ]);
  });

  it('holds a page to exactly one topic', () => {
    expect(tagListProblems(['latency', 'typescript'], rules)).toEqual(['no topic tag — what the page is about is the one tag it must carry, written first']);
    expect(tagListProblems(['caching', 'messaging'], rules)).toEqual([
      '2 topic tags (caching, messaging) — a page has one, and it decides which hub group the page joins',
    ]);
  });

  it('refuses a tag that does not apply to a page, and leaves unknown tags to the caller', () => {
    expect(tagListProblems(['caching', 'drills', 'nope'], rules)).toEqual(['tag "drills" does not apply to a page — widen its applies or pick another']);
  });

  it('holds no list to the facet rules before any term is a topic', () => {
    const flat = tagRules([
      { id: 'a', facet: 'skill', applies: ['page'] },
      { id: 'b', facet: 'skill', applies: ['page'] },
    ]);
    expect(tagListProblems(['b', 'a'], flat)).toEqual([]);
    expect(tagListProblems(['a', 'a'], flat)).toEqual(['tag "a" is written twice']);
  });
});
