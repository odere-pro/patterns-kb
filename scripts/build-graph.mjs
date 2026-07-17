#!/usr/bin/env node
/* build-graph.mjs — AUTHORING-TIME tool (not a site build step).
 *
 * Single source of truth for the pattern relationship graph. Holds node metadata,
 * a curated edge set (each edge authored ONCE), and per-theme membership. It then:
 *   - materializes the inverse of every edge (so cross-links are bidirectional),
 *   - inverts theme membership onto each pattern (the "fluency tie-in"),
 *   - validates: no dangling ids, no conflicting duplicate edge types, closed vocab,
 *   - emits site/assets/graph.json with a fully-resolved adjacency list per node.
 *
 * The emitted graph.json is committed static data. Pattern pages are hand-authored
 * HTML; this graph is what guarantees their links agree in both directions.
 *
 * Run:  node scripts/build-graph.mjs   (add --check to fail if graph.json is stale)
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { RELATION_TYPES, ELEVATION_BANDS, KIND_DIR } from "./lib/model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site", "assets", "graph.json");

/* ---------------- nodes ----------------
 * [id, name, band, group, essence]   (patterns + hazards + themes below)
 */
const PATTERNS = [
  // GoF — creational
  ["singleton","Singleton","gof","gof-creational","Exactly one instance, globally accessible"],
  ["factory-method","Factory Method","gof","gof-creational","Subclasses decide which class to instantiate"],
  ["abstract-factory","Abstract Factory","gof","gof-creational","Families of related objects behind one interface"],
  ["builder","Builder","gof","gof-creational","Construct a complex object step by step"],
  ["prototype","Prototype","gof","gof-creational","Clone an existing object instead of building new"],
  // GoF — structural
  ["adapter","Adapter","gof","gof-structural","Makes incompatible interfaces work together"],
  ["bridge","Bridge","gof","gof-structural","Decouples an abstraction from its implementation"],
  ["composite","Composite","gof","gof-structural","Tree structures — treat parts and wholes alike"],
  ["decorator","Decorator","gof","gof-structural","Attaches behavior without changing the class"],
  ["facade","Facade","gof","gof-structural","One simple interface over a complex subsystem"],
  ["flyweight","Flyweight","gof","gof-structural","Shares state to support huge numbers of objects"],
  ["proxy","Proxy","gof","gof-structural","Stand-in that controls access to another object"],
  // GoF — behavioral
  ["chain-of-responsibility","Chain of Responsibility","gof","gof-behavioral","Passes a request along a chain of handlers"],
  ["command","Command","gof","gof-behavioral","Turns a request into a standalone object"],
  ["interpreter","Interpreter","gof","gof-behavioral","Represents grammar rules as a class hierarchy"],
  ["iterator","Iterator","gof","gof-behavioral","Traverses a collection without exposing its structure"],
  ["mediator","Mediator","gof","gof-behavioral","Centralizes how a set of objects interact"],
  ["memento","Memento","gof","gof-behavioral","Captures and restores an object's internal state"],
  ["observer","Observer","gof","gof-behavioral","Notifies dependents automatically on state change"],
  ["state","State","gof","gof-behavioral","Behavior changes as an object's internal state changes"],
  ["strategy","Strategy","gof","gof-behavioral","Swaps an algorithm's implementation at runtime"],
  ["template-method","Template Method","gof","gof-behavioral","Fixes the outline, lets subclasses fill in steps"],
  ["visitor","Visitor","gof","gof-behavioral","Adds operations without changing the classes visited"],
  // GoF — also essential
  ["dependency-injection","Dependency Injection","gof","gof-extra","Dependencies are handed in, never built inside"],
  ["null-object","Null Object","gof","gof-extra","A do-nothing stand-in instead of a null check"],
  ["object-pool","Object Pool","gof","gof-extra","Reuses a fixed set of expensive objects"],
  ["service-locator","Service Locator","gof","gof-extra","A registry that hands back shared services on request"],
  ["lazy-initialization","Lazy Initialization","gof","gof-extra","Defers creating something until it's first needed"],
  // Enterprise
  ["repository","Repository","enterprise","enterprise","Collection-like interface over data storage"],
  ["unit-of-work","Unit of Work","enterprise","enterprise","Tracks changes, commits them as one transaction"],
  ["data-mapper","Data Mapper","enterprise","enterprise","Moves data between objects and a database, decoupled"],
  ["active-record","Active Record","enterprise","enterprise","An object wraps a row and its own persistence"],
  ["service-layer","Service Layer","enterprise","enterprise","Defines an application's operations as one boundary"],
  ["dto","DTO","enterprise","enterprise","Flat object for carrying data across a boundary"],
  ["gateway","Gateway","enterprise","enterprise","One-object wrapper around an external system's API"],
  ["transaction-script","Transaction Script","enterprise","enterprise","One procedure per business transaction"],
  // Architecture
  ["layered","Layered / N-Tier","architecture","architecture","Presentation, logic, and data as separate tiers"],
  ["mvc","MVC","architecture","architecture","Model, view, and controller kept independent"],
  ["mvp","MVP","architecture","architecture","A presenter mediates between passive view and model"],
  ["mvvm","MVVM","architecture","architecture","View binds declaratively to a view-model"],
  ["hexagonal","Hexagonal","architecture","architecture","Core domain isolated behind ports and adapters"],
  ["eda","Event-Driven Architecture","architecture","architecture","Components react to events, not direct calls"],
  ["microkernel","Microkernel / Plugin","architecture","architecture","Minimal core, features loaded as plug-ins"],
  ["cqrs","CQRS","architecture","architecture","Separate models for reading and for writing"],
  ["event-sourcing","Event Sourcing","architecture","architecture","State is a replayable log of events, not a snapshot"],
  ["pipe-filter","Pipe-and-Filter","architecture","architecture","Data flows through independent processing stages"],
  // Distributed — resilience
  ["circuit-breaker","Circuit Breaker","distributed","distributed-resilience","Stops calling a service that's already failing"],
  ["retry-backoff","Retry with Backoff","distributed","distributed-resilience","Retries transient failures with a growing delay"],
  ["bulkhead","Bulkhead","distributed","distributed-resilience","Isolates resources so one failure can't sink all"],
  ["health-endpoint","Health Endpoint Monitoring","distributed","distributed-resilience","Exposes a route that reports whether a service is healthy"],
  ["compensating-transaction","Compensating Transaction","distributed","distributed-resilience","Undoes completed steps when a later step fails"],
  ["load-leveling","Queue-Based Load Leveling","distributed","distributed-resilience","A queue absorbs bursts so consumers work at their own pace"],
  ["rate-limiter","Rate Limiter","distributed","distributed-resilience","Caps how many requests a client can make in a window"],
  ["timeout-deadline","Timeout / Deadline","distributed","distributed-resilience","Caps how long a call may take before giving up"],
  // Distributed — routing & scale
  ["api-gateway","API Gateway","distributed","distributed-routing","Single entry point that routes to backing services"],
  ["bff","Backend-for-Frontend","distributed","distributed-routing","One backend tailored to each client type"],
  ["ambassador","Ambassador","distributed","distributed-routing","A proxy that handles networking concerns for a service"],
  ["sidecar","Sidecar","distributed","distributed-routing","Attaches a helper process alongside the main one"],
  ["load-balancer","Load Balancer","distributed","distributed-routing","Spreads requests across many identical instances"],
  ["consistent-hashing","Consistent Hashing","distributed","distributed-routing","Distributes keys so adding a node reshuffles the least"],
  ["sharding","Sharding","distributed","distributed-routing","Splits data across nodes by a partition key"],
  ["gatekeeper","Gatekeeper","distributed","distributed-routing","A dedicated broker validates requests before they reach the service"],
  ["valet-key","Valet Key","distributed","distributed-routing","A token grants temporary, limited access to a resource directly"],
  ["cdn","CDN","distributed","distributed-routing","Caches and serves static content from the edge, near the user"],
  ["autoscaling","Autoscaling","distributed","distributed-routing","Adds or removes instances automatically as load changes"],
  // Distributed — coordination & data
  ["saga","Saga","distributed","distributed-coordination","Coordinates a multi-step transaction across services"],
  ["strangler-fig","Strangler Fig","distributed","distributed-coordination","Replaces a legacy system one slice at a time"],
  ["outbox","Outbox","distributed","distributed-coordination","Writes the event and the state change in one local transaction"],
  ["materialized-view","Materialized View","distributed","distributed-coordination","Precomputes a query's result so reads don't recompute it"],
  ["leader-election","Leader Election","distributed","distributed-coordination","Exactly one node coordinates, and the group agrees who"],
  ["quorum-consensus","Quorum & Consensus","distributed","distributed-coordination","A majority of nodes must agree before a write counts"],
  ["gossip-protocol","Gossip Protocol","distributed","distributed-coordination","Nodes spread state by talking to a few random peers"],
  ["write-ahead-log","Write-Ahead Log","distributed","distributed-coordination","Records the intent durably before applying the change"],
  ["bloom-filter","Bloom Filter","distributed","distributed-coordination","Probabilistic check: definitely absent, or maybe present"],
  ["federated-identity","Federated Identity","distributed","distributed-coordination","One identity provider, trusted across many services"],
  ["replication","Replication","distributed","distributed-coordination","Keeps copies of data on multiple nodes for durability and reads"],
  // Concurrency (lens)
  ["producer-consumer","Producer-Consumer","concurrency","concurrency","Decouples generating work from processing it"],
  ["thread-pool","Thread Pool","concurrency","concurrency","Reuses a fixed set of worker threads"],
  ["future-promise","Future / Promise","concurrency","concurrency","A placeholder for a result that isn't ready yet"],
  ["actor-model","Actor Model","concurrency","concurrency","Isolated actors that only communicate via messages"],
  ["reactor","Reactor","concurrency","concurrency","One loop dispatches events to their handlers"],
  ["monitor-object","Monitor Object","concurrency","concurrency","Synchronizes access to an object's own methods"],
  ["rw-lock","Read-Write Lock","concurrency","concurrency","Many readers, or one writer — never both"],
  ["backpressure","Backpressure","concurrency","concurrency","A slow consumer signals upstream to slow down"],
  // Messaging (lens)
  ["pubsub","Publish-Subscribe","messaging","messaging","Publishers and subscribers never know about each other"],
  ["message-queue","Message Queue","messaging","messaging","Point-to-point channel, each message consumed once"],
  ["message-router","Message Router","messaging","messaging","Directs a message to the right channel based on rules"],
  ["content-based-router","Content-Based Router","messaging","messaging","Routes a message by inspecting its actual content"],
  ["message-translator","Message Translator","messaging","messaging","Converts a message between two different formats"],
  ["splitter","Splitter","messaging","messaging","Breaks one message into many for individual processing"],
  ["aggregator","Aggregator","messaging","messaging","Combines many related messages back into one"],
  ["competing-consumers","Competing Consumers","messaging","messaging","Many consumers pull from one channel to share load"],
  ["dead-letter-channel","Dead Letter Channel","messaging","messaging","Undeliverable messages land somewhere visible, not lost"],
  ["correlation-identifier","Correlation Identifier","messaging","messaging","Tags related messages so replies can be matched up"],
  ["scatter-gather","Scatter-Gather","messaging","messaging","Broadcasts a request, then merges the responses"],
  ["wire-tap","Wire Tap","messaging","messaging","Copies messages to a side channel for inspection, unchanged"],
  ["claim-check","Claim Check","messaging","messaging","Sends a reference to large data, not the data itself"],
  ["idempotency","Idempotency","messaging","messaging","The same request applied twice has the same effect as once"],
  // Caching (lens)
  ["cache-aside","Cache-Aside","caching","caching","The app checks the cache first, fills it on a miss"],
  ["read-through","Read-Through","caching","caching","The cache loads on a miss, the app never sees the gap"],
  ["write-through","Write-Through","caching","caching","Writes hit the cache and the store together, synchronously"],
  ["write-behind","Write-Behind","caching","caching","Writes hit the cache now, the store catches up later"],
  ["refresh-ahead","Refresh-Ahead","caching","caching","Proactively refreshes hot entries before they expire"],
  // DDD (lens)
  ["entity","Entity","ddd","ddd","Defined by identity, not by its attributes"],
  ["value-object","Value Object","ddd","ddd","Defined only by its attributes, no identity"],
  ["aggregate","Aggregate","ddd","ddd","A cluster of objects treated as one consistency unit"],
  ["domain-event","Domain Event","ddd","ddd","Something meaningful that happened in the domain"],
  ["bounded-context","Bounded Context","ddd","ddd","A model's boundary of validity and meaning"],
  ["acl","Anti-Corruption Layer","ddd","ddd","Translates between two different domain models"],
  // Functional (lens)
  ["functor","Functor","functional","functional","A type you can map a function over"],
  ["monad","Monad","functional","functional","Sequences computations that carry extra context"],
  ["pipeline","Pipeline / Composition","functional","functional","Builds behavior by composing small functions"],
  ["immutability","Immutability","functional","functional","Never mutate — always return new data"],
  ["lens-optics","Lens / Optics","functional","functional","A composable getter/setter into nested data"],
  ["currying","Currying","functional","functional","Pre-fill some arguments, get back a function"],
  // Testing (lens)
  ["dummy-object","Dummy Object","testing","testing","Passed in to satisfy a signature, never actually used"],
  ["test-stub","Test Stub","testing","testing","Returns canned answers, doesn't care how it's called"],
  ["test-spy","Test Spy","testing","testing","Records how it was called so the test can check later"],
  ["mock-object","Mock Object","testing","testing","Pre-programmed with expectations, fails if they're unmet"],
  ["fake-object","Fake Object","testing","testing","A working lightweight stand-in, like an in-memory database"],
  ["page-object","Page Object","testing","testing","Wraps a UI screen's structure behind one testable interface"],
  ["test-data-builder","Test Data Builder","testing","testing","Fluent construction of valid objects for test setup"],
  ["golden-master","Golden Master","testing","testing","Compares fresh output against a saved known-good snapshot"],
  ["arrange-act-assert","Arrange-Act-Assert","testing","testing","Set up state, perform the action, check the outcome"],
  // Security (lens)
  ["authentication-enforcer","Authentication Enforcer","security","security","Centralizes verifying who is making the request"],
  ["authorization-enforcer","Authorization Enforcer (RBAC)","security","security","Centralizes checking what a role is allowed to do"],
  ["secure-session-manager","Secure Session Manager","security","security","Issues, tracks, and expires session state safely"],
  ["intercepting-validator","Intercepting Validator","security","security","Validates and sanitizes input before it reaches logic"],
  ["secure-logger","Secure Logger","security","security","Records events for audit without leaking sensitive data"],
  ["single-access-point","Single Access Point","security","security","One well-guarded entry, instead of many small ones"],
  ["least-privilege","Least Privilege","security","security","Every component gets the minimum access it needs, no more"],
];

