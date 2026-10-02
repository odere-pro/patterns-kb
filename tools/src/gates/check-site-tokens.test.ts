/**
 * The token gate (spec kb.site.components, token-gate): a colour literal in a
 * component stylesheet is one finding naming its file and line; the same value
 * in the token stylesheet is the decision it should be; comments, keywords and
 * hex-like text that is no colour are not findings.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { expectFail, expectMisuse, expectPass, makeSandbox, type Sandbox } from '../lib/sandbox.js';
import { literals, PROGRAM, spec, TOKENS, valuesOnly, withoutComments } from './check-site-tokens.js';

describe('literals', () => {
  it('finds every hex length CSS accepts, with its line', () => {
    const css = ['a { color: #abc; }', 'b { color: #aabbcc; }', 'c { color: #aabbccdd; }', 'd { color: #abcd; }'].join('\n');
    expect(literals(css)).toEqual([
      { line: 1, text: '#abc' },
      { line: 2, text: '#aabbcc' },
      { line: 3, text: '#aabbccdd' },
      { line: 4, text: '#abcd' },
    ]);
  });

  it('finds the colour functions by name, one wrapping a custom property included', () => {
    expect(literals('a { background: rgb(0 0 0 / 45%); }')).toEqual([{ line: 1, text: 'rgb(…)' }]);
    expect(literals('a { color: hsla(var(--h) 50% 50% / 1); border-color: rgba (1,2,3,1); }')).toEqual([
      { line: 1, text: 'hsla(…)' },
      { line: 1, text: 'rgba(…)' },
    ]);
  });

  it('claims nothing about currentColor, transparent, a named colour or a var()', () => {
    expect(literals('a { color: currentColor; background: transparent; outline-color: red; border-color: var(--x); }')).toEqual([]);
  });

  it('ignores hex-like text that is no colour: an id selector, a fragment, a longer run', () => {
    expect(literals('#sidebar { color: var(--x); }')).toEqual([]);
    expect(literals('a { background: url("i.svg#glyph"); }')).toEqual([]);
    expect(literals('#abcde { color: var(--x); } #1234567 {}')).toEqual([]);
  });

  it('reads a colour only in a declaration value: never an id selector, an attribute value, a url() fragment or a string that looks like one', () => {
    const css = [
      '#ace .kb-plant-n4 { color: var(--sl-color-white); }',
      '.kb-plant-n5 { mask: url(#fade); }',
      'a[href="#cafe"].kb-plant-n6 { color: var(--x); }',
      '#fade .kb-lens { outline: none; }',
      '.kb-lens { mask: url(#abcdef); }',
      ".kb-q { content: '#bad'; }",
      '@media (min-width: 50rem) { #abc > .x { color: var(--x); } }',
      '.kb-real { border: 1px solid #abc; }',
    ].join('\n');
    expect(literals(css)).toEqual([{ line: 8, text: '#abc' }]);
    expect(valuesOnly(css).split('\n')).toHaveLength(8);
  });

  it('finds a colour function whatever its case, and keeps an at-statement readable', () => {
    expect(literals('.kb-lens-d { color: HSL(10, 20%, 30%); background: Rgb(1 2 3); }')).toEqual([
      { line: 1, text: 'HSL(…)' },
      { line: 1, text: 'Rgb(…)' },
    ]);
    expect(literals('@import url("x.css");\n.a{color:#fff}')).toEqual([{ line: 2, text: '#fff' }]);
    expect(literals('.a { color: var(--x) }\n.b { }')).toEqual([]);
  });

  it('ignores a literal quoted in a comment, and keeps line numbers across one', () => {
    expect(literals('/* never write #ff0000 */\na { color: var(--x); }')).toEqual([]);
    expect(literals(['/* one', ' * two #fff', ' */', 'a { color: #fff; }'].join('\n'))).toEqual([{ line: 4, text: '#fff' }]);
    expect(withoutComments('a{}/* x\ny */b{}').split('\n')).toHaveLength(2);
  });
});

