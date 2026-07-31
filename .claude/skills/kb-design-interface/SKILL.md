---
name: kb-design-interface
description: Write or review the interface block ("The interface — API design") of a patterns-kb design page — a short observations lead, then endpoints grouped by caller/audience, each with a method+path, a one-line description, and an HTTP contract expanded by default. Use when someone asks to "write the interface block", "design the API", "format the endpoints", "group the API by caller", "show request/response per endpoint", or says the API design is hidden in collapsed sketches or missing part of its surface.
---

# Writing the interface block ("The interface — API design")

**The interface is derived from the entities and the FRs — a reader who has scanned the
data design must find no surprises here.** Endpoints are grouped by caller/audience,
because the auth model follows the audience: the tenant's API key, the onboardee's
magic-link token, the vendor's signed callback, the system's own outbound push. Every
contract is visible on load — collapsible is fine, collapsed is not: `<details
class="sketch" open>`, never a closed one. Two sections, in order: a short observations
lead, then the endpoints in groups.

## The markup

```html
<section class="doc-section" id="interface" aria-labelledby="h-interface" data-kb-block="interface">
  <h2 class="doc-h" id="h-interface">The interface — API design</h2>
  <div class="prose">
    <p>… observations: 2–4 claim sentences …</p>
  </div>
  <div class="endpoint-group">
    <h3>Group name — its auth model</h3>
    <div class="endpoint">
      <h4><code>POST /flows</code></h4>
      <p>One sentence: what it does and the rule it carries.</p>
      <details class="sketch" open>
        <summary>contract</summary>
<pre><code class="language-http" data-kb-lang="http">POST /flows …</code></pre>
      </details>
    </div>
    …
  </div>
  …
</section>
```

The heading is **"The interface — API design"**. Hand-edited HTML — no `kb.mjs` writer;
the PostToolUse hook checks structure, not content. `endpoint-group` / `endpoint` are
presentation-only classes (styled in `site/assets/pattern.css`, shared with the entity
cards); meaning lives in the element structure. Keep `data-kb-lang` on the `<code>` —
`sketch.js` highlights open sketches on load.

## The two-part shape

### 1. Observations

One `<div class="prose">` with a single `<p>` — 2–4 sentences, each a claim about the
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
outbound push the system makes, governance/compliance calls. 3–6 groups. The `<h3>`
names the group *and* its auth model or defining property after an em-dash —
`Onboardee surface — the magic-link token is the identity`.

**Outbound contracts are part of the surface.** The webhook the system sends is a
contract the client codes against; it gets a card like any endpoint (the `<h4>` is the
push it makes, e.g. `POST {webhookUrl}`). So are inbound callback endpoints that only
vendors ever call — if an entity exists to receive them, the surface that feeds it must
be visible.

Every endpoint appears in **exactly one** group, as one `<div class="endpoint">`:

- **`<h4>` method + path** in `<code>` — nothing else.
- **One-line description** — what it does and the rule it carries, one sentence, maybe
  two short ones. The rule is the point: "same `eventId`, so the client's dedup absorbs
  it" earns its line; "replays the webhook" does not.
- **Contract** — a `<details class="sketch" open>` (summary: `contract`) holding
  trimmed HTTP.

### Contract-sketch rules

Real HTTP, cut to what argues:

- **Request line, load-bearing headers only** — auth and idempotency headers, nothing
  routine. Minimal example body: only fields the design argues about.
- **Every distinct outcome gets a response line** — the success, and each error that
  encodes a rule (`409` single-use spent, `410` expired → resend page). An error that is
  just an error stays out.
- **Inline annotations** right of the line for what a field *is*; `#` comment paragraphs
  after a response for the *why*. The why names the mechanism from the entities block
  (the index, the uniqueness, the key destruction) — that is the derivation made
  visible.
- Each state-changing endpoint names its **duplicate-guard**, and which duplicate it
  guards: a client retry (`Idempotency-Key`) and a repeated business action (a
  constraint) are different duplicates with different guards.
- ~8–15 lines per contract. Past that, the argument belongs in a deep dive — link by
  mention ("deep dive 2") and trim.

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
single closed `details.sketch` holding all endpoints, and a closing decision paragraph.
That shape stays valid; this format is currently applied only to
`persona-identification`. Migrate another page only when its interface block is being
reworked on purpose.

## Self-check

1. Scan test: after 20 seconds, can a reader name the audiences, their auth models, and
   the status-code policy? If any contract is collapsed on load, it fails.
2. Is the observations lead ≤4 sentences, every one a claim?
3. Does every endpoint sit in exactly one group, with method+path + one-line rule +
   visible contract — and does every group heading name its auth model?
4. Does every state-changing contract name its duplicate-guard(s), and every cited
   constraint exist by name in the entities block?
5. Is the whole surface present — including outbound pushes and vendor-only callbacks —
   and does everything absent trace to out-of-scope?
6. `make all && make check`, then `node scripts/kb.mjs get <id> --block interface` — the
   output should scan as: observations, then group → endpoint → contract, repeating.
