/**
 * The context-layer gate. Its job is to notice the two failures the layers
 * exist to prevent — a governed directory with no layer, and one fact living
 * in two files — plus the budgets that force a fact out to its single source.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { allowlistJson, layersTree, layerText, ROOT_LAYER } from '../lib/fixtures.js';
import {
  capture,
  expectFail,
  expectMisuse,
  expectPass,
  makeSandbox,
  REPO_ROOT,
  type Sandbox,
} from '../lib/sandbox.js';
import {
  ALLOWLIST,
  EXTRA_DIR_LAYERS,
  findLayers,
  governedDirs,
  headingFilled,
  layersFor,
  longLines,
  NESTED_MAX_LINES,
  outsideFences,
  spec,
  withSection,
  wordCount,
} from './check-claude-md.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
  layersTree(sb);
});
afterEach(() => sb.cleanup());

/** Every finding line a run printed. */
const findings = (err: string): string[] => err.split('\n').filter((l) => l.startsWith('[context-layers] FAIL'));

/** `text`, padded with single-word lines to exactly `n` words. */
function padTo(text: string, n: number): string {
  const have = wordCount(text);
  if (have > n) throw new Error(`fixture already holds ${have} words, more than ${n}`);
  return `${text}\n${'word\n'.repeat(n - have)}`;
}

/** A line of exactly `n` characters. */
const lineOf = (n: number): string => {
  const head = `A line of ${n} characters shared by two layers `;
  return (head + 'x'.repeat(n)).slice(0, n);
};

const allow = (entries: object[]): void => {
  sb.write(ALLOWLIST, allowlistJson(entries as never));
};

describe('a clean tree', () => {
  it('exits 0 with one stdout line and empty stderr', async () => {
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.err).toBe('');
    expect(r.out.split('\n')).toHaveLength(1);
    expect(r.out).toMatch(/^\[context-layers\] root \d+\/600 words, 2 directory layers within 350/);
  });
});

describe('context-layers-O2', () => {
  it('a copied 60-character line, a dropped heading and a web-only link: three findings on the layer', async () => {
    const l60 = lineOf(60);
    const l59 = lineOf(59);
    expect([l60.length, l59.length]).toEqual([60, 59]);
    sb.write('CLAUDE.md', `${ROOT_LAYER}\n${l60}\n\n${l59}\n`);
    sb.write(
      'scripts/CLAUDE.md',
      `${layerText('scripts', 'dont').replace('[the root](../CLAUDE.md)', '[the web](https://example.com/)')}\n  ${l60}\n${l59}\n`,
    );

    const r = await sb.run(spec);
    expectFail(r);
    expect(r.out).toBe('');
    expect(findings(r.err).sort()).toEqual(
      [
        `[context-layers] FAIL scripts/CLAUDE.md: line copied from the root layer — keep one copy and link to it: ${l60}`,
        `[context-layers] FAIL scripts/CLAUDE.md: no "Don't" heading — a directory layer names the mistakes made here`,
        '[context-layers] FAIL scripts/CLAUDE.md: no repo-relative link — a layer routes to the files that own its details, it does not restate them',
      ].sort(),
    );

    sb.write('scripts/CLAUDE.md', padTo(layerText('scripts'), 351));
    expectFail(await sb.run(spec), 'scripts/CLAUDE.md: 351 words, budget 350');
    sb.write('scripts/CLAUDE.md', padTo(layerText('scripts'), 350));
    expectPass(await sb.run(spec));
  });
});

describe('the governed set, computed each run', () => {
  it('names the expected layer of a new top-level directory, once', async () => {
    sb.mkdir('tests');
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([
      '[context-layers] FAIL tests/CLAUDE.md: governed directory tests/ has no context layer (see docs/concepts/context-layering.md)',
    ]);
  });

  it('names no dot-prefixed or exempt directory', async () => {
    for (const d of ['.github', 'tmp', 'node_modules', 'plans']) sb.write(`${d}/note.md`, 'x\n');
    expectPass(await sb.run(spec));
    expect(governedDirs(sb.dir)).toEqual(['docs', 'scripts']);
  });

  it('fails a tree whose only directories are dot-prefixed or exempt, naming no file', async () => {
    sb.rm('docs');
    sb.rm('scripts');
    sb.write('CLAUDE.md', '# Root\n\nNothing to route to.\n');
    sb.write('plans/x.md', 'x\n');
    sb.write('.github/x.yml', 'x\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([
      '[context-layers] FAIL: no governed directory found — every top-level directory is dot-prefixed or exempt, so the computed set is wrong',
    ]);
  });

  it('holds a deeper directory the configuration names to the full directory-layer shape', async () => {
    EXTRA_DIR_LAYERS.push('docs/runbooks');
    try {
      sb.write('docs/runbooks/CLAUDE.md', layerText('docs/runbooks', 'dont'));
      expectFail(await sb.run(spec), 'docs/runbooks/CLAUDE.md: no "Don\'t" heading');
      sb.write('docs/runbooks/CLAUDE.md', layerText('docs/runbooks').replace('../CLAUDE.md', '../../CLAUDE.md'));
      expectPass(await sb.run(spec));
      expect(layersFor(sb.dir, ['docs/runbooks/a.md'])).toEqual(new Set(['docs/runbooks/CLAUDE.md']));
    } finally {
      EXTRA_DIR_LAYERS.pop();
    }
  });
});

