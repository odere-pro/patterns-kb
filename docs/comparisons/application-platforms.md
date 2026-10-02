---
title: Application Platforms
description: "Heroku, Render, Fly.io, the cloud's own platforms and self-hosted PaaS — how much operating you are buying out of"
area: comparisons
owner: Oleksandr Derechei
tags: [operations, cloud]
status: stable
aliases: [Heroku, Render, Fly.io, PaaS, platform as a service]
solves: [we have no one to operate servers and need this deployed by Friday, our platform bill has outgrown what the same thing would cost as containers, we want to leave our hosting platform without rewriting how we deploy, which managed platform will not trap us when we outgrow it, we need a private network and the platform we picked cannot reach one]
---

# Application Platforms

Products that take a repository and give back a running, routable, TLS-terminated service — and differ mainly in how much of the operating you are buying out of, and what it costs you to leave.

## The decision
<!--meta block=description-->

Every product here answers the same question: given source code, produce something on the internet. What separates them is where the line is drawn. All of them build an artifact, run it, route traffic to it, terminate Transport Layer Security (TLS) and hold your configuration and secrets. Beyond that line the differences are real and they compound — how you scale, what a database costs, whether you can reach a private network, and how much of the setup survives leaving.

The deciding variable is usually not features but **who is going to operate it**. A platform's whole value proposition is denominated in engineer-hours you do not spend, so it is a good deal exactly while those hours are scarcer than the price premium. That ratio inverts as a team grows, which is why platforms are so often the right first answer and the wrong fifth one.

The second variable is **the exit**. A platform that runs an ordinary container image on ordinary managed databases can be left in a sprint. One whose value comes from its own build system, its own add-on marketplace and its own routing semantics cannot, because none of that describes anything a different platform understands. Ask the leaving question before adopting rather than after, since the answer does not change and the cost of learning it late is the whole migration.

Pricing on this page moves faster than anything else about it, and free tiers in this category have been withdrawn before. Treat every price statement here as needing verification against the vendor's current page, and treat a plan whose economics only work on a free tier as a plan with a dependency on someone else's business decision.

## Explained
<!--meta block=explain-->

An application platform takes your source code and gives back a running service on the internet, with the build, routing, TLS and secrets handled. The products differ in who does the operating, so the choice turns on that, not on features. Default to your existing cloud's own platform when you have one, because your data, identity and private network are already there. For new work with an unknown future, pick a container-native platform, which runs a standard container image and so lets you leave cheaply. A platform with its own build system and add-ons is fastest to start on and hardest to leave, so choose it only when speed to first deploy dominates. Three conditions override the rest. If you need something the platform does not model, such as a local disk, a non-HTTP protocol or a GPU, run the orchestrator yourself. If traffic is bursty with real idle time, let scale-to-zero, paying nothing while no request arrives, filter the list first. And self-hosting to save money before you can operate it only moves the work, because the platform was doing it.

**Example.** Illustrative numbers. A platform costs 400 dollars a month more than the equivalent raw servers. Running the same setup yourself takes 8 hours a month of an engineer's time, valued at 80 dollars an hour, or 640 dollars. The platform wins, and the break-even is 400 divided by 80, or 5 hours a month. If you later cut that work to 3 hours, or 240 dollars, running it yourself wins. The cost you accept up front is the exit: if the app runs as a standard image, leaving takes about a sprint, and with the platform's own build system and add-ons it takes a rebuild.

## The contenders
<!--meta block=contenders-->

