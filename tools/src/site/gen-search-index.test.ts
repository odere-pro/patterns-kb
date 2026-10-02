/**
 * The search payload pass (spec kb.pagedata.search, payload-pass and
 * payload-format), over the built fixture site.
 */

import vm from 'node:vm';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { expectFail, expectMisuse, expectPass, makeSandbox, type Sandbox } from '../lib/sandbox.js';
import { decodePage, type WirePage } from '../lib/search-score.js';
import { kindOf, render, rowAnchors, spec, termsFrom } from './gen-search-index.js';
import { builtSite, frontmatter, STRUCTURE, TAGS_JSON } from './site-fixtures.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

/** The payload as a fresh script context with no network sees it. */
function load(js: string): {
  pages: { route: string; kind: string; status: string; categories: string[]; aliases: string[]; solves: string[]; headings: { id: string; text: string }[] }[];
  terms: unknown[];
  tagLabels: Record<string, string>;
  synonyms: Record<string, string[]>;
} {
  const wire = loadWire(js) as { pages: WirePage[] } & Record<string, unknown>;
  return { ...wire, pages: wire.pages.map(decodePage) } as unknown as ReturnType<typeof load>;
}

/** The payload exactly as the file spells it, headings still in their wire form. */
function loadWire(js: string): Record<string, unknown> {
  const context: { window: Record<string, unknown> } = { window: {} };
  vm.runInNewContext(js, context);
  return context.window['kb'] as Record<string, unknown>;
}

const GLOSSARY = `${JSON.stringify({
  version: 1,
  updated: '2026-09-24',
  note: 'n',
  terms: [
    { id: 'breaker', term: 'Circuit breaker', definition: 'Stops the calls.', aliases: ['CB'] },
    { id: 'plain', term: 'Plain', definition: 'No aliases.' },
    { id: 'half', term: 'Half' },
  ],
})}\n`;

