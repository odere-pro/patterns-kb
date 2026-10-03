/**
 * "Mentioned by": the pages that link to a page from their prose without
 * declaring a typed relation with it (the migration's P5; the HTML era's
 * scripts/build.mjs "mentions" and build-pages.mjs `mentionsFor`).
 *
 * A typed relation is on both pages already, and a theme's tour lists its
 * members while each member names the theme back. Prose links are not: a
 * sentence on one page pointing at another leaves no trace on the page it
 * points at. The site shows that trace as an aside under the page, built here
 * from every published page's markdown on each build, so no one keeps it.
 *
 * What counts as prose is what today's build reads, in markdown terms: every
 * inline link in a page's body, except
 *   - inside a generated marked block (`<!-- relationships:start -->` …,
 *     the tour and the fluency lists): those links are the declared relations
 *     and memberships themselves;
 *   - inside a theme's `siblings` block, the hand-kept list today's build
 *     skips with the tour (`.fluency-item`);
 * and a link counts only when it lands on another published page with which
 * the linking page declares nothing: no relation in docs/data/relations.json
 * either way, and no tour in docs/data/learning-paths.json holding the other.
 * Code is never read: a link inside a code span or a fence is not a link.
 *
 * Pure but for `loadMentions`, which reads the files; the site's aside
 * (site/src/components/MentionedBy) calls that once per build.
 */

import fs from 'node:fs';
import path from 'node:path';

import { FILE_STAMP } from './generated.js';
import { MARKER_PATTERN } from './kb-attrs.js';
import { linkTargets, resolveTarget } from './links.js';
import { areaChain, fromPageTree, placedPages, type Structure } from './site-routes.js';

/** A block whose links are a hand-kept membership list, not prose (dialect D-57). */
export const LIST_BLOCKS: readonly string[] = ['siblings'];

/** One published page, as the aside names it. */
export interface MentionPage {
  readonly slug: string;
  readonly route: string;
  readonly source: string;
  readonly title: string;
  /** The page's top area: what kind of page it is. */
  readonly kind: string;
  /** That area's label up to its dash, as the aside names the kind: `Themes`. */
  readonly kindLabel: string;
}

/** What one aside lists: the pages that mention this one, by title. */
export type Mentions = ReadonlyMap<string, readonly MentionPage[]>;

/** The body of a page: everything after its frontmatter block, or all of it when it has none. */
export function bodyOf(text: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  return m === null ? text : text.slice(m[0].length);
}

/**
 * Is this body a page a generator renders whole from a data file, as the
 * prerequisites reference renders docs/data/relations.json? Its links are
 * that file's declared pairs listed again, not prose, so it mentions nothing.
 * Only a stamp naming a file under docs/data/ counts.
 */
export function renderedFromData(body: string): boolean {
  return body.split('\n').some((line) => FILE_STAMP.test(line) && / from docs\/data\/\S+\. Do not edit/.test(line));
}

