---
title: Improper Instantiation
description: "Rebuilding a shareable, expensive client on every request"
area: hazards
owner: Oleksandr Derechei
tags: [performance, lifecycle, resource-management, throughput]
status: stable
aliases: [new client per request, per-request singleton misuse]
solves: [we run out of sockets under load on a server that is not busy, a new HTTP client is created for every request, the profiler says most of the time goes into constructors, errors about too many open files appear only in production, throughput plateaus and latency multiplies once concurrency rises]
---

# Improper Instantiation

An object designed to be created once and shared for the life of the process — a client that manages connections to something remote, or anything else expensive to build — is instead created and discarded on every request. The setup cost is paid over and over, and the resources it quietly holds are consumed faster than the system can release them.

## What it is
<!--meta block=description-->

**Improper instantiation** is creating a new instance of something built to be shared. Client libraries for remote systems — HTTP, messaging, databases, caches — are typically brokers: behind a small object they hold connections, negotiated sessions, resolved endpoints and a pool of all three, and they are designed to be constructed once and reused. Treated as disposable, each one builds that machinery from nothing and tears it down again a millisecond later. The same applies to any object whose constructor does real work, whether it wraps a remote resource or just reads and validates a large configuration.

It produces two different failures depending on what the object holds. Where it owns operating-system resources, the resources run out: sockets and file handles are not reclaimed the instant an object is discarded, so under load the process accumulates them faster than the system releases them, and calls start failing with exhaustion errors while nothing looks especially busy. Where the object is merely expensive to build, nothing fails — throughput plateaus and latency climbs, and a profile shows the time going into construction rather than into work. The tell for both is that the cost scales with request count rather than with request difficulty.

## Explained
<!--meta block=explain-->

Improper instantiation is building a new copy of something designed to be built once and shared. Client objects for HTTP, databases, queues and caches usually look small but hold open connections, negotiated sessions and a pool of both. Create one per request and every request pays to rebuild that state, then leaves sockets behind, because the operating system does not reclaim them the moment the object is dropped. Under load the process piles up sockets faster than the system frees them, and calls start failing with exhaustion errors while nothing looks busy. You find it only under concurrency, since a test with one caller never runs out. Read the library's documentation to learn its intended lifetime, and for a shared client create it once at startup and keep it for the life of the process. If an object cannot be shared but is costly to build, keep a bounded set and lend them out. Declare the lifetime in one dependency-injection registration, a single place where you state whether an object is one per process, pooled or one per request. Sharing has its own cost: a shared object must be safe for concurrent use, so set its configuration once at startup, not per call.

**Example.** A service calls a payment API at 500 requests a second and builds a new HTTP client for each call. Each client opens a fresh connection, adding an 80 ms handshake, and its socket stays allocated for about 60 s after use. A machine has roughly 28,000 free ports, so 500 a second uses them up in 28,000 / 500 = 56 s, and then every call fails. One client created at startup, with a pool of 50 connections, reuses them: the count stays near 50 however many requests arrive, and the handshake is paid 50 times, not 500 a second. The cost is that every caller now shares one object's settings.

## How it happens
<!--meta block=causes-->

- **Acquire late, release early is applied where it does not belong.** Holding a resource for no longer than needed is a good instinct learned from file handles and database connections, and it is exactly wrong for a broker whose whole design assumes it will be kept.
- **Cleanup syntax invites disposal.** A construct that closes the object at the end of the block reads as careful, so the object gets scoped to a request without anyone deciding that its lifetime should be a request.
- **The cost of construction is invisible in the source.** Creating the object is one line whether it allocates a struct or opens a connection and negotiates a session, and nothing in the call site distinguishes the two.
- **Sharing is avoided on thread-safety grounds.** A per-request instance is obviously safe, so it is chosen without checking whether the type was in fact built for concurrent use — which the shareable ones document precisely because they expect to be shared.
- **Container lifetimes are configured by default.** Where a framework wires dependencies, the registration decides the lifetime, and a per-request default silently applies to a client that needed to be a singleton.
- **It never shows up before production.** One instance at a time behaves perfectly; the failure needs concurrency and sustained load, so it survives every functional test and appears first as an error rate at a traffic level nobody reproduced.

## What it costs
<!--meta block=cost-->

- **Setup is paid per request instead of once.** Connection establishment, session negotiation and configuration parsing run on every call, so the per-request cost is dominated by preparation rather than by the work being asked for.
- **Scarce operating-system resources are exhausted.** Sockets and handles linger after their object is discarded, so a process creating them per request eventually cannot create any more and calls fail outright, on a machine that is not otherwise busy.
- **Throughput plateaus while latency multiplies.** Where nothing runs out, the system simply stops getting faster: requests per second flatten and response time rises by a large factor, with the extra time spent in construction.
- **Memory pressure and collection overhead rise.** Short-lived objects holding buffers and native handles churn through the heap, so the process spends a growing share of its time reclaiming what it just built.
- **The far side pays for the churn too.** Each new connection costs the remote system a handshake, an authentication and a slot in its own limits, so a caller that reconnects per request can exhaust a shared dependency's capacity while sending very little traffic.

## Getting out
<!--meta block=mitigation-->

Match the lifetime to the object's design, which means reading its documentation rather than guessing from its shape. A client meant to be shared is created once at startup and used for the life of the process — the **[Singleton](../patterns/gof/creational/singleton.md)** lifetime, whether or not it is expressed with that pattern. Where the object cannot be shared but is expensive to build, keep a bounded set alive and lend them out: an **[Object Pool](../patterns/gof/extra/object-pool.md)** spreads the construction cost across many uses, and its fixed size doubles as a cap on the scarce resource underneath.

Make lifetime a declared decision rather than a property of where the code happens to sit. **[Dependency Injection](../patterns/gof/extra/dependency-injection.md)** puts it in one registration a reviewer can read — singleton, pooled or per-request — instead of leaving it implicit in a constructor call buried in a handler. Get the registration wrong in the other direction and the failure is worse than a slow system: a per-request object promoted to a singleton keeps state across requests it was never meant to cross.

Sharing is only safe if the type says it is. Confirm the object is built for concurrent use, and treat its mutable configuration as immutable once it is shared — settings applied per call on an instance several requests are using is a [Race Condition](./race-condition.md) waiting for load, and the fix is to configure at startup and hold separate instances where the settings genuinely differ. Not everything shareable should be held either: a resource that is scarce on the far side is better returned promptly than hoarded, which is why a pool with a cap fits those cases and a single long-lived instance does not.

Verify with the resource, not with the code. Count live sockets or handles for the process under sustained concurrency: a healthy client's count is flat and roughly the size of its pool, and one that climbs with request volume tells you the lifetime is still wrong regardless of what the registration claims. This is a defect that only concurrency reveals, so it needs a load test rather than a functional one — and a shared client makes the next hazard the one to watch, since every request now queues for the same bounded pool. See [Connection Pool Exhaustion](./connection-pool-exhaustion.md).

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Mitigated by**

- [Singleton](../patterns/gof/creational/singleton.md) — A client designed to be shared is built once at startup and used for the life of the process
- [Object Pool](../patterns/gof/extra/object-pool.md) — Where the object cannot be shared, keep a bounded set alive and lend them out
- [Dependency Injection](../patterns/gof/extra/dependency-injection.md) — Make lifetime a declared registration a reviewer can read, not an accident of where the constructor sits
- [Containerization](../patterns/distributed/coordination/containerization.md) — Building once and promoting the artifact removes the per-environment rebuild that makes two environments differ

<!-- relationships:end -->
