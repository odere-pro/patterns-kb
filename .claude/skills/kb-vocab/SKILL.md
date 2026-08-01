---
name: kb-vocab
description: Review, extend or retire the patterns-kb vocabularies — the closed tag set, the 17 relation verbs, the reading levels, the authored data-kb-* attributes, and the search synonym table that bridges a searcher's words to the corpus's. Use when someone asks to "add a tag", "retire a tag", "audit the vocabulary", "the search doesn't find this page", "add a synonym", "regenerate the expansion table", "why is make check complaining about a tag", "document a new data-kb attribute", "update vocab.html", or "what does kb:prerequisite mean".
---

# Evolving the vocabularies

Five vocabularies describe every page. Four are **closed** — a value outside the set fails
the build. The fifth, the synonym table, is open but structurally validated. All five live
in `scripts/lib/model.mjs` except the table, and **none of them may be edited alone**: each
has a page, a projection or a check that must move with it.

| Vocabulary | Source | Enforced by | Breaks if wrong |
|---|---|---|---|
| Tags (65) | `TAGS` | `build.mjs`, `validate.mjs`, `audit-vocab.mjs` | a page filters into nothing |
| Relation verbs (17) | `RELATION_TYPES` | `build.mjs`, `audit-relations.mjs` | a one-way or dangling edge |
| Reading levels (3) | `LEVELS` | `validate.mjs` | a block renders empty at a lens |
| Attributes (22) | `ATTRIBUTES` | `audit-vocab.mjs` | an undocumented attribute ships |
| Synonyms | `SYNONYMS` + `scripts/data/expansion-synonyms.json` | `expansions.mjs`, `audit-vocab.mjs` | a bridge that never fires |

**Not in scope:** the editorial ordering arrays in the same file — `BANDS`,
`THEME_GROUPS`, `DESIGN_GROUPS`, `HAZARD_ORDER`, `PRINCIPLE_GROUPS`, `CAPABILITY_ORDER`,
`COMPARISON_ORDER`. They decide where a page appears on the hub, not what it may say about
itself, and nothing here validates them. That is the **kb-hub** skill.

**Start every task here:**

```
node scripts/report-vocab.mjs          # the worklist; --json for structured output
node scripts/audit-vocab.mjs           # the pass/fail gate, also run by make check
```

## Reading the report

1. **Drift ledger** — vocabulary size and hash now versus stamped. Drift is a *warning*:
   coverage has degraded, nothing is broken. `hard errors` is the number that must be zero.
2. **Unbridged pages** — pages no synonym points at, reachable only by typing a word from
   their own name. This is the authoring worklist.
3. **Table health** — dead targets, over-broad targets, curated collisions, fan-out.
4. **Tag audit** — usage counts, per-kind averages, kind-marker candidates.
5. **Next** — the command sequence.

## Adding a tag

A tag exists to group. One that groups nothing is worse than none, because it spends one of
a page's five slots. Before adding to `TAGS`:

- **It applies to 3+ pages that already exist.** Not "will apply once I write them" —
  `audit-vocab.mjs` fails the build on any tag under three uses, so a speculative tag turns
  the build red the moment you commit it.
- **It is a concept, not a kind marker.** A tag that lands on every page of one kind and
  nowhere else says what `data-kb-kind` already says; the Kind facet groups those pages for
  free. `audit-vocab.mjs` warns (T3) when it detects one.
- **It is not a near-duplicate.** Check the existing set for a neighbour first —
  `testing`/`testability`/`test-doubles` and `buffering`/`backpressure`/`batching` are the
  live examples of a distinction that was drawn too finely.
- **It goes in alphabetical position.** The set is sorted; a tag appended to the end is a
  merge conflict waiting to happen.

Then tag the pages in the same change: `node scripts/kb.mjs set <id> --tags '["a","b"]'`.
The writer rejects an unknown tag and a count outside 2-5 before it reaches a file.

## Retiring a tag

Criteria: under three uses, a kind marker, or subsumed by a neighbour. **The honest cost is
retagging every page that carries it** — removing the tag from `TAGS` without that fails the
build on every one of those pages. That makes retirement a separate, explicitly-approved
act, not something to slip into another change.

