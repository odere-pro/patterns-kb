/**
 * The KB's own page rules, KB-001 to KB-016 on docs/reference/page-rules.md:
 * what the page shape of spec kb.content.page-shape does not say, because it
 * is this knowledge base's and no other's (plans/harness-optimize.md, P3a).
 *
 *   KB-000  the two data files the rules read are there and readable
 *   KB-001  a page sits where the structure file's row says, in its area
 *   KB-002  a slug names one page
 *   KB-003  a kind page's blocks: the kind's, in its order, the required ones present
 *   KB-004  the suffix and fence-meta grammar
 *   KB-005  retired: reading levels are gone, and no rule emits it
 *   KB-006  section facts: closed keys and values, on the line under a heading
 *   KB-007  polarity groups, each under its own block
 *   KB-008  requirement groups, under a design's requirements
 *   KB-009  element ids: kebab-case and unique on the page
 *   KB-010  a code sketch names one of the sketch languages; a restricted one (go) only where its entry allows
 *   KB-011  retired: the three-rung explain ladder is gone
 *   KB-012  retired: no reading lens exists to leave a block empty at
 *   KB-013  the KB's own keys: aliases, solves, favourite
 *   KB-014  the explain block: one paragraph of 60 to 180 words, a costs list of 2 to 4
 *           bullets (required on a pattern), then one example
 *   KB-015  the description block: one paragraph of at most 80 words
 *   KB-016  the selfcheck block, where a kind allows it: three blockquotes, each a bold
 *           question and a short answer citing an element id
 *
 * Every closed list comes from the measured tree, never from this file: the
 * kinds, their blocks, the fact values and the sketch languages from
 * `docs/data/content-model.json`, the areas and their rows from
 * `docs/data/site-structure.json`. The suffix, fact and id grammar is read by
 * the one reader of the dialect's data layer, `parseKb` in `lib/kb-attrs.ts`,
 * whose problems this gate files under the rule each breaks (dialect D-26).
 *
 * The measured set is computed: every page the structure file publishes, plus
 * every page under a kind folder — the one no row lists is exactly what KB-001
 * exists for. A page's kind is its top folder under docs/ (dialect D-11); a
 * page outside the kind folders (the reference pages) is held to KB-001 and
 * KB-002 only. Named files narrow the set and never widen it: a named file
 * outside it (the trap inbox, the docs map, a layer) is skipped, so a run over
 * the files a change touched finds nothing the whole run would not. Naming
 * the structure file or the content model widens it back to the whole set,
 * which either decides.
 *
 * A slug belongs to the page a row lists: when two pages share one, the
 * finding lands on the page no row lists, or on the later row.
 *
 * A page matched by `docs/data/allow/kb-shape.json` may break three rules while
 * its rewrite is pending, each an entry's `covers` (lib/ratchet.ts): `explain`
 * (a missing example, a word bound on the paragraph), `costs` (a pattern's
 * missing costs list) and `description` (a block over 80 words or in several
 * paragraphs, held to the entry's `maxWords` when it has one, so a page cannot
 * grow). Nothing else is excusable: one paragraph, no bold label and a
 * well-formed example or costs list when there is one stay strict. An entry
 * that excuses nothing is a finding, so an entry goes once its pages are rewritten.
 *
 * Findings print in the rule-id shape, `KB-0nn <file>:<line> <message>`, with
 * the rule's anchor appended.
 *
 * Usage: check-kb-shape [file …]   (0 pass · 1 findings · 2 misuse)
 */

import fs from 'node:fs';
import path from 'node:path';

