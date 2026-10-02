/**
 * The search box, over a stub payload. The ranking is
 * tools/src/lib/search-score.ts's and tested there, so the cases here are
 * about what the DOM does with a result set: every match drawn, the note that
 * speaks, the anchors, the glossary cards and the keyboard.
 */
import { describe, expect, it } from 'vitest';

import { fixture } from '../../lib/dom-fixture';
import type { SearchPage, SearchPayload } from '../../../../tools/src/lib/search-score';
import { hrefFor, init, kindLabel, routePrefix, shortcutLabel, typingInto } from './search.client';

const page = (over: Partial<SearchPage>): SearchPage => ({
  route: '/x.html',
  title: 'A page',
  kind: 'patterns',
  description: 'What it is.',
  area: 'patterns',
  status: 'stable',
  tags: [],
  categories: [],
  aliases: [],
  solves: [],
  headings: [],
  ...over,
});

/** Twelve pages whose titles all match "breaker", to prove none is left undrawn. */
const MANY: SearchPayload = {
  pages: Array.from({ length: 12 }, (_, i) =>
    page({ route: `/notes/breaker-${i}.html`, title: `Breaker note ${i}` }),
  ),
  terms: [],
  tagLabels: {},
  synonyms: {},
};

const PAYLOAD: SearchPayload = {
  pages: [
    page({
      route: '/patterns/retry.html',
      title: 'Retry',
      description: 'Try a failed call again.',
    }),
    page({
      route: '/patterns/resilience/circuit-breaker.html',
      title: 'Circuit Breaker',
      description: 'Stops calling a failing service.',
      area: 'resilience',
      solves: [
        'a slow downstream eats my threads',
        'one failing dependency took down my whole service',
      ],
      headings: [{ id: 'half-open', text: 'Half-open probes' }],
    }),
    page({ route: '/start.html', title: 'Get started', description: '' }),
  ],
  terms: [
    { id: 'breaker', term: 'breaker', definition: 'A switch that stops the calls.', aliases: [] },
  ],
  tagLabels: {},
  synonyms: {},
};

/** The markup Search.astro emits, trimmed to what the module reads. */
const DIALOG = `
  <button data-kb-search-open></button>
  <kbd data-kb-search-hint>Ctrl K</kbd>
  <dialog data-kb-search-dialog>
    <form>
      <input data-kb-search-input type="search" role="combobox" aria-expanded="false" aria-controls="kb-search-results" />
      <button type="button" data-kb-search-close></button>
    </form>
    <div data-kb-search-terms></div>
    <ul id="kb-search-results" data-kb-search-results role="listbox"></ul>
    <div data-kb-search-more></div>
    <p class="kb-search-note kb-visually-hidden" data-kb-search-note role="status"></p>
  </dialog>
`;

function setup(body = DIALOG, payload: SearchPayload | null = PAYLOAD, area = 'patterns') {
  const f = fixture(
    `<meta name="kb:area" content="${area}"><script data-kb="bundle" src="../kb.js"></script>${body}`,
  );
  if (payload) (f.window as unknown as { kb: SearchPayload }).kb = payload;
  return f;
}

type F = ReturnType<typeof setup>;

/**
 * Keeps every script the box adds to <head> out of the document, so the test
 * says when it loads or fails; happy-dom would answer at once, with an error.
 */
const holdScripts = (f: F): HTMLScriptElement[] => {
  const held: HTMLScriptElement[] = [];
  const head = f.document.head;
  head.appendChild = <T extends Node>(node: T): T => {
    held.push(node as unknown as HTMLScriptElement);
    return node;
  };
  return held;
};

// Not the DOM lib's KeyboardEventInit: its `view` clashes with happy-dom's.
const key = (f: F, init: { key: string; ctrlKey?: boolean; metaKey?: boolean }): void => {
  f.document.dispatchEvent(
    new f.window.KeyboardEvent('keydown', { bubbles: true, ...init }) as unknown as Event,
  );
};
const type = (f: F, value: string): void => {
  const input = f.document.querySelector<HTMLInputElement>('[data-kb-search-input]')!;
  input.value = value;
  input.dispatchEvent(new f.window.Event('input', { bubbles: true }) as unknown as Event);
};
const open = (f: F): void => key(f, { key: 'k', ctrlKey: true });
const rows = (f: F): string[] =>
  [...f.document.querySelectorAll('[data-kb-search-results] .kb-search-title')].map(
    (n) => n.textContent ?? '',
  );
