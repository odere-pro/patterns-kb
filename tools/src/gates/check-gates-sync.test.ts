/**
 * The point of this gate is one sentence: renaming a step in the workflow
 * without touching the registry has to fail, and the message has to say which
 * side is missing. That is registry-O1, below. The rest guard the other
 * directions — an unregistered step, a command that drifted inside a
 * registered step, a triage anchor nobody wrote, a program nothing runs, a
 * count nobody updated.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { COUNT_FILES, FIX, SRC, TRIAGE, type Gate, type Registry } from '../gen/gen-gates.js';
import {
  DRIVER_MAKEFILE,
  gatesRegistry,
  gatesTree,
  HUMAN_GATE,
  triagePage,
  WIDGET_GATE,
  WORKFLOW_FILE,
  workflowYaml,
  type RegistryFixture,
} from '../lib/fixtures.js';
import type { GateSpec } from '../lib/gate.js';
import {
  expectFail,
  expectMisuse,
  expectPass,
  makeSandbox,
  REPO_ROOT,
  type Sandbox,
} from '../lib/sandbox.js';
import {
  normalise,
  programsOf,
  readJobConditions,
  readSteps,
  recipeLines,
  runsCommand,
  slug,
  spec,
} from './check-gates-sync.js';

const WF = WORKFLOW_FILE;
const WORKFLOW = workflowYaml();

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
  gatesTree(sb);
});
afterEach(() => sb.cleanup());

/** A triage page with these sections, its count filled in from the sandbox's registry. */
const triage = (headings: readonly string[]): string =>
  triagePage(headings, JSON.parse(sb.read(SRC)) as Registry);

function editRegistry(fn: (r: RegistryFixture) => void): void {
  const r = JSON.parse(sb.read(SRC)) as RegistryFixture;
  fn(r);
  sb.write(SRC, `${JSON.stringify(r, null, 2)}\n`);
}

/** The same workflow plus a job that checks nothing — a reporting job. */
const WITH_REPORT_JOB = [
  WORKFLOW,
  '  report:',
  "    if: ${{ failure() && github.event_name == 'push' }}",
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - name: Say main went red',
  '        run: echo red',
  '',
].join('\n');

describe('reading our workflows', () => {
  const withBlock = `${WORKFLOW}      - if: always()\n        uses: actions/upload-artifact@v4\n        with:\n          name: a-name-inside-with-is-not-a-step-name\n`;

  it('finds the named steps and the job each belongs to', () => {
    const steps = readSteps(WORKFLOW);
    expect(steps.map((s) => s.name)).toEqual(['Install repo tooling', 'Annotate findings on the diff', 'Widget check']);
    expect(steps.every((s) => s.job === 'validate')).toBe(true);
  });

  it('does not mistake a name: inside a with: block for a step name', () => {
    expect(readSteps(withBlock).map((s) => s.name)).not.toContain('a-name-inside-with-is-not-a-step-name');
  });

  it('reads a quoted name, and a name that follows the step opener', () => {
    const text = "jobs:\n  a:\n    steps:\n      - id: x\n        name: 'Quoted step'\n        run: true\n";
    expect(readSteps(text).map((s) => s.name)).toEqual(['Quoted step']);
  });

  it('unquotes a double-quoted name the same way', () => {
    const text = 'jobs:\n  a:\n    steps:\n      - id: x\n        name: "Double quoted"\n        run: true\n';
    expect(readSteps(text).map((s) => s.name)).toEqual(['Double quoted']);
  });

  it('closes a step on a mis-indented line, not only on the next key or blank', () => {
    // Six spaces with no `- ` is neither a step opener nor step-body content
    // (that starts at eight) — a stray line at the step's own indent still
    // has to end it, or the next step's fields would read as the first one's.
    const text = [
      'jobs:',
      '  a:',
      '    steps:',
      '      - name: A',
      '        run: echo hi',
      '      weird: not indented enough to be inside A',
      '      - name: B',
    ].join('\n');
    expect(readSteps(text).map((s) => s.name)).toEqual(['A', 'B']);
  });

  it('does not read the keys under on: as job names', () => {
    expect(readSteps(WORKFLOW).map((s) => s.job)).not.toContain('pull_request');
  });

  it('reads a job condition, folded or inline', () => {
    const text = [
      'jobs:',
      '  a:',
      '    if: >-',
      "      github.event_name == 'push'",
      "      || github.ref == 'refs/heads/main'",
      '    runs-on: ubuntu-latest',
      '  b:',
      "    if: github.event_name == 'push'",
      '  c:',
      '    runs-on: x',
    ].join('\n');
    expect(readJobConditions(text)).toEqual({
      a: "github.event_name == 'push' || github.ref == 'refs/heads/main'",
      b: "github.event_name == 'push'",
    });
  });

  it('skips a stray line at job indent before any job key has been seen', () => {
    const text = ['jobs:', '  # nothing yet, jobs: just opened', '  build:', '    if: true'].join('\n');
    expect(readJobConditions(text)).toEqual({ build: 'true' });
  });

  it('drops a blank line inside a folded condition, rather than blanking the rest', () => {
    const text = ['jobs:', '  build:', '    if: >-', '      first part', '', '      second part', '    steps:'].join('\n');
    expect(readJobConditions(text)).toEqual({ build: 'first part second part' });
  });
});

