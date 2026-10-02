/**
 * The static accessibility floor (spec kb.noise.accessibility). Each case is
 * one defect reduced to the smallest page that shows it; accessibility-O1 is
 * named below.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { expectFail, expectMisuse, expectPass, makeSandbox, type Sandbox } from '../lib/sandbox.js';
import {
  bandText,
  BAND_FILE,
  CHROME_ALLOWLIST,
  CHROME_BAND,
  CHROME_MAX,
  chromeLine,
  highestText,
  chromeRatio,
  compoundMatches,
  focusVisibleCompounds,
  hubHeadingFinding,
  imagesWithoutAlt,
  orphanedOptions,
  pageFindings,
  rightmostCompound,
  spec,
  unnamedGraphics,
  unringedControls,
} from './check-site-a11y.js';

const page = (body: string, opts: { lang?: boolean } = {}): string =>
  `<!doctype html><html${opts.lang === false ? '' : ' lang="en"'}><head><title>t</title></head><body>${body}</body></html>`;

describe('accessibility-O1', () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
    sb.write(BAND_FILE, '{"bandMax":0}');
  });
  afterEach(() => sb.cleanup());

  it('accessibility-O1: a planted page gives at least six findings, all on it, beside a clean page; removing the defects exits 0', async () => {
    const words = `<p>${'word '.repeat(50)}</p>`;
    sb.write('site/dist/clean.html', page(`<main><h1>Clean</h1>${words}</main>`));
    const planted =
      '<!doctype html><html><head><title>t</title></head><body><main><h1>One</h1><h1>Two</h1>' +
      '<ul><li role="option" id="o1">a</li></ul><img src="chart.png">' +
      '<svg id="d1" role="graphics-document document"><g></g></svg>' +
      `<p aria-labelledby="ghost">x</p>${words}</main></body></html>`;
    sb.write('site/dist/planted.html', planted);

    // The measured band: a clean page sits outside it or is only noted.
    expect(CHROME_BAND).toBeLessThan(CHROME_MAX);
    const r = await sb.run(spec);
    expectFail(r);
    const lines = r.err.split('\n').filter((l) => l.includes('] FAIL '));
    expect(lines.length).toBeGreaterThanOrEqual(6);
    for (const l of lines) expect(l.startsWith('[site-accessibility] FAIL site/dist/planted.html: ')).toBe(true);
    for (const what of ['missing lang', '2 <h1>', 'role="option"', 'chart.png', '<svg id="d1">', "'ghost'"]) {
      expect(lines.some((l) => l.includes(what)), what).toBe(true);
    }

    sb.write('site/dist/planted.html', page(`<main><h1>One</h1>${words}</main>`));
    const fixed = await sb.run(spec);
    expectPass(fixed);
    expect(fixed.out).toMatch(/^\[site-accessibility\] 2 page\(s\): /);
    expect(fixed.out).toMatch(/chrome within 80% \(highest \d+% on site\/dist\/(?:clean|planted)\.html; 0 allowlisted; \d+ in the warning band from 70%\)$/);
  });
});

describe('the chrome ratio', () => {
  it('fails a 90 percent chrome page, naming the percent, and passes it once allowlisted', () => {
    expect(chromeLine(0.9, false, CHROME_BAND)).toEqual({ kind: 'fail', text: expect.stringContaining('90% of the page text is chrome (cap 80%)') });
    expect(chromeLine(0.9, true, CHROME_BAND)).toBeNull();
  });

  it('notes an allowlisted page back under the cap, and a page in a declared band, at exit 0', () => {
    expect(chromeLine(0.5, true, CHROME_BAND)?.kind).toBe('waived');
    expect(chromeLine(0.75, false, 0.7)).toEqual({ kind: 'band', text: '75% of the page text is chrome, in the warning band 70% to 80%' });
    expect(chromeLine(0.65, false, 0.7)).toBeNull();
    expect(chromeLine(0.75, false, 0.8)).toBeNull();
    expect(bandText(0.7, 3)).toBe('3 in the warning band from 70%');
    expect(bandText(0.65, 0)).toBe('0 in the warning band from 65%');
    expect(highestText({ ratio: 0.791, page: 'site/dist/patterns.html' })).toBe('highest 79% on site/dist/patterns.html');
    expect(highestText(null)).toBe('every page allowlisted');
  });

  it('holds the spec’s cap, a measured band below it, and an empty allowlist', () => {
    expect(CHROME_MAX).toBe(0.8);
    expect(CHROME_BAND).toBe(0.7);
    expect(CHROME_ALLOWLIST.size).toBe(0);
  });
});

describe('pageFindings', () => {
  it('passes a clean page: lang, one h1 first, resolving refs', () => {
    const html = page(
      '<main><h1>Title</h1><h2>Section</h2><p aria-describedby="d">x</p><span id="d">def</span></main>',
    );
    expect(pageFindings(html)).toEqual([]);
  });

  it('fails a missing lang attribute', () => {
    expect(pageFindings(page('<main><h1>t</h1></main>', { lang: false }))).toContainEqual(
      expect.stringContaining('lang'),
    );
  });

  it('fails zero and multiple h1s', () => {
    expect(pageFindings(page('<main><h2>only</h2></main>'))).toContainEqual(
      expect.stringContaining('0 <h1>'),
    );
    expect(pageFindings(page('<main><h1>a</h1><h1>b</h1></main>'))).toContainEqual(
      expect.stringContaining('2 <h1>'),
    );
  });

  it('fails headings before the h1', () => {
    const html = page('<nav><h2>On this page</h2></nav><main><h1>Title</h1></main>');
    expect(pageFindings(html)).toContainEqual(expect.stringContaining('before the <h1>'));
  });

  it('fails role=option with no listbox anywhere', () => {
    const html = page('<main><h1>t</h1><ul><li role="option">a</li></ul></main>');
    expect(pageFindings(html)).toContainEqual(expect.stringContaining('listbox'));
  });

  it('fails an aria reference that names no id', () => {
    const html = page('<main><h1>t</h1><p aria-labelledby="ghost">x</p></main>');
    expect(pageFindings(html)).toContainEqual(expect.stringContaining("'ghost'"));
  });

  it('resolves multi-id references token by token', () => {
    const html = page('<main><h1>t</h1><p aria-describedby="a b"><span id="a">x</span></p></main>');
    expect(pageFindings(html)).toContainEqual(expect.stringContaining("'b'"));
    expect(pageFindings(html)).not.toContainEqual(expect.stringContaining("'a'"));
  });
});

describe('markup, not text', () => {
  it('reads no heading, id or reference inside an attribute value, a comment or a script body', () => {
    const html = page(
      '<main><h1>t</h1><button data-code="<h1>x</h1> aria-labelledby=&quot;g&quot;">c</button>' +
        '<!-- <h1>y</h1> --><script>var s = "<h1>z</h1>";</script></main>',
    );
    expect(pageFindings(html)).toEqual([]);
  });
});

describe('orphanedOptions', () => {
  const listbox = '<ul role="listbox"><li role="option" id="r0">a</li></ul>';
  const orphan = '<ul><li role="option" id="p0">a</li></ul>';

  it('passes an option inside its listbox', () => {
    expect(orphanedOptions(listbox)).toEqual([]);
  });

  it('fails an option with no listbox ancestor', () => {
    expect(orphanedOptions(orphan)).toHaveLength(1);
    expect(orphanedOptions(orphan)[0]).toContain('#p0');
  });

  it('is not fooled by a listbox elsewhere on the page', () => {
    expect(orphanedOptions(`<div>${listbox}</div><div>${orphan}</div>`)).toHaveLength(1);
  });

  it('is not fooled by a closed listbox before the orphan', () => {
    expect(orphanedOptions(`${listbox}${orphan}`)).toHaveLength(1);
  });

  it('follows the option through nested markup inside the listbox', () => {
    const nested = '<div role="listbox"><ul><li role="option"><a href="#x">a</a></li></ul></div>';
    expect(orphanedOptions(nested)).toEqual([]);
  });

  it('names the element when the option carries no id', () => {
    expect(orphanedOptions('<li role="option">a</li>')[0]).toContain('<li>');
  });

  it('is not shifted by a <div> inside an attribute value', () => {
    const html = `<div role="listbox" data-code="<div>"><li role="option">a</li></div>${orphan}`;
    expect(orphanedOptions(html)).toHaveLength(1);
  });
});

describe('imagesWithoutAlt', () => {
  it('passes a described image and a decorative one', () => {
    expect(imagesWithoutAlt('<img src="chart.png" alt="Revenue by quarter">')).toEqual([]);
    // An empty alt is an answer, not an omission: it says "nothing to read here".
    expect(imagesWithoutAlt('<img src="rule.png" alt="">')).toEqual([]);
    expect(imagesWithoutAlt('<img src="rule.png" alt>')).toEqual([]);
  });

  it('fails an image with no alt at all, naming its src', () => {
    const found = imagesWithoutAlt('<img src="hero-2x.png">');
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('hero-2x.png');
    expect(found[0]).toContain('no alt attribute');
  });

  it('names the element when there is no src to name', () => {
    expect(imagesWithoutAlt('<img data-src="x.png">')[0]).toContain('<img>');
  });

  it('is not fooled by an attribute whose name merely ends in alt', () => {
    expect(imagesWithoutAlt('<img src="x.png" data-salt="y">')).toHaveLength(1);
  });
});

describe('unnamedGraphics', () => {
  // The shape rehype-mermaid writes: a role, a stated purpose, no name.
  const diagram =
    '<svg id="mermaid-0" role="graphics-document document" ' +
    'aria-roledescription="flowchart-v2"><g><text>Node</text></g></svg>';

  it('fails a mermaid diagram with a role, a purpose and no name', () => {
    const found = unnamedGraphics(diagram);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('mermaid-0');
    expect(found[0]).toContain('no accessible name');
  });

  it('passes the three ways an SVG can be named', () => {
    expect(unnamedGraphics(diagram.replace('<g>', '<title>How it works</title><g>'))).toEqual([]);
    expect(unnamedGraphics(diagram.replace('id=', 'aria-label="How it works" id='))).toEqual([]);
    expect(
      unnamedGraphics(
        `<h2 id="how-it-works">How it works</h2>${diagram.replace('id=', 'aria-labelledby="how-it-works" id=')}`,
      ),
    ).toEqual([]);
  });

  it('does not accept an aria-labelledby that names no id on the page', () => {
    // Otherwise a dangling reference is a name, which is the opposite of one.
    expect(unnamedGraphics(diagram.replace('id=', 'aria-labelledby="ghost" id='))).toHaveLength(1);
  });

  it('passes a picture that says it carries nothing', () => {
    expect(unnamedGraphics('<svg aria-hidden="true"><path d="M0 0"/></svg>')).toEqual([]);
  });

  it('reads aria-hidden off an ancestor', () => {
    // Starlight's heading anchor puts the icon inside <span aria-hidden="true">.
    const anchor =
      '<a class="sl-anchor-link"><span aria-hidden="true"><svg><path/></svg></span></a>';
    expect(unnamedGraphics(anchor)).toEqual([]);
    // ...and the hiding ends where the subtree does.
    expect(unnamedGraphics(`${anchor}${diagram}`)).toHaveLength(1);
  });

  it('drops a data-kb-skip subtree, the way a machine reader does', () => {
    expect(unnamedGraphics('<header data-kb-skip><svg><path/></svg></header>')).toEqual([]);
  });

  it('does not let a nested diagram lend its title to the outer one', () => {
    // mermaid nests <svg> freely; a title inside an inner one names the inner one.
    const nested = '<svg id="outer"><svg id="inner"><title>Inner</title></svg></svg>';
    expect(unnamedGraphics(nested)).toHaveLength(1);
    expect(unnamedGraphics(nested)[0]).toContain('outer');
  });

  it('fails a self-closing svg: it has no children to hold a title', () => {
    const found = unnamedGraphics('<svg id="dot"/>');
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('<svg id="dot">');
  });

  it('lets a self-closing inner svg leave the outer one’s title reachable', () => {
    expect(unnamedGraphics('<svg id="outer"><svg id="mark" aria-label="Mark"/><title>Outer</title></svg>')).toEqual([]);
  });

  it('names the svg by class when it has no id, and by nothing when it has neither', () => {
    expect(unnamedGraphics('<svg class="icon"><g/></svg>')[0]).toContain('<svg class="icon">');
    expect(unnamedGraphics('<svg><g/></svg>')[0]).toContain('<svg> has no accessible name');
  });

  it('reports the same unnamed svg once', () => {
    expect(unnamedGraphics('<svg class="icon"><g/></svg><svg class="icon"><g/></svg>')).toHaveLength(1);
  });

  it('reaches pageFindings, so the gate reports it against the page', () => {
    expect(pageFindings(page(`<main><h1>t</h1>${diagram}</main>`))).toContainEqual(
      expect.stringContaining('no accessible name'),
    );
  });
});

describe('hubHeadingFinding', () => {
  const hub = (inner: string): string => `<section class="kb-hub-group">${inner}</section>`;

  it('says nothing about a page that renders no hub', () => {
    expect(hubHeadingFinding('<main><h1>t</h1></main>')).toBeNull();
  });

  it('fails a hub whose only heading is its h1', () => {
    const html = page(`<main><h1>Author</h1>${hub('<p class="kb-kicker">x</p>')}</main>`);
    expect(hubHeadingFinding(html)).toContain('only heading is its <h1>');
    expect(pageFindings(html)).toContainEqual(expect.stringContaining('only heading'));
  });

  it('passes a hub with a group heading', () => {
    const html = page(`<main><h1>Author</h1>${hub('<h2 class="kb-kicker">x</h2>')}</main>`);
    expect(hubHeadingFinding(html)).toBeNull();
    expect(pageFindings(html)).toEqual([]);
  });

  it('accepts a heading from the page prose rather than from the component', () => {
    // The root splash writes its own `## Start here` above the cards; the rule is
    // "this page has an outline", not "this component emitted it".
    const html = page(`<main><h1>Home</h1><h2>Start here</h2>${hub('<p>x</p>')}</main>`);
    expect(hubHeadingFinding(html)).toBeNull();
  });
});

describe('rightmostCompound', () => {
  it('cuts at a combinator', () => {
    expect(rightmostCompound('.a .b')).toBe('.b');
    expect(rightmostCompound('.a>.b')).toBe('.b');
    expect(rightmostCompound('.a + .b')).toBe('.b');
    expect(rightmostCompound('.only')).toBe('.only');
  });

  it('does not cut at an escaped space inside a bracket, as minified CSS writes it', () => {
    expect(rightmostCompound('[class*=\\ kb-]:focus-visible')).toBe(
      '[class*=\\ kb-]:focus-visible',
    );
    expect(rightmostCompound('.a [class*=\\ kb-]:focus-visible')).toBe(
      '[class*=\\ kb-]:focus-visible',
    );
  });

  it('does not cut at a combinator inside a functional pseudo-class', () => {
    expect(rightmostCompound(':is(.a > .b) .c')).toBe('.c');
  });
});

describe('focusVisibleCompounds', () => {
  it('reads the shipped, minified spelling of the shared floor', () => {
    // esbuild drops the quotes and escapes the space; the gate reads what ships.
    const css = '[class^=kb-]:focus-visible,[class*=\\ kb-]:focus-visible{outline:2px}';
    expect(focusVisibleCompounds(css)).toEqual([
      '[class^=kb-]:focus-visible',
      '[class*=\\ kb-]:focus-visible',
    ]);
  });

  it('keeps only the rightmost compound of a descendant selector', () => {
    expect(focusVisibleCompounds('.a .kb-b:focus-visible{x:y}')).toEqual(['.kb-b:focus-visible']);
    expect(focusVisibleCompounds('.a > .kb-b:focus-visible{x:y}')).toEqual([
      '.kb-b:focus-visible',
    ]);
  });

  it('ignores a :focus-visible written in a comment or a declaration value', () => {
    expect(
      focusVisibleCompounds('/* .kb-x:focus-visible */ .a{content:":focus-visible"}'),
    ).toEqual([]);
  });

  it('skips the selectors in a list that are not focus-visible ones', () => {
    expect(focusVisibleCompounds('.kb-a:hover,.kb-b:focus-visible{x:y}')).toEqual([
      '.kb-b:focus-visible',
    ]);
  });
});