describe('gen-search-index', () => {
  it('marks an editors’ pick: a page whose frontmatter says favourite: true carries favourite, and no other page carries the key', async () => {
    sb.write('docs/patterns/caching/alpha.md', `${frontmatter('Alpha', { favourite: 'true' })}\n# Alpha\n`);
    builtSite(sb);
    sb.write('docs/data/glossary.json', GLOSSARY);
    expectPass(await sb.run(spec));
    const kb = load(sb.read('site/dist/search-index.js')) as unknown as { pages: { route: string; favourite?: boolean }[] };
    expect(kb.pages.filter((p) => p.favourite === true).map((p) => p.route)).toEqual(['/patterns/caching/alpha.html']);
    expect(kb.pages.filter((p) => 'favourite' in p)).toHaveLength(1);
  });

  it('writes one classic script setting window.kb: every page but the hubs, its kind, headings then row anchors, and no prose', async () => {
    builtSite(sb);
    sb.write('docs/data/glossary.json', GLOSSARY);
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toMatch(new RegExp(`^\\[gen-search-index\\] 4 pages, 2 terms, \\d+ bytes$`));
    const kb = load(sb.read('site/dist/search-index.js'));
    expect(kb.pages.map((p) => p.route)).toEqual(['/index.html', '/patterns/caching/alpha.html', '/patterns/caching/beta.html', '/hazards/gamma.html']);
    const alpha = kb.pages[1] as (typeof kb.pages)[number];
    expect(alpha.headings).toEqual([
      { id: 'description', text: 'What it is' },
      { id: 'mapping-row-1', text: 'Row' },
    ]);
    expect(Object.keys(alpha).sort()).toEqual(['aliases', 'area', 'categories', 'description', 'headings', 'kind', 'route', 'solves', 'status', 'tags', 'title']);
    // The area chain's labels, outermost first, then the kind in a reader's words.
    expect(kb.pages.map((p) => p.categories)).toEqual([['Patterns', 'pattern'], ['Patterns', 'Caching', 'pattern'], ['Patterns', 'Caching', 'pattern'], ['Hazards', 'hazard']]);
    expect(kb.pages.map((p) => p.kind)).toEqual(['patterns', 'patterns', 'patterns', 'hazards']);
    // The two lists the ranking reads, from the manifest; empty where it has none.
    expect([alpha.aliases, alpha.solves]).toEqual([['First'], ['my answers, kept far away']]);
    expect([kb.pages[2]?.aliases, kb.pages[2]?.solves]).toEqual([[], []]);
    expect(kb.terms).toEqual([
      { id: 'breaker', term: 'Circuit breaker', definition: 'Stops the calls.', aliases: ['CB'] },
      { id: 'plain', term: 'Plain', definition: 'No aliases.', aliases: [] },
    ]);
  });

  it('carries the tag labels and the merged synonym table the ranking reads, empty when their files are absent', async () => {
    builtSite(sb);
    sb.write('docs/data/tags.json', TAGS_JSON);
    sb.write('docs/data/search-synonyms.json', JSON.stringify({ curated: { ai: ['agent'], fuse: ['breaker'] }, expansions: { ai: ['model'], hang: ['wait'] } }));
    expectPass(await sb.run(spec));
    const kb = load(sb.read('site/dist/search-index.js'));
    expect(kb.tagLabels).toEqual({ caching: 'Caching topic' });
    expect(kb.synonyms).toEqual({ hang: ['wait'], ai: ['agent'], fuse: ['breaker'] });
    sb.rm('docs/data/search-synonyms.json');
    sb.rm('docs/data/tags.json');
    expectPass(await sb.run(spec));
    const bare = load(sb.read('site/dist/search-index.js'));
    expect([bare.tagLabels, bare.synonyms]).toEqual([{}, {}]);
  });

  it('carries each page’s declared status from the manifest unchanged', async () => {
    builtSite(sb);
    const manifest = JSON.parse(sb.read('site/dist/index.json')) as { pages: { route: string; status?: string }[] };
    (manifest.pages.find((p) => p.route === '/patterns/caching/beta.html') as { status?: string }).status = 'draft';
    (manifest.pages.find((p) => p.route === '/hazards/gamma.html') as { status?: string }).status = 'deprecated';
    sb.write('site/dist/index.json', JSON.stringify(manifest));
    expectPass(await sb.run(spec));
    const kb = load(sb.read('site/dist/search-index.js'));
    expect(kb.pages.map((p) => [p.route, p.status])).toEqual([
      ['/index.html', 'stable'],
      ['/patterns/caching/alpha.html', 'stable'],
      ['/patterns/caching/beta.html', 'draft'],
      ['/hazards/gamma.html', 'deprecated'],
    ]);
  });

  it('fails a manifest entry with no status, naming its route, and writes no payload — never a silent stable', async () => {
    builtSite(sb);
    sb.rm('site/dist/search-index.js');
    const manifest = JSON.parse(sb.read('site/dist/index.json')) as { pages: { route: string; status?: string }[] };
    delete (manifest.pages.find((p) => p.route === '/patterns/caching/beta.html') as { status?: string }).status;
    (manifest.pages.find((p) => p.route === '/hazards/gamma.html') as { status?: string }).status = '';
    sb.write('site/dist/index.json', JSON.stringify(manifest));
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err.trim().split('\n')).toEqual([
      "[gen-search-index] FAIL site/dist/index.json: /patterns/caching/beta.html has no status — the manifest copies it from the page's kb:status meta; rebuild the site: make site-build",
      "[gen-search-index] FAIL site/dist/index.json: /hazards/gamma.html has no status — the manifest copies it from the page's kb:status meta; rebuild the site: make site-build",
    ]);
    expect(sb.exists('site/dist/search-index.js')).toBe(false);
  });

  it('prerequisites-C9: a page whose record has an edge carries its requires and related neighbours’ routes, in the file’s order; a page with none carries neither', async () => {
    builtSite(sb);
    const rec = (id: string, route: string, requires: string[], related: string[]) => ({ id, label: id, definition: `What ${id} is`, route, requires, related });
    sb.write(
      'docs/data/prerequisites.json',
      `${JSON.stringify({
        version: 1,
        records: [
          rec('alpha', '/patterns/caching/alpha.html', ['gamma', 'beta'], []),
          rec('beta', '/patterns/caching/beta.html', [], ['alpha']),
          rec('gamma', '/hazards/gamma.html', [], []),
        ],
      })}\n`,
    );
    expectPass(await sb.run(spec));
    const pages = load(sb.read('site/dist/search-index.js')).pages as unknown as { route: string; requires?: string[]; related?: string[] }[];
    const edges = (route: string) => {
      const p = pages.find((x) => x.route === route);
      return { requires: p?.requires, related: p?.related };
    };
    expect(edges('/patterns/caching/alpha.html')).toEqual({ requires: ['/hazards/gamma.html', '/patterns/caching/beta.html'], related: [] });
    expect(edges('/patterns/caching/beta.html')).toEqual({ requires: [], related: ['/patterns/caching/alpha.html'] });
    expect(edges('/hazards/gamma.html')).toEqual({ requires: undefined, related: undefined });
    expect(edges('/index.html')).toEqual({ requires: undefined, related: undefined });
  });

  it('keeps the H2 and H3 headings and drops the deeper ones', async () => {
    builtSite(sb);
    const manifest = JSON.parse(sb.read('site/dist/index.json')) as { pages: { route: string; headings: { depth: number; id: string; text: string }[] }[] };
    (manifest.pages.find((p) => p.route === '/patterns/caching/alpha.html') as { headings: unknown[] }).headings.push(
      { depth: 3, id: 'description', text: 'Kept' },
      { depth: 4, id: 'description', text: 'Dropped' },
    );
    sb.write('site/dist/index.json', JSON.stringify(manifest));
    expectPass(await sb.run(spec));
    const alpha = load(sb.read('site/dist/search-index.js')).pages.find((p) => p.route === '/patterns/caching/alpha.html');
    expect(alpha?.headings.map((h) => h.text)).toEqual(['What it is', 'Kept', 'Row']);
  });

  it('fails a page filed under an area the structure file does not hold, writing nothing', async () => {
    builtSite(sb);
    sb.rm('site/dist/search-index.js');
    const manifest = JSON.parse(sb.read('site/dist/index.json')) as { pages: { route: string; area: string }[] };
    (manifest.pages.find((p) => p.route === '/hazards/gamma.html') as { area: string }).area = 'nowhere';
    sb.write('site/dist/index.json', JSON.stringify(manifest));
    expectFail(await sb.run(spec), "site/dist/index.json: /hazards/gamma.html is filed under area 'nowhere', which docs/data/site-structure.json does not hold");
    expect(sb.exists('site/dist/search-index.js')).toBe(false);
  });

  it('reads the built site --dist names, and says nothing with --quiet', async () => {
    builtSite(sb, 'out');
    const r = await sb.run(spec, ['--dist', 'out', '--quiet']);
    expectPass(r);
    expect(r.out).toBe('');
    expect(sb.exists('out/search-index.js')).toBe(true);
  });

  it('fails a missing glossary, writing nothing', async () => {
    builtSite(sb);
    sb.rm('site/dist/search-index.js');
    sb.rm('docs/data/glossary.json');
    const r = await sb.run(spec, ['--quiet']);
    expectFail(r, 'docs/data/glossary.json: is missing — the search box defines its terms from it');
    expect(sb.exists('site/dist/search-index.js')).toBe(false);
  });

  it('fills the terms from the glossary the fixture site carries', async () => {
    builtSite(sb);
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toMatch(/^\[gen-search-index\] 4 pages, 1 terms, /);
    expect(load(sb.read('site/dist/search-index.js')).terms).toEqual([
      { id: 'breaker', term: 'Circuit breaker', definition: 'Stops the calls to a failing dependency.', aliases: [] },
    ]);
  });

  it('fails a glossary that is not JSON, writing nothing', async () => {
    builtSite(sb);
    sb.rm('site/dist/search-index.js');
    sb.write('docs/data/glossary.json', '{nope');
    expectFail(await sb.run(spec), 'docs/data/glossary.json: is not valid JSON');
    expect(sb.exists('site/dist/search-index.js')).toBe(false);
  });

  it('fails an empty manifest, and a route with no page', async () => {
    builtSite(sb);
    sb.write('site/dist/index.json', '{"pages":[]}');
    expectFail(await sb.run(spec), 'site/dist/index.json: lists no pages');
    sb.write('site/dist/index.json', '{}');
    expectFail(await sb.run(spec), 'site/dist/index.json: lists no pages');
    sb.write('site/dist/index.json', JSON.stringify({ pages: [{ route: '/gone.html', title: '', description: '', area: '', tags: [], headings: [] }] }));
    expectFail(await sb.run(spec), 'site/dist/index.json: lists /gone.html, and no such page was built');
  });

  it('exits 2 naming the build command when there is no manifest, and on an unknown flag', async () => {
    builtSite(sb);
    sb.rm('site/dist/index.json');
    const r = await sb.run(spec);
    expectMisuse(r);
    expect(r.err).toContain('make site-build');
    expect((await sb.run(spec, ['--dist', '.'])).err).toContain('./index.json is missing');
    expectMisuse(await sb.run(spec, ['--nope']));
  });

  it('writes each heading in the compact wire form: a pair with an id, the bare text without, and none dropped', async () => {
    builtSite(sb);
    const manifest = JSON.parse(sb.read('site/dist/index.json')) as { pages: { route: string; headings: unknown[] }[] };
    (manifest.pages.find((p) => p.route === '/patterns/caching/alpha.html') as { headings: unknown[] }).headings.push({ depth: 2, id: '', text: 'No id' });
    sb.write('site/dist/index.json', JSON.stringify(manifest));
    expectPass(await sb.run(spec));
    const wire = loadWire(sb.read('site/dist/search-index.js')) as { pages: WirePage[] };
    const alpha = wire.pages.find((p) => p.route === '/patterns/caching/alpha.html') as WirePage;
    expect(alpha.headings).toEqual([['description', 'What it is'], 'No id', ['mapping-row-1', 'Row']]);
  });

  it('writes no size note: the build’s budget gate (check-site-budget) owns the number', async () => {
    builtSite(sb);
    const manifest = JSON.parse(sb.read('site/dist/index.json')) as { pages: { route: string; description: string }[] };
    (manifest.pages.find((p) => p.route === '/patterns/caching/beta.html') as { description: string }).description = 'word '.repeat(300_000);
    sb.write('site/dist/index.json', JSON.stringify(manifest));
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.err).toBe('');
    expect(load(sb.read('site/dist/search-index.js')).pages).toHaveLength(4);
  });
});

