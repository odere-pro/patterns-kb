/* validate.mjs — single-page structural validation.
 *
 * One implementation, two consumers: `kb.mjs validate` (per-page, fast enough for
 * the PostToolUse hook) and `build-pages.mjs` (corpus-wide inside `make check`).
 * Needs no graph.json, so a single page validates in ~50ms.
 */
import { BLOCKS, OPTIONAL_BLOCKS, TAGS, RELATION_TYPES, folderFor } from "./model.mjs";

/** Block-vocabulary problems for one page: missing, unknown, out of order. */
export function blockProblems(present, kind) {
  const want = BLOCKS[kind];
  if (!want) return [`unknown kind "${kind}"`];
  const problems = [];
  for (const b of want) {
    if (!present.includes(b) && !OPTIONAL_BLOCKS.has(b)) problems.push(`missing block "${b}"`);
  }
  for (const b of present) if (!want.includes(b)) problems.push(`unknown block "${b}"`);
  const ordered = present.filter((b) => want.includes(b));
  if (JSON.stringify(ordered) !== JSON.stringify(want.filter((b) => present.includes(b))))
    problems.push(`blocks out of order: ${present.join(" ")}`);
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

  /* The sketch's code declares its language (pre is a raw-text element, so the
   * inner <code> tag is only findable in the raw text). */
  const sketch = root.querySelector('[data-kb-block="sketch"]');
  if (sketch) {
    const raw = sketch.querySelector("pre")?.text ?? "";
    if (!raw.includes('data-kb-lang="')) p("sketch code is missing data-kb-lang");
  }

  return problems;
}
