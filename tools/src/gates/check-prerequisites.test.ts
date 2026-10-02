/**
 * The prerequisite gate over docs/data/prerequisites.json. The two oracle
 * scenarios come first — prerequisites-O1 (a cycle, a missing record, an
 * unpublished route, `--fix`) and learning-O3 (a stable page requiring a
 * draft one, and the same graph with no status declared) — then one planted
 * fault per rule, each asserting the exact finding and its line, and last the
 * real tree, which is held equal to the relations file it is built from.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { capture, expectFail, expectMisuse, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from '../lib/sandbox.js';
import { ALLOWLIST, cycles, hasHeader, LEARNING_PATHS, lineList, PREREQUISITES, sourceEdges, spec } from './check-prerequisites.js';
import { STRUCTURE } from './check-learning-paths.js';
import { RELATIONS } from './check-relations.js';
import type { PrereqRecord } from '../gen/gen-prerequisites.js';
import { HEADER, json, learningPageText, lineOf, PREREQ_RECORDS, prereqTree, prerequisitesJson, record, rowOf } from '../lib/fixtures.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

const findings = (err: string): string[] => err.split('\n').filter((l) => l.startsWith('[prerequisites] FAIL'));
const FAIL = `[prerequisites] FAIL ${PREREQUISITES}`;
/** The line a record opens on: the line above its `"id"` key. */
const recordLine = (id: string): number => lineOf(sb.read(PREREQUISITES), `"id": "${id}"`) - 1;

async function withRecords(records: readonly unknown[], statuses: Readonly<Record<string, string | null>> = {}) {
  prereqTree(sb, records, statuses);
  return sb.run(spec);
}

describe('prerequisites-O1', () => {
  it('a cycle, a missing record and an unpublished route: exactly three findings, stdout empty; --fix exits 2 changing no byte', async () => {
    const r = await withRecords([
      record('alpha', ['beta'], ['gamma']),
      record('beta', ['alpha']),
      record('gamma', ['ghost'], ['alpha']),
      record('delta', [], ['epsilon']),
      record('epsilon', [], ['delta']),
    ]);
    expectFail(r);
    expect(r.out).toBe('');
    expect(r.err.split('\n')).toEqual([
      `${FAIL}:${recordLine('gamma')}: record 'gamma' requires 'ghost', which no record declares`,
      `${FAIL}:${recordLine('epsilon')}: record 'epsilon' route /patterns/epsilon.html is not a route ${STRUCTURE} produces`,
      `${FAIL}:${recordLine('alpha')}: records 'alpha' and 'beta' require one another round a cycle — none of them can be read first; drop one requires edge`,
    ]);
    expect(findings(r.err)).toHaveLength(3);

    const before = sb.snapshot();
    const fix = await sb.run(spec, ['--fix']);
    expectMisuse(fix);
    expect(fix.out).toBe('');
    expect(sb.snapshot()).toEqual(before);
  });
});

describe('learning-O3', () => {
  it('a stable page requiring a draft one is one finding naming both; with no status declared the graph alone passes', async () => {
    let r = await withRecords(PREREQ_RECORDS, { beta: 'draft' });
    expectFail(r);
    expect(r.out).toBe('');
    expect(r.err.split('\n')).toEqual([
      `${FAIL}:${recordLine('alpha')}: record 'alpha' is stable but requires 'beta', whose page is a draft — a stable page never requires a draft one`,
    ]);

    r = await withRecords(PREREQ_RECORDS, { alpha: null, beta: null, gamma: null, delta: null, starting: null });
    expectPass(r);
    expect(r.err).toBe('');
  });

  it('judges only a stable page requiring a draft one: draft on draft, draft on stable and a missing page all pass', async () => {
    expectPass(await withRecords(PREREQ_RECORDS, { alpha: 'draft', beta: 'draft', delta: 'stable' }));
    prereqTree(sb, PREREQ_RECORDS, { beta: 'draft' });
    sb.rm(rowOf('alpha').source);
    expectPass(await sb.run(spec));
  });
});

