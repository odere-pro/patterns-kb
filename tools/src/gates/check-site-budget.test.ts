/**
 * The size budget gate (tools/src/gates/check-site-budget.ts) over the built
 * fixture site: a pass, one failure for each kind of budget, and misuse.
 */

import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { expectFail, expectMisuse, expectPass, makeSandbox, type Sandbox } from '../lib/sandbox.js';
import { builtPage, builtSite, BUILT } from '../site/site-fixtures.js';
import { BUDGETS, biggestField, biggestPart, loadsOf, spec } from './check-site-budget.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
  builtSite(sb);
});
afterEach(() => sb.cleanup());

/** `bytes` of text no compressor shrinks much: base64 of random bytes. */
const dense = (bytes: number): string => randomBytes(Math.ceil((bytes * 3) / 4)).toString('base64').slice(0, bytes);
/** `bytes` of text a compressor reduces to almost nothing. */
const flat = (bytes: number): string => 'a'.repeat(bytes);

/** Text that gzips to at least `bytes`: base64 holds six bits in eight. */
const denseGz = (bytes: number): string => dense(Math.ceil(bytes * 1.4));

const ALPHA = 'site/dist/patterns/caching/alpha.html';
const HUB = 'site/dist/patterns.html';
const DESIGN = 'site/dist/designs/big.html';

/** A fixture page with `filler` inside its article. */
const withBody = (route: string, filler: string): string => {
  const page = BUILT.find((p) => p.route === route) ?? { route, title: 'Big', area: 'patterns', body: '' };
  return builtPage({ ...page, body: `${page.body}<p>${filler}</p>` });
};

/** The findings of a failing run, one string each. */
const found = (r: { err: string }): string[] => r.err.trim().split('\n');