Standing candidates, with counts from the last audit (re-run the report; they move):
`test-doubles` (5, testing band only), `immutability` (5), `legacy` (6), `authentication`
(6), `instantiation-control` (7, essentially gof-only), `buffering` (7, overlaps
`backpressure`), `transformation` (8), `code-smell` (8, essentially the hazard kind).
`principle` pages average 3.48 tags and never reach five — the one kind worth enriching
rather than trimming.

## The synonym table

Two layers, and **curated always wins**: `mergedSynonyms()` spreads
`expansion-synonyms.json` *under* `SYNONYMS`, so a key in both takes the curated value
wholesale and any target only the table names is dead. The report lists collisions.

**The rule that governs every bridge:** both scorers substring-match, so a corpus word
already retrieves itself. `"microservice"` finds a page saying `microservices` with no help.
**A bridge pays only where the word a searcher types differs from the word the corpus
uses** — which is why counting "new words since the last stamp" measures nothing, and why
295 of the existing keys are themselves corpus words. The table is morphological and
near-synonym bridging, not vocabulary import.

Adding a bridge, in order:

1. `node scripts/report-vocab.mjs` — take a page from **Unbridged pages**.
2. Ask what someone with that problem would type who does not know the page's name. Plain
   English and ops vocabulary pay best; the obvious technical word usually matches already.
3. Check the key does not already match directly. If any page's id, name, essence, aliases,
   tags or solves *contains* the key as a substring, the bridge is dead weight.
4. Pick targets **from the corpus vocabulary**. An invented target is the most common
   mistake — `saturated`, `fragile` and `coupling` all read like corpus words and are not.
5. Add to `expansion-synonyms.json`, alphabetically, 1-4 targets.

Structural rules `make check` enforces, so you cannot ship a broken one: key is a
lowercase word of 3+ characters and not a stopword; 1-4 targets; no self-reference; every
target is in the corpus vocabulary; **no target that contains its key** (the shorter key
already matched it — note this is directional, `alerting → alert` is the whole point);
no duplicate targets; keys sorted; `meta` well-formed.

Two rules the machine cannot check, so they are yours: **do not bridge to a broad word**
(the report flags targets appearing on 40+ pages — bridging to `latency` or `resilience`
floods every result set), and **do not add a marginal bridge for the count**. Ranking is
zero-sum; the parity test's podium floor is the canary, so run `make test` every ~20 keys
rather than once at the end, or a regression cannot be bisected.

## Re-stamping

```
node scripts/report-vocab.mjs --restamp    # re-sorts keys, refreshes corpusHash/vocabSize/entries
make all                                   # MANDATORY — reprojects catalog.synonyms
```

Re-stamp at a release boundary, **not after every page**. The drift warning is
informational by design: the corpus grows constantly, and a stamp chased page-by-page is
noise. `--restamp` is the only write mode in the tool, and because the file round-trips
byte-identically the diff is exactly the stamp.

**`make all` after any table edit is not optional.** `catalog.json` and `catalog.js` embed
the merged map; skip the rebuild and both `build.mjs --check` and the search-parity test
fail, and they will look like two unrelated failures.

## Touching vocab.html

**Never edit it.** It is generated by `scripts/build-vocab.mjs` as a pure function of
`model.mjs`, which is what keeps the ontology and the prose describing it the same thing.
Edit the model, then the generator if the page needs a new section, then run
`node scripts/build-vocab.mjs` — `--check` demands byte-identity, so a stale page fails the
build.

Adding a term to `RELATION_TYPES`, `ATTRIBUTES` or `JSONLD_PROPS` without a rendered
fragment fails `audit-vocab.mjs` (V2). Adding a `data-kb-*` to the toolchain without an
`ATTRIBUTES` entry fails V1. Emitting a `kb:` term in the JSON-LD with no definition fails
V3. These exist because the page claims every term resolves to a fragment on it, and that
claim was false for sixteen attributes before anything checked it.

## Verification

```
node scripts/audit-vocab.mjs
node scripts/build-vocab.mjs && node scripts/build-vocab.mjs --check
make all && make all && make check && make test
```

The **double `make all` is deliberate**: `build-pages.mjs` runs after `build.mjs`, so a
structural edit leaves `graph.json` stale after a single pass. Then spot-check retrieval,
because a structurally valid bridge can still be useless:

```
node scripts/kb.mjs find "<the words a searcher would actually type>"
```
