---
title: Unbounded Queue
description: A queue with no capacity cap grows until the process runs out of memory
area: hazards
owner: Oleksandr Derechei
tags: [concurrency, resource-management, backpressure, throughput]
status: stable
aliases: [unbounded buffer, memory blowup]
solves: [the backlog grows until the process runs out of memory, producers outran the workers and the depth never came back down, queue depth climbs and the heap climbs with it until we get an out-of-memory kill, there is no cap on in-flight work and the pod gets killed]
---

# Unbounded Queue

An in-memory buffer or per-key state map with no capacity limit keeps accepting work faster than it drains, and because every queued item is a live heap object it grows without bound — until the process runs out of memory and takes the entire service down with it.

## What it is
<!--meta block=description-->

An **unbounded queue** is an in-memory buffer created with no ceiling on how many items it will hold. Think of a task scheduler that pushes work off the request path — welcome emails, thumbnail resizing, monthly reports — onto a queue that a pool of worker threads drains. As long as workers keep pace, the queue stays shallow and nothing is wrong. But the moment producers outrun consumers, depth climbs, and with no capacity limit there is nothing to stop it: every queued item is a live object on the heap, so the queue grows in lockstep with memory until there is none left.

It wears two faces. The obvious one is a producer–consumer buffer that fills faster than it empties — a burst of traffic enqueues thousands of tasks that a fixed [worker pool](../patterns/concurrency/thread-pool.md) needs minutes to clear. The quieter one is a per-key state map that only ever grows: rate-limiter buckets keyed by client id, a session cache, a dedup set — one entry added the first time each key is seen and never removed. That second shape is a slow, hidden memory leak that can run for days before it tips over. Both end the same way: the heap fills, and the process dies.

## Explained
<!--meta block=explain-->

An unbounded queue is an in-memory buffer with no ceiling on how many items it holds. While workers keep up, it stays shallow and looks fine. When work arrives faster than workers drain it, the backlog grows until memory runs out and the process dies, taking every queued item with it. A quieter form is a map keyed by client or session that only ever adds entries. Long before memory is gone, the waits grow too, so you serve work whose value expired some time ago. Choose a bound over a bigger machine: more memory only delays the crash and lengthens the wait. Size the bound from how long an item is still worth doing, as drain rate times that time, not from the memory you have. Then choose what happens when the queue is full. Block the producer, which slows a fast producer down and suits internal pipelines. Reject the new item at once with a clear error, which suits requests from outside. Or drop the oldest, which suits data where only the latest matters. Each choice is a product decision about which work is lost. Where no queue object exists, cap in-flight work with a fixed number of permits, using a semaphore.

**Example.** A pool of 4 workers resizes images at 10 a second each, so 40 a second. A 10-minute spike brings 100 a second, so the queue grows by 60 a second. After 600 s it holds 36,000 items of 50 KB, 1.8 GB, on a 1 GB heap, so the process crashes and loses every job. Valuable work is worth doing for 5 s, so a bound of 40 x 5 = 200 items is enough. During the spike 60 a second are refused with a 503 while the admitted jobs finish within 5 s. The cost is that 60% of spike traffic is rejected and clients must handle that.

## How it happens
<!--meta block=causes-->

```mermaid caption="The queue absorbs the gap between the arrival rate and the drain rate, turning a throughput shortfall into a memory debt that stays invisible until the heap is gone."
flowchart TB
    P["Producers enqueue 10k tasks/min"] -->|"accepted unconditionally"| Q[("Task queue, no capacity limit")]
    Q -->|"drained at 2k tasks/min"| W["Fixed worker pool"]
    Q -->|"the 8k/min shortfall stays resident"| H["Heap fills — every queued item is a live object"]
    H -->|"collector works harder, queued work ages"| D["Latency and GC cost degrade first"]
    D -->|"memory exhausted"| O["OutOfMemoryError kills the whole process"]
```

