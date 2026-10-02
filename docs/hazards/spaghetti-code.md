---
title: Spaghetti Code
description: Control flow too tangled to follow
area: hazards
owner: Oleksandr Derechei
tags: [anti-pattern, readability, maintainability, decoupling, code-smell]
status: stable
aliases: [tangled code, spaghetti]
solves: [changing one thing breaks an unrelated test three modules away, I cannot follow what happens when the button is clicked without a debugger, "one function runs hundreds of lines mixing validation, IO and formatting", state is mutated from a dozen far-apart places with no owner]
---

# Spaghetti Code

Control flow too tangled to follow — every branch, jump, and shared variable depends on knowing the whole program to predict what one line does.

## What it is
<!--meta block=description-->

**Spaghetti code** is a codebase where control flow has no discernible shape. Functions call each other in cycles, conditionals nest six deep with no clear boundary between concerns, and state gets mutated from a dozen unrelated places. There is no top-to-bottom story to read — to understand what happens when a button is clicked, you have to trace jumps through the whole call graph, because any part of the program might touch any other part.

You recognize it by the experience of reading it: a single function running hundreds of lines mixing validation, I/O, business rules, and formatting; global or module-level variables read and written from far-apart places with no owner; deeply nested `if`/`else` and early returns that make the exit path unpredictable; copy-pasted logic that's been patched slightly differently in each copy; and a change in one spot causing an unrelated test three modules away to fail for reasons nobody can explain without a debugger.

The name is literal — pull one strand and the whole plate moves. It was coined when a jump could land anywhere in a program and block structure was the cure; the unrestricted jumps are mostly gone, and the tangle outlived them. It's not a single mistake but the compounding of many small ones: no [separation of concerns](../principles/separation-of-concerns.md), no consistent abstraction level, and control flow driven by incidental history (a quick fix here, a flag added there) rather than a deliberate structure.

## Explained
<!--meta block=explain-->

Spaghetti code is a codebase where control flow has no readable shape: functions call each other in cycles, conditions nest six deep, and shared variables are changed from a dozen unrelated places. To learn what one button click does you must trace jumps through the whole program, because any part might have changed the data you are looking at. It grows from small steps: a deadline rewards the fastest local fix, there is no agreed layering, so a new branch goes wherever the cursor is, and copy-and-tweak feels safer than extracting a shared function. The cost lands before any work starts, since understanding comes first, and each patch is then written by someone who cannot see the whole, which adds another strand. Reverse it in order. First pin today's behaviour with tests that record what the code does now, because untangling with no net changes behaviour silently. Then pass the shared variable in and return it out, so the writes show up in function signatures. Fix a direction, such as entry point to rules to storage with calls going down only, and check it in the build. Spend the effort where you already have to edit.

**Example.** An order function runs 400 lines and mixes validation, tax, database calls and formatting. A global variable, currentDiscount, is written in 3 places. A typical change touches 11 files. The team first writes 15 tests that record today's outputs. They then make the discount a parameter, so its 3 writers appear in 3 signatures, and split tax out as the lowest tier. A dependency check fails any merge where storage calls the rules. After a quarter a typical change touches 4 files. The cost is the tests and the weeks spent on code that needed no new feature, which is why they only refactor strands they are already editing.

## How it happens
<!--meta block=causes-->

```mermaid caption="A feedback loop, not a single decision. Each shortcut makes the next one cheaper and the tangle worse."
flowchart TB
    A["Ship the first feature fast"] -->|"deadline pressure"| B["Add a special case inline"]
    B -->|"reuse without extracting"| C["Copy-paste, not a shared abstraction"]
    C -->|"avoid threading params"| D["Shared mutable state grows"]
    D -->|"next change lands anywhere"| E["Patch symptoms, not structure"]
    E -->|"boundaries keep eroding"| F["No layer left to enforce"]
    F -->|"nowhere right to put code"| B
```

- Deadline pressure rewards the fastest local fix, not the clearest global structure.
- No agreed layering, so there's nowhere "wrong" to put a new branch — it goes wherever the cursor is.
- Copy-paste-and-tweak feels safer than extracting a shared abstraction under time pressure.
- Shared mutable state creeps in to avoid threading a value through several call levels.
- Code review focused on "does it work" rather than "does it fit the shape of the system."
- Turnover: each new author adds a patch without the context to see the whole flow.

## Why it hurts
<!--meta block=cost-->

- **Unreadable causality.** Understanding one behavior requires holding the whole program in your head; nobody can, so mental models go stale and wrong.
- **Change becomes unsafe.** A local edit has non-local effects through shared state and hidden call paths, so every fix risks a regression somewhere unrelated.
- **Tests resist writing.** Untangled logic can't be isolated, so it can't be unit tested — coverage stays low and confidence stays low with it.
- **Onboarding cost explodes.** New engineers can't reason locally; every task starts with archaeology instead of implementation.
- **Bugs hide in the gaps.** Duplicated, slightly-diverged copies of the same logic drift out of sync, so the "same" operation behaves differently depending on which copy ran.
- **It compounds.** Left alone, spaghetti code is the on-ramp to [Big Ball of Mud](./big-ball-of-mud.md) — the whole-system version of the same problem.

## How to avoid it
<!--meta block=mitigation-->

Start with the state, not the control flow. Take one variable that far-apart code both reads and writes, and make it something passed in and returned out instead — the writes then show up in the signatures, and the trail a reader has to follow shrinks to what the function was handed. Do it to the strand you are already working on.

Then fix a direction before you move anything else. Name the tiers you already have — entry point, rules, storage — and allow calls downward only; the cycle you cannot remove marks the module holding two concerns, so split that one first. Watch how many files a typical change touches, because that number tells you whether the flow untangled or just moved.

The direction holds only while something checks it. Make the rule executable as a dependency check that fails a merge, and change what review asks from "does this work" to "does this call downward", because a convention that lives in people's heads is renegotiated under every deadline. Then watch for the tier that only forwards: a layer that makes no decision is a file you must open on every change and learn nothing from, and folding it back is cheaper than defending it.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Mitigated by**

- [Layered / N-Tier](../patterns/architecture/layered.md) — Clear tiers keep call flow from tangling
- [Separation of Concerns](../principles/separation-of-concerns.md) — Keep each concern in its own place and control flow stops threading through everything

<!-- relationships:end -->
