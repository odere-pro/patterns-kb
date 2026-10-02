/**
 * The `--json` contract of every kb.mjs read command, pinned to the key.
 *
 * Skills and agents parse this output, so a renamed, dropped or retyped key
 * must fail here rather than in a consumer. Each command runs against the
 * fixture tree the other cli tests use, and its result is compared as an exact
 * sorted key set with the type of every value. The fields a row only carries
 * when the page has them (a favourite flag, aliases, a sketch marker) are
 * pinned on the one fixture page that has them all, and every other row must
 * stay inside that set and keep the always-present core.
 *
 * An error is not JSON: a failed command writes one line to stderr, nothing to
 * stdout, and exits 1, with or without `--json`. That shape is pinned too.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { writeKbFixture } from '../lib/fixtures.js';
import { makeSandbox, type Sandbox } from '../lib/sandbox.js';

import { run } from './cli.js';

let sb: Sandbox;
beforeAll(() => {
  sb = makeSandbox();
  writeKbFixture(sb.dir);
});
afterAll(() => sb.cleanup());

interface Ran {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

async function kb(...argv: string[]): Promise<Ran> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, { out: (l) => out.push(l), err: (l) => err.push(l) }, sb.dir);
  return { code, out: out.join('\n'), err: err.join('\n') };
}

/** The parsed `--json` output of a command that exits as expected. */
async function asJson(code: number, ...argv: string[]): Promise<unknown> {
  const r = await kb(...argv, '--json');
  expect(r.code, r.err).toBe(code);
  expect(r.err).toBe('');
  return JSON.parse(r.out) as unknown;
}

/** One value's type, with arrays and null told apart from objects. */
const typeOf = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** An object as `{ key: type }` with its keys sorted, so a diff names the key that moved. */
function shape(v: unknown): Record<string, string> {
  const o = v as Record<string, unknown>;
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, typeOf(o[k])]));
}

/** Every key of the richest catalog row, with its type. */
const NODE: Record<string, string> = {
  aliases: 'array',
  band: 'string',
  essence: 'string',
  favourite: 'boolean',
  hasExample: 'boolean',
  hasExplain: 'boolean',
  id: 'string',
  kind: 'string',
  name: 'string',
  path: 'string',
  solves: 'array',
  tags: 'array',
};
/** The keys every catalog row has, whatever the page. */
const CORE = ['band', 'essence', 'id', 'kind', 'name', 'path'];

/** A catalog row: inside the full set, types as pinned, core present. */
function expectNode(row: unknown, extra: Record<string, string> = {}): void {
  const s = shape(row);
  for (const k of CORE) expect(s, `row lacks ${k}`).toHaveProperty(k);
  const allowed = { ...NODE, ...extra };
  for (const [k, t] of Object.entries(s)) expect(allowed[k], `unexpected key ${k}`).toBe(t);
}

const RELATION = { label: 'string', note: 'string', to: 'string', type: 'string' };
const THEME_REF = { href: 'string', id: 'string', name: 'string', role: 'string' };

describe('find --json', () => {
  it('is an array of catalog rows plus why, the richest row carrying every key', async () => {
    const rows = (await asJson(0, 'find', 'breaker')) as unknown[];
    expect(Array.isArray(rows)).toBe(true);
    expect(shape(rows[0])).toEqual({ ...NODE, why: 'string' });
    for (const r of rows) expectNode(r, { why: 'string' });
  });
});

describe('ls --json', () => {
  it('is an array of catalog rows with no why', async () => {
    const rows = (await asJson(0, 'ls')) as unknown[];
    expect(shape(rows[0])).toEqual(NODE);
    for (const r of rows) expectNode(r);
    expect(rows.length).toBeGreaterThan(5);
  });
});

describe('get --json', () => {
  it('has the page header, every block, the relations and the themes', async () => {
    const page = (await asJson(0, 'get', 'breaker')) as Record<string, unknown>;
    expect(shape(page)).toEqual({
      band: 'string',
      blocks: 'object',
      essence: 'string',
      group: 'string',
      id: 'string',
      items: 'object',
      kind: 'string',
      name: 'string',
      path: 'string',
      relations: 'array',
      source: 'string',
      themes: 'array',
    });
    expect(Object.keys(page['items'] as object).sort()).toEqual(['explain', 'production', 'wild']);
    for (const [name, text] of Object.entries(page['blocks'] as object)) expect(typeof text, name).toBe('string');
    expect(Object.keys(page['blocks'] as object)).toEqual(expect.arrayContaining(['description', 'usage', 'wild', 'production', 'explain']));
    for (const r of page['relations'] as unknown[]) expect(shape(r)).toEqual(RELATION);
    for (const t of page['themes'] as unknown[]) expect(shape(t)).toEqual(THEME_REF);
  });

  it('with --block keeps the header keys, drops items, and holds only that block', async () => {
    const page = (await asJson(0, 'get', 'breaker', '--block', 'usage')) as Record<string, unknown>;
    expect(Object.keys(page).sort()).toEqual(['band', 'blocks', 'essence', 'group', 'id', 'kind', 'name', 'path', 'relations', 'source', 'themes']);
    expect(Object.keys(page['blocks'] as object)).toEqual(['usage']);
  });

  it('adds items for the three blocks the writers read back: wild, production and explain', async () => {
    for (const block of ['wild', 'production', 'explain']) {
      const page = (await asJson(0, 'get', 'breaker', '--block', block)) as Record<string, unknown>;
      expect(Object.keys(page).sort(), block).toEqual(['band', 'blocks', 'essence', 'group', 'id', 'items', 'kind', 'name', 'path', 'relations', 'source', 'themes']);
      expect(Object.keys(page['items'] as object), block).toEqual([block]);
    }
    const explain = ((await asJson(0, 'get', 'breaker', '--block', 'explain')) as { items: { explain: Record<string, unknown> } }).items.explain;
    expect(shape(explain)).toMatchObject({ example: 'string', text: 'string' });
    const wild = ((await asJson(0, 'get', 'breaker', '--block', 'wild')) as { items: { wild: unknown[] } }).items.wild;
    expect(Array.isArray(wild)).toBe(true);
    expect(shape(wild[0])).toEqual({ id: 'string', name: 'string', note: 'string' });
    const production = ((await asJson(0, 'get', 'breaker', '--block', 'production')) as { items: { production: Record<string, unknown> } }).items.production;
    expect(Object.keys(production).sort()).toEqual(['checklist', 'failures', 'knobs', 'signals']);
    for (const v of Object.values(production)) expect(Array.isArray(v)).toBe(true);
  });
});

