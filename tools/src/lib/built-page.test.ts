/**
 * The one reader of a built page. Each case is markup a quicker pattern gets
 * wrong: a `>` inside a quoted value, a tag inside a comment or a diagram's
 * stylesheet, a `content` with no value, a region that never closes.
 */

import { describe, expect, it } from 'vitest';

import {
  attrValue,
  comments,
  decode,
  elements,
  jsonLdBlocks,
  knowledgeRegion,
  metaContent,
  metaContents,
  metaCount,
  parseAttrs,
  regions,
  stripTags,
  tags,
} from './built-page.js';

describe('parseAttrs and attrValue', () => {
  it('reads double, single, unquoted and bare attributes, names lower-cased', () => {
    const attrs = parseAttrs(' Name="a > b" content=\'x\' data-x=y hidden');
    expect(attrs).toEqual([
      { name: 'name', value: 'a > b' },
      { name: 'content', value: 'x' },
      { name: 'data-x', value: 'y' },
      { name: 'hidden', value: null },
    ]);
    expect(attrValue(attrs, 'hidden')).toBe('');
    expect(attrValue(attrs, 'name')).toBe('a > b');
    expect(attrValue(attrs, 'nope')).toBeUndefined();
  });
});

describe('tags', () => {
  it('consumes a quoted value whole, skips comments and raw-text bodies', () => {
    const html = '<p title="a > b">x</p><!-- <div> --><style>a > b { }</style><script>if (a<b) {}</script><i/>';
    expect([...tags(html)].map((t) => `${t.closing ? '/' : ''}${t.name}${t.selfClosing ? '/' : ''}`)).toEqual([
      'p',
      '/p',
      'style',
      '/style',
      'script',
      '/script',
      'i/',
    ]);
  });

  it('stops at a raw-text element that never closes, and ignores a tag cut off by the end', () => {
    expect([...tags('<script>let a = "<p>";')].map((t) => t.name)).toEqual(['script']);
    expect([...tags('<p>x</p><div class="a')].map((t) => t.name)).toEqual(['p', 'p']);
  });
});

describe('comments', () => {
  it('finds a comment in the markup, never one inside an attribute value or a script body', () => {
    const html = '<p>a</p><!-- one --><button data-code="<!--meta k=v-->"></button><script>/* <!-- two --> */</script><!--three';
    expect([...comments(html)].map((c) => c.text)).toEqual([' one ', 'three']);
  });
});

describe('elements', () => {
  it('balances nested elements of the same name, and treats void and self-closed ones as empty', () => {
    const html = '<div id="a"><div>in</div></div><br><img src="x"/><div id="b"></div>';
    const divs = elements(html, (name, attrs) => name === 'div' && attrValue(attrs, 'id') !== undefined);
    expect(divs.map((d) => html.slice(d.innerStart, d.innerEnd))).toEqual(['<div>in</div>', '']);
    const empty = elements(html, (name) => name === 'br' || name === 'img');
    expect(empty.map((e) => [e.innerStart === e.innerEnd, e.closed])).toEqual([
      [true, true],
      [true, true],
    ]);
  });

  it('runs an element whose end tag never comes to the end of the file, and says so', () => {
    const [open] = elements('<div><p>cut off', (name) => name === 'div');
    expect(open).toMatchObject({ innerEnd: '<div><p>cut off'.length, closed: false });
  });
});

describe('the knowledge region', () => {
  it('is the one element carrying data-kb-region, whatever its class', () => {
    const html = '<x><div class="anything" data-kb-region><div>inner</div></div><y>';
    const r = knowledgeRegion(html) as [number, number];
    expect(html.slice(...r)).toBe('<div>inner</div>');
  });

  it('is not found by a class, and not fooled by a <div> inside a data-code value', () => {
    expect(knowledgeRegion('<div class="sl-markdown-content"><p>x</p></div>')).toBeNull();
    const inner = '<button data-code="a <div> b">copy</button><p>x</p>';
    const html = `<div data-kb-region>${inner}</div>`;
    expect(html.slice(...(knowledgeRegion(html) as [number, number]))).toBe(inner);
  });

  it('is null when two elements carry the hook, or the one never closes', () => {
    expect(regions('<div data-kb-region></div><main data-kb-region></main>')).toHaveLength(2);
    expect(knowledgeRegion('<div data-kb-region></div><main data-kb-region></main>')).toBeNull();
    expect(knowledgeRegion('<div data-kb-region><p>cut off')).toBeNull();
  });
});

