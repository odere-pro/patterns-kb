#!/usr/bin/env node
/* audit-highlight.mjs — hold the vendored highlighter to the closed sketch-language
 * vocabulary. Part of `make check`.
 *
 * SKETCH_LANGS says nine languages are legal on a code sketch, and audit-vocab.mjs proves
 * every one of them is used by a page. Nothing proved the other half: that the highlighter
 * actually SHIPS a grammar for them. It did not. The vendored bundle was built as
 * "core + typescript only" and registered exactly one language, so every `sql`, `http`,
 * `python`, `json`, `protobuf`, `lua` and `javascript` sketch in the corpus — 122 of them,
 * including every data schema and every API contract on a design page — rendered as flat
 * text. `hljs.highlight(src, {language: "sql"})` does not degrade; it THROWS, and the throw
 * used to abort sketch.js's loop, so the sketches after the first one lost their listeners
 * too.
 *
 * That failure was invisible for the life of the corpus because a vocabulary is only as
 * closed as its consumers. So:
 *
 *   FAIL   a SKETCH_LANGS id the vendored bundle cannot resolve. Adding a tenth language
 *          to model.mjs without vendoring its grammar now turns the build red instead of
 *          silently shipping unhighlighted code.
 *   FAIL   the bundle has lost its regeneration marker, so `make highlight` could not
 *          rebuild it without eating the hand-built core above it.
 *   REPORT a grammar registered that no SKETCH_LANGS id resolves to — dead weight in a
 *          file every pattern and design page downloads.
 *
 * `--online` rebuilds the grammar half of site/assets/vendor/highlight.min.js: it truncates
 * at the marker, re-fetches each grammar from cdnjs at the core's pinned version, and
 * re-appends. Everything ABOVE the marker is preserved byte for byte — it is a custom
 * esbuild bundle of lib/core + lib/languages/typescript that cdnjs does not publish and
 * this script cannot reproduce. Never part of `make check`: CI has no business depending on
 * a CDN being up.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { writeAtomic } from "./lib/atomic.mjs";
import { SKETCH_LANGS } from "./lib/model.mjs";

const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = join(ROOT, "site", "assets", "vendor", "highlight.min.js");

/* The line the grammars live below. `--online` truncates here, so it is a contract between
 * the two halves of the file and not decoration. */
const MARKER = "/*! kb: language grammars below — regenerate with `make highlight` */";

/* Languages the hand-built core already carries, so no grammar is fetched for them. */
const CORE_LANGS = new Set(["typescript"]);
/* Vocabulary id -> highlight.js module name, where the two differ. `text` is our name for
 * "no highlighting"; upstream calls that grammar plaintext and aliases it to text. */
const MODULE_OF = { text: "plaintext" };
const moduleFor = (id) => MODULE_OF[id] ?? id;

/* The fixture corpus carries no vendor directory, and neither does a bare staged checkout.
 * Same posture audit-vocab.mjs takes with its corpus-scale checks. */
if (!existsSync(BUNDLE)) {
  console.log("No vendored highlighter here — nothing to audit.");
  process.exit(0);
}

const problems = [];
const notes = [];

/* ---------------- load the bundle the way a browser would ---------------- */
/* The core ends with `window.hljs = …`, and each grammar module then calls a BARE
 * `hljs.registerLanguage(…)`. Both only work where `window` IS the global object, which is
 * true in a browser and false in Node — so the sandbox is built to say so. */
function load(src) {
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  createContext(sandbox);
  runInContext(src, sandbox, { filename: "highlight.min.js", timeout: 20000 });
  return sandbox.hljs;
}

const src = readFileSync(BUNDLE, "utf8");
if (!src.includes(MARKER)) {
  problems.push("the bundle carries no regeneration marker, so `make highlight` cannot rebuild its grammar half without destroying the hand-built core");
}

let hljs;
try {
  hljs = load(src);
} catch (e) {
  console.error(`\nHIGHLIGHTER: the vendored bundle does not evaluate: ${e.message}`);
  process.exit(1);
}
if (!hljs || typeof hljs.getLanguage !== "function") {
  console.error("\nHIGHLIGHTER: the vendored bundle evaluated but exposed no hljs on window");
  process.exit(1);
}

