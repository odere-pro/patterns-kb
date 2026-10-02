---
title: Mediator
description: Centralizes how a set of objects interact
area: gof-behavioral
owner: Oleksandr Derechei
tags: [low-level-design, decoupling, maintainability]
status: stable
solves: [every component holds a reference to every other component, I cannot reuse this widget anywhere because it is wired directly to five siblings, the rule for when the submit button turns on is copy-pasted across three classes, changing how two objects coordinate means editing six files, adding one more component to this screen means touching all the existing ones]
---

# Mediator

Replaces a tangle of objects calling each other directly with a single coordinator that owns how they interact — colleagues talk to the mediator, never to one another.

## What it is
<!--meta block=description-->

Objects that call each other directly form a many-to-many web, so one interaction rule is smeared across several classes and no object can be reused alone. A mediator is one hub that all the objects talk to: each tells the hub what happened, and the hub decides who reacts. The interaction logic then lives in one place.

## Explained
<!--meta block=explain-->

A mediator is one object that all the others talk to instead of talking to each other. When something happens, an object tells the mediator, and the mediator decides who else reacts, so the rules for how they interact live in one place. Choose it over direct calls when those interaction rules are the hard part and are spread across many classes. Between two objects that talk one way, direct calls are simpler. The mediator must own real logic, because one that only forwards calls adds a hop and hides who triggered what.

- **God object.** Every new rule lands in the mediator, so it grows huge and hard to test. Use one mediator per feature or screen.
- **Rules in the wrong place.** A rule about a single object belongs in that object, so move it back out of the mediator.
- **Single point of failure.** All control sits in one object, so it becomes a bottleneck and a hidden path to trace.

**Example.** A signup form has 6 widgets. If each may call the other 5 directly, that is 30 references. With a mediator it is 6 references from the widgets to the hub and 6 back, 12 in all. The hub holds one rule: submit is enabled only when terms is checked and email is filled. Six months later it also holds 40 rules about passwords, country lists and promo codes, and every change conflicts. The fix is one mediator per section (account, address, payment) of about a dozen rules each.

## How it works
<!--meta block=structure-->

```mermaid caption="Colleagues route every interaction through the mediator instead of referencing each other, collapsing a many-to-many web into a hub."
flowchart LR
    A["Colleague A"] <-->|"notify / relay"| M["Mediator"]
    B["Colleague B"] <-->|"notify / relay"| M
    C["Colleague C"] <-->|"notify / relay"| M
    D["Colleague D"] <-->|"notify / relay"| M
```

## Variations
<!--meta block=variations-->

- **Message / event bus** — A fully decoupled mediator: colleagues publish typed messages and subscribe to the ones they care about, so senders and receivers never name each other.
- **Request dispatcher** — An in-process mediator that maps a request object to exactly one handler (the MediatR style), keeping controllers thin and handlers isolated.
- **GUI director** — The classic dialog mediator: one object owns the rules that link widgets, so each widget stays dumb about its siblings.
- **Hub / broker** — A network-scale mediator — a chat server or air-traffic controller — where clients coordinate only through the central hub, never peer-to-peer.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **The objects depend on one mediator** instead of on each other, so they stay independent.
- **The rules for how they interact** live in one place, not smeared across many classes.
- **It turns tangled many-to-many links** into a single hub, cutting connections from roughly n² toward n.
- **Each object gets simpler** and easier to reuse elsewhere.

### Cons
<!--meta polarity=con-->

- **The mediator can swell** as it soaks up every rule, until it does too much.
- **Putting control in one place** makes it a bottleneck and a single point of failure.
- **The indirection hides who actually triggers what**, making the flow harder to trace.
- **It's overkill when the objects barely interact**, or only talk one way.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **A group of objects reference each other** in complex, tangled ways.
- **Reusing one object is hard** because it's wired directly to many others.
- **The rules for how they interact** are scattered across classes and hard to change.

### Avoid when
<!--meta polarity=avoid-->

