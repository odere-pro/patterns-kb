/**
 * Photograph the built site, so a visual audit is something a person repeats
 * rather than something done once (spec kb.noise, the site-audit skill's
 * evidence). Not a gate: a screenshot has no expectation to compare against
 * without a baseline, and a baseline of PNGs in git turns red on every font
 * change until nobody looks. What a person needs is the whole matrix in one
 * command, so looking is cheap and can be done again on the next change.
 *
 * The matrix: seven pages, six templates × four
 * widths × both themes, into a folder you name outside the repository.
 *
 *     make site-shots OUT=/tmp/kb-shots
 *
 * Themes are set by writing `data-theme` on `<html>`, the one attribute
 * Starlight's pre-paint script sets and the theme toggle cycles, so what is
 * photographed is what a reader who picked that theme sees.
 *
 * Usage: site-shots --out <dir>   (needs a built site/dist and make site-deps)
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright-core';

import { main, UsageError, type GateContext, type GateSpec } from './lib/gate.js';
import { DIST } from './site/site-output.js';

/**
 * The pages worth looking at, one per layout and one for each look inside the
 * pattern layout that differs enough to break on its own: a further page is
 * another instance of one of these until the site grows a new shape.
 * `template` names the layout the page renders through; the test holds every
 * pick to a page the structure file lists and the set to at least five
 * distinct templates.
 */
export const PAGES: readonly { name: string; route: string; template: string; why: string }[] = [
  { name: 'home', route: 'index.html', template: 'splash', why: 'the splash template, the one page with no sidebar' },
  { name: 'hub', route: 'patterns/caching.html', template: 'hub', why: 'an area hub: its cards and facets at every width' },
  {
    name: 'page',
    route: 'patterns/distributed/resilience/circuit-breaker.html',
    template: 'pattern',
    why: 'a deep page with diagrams, code and a full right rail',
  },
  {
    name: 'polarity',
    route: 'patterns/gof/creational/singleton.html',
    template: 'pattern',
    why: 'a pattern page whose pros and cons sit in two-column polarity cards that stack on a phone',
  },
  {
    name: 'design',
    route: 'designs/bitly.html',
    template: 'design',
    why: 'a case study: the requirements, the board diagram and the deep dives in one long reading column',
  },
  {
    name: 'comparison',
    route: 'comparisons/object-stores.html',
    template: 'comparison',
    why: 'a wide table that scrolls inside its column',
  },
  {
    name: 'stack',
    route: 'map/stack.html',
    template: 'map',
    why: 'the pattern-to-product index: wide tables under band headings',
  },
];

/**
 * One width inside each band that matters in site/src/styles/layout.css: the
 * content pad widens at 50rem (800px), and the sidebar leaves its drawer and pins
 * beside the reading rail at 76rem (1216px). The 64px between the rail's
 * appearance at 72rem and that pin has no width of its own. A width chosen at a
 * device size instead can photograph one layout twice and another not at all.
 */
export const WIDTHS: readonly { name: string; width: number; height: number }[] = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 900, height: 1024 },
  { name: 'laptop', width: 1280, height: 900 },
  { name: 'desktop', width: 1600, height: 900 },
];

export const THEMES = ['light', 'dark'] as const;

/** The filename for one cell of the matrix. Sorts by width, then page, then theme. */
export const shotName = (width: string, page: string, theme: string): string =>
  `${width}-${page}-${theme}.png`;

/** Every filename this run will write, in the order it writes them. */
export function matrix(): string[] {
  return WIDTHS.flatMap((w) =>
    PAGES.flatMap((p) => THEMES.map((t) => shotName(w.name, p.name, t))),
  );
}

/**
 * Just enough of Playwright's surface for the loop below, so a test hands it a
 * fake: what is worth testing is the order — one tab per width, the theme set
 * before the shutter, the count matching what landed, the tab closed per width
 * and the browser closed even when a shot throws.
 */
export interface ShotPage {
  goto(url: string, opts: { waitUntil: 'load' }): Promise<unknown>;
  evaluate(fn: (t: string) => void, arg: string): Promise<unknown>;
  screenshot(opts: { path: string }): Promise<unknown>;
  close(): Promise<unknown>;
}

export interface ShotBrowser {
  newPage(opts: { viewport: { width: number; height: number } }): Promise<ShotPage>;
  close(): Promise<unknown>;
}

export type Launch = () => Promise<ShotBrowser>;

/** Photograph the whole matrix into `target`, and return how many shots landed. */
export async function shoot(dist: string, target: string, launch: Launch): Promise<number> {
  const browser = await launch();
  let written = 0;
  try {
    for (const w of WIDTHS) {
      // One tab per width, never a resize between shots: a resize re-runs
      // every media query and can catch a layout mid-transition.
      const page = await browser.newPage({ viewport: { width: w.width, height: w.height } });
      for (const p of PAGES) {
        await page.goto(pathToFileURL(path.join(dist, p.route)).href, { waitUntil: 'load' });
        for (const theme of THEMES) {
          await page.evaluate((t) => {
            (
              globalThis as unknown as {
                document: { documentElement: { dataset: Record<string, string> } };
              }
            ).document.documentElement.dataset.theme = t;
          }, theme);
          await page.screenshot({
            path: path.join(target, shotName(w.name, p.name, theme)),
          });
          written += 1;
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return written;
}

/** The whole run, with the browser passed in: the guards, then the matrix. */
export async function shots(ctx: GateContext, launch: Launch): Promise<string> {
  const out = ctx.options.get('--out');
  if (out === undefined) throw new UsageError('--out is required — say where the images go');
  const dist = path.join(ctx.root, DIST);
  if (!fs.existsSync(dist)) {
    throw new UsageError(`${DIST} does not exist — build the site first: make site-build`);
  }
  // Never inside the repository: that keeps megabytes of PNG out of a commit.
  // Judged on the resolved path, so `--out ../shots` is judged by where it lands.
  const target = path.resolve(out);
  if (!path.relative(ctx.root, target).startsWith('..')) {
    throw new UsageError(
      `${target} is inside the repository — screenshots are evidence for a record, not a committed ` +
        'baseline. Write them somewhere else (make site-shots OUT=/tmp/kb-shots)',
    );
  }
  fs.mkdirSync(target, { recursive: true });
  const written = await shoot(dist, target, launch);
  return `[site-shots] wrote ${written} screenshot(s) to ${target} — ${PAGES.length} page(s) × ${WIDTHS.length} width(s) × ${THEMES.length} theme(s)`;
}

export const spec: GateSpec = {
  name: 'site-shots',
  usage: 'usage: site-shots --out <dir>   (needs a built site/dist and make site-deps)',
  options: ['--out'],
  async run(ctx: GateContext): Promise<string> {
    return await shots(ctx, async () => await chromium.launch());
  },
};

main(spec, import.meta.url);
