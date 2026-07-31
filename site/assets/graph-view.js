/* graph-view.js — the interactive graph explorer (site/map/graph.html).
 *
 * Reads window.KB_GRAPH (assets/graphdata.js — loaded as a script because fetch() is
 * blocked on file://), window.KB_CATALOG (tags/aliases for metadata queries),
 * window.KB_MATCHES (the hub's lexical scorer, from search.js) and the vendored d3.
 *
 * Obsidian-style: the force simulation stays LIVE — dragging tugs neighbours along,
 * and the Forces sliders retune the layout in real time. The settings panel filters
 * by kind/band/favourites/orphans and a small query language (tag:x kind:x band:x
 * fav:true, free text, "-" negates), colors user-defined groups (first match wins),
 * and adjusts display (arrows, label fade, node size, edge width). Settings persist
 * in localStorage; #n=<id> deep-links a node.
 *
 * Presentation discipline: this file toggles CLASSES and sets NUMERIC CSS custom
 * properties (--gv-*) on SVG elements; every color lives in graph.css keyed off theme
 * tokens, so the theme switch recolors the canvas with no JS at all.
 */
(function () {
  "use strict";
  var DATA = window.KB_GRAPH;
  if (!DATA || !window.d3 || !document.getElementById("kb-graph")) return;
  var d3 = window.d3;

  var PAGE_PREFIX = "../";        // graph.html lives in site/map/
  var ZOOM_EXTENT = [0.25, 4];
  var AMBIENT = 0.01;             // alphaTarget while idle: gentle drift, never asleep
  var PALETTE_SIZE = 8;           // grp-1..grp-8 color classes in graph.css
  var LS_KEY = "kb-graph-settings";

  /* ---------------- model prep ---------------- */
  var REL = DATA.relationTypes;
  // Same canonicalization as build-graph-page.mjs: a pair collapses onto its
  // sorted-first verb; the fam-* classes in graph.css use the same ids.
  function familyOf(type) {
    var def = REL[type];
    return def.symmetric ? type : [type, def.inverse].sort()[0];
  }
  var DEMO_FAMILY = familyOf("demonstrates");

  var nodes = DATA.nodes.map(function (n) { return Object.assign({}, n); });
  var byId = {};
  nodes.forEach(function (n) { byId[n.id] = n; });

  // Tags and aliases live in the catalog (the hub's search index, already loaded on
  // this page) — join them by id once instead of duplicating them into graphdata.
  var meta = {};
  ((window.KB_CATALOG || {}).nodes || []).forEach(function (c) {
    meta[c.id] = {
      tags: (c.tags || []).map(function (t) { return t.toLowerCase(); }),
      aliases: (c.aliases || []).map(function (a) { return a.toLowerCase(); }),
    };
  });
  function metaOf(id) { return meta[id] || { tags: [], aliases: [] }; }

  /* Directed relations dedupe to one drawable edge per (pair, family). Directional
   * families are ORIENTED along their canonical verb — "a generalizes b" always draws
   * a → b whichever page declared it — so the arrows toggle can mean something. */
  var edges = [];
  var neighbors = {};   // id -> {id: 1} across every family (ego-highlight)
  (function () {
    var seen = {};
    nodes.forEach(function (n) {
      (n.relations || []).forEach(function (r) {
        if (!byId[r.to] || !REL[r.type]) return;
        (neighbors[n.id] || (neighbors[n.id] = {}))[r.to] = 1;
        var fam = familyOf(r.type);
        var key = (n.id < r.to ? n.id + "|" + r.to : r.to + "|" + n.id) + "#" + fam;
        if (seen[key]) return;
        seen[key] = true;
        var symmetric = REL[r.type].symmetric;
        var src = n.id, tgt = r.to;
        if (!symmetric && r.type !== fam) { src = r.to; tgt = n.id; }
        edges.push({ source: src, target: tgt, family: fam, dir: symmetric ? 0 : 1 });
      });
    });
  })();

  var degree = {};
  edges.forEach(function (e) {
    degree[e.source] = (degree[e.source] || 0) + 1;
    degree[e.target] = (degree[e.target] || 0) + 1;
  });
  function radius(d) { return Math.min(15, 4 + 1.9 * Math.sqrt(degree[d.id] || 1)); }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ---------------- settings (persisted) ---------------- */
  function defaults() {
    var families = {};
    families[DEMO_FAMILY] = false;   // 323 of 638 edges — the main hairball source
    return {
      v: 1,
      filters: { kinds: { pattern: 1, hazard: 1, theme: 1, principle: 1, design: 1 }, band: "", favs: false, orphans: false },
      families: families,            // family -> false when hidden; absent means visible
      groups: [],                    // [{q, color}] — first match wins, color 1..8
      display: { arrows: false, labelZoom: 1.4, nodeScale: 1, edgeScale: 1 },
      forces: { center: 0.05, repel: 140, link: 0.5, dist: 80 },
    };
  }
  var settings = defaults();
  (function load() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { /* storage denied */ }
    if (!raw) return;
    var s = null;
    try { s = JSON.parse(raw); } catch (e) { /* corrupt — fall back to defaults */ }
    if (!s || s.v !== 1) return;
    // Merge section by section so a missing key never leaves a hole.
    ["filters", "families", "display", "forces"].forEach(function (k) {
      if (s[k] && typeof s[k] === "object") settings[k] = Object.assign({}, settings[k], s[k]);
    });
    if (Array.isArray(s.groups)) {
      settings.groups = s.groups.filter(function (g) { return g && typeof g.q === "string"; })
        .map(function (g) { return { q: g.q, color: clamp(g.color | 0, 1, PALETTE_SIZE) }; });
    }
  })();
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) { /* storage denied */ }
    }, 250);
  }
  function famHidden(fam) { return settings.families[fam] === false; }

  /* ---------------- transient state (never persisted) ---------------- */
  var q = "";               // filter search query
  var qTest = null;         // compiled predicate for q (null = match all)
  var groupTests = [];      // [{test, color}] compiled from settings.groups
  var selectedId = null;    // ego highlight + pinned tooltip + #n= deep link

  /* ---------------- query language ----------------
   * AND of space-separated terms; "-" negates a term. Operators: tag:x (substring of
   * any tag), kind:x / band:x (exact), fav:true|false. Bare words form one phrase
   * matched by substring against id/name/aliases OR by the hub scorer (KB_MATCHES) —
   * so both "circuit" and "one slow dependency blocks my threads" work. An unknown
   * op: prefix is treated as plain text. */
  function textMatch(n, s) {
    if (n.id.indexOf(s) >= 0) return true;
    if (n.name.toLowerCase().indexOf(s) >= 0) return true;
    var al = metaOf(n.id).aliases;
    for (var i = 0; i < al.length; i++) if (al[i].indexOf(s) >= 0) return true;
    return false;
  }
  function compileQuery(query) {
    var s = (query || "").trim().toLowerCase();
    if (!s) return null;   // caller decides what "no query" means
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
          var tags = metaOf(n.id).tags;
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
      var hits = window.KB_MATCHES ? (window.KB_MATCHES(phrase) || {}) : {};
      preds.push(function (n) { return !!hits[n.id] || textMatch(n, phrase); });
    }
    if (!preds.length) return null;
    return function (n) {
      for (var i = 0; i < preds.length; i++) if (!preds[i](n)) return false;
      return true;
    };
  }
  function recompileGroups() {
    groupTests = settings.groups.map(function (g) {
      return { test: compileQuery(g.q), color: g.color };   // empty query -> null -> matches nothing
    });
  }

  /* ---------------- canvas ---------------- */
  var svgEl = document.getElementById("kb-graph");
  var stage = svgEl.closest(".graph-stage");
  var svg = d3.select(svgEl);
  // A hidden or prerendered page measures 0×0 — fall back, remember it, and re-measure
  // on resize (the first real measurement re-fits the view).
  var measured = svgEl.clientWidth > 0;
  var W = svgEl.clientWidth || 960;
  var H = svgEl.clientHeight || 640;

  // One arrowhead marker per directional family: the marker's own path carries the
  // fam-* class, so graph.css colors it through --fam-color like any edge.
  var defs = svg.append("defs");
  (function () {
    var made = {};
    edges.forEach(function (e) {
      if (!e.dir || made[e.family]) return;
      made[e.family] = true;
      defs.append("marker")
        .attr("id", "gv-arrow-" + e.family)
        .attr("viewBox", "-6 -6 12 12")
        .attr("markerWidth", 12).attr("markerHeight", 12)
        .attr("markerUnits", "userSpaceOnUse")
        .attr("orient", "auto")
        .append("path")
        .attr("class", "fam-" + e.family + " arrowhead")
        .attr("d", "M-4,-3 L4,0 L-4,3 Z");
    });
  })();

  var viewport = svg.append("g").attr("class", "viewport");
  var edgeLayer = viewport.append("g").attr("class", "edges").attr("aria-hidden", "true");
  var nodeLayer = viewport.append("g").attr("class", "nodes");

  var LINK_DIST = {};
  LINK_DIST[DEMO_FAMILY] = 55;
  LINK_DIST["combines-with"] = 70;
  LINK_DIST["alternative-to"] = 100;
  LINK_DIST["often-confused-with"] = 90;

  /* ---------------- live simulation ---------------- */
  var sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(edges).id(function (d) { return d.id; }))
    .force("charge", d3.forceManyBody())
    .force("collide", d3.forceCollide())
    .force("center", d3.forceCenter(W / 2, H / 2))
    .force("x", d3.forceX(W / 2))
    .force("y", d3.forceY(H / 2))
    .velocityDecay(0.6)
    .stop();

  function applyForces() {
    var f = settings.forces;
    var distScale = f.dist / 80;
    sim.force("link")
      .distance(function (e) { return (LINK_DIST[e.family] || 80) * distScale; })
      .strength(function (e) { return e.family === DEMO_FAMILY ? 0.3 * f.link : f.link; });
    sim.force("charge").strength(-f.repel);
    sim.force("x").strength(f.center);
    sim.force("y").strength(f.center);
    applyCollide();
  }
  function applyCollide() {
    var s = settings.display.nodeScale;
    sim.force("collide").radius(function (d) { return radius(d) * s + 6; });
  }
  applyForces();

  // Settle synchronously before first paint — the visitor never sees the initial
  // explosion — then hand over to the live tick loop.
  sim.alpha(1).alphaDecay(0.03);
  for (var settle = 0; settle < 300 && sim.alpha() > 0.01; settle++) sim.tick();
  sim.alphaDecay(0.0228);   // d3 default from here on

  function edgePath(e) {
    var mx = (e.source.x + e.target.x) / 2, my = (e.source.y + e.target.y) / 2;
    return "M" + e.source.x + "," + e.source.y + "L" + mx + "," + my + "L" + e.target.x + "," + e.target.y;
  }

  var edgeSel = edgeLayer.selectAll("path").data(edges).enter().append("path")
    .attr("d", edgePath)
    .attr("marker-mid", function (e) { return e.dir ? "url(#gv-arrow-" + e.family + ")" : null; });

  var SYMBOLS = {
    pattern: d3.symbolCircle, hazard: d3.symbolTriangle, theme: d3.symbolSquare,
    principle: d3.symbolCircle, design: d3.symbolDiamond,
  };
  var nodeSel = nodeLayer.selectAll("g").data(nodes).enter().append("g")
    .attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ")"; })
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", function (d) { return d.name + " — " + d.kind; });
  nodeSel.append("path").attr("class", "shape");
  // A principle is a double-stroked circle — the inner ring is the second stroke.
  nodeSel.filter(function (d) { return d.kind === "principle"; })
    .append("circle").attr("class", "ring");
  nodeSel.append("text").attr("class", "label")
    .text(function (d) { return d.name; });

  function applyNodeSize() {
    var s = settings.display.nodeScale;
    svgEl.style.setProperty("--gv-node-scale", s);
    nodeSel.select(".shape").attr("d", function (d) {
      var r = radius(d) * s;
      return d3.symbol().type(SYMBOLS[d.kind] || d3.symbolCircle).size(r * r * Math.PI)();
    });
    nodeSel.select(".ring").attr("r", function (d) { return radius(d) * s * 0.55; });
    nodeSel.select(".label").attr("y", function (d) { return -radius(d) * s - 5; });
    applyCollide();
  }
  applyNodeSize();

  sim.on("tick", function () {
    nodeSel.attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ")"; });
    edgeSel.attr("d", edgePath);
    if (selectedId || tipNode) placeTip(byId[tipNode || selectedId]);
  });

  function reheat(a) {
    sim.alphaTarget(AMBIENT);
    if (sim.alpha() < (a || 0.3)) sim.alpha(a || 0.3);
    if (!paused) sim.restart();
  }

  function measure() {
    var w = svgEl.clientWidth, h = svgEl.clientHeight;
    if (!w || !h) return false;
    if (w !== W || h !== H) {
      W = w; H = h;
      sim.force("center", d3.forceCenter(W / 2, H / 2));
      sim.force("x", d3.forceX(W / 2).strength(settings.forces.center));
      sim.force("y", d3.forceY(H / 2).strength(settings.forces.center));
    }
    return true;
  }
  window.addEventListener("resize", debounce(function () {
    var oldW = W, oldH = H;
    var was = measured;
    if (!measure()) return;
    measured = true;
    // Refit whenever the canvas really changed size (or on the first real measurement
    // after a hidden load) — a stale transform leaves the graph out of view.
    if (!was || W !== oldW || H !== oldH) { fit(); reheat(0.15); }
  }, 150));

  // The ambient target keeps the sim ticking forever — stop it when nobody is looking.
  var paused = false, hiddenTab = false, offscreen = false;
  function syncPaused() {
    var p = hiddenTab || offscreen;
    if (p === paused) return;
    paused = p;
    if (p) sim.stop(); else sim.restart();
  }
  document.addEventListener("visibilitychange", function () {
    hiddenTab = document.hidden;
    syncPaused();
  });
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      offscreen = !entries[0].isIntersecting;
      syncPaused();
    }).observe(svgEl);
  }

  /* ---------------- zoom + labels + drag ---------------- */
  var zoomK = 1;
  function applyLabelAlpha() {
    var t = settings.display.labelZoom;
    svgEl.style.setProperty("--gv-label-alpha", clamp((zoomK - t) / 0.35 + 1, 0, 1));
  }
  var zoom = d3.zoom().scaleExtent(ZOOM_EXTENT).on("zoom", function (ev) {
    viewport.attr("transform", ev.transform);
    zoomK = ev.transform.k;
    applyLabelAlpha();
    if (selectedId || tipNode) placeTip(byId[tipNode || selectedId]);
  });
  svg.call(zoom).on("dblclick.zoom", null);   // double-click is "open page"

  // `immediate` skips the transition — rAF-driven transitions never run in a hidden
  // page, which would leave the initial view stuck at identity.
  function fit(immediate) {
    var vis = nodes.filter(function (n) { return !(st[n.id] || {}).off; });
    if (!vis.length) vis = nodes;
    var xs = vis.map(function (n) { return n.x; });
    var ys = vis.map(function (n) { return n.y; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var k = Math.max(ZOOM_EXTENT[0], Math.min(1,
      0.92 * Math.min(W / (maxX - minX + 60), H / (maxY - minY + 60))));
    var t = d3.zoomIdentity
      .translate(W / 2 - k * (minX + maxX) / 2, H / 2 - k * (minY + maxY) / 2).scale(k);
    if (immediate === true) svg.call(zoom.transform, t);
    else svg.transition().duration(300).call(zoom.transform, t);
  }

  function centerOn(d, k, immediate) {
    var t = d3.zoomIdentity.translate(W / 2 - k * d.x, H / 2 - k * d.y).scale(k);
    if (immediate) svg.call(zoom.transform, t);
    else svg.transition().duration(300).call(zoom.transform, t);
  }

  // Obsidian-style drag: the node is pinned to the pointer while the warm simulation
  // pulls its neighbourhood along; on release it floats free again.
  nodeSel.call(d3.drag()
    .on("start", function (ev, d) {
      if (!ev.active) { sim.alphaTarget(0.3); if (!paused) sim.restart(); }
      d.fx = d.x; d.fy = d.y;
    })
    .on("drag", function (ev, d) { d.fx = ev.x; d.fy = ev.y; })
    .on("end", function (ev, d) {
      if (!ev.active) sim.alphaTarget(AMBIENT);
      d.fx = null; d.fy = null;
    }));

  /* ---------------- render: recompute every class from state ---------------- */
  var st = {};   // id -> {off, dim, lit, selected}
  function render() {
    st = {};
    nodes.forEach(function (n) {
      var s = {};
      if (!settings.filters.kinds[n.kind]) s.off = 1;
      if (settings.filters.band && n.band !== settings.filters.band) s.off = 1;
      if (settings.filters.favs && !n.favourite) s.off = 1;
      if (qTest && !qTest(n)) s.off = 1;
      st[n.id] = s;
    });

    /* Orphans: a node with no visible edge — family on, other endpoint on. One pass,
     * deliberately not iterated (hiding an orphan can orphan its ex-neighbour; the
     * cascade would be unpredictable while filtering). */
    if (settings.filters.orphans) {
      var hasEdge = {};
      edges.forEach(function (e) {
        if (famHidden(e.family)) return;
        if (st[e.source.id].off || st[e.target.id].off) return;
        hasEdge[e.source.id] = 1;
        hasEdge[e.target.id] = 1;
      });
      nodes.forEach(function (n) { if (!st[n.id].off && !hasEdge[n.id]) st[n.id].off = 1; });
    }

    if (selectedId && byId[selectedId]) {
      nodes.forEach(function (n) {
        var s = st[n.id];
        if (s.off) return;
        if (n.id === selectedId) s.selected = 1;
        else if ((neighbors[selectedId] || {})[n.id]) s.lit = 1;
        else s.dim = 1;
      });
    }

    nodeSel.attr("class", function (d) {
      var s = st[d.id];
      var c = "node kind-" + d.kind + (d.band ? " band-" + d.band : "");
      if (d.favourite) c += " fav";
      for (var i = 0; i < groupTests.length; i++) {
        var g = groupTests[i];
        if (g.test && g.test(d)) { c += " grp-" + g.color; break; }
      }
      if (s.off) c += " off";
      if (s.dim) c += " dim";
      if (s.lit) c += " lit";
      if (s.selected) c += " selected";
      return c;
    });

    edgeSel.attr("class", function (e) {
      var c = "edge fam-" + e.family;
      if (st[e.source.id].off || st[e.target.id].off) return c + " off";
      if (famHidden(e.family)) return c + " off";
      if (selectedId) {
        return c + (e.source.id === selectedId || e.target.id === selectedId ? " lit" : " dim");
      }
      return c;
    });

    updateHash();
  }

  /* ---------------- tooltip ---------------- */
  var tip = document.createElement("div");
  tip.className = "graph-tip";
  tip.hidden = true;
  stage.appendChild(tip);
  var tipNode = null, tipTimer = null;
  tip.addEventListener("mouseenter", function () { clearTimeout(tipTimer); });
  tip.addEventListener("mouseleave", function () { hideTipSoon(); });

  function showTip(d) {
    clearTimeout(tipTimer);
    tipNode = d.id;
    var m = metaOf(d.id);
    tip.innerHTML =
      '<span class="tip-name">' + esc(d.name) + "</span>" +
      '<span class="tip-kind">' + esc(d.kind + (d.band ? " · " + d.band : "")) + "</span>" +
      '<span class="tip-essence">' + esc(d.essence || "") + "</span>" +
      (m.tags.length ? '<span class="tip-tags">' + m.tags.map(function (t) { return "#" + esc(t); }).join(" ") + "</span>" : "") +
      '<a href="' + esc(PAGE_PREFIX + d.path) + '">Open page →</a>';
    tip.hidden = false;
    placeTip(d);
  }
  function placeTip(d) {
    if (!d) return;
    var t = d3.zoomTransform(svgEl);
    var p = t.apply([d.x, d.y]);
    var sb = stage.getBoundingClientRect(), vb = svgEl.getBoundingClientRect();
    var x = p[0] + (vb.left - sb.left), y = p[1] + (vb.top - sb.top);
    tip.style.left = Math.max(8, Math.min(x + 14, sb.width - 275)) + "px";
    tip.style.top = Math.max(8, Math.min(y + 14, sb.height - 40)) + "px";
  }
  function hideTipSoon() {
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () {
      if (tipNode !== selectedId) { tip.hidden = true; tipNode = null; }
    }, 180);
  }
  function clearTip() { tip.hidden = true; tipNode = null; }

  /* ---------------- selection + deep link ---------------- */
  function updateHash() {
    try {
      if (selectedId) history.replaceState(null, "", "#n=" + encodeURIComponent(selectedId));
      else if (window.location.hash) history.replaceState(null, "", window.location.href.split("#")[0]);
    } catch (e) { /* file:// edge cases — the page works without the deep link */ }
  }
  function parseHash() {
    var m = window.location.hash.match(/^#n=([^&]+)/);
    if (!m) return null;
    var id = null;
    try { id = decodeURIComponent(m[1]); } catch (e) { /* malformed — ignore */ }
    return id && byId[id] ? id : null;
  }

  function activate(d) {
    selectedId = selectedId === d.id ? null : d.id;
    render();
    if (selectedId) showTip(d); else clearTip();
  }

  nodeSel
    .on("click", function (ev, d) { if (!ev.defaultPrevented) activate(d); })
    .on("dblclick", function (ev, d) { window.location.href = PAGE_PREFIX + d.path; })
    .on("mouseenter", function (ev, d) { showTip(d); })
    .on("mouseleave", hideTipSoon)
    .on("focus", function (ev, d) { showTip(d); })
    .on("blur", hideTipSoon)
    .on("keydown", function (ev, d) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); activate(d); }
      if (ev.key === "o") window.location.href = PAGE_PREFIX + d.path;
    });

  svg.on("click", function (ev) {
    if (ev.target === svgEl && selectedId) { selectedId = null; clearTip(); render(); }
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && selectedId) { selectedId = null; clearTip(); render(); }
  });

  /* ---------------- controls ---------------- */
  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms || 120); };
  }
  function on(id, event, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
    return el;
  }

  // Filters
  var searchInput = document.getElementById("graph-search");
  if (searchInput) {
    searchInput.addEventListener("input", debounce(function () {
      q = searchInput.value;
      qTest = compileQuery(q);
      selectedId = null;
      clearTip();
      render();
    }));
    searchInput.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { searchInput.value = ""; q = ""; qTest = null; render(); searchInput.blur(); }
    });
  }
  document.querySelectorAll(".kind-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      settings.filters.kinds[b.dataset.kind] = settings.filters.kinds[b.dataset.kind] ? 0 : 1;
      b.setAttribute("aria-pressed", settings.filters.kinds[b.dataset.kind] ? "true" : "false");
      render(); save();
    });
  });
  var bandSelect = on("band-select", "change", function () {
    settings.filters.band = bandSelect.value;
    render(); save();
  });
  var favToggle = on("fav-toggle", "change", function () {
    settings.filters.favs = favToggle.checked;
    render(); save();
  });
  var orphanToggle = on("orphans-toggle", "change", function () {
    settings.filters.orphans = orphanToggle.checked;
    render(); save();
  });

  // Links: the verb legend doubles as the edge filter.
  document.querySelectorAll(".legend-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      var fam = b.dataset.family;
      if (famHidden(fam)) delete settings.families[fam];
      else settings.families[fam] = false;
      b.setAttribute("aria-pressed", famHidden(fam) ? "false" : "true");
      render(); save();
    });
  });

  // Groups
  var groupList = document.getElementById("group-list");
  function renderGroups() {
    if (!groupList) return;
    groupList.innerHTML = settings.groups.map(function (g, i) {
      return '<div class="group-row">' +
        '<button type="button" class="grp-swatch grp-' + g.color + '" data-i="' + i + '" title="Next color" aria-label="Group ' + (i + 1) + ' color"></button>' +
        '<input class="group-q" data-i="' + i + '" value="' + esc(g.q) + '" placeholder="tag:caching · band:gof · text" aria-label="Group ' + (i + 1) + ' query" autocomplete="off" spellcheck="false">' +
        '<button type="button" class="group-up" data-i="' + i + '" aria-label="Move group up"' + (i === 0 ? " disabled" : "") + ">↑</button>" +
        '<button type="button" class="group-x" data-i="' + i + '" aria-label="Remove group">✕</button>' +
        "</div>";
    }).join("");
    groupList.querySelectorAll(".grp-swatch").forEach(function (b) {
      b.addEventListener("click", function () {
        var g = settings.groups[b.dataset.i | 0];
        g.color = g.color % PALETTE_SIZE + 1;
        renderGroups(); recompileGroups(); render(); save();
      });
    });
    groupList.querySelectorAll(".group-q").forEach(function (inp) {
      inp.addEventListener("input", debounce(function () {
        settings.groups[inp.dataset.i | 0].q = inp.value;
        recompileGroups(); render(); save();
      }, 200));
    });
    groupList.querySelectorAll(".group-up").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = b.dataset.i | 0;
        if (!i) return;
        var g = settings.groups.splice(i, 1)[0];
        settings.groups.splice(i - 1, 0, g);
        renderGroups(); recompileGroups(); render(); save();
      });
    });
    groupList.querySelectorAll(".group-x").forEach(function (b) {
      b.addEventListener("click", function () {
        settings.groups.splice(b.dataset.i | 0, 1);
        renderGroups(); recompileGroups(); render(); save();
      });
    });
  }
  on("group-add", "click", function () {
    var used = settings.groups.map(function (g) { return g.color; });
    var color = 1;
    for (var c = 1; c <= PALETTE_SIZE; c++) if (used.indexOf(c) < 0) { color = c; break; }
    settings.groups.push({ q: "", color: color });
    renderGroups(); recompileGroups(); save();
    var last = groupList.querySelector(".group-row:last-child .group-q");
    if (last) last.focus();
  });

  // Display
  var arrowsToggle = on("arrows-toggle", "change", function () {
    settings.display.arrows = arrowsToggle.checked;
    svgEl.classList.toggle("arrows-on", settings.display.arrows);
    save();
  });
  function slider(id, set) {
    var el = document.getElementById(id);
    if (!el) return null;
    el.addEventListener("input", function () { set(parseFloat(el.value)); save(); });
    return el;
  }
  var slLabel = slider("sl-label", function (v) { settings.display.labelZoom = v; applyLabelAlpha(); });
  var nodeSizeApply = debounce(function () { applyNodeSize(); reheat(0.2); }, 80);
  var slNode = slider("sl-node", function (v) {
    settings.display.nodeScale = v;
    svgEl.style.setProperty("--gv-node-scale", v);
    nodeSizeApply();
  });
  var slEdge = slider("sl-edge", function (v) {
    settings.display.edgeScale = v;
    svgEl.style.setProperty("--gv-edge-w", v);
  });

  // Forces
  var slCenter = slider("sl-center", function (v) { settings.forces.center = v; applyForces(); reheat(0.3); });
  var slRepel = slider("sl-repel", function (v) { settings.forces.repel = v; applyForces(); reheat(0.3); });
  var slLink = slider("sl-link", function (v) { settings.forces.link = v; applyForces(); reheat(0.3); });
  var slDist = slider("sl-dist", function (v) { settings.forces.dist = v; applyForces(); reheat(0.3); });

  on("fit-btn", "click", fit);
  on("reset-btn", "click", function () {
    try { localStorage.removeItem(LS_KEY); } catch (e) { /* storage denied */ }
    settings = defaults();
    syncControls();
    recompileGroups();
    applyForces();
    applyNodeSize();
    applyDisplayVars();
    render();
    reheat(0.3);
  });

  function applyDisplayVars() {
    svgEl.classList.toggle("arrows-on", settings.display.arrows);
    svgEl.style.setProperty("--gv-edge-w", settings.display.edgeScale);
    svgEl.style.setProperty("--gv-node-scale", settings.display.nodeScale);
    applyLabelAlpha();
  }

  // Push the (loaded or default) settings into every control.
  function syncControls() {
    document.querySelectorAll(".kind-btn").forEach(function (b) {
      b.setAttribute("aria-pressed", settings.filters.kinds[b.dataset.kind] ? "true" : "false");
    });
    if (bandSelect) bandSelect.value = settings.filters.band;
    if (favToggle) favToggle.checked = settings.filters.favs;
    if (orphanToggle) orphanToggle.checked = settings.filters.orphans;
    document.querySelectorAll(".legend-btn").forEach(function (b) {
      b.setAttribute("aria-pressed", famHidden(b.dataset.family) ? "false" : "true");
    });
    if (arrowsToggle) arrowsToggle.checked = settings.display.arrows;
    if (slLabel) slLabel.value = settings.display.labelZoom;
    if (slNode) slNode.value = settings.display.nodeScale;
    if (slEdge) slEdge.value = settings.display.edgeScale;
    if (slCenter) slCenter.value = settings.forces.center;
    if (slRepel) slRepel.value = settings.forces.repel;
    if (slLink) slLink.value = settings.forces.link;
    if (slDist) slDist.value = settings.forces.dist;
    renderGroups();
  }

  // On narrow screens the panel stacks under the canvas — start with every section
  // closed so the graph is not pushed off-screen. A 0-width (hidden) viewport is not
  // a narrow screen — leave the authored open state alone there.
  if (window.innerWidth > 0 && window.matchMedia && window.matchMedia("(max-width: 900px)").matches) {
    document.querySelectorAll("#graph-panel details[open]").forEach(function (d) {
      d.removeAttribute("open");
    });
  }

  /* ---------------- init ---------------- */
  syncControls();
  recompileGroups();
  applyDisplayVars();
  selectedId = parseHash();
  render();
  if (selectedId && byId[selectedId]) {
    centerOn(byId[selectedId], 1.6, true);
    showTip(byId[selectedId]);
  } else {
    fit(true);
  }
  sim.alphaTarget(AMBIENT).restart();
})();
