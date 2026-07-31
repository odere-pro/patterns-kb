/* graph-core.js — the pure logic behind the interactive graph explorer.
 *
 * No DOM, no d3, no localStorage: every function here is a function of its arguments
 * and returns fresh data. That is what makes the graph's hard parts — edge dedupe and
 * canonical orientation, the query language, the orphan pass, settings migration —
 * testable under `node --test` (scripts/test/graph-core.test.mjs), while the d3 wiring
 * in graph-view.js stays hand-verified against the kb-graph checklist.
 *
 * Ships as a plain script loaded before graph-view.js (fetch() and modules are awkward
 * on file://, and the site must work by double-clicking a page). The single export is
 * window.KB_GRAPH_CORE; graph-view.js bails out if it is missing.
 */
(function (root) {
  "use strict";

  var PALETTE_SIZE = 8;        // grp-1..grp-8 color classes in graph.css
  var SETTINGS_VERSION = 1;    // bump when a stored shape stops being mergeable
  var EMPTY_META = { tags: [], aliases: [] };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* A directional verb pair collapses onto its sorted-first verb; a symmetric verb is
   * its own family. build-graph-page.mjs (legend buttons) and graph.css (fam-* colors)
   * implement the same rule — change it in all three or the legend stops matching. */
  function familyOf(relationTypes, type) {
    var def = relationTypes[type];
    return def.symmetric ? type : [type, def.inverse].sort()[0];
  }

  /* An edge may be declared on both pages it joins, so relations dedupe to one drawable
   * edge per (pair, family). Directional families are ORIENTED along their canonical
   * verb — "a generalizes b" always draws a → b whichever page declared it — so the
   * arrows toggle can mean something. Nodes are copied: d3 mutates them with x/y/vx/vy
   * and the source data stays clean. */
  function buildGraph(data) {
    var REL = data.relationTypes;
    var nodes = data.nodes.map(function (n) { return Object.assign({}, n); });
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });

    var edges = [];
    var neighbors = {};   // id -> {id: 1} across every family (ego-highlight)
    var seen = {};
    nodes.forEach(function (n) {
      (n.relations || []).forEach(function (r) {
        if (!byId[r.to] || !REL[r.type]) return;
        (neighbors[n.id] || (neighbors[n.id] = {}))[r.to] = 1;
        var fam = familyOf(REL, r.type);
        var key = (n.id < r.to ? n.id + "|" + r.to : r.to + "|" + n.id) + "#" + fam;
        if (seen[key]) return;
        seen[key] = true;
        var symmetric = REL[r.type].symmetric;
        var src = n.id, tgt = r.to;
        if (!symmetric && r.type !== fam) { src = r.to; tgt = n.id; }
        edges.push({ source: src, target: tgt, family: fam, dir: symmetric ? 0 : 1 });
      });
    });

    var degree = {};
    edges.forEach(function (e) {
      degree[e.source] = (degree[e.source] || 0) + 1;
      degree[e.target] = (degree[e.target] || 0) + 1;
    });

    return { nodes: nodes, byId: byId, edges: edges, neighbors: neighbors, degree: degree };
  }

  /* d3's link force rewrites source/target from id to node once the simulation owns the
   * edges, so every reader has to cope with both shapes. */
  function endId(v) { return typeof v === "string" ? v : v.id; }

  /* ---------------- query language ----------------
   * AND of space-separated terms; "-" negates a term. Operators: tag:x (substring of
   * any tag), kind:x / band:x (exact), fav:true|false. Bare words form one phrase
   * matched by substring against id/name/aliases OR by the hub scorer (KB_MATCHES) —
   * so both "circuit" and "one slow dependency blocks my threads" work. An unknown
   * op: prefix is treated as plain text.
   *
   * ctx.metaOf(id) supplies tags/aliases; ctx.matches(phrase) is the optional lexical
   * scorer. Returns null for an empty query — the caller decides what that means
   * (match-all as a filter, match-nothing as a group). */
  function compileQuery(query, ctx) {
    var metaOf = (ctx && ctx.metaOf) || function () { return EMPTY_META; };
    var matches = (ctx && ctx.matches) || null;

    function textMatch(n, s) {
      if (n.id.indexOf(s) >= 0) return true;
      if (n.name.toLowerCase().indexOf(s) >= 0) return true;
      var al = metaOf(n.id).aliases || [];
      for (var i = 0; i < al.length; i++) if (al[i].indexOf(s) >= 0) return true;
      return false;
    }

    var s = (query || "").trim().toLowerCase();
    if (!s) return null;
    var preds = [];
    var words = [];
    s.split(/\s+/).forEach(function (t) {
      var neg = t.charAt(0) === "-";
      if (neg) t = t.slice(1);
      if (!t) return;
      var m = t.match(/^(tag|kind|band|fav):(.+)$/);
      var f = null;
      if (m) {
        var v = m[2];
        if (m[1] === "tag") f = function (n) {
          var tags = metaOf(n.id).tags || [];
          for (var i = 0; i < tags.length; i++) if (tags[i].indexOf(v) >= 0) return true;
          return false;
        };
        else if (m[1] === "kind") f = function (n) { return n.kind === v; };
        else if (m[1] === "band") f = function (n) { return n.band === v; };
        else f = function (n) { return !!n.favourite === (v === "true"); };
      } else if (neg) {
        f = function (n) { return textMatch(n, t); };
      } else {
        words.push(t);
        return;
      }
      preds.push(neg ? (function (g) { return function (n) { return !g(n); }; })(f) : f);
    });
    if (words.length) {
      var phrase = words.join(" ");
      var hits = matches ? (matches(phrase) || {}) : {};
      preds.push(function (n) { return !!hits[n.id] || textMatch(n, phrase); });
    }
    if (!preds.length) return null;
    return function (n) {
      for (var i = 0; i < preds.length; i++) if (!preds[i](n)) return false;
      return true;
    };
  }

  /* ---------------- settings ---------------- */
  function defaultSettings(demoFamily) {
    var families = {};
    families[demoFamily] = false;   // half the edges — the main hairball source
    return {
      v: SETTINGS_VERSION,
      filters: { kinds: { pattern: 1, hazard: 1, theme: 1, principle: 1, design: 1 }, bands: {}, favs: false, orphans: false },
      families: families,            // family -> false when hidden; absent means visible
      groups: [],                    // [{q, color}] — first match wins, color 1..8
      display: { arrows: false, labelZoom: 1.4, nodeScale: 1, edgeScale: 1 },
      forces: { center: 0.05, repel: 140, link: 0.5, dist: 80 },
    };
  }

  /* Rehydrate the persisted blob. Anything unparseable, of the wrong version, or of the
   * wrong shape falls back to the defaults rather than half-applying. */
  function loadSettings(raw, demoFamily) {
    var settings = defaultSettings(demoFamily);
    if (!raw) return settings;
    var s = null;
    try { s = JSON.parse(raw); } catch (e) { return settings; }   // corrupt
    if (!s || typeof s !== "object" || s.v !== SETTINGS_VERSION) return settings;

    // Merge section by section so a missing key never leaves a hole.
    ["filters", "display", "forces"].forEach(function (k) {
      if (s[k] && typeof s[k] === "object") settings[k] = Object.assign({}, settings[k], s[k]);
    });
    // Families are REPLACED, not merged: a visible family is an ABSENT key, so merging
    // over the default would resurrect the hidden demonstrates family every reload.
    if (s.families && typeof s.families === "object") settings.families = Object.assign({}, s.families);
    if (Array.isArray(s.groups)) {
      settings.groups = s.groups
        .filter(function (g) { return g && typeof g.q === "string"; })
        .map(function (g) { return { q: g.q, color: clamp(g.color | 0, 1, PALETTE_SIZE) }; });
    }
    return settings;
  }

  /* ---------------- visibility ----------------
   * Which nodes and edges the canvas shows, given the filters. Returns the per-node
   * state map the renderer turns into classes, the visible subgraph the simulation is
   * handed (hidden nodes stop repelling, hidden edges stop pulling), and a signature
   * that tells the caller whether that subgraph actually changed.
   *
   * Selection (dim/lit) is deliberately NOT part of this: it is not a filter and must
   * never perturb the layout. */
  function computeVisibility(nodes, edges, opts) {
    var filters = opts.filters;
    var famHidden = opts.famHidden || function () { return false; };
    var qTest = opts.qTest || null;

    var st = {};
    nodes.forEach(function (n) {
      var s = {};
      if (!filters.kinds[n.kind]) s.off = 1;
      if (n.band && filters.bands[n.band] === false) s.off = 1;
      if (filters.favs && !n.favourite) s.off = 1;
      if (qTest && !qTest(n)) s.off = 1;
      st[n.id] = s;
    });

    /* Orphans: a node with no visible edge — family on, other endpoint on. One pass,
     * deliberately not iterated (hiding an orphan can orphan its ex-neighbour; the
     * cascade would be unpredictable while filtering). */
    if (filters.orphans) {
      var hasEdge = {};
      edges.forEach(function (e) {
        if (famHidden(e.family)) return;
        var a = endId(e.source), b = endId(e.target);
        if (st[a].off || st[b].off) return;
        hasEdge[a] = 1;
        hasEdge[b] = 1;
      });
      nodes.forEach(function (n) { if (!st[n.id].off && !hasEdge[n.id]) st[n.id].off = 1; });
    }

    var visNodes = nodes.filter(function (n) { return !st[n.id].off; });
    var visEdges = edges.filter(function (e) {
      return !famHidden(e.family) && !st[endId(e.source)].off && !st[endId(e.target)].off;
    });
    var sig = visNodes.map(function (n) { return n.id; }).join(",") + "|" + visEdges.length;
    return { st: st, visNodes: visNodes, visEdges: visEdges, sig: sig };
  }

  root.KB_GRAPH_CORE = {
    PALETTE_SIZE: PALETTE_SIZE,
    SETTINGS_VERSION: SETTINGS_VERSION,
    clamp: clamp,
    familyOf: familyOf,
    buildGraph: buildGraph,
    endId: endId,
    compileQuery: compileQuery,
    defaultSettings: defaultSettings,
    loadSettings: loadSettings,
    computeVisibility: computeVisibility,
  };
})(typeof window !== "undefined" ? window : this);
