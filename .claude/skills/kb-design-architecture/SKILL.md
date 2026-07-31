---
name: kb-design-architecture
description: Write or review the architecture and deepdives blocks ("How the system is built", "Deep dives") of a patterns-kb design page — one narrative in two blocks: a lead and L1 board with a components-and-communication walk and an FR-coverage trace, then one NFR-driven deep dive per non-functional requirement, each carrying its own L2 zoom or an iterated evolution of the board. Use when someone asks to "write the architecture block", "draw how the system is built", "add the deep dives", "trace the requirements to components", "label the components with patterns", or says a requirement is satisfied nowhere visible or the deep dives read as trivia instead of arguments.
---

# Writing the architecture and deepdives blocks

**The architecture block proves the system satisfies every functional requirement; the
deep dives prove it satisfies every non-functional one — two blocks, one coverage
contract, and nothing on the board that neither proof needs.** This is the whiteboard
slice of the interview: the L1 board is drawn breadth-first so the whole system is
visible at once, and each deep dive zooms or iterates on demand, one NFR at a time.

## The markup

```html
<section class="doc-section" id="architecture" aria-labelledby="h-arch" data-kb-block="architecture">
  <h2 class="doc-h" id="h-arch">How the system is built</h2>
  <div class="prose">
    <p>Lead — entry point, the one structural decision, the flow at a glance.</p>
  </div>
  <figure class="diagram">
    <pre class="mermaid">
flowchart TB
    A["Service · pattern-name"] -->|"verb + payload"| B[("Store")]
    X["Given system"]:::ext
    classDef ext stroke-dasharray:4 4;
    </pre>
    <figcaption>The one question the L1 board answers.</figcaption>
  </figure>
  <div class="prose">
    <h3>Components &amp; communication</h3>
    <ul>
      <li><strong>Service</strong> — role in one clause; talks to Store with payload. Requests enter here.</li>
    </ul>
    <h3>Where each requirement lands</h3>
    <ul>
      <li>Requirement paraphrase — Component → Component path. → FR: label.</li>
    </ul>
  </div>
</section>

<section class="doc-section" id="deepdives" aria-labelledby="h-deep" data-kb-block="deepdives">
  <h2 class="doc-h" id="h-deep">Deep dives</h2>
  <div class="prose">
    <h3>1 · Mechanism title → NFR: label</h3>
    <p><strong>Thesis — why this mechanism satisfies this NFR.</strong> Then the options argument…</p>
  </div>
  <figure class="diagram">
    <pre class="mermaid">…L2 zoom (node keeps its L1 name) or iterated board…</pre>
    <figcaption>The dive's one question.</figcaption>
  </figure>
  <!-- repeat prose + figure per dive -->
</section>
```

