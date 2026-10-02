/**
 * The shared allowlist reader: the entry shape, the list's own findings, and
 * the two-way match every gate keeping a list relies on.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Allowlist, entryProblem, readAllowlist, type AllowEntry } from './allowlist.js';
import type { GateSpec } from './gate.js';
import { expectFail, expectPass, makeSandbox, type Sandbox } from './sandbox.js';

const FILE = 'docs/data/allow/demo.json';
const WORDS = { missing: 'the demo gate reads it', emptyReason: 'has an empty reason — say why' };

/** A gate that only reads its list and reports how many entries it holds. */
const demo: GateSpec = {
  name: 'demo',
  usage: 'usage: demo',
  run(ctx) {
    const entries = readAllowlist(ctx, FILE, WORDS);
    return entries === null ? '' : `[demo] ${entries.length} entries`;
  },
};

const entry = (over: Partial<AllowEntry> = {}): AllowEntry => ({ name: 'n', match: 'a/**', reason: 'r', ...over });

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

describe('entryProblem', () => {
  it('accepts a named, matching, reasoned entry', () => {
    expect(entryProblem(entry(), WORDS.emptyReason)).toBeNull();
  });

  it('names the first missing field, and the gate’s own words for a blank reason', () => {
    expect(entryProblem({ match: 'a', reason: 'b' }, WORDS.emptyReason)).toBe('has no name');
    expect(entryProblem({ name: 'a', reason: 'b' }, WORDS.emptyReason)).toBe('has no match');
    expect(entryProblem(entry({ reason: '  ' }), WORDS.emptyReason)).toBe(WORDS.emptyReason);
    expect(entryProblem([], WORDS.emptyReason)).toBe('is not an object');
  });

  it('holds an excusing entry to an owner and a since date', () => {
    expect(entryProblem(entry({ owner: 'O', since: '2026-09-23' }), '')).toBeNull();
    expect(entryProblem(entry({ owner: 'O' }), '')).toContain('no since date');
    expect(entryProblem(entry({ since: '2026-09-23' }), '')).toContain('names no owner');
  });

  it('holds every entry to both when the gate says each one excuses a failure (exceptions-C3)', () => {
    expect(entryProblem(entry(), '', true)).toBe('excuses a failure but names no owner');
    expect(entryProblem(entry({ owner: 'O' }), '', true)).toBe('excuses a failure but has no since date (year-month-day)');
    expect(entryProblem(entry({ owner: 'O', since: '2026-09-23' }), '', true)).toBeNull();
  });
});

describe('readAllowlist', () => {
  it('reads a well-formed list', async () => {
    sb.write(FILE, JSON.stringify({ version: 1, updated: '2026-09-23', note: 'x', entries: [entry()] }));
    const r = await sb.run(demo);
    expectPass(r);
    expect(r.out).toBe('[demo] 1 entries');
  });

  it('names the file when it is missing, not JSON, or has no entries array', async () => {
    expectFail(await sb.run(demo), `[demo] FAIL ${FILE}: is missing — the demo gate reads it`);
    sb.write(FILE, 'nope');
    expectFail(await sb.run(demo), `[demo] FAIL ${FILE}: is not valid JSON`);
    sb.write(FILE, 'null');
    expectFail(await sb.run(demo), `[demo] FAIL ${FILE}: has no entries array`);
  });

  it('withholds a list whose entry names no owner when every entry excuses a failure', async () => {
    const strict: GateSpec = {
      ...demo,
      run(ctx) {
        const entries = readAllowlist(ctx, FILE, { ...WORDS, excusesFailures: true });
        return entries === null ? '' : `[demo] ${entries.length} entries`;
      },
    };
    sb.write(FILE, JSON.stringify({ entries: [entry({ name: 'plain' })] }));
    const r = await sb.run(strict);
    expectFail(r, `[demo] FAIL ${FILE}: entry "plain" excuses a failure but names no owner`);
    expect(r.out).toBe('');
    sb.write(FILE, JSON.stringify({ entries: [entry({ name: 'plain', owner: 'O', since: '2026-09-28' })] }));
    expect((await sb.run(strict)).out).toBe('[demo] 1 entries');
  });

  it('withholds the whole list over one malformed entry, naming it by name or position', async () => {
    sb.write(FILE, JSON.stringify({ entries: [entry({ name: 'bad', reason: '' }), { match: 'x' }] }));
    const r = await sb.run(demo);
    expectFail(r, `entry "bad" ${WORDS.emptyReason}`);
    expect(r.err).toContain('entry #2 has no name');
    expect(r.out).toBe('');
  });
});

describe('Allowlist', () => {
  it('matches whole things only, counts applied entries, and lists the unused ones', () => {
    const list = new Allowlist([entry({ name: 'a', match: 'site/*/CLAUDE.md' }), entry({ name: 'b', match: 'x.md' })]);
    expect(list.excuses('site/hazards/CLAUDE.md')).toBe(true);
    expect(list.excuses('site/patterns/gof/CLAUDE.md')).toBe(false);
    expect(list.excuses('prefix/x.md')).toBe(false);
    expect(list.applied).toBe(1);
    expect(list.unused().map((e) => e.name)).toEqual(['b']);
  });

  it('hands back the entry that excuses a thing, marking it used, or undefined', () => {
    const a = entry({ name: 'a', match: 'x/*.md' });
    const list = new Allowlist([a]);
    expect(list.entryFor('y.md')).toBeUndefined();
    expect(list.unused()).toEqual([a]);
    expect(list.entryFor('x/y.md')).toBe(a);
    expect(list.unused()).toEqual([]);
  });
});
