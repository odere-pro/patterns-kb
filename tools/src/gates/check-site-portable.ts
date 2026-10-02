/**
 * The built site opens from a local folder, and this gate is what stops that
 * quietly ceasing to be true (spec kb.site.offline, portability-gate).
 *
 * Over site/dist it checks what no build setting can promise:
 *
 *   1. no `href`, `src` or `xlink:href` starts with a single `/` — a page
 *      opened from disk has no root (offline-C3); a `//` start is external.
 *      Attributes are read from the page's start tags, whatever the quoting,
 *      by the one page reader (lib/built-page.ts), never by a spelling;
 *   2. no project-added script is a module — a module never runs from
 *      `file://`; ours are the tags carrying `data-kb` (offline-C5);
 *   3. every page carries its `kb:area` fact in the head (offline-C4);
 *   4. keyboard reach survives the build: no positive tabindex, and every page
 *      keeps a skip link whose `href` is a fragment (offline-C7);
 *   5. the manifest and the search payload exist and are not empty;
 *   6. the payload covers the site: every built page but the hubs is in it,
 *      every route in it is on disk, and every heading id it offers is an
 *      anchor in its page — an `id` or `name` outside code, the anchor set the
 *      link gate reads (`readLinks`), so a mermaid edge's `data-id` is none
 *      (offline-C6). Which routes are hubs is `isHubRoute`, the predicate the
 *      payload pass shares.
 *
 *   7. every page-tree page has its markdown source beside it: `<route>.md`,
 *      byte for byte the file under docs/ the structure names, and no other
 *      `.md` ships — the "View source" link opens it from disk. A built row
 *      with no source file is a finding too.
 *
 * Every finding names its file from the repository root, whatever form
 * `--dist` was given in (contract-C5).
 *
 * (6) is here and not in the link gate because nothing links to a search
 * result: the rows are built in the browser, so a link checker walking the
 * built pages sees none of them.
 *
 * Usage: check-site-portable [--dist <dir>]   (default site/dist)
 */

import fs from 'node:fs';
import path from 'node:path';

import { attrValue, metaContent, parseAttrs, tags } from '../lib/built-page.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { decodeHeadings, type WireHeading } from '../lib/search-score.js';
import { findInDir, PAYLOAD_FILE_NAME } from '../lib/asset-names.js';
import { fromPageTree, isHubRoute, placedPages } from '../lib/site-routes.js';
import { markdownRoute } from '../site/site-portable.js';
import { DIST, readStructure } from '../site/site-output.js';
import { readLinks } from './check-site-links.js';

/** The two files the post-build passes write beside the pages; the payload's name may carry a hash. */
export const INDEX_FILES = ['index.json', 'search-index.js'] as const;

/** One page of the search payload, as far as this gate reads it. */
export interface PayloadPage {
  route: string;
  headings: { id: string; text: string }[];
}

/**
 * `window.kb = {…};` read back as data. A pattern, never an evaluator: this
 * gate must not run the file it checks, and the shape it asserts — one
 * assignment, one object holding a pages list — is exactly what the pattern
 * says.
 */
export function parsePayload(js: string): { pages: PayloadPage[] } | null {
  const m = /^window\.kb = (\{[\s\S]*\});\s*$/.exec(js);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1] as string) as { pages?: unknown };
    if (!Array.isArray(parsed.pages)) return null;
    return {
      pages: (parsed.pages as { route: string; headings: WireHeading[] }[]).map((p) => ({ route: p.route, headings: decodeHeadings(p.headings) })),
    };
  } catch {
    return null;
  }
}

/** Attributes that point at something. */
export const LINK_ATTRS = ['href', 'src', 'xlink:href'] as const;

/** A root-absolute target: one `/`, never `//`, which is another host. */
export const ROOT_ABSOLUTE = /^\/(?!\/)/;

/** One finding a page's tags earn, at its line. */
export interface TagHit {
  readonly line: number;
  readonly what: string;
}

