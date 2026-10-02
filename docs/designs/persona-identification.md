---
title: Persona Identification & Sanction Check
description: "A long-running identity-and-sanctions flow that waits on people and vendors for days, yet never tells the client a wrong or half-finished verdict"
area: designs-advanced
owner: Oleksandr Derechei
tags: [event-driven, asynchrony, durability, error-handling, state-management]
status: stable
aliases: [KYC flow, identity verification pipeline, sanction screening, person identification flow, magic-link onboarding]
solves: [my flow status enum is tangled up with retry counts and worker bookkeeping, we write the new state then crash before publishing the event and the client never hears, a vendor callback arrives twice and the duplicate lands before we have written our own event, two workers picked up the same task and both called the paid vendor API, one forgotten client-id filter in a query could leak another tenant's data]
---

# Persona Identification & Sanction Check

A client starts a flow by providing an email address; the address's owner is invited to submit personal information and an ID photo, the ID is verified by a given external service, the verified person is screened against external sanction lists, and the result reaches the client on a webhook. Authentication, ID verification, sanction checks and email sending already exist — the problem is everything between them. A flow spends most of its life waiting on someone else — days for a person to upload a photo, hours for a vendor to come back up — while carrying regulated personal data that belongs to one client among many; being slow is acceptable here, but telling a client the wrong outcome, or never telling them at all, is not.

## Understanding the problem
<!--meta block=description-->

The task states a flow and four given components — no volumes, no jurisdictions, no data-protection rules. These questions close those gaps. Where no answer was available the assumption is marked; each answer lands in a requirement below.

**Q1 — How many flows a week?** → non-functional requirement (NFR): scale. Assumed, not given: ~100 merchant onboardings a week, and one merchant means several people — under 75 person-flows a day, with headroom designed to 10k. Confirm this first: every capacity decision below is priced against it.

**Q2 — One sanction list, or several?** → functional requirement (FR): screening. Several, and the verdict waits for the slowest. A late answer beats a quietly partial one. Assumed, not given: each vendor returns a hit or a clear, not a raw fuzzy-match score — if one can answer "possible match", that adjudication happens on the client's side of the webhook, because the five-state model carries no review state.

**Q3 — Point-in-time answer, or ongoing obligation?** → FR: re-screening, re-verification, result delivery. Ongoing, on both halves. Sanction lists change, and an ID document expires or is revoked. Both re-run on a cadence set per jurisdiction: re-screening needs nobody, re-verification needs a fresh document from the person.

**Q4 — What are we holding, where may it live, and what must we produce on demand?** → FR: separate PII (personally identifiable information) store, access audit; NFR: compliance, tenancy, retention.

- Name, date of birth, photograph of a government ID — GDPR (General Data Protection Regulation) personal data, on people who are not our customers.
- It stays in its client's region; the region is fixed when the client is onboarded, not chosen at runtime.
- On demand: a flow's history — what was checked, when, by whom.
- On demand: proof that data was erased, not just a claim.
- Retention is per jurisdiction and counted from the end of the relationship, not the check — an expiry the system enforces, in permanent tension with erasure.
- A cross-client leak is a reportable incident, not a bug.

{#description-ul-1}

**Q5 — Store the ID photo, or pass it through?** → NFR: compliance; drives the estimate. Store it: an audit asks what was checked, and no evidence means no answer. Storage is sized by that, not by traffic.

**Q6 — Does the client want live progress, or only the result?** → FR: result delivery, flow view, failure notice; out of scope: in-flight status. Only the result — a flow idles for days between two vendor calls, so live updates would report almost nothing. The dashboard shows progress to people who ask; machines get one webhook.

**Q7 — Does residency mean multi-region, and does anything fail over?** (open) → NFR: tenancy; out of scope: geo-failover. Residency yes, failover no. Residency means separate regional deployments sharing no data, at the cost of one copy of everything per region; failover — one client surviving the loss of a region — is not justified at this volume. Still open, for the client to answer: how many regions on day one, and whether a regulator demands failover anyway.

**Q8 — What is deliberately not built?** → Out of scope.

- Cancelling a flow in flight.
- In-flight status polling — the dashboard answers that.
- Geo-failover, per Q7.

{#description-ul-2}

## Explained
<!--meta block=explain-->

This design checks a person's identity and screens them against sanction lists, a process that waits days on people and outside vendors. It stores every wait as a row in one Postgres database, never as an open connection. Each step of a flow commits three things in one transaction: the new state, an event owed to the client and the next task for a worker. Stateless workers claim tasks from that table, call the vendors and write results back. A sender then delivers each owed event to the client's webhook, a callback address you register, with the same event id on every repeat. Choose this over a message broker (a separate queue service) while volume is low, because a broker cannot share a transaction with the state change. It trades three things. One writer means an outage stalls writes until the standby takes over, so keep a standby that confirms every commit. Personal data sits in one vault, so give it separate credentials and keys. Each region needs its own full copy of the stack, so budget for one stack per region.

**Example.** A client creates 10,000 flows a day. Each flow touches about 42 rows, so 10,000 times 42 is 420,000 writes a day, about 5 a second, or 10 at a busy peak. A person takes about 24 hours to submit, so around 10,000 flows sit parked at once. As open connections that would exhaust a pool, but as rows they cost storage only. The ID vendor goes down for 6 hours. Tasks wait, then run, and no result is lost. The cost is a single writer: if its database fails, every write stops until the standby is promoted.

## Requirements
<!--meta block=requirements-->

### Functional
<!--meta requirement=fr-->

**Mandatory — the product promise**

- A client starts a flow via API or dashboard by providing an email address.
- A repeated create for the same open client-and-email pair returns the existing flow instead of starting a duplicate.
- The email's owner receives a single-use invitation link that expires after 48 hours.
- The person can request a fresh invitation link themselves if theirs expired.
- The submitted personal information and ID photo are verified through the given external ID-verification provider.
- Only after verification passes is the person screened against every external sanction list.
- The client receives the flow's result on a webhook.
- A result delivered more than once is recognisable to the client as a repeat of the same result.

**Additional — ongoing obligations and governance** {#requirements-h4-2}

- When a flow cannot proceed, the client is notified with a failure event.
- A concluded flow's sanction screening is re-run on a cadence set per jurisdiction.
- Identity is re-verified with a fresh document from the person when their ID expires or is revoked.
- A verdict changed by re-screening or re-verification is delivered to the client the same way as the first result.
- Every state transition is recorded, and any flow's full history can be reconstructed after the fact.
- A flow and its transitions can be viewed step by step in the dashboard.
- Personal data is kept in its own store, separate from the flow's operational data.
- Every access to personal data is recorded with who accessed it, when, and for what purpose.
- Each sanction list is blocking or advisory per jurisdiction. A blocking list that cannot be reached holds the flow; an advisory one lets it conclude with the gap named in the result and a re-screen scheduled to close it.
- A client can record that its relationship with a person has ended, and that ends the person's recurring obligations and starts the retention clock.

{#requirements-ol-2}

### Non-functional
<!--meta requirement=nfr-->

- **Scale**
  - ~100 merchant onboardings a week today; one merchant means several person-flows.
  - Headroom to 10k person-flows a day without redesign.
  - Recurring re-screening grows with the book of open relationships, not with daily intake, and must never starve live flows.
  - That book is bounded by the relationships still open, not by everyone ever checked.
  - Growth beyond that has named exits, not speculative ones.
- **Evolvability**
  - A deployment meeting only the mandatory requirements is a complete, correct product on its own.
  - Each additional obligation attaches to the recorded history of the mandatory flow without redesigning it.
  - A new jurisdiction or vendor changes configuration and cadences, not the shape of the system.
- **Consistency**
  - The flow's recorded state and what the client was told must never diverge.
  - Behaviour is asynchronous end to end; when speed and correctness pull apart, correctness wins.
  - [Idempotency](../patterns/messaging/idempotency.md): a repeated or replayed input — a create, a vendor callback, a delivery — leaves the flow in the same state as its first arrival.
- **Availability & resilience**
  - The ID-verification vendor is down ~6 hours a week: queue and wait, never fail the flow for a vendor outage.
  - Stuck flows are detected and retried, and the escalation runs on a clock: an operator is paged within 15 minutes of a flow passing its state deadline, and the client receives a failure event within 5 minutes of that flow being declared stuck.
  - The internal objectives those alarms are set against, assumed rather than given: 99% of flows leave Awaiting ID Verification within 4 hours of the vendor accepting them, 99% of screening rounds close within 12 hours of fan-out, and 99.9% of client-visible events are delivered within 5 minutes of the transition that wrote them.
  - Nothing is promised about how fast a verdict arrives, because the two slowest participants are a vendor and a human being.
  - The system refuses new work rather than accepting work it cannot drain.
  - Every error path is explicit: a failed step retries, escalates, or ends the flow with a recorded reason — nothing is silently dropped.
  - A database failover loses no acknowledged fact: a committed transition and its outbox event survive the switch.
- **Observability**
  - One flow id correlates every transition, vendor call and delivery attempt.
  - Alarms fire on stuck flows, queue depth and per-vendor error rates.
  - Every alarm has a runbook: what it means, how to diagnose it, how to recover.
- **Compliance**
  - Verified documents are stored as evidence, not proxied.
  - Personal data is encrypted at rest; right-to-forget is honoured and provable.
  - Retention is a per-jurisdiction policy enforced and evidenced by the system.
- **Security & tenancy**
  - Tenant isolation is enforced by the database itself, not by application filters alone.
  - Internal services and data stores are reachable only over a private network, never from the public internet.
  - Webhooks are authenticated; invitation links cannot be reused.
  - Each client belongs to a region recorded at onboarding, and their data — personal data and documents above all — stays in it.

### Out of scope {#requirements-outofscope}

- **Cancelling a flow in flight** — a started flow runs to a terminal or is abandoned.
- **Status polling in flight** — recovery is webhook replay plus the dashboard, not a second read path.
- **Cross-region failover** — regional isolation for residency is in scope; surviving the loss of a region is not.

## Right-sizing
<!--meta block=sizing-->

**The problem:** a flow that waits days on people and vendors — ~75 person-flows a day today (assumed: ~100 merchant onboardings a week, ×5 person checks), design target 10k/day. **The shape:** event-driven, and the volumes do not decide it — the waits do. A request thread cannot be held for a day, a verdict must reach the client exactly once across crashes, and the regulator asks for the history itself, so every wait becomes a durable row and every state change an appended event. Current state is materialised on the flow row rather than folded from the log on each read: the audit obligation wants the append-only history, nothing in the requirements wants replay-on-read. **The stores:** four per region — operational Postgres (flows, history, queue, outbox/inbox), a separate encrypted vault for personal data, object storage for documents, and a small [shared cache](../patterns/caching/distributed-cache.md) holding circuit-breaker state. **The deployment unit:** residency means one full stack per region — every number below is per-region, the largest region dominates, and adding a region multiplies stacks, not load.

### Required capabilities — what the shape above forces, before any product is named {#sizing-h-capabilities}

| Capability | Tier | What forces it | Routes to |
| --- | --- | --- | --- |
| **Durable transactional store** | mandatory | The state machine and its append-only history; a transition and its consequences commit together or not at all. | NFR: consistency |
| **Work queue** | mandatory | ID vendor down ~6 h/week, person takes ~a day to submit; every step must be able to wait. | NFR: availability & resilience |
| **Coordination cache** | mandatory | One circuit-breaker record and one set of fallback weights per vendor, shared by every worker replica; also the rate-limit counters. | NFR: availability & resilience |
| **Rate limiting** | mandatory | Vendor quotas are finite and the self-serve resend must not become a mail cannon. | FR: invite resend; NFR: availability & resilience |
| **Object store** | mandatory | Documents kept as evidence, in the client's region. | NFR: compliance; security & tenancy |
| **Reliable webhook delivery** | mandatory | A repeat recognisable as a repeat. | FR: result delivery; NFR: consistency |
| **Private network** | mandatory | Internal services and stores unreachable from the public internet; only the API, dashboard and webhook egress face it. | NFR: security & tenancy |
| **Encrypted PII store with key custody** | additional | Its own credentials, one envelope key per person, held by a key manager the application cannot export. | FR: separate PII store, access audit; NFR: compliance |
| **Scheduler** | additional | Per-jurisdiction re-screening and re-verification cadences. | FR: re-screening, re-verification |

### The numbers — every figure is per region, and the largest region dominates {#sizing-h-numbers}

| Axis | How it is worked out | Result | Routes to |
| --- | --- | --- | --- |
| **Writes** | ~42 rows per flow (12 inserts — flow, person, document, link, ~5 transitions, ~3 outbox/inbox — plus ~8 task rows claimed and completed, so twice touched, plus ~8 `sanctions_check` writes and one row each for the verification session, the idempotency key and the delivery record) × 10k flows/day; ×2 for business-hours and campaign bunching. A single primary is untroubled below ~100/s, wants tuning by 1k/s and tops out around 10k–50k/s — two rungs above this design. | **5 row-writes/s into Postgres**, **~10/s peak** | NFR: scale |
| **Storage** | ~1 KB metadata × 5 years; ID photos 2 MB × 10k/day held for 1-year retention, expired by lifecycle rule. | **18 GB** metadata, **7 TB** of photos | NFR: scale; compliance |
| **Waiting (Little's law)** | ~24 h mean submission wait. Inert rows the claim query never scans, resolved by the 48-hour link expiry and a scheduled [sweeper](../patterns/distributed/coordination/sweeper.md) that re-invites or escalates a failure event. | **~10k open flows** parked | NFR: consistency |
| **Re-screening load (additional tier)** | ~3.6M concluded persons after a year × quarterly cadence ≈ 40k re-checks/day, each fanning out a leg per sanction list — ~160k legs/day, at ~10 row-writes apiece (one transition plus a task, result and outbox row per list). | **~2 outbound vendor calls/s**, **4–5 writes/s sustained** | NFR: scale |
| **Sanctions [fan-out](../patterns/messaging/fan-out.md)** | ~4 lists × 10k flows/day ≈ 40k screening legs/day from live intake, with the re-screening book adding roughly four times that at steady state. | **0.5 vendor calls/s**; the binding limit is vendor quota, not compute | NFR: scale |
| **Vendor invoice** | The ceiling that arrives with no incident to announce it. ~200k vendor calls a day at steady state — 40k live legs plus ~160k recheck legs — is a procurement line, not an engineering one, and it is priced per call. The asymmetry is what matters: intake is flat by assumption while the recheck book grows monotonically with the customer base, so the invoice climbs even in a month nobody onboards. Both the monthly contracted cap and the run rate against it are watched, because compute headroom says nothing about either. | **~200k calls/day**, growing with the book; the first limit reached is commercial | NFR: scale; tradeoffs |

Read the re-screening row twice. At steady state the recheck book roughly doubles the write rate live intake produces, so it is a second workload of the same size rather than a rounding error — still far below the ~100 writes/s a single primary notices, but it is why the batch needs a capacity story of its own rather than a shared pool and a hopeful off-peak window.

### Verdict per candidate — including the ones a bigger system would claim reflexively, so each is on the record {#sizing-h-verdicts}

| Candidate | Verdict | Reason | Routes to |
| --- | --- | --- | --- |
| **Synchronous request/response** | rejected | The person takes ~a day and the ID vendor is down ~6 h/week, so a thread or connection held per in-flight flow exhausts the pool at trivial concurrency. | NFR: availability & resilience |
| **Event-driven core** | adopted | Every wait becomes a durable row and every state change an appended transition, so the history the regulator asks for is a by-product of running the flow rather than a second write path that could disagree. | FR: history; NFR: consistency |
| **Work queue as a table in the system of record** | adopted | The task insert commits in the same transaction as the state change that spawned it, and `FOR UPDATE SKIP LOCKED` is a competent competing-consumers queue at ~10 writes/s. | NFR: consistency; availability & resilience |
| **Outbox and inbox** | adopted | The outbox closes the write-then-crash-before-publish gap that silently un-tells a client; the inbox dedups on the vendor's own request id, so a duplicate arriving before our first write still collides. | FR: result delivery; NFR: consistency |
| **Scheduler as a query on a cadence** | adopted | Both recheck clocks are due-dated rows a sweep picks up, so recurrence costs a predicate rather than a timer service. | FR: re-screening, re-verification |
| **Separate encrypted vault + key manager** | adopted | Erasure must be provable, so it is key destruction, not a delete; separate credentials keep a compromised API tier from reading personal data. | NFR: compliance; security & tenancy |
| **Object store** | adopted | Evidence and residency force it; at 7 TB of immutable blobs it is also the cheapest place they could live. | NFR: compliance |
| **Coordination cache** | adopted | Correctness, not speed. Per-process breakers make N replicas absorb N× the vendor's failures, then send N probes at a recovering vendor. | NFR: availability & resilience |
| **Synchronous in-region standby** | adopted | The single writer's failover, not a read path — the standby acknowledges every commit before the client does, so promotion loses no acknowledged fact. | NFR: availability & resilience |
| **Asynchronous replica** | rejected | It can acknowledge a commit the standby never received, and the fact lost would be the outbox row the client was already promised. | NFR: availability & resilience |
| **Read cache** | rejected | 18 GB of metadata, dashboard reads by primary key, no hot set worth a second copy to invalidate. | FR: flow view |
| **Search index** | rejected | The dashboard answers "show me this flow", never "find flows matching text". | FR: flow view |
| **Cache with a time to live (TTL) as the invite-link store** | rejected | The 48-hour expiry has to trigger a re-invite, tell an expired link from an unknown one, and be spent by rowcount in the transaction that records the document, so it is a predicate on a durable row rather than an eviction — and ~20k live rows buy nothing by moving. | FR: invite resend; NFR: consistency |
| **Message broker** | deferred | It would trade away the shared transaction to solve throughput this system does not have. **Trigger:** measured task-table churn, roughly sustained 100k flows/day. | NFR: scale |
| **Workflow engine** | deferred | A state column plus a transitions table already gives durable, inspectable orchestration. **Trigger:** flow variants multiplying — priced at losing the append-only history to the engine's own. | NFR: evolvability |
| **Read replica** | deferred | **Trigger:** dashboard and reporting reads competing with worker claims. | NFR: scale |

### When this stops being right → NFR: scale {#sizing-h-limits}

The queue-in-Postgres wears out first. Every update leaves a dead copy of the row behind for a background cleanup (autovacuum) to reclaim, and each task row is written three times — claimed, retried, completed. Past roughly 2M sustained requests the garbage outruns the cleanup, the `task` table bloats, and the claim query slows. **The signal: dead-tuple ratio on `task` and age of the oldest pending row, climbing together.** Exits in order, priced in Right-sizing above: index and prune the task table, a read replica, the broker (the outbox survives untouched), sharding by `client_id`. All safely deferred — resilience is bought by protocol, not infrastructure.

## Core entities & data design
<!--meta block=entities-->

Two things are kept apart, and the schema does the keeping — not a convention someone has to remember:

- Business truth vs operational bookkeeping — `flow` and its append-only `flow_transition` history never mix with `task` attempts, locks and backoff.
- PII vs everything else — personal data lives in a separate vault the operational store references only by opaque id.

A flow's current business state — which of the five states it is in — is materialised on its own row, so reading it is a primary-key lookup; every transition into that state is appended to `flow_transition` and never rewritten, so the audit view is a [projection](../patterns/distributed/coordination/materialized-view.md) over those rows, not a second write path. Three constraints do most of the work:

- The partial unique index `one_open_flow` is the duplicate-invite rule.
- The inbox's three-column uniqueness is the callback dedup (deep dive 3).
- `idempotency_key`'s composite primary key is the client-retry guard.
- `delivery_cursor`'s one row per flow is the ordering guarantee: a client hears one flow's verdicts in the order they were written.

{#entities-ul-2}

### Tenancy & identity — operational Postgres + PII vault {#entities-group-1}

- **Client** — The tenant. Every client-scoped table carries `client_id`, and row-level security makes the tenant filter impossible to forget.

  ```sql summary="schema — client"
  CREATE TABLE client (
    id                 uuid PRIMARY KEY,
    region             text NOT NULL,     -- recorded at onboarding; PII and documents stay in it
    webhook_url        text NOT NULL,
    webhook_secret_ref text NOT NULL      -- points into the secret store, never the secret itself
    -- … name, timestamps …
  );

  -- Tenant isolation the application cannot forget — same three lines on every
  -- client-scoped table. FORCE is the load-bearing one: ENABLE alone is bypassed by the
  -- table owner, so the application also connects as a NON-OWNER role.
  ALTER TABLE flow ENABLE ROW LEVEL SECURITY;
  ALTER TABLE flow FORCE  ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON flow
    USING (client_id = current_setting('app.client_id')::uuid);

  -- SET LOCAL, never SET: the setting dies with the transaction, so a pooled connection
  -- cannot carry one tenant's identity into the next checkout.
  -- The worker fleet claims across tenants and therefore cannot run under this policy at
  -- all. It runs as a separate, separately audited principal with no dashboard path — an
  -- exemption named here rather than discovered during an incident (dive 7).
  ```
- **Person** — Email and submitted personal data, encrypted under a per-person envelope key. Lives in the vault, referenced by id only; erasure destroys the key.

  ```sql summary="schema — person"
  -- In the encrypted vault — a separate store with its own credentials, one per region.
  CREATE TABLE person (
    id             uuid PRIMARY KEY,      -- the person_ref the operational store carries
    client_id      uuid NOT NULL,
    encrypted_data bytea NOT NULL,        -- email + submitted personal data, sealed as one blob
    key_id         text  NOT NULL         -- per-person envelope key, held by the key manager
  );
  -- Right-to-forget = destroy the key named by key_id; the blob becomes noise.
  -- The operational store keeps email_mac, never a plain digest of the address: an email
  -- is low-entropy and enumerable, so an unkeyed hash is a dictionary away from naming the
  -- person the erasure was supposed to protect (dive 6).
  ```
- **MagicLinkKey** — Hash of the invite key — 48-hour expiry, single-use, superseded by a resend. Expiry is a predicate the redemption query reads, never a store TTL (time to live): an evicted key reads as a forged one, and the sweeper needs the row to re-invite from (dive 12, Q4).

  ```sql summary="schema — magic_link_key"
  CREATE TABLE magic_link_key (
    key_hash       bytea PRIMARY KEY,   -- SHA-256 of a 256-bit CSPRNG token; never the token
    client_id      uuid NOT NULL REFERENCES client(id),  -- so the same RLS policy covers it
    flow_id        uuid NOT NULL,
    issued_at      timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz NOT NULL,  -- issued_at + 48h; a predicate, not an eviction
    used_at        timestamptz,           -- spent when the DOCUMENT lands, not at submit
    invalidated_at timestamptz            -- superseded by a resend — a different fact from spent
  );

  -- Redemption is a conditional write checked by ROWCOUNT, never a read-then-write:
  --   UPDATE magic_link_key SET … WHERE key_hash = $h
  --     AND used_at IS NULL AND invalidated_at IS NULL AND expires_at > now();
  -- Zero rows updated tells expired from forged from already-spent, and two concurrent
  -- redemptions cannot both win.
  -- Spending it at the upload rather than at the form post is the part that costs nothing
  -- and saves the support case: a person whose PUT fails has consumed no link, so the
  -- retry works instead of stranding them on a 409.

  -- Retention, not TTL: a scheduled retention sweep deletes spent and expired rows on the
  -- jurisdiction's clock — the same due-dated-predicate machinery as the recheck clocks.
  ```
- **PersonRelationship** — What the recurring obligations hang off, and the only thing that ever ends them. Retention counts from `closed_at`, which is why an object-store lifecycle rule cannot be the retention policy.

  ```sql summary="schema — person_relationship"
  CREATE TABLE person_relationship (
    client_id       uuid NOT NULL REFERENCES client(id),
    person_ref      uuid NOT NULL,
    opened_at       timestamptz NOT NULL,
    closed_at       timestamptz,         -- set by the client; ends every recurring obligation
    rescreen_due_at timestamptz,         -- NULLed on close, so the clock stops finding the row
    reverify_due_at timestamptz,         -- likewise
    retain_until    timestamptz,         -- computed FROM closed_at, not from the last check
    PRIMARY KEY (client_id, person_ref)
  );
  -- NULLing the two due dates on close is the whole termination rule. Without it the book
  -- only grows: the system keeps buying quarterly screens on ex-customers and keeps
  -- processing their data with no live lawful basis (Right-sizing, dive 6).
  ```

### Flow lifecycle — operational Postgres

- **Flow** — The unit a client starts: current business state (the five-state model's enum, nothing else), an opaque reference into the PII vault, an optimistic-lock version.

  ```sql summary="schema — flow"
  -- Business state: the five-state model — four in flight, a four-way terminal branch.
  CREATE TYPE flow_state AS ENUM (
    'initiated', 'awaiting_submission', 'awaiting_id_verification',
    'awaiting_sanctions_check',
    'clear', 'cleared_with_caveat', 'sanctioned', 'invalid_id',  -- the terminal branch
    'expired');                                      -- abandoned: the sweeper's terminal
  -- 'cleared_with_caveat' is a terminal because the client acts differently on it:
  -- every list its jurisdiction marks BLOCKING reported, and at least one ADVISORY
  -- list could not be reached. Collapsing it into 'clear' would tell the client a
  -- clean answer we did not have; a separate terminal makes the gap a fact they
  -- read, and one the re-screen closes when the list returns (dive 3).

  CREATE TABLE flow (
    id          uuid PRIMARY KEY,
    client_id   uuid NOT NULL REFERENCES client(id),
    person_ref  uuid NOT NULL,                -- opaque ref into the PII vault
    email_mac   bytea NOT NULL,               -- HMAC under a per-region key erasure also destroys;
                                              -- the duplicate-invite rule reads it, the vault holds the address
    state       flow_state NOT NULL DEFAULT 'initiated',
    version     int NOT NULL DEFAULT 0        -- optimistic check on every transition
    -- … timestamps …
  );

  -- The duplicate-invite rule: at most ONE open flow per (client, email).
  -- A second create finds this index and returns the existing flow.
  CREATE UNIQUE INDEX one_open_flow ON flow (client_id, email_mac)
    WHERE state NOT IN ('clear', 'cleared_with_caveat', 'sanctioned',
                        'invalid_id', 'expired');
  -- 'expired' has to be in that list, and it is the reason the state exists. An
  -- abandoned flow never reaches a terminal on its own, so without it the index
  -- holds the (client, email) pair open forever: the client is handed the dead
  -- flow by the repeated-create rule on every retry, and cancelling is out of scope. The sweeper
  -- transitions an overdue flow to 'expired' — escalation becomes a recorded
  -- fact rather than an alert it re-sends on every pass.
  ```
- **FlowTransition** — Append-only history of every state change. The state machine is the source of truth; the audit view is a projection over this table, never a second place to write. {#entities-entity-5}

  ```sql summary="schema — flow_transition"
  CREATE TABLE flow_transition (        -- append-only; the audit view projects from here
    flow_id        uuid NOT NULL,
    seq            int  NOT NULL,
    from_state     flow_state,
    to_state       flow_state NOT NULL,
    cause          text NOT NULL,       -- 'idv_passed', 'list_hit:ofac', 'sanctions_recheck', 'doc_expired', …
    provider       text,                -- WHICH vendor answered — the fallback is not the default
    policy_version text,                -- to WHAT standard, at the time it ran
    at             timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (flow_id, seq)
  );
  -- provider and policy_version are stamped by that vendor's ACL (dive 3).
  -- 'Verified' alone cannot answer "how was this person verified" once traffic
  -- can shift to a fallback mid-incident and policies can change under it.
  ```
- **Task** — The work queue. All operation state lives here — pending/processing, attempts, locks, run-after — and none of it ever touches the Flow enum. {#entities-entity-6}

  ```sql summary="schema — task"
  CREATE TABLE task (                   -- ALL operation state lives here, not on flow
    id           bigserial PRIMARY KEY,
    flow_id      uuid NOT NULL,
    kind         text NOT NULL,         -- send_invite | verify_id | check_list:<list> | deliver_webhook
                                        -- | await_callback:<vendor> — the silent-vendor deadline (dive 4)
    status       text NOT NULL DEFAULT 'pending',   -- pending | processing | done | dead
    attempts     int  NOT NULL DEFAULT 0,
    max_attempts int  NOT NULL DEFAULT 8,  -- the budget; without it, poison retries for ever
    last_error   text,                     -- what an operator opens a dead task to read
    run_after    timestamptz NOT NULL DEFAULT now(),  -- backoff WITH jitter lands here
    locked_by    text,
    locked_at    timestamptz
  );
  -- attempts counts, max_attempts stops, last_error diagnoses. Drop the budget and a
  -- malformed vendor response burns a worker slot for ever; drop the error and the dead
  -- task is a number nobody can act on (dive 4).
  ```

### Verification evidence — operational Postgres + object store {#entities-group-3}

- **Document** — The ID photo's metadata row, written before the presigned upload so a failed upload leaves a visible stub, never an orphan blob. Bytes live in object storage.

  ```sql summary="schema — document"
  CREATE TABLE document (
    id          uuid PRIMARY KEY,
    person_ref  uuid NOT NULL,
    storage_key text NOT NULL,          -- row FIRST, then presigned upload → no orphan blobs
    uploaded_at timestamptz             -- NULL = upload never completed; sweeper notices
  );
  ```
- **VerificationSession** — One verification attempt, carrying the verified document's expiry date — the re-verification clock reads it.

  ```sql summary="schema — verification_session"
  CREATE TABLE verification_session (
    id              uuid PRIMARY KEY,
    flow_id         uuid NOT NULL,
    document_id     uuid NOT NULL REFERENCES document(id),
    result          text,                 -- NULL while the vendor works
    doc_expires_on  date,                 -- what the re-verification clock reads
    reverify_due_at timestamptz           -- due-dated row the scheduler sweep picks up
    -- … provider, timestamps …
  );
  ```
- **SanctionsCheck** — One row per sanction list — the [Scatter-Gather](../patterns/messaging/scatter-gather.md) legs the collector joins. Its outcome is three-valued, so a list nobody can reach still ends; its due date is the re-screening clock.

  ```sql summary="schema — sanctions_check"
  CREATE TABLE sanctions_check (
    flow_id        uuid NOT NULL,
    round          int  NOT NULL,          -- issued by the transition that fanned out
    list           text NOT NULL,          -- one leg per sanction list
    outcome        text,                   -- NULL while pending; hit | clear | unavailable
    recheck_due_at timestamptz,            -- per-jurisdiction cadence; the sweep's predicate
    PRIMARY KEY (flow_id, round, list)     -- round, or a re-screen counts January's answers
    -- … checked_at, provider, policy_version …
  );
  -- The round is what makes the collector's count honest. Without it a re-screen
  -- reuses the first screen's rows: the first leg back counts every list as
  -- reported — because the others still hold last quarter's outcome — and concludes
  -- the flow early. The collector counts TERMINAL OUTCOMES within its round:
  --   SELECT count(*) FROM sanctions_check
  --   WHERE flow_id = $flow AND round = $round AND outcome IS NOT NULL;

  -- 'unavailable' is the third value, and it is what makes that count reachable.
  -- A two-valued verdict — answer or NULL — leaves a leg no way to end except an
  -- answer, so a vendor's PERMANENT failure becomes our permanent stall with no
  -- escape that is not a deploy. The sweeper stamps 'unavailable' when a leg's
  -- task exhausts its retries; per-list criticality then decides what it means.

  -- The leg's outcome is recorded UNCONDITIONALLY — this write is not guarded on
  -- the flow's state, because a leg that reports after the flow concluded is
  -- exactly the report we must not lose:
  INSERT INTO sanctions_check (flow_id, round, list, outcome)
  VALUES ($flow, $round, $list, $outcome)
  ON CONFLICT (flow_id, round, list) DO UPDATE
    SET outcome = excluded.outcome
    WHERE sanctions_check.outcome IS DISTINCT FROM 'hit';  -- a hit is never overwritten
  ```

### Integration & delivery — operational Postgres {#entities-group-4}

- **Outbox** — One row per event the client must hear about, written in the same transaction as the transition that caused it.

  ```sql summary="schema — outbox"
  CREATE TABLE outbox (
    id           bigserial PRIMARY KEY,
    flow_id      uuid NOT NULL,
    event_id     uuid NOT NULL UNIQUE,  -- the client's dedup key, stable across retries
    seq          int NOT NULL,          -- this flow's own order; the dispatcher sends by it
    payload      jsonb NOT NULL,
    published_at timestamptz,           -- NULL = still owed to the client
    UNIQUE (flow_id, seq)
  );
  ```
- **DeliveryCursor** — One lane per flow, and the reason two results cannot arrive out of order. The dispatcher claims a flow rather than an event, and sends only the next sequence that flow owes.

  ```sql summary="schema — delivery_cursor"
  CREATE TABLE delivery_cursor (
    flow_id       uuid PRIMARY KEY,
    client_id     uuid NOT NULL REFERENCES client(id),
    delivered_seq int NOT NULL DEFAULT 0,  -- the last seq this client has 2xx'd
    attempts      int NOT NULL DEFAULT 0,
    run_after     timestamptz NOT NULL DEFAULT now(),
    locked_by     text                     -- one dispatcher per flow, never two
  );
  -- The dispatcher claims ONE flow, reads its lowest unpublished outbox row above
  -- delivered_seq, sends it, and advances only on a 2xx. A flow in backoff blocks its own
  -- lane and nobody else's, so a re-screen's late 'clear' physically cannot overtake the
  -- 'sanctioned' ahead of it — which a shared queue of events drained by N dispatchers
  -- cannot promise (dive 3). Claiming per flow also claims per tenant, so one dead
  -- endpoint cannot hold the pool.
  ```
- **Inbox** — One row per vendor callback, inserted in the same transaction as the callback's effect.

  ```sql summary="schema — inbox"
  CREATE TABLE inbox (                  -- vendor callbacks, deduped at the boundary
    flow_id             uuid NOT NULL,
    step                text NOT NULL,
    provider_request_id text NOT NULL,  -- the VENDOR's id — collides even before our outbox write
    received_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (flow_id, step, provider_request_id)
  );
  ```
- **IdempotencyKey** — The client-inbound retry guard, one row per tenant, route and key. The insert is the lock: a concurrent retry either creates the row and owns the work, or collides and replays the stored response.

  ```sql summary="schema — idempotency_key"
  CREATE TABLE idempotency_key (        -- client retries only; vendors dedup via inbox
    client_id     uuid NOT NULL REFERENCES client(id),
    endpoint      text NOT NULL,        -- a key is unique per tenant AND per route
    key           text NOT NULL,        -- the client's opaque value — never parsed
    request_hash  bytea NOT NULL,       -- digest, not the body: the email stays in the vault
    status        text NOT NULL,        -- in_progress | completed
    lease_until   timestamptz,          -- in_progress only: the sweeper reclaims past this
    response_code int,                  -- replayed verbatim, so a retry is byte-identical
    response_body jsonb,
    expires_at    timestamptz NOT NULL, -- 24h; must outlast the client's own retry budget
    PRIMARY KEY (client_id, endpoint, key)
  );
  ```
- **WebhookDelivery** — Per-attempt delivery record: what was sent, when, and what the endpoint answered.

  ```sql summary="schema — webhook_delivery"
  CREATE TABLE webhook_delivery (
    id              bigserial PRIMARY KEY,
    outbox_id       bigint NOT NULL REFERENCES outbox(id),
    attempt         int NOT NULL,
    response_status int,                  -- NULL = no answer before timeout
    sent_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (outbox_id, attempt)
  );
  ```

### Governance — operational Postgres {#entities-group-5}

- **AuditLog** — The compliance papertrail of PII access — who read what, when, why. Flow history it does not duplicate; that is FlowTransition's projection.

  ```sql summary="schema — audit_log"
  CREATE TABLE audit_log (              -- append-only; PII access only, never flow history
    id         bigserial PRIMARY KEY,
    actor      text NOT NULL,           -- who: operator or service principal
    person_ref uuid NOT NULL,           -- what
    purpose    text NOT NULL,           -- why: 'support_case:1234', 'regulator_export'
    at         timestamptz NOT NULL DEFAULT now()
  );
  ```

## The interface — API design
<!--meta block=interface-->

Every client-facing state-changing call returns 202 — work is recorded durably and done asynchronously. The one exception is the onboardee's submission, a 201 carrying the presigned upload URL it just created. There is no single idempotency mechanism: each boundary carries its own guard, held by the side that can actually see the duplicate, so every endpoint below names the one it relies on. Admission control is part of the contract rather than an incident: when the live class's oldest pending task passes its ceiling, `POST /flows` answers 429 with a `Retry-After`, because accepting a flow into a queue already hours behind is a promise the system cannot keep.

### Client API — authenticated tenant calls

- **`POST /flows`** — Start a flow from an email. Two guards against two different duplicates: the stored `Idempotency-Key` absorbs the client's network retry, and `one_open_flow` absorbs a genuinely repeated invite.

  ```http summary=contract
  POST /flows
  Idempotency-Key: 7c9e-4b1a-…                     client-generated UUID, opaque to us
  {
    "email": "jane@example.com"                    the verdict goes to the client's
  }                                                registered webhook_url — not per-flow

  202 Accepted
  { "flowId": "flow_9c31", "state": "initiated" }

  # Same key, completed  → the stored 202 replayed, byte-identical (the create raced a timeout).
  # Same key, in flight  → 409 Conflict + Retry-After — never a second execution.
  # Same key, other body → 422: the request_hash mismatch stops a client accidentally
  #                        serving itself the result of a different request.
  # DIFFERENT key, same email → 200 with the EXISTING open flow, per the partial unique
  #                        index one_open_flow: one open flow per (client, email).

  429 Too Many Requests    Retry-After: 900
  # Admission control, and a different thing from the per-client rate limit beside it: the
  # live class's oldest pending task is past its age ceiling, so the system refuses work it
  # cannot drain rather than queueing it out of sight (dive 1). Refusing costs the client a
  # retry; accepting costs them a flow that sits invisible for hours behind work they
  # cannot see.
  ```
- **`POST /flows/{id}/invite/resend`** — Invalidate prior keys, issue a fresh single-use magic link with a new 48-hour expiry; reachable from the onboardee's resend page as well as by the client. The call that most needs the stored key — a retried resend would otherwise invalidate the link it just issued and send a second email. {#interface-endpoint-2}

  ```http summary=contract
  POST /flows/flow_9c31/invite/resend
  Idempotency-Key: b41f-90ac-…                     without it, a retry invites twice

  202 Accepted
  # Prior keys are stamped invalidated_at, ONE fresh single-use key is issued with a
  # new 48h expiry, and the email goes out as a task — not inline.
  # Spends nothing but a rate-limit token: safe to expose behind the resend page.

  409 Conflict   { "error": "already submitted" }   nothing left to invite
  409 Conflict   { "error": "retry in progress" }   same key, first call still running
  ```
- **`POST /flows/{id}/webhook/replay`** — Re-emit a missed result from the outbox, same `eventId` — the recovery path that replaces polling. It takes no `Idempotency-Key`: the `eventId` already guards the delivery, so a replay is repeatable by construction. {#interface-endpoint-3}

  ```http summary=contract
  POST /flows/flow_9c31/webhook/replay

  202 Accepted
  # Re-emits the flow's terminal event from the outbox — the SAME eventId, so the
  # client's dedup absorbs it whether or not the original ever arrived.
  # No Idempotency-Key: replay is repeatable by construction, and a key on a call that
  # already repeats safely is ceremony (dive 12, Q8).

  409 Conflict   { "error": "flow not terminal" }   nothing to replay yet
  ```
- **`POST /persons/{ref}/relationship:close`** — The client records that the relationship ended, and every recurring obligation for that person stops. This is the only thing that bounds the recurring book, and the cheapest lever on the whole vendor bill. {#interface-endpoint-4}

  ```http summary=contract
  POST /persons/prs_7d02/relationship:close
  Idempotency-Key: 3ac0-…

  202 Accepted
  { "closedAt": "2026-08-01T09:14:00Z", "retainUntil": "2031-08-01" }

  # One transaction: stamp closed_at, NULL rescreen_due_at and reverify_due_at so both
  # clocks stop finding the row, and set retain_until from now() on the jurisdiction's
  # schedule. Retention counts from HERE, not from the last check (dive 6).
  # Idempotent by construction — closing a closed relationship changes nothing — so the
  # Idempotency-Key is belt to the braces rather than the guard.
  # A flow already in flight for that person runs to its terminal; what stops is the
  # recurring work the closed relationship no longer justifies.

  409 Conflict   { "error": "no open relationship" }   nothing to close
  ```

### Dashboard reads — the human read path {#interface-group-2}

- **`GET /flows/{id}/transitions`** — The read surface behind the step-by-step dashboard view — a projection over `flow_transition`, under the same RLS tenant session as every other call. Reads are by primary key; the list variant pages by cursor for support triage. Rendering a vault field is a PII access like any other: it lands in `audit_log`.

  ```http summary=contract
  GET /flows/flow_9c31/transitions

  200 OK
  {
    "flowId": "flow_9c31",
    "state":  "awaiting_sanctions_check",
    "transitions": [
      { "seq": 1, "to": "awaiting_submission",      "cause": "invite_sent", "at": "…" },
      { "seq": 2, "to": "awaiting_id_verification", "cause": "submitted",   "at": "…" },
      { "seq": 3, "to": "awaiting_sanctions_check", "cause": "idv_passed",  "at": "…" }
    ]
  }
  # A projection over flow_transition — the audit view, never a second write path.
  # GET /flows/{id} returns the row; GET /flows?state=…&cursor=… pages by primary key
  # for support triage. No free-text search — the dashboard asks "show me this flow",
  # never "find flows matching text" (Right-sizing).
  # Personal fields render only through the vault, and each read appends an audit_log
  # row: who, when, 'dashboard_view'. This is the human surface from Q6 — machines
  # still get one webhook, and in-flight polling stays out of scope.
  ```

### Onboardee surface — the magic-link token is the identity {#interface-group-3}

- **`POST /submissions`** — Submit personal info against the magic-link session — that token is the onboardee's entire identity, there being no account, and it authorises this one flow's submission and nothing client-scoped. Returns a presigned upload URL for the ID photo; on `410` the onboardee sees the resend page, not a support address.

  ```http summary=contract
  POST /submissions
  Authorization: Bearer <magic-link token>         hash looked up, checked by rowcount
  { "personalInfo": { … } }

  201 Created
  {
    "uploadUrl": "https://blob.example/id-photos/…?sig=…",   presigned, short-lived
    "expiresIn": 900
  }
  # The document metadata row is written BEFORE the URL is issued — an abandoned
  # upload leaves a visible stub the sweeper can expire, never an orphan blob.
  # The browser PUTs the photo straight to object storage; bytes never transit this API.
  # The URL is scoped to one object key, an image content type and a size cap — the
  # store refuses anything else. Its upload-complete event re-enters through the API
  # like any callback: one transaction stamps document.uploaded_at and enqueues the
  # verify_id task. No event, no verification — and the NULL stub is what the sweeper
  # expires.
  # The link is spent by THAT transaction, not by this one: used_at is stamped when the
  # document lands. A person whose upload fails has consumed nothing and can simply try
  # again, where spending the link at the form post would strand them on a 409.
  # Redemption is one conditional UPDATE … WHERE used_at IS NULL AND expires_at > now(),
  # read by rowcount — zero rows tells expired from forged from already-spent, and two
  # concurrent redemptions cannot both win.

  409 Conflict   { "error": "already submitted" }   the document for this key already landed
  410 Gone       { "error": "invite expired" }      show the self-serve resend
  ```

### Vendor callbacks — deduped at the boundary {#interface-group-4}

- **`POST /callbacks/{provider}`** — One inbound surface for IDV and sanctions-list callbacks, deduped on the vendor's own request id — the inbox's three-column uniqueness is the guard, so redelivery is always safe.

  ```http summary=contract
  POST /callbacks/idv-provider
  X-Signature: sha256=…                            vendor-authenticated, private ingress
  {
    "requestId": "req_88a1",                       the VENDOR's id — the dedup key
    "flowId":    "flow_9c31",
    "result":    "passed"
  }

  202 Accepted
  # The inbox row and the callback's effect commit in one transaction; the
  # three-column uniqueness (flow, step, requestId) makes a redelivered callback
  # collide even if it arrives before anything else was written (deep dive 3).
  # A duplicate gets the same 202 — the vendor retries freely.
  ```

### Outbound — the webhook the client receives {#interface-group-5}

- **`POST {client.webhook_url}`** — The result and failure events, at-least-once, to the endpoint the client registered at onboarding, HMAC (hash-based message authentication code)-signed with the per-client secret. `eventId` is the client's dedup key — stable across retries and replays.

  ```http summary=contract
  POST https://client.example/hooks/kyc
  X-Signature: sha256=…                            HMAC of the body, per-client secret
  X-Signature-Key: whsec_2                         which secret signed — rotation dual-signs
  {
    "eventId":    "evt_4f21",                      STABLE — the client's dedup key
    "flowId":     "flow_9c31",
    "seq":        7,                               this flow's own order — discard anything
                                                   older than what you have applied
    "state":      "cleared_with_caveat",           clear | cleared_with_caveat
                                                   | sanctioned | invalid_id
                                                   (SLA-breach escalations arrive as a
                                                    distinct failure event type, same channel)
    "caveats": [                                   present ONLY on cleared_with_caveat —
      { "list": "eu_consolidated",                 which advisory list went unanswered,
        "reason": "unavailable",                   and when we will try it again. A client
        "retryDueAt": "2026-07-21T09:00:00Z" }     that ignores this reads a weaker clear
    ],                                             than the one it thinks it has.
    "occurredAt": "2026-07-20T14:33:48Z"
  }

  # Delivery is at-least-once: non-2xx → retry with backoff → dead task + alert,
  # and the event stays replayable from the outbox with the SAME eventId.
  # The contract names eventId as the dedup key — duplicates are the client's
  # to absorb, which is only fair because the key is guaranteed stable.
  # ORDER is a separate promise from dedup: one flow's events are delivered one at a time,
  # in seq order, by the dispatcher that claims that flow's lane (dive 3). A flow stuck in
  # backoff holds up its own results and nobody else's.
  ```

### Governance — right-to-erasure {#interface-group-6}

- **`DELETE /persons/{id}`** — Crypto-shred the vault entry and purge the photo; the flow's non-PII history remains.

  ```http summary=contract
  DELETE /persons/prs_7d02

  202 Accepted
  # Erasure runs as a task: destroy the person's envelope key (the vault blob
  # becomes noise), purge the photo from object storage, keep the flow's non-PII
  # history — the audit obligation survives the person's data (deep dive 6).
  # The access itself lands in audit_log: who, when, 'erasure_request'.

  404 Not Found                                    unknown or already erased
  ```

## How the system is built
<!--meta block=architecture-->

Everything public enters through one door: clients create, replay and erase through the Identification API, onboardees reach it through a single-use magic link, vendors call back into it — nothing else is reachable. The one structural decision is that **the core is a persisted state machine on Postgres — every wait is a durable row, never an open connection**: the human takes a day to submit, the ID vendor is down ~6 hours a week, and a connection held per in-flight flow would exhaust the pool at trivial concurrency. The write path commits a transition and all its consequences in one transaction; the stateless Worker fleet claims the resulting tasks and calls the vendors; its dispatcher drains the outbox into signed webhooks. Nothing holds a connection across a wait; a parked flow is a row.

```mermaid caption="The whole system — who talks to whom, and where truth lives. One database holds every kind of row; the stateless fleet works off it; dashed boxes are the given externals."
flowchart TB
    C["Client"] -->|"create · replay · erase"| API["Identification API — stateless, RLS session per tenant"]
    U["Onboardee"] -->|"magic link · submit"| API
    U -->|"presigned PUT — ID photo"| BL[("Object store · claim-check")]
    API ==>|"ONE txn: transition + outbox + inbox + tasks"| PG[("Postgres — flow, transition, task, outbox, inbox")]
    API -->|"personal data, own credentials"| VAULT[("PII vault — separate encrypted store")]
    WK["Worker fleet — vendor pools, dispatcher, sweeper · competing-consumers"] -->|"claim tasks · drain outbox · sweep stuck"| PG
    WK -->|"consult breaker + weights"| CACHE[("Shared cache · circuit-breaker")]
    WK -->|"call"| V["IDV · Sanction lists · Email"]:::ext
    V -.->|"callback → inbox"| API
    WK -->|"HMAC-signed event → client endpoint"| C
    classDef ext stroke-dasharray:4 4;
```

**The same board, numbered.** The map above says who talks to whom; this one says in what order, and adds the two parts a first sketch can leave out — the public edge, and the schedulers that run on their own clock rather than on a request. Boxes are merged so it reads as one spine: the three vendor pools are a single box (one bulkhead per vendor — dive 4 zooms in), the callable externals are a single dashed box, and Postgres is one cylinder whose edges name the rows they touch — the four-table transaction detail is dive 3's SQL. An [API gateway](../patterns/distributed/routing/api-gateway.md) fronts the public tier, terminating Transport Layer Security (TLS), authenticating tenants and enforcing the per-flow limits (the [rate limiter](../patterns/distributed/resilience/rate-limiter.md) that keeps the resend endpoint from becoming a spam cannon). Follow the numbers 1–13 left to right; the 5–10 loop repeats as the flow advances, and every deep dive below zooms one part of it.

```mermaid caption="One spine, read left to right: enter (1–4), commit (5), work (6–8), return (9–11), deliver (12–13). The 5–10 loop repeats for every step of the flow — invite, submission, verification, each sanction list — until the outbox owes the client a result: the flow row is the saga's state, the state machine (dive 2) decides each next step, and the workers execute it. The schedulers sweep and re-enter flows on their clocks throughout."
%%{init: {"flowchart": {"nodeSpacing": 60, "rankSpacing": 110}}}%%
flowchart LR
    C["Client"]
    U["Onboardee"]
    subgraph PUB["Public edge"]
        GW["API gateway · rate-limiter"]
        API["Identification API — stateless, RLS session per tenant"]
    end
    C -->|"1 · create · replay · erase"| GW
    U -->|"2 · magic link · submit"| GW
    GW -->|"3 · auth + rate limit"| API
    subgraph PRIV["Private network — one flow = one orchestrated saga · saga · workflow-orchestration"]
        PG[("Postgres — the state machine: flow + transition · task queue · outbox · inbox")]
        VAULT[("PII vault — separate encrypted store, own credentials")]
        BL[("Object store — ID photos · claim-check")]
        POOLS["Worker pools — email · IDV · sanctions · bulkhead each"]
        DISP["Webhook dispatcher — the outbox relay"]
        SCH["Schedulers — sweeper + recheck clocks"]
        MET[("Metrics store — per-vendor health")]
        CACHE[("Shared cache — breaker + weights · circuit-breaker")]
        CFG[("Config store — list roster · criticality · cadences · quotas")]
    end
    U -->|"4 · presigned PUT — short-lived URL issued at submit · valet-key"| BL
    API ==>|"5 · 10 — ONE txn: transition + outbox + tasks (callback: inbox row first)"| PG
    PG -->|"6 · tasks claimed per pool"| POOLS
    POOLS -.->|"7 · breaker + weights"| CACHE
    POOLS -->|"8 · calls: invite · IDV · sanction legs"| VEND["IDV primary + weighted fallback · Sanction lists · Email vendor"]:::ext
    VEND -.->|"9 · callbacks"| API
    POOLS -->|"11 · collector: one guarded transition"| PG
    PG -->|"12 · outbox — relay polls, retries"| DISP
    DISP -->|"13 · HMAC-signed event, stable eventId"| CB["Client webhook endpoint"]:::ext
    SCH -->|"sweep · re-queue · dead-letter · recheck"| PG
    POOLS -.->|"health metrics"| MET
    MET -.->|"drive breaker + weights"| CACHE
    POOLS -.->|"refetch on interval — last cached version at boot"| CFG
    SCH -.->|"cadences · criticality"| CFG
    classDef ext stroke-dasharray:4 4;
```

**How one flow moves.** A client's create (1) passes the gateway's auth and limits (3) and becomes one transaction (5): a flow row, its outbox event, and an invite task. The email pool claims that task (6) and sends the magic link (8); the onboardee follows it (2), submits, and PUTs the photo straight to the object store with the short-lived URL issued at submit (4); the store's upload-complete event re-enters through the API to stamp `uploaded_at` and enqueue `verify_id` in one transaction — an event, not a poll, bridges 4 to 6. From there every step commits the same way — transition + outbox event + next task — so the 5–10 loop runs once per step: the IDV pool calls whichever provider the weights pick (7–8), the callback lands as a sender-keyed inbox row with its effect in the same transaction (9–10), then the sanctions pool fans one leg per list and its collector concludes the flow exactly once (11). Whatever the outcome, the outbox owes the client an event; the relay drains it (12) and delivers it HMAC-signed with a stable `eventId` (13). Nothing in that story holds a connection across a wait — a parked flow is a row — which is why vendor downtime and human slowness cost latency, never correctness.

**What runs all the time.** The sweeper re-queues expired locks, dead-letters exhausted tasks and escalates overdue flows — the failure event to the client travels the same outbox path as a result. The recheck clocks re-enter concluded flows on each jurisdiction's cadence, and the re-entered flow walks the same numbered loop. And the per-vendor health series feed both the alerts and the breaker weights, so observability and resilience read the same numbers.

### Components & communication {#architecture-h-components}

| Component | Role, and what it talks to |
| --- | --- |
| **API gateway** | The public edge, and the only box the internet may address: it terminates TLS, authenticates the tenant and enforces the per-client and per-flow limits before anything reaches the API. A resend endpoint exposed to onboardees needs that ceiling or it becomes a mail cannon. |
| **Identification API** | The single public entry point: client calls, onboardee submissions via magic link, vendor callbacks. Its only job is to commit facts — a transition, its outbox event, its follow-up tasks — in one transaction. Stateless, with a row-level-security session per tenant. |
| **Postgres** | The system of record and the queue: flow, its append-only transition history, task, outbox, inbox. The PII vault is **not** in it — that is a separate encrypted store with its own credentials, reached only through `person_ref`, so a compromised API tier holds references rather than personal data. Every guarantee on this page is one of its constraints or transactions. |
| **Worker pools and dispatcher** | Stateless replicas around the database: one pool per vendor claims tasks with `FOR UPDATE SKIP LOCKED`, and the dispatcher drains the outbox into HMAC-signed webhooks. The dispatcher claims a **flow** rather than an event and sends that flow's owed events in outbox order, so one flow's results can never overtake each other. Adding capacity is adding a replica, because no worker holds state. |
| **Schedulers** | The clock-driven half of the same fleet, and the reason nothing stays stuck silently: the sweeper re-queues expired locks, dead-letters exhausted tasks and escalates overdue flows, while the two recheck clocks re-enter concluded flows on each jurisdiction's cadence and stop the moment a relationship closes. Each holds a lease in the shared cache, so a second replica of a scheduler waits instead of double-firing an escalation or a screen. |
| **Shared cache** | Breaker state, fallback weights and the schedulers' leases, consulted before every vendor call. Coordination, not a read cache: it exists so every replica sees the same open circuit and the same lease holder. |
| **Config store** | The list roster per jurisdiction, each list's blocking-or-advisory criticality, the recheck cadences and the vendor quotas. Separate from the shared cache because it answers a different question and fails differently: a worker that cannot reach it boots from its last cached version and refuses to start without one, since compiled-in defaults would screen against the wrong lists and look successful doing it. |
| **Metrics store** | Per-vendor error rate and latency, written by the pools as they call. One set of numbers serves two masters: the alerts a human reads, and the weights that move traffic to a fallback without one. |
| **Object store** | ID photos, uploaded straight from the onboardee by presigned URL; workers pass the storage key, never bytes, and lifecycle rules implement retention. |
| **IDV · sanction lists · email — and the client's webhook endpoint** | The given externals. Vendors are consumed behind per-vendor pools and re-enter through the inbox; the client endpoint receives at-least-once, HMAC-signed events with a stable `eventId`. |

### Where each requirement lands — one row per functional requirement, in the requirements block's order {#architecture-h-trace}

Every path names only components drawn on the board above.

| Requirement | Where it lands | FR |
| --- | --- | --- |
| Start a flow by API or dashboard with an email | Client → Identification API → Postgres: flow row, invite task and outbox event in one transaction. | start |
| A repeated create for an open pair returns the existing flow | The `one_open_flow` partial unique index in Postgres, not application logic. | no duplicates |
| A single-use invitation that expires after 48 h | Invite task → Worker pools (email) → email vendor; the key is stored only as a hash, with its expiry. | invitation |
| Self-serve re-invitation | An Identification API endpoint invalidates prior keys and issues a fresh one, behind the API gateway's per-flow limit. | re-invite |
| Verification through the given provider | Worker pools (IDV) → vendor; the callback re-enters through the API into the inbox and drives a guarded transition. | verify |
| Sanctions only after verification passes | The state machine gates it: the fan-out tasks are written only by the transition into Awaiting Sanctions Check. | screen after verify |
| The result on a webhook | Outbox row → Webhook dispatcher → client endpoint. | result |
| A repeated delivery is recognisable | The stable `eventId` on the outbox row travels with every redelivery. | recognisable repeat |
| Failure reaches the client | The sweeper escalates through the same outbox path as any result. | failure event |
| Re-screening on a per-jurisdiction cadence | The Schedulers' recheck clock re-enters a Clear flow at the screening step, skipping any flow a newer one has superseded. | re-screen |
| Re-verification when a document expires or is revoked | The second clock re-enters at the invite, because only the person can supply a new document. | re-verify |
| A changed verdict is delivered like the first | The re-entered flow exits through the same outbox → dispatcher → webhook path. | changed verdict |
| Every transition recorded, any history reconstructible | `flow_transition` is append-only in Postgres; the audit view is a projection over it. | history |
| Step-by-step dashboard view | The dashboard reads that same transition history through the API. | dashboard |
| Personal data in its own store | The PII vault behind `person_ref`; photos in the Object store. | PII separation |
| Every access to personal data recorded | Each vault read appends who, when and why to the papertrail. | access log |
| A client can end the relationship, and the recurring obligations stop | An Identification API endpoint closes the `person_relationship` row in one transaction: both due dates are NULLed so the Schedulers' clocks stop finding it, and `retain_until` is stamped from the close. | close |
| Blocking and advisory lists behave differently when unreachable | The Schedulers' sweeper stamps an exhausted leg `unavailable`; the collector reads each list's `criticality` from the configuration store and either holds the flow or concludes it with the gap named in the outbox event. | list criticality |

Concrete technology is named once, here, so the design above stays portable:

| Concern | Choice | Why, at this scale |
| --- | --- | --- |
| System of record, queue, outbox, inbox | **PostgreSQL** | The reliability story is one atomicity, consistency, isolation, durability (ACID) transaction across transition + outbox + inbox; `SKIP LOCKED` makes it a competent queue at single-digit writes/s. A broker would trade that transaction away for throughput nobody asked for. |
| ID photos | Any object store (S3, GCS, Azure Blob) | Cheap immutable blobs, presigned upload keeps bytes off the API, lifecycle rules implement retention. The database keeps only the key. |
| Shared breaker state, fallback weights | A shared cache (Redis or equivalent) | Breaker state and provider weights must outlive any one replica and be read on every claim; a per-process breaker rediscovers each outage N times. |
| Message broker | Not yet — RabbitMQ or a managed queue at the exit | Adopted when task-table churn is measured, not feared — Right-sizing puts the trigger at roughly sustained 100k flows/day. |
| Workflow engine | Not yet — Temporal or a cloud step orchestrator at the exit | Buys durable timers and versioned orchestration when flow variants multiply. Deferred in Right-sizing, at the price of losing the append-only history to the engine's own. |
| IDV, sanctions, email | The given vendors | Consumed behind per-vendor pools; their contracts (callback vs poll, rate limits, downtime) shape worker design — their internals are out of scope. |
| Auth | The given internal auth service (clients); magic-link sessions (onboardees) built here | The given service covers tenant API keys and dashboard single sign-on (SSO); the onboardee has no account, so their session is the possession of a single-use link (dive 12, Q7). |
| Observability | OpenTelemetry + a metrics store (Prometheus or equivalent) | Correlation on flow id; per-vendor error and latency metrics double as the breaker and weight inputs. |

{#architecture-table-1}

**On AWS.** One concrete mapping of that same table, for orientation — every row below is replaceable by the capability it sits next to:

| Board component | AWS service | Why it fits |
| --- | --- | --- |
| API gateway · rate limiter | **Amazon API Gateway** (+ AWS Web Application Firewall (WAF)) | TLS termination, tenant API keys, per-client throttling and usage plans; web application firewall (WAF) in front of the only public surface. |
| Identification API · worker pools · dispatcher | **ECS on Fargate** — one service per pool | Stateless replicas with no hosts to patch; a separate service per vendor pool is the bulkhead, scaled independently. |
| Postgres — state machine, queue, outbox, inbox | **Amazon RDS for PostgreSQL** or Aurora PostgreSQL, Multi-AZ | Single-writer ACID transactions; `SKIP LOCKED` works as-is; a synchronous standby gives the failover the consistency, availability, partition tolerance (CAP) stance assumes. |
| PII vault — the encrypted payload | A **second RDS/Aurora instance** with its own credentials, keys in **AWS KMS** | KMS holds keys, not rows — the sealed `bytea` needs a store of its own, and separate credentials are the point. Envelope encryption with per-person data keys under a customer-managed key; erasure destroys the data key. Vendor secrets live in Secrets Manager, not in code. |
| Object store — ID photos | **Amazon S3** | Presigned PUT for the valet-key upload, SSE-KMS at rest, lifecycle rules as the retention mechanism. |
| Shared cache — breaker + weights | **Amazon ElastiCache** (Redis-compatible) | One breaker record and one weight set shared by every replica; coordination, not a read cache. |
| Schedulers — sweeper + recheck clocks | **Amazon EventBridge Scheduler** | Cron without a host: fires the sweeper and both recheck clocks as Fargate tasks or Lambda invocations. |
| Observability | **Amazon CloudWatch** (+ OpenTelemetry) | Per-vendor metrics and the alarm set from dive 5 — queue depth, stuck flows, dead tasks, delivery failures; logs carry ids only. |
| Private network | **Amazon Virtual Private Cloud (VPC)** — private subnets, security groups, virtual private cloud (VPC) endpoints, network address translation (NAT) | Only the gateway tier is public; stores are reachable through VPC endpoints, vendor calls leave through NAT. The stack is stamped once per region, and Route&nbsp;53 sends each client to the region recorded at onboarding. |
| Email | The given vendor, or **Amazon SES** | Sends stay idempotent because the key is built from the task row, whichever sender is behind it. |
| Deferred exits | **Amazon SQS** · **AWS Step Functions** | The broker at the task-churn trigger and the workflow engine when flow variants multiply — the same triggers Right-sizing named. |

## Deep dives
<!--meta block=deepdives-->

### 1 · The queue lives in the database → NFR: scale

**At ~10 writes/s peak, the queue's entire value is that a task insert shares a transaction with the state change that spawned it — so scale-out is more replicas, not more infrastructure.** Worker replicas compete for tasks with `FOR UPDATE SKIP LOCKED` ([competing consumers](../patterns/messaging/competing-consumers.md) on a Postgres queue — [load-leveling](../patterns/distributed/resilience/load-leveling.md) without a broker): the claim locks a pending row and skips anything already locked, so two workers cannot claim the same task and none ever blocks; adding capacity is adding a replica, because no worker holds state. A broker is rejected today: it breaks that atomicity and adds an operational surface, to solve a throughput problem this system does not have. Screening concurrency comes free from the same mechanism: sanctions legs are ordinary task rows, so parallelism across flows and across lists is just more claims — the ceiling is the per-vendor rate counter in the shared cache, never worker count. And the recurring re-screening load — which grows with the book, not with intake — rides the same queue through `run_after`, scheduled off the live flows' peak.

**Sharing that queue with the recheck batch is the design's own [noisy neighbour](../hazards/noisy-neighbour.md), and an off-peak window alone does not fix it.** At steady state the batch writes about as much as live intake does (Right-sizing), so a window that overruns — a list vendor publishes a delta, stamping `recheck_due_at = now()` across the affected book — puts 40k deferrable tasks in the same table the live claim query scans, and a person waiting on an invite queues behind a compliance sweep. Ordering the claim by class is the obvious reach and the wrong one: a [priority queue](../patterns/messaging/priority-queue.md)'s own counsel is to avoid strict preemption when the low-priority class also has a deadline, and re-screening has one — the jurisdiction's cadence is a legal clock, not a nice-to-have. So the split is by **reserved capacity per class** instead: recheck tasks carry their own `kind` prefix and are claimed by a pool sized separately from the live pools, which is the bulkhead already drawn per vendor applied a second time, per workload. Live flows keep a floor the batch cannot borrow from; the batch keeps a floor that a busy onboarding day cannot starve. The per-vendor rate counter is split the same way, because two pools drawing on one quota ceiling are not two pools: on a delta day the correctly-sized batch would spend the whole contracted rate and live legs would be pushed out on `run_after` — starvation at the quota rather than at the pool, with aggregate alarms green because the batch is draining at full speed. Per-class oldest-pending age is the alarm that sees it.

**Nothing changes until ~2M requests; the first real bottleneck is the task table, not the flow table.** Task rows are updated repeatedly (claims, retries, completions), which at high volume means dead tuples, vacuum pressure and index churn — classic queue-in-DB costs. The exits, in the order they earn their keep: partial indexes on `status = 'pending'` so claims scan only live work; partition or truncate completed tasks aggressively; a read replica for dashboard and reporting reads; then **move the queue to a broker** while keeping the outbox, once churn is measured rather than feared; and only at sustained multi-million volume, **shard by `client_id`** — the natural key, since no query spans tenants — and split worker fleets into services when team ownership demands it. Each step is additive; none is a rewrite, because the outbox boundary was in place from day one. All of it is per-region — residency multiplies stacks, not load — and the sharding exit composes with residency for free, because `client_id` is also the key that pins a client's rows to its region.

**Capacity moves on queue age, never on processor load.** These pools sit blocked on vendor calls, so utilisation stays near zero while the backlog grows — an [autoscaler](../patterns/distributed/routing/autoscaling.md) reading CPU would watch a starving queue and never fire. Each pool therefore scales out when its own oldest pending task passes 60 seconds and back in after ten minutes below five, with a floor of two replicas for redundancy and a ceiling set by the vendor's contracted concurrency rather than by our budget. Scale-in is the dangerous direction and needs no special handling: a stopping replica finishes or abandons its claim, and an abandoned claim is the expired-lock case the sweeper already runs.

**A queue absorbs a burst; it does nothing about sustained overload except hide it, so the accept path is coupled to the drain rate.** Without a ceiling, `POST /flows` keeps saying 202 while the live class's backlog grows past any deadline the flow could still meet — the client is told yes and finds out hours later. So when the live class's oldest pending task passes its age ceiling the create answers `429` with a `Retry-After`, which is [backpressure](../patterns/concurrency/backpressure.md) rather than a rate limit: the limiter bounds one tenant's rate against a contracted share, while this bounds everyone against what the fleet is actually draining. Refusing costs the client a retry it can see; accepting costs them a flow that sits invisible behind work they cannot. The recheck class carries its own ceiling and never trips the live one, because a compliance sweep must not be able to close the front door.

**Every exit lands on a live queue, so each is priced as a migration, not just a feature.** The partial index arrives with `CREATE INDEX CONCURRENTLY` — no lock the claim query would feel; completed tasks are pruned by batched off-peak deletes until partitioning makes the prune a partition drop. And a deploy is the same protocol as a crash, deliberately: a stopping worker finishes or abandons its claimed task, and whatever a killed replica held is the sweeper's expired-lock case — so a rolling restart needs no drain choreography the failure path did not already rehearse.

```sql summary="The claim query"
UPDATE task
SET    status = 'processing', locked_by = $worker,
       locked_at = now(), attempts = attempts + 1
WHERE  id = (
  SELECT id FROM task
  WHERE  status = 'pending' AND kind = ANY($kinds)
    AND  run_after <= now()          -- backoff and queue-and-wait both live here
  ORDER  BY id
  FOR UPDATE SKIP LOCKED             -- competitors skip, never block
  LIMIT 1)
RETURNING *;
```

```mermaid caption="Zoom into the claim path: replicas compete for rows on one table — none blocks, none double-claims, and adding capacity is adding a replica."
flowchart LR
    W1["Worker fleet — replica A"] -->|"claim next pending · FOR UPDATE SKIP LOCKED"| T[("Postgres — task rows")]
    W2["Worker fleet — replica B"] -->|"claim — locked rows skipped"| T
    W3["Worker fleet — replica C"] -->|"claim"| T
```

### 2 · Obligations attach to history — the machine keeps its shape → NFR: evolvability

**The flow enum holds only the five-state model's business states; every operational fact lives on task rows.** Retry counts, locks, backoff timestamps and processing flags change constantly and mean nothing to a client or an auditor — folding them into the business enum turns a readable contract into a dozen-value tangle where "what happened to this person" and "what is the queue doing" can no longer be told apart. The seam pays three ways: the client-visible vocabulary never changes when retry mechanics do; the transition history stays a clean, append-only account of business fact; and the audit requirement is met by projection — a view over `flow_transition` — rather than by a second write path that could disagree with the first. One writer of truth (the state machine), any number of readers.

The state model is the contract everything serialises into. Five business states with an explicit terminal branch; **Invalid ID exits before sanctions ever runs** — screening an unverified identity is spend without meaning. **No terminal is permanent**: two jurisdiction-driven clocks re-enter a cleared flow — a sanctions recheck at the screening step, and an expired or revoked document back at the invite, because a new document only a person can supply. Operation state (attempts, locks, backoff) lives on task rows and never appears here.

Both recheck clocks reuse the same machinery, and neither is a special case. A scheduled job re-enters `Clear` flows at Awaiting Sanctions Check when the jurisdiction's screening cadence comes due, appending a `sanctions_recheck` transition. Re-entry collides with the duplicate-invite rule, and the clock has to know it: `one_open_flow` indexes only non-terminal rows, so while a flow sits at `Clear` the client may legitimately start a second flow for the same person — and moving the old one back to an open state would then violate the index, roll the transition back, and retry until the task dead-letters. A compliance obligation would fail silently for exactly the people who were onboarded twice. So the clock skips a flow that a newer flow for the same `(client_id, email_mac)` has superseded: the obligation follows the person, and the newest flow's own clock already carries it. A list update does not wait for the calendar: a delta from a list vendor stamps `recheck_due_at = now()` across the affected book, and the same sweep picks those rows up on its next pass — event and cadence funnel into one due-date column. A second clock watches the verified document's own expiry — recorded when verification passed — and, on expiry or a revocation notice, re-enters the flow at Awaiting Submission with a fresh invite, because only the person can supply a new document. From there the flow walks the same path it walked the first time, including sanctions. History stays append-only in both cases: the flow moves again; its past does not change. A new jurisdiction or vendor changes cadences and configuration — the machine's shape survives contact with every additional obligation.

**That delta mechanism needs jitter, or the calendar produces a herd nothing can drain.** Stamping `recheck_due_at = now()` across an affected book makes 40k flows × four lists — 160k legs — due at one instant, which at the contracted vendor rate is days of draining against a compliance clock. Reserved capacity per class (dive 1) stops that starving live flows; it does nothing about the herd itself, because the herd is not a fairness problem. So the stamp is `now()` plus a deterministic offset computed from the flow id, spreading the book across the window the cadence still allows. Computing it from the id rather than randomising it is the part worth keeping: the same flow always lands in the same slot, so a re-run of the delta does not reshuffle the queue, and the spread is reproducible when someone asks why a given flow was screened when it was. The compliance clock is a deadline, not an instant, and the jitter is what lets the design spend it.

**"Configuration, not a code change" only holds if the configuration lives somewhere a deploy is not.** The list roster per jurisdiction, each list's `criticality`, the recheck cadences, the vendor quotas and the fallback weights are exactly what the evolvability requirement says a new jurisdiction or vendor may change on its own. Held in the deployed artifact they are not configuration at all — they are source, and adding a jurisdiction becomes a release across every regional stack. So they sit in an [external configuration store](../patterns/distributed/coordination/external-configuration-store.md): versioned, audited and rollback-able like code, but rolled forward without one, and refetched by workers on a short interval rather than read once at boot — a central store nobody refetches from is a slower file with more failure modes. Secrets stay out of it, the way `webhook_secret_ref` already does: the store holds the reference and the secret manager holds the secret.

**The cold-start dependency gets a stated answer, because otherwise the first regional outage decides it.** A worker that cannot reach the config store at boot must not fall back on compiled-in defaults: a default list roster screens against the wrong set of lists and concludes flows that look successful and are not, which is the one failure mode this design refuses to make quiet. So it boots from the last configuration it durably cached, refuses to start at all if it has none, and reports the version it is running so a stale roster is visible rather than assumed. A stale configuration is recoverable and legible; an invented one is neither.

**The machine's shape also survives its own deploys.** A new task kind or flow state ships reader-first: workers that understand it deploy before the writer that emits it, and the claim's `kind = ANY($kinds)` is the guard — a pool claims only what it knows, so a mixed-version fleet never picks up work it cannot run. The enum extends before any transition writes the new value, and the old code's guarded transitions keep updating zero rows on states they never learned — the same braces that stop the zombie stop the stale deploy.

```mermaid caption="The flow's lifecycle — where can it end, and how does it come back? Four terminals, none permanent: a sanctions recheck re-enters at screening, an expired document at the invite. Both append to history rather than rewriting it."
stateDiagram-v2
    [*] --> Initiated
    Initiated --> AwaitingSubmission: invite emailed
    AwaitingSubmission --> AwaitingIDV: magic link used, documents in
    AwaitingIDV --> AwaitingSanctions: ID verified
    AwaitingIDV --> InvalidID: verification failed
    AwaitingSanctions --> Clear: every list answered, no hit
    AwaitingSanctions --> Sanctioned: any list reports a hit
    AwaitingSanctions --> CaveatedClear: an advisory list is unavailable
    Clear --> AwaitingSanctions: sanctions recheck due
    Clear --> AwaitingSubmission: ID expired or revoked, re-invite
    CaveatedClear --> AwaitingSanctions: missing list returns
    Clear --> [*]
    CaveatedClear --> [*]
    Sanctioned --> [*]
    InvalidID --> [*]
    AwaitingSubmission: Awaiting Submission
    AwaitingIDV: Awaiting ID Verification
    AwaitingSanctions: Awaiting Sanctions Check
    InvalidID: Invalid ID
    CaveatedClear: Cleared with Caveat
```

### 3 · One transaction, every consequence → NFR: consistency

**Every transition commits with its consequences, or not at all.** The write side: "record the state change" and "tell the client" are two systems with no transaction spanning them — write-then-crash-before-publish means the database says `clear` while the client hears nothing, forever. The [outbox](../patterns/distributed/coordination/outbox.md) closes the gap by turning "publish" into a second local write: transition, outbox event, and follow-up tasks in one Postgres transaction. The dispatcher then retries delivery against a durable row; `published_at IS NULL` is always the honest list of what is still owed.

**Order is a separate guarantee from dedup, and conflating them is how a client ends up acting on the wrong verdict.** A re-screen flips a flow from `clear` to `sanctioned`; that delivery takes a 502 and enters backoff; a later re-verification event delivers first, and the client's last-write-wins handler now believes a person is cleared who is not. Both events carry distinct `eventId`s, so the dedup key absorbs neither — arrival order decides, and a shared queue of events drained by N dispatchers has no opinion about it. So the dispatcher claims a **flow**, not an event: `delivery_cursor` holds one row per flow, the claim takes that row, and the worker sends the lowest unpublished outbox `seq` above `delivered_seq`, advancing only on a 2xx. That is a [sequential convoy](../patterns/messaging/sequential-convoy.md) — the queue stays parallel across flows while each flow is a single-file lane, so one client's stuck endpoint holds up its own results and nothing else. The client also receives `seq` in the payload, so it can discard anything older than what it has already applied even if the network reorders beneath us. The cost is real and priced: a flow in backoff blocks its own later events, which is exactly the outcome you want when the later event is a correction to the one that has not landed.

**The receive side is the trap most designs miss.** Vendors deliver callbacks at-least-once, and a duplicate can arrive before this system has written anything — before any outbox row, before any event of ours exists. A dedup key we generate at publish time cannot catch that: there is nothing for the duplicate to collide with yet. The [inbox](../patterns/distributed/coordination/inbox.md) fixes the keying: the dedup key is the sender's — `(flow_id, step, provider_request_id)` — and the inbox insert shares a transaction with the callback's effect. Now whichever copy commits first wins, the second hits the unique constraint and rolls back its whole transaction, and arrival order stops mattering entirely.

**Every vendor's model is translated at the edge, before anything downstream sees it.** Seven foreign models reach this system — two ID-verification providers, four list vendors and the email sender — each with its own word for a match, its own confidence scale and its own name for a check that failed. Let them reach the state machine unnormalised and the adjudication rule is written in seven dialects at once, where one vendor's contract change edits our business logic. So every provider gets an [anti-corruption layer](../patterns/ddd/acl.md): one translator per vendor that parses the payload, maps it onto our own three-valued outcome, and hands the state machine a shape it already knows. Onboarding a provider is then writing a translator, not touching the flow. What keeps the layer useful is knowing what it is not — a translator, never an adjudicator. What a hit means to a flow is the state machine's decision, and the moment that drifts into the layer, the one place both models are visible starts quietly owning behaviour that belongs to the domain.

**The translator is also where provenance is stamped, and that is what makes the reconstructable-history requirement answerable.** An auditor asks how a given person was verified; "verified" on its own does not answer it. The flow may have been sent to the weighted fallback provider mid-incident, judged against a policy version that has since changed — and neither fact is recoverable later if nothing wrote it down. So the ACL stamps `provider` and `policy_version` onto the transition it produces, and the append-only history carries them for as long as the record outlives the person. Without that stamp a traffic shift is invisible in the evidence, and the history stops being able to support the question it exists to answer.

**Parsing happens before the transaction opens, and that ordering is load-bearing.** Suppose a vendor ships a contract change the parser rejects. With the parse inside the effect transaction, the rollback takes the inbox row with it — so this system holds no record of ever having seen the callback, the vendor retries it forever, and it cannot even dead-letter, because dead-lettering is a write in the transaction that just aborted. One bad message blocking the consumer behind it is exactly the failure a dead-letter channel exists to stop, and here the poison payload also defeats the channel. With the parse in the ACL and ahead of `BEGIN`, the failure has somewhere to land: one transaction commits the inbox row, a dead-letter row and an escalation together, and then ACKs. The vendor stops retrying, and an operator gets the payload that broke us instead of a retry storm nobody is counting.

**Outbound calls carry our idempotency key for the same reason in reverse.** The invite email and the webhook both go to systems that might see our retry as a new request. Each send carries a key built from the task (email) or the event (`eventId`), so the email vendor can collapse a re-sent invite and the client can collapse a re-delivered result. The rule that makes it work is the easy one to miss: the key is built from the durable row's id, never generated at send time — a retry re-reads the row and presents the same key, while a freshly generated one differs on every attempt and therefore collapses nothing (dive 12, Q8). At-least-once internally, at-most-once effect at every boundary.

**The transition itself is the second guard.** Every state change carries `WHERE state = expected AND version = seen`, so even a zombie worker — one whose lock the sweeper already expired and re-queued — writes zero rows instead of a double-apply. The worst case left is a repeated vendor call, which the outbound idempotency key above already collapses.

```sql summary="One transaction, five facts — the whole core in SQL"
-- The IDV callback arrives: verify_id passed for flow F.

-- 0 · OUTSIDE the transaction: the provider's ACL parses and normalises.
--     A parse failure here has somewhere to land — inbox row, dead-letter
--     row and escalation commit together, and the callback is ACKed, so a
--     poison payload is not retried forever by a vendor we never recorded.
--     Inside BEGIN, that rollback would take the inbox row with it.
--     → ($outcome, $provider, $policy_version) in OUR vocabulary.

BEGIN;

-- 1 · dedup at the boundary, keyed on the VENDOR's request id.
--     A duplicate — even one racing ahead of everything below — violates
--     the unique constraint, aborts this txn, and is ACKed with no effect.
INSERT INTO inbox (flow_id, step, provider_request_id)
VALUES ($flow, 'verify_id', $provider_request_id);

-- 2 · the business transition, guarded twice: expected state + version.
UPDATE flow
SET    state = 'awaiting_sanctions_check', version = version + 1
WHERE  id = $flow
  AND  state = 'awaiting_id_verification'   -- legal-transition guard
  AND  version = $seen_version;             -- optimistic check against zombies
-- 0 rows updated → someone got here first → ROLLBACK, ack, done.

-- 3 · append-only history, carrying WHO answered and to WHAT standard
INSERT INTO flow_transition (flow_id, seq, from_state, to_state, cause,
                             provider, policy_version)
VALUES ($flow, $next_seq, 'awaiting_id_verification',
        'awaiting_sanctions_check', 'idv_passed',
        $provider, $policy_version);

-- 4 · consequences: an event the client will hear, and the fan-out tasks
INSERT INTO outbox (flow_id, event_id, payload)
VALUES ($flow, $event_id, $payload);

INSERT INTO task (flow_id, kind)
SELECT $flow, 'check_list:' || l FROM unnest($sanction_lists) AS l;

COMMIT;   -- all five facts, or none of them
```

**The only fan-out in the flow concludes exactly once — and its legs genuinely run in parallel.** Sanctions is gated on a verified identity: screening unverified data is vendor spend that produces noise, so running it concurrently with ID verification is deliberately rejected, not overlooked (dive 12, Q3). The concurrency lives inside the step instead. The concluding transaction inserts one `check_list` task per list ([Scatter-Gather](../patterns/messaging/scatter-gather.md)); sanctions-pool replicas claim the legs independently via `SKIP LOCKED`, so the lists screen concurrently — bounded by the per-vendor rate limit, not by list count — and each leg owns its deadline, retry budget and result row, so a slow list never delays a fast one. The join is the one place the guarded transition is not enough on its own, and it is worth being exact about why. Each completing leg records its outcome, counts terminal outcomes against the list count, and transitions when the count is full. Under Postgres's default `READ COMMITTED`, two legs finishing at the same instant each see their own uncommitted insert and not the other's, so both count one short and **neither** transitions — the flow hangs with every leg reported. The guarded update cannot save this: it stops two conclusions, not zero. The version check is the wrong instrument, because the bug is a phantom read rather than a lost update. So the completing transaction takes `SELECT … FROM flow WHERE id = $flow FOR UPDATE` before it counts: the second leg blocks, then re-reads and sees the first's committed result, counts full, and concludes. **And it counts within its round.** Each fan-out issues a fresh `round` that its legs carry, because a re-screen otherwise reuses the first screen's rows: the first leg back would count every list as reported — the others still holding last quarter's verdict — conclude the flow early on stale answers, and then swallow a real hit arriving late, whose guarded transition finds the flow already terminal. That is the one failure this design must never have, so the round is in the primary key rather than in a comment. The verdict is — `Sanctioned` on any hit, `Clear` only when every list answered and none of them hit. One row lock, held for the length of a count, on a step that runs once per flow. "Hit" is the vendor's adjudicated verdict, per the Q2 assumption — a raw "possible match" surface would need a review state this model deliberately lacks. A re-screen fans out the same way, keyed to its `sanctions_recheck` transition, so an in-flight recheck's legs can never be mistaken for a first screen's.

**A leg that can never answer must still be able to end — "all legs in" is policy, not a consistency requirement.** A two-valued verdict gives an unanswered leg no terminal at all, so a vendor's permanent business failure — a list withdrawn, a contract lapsed — arrives as our permanent outage, with no escape that is not a deploy. So the leg outcome is three-valued — `hit`, `clear`, `unavailable` — and "all legs in" means every leg holds a terminal outcome rather than a non-NULL verdict. The sweeper stamps `unavailable` when a leg's task exhausts its retries, which is what turns a dead leg from a hang into a decision (con 5). What that decision is stays configuration rather than code: each list carries a `criticality` of `blocking` or `advisory` per jurisdiction. **Blocking and unavailable holds the flow and escalates** — on the list a regulator actually asks about, late beats wrong. **Advisory and unavailable concludes `cleared_with_caveat`**, records which list was missed, and schedules a re-screen for the moment it returns. Reading an unanswered sanctions check as clean is the one reading scatter-gather rules out by name, so the gap rides on the verdict where the client has to read it — a contract change for them, and the honest one.

**Answering without a list does not abandon the consistency and partition tolerance (CP) stance, and the distinction is worth being exact about.** A partition to one vendor is a **missing input**, not a conflicting write: there is no second writer of this flow's state, so answering availability-style risks none of the divergence the C choice exists to prevent. No correctness property of the single-writer state needs four outcomes — a compliance obligation does, and `criticality` is where that obligation is written down rather than assumed. The state machine stays as guarded as it was; what became configurable is which inputs a conclusion requires, and the caveated verdict names the ones it did without.

**A leg that reports after the flow concluded is the one report this system must never drop.** Leg C times out and dead-letters, the flow concludes without it, and three hours later C's callback arrives carrying a `hit`. The inbox insert succeeds — this `provider_request_id` was never seen — and the guarded transition then finds `state ≠ awaiting_sanctions_check`, updates zero rows, and the callback is ACKed with no effect. The guard that correctly prevents a double-apply is exactly what makes this a silent drop. So the leg's outcome is written **unconditionally**, in its own statement, decoupled from the transition — recording what a vendor said is never contingent on the flow still wanting to hear it. Materiality then routes through machinery the design already has: a late `hit` stamps `recheck_due_at = now()`, the re-screening sweep re-enters the flow at Awaiting Sanctions Check on its next pass, and the corrected verdict leaves through the same webhook as the first one. The requirements already promise that a corrected verdict is delivered the way the first one was, and the vendor boundary must not enforce a narrower rule than the product promise. A straggler arriving after the aggregate has closed needs a defined destination; the alternative is a silent drop nobody counts.

```mermaid caption="How do several lists become one answer? Fan out a task per list; the collector transitions the flow exactly once, when every leg holds a terminal outcome. A leg that reports late is still recorded, and re-enters the flow as a re-screen."
flowchart LR
    F["Flow at Awaiting Sanctions Check"] ==>|"one task per list"| LA["Leg — list A"]
    F ==>|"one task per list"| LB["Leg — list B"]
    F ==>|"one task per list"| LC["Leg — list C"]
    LA -->|"outcome: hit / clear / unavailable"| COL["Collector"]
    LB -->|"outcome"| COL
    LC -->|"outcome"| COL
    COL -->|"every leg terminal → ONE guarded transition"| T["Clear / Cleared with Caveat / Sanctioned"]
    LC -.->|"late outcome, recorded unconditionally"| R["Re-screen: recheck_due_at = now()"]
    R -.->|"corrected verdict, same webhook"| COL
```

**CAP, applied rather than recited — choose C: refuse writes rather than risk divergence.** The partition case is concrete here, and it has a name: accepting a create on some secondary while the primary is unreachable or failing over is [split-brain](../hazards/split-brain.md) — two nodes both believing they are the survivor, so two "open flows" exist for one (client, email), or a transition commits without its outbox row's guarantee. The partial unique index cannot save you from it, because each half enforces uniqueness only against the rows it can see. So the single-writer Postgres refuses, the API returns errors for creates, and in-flight work stalls in the queue — recovering exactly as it does from vendor downtime, by draining. PACELC: PC/EC — pay latency in every branch, never inconsistency. The asymmetry is the design insight: internal truth is CP; the client-facing view is the one EC surface, because an at-least-once webhook that lags by minutes was accepted up front. One system, two consistency contracts, each stated.

### 4 · Surviving the vendors — and every other stall → NFR: availability & resilience

**Vendor failure degrades latency, never correctness.** The ID vendor's ~6 hours a week of downtime is absorbed by the queue: the [circuit breaker](../patterns/distributed/resilience/circuit-breaker.md) opens, tasks get a pushed-out `run_after` ([retry with backoff](../patterns/distributed/resilience/retry-backoff.md) recorded on the task row — which is also how the flow queues-and-waits through the outage), and the flow simply waits — consistent with a system that already promised asynchrony and chose consistency over speed. One [worker pool](../patterns/concurrency/thread-pool.md) per vendor (a [bulkhead](../patterns/distributed/resilience/bulkhead.md)) means a stalled sanctions vendor cannot starve ID verification, and every task carries its own [deadline](../patterns/distributed/resilience/timeout-deadline.md) because no vendor publishes one. Three mechanisms make the rest graceful rather than accidental:

- **Shared breaker state.** The breaker for each vendor lives in the shared cache, not in each worker process. Per-replica breakers each need their own failure streak before opening — N replicas take N× the damage and then send N half-open probes. One shared record per vendor: every worker consults it before claiming, one probe decides recovery. **And that buys a dependency, so its own failure gets an answer rather than a default.** The cache sits on the path of every vendor call; leaving the behaviour to the client library's timeout picks one of two bad outcomes by accident. Failing open is the worse one: on a delta day 160k recheck legs would call vendors with no rate ceiling and no breaker — precisely the storm both mechanisms exist to prevent, aimed at a contractual quota. So the workers **fail closed onto a local fallback**: each replica keeps a conservative in-process breaker and a local token bucket sized at its fair share of the vendor quota, and uses them while the cache is unreachable. The fleet degrades to the per-process behaviour the shared record was an optimisation over — slower to open, N probes on recovery — instead of losing the ceiling entirely, and a cache outage costs latency rather than a quota breach. **The fair share is a static 1/N, and that is a priced cost rather than a detail.** Idle replicas still hold their slice, so the fleet's achieved rate sags below the contracted one exactly during a drain — the moment the ceiling is what you most want to be spending. Per-instance counters always trade this way, and the standard exit is a shared counter, which is the dependency that just failed. So the exit is not a different fallback but a better-provisioned one: replicas **lease blocks of quota** from the shared counter while it is healthy and spend the unexpired lease while it is not, degrading to something near the contracted rate instead of a fraction of it. It is deferred, not adopted — 1/N is honest at four replicas, and the lease earns its complexity when the fleet is large enough for the sag to show. **And a cache that comes back empty is not a cache that says everything is healthy.** After a restart or a failover the breaker records are gone, so reading absence as closed sends the whole fleet at a vendor that may still be down — the stampede both mechanisms exist to prevent, arriving at the worst possible moment. So a missing record seeds the breaker **open**, and the vendor is re-admitted by the same single half-open probe that ends any other outage. The cost is one probe interval of delay after every cache restart, paid against a vendor that was probably fine; the alternative is paying the outage twice.
- **Fallback providers with governed weights.** Where a second provider exists, workers split traffic by weights held in the same cache. The weights are driven by recorded health metrics — the per-provider error rate and latency already collected for alerting — decaying back toward the default as health recovers, with a manual override that outranks the automation during incidents or contract changes. A weighted split with no update mechanism is a hardcoded constant nobody dares touch.
- **Email is a vendor too.** Sends carry an idempotency key (dive 3); bounces come back as inbox events and mark the invitation dead, which the sweeper escalates like any other stuck flow — an invite that never arrived must not look identical to an onboardee who never clicked.

**Retry is bounded work, and the bound is two columns rather than a convention.** `attempts` counts, `max_attempts` stops, `last_error` is what an operator opens the dead row to read. Without the budget a malformed vendor response burns a worker slot for ever; without the recorded error the dead task is a number with no diagnosis, and the runbook's first step is guesswork. **The schedule itself carries jitter, and that is not decoration.** A six-hour vendor outage fails every waiting task in roughly the same instant, so a pure exponential backoff computes the same delay for all of them and returns them all in the same instant — the recovering vendor is met by the entire backlog at once and fails again, which reads as a flapping vendor and is actually a synchronised herd. The delay is therefore randomised within its window, the same spreading the recheck delta already does deterministically (dive 2), and for the same reason: a compliance clock and a vendor's rate ceiling are both deadlines with room in them, and jitter is what spends that room.

**The quota ceiling is priced per second and also per month, and backoff can only clear one of them.** The token bucket paces requests per second, so a burst becomes a wait and the wait ends — the mechanism assumes the call would succeed if attempted later today. A contracted monthly cap breaks that assumption. Legs three and four of a fan-out reach the cap on the 28th and cannot succeed at any rate until the reset, so retrying them on a growing backoff spends the rest of the month rediscovering the same answer. So quota exhaustion is its own class, **non-retryable-today** rather than transient: `run_after` is deferred to the reset date, and the escalation fires **once at class level** rather than once per leg. That second half matters as much as the first — on a delta day the per-leg alternative raises 40k separate alarms and buries the one an operator actually needs, which is that this jurisdiction stops screening until the first of the month.

**A vendor that takes the work and never calls back is invisible to every mechanism above.** The send task completed — the vendor answered 200 and accepted the job — so from the queue's point of view nothing is stuck: no expired lock, no exhausted retries, no pending row anyone can point at. Only the flow-level SLA (service-level agreement) notices, hours later, which leaves the quietest vendor failure as the slowest one to detect. So the send writes its own deadline as it goes: an `await_callback:<vendor>` task, inserted in the same transaction as the send, with `run_after` set to the answer time the vendor's contract promises. The callback's transaction completes that task on arrival, so a vendor behaving normally leaves no trace of it. A vendor that goes quiet leaves the task to come due, and the worker that claims it finds the leg with no terminal outcome and treats it as the vendor failure it is — retry, or escalate on the same path an exhausted task takes. Silence becomes a task expiry measured in minutes instead of a flow SLA breach measured in hours, and it costs one row per outbound call.

**Those deadlines are per vendor, and the flow's own SLA is worked out from them rather than picked.** One jurisdiction's roster can hold a list that answers synchronously in 200 ms beside one that returns a batch file the next day, so a single flow-level deadline is either far too tight for the batch list or useless for the synchronous one. Each leg's deadline therefore comes from its own vendor's contract, and Awaiting Sanctions Check counts as overdue only when its **slowest configured list** is — a figure read off the roster in the configuration store rather than compiled into the sweeper. A jurisdiction screening against four synchronous lists then escalates in minutes, and one carrying a 24-hour batch list pages nobody at hour two.

**Every flow state has an SLA, and the sweeper is what enforces it.** One scheduled job sweeps for three conditions: expired locks (a worker died mid-task — reset to pending for a competitor to claim), exhausted tasks (attempts over budget — mark `dead`, a [dead-letter channel](../patterns/messaging/dead-letter-channel.md) as a table, and for a sanctions leg stamp its outcome `unavailable` so the collector gets a decision instead of a hang), and overdue flows (sitting in one state past its SLA — escalate). Escalation is deliberately three-directional: an alert for the operator, a dashboard surface for support, and **a failure event through the same outbox path for the client** — silence toward the paying client is the one failure mode this design refuses. Escalation is also a **transition**, not just a notification: the overdue flow moves to `expired`. Leaving it open would be a slow leak with three heads — the sweeper re-selects it and re-sends the same alert on every pass, the row stays inside `one_open_flow` so the client is handed the dead flow by the repeated-create requirement for ever, and the parked-flow count stops being the steady state Right-sizing assumes and becomes a floor that climbs with every abandonment. One extra terminal closes all three. A dead task is parked, inspectable, and re-runnable after the cause is fixed; it is never silently dropped.

**The sweeper and both recheck clocks are singletons, and nothing about running them on a replica set makes them so.** Two copies of the sweeper find the same overdue flow in the same pass and both escalate it: the client gets two failure events for one breach, the operator gets two pages, and an expired lock is re-queued twice. Two copies of a recheck clock buy the vendor call twice. So each scheduler takes a [lease](../patterns/distributed/coordination/leader-election.md) in the shared cache before it sweeps — a keyed record with a short expiry, renewed on an interval while the holder works, taken over by whoever notices it lapse. A replica that cannot renew stops sweeping before its lease can expire under it, so the takeover window is a gap in coverage rather than an overlap in firing. The residual is honest and bounded: a scheduler dying mid-pass costs one lease interval of delay, which the deadlines above have room for, and every sweep action is idempotent anyway — this makes double-firing impossible rather than merely harmless.

**Those escalation clocks are numbers, not adjectives, and they are set below the objectives they protect.** Four indicators are measured, each a column or a count rather than a computed score: a flow's age in its current state, a task's age since it became claimable, delivery attempts outstanding per flow, and per-vendor error rate. The internal objectives, assumed rather than given by the brief: 99% of flows leave Awaiting ID Verification within 4 hours of the vendor accepting them, 99% of screening rounds close within 12 hours of fan-out, 99.9% of client-visible events delivered within 5 minutes of the transition that wrote them. What the client is promised is deliberately looser — an operator paged within 15 minutes of a flow passing its state deadline, a failure event within 5 minutes of that flow being declared stuck — and the gap between the two is the error budget: spend it on deploys, vendor outages and the occasional bad batch, and when it is gone the correct response is to stop shipping rather than to restate the number. The sweeper running every 60 seconds against due-date predicates is what makes the 15-minute page achievable rather than aspirational. Note what is deliberately absent: nothing is promised about how fast a verdict arrives, because the two slowest participants are a third party and a human being.

**The database gets the same treatment as the vendors: its failure is planned, not hoped away.** Doing nothing leaves every stall of the single writer as pure downtime — survivable, since a stall loses no work, but gratuitous. An asynchronous replica looks cheaper and is rejected for one precise reason: it can acknowledge a commit the standby never received, and the fact lost would be exactly the outbox row this design exists to never lose. The choice is a synchronous in-region standby ([replication](../patterns/distributed/coordination/replication.md), single-leader and synchronous): the standby holds every acknowledged fact, failover is a promotion rather than a restore, and the queue-in-DB property makes the switch lossless — work drains on return exactly as after vendor downtime. The residual cost is honest: every commit pays the standby's round-trip and the database bill doubles — trivial at ~10 writes/s — while the read replica stays a separate, deferred concern (Right-sizing).

**Beyond failover: losing both nodes is a restore, and the restore has numbers, not hopes.** Continuous archiving gives point-in-time recovery; primary and standby gone together — a region-scale event (con 4) — means restoring to the last archived segment, with the RPO (recovery point objective) stated in the runbook and the RTO (recovery time objective) measured by a rehearsed drill, not discovered in the incident. What the restore rolled away, the edges catch rather than corrupt: a vendor callback for a flowId the restore forgot finds no row to join, is acknowledged and parked for the operator; a replay answers `404`; and a client's re-submitted create walks in clean, because `one_open_flow` restored with everything else. The window is small — at ~10 writes/s, minutes of archive lag is a handful of flows, each re-runnable — but it is a window, and the design names it instead of letting the failover story imply zero.

```mermaid caption="Zoom into the Worker fleet: one pool per vendor so a stalled vendor starves nobody, one shared breaker record per vendor, and a sweeper that turns every stuck thing into a retry, a dead-letter row or an escalation."
flowchart TB
    subgraph WK["Worker fleet"]
        IDVP["IDV pool · bulkhead"]
        SANP["Sanctions pool · bulkhead"]
        EMLP["Email pool · bulkhead"]
        SW["Sweeper"]
    end
    IDVP -->|"call if circuit closed"| V["IDV · Sanction lists · Email"]:::ext
    SANP -->|"call"| V
    EMLP -->|"send invite"| V
    IDVP -.->|"read breaker + weights"| CACHE[("Shared cache · circuit-breaker")]
    SW -->|"re-queue expired locks · dead-letter exhausted · escalate overdue"| PG[("Postgres")]
    classDef ext stroke-dasharray:4 4;
```

### 5 · One id, few signals, honest alerts → NFR: observability

**At this scale, observability is one correlation id, a handful of alerts, and SQL.** The flow id threads every transition, task, vendor call and delivery attempt, so "why is flow X stuck" is one query over tables that already exist — no distributed-trace archaeology at ~75 flows a day. The alerts watch leading indicators, chosen so a vendor's bad day is never misread as this system's outage: flows overdue per state (the SLA breach, and the sweeper's own health), task queue depth and oldest-pending age, dead tasks (anything > 0 is a page), per-vendor error rate and latency (tracked separately per vendor — and doubling as the breaker and fallback-weight inputs), and webhook delivery failure rate (our SLO (service-level objective), not the vendors'). Logs carry ids only ([secure logger](../patterns/security/secure-logger.md)); the vault is the single place raw PII exists, so the log pipeline never becomes an unencrypted second copy of it.

```mermaid caption="The observability loop: every alert is a leading indicator someone can act on, and the same per-vendor series double as the breaker and weight inputs."
flowchart LR
    PG[("Postgres — every row carries the flow id")] -->|"one query: why is flow X stuck"| OP["Operator — alert + runbook"]
    WK["Worker fleet"] -->|"per-vendor error rate, latency"| M[("Metrics store")]
    M -->|"stuck flows · queue depth · dead tasks · delivery failures"| OP
    M -->|"drive breaker state + fallback weights"| CACHE[("Shared cache")]
```

### 6 · Evidence, erasure, retention → NFR: compliance

**Erasure is key destruction, evidence outlives the person, and retention runs on the relationship's clock — each a mechanism, not a policy memo.** Business tables carry `person_ref`; the vault holds the encrypted payload, one envelope key per person. Those are two stores and two writes with no transaction spanning them — a [dual write](../hazards/dual-write-inconsistency.md), the same shape the outbox and inbox exist to tame at the vendor boundary, and it needs the same explicitness. The rule is the one the document row already follows: **vault first, reference second.** The encrypted payload is written and its id returned before any business row names it, so the only crash residue is an unreferenced vault blob — invisible to the flow, swept on the retention clock — never a `person_ref` pointing at nothing, which would be a flow whose personal data cannot be read and whose erasure cannot be proved. Ordering converts a correctness failure into garbage collection. Erasure (`DELETE /persons/{id}`) destroys the key and purges the photo — **crypto-shredding**: every copy, including backups, becomes unreadable at once. What survives is deliberate: the flow's decision and its transition history, because "a lawful check ran and concluded" is a compliance record that outlives the personal data it was computed from.

**The one identifier that stays outside the vault has to be keyed, or the erasure is a claim rather than a fact.** The flow row carries a digest of the email so the duplicate-invite index can work without reading the vault — and a plain hash of an email address does not protect anybody. An email is low-entropy and enumerable: anyone with a database dump and a list of addresses recovers which named individuals were screened, by which client, to what verdict, long after their vault blob became noise. So the column is `email_mac`, an HMAC under a per-region key the key manager holds, and erasure destroys that key alongside the person's envelope key. The index keeps working for everyone still live; the erased person's row stops being a lookup anybody can perform. The cost is that the key is now load-bearing for the uniqueness rule — rotating it means recomputing every live flow's MAC, which is a maintenance job the design owns rather than a surprise.

ID photos go straight to [object storage](../patterns/distributed/routing/object-storage.md) by [presigned upload](../patterns/distributed/routing/valet-key.md) — a short-lived valet key issued at submit, so bytes never transit the API; workers pass the storage key, never bytes ([claim check](../patterns/messaging/claim-check.md)). Documents are stored as evidence, not proxied — and retention is a per-jurisdiction obligation, and the obvious mechanism is the wrong one. An object-store lifecycle rule expires by object age, while the requirement counts from the **end of the relationship** — an event that happens years later in another system and that the bucket cannot see. So photos are retired the way `magic_link_key` rows are: a scheduled retention sweep on the jurisdiction's clock, reading `person_relationship.retain_until` — a due date the close endpoint stamps from `closed_at`, which is the event the bucket cannot see and the client can. The lifecycle rule stays as a backstop for genuinely orphaned objects, not as the policy. That endpoint is what makes the whole clock real: without a way for a client to say the relationship ended, retention has no start date and the recurring screening has no end, so the system keeps buying quarterly checks on people it no longer has a lawful basis to process. Closing NULLs both due dates in the same transaction, which is the entire termination rule.

Erasure is gated, not unconditional. `DELETE /persons/{id}` destroys a key that also reaches backups, so an onboardee's erasure request arriving while their merchant is still under statutory record-keeping would destroy evidence the client is legally required to hold. The request is therefore checked against active holds first: no hold, erase now; hold present, record the request, refuse the destruction, and honour it when the hold lifts. This is the tension the problem block named — the design has to pick a side in the mechanism, not only in the prose.

**The access papertrail.** Every vault read appends who, what, when to the audit table. The flow history answers "what happened to this person"; the papertrail answers "who looked" — auditors ask both.

```mermaid caption="Where personal data can live — and how it dies: business rows hold only person_ref, every vault read is recorded, and erasure is key destruction that reaches backups too."
flowchart TB
    subgraph PG["Postgres — flow, transition, task, outbox, inbox"]
        OPS[("Operational rows — person_ref only")]
        VLT[("PII vault — per-person envelope keys")]
        AUD[("Access papertrail")]
    end
    API["Identification API"] -->|"business writes"| OPS
    API -->|"PII read / write · erase = destroy key"| VLT
    VLT -->|"every read appended"| AUD
    U["Onboardee"] -->|"presigned PUT — ID photo"| BL[("Object store · claim-check")]
```

### 7 · The database enforces tenancy; the network limits reach → NFR: security & tenancy

**Isolation is enforced where queries run, not where developers remember.** Application-level RBAC (role-based access control) filters are one forgotten `WHERE client_id =` away from a cross-tenant leak; row-level security makes the database refuse the un-scoped read no matter which code path issued it. Three details decide whether that policy actually holds, and each is a way it silently does not. `ENABLE ROW LEVEL SECURITY` alone is bypassed by the table's owner, so the application connects as a **non-owner** role and every client-scoped table also carries `FORCE ROW LEVEL SECURITY` — without the second line the policy is enforced against everyone except the role that runs the migrations, which is often the role the application inherited. The tenant is set with `SET LOCAL` rather than `SET`, so the setting dies with the transaction instead of riding a pooled connection into the next tenant's checkout — the leak that plain `SET` buys is invisible in every test that uses one connection per test. And the worker fleet claims tasks across all tenants, so it cannot run under the policy at all: it runs as a separate, separately audited principal with its own credentials and no dashboard path, which is an exemption named here rather than discovered during an incident. Two more layers complete the posture:

- **No flat network.** Only the API tier is publicly reachable; workers, Postgres, the cache and the object store live in a private segment. An attacker who reaches the public tier has reached a service that holds tokens and references, not data.
- **Authenticated edges.** Webhooks are HMAC-signed and carry a stable `eventId`; the onboardee's magic link is single-use, expiring, stored only as a hash, and scoped to one flow's submission surface — never to anything client-scoped (dive 12, Q7). Redemption is a conditional `UPDATE` read by rowcount rather than a read-then-write, so two concurrent redemptions cannot both win and zero rows updated tells expired from forged from already-spent. The link is spent when the **document** lands, not when the form posts: a person whose upload fails has consumed nothing, where spending it earlier turns a flaky mobile connection into a support case. Secrets rotate without breaking verification: the signature header names its key id, so a rotation dual-signs during the overlap and deliveries or replays in flight verify against either secret until the old one retires.
- **Egress is guarded like ingress.** A `webhookUrl` is client input pointed at our dispatcher: it is accepted over HTTPS only, resolved and refused against private, link-local and metadata ranges — at registration and again at delivery, so a DNS flip buys nothing — and delivered from a dedicated egress with no route back into the private segment. Ownership is proven before the first verdict: a challenge delivered to the URL at registration must round-trip, so a tenant cannot point KYC (know your customer) verdicts about a named person at a server they do not control.

```mermaid caption="What can be reached from where: the API is the only public surface, RLS refuses the un-scoped query no matter which code path issued it, and everything stateful sits off the public internet."
flowchart TB
    C["Client"] -->|"TLS — API key / SSO"| API["Identification API"]
    U["Onboardee"] -->|"single-use magic link"| API
    subgraph PRIV["Private network — no public route"]
        PG[("Postgres — RLS per tenant")]
        CACHE[("Shared cache")]
        WK["Worker fleet"]
    end
    API ==>|"RLS session per tenant"| PG
    WK -->|"claim · sweep"| PG
    WK -->|"outbound only — HMAC-signed"| CB["Client endpoint"]:::ext
    classDef ext stroke-dasharray:4 4;
```

**Regions are islands — a [deployment stamp](../patterns/distributed/routing/deployment-stamp.md) per region, not a tenant column.** Residency is not a filter on one big database — it is one full stack per region: gateway, API, workers, Postgres and its standby, vault, object store, cache. A client is pinned to a region at onboarding; DNS routes them to it, and every identifier below the gateway is region-local. Nothing crosses: no cross-region replication of personal data or documents — that is the requirement itself, not a limitation — and cross-region failover is deliberately out of scope (problem, Q7), so a regional outage is downtime for that region's clients alone. The price is N copies of everything; it is kept in check by stamping every region from the same infrastructure-as-code, so only configuration — jurisdictions, cadences, vendor endpoints — varies (con 4).

```mermaid caption="Where does a client's data live? In its region's stack and nowhere else — the same code stamped per region, and no replication or failover across the boundary, by requirement rather than by omission."
flowchart LR
    CEU["EU client + onboardees"] -->|"DNS — region recorded at onboarding"| REU
    CUS["US client + onboardees"] -->|"DNS"| RUS
    subgraph REU["Region EU — full stack"]
        SEU["Gateway · API · workers · Postgres + standby · vault · object store"]
    end
    subgraph RUS["Region US — full stack"]
        SUS["Gateway · API · workers · Postgres + standby · vault · object store"]
    end
    REU -.-|"nothing crosses — no data path"| RUS
```

**Four scenarios, played out in time.** The dives above argue the mechanisms one non-functional requirement at a time; the four below run them together — the happy path, a dead provider, an exhausted quota, and recheck day. Read them for the order in which the guards fire, which no single argument shows.

### 8 · A clean check, end to end

**A successful check is a chain of small transactions: every state switch is one commit, and everything between commits is a row waiting.** The walkthrough below is the happy path of the lifecycle drawn in dive 2, played out in time: the client hears each change through the outbox, the vendor's answer lands through the inbox, and no step holds a connection open while a human or a vendor takes their time. The transaction mechanics are argued in dive 3; here you watch them fire in order.

```mermaid caption="What does one successful check look like in time — and where exactly does each state switch commit?"
sequenceDiagram
    autonumber
    actor O as Onboardee
    participant C as Client · ext
    participant API as Identification API
    participant PG as Postgres
    participant W as Workers
    participant V as Vendors · IDV + lists + email · ext
    participant D as Webhook dispatcher
    C->>API: POST /flows · an email address
    API->>PG: one txn — flow row + invite task + outbox event
    Note over PG: state · initiated
    W->>V: send invite email · key from the task row
    W->>PG: transition on send
    Note over PG: state → awaiting_submission
    V-->>O: invite with single-use magic link
    O->>API: open link, submit ID document + selfie
    API->>PG: one txn — documents stored + transition + verify_id task
    Note over PG: state → awaiting_id_verification
    W->>V: verify_id · idempotency key from the task row
    V-->>API: callback — verification passed
    API->>PG: one txn — inbox row + transition + one check_list task per list
    Note over PG: state → awaiting_sanctions_check
    W->>V: screen each list · one leg per list
    V-->>W: no hit, per list
    W->>PG: last leg in — guarded transition + outbox event, one txn
    Note over PG: state → clear
    D->>PG: poll outbox · published_at IS NULL
    D->>C: HMAC-signed webhook · stable eventId
    C-->>D: 200 — event marked published
```

### 9 · The vendor dies mid-check — fallback to a second provider

**A dead provider costs latency, never a fact.** The failed call is recorded on the task row and retried on its own clock; the flow's business state does not move while the stall lasts. The breaker record and the provider weights live in the shared cache (dive 4), so the decision to call the fallback is made by data every worker reads — not by a code change or a human at 3am.

```mermaid caption="How does a check finish when its provider dies — and who decides to call the fallback?"
sequenceDiagram
    autonumber
    participant W as IDV worker pool
    participant K as Shared cache · breaker + weights
    participant A as Provider A · ext
    participant B as Provider B · ext
    participant PG as Postgres
    W->>PG: claim verify_id task · SKIP LOCKED
    W->>K: read breaker + weights for the step
    W->>A: verify_id · deadline attached
    A--xW: timeout — no answer inside the deadline
    W->>PG: record the attempt, push run_after · backoff on the row
    Note over PG: flow state unchanged — the wait is a row
    W->>K: report failure · the streak opens A's breaker
    Note over K: breaker A open · weights shift toward B
    W->>PG: reclaim the task once run_after passes
    W->>K: read breaker + weights again
    alt breaker for A open — weights favour B
        W->>B: verify_id · same idempotency key
        B-->>W: verified — match
    else A recovered — weights decayed back
        W->>A: verify_id · same idempotency key
        A-->>W: verified — match
    end
    W->>PG: one txn — inbox row + transition
    Note over PG: state → awaiting_sanctions_check
```

### 10 · The quota runs out — rate limit, then circuit breaker

**The rate limiter stops calls that would succeed; the breaker stops calls that would fail.** The first is a contract ceiling — vendor quota is finite and named in Right-sizing — the second is a health verdict, and both land the task on the same `run_after` column, so queue-and-wait is the one response to either. A third stop is hiding behind the first: a monthly cap is a ceiling no rate clears, so it defers `run_after` to the reset and escalates once for the whole class (dive 4). The breaker's shared record and the sweeper's escalation are argued in dive 4; here the limits fire back to back.

```mermaid caption="When the vendor's quota is gone and then the vendor itself fails — which mechanism stops the calls, and what un-stops them?"
sequenceDiagram
    autonumber
    participant W as Sanctions worker pool
    participant K as Shared cache · rate counter + breaker
    participant V as List provider · ext
    participant PG as Postgres
    participant S as Sweeper
    W->>PG: claim check_list task · SKIP LOCKED
    W->>K: check the vendor's rate counter
    alt quota exhausted — the contract ceiling
        K-->>W: over the ceiling
        W->>PG: push run_after — queue-and-wait, no call made
        Note over K: the limiter refuses calls that would succeed
    else quota available
        W->>V: screen list · deadline attached
        V--xW: 5xx / timeout
        W->>PG: record the attempt, push run_after · backoff
        W->>K: report failure · the streak opens the breaker
        Note over K: the breaker refuses calls that would fail
    end
    W->>K: later — one worker finds the breaker half-open
    W->>V: single probe call
    V-->>W: healthy answer
    W->>K: close the breaker · workers resume claiming
    W->>PG: backlog drains inside the rate ceiling
    S->>PG: any flow past its state SLA — escalate · alert + dashboard + failure event to the client
```

### 11 · Recheck day — the batch, and the debt it creates and repays

**The re-screening load grows with the book, not with intake — and it runs as debt: rows owed, worked off, and repaid through the same paths a live check uses.** The clock re-enters each due flow with a `sanctions_recheck` transition and tasks scheduled off the live peak (dive 1), the inbox absorbs the vendors' duplicate deliveries (dive 3), and every changed verdict leaves through the outbox like a first verdict. Three queues carry the debt: pending tasks, inbox rows, and unpublished outbox events — all three visibly empty when the batch is done.

**What keeps the batch inside its window is that a recheck leg is not one vendor call per person.** Screening the book one person at a time is the ~160k outbound calls a day Right-sizing prices — about two a second sustained — thrown at a rate contracted for today's live volume, so the batch either overruns its window or spends the whole quota and starves the live class at it (dive 1), every cadence, for ever. Where a list vendor's API takes a set, the recheck leg therefore [batches](../patterns/concurrency/batching.md) roughly 500 persons per call, which turns those 160k calls into a few hundred. Be exact about what that buys: it buys rate and it does not buy invoice — the vendor still adjudicates 160k person-list checks and still bills for them, so the procurement ceiling in Right-sizing stands untouched and stays the first limit this design reaches. The cost of batching is partial failure, and it is paid where it belongs: the response is applied **one member per transaction**, so a member the vendor could not adjudicate dead-letters its own leg while the other 499 commit. That is the rule the whole mechanism rests on — the batch is a transport optimisation, never a unit of failure. Rolling back 500 results because one record was malformed would turn a vendor's bad row into our re-screening outage, and it is exactly what a naive batch does. Live flows are never batched: a person waiting on an invite is not waiting on 499 strangers.

```mermaid caption="Where does the recheck batch's backlog live while it works — and how is every owed result eventually paid?"
sequenceDiagram
    autonumber
    participant SCH as Recheck clock
    participant PG as Postgres
    participant W as Sanctions workers
    participant V as List vendors · ext
    participant D as Webhook dispatcher
    participant C as Client · ext
    SCH->>PG: find clear flows whose jurisdiction cadence is due
    loop each due flow — one txn
        SCH->>PG: sanctions_recheck transition + one check_list task per list · run_after off-peak
    end
    Note over PG: state clear → awaiting_sanctions_check · task debt accrues as pending rows
    W->>PG: claim legs as run_after passes · SKIP LOCKED
    W->>V: screen lists — inside the per-vendor rate ceiling
    V-->>W: results · duplicate deliveries possible
    W->>PG: one txn — inbox row + result row · dedup on the vendor's request id
    Note over PG: the inbox absorbs every duplicate
    W->>PG: last leg per flow — guarded transition + outbox event
    Note over PG: state → clear or sanctioned · outbox debt = published_at IS NULL
    D->>PG: poll the unpublished events
    D->>C: HMAC-signed webhook · stable eventId — a changed verdict delivered like the first
    C-->>D: 200 — event marked published
    Note over PG: debt repaid — the book is screened, all three queues empty
```

### 12 · Follow-up questions this design must answer

Nine questions that probe exactly where designs like this usually break. Verdict first; the expansion unfolds.

**Q1 — A vendor retries its callback and the duplicate arrives before you have written anything. Does your idempotency hold?**\
Yes — because the dedup key is the vendor's, not ours.

> **Why publisher-generated keys fail this exact case**
>
> A key issued when we publish can only collide with events that already exist — a duplicate racing ahead of the first write finds nothing to collide with, and both copies apply. The inbox keys on `(flow_id, step, provider_request_id)` — the sender's own id — and inserts in the same transaction as the effect. Whichever copy commits first wins; the loser hits the unique constraint and rolls back everything, whatever the arrival order. Dedup must be keyed by the sender and enforced atomically with the effect; anything else has a window.

**Q2 — Two workers pick up the same task. Prevented, or tolerated?**\
Both, deliberately: prevented at claim by `SKIP LOCKED`, tolerated at commit by the guarded transition.

> **Why one guard is not enough**
>
> The claim lock stops the common race. The zombie case slips past it: a worker stalls, its lock expires, the sweeper re-queues, a second worker finishes — then the zombie wakes and writes. The transition's `WHERE state = expected AND version = seen` makes that late write update zero rows. The residual cost is a duplicated vendor call, which the outbound idempotency key collapses. Belt at claim time, braces at commit time.

**Q3 — ID verification fails. Do you still run sanctions, and is Sanctioned distinct from Invalid ID?**\
No sanctions on a failed ID, and yes — distinct terminals, because the client acts differently on each.

> **Terminal semantics**
>
> Sanctions screens a verified identity; screening data that failed verification spends vendor quota to produce a result nobody can act on. So Invalid ID branches out of Awaiting ID Verification and the sanctions step never starts. The terminals mean different next actions: Invalid ID → fix the submission, possibly re-invite; Sanctioned → a compliance decision. Collapsing both into a generic "failed" throws away exactly the bit the client pays for.

**Q4 — The magic link expired and the person clicks it. What do they see?**\
A self-serve resend that issues a fresh single-use key with a new 48-hour expiry — never a support address.

> **The resend path**
>
> The `410` from the token check routes straight to a resend page backed by `POST /flows/{id}/invite/resend`: prior keys are invalidated, a fresh key is issued (hash stored), the email goes out again, rate-limited per flow so the endpoint cannot be used to spam. "Contact support" as the answer converts an expired timestamp into a ticket queue and a lost onboarding; a resend converts it into one more click.
>
> That answer is only available because the link is a durable row. The cheaper-looking home — a key in the shared cache under a 48-hour TTL — fails three ways. An evicted key cannot be told from a forged one, so the `410` that routes to this page degrades into a `404`. Expiry here owes work rather than cleanup: the sweeper that re-invites or escalates the abandoned flow needs the row to act on, and eviction leaves it nothing to sweep. And `used_at` must be stamped in the same transaction as the submission it authorises, which a cache cannot join. At ~20k live rows the TTL saves nothing worth any of that. **Expiry is a predicate; reclamation is retention** — a scheduled sweep deletes on the jurisdiction's clock, not on a countdown.

**Q5 — Several worker replicas: where does circuit-breaker state live?**\
In the shared cache — one breaker per vendor, not one per process.

> **Why in-process breakers underreact, then overreact**
>
> In-process breakers give each replica its own failure count: with N replicas, the fleet absorbs N× the failures before the last breaker opens, then sends N half-open probes at a vendor trying to recover. A single shared record — state, opened-at, failure streak — means the first replica to hit the threshold opens the circuit for everyone, and exactly one probe decides recovery. The cache also holds the fallback weights, so a worker's claim-and-call path reads one place for "may I call, and whom".

**Q6 — You weight traffic across fallback providers. What updates the weights?**\
Recorded health metrics move them automatically; a manual override outranks the automation.

> **The weight mechanism**
>
> Per-provider error rate and latency are already collected for alerting; a small control job folds them into weights in the shared cache — degrade a provider's share as its error rate climbs, decay back toward the default as it recovers. Operators can pin a weight during an incident or a contract migration, and the pin wins until released. The mechanism matters more than the formula: a weighted split that only a deploy can change is not a control, it is a constant.

**Q7 — Auth is a given component. Does it cover the onboardee, or only the client?**\
Only the client. The onboardee's magic-link session is built here — and the two must never mix.

> **Two principals, two mechanisms**
>
> The given service authenticates tenants: API keys for the API, SSO (single sign-on) for the dashboard. The onboardee has no account and should never need one — their identity is possession of the single-use link, so their session is the link's hash: scoped to one flow's submission endpoints, expiring with the key, spent on use. An onboardee token that could reach client-scoped endpoints would be a privilege-escalation path from an email inbox; the scopes are disjoint by construction.

**Q8 — Three different things here are called a key. Are they constructed the same way?**\
No — three constructions, because they defend against three different failures.

> **Who issues it, and what it is made of**
>
> The client's `Idempotency-Key` is theirs: a UUID (universally unique identifier) they generate, opaque to us, never parsed. It is unique only within `(client_id, endpoint, key)` — so one tenant cannot collide with another, and the same key replayed against a different route is caught rather than silently served. It is bound to a digest of the request body, and that binding is the part people skip: without it, a client that reuses a key by accident is served the answer to an earlier question instead of an error.
>
> The keys we issue outbound follow one rule — build them from the durable row that survives the retry, never generate them at send time. The webhook's is `outbox.event_id`; the email vendor's is built from the task row's id. A key generated at the moment of sending is fresh on every attempt and therefore collapses nothing; the whole point is that attempt two presents attempt one's key.
>
> The magic-link token is not an idempotency key at all and is built to a different standard: 256 bits from a CSPRNG, stored only as its SHA-256, because it defends against guessing, not duplication. It is deliberately not a self-validating token — single-use and revoke-on-resend are both requirements, and a token that validates itself can honour neither. Which leaves the case that gets over-engineered most often: an operation already repeatable by construction earns no key at all. Webhook replay re-emits the same `eventId`, so running it twice is running it once.

**Q9 — The guards are races: duplicate-first, the zombie write, simultaneous legs. How do you prove they hold?**\
By making each race a deterministic test — the guards are SQL, so the races replay as two open transactions in a harness.

> **Reproducing the races**
>
> Each guard is exercised by staging its race explicitly, not by hoping load finds it. Duplicate-arrives-first: deliver the same callback twice, second copy first — the inbox's unique constraint must abort one transaction whichever order commits (Q1). The zombie: claim a task, expire its lock by hand, let a competitor finish the flow, then let the original commit — its guarded transition must update zero rows (Q2). The collector: complete the last two sanction legs in two concurrent transactions — exactly one may conclude the flow, and the loser must roll back whole (dive 3). Failover joins the rota rather than the wishlist: promote the standby with acknowledged commits in flight and assert every outbox row survived. None of it needs fault-injection infrastructure — the guards live in Postgres, so a race is two sessions and a held lock, repeatable in CI (continuous integration).

## Limitations & trade-offs
<!--meta block=tradeoffs-->

**The biggest flaw, named first: one Postgres per region is a single writer and a single point of failure — a choice, not an oversight.** Every risk below follows from taking that trade deliberately.

### Strengths
<!--meta polarity=pro-->

- **The write/publish gap is closed by construction.** Transition, outbox event and follow-up tasks commit atomically, so the client can never be un-told something the database believes.
- **Waits are rows.** A human taking a day or a vendor down for six hours costs storage, not connections, threads or timeouts.
- **The exits are pre-named.** A broker or an engine slots in at the outbox boundary additively — no step on the scaling path is a rewrite.
- The business enum stays the five-state model a client and an auditor can read; operational facts live on task rows, off the contract.
- Every moving part is inspectable with SQL — a stuck flow, a dead task or an unpublished event is one query.

### Risks
<!--meta polarity=con-->

- **Postgres is the SPOF.** Consistency was chosen over availability: an outage stalls every write until the standby takes over (see dive 4).
- **Throughput is capped by vendor contracts** and their ~6h/week downtime — a procurement lever, not an engineering one (see dive 4).
- **PII concentrates blast radius** in one vault and one database (see dive 7).
- **Each region is an island — by requirement.** A regional outage is downtime for that region's clients, region-scale loss means a documented restore rather than a failover, and N regions multiply cost, operational surface and config drift.
- A blocking list nobody can reach holds the flow open until a human decides. The design takes a late answer over a wrong one, and pays for it in escalations (see dive 3).
- A caveated clear asks more of the client than a clear does — they have to read which list was missed and price that gap themselves. Hiding it would be simpler, and would be a claim the screening does not support (see dive 3).
- A down client webhook piles up owed results until it returns; redelivery and replay carry the backlog. Delivery is claimed per tenant so one dead endpoint cannot hold the shared dispatcher pool at its timeout while every other tenant's verdicts queue behind it.
- Queue-in-DB churns the task table as volume grows; the broker exit is named in Right-sizing.

## What's expected at each level
<!--meta block=levels-->

### Mid-level

- Asks about volume before designing, and scopes the design to the answer.

  > **The answer**
  >
  > ~100 merchant onboardings a week, several people each — under 75 person-flows a day, with headroom designed to 10k. Right-sizing prices everything against it: ~42 rows per flow is ~10 row-writes/s peak, still two rungs below the first number that troubles a single primary. That is why there is no broker, no search index and no read cache — each rejected by the numbers, not by taste.

- Reads the sequencing out of the brief — sanctions screening runs after verification, not in parallel with it.

  > **The answer**
  >
  > Sanctions screens a verified identity; screening data that failed verification spends vendor quota on a result nobody can act on. Invalid ID branches out before screening ever starts, and the gate is the state machine itself — the fan-out tasks are written only by the transition into Awaiting Sanctions Check. The concurrency lives inside the step instead: one leg per list (dive 12, Q3).

- Produces the five-state flow with a queue in front of the vendor calls.

  > **The answer**
  >
  > Initiated → Awaiting Submission → Awaiting ID Verification → Awaiting Sanctions Check, then the three-way terminal branch: Clear, Sanctioned, Invalid ID. The queue is the `task` table in the same Postgres: the person takes ~a day to submit and the ID vendor is down ~6 h/week, so every wait is a durable row with a `run_after` — never a connection held open across the wait.

- Walks the failure paths when prompted, rather than only the happy one.

  > **The answer**
  >
  > Vendor down: the breaker opens, `run_after` pushes out, the flow waits and drains on recovery. Worker dies mid-task: the sweeper resets the expired lock for a competitor. Retries exhausted: dead task, operator alert, failure event to the client. Link expired: self-serve resend, never a support address. Client endpoint down: backoff, a dead delivery state, the replay endpoint. Nothing is silently dropped — silence toward the paying client is the one failure mode the design refuses.

### Senior {#levels-h3-2}

- Separates operation state from business state unprompted, and says why the seam pays.

  > **The answer**
  >
  > The flow enum holds only the five business states; attempts, locks and backoff live on `task` rows and never touch it. The seam pays three ways: the client-visible vocabulary never changes when retry mechanics do; the transition history stays a clean, append-only account of business fact; and the audit requirement is met by projection over `flow_transition` rather than a second write path that could disagree (dive 2).
- Closes the write-then-crash-before-publish gap with an outbox in the same transaction as the transition.

  > **The answer**
  >
  > "Record the state change" and "tell the client" are two systems with no transaction spanning them — a crash between them means the database says Clear while the client hears nothing, forever. The outbox turns publish into a second local write: transition, outbox event and follow-up tasks commit in one transaction (dive 3's five-fact SQL); the dispatcher retries against the durable row, and `published_at IS NULL` is always the honest list of what is still owed.
- Reaches for `FOR UPDATE SKIP LOCKED` competing workers, and argues why no broker at this volume.

  > **The answer**
  >
  > The claim locks one pending row and skips anything already locked — two workers cannot claim the same task, none ever blocks, and adding capacity is adding a stateless replica. No broker because at ~10 writes/s the queue's entire value is that a task insert shares a transaction with the state change that spawned it; a broker trades that atomicity away, and adds an operational surface, to solve a throughput problem this system does not have (dive 1).
- Raises DB-level tenant isolation (RLS) rather than trusting application-side filters.

  > **The answer**
  >
  > An application filter is one forgotten `WHERE client_id =` away from a cross-tenant leak — here a reportable incident, not a bug. Row-level security makes the database refuse the un-scoped read no matter which code path issued it, with the same policy on every client-scoped table. Two layers back it: a private network segment where only the API tier is public, and authenticated edges — HMAC-signed webhooks, hashed single-use magic links (dive 7).

{#levels-ul-2}

### Staff+ {#levels-h3-3}

- Answers the duplicate-that-arrives-first trap: a sender-keyed inbox row in the same transaction as the effect.

  > **The answer**
  >
  > A vendor's duplicate can arrive before this system has written anything, so a dedup key issued at our publish time finds nothing to collide with — both copies apply. The inbox keys on the sender's own id — `(flow_id, step, provider_request_id)` — and the insert shares a transaction with the callback's effect: whichever copy commits first wins, the loser hits the unique constraint and rolls back its whole transaction, and arrival order stops mattering entirely (dive 12, Q1).
- Names where breaker state lives and what moves the fallback weights — the mechanism, not just the intent.

  > **The answer**
  >
  > One breaker record per vendor in the shared cache — per-process breakers make N replicas absorb N× the failures before the last one opens, then send N half-open probes at a recovering vendor; shared, the first replica to hit the threshold opens the circuit for everyone and one probe decides recovery. The weights are moved by recorded health: per-provider error rate and latency, already collected for alerting, are folded into cache-held weights that degrade a failing provider's share and decay back as it recovers — with a manual pin that outranks the automation (dive 4 and dive 12, Q5–Q6).
- States the CAP (consistency, availability, partition tolerance) position and points at the one eventually-consistent surface.

  > **The answer**
  >
  > Choose C: during a partition the single-writer Postgres refuses creates rather than risk two open flows for one (client, email) or a transition without its outbox guarantee; stalled work parks in the queue and drains on recovery, exactly as after vendor downtime. PACELC: PC/EC — pay latency in every branch, never inconsistency. The one EC surface is the client-facing view: the at-least-once webhook that may lag by minutes, accepted up front (dive 3).
- Prices the broker and workflow-engine exits against the triggers set in Right-sizing.

  > **The answer**
  >
  > The broker's trigger is measured task-table churn — dead-tuple ratio on `task` and age of the oldest pending row climbing together, at roughly sustained 100k flows/day — and the outbox survives the move untouched. The workflow engine's trigger is flow variants multiplying, priced at losing the append-only history to the engine's own. Cheaper exits come first: index and prune the task table, then the read replica when dashboard reads compete with worker claims.
- Defends the single-writer Postgres as the design's biggest flaw, chosen deliberately.

  > **The answer**
  >
  > The consistency guarantees are bought with the single writer: the atomic transition + outbox + task commit, the readable five-state contract, waits as rows, everything inspectable with SQL. When the writer is down the system stalls — and that is the choice, made in the open. Handled in the open, not denied: a synchronous in-region standby (an async replica is rejected because it can drop the very outbox row the design exists to never lose), point-in-time recovery, and the queue-in-DB property that a stall loses no acknowledged fact — work drains on return (tradeoffs, dive 4).

{#levels-ul-3}

## Patterns it demonstrates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Orchestration & state**

- [Saga](../patterns/distributed/coordination/saga.md) — verify, screen and notify are local transactions sequenced by the state machine, with explicit failure terminals instead of a transaction manager spanning the vendors
- [Workflow Orchestration](../patterns/distributed/coordination/workflow-orchestration.md) — the flow row plus its task queue is a hand-rolled durable orchestrator — every transition is persisted, so a crash or deploy resumes mid-flow instead of restarting it
- [Outbox](../patterns/distributed/coordination/outbox.md) — every state transition commits with its outbox event in one Postgres transaction, closing the write-then-crash-before-publish gap
- [Inbox](../patterns/distributed/coordination/inbox.md) — every vendor callback lands as an inbox row unique on flow, step and the provider's own request id, in the same transaction as its effect — so a duplicate that arrives before the outbox write still collides
- [Replication](../patterns/distributed/coordination/replication.md) — a synchronous in-region standby gives the single writer failover without giving up its consistency stance
- [Optimistic Concurrency Control](../patterns/distributed/coordination/optimistic-concurrency-control.md) — every transition carries WHERE state = expected AND version = seen, so a zombie worker's late write updates zero rows instead of double-applying

**Vendor resilience**

- [Circuit Breaker](../patterns/distributed/resilience/circuit-breaker.md) — one breaker per vendor with its state in the shared cache, so every worker replica sees the same open circuit and one probe decides recovery
- [Retry with Backoff](../patterns/distributed/resilience/retry-backoff.md) — vendor calls and webhook deliveries retry on a growing schedule recorded on the task row's run_after before the sweeper escalates them
- [Timeout / Deadline](../patterns/distributed/resilience/timeout-deadline.md) — every task and every sanctions leg carries its own deadline, because no vendor publishes a latency bound and the sweeper needs a line to enforce
- [Bulkhead](../patterns/distributed/resilience/bulkhead.md) — each vendor gets its own worker pool, so a stalled sanctions vendor cannot starve ID verification or the email invites
- [Sweeper](../patterns/distributed/coordination/sweeper.md) — one scheduled job re-queues expired task locks, escalates exhausted tasks to a dead state, breaches the SLA out loud to operator and client, and runs both recheck clocks
- [Leader Election](../patterns/distributed/coordination/leader-election.md) — the sweeper and both recheck clocks each hold a renewable lease in the shared cache, so a second replica waits instead of double-firing an escalation or buying a vendor screen twice
- [Anti-Corruption Layer](../patterns/ddd/acl.md) — each vendor gets a translator that parses its payload and maps it onto our own three-valued outcome — and stamps provider and policy version onto the transition, so the history can answer how a person was verified
- [External Configuration Store](../patterns/distributed/coordination/external-configuration-store.md) — the list roster, each list's criticality, the recheck cadences, vendor quotas and fallback weights move without a deploy — and a worker that cannot reach the store boots from its last cached version rather than from defaults

**Queue & delivery**

- [Queue-Based Load Leveling](../patterns/distributed/resilience/load-leveling.md) — the task table is the queue that absorbs onboarding bursts and six-hour vendor outages ahead of fixed vendor rate limits
- [Competing Consumers](../patterns/messaging/competing-consumers.md) — stateless worker replicas compete for tasks with FOR UPDATE SKIP LOCKED, so two never claim the same row and adding capacity is just adding replicas
- [Dead Letter Channel](../patterns/messaging/dead-letter-channel.md) — a task that exhausts its retries is parked in a dead state — alerted to an operator, surfaced to the client as a failure event, re-runnable after the cause is fixed
- [Scatter-Gather](../patterns/messaging/scatter-gather.md) — the sanctions step fans out one task per list and a collector transitions the flow exactly once, when every leg has reported
- [Idempotency](../patterns/messaging/idempotency.md) — four boundaries, four dedup keys, each issued by whichever side can actually see the duplicate — a stored client key, the vendor's own request id, the task row's id, the event id
- [Correlation Identifier](../patterns/messaging/correlation-identifier.md) — one flow id threads transitions, tasks, vendor calls and delivery attempts, so support reconstructs any flow with a single query
- [Sequential Convoy](../patterns/messaging/sequential-convoy.md) — webhook delivery claims a flow rather than an event and sends its owed results in outbox order, so a re-screen's corrected verdict cannot overtake the one it corrects

**Capacity & admission**

- [Priority Queue](../patterns/messaging/priority-queue.md) — live flows and the recurring recheck batch share one task table, so recheck tasks claim from a separately sized pool — reserved capacity per class, because the batch's jurisdiction cadence is a deadline too
- [Autoscaling](../patterns/distributed/routing/autoscaling.md) — worker pools scale on the age of their oldest pending task, never on processor load — these pools sit blocked on vendor calls, so CPU stays flat while the queue starves
- [Backpressure](../patterns/concurrency/backpressure.md) — flow creation answers 429 with a Retry-After once the live class's oldest pending task passes its ceiling — the queue is load-levelling, not an unbounded promise
- [Batching](../patterns/concurrency/batching.md) — the recurring re-screen sends ~500 persons per list-vendor call, and applies the response one member per transaction so a bad record dead-letters its own leg while the rest commit

**Payloads & PII**

- [Object Storage](../patterns/distributed/routing/object-storage.md) — ID photos go straight to an object store by presigned upload, referenced by key from a metadata row written before the upload
- [Valet Key](../patterns/distributed/routing/valet-key.md) — the ID photo goes up on a presigned URL scoped to one object for fifteen minutes, so the API tier decides who may upload and then leaves the data path entirely
- [Claim Check](../patterns/messaging/claim-check.md) — workers pass the photo's storage key between steps, never the image bytes
- [Secure Logger](../patterns/security/secure-logger.md) — log lines carry flow and person ids only — the encrypted vault is the single place raw PII exists, so logs never become a second copy of it

**Tenancy & restraint**

- [Secure Session Manager](../patterns/security/secure-session-manager.md) — the onboardee has no account: their session is the magic link's hash — server-side state, single-use, 48-hour expiry, revoked the moment a resend supersedes it
- [Rate Limiter](../patterns/distributed/resilience/rate-limiter.md) — per-client limits at the API edge keep one tenant's onboarding burst from consuming the shared vendor quota, and bound the invite-resend endpoint
- [Keep It Simple (KISS)](../principles/kiss.md) — one Postgres and stateless workers carry a confirmed hundred onboardings a week; every rejected broker and engine is priced against that number, with named exits instead of early adoption
- [Deployment Stamp](../patterns/distributed/routing/deployment-stamp.md) — residency is one full stack per region — gateway, API, workers, Postgres and standby, vault, object store — stamped from the same infrastructure-as-code so only jurisdiction config varies

**Alternative to**

- [Persona Identification & Sanction Check (V2)](./persona-identification-v2.md) — the same brief argued from the delivery contract — read it when the grading is on exactly-once in effect, the four dedup boundaries and the recovery ladder rather than on the storage core

**Demonstrates**

- [Fan-Out](../patterns/messaging/fan-out.md) — Each person check fans out to about four sanctions lists, roughly 40k screening legs a day
- [API Gateway](../patterns/distributed/routing/api-gateway.md) — The public edge is a gateway in front of the intake service, separate from the schedulers that run on their own clock
- [Distributed Cache](../patterns/caching/distributed-cache.md) — A small shared cache holds circuit-breaker state so every worker sees one view of a vendor's health
- [Thread Pool](../patterns/concurrency/thread-pool.md) — One worker pool per vendor means a stalled sanctions vendor cannot starve ID verification
- [Materialized View](../patterns/distributed/coordination/materialized-view.md) — A flow's current state sits on its own row while every transition is appended, so the audit view is a projection over those rows

<!-- relationships:end -->
