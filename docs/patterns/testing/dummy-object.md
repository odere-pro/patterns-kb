---
title: Dummy Object
description: "Passed in to satisfy a signature, never actually used"
area: testing
owner: Oleksandr Derechei
tags: [testing, readability, isolation]
status: stable
aliases: [dummy]
solves: [my constructor takes six dependencies and this test only cares about one of them, i am building elaborate fakes for collaborators this test never even touches, my test setup is fifteen lines of noise before the one line that actually matters, i passed null just to fill an argument and now i cannot tell if the code quietly used it, i need something to fill this parameter and it genuinely does not matter what]
---

# Dummy Object

Handed to a constructor or method purely to satisfy its parameter list — the object is passed in, maybe stored, but never read, called, or asserted against by the path a test actually exercises.

## What it is
<!--meta block=description-->

A **dummy object** is the simplest member of Gerard Meszaros' test double family: an object supplied as an argument purely because a signature demands one, with no expectation that it will ever be read, called, or asserted against by the path a given test exercises. Where a stub returns canned values and a mock verifies how it was used, a dummy does neither — its only job is to occupy a parameter slot.

The force it resolves is a mismatch between what a signature requires and what one particular test actually cares about. Constructors often take every collaborator a class will ever need, but a single test usually drives only one narrow path through that class, leaving most of those collaborators untouched. Building a full stub or mock for each of them adds setup noise and buries the one dependency the test is actually about.

In practice a dummy is whatever is cheapest to construct: a bare `null` where the type permits it, an empty object literal, or a minimal class whose methods do nothing or throw if invoked. That last option — a throwing dummy — turns "never used" from an assumption into an assertion: if a later refactor starts calling it, the test fails loudly instead of quietly passing against the wrong object.

## Explained
<!--meta block=explain-->

A dummy object is a placeholder you pass to satisfy a required parameter that the test's code path never uses. A constructor often asks for every helper a class will ever need, while one test drives a narrow path through it. Building a real logger or database client just to fill the slot slows the test and pulls in setup that is irrelevant to it. Choose it over a stub or fake, which are doubles that return canned or working answers, when you are sure the object is never called. It costs three things. A dummy that does nothing hides it when the code starts to use the object, because every call returns a harmless default and the test still passes, so make the dummy throw if anything calls it. Reaching for dummies by default can paper over a class with too many collaborators, so count how many you pass and consider splitting the class. And once the object's behaviour matters, replace the dummy with a stub, fake or mock.

**Example.** An OrderTotal class takes a tax service it does not use in sum(). The test passes a dummy and checks that sum of 12 and 8 is 20. Later someone adds a 10% tax call inside sum(), so the real result is 22. A do-nothing dummy returns 0 tax and the test still shows 20, a green test over code that now needs the tax service. A throwing dummy fails the test the moment the call happens, with a message that the dummy was used. The cost is that you edit that test, replacing the dummy with a stub that returns a tax rate.

## How it works
<!--meta block=structure-->

```mermaid caption="The test passes the dummy only so the constructor's signature is satisfied — the path under test never calls it."
flowchart LR
    T["Test"] -->|constructs| S["System under test"]
    T -->|passes| D["Dummy Object"]
    D -.->|never invoked| S
```

## Variations
<!--meta block=variations-->

- **Null dummy** — Pass a literal `null` or `undefined` where the parameter type permits it — nothing to build, nothing to maintain. It stops working the moment the callee validates its arguments, and it tells the next reader nothing about why the parameter is there.
- **Throwing dummy** — Every method throws immediately, turning an accidental call into a hard test failure instead of a silent pass.
- **No-op dummy** — Every method is implemented but does nothing and returns a harmless default — tolerant of an unexpected call, at the cost of hiding it.
- **Dummy value** — A placeholder primitive — an empty string, a zero, a fixed id — where a whole object isn't required, just a value the code never inspects.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Cheapest possible test double** — nothing to configure, verify, or maintain.
- **Makes an untouched dependency explicit** instead of quietly faking behavior for it.
- **A throwing variant turns an unexpected call** into an immediate, loud test failure.
- **Keeps a test's setup focused** on the one collaborator that actually matters.

### Cons
<!--meta polarity=con-->

- **Valid only while unused** — only valid while the path truly never touches it; a silent no-op dummy hides it when that stops being true.
- **Easy to reach for by default**, papering over a constructor that takes too many collaborators.
- **A no-op dummy can mask** that the code started depending on it, since it just returns a harmless default.
- **Doesn't help once the parameter's behavior matters** — that call belongs to a Stub, Fake, or Mock instead.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **The signature requires an argument** that this test's particular path never touches.
- **You want the lightest possible double** — no return values to configure, no calls to verify.
- **You want a broken "never used" assumption** to fail the test loudly — use the throwing variant.

### Avoid when
<!--meta polarity=avoid-->

- **The code under test reads a value** from the object — supply canned data with a Test Stub instead.
- **You need to assert** the object was called in a particular way — reach for a Mock or Spy.
- **Every test needs the collaborator's real behavior** — a Fake is worth the extra setup.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — a throwing dummy logger"
interface Logger {
  log(message: string): void;
}

// Dummy: satisfies the Logger parameter, must never actually be called.
class DummyLogger implements Logger {
  log(): never {
    throw new Error("DummyLogger.log() should never be invoked");
  }
}

class OrderTotal {
  constructor(private readonly logger: Logger) {}

  // This path never logs, so the dummy is safe here.
  sum(items: { price: number }[]): number {
    return items.reduce((total, item) => total + item.price, 0);
  }
}

test("sums item prices without touching the logger", () => {
  const order = new OrderTotal(new DummyLogger());
  expect(order.sum([{ price: 12 }, { price: 8 }])).toBe(20);
});
```

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Testing](../../themes/testing.md) — Pass a placeholder where a signature needs an argument the test never uses. {#fluency-testing}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Often confused with**

- [Test Stub](./test-stub.md) — Never used vs. returns canned values
- [Null Object](../gof/extra/null-object.md) — Test-only filler vs. a production do-nothing collaborator
- [Mock Object](./mock-object.md) — Never called at all vs. programmed expectations

<!-- relationships:end -->
