/* palette.js — the site-wide ⌘K command palette.
 *
 * The hub has had a search box since the beginning, and every other page had nothing: from a
 * pattern page the only way to reach another pattern was to go back to the Atlas. This gives
 * all 358 pages one keystroke to anywhere.
 *
 * It scores NOTHING of its own. window.KB_MATCHES is the hub's scorer (search.js), and
 * map/graph.html already consumes it the same way, so the palette's ranking is the hub's
 * ranking by construction — one scorer, kept honest by search-parity.test.mjs. Requires
 * catalog.js then search.js, in that order; search.js's own mount() looks for .controls and
 * early-returns when there is none, so loading it on a content page costs nothing.
 *
 * TWO KEYS, ONE RULE. ⌘K opens this palette on EVERY page, so the chord means the same thing
 * everywhere — that uniformity is the feature. "/" is the local key: where the page renders a
 * search box of its own (the hub's tile filter, the graph's canvas query) it focuses that box
 * instead, because filtering in place tells you WHERE a page sits and a modal cannot.
 *
 * So the presence check below no longer gates whether the palette installs — only which key
 * the palette declines to take. It stays a check on their markup rather than a page-name list,
 * because that is the thing that is actually true: whoever renders .controls or #graph-search
 * owns "/". search.js and graph-view.js each bind that key themselves; neither binds ⌘K any
 * more, so no two handlers fight over one chord.
 *
 * DEPTH. catalog paths are site-root-relative ("patterns/gof/creational/singleton.html") and
 * this script runs at four different depths, with no build step injecting a global. Every page
 * links assets/tokens.css from its own level, so that href IS the depth: strip the known tail
 * and what remains is the prefix. No page can be at the wrong depth and still be styled, which
 * makes this self-checking in a way a hardcoded table would not be.
 *
 * Typing a product name works without a product index of its own: comparison pages carry
 * theirs as data-kb-aliases, so "kafka" reaches Message brokers & streams through the catalog.
 */
