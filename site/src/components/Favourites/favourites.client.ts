// Favourites: every star on the page, kept in step with the reader's store.
//
// A toggle's starting `aria-pressed` is the page's own answer (its
// `favourite` frontmatter key), read once here before anything changes it;
// the store holds only the reader's overrides of it (src/lib/store.ts). Two
// toggles for one page — a page's own and its row on a hub — are the same
// favourite, so a click repaints every toggle carrying that slug.
//
// Announces the first paint and each change as `kb-favourites-change` on the
// document, so a filter keyed on favourites (Facets) applies it again,
// whichever of the two modules the bundle runs first.
import { FAVOURITES_KEY, flipFavourite, isFavourite, readFlags, writeFlags } from '../../lib/store';

export function init(doc: Document): void {
  const view = doc.defaultView;
  const toggles = [...doc.querySelectorAll<HTMLElement>('[data-kb-favourite]')];
  if (!view || toggles.length === 0) return;

  // Each page's own answer, from its first toggle, before the store is applied.
  const authored = new Map<string, boolean>();
  for (const t of toggles) {
    const slug = t.getAttribute('data-kb-favourite') ?? '';
    if (!authored.has(slug)) authored.set(slug, t.getAttribute('aria-pressed') === 'true');
  }
  let overrides = readFlags(view, FAVOURITES_KEY);

  const paint = (): void => {
    for (const t of toggles) {
      const slug = t.getAttribute('data-kb-favourite') ?? '';
      t.setAttribute(
        'aria-pressed',
        isFavourite(slug, authored.get(slug) === true, overrides) ? 'true' : 'false',
      );
    }
  };

  doc.addEventListener('click', (ev) => {
    const toggle = (ev.target as Element | null)?.closest?.('[data-kb-favourite]');
    if (!toggle) return;
    const slug = toggle.getAttribute('data-kb-favourite') ?? '';
    overrides = flipFavourite(slug, authored.get(slug) === true, overrides);
    writeFlags(view, FAVOURITES_KEY, overrides);
    paint();
    doc.dispatchEvent(new view.CustomEvent('kb-favourites-change', { detail: { slug } }));
  });

  // Another tab changed the store: show its answer here too.
  view.addEventListener('storage', (ev) => {
    if (ev.key !== FAVOURITES_KEY) return;
    overrides = readFlags(view, FAVOURITES_KEY);
    paint();
    doc.dispatchEvent(new view.CustomEvent('kb-favourites-change', { detail: {} }));
  });

  paint();
  // The stars are true now: favourites.css shows the toggles it held back.
  doc.documentElement.setAttribute('data-kb-favourites-ready', '');
  // The first paint too: a filter that ran before this module read the stars'
  // authored state, and the store may have changed them.
  doc.dispatchEvent(new view.CustomEvent('kb-favourites-change', { detail: {} }));
}
