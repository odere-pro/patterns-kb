#!/usr/bin/env node
/* report-lens.mjs — how heavy is each page at each reading lens?
 *
 * The lens model is cumulative: basic is the short AWS-doc page everyone reads,
 * advanced adds what it takes to run the design, expert adds the deep dives. That
 * only holds if basic actually stays short, which is a measurement, not an opinion —
 * so this weighs every page at every lens and scores basic against the sizing band
 * for its kind and band (tmp/plans/levels/00-index.md, restated in BANDS_W below).
 *
 *   node scripts/report-lens.mjs                    every page, one line each
 *   node scripts/report-lens.mjs --band gof         one band (or --kind principle)
 *   node scripts/report-lens.mjs outbox cache-aside just these ids
 *   node scripts/report-lens.mjs --json             for the sweep orchestrator
 *   node scripts/report-lens.mjs --strict           exit 1 if any page is out of band
 *
 * Words are counted off the same pruning the reader uses (lib/lens.mjs), with page
 * chrome and mermaid sources dropped — i.e. roughly what `kb.mjs get <id> --level L`
 * prints. Without --strict it always exits 0: during the correction waves most pages
 * are legitimately out of band, and the report is the worklist.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";
import { LEVELS } from "./lib/model.mjs";
import { pruneForLens } from "./lib/lens.mjs";

const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");

/* Sizing bands: [min, max] words at the BASIC lens. null = no numeric target yet
 * (a theme's basic page is a framing lead plus tour names, too small to band).
 *
 * A conceptual pattern carrying a `production` block gets a wider ceiling, because
 * that block imposes a floor the band cannot tag away: every .prod-group must render
 * non-empty at every lens (validate.mjs), so four labelled cards cost 90-170 basic
 * words of knobs, signals, failure modes and gates before a single word of pedagogy.
 * Banding such a page at 600 asks for something structurally impossible — it is not a
 * conceptual page's word budget any more, it is that budget plus a fixed operational
 * tax, so it sits between the conceptual and implementation bands. Pages WITHOUT the
 * block keep the tighter 600 ceiling, which is what actually holds authors honest. */
const IMPLEMENTATION = new Set([
  "distributed", "messaging", "caching", "enterprise", "architecture", "concurrency", "security",
]);
const BANDS_W = {
  pattern: (band, hasProduction) =>
    IMPLEMENTATION.has(band) ? [550, 900] : hasProduction ? [350, 750] : [350, 600],
  hazard: () => [400, 650],
  principle: () => [350, 550],
  design: () => [900, 1500],
  theme: () => null,
};

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i < 0 ? null : argv[i + 1]; };
const BOOL_FLAGS = new Set(["json", "strict"]);
const ids = argv.filter((a, i) =>
  !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && !BOOL_FLAGS.has(argv[i - 1].slice(2))));

const AS_JSON = flag("json");
const STRICT = flag("strict");
const wantBand = opt("band");
const wantKind = opt("kind");

/* Page chrome the reader strips too — it is navigation, not content. */
const NOISE = "script, style, link, .crumb, .docnav, .doc-metarow, .practice";

/** Visible words of one page at one lens (null lens = the whole page). */
function weigh(html, lens) {
  const full = parse(html, { comment: true });
  const root = full.querySelector("main") ?? full;
  for (const n of root.querySelectorAll(NOISE)) n.remove();
  for (const n of root.querySelectorAll("figure.diagram")) n.remove();  // mermaid source is not prose
  /* The typed-relations block is an index of neighbours, not reading matter, and it is
   * the one block no lens can touch: rel rows carry no lens attributes and get no minted
   * ids, so the same words land at basic, advanced and expert alike. Counting them
   * measures how many neighbours a page has, not how much a reader must read — and
   * because the cost is fixed while basic is the smallest lens, it falls hardest exactly
   * where the band is tightest (on pubsub: 267w, 32% of basic but 11% of expert). Left
   * in, it pushes authors to cut usage and production items to pay for a link list. */
  for (const n of root.querySelectorAll('[data-kb-block="relationships"]')) n.remove();
  pruneForLens(root, lens);
  return root.text.split(/\s+/).filter(Boolean).length;
}

const graph = JSON.parse(readFileSync(join(SITE, "assets", "graph.json"), "utf8"));
const idSet = new Set(ids);
for (const id of idSet) {
  if (!graph.nodes[id]) { console.error(`unknown id: ${id}`); process.exit(1); }
}

const rows = [];
for (const node of Object.values(graph.nodes)) {
  if (idSet.size && !idSet.has(node.id)) continue;
  if (wantBand && node.band !== wantBand) continue;
  if (wantKind && node.kind !== wantKind) continue;

  const html = readFileSync(join(SITE, node.path), "utf8");
  const words = Object.fromEntries(LEVELS.map((l) => [l, weigh(html, l)]));
  const hasProduction = html.includes('data-kb-block="production"');
  const target = (BANDS_W[node.kind] ?? (() => null))(node.band, hasProduction);
  const share = words.expert ? words.basic / words.expert : 0;
  const verdict = !target ? "n/a"
    : words.basic < target[0] ? "under"
      : words.basic > target[1] ? "over" : "ok";
  rows.push({
    id: node.id, kind: node.kind, band: node.band,
    basic: words.basic, advanced: words.advanced, expert: words.expert,
    share: Math.round(share * 100) / 100,
    target, verdict,
  });
}

const offBand = rows.filter((r) => r.verdict === "under" || r.verdict === "over");

if (AS_JSON) {
  console.log(JSON.stringify({ rows, summary: countBy(rows) }, null, 2));
} else {
  const w = Math.max(2, ...rows.map((r) => r.id.length));
  for (const r of rows) {
    const band = r.target ? `${r.target[0]}-${r.target[1]}` : "—";
    console.log(
      `${r.id.padEnd(w)} ${r.kind.padEnd(9)} ${r.band.padEnd(13)} ` +
      `${String(r.basic).padStart(5)} ${String(r.advanced).padStart(5)} ${String(r.expert).padStart(5)} ` +
      `${String(Math.round(r.share * 100) + "%").padStart(5)}  ${r.verdict.padEnd(5)} ${band}`);
  }
  const s = countBy(rows);
  console.log(`\n${rows.length} page(s): ` +
    LEVELS.map((l) => `${l} median ${median(rows.map((r) => r[l]))}w`).join(", "));
  console.log(`basic band: ${s.ok} ok, ${s.under} under, ${s.over} over, ${s["n/a"]} untargeted.`);
}

if (STRICT && offBand.length) process.exit(1);

function countBy(list) {
  const out = { ok: 0, under: 0, over: 0, "n/a": 0 };
  for (const r of list) out[r.verdict]++;
  return out;
}
function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