describe('the pieces', () => {
  const region = (inner: string): string => `<div class="sl-markdown-content" data-kb-region>${inner}</div>`;

  it('reads a row anchor only from a row with an id and a row header holding text', () => {
    const rows =
      '<table><tr id="r1"><th scope="row">One</th></tr><tr id="r2"><td>No header</td></tr>' +
      '<tr><th scope="row">No id</th></tr><tr id="r3"><th scope="row"> </th></tr></table>';
    expect(rowAnchors(region(rows))).toEqual([{ id: 'r1', text: 'One' }]);
    expect(rowAnchors(rows)).toEqual([]);
  });

  it('names a page’s kind by the top area its area nests under, and null for an area the file does not hold', () => {
    expect(kindOf(STRUCTURE, 'caching')).toBe('patterns');
    expect(kindOf(STRUCTURE, 'hazards')).toBe('hazards');
    expect(kindOf(STRUCTURE, 'nowhere')).toBeNull();
  });

  it('keeps only complete glossary terms', () => {
    expect(termsFrom('{}')).toEqual([]);
  });

  it('escapes the two characters that end a script line inside JSON', () => {
    const js = render([{ route: '/a.html', title: 'a b c', description: '', area: '', status: 'stable', tags: [], categories: [], aliases: [], solves: [], headings: [], kind: 'patterns' }], []);
    expect(js).toContain('a\\u2028b\\u2029c');
    expect(js.split('\n')).toHaveLength(2);
  });
});
