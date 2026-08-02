/* highlight.test.mjs — the vendored highlighter against the closed sketch-language set.
 *
 * The failure this covers shipped for the life of the corpus and nothing caught it: the
 * vendored bundle was built "core + typescript only", so it registered exactly one of the
 * nine languages SKETCH_LANGS declares legal. highlight.js does NOT degrade on an unknown
 * language — `hljs.highlight(src, {language: "sql"})` throws — so 122 sketches, every data
 * schema and every API contract on a design page among them, rendered as flat text while
 * every gate in `make check` stayed green.
 *
 * Two halves, matching the two ways it could come back:
 *   - the shipped bundle really does resolve every id (the invariant itself)
 *   - audit-highlight.mjs FAILS when it does not (the gate, against a stub corpus)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { SKETCH_LANGS } from "../lib/model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const BUNDLE = join(ROOT, "site", "assets", "vendor", "highlight.min.js");
const AUDIT = join(ROOT, "scripts", "audit-highlight.mjs");

/* The core ends with `window.hljs = …` and each grammar then calls a BARE
 * `hljs.registerLanguage(…)`. Both only work where `window` IS the global object — true in
 * a browser, false in Node — so the sandbox is built to say so. */
function load(src) {
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.hljs;
}

const hljs = load(readFileSync(BUNDLE, "utf8"));

test("the vendored bundle resolves every language SKETCH_LANGS allows", () => {
  /* `text` is our name for "no highlighting"; upstream calls that grammar plaintext and
   * aliases it to text, so this asks the question the page asks: does the class the page
   * carries resolve to something? */
  for (const { id, label } of SKETCH_LANGS) {
    assert.ok(hljs.getLanguage(id), `${label} (data-kb-lang="${id}") has no vendored grammar`);
  }
});

test("highlighting a sketch in each language produces spans, not an exception", () => {
  const sample = {
    typescript: "const a: number = 1;",
    http: "POST /flows\nIdempotency-Key: abc",
    python: "def f(x):\n    return x",
    sql: "SELECT id FROM t; -- c",
    json: '{"a": 1}',
    javascript: "const a = 1;",
    protobuf: "message M { string a = 1; }",
    lua: "local a = 1",
    text: "just words",
  };
  for (const { id } of SKETCH_LANGS) {
    const out = hljs.highlight(sample[id], { language: id, ignoreIllegals: true });
    assert.equal(typeof out.value, "string");
    /* `text` is plaintext by definition and produces no spans; everything else must. */
    if (id !== "text") assert.match(out.value, /class="hljs-/, `${id} highlighted to nothing`);
  }
});

test("audit-highlight.mjs passes on the real bundle and skips a corpus without one", () => {
  assert.equal(spawnSync(process.execPath, [AUDIT], { cwd: ROOT }).status, 0);

  const empty = mkdtempSync(join(tmpdir(), "kb-hl-"));
  try {
    const res = spawnSync(process.execPath, [AUDIT], { env: { ...process.env, KB_ROOT: empty }, encoding: "utf8" });
    assert.equal(res.status, 0, "a corpus with no vendor directory is not a failure");
    assert.match(res.stdout, /nothing to audit/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("audit-highlight.mjs fails a bundle that is missing a legal language", () => {
  const root = mkdtempSync(join(tmpdir(), "kb-hl-"));
  try {
    mkdirSync(join(root, "site", "assets", "vendor"), { recursive: true });
    /* The shape the corpus actually shipped: a registry that answers for typescript and
     * nothing else, carrying the marker so only the language check can fail. */
    writeFileSync(join(root, "site", "assets", "vendor", "highlight.min.js"), `
      /*! highlight.js v11.11.1 — stub */
      (function () {
        var reg = {};
        window.hljs = {
          registerLanguage: function (n, g) { reg[n] = g; },
          getLanguage: function (n) { return reg[n]; },
          listLanguages: function () { return Object.keys(reg); },
        };
      })();
      /*! kb: language grammars below — regenerate with \`make highlight\` */
      hljs.registerLanguage("typescript", { name: "TypeScript" });
    `);
    const res = spawnSync(process.execPath, [AUDIT], { env: { ...process.env, KB_ROOT: root }, encoding: "utf8" });
    assert.equal(res.status, 1, "a language with no grammar must turn the build red");
    assert.match(res.stderr, /data-kb-lang="sql"/);
    assert.doesNotMatch(res.stderr, /data-kb-lang="typescript"/, "the one it does register is fine");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
