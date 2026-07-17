#!/usr/bin/env node
/* build-hub.mjs — AUTHORING-TIME tool (not a site build step).
 * Emits site/index.html (the elevation-map hub) from site/assets/graph.json, so the
 * chip list, per-band/group counts, and links stay in sync with the single source of
 * truth. The bespoke masthead/legend/footer are hard-coded here; chips are generated.
 * Run:  node scripts/build-hub.mjs   (add --check to fail if index.html is stale)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site", "index.html");
const graph = JSON.parse(readFileSync(join(ROOT, "site", "assets", "graph.json"), "utf8"));
const N = graph.nodes;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const patternsIn = (group) =>
  Object.values(N).filter((n) => n.kind === "pattern" && n.group === group);
const bandTotal = (band) =>
  Object.values(N).filter((n) => n.kind === "pattern" && n.band === band).length;

function chip(n) {
  const dir = n.kind === "hazard" ? "hazards" : "patterns";
  return `            <div class="chip"><input class="chip-box" type="checkbox" data-id="${n.id}" data-band="${n.band}" data-group="${n.group}" aria-label="Mark ${esc(n.name)} practiced"><a class="chip-name" href="${dir}/${n.id}.html">${esc(n.name)}</a><span class="chip-note">${esc(n.essence)}</span></div>`;
}
function chips(group) {
  return patternsIn(group).map(chip).join("\n");
}

/* ---- elevation bands ---- */
const ELEVATION = [
  {
    band: "gof", numeral: "I", vlabel: "Objects &amp; Classes", anchor: "band-gof-h",
    h2: "Objects &amp; Classes",
    desc: "Gang of Four, 1994 — the 23 patterns everything else stands on, plus a few essentials the book missed",
    groups: [
      ["gof-creational", "Creational"],
      ["gof-structural", "Structural"],
      ["gof-behavioral", "Behavioral"],
      ["gof-extra", "Also Essential"],
    ],
  },
  {
    band: "enterprise", numeral: "II", vlabel: "Application", anchor: "band-ent-h",
    h2: "Application",
    desc: "Organizing one app's business logic and data access (Fowler, PoEAA)",
    groups: [["enterprise", null]],
  },
  {
    band: "architecture", numeral: "III", vlabel: "Architecture", anchor: "band-arch-h",
    h2: "Architecture",
    desc: "Shaping how a whole system's components are arranged",
    groups: [["architecture", null]],
  },
  {
    band: "distributed", numeral: "IV", vlabel: "Network", anchor: "band-dist-h",
    h2: "Network",
    desc: "Keeping many services reliable, fast, and consistent across a network",
    groups: [
      ["distributed-resilience", "Resilience"],
      ["distributed-routing", "Routing &amp; Scale"],
      ["distributed-coordination", "Coordination &amp; Data"],
    ],
  },
];

function bandGroupHtml([group, title]) {
  const total = patternsIn(group).length;
  const head = title
    ? `        <div class="group">\n          <h3>${title} <span class="count" data-count-group="${group}">0/${total}</span></h3>\n          <div class="chips">\n${chips(group)}\n          </div>\n        </div>`
    : `        <div class="group">\n          <div class="chips">\n${chips(group)}\n          </div>\n        </div>`;
  return head;
}

function bandHtml(b) {
  return `    <section class="band" data-band="${b.band}" aria-labelledby="${b.anchor}">
      <div class="marker" aria-hidden="true">
        <span class="numeral">${b.numeral}</span>
        <span class="rule"></span>
        <span class="vlabel">${b.vlabel}</span>
      </div>
      <div class="band-content">
        <div class="band-head">
          <h2 id="${b.anchor}">${b.h2}</h2>
          <p>${b.desc} <span class="count" data-count-band="${b.band}">0/${bandTotal(b.band)}</span></p>
        </div>
${b.groups.map(bandGroupHtml).join("\n")}
      </div>
    </section>`;
}

/* ---- lenses ---- */
const LENSES = [
  ["concurrency", "Concurrency", "lens-conc-h"],
  ["messaging", "Messaging", "lens-msg-h"],
  ["caching", "Caching", "lens-cache-h"],
  ["ddd", "Domain-Driven Design", "lens-ddd-h"],
  ["functional", "Functional", "lens-fp-h"],
  ["testing", "Testing", "lens-test-h"],
  ["security", "Security", "lens-sec-h"],
];
function lensHtml([band, title, anchor]) {
  const total = bandTotal(band);
  return `        <div class="lens-card" data-band="${band}" aria-labelledby="${anchor}">
          <h3 id="${anchor}">${title} <span class="count" data-count-band="${band}">0/${total}</span></h3>
          <div class="chips">
${chips(band)}
          </div>
        </div>`;
}

