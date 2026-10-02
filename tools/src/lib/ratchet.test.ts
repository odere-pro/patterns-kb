/**
 * The kb-shape ratchets: one allowlist per rule, an entry's `covers` choosing
 * its rule, and `maxWords` holding a description to the length it was listed at.
 */

import { describe, expect, it } from 'vitest';

import type { AllowEntry } from './allowlist.js';
import { RATCHETS, ratchetProblem, Ratchets, type RatchetEntry } from './ratchet.js';

const entry = (over: Partial<RatchetEntry> & { match: string }): RatchetEntry => ({ name: over.match, reason: 'r', ...over });

describe('ratchetProblem', () => {
  it('accepts an entry with no ratchet keys, or with valid ones', () => {
    expect(ratchetProblem(entry({ match: 'a' }))).toBeNull();
    for (const covers of RATCHETS) expect(ratchetProblem(entry({ match: 'a', covers }))).toBeNull();
    expect(ratchetProblem(entry({ match: 'a', covers: 'description', maxWords: 120 }))).toBeNull();
  });

  it('names an unknown ratchet and a maxWords that is no whole number above 0', () => {
    expect(ratchetProblem(entry({ match: 'a', covers: 'size' }))).toBe('covers "size", which is none of explain, costs, description');
    for (const maxWords of [0, -3, 1.5]) expect(ratchetProblem(entry({ match: 'a', maxWords }))).toBe('has a maxWords that is not a whole number above 0');
  });
});

describe('Ratchets', () => {
  const list = new Ratchets([
    entry({ match: 'docs/a.md' }),
    entry({ match: 'docs/b.md', covers: 'costs' }),
    entry({ match: 'docs/c.md', covers: 'description', maxWords: 100 }),
    entry({ match: 'docs/d.md', covers: 'description' }),
  ]);

  it('excuses a page only under the ratchet its entry covers', () => {
    expect(list.excuses('explain', 'docs/a.md')).toBe(true);
    expect(list.excuses('costs', 'docs/a.md')).toBe(false);
    expect(list.excuses('costs', 'docs/b.md')).toBe(true);
    expect(list.excuses('explain', 'docs/b.md')).toBe(false);
    expect(list.excuses('explain', 'docs/zzz.md')).toBe(false);
  });

  it('holds a description to its maxWords, and takes any length when the entry has none', () => {
    expect(list.excuses('description', 'docs/c.md', 100)).toBe(true);
    expect(list.excuses('description', 'docs/c.md', 101)).toBe(false);
    expect(list.excuses('description', 'docs/c.md')).toBe(true);
    expect(list.excuses('description', 'docs/d.md', 900)).toBe(true);
  });

  it('reports the entries that excused nothing, across the ratchets', () => {
    const fresh = new Ratchets([entry({ match: 'a.md' }), entry({ match: 'b.md', covers: 'costs' }), entry({ match: 'c.md', covers: 'description' })]);
    fresh.excuses('costs', 'b.md');
    expect(fresh.unused().map((e: AllowEntry) => e.match)).toEqual(['a.md', 'c.md']);
  });
});
