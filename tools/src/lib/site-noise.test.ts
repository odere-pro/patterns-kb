/**
 * The noise half of the absence gate (spec kb.noise.absence-gate), one
 * property at a time over a single page, plus the whole-site script walk. The
 * gate end to end, and absence-gate-O1, are in check-site-absence.test.ts.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeSandbox, type Sandbox } from './sandbox.js';
import {
  ADD_OR_STOP,
  BUNDLE,
  known,
  isModuleType,
  LISTS,
  NOISE,
  noiseFindings,
  NOSCRIPT_STYLE,
  NOT_FOUND_STYLE_MAX,
  noscriptBodies,
  normalizeScript,
  presentational,
  Tally,
  unreachableScripts,
  unusedEntries,
  type NoiseLists,
} from './site-noise.js';

/** Lists as a measured site would hold them, fitted to the page below. */
const MEASURED: NoiseLists = {
  inlineScripts: [{ id: 'page-json-ld', reason: 'the page summary as data, never code', match: /^\{"@context":"https:\/\/schema\.org"/, type: 'application/ld+json' }],
  externalScripts: [{ id: 'search-payload', reason: 'the search payload, one classic script', match: /^search-index\.js$/ }],
  mainStylesheet: /^_astro\/style\.[^/]+\.css$/,
  otherStylesheets: [{ id: 'print', reason: 'downloads only when printing', match: /^_astro\/print\.[^/]+\.css$/ }],
  noscriptStyles: [{ id: 'no-script', reason: 'hides what the bundle drives', match: /^\.kb-lens \{ display: none; \}$/ }],
};

/** A page clean under MEASURED, with `head` and `body` spliced in. */
function page(opts: { head?: string; body?: string; chrome?: string; bundle?: string } = {}): string {
  return [
    '<!doctype html><html lang="en"><head>',
    '<script type="application/ld+json">{"@context":"https://schema.org","headline":"A"}</script>',
    '<link rel="stylesheet" href="../_astro/style.abc.css">',
    '<link rel="stylesheet" href="../_astro/print.abc.css" media="print">',
    '<noscript><style>.kb-lens { display: none; }</style></noscript>',
    '<script src="../search-index.js" defer></script>',
    opts.bundle ?? '<script src="../kb.js" defer></script>',
    opts.head ?? '',
    '</head><body class="frame">',
    '<header class="header" data-kb-skip><nav class="top">n</nav></header>',
    opts.chrome ?? '',
    '<main><div class="sl-markdown-content" data-kb-region><article data-page="/a/b.html" data-area="a" data-tags="t">',
    opts.body ?? '<p>Body.</p>',
    '</article></div></main>',
    '<footer class="foot" data-kb-skip>f</footer>',
    '</body></html>',
  ].join('\n');
}

const run = (html: string, lists: NoiseLists = MEASURED): { out: string[]; tally: Tally } => {
  const tally = new Tally();
  return { out: noiseFindings(html, lists, tally), tally };
};

describe('noiseFindings', () => {
  it('passes a clean page under measured lists, and uses every entry', () => {
    const { out, tally } = run(page());
    expect(out).toEqual([]);
    expect(unusedEntries(MEASURED, tally, [])).toEqual([]);
  });

  it('fails a second bundle tag, a missing one and a module bundle, naming the bundle', () => {
    expect(run(page({ head: '<script src="./kb.js"></script>' })).out).toEqual([
      '2 kb.js script tag(s) — a page loads its behaviour from exactly one classic kb.js',
    ]);
    expect(run(page({ bundle: '' })).out).toEqual(['0 kb.js script tag(s) — a page loads its behaviour from exactly one classic kb.js']);
    for (const type of ['module', 'Module', ' module ']) {
      expect(run(page({ bundle: `<script type="${type}" src="../kb.js"></script>` })).out).toEqual([
        'the kb.js bundle loads as a module — a module never runs from a folder; it loads as a classic script',
      ]);
    }
  });

  it('counts a bundle tag with a query or a fragment as the bundle: a second one, or a module one, fails', () => {
    expect(run(page({ bundle: '<script src="../kb.js?v=2#x" defer></script>' })).out).toEqual([]);
    expect(run(page({ head: '<script type="module" src="../../kb.js?v=2"></script>' })).out).toEqual([
      'the kb.js bundle loads as a module — a module never runs from a folder; it loads as a classic script',
      '2 kb.js script tag(s) — a page loads its behaviour from exactly one classic kb.js',
    ]);
  });

  it('fails an inline module with no allowlist path, even under lists naming everything', () => {
    const all: NoiseLists = { ...MEASURED, inlineScripts: [{ id: 'any', reason: 'a list that would name anything', match: /^/ }] };
    for (const type of ['module', 'Module', ' module ', 'MODULE']) {
      expect(run(page({ body: `<script type="${type}">import("x")</script>` }), all).out).toEqual([
        'an inline <script type="module"> — code belongs in a file, never in the page text. It begins: import("x")',
      ]);
    }
  });

  it('pins a data entry to its type: the JSON-LD opening as classic code is unnamed', () => {
    expect(run(page({ body: '<script>{"@context":"https://schema.org"};document.title="x"</script>' })).out).toEqual([
      `unnamed inline script — ${ADD_OR_STOP}. It begins: {"@context":"https://schema.org"};document.title="x"`,
    ]);
    expect(run(page({ body: '<script type=" Application/LD+JSON ">{"@context":"https://schema.org"}</script>' })).out).toEqual([]);
  });

  it('fails an unnamed external script, a remote path with a matching suffix, and a quoted opening in another script', () => {
    const out = run(
      page({
        head:
          '<script src="https://cdn.example.com/search-index.js"></script><script src="../x.js"></script>' +
          '<script>// {"@context":"https://schema.org"}\nrun()</script>',
      }),
    ).out;
    expect(out).toEqual([
      `unnamed external script <script src="https://cdn.example.com/search-index.js"> — ${ADD_OR_STOP}`,
      `unnamed external script <script src="../x.js"> — ${ADD_OR_STOP}`,
      `unnamed inline script — ${ADD_OR_STOP}. It begins: // {"@context":"https://schema.org"} run()`,
    ]);
  });

  it('names an external module script, even one the list knows, and passes the same file as a classic script', () => {
    const module = '<script type="module" src="../x.js"></script>';
    expect(run(page({ head: module })).out).toEqual([NOISE.namedScripts.module('../x.js'), NOISE.namedScripts.external('../x.js')]);
    expect(run(page({ head: '<script src="../x.js" defer></script>' })).out).toEqual([NOISE.namedScripts.external('../x.js')]);
    const known: NoiseLists = { ...MEASURED, externalScripts: [...MEASURED.externalScripts, { id: 'x', reason: 'a script the fixture names', match: /^x\.js$/ }] };
    expect(run(page({ head: module }), known).out).toEqual([NOISE.namedScripts.module('../x.js')]);
    expect(run(page({ head: '<script src="../x.js" defer></script>' }), known).out).toEqual([]);
  });

  it('takes the hashed bundle name as the bundle, and no other file name', () => {
    expect(run(page({ bundle: '<script src="../kb.3fa9c1d2.js" defer></script>' })).out).toEqual([]);
    expect(run(page({ bundle: '<script src="../kb.3FA9C1D2.js" defer></script>' })).out).toEqual([
      NOISE.namedScripts.external('../kb.3FA9C1D2.js'),
      '0 kb.js script tag(s) — a page loads its behaviour from exactly one classic kb.js',
    ]);
  });

  it('fails a second main stylesheet, a missing one and an unnamed stylesheet', () => {
    expect(run(page({ head: '<link rel="stylesheet" href="./_astro/style.def.css">' })).out).toEqual([
      '2 main stylesheet link(s) — every page shares exactly one',
    ]);
    expect(run(page().replace('<link rel="stylesheet" href="../_astro/style.abc.css">', '')).out).toEqual([
      '0 main stylesheet link(s) — every page shares exactly one',
    ]);
    expect(run(page({ head: '<link rel="stylesheet" href="../_astro/extra.css">' })).out).toEqual([
      `unnamed stylesheet <link href="../_astro/extra.css"> — ${ADD_OR_STOP}`,
    ]);
  });

  it('ignores a link with no rel, and names a stylesheet link with no href', () => {
    expect(run(page({ head: '<link href="../_astro/extra.css">' })).out).toEqual([]);
    expect(run(page({ head: '<link rel="stylesheet">' })).out).toEqual([`unnamed stylesheet <link href=""> — ${ADD_OR_STOP}`]);
  });

  it('fails a style element in the body, never one inside a vector graphic, nested or not, or behind <svg in a script body', () => {
    expect(run(page({ body: '<style>p { color: red; }</style><p>x</p>' })).out).toEqual([
      'a <style> element outside a vector graphic and a noscript — paint ships in the linked stylesheet',
    ]);
    const svg = '<svg><svg><style>.a{fill:red}</style></svg><style>.b{}</style></svg>';
    expect(run(page({ body: `${svg}<script>var s = "<svg>";</script>`.replace('<script>', '<script type="application/ld+json">{"@context":"https://schema.org"} ') })).out).toEqual([]);
    expect(run(page({ body: svg })).out).toEqual([]);
  });

  it('checks the noscript style whole: a changed selector fails until its entry changes too, and a missing one fails', () => {
    const changed = page().replace('.kb-lens {', '.kb-lens, .kb-new {');
    expect(run(changed).out).toEqual([
      `unnamed noscript style — ${ADD_OR_STOP}. It begins: .kb-lens, .kb-new { display: none; }`,
      'no noscript style — the controls the bundle drives stay on show with scripts off; the entry reads: ^\\.kb-lens \\{ display: none; \\}$',
    ]);
    const both: NoiseLists = { ...MEASURED, noscriptStyles: [{ id: 'no-script', reason: 'hides what the bundle drives', match: /^\.kb-lens, \.kb-new \{ display: none; \}$/ }] };
    expect(run(changed, both).out).toEqual([]);
  });

  it('fails a presentational style and a handler, and passes a custom property', () => {
    expect(run(page({ body: '<p style="margin-top: 1rem">x</p><button onclick="go()">b</button>' })).out).toEqual([
      'a presentational style="margin-top: 1rem" — paint belongs in a stylesheet; only custom properties (--x: y) stay inline',
      'an onclick attribute — behaviour lives in the kb.js bundle, never in the markup',
    ]);
    expect(run(page({ body: '<p style="--depth: 2">x</p><svg><rect style="fill: red"></rect></svg>' })).out).toEqual([]);
  });

  it('fails a handler inside a vector graphic, on the graphic or deeper: it runs like any other', () => {
    expect(run(page({ body: '<svg aria-hidden="true" onclick="x()"><g><rect onmouseover="y()"></rect></g></svg>' })).out).toEqual([
      'an onclick attribute — behaviour lives in the kb.js bundle, never in the markup',
      'an onmouseover attribute — behaviour lives in the kb.js bundle, never in the markup',
    ]);
  });

  it('fails an unmarked landmark outside the knowledge region whatever its class, and passes one inside it or in a skip subtree', () => {
    expect(run(page({ chrome: '<nav class="kb-anything">x</nav><aside>y</aside>' })).out).toEqual([
      'unmarked chrome <nav class="kb-anything"> outside the knowledge region — put it in a data-kb-skip subtree',
      'unmarked chrome <aside> outside the knowledge region — put it in a data-kb-skip subtree',
    ]);
    expect(run(page({ body: '<nav class="next">n</nav>', chrome: '<div data-kb-skip><footer>f</footer></div>' })).out).toEqual([]);
    // A skip marker named in a value shields nothing.
    expect(run(page({ chrome: '<div title="data-kb-skip"><header>h</header></div>' })).out).toHaveLength(1);
  });

  it('reads a quoted < as text and a template’s content as markup', () => {
    expect(run(page({ body: '<button data-code="<style>x</style>">c</button><template><p style="color: red">t</p></template>' })).out).toEqual([
      'a presentational style="color: red" — paint belongs in a stylesheet; only custom properties (--x: y) stay inline',
    ]);
  });

  it('builds every finding from its checked constant, so changing the constant changes that message alone', () => {
    const out = run(
      page({
        bundle: '',
        head: '<script src="../x.js"></script><link rel="stylesheet" href="../y.css"><script>go()</script>',
        body: '<style>p{}</style><p style="color: red" onblur="z">x</p><script type="module">m()</script>',
        chrome: '<aside>a</aside>',
      }).replace('.kb-lens {', '.kb-other {'),
    ).out;
    expect(out).toEqual([
      NOISE.noscriptStyle.unnamed('.kb-other { display: none; }'),
      NOISE.namedScripts.external('../x.js'),
      NOISE.mainStylesheet.unnamed('../y.css'),
      NOISE.namedScripts.inline('go()'),
      NOISE.chrome.fail('<aside>'),
      NOISE.styleElement.fail,
      NOISE.inlineModule.fail('m()'),
      NOISE.bundle.count(0),
      NOISE.noscriptStyle.missing('^\\.kb-lens \\{ display: none; \\}$'),
      NOISE.presentational.fail('color: red'),
      NOISE.handlers.fail('onblur'),
    ]);
  });

  it('names an entry that matched nothing', () => {
    const { tally } = run(page().replace('<link rel="stylesheet" href="../_astro/print.abc.css" media="print">', ''));
    expect(unusedEntries(MEASURED, tally, []).map((a) => a.id)).toEqual(['print']);
  });

  it('owes an entry with `needs` only on a site carrying the file it names', () => {
    const lists: NoiseLists = { ...MEASURED, otherStylesheets: [{ ...(MEASURED.otherStylesheets[0] as NoiseLists['otherStylesheets'][number]), needs: /^_astro\/print\.[^/]+\.css$/ }] };
    const { tally } = run(page().replace('<link rel="stylesheet" href="../_astro/print.abc.css" media="print">', ''), lists);
    expect(unusedEntries(lists, tally, ['a/b.html'])).toEqual([]);
    expect(unusedEntries(lists, tally, ['a/b.html', '_astro/print.abc.css']).map((a) => a.id)).toEqual(['print']);
  });
});

/** The not-found page as the pass leaves it: no file loaded, one inline style, the JSON-LD block. */
function notFoundPage(opts: { head?: string; style?: string } = {}): string {
  return [
    '<!doctype html><html lang="en"><head>',
    '<script type="application/ld+json">{"@context":"https://schema.org","headline":"A"}</script>',
    '<link rel="canonical" href="https://example.org/404.html">',
    opts.style ?? '<style>body { margin: 0; background: Canvas; }</style>',
    opts.head ?? '',
    '</head><body>',
    '<main><div data-page-head><h1>Page not found</h1></div><div class="kb-not-found" data-kb-region><article data-page="/404.html" data-area="a" data-tags="t"><p>Gone.</p></article></div></main>',
    '</body></html>',
  ].join('\n');
}

describe('the not-found exception', () => {
  const runNotFound = (html: string): string[] => noiseFindings(html, MEASURED, new Tally(), true);

  it('passes a page that loads nothing and carries one small style, with no bundle, stylesheet or noscript', () => {
    expect(runNotFound(notFoundPage())).toEqual([]);
  });

  it('holds every other page to the rules the exception lifts: the same page fails as an ordinary one', () => {
    expect(noiseFindings(notFoundPage(), MEASURED, new Tally())).toEqual([
      NOISE.styleElement.fail,
      NOISE.bundle.count(0),
      NOISE.mainStylesheet.count(0),
      NOISE.noscriptStyle.missing('^\\.kb-lens \\{ display: none; \\}$'),
    ]);
  });

  it('fails a script file, a bundle, a stylesheet, an icon and a source, each as a file the page loads', () => {
    const plants: [string, string][] = [
      ['<script src="/kb.js" defer></script>', NOISE.notFound.load('<script src="/kb.js">')],
      ['<script type="module" src="../x.js"></script>', NOISE.notFound.load('<script src="../x.js">')],
      ['<link rel="stylesheet" href="../_astro/style.abc.css">', NOISE.notFound.load('<link rel="stylesheet" href="../_astro/style.abc.css">')],
      ['<link rel="shortcut icon" href="/favicon.svg">', NOISE.notFound.load('<link rel="shortcut icon" href="/favicon.svg">')],
      ['<link href="x.css">', NOISE.notFound.load('<link rel="" href="x.css">')],
    ];
    for (const [head, what] of plants) expect(runNotFound(notFoundPage({ head }))).toEqual([what]);
    const img = notFoundPage().replace('<p>Gone.</p>', '<img src="a.png" alt="">');
    expect(runNotFound(img)).toEqual([NOISE.notFound.load('<img src="a.png">')]);
  });

  it('still names an unnamed inline script and refuses an inline module', () => {
    expect(runNotFound(notFoundPage({ head: '<script>go()</script>' }))).toEqual([NOISE.namedScripts.inline('go()')]);
    expect(runNotFound(notFoundPage({ head: '<script type="module">m()</script>' }))).toEqual([NOISE.inlineModule.fail('m()')]);
  });

  it('wants exactly one style element, and none that fetches a file or runs long', () => {
    expect(runNotFound(notFoundPage({ style: '' }))).toEqual([NOISE.notFound.styles(0)]);
    expect(runNotFound(notFoundPage({ head: '<style>p { margin: 0; }</style>' }))).toEqual([NOISE.notFound.styles(2)]);
    expect(runNotFound(notFoundPage({ style: '<style>body { background: url(x.png); }</style>' }))).toEqual([NOISE.notFound.fetches]);
    expect(runNotFound(notFoundPage({ style: '<style>@import "x.css";</style>' }))).toEqual([NOISE.notFound.fetches]);
    const long = `<style>${'p { margin: 0; }'.repeat(Math.ceil(NOT_FOUND_STYLE_MAX / 16) + 1)}</style>`;
    expect(runNotFound(notFoundPage({ style: long }))[0]).toMatch(/^the not-found page's style is \d+ characters — keep it under 2048$/);
  });

  it('still fails a presentational style, a handler and unmarked chrome', () => {
    const html = notFoundPage().replace('<p>Gone.</p>', '<p style="color: red" onclick="x()">x</p>').replace('<main>', '<aside>a</aside><main>');
    expect(runNotFound(html)).toEqual([
      NOISE.chrome.fail('<aside>'),
      NOISE.presentational.fail('color: red'),
      NOISE.handlers.fail('onclick'),
    ]);
  });
});

describe('the lists', () => {
  it('gives every entry of this site’s lists an id, a reason and an anchored pattern, pinning each inline one to a data type', () => {
    const ids = new Set<string>();
    for (const a of [...LISTS.inlineScripts, ...LISTS.externalScripts, ...LISTS.otherStylesheets, ...LISTS.noscriptStyles]) {
      expect(a.id).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      expect(ids.has(a.id)).toBe(false);
      ids.add(a.id);
      expect(a.reason.length).toBeGreaterThan(20);
      expect(a.match.source.startsWith('^')).toBe(true);
    }
    for (const a of [...LISTS.externalScripts, ...LISTS.otherStylesheets, ...LISTS.noscriptStyles]) expect(a.match.source.endsWith('$')).toBe(true);
    for (const a of LISTS.inlineScripts) expect(a.type).toMatch(/^application\/(?:ld\+)?json$/);
    expect(LISTS.mainStylesheet.test('_astro/style.r_TXx9EL.css')).toBe(true);
  });

  it('anchors this site’s entries: a remote path with a matching suffix, or a near name, is unnamed', () => {
    const ext = (src: string): string | undefined => known(LISTS.externalScripts, src)?.id;
    expect(ext('_astro/starlight.3fa9c1d2.js')).toBe('starlight-chrome-script');
    expect(ext('_astro/page.Dwipeu-R.js')).toBeUndefined();
    expect(ext('https://cdn.example.com/_astro/starlight.x.js')).toBeUndefined();
    expect(ext('_astro/sub/starlight.x.js')).toBeUndefined();
    expect(ext('search-index.json')).toBeUndefined();
    expect(LISTS.mainStylesheet.test('https://x/_astro/style.a.css')).toBe(false);
  });

  it('holds the noscript entry equal to the line Head.astro writes (real tree)', () => {
    const head = fs.readFileSync(path.resolve(import.meta.dirname, '../../../site/src/components/Head/Head.astro'), 'utf8');
    const line = /<noscript>\s*<style is:inline>([\s\S]*?)<\/style>\s*<\/noscript>/.exec(head)?.[1];
    expect(line === undefined ? undefined : normalizeScript(line)).toBe(NOSCRIPT_STYLE);
    expect(known(LISTS.noscriptStyles, NOSCRIPT_STYLE)?.id).toBe('no-script-controls');
    expect(known(LISTS.noscriptStyles, NOSCRIPT_STYLE.replace('.kb-favourite', '.kb-favourite-x'))).toBeUndefined();
  });

  it('reads a type the way a browser does', () => {
    expect(isModuleType(' MoDuLe ')).toBe(true);
    expect(isModuleType(undefined)).toBe(false);
    expect(isModuleType('text/javascript')).toBe(false);
  });

  it('anchors the bundle and every fixture entry', () => {
    expect(BUNDLE.test('../../kb.js')).toBe(true);
    expect(BUNDLE.test('https://x/kb.js')).toBe(false);
    expect(BUNDLE.test('kb.json')).toBe(false);
    expect(BUNDLE.test('./kb.3fa9c1d2.js')).toBe(true);
    for (const a of [...MEASURED.externalScripts, ...MEASURED.noscriptStyles]) {
      expect(a.match.source.startsWith('^') && a.match.source.endsWith('$')).toBe(true);
    }
  });

  it('matches whitespace-collapsed bodies from their start', () => {
    expect(normalizeScript('  a\n\t b  ')).toBe('a b');
    expect(known(MEASURED.inlineScripts, ' {"@context":"https://schema.org"}')).toBeUndefined();
    expect(known(MEASURED.inlineScripts, '{"@context":"https://schema.org"}')?.id).toBe('page-json-ld');
    expect(presentational(';;')).toBe(false);
    expect(presentational('--a: 1; color: red')).toBe(true);
    expect(noscriptBodies('<style media="x">\n.a {  b }\n</style>')).toEqual(['.a { b }']);
  });
});

describe('unreachableScripts', () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
  });
  afterEach(() => sb.cleanup());

  it('keeps what a page loads, from its own folder, and what that imports statically or dynamically; names the rest', () => {
    sb.write('d/a/page.html', '<script src="../kb.js?v=1"></script><script type="module" src="../_astro/entry.js"></script>');
    sb.write('d/kb.js', '/* bundle */');
    sb.write('d/_astro/entry.js', 'import "./dep.js"; const lazy = () => import("./lazy.js");');
    sb.write('d/_astro/dep.js', 'export {}');
    sb.write('d/_astro/lazy.js', 'export {}');
    sb.write('d/_astro/orphan.js', 'export {}');
    sb.write('d/stray.js', 'x');
    sb.write('d/_astro/stray.mjs', 'x');
    sb.write('d/_astro/stray.cjs', 'x');
    sb.write('d/_astro/notes.json', '{}');
    expect(unreachableScripts(path.join(sb.dir, 'd'), [path.join(sb.dir, 'd/a/page.html')])).toEqual([
      '_astro/orphan.js',
      '_astro/stray.cjs',
      '_astro/stray.mjs',
      'stray.js',
    ]);
  });

  it('ignores a script name a kept file mentions that the site does not ship', () => {
    sb.write('d/p.html', '<script src="./kb.js"></script>');
    sb.write('d/kb.js', 'load("elsewhere/vendor.js");');
    sb.write('d/_astro/orphan.js', 'x');
    expect(unreachableScripts(path.join(sb.dir, 'd'), [path.join(sb.dir, 'd/p.html')])).toEqual(['_astro/orphan.js']);
  });

  it('keeps an .mjs a page loads and the .cjs it imports', () => {
    sb.write('d/p.html', '<script type="module" src="./_astro/a.mjs"></script>');
    sb.write('d/_astro/a.mjs', 'import "./b.cjs";');
    sb.write('d/_astro/b.cjs', 'x');
    expect(unreachableScripts(path.join(sb.dir, 'd'), [path.join(sb.dir, 'd/p.html')])).toEqual([]);
  });
});
