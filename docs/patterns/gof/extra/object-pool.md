---
title: Object Pool
description: Reuses a fixed set of expensive objects
area: gof-extra
owner: Oleksandr Derechei
tags: [low-level-design, resource-management, latency]
status: stable
aliases: [resource pool]
solves: [opening a fresh database connection on every request is dominating my response time, the database is rejecting me because my service opened too many connections at once, the TCP handshake and auth cost more than the query I actually wanted to run, garbage collection pauses keep spiking because I allocate a huge buffer per request, I have no ceiling on how much of a scarce external resource my service grabs]
---

# Object Pool

Keeps a fixed set of expensive-to-build objects alive and hands them out on loan — so callers borrow and return rather than allocate and discard.

## What it is
<!--meta block=description-->

An **object pool** keeps a set of already-constructed objects ready for reuse. A client acquires an object from the pool, uses it, and releases it back — instead of building a fresh one each time and throwing it away. The objects live across many uses; only their lease is short-lived.

The force it resolves is **construction cost**. Some objects are expensive to create: a database connection needs a TCP handshake and authentication, a thread needs a stack and a kernel-visible entry, a decompression buffer needs a large contiguous allocation. When those objects are needed frequently but held only briefly, building and tearing one down per request dominates the actual work.

A pool also acts as a **ceiling**. Because the number of live objects is bounded, it doubles as a limit on a scarce external resource — you cannot open more connections than the pool allows, which protects the database as much as the caller.

The cost is that pooled objects are reused, so any per-use state must be scrubbed on release, and any object that escapes without coming back is a leak that slowly starves everyone else.

## Explained
<!--meta block=explain-->

An object pool keeps a fixed set of already-built objects, such as database connections, and lends one out per use: a caller takes one, uses it and gives it back. You pay the setup cost once and not on every request, and the pool's size caps how many of a scarce resource are open at once. Choose it over creating objects on demand only when construction is measurably slow or the resource must be capped. For an object a modern runtime creates in nanoseconds, a pool is overhead and a new way to fail. It fails in three ways. An object returned dirty leaks one caller's data to the next, so reset it on return. An object never returned shrinks the pool until everyone waits, so return it in a finally block and set a borrow timeout. A task that holds one object while waiting for another from the same pool can deadlock under load, so borrow one at a time. Size the pool against the total across all the services that share the resource.

**Example.** A database allows 100 connections, and opening one takes 30 ms of handshake. A service runs 10 copies and gives each a pool of 8: 80 connections, 20 spare. A request that fails and forgets to return its connection loses one per failure. After 8 failures in one copy, that copy has none, and each request there waits the 2 s borrow timeout and then errors, while the other 9 copies stay fine. A finally block that returns the connection ends the leak. Had you set 12 per copy, 10 x 12 = 120 would exceed the 100 the database allows.

## How it works
<!--meta block=structure-->

```mermaid caption="The lifecycle of a pooled object. It shuttles between idle and in-use, is scrubbed on the way back, and is only destroyed when it expires or the pool shrinks."
stateDiagram-v2
    [*] --> Idle
    Idle --> InUse: acquire
    InUse --> Idle: release, reset
    Idle --> Destroyed: expiry, eviction
    Destroyed --> [*]
    note right of Idle: sits in the free list, ready to lend
    note right of InUse: checked out by one client
```

## Variations
<!--meta block=variations-->

- **Fixed vs. elastic** — A fixed pool holds a constant number of objects; an elastic one grows toward a maximum under load and shrinks when idle. Fixed gives predictable resource use; elastic trades that for adaptability.
- **Blocking vs. fail-fast acquire** — When the pool is empty, acquire can block until an object is returned (usually with a timeout) or fail immediately so the caller can back off. Blocking smooths bursts; fail-fast surfaces exhaustion sooner.
- **Validation on borrow / return** — Test the object before handing it out — pinging a connection, checking a socket — so a client never gets a dead one. Costs a round trip but avoids surfacing stale state as a mystery failure.
- **[Thread Pool](../../concurrency/thread-pool.md)** — The most common specialization: a pool whose objects are worker threads, fed a queue of tasks. Reuses the expensive thread rather than the result of its work.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Spreads the cost of expensive construction** across many uses instead of paying it every time.
- **Caps how many of a scarce resource** are in use at once, at a fixed ceiling.
- **Cuts constant allocate-and-discard churn** and the garbage-collection pressure it creates.
- **Delivers steady, predictable latency** once the pool has warmed up.

### Cons
<!--meta polarity=con-->

- **Reused objects keep their old state** — forget to reset one and it leaks data between clients.
- **An object borrowed and never returned** is lost, and enough such leaks starve the whole pool.
- **Adds real machinery to build and maintain**: sizing, validation, eviction, thread safety.
- **For cheap objects**, a modern allocator or garbage collector often beats a pool outright.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **Building the object is genuinely expensive** — connections, threads, sockets, large buffers.
- **Each object is used briefly** but acquired again and again at high frequency.
- **You need a hard cap** on how many of a scarce resource are alive at once.

### Avoid when
<!--meta polarity=avoid-->

- **The objects are cheap to create** — pooling adds overhead and buys nothing.
- **Their state is large or awkward** to wipe clean before the object is reused.
- **Objects live long or for unpredictable spans**, so there's little churn to spread out.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — a bounded generic pool with a borrow-and-return helper"
interface PoolOptions<T> {
  readonly create: () => T;   // build a fresh object (the expensive step)
  readonly reset: (obj: T) => void;  // wipe per-use state before reuse
  readonly max: number;       // hard ceiling on live objects
}

class ObjectPool<T> {
  private readonly idle: T[] = [];
  private live = 0;

