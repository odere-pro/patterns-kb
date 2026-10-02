/**
 * Render docs/reference/search-synonyms.md whole from
 * docs/data/search-synonyms.json. The data file is the single source; the page
 * is a stamped, committed output, so the table reads on GitHub with no build
 * and review sees a new bridge as a diff.
 *
 * The page says what the table is for and who reads it, then lists both
 * layers: `curated` in the file's own order, which a person chose, and
 * `expansions` in key order. Every word sits in a code span: the table is a
 * searcher's vocabulary, some of it words the house bans in prose. A table
 * breaking a rule the synonyms gate names renders nothing, so the page is
 * never built from data that gate would refuse.
 *
 * Usage: gen-search-synonyms            (rewrites docs/reference/search-synonyms.md)
 *        gen-search-synonyms --check    (exit 1 if the page is stale)
 */

import fs from 'node:fs';
import path from 'node:path';

import { factVocabulary, synonymFindings } from '../gates/check-search-synonyms.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { emit, fileStamp } from '../lib/generated.js';

export const SRC = 'docs/data/search-synonyms.json';
export const OUT = 'docs/reference/search-synonyms.md';
export const GENERATOR = 'tools/src/gen/gen-search-synonyms.ts';
/** The repair a stale page names. */
export const FIX = 'make synonyms';

/** The table as the page reads it. */
export interface SynonymTable {
  curated: Record<string, string[]>;
  expansions: Record<string, string[]>;
}

/** A table row's words, each a code span. */
const codes = (xs: readonly string[]): string => xs.map((x) => `\`${x}\``).join(' · ');

export function render(data: SynonymTable): string {
  const curated = Object.entries(data.curated);
  const expansions = Object.entries(data.expansions);
  return [
    '---',
    'title: Search synonyms',
    'description: The words a searcher types that the pages do not use, and the words kb.mjs find reads them as.',
    'area: reference',
    'owner: Oleksandr Derechei',
    'tags: [testing, readability]',
    'status: stable',
    `source: ${SRC}`,
    '---',
    '',
    fileStamp(GENERATOR, SRC),
    '',
    '# Search synonyms',
    '',
    `A bridge from a searcher's word to the pages' words: ${String(curated.length)} curated keys and`,
    `${String(expansions.length)} expansions. \`kb.mjs find\` reads it (\`tools/src/kb/rank.ts\`), and the site's search`,
    'box reads the copy its payload carries (`tools/src/site/gen-search-index.ts`).',
    '',
    `This page is built from [\`search-synonyms.json\`](../data/search-synonyms.json): to change a bridge,`,
    `edit the data file and run \`${FIX}\` (or \`make gen\`). **Search synonyms hold their rules** fails a`,
    'table that breaks one, and **Search synonyms reference in sync** fails when this page and the data',
    'disagree.',
    '',
    '## How a bridge works',
    '',
    'Search matches a query word against a page by word: whole, at the start of a word, or inside one',
    'from four letters, so a word the pages already use finds itself. A bridge pays only where the typed word differs from the pages\' word: `stuck`',
    'finds nothing a page says until it also reads as the words the table lists under it.',
    '',
    '- **Curated wins.** A key in the curated table takes its words whole; the same key under',
    '  expansions would be dead, and the gate fails it.',
    '- **A bridged word scores at half weight**, so a page that uses the typed word itself still wins.',
    '- **Every word a key names is a word of some page\'s facts**: its slug, title, description,',
    '  aliases, tags or `solves`. The gate fails any other.',
    '',
    'How to pick a bridge, and the judgement no gate can make, is the kb-vocab skill\'s',
    '(`.claude/skills/kb-vocab/SKILL.md`, "The synonym table").',
    '',
    '## Curated',
    '',
    '| Typed | Also read as |',
    '| --- | --- |',
    ...curated.map(([k, v]) => `| \`${k}\` | ${codes(v)} |`),
    '',
    '## Expansions',
    '',
    '| Typed | Also read as |',
    '| --- | --- |',
    ...expansions.map(([k, v]) => `| \`${k}\` | ${codes(v)} |`),
    '',
    '## Next steps',
    '',
    'When a synonym gate fails, the triage page says what to do.',
    '',
    '- [Triage a red gate](triage.md#search-synonyms-hold-their-rules) — what each broken rule means and how to fix it.',
    '',
  ].join('\n');
}

export const spec: GateSpec = {
  name: 'search-synonyms-fresh',
  usage: 'usage: gen-search-synonyms [--check]   (--check exits 1 if docs/reference/search-synonyms.md is stale)',
  flags: ['--check'],
  run(ctx: GateContext): string {
    const src = path.join(ctx.root, SRC);
    if (!fs.existsSync(src)) {
      ctx.fail(SRC, 'is missing — the synonyms page is rendered from it (restore it from git)');
      return '';
    }
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(src, 'utf8'));
    } catch {
      ctx.fail(SRC, 'is not valid JSON');
      return '';
    }
    const faults = synonymFindings(data, factVocabulary(ctx.root));
    if (faults.length > 0) {
      for (const what of faults) ctx.fail(SRC, what);
      return '';
    }
    const table = data as SynonymTable;
    const count = `${String(Object.keys(table.curated).length)} curated, ${String(Object.keys(table.expansions).length)} expansions`;
    const result = emit(ctx, { out: OUT, wanted: render(table), fixCommand: FIX, stamp: fileStamp(GENERATOR, SRC) });
    if (ctx.flags.has('--check')) return `[search-synonyms-fresh] ${OUT} is in sync with ${SRC} (${count})`;
    if (result === 'wrote') return `[search-synonyms-fresh] wrote 1 of 1 file: ${OUT} (${count})`;
    if (result === 'skipped') return `[search-synonyms-fresh] left ${OUT} alone: it does not carry this generator's stamp`;
    return `[search-synonyms-fresh] wrote 0 of 1 file: ${OUT} already matches ${SRC}`;
  },
};

main(spec, import.meta.url);
