#!/usr/bin/env node
/* build-vocab.mjs — emits site/vocab.html, the KB's own ontology.
 *
 * Every kb: term used in the pages' JSON-LD resolves to a fragment on this page, and so
 * does every data-kb-* attribute an author writes — audit-vocab.mjs proves both. Follow
 * the namespace and you land on the definition.
 *
 * A pure function of lib/model.mjs and lib/cli-spec.mjs: the ontology and the prose
 * describing it are the same thing, so a term cannot be added to the toolchain without its
 * description landing here. Nothing is read from the corpus, which is why the page does not
 * churn when a page lands — and why no section can carry a usage count.
 *
 * Every vocabulary renders through ONE row component, `.vocab-item`. That is not only for
 * consistency: site/assets/vocab.js builds the A-Z view by RELOCATING these nodes into a
 * single sorted list, which a <tr> cannot survive. Three invariants hold that up:
 *
 *   1. A `.vocab-list` contains NOTHING but `.vocab-item` children. vocab.js snapshots
 *      each list at load and restores from the snapshot, so authored order (editorial for
 *      the verbs, semantic for the blocks) survives the round trip.
 *   2. Ids ship in the HTML, never injected. audit-vocab.mjs regex-scrapes `id="` off the
 *      file on disk, and `kb:kind` dereferences to vocab.html#kind.
 *   3. The page has NO element with class `controls`. search.js mounts on `.controls` and
 *      would bind a second Cmd+K and try to filter hub tiles that do not exist here; with
 *      no such element its mount() early-returns and only `window.KB_MATCHES` is exposed,
 *      which is exactly what vocab.js wants from it. Do not add one.
 *
 * Run:  node scripts/build-vocab.mjs   (add --check to fail if vocab.html is stale)
 */
import { readFileSync, existsSync } from "node:fs";
import { writeAtomic } from "./lib/atomic.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  RELATION_TYPES, BLOCKS, OPTIONAL_BLOCKS, BLOCK_DESC, JSONLD_PROPS, ATTRIBUTES, TAGS, TAG_DESC,
  KINDS, POLARITIES, SKETCH_LANGS, BANDS, LEVELS, LEVEL_LABELS, VOCAB_NS, KB_NAME, esc,
} from "./lib/model.mjs";
import { CLI_COMMANDS, CLI_GLOBAL_FLAGS } from "./lib/cli-spec.mjs";

/* KB_ROOT lets the smoke tests emit into a fixture corpus, so audit-vocab.mjs can be
 * tested against a vocab.html it is allowed to break; normal runs resolve the repo from
 * this file's own location. The page's content does not depend on the corpus either way. */
const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site", "vocab.html");

let termCount = 0;

/* The one row component.
 *
 *   id      the fragment. BARE for the four families audit-vocab.mjs checks by name —
 *           the 17 verbs, the 7 JSON-LD properties, the 3 levels, and `data-kb-*` for the
 *           22 attributes. PREFIXED for everything else, because the sets collide: five
 *           tag ids are also band ids (caching, concurrency, messaging, security, testing).
 *   sort    the BARE term, lowercased. Without it every attribute sorts under "d" and the
 *           A-Z view is useless.
 *   type    the disambiguating label, rendered as the first chip and read by the filter.
 *           Sort keys collide across families — `kind`, `band`, `group`, `role` and `level`
 *           are each both a property and something else.
 *   home    the owning section, so vocab.js can restore and can hide emptied sections.
 *   chips   short facts worth scanning: a scope, a shape, an owning block.
 *   desc    interpolated RAW — descriptions carry <code>/<strong>/<a> by design. Labels
 *           and anything derived from an id go through esc().
 */
function term({ id, display, sort, type, home, chips = [], desc }) {
  termCount++;
  const meta = chips.length
    ? `<span class="vocab-meta">${chips.map((c) => `<span class="vocab-chip">${c}</span>`).join("")}</span>`
    : "";
  return `            <div class="vocab-item" id="${id}" data-vocab-sort="${esc(sort)}" data-vocab-type="${esc(type)}" data-vocab-home="${home}">`
    + `<a class="vocab-term" href="#${id}">${esc(display)}</a>`
    + `<span class="vocab-type">${esc(type)}</span>${meta}`
    + `<span class="vocab-desc">${desc}</span></div>`;
}

