---
name: kb-explain
description: Write or audit a patterns-kb page's three reading levels — the explain ladder (basic/advanced/expert rungs) and the authored data-kb-level tags that slim the lower lenses. Use when someone asks to "write the explain ladder", "rewrite the basic/advanced/expert rungs", "audit this page at the basic lens", "tag a line for a level", "make this page read well for a junior", or says the basic lens still shows jargon or the expert rung is vague. Also the playbook for level-audit sweeps over many pages.
---

# Authoring the three reading levels

**A page passes this skill when each lens reads as a complete page for its audience —
not when it has three paragraphs and some tags.** The lens mechanism already exists;
your job is judgment: write the three rungs in three genuinely different registers, and
tag the few lines whose *hiding* makes the junior read better. Always judge the lens
output (`kb.mjs get <id> --level …`), never the raw file.

## The three registers

One short paragraph per rung, written via `kb.mjs explain`. Each rung stands alone — the
basic lens shows only the basic rung, so no rung may lean on another.

- **`basic`** — a junior's entry point. Plain words, an everyday comparison if it helps,
  no jargon, no pattern names. A smart newcomer gets it on one read.
  *Anti-example*: "trips open after a failure threshold" — that is jargon smuggled into
  the basic rung; a junior doesn't know what "trips open" means yet.
- **`advanced`** — a senior's register. Name the mechanism precisely and get to the
  point; tech and architectural detail belong here. No warm-up sentence, no analogy.
- **`expert`** — a staff register. Impact, why and when to choose it, and the tradeoff
  bill: what does adopting this cost, and what failure mode does the choice buy?
  *Anti-example*: a third paragraph that just re-explains the mechanism louder.

The corpus exemplar is `circuit-breaker`
(`node scripts/kb.mjs get circuit-breaker --block explain`): basic is the fuse-in-a-house
comparison; advanced is "a stateful proxy … counts recent failures … opens … half-opens";
expert opens with *when to choose it* ("failure mode is slow-or-flapping rather than
cleanly down") and closes with the bill ("the cost is tuning … a mis-tuned breaker flaps
or masks recovery").

**Rewrites are all-or-nothing.** `kb.mjs explain` replaces the whole block and requires
all three flags — to fix one rung you must re-supply the other two verbatim, or you
destroy them. Read the current ladder first (`get <id> --block explain`), then rewrite.

## The per-lens audit procedure

For each page, in this order:

1. `node scripts/kb.mjs get <id> --level basic` — read the OUTPUT as a junior's whole
   page. Does every visible line earn its place for that reader? An unexplained jargon
   line in usage or tradeoffs is either a tag candidate (hide it from basic) or evidence
   the line itself is unclear (a prose problem — flag it, don't fix it here).
2. `--level advanced` — a senior's page. Is the mechanism fully there? Are the
   pair-with-another-pattern and operational-nuance lines visible? Nothing patronizing
   left over?
3. `--level expert` — the full page. Are the sharp edges present — cluster state,
   masking, cost bills — and tagged no *lower* than they deserve?
4. Weak ladder → rewrite via `kb.mjs explain` (all three rungs). Role-specific line →
   tag via `kb.mjs level`. Then re-read `--level basic`: it must be slimmer AND still
   coherent — no dangling "as noted above" pointing at a hidden line.

## Tagging heuristics

Untagged is the default and the right one for most lines. Semantics are **min-level**:
`data-kb-level="advanced"` means "visible from advanced up"; a tag never *adds* content,
it only hides the line from lenses below it.

**The hiding test** — every tag must pass it: *does hiding this line genuinely help the
lower audience read the page?* "Is this line sophisticated?" is not the test. A line a
junior can parse and profit from stays untagged, however senior its topic.

- **`advanced` earns**: nuance that presumes operating experience or knowledge of a
  second pattern. Corpus exemplars: circuit-breaker `tradeoffs-con-2` ("An open breaker
  can mask a dependency that's only mildly degraded") and retry-backoff `usage-avoid-3`
  (pair it with circuit-breaker).
- **`expert` earns**: distributed-state, fleet-scale, or cost/organizational
  consequences. Exemplar: circuit-breaker `tradeoffs-con-3` ("Per-instance breakers
  don't share state; a cluster may trip unevenly").
- **Budget: 0–6 tags per page. 0 is a legitimate outcome.** Never tag to look thorough —
  the audit's depth is in the three lens reads, not the tag count.

### What is taggable — the addressability boundary

`kb.mjs level` targets elements by their stable id, and only stamped ITEMS carry one:

| block | ids | worth tagging? |
|---|---|---|
| tradeoffs | `tradeoffs-{pro,con}-N` | **yes** — the main surface |
| usage | `usage-{when,avoid}-N` | **yes** — the other main surface |
| variations | `variations-item-N` | only an `expert` tag changes anything — the block is already policy-stamped `advanced` |
| production | `production-{knob,signal,failure,check}-N` | **no** — the block is policy-stamped `expert`; an item tag is a visibility no-op |

Description, structure and sketch prose, wild items, and relationship notes carry **no
ids** and are honestly out of scope — if a page's basic read is bloated by description
prose, flag it for a separate kb-edit prose pass rather than reaching for machinery.
**Principles have no item ids at all**: their per-lens quality is the ladder plus the
policy-stamped `overreach` block — ladder-only, and that's fine.

Never set a level on a `<section>` (block visibility is `BLOCK_LEVELS` policy in
`scripts/lib/model.mjs`, stamped by the build) or inside the explain block (its levels
are structural). The writer refuses both — if it refuses you, you were about to do the
wrong thing, not fighting a bug.

## Commands

```
node scripts/kb.mjs get <id> --block explain                 # read the current ladder
node scripts/kb.mjs get <id> --level basic|advanced|expert   # the lens read to judge
node scripts/kb.mjs explain <id> --basic "…" --advanced "…" --expert "…"   # whole ladder
node scripts/kb.mjs level <id> <element-id> <basic|advanced|expert|none>   # one tag
node scripts/kb.mjs find "…" --level basic                   # search a lens's prose
node scripts/kb.mjs ls --json | jq '[.[]|select(.favourite)]'  # the starred set
```

Level data goes ONLY through these writers — never hand-edit a `data-kb-*` attribute.
The post-edit hook runs `make check` (~0.8s) on every site/ edit; a sweep's orchestrator
runs `make all && make check` once at the end (do not run `make all` per page).

## Self-check (per page)

1. All three lens reads done, judged as pages for their audience — not skimmed as diffs.
2. Basic output: no unexplained jargon; every visible usage/tradeoffs line parseable by
   a junior; the basic rung stands alone.
3. The three rungs do not repeat each other; expert argues impact/when/cost, not the
   mechanism again.
4. Every tag names its element id and passes the hiding test in one sentence; total 0–6.
5. Basic re-read after tagging: slimmer and still coherent, no dangling references.
6. Hook green after every edit; anything untaggable-but-broken reported, not silently
   rewritten.