Heading texts are exactly **"How the system is built"** and **"Deep dives"** (a suffix
naming the page's angle is allowed). Every `<figure class="diagram">` is a **sibling of
the `.prose` div, a direct child of the section — never nested inside prose**: that keeps
each dive a self-contained prose+figure pair that can be moved or reviewed as a unit,
and matches the canonical wrapper in diagram-draw's site-embedding reference. Both
blocks are hand-edited HTML — no `kb.mjs` writer exists for them; the PostToolUse hook
checks structure, not content.

## The architecture shape

Lead, board, walk, trace — in that order.

### 1. Lead — entry point and the flow at a glance

One `<p>`: where a request enters, the one structural decision that shapes everything
(a read/write split, an event-driven core, a single orchestrator), and the main flows in
a sentence each. The reader gets the whole answer here; the board is the proof.

### 2. The L1 board

One primary diagram: `flowchart TB` for a `system-design` page, `classDiagram` for a
`low-level-design` kata. How to draw it — node cap, edge labels, `:::ext` dashing — is
diagram-draw's contract (see below). What this skill adds is naming discipline: **every
node label must be a name the entities, interface or sizing blocks already use**, and
every node must reappear as a bullet in the components walk. A box that gets no bullet
is scope creep; a name the rest of the page never uses is a second vocabulary.

### 3. Components & communication

`<h3>Components &amp; communication</h3>` then a `<ul>`, one `<li>` per board node:
`<strong>Name</strong>` — its role in one clause; who it talks to and with what payload.
The first bullet names where requests enter. The bullets carry the cross-block contract:
a store bullet names the entity it holds, a service bullet names the endpoints it
serves, and the payload wording reuses the interface block's verbs and status codes.

### 4. Where each requirement lands

`<h3>Where each requirement lands</h3>` then a `<ul>` with **exactly one `<li>` per
functional requirement, in the requirements block's order**: a requirement paraphrase,
the component path that satisfies it (Component → Component → Component), and the
routing tag `→ FR: label.` — the same idiom the problem and sizing blocks use, plain text
with no `<em>` around it.

The contract: every FR gets a line, and every line names only components that exist on
the board. An FR that traces to nothing is a missing box; a box no FR or NFR ever claims
is a box to delete. The trace lives in prose, not on the diagram, because `kb.mjs get`
strips diagrams by default — the coverage proof must survive extraction.

## The deep-dive shape

Each `<h3>` in the deepdives block is one NFR argued to completion.

### One dive per NFR

Heading format: `<h3>N · Mechanism title → NFR: label</h3>` — the numbered
`N · Title` corpus idiom, extended with a routing tag whose label matches the bold NFR
label in the requirements block verbatim (Scale, Latency, Availability, …). The
contract: **every NFR appears in exactly one dive heading.** A dive may carry two tags
(`;`-joined) only when the two NFRs are genuinely satisfied by one mechanism. Order the
dives in the requirements block's NFR order unless a dependency argues otherwise.

### Anatomy of one dive

Three moves, in order:

1. **Open with a bold thesis** — one sentence on why this mechanism satisfies this NFR,
   so a reader who stops there still has the answer.
2. **Argue the options** — the naïve one with the fact that kills it, the plausible rival
   with its cost, the chosen one with its residual weakness admitted. A dive with no
   rejected option is a lecture, not a decision.
3. **Give the dive its own diagram** — zoom or iterate by the rule below; a dive that
   reuses the L1 board unchanged shows nothing the board did not already show.

### Zoom or iterate — the diagram decision

- **Zoom (L2)** when the NFR is answered inside one box — the component's internals are
  the mechanism. The zoomed diagram keeps the node's **exact L1 name**: shared names are
  the only link between levels. Prefer the zoom whenever the component's internal design
  is reusable knowledge — a range-allocating id minter or a failover pair teaches beyond
  this page.
- **Iterate the board** when the NFR forces a system-wide change — new boxes or edges
  appear, so redraw the L1 with the delta carrying the emphasis.
- The test: if you can name the single L1 node that answers the NFR, zoom into it; if
  the answer is "several" or "the shape changes", iterate. When the NFR is about one
  request's dynamics — latency, ordering, failure timing — an L3 `sequenceDiagram` is
  the zoom.

## Pattern labels — board and prose

Components are labeled with the patterns they implement, in three layers that never mix:

1. **On the board**: a node or subgraph that embodies a pattern carries the pattern's id
   as plain text after a middot inside the quoted label — `Cache[("Cache · cache-aside")]`
   — never a link (mermaid runs `securityLevel: "strict"`, and diagrams are stripped
   from extraction anyway).
2. **In prose**: the sentence arguing the mechanism carries the real
   `<a href="../patterns/…">` link. A rejected alternative is named without a link —
   `demonstrates` means *uses*.
3. **In the graph**: every prose-linked pattern gets a typed row via
   `node scripts/kb.mjs link <design> demonstrates <pattern>`; `kb.mjs refs <design>`
   flags any prose link with no typed relation.

Verify a pattern name before boarding it (`kb.mjs find`, `kb.mjs get <id> --block
usage`) — a wrongly named label is worse than no label. A pattern label with no FR or
NFR forcing that mechanism is decoration; drop it.

## Diagrams are diagram-draw's job

This skill owns *what each diagram is for and where it sits*; [diagram-draw](../diagram-draw/SKILL.md)
owns *how it is drawn* — the ~8-node/12-edge cap, verb+payload edge labels, `:::ext`
dashing with no fills, naming the requirement on the board, and the `<figure>` wrapper
in its `references/site-embedding.md`. Read it before drawing; do not restate it here.

## Wording rules

The lead, the components walk and every dive thesis are prose, and the same four rules
bind all of them:

- **Second person, active voice.** Address the reader as "you" and open directives with
  the verb — "Route the read through the cache", not "the read is routed through".
- **One concept per sentence.** A sentence that needs "and which also" is two sentences,
  and the second one is the one the reader will miss.
- **Every claim carries its consequence.** Say what the component does, then what that
  costs or buys, in the same sentence or the next: a box described without its effect is
  a box nobody can argue with.
- **No unpriced adjectives.** "Robust", "scalable", "highly available" assert nothing —
  replace each with the figure, the mechanism, or the NFR that forces it.

## Worked example

From `bitly` — the FR-coverage trace:

> ❌ *The store is a single relational instance with a read replica for failover.* — a
> replica box lands on the board, but no requirement ever claims it and no FR traces
> anywhere; the reader must trust that the boxes add up.

> ✅ *Visit a short URL and be redirected — `GET /{short_code}` enters at the edge; a
> miss falls through Read Service → Cache → URL store, and the answer is a 302.
> → FR: redirect.* — one line, one FR, a path of board names, and a status code
> the interface block can confirm.

The ❌ describes the system; the ✅ proves a requirement against it.

## Consistency with the rest of the page

Four contracts, checked side by side before shipping:

- **Names** — every board node appears in the entities, interface or sizing vocabulary;
  deepdive diagrams reuse the architecture board's labels exactly.
- **Sizing verdicts** — nothing sizing rejected may appear built on the board, and every
  capability sizing adopted has a box or an edge. When they disagree, the board is
  usually right and sizing missed a capability (see [kb-design-sizing](../kb-design-sizing/SKILL.md)).
- **Interface** — status codes, verbs and paths on diagrams match the interface block.
  Bitly shipped with a 302 argued in the interface and `301 redirect` drawn in the
  sequence diagram; the diagram is the copy nobody re-reads, so it drifts first.
- **Requirements** — dive tags and trace tags resolve to labels findable in the
  requirements block, verbatim.

## What this block is not

- **Not the sizing block.** Capabilities and numbers are decided there; here they become
  boxes and edges. No back-of-envelope arithmetic on the board.
- **Not a tech-stack listing.** A vendor name appears only where it *is* the mechanism
  (Redis's single-threaded atomic `INCR`), never as decoration.
- **Not a pattern catalogue.** Patterns earn their labels through the NFR that forces
  them; a board tiled with pattern names and no argument is the failure mode.

**Legacy note**: the corpus shape — one flowchart in architecture, prose dives, one
closing sequence diagram — stays valid until touched. This format is currently applied
to `bitly` and `persona-identification`. Migrate another page only when its design
blocks are being reworked on purpose.

## Self-check

1. Cover the prose: can the request flow be reconstructed from the L1 board alone?
   (diagram-draw's silence test.)
2. Walk the requirements block top to bottom: does every FR have a line under "Where
   each requirement lands", and every NFR a dive heading tag? This is the check that
   does the work.
3. Does every board node get a components bullet, and does every bullet's name appear
   in entities, interface or sizing?
4. Does every dive open with a bold thesis, reject at least one option, and carry its
   own diagram — zoomed nodes keeping their exact L1 names?
5. Middot pattern labels on the board, real links in prose, and
   `node scripts/kb.mjs refs <id>` shows no new untyped links?
6. Do diagram status codes and verbs match the interface block?
7. `make all && make check`, then `node scripts/kb.mjs get <id> --block architecture`
   and `--block deepdives` (add `--diagrams` to review the boards) — the extraction
   should scan as: lead, walk, trace; then thesis, options, diagram per dive.
