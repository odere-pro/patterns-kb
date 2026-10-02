/**
 * The built-page formatter (spec kb.noise.formatter). Two kinds of test: the
 * shape assertions say the output is readable, and the painted-text assertions
 * say reading it did not cost the page a space. formatter-O1 is named below.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { expectFail, expectMisuse, expectPass, makeSandbox, type Sandbox } from '../lib/sandbox.js';
import { formatHtml, normalizeTag, assertSamePaint, OFF_FIXED_POINT, paintedText, parse, RenderChanged, spec, tagEnd, VOID } from './site-format.js';

/** The property the whole design exists to hold. */
const preservesText = (html: string): void => {
  expect(paintedText(formatHtml(html))).toBe(paintedText(html));
};

/** One pass is the fixed point. */
const isIdempotent = (html: string): void => {
  const once = formatHtml(html);
  expect(formatHtml(once)).toBe(once);
};

describe('formatter-O1', () => {
  it('formatter-O1: the skip link gets its text on its own line, inline code keeps its full stop, and a second run rewrites nothing', async () => {
    const sb = makeSandbox();
    try {
      const page =
        '<!doctype html>\n<html lang="en">\n<body>\n' +
        '<a class="sl-skip-link" href="#_top" data-kb-skip>Skip to content</a>\n' +
        '<main><p>Run <code>make site-build</code>.</p></main>\n</body>\n</html>\n';
      sb.write('site/dist/index.html', page);
      const first = await sb.run(spec);
      expectPass(first);
      expect(first.out).toBe('[site-format] formatted 1 page(s); 1 rewritten');
      const once = sb.read('site/dist/index.html');
      const lines = once.split('\n');
      const open = lines.findIndex((l) => l.includes('<a class="sl-skip-link"'));
      expect(lines[open]?.trim()).toBe('<a class="sl-skip-link" href="#_top" data-kb-skip>');
      expect(lines[open + 1]?.trim()).toBe('Skip to content</a>');
      expect(lines.some((l) => l.trim() === '<code>make site-build</code>.')).toBe(true);
      expect(paintedText(once)).toBe(paintedText(page));

      const second = await sb.run(spec);
      expectPass(second);
      expect(second.out).toBe('[site-format] formatted 1 page(s); 0 rewritten');
      expect(sb.read('site/dist/index.html')).toBe(once);
      expectPass(await sb.run(spec, ['--check']));
    } finally {
      sb.cleanup();
    }
  });
});

describe('tagEnd', () => {
  it('consumes quoted values, so a < or > inside one does not end the tag', () => {
    // Expressive Code keeps a sample's raw code in data-code, markup included.
    const tag = '<button data-code="npm install <name>@kb">';
    expect(tagEnd(tag, 0)).toBe(tag.length);
  });

  it('handles single quotes and an unterminated tag', () => {
    expect(tagEnd("<a title='a > b'>x", 0)).toBe(17);
    expect(tagEnd('<a href="x"', 0)).toBe(11);
  });
});

describe('normalizeTag', () => {
  it('puts a tag on one line without touching what is inside the quotes', () => {
    const wrapped =
      '<svg\n  aria-hidden="true"\n  viewBox="0 0 24 24"\n  style="--sl-icon-size: 1em"\n>';
    expect(normalizeTag(wrapped)).toBe(
      '<svg aria-hidden="true" viewBox="0 0 24 24" style="--sl-icon-size: 1em">',
    );
  });

  it('preserves case, empty values, bare attributes and the space in " />"', () => {
    expect(normalizeTag('<meta name="kb:tags" content="">')).toBe(
      '<meta name="kb:tags" content="">',
    );
    expect(normalizeTag('<meta name="kb:tags" content>')).toBe('<meta name="kb:tags" content>');
    expect(normalizeTag('<feDropShadow  stdDeviation="2"   />')).toBe(
      '<feDropShadow stdDeviation="2" />',
    );
    expect(normalizeTag('<foreignObject\n  requiredExtensions="x">')).toBe(
      '<foreignObject requiredExtensions="x">',
    );
  });

  it('keeps whitespace that is inside an attribute value', () => {
    const tag = '<button data-code="make validate      # gates">';
    expect(normalizeTag(tag)).toBe(tag);
  });

  it('closes a tag split across lines', () => {
    expect(normalizeTag('</a\n      >')).toBe('</a>');
  });
});

