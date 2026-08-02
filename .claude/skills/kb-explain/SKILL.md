---
name: kb-explain
description: Write or audit a patterns-kb page's three reading levels — the cumulative explain ladder (basic/advanced/expert rungs), the data-kb-level tags that add depth for senior lenses, and the rare data-kb-register replacement variants. Use when someone asks to "write the explain ladder", "rewrite the basic/advanced/expert rungs", "audit this page at the basic lens", "tag a line for a level", "make this page read well for a junior", "the basic page is too long", or says the basic lens still shows jargon or the expert rung is vague. Also the playbook for level-audit sweeps over many pages.
---

# Authoring the three reading levels

**Lenses are CUMULATIVE.** `basic` is a short, AWS-doc-style complete page. `advanced` is
**basic plus** enough detail to run an excellent system design. `expert` is **basic plus
advanced plus** the deep dives. A higher lens never replaces what a lower one said — it
adds under the same headings. Rereading at a higher lens is the same page with more in it.

**A page passes this skill when basic reads as a whole short page, and each higher lens
reads as that page grown — not as a different page.** Every block shows at every lens
(make check fails a block that renders empty at any of them); what changes is how much
sits inside. Always judge the lens output (`kb.mjs get <id> --level …`), never the raw
file.

## The mechanism

| attribute | semantics | writer | use for |
|---|---|---|---|
| *(untagged)* | the basic core — everyone sees it | — | the short page a junior reads end to end |
| `data-kb-level` | **accretion** — visible from this level *up* | `kb.mjs level` | THE mechanism: every deepening — extra tradeoff items, mechanics, operational nuance, the sequence diagram |
| `data-kb-register` | **replacement** — rendered at *exactly* this lens | `kb.mjs register` | rare: only where showing both versions at once would be wrong |

One element carries at most ONE of the two (the writers and make check both enforce the
XOR). Sections carry neither — blocks always show. **Untagged is the basic core, not a
neutral default**: on a rich page, most existing prose belongs at `advanced` or `expert`,
and what stays untagged is the small page a junior should get.

The explain ladder's rungs carry `data-kb-level`, so at advanced you read the basic and
advanced rungs stacked, and at expert all three.

**When `register` is actually right.** Only when the deeper version *substitutes* for the
lower one rather than continuing it — near-verbatim restatement in different words, where
reading both back to back would read as a stutter or a contradiction. Examples: a
one-sentence plain-words definition that the advanced page states in precise terms
instead; a simplified diagram that the advanced page draws with its failure branches. If
the deeper text would read fine *after* the simpler text, it is a `level` tag, not a
register. Budget: 0–2 register groups per page; most pages need none.

## The three lenses — what each is for

Personas: **basic** = a junior's whole page, short; **advanced** = a senior who can run an
advanced system design; **expert** = staff/architect fluency — limitations, tradeoffs,
deep-dive discussion. Two rules bind everything: **every claim carries its consequence**,
and **no hedging stacks or unpriced adjectives**.

- **`basic` — the failure-first story.** What goes wrong without the pattern, told
  concretely, then the simple fix. Plain words, an everyday comparison if it helps, no
  jargon, no pattern names. (The AWS pattern-doc *Motivation* move: enumerate the failure
  branches — "if the write succeeds but the notification fails, …".)
  *Anti-example*: "trips open after a failure threshold" — jargon smuggled in.
- **`advanced` — the precise mechanism, variants included.** Name the mechanism in one
  breath, then the consequence; where variants differ mechanically, say how. It CONTINUES
  the basic text — no warm-up, no re-telling of the story the reader just read. "A stateful
  proxy counts recent failures and opens, so calls fail fast instead of piling up on a
  dependency that is already down."
- **`expert` — selection criteria plus the bill, and how to pay it.** When to choose it
  over the alternatives, what adopting it costs, and the counter-move for each major cost —
  name the pattern that pays the bill (sync timeouts → circuit breaker; dual writes →
  outbox/saga). For operational patterns, close on the operating loop: tune → watch →
  break → gate.
  *Anti-example*: a third paragraph that re-explains the mechanism louder.

**The stacking rule.** The rungs must compose when read top-down: basic = failure story +
simple fix; advanced = the mechanism, continuing the story; expert = selection, the bill,
counter-moves. **A sentence repeated across rungs is a defect** — at advanced the reader
sees the basic rung too, so a restated premise reads as padding.

**Rewrites are all-or-nothing.** `kb.mjs explain` replaces the whole block and requires all
three flags — read the current ladder first (`get <id> --block explain`), then rewrite.

**Rungs are plain text, and the corpus has no italics anyway.** `kb.mjs explain` escapes
what you pass it, so an `<em>` you type arrives on the page as visible `&lt;em&gt;`. The
same rule binds the elements you tag with `level`/`register` elsewhere on the page: no
`<em>`, no `<i>`, `<strong>` for a run-in label and `<code>` for an identifier. Nothing in
any stylesheet renders italic.