describe('check-site-budget', () => {
  it('passes the fixture site, naming how many pages it read', async () => {
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[site-budget] 7 pages, the bundle, the search payload and the manifest are inside their budgets');
  });

  it('fails a page over the raw budget, naming the file, its size, the budget and the biggest part', async () => {
    sb.write(DESIGN, withBody('/designs/big.html', `<svg>${flat(BUDGETS.pageHtml.raw)}</svg>`));
    const r = await sb.run(spec);
    expectFail(r);
    expect(found(r)).toHaveLength(1);
    expect(found(r)[0]).toMatch(
      /^\[site-budget\] FAIL site\/dist\/designs\/big\.html: is [\d,]+ bytes, over the page budget of 1,100,000; biggest part: inline diagrams and icons, [\d,]+ bytes in 1 svg element\(s\)/,
    );
  });

  it('fails a page over the gzipped budget even when its raw size is inside', async () => {
    sb.write(DESIGN, withBody('/designs/big.html', denseGz(BUDGETS.pageHtml.gzip)));
    const r = await sb.run(spec);
    expectFail(r);
    expect(found(r)).toHaveLength(1);
    expect(found(r)[0]).toMatch(/designs\/big\.html: is [\d,]+ bytes gzipped, over the page budget of 180,000; biggest part: the page text itself$/);
  });

  it('holds a page that is not a case study to its tighter raw budget, and a case study to the page budget alone', async () => {
    sb.write(ALPHA, withBody('/patterns/caching/alpha.html', flat(BUDGETS.contentPageRaw + 1_000)));
    sb.write(DESIGN, withBody('/designs/big.html', flat(BUDGETS.contentPageRaw + 1_000)));
    const r = await sb.run(spec);
    expectFail(r);
    expect(found(r)).toHaveLength(1);
    expect(found(r)[0]).toContain('patterns/caching/alpha.html: is ');
    expect(found(r)[0]).toContain(`over the budget of ${BUDGETS.contentPageRaw.toLocaleString('en-US')} for a page that is not a case study`);
  });

  it('holds a hub to the hub budget', async () => {
    sb.write(HUB, withBody('/patterns.html', flat(BUDGETS.hubRaw + 1_000)));
    const r = await sb.run(spec);
    expectFail(r);
    expect(found(r)).toHaveLength(1);
    expect(found(r)[0]).toContain(`patterns.html: is `);
    expect(found(r)[0]).toContain(`over the hub budget of ${BUDGETS.hubRaw.toLocaleString('en-US')}`);
  });

  it('fails the bundle, the payload and the manifest over their raw or gzipped budgets, each naming its biggest part', async () => {
    sb.write('site/dist/kb.js', flat(BUDGETS.bundle.raw + 1));
    expect(found(await sb.run(spec))[0]).toMatch(/site\/dist\/kb\.js: is [\d,]+ bytes, over its budget of [\d,]+; biggest part: one bundled script/);
    sb.write('site/dist/kb.js', denseGz(BUDGETS.bundle.gzip));
    expect(found(await sb.run(spec))[0]).toMatch(/site\/dist\/kb\.js: is [\d,]+ bytes gzipped, over its budget of [\d,]+/);
    sb.write('site/dist/kb.js', 'var payload = "search-index.js";\n');

    const payload = (filler: string): string => `window.kb = ${JSON.stringify({ pages: [{ route: '/a.html', headings: [filler], title: 'T' }], terms: [] })};\n`;
    sb.write('site/dist/search-index.js', payload(flat(BUDGETS.payload.raw)));
    const rawFail = found(await sb.run(spec));
    expect(rawFail).toHaveLength(1);
    expect(rawFail[0]).toMatch(/site\/dist\/search-index\.js: is [\d,]+ bytes, over its budget of [\d,]+; biggest part: the "headings" field, [\d,]+ bytes over 1 page\(s\)$/);
    sb.write('site/dist/search-index.js', payload(denseGz(BUDGETS.payload.gzip)));
    expect(found(await sb.run(spec))[0]).toMatch(/search-index\.js: is [\d,]+ bytes gzipped, over its budget of [\d,]+/);
    sb.write('site/dist/search-index.js', 'window.kb = {"pages":[],"terms":[]};\n');

    sb.write('site/dist/index.json', JSON.stringify({ pages: [{ route: '/a.html', description: flat(BUDGETS.manifest.raw) }] }));
    expect(found(await sb.run(spec))[0]).toMatch(/site\/dist\/index\.json: is [\d,]+ bytes, over its budget of [\d,]+; biggest part: the "description" field/);
    sb.write('site/dist/index.json', JSON.stringify({ pages: [{ route: '/a.html', description: denseGz(BUDGETS.manifest.gzip) }] }));
    expect(found(await sb.run(spec))[0]).toMatch(/site\/dist\/index\.json: is [\d,]+ bytes gzipped, over its budget of [\d,]+/);
  });

  it('reads the hashed bundle and payload, and fails one that is missing', async () => {
    sb.rm('site/dist/kb.js');
    sb.write('site/dist/kb.3fa9c1d2.js', 'var a = 1;\n');
    expectPass(await sb.run(spec));
    sb.rm('site/dist/kb.3fa9c1d2.js');
    sb.rm('site/dist/search-index.js');
    sb.rm('site/dist/index.json');
    const r = await sb.run(spec);
    expectFail(r);
    expect(found(r)).toEqual([
      '[site-budget] FAIL site/dist/kb.js: is missing — the build writes it (make site-build)',
      '[site-budget] FAIL site/dist/search-index.js: is missing — the build writes it (make site-build)',
      '[site-budget] FAIL site/dist/index.json: is missing — the build writes it (make site-build)',
    ]);
  });

  it('fails the blocking stylesheets over their total, naming the biggest', async () => {
    sb.write('site/dist/_astro/style.fixture.css', flat(BUDGETS.cssPerPage + 1));
    const r = await sb.run(spec);
    expectFail(r);
    expect(found(r)).toHaveLength(7);
    expect(found(r).find((l) => l.includes('patterns/caching/alpha.html'))).toMatch(/loads [\d,]+ bytes of blocking stylesheets, over the budget of 125,000; biggest: (?:\.\.\/)*_astro\/style\.fixture\.css$/);
  });

  it('counts the stylesheets of a print medium out of the blocking total', async () => {
    sb.write('site/dist/_astro/print.f1.css', flat(BUDGETS.cssPerPage + 1));
    sb.write(ALPHA, builtPage(BUILT.find((p) => p.route === '/patterns/caching/alpha.html') as (typeof BUILT)[number]).replace('</head>', '<link rel="stylesheet" href="../../_astro/print.f1.css" media="PRINT">\n</head>'));
    expectPass(await sb.run(spec));
  });

  it('fails a page whose HTML, blocking stylesheets and synchronous scripts need too many gzipped bytes before the first render, but not a case study', async () => {
    sb.write(ALPHA, withBody('/patterns/caching/alpha.html', denseGz(BUDGETS.firstRenderGzip)));
    sb.write(DESIGN, withBody('/designs/big.html', denseGz(BUDGETS.firstRenderGzip)));
    const r = await sb.run(spec);
    expectFail(r);
    expect(found(r)).toHaveLength(1);
    expect(found(r)[0]).toMatch(/patterns\/caching\/alpha\.html: needs [\d,]+ bytes gzipped before its first render, over the budget of 85,000; biggest: its HTML, [\d,]+$/);
  });

  it('counts a synchronous script toward the first render and a deferred one out of it', async () => {
    sb.write('site/dist/_astro/sync.js', denseGz(BUDGETS.firstRenderGzip));
    const html = builtPage(BUILT.find((p) => p.route === '/patterns/caching/beta.html') as (typeof BUILT)[number]);
    sb.write('site/dist/patterns/caching/beta.html', html.replace('</head>', '<script src="../../_astro/sync.js"></script>\n</head>'));
    const r = await sb.run(spec);
    expectFail(r);
    expect(found(r)[0]).toMatch(/caching\/beta\.html: needs [\d,]+ bytes gzipped before its first render.*biggest: \.\.\/\.\.\/_astro\/sync\.js, [\d,]+$/);
    sb.write('site/dist/patterns/caching/beta.html', html.replace('</head>', '<script src="../../_astro/sync.js" defer></script>\n</head>'));
    expectPass(await sb.run(spec));
  });

  it('fails a page that asks for more files than the budget', async () => {
    const many = Array.from({ length: BUDGETS.requests }, (_, i) => `<script src="../../_astro/x${String(i)}.js" defer></script>`).join('\n');
    const html = builtPage(BUILT.find((p) => p.route === '/patterns/caching/beta.html') as (typeof BUILT)[number]);
    sb.write('site/dist/patterns/caching/beta.html', html.replace('</head>', `${many}\n</head>`));
    const r = await sb.run(spec);
    expectFail(r);
    expect(found(r)).toHaveLength(1);
    expect(found(r)[0]).toMatch(/caching\/beta\.html: asks for 16 files \(itself, 1 stylesheet\(s\), 14 script\(s\), 0 icon\), over the budget of 13$/);
  });

  it('exits 2 with no built site, with an empty one and on an unknown flag', async () => {
    sb.rm('site');
    const none = await sb.run(spec);
    expectMisuse(none);
    expect(none.err).toContain('no built site at site/dist — build it first: make site-build');
    sb.mkdir('site/dist');
    const empty = await sb.run(spec);
    expectMisuse(empty);
    expect(empty.err).toContain('no .html files under site/dist');
    expectMisuse(await sb.run(spec, ['--nope']));
  });
});

