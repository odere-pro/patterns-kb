/**
 * The search payload's pages, built from the page tree alone: frontmatter,
 * the structure file and the tag labels, with no site build. The
 * built payload (tools/src/site/gen-search-index.ts) adds what only HTML holds
 * (H2 and H3 headings, row anchors) and nothing the ranking needs beyond it,
 * so a query ranked over these pages is ranked as the search box ranks it,
 * less the heading tier.
 *
 * Shared by the relevance fixture (search-relevance.test.ts) and the search
 * oracle gate (tools/src/gates/check-search-oracle.ts), and by the payload
 * writer for the pieces all three read from the same files: the category
 * chain, the tag labels and the synonym table.
 *
 * Usage: import { searchTree } from './search-tree.js'; searchTree(root).pages
 */

import fs from 'node:fs';
import path from 'node:path';

import { frontmatterMany, listOf, type FmValue } from './frontmatter.js';
import { kindOfArea, pageCategories, type SearchPage, type Synonyms } from './search-score.js';
import { areaChain, fromPageTree, placedPages, type Structure } from './site-routes.js';
import { readStructure } from '../site/site-output.js';

export const TAGS_FILE = 'docs/data/tags.json';
export const SYNONYMS_FILE = 'docs/data/search-synonyms.json';

/**
 * A page's categories: its area chain's labels, outermost first, then its
 * kind's word. The kind is the folder its markdown sits in under docs/ (a
 * theme filed in a case-study tier is still a theme), and the top area's when
 * the source is not under docs/.
 */
export function categoriesFor(structure: Structure, area: string, source: string): string[] {
  const chain = areaChain(structure, area);
  const folder = source.startsWith('docs/') ? (source.split('/')[1] as string) : (chain[0] as { id: string }).id;
  return pageCategories(
    chain.map((a) => a.label),
    folder,
  );
}

/** Tag id → label, for the tags that carry a label. */
export function readTagLabels(root: string): Record<string, string> {
  const file = path.join(root, TAGS_FILE);
  if (!fs.existsSync(file)) return {};
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { terms?: { id?: string; label?: string }[] };
  const out: Record<string, string> = {};
  for (const t of data.terms ?? []) if (typeof t.id === 'string' && typeof t.label === 'string' && t.label !== '') out[t.id] = t.label;
  return out;
}

/** The synonym bridge the rule scores with: the authored expansions under the curated map; none when the file is absent. */
export function readSynonymTable(root: string): Synonyms {
  const file = path.join(root, SYNONYMS_FILE);
  if (!fs.existsSync(file)) return {};
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { curated?: Synonyms; expansions?: Synonyms };
  return { ...(data.expansions ?? {}), ...(data.curated ?? {}) };
}

/** What a page is, in kb.mjs's words: its id, kind (`design`) and band (the area under `patterns` for a pattern). */
export interface PageMeta {
  readonly id: string;
  readonly kind: string;
  readonly band: string;
}

export interface SearchTree {
  readonly pages: SearchPage[];
  readonly tagLabels: Record<string, string>;
  readonly synonyms: Synonyms;
  /** route → the page's kb.mjs identity. */
  readonly meta: ReadonlyMap<string, PageMeta>;
}

const str = (v: FmValue | undefined): string => (typeof v === 'string' ? v : '');
const list = (v: FmValue | undefined): string[] => [...(listOf(v) ?? [])];

/**
 * Every page-tree page as the payload states it, headings aside: the page
 * tree gives none. Reads `root`'s files, so a sandbox and the real checkout
 * both work.
 */
export function searchTree(root: string): SearchTree {
  const structure = readStructure(root);
  const placed = placedPages(structure)
    .filter(fromPageTree)
    .filter((p) => fs.existsSync(path.join(root, p.source)));
  const fm = frontmatterMany(
    root,
    placed.map((p) => p.source),
    { lists: true },
  );
  const meta = new Map<string, PageMeta>();
  const pages = placed.map((p): SearchPage => {
    const f = fm.get(p.source) as Record<string, FmValue>;
    const chain = areaChain(structure, p.area);
    const top = (chain[0] as { id: string }).id;
    const folder = p.source.split('/')[1] as string;
    const kind = kindOfArea(folder);
    meta.set(p.route, { id: p.slug, kind, band: kind === 'pattern' ? ((chain[1] as { id: string } | undefined)?.id ?? p.area) : kind });
    return {
      route: p.route,
      title: str(f['title']),
      kind: top,
      description: str(f['description']),
      area: p.area,
      status: str(f['status']),
      tags: list(f['tags']),
      categories: categoriesFor(structure, p.area, p.source),
      aliases: list(f['aliases']),
      solves: list(f['solves']),
      headings: [],
    };
  });
  return {
    pages,
    tagLabels: readTagLabels(root),
    synonyms: readSynonymTable(root),
    meta,
  };
}