- **Heroku** — The product that defined the category and supplied its vocabulary — dynos, buildpacks, add-ons, and the twelve-factor discipline that came out of operating it. Proprietary, owned by Salesforce. Push a repository, a buildpack detects the language and produces a runnable artifact, and an add-on marketplace supplies databases and everything else. Its abstractions are the highest-level here, which is both why it is the fastest to start on and the hardest to leave.
- **The cloud's own platforms** — AWS Elastic Beanstalk and App Runner, Azure App Service and Container Apps, Google Cloud Run and App Engine. Proprietary and billed by usage, and the reason to prefer one is rarely the platform itself — it is that your data, your identity model and your private network are already there, so the platform is inside the perimeter instead of calling into it.
- **Container-native platforms** — Render, Railway, Fly.io and similar: proprietary services that take a repository or an image, run it as a container, and add managed databases and private networking around it. The differentiator against the older generation is that the unit is a standard container image, so what you build here also runs anywhere else — which is what makes the exit cheap.
- **Self-hosted PaaS** — Dokku, Coolify, CapRover and the Kubernetes-based platforms such as Knative: open-source software you run on your own machines to get a platform experience on top of them. You pay the server bill and the operating cost, and in exchange there is no per-service premium and no vendor to be repriced by. Worth it when you already run infrastructure; a poor trade when you do not.
- **Orchestration you run yourself** — Not a platform at all, and the honest comparison point at the bottom of the range: a Kubernetes cluster plus the ingress, certificates, pipeline and observability that a platform would have handed you. Everything is possible and nothing is provided, which is the correct trade once you have a team whose job this is.

## How they compare
<!--meta block=matrix-->

| Criterion | Heroku | Cloud's own platform | Container-native | Self-hosted PaaS |
| --- | --- | --- | --- | --- |
| What you hand it | a repository | a repository or an image | a repository or an image | a repository or an image |
| Deployable unit | the platform's own artifact | image, or a runtime bundle | a standard container image | a standard container image |
| Cost of leaving | high — build, add-ons and routing are all its own | moderate — inside one provider | low — the image runs anywhere | low — you already run it |
| Who operates it | the vendor | the provider | the vendor | you |
| Reaches your existing private network | an add-on concern | yes, natively | varies by product | yes, it is your network |
| Scale to zero | no | yes on the request-driven products | varies by product | only with a platform that supports it |
| Where databases come from | the add-on marketplace | the provider's managed databases | the platform's own managed offerings | you run them, or rent them elsewhere |
| Compliance and residency control | limited to the vendor's regions | full, via the provider's controls | limited to the vendor's regions | full — it is your hardware or account |
| What the premium buys | the most operating removed | integration with what you already run | operating removed without lock-in | nothing — you traded money for time |

## Choosing
<!--meta block=choosing-->

Start with the null option, which here is unusually strong: if your workload already lives on one cloud, that cloud's own platform is the default and the burden of proof is on anything else. Your data, identity and private network are already there, the bill is one bill, and the platform is inside the perimeter rather than punching through it. Nothing below beats that unless it answers a question this does not.

Choose a container-native platform when you want the operating removed but not the option to leave. The unit of deployment is a standard image, so the platform is a convenience layer over something portable — which makes it the best default for a new product whose future infrastructure you cannot yet predict, and the reason this category has largely displaced the older one for greenfield work.

Choose the highest-level proprietary platform when speed to first deploy genuinely dominates and the application is conventional. Its abstractions are the most opinionated on offer, and for a small team shipping a standard web application that is a real advantage rather than a compromise. Go in knowing the exit is expensive: the build system, the add-ons and the routing are all its own, so leaving is a rebuild rather than a redeploy.

Choose self-hosted when you already operate infrastructure and the per-service premium has become a visible line item, or when residency and compliance rule out the alternatives. The mistake is adopting it to save money before you have the operational capability, because the platform you are replacing was doing work that does not stop being necessary once you stop paying for it.

Two conditions override everything above. If any of your services needs something the platform does not model — a persistent local disk, a non-HTTP protocol, a sidecar, a GPU — then a platform that abstracts those away is not a simplification but an obstacle, and running the orchestrator yourself is the honest answer. And if the workload is bursty and request-driven with real idle periods, scale-to-zero is worth more than every other criterion combined, so let the products that offer it filter the list before you compare anything else.

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Specializes**

- [Compute](../capabilities/compute.md) — The managed-platform product decision inside the compute capability

**Requires**

- [Stateless Service](../patterns/distributed/routing/stateless-service.md) — The platform replaces instances freely, so anything held in a process is lost

**Implements**

- [Autoscaling](../patterns/distributed/routing/autoscaling.md) — Scaling on request rate or concurrency is the platform's job, configured rather than built

<!-- relationships:end -->
