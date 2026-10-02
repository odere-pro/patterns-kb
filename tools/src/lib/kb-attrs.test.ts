/**
 * The markdown dialect's data layer: every citation anchor a page has today
 * must come back from its markdown on the same element. The id table is the
 * contract three converters and a round-trip build against, so each row is
 * pinned here.
 */

import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
// A plain object passed to runSync() is normalised into a throwaway VFile
// rather than mutated in place, so inspecting `.messages` needs the real class.
import { VFile } from 'vfile';

import {
  applyKbAttrs,
  deriveElements,
  FACT_KEYS,
  FENCE_KEYS,
  GROUP_BLOCKS,
  mintIds,
  parseFacts,
  parseFenceLine,
  parseKb,
  parseSuffix,
  plainText,
  POLARITIES,
  printFacts,
  printFenceInfo,
  printSuffix,
  readKb,
  remarkKbAttrs,
  REQUIREMENTS,
  splitTrailingSuffix,
  SuffixError,
  SUFFIX_KEYS,
  type KbElement,
  type Root,
} from './kb-attrs.js';

/** id → element, for the assertions below. */
function byId(md: string): Map<string, KbElement> {
  const { tree } = parseKb(md);
  const m = new Map<string, KbElement>();
  for (const e of deriveElements(tree)) if (e.id !== undefined) m.set(e.id, e);
  return m;
}

function ids(md: string): string[] {
  return deriveElements(parseKb(md).tree)
    .map((e) => e.id)
    .filter((x): x is string => x !== undefined);
}

describe('parseSuffix', () => {
  it('reads an id', () => {
    expect(parseSuffix('#wild-opossum')).toEqual({ id: 'wild-opossum' });
    expect(parseSuffix('  #wild-opossum  ')).toEqual({ id: 'wild-opossum' });
    expect(parseSuffix('')).toEqual({});
  });

  it('reads quoted fence values with their two escapes', () => {
    expect(parseSuffix('caption="a \\"b\\" c \\\\ d" wide=true', 'fence')).toEqual({
      caption: 'a "b" c \\ d',
      wide: true,
    });
    expect(parseSuffix('summary="TypeScript — {braces} and: colons, too"', 'fence')).toEqual({
      summary: 'TypeScript — {braces} and: colons, too',
    });
  });

  it.each([
    ['caption="x"', 'unknown key "caption"'],
    ['level=advanced', '`level=` is retired; delete it'],
    ['level=basic', '`level=` is retired; delete it'],
    ['level=Advanced', 'lower-case letters'],
    ['#Bad_Id', 'is not an id'],
    ['#a #b', 'two ids'],
    ['level=advanced level=expert', '`level=` is retired; delete it'],
    ['brace', 'neither #id nor key=value'],
    ['colour=red', 'unknown key "colour"'],
  ])('refuses %s in the inline form', (body, message) => {
    expect(() => parseSuffix(body)).toThrow(SuffixError);
    expect(() => parseSuffix(body)).toThrow(message);
  });

  it.each([
    ['caption="open', 'unterminated'],
    ['caption="a\\nb"', 'escapes only'],
    ['caption="a"b', 'straight after the closing quote'],
    ['wide=false', 'the only value is true'],
    ['level=expert', '`level=` is retired; delete it'],
    ['caption=a caption=b', 'given twice'],
    ['summary=two words', 'neither #id nor key=value'],
  ])('refuses %s in a fence', (body, message) => {
    expect(() => parseSuffix(body, 'fence')).toThrow(message);
  });

  it('keeps the closed key lists the dialect names', () => {
    expect(SUFFIX_KEYS).toEqual([]);
    expect(FENCE_KEYS).toEqual(['caption', 'summary', 'wide']);
    expect(FACT_KEYS).toEqual(['block', 'polarity', 'requirement']);
  });
});

describe('printSuffix and printFenceInfo', () => {
  it('print in canonical order and round-trip through the parser', () => {
    const s = { id: 'wild-x' };
    expect(printSuffix(s)).toBe('{#wild-x}');
    expect(parseSuffix(printSuffix(s).slice(1, -1))).toEqual(s);
    expect(printSuffix({})).toBe('');
  });

  it('quote only what a bare value cannot hold', () => {
    const meta = { caption: 'He said "no", then \\ left: {x}', wide: true };
    const info = printFenceInfo('mermaid', meta);
    expect(info).toBe('mermaid caption="He said \\"no\\", then \\\\ left: {x}" wide=true');
    expect(parseFenceLine('```' + info)).toEqual({ fence: '```', lang: 'mermaid', meta });
    expect(printFenceInfo('typescript', { summary: 'plain' })).toBe('typescript summary=plain');
  });
});

