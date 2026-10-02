/**
 * The diagram style pass (tools/src/site/site-diagram-styles.ts): a style that
 * enough diagrams share leaves their SVGs for one sheet, at the weight and in
 * the place in the cascade it had.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { expectFail, expectMisuse, expectPass, makeSandbox, type Sandbox } from '../lib/sandbox.js';
import { classFor, hoistPage, MIN_SHARED, normalise, sheetFor, spec, stylesIn, withClass } from './site-diagram-styles.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

/** One mermaid style for the diagram `id`, with `tail` appended to it. */
const css = (id: string, tail = ''): string =>
  `#${id}{font-size:16px;fill:#333;}#${id} .node rect{fill:#ECECFF;}@keyframes dash{to{stroke-dashoffset:0;}}#${id} p{margin:0;}${tail}`;

const diagram = (id: string, tail = '', attrs = 'class="flowchart"'): string =>
  `<svg id="${id}" width="100%" ${attrs} style="max-width: 10px;">\n<style>${css(id, tail)}</style><g></g></svg>`;

const page = (inner: string, main = '<link rel="stylesheet" href="../_astro/style.abc.css">'): string =>
  `<!doctype html>\n<html><head>\n  ${main}\n  <link rel="stylesheet" href="../_astro/print.abc.css" media="print">\n</head><body>${inner}</body></html>\n`;

const NORM = normalise(css('mermaid-0'), 'mermaid-0');
const CLASS = classFor(NORM);
const SHEET = `_astro/mermaid.${CLASS.slice('kb-mm-'.length)}.css`;

function site(): void {
  sb.write('site/dist/a/one.html', page(diagram('mermaid-0') + diagram('mermaid-1')));
  sb.write('site/dist/a/two.html', page(diagram('mermaid-0')));
  sb.write('site/dist/a/three.html', page('<p>No diagram.</p>'));
  sb.write('site/dist/a/odd.html', page(diagram('mermaid-2', '#mermaid-2 .ext{x:y}') + diagram('mermaid-3', '#mermaid-3 .ext{x:y}')));
}

