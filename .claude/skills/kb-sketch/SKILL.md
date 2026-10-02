---
name: kb-sketch
description: "Write or fix a code sketch: the fence with its summary, caption and wide keys, the closed language set, the collapsed-by-default rule, and how the build renders it. Use when someone says 'the code has no colours', 'add a code sketch', 'which language for this sketch'. Not for site colours (site-component) or vocabulary pages (kb-vocab)."
---

# Code sketches

A sketch is the smallest runnable-looking thing that proves a mechanism: a pattern's
`sketch` block, a principle's optional `sketch` block, a design's entity schemas and API
contracts, a deep dive's sample. In a page
under `docs/` it is one fenced block; the site build wraps it in a collapsed `<details>` and
highlights it. Its moving parts — the fence, its language, its summary, its trimming — all
live here.

## Adding or fixing a sketch

1. **Write the fence** — the language first in the info string, then `summary="…"` naming the thing (not the block).
2. **Pick the language** from the closed set below. **Sketches are TypeScript** unless the
   mechanism lives elsewhere (the SQL of a schema, the wire format of an HTTP exchange). A
   pattern of the concurrency area may write its sketch in `go`, where goroutines and channels
   show the mechanism most plainly; no other page may. If the sketch needs another language,
   that is its own add — see "Adding a language".
3. **Trim** to the smallest code that proves the mechanism, with `…` where you cut, comments
   carrying the argument, and never an invented parameter, method or field.
4. **Leave it collapsed** — there is no `open` for a sketch. The build makes every sketch a
   closed `<details>` whose `<summary>` is the `summary` text.
5. **Check it** with `make gen && make validate` (the `kb-shape` gate reads the fence), then
   `make site-build` and look at the built page.

## The fence

````markdown
```sql summary="schema — flow"
CREATE TABLE flow (
  id uuid PRIMARY KEY
);
```
````

Rules, each with a failure behind it:

- **The language comes first and is one of the set.** A fence with no language, one
  outside the set, or `go` on any page but a concurrency pattern, fails
  [KB-010](../../../docs/reference/page-rules.md#KB-010) in the `kb-shape` gate.
- **The `summary` names the thing**, not the block: `schema — flow`, `contract`,
  `worker loop`. Collapsed, the summary is all the reader has, so a summary that says
  "example" costs them a click to find out.
- **The fence keys are `caption`, `summary` and `wide`** (`suffix.fenceKeys` in
  `content-model.json`). `summary` is the collapsed line of a code sketch, as above.
  `caption` is the question a diagram or an explain-block example answers; it is the
  figcaption of a mermaid fence, and an explain example written as a fence (at most 25 lines)
  requires one. `wide=true` lets a diagram use the full page width. A `level=` token is
  retired and refused (KB-004).
- **A meta value with spaces is double-quoted**; `\"` and `\\` escape inside it. A summary
  holding a backtick makes the fence open with `~~~` instead of backticks.
- **The code is literal.** No HTML escaping: `<`, `>` and `&` are written as themselves.
- **Inside a list item** (an entity or an endpoint), the fence indents with the item.
- **A prose sketch** — argument rather than code — is a blockquote whose first paragraph,
  alone and bold, is the summary.

What a fence's info string may hold is [KB-004](../../../docs/reference/page-rules.md#KB-004).

## The language set is closed

The ids are `sketchLangs` in [`docs/data/content-model.json`](../../../docs/data/content-model.json):

| id | for |
|---|---|
| `typescript` | the corpus default — types the shapes without demanding a runtime |
| `http` | request/response exchanges, where the wire format is the thing being shown |
| `python` | patterns whose home is data or ML tooling |
| `sql` | schema and query sketches, where the mechanism lives in the database |
| `json` | a payload or config shape on its own |
| `javascript` | code that must run untyped, as shipped browser code does |
| `protobuf` | a schema definition where the contract, not the code, is the point |
| `lua` | embedded scripting, as a gateway or cache runs it |
| `go` | only on a pattern page of the `concurrency` area (the `only` key in `content-model.json`); goroutines and channels |
| `text` | no highlighting — output, logs, anything that is not a language |

### Adding a language

1. Add the entry, with its label and definition, to `sketchLangs` in
   `docs/data/content-model.json`.
2. Write the sketch that needs it.
3. `make gen && make validate`, then `make site-build`, and open the built page: the site
   highlights at build time with Starlight's Expressive Code, so a language its highlighter
   does not know renders as flat text. Confirm the new sketch shows colour before calling it
   done.

## Collapsed by default

A design's entities block runs to sixteen schemas and its interface block to eleven
contracts; expanded, they push the argument that owns the page off the screen. Collapsed, the
block reads as an index — which is what makes the `summary` rule load-bearing. The build
(`tools/src/lib/site-markdown.ts`) puts every sketch fence inside a `<details>` carrying the
sketch's id, so a sketch's disclosure state is the reader's, per visit, and nothing
is authored for it.

## Colour

Highlighting happens at build time, not in the browser, and follows the site's theme. Its
colours are the site's concern (**site-component**), never a hex in a page.

## What belongs in a sketch

- **The smallest code that shows the mechanism working**, and nothing that shows it being
  set up. Imports, boilerplate, error handling that is not the point: cut.
- **Trim with `…`**, not with silence — `-- … name, timestamps …` tells the reader a column
  list was cut; deleting it tells them the table has four columns.
- **Comments carry the argument.** In a schema, the constraint's reason belongs beside it; in
  a contract, the annotation right of a header says what it is for. This is the one place in
  the corpus where a comment is doing the writing.
- **Never invent an API.** A named parameter, method or field in a sketch is a factual claim
  about a real system as much as anything in an "In the wild" block. When unsure, describe
  the shape generically rather than attributing it to a product.

## Where the rest of a sketch's context lives

A sketch inside a design's data or API block also answers to that block's own shape — how
entities are grouped, what an endpoint card carries — which is **kb-design-entities** and
**kb-design-interface**. A pattern's dedicated `sketch` block sits in the block order that
**kb-pattern-blocks** owns, and a principle's optional one in the order **kb-principle-blocks** owns. The markdown plugin that frames the fence is under
`tools/src/lib/`, and a new site component around it is **site-component**'s.

## Done means

- The fence names a language from `sketchLangs` and carries a `summary` that names the thing.
- The code is trimmed to the mechanism, with `…` marking every cut and no invented
  parameter, method or field.
- `make gen && make validate` passes, and `make site-build` exits 0.
- The sketch shows collapsed and highlighted on the built page, in both themes.
