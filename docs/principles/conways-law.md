---
title: Conway's Law
description: A system copies the communication structure of the organisation that builds it
area: principles-systems
owner: Oleksandr Derechei
tags: [modularity, boundaries]
status: stable
aliases: [Conway's Law, inverse Conway manoeuvre]
solves: ["every feature we ship needs changes from three teams, however clean each service looks on its own", our architecture ended up with a service for each team instead of for each business area, two teams that never talk built two components that do the same job, we reorganised and a month later the code interfaces started to drift]
---

# Conway's Law

A system ends up with the same shape as the communication structure of the organisation that builds it. Four teams that talk through a manager build four pieces joined by narrow, formal interfaces, whatever the architecture diagram said.

## What it says
<!--meta block=description-->

Melvin Conway wrote it in 1968, in the paper "How Do Committees Invent?": organisations that design systems are constrained to produce designs that copy their own communication structure. The mechanism is plain. Two parts of a system can only be shaped together if the people who own them talk often, so a boundary between teams that rarely talk becomes a boundary in the software, and an interface between parts owned by people who talk daily stays loose and changes weekly.

The common misreading is that it is a complaint, a jibe at bad org charts. It is closer to a measurement. The system you have shows you the communication you actually had, including the informal paths the org chart omits: two teams that share a chat channel build components that know too much about each other, and two teams that never meet build components that duplicate each other.

It is not a law of nature and it does not forbid a different design. It says the design that fights the organisation costs more, because every change that crosses the mismatch needs a meeting. The usual evidence is a [Distributed Monolith](../hazards/distributed-monolith.md): services split along technical layers owned by different teams, so every feature needs all of them.

## Explained
<!--meta block=explain-->

Conway's law says the structure of a system comes to match the way the people who build it communicate. Two parts can be shaped together only when their owners talk often, so a boundary between teams that rarely talk becomes a hard, formal boundary in the software, and parts owned by one team stay loosely joined and change freely. Read the system as a measurement of the organisation, including its informal paths. Use it in two ways. To diagnose, count the teams that each common change touches. To design, run the inverse Conway manoeuvre: form the teams the target architecture needs and let their communication shape the system, rather than drawing the system and hoping. Choose it over drawing boundaries on technical grounds alone, because a boundary that crosses a team line costs a negotiation on every change. It has costs. Reorganising is slow, so first fix the interfaces that already hurt. A team per service leaves no owner of the user journey, so name one. And do not bend people to a diagram, since a good contract can bridge a weak boundary.

**Example.** A shop has a front-end team, an API team and a database team. Adding a coupon field to checkout needs all three: a field in the page, a change in the API and a column in the database. Each team plans, reviews and deploys on its own timetable, and the change takes 3 weeks. After a regroup into one checkout team that owns all three layers, the same kind of change takes 2 days. The cost is that the checkout team now carries on-call for the database and has to keep its schema and its code consistent, and nobody owns the shared platform until one is named.

## Why it helps
<!--meta block=rationale-->

Software is built by people agreeing on interfaces, and agreement takes conversation. Where conversation is cheap, within a team, the parts are shaped together and the boundaries are fluid. Where it is costly, across teams or time zones, the parts are split by a formal contract that is expensive to change. The organisation therefore sets the price of changing each boundary, and the architecture settles where it is cheapest.

That makes the law useful as a design input and not only a diagnosis. If a boundary in the diagram crosses a team boundary in the org chart, every change at that boundary is a negotiation between two groups with different priorities. If a feature touches five services owned by five teams, shipping it takes five plans and five reviews, however clean each service is on its own. Seeing the mismatch before you draw the boundary is cheaper than discovering it in the release calendar.

It also explains why a reorganisation changes the code later. Merge two teams and the interface between their components drifts, because nobody now needs to hold it still. Split one team and a hidden coupling inside their component becomes a visible, painful one.

## Applying it
<!--meta block=applying-->

Design the teams and the system together, and check one against the other:

- Draw team boundaries along the business seams where a [Bounded Context](../patterns/ddd/bounded-context.md) would sit, so a team owns a whole slice, front to back, and can ship it alone.
- Run the inverse Conway manoeuvre when you want a target architecture: form the teams the target needs first, and let their communication shape the system, instead of drawing the system and hoping the teams follow.
- List the features you ship most often and count the teams each one touches. A feature that needs three teams every time marks a boundary in the wrong place.
- Give a service one owning team. Shared ownership is a boundary with nobody on either side of it.
- Keep a team small enough to talk without a meeting, and give it the full set of skills it needs to ship, so it does not wait on another team for a deploy or a schema change.
- Treat informal links as part of the design. If two teams must work closely, put them in the same group with the same goals, rather than letting a shared channel create the coupling by accident.
- Plan for the system to change after a reorganisation, and revisit the boundaries then; [Design for Evolution](./design-for-evolution.md) covers how to keep that change inside one part.

The compact test: for a typical change, does the set of code it touches match the set of people who must agree to it?

## Taken too far
<!--meta block=overreach-->

Used as an excuse, the law becomes fatalism: the architecture is bad because the org is bad, and nothing can be done. Reorganising to fit a design is slow and expensive, and a team structure that works for people, such as skills, career paths or time zones, is not worth breaking for a diagram. The architecture can bend too. A clear interface, a shared contract and a platform team can make a weak organisational boundary workable.

The opposite trap is believing the manoeuvre is a cure. Splitting teams to get services gives you the boundary and none of the independence if the work still crosses teams. A team per service with no owner for the user journey produces a perfect set of parts and a product nobody owns, and the first feature that spans four of them stalls.

Read the law as a prediction to test, not a rule to obey. When the system and the organisation disagree, ask which is wrong: sometimes the team boundary should move, and sometimes the code boundary should. Either way, make the choice on purpose, since the mismatch itself shows up as cost in every change that crosses it.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Bounded Context](../patterns/ddd/bounded-context.md) — Draw team boundaries along context boundaries so a team owns a whole slice.
- [Design for Evolution](./design-for-evolution.md) — Reorganisations move boundaries, so keep each change inside one part.

**Often confused with**

- [Vertical Slice](../patterns/architecture/vertical-slice.md) — Both align code to feature ownership, but Conway's law predicts it and slices prescribe it.

**Prevents**

- [Distributed Monolith](../hazards/distributed-monolith.md) — Teams aligned to business slices avoid services split along team layers.

<!-- relationships:end -->
