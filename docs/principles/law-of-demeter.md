---
title: Law of Demeter
description: "A method should talk only to its immediate collaborators, never reach through them"
area: principles-craft
owner: Oleksandr Derechei
tags: [low-level-design, encapsulation, decoupling, boundaries]
status: stable
aliases: [Principle of Least Knowledge, LoD]
solves: [a small change to one class rippled through everything that reached into it, my code is full of long chains like a.getB().getC().doThing(), renaming an internal field broke callers three objects away, testing one method means stubbing a whole chain of nested objects, my mocks return mocks that return mocks just to satisfy one call]
---

# Law of Demeter

Only talk to your immediate neighbours. A method may use the objects it is handed, holds, or makes — but it should not reach through one of them to poke at a stranger. The moment you write `a.getB().getC()`, you have taken a dependency on the shape of everything in that chain.

## What it says
<!--meta block=description-->

A method should only call methods belonging to a small, immediate circle: the object's own fields, the parameters it was passed, objects it creates itself, and the object it lives on. It should not call methods on the objects those methods return. Formulated in 1987 by Ian Holland during the Demeter Project at Northeastern University, it is also known as the principle of least knowledge: each unit should assume as little as possible about the structure of anything else.

The classic violation is the “train wreck”: `order.getCustomer().getAddress().getCity()`. Every dot after the first walks one step further into a structure the caller has no business knowing. Its natural partner is Tell, Don’t Ask — rather than pull an object's internals out and decide for it, tell the object what you want and let it decide.

## Explained
<!--meta block=explain-->

The Law of Demeter says a method should talk only to its own fields, its parameters and objects it creates, never to the objects those calls return. A chain such as order.getCustomer().getAddress().getCity() ties the caller to how three classes are nested, so renaming or moving any of them breaks code far away. The cure is to tell an object what you want and let it decide: order.shippingCity(), or account.withdraw(amount) in place of reading the balance, comparing it and writing it back. Choose it over chains of getters when the objects you reach through hold rules or structure that may change. Leave a chain alone when it is the intended interface, as with a fluent builder or a stream pipeline, where each call hands you the next stage and nothing private is pried open. Obeyed to the letter, it costs a pile of pass-through methods that bury the design under more indirection than the chain had. The counter-move is to treat a second dot as a prompt to ask whose job this is, not as a law, and to add a method only when callers repeatedly want that far-off value.

**Example.** A report calls order.getCustomer().getAddress().getCity() in 14 places. The company then splits Address into BillingAddress and ShippingAddress, and all 14 lines stop compiling. The team adds order.shippingCity() on Order, which asks the customer and keeps the nesting private, so the next such change touches one method, not 14 call sites. The cost is one forwarding method per question callers ask, and a team that adds one for every field ends up with 40 pass-through methods on Order. So they add one only for questions asked from 3 or more places. The list.stream().filter(...).map(...) in the same report stays a chain.

## Why it helps
<!--meta block=rationale-->

A chain of calls is a chain of assumptions. `order.getCustomer().getAddress().getCity()` hard-codes that an order has a customer, a customer has an address, and an address exposes a city — three private structural facts, none of them the caller's. Refactor any link, make one nullable, wrap one in a [value object](../patterns/ddd/value-object.md), and every train wreck that walked through it breaks at once, in code that never mentioned the thing that changed.

Keeping to your immediate collaborators contains that blast radius. Each object hides its neighbours behind its own interface, so a structural change stops at the first boundary instead of propagating outward. It also shows up in tests: a method that only touches what it holds needs a couple of stubs, while a train wreck forces you to build an entire nested object graph just to exercise one line.

## Applying it
<!--meta block=applying-->

Push behavior toward the data instead of pulling data toward the behavior:

- When you catch yourself chaining getters, add a method to the direct collaborator that answers the real question — `order.shippingCity()`, not a walk through customer and address.
- Tell, don't ask: replace “get the balance, compare it, then set it” with `account.withdraw(amount)` and let the object enforce its own rules.
- Treat the “one dot” heuristic as a smell detector, not a law of physics — a second dot is a prompt to ask whose job this really is.
- If a caller genuinely needs a far-off value often, that is a signal the intermediate object should expose it directly, or that a collaborator is missing.

## Taken too far
<!--meta block=overreach-->

Obeyed to the letter, the law breeds thin wrapper methods — a forwarding delegate on every object just so the caller can stay one dot away. Sometimes derided as a “Demeter transmogrifier,” this pile of pass-through methods can bury the design under more indirection than the chain it replaced, without hiding anything real.

And not every dot is a train wreck. A fluent builder, a stream pipeline, or navigation through a plain data structure chains by design — `list.stream().filter(…).map(…)` is not reaching into someone's private guts, it is one object handing you the next stage. The law is about not coupling to hidden structure; where the chain is the intended interface and there are no internals being pried open, leave it alone.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Encapsulation](./encapsulation.md) — Reaching through an object for its collaborators is only possible where state is exposed
- [Facade](../patterns/gof/structural/facade.md) — Callers talk to one object instead of walking into a subsystem's internals
- [Aggregate](../patterns/ddd/aggregate.md) — Outside code goes through the root and never reaches into the objects inside the boundary

**Demonstrated by**

- [Parking Lot](../designs/parking-lot.md) — Parking Lot keeps records from navigating the domain by storing ids, not references

<!-- relationships:end -->
