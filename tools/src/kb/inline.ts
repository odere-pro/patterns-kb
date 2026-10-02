/**
 * The inline markdown kb.mjs v2's writers print: a writer's text (an explain
 * rung, a relation note, a wild example, a production item) as the dialect
 * writes it (tools/src/lib/dialect.md D-06, D-07, D-30), byte for byte
 * what the converter writes for the same words, so rewriting an unchanged
 * block leaves the page as it was.
 *
 * It is the converter's inline writer cut down to what a writer takes — text,
 * code spans, one bold label, one link. The rules:
 *
 *   whitespace   HTML whitespace (never U+00A0) collapses to one space across
 *                runs, the ends are trimmed, and a space just inside the bold
 *                label moves outside it
 *   escapes      \ ` * [ ] always; _ unless between two letters or digits; <
 *                before a letter, / ! or ?; & that would form a reference; ~
 *                only when two could pair as strikethrough; U+00A0 as &nbsp;;
 *                what would start a block, at the start of a line
 *   autolinks    an address or bare URL outside a link is broken with <!-- -->
 *   code spans   a backtick run longer than any inside; padded with a space
 *                when the code starts or ends with a backtick, or with a space
 *                at both ends
 *
 * Writer input comes in two shapes, as scripts/kb.mjs took it: PLAIN text (a
 * note, a rung), every character literal; and RICH text (a wild or
 * production item), where `<code>…</code>` is the one inline tag and a
 * character reference such as `&amp;` stands for its character — the shape
 * `kb.mjs get --json` dumps them in, so an edit is a round trip.
 */

import { NodeType, parse, type HTMLElement, type Node } from 'node-html-parser';

import { AUTOLINK_BREAK, autolinkBreaks, escapeLineStart } from '../lib/md-text.js';

/** One run of a writer's inline content. */
export type Tok =
  | { readonly k: 'text'; v: string }
  | { readonly k: 'code'; v: string }
  | { readonly k: 'strong'; readonly open: boolean }
  | { readonly k: 'link'; readonly open: boolean; readonly dest: string };

const HTML_WS = /[ \t\n\r\f]+/g;
const ALNUM = /[\p{L}\p{N}]/u;

/** Plain text: every character literal. */
export function plainTokens(text: string): Tok[] {
  return [{ k: 'text', v: text }];
}

const MD_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/**
 * Plain text with markdown links: `[label](dest)` becomes a link, every other
 * character stays literal. A page-to-page link is written the way pages write
 * it, a relative path to the target's .md.
 */
export function linkedTokens(text: string): Tok[] {
  const out: Tok[] = [];
  let at = 0;
  for (const m of text.matchAll(MD_LINK)) {
    const dest = m[2] as string;
    if (m.index > at) out.push({ k: 'text', v: text.slice(at, m.index) });
    out.push({ k: 'link', open: true, dest }, { k: 'text', v: m[1] as string }, { k: 'link', open: false, dest });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ k: 'text', v: text.slice(at) });
  return out;
}

/**
 * Rich text as scripts/kb.mjs wrote it into a page and a browser read it
 * back: markup escaped but for `<code>` and `</code>`, a character reference
 * kept as one, the result parsed as HTML.
 */
export function richTokens(rich: string): Tok[] {
  const html = rich
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#[xX][0-9a-fA-F]+);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;(\/?)code&gt;/g, '<$1code>');
  const out: Tok[] = [];
  for (const n of parse(html).childNodes as Node[]) {
    if (n.nodeType === NodeType.ELEMENT_NODE) out.push({ k: 'code', v: (n as HTMLElement).text });
    else out.push({ k: 'text', v: n.text });
  }
  return out;
}