describe('the pieces', () => {
  it('names the biggest part of a page, or says it is text', () => {
    expect(biggestPart('<svg><style>p{}</style></svg>')).toMatch(/^inline diagrams and icons, 29 bytes in 1 svg element\(s\), 18 of them in 1 style block\(s\)$/);
    expect(biggestPart(`<nav>${'x'.repeat(50)}</nav>`)).toBe('navigation, 61 bytes in 1 nav element(s)');
    expect(biggestPart(`<table>${'x'.repeat(50)}</table>`)).toBe('tables, 65 bytes in 1 table(s)');
    expect(biggestPart(`<script>${'x'.repeat(50)}</script>`)).toBe('inline scripts, 67 bytes in 1 element(s)');
    expect(biggestPart('<p>text</p>')).toBe('the page text itself');
  });

  it('names the biggest field over a list of pages', () => {
    expect(biggestField([{ a: 'x', b: 'yyyy' }, { a: 'xx', b: 'y' }])).toBe('the "b" field, 9 bytes over 2 page(s)');
    expect(biggestField([])).toBe('nothing');
  });

  it('sorts what a page loads: blocking and print stylesheets, synchronous and other scripts, the icon, and nothing remote', () => {
    const html = [
      '<link rel="stylesheet" href="a.css">',
      '<link rel="stylesheet" href="b.css" media="print">',
      '<link rel="shortcut icon" href="f.svg">',
      '<link rel="canonical" href="p.html">',
      '<link rel="stylesheet" href="https://cdn.example.com/c.css">',
      '<script src="s.js?v=1"></script>',
      '<script src="d.js" defer></script>',
      '<script src="m.js" type="module"></script>',
      '<script src="//cdn.example.com/x.js"></script>',
      '<script>inline()</script>',
    ].join('\n');
    expect(loadsOf(html)).toEqual({ blockingCss: ['a.css'], printCss: ['b.css'], syncScripts: ['s.js'], otherScripts: ['d.js', 'm.js'], icons: ['f.svg'] });
  });
});