describe('focusVisibleCompounds, ancestors', () => {
  it('drops a selector whose ring sits on an ancestor rather than the focused element', () => {
    expect(focusVisibleCompounds('.kb-card:focus-visible .kb-title{outline:0}')).toEqual([]);
  });
});

describe('compoundMatches', () => {
  it('matches a class token, with or without a tag name', () => {
    expect(compoundMatches('.kb-card:focus-visible', 'a', 'kb-card')).toBe(true);
    expect(compoundMatches('a.kb-card:focus-visible', 'a', 'kb-card')).toBe(true);
    expect(compoundMatches('a.kb-card:focus-visible', 'button', 'kb-card')).toBe(false);
    expect(compoundMatches('.kb-card:focus-visible', 'a', 'kb-other')).toBe(false);
  });

  it('matches the two halves of the floor for both class orders', () => {
    const first = '[class^=kb-]:focus-visible';
    const later = '[class*=\\ kb-]:focus-visible';
    expect(compoundMatches(first, 'button', 'kb-term extra')).toBe(true);
    expect(compoundMatches(first, 'button', 'not-content kb-term')).toBe(false);
    expect(compoundMatches(later, 'button', 'not-content kb-term')).toBe(true);
  });

  it('accepts a universal selector in front of an attribute selector', () => {
    expect(compoundMatches('*[class^=kb-]:focus-visible', 'a', 'kb-x')).toBe(true);
    expect(compoundMatches('*[class^=kb-]:focus-visible', 'a', 'other')).toBe(false);
  });

  it('reads the word, suffix and exact attribute operators', () => {
    expect(compoundMatches('[class~=kb-a]', 'a', 'x kb-a y')).toBe(true);
    expect(compoundMatches('[class~=kb-a]', 'a', 'x kb-ab')).toBe(false);
    expect(compoundMatches('[class$=kb-a]', 'a', 'x kb-a')).toBe(true);
    expect(compoundMatches('[class$=kb-a]', 'a', 'kb-a x')).toBe(false);
    expect(compoundMatches('[class="kb-a b"]', 'a', 'kb-a b')).toBe(true);
    expect(compoundMatches('[class="kb-a b"]', 'a', 'kb-a b c')).toBe(false);
  });

  it('claims nothing for a compound it does not understand', () => {
    // Conservative on purpose: the failure mode is a red gate naming a control,
    // never a quiet pass on a control with no ring.
    expect(compoundMatches('.kb-a:not(.b):focus-visible', 'a', 'kb-a')).toBe(false);
    expect(compoundMatches('[data-x=y]:focus-visible', 'a', 'kb-a')).toBe(false);
  });
});

