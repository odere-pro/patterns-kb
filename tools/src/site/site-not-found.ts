/**
 * The not-found page as a document that stands alone.
 *
 * A host that serves `404.html` for a missing address serves it at the address
 * that missed, so a stylesheet, a script or a link written relative to the
 * page resolves under whatever folder the miss was in. A reader who asks for
 * `/a/b/c/missing.html` would get an unstyled page whose links lead nowhere.
 * So this page, alone among the site's pages, carries no link to a file of the
 * site: no stylesheet, no script, no icon. Its paint is one small `<style>`
 * element in the page, and its links are absolute URLs under the published
 * root (`publicRoot` in site-output.ts, which `SITE_URL` moves for a fork), so
 * they land the same from any depth. From a folder on disk the page renders
 * the same, and its links open the published site.
 *
 * The page keeps what the rest of the pipeline reads: the head's page facts
 * (the `kb:*` meta, the description and the JSON-LD block), the skip link every
 * page keeps, the title block around the H1 and the knowledge region around the
 * rest. Everything else
 * Starlight wrote around them (header, sidebar, search box, footer) is dropped,
 * since none of it works without the stylesheet and the bundle.
 *
 * The inline style names no colour: `Canvas`, `CanvasText` and `LinkText` are
 * the browser's own, and `color-scheme` picks the light or the dark set from
 * the reader's `prefers-color-scheme`, so the page reads in both themes with
 * no colour typed here (tokens.css stays the one place a colour is decided).
 *
 * The site's gates hold every other page to one stylesheet, one bundle and no
 * style element; this page is the one named exception to them (`NOT_FOUND_FILE`
 * in tools/src/lib/site-noise.ts).
 */

import { knowledgeRegion } from '../lib/built-page.js';

/** The route the host serves for an address the site does not hold. */
export const NOT_FOUND_ROUTE = '/404.html';

/** The page's whole paint: a narrow readable column, and the browser's own colours. */
export const NOT_FOUND_STYLE = [
  ':root { color-scheme: light; }',
  '@media (prefers-color-scheme: dark) { :root { color-scheme: dark; } }',
  'body { margin: 0; background: Canvas; color: CanvasText; font: 1rem/1.6 system-ui, sans-serif; }',
  'main { box-sizing: border-box; max-width: 40rem; margin: 0 auto; padding: 3rem 1rem; }',
  'h1 { margin: 0 0 1rem; font-size: 2rem; line-height: 1.2; }',
  'a { color: LinkText; }',
  '.sl-skip-link { position: absolute; inset-inline-start: -999px; padding: 0.5rem 1rem; background: Canvas; }',
  '.sl-skip-link:focus { inset-inline-start: 0; }',
  'a:focus-visible { outline: 2px solid; outline-offset: 2px; }',
].join('\n');

/** What a built page that cannot be reduced is refused with. */
export class NotFoundShapeError extends Error {}

/** The `<head>` pieces kept, in the order the page had them. */
const KEPT_HEAD = [
  /<meta\b[^>]*>/g,
  /<title\b[^>]*>[\s\S]*?<\/title>/g,
  /<link\b[^>]*\brel="canonical"[^>]*>/g,
  /<script\b[^>]*\btype="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g,
];

/**
 * The page as built by Starlight, reduced to a document with no link to a
 * file of the site. `root` is the published root every link is made absolute
 * under. Throws `NotFoundShapeError` when the page has no head, no title block
 * or no knowledge region to keep.
 */
export function standaloneNotFound(html: string, root: URL): string {
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/.exec(html)?.[1];
  if (head === undefined) throw new NotFoundShapeError('the not-found page has no <head>');
  const title = /<div data-page-head>[\s\S]*?<h1\b[^>]*>([\s\S]*?)<\/h1>[\s\S]*?<\/div>/.exec(html)?.[1];
  if (title === undefined) throw new NotFoundShapeError('the not-found page has no title block holding an <h1>');
  const region = knowledgeRegion(html);
  if (region === null) throw new NotFoundShapeError('the not-found page has no knowledge region');

  const inner = html
    .slice(region[0], region[1])
    .replace(/^\s*<article\b[^>]*>/, '')
    .replace(/<\/article>\s*$/, '')
    .replace(/\bhref="\/(?!\/)([^"]*)"/g, (_all, rest: string) => `href="${new URL(rest, root).href}"`);

  const kept = KEPT_HEAD.flatMap((pattern) => head.match(pattern) ?? []);
  return [
    '<!DOCTYPE html>',
    '<html lang="en" dir="ltr">',
    '<head>',
    ...kept,
    `<style>\n${NOT_FOUND_STYLE}\n</style>`,
    '</head>',
    '<body>',
    '<a class="sl-skip-link" href="#_top">Skip to content</a>',
    '<main>',
    `<div data-page-head><h1 id="_top">${title.trim()}</h1></div>`,
    `<div class="kb-not-found" data-kb-region>${inner}</div>`,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