describe('a clean graph', () => {
  it('passes with one summary line counting records, edges and pairs', async () => {
    const r = await withRecords(PREREQ_RECORDS);
    expectPass(r);
    expect(r.err).toBe('');
    expect(r.out).toBe(
      '[prerequisites] 4 records: 2 requires edges, no cycle; 1 related pairs, each listed both ways; every id and route resolved, every record reached',
    );
  });
});

describe('the file', () => {
  it('names a missing file, and one that is not JSON, once', async () => {
    let r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toBe(`${FAIL}: is missing — the prerequisite graph lives in it; run: make prerequisites`);
    sb.write(PREREQUISITES, 'not json\n');
    r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toHaveLength(1);
    expect(r.err.startsWith(`${FAIL}: is not valid JSON — `)).toBe(true);
  });

  it('a file without its source header is one finding and nothing else is judged', async () => {
    for (const header of [{}, { updated: '2026-09-24', version: 1, note: 'n' }, { ...HEADER, version: 1.5 }, { ...HEADER, updated: 'today' }, { ...HEADER, note: '' }]) {
      prereqTree(sb, [record('alpha', ['ghost'])]);
      sb.write(PREREQUISITES, prerequisitesJson([record('alpha', ['ghost'])], header));
      const r = await sb.run(spec);
      expectFail(r);
      expect(r.err, JSON.stringify(header)).toBe(`${FAIL}:1: lacks its source header — it opens with version, updated, note: an integer, a year-month-day date and a note`);
    }
    sb.write(PREREQUISITES, '[]\n');
    expectFail(await sb.run(spec), 'lacks its source header');
  });

  it('names an unknown file key and a missing records list', async () => {
    prereqTree(sb);
    sb.write(PREREQUISITES, json({ ...HEADER, records: {}, extra: 1 }));
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      `${FAIL}:${lineOf(sb.read(PREREQUISITES), '"extra"')}: unknown key "extra" — the file holds version, updated, note, records`,
      `${FAIL}:${lineOf(sb.read(PREREQUISITES), '"records"')}: has no records list`,
    ]);
  });

  it('names a missing structure file, and one with no areas; a route is then not judged', async () => {
    prereqTree(sb);
    sb.rm(STRUCTURE);
    let r = await sb.run(spec);
    expect(findings(r.err)).toEqual([`[prerequisites] FAIL ${STRUCTURE}: is missing — every record route is checked against the routes it produces`]);
    sb.write(STRUCTURE, json({ ...HEADER }));
    r = await sb.run(spec);
    expect(findings(r.err)).toEqual([`[prerequisites] FAIL ${STRUCTURE}: has no areas list, so it produces no route`]);
  });
});

