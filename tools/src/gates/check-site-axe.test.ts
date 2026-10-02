/**
 * The browser half of the accessibility floor (spec kb.noise.accessibility).
 *
 * The decisions — how a violation becomes a finding, how a waiver applies,
 * both themes on every page, axe injected per page, incomplete results
 * counted and never failed, the browser closed when a page throws, a launch
 * failure naming the install command, the skip with no browser — are tested on
 * a fake browser, so they hold on a checkout with no Chromium. One case opens
 * real pages in real Chromium, and runs only where `make site-deps` has put one.
 */

import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runGate, type GateContext } from '../lib/gate.js';
import { REQUIRE_BROWSER } from '../lib/require-browser.js';
import { expectFail, expectMisuse, expectPass, makeSandbox, type Sandbox } from '../lib/sandbox.js';
import {
  audit,
  auditStates,
  browserInstalled,
  describe as describeViolation,
  htmlPages,
  INSTALL,
  launchChromium,
  run,
  spec,
  STATE_QUERY,
  STATE_WAIVERS,
  statePages,
  STATES,
  TAGS,
  THEMES,
  unwaived,
  VIEWPORT,
  WAIVERS,
  type AxeBrowser,
  type AxeResult,
  type LaunchBrowser,
} from './check-site-axe.js';

/** A page with an unambiguous WCAG A failure: an image with no alt. */
const BROKEN = '<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>t</h1><img src="x.png"></main></body></html>';
const CLEAN = '<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>t</h1><p>Nothing wrong here.</p></main></body></html>';

const violation = (id: string, nodes: number): Parameters<typeof describeViolation>[0] => ({
  id,
  impact: 'serious',
  help: `${id} help`,
  helpUrl: `https://example.invalid/${id}`,
  nodes: Array.from({ length: nodes }, (_, i) => ({ target: [`#n${i}`], failureSummary: `Fix any of the following:\n  reason ${i}` })),
});

describe('describe', () => {
  it('names the rule, the theme, the impact, the first failing node, why, and the help link', () => {
    expect(describeViolation(violation('color-contrast', 1), 'dark')).toBe(
      'color-contrast [dark, serious]: color-contrast help at `#n0` — reason 0 — https://example.invalid/color-contrast',
    );
  });

  it('counts the rest rather than printing every node', () => {
    const line = describeViolation(violation('color-contrast', 40), 'light');
    expect(line).toContain('(+39 more)');
    expect(line).not.toContain('#n1`');
  });

  it('survives a violation with no nodes and no impact', () => {
    expect(describeViolation({ id: 'x', impact: null, help: 'h', helpUrl: 'u', nodes: [] }, 'light')).toBe('x [light, unrated]: h — u');
  });
});

