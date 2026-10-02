/**
 * Hold each theme's tour to the prerequisite edges between the pages it walks
 * (spec: kb.learning.prerequisites; the order a reader meets pages in).
 *
 * `docs/data/learning-paths.json` holds one profile per theme, whose `stages`
 * are the routes its tour walks in order. `docs/data/relations.json` holds the
 * `prerequisite` edges: a record `{ a, verb: "prerequisite", b }` reads "a
 * requires b", the same direction gen-prerequisites writes into `requires`.
 * Read from relations.json rather than the generated prerequisites file, so a
 * stale generated file cannot hide a violation.
 *
 * For every profile and every edge whose two pages are both stages of that
 * profile, the required page must come earlier in the list. Each page that
 * comes before its own prerequisite is one finding at the line of its stage,
 * naming the theme, both pages and their 1-based positions. An edge with a page
 * the structure file does not publish, or with a page one end of which is not a
 * stage, is not judged here: the relations and learning-paths gates own those.
 *
 * The gate never repairs: `--fix` is misuse, exit 2. Fix a finding by moving
 * the prerequisite's stage above the page in learning-paths.json, keeping its
 * note with it.
 *
 * Usage: check-tour-order   (takes no arguments: both files are always read whole)
 */

import { jsonLines, needDataObject, pointer, readDataJson } from '../lib/data-json.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { STRUCTURE, structureRows } from '../lib/page-refs.js';
import { RELATIONS } from './check-relations.js';
import { LEARNING_PATHS } from './check-learning-paths.js';

/** The verb whose record `a` requires `b`. */
export const REQUIRES = 'prerequisite';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';

export const spec: GateSpec = {
  name: 'tour-order',
  usage: 'usage: check-tour-order   (takes no arguments: both files are always read whole)',
  run(ctx: GateContext): string {
    const lp = readDataJson(ctx, LEARNING_PATHS);
    if (lp === 'missing') return `[tour-order] no ${LEARNING_PATHS}: no tour to order`;
    const rel = needDataObject(ctx, RELATIONS, 'every tour is held to its prerequisite edges');
    const structure = needDataObject(ctx, STRUCTURE, 'it maps a page to its route');
    if (typeof lp === 'string' || rel === null || structure === null) return '';
    if (!isObj(lp.value) || !Array.isArray(lp.value['profiles'])) {
      ctx.fail(LEARNING_PATHS, 'has no profiles list');
      return '';
    }
    const rows = structureRows(structure);
    if (rows === null || !Array.isArray(rel['relations'])) {
      ctx.fail(rows === null ? STRUCTURE : RELATIONS, rows === null ? 'has no areas list' : 'has no relations list');
      return '';
    }
    const routeOf = new Map(rows.rows.map((r) => [r.slug, r.route]));
    const edges = (rel['relations'] as unknown[]).flatMap((e) =>
      isObj(e) && e['verb'] === REQUIRES && isText(e['a']) && isText(e['b']) && e['a'] !== e['b'] ? [{ a: e['a'], b: e['b'] }] : [],
    );
    const lines = jsonLines(lp.text);

    let profiles = 0;
    let judged = 0;
    (lp.value['profiles'] as unknown[]).forEach((p, n) => {
      if (!isObj(p) || !isText(p['id']) || !Array.isArray(p['stages'])) return;
      profiles += 1;
      const stages = p['stages'] as unknown[];
      const found: { a: string; b: string; at: number; need: number }[] = [];
      for (const { a, b } of edges) {
        const ra = routeOf.get(a);
        const rb = routeOf.get(b);
        const at = ra === undefined ? -1 : stages.indexOf(ra);
        const need = rb === undefined ? -1 : stages.indexOf(rb);
        if (at < 0 || need < 0) continue;
        judged += 1;
        if (need > at) found.push({ a, b, at, need });
      }
      // Stage order, then the prerequisite's, so two runs print alike.
      for (const f of found.sort((x, y) => x.at - y.at || x.need - y.need)) {
        ctx.fail(
          LEARNING_PATHS,
          `theme '${p['id']}': ${f.a} (stage ${f.at + 1}) comes before its prerequisite ${f.b} (stage ${f.need + 1}) — move ${f.b} above ${f.a}`,
          lines.get(pointer('profiles', n, 'stages', f.at)),
        );
      }
    });
    return `[tour-order] ${profiles} tour(s): every page follows its prerequisites (${judged} prerequisite pair(s) inside a tour)`;
  },
};

main(spec, import.meta.url);
