/**
 * The site's markup and its behaviour name the same hook attributes (spec
 * kb.site.components, hook-parity-gate; C3, C4).
 *
 * `data-kb-*` is the only wiring between a component's two halves: its markup
 * writes the attribute and its module queries it. Nothing else checks the
 * join, and a client test builds its own markup, so renaming a hook in the
 * `.astro` leaves every test green while the behaviour on the real page goes
 * silently dead. This gate reads both sides as text, needing neither a build
 * nor a browser, and holds the join both ways:
 *
 *   forward   a hook a behaviour module reads (an attribute selector, a
 *             literal or a constant handed to `getAttribute`/`hasAttribute`, a
 *             `dataset.kb…` read) that no markup emits is a finding in the
 *             module. A hook some module writes (`setAttribute`,
 *             `toggleAttribute`, a `dataset` assignment) is its own state and
 *             exempt: writes are pooled across modules, since they ship as one
 *             bundle.
 *   reverse   a hook markup emits that nothing reads is a finding in the
 *             markup. Readers are the behaviour modules, the stylesheets under
 *             site/src and the programs under tools/src (the post-build pass,
 *             the site gates and the page reader look for `data-kb-skip` and
 *             `data-kb-region`); this file is not one, since it names hooks in
 *             its own words. A hook kept only for a person or an agent reading
 *             the built page is excused by an entry, with its reason, in
 *             docs/data/allow/site-hooks.json.
 *
 * Markup is every `.astro` and `.mdx` under site/src that git does not ignore
 * (a generated hub is build output, not source), plus the markdown plugin in
 * tools/src/lib/site-markdown.ts, whose rehype half builds every diagram
 * figure and its buttons. That file is markup only: a hook it emits is never
 * read by the file itself, or a dead hook there would answer for itself. The
 * one exception is named in SELF_READ: the hook its remark half hands to its
 * rehype half, which reads it and takes it off before the page is written.
 *
 * Comments are blanked first on both sides, whole-line and trailing alike:
 * prose naming a hook is neither an emitter nor a reader. A TypeScript file,
 * and the frontmatter and script bodies of a template, are read by
 * TypeScript's own parser for this, so a `//` inside a string, a regular
 * expression or a template literal is never taken for a comment.
 *
 * Usage: check-site-hooks   (no arguments: the join is always read whole)
 */

import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { Allowlist, readAllowlist } from '../lib/allowlist.js';
import { gitFiles } from '../lib/exec.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';

export const SITE_SRC = 'site/src';
export const TOOLS_SRC = 'tools/src';
/** Markup that is not a template: the rehype plugin building each diagram figure. */
export const EXTRA_MARKUP = ['tools/src/lib/site-markdown.ts'] as const;
/**
 * The hooks a markup file hands to itself and reads back, by file: the
 * plugin's remark half marks a wide diagram and its rehype half reads the
 * mark and takes it off. Nothing else in these files counts as a read.
 */
export const SELF_READ: Readonly<Record<string, readonly string[]>> = {
  'tools/src/lib/site-markdown.ts': ['data-kb-wide'],
};
/** This gate names hooks in its prose; it must not answer for them. */
export const SELF = 'tools/src/gates/check-site-hooks.ts';
/** Hooks kept for a reader no program is, each with its reason. */
export const ALLOWLIST = 'docs/data/allow/site-hooks.json';

const ATTR = String.raw`data-kb-[a-z0-9-]+`;

export type UseKind = 'read' | 'write';
export interface HookUse {
  readonly name: string;
  readonly line: number;
  readonly kind: UseKind;
}

/** How a file's comments are written. */
export type Lang = 'ts' | 'markup' | 'css';

const blank = (m: string): string => m.replace(/[^\n]/g, ' ');

/** Blank the given [start, end) ranges of `source`, line breaks kept. */
function blankRanges(source: string, ranges: Iterable<readonly [number, number]>): string {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let out = '';
  let at = 0;
  for (const [start, end] of sorted) {
    if (start < at) continue;
    out += source.slice(at, start) + blank(source.slice(start, end));
    at = end;
  }
  return out + source.slice(at);
}

/**
 * Every comment in a piece of TypeScript, read by TypeScript's parser: each
 * token's leading and trailing comments, so none is missed and a `//` inside
 * a string, a regular expression or a template literal is never one.
 */