describe('splitTrailingSuffix', () => {
  it('splits a trailing group preceded by whitespace', () => {
    expect(splitTrailingSuffix('Some text. {#y}')).toEqual({ text: 'Some text.', suffix: '#y' });
    expect(splitTrailingSuffix('Some text.\t{#x}  ')).toEqual({ text: 'Some text.', suffix: '#x' });
    expect(splitTrailingSuffix('{#z}')).toEqual({ text: '', suffix: '#z' });
  });

  it('leaves an escaped or glued brace as text', () => {
    expect(splitTrailingSuffix('literal \\{#y}')).toBeNull();
    expect(splitTrailingSuffix('DELETE /persons/{id}')).toBeNull();
    expect(splitTrailingSuffix('no suffix here')).toBeNull();
    expect(splitTrailingSuffix('{a} then more')).toBeNull();
  });

  it('only takes the last group, and lets a quoted value hold braces', () => {
    expect(splitTrailingSuffix('a {b} {#c}')).toEqual({ text: 'a {b}', suffix: '#c' });
    expect(splitTrailingSuffix('x {caption="a } b"}')).toEqual({ text: 'x', suffix: 'caption="a } b"' });
  });

  it('never reaches across a line break', () => {
    expect(splitTrailingSuffix('line one\n{#y}')).toBeNull();
    expect(splitTrailingSuffix('line one\nline two {#y}')).toEqual({
      text: 'line one\nline two',
      suffix: '#y',
    });
  });
});

describe('parseFenceLine', () => {
  it('reads backtick and tilde openers, with and without meta', () => {
    expect(parseFenceLine('```typescript')).toEqual({ fence: '```', lang: 'typescript', meta: {} });
    expect(parseFenceLine('  ~~~~mermaid caption="uses `foo`"')).toEqual({ fence: '~~~~', lang: 'mermaid', meta: { caption: 'uses `foo`' } });
    expect(parseFenceLine('not a fence')).toBeNull();
  });
});

describe('section facts', () => {
  it('parse and print', () => {
    expect(parseFacts('<!--meta block=tradeoffs-->')).toEqual({ facts: { block: 'tradeoffs' }, errors: [] });
    expect(parseFacts('<!--meta polarity=con-->')).toEqual({ facts: { polarity: 'con' }, errors: [] });
    expect(parseFacts('<!-- tour:start -->')).toBeNull();
    expect(printFacts({ block: 'usage' })).toBe('<!--meta block=usage-->');
  });

  it('report unknown keys, bad values and bad spacing', () => {
    expect(parseFacts('<!--meta topic=x-->')?.errors[0]).toContain('unknown section-fact key "topic"');
    expect(parseFacts('<!--meta polarity=sideways-->')?.errors[0]).toContain('the values are pro');
    expect(parseFacts('<!--meta requirement=oos-->')?.errors[0]).toContain('fr, nfr');
    expect(parseFacts('<!--meta block = x-->')?.errors.length).toBeGreaterThan(0);
    expect(parseFacts('<!--meta block=a block=b-->')?.errors[0]).toContain('given twice');
    expect(parseFacts('<!--meta-->')?.errors[0]).toContain('no key=value');
  });
});

