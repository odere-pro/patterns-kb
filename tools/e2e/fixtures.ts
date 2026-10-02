/**
 * What every flow stands on: the routes it visits, picked from the data the
 * site is built from, and the few moves a reader makes on every page.
 *
 * No route is written into a spec. Each is chosen here from
 * docs/data/site-structure.json (areas, their hubs and their rows), the built
 * manifest site/dist/index.json (titles, statuses), the search payload
 * site/dist/search-index.js (hashed once built), docs/data/prerequisites.json, and — for what only
 * the rendered page knows, such as which page draws a diagram — the built HTML
 * itself. A page renamed or moved moves the flow with it; a flow whose kind of
 * page disappears fails here, naming what it could not find.
 *
 * The search flow ranks its query with the same rule the search box runs
 * (tools/src/lib/search-score.ts), so the page it expects on top is the page
 * the box puts there.
 *
 * Usage: import { test, expect, site } from './fixtures.js' in a spec.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { parse, type HTMLElement } from 'node-html-parser';

import { decodePage, searchWithRetry, type SearchPayload, type WirePayload } from '../src/lib/search-score.js';
import { judgeConsole, type ExpectedConsole } from '../src/lib/e2e-console.js';
import { findInDir, PAYLOAD_FILE_NAME } from '../src/lib/asset-names.js';

export { expect };

export const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
export const DIST = path.join(ROOT, 'site/dist');

const readJson = <T>(rel: string): T => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as T;

// ---- the data the site is built from -------------------------------------------

interface Row {
  slug: string;
  label: string;
  route: string;
}
interface Area {
  id: string;
  label: string;
  nestUnder?: string;
  /** `link`: one sidebar link, no hub; `none`: unpublished; absent: a hub and a group. */
  nav?: string;
  pages: Row[];
}
/** One built page, as site/dist/index.json lists it. */
export interface ManifestPage {
  route: string;
  title: string;
  area: string;
  status: string;
  solves: string[];
}
interface Prerequisite {
  id: string;
  label: string;
  route: string;
  requires: string[];
  related: string[];
}

const areas = readJson<{ areas: Area[] }>('docs/data/site-structure.json').areas;
const manifest = readJson<{ pages: ManifestPage[] }>('site/dist/index.json').pages;
const byRoute = new Map(manifest.map((p) => [p.route, p]));
const rowRoutes = new Set(areas.flatMap((a) => a.pages.map((r) => r.route)));

/** The payload the search box loads, read the way the page reads it: one assignment to `window.kb`. */
function searchPayload(): SearchPayload {
  const file = findInDir(DIST, PAYLOAD_FILE_NAME);
  if (file === null) throw new Error('site/dist holds no search-index.js — rebuild: make site-build');
  const raw = fs.readFileSync(file, 'utf8');
  const wire = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as WirePayload;
  return { ...wire, pages: wire.pages.map(decodePage) };
}

/** The built page for a route; a route the build did not write fails the fixture, not a flow. */
export function pageAt(route: string): ManifestPage {
  const page = byRoute.get(route);
  if (page === undefined) throw new Error(`site/dist/index.json lists no page at ${route} — rebuild: make site-build`);
  return page;
}

/**
 * An area's hub: the one built page filed under the area that is no area's
 * row. The home page shares the first area's id and is left out by name.
 */
export function hubOf(areaId: string): ManifestPage {
  const hub = manifest.find((p) => p.area === areaId && p.route !== '/index.html' && !rowRoutes.has(p.route));
  if (hub === undefined) throw new Error(`no hub page is built for area "${areaId}"`);
  return hub;
}

function areaById(id: string): Area {
  const area = areas.find((a) => a.id === id);
  if (area === undefined) throw new Error(`docs/data/site-structure.json has no area "${id}"`);
  return area;
}

/** The parsed HTML of one built page, read once. */
const parsed = new Map<string, HTMLElement>();
function html(route: string): HTMLElement {
  let root = parsed.get(route);
  if (root === undefined) {
    root = parse(fs.readFileSync(path.join(DIST, route), 'utf8'));
    parsed.set(route, root);
  }
  return root;
}

/** Every page that is a row of some area, in the structure file's reading order. */
const rows = areas.flatMap((a) => a.pages.filter((r) => byRoute.has(r.route)).map((r) => ({ ...r, area: a.id })));

function first<T>(items: readonly T[], what: string, ok: (item: T) => boolean): T {
  const found = items.find(ok);
  if (found === undefined) throw new Error(`no built page is ${what}`);
  return found;
}