/** A fence's opening line: its character and its length (CommonMark: three or more). */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** A code span, as CommonMark pairs backtick runs of equal length. */
const CODE_SPAN = /(`+)(?!`)[^]*?[^`]\1(?!`)|(`+)(?!`)\2(?!`)/g;

/** A section fact line naming the block it opens. */
const BLOCK_FACT = /^<!--meta\b[^>]*\bblock=([a-z]+(?:-[a-z]+)*)/;

/**
 * Every prose link target in one page's body, as written, in document order:
 * links outside marked blocks, outside the list blocks, outside code. Read
 * line by line, as lib/links.ts reads links everywhere else — every inline
 * link counts, several to a line — because parsing 382 pages as trees on every
 * build costs seconds this answer does not need.
 */
export function proseTargets(body: string): string[] {
  const out: string[] = [];
  let marked: string | null = null;
  let block: string | null = null;
  let fence: string | null = null;
  for (const line of body.split('\n')) {
    const f = FENCE.exec(line);
    if (fence !== null) {
      if (f !== null && (f[1] as string)[0] === fence[0] && (f[1] as string).length >= fence.length && line.trim() === f[0].trim()) fence = null;
      continue;
    }
    if (f !== null) {
      fence = f[1] as string;
      continue;
    }
    const m = MARKER_PATTERN.exec(line.trim());
    if (m !== null) {
      if (m[2] === 'start' && marked === null) marked = m[1] as string;
      else if (m[2] === 'end' && marked === m[1]) marked = null;
      continue;
    }
    if (/^#{1,2} /.test(line)) block = null;
    const fact = BLOCK_FACT.exec(line.trim());
    if (fact !== null) block = fact[1] as string;
    if (marked !== null || (block !== null && LIST_BLOCKS.includes(block))) continue;
    out.push(...linkTargets(line.replace(CODE_SPAN, '')));
  }
  return out;
}

/**
 * Who mentions whom, inverted onto the page mentioned: route → the pages whose
 * prose links it, sorted by title. `declared(a, b)` says whether two slugs
 * already name each other, in either order. A page never mentions itself, and
 * one page mentioning another twice counts once.
 */
export function mentionsIndex(
  pages: readonly MentionPage[],
  bodyFor: (page: MentionPage) => string,
  declared: (a: string, b: string) => boolean,
): Map<string, MentionPage[]> {
  const bySource = new Map(pages.map((p) => [p.source, p]));
  const out = new Map<string, MentionPage[]>();
  for (const from of pages) {
    const seen = new Set<string>();
    for (const target of proseTargets(bodyFor(from))) {
      const resolved = resolveTarget(from.source, target);
      const to = resolved === null ? undefined : bySource.get(resolved);
      if (to === undefined || to.slug === from.slug || seen.has(to.slug) || declared(from.slug, to.slug)) continue;
      seen.add(to.slug);
      out.set(to.route, [...(out.get(to.route) ?? []), from]);
    }
  }
  const byTitle = (a: MentionPage, b: MentionPage): number => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);
  for (const list of out.values()) list.sort(byTitle);
  return out;
}

/** The pairs two data files declare: every relation, and every tour with the pages it holds. */
export function declaredPairs(
  relations: readonly { a: string; b: string }[],
  tours: readonly { id: string; stages: readonly string[] }[],
  slugOfRoute: ReadonlyMap<string, string>,
): (a: string, b: string) => boolean {
  const pairs = new Set<string>();
  const add = (x: string, y: string): void => {
    pairs.add(`${x}\u0000${y}`);
    pairs.add(`${y}\u0000${x}`);
  };
  for (const r of relations) add(r.a, r.b);
  for (const t of tours) {
    for (const stage of t.stages) {
      const slug = slugOfRoute.get(stage);
      if (slug !== undefined) add(t.id, slug);
    }
  }
  return (a, b) => pairs.has(`${a}\u0000${b}`);
}

/** The published pages of a structure file, each with its title (its row's label) and kind. */
export function mentionPages(structure: Structure): MentionPage[] {
  return placedPages(structure)
    .filter(fromPageTree)
    .map((p) => {
      const top = areaChain(structure, p.area)[0] as { id: string; label: string };
      return { slug: p.slug, route: p.route, source: p.source, title: p.label, kind: top.id, kindLabel: top.label };
    });
}

const cache = new Map<string, Map<string, MentionPage[]>>();

/**
 * The whole site's mentions, read from `root`: the structure file, the two
 * data files that declare pairs, and every published page's markdown. Read
 * once per root and process — a build asks for it once per page. A tree
 * without one of the two data files declares nothing through it.
 */
export function loadMentions(root: string): Map<string, MentionPage[]> {
  const hit = cache.get(root);
  if (hit !== undefined) return hit;
  const json = <T>(rel: string): T => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')) as T;
  const optional = <T>(rel: string, none: T): T => (fs.existsSync(path.join(root, rel)) ? json<T>(rel) : none);
  const structure = json<Structure>('docs/data/site-structure.json');
  const relations = optional<{ relations: { a: string; b: string }[] }>('docs/data/relations.json', { relations: [] }).relations;
  const tours = optional<{ profiles: { id: string; stages: string[] }[] }>('docs/data/learning-paths.json', { profiles: [] }).profiles;
  const pages = mentionPages(structure);
  const declared = declaredPairs(relations, tours, new Map(pages.map((p) => [p.route, p.slug])));
  const index = mentionsIndex(
    pages,
    (p) => {
      const body = bodyOf(fs.readFileSync(path.join(root, p.source), 'utf8'));
      return renderedFromData(body) ? '' : body;
    },
    declared,
  );
  cache.set(root, index);
  return index;
}
