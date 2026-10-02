/**
 * The post-build pass that readies the built site's scripts to be opened from
 * a folder and cached for good.
 *
 * Runs last in `postbuild` in site/package.json, after the formatter, and is
 * runnable on its own:
 *
 *     node_modules/.bin/tsx tools/src/site/site-assets.ts [--dist <dir>]
 *
 * It does two jobs, each over every built page.
 *
 * CLASSIC SCRIPTS. Starlight ships its small behaviours — the phone sidebar's
 * focus trap, the phone "On this page" menu, the sidebar's remembered state,
 * link prefetch and the code blocks' copy button — as `<script type="module">`.
 * A browser blocks a module loaded from `file://` (CORS), so from a folder the
 * phone menu, the sidebar state and the copy button do nothing, and the
 * console fills with errors. The chunks hold no `import`, so this pass joins
 * them into one `_astro/starlight.<hash>.js`, each chunk wrapped in a strict
 * function of its own so their top-level names stay apart, loaded `defer` (a
 * module runs after parsing, and so does a deferred classic) from the head,
 * and drops the other tags. A module chunk carrying an `import` is left alone
 * and reported: the join would break it. The copy script, `ec.<hash>.js`, is
 * already one function, so only its tag loses `type="module"` and gains `defer`.
 *
 * FINGERPRINTS. `search-index.js` and `kb.js` take a hash of their bytes in
 * their names (`kb.3fa9c1d2.js`), so a host may cache them as immutable; a
 * change to a file is a new name. The payload goes first: its name is written
 * into the bundle, where the search box reads it, and then the bundle is
 * hashed and every page's `<script src>` is pointed at it. The names stay
 * relative, so they resolve from a folder too. `index.json` keeps its name: it
 * is a published address, and a host revalidates it.
 *
 * A second run changes no byte: no module script is left to join, the same
 * bytes get the same names, and the payload pass's fresh plain copy replaces
 * its hashed twin.
 */

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { main, UsageError, type GateContext, type GateSpec } from '../lib/gate.js';
import { BUNDLE_FILE, contentHash, hashedName, PAYLOAD_FILE_NAME } from '../lib/asset-names.js';

/**
 * One module script tag on its own line, with its indentation:
 * `<script type="module" src="…/_astro/x.js"></script>`. Starlight's own tags
 * sit on lines of their own once the formatter has run.
 */
const MODULE_LINE = /^([ \t]*)<script type="module" src="((?:\.{1,2}\/)*)_astro\/((?!ec\.)[^"]+\.js)"><\/script>\n/gm;

/**
 * The code-block script's tag, which Expressive Code writes inline in the
 * block's own markup, beside its stylesheet link. Its chunk is already one
 * function, so it needs no join.
 */
const COPY_TAG = /<script type="module" src="((?:\.{1,2}\/)*_astro\/ec\.[^"]+\.js)"><\/script>/g;

/** The joined file's name before its hash. */
export const JOINED = 'starlight.js';

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

