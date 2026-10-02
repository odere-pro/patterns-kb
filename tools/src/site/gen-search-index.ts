/**
 * The search payload: what the search box needs to take a reader to a page,
 * in one classic script (spec kb.pagedata.search, payload-pass and
 * payload-format; interfaces/manifest-and-search.md).
 *
 * Runs in the site's `postbuild`, straight after tools/src/site/site-portable.ts,
 * and reads the manifest that pass writes:
 *
 *     dist/index.json            route, title, description, area, status, tags,
 *                                aliases, solves, headings
 *   + dist/**.html               the row anchors, which the manifest leaves out
 *   + docs/data/site-structure.json   each page's kind: its top area
 *   + docs/data/prerequisites.json    requires and related
 *   + each page's markdown source     its `favourite: true`
 *   + docs/data/glossary.json    the terms the box defines beside its results
 *   + docs/data/tags.json        tag id → label (`tagLabels`)
 *   + docs/data/search-synonyms.json   the synonym table the rule scores with (`synonyms`)
 *   → dist/search-index.js       window.kb = { pages, terms, tagLabels, synonyms };
 *
 * A NAVIGATION INDEX, NOT A FULL-TEXT ONE. Each page carries its declared
 * facts and the places a hit can land — title, route, kind, area, status,
 * tags, categories (its area chain's labels and its kind's word), aliases,
 * solves, description, requires and related, its H2 and H3
 * headings and its row anchors — and none of its prose. The ranking reads
 * facts alone (tools/src/lib/search-score.ts measures why), so prose only
 * ever fed the snippet under a row, at nine tenths of the payload; a row now
 * quotes the `solves` phrase it answers instead. This departs from the spec's
 * `body` field (search-C1) on purpose: search helps a reader navigate, and
 * the page itself is one click away.
 *
 * Every page but the hubs: a hub's whole content is the titles and
 * descriptions of the pages under it, so listing one puts a second result in
 * front of a reader for every query its children already answer. Which routes
 * are hubs is `isHubRoute`, the predicate the coverage check shares.
 *
 * `aliases` and `solves` come from the manifest like every other page fact
 * (search-C2). So does `status`, which the learning extension adds
 * (maturity-C6): the declared value, unchanged. An entry with none is a
 * finding naming its route, never a silent `stable` — the manifest copies it
 * from the head, which always has one.
 *
 * A page whose frontmatter says `favourite: true` carries `favourite: true`,
 * so the marks page can list the editors' picks beside the reader's own stars;
 * every other page carries no such key.
 *
 * A page whose record in docs/data/prerequisites.json has an edge carries it
 * (prerequisites-C9): `requires` and `related`, each the neighbour records'
 * routes in the file's order, so a result can show its neighbours by the
 * titles the payload already holds. A page with no edge carries neither.
 *
 * A `.js` file assigning one global, and not `.json`, because a page opened
 * from a folder cannot fetch anything, and it is a classic script for the same
 * reason the bundle is: a module never executes from `file://`. No page loads
 * it up front: the search box adds the script the first time it opens
 * (site/src/components/Search/search.client.ts).
 *
 * The glossary, docs/data/glossary.json, is the vocabulary's one home: its
 * terms fill the box's definition cards. A missing glossary is a finding
 * (exit 1) and nothing is written, as the spec asks: a payload with no terms
 * would look whole and define nothing.
 *
 * HEADINGS ARE THE FILE'S BIGGEST PART, so each is written compactly
 * (`encodeHeadings` in tools/src/lib/search-score.ts): `[id, text]`, or the bare
 * text when it has no id; the search box decodes them on load. None is dropped,
 * since the ranker scores every heading's text. The file's size is held by the
 * build's budget gate, tools/src/gates/check-site-budget.ts, not here: that
 * gate is the one place the number lives.
 *
 * Usage: gen-search-index [--dist <dir>] [--quiet]
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { knowledgeRegion, stripTags } from '../lib/built-page.js';
import { frontmatterMany } from '../lib/frontmatter.js';
import { main, UsageError, type GateContext, type GateSpec } from '../lib/gate.js';
import { encodeHeadings, type SearchPage, type SearchTerm, type Synonyms, type WirePayload } from '../lib/search-score.js';
import { categoriesFor, readSynonymTable, readTagLabels } from '../lib/search-tree.js';
import { areaChain, isHubRoute, placedPages, type Structure } from '../lib/site-routes.js';
import { loadCards } from '../lib/site-prerequisites.js';
import { readStructure } from './site-output.js';

export const GLOSSARY = 'docs/data/glossary.json';

/** One entry of dist/index.json, as far as this file reads it. */
interface ManifestPage {
  route: string;
  title: string;
  description: string;
  area: string;
  status?: string;
  tags: string[];
  aliases?: string[];
  solves?: string[];
  headings: { depth: number; id: string; text: string }[];
}

/**
 * The anchored table rows of one page: `{ id, text }` per row with an id and a
 * row-header cell, whose text is that cell's — never an attribute, which would
 * copy visible text into the data layer (search-C4, C5). A row with an id and
 * no row header is skipped: there is no honest label to give it.
 */
