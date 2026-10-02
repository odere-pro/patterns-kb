/**
 * A markdown page read as lines, each placed in its zone: the frontmatter
 * block, a code fence, an indented code block, or the body. The one code
 * reading every line-based page rule shares (spec: kb.content.page-shape,
 * fence-reading, page-shape-C2 and C3), and the one H1 rule the frontmatter
 * gate, the shape gate and the mirror's title read share (frontmatter-C9).
 *
 * A fence opens on a line holding three or more backticks or tildes, indented
 * at most three spaces, or at any depth inside a list item, where a nested
 * fence sits indented. A backtick fence's info string holds no backtick. A
 * fence closes only on a line holding a run of the same character at least as
 * long as the opener and nothing after it but spaces, the CommonMark way; a
 * fence left open runs to the end of the file. The opening and closing lines
 * are fence lines too, so no rule reads a sample's `#` comment or a
 * four-backtick fence's inner ``` as anything.
 *
 * Outside a list, a line indented four spaces or more is indented code when
 * it does not continue a paragraph: it follows a blank line, a heading, a
 * fence or more indented code. A backtick run on such a line opens nothing.
 * A list runs from its first item until a line with no indent that follows a
 * blank line or is a heading; a line indented under an item is the item's.
 *
 * The frontmatter block is line 1 when it is `---`, to the next `---`; one
 * never closed runs to the end, as `scripts/lib-frontmatter.sh` reads it. This
 * module locates the block and never interprets a value in it — the parser is
 * `scripts/fm-json.sh`, and a second one here would be the forbidden copy.
 *
 * CRLF reads as LF: a trailing `\r` is dropped from every line.
 */

import { records } from './exec.js';

export type Zone = 'frontmatter' | 'fence' | 'code' | 'body';

export interface MdLine {
  /** 1-based line number in the file. */
  readonly no: number;
  /** The line, without its end-of-line characters. */
  readonly text: string;
  readonly zone: Zone;
}

/** A frontmatter delimiter line. */
export const FM_DELIMITER = /^---[ \t]*$/;

const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})(.*)$/;

/** A list item's first line: a bullet or a number, then a space. */
const LIST_ITEM = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]/;

/** An ATX heading of any depth: up to three spaces, one to six `#`, then a space or the end. */
const ATX = /^ {0,3}#{1,6}(?:[ \t]|$)/;

/** The columns of a line's leading whitespace, a tab reaching the next multiple of four. */
export function indentOf(line: string): number {
  let col = 0;
  for (const c of line) {
    if (c === ' ') col += 1;
    else if (c === '\t') col += 4 - (col % 4);
    else break;
  }
  return col;
}

/** Every line of `text`, each with its zone. */
export function mdLines(text: string): MdLine[] {
  const src = records(text).map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  const out: MdLine[] = [];
  let inFm = false;
  let fence: { char: string; length: number } | null = null;
  let inList = false;
  // What the last line was, as far as indented code cares: code may start
  // anywhere but on the line after a paragraph's, which it would continue.
  let prev: 'start' | 'blank' | 'block' | 'code' | 'para' = 'start';
  src.forEach((line, i) => {
    const no = i + 1;
    const push = (zone: Zone): void => {
      out.push({ no, text: line, zone });
    };
    if (no === 1 && FM_DELIMITER.test(line)) {
      inFm = true;
      push('frontmatter');
      return;
    }
    if (inFm) {
      if (FM_DELIMITER.test(line)) inFm = false;
      push('frontmatter');
      return;
    }
    if (fence !== null) {
      const close = new RegExp(`^[ \\t]*${fence.char === '`' ? '`' : '~'}{${String(fence.length)},}[ \\t]*$`);
      if (close.test(line)) {
        fence = null;
        prev = 'block';
      }
      push('fence');
      return;
    }
    if (line.trim() === '') {
      prev = 'blank';
      push('body');
      return;
    }
    const indent = indentOf(line);
    if (indent >= 4 && !inList) {
      if (prev === 'para') {
        push('body');
      } else {
        prev = 'code';
        push('code');
      }
      return;
    }
    const open = FENCE_OPEN.exec(line);
    // A backtick fence's info string cannot hold a backtick: ``` a ` b ```
    // is an inline code span, not a fence.
    if (open !== null && !((open[1] as string)[0] === '`' && (open[2] as string).includes('`'))) {
      const run = open[1] as string;
      fence = { char: run[0] as string, length: run.length };
      if (indent === 0) inList = false;
      push('fence');
      return;
    }
    if (LIST_ITEM.test(line)) {
      inList = true;
      prev = 'para';
    } else {
      const heading = ATX.test(line);
      if (indent === 0 && (prev === 'blank' || heading)) inList = false;
      prev = heading ? 'block' : 'para';
    }
    push('body');
  });
  return out;
}

