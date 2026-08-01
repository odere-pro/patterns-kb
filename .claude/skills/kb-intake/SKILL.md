---
name: kb-intake
description: Merge a pattern discovered on the web into patterns-kb — triage against the existing pages, compare the web explanation with ours block by block, then improve the existing page, skip the candidate when the KB is already ahead, or create a new page. Use when someone says "I found this pattern on the web, add or update the KB", "compare this article with our page", "import these patterns from this URL/list", or wants a recurring intake sweep of web-discovered patterns.
---

# kb-intake — improve, skip, or create, from a web-discovered pattern

The repeatable intake loop: candidates in (URLs, pattern names, or both — one or many per
run), and for each one exactly one verdict out: **IMPROVED**, **SKIPPED**, or **CREATED**.
Unlike `kb-fact-check`, which only writes findings, this skill **applies** its changes — it
is the edit step. The full data contract is
**[.claude/rules/html5-authoring.md](../../rules/html5-authoring.md)**; everything below is
the procedure plus the rules you need inline.

Read the KB through the CLI, never by opening a `.html` — a page is ~3.6k tokens of markup
for ~1.2k of prose:

```
node scripts/kb.mjs find "<words>"            # symptom/name search over all pages
node scripts/kb.mjs get <id> [--block b] [--json] [--diagrams]
node scripts/kb.mjs related <id>
```

## The loop — per candidate

### 1. Triage against the KB, before fetching anything

```
node scripts/kb.mjs find "<pattern name>"
node scripts/kb.mjs find "<the symptom it fixes, in plain words>"   # 2–3 phrasings
```

A name miss is not proof of absence — the KB may hold it under another name, so search the
symptom too, and check ids referenced by other pages that have no page of their own:
`node -e "console.log(require('./site/assets/graph.json').stubNeighbors)"`.

Verdict per candidate:

| verdict | meaning | next step |
|---|---|---|
| `EXISTS` | a KB page covers the same mechanism | §2–§4: fetch, compare, improve or skip |
| `EXISTS-AS-VARIANT` | it is a variation of a KB page, not a peer | usually a `variations` entry + alias on that page, not a new page |
| `NEW` | no page and no covering variant | §2, then §5: create — if it clears the new-page bar |
| `OUT-OF-SCOPE` | not a software design pattern (a product, a tutorial, a vague practice) | SKIP, one-line reason |

### 2. Capture the web explanation as facts, not prose

Fetch the URL with WebFetch (browser tools if the page is login-gated). For a bare name
with no URL, search for the canonical write-up first. Extract **neutral bullet facts**:
intent, mechanism, variants, tradeoffs, applicability ("use when…"), named real
implementations, related patterns. Not the source's sentences.

**No-laundering rule:** nothing the source wrote lands in `site/` — the KB is public and
the source's prose is copyrighted. Every claim you carry forward is restated in your own
words, in the house register (second person, failure-first, every claim carries its
consequence — `.claude/rules/tone.md`). No 8-word run of a source may survive into a page.

### 3. Compare block by block (`EXISTS` only)

```
node scripts/kb.mjs get <id> --json --diagrams
```

Diff the captured facts against what the page already says. Classify each genuine gain:

- **missing variation** — the web names a variant our `variations` block lacks
- **missing tradeoff** — a real con/limit our `tradeoffs` block omits
- **missing / wrong "In the wild" entry** — subject to the anti-fabrication bar in §6
- **missing relationship** — a typed edge to a page we already have
- **missing alias** — a genuinely used alternate name (never an invented one)
- **better `solves` phrasing** — the article surfaces symptom words ours lack
- **factual error** — ours says something the better source contradicts

**KB-ahead is a success, not a failure to route around.** If the web source adds nothing
the page does not already say — the common case for a mature page — the verdict is
**SKIPPED (kb-ahead)** with a one-line reason. Never invent an edit to justify the run.

### 4. Improve (`EXISTS` with gains)

Follow the kb-edit discipline — the writers validate; hand-edited attributes break:

| what | how |
|---|---|
| prose in a block | edit the HTML directly — four inline elements only: `<a>` `<strong>` `<code>` `<abbr>`; **never `<em>`/`<i>`** |
| aliases / tags / solves | `kb.mjs set <id> --aliases … --tags … --solves …` — never hand-edit the attribute |
| "In the wild" | `kb.mjs wild <id> --items '[…]'` — it **replaces the whole list**: dump the current one with `get <id> --block wild --json` and re-supply it with your addition, never re-typed from the rendered prose |
| production block | same replace-whole-block rule via `kb.mjs production`, dumped with `get <id> --block production --json` |
| add a relationship | `kb.mjs link <id> <verb> <other> --note "…" --note-back "…"` — writes both pages; verbs are closed (site/vocab.html) |
| a new tag | only if already in `TAGS` (`scripts/lib/model.mjs`); add to `TAGS` first, and only if it honestly applies to 3+ pages |
| anything `<!-- kb:generated -->` | do not touch — `make all` overwrites it |

Rewriting a wrong claim beats deleting it — a corrected note teaches more than a gap. If
you cannot make it accurate, drop it.

### 5. Create (`NEW` that clears the bar)

Follow the kb-add procedure end to end:

1. Decide kind, band and group (`BANDS` in `scripts/lib/model.mjs`) — the path must match.
2. `node scripts/kb.mjs new <id> --kind pattern --band <band> [--group <g>] --name "…" --order <n>`
   — order is **editorial, not alphabetical**: insert where it belongs pedagogically and
   renumber the neighbours. Then `node scripts/build.mjs` once, so the writers know the id.
3. Study the exemplar (`kb.mjs get circuit-breaker`) and write every block in order, from
   the **captured facts in your own words**: description, the three-rung explain ladder
   (`kb.mjs explain <id> --basic … --advanced … --expert …`), structure with its numbered
   topology walk, variations, tradeoffs, usage, sketch.
4. Wire relationships on **both** sides with `kb.mjs link`; metadata with `kb.mjs set`
   (symptomatic `solves` — the words of someone who does not know the page exists yet).
5. Tag depth for the lenses (`kb.mjs level`) after `make all` has minted element ids.

### 6. The new-page and wild bar — anti-fabrication

A pattern earns a page only if it is **recognized beyond the one article**: a second
independent source, or a canonical corpus (AWS/Azure/GCP architecture guidance, Wikipedia,
Fowler, GoF / EIP / PoEAA). One blog's private coinage → **SKIPPED (uncorroborated)**,
recorded as such. The same standard governs every "In the wild" entry and every
`production` knob/signal: a named product feature or parameter you are sure exists, or
nothing. When unsure, omit — a three-item list of true things beats five with one lie.

### 7. Verify

```
make all && make check
```

Then prove it landed rather than assuming:

```
node scripts/kb.mjs find "<the candidate's symptom>"   # does the page come back?
node scripts/kb.mjs related <id>                       # both sides wired?
```

Note `make all` runs build.mjs before build-pages.mjs — after a structural edit, re-run
`node scripts/build.mjs` if `make check` reports a stale graph.

## The report — every run ends with this table

| candidate | source | verdict | detail |
|---|---|---|---|
| write-behind cache | url | IMPROVED | +1 variation, +1 wild entry, retagged |
| sidecar-less mesh | url | SKIPPED (kb-ahead) | page already covers ambient mode |
| cell-based architecture | url | CREATED | `site/patterns/distributed/…` + 4 edges |
| "the lasagna pattern" | blog | SKIPPED (uncorroborated) | single-blog coinage |

Repeated runs are the point: the table is the audit trail, and a run that only produces
SKIPPED rows is a healthy run over a mature KB.
