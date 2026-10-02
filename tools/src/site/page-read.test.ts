/**
 * The page-audit reader (spec kb.noise.page-audit), and page-audit-O1.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { expectFail, expectMisuse, expectPass, makeSandbox, type Sandbox } from '../lib/sandbox.js';
import { readPage, report, spec } from './page-read.js';
import { builtPage } from './site-fixtures.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

describe('page-audit-O1', () => {
  it('page-audit-O1: two findings — the prose element’s fact and the data block’s foreign attribute; the blocks are the article and that element, never the header', async () => {
    const html = builtPage({
      route: '/patterns/caching/alpha.html',
      title: 'Alpha',
      area: 'caching',
      body: '<p class="note" data-topic="x">Prose.</p><div data-topic="y" role="note">Block.</div>',
    }).replace('<header class="header" data-kb-skip>', '<header class="header" data-kb-skip><span class="badge" data-topic="z">h</span>');
    sb.write('site/dist/patterns/caching/alpha.html', html);

    const r = await sb.run(spec, ['site/dist/patterns/caching/alpha.html']);
    expectPass(r);
    const lines = r.out.split('\n');
    const at = (label: string): number => lines.findIndex((l) => l.startsWith(label));
    expect(lines[at('findings:')]).toBe('findings: 2');
    expect(lines.slice(at('findings:') + 1, at('ratio:'))).toEqual([
      '  fact data-topic on the classed element <p class="note">',
      '  data block <div> carries role',
    ]);
    expect(lines[at('data blocks:')]).toBe('data blocks: 3');
    const blocks = lines.slice(at('data blocks:') + 1, at('findings:'));
    expect(blocks[0]).toBe('  <div> data-page-head=""');
    expect(blocks[1]).toMatch(/^ {2}<article> data-page="\/patterns\/caching\/alpha\.html" data-area=/);
    expect(blocks[2]).toBe('  <div> data-topic="y" role="note"');
    expect(r.out).not.toContain('badge');
    expect(r.out).not.toContain('<header');
  });
});

describe('readPage', () => {
  it('drops skip-marked subtrees whole, reads through classed elements, and ignores graphics, scripts and code', () => {
    const r = readPage(
      '<!doctype html><html><body class="b"><nav data-kb-skip><p class="x" data-topic="t">n</p></nav>' +
        '<svg data-topic="s"><g class="g" data-id="1"></g></svg><script>document.body.dataset.topic = 1;</script>' +
        '<pre class="c"><code><span class="k" data-topic="q">x</span></code></pre>' +
        '<span class="copy" data-code="x" data-kb-copy>c</span></body></html>',
    );
    expect(r.dropped).toBe(1);
    expect(r.decoration).toBe(3);
    expect(r.blocks).toEqual([]);
    expect(r.findings).toEqual([]);
    expect(r.knowledge).toBeNull();
  });

  it('measures the bytes from the knowledge region’s opening tag to the end', () => {
    const html = '<html><body><header>h</header><div class="c" data-kb-region><p>é</p></div></body></html>';
    const r = readPage(html);
    expect(r.total).toBe(Buffer.byteLength(html));
    expect(r.knowledge).toBe(Buffer.byteLength(html.slice(html.indexOf('<div class="c"'))));
  });
});

describe('report', () => {
  it('prints the counts, each block, each finding and the ratio, or says the region is missing', () => {
    expect(report('a.html', { dropped: 1, decoration: 2, blocks: ['<b> data-x="1"'], findings: ['f'], total: 200, knowledge: 50 })).toBe(
      [
        '[page-read] a.html',
        'dropped: 1 skip-marked subtree(s)',
        'decoration: 2 classed element(s) read through',
        'data blocks: 1',
        '  <b> data-x="1"',
        'findings: 1',
        '  f',
        'ratio: 50 of 200 bytes from the knowledge region on (25%)',
      ].join('\n'),
    );
    expect(report('a.html', { dropped: 0, decoration: 0, blocks: [], findings: [], total: 9, knowledge: null })).toContain(
      'ratio: 9 bytes in all; no knowledge region (no element carries data-kb-region)',
    );
  });
});

describe('the program', () => {
  it('asks for a build when the page is not there, and is misused with no page or two', async () => {
    expectFail(await sb.run(spec, ['site/dist/nope.html']), 'no built page at site/dist/nope.html — build the site first: make site-build');
    expectMisuse(await sb.run(spec));
    expectMisuse(await sb.run(spec, ['a.html', 'b.html']));
    expectMisuse(await sb.run(spec, ['--nope']));
  });
});
