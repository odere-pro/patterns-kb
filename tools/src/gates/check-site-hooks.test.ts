/**
 * The hook parity gate (spec kb.site.components, hook-parity-gate). The cases
 * worth having are the two halves of one rename: a selector that matches no
 * markup, and — where two templates emit one hook — the attribute a half-done
 * rename leaves that nothing reads.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { allowlistJson } from '../lib/fixtures.js';
import { expectFail, expectMisuse, expectPass, makeSandbox, type Sandbox } from '../lib/sandbox.js';
import { ALLOWLIST, EXTRA_MARKUP, hookUses, isClientModule, langOf, markupHooks, SELF, SELF_READ, spec, stripComments } from './check-site-hooks.js';

const MENU = 'site/src/components/Menu';

const menuAstro = (hook = 'data-kb-menu-panel'): string =>
  `---
// The menu. Chrome, so it carries data-kb-skip.
---

<button data-kb-menu-open data-kb-skip></button>
<nav ${hook}>
  <slot />
</nav>
`;

const drawerAstro = '<aside data-kb-menu-panel>\n  <slot />\n</aside>\n';

const menuClient = `export function start(doc: Document): void {
  const open = doc.querySelector('[data-kb-menu-open]');
  const panel = doc.querySelector('[data-kb-menu-panel]');
  if (!open || !panel) return;
  open.addEventListener('click', () => panel.toggleAttribute('data-kb-menu-shown'));
}
`;

/** The skip hook's reader lives in tools/src, as the real one does. */
const skipReader = "export const SKIP = 'data-kb-skip';\n";

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
  sb.write(ALLOWLIST, allowlistJson());
  sb.write(`${MENU}/Menu.astro`, menuAstro());
  sb.write(`${MENU}/Drawer.astro`, drawerAstro);
  sb.write(`${MENU}/menu.client.ts`, menuClient);
  sb.write('tools/src/gates/check-site-absence.ts', skipReader);
});
afterEach(() => sb.cleanup());

describe('reading a behaviour module', () => {
  it('takes a selector as a read, whether written out or built', () => {
    const uses = hookUses("q('[data-kb-toc]'); q(`[data-kb-diagram-act=\"${act}\"]`); el.getAttribute('data-kb-meta-json');");
    expect(uses.map((u) => `${u.kind} ${u.name}`)).toEqual(['read data-kb-toc', 'read data-kb-diagram-act', 'read data-kb-meta-json']);
  });

  it('takes an attribute the module sets as its own state, through a constant', () => {
    const uses = hookUses("const OPEN = 'data-kb-term-open';\nterm.setAttribute(OPEN, '');\nterm.removeAttribute(OPEN);\nterm.hasAttribute(OPEN);\n");
    expect(uses).toEqual([
      { name: 'data-kb-term-open', line: 2, kind: 'write' },
      { name: 'data-kb-term-open', line: 3, kind: 'write' },
      { name: 'data-kb-term-open', line: 4, kind: 'read' },
    ]);
  });

  it('reads dataset both ways, and ignores a name it cannot resolve', () => {
    expect(hookUses('el.dataset.kbMetaOpen = "1"; if (el.dataset.kbTocDepth) {}')).toEqual([
      { name: 'data-kb-meta-open', line: 1, kind: 'write' },
      { name: 'data-kb-toc-depth', line: 1, kind: 'read' },
    ]);
    expect(hookUses('el.setAttribute(whateverThisIs, "");')).toEqual([]);
  });

  it('lets no comment answer for markup or for a reader, and keeps the line numbers', () => {
    const src = '// a click sets [data-kb-term-open]\n/* and [data-kb-gone] */\nq("[data-kb-toc]");';
    expect(stripComments(src).split('\n')).toHaveLength(3);
    expect(hookUses(src)).toEqual([{ name: 'data-kb-toc', line: 3, kind: 'read' }]);
    expect(markupHooks('<!-- data-kb-old -->\n{/* data-kb-older */}\n<p data-kb-new></p>')).toEqual([{ name: 'data-kb-new', line: 3 }]);
  });

  it('blanks a trailing comment too, and never a // inside a string, a pattern or a template', () => {
    const src = [
      "const a = q('[data-kb-lens]'); // was [data-kb-lens-old] before the rename",
      "const url = 'https://x.test/[data-kb-in-string]';",
      'const re = /\\/\\/[data-kb-in-pattern]/;',
      'const t = `//${q("[data-kb-in-template]")}`;',
    ].join('\n');
    const names = hookUses(src).map((u) => u.name);
    expect(names).toEqual(['data-kb-lens', 'data-kb-in-string', 'data-kb-in-pattern', 'data-kb-in-template']);
    expect(stripComments(src).split('\n')).toHaveLength(4);
  });

  it('reads a template the way it is written: its frontmatter and scripts as TypeScript, its markup for markup comments', () => {
    const astro = [
      '---',
      "const x = 1; // the old [data-kb-gone] hook",
      '---',
      '<p data-kb-kept>see https://example.test/a//b</p>',
      '<script>',
      "  q('[data-kb-kept]'); // and [data-kb-gone-too]",
      '</script>',
    ].join('\n');
    expect(markupHooks(astro).map((h) => h.name)).toEqual(['data-kb-kept', 'data-kb-kept']);
    expect(stripComments('a { /* [data-kb-x] */ color: red; } // [data-kb-y]', 'css')).toContain('[data-kb-y]');
    expect([langOf('a/b.css'), langOf('a/B.astro'), langOf('a/b.mdx'), langOf('a/b.ts')]).toEqual(['css', 'markup', 'markup', 'ts']);
  });

  it('knows the bundle from a test of it', () => {
    expect(isClientModule(`${MENU}/menu.client.ts`)).toBe(true);
    expect(isClientModule('site/src/client/index.ts')).toBe(true);
    expect(isClientModule(`${MENU}/menu.client.test.ts`)).toBe(false);
    expect(isClientModule(`${MENU}/Menu.astro`)).toBe(false);
    expect(isClientModule('tools/src/lib/site-markdown.client.ts')).toBe(false);
  });
});

