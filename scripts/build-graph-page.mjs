#!/usr/bin/env node
/* build-graph-page.mjs — AUTHORING-TIME tool. Emits site/map/graph.html: the shell of
 * the interactive relationship graph + architecture builder. The page replaced the old
 * static per-theme mermaid clusters — all 260 nodes and their typed edges now render as
 * one d3-force canvas with two modes (Explore / Build).
 *
 * This script emits STRUCTURE ONLY: header, mode tabs, the verb legend (which doubles
 * as an edge filter), explore/build controls, the empty SVG + panel skeletons, and a
 * noscript fallback. All runtime behavior is hand-authored in assets/graph-view.js and
 * styled in assets/graph.css; the data ships as assets/graphdata.js (window.KB_GRAPH),
 * emitted by build.mjs — a script, not a fetch, so file:// keeps working. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BANDS, DESIGN_ORDER, RELATION_TYPES, REL_ORDER, BUILDER_PRESETS, esc } from "./lib/model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const graph = JSON.parse(readFileSync(join(ROOT, "site", "assets", "graph.json"), "utf8"));
const N = graph.nodes;

const count = (kind) => Object.values(N).filter((n) => n.kind === kind).length;
const counts = Object.fromEntries(["pattern", "hazard", "theme", "principle", "design"].map((k) => [k, count(k)]));

/* ---- verb legend: one toggle per family ----
 * A family is a symmetric verb or a directional pair; its canonical id is the
 * sorted-first verb — the SAME canonicalization graph-view.js and graph.css use, so the
 * button's data-family and fam-* class line up with the edge classes. Display order and
 * pair-label order follow REL_ORDER. */
const families = [];
const seen = new Set();
for (const [type, def] of Object.entries(RELATION_TYPES)) {
  const canonical = def.symmetric ? type : [type, def.inverse].sort()[0];
  if (seen.has(canonical)) continue;
  seen.add(canonical);
  const labels = def.symmetric ? [def.label] : [def.label, RELATION_TYPES[def.inverse].label];
  labels.sort((a, b) => REL_ORDER.indexOf(a) - REL_ORDER.indexOf(b));
  families.push({ canonical, label: labels.join(" / ") });
}
families.sort((a, b) =>
  REL_ORDER.indexOf(a.label.split(" / ")[0]) - REL_ORDER.indexOf(b.label.split(" / ")[0]));

const legend = families.map((f) =>
  `        <button type="button" class="legend-btn fam-${f.canonical}" data-family="${f.canonical}" aria-pressed="true"><span class="swatch" aria-hidden="true"></span>${esc(f.label)}</button>`,
).join("\n");

/* ---- controls ---- */
const KIND_LABELS = { pattern: "Patterns", hazard: "Hazards", theme: "Themes", principle: "Principles", design: "Case studies" };
const kindBtns = Object.entries(KIND_LABELS).map(([kind, label]) =>
  `        <button type="button" class="gbtn kind-btn" data-kind="${kind}" aria-pressed="true">${esc(label)}</button>`,
).join("\n");

const bandOptions = BANDS.map((b) =>
  `          <option value="${b.id}">${esc(b.kind === "elevation" ? `${b.numeral} · ${b.label}` : b.label)}</option>`,
).join("\n");

const presetBtns = BUILDER_PRESETS.map((p) =>
  `        <button type="button" class="gbtn preset-btn" data-preset="${p.id}" aria-pressed="false">${esc(p.label)}</button>`,
).join("\n");

const designOptions = DESIGN_ORDER.filter((id) => N[id]).map((id) =>
  `          <option value="${id}">${esc(N[id].name)}</option>`,
).join("\n");

/* ---- noscript fallback: the most connected patterns, as plain links ---- */
const ranked = Object.values(N)
  .filter((n) => n.kind === "pattern")
  .map((n) => ({ name: n.name, path: n.path, deg: n.relations.length }))
  .sort((a, b) => b.deg - a.deg)
  .slice(0, 12);
const rankedHtml = ranked
  .map((r) => `            <div class="rel-item"><a href="../${r.path}">${esc(r.name)}</a><span class="rel-note">${r.deg} connections</span></div>`)
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Interactive Graph · Map</title>
  <meta name="description" content="Every pattern, hazard, theme, principle and case study on one interactive canvas — explore the ${graph.meta.relationships} typed relationships, or build an architecture and watch suggestions, exclusions and hazard coverage derive live.">
  <link rel="stylesheet" href="../assets/tokens.css">
  <link rel="stylesheet" href="../assets/pattern.css">
  <link rel="stylesheet" href="../assets/graph.css">
  <script src="../assets/theme.js"></script>
  <!-- no lens.js: this page carries no leveled prose, so the reading-level toggle would
       render three dead buttons here -->
