---
title: Distributed Monolith
description: Separate services that still have to be released together
area: hazards
owner: Oleksandr Derechei
tags: [modularity, boundaries, decoupling, code-smell, maintainability]
status: stable
aliases: [distributed big ball of mud]
solves: [releasing one service means releasing three others the same afternoon, we split the monolith and everything got slower, a schema change in my service breaks two other teams, one page load fans out into forty internal calls, every team has to be in the room before anything can ship]
---

# Distributed Monolith

A system split into separately deployable services that still cannot be deployed separately: it pays every cost of distribution and collects none of the independence the split was meant to buy.

## What it is
<!--meta block=description-->

A distributed monolith is a system split into many services that still have to change and ship together. You recognize it by the release calendar, not the diagram: shipping one service means shipping others the same afternoon. The defining trait is that it pays the full price of distribution and collects none of the independence. It is not a Big Ball of Mud: its diagram is tidy, with the structure drawn in the wrong place.

## Explained
<!--meta block=explain-->

A distributed monolith is a system split into many services that still have to change and ship together. You pay the full price of distribution, which is network delays, partial failures and one pipeline per service, and you collect none of the independence it was meant to buy. It grows when boundaries are drawn before the business is understood, along technical layers, with a shared database schema, shared libraries holding business logic, or chains of synchronous calls. Each choice looks reasonable alone. Fix the data first, because two services on one schema are one service whatever the pipelines say: give each a private store and local read copies. Then cut the chains, sending an event where the caller needs no answer and running multi-service steps as a [saga](../patterns/distributed/coordination/saga.md) of local steps with undo actions. Draw new boundaries from the business domain, and stay coarse when unsure. Track one number: how many services were released together this month.

- **Stale copies.** Local read copies can lag by seconds, so design screens and rules to tolerate that.
- **Merging is costly.** Splitting later is routine but merging four services back is a project, so stay coarse when unsure.

**Example.** An order request calls pricing, stock, billing and shipping in a chain, all on one shared schema. Each service is up 99.9% of the time, but the chain needs 5 services, so it is up 0.999 to the fifth power, about 99.5%. That is roughly 44 hours of failure a year, not 9. Five teams release together each month. The team gives each service its own store with a local copy of what it reads, and orders publish events that billing and shipping consume. The order request now needs 3 services, and releases drop from 5 services at once to 1.

## How it happens
<!--meta block=causes-->

Nobody ships a distributed monolith on purpose. It is what you get when the boundaries are drawn before anyone knows where they belong, and the split then sets them in concrete: a bad boundary inside one process is an unfortunate import, and the same boundary across a network is a contract, a client library and two teams' schedules. Every cause below is a boundary in the wrong place.

The reason it survives review is that each individual decision looks reasonable. Sharing a schema avoids a migration. Extracting a common library removes duplication. Calling a neighbour for the current value is more correct than holding a copy. Each choice is locally right and globally the same choice — to keep the pieces in step with each other.