describe('applyKbAttrs — the carriers', () => {
  it('strips inline suffixes into data and hProperties', () => {
    const { tree, problems } = parseKb('## A\n<!--meta block=description-->\n\nText here. {#hand-made}\n');
    expect(problems).toEqual([]);
    const p = tree.children[2];
    expect(p?.type).toBe('paragraph');
    expect(plainText(p as never)).toBe('Text here.');
    expect(readKb(p as never)).toEqual({ id: 'hand-made', explicitId: true });
    expect((p as { data?: { hProperties?: object } }).data?.hProperties).toEqual({ id: 'hand-made' });
  });

  it('gives a list item the suffix at the end of its first paragraph', () => {
    const m = byId('## V\n<!--meta block=variations-->\n\n- **A** — one. {#first}\n- **B** — two.\n');
    expect(m.get('first')).toMatchObject({ kind: 'item', text: 'A — one.' });
    // An explicit id takes no number, so the next item is the first numbered one.
    expect(m.get('variations-item-1')).toMatchObject({ kind: 'item', text: 'B — two.' });
  });

  it('gives a table row the suffix at the end of its last cell', () => {
    const m = byId('## M\n<!--meta block=mapping-->\n\n| A | B |\n| --- | --- |\n| x | y {#first} |\n| z | w |\n');
    expect(m.get('first')).toMatchObject({ kind: 'row', text: 'x | y' });
    expect(m.get('mapping-row-1')).toMatchObject({ kind: 'row', text: 'z | w' });
  });

  it('refuses a suffix on a header row', () => {
    const { problems } = parseKb('| A | B {#head} |\n| --- | --- |\n| x | y |\n');
    expect(problems.map((p) => p.message)).toEqual([expect.stringContaining('header row')]);
  });

  it('applies the block form to the table, list, blockquote or fence above it', () => {
    const md = [
      '## M',
      '<!--meta block=deepdives-->',
      '',
      '| A |',
      '| --- |',
      '| x |',
      '',
      '{#deepdives-metrics-table}',
      '',
      '- one',
      '- two',
      '',
      '{#deepdives-ul-1}',
      '',
      '> **Why**',
      '>',
      '> Because.',
      '',
      '{#deepdives-why}',
      '',
    ].join('\n');
    const { tree, problems } = parseKb(md);
    expect(problems).toEqual([]);
    const els = deriveElements(tree);
    expect(els.find((e) => e.id === 'deepdives-metrics-table')).toMatchObject({ kind: 'table' });
    expect(els.find((e) => e.id === 'deepdives-ul-1')).toMatchObject({ kind: 'list' });
    expect(els.find((e) => e.id === 'deepdives-why')).toMatchObject({ kind: 'sketch', text: 'Why' });
    expect(els.find((e) => e.id === 'deepdives-p-1')).toMatchObject({ text: 'Because.' });
    // No block-form paragraph survives as content.
    expect(els.some((e) => e.text.includes('{'))).toBe(false);
  });

  it('refuses a block form glued to its block, or after a paragraph', () => {
    const glued = parseKb('- one\n{#y}\n').problems;
    expect(glued.map((p) => p.message)).toEqual([expect.stringContaining('blank line')]);
    const gluedRow = parseKb('| A |\n| --- |\n| x |\n{#y}\n').problems;
    expect(gluedRow.map((p) => p.message)).toEqual([expect.stringContaining('became a row')]);
    const afterPara = parseKb('Text.\n\n{#y}\n');
    expect(afterPara.problems.map((p) => p.message)).toEqual([expect.stringContaining('must follow a table')]);
    // Refused, so kept: the brace line is still on the page for the author to fix.
    expect(deriveElements(afterPara.tree).map((e) => e.text)).toEqual(['Text.', '{#y}']);
    const badBody = parseKb('- one\n\n{colour=red}\n');
    expect(badBody.problems.map((p) => p.message)).toEqual([expect.stringContaining('unknown key "colour"')]);
    expect(deriveElements(badBody.tree).map((e) => e.text)).toEqual(['', 'one', '{colour=red}']);
  });

  it('keeps an escaped trailing brace as text, in a paragraph, a heading and a cell', () => {
    const md = 'Use \\{#y}\n\n### POST \\{id}\n\n| A |\n| --- |\n| z \\{#z} |\n';
    const { tree, problems } = parseKb(md);
    expect(problems).toEqual([]);
    expect(deriveElements(tree).map((e) => e.text)).toEqual([
      'Use {#y}',
      'POST {id}',
      '',
      'A',
      'z {#z}',
    ]);
  });

  it('keeps an escaped block-form brace line as text too, the same consistency check', () => {
    // The paragraph's own decoded text has already lost the backslash by the
    // time this reads it; only comparing it against the raw source (what the
    // author actually typed) tells an escape from a real block-form suffix.
    const md = '- one\n\n\\{#y}\n';
    const { tree, problems } = parseKb(md);
    expect(problems).toEqual([]);
    expect(deriveElements(tree).map((e) => e.text)).toEqual(['', 'one', '{#y}']);
  });

  it('skips the raw-source consistency check on a block form read with no source', () => {
    const tree = unified().use(remarkParse).use(remarkGfm).parse('- one\n\n{#y}\n');
    expect(applyKbAttrs(tree)).toEqual([]);
    expect(deriveElements(tree).map((e) => e.text)).toEqual(['', 'one']);
  });

  it('names a synthetic node with no position, rather than inventing a line', () => {
    // A parsed tree carries positions; a node an earlier plugin in the
    // pipeline generated does not (unist makes position optional), and the
    // finding has to omit the line rather than claim one.
    const tree = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: '{#y}' }] }],
    } as unknown as Parameters<typeof applyKbAttrs>[0];
    expect(applyKbAttrs(tree)).toEqual([
      { rule: 'suffix', message: expect.stringContaining('must follow a table') },
    ]);
  });

  it('leaves an unparseable brace group in the text and reports it', () => {
    const { tree, problems } = parseKb('Text with a literal {brace}\n');
    expect(problems).toEqual([{ rule: 'suffix', line: 1, message: expect.stringContaining('neither #id') }]);
    expect(deriveElements(tree)[0]?.text).toBe('Text with a literal {brace}');
  });

  it('reads fence meta from the raw info line, escapes and entities intact', () => {
    const md = '## S\n<!--meta block=structure-->\n\n```mermaid caption="a \\"b\\" &amp; c" wide=true\nflowchart LR\n```\n\n~~~mermaid caption="uses `x`"\ny\n~~~\n';
    const { tree, problems } = parseKb(md);
    expect(problems).toEqual([]);
    const [, f1, f2] = deriveElements(tree);
    expect(f1).toMatchObject({ id: 'structure-fig-1', kind: 'figure', text: 'a "b" &amp; c', code: 'flowchart LR' });
    expect(readKb(tree.children[2] as never)).toMatchObject({ wide: true });
    expect(f2).toMatchObject({ id: 'structure-fig-2', text: 'uses `x`' });
  });

  it('reads the meta of a fence whose opening line ends the file, with no newline after it', () => {
    const { tree, problems } = parseKb('## S\n<!--meta block=structure-->\n\n```mermaid caption="C" wide=true');
    expect(problems).toEqual([]);
    expect(deriveElements(tree).find((e) => e.kind === 'figure')).toMatchObject({ text: 'C', wide: true });
  });

  it('falls back to the processed info string on a tree read with no source', () => {
    // Without `source` a fence's meta comes from CommonMark's own `code.meta`
    // instead of a raw re-slice of the line — the same fallback a caller that
    // only has a tree, never the original markdown, always takes.
    const tree = unified().use(remarkParse).use(remarkGfm).parse('## S\n<!--meta block=structure-->\n\n```mermaid caption="C"\nx\n```\n');
    expect(applyKbAttrs(tree)).toEqual([]);
    expect(deriveElements(tree).find((e) => e.kind === 'figure')).toMatchObject({ text: 'C' });
  });

  it('reads an empty meta string off a fence with no info at all, no source', () => {
    const tree = unified().use(remarkParse).use(remarkGfm).parse('## S\n<!--meta block=structure-->\n\n```\nx\n```\n');
    expect(applyKbAttrs(tree)).toEqual([]);
    expect(deriveElements(tree).find((e) => e.kind === 'sketch')).toMatchObject({ text: '', lang: '' });
  });

  it('reports bad fence meta without losing the fence', () => {
    const { tree, problems } = parseKb('```ts colour=red\nx\n```\n');
    expect(problems.map((p) => p.message)).toEqual([expect.stringContaining('fence: unknown key "colour"')]);
    expect(tree.children[0]?.type).toBe('code');
  });

  it('treats an indented code block as having no info string', () => {
    expect(parseKb('    indented code\n').problems).toEqual([]);
  });

  it('reports an empty meta comment as a fact with no key=value, and takes no facts from it', () => {
    const { problems, tree } = parseKb('## U\n<!--meta-->\n\nx\n');
    expect(problems).toEqual([{ rule: 'fact', line: 2, message: 'a section fact with no key=value' }]);
    expect(deriveElements(tree)[0]).toMatchObject({ block: null });
  });

  it('reports a misplaced or misused section fact', () => {
    const msgs = (md: string) => parseKb(md).problems.map((p) => p.message);
    expect(msgs('Text.\n\n<!--meta block=usage-->\n')).toEqual([expect.stringContaining('under a heading')]);
    expect(msgs('### G\n<!--meta block=usage-->\n')).toEqual([expect.stringContaining('under an H2 only')]);
    expect(msgs('## G\n<!--meta polarity=pro-->\n')).toEqual([expect.stringContaining('under an H3 only')]);
    expect(msgs('## G\n<!--meta block=tradeoffs-->\n\n### H\n<!--meta polarity=pro requirement=fr-->\n')).toEqual([
      expect.stringContaining('not both'),
    ]);
  });

  it('reports a section fact a blank line below its heading, and still reads it as the heading\'s', () => {
    const { problems, tree } = parseKb('## U\n\n<!--meta block=usage-->\n\nx\n\nSetext\n---\n<!--meta block=tradeoffs-->\n');
    expect(problems).toEqual([{ rule: 'fact', line: 3, message: 'a section fact sits on the line right under its heading — delete the blank line between them' }]);
    expect(deriveElements(tree).map((e) => e.block)).toEqual(['usage', 'usage', 'tradeoffs']);
  });

  it('claims no line for a fact whose heading or comment has no position', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'heading', depth: 2, children: [{ type: 'text', value: 'U' }] },
        { type: 'html', value: '<!--meta block=usage-->' },
      ],
    } as unknown as Parameters<typeof applyKbAttrs>[0];
    expect(applyKbAttrs(tree)).toEqual([]);
    expect(deriveElements(tree)[0]).toMatchObject({ block: 'usage' });
  });

  it('reports a group under a block it does not belong to (GROUP_BLOCKS)', () => {
    const msgs = (md: string) => parseKb(md).problems.map((p) => p.message);
    expect(msgs('## U\n<!--meta block=usage-->\n\n### P\n<!--meta polarity=pro-->\n\n- x\n')).toEqual([
      'polarity=pro belongs under the tradeoffs block, not the usage block',
    ]);
    expect(msgs('## D\n<!--meta block=description-->\n\n### F\n<!--meta requirement=fr-->\n')).toEqual([
      'requirement=fr belongs under the requirements block, not the description block',
    ]);
    expect(msgs('## R\n<!--meta block=requirements-->\n\n### F\n<!--meta requirement=nfr-->\n\n## P\n<!--meta block=production-->\n\n### K\n<!--meta polarity=check-->\n')).toEqual([]);
    // An H3 fact before any H2 at all, or under one with no block= fact,
    // names "outside a block" rather than a block that never applied.
    expect(msgs('### F\n<!--meta requirement=fr-->\n')).toEqual([
      'requirement=fr belongs under the requirements block, not outside a block',
    ]);
  });

  it('GROUP_BLOCKS places every polarity and every requirement value, and nothing else', () => {
    expect(Object.keys(GROUP_BLOCKS.polarity)).toEqual([...POLARITIES]);
    expect(Object.keys(GROUP_BLOCKS.requirement)).toEqual([...REQUIREMENTS]);
  });

  it('refuses an id on a block heading', () => {
    const msgs = parseKb('## G {#other}\n<!--meta block=usage-->\n').problems.map((p) => p.message);
    expect(msgs).toEqual([expect.stringContaining('its block name "usage"')]);
  });

  it('refuses a level token anywhere, in a suffix or a fence, and says to delete it', () => {
    const msgs = parseKb('## H {level=advanced}\n<!--meta block=sketch-->\n\n```mermaid level=expert\nx\n```\n').problems.map((p) => p.message);
    expect(msgs).toEqual([expect.stringContaining('`level=` is retired; delete it'), expect.stringContaining('`level=` is retired; delete it')]);
  });
});

