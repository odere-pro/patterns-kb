---
title: Data Platform
description: Choosing and configuring the stores that hold state when the compute is disposable
area: themes-operating
owner: Oleksandr Derechei
tags: [persistence, availability, durability]
status: stable
---

# Data Platform

Which stores a system needs, how each is configured, and what the durable tier owes an application whose compute can be destroyed and rebuilt at any moment.

## The question
<!--meta block=description-->

The moment compute becomes disposable, every question about state moves to one place and gets sharper. The application can be deleted and rebuilt at will; the data cannot. So the store is no longer one component among many — it is the part of the system that has to outlive everything else, be reachable from every region the application runs in, and keep working when one of those regions does not.

That produces a short list of decisions, and getting any of them wrong is expensive to reverse. Which stores exist and what each is for. Where writes are accepted and what happens when two regions accept conflicting ones. How the data is partitioned, and against which ceiling. And how a write that leaves the application actually reaches the store, given that the application and the broker are two systems with no shared transaction.

Two stores usually earn their place, and confusing them causes real damage. A durable store holds the system of record: globally replicated, long-lived, the thing everything else is reconstructed from. A broker holds work in flight: it buffers a burst, it decouples the producer from the consumer, and it retains messages for minutes or hours rather than forever. Using the broker as a database is the characteristic mistake — retention is not durability, and a replay is not a query.

Accepting writes in more than one region is where the difficulty concentrates. Local writes are fast and survive a regional failure, and they make simultaneous conflicting updates possible, which means adopting a resolution policy — last writer wins by timestamp is the common default and it silently discards the loser. Accepting writes in one region only removes conflicts and makes every remote writer pay the round trip, and makes losing that region a bigger event.

Partitioning is the decision with the most delayed feedback. The key determines both how evenly load spreads and which ceiling you hit: many stores cap the size or throughput of a single logical partition, and a key that concentrates related records will meet that cap long before the account limits matter. It behaves perfectly until the day one partition is full, and by then the data is already distributed by that key.

## Explained
<!--meta block=explain-->

A data platform is the set of stores that must outlive your disposable compute, and the decision that shapes it is where writes are accepted. If every region accepts writes, each write is fast and survives the loss of a region, but two regions can change the same record at once, so you need a rule for which version wins. The common rule, last writer wins by timestamp, quietly throws the loser away. If one region accepts writes, there is one truth and no rule to write, but every far-away user pays the round trip on each write, and losing that region stops all writes. Choose local writes when users are spread across continents and a lost edit is cheap, and one write region when a lost edit is a bug. Keep two stores: a durable database for the system of record and a message broker for work in flight, because a broker keeps messages for hours, not forever. Pick the partition key with care, since a key that piles related records into one partition hits that partition's size cap long before your account limits matter. And add a version check so a conflict is detected instead of silently resolved.

**Example.** A profile service runs in the US and in Europe, 90 ms apart. With one write region in the US, a European user waits 90 ms on every save. With local writes it takes 5 ms. Then a user edits the profile on a laptop in Europe at 10:00:00.000 and on a phone in the US at 10:00:00.020. Timestamp rules keep the phone edit and silently drop the laptop edit. With a version number on the record, the second write is rejected because it was based on an old version, and the app can ask the user. That is the cost of local writes: you must write the conflict handling.

## The tradespace
<!--meta block=tradespace-->

The central trade is between writing locally and agreeing globally. Accept writes in every region and each one is fast and independently survivable, and you have signed up for conflicts and for a policy that decides which version of the truth is kept. Accept them in one region and there is one truth and no policy to write, and every other region pays the distance on every write, and that region's failure is now the system's.

A second trade sits in how strictly reads must agree with writes. Strong guarantees remove a whole class of confusing behaviour and cost latency, throughput and — with multi-region writes — availability, because the strongest levels are simply not on offer once several regions accept writes. Weaker levels are cheaper and put the burden on the application to tolerate reading something slightly behind what it just wrote.

