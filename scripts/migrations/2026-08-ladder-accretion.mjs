/* 2026-08-ladder-accretion.mjs — flip the explain ladder back from variant to accretion.
 *
 * The lens model is cumulative: a higher lens never replaces content, it adds. So the
 * ladder's rungs carry data-kb-level (min-level: advanced reads basic + advanced
 * stacked, expert reads all three) rather than data-kb-register, which renders exactly
 * one rung per lens. This inverts 2026-08-registers.mjs in the same directory;
 * data-kb-register survives as the rare replacement tool elsewhere on a page.
 * Idempotent; run once, then `make all && make check`.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith(".html") ? [p] : [];
});

let flipped = 0, skipped = 0, rungs = 0;
for (const base of [join(ROOT, "site"), join(ROOT, "scripts", "test", "fixture", "site")]) {
  for (const file of walk(base)) {
    const src = readFileSync(file, "utf8");
    if (!src.includes('class="explain-item"')) { skipped++; continue; }
    let n = 0;
    const out = src.replace(
      /class="explain-item"([^>]*?) data-kb-register="(basic|advanced|expert)"/g,
      (_, mid, level) => { n++; return `class="explain-item"${mid} data-kb-level="${level}"`; },
    );
    if (out === src) { skipped++; continue; }
    writeFileSync(file, out);
    flipped++;
    rungs += n;
  }
}
console.log(`explain ladders flipped to data-kb-level: ${flipped} page(s), ${rungs} rung(s), ${skipped} skipped.`);
console.log("Now run: make all && make check");
