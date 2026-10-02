---
title: Gateway
description: One-object wrapper around an external system's API
area: enterprise
owner: Oleksandr Derechei
tags: [integration, decoupling, testability, encapsulation]
status: stable
solves: [the payment vendor's odd field names and units are spread all over my codebase, my tests hit a real third-party API so they are slow and flaky, switching SMS providers would mean touching thirty different files, the vendor bumped their API version and my code broke in a dozen places, auth headers and retry handling are copy-pasted at every call site]
---

# Gateway

Wraps access to an external system or resource in a single object whose interface speaks your application's own language — not the vendor's protocol, wire format, or naming.

## What it is
<!--meta block=description-->

A vendor's auth headers, odd field names, units and error codes spread through every call site, so a version bump or a provider switch touches dozens of files. A gateway is one object through which your code reaches an outside system, with an interface shaped around what your application needs. Only the gateway knows the vendor's protocol, and tests swap in a fake.

## Explained
<!--meta block=explain-->

A gateway is one object through which your code reaches an outside system such as a payment processor, a queue or a legacy mainframe. It offers an interface shaped around what your application needs, and only the gateway knows the vendor's wire format, field names, units and error codes. Callers speak your own vocabulary, so a version change or a switch of provider touches one file, and tests swap in an in-memory fake with no network. Choose it over an [adapter](../gof/structural/adapter.md), which fits a class to an interface a client already expects, when you are free to design the interface yourself. If you own both sides, a plain function is enough.

- **Ceremony when thin.** A gateway that forwards arguments one for one protects nothing, so make it translate units and map the vendor's errors.
- **Dumping ground.** Unrelated calls pile up in it, so keep one gateway per outside system and split it when it serves two jobs.

**Example.** A payment vendor takes amounts as strings of cents, such as 1999, and fails with a numeric code, such as 51. 14 places in the code call it directly, each converting cents and decoding 51. A PaymentGateway offers charge(orderId, money) and throws InsufficientFunds, so the 14 callers shrink to one line each. The vendor is replaced after a price rise: one file changes, not 14. Tests use an in-memory fake that records charges and run in milliseconds. The cost is one more interface to keep in step with what the vendor really does.

## How it works
<!--meta block=structure-->

```mermaid caption="Which code knows the carrier's key, units and field names? Only what sits inside the box — steps 2 to 4 never leave it, and every caller sends and receives your own types."
flowchart LR
    Checkout["Checkout service"]
    Returns["Returns service"]
    subgraph Seam["The only code that knows the carrier"]
        GW["Shipping gateway"]
        Keys[("Carrier credentials")]
    end
    Carrier["Carrier REST API"]:::ext
    Checkout -->|"1 rates for 2.5 kg"| GW
    GW -->|"2 read API key"| Keys
    GW -->|"3 POST weight_lbs"| Carrier
    Carrier -->|"4 quotes in price_usd"| GW
    GW -->|"5 rates in your own types"| Checkout
    Returns -.->|"same interface"| GW
    classDef ext stroke-dasharray:4 4
```

```mermaid caption="Where does the test double plug in? Callers depend only on the gateway's own interface, so a fake implementing that interface substitutes for the real one and no caller changes."
flowchart LR
    App["Application code"] -->|domain call| GWI["Gateway interface"]
    GWI -.->|implemented by| Real["Real Gateway"]
    GWI -.->|implemented by| Fake["Fake Gateway, for tests"]
    Real -->|vendor protocol| Ext["External system"]
```

## Variations
<!--meta block=variations-->

- **Resource Gateway** — Wraps a non-object resource such as a file system, a hardware device, or an environment/config store, giving it an object-shaped interface.
- **Service Gateway** — Wraps a network-facing API — REST, SOAP, gRPC — hiding wire format, authentication, and retries behind plain domain method calls. A client that wraps an AI tool server, such as one speaking Anthropic's Model Context Protocol (MCP), is the same shape: the gateway turns discoverable remote tools into ordinary method calls the rest of the code can use without knowing the protocol.
- **Table Data Gateway / Row Data Gateway** — Fowler's data-layer gateways: one object per table, or one per row, standing between domain code and raw SQL.
- **Gateway plus connection object** — Split a remote gateway in two. The gateway keeps the vocabulary translation — our types in, our types out — and a thin connection object beneath it owns nothing but issuing the call and handing back the raw response. Tests then have a seam at either level: stand in for the connection and the real translation still runs, instead of disappearing behind a replacement for the whole gateway. Fowler offers it as a refinement rather than a rule, and it earns its indirection only when the translation is worth testing on its own — for a gateway that renames two fields it is a layer for nothing.
- **[Fake](../testing/fake-object.md) Gateway** — A stand-in implementation swapped in for tests, so business logic runs against a fast, deterministic double instead of the real external system.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Confines a vendor's API quirks** — auth, protocol, naming, units — to one place.
- **Domain code reads in its own vocabulary** instead of the external system's.
- **Swappable**: replace, upgrade, or fake the real system without touching callers.
- **Cushions the codebase** from the external system's changes and outages.

### Cons
<!--meta polarity=con-->

- **One more object and interface to maintain**, even when the wrap is thin.
- **A poorly scoped gateway** accretes into a dumping ground for unrelated calls.
- **Doesn't fix a genuine interface mismatch by itself** — real translation work remains.
- **A gateway that just forwards arguments 1:1** is ceremony without real insulation.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **Your code needs to call an external system**, service, or resource you don't control.
- **You want that dependency isolated for testing**, mocking, or later replacement.
- **Multiple call sites** would otherwise repeat the same protocol, auth, or error handling.

### Avoid when
<!--meta polarity=avoid-->

- **You already own both sides** — a plain function or module boundary is enough.
- **The job is conforming to one existing interface** a client expects — that's an [Adapter](../gof/structural/adapter.md), not a domain-shaped gateway.
- **You need to simplify a large subsystem's** own interface, not one you're calling out of your app — reach for a [Facade](../gof/structural/facade.md).

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — a shipping-rate gateway"
// Domain-shaped interface our application code calls
interface ShippingGateway {
  getRates(originZip: string, destZip: string, weightKg: number): Promise<Rate[]>;
}
interface Rate { carrier: string; costCents: number; etaDays: number; }

// The vendor's own client — field names and units we don't control
declare class LegacyCarrierClient {
  quoteRates(req: { origin_zip: string; dest_zip: string; weight_lbs: number }):
    Promise<{ quotes: { carrier_name: string; price_usd: number; transit_days: number }[] }>;
}

class LegacyCarrierGateway implements ShippingGateway {
  constructor(private readonly client: LegacyCarrierClient) {}

  async getRates(originZip: string, destZip: string, weightKg: number): Promise<Rate[]> {
    const raw = await this.client.quoteRates({
      origin_zip: originZip,
      dest_zip: destZip,
      weight_lbs: weightKg * 2.20462, // vendor only speaks pounds
    });
    return raw.quotes.map(q => ({
      carrier: q.carrier_name,
      costCents: Math.round(q.price_usd * 100),
      etaDays: q.transit_days,
    }));
  }
}

// Domain code never sees vendor field names, units, or protocol
const gateway: ShippingGateway = new LegacyCarrierGateway(new LegacyCarrierClient());
const rates = await gateway.getRates("94107", "10001", 2.5);
```

## In the wild
<!--meta block=wild-->

- **Martin Fowler, Patterns of Enterprise Application Architecture** — The book defines Gateway as an object that wraps access to an external system or resource behind a simple interface, so the rest of the code does not know the external API. {#wild-poeaa-gateway}
- **Active Merchant** — The Ruby library puts every payment provider behind a gateway class with a common set of methods such as `purchase` and `authorize`. {#wild-active-merchant}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **Request timeout (connect and read)** — Upper bound on how long a call to the external system may block before the gateway gives up; set too high, a slow vendor ties up callers.
- **Retry policy (count and backoff)** — How many times a failed call is retried and with what backoff; unbounded or un-jittered retries amplify load during a vendor outage.
- **Client connection pool size** — Maximum concurrent connections the gateway holds open to the vendor; it caps in-flight calls and bounds resource use.
- **Outbound rate / concurrency limit** — A ceiling on calls per interval so the gateway stays under the vendor rate limit.

### Signals to watch
<!--meta polarity=signal-->

- **External error rate** — Fraction of calls the vendor rejects or fails; the primary health signal for the dependency.
- **Call latency p99** — Tail latency of gateway calls; the external system usually dominates the caller latency budget.
- **Timeout and retry rate** — How often calls time out or get retried; a rising rate is early warning of vendor degradation.
- **Throttling (429) rate** — Rate of rate-limit rejections, indicating outbound volume exceeds the vendor quota.

### Failure modes under load
<!--meta polarity=failure-->

- **Slow vendor exhausts the client pool** — When the external system slows, in-flight calls pile up and consume every connection or thread, blocking callers waiting on the gateway.
- **Retry storm** — Retries stacked on top of a struggling vendor multiply load and delay its recovery.
- **Rate-limited under burst** — A spike of outbound calls trips the vendor quota, and the vendor starts rejecting until volume drops.
- **Cascading outage** — Without a timeout or fallback, a vendor outage propagates straight through the gateway into every caller.

### Readiness checklist
<!--meta polarity=check-->

- Set an explicit connect and read timeout on every outbound call.
- Bound retries with capped, jittered backoff and only retry idempotent calls.
- Provide a fake gateway implementing the same interface for tests.
- Wrap the gateway with a circuit breaker or fallback so a vendor outage degrades gracefully.
- Confine vendor credentials and auth to the gateway, not its callers.

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Enterprise Application Patterns](../../themes/enterprise-application-patterns.md) — Wrap an external system behind an interface shaped around your needs. {#fluency-enterprise-application-patterns}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Part of**

- [Anti-Corruption Layer](../ddd/acl.md) — An anti-corruption layer is built from gateways and translators

**Often confused with**

- [Facade](../gof/structural/facade.md) — Simplify a subsystem vs. wrap one external system
- [Adapter](../gof/structural/adapter.md) — Wrap an external system vs. convert an interface

**Prevents**

- [Static Cling](../../hazards/static-cling.md) — A wrapper object around the external system gives code a declared seam to inject and replace

**Demonstrated by**

- [Robinhood](../../designs/robinhood.md) — the uncontrolled external exchange is encapsulated behind a single controlled access point that owns delivery concerns

<!-- relationships:end -->