const list = (rows) => `        <div class="vocab-list">\n${rows.join("\n")}\n        </div>`;

/* ---- 2. kinds ---- */
const kindRows = KINDS.map(([k, desc]) =>
  term({ id: `kind-${k}`, display: k, sort: k, type: "page kind", home: "kinds",
    chips: [`${BLOCKS[k].length} blocks`], desc }));

/* ---- 3. blocks ----
 * Which kinds carry a block is a fact the reader wants and the tables above only imply,
 * so it becomes the chip. `?` means the block is optional on every kind that has it. */
const blockKinds = new Map();
for (const [kind, blocks] of Object.entries(BLOCKS)) {
  for (const b of blocks) {
    if (!blockKinds.has(b)) blockKinds.set(b, []);
    blockKinds.get(b).push(kind);
  }
}
const blockRows = Object.keys(BLOCK_DESC).map((b) => {
  const kinds = blockKinds.get(b) ?? [];
  const optional = kinds.length > 0 && kinds.every((k) => OPTIONAL_BLOCKS[k]?.has(b));
  return term({ id: `block-${b}`, display: b, sort: b, type: "block", home: "blocks",
    chips: [kinds.length === Object.keys(BLOCKS).length ? "every kind" : kinds.join(", "),
      ...(optional ? ["optional"] : [])],
    desc: BLOCK_DESC[b] });
});

/* The skeleton table stays: the glosses say what each block answers, the table says which
 * blocks a kind carries and in what order, and neither substitutes for the other. */
const skeletonRows = Object.entries(BLOCKS).map(([kind, blocks]) => {
  const opt = OPTIONAL_BLOCKS[kind] ?? new Set();
  const cells = blocks.map((b) => `<a href="#block-${b}"><code>${b}</code></a>${opt.has(b) ? "<sup>?</sup>" : ""}`).join(" · ");
  return `            <tr><td><a href="#kind-${kind}"><code>${kind}</code></a></td><td>${cells}</td></tr>`;
}).join("\n");

/* ---- 4. attributes ---- */
const SCOPE_LABEL = { root: "Page root", section: "Section", element: "Element" };
const attrRows = ATTRIBUTES.map((a) =>
  term({ id: `data-kb-${a.name}`, display: `data-kb-${a.name}`, sort: a.name, type: "attribute",
    home: "attributes",
    chips: [SCOPE_LABEL[a.scope], a.required ? "Required" : "Optional", `<code>${a.shape}</code>`],
    desc: a.desc }));

/* ---- 5. polarities ---- */
const polarityRows = POLARITIES.map((x) =>
  term({ id: `polarity-${x.name}`, display: x.name, sort: x.name, type: "polarity",
    home: "polarities", chips: [`<a href="#block-${x.block}"><code>${x.block}</code></a>`],
    desc: x.desc }));

/* ---- 6. levels ---- */
const LEVEL_DESC = [
  "A short, complete page in the register of a cloud-provider doc. Everything untagged is here, and this is what a reader new to the topic gets end to end.",
  "Basic plus enough detail to run a system design — the mechanics, the second-order tradeoffs, the sequence diagram.",
  "Basic plus advanced plus the deep dives: limitations, cost bills, and the sharp edges you only meet in production.",
];
const levelRows = LEVELS.map((l, i) =>
  term({ id: l, display: LEVEL_LABELS[l], sort: l, type: "reading level", home: "levels",
    desc: LEVEL_DESC[i] }));

/* ---- 7. relation verbs ---- */
const relRows = Object.entries(RELATION_TYPES).map(([type, d]) => {
  const pairing = d.symmetric
    ? "Symmetric — it means the same read from either end."
    : `Paired with <a href="#${d.inverse}">kb:${d.inverse}</a>.`;
  return term({ id: type, display: `kb:${type}`, sort: type, type: "relation verb",
    home: "relations", chips: [esc(d.label), ...(d.symmetric ? ["symmetric"] : [])],
    desc: `${d.desc} ${pairing}` });
});

/* ---- 8. JSON-LD properties ---- */
const propRows = JSONLD_PROPS.map(([p, desc]) =>
  term({ id: p, display: `kb:${p}`, sort: p, type: "JSON-LD property", home: "properties", desc }));

