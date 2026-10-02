/**
 * The gate registry, rendered everywhere it is quoted (spec: kb.gates.registry,
 * registry-generator).
 *
 * `docs/data/gates.json` is the one home for what a check gate is, where it
 * runs and how it is repaired. What is built from it, under one repair command
 * (`make gates`):
 *
 *   docs/reference/gates.md     the whole reference page — every gate, what it
 *                               protects, how to run it, how to repair it, and
 *                               the required status checks
 *   docs/reference/triage.md    two marked blocks in a hand-written page: the
 *                               gate count, and the symptom table that indexes
 *                               the page's hand-written sections
 *   COUNT_FILES, below          every page that says how many gates there are
 *
 * The per-gate sections of the triage page stay hand-written: they carry the
 * one-message-per-bullet diagnoses no registry field could hold. What is
 * generated is the index into them, and `check-gates-sync` proves every anchor
 * the registry names exists on that page.
 *
 * The symptom block wraps the WHOLE table, header row included. An HTML comment
 * is a block-level construct in markdown, so a marker line between two table
 * rows ends the table. That is why the rows a person maintains — symptoms that
 * are not gates — live in the registry's `symptoms` array rather than outside
 * the markers.
 *
 * Usage: gen-gates            (rewrites every output above)
 *        gen-gates --check    (exit 1 if any of them is stale)
 */

import fs from 'node:fs';
import path from 'node:path';

import { blockStamp, emit, fileStamp, spliceFile, type Block, type Emitted } from '../lib/generated.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';

export const SRC = 'docs/data/gates.json';
export const GENERATOR = 'tools/src/gen/gen-gates.ts';
export const REFERENCE = 'docs/reference/gates.md';
export const TRIAGE = 'docs/reference/triage.md';
/** The repair command every STALE line names, and the row's `fix`. */
export const FIX = 'make gates';
/**
 * Every page that states how many gates there are. None of them says it in its
 * own words: each carries the counted block, and `make gates` fills it in, so
 * adding a gate cannot leave a stale total behind.
 */
export const COUNT_FILES: readonly string[] = [TRIAGE];
/** The marked blocks this generator owns. */
export const COUNT_BLOCK = 'gate-count';
export const SYMPTOM_BLOCK = 'gates-symptoms';
/**
 * The run place every ordinary change starts: its workflow is the change
 * workflow, the one whose jobs a protected branch requires. A run-place id, not
 * a file name — the file lives in the registry's `runs_values`.
 */
export const CHANGE_PLACE = 'ci';

/** One run place: what it means and, when it is a workflow, which file. */
export interface RunPlace {
  meaning: string;
  workflow?: string;
}

export interface Gate {
  id: string;
  name: string;
  protects: string;
  command: string;
  /** The literal text that must appear wherever `runs` says this gate runs. */
  wired?: string;
  /** Why `wired` is absent — the two sides are different code, compared by eye. */
  wired_note?: string;
  /**
   * The shell command `tools/src/run-gates.ts` spawns for this gate. Its
   * presence is what puts the gate in a make target: nothing lists gates in the
   * Makefile, so a gate is local exactly when it says so here.
   */
  local_command?: string;
  /** Which make target drives it. Default `validate`. */
  local_target?: string;
  /** Accepts file paths, so `make validate-changed` can hand it just those. */
  positional: boolean;
  /** Repairs some of what it reports when passed `--fix`; `make fix` runs it. */
  fixable: boolean;
  /**
   * The paths this gate reads, as globs. `make validate-changed` runs a gate
   * only when a changed file matches one. Absent means "cannot be narrowed" —
   * the gate then always runs, so a missing field over-runs rather than skips.
   */
  scans?: string[];
  runs: string[];
  /** The job in the change workflow. Every gate that runs on a change has one. */
  ci_job?: string;
  /** The step's byte-exact name in that job. */
  ci_step?: string;
  requires?: string[];
  fix: string;
  runbook: string;
}

export interface Symptom {
  name: string;
  anchor: string;
  where: string;
}

