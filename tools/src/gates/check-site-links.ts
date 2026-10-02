/**
 * The built-site half of link integrity: every link in site/dist lands on a
 * file that is there, every fragment on an anchor that is there, every page
 * belongs to exactly one hub, and every learning-path stage is a built page
 * (spec kb.gates.link-integrity, site-gate, C5 to C10).
 *
 * "Resolves" means a file on disk, not a server's answer: the site is read
 * from a folder as well as served (spec kb.site.offline), so a directory URL,
 * a missing `.html` or one `../` too many is a dead link even where a web
 * server would paper over it.
 *
 *   links     every `href`, `xlink:href` and `src` a start tag carries, either
 *             quote style, except empty and external targets (a scheme then
 *             `//`, a leading `//`, `http`, `https`, `mailto`, `tel`, `data`,
 *             `javascript`). Query and fragment dropped, resolved from the
 *             linking page's folder; climbing above the site root is a
 *             finding, and so is a root-absolute target (one leading `/`):
 *             a page opened from a folder has no root to start from
 *             (offline-C3). A fragment into a built page must be in its
 *             anchor set. A link to a repository file on GitHub, which the
 *             mirror writes for a docs/ link to a file the site does not
 *             publish (REPO_BLOB), must name a file in this tree: a typo in a
 *             page's link otherwise ships as a dead link to GitHub.
 *   anchors   the `id` and `name` values of a page's start tags, with what
 *             sits inside `<pre>`, `<code>` and `<script>` blanked first: an
 *             id a code sample shows is text, not an anchor (the anchor-set
 *             convention). Each page is read, and its set built, once.
 *   hubs      every folder of pages has a hub: `index.html` at the root, else
 *             the page named after the folder, beside it (C6); a folder whose
 *             pages are all rows of a `link` area (one top-level sidebar link,
 *             the home page its hub) needs none. And every built
 *             page but the root hub and the not-found page is linked from
 *             exactly one hub (C7). Which pages are hubs is the structure
 *             file's answer (`isHubRoute`), since five areas file their pages
 *             in a sibling's folder and their hub stands where their folder
 *             would be. Only links in a hub's knowledge region count, up to its
 *             next-steps section, and repeats within one hub count once: the
 *             sidebar links pages from pages and proves nothing.
 *   order     within each group of a hub (the run of entries under one `<h2>`),
 *             the area's own pages appear in the structure file's reading
 *             order (hub-order): the hub generator groups entries by topic
 *             and never reorders inside a group. A nested area's entry, and a
 *             link to another area's page, take no part.
 *   stages    each learning-path stage maps to a built page (C8): `/` to
 *             `index.html`, any other route to its path without end slashes,
 *             plus `.html` when it has none (this site's routes are files
 *             already, dialect D-02). The finding names the learning-path file,
 *             the profile's id and the route; an unreadable file is a finding.
 *
 * With no built site, or one with no pages, it exits 1 naming the build
 * command (C9): this gate only ever judges a site that was built.
 *
 * Usage: check-site-links [--dist <dir>]   (default site/dist)
 */

import fs from 'node:fs';
import path from 'node:path';

import { knowledgeRegion, parseAttrs, tags, type Attr } from '../lib/built-page.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { isHubRoute, navOf, placedHubs, placedPages, type Structure } from '../lib/site-routes.js';
import { DIST, readStructure, REPO_BLOB } from '../site/site-output.js';

/** The learning-path file whose stages must be built pages. */
export const LEARNING_PATHS = 'docs/data/learning-paths.json';

/** Attributes that point at something. */
const LINK_ATTRS = new Set(['href', 'xlink:href', 'src']);

/** The not-found page, exempt from hub coverage when a build writes one. */
const NOT_FOUND = '404.html';

/**
 * Somebody else's URL: a scheme with `//` after it, a leading `//`, or one of
 * the slash-less schemes. Anything else with a colon, `docs:page.html` say,
 * falls through to resolution and dies as a link to nothing.
 */
export function isExternal(url: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url) || /^(?:https?|mailto|tel|data|javascript):/i.test(url) || url.startsWith('//');
}

/**
 * The repository path a link to a file on GitHub names, or null when the link
 * is not one: query and fragment dropped, percent-escapes undone.
 */
export function repoFileOf(url: string): string | null {
  if (!url.startsWith(`${REPO_BLOB}/`)) return null;
  const { target } = splitUrl(url.slice(REPO_BLOB.length + 1));
  return fragmentId(target);
}

