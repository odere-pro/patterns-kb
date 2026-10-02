---
title: Persona Identification & Sanction Check (V2)
description: "The same identity-and-sanctions flow argued from its delivery contract: exactly-once in effect, and a clock on everything that can stall"
area: designs-advanced
owner: Oleksandr Derechei
tags: [event-driven, durability, asynchrony, error-handling]
status: stable
solves: [our webhook consumer processed the same result twice and the customer got charged twice, a provider went quiet weeks ago and nobody noticed the checks were still sitting open, we replayed the queue after an incident and half the work got applied a second time, the client acted on an old answer because two updates reached them out of order, work piled up behind a slow provider for hours and we were still accepting more of it]
---

# Persona Identification & Sanction Check (V2)

A client starts a flow by providing an email address; the address's owner is invited to submit personal information and an ID photo, the ID is verified by a given external service, the verified person is screened against external sanction lists, and the result reaches the client on a webhook. Authentication, ID verification, sanction checks and email sending already exist — the problem is everything between them. A flow spends most of its life waiting on someone else — days for a person to upload a photo, hours for a vendor to come back up — while carrying regulated personal data that belongs to one client among many; being slow is acceptable here, but telling a client the wrong outcome, or never telling them at all, is not.

## Understanding the problem
<!--meta block=description-->

The task states a flow and four given components — no volumes, no jurisdictions, no data-protection rules. These questions close those gaps. Where no answer was available the assumption is marked; each answer lands in a requirement below.

**Q1 — What does "delivered" mean, and who is allowed to see a duplicate?** → functional requirement (FR): recognisable repeat; non-functional requirement (NFR): delivery & idempotency. The client sees duplicates and must be able to recognise them. No network delivers exactly once, so the promise is at-least-once transport with a stable identifier on every copy, which the client collapses. We publish that promise and not a stronger one.

**Q2 — What happens to a flow when a vendor never answers?** → FR: terminal or alert, list criticality; NFR: reliability & recovery. It still ends, and somebody still hears about it. An error is easy; a vendor that takes the call and goes quiet strands the flow, because nothing is left in the request path to fail. So every wait carries a deadline, and missing the deadline is the failure.

**Q3 — We are hours behind. Do we still take new requests?** → NFR: reliability & recovery, scale. No. A flow we accept but cannot get to looks fine to the client until their own customer complains. We turn it away, say when to retry, and put that refusal in the contract.

**Q4 — May a result be re-sent, and who asks for it?** → FR: replay; NFR: delivery & idempotency. Yes, and either side may ask. A client whose endpoint was down all day needs a way back that is not a second read API, so replay re-walks the record and re-sends the same identifiers. The identifiers are what make it safe: a replayed result is a duplicate the client already knows how to drop.

**Q5 — How many person-flows a day, and how fast does that grow?** → NFR: scale. Assumed, not given: ~100 merchant onboardings a week, several people behind each — fewer than 75 person-flows a day, designed out to 10k. Confirm it before reading Right-sizing. Every verdict there is priced against this number, and none of them holds if it is wrong by ten times.

**Q6 — How many sanction lists, and may a partial verdict ship?** → FR: fan-in; NFR: consistency. Several per jurisdiction, and no. A round concludes only once every list that jurisdiction requires has answered, which is what makes "cleared" a word a regulator can rely on. Assumed, not given: each vendor returns a match or no match, never a score, so this system carries no human review state.

**Q7 — What must the history prove, and to whom?** → FR: history; NFR: compliance. To an auditor, years later: what was checked, when, on whose authority, under which policy version. The answer comes out of the record the system actually ran on. A history written alongside the decision is a second write, and a second write can disagree with the first exactly when it matters.

**Q8 — What personal data is held, where may it live, and what must we produce on demand?** → FR: separate PII (personally identifiable information) store, access audit, relationship close; NFR: compliance, security & tenancy.

- Name, date of birth and a photograph of a government identity document — personal data about people who never signed up with us.
- It lives in its client's region, and that region is fixed at client onboarding rather than chosen per request.
- Producible on demand: a flow's full history, and the record of everyone who read the personal data behind it.
- Producible on demand: proof that data was destroyed, not an assurance from us that it was.
- Retention runs per jurisdiction from the end of the relationship, which puts it in permanent tension with the right to erasure.
- A leak across clients is a reportable incident rather than a bug to prioritise.

**Q9 — When does the screening obligation end?** → FR: relationship close; NFR: scale, compliance. When the client's relationship with the person ends. Only the client knows that, so the contract makes them tell us. Without the signal the recurring book only grows: we keep paying to screen people who left, and keep holding their personal data with no lawful basis for it.

**Q10 — Who is paged, and how fast?** → FR: failure notice; NFR: reliability & recovery, observability. An operator, inside 15 minutes of a flow passing its state deadline; the client's failure event follows within 5 minutes of that page, so nobody outside hears before we do. Assumed, not given: confirm both numbers. A stall is invisible until a clock we own notices it, so a deadline nobody wrote down is a flow nobody is ever told about.

**Q11 — Does residency mean multi-region, and does anything fail over?** (open) → NFR: security & tenancy; out of scope: geo-failover. Residency is in scope; failover is not. Residency means separate regional deployments that share no data, and it costs one copy of everything per region. Failover — a client surviving the loss of a whole region — does not pay for itself at this volume, and only the client can tell us whether a regulator demands it anyway.

**Q12 — What is deliberately not built?** → Out of scope.

- Cancelling a flow in flight.
- In-flight status polling — replay plus the dashboard is the entire recovery path.
- Cross-region failover, per Q11.
- Human review of a possible match, per Q6 — the vendor adjudicates.

## Explained
<!--meta block=explain-->

This design is a service that checks one person's identity for a client, screens that person against the sanction lists their country requires, and reports the result to the client's webhook, a web address the client registers to receive calls. You face it when the real work happens at outside vendors you do not control, which can answer twice, answer late or never answer. So no vendor call sits in the request path. Every change is appended to one log in a single Postgres transaction together with its follow-up tasks, so the history and what the client was told are the same rows and cannot disagree. Every wait is a stored task with a deadline, and a sweeper, a scheduled job that looks for overdue work, catches anything that stalls. The result is a flow that always finishes or raises an alert. It costs four things. Delivery is at-least-once, so every copy carries one identifier the client uses to drop repeats. When the service is hours behind it refuses new requests and says when to retry. Residency means one full copy of everything per region, with no failover between regions. A vendor outage makes flows wait rather than fail.

**Example.** Fewer than 75 person-flows arrive a day, and the design is sized out to 10,000. An invited person has 48 hours to use the single-use link. The identity vendor is down about 6 hours a week, so a flow that meets the outage waits as a stored task and is not failed. If a flow passes its state deadline, an operator is paged within 15 minutes, and the client's failure event follows within 5 minutes of that page, so nobody outside hears before the team does. The cost is that a client sees a delay of hours instead of an error, and must drop the duplicate results it receives.

## Requirements
<!--meta block=requirements-->

### Functional
<!--meta requirement=fr-->

**Mandatory — the promise, including the guarantees**

- A client starts a flow for one person by giving an email address.
- The create returns the flow's identifier before any work runs.
- A repeated create for the same open client-and-email pair returns the existing flow rather than starting a second one.
- The email's owner receives a single-use invitation link that expires after 48 hours.
- The email's owner can ask for a fresh link when the first one expires or is lost.
- The submitted personal information and identity photo are verified through the given identity provider.
- Screening against the sanction lists a jurisdiction requires runs only after verification passes.
- A flow concludes only once every required list is terminal for that round — answered, or recorded as unreachable.
- Every concluded result reaches the client on their registered webhook.
- A result delivered more than once is recognisable to the client as a repeat of one it already holds.
- Two results for one flow reach the client in the order the system produced them.
- Every accepted flow reaches a terminal state or raises an alert; none may sit unresolved without somebody being told.