export interface Registry {
  version: number;
  updated: string;
  note: string;
  runs_values: Record<string, RunPlace>;
  /** Named workflow steps that check nothing, and why each is not a gate. */
  setup_steps: Record<string, string>;
  /** Change-workflow jobs that hold no gate, and why each exists. */
  reporting_jobs?: Record<string, string>;
  /** Change-workflow jobs an ordinary change skips, and what their `if:` waits for. */
  conditional_jobs?: Record<string, string>;
  /** Gate-holding jobs a protected branch should not require, with the reason. */
  required_contexts: { exclude: Record<string, string> };
  gates: Gate[];
  symptoms: Symptom[];
}

/** The workflow file a run place names, if it is one. */
export const workflowOf = (reg: Registry, place: string): string | undefined =>
  reg.runs_values[place]?.workflow;

/** Every distinct change-workflow job holding a gate, in registry order. */
export function ciJobs(reg: Registry): string[] {
  const seen: string[] = [];
  for (const g of reg.gates) {
    if (!g.runs.includes(CHANGE_PLACE) || g.ci_job === undefined) continue;
    if (!seen.includes(g.ci_job)) seen.push(g.ci_job);
  }
  return seen;
}

/** The jobs an ordinary change skips. */
export function conditionalJobs(reg: Registry): string[] {
  return Object.keys(reg.conditional_jobs ?? {});
}

/** The gates a change reddens: in CI, in a job that always runs. */
export function changeGates(reg: Registry): Gate[] {
  const conditional = conditionalJobs(reg);
  return reg.gates.filter((g) => g.runs.includes(CHANGE_PLACE) && !conditional.includes(g.ci_job ?? ''));
}

/** The gates in CI that wait for a condition an ordinary change does not meet. */
export function afterMergeGates(reg: Registry): Gate[] {
  const conditional = conditionalJobs(reg);
  return reg.gates.filter((g) => g.runs.includes(CHANGE_PLACE) && conditional.includes(g.ci_job ?? ''));
}

/** The gates that run from `make` and nowhere in CI. */
export function localOnlyGates(reg: Registry): Gate[] {
  return reg.gates.filter((g) => g.runs.includes('local') && !g.runs.includes(CHANGE_PLACE));
}

/** The gates CI runs that `make` cannot. */
export function ciOnlyGates(reg: Registry): Gate[] {
  return reg.gates.filter((g) => g.runs.includes(CHANGE_PLACE) && !g.runs.includes('local'));
}

/** The jobs a protected branch should require: gate-holding, not excluded. */
export function requiredContexts(reg: Registry): string[] {
  return ciJobs(reg).filter((j) => reg.required_contexts.exclude[j] === undefined);
}

/** A table cell: the only character that can break one is the column divider. */
export const cell = (s: string): string => s.replace(/\|/g, '\\|');

/** The anchor half of `docs/reference/triage.md#json-sanity`. */
export function anchorOf(runbook: string): string | null {
  const hash = runbook.indexOf('#');
  return hash === -1 ? null : runbook.slice(hash + 1);
}

/** The file half of the same. */
export function fileOf(runbook: string): string {
  const hash = runbook.indexOf('#');
  return hash === -1 ? runbook : runbook.slice(0, hash);
}

/** A repo-relative path, as a link from a page in `fromDir`. */
export function hrefFrom(fromDir: string, target: string): string {
  const anchor = anchorOf(target);
  const rel = path.posix.relative(fromDir, fileOf(target));
  return anchor === null ? rel : `${rel}#${anchor}`;
}

/** `a`, `b` and `c` — an English list, so a sentence never joins one by hand. */
export function englishList(items: readonly string[]): string {
  if (items.length === 0) return 'nothing';
  if (items.length === 1) return items[0] as string;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] as string}`;
}

/**
 * Greedy wrap at the repo's prose width.
 *
 * Generated prose whose length depends on the data wraps badly if the line
 * breaks are written into the template — one gate added and the paragraph has
 * a three-word line in the middle of it.
 */
export function wrap(text: string, width = 90): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter((w) => w !== '')) {
    if (line === '') line = word;
    else if (`${line} ${word}`.length <= width) line += ` ${word}`;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line !== '') out.push(line);
  return out;
}

/** How a run place reads in a table: its workflow file, `make`, or its id. */
export function placeLabel(reg: Registry, place: string): string {
  const workflow = workflowOf(reg, place);
  if (workflow !== undefined) return `\`${path.posix.basename(workflow)}\``;
  if (place === 'local') return '`make`';
  if (place === 'human') return 'a person';
  return `\`${place}\``;
}

