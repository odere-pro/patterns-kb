// @vitest-environment node
/**
 * The practiced check and the hub's count: one component, two shapes. The
 * `node` docblock is the one every render test needs (see
 * ../SectionHub/section-hub.render.test.ts).
 */
import { describe, expect, it } from 'vitest';

import { renderComponent } from '../../lib/render-fixture';

import Practiced from './Practiced.astro';

const render = (props: Record<string, unknown>): Promise<string> =>
  renderComponent(Practiced, { props });

describe('Practiced', () => {
  it('renders a check for a page, unpressed until the store says otherwise', async () => {
    const html = await render({ slug: 'bulkhead', name: 'Bulkhead' });
    expect(html).toContain('data-kb-practiced="bulkhead"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Practiced: Bulkhead"');
    expect(html).toContain('<span>Practiced</span>');
    expect(html).not.toContain('data-kb-practiced-count');
  });

  it('renders the bare icon on a hub row', async () => {
    const html = await render({ slug: 'bulkhead', name: 'Bulkhead', compact: true });
    expect(html).toContain('kb-practiced--compact');
    expect(html).not.toContain('<span>Practiced</span>');
  });

  it('renders the count in place of a check, announced as it changes', async () => {
    const html = await render({ count: true });
    expect(html).toContain('data-kb-practiced-count');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('data-kb-practiced=');
  });

  it('renders one tour’s count with its page list baked in as a hook, skip-marked, with no check', async () => {
    const html = await render({ tour: ['cdn', 'cache-aside'] });
    expect(html).toContain('data-kb-practiced-tour="cdn cache-aside"');
    expect(html).toContain('data-kb-skip');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('data-kb-practiced=');
    expect(html).not.toContain('data-kb-practiced-count');
  });

  it('renders every real tour on the home list, hidden until the browser has counted a mark', async () => {
    const html = await render({ tours: true });
    expect(html).toContain('data-kb-practiced-tours');
    expect(html).toMatch(/<section[^>]*data-kb-practiced-tours[^>]*hidden/);
    const items = html.match(/<li data-kb-practiced-tour="[^"]+" hidden>/g) ?? [];
    expect(items.length).toBeGreaterThanOrEqual(40);
    expect(html).toContain('<span>Caching</span>');
    expect(html).not.toContain('<a ');
    expect(html).toContain('data-kb-practiced-tour-text');
    expect(html).not.toContain('data-kb-skip');
  });

  it('says in its tooltip what practiced means, on the check and on the hub count', async () => {
    const check = await render({ slug: 'bulkhead', name: 'Bulkhead' });
    expect(check).toContain('title="Mark when you have used this in real work"');
    // A hub row's bare check repeats this 45 times on the hazards hub, which sits at its size budget:
    // it keeps a one-word tooltip and the hub's count line carries the sentence.
    const row = await render({ slug: 'bulkhead', name: 'Bulkhead', compact: true });
    expect(row).toContain('title="Practiced"');
    const count = await render({ count: true });
    expect(count).toContain('title="Practiced means you have used a page in real work');
  });
});
