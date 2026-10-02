#!/usr/bin/env node
// Build one self-contained Workflow script per unfinished wave-1 lane, so a new session can restart it.
//
//   node plans/wave1/resume/make-lane-scripts.mjs [--journal <lane>=<journal.jsonl> ...] [--out <dir>]
//
// Inputs, all in this folder:
//   plan.json   per lane: `steps` (which lanes.json steps still run, in order; [] = verify and fix only)
//               and `note` (where the lane stopped, handed to every agent as "Resuming this lane").
//   prior.json  per lane: reports of the steps already finished. A --journal flag folds the finished
//               steps of that run's journal.jsonl into it (a later run's report replaces an earlier one).
//   findings.json  per lane: the verifier findings of a run whose verify phase finished, each tagged
//               with its lens; --journal writes them. A lane whose plan.json entry says
//               `"reuse_findings": true` skips its verifiers and hands these to the fix step.
// Output: lane-<lane>.js for each lane in plan.json (default: this folder). Launch one with
//   Workflow({ scriptPath: '<abs path>/lane-<lane>.js' })
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const wave1 = path.dirname(here);
const argv = process.argv.slice(2);
let out = here;
const journals = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') out = argv[++i];
  else if (argv[i] === '--journal') journals.push(argv[++i]);
  else { console.error(`unknown argument: ${argv[i]}`); process.exit(2); }
}

const lanes = JSON.parse(fs.readFileSync(path.join(wave1, 'lanes.json'), 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join(here, 'plan.json'), 'utf8'));
const priorFile = path.join(here, 'prior.json');
const prior = JSON.parse(fs.readFileSync(priorFile, 'utf8'));
const findingsFile = path.join(here, 'findings.json');
const found = fs.existsSync(findingsFile) ? JSON.parse(fs.readFileSync(findingsFile, 'utf8')) : {};
const cut = (t, n) => (typeof t === 'string' && t.length > n ? `${t.slice(0, n)}…` : t);

for (const spec of journals) {
  const [lane, file] = spec.split('=');
  const events = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const label = {};
  for (const e of events) if (e.type === 'started') label[e.key] = e.label;
  const steps = [];
  const fan = {};
  const lensFindings = [];
  for (const e of events) {
    if (e.type !== 'result' || !e.result) continue;
    const parts = (label[e.key] || '').split(':');
    if (parts[1] === 'verify') {
      for (const f of e.result.findings || []) lensFindings.push({ lens: parts[2], ...f });
      continue;
    }
    if (parts[1] === 'fix') continue;
    if (parts.length === 3) {
      (fan[parts[1]] ||= []).push({ summary: cut(e.result.summary, 400), problems: (e.result.problems || []).slice(0, 4).map((p) => cut(p, 250)), files: (e.result.changed_files || []).length });
    } else {
      const { batches, ...rest } = e.result;
      steps.push({ step: parts[1], ...rest, batch_count: Array.isArray(batches) ? batches.length : 0 });
    }
  }
  for (const [k, v] of Object.entries(fan)) steps.push({ step: k, fanout: v });
  const kept = (prior[lane] || []).filter((r) => !steps.some((s) => s.step === r.step));
  prior[lane] = [...kept, ...steps];
  if (lensFindings.length > 0) found[lane] = lensFindings;
  console.log(`${lane}: folded ${steps.map((s) => s.step).join(', ') || 'nothing'}${lensFindings.length ? ` and ${lensFindings.length} verifier finding(s)` : ''} from ${file}`);
}
fs.writeFileSync(priorFile, `${JSON.stringify(prior, null, 1)}\n`);
fs.writeFileSync(findingsFile, `${JSON.stringify(found, null, 1)}\n`);

const src = fs.readFileSync(path.join(wave1, 'kb-lane.js'), 'utf8');
for (const [key, p] of Object.entries(plan)) {
  const L = { ...lanes[key] };
  const order = L.steps.map((s) => s.key);
  L.steps = L.steps.filter((s) => p.steps.includes(s.key));
  L.prior = (prior[key] || []).slice().sort((a, b) => order.indexOf(a.step) - order.indexOf(b.step));
  L.resume_note = p.note;
  if (p.reuse_findings) {
    if (!Array.isArray(found[key])) { console.error(`${key}: reuse_findings is set but findings.json holds none for it`); process.exit(1); }
    L.findings = found[key];
  }
  const script = src
    .replace("name: 'kb-migration-lane',", `name: 'kb-lane-${key}',`)
    // URI-encoded: the Workflow tool's parser misreads some long JSON literals (an "unterminated
    // string" on the kbcli findings, 2026-09-29), and a function replacer keeps `$` literal.
    .replace('const L = args', () => `const L = JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(L))}"))`);
  fs.writeFileSync(path.join(out, `lane-${key}.js`), script);
  const tail = L.findings ? `fix only, reusing ${L.findings.length} finding(s)` : 'verify + fix only';
  console.log(`lane-${key}.js: steps ${L.steps.map((s) => s.key).join(' → ') || `(${tail})`}; prior ${L.prior.map((r) => r.step).join(', ') || 'none'}`);
}