describe('the root layer', () => {
  it('is one finding when missing, and nothing else is checked', async () => {
    sb.rm('CLAUDE.md');
    sb.mkdir('tests');
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      '[context-layers] FAIL CLAUDE.md: the root layer is missing (see docs/concepts/context-layering.md)',
    ]);
  });

  it('passes at 600 words and fails at 601, naming the fix', async () => {
    sb.write('CLAUDE.md', padTo(ROOT_LAYER, 600));
    expectPass(await sb.run(spec));
    sb.write('CLAUDE.md', padTo(ROOT_LAYER, 601));
    const r = await sb.run(spec);
    expectFail(r, 'CLAUDE.md: 601 words, budget 600 — move a fact to its single source and leave a link');
    expect(findings(r.err)).toHaveLength(1);
  });

  it('counts words the way wc -w does', () => {
    expect(wordCount('  one   two\nthree\t four  ')).toBe(4);
    expect(wordCount('')).toBe(0);
  });
});

describe('links', () => {
  it('names the written target and the resolved path of a dead link', async () => {
    sb.write('docs/CLAUDE.md', `${layerText('docs')}\nSee [gone](gone/page.md#x).\n`);
    expectFail(await sb.run(spec), 'docs/CLAUDE.md: dead link: (gone/page.md#x) resolves to docs/gone/page.md, which does not exist');
  });

  it('checks the root’s links too', async () => {
    sb.write('CLAUDE.md', `${ROOT_LAYER}\n[x](nowhere.md)\n`);
    expectFail(await sb.run(spec), 'CLAUDE.md: dead link: (nowhere.md)');
  });

  it('fails a layer whose only links are a web address, a mail address and an anchor', async () => {
    sb.write('docs/CLAUDE.md', `${layerText('docs', 'link')}\n[w](https://x.dev) [m](mailto:a@b.c) [a](#frag)\n`);
    expectFail(await sb.run(spec), 'docs/CLAUDE.md: no repo-relative link');
  });

  it('reads no link inside a fence: a sample routes nowhere, and a dead one there is no finding', async () => {
    sb.write('docs/CLAUDE.md', `${layerText('docs', 'link')}\n\`\`\`markdown\nSee [the root](../CLAUDE.md) and [gone](gone.md).\n\`\`\`\n`);
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      '[context-layers] FAIL docs/CLAUDE.md: no repo-relative link — a layer routes to the files that own its details, it does not restate them',
    ]);
  });

  it('counts a link to a file of any type as routing', async () => {
    sb.write('docs/data/x.json', '{}\n');
    sb.write('docs/CLAUDE.md', `${layerText('docs', 'link')}\nThe data: [x](data/x.json).\n`);
    expectPass(await sb.run(spec));
  });
});

describe('copies from the root', () => {
  it('fails a 60-character copy, passes a 59-character one, and indenting hides nothing', async () => {
    const l60 = lineOf(60);
    sb.write('CLAUDE.md', `${ROOT_LAYER}\n${l60}\n${lineOf(59)}\n`);
    sb.write('docs/CLAUDE.md', `${layerText('docs')}\n${lineOf(59)}\n`);
    expectPass(await sb.run(spec));
    sb.write('docs/CLAUDE.md', `${layerText('docs')}\n    ${l60}   \n`);
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      `[context-layers] FAIL docs/CLAUDE.md: line copied from the root layer — keep one copy and link to it: ${l60}`,
    ]);
  });

  it('trims before measuring', () => {
    const long = 'x'.repeat(70);
    expect(longLines(`   ${long}   \n`).has(long)).toBe(true);
    expect(longLines('short\n').size).toBe(0);
  });
});

