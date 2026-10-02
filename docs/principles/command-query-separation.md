---
title: Command-Query Separation
description: "A method either changes state or returns a value, never both"
area: principles-craft
owner: Oleksandr Derechei
tags: [low-level-design, separation-of-concerns]
status: stable
aliases: [CQS, Meyer's rule]
solves: [calling a getter twice gives different answers because reading the value also changes it, adding a log line that reads a value changed how the program behaves, I cannot tell from its name whether calling this method changes anything, a test that checks a value moves the thing it is checking]
---

# Command-Query Separation

Every method does one of two things: it changes state and returns nothing, or it returns a value and changes nothing. Asking a question must never change the answer, so a caller can ask as often as it likes without effect.

## What it says
<!--meta block=description-->

Bertrand Meyer gave the rule in Object-Oriented Software Construction (1988). A **command** changes the state of an object and returns no value. A **query** returns a value and leaves the state alone. A method that does both, such as `getNextId()` that reads the counter and also increments it, forces the caller to know about the side effect to use the value safely.

The misreading is that every call in the program must follow it. The rule is about the methods you design, and it has known exceptions: `pop()` on a stack and an atomic compare-and-swap both return a value and change state, and for good reasons covered below. Meyer's own view was that these are deliberate, small and documented departures, not a licence.

It is not the [CQRS](../patterns/architecture/cqrs.md) pattern. CQRS (Command Query Responsibility Segregation) takes the same idea and applies it to whole models: separate objects, services or even databases for writes and reads, with the two kept in step. Command-query separation is a rule for a single method, costs nothing to follow and needs no infrastructure. CQRS is an architectural decision with a real price, and you can follow the first in every class without ever adopting the second.

## Explained
<!--meta block=explain-->

Command-query separation is a rule for one method: it either changes state and returns nothing, or it returns a value and changes nothing. Bertrand Meyer set it out in 1988. It matters because a read that quietly changes state is no longer safe to repeat, so you cannot log it, test it, cache it or evaluate it twice without changing what the program does. Choose it over letting methods do both when callers will call the method in places you cannot see. The first cost is that some steps must be atomic. A stack pop or a compare-and-swap returns and changes at once, because splitting it lets two threads take the same item. Keep those combined and name them so no reader takes them for a plain read. The second cost is more calls to learn a result, such as asking for the new id after an insert. Accept that, or return the id and document the exception. It is not CQRS, which splits whole models and databases; this rule costs nothing and needs no infrastructure.

**Example.** A counter has nextId(), which returns the current number and adds 1. A developer adds a debug line that logs counter.nextId(), and now every request skips one id, so ids 1, 3, 5 are issued and an audit finds a gap. After the split, current() returns 7 any number of times, and advance() is the only call that moves it to 8. The log line is safe. The cost is two calls where there was one, and in threaded code, two calls leave a gap, so a combined takeNext() with its own lock is kept for that case.

## Why it helps
<!--meta block=rationale-->

A query that changes state makes the program harder to reason about, because reading it is no longer safe. You cannot add a log line that calls it, evaluate it twice in a condition, show it in a debugger watch window or cache its result without changing what the program does. Each of those looks harmless and each silently changes behaviour.

With the separation, queries are safe to call anywhere, any number of times, in any order, and the compiler or a test can treat them as pure reads. That lets you reorder, memoise and parallelise them, and it makes assertions in tests trustworthy: checking a value does not move the thing under test. Commands, being the only place state changes, are a short list you can read to find where behaviour comes from, and each can be tested by asking afterwards what changed.

It also leaves a clear place for the returned value. A method named `getBalance` that is a query tells the reader what it does by its shape. A method that returns and mutates forces every reader to open the body, and a missing note in the name becomes a bug in somebody else's code.

## Applying it
<!--meta block=applying-->

Make the signature say which kind of method it is:

- Name queries as nouns or questions (`balance`, `isEmpty`) and commands as verbs (`deposit`, `clear`). The name then tells the caller whether it is safe to call twice.
- Return nothing from a command. If the caller needs the result, expose a query for it and let the caller ask after the command.
- Keep queries free of side effects, including hidden ones such as updating a last-read timestamp, filling a cache that other code can see, or advancing a cursor.
- Split a mixed method in two where you can: `next()` that advances and returns becomes `current` plus `advance()`.
- Where you cannot split a method, because the two steps must be atomic, keep it and name it for what it does (`takeNext`, `popAndReturn`), so no reader takes it for a query.
- Let a command report failure by throwing or by a status, and keep the data out of it. Reporting that the command failed is not the same as returning a result.
- Remember what this is not for: if reads and writes need different models, schemas or scaling, that is a decision about [separation of concerns](./separation-of-concerns.md) at a larger scale, and CQRS is the pattern, not this rule.

The compact test: if you call the method twice in a row, does the second call give the same answer as the first? If not, it is a command and must return nothing.

## Taken too far
<!--meta block=overreach-->

The rule bends where two steps must be one. A stack's `pop()` returns the top item and removes it. Split into `peek()` then `remove()`, it works for one thread and breaks for two: both threads peek the same item, and both remove, so one item is handled twice and another is skipped. The same holds for a compare-and-swap, which checks a value and sets it in one atomic step; split in two, there is a gap another thread can use. In concurrent code the combined method is the correct design, so leave it combined and name it clearly. A queue's `dequeue` and an iterator's `next()` are the same case.

Rigid application also bloats an API. Making `insert` return nothing forces a follow-up query to learn the generated id, which costs a second round trip and a race on who else inserted. A fluent builder returns `this` from every setter, which is a command that returns a value, and is a deliberate style that is safe because the value is the same object.

Treat the rule as a default that earns exceptions, not a law. The cost of a method that mixes the two is that readers cannot tell what a call does; if you keep one, say so in the name and the documentation, and keep it rare.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Separation of Concerns](./separation-of-concerns.md) — It separates the concern of changing state from reading it at method level.
- [Encapsulation](./encapsulation.md) — Commands are the only door that changes an object's state.
- [Idempotency](../patterns/messaging/idempotency.md) — A query is the safest idempotent call; commands need care to repeat.

**Often confused with**

- [CQRS](../patterns/architecture/cqrs.md) — CQS is a rule for one method; CQRS applies the idea to whole models.

<!-- relationships:end -->
