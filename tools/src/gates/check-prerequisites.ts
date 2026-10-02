/**
 * Hold the prerequisite graph to its rules before anything is built from it
 * (spec: kb.learning.prerequisites, graph-gate).
 *
 * `docs/data/prerequisites.json` opens with its source header, then `records`:
 * one `{ id, label, definition, route, requires, related }` per page. In this
 * KB gen-prerequisites writes it from relations.json, so most of what is held
 * here holds by construction — the gate still reads the file as if a person
 * had written it, because a generator bug is exactly what it exists to catch.
 * Each finding sits at the line of the record it is about — except a finding
 * about the edges themselves (a cycle, a stable page requiring a draft, an
 * orphan), which sits at the line of the edge in docs/data/relations.json
 * whenever that file holds it, since that is the file an author changes and
 * this one is generated (data-C6, source-file-C8):
 *
 *   header     the file opens with version, updated and note; without them,
 *              or unparseable, it is one finding and nothing else is judged
 *              (prerequisites-C1)
 *   closed     a record holds exactly the six keys, none missing; `id` is
 *              kebab-case and unique; no id is listed twice in one record's
 *              `requires` or `related` (prerequisites-C1)
 *   acyclic    `requires` holds no cycle, a record requiring itself included;
 *              each strongly connected set of records is ONE finding naming
 *              every id in it (prerequisites-C2)
 *   resolved   every id in `requires` and `related` is declared, and every
 *              `route` is one the structure file produces (prerequisites-C3).
 *              An edge to an undeclared id feeds no other check.
 *   reciprocal `related` is listed both ways; each missing direction is one
 *              finding naming both (prerequisites-C4). A record listing
 *              itself as related is a finding too: a neighbour is another page.
 *              The summary counts each pair of pages once.
 *   reached    another record names it in `requires` or `related`, or a
 *              learning-path stage is its route (prerequisites-C5); with no
 *              learning-path file only edges count. A record the gate's own
 *              list excuses (docs/data/allow/prerequisites.json, matched
 *              against its route) is not an orphan; an entry that excuses
 *              nothing is a finding.
 *   maturity   no page whose status is `stable` requires a page whose status
 *              is `draft`; each such edge is one finding naming both
 *              (prerequisites-C11, learning-C3). The status is the one the
 *              page at the record's route declares; a page that declares none,
 *              or is not on disk, is not judged.
 *
 * One run reports every finding, and the gate never repairs: `--fix` is
 * misuse, exit 2 (prerequisites-C6).
 *
 * Usage: check-prerequisites   (takes no arguments: the file is always read whole)
 */

import fs from 'node:fs';
import path from 'node:path';

import { Allowlist, readAllowlist } from '../lib/allowlist.js';
import { jsonLines, pointer, readDataJson } from '../lib/data-json.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { pageFacts, STRUCTURE, structureRows } from '../lib/page-refs.js';
import { REQUIRES_VERB } from '../gen/gen-prerequisites.js';
import { nearMiss, producedRoutes } from './check-learning-paths.js';
import { RELATIONS } from './check-relations.js';

export const PREREQUISITES = 'docs/data/prerequisites.json';
export const LEARNING_PATHS = 'docs/data/learning-paths.json';
export const ALLOWLIST = 'docs/data/allow/prerequisites.json';
export const HEADER_KEYS: readonly string[] = ['version', 'updated', 'note'];
export const FILE_KEYS: readonly string[] = [...HEADER_KEYS, 'records'];
export const RECORD_KEYS: readonly string[] = ['id', 'label', 'definition', 'route', 'requires', 'related'];
export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';
const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Does the parsed file open with its source header, in order and well typed? */
export function hasHeader(file: Obj): boolean {
  return (
    Object.keys(file).slice(0, HEADER_KEYS.length).join(' ') === HEADER_KEYS.join(' ') &&
    Number.isInteger(file['version']) &&
    typeof file['updated'] === 'string' &&
    DATE.test(file['updated']) &&
    isText(file['note'])
  );
}

