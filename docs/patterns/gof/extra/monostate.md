---
title: Monostate
description: "Many instances, all sharing one state"
area: gof-extra
owner: Oleksandr Derechei
tags: [low-level-design, state-management, lifecycle, encapsulation]
status: stable
aliases: [Borg]
solves: [I want every instance of my config class to read and write the same values, callers already create my config class with new everywhere and every instance must still share one state, changing a setting on one object should change it for all the others, I need one shared instance but without a global getInstance access point, I want shared state I can still subclass and pass around like a normal object]
---

# Monostate

Lets every instance of a class share the same underlying state, so callers construct objects the ordinary way while the class quietly behaves as if there were only one — the shared-state twin of Singleton, but with no global access point in sight.

## What it is
<!--meta block=description-->

A **monostate** is a class whose every instance shares one and the same state. You still write `new` and get back distinct objects, but all of their data lives in static (class-level) storage, so reading or writing through any instance touches the one shared copy. Two objects that look independent are, in effect, two windows onto a single set of values.

The force it resolves is the same one [Singleton](../creational/singleton.md) answers — "there should really be only one of this thing" — but without Singleton's most awkward consequences. Singleton advertises its single-ness in the type: callers must go through a global `getInstance()`, the constraint leaks into every call site, and the class is hard to subclass or hand around polymorphically. Monostate keeps the single-ness but hides it. Callers use plain construction and plain method calls; the sharing is an implementation detail behind the interface.

So the observable behaviour is "one object" while the mechanism is "many shells over one state." That transparency is the whole appeal — and, because it is hidden global mutable state wearing the costume of an ordinary object, also the whole danger.

## Explained
<!--meta block=explain-->

A monostate is a class whose instances all share one set of data, held in class-level (static) fields, so any two objects you create read and write the same values. Callers use plain construction and plain method calls, and the sharing stays hidden. Choose it over a singleton only when you must retrofit sharing onto a class whose callers you cannot edit, because they keep writing new. Otherwise pass the shared object in as a parameter, which keeps the sharing visible. The hiding is the whole cost. Two objects that look independent overwrite each other's values, and nothing at the call site warns you. The shared fields also survive from one test to the next, so reset them before every test case. Concurrent writers need the same locking as any shared data, so guard the fields with a lock. And nothing limits how many empty shells you allocate, so reuse one object where you can.

**Example.** A Settings class stores the theme in a static field. Code in the sidebar calls new Settings() and sets the theme to dark. Code in the editor calls its own new Settings() and reads dark, though it never set it. The editor's tests pass alone, but after a sidebar test the editor sees dark and fails. The fix inside the class is a reset method that every test calls first. The fix at the root is to create one Settings and pass it into both, so the sharing shows in the code.

## How it works
<!--meta block=structure-->

~~~mermaid caption="Each `new` makes a separate object, but every instance reads and writes the same class-level store — so a change through one is visible through all."
flowchart LR
    A["a = new Config()"] -->|"read/write"| S[("shared static state")]
    B["b = new Config()"] -->|"read/write"| S
    S -->|"one copy, always in sync"| R["a and b always agree"]
~~~

## Variations
<!--meta block=variations-->

