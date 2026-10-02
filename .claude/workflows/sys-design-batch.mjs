export const meta = {
  name: 'sys-design-batch',
  description: 'Run the sys-design research phases (scout → compose → critique) with a budget, a journal and resume',
  whenToUse: 'A kata too large to lose progress on, or a batch of katas being evaluated unattended. Phases 6-8 of the sys-design skill, run deterministically. Interactive single katas do not need it — the interview dominates there.',
  phases: [
    { title: 'Scout', detail: 'one agent per central tension' },
    { title: 'Compose', detail: 'one component-designer per component' },
    { title: 'Critique', detail: 'adversarial sweep over the assembled rosters' },
  ],
}

/* args: {
 *   system:     "one sentence naming the system"
 *   card:       "the requirement card as text — FRs, numbered NFRs, CAP stance"
 *   tensions:   ["users must see their own writes across regions", …]      1-3
 *   components: [{ name, boundary, frs, nfrs, stance, neighbours }, …]
 *   board:      "the L1 mermaid source, if one exists yet"                 optional
 * }
 * Returns { scouts, components, findings } — the orchestrator writes the doc. */

const a = args ?? {}
if (!a.card || !a.components?.length) {
  throw new Error('sys-design-batch needs args.card and a non-empty args.components')
}

const PREAMBLE = `Work from the repo root. Read the KB only through \`node scripts/kb.mjs\`, starting with \`kb.mjs brief "<query>"\` (find hits + governing theme decide table + top hits' neighbours in one call). Never open a site/*.html file. Return the contract shape with no preamble and no narration — your output is consumed by an orchestrator, not read by a human.`

const SCOUT_SCHEMA = {
  type: 'object',
  required: ['question', 'candidates'],
  properties: {
    question: { type: 'string' },
    theme: { type: 'string', description: 'governing theme id, or empty' },
    rowTaken: { type: 'string' },
    rowsRejected: { type: 'array', items: { type: 'string' } },
    candidates: {
      type: 'array', maxItems: 7,
      items: {
        type: 'object', required: ['id', 'why', 'cite'],
        properties: { id: { type: 'string' }, why: { type: 'string' }, cite: { type: 'string' } },
      },
    },
    hazards: { type: 'array', items: { type: 'string' } },
  },
}

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object', required: ['claim', 'scenario', 'cite', 'disposition'],
        properties: {
          claim: { type: 'string' },
          scenario: { type: 'string' },
          cite: { type: 'string' },
          disposition: { type: 'string', description: 'a pattern id to add as a guard, or "accept explicitly"' },
          severity: { type: 'string', enum: ['violates-mandatory-nfr', 'breaks-at-peak', 'breaks-on-growth', 'hygiene'] },
        },
      },
    },
  },
}

phase('Scout')
const tensions = (a.tensions ?? []).slice(0, 3)
const scouts = tensions.length
  ? (await parallel(tensions.map((t, i) => () =>
      agent(`${PREAMBLE}

Scout one tension for a system design.

System: ${a.system ?? '(unnamed)'}
Tension: ${t}

Requirement card (the FR/NFR lines your candidates must route to):
${a.card}

Return the scout brief: the governing theme, the decide-row taken and the rows rejected, 3-7 candidate pattern ids each with a one-line why and a stable-id cite, and any hazards surfaced. No adoption verdicts, no vendor names, no raw page text.`,
        { label: `scout:${i + 1}`, phase: 'Scout', agentType: 'kb-scout', schema: SCOUT_SCHEMA })
    ))).filter(Boolean)
  : []

log(`${scouts.length} tension(s) scouted; ${a.components.length} component(s) to compose`)

/* Pipeline, not a barrier: a component starts composing as soon as its own prompt is
 * ready. The scouts above are shared context for all of them, so they are the one
 * genuine join in this workflow. */
phase('Compose')
const scoutContext = scouts.length
  ? `\nWhat the scouts found for this system (candidates only — you adopt or reject them yourself):\n${
      scouts.map((s) => `- ${s.question}: theme ${s.theme || '(none)'}, row taken "${s.rowTaken ?? ''}" — ${
        s.candidates.map((c) => c.id).join(', ')}${s.hazards?.length ? ` | hazards: ${s.hazards.join(', ')}` : ''}`).join('\n')}\n`
  : ''

const components = await pipeline(
  a.components,
  (c) => agent(`${PREAMBLE}

Design one bounded component of a larger system, following .claude/skills/kb-compose/SKILL.md.

Component: ${c.name}
Boundary: ${c.boundary}
FRs: ${Array.isArray(c.frs) ? c.frs.join('; ') : c.frs}
NFRs (numeric): ${Array.isArray(c.nfrs) ? c.nfrs.join('; ') : c.nfrs}
CAP/PACELC stance: ${c.stance ?? '(not stated — state the assumption you take)'}
Neighbours: ${c.neighbours ?? '(not stated)'}
${scoutContext}
Budget: at most 1,500 tokens, roster at most 12 rows. Return the kb-compose brief (Boundary, Requirements, Roster with cites and routing tags, How it composes, The bill, Sensitivity) plus one L2 flowchart in a fenced mermaid block — raw mermaid, never HTML-escaped, at most 8 nodes with numbered edges.`,
    { label: `compose:${c.name}`, phase: 'Compose', agentType: 'component-designer' })
)

const briefs = components.filter(Boolean)
if (briefs.length < a.components.length) {
  log(`WARNING: ${a.components.length - briefs.length} component(s) returned nothing — they are missing from the critique`)
}

phase('Critique')
const findings = await agent(`${PREAMBLE}

Adversarially review this draft system design. Findings only — do not rewrite it.

System: ${a.system ?? '(unnamed)'}

Requirement card:
${a.card}

${a.board ? `L1 board:\n${a.board}\n` : ''}
Component briefs:
${briefs.join('\n\n---\n\n')}

Run your four sweeps (hazards, antipattern match, load walk, overreach) plus the precedent check. Return at most 8 findings, most severe first, each with claim, failure scenario, KB cite and disposition. An empty list is a valid answer.`,
  { label: 'critique', phase: 'Critique', agentType: 'design-critic', schema: FINDINGS_SCHEMA })

log(`${findings?.findings?.length ?? 0} finding(s) returned`)

return { scouts, components: briefs, findings: findings?.findings ?? [] }