describe('the remark plugin', () => {
  it('turns every problem into a vfile message with a rule id', () => {
    const md = '## G\n<!--meta block=usage-->\n\nText {bad}\n';
    const processor = unified().use(remarkParse).use(remarkGfm).use(remarkKbAttrs);
    const file = unified().use(remarkParse).use(remarkGfm).use(remarkKbAttrs).use(remarkStringify).processSync(md);
    expect(file.messages.map((m) => [m.ruleId, m.source, m.line])).toEqual([['suffix', 'kb-attrs', 4]]);
    const tree = processor.runSync(processor.parse(md), md) as Root;
    expect(readKb(tree.children[0] as never)?.id).toBe('usage');
  });

  it('reads the file value as source in every shape vfile hands it, string, absent or a Buffer', () => {
    // applyKbAttrs needs `source` to tell an escaped brace from a real one:
    // `\{#y}` after a list is text, not a block-form suffix. A
    // string or a Buffer carries it; a file with no value cannot, and the
    // brace is then read as the suffix it looks like.
    const md = '- one\n\n\\{#y}\n';
    const processor = unified().use(remarkParse).use(remarkGfm).use(remarkKbAttrs);
    const shape = (file: VFile): string[][] => {
      const tree = processor.runSync(processor.parse(md), file) as Root;
      return deriveElements(tree).map((e) => [e.kind, e.text]);
    };
    const kept = [
      ['list', ''],
      ['item', 'one'],
      ['paragraph', '{#y}'],
    ];

    expect(shape(new VFile(md))).toEqual(kept);
    const buffered = new VFile();
    buffered.value = Buffer.from(md);
    expect(shape(buffered)).toEqual(kept);
    expect(shape(new VFile())).toEqual([
      ['list', ''],
      ['item', 'one'],
    ]);
  });

  it('omits place rather than inventing one, for a problem with no line', () => {
    // A node an earlier plugin in the pipeline generated carries no
    // position (unist makes it optional), so a problem on one has no line.
    const processor = unified().use(remarkParse).use(remarkGfm).use(remarkKbAttrs);
    const tree = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: '{#y}' }] }],
    } as unknown as Root;
    const file = new VFile();
    processor.runSync(tree, file);
    expect(file.messages.map((m) => [m.ruleId, m.line, m.place])).toEqual([['suffix', undefined, undefined]]);
  });
});