describe('comparing one command across files', () => {
  it('treats the Makefile $(TSX) and $(DRIVER) and the workflow path as the same command', () => {
    expect(normalise('$(TSX) tools/src/gates/x.ts')).toBe(normalise('node_modules/.bin/tsx  tools/src/gates/x.ts'));
    expect(normalise('@$(DRIVER) --target preflight')).toBe(
      '@node_modules/.bin/tsx tools/src/run-gates.ts --target preflight',
    );
  });

  it('flattens a wrapped block scalar onto one line', () => {
    expect(normalise('run: |\n  find . \\\n    -name x\n')).toBe('run: | find . -name x');
  });

  it('matches where a command starts, never mid-path', () => {
    // registry-C3: `tools/node_modules/.bin/tsx` ends with the wired text and
    // runs a binary that is not there.
    expect(runsCommand('node_modules/.bin/tsx a.ts', 'node_modules/.bin/tsx a.ts')).toBe(true);
    expect(runsCommand('@node_modules/.bin/tsx a.ts', 'node_modules/.bin/tsx a.ts')).toBe(true);
    expect(runsCommand('tools/node_modules/.bin/tsx a.ts', 'node_modules/.bin/tsx a.ts')).toBe(false);
  });

  it('reads recipe lines with the target that owns them', () => {
    expect(recipeLines('a:\n\tone\nB = 1\nb: a\n\ttwo\n')).toEqual([
      { target: 'a', line: 2, text: 'one' },
      { target: 'b', line: 5, text: 'two' },
    ]);
  });

  it('names the programs a row runs, by repo-relative path only', () => {
    expect(programsOf(WIDGET_GATE)).toEqual(['tools/src/gates/check-widget.ts']);
    expect(programsOf({ ...WIDGET_GATE, wired: 'tsx /elsewhere/tools/src/gates/check-x.ts', command: 'x' })).toEqual([]);
    const generator = { ...WIDGET_GATE, wired: 'tsx tools/src/gen/gen-x.ts --check', command: 'make gate G=gen-x ARGS=--check' };
    expect(programsOf(generator)).toEqual(['tools/src/gen/gen-x.ts']);
  });
});

describe('anchors', () => {
  it('slugs a heading the way the triage page is linked: punctuation dropped, spaces kept', () => {
    expect(slug('Gate suite (vitest)')).toBe('gate-suite-vitest');
    expect(slug('Legacy build (make check)')).toBe('legacy-build-make-check');
  });
});

