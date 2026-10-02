---
title: Liskov Substitution Principle
description: A subtype must stand in for its base type without breaking the caller
area: principles-craft
owner: Oleksandr Derechei
tags: [low-level-design, polymorphism, abstraction, boundaries]
status: stable
aliases: [LSP]
solves: [a subclass throws on a method the base class promised to support, swapping in a derived class broke code that only knew about the parent, my Square subclass of Rectangle fails when I set width and height separately, the interface says one thing but this implementation quietly does another, my code is full of instanceof checks because some subclasses cannot do what others can]
---

# Liskov Substitution Principle

A subtype must be substitutable for its base type without changing a program's correctness. An object that claims an interface has to honour its contract — not just the method signatures, but the promises behind them.

## What it says
<!--meta block=description-->

A subtype must be substitutable for its base type without changing the correctness of the program. It is the “L” in SOLID, named for Barbara Liskov, who framed it in a 1987 keynote; she and Jeannette Wing later made it precise as behavioural subtyping (1994). If code is written against a type, any subtype must be able to stand in for it unnoticed.

Substitutability is about behaviour, not just shape. Matching the method signatures is the easy part; the subtype must also honour the base type's contract — do not strengthen a precondition (demand more of the caller), do not weaken a postcondition (promise less in return), and preserve the invariants the base type guarantees.

## Explained
<!--meta block=explain-->

The Liskov substitution principle says code written against a base type must stay correct when handed any subtype, so a subtype must keep every promise the base type makes. Matching method signatures is the easy part. The subtype must also accept at least what the base accepts, promise at least what the base promises, and never put an object into a state the base forbids. When it breaks a promise, callers that know only the base type fail in ways nobody can predict from reading them, and the usual patch is a type check at each call site. Inherit only when the subtype is the base type everywhere the base is used. A square is a rectangle in English but not under a contract where width and height change separately. The common cost is contorting a hierarchy to hold a relationship that is not real, with no-op overrides, methods that throw not supported and ever more abstract base classes. The counter-move is composition, or a separate type that shares an interface rather than a base class. Do not inherit merely to reuse code.

**Example.** A Rectangle class lets callers set width and height separately, and a test runs r.setWidth(5); r.setHeight(4); assert r.area() == 20. A team adds Square extends Rectangle, where setting either side sets both. The same test now computes 16 and fails, and so does a layout routine written against Rectangle that never knew squares existed. A fix inside the hierarchy, such as a no-op setHeight, breaks the promise a different way. The team drops the inheritance: Rectangle and Square become separate classes sharing a Shape interface with area(). The cost is that the two cannot share the code that stores the sides, so a few lines are written twice.

## Why it helps
<!--meta block=rationale-->

Polymorphism is a promise to the caller: hold a reference to the base type and you never need to know which concrete thing is behind it. LSP is what keeps that promise keepable. Break it — a subtype that throws where the base returns, or narrows the inputs it will accept — and every caller has to start asking which subtype it really holds, which is exactly the `instanceof` checking that polymorphism was meant to abolish.

The canonical breach is `Square extends Rectangle`: a rectangle promises that setting width leaves height alone, but a square cannot keep both true, so code correct for every rectangle turns wrong for this one “kind” of rectangle. Honour the contract and substitution is safe; violate it and inheritance becomes a trap laid for the caller.

## Applying it
<!--meta block=applying-->

Treat the base type's contract as law for every subtype:

- Accept at least what the base accepts (no stronger preconditions) and guarantee at least what it guarantees (no weaker postconditions).
- Never override a method to throw “not supported” for behaviour the base type promises — that is a contract the subtype cannot honour.
- Preserve invariants: a subtype may add state, but must not put an object into a configuration the base type forbids.
- Respect the base type's history: a subtype may not let an object change in ways the base ruled out over its lifetime. A mutable subclass of an immutable type never reaches an illegal state, yet still breaks a caller who was promised the value would not move after construction.
- Prefer is-substitutable-for over is-a. A square is-a rectangle in English, yet is not substitutable for one under a mutable-sides contract — so it is not a subtype.

The check: could a caller written against the base type, knowing nothing of this subclass, still be correct? If not, the hierarchy is lying.

## Taken too far
<!--meta block=overreach-->

LSP is a rule about correctness, so it is hard to over-apply on its own terms — the trap is upstream, in reaching for inheritance at all when the is-a does not truly hold. Once you have committed to a hierarchy, the effort to satisfy substitutability can drive you to contort it — split types, no-op overrides, ever more abstract base classes — to prop up a relationship that was never really there.

When the contract keeps fighting you, that is the design telling you the subtype relationship is wrong, not that you need a cleverer hierarchy. Composition, or a separate type that shares an interface rather than a base class, is usually the honest answer. Do not inherit merely to reuse code; inherit only when the subtype genuinely is the base type everywhere the base type is used.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Open/Closed Principle](./open-closed.md) — Substitutability is what lets you add a subtype without editing the caller.
- [Composition over Inheritance](./composition-over-inheritance.md) — When a subtype cannot honour the contract, hold the collaborator instead of inheriting from it
- [Decorator](../patterns/gof/structural/decorator.md) — A wrapper is only safe if it honours the contract of what it wraps, so callers cannot tell the two apart
- [Null Object](../patterns/gof/extra/null-object.md) — A stand-in must keep the base contract, so callers behave correctly whether the real object or the empty one is behind it

<!-- relationships:end -->
