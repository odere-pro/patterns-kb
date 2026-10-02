/**
 * Every area gets one assembled hub page (spec kb.generation.mirror-and-hubs,
 * hub-generator and hub-order).
 *
 * Runs in the site's `prebuild`, after the mirror. For each area of
 * docs/data/site-structure.json that owns its pages (no `generated` key), has
 * a hub (no `nav` key: a `link` area is one sidebar link and an unpublished
 * `none` area is off the site) and has a child — a page row or a nested area — it writes
 * `site/src/content/docs/<area folder>/index.mdx`, which Astro builds into
 * `<area folder>.html`, beside the folder (spec offline-C1):
 *
 *   frontmatter  the area's label as `title`, its `hub` description and
 *                tags, the area id, the site owner, `status: stable` (a hub
 *                is finished whenever its generator runs, and every input page
 *                declares a status: maturity-C3), and a `source` naming this
 *                generator;
 *   body         the stamp, the area's intro, then one entry per child — route,
 *                title, description, status (`stable` by default), and
 *                for the reader's own marks and the filter bar its slug, tags
 *                and `favourite`, read from each page's own frontmatter. A
 *                nested area is listed from its label and `hub` object (its
 *                tags, no slug), in no group. No next-steps
 *                section: every place a hub could send a reader is already on it.
 *
 * Entries follow the structure file's reading order. A topic tag two or more
 * entries share groups them under the topic's name; the rest lead in one block
 * that never splits; groups and block are then sorted by their first entry's
 * place only when that leaves every entry in reading order (`orderHub`).
 *
 * The output is build output, like the mirror: ignored by git, rebuilt on every
 * build, never checked. A hub file this generator did not stamp is noted and
 * left alone (output-ownership-C3); a stamped hub whose area left the structure
 * file is deleted.
 *
 * Usage: gen-site-hubs   (no arguments)
 */

import fs from 'node:fs';
import path from 'node:path';

import { frontmatterMany, listOf, yamlInlineList, yamlScalar } from '../lib/frontmatter.js';
import { STAMP_PREFIX } from '../lib/generated.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { areaFolder, placedHubs, placedPages, type StructureArea } from '../lib/site-routes.js';
import { CONTENT, generatedFiles, readStructure, removeEmptyDirs, SITE_OWNER, STRUCTURE } from './site-output.js';

const GENERATOR = 'tools/src/site/gen-site-hubs.ts';
const TAGS = 'docs/data/tags.json';

/** One hub entry, as SectionHub renders it. */
export interface HubCard {
  readonly href: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  /** A page's slug, for its favourite and practiced toggles; a nested area's entry has none. */
  readonly slug?: string;
  /** Its tags, which the hub's filter bar reads: a page's own, a nested area's hub tags. */
  readonly tags: readonly string[];
  /** A page's `favourite: true`. */
  readonly favourite?: true;
}

/** A labelled run of entries; the one unlabelled run is the leading block. */
export interface HubGroup {
  readonly label: string;
  readonly pages: readonly HubCard[];
}

/** An entry before ordering: its card, its reading-order place and its topic. */
export interface Placed {
  readonly card: HubCard;
  readonly rank: number;
  readonly topic?: string;
}

/**
 * The spec's hub order. Entries sort by rank. A topic two or more entries share
 * becomes a group, named by `label`, in the order topics are first seen; the
 * rest stay in one leading block. Then the block and the groups are sorted by
 * their first entry's rank — kept only when every entry then reads in rank
 * order (mirror-and-hubs-C6, C7).
 */
export function orderHub(entries: readonly Placed[], label: (topic: string) => string = (t) => t): HubGroup[] {
  const sorted = [...entries].sort((a, b) => a.rank - b.rank);
  const count = new Map<string, number>();
  for (const e of sorted) if (e.topic !== undefined) count.set(e.topic, (count.get(e.topic) ?? 0) + 1);

  const block: Placed[] = [];
  const groups = new Map<string, Placed[]>();
  for (const e of sorted) {
    if (e.topic === undefined || (count.get(e.topic) as number) < 2) block.push(e);
    else groups.set(e.topic, [...(groups.get(e.topic) ?? []), e]);
  }
  const runs = [
    ...(block.length > 0 ? [{ label: '', placed: block }] : []),
    ...[...groups].map(([topic, placed]) => ({ label: label(topic), placed })),
  ];
  const first = (r: { placed: Placed[] }): number => (r.placed[0] as Placed).rank;
  const reordered = [...runs].sort((a, b) => first(a) - first(b));
  const ranks = reordered.flatMap((r) => r.placed.map((p) => p.rank));
  const chosen = ranks.every((r, i) => i === 0 || (ranks[i - 1] as number) <= r) ? reordered : runs;
  return chosen.map((r) => ({ label: r.label, pages: r.placed.map((p) => p.card) }));
}

/** The stamp every hub opens with, in MDX's comment syntax (output-ownership-C2). */
export function hubStamp(source: string): string {
  return `{/* ${STAMP_PREFIX} ${GENERATOR} from ${source}. Do not edit this file. */}`;
}

/** Text MDX would read as markup, written so it reads as text. */
export function mdxText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/[{}]/g, (c) => `\\${c}`);
}

