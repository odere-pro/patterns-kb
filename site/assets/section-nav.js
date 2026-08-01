/* Section navigation — a floating left-edge cluster that steps through the page outline.
 *
 * Long pages (a design case study runs to a dozen blocks and a deep-dives block alone is
 * ~45-55% of it) are hard to traverse: the browser's own scroll gives no sense of
 * structure, and the crumb at the top scrolls away. This injects an up/down pair that
 * steps to the adjacent stop, each arrow naming its target on its aria-label.
 *
 * Injected at runtime like every other control — pages carry no UI markup. It lives on
 * the LEFT edge because the right column already holds four controls (theme, lens,
 * practiced, favourite).
 *
 * Each arrow is present only while it has somewhere to go: no up arrow at the top of the
 * page, no down arrow at the bottom.
 *
 * WHAT COUNTS AS A STOP
 * Every `section.doc-section`, plus every `h3[id]` inside one. The id is not a filter
 * bolted on: a stop must have an anchor for scrollIntoView and replaceState, so "has an
 * id" and "is a jump target" are the same condition — and the build stamps an id onto
 * exactly the headings that are real sub-sections. Card labels inside a block ("Basic",
 * "Pros", "Reach for it when", "Functional") carry none and are skipped for free.
 *
 * The effect is confined to case studies by that rule alone: bitly gains 11 sub-stops
 * (deepdives-dive-1..6, architecture-h3-1..2, levels-h3-1..3) on top of its 11 blocks,
 * while circuit-breaker and cap-theorem gain zero — no h3 on a pattern or theme page
 * carries an id. So the other kinds behave exactly as they did with the older
 * one-button, blocks-only version.
 *
 * Sections are lens-independent — every block renders at every lens — but sub-headings
 * are NOT: a deep dive is routinely tagged advanced or expert, so the stop list really
 * does shrink at the basic lens. That is why offsetParent is checked on every stop and
 * why kb-lens-change forces a resync.
 *
 * It loads on every kind of page and decides for itself whether to appear, because page
 * length does not follow page kind: measured at 1440x900, a seven-block capability page
 * runs to 8.6 viewports while an eight-block pattern runs to 4.3. A per-kind list would
 * have put the control on the short page and withheld it from the long one.
 */
