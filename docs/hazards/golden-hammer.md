---
title: Golden Hammer
description: One familiar tool applied to every problem
area: hazards
owner: Oleksandr Derechei
tags: [anti-pattern, code-smell, maintainability, abstraction]
status: stable
aliases: [Law of the Instrument, Maslow's Hammer]
solves: [we reach for the same tool on every problem without asking whether it fits, we put a message broker between two functions in the same process, a workflow engine drives a single boolean flag, the only answer to why we used this is that it is what we used last time]
---

# Golden Hammer

One familiar tool, framework, or pattern gets reached for on every problem — not because it fits, but because it's the one the team already knows.

## What it is
<!--meta block=description-->

A **golden hammer** is a favored tool, language, library, or design pattern that a team applies to every problem regardless of whether it's the right fit. The name comes from the aphorism: to someone who only has a hammer, everything looks like a nail. Abraham Kaplan set that down in 1964 as the law of the instrument, Maslow gave it its familiar wording two years later, and it arrived in the software literature as a named anti-pattern in 1998. It differs from genuine standardization — a deliberate choice to accept one tool's trade-offs across many cases — in that a golden hammer is a reflex, not a decision. No one re-evaluates the fit; the tool is simply what gets reached for.

You recognize it by the mismatch between the tool's sweet spot and the problem's actual shape: a workflow engine driving a single boolean flag, a [message queue](../patterns/messaging/message-queue.md) standing in for a function call inside one process, an ORM (object-relational mapper)'s full query builder wrapped around one hardcoded statement, a favorite design pattern showing up in corners of the codebase that never needed indirection. Ask why, and the answer is "that's what we used last time," not a requirement the tool actually satisfies.

It usually starts from a genuine win. The tool solved a real problem well once, the team got fluent in it, and that fluency quietly became the default lens for every problem that followed — whether or not the new problem shares anything with the old one.

## Explained
<!--meta block=explain-->

A golden hammer is a favourite tool that a team applies to every problem, whether or not it fits. It starts with a real win: the tool solved something well, the team became fluent, and fluency became the default lens. It then seals itself, because each use makes the team faster with this tool and no faster with anything else. Simple problems get heavy machinery, such as a message queue for one write, and every problem inherits the tool's failures and running cost. The failure is the missing decision, not the tool, so the counter is a procedure. Before settling, someone names a second candidate and says in one sentence why it loses. If nobody can name one, you have found the problem. Put the tool behind an interface your own code owns, so replacing it later is one implementation, not a rewrite. Try the alternative on a real slice of work for a week, because the argument is usually about fluency and only use settles it. Keep a short list of defaults, each with the boundary where it stops applying, and review it on a fixed schedule, not when a project is late.

**Example.** A team that runs Kafka well needs to save 5 settings changes a day from an admin screen. Out of habit they publish each change to a topic, and a consumer service writes it to the database, so two extra processes need deployment, monitoring and on-call. Asked for a second candidate, someone says a direct database write in the same request does the job. A one-week trial on this one screen confirms it. The team keeps Kafka for cases with a second consumer or over 1,000 events a second, and the cost is a settings-store interface and one more line in the defaults list.

## How it happens
<!--meta block=causes-->

```mermaid caption="The reinforcing loop: fluency with one tool becomes the reason to keep choosing it, which further narrows the team's fluency."
flowchart TB
    A["Team masters tool X on a real win"] -->|"early success sticks"| B["X becomes the default reach"]
    B -->|"reach for X first"| C["New problem framed to fit X"]
    C -->|"alternatives go unused"| D["Skill with alternatives atrophies"]
    D -->|"X is even more the default"| B
    C -->|"forced beyond its fit"| E["X gets stretched past its sweet spot"]
```

- The tool had a genuine early win, and that win quietly becomes the default answer to every later question.
- Learning a second tool well has a real cost, so sticking with the familiar one avoids that cost — one time too many.
- Nobody owns cross-cutting technology choices, so each new decision-maker just reaches for what they already know.
- "We shipped with X" is a fact about one project; it quietly turns into "we always ship with X" for every project after it.
- Internal advocates and past success stories reinforce the tool as the one true answer, beyond the scope it actually earned.

## Why it hurts
<!--meta block=cost-->

- Simple problems get complex machinery: one write goes through a distributed queue, one conditional runs through a rules engine.
- The stretched tool needs workarounds and escape hatches to do a job it wasn't built for, adding complexity nowhere else in the system needs.
- Operational cost compounds — every problem now inherits the chosen tool's failure modes, latency, and ops burden, even the trivial ones.
- Skill with alternatives keeps shrinking, so the "default" becomes the only realistic option, deepening the lock-in with each choice.
- Problems that genuinely need a different tool get bent to fit the familiar one, producing designs that fight the grain of the problem.
- Reviews judge fit against habit rather than against the problem's actual shape, so the mismatch passes unquestioned.

## How to avoid it
<!--meta block=mitigation-->

Make someone name a second candidate. Before the choice is settled, one person names another way to solve it and says in a sentence why it loses — an hour of comparison is what turns a reflex back into a decision. If nobody can name an alternative, you have found the problem, not a formality to skip.

Then make the choice reversible before it becomes permanent. Put the tool behind an interface your own code owns and keep its vocabulary out of the callers, so replacing it later is one implementation rather than a rewrite. And try the alternative on a real slice of work instead of in a document, because the argument is usually about fluency, and a week of using the other thing is the only honest price for it.

Someone has to own the defaults, or the reflex owns them. Keep a short written list of what the team reaches for by default and, against each entry, the boundary where it stops applying — a default with a stated edge is a decision, and one without an edge is the habit again in writing. Revisit that list on a fixed cadence rather than when a project is late, because a deadline is exactly when the familiar tool wins every argument.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Mitigated by**

- [Microkernel / Plugin](../patterns/architecture/microkernel.md) — A plug-in per need resists forcing one tool everywhere

<!-- relationships:end -->
