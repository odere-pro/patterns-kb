---
title: Synchronous I/O
description: "A thread sits blocked while I/O completes, doing no work"
area: hazards
owner: Oleksandr Derechei
tags: [performance, asynchrony, throughput, resource-management]
status: stable
aliases: [blocking I/O, blocking calls]
solves: [requests queue while the CPU sits nearly idle, every worker thread is parked on the same call in the thread dump, adding more threads is the only thing that helps and it stops helping, a slow dependency turns into timeouts on unrelated endpoints, the server reports it is out of capacity on a machine that is not busy]
---

# Synchronous I/O

A thread issues an I/O call and then waits, holding its stack and its memory but consuming no processor, until the answer arrives. The work the machine could be doing meanwhile is not done, and the number of requests the process can have in flight is capped by how many threads it can afford rather than by how much work it can do.

## What it is
<!--meta block=description-->

**Synchronous I/O** blocks the calling thread until the operation completes — a read from a store, a call to a remote service, a message taken from a queue, a write to a file. During the wait the thread does nothing and cannot be given to anyone else, because its stack is mid-call. That is affordable when the wait is microseconds and the callers are few. It stops being affordable when the wait is a network round-trip and the process is meant to serve thousands of concurrent requests: the threads are all present, all idle, and all unavailable.

The distinctive symptom is a saturated system that is not busy. Processor utilization sits low while the request queue grows and new arrivals wait for a thread rather than for the work; latency stays flat and then goes vertical at the point where every worker is blocked. A thread dump taken at that moment is the proof — nearly every worker parked on the same call. It also spreads: a single blocking call buried inside a library blocks whatever calls it, so an otherwise asynchronous path is only as non-blocking as its most synchronous link.

## Explained
<!--meta block=explain-->

Synchronous I/O makes the calling thread wait, doing nothing, until a read, a remote call or a queue message completes. The thread cannot serve anyone else meanwhile, because its stack is mid-call. That is fine when waits are microseconds and callers few. When waits stretch to milliseconds and callers number thousands, you run out of threads long before you run out of processor. The telltale is a saturated system that is not busy: the processor is low, requests queue and a thread dump shows nearly every worker parked on the same call. The request must wait for its answer, but the thread need not, so release the thread. Choose non-blocking calls over a bigger pool of threads, since each thread costs memory and scheduling and a larger pool only moves the ceiling. A reactor, a few threads waiting on many sources and handling each event as it is ready, holds tens of thousands of open calls on a handful of workers. It costs clarity, since the straight-line code becomes continuations and stack traces stop showing the path, so carry a correlation id explicitly. Run unavoidable blocking libraries on a separate bounded pool, or they stall the event thread. The bottleneck moves downstream, so cap that too.

**Example.** A service has 200 request threads, and each request blocks 200 ms on a database call. It can finish 200 / 0.2 = 1,000 requests a second. Traffic reaches 1,200 a second, which needs 1,200 x 0.2 = 240 threads, so requests queue and the processor sits near 5%. If the database slows to 1 s, capacity falls to 200 a second. With non-blocking calls on 4 event threads, 240 calls in flight are just 240 small records, and the threads stay free. The cost is that stack traces no longer show who called whom, and the database now receives all 1,200 a second.

## How it happens
<!--meta block=causes-->

```mermaid caption="Each worker is held for the whole round-trip at step 2–3, so the pool empties long before the machine is busy. Arrivals then queue for a thread rather than for work, and the failure at step 6 is a wait for capacity that exists but is parked."
flowchart TB
    A["Arriving requests"] -->|"1 · take a worker"| B["Worker thread pool<br/>fixed size"]
    B -->|"2 · issue the call and block"| C["Remote store or service"]
    C -->|"3 · answer, tens of ms later"| B
    B -->|"4 · worker freed"| D["Response"]
    A -->|"5 · no worker left"| E["Request queue grows"]
    E -->|"6 · wait exceeds the limit"| F["Timeouts, while the processor idles"]
```

