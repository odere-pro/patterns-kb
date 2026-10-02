/**
 * Reading-position tracking over the `.kb-toc` list.
 *
 * The module owns exactly one element, so the cases are the ones a scroll
 * position makes ambiguous: the top of a document, the bottom, and a page with
 * no headings to track.
 */
import { describe, expect, it } from 'vitest';

import { fixture } from '../../lib/dom-fixture';
import { init } from './toc-tracking.client';

const MARKUP = `
  <nav data-kb-toc>
    <ul>
      <li><a href="#one">One</a></li>
      <li><a href="#two">Two</a></li>
      <li><a href="#three">Three</a></li>
    </ul>
  </nav>
  <h2 id="one">One</h2>
  <h2 id="two">Two</h2>
  <h2 id="three">Three</h2>
`;

/**
 * The rail as a laid-out scroll box: 100px tall over a 1000px list, each entry
 * 20px tall and 150px below the one before it, so only "One" starts in view.
 * An entry's box moves up as the rail's `scrollTop` grows, the way layout
 * moves it.
 */
const RAIL = { height: 100, list: 1000, step: 150, entry: 20 };

/**
 * happy-dom lays nothing out, so every getBoundingClientRect is 0×0 at 0,0.
 * The module's whole question is "where is this heading relative to the reading
 * line", so the tops are stubbed per heading — that is the input, not a mock of
 * the code under test.
 *
 * The stub reads the tops out of a mutable record rather than closing over the
 * value, which is what lets `scrollTo` say "the reader moved" and re-run the
 * module against new positions: the rail's scroll behaviour is about the
 * *transition* between two reading positions, so a fixture that can only
 * express one position cannot test it.
 */
function setup(tops: Record<string, number>, opts: { atBottom?: boolean } = {}) {
  const f = fixture(MARKUP);
  const rects: Record<string, number> = { ...tops };
  for (const id of Object.keys(rects)) {
    const el = f.document.getElementById(id);
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => {
        const top = rects[id] ?? 0;
        return { top, bottom: top + 20, left: 0, right: 0, width: 0, height: 20 };
      },
    });
  }
  Object.defineProperty(f.window, 'innerHeight', { configurable: true, value: 800 });
  Object.defineProperty(f.document.documentElement, 'scrollHeight', {
    configurable: true,
    value: opts.atBottom ? 800 : 4000,
  });

  // The module coalesces scroll events into one animation frame. Running the
  // callback synchronously lets a test say "the reader scrolled" in a single
  // statement instead of awaiting a timer that has nothing to do with the
  // behaviour under test.
  Object.defineProperty(f.window, 'requestAnimationFrame', {
    configurable: true,
    value: (cb: (t: number) => void) => {
      cb(0);
      return 0;
    },
  });

  // happy-dom lays nothing out, so the rail's box and its entries' boxes are
  // stubbed, and every `scrollTop` the module writes is recorded: the value is
  // where the rail was asked to go. `scrollIntoView` throws, because it also
  // moves where the next Tab starts from (`reveal` in the module).
  const rail = f.document.querySelector<HTMLElement>('[data-kb-toc]') as HTMLElement;
  const scrolled: number[] = [];
  let railTop = 0;
  Object.defineProperty(rail, 'scrollHeight', { configurable: true, value: RAIL.list });
  Object.defineProperty(rail, 'clientHeight', { configurable: true, value: RAIL.height });
  Object.defineProperty(rail, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top: 0,
      bottom: RAIL.height,
      left: 0,
      right: 0,
      width: 0,
      height: RAIL.height,
    }),
  });
  Object.defineProperty(rail, 'scrollTop', {
    configurable: true,
    get: () => railTop,
    set: (v: number) => {
      railTop = v;
      scrolled.push(v);
    },
  });
  const links = [...f.document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
  links.forEach((link, i) => {
    Object.defineProperty(link, 'getBoundingClientRect', {
      configurable: true,
      value: () => {
        const top = i * RAIL.step - railTop;
        return { top, bottom: top + RAIL.entry, left: 0, right: 0, width: 0, height: RAIL.entry };
      },
    });
    Object.defineProperty(link, 'scrollIntoView', {
      configurable: true,
      value: () => {
        throw new Error('scrollIntoView moves the keyboard; scroll the rail instead');
      },
    });
  });

  const current = (): string | null =>
    f.document.querySelector('[aria-current="true"]')?.textContent ?? null;
  /** Move the headings, then fire the scroll the reader's gesture would fire. */
  const scrollTo = (next: Record<string, number>): void => {
    Object.assign(rects, next);
    f.window.dispatchEvent(new f.window.Event('scroll'));
  };
  return { ...f, current, links, rail, scrolled, scrollTo };
}

