/**
 * Reading a data file the way a gate must: a file that does not parse is one
 * named finding, never a crash and never a silent pass (spec: kb.data,
 * data-C3), and every later finding can point at the line of the record it is
 * about, so the problem matcher lands the annotation on the right row of the
 * diff rather than on line 1 of a 20,000-line file.
 *
 *   readDataJson   parse a repo file, or record the one finding that says why
 *                  it cannot be read; `missing` when it is not there at all,
 *                  so each gate decides what absence means for it
 *   jsonLines      the 1-based line every value of a parsed JSON text starts
 *                  on, keyed by its JSON pointer (RFC 6901): `/relations/12`,
 *                  `/notes/~1patterns~1a.html/starting`
 *   pointer        build such a key from its segments, escaping `~` and `/`
 *   needDataObject readDataJson for a file the caller cannot do without: a
 *                  missing file, or one that is not a JSON object, is a
 *                  finding too, and the answer is null
 *   printData      the bytes a generator writes a data file as: two-space
 *                  indentation, and a list of scalars on one line
 *   headDate       the committer date of HEAD, the one date a file carries
 *   dataDate       the `updated` a generated data file carries: the date on
 *                  disk while nothing else in the file changes, else HEAD's
 *                  (dialect D-05, X-20)
 */

import fs from 'node:fs';
import path from 'node:path';

import { errorLine, tidy } from '../gates/check-json.js';
import { run } from './exec.js';
import type { GateContext } from './gate.js';

export type DataRead = { readonly value: unknown; readonly text: string } | 'missing' | 'invalid';

/**
 * Parse `rel` under the repo root. A parse failure is recorded as one finding
 * at the line the parser names; the caller reads `invalid` and stops using
 * the file.
 */
export function readDataJson(ctx: GateContext, rel: string): DataRead {
  const abs = path.join(ctx.root, rel);
  if (!fs.existsSync(abs)) return 'missing';
  const text = fs.readFileSync(abs, 'utf8');
  try {
    return { value: JSON.parse(text) as unknown, text };
  } catch (e) {
    const message = (e as Error).message;
    // V8 quotes the offending text, raw newlines and all; a finding is one line.
    ctx.fail(rel, `is not valid JSON — ${tidy(message).replace(/\s+/g, ' ')}`, errorLine(message, text));
    return 'invalid';
  }
}

/**
 * A data file the caller cannot work without, as an object. Missing, not
 * JSON, or not an object: one finding naming it, `why` saying what depends on
 * it, and null.
 */
export function needDataObject(ctx: GateContext, rel: string, why: string): Record<string, unknown> | null {
  const read = readDataJson(ctx, rel);
  if (read === 'missing') ctx.fail(rel, `is missing — ${why}`);
  if (typeof read === 'string') return null;
  if (typeof read.value !== 'object' || read.value === null || Array.isArray(read.value)) {
    ctx.fail(rel, 'is not a JSON object');
    return null;
  }
  return read.value as Record<string, unknown>;
}

/** One JSON pointer, from its unescaped segments. `pointer()` is the root, `''`. */
export function pointer(...segments: readonly (string | number)[]): string {
  return segments.map((s) => `/${String(s).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
}

/**
 * The line each value of `text` starts on, by JSON pointer. `text` must be
 * JSON that `JSON.parse` accepted: the scan trusts the grammar and does not
 * re-validate it. A string cannot hold a raw newline, so lines are counted in
 * the whitespace between tokens alone.
 */
export function jsonLines(text: string): Map<string, number> {
  const out = new Map<string, number>();
  let i = 0;
  let line = 1;

  const space = (): void => {
    for (;;) {
      const c = text[i];
      if (c === '\n') line += 1;
      else if (c !== ' ' && c !== '\t' && c !== '\r') return;
      i += 1;
    }
  };
  const string = (): string => {
    const start = i;
    i += 1;
    while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i += 1;
    return JSON.parse(text.slice(start, i)) as string;
  };
  /** After a member or element: step over `,` and say whether another follows. */
  const more = (): boolean => {
    space();
    i += 1;
    return text[i - 1] === ',';
  };
  const value = (at: string): void => {
    space();
    out.set(at, line);
    const c = text[i];
    if (c === '{' || c === '[') {
      i += 1;
      space();
      if (text[i] === (c === '{' ? '}' : ']')) {
        i += 1;
        return;
      }
      for (let n = 0; ; n += 1) {
        if (c === '{') {
          const key = string();
          space();
          i += 1; // the colon
          value(`${at}${pointer(key)}`);
        } else {
          value(`${at}${pointer(n)}`);
        }
        if (!more()) return;
        space();
      }
    }
    if (c === '"') {
      string();
      return;
    }
    while (i < text.length && !/[\s,\]}]/.test(text[i] as string)) i += 1;
  };

  value('');
  return out;
}

/**
 * A generated data file's bytes: two-space indentation, a list of scalars on
 * one line (`["a", "b"]`), a trailing newline. The layout follows the value's
 * shape and never a line width, so it is deterministic; `jsonLines` reads it
 * like any other JSON.
 */
export function printData(value: unknown): string {
  const scalar = (v: unknown): boolean => v === null || typeof v !== 'object';
  const fmt = (v: unknown, indent: string): string => {
    if (scalar(v)) return JSON.stringify(v);
    const inner = `${indent}  `;
    if (Array.isArray(v)) {
      if (v.every(scalar)) return `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
      return `[\n${v.map((x) => inner + fmt(x, inner)).join(',\n')}\n${indent}]`;
    }
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${fmt(x, inner)}`).join(',\n')}\n${indent}}`;
  };
  return `${fmt(value, '')}\n`;
}

/** The committer date of HEAD, `YYYY-MM-DD`, or null where there is no commit to read it from. */
export function headDate(root: string): string | null {
  const r = run('git', ['log', '-1', '--format=%cs', 'HEAD'], root);
  const date = r.stdout.trim();
  return r.status === 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** The header's `updated` line as the data printers write it. */
const UPDATED_LINE = /^ {2}"updated": "(\d{4}-\d{2}-\d{2})",$/m;

/**
 * The `updated` date a generated data file is written with. `print` gives the
 * file's bytes for a date. While the file on disk is exactly `print(<its own
 * date>)`, it keeps that date, so a later commit alone never makes it stale
 * to its own `--check`; any other changed byte takes the committer date of
 * HEAD at this run (dialect D-05, X-20), never the clock. Null when the
 * content changed and there is no commit to date it by.
 */
export function dataDate(root: string, rel: string, print: (updated: string) => string): string | null {
  const abs = path.join(root, rel);
  const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  const had = current === null ? undefined : UPDATED_LINE.exec(current)?.[1];
  if (had !== undefined && print(had) === current) return had;
  return headDate(root);
}
