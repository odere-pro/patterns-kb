/* 2026-08-base-schema.mjs — one-shot migration to the unified base schema.
 *
 * Every kind now opens `description` → `explain` and closes `relationships`
 * (BASE_OPEN/BASE_CLOSE in lib/model.mjs). This script moves the corpus to that
 * shape:
 *
 *   1. themes:     opener section `framing`   → `description` (id + data-kb-block)
 *   2. principles: opener section `statement` → `description`
 *   3. designs:    opener section `problem`   → `description`
 *   4. hazards:    gain a real `relationships` section before the docnav; the
 *                  `.rel-group`s hand-authored inside `mitigation` MOVE into it
 *                  (mitigation prose and figures stay put)
 *   5. patterns:   `fluency` moves above `relationships` so relationships closes
 *                  every kind
 *
 * Heading ids (`h-framing`, `h-problem`, …) are deliberately untouched — they are
 * page-internal anchors and renaming them buys nothing. Visible headings keep
 * their kind-flavoured text ("The question", "Understanding the problem").
 *
 * Idempotent: a page already in the target shape is skipped. Run once, then
 * `make all && make check`.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../vendor/node-html-parser.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "site");
const PARSE_OPTS = { comment: true };

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith(".html") ? [p] : [];
});

/* Slice an element out of `src` the way kb.mjs unlink does: extend the start over
 * leading indentation, take the trailing newline, and collapse the blank-line seam
 * the removal leaves behind. Returns { text, next } — the captured source text and
 * the document without it. */
function cutRange(src, [start, end]) {
  while (start > 0 && (src[start - 1] === " " || src[start - 1] === "\t")) start--;
  const text = src.slice(start, end).replace(/\n$/, "");
  if (src[end] === "\n") end++;
  const head = src.slice(0, start), tail = src.slice(end);
  const before = head.match(/\n+$/)?.[0].length ?? 0;
  const after = tail.match(/^\n+/)?.[0].length ?? 0;
  const next = before + after > 2
    ? head.slice(0, head.length - before) + "\n\n" + tail.slice(after)
    : head + tail;
  return { text, next };
}

/* Replace a substring that must occur exactly once, or refuse. */
function replaceOnce(src, file, from, to) {
  const first = src.indexOf(from);
  if (first === -1) return null;
  if (src.indexOf(from, first + 1) !== -1) throw new Error(`${file}: "${from}" is not unique`);
  return src.slice(0, first) + to + src.slice(first + from.length);
}

let renamed = 0, hazardsDone = 0, fluencyMoved = 0, skipped = 0;

/* ---- 1-3. opener renames ---- */
for (const [dir, oldId] of [["themes", "framing"], ["principles", "statement"], ["designs", "problem"]]) {
  for (const file of walk(join(SITE, dir))) {
    const src = readFileSync(file, "utf8");
    if (!src.includes(`data-kb-block="${oldId}"`)) { skipped++; continue; }
    let out = replaceOnce(src, file, `id="${oldId}"`, `id="description"`);
    out = replaceOnce(out, file, `data-kb-block="${oldId}"`, `data-kb-block="description"`);
    writeFileSync(file, out);
    renamed++;
  }
}

/* ---- 4. hazards: relationships section, rel-groups moved out of mitigation ---- */
for (const file of walk(join(SITE, "hazards"))) {
  let src = readFileSync(file, "utf8");
  if (src.includes('data-kb-block="relationships"')) { skipped++; continue; }
  const root = parse(src, PARSE_OPTS);
  const mit = root.querySelector('[data-kb-block="mitigation"]');
  if (!mit) throw new Error(`${file}: no mitigation section`);
  /* Cut back-to-front so earlier ranges stay valid against the shrinking source. */
  const groups = mit.querySelectorAll(".rel-group");
  const texts = [];
  for (const g of [...groups].reverse()) {
    const { text, next } = cutRange(src, g.range);
    texts.unshift(text);
    src = next;
  }
  const section = `    <section class="doc-section" id="relationships" aria-labelledby="h-rel" data-kb-block="relationships">
      <h2 class="doc-h" id="h-rel">How it relates</h2>
${texts.length ? "\n" + texts.join("\n\n") + "\n" : ""}    </section>`;
  const nav = src.match(/\n+([ \t]*)<nav class="docnav"/);
  if (!nav) throw new Error(`${file}: no docnav`);
  src = src.replace(/\n+([ \t]*<nav class="docnav")/, `\n\n${section}\n\n$1`);
  writeFileSync(file, src);
  hazardsDone++;
}

/* ---- 5. patterns: fluency above relationships ---- */
for (const file of walk(join(SITE, "patterns"))) {
  const src = readFileSync(file, "utf8");
  const flu = src.indexOf('data-kb-block="fluency"');
  if (flu === -1) { skipped++; continue; }
  const rel = src.indexOf('data-kb-block="relationships"');
  if (rel === -1) throw new Error(`${file}: fluency but no relationships`);
  if (flu < rel) { skipped++; continue; } // already migrated
  const root = parse(src, PARSE_OPTS);
  const { text, next } = cutRange(src, root.querySelector('section[data-kb-block="fluency"]').range);
  const anchor = next.indexOf('<section class="doc-section" id="relationships"');
  const lineStart = next.lastIndexOf("\n", anchor) + 1;
  writeFileSync(file, next.slice(0, lineStart) + text + "\n\n" + next.slice(lineStart));
  fluencyMoved++;
}

console.log(`openers renamed: ${renamed} · hazards given relationships: ${hazardsDone} · fluency moved: ${fluencyMoved} · skipped (already migrated / n/a): ${skipped}`);
console.log("Now run: make all && make check");