/** `<dir>/<rel>` as a path from the site root, or null when it climbs out. */
export function resolveFromRoot(dir: string, rel: string): string | null {
  const out: string[] = [];
  for (const seg of `${dir}/${rel}`.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}

/** The built page a stage names. */
export function routeToPage(route: string): string {
  const trimmed = route.replace(/^\/+/, '').replace(/\/+$/, '');
  if (trimmed === '') return 'index.html';
  return trimmed.endsWith('.html') ? trimmed : `${trimmed}.html`;
}

/** Elements whose content is code: an id or a link shown there is text. */
const CODE = new Set(['pre', 'code', 'script']);

/** What one built page offers and points at, read once. */
export interface PageLinks {
  /** Every `id` and `name` outside code. */
  readonly anchors: ReadonlySet<string>;
  /** Every link value, in document order, with no repeats. */
  readonly urls: readonly string[];
}

/** Read one page's anchor set and link values in one walk over its tags. */
export function readLinks(html: string): PageLinks {
  const anchors = new Set<string>();
  const urls: string[] = [];
  const seen = new Set<string>();
  let inCode = 0;
  for (const t of tags(html)) {
    if (CODE.has(t.name) && !t.selfClosing) {
      inCode = Math.max(0, inCode + (t.closing ? -1 : 1));
      if (t.closing) continue;
    }
    if (t.closing) continue;
    const attrs: Attr[] = parseAttrs(t.source);
    for (const a of attrs) {
      if (a.value === null) continue;
      if ((a.name === 'id' || a.name === 'name') && inCode === 0) anchors.add(a.value);
      if (LINK_ATTRS.has(a.name) && !seen.has(a.value)) {
        seen.add(a.value);
        urls.push(a.value);
      }
    }
  }
  return { anchors, urls };
}

/**
 * The part of a hub whose links count: its knowledge region, up to the element
 * carrying `id="next-steps"` (the heading of the block that says where to go
 * after this page), since a hub's onward links are not the pages it holds.
 */
export function hubBody(html: string): string {
  const region = knowledgeRegion(html);
  if (region === null) return '';
  const body = html.slice(region[0], region[1]);
  for (const t of tags(body)) {
    if (t.closing) continue;
    const id = parseAttrs(t.source).find((a) => a.name === 'id')?.value;
    if (id === 'next-steps') return body.slice(0, t.start);
  }
  return body;
}

/**
 * A hub body cut into its groups: each run starts at an `<h2>` (a group's
 * label), and whatever comes before the first one is a run of its own.
 */
export function hubRuns(body: string): string[] {
  const cuts = [0];
  for (const t of tags(body)) if (!t.closing && t.name === 'h2') cuts.push(t.start);
  cuts.push(body.length);
  const runs: string[] = [];
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const run = body.slice(cuts[i] as number, cuts[i + 1] as number);
    if (run !== '') runs.push(run);
  }
  return runs;
}

/**
 * A hub run's pages of `area`, in the order the run first links each, with
 * its place in the reading order. `placed` maps a page's path under the site
 * root to its structure row; a link resolved from `dir`, the hub's folder,
 * that names no row of `area` takes no part, and neither do a fragment, an
 * external or root-absolute link, or one climbing out of the site.
 */
export function rankedPages(
  run: string,
  dir: string,
  area: string,
  placed: ReadonlyMap<string, { readonly area: string; readonly rank: number }>,
): { page: string; rank: number }[] {
  const ranked: { page: string; rank: number }[] = [];
  for (const url of readLinks(run).urls) {
    const { target } = splitUrl(url);
    if (target === '' || target.startsWith('/') || isExternal(url)) continue;
    const r = resolveFromRoot(dir, target);
    const row = r === null ? undefined : placed.get(r);
    if (r === null || row === undefined || row.area !== area || ranked.some((x) => x.page === r)) continue;
    ranked.push({ page: r, rank: row.rank });
  }
  return ranked;
}

/**
 * The first pair of a run's pages out of reading order, or null: `ranked` are
 * the run's pages of the hub's own area, first appearance kept, each with its
 * place in the structure file.
 */
export function outOfOrder(ranked: readonly { page: string; rank: number }[]): [string, string] | null {
  for (let i = 1; i < ranked.length; i += 1) {
    const a = ranked[i - 1] as { page: string; rank: number };
    const b = ranked[i] as { page: string; rank: number };
    if (b.rank < a.rank) return [a.page, b.page];
  }
  return null;
}

/** A fragment as the id it names: percent-escapes undone, a malformed one taken as written. */
export function fragmentId(frag: string): string {
  try {
    return decodeURIComponent(frag);
  } catch {
    return frag;
  }
}

