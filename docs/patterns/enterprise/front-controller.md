---
title: Front Controller
description: One handler receives every request and dispatches it to the code that answers it
area: enterprise
owner: Oleksandr Derechei
tags: [api-design, decoupling]
status: stable
solves: [every page repeats the same login and logging code and one of them forgot it, adding a new URL means copying the same setup lines into another handler, I need one place to change how requests are routed and checked, error handling differs from page to page because each handles its own request]
---

# Front Controller

A front controller is a single handler that every web request passes through first: it does the work common to all requests, then chooses and runs the command that answers this one.

## What it is
<!--meta block=description-->

When each page or endpoint handles its own request, every one repeats the login check, the locale, the logging and the error page, and the one that forgets leaks. A front controller is one entry point for all requests. It runs the shared steps once, picks the handler from the request, and runs it. Add a route and you add a handler, not another copy of the plumbing.

## Explained
<!--meta block=explain-->

A front controller sends every request through one handler that runs the steps all requests share, such as login, locale and logging, then looks up the command that answers this request and runs it. Without it, each page carries its own copy of those steps, so the one page that forgets the login check is an open door. With it, you write each step once and a handler holds only what is special to its URL. Choose it over a page controller (one controller per page) once the shared steps are more than a few lines or change often. It is the web-request form of the [chain of responsibility](../gof/behavioral/chain-of-responsibility.md) idea, and in a framework with [MVC](../architecture/mvc.md) you usually get one already.

- **Everything crosses it.** A slow or buggy shared step hits every request, so keep the controller thin and time each step.
- **God-object drift.** Special cases accrue in it; move each concern into its own filter instead of another branch.
- **Indirection.** You must read the route table to find the code for a URL; generate a route list to help.

**Example.** A site has 40 pages. Each page controller repeats a 12-line block: check the session, set the locale, write a log line. A new page forgets the session check and exposes order history for three weeks. A front controller takes the 12 lines once, runs them in about 1 ms, then calls the handler from a 40-entry route table. A new page is a 6-line handler and a table entry; the shared steps cannot be skipped. The cost is that all 40 pages now fail together when the shared step breaks, so a deploy of the controller gets a canary rollout, not a quiet merge.

## How it works
<!--meta block=structure-->

The web server sends every request to one place. The front controller runs the common steps in a fixed order (authenticate, resolve locale, start a log line), looks the request up in a route table, and calls the command or handler it finds. Fowler describes two halves: the controller that handles the request and a command hierarchy it dispatches to, chosen from the URL either by a table or by reflection.

```mermaid caption="How does every request get the same checks without each page repeating them? One entry point runs the shared steps, then dispatches to one handler."
flowchart LR
    Client["Client"]:::ext
    subgraph FC["Front controller"]
        Common["Shared steps: auth, locale, logging"]
        Routes[("Route table")]
    end
    Handler["Command / handler"]
    View["View or response"]
    Client -->|"1 every request"| Common
    Common -->|"2 look up route"| Routes
    Routes -->|"3 chosen handler"| Handler
    Handler -->|"4 result"| View
    View -->|"5 response"| Client
    classDef ext stroke-dasharray:4 4
```

```mermaid caption="The order matters: shared steps run before the handler, and a failure in one stops the request there."
sequenceDiagram
    participant C as Client
    participant F as Front controller
    participant H as Handler
    C->>F: GET /orders/42
    F->>F: authenticate, set locale
    alt not signed in
        F-->>C: 401
    else signed in
        F->>H: execute(request)
        H-->>F: result
        F-->>C: 200 + body
    end
```

## Variations
<!--meta block=variations-->

- **Table-driven dispatch** — A map from route to handler, built at start-up. A bad route fails at boot, and you can list every route in one place.
- **Convention or reflection dispatch** — The controller computes the handler name from the URL. It saves registering each route and moves a typo from boot time to run time.
- **Command-object handlers** — Each action is its own object with an `execute` method, as in Fowler's text. It makes handlers easy to test and compose, and costs a class per route.
- **Filter or middleware chain** — The shared steps are a stack of small functions around the dispatch, in the manner of [Chain of Responsibility](../gof/behavioral/chain-of-responsibility.md). You add a concern without editing the controller.
- **Contrast: page controller** — One controller per page or action, with no common entry. It is simpler for a small site and repeats the shared steps in each controller.
- **Gateway in front of services** — The same idea at network scale: [API Gateway](../distributed/routing/api-gateway.md) is the single entry point for many backend services.

