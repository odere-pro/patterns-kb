---
title: Monad
description: Sequences computations that carry extra context
area: functional
owner: Oleksandr Derechei
tags: [low-level-design, composition, error-handling, abstraction, asynchrony]
status: stable
solves: [every step in this chain needs its own null check before I can call the next one, my error handling is longer than the logic because every call sits inside its own try/catch, I want one failure early on to skip the rest of the steps instead of blowing up, threading a maybe-missing value through ten functions means each one re-checks it, my callbacks are nested five levels deep and I cannot follow the happy path anymore]
---

# Monad

Sequences computations whose results carry extra context — absence, failure, a pending async value, many possible outcomes — so each step chains into the next without manually unwrapping and rewrapping that context along the way.

## What it is
<!--meta block=description-->

A **monad** is a generic wrapper type, `M<T>`, equipped with two operations: `of` (or `return`), which lifts a plain value into the wrapped context, and `bind` (also called `flatMap` or `chain`), which takes a function `T -> M<U>` and sequences it against an existing `M<T>` — running the function, then flattening the result — without the caller ever manually unwrapping the value. Three laws (left identity, right identity, associativity) guarantee that chains built this way compose the same regardless of how they're grouped or refactored.

The problem it resolves is threading extra context — a value that might be absent, a step that might fail, a computation that hasn't resolved yet, an operation that yields several results — through a sequence of steps without repeating the same boilerplate at every one. Written by hand, that's a null check after every call, a `try/catch` around every risky step, a pyramid of nested callbacks, or a nested loop per extra list. `bind` captures that boilerplate exactly once per context and lets ordinary functions compose through it uniformly.

The pattern shows up everywhere in mainstream code, even where the word never does. A `Promise` is a monad: `.then` is `bind`, `Promise.resolve` is `of`, and the chain short-circuits on rejection the same way `Maybe` short-circuits on `None`. An array's `.flatMap` is `bind` for the List monad. `Result`/`Either` types thread an error value instead of throwing one. Optional chaining (`?.`) is a syntax-level, single-field approximation of the same idea.

Every monad is also a [Functor](./functor.md) — it can `map` a plain function over the wrapped value — but a functor alone can't flatten a nested wrapper (`M<M<T>>` back to `M<T>`), which is exactly what happens when a step itself returns a wrapped value. That flattening is the extra structure `bind` adds, and it's the difference between mapping over context and sequencing through it.

## Explained
<!--meta block=explain-->

A monad is a wrapper with a bind step that runs the next function only if the earlier steps worked, and merges the results so wrappers do not nest. The wrapper carries a context such as "might be missing", "might have failed with an error" or "arrives later". You write each step as a function that returns a wrapped result, bind joins them, and the first failure skips the rest and reaches the end. Choose it over nested if-checks or try and catch when several steps can fail in the same way and the first failure should stop everything. It costs four things. The word puts people off, so call it by its job, such as a result chain. Long chains hide the flow, so keep them short and use async and await or do-notation where the language has it. Stacking wrappers, a Promise of a Result of an Option, gets awkward, so pick one wrapper per layer. A failure at the end shows no path, so add context to each error message.

**Example.** Charging an order takes three steps: parse the request, find the user, charge the card. Each can fail. Written with if-checks, that is 3 nested ifs and 3 error branches. As a chain of Result steps, it is three bind calls and one error handler at the end. If the user is not found, the charge step never runs and the error "no such user" reaches the handler. The cost is that this error arrives with no record of which call failed, so each step adds its own label, such as "find user: no such user".

## How it works
<!--meta block=structure-->

```mermaid caption="How does a chain of Result steps skip the rest after the first failure? of wraps the parsed request, each bind runs the next step only on Ok, and a failed lookup short-circuits the charge with its error."
flowchart TD
    Raw["Parsed request"] -->|"of: wrap as Ok"| R["Ok request"]
    R -->|"bind: find user"| Chk{"User found?"}
    Chk -->|yes| U["Ok user"]
    Chk -->|"no, short-circuit"| E["Err: no such user"]
    U -->|"bind: charge card"| C["Ok receipt"]
```

## Variations
<!--meta block=variations-->

- **Maybe / Option** — Wraps a value that might be absent (`Some`/`None` or `Just`/`Nothing`); bind short-circuits to `None` the moment any step fails to produce a value.
- **Either / Result** — Wraps a value or an error (`Left`/`Right`, `Ok`/`Err`); bind short-circuits on the error branch and carries the failure reason forward, unlike Maybe's silent `None`.
- **List** — Wraps zero or more values; bind maps a function returning a list over each element and flattens the result — exactly what `flatMap` does on arrays.
- **IO / Task ([Promise](../concurrency/future-promise.md))** — Wraps a deferred or effectful computation; bind sequences asynchronous steps without nesting callbacks, deferring execution until the chain actually runs.
- **State** — Threads a piece of state through a chain of computations without any step touching a mutable variable directly — each bind passes the state along and returns the next.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **One uniform way to sequence** any kind of extra context — absence, failure, async, multiplicity — without rewriting the same null checks or try/catches each time.
- **Chains compose predictably** — the monad laws guarantee a chain composes the same way regardless of how it's grouped or refactored into smaller pieces.
- **Short-circuiting is automatic**: a single `None` or `Err` early in a chain skips every later step for free.
- **The mental model transfers**: once a team groks one monad (usually `Promise`), Option and Result stop looking exotic.

