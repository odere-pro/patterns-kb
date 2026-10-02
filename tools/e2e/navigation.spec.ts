/**
 * Getting around: from the home page to a page, along the sidebar, through the
 * links a page offers onward, and on a phone through the menu. Each flow
 * checks where the reader lands by the URL and the heading they see.
 *
 * The sidebar shows the current branch: the top-level areas, with the one
 * holding the page open down to its pages. The flows assert that behaviour —
 * the current page is marked, a sibling link lands, another area is one link
 * to its hub and lists its pages once the reader is there.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { DIST, expect, expectPageHead, site, test } from './fixtures.js';

test('home-to-page', { tag: '@tablet' }, async ({ page, kb }) => {
  const { hub, page: target } = site.walk;
  await kb.visit(site.home);
  const main = page.getByRole('main');
  // A hub's description is plain text on its home card and under its H1: a
  // backtick there reaches the reader as a stray mark, never as code.
  await expect(main, 'the home cards show no raw markdown').not.toContainText('`');
  await kb.follow(main.getByRole('link', { name: hub.title }).first());
  await expectPageHead(page, kb, hub, ['Home']);
  await expect(main, 'the hub shows no raw markdown').not.toContainText('`');

  const landed = await kb.follow(main.getByRole('list').getByRole('link', { name: target.title, exact: true }));
  expect(landed.route).toBe(target.route);
  await expectPageHead(page, kb, landed, ['Home', hub.title]);

  const nav = await kb.openNav();
  const current = nav.getByRole('link', { name: target.title, exact: true });
  await expect(current).toBeVisible();
  await expect(current).toHaveAttribute('aria-current', 'page');
});

test('start-here', async ({ page, kb }) => {
  const { tracks, track, stage, total } = site.startHere;
  await kb.visit(site.home);
  const region = page.getByRole('region', { name: 'Start here' });
  await expect(region).toBeVisible();

  // Four to six tracks, in the order the data file gives them.
  const titles = region.getByRole('heading', { level: 3 });
  const count = await titles.count();
  expect(count).toBeGreaterThanOrEqual(4);
  expect(count).toBeLessThanOrEqual(6);
  await expect(titles).toHaveText(tracks.map((t) => t.label));

  // A track's steps are its themes, in order, each a link to the theme's page.
  const mine = region.getByRole('listitem').filter({ has: page.getByRole('heading', { name: track, exact: true }) });
  const steps = mine.getByRole('link');
  const mineTrack = tracks.find((t) => t.label === track);
  const stepLabels = mineTrack?.steps ?? [];
  await expect(steps).toHaveText(stepLabels);
  const landed = await kb.follow(steps.first());
  expect(landed.route).toBe(mineTrack?.routes[0]);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(stepLabels[0] as string);
  await kb.visit(site.home);

  // Practicing a page the track walks moves the track's count.
  await expect(mine.getByText(/\d+ of \d+ practiced/)).toHaveText(`0 of ${total} practiced`);
  await kb.visit(stage.route);
  const check = page.getByRole('main').getByRole('button', { name: `Practiced: ${stage.title}` });
  await check.click();
  await expect(check).toHaveAttribute('aria-pressed', 'true');
  await kb.visit(site.home);
  await expect(mine.getByText(/\d+ of \d+ practiced/)).toHaveText(`1 of ${total} practiced`);
});

test('sidebar', { tag: '@tablet' }, async ({ kb }) => {
  const { page: from, sibling } = site.walk;
  await kb.visit(from.route);
  const nav = await kb.openNav();
  await kb.follow(nav.getByRole('link', { name: sibling.title, exact: true }));

  const after = await kb.openNav();
  const current = after.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText(sibling.title);
  await expect(after.getByRole('link', { name: from.title, exact: true })).not.toHaveAttribute('aria-current', 'page');

  // Another area is one link, to its hub; its pages show once the reader is in it.
  const { label, hub, page: there } = site.elsewhere;
  await expect(after.getByRole('link', { name: there.title, exact: true })).toHaveCount(0);
  // It wears the group look: bold, with a caret drawn after the label.
  const area = after.getByRole('link', { name: label, exact: true });
  await expect(area).toHaveClass(/kb-sidebar-branch/);
  const look = await area.evaluate((el) => {
    const g = globalThis as unknown as {
      getComputedStyle: (e: unknown, p?: string) => { fontWeight: string; content: string };
    };
    return { weight: Number(g.getComputedStyle(el).fontWeight), caret: g.getComputedStyle(el, '::after').content };
  });
  expect(look.weight, 'the area link is bold').toBeGreaterThanOrEqual(600);
  expect(look.caret, 'the area link has a caret').not.toBe('none');
  const landed = await kb.follow(after.getByRole('link', { name: label, exact: true }));
  expect(landed.route).toBe(hub.route);
  await expect((await kb.openNav()).getByRole('link', { name: there.title, exact: true })).toBeVisible();
});

test('sidebar-stack-link', async ({ page, kb }) => {
  // The pattern-to-product index is one top-level link, in no group and with no hub of its own.
  const { stack } = site;
  await kb.visit(site.walk.page.route);
  const nav = await kb.openNav();
  const link = nav.getByRole('link', { name: stack.title, exact: true });
  await expect(link).toHaveCount(1);
  await expect(link).not.toHaveClass(/kb-sidebar-branch/);
  await expect(nav.locator('details').getByRole('link', { name: stack.title, exact: true })).toHaveCount(0);
  const landed = await kb.follow(link);
  expect(landed.route).toBe(stack.route);
  expect(landed.route).toBe('/map/stack.html');
  await expect((await kb.openNav()).getByRole('link', { name: stack.title, exact: true })).toHaveAttribute('aria-current', 'page');
  // Home is the only crumb: the area has no hub to add.
  await expectPageHead(page, kb, landed, ['Home']);
});

test('prerequisite-card', async ({ page, kb }) => {
  const { page: on, requires, related } = site.prereq;
  const card = page.getByRole('complementary', { name: 'Before and beside this page' });

  await kb.visit(on.route);
  await expect(card).toBeVisible();
  const first = await kb.follow(card.getByRole('link', { name: requires.title, exact: true }));
  expect(first.route).toBe(requires.route);

  await kb.visit(on.route);
  const beside = await kb.follow(card.getByRole('link', { name: related.title, exact: true }));
  expect(beside.route).toBe(related.route);
});

test('mentioned-by-and-next-steps', async ({ page, kb }) => {
  await kb.visit(site.mentioned.route);
  const aside = page.getByRole('complementary', { name: 'Mentioned by' });
  await expect(aside).toBeVisible();
  await kb.follow(aside.getByRole('listitem').first().getByRole('link'));

  const { page: from, sibling } = site.walk;
  await kb.visit(from.route);
  const pager = page.getByRole('navigation', { name: 'Page navigation' });
  const next = await kb.follow(pager.getByRole('link', { name: /Next/ }));
  expect(next.route).toBe(sibling.route);
  const up = await kb.follow(page.getByRole('navigation', { name: 'Page navigation' }).getByRole('link', { name: /Up/ }));
  expect(up.route).toBe(site.walk.hub.route);
});

test('phone-menu', async ({ page, kb }) => {
  test.skip(!kb.phone, 'a phone-width flow: the desktop layout pins the sidebar and has no menu button');
  for (const route of [site.home, site.walk.hub.route, site.figure.route, site.comparisons[0] as string]) {
    await kb.visit(route);
    const width = await page.evaluate(() => {
      const el = (globalThis as unknown as { document: { documentElement: { scrollWidth: number; clientWidth: number } } }).document
        .documentElement;
      return { scroll: el.scrollWidth, client: el.clientWidth };
    });
    expect(width.scroll, `${route} scrolls sideways at 390px`).toBeLessThanOrEqual(width.client);
  }

  await kb.visit(site.walk.page.route);
  const nav = page.getByRole('navigation', { name: 'Main' });
  const sibling = nav.getByRole('link', { name: site.walk.sibling.title, exact: true });
  await expect(sibling).toBeHidden();
  await kb.openNav();
  await expect(sibling).toBeVisible();
  await kb.follow(sibling);
});

/** What a flow reads off the not-found page: its own style, its one main column and its colours. */
interface NotFoundLook {
  styles: number;
  files: number;
  maxWidth: string;
  background: string;
  color: string;
}
const lookOf = (): NotFoundLook => {
  // Written against the browser's globals by hand: tools/ has no DOM types.
  const win = globalThis as unknown as {
    document: { body: unknown; querySelector(s: string): unknown; querySelectorAll(s: string): { length: number } };
    getComputedStyle(el: unknown): { maxWidth: string; backgroundColor: string; color: string };
  };
  const { document: doc } = win;
  return {
    styles: doc.querySelectorAll('style').length,
    files: doc.querySelectorAll('link[rel~="stylesheet"], link[rel~="icon"], [src]').length,
    maxWidth: win.getComputedStyle(doc.querySelector('main')).maxWidth,
    background: win.getComputedStyle(doc.body).backgroundColor,
    color: win.getComputedStyle(doc.body).color,
  };
};

