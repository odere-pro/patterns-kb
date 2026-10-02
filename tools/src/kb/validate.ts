/**
 * `kb.mjs validate`: one page's structural lint, fast enough for an edit
 * hook, against the page shape, asked of the markdown and the data files:
 *
 *   the page       a structure row lists it, under the area its frontmatter names
 *   frontmatter    a title and a description of at most 160 characters;
 *                  aliases, tags, solves are lists of non-empty strings; 2-5
 *                  tags, each a term of tags.json, in the list the tags gate
 *                  accepts (tools/src/kb/tags.ts)
 *   the dialect    every suffix, fence meta, section fact and id kb-attrs reads
 *   blocks         none missing, none unknown, in the kind's order
 *   explain        one paragraph of 60 to 180 words, a costs list of 2 to 4
 *                  bullets (a pattern needs one), then one example (KB-014)
 *   description    one paragraph of at most 80 words (KB-015)
 *                  A page the kb-shape allowlist names may break these until
 *                  its rewrite lands, under the ratchet its entry covers
 *   sketches       the sketch block's code names its language; every language
 *                  named is one the content model lists, and go only where
 *                  its entry says
 *   relations      each of the page's edges uses a known verb and ends at a page
 *
 * The corpus-wide rules (every edge paired, every tag on three pages) are the
 * gates' work, not this lint's.
 */

import fs from 'node:fs';
import path from 'node:path';

import { listOf, SOLVES_MAX_WORDS, solvesWords, type FmValue } from '../lib/frontmatter.js';
import { descriptionProblems } from '../lib/description-shape.js';
import { COSTS_KIND, explainProblems } from '../lib/explain-shape.js';
import type { Nodes, RootContent } from '../lib/kb-attrs.js';
import { Ratchets, type RatchetEntry } from '../lib/ratchet.js';
import { sidesOf } from '../lib/render-relations.js';

import { readJsonFile, type ContentModel, type Corpus, type Page } from './corpus.js';
import { parsePage, stripFrontmatter, type PageDoc } from './page.js';
import { tagListProblems, tagRules, type TagRules } from './tags.js';

/** The longest description, in characters: where a search result cuts it off (frontmatter-C4). */
export const DESCRIPTION_MAX = 160;

/**
 * A description longer than DESCRIPTION_MAX, in the frontmatter gate's words
 * (the content lane's lib/page-block.ts `descriptionProblem`), or null.
 * Characters, not bytes: an em dash counts once.
 */
export function descriptionLengthProblem(description: string): string | null {
  const length = [...description].length;
  return length > DESCRIPTION_MAX ? `description is ${String(length)} characters — ${String(DESCRIPTION_MAX)} is where search results cut off` : null;
}

/** Missing, unknown and out-of-order blocks, in the words the HTML-era validator used. */
export function blockProblems(present: readonly string[], want: readonly string[], optional: readonly string[]): string[] {
  const problems: string[] = [];
  for (const b of want) if (!present.includes(b) && !optional.includes(b)) problems.push(`missing block "${b}"`);
  for (const b of present) if (!want.includes(b)) problems.push(`unknown block "${b}"`);
  const ordered = present.filter((b) => want.includes(b));
  if (ordered.join(' ') !== want.filter((b) => present.includes(b)).join(' ')) problems.push(`blocks out of order: ${present.join(' ')}`);
  return problems;
}

/** The kb-shape gate's allowlist file, read here so the lint and the gate excuse the same pages. */
const SHAPE_ALLOWLIST = 'docs/data/allow/kb-shape.json';

/**
 * The ratchets of the kb-shape allowlist, one list per rule. An unreadable or
 * malformed list excuses nothing, and so does an entry with no string `match`.
 */
export function shapeRatchets(root: string): Ratchets {
  try {
    const text = fs.readFileSync(path.join(root, SHAPE_ALLOWLIST), 'utf8');
    // A whole run asks once per page: compile the list once per file content.
    if (ratchetCache?.text !== text) {
      const entries = (JSON.parse(text) as { entries?: { match?: unknown }[] }).entries;
      ratchetCache = { text, ratchets: new Ratchets((entries ?? []).filter((e) => typeof e.match === 'string') as RatchetEntry[]) };
    }
    return ratchetCache.ratchets;
  } catch {
    return new Ratchets([]);
  }
}

let ratchetCache: { text: string; ratchets: Ratchets } | undefined;

/** KB-014 and KB-015 problems of the explain and description blocks, less what the page's ratchet entries excuse. */
function shapeMessages(doc: PageDoc, kind: string, source: string, ratchets: Ratchets): string[] {
  const out: string[] = [];
  const explain = doc.blocks.find((x) => x.name === 'explain');
  if (explain !== undefined) {
    for (const p of explainProblems(explain.nodes, { costsRequired: kind === COSTS_KIND })) {
      if (p.ratchet === null || !ratchets.excuses(p.ratchet, source)) out.push(`KB-014 ${p.message}`);
    }
  }
  const description = doc.blocks.find((x) => x.name === 'description');
  if (description !== undefined) {
    for (const p of descriptionProblems(description.nodes)) if (!ratchets.excuses('description', source, p.words)) out.push(`KB-015 ${p.message}`);
  }
  return out;
}

