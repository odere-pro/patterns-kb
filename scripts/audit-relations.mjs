#!/usr/bin/env node
/* audit-relations.mjs — cross-checks every authored page's rendered "How it relates" /
 * "Mitigated by" / "Prevents" links against the graph's own computed relations for that
 * node. Catches: fabricated links not in the spec, missing links the spec expected, and
 * label/grouping mismatches. This is what would have caught the service-locator<->god-object
 * backwards edge automatically. Exit 1 on any discrepancy. */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const graph = JSON.parse(readFileSync(join(SITE, "assets", "graph.json"), "utf8"));
const N = graph.nodes;

function expectedByLabel(node) {
  const m = {};
  // Stub neighbors (href === null) are rendered as plain text by design — don't require
  // them to appear as a checkable id, since they never had a linkable id to begin with.
  for (const r of node.relations) { if (r.href) (m[r.label] ||= new Set()).add(r.to); }
  return m;
}

// Parse <div class="rel-group"><p class="rel-type">LABEL</p><div class="rel-list">...items...</div></div>
// Each item: <div class="rel-item"><a href="X">Name</a>...</div> or plain (no <a>, for stub neighbors).
function parseRendered(html) {
  const out = {};
  const groupRe = /<div class="rel-group">\s*<p class="rel-type">([^<]+)<\/p>\s*<div class="rel-list">([\s\S]*?)<\/div>\s*<\/div>/g;
  let g;
  while ((g = groupRe.exec(html))) {
    const label = g[1].trim();
    const body = g[2];
    const itemRe = /<div class="rel-item">\s*(?:<a href="([^"]+)">([^<]+)<\/a>|<span>([^<]+)<\/span>)/g;
    let it;
    const ids = new Set();
    while ((it = itemRe.exec(body))) {
      const href = it[1];
      if (href) {
        const id = href.split("/").pop().replace(".html", "");
        ids.add(id);
      }
      // plain-text stub items (no href) are intentionally not id-checked
    }
    out[label] = ids;
  }
  return out;
}

let problems = 0, pagesChecked = 0;

for (const [id, node] of Object.entries(N)) {
  const file = join(SITE, node.dir, `${id}.html`);
  if (!existsSync(file)) { console.error(`MISSING FILE: ${node.dir}/${id}.html`); problems++; continue; }
  const html = readFileSync(file, "utf8");
  const expected = expectedByLabel(node);
  const rendered = parseRendered(html);
  pagesChecked++;

  for (const [label, expIds] of Object.entries(expected)) {
    const gotIds = rendered[label] || new Set();
    for (const eid of expIds) {
      if (!gotIds.has(eid)) {
        console.error(`MISSING on ${node.dir}/${id}.html: expected "${label}" -> ${eid}`);
        problems++;
      }
    }
  }
  for (const [label, gotIds] of Object.entries(rendered)) {
    const expIds = expected[label] || new Set();
    for (const gid of gotIds) {
      if (!expIds.has(gid)) {
        // Could be a legitimate link the author added beyond the spec (e.g. in prose).
        // Only flag if gid is a real node — a fabricated relation to something that exists
        // but wasn't authorized by the graph is the dangerous case (like the reversed edge).
        if (N[gid]) {
          console.error(`UNEXPECTED on ${node.dir}/${id}.html: rendered "${label}" -> ${gid} (not in graph for this node)`);
          problems++;
        }
      }
    }
  }
}

console.log(`Checked ${pagesChecked} pages' relationship sections against graph.json.`);
if (problems) {
  console.error(`\n${problems} discrepancy(ies) found.`);
  process.exit(1);
}
console.log("All rendered relationships match the graph exactly.");
