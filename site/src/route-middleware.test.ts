import { describe, expect, it } from 'vitest';

import { onRequest } from './route-middleware';

const run = (toc: unknown): { toc: unknown } => {
  const route = { toc };
  (onRequest as unknown as (c: unknown) => void)({ locals: { starlightRoute: route } });
  return route;
};

describe('route middleware', () => {
  it('removes the outline of a page that has one entry', () => {
    expect(
      run({ items: [{ children: [] }], minHeadingLevel: 2, maxHeadingLevel: 3 }).toc,
    ).toBeUndefined();
  });

  it('keeps an outline of two entries, and a page with none to begin with', () => {
    const toc = { items: [{ children: [] }, { children: [] }] };
    expect(run(toc).toc).toBe(toc);
    expect(run(undefined).toc).toBeUndefined();
  });
});

describe('route middleware: the phone menu', () => {
  const at = (filePath: string): { hasSidebar: boolean } => {
    const route = { hasSidebar: false, entry: { filePath } };
    (onRequest as unknown as (c: unknown) => void)({ locals: { starlightRoute: route } });
    return route;
  };

  it('gives the home page, the marks page and the not-found page the sidebar that carries the menu', () => {
    expect(at('/r/site/src/content/docs/index.mdx').hasSidebar).toBe(true);
    expect(at('/r/site/src/content/docs/404.mdx').hasSidebar).toBe(true);
    expect(at('/r/site/src/content/docs/marks.md').hasSidebar).toBe(true);
  });

  it('leaves every other page as Starlight decided', () => {
    expect(at('/r/site/src/content/docs/hazards/god-object.md').hasSidebar).toBe(false);
    expect(at('/r/elsewhere.md').hasSidebar).toBe(false);
  });
});
