/**
 * Render docs/reference/tags.md from docs/data/tags.json (spec: kb.data.tags,
 * reference-generator).
 *
 * The tag list is the single source; the markdown is a generated, committed
 * page so the closed list is readable on GitHub and on the site without a
 * build step, and so review sees a term being added. It is what an author
 * reads before picking a tag, and a list nobody can find is a list everybody
 * works around.
 *
 * Usage: gen-taxonomy            (rewrites docs/reference/tags.md)
 *        gen-taxonomy --check    (exit 1 if the page is stale — the CI gate)
 */

import fs from 'node:fs';
import path from 'node:path';

import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { emit, fileStamp } from '../lib/generated.js';
import { COUNTS, FACETS, parseTagList, TAG_LIST, termsOf, type TagList } from '../lib/tags.js';

export const NAME = 'tags-fresh';
export const GENERATOR = 'tools/src/gen/gen-taxonomy.ts';
export const OUT = 'docs/reference/tags.md';
export const FIX = 'make taxonomy';

/** A table cell: the only character that can break one is the column divider. */
const cell = (s: string): string => s.replace(/\|/g, '\\|');

/** What a term's `applies` reads as in a sentence, rather than as a JSON array. */
export function classes(applies: readonly string[]): string {
  const page = applies.includes('page');
  const exercise = applies.includes('exercise');
  if (page && exercise) return 'pages and exercises';
  if (page) return 'pages';
  if (exercise) return 'exercises';
  return 'nothing';
}

const HEADINGS: Record<string, string> = { topic: 'Topics', skill: 'Skills', language: 'Languages' };

export function render(data: TagList): string {
  const facets = data.facets as Record<string, string>;
  const terms = termsOf(data).map((t) => ({
    id: String(t.id),
    facet: String(t.facet),
    label: typeof t.label === 'string' ? t.label : '',
    definition: String(t.definition),
    applies: (Array.isArray(t.applies) ? t.applies : []).map(String),
  }));
  const count = (facet: string): number => terms.filter((t) => t.facet === facet).length;
  const { page, exercise } = COUNTS;

  const out: string[] = [
    '---',
    'title: Tags',
    'description: Every tag a page may carry, the facet it sits in, what it means, and the rules for writing a page\'s tags.',
    'area: reference',
    'owner: Oleksandr Derechei',
    'tags: [testing, validation]',
    'status: stable',
    `source: ${TAG_LIST}`,
    '---',
    '',
    fileStamp(GENERATOR, TAG_LIST),
    '',
    '# Tags',
    '',
    `One closed list of ${String(terms.length)} tags for every page in this knowledge base: ${String(count('topic'))} topics, ${String(count('skill'))} skills and ${String(count('language'))} languages.`,
    '',
    `This page is built from [\`${TAG_LIST}\`](../data/tags.json): edit that file and run \`make taxonomy\``,
    '(or `make gen`). The **Tags** gate fails a page that carries a tag not listed here, or carries its',
    'tags out of the rules below.',
    '',
    '## How a page is tagged',
    '',
    'Tags are written inline, never as a block list:',
    '',
    '```yaml',
    'tags: [resilience, isolation, latency]',
    '```',
    '',
    'The frontmatter parser returns a block list as an empty string, so a page written the other way',
    'loses every tag it has and still renders — which is why the gate checks the form rather than',
    'trusting it.',
    '',
    `A page carries **${String(page.min)}-${String(page.max)} tags** and exactly **one topic**, written first: the topic is what`,
    'the page is about, and the heading its hub groups it under. After the topic come the skills, then',
    `the languages. An exercise carries ${String(exercise.min)}-${String(exercise.max)} tags and may span several topics.`,
    '',
    '## Facets',
    '',
    '| Facet | What it answers |',
    '| --- | --- |',
    ...FACETS.map((f) => `| \`${f}\` | ${cell(facets[f] ?? '')} |`),
    '',
  ];

  for (const facet of FACETS) {
    const group = terms.filter((t) => t.facet === facet);
    if (group.length === 0) continue;
    out.push(`## ${HEADINGS[facet] as string}`, '');
    if (facet === 'topic') {
      out.push(
        'A topic is the one tag that groups: an area hub collects the pages that share one under the',
        'heading in the second column.',
        '',
        '| Tag | Heading it groups under | Meaning | Used on |',
        '| --- | --- | --- | --- |',
        ...group.map((t) => `| \`${t.id}\` | ${cell(t.label)} | ${cell(t.definition)} | ${classes(t.applies)} |`),
        '',
      );
      continue;
    }
    out.push(
      '| Tag | Meaning | Used on |',
      '| --- | --- | --- |',
      ...group.map((t) => `| \`${t.id}\` | ${cell(t.definition)} | ${classes(t.applies)} |`),
      '',
    );
  }

  out.push(
    '## Adding a term',
    '',
    'Add one only together with the pages that earn it: every term is used on three pages or more, and',
    'a term no page uses is a finding, not a spare part — an unused tag cannot be told from a rename',
    'somebody landed halfway.',
    '',
    `Four files change together: the term in [\`${TAG_LIST}\`](../data/tags.json), the same id in the`,
    '`TAGS` tuple in `site/src/lib/types.ts` — which the site\'s content schema builds its tag enum from —',
    'the pages that earn it, and this page, which `make taxonomy` rewrites. The gate holds the list and',
    'the tuple to each other in both directions.',
    '',
  );

  return `${out.join('\n')}\n`;
}

export const spec: GateSpec = {
  name: NAME,
  usage: 'usage: gen-taxonomy [--check]   (--check exits 1 if docs/reference/tags.md is stale)',
  flags: ['--check'],
  run(ctx: GateContext): string {
    const src = path.join(ctx.root, TAG_LIST);
    if (!fs.existsSync(src)) {
      ctx.fail(TAG_LIST, 'is missing — docs/reference/tags.md is rendered from it');
      return '';
    }
    const data = parseTagList(fs.readFileSync(src, 'utf8'));
    if (data === null || typeof data.facets !== 'object' || data.facets === null || !Array.isArray(data.terms)) {
      ctx.fail(TAG_LIST, 'is not a tag list (an object with `facets` and `terms`) — the tags gate names what is wrong');
      return '';
    }
    const result = emit(ctx, { out: OUT, wanted: render(data), fixCommand: FIX, stamp: fileStamp(GENERATOR, TAG_LIST) });
    const terms = termsOf(data).length;
    if (ctx.flags.has('--check')) return `[${NAME}] ${OUT} is in sync with ${TAG_LIST} (${String(terms)} terms)`;
    if (result === 'skipped') return `[${NAME}] left ${OUT} alone: it does not carry this generator's stamp`;
    // The shape every generator's summary shares: `wrote <n> of <m> …`.
    return `[${NAME}] wrote ${result === 'wrote' ? '1' : '0'} of 1 file: ${OUT} (${String(terms)} terms)`;
  },
};

main(spec, import.meta.url);
