/**
 * Every page's relationships block, spliced from `docs/data/relations.json`
 * (spec: kb.generation.marked-blocks), registered as relations-fresh and run
 * by `make gen`.
 *
 * It wraps the pure renderer in tools/src/lib/render-relations.ts, over three
 * data files and each page's title.
 *
 *   verbs     content-model.json's closed verbs: each one's label and
 *             inverse, a symmetric verb being its own; `relations.order`
 *             lists them in the order a page's groups appear
 *   pages     site-structure.json's rows, each titled by its own frontmatter
 *   blocks    every page that holds a side of an edge, or either marker
 *
 * An edge the renderer cannot draw — an end or a note missing, a page or a
 * verb it does not know — is a finding against the relations file naming the
 * relations gate, which says more; nothing is written from a file holding
 * one.
 *
 * Usage: gen-relations            (splices every page's block)
 *        gen-relations --check    (exit 1 if any page's block is stale)
 */

import { needDataObject } from '../lib/data-json.js';
import type { Emitted } from '../lib/generated.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { pageFacts, pageRefs, STRUCTURE, structureRows } from '../lib/page-refs.js';
import { BLOCK, RELATIONS_SRC, renderRelations, type RelationRecord, type RelationsFile, type Verbs } from '../lib/render-relations.js';
import { verbTable } from '../gates/check-relations.js';
import { holdsMarker, writePages } from './blocks.js';

/** The repair a STALE line names, shared with the other block generator. */
export { FIX } from './blocks.js';

export const RELATIONS = RELATIONS_SRC;
export const CONTENT_MODEL = 'docs/data/content-model.json';
export const NAME = 'relations-fresh';
/** The gate that says what is wrong with an edge this generator cannot draw. */
export const RELATIONS_GATE = 'make gate G=check-relations';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';

/**
 * The renderer's verb table and group order, from the content model, or why
 * not. A verb whose inverse is itself is symmetric.
 */
export function renderVerbs(model: unknown): { verbs: Verbs; relOrder: string[] } | string {
  const table = verbTable(model);
  if (typeof table === 'string') return table;
  const verbs: Record<string, { label: string; inverse: string; symmetric: boolean }> = {};
  for (const v of table.byId.values()) verbs[v.id] = { label: v.label, inverse: v.inverse, symmetric: v.id === v.inverse };
  const order = ((model as Obj)['relations'] as Obj)['order'];
  if (!Array.isArray(order)) return 'has no relations.order list — the groups on a page follow it';
  const relOrder: string[] = [];
  for (const id of order as unknown[]) {
    const v = typeof id === 'string' ? verbs[id] : undefined;
    if (v === undefined) return `relations.order names ${JSON.stringify(id)}, which is no verb in relations.verbs`;
    relOrder.push(v.label);
  }
  return { verbs, relOrder };
}

/** Is this a record the renderer can draw: both ends, a verb and both notes? */
const drawable = (r: unknown): r is RelationRecord =>
  isObj(r) && isText(r['a']) && isText(r['b']) && isText(r['verb']) && typeof r['note_a'] === 'string' && typeof r['note_b'] === 'string';

export const spec: GateSpec = {
  name: NAME,
  usage: 'usage: gen-relations [--check]   (--check exits 1 if any page\'s relationships block is stale)',
  flags: ['--check'],
  run(ctx: GateContext): string {
    const why = 'every relationships block is rendered from it';
    const rel = needDataObject(ctx, RELATIONS, why);
    const model = needDataObject(ctx, CONTENT_MODEL, why);
    const structure = needDataObject(ctx, STRUCTURE, why);
    if (rel === null || model === null || structure === null) return '';

    const table = renderVerbs(model);
    if (typeof table === 'string') ctx.fail(CONTENT_MODEL, table);
    const sr = structureRows(structure);
    if (sr === null) ctx.fail(STRUCTURE, 'has no areas list, so no page is published');
    const records = rel['relations'];
    if (!Array.isArray(records)) ctx.fail(RELATIONS, 'has no relations list');
    if (typeof table === 'string' || sr === null || !Array.isArray(records)) return '';

    // Every edge drawable before any page is rendered: the renderer throws on the rest.
    const published = new Set(sr.rows.map((r) => r.slug));
    (records as unknown[]).forEach((r, n) => {
      const bad = (what: string): void => ctx.fail(RELATIONS, `relations[${n}] ${what} — run: ${RELATIONS_GATE}`);
      if (!drawable(r)) bad('lacks an end, its verb or a note');
      else if (table.verbs[r.verb] === undefined) bad(`"${r.verb}" is no verb in ${CONTENT_MODEL}`);
      else for (const s of new Set([r.a, r.b])) if (!published.has(s)) bad(`names ${s}, which is no published page`);
    });
    if (ctx.findings > 0) return '';

    const refs = pageRefs(ctx, sr.rows, pageFacts(ctx.root, sr.rows));
    if (refs === null) return '';
    const file = rel as unknown as RelationsFile;
    const withSides = new Set(file.relations.flatMap((r) => [r.a, r.b]));
    const pages = sr.rows
      .filter((row) => withSides.has(row.slug) || holdsMarker(ctx.root, row.source, BLOCK))
      .map((row) => ({
        source: row.source,
        blocks: [{ name: BLOCK, lines: renderRelations(row.slug, file, { verbs: table.verbs, relOrder: table.relOrder, pages: refs.bySlug }) }],
      }));

    const results: Emitted[] = writePages(ctx, pages);
    if (ctx.flags.has('--check')) return `[${NAME}] ${String(results.length)} pages' relationships blocks are in sync with ${RELATIONS}`;
    const wrote = results.filter((r) => r === 'wrote').length;
    return `[${NAME}] wrote ${String(wrote)} of ${String(results.length)} pages' relationships blocks from ${RELATIONS}`;
  },
};

main(spec, import.meta.url);
