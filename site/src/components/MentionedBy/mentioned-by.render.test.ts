// @vitest-environment node
/**
 * The "Mentioned by" aside, rendered over the real tree: chrome with its
 * skip marker, one link per mentioning page with its kind's short name, and
 * nothing at all for a page nobody mentions. Who mentions whom is
 * tools/src/lib/site-mentions.ts's, tested there against today's build. The
 * `node` docblock is the one every render test needs (see
 * ../SectionHub/section-hub.render.test.ts).
 */
import { describe, expect, it } from 'vitest';

import { renderComponent } from '../../lib/render-fixture';

import MentionedBy from './MentionedBy.astro';

const at = (filePath: string): App.Locals =>
  ({ starlightRoute: { entry: { filePath } } }) as unknown as App.Locals;

describe('MentionedBy', () => {
  it('lists the pages whose prose links here, each with its kind, in a skip-marked aside', async () => {
    const html = await renderComponent(MentionedBy, {
      props: { route: '/patterns/distributed/resilience/circuit-breaker.html' },
    });
    expect(html).toContain(
      '<aside class="kb-mentions" id="mentioned-by" aria-labelledby="mentioned-by-title" data-kb-skip>',
    );
    expect(html).toContain(
      '<h2 class="kb-mentions-title" id="mentioned-by-title">Mentioned by</h2>',
    );
    expect(html).toMatch(
      /<a href="\/themes\/system-design-interview\.html">System Design Interview<\/a> <span class="kb-mentions-kind">Themes<\/span>/,
    );
  });

  it("reads the page's own route when none is given", async () => {
    const html = await renderComponent(MentionedBy, {
      locals: at('src/content/docs/patterns/distributed/resilience/circuit-breaker.md'),
    });
    expect(html).toContain('Mentioned by');
  });

  it('renders nothing for a page nobody mentions, or a file outside the collection', async () => {
    expect(
      (await renderComponent(MentionedBy, { props: { route: '/no/such/page.html' } })).trim(),
    ).toBe('');
    expect((await renderComponent(MentionedBy, { locals: at('elsewhere/readme.md') })).trim()).toBe(
      '',
    );
  });
});
