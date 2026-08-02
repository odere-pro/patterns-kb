#!/usr/bin/env node
/* build-stack-page.mjs — AUTHORING-TIME tool. Emits site/map/stack.html: the flat
 * pattern-to-product index. DERIVED — never hand-edit the output.
 *
 * The page lists EVERY pattern in the KB, banded and in hub order, so the gaps are as
 * visible as the answers. A row reaches one of three states:
 *
 *   mapped            an `implements` edge carrying data-kb-maps — build.mjs has already
 *                     validated the row id, and this page copies that mapping row's service
 *                     cells verbatim (links included: site/map/ and site/capabilities/ sit
 *                     at the same depth, so ../ hrefs resolve unchanged).
 *   capability-linked an `implements` edge with no data-kb-maps — em-dash cells linking the
 *                     capability's whole table.
 *   gap               no `implements` edge at all. Em-dashes, muted. This records that the
 *                     KB has no product for the pattern — NOT that no product exists. The
 *                     legend says so; do not reword it into a verdict.
 *
 * data-kb-level attributes are stripped from copied cells: this page is a flat index, every
 * row shows at every lens.
 */
import { readFileSync, existsSync } from "node:fs";
import { writeAtomic } from "./lib/atomic.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";
import { BANDS, COMPARISON_ORDER, esc } from "./lib/model.mjs";
import { linkifyProducts, PROVIDER_COLUMNS } from "./lib/products.mjs";

const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const OUT = join(SITE, "map", "stack.html");

const graph = JSON.parse(readFileSync(join(SITE, "assets", "graph.json"), "utf8"));
const N = graph.nodes;

const DASH = "—";
const SERVICE_COLS = 4; // AWS, Azure, Google Cloud, Open source

/* Bands where a dash is the CORRECT answer for every row, not an unwritten mapping. These
 * patterns live inside one process — there is no product to rent, and there never will be —
 * so a reader scrolling 29 dashed GoF rows would otherwise read the section as a coverage
 * failure. Generator prose, deliberately not a BANDS field: model.mjs's `desc` is read by
 * three artifacts, and this sentence only makes sense on this page.
 *
 * A band is absent from this table when SOME of it is buyable, however little. Application,
 * Architecture and Security each hold patterns a platform does sell, so their dashes really
 * are gaps in the index and the legend's wording already covers them. */
const UNBUYABLE = {
  gof: "None of these is a service. They live inside one process, so every dash below is the right answer rather than a missing mapping.",
  ddd: "These are modelling decisions in your own code. Nothing in this section is purchasable, and nothing should be.",
  functional: "These are language and composition techniques. There is no product column to fill.",
  testing: "Test doubles live in your test suite. A managed service cannot stand in for one, so every row is dashed by nature.",
  frontend: "These structure code that runs in the browser. Hosting is buyable; the structure is not.",
};

/* Cells of one mapping/matrix row, as inner HTML with lens attributes stripped.
 * Cell 0 is the row's own label (the sub-capability); cells 1..n are the services. */
const rowCache = new Map();
function rowCells(pageNode, rowId) {
  const key = `${pageNode.id}#${rowId}`;
  if (rowCache.has(key)) return rowCache.get(key);
  const root = parse(readFileSync(join(SITE, pageNode.path), "utf8"));
  const row = root.querySelector(`#${rowId}`);
  const cells = row ? row.querySelectorAll("td").map((td) => td.innerHTML.trim()) : null;
  rowCache.set(key, cells);
  return cells;
}

/* patternId -> [{ src, maps, }] — every implements edge, capability and comparison alike,
 * indexed the way the table reads it. A pattern packaged by two capabilities (Replication
 * is storage AND databases) gets one row per source. */
const sources = new Map();
const srcRank = new Map();
[...Object.values(N)].forEach((n) => {
  if (n.kind !== "capability" && n.kind !== "comparison") return;
  for (const r of n.relations || []) {
    if (r.type !== "implements" || !N[r.to]) continue;
    if (!sources.has(r.to)) sources.set(r.to, []);
    sources.get(r.to).push({ src: n, maps: r.maps });
  }
});
COMPARISON_ORDER.forEach((id, i) => srcRank.set(id, 100 + i)); // capabilities sort first
for (const list of sources.values()) {
  list.sort((a, b) => (srcRank.get(a.src.id) || 0) - (srcRank.get(b.src.id) || 0));
}