- **Static-field monostate** — The canonical form (Robert C. Martin's Monostate): declare every field `static`, and let ordinary instance methods read and write them. Subclasses inherit and share the very same statics.
- **Borg (shared dictionary)** — Alex Martelli's Python idiom: each instance rebinds its own attribute dictionary to a single class-level dict, so even per-instance attribute syntax quietly lands in shared storage.
- **Per-subclass state** — Arrange the shared store so each subclass keys into its own slice, letting a hierarchy share state within a branch without every subclass colliding on one global blob.
- **Thread-safe monostate** — Because the shared store is mutable state reachable from everywhere, guard it with synchronization — or make the shared values immutable — before instances are used across threads.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Callers use a plain** `new` and plain methods — no `getInstance()` ceremony or special access API to learn.
- **Instances are real objects**, so they can subclass, implement interfaces, and be passed around like anything else.
- **You can add sharing** to an existing class without touching the code that already constructs it.
- **Swapping in a non-shared version later** needs no change to how callers create or use the class.

### Cons
<!--meta polarity=con-->

- **It is hidden global mutable state** — the same testing and coupling pain as Singleton, but harder to notice.
- **It surprises people**: two "separate" objects silently overwrite each other, breaking what `new` normally implies.
- **It doesn't cap how many objects exist**, and each one still allocates — a thin shell wrapped around the shared data.
- **The shared statics leak between tests**, so isolating them means resetting the state before each case.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **You want Singleton's shared state**, but callers should keep creating objects the normal way.
- **The shared thing must stay a first-class object** — able to be subclassed, implement interfaces, and be passed as an argument.
- **You're adding sharing to code** that already calls `new` everywhere and you can't touch those call sites.

### Avoid when
<!--meta polarity=avoid-->

- **Shared mutable global state** is itself the problem — pass the dependency in instead.
- **Object identity matters** and callers count on separate instances being genuinely separate.
- **The one-shared-copy rule should be explicit and enforced** — at least Singleton advertises it openly.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — a monostate feature-flag registry"
type Flag = "darkMode" | "betaSearch";

class FeatureFlags {
  // The state lives in static fields, so every instance shares it.
  private static readonly enabled = new Set<Flag>();

  enable(flag: Flag): void {
    FeatureFlags.enabled.add(flag);
  }

  isOn(flag: Flag): boolean {
    return FeatureFlags.enabled.has(flag);
  }
}

// Callers construct instances the ordinary way — no getInstance().
const ui = new FeatureFlags();
const api = new FeatureFlags();

ui.enable("darkMode");
console.log(api.isOn("darkMode")); // true — api sees the write made through ui

console.log(ui === api); // false — they are genuinely different objects

```

## In the wild
<!--meta block=wild-->

- **Borg idiom (Python)** — Alex Martelli's recipe, popularised through the Python Cookbook: every new instance rebinds its own `__dict__` to one class-level dict (`self.__dict__ = self._shared_state`), so all instances are distinct objects that transparently share every attribute. It is Python's canonical name for Monostate — and the reason this pattern's alias is "Borg." {#wild-python-borg}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **What is shared** — All fields or a chosen few. A smaller shared set means fewer surprises.
- **Where the shared state lives** — Static fields of the class, or a shared dictionary rebound per instance.
- **Thread safety** — Whether access to the shared fields is guarded by a lock or by atomic types.

### Signals to watch
<!--meta polarity=signal-->

- **Tests that fail in a different order** — A test that passes alone and fails in a suite shows state leaking between tests.
- **Number of writers** — How many classes and threads write the shared state.
- **Surprise reads** — Bug reports where one instance's change changed another's behavior.

### Failure modes under load
<!--meta polarity=failure-->

- **Test leakage** — State from one test remains in the next, so results depend on order. Reset the state in setup.
- **Hidden coupling** — Callers cannot see that two instances share data, since both look ordinary.
- **Race on shared fields** — Two threads update the shared state without a lock.
- **Inheritance sharing** — A subclass shares the parent's static state when it was meant to have its own.

### Readiness checklist
<!--meta polarity=check-->

- Tests reset the shared state before each case
- Access to the shared fields is thread-safe
- The class documents that its instances share state
- A dependency passed in was considered first

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Object Creation](../../../themes/object-creation.md) — Share one set of values across every instance of a class. {#fluency-object-creation}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Alternative to**

- [Dependency Injection](./dependency-injection.md) — Hide the sharing in statics, or hand the shared object in explicitly

**Often confused with**

- [Singleton](../creational/singleton.md) — Both yield one shared state — Monostate hides it behind ordinary instances, Singleton behind one global object.

<!-- relationships:end -->
