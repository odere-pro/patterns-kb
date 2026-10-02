---
title: Resource Leak
description: "A resource acquired but never released, shrinking capacity until everything blocks"
area: hazards
owner: Oleksandr Derechei
tags: [concurrency, resource-management, lifecycle, error-handling]
status: stable
aliases: [connection leak, pool exhaustion, handle leak]
solves: [memory keeps growing until we restart the process, we restart the service every night to keep it healthy, open file handles and connections climb and never come back down, available capacity shrinks over days until everything blocks]
---

# Resource Leak

A pooled resource or permit — a database connection, a file handle, a semaphore permit, a lock — is acquired but never handed back, usually because an error slips past the release. Each leak permanently subtracts from a finite pool, so capacity quietly shrinks until every caller blocks forever, waiting on a resource that will never return.

## What it is
<!--meta block=description-->

A **resource leak** is what happens when a finite, pooled resource — a database connection, a file handle, a semaphore permit, a lock — is acquired but never released. These resources are deliberately limited and expensive: a connection pool might hold five or ten connections created once at startup and reused, because opening a new one costs sockets, memory, and setup time. Every request borrows one and is expected to give it back. A leak is a borrow with no return: the resource is checked out of the pool and simply never comes back, so the count of available resources drops by one, permanently.

The mechanism is almost always a missing release on the error path. Code acquires the resource, does some work, then an exception is thrown — or an early return is taken — before the release call runs, so control jumps straight past it and the resource is orphaned. Unlike most failures there is nothing dramatic to see: the process does not crash, no stack trace is printed, the borrowed handles just vanish from circulation one at a time. It is, for good reason, the very first bug an interviewer probes for in any pooling or concurrency design.

## Explained
<!--meta block=explain-->

A resource leak is a limited, shared resource, such as a database connection, a file handle, a lock or a permit, that is taken and never given back. The cause is almost always a missing release on the error path: code takes the resource, an exception or an early return skips the release call, and the resource is orphaned. Nothing crashes and no error appears, so each leak quietly shrinks the pool until the last one is gone and every caller waits forever. A leak looks like pool exhaustion from outside, but exhaustion recovers when you stop traffic and a leak does not. Choose a structural fix over a convention that every author must remember. Bind the release to the scope with a finally block, a with or using block, or a defer statement, so the error path frees the resource as surely as the normal path, and forgetting cannot be written. Add a timeout on acquiring, so a caller that cannot get a resource fails fast with a visible error instead of hanging. Then add backstops: a check that lent resources are still alive, and a limit on how long one may be held. Each backstop costs something. A hold limit reclaims a slow but legitimate borrower too early.

**Example.** A service has a pool of 10 database connections and takes 20 requests a second. One in a hundred requests hits an error path that skips the release, so 20 x 0.01 = 0.2 connections leak a second. The pool is empty after 10 / 0.2 = 50 s, and from then on every request hangs while the processor idles. Wrapping each use in a with block returns the connection on every path, so the leak rate is zero. A 2 s acquire timeout turns any future leak into a loud error after 2 s, not a silent hang. The cost is that any code passing a connection to another thread must now hand over ownership explicitly.

## How it happens
<!--meta block=causes-->

```mermaid caption="Each failure orphans one connection, so capacity erodes silently until the pool hits zero — hours later and far from the line that skipped the release."
flowchart TB
    A["Request acquires a pooled connection"] -->|"the work throws, or returns early"| B["Control jumps past the release call"]
    B -->|"nothing binds the release to the scope"| C["Connection orphaned — one fewer in the pool"]
    C -->|"once more per failed request"| D["Available count only ever falls"]
    D -->|"the last connection leaks"| E["Pool empty"]
    E -->|"acquire waits for a return that never comes"| F["Every caller hangs, with no exception raised"]
```

- **No guaranteed release on the error path.** The acquire and the release sit in separate statements, and an exception thrown between them — or an early `return` that skips the release — jumps past the hand-back entirely. Without a `finally`, a `with`/`using` block, or resource acquisition is initialization (RAII) to bind the release to the scope, the resource is orphaned the moment anything goes wrong.
- **A slow operation holding the resource too long.** No bug is even required. A query that stalls, or a downstream that hangs, keeps a connection checked out for seconds instead of milliseconds, so the pool drains under ordinary load simply because each borrow lasts far longer than the design assumed.
- **Unbounded, on-demand acquisition.** Creating resources on demand with no cap turns the leak into a different failure rather than preventing it: instead of blocking when the pool is empty, the code keeps opening new connections or handles that are never freed, exhausting the database's or OS's own limits.
- **Confused ownership.** A resource passed across threads or call boundaries, where it is unclear who is responsible for releasing it, gets released by nobody — or, just as damaging, released twice.

## What it costs
<!--meta block=cost-->

- **The pool exhausts and every caller blocks forever.** Once the last resource has leaked, an acquire that blocks until one is free will block indefinitely — because none ever will be. Callers pile up behind a queue that never advances, and the service stops responding entirely.
- **No errors anywhere — the tell-tale that makes it so hard to spot.** Nothing crashed, so monitoring shows zero exceptions; the database is healthy and nearly idle because almost nothing is reaching it. The dashboards say everything is fine while users see only timeouts: the database is fine, but your service is dead.
- **Request threads are consumed too.** Each blocked caller holds the worker thread it is running on, so the web tier's own [thread pool](../patterns/concurrency/thread-pool.md) fills with parked threads waiting on the drained resource pool — and the server stops accepting new work, spreading the stall outward from the leaked resource.
- **It is cumulative and delayed.** One leaked resource per error is invisible; capacity erodes slowly, request by request, until under load it reaches zero and the service falls over all at once — long after, and far from, the line of code that failed to release, which makes the cause maddening to trace.

## Getting out
<!--meta block=mitigation-->

The one fix that prevents the leak outright is to **bind the release to the scope** so the error path frees the resource just as surely as the happy path. A `finally` block, a `with`/`using` context manager, RAII, or a `defer` keeps the acquire and its guaranteed release together, so no exception or early return can slip between them. Acquire and release are a single unit; write them as one.

Then make the wait survivable. Add an **acquisition timeout** so a caller that cannot get a resource fails fast — returns a clear error or a 503 — instead of blocking forever; this alone converts the worst symptom of a leak, a service that hangs silently with no errors, into a handful of loud, visible failures you can alert on. **Validate or health-check** pooled resources before handing them out, discarding and replacing dead ones, so a stale connection is not mistaken for a leaked one. And **bound acquisition** and watch pool utilization: an in-use count that only ever climbs and never falls back is the unmistakable signature of a leak, and it is visible long before the pool hits zero.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Mitigated by**

- [Object Pool](../patterns/gof/extra/object-pool.md) — Checkout/return discipline and validation reclaim what callers forget to release
- [Thread Pool](../patterns/concurrency/thread-pool.md) — Bounded, reused, lifecycle-managed workers instead of leak-prone ad-hoc threads
- [Semaphore](../patterns/concurrency/semaphore.md) — Acquire-with-timeout and a guaranteed release keep permits from draining away

<!-- relationships:end -->
