---
title: Arrange-Act-Assert
description: "Set up state, perform the action, check the outcome"
area: testing
owner: Oleksandr Derechei
tags: [testing, readability]
status: stable
aliases: [AAA, Given-When-Then, GWT]
solves: [i cannot tell what my test is actually verifying without reading every line, our tests all look different depending on who wrote them, setup and assertions are tangled together so i cannot find the actual check, i wrote a test that passes but i am not sure it checks anything at all, reviewing a test takes me longer than reviewing the code it covers]
---

# Arrange-Act-Assert

Set up the state a test needs, perform the one action under test, then check the outcome — three sections, always in that order, so any test reads the same way at a glance.

## What it is
<!--meta block=description-->

**Arrange-Act-Assert** is a way of shaping the body of a test, not a library or a framework. Arrange builds the inputs, fixtures, and preconditions the test needs. Act calls the single behavior under test — ideally one line. Assert checks that what happened matches what was expected. Nothing else belongs in the test body, and the three sections appear in that order, every time.

The force it resolves is that tests are read far more often than they are written, usually by someone who is not the author and is trying to understand what broke. A test that interleaves setup, invocation, and checking forces the reader to trace control flow to find out what's actually being verified. AAA fixes the shape in advance: a reader can jump straight to the middle line to see what's under test, and to the tail to see what's expected of it.

It also gives a test a built-in completeness check. A test with no real Act is testing nothing; a test with no real Assert is just running code without checking anything. Because the three parts are named and ordered, a missing or padded-out section is visible on sight, not just on close reading.

Bill Wake named the convention in 2001, so it predates most of today's testing frameworks — it applies equally to xUnit-family tests, integration tests, and BDD (behavior-driven development)-style specs, which just rename the same three steps.

## Explained
<!--meta block=explain-->

Arrange-Act-Assert is a way to lay out a test body in three visible parts, in order: arrange builds the inputs and starting state, act calls the one behaviour under test, and assert checks the result. Tests are read far more often than written, usually by someone trying to learn what broke, and a test that mixes setup, calls and checks makes that reader trace the flow line by line. Choose it over a free-form test whenever more than one line of setup is involved, because a failure then points at a part: bad setup, a wrong call or a wrong result. A test with no real act or no real assert is also easy to spot. It costs four things. An assert block can grow to check many unrelated things, so test one behaviour and assert one outcome. Long arrange sections repeat across tests, so move them into a helper or builder. Catching a thrown error joins act and assert, so treat the call wrapped in the expectation as the act. And cleanup has no part of its own, so give it a named fixture.

**Example.** A transfer test is written as 12 interleaved lines: create an account, check it, create another, move 30, check, move again, check. It fails at line 9, and you must read all 9 lines to learn which step is wrong. Rewritten, arrange creates accounts holding 100 and 50, act moves 30 once, and assert expects 70 and 80. A failure now names the assert and the one act above it. The cost is that the 6-line arrange block repeats across 40 transfer tests, 240 lines, so it moves into one makeAccounts helper.

## How it works
<!--meta block=structure-->

```mermaid caption="Every test moves through the same three steps in order: build the world, do the one thing, check what happened."
flowchart LR
    A["Arrange, build inputs and preconditions"] -->|"inputs ready"| B["Act, invoke the behavior under test"]
    B -->|"captured outcome"| C["Assert, check the outcome matches expectation"]
    B -.->|"invokes"| D["System under test"]
```

## Variations
<!--meta block=variations-->

- **Given-When-Then** — The BDD vocabulary for the identical three-part shape — Given sets up state, When performs the action, Then checks the outcome.
- **Four-phase test** — Wraps AAA in explicit setup and teardown phases, so shared fixture management is separated from the arrange step of any single test.
- **Table-driven / parameterized AAA** — One Arrange-Act-Assert body runs once per row of a data table, trading a wall of near-duplicate tests for a single documented case shape.
- **[Test data builders](./test-data-builder.md) / Object Mother** — Push the Arrange phase behind a builder or factory function, so each test states only the inputs that matter to the case at hand.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Every test reads the same way**, so a reviewer understands intent without tracing control flow.
- **Cleanly separates setup**, the behavior under test, and the check, so failures are easy to localize.
- **No library or framework required** — it's a naming and ordering convention on plain test functions.
- **Makes an incomplete test**, one with no real Act or no real Assert, visible on sight.

### Cons
<!--meta polarity=con-->

- **Doesn't stop a bloated Assert block** from checking many unrelated things in one test.
- **A heavy Arrange section**, repeated across many tests, is a common source of duplicated fixture code.
- **The three-way split feels forced** when acting and asserting are inseparable, like catching a thrown exception.
- **Says nothing about teardown** — teams routinely bolt on a fourth phase informally.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **Writing any unit or integration test** with a fixed input, one action, one expected outcome shape.
- **Consistent tests across a codebase** — you want tests that read consistently, regardless of who wrote them.
- **Newcomers skimming the suite** — engineers unfamiliar with the code need to skim the test suite and infer behavior quickly.

### Avoid when
<!--meta polarity=avoid-->

- **The test is property-based and generates many inputs** — there's no single fixed state to arrange.
- **You mean to compare** a whole output wholesale rather than discrete expectations — that's [Golden Master](./golden-master.md) territory.
- **The test is a throwaway exploratory spike**, never meant to stay in the suite.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — a test in Arrange-Act-Assert form"
import { describe, it, expect } from "vitest";
import { ShoppingCart } from "./shopping-cart";

describe("ShoppingCart", () => {
  it("applies a percentage discount to the subtotal", () => {
    // Arrange
    const cart = new ShoppingCart();
    cart.add({ sku: "sku-1", priceCents: 1000, qty: 2 });
    cart.add({ sku: "sku-2", priceCents: 500, qty: 1 });

    // Act
    const total = cart.applyDiscount(0.1); // 10% off

    // Assert
    expect(total).toBe(2250); // (2000 + 500) * 0.9
  });
});
```

## In the wild
<!--meta block=wild-->

- **Bill Wake, "3A - Arrange, Act, Assert"** — The article that named the structure for unit tests: set up the object, perform the action, and check the result. {#wild-wake-3a}
- **Cucumber** — Gherkin scenarios are written as Given, When and Then steps, the same three-part shape applied to behaviour specifications. {#wild-cucumber}

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Testing](../../themes/testing.md) — Write each test as arrange, act, assert and nothing else. {#fluency-testing}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Page Object](./page-object.md) — Page objects supply the single-line Act
- [Test Data Builder](./test-data-builder.md) — Builders collapse Arrange into one readable line
- [Test Spy](./test-spy.md) — Spies push interaction checks into Assert

**Alternative to**

- [Golden Master](./golden-master.md) — Snapshot the whole output vs. assert specifics

<!-- relationships:end -->
