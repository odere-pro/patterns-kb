/* Section jump — a floating left-edge control that advances to the next block.
 *
 * Long pages (a design case study runs to a dozen blocks) are hard to traverse:
 * the browser's own scroll gives no sense of structure, and the crumb at the top
 * scrolls away. This injects one button that always points at the next
 * <section class="doc-section"> below the current reading position, and names it,
 * so the reader knows where the click lands before making it.
 *
 * Injected at runtime like every other control — pages carry no UI markup. It
 * lives on the LEFT edge because the right column already holds four controls
 * (theme, lens, practiced, favourite) and a fifth would crowd short pages.
 *
 * Sections are lens-independent: every block renders at every lens, so the target
 * list never changes when the lens does. Sections hidden by CSS are still skipped
 * defensively via offsetParent, in case that ever stops being true.
 *
 * It loads on every kind of page and decides for itself whether to appear, because
 * page length does not follow page kind: measured at 1440x900, a seven-block
 * capability page runs to 8.6 viewports while an eight-block pattern runs to 4.3. A
 * per-kind list would have put the control on the short page and withheld it from the
 * long one. The floor is deliberately low — below two viewports the whole page is one
 * flick of the wheel and a floating button is pure clutter, and above it the reader
 * can lose their place.
 */
(function () {
  'use strict';

  var main = document.querySelector('main.doc-wrap');
  if (!main) return;

  var sections = Array.prototype.slice.call(main.querySelectorAll('section.doc-section'));
  if (sections.length < 2) return;

  /* The heading text is the human name of the block — "Right-sizing", "Deep dives".
     Fall back to the section id so the label is never empty. */
  function nameOf(section) {
    var h = section.querySelector('h2');
    var text = h && h.textContent ? h.textContent.trim() : '';
    return text || section.id || 'next section';
  }

  function isVisible(section) {
    return section.offsetParent !== null;
  }

  /* The next section is the first whose top edge sits below a small threshold.
     The threshold (not zero) means a section scrolled to *just* above the top of
     the viewport counts as current rather than next, so one click never lands the
     reader back where they already are. */
  function nextSection() {
    for (var i = 0; i < sections.length; i++) {
      if (!isVisible(sections[i])) continue;
      if (sections[i].getBoundingClientRect().top > 4) return sections[i];
    }
    return null;
  }

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'section-nav';
  btn.innerHTML = '<span aria-hidden="true">&#9662;</span>';

  var label = document.createElement('span');
  label.className = 'section-nav-label';
  btn.appendChild(label);

  var target = null;

  /* Two viewports of document. Re-measured rather than decided once at load: the basic
     lens can halve a page's height, and mermaid renders after this script runs. */
  var MIN_SCREENS = 2;
  function longEnough() {
    return document.documentElement.scrollHeight > window.innerHeight * MIN_SCREENS;
  }

  function paint() {
    target = nextSection();
    if (target) {
      var name = nameOf(target);
      btn.disabled = false;
      btn.setAttribute('aria-label', 'Jump to next section: ' + name);
      label.textContent = name;
    } else {
      btn.disabled = true;
      btn.setAttribute('aria-label', 'End of page — no next section');
      label.textContent = 'End';
    }
  }

  btn.addEventListener('click', function () {
    if (!target) return;
    /* Move focus as well as the viewport: a keyboard or screen-reader user must
       land IN the section, not merely have the page scrolled under them. The
       section is not natively focusable, so give it a temporary tabindex. */
    target.setAttribute('tabindex', '-1');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
    /* Reflect the new position in the URL so the jump is shareable and the back
       button works — replaceState, not a hash assignment, which would fight the
       smooth scroll. */
    if (target.id && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#' + target.id);
    }
    paint();
  });

  /* Attach and detach rather than hide: the other injected controls exist only where
     they apply (progress.js injects its toggle only where a practice box exists), and
     the site has exactly four hide mechanisms already — this adds no fifth. */
  var attached = false;
  function sync() {
    if (longEnough()) {
      if (!attached) { document.body.appendChild(btn); attached = true; }
      paint();
    } else if (attached) {
      document.body.removeChild(btn);
      attached = false;
    }
  }

  /* rAF-throttled: scroll fires far more often than the label can meaningfully
     change, and this runs on every content page. */
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
  /* The lens changes which content is visible, which changes section offsets. */
  document.addEventListener('kb-lens-change', onScroll);
  /* Height changes with no event of their own: mermaid replaces each diagram with a
     rendered SVG well after this script runs, and web fonts reflow the prose. Without
     this the control would be missing on a page that only becomes tall enough once its
     diagrams land. The button is position:fixed, so attaching it cannot itself resize
     the body and re-enter this. */
  if (window.ResizeObserver) new window.ResizeObserver(onScroll).observe(document.body);

  sync();
})();
