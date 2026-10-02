/**
 * Showing the current page in the left sidebar on arrival.
 *
 * The module writes one number, so the cases are the ones that decide whether
 * it should be written at all: an entry below the fold, an entry already in
 * view, a sidebar with nothing to scroll, and a page with no sidebar or no
 * current entry to find.
 */
import { describe, expect, it } from 'vitest';

import { fixture } from '../../lib/dom-fixture';
import { init } from './sidebar-scroll.client';

const LINKS = ['top', 'middle', 'current', 'bottom'];

const MARKUP = `
  <div id="starlight__sidebar">
    <nav>
      <ul>
        ${LINKS.map((id) => `<li><a id="${id}" href="/${id}/">${id}</a></li>`).join('\n')}
      </ul>
    </nav>
  </div>
`;

interface Geometry {
  /** Where each link sits in the list, top edge first, in pane coordinates. */
  tops: Record<string, number>;
  /** The pane's own box: 400px tall, pinned at the top of the viewport. */
  paneHeight?: number;
  scrollHeight?: number;
  current?: string;
}

/**
 * happy-dom lays nothing out: every box is 0×0 at 0,0 and both scroll metrics
 * are 0. The module's whole question is "is this entry inside that box", so
 * the boxes are the fixture's input — stubbed once, from a list of tops the
 * test states in the units it reasons about.
 *
 * A link's rect is derived from the pane's scroll position rather than fixed,
 * because that is the relationship the module reads: a viewport rect moves up
 * as the box scrolls down, and a fixture that cannot express that cannot tell
 * a correct scroll from one that lands 400px off.
 */
function setup(geo: Geometry) {
  const f = fixture(MARKUP);
  const paneHeight = geo.paneHeight ?? 400;
  const pane = f.document.getElementById('starlight__sidebar');
  if (!pane) throw new Error('fixture lost its pane');

  const state = { scrollTop: 0 };
  Object.defineProperty(pane, 'scrollTop', {
    configurable: true,
    get: () => state.scrollTop,
    set: (v: number) => {
      state.scrollTop = v;
    },
  });
  Object.defineProperty(pane, 'clientHeight', { configurable: true, value: paneHeight });
  Object.defineProperty(pane, 'scrollHeight', {
    configurable: true,
    value: geo.scrollHeight ?? 2000,
  });
  Object.defineProperty(pane, 'getBoundingClientRect', {
    configurable: true,
    value: () => box(0, paneHeight),
  });

  for (const [id, top] of Object.entries(geo.tops)) {
    const link = f.document.getElementById(id);
    Object.defineProperty(link, 'getBoundingClientRect', {
      configurable: true,
      value: () => box(top - state.scrollTop, 20),
    });
  }

  const current = geo.current === undefined ? 'current' : geo.current;
  if (current) f.document.getElementById(current)?.setAttribute('aria-current', 'page');

  return { ...f, pane, scrollTop: () => state.scrollTop };
}

const box = (top: number, height: number) => ({
  top,
  bottom: top + height,
  height,
  left: 0,
  right: 0,
  width: 0,
});

describe('sidebar-scroll', () => {
  it('centres an entry that starts below the fold', () => {
    const s = setup({ tops: { current: 1200 } });

    init(s.document);

    // 1200 − (400 − 20) / 2: the entry sits in the middle of the pane, with
    // its neighbours above and below it.
    expect(s.scrollTop()).toBe(1010);
    expect(s.pane.querySelector('#current')?.getBoundingClientRect().top).toBe(190);
  });

  it('leaves the pane alone when the entry is already in view', () => {
    const s = setup({ tops: { current: 120 } });

    init(s.document);

    expect(s.scrollTop()).toBe(0);
  });

  it('asks for the same centring for the last entry, which the browser clamps', () => {
    // 1950 − 190 is past the end of a 2000px list in a 400px box. The module
    // states the position it wants and lets the browser clamp it to 1600,
    // which puts the last entry at the bottom of the box; happy-dom does not
    // clamp, so what a test can see is the number that was asked for.
    const s = setup({ tops: { current: 1950 }, scrollHeight: 2000 });

    init(s.document);

    expect(s.scrollTop()).toBe(1760);
  });

  it('does nothing when the sidebar has nothing to scroll', () => {
    const s = setup({ tops: { current: 1200 }, scrollHeight: 300 });

    init(s.document);

    expect(s.scrollTop()).toBe(0);
  });

  it('does nothing when no entry is the current page', () => {
    const s = setup({ tops: { current: 1200 }, current: '' });

    init(s.document);

    expect(s.scrollTop()).toBe(0);
  });

  it('does nothing on a page with no sidebar', () => {
    const f = fixture('<main><h1>Splash</h1></main>');

    expect(() => init(f.document)).not.toThrow();
  });
});