/** A module chunk that imports another file: the join cannot carry it. */
const IMPORTS = /(?:^|[;}\s])import\s*[({"'`*\w{]|(?:^|[;}\s])export\s*[{*\w]/;

/**
 * Every chunk wrapped in a strict function of its own, in the order given: what
 * a module's own scope was, for a script with no import.
 */
export function joinChunks(bodies: readonly string[]): string {
  return bodies.map((b) => `(function(){"use strict";\n${b.trim()}\n})();\n`).join('');
}

/** One page's module tags: the chunks to join in document order, and the copy script's sources. */
export function moduleTags(html: string): { join: string[]; copy: string[] } {
  return {
    join: [...html.matchAll(MODULE_LINE)].map((m) => m[3] as string),
    copy: [...html.matchAll(COPY_TAG)].map((m) => m[1] as string),
  };
}

/**
 * The page with its module tags made classic: the first joined chunk's tag
 * becomes the one tag for `joined` and the others go; each copy script's tag
 * loses its type and gains `defer`.
 */
export function classicTags(html: string, joined: string): string {
  let first = true;
  return html
    .replace(MODULE_LINE, (_all, indent: string, prefix: string) => {
      if (!first) return '';
      first = false;
      return `${indent}<script src="${prefix}_astro/${joined}" defer></script>\n`;
    })
    .replace(COPY_TAG, '<script src="$1" defer></script>');
}

/** The bundle's tag, pointed at `file`: `<script src="../kb.js"` or an older hashed name becomes `<script src="../kb.3fa9c1d2.js"`. */
export function pointBundle(html: string, file: string): string {
  return html.replace(/(<script src="(?:\.{1,2}\/)*)kb(?:\.[0-9a-f]{8})?\.js(")/g, `$1${file}$2`);
}

/** The payload's name in the bundle, plain or hashed, which is a string literal wherever it is written. */
const PAYLOAD_LITERAL = /(["'`])search-index(?:\.[0-9a-f]{8})?\.js\1/g;

export const spec: GateSpec = {
  name: 'site-assets',
  usage: 'usage: site-assets [--dist <dir>] [--quiet]',
  flags: ['--quiet'],
  options: ['--dist'],
  run(ctx: GateContext): string {
    const abs = path.resolve(ctx.root, ctx.options.get('--dist') ?? path.join('site', 'dist'));
    const shown = path.relative(ctx.root, abs) || '.';
    if (!existsSync(abs)) throw new UsageError(`no built site at ${shown} — build it first: make site-build`);
    const pages = htmlFiles(abs);
    if (pages.length === 0) throw new UsageError(`no .html files under ${shown} — build it first: make site-build`);
    const rel = (p: string): string => path.relative(ctx.root, p).split(path.sep).join('/');

    // ---- classic scripts -------------------------------------------------
    const astro = path.join(abs, '_astro');
    const source = new Map<string, string>();
    const order: string[] = [];
    for (const file of pages) {
      for (const name of moduleTags(readFileSync(file, 'utf8')).join) {
        if (!source.has(name)) {
          const chunk = path.join(astro, name);
          const body = existsSync(chunk) ? readFileSync(chunk, 'utf8') : null;
          if (body === null) {
            ctx.fail(rel(file), `loads _astro/${name}, which is not built`);
            continue;
          }
          if (IMPORTS.test(body)) {
            ctx.fail(rel(chunk), 'is a module that imports another file — the join into one classic script would break it; ship it as its own classic script or stop shipping it');
            continue;
          }
          source.set(name, body);
          order.push(name);
        }
      }
    }
    let joinedName = '';
    if (ctx.findings === 0 && order.length > 0) {
      const body = joinChunks(order.map((n) => source.get(n) as string));
      joinedName = hashedName(JOINED, contentHash(body));
      writeFileSync(path.join(astro, joinedName), body);
      for (const name of order) rmSync(path.join(astro, name), { force: true });
    }

    if (ctx.findings > 0) return '';

    let converted = 0;
    for (const file of pages) {
      const html = readFileSync(file, 'utf8');
      const out = classicTags(html, joinedName);
      if (out !== html) {
        writeFileSync(file, out);
        converted += 1;
      }
    }

    // ---- fingerprints ----------------------------------------------------
    // The payload pass writes `search-index.js` under its plain name on every
    // run, so a plain file is always the newest; with none, the hashed one a
    // previous run left is the source. Either way the result is the same names
    // for the same bytes.
    const names = readdirSync(abs);
    const plainPayload = path.join(abs, 'search-index.js');
    const payloadSource = existsSync(plainPayload) ? 'search-index.js' : names.find((f) => PAYLOAD_FILE_NAME.test(f));
    const bundleSource = existsSync(path.join(abs, 'kb.js')) ? 'kb.js' : names.find((f) => BUNDLE_FILE.test(f));
    if (bundleSource === undefined) {
      ctx.fail(rel(path.join(abs, 'kb.js')), 'is missing — Astro copies it from site/public, where site/package.json bundle writes it');
      return '';
    }
    if (payloadSource === undefined) {
      ctx.fail(rel(plainPayload), 'is missing — tools/src/site/gen-search-index.ts writes it before this pass');
      return '';
    }

    const payload = readFileSync(path.join(abs, payloadSource));
    const payloadFile = hashedName('search-index.js', contentHash(payload));
    writeFileSync(path.join(abs, payloadFile), payload);

    const bundle = readFileSync(path.join(abs, bundleSource), 'utf8');
    const literals = bundle.match(PAYLOAD_LITERAL) ?? [];
    if (literals.length !== 1) {
      ctx.fail(rel(path.join(abs, bundleSource)), `names search-index.js ${String(literals.length)} times — the search box reads its payload's name from one string, which this pass points at the hashed file`);
      return '';
    }
    const fixed = bundle.replace(PAYLOAD_LITERAL, (_m, q: string) => `${q}${payloadFile}${q}`);
    const bundleFile = hashedName('kb.js', contentHash(fixed));
    writeFileSync(path.join(abs, bundleFile), fixed);

    for (const f of names) {
      if ((PAYLOAD_FILE_NAME.test(f) && f !== payloadFile) || (BUNDLE_FILE.test(f) && f !== bundleFile)) rmSync(path.join(abs, f));
    }
    let pointed = 0;
    for (const file of pages) {
      const html = readFileSync(file, 'utf8');
      const out = pointBundle(html, bundleFile);
      if (out !== html) {
        writeFileSync(file, out);
        pointed += 1;
      }
    }

    if (ctx.flags.has('--quiet')) return '';
    return `[site-assets] ${String(order.length)} module chunk(s) joined into one classic script, ${String(converted)} page(s) made classic; ${bundleFile} and ${payloadFile} fingerprinted, ${String(pointed)} page(s) repointed`;
  },
};

main(spec, import.meta.url);
