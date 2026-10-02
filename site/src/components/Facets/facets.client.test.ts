/**
 * The hub's filter on the page: chips add up within a rail and narrow across
 * rails, the Favourites chip follows the stars, and a row is hidden by an
 * attribute, never removed. Which chips exist is src/lib/facets.ts's.
 */
import { describe, expect, it } from 'vitest';

import { fixture } from '../../lib/dom-fixture';
import { EMPTY_TEXT, init, SCROLL_KEY } from './facets.client';

const row = (id: string, keys: string, star?: boolean): string =>
  `<li id="${id}" data-kb-facet-keys="${keys}">${id}${star === undefined ? '' : `<button data-kb-favourite="${id}" aria-pressed="${star}"></button>`}</li>`;

const MARKUP = `
  <div data-kb-facets>
    <button data-kb-facet="topic:caching" aria-pressed="false"></button>
    <button data-kb-facet="topic:messaging" aria-pressed="false"></button>
    <button data-kb-facet="skill:latency" aria-pressed="false"></button>
    <div data-kb-facet-show><button data-kb-facet-favourites aria-pressed="false"></button></div>
    <p data-kb-facet-status></p>
    <button data-kb-facet-clear hidden>Clear filters</button>
  </div>
  <ol>
    ${row('a', 'topic:caching skill:latency', true)}
    ${row('b', 'topic:messaging skill:throughput', false)}
    ${row('c', 'topic:caching skill:throughput', false)}
    ${row('d', '')}
  </ol>
`;

const shown = (doc: Document): string[] =>
  [...doc.querySelectorAll('[data-kb-facet-keys]')]
    .filter((r) => !r.hasAttribute('data-kb-facet-out'))
    .map((r) => r.id);
const status = (doc: Document): string =>
  doc.querySelector('[data-kb-facet-status]')?.textContent ?? '';
const click = (doc: Document, selector: string): void => {
  doc
    .querySelector(selector)
    ?.dispatchEvent(new doc.defaultView!.MouseEvent('click', { bubbles: true }));
};

