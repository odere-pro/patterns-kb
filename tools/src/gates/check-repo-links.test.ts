/**
 * Every link in the repository's markdown leads somewhere (spec:
 * kb.gates.link-integrity, repo-gate): targets exist, fragments are in their
 * file's anchor set, a path-only label names its target, and fences and code
 * spans hold no links.
 */

import fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { capture, expectFail, expectMisuse, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from '../lib/sandbox.js';
import { anchorSet, headingsOf, headingSlugs, headingText, labelPath, labelTargets, slugOf, spec, withoutEmphasis } from './check-repo-links.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => {
  vi.restoreAllMocks();
  sb.cleanup();
});

/** The real tree is 480-odd files: on a loaded machine one run outlasts the suite's default. */
const REAL_TREE_TIMEOUT = 180_000;

/** The findings a run printed, one per line. */
const findings = (err: string): string[] => err.split('\n').filter((l) => l.startsWith('[repo-links] FAIL'));

/** The rules page the scenarios cite: one table row per rule, each with its anchor. */
const RULES = [
  '# Rules',
  '',
  'The numbered rules.',
  '',
  '| Rule | What it says |',
  '| --- | --- |',
  '| <a id="PAGE-001"></a>PAGE-001 | Open with an intro. |',
  '| <a id="PAGE-002"></a>PAGE-002 | Headings stop at H3. |',
  '| <a id="PAGE-003"></a>PAGE-003 | One next step. |',
  '',
].join('\n');

describe('link-integrity-O1 (the repository half)', () => {
  it('a dead heading anchor, a missing page, a fenced link and a live rule anchor: exactly two findings, each on its line', async () => {
    sb.write('docs/reference/page-rules.md', RULES);
    sb.write('docs/guide.md', '# Guide\n\n## Setup\n\nHow to set up.\n');
    sb.write(
      'docs/a.md',
      [
        '# A',
        '',
        'Read [the setup](guide.md#set-up) first.',
        '',
        'Then [the missing page](gone.md).',
        '',
        '```markdown',
        'A sample: [not a link](nowhere.md).',
        '```',
        '',
        'Every page keeps [PAGE-003](reference/page-rules.md#PAGE-003).',
        '',
      ].join('\n'),
    );
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.out).toBe('');
    expect(findings(r.err)).toEqual([
      '[repo-links] FAIL docs/a.md:3: links docs/guide.md#set-up, and docs/guide.md has no heading or id "set-up"',
      '[repo-links] FAIL docs/a.md:5: links docs/gone.md, which does not exist',
    ]);
    expect(r.err.split('\n').filter((l) => l !== '')).toHaveLength(2);
    // The repository gate never reads a built site: it is not there, and nothing asks for it.
    expect(sb.exists('site/dist')).toBe(false);
  });
});

describe('content-O3', () => {
  it('the rules page with one anchor per row passes; a copy that lost one fails on the line citing it', async () => {
    sb.write('docs/reference/page-rules.md', RULES);
    sb.write(
      'docs/reference/triage.md',
      ['# Triage', '', 'Each finding cites its rule.', '', '- [PAGE-001](page-rules.md#PAGE-001)', '- [PAGE-002](page-rules.md#PAGE-002)', '- [PAGE-003](page-rules.md#PAGE-003)', ''].join('\n'),
    );
    const clean = await sb.run(spec);
    expectPass(clean);
    expect(clean.out).toBe('[repo-links] OK — 3 link(s) in 2 markdown file(s) lead somewhere');

    sb.write('docs/reference/page-rules.md', RULES.replace('<a id="PAGE-002"></a>', ''));
    const lost = await sb.run(spec);
    expectFail(lost);
    expect(findings(lost.err)).toEqual([
      '[repo-links] FAIL docs/reference/triage.md:6: links docs/reference/page-rules.md#PAGE-002, and docs/reference/page-rules.md has no heading or id "PAGE-002"',
    ]);
  });

  it('holds the real numbered-rule page: every rule id it defines is an anchor a finding can cite', async () => {
    const text = fs.readFileSync(`${REPO_ROOT}/docs/reference/page-rules.md`, 'utf8');
    const ids = [...text.matchAll(/^\| <a id="([A-Z]+-[0-9]+)"><\/a>\1 \|/gm)].map((m) => m[1] as string);
    expect(ids.length).toBeGreaterThan(8);
    const offered = anchorSet('docs/reference/page-rules.md', text);
    for (const id of ids) expect(offered.has(id), id).toBe(true);
  });
});