/** A built route, from a link's href resolved against the route of the page holding it. */
export function routeOfHref(from: string, href: string): string {
  return new URL(href, `file:///site${from}`).pathname.replace(/^\/site/, '');
}

// ---- the picks ------------------------------------------------------------------

/**
 * The first top-level area whose rows are pages rather than nested areas:
 * the shortest walk from the home page's cards to a page.
 */
const walkArea = first(areas, 'a top-level area listing pages', (a) => a.nestUnder === undefined && a.nav === undefined && a.pages.length >= 2);

/**
 * Another top-level area listing pages: the sidebar on a walk page shows it as
 * one link to its hub, and none of its pages until the reader is in it.
 */
const elsewhereArea = first(
  areas,
  'a second top-level area listing pages',
  (a) => a.nestUnder === undefined && a.nav === undefined && a.pages.length >= 1 && a.id !== walkArea.id,
);

const prerequisites = readJson<{ records: Prerequisite[] }>('docs/data/prerequisites.json').records;
const prereqById = new Map(prerequisites.map((r) => [r.id, r]));
const prereq = first(prerequisites, 'a page that requires one and sits beside another', (r) => r.requires.length > 0 && r.related.length > 0 && byRoute.has(r.route));

/** A page whose prerequisite card holds more links than it shows at once ("See all N"). */
const manyRelated = first(prerequisites, 'a page with more than five related pages', (r) => r.related.length > 5 && byRoute.has(r.route));

/** A page whose built aside lists the pages that mention it. */
const mentioned = first(rows, 'mentioned by another page', (r) => html(r.route).querySelector('#mentioned-by a') !== null);

/** A page that draws a diagram and carries a code sketch with its copy button. */
const figurePage = first(rows, 'drawing a diagram beside a code sketch', (r) => {
  const root = html(r.route);
  return root.querySelector('figure[data-kb-diagram] svg') !== null && root.querySelector('details[id^="sketch-"] .copy button') !== null;
});

/** A page that draws a diagram wider than a phone's column can hold at a readable size (1000+ units). */
const wideFigurePage = first(rows, 'drawing a diagram 1000 units wide', (r) =>
  html(r.route)
    .querySelectorAll('figure[data-kb-diagram] svg[id^="mermaid-"]')
    .some((svg) => Number((svg.getAttribute('viewBox') ?? '').split(/\s+/)[2]) >= 1000),
);

/** A page long enough to track: at least six headings in its "On this page" list. */
const longPage = first(rows, 'with six or more headings in its outline', (r) => html(r.route).querySelectorAll('[data-kb-toc] a[href^="#"]').length >= 8);

/**
 * One element id of each kind a link can name, each from a built page: a list
 * item (`#tradeoffs-con-2` on a pattern), a heading, a table row, a code
 * sketch's own `details`, and an element inside a sketch that starts closed.
 */
const itemPage = first(rows, 'with a list item #tradeoffs-con-2', (r) => html(r.route).querySelector('li[id="tradeoffs-con-2"]') !== null);
const headingId = (): string => {
  const ids = html(itemPage.route)
    .querySelectorAll('main h2[id], article h2[id], h2[id]')
    .map((h) => h.id);
  return ids[2] ?? first(ids, 'with a third heading', () => true);
};
const rowPage = first(rows, 'with a table row that has an id', (r) => html(r.route).querySelector('tr[id]') !== null);
const sketchPage = first(rows, 'with a code sketch (details#sketch-…)', (r) => html(r.route).querySelector('details[id^="sketch-"]') !== null);
const insideSketch = first(rows, 'with an element inside a closed code sketch', (r) =>
  html(r.route)
    .querySelectorAll('details[id]')
    .some((d) => d.id !== 'starlight__mobile-toc' && d.querySelector('[id]') !== null),
);

/** A design page whose trade-offs block holds a pro and a con card. */
const cardsPage = first(
  rows.filter((r) => r.route.startsWith('/designs/')),
  'a design with pro and con cards',
  (r) => html(r.route).querySelector('[data-block="tradeoffs"] > [data-polarity="pro"]') !== null && html(r.route).querySelector('[data-block="tradeoffs"] > [data-polarity="con"]') !== null,
);

/** A hub whose filter bar offers at least one chip for a shared tag. */
const facetHub = first(
  areas.filter((a) => a.nav === undefined && a.pages.length > 0).map((a) => hubOf(a.id)),
  'a hub with a filter chip',
  (h) => html(h.route).querySelector('[data-kb-facet]') !== null,
);

