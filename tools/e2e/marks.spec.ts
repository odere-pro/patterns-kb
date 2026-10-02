/**
 * The reader's marks and the hub list they act on: a star, a practiced check
 * and its count, the filter chips and the filter kept in the URL, the status
 * chip a draft wears, and the My marks page with its export, import and reset.
 *
 * A hub row is a list item holding the page's link; the flows find a row by
 * that link's name and read what the reader reads in it.
 */

import fs from 'node:fs';

import type { Locator, Page } from '@playwright/test';

import { expect, site, test } from './fixtures.js';

/** A hub's list rows: the list items that hold a page link and its marks. */
const hubRows = (page: Page): Locator => page.getByRole('main').getByRole('listitem').filter({ has: page.getByRole('link') });
const rowFor = (page: Page, title: string): Locator =>
  hubRows(page).filter({ has: page.getByRole('link', { name: title, exact: true }) });

test('favourites', async ({ page, kb }) => {
  const { hub, page: starred } = site.walk;
  await kb.visit(starred.route);
  const star = page.getByRole('main').getByRole('button', { name: `Favourite: ${starred.title}` });
  const was = await star.getAttribute('aria-pressed');
  if (was !== 'true') await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');

  await kb.visit(hub.route);
  await expect(rowFor(page, starred.title).getByRole('button', { name: `Favourite: ${starred.title}` })).toHaveAttribute('aria-pressed', 'true');
  const all = await hubRows(page).count();
  const only = page.getByRole('button', { name: 'Starred' });
  await only.click();
  await expect(only).toHaveAttribute('aria-pressed', 'true');

  const visible = hubRows(page).filter({ visible: true });
  await expect(rowFor(page, starred.title)).toBeVisible();
  const shown = await visible.count();
  expect(shown).toBeLessThan(all);
  for (let i = 0; i < shown; i += 1) {
    await expect(visible.nth(i).getByRole('button', { name: /^Favourite: / })).toHaveAttribute('aria-pressed', 'true');
  }
  await only.click();
  await expect(hubRows(page).filter({ visible: true })).toHaveCount(all);
});

test('practiced', async ({ page, kb }) => {
  const { hub, page: done } = site.walk;
  await kb.visit(hub.route);
  const count = page.getByRole('main').getByRole('status').filter({ hasText: /practiced/ });
  const before = Number(/^(\d+) of/.exec((await count.textContent())?.trim() ?? '')?.[1]);
  expect(before).toBe(0);

  await kb.visit(done.route);
  const check = page.getByRole('main').getByRole('button', { name: `Practiced: ${done.title}` });
  await check.click();
  await expect(check).toHaveAttribute('aria-pressed', 'true');

  await kb.visit(hub.route);
  await expect(count).toHaveText(new RegExp(`^\\s*${before + 1} of \\d+ practiced`));
  await page.reload();
  await expect(count).toHaveText(new RegExp(`^\\s*${before + 1} of \\d+ practiced`));
  await expect(rowFor(page, done.title).getByRole('button', { name: `Practiced: ${done.title}` })).toHaveAttribute('aria-pressed', 'true');
});

test('tour-progress', async ({ page, kb }) => {
  const { theme, stages, total, label } = site.tour;
  const line = page.getByRole('main').getByRole('status').filter({ hasText: /practiced/ });

  // A reader who has marked nothing sees no tour list on the home page: it shows only tours begun.
  await kb.visit(site.home);
  await expect(page.getByRole('heading', { name: 'Tours you have started' })).toBeHidden();
  await expect(page.locator('[data-kb-practiced-tours]').getByText(/\d+ of \d+ practiced/).filter({ visible: true })).toHaveCount(0);

  // On the theme page the same reader sees where the tour stands: none of its pages.
  await kb.visit(theme.route);
  await expect(line).toHaveText(`0 of ${total} practiced`);

  // Two of the tour's pages, marked on their own pages, count on the theme page.
  for (const stage of stages) {
    await kb.visit(stage.route);
    const check = page.getByRole('main').getByRole('button', { name: `Practiced: ${stage.title}` });
    await check.click();
    await expect(check).toHaveAttribute('aria-pressed', 'true');
  }
  await kb.visit(theme.route);
  await expect(line).toHaveText(`2 of ${total} practiced`);
  await page.reload();
  await expect(line).toHaveText(`2 of ${total} practiced`);

  // The home page lists the tour now that it is started, and says the same.
  await kb.visit(site.home);
  const started = page.locator('[data-kb-practiced-tours]').getByRole('listitem').filter({ hasText: label });
  await expect(started).toBeVisible();
  await expect(started).toContainText(`2 of ${total} practiced`);
});