describe('the behaviours', () => {
  it('a heading anchor holds until the heading is reworded', async () => {
    sb.write('a.md', '# A\n\n[x](b.md#setup)\n');
    sb.write('b.md', '# B\n\n## Setup\n');
    expectPass(await sb.run(spec));
    sb.write('b.md', '# B\n\n## Getting set up\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual(['[repo-links] FAIL a.md:3: links b.md#setup, and b.md has no heading or id "setup"']);
  });

  it('a rule anchor holds until it is deleted', async () => {
    sb.write('a.md', '# A\n\n[r](rules.md#PAGE-003)\n');
    sb.write('rules.md', '# Rules\n\n<a id="PAGE-003"></a>PAGE-003 says so.\n');
    expectPass(await sb.run(spec));
    sb.write('rules.md', '# Rules\n\nPAGE-003 says so.\n');
    expectFail(await sb.run(spec), 'a.md:3: links rules.md#PAGE-003');
  });
});

describe('resolving a target', () => {
  it('skips what is somebody else’s and a site route; a word-colon target is a dead link of ours', async () => {
    sb.write(
      'a.md',
      [
        '# A',
        '',
        '[w](https://example.com/x.md) [h](http://example.com) [m](mailto:a@b.c) [t](tel:+1) [d](data:text/plain,x)',
        '[j](javascript:void(0)) [p](//cdn.example.com/x.js) [v](vscode://file/x.md) [r](/patterns/x.html)',
        '[docs](docs:page.md)',
        '',
      ].join('\n'),
    );
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual(['[repo-links] FAIL a.md:5: links docs:page.md, which does not exist']);
  });

  it('a target climbing out of the repository is a finding on its line', async () => {
    sb.write('docs/a.md', '# A\n\nSee [it](../../outside.md).\n');
    expectFail(await sb.run(spec), '[repo-links] FAIL docs/a.md:3: links ../../outside.md, which climbs out of the repository to ../outside.md');
  });

  it('a directory counts as present; a query is dropped; a fragment into another file type is not checked', async () => {
    sb.write('a.md', '# A\n\n[d](docs/) [e](docs) [q](b.md?plain=1) [j](data.json#nope) [h](docs#nope) [enc](my%20page.md)\n');
    sb.write('docs/b.md', '# B\n');
    sb.write('b.md', '# B\n');
    sb.write('data.json', '{}\n');
    sb.write('my page.md', '# Mine\n');
    expectPass(await sb.run(spec));
  });

  it('a bare fragment is read against the linking file’s own anchors; an empty one checks nothing', async () => {
    sb.write('a.md', '# A\n\n## Usage\n\n[u](#usage) [none](#) [bad](#setup) [enc](#us%61ge) [broken](#%E0%A4%A)\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([
      '[repo-links] FAIL a.md:5: links #setup, and this file has no heading or id "setup"',
      '[repo-links] FAIL a.md:5: links #%E0%A4%A, and this file has no heading or id "%E0%A4%A"',
    ]);
  });

  it('counts lines past blank and fenced lines, several links to a line', async () => {
    sb.write('a.md', ['---', 'title: A', 'links: "[x](fm.md)"', '---', '', '# A', '', '```', '[f](f.md)', '```', '', '[one](one.md) [two](two.md)', '', '[three](three.md)', ''].join('\n'));
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      '[repo-links] FAIL a.md:12: links one.md, which does not exist',
      '[repo-links] FAIL a.md:12: links two.md, which does not exist',
      '[repo-links] FAIL a.md:14: links three.md, which does not exist',
    ]);
  });

  it('reads no link in a fence, a code span or an HTML comment', async () => {
    sb.write(
      'a.md',
      ['# A', '', '~~~~', '[t](tilde.md)', '~~~~', '', 'Code: `[c](code.md)` and ``[d](double.md) ` inside``.', '', '<!-- [h](hidden.md) -->', '<!--', '[m](multi.md)', '-->', ''].join('\n'),
    );
    expectPass(await sb.run(spec));
  });

  it('reads no link in an indented code block, and reads one indented under a list item', async () => {
    sb.write('a.md', ['# A', '', 'A sample:', '', '    [indented](nowhere.md)', '', '- An item', '', '    [under the item](gone.md)', ''].join('\n'));
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual(['[repo-links] FAIL a.md:9: links gone.md, which does not exist']);
  });

  it('a target is there only with the case it is written in, as the CI runner reads it', async () => {
    sb.write('docs/context-layering.md', '# Layers\n');
    sb.write('docs/a.md', '# A\n\nSee [ctx](Context-Layering.md) and [dir](../Docs/) and [ok](context-layering.md).\n');
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      '[repo-links] FAIL docs/a.md:3: links docs/Context-Layering.md, which does not exist',
      '[repo-links] FAIL docs/a.md:3: links Docs/, which does not exist',
    ]);
  });
});

