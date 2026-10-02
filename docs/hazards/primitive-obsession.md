---
title: Primitive Obsession
description: "Domain concepts held as bare strings and numbers, so the type checker cannot catch mix-ups"
area: hazards
owner: Oleksandr Derechei
tags: [anti-pattern, code-smell]
status: draft
solves: [I passed the customer id where the order id belongs and it compiled without any warning, money amounts are plain numbers and nobody knows if a value is dollars or cents, every function that takes an email string validates it again, a function signature has five string parameters and callers swap them by mistake]
---

# Primitive Obsession

You model domain ideas as bare strings and numbers, so the compiler cannot tell an email from a name or dollars from cents.

## What it is
<!--meta block=description-->

**Primitive obsession** is using built-in types such as `string`, `number` and `boolean` for domain concepts: money, email addresses, ids, ranges, statuses. It starts because a primitive is the quickest thing to type. You recognise it by function signatures with four string parameters in a row, validation repeated at every caller, and comments that say what a value means. The trait is that the type carries no meaning, so the rules about the value have nowhere to live.

## Explained
<!--meta block=explain-->

Primitive obsession is holding domain ideas, such as money, an email address or a customer id, in plain strings and numbers. The type then says nothing, so the compiler cannot stop you passing an order id where a customer id belongs, and the rules for the value, such as a valid format or a currency, have no home. Each caller checks them again or trusts the input. Choose a small type per rule-bearing concept over a plain primitive when a wrong value would cost more than a short wrapper. The usual form is a [value object](../patterns/ddd/value-object.md), which checks itself once on creation. The cost is more types and conversions at the edges. Keep it small by wrapping only values with rules, and by parsing raw input once at the boundary.

**Example.** A billing function takes (customerId: string, invoiceId: string, amount: number). A caller swaps the two ids, the types match, and 38 invoices attach to the wrong account before a customer calls. A second function treats amount as dollars while the first treats it as cents, so one refund is 100 times too big. With CustomerId, InvoiceId and Money types, the swapped call fails to compile and Money carries its currency. The price is three small types, about 40 lines, and a parse step where requests enter the service.

## How it happens
<!--meta block=causes-->

```mermaid caption="The loop: a bare primitive has no home for its rules, so the rules spread to every caller."
flowchart TB
    A["Concept stored as a string or number"] -->|"no type to hold its rules"| B["Validation and formatting copied to callers"]
    B -->|"copies drift apart"| C["Invalid or mixed-up values slip through"]
    C -->|"fix it with one more check at the caller"| B
    B -->|"new type of value added"| A
```

- **A primitive is the shortest code.** Declaring `email: string` takes five characters, while a new type takes a file, a constructor and a decision about its name.
- **Data arrives as primitives.** JSON, database columns and form fields are strings and numbers, so the code keeps them in that shape all the way inside.
- **Classes feel heavy.** Developers fear that a wrapper per concept means a class explosion, so they skip the wrapper and accept the looseness.
- **Rules have no owner.** Nobody is assigned to the rule "an email has one at-sign", so each caller writes its own check or none at all.
- **Languages differ in cost.** Where a wrapper type costs runtime memory or boilerplate, the shortcut tempts more than where it is nearly free.

## What it costs
<!--meta block=cost-->

- **Swapped arguments compile.** A call to `transfer(from, to, amount)` with `from` and `to` reversed, or an id passed where a name is expected, passes the type checker and fails in production.
- **Validation is repeated or absent.** Each place that receives a raw string either re-checks it, paying the cost many times, or trusts it and meets bad data late.
- **Units get confused.** A `number` for money may hold dollars in one function and cents in another, and the difference shows up as a charge a hundred times too large.
- **Behaviour is scattered.** Formatting, comparison and arithmetic for the concept live in helper functions across the code, which is the setup for [shotgun surgery](shotgun-surgery.md).
- **Signatures hide intent.** A reader must open the body, or a comment, to learn that `string` means a customer id and not an order id.

## Getting out
<!--meta block=mitigation-->

Give each concept that has rules its own small type and let it check itself on creation. Money gets an amount and a currency, an email gets one parse that rejects bad input, and an id gets a type that a different id cannot be passed as. The pattern is a [value object](../patterns/ddd/value-object.md): immutable, compared by content and valid from the moment it exists.

Convert at the boundary. Parse raw input into the type once, where it enters the system, and let the code inside work with the type only. This turns repeated validation into a single check, and the compiler rejects the swapped-argument calls.

Do it where the pain is. Start with the values that carry money, identity or units, and leave plain counters and labels alone. In TypeScript, a branded type or a small class gets most of the benefit for a few lines. Stop when a wrapper has no rule to hold, because a type that only renames `string` adds a layer and no safety.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

<!-- relationships:end -->
