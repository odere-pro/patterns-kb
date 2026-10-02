// @vitest-environment node
/**
 * The home cards over the real structure file: one per top-level area that has
 * a hub, each with the count of the pages beneath it, taken from the file at
 * build time and never typed. The `node` docblock is the one every render test
 * needs (see ../SectionHub/section-hub.render.test.ts).
 */
import { describe, expect, it } from 'vitest';

import structureFile from '../../../../docs/data/site-structure.json';
import { navOf, placedPages, type Structure } from '../../../../tools/src/lib/site-routes';
import { countLine } from '../../lib/counts';
import { renderComponent } from '../../lib/render-fixture';

import SiteMap from './SiteMap.astro';

const structure = structureFile as Structure;

describe('SiteMap', () => {
  it('draws one card per top-level area that opens, each hub card with its page count', async () => {
    const html = await renderComponent(SiteMap, {});
    const tops = structure.areas.filter((a) => a.nestUnder === undefined && navOf(a) !== 'none');
    expect(html.match(/class="kb-card"/g)).toHaveLength(tops.length);
    for (const area of tops) {
      const line = countLine(structure, area.id);
      if (navOf(area) === 'link') expect(line).toBeNull();
      else expect(html, area.id).toContain(`<span class="kb-card-count">${line}</span>`);
    }
  });

  it('counts the hazards from the structure rows, so a page added moves the card', async () => {
    const hazards = placedPages(structure).filter((p) => p.area === 'hazards').length;
    expect(await renderComponent(SiteMap, {})).toContain(`${hazards} hazards`);
  });

  it('says each card’s sentence in one sentence', () => {
    for (const a of structure.areas.filter(
      (x) => x.nestUnder === undefined && navOf(x) !== 'none',
    )) {
      const sentences = a.hub.description.split(/(?<=[.!?])\s+/).filter((t) => t !== '');
      expect(sentences, a.id).toHaveLength(1);
    }
  });
});
