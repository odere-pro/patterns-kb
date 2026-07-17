#!/usr/bin/env node
/* kb.mjs — read the knowledge base without reading the HTML.
 *
 * A page is ~11KB of which about half is markup, and the whole corpus is ~490k tokens —
 * more than fits in a context window. This is the way in: it strips styles, scripts,
 * diagrams and navigation chrome and returns the metadata and the prose, so a question
 * costs a couple of thousand tokens instead of hundreds of thousands.
 *
 *   kb.mjs find <query…> [--tag T] [--band B] [--kind K]
 *                                 search names, essences, aliases, tags and symptoms
 *   kb.mjs get <id> [--block B]   one page, or one block of it
 *   kb.mjs related <id>           what it combines with, replaces, is confused for
 *   kb.mjs backlinks <id>         what points here — typed inbound edges + prose mentions
 *   kb.mjs ls [--band B] [--kind K]
 *   kb.mjs validate [<id> | --file <path>]   structural lint; no argument = every page
 *
 * Writing (authoring goes through here, so the data stays well-formed):
 *   kb.mjs set <id> --aliases '["breaker","CB"]' --tags '[…]' --solves '[…]'
 *   kb.mjs wild <id> --items '[{"id":"envoy","name":"Envoy","note":"…"}]'
 *   kb.mjs production <id> --knobs '[{"label":…,"note":…}]' --signals '[…]' --failures '[…]' --checklist '["…"]'
 *   kb.mjs link <from> <verb> <to> [--note "…"] [--note-back "…"]   both sides at once
 *   kb.mjs new <id> --kind pattern --band <b> [--group <g>] --name "…" --order <n>
 *
 *   --json      structured output instead of text
 *   --diagrams  keep the mermaid source (omitted by default as noise)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";
import { RELATION_TYPES, REL_ORDER, esc, folderFor, band as bandOf } from "./lib/model.mjs";
import { validatePage } from "./lib/validate.mjs";
import { pageSkeleton } from "./lib/template.mjs";

const PARSE_OPTS = { comment: true };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const load = (f) => JSON.parse(readFileSync(join(SITE, "assets", f), "utf8"));

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i < 0 ? null : argv[i + 1]; };
/* Everything except the boolean flags takes a value, so a positional is any arg that
 * neither starts with -- nor follows a value-taking --option. */