describe('each record', () => {
  it('is closed: an unknown key, a missing key, a non-object and a list that is not ids are each a finding', async () => {
    const { related: _gone, ...noRelated } = record('delta');
    void _gone;
    const r = await withRecords([
      { ...PREREQ_RECORDS[0], extra: true },
      PREREQ_RECORDS[1],
      { ...PREREQ_RECORDS[2], label: '', requires: 'beta' },
      { ...noRelated, route: 7 },
      7,
    ]);
    const text = sb.read(PREREQUISITES);
    expect(findings(r.err)).toEqual([
      `${FAIL}:${lineOf(text, '"extra"')}: record 'alpha': unknown key "extra" — a record holds id, label, definition, route, requires, related`,
      `${FAIL}:${lineOf(text, '"label": ""')}: record 'gamma' label is not text`,
      `${FAIL}:${lineOf(text, '"requires": "beta"')}: record 'gamma' requires is not a list of ids`,
      `${FAIL}:${recordLine('delta')}: record 'delta' has no related`,
      `${FAIL}:${lineOf(text, '"route": 7')}: record 'delta' route is not text`,
      `${FAIL}:${lineOf(text, '    7')}: records[4] is not an object`,
    ]);
  });

  it('lists an id once: a neighbour or a requirement named twice is one finding each, at its list, and counts once', async () => {
    const r = await withRecords([
      record('alpha', ['beta', 'beta'], ['gamma', 'gamma', 'gamma']),
      PREREQ_RECORDS[1],
      PREREQ_RECORDS[2],
      PREREQ_RECORDS[3],
    ]);
    const text = sb.read(PREREQUISITES);
    expect(findings(r.err)).toEqual([
      `${FAIL}:${lineOf(text, '"requires": [')}: record 'alpha' requires 'beta' twice — a page is listed once`,
      `${FAIL}:${lineOf(text, '"related": [')}: record 'alpha' lists as related 'gamma' twice — a page is listed once`,
    ]);
  });

  it('has a unique kebab-case id', async () => {
    const r = await withRecords([...PREREQ_RECORDS, { ...record('alpha'), requires: [] }, { ...record('beta'), id: 'Beta Two' }, { ...record('beta'), id: 3 }]);
    const text = sb.read(PREREQUISITES);
    expect(findings(r.err)).toEqual([
      `${FAIL}:${lineOf(text, '"id": "alpha"', 2) - 1}: record 'alpha' is declared twice — first at line ${recordLine('alpha')}`,
      `${FAIL}:${lineOf(text, '"id": "Beta Two"') - 1}: record 'Beta Two' id "Beta Two" is not kebab-case`,
      `${FAIL}:${lineOf(text, '"id": 3') - 1}: record 'records[6]' id 3 is not kebab-case`,
      `${FAIL}:${lineOf(text, '"id": "Beta Two"') - 1}: record 'Beta Two' is an orphan — no other record requires it or lists it as related, and no learning path stages its route`,
    ]);
  });

  it('names a route spelled differently from the one the structure file produces', async () => {
    const r = await withRecords([PREREQ_RECORDS[0], PREREQ_RECORDS[1], { ...PREREQ_RECORDS[2], route: '/patterns/gamma' }, PREREQ_RECORDS[3]]);
    expect(findings(r.err)).toEqual([
      `${FAIL}:${recordLine('gamma')}: record 'gamma' route /patterns/gamma is not a route ${STRUCTURE} produces — it is spelled /patterns/gamma.html there`,
    ]);
  });
});

describe('the graph', () => {
  it('a record requiring itself is a cycle of one; separate cycles are one finding each, in record order', async () => {
    const r = await withRecords([
      record('alpha', ['alpha'], ['gamma']),
      record('beta', ['delta']),
      record('gamma', ['beta'], ['alpha']),
      record('delta', ['gamma']),
    ]);
    expect(findings(r.err)).toEqual([
      `${FAIL}:${recordLine('alpha')}: record 'alpha' requires itself — a cycle of one`,
      `${FAIL}:${recordLine('beta')}: records 'beta', 'gamma' and 'delta' require one another round a cycle — none of them can be read first; drop one requires edge`,
    ]);
  });

  it('a related neighbour that is undeclared is one finding and feeds no other check', async () => {
    const r = await withRecords([record('alpha', ['beta'], ['gamma', 'ghost']), PREREQ_RECORDS[1], PREREQ_RECORDS[2], PREREQ_RECORDS[3]]);
    expect(findings(r.err)).toEqual([`${FAIL}:${recordLine('alpha')}: record 'alpha' lists as related 'ghost', which no record declares`]);
  });

  it('a one-way related edge is one finding naming both; adding the reverse passes', async () => {
    let r = await withRecords([PREREQ_RECORDS[0], PREREQ_RECORDS[1], record('gamma', ['alpha']), PREREQ_RECORDS[3]]);
    expect(findings(r.err)).toEqual([
      `${FAIL}:${recordLine('alpha')}: record 'alpha' lists 'gamma' as related, but 'gamma' does not list 'alpha' — related is listed both ways`,
    ]);
    r = await withRecords([PREREQ_RECORDS[0], PREREQ_RECORDS[1], record('gamma', ['alpha'], ['alpha']), PREREQ_RECORDS[3]]);
    expectPass(r);
  });

  it('a record listing itself as related is one finding, and naming itself reaches nothing', async () => {
    const r = await withRecords([...PREREQ_RECORDS, record('starting', [], ['starting'])]);
    expect(findings(r.err)).toEqual([
      `${FAIL}:${recordLine('starting')}: record 'starting' lists itself as related — a neighbour is another page`,
      `${FAIL}:${recordLine('starting')}: record 'starting' is an orphan — no other record requires it or lists it as related, and no learning path stages its route`,
    ]);
  });

  it('a record nothing names is an orphan unless a learning-path stage is its route', async () => {
    let r = await withRecords([...PREREQ_RECORDS, record('starting')]);
    expect(findings(r.err)).toEqual([
      `${FAIL}:${recordLine('starting')}: record 'starting' is an orphan — no other record requires it or lists it as related, and no learning path stages its route`,
    ]);
    sb.write(LEARNING_PATHS, json({ ...HEADER, profiles: [{ id: 'starting', stages: ['/themes/starting.html'] }, 3, { stages: 'x' }] }));
    r = await sb.run(spec);
    expectPass(r);
  });

  it('reads no stage from a learning-path file of the wrong shape, and names one that is not JSON', async () => {
    const graph = [...PREREQ_RECORDS, record('starting')];
    prereqTree(sb, graph);
    sb.write(LEARNING_PATHS, '[]\n');
    expectFail(await sb.run(spec), "record 'starting' is an orphan");
    sb.write(LEARNING_PATHS, json({ ...HEADER }));
    expectFail(await sb.run(spec), "record 'starting' is an orphan");
    sb.write(LEARNING_PATHS, 'not json\n');
    expectFail(await sb.run(spec), `[prerequisites] FAIL ${LEARNING_PATHS}: is not valid JSON`);
  });
});