## Sizing bands — the hard targets

QA-scripted, not vibes: `node scripts/report-lens.mjs` prints each page's basic and expert
word counts and the verdict against this table.

| kind | basic | notes |
|---|---|---|
| pattern (implementation bands: distributed, messaging, caching, enterprise, architecture, concurrency, security) | 550–900w (~30–45% of expert) | advanced ≈ 75–85% of expert |
| pattern (conceptual: gof, functional, testing, ddd, frontend, ml) | 350–600w, or **350–750w with a `production` block** | see the operational tax below |
| hazard | 400–650w | |
| principle | 350–550w | |
| theme | framing lead + tour step names + decide table core | |
| design | 900–1,500w — problem, shape of the answer, L1 board, each block's lead | advanced adds numbers/mechanics; expert adds full dives + rubric |

**The operational tax.** A `production` block cannot be tagged out of basic: every one of
its four cards must render non-empty at every lens, so one knob, one signal, one failure
mode and one gate — 90–170 words — are mandatory before any pedagogy. That is why a
conceptual page carrying the block is banded to 750 rather than 600. Do not try to buy the
difference back by cutting variations, tradeoffs or the sketch; the block is a fixed cost,
not authored depth. A conceptual page WITHOUT the block keeps the tighter 600 ceiling.

**The design kind's navigation tax.** A design's `relationships` block is counted by
`report-lens` but cannot be tagged — kb.mjs link writes it and make check exempts it — and it
grows with the number of patterns the case study demonstrates, not with how much a junior
reads. Most designs spend 200–300 basic words there; `persona-identification` spends 715
across ~25 edges, which puts it at the ceiling on the leanest narrative of any design (779
words). Judge such a page on its narrative and leave it alone. Tagging real content away to
buy back a navigation list is how a good page gets hollowed out.

**On a rich page the tag default INVERTS.** Do not ask "is this line sophisticated enough
to hide?" — ask "does basic still fit its band?" and tag depth downward until it does. A
page with production + wild + full variations will carry 15–40 `level` tags, not the 0–6 of
a thin one. What must never be tagged out of basic: the failure story, the one-line
mechanism, the primary topology diagram, at least one item in every mandatory list, and the
plainest pro/con pair.

**Where the failure story lives is your choice of two.** Much of this corpus opens
`description` definitionally ("Leader election is a protocol by which…") and puts the force
it resolves in `p-2` — which is exactly the paragraph the sizing band pushes to `advanced`.
That is allowed. The rule is that **one** of the description lead and the explain `basic`
rung tells the failure-first story at basic, and the other does the complementary job; it
is not a requirement that the description lead be the one. What fails the page is both of
them doing the same job, or neither. So when you tag a definitional lead's `p-2` away,
re-read the `basic` rung and confirm it still carries the failure concretely — if it does
not, the paragraph stays and you pay for it elsewhere.

## The per-lens audit procedure

1. `node scripts/kb.mjs get <id> --level basic` — read the OUTPUT as a junior's whole page,
   AWS-short. Is it inside its band? Is every block present, and each one down to its
   plainest useful content? Unexplained jargon is either a level-tag candidate (push it to
   advanced) or a prose defect (rewrite it plainly, keep it in basic).
2. `--level advanced` — the same page grown. The basic content is still there; the added
   material continues it instead of restating it. Mechanism fully present, variants with
   their mechanics, the sequence diagram visible.
3. `--level expert` — the full page: sharp edges (cluster state, masking, cost bills)
   present, each major con with its counter-move.
4. Fix: weak ladder → `kb.mjs explain`; senior-only depth → `kb.mjs level`; a genuine
   substitution → author the variant paragraphs in the HTML, `make all` to mint ids, then
   `kb.mjs register` each. Re-read `--level basic`: complete, in band, coherent.
5. Gate: `node scripts/report-lens.mjs --strict` (add the page's id, or run it over the
   batch). A sweep is not done while a page is out of band.

Never hide shared symptom or definition prose from juniors to hit a number, and never pad
expert to manufacture one. If a page is honestly short — a thin hazard, a slim principle —
its bands are close together and the work is differentiation, not reduction.

## Tagging heuristics

- **The band test** (for `level` tags): does basic fit its sizing band, and does what
  remains read as a complete short page? That is the test — not "is this line advanced?".
  Within that, `advanced` earns nuance presuming operating experience or a second pattern;
  `expert` earns distributed-state, fleet-scale, or cost/organizational consequences.
- **The substitution test** (for `register` variants): would the deeper text read as a
  stutter if the reader had just read the simpler one? Only then is it a replacement.
  Otherwise tag with `level` and let them stack.