describe('brief --json', () => {
  it('has the query, the matches, the governing theme and the neighbours of the top hits', async () => {
    const brief = (await asJson(0, 'brief', 'breaker')) as Record<string, unknown>;
    expect(shape(brief)).toEqual({ matches: 'array', query: 'string', related: 'object', theme: 'object' });
    for (const m of brief['matches'] as unknown[]) expectNode(m, { why: 'string' });
    expect(shape(brief['theme'])).toEqual({ decide: 'string', id: 'string' });
    const related = brief['related'] as Record<string, unknown[]>;
    expect(Object.keys(related).length).toBeGreaterThan(0);
    for (const rels of Object.values(related)) for (const r of rels) expect(shape(r)).toEqual(RELATION);
  });
});

describe('related --json', () => {
  it('is an array of typed edges', async () => {
    const rels = (await asJson(0, 'related', 'breaker')) as unknown[];
    expect(rels.length).toBeGreaterThan(0);
    for (const r of rels) expect(shape(r)).toEqual(RELATION);
  });
});

describe('backlinks --json', () => {
  it('has the id, the inbound edges, who mentions it and whom it mentions', async () => {
    const back = (await asJson(0, 'backlinks', 'breaker')) as Record<string, unknown>;
    expect(shape(back)).toEqual({ id: 'string', inbound: 'array', mentionedBy: 'array', mentions: 'array' });
    expect((back['inbound'] as unknown[]).length).toBeGreaterThan(0);
    for (const r of back['inbound'] as unknown[]) expect(shape(r)).toEqual({ from: 'string', label: 'string', note: 'string', type: 'string' });
    for (const k of ['mentionedBy', 'mentions']) for (const id of back[k] as unknown[]) expect(typeof id).toBe('string');
  });
});

describe('refs --json', () => {
  it('has the page, its typed edges, its members, its fluency and the prose and click targets', async () => {
    const refs = (await asJson(0, 'refs', 'breaker')) as Record<string, unknown>;
    expect(shape(refs)).toEqual({
      clicks: 'array',
      fluency: 'array',
      id: 'string',
      members: 'array',
      path: 'string',
      proseLinks: 'array',
      relations: 'array',
      source: 'string',
      untyped: 'array',
    });
    for (const r of refs['relations'] as unknown[]) expect(shape(r)).toEqual({ rel: 'string', to: 'string' });
    const theme = (await asJson(0, 'refs', 'steady')) as { members: unknown[] };
    expect(theme.members.length).toBeGreaterThan(0);
    for (const m of theme.members) expect(shape(m)).toEqual({ role: 'string', to: 'string' });
  });
});

describe('validate --json', () => {
  it('is the page count and the problems, exit 0 when there are none', async () => {
    const ok = (await asJson(0, 'validate', 'breaker')) as Record<string, unknown>;
    expect(shape(ok)).toEqual({ pages: 'number', problems: 'array' });
    expect(ok).toEqual({ pages: 1, problems: [] });
  });

  it('keeps the same shape, as strings, and exits 1 when a page has problems', async () => {
    const bad = (await asJson(1, 'validate')) as { pages: number; problems: unknown[] };
    expect(shape(bad)).toEqual({ pages: 'number', problems: 'array' });
    expect(bad.problems.length).toBeGreaterThan(0);
    for (const p of bad.problems) expect(typeof p).toBe('string');
  });
});

describe('the error shape', () => {
  const cases: [string, string[]][] = [
    ['find with nothing to match', ['find']],
    ['get', ['get', 'no-such-id']],
    ['get --block', ['get', 'breaker', '--block', 'no-such-block']],
    ['related', ['related', 'no-such-id']],
    ['backlinks', ['backlinks', 'no-such-id']],
    ['refs', ['refs', 'no-such-id']],
    ['validate', ['validate', 'no-such-id']],
  ];
  it.each(cases)('%s: one line on stderr, nothing on stdout, exit 1, with or without --json', async (_name, argv) => {
    for (const extra of [[], ['--json']]) {
      const r = await kb(...argv, ...extra);
      expect(r.code).toBe(1);
      expect(r.out).toBe('');
      expect(r.err).not.toBe('');
      expect(() => JSON.parse(r.err)).toThrow();
    }
  });

  it('names the unknown id and, for a block, the blocks the page has', async () => {
    expect((await kb('get', 'no-such-id', '--json')).err).toBe('unknown id: no-such-id');
    expect((await kb('get', 'breaker', '--block', 'zzz', '--json')).err).toMatch(/^no block "zzz" on breaker\. has: description, /);
  });
});
