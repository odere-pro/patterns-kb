#!/usr/bin/env node
/* audit-products.mjs — gate scripts/lib/products.mjs, the only place this repo keeps an
 * external URL. Part of `make check`.
 *
 * check-links.mjs deliberately skips external hrefs, so before this script nothing in the
 * toolchain looked at a vendor URL at all. Three things are gated and one is reported:
 *
 *   FAIL   a registry entry no mapping cell uses. A name nothing renders is a URL nobody
 *          checks, and it rots unnoticed.
 *   FAIL   a URL that is not https, or that points at a bare homepage rather than at
 *          documentation.
 *   FAIL   a name registered under a provider whose column never says it (a Google product
 *          filed under azure would silently send readers to the wrong cloud).
 *   REPORT product names appearing in mapping cells with no registry entry — a worklist, the
 *          same posture report-links.mjs takes, because "is this fragment a product name?"
 *          is a judgement call and not something to fail a build over.
 *
 * The capability pages are the source of truth here, not the derived stack page: an entry
 * used by a row that is not pinned yet is anticipating a pin, not dead.
 *
 * `--online` additionally fetches every URL and reports what no longer answers 200. It is
 * NEVER part of `make check` — CI has no business depending on 40 vendor sites being up.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";
import { PRODUCTS, PROVIDER_COLUMNS, registryEntries } from "./lib/products.mjs";

const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");

const problems = [];
const notes = [];

/* ---------------- what the mapping tables actually say ---------------- */
/* Cell text per provider column, gathered from every capability page's mapping table. */
const said = Object.fromEntries(PROVIDER_COLUMNS.map((p) => [p, []]));
const capDir = join(SITE, "capabilities");
for (const file of readdirSync(capDir).filter((f) => f.endsWith(".html"))) {
  const root = parse(readFileSync(join(capDir, file), "utf8"));
  for (const tr of root.querySelectorAll('[data-kb-block="mapping"] tbody tr')) {
    // Cell 0 is the capability label; 1..4 are AWS / Azure / Google Cloud / Open source.
    tr.querySelectorAll("td").slice(1).forEach((td, i) => {
      const provider = PROVIDER_COLUMNS[i];
      if (provider) said[provider].push(td.text.trim());
    });
  }
}

/* Same boundary rule as linkifyProducts, so "used" here means "would actually link". */
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (haystack, name) =>
  new RegExp(`(?<![A-Za-z0-9])${reEscape(name)}(?![A-Za-z0-9])`).test(haystack);

/* ---------------- gate: every entry is used, and used by its own provider ---------------- */
for (const { provider, name, url } of registryEntries()) {
  const usedHere = said[provider].some((cell) => mentions(cell, name));
  if (!usedHere) {
    const elsewhere = PROVIDER_COLUMNS.filter((p) =>
      p !== provider && said[p].some((cell) => mentions(cell, name)));
    problems.push(elsewhere.length
      ? `${provider}: "${name}" is registered here but only ever appears in the ${elsewhere.join(", ")} column — wrong provider, so its readers would land on the wrong cloud's docs`
      : `${provider}: "${name}" is registered but no mapping cell says it — dead entry, nothing renders this URL`);
  }

  let parsed;
  try { parsed = new URL(url); } catch { problems.push(`${provider}: "${name}" has an unparseable URL: ${url}`); continue; }
  if (parsed.protocol !== "https:") problems.push(`${provider}: "${name}" is not https: ${url}`);
  /* The rule is "point at documentation, not at a homepage". A path beyond "/" satisfies it;
   * so does a documentation host, because plenty of projects put their docs at the root of
   * docs.<project> and demanding a path there would only invite a fake one. */
  const hasPath = parsed.pathname.replace(/\/+$/, "") !== "";
  const docsHost = /^(docs|doc|learn|nightlies)\./.test(parsed.hostname) || /\.readthedocs\.io$/.test(parsed.hostname);
  if (!hasPath && !docsHost) {
    problems.push(`${provider}: "${name}" points at a bare homepage rather than documentation: ${url}`);
  }
}

/* ---------------- report: cells naming something the registry misses ---------------- */
const NOT_A_PRODUCT = /^(no (direct|first-party)|nothing\b|instance type$|VM size$|machine type$|subnet\b|route tables$|user-defined routes$|routes$|security group$|network security group$|firewall rules$|network ACL$)/i;
const unregistered = new Set();
for (const provider of PROVIDER_COLUMNS) {
  const names = Object.keys(PRODUCTS[provider] || {});
  for (const cell of said[provider]) {
    for (const raw of cell.split(/[,;]\s*/)) {
      const frag = raw.trim();
      if (!frag || NOT_A_PRODUCT.test(frag) || frag.length < 3) continue;
      if (!names.some((n) => mentions(frag, n))) unregistered.add(`${provider}: ${frag}`);
    }
  }
}
/* Summary only by default: this runs on every `make check`, and 300-odd lines of worklist
 * every time is how a report gets ignored. `--worklist` prints the fragments. */
if (unregistered.size) {
  notes.push(`${unregistered.size} mapping-cell fragment(s) name no registered product, so they render as plain text` +
    (process.argv.includes("--worklist") ? ":" : " — list them with: node scripts/audit-products.mjs --worklist"));
  if (process.argv.includes("--worklist")) notes.push(...[...unregistered].sort().map((u) => `    ${u}`));
}

/* ---------------- --online: does the URL still answer? ---------------- */
if (process.argv.includes("--online")) {
  const entries = registryEntries();
  const seen = new Map();               // url -> status, so a shared URL is fetched once
  const urls = [...new Set(entries.map((e) => e.url))];
  console.log(`fetching ${urls.length} distinct URLs…`);
  const QUEUE = [...urls];
  const worker = async () => {
    while (QUEUE.length) {
      const url = QUEUE.shift();
      let status = "ERR";
      try {
        const ctl = AbortSignal.timeout(15000);
        // Some vendor sites reject HEAD outright, so ask for the document and drop the body.
        const res = await fetch(url, { redirect: "follow", signal: ctl, headers: { "user-agent": "Mozilla/5.0 (patterns-kb link audit)" } });
        status = res.status;
        await res.arrayBuffer().catch(() => {});
      } catch (e) { status = `ERR ${e.name}`; }
      seen.set(url, status);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  const bad = urls.filter((u) => seen.get(u) !== 200);
  for (const url of bad) {
    const who = entries.filter((e) => e.url === url).map((e) => `${e.provider}:${e.name}`).join(", ");
    problems.push(`${seen.get(url)} — ${url}  (${who})`);
  }
  console.log(`${urls.length - bad.length} of ${urls.length} answered 200.`);
}

/* ---------------- verdict ---------------- */
if (notes.length) console.log("PRODUCT REGISTRY WORKLIST:\n" + notes.join("\n"));
if (problems.length) {
  console.error(`\nPRODUCT REGISTRY: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
const n = registryEntries().length;
console.log(`OK — ${n} product entries across ${PROVIDER_COLUMNS.length} providers, all used by their own column's cells.`);
