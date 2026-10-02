/**
 * Markdown text helpers every writer of the dialect shares — the P2 converter
 * and the pure renderers of the marked blocks (render-relations.ts,
 * render-tours.ts), which the P3c generators gen-relations and gen-tours will
 * wrap; until then the converter writes every block, and the block stamps
 * already name the generator that will own it. Pure string functions;
 * nothing here parses a tree.
 *
 *   escapeMdText       plain text made safe for an inline position (D-06)
 *   escapeLineStart    what would make a line start a block, escaped (D-06)
 *   guardTrailingBrace a literal brace group that would read as a suffix (X-02)
 *   autolinkBreaks     where plain text would turn into a GFM autolink (D-07)
 *   relativeMd         the link from one markdown file to another (D-03)
 *
 * The dialect is tools/src/lib/dialect.md; the rule numbers are its own.
 */

import path from 'node:path';

import { splitTrailingSuffix } from './kb-attrs.js';

/**
 * The empty HTML comment that keeps plain text from becoming a GFM autolink
 * (D-07). It splits the text node, so the autolink-literal pass — which runs
 * on decoded text, where neither a backslash escape nor a character reference
 * survives — never sees the whole address. Readers drop raw html from text
 * (`plainText` in kb-attrs.ts), so the words are unchanged.
 */
export const AUTOLINK_BREAK = '<!-- -->';

// The two patterns mdast-util-gfm-autolink-literal (remark-gfm) runs over
// every text node outside a link, and its "expected previous character" test.
const URL_LITERAL = /(https?:\/\/|www(?=\.))([-.\w]+)([^ \t\r\n]*)/giu;
const EMAIL_LITERAL = /(?<=^|\s|\p{P}|\p{S})([-.\w+]+)@([-\w]+(?:\.[-\w]+)+)/gu;
const PREVIOUS_OK = /^(?:|\s|\p{P}|\p{S})$/u;

/** The pass's domain test: two labels at least, the last two free of `_` and holding a letter or digit. */
function isCorrectDomain(domain: string): boolean {
  const parts = domain.split('.');
  if (parts.length < 2) return false;
  for (const part of [parts[parts.length - 1], parts[parts.length - 2]]) {
    if (part !== undefined && part !== '' && (part.includes('_') || !/[a-zA-Z\d]/.test(part))) return false;
  }
  return true;
}

/**
 * The indexes in `text` before which `AUTOLINK_BREAK` must go so that no GFM
 * autolink literal forms (D-07): before the `@` of an address, before the `.`
 * of `www.`, before the `:` of `http://` / `https://`. `text` is decoded plain
 * text, and its start is treated as the start of a text node (the pass's `^`),
 * which errs toward breaking. Ascending, no duplicates; empty for ordinary text.
 */
export function autolinkBreaks(text: string): number[] {
  const at = new Set<number>();
  for (const m of text.matchAll(URL_LITERAL)) {
    if (!PREVIOUS_OK.test(text[m.index - 1] ?? '')) continue;
    const protocol = m[1] as string;
    const www = protocol.toLowerCase() === 'www';
    if (!isCorrectDomain(www ? protocol + (m[2] as string) : (m[2] as string))) continue;
    at.add(m.index + (www ? 3 : protocol.indexOf(':')));
  }
  for (const m of text.matchAll(EMAIL_LITERAL)) {
    if (text[m.index - 1] === '/') continue; // the pass refuses an address right after a slash
    at.add(m.index + (m[1] as string).length);
  }
  return [...at].sort((a, b) => a - b);
}

/**
 * Plain text made safe for a markdown inline position: every character that
 * could open markup is backslash-escaped, U+00A0 is written `&nbsp;` (D-06),
 * and an email address or bare URL is broken so it stays text (D-07).
 * `lineStart` also escapes what would start a block.
 */
export function escapeMdText(text: string, lineStart = false): string {
  const breaks = new Set(autolinkBreaks(text));
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i] as string;
    const next = text[i + 1] ?? '';
    if (breaks.has(i)) out += AUTOLINK_BREAK;
    if ('\\`*_[]~|'.includes(c)) out += `\\${c}`;
    else if (c === '<' && /[A-Za-z/!?]/.test(next)) out += '\\<';
    else if (c === '&' && /^&#?[A-Za-z0-9]+;/.test(text.slice(i))) out += '\\&';
    else if (c === '\u00a0') out += '&nbsp;';
    else out += c;
  }
  return lineStart ? escapeLineStart(out) : out;
}

/**
 * Escape what would make a line start a block instead of continuing text: an
 * ATX heading, a blockquote, a bullet or ordered list marker, a thematic break,
 * a setext underline, a tilde fence. Only when the line really would — `99.9%`
 * and `-5` stay as they are. Takes markdown that is already escaped inside.
 */
export function escapeLineStart(md: string): string {
  if (/^#{1,6}(?:[ \t]|$)/.test(md) || /^>/.test(md) || /^[-+](?:[ \t]|$)/.test(md)) return `\\${md}`;
  if (/^(?:-[ \t]*){3,}$/.test(md) || /^=+[ \t]*$/.test(md) || /^~{3,}/.test(md)) return `\\${md}`;
  return md.replace(/^(\d{1,9})([.)])(?=[ \t]|$)/, '$1\\$2');
}

/**
 * Escape a brace group that would otherwise end the text as a suffix
 * (`… {x}` → `… \{x}`, X-02). Idempotent: an escaped group is text already.
 */
export function guardTrailingBrace(md: string): string {
  const m = splitTrailingSuffix(md);
  if (m === null) return md;
  const at = md.lastIndexOf('{');
  return `${md.slice(0, at)}\\${md.slice(at)}`;
}

/** The link from one markdown file to another, `./x.md` in the same folder. */
export function relativeMd(fromSource: string, toSource: string): string {
  const rel = path.posix.relative(path.posix.dirname(fromSource), toSource);
  return rel.startsWith('.') ? rel : `./${rel}`;
}