describe('meta elements', () => {
  it('reads a value decoded, tells absent from empty, and reads a bare content as empty', () => {
    expect(metaContent('<meta name="kb:area" content="beginner">', 'kb:area')).toBe('beginner');
    expect(metaContent('<meta content="a &amp; b" name="description">', 'description')).toBe('a & b');
    expect(metaContent('<meta name="kb:tags" content="">', 'kb:tags')).toBe('');
    expect(metaContent('<meta name="kb:tags" content>', 'kb:tags')).toBe('');
    expect(metaContent('<meta name="kb:tags">', 'kb:tags')).toBe('');
    expect(metaContent('<html></html>', 'kb:area')).toBeNull();
  });

  it('reads every value of a name stated once per value, in order, dropping empty ones', () => {
    const html = '<meta name="kb:alias" content="CB"><meta name="kb:solves" content="a, b"><meta name="kb:alias"><meta name="kb:alias" content="fuse &amp; breaker">';
    expect(metaContents(html, 'kb:alias')).toEqual(['CB', 'fuse & breaker']);
    expect(metaContents(html, 'kb:solves')).toEqual(['a, b']);
    expect(metaContents(html, 'kb:area')).toEqual([]);
  });

  it('reads a value holding a closing tag, which ends no element inside quotes', () => {
    const html = '<meta name="description" content="What </script> ends"/><meta name="kb:area" content=advanced>';
    expect(metaContent(html, 'description')).toBe('What </script> ends');
    expect(metaContent(html, 'kb:area')).toBe('advanced');
  });

  it('matches the name exactly and counts each element', () => {
    expect(metaContent('<meta name="kbXarea" content="x">', 'kb:area')).toBeNull();
    expect(metaCount('<meta name="a" content="1"><meta name="a" content="2"><meta name="b">', 'a')).toBe(2);
  });
});

describe('jsonLdBlocks', () => {
  it('returns the text of each structured-data script, by its type', () => {
    const html =
      '<script type="application/ld+json" data-kb="page">{"a":1}</script>' +
      '<script>var x = 1;</script><script type=application/ld+json>{"b":2}</script>';
    expect(jsonLdBlocks(html)).toEqual(['{"a":1}', '{"b":2}']);
    expect(jsonLdBlocks('<script type="application/ld+json">{"cut":')).toEqual(['{"cut":']);
  });
});

describe('decode and stripTags', () => {
  it('decodes named and numeric references, and leaves unknown ones alone', () => {
    expect(decode('a &amp; b &#8212; c &#x2014; d &nosuch;')).toBe('a & b — c — d &nosuch;');
    expect(decode('&#99999999; &#X41;')).toBe('&#99999999; A');
  });

  it('keeps text, drops comments, scripts and a diagram’s stylesheet, and collapses space', () => {
    const html =
      '<p title="a > b">One <b>two</b></p><!-- gone --><svg><style>#m { fill: red }</style><text>label</text></svg>' +
      '<script>var gone = 1;</script>three &amp; four<!-- cut';
    expect(stripTags(html)).toBe('One two label three & four');
  });

  it('drops markup quoted inside a script, rather than reading its tags as the page’s', () => {
    expect(stripTags('<p>before</p><script>el.innerHTML = "<b>not text</b>";</script><p>after</p>')).toBe('before after');
  });

  it('keeps a no-break space inside a word, as a browser and the markdown do', () => {
    expect(stripTags('<h3>under 500&nbsp;ms</h3>')).toBe('under 500\u00a0ms');
  });

  it('drops an unclosed script body to the end of the file', () => {
    expect(stripTags('kept<script>let a = 1;')).toBe('kept');
  });
});