describe('a colour moved into the token stylesheet', () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
    sb.write(TOKENS, ':root {\n  --kb-radius: 0.5rem;\n}\n');
    sb.write('site/src/components/Card/card.css', '.kb-card {\n  /* the border was #336699 once */\n  color: var(--sl-color-text);\n}\n');
  });
  afterEach(() => sb.cleanup());

  it('a raw colour in a component stylesheet is one finding naming its file and line; moved into the token stylesheet under a name, none', async () => {
    expectPass(await sb.run(spec));

    sb.write('site/src/components/Card/card.css', '.kb-card {\n  /* the border was #336699 once */\n  color: var(--sl-color-text);\n  border-color: #336699;\n}\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err.split('\n')).toEqual([
      `[site-tokens] FAIL site/src/components/Card/card.css:4: \`#336699\` is a colour literal — use Starlight's --sl-color-* or a --kb-* token, or put the value in ${TOKENS} under a name; a typed colour reads right in one theme and wrong in the other`,
    ]);

    sb.write(TOKENS, ':root {\n  --kb-radius: 0.5rem;\n  --kb-card-border: #336699;\n}\n');
    sb.write('site/src/components/Card/card.css', '.kb-card {\n  /* the border was #336699 once */\n  color: var(--sl-color-text);\n  border-color: var(--kb-card-border);\n}\n');
    const clean = await sb.run(spec);
    expectPass(clean);
    expect(clean.out).toBe('[site-tokens] 1 stylesheets under site/src take every colour from a token; literals live in site/src/styles/tokens.css only');
  });
});

describe('the token gate', () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
  });
  afterEach(() => sb.cleanup());

  it('narrows to the stylesheets it is handed, the token stylesheet skipped either way', async () => {
    sb.write(TOKENS, ':root { --x: #123456; }');
    sb.write('site/src/components/A/a.css', '.a { color: #111; }');
    sb.write('site/src/components/B/b.css', '.b { color: #222; }');
    sb.write('README.md', '# readme\n');
    const only = await sb.run(spec, ['site/src/components/B/b.css', TOKENS, 'README.md']);
    expectFail(only);
    expect(only.err).toContain('#222');
    expect(only.err).not.toContain('#111');
    expect(only.err).not.toContain('#123456');
  });

  it('never widens a narrowed scan: a name it does not govern is dropped, and names only that reads nothing', async () => {
    sb.write(TOKENS, ':root {}');
    sb.write('site/src/components/A/a.css', '.a { color: #111; }');
    sb.write('README.md', '# readme\n');
    const r = await sb.run(spec, ['README.md']);
    expectPass(r);
    expect(r.out).toContain('[site-tokens] 0 stylesheets under site/src');
  });

  it('reads the whole tree when its own program is named: the rule changed', async () => {
    sb.write(TOKENS, ':root {}');
    sb.write('site/src/components/A/a.css', '.a { color: #111; }');
    sb.write(PROGRAM, '// the gate\n');
    expectFail(await sb.run(spec, [PROGRAM]), 'site/src/components/A/a.css:1: `#111`');
  });

  it('is misused by a named file that does not exist, or a stylesheet outside site/src', async () => {
    sb.write(TOKENS, ':root {}');
    sb.write('site/assets/pattern.css', '.p { color: #e0a800; }');
    const before = sb.snapshot();
    expectMisuse(await sb.run(spec, ['site/src/nope.css']));
    expectMisuse(await sb.run(spec, ['site/assets/pattern.css']));
    expect(sb.snapshot()).toEqual(before);
  });

  it('names a tree with no site stylesheets folder, and is misused by an unknown flag', async () => {
    expectFail(await sb.run(spec), 'site/src does not exist');
    sb.write(TOKENS, ':root {}');
    expectMisuse(await sb.run(spec, ['--nope']));
  });

  it('passes the real tree', async () => {
    sb.copyRepo('site/src/styles', 'site/src/components');
    expectPass(await sb.run(spec));
  });
});