/* ---------------- gate: every legal sketch language resolves ---------------- */
for (const { id, label } of SKETCH_LANGS) {
  const grammar = hljs.getLanguage(moduleFor(id));
  if (!grammar) {
    problems.push(`data-kb-lang="${id}" (${label}) is in SKETCH_LANGS but the vendored bundle registers no grammar for it — every sketch declaring it renders unhighlighted. Vendor it with: make highlight`);
  }
}

/* ---------------- report: a grammar nothing in the vocabulary reaches ---------------- */
/* Compared by object identity rather than by name, because an id may reach its grammar
 * through an alias (`text` -> plaintext) and the registered key is the module name. */
const reachable = new Set(SKETCH_LANGS.map((l) => hljs.getLanguage(moduleFor(l.id))).filter(Boolean));
const dead = hljs.listLanguages().filter((name) => !reachable.has(hljs.getLanguage(name)));
if (dead.length) {
  notes.push(`${dead.length} vendored grammar(s) no sketch language reaches: ${dead.join(", ")} — every pattern and design page downloads them for nothing`);
}

/* ---------------- --online: rebuild the grammar half ---------------- */
if (process.argv.includes("--online")) {
  const version = src.match(/highlight\.js v(\d+\.\d+\.\d+)/)?.[1];
  if (!version) {
    console.error("\nHIGHLIGHTER: the bundle header names no version, so there is nothing to pin the grammars to");
    process.exit(1);
  }
  const core = src.includes(MARKER) ? src.slice(0, src.indexOf(MARKER)) : src;
  const wanted = SKETCH_LANGS.map((l) => l.id).filter((id) => !CORE_LANGS.has(id)).map(moduleFor);

  console.log(`fetching ${wanted.length} grammar(s) for highlight.js ${version}…`);
  const parts = [];
  for (const name of wanted) {
    const url = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${version}/languages/${name}.min.js`;
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      console.error(`\nHIGHLIGHTER: ${res.status} fetching ${url}`);
      process.exit(1);
    }
    const body = (await res.text()).trim();
    /* A CDN that answers 200 with an error page would otherwise be appended verbatim. */
    if (!body.includes(`hljs.registerLanguage("${name}"`)) {
      console.error(`\nHIGHLIGHTER: ${url} answered 200 but registers no "${name}" grammar`);
      process.exit(1);
    }
    parts.push(body);
  }

  const manifest = `/*! highlight.js v${version} grammars, fetched from cdnjs: ${wanted.join(" ")}.\n Each self-registers against the window.hljs the core above exports. */`;
  const rebuilt = `${core.trimEnd()}\n${MARKER}\n${manifest}\n${parts.join("\n")}\n`;
  let check;
  try { check = load(rebuilt); } catch (e) {
    console.error(`\nHIGHLIGHTER: the rebuilt bundle does not evaluate: ${e.message}`);
    process.exit(1);
  }
  const missing = SKETCH_LANGS.map((l) => l.id).filter((id) => !check.getLanguage(moduleFor(id)));
  if (missing.length) {
    console.error(`\nHIGHLIGHTER: the rebuilt bundle still cannot resolve ${missing.join(", ")}`);
    process.exit(1);
  }
  writeAtomic(BUNDLE, rebuilt);
  console.log(`Rebuilt ${BUNDLE.replace(`${ROOT}/`, "")} — ${check.listLanguages().length} languages, ${(rebuilt.length / 1024).toFixed(1)} KB.`);
  process.exit(0);
}

/* ---------------- verdict ---------------- */
if (notes.length) console.log("HIGHLIGHTER WORKLIST:\n" + notes.map((n) => `  ${n}`).join("\n"));
if (problems.length) {
  console.error(`\nHIGHLIGHTER: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`Checked ${SKETCH_LANGS.length} sketch languages against the vendored highlighter (${hljs.listLanguages().length} grammars registered).`);
