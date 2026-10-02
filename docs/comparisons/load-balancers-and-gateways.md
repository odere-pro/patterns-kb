---
title: "Load balancers, proxies & gateways"
description: "What sits in front of your services — the cloud's own balancer, NGINX, HAProxy, Traefik, Envoy or an API gateway"
area: comparisons
owner: Oleksandr Derechei
tags: [routing, load-balancing, cloud, edge]
status: stable
aliases: [nginx, haproxy, envoy, traefik, kong, alb]
solves: [I cannot tell whether our own proxy or the cloud's balancer should sit in front of services, every service reinvents auth and rate limiting at its front door, we need TLS termination and routing on Kubernetes, one server is overloaded and I do not know whether to buy a cloud balancer or run a proxy, our proxy config is a file we edit and reload every time a service moves]
---

# Load balancers, proxies & gateways

Six ways to answer on port 443 in front of your services — a managed cloud balancer, NGINX, HAProxy, Traefik, Envoy or Kong — what each is good at, and when the cloud's own balancer already ends the argument.

## What this compares
<!--meta block=description-->

Whatever answers on port 443 in front of your services does some mix of three jobs: spreading requests over instances, terminating Transport Layer Security (TLS) and routing on host and path, and enforcing who may call and how often. [Load Balancer](../patterns/distributed/routing/load-balancer.md), [Reverse Proxy](../patterns/distributed/routing/reverse-proxy.md) and [API Gateway](../patterns/distributed/routing/api-gateway.md) name those jobs, and every product here does at least two — which is why the category reads as one confusing shelf.

The choice splits on two questions. Who runs it: a managed balancer scales, patches and fails over without you, configured through the same API as the rest of your [networking](../capabilities/networking.md), while a self-run proxy is a process you size, watch and upgrade. And how it learns routes: from a file you reload, or from discovery and a control plane that moves routes while traffic flows.

Policy is the third question, and teams meet it late. A plain proxy balances and routes; a gateway adds authentication, quotas and [rate limiting](../patterns/distributed/resilience/rate-limiter.md) at the edge, so services behind it stop shipping their own copy of that code. You pay one more hop that can fail and one more place that holds configuration.

## Explained
<!--meta block=explain-->

Whatever answers on port 443 in front of your services does some mix of three jobs: spreading requests over instances, ending the TLS encryption and routing by host and path, and enforcing who may call and how often. The products blur these jobs, so choose on who runs it, how it learns routes, and what policy it enforces. In a public cloud, front your services with the cloud's own balancer first, because it scales, patches and fails over without you. Reach for a self-run proxy only for a feature it lacks, and put that proxy behind the cloud balancer. Choose a gateway over a plain balancer when the job is a front door for outside callers: keys, per-caller quotas and request reshaping, so services behind it stop shipping their own copy. Three costs follow. It is one more hop that can fail, so run at least two copies. It is one more place that holds configuration, so keep the config in version control and review it. And a self-run proxy is a process you size, watch and upgrade, so pick the managed one unless that work buys you something.

**Example.** Three instances sit behind a balancer taking 300 requests a second. One crashes. The balancer checks health every 5 seconds and marks an instance down after 2 failed checks, so it keeps sending traffic for about 10 seconds. A third of requests, 100 a second, hit the dead instance, and 10 seconds of that is 1,000 failed requests. A retry on a different instance turns most of those into slower successes. The cost of the retry is extra load on the 2 survivors, now carrying 150 a second each, so keep headroom for it.

## The contenders
<!--meta block=contenders-->

- **Cloud-native load balancer** — The provider's own: AWS Application Load Balancer (ALB) at L7 and NLB at L4, Azure Application Gateway with Front Door at the global edge, Google Cloud Load Balancing on an anycast address. Proprietary metered services the provider scales and patches, so you configure rules and never see a process.
- **NGINX** — BSD-2-Clause, stewarded by F5. Web server, reverse proxy and L7 balancer in one, driven by a static config file you reload on change; runtime reconfiguration and richer health checks sit in the commercial NGINX Plus. You run it, and most engineers already read its config.
- **HAProxy** — GPLv2 core, HAProxy Enterprise commercial. The TCP and HTTP balancing specialist: efficient under load, with the richest health-checking here. You run it, and it never pretends to be a web server.
- **Traefik** — MIT. Discovers routes from Kubernetes resources and Docker labels rather than a file, so a deploy publishes its own route, and it renews ACME/Let's Encrypt certificates itself. You run it, and stop writing the config that caused your reload incidents.
- **Envoy** — Apache-2.0, a CNCF (Cloud Native Computing Foundation) project. The dynamic-config proxy: listeners, routes and clusters arrive from a control plane over the xDS APIs, and every request is counted and traceable. You rarely run raw Envoy — it reaches you as the data plane of a mesh such as Istio.
- **Kong Gateway** — Apache-2.0 OSS core with a commercial enterprise tier, built on NGINX and OpenResty. An API gateway rather than a balancer: authentication, rate limiting and transformation are plugins you enable per route. Managed equivalents are Amazon API Gateway, Azure API Management and Apigee.

## How they compare
<!--meta block=matrix-->

| Criterion | Cloud balancer | NGINX | HAProxy | Traefik | Envoy | Kong |
| --- | --- | --- | --- | --- | --- | --- |
| Layer | L4 and L7, separate products | L7, plus TCP/UDP stream | L4 and L7, both first-class | L7, plus TCP/UDP routers | L4 and L7 filter chains | L7 only |
| Who scales and patches it | The provider | You | You | You | You, usually through a mesh | You, or its vendor's cloud |
| License | Proprietary, metered | BSD-2-Clause | GPLv2 core | MIT | Apache-2.0 | Apache-2.0 core, paid tier |
| Gateway policy out of the box | Thin; the managed gateway carries it | Auth and rate-limit modules | Stick-table rate limiting, no auth | Middlewares: auth, rate limit, headers | Filters: JSON Web Token (JWT), external authz, rate limit | Its whole purpose, as plugins |
| How routes change | An API or IaC change | Edit the file, reload | Edit the file, reload | Discovered from labels and Kubernetes objects | Pushed by a control plane over xDS | Admin API or declarative config |
| Kubernetes fit | Provisioned by the cloud's own controller | ingress-nginx, the common default | Ingress controller available | Native: reads Ingress and Gateway API | Data plane for Istio and gateways on it | Kong Ingress Controller |
| Observability | Provider metrics and logs, no agent | Access logs; detailed metrics in Plus | Stats page and Prometheus endpoint | Dashboard, Prometheus metrics, tracing | Per-request stats and tracing, its strength | Metrics and tracing plugins |
| Extension model | Rule syntax; add a hop for the rest | C modules, njs, Lua via OpenResty | Lua, and agents over SPOE | Middleware chain plus plugins | Lua and WebAssembly filters | Lua plugins, SDKs for other runtimes |
| What you actually pay | Per hour plus traffic, no team | Instances, plus config expertise | Instances; least CPU per request here | Instances, plus trust in discovery | Instances, plus a control plane | Instances, plus a datastore or config pipeline |

## Choosing between them
<!--meta block=choosing-->

In a public cloud, front your services with the native balancer first. It sits in your network already, absorbs a spike without a capacity plan and fails over without paging anyone — reach for a self-run proxy only for a feature it genuinely lacks, and put that proxy behind the cloud balancer.

Run NGINX or HAProxy when you own the edge and want boring and proven. Choose Traefik when routes change faster than you want to edit config, which on Kubernetes is most weeks. Choose Envoy when you need config pushed at runtime and per-request telemetry, and take it through a mesh or a gateway built on it — hand-writing xDS is a project of its own.

Choose Kong when the job is an API product front door rather than traffic spreading: issuing keys, enforcing a quota per consumer, reshaping requests for clients you do not control. If you would rather not operate that front door, the managed equivalents do it at a per-request price.

Do less first. DNS round-robin, or one reverse proxy on one machine, carries more traffic than most services ever see and costs nothing to operate. Move to health-aware balancing when a dead instance keeps receiving requests, and to a gateway when the third service copies the same auth and throttling code.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Specializes**

- [Networking](../capabilities/networking.md) — Zooms in on the edge of the networking capability: which balancer or proxy answers on port 443.

**Implements**

- [Load Balancer](../patterns/distributed/routing/load-balancer.md) — Every product here is a load balancer first — the comparison is who runs it and at which layer.
- [API Gateway](../patterns/distributed/routing/api-gateway.md) — Kong and the managed API gateways are this pattern sold as a product; a plain proxy is not.
- [Reverse Proxy](../patterns/distributed/routing/reverse-proxy.md) — NGINX, HAProxy, Traefik and Envoy are the reverse proxies you would actually deploy.
- [Rate Limiter](../patterns/distributed/resilience/rate-limiter.md) — Gateways enforce quotas at the edge, so the services behind stop shipping their own limiter.

<!-- relationships:end -->