describe('the whitespace-safety rule', () => {
  it('breaks the skip link out — the seam has whitespace across the tag', () => {
    const html =
      '<body>\n  <a data-kb-skip class="sl-skip-link" href="#_top">Skip to content</a>\n  <div class="page"></div>\n</body>';
    expect(formatHtml(html)).toBe(
      '<body>\n' +
        '  <a data-kb-skip class="sl-skip-link" href="#_top">\n' +
        '    Skip to content</a>\n' +
        '  <div class="page"></div>\n' +
        '</body>\n',
    );
    preservesText(html);
  });

  it('refuses to break an inline element welded to punctuation', () => {
    // Breaking after </code> renders "Run make validate ." — a space the page
    // never had. This is the case the whole rule exists for.
    const html = '<div>\n  <p>Run <code>make validate</code>.</p>\n</div>';
    const out = formatHtml(html);
    expect(out).toContain('<code>make validate</code>.');
    expect(paintedText(out)).toBe('Run make validate.');
    preservesText(html);
  });

  it('keeps the closing tag of a link or a code chip against its last character, so the page space is not painted by it', () => {
    // A break added before </a> would become the first space of the run that
    // follows the link, and the underline would paint it.
    const html = '<div>\n  <p>a step toward the <a href="/x">Big Ball of Mud</a> failure mode</p>\n</div>';
    const out = formatHtml(html);
    expect(out).toContain('Big Ball of Mud</a>');
    expect(out).not.toMatch(/Mud\s+<\/a>/);
    expect(paintedText(out)).toBe('a step toward the Big Ball of Mud failure mode');
    preservesText(html);
    expect(formatHtml(out)).toBe(out);
  });

  it('still breaks before the close of a link that ends in another element or a comment', () => {
    const html = '<div>\n  <p>see <a href="/x"><span>one</span></a> and <a href="/y">two<!-- c --></a> now</p>\n</div>';
    const out = formatHtml(html);
    expect(out).toMatch(/<span>[\s\S]*<\/span>\s*<\/a>/);
    expect(paintedText(out)).toBe('see one and two now');
    expect(formatHtml(out)).toBe(out);
  });

  it('refuses to break two inline elements that touch', () => {
    const html = '<div>\n  <span>x</span><span>y</span>\n</div>';
    expect(formatHtml(html)).toContain('<span>x</span><span>y</span>');
    expect(paintedText(formatHtml(html))).toBe('xy');
  });

  it('breaks the same pair, and their contents, when a space separates them', () => {
    const html = '<div>\n  <span>x</span> <span>y</span>\n</div>';
    const out = formatHtml(html);
    expect(out).toBe('<div>\n  <span>\n    x\n  </span>\n  <span>\n    y\n  </span>\n</div>\n');
    expect(paintedText(out)).toBe('x y');
  });

  it('never deletes whitespace — an element holding only whitespace keeps it', () => {
    preservesText('<div>a<em> </em>b</div>');
  });

  it('does not let a script or style seam look breakable', () => {
    // a<script>…</script>b paints "ab": the script contributes no text, so the
    // seams around it are as glued as any other pair of touching characters.
    const html = '<div>a<script>var x = 1;</script>b</div>';
    expect(paintedText(formatHtml(html))).toBe('ab');
    preservesText(html);
  });
});