/**
 * The sets of ids that require one another round a cycle: every strongly
 * connected set of two or more, and every id that requires itself, each in
 * the order of `ids`. Tarjan's algorithm, over declared ids only.
 */
export function cycles(ids: readonly string[], requires: ReadonlyMap<string, readonly string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const found: string[][] = [];
  const visit = (v: string): void => {
    index.set(v, index.size);
    low.set(v, index.get(v) as number);
    stack.push(v);
    onStack.add(v);
    for (const w of requires.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v) as number, low.get(w) as number));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v) as number, index.get(w) as number));
      }
    }
    if (low.get(v) !== index.get(v)) return;
    const set: string[] = [];
    for (let w = stack.pop() as string; ; w = stack.pop() as string) {
      onStack.delete(w);
      set.push(w);
      if (w === v) break;
    }
    if (set.length > 1 || (requires.get(v) ?? []).includes(v)) found.push(ids.filter((id) => set.includes(id)));
  };
  for (const id of ids) if (!index.has(id)) visit(id);
  const rank = (set: readonly string[]): number => ids.indexOf(set[0] as string);
  return found.sort((x, y) => rank(x) - rank(y));
}

/** Two or more ids for a sentence: `'a' and 'b'`, `'a', 'b' and 'c'`. A cycle of one has its own words. */
const quoted = (ids: readonly string[]): string => {
  const q = ids.map((id) => `'${id}'`);
  return `${q.slice(0, -1).join(', ')} and ${q.at(-1) as string}`;
};

/** Line numbers for a sentence: `line 4`, `lines 4 and 9`, `lines 4, 9 and 12`. */
export function lineList(lines: readonly number[]): string {
  if (lines.length === 1) return `line ${String(lines[0])}`;
  return `lines ${lines.slice(0, -1).join(', ')} and ${String(lines.at(-1))}`;
}

/**
 * Where the relations file writes each prerequisite edge: the line of its
 * record, by `a` then `b`. Empty when the file is missing or does not parse —
 * the relations gate names that — and a finding then stays at its record.
 */
export function sourceEdges(root: string): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  const abs = path.join(root, RELATIONS);
  if (!fs.existsSync(abs)) return out;
  const text = fs.readFileSync(abs, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return out;
  }
  const list = isObj(value) ? value['relations'] : undefined;
  if (!Array.isArray(list)) return out;
  const lines = jsonLines(text);
  (list as unknown[]).forEach((e, n) => {
    if (!isObj(e) || e['verb'] !== REQUIRES_VERB || !isText(e['a']) || !isText(e['b'])) return;
    const from = out.get(e['a']) ?? new Map<string, number>();
    if (!from.has(e['b'])) from.set(e['b'], lines.get(pointer('relations', n)) as number);
    out.set(e['a'], from);
  });
  return out;
}

interface Rec {
  readonly id: string;
  readonly line: number | undefined;
  /** `''` when the record has none worth checking; its own finding says why. */
  readonly route: string;
  readonly requires: readonly string[];
  readonly related: readonly string[];
}