/** Collapse whitespace across runs, move spaces out of the bold label, trim both ends. */
function normalise(input: readonly Tok[]): Tok[] {
  const toks: Tok[] = input.map((t) => (t.k === 'text' || t.k === 'code' ? { ...t, v: t.v.replace(HTML_WS, ' ') } : t));
  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i] as Tok;
    const next = toks[i + 1];
    const prev = toks[i - 1];
    if (t.k === 'strong' && t.open && next?.k === 'text' && next.v.startsWith(' ')) {
      next.v = next.v.slice(1);
      toks.splice(i, 0, { k: 'text', v: ' ' });
      i += 1;
    } else if (t.k === 'strong' && !t.open && prev?.k === 'text' && prev.v.endsWith(' ')) {
      prev.v = prev.v.slice(0, -1);
      toks.splice(i + 1, 0, { k: 'text', v: ' ' });
    }
  }
  const out: Tok[] = [];
  let lastSpace = true;
  for (const t of toks) {
    if (t.k === 'text') {
      const v: string = lastSpace ? t.v.replace(/^ +/, '') : t.v;
      if (v === '') continue;
      out.push({ k: 'text', v });
      lastSpace = v.endsWith(' ');
    } else if (t.k === 'code') {
      if (t.v === '') continue;
      out.push(t);
      lastSpace = false;
    } else out.push(t);
  }
  for (let j = out.length - 1; j >= 0; j -= 1) {
    const t = out[j] as Tok;
    if (t.k === 'strong' || t.k === 'link') continue;
    if (t.k === 'text') {
      t.v = t.v.replace(/ +$/, '');
      if (t.v === '') {
        out.splice(j, 1);
        continue;
      }
    }
    break;
  }
  return out;
}

/** Could two `~` pair up as GFM strikethrough, by CommonMark's flanking rules? */
function strikethroughRisk(toks: readonly Tok[]): boolean {
  const stream = toks
    .map((t) => {
      if (t.k === 'text') return t.v;
      if (t.k === 'code') return '`x`';
      if (t.k === 'strong') return '**';
      return t.open ? '[' : '](x)';
    })
    .join('');
  const ws = (c: string): boolean => c === '' || /\s/u.test(c);
  const punct = (c: string): boolean => /[\p{P}\p{S}]/u.test(c);
  let opener = false;
  for (let i = 0; i < stream.length; i += 1) {
    if (stream[i] !== '~') continue;
    const prev = stream[i - 1] ?? '';
    const next = stream[i + 1] ?? '';
    const left = !ws(next) && (!punct(next) || ws(prev) || punct(prev));
    const right = !ws(prev) && (!punct(prev) || ws(next) || punct(next));
    if (right && opener) return true;
    if (left) opener = true;
  }
  return false;
}

function escapeText(v: string, lineStart: boolean, tildes: boolean, inLink: boolean): string {
  const breaks = new Set(inLink ? [] : autolinkBreaks(v));
  let out = '';
  for (let i = 0; i < v.length; i += 1) {
    const c = v[i] as string;
    const prev = v[i - 1] ?? '';
    const next = v[i + 1] ?? '';
    if (breaks.has(i)) out += AUTOLINK_BREAK;
    if ('\\`*[]'.includes(c)) out += `\\${c}`;
    else if (c === '_') out += ALNUM.test(prev) && ALNUM.test(next) ? '_' : '\\_';
    else if (c === '<') out += /[A-Za-z/!?]/.test(next) ? '\\<' : '<';
    else if (c === '&') out += /^&#?[A-Za-z0-9]+;/.test(v.slice(i)) ? '\\&' : '&';
    else if (c === '~') out += tildes ? '\\~' : '~';
    else if (c === ' ') out += '&nbsp;';
    else out += c;
  }
  return lineStart ? escapeLineStart(out) : out;
}

/** A code span that reads back as exactly `v`. */
export function codeSpan(v: string): string {
  let longest = 0;
  for (const m of v.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  const fence = '`'.repeat(longest + 1);
  const bothSpaces = v.startsWith(' ') && v.endsWith(' ') && v.trim() !== '';
  const pad = v.startsWith('`') || v.endsWith('`') || bothSpaces ? ' ' : '';
  return `${fence}${pad}${v}${pad}${fence}`;
}

/**
 * The markdown for a run of tokens. `lineStart`: the run opens a line, so
 * what would start a block there is escaped too.
 */
export function inlineMd(input: readonly Tok[], lineStart = false): string {
  const toks = normalise(input);
  const tildes = strikethroughRisk(toks);
  let md = '';
  let atStart = lineStart;
  let inLink = false;
  for (const t of toks) {
    switch (t.k) {
      case 'text':
        md += escapeText(t.v, atStart, tildes, inLink);
        break;
      case 'code':
        md += codeSpan(t.v);
        break;
      case 'strong':
        md += '**';
        break;
      case 'link':
        inLink = t.open;
        md += t.open ? '[' : `](${t.dest})`;
        break;
    }
    atStart = false;
  }
  return md;
}

/** Plain text as the words it reads back as: whitespace collapsed and trimmed. */
export function collapse(text: string): string {
  return text.replace(HTML_WS, ' ').replace(/^ | $/g, '');
}
