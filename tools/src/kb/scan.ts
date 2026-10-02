/**
 * The facts a listing and a writer need from every page — which blocks it
 * carries under which headings, does it carry an explain block, does it
 * carry real-world examples — read without parsing 382 pages.
 *
 * It reads only the dialect's section facts: an `##` or `###` line whose next
 * line is a `<!--meta …-->` comment, parsed by kb-attrs' own `parseFacts`,
 * outside any fence. A page "has examples" when its `wild` block holds a list
 * item. A heading is kept as its markdown, a trailing suffix cut off: what a
 * writer prints back under the same fact. tools/src/kb/scan.test.ts proves it
 * answers exactly what a full parse answers, on every page of the real tree.
 */

import { parseFacts, parseSuffix, splitTrailingSuffix } from '../lib/kb-attrs.js';

/** A `###` group under a block: its fact (`polarity`, `requirement`), the value, the heading. */
export interface GroupHeading {
  readonly fact: string;
  readonly value: string;
  readonly heading: string;
}

/** A block as the page heads it, with its groups. */
export interface BlockHeading {
  readonly block: string;
  readonly heading: string;
  readonly groups: readonly GroupHeading[];
}

export interface QuickFacts {
  /** The block names, in page order. */
  readonly blocks: readonly string[];
  readonly hasExplain: boolean;
  readonly hasExample: boolean;
  /** Each block's heading and its groups' headings, in page order. */
  readonly headings: readonly BlockHeading[];
}

const FENCE = /^[ \t]*(`{3,}|~{3,})/;

/** A heading line's text: the hashes, and a trailing suffix, cut off (a brace group that is no suffix is text). */
function headingText(line: string): string {
  const text = line.replace(/^#+[ \t]+/, '');
  const split = splitTrailingSuffix(text);
  try {
    if (split !== null) parseSuffix(split.suffix);
    return split?.text ?? text.trimEnd();
  } catch {
    return text.trimEnd();
  }
}

export function quickFacts(text: string): QuickFacts {
  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  const headings: { block: string; heading: string; groups: GroupHeading[] }[] = [];
  let fence: string | null = null;
  let block: string | null = null;
  let hasExample = false;
  lines.forEach((line, i) => {
    const f = FENCE.exec(line);
    if (fence !== null) {
      // A closing run: the same character, at least as long, nothing after it.
      if (f !== null && (f[1] as string)[0] === fence[0] && (f[1] as string).length >= fence.length && line.trim() === f[1]) fence = null;
      return;
    }
    if (f !== null) {
      fence = f[1] as string;
      return;
    }
    const facts = parseFacts(lines[i + 1] ?? '')?.facts;
    if (/^##[ \t]/.test(line)) {
      block = facts?.['block'] ?? null;
      if (block !== null) {
        blocks.push(block);
        headings.push({ block, heading: headingText(line), groups: [] });
      }
      return;
    }
    if (/^###[ \t]/.test(line)) {
      const fact = facts?.['polarity'] !== undefined ? 'polarity' : facts?.['requirement'] !== undefined ? 'requirement' : null;
      // A group heading counts only inside a block: `headings` then has its entry.
      if (fact !== null && block !== null) {
        (headings[headings.length - 1] as { groups: GroupHeading[] }).groups.push({ fact, value: (facts as Record<string, string>)[fact] as string, heading: headingText(line) });
      }
      return;
    }
    if (/^#[ \t]/.test(line)) block = null;
    else if (block === 'wild' && /^[-*+][ \t]/.test(line)) hasExample = true;
  });
  return { blocks, hasExplain: blocks.includes('explain'), hasExample, headings };
}
