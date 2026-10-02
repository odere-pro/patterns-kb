/**
 * Hold the Makefile, the workflows, the triage page and the gate programs on
 * disk to the gate registry, in both directions (spec: kb.gates.registry,
 * sync-gate).
 *
 * "What checks guard this repo?" has four places that could each answer it —
 * the Makefile, the change workflow, the triage page and the programs under
 * tools/src — and answers drift. `docs/data/gates.json` is the one home, and
 * this gate is what makes that true rather than merely intended:
 *
 *   every named workflow step  →  a registry entry claiming it, or setup
 *   every registry entry       →  the step it claims, in the job it names
 *   every `wired` command      →  present, verbatim, wherever `runs` says
 *   every row's program        →  a file that exists
 *   every `runbook` anchor     →  a heading on the triage page
 *   every counted block        →  the total the registry holds
 *   every Makefile gate line   →  a registry entry that claims to be it
 *   every gate program on disk →  a registry entry that runs it
 *
 * The workflows it reads are the ones the registry's `runs_values` names, and
 * no other: this file holds no workflow path (registry-C10). It reads them by
 * their fixed layout, never with a YAML parser: jobs are keys at two spaces
 * under `jobs:`, steps are `- ` items at six, a step's own keys sit at eight.
 *
 * Usage: check-gates-sync   (takes no arguments)
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  anchorOf,
  CHANGE_PLACE,
  ciJobs,
  COUNT_BLOCK,
  COUNT_FILES,
  fileOf,
  FIX,
  readRegistry,
  renderGateCount,
  SRC,
  TRIAGE,
  workflowOf,
  type Gate,
  type Registry,
} from '../gen/gen-gates.js';
import { markers } from '../lib/generated.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';

const MAKEFILE = 'Makefile';
/** The folders a gate or generator program lives in; each program there has a row. */
const PROGRAM_DIRS: readonly [string, string][] = [
  ['tools/src/gates', 'check-'],
  ['tools/src/gen', 'gen-'],
];
/** The make target that owns a driven gate when it does not say. */
const DEFAULT_TARGET = 'validate';
/** How the driver is spelled once `$(DRIVER)` and `$(TSX)` are expanded. */
const DRIVER = 'node_modules/.bin/tsx tools/src/run-gates.ts';

/**
 * The make targets whose recipes are the local mirror of CI. Only these are
 * held to the registry: `make gate` and the generator targets run a program on
 * request rather than as part of the run that has to be green, and requiring
 * an entry for those would make the registry a list of every Makefile command.
 */
const GATE_TARGETS = ['validate', 'tools-test'];

export interface Step {
  name: string;
  job: string;
  body: string;
}

/**
 * Read the named steps out of one of this repo's own workflow files.
 *
 * A step name is only ever read from the step's own two positions — the `- `
 * item line at six spaces or a key at eight — which is what keeps a `name:`
 * inside a `with:` block from being mistaken for a step.
 */
export function readSteps(text: string): Step[] {
  const lines = text.split('\n');
  const steps: Step[] = [];
  let inJobs = false;
  let job = '';
  let current: Step | null = null;

  const close = (): void => {
    if (current !== null && current.name !== '') steps.push(current);
    current = null;
  };

  for (const line of lines) {
    if (/^\S/.test(line)) {
      // A top-level key. `jobs:` opens the only region this parser reads.
      close();
      inJobs = line.trimEnd() === 'jobs:';
      continue;
    }
    if (!inJobs) continue;

    const jobKey = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobKey) {
      close();
      job = jobKey[1] as string;
      continue;
    }
    if (/^ {6}- /.test(line)) {
      close();
      const named = /^ {6}- name:\s*(.+?)\s*$/.exec(line);
      current = { name: named ? unquote(named[1] as string) : '', job, body: `${line}\n` };
      continue;
    }
    if (current !== null) {
      if (/^ {8}\S/.test(line) || /^ {9,}/.test(line) || line.trim() === '') {
        const named = /^ {8}name:\s*(.+?)\s*$/.exec(line);
        if (named) current.name = unquote(named[1] as string);
        current.body += `${line}\n`;
        continue;
      }
      close();
    }
  }
  close();
  return steps;
}