/** Split a link into its path part and its fragment, the query dropped. */
export function splitUrl(url: string): { target: string; frag: string } {
  const hash = url.indexOf('#');
  const frag = hash >= 0 ? url.slice(hash + 1) : '';
  let target = hash >= 0 ? url.slice(0, hash) : url;
  const q = target.indexOf('?');
  if (q >= 0) target = target.slice(0, q);
  return { target, frag };
}

function walk(dir: string): { files: string[]; dirs: string[] } {
  const files: string[] = [];
  const dirs: string[] = [''];
  const go = (rel: string): void => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) {
        dirs.push(child);
        go(child);
      } else if (e.name.endsWith('.html')) files.push(child);
    }
  };
  go('');
  return { files: files.sort(), dirs: dirs.sort() };
}

interface Profile {
  id?: unknown;
  stages?: unknown;
}

export const spec: GateSpec = {
  name: 'site-links',
  usage: 'usage: check-site-links [--dist <dir>]',
  options: ['--dist'],
  run(ctx: GateContext): string {
    const arg = (ctx.options.get('--dist') ?? DIST).replace(/\/+$/, '');
    const dist = path.resolve(ctx.root, arg);
    // `--dist ''` must fail like any other missing folder: resolved, '' is the
    // repository itself, and walking the whole checkout is a storm of noise.
    if (arg === '' || !fs.existsSync(dist) || !fs.statSync(dist).isDirectory()) {
      ctx.failLine(`no built site at ${arg || "''"} — build it first: make site-build`);
      return '';
    }
    const { files: pages, dirs } = walk(dist);
    if (pages.length === 0) {
      ctx.failLine(`no .html files under ${arg} — build it first: make site-build`);
      return '';
    }
    const shown = path.relative(ctx.root, dist).split(path.sep).join('/') || '.';
    const at = (rel: string): string => (shown === '.' ? rel : `${shown}/${rel}`);

    // Each page is read, and its anchor set built, once per run (C10).
    const cache = new Map<string, { html: string; links: PageLinks }>();
    const page = (rel: string): { html: string; links: PageLinks } => {
      let got = cache.get(rel);
      if (got === undefined) {
        const html = fs.readFileSync(path.join(dist, rel), 'utf8');
        got = { html, links: readLinks(html) };
        cache.set(rel, got);
      }
      return got;
    };
    const read = (rel: string): PageLinks => page(rel).links;
    const isFile = (rel: string): boolean => {
      const p = path.join(dist, rel);
      return fs.existsSync(p) && fs.statSync(p).isFile();
    };

    // -- links and fragments ---------------------------------------------
    let links = 0;
    let repoLinks = 0;
    for (const rel of pages) {
      const dir = path.posix.dirname(rel);
      for (const url of read(rel).urls) {
        const repoFile = repoFileOf(url);
        if (repoFile !== null) {
          repoLinks += 1;
          const p = path.join(ctx.root, repoFile);
          if (repoFile === '' || !fs.existsSync(p) || !fs.statSync(p).isFile()) {
            ctx.fail(at(rel), `link '${url}' → ${repoFile || 'the repository root'} is no file in this repository — fix the link in the page under docs/ and rebuild`);
          }
          continue;
        }
        if (url === '' || isExternal(url)) continue;
        links += 1;
        const { target, frag } = splitUrl(url);
        if (target.startsWith('/')) {
          ctx.fail(at(rel), `link '${url}' is root-absolute — from a folder it opens nothing; the post-build pass makes every link relative, so run make site-build`);
          continue;
        }
        let resolved = rel;
        if (target !== '') {
          const r = resolveFromRoot(dir, target);
          if (r === null) {
            ctx.fail(at(rel), `link '${url}' climbs out of the site root`);
            continue;
          }
          if (!isFile(r)) {
            const what = fs.existsSync(path.join(dist, r)) ? 'is a folder, not a page — a folder opens nothing from disk' : 'does not exist';
            ctx.fail(at(rel), `link '${url}' → ${r} ${what}`);
            continue;
          }
          resolved = r;
        }
        if (frag === '' || !resolved.endsWith('.html')) continue;
        if (!read(resolved).anchors.has(fragmentId(frag))) {
          ctx.fail(at(rel), `link '${url}' → ${resolved} has no element with id '${frag}'`);
        }
      }
    }

    // -- every folder of pages has its hub (C6) ----------------------------
    // A folder whose built pages are all rows of a `link` area is one sidebar
    // link and has no hub.
    let structure: Structure = { areas: [] };
    let structureRead = true;
    try {
      structure = readStructure(ctx.root);
    } catch {
      structureRead = false;
    }
    const linkRows = new Set(
      placedPages(structure)
        .filter((p) => structure.areas.some((a) => a.id === p.area && navOf(a) === 'link'))
        .map((p) => p.route.slice(1)),
    );
    for (const d of dirs) {
      const inFolder = pages.filter((p) => path.posix.dirname(p) === (d === '' ? '.' : d));
      if (inFolder.length === 0 || inFolder.every((p) => linkRows.has(p))) continue;
      const hub = d === '' ? 'index.html' : `${d}.html`;
      if (!isFile(hub)) ctx.fail(d === '' ? shown : at(d), `is a folder of pages with no hub page ${at(hub)}`);
    }

    // -- every page belongs to exactly one hub (C7) ------------------------
    if (!structureRead) ctx.fail('docs/data/site-structure.json', 'is not readable JSON — which pages are hubs is its answer');
    const hubs = pages.filter((rel) => rel === 'index.html' || isHubRoute(structure, `/${rel}`));
    const coverage = new Map<string, number>();
    for (const hub of hubs) {
      const dir = path.posix.dirname(hub);
      const held = new Set<string>();
      for (const url of readLinks(hubBody(page(hub).html)).urls) {
        if (url === '' || url.startsWith('#') || isExternal(url)) continue;
        const { target } = splitUrl(url);
        if (target.startsWith('/')) continue;
        const r = resolveFromRoot(dir, target);
        if (r === null || r === hub || !r.endsWith('.html') || !isFile(r)) continue;
        held.add(r);
      }
      for (const p of held) coverage.set(p, (coverage.get(p) ?? 0) + 1);
    }
    for (const rel of pages) {
      if (rel === 'index.html' || rel === NOT_FOUND) continue;
      const n = coverage.get(rel) ?? 0;
      if (n === 0) ctx.fail(at(rel), 'is linked from no hub — a reader browsing the hubs never finds it');
      else if (n > 1) ctx.fail(at(rel), `is linked from ${n} hubs — every page belongs to exactly one`);
    }

    // -- within each group of a hub, its area's pages in reading order ------
    const placed = new Map(placedPages(structure).map((p) => [p.route.replace(/^\//, ''), p]));
    const areaOfHub = new Map(placedHubs(structure).map((h) => [h.route.replace(/^\//, ''), h.area]));
    let ordered = 0;
    for (const hub of hubs) {
      const area = areaOfHub.get(hub);
      if (area === undefined) continue;
      ordered += 1;
      const dir = path.posix.dirname(hub);
      for (const run of hubRuns(hubBody(page(hub).html))) {
        const pair = outOfOrder(rankedPages(run, dir, area, placed));
        if (pair !== null) {
          ctx.fail(
            at(hub),
            `lists ${pair[0]} before ${pair[1]} in one group, against the reading order of docs/data/site-structure.json — ` +
              'the hub generator keeps each group in reading order (tools/src/site/gen-site-hubs.ts, orderHub); rebuild: make site-build',
          );
        }
      }
    }

    // -- every learning-path stage is a built page (C8) ---------------------
    let stages = 0;
    const file = path.join(ctx.root, LEARNING_PATHS);
    if (fs.existsSync(file)) {
      let profiles: Profile[] = [];
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { profiles?: unknown };
        if (!Array.isArray(parsed.profiles)) throw new Error('no profiles list');
        profiles = parsed.profiles as Profile[];
      } catch {
        ctx.fail(LEARNING_PATHS, 'is not readable — no JSON object with a profiles list, so no stage can be checked');
      }
      const built = new Set(pages);
      for (const p of profiles) {
        const id = typeof p.id === 'string' ? p.id : '?';
        for (const route of Array.isArray(p.stages) ? p.stages : []) {
          if (typeof route !== 'string') continue;
          stages += 1;
          const page = routeToPage(route);
          if (!built.has(page)) ctx.fail(LEARNING_PATHS, `profile "${id}" stage ${route} matches no built page (${at(page)})`);
        }
      }
    }

    return (
      `[site-links] ${links} links across ${pages.length} pages land on a file and an anchor; ` +
      `${repoLinks} links to a repository file name one in the tree; ` +
      `${hubs.length} hubs hold every page once, ${ordered} in reading order within each group; ` +
      `${stages} learning-path stages are built pages`
    );
  },
};

main(spec, import.meta.url);
