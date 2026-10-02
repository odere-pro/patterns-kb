---
title: Intercepting Validator
description: Validates and sanitizes input before it reaches logic
area: security
owner: Oleksandr Derechei
tags: [security, validation, boundaries, separation-of-concerns]
status: stable
solves: [a user typed a quote character into a search box and broke everything downstream, every controller starts with twenty lines checking that fields are not empty or too long, a request with a missing field exploded deep in the domain code with a useless stack trace, we tightened a length limit on one endpoint and forgot the three others taking the same payload, people skip my nice client-side checks by calling the API directly with curl]
---

# Intercepting Validator

Places a dedicated checkpoint between untrusted input and business logic, so nothing malformed, oversized, or malicious ever reaches code that assumes the data in front of it is already clean.

## What it is
<!--meta block=description-->

An **intercepting validator** is a checkpoint placed in front of business logic that inspects every incoming request before it is allowed to proceed. Rather than trusting each handler to check its own inputs, the pattern factors validation out into one or more validator objects — often chained, one per concern — that a controller or filter invokes before dispatching to the real work. A request that fails any rule is rejected on the spot, with the offending data never touching domain code.

The force it resolves is that **input from outside the trust boundary is never safe to assume**. Form fields, query parameters, headers, uploaded files, and API payloads are all attacker-controlled, and injection, overflow, and malformed-data bugs live in the gap between "the code expects X" and "nothing checked that it got X." Scattering ad hoc checks across every handler is how that gap opens: some paths validate thoroughly, some skip a field, some duplicate a rule that later drifts out of sync.

Intercepting Validator centralizes that responsibility instead of duplicating it. Validation rules live in one place, run against every request through the same choke point, and are testable and auditable independent of the business logic they protect. It is the pattern behind request-level filters, middleware validation stacks, and the validator layer in frameworks like Struts and Java EE's Core Security Patterns catalog.

Its cost is an added layer that every request pays for, and rules that must be kept honest against what the logic downstream actually expects — a validator that's stale or too lax gives a false sense of safety.

## Explained
<!--meta block=explain-->

An intercepting validator is a checkpoint in front of your business logic that runs a chain of rules on every incoming request and rejects bad input before any handler sees it. Form fields, query parameters, headers and uploads all come from outside your control, so a handler that trusts them is open to injected commands, oversized values and malformed data. Choose it over checks written inside each handler when many endpoints take input, because a rule added once applies everywhere and every rejection is logged in one place. It costs three things. Every request pays for the chain, so keep rules cheap and ordered with the quickest first. Rules drift from what the logic really expects, producing wrongly rejected requests or wrongly accepted ones, so test them against the handlers they guard. And passing the gate does not make input safe further on, so still use parameterised queries, which send values apart from the command text, and encode output. Keep each rule small and separate, or the chain becomes a second program full of special cases.

**Example.** A signup form takes a username that must match 3 to 20 letters, digits or underscores. An attacker sends admin'-- hoping to cut off the rest of a login query. The validator rejects it with a 400 before any database call. A search box, however, must accept free text, quotes included, so it passes the validator. The parameterised query is what stops an injection there: the value reaches the database as data, never as part of the command. The cost appears when product decides usernames may contain a dot: you must change both the rule and the handler that assumed no dots.

## How it works
<!--meta block=structure-->

```mermaid caption="Where does a bad field get stopped? At step 5, inside the gate — so step 6 hands business logic only input that every rule has already accepted, and no handler has to remember the check itself."
flowchart LR
    Cl["Client"]:::ext
    Rules[("Rule set")]
    subgraph Gate["One choke point every request crosses"]
        F["Request filter"]
        V1["Shape and type check"]
        V2["Size and encoding check"]
    end
    BL["Business logic"]
    Cl -->|"1 request with untrusted fields"| F
    Rules -->|"2 the rules the chain enforces"| F
    F -->|"3 run the chain"| V1
    V1 -->|"4 passed, next concern"| V2
    V2 -->|"5 first failure: 4xx, nothing dispatched"| Cl
    V2 -->|"6 every rule passed"| BL
    classDef ext stroke-dasharray:4 4
```