</head>
<body class="doc theme mode-explore">
  <main class="doc-wrap graph-page">
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="../index.html">Map</a>
      <span class="sep">▸</span>
      <span aria-current="page">Interactive Graph</span>
    </nav>

    <header class="doc-head">
      <p class="doc-kicker">Map · The whole web</p>
      <h1 class="doc-title">Interactive Graph</h1>
      <p class="doc-essence">${counts.pattern} patterns, ${counts.design} case studies, ${counts.theme} themes, ${counts.hazard} hazards and ${counts.principle} principles, wired by ${graph.meta.relationships} typed relationships — one canvas. <strong>Explore</strong> the whole web with filters and search, or <strong>Build</strong>: seed an architecture, apply patterns, and watch suggestions, exclusions and hazard coverage derive live. Double-click any node to open its page.</p>
      <div class="doc-metarow">
        <span class="badge">Interactive</span>
        <span class="badge muted">${graph.meta.relationships} relationships</span>
      </div>
    </header>

    <div class="graph-controls">
      <div class="mode-tabs" role="group" aria-label="Mode">
        <button type="button" class="mode-tab" data-mode="explore" aria-pressed="true">Explore</button>
        <button type="button" class="mode-tab" data-mode="build" aria-pressed="false">Build</button>
      </div>
      <div class="explore-controls" role="group" aria-label="Explore filters">
${kindBtns}
        <select class="graph-select" id="band-select" aria-label="Filter patterns by band">
          <option value="">All bands</option>
${bandOptions}
        </select>
        <button type="button" class="gbtn" id="fav-btn" aria-pressed="false">★ Favourites</button>
        <input class="graph-input" id="graph-search" type="search" placeholder="Search — a name, or a symptom" aria-label="Search the graph by name or symptom" autocomplete="off" spellcheck="false">
      </div>
      <div class="build-controls" role="group" aria-label="Builder seed">
${presetBtns}
        <select class="graph-select" id="design-select" aria-label="Seed from a case study">
          <option value="">Seed from a case study…</option>
${designOptions}
        </select>
        <input class="graph-input" id="symptom-search" type="search" placeholder="Describe a symptom to seed suggestions" aria-label="Describe a symptom to seed suggestions" autocomplete="off" spellcheck="false">
        <span class="build-hint">…or click any node to start from it</span>
      </div>
    </div>

    <div class="graph-legend" role="group" aria-label="Relationship families — click to show or hide edges">
${legend}
    </div>

    <div class="graph-stage">
      <svg id="kb-graph" role="application" aria-label="Pattern relationship graph. Tab to a node, Enter to select or apply, o to open its page."></svg>
      <aside id="build-panel" aria-label="Your architecture stack"></aside>
    </div>

    <noscript>
      <section class="doc-section graph-noscript">
        <h2 class="doc-h">This page is interactive — and needs JavaScript</h2>
        <p class="prose">Without it, start from the most connected patterns below, or read the
          <a href="../vocab.html">relationship vocabulary</a> — every pattern page lists its own
          typed neighbours at the end.</p>
        <div class="rel-group"><div class="rel-list">
${rankedHtml}
        </div></div>
      </section>
    </noscript>

    <nav class="docnav" aria-label="Navigation">
      <a class="prev" href="../index.html">← The Map</a>
      <a class="up" href="../index.html">↑ The Map</a>
      <a class="next" href="../themes/cap-theorem.html">Themes →</a>
    </nav>
  </main>

  <script src="../assets/catalog.js"></script>
  <script src="../assets/graphdata.js"></script>
  <script src="../assets/search.js"></script>
  <script src="../assets/vendor/d3.min.js"></script>
  <script src="../assets/graph-view.js"></script>
</body>
</html>
`;

const OUT = join(ROOT, "site", "map", "graph.html");
if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== html) { console.error("map/graph.html is STALE — run: node scripts/build-graph-page.mjs"); process.exit(1); }
  console.log("map/graph.html is up to date.");
} else {
  writeFileSync(OUT, html);
  console.log(`site/map/graph.html written: ${Object.keys(N).length} nodes, ${families.length} relation families, ${BUILDER_PRESETS.length} presets.`);
}
