---
title: Busy Front End
description: Background work on the threads meant to answer requests
area: hazards
owner: Oleksandr Derechei
tags: [performance, isolation, resource-management, throughput]
status: stable
aliases: [background work on the web tier]
solves: [a trivial endpoint got slow whenever people upload files, we moved the heavy work to a background thread and the server still fell over, one expensive operation drags down every other route on the tier, background jobs vanish when we deploy, CPU pins at 100 percent and every response slows together]
---

# Busy Front End

A request-handling tier runs heavy work in the background so that the request can return quickly. The request does return quickly, and the work keeps consuming the same processor, memory and bandwidth the tier needs to answer everyone else — so unrelated, cheap requests slow down for reasons their own code cannot explain.

## What it is
<!--meta block=description-->

A **busy front end** is a request-serving process that also performs its own heavy lifting — resizing the image, rendering the report, running the import — on threads spawned beside the ones answering requests. The intent is sound and the first half of it works: handing the work to a background thread lets the request return immediately instead of holding the caller for a minute. What the move does not do is make the work free. It still runs on this machine, competing for the same processor and memory as every request the tier is trying to serve, and now nothing limits how many of these jobs can be started at once.

The symptom that identifies it is collateral damage. The expensive operation looks acceptable, while a trivial unrelated endpoint on the same tier degrades in step with how often the expensive one is called — its own dependencies healthy, its own code unchanged. Utilization pins at the ceiling, throughput flattens for every route at once, and the failures that surface are generic capacity errors rather than anything naming the real culprit. The correlation to look for is between one operation's call rate and every other operation's latency.

## Explained
<!--meta block=explain-->

A busy front end is a web tier that also does heavy work itself, such as resizing images or running imports, on background threads started beside the ones answering requests. Starting the work on a thread frees the caller at once, which feels like offloading, but the work still uses the same processor and memory as every other request. Nothing caps how many such jobs run together, so their number follows how many users ask, not what you planned for. The symptom is collateral damage: a trivial endpoint slows down in step with how often the heavy one is called, and the errors are generic timeouts that name no culprit. A job held only in memory is also lost when the process restarts, though the caller was told it was accepted. Choose a separate worker tier over adding more front-end servers, because more servers only buy headroom in proportion to their number and leave the coupling in place. The front end writes the job to a queue and returns, and workers drain it at a rate they can sustain. Cap the queue and reject at the front door, or it becomes an unbounded queue. If the work must stay in-process, give it a small fixed pool of its own.

**Example.** A front end with 8 cores handles 400 profile requests a second at 5 ms each, so 2 cores. Each photo upload also starts a thread that spends 2 s of processor time resizing. At 3 uploads a second that is 6 cores, so all 8 are busy and profile calls start to queue. Move resizing to 4 worker cores, which finish 4 x 0.5 = 2 jobs a second, behind a queue capped at 100 jobs. A 10 s burst of 6 uploads a second adds 60 jobs and drains 20, so 40 wait, well under the cap. Profile latency stays flat. The cost is that uploads finish later, and the caller now polls for the result.

## How it happens
<!--meta block=causes-->

```mermaid caption="Step 2 is the illusion: the caller is released while the work at step 3 continues on the machine. Nothing bounds how many such jobs run at once, so the cheap request at step 4 competes with all of them and degrades for reasons its own code cannot show."
flowchart TB
    A["Expensive request"] -->|"1 · start a background thread"| B["Front-end process"]
    A -->|"2 · return immediately"| C["Caller — looks fast"]
    B -->|"3 · heavy work keeps running"| D["Shared CPU, memory, bandwidth"]
    E["Cheap unrelated request"] -->|"4 · needs the same resources"| D
    D -->|"5 · demand exceeds the host"| F["Every route slows together"]
```