## Variations
<!--meta block=variations-->

- **Programmatic validators** — Validation rules are written directly in code as a chain of validator objects, each testing one concern — presence, type, length, format — and short-circuiting on the first failure.
- **Declarative validators** — Rules are expressed as configuration or schema — annotations, a JSON Schema, an XML rule set — so non-code changes can tighten or loosen validation without a redeploy.
- **Allow-list vs. deny-list** — Validating against a whitelist of known-good shapes catches everything unexpected; a blacklist of known-bad patterns is perpetually one attack behind.
- **Client- and server-paired validation** — Client-side checks give fast feedback and cut round trips, but they're trivially bypassed — the server-side interceptor remains the only check that actually enforces the rule.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Centralizes validation logic** in one place instead of scattering ad hoc checks across handlers.
- **Stops malformed or malicious input** — injection payloads, oversized fields, bad encodings — before business logic ever sees it.
- **Reusable across endpoints**; a new rule is added once and applies everywhere the chain runs.
- **Gives a single point** to log and audit what was rejected, and why.

### Cons
<!--meta polarity=con-->

- **Adds a layer every request pays** for, even the vast majority that are already valid.
- **Rules can drift out** of sync with what business logic actually needs, producing false positives or false negatives.
- **Rule chain becomes a monolith** — an unmanaged chain of special cases becomes its own monolith if rules aren't kept modular.
- **Passing the gate is not proof** of safety further down — it doesn't replace parameterized queries or output encoding.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **Input arrives from an untrusted source** — a public API, a web form, an upload, request headers.
- **Multiple endpoints share the same validation rules** and duplicating the checks by hand is error-prone.
- **You need one enforced choke point for format**, size, and encoding rules before anything is dispatched.

### Avoid when
<!--meta polarity=avoid-->

- **The input is already fully trusted and internal**, with no crossing of a trust boundary.
- **The check needs deep business context** that only the domain logic itself can evaluate correctly.
- **A neighboring pattern already** validates the same request earlier in the pipeline — don't re-check what the [Gatekeeper](../distributed/routing/gatekeeper.md) or [API Gateway](../distributed/routing/api-gateway.md) already enforced.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — a validator chain guarding a handler"
class ValidationError extends Error {}

type Rule<T> = (input: T) => string | null; // returns an error message, or null

class ValidationChain<T> {
  constructor(private readonly rules: Rule<T>[]) {}

  run(input: T): T {
    for (const rule of this.rules) {
      const error = rule(input);
      if (error) throw new ValidationError(error); // reject on first failure
    }
    return input; // only reaches here once every rule has passed
  }
}

interface SignupRequest { email: string; age: number; }

const signupValidator = new ValidationChain<SignupRequest>([
  (r) => (/^[^@]+@[^@]+\.[^@]+$/.test(r.email) ? null : "invalid email"),
  (r) => (r.age >= 13 ? null : "must be 13 or older"),
]);

