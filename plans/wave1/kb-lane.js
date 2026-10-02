export const meta = {
  name: 'kb-migration-lane',
  description: 'One lane of the kb-spec migration in its own worktree: sequential implement steps (some fanned out), adversarial verify, fix and report',
  phases: [
    { title: 'Implement', detail: 'the lane steps, in order; a fan-out step splits the previous step\'s batches' },
    { title: 'Verify', detail: 'oracle scenarios + planted defects, spec C-rows, and a lane-specific lens' },
    { title: 'Fix', detail: 'apply verified findings, prove every check green, commit, report' },
  ],
}

const L = args
const W = L.worktree
const SPEC = '/Users/oleksandrderechei/git/claude-code-marketplace/tmp/cookbook/spec'
const KIT = '/Users/oleksandrderechei/git/claude-code-marketplace/tmp/cookbook/kit'
const COAUTHOR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const BASE = '4ca79c1'
const LANES = {
  content: 'gates for frontmatter, docs-style, docs-map, kb-shape (block order, suffix grammar, section facts, sketch langs, area = folder, unique slugs) and repo links; gen-map; docs/README.md; docs/reference/page-rules.md; a `reference` area for the hand-written docs pages (its own extractor module); editorial F24/F25',
  tags: 'the structure gate + lib/published; the tags gate + gen-taxonomy + lib/tags + docs/reference/tags.md; tag facets in scripts/lib/model.mjs TAGS; site/src/lib/types.ts (the flat TAGS tuple only); the retag of site pages; F9, F23',
  vocab: 'glossary.json + the vocabulary gate + gen-vocabulary + docs/reference/glossary.md; the ban gate (tone.md cut list + the retired words) and the prose fixes it demands; the exceptions unit (allowlist format); products.json + the products gate (offline half); search-synonyms.json',
  relations: 'the relations gate over relations.json; the learning-paths gate; prerequisites.json + gen-prerequisites + the prerequisites gate + docs/reference/prerequisites.md; the maturity (status) gate; the gen-relations/gen-tours CLIs for the cutover (not registered yet); F1',
  harness: 'the self-check shape and route gates; the kit skills and agents; docs/records/; TONE ids in tone.md; the stale harness pointers; the 46 skills reshaped to the spec skill shape (content still pre-cutover); root CLAUDE.md (only this lane edits it)',
  site: 'the Astro + Starlight workspace under site/ beside today\'s HTML (site/package.json, astro.config.mjs, tsconfig.json, src/** except src/lib/types.ts), root workspaces + site dependencies, the site generators and site gates, pagedata, components, map pages, mermaid SVG, the search payload and the one shared scorer, RT-2',
  kbcli: 'tools/src/kb/** (kb.mjs v2) and its parity test against scripts/kb.mjs; not switched on until the cutover',
}
const others = Object.entries(LANES).filter(([k]) => k !== L.key).map(([k, v]) => `- **${k}** (../patterns-kb-${k}): ${v}`).join('\n')

const RULES = `## Where you work — non-negotiable
- You work ONLY in the git worktree ${W} (branch \`lane/${L.key}\`, branched from ${BASE} on \`harness/optimize\`). The shell resets cwd between calls: begin EVERY shell command with \`cd ${W} && …\` (or \`cd ${W}/tools && …\`) and use absolute paths under ${W} for file tools.
- NEVER write to /Users/oleksandrderechei/git/patterns-kb (the main tree) or any other ../patterns-kb-* worktree. Scratch files go under /private/tmp/kb-${L.key}/.
- Git: stage exact file paths only (never \`git add -A\`, \`.\`, or a directory — for many files build an explicit list and pass it with \`git add --\`); never \`git checkout --\`, \`git restore\`, \`git stash\` or \`git reset --hard\`; never \`--no-verify\`; never push. Commit subjects are conventional, ≤72 chars; the body says what and why; end every message with a blank line then \`${COAUTHOR}\`. The pre-commit hook runs \`make check\` on the staged tree and must pass.
- If you find uncommitted changes in the worktree when you start, a previous attempt at your step died mid-work (for example on a session limit): read them first, keep what is right, finish the job; never discard them.
- In any NEW prose you write (docs, skills, comments, commit bodies), do not use the words "mint(ed)" or "derive(d)/derivable" — the owner retired them; say issue/generate/compute/build/work out. Existing code identifiers (mintIds, deriveElements) keep their names. Prefer plain words over fancy ones everywhere.
- Up to four lanes run at once on this 14-core machine. A test that fails only on a timeout: re-run that file alone before diagnosing. While developing, run the test files you touch; run the full \`make validate\` at the end of a step.`