## Trade-offs
<!--meta block=tradeoffs-->

### Pros
<!--meta polarity=pro-->

- **Shared concerns live once.** Security, locale and logging are written and reviewed in one place, so no page forgets them.
- **Handlers stay small.** A handler holds only what is specific to its request.
- **One place to change dispatch.** Moving from a route table to versioned routes touches the controller, not every page.
- **Routes can change at run time,** because the handler is looked up, not wired into the page.

### Cons
<!--meta polarity=con-->

- **A single point everything crosses.** A bug or a slow step there hits every request; keep it thin and fast.
- **Can grow into a god object.** Every special case added to the controller makes it harder to read; push concerns into filters.
- **More indirection than a page controller.** A new reader must learn the route table before they can find the code for a URL.
- **Overkill for a handful of pages.** The shared steps may be three lines you can repeat.

## When to use it
<!--meta block=usage-->

### Reach for it when
<!--meta polarity=when-->

- **Every request needs the same checks,** such as login, locale and logging, and you want them written once.
- **You add routes often** and do not want to copy the plumbing for each one.
- **You need to change how requests are routed** without editing every handler.

### Avoid when
<!--meta polarity=avoid-->

- **The site is a few static pages** where a page controller or the web server alone is enough.
- **Your framework already has one.** Writing a second front controller on top duplicates the dispatch and fights the first.
- **Requests share nothing.** Unrelated protocols with no common steps gain nothing from one entry point.

## Code sketch
<!--meta block=sketch-->

```typescript summary="TypeScript — one entry point runs shared steps, then dispatches to a command from a route table"
type Request = { method: string; path: string; user?: string };
type Response = { status: number; body: string };
interface Command { execute(req: Request): Promise<Response> }

class FrontController {
  private routes = new Map<string, Command>();

  register(method: string, path: string, cmd: Command) {
    this.routes.set(`${method} ${path}`, cmd);       // a bad route is visible at boot
  }

  async handle(req: Request): Promise<Response> {
    const started = Date.now();                       // shared step: timing and logging
    try {
      if (!req.user) return { status: 401, body: "sign in" };   // shared step: auth
      const cmd = this.routes.get(`${req.method} ${req.path}`);
      if (!cmd) return { status: 404, body: "not found" };
      return await cmd.execute(req);                  // only this part is page-specific
    } catch {
      return { status: 500, body: "error" };          // shared step: one error page
    } finally {
      console.log(`${req.method} ${req.path} ${Date.now() - started}ms`);
    }
  }
}

const app = new FrontController();
app.register("GET", "/orders", { execute: async () => ({ status: 200, body: "[]" }) });
```

## In the wild
<!--meta block=wild-->

- **Spring MVC DispatcherServlet** — Spring MVC routes every request through one DispatcherServlet, which asks its handler mappings for the controller, runs interceptors around it and passes the result to a view resolver or message converter. The Spring reference documentation describes it as an implementation of the front controller pattern. {#wild-spring-dispatcher-servlet}
- **Symfony** — A Symfony application serves every URL through one script, public/index.php, which builds the request and hands it to the HttpKernel; the kernel dispatches kernel events and resolves the controller for the matched route. The Symfony documentation calls this script the front controller. {#wild-symfony-front-controller}

## Where it shows up
<!--meta block=fluency-->

<!-- fluency:start -->

<!-- GENERATED by gen-tours from docs/data/learning-paths.json. Do not edit this block. -->

- [API Design](../../themes/api-design.md) — Send every request through one handler that applies shared steps and dispatches. {#fluency-api-design}

<!-- fluency:end -->

## How it relates
<!--meta block=relationships-->

<!-- relationships:start -->

<!-- GENERATED by gen-relations from docs/data/relations.json. Do not edit this block. -->

**Combines with**

- [MVC](../architecture/mvc.md) — Model-view-controller (MVC) web frameworks use a front controller as their single dispatcher
- [Chain of Responsibility](../gof/behavioral/chain-of-responsibility.md) — Its shared steps are often a chain of filters around the dispatch
- [API Gateway](../distributed/routing/api-gateway.md) — Scaled to the network, one entry point that routes to many services is an application programming interface (API) gateway
- [Service Layer](./service-layer.md) — The handler it dispatches to calls a service layer for the use case

<!-- relationships:end -->
