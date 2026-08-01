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
 * Parity note: kb.mjs `find` is this scorer's CLI twin. Its --level flag scopes the
 * *prose* index, which this catalog-only search never reads, so the reading-level lens
 * needs no counterpart here — keep the scoring itself in sync though.
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

  // Same stopword set as kb.mjs (STOP in scripts/lib/expansions.mjs) — parity contract.
  var STOP = { the: 1, and: 1, for: 1, are: 1, but: 1, not: 1, you: 1, all: 1, any: 1,
    can: 1, with: 1, that: 1, this: 1, from: 1, into: 1, when: 1, what: 1, why: 1,
    how: 1, does: 1, has: 1, have: 1, its: 1, his: 1, her: 1, their: 1, them: 1,
    they: 1, was: 1, were: 1, will: 1, would: 1, should: 1 };

  // Every map here is an object literal keyed by a QUERY WORD, so it inherits
  // Object.prototype: STOP["constructor"] is a function, hence truthy, and the term was
  // silently dropped as a stopword — "constructor" returned zero pages on a KB full of
  // creational patterns. Same trap in SYN and in the dedupe below. Own-property lookups
  // only. Mirrors `own()` in scripts/lib/expansions.mjs.
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // Six suffix rules, first match wins, each with its own minimum length. Not a general
  // stemmer: it exists so a searcher who types "threads" or "blocked" reaches a page whose
  // author wrote "thread" and "blocks". Over-stemming is safe — matching is by substring,
  // so an over-stem is a PREFIX of the word it came from and can only hit inside the same
  // word family, and the unstemmed term still scores at full weight as variant 0.
  // ES5 twin of stemVariant() in scripts/lib/search.mjs; search-parity.test.mjs runs the
  // whole corpus vocabulary through both.
  var STEM_RULES = [
    [/ies$/, 6, 3, "y"],
    [/(?:ss|sh|ch|x|z)es$/, 6, 2, ""],
    [/[^s]s$/, 5, 1, ""],
    [/ing$/, 7, 3, ""],
    [/ied$/, 6, 3, "y"],
    [/ed$/, 6, 2, ""]
  ];
  function stemVariant(term) {
    for (var i = 0; i < STEM_RULES.length; i++) {
      var rule = STEM_RULES[i];
      if (term.length < rule[1] || !rule[0].test(term)) continue;
      var stem = term.slice(0, term.length - rule[2]) + rule[3];
      return stem.length >= 4 && stem !== term ? stem : null;
    }
    return null;
  }
  // Exposed for the parity test, the same way KB_MATCHES is.
  window.KB_STEM = stemVariant;

  // The term itself at full weight, then its synonyms and its stem at half. Order matters:
  // a tie between variants keeps the first, so this must build the list exactly as
  // termVariants() does in scripts/lib/search.mjs.
  function termVariants(term) {
    var out = [term].concat(has(SYN, term) ? SYN[term] : []);
    var stem = stemVariant(term);
    if (stem && out.indexOf(stem) < 0) out.push(stem);
    return out;
  }

  // Raw score for one term (or synonym variant) against a node's fields — no multiplier.
  function termScore(n, t, naming, hay, solves, tags) {
    var s = 0;
    if (n.id.indexOf(t) >= 0) s += naming ? 6 : 2;
    if (n.name.toLowerCase().indexOf(t) >= 0) s += naming ? 5 : 2;
    if (solves.some(function (x) { return x.toLowerCase().indexOf(t) >= 0; })) s += naming ? 5 : 6;
    if (tags.some(function (x) { return x.toLowerCase().indexOf(t) >= 0; })) s += 3;
    // A page with no solves (themes) carries what symptom vocabulary it has in the
    // essence — score it at the solves weight there. Mirrors kb.mjs.
    if (n.essence.toLowerCase().indexOf(t) >= 0) s += solves.length ? 3 : (naming ? 5 : 6);
    else if (hay.indexOf(t) >= 0) s += naming ? 2 : 1;
    return s;
  }

  function score(n, q, terms, naming) {
    var s = 0, matched = 0;
    var aliases = n.aliases || [], tags = n.tags || [], solves = n.solves || [];
    if (n.id === q || n.name.toLowerCase() === q ||
        aliases.some(function (a) { return a.toLowerCase() === q; })) s += 100;

    var hay = [n.id, n.name, n.essence].concat(aliases, tags, solves).join(" ").toLowerCase();
    for (var i = 0; i < terms.length; i++) {
      // Score the term at full weight, then each variant at half; the term counts as
      // matched once, on its best variant. Mirrors scripts/lib/search.mjs.
      var variants = termVariants(terms[i]);
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
    // Dedupe terms, mirroring kb.mjs — a repeated word must not score twice.
    var seen = {};
    var terms = q.split(/\s+/).filter(function (t) {
      if (t.length <= 2 || has(STOP, t) || has(seen, t)) return false;
      seen[t] = 1;
      return true;
    });
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

  // The graph page reuses this scorer for its search and symptom seeds; mount() below
  // early-returns there (no .controls), so exposing the function is the only coupling.
  window.KB_MATCHES = matches;

  // ---- facets ----
  // Chips resolved to id lists by build.mjs. Rail groups AND together; chips within a rail
  // union. The active set intersects with the free-text hits before anything is shown.
  var FACETS = (window.KB_CATALOG && window.KB_CATALOG.facets) || [];
  var chipIds = {};   // chipId -> Set(nodeId)
  FACETS.forEach(function (rail) {
    rail.chips.forEach(function (c) {
      var set = {};
      (c.ids || []).forEach(function (id) { set[id] = 1; });
      chipIds[c.id] = set;
    });
  });
  var active = {};    // chipId -> true, for every pressed chip

  // The id-set the facets allow: union within each rail, intersection across rails. Returns
  // null when no chip is pressed (no facet constraint at all).
  function facetHits() {
    var railSets = [];
    FACETS.forEach(function (rail) {
      var on = rail.chips.filter(function (c) { return active[c.id]; });
      if (!on.length) return;
      var union = {};
      on.forEach(function (c) { for (var id in chipIds[c.id]) union[id] = 1; });
      railSets.push(union);
    });
    if (!railSets.length) return null;
    var acc = railSets[0];
    for (var i = 1; i < railSets.length; i++) {
      var next = {};
      for (var id in acc) if (railSets[i][id]) next[id] = 1;
      acc = next;
    }
    return acc;
  }

  var input, status;

  // Combine free-text hits with facet hits: a node is visible only if it passes BOTH active
  // constraints. Either being null means "no constraint from that source".
  function visibleSet() {
    var text = matches(input ? input.value : "");
    var facet = facetHits();
    if (!text && !facet) return null;         // nothing active — show everything
    if (text && !facet) return text;
    if (facet && !text) return facet;
    var both = {};
    for (var id in text) if (facet[id]) both[id] = 1;
    return both;
  }

  function apply() {
    var hits = visibleSet();
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

  var facetBtns = {};   // chipId -> button element, so clearFacets can reset aria-pressed

  // Build the facet bar: one labelled group per rail, one aria-pressed toggle per chip.
  // Injected after .controls, mirroring how the search box is injected rather than authored.
  function renderFacets(controls) {
    if (!FACETS.length) return;
    var bar = document.createElement("div");
    bar.className = "facetbar";
    bar.setAttribute("aria-label", "Quick filters");
    FACETS.forEach(function (rail) {
      // A chip whose predicate matched nothing filters to an empty hub and explains
      // nothing about why. build.mjs ships ids:[] for a kind with no pages yet — the
      // `comparison` kind is declared and ordered but has no pages — so skip those, and
      // skip a rail left with no chips rather than shipping a bare label.
      var live = rail.chips.filter(function (c) { return c.ids && c.ids.length; });
      if (!live.length) return;
      var group = document.createElement("div");
      group.className = "facet-rail";
      var label = document.createElement("span");
      label.className = "facet-rail-label";
      label.textContent = rail.rail;
      group.appendChild(label);
      live.forEach(function (c) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "facet-chip";
        btn.setAttribute("aria-pressed", "false");
        btn.textContent = c.label;
        btn.addEventListener("click", function () {
          if (active[c.id]) delete active[c.id]; else active[c.id] = true;
          btn.setAttribute("aria-pressed", active[c.id] ? "true" : "false");
          apply();
        });
        facetBtns[c.id] = btn;
        group.appendChild(btn);
      });
      bar.appendChild(group);
    });
    controls.parentNode.insertBefore(bar, controls.nextSibling);
  }

  function clearFacets() {
    active = {};
    for (var id in facetBtns) facetBtns[id].setAttribute("aria-pressed", "false");
  }

  function mount() {
    var host = document.querySelector(".controls");
    if (!host) return;
    var wrap = document.createElement("div");
    wrap.className = "search";
    wrap.innerHTML =
      '<input type="search" id="kb-search" placeholder="Describe a problem — “one slow dependency blocks my threads”" ' +
      'aria-label="Search patterns by name or by the problem they solve" ' +
      'title="Shortcut: / or ⌘K (Ctrl+K)" autocomplete="off" spellcheck="false">' +
      '<span class="search-status" id="kb-search-status" role="status" aria-live="polite"></span>';
    host.appendChild(wrap);

    input = wrap.querySelector("input");
    status = wrap.querySelector(".search-status");

    renderFacets(host);

    var t;
    input.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(apply, 90);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { input.value = ""; clearFacets(); apply(); input.blur(); }
      if (e.key === "Enter") {
        var first = document.querySelector(".chip:not([hidden]) .chip-name, .theme-card:not([hidden])");
        if (first) first.click();
      }
    });
    // "/" focuses search, the way every wiki does it; ⌘K (Ctrl+K elsewhere), the way
    // every app does. ⌘K also works from inside the input, reselecting the query.
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== input) { e.preventDefault(); input.focus(); }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