describe('table-of-contents tracking', () => {
  it('lights the last heading whose top has passed the reading line', () => {
    // The line sits 100px below the viewport top, so "two" at 40px counts as
    // reached and "three" at 600px does not.
    const f = setup({ one: -300, two: 40, three: 600 });
    init(f.document);
    expect(f.current()).toBe('Two');
  });

  it('falls back to the first entry before anything has been reached', () => {
    const f = setup({ one: 300, two: 600, three: 900 });
    init(f.document);
    expect(f.current()).toBe('One');
  });

  // The tail of a page can never reach the reading line — the document ends
  // first — so at the bottom the deepest heading still on screen is the answer,
  // or the final entries would never light up at all.
  it('lights the deepest visible heading once the page is scrolled to the end', () => {
    const f = setup({ one: -900, two: -400, three: 300 }, { atBottom: true });
    init(f.document);
    expect(f.current()).toBe('Three');
  });

  it('marks exactly one entry at a time', () => {
    const f = setup({ one: -300, two: 40, three: 600 });
    init(f.document);
    expect(f.document.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
  });

  // On a page whose outline is longer than the rail, the entry wearing
  // aria-current spends most of the read outside the rail's scroll box — the
  // one thing the rail exists to say is the one thing you cannot see.
  it('brings the entry it just lit into the rail', () => {
    const f = setup({ one: -300, two: 40, three: 600 });
    init(f.document);
    f.scrolled.length = 0; // the load-time scroll is its own case, below
    f.scrollTo({ two: -300, three: 40 });
    expect(f.current()).toBe('Three');
    // "Three" sits at 300–320 in the list; its bottom meets the rail's at 220.
    expect(f.scrolled).toEqual([220]);
  });

  // The nearest edge and nothing more: "Two" at 150–170 comes to the rail's
  // bottom edge (70), not to its middle (110).
  it('asks for the smallest scroll that works', () => {
    const f = setup({ one: -300, two: 40, three: 600 });
    init(f.document);
    expect(f.scrolled).toEqual([70]);
  });

  it('moves nothing when the entry it lit is already in the rail', () => {
    const f = setup({ one: 300, two: 600, three: 900 });
    init(f.document);
    expect(f.current()).toBe('One');
    expect(f.scrolled).toEqual([]);
  });

  it('scrolls nothing in a rail that holds its whole list', () => {
    const f = setup({ one: -300, two: 40, three: 600 });
    Object.defineProperty(f.rail, 'scrollHeight', { configurable: true, value: 100 });
    init(f.document);
    expect(f.current()).toBe('Two');
    expect(f.scrolled).toEqual([]);
  });

  // Three frames of scrolling inside one section: the reader is moving, the
  // highlight is not. A rail that re-scrolled on every frame would fight anyone
  // who had scrolled it by hand to look ahead.
  it('leaves the rail alone while the current entry does not change', () => {
    const f = setup({ one: -300, two: 40, three: 600 });
    init(f.document);
    f.scrolled.length = 0;
    f.scrollTo({ two: 20 });
    f.scrollTo({ two: 0 });
    f.scrollTo({ two: -10 });
    expect(f.current()).toBe('Two');
    expect(f.scrolled).toEqual([]);
  });

  // Scrolling back up is a change like any other — the guard is "did the entry
  // change", not "did the reader move forwards".
  it('follows the reader back up the page', () => {
    const f = setup({ one: -600, two: -300, three: 40 });
    init(f.document);
    f.scrolled.length = 0;
    f.scrollTo({ two: 300, three: 600 });
    expect(f.current()).toBe('One');
    // Back from 220, where the load put "Three", to the top edge.
    expect(f.scrolled).toEqual([0]);
  });

  // A document nothing has laid out reports every box as 0×0: the rail holds
  // its list, and the highlight still works.
  it('still tracks in a DOM that lays nothing out', () => {
    const f = setup({ one: -300, two: 40, three: 600 });
    Object.defineProperty(f.rail, 'scrollHeight', { configurable: true, value: 0 });
    Object.defineProperty(f.rail, 'clientHeight', { configurable: true, value: 0 });
    expect(() => {
      init(f.document);
    }).not.toThrow();
    expect(f.current()).toBe('Two');
  });

  it('does nothing on a page with no table of contents', () => {
    const f = fixture('<h2 id="one">One</h2>');
    expect(() => {
      init(f.document);
    }).not.toThrow();
  });
});