  constructor(private readonly opts: PoolOptions<T>) {}

  acquire(): T {
    const reused = this.idle.pop();
    if (reused !== undefined) return reused;
    if (this.live >= this.opts.max) throw new Error("pool exhausted");
    this.live++;
    return this.opts.create();
  }

  release(obj: T): void {
    this.opts.reset(obj);
    this.idle.push(obj);
  }

  // Borrow, run, and always return — even if the work throws.
  use<R>(work: (obj: T) => R): R {
    const obj = this.acquire();
    try {
      return work(obj);
    } finally {
      this.release(obj);
    }
  }
}
```

## In the wild
<!--meta block=wild-->

- **HikariCP** — The default Java Database Connectivity (JDBC) connection pool in Spring Boot. Key knobs are maximumPoolSize (the ceiling), minimumIdle (warm floor), connectionTimeout (acquire wait), idleTimeout and maxLifetime (eviction). It exposes ActiveConnections, IdleConnections, and PendingConnections as metrics and can log leak warnings via leakDetectionThreshold. {#wild-hikaricp}
- **PgBouncer** — A lightweight connection pooler in front of PostgreSQL that multiplexes many client sessions onto a small set of real backend connections. Its pool_mode (session, transaction, or statement) controls how aggressively backends are shared; transaction mode returns a backend to the pool at each commit, letting far more clients share few server connections. {#wild-pgbouncer}
- **Apache Commons Pool** — A general-purpose object-pooling library (the engine behind DBCP) with borrow/return semantics via a PooledObjectFactory. It offers testOnBorrow/testOnReturn/testWhileIdle validation, maxTotal and maxIdle sizing, maxWait on borrow, and a background evictor governed by minEvictableIdleTime. {#wild-commons-pool}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **Maximum pool size** — The hard ceiling on live objects (HikariCP maximumPoolSize, generic max). Doubles as the cap on the scarce downstream resource; the sum across all app instances must stay under the resource limit (e.g. the database max_connections).
- **Acquire timeout** — How long acquire() blocks on an empty pool before failing (HikariCP connectionTimeout, Commons Pool maxWait). Bounds exhaustion into a fast error instead of an indefinite hang.
- **Validation on borrow / return** — Test an object before lending it (Commons Pool testOnBorrow / testOnReturn, HikariCP connection validation / keepaliveTime) so a dead connection or socket is discarded rather than handed to a client.
- **Idle eviction and max lifetime** — When to retire objects (HikariCP idleTimeout and maxLifetime, Commons Pool minEvictableIdleTime). Recycling long-lived objects avoids servers dropping connections the pool still believes are good.
- **Minimum idle / warm size** — A floor of pre-created objects kept ready (HikariCP minimumIdle) so a burst after idle does not pay full construction cost on the first requests.

### Signals to watch
<!--meta polarity=signal-->

- **Pool utilization** — Active versus idle versus total objects (HikariCP exposes ActiveConnections, IdleConnections, TotalConnections). Sustained near-100% active means the pool is the bottleneck.
- **Threads awaiting acquire** — Callers blocked waiting for a free object — the pool queue depth (HikariCP PendingConnections). A rising value precedes acquire timeouts.
- **Acquire wait time** — Time from acquire() to receiving an object. Near zero when warm; climbing wait time is the early sign of contention before outright exhaustion.
- **Acquire timeout / failure rate** — Count of acquires that hit the timeout without getting an object — the direct symptom of exhaustion or a leak.

### Failure modes under load
<!--meta polarity=failure-->

- **Pool exhaustion** — Every object is leased; new callers block until the acquire timeout and then fail. Often a downstream slowdown holding objects longer, not more traffic.
- **Object / connection leak** — A borrowed object is never returned (missing release in an error path). The available count decays toward zero and the pool eventually serves no one.
- **Stale object handed out** — With validation off, an object the far end has already closed (idle-killed connection, half-open socket) is lent out and fails on first use as a mystery error.
- **State bleed between clients** — Per-use state is not scrubbed on release — an uncommitted transaction, a set session variable, or leftover buffer contents — so the next borrower inherits it.

### Readiness checklist
<!--meta polarity=check-->

- Maximum pool size is sized against the downstream limit, counting every app instance that shares it
- Acquire has a bounded timeout so exhaustion fails fast instead of hanging
- Objects are validated on borrow or bounded by a max lifetime so dead ones never reach callers
- Per-use state is scrubbed on release and borrow/return is balanced, with leak detection enabled
- Idle and max-lifetime eviction are configured to match how long the far end keeps objects alive

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Performance](../../../themes/performance.md) — Reuse expensive objects to cut allocation cost. {#fluency-performance}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Has variant**

- [Thread Pool](../../concurrency/thread-pool.md) — A thread pool is an object pool of workers

**Often confused with**

- [Flyweight](../structural/flyweight.md) — Share immutable state vs. reuse whole objects

**Prevents**

- [Resource Leak](../../../hazards/resource-leak.md) — A pool with checkout/return discipline and validation reclaims what callers forget
- [Improper Instantiation](../../../hazards/improper-instantiation.md) — Spreads construction cost across many uses, and caps the scarce resource underneath

**Demonstrated by**

- [Distributed Cache](../../../designs/design-distributed-cache.md) — shows connection pooling removing handshake cost from the p95/p99 latency tail
- [Distributed Rate Limiter](../../../designs/distributed-rate-limiter.md) — a pool of live connections amortises setup cost across a million checks a second inside the latency budget
- [LeetCode](../../../designs/leetcode.md) — a pool of pre-warmed runtimes amortizes expensive container startup over many gradings

<!-- relationships:end -->