describe('the Don’t heading', () => {
  it('takes any level and either apostrophe, but not a word that only starts the same', async () => {
    sb.write('docs/CLAUDE.md', layerText('docs', 'dont') + '\n#### Don’t\n\n- No.\n');
    expectPass(await sb.run(spec));
    sb.write('docs/CLAUDE.md', layerText('docs', 'dont') + '\n## Donations\n\n- No.\n');
    expectFail(await sb.run(spec), 'no "Don\'t" heading');
  });

  it('is not a comment in a shell fence', async () => {
    sb.write('docs/CLAUDE.md', `${layerText('docs', 'dont')}\n\`\`\`bash\n# Don't run this twice\nmake all\n\`\`\`\n`);
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      `[context-layers] FAIL docs/CLAUDE.md: no "Don't" heading — a directory layer names the mistakes made here`,
    ]);
  });

  it('fails a heading with only blank lines and a comment under it, and passes one whose sub-heading holds the list', async () => {
    sb.write('docs/CLAUDE.md', `${layerText('docs', 'dont')}\n## Don't\n\n<!-- to do -->\n\n## Next\n\nProse.\n`);
    expectFail(await sb.run(spec), `docs/CLAUDE.md: the "Don't" heading is empty — name the mistakes made here`);
    sb.write('docs/CLAUDE.md', `${layerText('docs', 'dont')}\n## Don't\n\n### In builds\n\n- Don't guess.\n`);
    expectPass(await sb.run(spec));
  });
});

describe('outsideFences and headingFilled', () => {
  it('blank a fence up to a closing run of its own character, at least as long', () => {
    const text = ['a', '````md', '```', '~~~', '````', 'b', '~~~', 'c', '~~~~', 'd'].join('\n');
    expect(outsideFences(text).split('\n')).toEqual(['a', '', '', '', '', 'b', '', '', '', 'd']);
  });

  it('tell a missing heading from an empty one', () => {
    const re = /^#{1,6}[ \t]+Gotchas\b/;
    expect(headingFilled('# A\n', re)).toBeNull();
    expect(headingFilled('## Gotchas\n\n<!-- q\n  more -->\n## Next\nx\n', re)).toBe(false);
    expect(headingFilled('## Gotchas\n<!-- q -->\n## Gotchas\nOne.\n', re)).toBe(true);
  });
});

/** A nested layer with the four headings, less `omit`, plus `pad` filler lines. */
function nested(name: string, opts: { omit?: string; pad?: number; blanks?: number } = {}): void {
  const heads = ['Intent', 'Purpose', 'Gotchas', 'Tradeoffs'].filter((h) => h !== opts.omit);
  const body = heads.map((h) => `## ${h}\n\nSomething true about ${name}.\n`).join('\n');
  sb.write(
    `site/src/components/${name}/CLAUDE.md`,
    `# ${name}\n\n${body}${'\nFiller line.'.repeat(opts.pad ?? 0)}${'\n'.repeat(opts.blanks ?? 0)}\n`,
  );
}

describe('nested layers', () => {
  beforeEach(() => {
    layersTree(sb, ['docs', 'scripts', 'site']);
    sb.mkdir('site/src/components/Term');
  });

  it('requires one per folder under a nesting root, with all four headings', async () => {
    expectFail(await sb.run(spec), 'site/src/components/Term/CLAUDE.md: folder site/src/components/Term/ has no nested layer');
    nested('Term', { omit: 'Gotchas' });
    expectFail(await sb.run(spec), 'no "Gotchas" heading');
    nested('Term');
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('1 nested within 40 lines');
  });

  it('fails 41 non-blank lines, passes 40, and never counts a blank line', async () => {
    // The layer's own lines: the title and four headed paragraphs, nine in all.
    nested('Term', { pad: NESTED_MAX_LINES - 9, blanks: 30 });
    expectPass(await sb.run(spec));
    nested('Term', { pad: NESTED_MAX_LINES - 8 });
    expectFail(await sb.run(spec), `41 lines, budget ${NESTED_MAX_LINES}`);
  });

  it('reads no heading inside a fence, and fails a heading left empty', async () => {
    nested('Term', { omit: 'Tradeoffs' });
    sb.write('site/src/components/Term/CLAUDE.md', `${sb.read('site/src/components/Term/CLAUDE.md')}\n\`\`\`md\n## Tradeoffs\n\`\`\`\n`);
    expectFail(await sb.run(spec), 'no "Tradeoffs" heading');
    sb.write('site/src/components/Term/CLAUDE.md', `${sb.read('site/src/components/Term/CLAUDE.md')}\n## Tradeoffs\n\n<!-- q -->\n`);
    expectFail(await sb.run(spec), '"Tradeoffs" is empty — a nested layer answers all four');
  });

  it('checks only the nested layer for a path in its folder', async () => {
    nested('Term', { omit: 'Intent' });
    sb.write('docs/CLAUDE.md', layerText('docs', 'dont'));
    const r = await sb.run(spec, ['site/src/components/Term/term.client.ts']);
    expect(findings(r.err)).toEqual([
      '[context-layers] FAIL site/src/components/Term/CLAUDE.md: no "Intent" heading — a nested layer answers all four',
    ]);
  });
});