describe('the gate', () => {
  it('passes when everything agrees, counting rows and workflows', async () => {
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe(`[gates-sync] 1 gates agree with the Makefile, 1 workflow, their programs and ${TRIAGE}`);
  });

  it('fails on a new workflow step nobody registered', async () => {
    sb.write(WF, `${WORKFLOW}      - name: Brand new check\n        run: true\n`);
    const r = await sb.run(spec);
    expectFail(r, '"Brand new check"');
    expect(r.err).toContain('setup_steps');
  });

  it('accepts a new step that is declared as setup', async () => {
    sb.write(WF, `${WORKFLOW}      - name: Install the thing\n        run: true\n`);
    editRegistry((r) => {
      r.setup_steps['Install the thing'] = 'installs, checks nothing';
    });
    expectPass(await sb.run(spec));
  });

  it('catches the command drifting inside a step that kept its name', async () => {
    sb.write(WF, WORKFLOW.replace('check-widget.ts', 'check-widget.ts --only-some-of-it'));
    // Still a superstring, so still fine — drift is a command that no longer
    // CONTAINS the registered one.
    expectPass(await sb.run(spec));
    sb.write(WF, WORKFLOW.replace('tools/src/gates/check-widget.ts', 'tools/src/gates/other.ts'));
    expectFail(await sb.run(spec), "does not run the registry's command");
  });

  it('catches a step registered in the wrong job', async () => {
    editRegistry((r) => {
      (r.gates[0] as Gate).ci_job = 'site';
    });
    expectFail(await sb.run(spec), 'is in job "validate", registry says "site"');
  });

  it('catches a row that runs in CI with no step name', async () => {
    editRegistry((r) => {
      delete (r.gates[0] as Gate).ci_step;
    });
    expectFail(await sb.run(spec), 'widget-check runs in ci but declares no ci_step');
  });

  it('lets a claimed row skip the per-job crowd count when it names no job', async () => {
    // ci_job is how a shared job's crowding is tallied, and it is also how
    // checkJobs knows the job holds a gate; drop it and both back off, which
    // this reads as the job going unclaimed rather than as a crash.
    editRegistry((r) => {
      delete (r.gates[0] as Gate).ci_job;
    });
    expectFail(await sb.run(spec), 'job "validate" holds no gate');
  });

  it('catches a triage anchor with no heading behind it', async () => {
    sb.write(TRIAGE, triage(['Something else']));
    expectFail(await sb.run(spec), `[gates-sync] FAIL ${TRIAGE}: has no heading "#widget-check" — widget-check links there`);
  });

  it('does not take a heading inside a code fence as an anchor', async () => {
    sb.write(TRIAGE, `${triage(['Something else'])}\n\`\`\`md\n## Widget check\n\`\`\`\n`);
    expectFail(await sb.run(spec), '#widget-check');
  });

  it('accepts an explicit anchor in place of a heading', async () => {
    sb.write(TRIAGE, `${triage(['Something else'])}\n<a id="widget-check"></a>\n`);
    expectPass(await sb.run(spec));
  });

  it('catches a runbook file that does not exist', async () => {
    editRegistry((r) => {
      (r.gates[0] as Gate).runbook = 'docs/nowhere.md#widget-check';
    });
    expectFail(await sb.run(spec), 'widget-check points at docs/nowhere.md, which does not exist');
  });

  it('catches a symptom row whose section nobody wrote, and accepts one that has it', async () => {
    editRegistry((r) => {
      r.symptoms.push({ name: 'Main went red', anchor: 'main-went-red', where: '`report`' });
    });
    expectFail(await sb.run(spec), 'the "Main went red" symptom row links there');
    sb.write(TRIAGE, triage(['Widget check', 'Main went red']));
    expectPass(await sb.run(spec));
  });

  it('catches symptoms with no triage page at all to link into', async () => {
    editRegistry((r) => {
      r.symptoms.push({ name: 'Main went red', anchor: 'main-went-red', where: '`report`' });
    });
    sb.rm(TRIAGE);
    expectFail(await sb.run(spec), `symptoms link into ${TRIAGE}, which does not exist`);
  });

  it('insists a row with no wired command says why nothing compares it', async () => {
    editRegistry((r) => {
      delete (r.gates[0] as Gate).wired;
    });
    expectFail(await sb.run(spec), 'wired_note');
  });

  it('excuses a person-only gate from wired/wired_note — nothing runs it to compare', async () => {
    // hasCode short-circuits on the first run place that is 'local' or has a
    // workflow behind it; a person-only gate (no 'local', its one place with
    // no workflow) has to check that place before it is excused.
    editRegistry((r) => {
      r.gates.push({ ...HUMAN_GATE, id: 'someone-else-reads-it' });
    });
    sb.write(TRIAGE, triage(['Widget check', 'Someone reads it']));
    expectPass(await sb.run(spec));
  });

  it('insists positional and fixable are stated, true or false', async () => {
    editRegistry((r) => {
      delete (r.gates[0] as Partial<Gate>).positional;
    });
    expectFail(await sb.run(spec), "widget-check's positional is not true or false");
  });

  it('reports a runs: value that runs_values does not define, and a row that runs nowhere', async () => {
    editRegistry((r) => {
      (r.gates[0] as Gate).runs = ['somewhere-else'];
    });
    expectFail(await sb.run(spec), 'runs_values does not define');
    editRegistry((r) => {
      (r.gates[0] as Gate).runs = [];
    });
    expectFail(await sb.run(spec), 'widget-check runs nowhere');
  });

  it('reports a duplicate gate id', async () => {
    editRegistry((r) => {
      r.gates.push(structuredClone(r.gates[0] as Gate));
    });
    expectFail(await sb.run(spec), 'duplicate gate id: widget-check');
  });

  it('insists the change run place names its workflow file', async () => {
    editRegistry((r) => {
      delete r.runs_values['ci']?.workflow;
    });
    expectFail(await sb.run(spec), 'runs_values names no workflow file for "ci"');
  });

  it('fails when a row runs in a workflow that does not exist', async () => {
    editRegistry((r) => {
      r.runs_values['nightly'] = { meaning: 'a nightly.yml step', workflow: '.github/workflows/nightly.yml' };
      (r.gates[0] as Gate).runs = ['nightly'];
    });
    expectFail(await sb.run(spec), '[gates-sync] FAIL .github/workflows/nightly.yml: does not exist');
  });

  it('says nothing about a missing workflow that no row claims to run in', async () => {
    // A place can exist in runs_values (documentation-only, or not yet wired
    // to a gate) with no row pointing at it — a missing file there is not a
    // registry/reality mismatch, since reality promised nothing.
    editRegistry((r) => {
      r.runs_values['nightly'] = { meaning: 'a nightly.yml step', workflow: '.github/workflows/nightly.yml' };
    });
    expectPass(await sb.run(spec));
  });

  it('skips the change-place jobs check entirely when its workflow file is missing', async () => {
    // checkJobs and checkConditionalJobs both read the CHANGE_PLACE workflow
    // a second time; a row can still claim to run there even though the file
    // itself is gone, and both checks have to back off rather than crash on
    // a read of nothing.
    editRegistry((r) => {
      (r.runs_values['ci'] as { workflow?: string }).workflow = '.github/workflows/gone.yml';
    });
    const r = await sb.run(spec);
    expectFail(r, '[gates-sync] FAIL .github/workflows/gone.yml: does not exist');
    expect(r.err).not.toContain('holds no gate');
    expect(r.err).not.toContain('conditional_jobs');
  });

  it('reads no workflow the registry does not name', async () => {
    // legacy.yml runs the pre-migration build; nothing registers it, so a
    // step there is none of this gate's business.
    sb.write('.github/workflows/legacy.yml', 'jobs:\n  legacy:\n    steps:\n      - name: make check\n        run: make check\n');
    expectPass(await sb.run(spec));
  });

  it('rejects an argument, since it takes none', async () => {
    expectMisuse(await sb.run(spec, ['--check']));
    expectMisuse(await sb.run(spec, ['--nope']));
  });

  it('says the registry is missing, or not JSON, rather than crashing on it', async () => {
    sb.rm(SRC);
    expectFail(await sb.run(spec), `[gates-sync] FAIL ${SRC}: is missing`);
    sb.write(SRC, '{ nope');
    expectFail(await sb.run(spec), 'not valid JSON');
  });
});

