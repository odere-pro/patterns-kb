/**
 * The shape of a page's explain block (KB-014 of docs/reference/page-rules.md),
 * held in one place for the two readers that judge it: the kb-shape gate and
 * `kb.mjs validate`. Pure: it reads mdast nodes and returns problems; it reads
 * no file and knows no allowlist.
 *
 * The block holds, in this order and nothing else:
 *
 *   one paragraph   60 to 180 words, not opening with a bold label; it may
 *                   link a term on its first use or gloss it in parentheses
 *   a costs list    2 to 4 bullets, each opening with a bold lead and running
 *                   at most 25 words: what the pattern costs. Required on a
 *                   pattern page, optional on any other kind
 *   one example     a paragraph opening with the bold label `Example.` and
 *                   running at most 120 words (the label is not counted), or
 *                   one non-mermaid fence of at most 25 lines with a caption
 *
 * A problem carries a `ratchet` when an allowlist entry of the kb-shape gate
 * may excuse it while its rewrite is pending: `explain` for a missing example
 * or a word bound on the paragraph, `costs` for a missing costs list. Every
 * other problem (no paragraph, a bold label, a second paragraph, a malformed
 * example or costs list) is never excusable.
 */

import type { ListItem } from 'mdast';

import type { Ratchet } from './ratchet.js';
import { plainText, readKb, type Nodes, type Paragraph } from './kb-attrs.js';

/** The explanation paragraph's word bounds. */
export const EXPLAIN_WORDS_MIN = 60;
export const EXPLAIN_WORDS_MAX = 180;
/** The kind whose pages must carry a costs list in the explain block. */
export const COSTS_KIND = 'pattern';
/** How many bullets the costs list holds, and the words of each (the bold lead counts). */
export const COSTS_MIN = 2;
export const COSTS_MAX = 4;
export const COST_WORDS_MAX = 25;
/** The example paragraph's word bound, label excluded. */
export const EXAMPLE_WORDS_MAX = 120;
/** The example fence's line bound. */
export const EXAMPLE_FENCE_LINES_MAX = 25;
/** The label an example paragraph opens with. */
export const EXAMPLE_LABEL = 'Example.';

export interface ExplainProblem {
  readonly message: string;
  /** The 1-based source line of the node the problem is about, when it has one. */
  readonly line?: number;
  /**
   * The ratchet an allowlist entry may excuse it under, or null when nothing
   * may: `explain` is a missing example or a word bound on the paragraph,
   * `costs` a missing costs list.
   */
  readonly ratchet: Ratchet | null;
}

/** What a page's kind asks of the block beyond the paragraph. */
export interface ExplainOptions {
  /** The costs list is required (a pattern page); otherwise it is optional. */
  readonly costsRequired?: boolean;
}

/** The words of a text: runs of non-space characters. */
export function wordCount(text: string): number {
  const t = text.trim();
  return t === '' ? 0 : t.split(/\s+/).length;
}

const lineOf = (n: Nodes): { line?: number } => (n.position === undefined ? {} : { line: n.position.start.line });

/** Does a paragraph open with a bold run? Returns that run's text, or null. */
function boldLead(node: Paragraph): string | null {
  const first = node.children[0];
  return first?.type === 'strong' ? plainText(first) : null;
}

/** The finding for one costs bullet that breaks the list's shape, or null. */
function costProblem(item: ListItem): string | null {
  const para = item.children[0];
  if (item.children.length !== 1 || para?.type !== 'paragraph') return 'a costs bullet is one paragraph of text';
  if (boldLead(para) === null) return `a costs bullet opens with a bold lead — "${plainText(para).split(/\s+/).slice(0, 4).join(' ')}…" does not`;
  const words = wordCount(plainText(para));
  return words > COST_WORDS_MAX ? `a costs bullet is ${String(words)} words — at most ${String(COST_WORDS_MAX)}` : null;
}

/**
 * Every way the nodes under an explain heading break KB-014. `nodes` are the
 * block's nodes after its `##` heading and its meta line; a stray html node
 * (the meta line) is skipped.
 */