- **Returning early is mistaken for offloading.** Moving the work off the request thread solves a real problem — the caller no longer waits — and is read as having solved the resource problem too, which it never touched.
- **Presentation and processing share one deployable.** When the tier that speaks to clients also holds the business logic, there is no other place for heavy work to go, and putting it on a thread is the only separation available.
- **Nothing caps how many jobs run at once.** One background job per request means the concurrency of the heavy work is set by arrival rate — a quantity chosen by users rather than by capacity planning.
- **Threads are treated as free.** Each one costs a stack, a scheduling slot and its share of the processor, so spawning per request degrades into contention and, past the runtime's limit, into failures to start a thread at all.
- **Scaling out the wrong tier hides it for a release.** Adding front-end instances buys headroom proportional to the added machines, so the fix looks to work while leaving the coupling — and the bill — exactly where it was.

## What it costs
<!--meta block=cost-->

- **Cheap requests pay for expensive ones.** Latency on an endpoint that does almost nothing is set by whatever else the tier happens to be running, so the experience of the whole product is governed by its heaviest operation.
- **The load is unbounded by construction.** Concurrency of the background work follows the arrival rate, so a burst of expensive requests translates directly into a resource level nobody sized for.
- **The two workloads cannot be scaled apart.** Serving more users and doing more heavy work need different amounts of different resources, and one deployable forces you to buy both whenever you need either.
- **Failures are opaque and generic.** What surfaces is timeouts and capacity errors across every route, so an incident starts by investigating the endpoints that are slow rather than the one that is guilty.
- **In-process work is lost when the process dies.** A background job holds no record outside the memory running it, so a deploy, a crash or an autoscaler scaling in discards work the caller was already told had been accepted.

## Getting out
<!--meta block=mitigation-->

Move the work off the machine, not just off the thread. The front end records the job and returns; a separate worker tier picks it up and does it. **[Queue-Based Load Leveling](../patterns/distributed/resilience/load-leveling.md)** is the shape: the queue absorbs the burst, and the workers drain it at whatever rate they can sustain, so demand that arrives in a spike is consumed as a flat line. That also fixes the durability hole — a queued job survives the process that accepted it, which an in-memory thread does not.

Size the two tiers independently once they are apart. **[Competing Consumers](../patterns/messaging/competing-consumers.md)** lets you add workers against queue depth without touching the request path, so throughput on the heavy work becomes a dial rather than a consequence of how many front ends you happen to be running. Depth is the signal to scale on, because it leads latency rather than following it. This does mean the work now takes longer end to end than it did when it ran locally — you have traded completion time for isolation, and callers need an honest way to learn the outcome, since the response no longer carries it.

Where the work genuinely must stay in-process, at least bound it. A **[Bulkhead](../patterns/distributed/resilience/bulkhead.md)** — a separate, fixed-size pool for the heavy work — means saturating it costs you that pool and not the workers answering requests: the expensive operation degrades, everything else keeps its latency. Sizing that pool is the whole decision, and it has to be small enough that the leftover capacity still serves the request path under peak.

Adding a queue relocates the failure rather than removing it, so decide in advance what happens when the workers cannot keep up. Depth grows without limit unless something stops it, which is [Unbounded Queue](./unbounded-queue.md) in a new place; cap it and reject at the front door instead. Decide too whose work gets dropped first — separating the queues by class, or holding a rate limit on the cheapest tier of caller, is what keeps a flood of low-value jobs from displacing the ones that matter. And make redelivery safe: a queue that guarantees delivery at least once will eventually hand the same job to two workers.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Mitigated by**

- [Queue-Based Load Leveling](../patterns/distributed/resilience/load-leveling.md) — Queue the heavy job and let a separate tier drain it at a rate it can sustain
- [Competing Consumers](../patterns/messaging/competing-consumers.md) — Scale the workers against queue depth, independently of how many front ends are running
- [Bulkhead](../patterns/distributed/resilience/bulkhead.md) — Where the work must stay in-process, a separate fixed pool keeps it from taking the request workers
- [Web-Queue-Worker](../patterns/architecture/web-queue-worker.md) — Put the heavy job on workers that drain a queue, away from the threads that answer users
- [Asynchronous Request-Reply](../patterns/distributed/routing/async-request-reply.md) — Give callers a handle to poll or a callback, since the response no longer carries the outcome

<!-- relationships:end -->
