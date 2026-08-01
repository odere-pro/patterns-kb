#!/usr/bin/env node
/* check-mermaid-file.mjs — parse the mermaid diagrams in a markdown file (or on stdin)
 * with the same vendored engine that renders them.
 *
 * The corpus checker (check-mermaid.mjs) walks site/ and reads <pre class="mermaid">.
 * This one reads ```mermaid fences, so a design doc written to tmp/ — or an artifact
 * page, or an agent's returned diagram — can be verified before it ships. Same reason
 * as its sibling: mermaid catches its own parse error and paints a placeholder, so a
 * broken diagram is invisible until a human looks at the rendered page.
 *
 *   node scripts/check-mermaid-file.mjs tmp/designs/foo.md
 *   node scripts/kb.mjs get x --diagrams | node scripts/check-mermaid-file.mjs
 *
 * Exit 1 on any syntax error, naming the fence and the line. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";

const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const MERMAID = join(ROOT, "site", "assets", "vendor", "mermaid.min.js");

/* A grammar rejection, as opposed to anything the browser shim could not provide.
 * Kept identical to check-mermaid.mjs — the two must classify the same way. */
const SYNTAX_ERROR = /parse error|lexical error|expecting|unrecognized text|no diagram type detected/i;

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
  vm.runInContext(
    `${readFileSync(MERMAID, "utf8")}\n;globalThis.__mermaid = __esbuild_esm_mermaid_nm.mermaid;`,
    sandbox,
    { timeout: 120000 },
  );
  const mermaid = sandbox.__mermaid?.default ?? sandbox.__mermaid;
  if (typeof mermaid?.parse !== "function") {
    console.error("check-mermaid-file: the vendored bundle exposed no parse() — shim is stale");
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

/* The same self-test as the corpus checker: prove jison rejects bad syntax BEFORE the
 * shimmed DOM is touched, rather than trusting it. */
const SELF_TEST = {
  valid: [`flowchart LR\n  A["a"] -->|"1 x"| B[("b")]\n  A -.-> C["c"]:::ext\n  classDef ext stroke-dasharray:4 4`],
  invalid: [`flowchart LR\n  A[Read (fast)] --> B[Write]`],
};

async function selfTest(mermaid) {
  for (const src of SELF_TEST.valid) {
    const e = await checkSource(mermaid, src);
    if (e) { console.error(`check-mermaid-file: self-test failed — known-good sample rejected: ${e}`); process.exit(1); }
  }
  for (const src of SELF_TEST.invalid) {
    if (!(await checkSource(mermaid, src))) {
      console.error("check-mermaid-file: self-test failed — known-broken sample accepted");
      process.exit(1);
    }
  }
}

/* Fenced blocks, with the line number the fence opens on so an error points somewhere. */
function fences(text) {
  const out = [];
  const lines = text.split("\n");
  let start = -1, buf = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (start < 0 && /^\s*```\s*mermaid\s*$/.test(l)) { start = i + 1; buf = []; continue; }
    if (start >= 0 && /^\s*```\s*$/.test(l)) { out.push({ line: start, src: buf.join("\n").trim() }); start = -1; continue; }
    if (start >= 0) buf.push(l);
  }
  if (start >= 0) out.push({ line: start, src: buf.join("\n").trim(), unterminated: true });
  return out;
}

const file = process.argv[2];
const text = file ? readFileSync(resolve(file), "utf8") : readFileSync(0, "utf8");
const label = file ?? "(stdin)";

const mermaid = loadMermaid();
await selfTest(mermaid);

const blocks = fences(text);
if (!blocks.length) { console.log(`OK — ${label}: no mermaid fences to check.`); process.exit(0); }

const problems = [];
for (const [i, b] of blocks.entries()) {
  if (b.unterminated) { problems.push(`diagram ${i + 1} (line ${b.line}): fence never closed`); continue; }
  if (!b.src) { problems.push(`diagram ${i + 1} (line ${b.line}): empty fence`); continue; }
  const err = await checkSource(mermaid, b.src);
  if (err) problems.push(`diagram ${i + 1} (line ${b.line}): ${err}`);
}

if (problems.length) {
  console.error(`${problems.length} of ${blocks.length} diagram(s) in ${label} will not parse:`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`OK — ${label}: ${blocks.length} mermaid diagram(s) parse.`);
