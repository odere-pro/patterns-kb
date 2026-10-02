/**
 * The static accessibility floor over the built site (spec
 * kb.noise.accessibility, static-floor, focus-rings and chrome-ratio): what the
 * markup answers without a browser, on every page under site/dist.
 *
 *   - `<html lang=…>` on every page;
 *   - exactly one `<h1>`, and no heading before it;
 *   - every `aria-describedby` / `aria-labelledby` token names an id on the page;
 *   - every `role="option"` has a `role="listbox"` ancestor — per element, by
 *     walking the tag stack, never "a listbox exists somewhere on the page",
 *     which the search dialog's own listbox would answer for any other list;
 *   - every `<img>` carries an `alt` (empty means decorative);
 *   - every inline `<svg>` has a `<title>` child, an `aria-label` or a
 *     resolving `aria-labelledby`, unless an ancestor is `aria-hidden="true"`
 *     or skip-marked;
 *   - a hub has a heading below its `<h1>`;
 *   - every kb-classed button, link and non-`-1` `tabindex` element is reached
 *     by the rightmost compound of some `:focus-visible` selector in the
 *     shipped CSS (fields are exempt);
 *   - the share of visible text outside `<main>` stays at or under the cap,
 *     unless a reasoned allowlist entry names the page.
 *
 * Each defect is one finding naming its page (accessibility-C1). The cap is
 * the spec's; the warning band below it is this site's, measured (see
 * CHROME_BAND). A page in the band is a note, not a finding on its own
 * (accessibility-C5); the band is a ratchet, though: the number of pages in
 * it may not rise above `bandMax` in docs/data/allow/site-a11y.json, and a
 * count below it is noted so the file can be lowered. The summary names the highest ratio of any page the
 * allowlist does not name, beside the band edge. The chrome allowlist ships
 * empty, as the spec asks: the sidebar shows only the current branch
 * (site/src/components/Sidebar), which keeps every page under the cap. This
 * text ratio is not the page-audit reader's byte ratio; neither stands in for
 * the other (accessibility-C9).
 *
 * What only a rendered page answers — contrast above all — is
 * check-site-axe.ts. Both run in `make site-build` and CI, never in `make
 * validate`, since both need a built site (accessibility-C8).
 *
 * Usage: check-site-a11y   (no arguments; reads site/dist)
 */

import fs from 'node:fs';
import path from 'node:path';

import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { DIST } from '../site/site-output.js';

/** The chrome cap the spec sets: above it, a page fails unless allowlisted. */
export const CHROME_MAX = 0.8;

/**
 * The warning band's lower edge: a page between it and the cap is reported,
 * not failed. This site's number, measured, never copied. Over the 435 built
 * pages with the current-branch sidebar the ratio's median is 12%, its 90th
 * percentile 20%, and its highest 65% (the hub patterns/gof/creational.html);
 * hubs and map pages fill the top, since their own text is a short list. The
 * edge sits five points above that highest page and ten below the cap, so a
 * hub that grows is noted a good while before it fails, and a clean build
 * prints no band note. Measure again when the chrome or the hubs change shape.
 */
export const CHROME_BAND = 0.7;

/** The ratchet file: the most pages the warning band may hold. */
export const BAND_FILE = 'docs/data/allow/site-a11y.json';

/** The band ratchet's ceiling, or null after a finding naming the file. */
export function readBandMax(ctx: GateContext): number | null {
  const abs = path.join(ctx.root, BAND_FILE);
  if (!fs.existsSync(abs)) {
    ctx.fail(BAND_FILE, 'is missing — it holds bandMax, the most pages the chrome warning band may hold');
    return null;
  }
  let max: unknown;
  try {
    max = (JSON.parse(fs.readFileSync(abs, 'utf8')) as { bandMax?: unknown } | null)?.bandMax;
  } catch {
    ctx.fail(BAND_FILE, 'is not valid JSON');
    return null;
  }
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 0) {
    ctx.fail(BAND_FILE, 'has no bandMax (a whole number from 0)');
    return null;
  }
  return max;
}

/** The class prefix every control of ours is named with. */
export const PREFIX = 'kb-';

