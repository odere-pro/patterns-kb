#!/usr/bin/env node
/* audit-relations.mjs — cross-checks every authored page's declared relationships
 * against the graph's own computed relations for that node. Catches: fabricated links
 * not in the graph, missing links it expected, and type mismatches. This is what would
 * have caught the service-locator<->god-object backwards edge automatically.
 * Exit 1 on any discrepancy.
 *
 * Reads the data-kb-rel / data-kb-to attributes, not the rendered markup: the relation
 * is data, the surrounding div is presentation. The previous version regex-matched
 * `<div class="rel-item">` and went blind the moment an attribute was added to that div,
 * reporting every link as MISSING rather than failing loudly. Stub neighbours are
 * checkable now too — they carry an id even though they have no page to link to.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";

/* The parser drops HTML comments unless told otherwise, which would silently delete
 * the kb:generated markers (and any comment an author writes). */
const PARSE_OPTS = { comment: true };

/* KB_ROOT lets the smoke tests point the auditor at a fixture corpus; normal runs
 * resolve the repo from this file's own location. */
const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const graph = JSON.parse(readFileSync(join(ROOT, "site", "assets", "graph.json"), "utf8"));

const problems = [];
let pages = 0;

/* Theme membership is declared once, on the theme's tour step, and the pattern's own
 * "Where it shows up" block restates it by hand — the build projects membership into
 * graph.json and the JSON-LD, but never writes that block. So the two can drift, and a
 * pattern can quietly omit a theme that claims it. Collected here and compared after the
 * walk, because each half lives on a different page. */
const tourSteps = new Map(); // "pattern|theme" -> theme page path
const fluencyItems = new Map(); // "pattern|theme" -> pattern page path

for (const node of Object.values(graph.nodes)) {
  const rel = node.path;
  const file = join(ROOT, "site", rel);
  if (!existsSync(file)) { problems.push(`MISSING FILE: ${rel}`); continue; }
  pages++;

  const root = parse(readFileSync(file, "utf8"), PARSE_OPTS);
  const rendered = new Set(
    root
      .querySelectorAll("[data-kb-rel]")
      .map((i) => `${i.getAttribute("data-kb-rel")} -> ${i.getAttribute("data-kb-to")}`),
  );
  const expected = new Set(node.relations.map((r) => `${r.type} -> ${r.to}`));

  for (const e of expected) if (!rendered.has(e)) problems.push(`MISSING on ${rel}: ${e}`);
  for (const r of rendered) if (!expected.has(r)) problems.push(`UNEXPECTED on ${rel}: ${r}`);

  for (const step of root.querySelectorAll("[data-kb-member]"))
    tourSteps.set(`${step.getAttribute("data-kb-member")}|${node.id}`, rel);
  for (const item of root.querySelectorAll("[data-kb-theme]"))
    fluencyItems.set(`${node.id}|${item.getAttribute("data-kb-theme")}`, rel);
}

/* Presence must agree in both directions; wording need not. A tour role is terse by
 * design ("Keep the GPU busy") and the pattern's own line often extends it. */
for (const [key, themePath] of tourSteps) {
  const [pattern, theme] = key.split("|");
  if (!fluencyItems.has(key))
    problems.push(`TOUR WITHOUT FLUENCY: ${themePath} tours ${pattern}, but ${pattern} has no "${theme}" fluency item`);
}
for (const [key, patternPath] of fluencyItems) {
  const [pattern, theme] = key.split("|");
  if (!tourSteps.has(key))
    problems.push(`FLUENCY WITHOUT TOUR: ${patternPath} claims theme ${theme}, but that theme's tour does not list ${pattern}`);
}

console.log(`Checked ${pages} pages' relationship sections against graph.json.`);
console.log(`Checked ${tourSteps.size} tour steps against ${fluencyItems.size} fluency items.`);
if (problems.length) {
  console.error(`\n${problems.length} discrepancy(ies) found.`);
  for (const p of problems.slice(0, 25)) console.error("  " + p);
  process.exit(1);
}
console.log("All rendered relationships match the graph.");