describe('the hub filter', () => {
  it('returns quietly on a page with no bar', () => {
    const f = fixture(row('a', 'topic:caching'));
    init(f.document);
    expect(shown(f.document)).toEqual(['a']);
  });

  it('shows every row and says nothing until a chip is pressed', () => {
    const f = fixture(MARKUP);
    init(f.document);
    expect(shown(f.document)).toEqual(['a', 'b', 'c', 'd']);
    expect(status(f.document)).toBe('');
  });

  it('adds chips up within a rail, narrows across rails, and releases on a second press', () => {
    const f = fixture(MARKUP);
    init(f.document);
    click(f.document, '[data-kb-facet="topic:caching"]');
    expect(shown(f.document)).toEqual(['a', 'c']);
    expect(status(f.document)).toBe('2 of 4 shown');
    click(f.document, '[data-kb-facet="topic:messaging"]');
    expect(shown(f.document)).toEqual(['a', 'b', 'c']);
    click(f.document, '[data-kb-facet="skill:latency"]');
    expect(shown(f.document)).toEqual(['a']);
    expect(
      f.document.querySelector('[data-kb-facet="skill:latency"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    click(f.document, '[data-kb-facet="skill:latency"]');
    click(f.document, '[data-kb-facet="topic:caching"]');
    click(f.document, '[data-kb-facet="topic:messaging"]');
    expect(shown(f.document)).toEqual(['a', 'b', 'c', 'd']);
    expect(status(f.document)).toBe('');
  });

  it('keeps only starred rows under the Favourites chip, and follows a star that changes', () => {
    const f = fixture(MARKUP);
    init(f.document);
    click(f.document, '[data-kb-facet-favourites]');
    expect(shown(f.document)).toEqual(['a']);
    expect(
      f.document.querySelector('[data-kb-facet-favourites]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    f.document.querySelector('[data-kb-favourite="c"]')?.setAttribute('aria-pressed', 'true');
    f.document.dispatchEvent(new f.window.CustomEvent('kb-favourites-change') as unknown as Event);
    expect(shown(f.document)).toEqual(['a', 'c']);
    click(f.document, '[data-kb-facet-favourites]');
    expect(shown(f.document)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('hides the Favourites chip while no row is starred, unless it is on', () => {
    const f = fixture(MARKUP.replace('aria-pressed="true"', 'aria-pressed="false"'));
    init(f.document);
    const chip = f.document.querySelector<HTMLElement>('[data-kb-facet-favourites]');
    const row = f.document.querySelector<HTMLElement>('[data-kb-facet-show]');
    expect(chip?.hidden).toBe(true);
    expect(row?.hidden).toBe(true);
    f.document.querySelector('[data-kb-favourite="b"]')?.setAttribute('aria-pressed', 'true');
    f.document.dispatchEvent(new f.window.CustomEvent('kb-favourites-change') as unknown as Event);
    expect(chip?.hidden).toBe(false);
    expect(row?.hidden).toBe(false);
  });

  it('shows "Clear filters" while any chip or Starred is on, and one press puts every row back', () => {
    const f = fixture(MARKUP);
    init(f.document);
    const clear = f.document.querySelector<HTMLElement>('[data-kb-facet-clear]');
    expect(clear?.hidden).toBe(true);
    click(f.document, '[data-kb-facet="topic:caching"]');
    expect(clear?.hidden).toBe(false);
    click(f.document, '[data-kb-facet-favourites]');
    click(f.document, '[data-kb-facet-clear]');
    expect(shown(f.document)).toEqual(['a', 'b', 'c', 'd']);
    expect(status(f.document)).toBe('');
    expect(clear?.hidden).toBe(true);
    for (const chip of f.document.querySelectorAll('[aria-pressed]'))
      if (chip.hasAttribute('data-kb-facet') || chip.hasAttribute('data-kb-facet-favourites'))
        expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows Clear filters for the Starred toggle alone', () => {
    const f = fixture(MARKUP);
    init(f.document);
    click(f.document, '[data-kb-facet-favourites]');
    expect(f.document.querySelector<HTMLElement>('[data-kb-facet-clear]')?.hidden).toBe(false);
  });

  it('says one sentence when the filter leaves nothing, and the count again once it does', () => {
    const f = fixture(MARKUP);
    init(f.document);
    click(f.document, '[data-kb-facet="topic:messaging"]');
    click(f.document, '[data-kb-facet="skill:latency"]');
    expect(shown(f.document)).toEqual([]);
    expect(status(f.document)).toBe(EMPTY_TEXT);
    expect(EMPTY_TEXT).toBe('No pages match these filters.');
    expect(
      f.document.querySelector('[data-kb-facet-status]')?.hasAttribute('data-kb-facet-empty'),
    ).toBe(true);
    click(f.document, '[data-kb-facet="skill:latency"]');
    expect(status(f.document)).toBe('1 of 4 shown');
    expect(
      f.document.querySelector('[data-kb-facet-status]')?.hasAttribute('data-kb-facet-empty'),
    ).toBe(false);
  });

  it('ignores a click inside the bar that is on no chip, and works with no status line or Favourites chip', () => {
    const f = fixture(
      MARKUP.replace('<p data-kb-facet-status></p>', '<span id="gap">x</span>').replace(
        '<div data-kb-facet-show><button data-kb-facet-favourites aria-pressed="false"></button></div>',
        '',
      ),
    );
    init(f.document);
    click(f.document, '#gap');
    expect(shown(f.document)).toEqual(['a', 'b', 'c', 'd']);
    click(f.document, '[data-kb-facet="topic:messaging"]');
    expect(shown(f.document)).toEqual(['b']);
  });
});

describe('the filter in the URL', () => {
  const at = (query: string): ReturnType<typeof fixture> => {
    const f = fixture(MARKUP);
    f.window.happyDOM.setURL(`https://kb.test/hub.html${query}`);
    return f;
  };
  const search = (f: ReturnType<typeof fixture>): string => f.window.location.search;

  it('writes the pressed chips and the Favourites chip to the query, and clears them again', () => {
    const f = at('?keep=1#top');
    init(f.document);
    click(f.document, '[data-kb-facet="topic:caching"]');
    click(f.document, '[data-kb-facet-favourites]');
    const url = new URL(f.window.location.href);
    expect(url.searchParams.getAll('f')).toEqual(['topic:caching']);
    expect(url.searchParams.get('fav')).toBe('1');
    expect(url.searchParams.get('keep')).toBe('1');
    expect(url.hash).toBe('#top');
    click(f.document, '[data-kb-facet="topic:caching"]');
    click(f.document, '[data-kb-facet-favourites]');
    expect(search(f)).toBe('?keep=1');
  });

  it('restores the filter from a link at init, rows and chips both', () => {
    const f = at('?f=topic%3Acaching&f=skill%3Alatency&fav=1');
    init(f.document);
    expect(shown(f.document)).toEqual(['a']);
    expect(status(f.document)).toBe('1 of 4 shown');
    expect(
      f.document.querySelector('[data-kb-facet="skill:latency"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      f.document.querySelector('[data-kb-facet-favourites]')?.getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('ignores a key no chip carries and a Favourites flag with no chip, without error', () => {
    const f = at('?f=topic%3Anope&f=junk&fav=1');
    f.document.querySelector('[data-kb-facet-favourites]')?.remove();
    expect(() => init(f.document)).not.toThrow();
    expect(shown(f.document)).toEqual(['a', 'b', 'c', 'd']);
    expect(status(f.document)).toBe('');
  });

  it('follows the URL when history moves', () => {
    const f = at('');
    init(f.document);
    f.window.happyDOM.setURL('https://kb.test/hub.html?f=topic%3Amessaging');
    f.window.dispatchEvent(new f.window.PopStateEvent('popstate'));
    expect(shown(f.document)).toEqual(['b']);
  });

  it('keeps filtering when the browser refuses to rewrite the URL', () => {
    const f = at('');
    init(f.document);
    f.window.history.replaceState = () => {
      throw new Error('forbidden');
    };
    click(f.document, '[data-kb-facet="topic:caching"]');
    expect(shown(f.document)).toEqual(['a', 'c']);
  });
});

describe('the scroll position on Back', () => {
  const at = (state: unknown): ReturnType<typeof fixture> => {
    const f = fixture(MARKUP);
    f.window.happyDOM.setURL('https://kb.test/hub.html?f=topic%3Acaching');
    f.window.history.replaceState(state, '');
    return f;
  };

  it('puts the reader back at the y their history entry holds, and turns the browser’s own restore off', () => {
    const f = at({ [SCROLL_KEY]: 640 });
    const calls: [number, number][] = [];
    f.window.scrollTo = (x: number, y: number) => calls.push([x, y]);
    init(f.document);
    expect(f.window.history.scrollRestoration).toBe('manual');
    expect(calls[0]).toEqual([0, 640]);
  });

  it('keeps the filter and the scroll in one entry: a chip press leaves the stored y alone', () => {
    const f = at({ [SCROLL_KEY]: 300 });
    f.window.scrollTo = () => undefined;
    init(f.document);
    click(f.document, '[data-kb-facet="topic:messaging"]');
    expect((f.window.history.state as Record<string, number>)[SCROLL_KEY]).toBe(300);
  });

  it('writes the position into the entry when the page is left', () => {
    const f = at(null);
    init(f.document);
    Object.defineProperty(f.window, 'scrollY', { value: 412, configurable: true });
    f.window.dispatchEvent(new f.window.Event('pagehide'));
    expect((f.window.history.state as Record<string, number>)[SCROLL_KEY]).toBe(412);
  });

  it('does not scroll for a fresh visit, and survives a history that refuses', () => {
    const f = at(null);
    const calls: unknown[] = [];
    f.window.scrollTo = (...a: unknown[]) => calls.push(a);
    init(f.document);
    expect(calls).toEqual([]);
    const g = at({ [SCROLL_KEY]: 5 });
    Object.defineProperty(g.window.history, 'scrollRestoration', {
      set() {
        throw new Error('closed');
      },
      get: () => 'auto',
    });
    expect(() => init(g.document)).not.toThrow();
  });
});
