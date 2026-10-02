---
title: Service Mesh
description: Moves service-to-service networking into a managed proxy layer
area: distributed-routing
owner: Oleksandr Derechei
tags: [routing, load-balancing]
status: stable
solves: ["every microservice reimplements retries, timeouts and TLS in a slightly different way", I want encryption and identity between all our services without editing thirty codebases, we have no consistent view of latency and traffic between our hundreds of services, rolling out a canary means writing custom routing logic in every service, our services are in five languages and each one reinvents the same networking boilerplate]
---

# Service Mesh

Lifts networking concerns — mutual Transport Layer Security (TLS), retries, timeouts, load balancing, and telemetry — out of every service and into a fleet of proxies deployed beside them, all programmed from a central control plane.

## What it is
<!--meta block=description-->

A **service mesh** is a dedicated infrastructure layer that takes over communication between services. It has two halves: a **data plane** of proxies — one deployed beside every service instance — that carries all inbound and outbound traffic, and a **control plane** that configures those proxies but never touches a packet itself. The application dials its local proxy over localhost and is otherwise unaware the mesh exists.

The force it resolves is **duplicated networking logic across a fleet**. In a large microservice system almost every service needs the same set of concerns — mutual TLS, retries, timeouts, load balancing, circuit breaking, and request-level metrics and tracing. Building those as an in-process library means one implementation per language and a lock-step redeploy of every service whenever the library changes; scattering them by hand means they drift out of sync and no two services behave alike. A mesh moves that behaviour out of the app entirely, into a uniform proxy layer whose policy lives in one place and applies to the whole fleet regardless of what language each service is written in.

The split between the two planes is the crux. The control plane holds the desired state — routing rules, security policy, service identity, certificates — and pushes it out to the proxies; the proxies enforce it in the request path. Because the control plane sits outside the data path, it can be updated, restarted, or briefly unavailable without stopping traffic that is already flowing. The "mesh" is the woven layer of proxies through which every request travels.

## Explained
<!--meta block=explain-->

A service mesh puts a proxy beside every service instance to carry all of its traffic, plus a control plane that configures those proxies and never touches a request itself, so retries, encryption and metrics behave the same in every service with no code change. Without it, you write a networking library once per language and redeploy every service whenever it changes, or each team builds its own and they drift apart. Choose it over a library, or over single proxies used alone, when the fleet is large enough that traffic policy must be governed centrally: canary splits, fault injection, mutual TLS (both sides prove who they are) and service identity applied across teams that never deploy together. It costs four things. You run, secure and upgrade a control plane and a proxy per instance, so adopt it only when the shared work outweighs that. Two extra hops per call and memory on every instance add up, so measure them on your hottest path first; a node-level data plane without per-instance proxies lowers the cost but isolates workloads less. Every incident gains a third suspect, so keep proxy metrics beside the application's. One bad policy pushed centrally can stop all traffic, so roll policy out to a small share first.

**Example.** A fleet has 300 instances, each with a proxy using 100 MB, so the mesh holds 30 GB. Assume each proxy adds 1 ms, so a call costs 2 ms, and a request that makes 4 calls costs 8 ms more. In return, rotating every certificate is one change in the control plane with no redeploy. A policy that denies all traffic would hit all 300 instances at once, so you push it to 5% first, 15 instances, and catch it within a minute instead of during a full outage.

## How it works
<!--meta block=structure-->

```mermaid caption="How does one policy edit take hold on every service without redeploying any of them? The control plane pushes config to the proxies out of band (2, 3) and then stays out of the way, so every request crosses two proxies (4–6) — which is where both the mutual TLS and the extra hop come from."
flowchart TB
    Desired[("Routes, policy, workload identity")]
    CP["Control plane"]
    subgraph Path["The request path — the control plane is not in it"]
        A["Service A"]
        PA["Proxy A"]
        PB["Proxy B"]
        B["Service B"]
    end
    Desired -->|"1 read the desired state"| CP
    CP -->|"2 push config"| PA
    CP -->|"3 push config"| PB
    A -->|"4 call out over localhost"| PA
    PA -->|"5 mutual TLS, with the pushed timeout and retries"| PB
    PB -->|"6 hand to the app over localhost"| B
```

## Variations
<!--meta block=variations-->

