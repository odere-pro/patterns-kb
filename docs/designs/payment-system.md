---
title: Payment System
description: "Charge cards at 10,000 TPS with a durable, auditable record of every state change and no double-charge when the external network times out"
area: designs-advanced
owner: Oleksandr Derechei
tags: [transactions, durability, authentication]
status: stable
aliases: [payment processor, Stripe-style payments, card processing]
solves: [a network timeout made my customer get charged twice for the same order, I need a tamper-proof record of every state change to survive a financial audit, my provider timed out and I have no idea whether the money actually moved, sensitive card numbers keep landing on my own servers and I do not want the liability, auditing and analytics queries are fighting my live transactions for the same database]
---

# Payment System

A payment system lets merchants charge a customer's card without building their own payment infrastructure. The happy path is easy; the guarantees around it are the whole problem. Never lose a transaction record, never charge twice, and stay correct even though the money actually moves on an external network — Visa, Mastercard, a bank — that answers asynchronously and that you do not control.

## Understanding the problem
<!--meta block=description-->

A customer enters card details on a merchant's checkout, the merchant forwards them to us, and we charge the card and report the outcome. The surface is small, but two properties dominate every decision downstream. First, this is money, so every attempt, success and failure has to be recorded durably and auditably — a lost record is a legal problem, not a bug. Second, the actual authorization happens on a payment network we don't own, over links that can time out or drop a response, so the system is fundamentally asynchronous: a "timed out" charge may still be mid-flight. The engineering is less about the request path and more about staying correct in the gap between "we asked" and "we know".

## Explained
<!--meta block=explain-->

A payment system takes card charges without ever double-charging or losing a record, even though the card network answers late. Two moves do it. Every charge request carries a unique key, so a retried request returns the charge that already exists. A network timeout is stored as its own pending state, not read as a failure, and a later check asks the network what happened. Every committed change is also copied from the database's own log onto an ordered event stream. Audit, reconciliation and merchant notices read that stream, so the busy main database never carries the history. Choose this over writing an audit row beside each update when you cannot trust every code path to remember it. The costs are these. Truth arrives late, so show pending and settle it from the network's daily files. The main database sits at the edge of one node at 10,000 writes a second, so shard it by merchant. The history grows without end, so archive anything past a few months to cheap storage.

**Example.** Peak load is 10,000 charges a second. Each row is about 500 bytes, so 10,000 times 500 is 5 MB a second to store. A merchant charges 200 dollars with key k1. The bank debits it, but the reply is lost and the call times out. The system records pending and does not say failed. The merchant retries with k1 and gets the same charge back, not a second 200. Reconciliation later asks the network, learns it succeeded and updates the row. The cost is that the merchant sees pending for a while.

## Requirements
<!--meta block=requirements-->

### Functional
<!--meta requirement=fr-->

1. A merchant can initiate a payment request — charge a specific amount to a customer.
2. A customer can pay with a credit or debit card.
3. A merchant can read the status of a payment (created, processing, succeeded, failed).

Out of scope, and named to keep the design narrow: refunds, saved payment methods, transaction reporting, alternative rails (bank transfer, wallets), subscriptions, and payouts to merchants.

### Non-functional
<!--meta requirement=nfr-->

- **Security** — the caller is provably the merchant, and card data is protected end to end.
- **Durability & auditability** — no transaction data is ever lost, even under failure; the full event history survives, not just the current state.
- **Financial integrity** — transaction-safe despite the async payment network: no double-charges, no silent successes.
- **Scale** — ~10,000 transactions/sec at peak, including bursts (holiday sales).

## Right-sizing
<!--meta block=sizing-->

**Throughput.** Peak is ~10,000 transactions/sec. Every charge is a write, so the operational store must absorb roughly **10k writes/sec** — right at the edge of a single well-tuned relational instance, and the reason the write path gets its own scaling story below.

**Event volume.** Each committed write also becomes one change event. A single Kafka partition comfortably sustains ~5,000–10,000 messages/sec, so **3–5 partitions** at a replication factor of 3 cover 10k TPS with fault-tolerant headroom.

**Storage.** A transaction row is ~500 bytes. 10,000 rows/sec × 500 bytes ≈ 5&nbsp;MB/sec ≈ 430&nbsp;GB/day ≈ **160&nbsp;TB/year**. That figure, not the request rate, is what forces a retention-and-archival plan: hot data stays in the operational DB, anything past a few months moves to cold storage.

