/**
 * Reading one page: the theme it is painted in, its diagrams, code sketches
 * and copy buttons, and the keyboard path through it.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { Page } from '@playwright/test';

import { DIST, expect, site, test } from './fixtures.js';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/** The subset of the page's globals the in-page callbacks below touch; tools/ has no DOM types. */
interface InPage {
  document: {
    documentElement: { dataset: Record<string, string> };
    activeElement: unknown;
  };
  getComputedStyle(el: unknown): { outlineStyle: string; outlineWidth: string; boxShadow: string };
  axe: { run(ctx: unknown, opts: unknown): Promise<{ violations: { id: string; nodes: { target: unknown[] }[] }[] }> };
}

test('view-source', async ({ page, kb }) => {
  const { route, title } = site.walk.page;
  const source = fs.readFileSync(path.join(DIST, route.replace(/\.html$/, '.md')), 'utf8');
  const frontmatterTitle = source.split('\n').find((line) => line.startsWith('title:'));
  const h1 = source.split('\n').find((line) => line.startsWith('# '));
  expect(frontmatterTitle, `${route}: its markdown names a title`).toBeDefined();
  expect(h1, `${route}: its markdown opens with an H1`).toBe(`# ${title}`);

  await kb.visit(route);
  await page.getByRole('link', { name: 'View source' }).click();

  // The browser shows the markdown as text, from disk and from the server alike.
  await expect(page).toHaveURL(/\.md$/);
  const shown = await page.locator('body').innerText();
  expect(shown).toContain(frontmatterTitle as string);
  expect(shown).toContain(h1 as string);
});

async function contrast(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(
    async () =>
      await (globalThis as unknown as InPage).axe.run((globalThis as unknown as InPage).document, {
        runOnly: { type: 'rule', values: ['color-contrast'] },
        resultTypes: ['violations'],
      }),
  );
  return result.violations.flatMap((v) => v.nodes.map((n) => `${v.id} at ${n.target.map(String).join(' ')}`));
}

test('theme', { tag: '@tablet' }, async ({ page, kb }) => {
  await kb.visit(site.figure.route);
  const theme = (): Promise<string | undefined> =>
    page.evaluate(() => (globalThis as unknown as InPage).document.documentElement.dataset['theme']);

  for (const want of ['dark', 'light'] as const) {
    await kb.pickTheme(want);
    expect(await theme()).toBe(want);
    await page.reload();
    expect(await theme(), `${want} survives a reload`).toBe(want);
    if (kb.phone) await kb.openNav();
    await expect(page.getByRole('button', { name: new RegExp(`^Theme: ${want}`) })).toBeVisible();
    if (kb.phone) await page.reload();
    expect(await contrast(page), `colour contrast in the ${want} theme`).toEqual([]);
  }
});

/** Records the theme the page wears when the document is parsed: before any script that loads later can repaint it. */
const recordFirstTheme = (): void => {
  const g = globalThis as unknown as {
    document: { addEventListener(t: string, f: () => void): void; documentElement: { dataset: Record<string, string> } };
    kbFirstTheme?: string | undefined;
  };
  g.document.addEventListener('DOMContentLoaded', () => {
    g.kbFirstTheme = g.document.documentElement.dataset['theme'];
  });
};

const firstTheme = (page: Page): Promise<string | undefined> =>
  page.evaluate(() => (globalThis as unknown as { kbFirstTheme?: string }).kbFirstTheme);

const themeNow = (page: Page): Promise<string | undefined> =>
  page.evaluate(() => (globalThis as unknown as InPage).document.documentElement.dataset['theme']);