describe('a component whose halves agree', () => {
  it('passes, counting what it checked', async () => {
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[site-hooks] 1 behaviour modules and 2 markup files name the same hooks: 2 queried, 3 emitted, 0 kept for a reader');
  });

  it('takes markup from the rehype plugin, and a hook the module writes as needing none', async () => {
    sb.write('site/src/components/DiagramTools/diagram-tools.client.ts', "export const s = (f: Element) => f.querySelector('[data-kb-diagram-stage]');\n");
    sb.write(PLUGIN, plugin());
    expectPass(await sb.run(spec));
  });

  it('reads no generated page: a hub git ignores emits nothing', async () => {
    sb.write('.gitignore', 'site/src/content/docs/*/**/index.mdx\n');
    sb.write('site/src/content/docs/a/b/index.mdx', '<div data-kb-nobody-reads></div>\n');
    expectPass(await sb.run(spec));
  });
});

/** The rehype plugin: markup for the diagram figure, and the one hook it hands itself. */
const PLUGIN = EXTRA_MARKUP[0];
const plugin = (stage = 'data-kb-diagram-stage', extra = ''): string =>
  [
    "if (d.wide) facts['data-kb-wide'] = '';",
    "const wide = 'data-kb-wide' in props;",
    `el('div', { '${stage}': ''${extra} });`,
    '',
  ].join('\n');
const stageReader = "export const s = (f: Element) => f.querySelector('[data-kb-diagram-stage]');\n";

describe('the markdown plugin is markup, never its own reader', () => {
  beforeEach(() => {
    sb.write('site/src/components/DiagramTools/diagram-tools.client.ts', stageReader);
  });

  it('names a dead hook the plugin emits and nothing reads', async () => {
    sb.write(PLUGIN, plugin('data-kb-diagram-stage', ", 'data-kb-plant-dead': ''"));
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err.split('\n')).toEqual([
      `[site-hooks] FAIL ${PLUGIN}:3: data-kb-plant-dead is emitted here and nothing reads it — no module queries it, no stylesheet keys on it, no program looks for it. Rename it back, delete it, or excuse it in ${ALLOWLIST} with the reader it is for`,
    ]);
  });

  it('gives two findings when a hook is renamed in the plugin only: one in the module, one in the markup', async () => {
    sb.write(PLUGIN, plugin('data-kb-diagram-stadium'));
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err.split('\n')).toEqual([
      '[site-hooks] FAIL site/src/components/DiagramTools/diagram-tools.client.ts:1: data-kb-diagram-stage is queried here and no site markup emits it — the selector matches nothing, so this behaviour never runs',
      `[site-hooks] FAIL ${PLUGIN}:3: data-kb-diagram-stadium is emitted here and nothing reads it — no module queries it, no stylesheet keys on it, no program looks for it. Rename it back, delete it, or excuse it in ${ALLOWLIST} with the reader it is for`,
    ]);
  });

  it('lets the plugin answer only for the hook it hands itself, and fails that list when it goes stale', async () => {
    expect(SELF_READ[PLUGIN]).toEqual(['data-kb-wide']);
    sb.write(PLUGIN, plugin());
    expectPass(await sb.run(spec));
    sb.write(PLUGIN, "el('div', { 'data-kb-diagram-stage': '' });\n");
    expectFail(await sb.run(spec), `${SELF}: SELF_READ names data-kb-wide for ${PLUGIN}, which no longer emits it — take it out of the list`);
  });
});