describe('a finding about an edge points at the relations file that holds it', () => {
  /** The relations file behind a graph: one prerequisite record per requires edge, after one of another verb. */
  function relationsFor(records: readonly PrereqRecord[], skip: readonly string[] = []): string {
    const edges = records.flatMap((r) => r.requires.filter((b) => !skip.includes(`${r.id} ${b}`)).map((b) => ({ a: r.id, verb: 'prerequisite', b, note_a: '', note_b: '' })));
    const text = json({ ...HEADER, relations: [{ a: 'alpha', verb: 'combines-with', b: 'gamma', note_a: '', note_b: '' }, ...edges] });
    sb.write(RELATIONS, text);
    return text;
  }
  const edgeAt = (text: string, a: string, b: string): number => {
    const lines = text.split('\n');
    const i = lines.findIndex((l, n) => l.includes(`"a": "${a}"`) && lines[n + 1]?.includes('"prerequisite"') && lines[n + 2]?.includes(`"b": "${b}"`));
    return i; // the record opens on the line above its "a" key
  };

  it('a cycle: at its first edge, naming every edge line on it; a cycle the relations file does not hold stays at its record', async () => {
    const graph = [record('alpha', ['beta'], ['gamma']), record('beta', ['delta']), record('gamma', [], ['alpha']), record('delta', ['alpha'])];
    prereqTree(sb, graph);
    const text = relationsFor(graph);
    const lines = [edgeAt(text, 'alpha', 'beta'), edgeAt(text, 'beta', 'delta'), edgeAt(text, 'delta', 'alpha')];
    let r = await sb.run(spec);
    expect(r.err.split('\n')).toEqual([
      `[prerequisites] FAIL ${RELATIONS}:${lines[0] as number}: records 'alpha', 'beta' and 'delta' require one another round a cycle — none of them can be read first; unlink one of its prerequisite edges, at lines ${lines.join(', ').replace(/, (\d+)$/, ' and $1')}`,
    ]);

    relationsFor(graph, ['delta alpha']);
    r = await sb.run(spec);
    expect(r.err.split('\n')).toEqual([
      `${FAIL}:${recordLine('alpha')}: records 'alpha', 'beta' and 'delta' require one another round a cycle — none of them can be read first; drop one requires edge`,
    ]);
  });

  it('a cycle of one the relations file holds names its one edge', async () => {
    const graph = [record('alpha', ['alpha', 'beta'], ['gamma']), record('beta', ['delta']), record('gamma', [], ['alpha']), record('delta')];
    prereqTree(sb, graph);
    const text = relationsFor(graph);
    const r = await sb.run(spec);
    expect(r.err).toBe(
      `[prerequisites] FAIL ${RELATIONS}:${edgeAt(text, 'alpha', 'alpha')}: record 'alpha' requires itself — a cycle of one; unlink its prerequisite edge, at line ${edgeAt(text, 'alpha', 'alpha')}`,
    );
  });

  it('a stable page requiring a draft one, and an orphan, sit at the edge; with the edge gone from the file they sit at the record', async () => {
    const graph = [record('alpha', ['beta'], ['gamma']), record('beta', ['delta']), record('gamma', [], ['alpha']), record('delta'), record('starting', ['alpha'])];
    prereqTree(sb, graph, { beta: 'draft' });
    const text = relationsFor(graph);
    let r = await sb.run(spec);
    expect(r.err.split('\n')).toEqual([
      `[prerequisites] FAIL ${RELATIONS}:${edgeAt(text, 'starting', 'alpha')}: record 'starting' is an orphan — no other record requires it or lists it as related, and no learning path stages its route`,
      `[prerequisites] FAIL ${RELATIONS}:${edgeAt(text, 'alpha', 'beta')}: record 'alpha' is stable but requires 'beta', whose page is a draft — a stable page never requires a draft one`,
    ]);

    relationsFor(graph, ['starting alpha', 'alpha beta']);
    r = await sb.run(spec);
    expect(r.err.split('\n')).toEqual([
      `${FAIL}:${recordLine('starting')}: record 'starting' is an orphan — no other record requires it or lists it as related, and no learning path stages its route`,
      `${FAIL}:${recordLine('alpha')}: record 'alpha' is stable but requires 'beta', whose page is a draft — a stable page never requires a draft one`,
    ]);
  });

  it('sourceEdges reads prerequisite records only, the first of two alike, and nothing from a file it cannot read', () => {
    expect(sourceEdges(sb.dir)).toEqual(new Map());
    sb.write(RELATIONS, 'not json\n');
    expect(sourceEdges(sb.dir)).toEqual(new Map());
    sb.write(RELATIONS, '[]\n');
    expect(sourceEdges(sb.dir)).toEqual(new Map());
    sb.write(RELATIONS, json({ ...HEADER }));
    expect(sourceEdges(sb.dir)).toEqual(new Map());
    const text = json({
      ...HEADER,
      relations: [
        { a: 'x', verb: 'prerequisite', b: 'y' },
        { a: 'x', verb: 'combines-with', b: 'z' },
        { a: 'x', verb: 'prerequisite', b: 'y' },
        { a: 'x', verb: 'prerequisite' },
        7,
        { a: 'x', verb: 'prerequisite', b: 'z' },
      ],
    });
    sb.write(RELATIONS, text);
    const at = (n: number): number => lineOf(text, '"a": "x"', n) - 1;
    expect(sourceEdges(sb.dir)).toEqual(new Map([['x', new Map([['y', at(1)], ['z', at(5)]])]]));
  });

  it('lineList says one line, two, and more', () => {
    expect(lineList([4])).toBe('line 4');
    expect(lineList([4, 9])).toBe('lines 4 and 9');
    expect(lineList([4, 9, 12])).toBe('lines 4, 9 and 12');
  });
});

