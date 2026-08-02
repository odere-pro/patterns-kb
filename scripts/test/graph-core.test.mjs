/* graph-core.test.mjs — behavioral coverage for the graph explorer's pure half,
 * run with `node --test`.
 *
 * site/assets/graph-core.js holds everything about the interactive graph that is a
 * function of its arguments: family canonicalization, edge dedupe and orientation, the
 * query language, the filter/orphan pass and settings migration. It is loaded here the
 * same way the browser loads it — as a plain script into a bare context — so the tests
 * exercise the shipped file, not a copy.
 *
 * Three layers under test:
 *   1. The units, against a hand-built fixture graph whose truth is known by
 *      construction.
 *   2. The live corpus (assets/graphdata.js + catalog.js) — the invariants that must
 *      hold for the real 272-node graph.
 *   3. The cross-layer contracts the three graph layers share: the canonical family ids
 *      the shell's legend and graph.css key off, and the slider defaults baked into the
 *      shell to match the runtime's.
 *
 * What stays out: the d3 wiring itself — physics, zoom, drag, tooltip placement — which
 * remains hand-verified against the checklist in the kb-graph skill.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const ASSETS = join(REPO, "site", "assets");

/* Load a browser script the way the page does — into a shared `window`, in order — then
 * read what it exported. Compiled in THIS realm rather than a fresh vm context so the
 * objects it returns are ordinary objects that deepEqual can compare; `window` and a
 * stub `document` arrive as parameters, so the scripts still see no other globals. */
function loadScripts(...files) {
  const window = {};
  const document = {
    readyState: "complete", querySelector: () => null, querySelectorAll: () => [],
    getElementById: () => null, addEventListener: () => {},
  };
  for (const f of files) {
    const src = readFileSync(join(ASSETS, f), "utf8");
    runInThisContext(`(function (window, document) {\n${src}\n})`, { filename: f })(window, document);
  }
  return window;
}
const loadCore = () => loadScripts("graph-core.js").KB_GRAPH_CORE;

/* ---------------- fixture ---------------- */

const REL = {
  "combines-with": { label: "Combines with", symmetric: true },
  "generalizes": { label: "Generalizes", inverse: "specializes" },
  "specializes": { label: "Specializes", inverse: "generalizes" },
  "demonstrates": { label: "Demonstrates", inverse: "demonstrated-by" },
  "demonstrated-by": { label: "Demonstrated by", inverse: "demonstrates" },
};

/* alpha↔beta declare the same symmetric edge from both sides; alpha/gamma declare the
 * two halves of one directional pair; alpha also carries a dangling target and an
 * unknown verb. delta is joined only by a demonstrates edge. */
function fixture() {
  return {
    relationTypes: REL,
    nodes: [
      { id: "alpha", name: "Alpha", kind: "pattern", band: "distributed", favourite: true, relations: [
        { type: "combines-with", to: "beta" },
        { type: "specializes", to: "gamma" },
        { type: "combines-with", to: "ghost" },   // dangling — no such node
        { type: "invented-verb", to: "beta" },    // not in the vocabulary
      ] },
      { id: "beta", name: "Beta", kind: "pattern", band: "caching", relations: [
        { type: "combines-with", to: "alpha" },
      ] },
      { id: "gamma", name: "Gamma", kind: "hazard", relations: [
        { type: "generalizes", to: "alpha" },
      ] },
      { id: "delta", name: "Delta Case", kind: "design", relations: [
        { type: "demonstrates", to: "beta" },
      ] },
      { id: "lonely", name: "Lonely", kind: "principle", relations: [] },
    ],
  };
}
const edgeKey = (e) => `${e.source}->${e.target}#${e.family}`;

/* ---------------- 1. units ---------------- */

test("familyOf: symmetric verbs stand alone, a pair collapses onto its sorted-first verb", () => {
  const core = loadCore();
  assert.equal(core.familyOf(REL, "combines-with"), "combines-with");
  assert.equal(core.familyOf(REL, "generalizes"), "generalizes");
  assert.equal(core.familyOf(REL, "specializes"), "generalizes", "both halves share one family");
  assert.equal(core.familyOf(REL, "demonstrates"), "demonstrated-by");
  assert.equal(core.familyOf(REL, "demonstrated-by"), "demonstrated-by");
});