const HAZARDS = [
  ["god-object","God Object","One class knows and does almost everything"],
  ["spaghetti-code","Spaghetti Code","Control flow too tangled to follow"],
  ["big-ball-of-mud","Big Ball of Mud","No discernible architecture at all"],
  ["anemic-domain-model","Anemic Domain Model","Data objects with no real behavior of their own"],
  ["golden-hammer","Golden Hammer","One familiar tool applied to every problem"],
  ["boat-anchor","Boat Anchor","Dead code or hardware kept around unused"],
];

const THEMES = [
  ["cap-theorem","CAP Theorem","When the network splits, you choose consistency or availability — never both"],
  ["streaming","Streaming","Processing unbounded data as it arrives, not in batches"],
  ["spike-handling","Handling Spikes","Absorb, shed, or scale when traffic suddenly surges"],
  ["performance","Performance","Serving more, faster: load balancing, caching, and memory"],
  ["auth-and-access","Auth & Access","Who are you, what may you do, and how is that enforced"],
  ["scalability","Scalability","Growing capacity with load without rewriting the system"],
  ["consistency-and-replication","Consistency & Replication","Keeping copies of data in agreement across nodes"],
  ["observability","Observability","Knowing what a running system is actually doing"],
  ["resilience","Resilience","Staying up, or degrading gracefully, when parts fail"],
];

