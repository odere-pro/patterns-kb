#!/usr/bin/env node
/* kb.mjs — read the knowledge base without reading the HTML.
 *
 * A page is ~11KB of which about half is markup, and the whole corpus is ~490k tokens —
 * more than fits in a context window. This is the way in: it strips styles, scripts,
 * diagrams and navigation chrome and returns the metadata and the prose, so a question
 * costs a couple of thousand tokens instead of hundreds of thousands.
 *
 * The command surface is NOT documented here. It lives in lib/cli-spec.mjs, which this
 * file prints its usage from and build-vocab.mjs renders onto vocab.html — one source,
 * two renderers. Run `node scripts/kb.mjs` with no arguments for the full list.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";
import { RELATION_TYPES, REL_ORDER, SYNONYMS, BLOCKS, LEVELS, LEVEL_LABELS, TAGS, esc, folderFor, band as bandOf, PROSE_LINK_EXCLUDE, KIND_DIR } from "./lib/model.mjs";
import { pruneForLens } from "./lib/lens.mjs";
import { mergedSynonyms } from "./lib/expansions.mjs";
import { indexNodes, proseIndexer, scoreQuery } from "./lib/search.mjs";
import { validatePage } from "./lib/validate.mjs";
import { pageSkeleton } from "./lib/template.mjs";
import { usageText } from "./lib/cli-spec.mjs";

const USAGE_HEADER = `kb.mjs — read the knowledge base without reading the HTML.

The whole corpus is ~490k tokens, more than fits in a context window. This is the way in:
it strips styles, scripts, diagrams and navigation chrome and returns the metadata and the
prose. Every term it prints is defined on site/vocab.html.`;

const PARSE_OPTS = { comment: true };
/* KB_ROOT lets the smoke tests point the reader/writer at a fixture corpus; normal runs
 * resolve the repo root from this file's own location. Same contract as build.mjs. */
const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
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

/* --level scopes get/find to a reading level. data-kb-level means "visible from this
 * level up"; no attribute means visible everywhere, so no --level (or expert) reads
 * the whole page. */
const LEVEL = opt("level");
if (LEVEL && !LEVELS.includes(LEVEL)) {
  console.error(`--level "${LEVEL}" is not a level — use ${LEVELS.join("/")}`);
  process.exit(1);
}

/* ---------------- html -> text ---------------- */
/* .mentions is the generated "Mentioned by" list: navigation derived from other pages'
 * prose, so indexing it would score a page against words it never wrote. */
const NOISE = "script, style, link, .crumb, .docnav, .doc-metarow, .practice, .mentions";
const inline = (el) => el.text.replace(/\s+/g, " ").trim();
/* Markup as authored, whitespace-normalised — the form the writers below round-trip. */
const richOf = (el) => (el ? el.innerHTML.replace(/\s+/g, " ").trim() : "");

/* STOP lives in lib/expansions.mjs now, shared with the vocabulary extractor; the hub
 * keeps an inline copy in search.js (plain file:// script) pinned by the parity test.
 * The scorer and the prose index moved to lib/search.mjs, so the relevance fixture can
 * score the corpus in-process instead of paying a spawn per query. */
const bodyOf = proseIndexer(SITE, LEVEL);

