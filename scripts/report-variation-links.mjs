#!/usr/bin/env node
/* report-variation-links.mjs — find variation cards that name a page without linking it.
 *
 * The authoring contract says that when a variation names a page the KB already has, the
 * <dt> links it: "Wrap only the page-name portion and leave the qualifier as plain text."
 * Nothing enforced or even reported that, and most <dt>s carry no anchor at all. This is
 * the worklist.
 *
 * It REPORTS, it does not gate. A name collision is not a reference — "Streaming Gateway"
 * is not the streaming theme and "Per-aggregate stream" is not the aggregate pattern — so
 * every finding needs a human to read the <dt> and its <dd> before wiring anything. It is
 * deliberately NOT wired into `make check` for that reason.
 *
 * It walks the three blocks that share the card markup: a pattern's `variations`, a
 * capability's `capabilities`, and a comparison's `contenders`. The owning block travels
 * with every finding, because a product name in a `contenders` <dt> earns a link on
 * different grounds than a variant name in a `variations` <dt>.
 *
 * Matching is by slug segments, split on how many segments the phrase has:
 *   - multi-segment ("priority-queue", "copy-on-write") may match anywhere in the <dt>;
 *   - single-segment ("streaming", "caching", "state") match ONLY when they are the whole
 *     <dt>, which is what keeps the collision class the contract warns about out of here.
 * A window covering the entire <dt> is `exact` whatever its length; otherwise offset 0 is
 * `leading` and a later offset is `interior`. Longest phrase wins at a given offset, and
 * the scan advances past a consumed window, so one <dt> can report two distinct targets.
 *
 * Suppression is PER-<dt>, not per-page — unlike report-links.mjs, which suppresses a
 * target linked anywhere on the page. That is right for "name a page once in prose" and
 * wrong here: the card itself is the affordance, the rule is unconditional, and a page's
 * generated relationships block would otherwise silence every card naming a neighbour it
 * already has a typed edge to.
 *
 *   node scripts/report-variation-links.mjs                  every page
 *   node scripts/report-variation-links.mjs load-leveling    only these ids
 *   node scripts/report-variation-links.mjs --min leading    drop the interior tier
 *   node scripts/report-variation-links.mjs --json           machine-readable
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";
import { PROSE_LINK_EXCLUDE } from "./lib/model.mjs";

const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");

/* The three blocks whose items render as the same <dl class="variations"> card. */
const CARD_BLOCKS = new Set(["variations", "capabilities", "contenders"]);

/* Page ids that are ordinary English at least as often as they are a reference. Inherited
 * verbatim from report-links.mjs — the words that buried its real finds bury these too.
 * The single-segment rule already confines most of them to a whole-<dt> match, so they
 * cost little to keep and would misfire loudly on the ones that are common headings
 * ("State", "Caching", "Sharding" are all plausible <dt>s about something else). */
const AMBIGUOUS = new Set([
  "state", "entity", "provider", "observer", "command", "builder", "adapter", "facade",
  "proxy", "bridge", "strategy", "visitor", "iterator", "mediator", "memento", "prototype",
  "registry", "repository", "gateway", "saga", "monad", "singleton", "factory", "decorator",
  "composite", "flyweight", "template-method", "interpreter", "replication", "batching",
  "sharding", "caching", "partitioning", "indexing", "pagination", "throttling",
]);

/* Phrases — usually aliases — that are ordinary English whoever owns them. Each earned its
 * place by misfiring on a real <dt>. */
const AMBIGUOUS_PHRASES = new Set([
  // Alias of api-gateway, and it re-admits the `gateway` page's own name from AMBIGUOUS by
  // the back door: acl's <dt> "Gateway" links enterprise/gateway.html and was told to
  // point at api-gateway instead.
  "gateway",
  // Alias of the auth-and-access theme, but it is the ordinary noun phrase of the whole
  // field: it fired inside "Access Control Lists (ACL)", "Attribute-Based Access Control"
  // and "Relationship-Based Access Control", none of which reference the theme.
  "access-control",
  // Alias of the file-system design kata. fake-object's "In-memory file system" is a test
  // double for disk I/O, not the kata about building one.
  "in-memory-file-system",
]);

const graph = JSON.parse(readFileSync(join(SITE, "assets", "graph.json"), "utf8"));
const nodes = Object.values(graph.nodes);

const slug = (s) => s.toLowerCase().replace(/&amp;/g, " and ")
                     .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const segs = (s) => { const t = slug(s); return t ? t.split("-") : []; };

/* Phrase index, split by segment count — the one decision that makes this precise. */
const multi = new Map();   // slug → { id, phrase, len }, longest phrase per slug
const single = new Map();  // slug → { id, phrase, len }
let maxLen = 1;
for (const n of nodes) {
  if (AMBIGUOUS.has(n.id)) continue;
  for (const phrase of [n.id, n.name, ...(n.aliases ?? [])]) {
    if (!phrase) continue;
    const key = slug(phrase);
    if (!key || AMBIGUOUS_PHRASES.has(key)) continue;
    const len = key.split("-").length;
    const bucket = len === 1 ? single : multi;
    if (!bucket.has(key)) bucket.set(key, { id: n.id, phrase, len });
    if (len > maxLen) maxLen = len;
  }
}

