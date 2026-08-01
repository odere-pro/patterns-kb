---
name: grill-me
description: Interrogate an underspecified proposal until it is falsifiable — batched Socratic rounds of questions (via the question UI, up to 4 per round) that turn "build me X" into a requirement card with testable FRs, numbered NFRs, explicit assumptions and parked unknowns. Use when someone says "grill me", "interrogate my requirements", "ask me questions until you understand", "challenge this idea", "make sure you understand before designing", or when a design or implementation request is too vague to route decisions to — and as the interview phase of the sys-design skill.
---

# Grilling a proposal into requirements

**The deliverable is a requirement card, not advice.** You ask questions in batched
rounds until every functional requirement is falsifiable and every non-functional
requirement carries a number — then you stop. During the grill you propose nothing,
design nothing, and never smuggle a solution into a question. A requirement that cannot
fail a test is not a requirement yet; the card is done when each one can.

## The rounds

Ask through the question UI (AskUserQuestion), **up to 4 questions per round**, and loop.
Rules per question:

- **One topic per question.** Never compound ("how many users and what latency?") —
  split it or drop the weaker half.
- **Never leading.** Options carry honest alternatives, not one obviously-right answer
  and three straw men. Every option's description states the consequence of picking it.
- **Offer a concrete default.** One option per question should be the assumption you
  would take if unanswered ("Assume ~1k RPS, revisit later") — so a user who does not
  know can still move, and the card records the default as an assumption. The UI always
  provides "Other" for free-text.
- **Build on the answers.** Each round is chosen from what is still load-bearing and
  unknown. Never re-ask what was answered, stated in the original ask, or derivable
  from it.
- **Silence on solutions.** If an answer tempts you to say "so we should use a queue" —
  don't. Write the requirement it implies and keep grilling.

Typical grills run 2–4 rounds. **Hard cap: 5 rounds.** Whatever is still unknown after
that is parked as an assumption or an unanswerable, not asked again.

### Unattended mode

Invoked with `--defaults` — a batch evaluation, a scheduled run, or a user who said
"just assume sensible things" — ask **nothing**. Instead: work the same taxonomy, write
down the question you would have asked and the default you would have offered, and take
that default. Every one lands in **Assumptions** with its question, so the card shows
exactly what a real interview would have changed.

An unattended card is weaker by construction and must say so in one line at the top.
Never fake an interview: no invented answers, and no assumption stated as if the user
had confirmed it.

## Question taxonomy

Pick each round's questions from whichever of these is the most load-bearing unknown —
not in fixed order, and never all of them:

- **Actors and callers** — who or what invokes the system; humans, services, both;
  trusted or hostile.
- **Core actions and triggers** — the observable behaviours: user → trigger →
  observable outcome. This is where FRs come from.
- **Scale numbers** — DAU, peak RPS, payload size, data volume, growth. A number, a
  range, or an admitted unknown.
- **Read/write ratio and shape** — read-heavy, write-heavy, fan-out, pipeline, bursty
  vs steady.
- **Latency and freshness tolerances** — p99 targets, and how stale a read may be
  before someone notices or cares.
- **Consistency vs availability stance** — in plain words: "when the network splits,
  would you rather serve possibly-stale answers or refuse to answer?" (CAP/PACELC
  without the jargon.)
- **Durability and failure expectations** — what loss is tolerable, what must survive
  a crash, RPO/RTO if the user thinks in those terms.
- **Security and compliance** — authn/authz boundaries, PII, regulatory constraints,
  data residency.
- **Budget, team and ops maturity** — who runs this at 3am; managed services vs
  self-hosted appetite; cost ceiling.
- **Out of scope** — what the system explicitly will not do. An empty out-of-scope
  list on a non-trivial system is a smell worth one question.

## Stop criterion

Stop grilling when all three hold:

1. **Every FR is falsifiable** — it names user → trigger → observable outcome and can
   be written as a Given/When/Then check that could fail.
2. **Every NFR has a number** — or an explicit "unknown, assumed X" with the default
   you took.
3. **No silent unknowns** — everything still open is parked in Assumptions or
   Unanswerables, visibly.

Do not grill past understanding. When the ask was already specific, one round — or
zero — is the right count; asking questions the ask answered is the failure mode that
makes people stop using interviews.

## The requirement card

The output, in this order:

- **Goal** — one sentence: what the system is for, in the user's words.
- **Functional requirements** — one sentence each, one observable behaviour each,
  capability not mechanism (the *what*, never "use a queue"). Numbered `FR1…`.
- **Non-functional requirements** — numbered `NFR1…`, each with its figure, tiered
  **mandatory** vs **additional** when there are more than ~4.
- **Out of scope** — the explicit exclusions.
- **Assumptions** — every default taken during the grill, phrased "assumed X because
  the answer was unknown/deferred".
- **Unanswerables** — questions the user could not answer. These are not deleted; they
  travel with the card as design risks.
- **Grill log** (optional, on request) — the questions asked and answers given, for
  the record.

The card's FR/NFR shape is deliberately compatible with the
[kb-design-requirements](../kb-design-requirements/SKILL.md) block, so a card can flow
into a KB design page or the sys-design pipeline without rework.

## What this skill is not

- **Not a designer.** No architecture, no pattern names, no technology during the
  grill. The card is the input to design, produced before it —
  [sys-design](../sys-design/SKILL.md) consumes it.
- **Not [kb-design-problem](../kb-design-problem/SKILL.md).** That skill formats the
  "Understanding the problem" block of a KB page after the fact; this one runs the
  live interview.
- **Not a form.** The taxonomy is a quarry, not a checklist — asking all ten areas of
  every proposal is interrogation theatre, and the cap exists to prevent it.

## Self-check

1. No question was compound, leading, or already answered by the ask or a prior round.
2. Every round went through the question UI with ≤4 questions, and the total stayed
   within 5 rounds.
3. Every FR on the card names user → trigger → observable outcome and could fail a
   Given/When/Then check.
4. Every NFR carries a number or an explicit assumed default.
5. Assumptions and Unanswerables capture everything still open — nothing silent.
6. The card contains no solution vocabulary: no pattern names, no products, no
   mechanisms.
