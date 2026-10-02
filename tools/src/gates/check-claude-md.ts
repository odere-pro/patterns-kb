/**
 * Hold every context layer — every CLAUDE.md — to its place, shape and budget
 * (spec: kb.harness.context-layers, layer-gate; the reasoning is
 * docs/concepts/context-layering.md).
 *
 * One large always-on file makes every session carry every fact. So the root
 * layer holds what is true everywhere, each governed directory carries a
 * short layer of its own, and both route to the file that owns a detail
 * rather than restating it. This gate holds that:
 *
 *   root layer       at most ROOT_BUDGET words; every repo link resolves.
 *   directory layer  one per governed directory: at most LAYER_BUDGET words, a
 *                    `Don't` heading with something under it, at least one
 *                    repo-relative link, every such link resolving, and no
 *                    line of DUP_MIN_LEN or more characters copied from the
 *                    root.
 *   nested layer     one per folder under a NESTING_ROOTS entry: the four
 *                    headings, each with something under it, in at most
 *                    NESTED_MAX_LINES non-blank lines.
 *   placement        a CLAUDE.md anywhere else is a finding, unless the
 *                    allowlist excuses it with an owner, a date and a reason.
 *                    The allowlist excuses the place only: an excused layer's
 *                    links must still resolve, and it copies no root line.
 *
 * Headings and links are read outside fenced blocks: a `# Don't` comment in a
 * shell sample is not a heading, and a link in a code sample routes nowhere.
 * A heading holding nothing but blank lines and the question `--fix` wrote is
 * an empty heading, on every run, so the question alone never passes.
 *
 * The governed set is computed each run, never listed: every top-level
 * directory that is not dot-prefixed and not in EXEMPT. A directory added
 * tomorrow is governed tomorrow and fails until it has a layer, which is the
 * one moment a written list would have stayed green.
 *
 * Path arguments narrow the run to the layers governing them, and a narrowed
 * run skips the placement walk: "is there a stray layer anywhere?" is a
 * question a list of changed files cannot answer. `--fix` only appends each
 * missing heading with one question under it; the finding stays, so the run
 * still exits 1 until a person writes the answer.
 *
 * Usage: check-claude-md [--fix] [path…]   (0 clean, 1 findings, 2 misuse)
 */

import fs from 'node:fs';
import path from 'node:path';

import { Allowlist, readAllowlist } from '../lib/allowlist.js';
import { main, UsageError, type GateContext, type GateSpec } from '../lib/gate.js';
import { linkTargets, resolveTarget } from '../lib/links.js';

/**
 * The three budgets and the advisory margin. `.claude/hooks/after-write.sh`
 * reads ROOT_BUDGET, LAYER_BUDGET and ADVISORY_MARGIN at run time (it notes
 * no nested layer), so the numbers live here and nowhere else (spec:
 * kb.harness.single-sources).
 */
export const ROOT_BUDGET = 600;
export const LAYER_BUDGET = 350;
export const NESTED_MAX_LINES = 40;
export const ADVISORY_MARGIN = 25;

/**
 * Lines shorter than this repeat legitimately — a heading, a link line — and
 * prove nothing. Prose here wraps near 95 columns, so a copied paragraph keeps
 * its breaks and its lines land well above the floor.
 */
export const DUP_MIN_LEN = 60;

/** Where this gate's placement exceptions live. */
export const ALLOWLIST = 'docs/data/allow/context-layers.json';
/** The page every finding sends a reader to. */
export const CONCEPT = 'docs/concepts/context-layering.md';

/**
 * Top-level directories that carry no layer, with the reason. Directories
 * starting with "." are exempt too: they are tool configuration, not places
 * work happens.
 */
export const EXEMPT: ReadonlyMap<string, string> = new Map([
  ['tmp', 'untracked scratch space, never part of the product'],
  ['node_modules', 'installed code; a tool cache can create one anywhere, and this gate walks the disk, not the index'],
  [
    'plans',
    'working plans a person opens on purpose; each is deleted, or folded into docs/ and .claude/rules/, when its work lands',
  ],
]);

/** Never walked looking for a stray layer, at any depth: installed code and build output. */
const SKIP_WALK = new Set(['node_modules', 'dist', '.astro', 'coverage']);
/** Skipped at the root only: git's store and the scratch space. A nested `tmp/` is ordinary. */
const SKIP_ROOT = new Set(['.git', 'tmp']);
/** Second whole checkouts, each legitimate in its own tree. */
const WORKTREES = '.claude/worktrees';

