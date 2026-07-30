/* graph-view.js — the interactive relationship graph + architecture builder
 * (site/map/graph.html).
 *
 * Reads window.KB_GRAPH (assets/graphdata.js — loaded as a script because fetch() is
 * blocked on file://) and the vendored d3. Two modes over one canvas:
 *
 *   Explore — the full typed graph: pan/zoom, kind/band/favourite filters, the verb
 *   legend as an edge filter, and symptom search via the hub scorer (window.KB_MATCHES).
 *
 *   Build — pick a seed (preset / design / symptom / any node), then apply patterns.
 *   Everything is DERIVED WHOLESALE from {seed, applied} on every change — never
 *   incrementally — so un-applying is trivially correct: combines-with neighbours become
 *   suggestions, alternative-to neighbours render visibly excluded (dimmed + dashed,
 *   never hidden), prevents-hazard edges mark hazards covered, unmet prerequisites warn.
 *
 * Presentation discipline: this file only toggles CLASSES on SVG elements; every color
 * lives in graph.css keyed off theme tokens, so the theme switch recolors the canvas
 * with no JS at all. The layout is force-settled once and FROZEN — no jitter; dragging
 * repositions a node without reheating the simulation.
 */
(function () {
  "use strict";
  var DATA = window.KB_GRAPH;
  if (!DATA || !window.d3 || !document.getElementById("kb-graph")) return;
  var d3 = window.d3;

  var PAGE_PREFIX = "../";        // graph.html lives in site/map/
  var LABEL_ZOOM = 1.4;           // zoom factor at which all labels become legible
  var ZOOM_EXTENT = [0.25, 4];
  var SETTLE_ALPHA = 0.01;
  var SYMPTOM_SEEDS = 12;         // top pattern hits a symptom seed suggests

  /* ---------------- model prep ---------------- */
  var REL = DATA.relationTypes;
  // Same canonicalization as build.mjs: a pair collapses onto its sorted-first verb.
  function familyOf(type) {
    var def = REL[type];
    return def.symmetric ? type : [type, def.inverse].sort()[0];
  }
  var DEMO_FAMILY = familyOf("demonstrates");

  var nodes = DATA.nodes.map(function (n) { return Object.assign({}, n); });
  var byId = {};
  nodes.forEach(function (n) { byId[n.id] = n; });

  // 1276 directed relations -> ~638 drawable undirected edges, one per (pair, family).
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
        edges.push({ source: n.id, target: r.to, family: fam });
      });
    });
  })();

  /* Directed adjacency for the builder. Relations are declared on both pages, so
   * reading each direction of a pair fills the same map twice — the object-as-set
   * dedupes. "a requires b": a -prerequisite-> b, or equivalently b -enables-> a. */
  var adj = { combines: {}, alternative: {}, prevents: {}, requires: {}, demonstrates: {} };
  function mark(map, a, b) { (map[a] || (map[a] = {}))[b] = 1; }
  nodes.forEach(function (n) {
    (n.relations || []).forEach(function (r) {
      if (!byId[r.to]) return;
      if (r.type === "combines-with") mark(adj.combines, n.id, r.to);
      else if (r.type === "alternative-to") mark(adj.alternative, n.id, r.to);
      else if (r.type === "prevents-hazard") mark(adj.prevents, n.id, r.to);
      else if (r.type === "mitigated-by") mark(adj.prevents, r.to, n.id);
      else if (r.type === "prerequisite") mark(adj.requires, n.id, r.to);
      else if (r.type === "enables") mark(adj.requires, r.to, n.id);
      else if (r.type === "demonstrates") mark(adj.demonstrates, n.id, r.to);
      else if (r.type === "demonstrated-by") mark(adj.demonstrates, r.to, n.id);
    });
  });

  var degree = {};
  edges.forEach(function (e) {
    degree[e.source] = (degree[e.source] || 0) + 1;
    degree[e.target] = (degree[e.target] || 0) + 1;
  });
  function radius(d) { return Math.min(15, 4 + 1.9 * Math.sqrt(degree[d.id] || 1)); }

  var presetById = {};
  (DATA.presets || []).forEach(function (p) { presetById[p.id] = p; });

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------------- state ---------------- */
  var mode = "explore";
  var famOff = {};                       // family -> true when its edges are hidden
  famOff[DEMO_FAMILY] = true;            // 323 of 638 edges — the main hairball source
  var explore = { kinds: { pattern: 1, hazard: 1, theme: 1, principle: 1, design: 1 }, band: "", favs: false, q: "" };
  var build = { seed: null, applied: [] };
  var selectedId = null;                 // explore-mode ego highlight + pinned tooltip
  var st = {};                           // id -> state flags, rebuilt by render()
  var lastDerived = null;

  /* ---------------- canvas ---------------- */
  var svgEl = document.getElementById("kb-graph");
  var stage = svgEl.closest(".graph-stage");
  var svg = d3.select(svgEl);
  var W = svgEl.clientWidth || 960;
  var H = svgEl.clientHeight || 640;
  var viewport = svg.append("g").attr("class", "viewport");
  var edgeLayer = viewport.append("g").attr("class", "edges").attr("aria-hidden", "true");
  var nodeLayer = viewport.append("g").attr("class", "nodes");

  var LINK_DIST = {};
  LINK_DIST[DEMO_FAMILY] = 55;
  LINK_DIST["combines-with"] = 70;
  LINK_DIST["alternative-to"] = 100;
  LINK_DIST["often-confused-with"] = 90;

  var sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(edges).id(function (d) { return d.id; })
      .distance(function (e) { return LINK_DIST[e.family] || 80; })
      .strength(function (e) { return e.family === DEMO_FAMILY ? 0.15 : 0.5; }))
    .force("charge", d3.forceManyBody().strength(-140))
    .force("collide", d3.forceCollide().radius(function (d) { return radius(d) + 6; }))
    .force("center", d3.forceCenter(W / 2, H / 2))
    .force("x", d3.forceX(W / 2).strength(0.05))
    .force("y", d3.forceY(H / 2).strength(0.05))
    .alphaDecay(0.03)
    .stop();
  // Settle synchronously, then freeze: one stable layout, no animation, no jitter.
  while (sim.alpha() > SETTLE_ALPHA) sim.tick();
  sim.stop();

  var edgeSel = edgeLayer.selectAll("line").data(edges).enter().append("line")
    .attr("x1", function (e) { return e.source.x; })
    .attr("y1", function (e) { return e.source.y; })
    .attr("x2", function (e) { return e.target.x; })
    .attr("y2", function (e) { return e.target.y; });

  var SYMBOLS = {
    pattern: d3.symbolCircle, hazard: d3.symbolTriangle, theme: d3.symbolSquare,
    principle: d3.symbolCircle, design: d3.symbolDiamond,
  };
  var nodeSel = nodeLayer.selectAll("g").data(nodes).enter().append("g")
    .attr("transform", function (d) { return "translate(" + d.x + "," + d.y + ")"; })
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", function (d) { return d.name + " — " + d.kind; });
  nodeSel.append("path").attr("class", "shape")
    .attr("d", function (d) {
      var r = radius(d);
      return d3.symbol().type(SYMBOLS[d.kind] || d3.symbolCircle).size(r * r * Math.PI)();
    });
  // A principle is a double-stroked circle — the inner ring is the second stroke.
  nodeSel.filter(function (d) { return d.kind === "principle"; })
    .append("circle").attr("class", "ring").attr("r", function (d) { return radius(d) * 0.55; });
  nodeSel.append("text").attr("class", "label")
    .attr("y", function (d) { return -radius(d) - 5; })
    .text(function (d) { return d.name; });

  /* ---------------- zoom + drag ---------------- */
  var zoom = d3.zoom().scaleExtent(ZOOM_EXTENT).on("zoom", function (ev) {
    viewport.attr("transform", ev.transform);
    svg.classed("labels-on", ev.transform.k >= LABEL_ZOOM);
    if (selectedId || tipNode) placeTip(byId[tipNode || selectedId]);
  });
  svg.call(zoom).on("dblclick.zoom", null);   // double-click is "open page"

  (function fit() {
    var xs = nodes.map(function (n) { return n.x; });
    var ys = nodes.map(function (n) { return n.y; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var k = Math.max(ZOOM_EXTENT[0], Math.min(1,
      0.92 * Math.min(W / (maxX - minX + 60), H / (maxY - minY + 60))));
    svg.call(zoom.transform, d3.zoomIdentity
      .translate(W / 2 - k * (minX + maxX) / 2, H / 2 - k * (minY + maxY) / 2).scale(k));
  })();

  // Drag repositions without reheating: the node and its edges follow the pointer,
  // everything else stays put. The click that follows a real drag is suppressed by d3.
  nodeSel.call(d3.drag().on("drag", function (ev, d) {
    d.x = ev.x; d.y = ev.y;
    d3.select(this).attr("transform", "translate(" + d.x + "," + d.y + ")");
    edgeSel.filter(function (e) { return e.source === d || e.target === d; })
      .attr("x1", function (e) { return e.source.x; })
      .attr("y1", function (e) { return e.source.y; })
      .attr("x2", function (e) { return e.target.x; })
      .attr("y2", function (e) { return e.target.y; });
  }));

  /* ---------------- builder derivation ---------------- */
  function seedCandidates() {
    var s = build.seed;
    if (!s) return [];
    if (s.type === "preset") return (presetById[s.id] || { candidates: [] }).candidates;
    if (s.type === "design") return Object.keys(adj.demonstrates[s.id] || {});
    if (s.type === "pick") return byId[s.id] ? [s.id] : [];
    if (s.type === "symptom" && s.q && window.KB_MATCHES) {
      var hits = window.KB_MATCHES(s.q) || {};
      return Object.keys(hits)
        .filter(function (id) { return byId[id] && byId[id].kind === "pattern"; })
        .sort(function (a, b) { return hits[b] - hits[a]; })
        .slice(0, SYMPTOM_SEEDS);
    }
    return [];
  }

  function derive() {
    var applied = {};
    build.applied.forEach(function (id) { applied[id] = 1; });
    var excluded = {};   // id -> [applied ids that exclude it]
    build.applied.forEach(function (a) {
      Object.keys(adj.alternative[a] || {}).forEach(function (x) {
        if (!applied[x]) (excluded[x] || (excluded[x] = [])).push(a);
      });
    });
    var suggested = {};
    seedCandidates().forEach(function (id) { if (byId[id]) suggested[id] = 1; });
    build.applied.forEach(function (a) {
      Object.keys(adj.combines[a] || {}).forEach(function (c) { suggested[c] = 1; });
    });
    Object.keys(applied).forEach(function (id) { delete suggested[id]; });
    Object.keys(excluded).forEach(function (id) { delete suggested[id]; });
    var covered = {};    // hazard id -> [applied ids that prevent it]
    build.applied.forEach(function (a) {
      Object.keys(adj.prevents[a] || {}).forEach(function (h) {
        (covered[h] || (covered[h] = [])).push(a);
      });
    });
    var warnings = [];
    build.applied.forEach(function (a) {
      Object.keys(adj.requires[a] || {}).forEach(function (p) {
        if (!applied[p]) warnings.push({ kind: "prereq", of: a, needs: p });
      });
    });
    for (var i = 0; i < build.applied.length; i++) {
      for (var j = i + 1; j < build.applied.length; j++) {
        if ((adj.alternative[build.applied[i]] || {})[build.applied[j]]) {
          warnings.push({ kind: "conflict", a: build.applied[i], b: build.applied[j] });
        }
      }
    }
    return { applied: applied, excluded: excluded, suggested: suggested, covered: covered, warnings: warnings };
  }

  /* ---------------- render: recompute every class from state ---------------- */
  function render() {
    st = {};
    lastDerived = null;
    if (mode === "explore") {
      var hits = explore.q && window.KB_MATCHES ? window.KB_MATCHES(explore.q) : null;
      nodes.forEach(function (n) {
        var s = {};
        if (!explore.kinds[n.kind]) s.off = 1;
        if (explore.band && n.band !== explore.band) s.off = 1;
        if (explore.favs && !n.favourite) s.off = 1;
        if (selectedId) {
          if (n.id === selectedId) s.selected = 1;
          else if ((neighbors[selectedId] || {})[n.id]) s.lit = 1;
          else s.dim = 1;
        } else if (hits) {
          if (hits[n.id]) s.hit = 1; else s.dim = 1;
        }
        st[n.id] = s;
      });
    } else if (build.seed || build.applied.length) {
      var dv = lastDerived = derive();
      nodes.forEach(function (n) {
        var s = {};
        if (dv.applied[n.id]) s.applied = 1;
        else if (dv.excluded[n.id]) s.excluded = 1;
        else if (dv.suggested[n.id]) s.suggested = 1;
        else if (dv.covered[n.id]) s.covered = 1;
        else s.dim = 1;
        if (build.seed && build.seed.id === n.id) { s.seed = 1; delete s.dim; }
        st[n.id] = s;
      });
    } else {
      nodes.forEach(function (n) { st[n.id] = {}; });   // build mode, nothing seeded yet
    }

    var FLAGS = ["off", "dim", "hit", "lit", "selected", "applied", "suggested", "excluded", "covered", "seed"];
    nodeSel.attr("class", function (d) {
      var s = st[d.id], c = "node kind-" + d.kind + (d.band ? " band-" + d.band : "");
      if (d.favourite) c += " fav";
      FLAGS.forEach(function (f) { if (s[f]) c += " " + f; });
      return c;
    });

    edgeSel.attr("class", function (e) {
      var a = st[e.source.id] || {}, b = st[e.target.id] || {};
      var c = "edge fam-" + e.family;
      if (a.off || b.off) return c + " off";
      if (mode === "build" && lastDerived) {
        var actA = a.applied || a.seed, actB = b.applied || b.seed;
        var invA = actA || a.suggested || a.excluded || a.covered;
        var invB = actB || b.suggested || b.excluded || b.covered;
        // An involved edge is the explanation (why suggested / why excluded / what is
        // covered) — it stays visible even when its family is toggled off in the legend.
        if ((actA && invB) || (actB && invA)) return c + " lit";
        return c + (famOff[e.family] ? " off" : " dim");
      }
      if (famOff[e.family]) return c + " off";
      if (selectedId) {
        return c + (e.source.id === selectedId || e.target.id === selectedId ? " lit" : " dim");
      }
      if (mode === "explore" && explore.q) {
        return c + ((a.hit && b.hit) ? " lit" : " dim");
      }
      return c;
    });

    renderPanel();
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

  function stateNote(d) {
    if (mode !== "build" || !lastDerived) return "";
    if (lastDerived.excluded[d.id]) {
      return "Excluded — alternative to " +
        lastDerived.excluded[d.id].map(function (id) { return byId[id].name; }).join(", ") +
        ". Applying it anyway flags a conflict.";
    }
    if (d.kind === "hazard" && lastDerived.covered[d.id]) {
      return "Covered via " +
        lastDerived.covered[d.id].map(function (id) { return byId[id].name; }).join(", ") + ".";
    }
    return "";
  }

  function showTip(d) {
    clearTimeout(tipTimer);
    tipNode = d.id;
    var note = stateNote(d);
    tip.innerHTML =
      '<span class="tip-name">' + esc(d.name) + "</span>" +
      '<span class="tip-kind">' + esc(d.kind + (d.band ? " · " + d.band : "")) + "</span>" +
      '<span class="tip-essence">' + esc(d.essence || "") + "</span>" +
      (note ? '<span class="tip-state">' + esc(note) + "</span>" : "") +
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

  /* ---------------- interactions ---------------- */
  function activate(d) {
    if (mode === "build") {
      if (!build.seed && !build.applied.length) {
        // Free pick: the first node clicked becomes the seed (and, if applicable, the
        // first applied pattern).
        build.seed = { type: "pick", id: d.id };
        if (d.kind === "pattern" || d.kind === "principle") build.applied = [d.id];
        syncSeedControls();
      } else if (d.kind === "pattern" || d.kind === "principle") {
        // Toggle. Applying an excluded node is allowed — derive() turns it into a
        // visible conflict warning instead of blocking.
        build.applied = build.applied.indexOf(d.id) >= 0
          ? build.applied.filter(function (id) { return id !== d.id; })
          : build.applied.concat([d.id]);
      } else {
        showTip(d);
        return;
      }
      render();
      showTip(d);
    } else {
      selectedId = selectedId === d.id ? null : d.id;
      render();
      if (selectedId) showTip(d); else { tip.hidden = true; tipNode = null; }
    }
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
    if (ev.target === svgEl && selectedId) { selectedId = null; tip.hidden = true; tipNode = null; render(); }
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && selectedId) { selectedId = null; tip.hidden = true; tipNode = null; render(); }
  });

  /* ---------------- build panel ---------------- */
  var panel = document.getElementById("build-panel");

  function seedLabel() {
    var s = build.seed;
    if (!s) return "No seed yet";
    if (s.type === "preset") return "Seed: " + (presetById[s.id] || { label: s.id }).label;
    if (s.type === "design") return "Seed: " + (byId[s.id] || { name: s.id }).name + " (case study)";
    if (s.type === "symptom") return "Seed: “" + s.q + "”";
    return "Seed: " + (byId[s.id] || { name: s.id }).name;
  }

  function renderPanel() {
    if (!panel || mode !== "build") return;
    var dv = lastDerived;
    var html = "<h2>Your stack</h2>" +
      '<p class="panel-seed">' + esc(seedLabel()) + "</p>";
    if (!build.applied.length) {
      html += '<p class="panel-empty">' + (build.seed
        ? "Click a suggested (highlighted) node to apply it — or any pattern."
        : "Pick a preset, a case study, or describe a symptom — or click any node to start from it.") + "</p>";
    } else {
      var covered = Object.keys(dv.covered);
      var total = (DATA.meta.counts || {}).hazard || 0;
      html += '<p class="panel-status" role="status">' + build.applied.length + " applied · " +
        covered.length + "/" + total + " hazards covered · " + dv.warnings.length +
        " warning" + (dv.warnings.length === 1 ? "" : "s") + "</p>";
      html += '<ul class="stack-list">' + build.applied.map(function (id) {
        var n = byId[id];
        return '<li class="stack-item"><a href="' + esc(PAGE_PREFIX + n.path) + '">' + esc(n.name) + "</a>" +
          '<button type="button" class="stack-x" data-id="' + esc(id) + '" aria-label="Remove ' + esc(n.name) + '">✕</button></li>';
      }).join("") + "</ul>";
      if (dv.warnings.length) {
        html += "<h3>Warnings</h3><ul class=\"warn-list\">" + dv.warnings.map(function (w) {
          return '<li class="warn-item">' + esc(w.kind === "prereq"
            ? byId[w.of].name + " requires " + byId[w.needs].name + " — not applied"
            : byId[w.a].name + " and " + byId[w.b].name + " are alternatives — applied together") + "</li>";
        }).join("") + "</ul>";
      }
      html += "<h3>Hazards covered · " + covered.length + "/" + total + "</h3>" +
        '<div class="meter-bar"><div class="meter-fill" style="width:' +
        (total ? Math.round(100 * covered.length / total) : 0) + '%"></div></div>' +
        '<div class="hz-chips">' + nodes.filter(function (n) { return n.kind === "hazard"; })
          .map(function (h) {
            var via = dv.covered[h.id];
            return '<span class="hz-chip' + (via ? " covered" : "") + '"' +
              (via ? ' title="via ' + esc(via.map(function (id) { return byId[id].name; }).join(", ")) + '"' : "") +
              ">" + esc(h.name) + "</span>";
          }).join("") + "</div>";
    }
    html += '<div class="panel-actions">' +
      '<button type="button" class="gbtn" id="copy-link">Copy link</button>' +
      '<button type="button" class="gbtn" id="copy-md">Copy as Markdown</button>' +
      '<button type="button" class="gbtn" id="build-reset">Reset</button></div>';
    panel.innerHTML = html;

    panel.querySelectorAll(".stack-x").forEach(function (btn) {
      btn.addEventListener("click", function () {
        build.applied = build.applied.filter(function (id) { return id !== btn.dataset.id; });
        render();
      });
    });
    var copyLink = panel.querySelector("#copy-link");
    if (copyLink) copyLink.addEventListener("click", function () { copyText(shareUrl(), copyLink); });
    var copyMd = panel.querySelector("#copy-md");
    if (copyMd) copyMd.addEventListener("click", function () { copyText(markdownExport(), copyMd); });
    panel.querySelector("#build-reset").addEventListener("click", function () {
      build = { seed: null, applied: [] };
      syncSeedControls();
      render();
    });
  }

  /* ---------------- hash state (shareable, file://-safe) ---------------- */
  function buildHash() {
    if (!build.seed && !build.applied.length) return "";
    var s = build.seed;
    var h = "#b=1&mode=build";
    if (s) h += "&seed=" + s.type + ":" + encodeURIComponent(s.id || s.q || "");
    if (build.applied.length) h += "&on=" + build.applied.join(",");
    return h;
  }
  function updateHash() {
    try {
      var h = mode === "build" ? buildHash() : "";
      if (h) history.replaceState(null, "", h);
      else if (window.location.hash) history.replaceState(null, "", window.location.href.split("#")[0]);
    } catch (e) { /* file:// edge cases — the page still works without a shareable hash */ }
  }
  function parseHash() {
    var raw = window.location.hash.slice(1);
    if (!raw) return;
    var params = {};
    raw.split("&").forEach(function (kv) {
      var i = kv.indexOf("=");
      if (i > 0) { try { params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* malformed — drop */ } }
    });
    if (params.b !== "1" || params.mode !== "build") return;
    var seed = null;
    if (params.seed) {
      var i = params.seed.indexOf(":");
      var t = params.seed.slice(0, i), v = params.seed.slice(i + 1);
      if (t === "preset" && presetById[v]) seed = { type: "preset", id: v };
      else if (t === "design" && byId[v] && byId[v].kind === "design") seed = { type: "design", id: v };
      else if (t === "symptom" && v) seed = { type: "symptom", q: v };
      else if (t === "pick" && byId[v]) seed = { type: "pick", id: v };
    }
    // Unknown ids are silently dropped rather than erroring the whole link.
    var on = (params.on || "").split(",").filter(function (id) {
      return byId[id] && (byId[id].kind === "pattern" || byId[id].kind === "principle");
    });
    if (!seed && !on.length) return;
    mode = "build";
    build = { seed: seed || { type: "pick", id: on[0] }, applied: on };
  }

  /* ---------------- export ---------------- */
  function shareUrl() { return (DATA.meta.site || "") + "map/graph.html" + buildHash(); }
  function abs(n) { return (DATA.meta.site || "") + n.path; }

  function markdownExport() {
    var dv = lastDerived || derive();
    var lines = ["# Architecture sketch — " + seedLabel().replace(/^Seed: /, ""), ""];
    lines.push("## Applied patterns (" + build.applied.length + ")");
    build.applied.forEach(function (id) {
      var n = byId[id];
      lines.push("- [" + n.name + "](" + abs(n) + ") — " + n.essence);
    });
    var covered = Object.keys(dv.covered);
    if (covered.length) {
      lines.push("", "## Hazards covered (" + covered.length + "/" + ((DATA.meta.counts || {}).hazard || 0) + ")");
      covered.forEach(function (h) {
        lines.push("- [" + byId[h].name + "](" + abs(byId[h]) + ") — via " +
          dv.covered[h].map(function (id) { return byId[id].name; }).join(", "));
      });
    }
    if (dv.warnings.length) {
      lines.push("", "## Warnings");
      dv.warnings.forEach(function (w) {
        lines.push("- " + (w.kind === "prereq"
          ? byId[w.of].name + " requires " + byId[w.needs].name + " — not applied"
          : byId[w.a].name + " and " + byId[w.b].name + " are alternatives — applied together"));
      });
    }
    var excluded = Object.keys(dv.excluded);
    if (excluded.length) {
      lines.push("", "## Excluded alternatives");
      excluded.forEach(function (x) {
        lines.push("- [" + byId[x].name + "](" + abs(byId[x]) + ") — alternative to " +
          dv.excluded[x].map(function (id) { return byId[id].name; }).join(", "));
      });
    }
    lines.push("", "Share: " + shareUrl(), "");
    return lines.join("\n");
  }

  function copyText(text, btn) {
    var label = btn.textContent;
    function done(ok) {
      btn.textContent = ok ? "Copied ✓" : "Copy failed";
      setTimeout(function () { btn.textContent = label; }, 1400);
    }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { /* denied */ }
      ta.remove();
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else fallback();
  }

  /* ---------------- controls ---------------- */
  function setMode(m) {
    mode = m;
    document.body.classList.toggle("mode-build", m === "build");
    document.body.classList.toggle("mode-explore", m === "explore");
    document.querySelectorAll(".mode-tab").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.mode === m ? "true" : "false");
    });
    selectedId = null;
    tip.hidden = true;
    tipNode = null;
    render();
  }
  document.querySelectorAll(".mode-tab").forEach(function (b) {
    b.addEventListener("click", function () { setMode(b.dataset.mode); });
  });

  // The verb legend doubles as the edge filter; button state mirrors famOff.
  document.querySelectorAll(".legend-btn").forEach(function (b) {
    b.setAttribute("aria-pressed", famOff[b.dataset.family] ? "false" : "true");
    b.addEventListener("click", function () {
      if (famOff[b.dataset.family]) delete famOff[b.dataset.family];
      else famOff[b.dataset.family] = true;
      b.setAttribute("aria-pressed", famOff[b.dataset.family] ? "false" : "true");
      render();
    });
  });

  document.querySelectorAll(".kind-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      explore.kinds[b.dataset.kind] = explore.kinds[b.dataset.kind] ? 0 : 1;
      b.setAttribute("aria-pressed", explore.kinds[b.dataset.kind] ? "true" : "false");
      render();
    });
  });
  var bandSelect = document.getElementById("band-select");
  if (bandSelect) bandSelect.addEventListener("change", function () { explore.band = bandSelect.value; render(); });
  var favBtn = document.getElementById("fav-btn");
  if (favBtn) favBtn.addEventListener("click", function () {
    explore.favs = !explore.favs;
    favBtn.setAttribute("aria-pressed", explore.favs ? "true" : "false");
    render();
  });

  function debounce(fn) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, 120); };
  }
  var searchInput = document.getElementById("graph-search");
  if (searchInput) {
    searchInput.addEventListener("input", debounce(function () {
      explore.q = searchInput.value;
      selectedId = null;
      render();
    }));
    searchInput.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { searchInput.value = ""; explore.q = ""; render(); searchInput.blur(); }
    });
  }

  // Changing an established seed throws the stack away — confirm first.
  function setSeed(seed) {
    if ((build.seed || build.applied.length) &&
        !window.confirm("Changing the seed resets your stack. Continue?")) return false;
    build = { seed: seed, applied: [] };
    render();
    return true;
  }
  function syncSeedControls() {
    var s = build.seed;
    document.querySelectorAll(".preset-btn").forEach(function (b) {
      b.setAttribute("aria-pressed", s && s.type === "preset" && s.id === b.dataset.preset ? "true" : "false");
    });
    var ds = document.getElementById("design-select");
    if (ds) ds.value = s && s.type === "design" ? s.id : "";
    var sy = document.getElementById("symptom-search");
    if (sy && (!s || s.type !== "symptom")) sy.value = "";
  }
  document.querySelectorAll(".preset-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      if (setSeed({ type: "preset", id: b.dataset.preset })) syncSeedControls();
    });
  });
  var designSelect = document.getElementById("design-select");
  if (designSelect) designSelect.addEventListener("change", function () {
    if (!designSelect.value) return;
    if (setSeed({ type: "design", id: designSelect.value })) syncSeedControls();
    else syncSeedControls();   // user cancelled — snap the select back to the real seed
  });
  var symptomInput = document.getElementById("symptom-search");
  if (symptomInput) symptomInput.addEventListener("input", debounce(function () {
    var q = symptomInput.value.trim();
    if (build.seed && build.seed.type === "symptom") {
      // Refining the symptom re-derives suggestions but keeps what is already applied.
      build.seed = { type: "symptom", q: q };
      render();
    } else if (q && setSeed({ type: "symptom", q: q })) {
      syncSeedControls();
      symptomInput.value = q;
    } else if (q) {
      symptomInput.value = "";
    }
  }));

  /* ---------------- init ---------------- */
  parseHash();
  if (mode === "build") {
    setMode("build");
    syncSeedControls();
    var s = build.seed;
    if (s && s.type === "symptom" && symptomInput) symptomInput.value = s.q;
  } else {
    setMode("explore");
  }
})();