const note = (f: F): HTMLElement => f.document.querySelector<HTMLElement>('[data-kb-search-note]')!;
const dialog = (f: F): HTMLDialogElement =>
  f.document.querySelector<HTMLDialogElement>('[data-kb-search-dialog]')!;
const firstHref = (f: F): string | null =>
  f.document.querySelector('.kb-search-link')?.getAttribute('href') ?? null;

describe('routePrefix and hrefFor', () => {
  it('reads the prefix the post-build pass worked out off the bundle, and joins a route under it', () => {
    expect(
      routePrefix(fixture('<script data-kb="bundle" src="../../kb.js"></script>').document),
    ).toBe('../../');
    expect(routePrefix(fixture('').document)).toBe('');
    expect(
      routePrefix(fixture('<script data-kb="bundle" src="../kb.3fa9c1d2.js"></script>').document),
    ).toBe('../');
    expect(hrefFor('../', '/a/b.html')).toBe('../a/b.html');
    expect(hrefFor('/', '/a/b.html')).toBe('/a/b.html');
  });
});

describe('typingInto', () => {
  it('is true for a field or an editable element and false for the page', () => {
    const f = fixture('<input id="i"><div id="d"></div><div id="e" contenteditable="true"></div>');
    expect(typingInto(f.document.getElementById('i'))).toBe(true);
    expect(typingInto(f.document.getElementById('d'))).toBe(false);
    const editable = f.document.getElementById('e') as HTMLElement;
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(typingInto(editable)).toBe(true);
    expect(typingInto(null)).toBe(false);
  });
});