/* ---- 9. bands ---- */
const bandRows = BANDS.map((b) =>
  term({ id: `band-${b.id}`, display: b.id, sort: b.id, type: "band", home: "bands",
    chips: [b.kind === "elevation" ? `Elevation ${b.numeral}` : "Lens", esc(b.label)],
    desc: `${esc(b.desc)}. Pages live in <code>site/patterns/${b.id}/</code>.` }));

/* ---- 10. groups ----
 * Only the SUBDIVIDED bands contribute. Eleven of the twenty group ids equal their band id
 * and carry `label: null`, meaning "this band is not subdivided" — rendering those would
 * put #band-caching and #group-caching on the page describing the same thing. */
const labelledGroups = BANDS.flatMap((b) => b.groups.filter((g) => g.label).map((g) => ({ ...g, band: b })));
const groupRows = labelledGroups.map((g) =>
  term({ id: `group-${g.id}`, display: g.id, sort: g.id, type: "group", home: "groups",
    chips: [`<a href="#band-${g.band.id}"><code>${g.band.id}</code></a>`, esc(g.label)],
    desc: `The &ldquo;${esc(g.label)}&rdquo; subdivision of <a href="#band-${g.band.id}">${esc(g.band.label)}</a>.`
      + (g.dir
        ? ` Its pages sit in <code>site/patterns/${g.band.id}/${g.dir}/</code> rather than a folder of its own — the subsection was split without moving the files.`
        : ` Its pages sit in <code>site/patterns/${g.band.id}/${g.id.replace(`${g.band.id}-`, "")}/</code>.`) }));

/* ---- 11. tags ---- */
const tagRows = [...TAGS].map((t) =>
  term({ id: `tag-${t}`, display: t, sort: t, type: "tag", home: "tags", desc: TAG_DESC[t] }));

/* ---- 12. sketch languages ---- */
const langRows = SKETCH_LANGS.map((l) =>
  term({ id: `lang-${l.id}`, display: l.id, sort: l.id, type: "sketch language", home: "langs",
    chips: [esc(l.label)], desc: l.desc }));

/* ---- 13. the CLI ----
 * The one vocabulary that is not page metadata. It earns its place because it is what an
 * agent actually types, and lib/cli-spec.mjs is its single source — kb.mjs prints its own
 * usage from the same entries, so the two cannot drift. */
const cmdRows = CLI_COMMANDS.map((c) =>
  term({ id: `cmd-${c.name}`, display: `kb.mjs ${c.name}`, sort: c.name, type: "command",
    home: "cli",
    chips: [c.group === "read" ? "reads" : "writes", ...c.flags.map((f) => `<code>${esc(f.flag)}</code>`)],
    desc: c.desc + (c.note ? ` ${c.note}` : "") }));
const globalFlagRows = CLI_GLOBAL_FLAGS.map((f) =>
  `<code>${esc(f.flag)}</code> — ${f.desc}`).join("; ");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vocabulary · Patterns</title>
  <meta name="description" content="The ${KB_NAME} ontology — the page kinds, blocks, attributes, relation verbs, bands, tags and reading levels every page describes itself with, plus the kb.mjs commands that read and write them.">
  <link rel="stylesheet" href="assets/kb-page.css">
  <!-- data-profile="vocab" loads theme.js then vocab.js pre-paint, not deferred — vocab.js
       stamps the stored mode on <html> before first paint, so a reader who left in A-Z
       does not watch the grouped view reflow away. -->
  <script src="assets/kb.js" data-profile="vocab"></script>
