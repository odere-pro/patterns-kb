---
name: kb-harvest
description: Harvest software patterns, best practices, antipatterns and system designs from public web sources — vendor architecture portals (AWS, Azure, Google Cloud) and public GitHub repos, including link-hub "awesome" lists followed one curated hop — into RAW vendor-agnostic captures under tmp/, then hand each candidate to kb-intake for the merge verdict. Extracts the whole explanation (text, code, diagrams); diagrams and images of diagrams are re-drawn as mermaid, never copied; product names are quarantined into evidence, never the pattern body. Use when someone asks to "harvest patterns from the Azure/AWS/Google Cloud architecture docs", "sweep this awesome-list for the KB", "extract everything from this GitHub patterns repo", "scrape this docs portal for patterns/best practices/system designs", or wants a recurring candidate-discovery sweep feeding kb-intake.
---

# kb-harvest — harvest public sources into raw, agnostic pattern captures

The upstream half of the intake pipeline: **discover → curate → triage → capture → hand to
kb-intake**. This skill stops at raw captures plus a ledger — only `kb-intake` writes to
`site/`. Three invariants hold on every run:

1. **Two-stage.** A capture is raw substrate, not a page. Authoring is `kb-intake`'s job.
2. **One hop, curated.** A link hub's links are followed exactly one level, and only the
   links the operator picked. There is no recursive crawl, ever.
3. **Everything lands in gitignored `tmp/kb-harvest/`** — no site name, no source prose,
   nothing harvested touches the repo.

```
tmp/kb-harvest/
├── ledger.json                        cumulative candidate ledger, the machine index
├── .cache/                            transient image downloads for Read; delete after use
└── captures/<source-id>/<slug>/
    ├── <slug>.capture.json            machine facts (schema: capture.schema.json)
    └── <slug>.md                      the raw agnostic capture (fixed sections)
```

## 1. Source types — how handling differs

| source type | example shape | discover candidates by | fetch body by | capture unit |
|---|---|---|---|---|
| vendor doc portal | a cloud architecture center's pattern catalog | the profile's `catalogUrls` — fetch the catalog page(s), list entries + hrefs | WebFetch first, browser fallback (§4) | one pattern page |
| GitHub content repo | a repo whose `.md` files are the articles | `gh api repos/<o>/<r>/git/trees/<branch>?recursive=1` → filter `.md` paths | `https://raw.githubusercontent.com/<o>/<r>/<branch>/<path>` | one `.md` file |
| GitHub link hub | an awesome-list: a TOC of external links | hub README via raw.githubusercontent → sections → links | **one hop** per curated link, escalation ladder in §4 | one linked page |

Vendor portals have committed profiles in [`sources/`](sources/) (`id`, `catalogUrls`,
`politenessDelayMs`, `brandTerms`, `fetchNotes`). GitHub sources need no profile file —
name the repo in the run; its ledger `id` is `<owner>--<repo>`.

Two hub rules: a hub's **internal** links (other `.md` in the same repo) are content-repo
files, not hops; a linked page that turns out to be **another link hub** is recorded
`OUT-OF-SCOPE (second-order hub)` — the one-hop rule is absolute.

## 2. Phase A — Discover and curate (build the ledger)

Enumerate candidates per the table above into `tmp/kb-harvest/ledger.json`. Facts only —
titles, URLs, section names — no body prose. The ledger is **cumulative across runs**: load
the existing one and append, so past verdicts keep deduplicating future sweeps.

```json
{ "capturedAt": "<ISO or unknown>",
  "sources": [ { "id": "…", "kind": "vendor-portal|github-repo|github-hub", "url": "…",
    "sections": [ { "name": "…", "curated": true } ],
    "candidates": [ { "slug": "…", "title": "…", "url": "…", "hop": 0,
      "curated": true, "triage": "NEW", "kbId": null,
      "status": "discovered|captured|handed-off", "intakeVerdict": null } ] } ] }
```

Then the **curation stop**: present the discovered sections/candidates as a compact table
and let the operator pick what proceeds (`curated: true`). Never auto-select an entire
hub — a 600-link awesome-list is a menu, not a work queue. If the operator already named
the targets in the request ("the resilience section", "these five patterns"), that is the
curation; mark it and continue.

## 3. Phase B — Triage before any deep fetch

Per curated candidate, **before** fetching its body:

```
node scripts/kb.mjs find "<pattern name>"
node scripts/kb.mjs find "<the symptom it fixes, in plain words>"   # 2–3 phrasings
```

plus a ledger dedup check: same canonical URL or slug already captured, this run or a
prior one. Verdicts route:

| triage | route |
|---|---|
| `NEW` | deep capture (§5–§6), then handoff |
| `EXISTS` / `EXISTS-AS-VARIANT` | **no deep capture** — record the KB id in `kbId`, hand the bare URL to kb-intake, which block-diffs it itself |
| `DUP` | drop, one-line reason (already in ledger/captures) |
| `OUT-OF-SCOPE` | drop, one-line reason (product marketing, tutorial, vague listicle, second-order hub) |

A deep fetch spent on a kb-ahead page is the most expensive no-op in the pipeline — the
browser session, the diagram transcription and the neutralization all buy nothing that
kb-intake's own compare step would not do from the bare URL.

## 4. Fetch escalation ladder

In order; stop at the first rung that yields the full article body:

1. **GitHub markdown** → the `raw.githubusercontent.com` URL via WebFetch — never the HTML
   blob view.
2. **HTML pages** → WebFetch. Failure signs: nav-only or empty body, "enable JavaScript",
   article text missing that the catalog promised.