function tsComments(source: string): Map<number, number> {
  const file = ts.createSourceFile('hooks.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out = new Map<number, number>();
  const visit = (node: ts.Node): void => {
    for (const r of ts.getLeadingCommentRanges(source, node.getFullStart()) ?? []) out.set(r.pos, r.end);
    for (const r of ts.getTrailingCommentRanges(source, node.getEnd()) ?? []) out.set(r.pos, r.end);
    for (const child of node.getChildren(file)) visit(child);
  };
  visit(file);
  return out;
}

/** The script parts of a template: its frontmatter and each `<script>` body, as [start, end). */
function scriptParts(source: string): [number, number][] {
  const out: [number, number][] = [];
  const front = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  if (front !== null) {
    const start = source.indexOf('\n') + 1;
    out.push([start, start + (front[1] as string).length]);
  }
  for (const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    const start = m.index + m[0].indexOf('>') + 1;
    out.push([start, start + (m[1] as string).length]);
  }
  return out;
}

/**
 * Comments blanked, byte offsets kept, so line numbers survive. TypeScript is
 * read by its parser; a template's frontmatter and script bodies the same way,
 * its markup for `<!-- … -->` and `{/* … *\/}`; a stylesheet for `/* … *\/`.
 */
export function stripComments(source: string, lang: Lang = 'ts'): string {
  if (lang === 'css') return source.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (lang === 'ts') return blankRanges(source, tsComments(source));
  const ranges: [number, number][] = [];
  for (const [start, end] of scriptParts(source)) {
    for (const [a, b] of tsComments(source.slice(start, end))) ranges.push([start + a, start + b]);
  }
  for (const m of source.matchAll(/<!--[\s\S]*?-->|\{\/\*[\s\S]*?\*\/\}/g)) ranges.push([m.index, m.index + m[0].length]);
  return blankRanges(source, ranges);
}

/** The comment style a file is written in, by its name. */
export function langOf(rel: string): Lang {
  if (rel.endsWith('.css')) return 'css';
  return rel.endsWith('.astro') || rel.endsWith('.mdx') ? 'markup' : 'ts';
}

const lineAt = (source: string, index: number): number => source.slice(0, index).split('\n').length;

/** `kbMenuOpen` as the DOM spells it back: `data-kb-menu-open`. */
const fromDataset = (key: string): string => `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** `const OPEN = 'data-kb-menu-open'`: the name a call site refers to later. */
function attrConstants(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = new RegExp(String.raw`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*['"\`](${ATTR})['"\`]`, 'g');
  for (const m of source.matchAll(re)) out.set(m[1] as string, m[2] as string);
  return out;
}

/** Every `data-kb-*` a behaviour module touches, and whether it reads or writes it. */
export function hookUses(source: string): HookUse[] {
  const src = stripComments(source, 'ts');
  const uses: HookUse[] = [];
  const add = (name: string, index: number, kind: UseKind): void => {
    uses.push({ name, line: lineAt(src, index), kind });
  };
  for (const m of src.matchAll(new RegExp(String.raw`\[\s*(${ATTR})`, 'g'))) add(m[1] as string, m.index, 'read');
  const constants = attrConstants(src);
  const api = new RegExp(String.raw`\.(get|has|set|remove|toggle)Attribute\(\s*(?:['"\`](${ATTR})['"\`]|([A-Za-z_$][\w$]*))`, 'g');
  for (const m of src.matchAll(api)) {
    const name = m[2] ?? constants.get(m[3] as string);
    if (name === undefined) continue;
    const verb = m[1] as string;
    add(name, m.index, verb === 'get' || verb === 'has' ? 'read' : 'write');
  }
  for (const m of src.matchAll(/\.dataset\.(kb[A-Z][A-Za-z0-9]*)\s*(=(?!=))?/g)) {
    add(fromDataset(m[1] as string), m.index, m[2] === undefined ? 'read' : 'write');
  }
  return uses;
}

/** Every `data-kb-*` a markup file emits, with its line. */
export function markupHooks(source: string, lang: Lang = 'markup'): { name: string; line: number }[] {
  const src = stripComments(source, lang);
  return [...src.matchAll(new RegExp(ATTR, 'g'))].map((m) => ({ name: m[0], line: lineAt(src, m.index) }));
}

/** A behaviour module: the bundle's own code, never a test of it. */
export function isClientModule(rel: string): boolean {
  if (!rel.startsWith(`${SITE_SRC}/`) || rel.includes('.test.')) return false;
  return rel.endsWith('.client.ts') || (rel.startsWith(`${SITE_SRC}/client/`) && rel.endsWith('.ts'));
}

const isMarkup = (rel: string): boolean =>
  rel.startsWith(`${SITE_SRC}/`) && !rel.includes('.test.') && (rel.endsWith('.astro') || rel.endsWith('.mdx'));

/**
 * Everything that reads a hook other than a behaviour module: stylesheets and
 * programs. Never this gate, and never a markup file: what it emits is not
 * also what it reads (SELF_READ names the one exception).
 */
const isTextReader = (rel: string): boolean =>
  rel !== SELF &&
  !(EXTRA_MARKUP as readonly string[]).includes(rel) &&
  ((rel.startsWith(`${SITE_SRC}/`) && rel.endsWith('.css')) ||
    (rel.startsWith(`${TOOLS_SRC}/`) && rel.endsWith('.ts') && !rel.endsWith('.test.ts')));

/** The first read of each name in one module, writes exempt. */
function firstReads(uses: readonly HookUse[], written: ReadonlySet<string>): HookUse[] {
  const seen = new Set<string>();
  return uses.filter((u) => {
    if (u.kind !== 'read' || written.has(u.name) || seen.has(u.name)) return false;
    seen.add(u.name);
    return true;
  });
}

export const spec: GateSpec = {
  name: 'site-hooks',
  usage: 'usage: check-site-hooks   (no arguments: the join is always read whole)',
  run(ctx: GateContext): string {
    const entries = readAllowlist(ctx, ALLOWLIST, {
      missing: 'this gate reads the hooks kept for a reader of the built page from here, even when there are none',
      emptyReason: 'has an empty reason — say who reads the hook, since no program does',
    });
    if (entries === null) return '';
    const excused = new Allowlist(entries);

    const files = gitFiles(ctx.root, [SITE_SRC, TOOLS_SRC]).filter((rel) => fs.existsSync(path.join(ctx.root, rel)));
    const read = (rel: string): string => fs.readFileSync(path.join(ctx.root, rel), 'utf8');
    const clients = files.filter(isClientModule);
    const markup = [...files.filter(isMarkup), ...EXTRA_MARKUP.filter((rel) => files.includes(rel))];

    const emitted: { file: string; name: string; line: number }[] = [];
    for (const rel of markup) for (const h of markupHooks(read(rel), langOf(rel))) emitted.push({ file: rel, ...h });
    const emittedNames = new Set(emitted.map((e) => e.name));

    // Forward: what a module reads, some markup must emit.
    const uses = new Map<string, HookUse[]>();
    const written = new Set<string>();
    for (const rel of clients) {
      const found = hookUses(read(rel));
      uses.set(rel, found);
      for (const u of found) if (u.kind === 'write') written.add(u.name);
    }
    let queried = 0;
    for (const [rel, found] of uses) {
      for (const use of firstReads(found, written)) {
        queried += 1;
        if (emittedNames.has(use.name)) continue;
        ctx.fail(rel, `${use.name} is queried here and no site markup emits it — the selector matches nothing, so this behaviour never runs`, use.line);
      }
    }

    // Reverse: what markup emits, something must read.
    const readers = new Set<string>();
    for (const found of uses.values()) for (const u of found) readers.add(u.name);
    for (const rel of files.filter(isTextReader)) {
      for (const m of stripComments(read(rel), langOf(rel)).matchAll(new RegExp(ATTR, 'g'))) readers.add(m[0]);
    }
    for (const [rel, names] of Object.entries(SELF_READ)) {
      if (!markup.includes(rel)) continue;
      const own = new Set(emitted.filter((e) => e.file === rel).map((e) => e.name));
      for (const name of names) {
        if (own.has(name)) readers.add(name);
        else ctx.fail(SELF, `SELF_READ names ${name} for ${rel}, which no longer emits it — take it out of the list`);
      }
    }
    const said = new Set<string>();
    for (const e of emitted) {
      if (readers.has(e.name) || said.has(e.name)) continue;
      said.add(e.name);
      if (excused.excuses(e.name)) continue;
      ctx.fail(
        e.file,
        `${e.name} is emitted here and nothing reads it — no module queries it, no stylesheet keys on it, no program looks for it. Rename it back, delete it, or excuse it in ${ALLOWLIST} with the reader it is for`,
        e.line,
      );
    }
    for (const entry of excused.unused()) {
      ctx.fail(ALLOWLIST, `entry "${entry.name}" excuses nothing — no markup emits an unread ${entry.match}; delete the entry`);
    }

    return `[site-hooks] ${clients.length} behaviour modules and ${markup.length} markup files name the same hooks: ${queried} queried, ${emittedNames.size} emitted, ${excused.applied} kept for a reader`;
  },
};

main(spec, import.meta.url);
