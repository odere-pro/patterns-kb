#!/usr/bin/env node
/* check-links.mjs — offline integrity check for the static site. Walks every HTML file
 * under site/, resolves each internal href/src against the file's own directory, and
 * fails if any points at a file that doesn't exist. External (http/mailto), in-page
 * (#anchor), and data: links are ignored. Exit 1 on any dangling link. */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const files = walk(SITE);
const attrRe = /(?:href|src)\s*=\s*"([^"]+)"/gi;
let dangling = 0, checked = 0;
const problems = [];

for (const file of files) {
  // Strip <code>...</code> bodies first — code sketches legitimately contain example
  // markup text like src="${x}" that is not a real link and must not be checked.
  const html = readFileSync(file, "utf8").replace(/<code(?:\s[^>]*)?>[\s\S]*?<\/code>/g, "<code></code>");
  const base = dirname(file);
  let m;
  while ((m = attrRe.exec(html))) {
    let target = m[1].trim();
    if (!target || target.startsWith("#") || target.startsWith("http:") || target.startsWith("https:")
      || target.startsWith("mailto:") || target.startsWith("data:") || target.startsWith("//")) continue;
    target = target.split("#")[0].split("?")[0];
    if (!target) continue;
    checked++;
    const abs = resolve(base, target);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      dangling++;
      problems.push(`${file.replace(SITE + "/", "site/")}  ->  ${m[1]}`);
    }
  }
}

if (dangling) {
  console.error(`DANGLING LINKS: ${dangling} of ${checked} internal links across ${files.length} files\n`);
  for (const p of problems.slice(0, 200)) console.error("  " + p);
  if (problems.length > 200) console.error(`  … and ${problems.length - 200} more`);
  process.exit(1);
}
console.log(`OK — ${checked} internal links across ${files.length} files all resolve.`);
