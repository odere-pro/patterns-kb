#!/usr/bin/env node
/* build-vocab.mjs — emits site/vocab.html, the KB's own ontology.
 *
 * Every kb: term used in the pages' JSON-LD resolves to a fragment on this page, and so
 * does every data-kb-* attribute an author writes — audit-vocab.mjs proves both. Follow
 * the namespace and you land on the definition.
 *
 * A pure function of lib/model.mjs: the ontology and the prose describing it are the same
 * thing, so a term cannot be added to the toolchain without its description landing here.
 * Nothing is read from the corpus, which is why the page does not churn when a page lands.
 *
 * Run:  node scripts/build-vocab.mjs   (add --check to fail if vocab.html is stale)
 */
import { readFileSync, existsSync } from "node:fs";
import { writeAtomic } from "./lib/atomic.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  RELATION_TYPES, BLOCKS, OPTIONAL_BLOCKS, JSONLD_PROPS, ATTRIBUTES, TAGS,
  LEVELS, LEVEL_LABELS, VOCAB_NS, KB_NAME, esc,
} from "./lib/model.mjs";

/* KB_ROOT lets the smoke tests emit into a fixture corpus, so audit-vocab.mjs can be
 * tested against a vocab.html it is allowed to break; normal runs resolve the repo from
 * this file's own location. The page's content does not depend on the corpus either way. */
const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site", "vocab.html");

/* Descriptions carry <code>/<strong> markup by design, so they interpolate raw. Labels and
 * anything derived from an id are escaped. */
const relRows = Object.entries(RELATION_TYPES).map(([type, d]) => {
  const pairing = d.symmetric
    ? "Symmetric — it means the same read from either end."
    : `Paired with <a href="#${d.inverse}">kb:${d.inverse}</a>.`;
  return `          <div class="rel-item" id="${type}"><a href="#${type}" style="text-decoration:none">kb:${type}</a><span class="rel-note"><strong>${esc(d.label)}</strong> · ${d.desc} ${pairing}</span></div>`;
}).join("\n");

const propRows = JSONLD_PROPS.map(([p, desc]) =>
  `          <div class="rel-item" id="${p}"><a href="#${p}" style="text-decoration:none">kb:${p}</a><span class="rel-note">${desc}</span></div>`,
).join("\n");

const SCOPE_LABEL = { root: "Page root", section: "Section", element: "Element" };
const attrRows = ATTRIBUTES.map((a) =>
  `            <tr id="data-kb-${a.name}"><td><code>data-kb-${a.name}</code></td><td>${SCOPE_LABEL[a.scope]}</td><td>${a.required ? "Required" : "Optional"}</td><td><code>${a.shape}</code></td><td>${a.desc}</td></tr>`,
).join("\n");

const tagChips = [...TAGS].map((t) => `<code>${t}</code>`).join(" ");

const levelRows = LEVELS.map((l, i) => {
  const desc = [
    "A short, complete page in the register of a cloud-provider doc. Everything untagged is here, and this is what a reader new to the topic gets end to end.",
    "Basic plus enough detail to run a system design — the mechanics, the second-order tradeoffs, the sequence diagram.",
    "Basic plus advanced plus the deep dives: limitations, cost bills, and the sharp edges you only meet in production.",
  ][i];
  return `          <div class="rel-item" id="${l}"><a href="#${l}" style="text-decoration:none">${esc(LEVEL_LABELS[l])}</a><span class="rel-note">${desc}</span></div>`;
}).join("\n");

/* An optional block is marked rather than omitted: the reader needs to know the skeleton
 * is fixed AND which parts of it a page may honestly leave out. */
const blockRows = Object.entries(BLOCKS).map(([kind, blocks]) => {
  const opt = OPTIONAL_BLOCKS[kind] ?? new Set();
  const cells = blocks.map((b) => `<code>${b}</code>${opt.has(b) ? "<sup>?</sup>" : ""}`).join(" · ");
  return `            <tr><td><code>${kind}</code></td><td>${cells}</td></tr>`;
}).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vocabulary · Patterns</title>
  <meta name="description" content="The ${KB_NAME} ontology — the relation verbs, the JSON-LD properties, the authored data-kb-* attributes, and the closed tag, level and block vocabularies every page is described with.">
  <link rel="stylesheet" href="assets/tokens.css">
  <link rel="stylesheet" href="assets/pattern.css">
  <script src="assets/theme.js"></script>
  <script src="assets/lens.js"></script>
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
        <span class="badge muted">${ATTRIBUTES.length} attributes</span>
        <span class="badge muted">${TAGS.size} tags</span>
      </div>
    </header>

    <section class="doc-section" id="how" aria-labelledby="h-how">
      <h2 class="doc-h" id="h-how">How a page describes itself</h2>
      <div class="prose">
        <p>Data lives in <code>data-kb-*</code> attributes; <code>class</code> is presentation and carries no meaning. The two never touch, so restyling cannot damage knowledge and re-authoring prose cannot damage structure.</p>
        <p>A page carries metadata at three levels. The <strong>root</strong> declares identity and the facts that apply to the whole page. Each <strong>section</strong> declares which block it is, and its <code>id</code> is the same string, so the anchor and the semantic key never drift apart. Individual <strong>elements</strong> declare their own facts — a relationship, which side of a trade-off they argue, the reading level they appear from. <a href="#attributes">Every attribute is listed below</a>, with where it goes and what it holds.</p>
        <p>The <code>&lt;script type="application/ld+json"&gt;</code> block in every page's <code>&lt;head&gt;</code> is projected from those attributes. It is generated, never hand-written — which is what keeps it honest. <code>make check</code> fails if any term it emits has no definition on this page.</p>
      </div>
    </section>

    <section class="doc-section" id="relations" aria-labelledby="h-rel">
      <h2 class="doc-h" id="h-rel">Relation verbs</h2>
      <div class="prose">
        <p>A closed vocabulary. Every relationship is declared on both pages it joins, and <code>make check</code> fails on any that is one-way, dangling, or contradictory. Schema.org has nothing this precise — <code>isRelatedTo</code> is the closest and says almost nothing — so these are the KB's own.</p>
        <p>Each description reads from the side the edge is authored on. Two verbs render under a label that does not echo their id, and say so.</p>
      </div>
      <div class="rel-group">
        <div class="rel-list">
