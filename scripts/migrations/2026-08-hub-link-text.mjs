/* 2026-08-hub-link-text.mjs — one-shot migration: rename the hub in every link that points
 * at it, and re-derive the crumb labels that name a band or group.
 *
 * The hub became "The Software Design Atlas", and the two oversized distributed subsections
 * split into four. Both facts are baked into each page rather than generated on every
 * build: scripts/lib/template.mjs writes the breadcrumb and the docnav ONCE, at scaffold
 * time, so `make all` never revisits them and the old wording simply persists. Hence a
 * migration rather than a rebuild.
 *
 * Four rewrites, all inside <nav class="crumb"> and <nav class="docnav">:
 *
 *   1. the root crumb            "Map"                 → "Atlas"
 *   2. the up link               "↑ The Map"           → "↑ The Atlas"
 *      (also "&uarr; The Map", and the three ML pages' "↑ ML Case Studies")
 *   3. the band crumb            re-derived from BANDS — fixes "IV · Network" → "Network"
 *   4. the group crumb           re-derived from BANDS — fixes "Routing & Scale" → "Routing"
 *                                or "Scale", per the page's own data-kb-group
 *
 * The three ML case studies also move off `#ml-cases-h`, the anchor of a section that no
 * longer exists, onto `#design-cases-h` where they now render. They were its only referents,
 * so the legacy anchor retires with them.
 *
 * Labels are re-derived from the model, never string-substituted, so a page whose crumb was
 * hand-edited or scaffolded under an older rule converges on the current answer either way.
 * Idempotent: re-running finds nothing to change.
 *
 *   node scripts/migrations/2026-08-hub-link-text.mjs [--dry]
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { band as bandOf, groupLabel, esc } from "../lib/model.mjs";

const ROOT = process.env.KB_ROOT
  ? resolve(process.env.KB_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SITE = join(ROOT, "site");
const dry = process.argv.includes("--dry");

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

let changed = 0;

for (const file of walk(SITE)) {
  const before = readFileSync(file, "utf8");
  let html = before;

  /* Only real KB pages carry a doc-wrap; the hub, vocab and the two map pages are generated
   * in full by their own builders and are fixed there instead. */
  const wrap = html.match(/<main class="doc-wrap"[^>]*>/);
  if (!wrap) continue;
  const bandId = (wrap[0].match(/data-kb-band="([^"]*)"/) || [])[1];
  const groupId = (wrap[0].match(/data-kb-group="([^"]*)"/) || [])[1];

  // The three ML case studies: off the retired section anchor, onto the one they render in.
  html = html.replace(/index\.html#ml-cases-h">ML Case Studies</g, 'index.html#design-cases-h">Case Studies<');
  html = html.replace(/index\.html#ml-cases-h">(&uarr;|↑) ML Case Studies</g, 'index.html">$1 The Atlas<');

  // The root crumb, and the up link wherever it still names the old hub.
  html = html.replace(/(<a href="((?:\.\.\/)*)index\.html">)Map<\/a>/g, "$1Atlas</a>");
  html = html.replace(/(<a class="up" href="[^"]*index\.html">)(&uarr;|↑) The (?:Elevation )?Map</g, "$1$2 The Atlas<");
  /* First and last page of a group: prev/next have nowhere further to go and fall through to
   * the hub, so they name it too. */
  html = html.replace(/(<a class="(?:prev|next)" href="[^"]*index\.html">(?:&larr;|←)? ?)The (?:Elevation )?Map/g, "$1The Atlas");

  /* Band and group crumbs, re-derived rather than substituted. Both link to the same band
   * anchor, so they are told apart by their label matching the model's band label or its
   * group label — which is exactly what makes a stale one detectable. */
  const b = bandId && bandOf(bandId);
  if (b) {
    const gLabel = groupId && groupLabel(groupId);
    const anchor = `#${b.anchor}`;
    html = html.replace(
      new RegExp(`(<a href="(?:\\.\\./)*index\\.html${anchor}">)([^<]*)</a>`, "g"),
      (_whole, open, label) => {
        // A crumb that already reads as the current group label stays a group crumb.
        const isGroup = gLabel && (label === esc(gLabel) || looksLikeAGroupOf(b, label));
        return `${open}${esc(isGroup ? gLabel : b.label)}</a>`;
      },
    );
  }

  if (html === before) continue;
  if (!dry) writeFileSync(file, html);
  changed += 1;
}

/** True when `label` is any group label of this band — including one it no longer has. */
function looksLikeAGroupOf(b, label) {
  if (b.groups.some((g) => g.label && esc(g.label) === label)) return true;
  // The two retired composite labels, so their pages resolve to the group they now declare.
  return label === "Routing &amp; Scale" || label === "Coordination &amp; Data";
}

console.log(`${dry ? "would rewrite" : "rewrote"} hub link text on ${changed} page(s).`);
