#!/usr/bin/env node
/* kb.mjs — read the knowledge base without reading the HTML.
 *
 * A page is ~11KB of which about half is markup, and the whole corpus is ~490k tokens —
 * more than fits in a context window. This is the way in: it strips styles, scripts,
 * diagrams and navigation chrome and returns the metadata and the prose, so a question
 * costs a couple of thousand tokens instead of hundreds of thousands.
 *
 *   kb.mjs find <query…>          search names, essences, aliases, tags and symptoms
 *   kb.mjs get <id> [--block B]   one page, or one block of it
 *   kb.mjs related <id>           what it combines with, replaces, is confused for
 *   kb.mjs ls [--band B] [--kind K]
 *
 * Writing (authoring goes through here, so the data stays well-formed):
 *   kb.mjs set <id> --aliases '["breaker","CB"]' --tags '[…]' --solves '[…]'
 *   kb.mjs wild <id> --items '[{"id":"envoy","name":"Envoy","note":"…"}]'
 *
 *   --json      structured output instead of text
 *   --diagrams  keep the mermaid source (omitted by default as noise)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";
import { RELATION_TYPES, esc } from "./lib/model.mjs";

const PARSE_OPTS = { comment: true };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const load = (f) => JSON.parse(readFileSync(join(SITE, "assets", f), "utf8"));

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i < 0 ? null : argv[i + 1]; };
const positional = argv.filter((a, i) =>
  !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && ["block", "band", "kind", "n"].includes(argv[i - 1].slice(2))));

const AS_JSON = flag("json");
const WITH_DIAGRAMS = flag("diagrams");

/* ---------------- html -> text ---------------- */
const NOISE = "script, style, link, .crumb, .docnav, .doc-metarow, .practice";
const inline = (el) => el.text.replace(/\s+/g, " ").trim();

const STOP = new Set(["the", "and", "for", "are", "but", "not", "you", "all", "any", "can",
  "with", "that", "this", "from", "into", "when", "what", "why", "how", "does", "has", "have",
  "its", "his", "her", "their", "them", "they", "was", "were", "will", "would", "should"]);

/* Sentence-level index of a page's visible prose, built on demand. */
const proseCache = new Map();
function prose(path) {
  if (proseCache.has(path)) return proseCache.get(path);
  const full = parse(readFileSync(join(SITE, path), "utf8"), PARSE_OPTS);
  // Only the visible document — <head> would otherwise contribute the title and the
  // JSON-LD, matching every query against machine metadata rather than prose.
  const root = full.querySelector("main") ?? full;
  for (const n of root.querySelectorAll(NOISE)) n.remove();
  for (const n of root.querySelectorAll("figure.diagram")) n.remove();
  const text = root.text.replace(/[ \t]+/g, " ");
  const lines = text.split(/\n|(?<=[.!?])\s+/).map((l) => l.trim()).filter((l) => l.length > 25);
  const hits = new Map();
  for (const line of lines) {
    const low = line.toLowerCase();
    for (const w of new Set(low.split(/[^a-z]+/).filter((w) => w.length > 2))) {
      const cur = hits.get(w);
      if (cur) cur.n++;
      else hits.set(w, { n: 1, line });
    }
  }
  const v = { hits };
  proseCache.set(path, v);
  return v;
}