test("buildGraph: an edge declared on both pages dedupes to one drawable edge", () => {
  const core = loadCore();
  const { edges } = core.buildGraph(fixture());
  const between = edges.filter((e) => [e.source, e.target].includes("alpha") && [e.source, e.target].includes("beta"));
  assert.equal(between.length, 1, "alpha↔beta is declared twice and must draw once");
  assert.equal(between[0].family, "combines-with");
  assert.equal(between[0].dir, 0, "a symmetric edge carries no arrow");
});

test("buildGraph: a directional edge is oriented along its canonical verb", () => {
  const core = loadCore();
  const { edges } = core.buildGraph(fixture());
  // alpha declares "specializes gamma", gamma declares "generalizes alpha" — either way
  // the drawn arrow runs gamma → alpha, the direction of the canonical verb.
  const dir = edges.find((e) => e.family === "generalizes");
  assert.deepEqual(
    { source: dir.source, target: dir.target, dir: dir.dir },
    { source: "gamma", target: "alpha", dir: 1 },
  );
});

test("buildGraph: orientation does not depend on which page is visited first", () => {
  const core = loadCore();
  const data = fixture();
  data.nodes.reverse();
  const reversed = core.buildGraph(data);
  // A symmetric edge takes whichever endpoint order it was reached from — it draws no
  // arrow, so that is free. A directional one must not move.
  const directed = (m) => m.edges.filter((e) => e.dir).map(edgeKey).sort();
  assert.deepEqual(directed(reversed), directed(core.buildGraph(fixture())));
  assert.deepEqual(directed(reversed), ["beta->delta#demonstrated-by", "gamma->alpha#generalizes"]);
});

test("buildGraph: dangling targets and unknown verbs are dropped, not drawn", () => {
  const core = loadCore();
  const { edges, neighbors } = core.buildGraph(fixture());
  assert.ok(!edges.some((e) => e.source === "ghost" || e.target === "ghost"), "no edge to a missing node");
  assert.ok(!neighbors.alpha.ghost, "a dangling target is not a neighbour");
  assert.ok(!edges.some((e) => e.family === "invented-verb"), "an unknown verb draws nothing");
});

test("buildGraph: degree counts drawn edges, neighbours span every family", () => {
  const core = loadCore();
  const { degree, neighbors, edges } = core.buildGraph(fixture());
  assert.equal(edges.length, 3, "combines-with, generalizes, demonstrated-by");
  assert.equal(degree.alpha, 2);
  assert.equal(degree.beta, 2);
  assert.equal(degree.lonely, undefined, "an unconnected node has no degree entry");
  assert.deepEqual(Object.keys(neighbors.alpha).sort(), ["beta", "gamma"]);
});

test("buildGraph: nodes are copies — d3's x/y never leak back into the source data", () => {
  const core = loadCore();
  const data = fixture();
  const { nodes, byId } = core.buildGraph(data);
  byId.alpha.x = 42;
  assert.equal(data.nodes[0].x, undefined);
  assert.equal(nodes[0].id, "alpha", "node order is preserved");
});

test("compileQuery: an empty query compiles to null — the caller decides what that means", () => {
  const core = loadCore();
  assert.equal(core.compileQuery(""), null);
  assert.equal(core.compileQuery("   "), null);
  assert.equal(core.compileQuery(undefined), null);
  assert.equal(core.compileQuery("-"), null, "a bare negation has nothing to negate");
});

/* The query context the page supplies: tags/aliases from the catalog join, and the
 * hub's lexical scorer. */
const META = {
  alpha: { tags: ["caching", "resilience"], aliases: ["a-pattern"] },
  beta: { tags: ["messaging"], aliases: [] },
};
const ctx = (matches) => ({ metaOf: (id) => META[id] || { tags: [], aliases: [] }, matches });
function matching(core, query, context) {
  const { nodes } = core.buildGraph(fixture());
  const test_ = core.compileQuery(query, context || ctx(null));
  return nodes.filter((n) => (test_ ? test_(n) : true)).map((n) => n.id);
}

test("compileQuery: tag: is a substring of any tag, kind:/band: are exact", () => {
  const core = loadCore();
  assert.deepEqual(matching(core, "tag:cach"), ["alpha"]);
  assert.deepEqual(matching(core, "tag:missing"), []);
  assert.deepEqual(matching(core, "kind:pattern"), ["alpha", "beta"]);
  assert.deepEqual(matching(core, "kind:patt"), [], "kind is exact, not a substring");
  assert.deepEqual(matching(core, "band:caching"), ["beta"]);
});

