/**
 * The KB's own page rules, KB-001 to KB-016 of docs/reference/page-rules.md:
 * placement, slugs, block order per kind, the dialect's data layer, sketch
 * languages, the KB's frontmatter keys, the explain block, the description block and the selfcheck block. Findings are in
 * the rule-id shape and carry the rule's anchor.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { KIND_BODY, PAGE_ALPHA, PAGE_GUIDE, PAGE_THEME, pagesTree, pageText, structureJson, THEME_BODY } from '../lib/fixtures.js';
import { capture, expectFail, expectMisuse, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from '../lib/sandbox.js';
import { RULES_PAGE } from './check-docs-style.js';
import { ALLOWLIST, problemFindings, readContentModel, readRows, RETIRED_RULES, RULE, ruleOf, spec } from './check-kb-shape.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
  pagesTree(sb);
  allow([]);
});
afterEach(() => sb.cleanup());

/** The real tree is 380-odd pages: on a loaded machine one run outlasts the suite's default. */
const REAL_TREE_TIMEOUT = 180_000;

const ALPHA_KEYS = ['aliases: [A]', 'solves: [one symptom, another symptom, a third symptom]'];

/** The kb-shape allowlist, with one entry per `match`, each covering `covers` (the explain ratchet by default). */
function allow(matches: readonly string[], covers?: string, maxWords?: number): void {
  const entries = matches.map((match, i) => ({
    name: `batch-${String(i + 1)}`,
    match,
    ...(covers === undefined ? {} : { covers }),
    ...(maxWords === undefined ? {} : { maxWords }),
    reason: 'awaits its rewrite',
    owner: 'Oleksandr Derechei',
    since: '2026-10-01',
  }));
  sb.write(ALLOWLIST, `${JSON.stringify({ version: 1, updated: '2026-10-01', note: 'fixture', entries }, null, 2)}\n`);
}

/** Rewrite the pattern page's body; the block keeps its KB keys unless `extra` says otherwise. */
function alpha(body: string, extra: string[] = ALPHA_KEYS): void {
  sb.write(PAGE_ALPHA, pageText({ extra }, body));
}

/** The line of the first line of `file` holding `needle`. */
const lineOf = (file: string, needle: string): number => sb.read(file).split('\n').findIndex((l) => l.includes(needle)) + 1;

/** Run the gate and hand back its finding lines as `ID file:line`, messages dropped. */
async function found(argv: string[] = []): Promise<string[]> {
  const r = await sb.run(spec, argv);
  return r.err
    .split('\n')
    .filter((l) => /^KB-\d{3} /.test(l))
    .map((l) => l.split(' ').slice(0, 2).join(' '));
}

describe('a clean tree', () => {
  it('passes, counting the placed pages and the kind pages', async () => {
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe(`[kb-shape] OK — 3 page(s) placed and named, 2 kind page(s) keep the rules of ${RULES_PAGE}`);
  });

  it('holds the real tree', async () => {
    const r = await capture(spec, [], REPO_ROOT);
    expectPass(r);
    expect(Number(/(\d+) kind page/.exec(r.out)?.[1])).toBeGreaterThan(380);
  }, REAL_TREE_TIMEOUT);

  it('prints each finding in the rule-id shape with its anchor, and nothing on stdout', async () => {
    alpha(KIND_BODY.replace('```typescript', '```cobol'));
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.out).toBe('');
    const at = lineOf(PAGE_ALPHA, '```cobol');
    expect(r.err.trim()).toBe(`KB-010 ${PAGE_ALPHA}:${String(at)} sketch language "cobol" is not one of typescript, text, go (${RULES_PAGE}#KB-010)`);
  });
});

describe('KB-001 · placement', () => {
  it('fails a page under a kind folder that no row lists', async () => {
    sb.write('docs/patterns/caching/beta.md', pageText({ title: 'Beta', extra: ALPHA_KEYS }, KIND_BODY));
    expect(await found()).toEqual(['KB-001 docs/patterns/caching/beta.md:1']);
  });

  it('fails a page that names no area at all, on line 1', async () => {
    sb.write(PAGE_GUIDE, pageText({ title: 'Guide', area: null }));
    expectFail(await sb.run(spec), `KB-001 ${PAGE_GUIDE}:1 area "", but the row that lists this page is in area "reference"`);
  });

  it('fails a page two rows list, and an area unlike its row', async () => {
    sb.write('docs/data/site-structure.json', structureJson({ caching: [PAGE_ALPHA], 'themes-data': [PAGE_THEME, PAGE_ALPHA], reference: [PAGE_GUIDE] }));
    sb.write(PAGE_GUIDE, pageText({ title: 'Guide', area: 'caching' }));
    const r = await sb.run(spec);
    expectFail(r, `${PAGE_ALPHA}:1 2 rows list this page (caching, themes-data) — a page sits in one area`);
    expectFail(r, `KB-001 ${PAGE_GUIDE}:4 area "caching", but the row that lists this page is in area "reference"`);
  });

  it('fails a row naming a page that is not on disk, on the row', async () => {
    sb.rm(PAGE_GUIDE);
    const r = await sb.run(spec);
    const at = lineOf('docs/data/site-structure.json', `"source": "${PAGE_GUIDE}"`);
    expectFail(r, `KB-001 docs/data/site-structure.json:${String(at)} the row "guide" in area "reference" names ${PAGE_GUIDE}, which is not on disk`);
  });
});