**Additional — recovery, ongoing obligations and governance** {#requirements-h-additional}

- A flow that cannot proceed produces a failure event the client receives on the same channel as a result.
- A client can ask for a flow's client-visible events to be re-sent, and the re-sent copies carry the identifiers that make them recognisable repeats.
- A concluded flow's sanction screening is re-run on a cadence set per jurisdiction.
- Identity is re-verified from a fresh document when the current one expires or is revoked.
- A verdict changed by re-screening or re-verification is delivered exactly as the first one was.
- A client can record that its relationship with a person has ended, and that ends every recurring obligation for them.
- Each sanction list is blocking or advisory for its jurisdiction: unreachable and blocking holds the flow for a human, unreachable and advisory concludes the flow with the gap named in the result and a re-screen booked.
- Every state change is recorded, and any flow's full history can be reconstructed after the fact.
- Personal data is kept in a store of its own, separate from the flow's recorded history.
- Every access to personal data is recorded with who read it, when, and for what purpose.
- A flow and its history can be read step by step in the dashboard.

{#requirements-ol-additional}

### Non-functional
<!--meta requirement=nfr-->

- **Consistency**
  - The recorded history and what the client was told can never diverge, because they are the same rows.
  - A state change and the client-visible fact it produces commit together or not at all.
- **Delivery & idempotency**
  - Transport is at-least-once and the effect at every boundary is idempotent, which is exactly-once in effect and the strongest honest promise.
  - A repeated or replayed input — a create, a callback, a batch member, a delivery — leaves the system in the state its first arrival produced.
  - Results for one flow reach the client in the order the system produced them.
- **Reliability & recovery**
  - Nothing can stall without a clock that notices: every state and every vendor leg carries a deadline the system enforces.
  - The identity vendor is unavailable ~6 hours a week; queue and wait, and never fail a flow for a vendor outage.
  - Every failed step retries on a bounded budget, then dead-letters with its diagnosis and an alert, and is re-runnable once the cause is fixed.
  - A crashed worker or a crashed scheduler costs time, never a fact: both hold expiring leases and both are recovered by the same sweep.
  - The system refuses new work rather than accepting work it cannot drain, and a database failover loses no acknowledged fact.
- **Scale**
  - ~100 merchant onboardings a week today; one merchant means several person-flows.
  - Headroom to 10k person-flows a day without redesign.
  - Recurring re-screening grows with the book of open relationships rather than with daily intake, and must never starve live flows.
  - That book is bounded by relationships still open, not by everyone ever checked.
- **Observability**
  - One flow id correlates every recorded fact, task, vendor call and delivery attempt.
  - Alarms fire on stuck flows, per-class queue age, per-vendor error rates, stalled delivery lanes and dead work.
  - Every alarm names what it means, how to diagnose it and how to recover, and that text ships with the alarm definition rather than in a wiki beside it.
- **Compliance**
  - Verified documents are stored as evidence, not proxied.
  - Personal data is encrypted at rest; right-to-forget is honoured and provable.
  - Retention is a per-jurisdiction policy counted from the end of the relationship, enforced and evidenced by the system.
  - No identifier kept outside the personal-data store may be used to re-identify an erased person.
- **Security & tenancy**
  - Tenant isolation is enforced by the database itself, not by application filters alone.
  - Internal services and data stores are reachable only over a private network, never from the public internet.
  - Inbound callbacks and outbound webhooks are both authenticated; invitation links cannot be reused.
  - Each client belongs to a region recorded at onboarding, and their data stays in it.
- **Evolvability**
  - A deployment meeting only the mandatory requirements is a complete, correct product on its own.
  - Each additional obligation attaches to the recorded history of the mandatory flow without redesigning it.
  - A new jurisdiction, list or vendor changes configuration and cadences, not the shape of the system.

### Out of scope

- **Cancelling a flow in flight** — a started flow runs to a terminal or is abandoned by the sweeper. {#requirements-oos-1}
- **Status polling in flight** — recovery is replay plus the dashboard, not a second read path with its own consistency story. {#requirements-oos-2}
- **Cross-region failover** — regional isolation for residency is in scope; surviving the loss of a region is not. {#requirements-oos-3}
- **Human review of a possible match** — vendors return an adjudicated verdict, so no review state exists here. {#requirements-oos-4}

## Right-sizing
<!--meta block=sizing-->

**The problem:** ~75 person-flows a day today against a design target of 10k, each one idling for days on a person and for hours on vendors nobody here operates. **The shape:** event-driven, on an append-only log — the waits force the first and the delivery promise forces the second, because a record the relay publishes straight out of is a record no second write can contradict.

**The stores:** five in every region. Operational Postgres carries the log, the projections, the task queue, the inbox and the delivery cursors behind a synchronous standby; an encrypted vault carries personal data; a key manager holds envelope keys the application may use and never export; object storage holds documents; and a coordination cache holds breaker state, provider weights, rate counters and the schedulers' leases. **The deployment unit:** residency buys one full stack per region, so every number below reads per region, sized by the largest of them.

### Required capabilities {#sizing-h-capabilities}

**Durable transactional store → NFR: consistency** {#sizing-cap-1}

The ingress dedup row, the state change, the evidence and the client's event commit together or not at all (mandatory).

**Append-only history as the system of record → FR: history; NFR: compliance** {#sizing-cap-2}

The auditor's question is answered from the record the system ran on (mandatory).

**Publishable record → FR: result; NFR: consistency** {#sizing-cap-3}

The relay reads the record itself, so there is no second table whose contents can drift from it (mandatory).

**Ingress deduplication keyed by the sender → NFR: delivery & idempotency** {#sizing-cap-4}

A duplicate that arrives before this system has written anything must still collide (mandatory).

**Work queue with leases, budgets and deadlines → NFR: reliability & recovery** {#sizing-cap-5}

Every wait is a row, and every row has a clock (mandatory).

**Per-flow ordered delivery → FR: verdict ordering** {#sizing-cap-6}

A re-screen can flip a verdict, and a stale clear must never overtake a hit (mandatory).

**Coordination cache → NFR: reliability & recovery** {#sizing-cap-7}

One breaker record, one weight set and one rate counter per vendor, plus the schedulers' leases (mandatory).

**Admission control → NFR: reliability & recovery** {#sizing-cap-8}

The system refuses work it cannot drain rather than hiding it in a queue (mandatory).

**Rate limiting, inbound and outbound → FR: re-invite, replay; NFR: reliability & recovery** {#sizing-cap-9}

Every vendor quota is a contracted ceiling, the self-serve resend is a mail cannon if nobody counts it, and replay is the one amplifier a client can pull on themselves (mandatory).

**Private network and a single public edge → NFR: security & tenancy** {#sizing-cap-10}

Only one tier faces the internet (mandatory).

**Object store → NFR: compliance** {#sizing-cap-11}

Documents kept as evidence, in the client's region (mandatory).

**Encrypted personal-data store with key custody → FR: separate PII store; NFR: compliance** {#sizing-cap-12}

One envelope key per person, held where the application cannot export it (additional).

**Scheduler with leader election → FR: re-screening, failure notice** {#sizing-cap-13}

The sweeper and both recheck clocks are singletons, and a second copy re-invites people and re-spends vendor quota (additional).

**Elastic worker capacity → NFR: scale** {#sizing-cap-14}

The recurring book outgrows live intake by an order of magnitude within three years (additional).

### The numbers — every figure is per region, and the largest region dominates {#sizing-h-numbers}

**Writes → NFR: scale** {#sizing-num-1}

Count what one flow commits — ~12 appends, a projection update behind each, 7 task rows touched once on claim and once on completion, ~5 inbox rows, and single rows for the stored idempotency key, the invite key, the document and two audit entries. Call it 50. At the 10k/day target, doubled for business-hours bunching, that is ≈ **6 row-writes/s, ~12/s peak**, against a primary that stays comfortable to ~100 writes/s. Every one of those rows commits inside the transaction that makes the record and the client's event the same fact, so this arithmetic is what the guarantee costs rather than overhead around it.

**Claim polling → NFR: scale** {#sizing-num-2}

Nine workers — three pools of three replicas — each asking every 200 ms puts ≈ **45 claim queries/s** on the primary. Against the partial index on claimable rows that is nothing; without it the same query decays into a scan that grows with the table, which is why the index ships on day one instead of waiting to be discovered as a scaling exit.

**Delivery scanning → FR: result; NFR: scale** {#sizing-num-3}

The relay claims flows rather than events, so its read is one indexed lookup per owed lane rather than a scan of the log. At 10k flows/day and ~3 client-visible events each that is **under 0.4 deliveries/s**, and the partial index on unpublished work is what keeps it that cheap as the log grows.

**Metadata storage → NFR: scale** {#sizing-num-4}

~8 KB retained per concluded flow, and the figure is worth sourcing rather than asserting — roughly 12 events carrying ~300 bytes of payload each, the projection rows they fold into, and about half as much again in the indexes that keep the claim and the delivery lookup cheap. × 3.65M flows/year ≈ **29 GB/year** from live intake.

**Recheck storage → FR: relationship close; NFR: scale** {#sizing-num-5}

A quarterly round costs ~6 appends and 4 round rows, about 3.6 KB. Year three carries a book of 10.9M open relationships, and four rounds apiece is 43.6M rounds ≈ **157 GB/year and rising with the book**. That is the dominant storage term, and it compounds against open relationships while revenue tracks only new ones.

**Documents → NFR: compliance** {#sizing-num-6}

One 2 MB photo per flow at 10k/day accrues ≈ **7.3 TB/year**. It does not accrue forever — under an assumed three-year mean relationship and five years of retention counted from its end, the store settles near 58 TB. Intake sets how fast it fills; the retention clock decides where it stops.

**Outbound vendor calls → NFR: scale** {#sizing-num-7}

Live intake runs 4 lists × 10k/day ≈ 0.5 legs/s. The year-three recheck book adds 478k legs/day ≈ **5.5 legs/s, twelve times live intake** — and what binds first is the contracted rate, never the compute behind it.

**Waiting (Little's law) → NFR: reliability & recovery** {#sizing-num-8}

A ~24 h mean wait on the person against 10k/day leaves ≈ **10k flows parked** at any moment. They are inert rows the claim query never touches, cleared by the 48-hour link expiry, two automatic re-invites and a seven-day sweep that expires the flow and says so to the client.

### Verdict per candidate — what the system runs, and the exits it defers against a named trigger {#sizing-h-verdicts}

**Event-driven core → NFR: consistency** {#sizing-verdict-1}

**Adopted**: every wait becomes a durable row and every change an appended fact.

**Append-only log as the system of record → FR: history; NFR: consistency, compliance** {#sizing-verdict-2}

**Adopted**: the auditor's evidence and the client's event are one and the same append, leaving no second write that could contradict the first.

**A cursor per flow over the log → FR: verdict ordering** {#sizing-verdict-3}

**Adopted**: it is the outbox's relay without the outbox's table, and it makes per-flow order a property of the claim rather than of the network.

**Inbox keyed on the sender's own request id → NFR: delivery & idempotency** {#sizing-verdict-4}

**Adopted**: a repeat can land before this system has written anything at all, so the key has to be issued by whichever side can see both copies.

**An inbox row on every ingress, not only vendor callbacks → NFR: delivery & idempotency** {#sizing-verdict-5}

**Adopted**: a batch member result and a client create are duplicate-prone for the same reason a callback is, and three mechanisms for one property is three places to get it wrong.

**Same-transaction projection → NFR: consistency** {#sizing-verdict-6}

**Adopted**: a read model that commits with the log cannot lag it, and one whose shape changes is rebuilt from the log rather than migrated.

**Work queue as a table in the same store → NFR: consistency, scale** {#sizing-verdict-7}

**Adopted**: the task insert rides the transaction of the append that created it, and skip-locked claiming makes that table a capable competing-consumers queue at ~12 writes/s.

**Deadline columns on states and legs → NFR: reliability & recovery** {#sizing-verdict-8}

**Adopted**: a vendor that accepts a call and goes silent produces no event to react to, so the only thing that can notice is a clock the system owns.

**Bounded retry with a dead state on the task row → NFR: reliability & recovery** {#sizing-verdict-9}

**Adopted**: an attempt budget plus a recorded last error is what turns a poison task into a row in an operator's inbox instead of a loop nobody sees.

**A third leg outcome for "unreachable" → FR: fan-in, list criticality** {#sizing-verdict-10}

**Adopted**: a two-valued verdict gives an unanswerable leg no terminal, so a withdrawn list becomes our permanent stall.

**Leases on schedulers and on claimed tasks → NFR: reliability & recovery** {#sizing-verdict-11}

**Adopted**: one mechanism recovers a crashed worker and a crashed scheduler, and a second copy of a clock re-invites people and re-spends quota.

**Admission control at the edge → NFR: reliability & recovery** {#sizing-verdict-12}

**Adopted**: refusing a create with a retry hint costs the client less than accepting it into a queue already hours behind.

**Rate limiters counted in the shared cache rather than per process → FR: replay; NFR: reliability & recovery** {#sizing-verdict-13}

**Adopted**: a per-process limiter divides the vendor's contracted ceiling by however many replicas happen to be running, so it either wastes the quota or breaches it. The same counters price the client-facing limits, which is what makes replay a request the system can meter instead of an amplifier a client can pull without asking.

**Elastic worker pools driven by queue age → NFR: scale** {#sizing-verdict-14}

**Adopted**: a pool blocked on vendor calls reports no processor load worth reading, while the age of its oldest pending item reports everything.

**Batched vendor calls for the recurring book → NFR: scale** {#sizing-verdict-15}

**Adopted**: roughly 500× on the binding constraint, which is the whole distance between fitting the contracted rate in year three and reopening the contract.

**Separate encrypted vault with a key manager → NFR: compliance** {#sizing-verdict-16}

**Adopted**: erasure has to be provable, and a destroyed key proves what a delete somebody was trusted to run only asserts.

**Object store → NFR: compliance** {#sizing-verdict-17}

**Adopted**: evidence and residency force it, and at tens of terabytes of immutable blobs it is also the cheapest place they could live.

**Coordination cache → NFR: reliability & recovery** {#sizing-verdict-18}

**Adopted** for correctness rather than speed: keep breaker state per process and N replicas each pay for the same outage, then send N probes at a vendor that is barely back.

**Synchronous in-region standby → NFR: reliability & recovery** {#sizing-verdict-19}

**Adopted**: the standby acknowledges every commit before the client does, so promotion loses no acknowledged fact.

**Message broker → NFR: scale** {#sizing-verdict-20}

**Deferred**: it buys throughput this system does not need and pays with the shared transaction that makes the guarantee. The trigger is measured task-table churn, roughly sustained 100k flows/day, and the log crosses that move untouched.

**Workflow engine → NFR: evolvability** {#sizing-verdict-21}

**Deferred**: a log plus a task table is already durable, inspectable orchestration. The trigger is flow variants multiplying, and the price is handing an append-only history over to the engine's own.

**Log partitioning by time → NFR: scale** {#sizing-verdict-22}

**Deferred**: the trigger is a region's log passing roughly 500 GB, which the recheck arithmetic reaches in year three.

### When this stops being right → NFR: scale {#sizing-h-limits}

Nothing in the guarantee chain wears out at volume: the writes, the lanes and the clocks all keep the headroom the arithmetic above shows. What wears out is the obligation itself. Every open relationship commits this system to a round on every list, every quarter, for as long as the relationship lasts, so outbound legs track the accumulated book while income tracks only new business — twelve times live intake by year three, against a rate somebody priced for today. Watch one ratio: outbound legs per second per vendor over the contracted ceiling, plotted beside new flows per day. The day those two lines diverge is the day the bill stopped following the business, and it arrives well before anything technical complains. Then take the exits in order — batching, already adopted and worth roughly 500× by itself; staggered cadences, so a jurisdiction's rounds spread across its quarter instead of piling onto one morning; a renegotiated contract, with the curve in hand; and log partitioning by time once a region passes ~500 GB. Cheapest of the lot, and underneath all of them: actually honouring relationship close.

## Core entities & data design
<!--meta block=entities-->

Four tables carry the whole delivery contract and they are worth reading first: `flow_event` is both the record and the publish queue, `inbox` is where every duplicate ingress collides, `task` holds every clock and budget that stops work stalling, and `delivery_cursor` is the one lane per flow that makes order a property rather than a hope. Everything else is state folded from the log, evidence, or tenancy. Two seams are in the schema rather than in a convention someone has to remember: personal data lives in a vault the operational store reaches only through an opaque `person_ref`, and operational bookkeeping never appears in the log. Every client-scoped table carries `client_id`, because a table without the column is a table no row-level-security policy can reach.

~~~mermaid caption="The delivery contract, and how its tables join. `flow` is not stored beside `flow_event` but folded from it, which is why nothing here can disagree with anything else here. Each table's columns are in its own schema below."
erDiagram
    direction LR
    CLIENT ||--o{ FLOW : "owns — client_id is on every table"
    CLIENT ||--o{ IDEMPOTENCY_KEY : "retries are scoped to"
    FLOW ||--o{ FLOW_EVENT : "IS folded from — the only write"
    FLOW ||--|| DELIVERY_CURSOR : "has exactly one ordered lane"
    FLOW ||--o{ INBOX : "dedups every ingress for"
    FLOW ||--o{ TASK : "spawns work that carries clocks"
    FLOW ||--o{ SCREENING_ROUND : "tallies its fan-in per round"
~~~

~~~mermaid caption="Everything a flow hangs off: who owns it, who the person behind it is, and what evidence backs the answer. `person` is reached only through an opaque `person_ref`, so the operational store never holds the identity it is deciding about."
erDiagram
    CLIENT ||--o{ PERSON_RELATIONSHIP : "opens and closes"
    CLIENT ||--o{ AUDIT_LOG : "is audited in"
    PERSON_RELATIONSHIP ||--o{ FLOW : "governs the clocks of"
    PERSON ||--o{ FLOW : "reached by person_ref only"
    PERSON }o--|| KEY_MANAGER : "sealed under an envelope key"
    FLOW ||--o{ MAGIC_LINK_KEY : "is entered through"
    FLOW ||--o{ VERIFICATION_SESSION : "records attempts of"
    VERIFICATION_SESSION ||--|| DOCUMENT : "evidences"
    DOCUMENT }o--|| OBJECT_STORE : "bytes live in"
~~~

### The delivery contract — operational Postgres {#entities-group-1}

- **FlowEvent** — The system of record and the publish queue in one table. `client_visible` is the outbox predicate: the relay's queue is a filter over this table rather than a table of its own, so no second row can disagree about what the client was owed.

  ```sql summary="schema — flow_event"
  CREATE TYPE flow_event_type AS ENUM (
    'flow_created', 'invite_issued', 'invite_superseded', 'submission_received',
    'document_stored', 'idv_requested', 'idv_passed', 'idv_failed',
    'screening_started', 'list_reported', 'screening_concluded',
    'reverification_started', 'relationship_closed', 'flow_expired', 'flow_stuck');

  CREATE TABLE flow_event (              -- append-only; nothing here is ever updated
    client_id      uuid NOT NULL REFERENCES client(id),
    flow_id        uuid NOT NULL,
    seq            int  NOT NULL,        -- per-flow order
    type           flow_event_type NOT NULL,
    payload        jsonb NOT NULL,       -- the round, the list, the verdict, and the
                                         -- provider and policy_version its translator
                                         -- stamped — HOW the person was checked
    client_visible boolean NOT NULL DEFAULT false,  -- the outbox, as a predicate
    event_id       uuid NOT NULL UNIQUE, -- the client's dedup key; SAME on every replay
    at             timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (flow_id, seq)
  );

  -- The relay's whole queue, and why no outbox table is needed:
  CREATE INDEX flow_event_publishable ON flow_event (flow_id, seq)
    WHERE client_visible;
  -- Partial, so the relay's cost tracks events the client is owed rather than the log's
  -- size. Without it the relay scans a table that only grows (dive 1).

  -- client_visible is set by the code path that APPENDS, never by the relay. The relay
  -- holds no policy — only a cursor — so a labelling mistake is one review away from the
  -- business decision it actually is, instead of hidden in delivery code (dive 1).

  -- The append IS the optimistic check. A writer inserts at the seq it read, so a second
  -- writer working from the same read collides on the primary key and rolls back — no
  -- version column, and no lost update.

  ```
- **Inbox** — One row per ingress, inserted in the same transaction as the effect it causes, keyed on the sender's own identifier. It is v3's signature table: a client create, a vendor callback and a single member of a 500-person batch all dedup through it, because three mechanisms for one property is three places to get it wrong.

  ```sql summary="schema — inbox"
  CREATE TABLE inbox (
    client_id   uuid NOT NULL REFERENCES client(id),
    flow_id     uuid NOT NULL,
    step        text NOT NULL,   -- 'create' | 'idv' | 'screen:ofac' | 'screen:ofac#batch'
    sender_ref  text NOT NULL,   -- the SENDER's id: the vendor's requestId, the batch
                                 -- member key, the client's Idempotency-Key
    received_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (flow_id, step, sender_ref)
  );

  -- Whichever copy commits first wins; the loser hits the constraint and rolls back its
  -- WHOLE transaction, append included. Arrival order stops mattering — which is the
  -- point, because a vendor's duplicate can arrive before this system has written
  -- anything of its own to collide with (dive 2).

  -- A batch result gets ONE ROW PER MEMBER, not one per batch. A batch is a transport
  -- optimisation and never a unit of failure, so a redelivered batch of 500 whose first
  -- 300 members already applied must apply the remaining 200 and skip the 300 (dive 2).

  ```
- **DeliveryCursor** — One lane per flow, and the reason two results cannot arrive out of order. The relay claims a flow rather than an event and sends only the next sequence that flow owes, so a lane in backoff blocks itself and nothing else.

  ```sql summary="schema — delivery_cursor"
  CREATE TABLE delivery_cursor (
    client_id     uuid NOT NULL REFERENCES client(id),
    flow_id       uuid PRIMARY KEY,
    delivered_seq int NOT NULL DEFAULT 0,  -- last seq this client has 2xx'd
    attempts      int NOT NULL DEFAULT 0,
    max_attempts  int NOT NULL DEFAULT 8,  -- ~24h of backoff, then the lane dead-letters
    last_error    text,
    run_after     timestamptz NOT NULL DEFAULT now(),
    lease_until   timestamptz,             -- a relay replica holds the lane while sending
    dead_at       timestamptz              -- alerted; /events/replay is the way back
  );

  -- The relay claims ONE flow, reads the lowest client_visible event above delivered_seq,
  -- sends it, and advances only on a 2xx. So a later 'clear' physically cannot overtake
  -- the 'sanctioned' ahead of it — which a shared queue of events drained by N dispatchers
  -- cannot promise however careful its consumers are (dive 2).
  -- Claiming per flow also claims per tenant, so one dead endpoint holds one lane rather
  -- than the pool.
  -- REPLAY sets delivered_seq backwards. It is a write to this row and nothing else: the
  -- events are still in the log, so there is no pruned queue to reconstruct (dive 1).

  ```
- **IdempotencyKey** — The client's own retry guard, stored per tenant and endpoint. The request hash is what stops a client serving itself the answer to a different question when it reuses a key by accident.

  ```sql summary="schema — idempotency_key"
  CREATE TABLE idempotency_key (
    client_id    uuid NOT NULL REFERENCES client(id),
    endpoint     text NOT NULL,
    key          text NOT NULL,      -- the client's UUID, opaque to us, never parsed
    request_hash bytea NOT NULL,     -- same key + different body → 422, not a wrong replay
    response     jsonb,              -- NULL while in flight; the stored 202 once complete
    expires_at   timestamptz NOT NULL,
    PRIMARY KEY (client_id, endpoint, key)
  );
  -- Scoped per tenant, so one client's key cannot collide with another's. The stored
  -- response is what makes the retry a REPLAY rather than a second execution — returning
  -- 200 without the body would leave the client unable to learn the flow id it created.

  ```

### Work, clocks and recovery — operational Postgres {#entities-group-2}

- **Task** — The queue, and every operational fact the log refuses to carry: attempts, the budget that bounds them, the lease, the deadline and the last error. Its own `id` is the third dedup key — a claim is unique because the row is claimed, not because anyone issued a token for it.

  ```sql summary="schema — task"
  CREATE TABLE task (                  -- ALL operational state; none of it reaches the log
    id           bigserial PRIMARY KEY, -- the claim's identity, and the email key's seed
    client_id    uuid NOT NULL REFERENCES client(id),
    flow_id      uuid NOT NULL,
    kind         text NOT NULL,        -- send_invite | verify_id | screen_list | deliver
    class        text NOT NULL,        -- 'live' | 'recheck' — the reserved-capacity split
    args         jsonb NOT NULL,       -- the round, the list, the batch's member ids
    status       text NOT NULL DEFAULT 'pending',  -- pending | processing | done | dead
    attempts     int  NOT NULL DEFAULT 0,
    max_attempts int  NOT NULL DEFAULT 8,  -- the budget; without it, poison retries forever
    last_error   text,                  -- what an operator actually opens a dead task to read
    deadline_at  timestamptz NOT NULL,  -- THIS attempt's own deadline
    run_after    timestamptz NOT NULL DEFAULT now(),  -- backoff WITH jitter lands here
    locked_by    text,
    lease_until  timestamptz,           -- renewed by a live worker; expiry is the sweeper's case
    dead_at      timestamptz            -- parked, alerted, re-runnable once the cause is fixed
  );

  CREATE INDEX task_claimable ON task (class, run_after) WHERE status = 'pending';
  -- Day-one furniture: ~45 claim queries/s run against this predicate, and without the
  -- index each one scans a growing prefix of completed rows.

  -- A vendor call is marked done only when its CALLBACK lands, not when it is dispatched.
  -- So a worker that dies after calling the vendor loses its lease and the row is
  -- re-claimed; the retry's duplicate callback then collides in the inbox rather than
  -- applying twice. The two mechanisms are one story (dive 3).
  -- deadline_at is the answer to a vendor that ACCEPTS the call and goes silent: there is
  -- no event to react to, so the only thing that can notice is a clock we own.

  ```
- **ScreeningRound** — The fan-in tally: one row per list per round, counted within the round the fan-out opened. Its verdict is three-valued so a list nobody can reach still ends, and its criticality decides what that ending costs.

  ```sql summary="schema — screening_round"
  CREATE TABLE screening_round (
    client_id   uuid NOT NULL REFERENCES client(id),
    flow_id     uuid NOT NULL,
    round       int  NOT NULL,   -- issued by the screening_started event that opened it
    list        text NOT NULL,   -- one row per list the jurisdiction requires
    criticality text NOT NULL,   -- 'blocking' | 'advisory', copied from the config store
    verdict     text,            -- NULL while pending; hit | clear | unavailable
    deadline_at timestamptz NOT NULL,   -- per-leg, so a silent vendor is a breach not a hang
    PRIMARY KEY (flow_id, round, list)
  );

  -- The collector's read names the round explicitly — never max(round), which races:
  --   SELECT count(*) FILTER (WHERE verdict IS NULL) FROM screening_round
  --   WHERE flow_id = $flow AND round = $round;
  -- Zero remaining is the only thing that appends screening_concluded.

  -- 'unavailable' is what makes that count REACHABLE. A two-valued leg has no terminal
  -- except an answer, so a vendor's permanent failure becomes our permanent stall and the
  -- only exit is expiring a flow that was never the person's fault. The sweeper stamps
  -- 'unavailable' when a leg's task exhausts max_attempts, so a round concludes when every
  -- leg is TERMINAL rather than when every leg has ANSWERED (dive 3).

  ```

### State and the lifecycle clocks — operational Postgres {#entities-group-3}

- **Flow** — Current state, folded forward in the same transaction as the append that moves it, so it can never lag the log and can be rebuilt from it. Its `state_due_at` is the sweeper's predicate and therefore the reason no state can be occupied indefinitely.

  ```sql summary="schema — flow"
  -- Nine states: four in flight, four verdict terminals, one abandoned terminal.
  CREATE TYPE flow_state AS ENUM (
    'initiated', 'awaiting_submission', 'awaiting_id_verification', 'awaiting_screening',
    'clear', 'cleared_with_caveat', 'sanctioned', 'invalid_id',
    'expired');
  -- 'cleared_with_caveat' is a terminal because the client acts on it differently: every
  -- BLOCKING list reported, and at least one ADVISORY list could not be reached. Folding
  -- it into 'clear' hands the client a clean answer we never had.

  CREATE TABLE flow (                    -- a PROJECTION: rebuildable, never written alone
    id           uuid PRIMARY KEY,
    client_id    uuid NOT NULL REFERENCES client(id),
    person_ref   uuid NOT NULL,          -- opaque ref into the vault
    email_mac    bytea NOT NULL,         -- HMAC under a per-region key erasure destroys
    state        flow_state NOT NULL DEFAULT 'initiated',
    last_seq     int NOT NULL DEFAULT 0, -- how far this projection has folded
    state_due_at timestamptz             -- EVERY in-flight state sets one. No exceptions.
  );

  CREATE UNIQUE INDEX one_open_flow ON flow (client_id, email_mac)
    WHERE state NOT IN ('clear', 'cleared_with_caveat', 'sanctioned', 'invalid_id',
                        'expired');
  CREATE INDEX flow_overdue ON flow (state_due_at) WHERE state_due_at IS NOT NULL;
  -- The sweeper's index. A state with a NULL due date is a terminal; anything in flight
  -- without one is a flow nothing is watching, which this design does not permit (dive 3).

  -- Re-SCREENING does not touch state: the flow stays 'clear' while its round runs and
  -- flips only when the round concludes, so a recheck can never make a concluded flow look
  -- open to a client asking to start a new one.

  ```
- **PersonRelationship** — What the recurring obligations hang off, and the only thing that ever ends them. Retention counts from `closed_at`, which is why an object-store lifecycle rule cannot be the retention policy.

  ```sql summary="schema — person_relationship"
  CREATE TABLE person_relationship (
    client_id       uuid NOT NULL REFERENCES client(id),
    person_ref      uuid NOT NULL,
    opened_at       timestamptz NOT NULL,
    closed_at       timestamptz,          -- set by the client; ends every recurring obligation
    rescreen_due_at timestamptz,          -- NULLed on close, so the clock stops finding the row
    reverify_due_at timestamptz,          -- likewise
    retain_until    timestamptz,          -- computed FROM closed_at, not from the check
    PRIMARY KEY (client_id, person_ref)
  );
  -- Nulling the two due dates on close is the whole termination rule. Without it the book
  -- only grows: the system keeps buying quarterly screens on ex-customers, and keeps
  -- processing their data with no live lawful basis.
  -- The bucket's lifecycle rule expires by OBJECT AGE and so can only ever be a backstop
  -- for orphaned blobs — never the policy (dive 6).

  ```
- **MagicLinkKey** — The onboardee's whole identity: a single-use invite key with a 48-hour expiry, spent when the document lands rather than when the form posts. Redeeming it is a conditional write judged by rowcount, so two concurrent redemptions cannot both win.

  ```sql summary="schema — magic_link_key"
  CREATE TABLE magic_link_key (
    key_hash       bytea PRIMARY KEY,  -- SHA-256 of a 256-bit CSPRNG token; never the token
    client_id      uuid NOT NULL REFERENCES client(id),
    flow_id        uuid NOT NULL,
    expires_at     timestamptz NOT NULL,  -- issued_at + 48h; a predicate, not a store TTL
    spent_at       timestamptz,           -- set when the DOCUMENT lands, not at submit
    invalidated_at timestamptz            -- superseded by a resend: a different fact from spent
  );

  -- Redemption is a conditional write checked by rowcount, never a read-then-write:
  --   UPDATE magic_link_key SET … WHERE key_hash = $h
  --     AND spent_at IS NULL AND invalidated_at IS NULL AND expires_at > now();
  -- Zero rows updated tells expired from forged from already-spent, which is three
  -- different messages for the onboardee and one alarm for us.

  ```

### Tenancy, evidence and governance {#entities-group-4}

- **Client** — The tenant, and the region its data may never leave. Its row also fixes how every other table is protected: the application connects as a non-owner role so `FORCE ROW LEVEL SECURITY` actually binds it.

  ```sql summary="schema — client"
  CREATE TABLE client (
    id                 uuid PRIMARY KEY,
    region             text NOT NULL,    -- recorded at onboarding; PII and documents stay in it
    webhook_url        text NOT NULL,
    webhook_secret_ref text NOT NULL     -- points into the secret store, never the secret
    -- … name, timestamps …
  );

  -- The same three lines go on EVERY client-scoped table, which is why every one of them
  -- carries client_id. FORCE matters: without it the table owner bypasses its own policy.
  ALTER TABLE flow_event ENABLE ROW LEVEL SECURITY;
  ALTER TABLE flow_event FORCE  ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON flow_event
    USING (client_id = current_setting('app.client_id')::uuid);

  -- SET LOCAL, never SET: the setting dies with the transaction, so a pooled connection
  -- cannot carry one tenant's identity into the next checkout.
  -- The worker fleet, the relay and the sweeper all claim ACROSS tenants and so cannot run
  -- under this policy. They run as a separate, separately audited principal — an exemption
  -- stated here rather than discovered during an incident (dive 7).

  ```
- **Person** — Email and submitted personal data, sealed under a per-person envelope key. It lives in the vault, is referenced only by id, and erasure destroys the key rather than the row.

  ```sql summary="schema — person"
  -- In the encrypted vault: a separate store, its own credentials, one per region.
  CREATE TABLE person (
    id             uuid PRIMARY KEY,     -- the person_ref the operational store carries
    client_id      uuid NOT NULL,
    encrypted_data bytea NOT NULL,       -- email + submitted personal data, sealed as one blob
    key_id         text  NOT NULL        -- per-person envelope key, held by the key manager
  );
  -- Erasure destroys the key named by key_id and the blob becomes noise — including the
  -- copies in backups, which no DELETE reaches without restoring and rewriting them.
  -- The operational store keeps email_mac, not a plain hash: an email is low-entropy and
  -- enumerable, so an unkeyed digest of one is a dictionary away from re-identifying the
  -- person the erasure was supposed to protect (dive 6).

  ```
- **Document** — The photo's metadata row is written before the upload URL is issued, so a failed upload leaves a visible stub rather than an orphan blob nothing references. `presigns` is what stops the re-issue endpoint becoming a signing oracle.

  ```sql summary="schema — document"
  CREATE TABLE document (
    id          uuid PRIMARY KEY,
    client_id   uuid NOT NULL REFERENCES client(id),
    person_ref  uuid NOT NULL,
    storage_key text NOT NULL,      -- row FIRST, then the presigned URL → no orphan blobs
    presigns    int  NOT NULL DEFAULT 1,  -- bounded re-issues; the resend path reads it
    uploaded_at timestamptz         -- NULL = never completed; the sweeper offers a fresh URL
  );
  -- The URL is signed only after this row commits, so a rolled-back submission cannot leave
  -- a live URL pointing at a key nothing references.

  ```
- **VerificationSession** — One vendor verification of one document. It carries the document's expiry date, which is the single value the re-verification clock reads — an identity that expires is a re-check the system owes, not a fact that quietly goes stale.

  ```sql summary="schema — verification_session"
  CREATE TABLE verification_session (
    id             uuid PRIMARY KEY,
    client_id      uuid NOT NULL REFERENCES client(id),
    flow_id        uuid NOT NULL,
    document_id    uuid NOT NULL REFERENCES document(id),
    result         text,            -- NULL while the vendor works
    doc_expires_on date             -- what person_relationship.reverify_due_at is set from
    -- … provider, timestamps …
  );
  -- result stays NULL until the vendor's callback lands, because a session is completed by
  -- the answer arriving and never by the call being dispatched.

  ```
- **AuditLog** — The only evidence behind "every access to personal data is recorded". It references the opaque `person_ref` and therefore outlives erasure, which is the point: the record that someone read the data has to survive the data.

  ```sql summary="schema — audit_log"
  CREATE TABLE audit_log (         -- append-only; never carries the data it describes
    id         bigserial PRIMARY KEY,
    client_id  uuid NOT NULL REFERENCES client(id),
    person_ref uuid NOT NULL,      -- the opaque ref, never a name or an email
    actor      text NOT NULL,      -- operator id, or the service principal that read
    purpose    text NOT NULL,      -- 'dashboard_view' | 'idv_submit' | 'audit_export'
    at         timestamptz NOT NULL DEFAULT now()
  );
  -- Kept on the retention clock, not the erasure one. Destroying the papertrail alongside
  -- the person would erase the only proof the erasure happened.

  ```

## The interface — API design
<!--meta block=interface-->

Every contract below states three things: what it guarantees, which key makes a repeat safe, and what it answers when the system cannot keep the promise. State-changing client calls return `202` because the work is recorded durably and done afterwards; the onboardee's submission is the one `201`, carrying the upload URL it just created. There is no single idempotency mechanism, because each boundary carries the guard held by whichever side can actually see the duplicate. Admission control is part of the contract rather than an incident: when a workload class's oldest pending item passes its ceiling, `POST /flows` answers `429` with a `Retry-After`.

### Client API — tenant API key or dashboard session {#interface-group-1}

- **`POST /flows`** — Start a flow from an email. Two guards against two different duplicates: the stored `Idempotency-Key` absorbs the client's network retry, and `one_open_flow` absorbs a genuinely repeated invite.

  ```http summary=contract
  POST /flows
  Idempotency-Key: 7c9e-4b1a-…                 client-generated UUID, opaque to us
  {
    "email": "jane@example.com"                the verdict goes to the client's registered
  }                                            webhook_url — not a per-flow callback

  202 Accepted
  { "flowId": "flow_9c31", "state": "initiated", "seq": 1 }

  # Guarantee: at most one flow per accepted create, and the id is durable before you see it.
  # Key: the stored Idempotency-Key, plus an inbox row on (flow, 'create', key).
  # Same key, completed  → the stored 202 replayed byte-identical.
  # Same key, in flight  → 409 Conflict + Retry-After — never a second execution.
  # Same key, other body → 422: the request_hash mismatch stops a client serving itself the
  #                        answer to a different question.
  # DIFFERENT key, same email → 200 with the EXISTING open flow, per one_open_flow.

  429 Too Many Requests    Retry-After: 900
  # Admission control, and a different thing from the rate limit beside it: the live class's
  # oldest pending task is past its age ceiling, so the system refuses work it cannot drain
  # rather than queueing it out of sight (dive 4).
  ```
- **`POST /flows/{id}/events/replay`** — Rewind the flow's delivery lane and re-emit from the record. This is the recovery path that replaces polling, and it takes no idempotency key because every event it re-sends already carries the identifiers that make a repeat safe.

  ```http summary=contract
  POST /flows/flow_9c31/events/replay
  { "fromSeq": 0 }                             default: the last client-visible event only

  202 Accepted
  # Guarantee: the SAME eventIds, in the SAME seq order, however many times you ask.
  # Mechanism: one UPDATE to delivery_cursor.delivered_seq, and the relay walks forward.
  # Because the log is the source there is no pruned queue to reconstruct — which is the
  # concrete thing a separate outbox table would have cost here (dive 1).
  # Rate-limited per flow: replay is the one client-triggered write that can multiply
  # outbound work, so it is metered like any other amplifier.

  409 Conflict  { "error": "delivery lane dead" }   clear the dead lane first
  ```
- **`POST /flows/{id}/invite/resend`** — Invalidate prior keys and issue one fresh single-use link with a new 48-hour expiry. This is the call that most needs the stored key: a retried resend would otherwise invalidate the link it just issued and send a second email.

  ```http summary=contract
  POST /flows/flow_9c31/invite/resend
  Idempotency-Key: b41f-90ac-…                 without it, a retry invites twice

  202 Accepted
  # Prior keys are stamped invalidated_at, ONE fresh key is issued, and the email leaves as
  # a task whose idempotency key is built from the task row's id — so attempt two presents
  # attempt one's key and the vendor collapses them (dive 2).
  # Reachable by the onboardee from the expired-link page as well as by the client, which is
  # why it sits behind a per-flow limit and spends nothing but a token.

  409 Conflict  { "error": "already submitted" }   nothing left to invite
  ```
- **`POST /persons/{ref}/relationship:close`** — The client says the relationship ended, and every recurring obligation for that person stops. This is the cheapest lever on the whole vendor bill and the only thing that bounds the recurring book.

  ```http summary=contract
  POST /persons/prs_44f1/relationship:close
  Idempotency-Key: 3ac0-…

  202 Accepted
  { "closedAt": "2026-08-01T…", "retainUntil": "2031-08-01" }

  # One transaction: append relationship_closed, NULL rescreen_due_at and reverify_due_at so
  # both clocks stop finding the row, and set retain_until from now() on the jurisdiction's
  # schedule. Retention counts from HERE, not from the last check (dive 6).
  # Idempotent by construction — closing a closed relationship changes nothing — so the key
  # is belt to the braces rather than the guard.
  ```
- **`DELETE /persons/{ref}`** — Right-to-forget, executed as key destruction rather than a delete anyone has to be trusted to have run. It is gated, because erasure cannot outrank a live retention obligation.

  ```http summary=contract
  DELETE /persons/prs_44f1

  202 Accepted   { "erasedAt": "…" }         envelope key and email_mac key destroyed

  409 Conflict   { "error": "retention active", "until": "2031-04-01", "queued": true }
  # The request is not refused, it is scheduled: erasure runs the moment the obligation
  # lapses, and the 409 carries the date so the client can answer their data subject with
  # one rather than an apology.
  # What survives, by design: flow_event and audit_log, both of which reference person_ref
  # and never the data itself (dive 6).
  ```

### Onboardee — possession of a single-use link, and no account at all {#interface-group-1b}

- **`POST /submissions`** — The onboardee submits personal information against the magic-link session and receives a presigned URL for the photo. The link is deliberately not spent here — it is spent when the document actually lands.

  ```http summary=contract
  POST /submissions
  Authorization: Bearer <magic-link token>    hash looked up; expiry and single-use checked
  { "personalInfo": { … } }

  201 Created
  { "documentId": "doc_71a",
    "uploadUrl": "https://blob.example/id-photos/…?sig=…",   scoped to one key, 15 minutes
    "expiresIn": 900 }

  # spent_at stays NULL. Spending the link here is what turns a failed 2 MB upload on a
  # phone into a support ticket, and this design refuses to build that.
  # A failed PUT is recoverable at the next endpoint, which is why nothing is spent here.
  # The browser PUTs straight to object storage; bytes never transit this API.

  410 Gone   { "error": "link expired", "resend": "/invite/resend?flow=flow_9c31" }
  ```
- **`POST /submissions/{documentId}/upload-url`** — Hand out a fresh presigned URL when the first PUT never landed. A 2 MB photo over a phone connection fails often enough that a flow with no way back has chosen to manufacture support tickets — so the way back is an endpoint, and it costs the onboardee nothing they are still holding.

  ```http summary=contract
  POST /submissions/doc_71a/upload-url
  Authorization: Bearer <magic-link token>    still valid — the submit did not spend it

  201 Created  { "uploadUrl": "…", "expiresIn": 900 }
  # document.presigns bounds how often this may be asked, so the endpoint cannot be worked
  # into a signing oracle. Past the bound the answer is /invite/resend: a whole new link,
  # never another URL hung off a spent one.

  409 Conflict  { "error": "already uploaded" }   uploaded_at is set — there is nothing to re-issue
  ```

### Inbound vendor callbacks — a provider signature, deduped at the boundary {#interface-group-2}

- **`POST /callbacks/idv`** — The identity vendor reports. The inbox row and the append it causes share one transaction, so a duplicate that arrives before this system has written anything still collides.

  ```http summary=contract
  POST /callbacks/idv
  X-Provider-Signature: …                      verified before the body is parsed
  { "requestId": "idv_88c2", "flowId": "flow_9c31",
    "result": "pass", "docExpiresOn": "2031-02-14" }

  204 No Content
  # Guarantee: applied exactly once in effect, whatever the vendor's retry policy.
  # Key: the VENDOR's requestId, in the inbox on (flow_id, 'idv', requestId).
  # One transaction, five facts: the inbox row, the flow_event append at the seq we read,
  # the screening fan-out tasks, the projection fold, and the task marked done. The
  # duplicate loses on the inbox constraint and takes its whole transaction with it (dive 2).
  # The task is completed HERE, on the callback — not when the call was dispatched — which
  # is what makes a worker crash cost time rather than a fact (dive 3).

  409 Conflict   already applied — the vendor may stop retrying
  ```
- **`POST /callbacks/screening`** — One sanction list reports one leg of one round. The round is echoed from the request the system sent and never recomputed here, because recomputing it is how a re-screen concludes on last quarter's answers.

  ```http summary=contract
  POST /callbacks/screening
  X-Provider-Signature: …
  { "requestId": "scr_31f", "flowId": "flow_9c31",
    "round": 4, "list": "ofac", "verdict": "clear" }

  204 No Content
  # round selects the screening_round row directly. Only the leg that then finds zero
  # verdicts still NULL WITHIN ITS OWN ROUND appends screening_concluded, so a partial
  # verdict cannot ship.
  # A leg the sweeper already stamped 'unavailable' is terminal, so a dead list vendor ends
  # its own leg instead of stalling every flow in the jurisdiction behind it (dive 3).

  # The batch variant, used by the recurring book:
  POST /callbacks/screening:batch
  { "requestId": "scr_b902", "list": "ofac", "round": 4,
    "results": [ { "flowId": "flow_9c31", "verdict": "clear" }, … ] }
  # ONE INBOX ROW PER MEMBER, keyed (flow_id, 'screen:ofac', requestId), and one
  # transaction per member. A redelivered batch whose first 300 members already applied
  # applies the remaining 200 and skips the 300; a member the vendor could not adjudicate
  # dead-letters its own leg while the other 499 commit. The batch is a transport
  # optimisation and never a unit of failure (dive 4).
  ```

### Outbound webhook — signed by us, dedup owed by them {#interface-group-3}

- **`POST {webhookUrl}`** — Every client-visible event, in the order the flow produced it. Two guarantees that are commonly conflated: `eventId` makes a repeat recognisable, and `seq` makes the order recognisable. The client's own dedup is the last boundary, and it is outside this system.

  ```http summary=contract
  POST {webhookUrl}
  X-Signature: sha256=…                        HMAC over the raw body, key from webhook_secret_ref
  X-Event-Id:  5f2a-…                          stable across every redelivery AND every replay
  {
    "eventId":    "5f2a-…",
    "flowId":     "flow_9c31",
    "seq":        11,                          monotonic per flow, no gaps in what we send
    "type":       "screening_concluded",
    "verdict":    "sanctioned",
    "occurredAt": "…"
  }

  # WHAT YOU MUST DO, and we cannot do for you:
  #   1. Treat a repeated eventId as a repeat. Apply once.
  #   2. Discard any seq lower than the highest you have applied for that flow.
  # Delivery is at-least-once. We make a duplicate RECOGNISABLE; only your side can make it
  # HARMLESS (dive 2).
  #
  # 8 attempts on exponential backoff with jitter over ~24h, then the lane is dead-lettered
  # and an operator is paged; /events/replay is the way back.
  # One lane per flow, so a dead endpoint stalls its own tenant and nobody else's, and a
  # later 'clear' cannot overtake the 'sanctioned' in front of it (dive 2).
  ```

### Dashboard and audit reads — the tenant's session, under row-level security {#interface-group-4}

- **`GET /flows/{id}/events`** — The step-by-step view, read straight off the record. The auditor's export and this screen are the same query with different pagination, which is the whole point of the log being the record rather than a copy of it.

  ```http summary=contract
  GET /flows/flow_9c31/events

  200 OK
  {
    "flowId": "flow_9c31", "state": "clear", "lastSeq": 11, "deliveredSeq": 11,
    "events": [
      { "seq": 1,  "type": "flow_created",        "at": "…" },
      { "seq": 5,  "type": "idv_passed",          "at": "…" },
      { "seq": 9,  "type": "list_reported",       "at": "…", "list": "ofac" },
      { "seq": 11, "type": "screening_concluded", "at": "…", "verdict": "clear" }
    ]
  }
  # deliveredSeq is here on purpose: "did you send it" and "did they take it" are different
  # questions, and support answers the second one far more often.
  # Reads are by primary key; the list variant pages by cursor for triage. No free-text
  # search — the dashboard asks "show me this flow", never "find flows matching".
  # Personal fields render only through the vault, and each render appends an audit_log row.
  ```

## How the system is built
<!--meta block=architecture-->

One door faces the internet and one transaction carries every fact. A client create, an onboardee submission and a vendor callback all enter through the Identification API, and each commits the same five things together: the inbox row that makes the ingress unrepeatable, the append that records what happened, the projection fold that moves current state, the follow-up tasks, and the completion of whatever task caused it.

Nothing is published by a second write, because the append itself is the publish queue — a delivery relay walks each flow's own sequence and pushes signed webhooks. Every wait is a durable row rather than a held connection, and every row carries a clock, so a worker crash, a silent vendor and an eight-hour backlog arrive at the same sweep by three different routes.

```mermaid caption="The happy path, and the boundary that makes it safe. Steps 2 to 4 are one commit, so an ingress that is recorded is an ingress that has taken effect; step 8 reads the same rows step 3 wrote, which is why there is no outbox table on this board."
flowchart TB
    Client["Client"]:::ext
    Edge["Identification API · gatekeeper — auth, limits, 429"]
    subgraph Txn["One transaction — nothing here can half-happen"]
        Inbox[("inbox — keyed by the SENDER")]
        Log[("flow_event — the record IS the outbox")]
        Proj[("flow · screening_round · task")]
    end
    Workers["Worker pools + schedulers — leased, deadlined"]
    Relay["Delivery relay — one lane per flow"]
    Vendors["IDV · sanction lists · email"]:::ext
    Client -->|"1 create — Idempotency-Key"| Edge
    Edge -->|"2 dedup the ingress"| Inbox
    Inbox -->|"3 append the fact"| Log
    Log -->|"4 fold state, enqueue work"| Proj
    Proj -->|"5 claim under a lease"| Workers
    Workers -->|"6 call under breaker + deadline"| Vendors
    Vendors -->|"7 signed callback — re-enters at 2"| Edge
    Log -->|"8 next seq this flow owes"| Relay
    Relay -->|"9 signed webhook — eventId + seq"| Client
    classDef ext stroke-dasharray:4 4;
```

```mermaid caption="The same path in time, with the three failures that actually happen drawn in: a worker dying mid-call, a vendor duplicating its callback, and a client endpoint refusing a delivery. None of them changes what the client eventually holds." wide=true
sequenceDiagram
    autonumber
    participant C as Client
    participant API as Identification API
    participant PG as Postgres — log + inbox + tasks
    participant W as Screening worker
    participant V as Sanction list
    participant R as Delivery relay
    C->>API: POST /flows (Idempotency-Key)
    API->>PG: BEGIN · inbox('create') · append · fold · task
    PG-->>API: COMMIT
    API-->>C: 202 { flowId, seq 1 }
    W->>PG: claim task — lease 60s, deadline 4h
    W->>V: screen(round 4, list ofac)
    Note over W,V: worker dies here — lease expires, task re-claimed
    V-->>API: callback (requestId scr_31f)
    API->>PG: BEGIN · inbox('screen:ofac', scr_31f) · append · fold · task done
    PG-->>API: COMMIT
    V-->>API: DUPLICATE callback (same requestId)
    API->>PG: BEGIN · inbox insert
    PG-->>API: unique violation — ROLLBACK, append included
    API-->>V: 409 already applied
    R->>PG: claim flow lane where delivered_seq < max client_visible seq
    R->>C: POST webhook { eventId, seq 11 }
    C-->>R: 502
    R->>PG: attempts++, run_after = now + backoff·jitter
    R->>C: POST webhook { SAME eventId, SAME seq 11 }
    C-->>R: 200
    R->>PG: delivered_seq = 11
```

```mermaid caption="The whole machine on one board, connections numbered in flow order: 1–13 intake and submission, 14–21 the vendor legs, 22–27 conclusion and ordered delivery, 28–33 recovery and the clocks, 34–36 the health-to-weights control loop, 37–42 replication, erasure, dedup keys, the audit trail and dashboard reads. Every box is argued somewhere above; this board exists to track a flow across all of them at once." wide=true
flowchart TB
    Client["Client — API keys · webhook consumer"]:::ext
    Person["Onboardee — magic link"]:::ext
    EmailV["Email provider"]:::ext
    IDV["ID-verification vendor"]:::ext
    IDVB["Fallback IDV vendor"]:::ext
    Lists["Sanction-list vendors, one per list"]:::ext

    subgraph Sec["Security edge — one door"]
        API["Identification API — per-caller auth · rate limiter · admission 429 + Retry-After"]
    end

    subgraph PG["Postgres primary — one commit per ingress"]
        Inbox[("inbox — dedup on the sender's own key")]
        Log[("flow_event log — the record IS the outbox")]
        Proj[("projections — flow · screening_round · person_relationship")]
        Tasks[("task queue — SKIP LOCKED · lease_until · max_attempts")]
        DLQ[("dead-letter park — alerted · re-runnable")]
        Cursor[("delivery_cursor — one ordered lane per flow")]
        Keys[("idempotency_key · magic_link_key — request and link dedup, hashes only")]
        Audit[("audit_log — every PII access: who, when, why")]
    end
    Standby[("sync standby — CP failover")]

    subgraph PIIP["PII plane — separate credentials"]
        Vault[("encrypted PII vault")]
        KeyMgr["key manager — envelope keys · erasure by key destruction"]
        Docs[("object store — presigned documents")]
    end

    subgraph Coord["Coordination plane"]
        Cache[("cache — breaker state · provider weights · rate counters · scheduler leases")]
        Config[("config store — list roster · criticality · cadences · quotas")]
    end

    subgraph Fleet["Worker fleet — one bulkhead pool per vendor"]
        MailPool["email pool"]
        IDVPool["IDV pool — ACL translator stamps provider + policy_version"]
        SanPool["sanctions pools — ACL · batch 500 per call"]
        Collector["round collector — concludes on all legs TERMINAL"]
    end

    subgraph Sched["Schedulers — leased singletons"]
        Sweeper["sweeper — enforces every deadline · stamps unavailable · escalates · retention sweep"]
        Clocks["recheck + ID-expiry clocks"]
    end

    Relay["delivery relay — walks the log behind the cursor"]

    subgraph Obs["Observability — ids only, never PII"]
        Metrics["metrics + alarms — oldest-task age · deadline breaches · dead > 0 · lanes in backoff"]
        WCtl["weight controller — vendor error rate moves fallback weights · operator pin wins"]
    end

    Client -->|"1 create — Idempotency-Key"| API
    API -->|"2 ingress row"| Inbox
    Inbox -->|"3 append the fact"| Log
    Log -->|"4 fold state"| Proj
    Proj -->|"5 spawn work"| Tasks
    Tasks -->|"6 lease invite task"| MailPool
    MailPool -->|"7 send single-use link"| EmailV
    EmailV -->|"8 invite"| Person
    Person -->|"9 submit PII + document — link spent by rowcount"| API
    API -->|"10 envelope key"| KeyMgr
    API -->|"11 encrypted PII"| Vault
    API -->|"12 presigned upload"| Docs
    API -->|"13 record submission — re-enters 2 to 5"| Inbox
    Tasks -->|"14 lease verify task — deadline_at"| IDVPool
    IDVPool -->|"15 breaker + weight gate"| Cache
    IDVPool -->|"16 verify call under deadline"| IDV
    IDVPool -->|"17 weighted fallback when the breaker opens"| IDVB
    IDV -->|"18 signed callback — dedups at 2"| API
    Tasks -->|"19 lease screening legs — one per list"| SanPool
    SanPool -->|"20 screen — batched on recheck"| Lists
    Lists -->|"21 signed callbacks — three-valued verdicts"| API
    Proj -->|"22 all legs terminal this round"| Collector
    Collector -->|"23 append concluded"| Log
    Log -->|"24 next seq this flow owes"| Relay
    Relay -->|"25 signed webhook — eventId + seq"| Client
    Client -->|"26 2xx ack"| Relay
    Relay -->|"27 advance the lane"| Cursor
    Sweeper -->|"28 requeue expired leases"| Tasks
    Tasks -->|"29 attempts exhausted"| DLQ
    Sweeper -->|"30 stamp unavailable — criticality decides hold or caveat"| Proj
    Sched -->|"31 hold leases"| Cache
    Clocks -->|"32 enqueue re-screen rounds"| Tasks
    Config -->|"33 roster · criticality · cadence · quotas"| Sched
    Fleet -->|"34 error rate · latencies"| Metrics
    Metrics -->|"35 degrade a failing vendor"| WCtl
    WCtl -->|"36 write weights"| Cache
    Log -->|"37 sync replicate"| Standby
    Client -->|"38 relationship close / erasure"| API
    API -->|"39 destroy envelope key — crypto-shred"| KeyMgr
    API -->|"40 spend key or link — insert or rowcount check"| Keys
    API -->|"41 record every PII access"| Audit
    Client -->|"42 dashboard reads — tenant session, RLS-scoped"| API
    classDef ext stroke-dasharray:4 4;
```

### Components & communication {#architecture-h-components}

| Component | Role, and what it talks to |
| --- | --- |
| **API gateway + Identification API** | The only surface the internet may address. It terminates Transport Layer Security (TLS), authenticates the tenant, enforces the per-client and per-flow limits, answers `429` when a workload class is behind, and past that does one job: commit an ingress row, an append, a fold and its follow-up tasks in a single transaction. |
| **Postgres** | The log, and everything folded out of it: `flow_event`, the `flow` and `screening_round` projections, `task`, `inbox`, `delivery_cursor`, `idempotency_key` and `audit_log`. No personal data of any kind. An in-region standby acknowledges each commit synchronously, ahead of the client's response. |
| **Worker pools** | Stateless replicas, one pool per vendor, claiming with skip-locked reads and renewing a lease while they work. A pool scales on the age of its oldest pending task rather than on processor load, because a worker blocked on a vendor call reports no load at all. |
| **Schedulers** | The same fleet driven by a clock instead of a queue, each holding a lease so no second copy can run. One sweeper expires leases, dead-letters spent tasks, stamps unreachable screening legs, expires overdue flows and enforces retention; two recheck clocks re-enter concluded flows on their jurisdiction's cadence and go quiet the moment a relationship closes. |
| **Delivery relay** | Claims a flow rather than an event and sends the lowest client-visible sequence above that flow's cursor. One lane per flow is what makes ordering a property of the design instead of a hope, and its own backoff, attempt budget and dead state mirror the task table's. |
| **Coordination cache** | Breaker state, provider weights, vendor rate counters and the schedulers' leases. It is here for coordination and not for read relief: its job is that every replica sees one open circuit and one remaining quota rather than its own. |
| **Configuration store** | The per-jurisdiction list roster, each list's blocking-or-advisory criticality, the recheck cadences, the vendor quotas and the provider weights. It is separate from the cache because it fails differently: a worker that cannot reach it starts from its last cached version and refuses to start without one, since compiled-in defaults would screen against the wrong lists and report success while doing it. |
| **PII vault + key manager** | Sealed person blobs behind credentials of their own, and envelope keys the application may use but can never export. Erasure is one call that destroys a key. |
| **Object store** | Identity photos, uploaded straight from the onboardee's browser on a presigned URL. Workers pass the storage key, never the bytes. |
| **Client, onboardee and vendors** | The given externals. Two audiences with two auth models: a tenant API key or dashboard session, and possession of a single-use link for someone who has no account and should never need one. Vendor calls leave behind per-vendor pools and re-enter through the inbox. |

### Where each requirement lands — one line per functional requirement, in the requirements block's order {#architecture-h-trace}

Every path names only components drawn on the board.

**Start a flow from an email address → FR: start** {#arch-fr-1}

Client → API → Postgres: one transaction writes the create's inbox row, appends `flow_created`, folds the projection and inserts the invite task.

**The identifier comes back before any work runs → FR: identifier returned** {#arch-fr-2}

The API answers `202` out of that same commit, and every vendor call behind it is a task row a worker claims later.

**A repeated create for an open pair returns the existing flow → FR: no duplicates** {#arch-fr-3}

The `one_open_flow` partial unique index in Postgres, not application logic.

**A single-use invitation expiring after 48 hours → FR: invitation** {#arch-fr-4}

Invite task → Worker pools (email) → email vendor; only the key's hash is stored, so a database read cannot spend the link.

**A fresh link on request → FR: re-invite** {#arch-fr-5}

The resend endpoint invalidates every prior key for that flow and issues one more, behind the gateway's per-flow limit.

**Verification through the given provider → FR: verify** {#arch-fr-6}

Worker pools (IDV) → vendor; the callback re-enters at the API as an inbox row whose append shares its transaction.

**Screening runs only once verification passes → FR: screen after verify** {#arch-fr-7}

The fan-out tasks are written by the `idv_passed` append and by nothing else, which makes the ordering structural instead of a check somebody can forget to write.

**A flow concludes only once every list is terminal → FR: fan-in** {#arch-fr-8}

Worker pools write leg verdicts into `screening_round`, the Schedulers' sweeper stamps unreachable legs, and only the leg finding none outstanding in its own round appends `screening_concluded`.

**Every result reaches the client's webhook → FR: result** {#arch-fr-9}

Postgres log → Delivery relay → Client endpoint, at-least-once with a bounded budget and a dead lane at the end of it.

**A repeated delivery is recognisable → FR: recognisable repeat** {#arch-fr-10}

`event_id` lives on the log row and travels with every redelivery and every replay.

**Two results arrive in the order they were produced → FR: verdict ordering** {#arch-fr-11}

The relay reads `delivery_cursor` and sends one sequence at a time per flow.

**Every accepted flow terminates or raises an alert → FR: terminal or alert** {#arch-fr-12}

`flow.state_due_at` plus the Schedulers' sweep; a state in flight without a due date is a flow nothing is watching, which the schema does not permit.

**Failure reaches the client → FR: failure notice** {#arch-fr-13}

The Schedulers append the failure event, and it leaves by the same relay path as any result.

**Events can be re-sent on request → FR: replay** {#arch-fr-14}

API → Postgres: one write moves `delivered_seq` back, and the relay walks the log forward again with the same identifiers.

**Re-screening on each jurisdiction's cadence → FR: re-screening** {#arch-fr-15}

The recheck clock reads `person_relationship.rescreen_due_at` and opens a fresh round, leaving the flow's standing verdict where it is.

**Re-verification when a document expires → FR: re-verification** {#arch-fr-16}

The second clock re-enters at the invite, because only the person can supply a new document.

**A changed verdict is delivered like the first → FR: changed verdict** {#arch-fr-17}

The round's conclusion is an ordinary client-visible append and leaves through the same relay lane.

**Ending the relationship ends the obligations → FR: relationship close** {#arch-fr-18}

API → Postgres: one transaction appends `relationship_closed` and nulls both due dates, after which neither clock can find the row.

**Blocking and advisory lists diverge when unreachable → FR: list criticality** {#arch-fr-19}

The sweeper stamps the exhausted leg unavailable, and the collector reads that list's criticality out of the Configuration store to decide between holding the flow for a human and concluding it with the gap named in the client's event.

**Every change recorded, any history reconstructible → FR: history** {#arch-fr-20}

`flow_event` is the write itself, so the history is not a second artefact that could be missing.

**Personal data in a store of its own → FR: separate PII store** {#arch-fr-21}

The PII vault behind `person_ref` and photos in the Object store, so the operational database holds neither.

**Every access to it recorded → FR: access audit** {#arch-fr-22}

An `audit_log` row per vault read, carrying the reader, the moment and the purpose it was read for.

**Step-by-step dashboard view → FR: dashboard** {#arch-fr-23}

The dashboard reads that same log through the API, under the tenant's row-level-security session.

Concrete technology is named once, here, so the design above stays portable:

| Concern | Choice | Why, at this scale |
| --- | --- | --- |
| Log, projections, queue, inbox, cursors | **PostgreSQL** | The whole delivery guarantee is one atomicity, consistency, isolation, durability (ACID) transaction across the ingress row, the append, the fold and the follow-up tasks; skip-locked claiming makes the same table a competent queue at single-digit writes/s. A broker would trade that transaction away for throughput nobody asked for. |
| Identity photos | Any object store (S3, GCS, Azure Blob) | Cheap immutable blobs, and a presigned upload keeps the bytes off the API. The database keeps only the `storage_key`. |
| PII vault | A second PostgreSQL instance with its own credentials | Separation is the credential boundary, not the technology: a compromised API tier holds `person_ref` values rather than personal data. |
| Key custody | A managed key service or HashiCorp Vault | Envelope keys the application may use and never export, so erasure is a destroy call with a receipt rather than a delete somebody must be trusted to have run. |
| Coordination cache | Redis or equivalent | Breaker state, provider weights, vendor rate counters and scheduler leases outlive any one replica and are read on every claim; per-process copies rediscover each outage N times. |
| Configuration store | A versioned configuration service with client-side caching | The roster, criticalities, cadences and quotas change without a deploy, and the cached last-known-good version is what a worker boots from when the service is unreachable. |
| IDV, sanctions, email | The given vendors | Consumed behind per-vendor pools and one translator each; their contracts — callback or poll, rate limits, downtime — shape worker design, and their internals are out of scope. |
| Auth | The given internal auth service (clients); magic-link sessions (onboardees) built here | The given service covers tenant API keys and dashboard single sign-on (SSO). The onboardee has no account, so their session is possession of a single-use link. |
| Observability | OpenTelemetry + a metrics store (Prometheus or equivalent) | Correlation on flow id; the per-vendor error rate feeds the alarm and the provider weights from one series. |
| Message broker, workflow engine | Not yet — a managed queue and a durable-workflow engine at the exits | Adopted on the measured triggers Right-sizing names: task-table churn at roughly sustained 100k flows/day, and flow variants multiplying. The log survives both moves untouched. |

{#architecture-table-1}

**On AWS.** One concrete mapping of that same table, for orientation — every row below is replaceable by the capability it sits next to:

| Board component | AWS service | Why it fits |
| --- | --- | --- |
| API gateway · rate limiter | **Amazon API Gateway** (+ AWS Web Application Firewall (WAF)) | TLS termination, tenant API keys, per-client throttling and usage plans; web application firewall (WAF) in front of the only public surface. |
| Identification API · worker pools · delivery relay | **ECS on Fargate** — one service per pool | Stateless replicas with no hosts to patch, and a separate service per vendor pool is the bulkhead, scaled independently on queue age. |
| Postgres — log, projections, queue, inbox, cursors | **Amazon RDS for PostgreSQL** or Aurora PostgreSQL, Multi-AZ | Single-writer ACID transactions; skip-locked claiming works as-is; a synchronous standby gives the failover the consistency, availability, partition tolerance (CAP) stance assumes. |
| PII vault · key manager | A **second RDS/Aurora instance** with its own credentials, keys in **AWS KMS** | KMS holds keys, not rows, so the sealed `bytea` still needs a store of its own. Per-person data keys sit under a customer-managed key, and erasure destroys the data key. Vendor secrets live in Secrets Manager, not in code. |
| Object store — identity photos | **Amazon S3** | Presigned PUT for the valet-key upload, SSE-KMS at rest, and a lifecycle rule as the backstop for orphaned blobs rather than as the retention policy. |
| Coordination cache | **Amazon ElastiCache** (Redis-compatible) | One breaker record, one weight set and one rate counter per vendor, shared by every replica. |
| Configuration store | **AWS AppConfig** (or SSM Parameter Store) | Versioned deployment of the roster and cadences, with the agent's local cache as the cold-start answer when the service is unreachable. |
| Schedulers — sweeper + recheck clocks | **Amazon EventBridge Scheduler** | Cron without a host: fires the sweeper and both recheck clocks as Fargate tasks or Lambda invocations, each still taking its lease. |
| Observability | **Amazon CloudWatch** (+ OpenTelemetry) | The alarm set from dive 5, with runbook text shipped in the alarm definition; logs carry ids only. |
| Private network | **Amazon Virtual Private Cloud (VPC)** — private subnets, security groups, virtual private cloud (VPC) endpoints, network address translation (NAT) | Only the gateway tier is public; stores are reachable through VPC endpoints and vendor calls leave through NAT. The stack is stamped once per region, and Route 53 sends each client to the region recorded at onboarding. |
| Email | The given vendor, or **Amazon SES** | Sends stay idempotent because the key is built from the task row, whichever sender is behind it. |
| Deferred exits | **Amazon SQS** · **AWS Step Functions** | The broker at the task-churn trigger and the workflow engine when flow variants multiply — the same triggers Right-sizing named. |

{#architecture-table-2}

## Deep dives
<!--meta block=deepdives-->

### 1 · Where the outbox went → NFR: consistency

Recording a change and telling somebody about it are two acts with no transaction between them, and every ordering of the two has a failure. Commit first and crash, and the database holds a sanctioned verdict the client never hears. Publish first and fail the commit, and the client acts on a decision this system does not hold. The [Outbox](../patterns/distributed/coordination/outbox.md) pattern closes the gap by turning the publish into a second local write inside the same transaction, which a relay drains afterwards. On an [event-sourced](../patterns/architecture/event-sourcing.md) core there is no gap left to close, because the row that records the change is the row the relay publishes.

So the outbox is present here and its table is not. `flow_event.client_visible` is the outbox, expressed as a predicate: the relay's queue is "every client-visible row above this flow's cursor", served by a partial index. That distinction is worth insisting on, because an outbox is a guarantee — the state change and the published message commit together or neither does — rather than a schema. A design that ships the table without the guarantee has bought nothing, and a design that gives the guarantee without the table has skipped only the furniture.

Adding a separate outbox table on top of the log would reintroduce the double write the log exists to kill. Two rows would have to agree on which events are publishable and in what order, and nothing but discipline keeps them agreeing. A relay that pruned the outbox after delivery could no longer answer `/events/replay`, so replay would read the log anyway and the system would carry two publish paths with different retention. And the projection, the auditor's export and the outbox become three readings that a payload bug can put out of step at three different moments. The only real thing the extra table buys — a small hot queue instead of a scan across a growing log — is bought here by the cursor plus `flow_event_publishable`, at the cost of one index rather than one table.

What the merge costs is worth stating plainly. The relay now reads the system of record on its hot path, so a delivery bug touches the auditor's table rather than a scratch queue; the counter-move is that the relay only ever reads and only ever writes `delivery_cursor`. Every client-visible event is retained for the life of the log rather than pruned at delivery, which is storage the compliance requirement was already paying for. And `client_visible` is a business decision written into the record, so mislabelling an event either leaks an internal step to a client or hides a verdict from them — which is why the flag is set by the appending code path and never by the relay. The relay holds no policy. It holds a cursor.

```mermaid caption="Two ways to close the write-then-publish gap. The left one adds a table that has to be kept honest and still cannot serve replay alone; the right one replaces the table with a predicate and a cursor."
flowchart LR
    subgraph Rejected["Rejected — outbox table on a log core"]
        R1[("flow_event")] -->|"same txn"| R2[("outbox")]
        R2 -->|"drain, then PRUNE"| R3["Relay"]
        R1 -.->|"replay needs the log anyway"| R3
        R2 -.->|"can disagree about what is publishable"| R1
    end
    subgraph Adopted["Adopted — the record IS the outbox"]
        A1[("flow_event · client_visible")] -->|"partial index"| A2["Relay"]
        A3[("delivery_cursor")] <-->|"the only write"| A2
    end
```

### 2 · Four keys against a repeat, one lane for order → NFR: delivery & idempotency

Exactly-once delivery is not available on a network: a sender that never retries loses messages, and a sender that retries sends duplicates. What is available is at-least-once transport with an idempotent effect at every boundary, which produces exactly-once in effect. That is the promise this system makes, and it is made four times because there are four places a duplicate can enter. The rule that decides each one is the same: [the key is issued by whichever side can see both copies](../patterns/messaging/idempotency.md), never by the side that happens to be writing.

**Boundary one — the client's create** {#deepdives-h-boundary-1}

The client issues an `Idempotency-Key` because only the client knows that its second POST is a retry of its first — this system sees two indistinguishable requests. The key is stored per tenant and endpoint with a digest of the request body, so a key reused by accident returns 422 rather than the answer to an earlier question, and the stored 202 is replayed byte for byte so the retry learns the same flow id.

**Boundary two — vendor and batch ingress** {#deepdives-h-boundary-2}

Here a duplicate can beat us to the punch: a vendor's retry may land before this system has written a single row of its own, so any key we issue at publish time has nothing to collide with and both copies apply cleanly. The [inbox](../patterns/distributed/coordination/inbox.md) therefore keys on the sender's own request id, and its insert rides the same transaction as the append it causes — the first copy to commit wins, the second breaks the unique constraint and takes its entire transaction down, append and all. Nothing skips it: a client create writes `(flow, 'create', key)` like everything else, and a batch result writes a row per member instead of a row per batch, so a redelivered batch of 500 whose first 300 already applied lands the other 200 and drops the rest.

**Boundary three — the worker claim** {#deepdives-h-boundary-3}

Here the durable row is its own key: a task is claimed by locking it, so two workers cannot hold one row and no extra key has to be issued. The subtlety is the vendor call inside the claim. A task is completed when its callback lands, never when the call is dispatched, so a worker that dies after calling the vendor loses its lease and the row is re-claimed — and the second call's duplicate callback then collides in the inbox rather than applying twice. Two mechanisms, one story: the lease bounds how long a lost worker costs, and the inbox bounds what its retry can do. A zombie whose lease already expired finds its append rejected by the log's own primary key, because someone else took the sequence it aimed at.

**Boundary four — outbound delivery** {#deepdives-h-boundary-4}

The key is `flow_event.event_id`, issued once when the fact is recorded and stable across every redelivery and every replay — a freshly generated identifier per attempt would collapse nothing, since the whole point is that attempt two presents attempt one's key. Order arrives free from the cursor rather than from the key, which is the second half of this dive. Outbound keys to vendors follow the same rule from the same reasoning: the email send builds its key from the task row's id, because the task row is what survives the retry.

**The fifth boundary — which is not ours** {#deepdives-h-boundary-5}

This is the honest limit of the whole design. The system can make a duplicate recognisable; only the client's own handler can make it harmless. If they insert a payment row on every `screening_concluded` without checking `eventId`, they will pay twice and the contract above will have been kept perfectly. Four counter-moves, none of them a guarantee: the webhook contract states the client's two obligations in the payload documentation rather than in a footnote; the identifiers are stable so a dedup table of recent `eventId` values can be small and short-lived; `seq` ships alongside so a client can reject stale work with a comparison rather than a set; and replay is explicit and rate-limited, so the amplifier that would multiply their exposure is one they have to ask for. A page that claimed exactly-once end to end would be claiming something about somebody else's code.

```mermaid caption="Where a duplicate can enter, and who owns the key that stops it. Boundary five is drawn because it is real: the system makes the repeat recognisable, and the client's handler is what makes it harmless." wide=true
flowchart TB
    C["Client"]:::ext -->|"1 · Idempotency-Key<br>issued by the CLIENT"| API["Identification API"]
    V["Vendor / batch"]:::ext -->|"2 · sender's requestId<br>issued by the VENDOR"| API
    API --> IB[("inbox — unique per sender ref")]
    IB --> LOG[("flow_event")]
    LOG --> T[("task — 3 · the ROW is the key")]
    T -->|"claim + lease"| W["Worker"]
    W -->|"call; done only on callback"| V
    LOG -->|"4 · event_id + seq<br>issued by US, stable on replay"| R["Relay"]
    R -->|"at-least-once"| C
    C -.->|"5 · dedup on eventId —<br>OUTSIDE this system"| C
    classDef ext stroke-dasharray:4 4;
```

**The second guarantee — which none of those four keys buys** {#deepdives-h-order-guarantee}

A key settles which copy of one fact applies; it says nothing about which of two facts lands first. Take a re-screen that turns a person from clear to sanctioned: the sanctioned delivery draws a 502 and backs off, the correction queued behind it goes out on its first attempt, and the client's ledger ends the day saying clear. Two distinct event ids, two legitimate facts, no duplicate anywhere — every mechanism above passes and the client still holds the wrong verdict. Order is a second promise with its own machinery and its own bill.

The fix is that the relay claims a flow rather than an event. One [lane per flow](../patterns/messaging/sequential-convoy.md): take the lowest client-visible sequence above `delivered_seq`, send it, and move the cursor only on a 2xx. Backoff then blocks one lane and nothing else, and a stale clear cannot physically leave ahead of the sanctioned hit sitting in front of it. `seq` travels in the payload as well, so a client can drop anything below what it has already applied even if the network reorders beneath us — the lane is the guarantee, and the field is their own check on it.

The price is head-of-line blocking, and it is worth pricing rather than waving away. A flow whose client endpoint is failing stops receiving anything until its lane drains or dies, so a slow consumer delays its own later verdicts. That is the correct trade here — a late sanctioned verdict beats an out-of-order one — but it is a real cost, and two things bound it. The lane has its own attempt budget and dead state, so a lane cannot block forever; it dies at roughly 24 hours, pages an operator, and `/events/replay` is the way back once the endpoint is fixed. And claiming per flow claims per tenant by construction, so one client's dead endpoint holds one client's lanes rather than the relay pool. The residual case is a genuinely hot flow — a person re-screened across many jurisdictions on the same day — whose events serialize behind each other. At this volume that is milliseconds; at a hundred times this volume it is the first thing to measure before adding lanes per client rather than per flow, which trades the ordering guarantee down to per-tenant and would need the requirement re-argued first.

### 3 · Nothing hangs without a clock that notices → NFR: reliability & recovery

A vendor that returns an error is easy: something failed, and the failure is an event to react to. A vendor that accepts the call and then goes quiet produces nothing at all, and a system that only reacts to events will wait for it forever. So the design rule is stated as an invariant rather than as a feature: nothing in this system may be able to stall without a clock that notices. Every in-flight flow state carries `state_due_at`, every task carries `deadline_at`, and every screening leg carries its own — 48 hours on an invitation with two automatic re-invites and a seven-day flow expiry, 24 hours on a verification callback, 4 hours on a screening leg with the round breaching at 12. Silence becomes a breach of a number the system owns.

**Rung one — bounded retry** {#deepdives-h-rung-1}

A failed attempt is pushed out on `run_after` with [exponential backoff and jitter](../patterns/distributed/resilience/retry-backoff.md). The jitter is not decoration: a cohort that failed together computes the same delay and returns together, so six hours of vendor downtime would end in one synchronised stampede. `attempts` counts, `max_attempts` stops, `last_error` is what an operator opens the row to read, and `dead_at` parks the task in a [dead-letter](../patterns/messaging/dead-letter-channel.md) state that alerts and can be re-run once the cause is fixed. Drop the budget and one malformed vendor response owns a worker slot forever; drop the recorded error and a dead task is a number nobody can act on.

**Rung two — the sweeper's verdict on a leg that can never answer** {#deepdives-h-rung-2}

An exhausted screening leg poses a conclusion problem rather than a retry problem. "Every list reported" is policy, not a consistency requirement, and a two-valued leg leaves an unanswered one with no terminal to reach. So the [sweeper](../patterns/distributed/coordination/sweeper.md) stamps it `unavailable`, the collector waits for every leg to be terminal instead of answered, and the price of that terminal is read from the leg's criticality in the [configuration store](../patterns/distributed/coordination/external-configuration-store.md). Blocking plus unavailable holds the flow and escalates to a human — on the list a regulator will ask about, late beats wrong. Advisory plus unavailable concludes `cleared_with_caveat`, names the missed list inside the client's own event and schedules a re-screen for the day it returns. What a fan-in must never do is read an unanswered check as a clean one, so the gap rides on the verdict where the client cannot avoid seeing it.

**Rung three — leases, and why a crash needs no special case** {#deepdives-h-rung-3}

A worker renews a lease while it works; a crashed worker stops renewing, the lease expires, and the sweeper returns the row to `pending`. That is the same transition a bounded retry makes, so the queue cannot tell a crash from a retry and needs no code that does. The schedulers take the same mechanism one level up: the sweeper and both recheck clocks hold [leader-election](../patterns/distributed/coordination/leader-election.md) leases in the coordination cache, because two sweepers double-invite people and two recheck clocks double-spend vendor quota. A dead scheduler's lease expires and a replica takes it, so the recovery story for the recovery mechanism is the recovery mechanism.

**Rung four — the vendor controls** {#deepdives-h-rung-4}

Four controls surround each vendor and each answers a different question. A [timeout and deadline](../patterns/distributed/resilience/timeout-deadline.md) put a line under one call, because no vendor publishes a latency guarantee and the sweeper has to have a number to enforce. A [rate limiter](../patterns/distributed/resilience/rate-limiter.md) holds back calls that would succeed and breach the contract doing it. A [circuit breaker](../patterns/distributed/resilience/circuit-breaker.md) holds back calls that would fail, and its state lives in the shared cache — keep it per process and N replicas each absorb the outage separately before the last one opens, then send N probes at a vendor that is only just recovering. A [bulkhead](../patterns/distributed/resilience/bulkhead.md) stops one stalled vendor eating the capacity another one needs. Two degraded modes are worth naming: with the cache unreachable, each worker falls back to a local breaker and a local [token bucket](../patterns/distributed/resilience/token-bucket.md) sized to its fair share; with the cache back but empty after a restart, breakers seed open rather than closed, because reading an empty cache as "everything is healthy" is how a whole fleet stampedes a vendor that never came back.

**Rung five — the fallback that moves itself** {#deepdives-h-rung-5}

Wherever a step has a second provider, the weights that split traffic between them are driven by numbers this system already collects. The per-vendor error rate feeding the alarm also feeds a small control job: it cuts a failing provider's share, decays that share back toward the default as health returns, and writes the outcome to the coordination cache so every replica splits identically. An operator can pin a weight through an incident or a contract migration, and the pin beats the automation until somebody releases it. A split that only a deploy can move is not a control, it is a constant with extra steps. Roster and default weights sit in the configuration store, so onboarding a fallback vendor costs a configuration change and a translator instead of a release.

**Rung six — the backlog, because a slow system and a stalled one break the same promise** {#deepdives-h-rung-6}

A queue is the right answer to a burst and no answer at all to sustained overload — it postpones the failure and grows while it does. So admission is tied to the drain rate: once the live class's oldest pending task passes its ceiling, `POST /flows` answers 429 with a `Retry-After`, which puts [backpressure](../patterns/concurrency/backpressure.md) in the contract instead of in an incident review. One layer down, the synchronous standby acknowledges each commit before the client sees a response, so promotion costs no acknowledged fact — and an asynchronous [replica](../patterns/distributed/coordination/replication.md) is refused for exactly that reason, since the fact it could lose is the append somebody was already promised.

**The stance all of that rests on** {#deepdives-h-recovery-stance}

One writer with a synchronous standby is a choice of consistency over availability, so a partition ends with the system refusing creates rather than opening a second flow for one person or appending a fact the relay will never see. Read through [PACELC](../themes/cap-theorem.md) it is PC/EC: pay latency in both branches, inconsistency in neither. That choice is what makes every clock above mandatory rather than tidy. A design that took availability instead would let the work proceed and reconcile afterwards, so a stall would be absorbed as eventual consistency and forgiven by the model; here a stall is a fact nobody can see yet, and the only thing that turns it back into a fact is a deadline this system owns. The one eventually-consistent surface left is the client's own view — an at-least-once webhook that can lag by minutes, priced up front rather than discovered.

**What the clocks are set against** {#deepdives-h-clock-baseline}

You can only promise what you own, and the slowest thing here is not owned. So the numbers come in three kinds. What is measured has to be queryable — a flow's age in state, a task's age since it became claimable, undelivered attempts per lane, per-vendor error rate — because a service level resting on something nobody can query is an aspiration with a percentage attached. What is engineered to stays internal, and is assumed rather than given: 99% of flows leave `awaiting_id_verification` within 4 hours of the vendor accepting them, 99% of screening rounds close within 12 hours of fan-out, 99.9% of client-visible events go out within 5 minutes of their append. What is promised to the client carries a consequence and has to sit looser than that, or there is no room left to operate: an operator paged within 15 minutes of a flow passing its state deadline, a client failure event within 5 minutes of a flow being declared stuck — again assumed, not given. The space between the engineered number and the promised one is the error budget, spent on deploys and vendor outages; exhaust it and the right move is to stop shipping rather than to restate the number. Note what is missing on purpose: nothing is promised about time-to-verdict, because the two slowest participants are a vendor down 3.6% of the week and a human being.

```mermaid caption="The recovery ladder, with the two branches that usually get forgotten drawn explicitly: silence past a deadline enters the same path as an error, and an exhausted screening leg gets a terminal of its own rather than stalling its round." wide=true
flowchart TB
    Start["Task claimed · lease + deadline_at"] --> Call["Call vendor"]
    Call -->|"2xx callback"| Done["done — appended, folded"]
    Call -->|"error"| Retry{"attempts < max?"}
    Call -->|"SILENCE past deadline_at"| Retry
    Call -->|"worker dies"| Lease["lease expires"]
    Lease --> Pending["status = pending"]
    Pending --> Call
    Retry -->|"yes"| Backoff["run_after = now + backoff·jitter"]
    Backoff --> Pending
    Retry -->|"no"| Dead["dead_at · last_error · ALERT"]
    Dead --> Leg{"is it a screening leg?"}
    Leg -->|"no"| Ops["operator inbox — re-runnable"]
    Leg -->|"yes"| Un["sweeper stamps verdict = unavailable"]
    Un --> Crit{"criticality"}
    Crit -->|"blocking"| Hold["hold flow · escalate to a human"]
    Crit -->|"advisory"| Caveat["conclude cleared_with_caveat<br>name the gap · schedule a re-screen"]
```

### 4 · Draining a backlog you did not choose → NFR: scale

The recurring book is a second workload as large as the first, and it arrives on a legal clock rather than on a customer's. Replicas compete for it through [skip-locked claims](../patterns/messaging/competing-consumers.md): the claim locks a pending row and steps over anything already locked, so no two workers hold one task and no worker waits behind another. Sorting that claim by priority is the obvious move and the wrong one — a [priority queue](../patterns/messaging/priority-queue.md)'s own advice is against strict preemption when the low-priority class carries a deadline too, and a jurisdiction's cadence is a deadline. The split is reserved capacity per class instead: the per-vendor [bulkhead](../patterns/distributed/resilience/bulkhead.md) applied a second time, along a different axis. Live flows hold a floor the batch may not borrow, and the batch holds a floor no busy onboarding day can take.

Quota splits the same way, because two pools drinking from one ceiling are one pool. On a delta day the batch would spend the contracted rate outright and live legs would be pushed out on `run_after` — [starvation](../hazards/starvation.md) at the quota rather than at the pool, with every aggregate alarm green because the batch really is draining at full speed. A single number hides that failure completely, which is why the alarm is per class.

[Batching](../patterns/concurrency/batching.md) is what keeps the bill survivable and it is priced rather than assumed. Per-person legs put 5.5 outbound calls a second against a rate contracted for today's volume; 500 persons per call takes the recurring half to under a thousand calls a day. Be exact about what that buys: it buys rate and not invoice, because the vendor still adjudicates and still bills every person-list check, so the procurement ceiling stands untouched. The cost is a coarser failure unit, paid where it belongs — the response is applied one member per transaction against one inbox row per member, so a member the vendor could not adjudicate dead-letters its own leg while the other 499 commit. Rolling back 500 results because one record was malformed turns a vendor's bad row into our re-screening outage, and it is exactly what a naive batch does. Live flows are never batched: a person waiting on an invite is not waiting on 499 strangers.

Capacity follows queue age, never processor load. A pool blocked on vendor calls reports almost no utilisation while its backlog climbs, so [autoscaling](../patterns/distributed/routing/autoscaling.md) against load would sit still through the whole incident. Each pool adds replicas once its oldest pending task passes 60 seconds and gives them back after ten minutes below five, with two replicas as the floor for redundancy and a ceiling set by the vendor's contracted concurrency rather than by our budget. Scale-in is the direction that usually needs choreography, and here it needs none: a stopping replica either finishes its claim or abandons it, and an abandoned claim is the expired lease every deploy already rehearses.

Finally, the front door is part of the drain. [Queue-based load leveling](../patterns/distributed/resilience/load-leveling.md) absorbs a burst; it does not fix sustained overload, it postpones and hides it. [Admission control](../patterns/distributed/resilience/load-shedding.md) closes that loop by refusing a create when the live class's oldest pending task passes its ceiling. Refusing costs the client a retry; accepting costs them a flow that sits invisible for hours behind work they cannot see, and costs us the reputation of a system that says yes and means later.

### 5 · What you watch, and why there is no tap → NFR: observability

The record is the trace, so what observability costs here is one [correlation id](../patterns/messaging/correlation-identifier.md), a short alarm set and SQL — not a second copy of the traffic. One flow id runs through every append, task, vendor call and delivery attempt, which turns "why is this flow stuck" into a query instead of an excavation across services. At ~75 flows a day behind a single database, [distributed tracing](../patterns/distributed/resilience/distributed-tracing.md) would instrument a call graph three hops deep. Say the expiry date out loud: that stops being true the day the deferred broker arrives and work starts leaving the transaction.

A [wire tap](../patterns/messaging/wire-tap.md) is the reach this design turns down, and not on cost. The log is already a complete, ordered, immutable copy of every fact and it is queryable where it sits, so a tap buys nothing but a second surface carrying personal data — and a monitoring surface is where access control is habitually weakest. The pattern says as much itself: avoid it when the payload is sensitive and the tap channel is not held to the same standard. The one job that would earn a tap is shadow-testing a new list vendor against live traffic, which is a future need with a name rather than a reason to build one today.

Seven alarms, each shipping its runbook in the same definition rather than in a wiki beside it. Oldest pending task age per class, because an aggregate stays green while the live class starves. Flows past their state deadline. Dead tasks above zero, which is always a page. Delivery lanes in backoff, grouped by tenant so one broken endpoint reads as one problem. Dead delivery lanes — the single alarm that means a client is missing verdicts right now. Per-vendor error rate, feeding the alert and the provider weights from one series. And outbound legs per second against the contracted ceiling, the one alarm that fires months ahead of anything breaking. Two computed numbers sit beside them: the age of the oldest undelivered client-visible event, which is the delivery guarantee reduced to a single quantity, and inbox collisions per vendor per hour, which turns a vendor's retry storm into a fact instead of a mystery in the latency graph. Log lines carry ids and nothing else — the vault is the one place raw personal data exists, and a [log line may not become a second copy of it](../patterns/security/secure-logger.md).

The same set as numbers. Warn means a human looks during working hours; page means someone is woken. Every threshold traces to a deadline or a service level stated above, so moving one means re-arguing the number it protects.

| Metric | Why it is tracked | Alert threshold |
| --- | --- | --- |
| Oldest pending task age, live class | The aggregate stays green while one class starves; this is also the autoscaling signal and the admission-control input | warn 5 min; scale out on trend; page 15 min — the class ceiling that turns `POST /flows` into 429 |
| Oldest pending task age, recheck class | The batch is a deadline too — a jurisdiction's cadence missed quietly is a compliance breach | warn 4 h; page 12 h |
| Flows past `state_due_at` | The 15-minute paging service-level agreement (SLA) is defined against exactly this predicate | any > 0 → page within 15 min |
| Dead tasks (`dead_at` set) | A parked task is work the system has given up on; nothing recovers it but a human | any > 0 → page, always |
| Delivery lanes in backoff, by tenant | Grouped so one broken client endpoint reads as one problem, not thirty | warn ≥ 3 lanes of one tenant for 15 min; page any lane older than 12 h — it dies at ~24 h |
| Dead delivery lanes | The single alarm that means a client is missing verdicts right now | any > 0 → page; runbook ends at `/events/replay` |
| Per-vendor error rate | One series feeds the alert, the breaker and the fallback weights — divergence between them is itself a bug | warn 5% over 5 min (weights begin to shift); page 25% sustained 15 min or breaker open > 30 min |
| Outbound legs/s vs contracted ceiling | The one alarm that fires months before anything breaks — the invoice is the binding constraint | warn 70% sustained 1 h; page 90% |
| Age of oldest undelivered client-visible event | The delivery guarantee reduced to one number — 99.9% within 5 min of append | warn 5 min; page 15 min |
| Inbox collisions per vendor per hour | A vendor's retry storm becomes a fact instead of a mystery in the latency graph | warn at 10× the hourly baseline |
| Standby acknowledgement | The sync standby is the consistency and partition tolerance (CP) stance; without it a primary loss loses acknowledged facts | standby down or not acknowledging → page immediately, writes are already stalling by design |
| Monthly vendor quota consumed | The recurring book compounds against a contract signed for today's volume | warn at 80% of the monthly cap with days left in the month |

{#deepdives-metrics-table}

### 6 · Evidence, erasure and the three clocks → NFR: compliance

Three clocks run across one person's data and they pull in different directions, so the design owes an answer about which of them wins rather than a pretence that they agree. An invitation expires in hours, and that clock is a security control. Retention runs in years from the end of the relationship, and that clock is a legal duty. An erasure request arrives whenever the data subject decides, and that clock belongs to them. Fold the three into one cleanup job and the system will eventually destroy evidence it was obliged to keep, or keep data it was obliged to destroy.

Retention counts from `closed_at`, and that single fact is why an [object store](../patterns/distributed/routing/object-storage.md)'s lifecycle rule cannot be the policy. Lifecycle rules expire by object age, so one would drop a photo five years after the camera shutter closed, while the duty runs five years after the merchant stopped trading with that person — dates that can sit a decade apart. So `retain_until` is computed at close against the jurisdiction's schedule, a retention sweep enforces it on the same due-dated machinery the recheck clocks already use, and the bucket rule stays where it belongs: a backstop for blobs nothing references. Deciding which mechanism is the policy and which is the backstop is the whole content of this paragraph; a design that claims both has decided neither.

Erasure is key destruction, because a delete is a claim and a destroyed key is a proof. Every person's data is sealed under its own envelope key, so destroying that key makes every copy unreadable in one act — backups included, which no delete reaches without restoring and rewriting them first. The identity photo is retired the same way instead of being deleted, which takes object versions and bucket backups with it. `flow.email_mac` is an HMAC (hash-based message authentication code) under a per-region key that erasure destroys as well: email addresses are low-entropy and enumerable, so a plain digest would let anyone holding the database recover which named people had been screened, for which client, to which verdict. Leave that index standing and nothing has been erased.

While a retention obligation is live it outranks erasure, and the request is queued rather than turned down. An onboardee's erasure arriving mid-obligation cannot simply win, so the delete answers 409 carrying the date the duty lapses and books the destruction for that day — which gives the client a date to hand their data subject instead of an apology. Two things are meant to survive it: `flow_event` and `audit_log`, both of which reference only the opaque `person_ref`. Destroy the papertrail with the person and you have destroyed the one piece of evidence that the erasure happened at all, which is precisely the outcome the requirement exists to prevent.

### 7 · Tenancy the database enforces → NFR: security & tenancy

One forgotten predicate in an application filter is a reportable incident, so the refusal belongs in the database, where it applies to every code path that ever issues the read. A policy is only as wide as the column it binds to, though, which is why `client_id` sits on every client-scoped table instead of on the three where it was obviously needed. A history table missing the column is a history table the policy cannot reach, and appended events give away verdicts and timestamps as readily as a name gives away a person.

Three details decide whether that policy holds, and each of them is a way it quietly does not. Row-level security switched on alone is bypassed by the table's owner, so the application connects as a non-owner role and the tables carry `FORCE ROW LEVEL SECURITY`. The tenant is set with `SET LOCAL` and never plain `SET`, so the value dies with its transaction rather than riding a pooled connection into the next tenant's checkout. And the parts of the fleet whose job is cross-tenant — the worker pools, the sweeper and the delivery relay — cannot run under the policy at all, so they run as a separate principal with its own credentials, its own audit and no path to the dashboard. That exemption is written down here rather than discovered in an incident. The relay is the one v3 has to add out loud: it reads client-visible events for every tenant at once, which makes it the widest principal on the board.

The onboardee has no account and should never be made to want one. Their identity is possession of a [single-use link](../patterns/security/secure-session-manager.md) — 256 bits from a cryptographic generator, kept only as a hash, dead after 48 hours, revoked the instant a resend supersedes it, and spent when the document lands rather than when the form posts. Redeeming it is a [conditional write judged by rowcount](../patterns/distributed/coordination/conditional-write.md), so two simultaneous redemptions cannot both succeed and the failure still tells expired from forged from already-spent. What it authorises is one flow's submission and nothing that belongs to a client.

Residency is a whole [stack per region](../patterns/distributed/routing/deployment-stamp.md) rather than a column on a table. Gateway, API, worker pools, relay, schedulers, Postgres and its standby, vault, key manager, object store and cache all come out of the same infrastructure code, and only jurisdiction configuration differs between one stamp and the next. No region shares data with another, which is what makes the promise checkable: a query cannot cross a boundary it has no connection across. The bill is booked in the trade-offs — N stamps multiply cost, operational surface and configuration drift, and losing a region is downtime for that region's clients by choice.

### 8 · What changes without a rewrite → NFR: evolvability

Ship only the twelve mandatory requirements and what you have is a complete, correct product; everything that came later hangs off the log that product already writes. Re-screening, re-verification, relationship close, replay and the access papertrail all read from or append to `flow_event`, and not one of them asked for a write path of its own — which is the difference between an addition and a second system. A new jurisdiction is a cadence and a list set held in configuration. A new sanction list is a row in that set, plus a task kind the pool already knows how to run.

A new vendor should cost a translator and nothing else. Six foreign models reach this system — the identity provider, four list vendors, the email sender — and each has its own word for a match and its own name for a check that failed. Let them into the log unnormalised and the adjudication rule ends up written in six dialects, where any vendor's contract change is an edit to our business logic. So each provider sits behind an [anti-corruption layer](../patterns/ddd/acl.md) that parses the payload, maps it onto our own three verdicts, and stamps `provider` and `policy_version` onto the event the transaction appends — which is how the log can still answer, years afterwards, by what policy and which provider a person was checked, rather than only that they were. Where the parsing happens is load-bearing. Do it inside the transaction and a payload the parser rejects rolls the inbox row back with it: this system then holds no evidence of having seen the callback, the vendor retries it forever, and the dead-letter write dies in the same rollback. Do it ahead of `BEGIN` and one transaction commits the inbox row, a dead-letter row and an escalation together — and the vendor stops retrying.

The schema evolves reader-first: a new event type or task kind reaches the workers that understand it before it reaches the writer that emits it, and a projection whose shape changed is rebuilt from the log rather than migrated in place. That rebuild is the one operational superpower the log hands over. The bill for it is `payload`: an untyped contract with four consumers, carried on discipline where a schema registry would otherwise carry it.

Every exit is additive, and each waits on a number rather than on a feeling. The partial indexes over claimable tasks and publishable events are already in place. After that: stagger the recheck cadences across the quarter once the delta-day spike shows up in per-class age; partition the log by time as a region passes ~500 GB, a move the relay survives because its predicate is per flow and never a global scan; add a read replica once dashboard and audit-export reads start competing with worker claims; adopt a broker when task-table churn is measured, roughly sustained 100k flows a day, at which point the relay's cursor becomes a consumer group and the ordering guarantee becomes a partition key; and take a [workflow engine](../patterns/distributed/coordination/workflow-orchestration.md) only if flow variants multiply, priced at handing an append-only history over to the engine's own. None of that is a rewrite, which is what putting the record at the centre bought.

### 9 · A clean check, end to end

**A walkthrough, not new machinery: dives 1, 2 and 3 in time order.** A successful check is a chain of small transactions with rows waiting between them. Watch three things in the walkthrough below rather than the states: every ingress writes an inbox row before it writes anything else, every wait is a task with a deadline attached, and every client-visible append is a delivery the cursor owes and will keep owing until a 2xx arrives. The mechanics are argued above; here they fire in order.

```mermaid caption="One successful check in time. Note where the link is spent — when the document lands, not when the form posts — and that the conclusion is appended by whichever leg happens to find its round empty." wide=true
sequenceDiagram
    autonumber
    participant C as Client
    participant API as API
    participant PG as Postgres
    participant P as Person
    participant V as Vendors
    participant R as Relay
    C->>API: POST /flows
    API->>PG: inbox('create') · append flow_created · task send_invite
    API->>C: 202 { flowId, seq 1 }
    PG->>V: (worker) send invite — key from task id
    V->>P: email with 48h single-use link
    Note over P: waits ~24h — a row, not a connection
    P->>API: POST /submissions (magic link, still unspent)
    API->>PG: append submission_received · document row
    P->>V: PUT photo direct to object store
    API->>PG: append document_stored · SPEND the link · task verify_id
    PG->>V: (worker) verify — lease 60s, deadline 24h
    V->>API: callback idv pass
    API->>PG: inbox('idv') · append idv_passed · fan out 4 screen tasks
    PG->>V: (workers) screen ofac, un, eu, uk — round 4
    V->>API: 4 callbacks, each with its own requestId
    API->>PG: 4 × inbox · 4 × list_reported · last one appends screening_concluded
    R->>PG: claim lane — delivered_seq 0, owed seq 11
    R->>C: webhook { eventId, seq 11, verdict clear }
    C->>R: 200
    R->>PG: delivered_seq = 11
```

### 10 · The vendor dies mid-check

**A walkthrough, not new machinery: dive 3's ladder under a dead provider, ending on dive 2's lane.** A dead provider costs latency, never a fact, and this is the walkthrough that proves the recovery ladder is not a list of features. Read it as four decisions made by data rather than by a person: the breaker opens because the shared error rate says so, the fallback is chosen because the weights in the cache say so, the leg ends because a deadline says so, and what that ending costs is decided by a criticality in configuration. Nobody is woken up until the last step, and the flow's business state does not move while the stall lasts.

```mermaid caption="How a check finishes when its provider dies. The two failures are deliberately different: vendor A returns errors, which a breaker can see, while vendor B accepts and goes quiet, which only a deadline can." wide=true
sequenceDiagram
    autonumber
    participant W as Screening worker
    participant Ca as Coordination cache
    participant V1 as List vendor A
    participant V2 as List vendor B (fallback)
    participant S as Sweeper
    participant PG as Postgres
    participant C as Client
    W->>Ca: read breaker + weights for 'ofac'
    W->>V1: screen (round 4) — deadline 4h
    V1--xW: 503
    W->>PG: attempts=1 · last_error · run_after = +2s·jitter
    W->>Ca: error rate up — breaker OPENS for vendor A
    Note over Ca: every replica sees it — one outage absorbed once
    W->>Ca: weights shifted toward vendor B
    W->>V2: screen (round 4) — same round, same leg
    V2--xW: accepts, then SILENCE
    S->>PG: leg past deadline_at — no event to react to
    S->>PG: attempts exhausted → verdict = 'unavailable'
    S->>PG: read criticality from configuration
    alt blocking list
        S->>PG: hold flow · append flow_stuck · page an operator
        PG->>C: failure event via the relay lane
    else advisory list
        S->>PG: append screening_concluded — cleared_with_caveat
        S->>PG: schedule a re-screen for the list's return
        PG->>C: verdict + the named gap, same lane, same contract
    end
```

### 11 · Recheck day — the batch, and the debt it creates and repays

**A walkthrough, not new machinery: dives 4, 2 and 3 on the heaviest day of the quarter.** Recheck load grows with the book instead of with intake, and it behaves like debt — rows owed, worked off, and settled through the same paths a live check uses. The clock re-enters each due flow with a `screening_started` append that opens a new round, the batch calls carry roughly 500 persons apiece, each member's result takes its own inbox row in its own transaction, and a changed verdict leaves down the same lane a first verdict did. Three queues hold the debt, and all three read empty when the day is done: pending tasks in the recheck class, unmatched inbox rows, and delivery cursors still owing events. What keeps the day inside its window is shape rather than speed — reserved capacity so the batch cannot starve live flows, a split quota so it cannot starve them at the vendor either, admission control so an overrunning batch refuses new creates instead of burying them, and autoscaling on oldest-pending age so the pool grows against the backlog rather than against a processor number that never moves.

```mermaid caption="Where the recheck backlog lives while it works. The dashed edges are the two things that keep a compliance sweep from becoming an outage: a member's failure is its own, and the front door closes while the class is behind."
flowchart LR
    Clock["Recheck clock · leased"] -->|"rescreen_due_at < now"| Rounds[("screening_started<br>new round per flow")]
    Rounds --> Tasks[("task · class = recheck")]
    Tasks -->|"500 persons per call<br>reserved quota share"| V["List vendors"]:::ext
    V -->|"batch callback"| IB[("inbox — ONE ROW PER MEMBER")]
    IB -->|"one txn per member"| Log[("flow_event")]
    IB -.->|"member the vendor could not adjudicate"| DL["dead leg — the other 499 commit"]
    Log --> Cur[("delivery_cursor — owed events")]
    Cur --> C["Client"]:::ext
    Adm["Admission control"] -.->|"429 while the class is behind"| C
    Auto["Autoscaler · oldest-pending age"] -.-> Tasks
    classDef ext stroke-dasharray:4 4;
```

### 12 · Follow-up questions this design must answer

Three questions that probe where a guarantees-first design usually breaks. Verdict first; the expansion unfolds.

**Q1 — You claim exactly-once. Prove it, or withdraw the claim.** — Withdrawn as stated, and restated precisely. At-least-once transport with an idempotent effect at four boundaries, which is exactly-once in effect everywhere the system owns both ends.

```text summary="where the claim stops being ours"
OWNED — both ends inside the system:
  create        client's stored key + inbox row     → at most one flow per accepted create
  vendor in     inbox on the sender's request id    → an append applies once, whatever the retry
  worker claim  the row's own lock + lease          → one worker per task, crash costs time only
  fan-in        round-scoped count, zero-remaining  → one screening_concluded per round

NOT OWNED — the effect is in the client's code:
  webhook       stable eventId + monotonic seq      → the repeat is RECOGNISABLE, not harmless

So the contract says at-least-once and names the client's two obligations in the payload
documentation. A page that claimed exactly-once end to end would be making a promise
about somebody else's handler.
```

**Q2 — A relay that reads the system of record on its hot path sounds like a liability. Why is it not?** — Because it has exactly one capability: read a predicate, write a cursor. It cannot append, cannot fold, and cannot decide what is publishable.

```sql summary="the relay's whole surface"
-- READ: one indexed lookup per owed lane. No scan, no join to the projection.
SELECT e.event_id, e.seq, e.type, e.payload
  FROM delivery_cursor c
  JOIN flow_event e ON e.flow_id = c.flow_id
                   AND e.seq > c.delivered_seq
                   AND e.client_visible
 WHERE c.flow_id = $claimed_flow
 ORDER BY e.seq LIMIT 1;

-- WRITE: this row and nothing else, ever.
UPDATE delivery_cursor SET delivered_seq = $seq, attempts = 0 WHERE flow_id = $flow;

-- The relay runs as a principal with SELECT on flow_event and UPDATE on delivery_cursor.
-- The database enforces the boundary the design describes, so "the relay corrupted the
-- audit record" is not a bug that can be written — it is a permission that does not exist.

```

**Q3 — Every guarantee here is a race. How do you prove the guards hold?** — By staging each race as two open transactions. The guards are SQL, so a race is two sessions and a held lock, repeatable on every build rather than at a quarterly game day.

```text summary="the race rota"
append collision   two sessions read the same last_seq and both insert at seq+1
                   → exactly one commits; the loser's fold AND tasks are gone with it
duplicate first    deliver one callback twice, second copy committing first
                   → the inbox constraint aborts one whichever order they arrive
batch redelivery   replay a 500-member batch whose first 300 already applied
                   → 200 new rows, 300 constraint violations, zero double-applies
zombie worker      claim a task, expire its lease by hand, let a competitor advance the
                   flow, then let the original append → it collides, never double-applies
collector          report the last two legs of a round in concurrent transactions
                   → exactly one may append screening_concluded
lane ordering      hold one flow's lane in backoff and assert the seq behind it never
                   leaves first, and that replay re-emits the same ids in the same order
sweeper vs worker  let a lease expire while the worker is mid-call
                   → the re-claim and the late callback converge on one applied effect
failover           promote the standby with commits in flight
                   → every acknowledged append survives; no delivered_seq goes backwards

None of it needs fault-injection infrastructure, which is why it all runs on every build.
```

## Limitations & trade-offs
<!--meta block=tradeoffs-->

The worst flaw, named first: the last boundary of the delivery contract sits in somebody else's code. This system can make a repeat recognisable, and only the client's own handler can make it harmless — so a client that ignores `eventId` pays twice while every promise on this page is kept.

### What it buys
<!--meta polarity=pro-->

- **Nothing can diverge, because nothing is written twice.** The ingress record, the state change, the evidence and the client's event are one commit, so there is no window in which one exists without the others.
- **Every duplicate has an owner.** Four boundaries carry four keys, each issued by the side that can see both copies, so a repeat collides rather than being absorbed by luck.
- **Order is a property, not a hope.** Sequence is total within a flow and the relay walks one lane at a time, so a stale verdict has no physical route past a fresh one.
- **Nothing can stall unnoticed.** Every in-flight state and every vendor leg carries a deadline the sweeper enforces, so a silent vendor is a breach with a page attached rather than a flow nobody remembers.
- **A crash needs no special case.** An expired lease and an exhausted retry both return a row to pending, so a dead worker, a dead scheduler and a rolling deploy are one code path the failure tests already exercise.
- **Replay is a read.** The events are still in the record, so recovery after a client outage is one cursor write rather than a reconstruction from a queue somebody pruned.
- **The recurring obligation has a stop.** Closing a relationship nulls both clocks, which bounds the one quantity that otherwise grows forever and takes the vendor bill with it.

### What it gives up
<!--meta polarity=con-->

- **The delivery contract is only as exactly-once as the client's own dedup.** Four counter-moves cut their exposure — obligations stated in the payload contract, stable identifiers, `seq` for staleness, metered replay — and not one of them is a guarantee, because the effect lands in code this system never sees (see dive 2).
- **The record is four contracts in one untyped column.** `payload` serves the projection, the dashboard, the auditor and the webhook at once, so a schema mistake is a mistake in all four at the same moment and nothing in the build checks it (see dive 8).
- **Per-flow lanes serialize a hot flow.** Ordering is bought with head-of-line blocking, so a failing client endpoint delays that flow's own later verdicts for up to a day before the lane dies (see dive 2).
- **Postgres is the single writer and the single point of failure.** Consistency was chosen over availability: an outage stalls every write until the standby is promoted (see dive 3).
- **The recurring book runs out before the database does.** Vendor legs compound against every relationship still open while revenue follows only the new ones, so the thing that breaks first is a contract priced for today (see dive 4).
- **Each region is an island with one vault on it.** N stamps multiply cost, operational surface and configuration drift, a regional outage is that region's downtime by choice, and inside each stamp every tenant's personal data sits behind one vault and one key manager — read across tenants by a relay that is the broadest principal in the system (see dives 6 and 7).
- **The record only grows.** Storage is a standing cost whose exit is a partition rather than a delete, because what makes it large is the evidence this design exists to keep.

## What's expected at each level
<!--meta block=levels-->

### Mid-level {#levels-h-mid}

- Names the places a duplicate can enter before designing a guard for any of them. **The answer** Four: the client's create, a vendor or batch callback, a worker claim, and an outbound delivery. Listing them first is what stops the design from putting one mechanism everywhere and discovering the gap in production.
- Asks for the volume before designing anything, and holds the design to the answer. **The answer** Fewer than 75 person-flows a day now, with the design taken out to 10k. Every verdict in Right-sizing is priced against that: ~50 rows per flow works out at ~12 row-writes a second at peak, two rungs under the first figure a single primary would notice. It is also the reason nothing here needs a broker, a search index or a read cache.
- Produces a durable state model, with a queue standing between the system and the vendor calls. **The answer** Nine states, and the queue is a task table in the same store. The person takes about a day and the vendor is dark six hours a week, so a wait has to be a row carrying `run_after` rather than a connection somebody is holding open.
- Walks the failure paths when prompted, instead of the happy path twice. **The answer** Vendor down: the breaker opens, `run_after` pushes the work out, the flow waits and drains when the vendor returns. Worker dies holding a task: its lease lapses and a competitor claims the row. Retries spent: the task dies, an operator is paged, the client gets a failure event. Link expired: the onboardee resends it themselves. Upload failed: a fresh presigned URL, because the link was never spent in the first place.

### Senior {#levels-h-senior}

- Argues the log as the outbox against a separate outbox table, rather than reciting either. **The answer** The outbox exists to remove the write-then-publish gap by making the publish a second local write. On an append-only core the gap is already closed, so a second table adds a row that has to agree with the first about what is publishable, cannot serve replay once pruned, and gives back nothing but a smaller scan — which a partial index and a per-flow cursor give more cheaply.
- Separates deduplication from ordering, and gives each its own mechanism. **The answer** They fail differently. A repeat is soaked up by a stable `eventId`. A reorder is not: two verdict flips carry two distinct ids, so dedup has nothing to collapse and arrival order alone decides what the client believes. Ordering needs a per-flow sequence and a relay that claims a flow rather than an event.
- Prices the lane rather than presenting it as free. **The answer** One lane per flow buys ordering with head-of-line blocking, so a failing endpoint delays that flow's later verdicts. It is bounded by the lane's own attempt budget and dead state, and it is per tenant by construction. The exit — lanes per client instead of per flow — trades the guarantee down to per-tenant and needs the requirement re-argued before it is taken.
- Separates operational state from business state without being asked, and says what the seam pays for. **The answer** Business facts go in the log; attempts, leases, budgets and backoff live on task rows and never reach it. So the client-visible vocabulary survives a change of retry mechanics, the history stays an account of what happened to a person rather than to a worker, and the audit obligation is met by reading the record instead of by a second write path that could contradict it.
- Puts tenant isolation in the database rather than trusting an application filter. **The answer** A filter is one forgotten predicate away from a cross-tenant leak, which in this domain is a reportable incident rather than a bug. Row-level security makes the database itself refuse the unscoped read — but only on tables that carry `client_id`, which is why every client-scoped table carries it, why the policy is forced against a non-owner role, and why the tenant is set with `SET LOCAL`.

### Staff+ {#levels-h-staff}

- Treats recovery as a subsystem with one checkable invariant, and follows it as far as the terminal an unanswerable check needs. **The answer** The invariant is that nothing can stall without a clock that notices, and it is checkable: every in-flight state has a due date, every task and every screening leg has a deadline, and a state in flight with a null due date is a defect the schema makes visible. Everything else — backoff with jitter, attempt budgets, dead-lettering, leases on workers and on schedulers, admission control, autoscaling on queue age — is what the invariant costs once you take it seriously. It also forces a third leg outcome, because a two-valued verdict leaves a withdrawn list stalling forever and blames the person for it: `unavailable` makes the fan-in reachable, and the list's criticality decides the price — blocking holds the flow for a human, advisory concludes with the gap named in the client's event and a re-screen scheduled. Reading an unanswered check as clean is the one reading ruled out by name.
- Issues every idempotency key on the side that can see both copies, then says out loud where that rule stops working. **The answer** A vendor's repeat can arrive before this system has written anything of its own, so a key issued at our publish time collides with nothing and both copies apply; the inbox therefore keys on the sender's request id and commits with the append it causes, and the loser of that race takes its whole transaction down. Run the rule outward and the last boundary lands outside the system: the webhook's effect is in the client's handler, so what is promised there is a recognisable repeat and never a harmless one. The counter-moves are contractual and partial — obligations stated in the payload contract, identifiers stable enough that a short dedup window works, `seq` shipped so staleness is a comparison, and replay metered because it is the one amplifier a client can pull on themselves.
- Takes a CAP (consistency, availability, partition tolerance) position, then prices it in what the system will and will not promise. **The answer** Consistency, deliberately: one writer with a synchronous standby, and a partition answered by refusing creates rather than by opening a second flow for one person. Dive 3 carries the argument, including the part that is usually skipped — choosing C is exactly why the deadlines are mandatory, because a stall is invisible until a clock this system owns notices it. The prices are then stated in three registers: an indicator anyone can query, an internal objective of 99.9% of client-visible events delivered within 5 minutes of their append, and a looser agreement with the client. Nothing at all is promised about time-to-verdict, because the two slowest participants are a vendor down 3.6% of the week and a human being.
- Prices each deferred exit and names the number that triggers it, rather than listing future work. **The answer** A broker at measured task-table churn, roughly sustained 100k flows a day, priced at giving up the one transaction that makes the record and the client's event the same commit. A read replica once dashboard and audit-export reads compete with worker claims, priced at a read path that can lag the log. Log partitioning by time as a region passes ~500 GB, which the recheck arithmetic reaches in year three and which the relay survives because its predicate is per flow rather than a global scan. A search engine: never on these numbers, because the dashboard reads by primary key and never asks "find flows matching". Every one of those is a plotted line rather than a hunch, which is what makes deferring them a decision.
- Defends the design's biggest flaw as a deliberate choice. **The answer** One write serves four readers, so an untyped payload is a contract with the projection, the dashboard, the auditor and the client simultaneously, and the relay reads the auditor's own table on its hot path. Both are handled in the open — schema discipline on the payload, and a relay whose database principal can only select events and update a cursor — rather than denied.

## Patterns it demonstrates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Alternative to**

- [Persona Identification & Sanction Check](./persona-identification.md) — the same brief on a mutable flow row plus a history table and an outbox — read it when there is no event-sourcing budget and an auditor must read business state without tooling

**The record and its guards**

- [Event Sourcing](../patterns/architecture/event-sourcing.md) — one append carries the state change, the auditor's evidence and the client's event, and the relay publishes from that same row
- [Materialized View](../patterns/distributed/coordination/materialized-view.md) — current state is folded in the same transaction as the append, so it never lags the record and can be rebuilt from it when its shape changes
- [Optimistic Concurrency Control](../patterns/distributed/coordination/optimistic-concurrency-control.md) — the (flow_id, seq) primary key is the guard: a zombie worker whose lease expired collides on the sequence it aimed at instead of double-applying
- [Pessimistic Locking](../patterns/distributed/coordination/pessimistic-locking.md) — the claim takes a skip-locked row lock because contention on pending work is the normal case, and the lock dies with its transaction
- [Conditional Write](../patterns/distributed/coordination/conditional-write.md) — the magic link is redeemed by an UPDATE carrying its whole precondition, judged by rowcount, so two concurrent redemptions cannot both win

**Delivery and idempotency**

- [Outbox](../patterns/distributed/coordination/outbox.md) — the log is the outbox: the state change and the published event are one append, so the relay reads the record and there is no second table to keep honest
- [Inbox](../patterns/distributed/coordination/inbox.md) — every ingress writes a row keyed on the sender's own id in the same transaction as its effect — a client create, a vendor callback, and one member of a 500-person batch
- [Idempotency](../patterns/messaging/idempotency.md) — four boundaries, four keys, each issued by the side that can see both copies — and the fifth boundary, the client's own handler, named as outside the system
- [Sequential Convoy](../patterns/messaging/sequential-convoy.md) — the relay claims a flow rather than an event and sends one sequence at a time, so a stale clear cannot overtake a sanctioned hit

**Flow progression and fan-in**

- [Saga](../patterns/distributed/coordination/saga.md) — verify, screen and notify are local transactions sequenced by appends, with explicit failure terminals instead of a transaction manager spanning the vendors
- [Workflow Orchestration](../patterns/distributed/coordination/workflow-orchestration.md) — an append-only record plus a task table is a hand-rolled durable orchestrator: a crash or a deploy resumes mid-flow rather than restarting it
- [Scatter-Gather](../patterns/messaging/scatter-gather.md) — screening fans one leg per list and only the leg that finds none outstanding within its own round concludes the flow

**Queue, workers and recovery**

- [Competing Consumers](../patterns/messaging/competing-consumers.md) — stateless replicas claim tasks with a skip-locked read, so two never take the same row and capacity is a replica count
- [Dead Letter Channel](../patterns/messaging/dead-letter-channel.md) — a task carries attempts, max_attempts and last_error, so a poison message is parked with its diagnosis rather than retried forever
- [Queue-Based Load Leveling](../patterns/distributed/resilience/load-leveling.md) — the task table absorbs onboarding bursts and six-hour vendor outages ahead of fixed vendor rate limits
- [Priority Queue](../patterns/messaging/priority-queue.md) — live flows and the recurring recheck batch share one table but claim from separately sized pools, because the batch's cadence is a legal deadline too
- [Batching](../patterns/concurrency/batching.md) — the recurring book screens 500 persons per vendor call, with one inbox row and one transaction per member so the batch is transport and never a unit of failure
- [Autoscaling](../patterns/distributed/routing/autoscaling.md) — pools scale on the age of their oldest pending task, never on processor load, because workers sit blocked on vendor calls with utilisation near zero
- [Stateless Service](../patterns/distributed/routing/stateless-service.md) — no worker, relay or scheduler holds state, so a lost claim is an expired lease and a rolling deploy needs no drain choreography
- [Health Endpoint Monitoring](../patterns/distributed/resilience/health-endpoint.md) — replicas report readiness so the scaler and the deploy know which instance may take work and which is draining a claim
- [Sweeper](../patterns/distributed/coordination/sweeper.md) — one leased job expires stale leases, dead-letters exhausted tasks, stamps unreachable screening legs, expires overdue flows and enforces the retention clock
- [Leader Election](../patterns/distributed/coordination/leader-election.md) — the sweeper and both recheck clocks hold leases, because two sweepers double-invite people and two recheck clocks double-spend vendor quota

**Vendor boundary and resilience**

- [Anti-Corruption Layer](../patterns/ddd/acl.md) — one translator per vendor maps six foreign vocabularies onto our three verdicts and stamps provider and policy_version onto the append
- [Circuit Breaker](../patterns/distributed/resilience/circuit-breaker.md) — one breaker per vendor in the shared cache, seeded open after a cache restart so an empty cache never reads as all-healthy
- [Retry with Backoff](../patterns/distributed/resilience/retry-backoff.md) — vendor calls and deliveries retry on a growing schedule with jitter recorded on run_after, because a cohort that failed together would otherwise return together
- [Timeout / Deadline](../patterns/distributed/resilience/timeout-deadline.md) — every state, task and screening leg carries a deadline, because a vendor that accepts a call and goes silent produces no event for anything else to react to
- [Bulkhead](../patterns/distributed/resilience/bulkhead.md) — one pool per vendor, and a second split by workload class so the recurring compliance sweep cannot starve a person waiting on an invite
- [Replication](../patterns/distributed/coordination/replication.md) — a synchronous in-region standby acknowledges every commit before the client does, so promotion loses no acknowledged fact
- [External Configuration Store](../patterns/distributed/coordination/external-configuration-store.md) — the list roster, per-list criticality, recheck cadences, vendor quotas and provider weights move without a deploy, and a worker boots from its last cached version

**Edge, admission and tenancy**

- [Gatekeeper](../patterns/distributed/routing/gatekeeper.md) — one public edge terminates TLS, authenticates the tenant and enforces both the rate limit and the admission ceiling before anything reaches the API
- [Rate Limiter](../patterns/distributed/resilience/rate-limiter.md) — an inbound per-client limit at the edge, and an outbound per-vendor quota split by workload class so the recurring batch cannot spend the live class's share
- [Backpressure](../patterns/concurrency/backpressure.md) — when a class's oldest pending task passes its ceiling the create returns 429 with a Retry-After, because a queue alone only postpones sustained overload
- [Load Shedding](../patterns/distributed/resilience/load-shedding.md) — the create returns 429 with a Retry-After when the live class's oldest pending task passes its ceiling, because accepting a flow into a backlog it cannot drain hides the failure rather than fixing it
- [Secure Session Manager](../patterns/security/secure-session-manager.md) — the onboardee has no account: their session is a hashed single-use link, spent when the document lands rather than when the form posts
- [Deployment Stamp](../patterns/distributed/routing/deployment-stamp.md) — residency is one full stack per region — edge, API, workers, relay, Postgres and standby, vault, key manager, object store — stamped from the same code with only jurisdiction config varying

**Payloads, evidence and restraint**

- [Object Storage](../patterns/distributed/routing/object-storage.md) — identity photos go straight to an object store on a presigned upload, referenced by key from a metadata row written before the URL is signed
- [Valet Key](../patterns/distributed/routing/valet-key.md) — the photo goes up on a URL scoped to one object for fifteen minutes, re-issuable when a mobile upload fails, so the API decides who may upload and then leaves the data path
- [Claim Check](../patterns/messaging/claim-check.md) — workers pass the photo's storage key between steps, never the image bytes
- [Secure Logger](../patterns/security/secure-logger.md) — log lines carry flow and person ids only, so a log never becomes a second copy of the vault
- [Correlation Identifier](../patterns/messaging/correlation-identifier.md) — one flow id threads every append, inbox row, task, vendor call and delivery attempt, so a stuck flow is one query rather than an archaeology exercise
- [Keep It Simple (KISS)](../principles/kiss.md) — one Postgres and stateless workers carry the whole delivery guarantee; every rejected broker, router, tap and polling API is priced against a confirmed hundred onboardings a week

**Demonstrates**

- [Token Bucket](../patterns/distributed/resilience/token-bucket.md) — With the shared cache unreachable, each worker falls back to a local token bucket sized to its fair share

<!-- relationships:end -->