/* A comparison page argues the product choice rather than naming one service per cloud, so
 * it never earns a row of its own — it rides along as a chip on the pattern's first row.
 *
 * Its matrix is keyed by CRITERION down the side and PRODUCT across the top — Kafka,
 * RabbitMQ, NATS — so a pinned matrix row can never fill the four cloud columns the way a
 * capability's mapping row does. Copying its cells here would file "Deleted on
 * acknowledgement" under AWS. What a pin CAN do is land the reader on the one criterion that
 * decides this pattern, so `data-kb-maps` on a comparison edge deep-links the chip and names
 * the criterion in its tooltip. Unannotated chips still open the whole argument. */
function compareChips(list) {
  return list.filter((e) => e.src.kind === "comparison")
    .map((e) => {
      const cells = e.maps ? rowCells(e.src, e.maps) : null;
      const criterion = cells && cells.length ? cells[0].replace(/<[^>]*>/g, "").trim() : "";
      const frag = criterion ? `#${e.maps}` : "";
      const why = criterion ? ` title="${esc(criterion)}"` : "";
      return `<a class="row-cmp" href="../${e.src.path}${frag}"${why}>Compare ${esc(e.src.name)}</a>`;
    })
    .join("");
}

function serviceRow(p, entry, chips) {
  const patternLink = `<a href="../${p.path}">${esc(p.name)}</a>`;
  if (!entry) {
    return `            <tr class="row-gap"><td>${patternLink}${chips}</td>` +
      `<td>${DASH}</td>`.repeat(SERVICE_COLS) + `</tr>`;
  }
  const { src, maps } = entry;
  const whole = `../${src.path}#mapping`;
  let facet = `<a href="${whole}">all of ${esc(src.name)}</a>`;
  let cells = Array(SERVICE_COLS).fill(`<a href="${whole}">${DASH}</a>`);
  let cls = " class=\"row-partial\"";
  if (maps) {
    const c = rowCells(src, maps);
    if (c && c.length) {
      facet = `<a href="../${src.path}#${maps}">${c[0]}</a>`;
      /* Each service cell is linkified against ITS OWN column's product registry, so the
       * reader can go straight to the vendor's documentation. The column index is what
       * decides whose docs a name resolves to: "Application Load Balancer" is an AWS product
       * and also Google's layer-7 balancer. A cell that already carries an internal link to a
       * comparison page keeps it — linkifyProducts skips inside an existing anchor, so the
       * internal link wins for that name and "patterns link in, products link out" holds. */
      cells = c.slice(1, 1 + SERVICE_COLS)
        .map((cell, i) => linkifyProducts(cell, PROVIDER_COLUMNS[i]));
      while (cells.length < SERVICE_COLS) cells.push(DASH);
      cls = "";
    }
  }
  return `            <tr${cls}><td>${patternLink}<span class="row-facet">${facet}</span>${chips}</td>` +
    cells.map((x) => `<td>${x}</td>`).join("") + `</tr>`;
}

/* Patterns come out of graph.json already sorted by data-kb-order (build.mjs sorts the docs
 * before it builds nodes), so bucketing by group preserves the hub's editorial order. */
const patterns = Object.values(N).filter((n) => n.kind === "pattern");
let mappedCount = 0, partialCount = 0, gapCount = 0, rowCount = 0;

