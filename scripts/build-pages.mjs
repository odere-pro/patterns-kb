#!/usr/bin/env node
/* build-pages.mjs — refreshes the generated regions inside each page.
 *
 * Four regions, all derived from what the page already says, so none can disagree
 * with it:
 *   - element-level ids + data-kb-polarity on trade-off / usage / variation items,
 *     which give every claim a stable citation target (…#tradeoffs-con-2) and let a
 *     reader pull one item instead of a whole page.
 *   - section-level data-kb-level, stamped from the BLOCK_LEVELS policy in
 *     lib/model.mjs (and removed where the policy no longer applies). Authored
 *     data-kb-level lives on finer elements only and is never touched here.
 *   - a JSON-LD block in <head>, projected from the data-kb-* attributes. It is never
 *     hand-written; that is what keeps it honest.
 *   - the <head> asset pair — one stylesheet link, one loader script — from PAGE_ASSETS
 *     in lib/model.mjs. Authored tags drifted into nine different shapes across the
 *     corpus and 53 pages had silently lost favourites.js; deriving the pair means a new
 *     kind is one line of taxonomy rather than a sweep, and the staleness gate below
 *     catches the next drift.
 *
 * Everything else on the page is authored. Run: node scripts/build-pages.mjs [--check]
 */
import { readFileSync } from "node:fs";
import { writeAtomic } from "./lib/atomic.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";
import { VOCAB_NS, KB_NAME, BLOCK_LEVELS, POLARITIES, PAGE_ASSETS, esc } from "./lib/model.mjs";
import { blockProblems, lensProblems } from "./lib/validate.mjs";

/* The parser drops HTML comments unless told otherwise, which would silently delete
 * the kb:generated markers (and any comment an author writes). */
const PARSE_OPTS = { comment: true };

/* KB_ROOT lets the smoke tests point the builder at a fixture corpus; normal runs
 * resolve the repo root from this file's own location. Same contract as build.mjs. */
const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const CHECK = process.argv.includes("--check");
const graph = JSON.parse(readFileSync(join(SITE, "assets", "graph.json"), "utf8"));

const MARK = "kb:generated — derived from data-kb-*; edit the page, not this";
const MENTIONS_MARK = "kb:generated — mentions; derived from other pages' prose links, edit the prose, not this";
const ASSETS_MARK = "kb:generated — page assets; edit PAGE_ASSETS in scripts/lib/model.mjs, not this";
/* The <head> asset pair — one stylesheet link, one loader script — matched WITH OR
 * WITHOUT the marker, so the first build absorbs whatever a page's authored head says
 * today (tokens.css + pattern.css + theme.js + lens.js, or any earlier shape still lying
 * around) instead of needing a migration script. Anchored on the JSON-LD comment that
 * always follows it once the JSON-LD step below has run, so a stylesheet or script
 * anywhere else on the page can never match — audit-assets.mjs enforces that there is
 * nowhere else for one to be. */
const HEAD_ASSETS_RE = new RegExp(
  "(?:[ \\t]*<!-- kb:generated — page assets[^\\n]*-->\\n)?" +
  "(?:[ \\t]*(?:<link rel=\"stylesheet\" href=\"[^\"]*\">|<script src=\"[^\"]*\"[^>]*></script>)\\n)+" +
  "(?=[ \\t]*<!-- kb:generated[^>]*-->\\n[ \\t]*<script type=\"application/ld\\+json\">)",
);
/* The run of body-end <script src> tags this region used to occupy. Only STRIPPED now —
 * the pair above replaces it entirely — so a page migrating from the old shape converges
 * to the new one in a single `make all` with no separate migration step. Kept only until
 * every page in the corpus has rebuilt at least once; safe to delete after that. */
const OLD_BODY_SCRIPTS_RE = /\n(?:[ \t]*<!-- kb:generated — page scripts[^\n]*-->\n)?(?:[ \t]*<script src="[^"]*"><\/script>\n)+(?=[ \t]*<\/body>)/;
/* The whole region, leading newline included, so stripping it restores the page byte for
 * byte and a rebuild is idempotent. */
const MENTIONS_RE = /\n[ \t]*<!-- kb:generated — mentions[\s\S]*?<\/aside>\n/;
/* Which elements get stable ids, keyed by the block they live in. `idOf` mints the
 * id; rows with a natural key (a wild item's example slug, a tour step's member) are
 * reorder-proof, positional rows (list items, prose paragraphs) renumber on insert.
 * Every id is a citation anchor AND an address for `kb.mjs level` / `kb.mjs register`
 * — which is why prose paragraphs are here: per-level variants need addressable
 * paragraphs in every block, not just list items. */