describe('labels', () => {
  beforeEach(() => {
    sb.write('docs/reference/triage.md', '# Triage\n\n## Page shape\n');
    sb.write('scripts/kb.mjs', '// kb\n');
    sb.write('docs/data/gates.json', '{}\n');
  });

  it('a path-only label names its target from the folder, the root or the page tree', async () => {
    sb.write(
      'docs/reference/a.md',
      [
        '# A',
        '',
        '[`docs/reference/triage.md`](triage.md), [scripts/kb.mjs](../../scripts/kb.mjs), [data/gates.json](../data/gates.json)',
        '[`../data/gates.json`](../data/gates.json), [docs/reference/triage.md#page-shape](triage.md#page-shape)',
        '[triage.md](triage.md) [docs/](../) [the scripts/kb.mjs launcher](../../scripts/kb.mjs) ![docs/nope.png](../data/gates.json)',
        '[https://x.org/a.md](../data/gates.json) [`kb`](../../scripts/kb.mjs)',
        '',
      ].join('\n'),
    );
    expectPass(await sb.run(spec));
  });

  it('a path-only label naming another file is a finding naming both', async () => {
    sb.write('docs/reference/a.md', '# A\n\nSee [`docs/data/gates.json`](triage.md).\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual(['[repo-links] FAIL docs/reference/a.md:3: the label names docs/data/gates.json, and the link goes to docs/reference/triage.md']);
  });

  it('a missing target is one finding, never a label finding as well', async () => {
    sb.write('docs/reference/a.md', '# A\n\nSee [`docs/reference/gone.md`](gone.md).\n');
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual(['[repo-links] FAIL docs/reference/a.md:3: links docs/reference/gone.md, which does not exist']);
  });
});

describe('the scan set and misuse', () => {
  it('reads what git lists, committed or not, and never an ignored, built or installed file', async () => {
    sb.write('.gitignore', 'tmp/\n');
    sb.write('tmp/a.md', '[x](gone.md)\n');
    sb.write('node_modules/pkg/README.md', '[x](gone.md)\n');
    sb.write('site/dist/a.md', '[x](gone.md)\n');
    sb.write('site/.astro/a.md', '[x](gone.md)\n');
    sb.write('tools/node_modules/p/README.md', '[x](gone.md)\n');
    sb.git('add', '-f', 'node_modules', 'site', 'tools');
    sb.write('new.mdx', '# New\n\n[x](gone.md)\n');
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual(['[repo-links] FAIL new.mdx:3: links gone.md, which does not exist']);
  });

  it('a committed file deleted from disk is not read', async () => {
    sb.write('a.md', '# A\n\n[x](gone.md)\n');
    sb.commit('a page');
    sb.rm('a.md');
    sb.write('b.md', '# B\n');
    expectPass(await sb.run(spec));
    expectMisuse(await sb.run(spec, ['a.md']));
  });

  it('named files narrow what is read; every target still resolves against the whole tree', async () => {
    sb.write('a.md', '# A\n\n[b](b.md#b)\n');
    sb.write('b.md', '# B\n\n[x](gone.md)\n');
    const r = await sb.run(spec, ['./a.md', 'a.md']);
    expectPass(r);
    expect(r.out).toBe('[repo-links] OK — 1 link(s) in 1 markdown file(s) lead somewhere');
    expectFail(await sb.run(spec, ['b.md']), 'b.md:3');
  });

  it('exits 2 on an unknown flag, and on a name that is no markdown file git lists', async () => {
    sb.write('a.md', '# A\n');
    sb.write('a.txt', 'text\n');
    const before = sb.snapshot();
    for (const argv of [['--nope'], ['--fix'], ['a.txt'], ['missing.md']]) {
      const r = await sb.run(spec, argv);
      expectMisuse(r);
      expect(r.out, argv.join(' ')).toBe('');
    }
    expect(sb.snapshot()).toEqual(before);
  });

  it('reads each file, and builds its anchor set, once per run', async () => {
    sb.write('a.md', '# A\n\n[1](b.md#b) [2](b.md#b) [3](#a)\n');
    sb.write('b.md', '# B\n\n[1](a.md#a) [2](a.md#a)\n');
    const spy = vi.spyOn(fs, 'readFileSync');
    expectPass(await capture(spec, [], sb.dir));
    const reads = spy.mock.calls.map((c) => String(c[0])).filter((p) => p.endsWith('.md'));
    expect(reads.sort()).toEqual([`${sb.dir}/a.md`, `${sb.dir}/b.md`]);
  });
});

describe('anchor sets', () => {
  it('slugs every ATX heading outside a fence, a repeat gaining -1 and -2', () => {
    const text = ['---', 'title: x', '---', '# Title', '## Setup', '## Setup', '### Setup', '```', '## Fenced', '```', '#nohash', '####### seven', '## Setup-1'].join('\n');
    expect([...anchorSet('x.md', text)]).toEqual(['title', 'setup', 'setup-1', 'setup-2', 'setup-1-1']);
  });

  it('slugs a setext heading in its place in the order, and never a rule or an underlined list item', () => {
    const text = ['# Title', '', 'Setext one', '---', '', 'Two lines', 'of heading', '===', '', '---', '', '- an item', '---', '', '| a |', '| --- |', '', '## Setext one', '', '    Indented', '    ---'].join('\n');
    expect([...anchorSet('x.md', text)]).toEqual(['title', 'setext-one', 'two-lines-of-heading', 'setext-one-1']);
  });

  it('reads the headings of a body in order, ATX and setext, a quote or a rule breaking a paragraph', () => {
    expect(headingsOf(['> quoted', '---', 'Para', '***', 'After', '===', '<div>', '==='].join('\n'))).toEqual(['After']);
  });

  it('links a heading with emphasis by its text alone, the way a reader and GitHub see it', async () => {
    sb.write('a.md', ['# A', '', '## Using _this_ page', '', '## The __init__ hook and snake_case', '', 'See [e](#using-this-page) and [i](#the-init-hook-and-snake_case).', ''].join('\n'));
    expectPass(await sb.run(spec));
  });

  it('adds every id and name attribute outside fences and code spans, never a data- attribute', () => {
    const text = ['# T', '', '<a id="PAGE-003"></a> <a name=\'old-name\'></a> <span id = "x"></span> <b data-name="d" data-kb-id="k"></b>', '', 'Not `<a id="in-code">`.', '', '```html', '<a id="in-fence"></a>', '```'].join('\n');
    expect([...anchorSet('x.md', text)].sort()).toEqual(['PAGE-003', 'old-name', 't', 'x']);
  });

  it('adds the dialect’s ids on a page under the page tree, and only there', () => {
    const page = ['---', 'title: P', '---', '', '# P', '', 'Intro.', '', '## Trade-offs', '<!--meta block=tradeoffs-->', '', '### Cons', '<!--meta polarity=con-->', '', '- Stale.', '- Slow. {#slow-one}', ''].join('\n');
    const inTree = anchorSet('docs/patterns/p.md', page);
    for (const id of ['p', 'trade-offs', 'cons', 'tradeoffs', 'tradeoffs-con-1', 'slow-one']) expect(inTree.has(id), id).toBe(true);
    const outside = anchorSet('notes/p.md', page);
    expect(outside.has('tradeoffs')).toBe(false);
    expect(outside.has('trade-offs')).toBe(true);
  });

  it('reads a heading as a reader sees it', () => {
    expect(headingText('## Round-trip proof (RT-1)')).toBe('Round-trip proof (RT-1)');
    expect(headingText('   ### Closed ###  ')).toBe('Closed');
    expect(headingText('## C# #')).toBe('C#');
    expect(headingText('## Only #hash')).toBe('Only #hash');
    expect(headingText('## Cons {#cons}')).toBe('Cons');
    expect(headingText('## See [`docs-style`](triage.md) and ![logo](l.png)')).toBe('See `docs-style` and logo');
    expect(headingText('## <span>Tags</span> &amp; more \\*stars\\*')).toBe('Tags & more *stars*');
    expect(headingText('#')).toBe('');
    expect(headingText('    ## indented code')).toBeNull();
    expect(headingText('#hashtag')).toBeNull();
  });

  it('drops emphasis marks and keeps an underscore inside a word or a code span', () => {
    expect(withoutEmphasis('Using _this_ page')).toBe('Using this page');
    expect(withoutEmphasis('**Bold** and *it* and ***both***')).toBe('Bold and it and both');
    expect(withoutEmphasis('__init__ and _**nested**_')).toBe('init and nested');
    expect(withoutEmphasis('snake_case_name and a_b_c')).toBe('snake_case_name and a_b_c');
    expect(withoutEmphasis('the `_x_` flag and _y_')).toBe('the `_x_` flag and y');
    expect(withoutEmphasis('a lone _ and \\_escaped_ and _ spaced _')).toBe('a lone _ and \\_escaped_ and _ spaced _');
    expect(headingText('## Using _this_ page')).toBe('Using this page');
  });

  it('slugs a heading lower-cased, punctuation dropped, each space a hyphen', () => {
    expect(slugOf('Round-trip proof (RT-1)')).toBe('round-trip-proof-rt-1');
    expect(slugOf('`docs-style` — the gate')).toBe('docs-style--the-gate');
    expect(slugOf('Émile’s snake_case 2')).toBe('émiles-snake_case-2');
    expect(headingSlugs(['A', 'A', 'A-1', 'A'])).toEqual(['a', 'a-1', 'a-1-1', 'a-2']);
  });
});

describe('reading helpers', () => {
  it('knows which labels claim a path', () => {
    expect(labelPath('`docs/reference/triage.md`')).toBe('docs/reference/triage.md');
    expect(labelPath(' scripts/kb.mjs ')).toBe('scripts/kb.mjs');
    expect(labelPath('docs/reference/page-rules.md#PAGE-002')).toBe('docs/reference/page-rules.md');
    for (const l of ['triage.md', 'docs/', 'docs/data', 'the docs/x.md page', 'https://x.org/a.md', 'docs:a.md', '`a` and `b/c.md`', '![x](y.png)', '']) {
      expect(labelPath(l), l).toBeNull();
    }
  });

  it('resolves a claimed path from the folder, the root and the page tree', () => {
    expect(labelTargets('docs/reference/a.md', 'data/gates.json')).toEqual(['docs/reference/data/gates.json', 'data/gates.json', 'docs/data/gates.json']);
    expect(labelTargets('a.md', '/scripts/kb.mjs')).toEqual(['scripts/kb.mjs', 'scripts/kb.mjs', 'docs/scripts/kb.mjs']);
  });
});

it(
  'holds the real tree',
  async () => {
    const r = await capture(spec, [], REPO_ROOT);
    expectPass(r);
    expect(r.out).toMatch(/^\[repo-links\] OK — \d+ link\(s\) in \d+ markdown file\(s\) lead somewhere$/);
  },
  REAL_TREE_TIMEOUT,
);