describe('site-diagram-styles', () => {
  it('moves a style shared by enough diagrams into one sheet, links it after the main stylesheet and classes each diagram', async () => {
    site();
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[site-diagram-styles] 3 diagram style(s) in 2 page(s) replaced by 1 shared sheet(s)');

    const one = sb.read('site/dist/a/one.html');
    expect(one).toContain(`<svg id="mermaid-0" width="100%" class="flowchart ${CLASS}" style="max-width: 10px;">\n<g></g></svg>`);
    expect(one).toContain(`<svg id="mermaid-1" width="100%" class="flowchart ${CLASS}"`);
    expect(one).not.toContain('<style>');
    expect(one).toContain(`<link rel="stylesheet" href="../_astro/style.abc.css">\n  <link rel="stylesheet" href="../${SHEET}">\n  <link rel="stylesheet" href="../_astro/print.abc.css" media="print">`);
    expect(one.match(/mermaid\./g)).toHaveLength(1);
    expect(sb.read('site/dist/a/two.html')).toContain(`href="../${SHEET}"`);
    expect(sb.read('site/dist/a/three.html')).not.toContain('mermaid.');
    // Two diagrams of one other style are under the threshold: left as mermaid wrote them.
    expect(sb.read('site/dist/a/odd.html')).toContain('<style>#mermaid-2{');
    expect(MIN_SHARED).toBe(3);
  });

  it('writes the sheet with each own id scoped to the class at the id’s weight, and the rest verbatim', async () => {
    site();
    expectPass(await sb.run(spec));
    const sheet = sb.read(`site/dist/${SHEET}`);
    const scope = `:is(#_,svg.${CLASS})`;
    expect(sheet).toBe(`${scope}{font-size:16px;fill:#333;}${scope} .node rect{fill:#ECECFF;}@keyframes dash{to{stroke-dashoffset:0;}}${scope} p{margin:0;}\n`);
    expect(sheet).not.toMatch(/#mermaid-\d/);
    expect(SHEET).toBe(`_astro/mermaid.${classFor(NORM).slice(6)}.css`);
  });

  it('changes nothing on a second run', async () => {
    site();
    expectPass(await sb.run(spec));
    const files = ['one', 'two', 'three', 'odd'].map((n) => sb.read(`site/dist/a/${n}.html`));
    const sheet = sb.read(`site/dist/${SHEET}`);
    const again = await sb.run(spec);
    expectPass(again);
    expect(files).toEqual(['one', 'two', 'three', 'odd'].map((n) => sb.read(`site/dist/a/${n}.html`)));
    expect(sb.read(`site/dist/${SHEET}`)).toBe(sheet);
  });

  it('says so, and writes nothing, when no style is shared by enough diagrams', async () => {
    sb.write('site/dist/a/one.html', page(diagram('mermaid-0') + diagram('mermaid-1')));
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[site-diagram-styles] no diagram style is shared by enough diagrams; nothing changed');
    expect(fs.existsSync(path.join(sb.dir, 'site/dist/_astro'))).toBe(false);
  });

  it('fails a page with a shared style and no main stylesheet, writing nothing', async () => {
    site();
    sb.write('site/dist/a/two.html', page(diagram('mermaid-0'), '<link rel="icon" href="../f.svg">'));
    const r = await sb.run(spec);
    expectFail(r, 'site/dist/a/two.html: draws a diagram with a shared style and links no main stylesheet');
    expect(sb.exists(`site/dist/${SHEET}`)).toBe(false);
  });

  it('exits 2 with no built site, with an empty one and on an unknown flag', async () => {
    expectMisuse(await sb.run(spec));
    sb.mkdir('site/dist');
    const r = await sb.run(spec);
    expectMisuse(r);
    expect(r.err).toContain('no .html files under site/dist');
    site();
    expectMisuse(await sb.run(spec, ['--nope']));
    expect(sb.read('site/dist/a/one.html')).toContain('<style>');
  });
});

describe('the pieces', () => {
  it('sets a diagram’s own id aside, and not a longer id that begins the same', () => {
    expect(normalise('#mermaid-1 .a{}#mermaid-10 .b{}#mermaid-1{}', 'mermaid-1')).toBe('\u0000 .a{}#mermaid-10 .b{}\u0000{}');
  });

  it('reads the normalised style of each diagram on a page, and no style that is not a diagram’s', () => {
    const html = `${diagram('mermaid-0')}<svg id="icon"><style>.x{}</style></svg>${diagram('mermaid-1')}`;
    expect(stylesIn(html)).toEqual([normalise(css('mermaid-0'), 'mermaid-0'), normalise(css('mermaid-1'), 'mermaid-1')]);
    expect(stylesIn(html)[0]).toBe(stylesIn(html)[1]);
  });

  it('adds a class to an attribute list, or makes the attribute', () => {
    expect(withClass(' id="m" class="flowchart" style="a"', 'k')).toBe(' id="m" class="flowchart k" style="a"');
    expect(withClass(' id="m"', 'k')).toBe(' id="m" class="k"');
    expect(withClass(' id="m" data-class="x"', 'k')).toBe(' id="m" data-class="x" class="k"');
  });

  it('names a style by its text, so a changed style is a new class and a new sheet', () => {
    expect(classFor('a')).toMatch(/^kb-mm-[0-9a-f]{8}$/);
    expect(classFor('a')).not.toBe(classFor('b'));
    expect(sheetFor('\u0000 .a{}')).toBe(`:is(#_,svg.${classFor('\u0000 .a{}')}) .a{}\n`);
  });

  it('leaves a page with no shared diagram alone, and one with no main link refused', () => {
    const plain = page('<p>x</p>');
    expect(hoistPage(plain, new Set([NORM]))).toEqual({ html: plain, classes: [] });
    expect(hoistPage(page(diagram('mermaid-0'), ''), new Set([NORM]))).toBeNull();
    expect(hoistPage(page(diagram('mermaid-0')), new Set())?.classes).toEqual([]);
  });
});
