/**
 * The writers' inline markdown: the converter's escaping and whitespace
 * rules, and the two input shapes scripts/kb.mjs took. That the bytes are the
 * converter's is proved on the real tree by write.test.ts, which rewrites
 * every wild and production block from its own dump and gets the page back.
 */

import { describe, expect, it } from 'vitest';

import { parseKb, plainText } from '../lib/kb-attrs.js';

import { codeSpan, collapse, inlineMd, linkedTokens, plainTokens, richTokens, type Tok } from './inline.js';

/** What a CommonMark + GFM reader gets back from a line: its plain text. */
const reads = (md: string): string => plainText(parseKb(md).tree);

describe('plainTokens and richTokens', () => {
  it('keep plain text literal, markup and references included', () => {
    expect(plainTokens('a <b> &amp; c')).toEqual([{ k: 'text', v: 'a <b> &amp; c' }]);
  });

  it('read rich text as scripts/kb.mjs wrote it: <code> is markup, a reference its character, all else text', () => {
    expect(richTokens('Use <code>a &lt; b</code> &amp; <b>not</b> this &nope; x & y')).toEqual([
      { k: 'text', v: 'Use ' },
      { k: 'code', v: 'a < b' },
      { k: 'text', v: ' & <b>not</b> this &nope; x & y' },
    ]);
  });

  it('close a code span the text leaves open, as an HTML reader does', () => {
    expect(richTokens('a <code>b c')).toEqual([
      { k: 'text', v: 'a ' },
      { k: 'code', v: 'b c' },
    ]);
  });
});

describe('linkedTokens', () => {
  it('turns [label](dest) into a link and keeps every other character literal', () => {
    expect(linkedTokens('See [the breaker](./breaker.md) and [Retry](../r.md#x) now *plain*.')).toEqual([
      { k: 'text', v: 'See ' },
      { k: 'link', open: true, dest: './breaker.md' },
      { k: 'text', v: 'the breaker' },
      { k: 'link', open: false, dest: './breaker.md' },
      { k: 'text', v: ' and ' },
      { k: 'link', open: true, dest: '../r.md#x' },
      { k: 'text', v: 'Retry' },
      { k: 'link', open: false, dest: '../r.md#x' },
      { k: 'text', v: ' now *plain*.' },
    ]);
    expect(linkedTokens('no links')).toEqual([{ k: 'text', v: 'no links' }]);
    expect(linkedTokens('[only](a.md)')).toEqual([
      { k: 'link', open: true, dest: 'a.md' },
      { k: 'text', v: 'only' },
      { k: 'link', open: false, dest: 'a.md' },
    ]);
    expect(linkedTokens('')).toEqual([]);
  });

  it('prints back as the same markdown, escaping the rest', () => {
    expect(inlineMd(linkedTokens('A [gate](./g.md) and *a star*.'), true)).toBe('A [gate](./g.md) and \\*a star\\*.');
  });
});

describe('inlineMd', () => {
  it('escapes only what would open markup', () => {
    const md = inlineMd(plainTokens('a*b [c] `d` \\e snake_case _lead <tag> <3 &amp; & 5 < 6 99.9% nbsp here'));
    expect(md).toBe('a\\*b \\[c\\] \\`d\\` \\\\e snake_case \\_lead \\<tag> <3 \\&amp; & 5 < 6 99.9% nbsp&nbsp;here');
    expect(reads(md)).toBe('a*b [c] `d` \\e snake_case _lead <tag> <3 &amp; & 5 < 6 99.9% nbsp here');
  });

  it('escapes a tilde only when two could pair as strikethrough', () => {
    expect(inlineMd(plainTokens('~100 ms, then ~42'))).toBe('~100 ms, then ~42');
    expect(inlineMd(plainTokens('a ~b~ c'))).toBe('a \\~b\\~ c');
    expect(inlineMd(plainTokens('(~1k) and ~2k'))).toBe('(~1k) and ~2k');
    expect(inlineMd(plainTokens('(~1k) and x~'))).toBe('(\\~1k) and x\\~');
    expect(inlineMd(plainTokens('x~ y and (~(z'))).toBe('x~ y and (~(z');
    expect(inlineMd(plainTokens('a ~(b) and c)~ d'))).toBe('a \\~(b) and c)\\~ d');
  });

  it('escapes what would start a block, only at the start of a line', () => {
    expect(inlineMd(plainTokens('- not a list'), true)).toBe('\\- not a list');
    expect(inlineMd(plainTokens('1. not a list'), true)).toBe('1\\. not a list');
    expect(inlineMd(plainTokens('- mid-line'))).toBe('- mid-line');
    expect(inlineMd([{ k: 'code', v: 'x' }, { k: 'text', v: '- y' }], true)).toBe('`x`- y');
  });

  it('breaks an address or a bare URL so it stays text, but not inside a link', () => {
    expect(inlineMd(plainTokens('mail ops@example.com or see https://example.com'))).toBe('mail ops<!-- -->@example.com or see https<!-- -->://example.com');
    const link: Tok[] = [{ k: 'link', open: true, dest: 'https://example.com' }, { k: 'text', v: 'https://example.com' }, { k: 'link', open: false, dest: 'https://example.com' }];
    expect(inlineMd(link)).toBe('[https://example.com](https://example.com)');
  });

  it('collapses whitespace across runs, trims both ends and moves a space out of the bold label', () => {
    const toks: Tok[] = [
      { k: 'text', v: '  ' },
      { k: 'strong', open: true },
      { k: 'text', v: ' Label ' },
      { k: 'strong', open: false },
      { k: 'text', v: ' —   the\nnote ' },
      { k: 'code', v: '' },
      { k: 'code', v: 'x  y' },
      { k: 'text', v: '   ' },
    ];
    expect(inlineMd(toks)).toBe('**Label** — the note `x y`');
  });

  it('drops a run that collapses to nothing, and trims a trailing space before a closing label', () => {
    expect(inlineMd([{ k: 'text', v: 'a ' }, { k: 'text', v: ' ' }, { k: 'text', v: 'b' }])).toBe('a b');
    expect(inlineMd([{ k: 'strong', open: true }, { k: 'text', v: 'x ' }, { k: 'text', v: ' ' }, { k: 'strong', open: false }])).toBe('**x**');
  });
});

describe('codeSpan', () => {
  it('fences with a run longer than any inside, padding when an end would be misread', () => {
    expect(codeSpan('plain')).toBe('`plain`');
    expect(codeSpan('a `b` c')).toBe('``a `b` c``');
    expect(codeSpan('`edge')).toBe('`` `edge ``');
    expect(codeSpan(' both ')).toBe('`  both  `');
    expect(codeSpan('   ')).toBe('`   `');
    for (const v of ['plain', 'a `b` c', '`edge', ' both ']) {
      const p = parseKb(`x ${codeSpan(v)}`).tree.children[0] as { children: { type: string; value: string }[] };
      expect(p.children.find((c) => c.type === 'inlineCode')?.value).toBe(v);
    }
  });
});

describe('collapse', () => {
  it('turns every HTML whitespace run into one space and trims, leaving a no-break space', () => {
    expect(collapse('  a \t\n b  ')).toBe('a b ');
  });
});