describe('unwaived', () => {
  it('drops exactly the waived rule, and keeps everything when nothing is waived', () => {
    const vs = [violation('color-contrast', 1), violation('label', 1)];
    expect(unwaived(vs, new Set()).map((v) => v.id)).toEqual(['color-contrast', 'label']);
    expect(unwaived(vs, new Set(['label'])).map((v) => v.id)).toEqual(['color-contrast']);
  });

  it('ships the waiver list empty, the rule set at WCAG 2.1 A and AA, both themes and a width above every breakpoint', () => {
    expect(WAIVERS.size).toBe(0);
    expect(TAGS).toEqual(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
    expect(THEMES).toEqual(['light', 'dark']);
    // layout.css pins the sidebar at 97.5rem and shows the rail from 72rem.
    expect(VIEWPORT.width).toBeGreaterThanOrEqual(97.5 * 16);
  });
});

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

describe('htmlPages', () => {
  it('walks nested folders, sorted, and ignores everything that is not a page', () => {
    for (const f of ['dist/b.html', 'dist/a.html', 'dist/deep/c.html', 'dist/index.json', 'dist/_astro/x.js']) sb.write(f, '');
    const dist = path.join(sb.dir, 'dist');
    expect(htmlPages(dist).map((p) => path.relative(dist, p))).toEqual(['a.html', 'b.html', path.join('deep', 'c.html')]);
  });
});

/** A real gate context whose findings and notes are collected, not printed. */
async function withCtx<T>(fn: (ctx: GateContext) => Promise<T>): Promise<{ r: T; err: string[] }> {
  const err: string[] = [];
  let r: T | undefined;
  await runGate(
    {
      name: 'site-axe',
      usage: 'usage: harness',
      async run(ctx) {
        r = await fn(ctx);
        return '';
      },
    },
    [],
    { out: () => {}, err: (l) => err.push(l) },
    sb.dir,
  );
  return { r: r as T, err };
}

interface Seen {
  /** Every action the second pass took, in order: `viewport 390x844`, `search`, `menu`. */
  steps: string[];
  /** The fake page has neither the search button nor the menu button. */
  noControls?: boolean;
  urls: string[];
  themes: string[];
  tags: string[][];
  closed: number;
  injected: string[];
  tabs: number;
}

const blank = (): Seen => ({ steps: [], urls: [], themes: [], tags: [], closed: 0, injected: [], tabs: 0 });
const clean = (): AxeResult => ({ violations: [], incomplete: [] });

function fakeBrowser(seen: Seen, resultFor: (url: string, theme: string, steps: readonly string[]) => AxeResult, onOpen?: (url: string) => void): LaunchBrowser {
  return async () =>
    await Promise.resolve<AxeBrowser>({
      close: async () => {
        seen.closed += 1;
        await Promise.resolve();
      },
      newPage: async () => {
        seen.tabs += 1;
        let url = '';
        let theme = '';
        let steps: string[] = [];
        return await Promise.resolve({
          setViewport: async (v: { width: number; height: number }) => {
            steps = [`viewport ${v.width}x${v.height}`];
            seen.steps.push(steps[0] as string);
            await Promise.resolve();
          },
          openSearch: async (query: string) => {
            steps.push(`search ${query}`);
            seen.steps.push(`search ${query}`);
            return await Promise.resolve(!seen.noControls);
          },
          openMenu: async () => {
            steps.push('menu');
            seen.steps.push('menu');
            return await Promise.resolve(!seen.noControls);
          },
          open: async (u: string, axeSource: string) => {
            url = u;
            seen.urls.push(u);
            seen.injected.push(axeSource);
            onOpen?.(u);
            await Promise.resolve();
          },
          setTheme: async (t: string) => {
            theme = t;
            seen.themes.push(t);
            await Promise.resolve();
          },
          runAxe: async (tags: readonly string[]) => {
            seen.tags.push([...tags]);
            return await Promise.resolve(resultFor(url, theme, steps));
          },
        });
      },
    });
}

describe('the audit loop', () => {
  it('checks every page in both themes, in as many tabs as asked, and says so in the summary', async () => {
    const seen = blank();
    const { r } = await withCtx(async (ctx) => await audit(ctx, '/d', ['/d/index.html', '/d/a/b.html', '/d/c.html'], 'AXE', fakeBrowser(seen, clean), 2));
    expect(seen.urls.map((u) => u.replace('file://', '')).sort()).toEqual(['/d/a/b.html', '/d/c.html', '/d/index.html']);
    expect(seen.themes.filter((t) => t === 'light')).toHaveLength(3);
    expect(seen.themes.filter((t) => t === 'dark')).toHaveLength(3);
    expect(seen.injected).toEqual(['AXE', 'AXE', 'AXE']);
    expect(seen.tabs).toBe(2);
    for (const tags of seen.tags) expect(tags).toEqual(TAGS);
    expect(r).toBe('[site-axe] 3 page(s) × 2 theme(s) clean against wcag2a/wcag2aa/wcag21a/wcag21aa in Chromium at 1600px (0 result(s) for a person to judge, 0 waived)');
  });

  it('opens no more tabs than there are pages', async () => {
    const seen = blank();
    await withCtx(async (ctx) => await audit(ctx, '/d', ['/d/a.html'], '', fakeBrowser(seen, clean)));
    expect(seen.tabs).toBe(1);
  });

  it('reports a violation once per theme it fires in, naming the page, the rule and the theme, in page order', async () => {
    const seen = blank();
    const { err } = await withCtx(
      async (ctx) =>
        await audit(
          ctx,
          '/d',
          ['/d/b.html', '/d/a.html'],
          '',
          fakeBrowser(seen, (_u, theme) => ({ violations: theme === 'dark' ? [violation('color-contrast', 1)] : [], incomplete: [] })),
          2,
        ),
    );
    expect(err).toEqual([
      '[site-axe] FAIL site/dist/a.html: color-contrast [dark, serious]: color-contrast help at `#n0` — reason 0 — https://example.invalid/color-contrast',
      '[site-axe] FAIL site/dist/b.html: color-contrast [dark, serious]: color-contrast help at `#n0` — reason 0 — https://example.invalid/color-contrast',
    ]);
  });

  it('counts what axe wants a person to judge, never failing on it', async () => {
    const seen = blank();
    const { r, err } = await withCtx(
      async (ctx) => await audit(ctx, '/d', ['/d/a.html'], '', fakeBrowser(seen, () => ({ violations: [], incomplete: [{ id: 'x' }, { id: 'y' }] }))),
    );
    expect(r).toContain('4 result(s) for a person to judge');
    expect(err).toEqual([]);
  });

  it('names the install command when the browser will not start, keeping the browser’s own first line', async () => {
    const { r, err } = await withCtx(
      async (ctx) =>
        await audit(ctx, '/d', ['/d/a.html'], '', () => {
          throw new Error('Executable does not exist at /nowhere/headless_shell\nmore');
        }),
    );
    expect(r).toBe('');
    expect(err).toEqual([`[site-axe] FAIL: could not launch Chromium — run ${INSTALL}. (Executable does not exist at /nowhere/headless_shell)`]);
  });

  it('closes the browser when a page throws, and lets the failure through', async () => {
    const seen = blank();
    await expect(
      withCtx(
        async (ctx) =>
          await audit(
            ctx,
            '/d',
            ['/d/a.html'],
            '',
            fakeBrowser(seen, clean, () => {
              throw new Error('navigation timeout');
            }),
          ),
      ),
    ).rejects.toThrow('navigation timeout');
    expect(seen.closed).toBe(1);
  });
});

describe('the states pass', () => {
  it('ships four states: the search dialog open, the phone drawer open, and the page at rest at 390px and 800px', () => {
    expect(STATES.map((s) => `${s.name}|${s.viewport.width}|${s.act}`)).toEqual([
      'search open|1600|search',
      'menu open at 390px|390|menu',
      'at rest at 390px|390|none',
      'at rest at 800px|800|none',
    ]);
    expect(STATE_QUERY).toBe('circuit breaker');
  });

  it('ships no state waiver, so a violation in the search dialog or the drawer is reported', async () => {
    expect([...STATE_WAIVERS]).toEqual([]);
    const seen = blank();
    const { err } = await withCtx(
      async (ctx) =>
        await auditStates(
          ctx,
          '/d',
          ['/d/index.html'],
          '',
          fakeBrowser(seen, (_u, theme, steps) => ({
            violations: theme === 'light' && steps.some((st) => st === 'menu' || st.startsWith('search')) ? [violation('nested-interactive', 1)] : [],
            incomplete: [],
          })),
        ),
    );
    expect(err).toHaveLength(2);
    expect(err[0]).toContain('nested-interactive [light, search open');
    expect(err[1]).toContain('nested-interactive [light, menu open at 390px');
  });

  it('picks the home page and the first pattern page, and leaves out what the build does not have', () => {
    const files = ['/d/404.html', '/d/index.html', '/d/patterns/a/b/one.html', '/d/patterns/a/b/two.html'];
    expect(statePages('/d', files)).toEqual(['/d/index.html', '/d/patterns/a/b/one.html']);
    expect(statePages('/d', ['/d/index.html'])).toEqual(['/d/index.html']);
    expect(statePages('/d', ['/d/hazards/x.html'])).toEqual([]);
  });

  it('checks every state of every page in both themes, acting only as the state says, on a fresh load each time', async () => {
    const seen = blank();
    const { r, err } = await withCtx(async (ctx) => await auditStates(ctx, '/d', ['/d/index.html', '/d/patterns/p.html'], 'AXE', fakeBrowser(seen, clean)));
    expect(err).toEqual([]);
    expect(r.checked).toBe(2 * STATES.length * THEMES.length);
    expect(seen.urls).toHaveLength(r.checked);
    expect(seen.themes).toHaveLength(r.checked);
    expect(seen.injected.every((a) => a === 'AXE')).toBe(true);
    // One page's run: the viewport of each state, with its one action after it.
    expect(seen.steps.slice(0, 8)).toEqual([
      'viewport 1600x900',
      'search circuit breaker',
      'viewport 1600x900',
      'search circuit breaker',
      'viewport 390x844',
      'menu',
      'viewport 390x844',
      'menu',
    ]);
    expect(seen.steps.filter((s) => s === 'viewport 800x1024')).toHaveLength(2 * 2);
    expect(seen.closed).toBe(1);
  });

  it('names the state and the theme in each finding, once per run it fires in', async () => {
    const seen = blank();
    const { err } = await withCtx(
      async (ctx) =>
        await auditStates(
          ctx,
          '/d',
          ['/d/index.html'],
          '',
          fakeBrowser(seen, (_u, theme, steps) => ({ violations: theme === 'dark' && steps.includes('menu') ? [violation('color-contrast', 1)] : [], incomplete: [{ id: 'q' }] })),
        ),
    );
    expect(err).toEqual([
      '[site-axe] FAIL site/dist/index.html: color-contrast [dark, menu open at 390px, serious]: color-contrast help at `#n0` — reason 0 — https://example.invalid/color-contrast',
    ]);
  });

  it('leaves out the states a page has no control for, and runs the ones at rest', async () => {
    const seen = { ...blank(), noControls: true };
    const { r, err } = await withCtx(async (ctx) => await auditStates(ctx, '/d', ['/d/index.html'], '', fakeBrowser(seen, clean)));
    expect(err).toEqual([]);
    expect(r).toMatchObject({ checked: 2 * THEMES.length, skipped: 2 * THEMES.length });
  });

  it('counts what axe wants a person to judge, and opens no browser when there is no state page', async () => {
    const seen = blank();
    const some = await withCtx(async (ctx) => await auditStates(ctx, '/d', ['/d/index.html'], '', fakeBrowser(seen, () => ({ violations: [], incomplete: [{ id: 'x' }] }))));
    expect(some.r.incomplete).toBe(STATES.length * THEMES.length);
    const none = blank();
    const empty = await withCtx(async (ctx) => await auditStates(ctx, '/d', [], '', fakeBrowser(none, clean)));
    expect(empty.r).toEqual({ checked: 0, skipped: 0, incomplete: 0 });
    expect(none.tabs).toBe(0);
  });

  it('names the install command when the browser will not start, and closes it when a state throws', async () => {
    const { err } = await withCtx(async (ctx) =>
      await auditStates(ctx, '/d', ['/d/index.html'], '', () => {
        throw new Error('Executable does not exist\nmore');
      }),
    );
    expect(err).toEqual([`[site-axe] FAIL: could not launch Chromium — run ${INSTALL}. (Executable does not exist)`]);
    const seen = blank();
    await expect(
      withCtx(async (ctx) =>
        await auditStates(ctx, '/d', ['/d/index.html'], '', fakeBrowser(seen, clean, () => {
          throw new Error('navigation timeout');
        })),
      ),
    ).rejects.toThrow('navigation timeout');
    expect(seen.closed).toBe(1);
  });

  it('runs inside the gate on the state pages the build holds, and puts the second pass in the summary', async () => {
    sb.write('site/dist/index.html', CLEAN);
    sb.write('site/dist/patterns/x/y/p.html', CLEAN);
    sb.write('site/dist/hazards/h.html', CLEAN);
    const seen = blank();
    const { r } = await withCtx(async (ctx) => await run(ctx, fakeBrowser(seen, clean), true));
    expect(r).toContain('3 page(s) × 2 theme(s) clean');
    expect(r).toContain('; 16 page state(s) (search open, menu open at 390px, at rest at 390px, at rest at 800px) checked in both themes, 0 left out for want of the control (0 result(s) for a person to judge, 0 waived)');
  });
});

describe('the gate end to end', () => {
  it('asks for a build when there is no built site, or no page in it', async () => {
    expectFail(await sb.run(spec), 'no built site at site/dist — build it first: make site-build');
    sb.write('site/dist/index.json', '{}');
    expectFail(await sb.run(spec), 'no .html files under site/dist');
  });

  it('exits 2 on any argument', async () => {
    expectMisuse(await sb.run(spec, ['--nope']));
  });

  it('with no browser installed, opens no page, prints the skip and the install command, and exits 0', async () => {
    sb.write('site/dist/bad.html', BROKEN);
    const seen = blank();
    const { r, err } = await withCtx(async (ctx) => await run(ctx, fakeBrowser(seen, clean), false));
    expect(r).toBe(`[site-axe] skipped: no Chromium installed, so no page was opened — run ${INSTALL}, then this gate`);
    expect(err).toEqual([]);
    expect(seen.urls).toEqual([]);
  });

  it('with no browser and KB_REQUIRE_BROWSER set, fails naming the install command and opens no page', async () => {
    sb.write('site/dist/ok.html', CLEAN);
    const seen = blank();
    const { r, err } = await withCtx(async (ctx) => await run(ctx, fakeBrowser(seen, clean), false, true));
    expect(r).toBe('');
    expect(err).toEqual([`[site-axe] FAIL: no Chromium installed and ${REQUIRE_BROWSER}=1 — run ${INSTALL}, then this gate`]);
    expect(seen.urls).toEqual([]);
  });

  it('reads the installed axe-core and hands it to the audit', async () => {
    sb.write('site/dist/a.html', CLEAN);
    const seen = blank();
    await withCtx(async (ctx) => await run(ctx, fakeBrowser(seen, clean), true));
    expect(seen.injected[0]).toContain('axe');
    expect((seen.injected[0] as string).length).toBeGreaterThan(100_000);
  });

  it('asks the browser build where Chromium lives, and says no when the answer is missing or throws', () => {
    expect(browserInstalled(() => '/nowhere/chrome')).toBe(false);
    expect(
      browserInstalled(() => {
        throw new Error('no build for this platform');
      }),
    ).toBe(false);
    expect(browserInstalled(() => process.execPath)).toBe(true);
  });

  // The browser leg, where `make site-deps` has installed Chromium.
  it.runIf(browserInstalled())(
    'in real Chromium, passes a clean page and fails a broken one in both themes',
    async () => {
      sb.write('site/dist/ok.html', CLEAN);
      const ok = await withCtx(async (ctx) => await run(ctx, launchChromium, true));
      expect(ok.err).toEqual([]);
      expect(ok.r).toContain('1 page(s) × 2 theme(s) clean');

      sb.write('site/dist/bad.html', BROKEN);
      const bad = await sb.run(spec);
      expectFail(bad);
      const lines = bad.err.split('\n');
      expect(lines.filter((l) => l.startsWith('[site-axe] FAIL site/dist/bad.html: image-alt ['))).toHaveLength(2);
      expect(lines.some((l) => l.includes('image-alt [light,'))).toBe(true);
      expect(lines.some((l) => l.includes('image-alt [dark,'))).toBe(true);
      sb.rm('site/dist/bad.html');
      expectPass(await sb.run(spec));
    },
    120_000,
  );

  // The adapter's three state verbs, on a page that has the controls they reach for.
  it.runIf(browserInstalled())(
    'in real Chromium, opens the search dialog and the menu drawer the way the real controls do, and checks both',
    async () => {
      sb.write(
        'site/dist/index.html',
        `<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>t</h1>
<button id="s">Search this site</button><button id="m">Menu</button><div id="menu-state" data-kb-menu-open="false"></div>
<dialog aria-label="Search this site" id="d"><input role="combobox" aria-label="Query" aria-expanded="true" aria-controls="r"><div role="listbox" id="r" aria-label="Results"></div></dialog></main>
<script>
document.getElementById('s').onclick = () => document.getElementById('d').showModal();
document.querySelector('input').oninput = (e) => { document.getElementById('r').innerHTML = e.target.value ? '<div role="option" aria-selected="true">hit</div>' : ''; };
document.getElementById('m').onclick = () => document.getElementById('menu-state').setAttribute('data-kb-menu-open', 'true');
</script></body></html>`,
      );
      const ok = await withCtx(async (ctx) => await run(ctx, launchChromium, true));
      expect(ok.err).toEqual([]);
      expect(ok.r).toContain('8 page state(s)');
    },
    120_000,
  );
});
