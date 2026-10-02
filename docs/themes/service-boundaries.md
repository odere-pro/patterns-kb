---
title: Service Boundaries
description: "Deciding where one service ends and the next begins, and recognising the day you got it wrong"
area: themes-shaping
owner: Oleksandr Derechei
tags: [domain-modeling, boundaries, decoupling]
status: stable
aliases: [service decomposition, microservice boundaries]
---

# Service Boundaries

A service should do one thing, and no mechanical process turns that sentence into a line on a diagram. This theme walks the route from business domain to service list, the tactical patterns that make some clusters better service candidates than others, and the symptoms that tell you a boundary is wrong before the coupling tells you.

## The question
<!--meta block=description-->

A service should do one thing, but no procedure turns requirements into a boundary. You draw it from the business domain, the requirements and your priorities. Wrong lines show up later as hidden dependencies, interfaces shaped like database tables, and services that ship together or not at all. This theme gives four steps from domain to services, and treats each boundary as a hypothesis with an expiry date.

## Explained
<!--meta block=explain-->

A service boundary is the line that says which work belongs in one service, and no procedure produces it from requirements, so you draw it from the business domain and test it against symptoms. Work through four steps: describe the business functions and how they depend on each other, define one [bounded context](../patterns/ddd/bounded-context.md) per subdomain (a part of the business with its own vocabulary), find the [entities](../patterns/ddd/entity.md) and [aggregates](../patterns/ddd/aggregate.md) inside each, then adjust for team size, scale and security. Cut too fine and services chatter, latency stacks per call, and two services must be released together. Cut too coarse and one service holds two meanings of the same word and one team blocks another. Prefer the coarse mistake, because splitting a service is a known refactor while pulling one capability out of four services is a data merge. When you must move off a wrong cut, migrate gradually with a [strangler fig](../patterns/distributed/coordination/strangler-fig.md).

- **Boundaries expire.** A cut right at four capabilities is wrong at forty. Review boundaries on a schedule.
- **Redrawing is expensive.** Moving a line costs real development work. Start coarser when the answer is unclear.
- **Org chart drift.** Systems drift toward team structure. Align teams to contexts on purpose.

**Example.** A delivery firm splits orders from billing. Checkout calls billing 6 times per order at 20 ms each, adding 120 ms, and the two were released together 9 times out of the last 10. The symptoms say the cut went through something cohesive, so they merge them. Another service holds a vehicle model with mileage and service history for maintenance, and only free-or-busy and arrival time for scheduling. Two vocabularies live in one model, so they split it along the context line, and each team now changes its own model without asking the other.

## The trade-space
<!--meta block=tradespace-->

There are two ways to get a boundary wrong, and they are not symmetric.

Cut too finely and the services spend their time talking to each other. Chatty APIs between two services are the clearest evidence that the cut went through something cohesive: latency stacks up call by call, availability couples, and a change to one shape forces a matching change in the other. Interdependencies that make two services deploy together are the same fault further along — at that point you are paying the operating cost of many services and collecting the independence of none.

Cut too coarsely and you keep the monolith's problems with a network in the middle. A service holding two domain models has one word meaning two things inside it, one team's release blocking another's, and more surface than a small team can own end to end.

Prefer the coarse mistake. Splitting a service that grew a second responsibility is a familiar refactor with a clear before and after; pulling one capability back out of four services that each hold a piece of it is a migration with a data merge in the middle.

Consistency pulls toward coarser boundaries, and it should not always win. Grouping related functionality into one service does avoid a class of integrity problems, but strong consistency is not required everywhere, and the benefit of decomposing often outweighs the cost of managing eventual consistency. Decide it per invariant rather than per system.

Team structure is the other force, and it acts whether or not you invite it. Systems mirror the communication structures of the organizations that build them, so boundaries drawn without reference to team ownership drift toward the org chart on their own. Define the contexts from the domain first and align ownership to them deliberately — and when one team has to own several unrelated contexts, or one context needs coordination across many teams, revisit the boundaries or revisit the team structure.

Two contexts can hold the same real-world thing and disagree about what it is, and that is the design working rather than failing. A maintenance context needs a vehicle's service history, mileage and model; a scheduling context needs only whether it is free and when it arrives. One shared model serving both is larger than either needs and cannot change without both teams agreeing — see [Bounded Context](../patterns/ddd/bounded-context.md). Build the vocabulary inside each boundary with the people who do that work, and let the same word mean two things across the line. Getting there needs no formal method: a whiteboard and the right people in the room is enough, and event storming is one way to run the session if the group wants a format.

## The patterns that draw the line
<!--meta block=tour-->

<!-- tour:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

### [Bounded Context](../patterns/ddd/bounded-context.md) {#tour-bounded-context}