- **[Sidecar](./sidecar.md) data plane** — The classic model: a full proxy runs as a sidecar in every pod or on every host. Highest fidelity and per-service isolation, but also the highest cost — one extra process, and one extra hop, per instance.
- **Sidecarless / node-level data plane** — Instead of a proxy per instance, a shared agent per node handles mesh traffic — via a node-level proxy or eBPF in the kernel. It cuts the per-pod overhead of the sidecar model at the price of weaker per-workload isolation.
- **Proxyless / library mesh** — The application links a library that speaks the control plane's configuration protocol directly (for example gRPC consuming xDS), skipping the extra network hop — at the cost of coupling the app back to a language-specific client.
- **Multi-cluster mesh** — A single control-plane domain spans several clusters or networks, with dedicated east-west gateways bridging them, so identity and policy stay uniform across cluster boundaries.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Applies mutual TLS**, retries, timeouts, load balancing, and circuit breaking uniformly to every service without touching app code or language.
- **Routing, security, and resilience policy** live in one place and take effect fleet-wide.
- **Golden metrics**, distributed traces, and a live traffic topology come from the proxies for free.
- **Enables a zero-trust posture**: automatic mutual TLS and workload identity between services.
- **Progressive delivery** — canary releases, traffic splitting, fault injection — is controlled declaratively.

### Cons
<!--meta polarity=con-->

- **A whole control plane** plus a proxy per instance to run, secure, upgrade, and debug — significant operational weight.
- **Every hop pays proxy-in and proxy-out latency**, and per-instance CPU and memory multiplied across the fleet is a real cost.
- **Steep learning curve**, and one bad policy pushed centrally can break all service-to-service traffic at once.
- **Adds a layer to every incident**: is the fault in the app, the proxy, or the control plane?
- **Overkill below a certain fleet size** — the machinery costs more than it saves for a handful of services.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **You run many**, often polyglot, services and want consistent mutual TLS, retries, timeouts, and observability without editing each one.
- **You need fleet-wide traffic policy** — canary rollouts, traffic splitting, fault injection, or zero-trust identity between services.
- **You already run an orchestrator** such as Kubernetes that can inject and co-schedule the proxies.

### Avoid when
<!--meta polarity=avoid-->

- **You have only a handful of services** — a shared library or a single gateway is simpler and far cheaper.
- **The latency budget is tight** enough that an extra proxy hop each way is unacceptable.
- **You lack the operational capacity to run**, secure, and upgrade a control plane.
- **Your needs are north-south only** (traffic at the edge); an [API gateway](./api-gateway.md) already covers them without east-west machinery.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — a data-plane proxy applying control-plane policy to an outbound call"
type Policy = { timeoutMs: number; retries: number };

// One data-plane proxy rides beside each service. The app dials it over
// localhost; the proxy applies whatever policy the control plane has pushed,
// then forwards to the destination's proxy.
class MeshProxy {
  // Pushed by the control plane at runtime — the app never sees it.
  private policy: Policy = { timeoutMs: 1000, retries: 2 };
  applyConfig(p: Policy) { this.policy = p; }

