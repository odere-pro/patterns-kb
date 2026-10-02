---
title: Composition over Inheritance
description: "Build behavior by assembling small objects, not by inheriting a deep class hierarchy"
area: principles-craft
owner: Oleksandr Derechei
tags: [low-level-design, composition, extensibility, decoupling]
status: stable
aliases: [composite reuse principle, CRP]
solves: [my subclass broke when the parent class changed a method it relied on, the class hierarchy is so tall that adding one variant means touching every level, I need to change an object's behavior at runtime but inheritance fixes it at compile time, I keep adding subclasses for every combination of features and it's exploding, I inherited a class just to reuse one method and dragged in everything else it does]
---

# Composition over Inheritance

Prefer to build an object's behavior out of smaller collaborating objects it holds and delegates to, rather than inheriting it from a base class. Composition lets you swap parts at runtime and combine them freely; a tall inheritance tree binds a subclass to its parents forever.

## What it says
<!--meta block=description-->

“Favor object composition over class inheritance” is one of two principles the Gang of Four name in the introduction to Design Patterns (1994), beside “program to an interface.” Inheritance reuses a parent by extending it; composition reuses a collaborator by holding a reference and forwarding work to it. Make the second your reflex, and keep inheritance for a genuine, stable is-a relationship.

## Explained
<!--meta block=explain-->

Composition over inheritance says that when a class needs behaviour, it should hold an object that provides it and hand the work over, instead of being a subclass that inherits it. Inheritance ties the child to the parent's internals for good, so a change to the parent ripples into every child, and one object cannot vary two behaviours independently. Holding a collaborator behind an interface lets you swap it while the program runs and test the pieces apart. Choose it over inheritance when the relationship is uses rather than is: a report uses a sorting strategy, while a Circle is a Shape. Keep inheritance for a true, stable is-a, such as a fixed taxonomy or a framework base class meant to be extended. Overdone, it costs forwarding boilerplate, because you wire the collaborator and then re-expose its methods one by one. The counter-move is to inherit where the relationship is genuine and unlikely to change, since three lines of subclass beat thirty lines of forwarding.

**Example.** A notification system has EmailAlert and SmsAlert, plus UrgentEmailAlert and UrgentSmsAlert as subclasses. Adding push means 2 more classes, because every channel needs an urgent variant, and 3 channels with 2 priorities make 6 classes. The team replaces the tree with one Alert class that holds a Channel (email, text message (SMS) or push) and a Priority policy. Now the same 3 channels and 2 priorities are 5 small objects, and a fourth channel adds 1 object instead of 2 classes. The cost is that Alert must forward send() to its channel by hand, and a reader traces two objects instead of one.

## Why it helps
<!--meta block=rationale-->

Inheritance is what the GoF call white-box reuse: the subclass can see and depend on the parent's internals, so the two are welded together. Change a method the parent uses internally and a distant subclass that overrode or relied on it breaks — the fragile base class problem, where an edit that looks local ripples down a hierarchy you did not think you were touching.

Composition is black-box reuse: the collaborator is reached only through its public interface, so you can replace it with any other object that honours that interface — often at runtime, once, per instance. Behavior becomes something you assemble and re-assemble rather than a shape frozen into the type at compile time, and each part answers to one owner instead of a whole lineage.

Modelling vocabulary makes the same distinction and is worth borrowing when you are deciding. An association is one object knowing another; aggregation is a whole holding parts that outlive it, so a department keeps its employees by reference and neither owns the other's lifetime; composition is a whole whose parts die with it, like an order and its line items. All three are the "has-a" this maxim prefers, and none of them is the "is-a" that inheritance asserts. Asking which of the three you actually mean is usually enough to settle the question, because an answer that is none of them — the subtype genuinely is the supertype everywhere the supertype is used — is exactly the case where inheritance is correct.

## Applying it
<!--meta block=applying-->

Reach for has-a before is-a:

- Give the object a field for the varying behavior and delegate to it, instead of subclassing to override a method.
- Program to an interface: depend on what the collaborator does, so any implementation can be dropped in — this is the seam that lets you swap or inject it.
- Let a family of small objects carry the variation — an interchangeable algorithm, a wrapper that adds one responsibility, a bridge between two axes that vary independently.
- When you catch a subclass reaching into `protected` internals of its parent, that is coupling asking to become composition.

The test: if the relationship is really “a Circle is a Shape” and always will be, inherit. If it is “this object uses a sorting strategy,” hold one.

## In code
<!--meta block=sketch-->

```typescript summary="TypeScript — a subclass per variation, and one object holding a swappable collaborator"
// Before: each export format needs a subclass, and formats cannot be mixed with other variation.
class Report { render() { return "data"; } }
class CsvReport extends Report { render() { return super.render() + ",csv"; } }
class PdfReport extends Report { render() { return super.render() + ",pdf"; } }

// After: the report holds a format and delegates to it.
interface Format { encode(data: string): string }
class Report2 {
  constructor(private format: Format) {}
  render() { return this.format.encode("data"); }
}
new Report2({ encode: d => d + ",csv" });   // swap the format without a new subclass
```

## Taken too far
<!--meta block=overreach-->

The principle is a preference, not a prohibition. There are true, stable is-a relationships where inheritance is simply the simpler tool — a fixed taxonomy, a framework base class you are meant to extend — and refusing it on reflex trades a clean three-line subclass for a pile of hand-written forwarding methods that add no meaning.

That is the usual cost of over-applying it: delegation boilerplate. To compose instead of inherit, you often wire up a collaborator and then re-expose its surface method by method, and past a certain point that churn obscures the design more than a modest inheritance would. Favor composition; do not fear inheritance where the relationship is genuine and unlikely to change.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Strategy](../patterns/gof/behavioral/strategy.md) — Strategy holds a pluggable behaviour object instead of subclassing for each variant.
- [Decorator](../patterns/gof/structural/decorator.md) — Decorator stacks behaviour by wrapping objects, avoiding a subclass per combination.
- [Bridge](../patterns/gof/structural/bridge.md) — Bridge composes an abstraction with an implementation, dodging a class-per-pairing explosion.
- [Atomic Design](../patterns/frontend/atomic-design.md) — Atomic design is composition-over-inheritance made into a design-system method
- [Liskov Substitution Principle](./liskov-substitution.md) — The substitutability test that tells you the is-a does not hold

**Demonstrated by**

- [Connect Four](../designs/connect-four.md) — Adding behaviour by composing a collaborator instead of subclassing is the choice this principle recommends
- [Logging Service](../designs/logging-service.md) — format and target are exactly the independently-varying axes composition keeps from multiplying into an N×M hierarchy

<!-- relationships:end -->
