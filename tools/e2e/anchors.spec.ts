/**
 * Where a link into a page lands: a fragment (`route#id`) scrolls the target
 * clear of the sticky header, opens the closed sketch around it and wears the
 * `:target` highlight; and on a wide screen the "On this page" rail follows the
 * reader down the page and its links land the same way.
 *
 * The ids come from the built pages (fixtures.ts), one of each kind a link can
 * name.
 */

import type { Locator, Page } from '@playwright/test';

import { expect, site, test } from './fixtures.js';

/** What the in-page callbacks below read; tools/ has no DOM types. */
interface Target {
  matches(selector: string): boolean;
  parentElement: { closest(selector: string): { open: boolean } | null } | null;
}
interface Styled {
  getComputedStyle(el: unknown): { backgroundColor: string; boxShadow: string };
}

/** The sticky header's bottom edge: what a target's top must clear. */
async function headerBottom(page: Page): Promise<number> {
  const box = await page.getByRole('banner').first().boundingBox();
  expect(box, 'the header is on screen').not.toBeNull();
  return (box as { y: number; height: number }).y + (box as { y: number; height: number }).height;
}

/** The target's top, polled: fonts and diagrams settle after the first scroll. */
async function expectBelowHeader(page: Page, target: Locator, what: string): Promise<void> {
  const bottom = await headerBottom(page);
  await expect
    .poll(async () => (await target.boundingBox())?.y ?? -1, { message: `${what}: the top sits at or below the header (${bottom}px)` })
    .toBeGreaterThanOrEqual(bottom - 0.5);
}

for (const kind of ['item', 'heading', 'row', 'sketch', 'inside'] as const) {
  const pick = site.targets[kind];
  test(`deep-link: ${pick.kind}`, { tag: '@tablet' }, async ({ page, kb }) => {
    await kb.visit(`${pick.route}#${pick.id}`);
    const target = page.locator(`[id="${pick.id}"]`);
    await expect(target, `#${pick.id} is on ${pick.route}`).toHaveCount(1);
    await expect(target, `#${pick.id} is visible`).toBeVisible();
    await expect(target).toBeInViewport();
    await expectBelowHeader(page, target, `#${pick.id}`);

    // Every sketch around the target stands open; a closed one would hide it.
    const closed = await target.evaluate((el) => {
      const t = el as unknown as Target;
      return t.parentElement?.closest('details') === null ? false : !(t.parentElement?.closest('details') as { open: boolean }).open;
    });
    expect(closed, `a <details> around #${pick.id} is closed`).toBe(false);

    // :target paints a tint and an edge; a transparent background would mean the rule never matched.
    expect(await target.evaluate((el) => (el as unknown as Target).matches(':target')), `#${pick.id} is :target`).toBe(true);
    const look = await target.evaluate((el) => {
      const s = (globalThis as unknown as Styled).getComputedStyle(el);
      return { bg: s.backgroundColor, shadow: s.boxShadow };
    });
    expect(['rgba(0, 0, 0, 0)', 'transparent'], `#${pick.id} wears a background`).not.toContain(look.bg);
    expect(look.shadow, `#${pick.id} wears its accent edge`).not.toBe('none');
  });
}

test('toc-tracking', async ({ page, kb }) => {
  test.skip(kb.compact, 'a desktop flow: the reading rail shows from 72rem; below it the phone menu is the outline');
  await kb.visit(site.long.route);
  const rail = page.getByRole('navigation', { name: 'On this page' });
  await expect(rail).toBeVisible();
  const headings = page.getByRole('main').getByRole('heading', { level: 2 });
  expect(await headings.count(), 'the page has a third h2').toBeGreaterThanOrEqual(3);

  const third = headings.nth(2);
  const id = await third.getAttribute('id');
  expect(id, 'the third h2 has an id').toBeTruthy();
  const link = rail.locator(`a[href="#${id}"]`);
  await expect(link, 'the rail lists the third h2').toHaveCount(1);
  await expect(link).not.toHaveAttribute('aria-current', 'true');
  await third.evaluate((el) => (el as unknown as { scrollIntoView(): void }).scrollIntoView());
  await expect(link, 'the rail marks the section being read').toHaveAttribute('aria-current', 'true');
  await expect(rail.locator('a[aria-current="true"]'), 'one entry at a time').toHaveCount(1);

  // A rail link brings its heading to the reader, clear of the header.
  const fifth = headings.nth(4);
  const fifthId = await fifth.getAttribute('id');
  const fifthLink = rail.locator(`a[href="#${fifthId}"]`);
  await expect(fifthLink).toHaveCount(1);
  await fifthLink.click();
  await expect(page).toHaveURL(new RegExp(`#${fifthId}$`));
  await expect(fifth).toBeInViewport();
  await expectBelowHeader(page, fifth, `the rail's link to #${fifthId}`);
  // The mark sits on the heading at the reading line or on a sub-heading just under it.
  await expect(rail.locator('a[aria-current="true"]'), 'the rail still marks one entry').toHaveCount(1);
});