const unquote = (s: string): string =>
  (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")) ? s.slice(1, -1) : s;

/**
 * One command, comparable across the places it is written.
 *
 * `$(TSX)` and `$(DRIVER)` are the Makefile's spellings of paths CI writes out
 * in full, and YAML block scalars wrap where a recipe does not — so both are
 * flattened before the comparison (registry-C3). Nothing else is rewritten:
 * the point is to catch a real difference in what runs.
 */
export function normalise(s: string): string {
  return s
    .replace(/\$\(TSX\)/g, 'node_modules/.bin/tsx')
    .replace(/\$\(DRIVER\)/g, DRIVER)
    .replace(/\\\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Does `haystack` run `needle`, rather than merely contain its letters?
 *
 * A plain `includes` cannot tell `node_modules/.bin/tsx` from
 * `tools/node_modules/.bin/tsx`. The match has to start where a command or a
 * path starts: at the beginning, or after a character that cannot be part of
 * one — `@` (a silenced recipe), a space, a `;`.
 */
export function runsCommand(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9._/-])${escaped}`).test(haystack);
}

/** A heading's anchor: lower-cased, punctuation dropped, spaces to hyphens. */
export function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, '')
    .replace(/ /g, '-');
}

function headingAnchors(text: string): Set<string> {
  const out = new Set<string>();
  let fenced = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const h = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (h) out.add(slug(h[1] as string));
    // An explicit `<a id="…">` counts too — the generated reference uses them.
    for (const m of line.matchAll(/<a id="([^"]+)"/g)) out.add(m[1] as string);
  }
  return out;
}

/**
 * The gate programs a row names by repo-relative path in its commands: a gate
 * or a generator. Every one must exist. A path that merely ends in one — an
 * absolute path into another checkout — names a program somewhere else, not
 * one in this tree, so the match starts where a path starts.
 */
export function programsOf(g: Gate): string[] {
  const out = new Set<string>();
  for (const text of [g.wired, g.local_command, g.command]) {
    for (const m of (text ?? '').matchAll(/(?<![\w./-])tools\/src\/(?:gates|gen)\/[\w-]+\.ts/g)) out.add(m[0]);
  }
  return [...out];
}

/** The program `make gate G=<stem>` resolves to, the way the Makefile does. */
function gateTarget(root: string, command: string): string | null {
  const stem = /\bmake gate G=([\w-]+)/.exec(command)?.[1];
  if (stem === undefined) return null;
  for (const [dir] of PROGRAM_DIRS) {
    const f = `${dir}/${stem}.ts`;
    if (fs.existsSync(path.join(root, f))) return f;
  }
  return `${PROGRAM_DIRS[0]?.[0] as string}/${stem}.ts`;
}

function checkWorkflow(ctx: GateContext, reg: Registry, where: string, file: string): number {
  const abs = path.join(ctx.root, file);
  const claimed = reg.gates.filter((g) => g.runs.includes(where));
  if (!fs.existsSync(abs)) {
    if (claimed.length > 0) {
      ctx.fail(file, `does not exist, but ${claimed.length} registry row(s) say they run there`);
    }
    return 0;
  }
  const steps = readSteps(fs.readFileSync(abs, 'utf8'));
  const byName = new Map(steps.map((s) => [s.name, s]));
  const perJob = new Map<string, number>();
  for (const g of claimed) {
    if (g.ci_job !== undefined) perJob.set(g.ci_job, (perJob.get(g.ci_job) ?? 0) + 1);
  }

  // registry → workflow
  for (const g of claimed) {
    if (g.ci_step === undefined) {
      ctx.fail(SRC, `${g.id} runs in ${where} but declares no ci_step`);
      continue;
    }
    const step = byName.get(g.ci_step);
    if (step === undefined) {
      ctx.fail(file, `no step named "${g.ci_step}" — registered by ${g.id} in ${SRC}`);
      continue;
    }
    if (g.ci_job !== undefined && step.job !== g.ci_job) {
      ctx.fail(file, `step "${g.ci_step}" is in job "${step.job}", registry says "${g.ci_job}"`);
    }
    if (g.wired !== undefined && !runsCommand(normalise(step.body), normalise(g.wired))) {
      ctx.fail(file, `step "${g.ci_step}" does not run the registry's command: ${g.wired}`);
    }
    // Every gate step reports, whatever the ones before it did (registry-C7).
    // A step with no `if:` is skipped the moment an earlier one fails, so a
    // branch with three findings would cost three CI round trips. Only where
    // there is something to hide behind: a gate alone in its job needs none.
    const crowded = (perJob.get(step.job) ?? 0) > 1;
    if (crowded && !/^ {8}if:/m.test(step.body)) {
      ctx.fail(
        file,
        `step "${g.ci_step}" has no \`if:\` — one red gate before it would hide it. ` +
          "Add `if: ${{ !cancelled() && steps.setup.outcome == 'success' }}`",
      );
    }
  }

  // workflow → registry
  const registered = new Set(claimed.map((g) => g.ci_step));
  const setup = new Set(Object.keys(reg.setup_steps ?? {}));
  for (const step of steps) {
    if (registered.has(step.name) || setup.has(step.name)) continue;
    ctx.fail(
      file,
      `step "${step.name}" (job ${step.job}) is in no registry entry — add it to ${SRC}, ` +
        'or to setup_steps there if it checks nothing',
    );
  }
  return 1;
}

