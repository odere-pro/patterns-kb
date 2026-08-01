#!/usr/bin/env node
/* build-stack-page.mjs — AUTHORING-TIME tool. Emits site/map/stack.html: the flat
 * pattern-to-product index. DERIVED — never hand-edit the output.
 *
 * The join: every `implements` edge runs from a capability (or comparison) page to a
 * pattern. When the capability-side rel-item carries `data-kb-maps="mapping-row-N"`,
 * build.mjs has already validated the row id and projected it into graph.json, and this
 * page copies that row's service cells verbatim (links included — site/map/ and
 * site/capabilities/ sit at the same depth, so ../ hrefs resolve unchanged). An edge
 * without the annotation degrades to em-dash cells linking the capability's whole table.
 * data-kb-level attributes are stripped from copied cells: this page is a flat index,
 * every row shows at every lens.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";
import { CAPABILITY_ORDER, COMPARISON_ORDER, esc } from "./lib/model.mjs";

const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const OUT = join(SITE, "map", "stack.html");

const graph = JSON.parse(readFileSync(join(SITE, "assets", "graph.json"), "utf8"));
const N = graph.nodes;

/* Cells of one mapping/matrix row, as inner HTML with lens attributes stripped.
 * Cell 0 is the row's own label (the sub-capability); cells 1..n are the services. */
function rowCells(pageNode, rowId) {
  const root = parse(readFileSync(join(SITE, pageNode.path), "utf8"));
  const row = root.querySelector(`#${rowId}`);
  if (!row) return null;
  return row.querySelectorAll("td").map((td) => td.innerHTML.trim());
}

/* Column count of a capability's mapping table follows its header; older tables carry
 * four columns until the Open source sweep reaches them, so short rows pad with —. */
const DASH = "—";
const SERVICE_COLS = 4; // AWS, Azure, Google Cloud, Open source

function capabilitySection(capId) {
  const cap = N[capId];
  const impls = cap.relations.filter((r) => r.type === "implements" && N[r.to]);
  if (!impls.length) return "";
  const rows = impls.map((r) => {
    const p = N[r.to];
    const patternCell = `<a href="../${p.path}">${esc(p.name)}</a>`;
    let via = `<a href="../${cap.path}#mapping">all of ${esc(cap.name)}</a>`;
    let cells = Array(SERVICE_COLS).fill(`<a href="../${cap.path}#mapping">${DASH}</a>`);
    if (r.maps) {
      const c = rowCells(cap, r.maps);
      if (c && c.length) {
        via = c[0];
        cells = c.slice(1, 1 + SERVICE_COLS);
        while (cells.length < SERVICE_COLS) cells.push(DASH);
      }
    }
    return `            <tr><td>${patternCell}</td><td>${via}</td>${cells.map((x) => `<td>${x}</td>`).join("")}</tr>`;
  });
  return `      <section class="doc-section">
        <h2 class="doc-h" id="stack-${capId}"><a href="../${cap.path}">${esc(cap.name)}</a></h2>
        <div class="table-scroll">
          <table class="decision">
            <thead>
              <tr><th>Pattern</th><th>As</th><th>AWS</th><th>Azure</th><th>Google Cloud</th><th>Open source</th></tr>
            </thead>
            <tbody>
${rows.join("\n")}
            </tbody>
          </table>
        </div>
      </section>`;
}

function comparisonRows() {
  const out = [];
  for (const id of COMPARISON_ORDER) {
    const cmp = N[id];
    if (!cmp) continue;
    for (const r of cmp.relations.filter((x) => x.type === "implements" && N[x.to])) {
      const p = N[r.to];
      out.push(`            <tr><td><a href="../${p.path}">${esc(p.name)}</a></td><td><a href="../${cmp.path}">${esc(cmp.name)}</a></td><td>${esc(r.note || "")}</td></tr>`);
    }
  }
  return out;
}

const sections = CAPABILITY_ORDER.filter((id) => N[id]).map(capabilitySection).filter(Boolean);
const cmpRows = comparisonRows();
const comparisonSection = cmpRows.length ? `      <section class="doc-section">
        <h2 class="doc-h" id="stack-comparisons">Compared in depth</h2>
        <div class="prose">
          <p>Where a pattern's products deserve more than a table cell, a comparison page argues the choice — managed services and open-source contenders side by side.</p>
        </div>
        <div class="table-scroll">
          <table class="decision">
            <thead>
              <tr><th>Pattern</th><th>Comparison</th><th>Why it belongs there</th></tr>
            </thead>
            <tbody>
${cmpRows.join("\n")}
            </tbody>
          </table>
        </div>
      </section>` : "";

const totalRows = sections.length ? CAPABILITY_ORDER.filter((id) => N[id])
  .reduce((n, id) => n + N[id].relations.filter((r) => r.type === "implements" && N[r.to]).length, 0) : 0;

const html = `<!doctype html>
<!-- kb:generated — the whole page. Emitted by scripts/build-stack-page.mjs; edit that, not this. -->
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>From Pattern to Product · Map</title>
  <meta name="description" content="The flat index from software pattern to the cloud service that sells it — AWS, Azure, Google Cloud and the open-source alternative, one row per pattern, derived from the capability pages.">
  <link rel="stylesheet" href="../assets/tokens.css">
  <link rel="stylesheet" href="../assets/pattern.css">
  <script src="../assets/theme.js"></script>
  <!-- no lens.js: copied cells are stripped of level tags, so the page carries no
       leveled prose and the reading-level toggle would render three dead buttons -->
</head>
<body class="doc theme">
  <main class="doc-wrap">
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="../index.html">Map</a>
      <span class="sep">▸</span>
      <span aria-current="page">From Pattern to Product</span>
    </nav>

    <header class="doc-head">
      <p class="doc-kicker">Map · Buying the pattern</p>
      <h1 class="doc-title">From Pattern to Product</h1>
      <p class="doc-essence">${totalRows} patterns the cloud sells ready-made, in one flat table: the pattern, the capability that packages it, and what AWS, Azure, Google Cloud and the open-source world each call it. Derived from the capability pages' own mapping tables — the cells here are those cells. Where the row shows only a dash, the pattern's capability page holds the whole picture one click away.</p>
      <div class="doc-metarow">
        <span class="badge">Derived</span>
        <span class="badge muted">${totalRows} rows</span>
      </div>
    </header>

${sections.join("\n\n")}

${comparisonSection}

    <nav class="docnav" aria-label="Navigation">
      <a class="prev" href="graph.html">← Interactive Graph</a>
      <a class="up" href="../index.html">↑ The Map</a>
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
  writeFileSync(OUT, html);
  console.log(`site/map/stack.html written: ${totalRows} pattern rows across ${sections.length} capabilities.`);
}
