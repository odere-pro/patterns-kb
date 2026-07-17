#!/usr/bin/env node
/* build-pages.mjs — refreshes the generated regions inside each page.
 *
 * Two regions, both derived from what the page already says, so neither can disagree
 * with it:
 *   - element-level ids + data-kb-polarity on trade-off / usage / variation items,
 *     which give every claim a stable citation target (…#tradeoffs-con-2) and let a
 *     reader pull one item instead of a whole page.
 *   - a JSON-LD block in <head>, projected from the data-kb-* attributes. It is never
 *     hand-written; that is what keeps it honest.
 *
 * Everything else on the page is authored. Run: node scripts/build-pages.mjs [--check]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";
import { VOCAB_NS, KB_NAME } from "./lib/model.mjs";
import { blockProblems } from "./lib/validate.mjs";

/* The parser drops HTML comments unless told otherwise, which would silently delete
 * the kb:generated markers (and any comment an author writes). */
const PARSE_OPTS = { comment: true };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const CHECK = process.argv.includes("--check");
const graph = JSON.parse(readFileSync(join(SITE, "assets", "graph.json"), "utf8"));

const MARK = "kb:generated — derived from data-kb-*; edit the page, not this";
/* Which item lists get stable ids, keyed by the block they live in. */
const ITEMS = [
  { block: "tradeoffs", sel: ".col.pros li", polarity: "pro" },
  { block: "tradeoffs", sel: ".col.cons li", polarity: "con" },
  { block: "usage", sel: ".when li", polarity: "when" },
  { block: "usage", sel: ".avoid li", polarity: "avoid" },
  { block: "variations", sel: "dl.variations dt", polarity: null },
  { block: "production", sel: ".prod-knobs li", polarity: "knob" },
  { block: "production", sel: ".prod-signals li", polarity: "signal" },
  { block: "production", sel: ".prod-failures li", polarity: "failure" },
  { block: "production", sel: ".prod-checklist li", polarity: "check" },
];

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
  // schema.org has nothing with the precision of a 13-verb ontology (isRelatedTo is the
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

let changed = 0, stale = [], idsStamped = 0;
const problems = [];

for (const node of Object.values(graph.nodes)) {
  const file = join(SITE, node.path);
  const src = readFileSync(file, "utf8");
  const root = parse(src, PARSE_OPTS);

  /* ---- block vocabulary lint (shared with kb.mjs validate) ---- */
  const present = root.querySelectorAll("[data-kb-block]").map((s) => s.getAttribute("data-kb-block"));
  for (const msg of blockProblems(present, node.kind)) problems.push(`${node.id}: ${msg}`);

  /* ---- element-level ids ---- */
  for (const { block, sel, polarity } of ITEMS) {
    const sec = root.querySelector(`[data-kb-block="${block}"]`);
    if (!sec) continue;
    sec.querySelectorAll(sel).forEach((el, i) => {
      el.setAttribute("id", `${block}-${polarity ?? "item"}-${i + 1}`);
      if (polarity) el.setAttribute("data-kb-polarity", polarity);
      idsStamped++;
    });
  }

  /* ---- JSON-LD ---- */
  const block = `  <!-- ${MARK} -->\n  <script type="application/ld+json">\n${JSON.stringify(jsonLdFor(node), null, 2)}\n  </script>\n`;
  let out = root.toString();
  const existing = /  <!-- kb:generated[^>]*-->\n  <script type="application\/ld\+json">[\s\S]*?<\/script>\n/;
  out = existing.test(out)
    ? out.replace(existing, block)
    : out.replace("</head>", block + "</head>");

  if (out !== src) {
    if (CHECK) stale.push(node.path);
    else { writeFileSync(file, out); changed++; }
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
  console.log(`pages refreshed: ${changed} written, ${idsStamped} element ids stamped.`);
}