describe('mintIds — the table', () => {
  const page = [
    '# Title',
    '',
    'Intro, never minted.',
    '',
    '## What it is',
    '<!--meta block=description-->',
    '',
    'One.',
    '',
    'Two.',
    '',
    '- a',
    '  - a.1',
    '- b',
    '',
    '```mermaid caption="c"',
    'x',
    '```',
    '',
    '## Explained',
    '<!--meta block=explain-->',
    '',
    'The one paragraph.',
    '',
    '**Example.** e',
    '',
    '## Trade-offs',
    '<!--meta block=tradeoffs-->',
    '',
    'A lead paragraph.',
    '',
    '### Pros',
    '<!--meta polarity=pro-->',
    '',
    '- p1',
    '  - not numbered',
    '- p2',
    '',
    '### Cons',
    '<!--meta polarity=con-->',
    '',
    '- c1',
    '',
    '## Usage',
    '<!--meta block=usage-->',
    '',
    '### Reach for it when',
    '<!--meta polarity=when-->',
    '',
    '- w1',
    '',
    '### Avoid when',
    '<!--meta polarity=avoid-->',
    '',
    '- v1',
    '- v2',
    '',
    'A smell paragraph after the groups.',
    '',
    '## Sketch',
    '<!--meta block=sketch-->',
    '',
    '```typescript summary="one"',
    'a',
    '```',
    '',
    '```typescript summary="two"',
    'b',
    '```',
    '',
    '## In the wild',
    '<!--meta block=wild-->',
    '',
    '- **Envoy** — proxy. {#wild-envoy}',
    '- **Polly** — library. {#wild-polly}',
    '',
    '## Siblings',
    '<!--meta block=siblings-->',
    '',
    '- [A](./a.md) — x',
    '- [B](./b.md) — y',
    '',
    '## Deep dives',
    '<!--meta block=deepdives-->',
    '',
    '### 1 · First',
    '',
    'P.',
    '',
    '**Rung one** {#deepdives-h-rung-1}',
    '',
    'Q.',
    '',
    '### 2 · Second',
    '',
    '> **Summary**',
    '>',
    '> Inside.',
    '',
    '```sql summary="s"',
    'select 1',
    '```',
    '',
    '## Requirements',
    '<!--meta block=requirements-->',
    '',
    '### Functional',
    '<!--meta requirement=fr-->',
    '',
    '1. f1',
    '2. f2',
    '',
    '**Additional** {#requirements-h-additional}',
    '',
    '- f3',
    '',
    'Out of scope: named.',
    '',
    '### Non-functional',
    '<!--meta requirement=nfr-->',
    '',
    '- **Scale**',
    '  - one',
    '  - two {#requirements-nfr-scale-2}',
    '- **Latency** — fast.',
    '',
    '### Out of scope {#requirements-outofscope}',
    '',
    '- oos one {#requirements-oos-1}',
    '- oos two',
    '',
    '## Untagged section',
    '',
    'Never minted.',
    '',
    '## Choosing',
    '<!--meta block=choosing-->',
    '',
    '| A | B |',
    '| --- | --- |',
    '| r1 | x |',
    '',
    'Between.',
    '',
    '| A | B |',
    '| --- | --- |',
    '| r2 | y |',
    '',
  ].join('\n');

  it('mints every id the table names, in document order', () => {
    expect(ids(page)).toEqual([
      'description',
      'description-p-1',
      'description-p-2',
      'description-li-1',
      'description-li-2',
      'description-li-3',
      'description-fig-1',
      'explain',
      'explain-text',
      'explain-example',
      'tradeoffs',
      'tradeoffs-p-1',
      'tradeoffs-pro-1',
      'tradeoffs-pro-2',
      'tradeoffs-con-1',
      'usage',
      'usage-when-1',
      'usage-avoid-1',
      'usage-avoid-2',
      'usage-p-1',
      'sketch',
      'sketch-variant-1',
      'sketch-variant-2',
      'wild',
      'wild-envoy',
      'wild-polly',
      'siblings',
      'siblings-item-1',
      'siblings-item-2',
      'deepdives',
      'deepdives-dive-1',
      'deepdives-p-1',
      'deepdives-h-rung-1',
      'deepdives-p-2',
      'deepdives-dive-2',
      'deepdives-sketch-1',
      'deepdives-p-3',
      'deepdives-sketch-2',
      'requirements',
      'requirements-fr-1',
      'requirements-fr-2',
      'requirements-h-additional',
      'requirements-fr-3',
      'requirements-p-1',
      'requirements-nfr-1',
      'requirements-nfr-scale-2',
      'requirements-nfr-2',
      'requirements-outofscope',
      'requirements-oos-1',
      'requirements-li-1',
      'choosing',
      'choosing-row-1',
      'choosing-p-1',
      'choosing-row-2',
    ]);
  });

  it('numbers a nested list item in document order, and none under a polarity group', () => {
    const m = byId(page);
    expect(m.get('description-li-2')?.text).toBe('a.1');
    expect(m.get('description-li-3')?.text).toBe('b');
    expect(m.get('tradeoffs-pro-2')?.text).toBe('p2');
    expect(m.get('tradeoffs-pro-1')).toMatchObject({ polarity: 'pro' });
    expect(m.get('requirements-nfr-1')).toMatchObject({ requirement: 'nfr', text: 'Scale' });
  });

  it('gives an explicit id no number, so its neighbours keep theirs', () => {
    const m = byId(page);
    expect(m.get('deepdives-p-2')?.text).toBe('Q.');
    expect(m.get('requirements-li-1')?.text).toBe('oos two');
  });

  it('mints nothing before the first H2 or under an H2 with no block fact', () => {
    const els = deriveElements(parseKb(page).tree);
    expect(els.filter((e) => e.block === null).every((e) => e.id === undefined)).toBe(true);
    expect(els.find((e) => e.text === 'Never minted.')?.id).toBeUndefined();
  });

  it('is idempotent: a second run changes nothing', () => {
    const { tree } = parseKb(page);
    const before = JSON.stringify(deriveElements(tree));
    expect(mintIds(tree)).toEqual([]);
    expect(JSON.stringify(deriveElements(tree))).toBe(before);
  });

  it('works on a tree the plugin never saw, reading facts off the comments', () => {
    const tree = unified().use(remarkParse).use(remarkGfm).parse('## U\n<!--meta block=usage-->\n\nx\n');
    expect(mintIds(tree)).toEqual([]);
    expect(deriveElements(tree).map((e) => e.id)).toEqual(['usage', 'usage-p-1']);
  });

  it('reads no facts off a heading whose next comment is not a meta line, on a tree the plugin never saw', () => {
    const tree = unified().use(remarkParse).use(remarkGfm).parse('## U\n<!-- just a note -->\n\nx\n');
    expect(mintIds(tree)).toEqual([]);
    expect(deriveElements(tree)).toMatchObject([
      { block: null, text: 'U' },
      { block: null, text: 'x' },
    ]);
  });

  it('gives a nested item in an ITEM_BLOCKS block no id — only the top level is numbered', () => {
    const md = '## V\n<!--meta block=variations-->\n\n- **A** — one.\n  - nested\n- **B** — two.\n';
    const els = deriveElements(parseKb(md).tree);
    expect(els.map((e) => [e.kind, e.text, e.id])).toEqual([
      ['heading', 'V', 'variations'],
      ['list', '', undefined],
      ['item', 'A — one.', 'variations-item-1'],
      ['list', '', undefined],
      ['item', 'nested', undefined],
      ['item', 'B — two.', 'variations-item-2'],
    ]);
  });

  it('reports a duplicate id, explicit or minted', () => {
    const { problems } = parseKb('## U\n<!--meta block=usage-->\n\nx {#usage-p-2}\n\ny\n\nz\n');
    expect(problems).toEqual([{ rule: 'id', line: 8, message: 'duplicate id "usage-p-2"' }]);
  });

  it('numbers a blockquote summary out of the paragraph sequence', () => {
    const m = byId('## L\n<!--meta block=levels-->\n\n- item\n\n  > **The answer**\n  >\n  > Why.\n\n  {#levels-why}\n');
    expect(m.get('levels-li-1')).toMatchObject({ text: 'item' });
    expect(m.get('levels-why')).toMatchObject({ kind: 'sketch', text: 'The answer' });
    expect(m.get('levels-p-1')).toMatchObject({ text: 'Why.' });
  });

  it('keys the explain paragraph and its example, a prose example or a fence', () => {
    const prose = byId('## E\n<!--meta block=explain-->\n\nx\n\n**Example.** y\n');
    expect([...prose.keys()]).toEqual(['explain', 'explain-text', 'explain-example']);
    const fence = byId('## E\n<!--meta block=explain-->\n\nx\n\n```typescript caption="C"\nz\n```\n');
    expect([...fence.keys()]).toEqual(['explain', 'explain-text', 'explain-example']);
    expect(fence.get('explain-example')).toMatchObject({ kind: 'sketch', lang: 'typescript' });
  });

  it('keeps an explain block that holds more than its two elements free of a duplicate id', () => {
    const md = '## E\n<!--meta block=explain-->\n\nx\n\n**Example.** y\n\nthird\n\n```text\nq\n```\n';
    expect(parseKb(md).problems).toEqual([]);
    expect([...byId(md).keys()]).toEqual(['explain', 'explain-text', 'explain-example', 'explain-p-3', 'explain-sketch-1']);
  });

  it('gives an explain fence after a mermaid figure the example id', () => {
    const m = byId('## E\n<!--meta block=explain-->\n\nx\n\n```mermaid\nA-->B\n```\n\n```text\nq\n```\n');
    expect([...m.keys()]).toEqual(['explain', 'explain-text', 'explain-fig-1', 'explain-example']);
  });
});