describe('jobs', () => {
  it('catches a job that holds no gate and is declared nowhere', async () => {
    sb.write(WF, WITH_REPORT_JOB);
    editRegistry((r) => {
      r.setup_steps['Say main went red'] = 'a reporting step';
      r.conditional_jobs['report'] = 'it has nothing to say on a pull request';
    });
    expectFail(await sb.run(spec), 'job "report" holds no gate');
  });

  it('accepts a gateless job declared as a reporting job, and conditional', async () => {
    sb.write(WF, WITH_REPORT_JOB);
    editRegistry((r) => {
      r.setup_steps['Say main went red'] = 'a reporting step';
      r.reporting_jobs['report'] = 'it says main went red';
      r.conditional_jobs['report'] = 'it has nothing to say on a pull request';
    });
    expectPass(await sb.run(spec));
  });

  it('catches a conditional job the registry never declared', async () => {
    sb.write(WF, WITH_REPORT_JOB);
    editRegistry((r) => {
      r.setup_steps['Say main went red'] = 'a reporting step';
      r.reporting_jobs['report'] = 'it says main went red';
    });
    expectFail(await sb.run(spec), 'add it to conditional_jobs');
  });

  it('catches reporting_jobs or conditional_jobs naming a job the workflow lacks', async () => {
    editRegistry((r) => {
      r.reporting_jobs['report'] = 'renamed or never landed';
    });
    expectFail(await sb.run(spec), 'reporting_jobs names "report", which is not a job in');
    editRegistry((r) => {
      r.reporting_jobs = {};
      r.conditional_jobs['nightly'] = 'renamed or never landed';
    });
    expectFail(await sb.run(spec), 'conditional_jobs names "nightly", which is not a job in');
  });

  it('refuses to count a job as reporting when a gate runs there', async () => {
    editRegistry((r) => {
      r.reporting_jobs['validate'] = 'claiming the job every gate runs in';
    });
    expectFail(await sb.run(spec), 'registry gates run there');
  });

  it('catches a declared conditional job with no if:, or one gated on something else', async () => {
    editRegistry((r) => {
      r.conditional_jobs['validate'] = 'claiming a job that always runs';
    });
    expectFail(await sb.run(spec), 'has no `if:`');

    sb.write(WF, WITH_REPORT_JOB.replace("if: ${{ failure() && github.event_name == 'push' }}", "if: ${{ github.actor != 'bot' }}"));
    editRegistry((r) => {
      r.conditional_jobs = { report: 'a third rule' };
      r.setup_steps['Say main went red'] = 'a reporting step';
      r.reporting_jobs['report'] = 'it says main went red';
    });
    expectFail(await sb.run(spec), 'turns on neither');
  });

  it('treats a registry with no setup_steps map as having none, not every step excused', async () => {
    // setup_steps is required by the type, but the file on disk is read as
    // plain JSON — a hand-edited registry.json missing the key entirely is
    // not a type error until something reads it, and this is that something.
    editRegistry((r) => {
      delete (r as Partial<RegistryFixture>).setup_steps;
    });
    expectFail(await sb.run(spec), 'step "Install repo tooling" (job validate) is in no registry entry');
  });

  it('treats a missing reporting_jobs map the same as an empty one', async () => {
    editRegistry((r) => {
      delete (r as Partial<RegistryFixture>).reporting_jobs;
    });
    expectPass(await sb.run(spec));
  });

  it('treats a missing conditional_jobs map the same as an empty one', async () => {
    editRegistry((r) => {
      delete (r as Partial<RegistryFixture>).conditional_jobs;
    });
    expectPass(await sb.run(spec));
  });
});

