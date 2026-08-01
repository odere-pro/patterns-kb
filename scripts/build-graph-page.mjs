#!/usr/bin/env node
/* build-graph-page.mjs — AUTHORING-TIME tool. Emits site/map/graph.html: the shell of
 * the interactive graph explorer. All 260 nodes and their typed edges render as one
 * live d3-force canvas, tuned from an Obsidian-style settings panel.
 *
 * This script emits STRUCTURE ONLY: header, the empty SVG, the settings panel skeleton
 * (Filters / Links / Groups / Display / Forces, with the verb legend inside Links), and
 * a noscript fallback. All runtime behavior is hand-authored in assets/graph-view.js
 * and styled in assets/graph.css; the data ships as assets/graphdata.js
 * (window.KB_GRAPH), emitted by build.mjs — a script, not a fetch, so file:// keeps
 * working. Control ids and slider ranges here are the contract graph-view.js binds to;
 * slider default values are baked to match its DEFAULTS so nothing jumps at load. */
import { readFileSync, existsSync } from "node:fs";
import { writeAtomic } from "./lib/atomic.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { BANDS, RELATION_TYPES, REL_ORDER, esc } from "./lib/model.mjs";

/* KB_ROOT lets the smoke tests — and the pre-commit staged-tree check — point this
 * builder at another corpus. Without it a `KB_ROOT=... make check` silently validated
 * the working tree instead, which is the hole a staged-tree check exists to close.
 * Same contract as build.mjs. */
const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const graph = JSON.parse(readFileSync(join(ROOT, "site", "assets", "graph.json"), "utf8"));
const N = graph.nodes;

const count = (kind) => Object.values(N).filter((n) => n.kind === kind).length;
const counts = Object.fromEntries(["pattern", "hazard", "theme", "principle", "design", "capability", "comparison"].map((k) => [k, count(k)]));

/* The essence names what is actually on the canvas. A kind declared but not yet authored
 * is dropped rather than announced as "0 product comparisons", which reads as a bug. */
const INVENTORY_LABELS = [
  ["pattern", "patterns", "pattern"], ["design", "case studies", "case study"],
  ["theme", "themes", "theme"], ["hazard", "hazards", "hazard"],
  ["principle", "principles", "principle"], ["capability", "cloud capabilities", "cloud capability"],
  ["comparison", "product comparisons", "product comparison"],
];
const andList = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs.join(""));
const live = INVENTORY_LABELS.filter(([k]) => counts[k] > 0);
const inventory = andList(live.map(([k, plural]) => `${counts[k]} ${plural}`));
const kindsPhrase = andList(live.map(([, , singular]) => singular));

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
  `          <button type="button" class="legend-btn fam-${f.canonical}" data-family="${f.canonical}" aria-pressed="true"><span class="swatch" aria-hidden="true"></span>${esc(f.label)}</button>`,
).join("\n");

/* ---- panel controls ---- */
/* Kind chips are tag-like FILTER toggles — the glyph mirrors the node's shape on the
 * canvas (kinds are shape-coded, bands are color-coded). */
const KIND_GLYPHS = { pattern: "●", hazard: "▲", theme: "■", principle: "◎", design: "◆", capability: "✚", comparison: "✦" };
const KIND_LABELS = { pattern: "Patterns", hazard: "Hazards", theme: "Themes", principle: "Principles", design: "Case studies", capability: "Cloud capabilities", comparison: "Comparisons" };
/* A kind with no pages yet gets no chip: toggling it would filter the canvas to nothing
 * and say nothing about why. The kind stays declared in the model and its chip returns
 * the moment its first page lands. */
const kindBtns = Object.entries(KIND_LABELS).filter(([kind]) => counts[kind] > 0).map(([kind, label]) =>
  `          <button type="button" class="gbtn kind-btn" data-kind="${kind}" aria-pressed="true"><span class="kshape" aria-hidden="true">${KIND_GLYPHS[kind]}</span>${esc(label)}</button>`,
).join("\n");

/* Bands are the built-in GROUPS: each is a color family on the canvas, so its chip
 * carries the same color and toggles that band's patterns. */
const bandBtns = BANDS.map((b) =>
  `          <button type="button" class="gbtn band-btn band-${b.id}" data-band="${b.id}" aria-pressed="true"><span class="swatch" aria-hidden="true"></span>${esc(b.kind === "elevation" ? `${b.numeral} · ${b.label}` : b.label)}</button>`,
).join("\n");