/* ---------------- edges (authored once; inverses generated) ----------------
 * [from, to, type, note?]
 */
const EDGES = [
  // --- GoF creational ---
  ["abstract-factory","factory-method","composed-of","Its product methods are usually Factory Methods"],
  ["abstract-factory","builder","alternative-to","Families of products vs. one product built in steps"],
  ["prototype","factory-method","alternative-to","Clone a configured instance vs. subclass to create"],
  ["builder","factory-method","alternative-to","Stepwise assembly vs. a single creating call"],
  ["singleton","dependency-injection","alternative-to","A global instance vs. handing the instance in"],
  ["singleton","service-locator","often-confused-with","Both hand back a shared instance; DI is usually better"],
  ["singleton","monostate","often-confused-with","Shared state vs. a single object — often conflated"],
  // --- GoF structural confusions ---
  ["adapter","facade","often-confused-with","Convert one interface vs. simplify many"],
  ["adapter","bridge","often-confused-with","Fix a mismatch after vs. design the split up front"],
  ["decorator","proxy","often-confused-with","Add behavior vs. control access — same shape"],
  ["decorator","composite","often-confused-with","Both wrap recursively; intent differs"],
  ["decorator","adapter","often-confused-with","Same wrapping shape, different intent"],
  ["proxy","ambassador","generalizes","Ambassador is a network proxy deployed beside a service"],
  ["facade","gateway","often-confused-with","Simplify a subsystem vs. wrap one external system"],
  ["composite","iterator","combines-with","Iterate a tree uniformly"],
  ["composite","visitor","combines-with","Apply an operation across a whole tree"],
  ["flyweight","object-pool","often-confused-with","Share immutable state vs. reuse whole objects"],
  ["flyweight","factory-method","combines-with","A factory hands back shared flyweights"],
  // --- GoF behavioral ---
  ["strategy","state","often-confused-with","Swap an algorithm vs. change behavior as state changes"],
  ["strategy","template-method","alternative-to","Compose an algorithm vs. subclass to fill steps"],
  ["strategy","null-object","combines-with","A do-nothing strategy is a common default"],
  ["command","memento","combines-with","Command does; Memento captures state to undo"],
  ["command","chain-of-responsibility","combines-with","Commands flow along a handler chain"],
  ["observer","mediator","often-confused-with","Broadcast changes vs. centralize interactions"],
  ["observer","pubsub","generalizes","Pub/Sub is Observer across process boundaries"],
  ["mediator","god-object","prevents-hazard","Centralizing coordination, done carefully, avoids one class doing all"],
  ["template-method","factory-method","combines-with","A step in the template is often a factory method"],
  ["visitor","interpreter","combines-with","Visitors evaluate interpreter node trees"],
  // --- GoF extra ---
  ["dependency-injection","god-object","prevents-hazard","Injected collaborators keep one class from owning everything"],
  ["dependency-injection","service-locator","alternative-to","Push dependencies in vs. pull them from a registry"],
  ["object-pool","thread-pool","has-variant","A thread pool is an object pool of workers"],
  ["lazy-initialization","proxy","combines-with","A virtual proxy defers creation until first use"],
  ["lazy-initialization","singleton","combines-with","The classic lazily-created single instance"],
  ["null-object","strategy","combines-with","Null Object is a neutral strategy"],
  // --- Enterprise ---
  ["repository","unit-of-work","combines-with","The repo reads; the unit of work commits the changes"],
  ["repository","data-mapper","combines-with","Repositories sit on top of a data mapper"],
  ["repository","aggregate","combines-with","One repository per aggregate root"],
  ["active-record","data-mapper","alternative-to","Row owns its persistence vs. a separate mapper"],
  ["active-record","anemic-domain-model","mitigated-by","Records with only getters/setters go anemic"],
  ["service-layer","transaction-script","alternative-to","A rich operations boundary vs. one procedure per transaction"],
  ["service-layer","repository","combines-with","Services orchestrate repositories"],
  ["service-layer","dto","combines-with","Services accept and return DTOs at the boundary"],
  ["dto","value-object","often-confused-with","A transfer shape with no behavior vs. a domain value"],
  ["gateway","adapter","often-confused-with","Wrap an external system vs. convert an interface"],
  ["gateway","acl","part-of","An anti-corruption layer is built from gateways and translators"],
  ["transaction-script","anemic-domain-model","mitigated-by","Procedural scripts push logic out of the model"],
  // --- Architecture ---
  ["mvc","layered","specializes","MVC is a layering of UI concerns"],
  ["mvc","mvp","has-variant","MVP swaps the controller for a presenter over a passive view"],
  ["mvc","mvvm","has-variant","MVVM binds the view to a view-model"],
  ["mvp","mvvm","often-confused-with","Presenter drives the view vs. view binds to a model"],
  ["hexagonal","layered","alternative-to","Dependencies point inward vs. straight down the tiers"],
  ["hexagonal","dependency-injection","combines-with","Adapters are injected into the core's ports"],
  ["hexagonal","adapter","composed-of","Ports are filled by adapters"],
  ["hexagonal","big-ball-of-mud","prevents-hazard","Isolating the core keeps the mud out"],
  ["hexagonal","acl","combines-with","Adapters often carry an anti-corruption layer"],
  ["layered","spaghetti-code","prevents-hazard","Clear tiers keep call flow from tangling"],
  ["layered","big-ball-of-mud","prevents-hazard","Enforced layers resist mud"],
  ["eda","pubsub","composed-of","Event-driven systems are wired with pub/sub"],
  ["eda","domain-event","combines-with","Domain events are the currency of EDA"],
  ["eda","event-sourcing","combines-with","Sourced events can also drive reactions"],
  ["cqrs","event-sourcing","combines-with","Often paired: write events, project read models"],
  ["cqrs","materialized-view","combines-with","The read side is a materialized projection"],
  ["cqrs","event-sourcing","often-confused-with","Separate read/write models vs. store events — distinct ideas"],
  ["event-sourcing","write-ahead-log","often-confused-with","Domain events as truth vs. a durability log"],
  ["event-sourcing","outbox","combines-with","Append the event, publish reliably"],
  ["event-sourcing","domain-event","composed-of","The log is a sequence of domain events"],
  ["event-sourcing","immutability","combines-with","Events are append-only and never mutated"],
  ["pipe-filter","producer-consumer","combines-with","Stages are producers and consumers in series"],
  ["pipe-filter","backpressure","combines-with","Slow filters must push back upstream"],
  ["microkernel","strategy","combines-with","Plug-ins are swappable strategies for the core"],
  ["microkernel","golden-hammer","prevents-hazard","A plug-in per need resists forcing one tool everywhere"],
  // --- Distributed: resilience ---
  ["circuit-breaker","retry-backoff","combines-with","Retry transient errors; trip the breaker on sustained ones"],
  ["circuit-breaker","timeout-deadline","prerequisite","You can't trip on slowness without timeouts"],
  ["circuit-breaker","bulkhead","combines-with","Isolate, then stop calling the failing pool"],
  ["circuit-breaker","health-endpoint","combines-with","Health signals inform breaker state"],
  ["retry-backoff","idempotency","prerequisite","Safe retries require idempotent operations"],
  ["retry-backoff","timeout-deadline","combines-with","Bound each attempt, then back off"],
  ["retry-backoff","dead-letter-channel","combines-with","Exhausted retries go to the dead-letter channel"],
  ["bulkhead","thread-pool","combines-with","Separate pools are a common bulkhead"],
  ["bulkhead","rate-limiter","often-confused-with","Isolate resources vs. cap request rate"],
  ["health-endpoint","load-balancer","enables","Load balancers route only to healthy instances"],
  ["compensating-transaction","saga","part-of","A saga undoes work with compensating transactions"],
  ["compensating-transaction","idempotency","combines-with","Compensations must be safe to re-run"],
  ["load-leveling","message-queue","composed-of","A queue is what levels the load"],
  ["load-leveling","backpressure","alternative-to","Absorb the burst vs. signal senders to slow down"],
  ["load-leveling","autoscaling","combines-with","Level with a queue while capacity catches up"],
  ["load-leveling","competing-consumers","combines-with","Many consumers drain the leveling queue"],
  ["rate-limiter","token-bucket","has-variant","Token- and leaky-bucket are the classic algorithms"],
  ["rate-limiter","api-gateway","combines-with","The gateway is where limits are usually enforced"],
  ["rate-limiter","backpressure","often-confused-with","Reject over-rate vs. ask upstream to slow"],
  ["rate-limiter","load-leveling","alternative-to","Shed excess vs. buffer it"],
  ["timeout-deadline","retry-backoff","combines-with","Bound the attempt, then decide to retry"],
  // --- Distributed: routing & scale ---
  ["api-gateway","load-balancer","combines-with","The gateway fronts, the balancer spreads"],
  ["api-gateway","authentication-enforcer","combines-with","Authenticate once at the edge"],
  ["api-gateway","gatekeeper","combines-with","Validate and screen requests at entry"],
  ["api-gateway","reverse-proxy","often-confused-with","Route + cross-cutting concerns vs. plain proxying"],
  ["bff","api-gateway","specializes","One backend per frontend, atop the gateway idea"],
  ["ambassador","sidecar","combines-with","An ambassador is often deployed as a sidecar"],
  ["ambassador","api-gateway","often-confused-with","Client-side networking proxy vs. server-side entry point"],
  ["sidecar","service-mesh","part-of","Sidecars are the data plane of a mesh"],
  ["load-balancer","consistent-hashing","combines-with","Hash to pin a client to an instance"],
  ["load-balancer","autoscaling","combines-with","Balance across the pool autoscaling resizes"],
  ["load-balancer","sticky-session","has-variant","Session affinity pins a user to one instance"],
  ["consistent-hashing","sharding","enables","Consistent hashing is how shards are placed"],
  ["consistent-hashing","replication","combines-with","Place primary and replicas around the ring"],
  ["consistent-hashing","cdn","combines-with","Edge nodes are chosen by hashing"],
  ["sharding","replication","combines-with","Partition for scale, replicate each shard for safety"],
  ["sharding","replication","often-confused-with","Split data vs. copy data"],
  ["gatekeeper","valet-key","combines-with","Screen at the gate, then hand out scoped keys"],
  ["gatekeeper","single-access-point","specializes","A gatekeeper is a hardened single entry"],
  ["gatekeeper","intercepting-validator","combines-with","The gatekeeper validates before forwarding"],
  ["valet-key","least-privilege","part-of","A scoped, expiring key is least privilege in action"],
  ["cdn","cache-aside","combines-with","The edge caches; origin fills on a miss"],
  ["autoscaling","health-endpoint","combines-with","Scale on health and load signals"],
  ["autoscaling","backpressure","combines-with","Push back while new capacity spins up"],
  // --- Distributed: coordination & data ---
  ["saga","outbox","combines-with","Publish each saga step reliably via the outbox"],
  ["saga","idempotency","prerequisite","Steps and compensations must be replay-safe"],
  ["saga","domain-event","combines-with","Choreographed sagas react to domain events"],
  ["saga","cqrs","combines-with","Sagas often drive read-model updates"],
  ["strangler-fig","api-gateway","combines-with","Route slices old-vs-new at the gateway"],
  ["strangler-fig","acl","combines-with","An ACL shields new code from the legacy model"],
  ["strangler-fig","big-ball-of-mud","prevents-hazard","Replace the mud incrementally instead of a rewrite"],
  ["strangler-fig","boat-anchor","prevents-hazard","Retire dead legacy slice by slice"],
  ["outbox","pubsub","enables","The outbox makes publishing atomic with the write"],
  ["outbox","idempotency","combines-with","Consumers dedupe replayed outbox messages"],
  ["outbox","message-queue","combines-with","A relay drains the outbox to the broker"],
  ["materialized-view","cqrs","part-of","The read model is a materialized view"],
  ["materialized-view","cache-aside","often-confused-with","Precomputed projection vs. lazily-filled cache"],
  ["materialized-view","event-sourcing","combines-with","Project events into read views"],
  ["leader-election","quorum-consensus","combines-with","The group agrees on a leader via consensus"],
  ["leader-election","gossip-protocol","combines-with","Membership spreads by gossip; a leader is chosen"],
  ["quorum-consensus","replication","prerequisite","Quorums make replicated writes agree"],
  ["quorum-consensus","write-ahead-log","combines-with","Replicate the log, commit on a quorum"],
  ["gossip-protocol","consistent-hashing","combines-with","Gossip membership feeds the hash ring"],
  ["write-ahead-log","replication","enables","Ship the log to bring replicas up to date"],
  ["write-ahead-log","event-sourcing","often-confused-with","Durability journal vs. domain source of truth"],
  ["bloom-filter","cache-aside","combines-with","Skip a lookup the filter says will miss"],
  ["federated-identity","authentication-enforcer","combines-with","Trust an external IdP to authenticate"],
  ["federated-identity","single-access-point","combines-with","One sign-on across many services"],
  ["replication","read-through","combines-with","Read replicas serve cached-style reads"],
  // --- Concurrency ---
  ["producer-consumer","message-queue","combines-with","The queue is the buffer between them"],
  ["producer-consumer","thread-pool","combines-with","A pool of consumers drains the queue"],
  ["producer-consumer","backpressure","combines-with","A full buffer must slow the producer"],
  ["producer-consumer","pubsub","often-confused-with","One-to-one hand-off vs. broadcast"],
  ["thread-pool","future-promise","combines-with","Submitting work returns a future"],
  ["future-promise","reactor","combines-with","The loop resolves futures as events arrive"],
  ["actor-model","monitor-object","alternative-to","Message-passing vs. shared-state locking"],
  ["actor-model","message-queue","combines-with","Each actor has a mailbox queue"],
  ["actor-model","backpressure","combines-with","Bounded mailboxes push back"],
  ["reactor","future-promise","combines-with","Non-blocking calls complete via callbacks/futures"],
  ["monitor-object","rw-lock","combines-with","A read-write lock is a finer-grained monitor"],
  // --- Messaging ---
  ["pubsub","message-queue","often-confused-with","Broadcast to many vs. one consumer per message"],
  ["pubsub","competing-consumers","combines-with","Fan out to groups, share within a group"],
  ["message-queue","competing-consumers","combines-with","Scale consumers off one queue"],
  ["message-queue","dead-letter-channel","combines-with","Poison messages divert here"],
  ["message-router","content-based-router","has-variant","Route by rules; content-based inspects the body"],
  ["message-translator","adapter","often-confused-with","Reshape a message vs. convert an interface"],
  ["message-translator","acl","combines-with","The ACL translates between models"],
  ["splitter","aggregator","combines-with","Split out, process, then recombine"],
  ["scatter-gather","splitter","composed-of","Scatter fans out, gather aggregates"],
  ["scatter-gather","aggregator","composed-of","The gather step is an aggregator"],
  ["correlation-identifier","scatter-gather","combines-with","Correlate responses back to the request"],
  ["correlation-identifier","saga","combines-with","Correlate the steps of one saga"],
  ["wire-tap","secure-logger","combines-with","Tap to an audit log"],
  ["claim-check","message-queue","combines-with","Keep large payloads out of the queue"],
  ["idempotency","dead-letter-channel","combines-with","Dedupe redeliveries; divert true failures"],
  ["idempotency","competing-consumers","combines-with","Parallel consumers must handle redelivery"],
  // --- Caching ---
  ["cache-aside","read-through","alternative-to","App fills the cache vs. the cache fills itself"],
  ["read-through","write-through","combines-with","Read-through paired with write-through keeps sync"],
  ["write-through","write-behind","alternative-to","Write now, consistent vs. write later, faster"],
  ["refresh-ahead","read-through","combines-with","Refresh hot keys before they expire"],
  ["cache-aside","materialized-view","often-confused-with","Lazy cache vs. eagerly-maintained projection"],
  // --- DDD ---
  ["entity","value-object","often-confused-with","Identity matters vs. only the values matter"],
  ["aggregate","entity","composed-of","An aggregate is a graph of entities and values"],
  ["aggregate","value-object","composed-of","Values live inside the aggregate boundary"],
  ["aggregate","domain-event","combines-with","Aggregates emit domain events on change"],
  ["aggregate","anemic-domain-model","prevents-hazard","Behavior on the aggregate keeps the model rich"],
  ["domain-event","event-sourcing","combines-with","Persist the events the domain emits"],
  ["domain-event","pubsub","combines-with","Publish domain events to interested parties"],
  ["bounded-context","acl","combines-with","An ACL guards a context's boundary"],
  ["bounded-context","big-ball-of-mud","prevents-hazard","Boundaries keep models from merging into mud"],
  ["acl","message-translator","combines-with","Translation is the ACL's core job"],
  ["acl","adapter","combines-with","Adapters implement the translation"],
  // --- Functional ---
  ["monad","functor","specializes","Every monad is a functor with more structure"],
  ["pipeline","currying","combines-with","Curried functions compose cleanly in a pipeline"],
  ["pipeline","monad","combines-with","Monadic bind is pipeline composition with context"],
  ["immutability","value-object","combines-with","Value objects are immutable by nature"],
  ["immutability","memento","combines-with","Immutable snapshots make undo trivial"],
  ["immutability","actor-model","combines-with","No shared mutable state to guard"],
  ["lens-optics","immutability","combines-with","Optics update nested immutable data"],
  // --- Testing ---
  ["dummy-object","test-stub","often-confused-with","Never used vs. returns canned values"],
  ["test-stub","mock-object","often-confused-with","State vs. behavior verification"],
  ["test-stub","test-spy","often-confused-with","Canned answers vs. recorded calls"],
  ["test-spy","mock-object","often-confused-with","Record and assert later vs. expect up front"],
  ["mock-object","fake-object","often-confused-with","Programmed expectations vs. a real lightweight impl"],
  ["test-data-builder","builder","specializes","A builder pattern for test fixtures"],
  ["page-object","test-data-builder","combines-with","Build data, drive the page object"],
  ["golden-master","arrange-act-assert","alternative-to","Snapshot the whole output vs. assert specifics"],
  // --- Security ---
  ["authentication-enforcer","authorization-enforcer","combines-with","Authn establishes who; authz decides what"],
  ["authentication-enforcer","authorization-enforcer","often-confused-with","Identity vs. permission — distinct steps"],
  ["authentication-enforcer","secure-session-manager","combines-with","Authenticate, then carry a secure session"],
  ["authentication-enforcer","single-access-point","combines-with","Authenticate at the one entry"],
  ["authorization-enforcer","least-privilege","combines-with","Grant only what the role needs"],
  ["intercepting-validator","api-gateway","combines-with","Validate input at the edge"],
  ["intercepting-validator","gatekeeper","combines-with","Screen before forwarding"],
  ["least-privilege","valet-key","combines-with","Scoped, expiring access is least privilege"],
];

