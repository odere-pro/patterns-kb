---
title: Facade
description: One simple interface over a complex subsystem
area: gof-structural
owner: Oleksandr Derechei
tags: [low-level-design, readability, decoupling, encapsulation, separation-of-concerns]
status: stable
solves: [doing one simple task means calling six classes in exactly the right order, every caller has to know the internal wiring of this library just to get started, I cannot refactor this module because half the codebase reaches into its internals, new people take days to figure out the setup sequence for our subsystem, the same twenty lines of orchestration are copy-pasted into every client]
---

# Facade

Wraps a sprawling subsystem behind a single, task-oriented interface — so callers make one clear call instead of wiring together a dozen collaborating classes themselves.

## What it is
<!--meta block=description-->

A **facade** is a single object that offers a small, high-level interface over a set of lower-level parts. Behind it sit many classes with their own responsibilities and their own vocabulary; in front of it, callers see a handful of methods named after the tasks they actually want to perform.

The force it resolves is **accidental coupling to internals**. A rich subsystem tends to leak its structure: to do one useful thing, a caller has to know which classes exist, the order to call them in, and how they hand data to each other. That knowledge spreads through every client and freezes the subsystem — you can no longer refactor it without breaking them all.

The facade absorbs that orchestration. It knows the call sequence, the wiring, and the defaults, and exposes just the common workflows. Clients depend on the facade's narrow surface, not on the parts, so the subsystem stays free to evolve behind it.

Crucially, a facade holds no subsystem logic of its own — it orchestrates and delegates. Thin work either side of the call is fair game, and the facade is a natural place for it: a log line, an authorization check, a transaction boundary around the whole workflow. It also doesn't wall the subsystem off: advanced callers can still reach past it when they genuinely need finer control.

## Explained
<!--meta block=explain-->

A facade is one object that offers a few methods named after the tasks callers want, such as \`placeOrder\`, and does the work by calling the many classes behind it in the right order. Callers stop depending on those classes, so you can rework them freely and break nobody. Choose it when a handful of workflows account for most uses of a subsystem and you want its inside free to change. If callers need the fine controls most of the time, the facade only gets in the way. The characteristic failure is growth. Convenient entry points attract unrelated operations until one class that everyone imports must be edited by every team, so give each facade one family of workflows and turn away unrelated methods. It also hides power, so keep an escape hatch to the raw parts, knowing that each caller who uses it voids the isolation. And every method you add is a signature you promise to keep, so widen the facade only for requests from several callers.

**Example.** Placing an order means 5 calls, to inventory, pricing, payment, shipping and email, in that order, and 12 screens each repeat the sequence. A facade method placeOrder makes the five calls once, so a change to the payment call is one edit, not 12. Over a year the facade gains refund, reportSales and exportTaxes, and each of 4 teams edits the same file. The fix is to move those 3 methods to their own facades and leave placeOrder alone. The cost is one more class to find and keep in step with the subsystem.

## How it works
<!--meta block=structure-->

```mermaid caption="The client talks only to the facade, which knows how to coordinate the subsystem's parts in the right order."
flowchart LR
    C["Client"] -->|"placeOrder()"| F["Facade"]
    F -->|"reserve()"| A["Inventory"]
    F -->|"charge()"| B["Payment"]
    F -->|"ship()"| S["Shipping"]
    F -->|"notify()"| N["Notifier"]