test('not-found', async ({ page, kb }) => {
  await kb.visit('/404.html');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  await expect(main, 'one sentence says what happened').toContainText('That address is not a page here');
  // No chrome: the page is a title, a sentence and two links.
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('button')).toHaveCount(0);

  // It carries its own small style and loads no file, so it is styled wherever it is served.
  const look = await page.evaluate(lookOf);
  expect(look.styles, 'one inline style').toBe(1);
  expect(look.files, 'no stylesheet, script, icon or other file').toBe(0);
  expect(look.maxWidth, 'the style applies: a narrow column').toBe('640px');

  // Home and search are absolute, so they land from any depth: the home page, and the box on it.
  const home = main.getByRole('link', { name: 'home page' });
  const search = main.getByRole('link', { name: 'search', exact: true });
  await expect(home).toHaveAttribute('href', /^https?:\/\/.+\/index\.html$/);
  await expect(search).toHaveAttribute('href', /^https?:\/\/.+\/index\.html#search$/);

  // Readable in both themes: text and background differ, and the dark scheme moves them.
  await page.emulateMedia({ colorScheme: 'light' });
  const light = await page.evaluate(lookOf);
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await page.evaluate(lookOf);
  for (const look of [light, dark]) expect(look.color).not.toBe(look.background);
  expect(dark.background, 'dark scheme paints a different page').not.toBe(light.background);
});

