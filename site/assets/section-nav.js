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

  /* rAF-throttled: scroll fires far more often than the label can meaningfully
     change, and this runs on every content page. */
  var queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () {
      queued = false;
      paint();
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  /* The lens changes which content is visible, which changes section offsets. */
  document.addEventListener('kb-lens-change', onScroll);

  document.body.appendChild(btn);
  paint();
})();
