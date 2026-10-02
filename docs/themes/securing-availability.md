---
title: Securing Availability
description: The security controls you adopt because a compromise or an expiry is an outage
area: themes-operating
owner: Oleksandr Derechei
tags: [security, access-control, availability, isolation]
status: stable
---

# Securing Availability

Reading security as a reliability concern: which controls exist because a breach, a leaked credential or an expired secret would take the system down, and where each one is enforced.

## The question
<!--meta block=description-->

Security is usually argued as confidentiality: keep the data from people who should not see it. Availability makes the same controls arrive from a different direction. A compromised component is unavailable, because you have to take it away to contain it. A credential that expires unnoticed is an outage with no attacker involved at all. And a request that reaches the application without being screened is capacity spent on someone who was never a customer.

Reading the controls that way changes which ones matter and how they are judged. The question is not only whether a control keeps an attacker out; it is how wide the damage is when something does go wrong, and whether the control can itself fail in a way that stops the system serving.

Two properties do most of the work. Every component gets only the access its job needs, so a compromise anywhere is bounded by what that component could reach rather than by what the credential could have reached. And every request enters through one screened path, so screening and rate limiting are guarantees rather than habits — which only holds if the components behind reject anything that arrived another way.

Long-lived shared secrets are where this theme differs most sharply from an access-control discussion. A key held once and referenced by every part of the system is a coordination problem waiting to become an incident: it expires or is rotated, and everything that used it fails in the same minute. Short-lived, narrowly scoped credentials issued per use turn that class of failure from total into local.

The controls have their own failure modes, and they are the ones people forget to plan for. A certificate that lapses takes the service down while every component reports healthy. A blanket rate limit protects the platform and locks out the legitimate burst it could have served. And error responses are a real trade rather than a formality: a stack trace helps an attacker map the system, a bare failure leaves support with nothing, and returning a correlation identifier the caller can quote gives the operator the whole story without giving the attacker anything.

## Explained
<!--meta block=explain-->

Security controls matter for uptime as well as secrecy, because a compromised part must be pulled out and an expired credential stops a service with no attacker involved. Judge each control twice: by what it stops, and by what its own failure costs. Give every component only the access its job needs, so a break-in is limited to what that component could reach. Send every request through one screened entry, and have the parts behind it refuse anything that came another way. The trade that decides most designs is scope against operability. Narrow, short-lived credentials limit the damage from one theft, and they multiply what you must issue and monitor. One shared long-lived key is easy to run until the day it expires and everything using it fails together. Choose short-lived tokens issued per use when many components share a secret. Keep the token issuer highly available, and watch certificate expiry dates, since a lapsed certificate takes a service down while every part reports healthy. Return an error identifier the caller can quote, and keep the detail where only operators read it.

**Example.** Thirty services share one API key valid for 365 days. A leak exposes all 30, and on expiry day all 30 fail in the same minute. Switching to tokens that last 1 hour, each service asks for 24 a day, 720 requests a day to the issuer. A stolen token opens one service for under an hour. The cost is the issuer: if it is down for an hour, every token lapses and all 30 services lose access, so you run it as a critical service.

## The tradespace
<!--meta block=tradespace-->

The first tension is that a control which cannot fail open cannot fail at all without stopping the system. Screening every request at one place is what makes the guarantee real, and it means the screen is now on the critical path: when it is wrong, nothing gets through. Every control worth having has to be judged twice — once for what it prevents and once for what its own failure costs. A pre-release hold such as [Quarantine](../patterns/security/quarantine.md) shows both sides: a public image or package is scanned before any pipeline may use it, which stops a known vulnerability from reaching production, and the checks take minutes to hours, so a new artifact waits, which people end the gate over if you do not request ahead.

The second is scope against operability. Narrow, short-lived, per-component credentials bound the damage from any single compromise and multiply the number of things that must be issued, refreshed and monitored. One shared long-lived key is trivially operable right up to the day it expires, at which point every component that used it fails together.

The third is how much a failure is allowed to say. Detailed errors help legitimate callers and hand an attacker a map of the internals; opaque errors give nothing away and leave support unable to answer a customer. The resolution is not a compromise between the two but a redirection: return an identifier the caller can quote, and keep the detail where only an operator can read it.