(function () {
  var catalog = (window.KB_CATALOG && window.KB_CATALOG.nodes) || [];
  if (!catalog.length || typeof window.KB_MATCHES !== "function") return;

  var LIMIT = 20;
  var byId = {};
  for (var i = 0; i < catalog.length; i++) byId[catalog[i].id] = catalog[i];

  /* The page's own stylesheet href, minus the tail, is the path back to site root. Kept
   * pure and fed the hrefs, so the depth arithmetic is unit-testable without a DOM.
   * Every name a page is allowed to link, because a page links exactly one: the three
   * kb-*.css aggregators, plus tokens.css for a page loading this script on its own. */
  function prefixFromHrefs(hrefs) {
    for (var j = 0; j < hrefs.length; j++) {
      var m = String(hrefs[j] || "").match(/^(.*)assets\/(?:kb-page|kb-hub|kb-graph|tokens)\.css$/);
      if (m) return m[1];
    }
    return "";
  }
  function stylesheetHrefs() {
    var links = document.querySelectorAll('link[rel="stylesheet"]'), out = [];
    for (var j = 0; j < links.length; j++) out.push(links[j].getAttribute("href"));
    return out;
  }
  /* kb.js already did this arithmetic off its own src attribute and it is the authority.
   * The href fallback stays because catalog paths are site-root-relative and getting the
   * depth wrong 404s every result on 382 pages with no build error — check-links.mjs
   * cannot see a path computed at runtime, which is why there is a test case per depth. */
  var PREFIX = typeof window.KB_PREFIX === "string" ? window.KB_PREFIX : prefixFromHrefs(stylesheetHrefs());

  /* The result list: the hub's scores, ordered, resolved to catalog nodes and capped. Split
   * out from render() so the ranking can be tested apart from the markup. */
  function rank(q) {
    var hits = q && q.trim() ? window.KB_MATCHES(q) : null;
    var out = [];
    if (!hits) return out;
    var ids = Object.keys(hits);
    ids.sort(function (a, b) { return hits[b] - hits[a]; });
    for (var k = 0; k < ids.length && out.length < LIMIT; k++) {
      if (byId[ids[k]]) out.push(byId[ids[k]]);
    }
    return out;
  }

  /* Exposed for scripts/test/palette.test.mjs, the same way search.js exposes KB_MATCHES. */
  window.KB_PALETTE = { prefixFromHrefs: prefixFromHrefs, rank: rank, limit: LIMIT };

  var dialog, input, list, empty, items = [], active = -1;

  function build() {
    dialog = document.createElement("dialog");
    dialog.className = "palette";
    dialog.setAttribute("aria-label", "Search the knowledge base");
    dialog.innerHTML =
      '<div class="pal-box">' +
        '<input type="search" class="pal-input" autocomplete="off" spellcheck="false" ' +
          'aria-label="Search by name or by the problem it solves" ' +
          'placeholder="Search — a name, or the problem (“my threads all block”)">' +
        '<ul class="pal-list" role="listbox" aria-label="Results"></ul>' +
        '<p class="pal-empty" hidden>Nothing matches that yet.</p>' +
        '<p class="pal-hint"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>↵</kbd> open · <kbd>esc</kbd> close</p>' +
      '</div>';
    document.body.appendChild(dialog);
    input = dialog.querySelector(".pal-input");
    list = dialog.querySelector(".pal-list");
    empty = dialog.querySelector(".pal-empty");

    var t;
    input.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(run, 90);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") { e.preventDefault(); open(active < 0 ? 0 : active); }
    });
    /* Esc and the backdrop both close. `cancel` covers the native Esc so the key is not
     * handled twice, once here and once by the dialog itself. */
    dialog.addEventListener("cancel", function (e) { e.preventDefault(); close(); });
    dialog.addEventListener("click", function (e) { if (e.target === dialog) close(); });
  }

  function run() {
    items = rank(input.value);
    render();
  }

  function render() {
    list.textContent = "";
    active = items.length ? 0 : -1;
    empty.hidden = !(input.value.trim() && !items.length);
    for (var k = 0; k < items.length; k++) {
      var n = items[k];
      var li = document.createElement("li");
      li.className = "pal-item";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", k === 0 ? "true" : "false");
      var a = document.createElement("a");
      a.className = "pal-link";
      /* setAttribute rather than .href: open() reads the attribute back, and .href as a
       * property reads back absolutised. Set and read the same thing. */
      a.setAttribute("href", PREFIX + n.path);
      a.innerHTML = '<span class="pal-name"></span><span class="pal-kind"></span>' +
        '<span class="pal-essence"></span>';
      a.querySelector(".pal-name").textContent = n.name;
      a.querySelector(".pal-kind").textContent = n.kind;
      a.querySelector(".pal-essence").textContent = n.essence || "";
      li.appendChild(a);
      list.appendChild(li);
    }
    mark();
  }

  function mark() {
    var lis = list.children;
    for (var k = 0; k < lis.length; k++) {
      var on = k === active;
      lis[k].setAttribute("aria-selected", on ? "true" : "false");
      lis[k].className = on ? "pal-item is-active" : "pal-item";
      if (on && lis[k].scrollIntoView) lis[k].scrollIntoView({ block: "nearest" });
    }
  }

  function move(d) {
    if (!items.length) return;
    active = (active + d + items.length) % items.length;
    mark();
  }

  function open(k) {
    var li = list.children[k];
    var a = li && li.querySelector("a");
    if (a) window.location.href = a.getAttribute("href");
  }

  function show() {
    if (!dialog) build();
    if (dialog.open) { input.select(); return; }
    dialog.showModal();
    input.value = "";
    items = [];
    render();
    input.focus();
  }

  function close() {
    if (dialog && dialog.open) dialog.close();
  }

  /* ⌘K, Ctrl+K elsewhere, on every page. altKey is excluded so Alt+K stays available to the
   * browser and to input methods that use it. "/" opens the palette the way every wiki does
   * it, but only where the page has no search box of its own to focus — see TWO KEYS above.
   * Read once at bind time rather than per keystroke: search.js and graph-view.js mount their
   * boxes from markup that is already in the document when this file runs. */
  var LOCAL_SEARCH = !!document.querySelector(".controls, #graph-search");
  function editing(el) {
    if (!el) return false;
    var tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      show();
    } else if (e.key === "/" && !LOCAL_SEARCH && !editing(document.activeElement)) {
      e.preventDefault();
      show();
    }
  });
})();
