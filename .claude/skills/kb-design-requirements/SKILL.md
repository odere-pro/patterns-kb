---
name: kb-design-requirements
description: "Write or review the requirements block (FRs and NFRs) of a design page. Use when asked to \"write the requirements block\", \"add FRs/NFRs\", \"restructure the NFRs\", \"where does idempotency belong\", or to review one. Not for the numbers these feed (kb-design-sizing) or the interview that produces them (kb-design-problem)."
---

# Writing the requirements block

**A requirement says what the system must do or guarantee — never how.** The how belongs
to `architecture` and `deepdives`; a requirement that names the mechanism has pre-decided
the design before the page argues it.

## The markup

The block is hand-written markdown in the page under `docs/designs/` — no `kb.mjs` writer
exists for it. Run `node scripts/kb.mjs validate --file docs/designs/<id>.md` after every
edit, and `make gen && make validate` once the page is done. They validate block
presence, order and group facts, not content, so these rules are yours to enforce.

```markdown
## Requirements
<!--meta block=requirements-->

### Functional
<!--meta requirement=fr-->

- …

### Non-functional
<!--meta requirement=nfr-->

- **Label**
  - …

### Out of scope

- …
```

`### Functional` and `### Non-functional` each carry their `requirement` fact on the line
under the heading (KB-006, KB-008); `### Out of scope` is optional and carries none. The FR
list is a `-` list, and the `1.` list most of the corpus writes is equally valid — the
build issues `requirements-fr-N` from the top-level items of either. Choose by whether the page cites its own
requirements: a page whose prose says "FR-13" needs the visible numbers, and a page that
names them ("the reconstructable-history requirement") reads better without a column of
digits nobody refers to. Never mix the two on one page.

## 1. Write the functional requirements — one sentence, plain, atomic

- **Exactly one sentence per item.** If a second sentence is forming, it is a second
  requirement — split it.
- **Plain text only.** No bold, italics, hard breaks or code spans inside FR items. If a
  word needs bolding to be understood, the sentence is carrying too much.
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

```markdown
**Mandatory — the product promise**

1. …

**Additional — ongoing obligations and governance** {#requirements-h-additional}

9. …
```

- **A tier title is a run-in title** — a paragraph that is exactly one bold span (headings
  stop at H3, PAGE-002): the tier name, ` — `, then what the tier covers. Keep the name to
  two words and put everything else after the dash, so the reader finds the label without
  parsing a sentence.
- **The mandatory tier must stand alone** — a deployment meeting only it is a complete,
  correct product. If striking an item breaks the core promise, it is mandatory.
- **Additional items must be additive** — recurrence, audit surface, governance — and
  the split earns its keep only when paired with an **Evolvability** NFR stating that
  additional obligations attach without redesigning the core.
- On a numbered page, numbering continues across the tiers (the second list opens on the
  next number, `9.`), so an item keeps one number for its whole life. A `-` page needs
  neither.
- The sizing block should then trace capabilities per tier: what the mandatory core
  forces vs what the additional tier adds (see
  [kb-design-sizing](../kb-design-sizing/SKILL.md)).

## 2. Write the non-functional requirements — labelled constraints with numbers

- Shape: a labelled section, its points one plain sentence each:

  ```markdown
  - **Scale**
    - ~100 onboardings a week today; one merchant means several person-flows.
    - Headroom to 10k person-flows a day without redesign.
  ```

  **An NFR is a labelled item, its points nested under it.** The label is the item's whole
  bold lead and the points are the one list under it, so the column reads as labelled
  sections. A label with a single point may carry it on the same line after ` — `
  (`- **Uniqueness** — every short code maps to exactly one long URL.`). **One level of
  content only** — the `kb.mjs` reader renders exactly one sublist level; anything deeper
  welds into an unreadable line.

  The build issues `requirements-nfr-N` from the top-level items under
  `### Non-functional`, in order, so a new label added mid-list renumbers the ones after it;
  a nested point takes no id of its own unless one is written (`{#requirements-nfr-scale-2}`).
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

## 3. Place deduplication and idempotency correctly

Split by who can observe it:

- **A client-visible contract is an FR.** Idempotent create ("a repeated create returns
  the existing flow") and duplicate-safe delivery ("a result delivered more than once is
  recognisable as a repeat") are behaviours the client relies on — state them as FRs.
- **The system-wide guarantee is an NFR.** "A repeated or replayed input leaves the flow
  in the same state as its first arrival" is a cross-cutting promise — one point under
  **Consistency**.
- **The machinery is neither.** Inbox tables, stable event ids, task claims, hashes —
  those are how the guarantee is kept, and they belong in `deepdives`.

## 4. Name what is out of scope

Every design states its exclusions. Two accepted forms:

- One trailing paragraph `Out of scope: … — named explicitly so the design stays narrow.`
  after the functional list (the corpus majority, for 1–2 exclusions).
- A third `### Out of scope` section with `- **label** — reason.` items, when there are 3
  or more exclusions each needing a reason.

Downstream, the sizing block spends these numbers — the capability list and arithmetic
in [kb-design-sizing](../kb-design-sizing/SKILL.md) are worked out from the FRs/NFRs here,
so a constraint missing its number leaves that block guessing.

## 5. Self-check the draft

- Read each FR aloud — is it one sentence, and does it survive with all markup stripped?
- Does every NFR carry a label from the standard set as its item's bold lead, with each
  point a single plain sentence carrying its number where one exists, and nothing nested
  deeper than one level?
- If the page's `description` block ("Understanding the problem") uses routing tags (`→ FR: …` / `→ NFR: …`), does every
  tag still resolve to an item here, and does every item trace back? (See
  [kb-design-problem](../kb-design-problem/SKILL.md).)
- Run `node scripts/kb.mjs get <id> --block requirements` — FRs should scan as a flat
  list, NFRs as labels with indented points.
- If the FR list is tiered, is each tier title a run-in bold paragraph whose name is two
  words, with the gloss after ` — `?

## Done means

- No functional item holds bold, italics, a hard break or a code span.
- A `grep` of both lists for solution words — hash, HMAC, queue, outbox, collector, broker,
  cache, shard, RLS, crypto- — returns zero hits; any hit moves to `deepdives`. This is
  the check that does the work.
- `make gen && make validate` exits 0.
