/**
 * Nothing the project runs ships untested (spec: kb.gates.testing,
 * colocation-gate; kb.data.exceptions for its allowlist).
 *
 * Two kinds of thing are held to it:
 *
 *   a module    every `tools/src/**.ts` that is not itself a test. Covered by a
 *               sibling `<stem>.test.ts`, by a suite in the same folder that
 *               imports `./<stem>.js`, or by an allowlist entry with a reason.
 *   a hook      every file under `.claude/hooks/`. Covered by a test at one of
 *               the homes below that names the hook — a test file sitting in
 *               the right place but never mentioning the hook proves nothing
 *               about it, and is a finding of its own.
 *
 * The allowlist is `docs/data/allow/test-colocation.json`: a source header,
 * then `entries`, each a `name`, a whole-path `match` and a non-empty
 * `reason`. An entry that excuses a failure rather than a category also
 * carries `owner` and `since`. Default deny both ways: an uncovered thing with
 * no entry is a finding, and so is an entry that excuses nothing, because an
 * exception must not outlive its cause.
 *
 * Usage: check-test-colocation   (takes no arguments: the scan is always whole)
 */

import fs from 'node:fs';
import path from 'node:path';

import { Allowlist, entryProblem as problemOf, readAllowlist, type AllowEntry } from '../lib/allowlist.js';
import { gitFiles } from '../lib/exec.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';

export const ALLOWLIST = 'docs/data/allow/test-colocation.json';
/** Where the modules live: every `.ts` under it that is not a test. */
export const MODULE_ROOT = 'tools/src/';
/** Where the hooks live: every file under it is an executable the harness runs. */
export const HOOK_DIR = '.claude/hooks/';

/** Where a hook's test may live, by the hook's file name without extension. */
export function hookTestHomes(hook: string): string[] {
  const stem = path.basename(hook).replace(/\.[^.]+$/, '');
  return [`tools/src/hooks/${stem}.test.ts`, `tests/hooks/${stem}.test.sh`];
}

/** One allowlist entry; the shape every allowlist shares. */
export type Entry = AllowEntry;

/** Is a module a test, rather than something a test must cover? */
export const isTest = (file: string): boolean => file.endsWith('.test.ts');

/**
 * Does a suite import this module by its relative specifier?
 *
 * Only a relative import from the same folder counts: a suite in another
 * folder that happens to reach the module is incidental coverage, and the
 * colocation rule is about where a reader looks for the test.
 */
export function importsModule(suite: string, stem: string): boolean {
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:from\\s+|import\\s*\\(\\s*)['"]\\./${escaped}(?:\\.js|\\.ts)?['"]`).test(suite);
}

/** What this gate says of an entry with a blank reason. */
const EMPTY_REASON = 'has an empty reason — say why the thing needs no test';

/** What is wrong with one allowlist entry, or nothing. */
export function entryProblem(entry: unknown): string | null {
  return problemOf(entry, EMPTY_REASON);
}

export const spec: GateSpec = {
  name: 'test-colocation',
  usage: 'usage: check-test-colocation   (takes no arguments: the scan is always whole)',
  run(ctx: GateContext): string {
    const entries = readAllowlist(ctx, ALLOWLIST, {
      missing: 'the colocation gate reads its exceptions from here, even when there are none',
      emptyReason: EMPTY_REASON,
    });
    if (entries === null) return '';
    const list = new Allowlist(entries);
    const excused = (file: string): boolean => list.excuses(file);
    const read = (file: string): string => {
      const abs = path.join(ctx.root, file);
      return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    };

    // ---- modules ----------------------------------------------------------
    const files = gitFiles(ctx.root, [MODULE_ROOT]).filter((f) => f.endsWith('.ts'));
    const present = new Set(files);
    const modules = files.filter((f) => !isTest(f) && !f.endsWith('.d.ts'));
    let covered = 0;
    for (const mod of modules) {
      const dir = path.posix.dirname(mod);
      const stem = path.posix.basename(mod, '.ts');
      const sibling = `${dir}/${stem}.test.ts`;
      const suites = files.filter((f) => isTest(f) && path.posix.dirname(f) === dir);
      if (present.has(sibling) || suites.some((s) => importsModule(read(s), stem))) {
        covered += 1;
        continue;
      }
      if (excused(mod)) continue;
      ctx.fail(
        mod,
        `has no test — add ${sibling}, import it from a suite in ${dir}/, or add a reasoned entry to ${ALLOWLIST}`,
      );
    }

    // ---- hooks ------------------------------------------------------------
    const hooks = gitFiles(ctx.root, [HOOK_DIR]);
    let hooksCovered = 0;
    for (const hook of hooks) {
      const name = path.posix.basename(hook);
      const claimed = hookTestHomes(hook).filter((t) => fs.existsSync(path.join(ctx.root, t)));
      const naming = claimed.filter((t) => read(t).includes(name));
      if (naming.length > 0) {
        hooksCovered += 1;
        continue;
      }
      if (excused(hook)) continue;
      if (claimed.length > 0) {
        for (const t of claimed) {
          ctx.fail(t, `is the test for ${hook} by its path, but never names ${name} — it cannot be running it`);
        }
        continue;
      }
      ctx.fail(
        hook,
        `has no test — add ${hookTestHomes(hook)[0] as string} that runs it by name, or a reasoned entry to ${ALLOWLIST}`,
      );
    }

    // ---- entries that excuse nothing ----------------------------------------
    for (const e of list.unused()) {
      ctx.fail(ALLOWLIST, `entry "${e.name}" excuses nothing — its match ${e.match} names no untested module or hook; delete it`);
    }

    const hookWord = hooksCovered === 1 ? 'hook' : 'hooks';
    return (
      `[test-colocation] ${covered} modules and ${hooksCovered} ${hookWord} have tests; ` +
      `${list.applied} allowlist ${list.applied === 1 ? 'entry' : 'entries'} applied`
    );
  },
};

main(spec, import.meta.url);
