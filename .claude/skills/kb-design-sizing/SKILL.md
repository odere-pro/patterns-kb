---
name: kb-design-sizing
description: Write or review the sizing block ("Right-sizing") of a patterns-kb design page — from the FRs/NFRs derive the core technology capabilities needed, run the numbers, and narrow to the cheapest shape that balances price, performance and resilience. Use when someone asks to "write the sizing block", "right-size this design", "do the back-of-envelope", "estimate capacity", "which core technologies do we need", or "is one node enough".
---

# Writing the Right-sizing block

**The sizing block is an argument, not arithmetic — and it is read under time pressure.**
Its job is to get from the requirements to the *cheapest architecture that still meets
them*. It models the ~5-minute estimation slice of an interview: written to be delivered
in five minutes and scanned in one. Verdict first, lists over paragraphs, ~25 rendered
lines total. Every piece of infrastructure is a cost and a risk; the block earns its
place by striking candidates on the record and pricing whatever survives.

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

Inside `.prose`, in this order — lead, three lists, invalidation:

### 1. Lead — problem and solution up front

One `<p>`, at most two sentences: `<strong>The problem:</strong>` names the load and its
assumption; `<strong>The solution the numbers allow:</strong>` states the cheapest shape.
The reader gets the verdict first; the lists below are the proof.

### 2. Required capabilities

`<p><strong>Required capabilities:</strong></p>` then a `<ul>`, one line
per capability: `capability — forcing requirement (tier). <em>→ NFR: label.</em>`. Draw
from: durable transactional store, work queue, object store, cache, search index,
stream processor, scheduler, encrypted PII store, private network (security enforced at
the network boundary). **No product or vendor names, ever.**
A capability that traces to no requirement is speculation — leave it out. When the FR
list is tiered (see [kb-design-requirements](../kb-design-requirements/SKILL.md)), tag
each line `(mandatory)` or `(additional)`.

### 3. The numbers

A `<ul>`, one line per axis: `Label: arithmetic ≈ <strong>result</strong>. <em>→ NFR:
label.</em>`. Standard axes: writes, reads, storage — plus whichever of working set,
fan-out, cardinality, connections, or latency budget actually decides this design.
Assumptions go inline in parentheses, not narrated. Show the math; land on a bolded
figure; compare against an auditable capacity anchor (a well-tuned relational node ≈
10k writes/s, one machine's RAM) where the comparison decides something.

### 4. Verdict per candidate

`<p><strong>Verdict per candidate:</strong></p>` then a `<ul>`, one line per candidate —
including the ones a bigger system would reflexively claim (broker, cache, search index,
workflow engine), so each strike is on the record:

- `candidate — struck: the number that kills it. <em>→ NFR: label.</em>`
- `candidate — kept: the requirement that forces it. <em>→ FR: label.</em>`

Keep a capability only when the arithmetic or an NFR forces it, and name which.
Resilience bought by protocol (idempotency, retries, replay) is cheaper than resilience
bought by infrastructure — prefer it and say so.

### The routing tags

Every list item ends with exactly one routing tag — `<em>→ FR: label.</em>`,
`<em>→ NFR: label.</em>`, or both joined with `;` — the same idiom the problem block
uses (see [kb-design-problem](../kb-design-problem/SKILL.md)). The label is informal
but must match an item the reader can find in the requirements block. Capabilities and
verdicts route to what forces them; numbers route to the constraint they price. No
orphan bullets: an item that routes nowhere is either speculation or a missing
requirement.

### 5. Invalidation — the closing paragraph every block must have

One `<p>`: **what invalidates this** — the part that wears out first and the mechanism
by which it wears (cause → effect), the number at which that becomes measurable, and
the *named, priced* exits (partition, add the broker, shard by client). A bare
threshold is not an invalidation — "breaks at ~2M" reads as arbitrary until the
sentence says *what* breaks and *why*. Exits are upgrades that were priced, not
rewrites; end with the routing tag of the constraint the exits serve (usually
`<em>→ NFR: scale.</em>`).

## Style rules

- **One line per list item.** A second clause is allowed after a semicolon; a second
  sentence means it is two items.
- **Strike connector words** — "which is why", "that is", "so", "in other words". The
  `label — evidence` juxtaposition does the work.
- **Results bold, assumptions in parentheses**, jargon only where it is the exact term
  (Little's law, vacuum pressure).

## Worked example

From `persona-identification` — the write rate is ~3/s at the design target:

> ❌ *Flows are queued in Kafka and hot state lives in Redis, so the system scales to
> any load.* — two vendors, neither justified by a number; "any load" prices nothing.

> ✅ *Message broker — struck: 5–6 writes/s peak fits a task table in the same store;
> the broker is the priced exit at ~2M requests. → NFR: scale.*

The ❌ buys infrastructure first and justifies never; the ✅ strikes it with a number,
keeps it as a named exit, and routes to the constraint it prices — in one scannable line.

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

1. Scan test: after 15 seconds, can a reader state the problem and the solution? If the
   verdict is not in the first paragraph, it fails.
2. Does every capability line trace to a named FR or NFR, vendor-free, tier-tagged when
   the FRs are tiered?
3. Does every numbers line show assumption and arithmetic and land on a bolded result?
4. Does every candidate get a one-line verdict — struck by a number or kept by a forcing
   requirement, nothing kept "to be safe"? This is the check that does the work.
5. Does every list item end in a routing tag, and does every tag resolve to an FR or NFR
   the reader can find in the requirements block?
6. Grep the block for "which is why", "that is", "so " — expect (almost) zero; and is
   the whole block ≤ ~25 rendered lines ending in the invalidation paragraph?
7. `make all && make check`, then `node scripts/kb.mjs get <id> --block sizing` — the
   output should scan as: problem+solution, capabilities, numbers, verdicts, exit.