describe('KB-002 · slugs', () => {
  it('fails a second page under a slug already taken', async () => {
    sb.write('docs/themes/alpha.md', pageText({ title: 'Alpha', area: 'themes-data' }, THEME_BODY));
    sb.write('docs/data/site-structure.json', structureJson({ caching: [PAGE_ALPHA], 'themes-data': [PAGE_THEME, 'docs/themes/alpha.md'], reference: [PAGE_GUIDE] }));
    expect(await found()).toEqual(['KB-002 docs/themes/alpha.md:1']);
  });

  it('blames the page no row lists, even where its folder sorts before the listed page', async () => {
    // buffers/ sorts before caching/: the stray copy is still the one to move or rename.
    sb.write('docs/patterns/buffers/alpha.md', sb.read(PAGE_ALPHA));
    expect(await found()).toEqual(['KB-001 docs/patterns/buffers/alpha.md:1', 'KB-002 docs/patterns/buffers/alpha.md:1']);
    const r = await sb.run(spec);
    expectFail(r, `KB-002 docs/patterns/buffers/alpha.md:1 slug "alpha" is also ${PAGE_ALPHA} — a slug names one page`);
  });

  it('fails a row whose slug is not its page file name', async () => {
    sb.write('docs/data/site-structure.json', sb.read('docs/data/site-structure.json').replace('"slug": "guide"', '"slug": "handbook"'));
    const r = await sb.run(spec);
    expectFail(r, `the row "handbook" names ${PAGE_GUIDE} — a row's slug is its page's file name`);
  });
});