const runsLabel = (reg: Registry, runs: readonly string[]): string =>
  runs.map((r) => placeLabel(reg, r)).join(' · ');

/**
 * The symptom table: every change-workflow row, then every hand-maintained
 * symptom, each linked to its section on the triage page. A gate that never
 * fails a change is not a symptom of a red build, so it is not a row here; it
 * is still in the reference page, which is the whole list.
 */
export function renderSymptomTable(reg: Registry): string[] {
  const rows: string[] = [];
  for (const g of reg.gates) {
    if (!g.runs.includes(CHANGE_PLACE)) continue;
    const anchor = anchorOf(g.runbook);
    const link = anchor === null ? cell(g.name) : `[${cell(g.name)}](#${anchor})`;
    rows.push(`| ${link} | \`${g.ci_job ?? '?'}\` | \`${cell(g.command)}\` |`);
  }
  for (const s of reg.symptoms) {
    rows.push(`| [${cell(s.name)}](#${s.anchor}) | ${cell(s.where)} | — |`);
  }
  return [
    blockStamp(GENERATOR, SRC, 'table'),
    '',
    '| Failing step | Job | Reproduce it alone |',
    '| --- | --- | --- |',
    ...rows,
  ];
}

/**
 * How many gates there are, for every page that would otherwise guess.
 *
 * One block, spliced verbatim into each count file, so it has to read naturally
 * wherever it lands. That rules out relative links — the files may sit at
 * different depths — so paths are backticked and repo-relative instead.
 */
export function renderGateCount(reg: Registry): string[] {
  const total = reg.gates.length;
  const local = reg.gates.filter((g) => g.runs.includes('local')).length;
  const change = changeGates(reg).length;
  const afterMerge = afterMergeGates(reg).length;
  const neither = reg.gates.filter((g) => !g.runs.includes('local') && !g.runs.includes(CHANGE_PLACE)).length;
  const clauses = [
    `${String(local)} run from \`make\` on your own machine`,
    `${String(change)} on every change in CI`,
    ...(afterMerge > 0 ? [`${String(afterMerge)} more only after a merge`] : []),
    ...(neither > 0 ? [`${String(neither)} ${neither === 1 ? 'is' : 'are'} not code but a person's judgement`] : []),
  ];
  return [
    blockStamp(GENERATOR, SRC, 'paragraph'),
    '',
    ...wrap(
      `**${String(total)} check ${total === 1 ? 'gate' : 'gates'}** guard this repo: ${englishList(clauses)}. ` +
        `Every one is listed in \`${REFERENCE}\`, generated from \`${SRC}\`.`,
    ),
  ];
}

/** "What can CI tell me that `make` cannot?", derived rather than remembered. */
function ciOnlyParagraph(reg: Registry): string[] {
  const only = ciOnlyGates(reg);
  if (only.length === 0) {
    return wrap(
      'Every gate CI runs also runs from `make`, so a green `make validate` means CI has nothing ' +
        'left to tell you.',
    );
  }
  return wrap(
    `${only.length === 1 ? 'One gate runs' : `${String(only.length)} gates run`} only in CI, never from ` +
      `\`make\`: ${englishList(only.map((g) => `**${g.name}**`))}.`,
  );
}

/** "What does `make` tell me that CI cannot?", the mirror of the above. */
function localOnlyParagraph(reg: Registry): string[] {
  const only = localOnlyGates(reg);
  if (only.length === 0) return [];
  return [
    '',
    ...wrap(
      `${only.length === 1 ? 'One gate has' : `${String(only.length)} gates have`} no step in CI, so a green ` +
        `change says nothing about ${only.length === 1 ? 'it' : 'them'}: ` +
        `${englishList(only.map((g) => `**${g.name}**`))}.`,
    ),
  ];
}

