// The search box, the one place this site is searched (spec kb.pagedata.search,
// search-box). Ranking is not here: it is tools/src/lib/search-score.ts, the
// one implementation kb.mjs shares, tested on its own and measured against
// every page's own symptom text there.
//
// It stays empty until a query is typed, and it remembers nothing about the
// reader between visits.
//
// The payload arrives as `window.kb`, a classic script written by
// tools/src/site/gen-search-index.ts in postbuild. It is a global rather than
// something fetched because a page opened from a folder has no origin to fetch
// from. No page loads it up front: the first time the box opens, this module
// adds the script tag, so a reader who never searches never downloads it. A
// script added this way is classic and runs from a folder too. It is read
// defensively: `astro dev` serves pages that never went through postbuild, so
// the box says "not built yet" rather than throw.

import {
  decodePage,
  matchTerms,
  searchWithRetry,
  snippet,
  type PageHit,
  type SearchPage,
  type SearchPayload,
  type SearchTerm,
} from '../../../../tools/src/lib/search-score';

/**
 * How every link on the page gets back to the site root: read off the
 * bundle's own `src`, which the post-build pass already made relative to this
 * page. The payload sits beside the bundle at the root. `astro dev` serves the
 * untouched `/kb.js`, so the prefix is `/` there and a route from the root is
 * right anyway.
 */
export function routePrefix(doc: Document): string {
  const src = doc.querySelector('[data-kb="bundle"]')?.getAttribute('src') ?? '';
  // Plain (`kb.js`, as `astro dev` serves it) or hashed (`kb.3fa9c1d2.js`, as the build names it).
  return src.replace(/kb(?:\.[0-9a-f]{8})?\.js$/, '');
}

/** The payload's file name, under the route prefix. */
export const PAYLOAD_FILE = 'search-index.js';

/** A payload route (`/a/b.html`) under a prefix (`../`): `../a/b.html`. */
export function hrefFor(prefix: string, route: string): string {
  return `${prefix}${route.replace(/^\//, '')}`;
}

/**
 * The words a result row's kind badge may show: the last of a page's
 * categories when it names a kind of page. A page of no kind (the stack index,
 * the marks page) gets no badge.
 */
export const KIND_WORDS: ReadonlySet<string> = new Set([
  'pattern',
  'hazard',
  'case study',
  'theme',
  'principle',
  'capability',
  'comparison',
]);

/** The pages that are tools, not entries of the knowledge base: never offered as a result. */
export const NOT_RESULTS: ReadonlySet<string> = new Set(['/404.html']);

/** A page's kind in a reader's word, or null when it has none worth showing. */
export function kindLabel(page: SearchPage): string | null {
  if (page.route === '/marks.html') return null;
  const word = page.categories[page.categories.length - 1] ?? '';
  return KIND_WORDS.has(word) ? word : null;
}

/** The most loose glossary cards shown, after the page rows. */
export const LOOSE_CARDS = 3;

/** The most page rows drawn: a lookup lists every page with the word, and the best come first. */
export const MAX_ROWS = 20;

/** The parts of the dialog rows are drawn into. */
interface Panel {
  input: HTMLInputElement;
  results: HTMLElement;
  terms: HTMLElement;
  /** Where the loose glossary cards go, after the rows. */
  more: HTMLElement | null;
  note: HTMLElement | null;
  active: number;
}

function panelIn(root: ParentNode): Panel | null {
  const input = root.querySelector<HTMLInputElement>('[data-kb-search-input]');
  const results = root.querySelector<HTMLElement>('[data-kb-search-results]');
  const terms = root.querySelector<HTMLElement>('[data-kb-search-terms]');
  if (!input || !results || !terms) return null;
  return {
    input,
    results,
    terms,
    more: root.querySelector<HTMLElement>('[data-kb-search-more]'),
    note: root.querySelector<HTMLElement>('[data-kb-search-note]'),
    active: 0,
  };
}