describe('the allowlist', () => {
  const orphan = [...PREREQ_RECORDS, record('starting')];
  const entry = (match: string, reason = 'Theme pages are reached from their hub.'): Record<string, string> => ({ name: 'themes', match, reason });

  it('excuses an orphan whose route an entry matches, and counts the entries applied in the summary', async () => {
    prereqTree(sb, orphan);
    sb.write(ALLOWLIST, json({ ...HEADER, entries: [entry('/themes/*.html')] }));
    let r = await sb.run(spec);
    expectPass(r);
    expect(r.out.endsWith('every record reached (1 allowlist entry applied)')).toBe(true);

    // delta, no longer required by beta, is a second orphan under a second entry.
    prereqTree(sb, [PREREQ_RECORDS[0], record('beta'), PREREQ_RECORDS[2], PREREQ_RECORDS[3], record('starting')]);
    sb.write(ALLOWLIST, json({ ...HEADER, entries: [entry('/themes/*.html'), { ...entry('/hazards/*.html'), name: 'hazards' }] }));
    r = await sb.run(spec);
    expectPass(r);
    expect(r.out.endsWith('every record reached (2 allowlist entries applied)')).toBe(true);
  });

  it('names an entry that excuses nothing, and withholds a malformed list whole', async () => {
    prereqTree(sb);
    sb.write(ALLOWLIST, json({ ...HEADER, entries: [entry('/themes/*.html')] }));
    let r = await sb.run(spec);
    expect(findings(r.err)).toEqual([`[prerequisites] FAIL ${ALLOWLIST}: entry "themes" excuses no record — delete it`]);

    prereqTree(sb, orphan);
    sb.write(ALLOWLIST, json({ ...HEADER, entries: [entry('/themes/*.html', ' ')] }));
    r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      `[prerequisites] FAIL ${ALLOWLIST}: entry "themes" has an empty reason — say why the records it matches need no edge or stage to reach them`,
      `${FAIL}:${recordLine('starting')}: record 'starting' is an orphan — no other record requires it or lists it as related, and no learning path stages its route`,
    ]);
  });
});

