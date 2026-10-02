---
title: Design to Scale Out
description: "Grow by adding machines, and never depend on any one of them"
area: principles-systems
owner: Oleksandr Derechei
tags: [scalability, throughput, load-balancing, state-management]
status: stable
aliases: [horizontal scaling]
solves: [we are already on the biggest machine we can rent and traffic is still climbing, when the one server reboots the whole product is down, users get logged out every time we deploy, we started a second copy of the service and everything broke, every maintenance window is scheduled downtime because it all runs on one box]
---

# Design to Scale Out

A system designed to scale out grows by adding interchangeable instances rather than by growing one. That buys capacity past the ceiling of any single machine and survival past the death of any single machine — and it charges you in coordination, so make the swap on a signal rather than by reflex.

## What it says
<!--meta block=description-->

Add capacity by adding instances, and write the code so that adding one changes nothing else. The alternative — a bigger machine — is simpler, needs no agreement between parts and is the right answer far more often than the internet suggests, right up until you reach the largest machine on offer or need to survive losing it. This is not an instruction to run everything on a crowd of tiny nodes. It is an instruction to keep the option open, because the design decisions that make it possible cost nothing before launch and cost a migration afterwards.

What the principle actually demands is two properties of your code, not of your infrastructure: any instance can serve any request, and any instance can disappear mid-flight without anyone noticing. Everything else — the balancer in front, the automatic capacity, the deploy that replaces machines one at a time — is a consequence of holding those two and is unavailable without them. That is why this is a design constraint rather than an operations task. Nobody can add it from outside the process once a user's cart lives in one process's heap.

## Explained
<!--meta block=explain-->

Scale-out means you add capacity by adding instances, and you write the code so that adding one changes nothing else. That needs two properties of your code: any instance can serve any request, and any instance can vanish mid-request without anyone noticing. A bigger machine is simpler and is right more often than people think, until you reach the largest one available or must survive losing it, and that is when you choose scale-out. The two properties cost almost nothing before launch and a migration afterwards, so keep per-user state out of process memory in a store every instance can read, and write updates as atomic operations because two writers will exist. It costs bills a single big node never pays. Copying a tier that was not the bottleneck only sends more queries into the shared database, so find the constrained tier first. Connection pools multiply by instance count, so size them by fleet total. Autoscaling on a lagging signal such as processor use arrives late, so drive it from queued work and make instances start fast.

**Example.** A shop runs 4 app instances, each holding 20 database connections: 80 against a database that accepts 100. Traffic doubles, so the team doubles to 8 instances, and the database refuses connections because 8 x 20 is 160. The database was the constraint, not the app. They cap each instance at 10 connections, 80 in total, and add a read copy for browsing. Earlier, each cart lived in one instance's memory, so a deploy that replaced instances lost carts. Moving carts to a shared store fixed that. The cost is that every cart read is now a network call instead of a memory read.

## Why it helps
<!--meta block=rationale-->

A single machine has a hard ceiling and exactly one failure domain, and those are the two things no amount of tuning fixes. You can keep buying cores until the largest instance available runs out, and on the day it does the only remaining move is a rewrite under load — the worst conditions in which to attempt one. The failure domain is the sharper argument: while one machine serves everything, its reboot is your outage, its kernel panic is your incident, and its maintenance window is your downtime. Four instances turn each of those into a quarter of your capacity and nothing a customer notices.

Four signals say the swap is due, and none of them is ambition. You are within a factor of two of the biggest machine you can rent; a single reboot now costs more than the extra complexity would; load varies by an order of magnitude across the day, so fixed capacity means paying peak rates around the clock; or the work already splits cleanly by key and wants to run in parallel. Absent all four, one larger machine and a smaller bill is the honest answer, and it stays honest as long as the code has kept the option to change its mind.

## Applying it
<!--meta block=applying-->

Each of these is a rule with a consequence attached, and the consequence lands the first time you run two of anything:

