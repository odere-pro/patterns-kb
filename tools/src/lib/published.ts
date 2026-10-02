/**
 * The published surface: which pages reach the built site, in which area and
 * at which route (spec: kb.data.structure).
 *
 * This file is a reader, not the list itself. The one structure source is
 * docs/data/site-structure.json: area order, page order, navigation labels,
 * each area's hub, and publication — a page no row lists stays internal.
 * Every consumer (the structure gate today; the mirror, the hubs and the
 * navigation of the site build) reads that file through here, at run time,
 * and keeps no copy of it (structure-C9).
 *
 * The file is read from the measured repo (`root`), not from this package: a
 * gate pointed at a fixture checkout must see the fixture's structure, or its
 * findings would be about the wrong tree.

 */

import fs from 'node:fs';
import path from 'node:path';

export const STRUCTURE = 'docs/data/site-structure.json';

/**
 * The site's closed value lists as tuples: `AREAS` (the closed area list,
 * spec kb.content.frontmatter) and `TAGS` (the tag list's flat second form,
 * spec kb.data.tags). The site's content schema, site/src/content.config.ts,
 * builds its area and tag enums from them through site/src/lib/site-types.ts,
 * and the structure and tags gates hold each to its data file, both ways.
 */
export const TYPES_FILE = 'site/src/lib/types.ts';

/**
 * The site's input folder: a hand-written page there is published by a
 * `site` row, and the mirror copies every page-tree row into it, uncommitted.
 */
export const CONTENT = 'site/src/content/docs';

/**
 * The string members of a `const <name> = [ 'a', 'b' ]` declaration, read as
 * text, or null when the declaration is not there in that shape.
 *
 * Deliberately a parse and not an import. A gate is pointed at a repo through
 * `ctx.root`, and an import of site/src/lib/types.ts would read THIS
 * checkout's copy however a fixture was built — the same reason the structure
 * file is read from the measured repo rather than from this package.
 *
 * The body is read piece by piece, and it may hold only quoted ids with one
 * comma between each two (a trailing one allowed), blank space and comments.
 * A comment is skipped whole, so a member commented out is not a member, and
 * an apostrophe or a bracket inside a comment neither opens an id nor ends
 * the list. The first `]` outside a comment ends the list. Anything else — a
 * nested literal, a spread, a bare word, two ids with no comma between them —
 * makes the answer null (spec: the tuple is one flat list of quoted ids).
 *
 * Returning null rather than an empty list is the whole safety story: a
 * caller that cannot tell "no members" from "the file no longer looks like
 * this" will one day compare against nothing and call it agreement.
 */
export function tupleLiteral(text: string, name: string): string[] | null {
  const decl = new RegExp(String.raw`(?:export\s+)?const\s+${name}\s*(?::[^=]*)?=\s*\[`);
  const m = decl.exec(text);
  if (m === null) return null;
  // One piece of the body: blank space, a line or block comment, a quoted id,
  // a comma, or the closing bracket. Sticky, so a character none of them
  // covers stops the read where it stands.
  const piece = /(\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|'([^'\n]*)'|"([^"\n]*)"|(,)|(\])/y;
  piece.lastIndex = m.index + m[0].length;
  const out: string[] = [];
  // An id (or the end) may come first and after a comma; a comma (or the end) after an id.
  let wantId = true;
  for (;;) {
    const t = piece.exec(text);
    if (t === null) return null;
    if (t[1] !== undefined) continue;
    if (t[5] !== undefined) return out;
    if (t[4] !== undefined) {
      if (wantId) return null;
      wantId = true;
    } else {
      if (!wantId) return null;
      out.push((t[2] ?? t[3]) as string);
      wantId = false;
    }
  }
}

export interface StructureHub {
  description: string;
  intro: string;
  /** The hub page's own tags: a hub is assembled rather than written, so its tags live here. */
  tags: string[];
}

/**
 * The `source` of a page its area's generator writes at build time.
 *
 * The other two kinds name something on disk — `'site'` a committed page in
 * the input folder, anything else the page-tree page it mirrors. A generated
 * page has no file to name until the build runs, so only an area declaring
 * `generated` may hold one, which the structure gate holds.
 */
export const GENERATED = 'generated';

/** The `source` of a hand-written page committed in the input folder at its route. */
export const SITE = 'site';

export interface StructurePage {
  slug: string;
  label: string;
  /** `'site'`, `'generated'`, or the page-tree path it mirrors. */
  source: string;
  /** Explicit route, for a page whose route is not `/<area>/<slug>/`. */
  route?: string;
}

export interface StructureArea {
  id: string;
  label: string;
  /**
   * `link`: a single-page area with no hub, one top-level sidebar link to its
   * row. `none`: unpublished — its rows stay off the site. Absent: a hub and
   * a sidebar group.
   */
  nav?: 'link' | 'none';
  /** Render inside this area's navigation group instead of its own. */
  nestUnder?: string;
  /** The generator that owns this area's hub and its `generated` pages. */
  generated?: string;
  hub: StructureHub;
  pages: StructurePage[];
}

/** The parsed structure file's areas. Malformed JSON throws — there is no fallback layout. */
export function structure(root: string): StructureArea[] {
  const raw = JSON.parse(fs.readFileSync(path.join(root, STRUCTURE), 'utf8')) as { areas?: unknown };
  if (!Array.isArray(raw.areas)) throw new Error('has no `areas` list');
  return raw.areas as StructureArea[];
}

/** The route an area's hub takes. */
export const areaRoute = (id: string): string => `/${id}/`;

/** The route a row takes: its own `route`, else `/<area>/<slug>/`. */
export const pageRoute = (area: string, page: Pick<StructurePage, 'slug' | 'route'>): string =>
  page.route ?? `/${area}/${page.slug}/`;

/** A page with a page-tree file behind it — the set the mirror copies. */
export const mirrored = (page: { source: string }): boolean => page.source !== SITE && page.source !== GENERATED;

/** One published page, resolved: its area and its route on the site. */
export interface PublishedPage {
  area: string;
  slug: string;
  label: string;
  source: string;
  route: string;
}

/** Every row of a published area, in area order then page order; a `none` area's rows are left out. */
export function publishedPages(root: string): PublishedPage[] {
  const out: PublishedPage[] = [];
  for (const a of structure(root)) {
    if (a.nav === 'none') continue;
    for (const p of a.pages) {
      out.push({ area: a.id, slug: p.slug, label: p.label, source: p.source, route: pageRoute(a.id, p) });
    }
  }
  return out;
}

/** page-tree source path → site route, for a link rewriter. */
export function routesBySource(root: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of publishedPages(root)) if (mirrored(p)) map.set(p.source, p.route);
  return map;
}
