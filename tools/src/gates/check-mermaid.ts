/**
 * Every ```mermaid fence under `docs/` parses (the fast diagram gate).
 *
 * A broken diagram fails quietly. mermaid catches its own parse error and
 * paints a placeholder, so the page builds and every other gate stays green;
 * before this gate only the site build, which draws each diagram in headless
 * Chromium and takes minutes, found one. This gate runs the same mermaid the
 * build draws with (`node_modules/mermaid`, the version rehype-mermaid loads)
 * through `mermaid.parse`, which runs the grammar and never lays anything out:
 * about half a second for the whole tree.
 *
 * mermaid's parser hands labels to DOMPurify, which in Node has no window and
 * throws for class, state and mindmap diagrams before their grammar has run.
 * So the gate gives it one, a happy-dom `Window`, before it loads mermaid: a
 * grammar error is then the only way `parse` throws.
 *
 * What counts as a fence: a fenced block whose info string starts with the
 * word `mermaid`, read by the one markdown line reader (`lib/md-lines.ts`), so
 * a fence indented under a list item counts and a fence in the frontmatter
 * does not. The fence's own indent is taken off each line before parsing.
 *
 * A finding names the file and the line mermaid blames, counted from the
 * file's top: `<file>:<line>: diagram does not parse — <mermaid's first line>`.
 *
 * Usage: check-mermaid [file ...]   (no files: every markdown file under docs/)
 */

import fs from 'node:fs';
import path from 'node:path';

import { gitFiles } from '../lib/exec.js';
import { main, UsageError, type GateContext, type GateSpec } from '../lib/gate.js';
import { indentOf, mdLines } from '../lib/md-lines.js';

export const NAME = 'mermaid-parse';

/** Where the pages are. */
export const SCOPE = ['docs/*.md', 'docs/**/*.md'];

/** One ```mermaid fence: the line its first diagram line sits on, and its text. */
export interface Fence {
  /** 1-based line of the fence's first content line. */
  readonly line: number;
  readonly source: string;
}

/** A fence's opening line: its run of backticks or tildes, then its info string. */
const OPEN = /^[ \t]*(`{3,}|~{3,})[ \t]*(\S*)/;

/** Every mermaid fence in one markdown text, in order. An unclosed fence runs to the end. */
export function fencesOf(text: string): Fence[] {
  const out: Fence[] = [];
  let open: { char: string; length: number; indent: number; line: number; mermaid: boolean; body: string[] } | null = null;
  const done = (): void => {
    if (open?.mermaid === true) out.push({ line: open.line, source: open.body.join('\n') });
    open = null;
  };
  for (const l of mdLines(text)) {
    if (open === null) {
      if (l.zone !== 'fence') continue;
      const m = OPEN.exec(l.text) as RegExpExecArray;
      const run = m[1] as string;
      open = { char: run[0] as string, length: run.length, indent: indentOf(l.text), line: l.no + 1, mermaid: m[2] === 'mermaid', body: [] };
      continue;
    }
    const close = new RegExp(`^[ \\t]*${open.char === '`' ? '`' : '~'}{${String(open.length)},}[ \\t]*$`);
    if (close.test(l.text)) {
      done();
      continue;
    }
    open.body.push(l.text.slice(Math.min(open.indent, indentOf(l.text))));
  }
  done();
  return out;
}

/** mermaid's first message line, and the diagram line it names, if any. */
export function describe(err: unknown): { what: string; at: number | null } {
  const msg = err instanceof Error ? err.message : String(err);
  const first = (msg.split('\n', 1)[0] as string).trim();
  const m = /on line (\d+)/.exec(first);
  return { what: first === '' ? 'mermaid gave no message' : first, at: m === null ? null : Number(m[1]) };
}

type Parse = (text: string) => Promise<unknown>;

let parser: Promise<Parse> | null = null;

/** mermaid's `parse`, loaded once, after a DOM window exists for DOMPurify. */
export function loadParser(): Promise<Parse> {
  parser ??= (async () => {
    const { Window } = await import('happy-dom');
    // A window some other module already made is kept: DOMPurify only needs one.
    (globalThis as { window?: unknown }).window ??= new Window();
    const { default: mermaid } = await import('mermaid');
    return (text: string) => mermaid.parse(text);
  })();
  return parser;
}

export const spec: GateSpec = {
  name: NAME,
  usage: 'usage: check-mermaid [file ...]   (no files: every markdown file under docs/)',
  positional: true,
  async run(ctx: GateContext): Promise<string> {
    let files: string[];
    if (ctx.args.length > 0) {
      for (const f of ctx.args) {
        if (!fs.existsSync(path.join(ctx.root, f))) throw new UsageError(`no such file: ${f}`);
      }
      files = [...ctx.args];
    } else {
      files = gitFiles(ctx.root, SCOPE).filter((f) => fs.existsSync(path.join(ctx.root, f)));
    }
    const parse = await loadParser();
    let diagrams = 0;
    let withDiagrams = 0;
    for (const file of files) {
      const fences = fencesOf(fs.readFileSync(path.join(ctx.root, file), 'utf8'));
      if (fences.length > 0) withDiagrams += 1;
      for (const f of fences) {
        diagrams += 1;
        try {
          await parse(f.source);
        } catch (err) {
          const { what, at } = describe(err);
          ctx.fail(file, `diagram does not parse — ${what}`, at === null ? f.line : f.line + at - 1);
        }
      }
    }
    return `[${NAME}] ${String(diagrams)} mermaid diagram(s) in ${String(withDiagrams)} of ${String(files.length)} markdown file(s) parse`;
  },
};

main(spec, import.meta.url);
