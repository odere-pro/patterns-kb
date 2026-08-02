/* assets.test.mjs — smoke tests for audit-assets.mjs, run with `node --test`.
 *
 * The fixture corpus (scripts/test/fixture/) carries no real client assets — its
 * site/assets/ is empty, because build.mjs/build-pages.mjs never need one to run. But
 * audit-assets.mjs's whole job is checking a page's asset tags against the REAL kb.js
 * manifest and the REAL CSS @import chain, so a test against the trimmed fixture would
 * be checking nothing. Each test here copies the fixture, builds it (so its 3 pages get
 * real generated head-asset regions), then overlays the REAL site/assets/ on top —
 * kb.js's manifest is a fixed set of filenames, not fixture-specific, so reusing the
 * shipped one is the correct fixture rather than a stand-in for it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const FIXTURE = join(HERE, "fixture");
const ALPHA = join("site", "patterns", "concurrency", "alpha.html");

function run(script, root, ...args) {
  return spawnSync(process.execPath, [join(REPO, "scripts", script), ...args], {
    env: { ...process.env, KB_ROOT: root },
    encoding: "utf8",
  });
}

/* Fixture, built, with the real assets/ overlaid — the shape every test in this file
 * starts from. */
function builtWithRealAssets() {
  const root = mkdtempSync(join(tmpdir(), "kb-assets-fixture-"));
  cpSync(FIXTURE, root, { recursive: true });
  assert.equal(run("build.mjs", root).status, 0);
  assert.equal(run("build-pages.mjs", root).status, 0);
  cpSync(join(REPO, "site", "assets"), join(root, "site", "assets"), { recursive: true });
  return root;
}

test("audit-assets.mjs passes the clean fixture, overlaid with the real assets", () => {
  const root = builtWithRealAssets();
  try {
    const r = run("audit-assets.mjs", root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /each carry one stylesheet link and one kb\.js loader/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("audit-assets.mjs fails a page with a stray stylesheet link", () => {
  const root = builtWithRealAssets();
  try {
    const file = join(root, ALPHA);
    const html = readFileSync(file, "utf8");
    writeFileSync(file, html.replace(
      '<link rel="stylesheet" href="../../assets/kb-page.css">',
      '<link rel="stylesheet" href="../../assets/kb-page.css">\n  <link rel="stylesheet" href="../../assets/hub.css">',
    ));
    const r = run("audit-assets.mjs", root);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /2 stylesheet link\(s\), expected exactly 1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("audit-assets.mjs fails a page carrying a script that is neither the loader nor JSON-LD", () => {
  const root = builtWithRealAssets();
  try {
    const file = join(root, ALPHA);
    const html = readFileSync(file, "utf8");
    writeFileSync(file, html.replace("</body>", '<script src="../../assets/progress.js"></script></body>'));
    const r = run("audit-assets.mjs", root);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /2 <script src> tag\(s\), expected exactly 1/);
    assert.match(r.stderr, /neither the loader nor JSON-LD/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("audit-assets.mjs fails a data-profile that is not one of kb.js's profiles", () => {
  const root = builtWithRealAssets();
  try {
    const file = join(root, ALPHA);
    const html = readFileSync(file, "utf8");
    writeFileSync(file, html.replace('data-profile="pattern"', 'data-profile="nonexistent"'));
    const r = run("audit-assets.mjs", root);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /data-profile="nonexistent" is not a key of kb\.js's manifest/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("audit-assets.mjs fails when kb.js names a manifest file that does not exist", () => {
  const root = builtWithRealAssets();
  try {
    const kbjs = join(root, "site", "assets", "kb.js");
    const src = readFileSync(kbjs, "utf8");
    assert.ok(src.includes('"palette.js",'), "fixture drifted: kb.js no longer lists palette.js");
    writeFileSync(kbjs, src.replace('"palette.js",', '"palette.js", "does-not-exist.js",'));
    const r = run("audit-assets.mjs", root);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /names "assets\/does-not-exist\.js", which does not exist/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("audit-assets.mjs fails when a CSS aggregator @imports a missing file", () => {
  const root = builtWithRealAssets();
  try {
    const agg = join(root, "site", "assets", "kb-page.css");
    writeFileSync(agg, readFileSync(agg, "utf8") + '@import url("does-not-exist.css");\n');
    const r = run("audit-assets.mjs", root);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /@import target does not exist: does-not-exist\.css/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("audit-assets.mjs detects an @import cycle rather than looping forever", () => {
  const root = builtWithRealAssets();
  try {
    const b = join(root, "site", "assets", "tokens.css");
    writeFileSync(b, readFileSync(b, "utf8") + '@import url("kb-page.css");\n');
    const r = run("audit-assets.mjs", root);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /@import cycle/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