- Keep no per-client state in an instance's memory. A cart, a session or a wizard step held in one process's heap has pinned that user to a machine that will be replaced at the next deploy and will fail on its own schedule. Move it to a store both instances can read and any instance can answer the next request — which is the whole of [Stateless Service](../patterns/distributed/routing/stateless-service.md).
- Give instances no identity and no local data that matters. No instance number, no hostname anyone depends on, nothing written to local disk that is not a cache. If it cannot survive the machine being deleted without warning, it was never local data, and treating it as such makes every replacement a small data loss.
- Assume more than one writer from the first line of code. A read-modify-write that is correct only because one process runs it is wrong the moment two do, and it fails as lost updates rather than as an error anyone sees. Write it as a conditional update or an atomic operation while it is three lines, not after it is a report nobody can reconcile.
- Give work that only one instance may do somewhere to live that is not an instance. A scheduled job started by every replica runs as many times as you have replicas. Put the trigger on a shared channel and let [Competing Consumers](../patterns/messaging/competing-consumers.md) hand it to whichever instance is free, so which one does it stops being a question.
- Put every instance behind one address and let health checks remove the sick ones. A [Load Balancer](../patterns/distributed/routing/load-balancer.md) is what makes an instance's death a routing change rather than an error page. Resist the pull of a [Sticky Session](../patterns/distributed/routing/sticky-session.md): pinning a client to a backend restores exactly the machine dependence you removed, and turns one instance's death into a set of broken sessions instead of a few retried requests.
- Scale the tier that is constrained, and by the method that tier allows. Stateless tiers scale by copying, and stateful ones scale by splitting — which is [Sharding](../patterns/distributed/routing/sharding.md), a different and much less reversible decision. Ten more application instances in front of one saturated database buy you nothing but more connections into the bottleneck.
- Make an instance cheap to start before you automate starting them. [Autoscaling](../patterns/distributed/routing/autoscaling.md) can only track a load curve it can outrun, so an instance that needs four minutes of boot, migration and cache warming cannot answer a spike that lasts two. Move the slow work out of start-up — pre-baked images, lazy cache fill, readiness gates — and the same policy starts arriving in time to matter.

Every one of these is close to free before launch and expensive afterwards. The shared session store is an afternoon's work while nobody is logged in, and a migration with a cut-over plan once a million people are.

## Taken too far
<!--meta block=overreach-->

Adding instances to a tier that was never the constraint buys nothing and hides the thing that was. If the database is saturated, twice the application instances means twice the queries arriving at the same disk, and the graph you are watching gets worse while the change looks like progress. Most scale-out that fails fails this way: the contention was never in the tier that got copied, so it simply moved downstream into the one shared thing every instance still talks to.

N small nodes also pay bills one big node never sees. What was a function call becomes a network hop with its own timeout and its own failure mode. Every instance carries its own runtime, its own connection pool and its own cold cache, so ten instances holding twenty connections each will open two hundred against a database that accepts one hundred, and the fix is to size the pool by fleet total rather than per node. Cache hit rates fall as the same working set is split across more, smaller caches, and every one of those instances is another thing to patch, observe and page someone about.

Automatic capacity tuned to a trailing signal is worse than none, because it reliably arrives late and then leaves early. Processor use rises after the queue has already filled, so a policy driven by it scales out to serve traffic that has gone and scales in just before the next spike, doubling your incidents while doubling your bill. Price the whole control loop instead: metric interval, plus evaluation delay, plus boot, plus warm-up is the time between load arriving and capacity meeting it. Drive the policy from a signal that leads — queued work, in-flight request count, arrival rate — and carry enough headroom to cover that total, or accept the ceiling and provision flat.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Load Balancer](../patterns/distributed/routing/load-balancer.md) — Added instances stay idle until something spreads work across them
- [Autoscaling](../patterns/distributed/routing/autoscaling.md) — Match instance count to measured load instead of to a guess
- [Competing Consumers](../patterns/messaging/competing-consumers.md) — Add consumers to a queue and throughput follows
- [Sharding](../patterns/distributed/routing/sharding.md) — Once compute scales freely, the data store becomes the ceiling
- [Minimize Coordination](./minimize-coordination.md) — Coordination is the ceiling that horizontal scale runs into
- [Partition Around Limits](./partition-around-limits.md) — Scale out until you meet a limit, then partition around that limit
- [Build for the Needs of the Business](./build-for-business.md) — The growth the business plans for is what justifies horizontal scale

**Requires**

- [Stateless Service](../patterns/distributed/routing/stateless-service.md) — Instances must be interchangeable before adding one helps anything

<!-- relationships:end -->