/**
 * Every job in the change workflow is accounted for, both ways: it holds a
 * gate, or it is a declared reporting job (registry-C4).
 */
function checkJobs(ctx: GateContext, reg: Registry, file: string): void {
  const abs = path.join(ctx.root, file);
  if (!fs.existsSync(abs)) return;
  const present = new Set(
    readSteps(fs.readFileSync(abs, 'utf8'))
      .map((s) => s.job)
      .filter((j) => j !== ''),
  );
  const withGates = new Set(ciJobs(reg));
  const reporting = reg.reporting_jobs ?? {};

  for (const job of [...present].sort()) {
    if (withGates.has(job) || reporting[job] !== undefined) continue;
    ctx.fail(
      file,
      `job "${job}" holds no gate and is in no reporting_jobs entry — add it to ${SRC} with the reason it checks nothing`,
    );
  }
  for (const job of Object.keys(reporting).sort()) {
    if (!present.has(job)) {
      ctx.fail(SRC, `reporting_jobs names "${job}", which is not a job in ${file}`);
    } else if (withGates.has(job)) {
      ctx.fail(
        SRC,
        `reporting_jobs names "${job}", but registry gates run there — a job holding a gate is a gate job`,
      );
    }
  }
}

/**
 * Read each job's own `if:` out of a workflow file: a job is a key at two
 * spaces, its own keys sit at four, and a folded `if: >-` block continues at
 * six. Returns the condition text per job, joined to one line.
 */
export function readJobConditions(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  let inJobs = false;
  let job = '';
  let collecting = false;

  for (const line of text.split('\n')) {
    if (/^\S/.test(line)) {
      inJobs = line.trimEnd() === 'jobs:';
      job = '';
      collecting = false;
      continue;
    }
    if (!inJobs) continue;

    const jobKey = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobKey) {
      job = jobKey[1] as string;
      collecting = false;
      continue;
    }
    if (job === '') continue;

    const cond = /^ {4}if:\s*(.*)$/.exec(line);
    if (cond) {
      const head = (cond[1] as string).trim();
      found[job] = head === '>-' || head === '>' || head === '|' ? '' : head;
      collecting = true;
      continue;
    }
    if (collecting) {
      if (/^ {4}\S/.test(line)) {
        collecting = false;
        continue;
      }
      if (line.trim() !== '') found[job] = `${found[job] as string} ${line.trim()}`.trim();
    }
  }
  return found;
}

