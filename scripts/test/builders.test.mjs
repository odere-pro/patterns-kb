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

function run(script, root, ...args) {
  return spawnSync(process.execPath, [join(REPO, "scripts", script), ...args], {
    env: { ...process.env, KB_ROOT: root },
    encoding: "utf8",
  });
}

/* kb.mjs resolves an id to a path through graph.json, so the fixture needs building
 * before it can be read or written by id. */
function built(mutate) {
  const root = withFixture(mutate);
  const r = run("build.mjs", root);
  assert.equal(r.status, 0, r.stderr);
  return root;
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

test("kb.mjs unlink removes the edge from both pages, leaving the corpus buildable", () => {
  const root = built();
  try {
    const r = run("kb.mjs", root, "unlink", "alpha", "beta");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /alpha: removed combines-with → beta/);
    assert.match(r.stdout, /beta: removed combines-with → alpha/);

    for (const page of [ALPHA, BETA]) {
      assert.doesNotMatch(readFileSync(join(root, page), "utf8"), /data-kb-rel/,
        `${page} still declares a relation`);
    }
    // The real proof: half an unlink is a one-way edge, which the build rejects.
    assert.equal(run("build.mjs", root).status, 0, "corpus must still build after unlink");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("kb.mjs unlink fails when there is no edge to remove", () => {
  const root = built();
  try {
    assert.equal(run("kb.mjs", root, "unlink", "alpha", "beta").status, 0);
    const again = run("kb.mjs", root, "unlink", "alpha", "beta");
    assert.equal(again.status, 1, "a second unlink has nothing to remove");
    assert.match(again.stderr, /no relation/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("kb.mjs unlink takes the rel-group with the last item in it", () => {
  /* The shipped fixture has a bare rel-item; wrap it so the group branch is exercised
     without changing what every other test reads. */
  const root = built((r) => {
    edit(r, ALPHA, "  <section>\n", `  <section>
      <div class="rel-group">
        <p class="rel-type">Combines with</p>
        <div class="rel-list">
`);
    edit(r, ALPHA, "  </section>\n", `      </div>
      </div>
  </section>
`);
  });
  try {
    const r = run("kb.mjs", root, "unlink", "alpha", "beta");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /with its now-empty group/);
    const html = readFileSync(join(root, ALPHA), "utf8");
    assert.doesNotMatch(html, /rel-group|rel-type|Combines with/, "the emptied group must go too");
    assert.doesNotMatch(html, /\n\n\n/, "no blank-line seam left where the group was");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("build.mjs rejects a data-kb-level outside the closed vocabulary", () => {
  const root = withFixture((r) =>
    edit(r, ALPHA, 'data-kb-level="expert">An expert-only nuance', 'data-kb-level="wizard">An expert-only nuance'));
  try {
    const r = run("build.mjs", root);
    assert.equal(r.status, 1, "unknown level must fail the build");
    assert.match(r.stderr, /closed vocabulary/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("build.mjs rejects an incomplete explain ladder", () => {
  const root = withFixture((r) =>
    edit(r, ALPHA,
      '<div class="explain-item" id="explain-advanced" data-kb-level="advanced"><h3>Advanced</h3><p>Alpha with architectural teeth for seniors.</p></div>\n',
      ""));
  try {
    const r = run("build.mjs", root);
    assert.equal(r.status, 1, "a two-rung ladder must fail the build");
    assert.match(r.stderr, /explain block must hold exactly one/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("kb.mjs get --level basic prunes above-level elements and blocks", () => {
  const root = built();
  try {
    const basic = run("kb.mjs", root, "get", "alpha", "--level", "basic");
    assert.equal(basic.status, 0, basic.stderr);
    assert.match(basic.stdout, /universal drawback/, "untagged items stay visible");
    assert.doesNotMatch(basic.stdout, /expert-only nuance/, "expert-tagged item is pruned at basic");
    assert.match(basic.stdout, /for beginners/, "the basic explain rung shows");
    assert.doesNotMatch(basic.stdout, /architectural teeth|for staff/, "higher explain rungs are pruned");

    const full = run("kb.mjs", root, "get", "alpha");
    assert.equal(full.status, 0, full.stderr);
    assert.match(full.stdout, /expert-only nuance/, "no --level reads the whole page");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("build-pages.mjs stamps policy levels on sections and removes strays", () => {
  /* variations is "advanced" in the pattern BLOCK_LEVELS policy; description is not
   * in the policy, so a hand-planted level there must be cleaned off. */
  const root = built((r) =>
    edit(r, ALPHA, 'id="description" data-kb-block="description">',
      'id="description" data-kb-block="description" data-kb-level="expert">'));
  try {
    const r = run("build-pages.mjs", root);
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(join(root, ALPHA), "utf8");
    assert.match(html, /id="variations"[^>]*data-kb-level="advanced"/, "policy stamp lands on variations");
    assert.doesNotMatch(html, /data-kb-block="description" data-kb-level/, "stray section level is cleaned");
    assert.match(html, /id="tradeoffs-con-1" data-kb-polarity="con" data-kb-level="expert"/,
      "authored element level is untouched");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("kb.mjs refs reports each carrier separately", () => {
  const root = built();
  try {
    const r = run("kb.mjs", root, "refs", "alpha", "--json");
    assert.equal(r.status, 0, r.stderr);
    const refs = JSON.parse(r.stdout);
    assert.deepEqual(refs.relations, [{ rel: "combines-with", to: "beta" }]);
    assert.deepEqual(refs.clicks, ["beta"], "the mermaid click is a real outbound link");
    assert.deepEqual(refs.proseLinks, [], "a relation's own <a> is not a prose link");
    assert.deepEqual(refs.untyped, [], "beta is declared, so nothing is untyped");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