describe('the local side, now that the Makefile lists nothing', () => {
  it('accepts a driven gate that the Makefile never names', async () => {
    // The whole point of the driver: `validate` is one line, and the gate list
    // lives in the registry. A Makefile text search would fail this.
    expect(DRIVER_MAKEFILE).not.toContain('check-widget');
    expectPass(await sb.run(spec));
  });

  it('fails when the Makefile stops calling the driver, or is gone', async () => {
    sb.write('Makefile', 'validate:\n\t@echo nothing\n');
    expectFail(await sb.run(spec), '`validate` does not run the collecting driver');
    sb.rm('Makefile');
    expectFail(await sb.run(spec), '[gates-sync] FAIL Makefile: is missing');
  });

  it('fails when a row names a make target that does not exist', async () => {
    editRegistry((r) => {
      (r.gates[0] as Gate).local_target = 'preflight';
    });
    expectFail(await sb.run(spec), 'has no `preflight` target');
  });

  it('wants a non-default target to say which set it is asking for', async () => {
    editRegistry((r) => {
      (r.gates[0] as Gate).local_target = 'preflight';
    });
    sb.write('Makefile', `${DRIVER_MAKEFILE}\npreflight:\n\t@$(DRIVER)\n`);
    expectFail(await sb.run(spec), '--target preflight');
    sb.write('Makefile', `${DRIVER_MAKEFILE}\npreflight:\n\t@$(DRIVER) --target preflight\n`);
    expectPass(await sb.run(spec));
  });

  it('keeps the local-vs-CI comparison: local_command must contain what CI runs', async () => {
    editRegistry((r) => {
      (r.gates[0] as Gate).local_command = 'node_modules/.bin/tsx tools/src/gates/check-other.ts';
    });
    sb.write('tools/src/gates/check-other.ts', '// claimed through local_command\n');
    expectFail(await sb.run(spec), 'does not contain the command CI runs');
  });

  it('accepts a local_command that wraps the CI command', async () => {
    editRegistry((r) => {
      (r.gates[0] as Gate).local_command = `rc=0; ${WIDGET_GATE.wired as string} || rc=1; exit $rc`;
    });
    expectPass(await sb.run(spec));
  });

  it('fails a row that declares local_command but does not claim to run locally', async () => {
    editRegistry((r) => {
      (r.gates[0] as Gate).runs = ['ci'];
    });
    expectFail(await sb.run(spec), 'declares local_command but does not run locally');
  });

  it('text-searches the Makefile for an undriven local gate', async () => {
    editRegistry((r) => {
      delete (r.gates[0] as Gate).local_command;
    });
    expectFail(await sb.run(spec), "runs nothing matching widget-check's command");
    sb.write('Makefile', `${DRIVER_MAKEFILE}\ntools-test:\n\t$(TSX) tools/src/gates/check-widget.ts\n`);
    expectPass(await sb.run(spec));
  });

  it('catches a gate wired into a gate-running target that no row claims', async () => {
    sb.write('Makefile', `${DRIVER_MAKEFILE}\t$(TSX) tools/src/gates/check-brand-new.ts\n`);
    const r = await sb.run(spec);
    expectFail(r, 'runs a gate no registry entry claims');
    expect(r.err).toMatch(/\[gates-sync\] FAIL Makefile:6: /);
  });

  it('has nothing to text-search the Makefile for when an undriven local gate names no wired command either', async () => {
    // wired_note is the row's own admission that nothing compares the two
    // sides — the Makefile search this describe block is named for has no
    // command to look for.
    editRegistry((r) => {
      r.gates.push({
        ...(r.gates[0] as Gate),
        id: 'no-wired-either',
        runs: ['local'],
        wired: undefined,
        local_command: undefined,
        wired_note: 'a shell one-liner, compared by eye',
      } as unknown as Gate);
    });
    sb.write(TRIAGE, triage(['Widget check']));
    expectPass(await sb.run(spec));
  });

  it('leaves the on-request targets alone', async () => {
    sb.write('Makefile', `${DRIVER_MAKEFILE}\ngates:\n\t$(TSX) tools/src/gen/gen-something.ts\n`);
    sb.write('tools/src/gen/gen-something.ts', '// claimed below\n');
    editRegistry((r) => {
      r.gates.push({ ...structuredClone(WIDGET_GATE), id: 'something-fresh', runs: ['human'], command: 'make gate G=gen-something' });
    });
    sb.write(TRIAGE, triage(['Widget check']));
    expectPass(await sb.run(spec));
  });
});

