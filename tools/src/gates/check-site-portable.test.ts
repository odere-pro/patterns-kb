/**
 * The portability gate over a built site (spec kb.site.offline), and the
 * post-build passes over a home page and a page one folder down. offline-O1
 * itself runs a real build: tools/src/site/site-sandbox.test.ts.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { expectFail, expectMisuse, expectPass, makeSandbox, type Sandbox } from '../lib/sandbox.js';
import { spec as payloadPass } from '../site/gen-search-index.js';
import { BUILT, builtPage, builtSite, GLOSSARY_JSON } from '../site/site-fixtures.js';
import { spec as portablePass } from '../site/site-portable.js';
import { lineIndex, parsePayload, readTags, spec } from './check-site-portable.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

describe('the post-build passes over Astro-shaped pages', () => {
  it('make a home page and a page one folder down link each other relatively, open from disk, and the gate exits 0', async () => {
    sb.write('docs/data/glossary.json', GLOSSARY_JSON);
    sb.write(
      'docs/data/site-structure.json',
      JSON.stringify({
        areas: [
          {
            id: 'patterns',
            label: 'Patterns',
            hub: { description: 'd', intro: 'i', tags: [] },
            pages: [{ slug: 'alpha', label: 'Alpha', source: 'docs/patterns/alpha.md', route: '/patterns/alpha.html' }],
          },
        ],
      }),
    );
    // What Astro hands the post-build passes: root-absolute links, no article block.
    const raw = (title: string, body: string): string =>
      [
        '<!doctype html><html><head>',
        `<meta name="kb:area" content="patterns"><meta name="kb:owner" content="Oleksandr Derechei">`,
        `<script type="application/ld+json" data-kb="page">{"headline":"${title}"}</script>`,
        '<script src="/search-index.js" defer data-kb="search-index"></script><script src="/kb.js" defer data-kb="bundle"></script>',
        '</head><body><a class="sl-skip-link" href="#_top">Skip to content</a>',
        `<div data-page-head><h1 id="_top">${title}</h1></div>`,
        `<div class="sl-markdown-content" data-kb-region>${body}</div>`,
        '</body></html>',
        '',
      ].join('\n');
    sb.write('docs/patterns/alpha.md', '---\ntitle: Alpha\n---\n\n# Alpha\n');
    sb.write('site/dist/index.html', raw('Home', '<p>Go to <a href="/patterns/alpha.html">Alpha</a>.</p>'));
    sb.write('site/dist/patterns/alpha.html', raw('Alpha', '<p>Back <a href="/">home</a>.</p>'));
    sb.write('site/dist/kb.js', '"use strict";\n');

    expectPass(await sb.run(portablePass));
    expectPass(await sb.run(payloadPass));

    const home = sb.read('site/dist/index.html');
    const alpha = sb.read('site/dist/patterns/alpha.html');
    expect(home).toContain('<a href="./patterns/alpha.html">Alpha</a>');
    expect(alpha).toContain('<a href="../index.html">home</a>');
    // Every internal link and source resolves to a real file on disk, the way
    // a browser reading the folder resolves it.
    for (const [file, html] of [
      ['site/dist/index.html', home],
      ['site/dist/patterns/alpha.html', alpha],
    ] as const) {
      for (const m of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
        const target = path.resolve(path.dirname(path.join(sb.dir, file)), m[1] as string);
        expect(fs.existsSync(target), `${file} → ${m[1] as string}`).toBe(true);
      }
    }
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out.split('\n')).toHaveLength(1);
  });
});

describe('check-site-portable', () => {
  it('passes a clean built site with one summary line', async () => {
    builtSite(sb);
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe(`[site-portable] ${BUILT.length} pages portable, indexed, anchored and keyboard-reachable; index.json and search-index.js present; 3 markdown sources match docs/`);
  });

  it('names a page-tree page whose markdown is missing or differs from its source, and a markdown file no page owns', async () => {
    builtSite(sb);
    sb.rm('site/dist/patterns/caching/alpha.md');
    sb.write('site/dist/hazards/gamma.md', 'edited');
    sb.write('site/dist/stray.md', 'x');
    sb.write('site/dist/patterns/caching.md', 'hub');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('site/dist/patterns/caching/alpha.md: is missing');
    expect(r.err).toContain('site/dist/hazards/gamma.md: differs from docs/hazards/gamma.md');
    expect(r.err).toContain('site/dist/stray.md: is a markdown file no page-tree page owns');
    expect(r.err).toContain('site/dist/patterns/caching.md: is a markdown file no page-tree page owns');
    expect(r.err.split('\n')).toHaveLength(4);
  });

  it('names a built page-tree page whose source file is gone', async () => {
    builtSite(sb);
    sb.rm('docs/hazards/gamma.md');
    expectFail(await sb.run(spec), 'site/dist/hazards/gamma.html: its source docs/hazards/gamma.md is not in the repository');
  });

  it('names a root-absolute reference and a positive tabindex at their lines', async () => {
    builtSite(sb);
    const file = 'site/dist/patterns/caching/beta.html';
    sb.write(file, sb.read(file).replace('<p>Beta.</p>', '<p>Beta.</p>\n<a href="/x.html" tabindex="3">x</a>'));
    const r = await sb.run(spec);
    expectFail(r);
    const line = sb.read(file).split('\n').findIndex((l) => l.includes('href="/x.html"')) + 1;
    expect(r.err).toContain(`[site-portable] FAIL ${file}:${line}: root-absolute reference href="/x.html"`);
    expect(r.err).toContain(`[site-portable] FAIL ${file}:${line}: positive tabindex tabindex="3"`);
  });

  it('names a diagram click link left root-absolute', async () => {
    builtSite(sb);
    const file = 'site/dist/patterns/caching/beta.html';
    sb.write(file, sb.read(file).replace('<p>Beta.</p>', '<p>Beta.</p>\n<svg id="mermaid-0"><a xlink:href="/hazards/gamma.html"><text>G</text></a></svg>'));
    const r = await sb.run(spec);
    expectFail(r);
    const line = sb.read(file).split('\n').findIndex((l) => l.includes('xlink:href')) + 1;
    expect(r.err).toBe(
      `[site-portable] FAIL ${file}:${line}: root-absolute reference xlink:href="/hazards/gamma.html" — the post-build pass makes links relative; run make site-build`,
    );
  });

  it('names a root-absolute reference in any quoting, at its line, and never one inside an attribute value', async () => {
    builtSite(sb);
    const file = 'site/dist/patterns/caching/beta.html';
    sb.write(
      file,
      sb
        .read(file)
        .replace(
          '<p>Beta.</p>',
          `<p>Beta.</p>\n<a href='/patterns.html'>p</a>\n<img src=/favicon.svg alt=x>\n<button data-code='<a href="/in-code.html">'>c</button>`,
        ),
    );
    const r = await sb.run(spec);
    expectFail(r);
    const lines = sb.read(file).split('\n');
    const at = (needle: string): number => lines.findIndex((l) => l.includes(needle)) + 1;
    expect(r.err.split('\n')).toEqual([
      `[site-portable] FAIL ${file}:${at("href='/patterns.html'")}: root-absolute reference href="/patterns.html" — the post-build pass makes links relative; run make site-build`,
      `[site-portable] FAIL ${file}:${at('src=/favicon.svg')}: root-absolute reference src="/favicon.svg" — the post-build pass makes links relative; run make site-build`,
    ]);
  });

  it('names every finding from the repository root, however --dist is written', async () => {
    builtSite(sb);
    const file = 'site/dist/patterns/caching/beta.html';
    sb.write(file, sb.read(file).replace('<p>Beta.</p>', '<p>Beta.</p>\n<a href="x.html" tabindex="3">x</a>'));
    const line = sb.read(file).split('\n').findIndex((l) => l.includes('tabindex="3"')) + 1;
    const want = `[site-portable] FAIL ${file}:${line}: positive tabindex tabindex="3" reorders the keyboard walk`;
    for (const dist of [path.join(sb.dir, 'site/dist'), './site/dist/', 'site/dist']) {
      const r = await sb.run(spec, ['--dist', dist]);
      expectFail(r);
      expect(r.err, dist).toBe(want);
    }
  });

  it('names an injected module, a page with no area, and a page with no skip link', async () => {
    builtSite(sb);
    const file = 'site/dist/hazards/gamma.html';
    sb.write(
      file,
      sb
        .read(file)
        .replace('<meta name="kb:area" content="hazards">', '')
        .replace('<a class="sl-skip-link" href="#_top" data-kb-skip>Skip to content</a>', '')
        .replace('defer data-kb="bundle"', 'type="module" data-kb="bundle"'),
    );
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain(`${file}: a <script type="module"> carrying data-kb`);
    expect(r.err).toContain(`${file}: no <meta name="kb:area"`);
    expect(r.err).toContain(`${file}: no skip link`);
  });

  it('reads the area by the attributes a meta element has, in any order or quoting', async () => {
    builtSite(sb);
    const file = 'site/dist/hazards/gamma.html';
    sb.write(file, sb.read(file).replace('<meta name="kb:area" content="hazards">', '<meta content=hazards name="kb:area">'));
    expectPass(await sb.run(spec));
    sb.write(file, sb.read(file).replace('<meta content=hazards name="kb:area">', '<meta name="kb:area" content>'));
    expectFail(await sb.run(spec), `${file}: no <meta name="kb:area"`);
  });

  it('names a missing or empty manifest and payload, and checks no coverage then', async () => {
    builtSite(sb);
    sb.rm('site/dist/index.json');
    sb.write('site/dist/search-index.js', '');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('site/dist/index.json: is missing or empty');
    expect(r.err).toContain('site/dist/search-index.js: is missing or empty');
    expect(r.err.split('\n')).toHaveLength(2);
  });

  it('refuses a payload that is not one window.kb assignment', async () => {
    builtSite(sb);
    sb.write('site/dist/search-index.js', 'window.kb = 1; alert(1);\n');
    expectFail(await sb.run(spec), 'is not one `window.kb = {…};` assignment');
  });

  it('names a page search cannot find, an indexed route with no page, and an anchor with no element', async () => {
    builtSite(sb);
    sb.write(
      'site/dist/search-index.js',
      `window.kb = ${JSON.stringify({
        pages: [
          { route: '/index.html', headings: [] },
          { route: '/patterns/caching/alpha.html', headings: [{ id: 'description', text: 'x' }, { id: 'gone', text: 'y' }, { id: '', text: 'z' }] },
          { route: '/hazards/gamma.html', headings: [] },
          { route: '/nowhere.html', headings: [] },
        ],
        terms: [],
      })};\n`,
    );
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('site/dist/patterns/caching/beta.html: is a built page search cannot find');
    expect(r.err).toContain('site/dist/search-index.js: indexes /nowhere.html, and no such page was built');
    expect(r.err).toContain('site/dist/search-index.js: offers /patterns/caching/alpha.html#gone');
    expect(r.err.split('\n')).toHaveLength(3);
  });

  it('holds a payload anchor to a real id: a diagram edge’s data-id, or an id a code sample shows, is none', async () => {
    builtSite(sb);
    const file = 'site/dist/patterns/caching/alpha.html';
    sb.write(file, sb.read(file).replace('</article>', '<svg><path data-id="L_Caller_Gate_0"></path></svg><pre><code id="in-code"></code></pre></article>'));
    const payload = parsePayload(sb.read('site/dist/search-index.js').trim()) as { pages: { route: string; headings: { id: string; text: string }[] }[] };
    const page = payload.pages.find((p) => p.route === '/patterns/caching/alpha.html') as (typeof payload.pages)[number];
    page.headings.push({ id: 'L_Caller_Gate_0', text: 'edge' }, { id: 'in-code', text: 'code' });
    sb.write('site/dist/search-index.js', `window.kb = ${JSON.stringify({ ...payload, terms: [] })};\n`);
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err.split('\n')).toEqual([
      '[site-portable] FAIL site/dist/search-index.js: offers /patterns/caching/alpha.html#L_Caller_Gate_0, and that page has no element with that id',
      '[site-portable] FAIL site/dist/search-index.js: offers /patterns/caching/alpha.html#in-code, and that page has no element with that id',
    ]);
  });

  it('asks for a build when there is no built site, an empty one, or --dist is empty', async () => {
    builtSite(sb, 'elsewhere');
    expectFail(await sb.run(spec), 'no built site at site/dist — build it first: make site-build');
    expectFail(await sb.run(spec, ['--dist', '']), "no built site at ''");
    sb.mkdir('empty');
    expectFail(await sb.run(spec, ['--dist', 'empty']), 'no .html files under empty');
    expectPass(await sb.run(spec, ['--dist', 'elsewhere']));
  });

  it('exits 2 on an unknown flag, writing nothing', async () => {
    builtSite(sb);
    const before = sb.snapshot();
    expectMisuse(await sb.run(spec, ['--nope']));
    expect(sb.snapshot()).toEqual(before);
  });
});

describe('the tag reader', () => {
  it('reads a root-absolute reference, never a protocol-relative one', () => {
    expect(readTags('<a href="/x">\n<img src="/">\n<a href="//cdn/x">').rootAbsolute.map((h) => h.line)).toEqual([1, 2]);
  });

  it('reads only a positive tabindex', () => {
    expect(readTags('<a tabindex="0"><a tabindex="-1"><a tabindex=10>').positiveTabindex).toEqual([{ line: 1, what: 'tabindex="10"' }]);
  });

  it('finds our module script and the skip link by their attributes, in any order or quoting', () => {
    const r = readTags("<script type='module' data-kb='bundle'></script><a href='#_top' class='x sl-skip-link'>");
    expect([r.injectedModule, r.skipLink]).toEqual([true, true]);
    const none = readTags('<script type="module"></script><a class="sl-skip-link" href="/">');
    expect([none.injectedModule, none.skipLink]).toEqual([false, false]);
  });

  it('numbers lines from offsets', () => {
    const at = lineIndex('a\nbc\n\nd');
    expect([at(0), at(1), at(2), at(4), at(5), at(6)]).toEqual([1, 1, 2, 2, 3, 4]);
  });

  it('parses the payload only when it is the one assignment, with a pages list', () => {
    expect(parsePayload('window.kb = {"pages":[],"terms":[]};\n')).toEqual({ pages: [] });
    expect(parsePayload('window.kb = {"terms":[]};')).toBeNull();
    expect(parsePayload('window.kb = {nope};')).toBeNull();
    expect(parsePayload('var x = 1;')).toBeNull();
  });

  it('builds a fixture page with the facts the gates read', () => {
    expect(builtPage({ route: '/a/b.html', title: 'B', area: 'x', body: '' })).toContain('<script src="../kb.js"');
  });
});
