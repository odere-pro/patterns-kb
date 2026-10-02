/**
 * The synonym table's rules: a clean table passes with its counts, each broken
 * rule is one finding against the data file, and the real table holds.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { capture, expectFail, expectMisuse, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from '../lib/sandbox.js';
import { docsTree } from '../site/site-fixtures.js';
import { factVocabulary, KEY, MAX_TARGETS, spec, SRC, synonymFindings, wordsOf } from './check-search-synonyms.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

/** The fixture pages' facts hold alpha, beta, gamma, what, does, caching, performance and resilience. */
function table(curated: Record<string, unknown>, expansions: Record<string, unknown>, entries: unknown = Object.keys(expansions).length): void {
  sb.write(SRC, `${JSON.stringify({ version: 1, updated: '2026-09-30', note: 'n', curated, expansions, expansionMeta: { entries } }, null, 2)}\n`);
}

describe('check-search-synonyms', () => {
  it('passes a table that keeps every rule, counting both layers and the vocabulary', async () => {
    docsTree(sb);
    table({ cache: ['caching'] }, { lag: ['performance'], stale: ['caching', 'resilience'] });
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe(`[search-synonyms] ${SRC} holds its rules: 1 curated and 2 expansion keys, every target in the 8 words of the pages' facts`);
  });

  it('names every broken rule once, against the data file', async () => {
    docsTree(sb);
    table(
      { Cache: ['caching'], the: ['alpha'], wide: ['alpha', 'beta', 'gamma', 'what', 'does'], lag: ['alpha'] },
      { zeta: ['caching'], a1: ['alpha'], dup: ['beta', 'beta'], self: ['self'], cach: ['caching'], lag: ['beta'], odd: ['nowhere'], list: 'beta' },
      3,
    );
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err.split('\n')).toEqual(
      [
        'curated "Cache": a key is a lowercase word of two letters or more, letters only',
        'curated "the": a stopword, which the scorer drops before any synonym is read',
        `curated "wide": 5 targets — a key names 1 to ${String(MAX_TARGETS)}`,
        'expansions "a1": a key is a lowercase word of two letters or more, letters only',
        'expansions "dup": names "beta" twice',
        'expansions "self": names itself',
        'expansions "self": "self" is in no page\'s declared facts, so it matches nothing — pick a word the pages use',
        'expansions "cach": "caching" contains the key, which already matches it — drop the target',
        'expansions "odd": "nowhere" is in no page\'s declared facts, so it matches nothing — pick a word the pages use',
        'expansions "list": its value is not a list of words',
        'expansions "a1": out of order, after "zeta" — keep the keys sorted',
        'expansions "cach": out of order, after "self" — keep the keys sorted',
        'expansions "list": out of order, after "odd" — keep the keys sorted',
        'expansions "lag": curated holds the key too, and takes its value whole, so this one is dead — merge it into curated',
        'expansionMeta.entries is 3, and expansions holds 8 keys — set it to the count',
      ].map((what) => `[search-synonyms] FAIL ${SRC}: ${what}`),
    );
  });

  it('lets a curated key bridge to a word that contains it', () => {
    expect(synonymFindings({ curated: { cache: ['caching'] }, expansions: {}, expansionMeta: { entries: 0 } }, new Set(['caching']))).toEqual([]);
  });

  it('names a table with a layer missing, or no object at all', () => {
    expect(synonymFindings([], new Set())).toEqual(['is not a JSON object']);
    expect(synonymFindings({ curated: {} }, new Set())).toEqual(['`expansions` is missing or is not an object of key → targets']);
    expect(synonymFindings({ expansions: {}, expansionMeta: 1 }, new Set())).toEqual([
      '`curated` is missing or is not an object of key → targets',
      'expansionMeta.entries is undefined, and expansions holds 0 keys — set it to the count',
    ]);
  });

  it('reads the facts a page has, and nothing from a page with no file or no description', () => {
    docsTree(sb);
    sb.write('docs/patterns/caching/beta.md', '---\ntitle: Beta\ntags: [resilience]\n---\n\n# Beta\n');
    sb.write('docs/hazards/gamma.md', '# Gamma\n');
    expect([...factVocabulary(sb.dir)].sort()).toEqual(['alpha', 'beta', 'caching', 'does', 'gamma', 'performance', 'resilience', 'what']);
    sb.rm('docs/hazards/gamma.md');
    expect(factVocabulary(sb.dir).has('gamma')).toBe(false);
  });

  it('fails a missing or unreadable file, and exits 2 on an argument', async () => {
    docsTree(sb);
    expectFail(await sb.run(spec), `${SRC}: is missing`);
    sb.write(SRC, '{nope');
    expectFail(await sb.run(spec), `${SRC}: is not valid JSON`);
    expectMisuse(await sb.run(spec, ['--nope']));
  });

  it('reads words of two letters or more, and a key by the same measure', () => {
    expect(wordsOf('A slow-ish DB, 2x!')).toEqual(['slow', 'ish', 'db']);
    expect(KEY.test('lag')).toBe(true);
    expect(KEY.test('ai')).toBe(true);
    expect(KEY.test('a')).toBe(false);
    expect(KEY.test('ec2')).toBe(false);
    expect(factVocabulary(REPO_ROOT).has('breaker')).toBe(true);
  });

  it('holds the real table (real tree)', async () => {
    const r = await capture(spec, [], REPO_ROOT);
    expectPass(r);
  });
});
