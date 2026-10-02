/**
 * A diagram's own tools: the zoom buttons and their floor, the keyboard pan,
 * and fullscreen with its way back out.
 *
 * The page is the one fixtures.ts picks for a diagram wider than a phone
 * column; the figure under test is its first.
 */

import type { Locator, Page } from '@playwright/test';

import { expect, site, test } from './fixtures.js';

/** What the in-page callbacks below read; tools/ has no DOM types. */
interface Doc {
  document: { fullscreenElement: unknown; activeElement: unknown };
}

/** The scale the stage is drawn at: the first number of its computed matrix. */
const scaleOf = (stage: Locator): Promise<number> =>
  stage.evaluate((el) => {
    const g = globalThis as unknown as { getComputedStyle(e: unknown): { transform: string } };
    const m = /^matrix\(([^,]+),/.exec(g.getComputedStyle(el).transform);
    return m === null ? 1 : Number(m[1]);
  });

const fullscreenOn = (page: Page): Promise<boolean> =>
  page.evaluate(() => (globalThis as unknown as Doc).document.fullscreenElement !== null);

test('diagram-tools', async ({ page, kb }) => {
  await kb.visit(site.wideFigure.route);
  const figure = page.locator('figure[data-kb-diagram]').first();
  await figure.scrollIntoViewIfNeeded();
  const stage = figure.locator('[data-kb-diagram-stage]');
  // The stage eases between scales; a computed transform read mid-ease is the old one.
  await page.addStyleTag({ content: '[data-kb-diagram-stage] { transition: none !important; }' });
  const svg = figure.getByRole('document').first();
  await expect(svg).toBeVisible();

  // Zoom in: one step is a quarter more, and the drawing grows with it.
  const start = await scaleOf(stage);
  const before = (await svg.boundingBox())?.width ?? 0;
  await figure.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => scaleOf(stage), { message: 'zoom in raises the scale' }).toBeGreaterThan(start);
  expect((await svg.boundingBox())?.width ?? 0, 'the drawing is wider after zooming in').toBeGreaterThan(before);

  // Zoom out until the button has nothing left to give: the scale stops at its floor and stays there.
  const out = figure.getByRole('button', { name: 'Zoom out' });
  let floor = await scaleOf(stage);
  for (let presses = 0; presses < 30; presses += 1) {
    await out.click();
    const now = await scaleOf(stage);
    if (now === floor) break;
    floor = now;
  }
  expect(floor, 'zooming out stops above zero').toBeGreaterThan(0.3);
  expect(floor, 'zooming out reached a floor below the starting scale').toBeLessThan(start);
  await out.click();
  expect(await scaleOf(stage), 'one more press at the floor changes nothing').toBe(floor);

  // The keyboard pans the focused figure: the arrow brings the right-hand side into view.
  await figure.getByRole('button', { name: 'Zoom in' }).click();
  await figure.getByRole('button', { name: 'Zoom in' }).click();
  const canvas = figure.getByRole('group', { name: /^Diagram\./ });
  await canvas.focus();
  await expect(canvas).toBeFocused();
  const left = (await svg.boundingBox())?.x ?? 0;
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await svg.boundingBox())?.x ?? left, { message: 'ArrowRight moves the drawing left' }).toBeLessThan(left);
});

test('diagram-fullscreen', async ({ page, kb }) => {
  await kb.visit(site.wideFigure.route);
  const figure = page.locator('figure[data-kb-diagram]').first();
  await figure.scrollIntoViewIfNeeded();
  const full = figure.getByRole('button', { name: 'Fullscreen' });
  const supported = await full.isVisible();
  test.skip(!supported, 'this browser draws no fullscreen button: it has no Fullscreen API');

  await full.click();
  await expect.poll(() => fullscreenOn(page), { message: 'the figure goes fullscreen' }).toBe(true);
  await expect(figure.getByRole('button', { name: 'Exit fullscreen' }), 'the button names the way out').toBeVisible();

  // Escape leaves fullscreen in the browser's own chrome, which a headless Chromium
  // driven over its debugging protocol does not have: the key reaches the page and
  // nothing acts on it. The browser's Escape ends fullscreen with this same call, and
  // the figure's `fullscreenchange` handler (the label, the refit) is what runs after it.
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const d = (globalThis as unknown as { document: { fullscreenElement: unknown; exitFullscreen(): Promise<void> } }).document;
    if (d.fullscreenElement !== null) await d.exitFullscreen();
  });
  await expect.poll(() => fullscreenOn(page), { message: 'fullscreen ends' }).toBe(false);
  await expect(figure.getByRole('button', { name: 'Fullscreen' })).toBeVisible();
  await expect(full, 'focus is back on the trigger').toBeFocused();
});