3. **Browser fallback** → the in-app Browser pane (`mcp__Claude_Browser__navigate`, then
   `get_page_text` / `read_page`) — public docs, no session needed. If the pane is
   unavailable, the Chrome extension, loaded in one call:

   ```
   ToolSearch: select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__read_page
   ```

Politeness: honour the source profile's `politenessDelayMs` (default 1500 ms) between
fetches to the same host; fetch only curated candidates. When a tool result overflows and
is saved to a file path, `Read` that file — never re-fetch the page.

## 5. Phase C — Deep capture (`NEW` only)

Scaffold first, then fill:

```
node .claude/skills/kb-harvest/harvest.mjs --ledger tmp/kb-harvest/ledger.json --captured-at <ISO-8601>
```

Each `<slug>.md` carries fixed sections — `Intent · Mechanism · Variants · Tradeoffs ·
Applicability · Diagrams · Evidence · Related · Sources`. Core sections (Intent, Mechanism,
Tradeoffs, Applicability, Sources) must end non-empty; the rest may honestly say "None
found." Fill under three rules:

- **Facts, not prose.** Neutral condensed bullets — mechanism steps, named tradeoffs,
  "use when" conditions, code shapes. kb-intake's no-laundering rule starts here: no
  8-word run of source text survives into the capture.
- **Agnosticism — capability language in the body, products in Evidence.** Every
  product/brand name in Intent/Mechanism/Variants/Tradeoffs/Applicability/Related/Diagrams
  is replaced by its capability term — the KB already owns that vocabulary in
  `site/capabilities/`, so `kb.mjs find` the capability page and use its term ("managed
  message queue", "serverless function runtime"). The displaced names go into `## Evidence`
  and the `evidence` array of `capture.json` as `{id, name, note}` items — deliberately in
  `kb.mjs wild` shape, so kb-intake can carry them into an "In the wild" block (still
  subject to its anti-fabrication bar). The validator's brand-leak lint enforces this.
- **Delete the scaffold marker** (`<!-- kb-harvest:scaffold -->`) as each file is filled —
  that is the "done" signal `--status` reads.

Record every URL the capture drew from in `sourceUrls`, and fill `evidence` and `diagrams`
in `<slug>.capture.json` (the scaffold never overwrites a filled one).

## 6. Diagrams — always re-drawn, never copied

Three inputs, one output. Model the diagram **in text first** (components, arrows,
boundaries, order), then draw an original mermaid per the diagram-draw rules: one question
per diagram, ≤9 nodes, numbered happy-path edge labels, the critical boundary as a
subgraph — with **agnostic labels**.

| found on the source | how to read it | then |
|---|---|---|
| mermaid source | it is already text | **do not copy it** — transcribe the topology, re-draw with agnostic labels |
| SVG diagram | fetch the `.svg` — it is text; node and edge labels are legible in it | transcribe the structure as a text list, then draw mermaid |
| raster image (PNG, screenshot) | browser `zoom`/screenshot, or download to `tmp/kb-harvest/.cache/` solely to `Read` it; delete after transcription | same: text transcription first, then mermaid |

Verbatim mermaid copying is banned twice over — copyright, and house diagram style. Each
diagram in `## Diagrams` carries one provenance line, `redrawn from figure at <url>`, and
one entry in `capture.json`'s `diagrams` array.

## 7. Validate — before any handoff

```
node .claude/skills/kb-harvest/harvest.mjs --validate --ledger tmp/kb-harvest/ledger.json
```

Exit **0** pass / **2** pending / **3** issues. Per filled capture it checks: every fixed
section present (core ones non-empty), a `> Source:` citation, body ≥200 chars, balanced
code fences, a coherent `capture.json` — and the **brand-leak lint**: the union of
`brandTerms` from all `sources/*.json` may appear only under `## Evidence` and
`## Sources`. A product name in `## Mechanism` fails the run, naming the term and section.

## 8. Phase D — Handoff to kb-intake

Per candidate, invoke **kb-intake**:

- `NEW` → with the capture path — the capture substitutes kb-intake's own fetch step; its
  create bar and anti-fabrication rules still apply in full.
- `EXISTS` / `EXISTS-AS-VARIANT` → with the bare URL plus the `kbId` from triage.

Write kb-intake's verdict back into the ledger (`intakeVerdict`, `status: "handed-off"`).
The run ends with the combined report table:

| candidate | source (type) | triage | capture | intake verdict |
|---|---|---|---|---|
| cell-based architecture | vendor portal | NEW | `tmp/kb-harvest/captures/…` | CREATED |
| circuit breaker | link hub → blog | EXISTS | — (URL handoff) | SKIPPED (kb-ahead) |
| "the lasagna pattern" | link hub → blog | NEW | `tmp/kb-harvest/captures/…` | SKIPPED (uncorroborated) |

A run heavy with SKIPPED rows is a healthy run over a mature KB — never pad a capture to
justify the sweep.

## 9. Loop mode — large sweeps

Once: Phase A (discover + curate) + Phase B (triage) + scaffold. Each iteration:

1. `node .claude/skills/kb-harvest/harvest.mjs --status --ledger tmp/kb-harvest/ledger.json --json`
   — exits **0 when nothing is pending, 2 otherwise**: the loop's stop condition.
2. Take the next 3–5 pending candidates, capture them (§5–§6), delete their markers.

When `--status` exits 0: validate (§7), then handoff (§8). The ledger plus the scaffold
markers make a fresh session resume cleanly mid-sweep.

## 10. Adding a source

A new vendor portal: copy [`sources/_template.json`](sources/_template.json), fill
`catalogUrls` and `brandTerms` (only terms that are never generic English — they feed the
lint). GitHub repos and hubs need no file — name them in the run. `harvest.mjs`, the
capture shape, the loop and the validator are unchanged.
