/**
 * Where every page and every hub of the site lands, worked out from the one
 * structure file (docs/data/site-structure.json, spec kb.data.structure).
 *
 * Pure: it takes the parsed file and never reads the disk, so the site build
 * (the mirror, the hubs, the post-build passes) and the Astro workspace
 * (astro.config.mjs for the sidebar, the breadcrumbs) share one answer. Two
 * copies of "where does this area's hub go" would drift the first time an
 * area moved.
 *
 * ROUTES. A page's route is its row's `route` — today's HTML path, kept so every
 * inbound link survives (dialect D-02) — or, for a row with none,
 * `/<area folder>/<slug>.html`. An area's hub route is `/<area folder>.html`,
 * beside the folder of the same name (spec offline-C1). An area's folder is its
 * parent's folder plus its own id with the parent's id and a hyphen taken off
 * the front: `distributed-resilience` under `distributed` under `patterns` is
 * `patterns/distributed/resilience`. Five areas have no folder of their own on
 * disk — `distributed-scale` and `distributed-data` share `routing/` and
 * `coordination/` with a sibling, and the design, theme and principle tiers
 * file their pages flat in their kind's folder — so their hub sits where their
 * folder would be, and `isHubRoute` answers from this file rather than from a
 * folder beside the route (a recorded reading of spec search-C3).
 *
 * CONTENT PATHS. Astro with `build.format: 'file'` turns a content entry at
 * `a/b/c.md` into `a/b/c.html` and one at `a/b/index.mdx` into `a/b.html`, so a
 * page's mirrored copy lives at its route with `.md` for `.html`, and a hub at
 * its folder's `index.mdx`.
 */

/** What an area's hub says about itself (the structure file's `hub` object). */
export interface StructureHub {
  readonly description: string;
  readonly intro: string;
  readonly tags: readonly string[];
}

/** One row of an area: a published page, in reading order. */
export interface StructurePage {
  readonly slug: string;
  readonly label: string;
  /** The markdown the page is mirrored from, repo-relative. */
  readonly source: string;
  /** Explicit route; `/<area folder>/<slug>.html` when absent. */
  readonly route?: string;
}

/**
 * How an area takes part in the site's navigation when it is not the default
 * (a hub, a sidebar group with an Overview row, and its rows): `link` is a
 * single-page area with no hub, shown as one top-level link to its row;
 * `none` is unpublished.
 */
export type AreaNav = 'link' | 'none';

/** One area: one hub, its rows, and the area it nests under. */
export interface StructureArea {
  readonly id: string;
  readonly label: string;
  /** Absent: a hub and a sidebar group. See {@link AreaNav}. */
  readonly nav?: AreaNav;
  readonly nestUnder?: string;
  /** The generator that writes this area's pages and hub itself (spec mirror-and-hubs-C8). */
  readonly generated?: string;
  readonly hub: StructureHub;
  readonly pages: readonly StructurePage[];
}

export interface Structure {
  readonly areas: readonly StructureArea[];
}

/** One published page, placed. */
export interface PlacedPage {
  readonly area: string;
  readonly slug: string;
  readonly label: string;
  readonly source: string;
  readonly route: string;
  /** Where the mirror writes it, relative to the content folder. */
  readonly contentPath: string;
  /** Its place in the whole file's reading order, from 0. */
  readonly rank: number;
}

/** One area's hub, placed. */
export interface PlacedHub {
  readonly area: string;
  readonly route: string;
  /** The hub's content file, relative to the content folder. */
  readonly contentPath: string;
  /** Its place among the areas, in file order, from 0. */
  readonly rank: number;
}

/**
 * A route: one leading `/`, segments that start with a letter or digit (so no
 * `.` or `..` and no `//`), ending in `.html`.
 */