## Core entities
<!--meta block=entities-->

Three entities, with one deliberate simplification:

- **Merchant** — the business: identity details, bank account, and the API keys used to authenticate every request.
- **PaymentIntent** — a merchant's intention to collect a specific amount. It owns the lifecycle state machine (`created → authorized → captured`, with `pending` while the network's answer is unknown and `declined` / `canceled` / `refunded` as the other exits) and is the anchor for idempotency: a retry keys off the same intent rather than starting a new charge.
- **Transaction** — a money-movement record under one PaymentIntent, one intent to many transactions. In production it splits into discrete types (Charge, Refund, Dispute, Payout) plus double-entry `LedgerEntry` rows that actually move balances; here it collapses to a single polymorphic record scoped to **Charge**. A failed attempt (insufficient funds) simply creates a new Transaction under the same intent on retry.

## The interface
<!--meta block=interface-->

One endpoint per requirement — create an intent, attach a charge, read status. The status a merchant reads is a deliberate projection of the intent's own state machine, not a second vocabulary: a merchant has no use for the difference between `authorized` and `captured`, and a timed-out attempt reads as `processing` until reconciliation settles it.

```http summary="HTTP — create, charge, and check status"
POST /payment-intents
{ "amountInCents": 2499, "currency": "usd", "description": "Order #1234" }
→ 200 { "paymentIntentId": "pi_123" }

POST /payment-intents/{paymentIntentId}/transactions
{ "type": "charge", "card": { ... } }   # illustrative only — see note

GET /payment-intents/{paymentIntentId}
→ 200 { "status": "succeeded", "error": null }   # created | processing | succeeded | failed
  # merchant-facing projection of the intent's own states:
  #   created → created · pending → processing
  #   authorized, captured → succeeded · declined → failed
```

The raw card fields on the charge endpoint are shown only to illustrate the shape — sending raw card data to the backend is exactly what the security deep dive forbids; the real client tokenizes and encrypts it before it ever reaches us. For real-time updates, a merchant can register a callback URL and receive **webhooks** instead of polling `GET` — a substantial enough sub-system that it is scoped down here and sketched at the end.

## How the system is built
<!--meta block=architecture-->

Requests enter through an [API gateway](../patterns/distributed/routing/api-gateway.md) that authenticates the merchant, rate-limits, and routes. The **PaymentIntent Service** creates and reads intents; the **Transaction Service** takes the card, drives the transaction through its lifecycle, and is the one component that speaks to the **external payment network** — deliberately combined so Payment Card Industry (PCI) scope stays in a single service. Both write to one operational database. The durability spine sits underneath: [change data capture](../patterns/distributed/coordination/change-data-capture.md) tails the database's [write-ahead log](../patterns/distributed/coordination/write-ahead-log.md) and publishes every committed change onto an event stream, which specialized consumers (audit, reconciliation, webhooks) read independently.

```mermaid caption="The request path (gateway → services → DB → network) stays lean; every committed change is captured out of band and fanned out to independent consumers."
flowchart TB
    Merchant["Merchant server"]
    Merchant -->|"POST /payment-intents"| Gateway["API Gateway — auth, rate limit"]
    Merchant -->|"POST .../transactions"| Gateway
    Gateway -->|"create / read intent"| PI["PaymentIntent Service"]
    Gateway -->|"charge card"| Tx["Transaction Service — sole PCI scope"]
    PI -->|"read / write"| DB[("Operational DB")]
    Tx -->|"read / write"| DB
    Tx -.->|"authorize / capture"| Network["Payment network"]:::ext
    DB -->|"CDC tails write-ahead log"| Stream[("Event stream")]
    Stream -->|"change events, read independently"| Consumers["Audit · Reconciliation · Webhooks"]
    Consumers -.->|"signed webhook callback"| Merchant
    classDef ext stroke-dasharray:4 4;
```

## Deep dives
<!--meta block=deepdives-->

### 1 · Proving who's calling, and protecting the card

"Be secure" hides two questions: is the caller really this merchant, and is the customer's card data safe.

A static API key sent on every request is a good-not-great answer — sniff it once and it replays forever, and keys have a habit of ending up hard-coded in a client repo. The stronger scheme keeps a public key for identity and a private secret that never leaves the merchant's server, and signs each request: an HMAC (hash-based message authentication code)-SHA256 over the method, path, body, a timestamp and a nonce, carried in headers. The [API gateway](../patterns/distributed/routing/api-gateway.md) is the single [authenticated](../patterns/security/authentication-enforcer.md) entry point — it recomputes the signature and rejects a mismatch, rejects a timestamp outside a 5–15 minute window, and rejects a nonce it has seen before. That buys authenticity and integrity and closes the replay window.

