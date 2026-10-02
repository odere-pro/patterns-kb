---
title: Analyse Failure Modes
description: "Enumerate how each part can fail, and decide the response first"
area: principles-systems
owner: Oleksandr Derechei
tags: [resilience, availability, error-handling]
status: stable
aliases: [FMEA, failure mode and effects analysis]
solves: [every outage is a surprise and the postmortem says we never considered that, we found out during the incident that the database had no failover, nobody knows what happens if one dependency starts answering in ten seconds, the design review only ever walks through the happy path, we have dashboards everywhere but nothing alerted until a customer emailed]
---

# Analyse Failure Modes

Walk every component and every dependency, write down each way it can fail — slow, partial, stale, wrong, gone — and rank those by likelihood and blast radius. The output is a set of detection and response decisions made at design time, when they cost an hour, instead of during the incident, when they cost the incident.

## What it says
<!--meta block=description-->

Before you build it, walk the system one component and one dependency at a time, and write down every way each can fail. Not only that it is down: a dependency can answer slowly, answer for half the keys, answer with stale data, answer with wrong data, or accept a write and lose it. For each mode decide two things now — how you will detect it, and what the system will do about it. That list of decisions is the deliverable.

This is method, and it pairs with the stance in [Design for Self-Healing](./self-healing.md): that page says recover, this one says from what. It is also not a document. A failure-mode table that ends its life on a wiki page has produced nothing, because the real output is a set of changes — an alert that did not exist, a timeout with an argued value, a dependency demoted from required to optional. The table is the working that got you there.

## Explained
<!--meta block=explain-->

Failure mode analysis means that before you build, you walk the system one part and one dependency at a time and write down every way each can fail, then decide how you will detect it and what the system will do. Down is the easy mode. A dependency can also answer slowly, answer for half the keys, serve stale or wrong data, or accept a write and lose it, and those are the ones that hurt. Choose it over waiting for incidents to teach you when the path matters enough, because the output is a set of changes: an alert that did not exist, a timeout with an argued value, a dependency moved from required to optional. It has four costs. The analysis can turn into a document, so judge a pass by what it changed. Invented probabilities multiplied together give false precision, so rank in coarse bands and measure real rates where they matter. Depth costs the same hours anywhere, so spend it where the path is worth it. And a mitigation nobody has run is a guess, so inject each fault you claimed to handle and check that the alert fires.

**Example.** A team plans an order service that calls a payment API, a stock database and an identity provider. The walk lists modes, not just down: payment slow, stock reads stale, certificate expired. Three changes come out. Payment gets a 3 s timeout and 2 retries, after the team argues the value from the API's usual 400 ms answer. Stale stock gets an alert when the oldest cached value passes 60 s. The certificate gets a 30-day expiry warning. Then they inject each fault in a test environment, and the stock alert never fires because it was wired to the wrong metric. The cost is two days at a whiteboard, spent on the revenue path and not on the admin tool.

## Why it helps
<!--meta block=rationale-->

The decisions are the same either way; only the price moves with when you make them. Deciding at design time what happens when a recommendation service answers in ten seconds costs an hour of argument and a default value. Deciding it at two in the morning costs the outage, the judgement of whoever happens to be awake, and a change shipped without review. Enumerating up front is how the second case becomes the first.

Walking each dependency in turn also surfaces the failures that carry no error. The partial answer, the stale read, the write acknowledged and dropped, the queue that keeps accepting and never drains — none of these appear in an exception log, so no amount of watching production will hand them to you. A ranked list settles arguments as well: once every mode carries a likelihood and a blast radius, which risks deserve spending stops being a question of who in the room is most worried.

## Applying it
<!--meta block=applying-->

Run it at design time, on a whiteboard, before the code exists:

- List every component and every dependency, including the ones you never chose — name resolution, the clock, the certificate, the identity provider, the deployment pipeline, the network between two of your own services. A dependency missing from the list is a failure mode you cannot have handled.
- For each one, enumerate modes rather than states. Ask what happens if it is slow, if it serves some requests and not others, if it returns stale data, if it returns wrong data, if it accepts a write and loses it, and if it comes back all at once. Down is the easy mode and rarely the one that hurts.
- Rate each mode by likelihood and blast radius, and admit that the first number is a guess. Use coarse bands you can defend out loud and treat the ordering as the result — what you need from the exercise is a priority, not a probability.
- Name the detection before the response. Every mode needs an observable signal or it does not get handled: a [Health Endpoint](../patterns/distributed/resilience/health-endpoint.md) that exercises its own dependencies, a latency percentile, a queue depth, the age of the oldest cached value. A mode you cannot observe is one a customer will report for you.
- Write each response as a decision with a number in it. A [Timeout / Deadline](../patterns/distributed/resilience/timeout-deadline.md) becomes a mitigation once somebody has argued the value, and “we will retry” is not a plan until it says how many times and how far apart.
- Follow the blast radius outward and include the response in it. Retries add load to whatever is already struggling, so trace whether one dependency's failure becomes a [Cascading Failure](../hazards/cascading-failure.md), and put a [Bulkhead](../patterns/distributed/resilience/bulkhead.md) where the analysis says the spread would run.
- Inject each fault you claimed to have mitigated — kill the process, add the latency, return the wrong shape, blackhole the network — and check that the signal fires and the response happens. Until that run, the row is an assumption and the analysis is unfinished rather than complete.

Re-run the walk when the architecture changes rather than on a calendar. A new dependency, a new partitioning scheme or a new consumer adds modes the last pass could not have contained, and those are precisely the ones missing on the day they matter.

## Taken too far
<!--meta block=overreach-->

The usual failure is that the analysis becomes a document. Two hundred rows, a sign-off and no change to the code is worse than skipping it, because the sign-off buys confidence the system has not earned. Judge a pass by what it changed: the alerts added, the timeouts given argued values, the dependencies moved from required to optional. If the answer is nothing changed, either the exercise was unnecessary or nobody believed it.

Precision is the second trap. Multiplying an invented probability by an invented impact produces a figure with two decimal places and no more information than the guesses behind it, and that figure then wins arguments it has not earned. Rank in bands you can defend in a sentence and treat the ordering as the output. Where a rate genuinely matters — disk lifetimes, certificate expiries, how often a leader failover actually happens — measure it, because a measured rate beats every estimate produced in a workshop.

Depth costs the same hours wherever you spend them, so buy it in proportion to what the path is worth. Enumerating an internal admin tool to the depth of a payment ledger spends the budget where nothing is at stake, and the modes left unexamined will be on the service that mattered. The subtler mistake is treating a complete analysis as a tested system: every row whose mitigation nobody has injected is still a hypothesis, and the ones that fail under injection are reliably the ones that looked too obvious to test.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Design for Self-Healing](./self-healing.md) — The analysis says what to recover from; this says how
- [Health Endpoint Monitoring](../patterns/distributed/resilience/health-endpoint.md) — Every failure you enumerated needs something that will actually notice it
- [Timeout / Deadline](../patterns/distributed/resilience/timeout-deadline.md) — Slow is a failure mode, and it needs a decided answer like any other
- [Bulkhead](../patterns/distributed/resilience/bulkhead.md) — Rate each failure by blast radius, then go and bound the radius
- [Make Everything Redundant](./redundancy.md) — The walk is what tells you which single points are worth removing
- [Design for Operations](./design-for-operations.md) — The analysis produces the list of things operations must be able to see
- [Build for the Needs of the Business](./build-for-business.md) — Risk is rated against what the business can actually tolerate losing
- [Regions & Availability](../capabilities/regions.md) — The cloud's geography gives the enumeration its levels.
- [Fallacies of Distributed Computing](./fallacies-of-distributed-computing.md) — Start the walk with the eight fallacies as prompts for every remote call.

**Prevents**

- [Cascading Failure](../hazards/cascading-failure.md) — Trace the propagation path at design time, or have it traced for you at 3am

<!-- relationships:end -->
