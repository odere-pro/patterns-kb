/* palette.test.mjs — the ⌘K palette's two pieces of arithmetic, run with `node --test`.
 *
 * The palette deliberately scores nothing of its own: window.KB_MATCHES (search.js) ranks, and
 * the palette orders and caps. So there are exactly two things here that can be wrong on their
 * own, and both are pure:
 *
 *   rank()             — is the list really the hub's ranking, descending, capped at the limit?
 *   prefixFromHrefs()  — does a page four levels deep compute its own way back to site root?
 *
 * Plus the key split, which is not arithmetic but is what actually broke: ⌘K must open the
 * palette on EVERY page, and "/" must stay with a page that renders a search box of its own.
 *
 * The second is the one that fails silently in production: get it wrong and every result links
 * to a 404, on 354 pages, with no build error — check-links.mjs cannot see an href a script
 * computes at runtime. Hence a case per depth the site actually has.
 *
 * Loaded the way search-parity.test.mjs loads the hub: the shipped files in a vm with a stub
 * DOM, so the test exercises what the browser gets rather than a copy of it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, "..", "..", "site", "assets");

/* catalog.js → search.js → palette.js, the order the pages load them in. The stub returns no
 * .controls and no #graph-search, so search.js's mount() early-returns and the palette's
 * ownership guard lets it install — which is the content-page case. */
function loadPalette() {
  const window = {};
  const document = {
    readyState: "complete",
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => ({ setAttribute() {}, appendChild() {}, querySelector: () => null }),
    body: { appendChild() {} },
  };
  const ctx = createContext({ window, document, setTimeout, clearTimeout });
  for (const f of ["catalog.js", "search.js", "palette.js"]) {
    runInContext(readFileSync(join(ASSETS, f), "utf8"), ctx);
  }
  assert.equal(typeof window.KB_MATCHES, "function", "search.js should expose window.KB_MATCHES");
  assert.ok(window.KB_PALETTE, "palette.js should expose window.KB_PALETTE");
  return window;
}

const win = loadPalette();
const { prefixFromHrefs, rank, limit } = win.KB_PALETTE;

/* ---------------- the palette does not invent a ranking ---------------- */

const QUERIES = [
  "circuit breaker",
  "one slow dependency blocks my threads",
  "my cache keeps serving stale data",
  "kafka",
  "adding a payment provider means editing a huge switch",
];

test("rank() returns the hub's own hits, nothing added or dropped", () => {
  for (const q of QUERIES) {
    const hits = win.KB_MATCHES(q);
    const ids = rank(q).map((n) => n.id);
    assert.ok(ids.length > 0, `"${q}" should match something`);
    // Every id the palette shows is one the scorer actually returned.
    for (const id of ids) assert.ok(hits[id] !== undefined, `"${q}": ${id} is not a KB_MATCHES hit`);
    // And it shows all of them, unless the cap bit.
    const total = Object.keys(hits).length;
    assert.equal(ids.length, Math.min(total, limit), `"${q}": ${total} hits should yield ${Math.min(total, limit)} rows`);
  }
});

test("rank() is ordered by descending score", () => {
  for (const q of QUERIES) {
    const hits = win.KB_MATCHES(q);
    const scores = rank(q).map((n) => hits[n.id]);
    for (let i = 1; i < scores.length; i++) {
      assert.ok(scores[i] <= scores[i - 1], `"${q}": score rose from ${scores[i - 1]} to ${scores[i]} at ${i}`);
    }
  }
});

test("rank() keeps the strongest hit, not merely 20 of them", () => {
  for (const q of QUERIES) {
    const hits = win.KB_MATCHES(q);
    const best = Object.keys(hits).reduce((a, b) => (hits[b] > hits[a] ? b : a));
    assert.equal(rank(q)[0].id, best, `"${q}": top row should be the best-scoring page`);
  }
});

test("rank() is empty for an empty or whitespace query", () => {
  // Length rather than deepEqual: the array is built inside the vm, so it is an Array from
  // another realm and a strict prototype comparison would fail on an empty one.
  for (const q of ["", "   ", null, undefined]) {
    assert.equal(rank(q).length, 0, `${JSON.stringify(q)} should rank nothing`);
  }
});

test("every ranked node carries what the row renders", () => {
  for (const n of rank("circuit breaker")) {
    assert.equal(typeof n.name, "string");
    assert.equal(typeof n.kind, "string");
    assert.equal(typeof n.path, "string");
    assert.ok(n.path.endsWith(".html"), `${n.id}: path should be a page`);
    assert.ok(!n.path.startsWith("/"), `${n.id}: catalog paths are site-root-relative, not absolute`);
  }
});

/* ---------------- depth: the failure that check-links cannot see ---------------- */