- **A queue created with no capacity argument.** The default constructor of many blocking queues — a `LinkedBlockingQueue` with no size, a plain in-memory list — imposes no upper limit at all. The code looks correct and works fine at low load; the missing ceiling only matters once the queue starts to back up.
- **Producers outpacing consumers.** A spike — a marketing blast, a viral event, a [retry storm](./retry-storm.md) — enqueues work far faster than a fixed pool of workers can drain it. Depth climbs from thousands to millions in the width of the burst, and each item sits in memory until a worker finally reaches it.
- **A per-key state map that is never evicted.** One entry per unique client, session, or key — added on first sight, never removed. Because the map grows with the cardinality of the keyspace rather than with instantaneous load, it leaks slowly and invisibly for as long as new keys keep arriving.
- **No [backpressure](../patterns/concurrency/backpressure.md) in the accept path.** Work is taken in unconditionally, with no signal back to the producer to slow down when the buffer is already deep. Nothing couples the rate of arrival to the rate of drain, so the buffer is free to absorb an unlimited backlog.

## What it costs
<!--meta block=cost-->

- **The whole process dies, not just the pipeline.** An `OutOfMemoryError` is not scoped to the background queue that caused it — it takes down everything sharing that heap. The API handlers, the request threads, the health endpoint all die together, so a runaway background buffer produces a total, foreground outage.
- **The failure is gradual and easy to miss.** Memory creeps up over hours or days while every dashboard looks healthy; there is no error, no slow query, just a line trending upward that nobody is watching. The system gives almost no warning until the heap is exhausted and it crashes all at once.
- **Latency and garbage collection (GC) pressure degrade well before the crash.** As depth grows, queued work waits minutes instead of milliseconds, and the garbage collector burns more and more CPU trying to manage a heap that keeps filling — so the service is already limping before it finally falls over.
- **Recovery can loop.** The crash loses everything buffered in memory, and if the load that caused it hasn't subsided, the restarted process refills the same unbounded buffer and crashes again — a crash loop that only ends when the upstream pressure relents.

## Getting out
<!--meta block=mitigation-->

The root fix is to **give the queue a bounded capacity** and decide explicitly what happens when it is full — an overflow policy. There are three honest choices, matched to the workload: block the producer until space frees up, which slows a fast producer down and is right for internal pipelines that can afford to wait; reject the item with an immediate "system busy" response (a 503), which is right for request paths that must answer fast rather than stall; or drop the oldest or newest item and log it, which is right for lossy streams like analytics where shedding load under pressure is acceptable. The one policy that is never acceptable is "accept forever."

A bounded queue also gives you **backpressure** for free: when the buffer is full a blocking put slows the producer before memory can overflow, coupling the rate of arrival to the rate of drain. Where there is no queue object to bound — a burst of concurrent operations rather than a stream of tasks — cap the in-flight work with a fixed number of **permits** so only so much can be outstanding at once. And for the per-key state map, the equivalent of a capacity limit is an **eviction policy**: a TTL (time to live), an LRU (least recently used) cap, or idle-eviction, so entries expire instead of accumulating for the lifetime of the process. In every case the move is the same — put a ceiling on the structure, then choose deliberately what happens when it is reached.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Poison Message](./poison-message.md) — A stuck consumer lets an unbounded queue grow without limit.

**Mitigated by**

- [Backpressure](../patterns/concurrency/backpressure.md) — Signal the producer to slow down before the buffer can overflow
- [Producer-Consumer](../patterns/concurrency/producer-consumer.md) — A bounded blocking queue makes a fast producer wait instead of growing without limit
- [Semaphore](../patterns/concurrency/semaphore.md) — Fixed permits cap in-flight work when there's no queue object to bound
- [Token Bucket](../patterns/distributed/resilience/token-bucket.md) — Rate-limit intake so the backlog can't outrun the consumer indefinitely
- [Fail Fast](../principles/fail-fast.md) — Rejecting at the cap is failing fast instead of buffering forever

<!-- relationships:end -->
