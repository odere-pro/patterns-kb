---
name: kb-design-sizing
description: Write or review the sizing block ("Right-sizing") of a patterns-kb design page — pick the interaction shape, derive the core technology capabilities from the FRs/NFRs, run the numbers, and adopt, reject or defer each candidate with a reason. Use when someone asks to "write the sizing block", "right-size this design", "do the back-of-envelope", "estimate capacity", "which core technologies do we need", or "is one node enough". Also use to review, evaluate, critique, audit or grade an existing sizing block, including when the ask names it by file path or URL fragment (`…/<page>.html#sizing`).
---

# Writing the Right-sizing block

**The sizing block is an argument, not arithmetic — and it is read under time pressure.**
Its job is to get from the requirements to the *cheapest architecture that still meets
them*. It models the ~5-minute estimation slice of an interview: written to be delivered
in five minutes and scanned in one. Verdict first, lists over paragraphs, ~30 rendered
lines. Every piece of infrastructure is a cost and a risk; the block earns its place by
deciding each candidate on the record, with a reason attached.

## The markup

```html
<section class="doc-section" id="sizing" aria-labelledby="h-sizing" data-kb-block="sizing">
  <h2 class="doc-h" id="h-sizing">Right-sizing</h2>
  <div class="prose"> … </div>
</section>
```

