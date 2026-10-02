---
title: Dependency Inversion Principle
description: High-level policy and low-level detail both depend on an abstraction the policy owns
area: principles-craft
owner: Oleksandr Derechei
tags: [low-level-design, abstraction, decoupling, testability]
status: stable
aliases: [DIP]
solves: [my business logic imports the database driver directly so I can't test it without a real DB, swapping the email provider means editing code deep in my domain layer, the core logic is hard-wired to one concrete class and I can't mock it, high-level code keeps breaking whenever a low-level library changes underneath it, our unit tests hit the real payment sandbox because there is no seam to fake it]
---

# Dependency Inversion Principle

High-level policy should not depend on low-level detail; both should depend on an abstraction. And the abstraction should belong to the policy, so that the details are the ones made to conform — inverting the direction the dependency would otherwise run.

## What it says
<!--meta block=description-->

The D in SOLID, stated by Robert C. Martin in two clauses: “High-level modules should not depend on low-level modules; both should depend on abstractions.” And: “Abstractions should not depend on details; details should depend on abstractions.”

The word that matters is inversion. Left to nature, the module holding the important policy calls down into the concrete gadgets that do the work, and so depends on them. DIP turns that arrow around. The policy declares an abstraction — an interface — describing the service it needs; the low-level detail implements that interface. The interface belongs to the high-level module, so both sides now point at something the policy owns, and it is the detail that has been made to conform.

## Explained
<!--meta block=explain-->

The dependency inversion principle says your important business logic should not call concrete tools such as a database or a payment provider directly. Instead the logic declares an interface describing what it needs and owns that interface, and the tool implements it, so the source-code arrow points toward the logic. Without that, a change in a vendor's client library forces edits to your core rules, and you cannot test them without the real database or network. The everyday mechanism is injection: a constructor takes a PaymentGateway, not a StripeClient, and you wire the real one once, where the application is assembled. Choose it over a direct call for volatile things you must fake in tests or expect to swap, such as databases, message brokers, HTTP and the clock. Where a collaborator is stable and singular, call it directly. Overdone, it leaves an interface with one implementation behind every class, two files to open instead of one. The counter-move is to invert only across seams that have more than one possible other side.

**Example.** An order service calls new StripeClient().charge(...) inside placeOrder(). Testing it needs the network and a sandbox key, and switching to Adyen means editing the order rules. The team defines PaymentGateway with one method, charge(order), inside the order package and passes it into the constructor. Tests inject a fake that returns success or declined in microseconds. A StripeGateway adapter implements the interface in the infrastructure package, and main wires it once. The cost is one extra interface and one adapter. The team does not do the same for its date-formatting helper: it is stable, has one version, and a direct call is clearer.

## Why it helps
<!--meta block=rationale-->

When policy depends directly on detail, the valuable, stable part of the system is chained to its most volatile part. Order-processing logic that `new`s a specific database client cannot run — cannot even compile — without that client, cannot be exercised in a test without a real database, and must be reopened every time the storage decision changes. The thing you least want to disturb is held hostage by the thing that changes most.

Inverting the dependency unchains the policy from the detail. The policy now speaks only to an abstraction, so any conforming detail — the production database, an in-memory fake, a different vendor entirely — can be dropped in behind it without the policy noticing. That is what makes the core independently testable, and it is why the stable, high-value modules can be compiled, reasoned about, and reused apart from the frameworks and drivers they happen to sit on today.

## Applying it
<!--meta block=applying-->

Make the details reach up to the policy rather than the reverse:

- Let the high-level module define the interface it needs and own it — put the abstraction in the policy's package, not the detail's. Ownership is what actually inverts the source-code dependency.
- Stop constructing concrete collaborators inside the policy. Pass them in — this is [dependency injection](../patterns/gof/extra/dependency-injection.md), the everyday mechanism through which DIP is realized: a constructor takes a `PaymentGateway`, not a specific `StripeClient`.
- Push volatile things — databases, message brokers, HTTP, the clock — out to the edges as adapters behind ports the core defines. This is the spine of [hexagonal](../patterns/architecture/hexagonal.md) (ports-and-adapters) architecture.
- Depend on the interface at the point of use; wire the concrete implementation once, at the composition root where the application is assembled.

The rule of thumb: source-code dependencies should point against the flow of control, toward the stable policy — not with it, toward the detail.

## Taken too far
<!--meta block=overreach-->

Inversion buys you the freedom to substitute — and if nothing will ever be substituted, you have paid for freedom you will not use. Wrapping every concrete class behind an interface with exactly one implementation, forever, is indirection for its own sake: two files to open instead of one, a jump through an abstraction to reach the only thing on the other side, and a codebase where `FooImpl` shadows every `Foo` to no end.

Invert across the seams that will actually move — the volatile boundaries, the things you must fake in a test or expect to swap. Where a collaborator is stable and singular, a direct dependency is honest and clearer. This is where DIP meets YAGNI (you aren't gonna need it): an abstraction over something that does not vary adds cost without buying the one thing abstractions are for. Reserve the interface for the seam that has more than one possible other side.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Interface Segregation Principle](./interface-segregation.md) — Depend on abstractions — and let them be small, client-shaped ones.
- [Open/Closed Principle](./open-closed.md) — Depending on an abstraction is how a module stays closed to edits yet open to new implementations.
- [Dependency Injection](../patterns/gof/extra/dependency-injection.md) — Injection is how the abstractions high-level code depends on actually get supplied.
- [Hexagonal](../patterns/architecture/hexagonal.md) — Ports are the abstractions the core owns; adapters are the details that conform to them.

**Prevents**

- [Static Cling](../hazards/static-cling.md) — A static call binds policy directly to a detail, with no abstraction in between

**Demonstrated by**

- [Logging Service](../designs/logging-service.md) — the high-level workflow class binding to abstractions rather than concretes is dependency inversion in practice
- [Inventory Management](../designs/inventory-management.md) — the high-level warehouse and the low-level notifier both depend on an abstraction, which is exactly what DIP prescribes

<!-- relationships:end -->