/** The required status checks: every gate-holding change-workflow job, minus the excluded. */
function requiredChecks(reg: Registry): string[] {
  const workflow = workflowOf(reg, CHANGE_PLACE);
  const required = requiredContexts(reg);
  const excluded = Object.entries(reg.required_contexts.exclude);
  return [
    '## Required status checks',
    '',
    ...wrap(
      `A protected branch requires the change workflow's gate-holding jobs${
        workflow === undefined ? '' : ` in \`${workflow}\``
      } — the job names are the check names:`,
    ),
    '',
    ...(required.length === 0 ? ['- none'] : required.map((j) => `- \`${j}\``)),
    ...excluded.flatMap(([job, why]) => ['', ...wrap(`\`${job}\` is deliberately not required: ${why}.`)]),
  ];
}

/**
 * `make fix`, said only as far as it is true: with no row declaring a repair,
 * the repair run has nothing to start and exits 2, and the page says so rather
 * than promising repairs nothing makes.
 */
function repairParagraph(reg: Registry): string[] {
  const fixable = reg.gates.filter((g) => g.fixable);
  if (fixable.length === 0) {
    return wrap(
      'No gate declares a repair yet, so `make fix` has nothing to run and exits 2; it starts ' +
        'working the day a row sets `fixable`.',
    );
  }
  return [
    ...wrap(`The deterministic repairs, applied rather than reported — ${englishList(fixable.map((g) => `**${g.name}**`))}:`),
    '',
    '```bash',
    'make fix',
    '```',
  ];
}

