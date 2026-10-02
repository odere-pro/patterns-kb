/**
 * The post-build pass that stops every diagram carrying its own copy of
 * mermaid's stylesheet.
 *
 * Runs in `postbuild` in site/package.json, right after the portability pass,
 * and is runnable on its own:
 *
 *     node_modules/.bin/tsx tools/src/site/site-diagram-styles.ts [--dist <dir>]
 *
 * rehype-mermaid draws each diagram as an inline SVG that opens with one
 * `<style>` of about five kilobytes, every selector scoped to the diagram's
 * generated id (`#mermaid-4 .node rect`). Three hundred pages hold one or more,
 * and the text differs only in that id, so the site paid for the same few
 * kilobytes in every page's HTML. This pass reads every diagram's style with
 * its own id set aside; a style met in `MIN_SHARED` diagrams or more becomes one
 * file, `_astro/mermaid.<hash>.css`, which each page that draws such a diagram
 * links after the main stylesheet. The diagram loses its `<style>` and gains
 * the class `kb-mm-<hash>` that the file's selectors name.
 *
 * NOTHING A DIAGRAM LOOKS LIKE CHANGES, and the selector is why. A rule keeps
 * the weight it had: `#mermaid-4 .node rect` becomes
 * `:is(#_, svg.kb-mm-<hash>) .node rect`. No element has the id `_`, and
 * `:is()` takes the specificity of its most specific argument, so the id's
 * weight stays while the class does the matching. The rule's place in the
 * cascade is kept too: a stylesheet linked after the main one wins a tie
 * against it, as an inline style later in the page did. A diagram whose style
 * is unlike any other's, or met too few times, keeps its own `<style>`.
 *
 * Run before the formatter, which settles the whitespace the edit leaves.
 * A second run changes nothing: no diagram carries a `<style>` it would share.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { main, UsageError, type GateContext, type GateSpec } from '../lib/gate.js';
import { contentHash } from '../lib/asset-names.js';

/** How many diagrams must carry a style, whole site over, before it is worth a file. */
export const MIN_SHARED = 3;

/** The marker that stands for a diagram's own `#mermaid-N` while two styles are compared. */
const OWN_ID = '\u0000';

/** A diagram's opening tag, then its `<style>`: the id, the tag's attributes and the style's text. */
const DIAGRAM_STYLE = /<svg\b(?=[^>]*\sid="(mermaid-[0-9]+)")([^>]*)>(\s*)<style>([\s\S]*?)<\/style>/g;

/** The main stylesheet's link, which each shared sheet follows. */
const MAIN_LINK = /([ \t]*)<link rel="stylesheet" href="((?:\.{1,2}\/)*)_astro\/style\.[^"]+\.css">/;

/** The class a shared style's selectors name, and its sheet's name, from the style's text. */
export const classFor = (norm: string): string => `kb-mm-${contentHash(norm)}`;

/** A style's text with the diagram's own id set aside; a longer id that begins the same is left alone. */
export function normalise(css: string, id: string): string {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.replace(new RegExp(`#${escaped}(?![\\w-])`, 'g'), OWN_ID);
}

/** The sheet's text: the normalised style with each own id replaced by the scope of its class. */
export function sheetFor(norm: string): string {
  return `${norm.split(OWN_ID).join(`:is(#_,svg.${classFor(norm)})`)}\n`;
}

/** The tag's attribute text with `cls` added to its class list, or a class attribute made. */
export function withClass(attrs: string, cls: string): string {
  const has = /(\sclass=")([^"]*)(")/.exec(attrs);
  return has === null ? `${attrs} class="${cls}"` : attrs.replace(has[0], `${has[1] as string}${has[2] as string} ${cls}${has[3] as string}`);
}

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** Every normalised style a page's diagrams carry, one entry per diagram. */
export function stylesIn(html: string): string[] {
  return [...html.matchAll(DIAGRAM_STYLE)].map((m) => normalise(m[4] as string, m[1] as string));
}

/**
 * The page with each diagram whose style is in `shared` made to use its sheet:
 * its `<style>` gone, its class added, and one link per sheet used after the
 * main stylesheet's. Returns null when the page has no main stylesheet link to
 * follow, since a sheet linked elsewhere would change the cascade.
 */
export function hoistPage(html: string, shared: ReadonlySet<string>): { html: string; classes: string[] } | null {
  const used = new Set<string>();
  const out = html.replace(DIAGRAM_STYLE, (all, id: string, attrs: string, space: string, css: string) => {
    const norm = normalise(css, id);
    if (!shared.has(norm)) return all;
    const cls = classFor(norm);
    used.add(cls);
    return `<svg${withClass(attrs, cls)}>${space}`;
  });
  if (used.size === 0) return { html, classes: [] };
  const link = MAIN_LINK.exec(out);
  if (link === null) return null;
  const sheets = [...used].sort().map((cls) => `\n${link[1] as string}<link rel="stylesheet" href="${link[2] as string}_astro/mermaid.${cls.slice('kb-mm-'.length)}.css">`);
  const at = (link.index as number) + link[0].length;
  return { html: `${out.slice(0, at)}${sheets.join('')}${out.slice(at)}`, classes: [...used].sort() };
}

export const spec: GateSpec = {
  name: 'site-diagram-styles',
  usage: 'usage: site-diagram-styles [--dist <dir>] [--quiet]',
  flags: ['--quiet'],
  options: ['--dist'],
  run(ctx: GateContext): string {
    const abs = path.resolve(ctx.root, ctx.options.get('--dist') ?? path.join('site', 'dist'));
    const shown = path.relative(ctx.root, abs) || '.';
    if (!existsSync(abs)) throw new UsageError(`no built site at ${shown} — build it first: make site-build`);
    const pages = htmlFiles(abs);
    if (pages.length === 0) throw new UsageError(`no .html files under ${shown} — build it first: make site-build`);

    const counts = new Map<string, number>();
    const sources = new Map<string, string>();
    for (const file of pages) {
      const html = readFileSync(file, 'utf8');
      sources.set(file, html);
      for (const norm of stylesIn(html)) counts.set(norm, (counts.get(norm) ?? 0) + 1);
    }
    const shared = new Set([...counts].filter(([, c]) => c >= MIN_SHARED).map(([norm]) => norm));
    if (shared.size === 0) return ctx.flags.has('--quiet') ? '' : '[site-diagram-styles] no diagram style is shared by enough diagrams; nothing changed';

    let rewritten = 0;
    let removed = 0;
    for (const file of pages) {
      const html = sources.get(file) as string;
      const done = hoistPage(html, shared);
      if (done === null) {
        ctx.fail(path.relative(ctx.root, file).split(path.sep).join('/'), 'draws a diagram with a shared style and links no main stylesheet to follow — the sheet would change the cascade');
        continue;
      }
      if (done.html === html) continue;
      removed += stylesIn(html).filter((s) => shared.has(s)).length;
      writeFileSync(file, done.html);
      rewritten += 1;
    }
    if (ctx.findings > 0) return '';

    mkdirSync(path.join(abs, '_astro'), { recursive: true });
    for (const norm of shared) writeFileSync(path.join(abs, '_astro', `mermaid.${classFor(norm).slice('kb-mm-'.length)}.css`), sheetFor(norm));

    if (ctx.flags.has('--quiet')) return '';
    return `[site-diagram-styles] ${String(removed)} diagram style(s) in ${String(rewritten)} page(s) replaced by ${String(shared.size)} shared sheet(s)`;
  },
};

main(spec, import.meta.url);
