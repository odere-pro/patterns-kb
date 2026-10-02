/**
 * The structure file stays true: docs/data/site-structure.json is the one
 * publishing decision — every published page, its area and its place in
 * reading order — and this gate is what lets `make validate` catch a bad edit
 * without building anything (spec: kb.data.structure).
 *
 * It checks, all in one run:
 *   - each area: a kebab-case id used once, a label, a hub with a
 *     description, an intro and tags, and a `nestUnder`
 *     naming another declared area; an optional `nav` that is `link` or
 *     `none`; a `link` area holds exactly one row, nests under nothing and has
 *     no area nested under it; an area under a `none` area is `none` too;
 *   - each area label and each row label free of an em-dash: a label names
 *     the area or the page, and an area's tagline goes in `hub.description`;
 *   - each row: a kebab-case slug and a label; a route no other area or row
 *     takes (`/` is the home page's), and a route file name no page in another
 *     published area has (the reader's marks are stored by that name); a `source` that is `site` (a committed
 *     page in the site's input folder at its route), `generated` (only in an
 *     area that declares its generator) or a page-tree path that exists;
 *   - the area ids against the closed area list, `AREAS` in
 *     site/src/lib/types.ts, both ways and in order: a site schema refuses a
 *     page whose area is not there, far from the edit that caused it;
 *   - every hand-written page git tracks in the site's input folder is listed
 *     by a `site` row — an unlisted page is reachable from nowhere. A page
 *     with a whole-file stamp line is output, and an untracked draft is not
 *     the tree's yet, so neither counts; an entry that is not an object is
 *     one finding, and the rest are still checked.
 *
 * That every learning-path stage is a route this file produces
 * (structure-C5) is the learning-paths gate's check, not this one's: one
 * owner, decided at the wave-1 merge (check-learning-paths.ts).
 *
 * Usage: check-site-structure   (no arguments)
 */

import fs from 'node:fs';
import path from 'node:path';

import { trackedFiles } from '../lib/exec.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { isStamped } from '../lib/generated.js';
import {
  areaRoute,
  CONTENT,
  GENERATED,
  pageRoute,
  SITE,
  STRUCTURE,
  structure,
  tupleLiteral,
  TYPES_FILE,
  type StructureArea,
  type StructurePage,
} from '../lib/published.js';

export const NAME = 'site-structure';

/** The em-dash a label may not hold (U+2014). */
export const EM_DASH = '\u2014';

/** A kebab-case id: lowercase letters and digits in dash-joined runs. */
export const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** An area's `nav` when it has one: `link` is one top-level sidebar link and no hub, `none` is unpublished. */
export const NAVS = ['link', 'none'] as const;

/**
 * A route: a leading slash, then either a trailing slash or a `.html` page.
 * The spec writes routes with both slashes; this KB keeps today's `.html`
 * paths so every inbound URL survives (dialect D-02), which the site builds
 * as files rather than directory indexes.
 */
export const ROUTE = /^\/(?:[a-z0-9][a-z0-9._-]*\/)*(?:[a-z0-9][a-z0-9._-]*\.html)?$/;