describe('the helpers', () => {
  it('cycles finds every strongly connected set, in the order of the ids', () => {
    const req = new Map<string, string[]>([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a', 'd']],
      ['d', ['d']],
      ['e', ['a']],
    ]);
    expect(cycles(['e', 'a', 'b', 'c', 'd', 'f'], req)).toEqual([['a', 'b', 'c'], ['d']]);
    expect(cycles(['x'], new Map())).toEqual([]);
  });

  it('hasHeader wants the three keys first, in order, well typed', () => {
    expect(hasHeader({ ...HEADER, records: [] })).toBe(true);
    expect(hasHeader({ records: [], ...HEADER })).toBe(false);
  });

  it('the fixture record for a page not in the tree still has a route', () => {
    const r: PrereqRecord = record('ghost');
    expect(r['route']).toBe('/patterns/ghost.html');
    expect(() => rowOf('ghost')).toThrow('no fixture page ghost');
    expect(learningPageText('alpha', null)).not.toContain('status:');
  });
});

describe('the real tree', () => {
  interface Rel {
    relations: { a: string; verb: string; b: string }[];
  }
  interface Pre {
    records: { id: string; requires: string[]; related: string[] }[];
  }
  const read = <T>(rel: string): T => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8')) as T;

  it('passes, counting what a plain walk of the file counts', async () => {
    const pre = read<Pre>(PREREQUISITES);
    const edges = pre.records.reduce((n, r) => n + r.requires.length, 0);
    const pairs = new Set(pre.records.flatMap((r) => r.related.map((b) => (r.id < b ? `${r.id} ${b}` : `${b} ${r.id}`)))).size;
    const r = await capture(spec, [], REPO_ROOT);
    expectPass(r);
    expect(r.err).toBe('');
    expect(r.out.startsWith(`[prerequisites] ${pre.records.length} records: ${edges} requires edges, no cycle; ${pairs} related pairs`)).toBe(true);
  });

  it('holds the same requires and related edges as the relations file, both ways (root-C3)', () => {
    const rel = read<Rel>('docs/data/relations.json');
    const pre = read<Pre>(PREREQUISITES);
    const symmetric = new Set(['combines-with', 'alternative-to', 'often-confused-with']);
    const theirs = new Set(
      rel.relations.flatMap((e) =>
        e.verb === 'prerequisite' ? [`${e.a} requires ${e.b}`] : symmetric.has(e.verb) ? [`${e.a} related ${e.b}`, `${e.b} related ${e.a}`] : [],
      ),
    );
    // A list, not a set: a neighbour listed twice (two symmetric verbs on one pair) must show here.
    const ours = pre.records.flatMap((r) => [...r.requires.map((b) => `${r.id} requires ${b}`), ...r.related.map((b) => `${r.id} related ${b}`)]);
    expect(ours.filter((x, i) => ours.indexOf(x) !== i)).toEqual([]);
    expect(ours.filter((x) => !theirs.has(x))).toEqual([]);
    expect([...theirs].filter((x) => !ours.includes(x))).toEqual([]);
    expect(ours).toHaveLength(theirs.size);
  });
});
