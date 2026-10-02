/**
 * Finding a page by what went wrong: open the box, type a line from a page's
 * `solves`, pick the page, land on it; a query nothing answers says so.
 *
 * The query and the page it should rank first come from fixtures.ts, which
 * ranks them with the rule the box itself runs.
 */

import { expect, site, test } from './fixtures.js';

test('search', { tag: '@tablet' }, async ({ page, kb }) => {
  await kb.visit(site.home);
  await page.getByRole('button', { name: 'Search this site' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Search this site' });
  await expect(dialog).toBeVisible();
  const box = dialog.getByRole('combobox').or(dialog.getByRole('searchbox')).or(dialog.getByRole('textbox')).first();
  await expect(box).toBeFocused();
  // Before a query the box invites one; a box that never loaded its index says so instead.
  await expect(dialog.getByRole('status'), 'the search box loaded its index').toHaveText(/^Type a name/);

  await box.fill(site.search.none);
  await expect(dialog.getByRole('status')).toHaveText(`Nothing matched “${site.search.none}”.`);
  await expect(dialog.getByRole('option')).toHaveCount(0);

  await box.fill(site.search.query);
  const hit = dialog.getByRole('option').first();
  await expect(hit).toContainText(site.search.title);
  await kb.follow(hit);
  expect(kb.route()).toBe(site.search.route);
});

/** The open box on the home page, and its query field. */
async function openBox(page: import('@playwright/test').Page, kb: { visit(route: string): Promise<void> }): Promise<{ dialog: import('@playwright/test').Locator; box: import('@playwright/test').Locator }> {
  await kb.visit(site.home);
  await page.getByRole('button', { name: 'Search this site' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Search this site' });
  const box = dialog.getByRole('combobox').first();
  await expect(box).toBeFocused();
  return { dialog, box };
}

test('search: a two-letter name finds its page first', async ({ page, kb }) => {
  const { dialog, box } = await openBox(page, kb);
  await box.fill('ai');
  await expect(dialog.getByRole('option').first()).toContainText('AI Agent');
});

test('search: a word start lists a page above any definition card', async ({ page, kb }) => {
  const { dialog, box } = await openBox(page, kb);
  await box.fill('gen');
  const first = dialog.getByRole('option').first();
  await expect(first).toBeVisible();
  const row = await first.boundingBox();
  const cards = dialog.locator('.kb-search-term');
  for (let i = 0; i < (await cards.count()); i += 1) {
    const card = await cards.nth(i).boundingBox();
    expect(card!.y, 'a definition card below the first page row').toBeGreaterThan(row!.y);
  }
});

test('search: a category name lists that category first', async ({ page, kb }) => {
  const { dialog, box } = await openBox(page, kb);
  await box.fill('case study');
  const link = dialog.getByRole('option').first();
  await expect(link).toHaveAttribute('href', /designs\//);
});

test('search: each result wears a quiet kind badge', async ({ page, kb }) => {
  const { dialog, box } = await openBox(page, kb);
  await box.fill(site.search.query);
  const first = dialog.getByRole('option').first();
  await expect(first).toContainText(site.search.title);
  const badge = first.locator('.kb-search-kind');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(/^(pattern|hazard|case study|theme|principle|capability|comparison)$/);
  // Every drawn row that has a kind says it, and the badge never replaces the title.
  const options = dialog.getByRole('option');
  const n = Math.min(await options.count(), 6);
  for (let i = 0; i < n; i += 1) await expect(options.nth(i).locator('.kb-search-title')).not.toHaveText('');
});

test('search: the shortcut cap names this keyboard', async ({ page, kb }) => {
  await kb.visit(site.home);
  const hint = page.locator('[data-kb-search-hint]').first();
  const ua = await page.evaluate(() => (globalThis as unknown as { navigator: { userAgent: string } }).navigator.userAgent);
  const mac = /Macintosh|iPhone|iPad/.test(ua);
  await expect(hint).toHaveText(mac ? '⌘ K' : 'Ctrl K');
});

/** The circuit-breaker page, found by its title in the built manifest rather than by a written path. */
const BREAKER = site.at('/patterns/distributed/resilience/circuit-breaker.html');

/** The shortcut that opens the box, then the box and the dialog around it. */
async function openWith(page: import('@playwright/test').Page, chord: string): Promise<{ dialog: import('@playwright/test').Locator; box: import('@playwright/test').Locator }> {
  await page.keyboard.press(chord);
  const dialog = page.getByRole('dialog', { name: 'Search this site' });
  await expect(dialog, `${chord} opens the box`).toBeVisible();
  const box = dialog.getByRole('combobox').first();
  await expect(box).toBeFocused();
  return { dialog, box };
}

test('search-keyboard', { tag: '@tablet' }, async ({ page, kb }) => {
  await kb.visit(site.home);
  const { dialog, box } = await openWith(page, 'Control+K');

  // Type, step to the second row, open it: the URL is the page the row named.
  await box.fill('circuit breaker');
  const rows = dialog.getByRole('option');
  await expect(rows.first()).toContainText(BREAKER.title);
  const second = rows.nth(1);
  await expect(second).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(second, 'ArrowDown selects the next row').toHaveAttribute('aria-selected', 'true');
  const from = page.url();
  const href = (await second.getAttribute('href')) as string;
  await page.keyboard.press('Enter');
  await expect(page, 'Enter opens the selected row').toHaveURL((u) => u.href !== from && u.href === new URL(href, from).href);

  // The first row starts selected and is the circuit breaker: down and back up, then Enter, opens it.
  await kb.visit(site.home);
  const again = await openWith(page, 'Control+K');
  await again.box.fill('circuit breaker');
  const top = again.dialog.getByRole('option').first();
  await expect(top).toContainText(BREAKER.title);
  await expect(top, 'the first row starts selected').toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(top).not.toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(top).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BREAKER.title);
  expect(kb.route()).toBe(BREAKER.route);
});

test('search-keyboard: Escape closes the box and gives focus back', { tag: '@tablet' }, async ({ page, kb }) => {
  await kb.visit(site.home);
  const trigger = page.getByRole('button', { name: 'Search this site' }).first();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Search this site' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog, 'Escape closes the box').toBeHidden();
  await expect(trigger, 'focus is back on the button that opened it').toBeFocused();

  // The shortcut toggles: the same chord closes the open box.
  await openWith(page, 'Control+K');
  await page.keyboard.press('Control+K');
  await expect(dialog).toBeHidden();
});

test('search-keyboard: Tab stays inside the open box', async ({ page, kb }) => {
  await kb.visit(site.home);
  const { dialog, box } = await openWith(page, 'Control+K');
  await box.fill(site.search.query);
  await expect(dialog.getByRole('option').first()).toBeVisible();
  // The open box is a modal dialog: the page behind it is inert, so a Tab walks the box's own
  // stops and then out to the browser's chrome (where the page's activeElement reads as the
  // body) and back to the box. Landing on any other element of the page would be an escape.
  const where = (): Promise<'box' | 'chrome' | 'page'> =>
    dialog.evaluate((el) => {
      const d = (globalThis as unknown as { document: { activeElement: unknown; body: unknown } }).document;
      if ((el as unknown as { contains(n: unknown): boolean }).contains(d.activeElement)) return 'box';
      return d.activeElement === d.body ? 'chrome' : 'page';
    });
  for (const key of ['Tab', 'Shift+Tab']) {
    let returned = 0;
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press(key);
      const at = await where();
      expect(at, `after ${key} ${i + 1} focus is on a page element outside the box`).not.toBe('page');
      if (at === 'box') returned += 1;
    }
    expect(returned, `${key} keeps coming back into the box`).toBeGreaterThanOrEqual(6);
  }
});

test.describe('on an Apple keyboard', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });

  test('search-keyboard: Meta+K', async ({ page, kb }) => {
    await kb.visit(site.home);
    await expect(page.locator('[data-kb-search-hint]').first(), 'the cap names the Command key').toHaveText('⌘ K');
    const { dialog, box } = await openWith(page, 'Meta+K');
    await box.fill('circuit breaker');
    await expect(dialog.getByRole('option').first()).toContainText(BREAKER.title);
    await page.keyboard.press('Meta+K');
    await expect(dialog, 'the same chord closes it').toBeHidden();
  });
});
