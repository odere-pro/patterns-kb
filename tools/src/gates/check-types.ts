/**
 * The tools workspace type-checks.
 *
 * Every gate and generator runs through tsx, which strips types without
 * checking them, so a type error ships silently unless something runs `tsc`.
 * `npm run typecheck` does, but it is not a gate: npm swallows an unknown flag
 * and exits 0, and tsc prints its diagnostics on stdout in its own shape. This
 * wrapper keeps the contract (kb.gates.contract): one summary line when clean,
 * one `[typecheck] FAIL <file>:<line>: <what>` per diagnostic on stderr, exit 2
 * on misuse — so the driver, the problem matcher and the triage page read it
 * like every other gate.
 *
 * It counts the files under `tools/` the compiler read, so the case against the
 * real tree can hold that number to a count of its own.
 *
 * Usage: check-types   (takes no arguments: the project is the tsconfig's)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from '../lib/exec.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';

/** The project the compiler reads, and the folder its paths are relative to. */
export const WORKSPACE = 'tools';
export const PROJECT = `${WORKSPACE}/tsconfig.json`;

/**
 * The compiler, resolved beside this package rather than inside the tree being
 * checked: a gate pointed at a sandbox still compiles with the one real tsc.
 */
const TSC = path.resolve(fileURLToPath(import.meta.url), '../../../../node_modules/.bin/tsc');

/** One compiler diagnostic, with its file relative to the project folder. */
export interface Diagnostic {
  file: string | null;
  line: number | null;
  code: string;
  message: string;
}

/**
 * Read `tsc --pretty false` output: `path(line,col): error TSnnnn: message`,
 * or `error TSnnnn: message` for one about no file. Indented continuation
 * lines belong to the diagnostic above them and are dropped: the first line
 * says what is wrong, and the file and line say where to read the rest.
 */
export function parseDiagnostics(output: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const line of output.split('\n')) {
    const located = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(line);
    if (located) {
      out.push({
        file: located[1] as string,
        line: Number(located[2]),
        code: located[3] as string,
        message: located[4] as string,
      });
      continue;
    }
    const global = /^error (TS\d+): (.*)$/.exec(line);
    if (global) out.push({ file: null, line: null, code: global[1] as string, message: global[2] as string });
  }
  return out;
}

export const spec: GateSpec = {
  name: 'typecheck',
  usage: 'usage: check-types   (takes no arguments: the project is tools/tsconfig.json)',
  run(ctx: GateContext): string {
    const dir = path.join(ctx.root, WORKSPACE);
    if (!fs.existsSync(path.join(ctx.root, PROJECT))) {
      ctx.fail(PROJECT, 'is missing — the type check compiles the project it describes');
      return '';
    }
    const r = run(TSC, ['--noEmit', '--pretty', 'false', '--listFiles', '-p', 'tsconfig.json'], dir);
    const output = `${r.stdout}\n${r.stderr}`;

    for (const d of parseDiagnostics(output)) {
      const what = `${d.code} ${d.message}`;
      if (d.file === null) {
        ctx.failLine(what);
        continue;
      }
      const rel = path.relative(ctx.root, path.resolve(dir, d.file)).split(path.sep).join('/');
      // `d.line` is `number | null` on the interface, matching the "no file"
      // diagnostic's shape, but the regex that built this one captured a line
      // number in the same match as the file — the two are set together, so
      // the file being non-null already guarantees the line is too.
      ctx.fail(rel, what, d.line as number);
    }
    if (r.status !== 0 && ctx.findings === 0) {
      // `split('\n')` on any string, empty included, always answers at least
      // one element, so `.at(-1)` is never the array's `undefined`.
      const tail = output.trim().split('\n').at(-1) as string;
      ctx.failLine(`tsc exited ${r.status} and named no diagnostic — its last line: ${tail}`);
    }

    // `--listFiles` prints every file in the program, the standard library and
    // installed types included; only the project's own files are counted.
    const prefix = `${dir}${path.sep}`;
    const own = output
      .split('\n')
      .filter((l) => l.startsWith(prefix) && !l.includes(`${path.sep}node_modules${path.sep}`));
    return `[typecheck] ${new Set(own).size} files under ${WORKSPACE}/ type-check`;
  },
};

main(spec, import.meta.url);