/* ---------------- theme membership (source of truth for the fluency tie-in) ----------------
 * Each theme lists its member patterns in tour order, with a one-line role.
 */
const THEME_MEMBERS = {
  "cap-theorem": [
    ["quorum-consensus","Tune the consistency/availability dial with read/write quorums"],
    ["replication","The copies whose agreement CAP is about"],
    ["leader-election","A single writer trades availability for consistency"],
    ["write-ahead-log","Durable ordering behind replicated state"],
    ["saga","Choose availability, then reconcile with eventual consistency"],
    ["gossip-protocol","AP-style membership that converges eventually"],
  ],
  "streaming": [
    ["producer-consumer","The basic shape of a stream stage"],
    ["backpressure","Keep a fast producer from drowning a slow consumer"],
    ["pipe-filter","Compose stages into a processing pipeline"],
    ["reactor","Event-loop dispatch for non-blocking streams"],
    ["pubsub","Fan a stream out to many subscribers"],
    ["message-queue","Buffer and decouple stream stages"],
    ["event-sourcing","A durable, replayable stream of events"],
    ["competing-consumers","Scale a stream across parallel workers"],
  ],
  "spike-handling": [
    ["load-leveling","Absorb the burst in a queue"],
    ["rate-limiter","Shed load above a safe rate"],
    ["autoscaling","Add capacity as the surge builds"],
    ["backpressure","Signal upstream to slow down"],
    ["bulkhead","Contain the blast radius of overload"],
    ["circuit-breaker","Fail fast when downstream is saturated"],
    ["cdn","Serve the static surge from the edge"],
    ["cache-aside","Take read pressure off the origin"],
  ],
  "performance": [
    ["load-balancer","Spread work across many instances"],
    ["cache-aside","The default read-cache strategy"],
    ["read-through","Cache reads transparently"],
    ["write-behind","Make writes feel instant"],
    ["cdn","Cut latency by serving from the edge"],
    ["materialized-view","Precompute expensive reads"],
    ["consistent-hashing","Route to the node that already has the data warm"],
    ["object-pool","Reuse expensive objects to cut allocation cost"],
    ["flyweight","Shrink memory by sharing immutable state"],
    ["bloom-filter","Skip lookups that would miss"],
  ],
  "auth-and-access": [
    ["authentication-enforcer","Establish who is calling"],
    ["authorization-enforcer","Decide what the role may do"],
    ["secure-session-manager","Carry identity safely across requests"],
    ["federated-identity","Delegate sign-on to a trusted provider"],
    ["single-access-point","Funnel access through one guarded entry"],
    ["gatekeeper","Validate and screen at that entry"],
    ["valet-key","Hand out scoped, expiring access"],
    ["least-privilege","Grant the minimum needed, no more"],
    ["intercepting-validator","Reject bad input before it reaches logic"],
  ],
  "scalability": [
    ["load-balancer","Distribute across a horizontal fleet"],
    ["autoscaling","Resize the fleet with demand"],
    ["sharding","Partition data to scale writes"],
    ["consistent-hashing","Place partitions with minimal reshuffle"],
    ["replication","Scale reads with copies"],
    ["competing-consumers","Scale work across parallel consumers"],
    ["cqrs","Scale reads and writes independently"],
    ["stateless-service","Statelessness is what lets you add instances freely"],
  ],
  "consistency-and-replication": [
    ["replication","The copies to keep in agreement"],
    ["quorum-consensus","Agree on writes across a majority"],
    ["leader-election","Serialize writes through one node"],
    ["write-ahead-log","Order and ship changes durably"],
    ["outbox","Make the event and the write atomic"],
    ["saga","Eventual consistency across services"],
    ["gossip-protocol","Converge membership and state over time"],
  ],
  "observability": [
    ["health-endpoint","Report liveness and readiness"],
    ["correlation-identifier","Stitch one request across services"],
    ["wire-tap","Observe message flow without changing it"],
    ["secure-logger","Audit without leaking secrets"],
    ["circuit-breaker","Its state is a key health signal"],
  ],
  "resilience": [
    ["circuit-breaker","Stop hammering a failing dependency"],
    ["retry-backoff","Ride out transient failures"],
    ["timeout-deadline","Never wait forever"],
    ["bulkhead","Isolate failures to one compartment"],
    ["idempotency","Make retries and redelivery safe"],
    ["compensating-transaction","Undo partial work on failure"],
    ["dead-letter-channel","Quarantine what can't be processed"],
    ["health-endpoint","Route around unhealthy instances"],
  ],
};