  async forward(target: string, body: unknown): Promise<Response> {
    const { timeoutMs, retries } = this.policy;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const start = performance.now();
      try {
        // mTLS, load balancing, and routing also live here — never in the app.
        const res = await fetch(target, {
          method: "POST",
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        this.record(target, res.status, performance.now() - start);
        return res;                    // success — no retry needed
      } catch (err) {
        lastErr = err;                 // retried transparently; app unaware
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr;
  }

  // Golden metrics for every hop, emitted uniformly across the whole fleet.
  private record(target: string, status: number, ms: number) {
    console.log(`out ${target} ${status} ${ms.toFixed(1)}ms`);
  }
}
```

## In the wild
<!--meta block=wild-->

- **Istio** — The most widely deployed mesh; an Envoy sidecar in every pod forms the data plane while the istiod control plane distributes routing, policy, and workload certificates. Provides mutual TLS, traffic splitting, and fault injection, and also offers a sidecarless ambient mode. {#wild-istio}
- **Linkerd** — A CNCF-graduated mesh that uses its own lightweight Rust micro-proxy (linkerd2-proxy) rather than Envoy; mutual TLS between meshed services is on by default, and it exposes golden metrics per service. {#wild-linkerd}
- **Consul** — HashiCorp Consul pairs its service catalog with Envoy sidecars to provide mutual TLS and intention-based authorization between services across virtual machines (VMs) and Kubernetes. {#wild-consul}
- **Cilium** — Uses eBPF in the Linux kernel to deliver mesh features — identity-based policy, mutual TLS, and Hubble observability — with a node-level data path rather than a per-pod sidecar. {#wild-cilium}

## In production
<!--meta block=production-->

### Tuning knobs
<!--meta polarity=knob-->

- **Sidecar resource requests and limits** — CPU and memory reserved for each proxy independently of the app; multiplied across every instance, this is the mesh baseline cost.
- **Per-destination timeouts, retries, and connection pools** — The request timeout, retry count and budget, and connection-pool sizes each proxy enforces toward an upstream service.
- **mTLS mode and certificate lifetime** — Strict versus permissive mutual TLS between services, and how often workload certificates are rotated.
- **Outlier detection thresholds** — The consecutive-error count and maximum ejection percentage the proxies use to eject and later re-admit unhealthy upstream hosts.
- **Trace sampling rate** — The fraction of requests traced, since emitting a span for every hop at full rate is expensive at fleet scale.

### Signals to watch
<!--meta polarity=signal-->

- **Proxy overhead per instance** — CPU and memory each sidecar consumes relative to its app; multiplied across the fleet it is the real cost of the pattern.
- **Added hop latency** — The p99 latency the proxy adds routing in and out of a service versus a direct call.
- **Config propagation lag** — Time for a control-plane change to reach every proxy; long convergence means proxies are running divergent config.
- **mTLS handshake failures and certificate expiry** — Failed handshakes or certificates approaching expiry warn of an imminent fleet-wide outage.

### Failure modes under load
<!--meta polarity=failure-->

- **Control-plane outage** — Proxies keep last-known config, but new instances cannot fetch config and certificate rotation stalls, so scaling and rollouts break even while existing traffic still flows.
- **Blast radius of a bad config** — One faulty policy pushed centrally reaches every proxy at once and can break all service-to-service traffic simultaneously.
- **Proxy resource exhaustion under spike** — A traffic surge starves the sidecar of CPU or memory, and because it fronts the app, requests are dropped or delayed at the proxy.
- **Certificate expiry** — Workload certificates lapse without rotation and every service-to-service call fails mutual TLS at once.

### Readiness checklist
<!--meta polarity=check-->

- Sidecar resource requests and limits are set, measured, and multiplied across the fleet before rollout
- mTLS mode and certificate rotation are configured, and certificate expiry is monitored and alerted
- The control plane runs with multiple replicas, and proxies are verified to keep serving during a control-plane outage
- Config changes ship through a staged or canary rollout, not a single fleet-wide push, given the blast radius
- Golden metrics, tracing, and per-proxy overhead dashboards are in place before onboarding services

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [Cloud Native](../../../themes/cloud-native.md) — Traffic policy moved out of the application {#fluency-cloud-native}
- [Microservices Design](../../../themes/microservices-design.md) — The same proxies fleet-wide, driven by a control plane {#fluency-microservices-design}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [API Gateway](./api-gateway.md) — The gateway owns north-south edge traffic; the mesh owns east-west
- [Retry with Backoff](../resilience/retry-backoff.md) — Retry policy is configured in the proxy, not written in the app
- [Timeout / Deadline](../resilience/timeout-deadline.md) — Per-route deadlines are enforced by the proxy for every service
- [Circuit Breaker](../resilience/circuit-breaker.md) — The sidecar trips on a failing instance, so no application codes the breaker itself
- [Load Balancer](./load-balancer.md) — Balancing across instances happens per caller in the sidecar, not at one central hop
- [Identity Is the Perimeter](../../../principles/identity-as-perimeter.md) — The mesh issues and rotates the workload identity this depends on
- [Distributed Tracing](../resilience/distributed-tracing.md) — Emitting a span per hop is one of the things a mesh gives you for free at the network layer

**Composed of**

- [Sidecar](./sidecar.md) — A service mesh is built from a sidecar proxy beside every service instance, programmed by a shared control plane.
- [Service Discovery](./service-discovery.md) — Resolution is one of the concerns the mesh's data plane takes over

<!-- relationships:end -->
