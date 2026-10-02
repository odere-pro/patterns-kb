/**
 * The home cards' count lines, read off a small structure so the suite does not
 * move when the real file does, plus one pass over the real file: every card of
 * a top-level hub says a number, and the stack index's card says none.
 */
import { describe, expect, it } from 'vitest';

import structureFile from '../../../docs/data/site-structure.json';
import type { Structure } from '../../../tools/src/lib/site-routes';
import { countLine } from './counts';

const hub = { description: 'd', intro: 'i', tags: [] };
const page = (slug: string) => ({ slug, label: slug, source: `docs/x/${slug}.md` });
const tiny: Structure = {
  areas: [
    { id: 'patterns', label: 'Patterns', hub, pages: [] },
    { id: 'caching', label: 'Caching', nestUnder: 'patterns', hub, pages: [page('a'), page('b')] },
    { id: 'gof', label: 'Objects', nestUnder: 'patterns', hub, pages: [page('c')] },
    { id: 'hazards', label: 'Hazards', hub, pages: [page('h')] },
    { id: 'designs', label: 'Case Studies', hub, pages: [] },
    { id: 'map', label: 'Stack', nav: 'link', hub, pages: [page('stack')] },
  ],
};

describe('countLine', () => {
  it('counts a top-level area by every page beneath it, in the kind’s own word', () => {
    expect(countLine(tiny, 'patterns')).toBe('3 patterns');
  });

  it('says the singular for one page', () => {
    expect(countLine(tiny, 'hazards')).toBe('1 hazard');
  });

  it('says nothing for an area with no page, a link area, or an id the file lacks', () => {
    expect(countLine(tiny, 'designs')).toBeNull();
    expect(countLine(tiny, 'map')).toBeNull();
    expect(countLine(tiny, 'nope')).toBeNull();
  });

  it('gives every real top-level hub a count', () => {
    const real = structureFile as Structure;
    for (const a of real.areas.filter((x) => x.nestUnder === undefined && x.nav === undefined)) {
      expect(countLine(real, a.id), a.id).toMatch(/^\d+ /);
    }
  });
});
