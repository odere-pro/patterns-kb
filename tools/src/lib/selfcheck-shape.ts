/**
 * The shape of a page's selfcheck block (KB-016 of docs/reference/page-rules.md),
 * held in one place for the readers that judge it: the kb-shape gate and
 * `kb.mjs validate`. Pure: it reads mdast nodes and returns problems; it reads
 * no file and knows no allowlist.
 *
 * The block is optional on a pattern, a hazard and a principle. Where a page
 * carries it, it holds three blockquotes and nothing else. Each blockquote
 * folds on the site (dialect D-43) and holds:
 *
 *   a question   the first paragraph, opening with a bold run that ends in `?`,
 *                at most 25 words
 *   an answer    the paragraphs after it, at most 60 words in all, with at
 *                least one link whose target carries a `#element-id`, so the
 *                answer cites the element it rests on
 *
 * Whether the cited id exists is the link gate's question, not this one's.
 */

import type { Blockquote } from 'mdast';

import { plainText, type Link, type Nodes, type Paragraph } from './kb-attrs.js';
import { wordCount } from './explain-shape.js';

/** How many blockquotes the block holds. */
export const SELFCHECK_COUNT = 3;
/** The question's word bound, and the answer's. */
export const QUESTION_WORDS_MAX = 25;
export const ANSWER_WORDS_MAX = 60;

export interface SelfcheckProblem {
  readonly message: string;
  /** The 1-based source line of the node the problem is about, when it has one. */
  readonly line?: number;
}

const lineOf = (n: Nodes): { line?: number } => (n.position === undefined ? {} : { line: n.position.start.line });

/** Every link under a node, in document order. */
function linksIn(node: Nodes): Link[] {
  if (node.type === 'link') return [node];
  return 'children' in node ? (node.children as Nodes[]).flatMap(linksIn) : [];
}

/** Does a link target name an element of a page: a non-empty `#fragment`? */
const cites = (url: string): boolean => /#[^#\s]+$/.test(url);

/** The findings for one blockquote that breaks the block's shape. */
function quoteProblems(quote: Blockquote, n: number): SelfcheckProblem[] {
  const out: SelfcheckProblem[] = [];
  const add = (message: string, at: Nodes = quote): void => {
    out.push({ message: `check ${String(n)}: ${message}`, ...lineOf(at) });
  };
  const [head, ...answer] = quote.children;
  const lead: Paragraph | undefined = head?.type === 'paragraph' ? head : undefined;
  const strong = lead?.children[0];
  if (lead === undefined || strong?.type !== 'strong') {
    add('opens with a bold question — "> **Why …?**"');
    return out;
  }
  const question = plainText(strong);
  if (!question.endsWith('?')) add(`the bold lead "${question}" is not a question — it ends in "?"`, lead);
  if (lead.children.length > 1) add('the question paragraph holds more than the bold question — the answer starts a new paragraph', lead);
  const qWords = wordCount(question);
  if (qWords > QUESTION_WORDS_MAX) add(`the question is ${String(qWords)} words — at most ${String(QUESTION_WORDS_MAX)}`, lead);

  const prose = answer.filter((a) => a.type === 'paragraph');
  if (prose.length === 0 || prose.length !== answer.length) add('the answer is one or more paragraphs after the question, and nothing else');
  const words = prose.reduce((sum, p) => sum + wordCount(plainText(p)), 0);
  if (words > ANSWER_WORDS_MAX) add(`the answer is ${String(words)} words — at most ${String(ANSWER_WORDS_MAX)}`);
  if (!answer.some((a) => linksIn(a).some((l) => cites(l.url)))) {
    add('the answer cites no element — link at least one `page.md#element-id`');
  }
  return out;
}

/**
 * Every way the nodes under a selfcheck heading break KB-016. `nodes` are the
 * block's nodes after its `##` heading and its meta line; a stray html node
 * (the meta line) is skipped.
 */
export function selfcheckProblems(nodes: readonly Nodes[]): SelfcheckProblem[] {
  const content = nodes.filter((n) => n.type !== 'html');
  const out: SelfcheckProblem[] = [];
  const quotes = content.filter((n): n is Blockquote => n.type === 'blockquote');
  for (const n of content) {
    if (n.type !== 'blockquote') out.push({ message: `the selfcheck block holds a ${n.type} — it holds ${String(SELFCHECK_COUNT)} blockquotes and nothing else`, ...lineOf(n) });
  }
  if (quotes.length !== SELFCHECK_COUNT) {
    const at = content[0];
    out.push({ message: `the selfcheck block holds ${String(quotes.length)} blockquotes — it holds exactly ${String(SELFCHECK_COUNT)}`, ...(at === undefined ? {} : lineOf(at)) });
  }
  quotes.forEach((q, i) => out.push(...quoteProblems(q, i + 1)));
  return out;
}
