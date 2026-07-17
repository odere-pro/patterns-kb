/* search.js — offline search over the hub.
 *
 * Reads window.KB_CATALOG (assets/catalog.js). It is loaded as a script rather than
 * fetched because fetch() is blocked on file://, and this site must work by
 * double-clicking index.html.
 *
 * It filters the chips already on the page instead of rendering its own result list, so
 * a match stays in its band and group — you keep seeing WHERE a pattern sits, which is
 * the whole point of an elevation map.
 *
 * Scoring mirrors scripts/kb.mjs: `solves` phrases are written as symptoms, so a whole
 * complaint ("one slow dependency blocks my threads") searches better than keywords, and
 * naming a pattern is weighted differently from describing one.
 */
(function () {
  var catalog = (window.KB_CATALOG && window.KB_CATALOG.nodes) || [];
  if (!catalog.length) return;

  var byId = {};
  catalog.forEach(function (n) { byId[n.id] = n; });

  // Synonym bridge, projected from lib/model.mjs into the catalog by build.mjs — the same map
  // kb.mjs find uses, so the browser and the CLI agree. A term scores full weight, its
  // synonyms half, so "outdated" still reaches a page that only says "stale".
  var SYN = (window.KB_CATALOG && window.KB_CATALOG.synonyms) || {};

  var STOP = { the: 1, and: 1, for: 1, are: 1, but: 1, not: 1, you: 1, all: 1, any: 1,
    can: 1, with: 1, that: 1, this: 1, from: 1, into: 1, when: 1, what: 1, why: 1,
    how: 1, does: 1, has: 1, have: 1, its: 1, they: 1, was: 1, were: 1, will: 1 };

  // Raw score for one term (or synonym variant) against a node's fields — no multiplier.
  function termScore(n, t, naming, hay, solves, tags) {
    var s = 0;
    if (n.id.indexOf(t) >= 0) s += naming ? 6 : 2;
    if (n.name.toLowerCase().indexOf(t) >= 0) s += naming ? 5 : 2;
    if (solves.some(function (x) { return x.toLowerCase().indexOf(t) >= 0; })) s += naming ? 5 : 6;
    if (tags.some(function (x) { return x.toLowerCase().indexOf(t) >= 0; })) s += 3;
    if (n.essence.toLowerCase().indexOf(t) >= 0) s += 3;
    else if (hay.indexOf(t) >= 0) s += 1;
    return s;
  }

  function score(n, q, terms, naming) {
    var s = 0, matched = 0;
    var aliases = n.aliases || [], tags = n.tags || [], solves = n.solves || [];
    if (n.id === q || n.name.toLowerCase() === q ||
        aliases.some(function (a) { return a.toLowerCase() === q; })) s += 100;

    var hay = [n.id, n.name, n.essence].concat(aliases, tags, solves).join(" ").toLowerCase();
    for (var i = 0; i < terms.length; i++) {
      // Score the term at full weight, then each synonym at half; the term counts as
      // matched once, on its best variant. Mirrors scripts/kb.mjs.
      var variants = [terms[i]].concat(SYN[terms[i]] || []);
      var best = 0;
      for (var v = 0; v < variants.length; v++) {
        var got = termScore(n, variants[v], naming, hay, solves, tags) * (v === 0 ? 1 : 0.5);
        if (got > best) best = got;
      }
      if (best > 0) { s += best; matched++; }
    }
    return s * (1 + matched / Math.max(terms.length, 1));
  }

  function matches(q) {
    q = q.trim().toLowerCase();
    if (!q) return null;
    var terms = q.split(/\s+/).filter(function (t) { return t.length > 2 && !STOP[t]; });
    var naming = terms.length <= 2;
    var raw = {}, max = 0;
    catalog.forEach(function (n) {
      var s = score(n, q, terms, naming);
      if (s > 0) { raw[n.id] = s; if (s > max) max = s; }
    });
    // A broad symptom weakly matches most of the corpus — "slow", "blocks" and "threads"
    // each turn up somewhere on ~100 pages. Filtering in place preserves page order, not
    // rank, so without a cut the weak matches near the top of the page bury the strong
    // ones. Keep only what scores within a band of the best hit.
    var cut = max * 0.35;
    var hits = {};
    for (var id in raw) if (raw[id] >= cut) hits[id] = raw[id];
    return hits;
  }

  var input, status;

  function apply(q) {
    var hits = matches(q);
    var shown = 0;

    document.querySelectorAll("[data-id]").forEach(function (box) {
      var chip = box.closest(".chip");
      if (!chip) return;
      var on = !hits || hits[box.dataset.id] > 0;
      chip.hidden = !on;
      if (on) shown++;
    });
    // Hazard chips carry no checkbox, so they have no data-id to key off.
    document.querySelectorAll(".hazard-chip").forEach(function (chip) {
      var a = chip.querySelector("a[href]");
      if (!a) return;
      var id = a.getAttribute("href").split("/").pop().replace(".html", "");
      var on = !hits || hits[id] > 0;
      chip.hidden = !on;
      if (on) shown++;
    });
    document.querySelectorAll(".theme-card").forEach(function (card) {
      var id = card.getAttribute("href").split("/").pop().replace(".html", "");
      var on = !hits || hits[id] > 0;
      card.hidden = !on;
      if (on) shown++;
    });

    // Collapse anything left empty, so the page doesn't fill with hollow headings.
    [".group", ".lens-card", ".band", ".themes", ".hazards"].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        var kids = el.querySelectorAll(".chip, .theme-card");
        if (!kids.length) return;
        var any = Array.prototype.some.call(kids, function (k) { return !k.hidden; });
        el.hidden = hits ? !any : false;
      });
    });

    document.body.classList.toggle("searching", !!hits);
    status.textContent = hits ? shown + " match" + (shown === 1 ? "" : "es") : "";
  }

  function mount() {
    var host = document.querySelector(".controls");
    if (!host) return;
    var wrap = document.createElement("div");
    wrap.className = "search";
    wrap.innerHTML =
      '<input type="search" id="kb-search" placeholder="Describe a problem — “one slow dependency blocks my threads”" ' +
      'aria-label="Search patterns by name or by the problem they solve" autocomplete="off" spellcheck="false">' +
      '<span class="search-status" id="kb-search-status" role="status" aria-live="polite"></span>';
    host.appendChild(wrap);

    input = wrap.querySelector("input");
    status = wrap.querySelector(".search-status");

    var t;
    input.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () { apply(input.value); }, 90);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { input.value = ""; apply(""); input.blur(); }
      if (e.key === "Enter") {
        var first = document.querySelector(".chip:not([hidden]) .chip-name, .theme-card:not([hidden])");
        if (first) first.click();
      }
    });
    // "/" focuses search, the way every wiki does it.
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== input) { e.preventDefault(); input.focus(); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