- **Boundaries along technical layers.** A "data access service", a "validation service" and a "messaging service" can never change alone, because every feature crosses all three.
- **A shared database schema.** Two services reading and writing the same tables are coupled through the data whatever their code does, so a column change has to be scheduled across everyone who touches it. Sharing a database server is fine; sharing a schema is not.
- **Boundaries drawn before the domain is understood.** Split on the org chart ([Conway's law](../principles/conways-law.md)) or on a guess and responsibilities keep migrating between services, with each migration costing a coordinated release.
- **Shared libraries carrying domain logic.** A common library recreates compile-time coupling: a version bump has to land everywhere at once, which is the release train the split was meant to remove.
- **Chatty synchronous chains.** If two pieces talk constantly once separated, the chatter is the evidence they belonged together — and A calls B calls C means every link has to be up for the request to succeed.
- **Distributed transactions treated as ordinary calls.** Insisting on all-or-nothing outcomes across services re-couples them at the tightest possible point, and does it inside the request path.
- **Refusing to duplicate any data.** With no local read copies, every service calls the owner for everything — which is sharing state through an API instead of through a table.

## What it costs
<!--meta block=cost-->

- **Every release is a scheduling problem.** Coordinated deploys across teams are the long release train that the split was supposed to remove, now running with more moving parts and more ways to derail.
- **Latency adds up per hop.** Each call costs network time and serialization, and a chain pays all of it on every request — which is why one page load that fans out forty times is slower than the monolith it replaced.
- **Availability multiplies downward.** A synchronous chain is up only while every link is up, so five services at 99.9% each give you worse availability than any one of them alone.
- **Debugging lost its call stack.** A failure now crosses processes and machines, so you buy and operate [Distributed Tracing](../patterns/distributed/resilience/distributed-tracing.md) to recover what a single-process stack trace showed for free.
- **You run N of everything.** N pipelines, N runtimes, N dashboards, N on-call rotations — all of it for one unit of independent change.

The compounding cost is organizational, and it arrives quietly. The architecture teaches teams they cannot move alone, so they stop trying: work gets batched into large coordinated releases because small ones are not any cheaper, and batching makes each release riskier, which is then used to justify more coordination. By the time somebody proposes redrawing the boundaries, the work competes with the roadmap for the same engineers, and moving functionality back across four existing services is a harder project than the original split ever was.

## Getting out
<!--meta block=mitigation-->

Draw boundaries from the domain, not from the deployment. A candidate service should wrap a [Bounded Context](../patterns/ddd/bounded-context.md) — a piece of the business with its own model and vocabulary — and own whole [Aggregates](../patterns/ddd/aggregate.md), so its consistency rules live inside it rather than across it. Then test the candidate with one question: could this ship on a Tuesday while nothing else does? An answer that needs a caveat is a boundary in the wrong place.

When in doubt, stay coarse. Splitting one service into two later is routine work; pulling functionality back across four existing services is a project with a steering committee. Give each service a private store, and let it hold a local copy of what it reads from elsewhere instead of calling for it every time — the duplication you refuse is the coupling you keep.

Then cut the synchronous chains. Where the caller does not need an answer, publish an event, so a downstream outage delays the work instead of failing the request; keep that event atomic with the state change using an [Outbox](../patterns/distributed/coordination/outbox.md). Where a business step genuinely spans services, run it as a [Saga](../patterns/distributed/coordination/saga.md) with compensating actions rather than as a distributed transaction. Where two contexts hold different models of the same idea, put an [Anti-Corruption Layer](../patterns/ddd/acl.md) between them, so a change to one team's model stops at the boundary instead of propagating.

If you are already inside one, extract at the edges. Take the service with the fewest dependencies, put a facade in front that routes old and new, and move one slice at a time — [Strangler Fig](../patterns/distributed/coordination/strangler-fig.md) applied to a system that is already distributed. Measure the one number that matters: how many services had to be released together this month. When it reaches one, you are out, and no diagram will tell you sooner.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Often confused with**

- [Big Ball of Mud](./big-ball-of-mud.md) — Mud is the absence of structure; this has structure, drawn in the wrong place and now enforced by the network.

**Mitigated by**

- [Bounded Context](../patterns/ddd/bounded-context.md) — Boundaries taken from the domain rather than from technical layers are what stop services having to move together.
- [Anti-Corruption Layer](../patterns/ddd/acl.md) — A translation layer at the seam keeps one team's model change from propagating into everyone else's release.
- [Materialized View](../patterns/distributed/coordination/materialized-view.md) — A local read copy removes the synchronous call that made the caller depend on the callee being up.
- [Saga](../patterns/distributed/coordination/saga.md) — Compensating steps replace the distributed transaction whose all-or-nothing semantics coupled the services.
- [Strangler Fig](../patterns/distributed/coordination/strangler-fig.md) — Extracting at the edges first, behind a routing seam, avoids the first slice dragging half the system with it.
- [Contract Testing](../patterns/testing/contract-testing.md) — Verified contracts are what let services deploy separately instead of only together
- [API Versioning](../patterns/distributed/routing/api-versioning.md) — Versioned contracts remove the lockstep release that makes services a monolith
- [Conway's Law](../principles/conways-law.md) — Layer-owned services are Conway's law at work, and the cure starts in the org.

**Threatens**

- [Microservices](../patterns/architecture/microservices.md) — A split along technical layers with a shared schema keeps the coupling and adds the network

<!-- relationships:end -->
