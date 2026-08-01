/* vocab.js — the vocabulary page's two modes and its filter.
 *
 * Loaded synchronously in <head> so the stored mode applies before first paint, the same
 * reason theme.js and lens.js are: a reader who left in A-Z should not watch the grouped
 * view render and then reflow away.
 *
 * TWO MODES, ONE COPY OF THE DOM. Grouped is what build-vocab.mjs ships — topic sections
 * with their prose, working with JS off, ids intact. A-Z is a re-projection: the SAME
 * `.vocab-item` nodes are relocated into one sorted list and moved back on toggle. Nothing
 * is cloned, so no id is ever duplicated and `vocab.html#combines-with` keeps resolving in
 * either mode. Two consequences worth knowing before editing:
 *
 *   - Restore comes from a SNAPSHOT taken at load, never from re-sorting. The grouped
 *     order is meaningful (editorial for the relation verbs, semantic for the blocks), and
 *     appending nodes back in A-Z order would silently destroy it — the page still renders,
 *     just wrong, which is why the ordering is also unit-tested via window.KB_VOCAB_SORT.
 *   - Relocation moves the node the browser may have scrolled to for location.hash, and
 *     blurs whatever had focus inside it. Both are repaired after every move.
 *
 * The filter hides `.vocab-item` with the `hidden` property (pattern.css carries the
 * display:none rule, because these rows are flex and beat the UA default), and separately
 * asks search.js's scorer about the rest of the corpus. That scorer arrives deferred, so
 * every use of it is feature-detected: the term filter must work from the first keystroke.
 */
