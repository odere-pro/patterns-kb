/* 2026-08-distributed-group-split.mjs — one-shot migration: split two distributed groups.
 *
 * "Routing & Scale" and "Coordination & Data" had each grown past 25 patterns. A heading
 * joined by "&" is a heading doing two jobs, so each became two:
 *
 *   distributed-routing      → distributed-routing  (Routing) + distributed-scale (Scale)
 *   distributed-coordination → distributed-coordination (Coordination) + distributed-data (Data)
 *
 * The FILES DO NOT MOVE. `BANDS` gives the two new groups a `dir` alias pointing at the
 * directory their pages already sit in, so folderFor() still resolves and every relative
 * link into and out of these pages stays correct. All this migration does is rewrite one
 * attribute on the pages that changed group — which is why it exists at all: kb.mjs has no
 * `set --group`, and data-kb-group must never be hand-edited across 27 files.
 *
 * Idempotent: a page already declaring its target group is skipped, so a re-run is a no-op
 * and a half-finished run can simply be re-run. Run once, then `make all` — build-pages.mjs
 * projects data-kb-group into each page's JSON-LD, so those 27 pages get a second diff and
 * must be committed together with model.mjs.
 *
 *   node scripts/migrations/2026-08-distributed-group-split.mjs [--dry]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dry = process.argv.includes("--dry");

/* The editorial split, and the only place it is written down. Everything absent from these
 * lists keeps the group it has — Routing and Coordination are the residue, so listing only
 * the movers keeps the diff honest about what changed.
 *
 * Routing keeps how a request FINDS its service (entry points, proxies, addressing, the
 * published contract, and shifting traffic between versions). Scale takes how you ADD
 * capacity and spread load across it. */
const TO_SCALE = [
  "load-balancer", "consistent-hashing", "sharding", "autoscaling", "cdn",
  "object-storage", "geohash", "stateless-service", "compute-resource-consolidation",
  "deployment-stamp", "geode", "vertical-partitioning", "functional-partitioning",
];
/* Coordination keeps AGREEMENT between moving parts — who leads, who holds the lock, what
 * order things happen in, how a multi-step process survives. Data takes how bytes are
 * stored, replicated, derived and summarised. */
const TO_DATA = [
  "outbox", "inbox", "materialized-view", "index-table", "write-ahead-log", "bloom-filter",
  "replication", "lsm-tree", "change-data-capture", "count-min-sketch", "hyperloglog",
  "mapreduce", "sliding-window",
];

const MOVES = [
  ...TO_SCALE.map((id) => ({ id, dir: "routing", group: "distributed-scale" })),
  ...TO_DATA.map((id) => ({ id, dir: "coordination", group: "distributed-data" })),
];

let changed = 0;
let skipped = 0;
const missing = [];

for (const { id, dir, group } of MOVES) {
  const file = join(ROOT, "site", "patterns", "distributed", dir, `${id}.html`);
  if (!existsSync(file)) { missing.push(`${dir}/${id}.html`); continue; }

  const html = readFileSync(file, "utf8");
  if (html.includes(`data-kb-group="${group}"`)) { skipped += 1; continue; }

  /* Anchored on the id so a stray data-kb-group elsewhere in the file cannot match — the
   * attribute appears once, on main.doc-wrap, and that is the only one to touch. */
  const re = new RegExp(`(data-kb-id="${id}"[^>]*?data-kb-group=")[^"]*(")`);
  if (!re.test(html)) { missing.push(`${dir}/${id}.html (no data-kb-group on its doc-wrap)`); continue; }

  if (!dry) writeFileSync(file, html.replace(re, `$1${group}$2`));
  changed += 1;
}

console.log(
  `${dry ? "would regroup" : "regrouped"} ${changed} page(s) ` +
  `(${TO_SCALE.length} → distributed-scale, ${TO_DATA.length} → distributed-data); ` +
  `${skipped} already done.`,
);
if (missing.length) {
  console.error(`\n${missing.length} page(s) could not be rewritten:`);
  for (const f of missing) console.error(`  ${f}`);
  process.exit(1);
}