const slider = (id, label, min, max, step, value) =>
  `        <label class="panel-slider">${esc(label)}
          <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
        </label>`;

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
  <meta name="description" content="Every ${kindsPhrase} on one live force-directed canvas — filter by kind, band, tag, favourites or what you have practiced, color your own groups, tune the physics, and follow the ${graph.meta.relationships} typed relationships.">
  <link rel="stylesheet" href="../assets/tokens.css">
  <link rel="stylesheet" href="../assets/pattern.css">
  <link rel="stylesheet" href="../assets/graph.css">
  <script src="../assets/theme.js"></script>
  <!-- no lens.js: this page carries no leveled prose, so the reading-level toggle would
       render three dead buttons here -->
</head>
<body class="doc theme">
  <main class="doc-wrap graph-page">
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="../index.html">Map</a>
      <span class="sep">▸</span>
      <span aria-current="page">Interactive Graph</span>
    </nav>

    <header class="doc-head">
      <p class="doc-kicker">Map · The whole web</p>
      <h1 class="doc-title">Interactive Graph</h1>
      <p class="doc-essence">${inventory}, wired by ${graph.meta.relationships} typed relationships — one live canvas. Drag, zoom, filter by kind, band, tag (<code>tag:caching</code>), favourites or what you have practiced, color your own groups, and tune the forces. Click a node to trace its neighbourhood; double-click to open its page. Your ★ and ✓ are the same ones the hub and the pages carry — toggle them from the selected node's card.</p>
      <div class="doc-metarow">
        <span class="badge">Interactive</span>
        <span class="badge muted">${graph.meta.relationships} relationships</span>
      </div>
    </header>

    <div class="graph-stage">
      <svg id="kb-graph" role="application" aria-label="Pattern relationship graph. Tab to a node, Enter to select, o to open its page, f to favourite it, p to mark it practiced."></svg>
      <aside id="graph-panel" aria-label="Graph settings">
        <details class="panel-sec" open>
          <summary>Filters</summary>
          <input class="graph-input" id="graph-search" type="search" placeholder="Search — name, symptom, tag:x, kind:x" aria-label="Filter the graph: free text, tag:x, kind:x, band:x, fav:true, practiced:true; prefix - negates" title="Shortcut: ⌘K (Ctrl+K)" autocomplete="off" spellcheck="false">
          <div class="panel-row" role="group" aria-label="Kinds — click to show or hide">
${kindBtns}
          </div>
          <label class="panel-toggle"><input type="checkbox" id="fav-toggle"> ★ Favourites only</label>
          <label class="panel-toggle"><input type="checkbox" id="practiced-toggle"> ✓ Practiced only</label>
          <label class="panel-toggle"><input type="checkbox" id="orphans-toggle"> Hide orphans</label>
        </details>
        <details class="panel-sec">
          <summary>Links</summary>
          <div class="panel-row" role="group" aria-label="Relationship families — click to show or hide edges">
${legend}
          </div>
        </details>
        <details class="panel-sec" open>
          <summary>Groups</summary>
          <div class="panel-row" role="group" aria-label="Bands — click to show or hide">
${bandBtns}
          </div>
          <div id="group-list"></div>
          <button type="button" class="gbtn" id="group-add">+ New group</button>
        </details>
        <details class="panel-sec">
          <summary>Display</summary>
          <label class="panel-toggle"><input type="checkbox" id="arrows-toggle"> Arrows</label>
${slider("sl-label", "Text fade threshold", 0.5, 3, 0.05, 1.4)}
${slider("sl-node", "Node size", 0.5, 2.5, 0.05, 1)}
${slider("sl-edge", "Link thickness", 0.5, 3, 0.1, 1)}
        </details>
        <details class="panel-sec">
          <summary>Forces</summary>
${slider("sl-center", "Centre force", 0, 0.3, 0.01, 0.05)}
${slider("sl-repel", "Repel force", 0, 500, 10, 140)}
${slider("sl-link", "Link force", 0, 1, 0.05, 0.5)}
${slider("sl-dist", "Link distance", 30, 200, 5, 80)}
        </details>
        <div class="panel-foot">
          <button type="button" class="gbtn" id="fit-btn">Fit to view</button>
          <button type="button" class="gbtn" id="reset-btn">Restore defaults</button>
        </div>
      </aside>
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
  <script src="../assets/graph-core.js"></script>
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
  writeAtomic(OUT, html);
  console.log(`site/map/graph.html written: ${Object.keys(N).length} nodes, ${families.length} relation families.`);
}
