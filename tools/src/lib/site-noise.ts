/**
 * The noise half of the absence gate (spec kb.noise.absence-gate): what a built
 * page may carry besides its knowledge. Code and paint arrive by reference —
 * one classic `kb.js`, one main stylesheet, no code or presentation in the
 * page text — chrome is skip-marked, and every other script, stylesheet and
 * noscript style carries a name and a reason. check-site-absence.ts runs it
 * beside the data-layer half; this module holds the checks, the allowlists and
 * the script-reachability walk, and writes nothing (absence-gate-C10).
 *
 * THE ALLOWLISTS ARE THIS SITE'S AUDIT. Each entry names one thing this site's
 * own build emits, read off its built pages, with the reason it may stay.
 * Anything no entry names fails with the add-or-stop repair, so a new upstream
 * script, a second stylesheet or a changed noscript line is caught the build
 * it appears; an upgrade that rewrites one is the moment to re-audit, never to
 * widen a pattern. An entry that matches nothing in a full run fails too.
 *
 * It reads markup the way a browser does (parse5): a `<` inside a quoted
 * attribute value, a code sample, a comment or a script body is text, never a
 * tag, and a skip marker named in an attribute value shields nothing
 * (absence-gate-C6). An inline vector graphic is the drawing's own markup, so
 * its style attributes and its style element are not the page's; its event
 * handlers run like any other, so they are.
 *
 * ONE PAGE IS THE NAMED EXCEPTION: `404.html` (`NOT_FOUND_FILE`). A host serves
 * it at whatever address missed, so it loads no file of the site and carries its
 * own small style instead (tools/src/site/site-not-found.ts). Held to its own
 * rule in place of the three it is exempt from (one bundle, one main stylesheet,
 * no style element): it loads no script and no stylesheet, carries no `src` and
 * no link but its canonical one, and has exactly one style element that fetches
 * nothing and stays small.
 *
 * This gate never reads the post-build pass's lists (STARLIGHT_CHROME,
 * EXTERNALIZABLE_SCRIPTS, the chunk prune): it works out chrome and script
 * reachability itself, so a pass that regresses is caught by a check sharing
 * none of its lists (noise-C5).
 */

import fs from 'node:fs';
import path from 'node:path';

import { parse } from 'parse5';

import { REGION } from './built-page.js';
import { BUNDLE_SRC } from './asset-names.js';

/** The skip marker (two-layers-C8). */
export const SKIP = 'data-kb-skip';

/** The one bundle of ours, at any depth, plain or hashed: `kb.js`, `./kb.js`, `../../kb.3fa9c1d2.js`. */
export const BUNDLE = BUNDLE_SRC;
/** The bundle's name, as findings say it. */
export const BUNDLE_NAME = 'kb.js';

/** The one page held to its own rule in place of the bundle, stylesheet and style-element rules. */
export const NOT_FOUND_FILE = '404.html';

/** The most characters the not-found page's one style element may hold. */
export const NOT_FOUND_STYLE_MAX = 2048;

/** Landmarks that must sit in a skip-marked subtree when outside the knowledge region. */
export const LANDMARKS: readonly string[] = ['nav', 'header', 'footer', 'aside'];

/** A script file, by extension: what a page may load and the prune walks. */
export const SCRIPT_FILE = /\.(?:c|m)?js$/;

/** A `type` value as a browser reads it: trimmed, any case. */
export const scriptType = (type: string | undefined): string => (type ?? '').trim().toLowerCase();

/** Does a browser run this `type` as a module? */
export const isModuleType = (type: string | undefined): boolean => scriptType(type) === 'module';

