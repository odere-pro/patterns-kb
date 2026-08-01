---
name: sys-design
description: Run a full, KB-grounded system design end to end — grill the requirements until falsifiable, size the problem, design entities and API, propose a high-level design with named alternatives and priced tradeoffs, zoom into every component with cited pattern rosters, sweep for bottlenecks and antipatterns, map to a concrete stack, and deliver a design doc with readable mermaid diagrams. Use when someone asks to "design a system for X", "run a system design", "architect this service", "do a full design interview", "take me from idea to architecture", or gives a product-shaped ask that needs requirements, HLD, component zoom-ups and a stack rather than a single component or pattern.
---

# Designing a system from the KB

**The deliverable is a design document in which every decision routes to a stated
requirement and every pattern claim carries a KB citation** — assembled through a fixed
pipeline, with the heavy KB reading delegated to subagents so the main context stays
lean. This skill is the conductor: the interview is [grill-me](../grill-me/SKILL.md),
the per-component composition is [kb-compose](../kb-compose/SKILL.md) run inside a
subagent, the diagrams follow [diagram-draw](../diagram-draw/SKILL.md), the stack table
follows [stack-pick](../stack-pick/SKILL.md), and the prose register is
[style-system-design](../style-system-design/SKILL.md) — verdict first, claim + reason,
no unpriced adjectives.

## Context economy

The corpus is ~490k tokens and the design conversation is long; both facts are
constraints on *you*, the orchestrator:

- Never open a `site/*.html` file. Everything goes through `node scripts/kb.mjs`.
- In the main loop, run only cheap calls: `ls`, single `find` probes, one targeted
  `get <id> --block <b>`. Anything that needs block reads across more than ~3 pages is
  a subagent's job.
- Every subagent returns a brief in a fixed shape, **≤ ~500 tokens** (component briefs
  may run longer; they say so in their contract). Raw page text never crosses back.
- Launch independent subagents in parallel — scouts together, component designers
  together.

## The pipeline

Work the phases in order. Each phase's output is input to the next; skipping one leaves
a later verdict with nothing to route to.

**1. Frame.** Restate the ask in two sentences: what the system is for and what shape
it has (read-heavy, write-heavy, fan-out, pipeline, request/response, streaming).
Draft the candidate FRs/NFRs you can already see — these seed the grill, so it never
asks what the ask answered.

**2. Grill.** Run the [grill-me](../grill-me/SKILL.md) skill. Output: the requirement
card — falsifiable FRs, numbered NFRs, out-of-scope, assumptions, unanswerables. The
card is the routing target for every verdict downstream; nothing below may appeal to a
requirement that is not on it.

**3. Size.** The [kb-design-sizing](../kb-design-sizing/SKILL.md) discipline, as a doc
section rather than a page block: name the interaction shape, run the back-of-envelope
numbers from the card's NFRs, derive the required technology capabilities
(capability-level language — "a durable log", "a coordination service"), and give each
candidate capability a verdict: adopt, reject, or defer, with the number that decides
it. Close with "when this stops being right". One node is a valid answer when the
numbers say so.

**4. Entities.** The [kb-design-entities](../kb-design-entities/SKILL.md) discipline:
2–4 observation sentences, then entities grouped by domain role, each with a one-line
description and a trimmed-DDL sketch. Only fields the FRs force.

**5. API.** The [kb-design-interface](../kb-design-interface/SKILL.md) discipline:
endpoints grouped by caller/audience (auth follows audience), each with
`METHOD /path`, one sentence, and a request/response contract sketch. Derived from the
entities and FRs — an endpoint no FR forces is decoration.

**6. High-level design.** First, identify the 1–3 central tensions the NFRs create
(consistency vs availability, scaling writes, resilience under partial failure,
contention…). Launch one **kb-scout** agent per tension, in parallel, each with the
scout input contract (below). While they run, you hold the entities and API; when the
briefs return, compose:

- **The L1 board** — one mermaid flowchart, diagram-draw rules: ≤8 nodes, ≤12 edges,
  numbered happy-path edge labels carrying verb + payload, `:::ext` marking what is
  given rather than built, data stores as cylinders.
- **Components and communication** — a numbered walk of the board: each component's
  single responsibility and what crosses each arrow.
- **Requirement trace** — where each FR lands (`→ FR: label.`) and which component or
  edge answers each mandatory NFR (`→ NFR: label.`). An FR that lands nowhere is a
  missing component; find it now, not in phase 8.
- **At least one named alternative** — a genuinely different architecture (not a
  parameter tweak), with the condition that would flip to it and the decide-row or
  cited tradeoff that says so. Verdict first: name the chosen architecture and why in
  one sentence, then the alternative.

