#!/usr/bin/env node
/* build.mjs — derives site/assets/graph.json FROM the pages.
 *
 * The pages are the source of truth. Every structural fact is read out of the
 * data-kb-* layer; nothing about the corpus is declared here. This is the inverse
 * of the old build-graph.mjs, which held the truth in tuple tables and left the
 * HTML to agree with it by hand.
 *
 * Enforces the same invariants the tuple tables used to: closed relation vocabulary,
 * no dangling ids, no conflicting directional edges, and no one-way relationships.
 *
 * Run:  node scripts/build.mjs   (add --check to fail if graph.json is stale)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";
import { RELATION_TYPES, ELEVATION_BANDS, KIND_DIR } from "./lib/model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const OUT = join(SITE, "assets", "graph.json");

const fail = (msg) => { console.error("ERROR: " + msg); process.exit(1); };
const titleize = (id) =>
  id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

/* ---------------- read every page ---------------- */
const raw = [];
for (const [kind, dir] of Object.entries(KIND_DIR)) {
  const abs = join(SITE, dir);
  for (const f of readdirSync(abs).filter((f) => f.endsWith(".html"))) {
    const root = parse(readFileSync(join(abs, f), "utf8"));
    const doc = root.querySelector("[data-kb-id]");
    if (!doc) fail(`${dir}/${f}: no [data-kb-id] root`);
    const id = doc.getAttribute("data-kb-id");
    if (id !== f.replace(".html", "")) fail(`${dir}/${f}: data-kb-id "${id}" != filename`);
    if (doc.getAttribute("data-kb-kind") !== kind) fail(`${dir}/${f}: kind != ${kind}`);
    raw.push({ kind, dir, root, doc, id });
  }
}

/* ---------------- nodes ---------------- */
const nodes = {};
const KIND_SEQ = ["pattern", "hazard", "theme"];
raw.sort((a, b) =>
  KIND_SEQ.indexOf(a.kind) - KIND_SEQ.indexOf(b.kind) ||
  Number(a.doc.getAttribute("data-kb-order")) - Number(b.doc.getAttribute("data-kb-order")),
);

for (const { kind, dir, root, doc, id } of raw) {
  if (nodes[id]) fail(`duplicate node id: ${id}`);
  const band = doc.getAttribute("data-kb-band");
  const name = root.querySelector(".doc-title")?.text.trim();
  if (!name) fail(`${id}: no .doc-title`);
  const docClass =
    kind === "hazard" ? "hazard" : kind === "theme" ? "theme"
    : ELEVATION_BANDS.has(band) ? "" : "lens";
  nodes[id] = {
    id, name, kind, band,
    group: doc.getAttribute("data-kb-group"),
    essence: doc.getAttribute("data-kb-essence"),
    docClass,
    dir,
    relPath: `../${dir}/${id}.html`,
    relations: [], themes: [], memberPatterns: [],
  };
}

/* Ids referenced as relation targets that have no page of their own. They render as
 * plain text so we never emit a dangling href. Derived, not declared. */
const stubs = new Set();
for (const { root } of raw) {
  // A stub can be reached as a relation target or as a theme member (stateless-service
  // is only ever the latter), so both attributes have to be swept.
  for (const attr of ["data-kb-to", "data-kb-member"]) {
    for (const item of root.querySelectorAll(`[${attr}]`)) {
      const to = item.getAttribute(attr);
      if (!nodes[to]) stubs.add(to);
    }
  }
}

/* ---------------- relations ---------------- */
const seenPair = new Map(); // "a|b" -> {from, to, type} of the first directional edge
let rendered = 0;

for (const { root, id } of raw) {
  const node = nodes[id];
  for (const item of root.querySelectorAll("[data-kb-rel]")) {
    const type = item.getAttribute("data-kb-rel");
    const to = item.getAttribute("data-kb-to");
    const def = RELATION_TYPES[type];
    if (!def) fail(`${id}: unknown relation type "${type}"`);
    if (!nodes[to] && !stubs.has(to)) fail(`${id}: dangling relation target "${to}"`);
    node.relations.push({
      to, type,
      note: item.querySelector(".rel-note")?.text.trim() ?? "",
      name: nodes[to]?.name ?? titleize(to),
      href: nodes[to] ? `../${nodes[to].dir}/${to}.html` : null,
      label: def.label,
    });
    rendered++;

    if (!def.symmetric) {
      const key = [id, to].sort().join("|") + "#" + [type, def.inverse].sort().join("|");
      const prior = seenPair.get(key);
      if (prior && prior.from !== id && prior.type !== def.inverse) {
        fail(`conflicting directional edges for ${id}<->${to}: ` +
             `${prior.from}-${prior.type}->${prior.to} vs ${id}-${type}->${to}`);
      }
      if (!prior) seenPair.set(key, { from: id, to, type });
    }
  }
}

/* Every relation to a real node must be declared on both pages. */
let oneWay = 0;
for (const node of Object.values(nodes)) {
  for (const r of node.relations) {
    const target = nodes[r.to];
    if (!target) continue;
    const want = RELATION_TYPES[r.type].symmetric ? r.type : RELATION_TYPES[r.type].inverse;
    if (!target.relations.some((x) => x.to === node.id && x.type === want)) {
      console.error(`one-way: ${node.id} -${r.type}-> ${r.to} has no "${want}" back`);
      oneWay++;
    }
  }
}
if (oneWay) fail(`${oneWay} one-way relationship(s)`);

/* ---------------- theme membership ---------------- */
for (const { root, id, kind } of raw) {
  if (kind !== "theme") continue;
  const theme = nodes[id];
  for (const step of root.querySelectorAll("[data-kb-member]")) {
    const mid = step.getAttribute("data-kb-member");
    const target = nodes[mid];
    if (!target && !stubs.has(mid)) fail(`${id}: theme member "${mid}" has no page and is not a stub`);
    const role = step.getAttribute("data-kb-role");
    theme.memberPatterns.push({
      id: mid, name: target?.name ?? titleize(mid), role,
      href: target ? `../${target.dir}/${mid}.html` : null,
    });
    // Invert onto the pattern — this is the "fluency tie-in".
    if (target) target.themes.push({ id, name: theme.name, role, href: theme.relPath });
  }
}

/* ---------------- unique relationships ---------------- */
const uniq = new Set();
for (const node of Object.values(nodes)) {
  for (const r of node.relations) {
    const def = RELATION_TYPES[r.type];
    const family = def.symmetric ? r.type : [r.type, def.inverse].sort().join("|");
    uniq.add([node.id, r.to].sort().join("|") + "#" + family);
  }
}

const counts = (k) => Object.values(nodes).filter((n) => n.kind === k).length;
const out = {
  meta: {
    generator: "scripts/build.mjs",
    patterns: counts("pattern"),
    hazards: counts("hazard"),
    themes: counts("theme"),
    relationships: uniq.size,
    renderedRelations: rendered,
  },
  relationTypes: RELATION_TYPES,
  stubNeighbors: [...stubs],
  nodes,
};

const json = JSON.stringify(out, null, 2) + "\n";
if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== json) { console.error("graph.json is STALE — run: node scripts/build.mjs"); process.exit(1); }
  console.log("graph.json is up to date.");
} else {
  writeFileSync(OUT, json);
  console.log(
    `graph.json written from pages: ${out.meta.patterns} patterns + ${out.meta.hazards} hazards + ` +
    `${out.meta.themes} themes, ${uniq.size} relationships → ${rendered} rendered.`,
  );
}