This is the first cut, and the rule that follows from it is strict: a service should never span more than one bounded context. A candidate that mixes two domain models is telling you the analysis is unfinished — go back to the map, not forward to the code. Contexts are never isolated, so record how they meet: an upstream context supplying a downstream one under a negotiated contract, a published application programming interface (API) in a shared format that several downstream contexts consume, a translation layer where an upstream model would otherwise leak, or no integration at all.

### [Context Map](../patterns/ddd/context-map.md) {#tour-context-map}

Once the contexts exist, a map names the relationship on each border: who is upstream, who translates, and which model is shared.

### [Entity](../patterns/ddd/entity.md) {#tour-entity}

Inside a context, the first question about each concept is whether it has an identity that outlives its data. A customer whose name, address and status all change is still that customer, and the id is what the rest of the system holds onto. Entities are where the lifecycle lives, which is why they anchor the clusters the next step draws.

### [Value Object](../patterns/ddd/value-object.md) {#tour-value-object}

The complement: a concept with no identity, equal to another whenever its attributes are equal — a money amount, a date range, a delivery address. Value objects settle a boundary question cheaply, because carrying no identity means they cross a service boundary as a copy rather than a reference. That is exactly what you want when a shipping context needs to know where to deliver but has no business owning the customer record.

### [Aggregate](../patterns/ddd/aggregate.md) {#tour-aggregate}

An aggregate clusters entities and value objects behind one root that owns an invariant spanning them, which makes it the strongest service candidate you have — a well-drawn aggregate already carries the four properties a well-drawn service needs. It comes from business requirements rather than technical ones. It is functionally cohesive. It is a boundary of persistence. And it is loosely coupled to the other aggregates. Domain services are candidates too: stateless operations spanning several aggregates, which usually become a workflow across services.

### [Domain Service](../patterns/ddd/domain-service.md) {#tour-domain-service}

A rule that belongs to no single aggregate or entity lives in a stateless service in the domain, so the boundaries stay clean.

### [Anti-Corruption Layer](../patterns/ddd/acl.md) {#tour-acl}

When the context across the boundary is a legacy system or a vendor, integrating directly lets its schema and vocabulary in one call at a time, until your model is a copy of theirs and you can no longer model your own domain. A translation layer on your side keeps your domain code seeing only its own types. It also answers a subtler boundary question: when your context needs something another context owns, you can call across directly, or stand up a mediating service inside your boundary that exposes a shape better suited to you. Weigh the network cost of the direct call, how well their schema fits yours, and how expensive cross-team coordination has become.

### [Strangler Fig](../patterns/distributed/coordination/strangler-fig.md) {#tour-strangler-fig}

Boundaries are usually drawn against a system that already exists, and a wholesale rewrite is rarely on the table. Route traffic through a facade, move one capability behind it into a service of its own, and repeat. A boundary decided on paper becomes real incrementally, and a boundary that turns out to be wrong is corrected while the system keeps serving.

<!-- tour:end -->

## Validating a candidate design
<!--meta block=decide-->

Run a candidate decomposition against the symptoms below. Each one is observable — in a release calendar, a trace, or a team's standup — which is what makes it a better test than asking whether the design feels clean.

| The symptom | What it says about the boundary | What to do |
| --- | --- | --- |
| Two services have to be released together | The split does not follow the real dependency | Merge them, or move the shared decision into one of them |
| Their APIs are chatty and constantly exchanging information | The cut went through something cohesive | Merge, or move the function to the side that calls it most |
| One service contains two domain models | It spans more than one [bounded context](../patterns/ddd/bounded-context.md) | Go back to step two and split on the context line |
| Only a large team could build and run it | The service is too big to be owned independently | Split it along the [aggregates](../patterns/ddd/aggregate.md) inside it |
| A change to one service's shape forces a matching change next door | They are coupled through a shared model | Publish a contract, or put an [anti-corruption layer](../patterns/ddd/acl.md) between them |
| An invariant spans two services | The boundary crosses a consistency requirement | Group them — unless eventual consistency is acceptable here, which you should price rather than assume |
| One team owns three unrelated contexts | Ownership does not match the domain | Revisit the boundaries, or revisit the team structure |
| Nobody can agree where the line goes | The analysis is not finished | Draw it coarser and move on; splitting later is cheaper than merging later |

## Related areas
<!--meta block=siblings-->

- [Microservices Design](./microservices-design.md) — What you design once the boundaries are settled: communication, the client edge, and data.
- [Architecture Styles](./architecture-styles.md) — Whether to decompose vertically at all, and what the alternatives cost.
- [API Design](./api-design.md) — The contracts that make a boundary something other teams can build against.
