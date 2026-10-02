/**
 * The shared markdown text helpers: what they escape, and — through the one
 * parser — that what they write reads back as the same plain text.
 */

import { describe, expect, it } from 'vitest';

import { parseKb, plainText, type Paragraph } from './kb-attrs.js';
import { AUTOLINK_BREAK, autolinkBreaks, escapeLineStart, escapeMdText, guardTrailingBrace, relativeMd } from './md-text.js';

/** The one paragraph a line of markdown parses to. */
function para(md: string): Paragraph {
  const node = parseKb(md).tree.children[0];
  if (node?.type !== 'paragraph') throw new Error(`not a paragraph: ${md}`);
  return node;
}

describe('escapeMdText', () => {
  it('escapes what would open markup, and writes U+00A0 as &nbsp;', () => {
    expect(escapeMdText('a*b_c [d] `e` <T> &amp; ~x| \\\u00a0')).toBe('a\\*b\\_c \\[d\\] \\`e\\` \\<T> \\&amp; \\~x\\| \\\\&nbsp;');
    expect(escapeMdText('a < b & c')).toBe('a < b & c');
  });

  it('reads back as the text it was given', () => {
    const text = 'a*b_c [d] `e` <T> &amp; ~x~ | \\ 5\u00a0ms';
    expect(plainText(para(escapeMdText(text)))).toBe(text);
  });

  it('keeps an email address and a bare URL as text, not a link (D-07)', () => {
    for (const text of ['send to john@example.com every Friday', 'see www.example.com today', 'fetch https://example.com/x now']) {
      const md = escapeMdText(text);
      expect(md).toContain(AUTOLINK_BREAK);
      const p = para(md);
      expect(p.children.some((c) => c.type === 'link')).toBe(false);
      expect(plainText(p)).toBe(text);
    }
  });
});

describe('autolinkBreaks', () => {
  it('breaks before the @ of an address, the . of www. and the : of a scheme', () => {
    expect(autolinkBreaks('mail john@example.com')).toEqual([9]);
    expect(autolinkBreaks('www.example.com')).toEqual([3]);
    expect(autolinkBreaks('(https://a.io)')).toEqual([6]);
    // GFM links `www.b` inside `a.www.b`: a `.` is an allowed previous character.
    expect(autolinkBreaks('a.www.b')).toEqual([5]);
  });

  it('leaves text alone that GFM would not link', () => {
    expect(autolinkBreaks('plain words, a@b, 10:30, www, www.x_, /persons/{id}')).toEqual([]);
    expect(autolinkBreaks('path/john@example.com')).toEqual([]);
    expect(autolinkBreaks('xwww.example.com')).toEqual([]);
    // A single-label host has fewer than the two domain parts the pass requires.
    expect(autolinkBreaks('visit https://localhost/page now')).toEqual([]);
  });

  it('sorts ascending when a line carries more than one break', () => {
    expect(autolinkBreaks('mail john@example.com or visit https://example.org now')).toEqual([9, 36]);
    expect(autolinkBreaks('visit https://example.org or mail john@example.com')).toEqual([11, 38]);
  });

  it('the unbroken text really is a link, so the break is needed', () => {
    const p = para('send to john@example.com');
    expect(p.children.some((c) => c.type === 'link')).toBe(true);
  });
});

describe('escapeLineStart', () => {
  it('escapes a line start only when the line would start a block', () => {
    expect(escapeLineStart('# Title')).toBe('\\# Title');
    expect(escapeLineStart('#hashtag')).toBe('#hashtag');
    expect(escapeLineStart('- item')).toBe('\\- item');
    expect(escapeLineStart('-5 degrees')).toBe('-5 degrees');
    expect(escapeLineStart('> quote')).toBe('\\> quote');
    expect(escapeLineStart('1. first')).toBe('1\\. first');
    expect(escapeLineStart('99.9% up')).toBe('99.9% up');
    expect(escapeLineStart('---')).toBe('\\---');
    expect(escapeLineStart('===')).toBe('\\===');
    expect(escapeLineStart('~~~js')).toBe('\\~~~js');
    expect(escapeMdText('+ plus', true)).toBe('\\+ plus');
  });
});

describe('guardTrailingBrace', () => {
  it('escapes a trailing brace group once, and leaves others alone', () => {
    expect(guardTrailingBrace('call /persons/{id}')).toBe('call /persons/{id}');
    expect(guardTrailingBrace('the {x} group')).toBe('the {x} group');
    expect(guardTrailingBrace('ends with {x}')).toBe('ends with \\{x}');
    expect(guardTrailingBrace(guardTrailingBrace('ends with {x}'))).toBe('ends with \\{x}');
  });
});

describe('relativeMd', () => {
  it('links between markdown files the way today links between pages', () => {
    expect(relativeMd('docs/patterns/a/x.md', 'docs/patterns/a/y.md')).toBe('./y.md');
    expect(relativeMd('docs/patterns/a/x.md', 'docs/themes/t.md')).toBe('../../themes/t.md');
  });
});