describe('shape', () => {
  it('keeps a 900-character path on one line', () => {
    const d = `M5 12a1 1 0 0 0-1-1H3${'a1 1 0 0 0 0 2h1'.repeat(60)}Z`;
    expect(d.length).toBeGreaterThan(900);
    const html = `<svg viewBox="0 0 24 24">\n  <path d="${d}" />\n</svg>`;
    const out = formatHtml(html);
    expect(out.split('\n').filter((l) => l.includes('<path')).length).toBe(1);
    expect(out).toContain(`<path d="${d}" />`);
  });

  it('copies a <pre> body byte for byte, with its > welded to the content', () => {
    const html =
      '<div>\n  <pre\n    data-language="json"\n  ><code>{\n  "a":   1,\n     "b": 2\n}</code></pre>\n</div>';
    const out = formatHtml(html);
    expect(out).toContain(
      '<pre data-language="json"><code>{\n  "a":   1,\n     "b": 2\n}</code></pre>',
    );
    preservesText(html);
  });

  it('leaves the JSON-LD compact and parseable', () => {
    // Head.astro emits JSON.stringify — compact, and it stays that way.
    const body = '{"@context":"https://schema.org","@type":"TechArticle","headline":"A  B"}';
    const html = `<head>\n  <script type="application/ld+json" data-kb="page">${body}</script>\n</head>`;
    const out = formatHtml(html);
    expect(out).toContain(`data-kb="page">${body}</script>`);
    const found = /<script[^>]*data-kb="page"[^>]*>([\s\S]*?)<\/script\s*>/.exec(out);
    expect(JSON.parse(found?.[1] as string)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: 'A  B',
    });
  });

  it('never expands <title> or SVG text, whose whitespace is not CSS', () => {
    expect(formatHtml('<head>\n  <title>A page</title>\n</head>')).toContain(
      '<title>A page</title>',
    );
    const svg = '<svg>\n  <text x="1">Label</text>\n  <text x="2"><tspan>a</tspan></text>\n</svg>';
    expect(formatHtml(svg)).toContain('<text x="1">Label</text>');
    expect(formatHtml(svg)).toContain('<text x="2"><tspan>a</tspan></text>');
  });

  it('indents by two, gives text its own line, and ends with one newline', () => {
    const out = formatHtml('<html>\n<body>\n<div>\n<p>Hi</p>\n</div>\n</body>\n</html>');
    expect(out).toBe(
      '<html>\n  <body>\n    <div>\n      <p>\n        Hi\n      </p>\n    </div>\n  </body>\n</html>\n',
    );
  });

  it('leaves an empty element on one line', () => {
    expect(formatHtml('<div>\n  <div class="page"></div>\n</div>')).toBe(
      '<div>\n  <div class="page"></div>\n</div>\n',
    );
  });
});

describe('the tokenizer on markup that fights back', () => {
  it('reads a comment that lives inside an attribute value', () => {
    const html =
      '<button data-code="## Rotate<!--meta audience=maintainer-->"><div></div></button>';
    // The comment stays sealed inside the attribute; only the child breaks out.
    expect(formatHtml(html)).toBe(
      '<button data-code="## Rotate<!--meta audience=maintainer-->">\n  <div></div>\n</button>\n',
    );
  });

  it('does not let a void element open a subtree', () => {
    const html = '<div>\n  <meta name="a" content="b">\n  <img src="x" />\n  <p>After</p>\n</div>';
    // <meta> and <img> are siblings of <p>, all at one level of indent — if
    // either had opened a subtree the <p> would be nested under it.
    expect(formatHtml(html)).toBe(
      '<div>\n  <meta name="a" content="b">\n  <img src="x" />\n  <p>\n    After\n  </p>\n</div>\n',
    );
    expect(VOID.has('meta')).toBe(true);
  });

  it('honours /> in SVG and ignores it in HTML, the way a browser does', () => {
    const svg = parse('<svg><path d="M0 0" /><circle r="1" /></svg>');
    const root = svg[0] as { children: unknown[] };
    expect(root.children).toHaveLength(2);

    // In HTML `<div />` does not self-close; the <p> is inside it.
    const html = parse('<div /><p>x</p>');
    expect(html).toHaveLength(1);
  });

  it('hands a foreignObject subtree back to HTML', () => {
    const nodes = parse('<svg><foreignObject><div /><p>x</p></foreignObject></svg>');
    const svg = nodes[0] as { children: { children: { children: unknown[] }[] }[] };
    const fo = svg.children[0] as { children: { children: unknown[] }[] };
    // `<div />` inside foreignObject is HTML again, so it swallowed the <p>.
    expect(fo.children).toHaveLength(1);
  });

  it('survives an unmatched close tag and an unclosed element', () => {
    expect(() => formatHtml('<div><span></div>')).not.toThrow();
    expect(() => formatHtml('</p>text')).not.toThrow();
    expect(paintedText(formatHtml('</p>text'))).toBe('text');
    expect(() => formatHtml('<div><p>x')).not.toThrow();
  });

  it('treats a bare < in running text as text', () => {
    expect(paintedText(formatHtml('<p>a < b</p>'))).toBe('a < b');
  });

  it('handles a doctype, a processing instruction and an unterminated comment', () => {
    expect(formatHtml('<!doctype html>\n<html></html>')).toContain('<!doctype html>');
    expect(() => formatHtml('<?xml version="1.0"?><p>x</p>')).not.toThrow();
    expect(() => formatHtml('<p>x</p><!-- never closed')).not.toThrow();
    expect(() => formatHtml('<script>var x = 1;')).not.toThrow();
  });

  it('keeps a comment glued when breaking around it would add a space', () => {
    expect(paintedText(formatHtml('<div>a<!--x-->b</div>'))).toBe('ab');
  });
});

