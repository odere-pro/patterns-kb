# patterns-kb

A knowledge base of <!-- kb:counts -->198 software design patterns, 40 design case studies, 37 themes, 32 hazards, 25 principles, 9 cloud capabilities — 341 pages in all<!-- /kb:counts -->.
**It is data that happens to render**, not a site that happens to hold data.

## The one thing to understand

**The HTML pages are the source of truth.** Everything else — `graph.json`, `catalog.json`,
the hub, the relationship map, the vocabulary — is derived from them by `make all`. Nothing
hand-maintains a copy of what the pages already say.

> **`class` is presentation. `data-kb-*` and JSON-LD are data. They never touch.**
>
> Never infer data from a class name or from where prose sits on a page. That separation is
> what lets the site be restyled without damaging knowledge, and re-authored without
> damaging structure.

## Reading it — do not open the .html

The corpus is ~490k tokens and will not fit in a context window; half of any page is markup.
Use the reader:

```
node scripts/kb.mjs find "one slow dependency blocks my threads"   # symptom → pattern
node scripts/kb.mjs get circuit-breaker --block usage              # one block, ~180 tokens
node scripts/kb.mjs get circuit-breaker                            # whole page, cleaned
node scripts/kb.mjs related circuit-breaker                        # typed neighbours
node scripts/kb.mjs ls --band caching
```

Add `--json` for structured output. A grounded answer costs ~600 tokens this way, against
~3,600 for one raw page. `find` searches the full prose of all <!-- kb:page-count -->341<!-- /kb:page-count --> pages — that costs disk,
not context — and prints the line that matched.

Cite precisely: every claim has a stable id (`…/circuit-breaker.html#tradeoffs-con-2`).

Scope any read to a **reading level** with `--level basic|advanced|expert` on `get` and
`find`. The lenses are **cumulative**: `basic` is a short, AWS-doc-style whole page,
`advanced` is basic plus system-design depth, `expert` is both plus the deep dives. Every
block shows at every lens; depth adapts inside blocks. `data-kb-level` on an element means
"visible from this level up" and is the mechanism; untagged means it is part of the basic
core. `data-kb-register` ("rendered at exactly this lens") is a rare replacement tool.

## Writing it

Go through the validated writer, not hand-edited attribute strings:

```
node scripts/kb.mjs set <id> --aliases '["breaker","CB"]' --tags '[…]' --solves '[…]'
node scripts/kb.mjs set <id> --favourite true            # editorial pick: ★ chip + hub filter
node scripts/kb.mjs wild <id> --items '[{"id":"envoy","name":"Envoy","note":"…"}]'
node scripts/kb.mjs explain <id> --basic "…" --advanced "…" --expert "…"   # the 3-rung ladder, stacked
node scripts/kb.mjs level <id> <element-id> <basic|advanced|expert|none>      # from this level up — the default tool
node scripts/kb.mjs register <id> <element-id> <basic|advanced|expert|none>   # rare: replaces the lower version
```

`wild` and `production` replace the whole block. Never re-type the neighbours from the
rendered prose — it drops their `data-kb-level` tags and their inline `<code>`. Dump them
in the writer's own shape, edit the one entry, hand the lot back:

```
node scripts/kb.mjs get <id> --block wild --json          # → .items.wild, ready to re-supply
node scripts/kb.mjs get <id> --block production --json    # → .items.production.{knobs,signals,failures,checklist}
```

Sections never carry a lens attribute — blocks show at every lens, and `make check`
fails any block that renders empty at one. The sizing bands per kind, the stacking rule
and the per-lens audit procedure live in the **kb-explain** skill.

Then `make all` to regenerate, and `make check` to verify. A hook runs `make check` after any
edit under `site/` — it takes ~0.8s.

**Never edit a `<!-- kb:generated -->` region.** It is projected from the page's own
attributes and will be overwritten.

Merging a pattern found on the web — improve the existing page, skip, or create a new
one — is the **kb-intake** skill; discovering those candidates from vendor architecture
portals and GitHub repos (including awesome-list link hubs) is the **kb-harvest** skill.
Full contract, including how to add a page: **[.claude/rules/html5-authoring.md](.claude/rules/html5-authoring.md)**.
How the prose must read: **[.claude/rules/tone.md](.claude/rules/tone.md)** — the house
register, distilled from AWS Prescriptive Guidance, Azure Architecture Center and the
Google Cloud Architecture Framework.
Each folder under `site/` has its own CLAUDE.md with local rules.

## Invariants `make check` enforces

- Relations are **bidirectional** — every relationship is declared on both pages it joins.
- **Theme membership is bidirectional too.** A theme's `tour` step and the pattern's own
  `fluency` item must both exist — the tour is the source of truth, but the pattern's
  "Where it shows up" block is hand-written and can drift from it. Wording may differ;
  presence may not.
- The relation vocabulary (17 verbs), the **tag vocabulary** and the **level vocabulary**
  (`basic`/`advanced`/`expert`) are **closed**. Adding a tag means adding it to `TAGS` in
  `scripts/lib/model.mjs` first, and only if it will honestly apply to 3+ pages — that is
  now a build rule, not advice: every page carries **2-5 tags** and every tag in the set is
  used on **3+ pages**, so a speculative tag turns the build red.
- **Every term a page describes itself with is defined on `vocab.html`.** Each `data-kb-*`
  has an `ATTRIBUTES` entry, each emitted `kb:` term has a fragment, and
  `scripts/audit-vocab.mjs` fails the build on either half. Growing or retiring any of it —
  including the search synonym table — is the **kb-vocab** skill.
- An `explain` block, when present, holds exactly one item per level, in order.
- A page's **path must match** its `data-kb-band` / `data-kb-group`.
- No dangling, one-way or contradictory links; every generated artifact in sync.

## Layout

```
site/patterns/<band>/[<group>/]<id>.html   the source of truth
site/hazards/<id>.html · site/themes/<id>.html · site/principles/<id>.html
site/designs/<id>.html                     worked case studies (system-design & LLD katas)
site/capabilities/<id>.html                cloud service categories, mapped across providers
site/assets/graph.json · catalog.json · graphdata.js   DERIVED
site/index.html · vocab.html · map/graph.html   DERIVED (graph.html = interactive graph explorer shell;
                                                its runtime is hand-authored assets/graph-view.js + graph.css,
                                                over the unit-tested assets/graph-core.js)
scripts/kb.mjs        the reader/writer — your interface to all of it
scripts/lib/model.mjs the taxonomy, every closed vocabulary, and the ontology's own prose
scripts/report-vocab.mjs  the vocabulary worklist (drift, unbridged pages, tag audit)
```

`make` on its own lists every target.

## Conventions

- **Relative links only** — the site must work from `file://` as well as GitHub Pages.
- **Vendored, never CDN** — mermaid, d3 and the HTML parser all live in-repo. There is no
  `package.json`, no `node_modules`, and no npm in CI. Keep it that way.