/**
 * A tour: a theme page whose first two stages are built pages with a practiced
 * check of their own, so a flow can mark two and read "2 of N" on the theme page.
 */
const tourProfile = first(
  readJson<{ profiles: { id: string; label: string; stages: string[] }[] }>('docs/data/learning-paths.json').profiles,
  'a tour with a theme page and two stages that are pages of the tree',
  (p) => rows.some((r) => r.slug === p.id && r.route.startsWith('/themes/')) && p.stages.slice(0, 2).every((s) => rowRoutes.has(s) && byRoute.has(s)),
);
const tourTheme = first(rows, 'the theme page of a tour', (r) => r.slug === tourProfile.id && r.route.startsWith('/themes/'));

/**
 * The Start-here tracks of the home page, from docs/data/tracks.json and the
 * tours they name: every track's label and steps, and for the first track one
 * page its tours walk (a built page with a practiced check of its own) and how
 * many distinct pages the track counts.
 */
const startFile = readJson<{ tracks: { id: string; label: string; themes: string[] }[] }>('docs/data/tracks.json');
const startProfiles = new Map(
  readJson<{ profiles: { id: string; label: string; stages: string[] }[] }>('docs/data/learning-paths.json').profiles.map((p) => [p.id, p]),
);
const startTracks = startFile.tracks.map((t) => {
  const tours = t.themes.map((id) => startProfiles.get(id)).filter((p) => p !== undefined);
  const stages = [...new Set(tours.flatMap((p) => p.stages))];
  const routes = tours.map((p) => rows.find((r) => r.slug === p.id && r.route.startsWith('/themes/'))?.route as string);
  return { label: t.label, steps: tours.map((p) => p.label), routes, stages };
});
const startTrack = first(startTracks, 'a Start-here track with a page of the tree to practice', (t) => t.stages.some((s) => rowRoutes.has(s) && byRoute.has(s)));
const startStage = first(startTrack.stages, 'a page the first track walks', (s) => rowRoutes.has(s) && byRoute.has(s));

/** The built hub that lists the most pages: the one a reader scrolls furthest down. */
const longestHub = hubOf(
  areas.filter((a) => a.nav === undefined && a.pages.length > 0 && byRoute.has(a.pages[0]?.route ?? '')).sort((a, b) => b.pages.length - a.pages.length)[0]?.id as string,
);

/** A comparison page: the kind that carries the widest tables. */
const comparisons = areaById('comparisons').pages.map((r) => r.route);

/** A capability page: its mapping table has long first-column names. */
const capabilities = areaById('capabilities').pages.map((r) => r.route);

/**
 * A query taken from a page's `solves` that the search box ranks that page
 * first for, searched from the home page (whose area the box boosts).
 */
function searchPick(): { query: string; route: string; title: string } {
  const payload = searchPayload();
  const homeArea = html('/index.html').querySelector('meta[name="kb:area"]')?.getAttribute('content');
  const opts = homeArea === undefined ? {} : { area: homeArea };
  for (const row of rows) {
    for (const query of pageAt(row.route).solves) {
      const found = searchWithRetry(query, payload.pages, opts);
      if (!found.retried && found.hits[0]?.page.route === row.route) return { query, route: row.route, title: pageAt(row.route).title };
    }
  }
  throw new Error('no page is ranked first by any of its own `solves` lines');
}
const searched = searchPick();
const NO_MATCH = 'qqxzv wkjzq';
if (searchWithRetry(NO_MATCH, searchPayload().pages).hits.length > 0) throw new Error(`"${NO_MATCH}" matches a page`);

/** An editors' pick: a page whose frontmatter says `favourite: true`, with the hub that lists it. */
const pickPage = first(searchPayload().pages, 'an editors’ pick (favourite: true)', (p) => p.favourite === true && rowRoutes.has(p.route));

const draft = manifest.find((p) => p.status === 'draft' && rowRoutes.has(p.route));
const mapRows = areaById('map').pages;

/** Every product link the registry allows: the one outbound link the site writes. */
const products = new Set(
  Object.values(readJson<{ products: Record<string, Record<string, string>> }>('docs/data/products.json').products).flatMap((c) =>
    Object.values(c),
  ),
);