export function renderReference(reg: Registry): string {
  const here = path.posix.dirname(REFERENCE);
  const triage = hrefFrom(here, TRIAGE);
  const example =
    reg.gates.find((g) => g.command.startsWith('make gate G='))?.command ?? 'make gate G=<program>';
  const out: string[] = [
    '---',
    'title: Check gates',
    'description: Every check gate that guards this repo — what it protects, where it runs, how to run it alone and how to repair it.',
    'area: reference',
    'owner: Oleksandr Derechei',
    'tags: [testing, maintainability]',
    'status: stable',
    `source: ${SRC}`,
    '---',
    '',
    fileStamp(GENERATOR, SRC),
    '',
    '# Check gates',
    '',
    ...wrap(
      `A **check gate** is one automatic answer to "is this still true?". There are ${String(reg.gates.length)} ` +
        'of them, and every one keeps the same contract: exit 0 with one summary line, exit 1 with one ' +
        'finding per line on stderr, exit 2 on misuse.',
    ),
    '',
    ...wrap(
      `Everything here is built from [\`${path.posix.basename(SRC)}\`](${hrefFrom(here, SRC)}). Edit that ` +
        `file, run \`${FIX}\`, and commit both: **Gate reference in sync** fails if they disagree, and ` +
        '**Gate registry in sync** fails if the registry and the Makefile, the workflow or the triage ' +
        'page disagree.',
    ),
    '',
    '## Run them',
    '',
    'Every gate below, every finding in one pass:',
    '',
    '```bash',
    'make validate',
    '```',
    '',
    'Only the gates that read what your branch changed:',
    '',
    '```bash',
    'make validate-changed',
    '```',
    '',
    ...repairParagraph(reg),
    '',
    'One gate on its own:',
    '',
    '```bash',
    example,
    '```',
    '',
    ...wrap(
      '`FAILFAST=1 make validate` stops at the first red gate; `JOBS=n` sets how many run at once. ' +
        `A red gate's section in [Triage a red gate](${triage}) says what each of its findings means.`,
    ),
    '',
    '## Where a gate can run',
    '',
    '| Value | Meaning |',
    '| --- | --- |',
    ...Object.entries(reg.runs_values).map(([k, v]) => `| \`${k}\` | ${cell(v.meaning)} |`),
    '',
    ...ciOnlyParagraph(reg),
    ...localOnlyParagraph(reg),
    '',
    '## Every gate',
    '',
    '| Gate | Runs | What it protects |',
    '| --- | --- | --- |',
    ...reg.gates.map((g) => `| [${cell(g.name)}](#${g.id}) | ${runsLabel(reg, g.runs)} | ${cell(g.protects)} |`),
    '',
    ...requiredChecks(reg),
    '',
    '## Each one',
    '',
  ];

  for (const g of reg.gates) {
    const requires = g.requires ?? [];
    out.push(`### <a id="${g.id}"></a>${g.name}`, '');
    out.push(`- **Protects:** ${g.protects}`);
    out.push(`- **Runs:** ${runsLabel(reg, g.runs)}${g.ci_step === undefined ? '' : ` — step \`${g.ci_step}\``}`);
    out.push(
      requires.length > 0
        ? `- **Needs:** ${requires.map((r) => `\`${r}\``).join(' · ')}`
        : '- **Needs:** nothing you do not already have',
    );
    out.push(`- **Run it:** \`${g.command}\``);
    // A fix that is itself a command reads as one.
    out.push(`- **Fix:** ${g.fix.startsWith('make ') ? `\`${g.fix}\`` : g.fix}`);
    out.push(`- **Triage:** [${g.runbook}](${hrefFrom(here, g.runbook)})`);
    if (g.wired_note !== undefined) out.push(`- **Not compared automatically:** ${g.wired_note}`);
    out.push('');
  }

  out.push(
    '## Next steps',
    '',
    'When a gate is red, read the same list from the symptom end:',
    '',
    `- [Triage a red gate](${triage}) — one section per gate, each finding and its repair.`,
    '',
  );
  return `${out.join('\n')}`;
}

/** Read and parse the registry, or record why not (write-or-check-C5). */
export function readRegistry(ctx: GateContext): Registry | null {
  const src = path.join(ctx.root, SRC);
  if (!fs.existsSync(src)) {
    ctx.fail(SRC, 'is missing — every gate list is generated from it');
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(src, 'utf8')) as Registry;
  } catch {
    ctx.fail(SRC, 'is not valid JSON');
    return null;
  }
}

/**
 * The generator, with the files its counted block is declared in.
 *
 * `countFiles` is a parameter so a test can declare a tree of its own; the
 * registered program is `spec`, below, over `COUNT_FILES`.
 */
export function specFor(countFiles: readonly string[]): GateSpec {
  return {
    name: 'gates-fresh',
    usage: 'usage: gen-gates [--check]   (--check exits 1 if any generated output is stale)',
    flags: ['--check'],
    run(ctx: GateContext): string {
      const reg = readRegistry(ctx);
      if (reg === null) return '';

      const results: [string, Emitted][] = [];
      results.push([
        REFERENCE,
        emit(ctx, { out: REFERENCE, wanted: renderReference(reg), fixCommand: FIX, stamp: fileStamp(GENERATOR, SRC) }),
      ]);

      // Rendered once, spliced into every file that declares it (marked-blocks-C8).
      const count: Block = { name: COUNT_BLOCK, lines: renderGateCount(reg) };
      const symptoms: Block = { name: SYMPTOM_BLOCK, lines: renderSymptomTable(reg) };
      const files = [TRIAGE, ...countFiles.filter((f) => f !== TRIAGE)];
      for (const file of files) {
        const blocks = [
          ...(countFiles.includes(file) ? [count] : []),
          ...(file === TRIAGE ? [symptoms] : []),
        ];
        // One failing file does not stop the others (marked-blocks-C6).
        const text = spliceFile(ctx, file, blocks);
        if (text === null) continue;
        results.push([file, emit(ctx, { out: file, wanted: text, fixCommand: FIX })]);
      }

      // Every output is reported; the summary only survives if none failed.
      const names = englishList(results.map(([f]) => f));
      if (ctx.flags.has('--check')) return `[gates-fresh] ${names} are in sync with ${SRC}`;
      const wrote = results.filter(([, what]) => what === 'wrote').length;
      return `[gates-fresh] wrote ${String(wrote)} of ${String(results.length)} outputs from ${SRC} (${String(reg.gates.length)} gates)`;
    },
  };
}

export const spec: GateSpec = specFor(COUNT_FILES);

main(spec, import.meta.url);