function bandSection(band) {
  const blocks = band.groups.map((g) => {
    const members = patterns.filter((p) => (p.group || p.band) === g.id);
    if (!members.length) return "";
    const rows = members.flatMap((p) => {
      const list = sources.get(p.id) || [];
      const chips = compareChips(list);
      const caps = list.filter((e) => e.src.kind === "capability");
      if (!caps.length) {
        rowCount++;
        if (chips) partialCount++; else gapCount++;
        return [serviceRow(p, null, chips)];
      }
      return caps.map((e, i) => {
        rowCount++;
        if (e.maps && rowCells(e.src, e.maps)) mappedCount++; else partialCount++;
        return serviceRow(p, e, i === 0 ? chips : "");
      });
    });
    const head = g.label ? `          <h3 class="group-h">${esc(g.label)}</h3>\n` : "";
    return `${head}        <div class="table-scroll">
          <table class="decision stack-table">
            <thead>
              <tr><th>Pattern</th><th>AWS</th><th>Azure</th><th>Google Cloud</th><th>Open source</th></tr>
            </thead>
            <tbody>
${rows.join("\n")}
            </tbody>
          </table>
        </div>`;
  }).filter(Boolean);
  if (!blocks.length) return "";
  /* The note claims nothing in the band is purchasable, so one implements edge falsifies it.
   * Adding a capability edge is exactly how the claim goes stale — messaging implements
   * Scheduling, a concurrency pattern, which is what took that band off the list — and a
   * confidently wrong "no cloud sells these" is worse than the dashes it was meant to explain. */
  if (UNBUYABLE[band.id]) {
    const sold = band.groups.flatMap((g) => patterns.filter((p) => (p.group || p.band) === g.id))
      .filter((p) => (sources.get(p.id) || []).some((e) => e.src.kind === "capability"));
    if (sold.length) {
      console.error(`build-stack-page: band "${band.id}" is listed as unbuyable but a capability ` +
        `implements ${sold.map((p) => p.id).join(", ")} — drop it from UNBUYABLE or retype that edge.`);
      process.exit(1);
    }
  }
  const unbuyable = UNBUYABLE[band.id]
    ? `\n        <p class="doc-note"><strong>No cloud sells these.</strong> ${esc(UNBUYABLE[band.id])}</p>`
    : "";
  return `      <section class="doc-section">
        <h2 class="doc-h" id="stack-${band.id}">${esc(band.label)}</h2>
        <p class="doc-note">${esc(band.desc || "")}</p>${unbuyable}
${blocks.join("\n")}
      </section>`;
}

const sections = BANDS.map(bandSection).filter(Boolean);
const coveredPatterns = patterns.filter((p) => sources.has(p.id)).length;

const legend = `      <section class="doc-section" id="stack-legend">
        <div class="prose">
          <p>Every pattern in the knowledge base has a row. Where a cloud sells the pattern
          ready-made, the cells name the product and the small line under the pattern links the
          capability row those products come from.</p>
          <p><strong>A dash means this index records no product</strong> — either none exists,
          because the pattern is code you write rather than a service you rent, or the mapping
          has not been authored yet. A dash is a gap in the index, not a claim about the market.</p>
        </div>
      </section>`;

const html = `<!doctype html>
<!-- kb:generated — the whole page. Emitted by scripts/build-stack-page.mjs; edit that, not this. -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>From Pattern to Product · Map</title>
  <meta name="description" content="Every pattern in the knowledge base against the cloud service that sells it — AWS, Azure, Google Cloud and the open-source alternative, derived from the capability pages.">
  <link rel="stylesheet" href="../assets/kb-page.css">
  <!-- data-profile="stack" loads only theme.js pre-paint, no lens.js: copied cells are
       stripped of level tags, so the page carries no leveled prose and the reading-level
       toggle would render three dead buttons -->
  <script src="../assets/kb.js" data-profile="stack"></script>
</head>
<body class="doc theme">
  <main class="doc-wrap">
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="../index.html">Atlas</a>
      <span class="sep">▸</span>
      <span aria-current="page">From Pattern to Product</span>
    </nav>

    <header class="doc-head">
      <p class="doc-kicker">Map · Buying the pattern</p>
      <h1 class="doc-title">From Pattern to Product</h1>
      <p class="doc-essence">All ${patterns.length} patterns in one index: the pattern, and what AWS, Azure, Google Cloud and the open-source world each call it. ${coveredPatterns} of them are sold ready-made by a cloud; the cells for those are the capability pages' own cells, copied. The rest carry a dash, which records a gap in this index rather than a verdict on the market.</p>
      <div class="doc-metarow">
        <span class="badge">Derived</span>
        <span class="badge muted">${rowCount} rows</span>
        <span class="badge muted">${coveredPatterns} of ${patterns.length} patterns mapped</span>
      </div>
    </header>

${legend}

${sections.join("\n\n")}

    <nav class="docnav" aria-label="Navigation">
      <a class="prev" href="graph.html">← Interactive Graph</a>
      <a class="up" href="../index.html">↑ The Atlas</a>
      <a class="next" href="../vocab.html">Vocabulary →</a>
    </nav>
  </main>
</body>
</html>
`;

if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== html) { console.error("map/stack.html is STALE — run: node scripts/build-stack-page.mjs"); process.exit(1); }
  console.log("map/stack.html is up to date.");
} else {
  writeAtomic(OUT, html);
  console.log(`site/map/stack.html written: ${rowCount} rows across ${sections.length} bands — ${mappedCount} mapped, ${partialCount} capability-linked, ${gapCount} gaps.`);
}
