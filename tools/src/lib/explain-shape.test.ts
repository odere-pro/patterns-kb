/**
 * The explain block's shape (KB-014), judged on parsed nodes: what passes, each
 * way to fail, and which failures a ratchet may excuse.
 */

import { describe, expect, it } from 'vitest';

import { explainProblems, wordCount } from './explain-shape.js';
import { parseKb, type Nodes } from './kb-attrs.js';

/** The nodes under an explain heading, as the gate and the lint hand them over. */
const nodesOf = (body: string): Nodes[] => parseKb(`## Explained\n<!--meta block=explain-->\n\n${body}`).tree.children.slice(1) as Nodes[];
const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${String(i)}`).join(' ');
const messages = (body: string, costsRequired = false): string[] => explainProblems(nodesOf(body), { costsRequired }).map((p) => p.message);
const COSTS = '- **Latency.** One more hop.\n- **Upkeep.** Someone owns it.';

describe('wordCount', () => {
  it('counts runs of non-space characters', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('   ')).toBe(0);
    expect(wordCount(' a  b\nc ')).toBe(3);
  });
});

describe('explainProblems', () => {
  it('passes one paragraph then a labelled example, or then a captioned sketch', () => {
    expect(explainProblems(nodesOf(`${words(60)}\n\n**Example.** ${words(120)}`))).toEqual([]);
    expect(explainProblems(nodesOf(`${words(180)}\n\n**Example.** e`))).toEqual([]);
    expect(explainProblems(nodesOf(`${words(90)}\n\n\`\`\`typescript caption="How?"\n${Array.from({ length: 25 }, () => 'x').join('\n')}\n\`\`\``))).toEqual([]);
  });

  it('passes a costs list between the paragraph and the example, required or not', () => {
    for (const costsRequired of [true, false]) {
      expect(explainProblems(nodesOf(`${words(90)}\n\n${COSTS}\n\n**Example.** e`), { costsRequired })).toEqual([]);
    }
    const four = '- **A.** a\n- **B.** b\n- **C.** c\n- **D.** d';
    expect(messages(`${words(90)}\n\n${four}\n\n**Example.** e`, true)).toEqual([]);
  });

  it('lets a term link on its first use and a gloss sit in parentheses', () => {
    expect(messages(`A [circuit breaker](../x/circuit-breaker.md) (a gate on one call) ${words(70)}\n\n${COSTS}\n\n**Example.** e`, true)).toEqual([]);
  });

  it('requires the costs list on a pattern only, and ratchets its absence', () => {
    const body = `${words(90)}\n\n**Example.** e`;
    expect(messages(body)).toEqual([]);
    const missing = explainProblems(nodesOf(body), { costsRequired: true });
    expect(missing.map((p) => [p.ratchet, p.line])).toEqual([['costs', 4]]);
    expect(missing[0]?.message).toContain('no costs list — after the paragraph, 2 to 4 bullets, each a bold lead and at most 25 words');
  });

  it('marks a missing example and a paragraph outside the word bounds for the explain ratchet, each at its line', () => {
    const short = explainProblems(nodesOf(words(59)));
    expect(short.map((p) => [p.ratchet, p.line])).toEqual([
      ['explain', 4],
      ['explain', 4],
    ]);
    expect(short.map((p) => p.message)).toEqual(['the explanation is 59 words — it runs 60 to 180, and what it costs goes in the costs list', expect.stringContaining('no example')]);
    expect(messages(`${words(181)}\n\n**Example.** e`)).toEqual(['the explanation is 181 words — it runs 60 to 180, and what it costs goes in the costs list']);
  });

  it('never excuses a bold label, a wrong opening, an extra element or a malformed example', () => {
    const strict = (body: string): (string | null)[] => explainProblems(nodesOf(body)).map((p) => p.ratchet);
    expect(strict(`**Basic.** ${words(90)}\n\n**Example.** e`)).toEqual([null]);
    expect(strict(`- a list\n\n**Example.** e`)).toEqual([null]);
    expect(strict(`${words(90)}\n\n**Example.** e\n\nthird`)).toEqual([null]);
    expect(strict(`${words(90)}\n\nnot labelled`)).toEqual([null]);
    expect(strict(`${words(90)}\n\n**Example.** ${words(121)}`)).toEqual([null]);
    expect(strict(`${words(90)}\n\n**Example.**`)).toEqual([null]);
    expect(strict(`${words(90)}\n\n# A heading`)).toEqual([null]);
  });

  it('names each costs fault: too few or many bullets, a numbered list, no bold lead, too long, not one paragraph', () => {
    const head = `${words(90)}\n\n`;
    const tail = '\n\n**Example.** e';
    expect(messages(`${head}- **A.** only one${tail}`)).toEqual(['the costs list has 1 bullets — it holds 2 to 4']);
    expect(messages(`${head}- **A.** a\n- **B.** b\n- **C.** c\n- **D.** d\n- **E.** e${tail}`)).toEqual(['the costs list has 5 bullets — it holds 2 to 4']);
    expect(messages(`${head}1. **A.** a\n2. **B.** b${tail}`)).toEqual(['the costs list is a bullet list, not a numbered one']);
    expect(messages(`${head}- **A.** a\n- Plain words open this one${tail}`)).toEqual(['a costs bullet opens with a bold lead — "Plain words open this…" does not']);
    expect(messages(`${head}- **A.** a\n- **B.** ${words(25)}${tail}`)).toEqual(['a costs bullet is 26 words — at most 25']);
    expect(messages(`${head}- **A.** ${words(24)}\n- **B.** b${tail}`)).toEqual([]);
    expect(messages(`${head}- **A.** a\n- **B.** b\n\n  More text.${tail}`)).toEqual(['a costs bullet is one paragraph of text']);
    expect(messages(`${head}- **A.** a\n- \`\`\`text\n  x\n  \`\`\`${tail}`)).toEqual(['a costs bullet is one paragraph of text']);
  });

  it('refuses the costs list after the example', () => {
    expect(messages(`${words(90)}\n\n**Example.** e\n\n${COSTS}`, false)).toEqual([
      'the explain block holds a list after its example — it holds one paragraph, a costs list and one example, nothing else',
    ]);
    expect(messages(`${words(90)}\n\n${COSTS}\n\n* **A.** a\n* **B.** b`)).toEqual(['the costs list sits after the example — put it right after the paragraph, before the example']);
  });

  it('names each fence fault: mermaid, too long, no caption', () => {
    const fence = (info: string, lines = 1): string => `${words(90)}\n\n\`\`\`${info}\n${Array.from({ length: lines }, () => 'x').join('\n')}\n\`\`\``;
    expect(messages(fence('mermaid caption="c"'))).toEqual(['the example is a mermaid diagram — a fence example is a code sketch']);
    expect(messages(fence('text caption="c"', 26))).toEqual(['the example fence is 26 lines — at most 25']);
    expect(messages(fence('text'))).toEqual(['the example fence has no caption — name the question it answers: caption="…"']);
    expect(messages(`${words(90)}\n\n\`\`\`text caption="c"\n\`\`\``)).toEqual([]);
  });

  it('reports an empty block at no line, and skips the meta line', () => {
    const empty = { message: 'the explain block is empty — it holds one paragraph, a costs list, then one example', ratchet: null };
    expect(explainProblems([])).toEqual([empty]);
    expect(explainProblems(nodesOf(''))).toEqual([empty]);
  });

  it('carries no line for a node that has no position', () => {
    const bare = { type: 'paragraph', children: [{ type: 'text', value: 'one two' }] } as unknown as Nodes;
    expect(explainProblems([bare])[0]).toEqual({ message: 'the explanation is 2 words — it runs 60 to 180, and what it costs goes in the costs list', ratchet: 'explain' });
  });

  it('names a block that opens with something other than a paragraph', () => {
    expect(messages('```text\nx\n```\n\n**Example.** e')).toEqual(['the explain block opens with a code, not its paragraph — it holds one paragraph, a costs list, then one example']);
  });
});