export function rowAnchors(html: string): { id: string; text: string }[] {
  const region = knowledgeRegion(html);
  if (!region) return [];
  const body = html.slice(region[0], region[1]);
  const out: { id: string; text: string }[] = [];
  for (const row of body.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr\s*>/gi)) {
    const id = /\bid=(["'])([\s\S]*?)\1/i.exec(row[1] as string);
    const header = /<th\b[^>]*\bscope=(["'])row\1[^>]*>([\s\S]*?)<\/th\s*>/i.exec(row[2] as string);
    if (!id || !header) continue;
    const text = stripTags(header[2] as string);
    if (text) out.push({ id: id[2] as string, text });
  }
  return out;
}

/** The glossary's terms, each with its aliases (an empty list when it has none). */
export function termsFrom(json: string): SearchTerm[] {
  const parsed = JSON.parse(json) as { terms?: { id?: string; term?: string; definition?: string; aliases?: string[] }[] };
  return (parsed.terms ?? [])
    .filter((t) => t.id && t.term && t.definition)
    .map((t) => ({
      id: t.id as string,
      term: t.term as string,
      definition: t.definition as string,
      aliases: Array.isArray(t.aliases) ? t.aliases : [],
    }));
}

/** A page's kind: the top area its area nests under, or null for an area the file does not hold. */
export function kindOf(structure: Structure, area: string): string | null {
  try {
    return (areaChain(structure, area)[0] as { id: string }).id;
  } catch {
    return null;
  }
}

/**
 * The file: one statement assigning one global, U+2028 and U+2029 escaped —
 * both legal in a JSON string, both line terminators to a script parser
 * (search-C1).
 */
export function render(pages: SearchPage[], terms: SearchTerm[], tagLabels: Record<string, string> = {}, synonyms: Synonyms = {}): string {
  const data: WirePayload = {
    pages: pages.map((p) => ({ ...p, headings: encodeHeadings(p.headings) })),
    terms,
    tagLabels,
    synonyms: synonyms as Record<string, string[]>,
  };
  const payload = JSON.stringify(data).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `window.kb = ${payload};\n`;
}

export const spec: GateSpec = {
  name: 'gen-search-index',
  usage: 'usage: gen-search-index [--dist <dir>] [--quiet]',
  flags: ['--quiet'],
  options: ['--dist'],
  run(ctx: GateContext): string {
    const dist = path.resolve(ctx.root, ctx.options.get('--dist') ?? path.join('site', 'dist'));
    const shown = path.relative(ctx.root, dist) || '.';
    const manifestFile = path.join(dist, 'index.json');
    if (!existsSync(manifestFile)) {
      throw new UsageError(
        `${shown}/index.json is missing — tools/src/site/site-portable.ts writes it after the build. Build the site: make site-build`,
      );
    }
    const entries = (JSON.parse(readFileSync(manifestFile, 'utf8')) as { pages?: ManifestPage[] }).pages ?? [];
    if (entries.length === 0) {
      ctx.fail(`${shown}/index.json`, 'lists no pages');
      return '';
    }

    const structure = readStructure(ctx.root);
    const cards = loadCards(ctx.root);
    // The markdown each route is mirrored from, which names the page's kind. A
    // structure file without the rows is the structure gate's to report.
    const sources = new Map<string, string>(structure.areas.every((a) => Array.isArray(a.pages)) ? placedPages(structure).map((p) => [p.route, p.source]) : []);
    // The editors' picks, from each page's own frontmatter: one read for the
    // sources that exist (a page the structure holds with no file is the
    // structure gate's to report).
    const readable = [...new Set(sources.values())].filter((s) => s !== '' && existsSync(path.join(ctx.root, s)));
    const facts = readable.length === 0 ? new Map<string, Record<string, string>>() : frontmatterMany(ctx.root, readable);
    const pages: SearchPage[] = [];
    for (const entry of entries) {
      if (isHubRoute(structure, entry.route)) continue;
      const file = path.join(dist, entry.route);
      if (!existsSync(file)) {
        ctx.fail(`${shown}/index.json`, `lists ${entry.route}, and no such page was built`);
        continue;
      }
      if (entry.status === undefined || entry.status === '') {
        ctx.fail(`${shown}/index.json`, `${entry.route} has no status — the manifest copies it from the page's kb:status meta; rebuild the site: make site-build`);
        continue;
      }
      const kind = kindOf(structure, entry.area);
      if (kind === null) {
        ctx.fail(`${shown}/index.json`, `${entry.route} is filed under area '${entry.area}', which docs/data/site-structure.json does not hold`);
        continue;
      }
      const card = cards.get(entry.route);
      const categories = categoriesFor(structure, entry.area, sources.get(entry.route) ?? '');
      pages.push({
        route: entry.route,
        title: entry.title,
        kind,
        description: entry.description,
        area: entry.area,
        status: entry.status,
        tags: entry.tags,
        categories,
        aliases: entry.aliases ?? [],
        solves: entry.solves ?? [],
        headings: [
          ...entry.headings.filter((h) => h.depth <= 3).map((h) => ({ id: h.id, text: h.text })),
          ...rowAnchors(readFileSync(file, 'utf8')),
        ],
        ...(card === undefined ? {} : { requires: card.requires.map((l) => l.route), related: card.related.map((l) => l.route) }),
        ...(facts.get(sources.get(entry.route) ?? '')?.['favourite'] === 'true' ? { favourite: true as const } : {}),
      });
    }

    let terms: SearchTerm[] = [];
    const glossary = path.join(ctx.root, GLOSSARY);
    if (!existsSync(glossary)) {
      ctx.fail(GLOSSARY, 'is missing — the search box defines its terms from it; restore the file from git');
    } else {
      try {
        terms = termsFrom(readFileSync(glossary, 'utf8'));
      } catch (err) {
        ctx.fail(GLOSSARY, `is not valid JSON: ${(err as Error).message}`);
      }
    }
    if (ctx.findings > 0) return '';

    const out = path.join(dist, 'search-index.js');
    writeFileSync(out, render(pages, terms, readTagLabels(ctx.root), readSynonymTable(ctx.root)));
    const bytes = statSync(out).size;
    if (ctx.flags.has('--quiet')) return '';
    return `[gen-search-index] ${pages.length} pages, ${terms.length} terms, ${bytes} bytes`;
  },
};

main(spec, import.meta.url);
