/**
 * The selfcheck block's shape (KB-016), judged on parsed nodes: what passes and
 * each way to fail.
 */

import { describe, expect, it } from 'vitest';

import { parseKb, type Nodes } from './kb-attrs.js';
import { selfcheckProblems } from './selfcheck-shape.js';

/** The nodes under a selfcheck heading, as the gate and the lint hand them over. */
const nodesOf = (body: string): Nodes[] => parseKb(`## Check yourself\n<!--meta block=selfcheck-->\n\n${body}`).tree.children.slice(1) as Nodes[];
const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${String(i)}`).join(' ');
const quote = (q: string, a: string): string => `> **${q}**\n>\n> ${a}`;
const CITE = 'See [con 2](circuit-breaker.md#tradeoffs-con-2).';
const GOOD = [quote('Why a rate?', CITE), quote('When not?', CITE), quote('What fails first?', CITE)];
const messages = (blocks: readonly string[]): string[] => selfcheckProblems(nodesOf(blocks.join('\n\n'))).map((p) => p.message);

describe('selfcheckProblems', () => {
  it('passes three questions whose answers cite an element id', () => {
    expect(messages(GOOD)).toEqual([]);
  });

  it('counts a same-page link with a fragment as a citation', () => {
    expect(messages([GOOD[0] as string, GOOD[1] as string, quote('Where?', 'See [it](#tradeoffs-con-1).')])).toEqual([]);
  });

  it('fails a count other than three', () => {
    expect(messages(GOOD.slice(0, 2))).toEqual(['the selfcheck block holds 2 blockquotes — it holds exactly 3']);
    expect(messages([...GOOD, GOOD[0] as string])).toEqual(['the selfcheck block holds 4 blockquotes — it holds exactly 3']);
    expect(messages([])[0]).toContain('holds 0 blockquotes');
  });

  it('fails anything beside the blockquotes', () => {
    expect(messages([...GOOD, 'Stray.'])).toEqual(['the selfcheck block holds a paragraph — it holds 3 blockquotes and nothing else']);
  });

  it('fails a lead that is not a bold question, or is too long', () => {
    expect(messages([GOOD[0] as string, GOOD[1] as string, `> Plain question?\n>\n> ${CITE}`])).toEqual(['check 3: opens with a bold question — "> **Why …?**"']);
    expect(messages([GOOD[0] as string, GOOD[1] as string, quote('Not asked.', CITE)])).toEqual(['check 3: the bold lead "Not asked." is not a question — it ends in "?"']);
    expect(messages([GOOD[0] as string, GOOD[1] as string, quote(`${words(24)} end?`, CITE)])).toEqual([]);
    expect(messages([GOOD[0] as string, GOOD[1] as string, quote(`${words(26)}?`, CITE)])).toEqual(['check 3: the question is 26 words — at most 25']);
  });

  it('fails an answer that is too long, missing, or cites no element', () => {
    expect(messages([GOOD[0] as string, GOOD[1] as string, quote('Why?', `${words(61)} [x](a.md#b)`)])).toEqual(['check 3: the answer is 62 words — at most 60']);
    expect(messages([GOOD[0] as string, GOOD[1] as string, '> **Why?**'])).toContain('check 3: the answer is one or more paragraphs after the question, and nothing else');
    expect(messages([GOOD[0] as string, GOOD[1] as string, quote('Why?', 'See [page](a.md).')])).toEqual(['check 3: the answer cites no element — link at least one `page.md#element-id`']);
  });
});