Card data should never touch the merchant's servers — that is a PCI-DSS requirement, not a nicety, and every server it touches becomes an attack surface the merchant is liable for. An iframe served from our own domain collects the card directly, so the browser's same-origin policy keeps merchant JavaScript out of it. Better still, the SDK encrypts the card with our public key the moment it is entered, before it leaves the device; the matching private key lives in a hardware security module server-side, and HTTPS then carries data that is already encrypted. The layers are the point — a single compromised iframe still does not expose the number.

### 2 · Never losing a transaction record

Losing a payment record is a legal event: PCI-DSS, SOX and financial auditors want the full sequence of every attempt, success and failure — not just the current row, but who changed what and when, to defend chargebacks and reconstruct account state.

Mutating rows in place (`UPDATE ... SET status = 'captured'`) throws that history away and can be silently corrupted by a bad deploy with no trace of the prior value. Writing an append-only audit row inside the same transaction is better, but it leans on every code path remembering to write both — one missed insert and the history is gone — and it welds an ever-growing audit table onto the hot 10k-TPS operational store, so neither can be tuned in isolation.

The durable answer moves capture below the application. [Change data capture](../patterns/distributed/coordination/change-data-capture.md) tails the database's write-ahead log and publishes every committed change — full before/after state, keyed by `payment_intent_id` — onto an immutable [event stream](../patterns/architecture/event-sourcing.md). Nothing depends on application code remembering: anything that commits appears in the log. From that one stream, specialized consumers build whatever they need without touching the operational DB — a compliance-grade audit history, denormalized analytics, reconciliation, webhook delivery — each a [materialized view](../patterns/distributed/coordination/materialized-view.md) of the same ordered events. The stream keeps a few weeks on disk at replication factor 3 and archives everything to [object storage](../patterns/distributed/routing/object-storage.md) for audits years later. Merchants still get sub-10ms responses from the lean operational DB; the history is captured entirely out of band.

### 3 · Staying correct when the network answers late

The payment network is an external system with its own retries, queues and batch windows. A "timed out" charge might still be mid-flight; a "success" might be lost on the way back. Treating a [timeout](../patterns/distributed/resilience/timeout-deadline.md) as a failure is precisely how a customer gets charged twice — the bank debited $200, the response was lost, we said "failed", the merchant asked the customer to retry, and now there are two $200 charges for one order.

Two mechanisms fix it. First, [idempotency](../patterns/messaging/idempotency.md): a unique constraint on `(merchant_id, idempotency_key)` means a retried request returns the existing charge instead of creating a second one. Second, a timeout becomes its own state rather than a verdict. Before calling the network the system writes an attempt record — which itself becomes a change event — then branches on the outcome: success and explicit decline update the record, while a timeout writes a `pending` state that the reconciliation consumer picks up and resolves by querying the network with the recorded reference id, falling back to the network's daily batch files as the definitive record. The design target is [eventual consistency](../themes/consistency-and-replication.md), not a fight against asynchrony: whenever the network's answer arrives, that is the truth, and the durability spine already tracks every attempt on the way there.

### 4 · Scaling to 10,000 TPS

With the system designed, scale is mostly mechanical. Services are stateless and scale horizontally behind load balancers. The event stream is partitioned by `payment_intent_id`, which keeps every transition of one intent ordered (`created → authorized → captured` processed in sequence) while letting different intents run in parallel; 3–5 partitions at replication factor 3 cover the load, with a consumer group per service. The operational DB is the pressure point — ~10k writes/sec is the edge of one node — so [shard](../patterns/distributed/routing/sharding.md) by `merchant_id`, add read replicas for the status-check reads that dominate the workload, and put a Redis cache in front of recent statuses. Storage grows ~160&nbsp;TB/year, so a scheduled job moves anything past the retention window to cold object storage, still queryable for compliance but off the operational path.

### 5 · Pushing status instead of polling