const CONTEXT = `## The migration and where it stands
patterns-kb is migrating onto the \`kb\` spec at ${SPEC} (SPEC.md; acceptance/oracle.md holds every scenario; tree/**/FOLDER.md holds each unit's intent, constraints C-rows and behaviours; assembly.json the unit graph). The reference kit (older names) is ${KIT}; when you copy from it, rename \`ccm\`→\`kb\`, \`sections\`→\`areas\`, \`sidebarUnder\`→\`nestUnder\`, \`personas\`→\`profiles\`, \`audience\`→\`level\`, facets \`activity\`→\`skill\`, \`system\`→\`language\`; never copy check-mdx-imports, lib/artifacts or runbook-* rules/skills. The plan, its decisions and every deviation so far: ${W}/plans/harness-optimize.md — read its Decisions, Target layout, Data files table, your lane's phase text (P3/P4/P5/P6) and the Status block before you start.
Landed on ${BASE}: P0 toolchain; P1 gate framework (contract, registry docs/data/gates.json, driver \`make validate\`, write-or-check, marked blocks, stamps); P4a harness core (context layers, scoped rules, trap inbox docs/inbox.md, claims gate, advisory + guard hooks); P2 (the markdown dialect tools/src/migrate/dialect.md, kb-attrs suffix grammar tools/src/lib/kb-attrs.ts, the one frontmatter parser scripts/fm-json.sh behind tools/src/lib/frontmatter.ts, the converter html-to-md.ts, extract-model.ts, the RT-1 round-trip roundtrip.ts with its ledger known-losses.json, the 382 converted pages under docs/, docs/data/{site-structure,tags,content-model,relations,learning-paths}.json). 13 gates are green; legacy \`make check\` is green; coverage floors in tools/vitest.config.ts are 99/99/99/99 (statements/branches/functions/lines).
**The rule that shapes every lane until the P5 cutover:** the HTML under site/ plus scripts/lib/model.mjs is still the SOURCE. docs/**.md and the generated docs/data files are BUILD OUTPUT: \`make all\` writes them (extract-model then html-to-md, each page stamped with its site source), \`make check\` and the pre-commit hook refuse a stale one, RT-1 (the \`roundtrip\` gate) proves nothing was lost. So: never hand-edit a stamped docs page or a generated data file; to change content, edit site/ (through the kb.mjs writers where one exists: set, link, unlink, explain, production, wild, level; direct HTML text edits elsewhere, never inside a \`kb:generated\` region), or model.mjs, then \`make all\`. A NEW data file that has an existing source in model.mjs/products.mjs/etc. is generated by a NEW extractor module called from extract-model.ts (one import + one call line there); a data file with no existing source is hand-authored with the version/updated/note header. Hand-written docs pages (docs/reference/*, docs/concepts/*, docs/inbox.md) are ordinary sources.
Every new gate has all five pieces — program under tools/src/gates (or gen/), a colocated test (with a real-tree case where the contract allows), a registry row in docs/data/gates.json, a named step in .github/workflows/validate.yml, a section in docs/reference/triage.md — then \`make gates\`. The contract: exit 0 = one summary line on stdout; exit 1 = findings on stderr as \`[name] FAIL <file>[:<line>]: <what>\` (or \`<RULE-ID> <file>:<line> <message>\`); exit 2 = misuse (\`--nope\`) with empty stdout and an unchanged tree. Every new docs/data file needs an advisory case in .claude/hooks/after-write.sh (the bash suite asserts it and that the note names \`make gate G=check-json\`).
## The other lanes, running in parallel right now (do not do their work; do not edit what they own)
${others}
## Shared files — additive, local edits only; conflicts are resolved when the lanes merge
- plans/harness-optimize.md: do NOT edit it; put status, deviations and cutover notes in your report.
- root CLAUDE.md (586/600 words): only the harness lane edits it. Directory layers (docs/, tools/, site/, scripts/, tests/ CLAUDE.md, ≤350 words): edit only a line your change makes false.
- docs/data/gates.json, .github/workflows/validate.yml, docs/reference/triage.md, docs/reference/gates.md (generated), Makefile, .claude/hooks/after-write.sh and tests/hooks/after-write.test.sh, tools/src/migrate/extract-model.ts, scripts/lib/model.mjs, docs/README.md: add your own rows, steps, sections, targets, cases and extractor calls; do not reorder or rewrite others'.
- tools/vitest.config.ts: never change the floors; they must hold on your branch — every line you add ships with tests.
- package.json / package-lock.json: only the site lane adds dependencies.
- Generated outputs (graph.json, catalog, docs/ pages, the generated data files) will conflict between lanes; they are regenerated at the merge. Commit your regenerated state anyway so your branch is green on its own.`