- **Never let a block — or a labelled list inside one — go lens-empty.** If every item in a
  list is tagged above basic, make check fails the page. Keep at least one basic-visible
  item in every mandatory list (that floor item is usually the block's plainest, most useful
  line anyway). **`production` is the trap**: it renders four independently labelled cards —
  Tuning knobs, Signals to watch, Failure modes under load, Readiness checklist — and the
  sizing bands push you to tag all of the first three away. Do that and the block still
  passes on its surviving checklist items while a reader at basic meets "Tuning knobs" with
  no knobs under it. Each card is checked by name, so basic keeps **one knob, one signal,
  one failure mode and two checklist gates** — budget ~110–130 words for production, and
  pick the three that read as one operating story (the dial, the thing you would alert on,
  the failure that bites first).

### Addressability — what ids exist

`make all` mints the ids; positional ones renumber when content is inserted, so re-run
`make all` before tagging.

| block | ids |
|---|---|
| tradeoffs / usage / variations / production | `tradeoffs-{pro,con}-N`, `usage-{when,avoid}-N`, `variations-item-N`, `production-{knob,signal,failure,check}-N` |
| any prose block | `<block>-p-N` on each `.prose > p`, `<block>-li-N` on each `.prose li`, `<block>-fig-N` on each `figure.diagram` |
| wild / tour / fluency | keyed: `wild-<example>`, `tour-<member>`, `fluency-<theme>` (reorder-proof) |
| deepdives | `deepdives-dive-N` on each `h3` |
| sketch | `sketch-variant-N` on each `details.sketch` |
| a sketch in any OTHER block | `<block>-sketch-N` — a design's HTTP contract, a dive's code sample |
| requirements (design) | `requirements-fr-N` on each `.functional ol > li`, `requirements-nfr-N` on each top-level `.nonfunctional > ul > li` |

An element the build mints no id for cannot be moved by a lens, so it renders at basic
forever. Where a page needs one anyway — a grouped block's `h3`/`h4`, a whole `<ol>`, an
NFR's nested sub-item — hand-mint it in the same shape (`<block>-h3-N`, `<block>-ol-N`, or a
keyed `requirements-nfr-scale-2`) and tag it; the build leaves ids it does not own alone.

Never set a level or register on a `<section>` (blocks always show) or inside the explain
block (structural — edit via `kb.mjs explain`). The writers refuse both — if one refuses
you, you were about to do the wrong thing, not fighting a bug.

## Commands

```
node scripts/kb.mjs get <id> --block explain                 # read the current ladder
node scripts/kb.mjs get <id> --level basic|advanced|expert   # the lens read to judge
node scripts/kb.mjs explain <id> --basic "…" --advanced "…" --expert "…"     # whole ladder
node scripts/kb.mjs level <id> <element-id> <basic|advanced|expert|none>     # accretion tag
node scripts/kb.mjs register <id> <element-id> <basic|advanced|expert|none>  # rare replacement
node scripts/report-lens.mjs [--json] [--strict]             # sizing-band QA over the corpus
node scripts/kb.mjs find "…" --level basic                   # search a lens's prose
node scripts/kb.mjs ls --json | jq '[.[]|select(.favourite)]'  # the starred set
```

Lens data goes ONLY through these writers — never hand-edit a `data-kb-*` attribute.
(Variant *paragraphs* are ordinary prose: write them in the HTML, `make all` mints their
ids, then tag.) The post-edit hook runs `make check` (~5s) on every site/**.html edit; a sweep's
orchestrator runs `make all && make check` once per batch, and all lens QA runs POST-build.

**Never run `make all` while authoring agents are still writing.** It rewrites the generated
region of every page in the corpus, so a build racing an agent's write can clobber it. Let
the batch go quiet first; until it does, `kb.mjs validate --file <path>` is the per-page gate
and it needs no build. Tagging alone never moves an id — only inserting or deleting an
element does — so a deferred build costs nothing but the staleness warning.

## Self-check (per page)

1. All three lens reads done, judged as pages for their audience — not skimmed as diffs.
2. Basic output: in its sizing band, every block present, the failure-first story carried by
   either the description lead or the `basic` rung (not both, not neither), the topology
   diagram visible, no unexplained jargon.
3. Advanced and expert read as basic grown, not as separate pages: no sentence repeated
   across rungs, no added paragraph that restates what a lower lens already said.
4. Expert argues selection, costs and counter-moves, not the mechanism again.
5. Every `register` group passes the substitution test; anything that merely deepens is a
   `level` tag instead.
6. No block renders empty at any lens (make check enforces; don't rely on it).
7. `report-lens.mjs --strict` green for the page; hook green after every edit; anything
   untaggable-but-broken reported, not silently rewritten.