for (const scheme of ['dark', 'light'] as const) {
  test.describe(`with the OS set to ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test(`theme-first-paint: ${scheme}`, async ({ page, kb, context }) => {
      await context.addInitScript(recordFirstTheme);
      await kb.visit(site.walk.page.route);
      // No stored choice: the pre-paint script follows the OS, and the page is already in it when parsed.
      expect(await firstTheme(page), `data-theme is ${scheme} by DOMContentLoaded`).toBe(scheme);
      expect(await themeNow(page)).toBe(scheme);
      if (kb.phone) await kb.openNav();
      await expect(page.getByRole('button', { name: /^Theme: auto/ }), 'the button says the choice is still auto').toBeVisible();
    });
  });
}

test.describe('with the OS set to dark, and a choice made elsewhere', () => {
  test.use({ colorScheme: 'dark' });

  test('theme-across-tabs', async ({ page, kb, context, baseURL }) => {
    await context.addInitScript(recordFirstTheme);
    await kb.visit(site.walk.page.route);
    expect(await themeNow(page)).toBe('dark');
    await kb.pickTheme('light');
    expect(await themeNow(page)).toBe('light');

    // A second tab of the same browser reads the stored choice, not the OS, and has it before it paints.
    const other = await context.newPage();
    await other.goto(new URL(site.walk.page.route.replace(/^\//, ''), baseURL as string).href);
    expect(await firstTheme(other), 'the second tab is light by DOMContentLoaded, with no flash of dark').toBe('light');
    expect(await themeNow(other)).toBe('light');
    await other.close();
  });
});

test.describe('with storage blocked', () => {
  test.use({ colorScheme: 'dark' });

  test('theme-storage-blocked', async ({ page, kb, context }) => {
    // A browser that refuses site data throws on the first touch of `localStorage`, not on a read.
    await context.addInitScript(() => {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('Access is denied for this document.', 'SecurityError');
        },
      });
    });
    await kb.visit(site.walk.page.route);
    await expect(page.getByRole('heading', { level: 1 }), 'the page still renders').toHaveText(site.walk.page.title);
    expect(await themeNow(page), 'the page follows the OS').toBe('dark');

    // The button keeps the choice in the page itself, so it works for the page's life.
    await kb.pickTheme('light');
    expect(await themeNow(page)).toBe('light');
    await kb.pickTheme('dark');
    expect(await themeNow(page)).toBe('dark');
    await kb.pickTheme('auto');
    expect(await themeNow(page)).toBe('dark');
  });
});

test('diagram-sketch-copy', async ({ page, kb, context }) => {
  // The clipboard is the one thing a headless browser keeps from the page on
  // both protocols; the write is recorded instead, which is what the button's
  // job ends at.
  await context.addInitScript(() => {
    const g = globalThis as unknown as { navigator: { clipboard: unknown }; kbCopied?: string };
    Object.defineProperty(g.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          g.kbCopied = text;
        },
      },
    });
  });
  await kb.visit(site.figure.route);

  // The drawing is the figure's document: the toolbar's icons are SVGs too.
  const figure = page.locator('figure[data-kb-diagram]').first();
  await figure.scrollIntoViewIfNeeded();
  const svg = figure.getByRole('document').first();
  await expect(svg).toBeVisible();
  const box = await svg.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(50);
  expect(box?.height ?? 0).toBeGreaterThan(50);
  await expect(svg.locator('text, foreignObject').first()).toBeAttached();

  const sketch = page.locator('details[id^="sketch-"]').first();
  const code = sketch.locator('pre');
  await expect(code).toBeHidden();
  await sketch.locator('summary').click();
  await expect(code).toBeVisible();

  const copy = sketch.getByRole('button', { name: 'Copy to clipboard' });
  const expected = ((await copy.getAttribute('data-code')) ?? '').split(String.fromCharCode(0x7f)).join('\n');
  expect(expected.length).toBeGreaterThan(0);
  await copy.click();
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as { kbCopied?: string }).kbCopied)).toBe(expected);
});

test('keyboard', async ({ page, kb }) => {
  await kb.visit(site.walk.page.route);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  const ring = await page.evaluate(() => {
    const g = globalThis as unknown as InPage;
    const s = g.getComputedStyle(g.document.activeElement);
    return { style: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
  });
  expect(
    (ring.style !== 'none' && ring.width !== '0px') || ring.shadow !== 'none',
    `the focused skip link shows a ring (outline ${ring.style} ${ring.width}, shadow ${ring.shadow})`,
  ).toBe(true);

  // A table wider than its column sits in a focusable scroll region that moves under the arrow keys.
  let scrolled = false;
  for (const route of site.comparisons) {
    await kb.visit(route);
    const regions = page.locator('main .kb-wide:has(> table)');
    const n = await regions.count();
    for (let i = 0; i < n && !scrolled; i += 1) {
      const region = regions.nth(i);
      const wide = await region.evaluate((t) => {
        const el = t as unknown as { scrollWidth: number; clientWidth: number };
        return el.scrollWidth > el.clientWidth + 1;
      });
      if (!wide) continue;
      await expect(region).toHaveAttribute('tabindex', '0');
      await region.focus();
      await expect(region).toBeFocused();
      for (let k = 0; k < 8; k += 1) await page.keyboard.press('ArrowRight');
      await expect.poll(() => region.evaluate((t) => (t as unknown as { scrollLeft: number }).scrollLeft)).toBeGreaterThan(0);
      scrolled = true;
    }
    if (scrolled) break;
  }
  if (!scrolled && !kb.phone) {
    // A desktop column holds every comparison table now that a long row name wraps: the
    // region is still a keyboard stop, and it simply has nothing to scroll.
    await kb.visit(site.comparisons[0] as string);
    const regions = page.locator('main .kb-wide:has(> table)');
    expect(await regions.count()).toBeGreaterThan(0);
    await expect(regions.first()).toHaveAttribute('tabindex', '0');
    return;
  }
  expect(scrolled, 'a comparison table wider than its column scrolls by keyboard').toBe(true);
});

/** What the three phone flows below read off the page; tools/ has no DOM types. */
interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}
interface Probe {
  getComputedStyle(el: unknown): { backgroundImage: string; fontSize: string; paddingBottom: string };
  document: {
    querySelector(sel: string): unknown;
    querySelectorAll(sel: string): Iterable<unknown>;
    elementFromPoint(x: number, y: number): unknown;
    documentElement: { clientWidth: number };
    body: unknown;
  };
}
interface El {
  getBoundingClientRect(): Box;
  contains(other: unknown): boolean;
  querySelector(sel: string): El | null;
  querySelectorAll(sel: string): Iterable<El>;
  viewBox?: { baseVal: { width: number } };
  scrollWidth: number;
  clientWidth: number;
}

test('phone-table-scroll', async ({ page, kb }) => {
  test.skip(!kb.phone, 'a phone-width flow: at desktop width the tables fit their column');
  let checked = false;
  for (const route of site.comparisons) {
    await kb.visit(route);
    const found = await page.evaluate(() => {
      const g = globalThis as unknown as Probe;
      return [...g.document.querySelectorAll('main .kb-wide:has(> table)')].map((r) => {
        const region = r as El;
        const first = region.querySelector('th, td') as El;
        return {
          scrolls: region.scrollWidth > region.clientWidth + 1,
          firstColumn: first.getBoundingClientRect().width,
          fade: g.getComputedStyle(r).backgroundImage.split('gradient').length - 1,
          role: (r as { getAttribute(n: string): string | null }).getAttribute('role'),
          name: (r as { getAttribute(n: string): string | null }).getAttribute('aria-label'),
          tabindex: (r as { getAttribute(n: string): string | null }).getAttribute('tabindex'),
        };
      });
    });
    expect(found.length, `${route} has a table in a scroll region`).toBeGreaterThan(0);
    for (const f of found) {
      expect(f.tabindex, `${route}: the scroll region is a keyboard stop`).toBe('0');
      expect(f.role).toBe('region');
      expect(f.name, `${route}: the scroll region is named`).toBeTruthy();
      expect(f.firstColumn, `${route}: the first column leaves room for the data columns`).toBeLessThanOrEqual(14 * 16 + 1);
      if (f.scrolls) {
        expect(f.fade, `${route}: a table that scrolls sideways shows an edge fade`).toBeGreaterThanOrEqual(4);
        checked = true;
      }
    }
    if (checked) break;
  }
  expect(checked, 'a comparison table wider than the phone shows its sideways cue').toBe(true);

  // A first column holds its text: a long row name wraps inside its cell and never runs over the next column.
  for (const route of [...site.capabilities.slice(0, 3), ...site.comparisons.slice(0, 2)]) {
    await kb.visit(route);
    const spill = await page.evaluate(() => {
      const g = globalThis as unknown as Probe;
      const out: string[] = [];
      for (const cell of g.document.querySelectorAll('main .kb-wide > table tr > :first-child')) {
        const c = cell as unknown as { scrollWidth: number; clientWidth: number; textContent: string | null; getBoundingClientRect(): { width: number } };
        if (c.scrollWidth > c.clientWidth + 1) out.push((c.textContent ?? '').trim().slice(0, 40));
      }
      return out;
    });
    expect(spill, `${route}: first-column text runs over its cell`).toEqual([]);
  }
});

test('phone-diagram-size', async ({ page, kb }) => {
  test.skip(!kb.phone, 'a phone-width flow: the desktop column holds a diagram at its own size');
  await kb.visit(site.wideFigure.route);
  await page.waitForLoadState('load');
  const figures = await page.evaluate(() =>
    [...(globalThis as unknown as Probe).document.querySelectorAll('figure[data-kb-diagram]')].map((f) => {
      const g = globalThis as unknown as Probe;
      const svg = (f as El).querySelector('[data-kb-diagram-stage] svg') as El;
      const label = svg.querySelector('.nodeLabel, .messageText, text');
      const units = label === null ? 16 : parseFloat(g.getComputedStyle(label).fontSize) || 16;
      const canvas = (f as El).querySelector('[data-kb-diagram-canvas]') as El;
      return {
        labelPx: (units * svg.getBoundingClientRect().width) / (svg.viewBox?.baseVal.width ?? 1),
        scrolls: canvas.scrollWidth > canvas.clientWidth,
        width: svg.viewBox?.baseVal.width ?? 0,
      };
    }),
  );
  expect(figures.length).toBeGreaterThan(0);
  for (const f of figures) {
    expect(f.labelPx, `a diagram ${f.width} units wide draws its labels at ${f.labelPx}px`).toBeGreaterThanOrEqual(10.9);
  }
  expect(figures.some((f) => f.scrolls), 'a wide diagram scrolls inside its own canvas').toBe(true);

  const full = page.locator('figure[data-kb-diagram]').first().getByRole('button', { name: 'Fullscreen' });
  await expect(full, 'the fullscreen control is on screen at 390px').toBeVisible();
  const box = await full.boundingBox();
  expect(box === null ? 0 : box.x + box.width).toBeLessThanOrEqual(390);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(24);
});

test('action-bar-clear-of-toc', async ({ page, kb }) => {
  test.skip(!kb.phone, 'a phone-width flow: the open "On this page" menu is a phone control');
  await kb.visit(site.figure.route);
  await page.locator('mobile-starlight-toc summary').click();
  const read = await page.evaluate(() => {
    const g = globalThis as unknown as Probe;
    const bar = g.document.querySelector('.kb-page-actions') as El;
    const menu = g.document.querySelector('mobile-starlight-toc .dropdown') as El;
    const b = bar.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    // The menu's bottom row, read at the bar's own horizontal centre.
    const x = (b.left + b.right) / 2;
    const hit = g.document.elementFromPoint(x, Math.min(m.bottom - 4, b.bottom - 1));
    return { bar: b, menu: m, menuOnTop: hit !== null && menu.contains(hit) };
  });
  const overlap = read.bar.top < read.menu.bottom && read.bar.bottom > read.menu.top;
  if (overlap) expect(read.menuOnTop, 'where the bar and the open menu meet, the menu is on top').toBe(true);
  expect(read.bar.height, 'the phone bar is compact').toBeLessThanOrEqual(48);

  // The page ends clear of the bar: the last line can be scrolled above it.
  await page.keyboard.press('Escape');
  await page.evaluate(() => (globalThis as unknown as { scrollTo(x: number, y: number): void }).scrollTo(0, 1e7));
  const end = await page.evaluate(() => {
    const g = globalThis as unknown as Probe;
    const bar = (g.document.querySelector('.kb-page-actions') as El).getBoundingClientRect();
    const padding = parseFloat(g.getComputedStyle(g.document.body).paddingBottom);
    return { padding, barHeight: bar.height };
  });
  expect(end.padding, 'the page pads its end by the bar').toBeGreaterThanOrEqual(end.barHeight);
});

test('starlight-scripts', async ({ page, kb, context }) => {
  // Starlight's own scripts ride in one classic script, so they run from a
  // folder too: a module is refused there, and the controls it drives do
  // nothing. The console guard in fixtures.ts catches the refusal; this flow
  // holds what the scripts do.
  await context.addInitScript(() => {
    const g = globalThis as unknown as { navigator: { clipboard: unknown }; kbCopied?: string };
    Object.defineProperty(g.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          g.kbCopied = text;
        },
      },
    });
  });
  await kb.visit(site.figure.route);

  if (kb.phone) {
    // The phone's "On this page" menu: it opens, names the section being read, and closes when a link is followed.
    const toc = page.locator('mobile-starlight-toc');
    const menu = toc.locator('details');
    await expect(toc.locator('.display-current'), 'the menu names the current section').not.toBeEmpty();
    await toc.locator('summary').click();
    await expect(menu).toHaveJSProperty('open', true);
    await toc.locator('.dropdown a').first().click();
    await expect(menu, 'a followed link closes the menu').toHaveJSProperty('open', false);
  }

  // The code frame's copy button: it copies, and the frame's own script (a classic script too) was fetched and ran.
  const sketch = page.locator('details[id^="sketch-"]').first();
  await sketch.locator('summary').click();
  const copy = sketch.getByRole('button', { name: 'Copy to clipboard' });
  const expected = ((await copy.getAttribute('data-code')) ?? '').split(String.fromCharCode(0x7f)).join('\n');
  await copy.click();
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as { kbCopied?: string }).kbCopied)).toBe(expected);
  const frameScript = page.locator('script[src*="_astro/ec."]');
  await expect(frameScript).toHaveCount(1);
  await expect(frameScript).not.toHaveAttribute('type', 'module');
});
