/**
 * The docs map's list of pages, rendered from the structure file (spec:
 * kb.content.docs-map, map-page; kb.data.structure feeds it).
 *
 * `docs/README.md` is a hand-written page — its intro and the rows for the
 * pages no area lists, such as the trap inbox — around one marked block this
 * generator owns. The block is a table with one row per area that lists
 * pages, in the structure file's reading order: the area's place in its
 * parents, the clause its hub gives for when to read it, then a link to each
 * page it lists, by label, in its order. The table sits whole inside the
 * markers, header row included, because a marker line between two rows would
 * end the table.
 *
 * Only pages under the page tree are rows' links: a row naming a source
 * elsewhere (a page a generator writes at build time) is not the map's to list.
 *
 * `make gen` runs it with every other generator; `make map` runs it alone.
 *
 * Usage: gen-map            (rewrites the block in docs/README.md)
 *        gen-map --check    (exit 1 if the block is stale)
 */

import fs from 'node:fs';
import path from 'node:path';

import { blockStamp, emit, spliceFile, type Block } from '../lib/generated.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { escapeMdText } from '../lib/md-text.js';
import { cell } from './gen-gates.js';

export const NAME = 'map-fresh';
export const SRC = 'docs/data/site-structure.json';
export const GENERATOR = 'tools/src/gen/gen-map.ts';
export const MAP = 'docs/README.md';
/** The marked block this generator owns in the map. */
export const BLOCK = 'docs-map';
/** The repair command every STALE line names, and the row's `fix`. */
export const FIX = 'make map';

const PAGE_TREE = 'docs/';

export interface Row {
  label?: unknown;
  source?: unknown;
}

export interface Area {
  id: string;
  label?: unknown;
  nestUnder?: unknown;
  hub?: { description?: unknown };
  pages?: Row[];
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** An area's place among its parents, outermost first: `Patterns › Network › Resilience`. */
export function trail(area: Area, byId: ReadonlyMap<string, Area>): string {
  const names: string[] = [];
  const seen = new Set<string>();
  for (let a: Area | undefined = area; a !== undefined && !seen.has(a.id); a = byId.get(text(a.nestUnder))) {
    seen.add(a.id);
    names.unshift(text(a.label) === '' ? a.id : text(a.label));
  }
  return names.join(' › ');
}

/** The block's lines: its stamp, then the table of areas and their pages. */
export function renderMap(areas: readonly Area[]): string[] {
  const byId = new Map(areas.map((a) => [a.id, a]));
  const lines = [blockStamp(GENERATOR, SRC, 'table'), '| Area | Read it for | Pages |', '| --- | --- | --- |'];
  for (const area of areas) {
    const rows = (area.pages ?? []).filter((r) => text(r.source).startsWith(PAGE_TREE));
    if (rows.length === 0) continue;
    const links = rows.map((r) => {
      const source = text(r.source);
      const label = text(r.label) === '' ? path.posix.basename(source, '.md') : text(r.label);
      return `[${escapeMdText(label)}](${path.posix.relative(PAGE_TREE, source)})`;
    });
    lines.push(`| ${escapeMdText(trail(area, byId))} | ${cell(text(area.hub?.description))} | ${links.join(' · ')} |`);
  }
  return lines;
}

/** The structure file's areas, or null with a finding when it cannot be read. */
export function readAreas(ctx: GateContext): Area[] | null {
  const abs = path.join(ctx.root, SRC);
  if (!fs.existsSync(abs)) {
    ctx.fail(SRC, 'is missing — the map lists the pages it publishes');
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    ctx.fail(SRC, 'is not valid JSON');
    return null;
  }
  const areas = (data as { areas?: unknown }).areas;
  if (!Array.isArray(areas)) {
    ctx.fail(SRC, 'has no areas list');
    return null;
  }
  return (areas as Area[]).filter((a) => typeof a.id === 'string');
}

export const spec: GateSpec = {
  name: NAME,
  usage: 'usage: gen-map [--check]   (--check exits 1 if the map block in docs/README.md is stale)',
  flags: ['--check'],
  run(ctx: GateContext): string {
    const areas = readAreas(ctx);
    if (areas === null) return '';
    const block: Block = { name: BLOCK, lines: renderMap(areas) };
    const wanted = spliceFile(ctx, MAP, [block]);
    if (wanted === null) return '';
    const what = emit(ctx, { out: MAP, wanted, fixCommand: FIX });
    if (ctx.flags.has('--check')) return `[${NAME}] ${MAP} is in sync with ${SRC}`;
    // The shape every generator's summary shares: `wrote <n> of <m> …`.
    return `[${NAME}] wrote ${what === 'wrote' ? '1' : '0'} of 1 map block in ${MAP} (${String(block.lines.length - 3)} areas from ${SRC})`;
  },
};

main(spec, import.meta.url);