/** 1-based line of each offset, by binary search over the line starts. */
export function lineIndex(html: string): (offset: number) => number {
  const starts = [0];
  for (let i = html.indexOf('\n'); i >= 0; i = html.indexOf('\n', i + 1)) starts.push(i + 1);
  return (offset: number): number => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((starts[mid] as number) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** What one page's start tags say about portability and keyboard reach, read once. */
export interface TagRead {
  readonly rootAbsolute: TagHit[];
  readonly positiveTabindex: TagHit[];
  /** A `<script type="module">` carrying `data-kb`: one of ours. */
  readonly injectedModule: boolean;
  /** Starlight's skip link, its href a fragment. */
  readonly skipLink: boolean;
}

/**
 * Walk a page's start tags once. Attribute values are read as the page reader
 * reads them, so single quotes, no quotes and any order are all one answer.
 */
export function readTags(html: string): TagRead {
  const lineAt = lineIndex(html);
  const out = { rootAbsolute: [] as TagHit[], positiveTabindex: [] as TagHit[], injectedModule: false, skipLink: false };
  for (const t of tags(html)) {
    if (t.closing) continue;
    const attrs = parseAttrs(t.source);
    for (const name of LINK_ATTRS) {
      const v = attrValue(attrs, name);
      if (v !== undefined && ROOT_ABSOLUTE.test(v)) out.rootAbsolute.push({ line: lineAt(t.start), what: `${name}="${v}"` });
    }
    const tab = attrValue(attrs, 'tabindex');
    if (tab !== undefined && /^\s*[1-9]\d*\s*$/.test(tab)) out.positiveTabindex.push({ line: lineAt(t.start), what: `tabindex="${tab.trim()}"` });
    const has = (n: string): boolean => attrs.some((a) => a.name === n);
    if (t.name === 'script' && has('data-kb') && attrValue(attrs, 'type')?.trim().toLowerCase() === 'module') out.injectedModule = true;
    if (t.name === 'a' && (attrValue(attrs, 'class') ?? '').split(/\s+/).includes('sl-skip-link') && (attrValue(attrs, 'href') ?? '').startsWith('#')) {
      out.skipLink = true;
    }
  }
  return out satisfies TagRead;
}

function filesEnding(dir: string, ext: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(ext)) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

const htmlFiles = (dir: string): string[] => filesEnding(dir, '.html');
const markdownFiles = (dir: string): string[] => filesEnding(dir, '.md');

export const spec: GateSpec = {
  name: 'site-portable',
  usage: 'usage: check-site-portable [--dist <dir>]',
  options: ['--dist'],
  run(ctx: GateContext): string {
    const dist = ctx.options.get('--dist') ?? DIST;
    const abs = path.resolve(ctx.root, dist);
    // `--dist ''` must fail like any other missing folder: path.resolve reads
    // '' as the repository itself, which exists.
    if (dist === '' || !fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      ctx.failLine(`no built site at ${dist || "''"} — build it first: make site-build`);
      return '';
    }
    const pages = htmlFiles(abs);
    if (pages.length === 0) {
      ctx.failLine(`no .html files under ${dist} — build it first: make site-build`);
      return '';
    }
    // Every finding path is from the repository root, however --dist was
    // written: absolute, `./`-led or with a trailing slash (contract-C5).
    const shown = (p: string): string => path.relative(ctx.root, p).split(path.sep).join('/');
    const payloadPath = findInDir(abs, PAYLOAD_FILE_NAME) ?? path.join(abs, 'search-index.js');
    const payloadAt = shown(payloadPath);

    for (const file of pages) {
      const rel = shown(file);
      const html = fs.readFileSync(file, 'utf8');
      const read = readTags(html);
      for (const hit of read.rootAbsolute) {
        ctx.fail(rel, `root-absolute reference ${hit.what} — the post-build pass makes links relative; run make site-build`, hit.line);
      }
      for (const hit of read.positiveTabindex) {
        ctx.fail(rel, `positive tabindex ${hit.what} reorders the keyboard walk`, hit.line);
      }
      if (read.injectedModule) ctx.fail(rel, 'a <script type="module"> carrying data-kb — a module never runs from file://');
      // By the attributes the element has, never a quoted spelling (head-C9).
      if (!metaContent(html, 'kb:area')) ctx.fail(rel, 'no <meta name="kb:area" content="…"> — site/src/components/Head/Head.astro emits it');
      if (!read.skipLink) {
        ctx.fail(rel, 'no skip link — every page keeps <a class="sl-skip-link" href="#…">; a build pass lost it');
      }
    }

    let missing = false;
    for (const want of INDEX_FILES) {
      const p = want === 'search-index.js' ? payloadPath : path.join(abs, want);
      if (!fs.existsSync(p) || fs.statSync(p).size === 0) {
        missing = true;
        ctx.fail(shown(p), 'is missing or empty — the post-build passes write it (site/package.json postbuild)');
      }
    }
    if (missing) return '';

    const payload = parsePayload(fs.readFileSync(payloadPath, 'utf8'));
    if (payload === null) {
      ctx.fail(payloadAt, 'is not one `window.kb = {…};` assignment with a pages list — tools/src/site/gen-search-index.ts writes that shape');
      return '';
    }
    const structure = readStructure(ctx.root);
    const indexed = new Set(payload.pages.map((p) => p.route));
    const built = new Set(pages.map((p) => `/${path.relative(abs, p).split(path.sep).join('/')}`));
    for (const route of built) {
      if (!isHubRoute(structure, route) && !indexed.has(route)) {
        ctx.fail(shown(path.join(abs, route)), 'is a built page search cannot find — it is not in search-index.js');
      }
    }
    for (const page of payload.pages) {
      if (!built.has(page.route)) {
        ctx.fail(payloadAt, `indexes ${page.route}, and no such page was built`);
        continue;
      }
      // The page's real anchors, built once: an id a code sample shows, or a
      // `data-id` a diagram carries, is no place a link can land.
      const { anchors } = readLinks(fs.readFileSync(path.join(abs, page.route), 'utf8'));
      for (const h of page.headings) {
        if (h.id !== '' && !anchors.has(h.id)) {
          ctx.fail(payloadAt, `offers ${page.route}#${h.id}, and that page has no element with that id`);
        }
      }
    }

    // Importing the pass for its route helper runs nothing: its `main` call
    // only fires when the file is the program being run.
    const expected = new Set<string>();
    for (const row of placedPages(structure)) {
      if (!fromPageTree(row) || !built.has(row.route)) continue;
      const md = markdownRoute(row.route);
      expected.add(md);
      const at = path.join(abs, md);
      const source = path.join(ctx.root, row.source);
      if (!fs.existsSync(source)) {
        ctx.fail(shown(path.join(abs, row.route)), `its source ${row.source} is not in the repository`);
      } else if (!fs.existsSync(at)) {
        ctx.fail(shown(at), `is missing — the page's "View source" link opens it; site-portable copies ${row.source} there`);
      } else if (!fs.readFileSync(at).equals(fs.readFileSync(source))) {
        ctx.fail(shown(at), `differs from ${row.source} — run make site-build`);
      }
    }
    for (const file of markdownFiles(abs)) {
      if (!expected.has(`/${path.relative(abs, file).split(path.sep).join('/')}`)) {
        ctx.fail(shown(file), 'is a markdown file no page-tree page owns — only a page-tree page ships its source');
      }
    }

    return `[site-portable] ${pages.length} pages portable, indexed, anchored and keyboard-reachable; ${INDEX_FILES.join(' and ')} present; ${expected.size} markdown sources match docs/`;
  },
};

main(spec, import.meta.url);
