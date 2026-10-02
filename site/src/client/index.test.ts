/**
 * The bundle entry is the one file that wires every client behaviour, and it
 * is maintained by hand: a new `<name>.client.ts` needs one import line here,
 * and nothing in the build fails when the line is forgotten — the component
 * just silently never initialises. This test is that missing failure: the set
 * of client modules on disk and the set imported by the entry must be equal,
 * both directions.
 *
 * The entry itself is not imported — it runs its inits against the global
 * document at load, which is exactly right for the bundle and exactly wrong
 * for a unit test — so the wiring is read from its source text.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ALLOWLIST as SITE_HOOKS_ALLOWLIST,
  spec as hookGate,
} from '../../../tools/src/gates/check-site-hooks';
import { spec as tokenGate, TOKENS } from '../../../tools/src/gates/check-site-tokens';
import { allowlistJson } from '../../../tools/src/lib/fixtures';
import { expectFail, expectPass, makeSandbox, type Sandbox } from '../../../tools/src/lib/sandbox';
import { builtPage } from '../../../tools/src/site/site-fixtures';

const here = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(here, 'index.ts');
const COMPONENTS = path.join(here, '..', 'components');

const onDisk = (): string[] => {
  const out: string[] = [];
  for (const dir of fs.readdirSync(COMPONENTS).sort()) {
    const full = path.join(COMPONENTS, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const f of fs.readdirSync(full)) {
      if (f.endsWith('.client.ts')) out.push(`../components/${dir}/${f.replace(/\.ts$/, '')}`);
    }
  }
  return out.sort();
};

const imported = (): string[] =>
  [...fs.readFileSync(ENTRY, 'utf8').matchAll(/from '(\.\.\/components\/[^']+)'/g)]
    .map((m) => m[1])
    .sort();

describe('the bundle entry wires every client module', () => {
  it('imports exactly the client modules that exist — both directions', () => {
    expect(imported()).toEqual(onDisk());
  });

  it('calls every import inside the isolation loop', () => {
    // Each import must appear in the for-of array, or it is imported and
    // never run — wired in name only.
    const text = fs.readFileSync(ENTRY, 'utf8');
    const names = [...text.matchAll(/import \{ init as (\w+) \}/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    const loop = /for \(const init of \[([^\]]+)\]/.exec(text);
    expect(loop).not.toBeNull();
    const called = (loop as RegExpExecArray)[1];
    for (const n of names) expect(called).toContain(n);
  });
});

/**
 * components-O1, over a source tree of its own: three components, one whose
 * module queries a hook no markup emits and one whose start function throws.
 * The two source gates run as the driver runs them (tools/src/gates), and the
 * bundle is built the way `npm run bundle` builds it — one classic script —
 * from an entry holding this file's real isolation loop, then run against a
 * built page.
 */
