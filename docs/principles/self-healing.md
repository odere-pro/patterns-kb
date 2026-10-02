---
title: Design for Self-Healing
description: "Build the recovery in, so a fault clears without an operator"
area: principles-systems
owner: Oleksandr Derechei
tags: [resilience, availability, error-handling]
status: stable
aliases: [auto-remediation, self-repair]
solves: [we restart the service every night to keep it healthy, every week someone gets paged at 3am to do the same three steps, one dropped connection turns into a failed customer order, jobs get stuck half-done and nobody notices until a customer complains, the runbook is twelve steps long and the first one is restart the worker]
---

# Design for Self-Healing

Treat failure as the normal operating condition and make recovery a property you design, not a task you assign. A system that detects its own faults, responds to them in proportion, and reports what it healed keeps its availability from the speed of recovery rather than from the hope that nothing breaks.

## What it says
<!--meta block=description-->

Assume every dependency will fail, and put the recovery in the system rather than in a runbook. A dropped connection, a call that answers in eight seconds instead of eighty milliseconds, a worker that dies holding a job — each should meet code that already expects it, so the user gets a slower request instead of an error and nobody gets paged. The work has three parts and they are designed in order: detect the fault, respond to it, and learn enough from it to change something.

This is a stance about your application, not a property of the platform under it. Redundant hardware keeps an instance running; it does nothing about a half-written order, a consumer stuck behind one poison message, or a downstream service that answers slowly rather than not at all. It is also not a licence to recover from everything — each healing path is code you own and must maintain, so one you did not need is cost plus a new way to be wrong.

## Explained
<!--meta block=explain-->

Self-healing means your application expects each dependency to fail and carries the recovery in code, in three steps: detect the fault, respond to it, and record it so you can change something. The user then gets a slower request instead of an error, and nobody is paged. Choose it over relying on redundant hardware alone, because extra machines do nothing for a half-written order, a worker stuck behind one bad message, or a service that answers slowly instead of not at all. Retry only what a retry can fix, make the work safe to repeat first so a second attempt gives the same result and not a duplicate charge, and stop calling a dependency you know is down. It costs in three ways. Quiet recovery hides a real fault, so count every heal and alert on the rate. Recovery adds load when there is none to spare, so cap attempts, add random delay and give operators a switch. Rarely used recovery paths rot, so run them on a schedule or delete them and page a human. Build healing per path: a nightly report may earn only a retry and an alert.

**Example.** Checkout calls a tax service that normally answers in 80 ms. It starts answering in 8 s on 5% of calls. Checkout retries a timed-out call up to 3 times with growing, randomised delays, never retries a rejected payload, and sends an idempotency key (a unique request id) so a repeat cannot charge twice. A circuit breaker opens after 20 failures in 10 s so retries stop piling on. Users see a slower page on 5% of orders and no errors. The retry rate climbs from near 0 to 5%, and an alert at 2% tells the team within the hour. The cost is that a quiet counter now needs an owner who reads it.

## Why it helps
<!--meta block=rationale-->

Availability is set by how long you stay down, not by how often something breaks. A fault the system clears in two hundred milliseconds never reaches a user; the same fault waiting on a person costs the minutes it takes to notice, page, log in and act, and it costs them again on every recurrence. Recovery speed is the lever you can actually move, because the failure rate of networks, disks and other people’s services is not yours to set.

Weight the effort by what actually happens to you. Regional outages get the planning attention, but the failures that fill an incident log are small and local: a reset connection, a brief timeout, one instance out of file handles, a message delivered twice. Handling those well is also what carries you through the rare large failure, because the mechanisms are the ones running under real load every day rather than a procedure nobody has executed.

## Applying it
<!--meta block=applying-->

Design the response to each fault you expect, one stage at a time:

- Retry only what a retry can fix. A reset connection or a brief timeout succeeds on the second attempt; a rejected payload never will, and retrying it multiplies one failure into several. [Retry with Backoff](../patterns/distributed/resilience/retry-backoff.md) adds the growing delay and the jitter that stop every client hitting the same recovering dependency in the same millisecond.
- Make the work safe to repeat before you make it automatic. A request can arrive twice from a retry, a redelivery or a restarted worker, and the second arrival has to land on the same result as the first. Without that, your recovery is a duplicate charge.
- Report health from a real check, not from the process being alive. A [Health Endpoint](../patterns/distributed/resilience/health-endpoint.md) that answers 200 while the connection pool is exhausted keeps a broken instance in rotation; one that exercises its own dependencies lets the balancer drain it and the supervisor replace it.
- Stop calling a dependency you already know is down. A [Circuit Breaker](../patterns/distributed/resilience/circuit-breaker.md) turns a queue of hanging calls into an immediate error, and it makes the return to service a single trial request rather than every caller arriving at once.
- Contain the damage before you try to repair it. A [Bulkhead](../patterns/distributed/resilience/bulkhead.md) — separate pools, queues and threads per dependency — narrows recovery to one compartment while the rest of the system keeps serving.
- Sweep for the work that failed by not happening. A job that never started, a lease that expired, a payment stuck at “pending” for an hour: none of these raise an error anyone can catch. A [Sweeper](../patterns/distributed/coordination/sweeper.md) scanning on a clock is the only mechanism that finds a failure with no exception attached to it.
- Count every heal and put a threshold on the count. A retry that succeeded is still an event, and the rate of successful retries is what tells you a dependency has degraded while there is still time to act on it.

Work down that list per path rather than per service. Checkout may earn every item on it; a report that runs nightly may honestly earn a retry and an alert, and stopping there is the right answer rather than a gap.

## Taken too far
<!--meta block=overreach-->

Recovery that succeeds quietly looks exactly like nothing being wrong. A retry that papers over a race in a downstream service keeps working for six months, and in those six months the race spreads to three more call sites — so the one-line fix becomes a migration. Leave a counted trace behind every heal, and accept that some faults should not be healed at all: where a wrong result costs more than a rejected request, [Fail Fast](./fail-fast.md) is the better answer.

Automatic recovery is itself load, and it arrives exactly when there is none to spare. Every client retrying a saturated service adds to the saturation, and every instance restarting at the same moment takes capacity away from the ones still standing. Bound it — cap the attempts, jitter the delays, limit how many instances may recover concurrently — and give the loop a switch an operator can throw. Without that switch, a serious incident turns into a person and a control loop taking turns: the operator drains a node, the system heals it back into rotation.

The last cost only shows up on the day you need it. A healing path runs in the rarest minute of the year, so it rots like any other code nobody executes: an expired credential, a permission never granted, a standby three schema versions behind. Either exercise it on a schedule so it runs weekly instead of annually, or delete it and page a human, which is at least a mechanism you have watched work. Price each one against the availability target before you build it, because an unexercised recovery path buys you a number you have never observed and a second system to maintain.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Circuit Breaker](../patterns/distributed/resilience/circuit-breaker.md) — The breaker is how a system stops calling a dependency that is already down
- [Retry with Backoff](../patterns/distributed/resilience/retry-backoff.md) — Most faults are transient, and a bounded retry clears them with nobody watching
- [Health Endpoint Monitoring](../patterns/distributed/resilience/health-endpoint.md) — Recovery starts with detection, and detection needs something to ask
- [Sweeper](../patterns/distributed/coordination/sweeper.md) — Work that failed by not happening is found on a clock, never by an alert
- [Bulkhead](../patterns/distributed/resilience/bulkhead.md) — Heal one compartment without the rest of the system noticing it happened
- [Fail Fast](./fail-fast.md) — Notice the fault early, then recover from it without paging anyone
- [Analyse Failure Modes](./failure-mode-analysis.md) — Enumerate the failures first, then design a proportionate response to each
- [Make Everything Redundant](./redundancy.md) — Redundancy is what a recovery has somewhere to fail over to

**Prevents**

- [Cascading Failure](../hazards/cascading-failure.md) — Recovering locally stops one fault from becoming everyone's fault

<!-- relationships:end -->
