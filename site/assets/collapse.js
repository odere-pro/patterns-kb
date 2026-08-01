/* collapse.js — the hub's section disclosure state.
 *
 * Every section and subsection is a <details open data-collapse="…">. OPEN IS THE DEFAULT,
 * NOT THE ANSWER: this reads the rendered `open` attribute as its seed and applies the
 * visitor's own toggles over it, exactly as favourites.js treats data-kb-favourite. The
 * store therefore holds OVERRIDES ONLY — a section appears in it only while the visitor
 * disagrees with the markup — so re-shipping a section collapsed later still moves every
 * visitor who never expressed an opinion. A reader with no JS, or one printing the page,
 * sees whatever the markup shipped, which is everything.
 *
 * `data-collapse` is a build-emitted key, never a DOM index and never the heading's id: the
 * ids are a public anchor contract, and reordering the sections must not shuffle what a
 * returning visitor had closed.
 *
 * Two things force sections open WITHOUT touching the store — a live search (a match inside
 * a collapsed section is a match nobody can see) and printing. Both go through hold(),
 * which is KEYED rather than boolean, so clearing the search cannot re-collapse a section
 * the ★ filter still needs open.
 */
(function () {
  "use strict";
  var STORAGE_KEY = "kb-collapse-v1";

  var all = Array.prototype.slice.call(document.querySelectorAll("details[data-collapse]"));
  if (!all.length) return;

  var state = {};
  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; }
  catch (e) { state = {}; }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  // Own-property lookups only: a key like "constructor" is truthy on Object.prototype and
  // would read as a stored override nobody set. Same trap search.js documents.
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // Snapshotted BEFORE anything here mutates it — this is the authored default.
  var def = {};
  all.forEach(function (d) { def[d.getAttribute("data-collapse")] = d.open; });
  function wanted(key) { return has(state, key) ? !!state[key] : !!def[key]; }

  var holds = {};        // reason -> true, for every force-open currently in effect

  function forced() {
    for (var k in holds) if (has(holds, k)) return true;
    return false;
  }

  /* `toggle` fires ASYNCHRONOUSLY — it is queued, not dispatched inline — so a plain
     "am I applying right now?" flag is always false again by the time our own events
     arrive, and a forced-open search would silently rewrite every section as a visitor
     choice. Credits work instead of a flag because the event fires only when `open` really
     changes: each self-write queues exactly one event and each event spends one credit. */
  function paint() {
    var force = forced();
    all.forEach(function (d) {
      var want = force || wanted(d.getAttribute("data-collapse"));
      if (d.open === want) return;        // unchanged — no event will fire, no credit due
      d.kbSelf = (d.kbSelf || 0) + 1;
      d.open = want;
    });
  }

  all.forEach(function (d) {
    d.addEventListener("toggle", function () {
      if (d.kbSelf) { d.kbSelf -= 1; return; }   // our own write, not a choice
      var key = d.getAttribute("data-collapse");
      if (d.open === !!def[key]) delete state[key];   // back at the default — store nothing
      else state[key] = d.open;
      persist();
    });
  });

  /* A fragment link into a collapsed section lands on nothing: the browser resolved the
     anchor before this script ran, and an element inside a closed <details> has no box to
     scroll to. The jumpnav and ~757 breadcrumb / prev-next links across the corpus are
     exactly such links, so open the chain and scroll again. Opening here is a real choice
     and persists — the visitor asked for that section by following a link to it. */
  function revealHash() {
    var el = location.hash ? document.getElementById(location.hash.slice(1)) : null;
    if (!el || !el.closest) return;
    var d = el.closest("details[data-collapse]");
    while (d) {
      if (!d.open) d.open = true;   // deliberately uncredited: this IS a choice, so it persists
      d = d.parentElement ? d.parentElement.closest("details[data-collapse]") : null;
    }
    /* Scroll on the next frame, not now. Opening the chain reflows everything below it, and
       on a fresh load the browser's own scroll restoration runs after this script — scroll
       inline and it is computed against the old layout and then overridden anyway. */
    if (!el.scrollIntoView) return;
    if (window.requestAnimationFrame) window.requestAnimationFrame(function () { el.scrollIntoView(); });
    else el.scrollIntoView();
  }

  window.KB_COLLAPSE = {
    hold: function (reason, on) {
      if (on) holds[reason] = true; else delete holds[reason];
      paint();
    },
  };

  paint();
  revealHash();
  window.addEventListener("hashchange", revealHash);
  window.addEventListener("beforeprint", function () { window.KB_COLLAPSE.hold("print", true); });
  window.addEventListener("afterprint", function () { window.KB_COLLAPSE.hold("print", false); });
})();
