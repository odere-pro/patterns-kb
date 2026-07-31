/* 2026-08-registers.mjs — flip the explain ladder from accretion to variant.
 *
 * The ladder's items carried data-kb-level (min-level: the advanced lens showed
 * basic + advanced rungs). Under the register mechanism each lens shows ONLY its
 * own rung — the .explain-item elements carry data-kb-register instead.
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

let flipped = 0, skipped = 0;
for (const base of [join(ROOT, "site"), join(ROOT, "scripts", "test", "fixture", "site")]) {
  for (const file of walk(base)) {
    const src = readFileSync(file, "utf8");
    if (!src.includes('class="explain-item"')) { skipped++; continue; }
    const out = src.replace(
      /class="explain-item"([^>]*?) data-kb-level="(basic|advanced|expert)"/g,
      'class="explain-item"$1 data-kb-register="$2"',
    );
    if (out === src) { skipped++; continue; }
    writeFileSync(file, out);
    flipped++;
  }
}
console.log(`explain ladders flipped to data-kb-register: ${flipped} page(s), ${skipped} skipped.`);
console.log("Now run: make all && make check");
