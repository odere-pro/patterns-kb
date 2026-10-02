/**
 * The synonym table's rules (KB extension; the kb-vocab skill's "The synonym
 * table"): docs/data/search-synonyms.json bridges the words a searcher types
 * to the words the pages use, and kb.mjs find reads it (tools/src/kb/rank.ts).
 * A bridge that breaks a rule never fires, or fires on the wrong pages, and
 * nothing else would say so: the table loads, and the search simply finds less.
 *
 * Two layers, `curated` and `expansions`, each an object of key → targets.
 * Every key, in both:
 *   - is a lowercase word of letters only, two or more of them — a query
 *     word is split on spaces and only words of two letters or more score
 *     (search-score.ts, queryTerms), so `ai` and `ml` can be keys, and a
 *     digit is never a stem or a synonym;
 *   - is not a stopword (search-score.ts, STOP): the scorer drops it first;
 *   - has one to four targets, none repeated and none the key itself;
 *   - names only targets in the corpus vocabulary: the words, two letters
 *     or more, of every page-tree page's declared facts (slug, title,
 *     description, aliases, tags, solves), which is what both scorers match a
 *     synonym against. A target outside it matches no fact of any page.
 * Every `expansions` key also:
 *   - names no target that contains the key, since the scorers match by
 *     substring and the key already found that word (the rule is one way:
 *     `alerting → alert` is the point of a bridge);
 *   - is not a `curated` key too: a curated key takes its value whole, so the
 *     expansion would be dead;
 *   - sits in sorted order, so a diff shows one key added or dropped.
 * And `expansionMeta.entries` counts the `expansions` keys. The meta's hash
 * and date are a hand stamp at a release boundary; no rule reads them.
 *
 * `curated` keeps its hand-picked order and may bridge a word to a longer one
 * (`cache → cached`): it is the small layer where a person chose every pair.
 * What no program can check stays the skill's: a target that means something
 * else in this corpus, a target on forty pages, a bridge added for the count.
 *
 * Usage: check-search-synonyms   (no arguments)
 */

import fs from 'node:fs';
import path from 'node:path';

import { frontmatterMany, listOf, type FmValue } from '../lib/frontmatter.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { STOP } from '../lib/search-score.js';
import { fromPageTree, placedPages } from '../lib/site-routes.js';
import { readStructure } from '../site/site-output.js';

export const SRC = 'docs/data/search-synonyms.json';

/** The most targets one key may name. */
export const MAX_TARGETS = 4;

/** A key the scorers can use: a lowercase word of two letters or more. */
export const KEY = /^[a-z]{2,}$/;

/** The words, two letters or more, lowercased, of a text. */
export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 2);
}

/**
 * The corpus vocabulary: every word of every page-tree page's declared facts.
 * A row whose file is gone adds nothing; the structure gate names it.
 */
export function factVocabulary(root: string): Set<string> {
  const placed = placedPages(readStructure(root))
    .filter(fromPageTree)
    .filter((p) => fs.existsSync(path.join(root, p.source)));
  const fm = frontmatterMany(
    root,
    placed.map((p) => p.source),
    { lists: true },
  );
  const out = new Set<string>();
  const text = (v: FmValue | undefined): string => (typeof v === 'string' ? v : '');
  for (const p of placed) {
    const f = fm.get(p.source) as Record<string, FmValue>;
    const facts = [p.slug, text(f['title']), text(f['description']), ...['aliases', 'tags', 'solves'].flatMap((k) => listOf(f[k]) ?? [])];
    for (const w of wordsOf(facts.join(' '))) out.add(w);
  }
  return out;
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Every broken rule of the table, one message each, in file order; empty when it holds. */
export function synonymFindings(data: unknown, vocabulary: ReadonlySet<string>): string[] {
  if (!isObject(data)) return ['is not a JSON object'];
  const out: string[] = [];
  const layers: Record<string, Record<string, unknown>> = {};
  for (const layer of ['curated', 'expansions']) {
    const table = data[layer];
    if (!isObject(table)) out.push(`\`${layer}\` is missing or is not an object of key → targets`);
    else layers[layer] = table;
  }
  for (const [layer, table] of Object.entries(layers)) {
    for (const [key, raw] of Object.entries(table)) {
      const at = `${layer} "${key}"`;
      if (!KEY.test(key)) out.push(`${at}: a key is a lowercase word of two letters or more, letters only`);
      else if (STOP.has(key)) out.push(`${at}: a stopword, which the scorer drops before any synonym is read`);
      if (!Array.isArray(raw) || !raw.every((t) => typeof t === 'string')) {
        out.push(`${at}: its value is not a list of words`);
        continue;
      }
      const targets = raw as string[];
      if (targets.length < 1 || targets.length > MAX_TARGETS) out.push(`${at}: ${String(targets.length)} targets — a key names 1 to ${String(MAX_TARGETS)}`);
      const seen = new Set<string>();
      for (const t of targets) {
        if (seen.has(t)) out.push(`${at}: names "${t}" twice`);
        seen.add(t);
        if (t === key) out.push(`${at}: names itself`);
        else if (layer === 'expansions' && t.includes(key)) out.push(`${at}: "${t}" contains the key, which already matches it — drop the target`);
        if (!vocabulary.has(t)) out.push(`${at}: "${t}" is in no page's declared facts, so it matches nothing — pick a word the pages use`);
      }
    }
  }
  const expansions = layers['expansions'];
  if (expansions !== undefined) {
    const keys = Object.keys(expansions);
    for (let i = 1; i < keys.length; i += 1) {
      if ((keys[i - 1] as string) > (keys[i] as string)) out.push(`expansions "${keys[i] as string}": out of order, after "${keys[i - 1] as string}" — keep the keys sorted`);
    }
    const curated = layers['curated'] ?? {};
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(curated, k)) out.push(`expansions "${k}": curated holds the key too, and takes its value whole, so this one is dead — merge it into curated`);
    }
    const meta = data['expansionMeta'];
    const entries = isObject(meta) ? meta['entries'] : undefined;
    if (entries !== keys.length) {
      out.push(`expansionMeta.entries is ${String(entries)}, and expansions holds ${String(keys.length)} keys — set it to the count`);
    }
  }
  return out;
}

export const spec: GateSpec = {
  name: 'search-synonyms',
  usage: 'usage: check-search-synonyms   (no arguments)',
  run(ctx: GateContext): string {
    const src = path.join(ctx.root, SRC);
    if (!fs.existsSync(src)) {
      ctx.fail(SRC, 'is missing — kb.mjs find reads its synonyms from it (restore it from git)');
      return '';
    }
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(src, 'utf8'));
    } catch {
      ctx.fail(SRC, 'is not valid JSON');
      return '';
    }
    const vocabulary = factVocabulary(ctx.root);
    for (const what of synonymFindings(data, vocabulary)) ctx.fail(SRC, what);
    if (ctx.findings > 0) return '';
    const table = data as { curated: object; expansions: object };
    return (
      `[search-synonyms] ${SRC} holds its rules: ${String(Object.keys(table.curated).length)} curated and ` +
      `${String(Object.keys(table.expansions).length)} expansion keys, every target in the ${String(vocabulary.size)} words of the pages' facts`
    );
  },
};

main(spec, import.meta.url);