const ITEMS = [
  { block: "tradeoffs", sel: ".col.pros li", polarity: "pro" },
  { block: "tradeoffs", sel: ".col.cons li", polarity: "con" },
  { block: "usage", sel: ".when li", polarity: "when" },
  { block: "usage", sel: ".avoid li", polarity: "avoid" },
  { block: "variations", sel: "dl.variations dt", polarity: null },
  /* A capability page's taxonomy reuses the variations card shape, so it mints the same
   * way. The mapping table's rows are addressed so a long-tail row can be moved up a lens
   * — a <tr> is the only thing in that block a lens could sensibly hide. */
  { block: "capabilities", sel: "dl.variations dt", polarity: null },
  { block: "mapping", sel: "tbody tr", idOf: (_el, i) => `mapping-row-${i + 1}` },
  /* A comparison page mints the same two shapes: contender cards like a taxonomy,
   * matrix rows like a mapping table. */
  { block: "contenders", sel: "dl.variations dt", polarity: null },
  { block: "matrix", sel: "tbody tr", idOf: (_el, i) => `matrix-row-${i + 1}` },
  { block: "production", sel: ".prod-knobs li", polarity: "knob" },
  { block: "production", sel: ".prod-signals li", polarity: "signal" },
  { block: "production", sel: ".prod-failures li", polarity: "failure" },
  { block: "production", sel: ".prod-checklist li", polarity: "check" },
  { block: "wild", sel: ".wild-item", idOf: (el) => keyed("wild", el.getAttribute("data-kb-example")) },
  { block: "tour", sel: ".tour-step", idOf: (el) => keyed("tour", el.getAttribute("data-kb-member")) },
  /* A tour step's own paragraph, addressed apart from the step: a theme's basic lens
   * keeps the step NAMES and drops the role prose, and tagging `tour-<member>` would
   * take the name with it. */
  { block: "tour", sel: ".tour-step p", idOf: (_el, i) => `tour-p-${i + 1}` },
  { block: "fluency", sel: ".fluency-item", idOf: (el) => keyed("fluency", el.getAttribute("data-kb-theme")) },
  /* siblings reuses the fluency-item markup but carries no data-kb-theme, so the keyed
   * scheme mints nothing for it; these are positional. */
  { block: "siblings", sel: ".fluency-item", idOf: (_el, i) => `siblings-item-${i + 1}` },
  { block: "deepdives", sel: ".prose > h3", idOf: (_el, i) => `deepdives-dive-${i + 1}` },
  { block: "sketch", sel: "details.sketch", idOf: (_el, i) => `sketch-variant-${i + 1}` },
  /* A design's requirements live in .functional / .nonfunctional lists rather than in
   * .prose, so the generic list rule below never reaches them and every FR and NFR was
   * unaddressable — the one block a lens could not move. Top-level rows only: an NFR's
   * nested sub-list travels with the row that owns it, and pages that want a sub-item
   * addressed give it a keyed id by hand (youtube's requirements-nfr-scale-2).
   *
   * Each selector carries TWO shapes, because the corpus holds both and neither is wrong.
   * FRs are a numbered <ol> on most pages and a <ul> where the page does not cite its own
   * requirements by number. An NFR is a <li> with a bold lead on most pages, and on the
   * persona pair a `.nfr` section — a rank-4 title over its points — which is why the
   * legacy selector stays anchored at `.nonfunctional > ul > li`: inside a `.nfr` the
   * points sit one level deeper, so a section's bullets can never be mistaken for rows.
   * A page mixing the two numbers in document order, which is the only sane reading. */
  { block: "requirements", sel: ".functional ol > li, .functional ul > li", idOf: (_el, i) => `requirements-fr-${i + 1}` },
  { block: "requirements", sel: ".nonfunctional > ul > li, .nonfunctional > .nfr > h4", idOf: (_el, i) => `requirements-nfr-${i + 1}` },
];
/* This table is the ONLY writer of data-kb-polarity — the attribute is projected from the
 * column an item sits in, not hand-written — so these eight literals and the POLARITIES
 * vocabulary published on vocab.html are the same closed set said twice. Held together
 * here rather than in a checker, because the failure is a value the ontology has never
 * heard of appearing on 600 pages in one build. */
{
  const stamped = [...new Set(ITEMS.map((i) => i.polarity).filter(Boolean))].sort();
  const declared = POLARITIES.map((p) => p.name).sort();
  if (JSON.stringify(stamped) !== JSON.stringify(declared)) {
    console.error(`polarity drift: build-pages stamps [${stamped}] but POLARITIES declares [${declared}] — reconcile scripts/lib/model.mjs and the ITEMS table above.`);
    process.exit(1);
  }
}
const keyed = (block, key) => (key ? `${block}-${key}` : null);
/* Prose paragraphs in ANY block: <block>-p-N. Applied generically after ITEMS. */
const PROSE_P = ".prose > p";