test("compileQuery: fav:true|false splits on the editorial pick", () => {
  const core = loadCore();
  assert.deepEqual(matching(core, "fav:true"), ["alpha"]);
  assert.deepEqual(matching(core, "fav:false"), ["beta", "gamma", "delta", "lonely"]);
});

/* practiced is not in graphdata: graph-view.js folds it onto the nodes from the same
 * localStorage store the hub checkboxes write. The core only sees the folded flag. */
test("compileQuery: practiced:true|false splits on the visitor's own progress", () => {
  const core = loadCore();
  const { nodes } = core.buildGraph(fixture());
  nodes.forEach((n) => { n.practiced = n.id === "beta" || n.id === "delta"; });
  const run = (q) => nodes.filter(core.compileQuery(q, ctx(null))).map((n) => n.id);
  assert.deepEqual(run("practiced:true"), ["beta", "delta"]);
  assert.deepEqual(run("practiced:false"), ["alpha", "gamma", "lonely"]);
  assert.deepEqual(run("kind:pattern -practiced:true"), ["alpha"], "composes and negates");
  // Nothing folded in yet — every node is simply unpractised, not unknown.
  const fresh = core.buildGraph(fixture()).nodes;
  assert.deepEqual(fresh.filter(core.compileQuery("practiced:true", ctx(null))).map((n) => n.id), []);
});

test("compileQuery: terms are ANDed and '-' negates", () => {
  const core = loadCore();
  assert.deepEqual(matching(core, "kind:pattern tag:cach"), ["alpha"]);
  assert.deepEqual(matching(core, "kind:pattern -tag:cach"), ["beta"]);
  assert.deepEqual(matching(core, "-kind:design -kind:principle"), ["alpha", "beta", "gamma"]);
  assert.deepEqual(matching(core, "-alpha"), ["beta", "gamma", "delta", "lonely"], "negated text");
});

test("compileQuery: bare words match id, name or alias by substring", () => {
  const core = loadCore();
  assert.deepEqual(matching(core, "alph"), ["alpha"], "id substring");
  assert.deepEqual(matching(core, "DELTA case"), ["delta"], "name substring, case-folded");
  assert.deepEqual(matching(core, "a-pattern"), ["alpha"], "alias substring");
  assert.deepEqual(matching(core, "unknown:op"), [], "an unknown op: prefix is plain text");
});

test("compileQuery: bare words form ONE phrase for the lexical scorer", () => {
  const core = loadCore();
  const seen = [];
  const matches = (phrase) => { seen.push(phrase); return { gamma: 3 }; };
  // No node's id, name or alias contains this text — only the scorer can match it.
  assert.deepEqual(matching(core, "threads block on one slow call", ctx(matches)), ["gamma"]);
  assert.deepEqual(seen, ["threads block on one slow call"], "one call, one phrase");
});

test("compileQuery: the scorer widens the phrase, it never narrows it", () => {
  const core = loadCore();
  const matches = () => ({ gamma: 1 });
  // "alpha" matches by substring, gamma only through the scorer — both survive.
  assert.deepEqual(matching(core, "alpha", ctx(matches)), ["alpha", "gamma"]);
  // With no scorer on the page the substring half still works.
  assert.deepEqual(matching(core, "alpha", ctx(null)), ["alpha"]);
});

/* ---- visibility ---- */

const ALL_KINDS = { pattern: 1, hazard: 1, theme: 1, principle: 1, design: 1, capability: 1 };
const filters = (over) => Object.assign({ kinds: Object.assign({}, ALL_KINDS), bands: {}, favs: false, practiced: false, orphans: false }, over);
function visible(core, opts) {
  const { nodes, edges } = core.buildGraph(fixture());
  const vis = core.computeVisibility(nodes, edges, opts);
  return { ids: vis.visNodes.map((n) => n.id), vis, nodes, edges };
}

test("computeVisibility: kind, band and favourite filters each hide their nodes", () => {
  const core = loadCore();
  assert.deepEqual(visible(core, { filters: filters() }).ids, ["alpha", "beta", "gamma", "delta", "lonely"]);
  assert.deepEqual(visible(core, { filters: filters({ kinds: { pattern: 1 } }) }).ids, ["alpha", "beta"]);
  assert.deepEqual(visible(core, { filters: filters({ bands: { caching: false } }) }).ids,
    ["alpha", "gamma", "delta", "lonely"], "a band filter only bites on banded nodes");
  assert.deepEqual(visible(core, { filters: filters({ favs: true }) }).ids, ["alpha"]);
});