```

## Variations
<!--meta block=variations-->

- **Opaque vs. transparent** — A transparent facade leaves the subsystem classes public, so power users can still reach past it; an opaque one hides them entirely, trading flexibility for a smaller blast radius.
- **Session facade** — A coarse-grained facade over fine-grained business objects, exposing whole use cases as single calls — the classic answer to chatty round-trips across a network boundary.
- **Module / package facade** — A single entry file that re-exports a package's intended public surface, keeping deep internal paths private — the everyday "barrel" or index module.
- **Static facade** — A namespace of free functions over the subsystem rather than an instance. Convenient, but harder to substitute in tests since there's nothing to inject.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Gives callers one small, stable entry point** instead of many moving parts.
- **Separates your code from the subsystem's internals**, so you can rework them freely behind it.
- **Lowers the learning curve** — the common task becomes a single call.
- **A natural place to add cross-cutting concerns like** logging, auth, or transactions.

### Cons
<!--meta polarity=con-->

- **God-object risk** — it can swell into a [god object](../../../hazards/god-object.md) that the whole codebase leans on.
- **Can hide useful features** — power users still need an escape hatch to the raw parts.
- **One more layer to keep in sync** as the subsystem grows.
- **Tempts you to bolt unrelated operations** onto one convenient interface.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **A subsystem has many classes**, but a few common workflows account for most of its use.
- **You want to shield client code** from internals that are complex or likely to change.
- **You're wrapping a library or legacy module** and want a clean, task-oriented API.

### Avoid when
<!--meta polarity=avoid-->

- **The subsystem is already small and simple** — the facade adds a layer for nothing.
- **Callers genuinely need fine-grained control** over every part.
- **You'd only be converting one interface into another** — that's an [Adapter](./adapter.md), not a facade.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — a checkout facade over four subsystems"
// Subsystem — several small, independent parts.
class Inventory { reserve(sku: string, qty: number): boolean { return true; } }
class Payment   { charge(card: string, cents: number): string { return "txn_8f21"; } }
class Shipping  { schedule(sku: string, address: string): Date { return new Date(); } }
class Mailer    { send(to: string, body: string): void { /* enqueue email */ } }

interface OrderResult {
  readonly transactionId: string;
  readonly arrivesOn: Date;
}

// Facade — one task-oriented call across the whole flow.
class CheckoutService {
  constructor(
    private readonly inventory = new Inventory(),
    private readonly payment = new Payment(),
    private readonly shipping = new Shipping(),
    private readonly mailer = new Mailer(),
  ) {}

  placeOrder(sku: string, card: string, address: string, email: string): OrderResult {
    if (!this.inventory.reserve(sku, 1)) throw new Error("out of stock");
    const transactionId = this.payment.charge(card, 4999);
    const arrivesOn = this.shipping.schedule(sku, address);
    this.mailer.send(email, `Confirmed — arrives ${arrivesOn.toDateString()}`);
    return { transactionId, arrivesOn }; // the caller never touches the four parts
  }
}
```

## In the wild
<!--meta block=wild-->

- **Python requests** — Its verb-named get/post calls and the Session object sit over urllib3, hiding connection pooling, Transport Layer Security (TLS), content decoding, redirect following and cookie persistence behind a small task-oriented API that returns a Response. {#wild-python-requests}
- **jQuery** — Collapses cross-browser DOM traversal, event binding and XMLHttpRequest setup into one chainable $() API, papering over the inconsistencies between legacy browser DOM and event implementations. {#wild-jquery}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **Surface size** — Which operations the facade exposes. A smaller surface hides more and fits fewer callers.
- **Escape hatch** — Whether callers may reach the subsystem directly when the facade is not enough.
- **Error translation** — Whether the facade surfaces the subsystem's errors or maps them to its own.
- **Statefulness** — A stateless facade is safe to share. One that holds session state needs an owner.

### Signals to watch
<!--meta polarity=signal-->

- **Facade method count** — Growth of the facade's methods. A steady climb means it is turning into a god object.
- **Direct subsystem imports** — Callers that bypass the facade and import subsystem classes.
- **Latency added** — Time per facade call over the subsystem calls inside it.
- **Escape hatch use** — How often callers use the escape hatch, which shows what the facade lacks.

### Failure modes under load
<!--meta polarity=failure-->

- **God facade** — The facade absorbs logic and becomes a class nobody can change.
- **Bypass** — Teams call the subsystem directly, and the facade is one of two ways in.
- **Hidden cost** — One simple call fans out to many remote calls and callers cannot see it.
- **Leaky errors** — The subsystem's exceptions pass through and callers import its types anyway.

### Readiness checklist
<!--meta polarity=check-->

- The facade holds no business rules, only orchestration
- Subsystem types do not appear in the facade's signatures
- The facade documents the calls and cost behind each method
- A test runs each facade method against the real subsystem or a close fake

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [API Design](../../../themes/api-design.md) — A single simple interface over a complex subsystem {#fluency-api-design}
- [Object Structure](../../../themes/object-structure.md) — Give callers a few task-shaped calls over a subsystem. {#fluency-object-structure}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Principle of Least Astonishment](../../../principles/least-astonishment.md) — Its value is a surface callers predict without reading inside
- [Law of Demeter](../../../principles/law-of-demeter.md) — A facade is the single circle callers need, so they stop chaining through collaborators

**Generalizes**

- [Page Object](../../testing/page-object.md) — Page objects apply it to a UI under test

**Often confused with**

- [Adapter](./adapter.md) — Convert one interface vs. simplify many
- [Gateway](../../enterprise/gateway.md) — Simplify a subsystem vs. wrap one external system
- [Mediator](../behavioral/mediator.md) — One-way simplification of a subsystem vs. two-way coordination between peers

**Demonstrated by**

- [File System](../../../designs/file-system.md) — the orchestrator hides tree-walking and path-splitting behind a small path-based API, the essence of a Facade
- [Inventory Management](../../../designs/inventory-management.md) — the manager gives external callers one simplified entry point over the warehouse subsystem
- [BookMyShow](../../../designs/bookmyshow.md) — the booking orchestrator is the only surface callers see, hiding the theater-and-showtime graph behind four operations

<!-- relationships:end -->