import { readAllowlist } from '../lib/allowlist.js';
import { descriptionProblems } from '../lib/description-shape.js';
import { COSTS_KIND, explainProblems } from '../lib/explain-shape.js';
import { selfcheckProblems } from '../lib/selfcheck-shape.js';
import { gitFiles } from '../lib/exec.js';
import { frontmatterMany, listOf, SOLVES_MAX_WORDS, solvesWords, type FmValue } from '../lib/frontmatter.js';
import { main, UsageError, type GateContext, type GateSpec } from '../lib/gate.js';
import { parseKb, plainText, readKb, type KbProblem, type Nodes, type Root } from '../lib/kb-attrs.js';
import { blankFrontmatter, keyLine, mdLines } from '../lib/md-lines.js';
import { ratchetProblem, Ratchets, type Ratchet, type RatchetEntry } from '../lib/ratchet.js';
import { regimeOf, STRUCTURE } from './check-doc-frontmatter.js';
import { RULES_PAGE } from './check-docs-style.js';

export const NAME = 'kb-shape';

export const CONTENT_MODEL = 'docs/data/content-model.json';

/** The page-level exceptions: pages whose explain block or description awaits a rewrite (KB-014, KB-015). */
export const ALLOWLIST = 'docs/data/allow/kb-shape.json';

/** Each rule's id, by what it holds. */
export const RULE = {
  inputs: 'KB-000',
  placement: 'KB-001',
  slug: 'KB-002',
  blocks: 'KB-003',
  suffix: 'KB-004',
  fact: 'KB-006',
  polarity: 'KB-007',
  requirement: 'KB-008',
  id: 'KB-009',
  sketch: 'KB-010',
  keys: 'KB-013',
  explain: 'KB-014',
  description: 'KB-015',
  selfcheck: 'KB-016',
} as const;

/**
 * The rule ids that stay on the rules page as anchors and are never emitted:
 * an id never changes meaning and is never reused.
 */
export const RETIRED_RULES = ['KB-005', 'KB-011', 'KB-012'] as const;

/** How many `solves` a page other than a theme lists (KB-013). */
export const SOLVES_MIN = 3;
export const SOLVES_MAX = 5;

/** The kind that carries no `solves`: a theme is a tour, not a problem. */
export const NO_SOLVES_KIND = 'theme';

export interface Kind {
  readonly id: string;
  readonly folder: string;
  readonly blocks: readonly string[];
  readonly optional: readonly string[];
}

export interface ContentModel {
  readonly kinds: readonly Kind[];
  readonly blockFacts: ReadonlySet<string>;
  readonly sketchLangs: ReadonlySet<string>;
  /** A sketch language that only some pages may use: its id, with the kind and area that may. */
  readonly sketchOnly: ReadonlyMap<string, { readonly kind: string; readonly area: string }>;
}


/** The content model's closed lists, or null with a finding when it cannot be read. */
export function readContentModel(root: string): ContentModel | null {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(root, CONTENT_MODEL), 'utf8')) as {
      kinds?: Kind[];
      facts?: { block?: string[] };
      sketchLangs?: { id: string; only?: { kind: string; area: string } }[];
    };
    if (!Array.isArray(data.kinds) || !Array.isArray(data.facts?.block) || !Array.isArray(data.sketchLangs)) return null;
    const only = new Map(data.sketchLangs.flatMap((l) => (l.only === undefined ? [] : [[l.id, l.only] as const])));
    return { kinds: data.kinds, blockFacts: new Set(data.facts.block), sketchLangs: new Set(data.sketchLangs.map((l) => l.id)), sketchOnly: only };
  } catch {
    return null;
  }
}

export interface Row {
  readonly area: string;
  readonly slug: string;
  readonly source: string;
  /** The row's line in the structure file. */
  readonly line: number;
}

