#!/usr/bin/env node
/* build-graph-page.mjs — AUTHORING-TIME tool. Emits site/map/graph.html: a readable
 * overview of the relationship web from graph.json — a relation-type legend, one mermaid
 * cluster per theme (theme + its member patterns), and a "most connected" index. A single
 * all-nodes graph (146 and counting) would be an unreadable hairball, so we show
 * meaningful clusters instead. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { THEME_ORDER, esc } from "./lib/model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const graph = JSON.parse(readFileSync(join(ROOT, "site", "assets", "graph.json"), "utf8"));
const N = graph.nodes;
const mid = (id) => "n_" + id.replace(/-/g, "_");

// From a page in site/map/, a sibling subpage is ../<dir>/<id>.html
const pageHref = (id) => `../${N[id].path}`;

function themeCluster(themeId) {
  const t = N[themeId];
  const members = t.memberPatterns.filter((m) => m.href); // skip stubs
  const lines = [`flowchart LR`, `    ${mid(themeId)}(["${esc(t.name)}"])`];
  for (const m of members) {
    lines.push(`    ${mid(m.id)}["${esc(m.name)}"]`);
    lines.push(`    ${mid(themeId)} --- ${mid(m.id)}`);
    lines.push(`    click ${mid(m.id)} "${pageHref(m.id)}"`);
  }
  lines.push(`    click ${mid(themeId)} "../themes/${themeId}.html"`);
  return lines.join("\n");
}

function themeSection(themeId) {
  const t = N[themeId];
  return `      <section class="doc-section">
        <h2 class="doc-h"><a href="../themes/${themeId}.html" style="color:inherit;text-decoration:none">${esc(t.name)}</a></h2>
        <p class="prose">${esc(t.essence)}.</p>
        <figure class="diagram">
          <pre class="mermaid">
${themeCluster(themeId)}
          </pre>
          <figcaption>${esc(t.name)} and the patterns that implement it — click any node to open its page.</figcaption>
        </figure>
      </section>`;
}

// relation-type legend
const legend = Object.entries(graph.relationTypes)
  .filter(([, d]) => d.symmetric || d.inverse) // all of them, but list symmetric once + directional pairs
  .map(([type, d]) => `          <div class="rel-item"><a href="#" onclick="return false" style="cursor:default">${esc(d.label)}</a><span class="rel-note">${d.symmetric ? "symmetric" : "paired with “" + esc(graph.relationTypes[d.inverse].label) + "”"}</span></div>`)
  .join("\n");

// most-connected patterns
const ranked = Object.values(N)
  .filter((n) => n.kind === "pattern")
  .map((n) => ({ id: n.id, name: n.name, path: n.path, deg: n.relations.length }))
  .sort((a, b) => b.deg - a.deg)
  .slice(0, 12);
const rankedHtml = ranked
  .map((r) => `          <div class="rel-item"><a href="../${r.path}">${esc(r.name)}</a><span class="rel-note">${r.deg} connections</span></div>`)
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Relationship Graph · Map</title>
  <meta name="description" content="An overview of how the patterns relate — one cluster per systems-fluency theme, plus the relationship vocabulary.">
  <link rel="stylesheet" href="../assets/tokens.css">
  <link rel="stylesheet" href="../assets/pattern.css">
  <script src="../assets/theme.js"></script>
</head>
<body class="doc theme">
  <main class="doc-wrap">
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="../index.html">Map</a>
      <span class="sep">▸</span>
      <span aria-current="page">Relationship Graph</span>
    </nav>

    <header class="doc-head">
      <p class="doc-kicker">Map · The whole web</p>
      <h1 class="doc-title">Relationship Graph</h1>
      <p class="doc-essence">${graph.meta.patterns} patterns, ${graph.meta.hazards} hazards, and ${graph.meta.themes} themes, wired by ${graph.meta.renderedRelations} bidirectional relationships. Shown as one readable cluster per theme rather than a single hairball.</p>
      <div class="doc-metarow">
        <span class="badge">Overview</span>
        <span class="badge muted">${graph.meta.relationships} relationships</span>
      </div>
    </header>

    <section class="doc-section">
      <h2 class="doc-h">Relationship vocabulary</h2>
      <div class="rel-group"><div class="rel-list">
${legend}
      </div></div>
    </section>

${THEME_ORDER.map(themeSection).join("\n\n")}

    <section class="doc-section">
      <h2 class="doc-h">Most connected patterns</h2>
      <div class="rel-group"><div class="rel-list">
${rankedHtml}
      </div></div>
    </section>

    <nav class="docnav" aria-label="Navigation">
      <a class="prev" href="../index.html">← The Map</a>
      <a class="up" href="../index.html">↑ The Map</a>
      <a class="next" href="../themes/cap-theorem.html">Themes →</a>
    </nav>
  </main>

  <script src="../assets/vendor/mermaid.min.js"></script>
  <script src="../assets/diagram.js"></script>
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
console.log("site/map/graph.html written.");
}