The heading text is always **"Right-sizing"** (a suffix is allowed when it names the
block's verdict: "Right-sizing: how many nodes?"). The block is hand-edited HTML — no
`kb.mjs` writer exists for it; the PostToolUse hook checks structure, not content. It is
optional for `low-level-design` katas and expected on every `system-design` page.

## The five-part shape

Inside `.prose`, in this order — lead, three lists, revisit trigger:

### 1. Lead — problem, shape, stores

One `<p>`, three labelled sentences. The reader gets the whole answer here; the lists
below are the proof.

- `<strong>The problem:</strong>` the load and its assumption, in one line.
- `<strong>The shape:</strong>` **the interaction style, argued.** This is the largest
  lever in the design and it is decided before any capacity question — synchronous
  request/response, or event-driven (durable rows, appended events, workers). Name it
  and give the reason in the same sentence. Reach for event-driven when any of these
  hold, and say which: waits outlive a request (humans, vendors, batch windows); a state
  change must be told to someone else exactly once; the history is itself a requirement
  (audit, compliance, reconstruction); load arrives in bursts the workers should absorb.
  When the answer is "append-only history plus materialised current state" rather than
  full event sourcing, say so — folding state from events on every read is a cost that
  needs its own justification.
- `<strong>The stores:</strong>` every persistent store the shape needs, counted. Be
  exact: a design with a separate PII vault, an object store and a coordination cache
  has four stores, not "one database". Under-counting here is the most common way this
  block lies.

### 2. Required capabilities

`<p><strong>Required capabilities:</strong></p>` then a `<ul>`, one line per capability:
`capability — forcing requirement (tier). → NFR: label.`. Draw from: durable
transactional store, work queue, object store, coordination cache, read cache, search
index, stream processor, scheduler, encrypted PII store with key custody, rate limiting,
private network. **No product or vendor names, ever.** A capability that traces to no
requirement is speculation — leave it out. When the FR list is tiered (see
[kb-design-requirements](../kb-design-requirements/SKILL.md)), tag each line
`(mandatory)` or `(additional)`.

**Distinguish capabilities that share a name.** A *coordination* cache (shared breaker
state, leases, rate-limit counters — correctness across replicas) and a *read* cache
(latency relief for hot data) are different decisions with different forcing reasons;
one can be adopted while the other is rejected. Same for a work queue vs a message
broker: the queue is the capability, the broker is one implementation of it.

### 3. The numbers

A `<ul>`, one line per axis: `Label: arithmetic ≈ <strong>result</strong>. → NFR:
label.`. Standard axes: writes, reads, storage — plus whichever of working set,
fan-out, cardinality, connections, or latency budget actually decides this design.

- **Show where each input came from.** A factor like "25–30 rows per flow" must name
  what it counts (which tables, inserts vs updates); a peak multiplier must name the
  concentration it assumes (business hours, campaign bursts). An unsourced factor is
  the number a reader cannot check, and the one that is usually wrong.
- **Name the unit — a rate is meaningless without its subject.** "0.5 calls/s" is not a
  number: calls to a vendor's API, row-writes into the primary, and requests hitting
  your own edge have different ceilings, different owners and different bills. Write
  "outbound vendor calls/s", "row-writes/s into Postgres", "reads/s at the edge".
- Assumptions go inline in parentheses, not narrated. Land on a bolded figure and
  compare against an auditable capacity anchor (a well-tuned relational node ≈ 10k
  writes/s, one machine's RAM) where the comparison decides something.
- **Say what happens to the quantity, not just how big it is.** "~10k flows parked"
  invites "and then what?" — answer it in the same line (who resolves them, on what
  clock, at what cost).
- **Find the binding constraint — it is often not the one you measured.** A load that
  is trivial for your store can be capped long before it by something you do not own:
  a vendor's contracted rate limit and monthly quota, a partner's API ceiling, a
  per-call price. When that is the case, say so and give the second number: the
  quota that caps it and the annual invoice it implies. Mark cost arithmetic as
  illustrative unless you know the contract rate — the shape of the answer survives
  a wrong unit price, but a fabricated quote does not.
- **Watch for quantities that compound against a different clock than revenue.**
  Recurring obligations (re-checks, retention, re-indexing) grow with the accumulated
  book while income grows only with new business. That divergence is a finding, not a
  footnote — name it where it appears.

### 4. Verdict per candidate

`<p><strong>Verdict per candidate:</strong></p>` then a `<ul>`, one line per candidate —
including the ones a bigger system would reflexively claim, so each decision is on the
record. Three verdicts, each with **the reason on the same line**:

- `Candidate — <strong>adopted</strong>: what forces it.`
- `Candidate — <strong>rejected</strong>: the number or fact that removes the need.`
- `Candidate — <strong>deferred</strong>: not yet; the named trigger that buys it.`

**The shape is a verdict, not just a claim in the lead.** Open the list with the
interaction style decided both ways — the rejected alternative (synchronous
request/response) with the fact that kills it, then the adopted one. It is the largest
decision on the page; asserting it in the lead and never deciding it on the record is
the most common omission in this block.

**Nothing named in part 2 may vanish here.** Walk the capability list and confirm each
one either has its own verdict line or is explicitly folded into one ("queue, outbox
and inbox" is three decisions, not one — split them unless they truly stand or fall
together). A capability that appears as required and then never reappears reads as
forgotten.

**Deferred is not rejected.** A candidate with a real future belongs in the deferred
group with its trigger stated ("sustained 100k flows/day", "when flow variants
multiply"), so the reader knows it was priced rather than dismissed. Never write a bare
verdict: "cache — rejected" is an assertion; "read cache — rejected: 18 GB working set,
no read pressure" is a decision. Resilience bought by protocol (idempotency, retries,
replay) is cheaper than resilience bought by infrastructure — prefer it and say so.

### 5. When this stops being right

The closing `<p>`, opening with that exact bold phrase — it does the framing on its
own (the verdicts hold for today's numbers; this is the tripwire that says they no
longer do), so no further preamble. Then three things, in order, each in a sentence
or two:

1. **What wears out first, in plain language.** Name the component and the mechanism
   that degrades it — cause, then effect. Explain engine-level jargon in the sentence
   that uses it; a reader who does not run that database must still follow the argument.
   ("Postgres never overwrites a row in place: an update leaves the old version behind
   as garbage for a background cleanup to reclaim.")
2. **The signal to watch**, so the tripwire is observable rather than theoretical —
   a metric someone can put on a dashboard, not a vibe.
3. **The exits in adoption order**, each an upgrade that was priced, not a rewrite.

A bare threshold is not an invalidation — "breaks at ~2M" reads as arbitrary until the
sentence says *what* breaks and *why*. End with the routing tag of the constraint the
exits serve (usually `→ NFR: scale.`).

## The routing tags

Every list item ends with exactly one routing tag — `→ FR: label.`, `→ NFR: label.`, or
both joined with `;`. Plain text, never wrapped in `<em>`: the arrow and the colon already
mark it. The same idiom the problem block uses
(see [kb-design-problem](../kb-design-problem/SKILL.md)). The label is informal
but must match an item the reader can find in the requirements block. Capabilities and
verdicts route to what forces them; numbers route to the constraint they price. No
orphan bullets: an item that routes nowhere is either speculation or a missing
requirement.

## Style rules

- **One line per list item.** A second clause is allowed after a semicolon; a second
  sentence means it is two items.
- **Strike connector words** — "which is why", "that is", "so", "in other words". The
  `label — evidence` juxtaposition does the work.
- **Results bold, assumptions in parentheses**, jargon only where it is the exact term —
  and then explained on first use.
- **The two paragraphs are prose, and the same rules bind them.** In the lead, each
  labelled sentence stands alone and carries its reason, so the reader can stop after any
  one of them. In "When this stops being right", write cause then effect in that order,
  one mechanism per sentence — a sentence carrying two mechanisms hides which one wears
  out first.

## Worked example

From `persona-identification` — the write rate is ~3/s at the design target:

> ❌ *Flows are queued in Kafka and hot state lives in Redis, so the system scales to
> any load.* — two vendors, neither justified by a number; "any load" prices nothing.

> ✅ *Message broker — deferred: 5–6 writes/s peak fits a task table in the same store,
> and the task insert shares the state change's transaction; trigger is sustained 100k
> flows/day. → NFR: scale.*

The ❌ buys infrastructure first and justifies never; the ✅ decides it with a number,
keeps it as a triggered exit, and routes to the constraint it prices — in one line.

## Consistency with the rest of the page

The sizing verdicts and the `architecture` block's technology table are the same
decisions stated twice — they must agree. Before shipping, read them side by side: a
capability the architecture depends on (a shared cache holding breaker state, a vault
with its own credentials) cannot appear as "rejected" here. When they disagree, the
architecture block is usually right and the sizing block missed a capability whose
forcing reason was correctness, not scale.

## What this block is not

- **Not the architecture block.** It decides *which capabilities* and *how big*, not
  which boxes and arrows — no component diagrams, no data flow.
- **Not a tech-stack listing.** Vendor mapping happens outside the KB (the
  `pattern-tech-map` skill); this block stays at the capability level.
- **Not a restatement of the NFRs.** The scale NFR says what must hold; this block
  proves what it costs and what it rules out.

Upstream, the numbers come from [kb-design-requirements](../kb-design-requirements/SKILL.md)
(every constraint carries a number where one exists) and ultimately from the interview
in [kb-design-problem](../kb-design-problem/SKILL.md) — a sizing block that has to invent
its own volumes means the problem block didn't ask.

**Legacy note**: pages written before this shape use 3–7 prose paragraphs with bold
lead-ins. They are valid until touched; migrate a page to the five-part shape whenever
its sizing block is edited.

## Self-check

1. Scan test: after 15 seconds, can a reader state the problem, the shape and the
   stores? If the verdict is not in the first paragraph, it fails.
2. Is the interaction shape named *and argued*, and is the store count exact — every
   vault, blob store and coordination cache counted?
3. Does every numbers line show where its factors came from, and does every quantity
   say what happens to it?
4. Does every candidate get adopted, rejected or deferred **with a reason** — deferred
   ones carrying a named trigger, nothing kept "to be safe"? This is the check that does
   the work.
5. Does every list item end in a routing tag that resolves to a findable FR or NFR?
6. Do the verdicts agree with the `architecture` block's technology table?
7. Does the closing paragraph say what it is for, name the mechanism in plain language,
   and give an observable signal — not just a threshold?
8. `make all && make check`, then `node scripts/kb.mjs get <id> --block sizing` — the
   output should scan as: problem+shape+stores, capabilities, numbers, verdicts, tripwire.
