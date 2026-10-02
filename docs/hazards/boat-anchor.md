---
title: Boat Anchor
description: Dead code or hardware kept around unused
area: hazards
owner: Oleksandr Derechei
tags: [anti-pattern, code-smell, maintainability, readability]
status: stable
solves: [nobody can explain what breaks if we delete this module, "a server is racked, patched and monitored but has served no traffic for a year", "code marked do not remove, may be needed later, with no ticket or owner", a search for callers turns up nothing yet nobody dares delete the file]
---

# Boat Anchor

Dead code or disused hardware kept around unused — not because anyone still needs it, but because nobody is willing to be the one who removes it.

## What it is
<!--meta block=description-->

A **boat anchor** is a component that stays in the system long after it stopped earning its keep: a module with no remaining callers, a config flag nobody has flipped in years, a deprecated service still deployed and patched, a dependency still pinned though the feature it served shipped its replacement months ago. The name comes from gear so useless at the job it was bought for that its weight over the side is the last value anyone can find in it. What keeps it aboard is that throwing it out feels like a decision someone might regret.

You recognize it by the shape of the excuse around it, not just the code itself. A comment reads `// DO NOT REMOVE, may be needed later` with no ticket, owner, or date attached. A grep for callers turns up nothing, yet the file survives three more refactors untouched. A server sits racked, powered, monitored, and getting security patches, while its traffic graph has read zero for a year. Nobody can explain what breaks if it's deleted — they just aren't sure enough to try.

What separates it from ordinary unused code is the decision, or the absence of one, behind it. Nobody actively chose to keep serving this; nobody actively chose to remove it either. It persists by default, and every day it survives makes the next day's inaction easier to justify.

## Explained
<!--meta block=explain-->

A boat anchor is a component that stays in the system long after it stopped being used, such as a module with no callers, a flag nobody has flipped in years, or a server racked and patched while its traffic graph reads zero. It survives by default: nobody chose to keep it and nobody chose to remove it. Blame is asymmetric, since a deletion that breaks something has a name on it while a box costing money every month has none, and fear of regret beats checking. The cost is money for power and licences, attention in every refactor and patch cycle, and unpatched holes in something nobody watches. Flip the default: removal happens on a dated schedule unless someone shows evidence of use. Pay for being wrong in stages, so a path nobody instrumented announces itself while the revert is cheap: fail the calls for a week, then stop the process, then delete. Remove a big one slice by slice behind a routing layer, and give that layer its own removal date. Better still, build nothing for later, and add the option the day a caller exists.

**Example.** A team runs a legacy report server at 400 dollars a month, with 6 months of zero requests in its access log. Nobody will delete it. The owner announces removal in 30 days unless someone claims it. On day 30 the server's calls start to fail for a week, and one finance script, run only each quarter, breaks and is moved to the new service. Then the process is stopped for another week, and finally deleted. Keeping it for the year cost 4,800 dollars plus every patch cycle. The price of the fix is two weeks of staged steps and one broken quarterly script found while the revert still took minutes.

## How it happens
<!--meta block=causes-->

```mermaid caption="A reinforcing loop, not a single decision. The longer it survives unexamined, the more removing it looks like the risky move."
flowchart TB
    A["Feature or service is replaced"] -->|"kept just in case"| B["Old code or box left in place"]
    B -->|"no owner assigned to verify"| C["Nobody confirms it is safe to remove"]
    C -->|"context and callers fade"| D["Remaining usage is forgotten"]
    D -->|"removal now feels risky"| E["Leaving it looks safer than cutting it"]
    E -->|"so it stays"| B
```

- Sunk cost: real effort built it, so deleting it feels like admitting that effort was wasted.
- Fear substitutes for verification — "it might still be used" beats actually confirming zero callers or zero traffic.
- No deprecation process with a hard removal date, so "we'll clean it up later" never arrives.
- Dead-code and dead-traffic detection isn't run, so the thing is invisible until someone happens to grep for it.
- Hardware, licenses, or contracts were already paid for, so keeping them running feels free even though it isn't.
- The original owner left or moved teams, and no one inherited the authority to decide it's safe to cut.

## Why it hurts
<!--meta block=cost-->

- **It keeps costing money.** Racked hardware still draws power and cooling; unused services still consume compute, licenses, and support contracts, all paid indefinitely on a bet nobody plans to collect on.
- **It keeps costing attention.** Refactors, migrations, and code reviews still have to account for it, and security patching still has to cover it, though it delivers zero value in return.
- **It misleads by presence.** Its mere existence implies relevance, so engineers build around it, avoid touching adjacent code out of caution, or waste time reverse-engineering what it's for.
- **It quietly rots.** An unused service or dependency still accumulates unpatched vulnerabilities — exactly because nobody treats it as something "in use" that needs attention.
- **It normalizes the next one.** Once one boat anchor survives unexamined, "we never delete anything here" becomes the default answer, and the pile only grows.

## How to avoid it
<!--meta block=mitigation-->

The cheapest anchor is the one you never build. When someone asks for a flag, a hook or a service "for later", ship the version without it and add it the day a caller exists — an option nobody called is the thing that becomes undeletable. For what already exists, delete it outright rather than commenting it out, because a copy left in the file is a copy every reader still has to account for.

Something too big to delete in one commit comes out slice by slice. Put a routing layer in front of it, move one slice of callers to the replacement, and delete that slice's code once its counter reads zero — each step is small enough to revert, and the old thing shrinks on a schedule instead of waiting for one decision nobody wants to sign. Keep those removals in the same backlog as the feature work, or the last slice never comes out.

Give the removal machinery its own removal date. The routing layer and the compatibility shim you added to retire something are the next generation of anchors, and they carry the best excuse for staying. Treat the sweep as a standing job rather than a cleanup sprint, too: a scheduled pass that assigns owners and dates keeps the pile flat, while a one-off purge resets a count that starts climbing again the following week.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Mitigated by**

- [Strangler Fig](../patterns/distributed/coordination/strangler-fig.md) — Retire dead legacy slice by slice
- [You Aren't Gonna Need It (YAGNI)](../principles/yagni.md) — Build only what is needed now and there is no speculative code left to fossilise
- [Record Architecture Decisions](../principles/architecture-documentation.md) — A dated record of why something was kept makes it possible to tell a live constraint from a dead one

<!-- relationships:end -->