</head>
<body class="doc">
  <main class="doc-wrap">
    <nav class="crumb" aria-label="Breadcrumb">
      <a href="index.html">Atlas</a>
      <span class="sep">▸</span>
      <span aria-current="page">Vocabulary</span>
    </nav>

    <header class="doc-head">
      <p class="doc-kicker">Reference</p>
      <h1 class="doc-title">Vocabulary</h1>
      <p class="doc-essence">Every page in this knowledge base describes itself in machine-readable terms, and every tool that reads it speaks the same set. This is what those terms mean. The namespace is <code>${VOCAB_NS}</code> — each term below is the fragment it resolves to.</p>
      <div class="doc-metarow">
        <span class="badge">Ontology</span>
        <span class="badge muted">${termCount} terms</span>
        <span class="badge muted">${Object.keys(RELATION_TYPES).length} relation verbs</span>
        <span class="badge muted">${ATTRIBUTES.length} attributes</span>
        <span class="badge muted">${TAGS.size} tags</span>
      </div>
    </header>

    <!-- vocab.js mounts the mode toggle and the filter here. NOT class="controls" — see
         the header comment in scripts/build-vocab.mjs. -->
    <div class="vocab-controls" id="vocab-controls"></div>
    <div class="vocab-az" id="vocab-az"></div>

    <section class="doc-section vocab-section" id="how" aria-labelledby="h-how">
      <h2 class="doc-h" id="h-how">How a page describes itself</h2>
      <div class="prose">
        <p>Data lives in <code>data-kb-*</code> attributes; <code>class</code> is presentation and carries no meaning. The two never touch, so restyling cannot damage knowledge and re-authoring prose cannot damage structure.</p>
        <p>A page carries metadata at three levels. The <strong>root</strong> declares identity and the facts that apply to the whole page. Each <strong>section</strong> declares which block it is, and its <code>id</code> is the same string, so the anchor and the semantic key never drift apart. Individual <strong>elements</strong> declare their own facts — a relationship, which side of a trade-off they argue, the reading level they appear from. <a href="#attributes">Every attribute is listed below</a>, with where it goes and what it holds.</p>
        <p>The <code>&lt;script type="application/ld+json"&gt;</code> block in every page's <code>&lt;head&gt;</code> is projected from those attributes. It is generated, never hand-written — which is what keeps it honest. <code>make check</code> fails if any term it emits has no definition on this page.</p>
        <p>Read this page either way: <strong>grouped</strong> by topic, or as one <strong>A–Z</strong> index of all ${termCount} terms. The filter narrows both, and searches the rest of the knowledge base at the same time. Press <kbd>/</kbd> or <kbd>⌘K</kbd> to reach it.</p>
      </div>
    </section>

    <section class="doc-section vocab-section" id="kinds" aria-labelledby="h-kinds">
      <h2 class="doc-h" id="h-kinds">Page kinds</h2>
      <div class="prose">
        <p>Seven kinds, and the choice decides two things at once: which <a href="#blocks">blocks</a> the page must carry, and which folder it lives in. A page's kind never changes after it is written — a pattern that turns out to be a hazard is a new page, not a retyped one.</p>
      </div>
${list(kindRows)}
    </section>

    <section class="doc-section vocab-section" id="blocks" aria-labelledby="h-blocks">
      <h2 class="doc-h" id="h-blocks">Blocks</h2>
      <div class="prose">
        <p>Each kind of page carries the same blocks in the same order, so the same question is answered in the same place on every page — and a reader can fetch one block instead of a whole document. Every kind extends one skeleton: it opens with <code>description</code> and closes with <code>relationships</code>, and only the middle is kind-specific. A block marked <sup>?</sup> is optional, and a page may honestly leave it out; every other block is mandatory and <code>make check</code> fails on a missing, unknown or out-of-order one.</p>
      </div>
      <div class="table-scroll">
        <table class="decision">
          <thead><tr><th>Kind</th><th>Blocks, in order</th></tr></thead>
          <tbody>
${skeletonRows}
          </tbody>
        </table>
      </div>
      <div class="prose">
        <p>The table says which blocks a kind carries. What each one answers:</p>
      </div>
${list(blockRows)}
    </section>

    <section class="doc-section vocab-section" id="attributes" aria-labelledby="h-attr">
      <h2 class="doc-h" id="h-attr">Authored attributes</h2>
      <div class="prose">
        <p>What an author writes, by hand or through <code>kb.mjs</code>. Distinct from the <a href="#properties">JSON-LD properties</a>: those are what a page <strong>emits</strong>, these are what someone <strong>wrote</strong>. A <code>json-array</code> shape is JSON-valued because its contents are whole sentences, and a comma-delimited attribute would break on the first comma in the prose. <code>make check</code> fails if the corpus carries an attribute missing from this list.</p>
      </div>