function render(el, out = []) {
  for (const c of el.childNodes) {
    if (c.nodeType === 3) { const t = c.text.replace(/\s+/g, " "); if (t.trim()) out.push(t); continue; }
    if (c.nodeType !== 1) continue;
    const tag = c.tagName?.toLowerCase();
    const cls = c.getAttribute?.("class") ?? "";

    if (tag === "figure" && cls.includes("diagram")) {
      if (WITH_DIAGRAMS) {
        const src = c.querySelector("pre.mermaid")?.text.trim();
        const cap = c.querySelector("figcaption")?.text.trim();
        if (src) out.push(`\n\`\`\`mermaid\n${src}\n\`\`\`\n`);
        if (cap) out.push(`_${cap}_\n`);
      }
      continue;
    }
    // Name + note rows — relations, theme tie-ins, real-world examples. They share a
    // shape: a label element followed by a note span, with no separator of their own,
    // so rendering their raw text just welds the two together ("BulkheadIsolate the…").
    if (/\b(rel-item|fluency-item|wild-item)\b/.test(cls)) {
      const head = c.querySelector("a, strong");
      const label = head
        ? inline(head)
        : (c.childNodes.find((n) => n.nodeType === 3 && n.text.trim())?.text.trim() ?? "");
      const spans = c.querySelectorAll("span").filter((s) => s !== head);
      const note = spans.length ? inline(spans[spans.length - 1]) : "";
      const to = c.getAttribute("data-kb-to");
      out.push(`- ${label}${to ? ` [${to}]` : ""}${note ? ` — ${note}` : ""}\n`);
      continue;
    }
    if (/\brel-type\b/.test(cls)) { out.push(`\n${inline(c)}:\n`); continue; }
    if (tag === "h3") { out.push(`\n${inline(c).toUpperCase()}\n`); continue; }
    if (tag === "p") { out.push(`\n${inline(c)}\n`); continue; }
    if (tag === "li") {
      const id = c.getAttribute("id");
      out.push(`- ${id ? `[${id}] ` : ""}${inline(c)}\n`);
      continue;
    }
    if (tag === "dt") { const id = c.getAttribute("id"); out.push(`\n- ${id ? `[${id}] ` : ""}**${inline(c)}**: `); continue; }
    if (tag === "dd") { out.push(`${inline(c)}\n`); continue; }
    if (tag === "pre") { out.push(`\n\`\`\`\n${c.text.trim()}\n\`\`\`\n`); continue; }
    if (tag === "summary") { out.push(`\n${inline(c)}\n`); continue; }
    if (tag === "tr") {
      out.push(`| ${c.querySelectorAll("th,td").map(inline).join(" | ")} |\n`);
      continue;
    }
    render(c, out);
  }
  return out;
}

function blockText(sec) {
  const clone = parse(sec.toString(), PARSE_OPTS);
  for (const n of clone.querySelectorAll(NOISE)) n.remove();
  for (const h of clone.querySelectorAll("h2")) h.remove();   // the block name is the heading
  return render(clone).join("").replace(/\n{3,}/g, "\n\n").trim();
}

/* Relations read straight off the data layer rather than the rendered markup. */
function relationsOf(root) {
  return root.querySelectorAll("[data-kb-rel]").map((i) => ({
    type: i.getAttribute("data-kb-rel"),
    to: i.getAttribute("data-kb-to"),
    label: RELATION_TYPES[i.getAttribute("data-kb-rel")]?.label,
    note: i.querySelector(".rel-note")?.text.trim() ?? "",
  }));
}

function readPage(id) {
  const graph = load("graph.json");
  const node = graph.nodes[id];
  if (!node) {
    const near = Object.keys(graph.nodes).filter((k) => k.includes(id)).slice(0, 5);
    console.error(`unknown id: ${id}${near.length ? `\ndid you mean: ${near.join(", ")}` : ""}`);
    process.exit(1);
  }
  const root = parse(readFileSync(join(SITE, node.path), "utf8"), PARSE_OPTS);
  const blocks = {};
  for (const sec of root.querySelectorAll("[data-kb-block]")) {
    blocks[sec.getAttribute("data-kb-block")] = blockText(sec);
  }
  return { node, root, blocks };
}

/* ---------------- commands ---------------- */
const cmd = positional[0];