/** An ATX H1: up to three leading spaces, one `#`, then a space. */
export const H1 = /^ {0,3}# /;

/** The first H1 in the body, as `{ no, title }`, or null when there is none. */
export function firstH1(text: string): { no: number; title: string } | null {
  for (const l of mdLines(text)) {
    if (l.zone === 'body' && H1.test(l.text)) {
      return { no: l.no, title: l.text.replace(H1, '').replace(/^[ \t]+|[ \t]+$/g, '') };
    }
  }
  return null;
}

/** The page opens with a frontmatter block. */
export function hasFrontmatter(text: string): boolean {
  return FM_DELIMITER.test((records(text)[0] ?? '').replace(/\r$/, ''));
}

/**
 * The line a frontmatter key is declared on, or 0 when the block does not
 * declare it. Locates only: the first line of the block starting `key:`.
 */
export function keyLine(lines: readonly MdLine[], key: string): number {
  const at = lines.find((l) => l.zone === 'frontmatter' && l.no > 1 && l.text.startsWith(`${key}:`));
  return at?.no ?? 0;
}

/**
 * The body with the frontmatter block blanked, line for line: a markdown
 * parser handed it reads positions that are the file's own line numbers, and
 * never takes the block's closing `---` for a setext underline.
 */
export function blankFrontmatter(text: string): string {
  return mdLines(text)
    .map((l) => (l.zone === 'frontmatter' ? '' : l.text))
    .join('\n');
}

/**
 * The body with the frontmatter block, every code fence and every indented
 * code block blanked, line for line: code is no heading and no prose, and a
 * finding still needs the file's own line numbers.
 */
export function outsideCode(text: string): string {
  return mdLines(text)
    .map((l) => (l.zone === 'body' ? l.text : ''))
    .join('\n');
}

/** `s` with every character but a line break turned into a space: same length, same lines. */
const blank = (s: string): string => s.replace(/[^\n]/g, ' ');

/**
 * `text` with its inline code spans and HTML comments blanked, offsets and
 * lines kept. One left-to-right pass, because whichever starts first wins: a
 * comment inside a code span is code, and a backtick inside a comment is
 * comment. A span closes on a backtick run of its own length and never
 * crosses a blank line; an opener with no closer is literal text.
 */
export function blankInline(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end !== -1) {
        out += blank(text.slice(i, end + 3));
        i = end + 3;
        continue;
      }
    }
    if (text[i] === '`') {
      let run = 1;
      while (text[i + run] === '`') run += 1;
      const close = new RegExp(`(?<!\`)\`{${String(run)}}(?!\`)`, 'g');
      close.lastIndex = i + run;
      const hit = close.exec(text);
      if (hit !== null && !text.slice(i + run, hit.index).includes('\n\n')) {
        out += blank(text.slice(i, hit.index + run));
        i = hit.index + run;
        continue;
      }
      out += text.slice(i, i + run);
      i += run;
      continue;
    }
    out += text[i] as string;
    i += 1;
  }
  return out;
}

/**
 * What a link reader reads: the text with its frontmatter, code (fenced and
 * indented), code spans and HTML comments blanked, line for line. A sample's
 * link routes nowhere, and a commented-out one is not on the rendered page.
 */
export function linkableText(text: string): string {
  return blankInline(outsideCode(text));
}
