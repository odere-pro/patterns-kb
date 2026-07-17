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
import { dirname, join } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const graph = JSON.parse(readFileSync(join(ROOT, "site", "assets", "graph.json"), "utf8"));

const problems = [];
let pages = 0;

for (const node of Object.values(graph.nodes)) {
  const rel = `${node.dir}/${node.id}.html`;
  const file = join(ROOT, "site", rel);
  if (!existsSync(file)) { problems.push(`MISSING FILE: ${rel}`); continue; }
  pages++;

  const root = parse(readFileSync(file, "utf8"));
  const rendered = new Set(
    root
      .querySelectorAll("[data-kb-rel]")
      .map((i) => `${i.getAttribute("data-kb-rel")} -> ${i.getAttribute("data-kb-to")}`),
  );
  const expected = new Set(node.relations.map((r) => `${r.type} -> ${r.to}`));

  for (const e of expected) if (!rendered.has(e)) problems.push(`MISSING on ${rel}: ${e}`);
  for (const r of rendered) if (!expected.has(r)) problems.push(`UNEXPECTED on ${rel}: ${r}`);
}

console.log(`Checked ${pages} pages' relationship sections against graph.json.`);
if (problems.length) {
  console.error(`\n${problems.length} discrepancy(ies) found.`);
  for (const p of problems.slice(0, 25)) console.error("  " + p);
  process.exit(1);
}
console.log("All rendered relationships match the graph.");