const BOOL_FLAGS = new Set(["json", "diagrams"]);
const positional = argv.filter((a, i) =>
  !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && !BOOL_FLAGS.has(argv[i - 1].slice(2))));

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
    if (tag === "pre") {
      /* pre is a raw-text element, so an inner <code …> tag arrives as literal text.
         Strip it and surface data-kb-lang as the fence language. */
      let raw = c.text.trim();
      let lang = "";
      const m = raw.match(/^<code([^>]*)>([\s\S]*)<\/code>$/);
      if (m) {
        lang = (m[1].match(/data-kb-lang="([^"]+)"/) || [])[1] ?? "";
        raw = m[2].trim();
      }
      out.push(`\n\`\`\`${lang}\n${raw}\n\`\`\`\n`);
      continue;
    }
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
  const fTag = opt("tag"), fBand = opt("band"), fKind = opt("kind");
  const candidates = load("catalog.json").nodes.filter((n) =>
    (!fTag || (n.tags ?? []).includes(fTag)) && (!fBand || n.band === fBand) && (!fKind || n.kind === fKind));

  if (!q) {
    /* A filter with no query is a listing, not a search. */
    if (!fTag && !fBand && !fKind) { console.error("usage: kb.mjs find <query…> [--tag T] [--band B] [--kind K]"); process.exit(1); }
    if (AS_JSON) console.log(JSON.stringify(candidates, null, 2));
    else {
      for (const n of candidates) console.log(`${n.id.padEnd(28)} ${n.essence}`);
      console.log(`\n${candidates.length} entries.`);
    }
    process.exit(0);
  }
  const terms = [...new Set(q.split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)))];
  const limit = Number(opt("n") ?? 8);

  // A small curated synonym bridge: a symptom phrased as "stale" should still reach a
  // page that only says "outdated". Synonym hits score at half weight so the author's
  // own vocabulary still wins ties. (TODO.md §4's cheap option.)
  const SYNONYMS = {
    stale: ["outdated", "expired"], outdated: ["stale"],
    slow: ["latency", "lag"], latency: ["slow", "delay"], delay: ["latency"],
    crash: ["failure", "outage"], failure: ["crash", "fault", "outage"], outage: ["failure"],
    queue: ["backlog", "buffer"], backlog: ["queue"],
    timeout: ["deadline"], deadline: ["timeout"],
    spike: ["burst", "surge"], burst: ["spike", "surge"], surge: ["spike"],
    overload: ["saturated", "overwhelmed"], saturated: ["overload"],
    throttle: ["rate", "limit"], concurrency: ["parallelism"], parallelism: ["concurrency"],
    cache: ["caching", "cached"], caching: ["cache"],
    duplicate: ["duplication", "dedupe"], config: ["configuration"],
    auth: ["authentication", "authorization"], database: ["db"],
    retry: ["retries", "reattempt"], hang: ["hangs", "block", "stuck"], stuck: ["hang", "block"],
  };

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

  const scored = candidates.map((n) => {
    const curated = [n.id, n.name, n.essence, ...(n.aliases ?? []), ...(n.tags ?? []), ...(n.solves ?? [])]
      .join(" ").toLowerCase();
    let score = 0;
    if (n.id === q || n.name.toLowerCase() === q || (n.aliases ?? []).some((a) => a.toLowerCase() === q)) score += 100;

    const body = prose(n.path);
    let why = null, matched = 0;
    for (const term of terms) {
      /* Score the term itself at full weight, then its synonyms at half; a term
       * counts as matched once, on its best variant. */
      let best = 0, bestWhy = null;
      const variants = [term, ...(SYNONYMS[term] ?? [])];
      for (let vi = 0; vi < variants.length; vi++) {
        const t = variants[vi];
        const mult = vi === 0 ? 1 : 0.5;
        let s = 0, line = null;
        if (n.id.includes(t)) s += W.id;
        if (n.name.toLowerCase().includes(t)) s += W.name;
        if ((n.solves ?? []).some((x) => x.toLowerCase().includes(t))) s += W.solves;
        if ((n.tags ?? []).some((x) => x.toLowerCase().includes(t))) s += W.tags;
        if (n.essence.toLowerCase().includes(t)) s += W.essence;
        else if (curated.includes(t)) s += W.curated;
        const hits = body.hits.get(t);
        if (hits) { s += Math.min(hits.n, 3) * W.body; line = hits.line; }
        if (s * mult > best) { best = s * mult; bestWhy = line; }
      }
      if (best > 0) { score += best; matched++; why ||= bestWhy; }
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
} else if (cmd === "set" || cmd === "wild" || cmd === "production") {
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
  } else if (cmd === "wild") {
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
      /* wild sits before production when that block exists, else before relationships. */
      const anchor = out.includes('id="production"') ? "production" : "relationships";
      out = existing
        ? out.replace(/ *<section class="doc-section" id="wild"[\s\S]*?<\/section>\n\n/, block)
        : out.replace(new RegExp(`( *<section class="doc-section" id="${anchor}")`), block + "$1");
      if (!out.includes('id="wild"')) { console.error(`${node.id}: could not place the block`); process.exit(1); }
      writeFileSync(file, out);
      console.log(`${node.id}: wild = ${items.length} example(s)`);
    }
  } else {
    /* production — the system-builder block. Four labeled lists; the writer replaces
     * the whole block, so re-supply every list on edit. All-empty removes it. */
    const labeled = (v) =>
      !Array.isArray(v) ? "must be a JSON array"
      : v.some((x) => !x || typeof x !== "object") ? "every item must be an object"
      : v.some((x) => !x.label || !x.note) ? "every item needs label and note" : null;
    if (["knobs", "signals", "failures", "checklist"].every((k) => opt(k) == null)) {
      console.error("pass --knobs / --signals / --failures ('[{\"label\":…,\"note\":…}]') and/or --checklist ('[\"…\"]')");
      process.exit(1);
    }
    const groups = [
      ["prod-knobs", "Tuning knobs", parseList("knobs", labeled) ?? []],
      ["prod-signals", "Signals to watch", parseList("signals", labeled) ?? []],
      ["prod-failures", "Failure modes under load", parseList("failures", labeled) ?? []],
      ["prod-checklist", "Readiness checklist", (parseList("checklist", strings) ?? []).map((s) => ({ text: s }))],
    ];

    const existing = root.querySelector('[data-kb-block="production"]');
    const total = groups.reduce((n, [, , items]) => n + items.length, 0);
    if (!total) {
      if (existing) writeFileSync(file, root.toString().replace(/ *<section class="doc-section" id="production"[\s\S]*?<\/section>\n\n/, ""));
      console.log(`${node.id}: production removed`);
    } else {
      const rows = groups
        .filter(([, , items]) => items.length)
        .map(([cls, title, items]) => {
          const lis = items.map((i) =>
            `            <li>${i.text != null ? esc(i.text) : `<strong>${esc(i.label)}</strong> — ${esc(i.note)}`}</li>`).join("\n");
          return `        <div class="prod-group ${cls}">
          <h3>${title}</h3>
          <ul>
${lis}
          </ul>
        </div>`;
        }).join("\n");
      const block = `    <section class="doc-section" id="production" aria-labelledby="h-production" data-kb-block="production">
      <h2 class="doc-h" id="h-production">In production</h2>
      <div class="production">
${rows}
      </div>
    </section>

`;
      let out = root.toString();
      out = existing
        ? out.replace(/ *<section class="doc-section" id="production"[\s\S]*?<\/section>\n\n/, block)
        : out.replace(/( *<section class="doc-section" id="relationships")/, block + "$1");
      if (!out.includes('id="production"')) { console.error(`${node.id}: could not place the block`); process.exit(1); }
      writeFileSync(file, out);
      console.log(`${node.id}: production = ${groups.map(([c, , i]) => `${c.replace("prod-", "")}:${i.length}`).join(" ")}`);
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
} else if (cmd === "validate") {
  /* Structural lint. One page in ~50ms (no graph.json needed), or the whole corpus. */
  const targets = [];
  const fileArg = opt("file");
  if (fileArg) {
    const abs = resolve(fileArg);
    const rel = relative(SITE, abs);
    if (rel.startsWith("..")) { console.error(`not under site/: ${fileArg}`); process.exit(1); }
    if (!existsSync(abs)) { console.error(`no such file: ${fileArg}`); process.exit(1); }
    targets.push(rel);
  } else if (positional[1]) {
    const node = load("graph.json").nodes[positional[1]];
    if (!node) { console.error(`unknown id: ${positional[1]}`); process.exit(1); }
    targets.push(node.path);
  } else {
    const walk = (dir) => readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith(".html") ? [relative(SITE, p)] : [];
    });
    for (const d of ["patterns", "hazards", "themes"]) targets.push(...walk(join(SITE, d)));
  }

  const problems = [];
  for (const rel of targets) {
    const root = parse(readFileSync(join(SITE, rel), "utf8"), PARSE_OPTS);
    problems.push(...validatePage(root, rel));
  }
  if (AS_JSON) console.log(JSON.stringify({ pages: targets.length, problems }, null, 2));
  else if (problems.length) {
    console.error(`${problems.length} problem(s) across ${targets.length} page(s):`);
    for (const p of problems) console.error("  " + p);
  } else console.log(`OK — ${targets.length} page(s) structurally valid.`);
  process.exit(problems.length ? 1 : 0);
} else if (cmd === "backlinks") {
  /* What points here: typed inbound edges (as declared on the OTHER side, so the
   * other page's phrasing of the note) plus prose mentions in both directions. */
  const graph = load("graph.json");
  const id = positional[1];
  const node = graph.nodes[id];
  if (!node) { console.error(`unknown id: ${id}`); process.exit(1); }

  const inbound = [], mentionedBy = [];
  for (const [oid, o] of Object.entries(graph.nodes)) {
    if (oid === id) continue;
    for (const r of o.relations ?? []) {
      if (r.to === id) inbound.push({ from: oid, type: r.type, label: r.label, note: r.note });
    }
    if ((o.mentions ?? []).includes(id)) mentionedBy.push(oid);
  }
  const out = { id, inbound, mentionedBy, mentions: node.mentions ?? [] };
  if (AS_JSON) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`# ${node.name} — ${inbound.length} inbound relation(s)\n`);
    for (const r of inbound) console.log(`  ${r.from}  [${r.type}]${r.note ? ` — ${r.note}` : ""}`);
    if (mentionedBy.length) console.log(`\nMentioned in prose by: ${mentionedBy.join(", ")}`);
    if (out.mentions.length) console.log(`Mentions in its own prose: ${out.mentions.join(", ")}`);
  }
} else if (cmd === "link") {
  /* Declare a relationship on BOTH pages at once — the invariant make check enforces,
   * finally matched by a writer that maintains it. */
  const [, fromId, verb, toId] = positional;
  const rel = RELATION_TYPES[verb];
  if (!fromId || !verb || !toId || !rel) {
    console.error(`usage: kb.mjs link <from> <verb> <to> [--note "…"] [--note-back "…"]\nverbs: ${Object.keys(RELATION_TYPES).join(", ")}`);
    process.exit(1);
  }
  const graph = load("graph.json");
  const from = graph.nodes[fromId], to = graph.nodes[toId];
  if (!from) { console.error(`unknown id: ${fromId}`); process.exit(1); }
  if (!to) { console.error(`unknown id: ${toId}`); process.exit(1); }
  if (fromId === toId) { console.error("a page cannot relate to itself"); process.exit(1); }

  const inverse = rel.symmetric ? verb : rel.inverse;
  const note = opt("note") ?? "";
  const noteBack = opt("note-back") ?? note;

  const hop = (a, b) => {
    const r = relative(dirname(a), b);
    return r.startsWith(".") ? r : "./" + r;
  };

  const writeSide = (page, other, v, n) => {
    const file = join(SITE, page.path);
    const root = parse(readFileSync(file, "utf8"), PARSE_OPTS);
    const existing = root.querySelector(`[data-kb-rel][data-kb-to="${other.id}"]`);
    if (existing) {
      console.error(`${page.id} already relates to ${other.id} via "${existing.getAttribute("data-kb-rel")}" — edit that edge instead of adding a second one`);
      process.exit(1);
    }
    const sec = root.querySelector('[data-kb-block="relationships"]');
    if (!sec) { console.error(`${page.id}: no relationships section`); process.exit(1); }

    const label = RELATION_TYPES[v].label;
    const item = `<div class="rel-item" data-kb-rel="${v}" data-kb-to="${other.id}"><a href="${hop(page.path, other.path)}">${esc(other.name)}</a><span class="rel-note">${esc(n)}</span></div>`;

    const groups = sec.querySelectorAll(".rel-group");
    const withLabel = groups.find((g) => g.querySelector(".rel-type")?.text.trim() === label);
    if (withLabel) {
      withLabel.querySelector(".rel-list").insertAdjacentHTML("beforeend", `  ${item}\n        `);
    } else {
      const groupHtml = `      <div class="rel-group">
        <p class="rel-type">${label}</p>
        <div class="rel-list">
          ${item}
        </div>
      </div>\n\n`;
      const order = REL_ORDER.indexOf(label);
      const after = groups.find((g) => REL_ORDER.indexOf(g.querySelector(".rel-type")?.text.trim()) > order);
      const anchor = after ?? sec.querySelector("figure.diagram");
      if (anchor) anchor.insertAdjacentHTML("beforebegin", groupHtml);
      else sec.insertAdjacentHTML("beforeend", groupHtml);
    }
    writeFileSync(file, root.toString());
  };

  writeSide(from, to, verb, note);
  writeSide(to, from, inverse, noteBack);
  console.log(`${fromId} —[${verb}]→ ${toId} declared on both pages. Now run: make all && make check`);
} else if (cmd === "new") {
  /* Scaffold a structurally valid page. The author fills the TODOs, then:
   * kb.mjs set / link / production, and finally make all && make check. */
  const id = positional[1];
  const kind = opt("kind"), bandId = opt("band"), name = opt("name"), order = opt("order");
  const group = opt("group") ?? bandId;
  if (!id || !kind || !name || order == null || (kind === "pattern" && !bandId)) {
    console.error('usage: kb.mjs new <id> --kind pattern|hazard|theme --band <b> [--group <g>] --name "…" --order <n>');
    process.exit(1);
  }
  const band = kind === "pattern" ? bandId : kind;
  if (kind === "pattern" && !bandOf(bandId)) { console.error(`unknown band: ${bandId}`); process.exit(1); }

  let dir;
  try { dir = folderFor({ kind, band, group: kind === "pattern" ? group : kind }); }
  catch (e) { console.error(e.message); process.exit(1); }
  const file = join(SITE, dir, `${id}.html`);
  if (existsSync(file)) { console.error(`already exists: ${relative(ROOT, file)}`); process.exit(1); }

  const html = pageSkeleton({ id, name, kind, band, group: kind === "pattern" ? group : kind, order });
  writeFileSync(file, html);
  console.log(`${relative(ROOT, file)} written. Next:`);
  console.log(`  1. replace the TODOs (prose, diagram, sketch, essence)`);
  console.log(`  2. node scripts/kb.mjs set ${id} --aliases … --tags … --solves …`);
  console.log(`  3. node scripts/kb.mjs link ${id} <verb> <other-id> --note "…"`);
  console.log(`  4. renumber data-kb-order neighbours if needed, then make all && make check`);
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].split("\n").slice(1).map((l) => l.replace(/^ \* ?/, "").replace(/^\/\* ?/, "")).join("\n"));
  process.exit(cmd ? 1 : 0);
}
