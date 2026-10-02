/**
 * Every JSON file in the tree parses, and every data file opens with its
 * source header (spec: kb.data.source-file, json-validity).
 *
 * One process reads every file, each finding names the file and the line, and
 * the CI problem matcher puts the annotation on the right row of the diff. A
 * shell loop over `jq empty` either spawns one process per file or, batched,
 * reports a parse error against its stdin position rather than the file it
 * was reading.
 *
 * Files under `docs/data/` are the single sources every generator and gate
 * reads, so they owe more than parsing: their first three keys are `version`
 * (an integer), `updated` (a year-month-day date) and `note` (a non-empty
 * string), in that order, before any data.
 *
 * The excludes live here and nowhere else (source-file-C2): a second copy in a
 * pipeline is how local and CI come to disagree about which files are checked.
 *
 * Usage: check-json [file…]   (no arguments: every JSON file git can see)
 */

import fs from 'node:fs';
import path from 'node:path';

import { gitFiles } from '../lib/exec.js';
import { main, UsageError, type GateContext, type GateSpec } from '../lib/gate.js';

/**
 * Trees that hold JSON this repo did not write, or wrote as output.
 * `node_modules` at any depth; the scratch space; the site's build products.
 */
export const EXCLUDED = ['tmp/', 'site/dist/', 'site/.astro/'];

/** The folder whose JSON files are data files, owing the source header. */
export const DATA_DIR = 'docs/data/';

/** The source header's keys, in the order a data file must open with them. */
export const HEADER = ['version', 'updated', 'note'] as const;

export function isExcluded(file: string): boolean {
  if (file.split('/').includes('node_modules')) return true;
  return EXCLUDED.some((p) => file.startsWith(p));
}

/**
 * Where a `JSON.parse` failure happened, as a 1-indexed line.
 *
 * V8's message carries the byte offset (`… at position 42`) and, since Node
 * 20, the line and column too. Read the line when it is offered and derive it
 * from the position otherwise, so the finding keeps its row on the diff
 * whichever shape the runtime hands back.
 */
export function errorLine(message: string, text: string): number | undefined {
  const explicit = /\bline (\d+)\b/.exec(message);
  if (explicit) return Number(explicit[1]);
  const pos = /\bposition (\d+)\b/.exec(message);
  if (!pos) return undefined;
  const offset = Number(pos[1]);
  return text.slice(0, offset).split('\n').length;
}

/** The parse error, minus the position clause the line number already carries. */
export function tidy(message: string): string {
  return message
    .replace(/\s*\(?\bat position \d+\b[^)]*\)?/, '')
    .replace(/\s*in JSON\b/, '')
    .trim();
}

/**
 * What is wrong with a parsed data file's source header, or nothing.
 *
 * One message per file, naming the first thing wrong: the header is three
 * keys, and a file that gets one wrong usually gets the order wrong too.
 */
export function headerProblem(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'is not a JSON object, so it cannot open with the source header version, updated, note';
  }
  const record = value as Record<string, unknown>;
  const first = Object.keys(record).slice(0, HEADER.length);
  if (first.join(',') !== HEADER.join(',')) {
    return (
      `opens with ${first.length === 0 ? 'no keys' : first.join(', ')} — a data file opens with ` +
      'version, updated, note, in that order, before any data'
    );
  }
  if (!Number.isInteger(record['version'])) return 'version is not an integer';
  const updated = record['updated'];
  if (typeof updated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(updated) || Number.isNaN(Date.parse(updated))) {
    return 'updated is not a year-month-day date';
  }
  const note = record['note'];
  if (typeof note !== 'string' || note.trim() === '') {
    return 'note is empty — say who reads this file, what they derive, and what an editor owes';
  }
  return null;
}

export const spec: GateSpec = {
  name: 'json-sanity',
  usage: 'usage: check-json [file…]   (no arguments: every JSON file git can see)',
  positional: true,
  run(ctx: GateContext): string {
    for (const f of ctx.args) {
      if (!fs.existsSync(path.join(ctx.root, f))) throw new UsageError(`no such file: ${f}`);
    }
    // Named files narrow the scan and never widen it: a name that is not JSON,
    // or sits in an excluded tree, is dropped rather than read.
    const files =
      ctx.args.length > 0
        ? ctx.args.filter((f) => f.endsWith('.json') && !isExcluded(f))
        : gitFiles(ctx.root, ['*.json', '**/*.json']).filter((f) => !isExcluded(f));

    if (ctx.args.length === 0 && files.length === 0) {
      ctx.failLine('no JSON files found — the scan set is wrong');
      return '';
    }

    let scanned = 0;
    let headers = 0;
    for (const f of files) {
      const abs = path.join(ctx.root, f);
      let text: string;
      try {
        if (!fs.statSync(abs).isFile()) continue;
        text = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      scanned += 1;
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch (e) {
        // JSON.parse throws a SyntaxError and nothing else.
        const message = (e as SyntaxError).message;
        ctx.fail(f, `is not valid JSON: ${tidy(message)}`, errorLine(message, text));
        continue;
      }
      if (!f.startsWith(DATA_DIR)) continue;
      headers += 1;
      const problem = headerProblem(value);
      if (problem !== null) ctx.fail(f, problem, 1);
    }

    return `[json-sanity] ${scanned} JSON files parse; ${headers} data files open with their source header`;
  },
};

main(spec, import.meta.url);