function render(el, out = []) {
  for (const c of el.childNodes) {
    if (c.nodeType === 3) { const t = c.text.replace(/\s+/g, " "); if (t.trim()) out.push(t); continue; }
    if (c.nodeType !== 1) continue;
    const tag = c.tagName?.toLowerCase();
    const cls = c.getAttribute?.("class") ?? "";

    if (tag === "figure" && cls.includes("diagram")) {
      /* The mermaid source is noise by default, but the caption is not: it is a full
       * sentence naming the question the diagram answers. Since a pattern's `structure`
       * is now a topology walk plus a sequence diagram and often carries no prose at
       * all, dropping both left the block rendering completely empty — and the reader
       * is the only way anyone is supposed to read these pages. Captions always. */
      const src = c.querySelector("pre.mermaid")?.text.trim();
      const cap = c.querySelector("figcaption")?.text.trim();
      if (WITH_DIAGRAMS && src) out.push(`\n\`\`\`mermaid\n${src}\n\`\`\`\n`);
      if (cap) out.push(`\n_${cap}_\n`);
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
    if (tag === "h4") { out.push(`\n${inline(c)}\n`); continue; }
    if (tag === "p") { out.push(`\n${inline(c)}\n`); continue; }
    if (tag === "li") {
      const id = c.getAttribute("id");
      // An item may carry a nested list (e.g. an NFR label with its points); without
      // this, inline() welds the sublist into one unreadable line.
      const sub = c.childNodes.find((n) => n.nodeType === 1 && /^(ul|ol)$/i.test(n.tagName ?? ""));
      if (sub) {
        const label = c.childNodes.filter((n) => n !== sub).map((n) => n.text).join("").replace(/\s+/g, " ").trim();
        out.push(`- ${id ? `[${id}] ` : ""}${label}\n`);
        for (const s of sub.childNodes) {
          if (s.nodeType === 1 && s.tagName?.toLowerCase() === "li") out.push(`  - ${inline(s)}\n`);
        }
        continue;
      }
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
  pruneForLens(clone, LEVEL);
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

/* --- writer-owned blocks, read back in the writer's own --items shape ---
 * `wild` and `production` are replace-the-whole-block writers, so fixing one entry means
 * re-supplying its neighbours — and the rendered prose is a lossy source to re-type them
 * from. Two things vanish in it: the data-kb-level tag (310 wild items and 1,616
 * production items across the corpus carry one) and the inline <code> some notes use.
 * These projections return exactly what the writers accept, so an edit is a round trip.
 *
 * Read off the UNPRUNED root on purpose. A --level-scoped dump fed back to the writer
 * would delete every item above that lens — the loss this exists to prevent. */
const itemLevel = (el) => {
  const level = el.getAttribute("data-kb-level");
  return level ? { level } : {};
};

function wildItems(root) {
  const sec = root.querySelector('[data-kb-block="wild"]');
  if (!sec) return null;
  return sec.querySelectorAll(".wild-item").map((el) => {
    const head = el.querySelector("strong");
    const link = head?.querySelector("a");
    const spans = el.querySelectorAll("span");
    return {
      id: el.getAttribute("data-kb-example"),
      name: richOf(link ?? head),
      note: spans.length ? richOf(spans[spans.length - 1]) : "",
      ...(link ? { href: link.getAttribute("href") } : {}),
      ...itemLevel(el),
    };
  });
}

const PROD_GROUPS = [
  ["knobs", "prod-knobs"], ["signals", "prod-signals"],
  ["failures", "prod-failures"], ["checklist", "prod-checklist"],
];

function productionItems(root) {
  const sec = root.querySelector('[data-kb-block="production"]');
  if (!sec) return null;
  const out = {};
  for (const [key, cls] of PROD_GROUPS) {
    out[key] = sec.querySelectorAll(`.${cls} li`).map((li) => {
      if (key === "checklist") return { text: richOf(li), ...itemLevel(li) };
      /* Every labelled item is "<strong>label</strong> — note"; peel the label back off
       * rather than splitting on the dash, which also occurs inside notes. */
      const label = richOf(li.querySelector("strong"));
      const full = richOf(li);
      const head = `<strong>${label}</strong>`;
      const note = full.startsWith(head) ? full.slice(head.length).replace(/^\s*—\s*/, "") : full;
      return { label, note, ...itemLevel(li) };
    });
  }
  return out;
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
    /* Every block shows at every lens (the whole-block policy is retired); a block
     * whose lens-filtered text comes back empty is simply omitted. */
    const text = blockText(sec);
    if (LEVEL && !text) continue;
    blocks[sec.getAttribute("data-kb-block")] = text;
  }
  return { node, root, blocks };
}

/* Shared by `find` and `brief`: score the filtered catalog against a query. The scoring
 * itself lives in lib/search.mjs, so the CLI and the relevance fixture measure the same
 * thing and the two commands cannot drift apart.
 *
 * The synonym bridge: curated SYNONYMS (lib/model.mjs) layered over the machine-generated
 * expansion table (lib/expansions.mjs), curated wins. build.mjs projects the same merge
 * into catalog.js, so the offline hub search scores the same bridge.
 *
 * Passing `bodyOf` is what separates the CLI from the hub: page prose joins the scoring
 * and the matched line comes back as `why`. Curated fields still outrank body text. */
function searchCatalog(q, candidates, limit) {
  return scoreQuery({
    index: indexNodes(candidates),
    q,
    syn: mergedSynonyms(SYNONYMS),
    bodyOf,
    limit,
  });
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

  /* Writer-owned blocks come back structured alongside their prose, so `get --json`
   * feeds straight into `wild --items` / `production --knobs …` without a re-type. */
  const items = {
    ...("wild" in picked ? { wild: wildItems(root) } : {}),
    ...("production" in picked ? { production: productionItems(root) } : {}),
  };

  if (AS_JSON) {
    console.log(JSON.stringify({
      id: node.id, name: node.name, kind: node.kind, band: node.band, group: node.group,
      essence: node.essence, path: node.path,
      ...(LEVEL ? { level: LEVEL } : {}),
      ...(node.levels ? { levels: node.levels } : {}),
      blocks: picked,
      ...(Object.keys(items).length ? { items } : {}),
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
    if (!fTag && !fBand && !fKind) { console.error("usage: kb.mjs find <query…> [--tag T] [--band B] [--kind K] [--level L]"); process.exit(1); }
    if (AS_JSON) console.log(JSON.stringify(candidates, null, 2));
    else {
      for (const n of candidates) console.log(`${n.id.padEnd(28)} ${n.essence}`);
      console.log(`\n${candidates.length} entries.`);
    }
    process.exit(0);
  }
  const scored = searchCatalog(q, candidates, Number(opt("n") ?? 8));

  if (AS_JSON) { console.log(JSON.stringify(scored.map((x) => ({ ...x.n, why: x.why })), null, 2)); }
  else if (!scored.length) { console.log(`no match for "${q}"`); }
  else {
    for (const { n, why } of scored) {
      console.log(`${n.id}  (${n.kind}/${n.band})  — ${n.essence}`);
      if (why) console.log(`    ↳ ${why.length > 150 ? why.slice(0, 150) + "…" : why}`);
    }
    console.log(`\n${scored.length} match(es). Next: kb.mjs get <id> [--block usage]`);
  }
} else if (cmd === "brief") {
  /* One round-trip for an agent: the find hits, the governing theme's decide table, and
   * the typed neighbours of the top hits. Exists because a scouting agent otherwise
   * spends 3-6 process spawns re-deriving exactly this sequence, and each spawn is a
   * full model round-trip on its side. */
  const q = positional.slice(1).join(" ").toLowerCase();
  if (!q) { console.error("usage: kb.mjs brief <query…> [--theme <id>] [--tag T] [--band B] [--kind K] [--n 5]"); process.exit(1); }
  const fTag = opt("tag"), fBand = opt("band"), fKind = opt("kind");
  const candidates = load("catalog.json").nodes.filter((n) =>
    (!fTag || (n.tags ?? []).includes(fTag)) && (!fBand || n.band === fBand) && (!fKind || n.kind === fKind));
  const scored = searchCatalog(q, candidates, Number(opt("n") ?? 5));
  if (!scored.length) { console.log(`no match for "${q}"`); process.exit(0); }

  const graph = load("graph.json");
  let themeId = opt("theme");
  if (themeId && graph.nodes[themeId]?.kind !== "theme") { console.error(`not a theme id: ${themeId}`); process.exit(1); }
  if (!themeId) {
    /* The governing theme: a theme among the hits wins; otherwise the theme most of the
     * top hits belong to. Either can come back empty — not every question has one. */
    themeId = scored.find((x) => x.n.kind === "theme")?.n.id ?? null;
    if (!themeId) {
      const counts = new Map();
      for (const { n } of scored)
        for (const t of graph.nodes[n.id]?.themes ?? []) counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
      themeId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }
  }
  const themeBlocks = themeId ? readPage(themeId).blocks : {};

  /* Neighbours for the top hits only — the tail's relations are a `related` call away. */
  const related = {};
  for (const { n } of scored.slice(0, 3)) {
    if (n.kind === "theme") continue;
    related[n.id] = relationsOf(readPage(n.id).root);
  }

  if (AS_JSON) {
    console.log(JSON.stringify({
      query: q,
      matches: scored.map((x) => ({ ...x.n, why: x.why })),
      theme: themeId ? { id: themeId, decide: themeBlocks.decide ?? null } : null,
      related,
    }, null, 2));
  } else {
    console.log(`# brief: ${q}\n\n## matches\n`);
    for (const { n, why } of scored) {
      console.log(`${n.id}  (${n.kind}/${n.band})  — ${n.essence}`);
      if (why) console.log(`    ↳ ${why.length > 150 ? why.slice(0, 150) + "…" : why}`);
    }
    if (themeId) {
      console.log(`\n## theme: ${themeId} — decide\n`);
      console.log(themeBlocks.decide ?? "(no decide block on this theme)");
    }
    for (const [id, rels] of Object.entries(related)) {
      console.log(`\n## related: ${id}\n`);
      const byType = {};
      for (const r of rels) (byType[r.label] ||= []).push(r);
      for (const [label, list] of Object.entries(byType)) {
        console.log(`${label}:`);
        for (const r of list) console.log(`  ${r.to}${r.note ? ` — ${r.note}` : ""}`);
      }
    }
    console.log(`\nNext: kb.mjs get <id> --block usage|tradeoffs`);
  }
} else if (cmd === "set" || cmd === "wild" || cmd === "production" || cmd === "explain" || cmd === "level" || cmd === "register") {
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
  /* An optional per-item lens tag, so a round trip through the dump keeps the tagging
   * `kb.mjs level` applied. Same closed vocabulary; `none` is simply omitting the key. */
  const levels = (v) => v.some((x) => x && x.level && !LEVELS.includes(x.level))
    ? `level must be one of ${LEVELS.join(", ")}` : null;

  /* Writer input is plain text plus ONE permitted inline tag. Everything is escaped, so a
   * hand-passed <a> or <script> still cannot reach the page — the no-links rule for these
   * blocks holds. <code> is the exception because the corpus genuinely uses it for
   * parameter and API names, and the structured dump hands it back. Existing character
   * references pass through so a round trip never turns &amp; into &amp;amp;. */
  const richText = (s) =>
    String(s)
      .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#[xX][0-9a-fA-F]+);)/g, "&amp;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/&lt;(\/?)code&gt;/g, "<$1code>");

  if (cmd === "set") {
    let touched = [];
    for (const key of ["aliases", "tags", "solves"]) {
      const v = parseList(key, strings);
      if (v === null) continue;
      /* Tags are the one list with a closed vocabulary and a size contract, and this is
       * the last point before it reaches a file. Catching it here names the offending tag
       * and the whole legal set; catching it in `make check` names a page. */
      if (key === "tags") {
        const unknown = v.filter((t) => !TAGS.has(t));
        if (unknown.length) {
          console.error(`--tags: not in the closed vocabulary: ${unknown.join(", ")}`);
          console.error(`  legal tags: ${[...TAGS].join(" ")}`);
          console.error("  add one to TAGS in scripts/lib/model.mjs only if it will apply to 3+ pages");
          process.exit(1);
        }
        if (v.length < 2 || v.length > 5) {
          console.error(`--tags: ${v.length} given; a page needs 2-5 (one tag groups nothing, six filter nothing)`);
          process.exit(1);
        }
      }
      if (v.length) doc.setAttribute(`data-kb-${key}`, JSON.stringify(v));
      else doc.removeAttribute(`data-kb-${key}`);
      touched.push(`${key}=${v.length}`);
    }
    /* Editorial pick, not a list: drives the hub's ★ chip and its Favourites filter. */
    const fav = opt("favourite");
    if (fav != null) {
      if (fav !== "true" && fav !== "false") { console.error("--favourite: must be true or false"); process.exit(1); }
      if (fav === "true") doc.setAttribute("data-kb-favourite", "true");
      else doc.removeAttribute("data-kb-favourite");
      touched.push(`favourite=${fav}`);
    }
    /* The terse one-liner behind the hub chip, meta description and JSON-LD — all
     * derived from this attribute, which is why it gets a writer instead of a
     * hand edit. Cannot be removed: every page must carry an essence. */
    const essence = opt("essence");
    if (essence != null) {
      if (!essence.trim()) { console.error("--essence: cannot be empty"); process.exit(1); }
      doc.setAttribute("data-kb-essence", essence.trim());
      touched.push("essence");
    }
    if (!touched.length) { console.error("nothing to set — pass --aliases / --tags / --solves / --favourite / --essence"); process.exit(1); }
    const out = root.toString();
    if (out !== src) writeFileSync(file, out);
    console.log(`${node.id}: ${touched.join(" ")}${out === src ? " (unchanged)" : ""}`);
  } else if (cmd === "wild") {
    const items = parseList("items", (v) =>
      !Array.isArray(v) ? "must be a JSON array"
      : v.some((x) => !x || typeof x !== "object") ? "every item must be an object"
      : v.some((x) => !x.id || !x.name || !x.note) ? "every item needs id, name and note"
      : levels(v));
    if (items === null) { console.error("pass --items '[{\"id\":…,\"name\":…,\"note\":…}]' — kb.mjs get <id> --block wild --json dumps the current ones"); process.exit(1); }

    const existing = root.querySelector('[data-kb-block="wild"]');
    if (!items.length) {
      if (existing) { writeFileSync(file, root.toString().replace(/ *<section class="doc-section" id="wild"[\s\S]*?<\/section>\n\n/, "")); }
      console.log(`${node.id}: wild removed`);
    } else {
      /* Optional href: a reference implementation or canonical write-up. The link
       * must be to the thing itself (repo, docs page) — never invented. */
      const rows = items.map((i) =>
        `        <div class="wild-item" data-kb-example="${i.id}"${i.level ? ` data-kb-level="${i.level}"` : ""}>${
          i.href ? `<strong><a href="${esc(i.href)}">${richText(i.name)}</a></strong>` : `<strong>${richText(i.name)}</strong>`
        }<span>${richText(i.note)}</span></div>`).join("\n");
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
  } else if (cmd === "production") {
    /* production — the system-builder block. Four labeled lists; the writer replaces
     * the whole block, so re-supply every list on edit. All-empty removes it. */
    const labeled = (v) =>
      !Array.isArray(v) ? "must be a JSON array"
      : v.some((x) => !x || typeof x !== "object") ? "every item must be an object"
      : v.some((x) => !x.label || !x.note) ? "every item needs label and note"
      : levels(v);
    /* A checklist gate is bare text, so a plain string stays the everyday form; the
     * object form exists to carry a lens tag back through a round trip. */
    const gates = (v) =>
      !Array.isArray(v) ? "must be a JSON array"
      : v.some((x) => typeof x === "string" ? !x.trim() : !x || typeof x !== "object" || !x.text)
        ? "every item must be a non-empty string, or an object with text"
      : levels(v.filter((x) => typeof x === "object"));
    if (["knobs", "signals", "failures", "checklist"].every((k) => opt(k) == null)) {
      console.error("pass --knobs / --signals / --failures ('[{\"label\":…,\"note\":…}]') and/or --checklist ('[\"…\"]')"
        + " — kb.mjs get <id> --block production --json dumps the current ones");
      process.exit(1);
    }
    const groups = [
      ["prod-knobs", "Tuning knobs", parseList("knobs", labeled) ?? []],
      ["prod-signals", "Signals to watch", parseList("signals", labeled) ?? []],
      ["prod-failures", "Failure modes under load", parseList("failures", labeled) ?? []],
      ["prod-checklist", "Readiness checklist",
        (parseList("checklist", gates) ?? []).map((s) => (typeof s === "string" ? { text: s } : s))],
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
            `            <li${i.level ? ` data-kb-level="${i.level}"` : ""}>${
              i.text != null ? richText(i.text) : `<strong>${richText(i.label)}</strong> — ${richText(i.note)}`
            }</li>`).join("\n");
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
  } else if (cmd === "explain") {
    /* explain — the three-level reading ladder. One prose paragraph per level, each
     * carrying data-kb-level, so the lenses STACK: advanced reads basic+advanced,
     * expert reads all three. Write the rungs to continue one another rather than
     * re-tell the same story. The writer replaces the whole block, so re-supply all
     * three on edit. All three empty removes it. */
    const texts = LEVELS.map((l) => opt(l));
    if (texts.some((t) => t == null)) {
      console.error(`pass all three: ${LEVELS.map((l) => `--${l} "…"`).join(" ")} (all empty to remove)`);
      process.exit(1);
    }
    const existing = root.querySelector('[data-kb-block="explain"]');
    const cut = / *<section class="doc-section" id="explain"[\s\S]*?<\/section>\n\n/;
    if (texts.every((t) => !t.trim())) {
      if (existing) writeFileSync(file, root.toString().replace(cut, ""));
      console.log(`${node.id}: explain removed`);
    } else {
      if (texts.some((t) => !t.trim())) { console.error("explain needs all three levels — a partial ladder is invalid"); process.exit(1); }
      const items = LEVELS.map((l, i) =>
        `        <div class="explain-item" id="explain-${l}" data-kb-level="${l}">
          <h3>${LEVEL_LABELS[l]}</h3>
          <p>${esc(texts[i])}</p>
        </div>`).join("\n");
      const block = `    <section class="doc-section" id="explain" aria-labelledby="h-explain" data-kb-block="explain">
      <h2 class="doc-h" id="h-explain">Explained at three levels</h2>
      <div class="explain">
${items}
      </div>
    </section>

`;
      let out = root.toString();
      /* explain sits right after the kind's lead block: insert before the first
       * later block that exists on the page. */
      const later = BLOCKS[node.kind].slice(BLOCKS[node.kind].indexOf("explain") + 1)
        .find((b) => root.querySelector(`[data-kb-block="${b}"]`));
      out = existing
        ? out.replace(cut, block)
        : later
          ? out.replace(new RegExp(`( *<section class="doc-section" id="${later}")`), block + "$1")
          : out.replace(/(\n *<nav class="docnav")/, "\n" + block + "$1");
      if (!out.includes('id="explain"')) { console.error(`${node.id}: could not place the block`); process.exit(1); }
      writeFileSync(file, out);
      console.log(`${node.id}: explain = ${LEVELS.map((l, i) => `${l}:${texts[i].trim().split(/\s+/).length}w`).join(" ")}`);
    }
  } else {
    /* level | register — the two authored per-element lens attributes.
     *   level    = min-level accretion: "visible from this level up". THE mechanism:
     *              untagged is the basic core, and tagging pushes depth up a lens.
     *   register = exact-match variant: "rendered at exactly this lens"; adjacent
     *              registered siblings form one variant group. RARE — reach for it
     *              only where showing both versions at once would be wrong.
     * An element carries at most ONE of the two (make check enforces the XOR).
     * Sections and the explain ladder's own items are refused — sections always
     * show, and the ladder is written whole via kb.mjs explain. */
    const attr = `data-kb-${cmd}`;                       // data-kb-level | data-kb-register
    const other = cmd === "level" ? "data-kb-register" : "data-kb-level";
    const [, , target, level] = positional;
    if (!target || !level) { console.error(`usage: kb.mjs ${cmd} <id> <element-id> <basic|advanced|expert|none>`); process.exit(1); }
    if (level !== "none" && !LEVELS.includes(level)) {
      console.error(`"${level}" is not a level — use ${LEVELS.join("/")} or none`); process.exit(1);
    }
    const el = root.querySelector(`[id="${target}"]`);
    if (!el) { console.error(`${node.id}: no element with id "${target}"`); process.exit(1); }
    if (el.getAttribute("data-kb-block")) {
      console.error(`"${target}" is a section — blocks show at every lens; adapt the content inside instead`);
      process.exit(1);
    }
    if (el.closest('[data-kb-block="explain"]')) {
      console.error(`"${target}" is part of the explain ladder — its registers are structural, edit via kb.mjs explain`);
      process.exit(1);
    }
    if (level !== "none" && el.getAttribute(other) != null) {
      console.error(`"${target}" already carries ${other} — an element takes level OR register, never both (use "${other === "data-kb-level" ? "level" : "register"} ${node.id} ${target} none" first)`);
      process.exit(1);
    }
    if (level === "none") el.removeAttribute(attr);
    else el.setAttribute(attr, level);
    const out = root.toString();
    if (out !== src) writeFileSync(file, out);
    console.log(`${node.id}: ${target} ${cmd}=${level}${out === src ? " (unchanged)" : ""}`);
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
    /* A kind whose folder does not exist yet is empty, not a crash. KIND_DIR gains a kind
     * the moment the toolchain learns about it, which is before the first page of that
     * kind lands — `comparison` sat in the table with no directory for exactly that
     * window, and a bare walk turned the whole-corpus lint into an ENOENT stack trace. */
    for (const d of Object.values(KIND_DIR)) {
      const dir = join(SITE, d);
      if (existsSync(dir)) targets.push(...walk(dir));
    }
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
} else if (cmd === "refs") {
  /* The inverse of backlinks: everything this page points AT. Read live off the page
   * rather than out of graph.json, because the graph is stale until `make all` runs and
   * the question this answers — "what did the edit I just made start or stop using?" —
   * is asked before the build.
   *
   * A cross-page reference rides on four different carriers and only one of them is
   * written by a tool, so they are reported separately rather than merged. The last line
   * is the one that matters: pages linked in prose with no typed relation to match. */
  const graph = load("graph.json");
  let relPath, id;
  const fileArg = opt("file");
  if (fileArg) {
    const abs = resolve(fileArg);
    relPath = relative(SITE, abs);
    if (relPath.startsWith("..")) { console.error(`not under site/: ${fileArg}`); process.exit(1); }
    if (!existsSync(abs)) { console.error(`no such file: ${fileArg}`); process.exit(1); }
    id = relPath.split("/").pop().replace(/\.html$/, "");
  } else {
    const node = graph.nodes[positional[1]];
    if (!node) { console.error(`unknown id: ${positional[1]}`); process.exit(1); }
    id = node.id; relPath = node.path;
  }

  const root = parse(readFileSync(join(SITE, relPath), "utf8"), PARSE_OPTS);
  const name = root.querySelector(".doc-title")?.text.trim() ?? id;
  const byPath = {};
  for (const n of Object.values(graph.nodes)) byPath[n.path] = n.id;
  const toId = (href) => {
    const bare = href.split("#")[0].split("?")[0];
    if (!bare.endsWith(".html") || /^(https?:|mailto:|\/\/)/.test(bare)) return null;
    return byPath[relative(SITE, resolve(join(SITE, dirname(relPath)), bare))] ?? null;
  };

  const relations = root.querySelectorAll("[data-kb-rel]").map((el) => ({
    rel: el.getAttribute("data-kb-rel"), to: el.getAttribute("data-kb-to"),
  }));
  const members = root.querySelectorAll("[data-kb-member]").map((el) => ({
    to: el.getAttribute("data-kb-member"), role: el.getAttribute("data-kb-role"),
  }));
  const fluency = root.querySelectorAll(".fluency-item")
    .map((el) => el.getAttribute("data-kb-theme")).filter(Boolean);

  /* Prose links are every internal link that is NOT already one of the typed carriers
   * rendering itself as a link — the same exclusion build.mjs uses to derive mentions. */
  const proseLinks = [];
  for (const a of root.querySelectorAll("main a[href]")) {
    if (a.closest(PROSE_LINK_EXCLUDE)) continue;
    const to = toId(a.getAttribute("href"));
    if (to && to !== id && !proseLinks.includes(to)) proseLinks.push(to);
  }

  /* Real clickable links that live in diagram text rather than markup. */
  const CLICK = /\bclick\s+[A-Za-z0-9_]+\s+"([^"]+)"/g;
  const clicks = [];
  for (const pre of root.querySelectorAll("pre.mermaid")) {
    CLICK.lastIndex = 0;
    let m;
    while ((m = CLICK.exec(pre.text))) {
      const to = toId(m[1]);
      if (to && to !== id && !clicks.includes(to)) clicks.push(to);
    }
  }

  const typed = new Set([...relations.map((r) => r.to), ...members.map((m) => m.to), ...fluency]);
  const untyped = [...new Set([...proseLinks, ...clicks])].filter((t) => !typed.has(t));

  if (AS_JSON) {
    console.log(JSON.stringify({ id, path: relPath, relations, members, fluency, proseLinks, clicks, untyped }, null, 2));
  } else {
    console.log(`# ${name}  [${id}]\n`);
    const byVerb = {};
    for (const r of relations) (byVerb[r.rel] ||= []).push(r.to);
    console.log(`relations (${relations.length})`);
    for (const [verb, list] of Object.entries(byVerb)) console.log(`  ${verb}: ${list.join(", ")}`);
    if (members.length) console.log(`\ntheme members (${members.length})\n  ${members.map((m) => `${m.to}${m.role ? ` [${m.role}]` : ""}`).join(", ")}`);
    if (fluency.length) console.log(`\nfluency tie-ins (${fluency.length})\n  ${fluency.join(", ")}`);
    console.log(`\nprose links (${proseLinks.length})${proseLinks.length ? `\n  ${proseLinks.join(", ")}` : ""}`);
    console.log(`\nmermaid clicks (${clicks.length})${clicks.length ? `\n  ${clicks.join(", ")}` : ""}`);
    console.log(`\nuntyped — linked in prose, no typed relation (${untyped.length})${untyped.length ? `\n  ${untyped.join(", ")}` : ""}`);
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
} else if (cmd === "unlink") {
  /* The inverse of link, and the reason it exists: an edge lives on two pages, so retiring
   * one by hand is two edits in two files plus remembering the rel-group that just went
   * empty. Verb-agnostic — it removes whatever each side declared, wherever it sits. */
  const [, aId, bId] = positional;
  if (!aId || !bId) { console.error("usage: kb.mjs unlink <a> <b>"); process.exit(1); }
  const graph = load("graph.json");
  const a = graph.nodes[aId], b = graph.nodes[bId];
  if (!a) { console.error(`unknown id: ${aId}`); process.exit(1); }
  if (!b) { console.error(`unknown id: ${bId}`); process.exit(1); }
  if (aId === bId) { console.error("a page cannot relate to itself"); process.exit(1); }

  /* Exactly one cut per file. An element's range is an offset into the source about to be
   * sliced, so a second cut would be measured against text that no longer exists. */
  const cutSide = (page, other) => {
    const file = join(SITE, page.path);
    const src = readFileSync(file, "utf8");
    const item = parse(src, PARSE_OPTS).querySelector(`[data-kb-rel][data-kb-to="${other.id}"]`);
    if (!item) return null;
    const verb = item.getAttribute("data-kb-rel");
    /* A group is a label over a list. Losing its last item would leave the label standing
     * over nothing, so the group goes with it. */
    const group = item.closest(".rel-group");
    const lone = !!group && group.querySelectorAll("[data-kb-rel]").length === 1;
    let [start, end] = (lone ? group : item).range;
    while (start > 0 && (src[start - 1] === " " || src[start - 1] === "\t")) start--;
    if (src[end] === "\n") end++;
    const head = src.slice(0, start), tail = src.slice(end);
    /* Removing a whole group also removes one side of the blank line that separated it
     * from its neighbour, stacking two blanks at the seam. Collapse the seam, and only
     * the seam — a global squeeze would reformat prose that has nothing to do with this. */
    const before = head.match(/\n+$/)?.[0].length ?? 0;
    const after = tail.match(/^\n+/)?.[0].length ?? 0;
    writeFileSync(file, before + after > 2
      ? head.slice(0, head.length - before) + "\n\n" + tail.slice(after)
      : head + tail);
    return { verb, lone };
  };

  const cuts = [[a, b, cutSide(a, b)], [b, a, cutSide(b, a)]];
  for (const [page, other, cut] of cuts) {
    if (cut) console.log(`${page.id}: removed ${cut.verb} → ${other.id}${cut.lone ? " (with its now-empty group)" : ""}`);
    else console.error(`${page.id}: no relation to ${other.id}`);
  }
  if (!cuts.some(([, , cut]) => cut)) process.exit(1);
  console.log("Now run: make all && make check");
} else if (cmd === "new") {
  /* Scaffold a structurally valid page. The author fills the TODOs, then:
   * kb.mjs set / link / production, and finally make all && make check. */
  const id = positional[1];
  const kind = opt("kind"), bandId = opt("band"), name = opt("name"), order = opt("order");
  const group = opt("group") ?? bandId;
  if (!id || !kind || !name || order == null || (kind === "pattern" && !bandId)) {
    console.error('usage: kb.mjs new <id> --kind pattern|hazard|theme|principle|design|capability|comparison --band <b> [--group <g>] --name "…" --order <n> [--tags \'["a","b"]\']\n  (--band is required only for --kind pattern)');
    process.exit(1);
  }
  /* Tags at scaffold time, so a page can be born inside the 2-5 contract instead of
   * waiting for a `set` call the author may not reach before the next `make check`.
   * Parsed here rather than through the writer branch's parseList, which is scoped to it. */
  let newTags = null;
  const rawTags = opt("tags");
  if (rawTags != null) {
    try { newTags = JSON.parse(rawTags); }
    catch (e) { console.error(`--tags is not valid JSON: ${e.message}`); process.exit(1); }
    if (!Array.isArray(newTags) || newTags.some((t) => typeof t !== "string" || !t.trim())) {
      console.error("--tags must be a JSON array of non-empty strings");
      process.exit(1);
    }
    const unknown = newTags.filter((t) => !TAGS.has(t));
    if (unknown.length) {
      console.error(`--tags: not in the closed vocabulary: ${unknown.join(", ")}`);
      console.error(`  legal tags: ${[...TAGS].join(" ")}`);
      process.exit(1);
    }
    if (newTags.length < 2 || newTags.length > 5) {
      console.error(`--tags: ${newTags.length} given; a page needs 2-5`);
      process.exit(1);
    }
  }
  /* Guard the kind before folderFor sees it: an unknown kind makes folderFor return
   * undefined and the failure surfaces as a raw TypeError out of join(). */
  if (!BLOCKS[kind]) { console.error(`unknown kind: ${kind} (one of ${Object.keys(BLOCKS).join(", ")})`); process.exit(1); }
  const band = kind === "pattern" ? bandId : kind;
  if (kind === "pattern" && !bandOf(bandId)) { console.error(`unknown band: ${bandId}`); process.exit(1); }

  let dir;
  try { dir = folderFor({ kind, band, group: kind === "pattern" ? group : kind }); }
  catch (e) { console.error(e.message); process.exit(1); }
  const file = join(SITE, dir, `${id}.html`);
  if (existsSync(file)) { console.error(`already exists: ${relative(ROOT, file)}`); process.exit(1); }

  const html = pageSkeleton({ id, name, kind, band, group: kind === "pattern" ? group : kind, order, tags: newTags });
  writeFileSync(file, html);
  console.log(`${relative(ROOT, file)} written. Next:`);
  console.log(`  1. replace the TODOs (prose, diagram, sketch, essence)`);
  console.log(`  2. node scripts/kb.mjs set ${id} --aliases … ${newTags ? "" : "--tags … "}--solves …`);
  console.log(`  3. node scripts/kb.mjs link ${id} <verb> <other-id> --note "…"`);
  console.log(`  4. renumber data-kb-order neighbours if needed, then make all && make check`);
} else {
  /* Rendered from lib/cli-spec.mjs rather than from this file's own header comment: the
   * surface is also published on vocab.html, and two hand-maintained copies drift. */
  console.log(usageText(USAGE_HEADER));
  process.exit(cmd ? 1 : 0);
}
