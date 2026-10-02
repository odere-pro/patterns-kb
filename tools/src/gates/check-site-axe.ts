/**
 * The browser half of the accessibility floor (spec kb.noise.accessibility,
 * browser-floor): what only a rendered page answers, contrast above all.
 *
 * check-site-a11y.ts reads the built markup as text and can only ask what text
 * answers. This gate opens every page of site/dist from disk (`file://`, the
 * way the site is built to be read) in headless Chromium, once per theme, and
 * runs axe-core at WCAG 2.1 A and AA. Each unwaived violation is a finding
 * naming the page, the rule, the theme, the first failing node and the help
 * link, once per theme it fires in (accessibility-C6).
 *
 *   - Both themes, one width. A contrast failure belongs to a palette, and the
 *     site has two; `data-theme` on `<html>` is the one attribute Starlight's
 *     pre-paint script sets, so flipping it is the whole of "the other theme".
 *     The width is the narrowest round one at which no navigation is hidden
 *     (VIEWPORT): axe skips what is hidden.
 *   - A second pass on states a page rests in only some of the time: the home page and one
 *     pattern page with the search dialog open and a query typed, with the phone menu
 *     drawer open at 390px, and at rest at 390px and 800px (STATES). The first pass sees
 *     a closed dialog and a pinned sidebar, so a contrast failure inside the dialog or the
 *     drawer, or a layout that only exists at a narrower width, would pass it. Each state
 *     is a finding line of its own, named like a theme: `[dark, search open, serious]`.
 *   - Violations only. axe's incomplete results are questions for a person;
 *     they are counted in the summary, never failed (accessibility-C7).
 *   - The waiver list names one rule on one page with its reason. It ships
 *     empty.
 *
 * With no browser installed it opens no page, prints the skip with the command
 * that installs one, and exits 0 (accessibility-C8), unless KB_REQUIRE_BROWSER=1
 * is set (CI's site job sets it): then the missing browser is a finding. It
 * runs in `make site-build` and CI's site job, never in `make validate`.
 *
 * Usage: check-site-axe   (no arguments; reads site/dist; needs make site-deps)
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright-core';

import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { browserRequired, REQUIRE_BROWSER } from '../lib/require-browser.js';
import { DIST } from '../site/site-output.js';

/** The rule set: WCAG 2.1 A and AA, the level the site claims, and nothing else. */
export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** The themes every page is checked in: Starlight's own `data-theme` values. */
export const THEMES = ['light', 'dark'] as const;

/**
 * One desktop viewport. site/src/styles/layout.css hides the sidebar in a
 * drawer below 97.5rem (1560px) and the reading rail below 72rem, so the
 * width sits above both; axe would skip whatever the layout hid.
 */
export const VIEWPORT = { width: 1600, height: 900 };

/** Pages checked at once, each in its own browser tab. */
export const TABS = Math.max(1, Math.min(4, os.availableParallelism() - 1));

/**
 * `page path under site/dist` → the rule ids waived there. Each entry is a
 * named debt with its reason in the change that adds it. Empty.
 */
export const WAIVERS: ReadonlyMap<string, ReadonlySet<string>> = new Map();

/** The query typed into the search dialog before its state is checked. */
export const STATE_QUERY = 'circuit breaker';

/** A viewport the second pass sets before it acts. */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * The states checked on top of a page at rest in VIEWPORT. `act` names the one
 * thing done to the page after it is loaded at `viewport`; the finding line
 * carries `name`.
 */
export interface State {
  name: string;
  viewport: Viewport;
  act: 'none' | 'search' | 'menu';
}

export const STATES: readonly State[] = [
  { name: 'search open', viewport: VIEWPORT, act: 'search' },
  { name: 'menu open at 390px', viewport: { width: 390, height: 844 }, act: 'menu' },
  { name: 'at rest at 390px', viewport: { width: 390, height: 844 }, act: 'none' },
  { name: 'at rest at 800px', viewport: { width: 800, height: 1024 }, act: 'none' },
];

