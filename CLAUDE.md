# patterns-kb

A knowledge base of 163 software design patterns, hazards, themes and principles. **It is
data that happens to render**, not a site that happens to hold data.

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
~3,600 for one raw page. `find` searches the full prose of all 163 pages — that costs disk,
not context — and prints the line that matched.

Cite precisely: every claim has a stable id (`…/circuit-breaker.html#tradeoffs-con-2`).

## Writing it

Go through the validated writer, not hand-edited attribute strings:

```
node scripts/kb.mjs set <id> --aliases '["breaker","CB"]' --tags '[…]' --solves '[…]'
node scripts/kb.mjs wild <id> --items '[{"id":"envoy","name":"Envoy","note":"…"}]'
```

Then `make all` to regenerate, and `make check` to verify. A hook runs `make check` after any
edit under `site/` — it takes ~0.8s.

**Never edit a `<!-- kb:generated -->` region.** It is projected from the page's own
attributes and will be overwritten.

Full contract, including how to add a page: **[.claude/rules/html5-authoring.md](.claude/rules/html5-authoring.md)**.
Each folder under `site/` has its own CLAUDE.md with local rules.

## Invariants `make check` enforces

- Relations are **bidirectional** — every relationship is declared on both pages it joins.
- The relation vocabulary (13 verbs) and the **tag vocabulary (60 tags)** are **closed**.
  Adding a tag means adding it to `TAGS` in `scripts/lib/model.mjs` first, and only if it
  will honestly apply to 3+ pages.
- A page's **path must match** its `data-kb-band` / `data-kb-group`.
- No dangling, one-way or contradictory links; every generated artifact in sync.

## Layout

```
site/patterns/<band>/[<group>/]<id>.html   the source of truth
site/hazards/<id>.html · site/themes/<id>.html · site/principles/<id>.html
site/assets/graph.json · catalog.json      DERIVED
site/index.html · vocab.html · map/graph.html   DERIVED
scripts/kb.mjs        the reader/writer — your interface to all of it
scripts/lib/model.mjs the taxonomy and both closed vocabularies
```

`make` on its own lists every target.

## Conventions

- **Relative links only** — the site must work from `file://` as well as GitHub Pages.
- **Vendored, never CDN** — mermaid and the HTML parser both live in-repo. There is no
  `package.json`, no `node_modules`, and no npm in CI. Keep it that way.