${list(attrRows)}
    </section>

    <section class="doc-section vocab-section" id="polarities" aria-labelledby="h-pol">
      <h2 class="doc-h" id="h-pol">Polarity values</h2>
      <div class="prose">
        <p>Three blocks argue from more than one side, and <a href="#data-kb-polarity"><code>data-kb-polarity</code></a> says which side an item is on. It is what lets a reader ask for the case against something without reading the case for it, and what puts the two in separate columns.</p>
        <p>A closed set of eight. <code>kb.mjs validate</code> rejects anything outside it as the page is written, rather than letting a typo ship as a silently unstyled item.</p>
      </div>
${list(polarityRows)}
    </section>

    <section class="doc-section vocab-section" id="levels" aria-labelledby="h-levels">
      <h2 class="doc-h" id="h-levels">Reading levels</h2>
      <div class="prose">
        <p>A closed vocabulary of three, and the lenses are <strong>cumulative</strong>: a higher one never replaces what a lower one said, it adds under the same headings. Every block shows at every lens — the skeleton never changes, the depth adapts inside it. Nothing may render empty at any lens, which is what forces at least one basic-visible item into every list.</p>
        <p>Two attributes carry a level, and an element may use only one of them. <a href="#data-kb-level"><code>data-kb-level</code></a> means <strong>visible from this level up</strong>, and is the default tool; untagged content is the basic core everyone sees. <a href="#data-kb-register"><code>data-kb-register</code></a> means <strong>rendered at exactly this lens, replacing the simpler version</strong>, and is rare — reach for it only where showing both at once would be wrong.</p>
      </div>
${list(levelRows)}
    </section>

    <section class="doc-section vocab-section" id="relations" aria-labelledby="h-rel">
      <h2 class="doc-h" id="h-rel">Relation verbs</h2>
      <div class="prose">
        <p>A closed vocabulary. Every relationship is declared on both pages it joins, and <code>make check</code> fails on any that is one-way, dangling, or contradictory. Schema.org has nothing this precise — <code>isRelatedTo</code> is the closest and says almost nothing — so these are the KB's own.</p>
        <p>Each description reads from the side the edge is authored on. Two verbs render under a label that does not echo their id, and say so.</p>
      </div>
${list(relRows)}
    </section>

    <section class="doc-section vocab-section" id="properties" aria-labelledby="h-prop">
      <h2 class="doc-h" id="h-prop">JSON-LD properties</h2>
      <div class="prose">
        <p>Beyond the relation verbs, these are the <code>kb:</code> terms a page's JSON-LD emits. The list is complete: <code>make check</code> reads every page's structured data and fails on any term that does not resolve to a fragment here. Three of them are projected rather than authored — <code>kb:note</code> comes from a relationship's own note, and <code>kb:in-theme</code> and <code>kb:tours</code> are the two directions of theme membership.</p>
      </div>
${list(propRows)}
    </section>

    <section class="doc-section vocab-section" id="bands" aria-labelledby="h-bands">
      <h2 class="doc-h" id="h-bands">Bands</h2>
      <div class="prose">
        <p>Thirteen: four <strong>elevation</strong> rungs, numbered I to IV, which are a ladder from a single object up to a network of services; and nine <strong>lenses</strong>, which cut across that ladder rather than sitting on it. A band is also a folder — a page whose <a href="#data-kb-band"><code>data-kb-band</code></a> disagrees with its path fails the build.</p>
      </div>
${list(bandRows)}
    </section>

    <section class="doc-section vocab-section" id="groups" aria-labelledby="h-groups">
      <h2 class="doc-h" id="h-groups">Groups</h2>
      <div class="prose">
        <p>A group subdivides a band. Only two bands are subdivided, so only these nine groups have names; in every other band the group id equals the band id and no heading renders, which is the encoding of &ldquo;this band is not subdivided&rdquo;. Two groups carry a folder alias, because splitting an oversized subsection in two was worth 27 attribute edits and not worth moving 27 files and every relative link into them.</p>
      </div>
${list(groupRows)}
    </section>

    <section class="doc-section vocab-section" id="tags" aria-labelledby="h-tags">
      <h2 class="doc-h" id="h-tags">Tags</h2>
      <div class="prose">
        <p>A closed vocabulary, like the relation verbs, and for the same reason: a tag used on one page groups nothing. The first sweep of this KB was written by eighteen agents with no shared list and produced 280 tags, 154 of them used exactly once. These are what consolidating them yielded.</p>
        <p>Three rules, all enforced by <code>make check</code>: every tag on a page comes from this set; every page carries two to five of them; every tag here is used on three or more pages. Adding one is deliberate — put it in the set first, and only if it will honestly apply to three pages that already exist.</p>
      </div>
