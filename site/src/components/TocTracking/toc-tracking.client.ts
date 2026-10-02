// Table-of-contents tracking: highlights the heading you are reading.
//
// It owns exactly one element — the `.kb-toc` list this site's TableOfContents
// override renders — and nothing else on the page tracks headings for it.
// That is the point. Driving Starlight's `<starlight-toc>` as well — standing
// down whenever upstream's custom element is defined — ships two
// implementations and lets the protocol pick one; the override removes that
// fork. Starlight's mobile TOC is still upstream's, script and all,
// and this module deliberately does not touch it — see the folder CLAUDE.md.

interface Group {
  /** The rail's own scroll box: `.kb-toc` caps its height in toc-tracking.css. */
  root: HTMLElement;
  links: HTMLAnchorElement[];
  targets: (HTMLElement | null)[];
  /**
   * The index this group last marked, and the whole reason the rail does not
   * jitter: `update()` runs on every animation frame the reader scrolls
   * through, but the entry it lights up changes only at a section boundary.
   * `-1` means "nothing marked yet", so the first `update()` counts as a
   * change — a page opened at a deep `#anchor` should show that entry in the
   * rail rather than starting the reader at the top of a list they are not in.
   */
  current: number;
}

/**
 * Bring one entry inside its rail's scroll box by setting that box's
 * `scrollTop`, and touch nothing else.
 *
 * Not `scrollIntoView`. That call scrolls every scrollable ancestor it needs
 * to, and in Chromium it also moves the point the next Tab starts from to the
 * entry it scrolled to: the rail marks its first entry on load, so a reader's
 * first Tab on every page skipped the skip link and landed in the rail.
 * Setting `scrollTop` moves the box and leaves the keyboard where it was.
 *
 * A box that holds its whole list, or one nothing has laid out (a test's
 * document), has no scroll to make.
 */
export function reveal(box: HTMLElement, link: HTMLElement): void {
  if (box.scrollHeight <= box.clientHeight) return;
  const b = box.getBoundingClientRect();
  const l = link.getBoundingClientRect();
  if (l.top < b.top) box.scrollTop += l.top - b.top;
  else if (l.bottom > b.bottom) box.scrollTop += l.bottom - b.bottom;
}

export function init(doc: Document): void {
  const view = doc.defaultView;
  if (!view) return;

  const groups: Group[] = [];
  for (const root of doc.querySelectorAll<HTMLElement>('[data-kb-toc]')) {
    const links = [...root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
    if (links.length === 0) continue;
    groups.push({
      root,
      links,
      current: -1,
      targets: links.map((a) => {
        const id = decodeURIComponent((a.getAttribute('href') ?? '').slice(1));
        return id === '_top' ? null : doc.getElementById(id);
      }),
    });
  }
  if (groups.length === 0) return;

  const update = (): void => {
    // The last sections of a page can never be scrolled to the top — the
    // document ends first — so at the bottom the reading line stops meaning
    // anything and the deepest visible heading is the honest answer. Without
    // this the final two entries never light up.
    const atBottom = view.innerHeight + view.scrollY >= doc.documentElement.scrollHeight - 2;

    for (const grp of groups) {
      let best = 0;
      grp.targets.forEach((t, i) => {
        // A heading counts as reached once its top passes the point a reader's
        // eye sits at, a little below the sticky header.
        if (t && t.getBoundingClientRect().top - 100 <= 0) best = i;
      });
      if (atBottom) {
        // Every heading in the unreachable tail shares one scroll position —
        // the clamped bottom — so no rule can tell them apart, and the last
        // visible one is the convention: it tells the reader they are at the
        // end rather than stranding the final entry permanently unlit.
        for (let b = grp.targets.length - 1; b > best; b -= 1) {
          const lt = grp.targets[b];
          if (lt && lt.getBoundingClientRect().top < view.innerHeight) {
            best = b;
            break;
          }
        }
      }
      grp.links.forEach((link, j) => {
        if (j === best) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });

      // Marking the entry is not the same as showing it. On a page whose
      // outline is longer than the rail — `docs/reference/gates.md` mirrors in
      // with 56 headings — the entry wearing `aria-current` spends most of the
      // read outside the rail's scroll box, so the one thing the rail exists to
      // tell you is the one thing you cannot see. Bringing it back is the other
      // half of tracking.
      //
      // **Only when it changes.** `update()` runs once per scrolled animation
      // frame; scrolling the rail on every one of them would fight the reader
      // for it — a rail they had scrolled by hand to look ahead would be yanked
      // back before the finger left the trackpad, and the redundant scrolls
      // would show up as jitter under a smooth-scroll setting. `grp.current` is
      // the whole state that avoids it.
      if (best === grp.current) continue;
      grp.current = best;

      // The smallest move that works: an entry already in view moves nothing
      // at all, and one past an edge comes to that edge rather than to the
      // middle (`reveal`).
      const link = grp.links[best];
      if (link) reveal(grp.root, link);
    }
  };

  let queued = false;
  const onScroll = (): void => {
    if (queued) return;
    queued = true;
    view.requestAnimationFrame(() => {
      queued = false;
      update();
    });
  };
  view.addEventListener('scroll', onScroll, { passive: true });
  view.addEventListener('resize', onScroll);
  update();
}