- **The objects barely interact**, or only in one direction — a simple broadcast fits better.
- **There's a natural one-way flow** that needs no central coordinator.
- **The mediator would only relay calls** without owning any real logic.

Kept lean, it stops scattered coordination from congealing across your classes — but a mediator that hoards every rule becomes exactly the [God Object](../../../hazards/god-object.md) it was meant to prevent.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — a signup form where one hub owns the widgets' rules"
type WidgetEvent = "toggled" | "changed";

interface Mediator {
  notify(sender: Component, event: WidgetEvent): void;
}

abstract class Component {
  constructor(protected readonly mediator: Mediator) {}
}

class Checkbox extends Component {
  checked = false;
  toggle(): void {
    this.checked = !this.checked;
    this.mediator.notify(this, "toggled");   // tell the hub, not the button
  }
}

class SubmitButton extends Component {
  enabled = false;
  setEnabled(on: boolean): void { this.enabled = on; }
}

class SignupForm implements Mediator {
  constructor(
    private readonly terms: Checkbox,
    private readonly submit: SubmitButton,
  ) {}

  notify(sender: Component, event: WidgetEvent): void {
    // one place owns the rule: submit follows the terms checkbox
    if (sender === this.terms && event === "toggled") {
      this.submit.setEnabled(this.terms.checked);
    }
  }
}
```

## In the wild
<!--meta block=wild-->

- **MediatR** — Controllers call ISender.Send(request); MediatR resolves the single IRequestHandler for that request type from the dependency injection (DI) container and invokes it, so neither side names the other. Cross-cutting concerns slot in as IPipelineBehavior wrappers that run around every handler, and INotification with Publish() is the multi-handler broadcast variant. {#wild-mediatr}
- **MassTransit Mediator** — The MassTransit library for .NET ships an in-process mediator, added with AddMediator, that routes a request or message to its consumer without the sender referencing the consumer. It uses the same shape as MediatR, with consumers and filters. {#wild-masstransit-mediator}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **Mediator granularity** — One mediator for the whole screen or module, or several for smaller groups of colleagues. Smaller ones stay readable.
- **Sync or async dispatch** — Whether the mediator handles a request in the caller's thread or queues it. Queuing hides latency and needs an error path.
- **Cross-cutting hooks** — Logging, validation and transactions run around every handler, in a fixed order.
- **Request versus broadcast** — One handler per request, or many handlers per notification.

### Signals to watch
<!--meta polarity=signal-->

- **Mediator size** — Lines and handler count in the mediator class. Steady growth marks a new god object.
- **Colleague imports** — Colleagues that import each other again show the mediator is being bypassed.
- **Handler count per request** — Requests with no handler or several handlers when one was expected.
- **Time in the mediator** — Latency added per dispatch, from a trace or timing.

### Failure modes under load
<!--meta polarity=failure-->

- **God object** — All the logic collects in the mediator and the colleagues become empty shells. Keep business rules in the colleagues or in handlers.
- **Missing handler found late** — A request type with no registered handler fails at run time. Check registration at startup.
- **Hidden control flow** — A call goes through the mediator and a debugger step shows nothing about who answers. Log request and handler names.
- **Cyclic dispatch** — A handler sends a request that ends up back at itself and the stack grows.

### Readiness checklist
<!--meta polarity=check-->

- Every request type has exactly one registered handler, checked at startup
- Colleagues do not import each other
- Pipeline behaviors run in a documented order
- Handlers have tests that run without the mediator

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Object Behavior](../../../themes/object-behavior.md) — Route all interaction between a set of objects through one object. {#fluency-object-behavior}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Command](./command.md) — A dispatcher routes each request object to its one handler

**Often confused with**

- [Observer](./observer.md) — Broadcast changes vs. centralize interactions
- [Facade](../structural/facade.md) — Colleagues talk back through a mediator; a facade only simplifies inward

**Prevents**

- [God Object](../../../hazards/god-object.md) — Centralizing coordination, done carefully, avoids one class doing all

<!-- relationships:end -->
