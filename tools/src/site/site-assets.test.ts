/**
 * The assets pass (tools/src/site/site-assets.ts), over a built fixture site
 * that carries Starlight's module scripts: they become one classic script, and
 * the bundle and the payload take hashed names that every page follows.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { expectFail, expectMisuse, expectPass, makeSandbox, type Sandbox } from '../lib/sandbox.js';
import { BUNDLE_FILE, contentHash, PAYLOAD_FILE_NAME } from '../lib/asset-names.js';
import { classicTags, joinChunks, moduleTags, pointBundle, spec } from './site-assets.js';
import { builtPage, builtSite, BUILT } from './site-fixtures.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

const CHUNKS = {
  'page.a1.js': 'var e=1;o();',
  'PageFrame.astro_astro_type_script_index_0_lang.b2.js': 'var e=2;customElements.define("x-frame",class extends HTMLElement{});',
  'MobileTableOfContents.astro_astro_type_script_index_0_lang.c3.js': 'var e=3;',
  'ec.d4.js': 'try{(()=>{})();}catch(e){console.error(e)}',
};

/** The fixture site with each page's head carrying the module tags a Starlight build leaves, one per line. */
function moduleSite(): void {
  builtSite(sb);
  for (const p of BUILT) {
    const up = '../'.repeat(p.route.split('/').length - 2) || './';
    const tags = Object.keys(CHUNKS)
      .filter((n) => !n.startsWith('ec.'))
      .map((n) => `    <script type="module" src="${up}_astro/${n}"></script>`)
      .join('\n');
    // Expressive Code writes its tag inline, in the code block's own markup.
    const copy = p.route.endsWith('/alpha.html') ? `<div class="expressive-code"><script type="module" src="${up}_astro/ec.d4.js"></script></div>` : '';
    sb.write(`site/dist${p.route}`, builtPage(p).replace('</head>', `${tags}\n</head>`).replace('</article>', `${copy}</article>`));
  }
  for (const [name, body] of Object.entries(CHUNKS)) sb.write(`site/dist/_astro/${name}`, body);
}

/** A new sandbox holding the module site: a failed run leaves its partial work behind. */
function fresh(): void {
  sb.cleanup();
  sb = makeSandbox();
  moduleSite();
}

const dist = (): string[] => fs.readdirSync(path.join(sb.dir, 'site/dist'));
const hashed = (re: RegExp): string => dist().find((f) => re.test(f)) as string;