describe('KB-003 · blocks per kind', () => {
  it('fails a section with no block fact', async () => {
    alpha(`${KIND_BODY}\n## Notes\n\nLoose.\n`);
    expect(await found()).toEqual([`KB-003 ${PAGE_ALPHA}:${String(lineOf(PAGE_ALPHA, '## Notes'))}`]);
  });

  it('fails a block of another kind, a block twice and a block out of order', async () => {
    const dup = KIND_BODY.replace('## How it relates', '## Explained again\n<!--meta block=explain-->\n\nAgain.\n\n## Requirements\n<!--meta block=requirements-->\n\nNone.\n\n## How it relates');
    alpha(dup);
    const r = await sb.run(spec);
    expectFail(r, 'block "explain" appears twice — a block is one section');
    expectFail(r, 'block "requirements" is not a pattern block — a pattern page carries description, explain, tradeoffs, usage, sketch, selfcheck, relationships');

    const swapped = KIND_BODY.replace(/## Trade-offs[^]*?(?=## Sketch)/, '').replace('## How it relates', `${/## Trade-offs[^]*?(?=## Sketch)/.exec(KIND_BODY)?.[0] ?? ''}## How it relates`);
    alpha(swapped);
    expectFail(await sb.run(spec), 'block "tradeoffs" comes after "sketch" — a pattern page orders its blocks description, explain, tradeoffs, usage, sketch, selfcheck, relationships');
  });

  it('fails a missing required block at the next block, or at the end, and lets an optional one go', async () => {
    alpha(KIND_BODY.replace(/## Sketch[^]*?(?=## How it relates)/, ''));
    expect(await found()).toEqual([`KB-003 ${PAGE_ALPHA}:${String(lineOf(PAGE_ALPHA, '## How it relates'))}`]);
    alpha(KIND_BODY.replace(/## How it relates[^]*$/, ''));
    const r = await sb.run(spec);
    expectFail(r, 'no "relationships" block — every pattern page carries it');
    expect(r.err).toContain(`${PAGE_ALPHA}:${String(sb.read(PAGE_ALPHA).split('\n').length)} `);
  });
});

describe('KB-004 to KB-009 · the data layer', () => {
  it('files each problem of the dialect reader under its rule', async () => {
    alpha(
      KIND_BODY.replace('and it does it well.', 'and it does it well. {size=big}')
        .replace('- Cheap.', '- Cheap. {level=basic}')
        .replace('## Trade-offs', '## Trade-offs {level=advanced}')
        .replace('- Fast.', '- Fast. {#Fast}')
        .replace('- Stale.', '- Stale. {#pro-dup}\n- Old. {#pro-dup}')
        .replace('<!--meta polarity=con-->', '<!--meta polarity=when-->')
        .replace('It pairs with its neighbours.', 'It pairs with its neighbours.\n\n<!--meta block=relationships-->\n\n### Needs\n<!--meta requirement=fr-->\n\n- One.\n\n### Odd\n<!--meta colour=red-->\n\n- Two.'),
    );
    const got = await found();
    const at = (needle: string): string => `${PAGE_ALPHA}:${String(lineOf(PAGE_ALPHA, needle))}`;
    expect(got).toEqual(
      [
        `KB-004 ${at('{size=big}')}`,
        `KB-004 ${at('{level=basic}')}`,
        `KB-004 ${at('## Trade-offs')}`,
        `KB-009 ${at('{#Fast}')}`,
        `KB-007 ${at('### Cons')}`,
        `KB-009 ${at('- Old.')}`,
        `KB-006 ${PAGE_ALPHA}:${String(lineOf(PAGE_ALPHA, 'It pairs') + 2)}`,
        `KB-008 ${at('### Needs')}`,
        `KB-006 ${at('<!--meta colour=red-->')}`,
      ].sort((a, b) => Number(a.split(':')[1]) - Number(b.split(':')[1]) || a.localeCompare(b)),
    );
  });

  it('fails a section fact with a blank line between it and its heading, and still reads it', async () => {
    alpha(KIND_BODY.replace('### Cons\n<!--meta polarity=con-->', '### Cons\n\n<!--meta polarity=con-->'));
    const at = lineOf(PAGE_ALPHA, '<!--meta polarity=con-->');
    expect(await found()).toEqual([`KB-006 ${PAGE_ALPHA}:${String(at)}`]);
    expectFail(await sb.run(spec), 'a section fact sits on the line right under its heading — delete the blank line between them');
  });

  it('fails a block value no content model lists', async () => {
    alpha(KIND_BODY.replace('<!--meta block=sketch-->', '<!--meta block=gallery-->'));
    const r = await sb.run(spec);
    expectFail(r, 'KB-006');
    expectFail(r, 'block=gallery is no block of docs/data/content-model.json');
  });

  it('files a problem that knows no line on line 1', () => {
    expect(problemFindings([{ rule: 'id', message: 'duplicate id "x"' }])).toEqual([{ id: RULE.id, line: 1, message: 'duplicate id "x"' }]);
  });

  it('classifies every rule of the dialect reader', () => {
    const p = (rule: 'suffix' | 'fact' | 'id', message: string): string => ruleOf({ rule, message });
    expect(p('suffix', '`level=` is retired; delete it (a literal trailing brace is written \\{)')).toBe(RULE.suffix);
    expect(p('suffix', 'fence: `level=` is retired; delete it')).toBe(RULE.suffix);
    expect(p('suffix', '"#A" is not an id — lower-case letters, digits and hyphens')).toBe(RULE.id);
    expect(p('suffix', 'unknown key "size" — a suffix takes #id')).toBe(RULE.suffix);
    expect(p('id', 'duplicate id "x"')).toBe(RULE.id);
    expect(p('fact', 'polarity=up: the values are pro, con')).toBe(RULE.polarity);
    expect(p('fact', '"polarity" given twice')).toBe(RULE.polarity);
    expect(p('fact', 'requirement= sits under an H3 only')).toBe(RULE.requirement);
    expect(p('fact', 'unknown section-fact key "colour" — the keys are block, polarity, requirement')).toBe(RULE.fact);
    expect(p('fact', 'a group is a polarity group or a requirement group, not both')).toBe(RULE.fact);
  });
});

describe('KB-010 · sketch languages', () => {
  it('fails a fence with no language, and passes a mermaid figure', async () => {
    alpha(KIND_BODY.replace('```typescript summary="TypeScript — the whole idea"', '```').replace('- Stale.', '- Stale.\n\n```mermaid\nflowchart LR\n  A --> B\n```'));
    const r = await sb.run(spec);
    expectFail(r, 'a fence with no language — a sketch names one of typescript, text, go, a figure mermaid');
    expect(await found()).toHaveLength(1);
  });

  it('allows go on a pattern page of the concurrency area only', async () => {
    const goBody = KIND_BODY.replace('```typescript summary="TypeScript — the whole idea"', '```go summary="Go — the whole idea"');
    // Pattern, area caching: refused, with the way out.
    alpha(goBody);
    expectFail(await sb.run(spec), `KB-010 ${PAGE_ALPHA}:${String(lineOf(PAGE_ALPHA, '```go'))} sketch language "go" is for pattern pages of area concurrency only — write this sketch in typescript`);
    // Pattern, area concurrency: passes.
    sb.write(PAGE_ALPHA, pageText({ area: 'concurrency', extra: ALPHA_KEYS }, goBody));
    sb.write('docs/data/site-structure.json', structureJson({ concurrency: [PAGE_ALPHA], 'themes-data': [PAGE_THEME], reference: [PAGE_GUIDE] }));
    expectPass(await sb.run(spec));
    // Theme page of any area: refused (a theme is not a pattern).
    sb.write(PAGE_THEME, pageText({ title: 'Tour', area: 'themes-data' }, `${THEME_BODY}\n\`\`\`go\nx := 1\n\`\`\`\n`));
    expectFail(await sb.run(spec), 'sketch language "go" is for pattern pages of area concurrency only');
  });
});

describe('KB-014 · the explain block', () => {
  const head = '## Explained\n<!--meta block=explain-->\n\n';
  const costs = '- **Latency.** One more hop.\n- **Upkeep.** Someone owns the thresholds.\n\n';
  /** KIND_BODY with its explain block replaced by `block` (heading and all). */
  const withExplain = (block: string): string => KIND_BODY.replace(/## Explained\n[^]*?(?=## Trade-offs)/, `${block}\n\n`);
  const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${String(i)}`).join(' ');

  it('leaves a page with no explain block to the block rule', async () => {
    alpha(KIND_BODY.replace(/## Explained\n[^]*?(?=## Trade-offs)/, ''));
    const r = await sb.run(spec);
    expectFail(r, 'no "explain" block');
    expect(r.err).not.toContain('KB-014');
  });

  it('passes a paragraph, its costs, then a labelled example, or a captioned sketch', async () => {
    expectPass(await sb.run(spec));
    alpha(withExplain(`${head}${words(60)}\n\n${costs}\`\`\`typescript caption="How does it look?"\nconst a = 1;\n\`\`\``));
    expectPass(await sb.run(spec));
    alpha(withExplain(`${head}${words(180)}\n\n${costs}**Example.** ${words(120)}`));
    expectPass(await sb.run(spec));
  });

  it('lets the paragraph link a term to its page', async () => {
    alpha(withExplain(`${head}A [guide](../../reference/guide.md) is here. ${words(70)}\n\n${costs}**Example.** e`));
    expectPass(await sb.run(spec));
  });

  it('fails a paragraph outside 60 to 180 words, at the paragraph', async () => {
    for (const n of [59, 181]) {
      alpha(withExplain(`${head}${words(n)}\n\n${costs}**Example.** e`));
      expectFail(await sb.run(spec), `KB-014 ${PAGE_ALPHA}:${String(lineOf(PAGE_ALPHA, words(n).slice(0, 10)))} the explanation is ${String(n)} words — it runs 60 to 180, and what it costs goes in the costs list`);
    }
  });

  it('requires the costs list on a pattern, and leaves it optional on a theme', async () => {
    alpha(withExplain(`${head}${words(90)}\n\n**Example.** e`));
    expectFail(await sb.run(spec), `KB-014 ${PAGE_ALPHA}:${String(lineOf(PAGE_ALPHA, words(90).slice(0, 10)))} no costs list — after the paragraph, 2 to 4 bullets, each a bold lead and at most 25 words, say what it costs`);
    sb.write(PAGE_THEME, pageText({ title: 'Tour', area: 'themes-data' }, THEME_BODY.replace(/## Explained\n[^]*$/, `${head}${words(90)}\n\n**Example.** e\n`)));
    alpha(KIND_BODY);
    expectPass(await sb.run(spec));
    sb.write(PAGE_THEME, pageText({ title: 'Tour', area: 'themes-data' }, THEME_BODY.replace(/## Explained\n[^]*$/, `${head}${words(90)}\n\n- Plain bullet\n- Another\n\n**Example.** e\n`)));
    expectFail(await sb.run(spec), 'a costs bullet opens with a bold lead');
  });

  it('fails a costs list of the wrong size or with a long bullet', async () => {
    alpha(withExplain(`${head}${words(90)}\n\n- **One.** only\n\n**Example.** e`));
    expectFail(await sb.run(spec), 'the costs list has 1 bullets — it holds 2 to 4');
    alpha(withExplain(`${head}${words(90)}\n\n- **A.** a\n- **B.** ${words(25)}\n\n**Example.** e`));
    expectFail(await sb.run(spec), 'a costs bullet is 26 words — at most 25');
  });

  it('fails a bold run-in label, however the word count stands', async () => {
    alpha(withExplain(`${head}**Basic.** ${words(90)}\n\n${costs}**Example.** e`));
    expectFail(await sb.run(spec), 'the explanation opens with the bold label "Basic." — write plain prose, the heading says what it is');
  });

  it('fails an empty block, a block that opens with a list, and a block with no paragraph first', async () => {
    alpha(withExplain(`${head.trimEnd()}`));
    expectFail(await sb.run(spec), `KB-014 ${PAGE_ALPHA}:${String(lineOf(PAGE_ALPHA, '## Explained'))} the explain block is empty — it holds one paragraph, a costs list, then one example`);
    alpha(withExplain(`${head}- a list\n- of things\n\n**Example.** e`));
    expectFail(await sb.run(spec), 'the explain block opens with a list, not its paragraph');
  });

  it('fails a missing example, an unlabelled one, a wordless one and one past 120 words', async () => {
    alpha(withExplain(`${head}${words(90)}\n\n${costs.trimEnd()}`));
    expectFail(await sb.run(spec), 'no example — the block ends with a paragraph opening **Example.** (at most 120 words) or one captioned sketch fence');
    alpha(withExplain(`${head}${words(90)}\n\n${costs}A second paragraph.`));
    expectFail(await sb.run(spec), 'the next element is a paragraph that does not open with **Example.**');
    alpha(withExplain(`${head}${words(90)}\n\n${costs}**Example.**`));
    expectFail(await sb.run(spec), 'the example holds no words after its **Example.** label');
    alpha(withExplain(`${head}${words(90)}\n\n${costs}**Example.** ${words(121)}`));
    expectFail(await sb.run(spec), 'the example is 121 words — at most 120');
    alpha(withExplain(`${head}${words(90)}\n\n${costs}> a quote`));
    expectFail(await sb.run(spec), 'the next element is a blockquote — the example is an **Example.** paragraph or one captioned sketch fence');
  });

  it('fails a mermaid example, a fence past 25 lines and a fence with no caption', async () => {
    alpha(withExplain(`${head}${words(90)}\n\n${costs}\`\`\`mermaid caption="c"\nflowchart LR\n\`\`\``));
    expectFail(await sb.run(spec), 'the example is a mermaid diagram — a fence example is a code sketch');
    alpha(withExplain(`${head}${words(90)}\n\n${costs}\`\`\`text caption="c"\n${Array.from({ length: 26 }, (_, i) => `l${String(i)}`).join('\n')}\n\`\`\``));
    expectFail(await sb.run(spec), 'the example fence is 26 lines — at most 25');
    alpha(withExplain(`${head}${words(90)}\n\n${costs}\`\`\`text\nx\n\`\`\``));
    expectFail(await sb.run(spec), 'the example fence has no caption — name the question it answers: caption="…"');
    alpha(withExplain(`${head}${words(90)}\n\n${costs}\`\`\`text caption="c"\n\`\`\``));
    expectPass(await sb.run(spec));
  });

  it('fails anything after the example', async () => {
    alpha(withExplain(`${head}${words(90)}\n\n${costs}**Example.** e\n\nA third paragraph.`));
    expectFail(await sb.run(spec), 'the explain block holds a paragraph after its example — it holds one paragraph, a costs list and one example, nothing else');
  });

  it('never reads a level mark as legal: `level=` is a KB-004 finding', async () => {
    alpha(withExplain(`${head}${words(90)} {level=advanced}\n\n${costs}**Example.** e`));
    expectFail(await sb.run(spec), '`level=` is retired; delete it');
  });

  it('lets a page the explain ratchet names omit its example and break the word bounds, and nothing else', async () => {
    allow([PAGE_ALPHA]);
    alpha(withExplain(`${head}${words(10)}\n\n${costs.trimEnd()}`));
    expectPass(await sb.run(spec));
    alpha(withExplain(`${head}**Basic.** ${words(10)}\n\n${costs.trimEnd()}`));
    expectFail(await sb.run(spec), 'the explanation opens with the bold label');
    alpha(withExplain(`${head}${words(10)}\n\n${costs}A second paragraph.`));
    expectFail(await sb.run(spec), 'the next element is a paragraph that does not open with **Example.**');
    alpha(withExplain(`${head}${words(10)}\n\n${costs}**Example.** ${words(200)}`));
    expectFail(await sb.run(spec), 'the example is 200 words — at most 120');
    // The explain ratchet does not excuse a missing costs list.
    alpha(withExplain(`${head}${words(10)}\n\n**Example.** e`));
    expectFail(await sb.run(spec), 'no costs list');
  });

  it('lets a page the costs ratchet names omit its costs list, and nothing else', async () => {
    allow([PAGE_ALPHA], 'costs');
    alpha(withExplain(`${head}${words(90)}\n\n**Example.** e`));
    expectPass(await sb.run(spec));
    alpha(withExplain(`${head}${words(10)}\n\n**Example.** e`));
    expectFail(await sb.run(spec), 'the explanation is 10 words');
  });

  it('fails an entry that excuses nothing, and a page no entry names', async () => {
    allow([PAGE_ALPHA]);
    const stale = await sb.run(spec);
    expectFail(stale, `${ALLOWLIST}: entry "batch-1" excuses nothing — its pages pass without it; delete it`);
    allow(['docs/patterns/caching/nothing.md']);
    alpha(withExplain(`${head}${words(10)}\n\n${costs.trimEnd()}`));
    const r = await sb.run(spec);
    expectFail(r, 'the explanation is 10 words');
    expectFail(r, 'entry "batch-1" excuses nothing');
  });

  it('judges an entry only on a whole run, and withholds a list it cannot read', async () => {
    allow([PAGE_ALPHA]);
    expectPass(await sb.run(spec, [PAGE_ALPHA]));
    sb.write(ALLOWLIST, JSON.stringify({ entries: [{ name: 'x', match: PAGE_ALPHA, reason: '' }] }));
    alpha(withExplain(`${head}${words(10)}\n\n${costs.trimEnd()}`));
    const r = await sb.run(spec);
    expectFail(r, 'has no reason');
    expectFail(r, 'the explanation is 10 words');
    sb.rm(ALLOWLIST);
    expectFail(await sb.run(spec), `${ALLOWLIST}: is missing`);
  });

  it('refuses an entry whose ratchet or maxWords is not one the gate knows', async () => {
    const entry = { name: 'x', match: PAGE_ALPHA, reason: 'r', owner: 'o', since: '2026-10-02' };
    sb.write(ALLOWLIST, JSON.stringify({ entries: [{ ...entry, covers: 'size' }, { ...entry, name: 'y', maxWords: 0 }] }));
    const r = await sb.run(spec);
    expectFail(r, `${ALLOWLIST}: entry "x" covers "size", which is none of explain, costs, description`);
    expectFail(r, `${ALLOWLIST}: entry "y" has a maxWords that is not a whole number above 0`);
  });
});

describe('KB-015 · the description block', () => {
  it('leaves a page with no description block to the block rule', async () => {
    alpha(KIND_BODY.replace(/## What it is\n[^]*?(?=## Explained)/, ''));
    const r = await sb.run(spec);
    expectFail(r, 'no "description" block');
    expect(r.err).not.toContain('KB-015');
  });

  const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${String(i)}`).join(' ');
  const withDescription = (block: string): string => KIND_BODY.replace('It does one thing, and it does it well.', block);

  it('passes one paragraph of 80 words, on a pattern and on a theme', async () => {
    alpha(withDescription(words(80)));
    expectPass(await sb.run(spec));
  });

  it('fails a description past 80 words, naming its length and the way out', async () => {
    alpha(withDescription(words(81)));
    expectFail(await sb.run(spec), `KB-015 ${PAGE_ALPHA}:${String(lineOf(PAGE_ALPHA, words(81).slice(0, 10)))} the description is 81 words — say what the page is for in 80 or fewer (${RULES_PAGE}#KB-015)`);
  });

  it('fails a description in two paragraphs, and one that holds a list', async () => {
    alpha(withDescription('One.\n\nTwo.'));
    expectFail(await sb.run(spec), 'the description holds 2 paragraphs — it is one paragraph');
    alpha(withDescription('One.\n\n- a list'));
    expectFail(await sb.run(spec), 'the description holds a list — it is one paragraph');
  });

  it('fails an empty description block', async () => {
    alpha(KIND_BODY.replace('It does one thing, and it does it well.', ''));
    expectFail(await sb.run(spec), `KB-015 ${PAGE_ALPHA}:${String(lineOf(PAGE_ALPHA, '## What it is'))} the description block is empty — say what the page is for in 80 words or fewer`);
  });

  it('excuses a listed page up to its maxWords, and fails it once it grows', async () => {
    allow([PAGE_ALPHA], 'description', 100);
    alpha(withDescription(words(100)));
    expectPass(await sb.run(spec));
    alpha(withDescription(words(101)));
    expectFail(await sb.run(spec), 'the description is 101 words');
    allow([PAGE_ALPHA], 'description');
    expectPass(await sb.run(spec));
    // A listed page that now passes leaves its entry stale.
    alpha(withDescription(words(10)));
    expectFail(await sb.run(spec), 'excuses nothing');
  });

  it('does not excuse a description under an explain entry', async () => {
    allow([PAGE_ALPHA]);
    alpha(withDescription(words(90)));
    expectFail(await sb.run(spec), 'the description is 90 words');
  });
});

describe('KB-016 · the selfcheck block', () => {
  const quote = (q: string, a: string): string => `> **${q}**\n>\n> ${a}`;
  const GOOD = [
    quote('Why does it pay off?', 'Because it is cheap, see [pro](alpha.md#tradeoffs-pro-1).'),
    quote('When does it hurt?', 'Under load, see [con](alpha.md#tradeoffs-con-1).'),
    quote('What does it replace?', 'A hand-rolled loop, see [sketch](alpha.md#sketch-1).'),
  ];
  const withSelfcheck = (quotes: readonly string[]): string =>
    KIND_BODY.replace('## How it relates', `## Check yourself\n<!--meta block=selfcheck-->\n\n${quotes.join('\n\n')}\n\n## How it relates`);

  it('passes three folded questions that each cite an element id', async () => {
    alpha(withSelfcheck(GOOD));
    expectPass(await sb.run(spec));
  });

  it('is optional', async () => {
    expectPass(await sb.run(spec));
  });

  it('fails a block of two blockquotes, and one with a stray paragraph', async () => {
    alpha(withSelfcheck(GOOD.slice(0, 2)));
    expectFail(await sb.run(spec), `KB-016 ${PAGE_ALPHA}:`);
    alpha(withSelfcheck([...GOOD, 'A stray paragraph.']));
    expectFail(await sb.run(spec), 'the selfcheck block holds a paragraph');
  });

  it('fails an answer with no cited element id', async () => {
    alpha(withSelfcheck([GOOD[0] as string, GOOD[1] as string, quote('What does it replace?', 'A loop, see [page](alpha.md).')]));
    expectFail(await sb.run(spec), 'check 3: the answer cites no element');
  });
});

describe('KB-013 · the KB keys', () => {
  it('fails keys that are not inline lists, and a favourite that is not true', async () => {
    alpha(KIND_BODY, ['aliases: A', 'solves: a symptom', 'favourite: yes']);
    const r = await sb.run(spec);
    expectFail(r, `KB-013 ${PAGE_ALPHA}:8 aliases is not an inline list`);
    expectFail(r, `KB-013 ${PAGE_ALPHA}:9 solves is not an inline list`);
    expectFail(r, `KB-013 ${PAGE_ALPHA}:10 favourite is "yes" — it is true, or absent`);
  });

  it('holds a page to 3 to 5 solves, and a theme to none', async () => {
    alpha(KIND_BODY, ['solves: [a, b]']);
    expectFail(await sb.run(spec), '2 solves — keep the 3 to 5 that read most like the symptom');
    alpha(KIND_BODY, ['solves: [a, b, c, d, e, f]', 'favourite: true', 'aliases: []']);
    expectFail(await sb.run(spec), '6 solves');
    alpha(KIND_BODY, []);
    expectFail(await sb.run(spec), `KB-013 ${PAGE_ALPHA}:1 no solves — a pattern page lists 3 to 5 symptoms`);
    alpha(KIND_BODY);
    sb.write(PAGE_THEME, pageText({ title: 'Tour', area: 'themes-data', extra: ['solves: [a, b, c]'] }, THEME_BODY));
    expectFail(await sb.run(spec), 'a theme carries no solves');
  });

  it('holds each solves phrase to 20 words', async () => {
    const words = (n: number): string => Array.from({ length: n }, () => 'word').join(' ');
    alpha(KIND_BODY, [`solves: [${words(20)}, b, c]`]);
    expectPass(await sb.run(spec));
    alpha(KIND_BODY, [`solves: [a, ${words(21)}, c]`]);
    expectFail(await sb.run(spec), `KB-013 ${PAGE_ALPHA}:8 a solves phrase is 21 words — say the one problem in 20 or fewer`);
  });
});

describe('arguments and inputs', () => {
  it('narrows to named pages, holding a reference page to placement only', async () => {
    alpha(KIND_BODY, []);
    sb.write(PAGE_GUIDE, pageText({ title: 'Guide', area: 'reference', extra: ['solves: nope'] }, '## Loose\n\nNo block fact.\n'));
    const r = await sb.run(spec, [PAGE_GUIDE, 'docs/CLAUDE.md']);
    expectPass(r);
    expect(r.out).toContain('1 page(s) placed and named, 0 kind page(s)');
    expectFail(await sb.run(spec, [`./${PAGE_ALPHA}`]), 'no solves');
  });

  it('never widens the set: a named working file with no row, or a slug the inbox shares, is skipped as the whole run skips it', async () => {
    // What `make validate-changed` hands over after an edit to the trap inbox or the docs map.
    sb.write('docs/inbox.md', pageText({ title: 'Inbox', area: 'reference' }, '## Traps\n\nNone yet.\n'));
    sb.write('docs/patterns/caching/inbox.md', pageText({ title: 'Inbox', extra: ALPHA_KEYS }, KIND_BODY));
    sb.write('docs/data/site-structure.json', structureJson({ caching: [PAGE_ALPHA, 'docs/patterns/caching/inbox.md'], 'themes-data': [PAGE_THEME], reference: [PAGE_GUIDE] }));
    sb.write('docs/README.md', pageText({ title: 'Docs map', area: 'reference' }));
    expectPass(await sb.run(spec));
    const named = await sb.run(spec, ['docs/inbox.md', 'docs/README.md', 'docs/CLAUDE.md']);
    expectPass(named);
    expect(named.out).toContain('0 page(s) placed and named, 0 kind page(s)');
  });

  it.each(['docs/data/site-structure.json', './docs/data/content-model.json'])('measures the whole set when %s is named, since it decides the set', async (input) => {
    alpha(KIND_BODY, []);
    const r = await sb.run(spec, [PAGE_GUIDE, input]);
    expectFail(r, `KB-013 ${PAGE_ALPHA}:1 no solves`);
    alpha(KIND_BODY);
    const clean = await sb.run(spec, [input]);
    expectPass(clean);
    expect(clean.out).toContain('3 page(s) placed and named, 2 kind page(s)');
  });

  it('is misuse for an unknown flag, --fix or a missing named file, with nothing on stdout', async () => {
    for (const argv of [['--nope'], ['--fix'], ['docs/patterns/nope.md']]) {
      const r = await sb.run(spec, argv);
      expectMisuse(r);
      expect(r.out).toBe('');
    }
  });

  it('names the content model and the structure file as KB-000 when either cannot be read', async () => {
    sb.write('docs/data/content-model.json', '{"kinds": []}');
    sb.rm('docs/data/site-structure.json');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err.trim().split('\n')).toEqual([
      `KB-000 docs/data/content-model.json:1 is missing or lacks kinds, facts.block or sketchLangs — the closed lists this gate reads (${RULES_PAGE}#KB-000)`,
      `KB-000 docs/data/site-structure.json:1 is missing or has no areas list — the rows this gate places pages by (${RULES_PAGE}#KB-000)`,
    ]);
    sb.write('docs/data/content-model.json', 'not json');
    expect(readContentModel(sb.dir)).toBeNull();
    sb.write('docs/data/site-structure.json', '{}');
    expect(readRows(sb.dir)).toBeNull();
  });

  it('skips a malformed row', () => {
    sb.write('docs/data/site-structure.json', JSON.stringify({ areas: [{ id: 'a', pages: [{ slug: 'x' }, { slug: 'y', source: 'docs/y.md' }] }, { pages: [{ slug: 'z', source: 'docs/z.md' }] }, { id: 'b' }] }));
    expect(readRows(sb.dir)).toEqual([{ area: 'a', slug: 'y', source: 'docs/y.md', line: 1 }]);
    // A row written with an escaped slash is not found as text: it sits on the file's first line.
    sb.write('docs/data/site-structure.json', '{\n  "areas": [\n    { "id": "a", "pages": [{ "slug": "y", "source": "docs\\/y.md" }] }\n  ]\n}\n');
    expect(readRows(sb.dir)?.[0]?.line).toBe(1);
  });
});

describe('the rules page', () => {
  it('offers exactly one anchor per rule the page gates cite, and no other', () => {
    const text = fs.readFileSync(path.join(REPO_ROOT, RULES_PAGE), 'utf8');
    const anchors = [...text.matchAll(/<a id="([A-Z]+-\d+)"><\/a>/g)].map((m) => m[1] as string);
    const page = Array.from({ length: 9 }, (_, i) => `PAGE-00${String(i)}`);
    expect(anchors).toEqual([...page, ...[...Object.values(RULE), ...RETIRED_RULES].sort()]);
    // A retired rule keeps its anchor and is never emitted.
    expect(Object.values(RULE)).not.toEqual(expect.arrayContaining([...RETIRED_RULES]));
    // Each row names its deciding gate, or review.
    for (const id of anchors) expect(text.split('\n').find((l) => l.includes(`<a id="${id}">`)), id).toMatch(/\| (?:\[`[a-z-]+`\]|review)[^|]*\|$/);
  });
});