**7. Zoom-ups.** For every non-trivial component on the board, launch one
**component-designer** agent — all of them in parallel, each owning a disjoint
component, each given the input contract below. Each returns a kb-compose brief
(boundary, requirements, adopted/rejected/deferred roster with cites, composition walk,
the bill, sensitivity list) plus an L2 zoom flowchart. You then write **one sequence
diagram per critical flow** — the happy path plus the one failure branch that matters,
≤6 participants, per diagram-draw. Trivial components (a static asset bucket) get one
sentence, not an agent.

**8. Critique.** Assemble the draft (phases 3–7) and hand it to one **design-critic**
agent. It returns findings — bottlenecks, unguarded hazards, antipattern matches,
principle overreach — each with severity, failure scenario and KB cite. Fold each
finding back in: change the design, add a guard to a roster, or record it under Open
risks as explicitly accepted. No finding disappears silently.

**9. Stack map.** Only now do product names enter. Apply the
[stack-pick](../stack-pick/SKILL.md) skill over the adopted rosters: follow
"Implemented by" edges to capability and comparison pages, read one vendor's column
(AWS by default; Azure, Google Cloud or open source on request), and produce the
`Need | Pattern | Service | Why` table — including the mandatory do-less row and
stack-pick's anti-fabrication rule. Delegate to a kb-scout if the edge-following
exceeds your cheap-call budget.

**10. Assemble and deliver.** Write the design doc to `tmp/designs/<slug>.md`
(gitignored), in this order — it mirrors the KB design-page block order so it can
become a page later:

1. Problem (the framed ask + grill summary)
2. Requirements (the card)
3. Right-sizing
4. Core entities
5. API
6. Architecture (L1 board, walk, requirement trace, alternatives)
7. Deep dives (per-component briefs, zoom diagrams, sequence diagrams)
8. Limitations & tradeoffs (ledger: biggest flaw first, then strengths and risks,
   ≤7 each — per [kb-design-tradeoffs](../kb-design-tradeoffs/SKILL.md))
9. Stack map
10. Open risks (accepted critic findings + the card's unanswerables)

In chat, lead with the verdict — the chosen architecture and its biggest flaw in two
sentences — then the doc path and a compact summary. Then **offer, opt-in, never
automatic**: (a) publish as a `site/designs/` case-study page via
[kb-add](../kb-add/SKILL.md) and the kb-design-* block skills; (b) publish an Artifact
web page of the doc (mermaid renders natively there).

## Subagent contracts

Launch these with the Agent tool by `subagent_type`. Give each exactly its input
contract — a subagent cannot ask the user anything, so a missing input becomes a wrong
assumption.

**kb-scout** (sonnet, parallel-safe) — *input*: one question or tension, the relevant
FR/NFR lines verbatim, any band/tag scoping you already know. *Output*: ≤500-token
brief — question restated, the governing theme and the decide-row taken plus rows
rejected, 3–7 candidate pattern ids each with a one-line why and stable-id cite,
hazards surfaced. No adoption verdicts, no vendor names, no raw page text.

**component-designer** (opus, one per component, parallel) — *input*: component name
and boundary sentence, its FRs, its numeric NFRs, the CAP/PACELC stance, and its
upstream/downstream neighbours from the board. *Output*: the kb-compose component
brief plus one fenced-mermaid L2 flowchart (≤8 nodes, numbered edges).
Technology-agnostic throughout.

**design-critic** (opus, one per run) — *input*: the assembled draft — requirement
card, sizing verdicts, L1 board source, component rosters with cites, sequence
diagrams. *Output*: findings, most severe first, each with claim, failure scenario, KB
cite, and a proposed guard or "accept explicitly". An empty list is a valid answer.

## What this skill is not

- **Not [kb-compose](../kb-compose/SKILL.md).** That solves one bounded component;
  this designs the whole system and runs kb-compose inside subagents for each box.
- **Not [stack-pick](../stack-pick/SKILL.md) alone.** Stack mapping is phase 9 of ten;
  a user who only wants services for a known design should get stack-pick directly.
- **Not the kb-design-\* page skills.** Those author HTML blocks on a `site/designs/`
  page; this produces a chat-and-file deliverable and only hands off to them if the
  user accepts the publish offer.
- **Not [kb-find](../kb-find/SKILL.md).** One symptom, one pattern, one answer — no
  pipeline needed.

## Self-check

1. Every FR from the card lands on a named component in the requirement trace; every
   mandatory NFR has a deep dive or an explicitly accepted risk.
2. Every adopted pattern in every roster carries a stable-id cite; every rejection
   cites the con or violated stance that killed it.
3. At least one alternative architecture is named with the condition that flips to it.
4. No vendor or product name appears before phase 9.
5. Every diagram obeys diagram-draw caps (flowcharts ≤8 nodes; sequence diagrams ≤6
   participants; one question per diagram) and the L1 board's edges are numbered.
6. Every critic finding was folded in or recorded under Open risks — none vanished.
7. The main loop never opened a `.html` and never held more than one page-block read
   at a time; everything bigger went through a subagent brief.
8. The doc exists at `tmp/designs/<slug>.md`, the chat summary leads with the verdict,
   and both publish offers were made opt-in.
