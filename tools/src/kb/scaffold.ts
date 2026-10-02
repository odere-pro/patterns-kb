/**
 * The page `kb.mjs new` writes: frontmatter, the title and a lead, then every
 * block its kind requires, in the kind's order (docs/data/content-model.json),
 * each holding a TODO where the prose goes, so the page reads as a page from
 * the first minute and the lint names only what is still to write.
 *
 *   explain          a TODO paragraph, on a pattern two TODO costs bullets, then an `**Example.**` TODO
 *   a grouped block  one `###` per value its fact takes, each over a TODO item
 *                    (tradeoffs, usage, production, requirements)
 *   sketch           one fence in the first sketch language, with a summary
 *   relationships    the generated block, rendered from relations.json
 *   tour             a TODO lead, then the generated block from learning-paths.json
 *   anything else    a TODO paragraph
 *
 * No stamp and no `source` key: a page `new` writes is a source page, like
 * every page under docs/ (dialect D-13).
 */

import { printFacts, printFenceInfo } from '../lib/kb-attrs.js';
import { markers } from '../lib/generated.js';

import { explainLines } from './blocks.js';
import { inlineMd, plainTokens } from './inline.js';

/** One block's placeholder, in the dialect's shape. */
export interface ScaffoldInput {
  /** The printed frontmatter block, fences included. */
  readonly frontmatter: string;
  readonly title: string;
  /** The required blocks, in order. */
  readonly blocks: readonly string[];
  /** A block's `##` heading. */
  readonly heading: (block: string) => string;
  /** The groups a block's `###` headings carry: the fact and its values. */
  readonly groups: Readonly<Record<string, { readonly fact: string; readonly values: readonly string[] }>>;
  /** A group's `###` heading. */
  readonly groupHeading: (block: string, value: string) => string;
  /** The sketch fence's language. */
  readonly sketchLang: string;
  /** The page's kind asks for a costs list in its explain block (a pattern): scaffold two TODO bullets. */
  readonly costs?: boolean;
  /** A marked block's lines, stamp first: `relationships`, `tour`. */
  readonly generated: (name: string) => readonly string[];
}

export const TODO = 'TODO.';

function marked(name: string, lines: readonly string[]): string[] {
  const [open, close] = markers(name);
  return [open, '', ...lines, '', close];
}

function blockLines(input: ScaffoldInput, block: string): string[] {
  if (block === 'explain') {
    const costs = input.costs === true ? [{ lead: TODO, note: TODO }, { lead: TODO, note: TODO }] : [];
    return explainLines(input.heading(block), { text: TODO, costs, example: TODO });
  }
  const out = [`## ${input.heading(block)}`, printFacts({ block }), ''];
  const g = input.groups[block];
  if (g !== undefined) {
    g.values.forEach((value, i) => {
      if (i > 0) out.push('');
      out.push(`### ${input.groupHeading(block, value)}`, printFacts({ [g.fact]: value }), '', `- ${TODO}`);
    });
    return out;
  }
  switch (block) {
    case 'sketch':
      out.push(`\`\`\`${printFenceInfo(input.sketchLang, { summary: 'TODO — what the sketch shows' })}`, '// TODO', '```');
      break;
    case 'relationships':
      out.push(...marked(block, input.generated(block)));
      break;
    case 'tour':
      out.push('TODO — the stages, as the profile in docs/data/learning-paths.json lists them.', '', ...marked(block, input.generated(block)));
      break;
    default:
      out.push(TODO);
  }
  return out;
}

/** The new page's whole text. */
export function scaffoldText(input: ScaffoldInput): string {
  const parts = [`# ${inlineMd(plainTokens(input.title), true)}`, 'TODO — the longer definition sentence.', ...input.blocks.map((b) => blockLines(input, b).join('\n'))];
  return `${input.frontmatter}\n${parts.join('\n\n')}\n`;
}