/**
 * Directories whose immediate children each carry a nested layer. The pattern
 * is registered, not the folders, so a component added tomorrow is governed
 * tomorrow. Matches nothing until the site workspace arrives.
 */
export const NESTING_ROOTS: readonly string[] = ['site/src/components'];

/**
 * Deeper directories held to the full directory-layer shape, named one by
 * one. None today; the array is mutable only so the suite can name one.
 */
export const EXTRA_DIR_LAYERS: string[] = [];

/** A nested layer answers these four, and needs no `Don't` and no link. */
export const NESTED_HEADINGS = ['Intent', 'Purpose', 'Gotchas', 'Tradeoffs'] as const;

/** The question `--fix` writes under a heading it had to open. */
export const PROMPTS: Record<string, string> = {
  "Don't": 'What goes wrong here? One bullet per mistake actually made in this directory.',
  Intent: 'What is this folder for, in one sentence?',
  Purpose: 'What does it hold, and where does it appear?',
  Gotchas: 'What surprised the last person who touched it?',
  Tradeoffs: 'What was decided against, and why?',
};

const DONT = /^#{1,6}[ \t]+Don['’]t\b/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^(#{1,6})[ \t]/;

/**
 * `text` with every fenced block's lines blanked, fence lines included, so a
 * sample is never read as a heading or a link. Line numbers are kept. A fence
 * closes only at a run of its own character at least as long as its opening.
 */
export function outsideFences(text: string): string {
  let open: string | null = null;
  return text
    .split('\n')
    .map((line) => {
      const m = FENCE.exec(line);
      if (open === null) {
        if (m === null) return line;
        open = m[1] as string;
        return '';
      }
      const run = m?.[1];
      if (run !== undefined && run[0] === open[0] && run.length >= open.length && line.trim() === run) open = null;
      return '';
    })
    .join('\n');
}

/**
 * Whether `prose` has a heading matching `re` with something under it. Null
 * when no such heading exists; false when every one holds only blank lines
 * and comments — the question `--fix` writes is a comment — up to the next
 * heading of its level or above.
 */
export function headingFilled(prose: string, re: RegExp): boolean | null {
  const lines = prose.split('\n');
  let found = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (!re.test(line)) continue;
    found = true;
    const level = (HEADING.exec(line)?.[1] as string).length;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = HEADING.exec(lines[j] as string);
      if (next !== null && (next[1] as string).length <= level) break;
      body.push(lines[j] as string);
    }
    if (body.join('\n').replace(/<!--[\s\S]*?-->/g, '').trim() !== '') return true;
  }
  return found ? false : null;
}

/** Append a heading and the one question that says what belongs under it. */
export function withSection(text: string, heading: string): string {
  const body = text.endsWith('\n') ? text : `${text}\n`;
  return `${body}\n## ${heading}\n\n<!-- ${PROMPTS[heading] ?? 'One or two lines.'} -->\n`;
}

/** Whitespace-separated tokens, the way `wc -w` counts. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w !== '').length;
}

/** Trimmed lines long enough to count as evidence of a copy. */
export function longLines(text: string): Set<string> {
  return new Set(
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length >= DUP_MIN_LEN),
  );
}

/** The governed top-level directories, computed from the disk. */
export function governedDirs(root: string): string[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !EXEMPT.has(e.name))
    .map((e) => e.name)
    .sort();
}

/** The folders under every nesting root, repo-relative. */
export function nestedDirs(root: string): string[] {
  const out: string[] = [];
  for (const parent of NESTING_ROOTS) {
    const abs = path.join(root, parent);
    if (!fs.existsSync(abs)) continue;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (e.isDirectory()) out.push(`${parent}/${e.name}`);
    }
  }
  return out.sort();
}

/** Every CLAUDE.md on disk, repo-relative, skipping installed code, output and other checkouts. */
export function findLayers(root: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      if (SKIP_WALK.has(e.name)) continue;
      if (rel === '' && SKIP_ROOT.has(e.name)) continue;
      const child = rel === '' ? e.name : `${rel}/${e.name}`;
      if (child === WORKTREES) continue;
      if (e.isDirectory()) walk(child);
      else if (e.name === 'CLAUDE.md') out.push(child);
    }
  };
  walk('');
  return out.sort();
}

/**
 * Which layers a set of paths can have broken: a mapping, since each path is
 * governed by exactly one layer. `whole` when a path is this gate's own
 * allowlist, which only a whole run can judge; null when a path is governed by
 * no layer at all, which the caller treats as misuse rather than guessing.
 */
