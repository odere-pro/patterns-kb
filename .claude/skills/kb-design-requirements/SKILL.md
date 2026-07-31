---
name: kb-design-requirements
description: Write or review the requirements block (functional and non-functional requirements) of a patterns-kb design page. Use when someone asks to "write the requirements block", "add FRs/NFRs", "list the functional and non-functional requirements", "review my requirements", "restructure the NFRs into sublists", asks where deduplication or idempotency belongs, or says a design page's requirements are hard to read, too long, or too implementation-flavoured.
---

# Writing the requirements block

**A requirement says what the system must do or guarantee — never how.** The how belongs
to `architecture` and `deepdives`; a requirement that names the mechanism has pre-decided
the design before the page argues it.

## The markup

The block is hand-edited HTML — no `kb.mjs` writer exists for it. A PostToolUse hook runs
`make check` after every edit; it validates block presence and order, not content, so these
rules are yours to enforce.

```html
<section class="doc-section" id="requirements" aria-labelledby="h-req" data-kb-block="requirements">
  <h2 class="doc-h" id="h-req">Requirements</h2>
  <div class="requirements">
    <div class="functional"><h3>Functional</h3><ol> … </ol></div>
    <div class="nonfunctional"><h3>Non-functional</h3><ul> … </ul></div>
    <div class="outofscope"><h3>Out of scope</h3><ul> … </ul></div>  <!-- optional -->
  </div>
</section>
```

## Functional requirements — one sentence, plain, atomic

- **Exactly one sentence per `<li>`.** If a second sentence is forming, it is a second
  requirement — split it.
- **Plain text only.** No `<strong>`, `<em>`, `<br>`, `<code>` inside FR items. If a word
  needs bolding to be understood, the sentence is carrying too much.
- **One observable behaviour per item.** "X happens, and separately Y happens" is two FRs.
- **Capability, not mechanism.** Actors and channels given by the task statement may be
  named (the external ID-verification provider, a webhook, the dashboard). Solution
  choices may not: no hashing, HMAC, outbox, queue, collector, broker, cache, retry
  policy. Genuine requirement numbers stay (single-use, 48-hour expiry).
- **No hedging.** No "should", "may", "aims to", "is able to" in an FR sentence — an FR
  states the capability flatly, because a requirement that hedges cannot be tested
  against. "The person can request a fresh link", not "the person should be able to".

Worked example — one over-packed FR from `persona-identification` and its atomic form:

> ❌ *The email's owner receives an invitation carrying a **magic link**: single-use,
> 48-hour expiry, self-serve resend. Only the key's hash is stored.*

> ✅ *The email's owner receives a single-use invitation link that expires after 48 hours.*
> ✅ *The person can request a fresh invitation link themselves if theirs expired.*
> (— and "only the hash is stored" moves to the security deep dive, where it is argued.)

FR counts run 3–5 for a narrow kata, up to ~15 for a rich flow with audit and compliance
obligations. Growth past that usually means mechanisms have crept in — atomic splits of
real behaviour are fine, mechanism smuggling is not.

### Tiering — mandatory vs additional (optional)

A long FR list may split into two tiers when the design has a clear minimum product
(see `persona-identification`):

```html
<h4>Mandatory — the product promise</h4>
<ol> … </ol>
<h4>Additional — ongoing obligations and governance</h4>
<ol start="9"> … </ol>
```

- **The mandatory tier must stand alone** — a deployment meeting only it is a complete,
  correct product. If striking an item breaks the core promise, it is mandatory.
- **Additional items must be additive** — recurrence, audit surface, governance — and
  the split earns its keep only when paired with an **Evolvability** NFR stating that
  additional obligations attach without redesigning the core.
- Numbering continues across the tiers (`start=` on the second `<ol>`), so an item keeps
  one number for its whole life.
- The sizing block should then trace capabilities per tier: what the mandatory core
  forces vs what the additional tier adds (see
  [kb-design-sizing](../kb-design-sizing/SKILL.md)).

## Non-functional requirements — labelled constraints with numbers

- Shape: a bold label, then its points as a nested sublist — one point per nested
  `<li>`, each a single plain sentence:

  ```html
  <li><strong>Scale</strong>
    <ul>
      <li>~100 onboardings a week today; one merchant means several person-flows.</li>
      <li>Headroom to 10k person-flows a day without redesign.</li>
    </ul>
  </li>
  ```

  A label with a single point may stay inline: `<li><strong>Label</strong> — constraint.</li>`.
  The bold label is the one place formatting is allowed; every body sentence is plain.
  **One level of nesting only** — the `kb.mjs` reader renders exactly one sublist level;
  anything deeper welds into an unreadable line.