describe('unringedControls', () => {
  const floor = ['[class^=kb-]:focus-visible', '[class*=\\ kb-]:focus-visible'];

  it('is empty while the floor is in the stylesheet', () => {
    const html =
      '<button class="kb-search-open"></button><a class="kb-card" href="#x">c</a>' +
      '<div class="kb-diagram-canvas" tabindex="0"></div>';
    expect(unringedControls(html, floor)).toEqual([]);
  });

  it('names every uncovered control once when the floor is gone', () => {
    const html =
      '<button class="kb-search-open"></button><button class="kb-search-open"></button>' +
      '<a class="kb-card" href="#x">c</a>';
    expect(unringedControls(html, ['.kb-theme-toggle:focus-visible'])).toEqual([
      '<a class="kb-card">',
      '<button class="kb-search-open">',
    ]);
  });

  it('ignores controls that are not ours, and text that is not a control', () => {
    const html = '<button class="sl-thing"></button><span class="kb-kicker">x</span>';
    expect(unringedControls(html, [])).toEqual([]);
  });

  it('treats a control with no class attribute as not ours', () => {
    expect(unringedControls('<button>plain</button><a href="/x">plain</a>', [])).toEqual([]);
  });

  it('ignores tabindex="-1" — focusable by script, never by Tab', () => {
    expect(unringedControls('<div class="kb-x" tabindex="-1"></div>', [])).toEqual([]);
    expect(unringedControls('<div class="kb-x" tabindex="0"></div>', [])).toHaveLength(1);
  });

  it('ignores a field, whose ring is its dialog’s own decision', () => {
    expect(unringedControls('<input class="kb-search-input" type="search">', [])).toEqual([]);
  });
});