/** Everything a flow visits, resolved once. */
export const site = {
  home: '/index.html',
  walk: {
    hub: hubOf(walkArea.id),
    page: pageAt((walkArea.pages[0] as Row).route),
    sibling: pageAt((walkArea.pages[1] as Row).route),
  },
  elsewhere: {
    label: elsewhereArea.label,
    hub: hubOf(elsewhereArea.id),
    page: pageAt((elsewhereArea.pages[0] as Row).route),
  },
  prereq: {
    page: pageAt(prereq.route),
    requires: pageAt((prereqById.get(prereq.requires[0] as string) as Prerequisite).route),
    related: pageAt((prereqById.get(prereq.related[0] as string) as Prerequisite).route),
  },
  pick: { page: pageAt(pickPage.route), hub: hubOf(pickPage.area) },
  /** A tour: its theme page, the first two pages it walks, how many pages it walks in all, and its label. */
  tour: {
    theme: pageAt(tourTheme.route),
    label: tourProfile.label,
    stages: tourProfile.stages.slice(0, 2).map(pageAt),
    total: new Set(tourProfile.stages).size,
  },
  /** The home page's tracks in order, and for one a page it walks and how many pages it counts. */
  startHere: {
    tracks: startTracks.map((t) => ({ label: t.label, steps: t.steps, routes: t.routes })),
    track: startTrack.label,
    stage: pageAt(startStage),
    total: new Set(startTrack.stages.map((s) => (s.split('/').pop() as string).replace(/\.html$/, ''))).size,
  },
  mentioned: pageAt(mentioned.route),
  manyRelated: { page: pageAt(manyRelated.route), count: manyRelated.related.length },
  figure: pageAt(figurePage.route),
  wideFigure: pageAt(wideFigurePage.route),
  facetHub,
  longestHub,
  /** A design page with pro and con cards, for the print and layout flows. */
  cards: pageAt(cardsPage.route),
  /** A page with a long outline, for the "On this page" rail. */
  long: pageAt(longPage.route),
  /** One id of each kind a link can name, on the page that has it. */
  targets: {
    item: { route: itemPage.route, id: 'tradeoffs-con-2', kind: 'a list item' },
    heading: { route: itemPage.route, id: headingId(), kind: 'a heading' },
    row: {
      route: rowPage.route,
      id: (html(rowPage.route).querySelectorAll('tr[id]')[1] ?? (html(rowPage.route).querySelector('tr[id]') as HTMLElement)).id,
      kind: 'a table row',
    },
    sketch: { route: sketchPage.route, id: (html(sketchPage.route).querySelector('details[id^="sketch-"]') as HTMLElement).id, kind: 'a code sketch' },
    inside: {
      route: insideSketch.route,
      id: (
        html(insideSketch.route)
          .querySelectorAll('details[id]')
          .find((d) => d.id !== 'starlight__mobile-toc' && d.querySelector('[id]') !== null) as HTMLElement
      ).querySelector('[id]')!.id,
      kind: 'an element inside a closed sketch',
    },
  },
  comparisons,
  capabilities,
  search: { ...searched, none: NO_MATCH },
  /** The symptom the home page offers as an example (HomeSearch's default). */
  example: 'one slow dependency blocks my threads',
  draft: draft === undefined ? undefined : { page: draft, hub: hubOf(draft.area) },
  stable: { page: pageAt((walkArea.pages[0] as Row).route), hub: hubOf(walkArea.id) },
  stack: pageAt(first(mapRows, 'the stack index', (r) => r.slug === 'stack').route),
  products,
  /** The manifest page at a route, for the H1 a link should land on. */
  at: pageAt,
};

// ---- the reader's moves ---------------------------------------------------------

interface Moves {
  /** Open a route, relative to the project's site root. */
  visit(route: string): Promise<void>;
  /** The route of the page on screen. */
  route(): string;
  /** Follow a link and check it lands: the URL is the href's, the H1 the target's title. */
  follow(link: Locator): Promise<ManifestPage>;
  /** Show the navigation: the pinned sidebar on a desktop, the drawer on a phone. */
  openNav(): Promise<Locator>;
  /** The phone layout is in use: under 50rem, where cards stack and tables scroll. */
  phone: boolean;
  /** The reading rail and the breadcrumb trail are gone: under 72rem. */
  compact: boolean;
  /** The sidebar is a drawer behind the menu button: under 76rem, which holds every phone and tablet. */
  drawer: boolean;
  /** Choose a theme by its name in the button's label, whatever order the button cycles in. */
  pickTheme(want: 'light' | 'dark' | 'auto'): Promise<void>;
}

/** The layout's own breakpoints, in px (site/src/styles/layout.css: 50rem, 72rem and 76rem). */
export const BREAKPOINT = { phone: 800, rail: 1152, drawer: 1216 } as const;