/** Elements that never have a closing tag, so they never open a subtree. */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export interface Tag {
  /** Lowercased element name. */
  name: string;
  /** Raw attribute text of the opening tag. */
  attrs: string;
  /** True for `</x>`. */
  closing: boolean;
  /** True for `<x/>` and for void elements — opens no subtree either way. */
  empty: boolean;
}

/**
 * Every tag on the page, in order, with quoted attribute values consumed as
 * part of the tag, so a code sample about markup — a `data-code="…"` holding a
 * literal `<div>` — never shifts the tag stack under an ancestry question
 * (accessibility-C2).
 */
export function tags(html: string): Tag[] {
  const out: Tag[] = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const name = (m[2] as string).toLowerCase();
    out.push({
      name,
      attrs: m[3] as string,
      closing: m[1] === '/',
      empty: m[4] === '/' || VOID_ELEMENTS.has(name),
    });
  }
  return out;
}

/** One attribute's value off a tag's attribute text, or null. */
const attr = (attrs: string, name: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${name}=("[^"]*"|'[^']*')`, 'i').exec(attrs);
  return m ? (m[1] as string).slice(1, -1) : null;
};

/**
 * `role="option"` elements with no `role="listbox"` ancestor, named by their
 * id (or their opening tag, when they have none). Ancestry, not co-occurrence:
 * two widgets on one page must not answer for each other.
 */
export function orphanedOptions(html: string): string[] {
  const out: string[] = [];
  const stack: boolean[] = [];
  let inListbox = 0;
  for (const tag of tags(html)) {
    if (tag.closing) {
      if (stack.length > 0 && stack.pop() === true) inListbox -= 1;
      continue;
    }
    const role = attr(tag.attrs, 'role');
    const isListbox = role === 'listbox';
    if (role === 'option' && inListbox === 0) {
      const id = attr(tag.attrs, 'id');
      out.push(
        `role="option" on ${id === null ? `<${tag.name}>` : `#${id}`} with no role="listbox" ` +
          'ancestor — an option outside a listbox is announced to nobody, and a ' +
          'combobox pointing aria-activedescendant at it is pointing out of its own widget',
      );
    }
    if (tag.empty) continue;
    stack.push(isListbox);
    if (isListbox) inListbox += 1;
  }
  return out;
}

/**
 * A hub page with no heading below its `<h1>`. A hub is recognised by the
 * markup SectionHub.astro renders, never by a list of routes, so a generated
 * hub is covered the day it exists.
 */
export function hubHeadingFinding(html: string): string | null {
  const list = tags(markupOnly(html));
  if (!list.some((t) => !t.closing && (attr(t.attrs, 'class') ?? '').split(/\s+/).includes('kb-hub-group'))) return null;
  if (list.some((t) => !t.closing && /^h[2-6]$/.test(t.name))) return null;
  return (
    'a hub page whose only heading is its <h1> — the card groups are the page ' +
    'structure, so their labels are headings (SectionHub.astro renders the group ' +
    'label as <h2> and each card title as <h3>)'
  );
}

/**
 * `<img>` elements carrying no `alt` attribute at all. `alt=""` passes: it is
 * the author saying there is nothing to read. A missing alt is no decision —
 * the accessible name falls back to the file name.
 */
export function imagesWithoutAlt(html: string): string[] {
  const out: string[] = [];
  for (const tag of tags(html)) {
    if (tag.name !== 'img' || tag.closing) continue;
    // Presence, not a value. `alt`, `alt=""` and `alt="a bar chart"` are all
    // answers; only the bare-attribute spelling is invisible to `attr`, which
    // reads quoted values, so the question is asked of the attribute text.
    if (/(?:^|\s)alt(?:\s|=|$)/i.test(tag.attrs)) continue;
    const src = attr(tag.attrs, 'src');
    out.push(
      `<img${src === null ? '' : ` src="${src}"`}> has no alt attribute — a screen reader ` +
        'announces the file name instead. Describe it, or write alt="" to say it is decorative',
    );
  }
  return out;
}