/** The whole hub page. */
export function renderHub(area: StructureArea, folder: string, groups: readonly HubGroup[]): string {
  const source = `${folder}/ frontmatter`;
  const up = '../'.repeat(folder.split('/').length + 2);
  return [
    '---',
    `title: ${yamlScalar(area.label)}`,
    `description: ${yamlScalar(area.hub.description)}`,
    `area: ${area.id}`,
    `owner: ${yamlScalar(SITE_OWNER)}`,
    `tags: ${yamlInlineList(area.hub.tags)}`,
    'status: stable',
    `source: ${yamlScalar(`generated by ${GENERATOR} from ${source}`)}`,
    '---',
    '',
    hubStamp(source),
    '',
    `import SectionHub from '${up}components/SectionHub/SectionHub.astro';`,
    '',
    mdxText(area.hub.intro),
    '',
    `<SectionHub groups={${JSON.stringify(groups)}} />`,
    '',
  ].join('\n');
}

/** tag id → facet and label, from the tag file; an unreadable file groups nothing. */
function readTopics(root: string): { topic: (tag: string) => boolean; label: (tag: string) => string } {
  let terms: { id: string; facet: string; label?: string }[] = [];
  try {
    terms = (JSON.parse(fs.readFileSync(path.join(root, TAGS), 'utf8')) as { terms: typeof terms }).terms;
  } catch {
    // The tags gate owns that file's health; a hub simply goes ungrouped.
  }
  const byId = new Map(terms.map((t) => [t.id, t]));
  return {
    topic: (tag) => byId.get(tag)?.facet === 'topic',
    label: (tag) => byId.get(tag)?.label ?? tag,
  };
}

export const spec: GateSpec = {
  name: 'gen-site-hubs',
  usage: 'usage: gen-site-hubs   (no arguments)',
  run(ctx: GateContext): string {
    const structure = readStructure(ctx.root);
    const pages = placedPages(structure);
    const hubs = placedHubs(structure);
    const topics = readTopics(ctx.root);
    const facts = frontmatterMany(
      ctx.root,
      pages.filter((p) => fs.existsSync(path.join(ctx.root, p.source))).map((p) => p.source),
      { lists: true },
    );

    // A nested area sits where its first page does, so a hub listing areas
    // reads in the same order as the file.
    const firstRank = new Map<string, number>();
    for (const p of pages) {
      for (let at: string | undefined = p.area; at !== undefined; at = structure.areas.find((a) => a.id === at)?.nestUnder) {
        if (!firstRank.has(at)) firstRank.set(at, p.rank);
      }
    }

    // An area a reader can open: one with a hub (a `link` or `none` area has
    // none) that has pages, holds such an area, or has its own generator write
    // it. Only those are listed by their parent, so no hub links a hub that is
    // never written.
    const opens = (id: string): boolean => {
      if (!hubs.some((h) => h.area === id)) return false;
      const area = structure.areas.find((a) => a.id === id) as StructureArea;
      return area.generated !== undefined || area.pages.length > 0 || structure.areas.some((a) => a.nestUnder === id && opens(a.id));
    };

    const content = path.join(ctx.root, CONTENT);
    const wanted = new Map<string, string>();
    for (const area of structure.areas) {
      const hub = hubs.find((h) => h.area === area.id);
      if (area.generated !== undefined || hub === undefined) continue;
      const entries: Placed[] = [];
      for (const p of pages.filter((pg) => pg.area === area.id)) {
        const fm = facts.get(p.source) ?? {};
        const title = fm['title'];
        if (typeof title !== 'string' || title === '') {
          ctx.fail(p.source, `has no title — the ${area.id} hub lists every page by its title`);
          continue;
        }
        const tags = listOf(fm['tags']) ?? [];
        const topic = tags.find((t) => topics.topic(t));
        entries.push({
          card: {
            href: p.route,
            title,
            description: String(fm['description'] ?? ''),
            status: String(fm['status'] ?? 'stable'),
            slug: p.slug,
            tags: [...tags],
            ...(fm['favourite'] === 'true' ? { favourite: true as const } : {}),
          },
          rank: p.rank,
          ...(topic === undefined ? {} : { topic }),
        });
      }
      for (const child of structure.areas.filter((a) => a.nestUnder === area.id && opens(a.id))) {
        const route = (hubs.find((h) => h.area === child.id) as (typeof hubs)[number]).route;
        entries.push({
          card: { href: route, title: child.label, description: child.hub.description, status: 'stable', tags: [...child.hub.tags] },
          rank: firstRank.get(child.id) ?? Number.MAX_SAFE_INTEGER,
        });
      }
      if (entries.length === 0) continue;
      wanted.set(hub.contentPath, renderHub(area, areaFolder(structure, area.id), orderHub(entries, topics.label)));
    }
    if (ctx.findings > 0) return '';

    // A stamped hub of an area that left the file goes, like a mirrored page.
    for (const rel of generatedFiles(ctx.root, CONTENT)) {
      const inContent = rel.slice(CONTENT.length + 1);
      if (!rel.endsWith('/index.mdx') || wanted.has(inContent)) continue;
      if (fs.readFileSync(path.join(ctx.root, rel), 'utf8').includes(`${STAMP_PREFIX} ${GENERATOR}`)) {
        fs.rmSync(path.join(ctx.root, rel));
      }
    }
    removeEmptyDirs(content);

    let written = 0;
    for (const [rel, text] of wanted) {
      const out = path.join(content, rel);
      if (fs.existsSync(out) && !fs.readFileSync(out, 'utf8').includes(`${STAMP_PREFIX} ${GENERATOR}`)) {
        ctx.note(`note: ${CONTENT}/${rel} is hand-written — leaving it alone`);
        continue;
      }
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, text);
      written += 1;
    }
    return `[gen-site-hubs] wrote ${written} hub pages from ${STRUCTURE}`;
  },
};

main(spec, import.meta.url);
