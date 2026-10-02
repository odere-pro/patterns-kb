/**
 * The published pages, as the learning lane's generators and gates read them
 * (spec: kb.data.structure for the rows, kb.content.frontmatter for the facts
 * a page states about itself).
 *
 *   structureRows   every row of `site-structure.json`, in reading order,
 *                   with the area that lists it and that area's top ancestor
 *                   (`patterns` for every band); null when the file has no
 *                   areas list. A row without a slug, route and source is
 *                   skipped: the structure gate owns that finding.
 *   pageFacts       ONE batch read of the frontmatter of every row whose page
 *                   is on disk. A row whose file is missing is left out, so
 *                   each caller decides what absence means: a status nobody
 *                   declared skips a check, a title nobody declared stops a
 *                   generator.
 *   pageRefs        what a block renderer needs to link a page — slug, route,
 *                   source and title — by slug and by route. A page it cannot
 *                   title is a finding against that page, and the maps come
 *                   back null so nothing is rendered from half a tree.
 */

import fs from 'node:fs';
import path from 'node:path';

import { frontmatterMany } from './frontmatter.js';
import type { GateContext } from './gate.js';
import type { PageRef } from './render-relations.js';
import { fromPageTree } from './site-routes.js';

export const STRUCTURE = 'docs/data/site-structure.json';

export interface PageRow {
  readonly slug: string;
  readonly route: string;
  /** The markdown page, repo-relative: `docs/…/<slug>.md`. */
  readonly source: string;
  /** The id of the area that lists the row. */
  readonly area: string;
  /** That area's top ancestor, following `nestUnder`. */
  readonly top: string;
}

export interface StructureRows {
  readonly rows: readonly PageRow[];
  /** Every area's label, by id. */
  readonly labels: ReadonlyMap<string, string>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';

export function structureRows(structure: unknown): StructureRows | null {
  const areas = isObj(structure) ? structure['areas'] : undefined;
  if (!Array.isArray(areas)) return null;
  const parent = new Map<string, string>();
  const labels = new Map<string, string>();
  for (const a of areas as unknown[]) {
    if (!isObj(a) || !isText(a['id'])) continue;
    labels.set(a['id'], isText(a['label']) ? a['label'] : a['id']);
    if (isText(a['nestUnder'])) parent.set(a['id'], a['nestUnder']);
  }
  /** Up the `nestUnder` chain to an area with no parent; a loop stops where it closes. */
  const topOf = (id: string): string => {
    const seen = new Set<string>([id]);
    let at = id;
    for (let up = parent.get(at); up !== undefined && !seen.has(up); up = parent.get(at)) {
      seen.add(up);
      at = up;
    }
    return at;
  };
  const rows: PageRow[] = [];
  for (const a of areas as unknown[]) {
    if (!isObj(a) || !isText(a['id']) || !Array.isArray(a['pages'])) continue;
    const area = a['id'];
    for (const r of a['pages'] as unknown[]) {
      if (!isObj(r) || !isText(r['slug']) || !isText(r['route']) || !isText(r['source'])) continue;
      rows.push({ slug: r['slug'], route: r['route'], source: r['source'], area, top: topOf(area) });
    }
  }
  return { rows, labels };
}

/** Each on-disk page's frontmatter, by source; a page missing from disk is absent. */
export function pageFacts(root: string, rows: readonly PageRow[]): Map<string, Readonly<Record<string, string>>> {
  const onDisk = rows.map((r) => r.source).filter((s) => fs.existsSync(path.join(root, s)));
  return frontmatterMany(root, [...new Set(onDisk)]);
}

export interface PageRefs {
  readonly bySlug: ReadonlyMap<string, PageRef>;
  readonly byRoute: ReadonlyMap<string, PageRef>;
}

/**
 * Every row as a link target, titled by its own frontmatter. A page that is
 * missing, or that declares no title, is one finding naming it, and the
 * answer is null. A row the site writes itself (`source` is `site` or
 * `generated`, the map area's pages) has no page under docs/ and no block to
 * generate, so it is no target.
 */
export function pageRefs(
  ctx: GateContext,
  rows: readonly PageRow[],
  facts: ReadonlyMap<string, Readonly<Record<string, string>>>,
): PageRefs | null {
  const bySlug = new Map<string, PageRef>();
  const byRoute = new Map<string, PageRef>();
  let ok = true;
  for (const r of rows) {
    if (!fromPageTree(r)) continue;
    const fm = facts.get(r.source);
    const title = fm?.['title'] ?? '';
    if (fm === undefined) ctx.fail(r.source, `is missing — ${STRUCTURE} publishes it at ${r.route}`);
    else if (title === '') ctx.fail(r.source, 'declares no title — a generated block links a page by its title');
    if (title === '') {
      ok = false;
      continue;
    }
    const ref: PageRef = { slug: r.slug, route: r.route, source: r.source, title };
    bySlug.set(r.slug, ref);
    byRoute.set(r.route, ref);
  }
  return ok ? { bySlug, byRoute } : null;
}
