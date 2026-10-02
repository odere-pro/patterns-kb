/**
 * The page in other media and between the two ends of the layout: printed,
 * and at 800px, where the sidebar is still a drawer but the cards, once they
 * have room, sit side by side.
 *
 * The `@tablet-only` flows run in the 800px project alone; see
 * playwright.config.ts.
 */

import type { Locator, Page } from '@playwright/test';

import { expect, site, test } from './fixtures.js';

/** What the in-page callbacks below read; tools/ has no DOM types. */
interface Metrics {
  document: { documentElement: { scrollWidth: number; clientWidth: number } };
  getComputedStyle(el: unknown): { borderTopWidth: string; borderTopStyle: string };
}

const overflow = (page: Page): Promise<{ scroll: number; client: number }> =>
  page.evaluate(() => {
    const el = (globalThis as unknown as Metrics).document.documentElement;
    return { scroll: el.scrollWidth, client: el.clientWidth };
  });

/** The two trade-off cards of a design page, by the name of their headings. */
const cardsOf = (page: Page): { pros: Locator; cons: Locator } => ({
  pros: page.locator('[data-block="tradeoffs"] > [data-polarity="pro"]').first(),
  cons: page.locator('[data-block="tradeoffs"] > [data-polarity="con"]').first(),
});

test('print', async ({ page, kb }) => {
  await kb.visit(site.cards.route);
  await page.emulateMedia({ media: 'print' });

  // The reading chrome stays on the screen: nothing a printed page cannot use is drawn.
  await expect(page.getByRole('navigation', { name: 'Main' }), 'the sidebar').toBeHidden();
  await expect(page.getByRole('button', { name: 'Search this site' }).first(), 'the search button').toBeHidden();
  await expect(page.getByRole('button', { name: /^Theme: / }).first(), 'the theme button').toBeHidden();
  await expect(page.getByRole('button', { name: /^Favourite/ }).first(), 'the action bar').toBeHidden();
  await expect(page.getByRole('navigation', { name: 'On this page' }), 'the outline rail').toBeHidden();

  // The words stay.
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(site.cards.title);
  await expect(main.getByRole('heading', { level: 1 })).toBeVisible();

  // A card without its tint keeps its outline, so it still reads as a card on paper.
  const { pros, cons } = cardsOf(page);
  for (const card of [pros, cons]) {
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading'), 'the card keeps its words').toBeVisible();
    const edge = await card.evaluate((el) => {
      const s = (globalThis as unknown as Metrics).getComputedStyle(el);
      return { width: parseFloat(s.borderTopWidth), style: s.borderTopStyle };
    });
    expect(edge.width, 'the card keeps a border').toBeGreaterThan(0);
    expect(edge.style).not.toBe('none');
  }

  const w = await overflow(page);
  expect(w.scroll, 'the printed page does not run sideways').toBeLessThanOrEqual(w.client);
});

test('tablet-cards', { tag: ['@tablet', '@tablet-only'] }, async ({ page, kb }) => {
  await kb.visit(site.cards.route);
  const { pros, cons } = cardsOf(page);
  await pros.scrollIntoViewIfNeeded();
  const side = async (): Promise<{ stacked: boolean }> => {
    const [a, b] = await Promise.all([pros.boundingBox(), cons.boundingBox()]);
    return { stacked: (b as { y: number }).y >= (a as { y: number; height: number }).y + (a as { height: number }).height - 1 };
  };

  // 50rem is the first width with room for two columns; one pixel under it stacks them.
  expect((await side()).stacked, 'at 800px the cards sit side by side').toBe(false);
  await page.setViewportSize({ width: 799, height: 1024 });
  await expect.poll(async () => (await side()).stacked, { message: 'at 799px the cards stack' }).toBe(true);
  await page.setViewportSize({ width: 800, height: 1024 });
  await expect.poll(async () => (await side()).stacked, { message: 'at 800px again they sit side by side' }).toBe(false);
});

test('tablet-drawer', { tag: ['@tablet', '@tablet-only'] }, async ({ page, kb }) => {
  expect(kb.drawer, 'the layout at 800px still uses the drawer').toBe(true);
  expect(kb.phone, '800px is not a phone width').toBe(false);
  await kb.visit(site.walk.page.route);
  const nav = page.getByRole('navigation', { name: 'Main' });
  const sibling = nav.getByRole('link', { name: site.walk.sibling.title, exact: true });
  await expect(sibling, 'the sidebar is behind the menu button').toBeHidden();
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();

  await kb.openNav();
  await expect(sibling).toBeVisible();
  await kb.follow(sibling);

  for (const route of [site.home, site.walk.hub.route, site.figure.route]) {
    await kb.visit(route);
    const w = await overflow(page);
    expect(w.scroll, `${route} runs sideways at 800px`).toBeLessThanOrEqual(w.client);
  }
});

test('tablet-table-scroll', { tag: ['@tablet', '@tablet-only'] }, async ({ page, kb }) => {
  // A comparison table wider than its column scrolls inside its own box, which is a keyboard stop,
  // and the page itself never runs sideways.
  let scrolled = false;
  for (const route of site.comparisons) {
    await kb.visit(route);
    const regions = page.locator('main .kb-wide:has(> table)');
    for (let i = 0; i < (await regions.count()); i += 1) {
      const region = regions.nth(i);
      const wide = await region.evaluate((el) => {
        const t = el as unknown as { scrollWidth: number; clientWidth: number };
        return t.scrollWidth > t.clientWidth + 1;
      });
      if (!wide) continue;
      await expect(region).toHaveAttribute('tabindex', '0');
      await region.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => region.evaluate((el) => (el as unknown as { scrollLeft: number }).scrollLeft)).toBeGreaterThan(0);
      const w = await overflow(page);
      expect(w.scroll, `${route} runs sideways at 800px`).toBeLessThanOrEqual(w.client);
      scrolled = true;
      break;
    }
    if (scrolled) break;
  }
  expect(scrolled, 'a comparison table wider than its column scrolls at 800px').toBe(true);
});
