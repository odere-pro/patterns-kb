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
import { BANDS, THEME_ORDER, HAZARD_ORDER, PRINCIPLE_ORDER, esc } from "./lib/model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site", "index.html");
const graph = JSON.parse(readFileSync(join(ROOT, "site", "assets", "graph.json"), "utf8"));
const N = graph.nodes;

const patternsIn = (group) =>
  Object.values(N).filter((n) => n.kind === "pattern" && n.group === group);
const bandTotal = (band) =>
  Object.values(N).filter((n) => n.kind === "pattern" && n.band === band).length;

function chip(n) {
  // n.path is site-relative and the hub sits at site/, so it needs no adjustment.
  const favAttr = n.favourite ? ' data-fav="1"' : "";
  const favStar = n.favourite ? '<span class="chip-fav" title="Favourite" aria-label="Favourite">★</span>' : "";
  return `            <div class="chip"${favAttr}><input class="chip-box" type="checkbox" data-id="${n.id}" data-band="${n.band}" data-group="${n.group}" aria-label="Mark ${esc(n.name)} practiced"><a class="chip-name" href="${n.path}">${esc(n.name)}</a><span class="chip-note">${esc(n.essence)}</span>${favStar}</div>`;
}
function chips(group) {
  return patternsIn(group).map(chip).join("\n");
}

/* ---- elevation bands ---- */
/* Projected from the shared model. Labels there are plain text; escape at render. */
const ELEVATION = BANDS.filter((b) => b.kind === "elevation").map((b) => ({
  band: b.id, numeral: b.numeral, vlabel: b.label, anchor: b.anchor,
  h2: b.label, desc: b.desc,
  groups: b.groups.map((g) => [g.id, g.label]),
}));

function bandGroupHtml([group, title]) {
  const total = patternsIn(group).length;
  const head = title
    ? `        <div class="group">\n          <h3>${esc(title)} <span class="count" data-count-group="${group}">0/${total}</span></h3>\n          <div class="chips">\n${chips(group)}\n          </div>\n        </div>`
    : `        <div class="group">\n          <div class="chips">\n${chips(group)}\n          </div>\n        </div>`;
  return head;
}

function bandHtml(b) {
  return `    <section class="band" data-band="${b.band}" aria-labelledby="${b.anchor}">
      <div class="marker" aria-hidden="true">
        <span class="numeral">${b.numeral}</span>
        <span class="rule"></span>
        <span class="vlabel">${esc(b.vlabel)}</span>
      </div>
      <div class="band-content">
        <div class="band-head">
          <h2 id="${b.anchor}">${esc(b.h2)}</h2>
          <p>${esc(b.desc)} <span class="count" data-count-band="${b.band}">0/${bandTotal(b.band)}</span></p>
        </div>
${b.groups.map(bandGroupHtml).join("\n")}
      </div>
    </section>`;
}

/* ---- lenses ---- */
const LENSES = BANDS.filter((b) => b.kind === "lens").map((b) => [b.id, b.label, b.anchor]);
function lensHtml([band, title, anchor]) {
  const total = bandTotal(band);
  return `        <div class="lens-card" data-band="${band}" aria-labelledby="${anchor}">
          <h3 id="${anchor}">${esc(title)} <span class="count" data-count-band="${band}">0/${total}</span></h3>
          <div class="chips">
${chips(band)}
          </div>
        </div>`;
}

/* ---- themes ---- */
function themeCard(id) {
  const t = N[id];
  return `        <a class="theme-card" href="${t.path}"><span class="theme-name">${esc(t.name)}</span><span class="theme-note">${esc(t.essence)}</span></a>`;
}

/* ---- principles ---- */
/* Reuses the theme-card styling; the ORDER is filtered to nodes that actually exist so the
 * hub still builds while the section is being populated one page at a time. */
function principleCard(id) {
  const p = N[id];
  return `        <a class="theme-card" href="${p.path}"><span class="theme-name">${esc(p.name)}</span><span class="theme-note">${esc(p.essence)}</span></a>`;
}
const PRINCIPLES = PRINCIPLE_ORDER.filter((id) => N[id]);

/* ---- hazards ---- */
function hazardChip(id) {
  const h = N[id];
  return `        <div class="chip chip--plain hazard-chip"><a class="chip-name" href="${h.path}">${esc(h.name)}</a><span class="chip-note">${esc(h.essence)}</span></div>`;
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
  <script src="assets/theme.js"></script>
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
      <button class="fav-filter-btn" id="fav-filter-btn" type="button" aria-pressed="false">★ Favourites</button>
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
      <a href="#principles-h">Principles</a>
      <a href="#lens-msg-h">Messaging</a>
      <a href="#lens-cache-h">Caching</a>
      <a href="#lens-conc-h">Concurrency</a>
      <a href="#lens-ddd-h">DDD</a>
      <a href="#lens-fp-h">Functional</a>
      <a href="#lens-test-h">Testing</a>
      <a href="#lens-sec-h">Security</a>
      <a href="#hazards-h">Hazards</a>
      <a href="map/graph.html">Graph ↗</a>
      <a href="vocab.html">Vocabulary ↗</a>
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

    <section class="themes principles" aria-labelledby="principles-h">
      <div class="themes-head">
        <h2 id="principles-h">Principles — how to write it well</h2>
        <p>Not a rung and not a lens: each principle is a rule of thumb that holds at every elevation — the maxims that keep code simple, decoupled, and cheap to change. Each page cross-links to the patterns that embody it and the hazards it guards against.</p>
      </div>
      <div class="theme-grid">
${PRINCIPLES.map(principleCard).join("\n")}
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

<script src="assets/catalog.js"></script>
<script src="assets/search.js"></script>
<script src="assets/progress.js"></script>
<script src="assets/favourites.js"></script>
</body>
</html>
`;

if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== html) { console.error("index.html is STALE — run: node scripts/build-hub.mjs"); process.exit(1); }
  console.log("index.html is up to date.");
} else {
  writeFileSync(OUT, html);
  console.log(`index.html written: ${totalPatterns} pattern chips + ${THEME_ORDER.length} themes + ${PRINCIPLES.length} principles + ${HAZARD_ORDER.length} hazards.`);
}