/**
 * Whether an `<svg>` at `list[i]` carries an accessible name.
 *
 * The three ways an SVG can have one, in the order the accessible-name algorithm
 * uses them: `aria-labelledby` (resolving on this page — a reference into the
 * void names nothing), `aria-label`, or a `<title>` child. The `<title>` is
 * looked for by walking forward to the matching `</svg>`, counting nested `<svg>`
 * elements: mermaid nests one freely, and a title belonging to an inner diagram
 * does not name the outer one.
 */
export function svgHasName(list: readonly Tag[], i: number, ids: ReadonlySet<string>): boolean {
  const svg = list[i] as Tag;
  const ref = attr(svg.attrs, 'aria-labelledby');
  if (ref !== null && ref.split(/\s+/).some((r) => r !== '' && ids.has(r))) return true;
  const label = attr(svg.attrs, 'aria-label');
  if (label !== null && label.trim() !== '') return true;
  if (svg.empty) return false;
  let nested = 0;
  for (let j = i + 1; j < list.length; j += 1) {
    const tag = list[j] as Tag;
    if (tag.name === 'svg') {
      if (tag.closing) {
        if (nested === 0) return false; // reached this element's own </svg>
        nested -= 1;
      } else if (!tag.empty) nested += 1;
      continue;
    }
    if (tag.name === 'title' && !tag.closing && nested === 0) return true;
  }
  return false;
}

/**
 * Inline `<svg>` elements that are neither named nor hidden. A picture with a
 * role and no name is announced as silence; mermaid gives each diagram a role
 * and a roledescription and no name of its own.
 *
 * Two exemptions, both answers rather than omissions: `aria-hidden="true"`
 * (an icon whose meaning is in the label beside it) and a `data-kb-skip`
 * subtree (chrome). Both are read as ancestry, the way a browser reads
 * `aria-hidden`: Starlight puts its anchor icon inside
 * `<span aria-hidden="true">`, and the svg itself carries nothing.
 */
export function unnamedGraphics(html: string): string[] {
  const list = tags(html);
  const ids = idsOf(list);
  const out: string[] = [];
  const seen = new Set<string>();
  const stack: boolean[] = [];
  let hidden = 0;
  for (let i = 0; i < list.length; i += 1) {
    const tag = list[i] as Tag;
    if (tag.closing) {
      if (stack.length > 0 && stack.pop() === true) hidden -= 1;
      continue;
    }
    const hides =
      attr(tag.attrs, 'aria-hidden') === 'true' ||
      /(?:^|\s)data-kb-skip(?:\s|=|$)/.test(tag.attrs);
    if (tag.name === 'svg' && hidden === 0 && !hides && !svgHasName(list, i, ids)) {
      const id = attr(tag.attrs, 'id');
      const cls = attr(tag.attrs, 'class');
      const which = id !== null ? ` id="${id}"` : cls !== null ? ` class="${cls}"` : '';
      if (!seen.has(which)) {
        seen.add(which);
        out.push(
          `<svg${which}> has no accessible name — an inline SVG with a role and no <title>, ` +
            'aria-label or resolving aria-labelledby is announced as silence. A diagram is named ' +
            'where it is framed (rehypeKbDiagrams in tools/src/lib/site-markdown.ts); ' +
            'a picture with nothing to say is aria-hidden="true" instead',
        );
      }
    }
    if (tag.empty) continue;
    stack.push(hides);
    if (hides) hidden += 1;
  }
  return out;
}

/**
 * Pages allowed above the chrome cap, keyed by their path under site/dist,
 * each with its reason (accessibility-C4). It ships empty: an entry is a
 * named debt, removed when the page or its chrome is restructured, and a page
 * named here that falls back under the cap is noted, so the entry can go.
 */
export const CHROME_ALLOWLIST: ReadonlyMap<string, string> = new Map<string, string>();

const stripTags = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The part of a selector that describes the element itself: everything after
 * the last combinator. A scan, not a split on whitespace: a minified
 * stylesheet writes `[class*=' kb-']` as `[class*=\ kb-]`, an escaped space
 * inside a bracket, and a split would cut it to `kb-]` and match nothing
 * (accessibility-C3).
 */