test('facets', async ({ page, kb }) => {
  await kb.visit(site.facetHub.route);
  const bar = page.getByRole('group', { name: 'Filter this list' });
  const rows = hubRows(page);
  const all = await rows.count();
  const chip = bar.getByRole('button').filter({ hasNotText: 'Starred' }).first();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');

  const shown = await rows.filter({ visible: true }).count();
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(all);
  await expect(bar.getByRole('status')).toHaveText(`${shown} of ${all} shown`);

  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await expect(rows.filter({ visible: true })).toHaveCount(all);
  await expect(bar.getByRole('status')).toHaveText('');
});

test('draft-chip', async ({ page, kb }) => {
  const draftChip = (row: Locator): Locator => row.getByText('draft', { exact: true });
  await kb.visit(site.stable.hub.route);
  await expect(rowFor(page, site.stable.page.title)).toBeVisible();
  await expect(draftChip(rowFor(page, site.stable.page.title))).toHaveCount(0);

  test.skip(site.draft === undefined, 'no built page declares status: draft, so no hub row can wear the chip');
  const { hub, page: draft } = site.draft as NonNullable<typeof site.draft>;
  await kb.visit(hub.route);
  await expect(draftChip(rowFor(page, draft.title))).toBeVisible();
});

test('favourite-reload', async ({ page, kb }) => {
  const { page: starred } = site.walk;
  await kb.visit(starred.route);
  const star = page.getByRole('main').getByRole('button', { name: `Favourite: ${starred.title}` });
  // Flip it whichever way the page starts, so the stored override is the reader's.
  const was = await star.getAttribute('aria-pressed');
  await star.click();
  const now = was === 'true' ? 'false' : 'true';
  await expect(star).toHaveAttribute('aria-pressed', now);

  await page.reload();
  await expect(star).toBeVisible();
  await expect(star).toHaveAttribute('aria-pressed', now);

  await kb.visit(site.walk.hub.route);
  await expect(rowFor(page, starred.title).getByRole('button', { name: `Favourite: ${starred.title}` })).toHaveAttribute('aria-pressed', now);
});

test('facet-url', async ({ page, kb }) => {
  await kb.visit(site.facetHub.route);
  const bar = page.getByRole('group', { name: 'Filter this list' });
  const rows = hubRows(page);
  const all = await rows.count();
  const chip = bar.getByRole('button').filter({ hasNotText: 'Starred' }).first();
  await chip.click();
  const shown = await rows.filter({ visible: true }).count();
  expect(shown).toBeLessThan(all);
  expect(new URL(page.url()).searchParams.getAll('f')).toHaveLength(1);

  await page.reload();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(rows.filter({ visible: true })).toHaveCount(shown);
  await expect(bar.getByRole('status')).toHaveText(`${shown} of ${all} shown`);

  // Leave through a row's link, then come back with Back: the filter is still on.
  const href = await rows.filter({ visible: true }).first().getByRole('link').first().getAttribute('href');
  expect(href).not.toBeNull();
  await rows.filter({ visible: true }).first().getByRole('link').first().click();
  await expect(page).not.toHaveURL(/[?&]f=/);
  await page.goBack();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(rows.filter({ visible: true })).toHaveCount(shown);

  // A link with a value no chip carries is ignored: every row shows.
  await kb.visit(`${site.facetHub.route}?f=nope%3Anothing&f=junk&fav=0`);
  await expect(rows.filter({ visible: true })).toHaveCount(all);
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
});

