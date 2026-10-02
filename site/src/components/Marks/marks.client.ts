// The marks page: the reader's favourites and practiced pages across every
// hub, and the three things a reader does with them — Export, Import, Reset.
//
// What the reader marked is in the two stores (src/lib/store.ts); what a slug
// is — a title, a kind, a link — is in the search payload the site already
// ships (`window.kb`), loaded here the way the search box loads it, by adding
// its classic script, which runs from file:// too. A store entry whose slug no
// page of the payload has is listed under "No longer in the site" with a
// Remove button, never kept silently.
//
// Two groups of favourites. "Yours" is the reader's own stars: the store's
// `true` entries. "Suggested" is the editors' picks — pages whose frontmatter
// says `favourite: true`, carried in the payload — that the reader has not
// unstarred, so the star a reader sees on those pages is accounted for here
// too. Practiced is the reader's alone.
//
// A file the reader imports is checked whole before anything is stored
// (parseMarks); a file that is not a marks file changes nothing and says so.
import { hrefFor, PAYLOAD_FILE, routePrefix } from '../Search/search.client';
import {
  exportMarks,
  FAVOURITES_KEY,
  mergeMarks,
  parseMarks,
  PRACTICED_KEY,
  readFlags,
  resetMarks,
  writeFlags,
} from '../../lib/store';

/** The file Export downloads. */
export const EXPORT_FILE = 'kb-marks.json';

/** What the page needs of one payload page. */
interface MarkPage {
  route: string;
  title: string;
  categories: string[];
  kind: string;
  /** The page's own `favourite: true`: an editors' pick. */
  favourite: boolean;
}

/** The payload's pages by slug (the route's file name), or empty when none loaded. */
function pagesBySlug(view: Window): Map<string, MarkPage> {
  const raw = (view as unknown as { kb?: { pages?: unknown } }).kb?.pages;
  const out = new Map<string, MarkPage>();
  if (!Array.isArray(raw)) return out;
  for (const p of raw as Partial<MarkPage>[]) {
    if (typeof p.route !== 'string' || typeof p.title !== 'string') continue;
    const slug = (p.route.split('/').pop() ?? '').replace(/\.html$/, '');
    out.set(slug, {
      route: p.route,
      title: p.title,
      categories: Array.isArray(p.categories) ? p.categories : [],
      kind: typeof p.kind === 'string' ? p.kind : '',
      favourite: p.favourite === true,
    });
  }
  return out;
}

