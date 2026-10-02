/**
 * Every link in the repository's markdown leads somewhere (spec:
 * kb.gates.link-integrity, repo-gate). Renames, reworded headings and moved
 * anchors leave links that read as working and go nowhere; this gate is what
 * says so before a reader finds out.
 *
 * What it reads: every markdown file git lists (`*.md`, `*.mdx`), committed or
 * not, minus built output and installed dependencies (link-integrity-C1). It
 * never reads the built site (C9). Each file is read, and its anchor set
 * built, once per run (C10).
 *
 * What a link is: an inline link or image, `[label](target)`, read by
 * `inlineLinks` in lib/links.ts. The frontmatter block, code (fenced or
 * indented), inline code spans and HTML comments hold no links (C1): they are
 * blanked before the read, line for line, so a finding keeps its line.
 *
 * How a target resolves (link-resolver, the rule both link gates share):
 * `isExternal` targets are somebody else's; a root-absolute one (`/x`) is a
 * site route and skipped; the rest drops its query and fragment and resolves
 * from the linking file's folder. Then (C2-C4):
 *
 *   missing   a target that is not on disk with the case it is written in,
 *             or that climbs out of the repository, is a finding on its
 *             line. A directory is present.
 *   anchor    a fragment into a markdown file, or a bare `#fragment`, must be
 *             in that file's anchor set. A fragment into any other file type
 *             is not checked.
 *   label     a label that is only a path — a slash and an extension, in
 *             backticks or not — names its target: resolved from the linking
 *             file's folder, the repository root or the page tree, it must be
 *             the file the link goes to. A basename, a directory, a sentence
 *             and an image's text claim nothing.
 *
 * A markdown file's anchor set: the slug of every heading outside code, ATX
 * or setext (the heading's text as a reader sees it, emphasis marks gone,
 * lower-cased, punctuation dropped, each space a hyphen; a repeat gains -1,
 * -2), every `id` and `name` attribute value, and on a
 * page under the page tree every id the markdown dialect gives an element —
 * a block heading's block name, an explicit `{#id}`, a positional id
 * (lib/kb-attrs.ts). That last part is how a citation such as
 * `circuit-breaker.md#tradeoffs-con-2` holds.
 *
 * Findings are `[repo-links] FAIL <file>:<line>: <what>`, naming the resolved
 * target and any fragment that failed. Named files narrow the files whose
 * links are read; every target is still resolved against the whole tree.
 *
 * Usage: check-repo-links [file …]   (0 pass · 1 findings · 2 misuse)
 */

import fs from 'node:fs';
import path from 'node:path';

import { gitFiles } from '../lib/exec.js';
import { main, UsageError, type GateContext, type GateSpec } from '../lib/gate.js';
import { deriveElements, parseKb, splitTrailingSuffix } from '../lib/kb-attrs.js';
import { inlineLinks, isExternal, onDiskExactly, splitTarget } from '../lib/links.js';
import { blankFrontmatter, blankInline, outsideCode } from '../lib/md-lines.js';

export const NAME = 'repo-links';

/** The page tree: its pages also offer the ids the markdown dialect gives. */
export const PAGE_TREE = 'docs/';

/** What git lists that this gate reads. */
export const MARKDOWN: readonly string[] = ['*.md', '*.mdx'];