/* ---------------- assembly ---------------- */
const nodes = {};
function addNode(id, name, band, group, essence, kind) {
  if (nodes[id]) throw new Error(`duplicate node id: ${id}`);
  const docClass = kind === "hazard" ? "hazard" : kind === "theme" ? "theme"
    : ELEVATION_BANDS.has(band) ? "" : "lens";
  nodes[id] = {
    id, name, kind, band, group, essence, docClass,
    dir: KIND_DIR[kind],
    relPath: `../${KIND_DIR[kind]}/${id}.html`, // relative path FROM any content subpage
    relations: [], themes: [], memberPatterns: [],
  };
}
PATTERNS.forEach(([id, name, band, group, essence]) => addNode(id, name, band, group, essence, "pattern"));
HAZARDS.forEach(([id, name, essence]) => addNode(id, name, "hazard", "hazard", essence, "hazard"));
THEMES.forEach(([id, name, essence]) => addNode(id, name, "theme", "theme", essence, "theme"));

/* ids that appear in edges as illustrative neighbors but have no page of their own.
 * They render as plain (non-linked) text so we never emit a dangling href. */
const STUB_NEIGHBORS = new Set([
  "monostate","reverse-proxy","service-mesh","token-bucket","sticky-session","stateless-service",
]);

function relType(t) {
  const def = RELATION_TYPES[t];
  if (!def) throw new Error(`unknown relation type: ${t}`);
  return def;
}
function inverseType(t) {
  const def = relType(t);
  return def.symmetric ? t : def.inverse;
}