function handleSignup(raw: unknown) {
  const req = signupValidator.run(raw as SignupRequest); // intercepted here
  return createAccount(req); // business logic never sees invalid input
}
```

## In the wild
<!--meta block=wild-->

- **Pydantic in FastAPI** — FastAPI parses each request body into a declared Pydantic model before the endpoint function runs; a mismatch raises a RequestValidationError that returns a 422 with per-field error detail. A model config of extra=forbid turns unknown fields into a rejection. {#wild-pydantic-fastapi}
- **Hibernate Validator (Bean Validation)** — The reference implementation of Jakarta Bean Validation. Constraint annotations (@NotNull, @Size, @Pattern) declared on request objects are checked at the controller boundary when the argument is marked @Valid, before the method body executes. {#wild-hibernate-validator}
- **express-validator** — Built on validator.js, it composes body()/check() validation and sanitization rules into an Express middleware chain that runs ahead of the route handler; accumulated errors are read back with validationResult(req) to reject the request. {#wild-express-validator}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **Payload and field size limits** — Caps on request body size, field length, array count, and nesting depth, enforced before parsing. Too low rejects legitimate large inputs; absent, an attacker can exhaust memory or CPU with an oversized or deeply nested payload.
- **Allow-list vs deny-list strictness** — Whether rules accept only known-good shapes or merely reject known-bad patterns. Allow-listing catches everything unexpected; a deny-list is perpetually one attack behind. The choice is the single biggest lever on coverage.
- **Reject-unknown-fields mode** — Whether a payload carrying fields the schema does not declare is rejected or silently dropped. Strict rejection surfaces client drift and mass-assignment attempts; lenient mode is more forgiving but hides them.
- **Error-response verbosity** — How much a rejection tells the caller. Detailed field-level errors help legitimate clients but also hand an attacker a map of exactly what the validator expects; terse errors are safer but harder to integrate against.

### Signals to watch
<!--meta polarity=signal-->

- **Validation rejection rate** — Share of requests bounced at the gate (the 4xx/422 rate). A sudden spike is either an attack probing inputs or a validator rule that has drifted out of sync with a legitimate client change.
- **Rejections by rule / field** — Which specific rule or field is doing the rejecting. A single field dominating the rejections points at either a client contract mismatch or a targeted probe.
- **Added validation latency (p99)** — Per-request time the validator chain adds before dispatch. Watch the tail: complex regexes or large payloads show up here, and a regex under attack shows up as a latency cliff.

### Failure modes under load
<!--meta polarity=failure-->

- **Rules drift from downstream expectations** — The validator and the business logic disagree about what is valid. Too strict, it false-positives and rejects good traffic; too lax, it false-negatives and passes input the logic cannot actually handle — a false sense of safety.
- **Deny-list gap lets a payload through** — A blacklist misses a novel encoding or injection variant; malformed input clears the gate and reaches domain code, which assumed it was already checked.
- **Catastrophic regex backtracking (ReDoS)** — A validation regex with nested quantifiers hits exponential backtracking on a crafted string, pinning a CPU. The validator meant to protect the system becomes the denial-of-service vector.
- **Client-side-only reliance** — Validation is enforced in the browser for user experience (UX) but not repeated server-side; the check is trivially bypassed by calling the API directly, and the only real enforcement point is missing.

### Readiness checklist
<!--meta polarity=check-->

- Enforce every rule server-side; treat client-side validation as UX only, never as the enforcement point.
- Prefer allow-listing known-good shapes over deny-listing known-bad patterns.
- Cap payload size, field length, and nesting depth before parsing, not after.
- Confirm passing the validator does not substitute for parameterized queries and output encoding downstream.
- Review validation regexes for catastrophic backtracking on adversarial input, or bound their execution.

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Auth & Access](../../themes/auth-and-access.md) — Reject bad input before it reaches logic {#fluency-auth-and-access}
- [API Design](../../themes/api-design.md) — Reject malformed and hostile input at the edge {#fluency-api-design}
- [Securing Availability](../../themes/securing-availability.md) — Stop malformed input from becoming load {#fluency-securing-availability}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [Gatekeeper](../distributed/routing/gatekeeper.md) — Screen before forwarding
- [API Gateway](../distributed/routing/api-gateway.md) — Validate input at the edge
- [Secure Logger](./secure-logger.md) — Rejections become audit records instead of vanishing
- [Chain of Responsibility](../gof/behavioral/chain-of-responsibility.md) — Chained validators are one link per concern
- [Fail Fast](../../principles/fail-fast.md) — Validating at the edge is fail-fast made concrete
- [Postel's Law](../../principles/postels-law.md) — Enforces the strict half at the point of entry
- [Quarantine](./quarantine.md) — Validates data crossing the wire; quarantine validates code crossing into the build
- [Defense in Depth](../../principles/defense-in-depth.md) — Edge validation is one layer, and does not excuse the service behind it.

**Implemented by**

- [Networking](../../capabilities/networking.md) — A managed WAF applies rule sets to every request before it reaches the application, so the checks exist even on the endpoint whose handler forgot them.

<!-- relationships:end -->