- **Every constraint carries a number where one exists** (~100/week, 10k/day, ~6 hours
  down, 500 ms, 100:1).
- **Constraint, not mechanism.** "Tenant isolation is enforced by the database itself,
  not by application filters alone" is a constraint; "row-level security" is a mechanism.
  "Right-to-forget is honoured and provable" is a constraint; "crypto-shredding" is its
  mechanism — say the first here, argue the second in `deepdives`.
- **The block stands alone.** No forward references to other blocks ("argued in the
  architecture") — the reader may extract this block by itself.
- **Operability points are requirements, not afterthoughts.** Under
  **Availability & resilience**: every error path is explicit — a failed step retries,
  escalates, or ends the flow with a recorded reason; nothing is silently dropped. Under
  **Observability**: which alarms fire, and that every alarm has a runbook (what it
  means, how to diagnose, how to recover).

Worked example — one over-packed NFR from `persona-identification` and its sublist form:

> ❌ ***Compliance** — verified documents must be stored, not proxied. PII is encrypted at
> rest, and right-to-forget is honoured by crypto-shredding. Retention is a per-jurisdiction
> policy carried by the flow, enforced and evidenced by the system rather than by a global
> cleanup job; it also drives storage sizing. Every read of PII leaves a papertrail.*

> ✅ ***Compliance***
> - *Verified documents are stored as evidence, not proxied.*
> - *Personal data is encrypted at rest; right-to-forget is honoured and provable.*
> - *Retention is a per-jurisdiction policy enforced and evidenced by the system.*
>
> (— "crypto-shredding" moves to `deepdives`; the access papertrail became an FR, because
> "every access is recorded with who, when, and why" is observable behaviour.)

Standard labels in the corpus: **Scale**, **Latency**, **Throughput**, **Consistency**,
**Availability & resilience**, **Observability**, **Compliance**, **Security & tenancy**;
LLD katas use **Correctness**, **Encapsulation**, **Evolvability**, **Money safety**.
Reuse these before inventing a new one. 3–6 labels is the normal range, each carrying
2–4 points.

## Where deduplication and idempotency land

Split by who can observe it:

- **A client-visible contract is an FR.** Idempotent create ("a repeated create returns
  the existing flow") and duplicate-safe delivery ("a result delivered more than once is
  recognisable as a repeat") are behaviours the client relies on — state them as FRs.
- **The system-wide guarantee is an NFR.** "A repeated or replayed input leaves the flow
  in the same state as its first arrival" is a cross-cutting promise — one point under
  **Consistency**.
- **The machinery is neither.** Inbox tables, stable event ids, task claims, hashes —
  those are how the guarantee is kept, and they belong in `deepdives`.

## Out of scope — name what is deliberately not built

Every design states its exclusions. Two accepted forms:

- One trailing `<p class="prose">Out of scope: … — named explicitly so the design stays
  narrow.</p>` inside `.functional` (the corpus majority, for 1–2 exclusions).
- A third `.outofscope` column with `<li><strong>label</strong> — reason.</li>` items,
  when there are 3 or more exclusions each needing a reason.

Downstream, the sizing block spends these numbers — the capability list and arithmetic
in [kb-design-sizing](../kb-design-sizing/SKILL.md) are derived from the FRs/NFRs here,
so a constraint missing its number leaves that block guessing.

## Self-check

1. Read each FR aloud — is it one sentence, and does it survive with all markup stripped?
2. `grep` the functional `<ol>` for `<strong>\|<em>\|<br>\|<code>` — expect zero.
3. Scan both lists for solution words — hash, HMAC, queue, outbox, collector, broker,
   cache, shard, RLS, crypto- — expect zero; move any hit to `deepdives`.
4. Does every NFR open with a bold label from the standard set, with each point a single
   plain sentence carrying its number where one exists — and no sublist deeper than one
   level?
5. If the page's `problem` block uses routing tags (`→ FR: …` / `→ NFR: …`), does every
   tag still resolve to an item here, and does every item trace back? (See
   [kb-design-problem](../kb-design-problem/SKILL.md).)
6. `make all && make check`, then `node scripts/kb.mjs get <id> --block requirements` —
   FRs should scan as a flat list, NFRs as labels with indented points. Check 3 is the
   one that does the work.
