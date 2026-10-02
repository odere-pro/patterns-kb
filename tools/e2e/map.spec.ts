/**
 * The map page, the pattern-to-product index. Product links leave the site, so
 * the stack flow checks each one against the registry (docs/data/products.json)
 * rather than fetching a vendor's page.
 */

import { expect, site, test } from './fixtures.js';

test('stack', async ({ page, kb }) => {
  await kb.visit(site.stack.route);
  const tables = page.getByRole('main').getByRole('table');
  expect(await tables.count()).toBeGreaterThan(1);
  const rows = page.getByRole('main').getByRole('row');
  expect(await rows.count(), 'a row per pattern').toBeGreaterThan(100);

  const outbound = page.getByRole('main').getByRole('cell').getByRole('link').and(page.locator('a[href^="http"]'));
  const n = await outbound.count();
  expect(n, 'at least one product is linked').toBeGreaterThan(0);
  for (let i = 0; i < n; i += 1) {
    const href = await outbound.nth(i).getAttribute('href');
    expect(site.products.has(href as string), `${href} is a registered product link`).toBe(true);
  }

  // The pattern named in a row's header cell opens that pattern.
  const header = page.getByRole('main').getByRole('rowheader').first().getByRole('link');
  await kb.follow(header);
});