/** Built output and installed dependencies: never read, even when git lists them. */
export const SKIP: readonly RegExp[] = [/(?:^|\/)node_modules\//, /^site\/dist\//, /^site\/\.astro\//];

/** A markdown file, whose fragments are checked. */
const IS_MARKDOWN = /\.mdx?$/;

// ---------------------------------------------------------------------------
// Anchors
// ---------------------------------------------------------------------------

const ATX = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?[ \t]*$/;
const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** A setext underline: up to three spaces, then a run of `=` or of `-`. */
const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;

/** A line that is no paragraph text: a list item, a quote, a table row, HTML, a heading or a rule. */
const NOT_PARAGRAPH = /^ {0,3}(?:[-*+](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$)|[>|<]|#{1,6}(?:[ \t]|$)|(?:[-*_][ \t]*){3,}$)/;

/**
 * Emphasis delimiters dropped, as a reader sees the text: `_x_`, `__x__`,
 * `*x*` and `**x**` become `x`, while an underscore inside a word stays, as in
 * snake_case. A code span keeps what it holds.
 */
export function withoutEmphasis(text: string): string {
  const pair = /(^|[^\p{L}\p{N}\\])(_{1,3}|\*{1,3})(?=\S)(.*?\S)\2(?![\p{L}\p{N}])/gu;
  return text
    .split(/(`+[^`]*`+)/)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      let out = part;
      for (let before = ''; before !== out; ) {
        before = out;
        out = out.replace(pair, '$1$3');
      }
      return out;
    })
    .join('');
}

/** A heading's raw text as a reader sees it: suffix, links, tags, entities, escapes and emphasis gone. */
function readerText(raw: string): string {
  const text = splitTrailingSuffix(raw)?.text ?? raw;
  return withoutEmphasis(
    text
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]*>/g, '')
      .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e] as string),
  ).replace(/\\([!-/:-@[-`{-~])/g, '$1');
}

/** An ATX heading line's text as a reader sees it, or null when the line is no heading. */
export function headingText(line: string): string | null {
  const m = ATX.exec(line);
  if (m === null) return null;
  return readerText((m[1] ?? '').replace(/(?:^|[ \t]+)#+$/, ''));
}

/**
 * Every heading of a body whose code is blanked, ATX and setext, in document
 * order. A setext heading is the paragraph above a line of `=` or `-`; a
 * `---` after a blank line is a rule, and one under a list item, a quote or
 * a table row is no underline.
 */
export function headingsOf(body: string): string[] {
  const out: string[] = [];
  let para: string[] = [];
  for (const line of body.split('\n')) {
    const atx = headingText(line);
    if (atx !== null) {
      out.push(atx);
      para = [];
    } else if (line.trim() === '') {
      para = [];
    } else if (para.length > 0 && SETEXT.test(line)) {
      out.push(readerText(para.map((l) => l.trim()).join(' ')));
      para = [];
    } else if (NOT_PARAGRAPH.test(line)) {
      para = [];
    } else {
      para.push(line);
    }
  }
  return out;
}

/** A heading's slug before repeats: lower-cased, punctuation dropped, each space a hyphen. */
export function slugOf(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
}

/** Heading slugs in document order, a repeat gaining -1, -2, as GitHub gives them. */
export function headingSlugs(headings: readonly string[]): string[] {
  const taken = new Map<string, number>();
  return headings.map((h) => {
    const base = slugOf(h);
    let slug = base;
    let n = taken.get(base);
    if (n !== undefined) {
      do {
        n += 1;
        slug = `${base}-${String(n)}`;
      } while (taken.has(slug));
      taken.set(base, n);
    }
    taken.set(slug, 0);
    return slug;
  });
}

/** Every anchor a markdown file offers a fragment. */
export function anchorSet(file: string, text: string): Set<string> {
  const body = outsideCode(text);
  const out = new Set(headingSlugs(headingsOf(body)));
  // An attribute of its own: `data-name="x"` names nothing a fragment can reach.
  for (const m of blankInline(body).matchAll(/(?<![\w-])(?:id|name)[ \t]*=[ \t]*(?:"([^"]*)"|'([^']*)')/g)) out.add(m[1] ?? (m[2] as string));
  if (file.startsWith(PAGE_TREE)) {
    for (const e of deriveElements(parseKb(blankFrontmatter(text)).tree)) if (e.id !== undefined) out.add(e.id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/**
 * The path a label claims, or null when it claims none: the label must be a
 * path and nothing else — optional backticks around text with no space, a
 * slash, and an extension (a fragment after it is dropped).
 */
export function labelPath(label: string): string | null {
  const bare = /^`([^`]*)`$/.exec(label.trim())?.[1] ?? label.trim();
  if (/[\s`[\]()]/.test(bare) || /^[a-z][a-z0-9+.-]*:/i.test(bare)) return null;
  const claimed = splitTarget(bare).path;
  return claimed.includes('/') && /\.[A-Za-z0-9]+$/.test(claimed) ? claimed : null;
}

/** The files a claimed path can name: from the linking file's folder, the root, the page tree. */
export function labelTargets(file: string, claimed: string): string[] {
  const p = path.posix;
  return [p.join(p.dirname(file), claimed), claimed.replace(/^\/+/, ''), p.join(PAGE_TREE, claimed)].map((x) => p.normalize(x));
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

const decode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export const spec: GateSpec = {
  name: NAME,
  usage: 'usage: check-repo-links [file ...]   (no files: every markdown file git lists)',
  positional: true,
  run(ctx: GateContext): string {
    const listed = gitFiles(ctx.root, MARKDOWN).filter((f) => !SKIP.some((re) => re.test(f)) && fs.existsSync(path.join(ctx.root, f)));
    const known = new Set(listed);
    const present = onDiskExactly(ctx.root);
    const named = ctx.args.map((f) => f.replace(/^\.\//, ''));
    const strays = named.filter((f) => !known.has(f));
    if (strays.length > 0) throw new UsageError(`not a markdown file git lists: ${strays.join(', ')}`);
    const files = named.length > 0 ? [...new Set(named)] : listed;

    const texts = new Map<string, string>();
    const read = (f: string): string => {
      let t = texts.get(f);
      if (t === undefined) {
        t = fs.readFileSync(path.join(ctx.root, f), 'utf8');
        texts.set(f, t);
      }
      return t;
    };
    const anchors = new Map<string, Set<string>>();
    const anchorsOf = (f: string): Set<string> => {
      let a = anchors.get(f);
      if (a === undefined) {
        a = anchorSet(f, read(f));
        anchors.set(f, a);
      }
      return a;
    };

    let checked = 0;
    for (const f of files) {
      const lined = outsideCode(read(f));
      const body = blankInline(lined);
      let line = 1;
      let pos = 0;
      for (const link of inlineLinks(body)) {
        for (; pos < link.at; pos += 1) if (body[pos] === '\n') line += 1;
        if (isExternal(link.target)) continue;
        const { path: target, fragment } = splitTarget(link.target);
        if (target.startsWith('/')) continue;
        checked += 1;
        const frag = fragment === null || fragment === '' ? null : decode(fragment);

        if (target === '') {
          if (frag !== null && !anchorsOf(f).has(frag)) ctx.fail(f, `links #${frag}, and this file has no heading or id "${frag}"`, line);
          continue;
        }
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(f), decode(target)));
        if (resolved === '..' || resolved.startsWith('../')) {
          ctx.fail(f, `links ${link.target}, which climbs out of the repository to ${resolved}`, line);
          continue;
        }
        const abs = path.join(ctx.root, resolved);
        if (!present(resolved)) {
          ctx.fail(f, `links ${resolved}, which does not exist`, line);
          continue;
        }
        const file = resolved.replace(/\/$/, '');
        if (frag !== null && IS_MARKDOWN.test(file) && fs.statSync(abs).isFile() && !anchorsOf(file).has(frag)) {
          ctx.fail(f, `links ${file}#${frag}, and ${file} has no heading or id "${frag}"`, line);
        }
        // The label as written: the blanked read hides a backticked label.
        const claimed = link.image ? null : labelPath(lined.slice(link.at - link.label.length, link.at));
        if (claimed !== null && !labelTargets(f, claimed).includes(file)) {
          ctx.fail(f, `the label names ${claimed}, and the link goes to ${file}`, line);
        }
      }
    }
    return `[${NAME}] OK — ${String(checked)} link(s) in ${String(files.length)} markdown file(s) lead somewhere`;
  },
};

main(spec, import.meta.url);
