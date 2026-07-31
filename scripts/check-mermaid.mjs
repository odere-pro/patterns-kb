#!/usr/bin/env node
/* check-mermaid.mjs — parse every diagram in the corpus with the engine that renders it.
 * Walks every HTML file under site/, pulls the source out of each <pre class="mermaid">
 * block, and runs it through the vendored mermaid grammar. Exit 1 on any syntax error.
 *
 * Why it exists: a broken diagram fails silently. mermaid catches its own parse error and
 * paints a placeholder into the page, so the build stays green, `make check` stays green,
 * and the only signal is a reader looking at the rendered page. Diagrams are data here —
 * the topology walk IS the pattern's structure block — so they get checked like the rest.
 *
 * Why a VM sandbox: the repo vendors mermaid and runs no npm, so there is no jsdom to
 * render into. mermaid.min.js is an esbuild IIFE that assigns itself to a global, so it
 * loads into a node:vm context under a minimal browser shim, and mermaid.parse() runs the
 * jison grammar without ever touching a real DOM.
 *
 * What that shim costs, and why the result is still trustworthy: parsing succeeds, then
 * mermaid hands the text to DOMPurify, which reports itself unsupported against a fake
 * document and is missing addHook. That throw happens strictly AFTER the grammar has
 * accepted the diagram, so it is classified as a pass. Only jison's own errors — "Parse
 * error on line N", "Lexical error", "Expecting ..." — count as failures. The separation
 * is load-bearing, so it is asserted at startup against known-good and known-broken
 * samples (see SELF_TEST): if a future mermaid ever stopped rejecting bad syntax the way
 * this assumes, this script fails loudly instead of passing everything. */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";
import { parse } from "./vendor/node-html-parser.mjs";

const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const MERMAID = join(SITE, "assets", "vendor", "mermaid.min.js");

/* A grammar rejection, as opposed to anything the browser shim could not provide. */
const SYNTAX_ERROR = /parse error|lexical error|expecting|unrecognized text|no diagram type detected/i;

/* ── the browser shim ──────────────────────────────────────────────────────────────
 * Deep enough for mermaid to initialise; nowhere near enough to render. Every property
 * access returns another callable proxy, so feature detection finds what it looks for. */
function browserShim() {
  const el = () =>
    new Proxy(function () {}, {
      get: (_t, p) => {
        if (p === "style") return {};
        if (p === "classList") return { add() {}, remove() {}, contains: () => false };
        if (p === "toString" || p === Symbol.toPrimitive) return () => "";
        if (p === "length") return 0;
        return el();
      },
      set: () => true,
      apply: () => el(),
      has: () => true,
    });
  const noop = () => {};
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    TextEncoder, TextDecoder, URL, Math, Date, JSON, Promise, Error,
    Object, Array, String, Number, Boolean, RegExp, Map, Set, Symbol,
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    navigator: { userAgent: "node" },
    location: { href: "file:///", protocol: "file:" },
    screen: {},
    performance: { now: () => 0 },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.document = el();
  return sandbox;
}

function loadMermaid() {
  const sandbox = browserShim();
  vm.createContext(sandbox);
  const src = readFileSync(MERMAID, "utf8");
  vm.runInContext(
    `${src}\n;globalThis.__mermaid = __esbuild_esm_mermaid_nm.mermaid;`,
    sandbox,
    { timeout: 120000 },
  );
  const mermaid = sandbox.__mermaid?.default ?? sandbox.__mermaid;
  if (typeof mermaid?.parse !== "function") {
    console.error("check-mermaid: the vendored bundle exposed no parse() — shim is stale");
    process.exit(1);
  }
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
  return mermaid;
}

/* Returns null when the diagram is syntactically valid, else the first error line. */
async function checkSource(mermaid, src) {
  try {
    await mermaid.parse(src);
    return null;
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (SYNTAX_ERROR.test(msg)) return msg.split("\n")[0].trim();
    return null; /* got past the grammar; died in the shimmed DOM */
  }
}

/* ── self-test ─────────────────────────────────────────────────────────────────────
 * The whole script rests on the claim that jison rejects bad syntax BEFORE anything
 * touches the shimmed DOM. Prove it every run rather than trusting it. */
const SELF_TEST = {
  valid: [
    `flowchart LR\n  A["a"] -->|"x"| B[("b")]\n  A -.->|"y"| C["c"]:::ext\n  classDef ext stroke-dasharray:4 4`,
    `sequenceDiagram\n  autonumber\n  participant A as A\n  participant B as B\n  A->>B: go\n  alt ok\n    B-->>A: yes\n  else no\n    B--xA: lost\n  end`,
    `stateDiagram-v2\n  [*] --> Open\n  Open --> Closed: shut\n  Closed --> [*]`,
    `classDiagram\n  class Cache {\n    +get(k)\n  }\n  Cache o-- Store : reads`,
  ],
  invalid: [
    `flowchart LR\n  A[Read (fast)] --> B[Write]`,
    `flowchart LR\n  A -->|"x" B[[[`,
    `sequenceDiagram\n  A ->> B without a colon`,
  ],
};

async function selfTest(mermaid) {
  const failures = [];
  for (const src of SELF_TEST.valid) {
    const e = await checkSource(mermaid, src);
    if (e) failures.push(`known-good sample rejected: ${e}`);
  }
  for (const src of SELF_TEST.invalid) {
    if (!(await checkSource(mermaid, src)))
      failures.push(`known-broken sample accepted: ${src.split("\n")[1]?.trim()}`);
  }
  if (failures.length) {
    console.error("check-mermaid: self-test failed — the checker cannot be trusted:");
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

/* Read the source through the same vendored parser every builder uses. The browser hands
 * mermaid the DECODED text of the <pre> — `TTL &le; expiry` reaches it as `TTL ≤ expiry` —
 * and in a sequence diagram a stray `;` is a statement separator, so decoding by hand
 * would invent parse errors the page does not have. */
const PARSE_OPTS = { comment: true };

const mermaid = loadMermaid();
await selfTest(mermaid);

const files = walk(SITE);
const problems = [];
let diagrams = 0;

for (const file of files) {
  const root = parse(readFileSync(file, "utf8"), PARSE_OPTS);
  const blocks = root.querySelectorAll("pre.mermaid");
  for (const [i, block] of blocks.entries()) {
    diagrams += 1;
    const err = await checkSource(mermaid, block.textContent.trim());
    if (err) problems.push({ file: file.slice(ROOT.length + 1), index: i + 1, err });
  }
}

if (problems.length) {
  console.error(`${problems.length} diagram(s) will not parse:`);
  for (const p of problems) console.error(`  ${p.file} — diagram ${p.index}: ${p.err}`);
  process.exit(1);
}

console.log(`OK — ${diagrams} mermaid diagrams across ${files.length} files all parse.`);