/* ---- themes ---- */
const THEME_ORDER = [
  "cap-theorem", "streaming", "spike-handling", "performance", "auth-and-access",
  "scalability", "consistency-and-replication", "observability", "resilience",
];
function themeCard(id) {
  const t = N[id];
  return `        <a class="theme-card" href="themes/${id}.html"><span class="theme-name">${esc(t.name)}</span><span class="theme-note">${esc(t.essence)}</span></a>`;
}

/* ---- hazards ---- */
const HAZARD_ORDER = ["god-object", "spaghetti-code", "big-ball-of-mud", "anemic-domain-model", "golden-hammer", "boat-anchor"];
function hazardChip(id) {
  const h = N[id];
  return `        <div class="chip chip--plain hazard-chip"><a class="chip-name" href="hazards/${id}.html">${esc(h.name)}</a><span class="chip-note">${esc(h.essence)}</span></div>`;
}

const totalPatterns = Object.values(N).filter((n) => n.kind === "pattern").length;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>The Elevation Map — Software Design Patterns</title>
  <meta name="description" content="An altitude-ordered, cross-linked map of ${totalPatterns} software and system-design patterns, with theme pages for CAP, streaming, spikes, performance, and auth.">
  <link rel="stylesheet" href="assets/tokens.css">
  <link rel="stylesheet" href="assets/hub.css">
</head>
<body>
<div class="page">
  <header class="masthead">
    <p class="eyebrow">Software Design Patterns · Reference</p>
    <h1>The Elevation Map</h1>
    <p class="dek">Patterns don't sit at one altitude: some shape a single class, others keep a network of services from falling over. This map orders them <strong>low to high, foundation to summit</strong>, plus lenses that apply at every elevation and <strong>theme pages</strong> that weave patterns into the concerns that decide a design. <strong>Click any pattern</strong> to open its page — what it is, its variations, trade-offs, when to use it, and how it relates to the rest.</p>
    <div class="controls">
      <span class="progress" id="global-progress">— practiced</span>
      <button class="reset-btn" id="reset-btn" type="button">Reset progress</button>
    </div>
    <div class="legend">
      <span class="legend-item"><span class="swatch ladder"></span>Elevation — one rung to the next</span>
      <span class="legend-item"><span class="swatch lens"></span>Lens — applies at every elevation</span>
      <span class="legend-item"><span class="swatch hazard"></span>Hazard — what patterns exist to prevent</span>
    </div>
    <nav class="jumpnav" aria-label="Jump to section">
      <a href="#band-gof-h">I · Objects</a>
      <a href="#band-ent-h">II · Application</a>
      <a href="#band-arch-h">III · Architecture</a>
      <a href="#band-dist-h">IV · Network</a>
      <a href="#themes-h">Themes</a>
      <a href="#lens-msg-h">Messaging</a>
      <a href="#lens-cache-h">Caching</a>
      <a href="#lens-conc-h">Concurrency</a>
      <a href="#lens-ddd-h">DDD</a>
      <a href="#lens-fp-h">Functional</a>
      <a href="#lens-test-h">Testing</a>
      <a href="#lens-sec-h">Security</a>
      <a href="#hazards-h">Hazards</a>
      <a href="map/graph.html">Graph ↗</a>
    </nav>
  </header>

  <main>

${ELEVATION.map(bandHtml).join("\n\n")}

    <section class="themes" aria-labelledby="themes-h">
      <div class="themes-head">
        <h2 id="themes-h">Themes — building fluency</h2>
        <p>Not a rung and not a lens: each theme is a guided tour of how many patterns combine to answer one systems question.</p>
      </div>
      <div class="theme-grid">
${THEME_ORDER.map(themeCard).join("\n")}
      </div>
    </section>

    <section class="lenses">
      <div class="lenses-head">
        <h2>Lenses</h2>
        <p>Not another rung on the ladder — these reshape how you build at whatever elevation you're already working.</p>
      </div>
      <div class="lens-grid">
${LENSES.map(lensHtml).join("\n")}
      </div>
    </section>

    <section class="hazards" aria-labelledby="hazards-h">
      <h2 id="hazards-h">Known Hazards</h2>
      <p>Anti-patterns — not to practice, just to recognize on sight. Every one is what the patterns above exist to prevent.</p>
      <div class="chips hazard-chips">
${HAZARD_ORDER.map(hazardChip).join("\n")}
      </div>
    </section>

  </main>

  <footer>
    <p>Pick an elevation, a lens, or a theme and follow the links — every pattern page cross-links to the ones it works with, replaces, or is confused for. The <a href="map/graph.html">relationship graph</a> shows the whole web at once.</p>
    <p>Progress is saved locally in this browser. Nothing leaves your machine.</p>
  </footer>
</div>

<script src="assets/progress.js"></script>
</body>
</html>
`;

if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== html) { console.error("index.html is STALE — run: node scripts/build-hub.mjs"); process.exit(1); }
  console.log("index.html is up to date.");
} else {
  writeFileSync(OUT, html);
  console.log(`index.html written: ${totalPatterns} pattern chips + ${THEME_ORDER.length} themes + ${HAZARD_ORDER.length} hazards.`);
}
