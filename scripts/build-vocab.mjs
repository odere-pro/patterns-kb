#!/usr/bin/env node
/* build-vocab.mjs — emits site/vocab.html, the KB's own ontology.
 *
 * Every kb: term used in the pages' JSON-LD resolves to a fragment on this page, so the
 * vocabulary documents itself: follow the namespace and you land on the definition.
 * Generated from lib/model.mjs, so the ontology and the prose describing it are the
 * same thing.
 *
 * Run:  node scripts/build-vocab.mjs   (add --check to fail if vocab.html is stale)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { RELATION_TYPES, BLOCKS, VOCAB_NS, KB_NAME, esc } from "./lib/model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site", "vocab.html");

/* The kb: properties the pages emit, beyond the relation verbs. */
const PROPS = [
  ["kind", "Which of the five page kinds this is — <code>pattern</code>, <code>hazard</code>, <code>theme</code>, <code>principle</code>, or <code>design</code> (a worked case study)."],
  ["band", "The elevation band or lens the pattern belongs to. Also its folder."],
  ["group", "The subdivision within a band, where one exists. Also its folder."],
  ["note", "Why two things relate, from <em>this</em> side. Each side may phrase it its own way."],
  ["role", "What a pattern does in the service of one particular theme."],
  ["in-theme", "A theme whose tour visits this pattern. The inverse of <code>kb:tours</code>."],
  ["tours", "A pattern this theme's tour visits. The inverse of <code>kb:in-theme</code>."],
  ["polarity", "Which side of a two-sided block an item sits on — <code>pro</code>/<code>con</code>, <code>when</code>/<code>avoid</code>."],
];

const relRows = Object.entries(RELATION_TYPES).map(([type, d]) => {
  const pairing = d.symmetric
    ? `<span class="rel-note">symmetric — it means the same read from either end</span>`
    : `<span class="rel-note">paired with <a href="#${d.inverse}">kb:${d.inverse}</a></span>`;
  return `          <div class="rel-item" id="${type}"><a href="#${type}" style="text-decoration:none">kb:${type}</a><span class="rel-note"><strong>${esc(d.label)}</strong> · ${pairing.replace(/<\/?span[^>]*>/g, "")}</span></div>`;
}).join("\n");

const propRows = PROPS.map(([p, desc]) =>
  `          <div class="rel-item" id="${p}"><a href="#${p}" style="text-decoration:none">kb:${p}</a><span class="rel-note">${desc}</span></div>`,
).join("\n");

const blockRows = Object.entries(BLOCKS).map(([kind, blocks]) =>
  `            <tr><td><code>${kind}</code></td><td>${blocks.map((b) => `<code>${b}</code>`).join(" · ")}</td></tr>`,
).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vocabulary · Patterns</title>
  <meta name="description" content="The ${KB_NAME} ontology — the relation verbs, metadata properties, and block vocabulary that every page is described with.">
  <link rel="stylesheet" href="assets/tokens.css">
  <link rel="stylesheet" href="assets/pattern.css">
  <script src="assets/theme.js"></script>
</head>
<body class="doc">
  <main class="doc-wrap">
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="index.html">Map</a>
      <span class="crumb-sep">▸</span>
      <span aria-current="page">Vocabulary</span>
    </nav>

    <header class="doc-head">
      <p class="doc-kicker">Reference</p>
      <h1 class="doc-title">Vocabulary</h1>
      <p class="doc-essence">Every page in this knowledge base describes itself in machine-readable terms. This is what those terms mean. The namespace is <code>${VOCAB_NS}</code> — each term below is the fragment it resolves to.</p>
      <div class="doc-metarow">
        <span class="badge">Ontology</span>
        <span class="badge muted">${Object.keys(RELATION_TYPES).length} relation verbs</span>
      </div>
    </header>

    <section class="doc-section" id="how" aria-labelledby="h-how">
      <h2 class="doc-h" id="h-how">How a page describes itself</h2>
      <div class="prose">
        <p>Data lives in <code>data-kb-*</code> attributes; <code>class</code> is presentation and carries no meaning. The two never touch, so restyling cannot damage knowledge and re-authoring prose cannot damage structure.</p>
        <p>A page carries metadata at three levels: the document root declares identity (<code>data-kb-id</code>, <code>kind</code>, <code>band</code>, <code>group</code>, <code>essence</code>); each <code>&lt;section&gt;</code> declares its block (<code>data-kb-block</code>, whose <code>id</code> is both anchor and semantic key); and individual items declare their own facts — a relationship (<code>data-kb-rel</code> / <code>data-kb-to</code>) or which side of a trade-off they argue (<code>data-kb-polarity</code>).</p>
        <p>The <code>&lt;script type="application/ld+json"&gt;</code> block in every page's <code>&lt;head&gt;</code> is projected from those attributes. It is generated, never hand-written — which is what keeps it honest.</p>
      </div>
    </section>

    <section class="doc-section" id="relations" aria-labelledby="h-rel">
      <h2 class="doc-h" id="h-rel">Relation verbs</h2>
      <div class="prose">
        <p>A closed vocabulary. Every relationship is declared on <em>both</em> pages it joins, and <code>make check</code> fails on any that is one-way, dangling, or contradictory. Schema.org has nothing this precise — <code>isRelatedTo</code> is the closest and says almost nothing — so these are the KB's own.</p>
      </div>
      <div class="rel-group">
        <div class="rel-list">
${relRows}
        </div>
      </div>
    </section>

    <section class="doc-section" id="properties" aria-labelledby="h-prop">
      <h2 class="doc-h" id="h-prop">Properties</h2>
      <div class="rel-group">
        <div class="rel-list">
${propRows}
        </div>
      </div>
    </section>

    <section class="doc-section" id="blocks" aria-labelledby="h-blocks">
      <h2 class="doc-h" id="h-blocks">Block vocabulary</h2>
      <div class="prose">
        <p>Each kind of page carries a fixed set of blocks in a fixed order, so the same question is answered in the same place on every page — and a reader can fetch one block instead of a whole document.</p>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Kind</th><th>Blocks, in order</th></tr></thead>
          <tbody>
${blockRows}
          </tbody>
        </table>
      </div>
    </section>

    <nav class="docnav" aria-label="Document navigation">
      <a class="docnav-up" href="index.html">↑ The Elevation Map</a>
      <a class="docnav-next" href="map/graph.html">Relationship graph →</a>
    </nav>
  </main>
</body>
</html>
`;

if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== html) { console.error("vocab.html is STALE — run: node scripts/build-vocab.mjs"); process.exit(1); }
  console.log("vocab.html is up to date.");
} else {
  writeFileSync(OUT, html);
  console.log(`vocab.html written: ${Object.keys(RELATION_TYPES).length} relation verbs + ${PROPS.length} properties.`);
}