The third is index and shape against cost. Indexing everything makes any query possible and makes every write pay for indexes nobody queries; indexing only the fields that appear in predicates cuts write cost measurably and turns tomorrow's unforeseen query into a scan. This is the one that is cheap to revisit, which is why it is worth deciding deliberately rather than defaulting.

**Write locally and reconcile, or write in one place and pay the distance — there is no arrangement that avoids both.**

## The tour
<!--meta block=tour-->

<!-- tour:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

### [Replication](../patterns/distributed/coordination/replication.md) {#tour-replication}

The store outlives the compute, so it has to survive the loss of any one place the compute runs. Copies in every region make reads local and a regional failure survivable, and they are what force the decision about where writes are accepted — the choice this whole theme circles.

### [Sharding](../patterns/distributed/routing/sharding.md) {#tour-sharding}

Splitting by key is how a store scales past one machine, and the key choice is the most consequential and least reversible decision here: it sets how evenly traffic lands, and it decides which per-partition size or throughput limit you will eventually meet.

### [Message Queue](../patterns/messaging/message-queue.md) {#tour-message-queue}

The second store, and a different job: buffer a burst so the durable tier is written at a rate it can sustain, and decouple the component accepting work from the one doing it. Retention here is a delivery window rather than durability, which is why the processed result still has to land in the database.

### [Idempotency](../patterns/messaging/idempotency.md) {#tour-idempotency}

Brokers deliver at least once by design, so a handler that writes must produce the same result on a replay. The usual guard is a record of what has already been processed, checked inside the same transaction as the write it protects.

### [Outbox](../patterns/distributed/coordination/outbox.md) {#tour-outbox}

The store and the broker are separate systems with no shared transaction, so publishing before the commit can announce something that gets rolled back, and publishing after it can lose the announcement entirely. Writing the message into the same transaction as the data, and relaying it afterwards, is what closes that gap.

### [Optimistic Concurrency Control](../patterns/distributed/coordination/optimistic-concurrency-control.md) {#tour-optimistic-concurrency-control}

When two writers touch the same record, a version check turns a silent overwrite into a detected conflict the application can resolve. It is the alternative to accepting whatever the store's default resolution policy would have discarded on your behalf.

### [Dead Letter Channel](../patterns/messaging/dead-letter-channel.md) {#tour-dead-letter-channel}

Some messages fail every time, and retrying them forever blocks everything queued behind them. Moving them aside after a bounded number of attempts keeps the pipeline draining and leaves the poison message somewhere a person can inspect, correct and replay it.

<!-- tour:end -->

## When to reach for what
<!--meta block=decide-->

| If you need… | Move | Reach for |
| --- | --- | --- |
| Data reachable and survivable across regions | Copies everywhere | [Replication](../patterns/distributed/coordination/replication.md) |
| Capacity past what one machine holds | Split by key | [Sharding](../patterns/distributed/routing/sharding.md) |
| To absorb a burst without overwhelming the store | Buffer in flight | [Message Queue](../patterns/messaging/message-queue.md) |
| The event and the state change to be all-or-nothing | One transaction | [Outbox](../patterns/distributed/coordination/outbox.md) |
| A replayed message not to write twice | Guard the write | [Idempotency](../patterns/messaging/idempotency.md) |
| Concurrent writers detected rather than silently merged | Check the version | [Optimistic Concurrency Control](../patterns/distributed/coordination/optimistic-concurrency-control.md) |
| A poison message out of the way of everything behind it | Park after N tries | [Dead Letter Channel](../patterns/messaging/dead-letter-channel.md) |

## Related areas
<!--meta block=siblings-->

- [Consistency & Replication](./consistency-and-replication.md) — The mechanics underneath the choice made here — how copies actually agree, and what each consistency level costs.
- [Scale Units & Stamps](./scale-units-and-stamps.md) — Why the store has to sit outside the unit, and why that makes it the one component whose failure is not contained.
- [Scaling Writes](./scaling-writes.md) — Pushing write capacity past a single primary, of which partitioning and buffering are two moves.
- [CAP Theorem](./cap-theorem.md) — The formal statement of the trade this theme keeps meeting: during a partition, consistency or availability, never both.