test('marks-page', async ({ page, kb }, info) => {
  // A page the reader stars and practices: the one of the walk's two that is not already a starred pick.
  let marked = site.walk.page;
  await kb.visit(marked.route);
  let star = page.getByRole('main').getByRole('button', { name: `Favourite: ${marked.title}` });
  if ((await star.getAttribute('aria-pressed')) === 'true') {
    marked = site.walk.sibling;
    await kb.visit(marked.route);
    star = page.getByRole('main').getByRole('button', { name: `Favourite: ${marked.title}` });
  }
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('main').getByRole('button', { name: `Practiced: ${marked.title}` }).click();

  await kb.visit('/marks.html');
  const lists = {
    favourites: page.getByRole('main').locator('[data-kb-marks-list="favourites"]'),
    suggested: page.getByRole('main').locator('[data-kb-marks-list="suggested"]'),
    practiced: page.getByRole('main').locator('[data-kb-marks-list="practiced"]'),
  };
  await expect(lists.favourites.getByRole('link', { name: marked.title, exact: true })).toBeVisible();
  await expect(lists.practiced.getByRole('link', { name: marked.title, exact: true })).toBeVisible();

  // Export: a versioned file holding both sets.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click()]);
  const exported = info.outputPath('kb-marks.json');
  await download.saveAs(exported);
  const slug = (marked.route.split('/').pop() as string).replace(/\.html$/, '');
  const file = JSON.parse(fs.readFileSync(exported, 'utf8')) as { version: number; favourites: Record<string, boolean>; practiced: Record<string, boolean> };
  expect(file).toEqual({ version: 1, favourites: { [slug]: true }, practiced: { [slug]: true } });

  // Reset: behind a confirm, which Cancel leaves alone.
  page.once('dialog', (d) => void d.dismiss());
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(lists.favourites.getByRole('link', { name: marked.title, exact: true })).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(lists.favourites).toHaveText('No stars of your own yet.');
  await expect(lists.practiced).toHaveText('Nothing practiced yet.');

  // Import: the exported file brings both marks back.
  await page.getByLabel('Marks file').setInputFiles(exported);
  await expect(lists.favourites.getByRole('link', { name: marked.title, exact: true })).toBeVisible();
  await expect(lists.practiced.getByRole('link', { name: marked.title, exact: true })).toBeVisible();

  // Garbage is refused with a message, and changes nothing.
  await page.getByLabel('Marks file').setInputFiles({ name: 'junk.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'Not imported' })).toBeVisible();
  await expect(lists.favourites.getByRole('link', { name: marked.title, exact: true })).toBeVisible();

  // A mark for a page the site no longer has is shown apart, with a way to remove it.
  const stale = { version: 1, favourites: { 'no-such-page-anymore': true }, practiced: {} };
  await page.getByLabel('Marks file').setInputFiles({ name: 'stale.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stale)) });
  await expect(page.getByRole('heading', { name: 'No longer in the site' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove no-such-page-anymore' }).click();
  await expect(page.getByRole('heading', { name: 'No longer in the site' })).toBeHidden();
});

test('marks-suggested', async ({ page, kb }) => {
  // The editors' picks sit under Suggested on a fresh browser, and the reader's own stars under Yours.
  const { page: pick } = site.pick;
  const main = page.getByRole('main');
  await kb.visit('/marks.html');
  await expect(main.getByRole('heading', { name: 'Yours' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Suggested' })).toBeVisible();
  const yours = main.locator('[data-kb-marks-list="favourites"]');
  const suggested = main.locator('[data-kb-marks-list="suggested"]');
  await expect(yours).toHaveText('No stars of your own yet.');
  await expect(suggested.getByRole('link', { name: pick.title, exact: true })).toBeVisible();
  await expect(main, 'the page says what practiced means').toContainText('used it in real work');

  // The hub chip reads Starred and its tooltip names the editors' picks.
  await kb.visit(site.pick.hub.route);
  const chip = page.getByRole('button', { name: 'Starred' });
  await expect(chip).toHaveAttribute('title', /editors' picks/);

  // Unstar the pick on its page: it leaves Suggested and does not move to Yours.
  await kb.visit(pick.route);
  const star = main.getByRole('button', { name: `Favourite: ${pick.title}` });
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await star.click();
  await kb.visit('/marks.html');
  await expect(suggested.getByRole('link', { name: pick.title, exact: true })).toHaveCount(0);
  await expect(yours).toHaveText('No stars of your own yet.');

  // Star a page that is no pick: it lands under Yours and Suggested is unchanged in kind.
  const own = site.walk.page;
  await kb.visit(own.route);
  const ownStar = main.getByRole('button', { name: `Favourite: ${own.title}` });
  if ((await ownStar.getAttribute('aria-pressed')) !== 'true') await ownStar.click();
  await kb.visit('/marks.html');
  await expect(main.locator('[data-kb-marks-list="favourites"], [data-kb-marks-list="suggested"]').getByRole('link', { name: own.title, exact: true })).toHaveCount(1);
});

test('facets-clear', async ({ page, kb }) => {
  // A hub with starred rows and two rails of chips.
  await kb.visit(site.pick.hub.route);
  const bar = page.getByRole('group', { name: 'Filter this list' });
  const rows = hubRows(page);
  const all = await rows.count();
  const clear = bar.getByRole('button', { name: 'Clear filters' });
  await expect(clear, 'no filter, no Clear filters').toBeHidden();

  // A chip is pressed with a check mark, and Clear filters puts every row back.
  const chip = bar.locator('[data-kb-facet]').first();
  await chip.click();
  await expect(clear).toBeVisible();
  const mark = await chip.evaluate((el) => (globalThis as unknown as { getComputedStyle(e: unknown, p: string): { content: string } }).getComputedStyle(el, '::before').content);
  expect(mark, 'a pressed chip wears a check mark').toContain('✓');
  await clear.click();
  await expect(rows.filter({ visible: true })).toHaveCount(all);
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await expect(clear).toBeHidden();
  await expect(bar.getByRole('status')).toHaveText('');

  // Starred sits on its own labelled row, and counts as a filter too.
  await expect(bar.getByText('Show:', { exact: true })).toBeVisible();
  const starred = bar.getByRole('button', { name: 'Starred' });
  await starred.click();
  await expect(clear).toBeVisible();
  await clear.click();
  await expect(starred).toHaveAttribute('aria-pressed', 'false');

  // Two chips from different rails that no row holds together leave nothing, in one sentence.
  const pair = await page.evaluate(() => {
    interface El {
      getAttribute(n: string): string | null;
    }
    const doc = (globalThis as unknown as { document: { querySelectorAll(s: string): Iterable<El> } }).document;
    const keys = [...doc.querySelectorAll('[data-kb-facet-keys]')].map((r) => new Set((r.getAttribute('data-kb-facet-keys') ?? '').split(' ')));
    const chips = [...doc.querySelectorAll('[data-kb-facet]')].map((c) => c.getAttribute('data-kb-facet') as string);
    for (const a of chips) for (const b of chips) if (a < b && a.split(':')[0] !== b.split(':')[0] && !keys.some((k) => k.has(a) && k.has(b))) return [a, b];
    return null;
  });
  expect(pair, `${site.pick.hub.route} has two filters no row satisfies together`).not.toBeNull();
  for (const key of pair as string[]) await bar.locator(`[data-kb-facet="${key}"]`).click();
  await expect(rows.filter({ visible: true })).toHaveCount(0);
  await expect(bar.getByRole('status')).toHaveText('No pages match these filters.');
  await clear.click();
  await expect(rows.filter({ visible: true })).toHaveCount(all);
});

test('hub-scroll-back', async ({ page, kb }) => {
  await kb.visit(site.longestHub.route);
  const rows = hubRows(page).filter({ visible: true });
  const last = rows.last();
  await last.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const y = await page.evaluate(() => (globalThis as unknown as { scrollY: number }).scrollY);
  expect(y, `${site.longestHub.route} lists enough rows to scroll`).toBeGreaterThan(200);
  await last.getByRole('link').first().click();
  await page.goBack();
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as { scrollY: number }).scrollY)).toBeGreaterThan(y - 40);
});