describe('the rename that used to stay green', () => {
  it('fails the markup half when only one template is renamed', async () => {
    sb.write(`${MENU}/Menu.astro`, menuAstro('data-kb-menu-drawer'));
    const r = await sb.run(spec);
    expectFail(r);
    // The selector still matches Drawer.astro, so the only finding is the
    // orphaned attribute, on its own line for the matcher.
    expect(r.err.split('\n')).toEqual([
      `[site-hooks] FAIL ${MENU}/Menu.astro:6: data-kb-menu-drawer is emitted here and nothing reads it — no module queries it, no stylesheet keys on it, no program looks for it. Rename it back, delete it, or excuse it in ${ALLOWLIST} with the reader it is for`,
    ]);
  });

  it('takes a trailing comment naming an old hook for prose, not a query', async () => {
    sb.write(`${MENU}/menu.client.ts`, menuClient.replace("'[data-kb-menu-open]');", "'[data-kb-menu-open]'); // was [data-kb-menu-old] before the rename"));
    expectPass(await sb.run(spec));
  });

  it('fails the selector half when the markup drops a hook entirely', async () => {
    sb.write(`${MENU}/Menu.astro`, menuAstro());
    sb.write(`${MENU}/Drawer.astro`, '<aside>\n  <slot />\n</aside>\n');
    sb.write(`${MENU}/Menu.astro`, menuAstro('hidden'));
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err.split('\n')).toEqual([
      `[site-hooks] FAIL ${MENU}/menu.client.ts:3: data-kb-menu-panel is queried here and no site markup emits it — the selector matches nothing, so this behaviour never runs`,
    ]);
  });

  it('lets a stylesheet, a program or an allowlist entry be the reader', async () => {
    sb.write(`${MENU}/Menu.astro`, `${menuAstro()}<p data-kb-menu-note></p><i data-kb-styled></i><b data-kb-probed></b>\n`);
    sb.write(`${MENU}/menu.css`, '[data-kb-styled] { color: var(--sl-color-text); }\n');
    sb.write('tools/src/site/probe.ts', "export const P = 'data-kb-probed';\n");
    sb.write(ALLOWLIST, allowlistJson([{ name: 'menu-note', match: 'data-kb-menu-note', reason: 'Read by a person looking at the built page.' }]));
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('1 kept for a reader');
  });

  it('fails an allowlist entry that excuses nothing, and a list that is missing or malformed', async () => {
    sb.write(ALLOWLIST, allowlistJson([{ name: 'stale', match: 'data-kb-gone', reason: 'Once read by a person.' }]));
    expectFail(await sb.run(spec), `${ALLOWLIST}: entry "stale" excuses nothing`);
    sb.write(ALLOWLIST, allowlistJson([{ name: 'blank', match: 'data-kb-x', reason: ' ' }]));
    expectFail(await sb.run(spec), 'has an empty reason — say who reads the hook');
    sb.rm(ALLOWLIST);
    expectFail(await sb.run(spec), `${ALLOWLIST}: is missing`);
  });
});

describe('the hook parity gate', () => {
  it('takes no arguments', async () => {
    expectMisuse(await sb.run(spec, ['--nope']));
    expectMisuse(await sb.run(spec, ['site/src']));
  });

  it('passes the real tree', async () => {
    sb.rm('site');
    sb.rm('tools');
    sb.copyRepo('site/src', 'tools/src', ALLOWLIST);
    sb.rm('site/src/content');
    expectPass(await sb.run(spec));
  });
});