test('not-found-deep', async ({ page, baseURL }) => {
  // A host serves 404.html at the address that missed. Served, ask the server for a
  // missing path four folders down; from disk, put the file four folders down.
  const deep = 'patterns/a/b/c/missing.html';
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  if ((baseURL as string).startsWith('http')) {
    // The browser prints a console error for a document that answers 404, which the
    // console guard would fail; the route hands the page on as the 200 it renders as,
    // after reading the status the host really sent.
    const url = new URL(deep, baseURL).href;
    let status = 0;
    await page.route(url, async (route) => {
      const sent = await route.fetch();
      status = sent.status();
      await route.fulfill({ response: sent, status: 200 });
    });
    await page.goto(url);
    expect(status, 'the host answers 404').toBe(404);
  } else {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-404-')), deep);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(path.join(DIST, '404.html'), file);
    await page.goto(pathToFileURL(file).href);
  }
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  expect(requested.filter((u) => !/favicon/.test(u)), 'the page asks for nothing but itself').toHaveLength(1);
  const look = await page.evaluate(lookOf);
  expect(look.maxWidth, 'styled four folders down').toBe('640px');
  expect(look.files).toBe(0);
  await expect(main.getByRole('link', { name: 'home page' })).toHaveAttribute('href', /^https?:\/\/.+\/index\.html$/);
});

test('home-search-example', async ({ page, kb }) => {
  await kb.visit(site.home);
  await page.getByRole('main').getByRole('button', { name: new RegExp(site.example) }).click();
  const dialog = page.getByRole('dialog', { name: 'Search this site' });
  const box = dialog.getByRole('combobox');
  await expect(box).toHaveValue(site.example);
  await expect(dialog.getByRole('option').first(), 'the example opens already answered').toBeVisible();
  await expect(box).toBeFocused();
});

test('phone-home-menu', async ({ page, kb }) => {
  test.skip(!kb.phone, 'a phone-width flow: the desktop header carries these controls itself');
  await kb.visit(site.home);
  const menu = page.getByRole('button', { name: 'Menu' });
  await expect(menu, 'the home page has the menu button').toBeVisible();
  await menu.click();
  const pane = page.locator('#starlight__sidebar');
  const marks = pane.getByRole('link', { name: 'My marks' });
  const theme = pane.getByRole('button', { name: /^Theme/ });
  const firstArea = pane.getByRole('link', { name: site.elsewhere.label }).first();
  await expect(marks).toBeVisible();
  await expect(theme).toBeVisible();
  const [m, t, a] = await Promise.all([marks.boundingBox(), theme.boundingBox(), firstArea.boundingBox()]);
  expect(m!.y, 'My marks sits above the page tree').toBeLessThan(a!.y);
  expect(t!.y, 'the theme toggle sits above the page tree').toBeLessThan(a!.y);
  await theme.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', /dark|light/);
});

test('related-reasons', async ({ page, kb }) => {
  await kb.visit(site.manyRelated.page.route);
  const card = page.getByRole('complementary', { name: 'Before and beside this page' });
  await expect(card).toBeVisible();
  // Each link shows why it is there.
  await expect(card.locator('li').first().locator('span').last(), 'the first link states its reason').not.toHaveText('');
  // Five links stand open and "See all N" holds the rest.
  const more = card.locator('details');
  const summary = more.locator('summary');
  await expect(summary).toHaveText(`See all ${site.manyRelated.count}`);
  await expect(more.locator('li').first()).toBeHidden();
  await summary.click();
  await expect(more.locator('li').first()).toBeVisible();
  await expect(more.locator('li')).toHaveCount(site.manyRelated.count - 5);
});