(function () {
  'use strict';

  var main = document.querySelector('main.doc-wrap');
  if (!main) return;

  var stops = Array.prototype.slice.call(
    main.querySelectorAll('section.doc-section, section.doc-section h3[id]')
  );
  if (stops.length < 2) return;

  /* The heading text is the human name of the stop — "Right-sizing", "Deep dives",
     "3 · The one link everybody clicks → NFR: latency". Fall back to the id so the
     label is never empty. */
  function nameOf(stop) {
    var h = stop.tagName === 'H3' ? stop : stop.querySelector('h2');
    var text = h && h.textContent ? h.textContent.trim() : '';
    return text || stop.id || 'section';
  }

  function isVisible(stop) {
    return stop.offsetParent !== null;
  }

  /* The threshold (not zero) means a stop scrolled to *just* above the top of the
     viewport counts as current rather than next, so one click never lands the reader
     back where they already are. Its mirror is what makes "previous" mean the stop
     before the current one rather than the current one itself. */
  var EDGE = 4;

  /* The last block starts within the final screenful, so its top never reaches the
     reading line however far you scroll. Without this the down arrow survives to the
     bottom of the page pointing at a jump that cannot move anything — the one case
     where "is there a stop below me" and "can I still go down" disagree. */
  function atBottom() {
    return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  }

  function nextStop() {
    if (atBottom()) return null;
    for (var i = 0; i < stops.length; i++) {
      if (!isVisible(stops[i])) continue;
      if (stops[i].getBoundingClientRect().top > EDGE) return stops[i];
    }
    return null;
  }

  /* Stops are in document order and their tops therefore ascend, so one forward walk
     finds both: the last stop at or above the reading line is the CURRENT one, and the
     one before it is the answer. Returning `current` instead would make the button a
     no-op that re-scrolls to where the reader already is. */
  function prevStop() {
    var prev = null;
    var current = null;
    for (var i = 0; i < stops.length; i++) {
      if (!isVisible(stops[i])) continue;
      if (stops[i].getBoundingClientRect().top > EDGE) break;
      prev = current;
      current = stops[i];
    }
    return prev;
  }

  /* The cluster: two glyph-only buttons, stacked. The stop's name is carried on the
     button's aria-label and nowhere else — a visible label had to sit in the page
     gutter, and the gutter is only about 160px at 1440px against a --content-width of
     clamp(66rem, 57rem + 14vw, 81rem), so it landed on the first words of every line. */
  var wrap = document.createElement('div');
  wrap.className = 'section-nav';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Section navigation');

  function makeRow(dir, glyph) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'section-nav-btn';
    btn.setAttribute('data-dir', dir);
    btn.innerHTML = '<span aria-hidden="true">' + glyph + '</span>';
    return { btn: btn, target: null };
  }

  var rows = {
    prev: makeRow('prev', '&#9652;'), /* ▴ */
    next: makeRow('next', '&#9662;'), /* ▾ */
  };

  /* An end of the page removes its arrow rather than greying it out: a disabled control
     still occupies the cluster and still invites the click it will refuse. Detaching is
     also how every other control on this site expresses "does not apply here" —
     progress.js injects its toggle only where a practice box exists — so this adds no
     new hide mechanism. Rebuilding both rows in order keeps up above down whichever one
     comes back. */
  function paint() {
    rows.prev.target = prevStop();
    rows.next.target = nextStop();

    if (rows.prev.target) {
      rows.prev.btn.setAttribute('aria-label', 'Previous section: ' + nameOf(rows.prev.target));
    }
    if (rows.next.target) {
      rows.next.btn.setAttribute('aria-label', 'Next section: ' + nameOf(rows.next.target));
    }

    var wanted = [];
    if (rows.prev.target) wanted.push(rows.prev.btn);
    if (rows.next.target) wanted.push(rows.next.btn);

    var same = wanted.length === wrap.children.length;
    for (var i = 0; same && i < wanted.length; i++) {
      if (wrap.children[i] !== wanted[i]) same = false;
    }
    if (same) return;

    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    for (var j = 0; j < wanted.length; j++) wrap.appendChild(wanted[j]);
  }

  function jump(row) {
    var target = row.target;
    if (!target) return;
    /* Move focus as well as the viewport: a keyboard or screen-reader user must land IN
       the section, not merely have the page scrolled under them. Neither a section nor a
       heading is natively focusable, so give it a temporary tabindex. */
    target.setAttribute('tabindex', '-1');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
    /* Reflect the new position in the URL so the jump is shareable and the back button
       works — replaceState, not a hash assignment, which would fight the smooth scroll. */
    if (target.id && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + target.id);
    }
    paint();
  }

  rows.prev.btn.addEventListener('click', function () { jump(rows.prev); });
  rows.next.btn.addEventListener('click', function () { jump(rows.next); });

  /* Two viewports of document. Re-measured rather than decided once at load: the basic
     lens can halve a page's height, and mermaid renders after this script runs. */
  var MIN_SCREENS = 2;
  function longEnough() {
    return document.documentElement.scrollHeight > window.innerHeight * MIN_SCREENS;
  }

  /* Attach and detach rather than hide: the other injected controls exist only where
     they apply (progress.js injects its toggle only where a practice box exists), and
     the site has exactly four hide mechanisms already — this adds no fifth. */
  var attached = false;
  function sync() {
    if (longEnough()) {
      if (!attached) { document.body.appendChild(wrap); attached = true; }
      paint();
    } else if (attached) {
      document.body.removeChild(wrap);
      attached = false;
    }
  }

  /* rAF-throttled: scroll fires far more often than the labels can meaningfully change,
     and this runs on every content page. */
  var queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () {
      queued = false;
      sync();
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  /* The lens changes which content is visible, which changes both the stop list (a deep
     dive tagged expert is gone at basic) and every offset. */
  document.addEventListener('kb-lens-change', onScroll);
  /* Height changes with no event of their own: mermaid replaces each diagram with a
     rendered SVG well after this script runs, and web fonts reflow the prose. Without
     this the control would be missing on a page that only becomes tall enough once its
     diagrams land. The cluster is position:fixed, so attaching it cannot itself resize
     the body and re-enter this. */
  if (window.ResizeObserver) new window.ResizeObserver(onScroll).observe(document.body);

  sync();
})();
