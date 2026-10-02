/**
 * Where pages and hubs land. The small structure below has every shape the
 * real file has — a nested chain, an area whose pages live in a sibling's
 * folder (explicit routes), a row with no route — and one case reads the real
 * file, so the suite notices if the real areas stop placing.
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './sandbox.js';
import {
  areaChain,
  areaFolder,
  fromPageTree,
  hubContentPath,
  isHubRoute,
  isRoute,
  linkPage,
  navOf,
  pageContentPath,
  placedHubs,
  placedPages,
  type Structure,
} from './site-routes.js';

const hub = { description: 'd', level: 'advanced', intro: 'i', tags: ['resilience'] };
const tiny: Structure = {
  areas: [
    { id: 'patterns', label: 'Patterns', hub, pages: [] },
    { id: 'distributed', label: 'Network', nestUnder: 'patterns', hub, pages: [] },
    {
      id: 'distributed-routing',
      label: 'Routing',
      nestUnder: 'distributed',
      hub,
      pages: [{ slug: 'api-gateway', label: 'API Gateway', source: 'docs/patterns/distributed/routing/api-gateway.md' }],
    },
    {
      id: 'distributed-scale',
      label: 'Scale',
      nestUnder: 'distributed',
      hub,
      pages: [
        {
          slug: 'sharding',
          label: 'Sharding',
          source: 'docs/patterns/distributed/routing/sharding.md',
          route: '/patterns/distributed/routing/sharding.html',
        },
      ],
    },
    { id: 'hazards', label: 'Hazards', hub, pages: [{ slug: 'god-object', label: 'God Object', source: 'docs/hazards/god-object.md' }] },
  ],
};

const navs: Structure = {
  areas: [
    { id: 'hazards', label: 'Hazards', hub, pages: [{ slug: 'god-object', label: 'God Object', source: 'docs/hazards/god-object.md' }] },
    { id: 'map', label: 'Map', nav: 'link', hub, pages: [{ slug: 'stack', label: 'Stack', source: 'generated', route: '/map/stack.html' }] },
    { id: 'reference', label: 'Reference', nav: 'none', hub, pages: [{ slug: 'tags', label: 'Tags', source: 'docs/reference/tags.md' }] },
  ],
};

describe('areaFolder', () => {
  it('strips the parent id and its hyphen off a nested area, all the way up', () => {
    expect(areaFolder(tiny, 'distributed-routing')).toBe('patterns/distributed/routing');
    expect(areaFolder(tiny, 'hazards')).toBe('hazards');
  });

  it('keeps an id that does not start with its parent’s', () => {
    const odd: Structure = { areas: [{ id: 'a', label: 'A', hub, pages: [] }, { id: 'b', label: 'B', nestUnder: 'a', hub, pages: [] }] };
    expect(areaFolder(odd, 'b')).toBe('a/b');
  });

  it('refuses an area the file does not hold, and a chain that loops', () => {
    expect(() => areaFolder(tiny, 'nowhere')).toThrow(/no area 'nowhere'/);
    const loop: Structure = { areas: [{ id: 'a', label: 'A', nestUnder: 'a', hub, pages: [] }] };
    expect(() => areaFolder(loop, 'a')).toThrow(/nests under itself/);
  });
});

describe('areaChain', () => {
  it('lists the area and every area above it, outermost first', () => {
    expect(areaChain(tiny, 'distributed-scale').map((a) => a.id)).toEqual(['patterns', 'distributed', 'distributed-scale']);
    expect(areaChain(tiny, 'hazards').map((a) => a.id)).toEqual(['hazards']);
  });
});

describe('placedPages', () => {
  it('takes a row’s route when it has one, and builds one from the area folder otherwise', () => {
    const pages = placedPages(tiny);
    expect(pages.map((p) => [p.route, p.contentPath, p.rank])).toEqual([
      ['/patterns/distributed/routing/api-gateway.html', 'patterns/distributed/routing/api-gateway.md', 0],
      ['/patterns/distributed/routing/sharding.html', 'patterns/distributed/routing/sharding.md', 1],
      ['/hazards/god-object.html', 'hazards/god-object.md', 2],
    ]);
    expect(pages[1]).toMatchObject({ area: 'distributed-scale', slug: 'sharding', label: 'Sharding' });
  });
});

describe('placedHubs', () => {
  it('puts each hub beside its folder, a folder-less area where its folder would be', () => {
    expect(placedHubs(tiny).map((h) => [h.area, h.route, h.contentPath])).toEqual([
      ['patterns', '/patterns.html', 'patterns/index.mdx'],
      ['distributed', '/patterns/distributed.html', 'patterns/distributed/index.mdx'],
      ['distributed-routing', '/patterns/distributed/routing.html', 'patterns/distributed/routing/index.mdx'],
      ['distributed-scale', '/patterns/distributed/scale.html', 'patterns/distributed/scale/index.mdx'],
      ['hazards', '/hazards.html', 'hazards/index.mdx'],
    ]);
  });
});

describe('an area with a nav key', () => {
  it('reads the key, defaulting when it is absent', () => {
    expect(navOf(navs.areas[0] as never)).toBe('default');
    expect(navOf(navs.areas[1] as never)).toBe('link');
    expect(navOf(navs.areas[2] as never)).toBe('none');
  });

  it('places the pages of a default and a link area, and none of an unpublished one', () => {
    expect(placedPages(navs).map((p) => p.route)).toEqual(['/hazards/god-object.html', '/map/stack.html']);
  });

  it('places a hub for a default area only, keeping file-order ranks', () => {
    expect(placedHubs(navs).map((h) => [h.area, h.rank])).toEqual([['hazards', 0]]);
    expect(isHubRoute(navs, '/map.html')).toBe(false);
    expect(isHubRoute(navs, '/reference.html')).toBe(false);
  });

  it('finds the row of a link area, and nothing for any other area or an unknown one', () => {
    expect(linkPage(navs, 'map')?.route).toBe('/map/stack.html');
    expect(linkPage(navs, 'hazards')).toBeUndefined();
    expect(linkPage(navs, 'reference')).toBeUndefined();
    expect(linkPage(navs, 'nowhere')).toBeUndefined();
  });
});

describe('isHubRoute', () => {
  it('names the hubs, with or without the leading slash, and never a page or the home page', () => {
    expect(isHubRoute(tiny, '/patterns/distributed/scale.html')).toBe(true);
    expect(isHubRoute(tiny, 'hazards.html')).toBe(true);
    expect(isHubRoute(tiny, '/hazards/god-object.html')).toBe(false);
    expect(isHubRoute(tiny, '/index.html')).toBe(false);
  });
});

describe('content paths and routes', () => {
  it('maps a route onto the file Astro builds it from', () => {
    expect(pageContentPath('/a/b/c.html')).toBe('a/b/c.md');
    expect(hubContentPath('/a/b.html')).toBe('a/b/index.mdx');
  });

  it('tells a page route from anything else', () => {
    expect(isRoute('/patterns/caching/cache-aside.html')).toBe(true);
    expect(isRoute('patterns/x.html')).toBe(false);
    expect(isRoute('/patterns/x/')).toBe(false);
    expect(isRoute('/patterns/../x.html')).toBe(false);
    expect(isRoute('//x.html')).toBe(false);
  });
});

describe('rows from the page tree', () => {
  it('tells a row copied from docs/ from one committed at its route or written by a generator', () => {
    expect(fromPageTree({ source: 'docs/patterns/caching/cache-aside.md' })).toBe(true);
    expect(fromPageTree({ source: 'site' })).toBe(false);
    expect(fromPageTree({ source: 'generated' })).toBe(false);
  });
});

describe('the real structure file', () => {
  it('places every page and hub at a distinct route, every page route well formed', () => {
    const real = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/data/site-structure.json'), 'utf8')) as Structure;
    const pages = placedPages(real);
    const hubs = placedHubs(real);
    const routes = [...pages.map((p) => p.route), ...hubs.map((h) => h.route)];
    expect(new Set(routes).size).toBe(routes.length);
    for (const r of routes) expect(isRoute(r), r).toBe(true);
    expect(pages.length).toBeGreaterThan(300);
  });
});