describe('the programs on disk', () => {
  it('catches a check gate on disk that nothing runs', async () => {
    sb.write('tools/src/gates/check-orphan.ts', '// nobody runs me\n');
    expectFail(
      await sb.run(spec),
      '[gates-sync] FAIL tools/src/gates/check-orphan.ts: is a check gate no registry entry runs',
    );
  });

  it('catches a generator on disk that nothing runs', async () => {
    sb.write('tools/src/gen/gen-orphan.ts', '// nobody runs me\n');
    expectFail(await sb.run(spec), 'tools/src/gen/gen-orphan.ts: is a check gate no registry entry runs');
  });

  it('does not mistake a gate’s own test file, or a helper, for an unrun gate', async () => {
    sb.write('tools/src/gates/check-widget.test.ts', '// the gate’s test\n');
    sb.write('tools/src/gates/helpers.ts', '// not a gate\n');
    expectPass(await sb.run(spec));
  });

  it('counts a program claimed only through make gate G=', async () => {
    sb.write('tools/src/gates/check-by-name.ts', '// run as make gate G=check-by-name\n');
    editRegistry((r) => {
      r.gates.push({
        ...structuredClone(WIDGET_GATE),
        id: 'by-name',
        command: 'make gate G=check-by-name',
        runs: ['human'],
      });
    });
    expect((await sb.run(spec)).err).not.toContain('check-by-name.ts: is a check gate');
  });

  it('catches a row whose program is gone', async () => {
    sb.rm('tools/src/gates/check-widget.ts');
    expectFail(await sb.run(spec), `[gates-sync] FAIL ${SRC}: widget-check runs tools/src/gates/check-widget.ts, which does not exist`);
  });
});