(function () {
  "use strict";

  var KEY = "kb-vocab-mode";
  var AZ = "az";

  /* ---- the pure part ----
   * Ordering logic with no DOM, no storage and nothing else in it, so it can be unit-tested
   * the way graph-core.js is. Takes {sort, type, id} and returns a new array — the input is
   * never reordered in place, because the caller's array IS the restore snapshot.
   *
   * Sort keys collide across families: `kind`, `band`, `group`, `role` and `level` are each
   * both a JSON-LD property and something else. Tie-break on type, then id, so the order is
   * total and the same on every engine regardless of Array#sort stability. */
  function sortTerms(items) {
    return items.slice().sort(function (a, b) {
      var k = String(a.sort).localeCompare(String(b.sort), "en");
      if (k) return k;
      var t = String(a.type).localeCompare(String(b.type), "en");
      if (t) return t;
      return String(a.id).localeCompare(String(b.id), "en");
    });
  }
  /* The letter a term files under. Everything non-alphabetic shares one bucket rather than
   * each punctuation mark growing a heading of its own. */
  function letterOf(item) {
    var c = String(item.sort).charAt(0).toUpperCase();
    return c >= "A" && c <= "Z" ? c : "#";
  }

  if (typeof window !== "undefined") {
    window.KB_VOCAB_SORT = sortTerms;
    window.KB_VOCAB_LETTER = letterOf;
  }
  // Loaded for its logic alone (the unit test), with no page around it.
  if (typeof document === "undefined") return;

  var root = document.documentElement;

  /* ---- head phase: stamp the stored mode before first paint ---- */
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  if (stored === AZ) root.dataset.vocabMode = AZ;

  function current() { return root.dataset.vocabMode === AZ ? AZ : "grouped"; }

  document.addEventListener("DOMContentLoaded", function () {
    var azHost = document.getElementById("vocab-az");
    var host = document.getElementById("vocab-controls");
    if (!azHost || !host) return;

    /* ---- snapshot: the authored order, captured before anything moves ----
     * build-vocab.mjs guarantees a .vocab-list holds nothing but .vocab-item children, so
     * the array below is an exact record of the grouped page. */
    var lists = [];
    var items = [];
    var allLists = document.querySelectorAll(".vocab-section .vocab-list");
    for (var i = 0; i < allLists.length; i++) {
      var kids = [].slice.call(allLists[i].children);
      lists.push({ list: allLists[i], items: kids });
      items = items.concat(kids);
    }
    if (!items.length) return;

    /* ---- build the A-Z view once, and keep it ----
     * Letter groups sit outside .vocab-list so the "only .vocab-item children" invariant
     * survives; the per-letter list is itself a .vocab-list for styling only, and is never
     * snapshotted because the snapshot is scoped to .vocab-section above. */
    var ordered = sortTerms(items.map(function (el) {
      return { el: el, id: el.id, sort: el.dataset.vocabSort || el.id, type: el.dataset.vocabType || "" };
    }));
    var letterLists = {};
    var seen = "";
    var azList = null;
    for (var j = 0; j < ordered.length; j++) {
      var letter = letterOf(ordered[j]);
      if (letter !== seen) {
        seen = letter;
        var group = document.createElement("div");
        group.className = "vocab-letter-group";
        var head = document.createElement("h2");
        head.className = "vocab-letter";
        head.textContent = letter;
        azList = document.createElement("div");
        azList.className = "vocab-list";
        group.appendChild(head);
        group.appendChild(azList);
        azHost.appendChild(group);
        letterLists[letter] = azList;
      }
      ordered[j].list = azList;
    }

    /* ---- mode ---- */
    /* The browser resolved location.hash at parse time, against a layout we then changed by
     * moving the target somewhere else on the page. Put the reader back on it. */
    function reveal() {
      if (location.hash.length <= 1) return;
      var target = document.getElementById(location.hash.slice(1));
      if (target && !target.hidden) target.scrollIntoView();
    }

    function applyMode(mode) {
      var focused = document.activeElement && document.activeElement.id;

      /* Stamp the mode BEFORE moving anything. The A-Z container is display:none until the
       * attribute is set, and an element with no layout box cannot be scrolled to — so
       * doing this afterwards silently costs the reader their anchor. */
      if (mode === AZ) root.dataset.vocabMode = AZ;
      else delete root.dataset.vocabMode;

      if (mode === AZ) {
        for (var k = 0; k < ordered.length; k++) ordered[k].list.appendChild(ordered[k].el);
      } else {
        // From the snapshot, never by sorting — see the header.
        for (var l = 0; l < lists.length; l++) {
          for (var m = 0; m < lists[l].items.length; m++) lists[l].list.appendChild(lists[l].items[m]);
        }
      }

      try {
        if (mode === AZ) localStorage.setItem(KEY, AZ);
        else localStorage.removeItem(KEY);
      } catch (e) { /* ignore */ }
      paintModes(mode);
      applyFilter();

      // Moving a node blurs whatever had focus inside it.
      if (focused) {
        var back = document.getElementById(focused);
        if (back && back.focus) back.focus();
      }
      reveal();
    }

    /* ---- controls ---- */
    var modeGroup = document.createElement("div");
    modeGroup.className = "vocab-modes";
    modeGroup.setAttribute("role", "group");
    modeGroup.setAttribute("aria-label", "Vocabulary order");
    var MODES = [["grouped", "Grouped", "Grouped by topic"], [AZ, "A–Z", "One alphabetical index"]];
    for (var n = 0; n < MODES.length; n++) {
      (function (mode, label, title) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "vocab-mode-btn";
        btn.dataset.mode = mode;
        btn.textContent = label;
        btn.title = title;
        btn.addEventListener("click", function () { applyMode(mode); });
        modeGroup.appendChild(btn);
      })(MODES[n][0], MODES[n][1], MODES[n][2]);
    }
    document.body.appendChild(modeGroup);

    function paintModes(mode) {
      var btns = modeGroup.querySelectorAll(".vocab-mode-btn");
      for (var p = 0; p < btns.length; p++) {
        btns[p].setAttribute("aria-pressed", btns[p].dataset.mode === mode ? "true" : "false");
      }
    }

    var search = document.createElement("div");
    search.className = "vocab-search";
    search.innerHTML =
      '<input type="search" id="kb-vocab-search" placeholder="Filter the vocabulary — a term, or what it does" '
      + 'aria-label="Filter vocabulary terms" title="Shortcut: / or ⌘K (Ctrl+K)" autocomplete="off" spellcheck="false">'
      + '<span class="vocab-status" id="kb-vocab-status" role="status" aria-live="polite"></span>';
    host.appendChild(search);
    var input = search.querySelector("input");
    var status = search.querySelector(".vocab-status");

    var corpus = document.createElement("div");
    corpus.className = "vocab-corpus";
    corpus.hidden = true;
    host.appendChild(corpus);

    /* ---- filter ----
     * Two independent answers to one query: which terms on this page match, and which pages
     * elsewhere in the KB match. The second needs search.js's scorer, which is deferred. */
    /* The haystack is the whole row — term, type chip, meta chips and description — so
     * "the block that lists the knobs" finds `production`. Rows never change after load,
     * so the text is read once rather than on every keystroke. */
    function hay(el) {
      if (el._vocabHay === undefined) el._vocabHay = (el.textContent || "").toLowerCase();
      return el._vocabHay;
    }

    /* Substring alone is too literal for a vocabulary whose terms are gerunds: "cache"
     * would miss `caching`, and `caching` is the tag AND the band the searcher wants.
     * So each query word is tried in three forms — as typed, through the site's own
     * suffix stemmer (search.js, deferred, hence the guard), and with a trailing "e"
     * dropped. That last one is the half-step the house stemmer skips: it strips "-ing"
     * to leave "cach" but never strips the "e" from "cache", so the two sides of the same
     * word family never meet without it. Over-matching is safe here — an over-stem is a
     * prefix of the word it came from, so it can only hit inside its own family. */
    function variants(word) {
      var out = [word];
      var stem = typeof window.KB_STEM === "function" ? window.KB_STEM(word) : null;
      if (stem && out.indexOf(stem) < 0) out.push(stem);
      if (word.length >= 4 && word.charAt(word.length - 1) === "e") out.push(word.slice(0, -1));
      return out;
    }

    /* Words are ANDed: every word must appear somewhere in the row, in some form. */
    function matchesTerm(el, words) {
      var text = hay(el);
      for (var w = 0; w < words.length; w++) {
        var forms = words[w], hit = false;
        for (var f = 0; f < forms.length; f++) {
          if (text.indexOf(forms[f]) >= 0) { hit = true; break; }
        }
        if (!hit) return false;
      }
      return true;
    }

    function applyFilter() {
      var q = input ? input.value.trim().toLowerCase() : "";
      var words = q ? q.split(/\s+/).map(variants) : [];
      var shown = 0;
      for (var a = 0; a < items.length; a++) {
        var on = !q || matchesTerm(items[a], words);
        items[a].hidden = !on;
        if (on) shown++;
      }
      // Anything that would otherwise stand as a hollow heading.
      var holders = document.querySelectorAll(".vocab-section, .vocab-letter-group");
      for (var b = 0; b < holders.length; b++) {
        var kids = holders[b].querySelectorAll(".vocab-item");
        if (!kids.length) continue;                 // #how carries prose and no terms
        var any = false;
        for (var c = 0; c < kids.length; c++) if (!kids[c].hidden) { any = true; break; }
        holders[b].hidden = !any;
      }
      document.body.classList.toggle("vocab-filtering", !!q);
      if (status) status.textContent = q ? shown + (shown === 1 ? " term" : " terms") : "";
      renderCorpus(q);
    }

    function renderCorpus(q) {
      if (!q || typeof window.KB_MATCHES !== "function" || !window.KB_CATALOG) {
        corpus.hidden = true;
        corpus.innerHTML = "";
        return;
      }
      var hits = window.KB_MATCHES(q) || {};
      var nodes = window.KB_CATALOG.nodes || [];
      var byId = {};
      for (var d = 0; d < nodes.length; d++) byId[nodes[d].id] = nodes[d];
      var ranked = Object.keys(hits).sort(function (x, y) { return hits[y] - hits[x]; }).slice(0, 8);
      if (!ranked.length) { corpus.hidden = true; corpus.innerHTML = ""; return; }
      var html = '<p class="vocab-corpus-head">Elsewhere in the knowledge base</p><ul class="vocab-corpus-list">';
      for (var e = 0; e < ranked.length; e++) {
        var node = byId[ranked[e]];
        if (!node) continue;
        // vocab.html sits at site/, so a catalog path is already relative to it.
        html += '<li><a href="' + node.path + '">' + node.name + "</a> <span>" + (node.essence || "") + "</span></li>";
      }
      corpus.innerHTML = html + "</ul>";
      corpus.hidden = false;
    }

    var timer;
    input.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(applyFilter, 90);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { input.value = ""; applyFilter(); input.blur(); }
      if (e.key === "Enter") {
        var first = document.querySelector(".vocab-item:not([hidden]) .vocab-term");
        if (first) { first.focus(); location.hash = first.getAttribute("href").slice(1); }
      }
    });
    /* "/" the way every wiki does it, ⌘K (Ctrl+K elsewhere) the way every app does — the
     * same bindings search.js uses on the hub. They cannot collide: search.js only binds
     * these from inside mount(), which early-returns on a page with no .controls element,
     * and this page deliberately has none. */
    document.addEventListener("keydown", function (e) {
      var el = document.activeElement;
      var typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) { e.preventDefault(); input.focus(); }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });

    // A live filter would otherwise print as a page with most of its vocabulary missing.
    window.addEventListener("beforeprint", function () {
      if (input.value) { input.value = ""; applyFilter(); }
    });
    // The catalog lands after this script; re-run so the corpus results appear.
    window.addEventListener("load", function () { if (input.value) renderCorpus(input.value.trim().toLowerCase()); });
    window.addEventListener("hashchange", reveal);

    applyMode(current());
  });
})();
