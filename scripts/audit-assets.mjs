#!/usr/bin/env node
/* audit-assets.mjs — the gate that replaced ~4,700 link-checked script tags with 386.
 *
 * Collapsing every page onto one <link> and one <script src="assets/kb.js"> moved the
 * asset list off the pages and into kb.js's manifest and the CSS @import chain — and
 * check-links.mjs cannot see either. It walks HTML and resolves href/src attributes; a
 * manifest entry naming a file that does not exist, or an @import typo, is invisible to
 * it (pattern.css:9-11 used to note exactly that gap). So this checks four things
 * nothing else does:
 *
 *   A1  every page under site/ carries EXACTLY one <link rel="stylesheet"> and EXACTLY
 *       one <script src>, and the script's data-profile is a key of kb.js's own manifest.
 *   A2  every page's only other <script> is the JSON-LD block. A stray tag is a page
 *       that has stopped being derivable — this is the rule that makes the drift that
 *       lost favourites.js on 53 pages unrepeatable.
 *   A3  every file kb.js's manifest names exists under site/assets/.
 *   A4  every file reachable through the @import chain from each kb-*.css aggregator
 *       exists, and the chain is acyclic.
 *
 * A3 reads the manifest out of the SHIPPED kb.js rather than restating it in this file —
 * the same "load the real script into a stub window" technique scripts/test/palette.test.mjs
 * and scripts/test/graph-core.test.mjs already use — so a list that drifts here is a list
 * that drifted in the browser too.
 *
 * Exit 1 on any problem.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";
import { runInThisContext } from "node:vm";
import { parse } from "./vendor/node-html-parser.mjs";

const PARSE_OPTS = { comment: true };

const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const ASSETS = join(SITE, "assets");

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const problems = [];

/* ---- load kb.js's manifest the way the browser does ---- */
const kbjsSrc = readFileSync(join(ASSETS, "kb.js"), "utf8");
const stubWindow = {};
const stubDocument = {
  currentScript: null, // no <script> element in this shim, so the browser-only tail bails out
  readyState: "complete", querySelector: () => null, querySelectorAll: () => [],
};
runInThisContext(`(function (window, document) {\n${kbjsSrc}\n})`, { filename: "kb.js" })(stubWindow, stubDocument);
const manifest = stubWindow.KB_ASSETS;
if (!manifest || !manifest.profiles) {
  console.error("kb.js exported no KB_ASSETS.profiles — cannot audit anything against it.");
  process.exit(1);
}

/* ---- A3: every manifest-named file exists ---- */
const named = new Set();
for (const [profile, spec] of Object.entries(manifest.profiles)) {
  for (const list of [spec.pre, spec.tail]) {
    for (const f of list) {
      named.add(f);
      if (!existsSync(join(ASSETS, f))) {
        problems.push(`kb.js profile "${profile}" names "assets/${f}", which does not exist`);
      }
    }
  }
}

/* ---- A4: the @import chain from each aggregator ---- */
function walkImports(file, seen) {
  if (seen.has(file)) {
    problems.push(`@import cycle: ${[...seen, file].map((f) => relative(ASSETS, f)).join(" -> ")}`);
    return;
  }
  seen.add(file);
  if (!existsSync(file)) {
    problems.push(`@import target does not exist: ${relative(ASSETS, file)}`);
    return;
  }
  const src = readFileSync(file, "utf8");
  // A fresh regex per call: recursing into a match while a shared `g`-flagged regex's
  // lastIndex is mid-scan resets it out from under the caller's own loop the moment the
  // callee runs its own exec loop to exhaustion — the caller then re-finds its first
  // match forever instead of advancing. Every import is collected before any recursion.
  const targets = [...src.matchAll(/@import\s+url\(["']([^"')]+)["']\)/g)].map((m) => m[1]);
  for (const t of targets) walkImports(resolve(dirname(file), t), new Set(seen));
}
const AGGREGATORS = ["kb-page.css", "kb-hub.css", "kb-graph.css"];
for (const agg of AGGREGATORS) {
  const p = join(ASSETS, agg);
  if (!existsSync(p)) { problems.push(`aggregator missing: assets/${agg}`); continue; }
  walkImports(p, new Set());
}

/* ---- A1 + A2: per-page head shape ---- */
const files = walk(SITE);
for (const file of files) {
  const rel = "site" + file.slice(SITE.length);
  const html = readFileSync(file, "utf8");
  const root = parse(html, PARSE_OPTS);

  const links = root.querySelectorAll('link[rel="stylesheet"]');
  if (links.length !== 1) {
    problems.push(`${rel}: ${links.length} stylesheet link(s), expected exactly 1`);
  }

  const scripts = root.querySelectorAll("script").filter((el) => !el.closest("code"));
  const jsonLd = scripts.filter((el) => el.getAttribute("type") === "application/ld+json");
  const withSrc = scripts.filter((el) => el.getAttribute("src") != null);

  if (jsonLd.length > 1) problems.push(`${rel}: ${jsonLd.length} JSON-LD blocks, expected at most 1`);
  if (withSrc.length !== 1) {
    problems.push(`${rel}: ${withSrc.length} <script src> tag(s), expected exactly 1 (kb.js)`);
  }
  const stray = scripts.filter((el) => el !== jsonLd[0] && el !== withSrc[0]);
  if (stray.length) {
    problems.push(`${rel}: ${stray.length} script tag(s) that are neither the loader nor JSON-LD`);
  }

  if (withSrc.length === 1) {
    const el = withSrc[0];
    const src = el.getAttribute("src") || "";
    if (!/assets\/kb\.js$/.test(src)) {
      problems.push(`${rel}: loader script src "${src}" does not point at kb.js`);
    }
    const profile = el.getAttribute("data-profile");
    if (!profile) {
      problems.push(`${rel}: loader script carries no data-profile`);
    } else if (!manifest.profiles[profile]) {
      problems.push(`${rel}: data-profile="${profile}" is not a key of kb.js's manifest`);
    }
  }
  if (links.length === 1) {
    const href = links[0].getAttribute("href") || "";
    if (!AGGREGATORS.some((a) => href.endsWith(`assets/${a}`))) {
      problems.push(`${rel}: stylesheet href "${href}" is not one of ${AGGREGATORS.join(", ")}`);
    }
  }
}

if (problems.length) {
  console.error(`${problems.length} asset problem(s):`);
  for (const p of problems.slice(0, 40)) console.error("  " + p);
  if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`);
  process.exit(1);
}
console.log(
  `OK — ${files.length} pages each carry one stylesheet link and one kb.js loader; ` +
  `${named.size} manifest file(s) and ${AGGREGATORS.length} CSS aggregator(s) all resolve.`,
);