/**
 * `state name` → the rule ids waived in that state on every page. Each entry is
 * a named debt, with its reason here. Empty: the search result's link is the
 * option itself (site/src/components/Search/search.client.ts), so no control
 * sits inside another and the one waiver this list held is gone.
 */
export const STATE_WAIVERS: ReadonlyMap<string, ReadonlySet<string>> = new Map();

/** The command that installs the browser this gate needs. */
export const INSTALL = 'make site-deps';

/** The shape axe returns, narrowed to what a finding is written from. */
export interface AxeViolation {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  nodes: { target: unknown[]; failureSummary?: string }[];
}

export interface AxeResult {
  violations: AxeViolation[];
  incomplete: { id: string }[];
}

/** Every `.html` file under a folder, sorted, depth first. */
export function htmlPages(dir: string): string[] {
  const out: string[] = [];
  const walk = (at: string): void => {
    for (const name of fs.readdirSync(at).sort()) {
      const p = path.join(at, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.html')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/**
 * One violation as a finding: the rule, the theme, the first failing node and
 * how many more, why it fails, and the help link last, where it is easy to copy.
 */
export function describe(v: AxeViolation, theme: string): string {
  const first = v.nodes[0];
  const more = v.nodes.length > 1 ? ` (+${v.nodes.length - 1} more)` : '';
  const where = first === undefined ? '' : ` at \`${first.target.map(String).join(' ')}\`${more}`;
  const why = (first?.failureSummary ?? '').split('\n').slice(1).join(' ').replace(/\s+/g, ' ').trim();
  return `${v.id} [${theme}, ${v.impact ?? 'unrated'}]: ${v.help}${where}${why === '' ? '' : ` — ${why}`} — ${v.helpUrl}`;
}

/** Violations left once a page's waivers are applied. */
export function unwaived(violations: readonly AxeViolation[], waived: ReadonlySet<string>): AxeViolation[] {
  return violations.filter((v) => !waived.has(v.id));
}

/** The browser, behind the three verbs the audit needs, so the audit runs on a fake. */
export interface AxePage {
  open(url: string, axeSource: string): Promise<void>;
  setTheme(theme: string): Promise<void>;
  runAxe(tags: readonly string[]): Promise<AxeResult>;
  /** Resize the window the page is laid out in. */
  setViewport(viewport: Viewport): Promise<void>;
  /**
   * Open the search dialog from the header button and type `query` until results show.
   * False, with nothing done, when the page has no such button: a page that offers no
   * search has no search state to check, and whether every page offers one is the
   * reader flows' question.
   */
  openSearch(query: string): Promise<boolean>;
  /** Open the sidebar drawer behind the phone menu button; false when the page has none. */
  openMenu(): Promise<boolean>;
}

export interface AxeBrowser {
  newPage(viewport: { width: number; height: number }): Promise<AxePage>;
  close(): Promise<void>;
}

export type LaunchBrowser = () => Promise<AxeBrowser>;

/**
 * Run the floor over every page in both themes, `tabs` pages at a time, and
 * return the summary. A launch failure is its own finding, naming the install
 * command, since the browser's own message names neither.
 */
export async function audit(
  ctx: GateContext,
  dist: string,
  pages: readonly string[],
  axeSource: string,
  launch: LaunchBrowser,
  tabs = TABS,
): Promise<string> {
  let browser: AxeBrowser;
  try {
    browser = await launch();
  } catch (err) {
    ctx.failLine(`could not launch Chromium — run ${INSTALL}. (${(err as Error).message.split('\n')[0] as string})`);
    return '';
  }

  let incomplete = 0;
  const found: [string, string][] = [];
  try {
    const queue = [...pages];
    const worker = async (): Promise<void> => {
      const tab = await browser.newPage(VIEWPORT);
      for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
        const rel = path.relative(dist, file).split(path.sep).join('/');
        const waived = WAIVERS.get(rel) ?? new Set<string>();
        await tab.open(pathToFileURL(file).href, axeSource);
        for (const theme of THEMES) {
          await tab.setTheme(theme);
          const result = await tab.runAxe(TAGS);
          incomplete += result.incomplete.length;
          for (const v of unwaived(result.violations, waived)) found.push([`${DIST}/${rel}`, describe(v, theme)]);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(tabs, pages.length) }, worker));
  } finally {
    await browser.close();
  }
  // Tabs finish in any order; findings print in page order.
  found.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  for (const [file, what] of found) ctx.fail(file, what);

  const waivedCount = [...WAIVERS.values()].reduce((n, s) => n + s.size, 0);
  return (
    `[site-axe] ${pages.length} page(s) × ${THEMES.length} theme(s) clean against ${TAGS.join('/')} ` +
    `in Chromium at ${VIEWPORT.width}px (${incomplete} result(s) for a person to judge, ${waivedCount} waived)`
  );
}

/**
 * The pages the second pass checks, from the pages found: the home page, and
 * the first page under `patterns/` (the pages with the most to look at: a
 * diagram, cards, a sketch). Either is left out when the build has none.
 */
export function statePages(dist: string, pages: readonly string[]): string[] {
  const rel = (f: string): string => path.relative(dist, f).split(path.sep).join('/');
  const home = pages.find((f) => rel(f) === 'index.html');
  const pattern = pages.find((f) => rel(f).startsWith('patterns/'));
  return [home, pattern].filter((f): f is string => f !== undefined);
}

/**
 * Run the floor on each state of each state page, in both themes, in one tab.
 * Returns how many page states were checked and how many were left out because the
 * page has no control to reach them; findings are written to `ctx`.
 */
export async function auditStates(
  ctx: GateContext,
  dist: string,
  pages: readonly string[],
  axeSource: string,
  launch: LaunchBrowser,
): Promise<{ checked: number; skipped: number; incomplete: number }> {
  if (pages.length === 0) return { checked: 0, skipped: 0, incomplete: 0 };
  let browser: AxeBrowser;
  try {
    browser = await launch();
  } catch (err) {
    ctx.failLine(`could not launch Chromium — run ${INSTALL}. (${(err as Error).message.split('\n')[0] as string})`);
    return { checked: 0, skipped: 0, incomplete: 0 };
  }
  let checked = 0;
  let skipped = 0;
  let incomplete = 0;
  const found: [string, string][] = [];
  try {
    const tab = await browser.newPage(VIEWPORT);
    for (const file of pages) {
      const rel = path.relative(dist, file).split(path.sep).join('/');
      for (const state of STATES) {
        const waived = new Set([...(WAIVERS.get(rel) ?? []), ...(STATE_WAIVERS.get(state.name) ?? [])]);
        for (const theme of THEMES) {
          // A fresh load per run: the state a run leaves behind (an open dialog, a drawer) is never the next one's start.
          await tab.setViewport(state.viewport);
          await tab.open(pathToFileURL(file).href, axeSource);
          const reached = state.act === 'search' ? await tab.openSearch(STATE_QUERY) : state.act === 'menu' ? await tab.openMenu() : true;
          if (!reached) {
            skipped += 1;
            continue;
          }
          await tab.setTheme(theme);
          const result = await tab.runAxe(TAGS);
          checked += 1;
          incomplete += result.incomplete.length;
          for (const v of unwaived(result.violations, waived)) found.push([`${DIST}/${rel}`, describe(v, `${theme}, ${state.name}`)]);
        }
      }
    }
  } finally {
    await browser.close();
  }
  for (const [file, what] of found) ctx.fail(file, what);
  return { checked, skipped, incomplete };
}

/** What the browser-side callbacks reach for, described locally: tools/ has no DOM types. */
interface InPage {
  document: { documentElement: { dataset: Record<string, string> } };
  axe: { run(context: unknown, options: unknown): Promise<AxeResult> };
}

/** The adapter: Playwright in, the three verbs out. The one part that needs a real browser. */
export const launchChromium: LaunchBrowser = async () => {
  const browser = await chromium.launch();
  return {
    close: async () => {
      await browser.close();
    },
    newPage: async (viewport) => {
      const page = await browser.newPage({ viewport });
      return {
        open: async (url, axeSource) => {
          await page.goto(url, { waitUntil: 'load' });
          await page.addScriptTag({ content: axeSource });
        },
        setTheme: async (theme) => {
          await page.evaluate((t) => {
            (globalThis as unknown as InPage).document.documentElement.dataset['theme'] = t;
          }, theme);
        },
        setViewport: async (v) => {
          await page.setViewportSize(v);
        },
        openSearch: async (query) => {
          const opener = page.getByRole('button', { name: 'Search this site' }).first();
          if ((await opener.count()) === 0) return false;
          await opener.click();
          const dialog = page.getByRole('dialog', { name: 'Search this site' });
          await dialog.getByRole('combobox').fill(query);
          // Rows, or the line that says nothing matched: a small site may have no page for the query.
          await dialog.getByRole('option').or(dialog.getByRole('status').filter({ hasText: 'Nothing matched' })).first().waitFor();
          return true;
        },
        openMenu: async () => {
          const menu = page.getByRole('button', { name: 'Menu' });
          if ((await menu.count()) === 0) return false;
          await menu.click();
          await page.locator('[data-kb-menu-open="true"]').waitFor({ state: 'attached' });
          return true;
        },
        runAxe: async (tags) =>
          await page.evaluate(
            async (t) =>
              await (globalThis as unknown as InPage).axe.run((globalThis as unknown as InPage).document, {
                runOnly: { type: 'tag', values: t },
                resultTypes: ['violations'],
              }),
            [...tags],
          ),
      };
    },
  };
};

/** Whether the Chromium this Playwright build expects is on disk. */
export function browserInstalled(executable: () => string = () => chromium.executablePath()): boolean {
  try {
    return fs.existsSync(executable());
  } catch {
    return false;
  }
}

/** The whole run, with the browser, its presence and whether one is required passed in. */
export async function run(ctx: GateContext, launch: LaunchBrowser, installed: boolean, required = false): Promise<string> {
  const dist = path.join(ctx.root, DIST);
  if (!fs.existsSync(dist)) {
    ctx.failLine(`no built site at ${DIST} — build it first: make site-build`);
    return '';
  }
  const pages = htmlPages(dist);
  if (pages.length === 0) {
    ctx.failLine(`no .html files under ${DIST} — build it first: make site-build`);
    return '';
  }
  if (!installed && required) {
    ctx.failLine(`no Chromium installed and ${REQUIRE_BROWSER}=1 — run ${INSTALL}, then this gate`);
    return '';
  }
  if (!installed) {
    return `[site-axe] skipped: no Chromium installed, so no page was opened — run ${INSTALL}, then this gate`;
  }
  // axe-core ships as one classic script to inject into the page under test.
  const axeSource = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
  const summary = await audit(ctx, dist, pages, axeSource, launch);
  // An empty summary is a launch failure, already a finding; a second launch would only repeat it.
  if (summary === '') return summary;
  const states = await auditStates(ctx, dist, statePages(dist, pages), axeSource, launch);
  return `${summary}; ${states.checked} page state(s) (${STATES.map((s) => s.name).join(', ')}) checked in both themes, ${states.skipped} left out for want of the control (${states.incomplete} result(s) for a person to judge, ${[...STATE_WAIVERS.values()].reduce((n, w) => n + w.size, 0)} waived)`;
}

export const spec: GateSpec = {
  name: 'site-axe',
  usage: 'usage: check-site-axe   (no arguments; reads site/dist; needs make site-deps)',
  async run(ctx: GateContext): Promise<string> {
    return await run(ctx, launchChromium, browserInstalled(), browserRequired());
  },
};

main(spec, import.meta.url);