${list(tagRows)}
    </section>

    <section class="doc-section vocab-section" id="langs" aria-labelledby="h-langs">
      <h2 class="doc-h" id="h-langs">Sketch languages</h2>
      <div class="prose">
        <p><a href="#data-kb-lang"><code>data-kb-lang</code></a> on a code sketch selects the highlighter. Nine, because nine is what the corpus uses — the set is closed against the corpus rather than aspirational, and <code>make check</code> fails on a member no page uses as well as on a page using a member that is not here.</p>
      </div>
${list(langRows)}
    </section>

    <!-- The eleventh vocabulary, and the only OPEN one. It gets prose and no rows on
         purpose: the table is ~490 keys, it is authored against the corpus, and its stamp
         moves whenever a bridge lands — rendering any of it would make this page churn and
         would smuggle a usage count onto a page that is a pure function of the model.
         A prose-only .vocab-section is an established shape here; #how is the other one. -->
    <section class="doc-section vocab-section" id="expansion" aria-labelledby="h-expansion">
      <h2 class="doc-h" id="h-expansion">Search expansion</h2>
      <div class="prose">
        <p>Every vocabulary above is <strong>closed</strong>: a value outside the set fails the build. One more is not, and it is the reason a search for a word this knowledge base never uses can still find the right page. A <strong>bridge</strong> maps a word a reader types to one or more words the corpus actually says — <code>resiliency</code> to <code>resilience</code>, <code>qps</code> to <code>throughput</code>. Both scorers substring-match, so a word the corpus already contains retrieves itself; a bridge pays only where the reader's word and the corpus's word differ.</p>
        <p>Two layers, and the curated one wins outright. <code>SYNONYMS</code> in <code>scripts/lib/model.mjs</code> is hand-written and small; <code>scripts/data/expansion-synonyms.json</code> is the authored bulk. A key in both takes the curated value whole, so any target only the table names is dead. Expansion hits score at <strong>half weight</strong>, which keeps the author's own vocabulary winning ties.</p>
        <p>Structure is enforced even though the vocabulary is open: a key is a lowercase word of three or more letters and not a stopword, it carries one to four targets, every target is a word the corpus really uses, and no target may contain its own key. <code>make check</code> fails on any of those. The two rules a machine cannot check are the author's — do not bridge to a word so common it reaches a tenth of the corpus, and do not add a bridge nobody would type. Growing or retiring the table is the <code>kb-vocab</code> skill.</p>
      </div>
    </section>

    <section class="doc-section vocab-section" id="cli" aria-labelledby="h-cli">
      <h2 class="doc-h" id="h-cli">The reader and writer</h2>
      <div class="prose">
        <p>The one vocabulary here that is not page metadata: <code>scripts/kb.mjs</code>, which is how anything reads or writes this knowledge base without opening the HTML. The corpus runs to millions of tokens and over half of any page is markup, so a grounded answer costs a couple of thousand tokens through these commands instead of hundreds of thousands.</p>
        <p>Reading is safe; writing goes through the validated writers so the data stays well-formed, and <code>wild</code>, <code>production</code> and <code>explain</code> each replace their whole block. Two flags apply everywhere: ${globalFlagRows}.</p>
      </div>
${list(cmdRows)}
    </section>

    <nav class="docnav" aria-label="Document navigation">
      <a class="prev" href="map/stack.html">← Pattern → product</a>
      <a class="up" href="index.html">↑ The Atlas</a>
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
  console.log(`vocab.html written: ${termCount} terms across ${KINDS.length} kinds, ${Object.keys(BLOCK_DESC).length} blocks, ${ATTRIBUTES.length} attributes, ${POLARITIES.length} polarities, ${LEVELS.length} levels, ${Object.keys(RELATION_TYPES).length} verbs, ${JSONLD_PROPS.length} properties, ${BANDS.length} bands, ${labelledGroups.length} groups, ${TAGS.size} tags, ${SKETCH_LANGS.length} languages and ${CLI_COMMANDS.length} commands.`);
}