const LANE = `# Your lane: ${L.key} — ${L.title}
**Spec units:** ${L.units}
**Oracle scenarios you owe** (each implemented as a test NAMED by its id, asserting exactly what oracle.md says — counts, exit codes, stdout/stderr shape, line numbers): ${L.scenarios}
**You own:** ${LANES[L.key]}
${L.brief}${L.resume_note ? `\n## Resuming this lane\n${L.resume_note}` : ''}`

const DONE = `## Before your step ends
Run and make green: \`cd ${W} && make validate\` (every gate), \`make check\` (legacy), \`bash tests/run.sh\`, \`cd tools && npx tsc --noEmit\`. Commit your work in coherent commits (exact paths). Leave \`git status\` clean unless the step says otherwise. Report honestly: what is done, what is open, every deviation from the spec or the plan with its reason, and anything the P5 cutover must do for your lane (cutover_notes).`

const STEP_SCHEMA = {
  type: 'object',
  properties: {
    commits: { type: 'array', items: { type: 'string' } },
    done: { type: 'array', items: { type: 'string' } },
    open: { type: 'array', items: { type: 'string' } },
    deviations: { type: 'array', items: { type: 'string' } },
    cutover_notes: { type: 'array', items: { type: 'string' } },
    handoff: { type: 'string', description: 'what the next step must know' },
    batches: { type: 'array', items: { type: 'object' }, description: 'only when your step is asked to hand out batches' },
  },
  required: ['commits', 'done', 'open', 'deviations', 'cutover_notes', 'handoff'],
}
const FAN_SCHEMA = {
  type: 'object',
  properties: {
    changed_files: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['changed_files', 'summary', 'problems'],
}
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, where: { type: 'string' }, what: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['severity', 'where', 'what', 'evidence', 'fix'] } },
    summary: { type: 'string' },
  },
  required: ['findings', 'summary'],
}
const FINAL_SCHEMA = {
  type: 'object',
  properties: {
    commits: { type: 'array', items: { type: 'string' } },
    head: { type: 'string' },
    checks: { type: 'object', properties: { validate: { type: 'string' }, make_check: { type: 'string' }, bash: { type: 'string' }, tsc: { type: 'string' }, coverage: { type: 'string' } }, required: ['validate', 'make_check', 'bash', 'tsc', 'coverage'] },
    scenarios: { type: 'array', items: { type: 'string' }, description: 'each owed scenario id: covered by which test, or why not' },
    findings_fixed: { type: 'array', items: { type: 'string' } },
    findings_rejected: { type: 'array', items: { type: 'string' } },
    open: { type: 'array', items: { type: 'string' } },
    deviations: { type: 'array', items: { type: 'string' } },
    cutover_notes: { type: 'array', items: { type: 'string' } },
    merge_notes: { type: 'array', items: { type: 'string' }, description: 'shared files you touched and how to resolve them at the merge' },
  },
  required: ['commits', 'head', 'checks', 'scenarios', 'findings_fixed', 'findings_rejected', 'open', 'deviations', 'cutover_notes', 'merge_notes'],
}

