---
name: style-pattern-doc
description: Write a pattern explanation in the AWS Prescriptive Guidance shape — intent, motivation as failure branches, applicability, considerations, then an incremental baseline→failure→fix demonstration. Use when someone asks to "write this like the AWS docs", "explain this pattern properly", "document this pattern", "make this read like Azure Architecture Center", or wants a pattern write-up that is compact, precise and demonstrated rather than described.
---

# The pattern-doc register

**Reader:** an engineer deciding whether this pattern solves their problem, and what it
will cost them. They stop reading the moment the page starts describing instead of
demonstrating.

## The register

Eight rules, distilled from AWS Prescriptive Guidance, Azure Architecture Center and the
Google Cloud Architecture Framework.

1. **Second person, active voice, imperative for advice.** Address the reader as "you";
   headings and directives open with the verb.
2. **One concept per sentence, 2–3 sentences per paragraph.** A sentence needing "and
   which also" is two sentences.
3. **Every claim carries its consequence.** "Isolate the elements of an application into
   pools so that if one element fails, the others continue to function."
4. **Open with the imperative essence.** First sentence is verb-first summary plus
   payoff. No scene-setting, no history.
5. **Phrase applicability as the reader's situation**, never as the pattern's features:
   "You want to ensure atomicity…", not "this pattern provides atomicity".
6. **Motivate with failure branches** — what breaks without the mechanism, branch by
   branch.
7. **Demonstrate incrementally**: baseline → failure → fix. Every diagram and code block
   answers exactly one question.
8. **No hedging stacks, no marketing adjectives.** "Robust", "scalable", "significant"
   are unpriced — give the figure or the mechanism. "Where feasible" is the one
   acceptable softener.

**Cut on sight:** *in order to* → to; *utilise / leverage* → use; *it is worth noting
that* → delete; *demonstrates the ability to* → can; *a number of* → the number;
*subsequently* → then; *facilitate* → let, help; *significant* → the actual figure.
Also cut intros that restate the heading, transitions, summaries of what you just wrote,
and "note that".

## The skeleton

Five moves, always in this order. Each earns its place or is omitted — never padded.

### 1. Intent — two or three sentences

Name the problem class, define its term inline, state the consequence of not solving it.

> The transactional outbox pattern resolves the dual write operations issue that occurs
> in distributed systems when a single operation involves both a database write operation
> and a message or event notification. A dual write operation occurs when an application
> writes to two different systems. A failure in one of these operations might result in
> inconsistent data.

Term defined where it first appears, consequence last. No history, no "in modern
distributed systems today".

### 2. Motivation — the failure branches

One framing sentence, then the branches. Each branch is "if X but Y, then consequence":

> - If the database update is successful but the event notification fails, the downstream
>   service will not be aware of the change, and the system can enter an inconsistent state.
> - If the database update fails but the event notification is sent, data could get
>   corrupted, which might affect the reliability of the system.

Two or three branches. If you can only find one, the motivation is thinner than the
pattern claims.

### 3. Applicability — the reader's situation

> Use this pattern when:
> - You're building an event-driven application where a database update initiates an
>   event notification.
> - You want to ensure atomicity in operations that involve two services.

Then the honest inverse — "might not be suitable when" — with the real reasons
(complexity not warranted, resource cost unacceptable). A pattern with no inverse is
being sold, not documented.

### 4. Considerations — bold label, directive, reason

One line each, no paragraphs:

> - **Order of notification**: Send messages in the same order in which the service
>   updates the database, because out-of-order events compromise point-in-time recovery.
> - **Transaction rollback**: Do not send out an event notification if the transaction
>   is rolled back.

These are the operational teeth of the page. Vague ones ("consider performance") are
worse than none.

### 5. Demonstration — baseline, failure, fix

Walk it incrementally rather than presenting the finished design:

1. The naive design and what it does.
2. Where it breaks — one concrete failure, shown.
3. The fix. If there are genuinely two approaches (outbox table vs change data capture),
   show each in turn with its own tradeoff, not a merged abstraction.

Every diagram and snippet answers one question. Cut any that illustrates something the
prose already settled.

**The numbered architecture walk is mandatory.** Before any sequence or timing detail, the
implementation section carries one `flowchart` showing how the happy path crosses the
components: component nodes plus data stores, the boundary that makes the pattern work
drawn as a `subgraph` (for the outbox: "One atomic transaction" around the state table and
the outbox table), edge labels numbered `1..N` in the order the steps happen, ≤9 nodes. It
is the diagram the reader reconstructs the design from, and the one AWS puts first. The
sequence diagram — ordering, retries, failure branches — comes after it, for the reader who
already has the board. A write-up that opens with a sequence diagram, or with no diagram at
all, is not finished. Recipe: the **diagram-draw** skill.

## Mapping onto KB blocks

The KB's block vocabulary already holds this skeleton — use the blocks, don't invent
sections:

| Move | Block |
|---|---|
| Intent | `description` (and the `essence` attribute for the one-liner) |
| Motivation | `description` failure branches, or the hazard page it prevents |
| Applicability | `usage` — "Reach for it when" / "Avoid when" |
| Considerations | `tradeoffs` (the con column) and `production` (knobs, signals, failures) |
| Demonstration | `structure` and `sketch`; diagrams via the `diagram-draw` skill |

Block order and membership are fixed per kind (`BLOCKS` in `scripts/lib/model.mjs`);
`make check` fails on a missing, unknown or out-of-order block. Write the prose through
`kb.mjs`, never by hand-editing attributes.

## Grounding from the KB

Pull the facts before writing; the reader will check:

```
node scripts/kb.mjs get <id>                      # the whole page, cleaned
node scripts/kb.mjs get <id> --block tradeoffs    # the considerations material
node scripts/kb.mjs get <id> --block production   # knobs, signals, failure modes
node scripts/kb.mjs related <id>                  # what it combines with, what it prevents
```

Cite stable ids for load-bearing claims
(`patterns/distributed/resilience/circuit-breaker.html#tradeoffs-con-2`). The
anti-fabrication rule binds hardest here: never name a library, metric, default value or
product feature you are not certain exists. A fabricated name is a lie that ships to a
public site. If in doubt, leave it out — a three-item list of true things beats a
five-item list with one lie.

## Self-check

1. Does the first sentence state what it does and what that buys, verb first?
2. Is the motivation shown as failure branches, not as a description of the problem space?
3. Is applicability phrased as the reader's situation, and is the inverse honest?
4. Does every consideration carry a directive and its reason in one line?
5. Does the demonstration walk baseline → failure → fix, with each visual earning its place?
6. Any unpriced adjective, stacked hedge, or sentence carrying two concepts?