describe('components-O1', () => {
  let sb: Sandbox;
  beforeEach(() => {
    sb = makeSandbox();
  });
  afterEach(() => sb.cleanup());

  const CARD = 'site/src/components/Card';
  const cardCss = (colour: string): string =>
    ['.kb-card {', '  padding: var(--kb-space-1);', `  color: ${colour};`, '}', ''].join('\n');

  /** The real entry's loop, with the sandbox's three start functions in its list. */
  function entryText(): string {
    const real = fs.readFileSync(ENTRY, 'utf8');
    const loop = real.slice(real.indexOf('for (const init of ['));
    return [
      "import { init as boom } from '../components/Boom/boom.client';",
      "import { init as card } from '../components/Card/card.client';",
      "import { init as ghost } from '../components/Ghost/ghost.client';",
      '',
      loop.replace(/for \(const init of \[[^\]]*\]\)/, 'for (const init of [boom, card, ghost])'),
    ].join('\n');
  }

  /**
   * The line each start function opens with: it adds its own name to a list
   * on the root element, whatever the page holds, so the test sees every one
   * that ran — the ghost's included, which otherwise does nothing on a page
   * with no ghost. `data-ran` is no hook: it is not data-kb-*.
   */
  const ran = (name: string): string =>
    `doc.documentElement.setAttribute('data-ran', \`\${doc.documentElement.getAttribute('data-ran') ?? ''} ${name}\`.trim());`;

  function sourceTree(): void {
    sb.write(SITE_HOOKS_ALLOWLIST, allowlistJson());
    sb.write(TOKENS, ':root {\n  --kb-space-1: 0.25rem;\n}\n');
    sb.write(`${CARD}/Card.astro`, '<div class="kb-card" data-kb-card><slot /></div>\n');
    sb.write(`${CARD}/card.css`, cardCss('var(--sl-color-white)'));
    sb.write(
      `${CARD}/card.client.ts`,
      `export function init(doc: Document): void {\n  for (const el of doc.querySelectorAll('[data-kb-card]')) el.setAttribute('data-kb-card-ready', '');\n  ${ran('card')}\n}\n`,
    );
    sb.write('site/src/components/Boom/Boom.astro', '<div class="kb-boom" data-kb-boom></div>\n');
    sb.write(
      'site/src/components/Boom/boom.client.ts',
      `export function init(doc: Document): void {\n  ${ran('boom')}\n  if (doc.querySelector('[data-kb-boom]')) throw new Error('boom');\n}\n`,
    );
    sb.write(
      'site/src/components/Ghost/ghost.client.ts',
      `export function init(doc: Document): void {\n  const el = doc.querySelector('[data-kb-ghost]');\n  ${ran('ghost')}\n  if (!el) return;\n  el.setAttribute('data-kb-ghost-seen', '');\n}\n`,
    );
    sb.write('site/src/client/index.ts', entryText());
  }

  it('components-O1: a colour leaks and moves back, a ghost hook is named, a throwing start function stops no other', async () => {
    sourceTree();
    expectPass(await sb.run(tokenGate));

    // A raw colour in a component stylesheet: one finding, that file and line.
    sb.write(`${CARD}/card.css`, cardCss('#b4232a'));
    const leaked = await sb.run(tokenGate);
    expectFail(leaked, `${CARD}/card.css:3:`);
    expect(leaked.err.trim().split('\n')).toHaveLength(1);
    expect(leaked.err).toMatch(new RegExp(`^\\[site-tokens\\] FAIL ${CARD}/card\\.css:3: `));

    // Moved into the token stylesheet under a name the component uses; the value kept in a comment.
    sb.write(TOKENS, ':root {\n  --kb-space-1: 0.25rem;\n  --kb-card-accent: #b4232a;\n}\n');
    sb.write(`${CARD}/card.css`, cardCss('var(--kb-card-accent) /* was #b4232a */'));
    const moved = await sb.run(tokenGate);
    expectPass(moved);
    expect(moved.err).toBe('');

    // The hook no markup emits: one finding, in the module that queries it.
    const hooks = await sb.run(hookGate);
    expectFail(
      hooks,
      'site/src/components/Ghost/ghost.client.ts:2: data-kb-ghost is queried here and no site markup emits it',
    );
    expect(hooks.err.trim().split('\n')).toHaveLength(1);

    // The bundle, as `npm run bundle` builds it, loaded on a built page.
    const bundle = await build({
      entryPoints: [path.join(sb.dir, 'site/src/client/index.ts')],
      bundle: true,
      format: 'iife',
      target: 'es2017',
      write: false,
      logLevel: 'silent',
    });
    const script = bundle.outputFiles[0]?.text ?? '';
    const page = new Window({
      url: 'file:///site/dist/patterns/caching/alpha.html',
      settings: { disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true },
    });
    const html = builtPage({
      route: '/patterns/caching/alpha.html',
      title: 'Alpha',
      area: 'caching',
      body: '<div class="kb-boom" data-kb-boom></div><div class="kb-card" data-kb-card>Card</div>',
    });
    page.document.write(html);
    expect(page.document.querySelectorAll('script[data-kb="bundle"]')).toHaveLength(1);
    const errors: unknown[][] = [];
    vm.runInNewContext(script, {
      document: page.document,
      console: { error: (...args: unknown[]) => errors.push(args) },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.[0]).toBe('[kb] client init failed');
    expect(String(errors[0]?.[1])).toContain('boom');
    // Every start function ran, in order: the one that threw, then each after
    // it — the card's, which did its work, and the ghost's, which found nothing
    // and said nothing.
    expect(page.document.documentElement.getAttribute('data-ran')).toBe('boom card ghost');
    expect(page.document.querySelector('[data-kb-card]')?.hasAttribute('data-kb-card-ready')).toBe(
      true,
    );
    expect(page.document.querySelector('[data-kb-ghost-seen]')).toBeNull();
    await page.happyDOM.close();
  });
});