### Cons
<!--meta polarity=con-->

- **The word "monad" is notoriously off-putting**; teams often bounce off the terminology before they see the payoff.
- **A long bind chain can obscure control flow** — stepping through nested lambdas is harder than reading straight-line imperative code.
- **Without native support** (async/await, do-notation) chains nest awkwardly and readability suffers fast.
- **Stacking monads** — an Either inside a Promise inside an Option — needs manual juggling or transformers, and gets complicated quickly.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **You're chaining operations that may each fail**, be absent, or resolve asynchronously, and want to skip manual state-checking after every step.
- **Monadic types are already native to your language** (`Promise`, `Optional`, `Result`) and it's simpler to use their combinators than to unwrap by hand.
- **You want composition guarantees** — a chain split into two smaller chains must behave identically to the original.

### Avoid when
<!--meta polarity=avoid-->

- **A single well-placed** `try/catch` or null check already reads more clearly than a chain of binds.
- **Your language or team has no ergonomic syntax** for it — raw bind chains without async/await or do-notation nest badly.
- **The step is a single, context-free transformation** — a plain [Functor](./functor.md)'s `map` is enough; you don't need bind's flattening if nothing returns extra context.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — a Result monad with short-circuiting bind"
class Result<T, E> {
  private constructor(
    private readonly isOk: boolean,
    private readonly value?: T,
    private readonly error?: E,
  ) {}

  // of: wrap a plain value into the context
  static of<T, E>(value: T): Result<T, E> {
    return new Result(true, value);
  }
  static err<T, E>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  // bind: run f only if we're still on the happy path; f returns a Result,
  // and bind returns it as is, so the wrappers flatten instead of nesting
  bind<U>(f: (value: T) => Result<U, E>): Result<U, E> {
    return this.isOk ? f(this.value as T) : Result.err(this.error as E);
  }
}

function safeDivide(a: number, b: number): Result<number, string> {
  return b === 0 ? Result.err("divide by zero") : Result.of(a / b);
}

const outcome = Result.of<number, string>(100)
  .bind((x) => safeDivide(x, 5))   // Ok(20)
  .bind((x) => safeDivide(x, 0))   // Err("divide by zero") — short-circuits
  .bind((x) => safeDivide(x, 2));  // never runs
```

## In the wild
<!--meta block=wild-->

- **Haskell IO and do-notation** — IO sequences effectful computations through >>= (bind); do-notation desugars directly to a chain of >>= and >>, and the whole program is one IO value (main :: IO ()) that the runtime finally executes. {#wild-haskell-io}
- **JavaScript Promise** — then is bind for deferred computation: returning a promise from the callback flattens it rather than nesting, Promise.resolve is of, and a rejection skips every later then straight to catch — the same short-circuit as Maybe's None. {#wild-js-promise}
- **Rust Result and Option** — and_then is bind over the Ok/Some branch and short-circuits on Err/None; the ? operator is language-level sugar that unwraps or early-returns the error, while map (functor) transforms the wrapped value without flattening. {#wild-rust-result}

## In production
<!--meta block=production-->

### Failure modes under load
<!--meta polarity=failure-->

- **Stack overflow on deep or recursive bind chains** — A synchronous monad whose bind recurses — a State-monad loop, a parser combinator folding over a long input — grows the call stack one frame per step. Over a large enough input it overflows (in JS, "Maximum call stack size exceeded"). Stack-safe recursion needs a trampoline rather than raw recursive bind.
- **Transformer-stack overhead** — Stacking monads via transformers (an Either inside a Task inside a Reader) adds a wrap/unwrap layer per level; every bind threads through all of them, so allocation and indirection grow with the depth of the stack and the types get progressively harder to follow.

### Readiness checklist
<!--meta polarity=check-->

- For monadic recursion over large inputs (parsers, State loops, fold-with-effect), use a stack-safe / trampolined implementation rather than raw recursive bind.
- Prefer the language's native sugar — async/await for Promise, ? for Result/Option, do-notation — over hand-nested bind chains for readability.
- Keep transformer stacks shallow; a deep stack of transformers is a signal to flatten to a single purpose-built monad.

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Functional Programming](../../themes/functional-programming.md) — Chain wrapped steps with bind so context flows through without manual unwrapping. {#fluency-functional-programming}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Pipeline / Composition](./pipeline.md) — Monadic bind is pipeline composition with context

**Generalizes**

- [Future / Promise](../concurrency/future-promise.md) — A Promise is one: .then is bind, resolve is of

**Specializes**

- [Functor](./functor.md) — Every monad is a functor with more structure

<!-- relationships:end -->