const ROUTE = /^\/(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*\.html$/;

/** Is `route` a page route this module can place? */
export function isRoute(route: string): boolean {
  return ROUTE.test(route);
}

/**
 * The area's folder, its ancestors' folders first. Throws on an area the file
 * does not hold, and on a `nestUnder` chain that loops — both are the
 * structure gate's to report, and this module must not guess a place.
 */
export function areaFolder(structure: Structure, id: string): string {
  const byId = new Map(structure.areas.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const folderOf = (areaId: string): string => {
    const area = byId.get(areaId);
    if (area === undefined) throw new Error(`no area '${areaId}' in the structure file`);
    if (seen.has(areaId)) throw new Error(`area '${areaId}' nests under itself`);
    seen.add(areaId);
    const parent = area.nestUnder;
    if (parent === undefined) return area.id;
    const own = area.id.startsWith(`${parent}-`) ? area.id.slice(parent.length + 1) : area.id;
    return `${folderOf(parent)}/${own}`;
  };
  return folderOf(id);
}

/** The area and every area it nests under, outermost first. */
export function areaChain(structure: Structure, id: string): StructureArea[] {
  const byId = new Map(structure.areas.map((a) => [a.id, a]));
  areaFolder(structure, id); // the same refusals, in one place
  const chain: StructureArea[] = [];
  for (let at: string | undefined = id; at !== undefined; at = byId.get(at)?.nestUnder) {
    chain.unshift(byId.get(at) as StructureArea);
  }
  return chain;
}

/** `/a/b/c.html` → `a/b/c.md`: where Astro reads the page that builds that route. */
export function pageContentPath(route: string): string {
  return `${route.slice(1, -'.html'.length)}.md`;
}

/** `/a/b.html` → `a/b/index.mdx`: where Astro reads the hub that builds that route. */
export function hubContentPath(route: string): string {
  return `${route.slice(1, -'.html'.length)}/index.mdx`;
}

/** The area's navigation: its `nav` key, or `default` when it has none. */
export function navOf(area: Pick<StructureArea, 'nav'>): AreaNav | 'default' {
  return area.nav ?? 'default';
}

/**
 * The one row of a `link` area: the page its sidebar link and its home card
 * open. Undefined for an area that is not a `link` area, or whose row is gone.
 */
export function linkPage(structure: Structure, areaId: string): PlacedPage | undefined {
  const area = structure.areas.find((a) => a.id === areaId);
  if (area === undefined || navOf(area) !== 'link') return undefined;
  return placedPages(structure).find((p) => p.area === areaId);
}

/** Every published page, in the file's reading order; an unpublished (`none`) area's rows are left out. */
export function placedPages(structure: Structure): PlacedPage[] {
  const out: PlacedPage[] = [];
  for (const area of structure.areas) {
    if (navOf(area) === 'none') continue;
    const folder = areaFolder(structure, area.id);
    for (const page of area.pages) {
      const route = page.route ?? `/${folder}/${page.slug}.html`;
      out.push({
        area: area.id,
        slug: page.slug,
        label: page.label,
        source: page.source,
        route,
        contentPath: pageContentPath(route),
        rank: out.length,
      });
    }
  }
  return out;
}

/**
 * A row's `source` that names no file in the page tree: `site`, a page committed
 * at its route, or `generated`, one its area's generator writes at build time
 * (spec data-model.md, "Structure entry and area").
 */
export const NON_TREE_SOURCES: readonly string[] = ['site', 'generated'];

/** Is this row copied from the page tree? Only those rows are mirrored, and only those have a page under docs/. */
export function fromPageTree(page: Pick<PlacedPage, 'source'>): boolean {
  return !NON_TREE_SOURCES.includes(page.source);
}

/** Every area's hub, in file order — generated areas included; a `link` or `none` area has none. */
export function placedHubs(structure: Structure): PlacedHub[] {
  const out: PlacedHub[] = [];
  structure.areas.forEach((area, rank) => {
    if (navOf(area) !== 'default') return;
    const route = `/${areaFolder(structure, area.id)}.html`;
    out.push({ area: area.id, route, contentPath: hubContentPath(route), rank });
  });
  return out;
}

/**
 * The one hub predicate: the search payload leaves hubs out, and the
 * searchability check skips them (spec mirror-and-hubs-C10). The home page is
 * never a hub.
 */
export function isHubRoute(structure: Structure, route: string): boolean {
  const bare = route.startsWith('/') ? route : `/${route}`;
  return placedHubs(structure).some((h) => h.route === bare);
}