/**
 * `conditional_jobs` against the `if:` that makes each one conditional, both
 * ways: a job is event-limited exactly when the registry lists it.
 */
function checkConditionalJobs(ctx: GateContext, reg: Registry, file: string): void {
  const abs = path.join(ctx.root, file);
  if (!fs.existsSync(abs)) return;
  const text = fs.readFileSync(abs, 'utf8');
  const conditions = readJobConditions(text);
  const declared = reg.conditional_jobs ?? {};
  const jobs = new Set(
    readSteps(text)
      .map((step) => step.job)
      .filter((j) => j !== ''),
  );
  const gates = (c: string): boolean => /github\.event_name|github\.ref\b/.test(c);

  for (const job of Object.keys(declared).sort()) {
    if (!jobs.has(job)) {
      ctx.fail(SRC, `conditional_jobs names "${job}", which is not a job in ${file}`);
      continue;
    }
    const cond = conditions[job];
    if (cond === undefined || cond === '') {
      ctx.fail(
        file,
        `job "${job}" is in conditional_jobs but has no \`if:\` — it runs on every change, and the generated counts promise it does not`,
      );
    } else if (!gates(cond)) {
      ctx.fail(
        file,
        `job "${job}" has an \`if:\` that turns on neither \`github.event_name\` nor \`github.ref\` — say in ${SRC} what makes it conditional`,
      );
    }
  }
  for (const [job, cond] of Object.entries(conditions).sort()) {
    if (declared[job] !== undefined || !gates(cond)) continue;
    ctx.fail(
      SRC,
      `job "${job}" in ${file} is gated on the event, so an ordinary change skips it — add it to ` +
        'conditional_jobs with the reason, or the generated counts promise checks nobody starts',
    );
  }
}

/**
 * The local side. A driven gate — one that declares `local_command` — is not
 * written in the Makefile at all: the driver spawns it from the registry. So:
 * the target it names exists and calls the driver for that target;
 * `local_command` contains `wired`; an undriven local gate's `wired` is
 * written out in a recipe; and no gate-running recipe runs a program no row
 * claims (registry-C5).
 */
