// @vitest-environment node
/**
 * The home page's Start-here block, rendered from the real tracks file. The
 * `node` docblock is the one every render test needs (see
 * ../SectionHub/section-hub.render.test.ts).
 */
import { describe, expect, it } from 'vitest';

import { renderComponent } from '../../lib/render-fixture';
import { startTracks } from '../../lib/tracks';

import StartHere from './StartHere.astro';

const render = (): Promise<string> => renderComponent(StartHere, { props: {} });

describe('StartHere', () => {
  it('renders 4 to 6 tracks, each with its heading, blurb and ordered steps', async () => {
    const html = await render();
    const tracks = html.match(/<li class="kb-start-here-track"/g) ?? [];
    expect(tracks.length).toBeGreaterThanOrEqual(4);
    expect(tracks.length).toBeLessThanOrEqual(6);
    expect(html).toContain('<h2 id="next-steps" class="kb-kicker">Start here</h2>');
    expect(html).toContain('Ready for a system design interview');
  });

  it('lists a track’s steps in the file’s order, easiest first, each a link to its theme page', async () => {
    const html = await render();
    const first = startTracks()[0];
    const at = (first?.steps ?? []).map((s) =>
      html.indexOf(`<a class="kb-start-here-step" href="${s.route}">`),
    );
    expect(at.every((i) => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('links every step to a theme page, plus the Themes hub, and has no search button', async () => {
    const html = await render();
    const steps = startTracks().flatMap((t) => t.steps);
    expect(html.match(/<a class="kb-start-here-step" href="\/themes\/[^"]+\.html">/g)).toHaveLength(
      steps.length,
    );
    expect(html).toContain('href="/themes.html"');
    expect(html.match(/<a /g)).toHaveLength(steps.length + 1);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('data-kb-search');
  });

  it('carries id="next-steps" on its heading, which ends the link gate’s count of a hub', async () => {
    const html = await render();
    expect(html).toContain('<h2 id="next-steps" class="kb-kicker">Start here</h2>');
    expect(html).toContain('aria-labelledby="next-steps"');
  });

  it('shows each step’s tier and bakes the practiced hook into each track', async () => {
    const html = await render();
    expect(html).toContain('<span class="kb-start-here-tier">Intro</span>');
    expect(html).toContain('<span class="kb-start-here-tier">Advanced</span>');
    const hooks = html.match(/class="kb-start-here-track" data-kb-practiced-tour="[^"]+"/g) ?? [];
    expect(hooks.length).toBe(startTracks().length);
    expect(html).toContain('data-kb-practiced-tour-text');
    expect(html).not.toContain('data-kb-practiced-tours');
  });

  it('carries no skip marker (it sits in the knowledge region), no script, style or inline style', async () => {
    const html = await render();
    expect(html).not.toContain('data-kb-skip');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('style=');
  });
});