export const spec: GateSpec = {
  name: 'prerequisites',
  usage: 'usage: check-prerequisites   (takes no arguments: the file is always read whole)',
  run(ctx: GateContext): string {
    const read = readDataJson(ctx, PREREQUISITES);
    if (read === 'missing') ctx.fail(PREREQUISITES, 'is missing — the prerequisite graph lives in it; run: make prerequisites');
    if (typeof read === 'string') return '';
    if (!isObj(read.value) || !hasHeader(read.value)) {
      ctx.fail(PREREQUISITES, `lacks its source header — it opens with ${HEADER_KEYS.join(', ')}: an integer, a year-month-day date and a note`, 1);
      return '';
    }
    const file = read.value;
    const lines = jsonLines(read.text);
    const at = (...seg: (string | number)[]): number | undefined => lines.get(pointer(...seg));
    const fail = (what: string, line: number | undefined): void => ctx.fail(PREREQUISITES, what, line);

    const structure = readDataJson(ctx, STRUCTURE);
    if (structure === 'missing') ctx.fail(STRUCTURE, 'is missing — every record route is checked against the routes it produces');
    const routes = typeof structure === 'string' ? null : producedRoutes(structure.value);
    if (typeof structure !== 'string' && routes === null) ctx.fail(STRUCTURE, 'has no areas list, so it produces no route');
    const paths = readDataJson(ctx, LEARNING_PATHS);
    const stages = new Set<string>();
    if (typeof paths !== 'string' && isObj(paths.value) && Array.isArray(paths.value['profiles'])) {
      for (const p of paths.value['profiles'] as unknown[]) {
        if (isObj(p) && isIdList(p['stages'])) for (const s of p['stages']) stages.add(s);
      }
    }
    const allow = fs.existsSync(path.join(ctx.root, ALLOWLIST))
      ? readAllowlist(ctx, ALLOWLIST, {
          missing: '',
          emptyReason: 'has an empty reason — say why the records it matches need no edge or stage to reach them',
        })
      : [];
    const excused = new Allowlist(allow ?? []);

    for (const k of Object.keys(file)) {
      if (!FILE_KEYS.includes(k)) fail(`unknown key "${k}" — the file holds ${FILE_KEYS.join(', ')}`, at(k));
    }
    const list = file['records'];
    if (!Array.isArray(list)) {
      fail('has no records list', at('records'));
      return '';
    }

    // ---- each record, closed and well typed ----
    const recs = new Map<string, Rec>();
    (list as unknown[]).forEach((r, n) => {
      const line = at('records', n);
      if (!isObj(r)) {
        fail(`records[${n}] is not an object`, line);
        return;
      }
      const id = isText(r['id']) ? r['id'] : undefined;
      const who = `record '${id ?? `records[${n}]`}'`;
      for (const k of Object.keys(r)) {
        if (!RECORD_KEYS.includes(k)) fail(`${who}: unknown key "${k}" — a record holds ${RECORD_KEYS.join(', ')}`, at('records', n, k));
      }
      for (const k of RECORD_KEYS) if (!(k in r)) fail(`${who} has no ${k}`, line);
      if ('id' in r && (id === undefined || !KEBAB.test(id))) fail(`${who} id ${JSON.stringify(r['id'])} is not kebab-case`, line);
      for (const k of ['label', 'definition', 'route']) if (k in r && !isText(r[k])) fail(`${who} ${k} is not text`, at('records', n, k));
      for (const k of ['requires', 'related']) if (k in r && !isIdList(r[k])) fail(`${who} ${k} is not a list of ids`, at('records', n, k));
      for (const [k, verb] of [['requires', 'requires'], ['related', 'lists as related']] as const) {
        const ids = isIdList(r[k]) ? r[k] : [];
        for (const twice of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) {
          fail(`${who} ${verb} '${twice}' twice — a page is listed once`, at('records', n, k));
        }
      }
      if (id === undefined) return;
      const prior = recs.get(id);
      if (prior !== undefined) {
        fail(`${who} is declared twice — first at line ${String(prior.line)}`, line);
        return;
      }
      recs.set(id, {
        id,
        line,
        route: isText(r['route']) ? r['route'] : '',
        requires: isIdList(r['requires']) ? [...new Set(r['requires'])] : [],
        related: isIdList(r['related']) ? [...new Set(r['related'])] : [],
      });
    });
    const ids = [...recs.keys()];

    // ---- resolved: ids declared, routes produced; an unresolved edge feeds nothing below ----
    const requires = new Map<string, string[]>();
    const related = new Map<string, string[]>();
    for (const r of recs.values()) {
      if (r.route !== '' && routes !== null && !routes.has(r.route)) {
        const meant = nearMiss(r.route, routes.keys());
        fail(
          `record '${r.id}' route ${r.route} is not a route ${STRUCTURE} produces${meant === undefined ? '' : ` — it is spelled ${meant} there`}`,
          r.line,
        );
      }
      for (const [list, verb, into] of [
        [r.requires, 'requires', requires],
        [r.related, 'lists as related', related],
      ] as const) {
        const ok: string[] = [];
        for (const to of list) {
          if (!recs.has(to)) fail(`record '${r.id}' ${verb} '${to}', which no record declares`, r.line);
          else if (to === r.id && into === related) fail(`record '${r.id}' lists itself as related — a neighbour is another page`, r.line);
          else ok.push(to);
        }
        into.set(r.id, ok);
      }
    }

    // Findings about edges point at the relations file when it holds them.
    const source = sourceEdges(ctx.root);
    const edgeLine = (from: string, to: string): number | undefined => source.get(from)?.get(to);

    // ---- acyclic ----
    for (const set of cycles(ids, requires)) {
      const inSet = new Set(set);
      const onIt = set.flatMap((from) => (requires.get(from) as string[]).filter((to) => inSet.has(to)).map((to) => edgeLine(from, to)));
      const what =
        set.length === 1
          ? `record '${set[0] as string}' requires itself — a cycle of one`
          : `records ${quoted(set)} require one another round a cycle — none of them can be read first`;
      if (onIt.some((l) => l === undefined)) {
        fail(`${what}${set.length === 1 ? '' : '; drop one requires edge'}`, (recs.get(set[0] as string) as Rec).line);
        continue;
      }
      const lines = (onIt as number[]).sort((x, y) => x - y);
      const which = lines.length === 1 ? 'its prerequisite edge' : 'one of its prerequisite edges';
      ctx.fail(RELATIONS, `${what}; unlink ${which}, at ${lineList(lines)}`, lines[0]);
    }

    // ---- reciprocal ----
    const pairs = new Set<string>();
    for (const r of recs.values()) {
      for (const to of related.get(r.id) as string[]) {
        if ((related.get(to) as string[]).includes(r.id)) pairs.add([r.id, to].sort().join(' '));
        else fail(`record '${r.id}' lists '${to}' as related, but '${to}' does not list '${r.id}' — related is listed both ways`, r.line);
      }
    }

    // ---- reached ----
    const named = new Set<string>();
    for (const [from, tos] of [...requires, ...related]) for (const to of tos) if (to !== from) named.add(to);
    for (const r of recs.values()) {
      if (named.has(r.id) || stages.has(r.route) || excused.excuses(r.route)) continue;
      const what = `record '${r.id}' is an orphan — no other record requires it or lists it as related, and no learning path stages its route`;
      // An orphan is only ever a page that requires: its first such edge is where its edges are written.
      const first = Math.min(...(source.get(r.id)?.values() ?? []));
      if (Number.isFinite(first)) ctx.fail(RELATIONS, what, first);
      else fail(what, r.line);
    }
    if (allow !== null) for (const e of excused.unused()) ctx.fail(ALLOWLIST, `entry "${e.name}" excuses no record — delete it`);

    // ---- maturity: a stable page never requires a draft one ----
    const onGraph = new Set([...recs.values()].map((r) => r.route));
    const sr = typeof structure === 'string' ? null : structureRows(structure.value);
    const rows = (sr?.rows ?? []).filter((row) => onGraph.has(row.route));
    const facts = pageFacts(ctx.root, rows);
    const statusOf = new Map(rows.map((row) => [row.route, facts.get(row.source)?.['status']]));
    const status = (id: string): string | undefined => statusOf.get((recs.get(id) as Rec).route);
    let edges = 0;
    for (const [from, tos] of requires) {
      for (const to of tos) {
        edges += 1;
        if (status(from) === 'stable' && status(to) === 'draft') {
          const what = `record '${from}' is stable but requires '${to}', whose page is a draft — a stable page never requires a draft one`;
          const line = edgeLine(from, to);
          if (line === undefined) fail(what, (recs.get(from) as Rec).line);
          else ctx.fail(RELATIONS, what, line);
        }
      }
    }

    const applied = excused.applied;
    return (
      `[prerequisites] ${String(recs.size)} records: ${String(edges)} requires edges, no cycle; ` +
      `${String(pairs.size)} related pairs, each listed both ways; every id and route resolved, every record reached` +
      `${applied > 0 ? ` (${String(applied)} allowlist ${applied === 1 ? 'entry' : 'entries'} applied)` : ''}`
    );
  },
};

main(spec, import.meta.url);