Polling `GET /payment-intents/{id}` works, but merchants usually want to be told so they can fulfil an order the moment a charge succeeds. A webhook service consumes the same event stream; when a merchant has subscribed to an event type, it signs a payload with a shared secret and POSTs it to their callback URL. Delivery is server-to-server and inherently unreliable, so every attempt is recorded and failures [retry with exponential backoff](../patterns/distributed/resilience/retry-backoff.md) — 5s, 25s, 125s, up to about an hour — until the merchant returns a 2xx. It reuses the durability spine rather than standing up a parallel one, which is why webhooks, reconciliation and audit all read from the same log.

```mermaid caption="What states a payment attempt can reach, and how a network timeout resolves through reconciliation."
stateDiagram-v2
    [*] --> Created
    Created --> Authorized: network approves
    Created --> Declined: network declines
    Created --> Pending: network timeout
    Pending --> Authorized: reconciler finds success
    Pending --> Declined: reconciler finds decline
    Authorized --> Captured: funds captured
    Captured --> [*]
    Declined --> [*]
```

## Limitations & trade-offs
<!--meta block=tradeoffs-->

### What it buys
<!--meta polarity=pro-->

- Merchants get sub-10ms responses from a lean operational DB while every change is still captured independently in the event stream.
- No transaction record can be silently lost — capture happens below the application, so a forgotten audit write is impossible.
- A timeout is a state to resolve, not a lost payment: idempotency plus reconciliation against the network's own record kills double-charges.

### What it gives up
<!--meta polarity=con-->

- Audit, reconciliation and webhooks are all eventually consistent — a merchant may see `processing` for seconds while the stream catches up.
- CDC is a single logical choke point: if it stalls, DB writes continue but events stop, so it needs redundant instances and second-level lag alerting.
- Correctness ultimately depends on an external network answering — reconciliation can only converge as fast as the network's batch files and query APIs allow.

## What's expected at each level
<!--meta block=levels-->

- **Mid-level** — a working end-to-end flow (create intent → charge → status), recognising that card data must not touch merchant servers. A plain "timeout means failure" consistency answer is acceptable if the reasoning is spoken aloud; the interviewer will drive the harder parts.
- **Senior** — moves through the basics quickly and steers to the non-functional core early. Proposes iframe isolation and explains why it beats server-side collection; sees that a timeout is not a failure and reaches for idempotent charges with pending-state resolution, naming the double-charge race; talks confident horizontal scaling, with a nudge for partitioning strategy.
- **Staff+** — judges whether the complexity is warranted, framing event-driven reconciliation as matching how financial systems actually work rather than a reflex. Explains defense-in-depth for card data (tokenization plus client-side encryption) and volunteers the hard edges: payment-network outages with fallback paths, and reconciliation that guarantees eventual consistency with a system it does not control.

## Patterns it demonstrates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Demonstrates**

- [Change Data Capture](../patterns/distributed/coordination/change-data-capture.md) — CDC tails the DB write-ahead log so every committed change becomes an event with no reliance on application code remembering to log
- [Event Sourcing](../patterns/architecture/event-sourcing.md) — the immutable ordered event stream is the source of truth for audit, reconciliation and history, not just the current DB row
- [Idempotency](../patterns/messaging/idempotency.md) — a unique constraint on (merchant_id, idempotency_key) makes a retried charge return the existing record instead of charging twice
- [Materialized View](../patterns/distributed/coordination/materialized-view.md) — audit, analytics, reconciliation and webhook consumers each build their own view off the same event stream without touching the operational DB
- [API Gateway](../patterns/distributed/routing/api-gateway.md) — a single gateway authenticates the merchant, rate-limits and routes to the PaymentIntent and Transaction services
- [Authentication Enforcer](../patterns/security/authentication-enforcer.md) — the gateway verifies an HMAC-SHA256 request signature plus timestamp and nonce before any handler runs
- [Timeout / Deadline](../patterns/distributed/resilience/timeout-deadline.md) — a bounded timeout on the external network call is treated as a distinct pending state to reconcile, never as a failure
- [Retry with Backoff](../patterns/distributed/resilience/retry-backoff.md) — webhook delivery to merchant callback URLs retries on failure with exponential backoff (5s, 25s, 125s, up to an hour)
- [Sharding](../patterns/distributed/routing/sharding.md) — the operational DB is sharded by merchant_id to push past the ~10k writes/sec ceiling of a single node
- [Write-Ahead Log](../patterns/distributed/coordination/write-ahead-log.md) — Change data capture tails the database's write-ahead log and publishes every committed change onto an event stream

<!-- relationships:end -->