function checkMakefile(ctx: GateContext, reg: Registry): void {
  const abs = path.join(ctx.root, MAKEFILE);
  if (!fs.existsSync(abs)) {
    ctx.fail(MAKEFILE, 'is missing — the driver targets live there');
    return;
  }
  const raw = fs.readFileSync(abs, 'utf8');
  const text = normalise(raw);
  const targets = new Set<string>();

  // registry → Makefile
  for (const g of reg.gates) {
    if (g.local_command !== undefined && !g.runs.includes('local')) {
      ctx.fail(SRC, `${g.id} declares local_command but does not run locally — add "local" to runs`);
    }
    if (!g.runs.includes('local')) continue;
    if (g.local_command !== undefined) {
      targets.add(g.local_target ?? DEFAULT_TARGET);
      if (g.wired !== undefined && !runsCommand(normalise(g.local_command), normalise(g.wired))) {
        ctx.fail(SRC, `${g.id}'s local_command does not contain the command CI runs: ${g.wired}`);
      }
      continue;
    }
    if (g.wired === undefined) continue;
    if (!runsCommand(text, normalise(g.wired))) {
      ctx.fail(MAKEFILE, `runs nothing matching ${g.id}'s command: ${g.wired}`);
    }
  }

  for (const t of [...targets].sort()) {
    if (!new RegExp(`^${t}:`, 'm').test(raw)) {
      ctx.fail(MAKEFILE, `has no \`${t}\` target, but gates in ${SRC} name it as their local_target`);
      continue;
    }
    // The default target calls the driver bare; every other one says which
    // set it wants, or it would silently run `validate`'s.
    const wanted = t === DEFAULT_TARGET ? DRIVER : `${DRIVER} --target ${t}`;
    const recipe = recipeLines(raw)
      .filter((r) => r.target === t)
      .map((r) => normalise(r.text))
      .join(' ; ');
    if (!runsCommand(recipe, wanted)) {
      ctx.fail(MAKEFILE, `\`${t}\` does not run the collecting driver — expected: ${wanted}`);
    }
  }

  // Makefile → registry: wiring a gate into a gate-running target by hand and
  // forgetting the registry would leave every check green while the reference
  // page and the triage page said the gate did not exist.
  const wired = reg.gates.filter((g) => g.wired !== undefined).map((g) => normalise(g.wired as string));
  for (const { target, line, text: cmd } of recipeLines(raw)) {
    if (!GATE_TARGETS.includes(target)) continue;
    if (!/tools\/src\/(gates|gen)\//.test(cmd)) continue;
    if (wired.some((w) => runsCommand(normalise(cmd), w))) continue;
    ctx.fail(MAKEFILE, `\`${target}\` runs a gate no registry entry claims: ${cmd.trim()} — add it to ${SRC}`, line);
  }
}

/** Every recipe line of the Makefile, with the target it belongs to. */
export function recipeLines(text: string): { target: string; line: number; text: string }[] {
  const out: { target: string; line: number; text: string }[] = [];
  let target = '';
  text.split('\n').forEach((raw, i) => {
    if (raw.startsWith('\t')) {
      if (target !== '') out.push({ target, line: i + 1, text: raw.slice(1) });
      return;
    }
    const rule = /^([A-Za-z0-9_.-]+):(?!=)/.exec(raw);
    target = rule ? (rule[1] as string) : '';
  });
  return out;
}

/**
 * Every gate program on disk is claimed by a row, and every row's program is
 * on disk (registry-C6). Without the first, a gate can be written, tested and
 * never run by anything; without the second, a row runs nothing.
 */
function checkPrograms(ctx: GateContext, reg: Registry): void {
  const claimed = new Set<string>();
  for (const g of reg.gates) {
    const programs = programsOf(g);
    const viaMake = gateTarget(ctx.root, g.command);
    if (viaMake !== null) programs.push(viaMake);
    for (const p of new Set(programs)) {
      claimed.add(p);
      if (!fs.existsSync(path.join(ctx.root, p))) ctx.fail(SRC, `${g.id} runs ${p}, which does not exist`);
    }
  }
  const unclaimed = (rel: string): void => {
    if (!claimed.has(rel)) ctx.fail(rel, `is a check gate no registry entry runs — add it to ${SRC} and wire it, or delete it`);
  };
  for (const [dir, prefix] of PROGRAM_DIRS) {
    const abs = path.join(ctx.root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of fs.readdirSync(abs).sort()) {
      if (!file.startsWith(prefix) || !file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
      unclaimed(`${dir}/${file}`);
    }
  }
}

function checkRunbooks(ctx: GateContext, reg: Registry): void {
  const cache = new Map<string, Set<string> | null>();
  const anchorsOf = (file: string): Set<string> | null => {
    if (!cache.has(file)) {
      const abs = path.join(ctx.root, file);
      cache.set(file, fs.existsSync(abs) ? headingAnchors(fs.readFileSync(abs, 'utf8')) : null);
    }
    return cache.get(file) ?? null;
  };

  for (const g of reg.gates) {
    const file = fileOf(g.runbook);
    const anchors = anchorsOf(file);
    if (anchors === null) {
      ctx.fail(SRC, `${g.id} points at ${file}, which does not exist`);
      continue;
    }
    const anchor = anchorOf(g.runbook);
    if (anchor !== null && !anchors.has(anchor)) {
      ctx.fail(file, `has no heading "#${anchor}" — ${g.id} links there`);
    }
  }

  // The hand-maintained rows of the symptom table are links into the triage
  // page and nothing else, so a missing section makes a dead row.
  const triage = anchorsOf(TRIAGE);
  for (const s of reg.symptoms) {
    if (triage === null) {
      ctx.fail(SRC, `symptoms link into ${TRIAGE}, which does not exist`);
      break;
    }
    if (!triage.has(s.anchor)) {
      ctx.fail(TRIAGE, `has no heading "#${s.anchor}" — the "${s.name}" symptom row links there`);
    }
  }
}

/**
 * Every counted block states the total the registry holds. The freshness check
 * says the same file is stale; this says which number is wrong, in the run
 * that also names the missing step and section a new row owes.
 */
function checkCounts(ctx: GateContext, reg: Registry): void {
  const [open, close] = markers(COUNT_BLOCK);
  const wanted = `\n\n${renderGateCount(reg).join('\n')}\n\n`;
  for (const file of COUNT_FILES) {
    const abs = path.join(ctx.root, file);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    const start = text.indexOf(open);
    const end = text.indexOf(close, start + 1);
    if (start === -1 || end === -1) continue;
    if (text.slice(start + open.length, end) === wanted) continue;
    ctx.fail(file, `its gate count block is stale — the registry holds ${reg.gates.length} gates; run: ${FIX}`);
  }
}

function checkShape(ctx: GateContext, reg: Registry): void {
  const seen = new Set<string>();
  for (const g of reg.gates) {
    if (seen.has(g.id)) ctx.fail(SRC, `duplicate gate id: ${g.id}`);
    seen.add(g.id);
    if (g.runs.length === 0) ctx.fail(SRC, `${g.id} runs nowhere`);
    for (const r of g.runs) {
      if (reg.runs_values[r] === undefined) {
        ctx.fail(SRC, `${g.id} declares runs: ${r}, which runs_values does not define`);
      }
    }
    for (const key of ['positional', 'fixable'] as const) {
      if (typeof g[key] !== 'boolean') ctx.fail(SRC, `${g.id}'s ${key} is not true or false`);
    }
    if (g.wired === undefined && g.wired_note === undefined && hasCode(reg, g)) {
      ctx.fail(SRC, `${g.id} has no wired command and no wired_note saying why nothing compares the two sides`);
    }
  }
  if (workflowOf(reg, CHANGE_PLACE) === undefined) {
    ctx.fail(SRC, `runs_values names no workflow file for "${CHANGE_PLACE}", the run place every change starts`);
  }
}

/** A gate whose command is code something runs, rather than a person's judgement. */
const hasCode = (reg: Registry, g: Gate): boolean =>
  g.runs.some((r) => r === 'local' || workflowOf(reg, r) !== undefined);

export const spec: GateSpec = {
  name: 'gates-sync',
  usage: 'usage: check-gates-sync   (takes no arguments: the registry and every place it is quoted must agree)',
  run(ctx: GateContext): string {
    const reg = readRegistry(ctx);
    if (reg === null) return '';

    checkShape(ctx, reg);
    let workflows = 0;
    for (const [where, place] of Object.entries(reg.runs_values)) {
      if (place.workflow !== undefined) workflows += checkWorkflow(ctx, reg, where, place.workflow);
    }
    const change = workflowOf(reg, CHANGE_PLACE);
    if (change !== undefined) {
      checkJobs(ctx, reg, change);
      checkConditionalJobs(ctx, reg, change);
    }
    checkMakefile(ctx, reg);
    checkPrograms(ctx, reg);
    checkRunbooks(ctx, reg);
    checkCounts(ctx, reg);

    return (
      `[gates-sync] ${reg.gates.length} gates agree with the Makefile, ${workflows} ` +
      `${workflows === 1 ? 'workflow' : 'workflows'}, their programs and ${TRIAGE}`
    );
  },
};

main(spec, import.meta.url);