test("prefixFromHrefs() derives the way back to site root at every depth the site has", () => {
  const cases = [
    // [what the page's <head> says, the prefix it implies, which page looks like this]
    ["assets/kb-hub.css", "", "site/index.html — site root"],
    ["assets/kb-page.css", "", "site/vocab.html — site root"],
    ["../assets/kb-page.css", "../", "site/map/stack.html"],
    ["../assets/kb-graph.css", "../", "site/map/graph.html"],
    ["../assets/kb-page.css", "../", "site/designs/uber.html"],
    ["../../assets/kb-page.css", "../../", "site/patterns/<band>/<id>.html"],
    ["../../../assets/kb-page.css", "../../../", "site/patterns/<band>/<group>/<id>.html"],
    // The pre-aggregator head, still honoured for a page that loads palette.js alone.
    ["../../assets/tokens.css", "../../", "a page linking tokens.css directly"],
  ];
  for (const [href, want, where] of cases) {
    assert.equal(prefixFromHrefs([href]), want, where);
  }
});

test("prefixFromHrefs() is not fooled by a stylesheet that merely sits alongside", () => {
  assert.equal(prefixFromHrefs(["../assets/pattern.css", "../assets/kb-page.css"]), "../");
  assert.equal(prefixFromHrefs(["../assets/graph.css", "../assets/kb-graph.css"]), "../");
});

test("prefixFromHrefs() falls back to site root rather than throwing", () => {
  for (const hrefs of [[], [null], [undefined], ["assets/pattern.css"], ["https://example.com/x.css"]]) {
    assert.equal(prefixFromHrefs(hrefs), "", `${JSON.stringify(hrefs)} should fall back to ""`);
  }
});

/* A ranked path joined to a derived prefix has to be the relative href a page can follow. */
test("prefix + catalog path is a usable relative href", () => {
  const node = rank("circuit breaker")[0];
  assert.equal(prefixFromHrefs(["assets/tokens.css"]) + node.path, node.path);
  assert.equal(
    prefixFromHrefs(["../../../assets/tokens.css"]) + node.path,
    `../../../${node.path}`,
  );
});

/* ---------------- which key, on which page ---------------- */

/* A stub element that survives whatever search.js's mount() does to it. Nothing here is
 * asserted on — it exists so the real search.js can run and register its own "/" handler,
 * which is the handler the palette has to leave room for. */
function stubEl() {
  const node = {
    className: "", textContent: "", innerHTML: "", type: "", dataset: {}, nextSibling: null,
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {},
    appendChild(c) { return c; }, insertBefore() {}, focus() {}, select() {}, blur() {},
    closest: () => null, querySelector: () => stubEl(), querySelectorAll: () => [],
  };
  node.parentNode = { insertBefore() {} };
  return node;
}

/* Load the page's script trio against a stub that reports whether the page renders a local
 * search box, capturing ONLY the keydown handlers palette.js adds — search.js registers one
 * of its own on the hub, and the question here is which key the palette itself claims. */
function loadWithOwner(owner) {
  const window = {};
  const handlers = [];
  const document = {
    readyState: "complete",
    // The hub renders .controls; the graph renders #graph-search. Either owns "/".
    querySelector: (sel) => (owner && sel.includes(owner) ? stubEl() : null),
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { if (type === "keydown") handlers.push(fn); },
    createElement: () => stubEl(),
    body: { appendChild() {} },
  };
  const ctx = createContext({ window, document, setTimeout, clearTimeout });
  for (const f of ["catalog.js", "search.js"]) {
    runInContext(readFileSync(join(ASSETS, f), "utf8"), ctx);
  }
  const theirs = handlers.length;
  runInContext(readFileSync(join(ASSETS, "palette.js"), "utf8"), ctx);
  const ours = handlers.slice(theirs);

  /* Did the palette claim the key? preventDefault is the observable — show() needs a real
   * DOM, so a throw past that point is expected and still means "claimed". */
  const press = (key, meta) => {
    let claimed = false;
    for (const fn of ours) {
      const e = { key, metaKey: !!meta, ctrlKey: false, altKey: false,
        preventDefault: () => { claimed = true; } };
      try { fn(e); } catch { /* show() fell over on the stub DOM — after preventDefault */ }
    }
    return claimed;
  };
  return { window, press };
}

test("⌘K opens the palette on every page, local search box or not", () => {
  for (const owner of [null, "controls", "graph-search"]) {
    const { window, press } = loadWithOwner(owner);
    assert.ok(window.KB_PALETTE, `${owner || "content page"}: palette should install`);
    assert.ok(press("k", true), `${owner || "content page"}: ⌘K should open the palette`);
  }
});

test('"/" is left to whoever renders a search box of their own', () => {
  // No local box: the palette takes "/" too, the way every wiki binds it.
  assert.ok(loadWithOwner(null).press("/", false), "content page: / should open the palette");
  // The hub filters tiles in place and the graph queries its canvas; both beat a modal, so
  // the palette declines the key and their own handlers get it.
  for (const owner of ["controls", "graph-search"]) {
    assert.equal(loadWithOwner(owner).press("/", false), false, `.${owner}: / stays local`);
  }
});

test("palette.js stands down when catalog.js never ran, rather than throwing", () => {
  const window = {};
  const document = {
    readyState: "complete",
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const ctx = createContext({ window, document, setTimeout, clearTimeout });
  runInContext(readFileSync(join(ASSETS, "palette.js"), "utf8"), ctx);
  assert.equal(window.KB_PALETTE, undefined, "no catalog and no scorer: install nothing");
});