test("computeVisibility: the practiced filter hides everything not worked through", () => {
  const core = loadCore();
  const { nodes, edges } = core.buildGraph(fixture());
  nodes.forEach((n) => { n.practiced = n.id === "alpha" || n.id === "beta"; });
  const ids = (f) => core.computeVisibility(nodes, edges, { filters: f }).visNodes.map((n) => n.id);
  assert.deepEqual(ids(filters({ practiced: true })), ["alpha", "beta"]);
  // Independent of the favourite filter, and ANDed with it — alpha is the only both.
  assert.deepEqual(ids(filters({ practiced: true, favs: true })), ["alpha"]);
  assert.deepEqual(ids(filters()), ["alpha", "beta", "gamma", "delta", "lonely"], "off by default");
});

test("computeVisibility: the search predicate composes with the filters", () => {
  const core = loadCore();
  const qTest = (n) => n.id !== "beta";
  assert.deepEqual(visible(core, { filters: filters({ favs: true }), qTest }).ids, ["alpha"]);
  assert.deepEqual(visible(core, { filters: filters(), qTest }).ids, ["alpha", "gamma", "delta", "lonely"]);
});

test("computeVisibility: hiding a family hides its edges and orphans what it joined", () => {
  const core = loadCore();
  const famHidden = (f) => f === "demonstrated-by";
  const on = visible(core, { filters: filters(), famHidden });
  assert.ok(!on.vis.visEdges.some((e) => e.family === "demonstrated-by"));
  assert.deepEqual(on.ids, ["alpha", "beta", "gamma", "delta", "lonely"], "the nodes stay until orphans are hidden");
  const off = visible(core, { filters: filters({ orphans: true }), famHidden });
  assert.deepEqual(off.ids, ["alpha", "beta", "gamma"], "delta's only edge is gone; lonely never had one");
});

test("computeVisibility: an orphan is relative to what is showing, not to the whole graph", () => {
  const core = loadCore();
  // gamma is hidden by kind, so alpha keeps only its beta edge and stays; hide beta too
  // and alpha is left with nothing visible.
  const withBeta = visible(core, { filters: filters({ kinds: { pattern: 1, design: 1, principle: 1 }, orphans: true }) });
  assert.deepEqual(withBeta.ids, ["alpha", "beta", "delta"], "lonely has no edge at any setting");
  const alone = visible(core, { filters: filters({ kinds: { pattern: 1 }, orphans: true }), qTest: (n) => n.id !== "beta" });
  assert.deepEqual(alone.ids, [], "alpha's every neighbour is filtered out");
});

test("computeVisibility: the single orphan pass is already a fixed point", () => {
  const core = loadCore();
  // The comment in graph-core.js promises one pass, no cascade: re-running the filter
  // over the surviving subgraph must not hide anything more.
  const { vis, edges } = visible(core, { filters: filters({ orphans: true }), famHidden: (f) => f === "demonstrated-by" });
  const again = loadCore().computeVisibility(vis.visNodes, edges, {
    filters: filters({ orphans: true }),
    famHidden: (f) => f === "demonstrated-by",
  });
  assert.deepEqual(again.visNodes.map((n) => n.id), vis.visNodes.map((n) => n.id));
});

test("computeVisibility: an edge is visible only when both endpoints are", () => {
  const core = loadCore();
  const { vis } = visible(core, { filters: filters({ kinds: { pattern: 1 } }) });
  assert.deepEqual(vis.visEdges.map(edgeKey), ["alpha->beta#combines-with"]);
  assert.equal(vis.st.gamma.off, 1);
  assert.equal(vis.st.alpha.off, undefined);
});

test("computeVisibility: reads edges whose endpoints d3 has swapped for node objects", () => {
  const core = loadCore();
  const { nodes, edges } = core.buildGraph(fixture());
  const byId = {};
  nodes.forEach((n) => { byId[n.id] = n; });
  const linked = edges.map((e) => Object.assign({}, e, { source: byId[e.source], target: byId[e.target] }));
  const plain = core.computeVisibility(nodes, edges, { filters: filters({ orphans: true }) });
  const live = core.computeVisibility(nodes, linked, { filters: filters({ orphans: true }) });
  assert.deepEqual(live.visNodes.map((n) => n.id), plain.visNodes.map((n) => n.id));
  assert.equal(live.sig, plain.sig);
});

