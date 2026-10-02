/**
 * `docs/README.md` is the map. This gate makes it one (spec:
 * kb.content.docs-map, map-gate).
 *
 * Both directions, because both fail silently:
 *   map → tree   a row pointing at a page that was renamed or deleted reads as
 *                a working link and fails whoever follows it.
 *   tree → map   a page nobody links from the map is a page nobody finds.
 *
 * The map is two levels, not one. A page counts as mapped when the map links
 * it, or when a hub the map links does. A hub is a target under the page tree
 * named `README.md`; any other target is an ordinary page, whose links map
 * nothing (docs-map-C3). The dead links of a hub the map links are the hub's
 * findings, and a hub the map names that is not there is read as linking
 * nothing, so each page it listed is reported too.
 *
 * Link targets are parsed from the text, never from table rows (docs-map-C4):
 * one cell can hold several links. They are read by the one link-reading
 * convention, `lib/links.ts`, from the text a reader follows links in
 * (`linkableText`): never in the frontmatter block, code, a code span or an
 * HTML comment, so a commented-out row maps nothing. Only `.md` targets
 * count, and a target is there only when its case matches the file's.
 *
 * A page is a markdown file git lists under the page tree, committed or not,
 * and on disk (docs-map-C6). Two are exempt (docs-map-C5): the map itself and
 * the page tree's own layer, `docs/CLAUDE.md`. A nested layer and a dated
 * record are pages here and need their link.
 *
 * Usage: check-docs-map   (no arguments; exit 1 on either direction)
 */

import fs from 'node:fs';
import path from 'node:path';

import { gitFiles } from '../lib/exec.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { linkTargets, onDiskExactly, resolveTarget } from '../lib/links.js';
import { linkableText } from '../lib/md-lines.js';

export const NAME = 'docs-map';

/** The one top page every page is reached from. */
export const MAP = 'docs/README.md';

/** The page tree. */
export const PAGE_TREE = 'docs/';

/** The page tree's own layer: a context layer, not a page, and never mapped. */
export const LAYER = 'docs/CLAUDE.md';

const EXEMPT: ReadonlySet<string> = new Set([MAP, LAYER]);

/** The `.md` files one file links to, repo-relative; none when the file is not there. */
export function markdownLinksOf(root: string, file: string): string[] {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const t of linkTargets(linkableText(fs.readFileSync(abs, 'utf8')))) {
    const r = resolveTarget(file, t);
    if (r !== null && r.endsWith('.md')) out.push(r);
  }
  return out;
}

/** A hub: a link target under the page tree named README.md, the map aside. */
export const isHub = (target: string): boolean => target.startsWith(PAGE_TREE) && path.posix.basename(target) === 'README.md' && target !== MAP;

const sorted = (xs: readonly string[]): string[] => [...new Set(xs)].sort();

export const spec: GateSpec = {
  name: NAME,
  usage: 'usage: check-docs-map   (no arguments: the map and the page tree must reach each other)',
  run(ctx: GateContext): string {
    const there = onDiskExactly(ctx.root);
    if (!there(MAP)) {
      ctx.fail(MAP, 'is missing — the docs map is the one page every page is reached from');
      return '';
    }

    const pages = gitFiles(ctx.root, [PAGE_TREE]).filter((f) => f.endsWith('.md') && !EXEMPT.has(f) && there(f));

    // map → tree: every link the map makes, and every link a hub it names makes, lands.
    const top = markdownLinksOf(ctx.root, MAP);
    const hubs = sorted(top.filter(isHub));
    for (const t of sorted(top)) {
      if (!there(t)) ctx.fail(MAP, `links ${t}, which does not exist — fix the row or delete it`);
    }
    const mapped = new Set(top);
    for (const hub of hubs) {
      const listed = markdownLinksOf(ctx.root, hub);
      for (const t of sorted(listed)) if (!there(t)) ctx.fail(hub, `links ${t}, which does not exist`);
      for (const t of listed) mapped.add(t);
    }

    // tree → map: every page is one link from the map, or two through a hub.
    for (const page of pages) {
      if (!mapped.has(page)) {
        ctx.fail(page, `no link from ${MAP}, directly or from a hub it links — an unlisted page is a page nobody finds`);
      }
    }

    return `[${NAME}] OK — ${MAP} reaches ${String(pages.length)} page(s) through ${String(hubs.length)} hub(s), and every link on it leads somewhere`;
  },
};

main(spec, import.meta.url);
