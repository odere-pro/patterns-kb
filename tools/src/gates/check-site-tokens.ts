/**
 * The site's paint comes from tokens: a colour is decided in one stylesheet
 * and named everywhere else (spec kb.site.components, token-gate; C1, C2).
 *
 * Every colour on the site comes from Starlight's custom properties
 * (`--sl-color-*`) or from a `--kb-*` token that does, which is what lets one
 * build read right in light and in dark with no second stylesheet. A hex,
 * `rgb()`, `rgba()`, `hsl()` or `hsla()` literal in any stylesheet under
 * `site/src` is a finding naming the file and line, except in
 * `site/src/styles/tokens.css`, the one file where a colour is a decision
 * rather than a consequence. A component that needs a value nothing gives it
 * puts it there once, under a name, and points at the name.
 *
 * Not findings:
 *   - `currentColor`, `transparent` and the named colours: relationships and
 *     words, not typed values, and nothing this gate can judge per theme;
 *   - a literal inside a comment: the rules are written down in these files,
 *     and a rule that quotes what it bans is documentation;
 *   - hex-like text that is no colour: a colour is read only in a declaration's
 *     value, so a selector (an id such as `#ace`, an attribute value such as
 *     `[href="#cafe"]`), the inside of `url(…)` (a fragment such as
 *     `url(#fade)`) and a quoted string are never read; in a value, `#`
 *     followed by exactly 3, 4, 6 or 8 hex digits with a word boundary after
 *     is a colour.
 *
 * A colour function is matched in any case: `HSL(…)` is `hsl(…)` to CSS.
 *
 * Reads source only, no build and no browser, so it runs in `make validate`.
 *
 * Named files narrow the scan and never widen it (contract-C4): a named
 * stylesheet under site/src is read; a name that does not exist, or a
 * stylesheet outside site/src, is misuse (exit 2); any other name is dropped.
 * With no name, or with this program among the names (the rule itself
 * changed, which is how the driver's --changed run hands it over), the whole
 * of site/src is read.
 *
 * Usage: check-site-tokens [paths…]   (the changed stylesheets; none walks site/src)
 */

import fs from 'node:fs';
import path from 'node:path';

import { main, UsageError, type GateContext, type GateSpec } from '../lib/gate.js';

/** Where the site's stylesheets live. */
export const ROOT = 'site/src';

/** The one stylesheet where a colour literal is a decision rather than a leak. */
export const TOKENS = 'site/src/styles/tokens.css';

/** This gate's own program: naming it means the rule changed, so every stylesheet is read. */
export const PROGRAM = 'tools/src/gates/check-site-tokens.ts';

/**
 * A colour literal as CSS spells one: `#` and exactly 3, 4, 6 or 8 hex digits
 * with nothing word-like after, or a colour function by name, whatever its
 * arguments (an `rgb(var(--x))` is still a colour typed by hand).
 */
export const COLOUR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b|\b(?:rgba?|hsla?)\s*\(/gi;

const blank = (text: string): string => text.replace(/[^\n]/g, ' ');

/** `/* … *\/` comments blanked, line breaks kept, so a finding's line is the file's. */
export function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, blank);
}

/**
 * Only what a colour can be: the values of declarations. Comments, quoted
 * strings and the inside of `url(…)` are blanked; then every stretch that
 * ends at a `{` — a selector or an at-rule's prelude — is blanked, and in a
 * stretch that ends at `;` or `}` — a declaration — everything up to its
 * first `:` is. Line breaks are kept throughout.
 */
export function valuesOnly(css: string): string {
  const quiet = withoutComments(css)
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (q) => `${q[0] as string}${blank(q.slice(1, -1))}${q[0] as string}`)
    .replace(/\burl\(([^)]*)\)/gi, (_m, inner: string) => `url(${blank(inner)})`);
  let out = '';
  for (const part of quiet.split(/(?<=[{};])/)) {
    const end = /[{};]$/.exec(part)?.[0] ?? '';
    const body = part.slice(0, part.length - end.length);
    if (end === '{') {
      out += `${blank(body)}{`;
      continue;
    }
    // A declaration's value is what follows its first colon. An at-statement
    // (`@import …;`) keeps its text; a stretch with no colon declares nothing.
    if (body.trimStart().startsWith('@')) {
      out += part;
      continue;
    }
    const colon = body.indexOf(':');
    out += colon < 0 ? `${blank(body)}${end}` : `${blank(body.slice(0, colon + 1))}${body.slice(colon + 1)}${end}`;
  }
  return out;
}

/** Every colour literal in one stylesheet, with its line. */
export function literals(css: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  valuesOnly(css)
    .split('\n')
    .forEach((line, i) => {
      for (const m of line.matchAll(COLOUR)) out.push({ line: i + 1, text: m[0].replace(/\s*\($/, '(…)') });
    });
  return out;
}

/** Every `.css` file under a folder, sorted, depth first. */
export function cssFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (at: string): void => {
    for (const name of fs.readdirSync(at).sort()) {
      const p = path.join(at, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.css')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

export const spec: GateSpec = {
  name: 'site-tokens',
  usage: 'usage: check-site-tokens [paths…]   (colours in the site stylesheets come from tokens)',
  positional: true,
  run(ctx: GateContext): string {
    const root = path.join(ctx.root, ROOT);
    if (!fs.existsSync(root)) {
      ctx.failLine(`${ROOT} does not exist — there are no site stylesheets to read`);
      return '';
    }
    // A narrowed run hands over the changed files; a bare run, or one naming
    // this program, walks the tree. The token stylesheet is skipped either
    // way, by path.
    const rel = (f: string): string => path.relative(ctx.root, f).split(path.sep).join('/');
    for (const a of ctx.args) {
      const abs = path.resolve(ctx.root, a);
      if (!fs.existsSync(abs)) throw new UsageError(`no such file: ${a}`);
      if (a.endsWith('.css') && !rel(abs).startsWith(`${ROOT}/`)) {
        throw new UsageError(`${a} is not a stylesheet under ${ROOT} — this gate reads those only`);
      }
    }
    const whole = ctx.args.length === 0 || ctx.args.some((a) => rel(path.resolve(ctx.root, a)) === PROGRAM);
    const given = ctx.args.filter((a) => a.endsWith('.css')).map((a) => path.resolve(ctx.root, a));
    const files = (whole ? cssFiles(root) : given).filter((f) => rel(f) !== TOKENS);

    for (const file of files) {
      for (const { line, text } of literals(fs.readFileSync(file, 'utf8'))) {
        ctx.fail(
          rel(file),
          `\`${text}\` is a colour literal — use Starlight's --sl-color-* or a --kb-* token, or put the value in ${TOKENS} under a name; a typed colour reads right in one theme and wrong in the other`,
          line,
        );
      }
    }
    return `[site-tokens] ${files.length} stylesheets under ${ROOT} take every colour from a token; literals live in ${TOKENS} only`;
  },
};

main(spec, import.meta.url);