describe('placement', () => {
  it('fails a layer one level below a governed directory’s top', async () => {
    sb.write('docs/specs/CLAUDE.md', '# stray\n');
    expectFail(await sb.run(spec), 'docs/specs/CLAUDE.md: a layer belongs at the root, at the top of a governed directory');
    expect(findLayers(sb.dir)).toContain('docs/specs/CLAUDE.md');
  });

  it('reads the disk, skipping installed code, output, the root scratch folder and second checkouts', async () => {
    sb.write('tmp/CLAUDE.md', '# scratch\n');
    sb.write('node_modules/x/CLAUDE.md', '# installed\n');
    sb.write('docs/dist/CLAUDE.md', '# output\n');
    sb.write('.claude/worktrees/w1/docs/CLAUDE.md', '# its own tree\n');
    expectPass(await sb.run(spec));
    sb.write('docs/tmp/CLAUDE.md', '# a nested tmp is ordinary\n');
    expectFail(await sb.run(spec), 'docs/tmp/CLAUDE.md');
  });

  it('excuses a stray layer an allowlist entry names, counts it, and fails an entry that excuses nothing', async () => {
    sb.write('docs/specs/CLAUDE.md', '# kept until the cutover\n');
    const entry = { name: 'old', match: 'docs/*/CLAUDE.md', reason: 'generated, retires at the cutover', owner: 'O', since: '2026-09-23' };
    allow([entry]);
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('1 excused by 1 allowlist entry');
    sb.rm('docs/specs');
    expectFail(await sb.run(spec), `${ALLOWLIST}: entry "old" excuses nothing`);
  });

  it('excuses the place only: an excused layer’s dead link and root copy are still findings', async () => {
    const l60 = lineOf(60);
    sb.write('CLAUDE.md', `${ROOT_LAYER}\n${l60}\n`);
    sb.write('docs/specs/CLAUDE.md', `# kept until the cutover\n\n${l60}\n\nSee [gone](gone/nowhere.md).\n`);
    allow([{ name: 'old', match: 'docs/*/CLAUDE.md', reason: 'retires at the cutover', owner: 'O', since: '2026-09-23' }]);
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err).sort()).toEqual(
      [
        '[context-layers] FAIL docs/specs/CLAUDE.md: dead link: (gone/nowhere.md) resolves to docs/specs/gone/nowhere.md, which does not exist',
        `[context-layers] FAIL docs/specs/CLAUDE.md: line copied from the root layer — keep one copy and link to it: ${l60}`,
      ].sort(),
    );
  });

  it('names a missing or malformed allowlist', async () => {
    sb.rm(ALLOWLIST);
    expectFail(await sb.run(spec), `${ALLOWLIST}: is missing`);
    allow([{ name: 'x', match: 'y', reason: '' }]);
    expectFail(await sb.run(spec), 'entry "x" has an empty reason');
  });
});

describe('narrowed runs', () => {
  it('check only the layer governing the path, and skip the placement walk', async () => {
    sb.write('docs/CLAUDE.md', layerText('docs', 'dont'));
    sb.write('scripts/deep/CLAUDE.md', '# stray\n');
    const r = await sb.run(spec, ['scripts/build.mjs']);
    expectPass(r);
    expect(r.out).toBe('[context-layers] 1 layer(s) in scope, 1 links resolve');
    expectFail(await sb.run(spec, ['docs/page.md']), 'no "Don\'t" heading');
  });

  it('still read the root as comparison input', async () => {
    const l60 = lineOf(60);
    sb.write('CLAUDE.md', `${ROOT_LAYER}\n${l60}\n`);
    sb.write('docs/CLAUDE.md', `${layerText('docs')}\n${l60}\n`);
    expectFail(await sb.run(spec, ['docs/CLAUDE.md']), 'line copied from the root layer');
  });

  it('take the allowlist as a request for the whole run', async () => {
    sb.write('docs/specs/CLAUDE.md', '# stray\n');
    expectFail(await sb.run(spec, [ALLOWLIST]), 'docs/specs/CLAUDE.md');
  });

  it('are misuse when no layer governs the path', async () => {
    const before = sb.snapshot();
    expectMisuse(await sb.run(spec, ['README.md']));
    expect(sb.snapshot()).toEqual(before);
  });

  it('map a path to the most specific layer', () => {
    expect(layersFor(sb.dir, ['CLAUDE.md', './docs/a/b.md', 'scripts/'])).toEqual(
      new Set(['CLAUDE.md', 'docs/CLAUDE.md', 'scripts/CLAUDE.md']),
    );
    expect(layersFor(sb.dir, [ALLOWLIST])).toBe('whole');
    expect(layersFor(sb.dir, ['plans/x.md'])).toBeNull();
  });
});

