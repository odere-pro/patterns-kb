---
name: kb-design-interface
description: "Write or review the interface block (\"The interface — API design\") of a design page: a short lead, then endpoints grouped by caller, each with a method+path and an HTTP contract sketch. Use when asked to \"write the interface block\", \"design the API\", \"group the API by caller\", or to review it. Not for the data design (kb-design-entities)."
---

# Writing the interface block ("The interface — API design")

**The interface is worked out from the entities and the FRs — a reader who has scanned the
data design must find no surprises here.** Endpoints are grouped by caller/audience,
because the auth model follows the audience: the tenant's API key, the onboardee's
magic-link token, the vendor's signed callback, the system's own outbound push. Every
contract ships **collapsed** — a sketch fence, which the site renders as a closed
`<details>`: eleven expanded contracts bury the grouping that is the block's actual
argument. The surface has to be readable without opening anything, which is what the bold
method+path and the one-line description are for. Two sections, in order: a short observations lead, then the endpoints in
groups.

## The markup

````markdown
## The interface — API design
<!--meta block=interface-->

… observations: 2–4 claim sentences …

### Group name — its auth model

- **`POST /flows`** — One sentence: what it does and the rule it carries.

  ```http summary=contract
  POST /flows …
  ```
- …
````

The heading is **"The interface — API design"**, with the `<!--meta block=interface-->`
fact on the line under it. Hand-written markdown in the page under `docs/designs/` — no
`kb.mjs` writer; the `kb-shape` gate in `make validate` checks structure, not content. A
group is a `###` heading and a `-` list; an endpoint is one item of that list, its contract
fence nested under it (indented to the item's text) — the same shape as the entity groups.
The fence's language (`http`) is what the site highlights and what the `kb-shape` gate
checks against the closed sketch-language list (KB-010) — a fence with no language renders
the contract in flat ink and fails the gate. Full sketch contract: the **kb-sketch** skill.

## The two-part shape

### 1. Observations

One paragraph — 2–4 sentences, each a claim about the
API design, no filler. What belongs here: the status-code policy and why (202-everywhere
for an async core), what is deliberately absent (no poll, no cancel) and what replaces
it, where idempotency lives at each boundary, and any landed decision worth bolding
("push with replay beats push with poll"). What does not: endpoint-by-endpoint
narration — the cards do that.

- **No hedging, no marketing adjectives.** "Should generally be idempotent where
  possible" decides nothing, and "a clean, flexible API" prices nothing — name the status
  code, the guard or the policy instead. One hedge is a confidence marker and is fine; a
  stack of them means the decision was never made.

### 2. Grouped endpoints

**Group by caller/audience, not by resource** — an API surface is per-audience because
each audience authenticates differently and can be granted different things. Typical
groups: the tenant-facing API, the end-user surface, inbound vendor callbacks, the
outbound push the system makes, governance/compliance calls. 3–6 groups. The `###`
heading names the group and its auth model or defining property follows after ` — ` —
`### Onboardee surface — the magic-link token is the identity` — the same
title-and-qualifier idiom the entity groups use.

**Outbound contracts are part of the surface.** The webhook the system sends is a
contract the client codes against; it gets an item like any endpoint (the bold lead is
the push it makes, e.g. `POST {webhookUrl}`). So are inbound callback endpoints that only
vendors ever call — if an entity exists to receive them, the surface that feeds it must
be visible.

Every endpoint appears in **exactly one** group, as one list item:

- **Bold lead: method + path** in a code span (`` **`POST /flows`** ``) — nothing else,
  then ` — `.
- **One-line description** — what it does and the rule it carries, one sentence, maybe
  two short ones. The rule is the point: "same `eventId`, so the client's dedup absorbs
  it" earns its line; "replays the webhook" does not.
- **Contract** — an `http` sketch fence nested under the item (`summary=contract`),
  holding trimmed HTTP; collapsed by default.

### Contract-sketch rules

Real HTTP, cut to what argues:

- **Request line, load-bearing headers only** — auth and idempotency headers, nothing
  routine. Minimal example body: only fields the design argues about.
- **Every distinct outcome gets a response line** — the success, and each error that
  encodes a rule (`409` single-use spent, `410` expired → resend page). An error that is
  just an error stays out.
- **Inline annotations** right of the line for what a field *is*; `#` comment paragraphs
  after a response for the *why*. The why names the mechanism from the entities block
  (the index, the uniqueness, the key destruction) — that is how the contract traces
  back to the data, made visible.
- Each state-changing endpoint names its **duplicate-guard**, and which duplicate it
  guards: a client retry (`Idempotency-Key`) and a repeated business action (a
  constraint) are different duplicates with different guards.
- ~8–15 lines per contract. Past that, the argument belongs in a deep dive — link by
  mention ("deep dive 2") and trim.

## Inline markup

The one-line descriptions are prose: a code span for a field, header or status code,
bold for a run-in label, a relative `[link](../patterns/….md)` for a page the KB has.
**No `*italic*` or `_italic_`** — the corpus carries none. A field worth stressing is
already in a code span.

## Consistency with the rest of the page

Every endpoint traces to an FR; an endpoint no requirement forces is invented scope.
Every contract field maps to an entity column or vault reference from the entities block
upstream — the contract may not carry data the entities cannot hold, and every
constraint it cites (`one_open_flow`, the inbox uniqueness, `event_id`) must exist there
by name. The absent endpoints trace too: what the block deliberately leaves out should
match the requirements' out-of-scope list. Downstream, the architecture block's
components must be able to serve exactly this surface. Arguments live in the deepdives —
cite them, don't inline them.

## What this block is not

- **Not OpenAPI.** No exhaustive field lists, no schemas-of-schemas; the contract shows
  what the design argues about, the rest is elided.
- **Not the deep dives.** A guard is *shown* here; the race it defeats is argued in
  `deepdives`.
- **Not the entities block.** Data shapes were decided upstream
  ([kb-design-entities](../kb-design-entities/SKILL.md)); the interface exposes them.

**Legacy note**: the standard corpus shape for this block is a one-sentence lead, a
single sketch fence holding all endpoints, and a closing decision paragraph.
That shape stays valid; this format is currently applied only to
`persona-identification`. Migrate another page only when its interface block is being
reworked on purpose.

## Self-check the draft

- Scan test: after 20 seconds and **without opening a contract**, can a reader name the
  audiences, their auth models, and the whole endpoint surface? That is what the group
  headings, the bold method+path leads and the one-line descriptions are for.
- Is the observations lead ≤4 sentences, every one a claim?
- Does every state-changing contract name its duplicate-guard(s), and every cited
  constraint exist by name in the entities block?
- Is the whole surface present — including outbound pushes and vendor-only callbacks —
  and does everything absent trace to out-of-scope?
- Run `node scripts/kb.mjs get <id> --block interface` — the output should scan as:
  observations, then group → endpoint → contract, repeating.

## Done means

- Every endpoint sits in exactly one group, as a list item with a bold method+path in a
  code span, a one-line rule, and a nested `http` sketch fence (`summary=contract`).
- Every group heading names its auth model or defining property after ` — `.
- `make gen && make validate` exits 0.