/** Every row of the structure file, with the line it sits on, or null when it cannot be read. */
export function readRows(root: string): Row[] | null {
  let text: string;
  let data: { areas?: { id?: unknown; pages?: { slug?: unknown; source?: unknown }[] }[] };
  try {
    text = fs.readFileSync(path.join(root, STRUCTURE), 'utf8');
    data = JSON.parse(text) as typeof data;
  } catch {
    return null;
  }
  if (!Array.isArray(data.areas)) return null;
  const lines = text.split('\n');
  const lineOf = (source: string): number => {
    // The row's own line, however the file is laid out; the file's first when no line holds it alone.
    const i = lines.findIndex((l) => l.replace(/\s+/g, '').includes(`"source":${JSON.stringify(source)}`));
    return i === -1 ? 1 : i + 1;
  };
  const rows: Row[] = [];
  for (const a of data.areas) {
    for (const p of a.pages ?? []) {
      if (typeof a.id !== 'string' || typeof p.slug !== 'string' || typeof p.source !== 'string') continue;
      rows.push({ area: a.id, slug: p.slug, source: p.source, line: lineOf(p.source) });
    }
  }
  return rows;
}

/** The rule a problem from `parseKb` breaks. */
export function ruleOf(p: KbProblem): string {
  if (p.rule === 'suffix') return /"#[^"]*" is not an id/.test(p.message) ? RULE.id : RULE.suffix;
  if (p.rule === 'id') return RULE.id;
  if (/^"?polarity\b/.test(p.message)) return RULE.polarity;
  if (/^"?requirement\b/.test(p.message)) return RULE.requirement;
  return RULE.fact;
}

export interface Finding {
  readonly id: string;
  readonly line: number;
  readonly message: string;
  /** The ratchet an allowlist entry of this gate may excuse it under (lib/ratchet.ts). */
  readonly ratchet?: Ratchet;
  /** The description's words, for a ratchet entry's `maxWords`. */
  readonly words?: number;
}

/** A block heading, as the walk records it. */
interface Section {
  readonly block: string;
  readonly line: number;
}

/** A parsed node's line: every node `parseKb` hands back has a position. */
const lineOf = (n: Nodes): number => (n.position as NonNullable<Nodes['position']>).start.line;

/** The dialect reader's problems as findings, each under the rule it breaks. */
export function problemFindings(problems: readonly KbProblem[]): Finding[] {
  return problems.map((p) => ({ id: ruleOf(p), line: p.line ?? 1, message: p.message }));
}

/**
 * The body findings of one kind page: its blocks, its data layer, its
 * sketches and its explain block.
 */
export function bodyFindings(text: string, kind: Kind, model: ContentModel, area = ''): Finding[] {
  const out: Finding[] = [];
  const add = (id: string, line: number, message: string): void => {
    out.push({ id, line, message });
  };
  const { tree, problems } = parseKb(blankFrontmatter(text));
  out.push(...problemFindings(problems));

  const sections = blockSections(tree, kind, model, add);
  const order = kind.blocks.join(', ');
  const present = new Set(sections.map((s) => s.block));
  const lastLine = text.split('\n').length;
  for (const [i, b] of kind.blocks.entries()) {
    if (present.has(b) || kind.optional.includes(b)) continue;
    const next = sections.find((s) => kind.blocks.indexOf(s.block) > i);
    add(RULE.blocks, next?.line ?? lastLine, `no "${b}" block — every ${kind.id} page carries it (${order})`);
  }

  // KB-010: a fence is a mermaid figure or a sketch in one of the languages.
  const langs = [...model.sketchLangs].join(', ');
  const walk = (node: Nodes): void => {
    if (node.type === 'code') {
      const lang = node.lang ?? '';
      if (lang === '') add(RULE.sketch, lineOf(node), `a fence with no language — a sketch names one of ${langs}, a figure mermaid`);
      else if (lang !== 'mermaid' && !model.sketchLangs.has(lang)) add(RULE.sketch, lineOf(node), `sketch language "${lang}" is not one of ${langs}`);
      else if (model.sketchOnly.has(lang)) {
        const only = model.sketchOnly.get(lang) as { kind: string; area: string };
        if (kind.id !== only.kind || area !== only.area) add(RULE.sketch, lineOf(node), `sketch language "${lang}" is for ${only.kind} pages of area ${only.area} only — write this sketch in typescript`);
      }
    }
    if ('children' in node) for (const c of node.children as Nodes[]) walk(c);
  };
  walk(tree);

  // KB-014: the explain block.
  const explain = blockNodes(tree, 'explain');
  if (explain !== null) {
    for (const p of explainProblems(explain.nodes, { costsRequired: kind.id === COSTS_KIND })) {
      out.push({ id: RULE.explain, line: p.line ?? explain.line, message: p.message, ...(p.ratchet === null ? {} : { ratchet: p.ratchet }) });
    }
  }

  // KB-015: the description block.
  const description = blockNodes(tree, 'description');
  if (description !== null) {
    for (const p of descriptionProblems(description.nodes)) {
      out.push({ id: RULE.description, line: p.line ?? description.line, message: p.message, ratchet: 'description', ...(p.words === undefined ? {} : { words: p.words }) });
    }
  }

  // KB-016: the selfcheck block, when the page carries one.
  const selfcheck = blockNodes(tree, 'selfcheck');
  if (selfcheck !== null) {
    for (const p of selfcheckProblems(selfcheck.nodes)) add(RULE.selfcheck, p.line ?? selfcheck.line, p.message);
  }
  return out;
}

/**
 * The H2 sections of a kind page, checked as the walk meets them (KB-003,
 * KB-006): each carries a block fact, a block of its kind, once, in order.
 */
function blockSections(tree: Root, kind: Kind, model: ContentModel, add: (id: string, line: number, message: string) => void): Section[] {
  const out: Section[] = [];
  let last = -1;
  for (const node of tree.children) {
    if (node.type !== 'heading' || node.depth !== 2) continue;
    const line = lineOf(node);
    const block = readKb(node)?.facts?.['block'];
    if (block === undefined) {
      add(RULE.blocks, line, `the section "${plainText(node)}" carries no block fact — every section of a ${kind.id} page is one of its blocks (<!--meta block=…--> on the line under it)`);
      continue;
    }
    if (!model.blockFacts.has(block)) {
      add(RULE.fact, line, `block=${block} is no block of ${CONTENT_MODEL}`);
      continue;
    }
    const at = kind.blocks.indexOf(block);
    if (at === -1) {
      add(RULE.blocks, line, `block "${block}" is not a ${kind.id} block — a ${kind.id} page carries ${kind.blocks.join(', ')}`);
      continue;
    }
    if (out.some((s) => s.block === block)) {
      add(RULE.blocks, line, `block "${block}" appears twice — a block is one section`);
      continue;
    }
    if (at < last) add(RULE.blocks, line, `block "${block}" comes after "${kind.blocks[last] as string}" — a ${kind.id} page orders its blocks ${kind.blocks.join(', ')}`);
    last = Math.max(last, at);
    out.push({ block, line });
  }
  return out;
}

/** The nodes under a page's heading for `block`, with the heading's line; null when it has none. */
function blockNodes(tree: Root, block: string): { nodes: Nodes[]; line: number } | null {
  const at = tree.children.findIndex((n) => n.type === 'heading' && n.depth === 2 && readKb(n)?.facts?.['block'] === block);
  if (at === -1) return null;
  const nodes: Nodes[] = [];
  for (const n of tree.children.slice(at + 1)) {
    if (n.type === 'heading' && n.depth <= 2) break;
    nodes.push(n);
  }
  return { nodes, line: lineOf(tree.children[at] as Nodes) };
}

/** The KB's own keys (KB-013), for a page of `kind`. */
export function keyFindings(text: string, fm: Readonly<Record<string, FmValue>>, kind: Kind): Finding[] {
  const out: Finding[] = [];
  const lines = mdLines(text);
  const at = (key: string): number => Math.max(1, keyLine(lines, key));
  if ('aliases' in fm && listOf(fm['aliases']) === null) out.push({ id: RULE.keys, line: at('aliases'), message: 'aliases is not an inline list — write `aliases: [a, b]`, or `[]`' });
  if (kind.id === NO_SOLVES_KIND) {
    if ('solves' in fm) out.push({ id: RULE.keys, line: at('solves'), message: 'a theme carries no solves — a theme is a tour, and its description carries the search weight' });
  } else if (!('solves' in fm)) {
    out.push({ id: RULE.keys, line: 1, message: `no solves — a ${kind.id} page lists ${String(SOLVES_MIN)} to ${String(SOLVES_MAX)} symptoms, in the words of someone who has the problem` });
  } else {
    const solves = listOf(fm['solves']);
    if (solves === null) out.push({ id: RULE.keys, line: at('solves'), message: 'solves is not an inline list — write `solves: [first symptom, "a symptom, with a comma"]`' });
    else if (solves.length < SOLVES_MIN || solves.length > SOLVES_MAX) {
      out.push({ id: RULE.keys, line: at('solves'), message: `${String(solves.length)} solves — keep the ${String(SOLVES_MIN)} to ${String(SOLVES_MAX)} that read most like the symptom` });
    }
    for (const phrase of solves ?? []) {
      const words = solvesWords(phrase);
      if (words > SOLVES_MAX_WORDS) {
        out.push({ id: RULE.keys, line: at('solves'), message: `a solves phrase is ${String(words)} words — say the one problem in ${String(SOLVES_MAX_WORDS)} or fewer: "${phrase}"` });
      }
    }
  }
  if ('favourite' in fm && fm['favourite'] !== 'true') out.push({ id: RULE.keys, line: at('favourite'), message: `favourite is "${String(fm['favourite'])}" — it is true, or absent` });
  return out;
}

/** A page this gate measures: a markdown page of the page regime under docs/. */
const measured = (f: string): boolean => f.startsWith('docs/') && f.endsWith('.md') && regimeOf(f) === 'page';

export const spec: GateSpec = {
  name: NAME,
  usage: 'usage: check-kb-shape [file ...]   (no files: every published page and every page under a kind folder)',
  positional: true,
  run(ctx: GateContext): string {
    for (const f of ctx.args) {
      if (!fs.existsSync(path.join(ctx.root, f))) throw new UsageError(`no such file: ${f}`);
    }
    const emit = (f: string, x: Finding): void => ctx.failRaw(`${x.id} ${f}:${String(x.line)} ${x.message} (${RULES_PAGE}#${x.id})`);
    const model = readContentModel(ctx.root);
    if (model === null) emit(CONTENT_MODEL, { id: RULE.inputs, line: 1, message: 'is missing or lacks kinds, facts.block or sketchLangs — the closed lists this gate reads' });
    const rows = readRows(ctx.root);
    if (rows === null) emit(STRUCTURE, { id: RULE.inputs, line: 1, message: 'is missing or has no areas list — the rows this gate places pages by' });
    if (model === null || rows === null) return '';

    const folders = new Map(model.kinds.map((k) => [k.folder, k]));
    const kindOf = (f: string): Kind | undefined => folders.get(f.split('/')[1] as string);
    const there = (f: string): boolean => fs.existsSync(path.join(ctx.root, f));
    const listedPages = [...new Set(rows.map((r) => r.source).filter(measured))];
    const inKindFolders = gitFiles(ctx.root, [...folders.keys()].map((d) => `docs/${d}/`)).filter(measured);
    const everyPage = [...new Set([...listedPages, ...inKindFolders])].sort();

    const named = ctx.args.map((f) => f.replace(/^\.\//, ''));
    const whole = named.length === 0 || named.some((f) => f === STRUCTURE || f === CONTENT_MODEL);

    // KB-001 and KB-002 on the structure file itself: a row naming no page, a slug unlike its file.
    if (whole) {
      for (const r of rows) {
        if (r.source.startsWith('docs/') && !fs.existsSync(path.join(ctx.root, r.source))) {
          emit(STRUCTURE, { id: RULE.placement, line: r.line, message: `the row "${r.slug}" in area "${r.area}" names ${r.source}, which is not on disk` });
        }
        if (r.source.startsWith('docs/') && path.posix.basename(r.source, '.md') !== r.slug) {
          emit(STRUCTURE, { id: RULE.slug, line: r.line, message: `the row "${r.slug}" names ${r.source} — a row's slug is its page's file name` });
        }
      }
    }

    const wanted = new Set(named);
    const files = everyPage.filter((f) => (whole || wanted.has(f)) && there(f));
    // Who owns a slug: the pages the rows list, in row order, then the pages
    // no row lists — so a stray copy is the one blamed, not the page it copies.
    const bySlug = new Map<string, string>();
    for (const f of [...listedPages, ...inKindFolders].filter(there)) {
      const slug = path.posix.basename(f, '.md');
      if (!bySlug.has(slug)) bySlug.set(slug, f);
    }
    const rowsBySource = new Map<string, Row[]>();
    for (const r of rows) rowsBySource.set(r.source, [...(rowsBySource.get(r.source) ?? []), r]);

    const entries = readAllowlist(ctx, ALLOWLIST, {
      missing: 'the pages whose explain block or description awaits a rewrite are listed in it, and the list may be empty',
      emptyReason: 'has no reason — say which rewrite batch the pages wait for',
      excusesFailures: true,
    });
    // A withheld list (null) excuses nothing: the ratchets over it are empty.
    for (const e of entries ?? []) {
      const bad = ratchetProblem(e as RatchetEntry);
      if (bad !== null) ctx.fail(ALLOWLIST, `entry "${e.name}" ${bad}`);
    }
    const allow = new Ratchets((entries ?? []) as RatchetEntry[]);

    const fms = frontmatterMany(ctx.root, files, { lists: true });
    let kindPages = 0;
    for (const f of files) {
      const text = fs.readFileSync(path.join(ctx.root, f), 'utf8');
      const fm = fms.get(f) as Record<string, FmValue>;
      const lines = mdLines(text);
      const findings: Finding[] = [];

      const listed = rowsBySource.get(f) ?? [];
      const area = typeof fm['area'] === 'string' ? fm['area'] : '';
      if (listed.length === 0) {
        findings.push({ id: RULE.placement, line: 1, message: `no area of ${STRUCTURE} lists this page — add its row, or move the page to the path its row names` });
      } else if (listed.length > 1) {
        findings.push({ id: RULE.placement, line: 1, message: `${String(listed.length)} rows list this page (${listed.map((r) => r.area).join(', ')}) — a page sits in one area` });
      } else if (area !== (listed[0] as Row).area) {
        findings.push({ id: RULE.placement, line: Math.max(1, keyLine(lines, 'area')), message: `area "${area}", but the row that lists this page is in area "${(listed[0] as Row).area}"` });
      }
      const slug = path.posix.basename(f, '.md');
      const owner = bySlug.get(slug);
      if (owner !== undefined && owner !== f) findings.push({ id: RULE.slug, line: 1, message: `slug "${slug}" is also ${owner} — a slug names one page` });

      const kind = kindOf(f);
      if (kind !== undefined) {
        kindPages += 1;
        findings.push(...keyFindings(text, fm, kind), ...bodyFindings(text, kind, model, area));
      }
      // An entry excuses a finding of its ratchet, and only on a page it names.
      const kept = findings.filter((x) => x.ratchet === undefined || !allow.excuses(x.ratchet, f, x.words));
      for (const x of kept.sort((a, b) => a.line - b.line || a.id.localeCompare(b.id))) emit(f, x);
    }
    // An entry none of the measured pages needed is stale; only a whole run can say so.
    if (whole && entries !== null) {
      for (const e of allow.unused()) ctx.fail(ALLOWLIST, `entry "${e.name}" excuses nothing — its pages pass without it; delete it`);
    }
    return `[${NAME}] OK — ${String(files.length)} page(s) placed and named, ${String(kindPages)} kind page(s) keep the rules of ${RULES_PAGE}`;
  },
};

main(spec, import.meta.url);
