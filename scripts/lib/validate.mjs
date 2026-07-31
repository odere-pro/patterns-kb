/* validate.mjs — single-page structural validation.
 *
 * One implementation, two consumers: `kb.mjs validate` (per-page, fast enough for
 * the PostToolUse hook) and `build-pages.mjs` (corpus-wide inside `make check`).
 * Needs no graph.json, so a single page validates in ~50ms.
 */
import { parse } from "../vendor/node-html-parser.mjs";
import { BLOCKS, OPTIONAL_BLOCKS, TAGS, RELATION_TYPES, LEVELS, folderFor } from "./model.mjs";
import { pruneForLens } from "./lens.mjs";

/** Block-vocabulary problems for one page: missing, unknown, out of order. */
export function blockProblems(present, kind) {
  const want = BLOCKS[kind];
  if (!want) return [`unknown kind "${kind}"`];
  const problems = [];
  const optional = OPTIONAL_BLOCKS[kind] ?? new Set();
  for (const b of want) {
    if (!present.includes(b) && !optional.has(b)) problems.push(`missing block "${b}"`);
  }
  for (const b of present) if (!want.includes(b)) problems.push(`unknown block "${b}"`);
  const ordered = present.filter((b) => want.includes(b));
  if (JSON.stringify(ordered) !== JSON.stringify(want.filter((b) => present.includes(b))))
    problems.push(`blocks out of order: ${present.join(" ")}`);
  return problems;
}

/** Lens-mechanics problems for one parsed page: register vocabulary, the
 *  level-XOR-register rule, ascending variant runs, and the guarantee that no
 *  block renders empty at any lens (the invariant behind "same structure at
 *  every level"). Shared by validatePage and the corpus-wide build check. */
export function lensProblems(root) {
  const problems = [];
  const registered = root.querySelectorAll("[data-kb-register]");

  for (const el of registered) {
    const reg = el.getAttribute("data-kb-register");
    if (!LEVELS.includes(reg))
      problems.push(`data-kb-register "${reg}" is not in the closed vocabulary (${LEVELS.join("/")})`);
    if (el.getAttribute("data-kb-level") != null)
      problems.push(`#${el.getAttribute("id") ?? "?"} carries both data-kb-level and data-kb-register`);
    if (el.getAttribute("data-kb-block"))
      problems.push(`section "${el.getAttribute("data-kb-block")}" carries data-kb-register — registers go on elements, blocks always show`);
  }

  /* A maximal run of adjacent registered siblings is one variant group: registers
   * must ascend and not repeat, so each lens picks at most one rung per group. */
  const parents = [...new Set(registered.map((el) => el.parentNode))];
  for (const parent of parents) {
    let run = [];
    const flush = () => {
      for (let i = 1; i < run.length; i++) {
        if (LEVELS.indexOf(run[i]) <= LEVELS.indexOf(run[i - 1]))
          problems.push(`variant group runs ${run.join(" → ")} — registers must ascend without repeats`);
      }
      run = [];
    };
    for (const c of parent.childNodes) {
      if (c.nodeType !== 1) continue;
      /* A variation's dd mirrors its dt's register (stamped by build-pages so the
       * pair hides together) — it is derived, not a second rung in the run. */
      if (c.tagName?.toLowerCase() === "dd") continue;
      const reg = c.getAttribute?.("data-kb-register");
      if (reg) run.push(reg);
      else flush();
    }
    flush();
  }

  /* No block may come back empty at any lens. Clone the section, prune what the
   * lens would hide (min-level accretion + exact-match registers), drop the
   * headings, and demand some text survives. The basic lens is the one that bites:
   * it is what forces at least one untagged item into every mandatory list. */
  for (const sec of root.querySelectorAll("[data-kb-block]")) {
    const block = sec.getAttribute("data-kb-block");
    /* relationships renders link cards written by kb.mjs link — a freshly scaffolded
     * page legitimately has none yet, and its content is never lens-tagged. */
    if (block === "relationships") continue;
    for (const lens of LEVELS) {
      const clone = parse(sec.toString(), { comment: true });
      pruneForLens(clone, lens);
      for (const h of clone.querySelectorAll("h2, h3")) h.remove();
      if (!clone.text.trim()) {
        problems.push(`block "${block}" renders empty at the ${lens} lens`);
        break; // one report per block is enough
      }
    }
  }

  return problems;
}

