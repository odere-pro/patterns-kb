---
title: Open/Closed Principle
description: "Open for extension, closed for modification — add behavior by adding code, not editing it"
area: principles-craft
owner: Oleksandr Derechei
tags: [low-level-design, extensibility, abstraction, polymorphism]
status: stable
aliases: [OCP]
solves: [every new payment provider means editing the same giant switch statement, I can't add a feature without touching code that already works and is tested, one more report format and I'm back in the same file adding another if-branch, adding a case forces me to re-test the whole module, shipping a new variant means redeploying the core instead of just adding to it]
---

# Open/Closed Principle

Software entities should be open for extension but closed for modification. Add new behaviour by writing new implementations of a stable abstraction, rather than reopening and re-testing code that already works.

## What it says
<!--meta block=description-->

Software entities should be open for extension, but closed for modification. It is the “O” in SOLID. The phrasing is Bertrand Meyer's, from Object-Oriented Software Construction (1988), where the mechanism was inheritance; the modern, polymorphic reading — extend behaviour through new implementations of an abstraction — is Robert C. Martin's.

Open for extension: the module can be given new behaviour. Closed for modification: you gain that behaviour without editing the module's existing, working source. The two are reconciled by an abstraction — a stable interface whose callers never change while the set of implementations behind it grows.

## Explained
<!--meta block=explain-->

The open-closed principle says you add new behaviour by writing new code, not by editing code that already works. You lay a stable interface across the one axis that varies, and each variant becomes a new implementation behind it. Without that, every new case is another branch in a growing switch, and each edit risks breaking the cases that already ship. Choose it over editing in place when you can name the axis, such as payment methods or export formats, and new variants keep arriving. Choose a plain if or switch while only one variant exists, because every seam is a bet that this axis will vary, and a wrong bet costs layers of indirection and interfaces with one implementation. The counter-move is to let the first hard-coded version stand and refactor to a seam when the second real variant shows up, since an abstraction earned by two cases fits and one imagined in advance rarely does. The goal is that the next expected variant costs one new file and zero edits to shipped code.

**Example.** A shop's checkout has a function with an if/else ladder: card, then PayPal. Adding bank transfer means editing it, and that edit once breaks PayPal refunds. When the third method arrives, the team extracts a PaymentMethod interface with pay() and refund() and moves each branch into its own class. A fourth method, Apple Pay, now costs one new file and no edits to checkout. The cost is that 3 branches became 3 classes plus an interface, and a reader needs 2 jumps to see what card payment does. The team did not do this while only card existed, because one implementation would have been a bet on a variation nobody had asked for.

## Why it helps
<!--meta block=rationale-->

Code that already works and is tested is an asset; reopening it to bolt on a case puts that asset at risk. The classic shape is a `switch` over a type that grows a new arm for every variant — each edit re-touches the one function every variant shares, and a mistake made for the newest case can break all the old ones.

Push the variation behind an abstraction and new cases arrive as new code in new files. The dispatch site never changes, so it never regresses; the blast radius of adding a variant is exactly the variant. You are extending the system by addition rather than surgery — the safest kind of change there is.

## Applying it
<!--meta block=applying-->

Find the axis of variation and lay a seam across it:

- Program to an interface, then add capability by writing a new implementation — a new strategy, a new decorator — not a new branch.
- Replace a growing `switch` or `if`/`else` ladder over a type code with polymorphic dispatch.
- Let the stable core depend on abstractions and inject the concrete piece from outside — plugins, handlers registered at startup, a [template method](../patterns/gof/behavioral/template-method.md)'s overridable steps.
- Close only the axis that actually varies. Which one that is comes from experience with the domain, not from guessing up front.

The goal: the next expected variant costs one new file and zero edits to what already ships.

## Taken too far
<!--meta block=overreach-->

Every abstraction is a bet that a particular axis will vary. Guess the axis wrong — or add seams for variation that never arrives — and you have paid for flexibility no one uses: layers of indirection, interfaces with a single implementation, a plugin framework for a thing that changed once. This is where the principle collides head-on with YAGNI (you aren't gonna need it).

So do not build the extension point on speculation. Let the first hard-coded version stand; when a second variant actually shows up, then refactor to the seam the real difference reveals. An abstraction earned by two concrete cases fits; one imagined in advance almost never does.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Liskov Substitution Principle](./liskov-substitution.md) — Extending through new subtypes only stays safe when each is genuinely substitutable.
- [Dependency Inversion Principle](./dependency-inversion.md) — Both keep working code stable by putting an abstraction between it and what varies.
- [Strategy](../patterns/gof/behavioral/strategy.md) — Swap the algorithm by adding a new Strategy, not by editing the context.
- [Decorator](../patterns/gof/structural/decorator.md) — Add responsibilities by wrapping, leaving the wrapped class untouched.
- [Template Method](../patterns/gof/behavioral/template-method.md) — New behaviour arrives through a subclass hook; the algorithm skeleton stays closed.
- [Microkernel / Plugin](../patterns/architecture/microkernel.md) — A stable extension API is the principle applied to a whole product

**Specializes**

- [Design for Evolution](./design-for-evolution.md) — Open/closed is this rule at the level of a single class

**Demonstrated by**

- [Elevator](../designs/elevator.md) — new behaviour is added by extension rather than by modifying the existing movement algorithm
- [Connect Four](../designs/connect-four.md) — Extensions arriving through new collaborators and parameters rather than rewrites is the open-closed shape
- [Logging Service](../designs/logging-service.md) — extending behaviour without modifying existing classes is open/closed made concrete
- [Rate Limiter](../designs/design-rate-limiter.md) — the design extends to new algorithms without modifying working code — open-closed made concrete

<!-- relationships:end -->