describe('--fix', () => {
  it('appends the missing Don’t heading, prints one repair line and still exits 1 with one finding', async () => {
    sb.write('docs/CLAUDE.md', layerText('docs', 'dont'));
    const r = await sb.run(spec, ['--fix']);
    expectFail(r);
    expect(r.err.split('\n').filter((l) => l.includes('FIXED'))).toEqual([
      `[context-layers] FIXED docs/CLAUDE.md: opened a "Don't" heading`,
    ]);
    expect(findings(r.err)).toEqual([
      `[context-layers] FAIL docs/CLAUDE.md: the "Don't" heading is empty — name the mistakes made here`,
    ]);
    expect(sb.read('docs/CLAUDE.md')).toBe(`${layerText('docs', 'dont')}\n## Don't\n\n<!-- What goes wrong here? One bullet per mistake actually made in this directory. -->\n`);
  });

  it('leaves the finding for every later run until a person writes the answer', async () => {
    sb.write('docs/CLAUDE.md', layerText('docs', 'dont'));
    expectFail(await sb.run(spec, ['--fix']));
    const later = await sb.run(spec);
    expectFail(later);
    expect(findings(later.err)).toEqual([
      `[context-layers] FAIL docs/CLAUDE.md: the "Don't" heading is empty — name the mistakes made here`,
    ]);
    expect(later.err).not.toContain('FIXED');
    sb.write('docs/CLAUDE.md', `${sb.read('docs/CLAUDE.md')}- Don't guess.\n`);
    expectPass(await sb.run(spec));
  });

  it('opens every heading a nested layer lacks', async () => {
    layersTree(sb, ['docs', 'scripts', 'site']);
    sb.write('site/src/components/Term/CLAUDE.md', '# Term\n');
    const r = await sb.run(spec, ['--fix', 'site/src/components/Term/x.ts']);
    expectFail(r, 'is empty — a nested layer answers all four');
    for (const h of ['Intent', 'Purpose', 'Gotchas', 'Tradeoffs']) {
      expect(sb.read('site/src/components/Term/CLAUDE.md')).toContain(`## ${h}\n`);
    }
    expectFail(await sb.run(spec, ['site/src/components/Term/x.ts']), '"Intent", "Purpose", "Gotchas", "Tradeoffs" is empty');
  });

  it('names a heading already empty beside the ones it opens, in the order of the four', async () => {
    layersTree(sb, ['docs', 'scripts', 'site']);
    sb.write('site/src/components/Term/CLAUDE.md', '# Term\n\n## Purpose\n\nWhat it holds.\n\n## Gotchas\n\n<!-- q -->\n\n## Tradeoffs\n\nNone.\n');
    const r = await sb.run(spec, ['--fix', 'site/src/components/Term/x.ts']);
    expect(r.err).toContain('FIXED site/src/components/Term/CLAUDE.md: opened "Intent"');
    expect(findings(r.err)).toEqual([
      '[context-layers] FAIL site/src/components/Term/CLAUDE.md: "Intent", "Gotchas" is empty — a nested layer answers all four',
    ]);
  });

  it('changes no file when the layers are already right', async () => {
    const before = sb.snapshot();
    expectPass(await sb.run(spec, ['--fix']));
    expect(sb.snapshot()).toEqual(before);
  });

  it('appends after a file that lacks a trailing newline', () => {
    expect(withSection('# A', 'Intent')).toBe('# A\n\n## Intent\n\n<!-- What is this folder for, in one sentence? -->\n');
  });
});

describe('misuse', () => {
  it('exits 2 on --nope and leaves every file byte-identical', async () => {
    const before = sb.snapshot();
    expectMisuse(await sb.run(spec, ['--nope']));
    expect(sb.snapshot()).toEqual(before);
  });
});

describe('the real tree', () => {
  it('passes, with every governed directory carrying its layer', async () => {
    const r = await capture(spec, [], REPO_ROOT);
    expect(r.err).toBe('');
    expectPass(r);
    const layers = Number(/(\d+) directory layers/.exec(r.out)?.[1] ?? 0);
    expect(layers).toBe(governedDirs(REPO_ROOT).length);
  });
});