/** The hand-written page a `site` row's route names: `/x/y/` or `/x/y.html` → x/y.md or x/y.mdx. */
export function inputPagesForRoute(route: string): string[] {
  const stem = route.replace(/^\//, '').replace(/\/$/, '').replace(/\.html$/, '');
  return [`${CONTENT}/${stem}.md`, `${CONTENT}/${stem}.mdx`];
}

/**
 * Every page file git tracks in the input folder that is on disk. "Committed"
 * in the spec's sense (structure-C2, structure-C4): a draft nobody has added
 * is neither published by a row nor reported as unlisted, and what the mirror
 * writes there, uncommitted, is never counted either way.
 */
export function trackedInputPages(root: string): string[] {
  return trackedFiles(root, [`${CONTENT}/**/*.md`, `${CONTENT}/**/*.mdx`, `${CONTENT}/*.md`, `${CONTENT}/*.mdx`]);
}

/**
 * Every tracked, unstamped page file in the input folder but the home page
 * and the not-found page (structure-C4): the home page is the root of the
 * navigation, and the not-found page is the one page no hub may link, since a
 * reader only ever lands on it by a wrong address. Stamped means a whole-file stamp line (isStamped, the one
 * reading every tool shares); a page that only mentions a stamp is hand-written.
 */
export function handWrittenInputPages(root: string, tracked: readonly string[] = trackedInputPages(root)): string[] {
  const unlisted = new Set([`${CONTENT}/index.md`, `${CONTENT}/index.mdx`, `${CONTENT}/404.md`, `${CONTENT}/404.mdx`]);
  return tracked.filter((f) => !unlisted.has(f) && !isStamped(fs.readFileSync(path.join(root, f), 'utf8')));
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The closed area list against the structure file, both ways and in order
 * (structure-C6). Reported against the list that has to change, naming both.
 */
export function checkAreaList(ctx: GateContext, areas: readonly StructureArea[]): void {
  const abs = path.join(ctx.root, TYPES_FILE);
  if (!fs.existsSync(abs)) {
    ctx.fail(TYPES_FILE, `missing — AREAS here is the closed area list every page's \`area\` is held to, and ${STRUCTURE} must match it`);
    return;
  }
  const list = tupleLiteral(fs.readFileSync(abs, 'utf8'), 'AREAS');
  if (list === null) {
    ctx.fail(
      TYPES_FILE,
      'no `const AREAS = [...]` holding only quoted ids — the declaration this gate reads has been reshaped, so the area list is no longer being checked at all',
    );
    return;
  }
  const ids = areas.map((a) => a.id);
  const listed = new Set(list);
  const declared = new Set(ids);
  let missing = false;
  for (const id of ids) {
    if (!listed.has(id)) {
      ctx.fail(STRUCTURE, `area '${id}' is not in the closed area list (AREAS in ${TYPES_FILE}) — add it there too, or every page in it fails the site's schema`);
      missing = true;
    }
  }
  for (const id of list) {
    if (!declared.has(id)) {
      ctx.fail(TYPES_FILE, `AREAS lists '${id}', which no area in ${STRUCTURE} declares`);
      missing = true;
    }
  }
  for (const id of new Set(list.filter((v, i) => list.indexOf(v) !== i))) {
    ctx.fail(TYPES_FILE, `AREAS lists '${id}' more than once — the two lists hold one sequence, each area in it once`);
    missing = true;
  }
  if (missing) return;
  // Same members, each once in AREAS; the structure file can still be longer,
  // by an area it declares twice (a finding of its own), so the walk is over
  // the shorter list and a length gap is said as one.
  const at = ids.findIndex((id, i) => i < list.length && list[i] !== id);
  if (at !== -1) {
    ctx.fail(TYPES_FILE, `AREAS runs in another order than ${STRUCTURE}: position ${String(at + 1)} is '${list[at] as string}' there and '${ids[at] as string}' here — the two lists hold one sequence`);
  } else if (list.length !== ids.length) {
    ctx.fail(TYPES_FILE, `AREAS holds ${String(list.length)} areas and ${STRUCTURE} ${String(ids.length)} — the two lists hold one sequence`);
  }
}

export const spec: GateSpec = {
  name: NAME,
  usage: 'usage: check-site-structure   (no arguments)',
  run(ctx: GateContext): string {
    let raw: unknown[];
    try {
      raw = structure(ctx.root);
    } catch (e) {
      // One finding, and no other check: every one of them reads this file.
      // structure() throws only an Error: JSON.parse's, or its own.
      ctx.fail(STRUCTURE, `unreadable: ${(e as Error).message}`);
      return '';
    }
    // An entry that is not an object has no field to check: one finding
    // naming its place, and every other check runs on the rest.
    const areas: StructureArea[] = [];
    raw.forEach((a, i) => {
      if (isRecord(a)) areas.push(a as unknown as StructureArea);
      else ctx.fail(STRUCTURE, `area #${String(i + 1)} is not an object`);
    });

    const ids = new Set<string>();
    const routes = new Set<string>(['/']);
    const listedInput = new Set<string>();
    const tracked = trackedInputPages(ctx.root);
    const committed = new Set(tracked);
    // A published page's mark (favourite, practiced) is stored under its file
    // name, so two pages in different areas with one name would share a mark.
    const slugAreas = new Map<string, string>();
    const claimSlug = (route: string, area: string, who: string): void => {
      const name = route.replace(/\/$/, '').replace(/\.html$/, '').split('/').pop() as string;
      if (name === '') return;
      const first = slugAreas.get(name);
      if (first === undefined) slugAreas.set(name, area);
      else if (first !== area) ctx.fail(STRUCTURE, `${who}: file name '${name}' is also a page in area '${first}' — readers' marks are stored by file name, so two published pages in different areas must not share one; rename one page's file`);
    };
    const claim = (route: string, who: string): void => {
      if (routes.has(route)) ctx.fail(STRUCTURE, `${who}: route ${route} is already taken`);
      routes.add(route);
    };

    for (const a of areas) {
      const id = typeof a.id === 'string' ? a.id : '';
      if (!KEBAB.test(id)) ctx.fail(STRUCTURE, `area id '${id}' is not kebab-case`);
      if (ids.has(id)) ctx.fail(STRUCTURE, `area id '${id}' is declared twice`);
      ids.add(id);
      if (typeof a.label !== 'string' || a.label.trim() === '') ctx.fail(STRUCTURE, `area '${id}' has no label`);
      else if (a.label.includes(EM_DASH)) ctx.fail(STRUCTURE, `area '${id}' label ${JSON.stringify(a.label)} holds an em-dash — a label names the area; its tagline goes in hub.description`);
      const hub = a.hub as Partial<StructureArea['hub']> | undefined;
      if (hub === undefined || hub === null || typeof hub !== 'object') {
        ctx.fail(STRUCTURE, `area '${id}' has no hub (description, intro, tags)`);
      } else {
        for (const key of ['description', 'intro'] as const) {
          const v = hub[key];
          if (typeof v !== 'string' || v.trim() === '') ctx.fail(STRUCTURE, `area '${id}' hub has no ${key}`);
        }
      }
      if (a.generated !== undefined && (typeof a.generated !== 'string' || a.generated.trim() === '')) {
        ctx.fail(STRUCTURE, `area '${id}' declares an empty generator`);
      }
      if (a.nav !== undefined && !(NAVS as readonly unknown[]).includes(a.nav)) {
        ctx.fail(STRUCTURE, `area '${id}' nav ${JSON.stringify(a.nav)} is not one of ${NAVS.join(', ')} (leave the key out for a hub and a sidebar group)`);
      }
      claim(areaRoute(id), `area '${id}'`);

      if (!Array.isArray(a.pages)) {
        ctx.fail(STRUCTURE, `area '${id}' has no pages list`);
        continue;
      }
      for (const [i, row] of (a.pages as unknown[]).entries()) {
        if (!isRecord(row)) {
          ctx.fail(STRUCTURE, `area '${id}' row #${String(i + 1)} is not an object`);
          continue;
        }
        const p = row as unknown as StructurePage;
        const slug = typeof p.slug === 'string' ? p.slug : '';
        const where = `area '${id}' page '${slug}'`;
        if (!KEBAB.test(slug)) ctx.fail(STRUCTURE, `${where}: slug is not kebab-case`);
        if (typeof p.label !== 'string' || p.label.trim() === '') ctx.fail(STRUCTURE, `${where}: no label`);
        else if (p.label.includes(EM_DASH)) ctx.fail(STRUCTURE, `${where}: label ${JSON.stringify(p.label)} holds an em-dash — a label names the page; say the rest in its description`);
        const route = pageRoute(id, { slug, ...(p.route === undefined ? {} : { route: p.route }) });
        if (typeof route !== 'string' || !ROUTE.test(route)) {
          ctx.fail(STRUCTURE, `${where}: route ${JSON.stringify(route)} is not a path from / ending in / or .html`);
        }
        claim(route, where);
        if (a.nav !== 'none') claimSlug(route, id, where);

        if (p.source === SITE) {
          const candidates = inputPagesForRoute(route);
          for (const c of candidates) listedInput.add(c);
          if (!candidates.some((c) => committed.has(c))) {
            ctx.fail(STRUCTURE, `${where}: source '${SITE}' but no committed page at ${candidates.join(' or ')}`);
          }
        } else if (p.source === GENERATED) {
          // Nothing on disk to check: the file appears at build time. What can
          // be checked is that somebody writes it — a generated page in an area
          // with no generator is a navigation entry pointing at nothing.
          if (a.generated === undefined) ctx.fail(STRUCTURE, `${where}: source '${GENERATED}' but area '${id}' declares no generator`);
        } else if (typeof p.source !== 'string' || p.source === '') {
          ctx.fail(STRUCTURE, `${where}: no source`);
        } else if (!p.source.startsWith('docs/') || !p.source.endsWith('.md')) {
          ctx.fail(STRUCTURE, `${where}: source ${p.source} is not a page under docs/`);
        } else if (!fs.existsSync(path.join(ctx.root, p.source))) {
          ctx.fail(STRUCTURE, `${where}: source ${p.source} does not exist`);
        }
      }
    }

    for (const a of areas) {
      if (a.nestUnder === undefined) continue;
      if (a.nestUnder === a.id || !ids.has(a.nestUnder)) {
        ctx.fail(STRUCTURE, `area '${a.id}' nests under '${String(a.nestUnder)}', which is no other declared area`);
      }
    }

    const byId = new Map(areas.map((a) => [a.id, a]));
    for (const a of areas) {
      if (a.nav === 'link') {
        if (Array.isArray(a.pages) && a.pages.length !== 1) {
          ctx.fail(STRUCTURE, `area '${a.id}' is nav 'link' but holds ${String(a.pages.length)} rows — a link area is one page and one sidebar link`);
        }
        if (a.nestUnder !== undefined) ctx.fail(STRUCTURE, `area '${a.id}' is nav 'link' but nests under '${a.nestUnder}' — a link is a top-level sidebar entry`);
        for (const child of areas) {
          if (child.nestUnder === a.id) ctx.fail(STRUCTURE, `area '${child.id}' nests under '${a.id}', a nav 'link' area with no group to hold it`);
        }
      }
      const parent = a.nestUnder === undefined ? undefined : byId.get(a.nestUnder);
      if (parent?.nav === 'none' && a.nav !== 'none') {
        ctx.fail(STRUCTURE, `area '${a.id}' nests under '${parent.id}', which is unpublished (nav 'none') — mark '${a.id}' nav 'none' too`);
      }
    }

    checkAreaList(ctx, areas);

    // A hand-written page no row lists is unreachable from the navigation and
    // from every hub — a page nobody finds.
    for (const f of handWrittenInputPages(ctx.root, tracked)) {
      if (!listedInput.has(f)) ctx.fail(f, `not listed in ${STRUCTURE} — give it a '${SITE}' row, or move it out of ${CONTENT}`);
    }


    return `[${NAME}] ${STRUCTURE} is coherent (${String(ids.size)} areas, ${String(routes.size - 1)} routes)`;
  },
};

main(spec, import.meta.url);