export function rightmostCompound(selector: string): string {
  let start = 0;
  let depth = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const c = selector[i] as string;
    if (c === '\\') {
      i += 1; // an escaped character is part of the compound, whatever it is
      continue;
    }
    if (c === '[' || c === '(') depth += 1;
    else if (c === ']' || c === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (c === ' ' || c === '\t' || c === '\n' || /[>+~]/.test(c))) {
      start = i + 1;
    }
  }
  return selector.slice(start);
}

/**
 * The rightmost compound of every `:focus-visible` selector in a stylesheet.
 *
 * Only the rightmost compound, because that is the part that describes the
 * element being focused; the ancestors in front of it narrow *where* the ring
 * applies, and a floor gate that ignored them would rather under-claim coverage
 * than over-claim it. Comments and at-rule preludes are stripped first so a
 * `:focus-visible` written in prose is not read as a rule.
 */
export function focusVisibleCompounds(css: string): string[] {
  const out: string[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Selector lists are what sits before a `{`; only prelude text is scanned, so
  // a declaration value mentioning the pseudo-class cannot contribute.
  for (const m of clean.matchAll(/(?:^|[};{])([^{};]*:focus-visible[^{};]*)\{/g)) {
    for (const selector of (m[1] as string).split(',')) {
      const s = selector.trim();
      if (!s.includes(':focus-visible')) continue;
      const last = rightmostCompound(s);
      if (last.includes(':focus-visible')) out.push(last);
    }
  }
  return out;
}

/**
 * Whether one compound selector reaches an element with this tag and class
 * attribute.
 *
 * Deliberately small, and deliberately conservative: it understands a tag name,
 * `.class` tokens and `[class^=…]` / `[class*=…]` / `[class=…]`, which is every
 * shape the site's focus rules use, and it refuses to guess about anything else
 * — a compound carrying some other pseudo-class or attribute selector counts as
 * no coverage at all. So the failure mode is a red gate on CSS the matcher does
 * not understand, naming the control, rather than a quiet pass on a control with
 * no ring. Widen it when a real rule needs it, never to make a finding go away.
 */
export function compoundMatches(compound: string, tag: string, classAttr: string): boolean {
  let rest = compound.replace(/:focus-visible/g, '').replace(/:focus\b/g, '');
  const classes = classAttr.split(/\s+/).filter(Boolean);

  const nameMatch = /^[a-zA-Z][\w-]*/.exec(rest);
  if (nameMatch) {
    if (nameMatch[0].toLowerCase() !== tag) return false;
    rest = rest.slice(nameMatch[0].length);
  }
  if (rest.startsWith('*')) rest = rest.slice(1);

  // The unquoted third alternative reads the minified spelling: quotes
  // dropped, the space kept as a backslash escape.
  const token = /^(?:\.((?:[\w-]|\\.)+)|\[class([~^*$|]?)=(?:"([^"]*)"|'([^']*)'|([^\]]*))\])/;
  const unescape = (s: string): string => s.replace(/\\(.)/g, '$1');
  while (rest !== '') {
    const m = token.exec(rest);
    if (!m) return false; // an unknown pseudo-class or attribute — claim nothing
    if (m[1] !== undefined) {
      if (!classes.includes(unescape(m[1]))) return false;
    } else {
      const op = m[2] as string;
      const value = unescape((m[3] ?? m[4] ?? m[5]) as string);
      const ok =
        op === '^'
          ? classAttr.startsWith(value)
          : op === '*'
            ? classAttr.includes(value)
            : op === '~'
              ? classes.includes(value)
              : op === '$'
                ? classAttr.endsWith(value)
                : classAttr === value;
      if (!ok) return false;
    }
    rest = rest.slice(m[0].length);
  }
  return true;
}

/**
 * Keyboard-reachable kb controls on a page that no `:focus-visible` selector
 * reaches: buttons, links and anything with a usable `tabindex`.
 * `tabindex="-1"` is focusable by script, never by Tab, so it is exempt; so
 * are fields, whose ring is their own dialog's decision.
 */
export function unringedControls(html: string, compounds: string[]): string[] {
  const seen = new Set<string>();
  for (const tag of tags(html)) {
    if (tag.closing) continue;
    const tabindex = attr(tag.attrs, 'tabindex');
    const focusable =
      tag.name === 'button' || tag.name === 'a' || (tabindex !== null && tabindex !== '-1');
    if (!focusable) continue;
    const classAttr = attr(tag.attrs, 'class') ?? '';
    const ours = classAttr.split(/\s+/).filter((c) => c.startsWith(PREFIX));
    if (ours.length === 0) continue;
    if (compounds.some((c) => compoundMatches(c, tag.name, classAttr))) continue;
    seen.add(`<${tag.name} class="${ours.join(' ')}">`);
  }
  return [...seen].sort();
}

/**
 * The page with comments and the bodies of scripts and styles blanked: text a
 * browser never reads as markup. A quoted attribute value is consumed by
 * `tags` itself.
 */
export function markupOnly(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(<(script|style)\b[^>]*>)[\s\S]*?(<\/\2\s*>)/gi, '$1$3');
}

/** Every `id` an element on the page carries. */
export function idsOf(list: readonly Tag[]): Set<string> {
  const out = new Set<string>();
  for (const t of list) {
    const id = t.closing ? null : attr(t.attrs, 'id');
    if (id !== null) out.add(id);
  }
  return out;
}

export function pageFindings(page: string): string[] {
  const html = markupOnly(page);
  const list = tags(html);
  const out: string[] = [];

  const root = list.find((t) => t.name === 'html' && !t.closing);
  if (root === undefined || !/(?:^|\s)lang=/.test(root.attrs)) out.push('missing lang attribute on <html>');

  const headings = list.filter((t) => !t.closing && /^h[1-6]$/.test(t.name)).map((t) => Number(t.name.slice(1)));
  const h1s = headings.filter((h) => h === 1).length;
  if (h1s !== 1) out.push(`${h1s} <h1> elements — a page has exactly one`);
  const firstH1 = headings.indexOf(1);
  if (firstH1 > 0) {
    out.push(`${firstH1} heading(s) before the <h1> — the page outline starts at its title`);
  }

  out.push(...orphanedOptions(html));
  out.push(...imagesWithoutAlt(html));
  out.push(...unnamedGraphics(html));

  const hub = hubHeadingFinding(html);
  if (hub !== null) out.push(hub);

  const ids = idsOf(list);
  for (const t of list) {
    if (t.closing) continue;
    for (const name of ['aria-describedby', 'aria-labelledby']) {
      for (const ref of (attr(t.attrs, name) ?? '').split(/\s+/)) {
        if (ref !== '' && !ids.has(ref)) out.push(`aria reference '${ref}' names no id on the page`);
      }
    }
  }

  return out;
}

/** Share of the page's visible text that sits outside <main>. */
export function chromeRatio(html: string): number {
  const body = stripTags(html);
  if (body.length === 0) return 0;
  const m = /<main[\s>][\s\S]*?<\/main>/i.exec(html);
  const content = m === null ? '' : stripTags(m[0]);
  return 1 - content.length / body.length;
}

/** One chrome ratio as a percentage, for a finding or a note. */
const pct = (r: number): string => `${Math.round(r * 100)}%`;

/**
 * What one page's chrome ratio earns: a finding above the cap unless the page
 * is allowlisted; a note for an allowlisted page back under the cap, and for
 * a page inside the warning band; nothing otherwise.
 */
export function chromeLine(
  ratio: number,
  allowlisted: boolean,
  band: number,
): { kind: 'fail' | 'band' | 'waived'; text: string } | null {
  if (allowlisted) {
    return ratio <= CHROME_MAX ? { kind: 'waived', text: `${pct(ratio)} of the page text is chrome, under the cap — its CHROME_ALLOWLIST entry can go` } : null;
  }
  if (ratio > CHROME_MAX) {
    return {
      kind: 'fail',
      text:
        `${pct(ratio)} of the page text is chrome (cap ${pct(CHROME_MAX)}) — a machine reader gets ` +
        'mostly navigation; restructure the page, or add a reasoned entry to CHROME_ALLOWLIST',
    };
  }
  if (ratio > band) {
    return { kind: 'band', text: `${pct(ratio)} of the page text is chrome, in the warning band ${pct(band)} to ${pct(CHROME_MAX)}` };
  }
  return null;
}

/** The summary's word on the highest chrome ratio of a page the allowlist does not name. */
export function highestText(highest: { ratio: number; page: string } | null): string {
  return highest === null ? 'every page allowlisted' : `highest ${pct(highest.ratio)} on ${highest.page}`;
}

/** The summary's word on the warning band: its edge and how many pages sit in it. */
export function bandText(band: number, banded: number): string {
  return `${banded} in the warning band from ${pct(band)}`;
}

export const spec: GateSpec = {
  name: 'site-accessibility',
  usage: 'usage: check-site-a11y   (no arguments; reads site/dist)',
  run(ctx: GateContext): string {
    const dist = path.join(ctx.root, DIST);
    if (!fs.existsSync(dist)) {
      ctx.failLine(`no built site at ${DIST} — build it first: make site-build`);
      return '';
    }
    const pages: string[] = [];
    const styles: string[] = [];
    const walk = (dir: string): void => {
      for (const name of fs.readdirSync(dir).sort()) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.html')) pages.push(p);
        else if (name.endsWith('.css')) styles.push(p);
      }
    };
    walk(dist);
    if (pages.length === 0) {
      ctx.failLine(`no .html files under ${DIST} — build it first: make site-build`);
      return '';
    }

    const bandMax = readBandMax(ctx);

    // Every stylesheet the site ships: which file a rule lands in is a build
    // detail, and a control is ringed if anything shipped reaches it.
    const compounds = styles.flatMap((s) => focusVisibleCompounds(fs.readFileSync(s, 'utf8')));

    let allowed = 0;
    let banded = 0;
    let highest: { ratio: number; page: string } | null = null;
    for (const page of pages) {
      const rel = `${DIST}/${path.relative(dist, page).split(path.sep).join('/')}`;
      const html = fs.readFileSync(page, 'utf8');
      for (const finding of pageFindings(html)) ctx.fail(rel, finding);

      for (const control of unringedControls(html, compounds)) {
        ctx.fail(
          rel,
          `${control} is reached by no :focus-visible selector — a keyboard reader loses ` +
            'their place on it. The floor is the shared rule in site/src/styles/primitives.css; ' +
            'a control needing a tighter ring declares its own in its component stylesheet',
        );
      }

      const waiver = CHROME_ALLOWLIST.get(path.relative(dist, page).split(path.sep).join('/'));
      if (waiver !== undefined) allowed += 1;
      const ratio = chromeRatio(html);
      if (waiver === undefined && (highest === null || ratio > highest.ratio)) highest = { ratio, page: rel };
      const said = chromeLine(ratio, waiver !== undefined, CHROME_BAND);
      if (said?.kind === 'fail') ctx.fail(rel, said.text);
      else if (said !== null) {
        if (said.kind === 'band') banded += 1;
        ctx.note(`${rel}: ${said.text}`);
      }
    }

    if (bandMax !== null && banded > bandMax) {
      ctx.fail(
        BAND_FILE,
        `${banded} page(s) sit in the chrome warning band, above the ${bandMax} the ratchet allows — ` +
          'trim the chrome of the pages noted above, or restructure them',
      );
    } else if (bandMax !== null && banded < bandMax) {
      ctx.note(`${BAND_FILE}: only ${banded} page(s) sit in the warning band — lower bandMax from ${bandMax} to ${banded}`);
    }
    const band = bandText(CHROME_BAND, banded);
    return (
      `[site-accessibility] ${pages.length} page(s): lang set, one h1 first, hubs outlined, aria references resolve, ` +
      'options in listboxes, images with alt, every graphic named or hidden, every kb control ringed ' +
      `(${compounds.length} :focus-visible selector(s)); chrome within ${pct(CHROME_MAX)} ` +
      `(${highestText(highest)}; ${allowed} allowlisted; ${band})`
    );
  },
};

main(spec, import.meta.url);
