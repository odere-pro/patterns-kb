/**
 * The shape of a page's description block (KB-015 of docs/reference/page-rules.md),
 * held in one place for the two readers that judge it: the kb-shape gate and
 * `kb.mjs validate`. Pure: it reads mdast nodes and returns problems.
 *
 * The block is the prose read first on every page: one paragraph of at most
 * 80 words, on every page kind. Both problems belong to the `description`
 * ratchet, so a page whose rewrite is pending may sit in the kb-shape allowlist.
 */

import { wordCount } from './explain-shape.js';
import { plainText, type Nodes } from './kb-attrs.js';

/** The longest description block, in words. */
export const DESCRIPTION_WORDS_MAX = 80;

export interface DescriptionProblem {
  readonly message: string;
  /** The 1-based source line of the node the problem is about, when it has one. */
  readonly line?: number;
  /** The block's words, set on the over-length problem: a ratchet entry's `maxWords` is held against it. */
  readonly words?: number;
}

const lineOf = (n: Nodes): { line?: number } => (n.position === undefined ? {} : { line: n.position.start.line });

/**
 * Every way the nodes under a description heading break KB-015. `nodes` are
 * the block's nodes after its `##` heading; the meta line (an html node) is skipped.
 */
export function descriptionProblems(nodes: readonly Nodes[]): DescriptionProblem[] {
  const content = nodes.filter((n) => n.type !== 'html');
  const first = content[0];
  if (first === undefined) return [{ message: 'the description block is empty — say what the page is for in 80 words or fewer' }];

  const out: DescriptionProblem[] = [];
  const stray = content.find((n) => n.type !== 'paragraph');
  const paragraphs = content.filter((n) => n.type === 'paragraph').length;
  if (stray !== undefined || paragraphs > 1) {
    const what = stray === undefined ? `holds ${String(paragraphs)} paragraphs` : `holds a ${stray.type}`;
    out.push({ message: `the description ${what} — it is one paragraph`, ...lineOf(stray ?? (content[1] as Nodes)) });
  }
  const words = content.reduce((n, node) => n + wordCount(plainText(node)), 0);
  if (words > DESCRIPTION_WORDS_MAX) {
    out.push({ message: `the description is ${String(words)} words — say what the page is for in ${String(DESCRIPTION_WORDS_MAX)} or fewer`, ...lineOf(first), words });
  }
  return out;
}
