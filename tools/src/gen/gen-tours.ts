/**
 * Every theme's tour block and every member page's fluency block, spliced from
 * `docs/data/learning-paths.json` (dialect D-81, D-82; spec:
 * kb.generation.marked-blocks), registered as tours-fresh and run by `make gen`.
 *
 * It wraps the pure renderers in tools/src/lib/render-tours.ts, over two data
 * files and each page's title.
 *
 *   tour      on the page whose slug is a profile's id — the theme the tour
 *             belongs to — and on any page holding a tour marker
 *   fluency   on every page a profile stages, and on any page holding a
 *             fluency marker; a page no profile stages gets an empty block
 *
 * A profile the renderer cannot draw — no id or stages list, an id that names
 * no published page, a stage that is no published route — or a tour marker on
 * a page no profile is named after, is
 * a finding against the learning-path file naming its gate; nothing is
 * written from a file holding one.
 *
 * Usage: gen-tours            (splices every page's tour and fluency blocks)
 *        gen-tours --check    (exit 1 if any of them is stale)
 */

import { needDataObject } from '../lib/data-json.js';
import type { Block, Emitted } from '../lib/generated.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { pageFacts, pageRefs, STRUCTURE, structureRows } from '../lib/page-refs.js';
import { FLUENCY_BLOCK, LEARNING_PATHS_SRC, renderFluency, renderTour, TOUR_BLOCK, type LearningPaths } from '../lib/render-tours.js';
import { holdsMarker, writePages } from './blocks.js';

/** The repair a STALE line names, shared with the other block generator. */
export { FIX } from './blocks.js';

export const LEARNING_PATHS = LEARNING_PATHS_SRC;
export const NAME = 'tours-fresh';
/** The gate that says what is wrong with a profile this generator cannot draw. */
export const PATHS_GATE = 'make gate G=check-learning-paths';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';

export const spec: GateSpec = {
  name: NAME,
  usage: 'usage: gen-tours [--check]   (--check exits 1 if any tour or fluency block is stale)',
  flags: ['--check'],
  run(ctx: GateContext): string {
    const why = 'every tour and fluency block is rendered from it';
    const lp = needDataObject(ctx, LEARNING_PATHS, why);
    const structure = needDataObject(ctx, STRUCTURE, why);
    if (lp === null || structure === null) return '';
    const sr = structureRows(structure);
    if (sr === null) ctx.fail(STRUCTURE, 'has no areas list, so no page is published');
    const profiles = lp['profiles'];
    if (!Array.isArray(profiles)) ctx.fail(LEARNING_PATHS, 'has no profiles list');
    if (lp['notes'] !== undefined && !isObj(lp['notes'])) ctx.fail(LEARNING_PATHS, 'notes is not an object keyed by route');
    if (sr === null || !Array.isArray(profiles) || ctx.findings > 0) return '';

    // Every profile drawable before any page is rendered: the renderers throw on the rest.
    const routes = new Set(sr.rows.map((r) => r.route));
    const slugs = new Set(sr.rows.map((r) => r.slug));
    const ids = new Set<string>();
    const staged = new Set<string>();
    (profiles as unknown[]).forEach((p, n) => {
      const bad = (what: string): void => ctx.fail(LEARNING_PATHS, `profiles[${n}] ${what} — run: ${PATHS_GATE}`);
      if (!isObj(p) || !isText(p['id']) || !Array.isArray(p['stages'])) {
        bad('lacks an id or a stages list');
        return;
      }
      if (!slugs.has(p['id'])) bad(`is named ${p['id']}, which is no published page — its tour renders on that page`);
      ids.add(p['id']);
      for (const s of p['stages'] as unknown[]) {
        if (typeof s === 'string' && routes.has(s)) staged.add(s);
        else bad(`stages ${JSON.stringify(s)}, which is no published route`);
      }
    });
    for (const row of sr.rows) {
      if (!ids.has(row.slug) && holdsMarker(ctx.root, row.source, TOUR_BLOCK)) {
        ctx.fail(row.source, `holds a tour block, but no profile in ${LEARNING_PATHS} is named ${row.slug} — run: ${PATHS_GATE}`);
      }
    }
    if (ctx.findings > 0) return '';

    const refs = pageRefs(ctx, sr.rows, pageFacts(ctx.root, sr.rows));
    if (refs === null) return '';
    const file: LearningPaths = { ...(lp as unknown as LearningPaths), notes: (lp['notes'] ?? {}) as LearningPaths['notes'] };
    const pages: { source: string; blocks: Block[] }[] = [];
    for (const row of sr.rows) {
      const blocks: Block[] = [];
      if (ids.has(row.slug)) blocks.push({ name: TOUR_BLOCK, lines: renderTour(row.slug, file, { pages: refs.byRoute }) });
      if (staged.has(row.route) || holdsMarker(ctx.root, row.source, FLUENCY_BLOCK)) {
        blocks.push({ name: FLUENCY_BLOCK, lines: renderFluency(row.route, file, { pages: refs.byRoute }) });
      }
      if (blocks.length > 0) pages.push({ source: row.source, blocks });
    }

    const results: Emitted[] = writePages(ctx, pages);
    if (ctx.flags.has('--check')) return `[${NAME}] ${String(results.length)} pages' tour and fluency blocks are in sync with ${LEARNING_PATHS}`;
    const wrote = results.filter((r) => r === 'wrote').length;
    return `[${NAME}] wrote ${String(wrote)} of ${String(results.length)} pages' tour and fluency blocks from ${LEARNING_PATHS}`;
  },
};

main(spec, import.meta.url);