${relRows}
        </div>
      </div>
    </section>

    <section class="doc-section" id="properties" aria-labelledby="h-prop">
      <h2 class="doc-h" id="h-prop">JSON-LD properties</h2>
      <div class="prose">
        <p>Beyond the relation verbs, these are the <code>kb:</code> terms a page's JSON-LD emits. The list is complete: <code>make check</code> reads every page's structured data and fails on any term that does not resolve to a fragment here. Three of them are projected rather than authored — <code>kb:note</code> comes from a relationship's own note, and <code>kb:in-theme</code> and <code>kb:tours</code> are the two directions of theme membership.</p>
      </div>
      <div class="rel-group">
        <div class="rel-list">
${propRows}
        </div>
      </div>
    </section>

    <section class="doc-section" id="attributes" aria-labelledby="h-attr">
      <h2 class="doc-h" id="h-attr">Authored attributes</h2>
      <div class="prose">
        <p>What an author writes, by hand or through <code>kb.mjs</code>. Distinct from the properties above: those are what a page <strong>emits</strong>, these are what someone <strong>wrote</strong>. A <code>json-array</code> shape is JSON-valued because its contents are whole sentences, and a comma-delimited attribute would break on the first comma in the prose. <code>make check</code> fails if the corpus carries an attribute missing from this table.</p>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Attribute</th><th>Where</th><th>Required</th><th>Shape</th><th>Meaning</th></tr></thead>
          <tbody>
${attrRows}
          </tbody>
        </table>
      </div>
    </section>

    <section class="doc-section" id="tags" aria-labelledby="h-tags">
      <h2 class="doc-h" id="h-tags">Tags</h2>
      <div class="prose">
        <p>A closed vocabulary, like the relation verbs, and for the same reason: a tag used on one page groups nothing. The first sweep of this KB was written by eighteen agents with no shared list and produced 280 tags, 154 of them used exactly once. These are what consolidating them yielded.</p>
        <p>Three rules, all enforced by <code>make check</code>: every tag on a page comes from this set; every page carries two to five of them; every tag here is used on three or more pages. Adding one is deliberate — put it in the set first, and only if it will honestly apply to three pages that already exist.</p>
      </div>
      <div class="prose">
        <p>${tagChips}</p>
      </div>
    </section>

    <section class="doc-section" id="levels" aria-labelledby="h-levels">
      <h2 class="doc-h" id="h-levels">Reading levels</h2>
      <div class="prose">
        <p>A closed vocabulary of three, and the lenses are <strong>cumulative</strong>: a higher one never replaces what a lower one said, it adds under the same headings. Every block shows at every lens — the skeleton never changes, the depth adapts inside it. Nothing may render empty at any lens, which is what forces at least one basic-visible item into every list.</p>
        <p>Two attributes carry a level, and an element may use only one of them. <a href="#data-kb-level"><code>data-kb-level</code></a> means <strong>visible from this level up</strong>, and is the default tool; untagged content is the basic core everyone sees. <a href="#data-kb-register"><code>data-kb-register</code></a> means <strong>rendered at exactly this lens, replacing the simpler version</strong>, and is rare — reach for it only where showing both at once would be wrong.</p>
      </div>
      <div class="rel-group">
        <div class="rel-list">
${levelRows}
        </div>
      </div>
    </section>

    <section class="doc-section" id="blocks" aria-labelledby="h-blocks">
      <h2 class="doc-h" id="h-blocks">Block vocabulary</h2>
      <div class="prose">
        <p>Each kind of page carries the same blocks in the same order, so the same question is answered in the same place on every page — and a reader can fetch one block instead of a whole document. Every kind extends one skeleton: it opens with <code>description</code> and closes with <code>relationships</code>, and only the middle is kind-specific. A block marked <sup>?</sup> is optional, and a page may honestly leave it out; every other block is mandatory and <code>make check</code> fails on a missing, unknown or out-of-order one.</p>
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
      <a class="prev" href="map/stack.html">← Pattern → product</a>
      <a class="up" href="index.html">↑ The Elevation Map</a>
      <a class="next" href="map/graph.html">Relationship graph →</a>
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
  writeAtomic(OUT, html);
  console.log(`vocab.html written: ${Object.keys(RELATION_TYPES).length} relation verbs + ${JSONLD_PROPS.length} properties + ${ATTRIBUTES.length} attributes + ${TAGS.size} tags.`);
}
