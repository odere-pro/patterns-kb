/**
 * The search oracle gate: a file of cases that both rankings answer passes
 * with its count, each way a path can miss is one finding naming the query, the
 * hit, the wish and the path, and a broken file is named before anything runs.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { capture, expectFail, expectMisuse, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from '../lib/sandbox.js';
import { writeKbFixture } from '../lib/fixtures.js';
import { judge, shapeFindings, spec, SRC, type OracleCase } from './check-search-oracle.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
  writeKbFixture(sb.dir);
});
afterEach(() => sb.cleanup());

function oracle(cases: unknown, extra: Record<string, unknown> = {}): void {
  sb.write(SRC, `${JSON.stringify({ version: 1, updated: '2026-09-30', note: 'n', cases, ...extra }, null, 2)}\n`);
}

const hit = (id: string, kind = 'pattern', band = 'distributed') => ({ id, kind, band });

describe('check-search-oracle', () => {
  it('passes cases both paths answer, and says how many', async () => {
    oracle([
      { q: 'breaker', top: ['breaker'] },
      { q: 'cb', top: ['breaker', 'retry'] },
      { q: 'hazard', kind: 'hazard', n: 1 },
      { q: 'resilience', within: { breaker: 3 } },
    ]);
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[search-oracle] 4 queries hold on the site path and the kb.mjs path');
  });

  it('fails a first hit that is not the wished page, once per path, naming the query and what it got', async () => {
    oracle([{ q: 'breaker', top: ['queue'] }]);
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err.split('\n')).toEqual([`[search-oracle] FAIL ${SRC}: breaker → got breaker, wanted queue (site)`, `[search-oracle] FAIL ${SRC}: breaker → got breaker, wanted queue (cli)`]);
  });

  it('fails a kind, a band and a rank the hits miss', async () => {
    oracle([
      { q: 'breaker', kind: 'hazard', n: 1 },
      { q: 'breaker', band: 'messaging', n: 1 },
      { q: 'resilience', within: { queue: 2 } },
    ]);
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('breaker → got breaker (pattern), wanted the first 1 of kind hazard (site)');
    expect(r.err).toContain('breaker → got breaker (distributed), wanted the first 1 of band messaging (cli)');
    expect(r.err).toMatch(/resilience → got queue absent \(.*\), wanted it within the first 2 \(site\)/);
  });

  it('fails a file that is missing, is not JSON, or has the wrong shape, before running anything', async () => {
    expectFail(await sb.run(spec), `${SRC}: is missing`);
    sb.write(SRC, '{');
    expectFail(await sb.run(spec), `${SRC}: is not valid JSON`);
    oracle([{ q: 'breaker', top: ['nowhere'] }]);
    expectFail(await sb.run(spec), '`top` names "nowhere", which is no page');
  });

  it('takes no arguments', async () => {
    oracle([{ q: 'breaker', top: ['breaker'] }]);
    expectMisuse(await sb.run(spec, ['--nope']));
  });

  it('holds the real oracle (real tree)', async () => {
    const r = await capture(spec, [], REPO_ROOT);
    expectPass(r);
    expect(r.out.trim()).toMatch(/^\[search-oracle\] \d+ queries hold on the site path and the kb.mjs path$/);
  }, 60_000);
});

describe('shapeFindings', () => {
  const known = new Set(['a', 'b']);

  it('accepts every case form', () => {
    const data = { version: 1, updated: 'x', note: 'n', cases: [{ q: 'a', top: ['a'] }, { q: 'b', kind: 'x', band: 'y', n: 2 }, { q: 'c', within: { a: 2 } }] };
    expect(shapeFindings(data, known)).toEqual([]);
  });

  it('names each fault of the file and of a case', () => {
    expect(shapeFindings([], known)).toEqual(['is not a JSON object']);
    expect(shapeFindings({ cases: [] }, known)).toEqual(['lacks `version`', 'lacks `updated`', 'lacks `note`']);
    expect(shapeFindings({ version: 1, updated: 'x', note: 'n', cases: 'no' }, known)).toEqual(['`cases` is missing or is not a list']);
    const cases = [
      'text',
      { q: ' ', top: ['a'] },
      { q: 'one', wat: 1, top: 'a' },
      { q: 'two', top: [] },
      { q: 'three', within: {} },
      { q: 'four', within: { a: 0, z: 2 } },
      { q: 'five', kind: '', n: 0 },
      { q: 'six', n: 2, top: ['a'] },
      { q: 'seven' },
      { q: 'eight', band: 3, n: 1.5 },
    ];
    expect(shapeFindings({ version: 1, updated: 'x', note: 'n', cases }, known)).toEqual([
      'case 1: is not an object',
      'case 2 " ": `q` is not a query',
      'case 3 "one": unknown key `wat`',
      'case 3 "one": `top` is not a list of ids',
      'case 4 "two": `top` is not a list of ids',
      'case 5 "three": `within` is not an object of id → rank',
      'case 6 "four": `within` names "z", which is no page',
      'case 6 "four": `within` gives "a" the rank 0, not a whole number from 1',
      'case 7 "five": `kind` is not a word',
      'case 7 "five": `n` is not a whole number from 1',
      'case 8 "six": `n` means something only beside `kind` or `band`',
      'case 9 "seven": expects nothing — give `top`, `kind`, `band` or `within`',
      'case 10 "eight": `band` is not a word',
      'case 10 "eight": `n` is not a whole number from 1',
    ]);
  });
});

describe('judge', () => {
  const c = (over: Partial<OracleCase>): OracleCase => ({ q: 'x', ...over });

  it('holds a case whose expectations are all met', () => {
    const hits = [hit('a'), hit('b'), hit('c')];
    expect(judge(c({ top: ['z', 'a'], kind: 'pattern', band: 'distributed', n: 3, within: { c: 3 } }), hits)).toEqual([]);
  });

  it('says what it got beside what it wanted, for each expectation', () => {
    const hits = [hit('a'), hit('b', 'design', 'design')];
    expect(judge(c({ top: ['b'] }), hits)).toEqual(['got a, wanted b']);
    expect(judge(c({ top: ['b'] }), [])).toEqual(['got nothing, wanted b']);
    expect(judge(c({ kind: 'pattern', n: 2 }), hits)).toEqual(['got a (pattern), b (design), wanted the first 2 of kind pattern']);
    expect(judge(c({ band: 'distributed', n: 5 }), hits)).toEqual(['got 2 hits (a, b), wanted 5 of band distributed']);
    expect(judge(c({ within: { b: 1, z: 5 } }), hits)).toEqual(['got b at 2 (a), wanted it within the first 1', 'got z absent (a, b), wanted it within the first 5']);
  });
});