// track directional edges to catch contradictory claims (e.g. A specializes B AND B specializes A).
// Symmetric types (combines-with / alternative-to / often-confused-with) may coexist freely on a pair.
const dirSeen = new Map();
const resolved = []; // {from,to,type,note,generated}

function pushRelation(from, to, type, note) {
  const n = nodes[from];
  if (!n) throw new Error(`edge from unknown node: ${from}`);
  const known = nodes[to] ? true : STUB_NEIGHBORS.has(to);
  if (!known) throw new Error(`edge to unknown node: ${to} (from ${from})`);
  // dedupe identical (to,type) on a node
  if (n.relations.some((r) => r.to === to && r.type === type)) return;
  n.relations.push({
    to, type, note: note || "",
    name: nodes[to] ? nodes[to].name : titleize(to),
    href: nodes[to] ? `../${nodes[to].dir}/${to}.html` : null,
    label: relType(type).label,
  });
}
function titleize(id) {
  return id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

for (const [from, to, type, note] of EDGES) {
  const def = relType(type); // validate vocab
  if (!def.symmetric) {
    const key = [from, to].sort().join("|");
    const prior = dirSeen.get(key);
    if (prior) {
      const same = prior.from === from && prior.to === to && prior.type === type;
      const inv = prior.from === to && prior.to === from && prior.type === inverseType(type);
      if (!same && !inv) {
        throw new Error(
          `conflicting directional edges for ${from}<->${to}: ` +
          `${prior.from}-${prior.type}->${prior.to} vs ${from}-${type}->${to}`
        );
      }
    } else {
      dirSeen.set(key, { from, to, type });
    }
  }
  pushRelation(from, to, type, note);
  // materialize inverse onto the other endpoint (only if it has a page)
  if (nodes[to]) pushRelation(to, from, inverseType(type), note);
  resolved.push({ from, to, type, note: note || "" });
}

/* theme membership → theme.memberPatterns + pattern.themes (inverse) */
for (const [themeId, members] of Object.entries(THEME_MEMBERS)) {
  const theme = nodes[themeId];
  if (!theme) throw new Error(`unknown theme: ${themeId}`);
  for (const [pid, role] of members) {
    const p = nodes[pid];
    if (!p) {
      if (STUB_NEIGHBORS.has(pid)) { theme.memberPatterns.push({ id: pid, name: titleize(pid), role, href: null }); continue; }
      throw new Error(`theme ${themeId} references unknown pattern: ${pid}`);
    }
    theme.memberPatterns.push({ id: pid, name: p.name, role, href: `../${p.dir}/${pid}.html` });
    if (p.themes.every((t) => t.id !== themeId)) {
      p.themes.push({ id: themeId, name: theme.name, role, href: `../themes/${themeId}.html` });
    }
  }
}

/* ---------------- validation summary ---------------- */
let edgeCount = 0, oneWay = 0;
for (const n of Object.values(nodes)) {
  edgeCount += n.relations.length;
  // every relation to a real node must have its inverse present on the target
  for (const r of n.relations) {
    if (!r.href) continue;
    const t = nodes[r.to];
    const inv = inverseType(r.type);
    if (!t.relations.some((rr) => rr.to === n.id && rr.type === inv)) {
      oneWay++;
      console.error(`ONE-WAY: ${n.id} -${r.type}-> ${r.to} (missing inverse ${inv})`);
    }
  }
}
if (oneWay) throw new Error(`${oneWay} one-way relationship(s) — inverse materialization failed`);

const out = {
  meta: {
    generator: "scripts/build-graph.mjs",
    patterns: PATTERNS.length,
    hazards: HAZARDS.length,
    themes: THEMES.length,
    authoredEdges: EDGES.length,
    renderedRelations: edgeCount,
  },
  relationTypes: RELATION_TYPES,
  stubNeighbors: [...STUB_NEIGHBORS],
  nodes,
  resolvedEdges: resolved,
};

const json = JSON.stringify(out, null, 2) + "\n";

if (process.argv.includes("--check")) {
  const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (cur !== json) {
    console.error("graph.json is STALE — run: node scripts/build-graph.mjs");
    process.exit(1);
  }
  console.log("graph.json is up to date.");
} else {
  writeFileSync(OUT, json);
  console.log(
    `graph.json written: ${PATTERNS.length} patterns + ${HAZARDS.length} hazards + ${THEMES.length} themes, ` +
    `${EDGES.length} authored edges → ${edgeCount} rendered relations.`
  );
}
