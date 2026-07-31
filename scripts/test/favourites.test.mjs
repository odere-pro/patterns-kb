/* favourites.test.mjs — state-model tests for site/assets/favourites.js, run with
 * `node --test`.
 *
 * The site UI layer is otherwise verified by hand in a browser, which is fine for
 * appearance and useless for this: favourites keeps a store of OVERRIDES against the
 * authored defaults, and the interesting cases (opting out of a pick, opting back in,
 * the filter emptying under the visitor) are invisible until they go wrong weeks later.
 * So the real script runs here against a DOM stub built to the shape it actually
 * queries — chip stars, a content page's main/metarow, the hub filter button.
 *
 * The stub covers what favourites.js touches and nothing else. It is not a DOM and
 * will not answer a question the script does not ask; extend it alongside the script.
 * Layout, styling and pointer behaviour are still browser-verified.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "..", "site", "assets", "favourites.js");
const KEY = "kb-favourites-v1";

function makeEl(tag, attrs = {}, classes = []) {
  const el = {
    tagName: tag,
    _attrs: { ...attrs },
    _classes: new Set(classes),
    children: [],
    parent: null,
    _listeners: {},
    style: {},
    hidden: false,
    get className() { return [...this._classes].join(" "); },
    set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    set innerHTML(v) { this._html = v; },
    set textContent(v) { this._text = v; },
    set type(v) { this._attrs.type = v; },
    set title(v) { this._attrs.title = v; },
    get title() { return this._attrs.title; },
    getAttribute: (k) => (k in el._attrs ? el._attrs[k] : null),
    setAttribute: (k, v) => { el._attrs[k] = String(v); },
    removeAttribute: (k) => { delete el._attrs[k]; },
    hasAttribute: (k) => k in el._attrs,
    appendChild: (c) => { c.parent = el; el.children.push(c); return c; },
    addEventListener: (ev, fn) => { (el._listeners[ev] ||= []).push(fn); },
    click: () => (el._listeners.click || []).forEach((f) =>
      f({ preventDefault() {}, stopPropagation() {} })),
    closest(sel) {
      const want = sel.replace(".", "");
      let n = el;
      while (n) { if (n._classes.has(want)) return n; n = n.parent; }
      return null;
    },
    classList: {
      add: (c) => el._classes.add(c),
      remove: (c) => el._classes.delete(c),
      contains: (c) => el._classes.has(c),
      toggle: (c) =>
        el._classes.has(c) ? (el._classes.delete(c), false) : (el._classes.add(c), true),
    },
  };
  return el;
}

/* Build the DOM the script expects, run it, and hand back the handles plus a view of
   what it persisted. `chips` are hub cards; `page` makes it a content page. */
function run({ chips = [], page = null, withFilter = false, store = {} } = {}) {
  const filterBtn = withFilter ? makeEl("button", { id: "fav-filter-btn" }) : null;

  const chipEls = chips.map(({ id, fav, name }) => {
    const chip = makeEl("div", fav ? { "data-fav": "1" } : {}, ["chip"]);
    const star = makeEl("button", {
      "data-fav-id": id,
      "aria-pressed": fav ? "true" : "false",
      "aria-label": `${fav ? "Favourite — click to unmark" : "Mark favourite"}: ${name}`,
    }, ["chip-fav"]);
    chip.appendChild(star);
    return { chip, star, id };
  });

  let main = null;
  let metarow = null;
  if (page) {
    main = makeEl("main", {
      "data-kb-id": page.id,
      ...(page.fav ? { "data-kb-favourite": "true" } : {}),
    }, ["doc-wrap"]);
    metarow = makeEl("div", {}, ["doc-metarow"]);
  }

  const body = makeEl("body");
  const backing = { ...store };
  const sandbox = {
    document: {
      body,
      querySelectorAll: (sel) => (sel.includes("chip-fav") ? chipEls.map((c) => c.star) : []),
      querySelector: (sel) =>
        sel.includes("doc-wrap") ? main : sel.includes("doc-metarow") ? metarow : null,
      getElementById: (id) => (id === "fav-filter-btn" ? filterBtn : null),
      createElement: (t) => makeEl(t),
    },
    localStorage: {
      getItem: (k) => (k in backing ? backing[k] : null),
      setItem: (k, v) => { backing[k] = v; },
    },
    Object, Array, JSON, console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(SCRIPT, "utf8"), sandbox);

  return {
    chipEls, main, metarow, body, filterBtn,
    saved: () => JSON.parse(backing[KEY] || "{}"),
    floating: () => body.children.find((c) => c.className === "fav-toggle"),
  };
}

test("authored defaults render with an empty store, and loading writes nothing", () => {
  const r = run({ chips: [
    { id: "a", fav: true, name: "A" },
    { id: "b", fav: false, name: "B" },
  ] });
  assert.equal(r.chipEls[0].chip.hasAttribute("data-fav"), true);
  assert.equal(r.chipEls[0].star.getAttribute("aria-pressed"), "true");
  assert.equal(r.chipEls[1].chip.hasAttribute("data-fav"), false);
  assert.deepEqual(r.saved(), {});
});

test("an override is stored only while it diverges from the default", () => {
  const r = run({ chips: [{ id: "b", fav: false, name: "B" }] });
  r.chipEls[0].star.click();
  assert.deepEqual(r.saved(), { b: true });
  assert.equal(r.chipEls[0].chip.hasAttribute("data-fav"), true);

  r.chipEls[0].star.click();
  assert.deepEqual(r.saved(), {}, "back at the default the key is deleted, not set false");
  assert.equal(r.chipEls[0].chip.hasAttribute("data-fav"), false);
});

test("opting out of an authored pick persists across a reload", () => {
  const first = run({ chips: [{ id: "a", fav: true, name: "A" }] });
  first.chipEls[0].star.click();
  assert.deepEqual(first.saved(), { a: false });

  const reloaded = run({
    chips: [{ id: "a", fav: true, name: "A" }],
    store: { [KEY]: '{"a":false}' },
  });
  assert.equal(reloaded.chipEls[0].chip.hasAttribute("data-fav"), false);
  assert.equal(reloaded.chipEls[0].star.getAttribute("aria-pressed"), "false");
});

test("a content page injects both controls and keeps them in sync", () => {
  const r = run({ page: { id: "fan-out", fav: false } });
  assert.equal(r.metarow.children.length, 1);
  assert.equal(r.metarow.children[0].className, "favourite");
  const floating = r.floating();
  assert.ok(floating, "floating toggle joins the fixed cluster");

  floating.click();
  assert.deepEqual(r.saved(), { "fan-out": true });
  assert.equal(r.metarow.children[0].getAttribute("aria-pressed"), "true");
  assert.equal(floating.getAttribute("aria-pressed"), "true");
});

test("the hub filter hides itself when the effective set is empty", () => {
  const r = run({ chips: [{ id: "b", fav: false, name: "B" }], withFilter: true });
  assert.equal(r.filterBtn.hidden, true);
  r.chipEls[0].star.click();
  assert.equal(r.filterBtn.hidden, false);
  r.chipEls[0].star.click();
  assert.equal(r.filterBtn.hidden, true);
});

test("removing the last favourite releases an engaged filter", () => {
  const r = run({ chips: [{ id: "a", fav: true, name: "A" }], withFilter: true });
  r.filterBtn._listeners.click[0]();
  assert.equal(r.body.classList.contains("fav-only"), true);

  r.chipEls[0].star.click();
  assert.equal(r.body.classList.contains("fav-only"), false,
    "filtering to an empty map would leave the visitor staring at nothing");
});
