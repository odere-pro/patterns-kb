---
title: Fallacies of Distributed Computing
description: "Eight false assumptions about networks, each with the design habit that replaces it"
area: principles-systems
owner: Oleksandr Derechei
tags: [resilience, availability]
status: stable
aliases: [eight fallacies, Deutsch fallacies, network fallacies]
solves: [my code works on my laptop and falls apart when the services run on separate machines, a remote call hangs forever and takes every thread that made it down too, a page needs a dozen calls to other services and feels slow even though each one is fast, we hard-coded the address of another service and it broke when the instance moved, an internal call was never encrypted because everyone on the network was trusted]
---

# Fallacies of Distributed Computing

Eight assumptions that hold on one machine and are false across a network: it is reliable, latency is zero, bandwidth is infinite, it is secure, the topology never changes, there is one administrator, transport costs nothing, and the network is homogeneous. A design that leans on any of them works in a test and fails in production.

## What it says
<!--meta block=description-->

Peter Deutsch and colleagues at Sun Microsystems listed seven false assumptions that programmers new to distributed systems make, and James Gosling later added an eighth. Each one is a thing a local call gives you for free and a remote call does not. The list is a checklist of what your code is silently relying on, not a rule about what to build.

The usual misreading is that these are network problems for the network team. They are design inputs. Each fallacy, taken as true, hides a decision you then never make: with the first, how you handle a lost reply; with the second, how long you wait; with the eighth, how two services agree on a format.

Here is each one with the habit it demands:

- **The network is reliable.** Packets drop, connections reset, peers vanish mid-call. Set a timeout on every remote call, retry only work that is safe to repeat (see [Idempotency](../patterns/messaging/idempotency.md)), and decide up front what a failed call means.
- **Latency is zero.** A remote call costs milliseconds to seconds, not nanoseconds. Count calls per request, batch where you can, and never put a network call inside a tight loop.
- **Bandwidth is infinite.** Links have a ceiling and you pay to cross zones. Send only the fields the caller needs, paginate, and compress large payloads.
- **The network is secure.** Anyone on the path can listen or inject. Encrypt in transit, authenticate every caller, and treat a request from inside the network as untrusted (see [Identity as Perimeter](./identity-as-perimeter.md)).
- **Topology does not change.** Instances come and go, addresses move, routes shift. Find peers through [Service Discovery](../patterns/distributed/routing/service-discovery.md) at call time and never bake an address into config you ship.
- **There is one administrator.** Other teams, clouds and vendors run parts of the path, on their own schedules. Version your contracts and expect a dependency to change under you.
- **Transport cost is zero.** Serialising, copying and sending data costs CPU, money and time. Measure the bill for a hop before you add it.
- **The network is homogeneous.** Different languages, platforms, clocks and protocol versions meet on the wire. Agree on a documented format and test across versions.

## Explained
<!--meta block=explain-->

The fallacies are eight things a local function call gives you for free that a call across a network does not: it can fail, it takes time, it has limited capacity, it can be watched or forged, its route changes, other people run parts of it, it costs money to use, and the machines at each end differ. Peter Deutsch and others at Sun listed seven of them and James Gosling added the eighth. Use them as a review checklist when you add a remote call, ahead of failure-mode analysis, which then takes each answer further. Each fallacy costs you a default. Add a deadline to every call so a hang becomes an error, and retry only work that is safe to repeat. Count calls per request and batch them, because latency adds up. Send only the fields needed, because bytes cost. Authenticate and encrypt each hop. Look peers up at call time. Version your contracts. Skip the defences on a link that cannot fail in the way you fear, such as two processes on one host, since every defence is code you maintain.

**Example.** A product page makes 12 sequential calls to other services, each 25 ms on average, with no deadline set. The page takes 300 ms in a quiet test. Then one of the 12 services starts hanging, and each page request that reaches it holds a thread for 30 s. At 10 page requests a second, 200 threads are all stuck within 20 s and every page fails. A 100 ms deadline on each call turns the hang into a fast error and a page without that panel. Running 4 of the calls in parallel cuts the quiet-day time from 300 ms to about 225 ms. The cost is choosing each deadline and designing the page for a missing panel.

## Why it helps
<!--meta block=rationale-->

Each fallacy fails the same way: the code is correct on the machine where it was written and wrong across a network, and nothing in the code says so. A call that never times out works until the day a peer hangs, and then every thread that made the call waits behind it. The defect is not in the call. It is in the assumption the call carried, and a test environment on one laptop cannot expose it.

Naming the assumptions turns each into a question you can ask in review: what happens here when the reply is lost, slow, large, forged or in the wrong format? That is the same question [Failure Mode Analysis](./failure-mode-analysis.md) asks of a whole system, and the fallacies are a short list to start it from. They also explain why some failures arrive together. A missing timeout plus an unbounded retry loop is the first fallacy applied twice, and it is how a [Retry Storm](../hazards/retry-storm.md) starts.

## Applying it
<!--meta block=applying-->

Turn each fallacy into a default in the code you write:

- Give every remote call a deadline, and pick it from the caller's own budget, not from the callee's best day. A [Timeout / Deadline](../patterns/distributed/resilience/timeout-deadline.md) turns an unbounded wait into a failure you can handle.
- Retry with backoff and a cap, and only where repeating the call is safe. An unlimited immediate retry multiplies load on a service that is already struggling.
- Count the remote calls on your hottest path and put the number in the design. Ten sequential calls at 20 ms each is 200 ms before any work happens.
- Return only the fields and rows the caller asked for, and set a page size. A response that grows with the data will one day exceed the link or the memory on either end.
- Authenticate and encrypt every hop, including internal ones, and give each caller only the access it needs.
- Resolve addresses at call time, and keep the set of peers in a registry rather than in a file.
- Write the contract down, version it, and test a new caller against an old callee and the reverse.
- Assume every call can fail in the middle. Where the work spans several services, that means asking which of them are still allowed to hold locks or reservations and for how long; [Minimize Coordination](./minimize-coordination.md) covers the rest.

The compact test: for each remote call, can you say what the caller does when the reply is lost, late, huge, forged or unreadable?

## Taken too far
<!--meta block=overreach-->

Treating every fallacy as an emergency produces a system armoured against failures it will never see. A retry layer, a circuit breaker, a cache, an encrypted channel and a schema registry on a call between two processes on the same host is cost with no matching risk. The assumptions are false in general, and a given link may still be reliable enough, fast enough and trusted enough that the cheap design is the right one.

Price each habit against the call it protects. A batch job that runs nightly and can simply rerun does not need the retry budget of a payment path. An internal call that crosses one switch in one rack does not need the same compression and pagination as a mobile client on a weak link. Put the defences on the calls where a failure costs money or an outage, and keep the rest plain.

The list is also from 1994 and 1997, and it is not complete. It says nothing about partial failure of storage, clock drift or a dependency that answers wrongly instead of not at all. Use it as a starting set of questions and extend it with what your own incidents teach.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Analyse Failure Modes](./failure-mode-analysis.md) — The fallacies are the starter list of questions; failure-mode analysis carries them across the whole system.
- [Minimize Coordination](./minimize-coordination.md) — Every remote agreement pays latency and failure costs the fallacies hide.
- [Timeout / Deadline](../patterns/distributed/resilience/timeout-deadline.md) — The first and second fallacies demand a deadline on every remote call.
- [Identity Is the Perimeter](./identity-as-perimeter.md) — The fourth fallacy, a secure network, is why location cannot grant access.

**Prevents**

- [Retry Storm](../hazards/retry-storm.md) — Treating the network as reliable gives unbounded retries with no deadline.

<!-- relationships:end -->
