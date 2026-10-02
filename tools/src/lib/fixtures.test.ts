/**
 * The fixtures the suites are built out of, held to the promises they make.
 *
 * A harness bug does not fail loudly; it makes other tests agree with whatever
 * is in front of them. An `omit` that left `undefined` behind instead of
 * removing a key, or a matcher reader that quietly returned nothing, would
 * leave every suite reading it green. So the behaviours nothing else would
 * notice are asserted here. The shapes themselves are held by the type
 * checker: a required field added to a typed fixture fails `tsc` in this
 * workspace rather than in a suite.
 */

import { describe, expect, it } from 'vitest';

import { matcherOwners, omit, problemMatchers } from './fixtures.js';

describe('omit', () => {
  const base = { id: 'x', wired: 'cmd', ci_job: 'validate' };

  it('removes the key rather than setting it to undefined', () => {
    const unwired = omit(base, 'wired');
    expect('wired' in unwired).toBe(false);
    expect(Object.keys(unwired)).not.toContain('wired');
  });

  it('leaves the original alone, and takes more than one key', () => {
    const stripped = omit(base, 'wired', 'ci_job');
    expect(Object.keys(stripped)).toEqual(['id']);
    expect(base.wired).toBe('cmd');
  });
});

describe('the problem matcher reader', () => {
  it('reads the real file, one matcher per finding shape', () => {
    expect(problemMatchers()).toHaveLength(3);
  });

  it('names exactly one owner for a finding line, none for anything else', () => {
    expect(matcherOwners('[json-sanity] FAIL a.json:3: is not valid JSON')).toEqual(['kb-gate-line']);
    expect(matcherOwners('[json-sanity] FAIL a.json: is not valid JSON')).toEqual(['kb-gate']);
    expect(matcherOwners('PAGE-001 docs/a.md:1 no title')).toEqual(['kb-rule']);
    expect(matcherOwners('[json-sanity] 3 JSON files parse')).toEqual([]);
  });
});
