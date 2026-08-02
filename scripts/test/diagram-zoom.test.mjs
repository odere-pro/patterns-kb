/* diagram-zoom.test.mjs — the arithmetic behind the diagram zoom, run with `node --test`.
 *
 * The script is mostly wiring: pointer events, a <dialog>, a control strip. Four functions
 * inside it are pure, and they are the four that can be wrong on their own — each guarding a
 * specific way this feature breaks in the browser, where nothing would throw and nothing would
 * fail a build:
 *
 *   fit()       — does a diagram larger than its box shrink to fit, and one smaller MAGNIFY?
 *   zoomAt()    — does the point under the cursor stay under the cursor, clamp included?
 *   clampPan()  — can the reader drag a diagram out of the frame and lose it?
 *   labelFor()  — do ten figures on one page get ten distinguishable button labels?
 *
 * diagram-zoom.js exposes them before it touches the DOM and returns early when there is no
 * document, so this loads the shipped file with no DOM stub at all — the same seam vocab.js
 * takes. Logic that moves out of window.KB_DIAGRAM_ZOOM stops being tested.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, "..", "..", "site", "assets");

function load() {
  const window = {};
  const src = readFileSync(join(ASSETS, "diagram-zoom.js"), "utf8");
  runInThisContext("(function (window) {\n" + src + "\n})")(window);
  assert.ok(window.KB_DIAGRAM_ZOOM, "diagram-zoom.js should expose window.KB_DIAGRAM_ZOOM");
  return window.KB_DIAGRAM_ZOOM;
}

const Z = load();
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

/* ---------------- fit ---------------- */

test("fit shrinks a diagram larger than its stage, and centres it", () => {
  // Arrange — the ER schema case: far wider than the column it has to live in.
  const content = { w: 4000, h: 1200 };
  const view = { w: 1000, h: 800 };

  // Act
  const st = Z.fit(content, view, 24, Z.MAX);

  // Assert — width-bound, and the leftover space is split evenly.
  assert.ok(near(st.scale, (1000 - 48) / 4000), `width-bound scale, got ${st.scale}`);
  assert.ok(near(2 * st.x + content.w * st.scale, view.w), "centred horizontally");
  assert.ok(near(2 * st.y + content.h * st.scale, view.h), "centred vertically");
});

test("fit MAGNIFIES a diagram smaller than its stage", () => {
  // The whole point of the viewer: a board drawn to fit an article column is unreadable at
  // that size. Cap this at 1 and the unreadable-board complaint comes straight back.
  const st = Z.fit({ w: 500, h: 300 }, { w: 1000, h: 800 }, 24, Z.MAX);

  assert.ok(st.scale > 1, `expected magnification, got ${st.scale}`);
});

test("fit never magnifies past the caller's max — which is 1 inline", () => {
  // Inline the cap is 1, so a diagram that already fitted its column keeps its exact
  // footprint and ~600 pages do not move under the reader.
  const st = Z.fit({ w: 500, h: 300 }, { w: 1000, h: 800 }, 0, 1);

  assert.equal(st.scale, 1);
  assert.ok(near(2 * st.x + 500, 1000), "still centred at the cap");
});

test("fit is height-bound for a tall narrow diagram, and clamps to MAX", () => {
  const tall = Z.fit({ w: 200, h: 4000 }, { w: 1000, h: 800 }, 0, Z.MAX);
  assert.ok(near(tall.scale, 800 / 4000), `height-bound scale, got ${tall.scale}`);

  const tiny = Z.fit({ w: 20, h: 10 }, { w: 1000, h: 800 }, 0, Z.MAX);
  assert.equal(tiny.scale, Z.MAX, "raw fit of 50 clamps to MAX");
  assert.ok(near(2 * tiny.x + 20 * Z.MAX, 1000), "still centred after clamping");
});

test("fit declines a zero dimension instead of dividing by it", () => {
  // A mermaid syntax-error placeholder can measure zero. Infinity here would make the
  // diagram vanish rather than render badly, which is much harder to diagnose.
  const st = Z.fit({ w: 0, h: 0 }, { w: 1000, h: 800 }, 24, Z.MAX);

  assert.equal(st.scale, 1);
  assert.ok(Number.isFinite(st.x) && Number.isFinite(st.y));
});

/* ---------------- zoomAt ---------------- */

test("zoomAt keeps the content under the cursor under the cursor", () => {
  const before = { scale: 1, x: 0, y: 0 };

  const after = Z.zoomAt(before, 2, 300, 200, Z.MIN, Z.MAX);

  assert.equal(after.scale, 2);
  assert.ok(near((300 - after.x) / after.scale, (300 - before.x) / before.scale), "x anchored");
  assert.ok(near((200 - after.y) / after.scale, (200 - before.y) / before.scale), "y anchored");
});

test("zoomAt does not drift once the scale has clamped", () => {
  // Holding zoom-in at maximum must do nothing at all. Apply the requested factor to the
  // translation while the scale refuses it and the diagram creeps sideways under the reader.
  const at = { scale: Z.MAX, x: -50, y: -20 };

  const after = Z.zoomAt(at, 2, 300, 200, Z.MIN, Z.MAX);

  assert.deepEqual(after, at);
});

/* ---------------- clampPan ---------------- */

test("clampPan centres content smaller than the view, whatever pan is asked for", () => {
  const st = { scale: 1, x: 9999, y: -9999 };

  const p = Z.clampPan(st, { w: 400, h: 200 }, { w: 1000, h: 800 });

  assert.equal(p.x, 300);
  assert.equal(p.y, 300);
});

test("clampPan leaves no gap at any edge once the content is larger than the view", () => {
  const content = { w: 4000, h: 1200 };
  const view = { w: 1000, h: 800 };

  const right = Z.clampPan({ scale: 1, x: 500, y: 0 }, content, view);
  const left = Z.clampPan({ scale: 1, x: -99999, y: -99999 }, content, view);

  assert.equal(right.x, 0, "cannot expose space before the left edge");
  assert.equal(left.x, view.w - content.w, "cannot pan past the right edge");
  assert.equal(left.y, view.h - content.h, "cannot pan past the bottom edge");
});

/* ---------------- labelFor ---------------- */

test("labelFor names the diagram from its caption, truncated on a word boundary", () => {
  const caption =
    "Every table and how they join, so the delivery contract can be read without " +
    "opening four separate schema sketches one after another.";

  const label = Z.labelFor(caption);

  assert.ok(label.startsWith("Zoom diagram: Every table and how they join"), label);
  assert.ok(label.length <= "Zoom diagram: ".length + 71, `too long: ${label}`);
  assert.ok(!/\s…$/.test(label), "should not truncate mid-space");
});

test("labelFor falls back when a figure has no usable caption", () => {
  assert.equal(Z.labelFor(""), "Zoom diagram");
  assert.equal(Z.labelFor("   "), "Zoom diagram");
  assert.equal(Z.labelFor(null), "Zoom diagram");
});
