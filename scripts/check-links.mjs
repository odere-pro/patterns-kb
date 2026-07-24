#!/usr/bin/env node
/* check-links.mjs — offline integrity check for the static site. Walks every HTML file
 * under site/, resolves each internal link against the file's own directory, and fails
 * if any points at a file that doesn't exist. External (http/mailto), in-page (#anchor),
 * and data: links are ignored. Exit 1 on any dangling link.
 *
 * Covers two carriers. href/src attributes — read from the parsed DOM (the same vendored
 * parser every builder uses), so an attribute split across lines is still seen and markup
 * quoted inside <code> sketches is skipped structurally rather than by regex. And mermaid
 * `click <node> "<target>"` directives — real clickable links living in diagram text
 * rather than markup, scanned inside <pre class="mermaid"> blocks only. */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parse } from "./vendor/node-html-parser.mjs";

/* Keep comments as nodes so the parse matches the builders'; comment content holds no
 * elements, so commented-out markup is never link-checked. */
const PARSE_OPTS = { comment: true };

const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..");
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
const MERMAID_CLICK = /\bclick\s+[A-Za-z0-9_]+\s+"([^"]+)"/g;
let dangling = 0;
const counts = { attr: 0, "mermaid click": 0 };
const problems = [];

const isExternal = (t) =>
  t.startsWith("#") || t.startsWith("http:") || t.startsWith("https:")
  || t.startsWith("mailto:") || t.startsWith("data:") || t.startsWith("//");

for (const file of files) {
  const root = parse(readFileSync(file, "utf8"), PARSE_OPTS);
  const base = dirname(file);

  const check = (raw, what) => {
    let target = raw.trim();
    if (!target || isExternal(target)) return;
    target = target.split("#")[0].split("?")[0];
    if (!target) return;
    counts[what]++;
    const abs = resolve(base, target);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      dangling++;
      problems.push(`${file.replace(SITE + "/", "site/")}  ->  ${raw}  (${what})`);
    }
  };

  for (const el of root.querySelectorAll("[href], [src]")) {
    // Code sketches legitimately contain example markup like src="${x}" — not real links.
    if (el.closest("code")) continue;
    for (const attr of ["href", "src"]) {
      const v = el.getAttribute(attr);
      if (v != null) check(v, "attr");
    }
  }

  for (const pre of root.querySelectorAll("pre.mermaid")) {
    MERMAID_CLICK.lastIndex = 0;
    let m;
    while ((m = MERMAID_CLICK.exec(pre.text))) check(m[1], "mermaid click");
  }
}

const checked = counts.attr + counts["mermaid click"];
if (dangling) {
  console.error(`DANGLING LINKS: ${dangling} of ${checked} internal links across ${files.length} files\n`);
  for (const p of problems.slice(0, 200)) console.error("  " + p);
  if (problems.length > 200) console.error(`  … and ${problems.length - 200} more`);
  process.exit(1);
}
console.log(
  `OK — ${checked} internal links across ${files.length} files all resolve ` +
  `(${counts.attr} href/src + ${counts["mermaid click"]} mermaid clicks).`,
);