describe('site-assets', () => {
  it('joins the module chunks into one classic script, wraps each, and leaves every page one deferred tag for it', async () => {
    moduleSite();
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toMatch(/^\[site-assets\] 3 module chunk\(s\) joined into one classic script, 7 page\(s\) made classic; kb\.[0-9a-f]{8}\.js and search-index\.[0-9a-f]{8}\.js fingerprinted, 7 page\(s\) repointed$/);

    const joined = fs.readdirSync(path.join(sb.dir, 'site/dist/_astro')).filter((f) => f.startsWith('starlight.'));
    expect(joined).toHaveLength(1);
    const body = sb.read(`site/dist/_astro/${joined[0] as string}`);
    expect(body).toBe(joinChunks([CHUNKS['page.a1.js'], CHUNKS['PageFrame.astro_astro_type_script_index_0_lang.b2.js'], CHUNKS['MobileTableOfContents.astro_astro_type_script_index_0_lang.c3.js']]));
    expect(body).toContain('(function(){"use strict";\nvar e=1;o();\n})();');
    expect(joined[0]).toBe(`starlight.${contentHash(body)}.js`);
    for (const gone of Object.keys(CHUNKS).filter((n) => !n.startsWith('ec.'))) expect(sb.exists(`site/dist/_astro/${gone}`), gone).toBe(false);
    expect(sb.exists('site/dist/_astro/ec.d4.js')).toBe(true);

    const alpha = sb.read('site/dist/patterns/caching/alpha.html');
    expect(alpha).toContain(`    <script src="../../_astro/${joined[0] as string}" defer></script>\n`);
    expect(alpha).toContain('<div class="expressive-code"><script src="../../_astro/ec.d4.js" defer></script></div>');
    expect(alpha).not.toContain('type="module"');
    expect(alpha.match(/_astro\/starlight/g)).toHaveLength(1);
    const beta = sb.read('site/dist/patterns/caching/beta.html');
    expect(beta).not.toContain('ec.d4.js');
  });

  it('names the payload in the bundle by its hash, the bundle in each page by its own, and removes the plain files', async () => {
    moduleSite();
    expectPass(await sb.run(spec));
    expect(sb.exists('site/dist/kb.js')).toBe(false);
    expect(sb.exists('site/dist/search-index.js')).toBe(false);
    const payloadFile = hashed(PAYLOAD_FILE_NAME);
    const bundleFile = hashed(BUNDLE_FILE);
    expect(payloadFile).toBe(`search-index.${contentHash(sb.read(`site/dist/${payloadFile}`))}.js`);
    const bundle = sb.read(`site/dist/${bundleFile}`);
    expect(bundle).toBe(`var payload = "${payloadFile}";\n`);
    expect(bundleFile).toBe(`kb.${contentHash(bundle)}.js`);
    expect(sb.read('site/dist/patterns/caching/alpha.html')).toContain(`<script src="../../${bundleFile}" defer data-kb="bundle">`);
    expect(sb.read('site/dist/index.html')).toContain(`<script src="./${bundleFile}" defer data-kb="bundle">`);
    expect(sb.exists('site/dist/index.json')).toBe(true);
  });

  it('changes no byte on a second run, and follows a payload that changed', async () => {
    moduleSite();
    expectPass(await sb.run(spec));
    const snapshot = (): Map<string, string> => {
      const out = new Map<string, string>();
      const walk = (rel: string): void => {
        for (const e of fs.readdirSync(path.join(sb.dir, 'site/dist', rel), { withFileTypes: true })) {
          const child = rel === '' ? e.name : `${rel}/${e.name}`;
          if (e.isDirectory()) walk(child);
          else out.set(child, sb.read(`site/dist/${child}`));
        }
      };
      walk('');
      return out;
    };
    const first = snapshot();
    // The payload pass writes the plain name on every run, the same bytes again.
    sb.write('site/dist/search-index.js', sb.read(`site/dist/${hashed(PAYLOAD_FILE_NAME)}`));
    expectPass(await sb.run(spec));
    expect(snapshot()).toEqual(first);

    // New payload bytes: a new payload name, a new bundle name, every page repointed, no stale file.
    const oldBundle = hashed(BUNDLE_FILE);
    sb.write('site/dist/search-index.js', 'window.kb = {"pages":[],"terms":[]};\n');
    expectPass(await sb.run(spec));
    expect(dist().filter((f) => PAYLOAD_FILE_NAME.test(f))).toHaveLength(1);
    expect(dist().filter((f) => BUNDLE_FILE.test(f))).toHaveLength(1);
    expect(hashed(BUNDLE_FILE)).not.toBe(oldBundle);
    expect(sb.read('site/dist/index.html')).toContain(`./${hashed(BUNDLE_FILE)}`);
    expect(sb.read('site/dist/index.html')).not.toContain(oldBundle);
    expect(sb.read(`site/dist/${hashed(BUNDLE_FILE)}`)).toContain(hashed(PAYLOAD_FILE_NAME));
  });

  it('fails a module chunk that imports, one that is not built, a bundle with no payload name and a missing payload', async () => {
    fresh();
    sb.write('site/dist/_astro/page.a1.js', 'import "./dep.js";\nrun();\n');
    expectFail(await sb.run(spec), 'is a module that imports another file');
    expect(sb.exists('site/dist/kb.js')).toBe(true);

    fresh();
    sb.rm('site/dist/_astro/PageFrame.astro_astro_type_script_index_0_lang.b2.js');
    expectFail(await sb.run(spec), 'PageFrame.astro_astro_type_script_index_0_lang.b2.js, which is not built');

    fresh();
    sb.write('site/dist/kb.js', 'var none = 1;\n');
    expectFail(await sb.run(spec), 'names search-index.js 0 times');
    sb.write('site/dist/kb.js', 'var a = "search-index.js", b = "search-index.js";\n');
    expectFail(await sb.run(spec), 'names search-index.js 2 times');

    fresh();
    sb.rm('site/dist/search-index.js');
    expectFail(await sb.run(spec), 'site/dist/search-index.js: is missing');
    sb.rm('site/dist/kb.js');
    expectFail(await sb.run(spec), 'site/dist/kb.js: is missing');
  });

  it('exits 2 with no built site, with an empty one, and on an unknown flag, writing nothing', async () => {
    expectMisuse(await sb.run(spec));
    sb.mkdir('site/dist');
    const r = await sb.run(spec);
    expectMisuse(r);
    expect(r.err).toContain('no .html files under site/dist');
    moduleSite();
    expectMisuse(await sb.run(spec, ['--nope']));
    expect(sb.exists('site/dist/kb.js')).toBe(true);
  });
});

describe('the pieces', () => {
  const tag = (n: string, type = ' type="module"'): string => `    <script${type} src="../_astro/${n}"></script>\n`;
  const inline = '<div><script type="module" src="../_astro/ec.d4.js"></script></div>';

  it('reads module tags off their own lines, the copy script apart from the rest', () => {
    const html = `<head>\n${tag('page.a1.js')}${tag('x.js', '')}${tag('Page.b2.js')}</head>${inline}`;
    expect(moduleTags(html)).toEqual({ join: ['page.a1.js', 'Page.b2.js'], copy: ['../_astro/ec.d4.js'] });
  });

  it('turns the first joined tag into the one tag, drops the others and defers the copy script', () => {
    const html = `<head>\n${tag('page.a1.js')}<p>x</p>\n${tag('Page.b2.js')}</head>${inline}`;
    expect(classicTags(html, 'starlight.00000000.js')).toBe(
      '<head>\n    <script src="../_astro/starlight.00000000.js" defer></script>\n<p>x</p>\n</head><div><script src="../_astro/ec.d4.js" defer></script></div>',
    );
    expect(classicTags('<head></head>', 'starlight.00000000.js')).toBe('<head></head>');
  });

  it('points the bundle tag, plain or hashed, at a file, and leaves other scripts alone', () => {
    const html = '<script src="../../kb.js" defer data-kb="bundle"></script><script src="../x/kb.js"></script>';
    expect(pointBundle(html, 'kb.0a1b2c3d.js')).toBe('<script src="../../kb.0a1b2c3d.js" defer data-kb="bundle"></script><script src="../x/kb.js"></script>');
    expect(pointBundle('<script src="./kb.0a1b2c3d.js" defer>', 'kb.ffffffff.js')).toBe('<script src="./kb.ffffffff.js" defer>');
  });

  it('wraps each chunk in a strict function of its own, so top-level names stay apart', () => {
    expect(joinChunks(['var e=1;', 'var e=2;\n'])).toBe('(function(){"use strict";\nvar e=1;\n})();\n(function(){"use strict";\nvar e=2;\n})();\n');
  });
});
