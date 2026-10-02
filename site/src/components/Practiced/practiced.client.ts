// Practiced: every check on the page, kept in step with the reader's store,
// the hub's count of how many of its rows are done, and each tour's count.
//
// The store is today's (`elevation-map-progress-v1`, slug → true), so marks
// made on the HTML site survive. Unmarking deletes the key rather than writing
// false. The toggles ship unpressed and practiced.css keeps them invisible
// until `data-kb-practiced-ready` is on <html>, which this module sets after
// its first paint of the stored marks: no flash of the wrong state, and no
// second inline script. The count reads the toggles on the page, one per slug, so a hub
// counts exactly the pages it lists.
//
// A tour's count reads the page list the build baked into the markup
// (`data-kb-practiced-tour="a b c"`) against the stored marks, so it counts
// pages that are not on this one. Where tours sit in a list (the home page,
// `data-kb-practiced-tours`), a tour with no mark is hidden and the list shows
// only once one is not. The store is read through store.ts, which keeps a
// refused write in memory, so a page whose storage throws still counts what its
// reader marked since it opened.
import { PRACTICED_KEY, readFlags, writeFlags, type Flags } from '../../lib/store';

export function init(doc: Document): void {
  const view = doc.defaultView;
  const toggles = [...doc.querySelectorAll<HTMLElement>('[data-kb-practiced]')];
  const tours = [...doc.querySelectorAll<HTMLElement>('[data-kb-practiced-tour]')];
  if (!view || (toggles.length === 0 && tours.length === 0)) return;
  const counts = [...doc.querySelectorAll<HTMLElement>('[data-kb-practiced-count]')];
  let done: Flags = readFlags(view, PRACTICED_KEY);

  const paint = (): void => {
    const slugs = new Set<string>();
    for (const t of toggles) {
      const slug = t.getAttribute('data-kb-practiced') ?? '';
      slugs.add(slug);
      t.setAttribute('aria-pressed', done[slug] === true ? 'true' : 'false');
    }
    const n = [...slugs].filter((s) => done[s] === true).length;
    for (const c of counts) c.textContent = `${n} of ${slugs.size} practiced`;
    paintTours();
  };

  const paintTours = (): void => {
    for (const t of tours) {
      const pages = new Set((t.dataset['kbPracticedTour'] as string).split(/\s+/).filter(Boolean));
      const n = [...pages].filter((s) => done[s] === true).length;
      const line = t.querySelector('[data-kb-practiced-tour-text]') ?? t;
      line.textContent = `${n} of ${pages.size} practiced`;
      // In a list of tours, only the ones begun are shown.
      if (t.closest('[data-kb-practiced-tours]')) t.hidden = n === 0;
    }
    for (const list of doc.querySelectorAll<HTMLElement>('[data-kb-practiced-tours]'))
      list.hidden = [...list.querySelectorAll<HTMLElement>('[data-kb-practiced-tour]')].every(
        (t) => t.hidden,
      );
  };

  doc.addEventListener('click', (ev) => {
    const toggle = (ev.target as Element | null)?.closest?.('[data-kb-practiced]');
    if (!toggle) return;
    const slug = toggle.getAttribute('data-kb-practiced') ?? '';
    const next = { ...done };
    if (next[slug] === true) delete next[slug];
    else next[slug] = true;
    done = next;
    writeFlags(view, PRACTICED_KEY, done);
    paint();
  });

  view.addEventListener('storage', (ev) => {
    if (ev.key !== PRACTICED_KEY) return;
    done = readFlags(view, PRACTICED_KEY);
    paint();
  });

  paint();
  // The marks are true now: practiced.css shows the toggles it held back.
  doc.documentElement.setAttribute('data-kb-practiced-ready', '');
}