describe('a step that would be hidden by the one before it', () => {
  const second: Gate = {
    ...WIDGET_GATE,
    id: 'widget-check-two',
    name: 'Widget check two',
    ci_step: 'Widget check two',
    wired: 'node_modules/.bin/tsx tools/src/gates/check-widget-two.ts',
    runbook: 'docs/reference/triage.md#widget-check',
  };

  it('fails a gate step with no `if:` when another gate shares its job', async () => {
    gatesTree(sb, gatesRegistry((r) => r.gates.push(second)));
    sb.write(WF, sb.read(WF).replace(/(- name: Widget check two\n)\s+if: .*\n/, '$1'));
    expectFail(await sb.run(spec), '"Widget check two" has no `if:`');
  });

  it('accepts it once the condition is there, whatever the condition is', async () => {
    gatesTree(sb, gatesRegistry((r) => r.gates.push(second)));
    expectPass(await sb.run(spec));
  });

  it('asks nothing of the only gate in its job — nothing can hide it', async () => {
    sb.write(WF, WORKFLOW.replace(/(- name: Widget check\n)\s+if: .*\n/, '$1'));
    expectPass(await sb.run(spec));
  });
});

describe('the gate count', () => {
  it('passes a counted block that states the registry’s total', async () => {
    sb.write(TRIAGE, triagePage(['Widget check'], gatesRegistry()));
    expectPass(await sb.run(spec));
  });

  it('names a stale total in the file that states it', async () => {
    const twoGates = gatesRegistry((r) => r.gates.push({ ...WIDGET_GATE, id: 'x' }));
    sb.write(TRIAGE, triagePage(['Widget check'], twoGates));
    expectFail(await sb.run(spec), `[gates-sync] FAIL ${TRIAGE}: its gate count block is stale — the registry holds 1 gates; run: ${FIX}`);
  });

  it('says nothing about the count in a file that carries no gate-count markers at all', async () => {
    // A file can exist and even be COUNT_FILES-eligible without ever having
    // grown the block — nothing to splice into means nothing to compare.
    sb.write(
      TRIAGE,
      ['# Triage a red gate', '', 'Hand-written prose that must survive every regeneration.', '', '## Widget check', ''].join('\n'),
    );
    expectPass(await sb.run(spec));
  });
});

