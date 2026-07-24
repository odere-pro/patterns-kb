/* builders.test.mjs — smoke tests for the builders/checkers, run with `node --test`.
 *
 * Each test copies the tiny fixture corpus (scripts/test/fixture/) to a temp dir,
 * optionally breaks it, and invokes the real script as a child process with KB_ROOT
 * pointing at the copy. A consistent builder bug would pass --check against its own
 * output; these assert against a corpus whose truth is known by construction.
 *
 * Deliberately a smoke suite, not a coverage project — the live corpus under site/
 * remains the main fixture, exercised by `make check`.
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
const BETA = join("site", "patterns", "concurrency", "beta.html");

function withFixture(mutate) {
  const root = mkdtempSync(join(tmpdir(), "kb-fixture-"));
  cpSync(FIXTURE, root, { recursive: true });
  if (mutate) mutate(root);
  return root;
}

function run(script, root) {
  return spawnSync(process.execPath, [join(REPO, "scripts", script)], {
    env: { ...process.env, KB_ROOT: root },
    encoding: "utf8",
  });
}

function edit(root, rel, from, to) {
  const file = join(root, rel);
  const cur = readFileSync(file, "utf8");
  assert.ok(cur.includes(from), `fixture drifted: ${rel} no longer contains "${from}"`);
  writeFileSync(file, cur.replace(from, to));
}

test("build.mjs derives the graph, both sides of the edge present", () => {
  const root = withFixture();
  try {
    const r = run("build.mjs", root);
    assert.equal(r.status, 0, r.stderr);
    const graph = JSON.parse(readFileSync(join(root, "site", "assets", "graph.json"), "utf8"));
    assert.ok(graph.nodes.alpha && graph.nodes.beta, "both fixture nodes in the graph");
    assert.ok(graph.nodes.alpha.relations.some((x) => x.to === "beta" && x.type === "combines-with"));
    assert.ok(graph.nodes.beta.relations.some((x) => x.to === "alpha" && x.type === "combines-with"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("build.mjs rejects a one-way relationship", () => {
  const root = withFixture((r) =>
    edit(r, BETA, '<div data-kb-rel="combines-with" data-kb-to="alpha">', '<div data-kb-removed="">'));
  try {
    const r = run("build.mjs", root);
    assert.equal(r.status, 1, "one-way edge must fail the build");
    assert.match(r.stderr, /one-way/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("build.mjs rejects a tag outside the closed vocabulary", () => {
  const root = withFixture((r) =>
    edit(r, ALPHA, `data-kb-tags='["concurrency"]'`, `data-kb-tags='["made-up-tag"]'`));
  try {
    const r = run("build.mjs", root);
    assert.equal(r.status, 1, "unknown tag must fail the build");
    assert.match(r.stderr, /closed vocabulary/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("check-links.mjs passes the clean fixture, counting the mermaid click", () => {
  const root = withFixture();
  try {
    const r = run("check-links.mjs", root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /1 mermaid click/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("check-links.mjs fails on a dangling href", () => {
  const root = withFixture((r) =>
    edit(r, ALPHA, 'href="./beta.html"', 'href="./missing.html"'));
  try {
    const r = run("check-links.mjs", root);
    assert.equal(r.status, 1, "dangling link must fail the check");
    assert.match(r.stderr, /DANGLING/);
    assert.match(r.stderr, /missing\.html/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("check-links.mjs fails on a dangling mermaid click target", () => {
  const root = withFixture((r) =>
    edit(r, ALPHA, 'click B "./beta.html"', 'click B "./gone.html"'));
  try {
    const r = run("check-links.mjs", root);
    assert.equal(r.status, 1, "dangling mermaid click must fail the check");
    assert.match(r.stderr, /gone\.html.*mermaid click/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