/** Path from one page to another, site-relative in, page-relative out. */
const hop = (fromPath, toPath) => {
  const r = relative(dirname(fromPath), toPath);
  return r.startsWith(".") ? r : "./" + r;
};

function jsonLdFor(node) {
  const ld = {
    "@context": { "@vocab": "https://schema.org/", kb: VOCAB_NS },
    "@type": "DefinedTerm",
    "@id": `#${node.id}`,
    identifier: node.id,
    name: node.name,
    description: node.essence,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: KB_NAME,
      "@id": hop(node.path, "vocab.html"),
    },
    "kb:kind": node.kind,
    "kb:band": node.band,
    "kb:group": node.group,
  };
  // schema.org has nothing with the precision of a 17-verb ontology (isRelatedTo is the
  // closest and means almost nothing), so relations use the KB vocabulary.
  for (const r of node.relations) {
    const term = `kb:${r.type}`;
    (ld[term] ||= []).push({
      // A stub has no page and therefore no identifier. Minting one under the vocabulary
      // namespace would claim it is a term in the ontology, which it is not.
      ...(r.href ? { "@id": `${hop(node.path, r.href)}#${r.to}` } : {}),
      name: r.name,
      ...(r.note ? { "kb:note": r.note } : {}),
    });
  }
  for (const t of node.themes) {
    (ld["kb:in-theme"] ||= []).push({
      "@id": `${hop(node.path, t.href)}#${t.id}`, name: t.name, "kb:role": t.role,
    });
  }
  for (const m of node.memberPatterns) {
    (ld["kb:tours"] ||= []).push({
      ...(m.href ? { "@id": `${hop(node.path, m.href)}#${m.id}` } : {}),
      name: m.name, "kb:role": m.role,
    });
  }
  return ld;
}

/* "Mentioned by": the pages that link here in prose without declaring a typed relation.
 * build.mjs derives both directions into graph.json; this renders the inbound half back
 * onto the target page, because a mention is a real connection its own page could not
 * otherwise show. Nothing here carries data-kb-* — these links are the OUTPUT of the
 * derivation, and PROSE_LINK_EXCLUDE keeps them out of its input. Returns "" when a page
 * has none, which is what removes a region that no longer applies. */
function mentionsFor(node) {
  const from = (node.mentionedBy ?? [])
    .map((id) => graph.nodes[id])
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (!from.length) return "";
  const items = from.map((m) =>
    `        <li class="mention-item"><a href="${hop(node.path, m.path)}">${esc(m.name)}</a>` +
    `<span class="mention-kind">${m.kind}</span></li>`).join("\n");
  return `    <!-- ${MENTIONS_MARK} -->
    <aside class="mentions" id="mentioned-by" aria-labelledby="h-mentions">
      <h2 class="mentions-h" id="h-mentions">Mentioned by</h2>
      <p class="mentions-lead">These pages link here from their prose without declaring a typed relationship.</p>
      <ul class="mention-list">
${items}
      </ul>
    </aside>

`;
}

/* The <head> asset pair for one page, at the ../ depth its own path implies — the same
 * `hop` the JSON-LD writer uses, because a design one level down and a pattern three levels
 * down need different prefixes and the site must work from file:// with no server to
 * resolve an absolute path. An unknown kind throws rather than emitting nothing: a page
 * silently stripped of every control is far worse than a red build. */
function headAssetsFor(node) {
  const a = PAGE_ASSETS[node.kind];
  if (!a) throw new Error(`${node.id}: kind "${node.kind}" has no PAGE_ASSETS entry — add one in scripts/lib/model.mjs`);
  const css = `  <link rel="stylesheet" href="${hop(node.path, `assets/${a.css}`)}">\n`;
  const script = `  <script src="${hop(node.path, "assets/kb.js")}" data-profile="${a.profile}"></script>\n`;
  return `  <!-- ${ASSETS_MARK} -->\n${css}${script}`;
}