const el = (doc: Document, tag: string, cls: string, text?: string): HTMLElement => {
  const node = doc.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * The symptom the page answers that the query landed in: its `solves` phrase
 * holding the most query words, those words marked. Built from text nodes and
 * mark elements, never a string of HTML: the payload is this site's own
 * output, and the day it carries a `<` is not the day to find out that a row
 * assembled markup. Nothing when no phrase holds a query word: a page found
 * by its name alone needs no second line saying so.
 */
function snipFor(doc: Document, page: SearchPage, query: string): HTMLElement | null {
  const runs = snippet(query, page.solves.join('\n'));
  if (runs.length === 0) return null;
  const snip = el(doc, 'span', 'kb-search-snip');
  for (const run of runs) {
    const text = doc.createTextNode(run.text);
    if (!run.hit) {
      snip.appendChild(text);
      continue;
    }
    const mark = doc.createElement('mark');
    mark.appendChild(text);
    snip.appendChild(mark);
  }
  return snip;
}

/** One result row. Text is set as text, never as markup. */
function rowFor(
  doc: Document,
  hit: PageHit,
  prefix: string,
  id: string,
  query: string,
): HTMLElement {
  // The row is a list item and says nothing; the link is the option, so no
  // control sits inside another (a link in an option is nested interactive).
  const li = doc.createElement('li');
  li.className = 'kb-search-row';
  li.setAttribute('role', 'presentation');

  const heading =
    hit.anchor === null ? null : (hit.page.headings.find((h) => h.id === hit.anchor)?.text ?? null);
  const link = doc.createElement('a');
  link.className = 'kb-search-link';
  link.id = id;
  link.setAttribute('role', 'option');
  link.setAttribute('aria-selected', 'false');
  link.href = hrefFor(prefix, hit.page.route) + (hit.anchor === null ? '' : `#${hit.anchor}`);
  // A heading hit names its page above it, so the reader knows where it lands.
  if (heading !== null) link.appendChild(el(doc, 'span', 'kb-search-trail', hit.page.title));
  const kind = kindLabel(hit.page);
  if (kind === null) {
    link.appendChild(el(doc, 'span', 'kb-search-title', heading ?? hit.page.title));
  } else {
    // The title and the quiet kind badge share one line; the badge is text, so
    // it reads aloud with the row, and the box marks it with a hook, not a class.
    const head = el(doc, 'span', 'kb-search-head');
    head.append(
      el(doc, 'span', 'kb-search-title', heading ?? hit.page.title),
      el(doc, 'span', 'kb-search-kind', kind),
    );
    link.appendChild(head);
  }
  if (hit.page.description)
    link.appendChild(el(doc, 'span', 'kb-search-desc', hit.page.description));
  // A snippet that is the heading the row already names, in any case, says
  // nothing new: a symptom is written in lower case and a heading is not.
  const snip = snipFor(doc, hit.page, query);
  if (snip && snip.textContent?.toLowerCase() !== heading?.toLowerCase()) link.appendChild(snip);
  li.appendChild(link);
  return li;
}

/** A glossary card: what the word means. */
function termCard(doc: Document, term: SearchTerm): HTMLElement {
  const card = el(doc, 'div', 'kb-search-term');
  card.appendChild(el(doc, 'span', 'kb-kicker', 'definition'));
  card.appendChild(el(doc, 'span', 'kb-search-term-name', term.term));
  card.appendChild(el(doc, 'span', 'kb-search-term-def', term.definition));
  return card;
}

/**
 * The one line the box says out loud. Never given the `hidden` attribute:
 * hidden content is not in the accessibility tree at all. `seen` false keeps
 * the count in the tree for a screen reader and out of the picture, since the
 * rows already show themselves; the empty state, the no-match line and a
 * corrected query stay visible.
 */
function setNote(panel: Panel, text: string, seen = true): void {
  if (!panel.note) return;
  panel.note.textContent = text;
  panel.note.classList.toggle('kb-visually-hidden', !seen);
}

function highlight(panel: Panel): void {
  const rows = [...panel.results.children] as HTMLElement[];
  panel.input.setAttribute('aria-expanded', rows.length > 0 ? 'true' : 'false');
  if (rows.length === 0) {
    panel.input.removeAttribute('aria-activedescendant');
    return;
  }
  panel.active = Math.max(0, Math.min(panel.active, rows.length - 1));
  rows.forEach((row, i) => {
    const on = i === panel.active;
    const option = row.querySelector<HTMLElement>('[role="option"]');
    option?.setAttribute('aria-selected', on ? 'true' : 'false');
    row.classList.toggle('kb-search-row--active', on);
    if (on && option) {
      panel.input.setAttribute('aria-activedescendant', option.id);
      row.scrollIntoView?.({ block: 'nearest' });
    }
  });
}

interface Context {
  doc: Document;
  payload: SearchPayload | null;
  /** True while the payload script the box added has neither loaded nor failed. */
  loading: boolean;
  prefix: string;
  area: string | undefined;
}

/** Fill the panel for one query: the whole of what search looks like. */
export function render(ctx: Context, panel: Panel, query: string): void {
  const { doc } = ctx;
  panel.terms.replaceChildren();
  panel.more?.replaceChildren();
  panel.results.replaceChildren();
  panel.active = 0;

  if (!ctx.payload) {
    setNote(
      panel,
      ctx.loading
        ? 'Loading the search index…'
        : 'Search is not built yet — build the site (make site-build).',
    );
    highlight(panel);
    return;
  }
  const q = query.trim();
  if (q === '') {
    setNote(panel, 'Type a name, or what went wrong, to search every page.');
    highlight(panel);
    return;
  }

  // A definition the reader named goes above the pages. One they only began to
  // type ("gen" → "generalizes") goes below them, a few, so it never crowds the page they want.
  const defined = matchTerms(q, ctx.payload.terms);
  for (const term of defined.exact) panel.terms.appendChild(termCard(doc, term));
  for (const term of defined.loose.slice(0, LOOSE_CARDS))
    panel.more?.appendChild(termCard(doc, term));
  // The rows may answer a query the reader did not quite type: the retry
  // fixes one typo when the typed query listed nothing, and the note names both.
  const found = searchWithRetry(q, ctx.payload.pages, {
    syn: ctx.payload.synonyms,
    tagLabels: ctx.payload.tagLabels,
    ...(ctx.area === undefined ? {} : { area: ctx.area }),
  });
  const base = `${panel.results.id || 'kb-search'}-row-`;
  found.hits
    .slice(0, MAX_ROWS)
    .forEach((hit, i) =>
      panel.results.appendChild(rowFor(doc, hit, ctx.prefix, `${base}${i}`, found.query)),
    );

  const total = found.hits.length;
  const plural = total === 1 ? '' : 's';
  if (total === 0) setNote(panel, `Nothing matched “${q}”.`);
  else if (found.retried)
    setNote(
      panel,
      `Nothing matched “${q}”. Showing ${total} result${plural} for “${found.query}”.`,
    );
  else if (total > MAX_ROWS)
    setNote(panel, `Showing the first ${MAX_ROWS} of ${total} results for “${q}”.`);
  else setNote(panel, `${total} result${plural} for “${q}”.`, false);
  highlight(panel);
}

/** The row under the pointer becomes the selected row, so hover and Enter agree. */
function syncOnHover(panel: Panel): void {
  panel.results.addEventListener('mouseover', (ev) => {
    const row = (ev.target as Element | null)?.closest?.('li');
    if (!row) return;
    const at = [...panel.results.children].indexOf(row);
    if (at < 0 || at === panel.active) return;
    panel.active = at;
    highlight(panel);
  });
}

/** Up and down to move, Enter to open. True when the key was the box's. */
function navigate(panel: Panel, key: string): boolean {
  const rows = [...panel.results.children] as HTMLElement[];
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    if (rows.length === 0) return true;
    panel.active = (panel.active + (key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
    highlight(panel);
    return true;
  }
  if (key === 'Enter') {
    rows[panel.active]?.querySelector<HTMLElement>('[role="option"]')?.click();
    return true;
  }
  return false;
}

/** The shortcut's cap: `⌘ K` on an Apple device, `Ctrl K` on every other user agent. */
export function shortcutLabel(userAgent: string): string {
  return /\b(?:Macintosh|Mac OS X|iPhone|iPad|iPod)\b/.test(userAgent) ? '⌘ K' : 'Ctrl K';
}

/** True when a keystroke is being typed into something, not at the page. */
export function typingInto(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node || typeof node.tagName !== 'string') return false;
  if (node.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName);
}

/** The payload, when the page loaded one of the right shape. */
function payloadOf(view: Window): SearchPayload | null {
  const raw = (view as unknown as { kb?: Partial<SearchPayload> }).kb;
  return raw && Array.isArray(raw.pages) && Array.isArray(raw.terms)
    ? {
        pages: raw.pages.filter((p) => !NOT_RESULTS.has(p.route)).map(decodePage),
        terms: raw.terms,
        tagLabels: raw.tagLabels ?? {},
        synonyms: raw.synonyms ?? {},
      }
    : null;
}

export function init(doc: Document): void {
  const view = doc.defaultView;
  if (!view) return;
  // The page's area is its head's fact; <body> carries none (spec kb.pagedata.head).
  const area = doc.querySelector('meta[name="kb:area"]')?.getAttribute('content') || undefined;
  const ctx: Context = {
    doc,
    payload: payloadOf(view),
    loading: false,
    prefix: routePrefix(doc),
    area,
  };

  // Name the shortcut this keyboard has, decided once from the user agent. The
  // markup ships the Ctrl form, so a reader with no script is told something
  // true.
  const label = shortcutLabel(view.navigator.userAgent);
  for (const hint of doc.querySelectorAll('[data-kb-search-hint]')) hint.textContent = label;

  // One dialog, moved to <body>: Starlight renders header overrides again in
  // the mobile menu, and a modal opened inside that hidden wrapper paints
  // nothing while making the page inert.
  const dialogs = doc.querySelectorAll<HTMLDialogElement>('[data-kb-search-dialog]');
  const dialog = dialogs[0];
  if (!dialog) return;
  for (let i = 1; i < dialogs.length; i += 1) dialogs[i]?.remove();
  doc.body.appendChild(dialog);
  const panel = panelIn(dialog);
  if (!panel) return;

  // The payload, once: the first open adds its script, and when it has run,
  // whatever the reader typed meanwhile is ranked.
  let requested = false;
  const load = (): void => {
    if (ctx.payload || requested) return;
    requested = true;
    ctx.loading = true;
    const script = doc.createElement('script');
    script.src = `${ctx.prefix}${PAYLOAD_FILE}`;
    script.setAttribute('data-kb', 'search-index');
    const done = (): void => {
      ctx.loading = false;
      ctx.payload = payloadOf(view);
      render(ctx, panel, panel.input.value);
    };
    script.addEventListener('load', done);
    script.addEventListener('error', done);
    doc.head.appendChild(script);
  };

  // `prefill` is a symptom a page offers as an example (HomeSearch): the field
  // opens holding it and its results are drawn at once.
  const open = (prefill = ''): void => {
    if (dialog.open) return;
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
    panel.input.value = prefill;
    load();
    render(ctx, panel, prefill);
    panel.input.focus();
    panel.input.setSelectionRange?.(prefill.length, prefill.length);
  };
  const close = (): void => {
    if (dialog.close) dialog.close();
    else dialog.removeAttribute('open');
  };

  // Reaching for the button is the first sign of a search: start the download
  // then, so the payload is often in by the time the dialog opens. A page that
  // is only read never asks for it.
  const warm = (ev: Event): void => {
    const t = ev.target as Element | null;
    if (t?.closest?.('[data-kb-search-open]')) load();
  };
  doc.addEventListener('pointerover', warm);
  doc.addEventListener('focusin', warm);

  dialog.addEventListener('submit', (ev) => ev.preventDefault());
  syncOnHover(panel);
  panel.input.addEventListener('input', () => render(ctx, panel, panel.input.value));

  doc.addEventListener('click', (ev) => {
    const t = ev.target as Element | null;
    if (!t?.closest) return;
    const opener = t.closest('[data-kb-search-open]');
    if (opener) open(opener.getAttribute('data-kb-search-prefill') ?? '');
    else if (t.closest('[data-kb-search-close]')) close();
    else if (t === dialog) {
      // A click on the dialog's own padding targets it too: only a point
      // outside its box is a click on the backdrop.
      const r = dialog.getBoundingClientRect();
      if (
        ev.clientX < r.left ||
        ev.clientX > r.right ||
        ev.clientY < r.top ||
        ev.clientY > r.bottom
      )
        close();
    }
  });

  doc.addEventListener('keydown', (ev) => {
    const key = ev.key;
    if ((ev.metaKey || ev.ctrlKey) && (key === 'k' || key === 'K')) {
      ev.preventDefault();
      if (dialog.open) close();
      else open();
      return;
    }
    if (!dialog.open) {
      // `/` is the other key readers try, and it must not steal a slash
      // typed into a field.
      if (key === '/' && !typingInto(ev.target) && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
        ev.preventDefault();
        open();
      }
      return;
    }
    if (key === 'Escape') {
      // A native dialog closes itself on Escape; this is for one opened by attribute.
      close();
      return;
    }
    if (navigate(panel, key)) ev.preventDefault();
  });
}