test("computeVisibility: the signature changes only when the visible subgraph does", () => {
  const core = loadCore();
  const base = visible(core, { filters: filters() }).vis.sig;
  assert.equal(visible(core, { filters: filters() }).vis.sig, base, "same filters, same signature");
  assert.notEqual(visible(core, { filters: filters({ favs: true }) }).vis.sig, base);
  // Same nodes, one fewer edge — the layout still has to rebalance.
  assert.notEqual(visible(core, { filters: filters(), famHidden: (f) => f === "combines-with" }).vis.sig, base);
});

/* ---- settings ---- */

const DEMO = "demonstrated-by";

test("loadSettings: nothing stored yields the defaults, with demonstrates hidden", () => {
  const core = loadCore();
  const s = core.loadSettings(null, DEMO);
  assert.deepEqual(s, core.defaultSettings(DEMO));
  assert.equal(s.families[DEMO], false, "the hairball family starts hidden");
  assert.equal(s.filters.favs, false);
  assert.equal(s.filters.practiced, false, "neither visitor-state filter starts on");
  assert.equal(s.v, core.SETTINGS_VERSION);
});

test("loadSettings: corrupt, empty or foreign-version blobs fall back whole", () => {
  const core = loadCore();
  const fresh = core.defaultSettings(DEMO);
  for (const raw of ["{oops", "null", "[]", '"a string"', JSON.stringify({ v: 99, forces: { repel: 9 } })]) {
    assert.deepEqual(core.loadSettings(raw, DEMO), fresh, `should reject ${raw}`);
  }
});

test("loadSettings: a stored section is merged over the defaults, never half-applied", () => {
  const core = loadCore();
  const s = core.loadSettings(JSON.stringify({ v: core.SETTINGS_VERSION, forces: { repel: 300 }, display: { arrows: true } }), DEMO);
  assert.equal(s.forces.repel, 300);
  assert.equal(s.forces.dist, 80, "an absent key keeps its default");
  assert.equal(s.display.arrows, true);
  assert.equal(s.display.labelZoom, 1.4);
  assert.equal(s.filters.kinds.pattern, 1, "an absent section is untouched");
});

test("loadSettings: a blob stored before a filter existed still gains its default", () => {
  const core = loadCore();
  // What a visitor who last opened the map before the practiced filter shipped has.
  const s = core.loadSettings(JSON.stringify({ v: core.SETTINGS_VERSION, filters: { kinds: { pattern: 1 }, bands: {}, favs: true, orphans: false } }), DEMO);
  assert.equal(s.filters.favs, true, "what they set survives");
  assert.equal(s.filters.practiced, false, "what did not exist yet defaults, not undefined");
});

test("loadSettings: a family switched back ON survives the reload", () => {
  const core = loadCore();
  // A visible family is an ABSENT key, so the stored map replaces the default rather
  // than merging over it — merging would resurrect the hidden demonstrates family.
  const s = core.loadSettings(JSON.stringify({ v: core.SETTINGS_VERSION, families: {} }), DEMO);
  assert.deepEqual(s.families, {}, "demonstrates stays visible after a reload");
  const hidden = core.loadSettings(JSON.stringify({ v: core.SETTINGS_VERSION, families: { "combines-with": false } }), DEMO);
  assert.deepEqual(hidden.families, { "combines-with": false });
});

test("loadSettings: groups keep their shape — string query, colour inside the palette", () => {
  const core = loadCore();
  const s = core.loadSettings(JSON.stringify({ v: core.SETTINGS_VERSION, groups: [
    { q: "tag:caching", color: 3 },
    { q: "kind:hazard", color: 99 },     // clamped
    { q: "band:gof", color: 0 },         // clamped
    { q: "no colour" },                  // missing -> clamped from 0
    { color: 2 },                        // no query -> dropped
    null,                                // junk -> dropped
  ] }), DEMO);
  assert.deepEqual(s.groups, [
    { q: "tag:caching", color: 3 },
    { q: "kind:hazard", color: core.PALETTE_SIZE },
    { q: "band:gof", color: 1 },
    { q: "no colour", color: 1 },
  ]);
  assert.deepEqual(core.loadSettings(JSON.stringify({ v: core.SETTINGS_VERSION, groups: "nope" }), DEMO).groups, []);
});