/** The known messages. Empty is the goal: a reader of the site sees a silent console. */
export const EXPECTED_CONSOLE: readonly ExpectedConsole[] = [];

export const test = base.extend<{ kb: Moves; consoleGuard: undefined }>({
  // Every flow, in every project, fails on a console error or an uncaught page
  // error: a script a browser refuses to run from disk (a module, over CORS)
  // prints one, and the flow that never touches that script would pass.
  consoleGuard: [
    async ({ page }, use, info) => {
      const messages: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') messages.push(m.text());
      });
      page.on('pageerror', (e) => messages.push(String(e)));
      await use(undefined);
      const { unexpected, missing } = judgeConsole(info.title, messages, EXPECTED_CONSOLE);
      expect(unexpected, `console errors in the flow "${info.title}" that EXPECTED_CONSOLE (tools/e2e/fixtures.ts) does not name`).toEqual([]);
      expect(missing, `EXPECTED_CONSOLE entries the flow "${info.title}" no longer prints: delete them`).toEqual([]);
    },
    { auto: true },
  ],
  kb: async ({ page, baseURL }, use, info) => {
    const root = baseURL as string;
    const width = info.project.use.viewport?.width ?? 1600;
    const phone = width < BREAKPOINT.phone;
    const drawer = width < BREAKPOINT.drawer;
    const compact = width < BREAKPOINT.rail;
    const routeOf = (url: string): string => `/${decodeURI(new URL(url).pathname).slice(decodeURI(new URL(root).pathname).length)}`;
    const moves: Moves = {
      phone,
      drawer,
      compact,
      async visit(route) {
        await page.goto(new URL(route.replace(/^\//, ''), root).href);
      },
      route: () => routeOf(page.url()),
      // Boxed, so a failure points at the flow's line that followed the link.
      follow: (link) =>
        base.step(
          'follow a link',
          async () => {
            const href = await link.getAttribute('href');
            expect(href, 'the link has an href').not.toBeNull();
            const target = new URL(href as string, page.url());
            target.hash = '';
            const route = routeOf(target.href);
            const landed = byRoute.get(route);
            expect(landed, `the link "${href}" leads to ${route}, which is no built page`).toBeDefined();
            await link.click();
            await expect(page, `the link "${href}" lands on ${route}`).toHaveURL((u) => {
              const at = new URL(u.href);
              at.hash = '';
              return at.href === target.href;
            });
            const title = (landed as ManifestPage).title;
            await expect(page.getByRole('heading', { level: 1 }), `${route} opens with its title`).toHaveText(title);
            return landed as ManifestPage;
          },
          { box: true },
        ),
      async openNav() {
        const nav = page.getByRole('navigation', { name: 'Main' });
        if (drawer) {
          const menu = page.getByRole('button', { name: 'Menu' });
          await menu.click();
          await expect(menu).toHaveAttribute('aria-expanded', 'true');
        }
        return nav;
      },
      // The theme button sits in the header from 50rem up and in the drawer below it, so
      // the drawer is opened for it on a phone only. The button names its state ("Theme: dark — click to change") and each press
      // moves to the next one; press until the name says `want`, and stop after one
      // full lap of the states seen so a button that never gets there is a finding.
      async pickTheme(want) {
        const seen: string[] = [];
        for (let presses = 0; presses < 8; presses += 1) {
          if (phone) await moves.openNav();
          const button = page.getByRole('button', { name: /^Theme: / });
          const label = (await button.getAttribute('aria-label')) ?? '';
          if (label.startsWith(`Theme: ${want}`)) {
            if (phone) await page.keyboard.press('Escape');
            return;
          }
          if (seen.includes(label)) break;
          seen.push(label);
          await button.click();
          if (phone) await page.keyboard.press('Escape');
        }
        throw new Error(`the theme button never reached "${want}"; it showed: ${seen.join(' | ')}`);
      },
    };
    await use(moves);
  },
});

/** The H1 and, on a width that shows it, the breadcrumb trail. */
export async function expectPageHead(page: Page, kb: Moves, landed: ManifestPage, crumbs: readonly string[]): Promise<void> {
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText(landed.title);
  const trail = main.getByRole('navigation', { name: 'Breadcrumb' });
  if (kb.compact) {
    // Below 72rem the trail gives way to the "On this page" bar (breadcrumbs.css).
    await expect(trail).toBeHidden();
    return;
  }
  await expect(trail).toBeVisible();
  for (const label of crumbs) await expect(trail.getByRole('link', { name: label, exact: true })).toBeVisible();
  await expect(trail).toContainText(landed.title);
}
