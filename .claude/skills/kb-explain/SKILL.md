---
name: kb-explain
description: Write or audit a patterns-kb page's three reading levels — the explain ladder (basic/advanced/expert rungs), the data-kb-register variant groups that adapt prose per lens, and the data-kb-level tags that accrete detail for senior lenses. Use when someone asks to "write the explain ladder", "rewrite the basic/advanced/expert rungs", "add a register variant", "audit this page at the basic lens", "tag a line for a level", "make this page read well for a junior", or says the basic lens still shows jargon or the expert rung is vague. Also the playbook for level-audit sweeps over many pages.
---

# Authoring the three reading levels

**A page passes this skill when each lens reads as the SAME complete page, adapted to
its audience — same skeleton, different depth.** Every block shows at every lens (make
check fails a block that renders empty at any of them); what changes between lenses is
the content inside. Rereading at a higher lens repeats the idea with more depth — that
repetition-with-deepening is the design, not a flaw. Always judge the lens output
(`kb.mjs get <id> --level …`), never the raw file.

## The two mechanisms

| attribute | semantics | writer | use for |
|---|---|---|---|
| `data-kb-register` | **variant** — rendered at *exactly* this lens | `kb.mjs register` | the same idea re-explained per level: adapted prose, a simple-vs-full diagram or sketch |
| `data-kb-level` | **accretion** — visible from this level *up* | `kb.mjs level` | extra detail seniors get: more tradeoff items, operational nuance |

An element with neither is universal. One element carries at most ONE of the two (the
writers and make check both enforce the XOR). Sections carry neither — blocks always
show.

**Variant groups.** A maximal run of *adjacent* siblings carrying `data-kb-register` is
one group; registers must ascend without repeats. Any subset works — a lone `basic`
rung above shared prose reads as "simple lead-in, then the common text"; a full
basic/advanced/expert triple swaps the whole passage per lens. The explain ladder is
the canonical group. **The decision rule:** if the lower lens needs the idea *said
differently*, write a register variant; if it just needs *less*, tag the extras with
`level`.

## The three registers — what each lens is for

Personas: **basic** = a junior's quick intro; **advanced** = a senior who can run an
advanced system design; **expert** = staff/architect fluency — limitations, tradeoffs,
deep-dive discussion. Two rules bind every rung: **every claim carries its
consequence**, and **no hedging stacks or unpriced adjectives**.

- **`basic` — the failure-first story.** What goes wrong without the pattern, told
  concretely, then the simple fix. Plain words, an everyday comparison if it helps, no
  jargon, no pattern names. (The AWS pattern-doc *Motivation* move: enumerate the
  failure branches — "if the write succeeds but the notification fails, …".)
  *Anti-example*: "trips open after a failure threshold" — jargon smuggled in.
- **`advanced` — the precise mechanism, variants included.** Name the mechanism in one
  breath, then the consequence; where variants differ mechanically, say how. No warm-up
  sentence, no analogy. "A stateful proxy counts recent failures and opens, so calls
  fail fast instead of piling up on a dependency that is already down."
- **`expert` — selection criteria plus the bill, and how to pay it.** When to choose it
  over the alternatives, what adopting it costs, and the counter-move for each major
  cost — name the pattern that pays the bill (sync timeouts → circuit breaker; dual
  writes → outbox/saga). For operational patterns, close on the operating loop: tune →
  watch → break → gate.
  *Anti-example*: a third paragraph that just re-explains the mechanism louder.

**Each rung stands alone.** Display is exact-match: at advanced only the advanced rung
renders, so no rung may lean on another ("as noted above" pointing at a hidden rung is
a defect).

**Rewrites are all-or-nothing.** `kb.mjs explain` replaces the whole block and requires
all three flags — read the current ladder first (`get <id> --block explain`), then
rewrite.

## The per-lens audit procedure

1. `node scripts/kb.mjs get <id> --level basic` — read the OUTPUT as a junior's whole
   page. Every block should be present and compact; unexplained jargon is either a
   register-variant candidate (say it more simply at basic), a level-tag candidate
   (hide the extra from basic), or a prose defect (flag it).
2. `--level advanced` — a senior's page. Mechanism fully there? Variants with their
   mechanics? Nothing patronizing left over from basic?
3. `--level expert` — the full page: sharp edges (cluster state, masking, cost bills)
   present, each major con with its counter-move.