export function init(doc: Document): void {
  const view = doc.defaultView;
  const root = doc.querySelector<HTMLElement>('[data-kb-marks]');
  if (!view || !root) return;
  const message = root.querySelector<HTMLElement>('[data-kb-marks-message]');
  const fileInput = root.querySelector<HTMLInputElement>('[data-kb-marks-file]');
  const list = (name: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(`[data-kb-marks-list="${name}"]`);
  const goneHead = root.querySelector<HTMLElement>('[data-kb-marks-gone-head]');
  const prefix = routePrefix(doc);
  let pages = pagesBySlug(view);
  let loaded = pages.size > 0;

  const say = (text: string): void => {
    if (message) message.textContent = text;
  };

  const li = (cls: string): HTMLElement => {
    const node = doc.createElement('li');
    node.className = cls;
    return node;
  };

  const fill = (target: HTMLElement | null, items: HTMLElement[], empty: string): void => {
    if (!target) return;
    target.replaceChildren(...items);
    if (items.length > 0) return;
    const none = li('kb-marks-empty');
    none.textContent = empty;
    target.appendChild(none);
  };

  const pageItem = (page: MarkPage): HTMLElement => {
    const item = li('kb-marks-item');
    const link = doc.createElement('a');
    link.href = hrefFor(prefix, page.route);
    link.textContent = page.title;
    const kind = doc.createElement('span');
    kind.className = 'kb-marks-kind';
    kind.textContent = page.categories[0] ?? page.kind;
    item.append(link, kind);
    return item;
  };

  const goneItem = (slug: string, sets: string[]): HTMLElement => {
    const item = li('kb-marks-item');
    const name = doc.createElement('span');
    name.textContent = slug;
    const kind = doc.createElement('span');
    kind.className = 'kb-marks-kind';
    kind.textContent = sets.join(' and ');
    const remove = doc.createElement('button');
    remove.type = 'button';
    remove.className = 'kb-marks-button';
    remove.setAttribute('data-kb-marks-remove', slug);
    remove.setAttribute('aria-label', `Remove ${slug}`);
    remove.textContent = 'Remove';
    item.append(name, kind, remove);
    return item;
  };

  const render = (): void => {
    // Until the payload is in, nothing can be told from stale: draw nothing.
    if (!loaded) return;
    const overrides = readFlags(view, FAVOURITES_KEY);
    const favourites = Object.entries(overrides)
      .filter(([, on]) => on)
      .map(([slug]) => slug);
    // An editors' pick stays suggested until the reader unstars it (a stored
    // `false`) or already holds it among their own (a stored `true`).
    const suggested = [...pages]
      .filter(([slug, p]) => p.favourite && overrides[slug] === undefined)
      .map(([slug]) => slug);
    const practiced = Object.keys(readFlags(view, PRACTICED_KEY)).filter(
      (slug) => readFlags(view, PRACTICED_KEY)[slug] === true,
    );
    const byTitle = (a: MarkPage, b: MarkPage): number => a.title.localeCompare(b.title);
    const known = (slugs: string[]): MarkPage[] =>
      slugs.flatMap((s) => pages.get(s) ?? []).sort(byTitle);

    fill(list('favourites'), known(favourites).map(pageItem), 'No stars of your own yet.');
    fill(list('suggested'), known(suggested).map(pageItem), 'No suggested pages left.');
    fill(list('practiced'), known(practiced).map(pageItem), 'Nothing practiced yet.');

    const gone = new Map<string, string[]>();
    for (const [slugs, set] of [
      [favourites, 'favourite'],
      [practiced, 'practiced'],
    ] as const)
      for (const slug of slugs)
        if (!pages.has(slug)) gone.set(slug, [...(gone.get(slug) ?? []), set]);
    const goneList = list('gone');
    fill(
      goneList,
      [...gone].sort(([a], [b]) => a.localeCompare(b)).map(([slug, sets]) => goneItem(slug, sets)),
      '',
    );
    const any = gone.size > 0;
    if (goneList) goneList.hidden = !any;
    if (goneHead) goneHead.hidden = !any;
    if (!any && goneList) goneList.replaceChildren();
  };

  const download = (): void => {
    const blob = new view.Blob([`${JSON.stringify(exportMarks(view), null, 2)}\n`], {
      type: 'application/json',
    });
    const url = view.URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    a.download = EXPORT_FILE;
    doc.body.appendChild(a);
    a.click();
    a.remove();
    view.setTimeout(() => view.URL.revokeObjectURL(url), 0);
    say(`Exported to ${EXPORT_FILE}.`);
  };

  const importText = (text: string): void => {
    const marks = parseMarks(text);
    if (marks === null) {
      say(
        'Not imported: that file is not a marks file from this site (version 1, with favourites and practiced).',
      );
      return;
    }
    mergeMarks(view, marks);
    render();
    say(
      `Imported ${Object.keys(marks.favourites).length} favourites and ${Object.keys(marks.practiced).length} practiced.`,
    );
  };

  root.addEventListener('click', (ev) => {
    const target = ev.target as Element | null;
    if (target?.closest?.('[data-kb-marks-export]')) {
      download();
      return;
    }
    if (target?.closest?.('[data-kb-marks-import]')) {
      fileInput?.click();
      return;
    }
    if (target?.closest?.('[data-kb-marks-reset]')) {
      if (!view.confirm('Clear every favourite and practiced mark in this browser?')) return;
      resetMarks(view);
      render();
      say('All marks cleared.');
      return;
    }
    const remove = target?.closest?.('[data-kb-marks-remove]');
    if (remove) {
      const slug = remove.getAttribute('data-kb-marks-remove') ?? '';
      for (const key of [FAVOURITES_KEY, PRACTICED_KEY]) {
        const flags = readFlags(view, key);
        delete flags[slug];
        writeFlags(view, key, flags);
      }
      render();
      say(`Removed ${slug}.`);
    }
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    file.text().then(
      (text) => {
        importText(text);
        fileInput.value = '';
      },
      () => say('Not imported: the file could not be read.'),
    );
  });

  // Another tab changed the stores: show its answer here too.
  view.addEventListener('storage', (ev) => {
    if (ev.key === FAVOURITES_KEY || ev.key === PRACTICED_KEY) render();
  });

  if (loaded) {
    render();
    return;
  }
  // The payload, once: its classic script runs from a folder as well.
  say('Loading your marks…');
  const script = doc.createElement('script');
  script.src = `${prefix}${PAYLOAD_FILE}`;
  script.setAttribute('data-kb', 'search-index');
  script.addEventListener('load', () => {
    pages = pagesBySlug(view);
    loaded = pages.size > 0;
    say(loaded ? '' : 'The page list did not load, so your marks cannot be shown.');
    render();
  });
  script.addEventListener('error', () => {
    say('The page list did not load, so your marks cannot be shown.');
  });
  doc.head.appendChild(script);
}