export function layersFor(root: string, args: readonly string[]): Set<string> | 'whole' | null {
  const out = new Set<string>();
  const governed = [...governedDirs(root), ...EXTRA_DIR_LAYERS].sort((a, b) => b.length - a.length);
  const nested = nestedDirs(root);
  for (const raw of args) {
    const rel = raw.replace(/^\.\//, '').replace(/\/+$/, '');
    if (rel === ALLOWLIST) return 'whole';
    if (rel === '' || rel === 'CLAUDE.md') {
      out.add('CLAUDE.md');
      continue;
    }
    // The most specific layer wins: a component folder before the directory
    // holding it, a named deeper directory before its top-level parent.
    const folder = nested.find((d) => rel === d || rel.startsWith(`${d}/`));
    if (folder !== undefined) {
      out.add(`${folder}/CLAUDE.md`);
      continue;
    }
    const dir = governed.find((d) => rel === d || rel.startsWith(`${d}/`));
    if (dir !== undefined) {
      out.add(`${dir}/CLAUDE.md`);
      continue;
    }
    return null;
  }
  return out;
}

export const spec: GateSpec = {
  name: 'context-layers',
  usage:
    'usage: check-claude-md [--fix] [path…]   ' +
    '(paths narrow the run to the layers governing them; --fix opens a missing heading)',
  positional: true,
  fixable: true,
  run(ctx: GateContext): string {
    const scope = ctx.args.length > 0 ? layersFor(ctx.root, ctx.args) : 'whole';
    if (scope === null) {
      throw new UsageError(`no layer governs: ${ctx.args.join(', ')} — run check-claude-md with no arguments`);
    }
    const whole = scope === 'whole';
    const wanted = (rel: string): boolean => whole || scope.has(rel);

    const rootAbs = path.join(ctx.root, 'CLAUDE.md');
    if (!fs.existsSync(rootAbs)) {
      ctx.fail('CLAUDE.md', `the root layer is missing (see ${CONCEPT})`);
      return '';
    }

    let links = 0;
    const checkLinks = (rel: string, text: string): number => {
      let routes = 0;
      for (const t of linkTargets(outsideFences(text))) {
        const resolved = resolveTarget(rel, t);
        if (resolved === null) continue;
        routes += 1;
        links += 1;
        if (!fs.existsSync(path.join(ctx.root, resolved))) {
          ctx.fail(rel, `dead link: (${t}) resolves to ${resolved}, which does not exist`);
        }
      }
      return routes;
    };

    // The root is read whatever the scope: every other layer is compared
    // against it for copies, so it is an input even when it is not a subject.
    const rootText = fs.readFileSync(rootAbs, 'utf8');
    const rootWords = wordCount(rootText);
    const rootLong = longLines(rootText);
    if (wanted('CLAUDE.md')) {
      checkLinks('CLAUDE.md', rootText);
      if (rootWords > ROOT_BUDGET) {
        ctx.fail('CLAUDE.md', `${rootWords} words, budget ${ROOT_BUDGET} — move a fact to its single source and leave a link (${CONCEPT})`);
      }
    }
    const copies = (rel: string, text: string): void => {
      for (const line of [...longLines(text)].sort()) {
        if (rootLong.has(line)) ctx.fail(rel, `line copied from the root layer — keep one copy and link to it: ${line}`);
      }
    };

    const governed = governedDirs(ctx.root);
    if (governed.length === 0) {
      ctx.failLine('no governed directory found — every top-level directory is dot-prefixed or exempt, so the computed set is wrong');
      return '';
    }

    // ---- directory layers ---------------------------------------------------
    let layers = 0;
    for (const d of [...governed, ...EXTRA_DIR_LAYERS.filter((e) => fs.existsSync(path.join(ctx.root, e)))]) {
      const rel = `${d}/CLAUDE.md`;
      if (!wanted(rel)) continue;
      const abs = path.join(ctx.root, rel);
      if (!fs.existsSync(abs)) {
        ctx.fail(rel, `governed directory ${d}/ has no context layer (see ${CONCEPT})`);
        continue;
      }
      layers += 1;
      let text = fs.readFileSync(abs, 'utf8');
      const routes = checkLinks(rel, text);
      const words = wordCount(text);
      if (words > LAYER_BUDGET) {
        ctx.fail(rel, `${words} words, budget ${LAYER_BUDGET} — move a fact to its single source and leave a link (${CONCEPT})`);
      }
      const dont = headingFilled(outsideFences(text), DONT);
      if (dont === null && ctx.fixing) {
        text = withSection(text, "Don't");
        fs.writeFileSync(abs, text);
        ctx.fixed(rel, `opened a "Don't" heading`);
      }
      if (dont === null && !ctx.fixing) {
        ctx.fail(rel, `no "Don't" heading — a directory layer names the mistakes made here`);
      } else if (dont !== true) {
        ctx.fail(rel, `the "Don't" heading is empty — name the mistakes made here`);
      }
      if (routes === 0) {
        ctx.fail(rel, 'no repo-relative link — a layer routes to the files that own its details, it does not restate them');
      }
      copies(rel, text);
    }

    // ---- nested layers ------------------------------------------------------
    const nested = nestedDirs(ctx.root);
    let nestedCount = 0;
    for (const d of nested) {
      const rel = `${d}/CLAUDE.md`;
      if (!wanted(rel)) continue;
      const abs = path.join(ctx.root, rel);
      if (!fs.existsSync(abs)) {
        ctx.fail(rel, `folder ${d}/ has no nested layer (see ${CONCEPT})`);
        continue;
      }
      nestedCount += 1;
      let text = fs.readFileSync(abs, 'utf8');
      checkLinks(rel, text);
      const count = text.split('\n').filter((l) => l.trim() !== '').length;
      if (count > NESTED_MAX_LINES) {
        ctx.fail(rel, `${count} lines, budget ${NESTED_MAX_LINES} — a nested layer this long holds a fact that wants a home`);
      }
      const prose = outsideFences(text);
      const state = NESTED_HEADINGS.map((h) => [h, headingFilled(prose, new RegExp(`^#{1,6}[ \\t]+${h}\\b`))] as const);
      const quoted = (hs: readonly string[]): string => `"${hs.join('", "')}"`;
      const missing = state.filter(([, filled]) => filled === null).map(([h]) => h);
      let empty = state.filter(([, filled]) => filled === false).map(([h]) => h);
      if (missing.length > 0 && ctx.fixing) {
        for (const h of missing) text = withSection(text, h);
        fs.writeFileSync(abs, text);
        ctx.fixed(rel, `opened ${quoted(missing)}`);
        empty = NESTED_HEADINGS.filter((h) => missing.includes(h) || empty.includes(h));
      } else if (missing.length > 0) {
        ctx.fail(rel, `no ${quoted(missing)} heading — a nested layer answers all four`);
      }
      if (empty.length > 0) ctx.fail(rel, `${quoted(empty)} is empty — a nested layer answers all four`);
      copies(rel, text);
    }

    if (!whole) return `[context-layers] ${layers + nestedCount} layer(s) in scope, ${links} links resolve`;

    // ---- placement ----------------------------------------------------------
    const entries = readAllowlist(ctx, ALLOWLIST, {
      missing: 'the context-layers gate reads its placement exceptions from here, even when there are none',
      emptyReason: 'has an empty reason — say why the layer may sit off the governed set, and when it goes',
    });
    if (entries === null) return '';
    const list = new Allowlist(entries);
    const allowed = new Set([
      'CLAUDE.md',
      ...governed.map((d) => `${d}/CLAUDE.md`),
      ...EXTRA_DIR_LAYERS.map((d) => `${d}/CLAUDE.md`),
      ...nested.map((d) => `${d}/CLAUDE.md`),
    ]);
    let excused = 0;
    for (const f of findLayers(ctx.root)) {
      if (allowed.has(f)) continue;
      // The allowlist excuses where a layer sits, not what it says: its links
      // and its copies of the root are held like any other layer's.
      const text = fs.readFileSync(path.join(ctx.root, f), 'utf8');
      checkLinks(f, text);
      copies(f, text);
      if (list.excuses(f)) {
        excused += 1;
        continue;
      }
      ctx.fail(f, `a layer belongs at the root, at the top of a governed directory or in a nested-layer folder (see ${CONCEPT})`);
    }
    for (const e of list.unused()) {
      ctx.fail(ALLOWLIST, `entry "${e.name}" excuses nothing — its match ${e.match} names no stray layer; delete it`);
    }

    return (
      `[context-layers] root ${rootWords}/${ROOT_BUDGET} words, ${layers} directory layers within ${LAYER_BUDGET}, ` +
      `${nestedCount} nested within ${NESTED_MAX_LINES} lines, ${excused} excused by ${list.applied} ` +
      `allowlist ${list.applied === 1 ? 'entry' : 'entries'}, ${links} links resolve`
    );
  },
};

main(spec, import.meta.url);