describe('chromeRatio', () => {
  it('is low when the text lives in <main>', () => {
    const html = page(`<nav>menu</nav><main><h1>t</h1><p>${'word '.repeat(200)}</p></main>`);
    expect(chromeRatio(html)).toBeLessThan(0.2);
  });

  it('is high when the text lives outside <main>', () => {
    const html = page(`<nav>${'link '.repeat(200)}</nav><main><h1>t</h1></main>`);
    expect(chromeRatio(html)).toBeGreaterThan(0.8);
  });

  it('is zero for a page with no text at all', () => {
    expect(chromeRatio('<html><body></body></html>')).toBe(0);
  });

  it('is total when the page has text and no <main>', () => {
    expect(chromeRatio(page('<nav>only chrome here</nav>'))).toBe(1);
  });

  it('ignores script and style text entirely', () => {
    const html = page('<script>const x = 1;</script><main><h1>t</h1><p>real</p></main>');
    expect(chromeRatio(html)).toBeLessThan(0.5);
  });
});

describe('the gate end to end', () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
    sb.write(BAND_FILE, '{"bandMax":0}');
  });
  afterEach(() => sb.cleanup());

  it('asks for a build when there is no built site, or no page in it', async () => {
    expectFail(await sb.run(spec), 'no built site at site/dist — build it first: make site-build');
    sb.write('site/dist/_astro/style.css', '');
    expectFail(await sb.run(spec), 'no .html files under site/dist');
  });

  it('exits 2 on any argument, writing nothing', async () => {
    sb.write('site/dist/index.html', page('<main><h1>t</h1></main>'));
    const before = sb.snapshot();
    expectMisuse(await sb.run(spec, ['--nope']));
    expect(sb.snapshot()).toEqual(before);
  });

  it('passes a clean dist and fails a dirty one, naming the page', async () => {
    sb.write('site/dist/good.html', page(`<main><h1>t</h1><p>${'word '.repeat(50)}</p></main>`));
    const clean = await sb.run(spec);
    expectPass(clean);
    expect(clean.out).toContain('1 page(s)');

    sb.write('site/dist/bad.html', page('<nav><h2>chrome</h2></nav><main><h1>t</h1></main>'));
    const dirty = await sb.run(spec);
    expectFail(dirty);
    expect(dirty.err).toContain('site/dist/bad.html');
  });

  it('reads the shipped CSS, and fails the control the floor stopped covering', async () => {
    const control = '<button class="kb-search-open">s</button>';
    const body = `${control}<main><h1>t</h1><p>${'word '.repeat(50)}</p></main>`;
    sb.write('site/dist/index.html', page(body));

    // With the floor, clean — and the summary says how many selectors it read,
    // so a stylesheet the gate cannot see shows up as a suspicious zero.
    sb.write(
      'site/dist/_astro/style.abc.css',
      '[class^=kb-]:focus-visible,[class*=\\ kb-]:focus-visible{outline:2px solid red}',
    );
    const ringed = await sb.run(spec);
    expectPass(ringed);
    expect(ringed.out).toContain('2 :focus-visible selector(s)');

    // A hand-written list that does not name this control.
    sb.write('site/dist/_astro/style.abc.css', '.kb-theme-toggle:focus-visible{outline:2px}');
    const bare = await sb.run(spec);
    expectFail(bare);
    expect(bare.err).toContain('kb-search-open');
    expect(bare.err).toContain('no :focus-visible selector');
  });

  it('fails an unnamed diagram, and passes it once the frame names it', async () => {
    const svg = (extra: string): string =>
      `<figure class="kb-diagram"><div class="kb-diagram-canvas"><svg id="mermaid-0"${extra} ` +
      'role="graphics-document document" aria-roledescription="flowchart-v2"><g/></svg></div></figure>';
    const body = (extra: string): string =>
      `<main><h1>How it works</h1><h2 id="at-a-glance">At a glance</h2>${svg(extra)}` +
      `<p>${'word '.repeat(50)}</p></main>`;

    sb.write('site/dist/concepts/how-it-works.html', page(body('')));
    const bare = await sb.run(spec);
    expectFail(bare);
    expect(bare.err).toContain('site/dist/concepts/how-it-works.html');
    expect(bare.err).toContain('no accessible name');

    sb.write('site/dist/concepts/how-it-works.html', page(body(' aria-label="At a glance"')));
    const named = await sb.run(spec);
    expectPass(named);
    expect(named.out).toContain('every graphic named or hidden');
  });

  it('fails an image that arrived with no alt', async () => {
    sb.write(
      'site/dist/guide.html',
      page(`<main><h1>t</h1><img src="screenshot.png"><p>${'word '.repeat(50)}</p></main>`),
    );
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('screenshot.png');
  });

  it('holds the warning band to its ceiling: a page above it fails, at it passes, below it notes', async () => {
    // Chrome near 75%: 100 chrome words beside 50 in main.
    const banded = page(`<nav><p>${'chrome '.repeat(100)}</p></nav><main><h1>t</h1><p>${'word '.repeat(50)}</p></main>`);
    sb.write('site/dist/hub.html', banded);

    sb.write(BAND_FILE, '{"bandMax":0}');
    const over = await sb.run(spec);
    expectFail(over, `${BAND_FILE}: 1 page(s) sit in the chrome warning band, above the 0 the ratchet allows`);
    expect(over.err).not.toContain('FAIL site/dist/hub.html');

    sb.write(BAND_FILE, '{"bandMax":1}');
    const at = await sb.run(spec);
    expectPass(at);
    expect(at.out).toContain('1 in the warning band from 70%');

    sb.write(BAND_FILE, '{"bandMax":3}');
    const below = await sb.run(spec);
    expectPass(below);
    expect(below.err).toContain('lower bandMax from 3 to 1');
  });

  it('ignores files that are neither pages nor stylesheets', async () => {
    sb.write('site/dist/app.js', 'const x = 1;');
    sb.write('site/dist/ok.html', page(`<main><h1>t</h1><p>${'word '.repeat(50)}</p></main>`));
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('1 page(s)');
  });

  it('notes an allowlisted page back under the cap, without counting it in the band', async () => {
    const allow = CHROME_ALLOWLIST as Map<string, string>;
    allow.set('waived.html', 'planted for the test');
    try {
      sb.write('site/dist/waived.html', page(`<main><h1>t</h1><p>${'word '.repeat(50)}</p></main>`));
      const r = await sb.run(spec);
      expectPass(r);
      expect(r.err).toContain('site/dist/waived.html: ');
      expect(r.err).toContain('its CHROME_ALLOWLIST entry can go');
      expect(r.out).toContain('1 allowlisted');
      expect(r.out).toContain('every page allowlisted');
      expect(r.out).toContain('0 in the warning band');
    } finally {
      allow.delete('waived.html');
    }
  });

  it('fails a missing or malformed ratchet file', async () => {
    sb.write('site/dist/ok.html', page(`<main><h1>t</h1><p>${'word '.repeat(50)}</p></main>`));
    sb.rm(BAND_FILE);
    expectFail(await sb.run(spec), `${BAND_FILE}: is missing`);
    sb.write(BAND_FILE, 'nope');
    expectFail(await sb.run(spec), `${BAND_FILE}: is not valid JSON`);
    sb.write(BAND_FILE, '{"bandMax":-1}');
    expectFail(await sb.run(spec), `${BAND_FILE}: has no bandMax`);
    sb.write(BAND_FILE, '{"bandMax":0}');
    expectPass(await sb.run(spec));
  });

  it('fails a generated hub that ships with no heading below its title', async () => {
    sb.write(
      'site/dist/author.html',
      page(
        '<main><h1>Author</h1><section class="kb-hub-group"><p class="kb-kicker">g</p>' +
          `<p>${'word '.repeat(50)}</p></section></main>`,
      ),
    );
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('site/dist/author.html');
    expect(r.err).toContain('only heading is its <h1>');
  });
});