export function explainProblems(nodes: readonly Nodes[], options: ExplainOptions = {}): ExplainProblem[] {
  const content = nodes.filter((n) => n.type !== 'html');
  const out: ExplainProblem[] = [];
  const add = (message: string, at: Nodes | undefined, ratchet: Ratchet | null = null): void => {
    out.push({ message, ...(at === undefined ? {} : lineOf(at)), ratchet });
  };

  const [text, ...afterText] = content;
  if (text === undefined) {
    add('the explain block is empty — it holds one paragraph, a costs list, then one example', undefined);
    return out;
  }
  if (text.type !== 'paragraph') {
    add(`the explain block opens with a ${text.type}, not its paragraph — it holds one paragraph, a costs list, then one example`, text);
  } else {
    const lead = boldLead(text);
    if (lead !== null) add(`the explanation opens with the bold label "${lead}" — write plain prose, the heading says what it is`, text);
    const words = wordCount(plainText(text));
    if (words < EXPLAIN_WORDS_MIN || words > EXPLAIN_WORDS_MAX) {
      add(`the explanation is ${String(words)} words — it runs ${String(EXPLAIN_WORDS_MIN)} to ${String(EXPLAIN_WORDS_MAX)}, and what it costs goes in the costs list`, text, 'explain');
    }
  }

  // The costs list, when there is one, sits between the paragraph and the example.
  const costs = afterText[0]?.type === 'list' ? afterText[0] : undefined;
  const [example, ...rest] = costs === undefined ? afterText : afterText.slice(1);
  if (costs === undefined) {
    if (options.costsRequired === true) {
      add(`no costs list — after the paragraph, ${String(COSTS_MIN)} to ${String(COSTS_MAX)} bullets, each a bold lead and at most ${String(COST_WORDS_MAX)} words, say what it costs`, text, 'costs');
    }
  } else {
    if (costs.ordered === true) add('the costs list is a bullet list, not a numbered one', costs);
    if (costs.children.length < COSTS_MIN || costs.children.length > COSTS_MAX) {
      add(`the costs list has ${String(costs.children.length)} bullets — it holds ${String(COSTS_MIN)} to ${String(COSTS_MAX)}`, costs);
    }
    for (const item of costs.children) {
      const problem = costProblem(item);
      if (problem !== null) add(problem, item);
    }
  }

  if (example === undefined) {
    add(`no example — the block ends with a paragraph opening **${EXAMPLE_LABEL}** (at most ${String(EXAMPLE_WORDS_MAX)} words) or one captioned sketch fence`, text, 'explain');
  } else if (example.type === 'paragraph') {
    const lead = boldLead(example);
    if (lead !== EXAMPLE_LABEL) {
      add(`the next element is a paragraph that does not open with **${EXAMPLE_LABEL}** — the block holds one paragraph, a costs list, then one example`, example);
    } else {
      const words = wordCount(plainText(example)) - wordCount(EXAMPLE_LABEL);
      if (words < 1) add(`the example holds no words after its **${EXAMPLE_LABEL}** label`, example);
      else if (words > EXAMPLE_WORDS_MAX) add(`the example is ${String(words)} words — at most ${String(EXAMPLE_WORDS_MAX)}`, example);
    }
  } else if (example.type === 'code') {
    if (example.lang === 'mermaid') add('the example is a mermaid diagram — a fence example is a code sketch', example);
    const lines = example.value === '' ? 0 : example.value.split('\n').length;
    if (lines > EXAMPLE_FENCE_LINES_MAX) add(`the example fence is ${String(lines)} lines — at most ${String(EXAMPLE_FENCE_LINES_MAX)}`, example);
    if ((readKb(example)?.caption ?? '') === '') add('the example fence has no caption — name the question it answers: caption="…"', example);
  } else if (example.type === 'list') {
    add('the costs list sits after the example — put it right after the paragraph, before the example', example);
  } else {
    add(`the next element is a ${example.type} — the example is an **${EXAMPLE_LABEL}** paragraph or one captioned sketch fence`, example);
  }

  for (const extra of rest) add(`the explain block holds a ${extra.type} after its example — it holds one paragraph, a costs list and one example, nothing else`, extra);
  return out;
}