if (cmd === "get") {
  const { node, root, blocks } = readPage(positional[1]);
  const only = opt("block");
  if (only && !(only in blocks)) {
    console.error(`no block "${only}" on ${node.id}. has: ${Object.keys(blocks).join(", ")}`);
    process.exit(1);
  }
  const picked = only ? { [only]: blocks[only] } : blocks;

  if (AS_JSON) {
    console.log(JSON.stringify({
      id: node.id, name: node.name, kind: node.kind, band: node.band, group: node.group,
      essence: node.essence, path: node.path, blocks: picked,
      relations: relationsOf(root), themes: node.themes,
    }, null, 2));
  } else {
    if (!only) {
      console.log(`# ${node.name}  [${node.id}]`);
      console.log(`${node.kind} · ${node.band}${node.group !== node.band ? " · " + node.group : ""}`);
      console.log(`essence: ${node.essence}`);
      console.log(`path: ${node.path}`);
    }
    for (const [name, text] of Object.entries(picked)) {
      console.log(`\n## ${name}\n`);
      console.log(text);
    }
  }
} else if (cmd === "related") {
  const { node, root } = readPage(positional[1]);
  const rels = relationsOf(root);
  if (AS_JSON) { console.log(JSON.stringify(rels, null, 2)); }
  else {
    console.log(`# ${node.name} — ${rels.length} relations\n`);
    const byType = {};
    for (const r of rels) (byType[r.label] ||= []).push(r);
    for (const [label, list] of Object.entries(byType)) {
      console.log(`${label}:`);
      for (const r of list) console.log(`  ${r.to}${r.note ? ` — ${r.note}` : ""}`);
    }
    if (node.themes.length) {
      console.log(`\nIn themes:`);
      for (const t of node.themes) console.log(`  ${t.id} — ${t.role}`);
    }
  }
} else if (cmd === "find") {
  const q = positional.slice(1).join(" ").toLowerCase();
  if (!q) { console.error("usage: kb.mjs find <query…>"); process.exit(1); }
  const terms = [...new Set(q.split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)))];
  const limit = Number(opt("n") ?? 8);

  // Reading all 146 pages costs disk, not context — only the output is charged in
  // tokens. So search the full prose, not just the index, and return the line that
  // matched. Curated fields still outrank body text.
  // Two different questions wear the same clothes. "circuit breaker" is a lookup — the
  // name is the answer. "one slow dependency blocks my threads" is a description, where
  // a name match is usually incidental (every hit on "dependency" would drag in
  // Dependency Injection) and what the page SAYS matters more than what it is called.
  const naming = terms.length <= 2;
  const W = naming
    ? { id: 6, name: 5, solves: 5, tags: 3, essence: 3, curated: 2, body: 1 }
    : { id: 2, name: 2, solves: 6, tags: 3, essence: 3, curated: 1, body: 2 };

  const scored = load("catalog.json").nodes.map((n) => {
    const curated = [n.id, n.name, n.essence, ...(n.aliases ?? []), ...(n.tags ?? []), ...(n.solves ?? [])]
      .join(" ").toLowerCase();
    let score = 0;
    if (n.id === q || n.name.toLowerCase() === q || (n.aliases ?? []).some((a) => a.toLowerCase() === q)) score += 100;

    const body = prose(n.path);
    let why = null, matched = 0;
    for (const t of terms) {
      let hit = false;
      if (n.id.includes(t)) { score += W.id; hit = true; }
      if (n.name.toLowerCase().includes(t)) { score += W.name; hit = true; }
      if ((n.solves ?? []).some((s) => s.toLowerCase().includes(t))) { score += W.solves; hit = true; }
      if ((n.tags ?? []).some((s) => s.toLowerCase().includes(t))) { score += W.tags; hit = true; }
      if (n.essence.toLowerCase().includes(t)) { score += W.essence; hit = true; }
      else if (curated.includes(t)) { score += W.curated; hit = true; }
      const hits = body.hits.get(t);
      if (hits) { score += Math.min(hits.n, 3) * W.body; why ||= hits.line; hit = true; }
      if (hit) matched++;
    }
    // Covering more of what was asked beats mentioning one word a lot. Guard the
    // divisor: a query of only short words ("CB") leaves no terms, and NaN would
    // silently drop an otherwise exact alias hit.
    score *= 1 + matched / Math.max(terms.length, 1);
    return { n, score, why };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);

  if (AS_JSON) { console.log(JSON.stringify(scored.map((x) => ({ ...x.n, why: x.why })), null, 2)); }
  else if (!scored.length) { console.log(`no match for "${q}"`); }
  else {
    for (const { n, why } of scored) {
      console.log(`${n.id}  (${n.kind}/${n.band})  — ${n.essence}`);
      if (why) console.log(`    ↳ ${why.length > 150 ? why.slice(0, 150) + "…" : why}`);
    }
    console.log(`\n${scored.length} match(es). Next: kb.mjs get <id> [--block usage]`);
  }
} else if (cmd === "set" || cmd === "wild") {
  /* Writing goes through here rather than hand-edited attribute strings: the JSON is
   * validated before it lands, placement is never guessed, and it is idempotent. */
  const graph = load("graph.json");
  const node = graph.nodes[positional[1]];
  if (!node) { console.error(`unknown id: ${positional[1]}`); process.exit(1); }
  const file = join(SITE, node.path);
  const root = parse(readFileSync(file, "utf8"), PARSE_OPTS);
  const doc = root.querySelector("[data-kb-id]");
  const src = readFileSync(file, "utf8");

  const parseList = (name, validate) => {
    const raw = opt(name);
    if (raw == null) return null;
    let v;
    try { v = JSON.parse(raw); } catch (e) { console.error(`--${name} is not valid JSON: ${e.message}`); process.exit(1); }
    const err = validate(v);
    if (err) { console.error(`--${name}: ${err}`); process.exit(1); }
    return v;
  };
  const strings = (v) =>
    !Array.isArray(v) ? "must be a JSON array"
    : v.some((x) => typeof x !== "string") ? "every item must be a string"
    : v.some((x) => !x.trim()) ? "no empty strings" : null;

  if (cmd === "set") {
    let touched = [];
    for (const key of ["aliases", "tags", "solves"]) {
      const v = parseList(key, strings);
      if (v === null) continue;
      if (v.length) doc.setAttribute(`data-kb-${key}`, JSON.stringify(v));
      else doc.removeAttribute(`data-kb-${key}`);
      touched.push(`${key}=${v.length}`);
    }
    if (!touched.length) { console.error("nothing to set — pass --aliases / --tags / --solves"); process.exit(1); }
    const out = root.toString();
    if (out !== src) writeFileSync(file, out);
    console.log(`${node.id}: ${touched.join(" ")}${out === src ? " (unchanged)" : ""}`);
  } else {
    const items = parseList("items", (v) =>
      !Array.isArray(v) ? "must be a JSON array"
      : v.some((x) => !x || typeof x !== "object") ? "every item must be an object"
      : v.some((x) => !x.id || !x.name || !x.note) ? "every item needs id, name and note" : null);
    if (items === null) { console.error("pass --items '[{\"id\":…,\"name\":…,\"note\":…}]'"); process.exit(1); }

    const existing = root.querySelector('[data-kb-block="wild"]');
    if (!items.length) {
      if (existing) { writeFileSync(file, root.toString().replace(/ *<section class="doc-section" id="wild"[\s\S]*?<\/section>\n\n/, "")); }
      console.log(`${node.id}: wild removed`);
    } else {
      const rows = items.map((i) =>
        `        <div class="wild-item" data-kb-example="${i.id}"><strong>${esc(i.name)}</strong><span>${esc(i.note)}</span></div>`).join("\n");
      const block = `    <section class="doc-section" id="wild" aria-labelledby="h-wild" data-kb-block="wild">
      <h2 class="doc-h" id="h-wild">In the wild</h2>
      <div class="wild-list">
${rows}
      </div>
    </section>

`;
      let out = root.toString();
      out = existing
        ? out.replace(/ *<section class="doc-section" id="wild"[\s\S]*?<\/section>\n\n/, block)
        : out.replace(/( *<section class="doc-section" id="relationships")/, block + "$1");
      if (!out.includes('id="wild"')) { console.error(`${node.id}: could not place the block`); process.exit(1); }
      writeFileSync(file, out);
      console.log(`${node.id}: wild = ${items.length} example(s)`);
    }
  }
} else if (cmd === "ls") {
  const band = opt("band"), kind = opt("kind");
  const rows = load("catalog.json").nodes
    .filter((n) => (!band || n.band === band) && (!kind || n.kind === kind));
  if (AS_JSON) console.log(JSON.stringify(rows, null, 2));
  else {
    for (const n of rows) console.log(`${n.id.padEnd(28)} ${n.essence}`);
    console.log(`\n${rows.length} entries.`);
  }
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].split("\n").slice(1).map((l) => l.replace(/^ \* ?/, "").replace(/^\/\* ?/, "")).join("\n"));
  process.exit(cmd ? 1 : 0);
}