test("loadSettings: each call returns its own object — no shared default state", () => {
  const core = loadCore();
  const a = core.loadSettings(null, DEMO);
  a.filters.kinds.pattern = 0;
  a.families.extra = false;
  const b = core.loadSettings(null, DEMO);
  assert.equal(b.filters.kinds.pattern, 1);
  assert.equal(b.families.extra, undefined);
});

/* ---------------- 2. the live corpus ---------------- */

function liveGraph() {
  const core = loadCore();
  const win = loadScripts("graphdata.js");
  return { core, data: win.KB_GRAPH, model: core.buildGraph(win.KB_GRAPH) };
}

test("live: every drawn edge joins two real nodes, once per pair and family", () => {
  const { model } = liveGraph();
  const seen = new Set();
  for (const e of model.edges) {
    assert.ok(model.byId[e.source] && model.byId[e.target], `dangling edge ${edgeKey(e)}`);
    const key = [e.source, e.target].sort().join("|") + "#" + e.family;
    assert.ok(!seen.has(key), `duplicate drawable edge ${key}`);
    seen.add(key);
  }
  assert.ok(model.edges.length > 100, `expected a populated graph, got ${model.edges.length}`);
});

test("live: every directional edge points along its family's canonical verb", () => {
  const { core, data, model } = liveGraph();
  for (const e of model.edges) {
    const def = data.relationTypes[e.family];
    assert.equal(e.dir, def.symmetric ? 0 : 1, `${edgeKey(e)} carries the wrong arrow flag`);
    if (e.dir) {
      // The source page must declare the canonical verb itself, not its inverse.
      const rel = (model.byId[e.source].relations || [])
        .find((r) => r.to === e.target && core.familyOf(data.relationTypes, r.type) === e.family);
      assert.equal(rel.type, e.family, `${edgeKey(e)} is oriented against its canonical verb`);
    }
  }
});

test("live: the default view keeps most of the corpus on screen", () => {
  const { core, data, model } = liveGraph();
  const settings = core.defaultSettings(core.familyOf(data.relationTypes, "demonstrates"));
  const vis = core.computeVisibility(model.nodes, model.edges, {
    filters: settings.filters,
    famHidden: (f) => settings.families[f] === false,
  });
  assert.equal(vis.visNodes.length, model.nodes.length, "no kind is hidden by default");
  assert.ok(vis.visEdges.length < model.edges.length, "the demonstrates family is hidden by default");
  // Hiding orphans with that family off strands the case studies, as the panel warns.
  const pruned = core.computeVisibility(model.nodes, model.edges, {
    filters: Object.assign({}, settings.filters, { orphans: true }),
    famHidden: (f) => settings.families[f] === false,
  });
  assert.ok(pruned.visNodes.length < vis.visNodes.length);
  // Case studies reach the graph almost only through demonstrates, so hiding that
  // family strands them — bar the handful joined to each other by another verb.
  const designs = model.nodes.filter((n) => n.kind === "design");
  const survivors = pruned.visNodes.filter((n) => n.kind === "design");
  assert.ok(survivors.length < designs.length / 10,
    `expected the case studies to strand, ${survivors.length} of ${designs.length} survived`);
  for (const d of survivors) {
    assert.ok(pruned.visEdges.some((e) => [e.source, e.target].map(core.endId).includes(d.id)),
      `${d.id} survived without a visible edge`);
  }
});

test("live: the query language answers real queries over the real catalog", () => {
  const { core, model } = liveGraph();
  const win = loadScripts("catalog.js", "search.js");
  const meta = {};
  (win.KB_CATALOG.nodes || []).forEach((c) => {
    meta[c.id] = {
      tags: (c.tags || []).map((t) => t.toLowerCase()),
      aliases: (c.aliases || []).map((a) => a.toLowerCase()),
    };
  });
  const context = { metaOf: (id) => meta[id] || { tags: [], aliases: [] }, matches: win.KB_MATCHES };
  const run = (q) => model.nodes.filter(core.compileQuery(q, context)).map((n) => n.id);

  assert.ok(run("tag:caching").length >= 3, "tag:caching should collect the caching pages");
  assert.ok(run("tag:caching").every((id) => meta[id].tags.some((t) => t.includes("caching"))));
  assert.ok(run("kind:design").every((id) => model.byId[id].kind === "design"));
  assert.ok(run("fav:true").length && run("fav:true").every((id) => model.byId[id].favourite));
  assert.ok(run("circuit").includes("circuit-breaker"));
  assert.ok(run("kind:pattern -tag:caching").every((id) => !meta[id].tags.some((t) => t.includes("caching"))));
  // The hub scorer is what makes a whole symptom work as a filter.
  assert.ok(run("one slow dependency blocks my threads").includes("circuit-breaker"));
});

