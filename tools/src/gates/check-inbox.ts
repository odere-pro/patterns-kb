/**
 * Hold `docs/inbox.md` to an inbox's shape (spec: kb.harness.trap-inbox,
 * cap-gate).
 *
 * An inbox with a rule for adding and none for leaving only grows, and its
 * entries go on to repeat facts a gate, a rule or a layer already holds, each
 * copy going stale alone. The page carries its exit rule under one exact
 * heading, and this gate is the pressure behind it: at most 20 entries, each at
 * most 8 lines, so retiring an entry is something a session has to do rather
 * than something it might.
 *
 * What counts as an entry:
 *
 *   an entry     a top-level bullet whose text opens with a bold phrase — the
 *                trap stated first. Any other top-level bullet is a finding at
 *                its line: prose bullets at the top level are a section
 *                forming, and a trap written that way escapes the cap. So is
 *                a numbered item outside the exit-ladder section, which is
 *                the one list on the page that is not entries.
 *   top level    as CommonMark reads it: a marker indented 0 to 3 spaces,
 *                unless it sits deeper than the text of the item above it,
 *                which makes it a sub-point of that item.
 *   its length   its non-blank lines, from the bold phrase to the next entry,
 *                the next heading or the page end. A blank line neither counts
 *                nor ends it, because a markdown bullet continues past a blank
 *                line when the next line is indented; ending the count there
 *                would let one blank line dodge the limit.
 *   a fence      its lines are never a bullet or a heading, and inside an entry
 *                they count toward its length.
 *
 * The summary line states the count, the cap and the longest entry, so a page
 * whose traps are written in some other shape reads "0 of 20" in plain sight.
 *
 * Usage: check-inbox   (takes no arguments and declares no repair)
 */

import fs from 'node:fs';
import path from 'node:path';

import { main, type GateContext, type GateSpec } from '../lib/gate.js';

export const FILE = 'docs/inbox.md';
export const CAP = 20;
export const MAX_LINES = 8;
/** The page's contract: the exit ladder lives under exactly this line. */
export const CONTRACT = '## When an entry leaves';

export interface Entry {
  /** 1-based line of the entry's bold phrase. */
  readonly line: number;
  /** Non-blank lines, fenced lines included. */
  readonly length: number;
}

export interface Scan {
  readonly entries: Entry[];
  /** Every top-level bullet that does not open with a bold phrase, by line. */
  readonly loose: number[];
  /** Every top-level numbered item outside the exit-ladder section, by line. */
  readonly numbered: number[];
}

const FENCE = /^[ \t]*(```|~~~)/;
/** A list item's marker and the spaces after it: the width is its text's indent. */
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+)(\S?)/;
/** A heading indented 1 to 3 spaces; at column 0 any `#` line ends an entry. */
const INDENTED_HEADING = /^ {1,3}#{1,6}(?:[ \t]|$)/;

/** The entries, loose bullets and stray numbered items of one inbox page. */
export function scan(text: string): Scan {
  const entries: Entry[] = [];
  const loose: number[] = [];
  const numbered: number[] = [];
  let fenced = false;
  let start: number | null = null;
  let n = 0;
  /** Where the open top-level item's text starts; a marker this deep or deeper is its sub-point. */
  let itemIndent: number | null = null;
  let blank = false;
  let inLadder = false;

  const flush = (): void => {
    if (start !== null) entries.push({ line: start, length: n });
    start = null;
    n = 0;
  };

  text.split('\n').forEach((line, i) => {
    const no = i + 1;
    if (FENCE.test(line)) {
      fenced = !fenced;
      if (start !== null) n += 1;
      return;
    }
    if (fenced) {
      if (start !== null) n += 1;
      return;
    }
    const indent = line.length - line.replace(/^ +/, '').length;
    if (line.startsWith('#') || (INDENTED_HEADING.test(line) && (itemIndent === null || indent < itemIndent))) {
      flush();
      itemIndent = null;
      inLadder = line.trim() === CONTRACT;
      return;
    }
    const item = ITEM.exec(line);
    // After a blank line, text indented less than the item's own ends it.
    if (item === null && line.trim() !== '' && blank && itemIndent !== null && indent < itemIndent) itemIndent = null;
    blank = line.trim() === '';
    if (item !== null && (itemIndent === null || indent < itemIndent)) {
      const [, lead, marker, gap, first] = item as unknown as [string, string, string, string, string];
      itemIndent = lead.length + marker.length + (first === '' ? 1 : gap.length);
      if (/\d/.test(marker)) {
        if (!inLadder) numbered.push(no);
      } else if (/^\*\*\S/.test(line.slice(item[0].length - first.length))) {
        flush();
        start = no;
        n = 1;
        return;
      } else {
        loose.push(no);
      }
    }
    if (start !== null && line.trim() !== '') n += 1;
  });
  flush();
  return { entries, loose, numbered };
}

export const spec: GateSpec = {
  name: 'inbox-cap',
  usage: 'usage: check-inbox   (takes no arguments and declares no repair)',
  run(ctx: GateContext): string {
    const abs = path.join(ctx.root, FILE);
    if (!fs.existsSync(abs)) {
      ctx.fail(FILE, 'is missing — every trap with no home is written here, even when there are none');
      return '';
    }
    const text = fs.readFileSync(abs, 'utf8');
    const section = CONTRACT.replace(/^## /, '');

    // The exit rule is the file's contract. Deleted quietly, the next session
    // inherits a place to add traps and no way to take them out.
    const contract = text.split('\n').includes(CONTRACT);
    if (!contract) {
      ctx.fail(FILE, `has no "${CONTRACT}" line — that section is the page's contract, holding the exit ladder`);
    }

    const { entries, loose, numbered } = scan(text);
    for (const line of loose) {
      ctx.fail(FILE, 'a top-level bullet that does not open with a bold phrase — an entry states its trap first, in bold', line);
    }
    // With the section gone, its ladder is numbered nowhere it may be: the
    // missing contract is the one finding, not each of its tiers.
    for (const line of contract ? numbered : []) {
      ctx.fail(FILE, `a numbered item outside "${section}" — an entry is a bullet, and only the exit ladder is numbered`, line);
    }
    if (entries.length > CAP) {
      ctx.fail(
        FILE,
        `${entries.length} entries, cap ${CAP} — retire one before adding one, by the ladder under "${section}"`,
      );
    }
    for (const e of entries) {
      if (e.length > MAX_LINES) {
        ctx.fail(
          FILE,
          `entry is ${e.length} lines, limit ${MAX_LINES} — an entry this long is a fact that wants a home`,
          e.line,
        );
      }
    }

    const longest = entries.reduce((m, e) => Math.max(m, e.length), 0);
    return `[inbox-cap] ${entries.length} of ${CAP} entries, the longest ${longest} lines`;
  },
};

main(spec, import.meta.url);