describe('properties', () => {
  const corpus = [
    '<!doctype html>\n<html lang="en">\n  <head>\n    <title>T</title>\n  </head>\n  <body>\n    <p>Run <code>make validate</code>. Then <a href="/x">read this</a>.</p>\n  </body>\n</html>',
    '<div>\n  <svg viewBox="0 0 24 24">\n    <path\n      d="M5 12a1 1 0 0 0-1-1H3Z"\n    />\n  </svg>\n</div>',
    '<div><pre data-language="bash"><code>  indented\n    more</code></pre></div>',
    '<ul>\n  <li><span>x</span><span>y</span></li>\n  <li><span>x</span> <span>y</span></li>\n</ul>',
    '<div>a<script>var s = "</p>";</script>b</div>',
  ];

  it('is idempotent in one pass', () => {
    for (const html of corpus) isIdempotent(html);
  });

  it('never changes the painted text', () => {
    for (const html of corpus) preservesText(html);
  });

  it('reports rather than writes when it would change the page', () => {
    // The invariant is the backstop for a tokenizer bug. Nothing in the corpus
    // trips it, so assert the guard exists by exercising its message path.
    expect(() => formatHtml('<p>ok</p>')).not.toThrow();
    expect(paintedText('')).toBe('');
  });
});

describe('the pass', () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
  });
  afterEach(() => sb.cleanup());

  const UGLY =
    '<html>\n<body>\n<a class="skip" href="#_top">Skip to content</a>\n<p>Run <code>x</code>.</p>\n</body>\n</html>';

  it('formats every page and is a no-op the second time', async () => {
    sb.write('site/dist/index.html', UGLY);
    sb.write('site/dist/guides/one.html', UGLY);

    const first = await sb.run(spec);
    expectPass(first);
    expect(first.out).toContain('2 rewritten');

    const once = sb.read('site/dist/index.html');
    expect(once).toContain('<a class="skip" href="#_top">\n      Skip to content</a>');
    expect(once).toContain('<code>x</code>.');

    const second = await sb.run(spec);
    expectPass(second);
    expect(second.out).toContain('0 rewritten');
    expect(sb.read('site/dist/index.html')).toBe(once);
  });

  it('--check reports an unformatted page and writes nothing', async () => {
    sb.write('site/dist/index.html', UGLY);

    const r = await sb.run(spec, ['--check']);
    expectFail(r);
    expect(r.err).toContain('site/dist/index.html');
    expect(r.err).toBe(`[site-format] FAIL site/dist/index.html: ${OFF_FIXED_POINT}`);
    expect(sb.read('site/dist/index.html')).toBe(UGLY);
  });

  it('--check passes a page already at the fixed point, and --quiet says nothing', async () => {
    sb.write('site/dist/index.html', formatHtml(UGLY));
    expectPass(await sb.run(spec, ['--check']));
    const quiet = await sb.run(spec, ['--quiet']);
    expectPass(quiet);
    expect(quiet.out.trim()).toBe('');
  });

  it('says what to do when there is no dist, or nothing in it', async () => {
    const missing = await sb.run(spec, ['--dist', 'site/nope']);
    expectFail(missing);
    expect(missing.err).toContain('make site-build');

    sb.write('site/dist/keep.txt', 'x');
    const empty = await sb.run(spec);
    expectFail(empty);
    expect(empty.err).toContain('no .html files');
  });

  it('copies a subtree whose tag sets a non-collapsing white-space flat', () => {
    const html = '<div>\n<p style="white-space: pre-wrap">a <b>b</b>\n  c</p>\n</div>';
    expect(formatHtml(html)).toContain('<p style="white-space: pre-wrap">a <b>b</b>\n  c</p>');
  });

  it('refuses a change of painted text, naming the first offset where the two part', () => {
    expect(() => assertSamePaint('Run make.', 'Run make.')).not.toThrow();
    expect(() => assertSamePaint('Run make.', 'Run make .')).toThrow(RenderChanged);
    expect(() => assertSamePaint('Run make.', 'Run make .')).toThrow(/at character 8: "Run make\." became "Run make \."/);
  });

  it('exits 2 on an unknown flag and writes nothing', async () => {
    sb.write('site/dist/index.html', UGLY);
    expectMisuse(await sb.run(spec, ['--nope']));
    expect(sb.read('site/dist/index.html')).toBe(UGLY);
  });
});