**Bound the blast radius of a compromise, and check that the control itself is not the next outage.**

## The tour
<!--meta block=tour-->

<!-- tour:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

### [Least Privilege](../patterns/security/least-privilege.md) {#tour-least-privilege}

The control that decides how large every other failure is. A component that can only do its own job means a compromise, a bug or a bad deployment is limited to that job — which is why a worker that reads from a channel should not be able to publish to it, and a cluster that pulls images should not be able to push them.

### [Single Access Point](../patterns/security/single-access-point.md) {#tour-single-access-point}

One guarded way in is what turns screening from a habit into a guarantee. The part people skip is the other half: the components behind have to reject anything that did not come through it, or a leaked backend address is an unscreened route straight to the application.

### [Gatekeeper](../patterns/distributed/routing/gatekeeper.md) {#tour-gatekeeper}

Sitting at that entry point, it does the actual screening — malformed requests, known attack signatures, floods — before they consume a connection, a thread or a query anywhere behind it. Availability is the point: work rejected at the edge is capacity the real users keep.

### [Federated Identity](../patterns/distributed/coordination/federated-identity.md) {#tour-federated-identity}

Trusting an identity provider's assertion rather than storing credentials removes a whole class of secret to leak, expire or rotate. The trade is explicit: fewer secrets in your system, and a hard dependency on the provider's availability during the operations that need a token.

### [Valet Key](../patterns/distributed/routing/valet-key.md) {#tour-valet-key}

A narrow, time-limited token scoped to one resource and one action means a leaked credential exposes little and stops working by itself. It is also the answer to the rotation problem: a credential that was always short-lived never needs a coordinated rotation across every component that held it.

### [Intercepting Validator](../patterns/security/intercepting-validator.md) {#tour-intercepting-validator}

Input that reaches business logic before being checked is input that can consume expensive work on its way to being rejected. Validating at the boundary is both a correctness control and a cheap way to keep a malformed flood from becoming load.

### [Quarantine](../patterns/security/quarantine.md) {#tour-quarantine}

Every image, package and module a pipeline references crosses your trust boundary, and a bad one costs you an outage later. An artifact waits in isolation until checks mark it trusted, so what reaches release has been looked at.

### [Secure Logger](../patterns/security/secure-logger.md) {#tour-secure-logger}

Diagnosing an incident needs generous logging, and generous logging is how credentials and personal data end up in a log store. Redacting at the point of writing is what lets a team turn detail up during an incident without the cleanup being a second incident.

<!-- tour:end -->

## When to reach for what
<!--meta block=decide-->

| If you need… | Availability reason | Reach for |
| --- | --- | --- |
| A compromise to stop at one component | Bound the blast radius | [Least Privilege](../patterns/security/least-privilege.md) |
| Screening that nobody can route around | One way in | [Single Access Point](../patterns/security/single-access-point.md) |
| Attack traffic rejected before it costs capacity | Work you never do | [Gatekeeper](../patterns/distributed/routing/gatekeeper.md) |
| Fewer secrets that can expire and take everything down | Do not hold them | [Federated Identity](../patterns/distributed/coordination/federated-identity.md) |
| Credentials that expire without a coordinated rotation | Short-lived by design | [Valet Key](../patterns/distributed/routing/valet-key.md) |
| Malformed input stopped before it reaches logic | Cheap rejection | [Intercepting Validator](../patterns/security/intercepting-validator.md) |
| Public images and packages checked before a pipeline can use them | Hold, scan, then release | [Quarantine](../patterns/security/quarantine.md) |
| To log freely during an incident | Redact on write | [Secure Logger](../patterns/security/secure-logger.md) |

## Related areas
<!--meta block=siblings-->

- [Auth & Access](./auth-and-access.md) — The identity mechanics themselves — who you are, what you may do, and how a session carries it. Read that one for the how; this one is about what a failure of it costs.
- [Operating a Live System](./operating-a-live-system.md) — Where credential rotation actually happens, and why the shared long-lived key is the one that hurts.
- [Global Traffic & Ingress](./global-traffic-and-ingress.md) — The entry point this theme wants screening at, and the routing job it does at the same time.
- [Spike Handling](./spike-handling.md) — A flood is a flood whether it is malicious or a launch, and several of the same controls answer both.