function sketchProblems(doc: PageDoc, langs: readonly string[], only: ContentModel['sketchOnly'], kind: string, area: string): string[] {
  const out: string[] = [];
  const fences = (nodes: readonly Nodes[], acc: { lang: string }[] = []): { lang: string }[] => {
    for (const n of nodes) {
      if (n.type === 'code' && n.lang !== 'mermaid') acc.push({ lang: n.lang ?? '' });
      if ('children' in n) fences(n.children as Nodes[], acc);
    }
    return acc;
  };
  const sketch = doc.blocks.find((b) => b.name === 'sketch');
  if (sketch !== undefined && fences(sketch.nodes).some((f) => f.lang === '')) out.push('sketch code does not name its language');
  for (const f of fences(doc.tree.children as RootContent[])) {
    if (f.lang !== '' && !langs.includes(f.lang)) out.push(`sketch language "${f.lang}" is not in the closed vocabulary (${langs.join('/')})`);
    const rule = only[f.lang];
    if (rule !== undefined && (kind !== rule.kind || area !== rule.area)) out.push(`sketch language "${f.lang}" is for ${rule.kind} pages of area ${rule.area} only — write this sketch in typescript`);
  }
  return out;
}

function listProblem(key: string, v: FmValue | undefined): string | null {
  if (v === undefined) return null;
  const l = listOf(v);
  if (l === null || l.some((x) => x.trim() === '')) return `${key} must be an inline list of non-empty strings`;
  return null;
}

/** The first `solves` phrase over the word cap the shape gate holds (KB-013), or null. */
function solvesLengthProblem(v: FmValue | undefined): string | null {
  const long = (v === undefined ? null : listOf(v))?.find((x) => solvesWords(x) > SOLVES_MAX_WORDS);
  return long === undefined ? null : `a solves phrase is ${solvesWords(long)} words; say the one problem in ${SOLVES_MAX_WORDS} or fewer: "${long}"`;
}

/**
 * Every problem on one page. `page` is its structure row; `fm` its
 * frontmatter, lists split; `doc` its parse, when the caller already has it.
 */
export function pageProblems(
  corpus: Corpus,
  page: Page,
  fm: Readonly<Record<string, FmValue>>,
  text: string,
  rules: TagRules,
  doc: PageDoc = parsePage(text),
): string[] {
  const out: string[] = [];
  const p = (m: string): void => {
    out.push(`${page.slug}: ${m}`);
  };
  const s = (k: string): string => (typeof fm[k] === 'string' ? (fm[k] as string) : '');
  if (s('title').trim() === '') p('frontmatter has no title');
  if (s('description').trim() === '') p('frontmatter has no description');
  const long = descriptionLengthProblem(s('description'));
  if (long !== null) p(long);
  if (s('area') !== page.area) p(`frontmatter area "${s('area')}" but the structure file lists it under "${page.area}"`);
  for (const key of ['aliases', 'tags', 'solves']) {
    const m = listProblem(key, fm[key]);
    if (m !== null) p(m);
  }
  const longSolves = solvesLengthProblem(fm['solves']);
  if (longSolves !== null) p(longSolves);
  const tags = listOf(fm['tags']) ?? [];
  for (const t of tags) if (!rules.terms.has(t)) p(`tag "${t}" is not in the closed vocabulary`);
  if (tags.length < 2 || tags.length > 5) p(`tags carries ${tags.length} tag(s); a page needs 2-5`);
  for (const m of tagListProblems(tags, rules)) p(m);

  // Body lines count from the file's first line: add the frontmatter's.
  const fmLines = text.split('\n').length - stripFrontmatter(text).split('\n').length;
  // parsePage hands kb-attrs the source, so every problem carries its line.
  for (const pr of doc.problems) p(`line ${(pr.line as number) + fmLines}: ${pr.message}`);

  const kind = corpus.model.kinds.find((k) => k.id === page.kind) as { blocks: readonly string[]; optional: readonly string[] };
  for (const m of blockProblems(doc.blocks.map((b) => b.name), kind.blocks, kind.optional)) p(m);
  for (const m of shapeMessages(doc, page.kind, page.source, shapeRatchets(corpus.root))) p(m);
  for (const m of sketchProblems(doc, corpus.model.sketchLangs, corpus.model.sketchOnly, page.kind, page.area)) p(m);

  let sides: ReturnType<typeof sidesOf> = [];
  try {
    sides = sidesOf(page.slug, corpus.relations, corpus.model.verbs);
  } catch (e) {
    p((e as Error).message);
  }
  for (const side of sides) {
    if (corpus.model.verbs[side.verb] === undefined) p(`unknown relation verb "${side.verb}"`);
    if (corpus.page(side.to) === undefined) p(`relation "${side.verb}" names no page "${side.to}"`);
  }
  return out;
}

/**
 * Validate pages by their structure rows, their frontmatter read through the
 * corpus (one spawn for all of them) and each parsed by `docOf`.
 */
export function validatePages(corpus: Corpus, pages: readonly Page[], docOf: (p: Page) => PageDoc = (p) => parsePage(corpus.text(p.slug))): string[] {
  const rules = tagRules(readJsonFile(corpus.root, 'docs/data/tags.json')['terms']);
  return pages.flatMap((page) => pageProblems(corpus, page, corpus.frontmatter(page.slug), corpus.text(page.slug), rules, docOf(page)));
}