/** A script or stylesheet path with its query and fragment cut off. */
export const bare = (src: string): string => src.replace(/[?#].*$/, '');

/** A path with its leading `./` and `../` steps cut off: how the lists name it. */
export const fromRoot = (src: string): string => bare(src).replace(/^(?:\.{1,2}\/)+/, '');

/** One allowlist entry: what it is, why it may stay, and the anchored pattern that recognises it. */
export interface Allowed {
  readonly id: string;
  readonly reason: string;
  /**
   * Anchored at both ends for an external path or a noscript style, whose text
   * is matched whole; anchored at its start for an inline script body, matched
   * on the body with its whitespace collapsed (absence-gate-C5).
   */
  readonly match: RegExp;
  /**
   * An inline script's one `type`, as `scriptType` reads it. A data type pins
   * the entry to data: the same opening under no type, or any other, is code
   * and stays unnamed.
   */
  readonly type?: string;
  /**
   * For a thing only some sites carry: the built file, as a path under the
   * site's root, whose presence says it must appear. A site without that file
   * leaves the entry unmatched and unfaulted; a site with it and no match
   * fails. With no `needs`, every site must match the entry.
   */
  readonly needs?: RegExp;
}

/** Every list the noise half reads. */
export interface NoiseLists {
  /** Inline script bodies a page may carry (data such as the JSON-LD, never code). */
  readonly inlineScripts: readonly Allowed[];
  /** External script paths besides the bundle, as `fromRoot` gives them. */
  readonly externalScripts: readonly Allowed[];
  /** The shared main stylesheet's path: exactly one link per page. */
  readonly mainStylesheet: RegExp;
  /** Every other stylesheet link a page may carry. */
  readonly otherStylesheets: readonly Allowed[];
  /** The one noscript style line; every page carries it. */
  readonly noscriptStyles: readonly Allowed[];
}

/** A regular-expression source matching `text` literally. */
const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * The noscript style body, whitespace collapsed, as site/src/components/Head/Head.astro
 * writes it. A new control the bundle drives changes that line and this one
 * together; the unit test holds the two equal.
 */
export const NOSCRIPT_STYLE =
  '.kb-theme-toggle, .kb-meta-button, .kb-diagram-toolbar, .kb-copy, .expressive-code .copy, ' +
  '.kb-favourite, .kb-practiced, .kb-practiced-count, .kb-facets, .kb-search-open, .kb-home-search { display: none; }';

/** An Astro chunk under `_astro/`, by its name before the content hash. */
const chunk = (name: string, ext: string): RegExp => new RegExp(`^_astro/${literal(name)}\\.[^/]+\\.${ext}$`);

/**
 * The lists this site's gate reads, from an audit of what its build emits:
 * every entry names something at least one built page carries.
 */
export const LISTS: NoiseLists = {
  inlineScripts: [
    {
      id: 'page-json-ld',
      reason: 'the page summary as schema.org data, which Head.astro writes; data, never code',
      match: /^\{"@context":"https:\/\/schema\.org","@type":"/,
      type: 'application/ld+json',
    }
  ],
  externalScripts: [
    {
      id: 'starlight-theme-pre-paint',
      reason: 'classic and synchronous in <head>, so the theme is set before first paint, from a folder too (site-portable.ts moves it out of the page)',
      match: chunk('sl-theme', 'js'),
    },
    {
      id: 'starlight-chrome-script',
      reason:
        "Starlight's small behaviours joined into one classic script by tools/src/site/site-assets.ts, since a module " +
        'never runs from a folder: the phone sidebar and its focus trap, the phone table of contents, the sidebar\'s remembered scroll and link prefetch',
      match: chunk('starlight', 'js'),
    },
    {
      id: 'expressive-code-script',
      reason: 'code-block pages only: the copy button and focus on a wide code block, a classic script',
      match: chunk('ec', 'js'),
      needs: chunk('ec', 'js'),
    },
  ],
  mainStylesheet: chunk('style', 'css'),
  otherStylesheets: [
    {
      id: 'print-stylesheet',
      reason: 'media="print", so it downloads only when something is printed',
      match: chunk('print', 'css'),
    },
    {
      id: 'mermaid-stylesheet',
      reason:
        "a diagram style that many diagrams share, moved out of their SVGs by tools/src/site/site-diagram-styles.ts; its selectors name the class the diagram's svg wears",
      match: chunk('mermaid', 'css'),
      needs: chunk('mermaid', 'css'),
    },
    {
      id: 'expressive-code-stylesheet',
      reason: 'code-block pages only: the code frames, shipped by Expressive Code',
      match: chunk('ec', 'css'),
      // Expressive Code writes its stylesheet on every build, code or not; its
      // script ships only when a page holds a code block, so that is the sign.
      needs: chunk('ec', 'js'),
    },
  ],
  noscriptStyles: [
    {
      id: 'no-script-controls',
      reason: 'hides the controls that do nothing until kb.js runs; nothing it hides is knowledge',
      match: new RegExp(`^${literal(NOSCRIPT_STYLE)}$`),
    },
  ],
};

/** The repair an unnamed thing names (absence-gate-C3). */
export const ADD_OR_STOP = 'add an entry with its reason to the list in tools/src/lib/site-noise.ts, or stop shipping it';

/**
 * Each property the noise half checks, as the summary says it holds, with its
 * finding. Every message lives here and nowhere else, built from the checked
 * constants it names (absence-gate-C9).
 */
export const NOISE = {
  bundle: {
    holds: `one classic ${BUNDLE_NAME}`,
    count: (n: number): string => `${n} ${BUNDLE_NAME} script tag(s) — a page loads its behaviour from exactly one classic ${BUNDLE_NAME}`,
    module: `the ${BUNDLE_NAME} bundle loads as a module — a module never runs from a folder; it loads as a classic script`,
  },
  inlineModule: {
    holds: 'no inline module',
    fail: (opening: string): string => `an inline <script type="module"> — code belongs in a file, never in the page text. It begins: ${opening}`,
  },
  namedScripts: {
    holds: 'every other script named',
    external: (src: string): string => `unnamed external script <script src="${src}"> — ${ADD_OR_STOP}`,
    module: (src: string): string => `<script type="module" src="${src}"> — a module never runs from a folder; tools/src/site/site-assets.ts makes each a classic script`,
    inline: (opening: string): string => `unnamed inline script — ${ADD_OR_STOP}. It begins: ${opening}`,
  },
  mainStylesheet: {
    holds: 'one main stylesheet, every other named',
    count: (n: number): string => `${n} main stylesheet link(s) — every page shares exactly one`,
    unnamed: (href: string): string => `unnamed stylesheet <link href="${href}"> — ${ADD_OR_STOP}`,
  },
  styleElement: {
    holds: 'no style element',
    fail: 'a <style> element outside a vector graphic and a noscript — paint ships in the linked stylesheet',
  },
  noscriptStyle: {
    holds: 'the noscript style',
    unnamed: (opening: string): string => `unnamed noscript style — ${ADD_OR_STOP}. It begins: ${opening}`,
    missing: (entries: string): string =>
      `no noscript style — the controls the bundle drives stay on show with scripts off; the entry reads: ${entries}`,
  },
  presentational: {
    holds: 'no presentational style',
    fail: (style: string): string => `a presentational style="${style}" — paint belongs in a stylesheet; only custom properties (--x: y) stay inline`,
  },
  handlers: {
    holds: 'no inline handler',
    fail: (name: string): string => `an ${name} attribute — behaviour lives in the ${BUNDLE_NAME} bundle, never in the markup`,
  },
  chrome: {
    holds: 'chrome skip-marked',
    fail: (element: string): string => `unmarked chrome ${element} outside the knowledge region — put it in a ${SKIP} subtree`,
  },
  unreachable: {
    holds: 'no unreachable script',
    fail: 'a script file no page loads and no loaded script imports — the post-build pass prunes these; stop shipping it',
  },
  notFound: {
    holds: 'the not-found page loads no file and carries one small style',
    load: (what: string): string =>
      `${what} on the not-found page — it is served at any address, so it loads no file of the site; its paint is one inline style element`,
    styles: (n: number): string => `${n} style element(s) on the not-found page — it carries exactly one, its own paint`,
    fetches: 'the not-found page\'s style fetches a file (url( or @import) — it must stand alone',
    long: (n: number): string => `the not-found page's style is ${n} characters — keep it under ${NOT_FOUND_STYLE_MAX}`,
  },
  unusedEntry: {
    fail: (id: string): string => `the allowlist entry '${id}' in tools/src/lib/site-noise.ts matched nothing on any page — drop it`,
  },
} as const;

/** A script body as a fingerprint reads it: trimmed, whitespace runs as one space. */
export const normalizeScript = (body: string): string => body.trim().replace(/\s+/g, ' ');

/** The first entry recognising `text`, or undefined. */
export const known = (list: readonly Allowed[], text: string): Allowed | undefined => list.find((a) => a.match.test(text));

/** Which entries of the lists matched at least once, across every page of a run. */
export class Tally {
  /** The ids of entries that matched at least once. */
  readonly used = new Set<string>();

  /** The entry of `list` recognising `text`, recorded as used; undefined when none does. */
  meet(list: readonly Allowed[], text: string): Allowed | undefined {
    const hit = known(list, text);
    if (hit !== undefined) this.used.add(hit.id);
    return hit;
  }
}

/**
 * Entries of the lists that matched nothing in a full run, over a site whose
 * files (paths under its root) are `files`; an entry whose `needs` no file
 * meets is not owed.
 */
export function unusedEntries(lists: NoiseLists, tally: Tally, files: readonly string[]): Allowed[] {
  const all = [...lists.inlineScripts, ...lists.externalScripts, ...lists.otherStylesheets, ...lists.noscriptStyles];
  const owed = (a: Allowed): boolean => a.needs === undefined || files.some((f) => (a.needs as RegExp).test(f));
  return all.filter((a) => !tally.used.has(a.id) && owed(a));
}

/** Every file under `dist`, as a path under it with forward slashes, sorted. */
export const siteFiles = (dist: string): string[] => filesUnder(dist, /(?:)/);

/** The parse5 node shape read here, described locally. */
interface El {
  nodeName: string;
  tagName?: string;
  namespaceURI?: string;
  value?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: El[];
  content?: El;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const isEl = (n: El): boolean => n.tagName !== undefined;

/** The text a raw-text element holds (a script's body, a noscript's markup). */
function textOf(el: El): string {
  return (el.childNodes ?? []).map((c) => c.value ?? '').join('');
}

/** A `style` attribute's declarations that bind something other than a custom property. */
export function presentational(style: string): boolean {
  return style
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .some((d) => !d.startsWith('--'));
}

/** The normalised body of each `<style>` in a noscript's markup. */
export function noscriptBodies(markup: string): string[] {
  return [...markup.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].map((m) => normalizeScript(m[1] as string));
}

/**
 * Every noise finding one page earns, as `what` strings. `tally` records which
 * entries matched, across pages, for the unused-entry check.
 */
export function noiseFindings(html: string, lists: NoiseLists, tally: Tally, notFound = false): string[] {
  const out: string[] = [];
  const ownStyles: string[] = [];
  let bundles = 0;
  let mains = 0;
  let noscriptStyleSeen = false;
  const styles: string[] = [];
  const handlers = new Set<string>();

  const visit = (el: El, inRegion: boolean, shielded: boolean, inSvg: boolean): void => {
    const tag = el.tagName as string;
    const svg = inSvg || el.namespaceURI === SVG_NS;
    const attrs = el.attrs ?? [];
    const get = (name: string): string | undefined => attrs.find((a) => a.name === name)?.value;
    const names = attrs.map((a) => a.name);
    const skip = shielded || names.includes(SKIP);
    const region = inRegion || names.includes(REGION);

    // A drawing's style is its own paint; its event handlers run like any other.
    if (!svg) {
      const style = get('style');
      if (style !== undefined && presentational(style)) styles.push(style);
    }
    for (const n of names) if (/^on[a-z]{3,}$/.test(n)) handlers.add(n);
    if (notFound && !svg && tag !== 'script' && get('src') !== undefined) out.push(NOISE.notFound.load(`<${tag} src="${get('src') as string}">`));

    if (LANDMARKS.includes(tag) && !region && !skip && !svg) {
      out.push(NOISE.chrome.fail(`<${tag}${get('class') === undefined ? '' : ` class="${get('class') as string}"`}>`));
    }

    if (tag === 'script' && notFound) {
      const src = get('src');
      if (src !== undefined) out.push(NOISE.notFound.load(`<script src="${src}">`));
      else {
        const type = scriptType(get('type'));
        const body = normalizeScript(textOf(el));
        if (isModuleType(type)) out.push(NOISE.inlineModule.fail(body.slice(0, 60)));
        else if (tally.meet(lists.inlineScripts.filter((a) => a.type === undefined || a.type === type), body) === undefined) out.push(NOISE.namedScripts.inline(body.slice(0, 60)));
      }
      return;
    }

    if (tag === 'script') {
      const src = get('src');
      const type = scriptType(get('type'));
      const isModule = isModuleType(type);
      if (src !== undefined && BUNDLE.test(bare(src))) {
        bundles += 1;
        if (isModule) out.push(NOISE.bundle.module);
      } else if (src !== undefined) {
        if (isModule) out.push(NOISE.namedScripts.module(src));
        if (tally.meet(lists.externalScripts, fromRoot(src)) === undefined) out.push(NOISE.namedScripts.external(src));
      } else {
        const body = normalizeScript(textOf(el));
        const typed = lists.inlineScripts.filter((a) => a.type === undefined || a.type === type);
        if (isModule) {
          // Never allowlisted (absence-gate-C4): code belongs in a file.
          out.push(NOISE.inlineModule.fail(body.slice(0, 60)));
        } else if (tally.meet(typed, body) === undefined) {
          out.push(NOISE.namedScripts.inline(body.slice(0, 60)));
        }
      }
      return;
    }

    if (tag === 'link' && notFound) {
      if (!(get('rel') ?? '').toLowerCase().split(/\s+/).includes('canonical')) out.push(NOISE.notFound.load(`<link rel="${get('rel') ?? ''}" href="${get('href') ?? ''}">`));
      return;
    }

    if (tag === 'link' && (get('rel') ?? '').toLowerCase().split(/\s+/).includes('stylesheet')) {
      const href = get('href') ?? '';
      if (lists.mainStylesheet.test(fromRoot(href))) mains += 1;
      else if (tally.meet(lists.otherStylesheets, fromRoot(href)) === undefined) out.push(NOISE.mainStylesheet.unnamed(href));
      return;
    }

    if (tag === 'style' && !svg) {
      if (notFound) ownStyles.push(textOf(el));
      else out.push(NOISE.styleElement.fail);
      return;
    }

    if (tag === 'noscript') {
      for (const body of noscriptBodies(textOf(el))) {
        if (tally.meet(lists.noscriptStyles, body) === undefined) out.push(NOISE.noscriptStyle.unnamed(body.slice(0, 60)));
        else noscriptStyleSeen = true;
      }
      return;
    }

    for (const child of [...(el.childNodes ?? []), ...(el.content?.childNodes ?? [])]) {
      if (isEl(child)) visit(child, region, skip, svg);
    }
  };
  visit((parse(html) as unknown as { childNodes: El[] }).childNodes.find(isEl) as El, false, false, false);

  if (notFound) {
    if (ownStyles.length !== 1) out.push(NOISE.notFound.styles(ownStyles.length));
    for (const css of ownStyles) {
      if (/url\s*\(|@import/i.test(css)) out.push(NOISE.notFound.fetches);
      if (css.length > NOT_FOUND_STYLE_MAX) out.push(NOISE.notFound.long(css.length));
    }
  } else {
    if (bundles !== 1) out.push(NOISE.bundle.count(bundles));
    if (mains !== 1) out.push(NOISE.mainStylesheet.count(mains));
    if (!noscriptStyleSeen) out.push(NOISE.noscriptStyle.missing(lists.noscriptStyles.map((a) => a.match.source).join('; ')));
  }
  for (const style of styles.slice(0, 3)) out.push(NOISE.presentational.fail(style));
  for (const h of [...handlers].sort()) out.push(NOISE.handlers.fail(h));
  return out;
}

/** Every file under `dir` whose name `test` matches, relative to it with forward slashes, sorted. */
function filesUnder(dir: string, test: RegExp): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const child = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) walk(child);
      else if (test.test(e.name)) out.push(child);
    }
  };
  walk('');
  return out.sort();
}

/**
 * Script files under `dist` that no page loads and no loaded file imports,
 * statically or dynamically, as paths relative to `dist` (noise, whole site).
 * A page's `src` is resolved from the page's own folder; an import is matched
 * by file name, which is how a bundler's hashed chunks name each other.
 */
export function unreachableScripts(dist: string, pages: readonly string[]): string[] {
  const all = filesUnder(dist, SCRIPT_FILE);
  const byName = new Map<string, string[]>();
  for (const f of all) {
    const name = path.posix.basename(f);
    byName.set(name, [...(byName.get(name) ?? []), f]);
  }
  const keep = new Set<string>();
  const queue: string[] = [];
  const push = (rel: string): void => {
    if (all.includes(rel) && !keep.has(rel)) {
      keep.add(rel);
      queue.push(rel);
    }
  };
  for (const page of pages) {
    const from = path.posix.dirname(path.relative(dist, page).split(path.sep).join('/'));
    for (const m of fs.readFileSync(page, 'utf8').matchAll(/\ssrc="([^"#?]+\.(?:c|m)?js)(?:[?#][^"]*)?"/g)) {
      push(path.posix.normalize(path.posix.join(from, m[1] as string)));
    }
  }
  while (queue.length > 0) {
    const body = fs.readFileSync(path.join(dist, queue.pop() as string), 'utf8');
    for (const m of body.matchAll(/["'`][^"'`\s]*?\/?([A-Za-z0-9._-]+\.(?:c|m)?js)["'`]/g)) {
      for (const f of byName.get(m[1] as string) ?? []) push(f);
    }
  }
  return all.filter((f) => !keep.has(f));
}