- **It is the obvious way to write it.** Call, get an answer, use the answer — the code reads top to bottom and matches how the operation is described. The asynchronous version says the same thing with more ceremony, and nothing in the source hints at what the blocking version costs under load.
- **The result is genuinely needed next.** Where the following line depends on the value, waiting feels not merely simplest but mandatory — and the distinction that matters, between this request waiting and this thread waiting, is invisible from inside the function.
- **The library offers nothing else.** A dependency exposing only blocking calls forces its callers to block, whatever the surrounding code intended.
- **A blocking call hides inside an asynchronous one.** A method whose signature promises not to block can still perform synchronous I/O internally, so a single such link makes the whole chain above it synchronous while its callers still believe otherwise.
- **Small waits are assumed to stay small.** A call that was a local file read or an in-memory lookup when it was written keeps its blocking shape after the thing it reads moves behind a network, where the wait is three orders of magnitude longer.

## What it costs
<!--meta block=cost-->

- **Concurrency is capped by threads, not by work.** The number of requests the process can have in flight equals the number of workers, so a wait of tens of milliseconds sets a ceiling on throughput that no amount of spare processor can lift.
- **The machine idles while the queue grows.** Utilization stays low and requests still time out, which is the most misleading pair of numbers in an incident — the system looks under-loaded exactly as it fails.
- **Each blocked worker holds memory it is not using.** Its stack stays allocated for the whole wait, so raising the pool size to compensate buys concurrency in exchange for footprint and for scheduler time spent switching between threads that are all doing nothing.
- **It couples your availability to theirs.** A dependency that slows down converts directly into exhausted workers here, so their latency becomes your outage — the mechanism behind [Cascading Failure](./cascading-failure.md).
- **The collapse is a cliff.** While a worker is free, latency is the dependency's latency; once the last one is taken, every arrival waits for a whole round-trip before it even starts, and response time steps up by a multiple rather than drifting.

## Getting out
<!--meta block=mitigation-->

Stop conflating the request waiting with the thread waiting. The request must wait for its answer; the thread need not, and releasing it is the whole of the fix. Where the runtime offers a non-blocking version of the call, take it — the operation is registered, the worker goes back to the pool, and the continuation runs when the answer arrives, so one worker can carry many requests in flight. A **[Future / Promise](../patterns/concurrency/future-promise.md)** is how that pending answer is named and composed while the thread that asked for it is somewhere else.

Underneath, this is the **[Reactor](../patterns/concurrency/reactor.md)**: a small number of threads waiting on many I/O sources at once and dispatching each event as it becomes ready, instead of one thread per outstanding operation. It is what lets a process hold tens of thousands of open calls on a handful of workers. The price is real — the linear story becomes a set of continuations, stack traces stop describing the call path, and any genuinely blocking work dropped into an event-loop thread stalls every request that thread was carrying, not just its own.

Wrapping a blocking call in an asynchronous signature does not remove the block; it moves it to another thread, and that thread is now blocked instead. Done deliberately — on a bounded pool kept separate from the request path — it is a reasonable containment for a library you cannot change, and it is a form of [Bulkhead](../patterns/distributed/resilience/bulkhead.md): the blocking work can exhaust its own pool without touching the workers answering requests. Done accidentally, it adds a hop and a context switch to buy nothing.

Not every call should change. An operation that is genuinely short and uncontended can cost more to dispatch and re-synchronize than it costs to wait for, so measure before converting; the general rule holds because most I/O is neither. And expect the bottleneck to move rather than vanish: unblocking the threads raises how many requests reach the dependency at once, which turns a thread-starved caller into a saturated store or a throttled downstream. Pair the change with a limit on concurrent calls and a deadline on each one, or you have simply relocated the queue to somewhere with less control over it.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Mitigated by**

- [Reactor](../patterns/concurrency/reactor.md) — A few threads wait on many I/O sources at once, so concurrency stops being capped by thread count
- [Future / Promise](../patterns/concurrency/future-promise.md) — Name the pending answer so the request can wait without its thread waiting too

<!-- relationships:end -->
