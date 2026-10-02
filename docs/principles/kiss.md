---
title: Keep It Simple (KISS)
description: Prefer the simplest design that actually meets the requirement
area: principles-craft
owner: Oleksandr Derechei
tags: [low-level-design, readability, maintainability, abstraction]
status: stable
aliases: [KISS, "Keep It Simple, Stupid"]
solves: [this simple feature turned into a maze of abstractions nobody can follow, I added flexibility we never used and now the code is impossible to read, every trivial change has to thread through five layers of indirection, the solution is cleverer than the problem and nobody can debug it, new hires take weeks to understand a module that does something simple]
favourite: true
---

# Keep It Simple (KISS)

Of the designs that actually meet the requirement, prefer the simplest one. Complexity is not a neutral choice you make once; it is a tax levied on everyone who reads, changes, or debugs the code afterwards.

## What it says
<!--meta block=description-->

Given two designs that both do the job, take the simpler one. “Keep It Simple, Stupid” is usually credited to Kelly Johnson, the Lockheed engineer, as a rule for machines a mechanic could repair in the field. The distinction, sharpened by Rich Hickey: simple is not easy. Simple means un-braided, one concern with nothing folded together; easy means familiar and quick to type. A one-line trick can be easy and deeply un-simple.

## Explained
<!--meta block=explain-->

KISS says that when two designs both meet the requirement, you ship the one with fewer interlocked parts. Simple here means un-braided: each piece does one job and nothing is folded together. Easy means familiar and quick to type, and a clever one-liner can be easy and still not simple. Choose it over building for the larger requirement you imagine, and make the trigger for adding machinery a measurement, not a fear. Every extra layer, flag or indirection must be understood before anyone can fix a bug, so you pay for it on every future reading. Judge simplicity by how many colleagues can change the thing unaided, not by line count or boxes drawn.

- **It can hide real difficulty.** Concurrency and partial failure come back as bugs. Keep the domain's real difficulty in one openly hard, commented place.
- **The simplest design will one day stop fitting.** Price the later migration now, and set its trigger as a measured limit.

**Example.** A team must email a report to 300 customers each night. One option is a cron job (a timed task) running one 40-line script that one on-call engineer can read. The other is a queue, 3 workers and a scheduler: 5 parts that only two engineers can run. At 300 emails the script finishes in about 2 minutes, so the script wins. The cost arrives at 3 million emails a night, when one machine no longer finishes before morning and the team must split the work. That migration is the bill they accepted, and its trigger is a measured run time past 6 hours, not worry.

## Why it helps
<!--meta block=rationale-->

Every construct in a system — a layer, a parameter, a clever branch — has to be held in someone's head before it can be changed safely. Complexity you add today is paid back with interest on every future read: more to understand before a fix, more places a bug can hide, more ways an innocent change can ripple somewhere unexpected. The cost is not the writing; it is the years of reading that follow.

A simple design shrinks that surface. There is less to learn before you can touch it, fewer interactions to reason about, and a much shorter distance between a symptom and its cause. You spend far more of a system's life changing it than first building it, and simplicity is most of what keeps it changeable.

## Applying it
<!--meta block=applying-->

Reach for the least machinery that satisfies the actual requirement:

- Solve the problem in front of you, not the general problem you imagine behind it. The concrete case is usually smaller than the abstraction it suggests.
- Prefer a plain function to a framework, a straight line to a hierarchy, and an obvious name to a clever one.
- Count the moving parts. If a layer, flag, or indirection is not carrying its weight, delete it and let the code get more direct.
- Optimize for the reader who arrives without context: could a competent colleague follow this on a first pass, or does it need a guided tour?
- Put the complexity the domain really has in one place that is openly difficult, rather than smeared thinly across five that each look almost reasonable. One hard file with a comment explaining why is cheaper to maintain than five awkward ones nobody admits to.

The rule of thumb: when two solutions work, ship the one that is easier to throw away and rewrite, not the one that was more satisfying to build.

## Taken too far
<!--meta block=overreach-->

Simplicity is not the same as small, and it is not license to pretend a hard problem is easy. Push KISS too hard and it becomes oversimplification: refusing to model genuinely essential complexity, so the system cannot actually meet its requirements. Concurrency, partial failure, and awkward domain rules do not go away because you declined to represent them — they just resurface as bugs no structure was there to catch.

Measuring simplicity by line count is the common trap. Code golfed down to a cryptic one-liner is fewer characters and far less simple; hiding necessary structure behind a terse surface makes the whole thing harder, not easier. Real simplicity keeps distinct concerns distinct — even when that costs a few more lines — and admits the complexity the domain genuinely has instead of sweeping it under a rug the next reader will trip over.

The organisational version of the trap is choosing a design for the diagram rather than for the rota. A system with fewer boxes that only two people can safely operate is not simpler than one with an extra box the on-call team already runs every day — simplicity is relative to the people who live with it, so count the colleagues who could change the thing unaided, not the components on the picture.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [You Aren't Gonna Need It (YAGNI)](./yagni.md) — Two angles on one discipline: build the simplest thing that works, and only what is needed now.
- [Principle of Least Astonishment](./least-astonishment.md) — The simplest design is usually the least surprising one
- [Separation of Concerns](./separation-of-concerns.md) — Simple means un-braided — one concern per piece, which is this discipline stated as a rule for structure
- [Prefer Managed Services](./managed-services.md) — Not running it is simpler than running it well
- [Build for the Needs of the Business](./build-for-business.md) — A stated number is what 'meets the requirement' gets measured against
- [Transaction Script](../patterns/enterprise/transaction-script.md) — When logic is a few checks and one write, a plain procedure is the simpler design
- [Convention over Configuration](./convention-over-configuration.md) — Fewer settings to read and get wrong keeps a tool simple

**Prevents**

- [Leaky Abstraction](../hazards/leaky-abstraction.md) — Simplicity is the defence: the abstraction that hides less has less to leak
- [Premature Optimization](../hazards/premature-optimization.md) — Keeps code simple, so a speed-up must earn the extra complexity it adds

**Demonstrated by**

- [Distributed Cache](../designs/design-distributed-cache.md) — shows simplest-thing-first: a one-box hash table and coarse janitor schedule before ring, shards, and replicas
- [Yelp](../designs/yelp.md) — the simplest option that meets the requirement is chosen over defensible-but-unneeded complexity at every fork
- [Connect Four](../designs/connect-four.md) — Choosing the smallest model that makes illegal states unrepresentable is keep it simple (KISS) in practice
- [Persona Identification & Sanction Check](../designs/persona-identification.md) — a know your customer (KYC) design that holds exactly-once effects and tenant isolation on one database, refusing every component its confirmed volume cannot justify
- [Persona Identification & Sanction Check (V2)](../designs/persona-identification-v2.md) — guarantees kept with fewer moving parts than a bigger design would reach for, each rejection recorded with the number that justifies it

<!-- relationships:end -->