describe('the search box', () => {
  it('opens on Ctrl K and closes on a second press, on the close button and on Escape', () => {
    const f = setup();
    init(f.document);
    expect(dialog(f).open).toBe(false);
    open(f);
    expect(dialog(f).open).toBe(true);
    open(f);
    expect(dialog(f).open).toBe(false);
    f.document.querySelector<HTMLElement>('[data-kb-search-open]')!.click();
    expect(dialog(f).open).toBe(true);
    f.document.querySelector<HTMLElement>('[data-kb-search-close]')!.click();
    expect(dialog(f).open).toBe(false);
    open(f);
    key(f, { key: 'Escape' });
    expect(dialog(f).open).toBe(false);
  });

  it('opens on "/" from the page and leaves a slash typed into a field alone', () => {
    const f = setup(`${DIALOG}<input id="elsewhere">`);
    init(f.document);
    f.document
      .getElementById('elsewhere')!
      .dispatchEvent(
        new f.window.KeyboardEvent('keydown', { key: '/', bubbles: true }) as unknown as Event,
      );
    expect(dialog(f).open).toBe(false);
    key(f, { key: 'x' });
    expect(dialog(f).open).toBe(false);
    key(f, { key: '/' });
    expect(dialog(f).open).toBe(true);
  });

  it('offers nothing until something is typed, and says what the box is for', () => {
    const f = setup();
    init(f.document);
    open(f);
    expect(rows(f)).toEqual([]);
    expect(note(f).classList.contains('kb-visually-hidden')).toBe(false);
    expect(note(f).textContent).toContain('Type a name');
    expect(
      f.document.querySelector('[data-kb-search-input]')?.hasAttribute('aria-activedescendant'),
    ).toBe(false);
  });

  it('ranks by what went wrong and links each row relative to this page', () => {
    const f = setup();
    init(f.document);
    open(f);
    type(f, 'failing dependency took down');
    expect(rows(f)[0]).toBe('Circuit Breaker');
    expect(firstHref(f)).toBe('../patterns/resilience/circuit-breaker.html');
  });

  it('puts the definition above the pages when the query starts a glossary term', () => {
    const f = setup();
    init(f.document);
    open(f);
    type(f, 'breaker');
    expect(f.document.querySelector('.kb-search-term-def')?.textContent).toBe(
      'A switch that stops the calls.',
    );
  });

  it('puts a definition the query names above the pages, and one it only begins to name after them', () => {
    const terms = ['generalizes', 'generic', 'generator', 'generation', 'gen'].map((t) => ({
      id: t,
      term: t,
      definition: `What ${t} means.`,
      aliases: [],
    }));
    const payload: SearchPayload = {
      pages: [page({ route: '/unique-id-generation.html', title: 'Unique ID Generation' })],
      terms,
      tagLabels: {},
      synonyms: {},
    };
    const f = setup(DIALOG, payload);
    init(f.document);
    open(f);
    type(f, 'gen');
    const all = [
      ...f.document.querySelectorAll(
        '[data-kb-search-terms] > *, [data-kb-search-results] > *, [data-kb-search-more] > *',
      ),
    ];
    const order = all.map((n) =>
      n.classList.contains('kb-search-term')
        ? `card:${n.querySelector('.kb-search-term-name')!.textContent}`
        : 'row',
    );
    expect(order).toEqual([
      'card:gen',
      'row',
      'card:generalizes',
      'card:generic',
      'card:generator',
    ]);
    type(f, 'generation');
    expect(f.document.querySelectorAll('[data-kb-search-more] .kb-search-term')).toHaveLength(0);
    expect(f.document.querySelectorAll('[data-kb-search-terms] .kb-search-term')).toHaveLength(1);
  });

  it('ranks with the payload’s synonyms and tag labels', () => {
    const payload: SearchPayload = {
      pages: [
        page({
          route: '/ai-agent.html',
          title: 'Agent loop',
          tags: ['event-driven'],
          description: 'A model in a loop with tools',
        }),
      ],
      terms: [],
      tagLabels: { 'event-driven': 'Reactive streams' },
      synonyms: { ai: ['model'] },
    };
    const f = setup(DIALOG, payload);
    init(f.document);
    open(f);
    type(f, 'ai');
    expect(rows(f)).toEqual(['Agent loop']);
    type(f, 'reactive streams');
    expect(rows(f)).toEqual(['Agent loop']);
  });

  it('reads a payload with no synonyms or tag labels, as astro dev serves one', () => {
    const f = setup();
    const view = f.window as unknown as { kb: Partial<SearchPayload> };
    view.kb = { pages: PAYLOAD.pages, terms: [] };
    init(f.document);
    open(f);
    type(f, 'retry');
    expect(rows(f)).toEqual(['Retry']);
  });

  it('shows no snippet that only repeats the heading the row names', () => {
    const one = page({
      route: '/p.html',
      title: 'Bulkhead',
      headings: [{ id: 'tuning-knobs', text: 'Tuning knobs' }],
      solves: ['tuning knobs'],
    });
    const f = setup(DIALOG, { pages: [one], terms: [], tagLabels: {}, synonyms: {} });
    init(f.document);
    open(f);
    type(f, 'tuning knobs');
    expect(rows(f)).toEqual(['Tuning knobs']);
    expect(f.document.querySelector('.kb-search-snip')).toBeNull();
  });

  it('lands on the heading a query matched, naming its page above it', () => {
    const f = setup();
    init(f.document);
    open(f);
    type(f, 'half-open probes');
    expect(firstHref(f)).toBe('../patterns/resilience/circuit-breaker.html#half-open');
    expect(rows(f)[0]).toBe('Half-open probes');
    expect(f.document.querySelector('.kb-search-trail')?.textContent).toBe('Circuit Breaker');
  });

  it('quotes the symptom the query landed in, marked where it matched', () => {
    const f = setup();
    init(f.document);
    open(f);
    type(f, 'breaker dependency');
    expect(f.document.querySelector('.kb-search-snip')?.textContent).toBe(
      'one failing dependency took down my whole service',
    );
    expect(f.document.querySelector('.kb-search-snip mark')?.textContent).toBe('dependency');
  });

  it('shows no snippet for a page found by its name alone, and no description line when it has none', () => {
    const f = setup();
    init(f.document);
    open(f);
    type(f, 'started');
    expect(rows(f)).toEqual(['Get started']);
    expect(f.document.querySelector('.kb-search-snip')).toBeNull();
    expect(f.document.querySelector('.kb-search-desc')).toBeNull();
  });

  it('builds the snippet from text nodes, so markup in the payload stays text', () => {
    const one = page({
      title: 'Breaker',
      solves: ['a <b>breaker</b> tag is shown as written'],
    });
    const f = setup(DIALOG, { pages: [one], terms: [], tagLabels: {}, synonyms: {} });
    init(f.document);
    open(f);
    type(f, 'breaker');
    expect(f.document.querySelector('.kb-search-snip')?.textContent).toBe(
      'a <b>breaker</b> tag is shown as written',
    );
    expect(f.document.querySelector('.kb-search-snip b')).toBeNull();
  });

  it('retries one typo and names both queries rather than rewriting quietly', () => {
    const f = setup();
    init(f.document);
    open(f);
    type(f, 'brekaer');
    expect(rows(f)).toEqual(['Circuit Breaker']);
    expect(note(f).textContent).toBe('Nothing matched “brekaer”. Showing 1 result for “breaker”.');
    expect(note(f).classList.contains('kb-visually-hidden')).toBe(false);
  });

  it('says how many results a correction found', () => {
    const f = setup(DIALOG, MANY);
    init(f.document);
    open(f);
    type(f, 'brekaer');
    expect(rows(f)).toHaveLength(12);
    expect(note(f).textContent).toBe(
      'Nothing matched “brekaer”. Showing 12 results for “breaker”.',
    );
  });

  it('draws the best twenty rows of a longer list and says how many there are', () => {
    const big: SearchPayload = {
      pages: Array.from({ length: 25 }, (_, i) =>
        page({ route: `/n/breaker-${i}.html`, title: `Breaker note ${i}` }),
      ),
      terms: [],
      tagLabels: {},
      synonyms: {},
    };
    const f = setup(DIALOG, big);
    init(f.document);
    open(f);
    type(f, 'breaker');
    expect(rows(f)).toHaveLength(20);
    expect(note(f).textContent).toBe('Showing the first 20 of 25 results for “breaker”.');
    expect(note(f).classList.contains('kb-visually-hidden')).toBe(false);
  });

  it('says so when neither the query nor any variant matched', () => {
    const f = setup();
    init(f.document);
    open(f);
    type(f, 'zzzzq');
    expect(rows(f)).toEqual([]);
    expect(note(f).textContent).toBe('Nothing matched “zzzzq”.');
    expect(note(f).classList.contains('kb-visually-hidden')).toBe(false);
  });

  it('announces the count without painting it, never hiding the live region', () => {
    const f = setup(DIALOG, MANY);
    init(f.document);
    open(f);
    type(f, 'breaker');
    expect(rows(f)).toHaveLength(12);
    expect(note(f).textContent).toBe('12 results for “breaker”.');
    expect(note(f).classList.contains('kb-visually-hidden')).toBe(true);
    for (const q of ['', 'breaker', 'zzzzq', '   ']) {
      type(f, q);
      expect(note(f).hasAttribute('hidden')).toBe(false);
    }
  });

  it('says "1 result", keeps aria-expanded honest, and clears the cards when the box is cleared', () => {
    const f = setup();
    init(f.document);
    const input = f.document.querySelector<HTMLInputElement>('[data-kb-search-input]')!;
    open(f);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    type(f, 'retry');
    expect(note(f).textContent).toBe('1 result for “retry”.');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    type(f, 'breaker');
    expect(f.document.querySelector('.kb-search-term')).not.toBeNull();
    type(f, '  ');
    expect(f.document.querySelector('.kb-search-term')).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('makes the link itself the option, so no control sits inside another', () => {
    const f = setup(DIALOG, MANY);
    init(f.document);
    open(f);
    type(f, 'breaker');
    const list = f.document.querySelector('[data-kb-search-results]') as Element;
    const options = [...list.querySelectorAll('[role="option"]')];
    expect(options).toHaveLength(12);
    for (const o of options) {
      expect(o.tagName).toBe('A');
      expect(o.id).not.toBe('');
      expect(o.querySelector('a, button, [role="option"]')).toBeNull();
      expect(o.parentElement?.tagName).toBe('LI');
      expect(o.parentElement?.getAttribute('role')).toBe('presentation');
    }
    expect(new Set(options.map((o) => o.id)).size).toBe(12);
    expect(list.querySelector('li[role="option"], [role="option"] a')).toBeNull();
    expect(options.filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });

  it('moves with the arrows, wraps around, and opens the active row on Enter', () => {
    const f = setup(DIALOG, MANY);
    init(f.document);
    open(f);
    type(f, 'breaker');
    const active = (): string | null =>
      f.document.querySelector('.kb-search-row--active .kb-search-title')?.textContent ?? null;
    const first = active();
    key(f, { key: 'ArrowDown' });
    expect(active()).not.toBe(first);
    key(f, { key: 'ArrowUp' });
    expect(active()).toBe(first);
    // Up from the first row wraps to the last.
    key(f, { key: 'ArrowUp' });
    const titles = rows(f);
    expect(titles).toHaveLength(12);
    expect(active()).toBe(titles[titles.length - 1]);
    const selected = f.document.querySelector(
      '[data-kb-search-results] a[role="option"][aria-selected="true"]',
    );
    expect(
      f.document.querySelector('[data-kb-search-input]')?.getAttribute('aria-activedescendant'),
    ).toBe(selected?.id);
    let clicked = '';
    for (const link of f.document.querySelectorAll<HTMLAnchorElement>('.kb-search-link')) {
      link.addEventListener('click', (ev) => {
        ev.preventDefault();
        clicked = link.getAttribute('href') ?? '';
      });
    }
    key(f, { key: 'Enter' });
    expect(clicked).toBe(
      `../notes/breaker-${(titles[titles.length - 1] ?? '').replace('Breaker note ', '')}.html`,
    );
    key(f, { key: 'Tab' });
    expect(dialog(f).open).toBe(true);
  });

  it('takes the arrows and Enter quietly when there are no rows', () => {
    const f = setup();
    init(f.document);
    open(f);
    type(f, 'zzzzq');
    key(f, { key: 'ArrowDown' });
    key(f, { key: 'Enter' });
    expect(rows(f)).toEqual([]);
  });

  it('follows the pointer, so hovering and pressing Enter agree', () => {
    const f = setup(DIALOG, MANY);
    init(f.document);
    open(f);
    type(f, 'breaker');
    const list = [...f.document.querySelectorAll('[data-kb-search-results] [role="option"]')];
    list[1]?.dispatchEvent(
      new f.window.MouseEvent('mouseover', { bubbles: true }) as unknown as Event,
    );
    expect(list[1]?.getAttribute('aria-selected')).toBe('true');
    expect(list[0]?.getAttribute('aria-selected')).toBe('false');
    // The row already selected, and a point on no row, change nothing.
    list[1]?.dispatchEvent(
      new f.window.MouseEvent('mouseover', { bubbles: true }) as unknown as Event,
    );
    f.document
      .querySelector('[data-kb-search-results]')
      ?.dispatchEvent(new f.window.MouseEvent('mouseover', { bubbles: true }) as unknown as Event);
    expect(list[1]?.getAttribute('aria-selected')).toBe('true');
  });

  it('boosts pages from the reader’s own area', () => {
    const two: SearchPayload = {
      pages: [
        page({ route: '/a.html', title: 'Cache aside', area: 'caching' }),
        page({ route: '/b.html', title: 'Cache aside', area: 'data' }),
      ],
      terms: [],
      tagLabels: {},
      synonyms: {},
    };
    const f = setup(DIALOG, two, 'data');
    init(f.document);
    open(f);
    type(f, 'cache');
    expect(firstHref(f)).toBe('../b.html');
  });

  it('keeps one dialog, under <body>, when Starlight renders the header twice', () => {
    const f = setup(DIALOG + DIALOG);
    init(f.document);
    expect(f.document.querySelectorAll('[data-kb-search-dialog]')).toHaveLength(1);
    expect(dialog(f).parentElement?.tagName).toBe('BODY');
  });

  it('adds the payload script once, beside the bundle, on the first open, and ranks what was typed meanwhile', () => {
    const f = setup(DIALOG, null);
    const added = holdScripts(f);
    init(f.document);
    expect(added).toEqual([]);
    open(f);
    expect(added.map((s) => s.getAttribute('src'))).toEqual(['../search-index.js']);
    expect(note(f).textContent).toBe('Loading the search index…');
    type(f, 'breaker');
    expect(rows(f)).toEqual([]);

    (f.window as unknown as { kb: SearchPayload }).kb = PAYLOAD;
    added[0]?.dispatchEvent(new f.window.Event('load') as unknown as Event);
    expect(rows(f)).toContain('Circuit Breaker');

    key(f, { key: 'Escape' });
    open(f);
    expect(added).toHaveLength(1);
  });

  it('starts the payload when the pointer or focus reaches the button, once, and never for the rest of the page', () => {
    const f = setup(DIALOG + '<p id="x">text</p>', null);
    const added = holdScripts(f);
    init(f.document);
    const fire = (type: string, target: Element): void => {
      target.dispatchEvent(new f.window.Event(type, { bubbles: true }) as unknown as Event);
    };
    fire('pointerover', f.document.getElementById('x')!);
    fire('focusin', f.document.querySelector('[data-kb-search-close]')!);
    expect(added).toEqual([]);
    fire('pointerover', f.document.querySelector('[data-kb-search-open]')!);
    fire('focusin', f.document.querySelector('[data-kb-search-open]')!);
    expect(added.map((s) => s.getAttribute('src'))).toEqual(['../search-index.js']);
    open(f);
    expect(added).toHaveLength(1);
  });

  it('reads the compact payload: a heading pair lands on its id, a bare heading offers no anchor', () => {
    const wire = {
      ...PAYLOAD,
      pages: [
        {
          ...page({ route: '/a/b.html', title: 'Wire page', tags: [] }),
          headings: [['why-it-fails', 'Failure modes'], 'Loose heading'],
        },
      ],
    } as unknown as SearchPayload;
    const f = setup(DIALOG, wire);
    init(f.document);
    open(f);
    type(f, 'failure modes');
    expect(f.document.querySelector('.kb-search-link')?.getAttribute('href')).toBe(
      '../a/b.html#why-it-fails',
    );
    type(f, 'loose heading');
    expect(f.document.querySelector('.kb-search-link')?.getAttribute('href')).toBe('../a/b.html');
  });

  it('loads nothing when the page already holds the payload', () => {
    const f = setup();
    const added = holdScripts(f);
    init(f.document);
    open(f);
    expect(added).toEqual([]);
  });

  it('says search is not built yet, throwing nothing, when the payload script fails', () => {
    const f = setup(DIALOG, null);
    const added = holdScripts(f);
    init(f.document);
    open(f);
    added[0]?.dispatchEvent(new f.window.Event('error') as unknown as Event);
    expect(note(f).textContent).toContain('not built yet');
    expect(rows(f)).toEqual([]);
  });

  it('names the ⌘ shortcut on a Mac and stores nothing about the reader', () => {
    const f = setup();
    Object.defineProperty(f.window.navigator, 'userAgent', { value: 'Mozilla/5.0 (Macintosh)' });
    init(f.document);
    expect(f.document.querySelector('[data-kb-search-hint]')?.textContent).toBe('⌘ K');
    open(f);
    type(f, 'breaker');
    expect(f.window.localStorage.length).toBe(0);
  });

  it('says Ctrl K on Windows, Linux and Android, and ⌘ K on a Mac, an iPhone and an iPad', () => {
    for (const ua of [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      '',
    ])
      expect(shortcutLabel(ua), ua).toBe('Ctrl K');
    for (const ua of [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    ])
      expect(shortcutLabel(ua), ua).toBe('⌘ K');
  });

  it('keeps Ctrl K on a Windows user agent, whatever else is in the string', () => {
    const f = setup();
    Object.defineProperty(f.window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36',
    });
    init(f.document);
    expect(f.document.querySelector('[data-kb-search-hint]')?.textContent).toBe('Ctrl K');
  });

  it('shows a quiet kind badge on each row, from the page’s own kind word', () => {
    const f = setup(DIALOG, {
      ...PAYLOAD,
      pages: [
        page({
          route: '/patterns/resilience/circuit-breaker.html',
          title: 'Circuit Breaker',
          categories: ['Patterns', 'Resilience', 'pattern'],
        }),
        page({
          route: '/hazards/retry-storm.html',
          title: 'Retry Storm',
          kind: 'hazards',
          categories: ['Hazards', 'hazard'],
          solves: ['breaker trips and retries pile up'],
        }),
      ],
    });
    init(f.document);
    open(f);
    type(f, 'breaker');
    const badges = [...f.document.querySelectorAll('.kb-search-link .kb-search-kind')].map(
      (n) => n.textContent,
    );
    expect(badges.sort()).toEqual(['hazard', 'pattern']);
    const row = f.document.querySelector('.kb-search-link')!;
    expect(row.querySelector('.kb-search-head .kb-search-title')).not.toBeNull();
  });

  it('shows no badge for a page of no kind word, the marks page or a stack index', () => {
    expect(kindLabel(page({ categories: ['Patterns', 'From Pattern to Product'] }))).toBeNull();
    expect(
      kindLabel(page({ route: '/marks.html', categories: ['Patterns', 'pattern'] })),
    ).toBeNull();
    expect(kindLabel(page({ categories: [] }))).toBeNull();
    expect(kindLabel(page({ categories: ['Case Studies', 'case study'] }))).toBe('case study');
  });

  it('never offers the not-found page as a result', () => {
    const f = setup(DIALOG, {
      ...PAYLOAD,
      pages: [
        ...PAYLOAD.pages,
        page({ route: '/404.html', title: 'Page not found: circuit', description: 'circuit' }),
      ],
    });
    init(f.document);
    open(f);
    type(f, 'circuit');
    expect(rows(f)).toEqual(['Circuit Breaker']);
  });

  it('opens already filled from a button that carries a symptom, and ranks it at once', () => {
    const f = setup(
      `${DIALOG}<button id="eg" data-kb-search-open data-kb-search-prefill="slow downstream threads">eg</button>`,
    );
    init(f.document);
    f.document.getElementById('eg')!.click();
    expect(dialog(f).open).toBe(true);
    expect(f.document.querySelector<HTMLInputElement>('[data-kb-search-input]')!.value).toBe(
      'slow downstream threads',
    );
    expect(rows(f)).toEqual(['Circuit Breaker']);
  });

  it('opens empty from the header button, whatever the last open held', () => {
    const f = setup(
      `${DIALOG}<button id="eg" data-kb-search-open data-kb-search-prefill="breaker">eg</button>`,
    );
    init(f.document);
    f.document.getElementById('eg')!.click();
    f.document.querySelector<HTMLElement>('[data-kb-search-close]')!.click();
    f.document.querySelector<HTMLElement>('[data-kb-search-open]')!.click();
    expect(f.document.querySelector<HTMLInputElement>('[data-kb-search-input]')!.value).toBe('');
  });

  it('closes on a click outside the dialog’s box and not on one inside it', () => {
    const f = setup();
    init(f.document);
    open(f);
    const d = dialog(f);
    d.getBoundingClientRect = () => ({ left: 10, right: 100, top: 10, bottom: 100 }) as DOMRect;
    d.dispatchEvent(
      new f.window.MouseEvent('click', {
        bubbles: true,
        clientX: 50,
        clientY: 50,
      }) as unknown as Event,
    );
    expect(d.open).toBe(true);
    d.dispatchEvent(
      new f.window.MouseEvent('click', {
        bubbles: true,
        clientX: 200,
        clientY: 50,
      }) as unknown as Event,
    );
    expect(d.open).toBe(false);
    // A click elsewhere on the page does nothing.
    f.document.body.dispatchEvent(
      new f.window.MouseEvent('click', { bubbles: true }) as unknown as Event,
    );
    expect(d.open).toBe(false);
  });

  it('does nothing on a page with no dialog, or a dialog missing its parts', () => {
    const bare = setup('<p>no search here</p>');
    expect(() => init(bare.document)).not.toThrow();
    const partial = setup('<dialog data-kb-search-dialog><input data-kb-search-input></dialog>');
    init(partial.document);
    key(partial, { key: 'k', ctrlKey: true });
    expect(partial.document.querySelector<HTMLDialogElement>('[data-kb-search-dialog]')?.open).toBe(
      false,
    );
  });
});