4. Fix: weak ladder → `kb.mjs explain`; idea needs re-saying → author the variant
   paragraphs in the HTML, `make all` to mint ids, then `kb.mjs register` each rung;
   senior-only detail → `kb.mjs level`. Re-read `--level basic`: complete, compact,
   coherent.
5. Heuristic (not a gate), per kind — calibrated on the pilots: a rich pattern page
   (production + wild + full variations) honestly floors around basic ≈ 60–70% of
   expert (circuit-breaker: 67%); designs reach lower (≈40–60%) because sizing/
   deepdives depth is genuinely senior. On SHORT kinds (hazards, principles, slim
   themes) most prose serves all three audiences — there the goal is register
   DIFFERENTIATION, not size reduction: distinct voices, expert ≥ ~25% deeper than
   basic. Never hide shared symptom/definition prose from juniors to hit a ratio,
   and never pad expert to manufacture one.

## Tagging and variant heuristics

Untagged is the default and the right one for most lines.

- **The hiding test** (for `level` tags): does hiding this line genuinely help the
  lower audience read the page? "Is this line sophisticated?" is not the test.
  `advanced` earns nuance presuming operating experience or a second pattern;
  `expert` earns distributed-state, fleet-scale, or cost/organizational consequences.
  Budget: 0–6 tags per page; 0 is legitimate.
- **The re-saying test** (for `register` variants): would the junior be better served
  by a *different sentence* than by fewer sentences? Then write the variant. Budget:
  0–3 variant groups per page beyond the explain ladder; most pages need 0–1.
  Typical uses: the description lead, a simple-vs-full code sketch
  (`sketch-variant-N` on `details.sketch`), a solution-only vs failure-state diagram.
- **Never let a block go lens-empty.** If every item in a list is tagged above basic,
  make check fails the page — keep at least one basic-visible item in every mandatory
  list (that floor item is usually the block's plainest, most useful line anyway).

### Addressability — what ids exist

`make all` mints the ids; positional ones renumber when content is inserted, so re-run
`make all` before tagging.

| block | ids |
|---|---|
| tradeoffs / usage / variations / production | `tradeoffs-{pro,con}-N`, `usage-{when,avoid}-N`, `variations-item-N`, `production-{knob,signal,failure,check}-N` |
| any prose block | `<block>-p-N` on each `.prose > p` |
| wild / tour / fluency | keyed: `wild-<example>`, `tour-<member>`, `fluency-<theme>` (reorder-proof) |
| deepdives | `deepdives-dive-N` on each `h3` |
| sketch | `sketch-variant-N` on each `details.sketch` |

Never set a level or register on a `<section>` (blocks always show) or inside the
explain block (structural — edit via `kb.mjs explain`). The writers refuse both — if
one refuses you, you were about to do the wrong thing, not fighting a bug.

## Commands

```
node scripts/kb.mjs get <id> --block explain                 # read the current ladder
node scripts/kb.mjs get <id> --level basic|advanced|expert   # the lens read to judge
node scripts/kb.mjs explain <id> --basic "…" --advanced "…" --expert "…"     # whole ladder
node scripts/kb.mjs register <id> <element-id> <basic|advanced|expert|none>  # variant rung
node scripts/kb.mjs level <id> <element-id> <basic|advanced|expert|none>     # accretion tag
node scripts/kb.mjs find "…" --level basic                   # search a lens's prose
node scripts/kb.mjs ls --json | jq '[.[]|select(.favourite)]'  # the starred set
```

Lens data goes ONLY through these writers — never hand-edit a `data-kb-*` attribute.
(Variant *paragraphs* are ordinary prose: write them in the HTML, `make all` mints their
ids, then tag with `register`.) The post-edit hook runs `make check` (~0.8s) on every
site/ edit; a sweep's orchestrator runs `make all && make check` once per batch.

## Self-check (per page)

1. All three lens reads done, judged as pages for their audience — not skimmed as diffs.
2. Basic output: every block present and compact; failure-first story up top; no
   unexplained jargon; the basic rung stands alone.
3. The three rungs do not repeat each other; expert argues selection, costs and
   counter-moves, not the mechanism again.
4. Every `level` tag passes the hiding test; every `register` group passes the
   re-saying test, sits on adjacent siblings, ascends without repeats.
5. No block renders empty at any lens (make check enforces; don't rely on it).
6. Hook green after every edit; anything untaggable-but-broken reported, not silently
   rewritten.
