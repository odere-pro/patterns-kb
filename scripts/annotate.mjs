#!/usr/bin/env node
/* annotate.mjs — ONE-TIME migration. Delete once it has run.
 *
 * Stamps the data-kb-* layer onto every page, driven by site/assets/graph.json
 * (which is verified 1:1 against the pages and is therefore the oracle). After
 * this runs, the HTML carries the full structural truth and graph.json can be
 * derived FROM the pages instead of the other way round.
 *
 * Purely additive to the rendered output — attributes only, no visible change.
 * Two exceptions, both deliberate corpus fixes:
 *   - 52 rel-notes carry a stray trailing period the other 338 don't; normalized.
 *   - hazard section ids diverge across files; canonicalized to the vocabulary.
 *
 * Run:  node scripts/annotate.mjs [--dry]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");
const graph = JSON.parse(readFileSync(join(ROOT, "site", "assets", "graph.json"), "utf8"));

/* Hazard pages agree on headings but not on section ids. The heading is the
 * reliable key; map it to the canonical block name. */
const HAZARD_BLOCK_BY_HEADING = {
  "What it is": "description",
  "How it happens": "causes",
  "Why it hurts": "cost",
  "How to avoid it": "mitigation",
};

const stats = { pages: 0, sections: 0, rels: 0, notesNormalized: 0, idsFixed: 0, members: 0, fluency: 0 };
const problems = [];

for (const node of Object.values(graph.nodes)) {
  const file = join(ROOT, "site", node.dir, `${node.id}.html`);
  if (!existsSync(file)) { problems.push(`missing page: ${node.id}`); continue; }
  const src = readFileSync(file, "utf8");
  const root = parse(src);

  /* ---- page level ---- */
  const doc = root.querySelector("main.doc-wrap");
  if (!doc) { problems.push(`${node.id}: no main.doc-wrap`); continue; }
  doc.setAttribute("data-kb-id", node.id);
  doc.setAttribute("data-kb-kind", node.kind);
  doc.setAttribute("data-kb-band", node.band);
  doc.setAttribute("data-kb-group", node.group);
  // The terse essence lives only in the graph today — no page renders it. Without
  // this attribute it would be unrecoverable once the graph is derived from pages.
  doc.setAttribute("data-kb-essence", node.essence);

  /* ---- block level ---- */
  for (const sec of root.querySelectorAll("section.doc-section")) {
    let block = sec.id;
    if (node.kind === "hazard") {
      const heading = sec.querySelector("h2")?.text.trim();
      const canonical = HAZARD_BLOCK_BY_HEADING[heading];
      if (!canonical) { problems.push(`${node.id}: unknown hazard heading "${heading}"`); continue; }
      if (sec.id !== canonical) { sec.setAttribute("id", canonical); stats.idsFixed++; }
      block = canonical;
    }
    sec.setAttribute("data-kb-block", block);
    stats.sections++;
  }

  /* ---- element level: relations ---- */
  for (const grp of root.querySelectorAll(".rel-group")) {
    const label = grp.querySelector(".rel-type")?.text.trim();
    for (const item of grp.querySelectorAll(".rel-item")) {
      const a = item.querySelector("a");
      const name = (a ? a.text : item.childNodes[0]?.text ?? "").trim();
      const rel = node.relations.find((r) => r.label === label && r.name === name);
      if (!rel) { problems.push(`${node.id}: unmatched rel-item "${label}" -> "${name}"`); continue; }
      item.setAttribute("data-kb-rel", rel.type);
      item.setAttribute("data-kb-to", rel.to);
      stats.rels++;

      const noteEl = item.querySelector(".rel-note");
      if (noteEl) {
        const text = noteEl.text.trim();
        const stripped = text.replace(/\.$/, "");
        // Normalize only the stray-period case; never touch prose that genuinely differs.
        if (text !== stripped && stripped === (rel.note ?? "")) {
          noteEl.set_content(stripped);
          stats.notesNormalized++;
        }
      }
    }
  }

  /* ---- element level: theme membership ---- */
  if (node.kind === "theme") {
    // The tour is the authoring source for membership. The graph's terse `role`
    // is not the tour's prose, so it has to be carried explicitly.
    for (const step of root.querySelectorAll(".tour-step")) {
      const a = step.querySelector("h3 a");
      // Stub neighbours have no page, so they render as plain text — match on name.
      const member = a
        ? node.memberPatterns.find(
            (m) => m.id === a.getAttribute("href").split("/").pop().replace(".html", ""),
          )
        : node.memberPatterns.find((m) => m.name === step.querySelector("h3")?.text.trim());
      if (!member) { problems.push(`${node.id}: tour-step not in memberPatterns`); continue; }
      step.setAttribute("data-kb-member", member.id);
      step.setAttribute("data-kb-role", member.role);
      stats.members++;
    }
  } else {
    for (const item of root.querySelectorAll(".fluency-item")) {
      const a = item.querySelector("a");
      if (!a) continue;
      const id = a.getAttribute("href").split("/").pop().replace(".html", "");
      item.setAttribute("data-kb-theme", id);
      stats.fluency++;
    }
  }

  const out = root.toString();
  if (!DRY && out !== src) writeFileSync(file, out);
  stats.pages++;
}

console.log(JSON.stringify(stats, null, 2));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems.slice(0, 20)) console.error("  " + p);
  process.exit(1);
}
console.log(DRY ? "\n(dry run — nothing written)" : "\nannotated.");