phase('Implement')
// A resumed lane passes the reports of the steps it already finished, so later steps and the verifiers see them.
const reports = Array.isArray(L.prior) ? [...L.prior] : []
let prev = null
for (const s of L.steps) {
  if (s.fanout) {
    const items = (prev && Array.isArray(prev.batches)) ? prev.batches : []
    log(`${L.key}: fan-out "${s.key}" over ${items.length} batch(es)`)
    const rs = await parallel(items.map((b, i) => () => agent(`${RULES}\n${CONTEXT}\n${LANE}
# Fan-out step "${s.key}": ${s.title} — batch ${i + 1} of ${items.length}
${s.prompt}
## Your batch
${JSON.stringify(b, null, 1)}
Other agents are working the other batches in this same worktree at this moment: edit ONLY the files your batch names; do not commit; do not run \`make all\`, \`make validate\`, \`make check\` or \`make tools-test\` (the next step does, once). Report every file you changed and every item you could not do, with the reason.`, { label: `${L.key}:${s.key}:${i + 1}`, phase: 'Implement', schema: FAN_SCHEMA, model: s.model })))
    const ok = rs.filter(Boolean)
    reports.push({ step: s.key, fanout: ok.map(r => ({ summary: r.summary, problems: r.problems, files: r.changed_files.length })) })
    log(`${L.key}: fan-out "${s.key}" — ${ok.length}/${items.length} batches returned`)
    prev = { fanout: ok }
    continue
  }
  const r = await agent(`${RULES}\n${CONTEXT}\n${LANE}
# Step "${s.key}": ${s.title}
${s.prompt}
${reports.length ? `## Earlier steps of this lane reported\n${JSON.stringify(reports, null, 1)}` : ''}
${s.batches ? `## Batches\nEnd this step by returning \`batches\`: ${s.batches}` : ''}
${DONE}`, { label: `${L.key}:${s.key}`, phase: 'Implement', schema: STEP_SCHEMA, model: s.model })
  if (!r) {
    log(`${L.key}: step "${s.key}" returned nothing — stopping the lane so it can be resumed`)
    return { lane: L.key, stopped_at: s.key, reports }
  }
  const { batches, ...rest } = r
  reports.push({ step: s.key, ...rest, batch_count: Array.isArray(batches) ? batches.length : 0 })
  log(`${L.key}: step "${s.key}" — ${r.commits.length} commit(s), ${r.open.length} open`)
  prev = r
}

phase('Verify')
const VRULES = `${RULES}\nYou are a VERIFIER. Do NOT edit any file in ${W} and do not commit there. Plant defects only in your OWN detached worktree, under the main checkout's \`.claude/worktrees/\` (the owner's rule: every worktree lives there; it is gitignored, and this is the one place in the main tree you may write): \`cd ${W} && git worktree add --detach /Users/oleksandrderechei/git/patterns-kb/.claude/worktrees/kb-${L.key}-<your-lens> HEAD && cd /Users/oleksandrderechei/git/patterns-kb/.claude/worktrees/kb-${L.key}-<your-lens> && make install\` (a real install of its own: never symlink the lane's node_modules, because a make target that sees a stale install stamp runs npm ci through the link and empties the lane's install, as happened on 2026-09-24), and remove it at the end with \`cd ${W} && git worktree remove --force <path>\`. Report only findings you can evidence with exact excerpts or command output.`
const LENSES = [
  { key: 'oracle', model: 'opus', prompt: `## Oracle scenarios and planted defects
For each scenario in [${L.scenarios}] read it in ${SPEC}/acceptance/oracle.md, find the test NAMED by its id, and check it asserts EXACTLY what the scenario says. A scenario with no test, or a test that asserts less, is a finding. Then, in your own worktree, plant in the real tree the defects each new gate of this lane exists to catch (and near-misses that must pass) and run the gates through \`make gate G=<stem>\` and \`make validate\`: every defect not caught, every near-miss wrongly flagged, every finding in the wrong shape (contract) is a finding. Run each new gate with \`--nope\`: exit 2, empty stdout, unchanged tree.` },
  { key: 'spec', model: 'opus', prompt: `## Spec conformance
For each spec unit this lane owns (${L.units}), read its FOLDER.md in ${SPEC}/tree and check every constraint row (C1, C2, …) and every behaviour against what the lane built — code, data files, reference pages, registry rows, validate.yml steps, triage sections, advisory cases. Each unmet constraint the lane owns is a finding (name the C-row). Also check the five pieces of every new gate, that no gate was silenced or weakened, that RT-1 was not weakened (git diff ${BASE} -- tools/src/migrate/roundtrip.ts tools/src/migrate/rt-*.ts tools/src/migrate/known-losses.json), that the floors in tools/vitest.config.ts are untouched and hold, and that no file outside the lane's ownership was rewritten.` },
  ...(L.verify || []),
]
// A resumed lane whose verifiers already finished passes their findings as L.findings: the
// verifiers do not run again, and the fix step re-checks each finding against the tree.
const verified = Array.isArray(L.findings)
  ? [{ findings: L.findings }]
  : (await parallel(LENSES.map(v => () => agent(`${VRULES}\n${CONTEXT}\n${LANE}
## What the lane reported
${JSON.stringify(reports, null, 1)}
${v.prompt}`, { label: `${L.key}:verify:${v.key}`, phase: 'Verify', schema: FINDINGS_SCHEMA, model: v.model })))).filter(Boolean)
const findings = verified.flatMap(v => v.findings)
const verifiers = Array.isArray(L.findings) ? `the ${new Set(L.findings.map(f => f.lens)).size} verifiers of an earlier run` : `${verified.length} independent verifiers`
log(`${L.key}: verify — ${Array.isArray(L.findings) ? 'reused, ' : ''}${findings.length} finding(s): ${['blocker', 'major', 'minor'].map(k => k + '=' + findings.filter(f => f.severity === k).length).join(' ')}`)

phase('Fix')
const final = await agent(`${RULES}\n${CONTEXT}\n${LANE}
# Your job: apply the verified findings and close the lane
## What the lane's steps reported
${JSON.stringify(reports, null, 1)}
## Findings from ${verifiers} (re-check each; reject with a reason if it does not reproduce)
${JSON.stringify(findings, null, 1)}
Fix every real finding at its root; a gate that missed a planted defect gets a test that plants it. Never weaken a comparison, lower a floor, exclude a file or add a coverage-ignore comment. Then run and record: \`make validate\` twice (both fully green), \`make check\`, \`bash tests/run.sh\`, \`cd tools && npx tsc --noEmit\`, and the coverage numbers from the tests-vitest line or \`make tools-test\`. Commit (exact paths). Leave \`git status\` clean. Report every owed scenario with the test that covers it, and for the merge: every shared file you touched and how to resolve it.`, { label: `${L.key}:fix`, phase: 'Fix', schema: FINAL_SCHEMA, model: 'opus' })

return { lane: L.key, reports, findings: findings.length, final }