const byPath = {};
for (const n of nodes) byPath[n.path] = n.id;

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const TIERS = ["exact", "leading", "interior"];
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const minIdx = args.indexOf("--min");
const minTier = minIdx >= 0 ? args[minIdx + 1] : "interior";
if (!TIERS.includes(minTier)) {
  console.error(`--min takes one of ${TIERS.join(", ")}`);
  process.exit(0);
}
const maxRank = TIERS.indexOf(minTier);
const only = new Set(args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--min"));

/* Every target named in this <dt>, longest phrase first, scanning left to right. */
function candidates(text) {
  const parts = segs(text);
  const hits = [];
  for (let i = 0; i < parts.length; ) {
    let hit = null;
    for (let len = Math.min(maxLen, parts.length - i); len >= 1; len--) {
      const key = parts.slice(i, i + len).join("-");
      const whole = i === 0 && len === parts.length;
      /* A single-segment phrase is a reference only when it is the entire <dt>. */
      const found = len === 1 ? (whole ? single.get(key) : null) : multi.get(key);
      if (found) { hit = { ...found, offset: i, whole }; break; }
    }
    if (!hit) { i += 1; continue; }
    hits.push(hit);
    i += hit.len;
  }
  return hits;
}

const findings = [];

for (const file of walk(SITE)) {
  const root = parse(readFileSync(file, "utf8"), { comment: true });
  const main = root.querySelector("main.doc-wrap");
  const self = main?.getAttribute("data-kb-id");
  if (!self) continue;
  if (only.size && !only.has(self)) continue;
  const node = graph.nodes[self];
  if (!node) continue;

  /* Mirrors the mention derivation in build.mjs: a target already declared as a typed
   * relation, a theme, or a tour member never becomes a mention, and neither does one the
   * page already prose-links. Anything else is a new "Mentioned by" entry — and a
   * graph.json churn — the moment this link is wired. */
  const declared = new Set([
    ...node.relations.map((r) => r.to),
    ...node.themes.map((t) => t.id),
    ...node.memberPatterns.map((m) => m.id),
  ]);
  const proseLinks = new Set();
  for (const a of main.querySelectorAll("a[href]")) {
    if (a.closest(PROSE_LINK_EXCLUDE)) continue;
    const href = a.getAttribute("href").split("#")[0];
    if (!href.endsWith(".html")) continue;
    const target = byPath[relative(SITE, resolve(join(SITE, dirname(node.path)), href))];
    if (target) proseLinks.add(target);
  }

  for (const section of main.querySelectorAll("section[data-kb-block]")) {
    const block = section.getAttribute("data-kb-block");
    if (!CARD_BLOCKS.has(block)) continue;

    for (const dt of section.querySelectorAll("dl.variations dt")) {
      const text = dt.textContent.replace(/\s+/g, " ").trim();
      if (!text) continue;

      /* Suppress per-<dt> only. The card is the affordance; a link elsewhere on the page
       * does not give this reader one. */
      const already = new Set();
      for (const a of dt.querySelectorAll("a[href]")) {
        const s = a.getAttribute("href").split("#")[0].split("/").pop()?.replace(/\.html$/, "");
        if (s) already.add(s);
      }

      for (const hit of candidates(text)) {
        if (hit.id === self || already.has(hit.id)) continue;
        const match = hit.whole ? "exact" : hit.offset === 0 ? "leading" : "interior";
        if (TIERS.indexOf(match) > maxRank) continue;
        const target = graph.nodes[hit.id];
        const rel = relative(dirname(file), join(SITE, target.path));
        findings.push({
          page: self,
          file: file.slice(ROOT.length + 1),
          block,
          item: dt.getAttribute("id") ?? null,
          text,
          target: hit.id,
          phrase: hit.phrase,
          match,
          offset: hit.offset,
          href: rel.startsWith(".") ? rel : `./${rel}`,
          newMention: !declared.has(hit.id) && !proseLinks.has(hit.id),
        });
      }
    }
  }
}

findings.sort((a, b) =>
  a.file.localeCompare(b.file) ||
  TIERS.indexOf(a.match) - TIERS.indexOf(b.match) ||
  (a.item ?? "").localeCompare(b.item ?? ""));

if (asJson) {
  console.log(JSON.stringify(findings, null, 2));
} else if (!findings.length) {
  console.log("OK — every variation card that names a page links it.");
} else {
  let current = "";
  for (const f of findings) {
    if (f.file !== current) { current = f.file; console.log(`\n${f.file}`); }
    const mention = f.newMention ? "  +mention" : "";
    console.log(`  [${f.block}/${f.item ?? "?"}] ${f.match.padEnd(8)} “${f.text}” → ${f.target}  (“${f.phrase}”)${mention}`);
    console.log(`      ${f.href}`);
  }
  const by = (t) => findings.filter((f) => f.match === t).length;
  const pages = new Set(findings.map((f) => f.page)).size;
  console.log(`\n${findings.length} unlinked variation name(s) across ${pages} page(s) — ` +
    TIERS.filter((t) => TIERS.indexOf(t) <= maxRank).map((t) => `${by(t)} ${t}`).join(", ") + ".");
  console.log("Heuristic — read the <dt> and its <dd> before wiring. A name collision is not");
  console.log("a reference, and a wrong link costs the reader more than a missing one.");
}