let changed = 0, stale = [], idsStamped = 0, levelsStamped = 0, mentionsRendered = 0, assetsRendered = 0;
const problems = [];

for (const node of Object.values(graph.nodes)) {
  const file = join(SITE, node.path);
  const src = readFileSync(file, "utf8");
  const root = parse(src, PARSE_OPTS);

  /* ---- block vocabulary + lens-mechanics lint (shared with kb.mjs validate) ---- */
  const present = root.querySelectorAll("[data-kb-block]").map((s) => s.getAttribute("data-kb-block"));
  for (const msg of blockProblems(present, node.kind)) problems.push(`${node.id}: ${msg}`);
  for (const msg of lensProblems(root)) problems.push(`${node.id}: ${msg}`);

  /* ---- element-level ids ---- */
  for (const { block, sel, polarity, idOf } of ITEMS) {
    const sec = root.querySelector(`[data-kb-block="${block}"]`);
    if (!sec) continue;
    sec.querySelectorAll(sel).forEach((el, i) => {
      const id = idOf ? idOf(el, i) : `${block}-${polarity ?? "item"}-${i + 1}`;
      if (!id) return;
      el.setAttribute("id", id);
      if (polarity) el.setAttribute("data-kb-polarity", polarity);
      idsStamped++;
    });
  }

  /* ---- variations dt→dd lens mirroring ----
   * A variation is a dt/dd pair but only the dt carries the minted id, so a lens
   * attribute authored on the dt would hide the label and orphan the body. Mirror
   * the dt's attribute onto its dd (generated, self-cleaning) so the pair moves
   * together at every lens. A capability page's `capabilities` block reuses the same card
   * shape and needs the same mirroring, so the selector matches on the markup rather than
   * on one block name. */
  for (const dt of root.querySelectorAll("dl.variations dt")) {
    let dd = dt.nextElementSibling;
    if (!dd || dd.tagName?.toLowerCase() !== "dd") continue;
    for (const attr of ["data-kb-level", "data-kb-register"]) {
      const v = dt.getAttribute(attr);
      if (v) dd.setAttribute(attr, v);
      else if (dd.getAttribute(attr) != null) dd.removeAttribute(attr);
    }
  }

  /* ---- prose ids: <block>-p-N on paragraphs, <block>-li-N on plain list items,
   *      <block>-fig-N on diagrams ----
   * These make prose addressable, which per-level register variants and accretion
   * tags need (`kb.mjs register|level <id> <element-id> <level>`). Plain-list ids
   * cover the kinds whose content lives in .prose lists (hazard causes/cost,
   * principle applying…) — the ITEMS table above wins for its own
   * blocks because those lists are not inside .prose. Positional — inserting an
   * element renumbers its successors, so re-run this before tagging. */
  for (const sec of root.querySelectorAll("[data-kb-block]")) {
    const b = sec.getAttribute("data-kb-block");
    if (b === "explain") continue; // the ladder's items are the addresses there
    sec.querySelectorAll(PROSE_P).forEach((el, i) => {
      el.setAttribute("id", `${b}-p-${i + 1}`);
      idsStamped++;
    });
    sec.querySelectorAll(".prose li").forEach((el, i) => {
      el.setAttribute("id", `${b}-li-${i + 1}`);
      idsStamped++;
    });
    /* Figures are lens-tagged like any other element — an implementation pattern's
     * structure opens with the basic-visible topology walk and follows it with the
     * sequence diagram at advanced — so they need addresses too. */
    sec.querySelectorAll("figure.diagram").forEach((el, i) => {
      el.setAttribute("id", `${b}-fig-${i + 1}`);
      idsStamped++;
    });
    /* A collapsed sketch outside the dedicated `sketch` block — a design's HTTP
     * contract, a deep dive's code sample — is prose like any other and a lens has to
     * be able to move it. Without an address it renders at basic forever, so tagging
     * the dive around it leaves an orphan code block under a heading that is gone.
     * The ITEMS table owns the `sketch` block itself (sketch-variant-N). */
    if (b !== "sketch") {
      sec.querySelectorAll("details.sketch").forEach((el, i) => {
        el.setAttribute("id", `${b}-sketch-${i + 1}`);
        idsStamped++;
      });
    }
  }

  /* ---- reading-level stamps ----
   * Section-level data-kb-level is GENERATED from the BLOCK_LEVELS policy — retired
   * to an empty policy in 2026-08, so this loop now only CLEANS stale stamps.
   * Authored data-kb-level / data-kb-register live on finer elements only. */
  const policy = BLOCK_LEVELS[node.kind] ?? {};
  for (const sec of root.querySelectorAll("[data-kb-block]")) {
    const b = sec.getAttribute("data-kb-block");
    if (policy[b]) { sec.setAttribute("data-kb-level", policy[b]); levelsStamped++; }
    else if (sec.getAttribute("data-kb-level") != null) sec.removeAttribute("data-kb-level");
  }

  /* ---- explain-item ids: the ladder's citation anchors (…#explain-basic) ---- */
  const explainSec = root.querySelector('[data-kb-block="explain"]');
  if (explainSec) {
    explainSec.querySelectorAll(".explain-item").forEach((el) => {
      const lv = el.getAttribute("data-kb-register") || el.getAttribute("data-kb-level");
      if (lv) { el.setAttribute("id", `explain-${lv}`); idsStamped++; }
    });
  }

  /* ---- meta description: derived from data-kb-essence ----
   * The hand-written <meta name="description"> was a fourth restatement of the
   * essence; deriving it removes one member of the quartet corpus-wide. */
  const metaEl = root.querySelector('meta[name="description"]');
  if (metaEl) metaEl.setAttribute("content", `${node.name} — ${node.essence}`);

  /* ---- JSON-LD ---- */
  const block = `  <!-- ${MARK} -->\n  <script type="application/ld+json">\n${JSON.stringify(jsonLdFor(node), null, 2)}\n  </script>\n`;
  let out = root.toString();
  const existing = /  <!-- kb:generated[^>]*-->\n  <script type="application\/ld\+json">[\s\S]*?<\/script>\n/;
  out = existing.test(out)
    ? out.replace(existing, block)
    : out.replace("</head>", block + "</head>");

  /* ---- <head> asset pair ----
   * Runs after the JSON-LD step above, which guarantees `out` now carries exactly one
   * JSON-LD comment+script — the anchor HEAD_ASSETS_RE's lookahead requires. Replace the
   * run in place, or insert one directly ahead of that anchor on a page that has none. */
  const assets = headAssetsFor(node);
  out = HEAD_ASSETS_RE.test(out)
    ? out.replace(HEAD_ASSETS_RE, assets)
    : out.replace(/([ \t]*<!-- kb:generated[^>]*-->\n[ \t]*<script type="application\/ld\+json">)/, `${assets}$1`);
  assetsRendered++;

  /* ---- the old body-end script run: stripped, not replaced ----
   * The pair above supersedes it entirely, so a page still carrying the old run
   * (everything in the corpus, until its next rebuild) converges to the new shape in one
   * `make all` with nothing left dangling at the body end. */
  out = out.replace(OLD_BODY_SCRIPTS_RE, "\n");

  /* ---- "Mentioned by" ----
   * Strip first, then re-insert, so a page that lost its last mention loses the region
   * too. It goes last in <main> but ahead of the prev/next nav, which stays the final
   * word on the page; a fixture page with no nav falls back to the end of <main>. */
  const mentions = mentionsFor(node);
  out = out.replace(MENTIONS_RE, "");
  if (mentions) {
    const anchor = /\n([ \t]*<nav class="docnav")/.test(out)
      ? /\n([ \t]*<nav class="docnav")/
      : /\n([ \t]*<\/main>)/;
    out = out.replace(anchor, `\n${mentions}$1`);
    mentionsRendered++;
  }

  if (out !== src) {
    if (CHECK) stale.push(node.path);
    else { writeAtomic(file, out); changed++; }
  }
}

if (problems.length) {
  console.error(`${problems.length} block-vocabulary problem(s):`);
  for (const p of problems.slice(0, 20)) console.error("  " + p);
  process.exit(1);
}
if (CHECK) {
  if (stale.length) {
    console.error(`${stale.length} page(s) STALE — run: node scripts/build-pages.mjs`);
    for (const s of stale.slice(0, 10)) console.error("  " + s);
    process.exit(1);
  }
  console.log("pages are up to date.");
} else {
  console.log(`pages refreshed: ${changed} written, ${idsStamped} element ids + ${levelsStamped} level stamps, ` +
              `${mentionsRendered} "Mentioned by" list(s), ${assetsRendered} asset pair(s).`);
}