/* ---------------- 3. cross-layer contracts ---------------- */

test("shell + CSS + runtime agree on the canonical family ids", () => {
  const { core, data, model } = liveGraph();
  const shell = readFileSync(join(REPO, "site", "map", "graph.html"), "utf8");
  const css = readFileSync(join(ASSETS, "graph.css"), "utf8");
  const legend = new Set([...shell.matchAll(/data-family="([^"]+)"/g)].map((m) => m[1]));
  const runtime = new Set(Object.keys(data.relationTypes).map((t) => core.familyOf(data.relationTypes, t)));
  assert.deepEqual([...legend].sort(), [...runtime].sort(), "the legend must offer exactly the drawable families");
  for (const fam of runtime) assert.ok(css.includes(`.fam-${fam}`), `graph.css has no color for fam-${fam}`);
  for (const e of model.edges) assert.ok(runtime.has(e.family), `edge family ${e.family} is off-vocabulary`);
});

test("the shell's slider defaults match the runtime's, so nothing jumps at load", () => {
  const core = loadCore();
  const shell = readFileSync(join(REPO, "site", "map", "graph.html"), "utf8");
  const value = (id) => {
    const m = shell.match(new RegExp(`id="${id}"[^>]*value="([^"]+)"`));
    assert.ok(m, `no slider #${id} in the shell`);
    return parseFloat(m[1]);
  };
  const d = core.defaultSettings("demonstrated-by");
  assert.equal(value("sl-label"), d.display.labelZoom);
  assert.equal(value("sl-node"), d.display.nodeScale);
  assert.equal(value("sl-edge"), d.display.edgeScale);
  assert.equal(value("sl-center"), d.forces.center);
  assert.equal(value("sl-repel"), d.forces.repel);
  assert.equal(value("sl-link"), d.forces.link);
  assert.equal(value("sl-dist"), d.forces.dist);
  // The unchecked toggles are the false defaults.
  assert.equal(d.display.arrows, false);
  assert.equal(d.filters.favs, false);
  assert.equal(d.filters.orphans, false);
  for (const id of ["arrows-toggle", "fav-toggle", "orphans-toggle"]) {
    assert.ok(!new RegExp(`id="${id}"[^>]*checked`).test(shell), `#${id} should ship unchecked`);
  }
});

test("the group palette the runtime cycles through is the one graph.css paints", () => {
  const core = loadCore();
  const css = readFileSync(join(ASSETS, "graph.css"), "utf8");
  for (let i = 1; i <= core.PALETTE_SIZE; i++) assert.ok(css.includes(`.grp-${i}`), `graph.css has no .grp-${i}`);
  assert.ok(!css.includes(`.grp-${core.PALETTE_SIZE + 1}`), "graph.css paints a colour the runtime never assigns");
});

test("graph-view.js consumes the core rather than keeping a second copy", () => {
  const view = readFileSync(join(ASSETS, "graph-view.js"), "utf8");
  assert.ok(view.includes("window.KB_GRAPH_CORE"), "the runtime must read the core");
  // Drift guard: if any of these grows back in the runtime, it is logic these tests
  // stopped covering.
  for (const [dup, what] of [["seen[key]", "edge dedupe"], ["hasEdge", "the orphan pass"],
    ["JSON.parse(raw", "settings migration"], ["def.symmetric", "family canonicalization"]]) {
    assert.ok(!view.includes(dup), `graph-view.js has its own ${what} again ("${dup}")`);
  }
  // The shell no longer lists scripts itself — kb.js's "graph" profile does, in its tail
  // array, and array order IS load order (kb.js writes each tag with `defer`, so they
  // execute in the order written). Read the manifest the way the runtime does.
  const tail = loadScripts("kb.js").KB_ASSETS.profiles.graph.tail;
  assert.ok(tail.includes("graph-core.js"), "the graph profile must load the core");
  assert.ok(tail.indexOf("graph-core.js") < tail.indexOf("graph-view.js"), "core loads first");

  const shell = readFileSync(join(REPO, "site", "map", "graph.html"), "utf8");
  assert.match(shell, /data-profile="graph"/, "the shell selects the graph profile");
});
