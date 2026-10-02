// The hub's filter: rows answer to keys (`data-kb-facet-keys`), chips name
// keys (`data-kb-facet`), and a row stays when, for every rail with a chip
// pressed, it holds one of that rail's pressed keys — chips add up within a
// rail and narrow across rails. The Starred chip keeps only the rows whose
// star is pressed (the reader's stars and the editors' picks alike), so it
// listens for `kb-favourites-change` and applies again.
//
// A row filtered out gets `data-kb-facet-out`, which facets.css hides, along
// with a group left with no row. Nothing is removed from the page.
//
// The filter lives in the URL's query, `?f=<key>&f=<key>&fav=1`, written with
// `history.replaceState` (which works from file:// and adds no history entry)
// and read back at init and on `popstate`, so a reload, a return with Back and
// a shared link keep it. A key no chip on this page carries is ignored.
//
// "Clear filters" shows while any chip or Starred is on, and an empty result
// says so in one sentence in place of the count.
//
// The scroll position rides in the same history entry (`kbScrollY` in its
// state): a filter hides rows after the browser's own scroll restoration would
// have run, so the page sets the restoration to manual and puts the reader back
// where they were itself, on Back and on reload.
const FACET_PARAM = 'f';
const FAVOURITES_PARAM = 'fav';

/** The history state key holding the scroll position of this entry. */
export const SCROLL_KEY = 'kbScrollY';

/** What the status line says when the filter leaves no row. */
export const EMPTY_TEXT = 'No pages match these filters.';

export function init(doc: Document): void {
  const bar = doc.querySelector<HTMLElement>('[data-kb-facets]');
  if (!bar) return;
  const rows = [...doc.querySelectorAll<HTMLElement>('[data-kb-facet-keys]')];
  const status = bar.querySelector<HTMLElement>('[data-kb-facet-status]');
  const favourites = bar.querySelector<HTMLElement>('[data-kb-facet-favourites]');
  const clear = bar.querySelector<HTMLElement>('[data-kb-facet-clear]');
  // The "Show:" row holding the Starred chip, which goes with the chip.
  const show = bar.querySelector<HTMLElement>('[data-kb-facet-show]');
  const pressed = new Set<string>();
  let favouritesOnly = false;

  const chips = [...bar.querySelectorAll<HTMLElement>('[data-kb-facet]')];
  const view = doc.defaultView;

  // The URL's filter, limited to chips this page has, onto the chips.
  const restore = (): void => {
    if (!view) return;
    let params: URLSearchParams;
    try {
      params = new URL(view.location.href).searchParams;
    } catch {
      return;
    }
    const wanted = new Set(params.getAll(FACET_PARAM));
    pressed.clear();
    for (const chip of chips) {
      const key = chip.getAttribute('data-kb-facet') ?? '';
      const on = wanted.has(key);
      if (on) pressed.add(key);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    favouritesOnly = favourites !== null && params.get(FAVOURITES_PARAM) === '1';
    favourites?.setAttribute('aria-pressed', favouritesOnly ? 'true' : 'false');
  };

  // The filter into the URL, the rest of the query and the hash left alone.
  const save = (): void => {
    if (!view) return;
    try {
      const url = new URL(view.location.href);
      url.searchParams.delete(FACET_PARAM);
      url.searchParams.delete(FAVOURITES_PARAM);
      for (const key of pressed) url.searchParams.append(FACET_PARAM, key);
      if (favouritesOnly) url.searchParams.set(FAVOURITES_PARAM, '1');
      view.history.replaceState(view.history.state, '', url);
    } catch {
      /* a context that forbids it: the filter lasts as long as the page */
    }
  };

  const keysOf = (row: HTMLElement): Set<string> =>
    new Set((row.getAttribute('data-kb-facet-keys') ?? '').split(' ').filter((k) => k !== ''));
  const starred = (row: HTMLElement): boolean =>
    row.querySelector('[data-kb-favourite][aria-pressed="true"]') !== null;

  const apply = (): void => {
    const rails = new Map<string, string[]>();
    for (const key of pressed) {
      const rail = key.slice(0, key.indexOf(':'));
      rails.set(rail, [...(rails.get(rail) ?? []), key]);
    }
    let shown = 0;
    for (const row of rows) {
      const keys = keysOf(row);
      const keep =
        [...rails.values()].every((wanted) => wanted.some((k) => keys.has(k))) &&
        (!favouritesOnly || starred(row));
      row.toggleAttribute('data-kb-facet-out', !keep);
      if (keep) shown += 1;
    }
    const on = pressed.size > 0 || favouritesOnly;
    if (status) {
      status.textContent = !on ? '' : shown === 0 ? EMPTY_TEXT : `${shown} of ${rows.length} shown`;
      status.toggleAttribute('data-kb-facet-empty', on && shown === 0);
    }
    if (clear) clear.hidden = !on;
    // A Starred chip with no star to show filters to an empty list.
    if (favourites) {
      const none = !favouritesOnly && !rows.some(starred);
      favourites.hidden = none;
      if (show) show.hidden = none;
    }
  };

  bar.addEventListener('click', (ev) => {
    const target = ev.target as Element | null;
    if (target?.closest?.('[data-kb-facet-clear]')) {
      pressed.clear();
      favouritesOnly = false;
      for (const c of chips) c.setAttribute('aria-pressed', 'false');
      favourites?.setAttribute('aria-pressed', 'false');
      apply();
      save();
      return;
    }
    const chip = target?.closest?.('[data-kb-facet]');
    if (chip) {
      const key = chip.getAttribute('data-kb-facet') ?? '';
      if (pressed.has(key)) pressed.delete(key);
      else pressed.add(key);
      chip.setAttribute('aria-pressed', pressed.has(key) ? 'true' : 'false');
      apply();
      save();
      return;
    }
    if (favourites && target?.closest?.('[data-kb-facet-favourites]')) {
      favouritesOnly = !favouritesOnly;
      favourites.setAttribute('aria-pressed', favouritesOnly ? 'true' : 'false');
      apply();
      save();
    }
  });
  doc.addEventListener('kb-favourites-change', apply);
  view?.addEventListener('popstate', () => {
    restore();
    apply();
  });
  restore();
  apply();
  keepScroll(view);
}

/**
 * Put the reader back where they were on this history entry, and keep the
 * entry's position current. The position is written when the page is left and
 * a moment after the reader stops scrolling, so a crash of the tab costs
 * little. A context that forbids reading or writing the history is left alone.
 */
function keepScroll(view: Window | null): void {
  if (!view) return;
  const state = (): Record<string, unknown> => {
    const s: unknown = view.history.state;
    return typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : {};
  };
  const remember = (): void => {
    try {
      view.history.replaceState({ ...state(), [SCROLL_KEY]: Math.round(view.scrollY) }, '');
    } catch {
      /* the history is closed to this page: nothing to keep */
    }
  };
  try {
    view.history.scrollRestoration = 'manual';
    const y = state()[SCROLL_KEY];
    if (typeof y === 'number' && y > 0) {
      view.scrollTo?.(0, y);
      // Fonts and images that land later can move the page: the same answer once more.
      view.addEventListener('load', () => view.scrollTo?.(0, y), { once: true });
    }
  } catch {
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  view.addEventListener('scroll', () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(remember, 150);
  });
  view.addEventListener('pagehide', remember);
}
