// @vitest-environment node
/**
 * The marks page's shell: the three controls, the file input and the lists the
 * client fills. The `node` docblock is the one every render test needs (see
 * ../SectionHub/section-hub.render.test.ts).
 */
import { describe, expect, it } from 'vitest';

import { renderComponent } from '../../lib/render-fixture';

import Marks from './Marks.astro';

describe('Marks', () => {
  it('renders Export, Import, Reset, a hidden file input and the three lists, empty', async () => {
    const html = await renderComponent(Marks, {});
    for (const hook of [
      'data-kb-marks-export',
      'data-kb-marks-import',
      'data-kb-marks-reset',
      'data-kb-marks-file',
      'data-kb-marks-message',
      'data-kb-marks-list="favourites"',
      'data-kb-marks-list="suggested"',
      'data-kb-marks-list="practiced"',
      'data-kb-marks-list="gone"',
    ])
      expect(html, hook).toContain(hook);
    expect(html).toMatch(/<input[^>]*type="file"[^>]*hidden/);
    expect(html).not.toContain('data-kb-skip');
  });

  it('splits favourites into Yours and Suggested, and says what practiced means in its lead', async () => {
    const html = await renderComponent(Marks, {});
    expect(html).toMatch(/<h3[^>]*id="yours"[^>]*>Yours</);
    expect(html).toMatch(/<h3[^>]*id="suggested"[^>]*>Suggested</);
    expect(html).toContain('editors');
    expect(html).toContain('Mark a page practiced when you have used it in real work');
  });

  it('styles Reset as the secondary danger button, still a plain button', async () => {
    const html = await renderComponent(Marks, {});
    expect(html).toMatch(/<button[^>]*kb-marks-button--danger[^>]*data-kb-marks-reset/);
    expect(html).not.toMatch(/kb-marks-button--danger[^>]*data-kb-marks-export/);
  });

  it('keeps the "No longer in the site" section hidden until a stale mark exists', async () => {
    const html = await renderComponent(Marks, {});
    expect(html).toMatch(/<h2[^>]*data-kb-marks-gone-head[^>]*hidden/);
    expect(html).toContain('No longer in the site');
  });
});