describe('oracle scenarios', () => {
  it('registry-O1: a consistent row passes; a workflow-only step rename gives two findings on the workflow file', async () => {
    // The row names its CI job and step, local command and runbook anchor,
    // matching the change workflow, the program and a triage heading.
    const r0 = await sb.run(spec);
    expectPass(r0);
    expect(r0.out.split('\n')).toHaveLength(1);

    sb.write(WF, WORKFLOW.replace('- name: Widget check', '- name: Widget checks'));
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err.split('\n')).toEqual([
      `[gates-sync] FAIL ${WF}: no step named "Widget check" — registered by widget-check in ${SRC}`,
      `[gates-sync] FAIL ${WF}: step "Widget checks" (job validate) is in no registry entry — add it to ${SRC}, or to setup_steps there if it checks nothing`,
    ]);
  });
});

describe('the real tree', () => {
  const real = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, SRC), 'utf8')) as Registry;

  it('agrees with the real Makefile, workflow, programs and triage page, counting the rows', async () => {
    // testing-C4: the rows are recounted from the registry's JSON by this
    // test, and the workflows from the run places that name a file.
    const workflows = Object.values(real.runs_values).filter((p) => p.workflow !== undefined).length;
    sb.rm('docs');
    sb.rm('.github');
    sb.rm('tools');
    sb.rm('Makefile');
    sb.copyRepo(SRC, TRIAGE, ...COUNT_FILES, 'Makefile', 'tools/src/gates', 'tools/src/gen');
    // A row may run a program outside those two folders (the migration's, until the cutover).
    for (const g of real.gates) for (const p of programsOf(g)) if (!sb.exists(p)) sb.copyRepo(p);
    for (const p of Object.values(real.runs_values)) if (p.workflow !== undefined) sb.copyRepo(p.workflow);

    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe(
      `[gates-sync] ${real.gates.length} gates agree with the Makefile, ${workflows} ${workflows === 1 ? 'workflow' : 'workflows'}, their programs and ${TRIAGE}`,
    );
  });

  it('holds each row to its program: name, file arguments and repair agree both ways', async () => {
    // registry-C8 and gates-C2: a row's `positional` and `fixable` match what
    // its program declares, and the bracketed name every finding leads with is
    // the row's id — so a finding line always finds its row.
    for (const g of real.gates) {
      const program = programsOf(g)[0];
      expect(program, `${g.id} names no program`).toBeDefined();
      const mod = (await import(pathToFileURL(path.join(REPO_ROOT, program as string)).href)) as { spec: GateSpec };
      expect(mod.spec.name, g.id).toBe(g.id);
      expect(mod.spec.positional === true, `${g.id} positional`).toBe(g.positional);
      expect(mod.spec.fixable === true, `${g.id} fixable`).toBe(g.fixable);
    }
  });

  it("holds a freshness check's fix to its generator's repair command", async () => {
    // registry-C8: each generator's own FIX is what its STALE lines print.
    const checks = real.gates.filter((row) => row.wired?.includes('--check') === true);
    expect(checks.length).toBeGreaterThan(0);
    for (const g of checks) {
      const program = programsOf(g)[0] as string;
      const mod = (await import(pathToFileURL(path.join(REPO_ROOT, program)).href)) as { FIX?: string };
      expect(mod.FIX, `${g.id}: ${program} exports no FIX`).toBeDefined();
      expect(g.fix, g.id).toBe(mod.FIX);
    }
    expect(real.gates.find((row) => row.id === 'gates-fresh')?.fix).toBe(FIX);
  });
});