/** Structural problems for one parsed page. `relPath` is site-relative
 *  (e.g. "patterns/caching/cache-aside.html"). Returns [] when clean. */
export function validatePage(root, relPath) {
  const doc = root.querySelector("[data-kb-id]");
  if (!doc) return [`${relPath}: no element with data-kb-id`];

  const problems = [];
  const id = doc.getAttribute("data-kb-id");
  const kind = doc.getAttribute("data-kb-kind");
  const stem = relPath.split("/").pop().replace(/\.html$/, "");
  const p = (msg) => problems.push(`${id || relPath}: ${msg}`);

  if (id !== stem) p(`data-kb-id "${id}" does not match filename "${stem}"`);

  if (!BLOCKS[kind]) {
    p(`unknown data-kb-kind "${kind}"`);
    return problems; // everything below keys off the kind
  }

  const present = root
    .querySelectorAll("[data-kb-block]")
    .map((s) => s.getAttribute("data-kb-block"));
  for (const msg of blockProblems(present, kind)) p(msg);

  if (!doc.getAttribute("data-kb-essence")?.trim()) p("missing data-kb-essence");

  /* The path must match the declared band/group. */
  try {
    const wantDir = folderFor({
      kind,
      band: doc.getAttribute("data-kb-band"),
      group: doc.getAttribute("data-kb-group"),
    });
    const dir = relPath.split("/").slice(0, -1).join("/");
    if (dir !== wantDir) p(`filed in "${dir}" but band/group say "${wantDir}"`);
  } catch (e) {
    p(e.message);
  }

  /* JSON-valued attributes parse, hold strings, and tags stay in the closed set. */
  for (const key of ["aliases", "tags", "solves"]) {
    const raw = doc.getAttribute(`data-kb-${key}`);
    if (raw == null) continue;
    let v;
    try { v = JSON.parse(raw); } catch { p(`data-kb-${key} is not valid JSON`); continue; }
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !x.trim()))
      p(`data-kb-${key} must be a JSON array of non-empty strings`);
    else if (key === "tags") for (const t of v) if (!TAGS.has(t)) p(`tag "${t}" is not in the closed vocabulary`);
  }

  /* Relations use known verbs and name a target. (Both-sidedness needs the whole
   * corpus — that stays in make check.) */
  for (const el of root.querySelectorAll("[data-kb-rel]")) {
    const verb = el.getAttribute("data-kb-rel");
    if (!RELATION_TYPES[verb]) p(`unknown relation verb "${verb}"`);
    if (!el.getAttribute("data-kb-to")) p(`relation "${verb}" is missing data-kb-to`);
  }

  /* Reading levels: both lens attributes come from the closed vocabulary, an element
   * carries at most one of them, variant runs ascend, and no block may render empty
   * at any lens. */
  for (const el of root.querySelectorAll("[data-kb-level]")) {
    const lv = el.getAttribute("data-kb-level");
    if (!LEVELS.includes(lv)) p(`data-kb-level "${lv}" is not in the closed vocabulary (${LEVELS.join("/")})`);
  }
  for (const msg of lensProblems(root)) p(msg);
  /* The ladder is cumulative: its rungs carry data-kb-level, so advanced reads
   * basic+advanced and expert reads all three. */
  const explain = root.querySelector('[data-kb-block="explain"]');
  if (explain) {
    const got = explain.querySelectorAll(".explain-item").map((e) => e.getAttribute("data-kb-level"));
    if (JSON.stringify(got) !== JSON.stringify(LEVELS))
      p(`explain block needs one .explain-item per level, in ${LEVELS.join(" → ")} order`);
  }

  /* The sketch's code declares its language (pre is a raw-text element, so the
   * inner <code> tag is only findable in the raw text). */
  const sketch = root.querySelector('[data-kb-block="sketch"]');
  if (sketch) {
    const raw = sketch.querySelector("pre")?.text ?? "";
    if (!raw.includes('data-kb-lang="')) p("sketch code is missing data-kb-lang");
  }

  return problems;
}