describe('deriveElements and plainText', () => {
  it('reads a break as a space, drops raw html and keeps code text', () => {
    const els = deriveElements(parseKb('A line\\\nnext `code` 2<sup>32</sup>.\n').tree);
    expect(els[0]?.text).toBe('A line next code 232.');
  });

  it('marks the header row and gives figures their caption, sketches their summary', () => {
    const els = deriveElements(parseKb('| H |\n| --- |\n| r |\n\n```ts summary="S"\nx\n```\n').tree);
    expect(els.map((e) => [e.kind, e.text, e.header ?? false])).toEqual([
      ['table', '', false],
      ['row', 'H', true],
      ['row', 'r', false],
      ['sketch', 'S', false],
    ]);
    expect(els[3]).toMatchObject({ lang: 'ts', code: 'x' });
  });

  it('plainText reads an image with no alt text as empty, not undefined', () => {
    // remark-parse always writes `alt`, but mdast makes it optional, and the
    // plugin also reads image nodes that earlier plugins in a pipeline build
    // without one.
    const node = { type: 'paragraph', children: [{ type: 'image', url: 'x.png' }] } as unknown as Parameters<
      typeof plainText
    >[0];
    expect(plainText(node)).toBe('');
  });

  it('reads a blockquote as an empty sketch summary when it opens with anything but a paragraph', () => {
    const els = deriveElements(parseKb('> - item\n').tree);
    expect(els[0]).toMatchObject({ kind: 'sketch', text: '' });
  });

  it('collapses HTML whitespace only: a U+00A0 is text, as in a browser', () => {
    const els = deriveElements(parseKb('a&nbsp;b \t c&nbsp;\n').tree);
    expect(els[0]?.text).toBe('a\u00a0b c\u00a0');
  });

  it('carries a fence\'s wide flag', () => {
    const els = deriveElements(parseKb('```mermaid caption="C" wide=true\nflowchart LR\n```\n\n```mermaid\nx\n```\n').tree);
    expect(els.map((e) => e.wide)).toEqual([true, undefined]);
  });

  it('names the marked block an element sits in, and only inside it', () => {
    const md = [
      '## R',
      '<!--meta block=relationships-->',
      '',
      'before',
      '',
      '<!-- relationships:start -->',
      '',
      '**Combines with**',
      '',
      '- [A](a.md)',
      '',
      '<!-- relationships:end -->',
      '',
      'after',
      '',
    ].join('\n');
    const els = deriveElements(parseKb(md).tree);
    expect(els.map((e) => [e.text, e.generated])).toEqual([
      ['R', undefined],
      ['before', undefined],
      ['Combines with', 'relationships'],
      ['', 'relationships'],
      ['A', 'relationships'],
      ['after', undefined],
    ]);
  });

  it('lists an item whose first child is no paragraph as an item with no text, and skips a thematic break', () => {
    const els = deriveElements(parseKb('## A\n<!--meta block=description-->\n\n- ```sh\n  run\n  ```\n\n---\n\nAfter.\n').tree);
    expect(els.map((e) => [e.kind, e.text])).toEqual([
      ['heading', 'A'],
      ['list', ''],
      ['item', ''],
      ['sketch', ''],
      ['paragraph', 'After.'],
    ]);
  });

  it('lists the elements of a section with no block fact and of a fourth-level heading', () => {
    const els = deriveElements(parseKb('## Loose\n\nText.\n\n## B\n<!--meta block=usage-->\n\n#### Run-in\n\nMore.\n').tree);
    expect(els.map((e) => [e.block, e.kind, e.text])).toEqual([
      [null, 'heading', 'Loose'],
      [null, 'paragraph', 'Text.'],
      ['usage', 'heading', 'B'],
      ['usage', 'heading', 'Run-in'],
      ['usage', 'paragraph', 'More.'],
    ]);
  });

  it('reads a node with no children as no text', () => {
    expect(plainText({ type: 'thematicBreak' } as never)).toBe('');
  });

  it('takes a minted id back off an element that no longer sits in a block', () => {
    const { tree } = parseKb('## A\n<!--meta block=description-->\n\nText.\n');
    const paragraph = tree.children[2] as never;
    expect((paragraph as { data: { hProperties: { id?: string } } }).data.hProperties.id).toBe('description-p-1');
    readKb(tree.children[0] as never)!.facts = {};
    mintIds(tree);
    expect(readKb(paragraph)?.id).toBeUndefined();
    expect((paragraph as { data: { hProperties: { id?: string } } }).data.hProperties).toEqual({});
  });

  it('applyKbAttrs without source still reads suffixes', () => {
    const tree = unified().use(remarkParse).use(remarkGfm).parse('## U\n<!--meta block=usage-->\n\nx {#usage-x}\n');
    expect(applyKbAttrs(tree)).toEqual([]);
    expect(deriveElements(tree)[1]).toMatchObject({ id: 'usage-x', text: 'x' });
  });
});
