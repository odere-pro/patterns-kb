---
name: kb-add
description: Add a new pattern, hazard, theme or principle page to patterns-kb. Use when someone wants to document a pattern, hazard, theme, or design principle (SOLID, DRY, KISS, YAGNI, …) the KB does not cover yet, promote a referenced-but-missing stub neighbour into a real page, or asks how to add to this knowledge base.
---

# Adding a page

A page is not a document here — it is the data. Adding one correctly means the hub, the
graph, the catalog, the search and the neighbours' backlinks all update themselves. Getting
it wrong means `make check` fails, which is the system working.

Read **[.claude/rules/html5-authoring.md](../../rules/html5-authoring.md)** first. It is the
contract; this is the procedure.

## 1. Check it does not already exist

```
node scripts/kb.mjs find "<the concept>"
```

Also check `graph.json.stubNeighbors` — ids referenced by other pages that have no page of
their own (`node -e "console.log(require('./site/assets/graph.json').stubNeighbors)"`).
Promoting one is the easiest kind of addition: the links pointing at it already exist and
will light up the moment the page does. The list is currently empty, so this path only
applies when a new reference has outrun its page.

## 2. Decide where it goes

**A pattern** is placed by its band and group, which decide the folder — the path is checked
against them. Ask which altitude it works at (an object? one app? a whole system? a
network?) or which lens it is (concurrency, messaging, caching, ddd, functional, testing,
security). See `BANDS` in `scripts/lib/model.mjs`. The Network band subdivides five ways:
`distributed-resilience`, `-routing`, `-scale`, `-coordination`, `-data` — and the last two
pairs share a folder each, so the folder alone will not tell you the group.

**Every other kind is placed by an editorial ordering array**, and this is the step that has
no other home: a hazard, theme, principle, design, capability or comparison that is not in
its array validates clean, builds clean, and **never appears on the hub**. `build-hub.mjs`
now fails on it rather than shipping an unreachable page:

| kind | add the id to |
|---|---|
| hazard | `HAZARD_ORDER` |
| theme | `THEME_GROUPS` (one of five groups) |
| design / ML case study | `DESIGN_GROUPS` (one of three complexity tiers) |
| principle | `PRINCIPLE_GROUPS` (craft or systems) |
| capability | `CAPABILITY_ORDER` |
| comparison | `COMPARISON_ORDER` |

All in `scripts/lib/model.mjs`. Placement and ordering are the **kb-hub** skill.

## 3. Scaffold it

```
node scripts/kb.mjs new <id> --kind pattern --band <band> [--group <group>] --name "Name" --order <n>
```

`--kind` is one of `pattern|hazard|theme|principle|design|capability`. Only `pattern` needs a
`--band`; every other kind is flat (its band/group is just the kind), and lands in
`site/<kind>s/`. This writes a structurally
valid skeleton — every mandatory block in order, sketch pre-wired for highlighting on patterns
— that already passes `kb.mjs validate --file`. Then study an exemplar for what good content
looks like:

```
node scripts/kb.mjs get circuit-breaker          # pattern
node scripts/kb.mjs get cap-theorem              # theme
node scripts/kb.mjs get god-object               # hazard
node scripts/kb.mjs get dry                       # principle
node scripts/kb.mjs get thread-pool --block production   # the production block
```

## 4. Write it

- Replace every TODO the scaffold left: prose, diagram, sketch, essence (both the
  `data-kb-essence` attribute — the terse hub-chip line — and the longer `.doc-essence`
  sentence; they are different by design).
- `data-kb-order` — pattern order is **editorial, not alphabetical**. It drives the hub and
  prev/next. Insert where it belongs pedagogically, and renumber the pages after it in the
  same band.
- **Inline markup is four elements: `<a>`, `<strong>`, `<code>`, `<abbr>`.** No `<em>` and
  no `<i>` — the corpus carries zero and no stylesheet renders italic. `<strong>` for a
  run-in label, `<code>` for an identifier, nothing at all when the sentence already puts
  the stress where you want it. Italic contrast is a sentence to rewrite, not to mark up.
- In a `variations` block, when a variant names a page the KB already has, link it from the
  `<dt>` — wrapping only the page-name portion:
  `<dt id="variations-item-1"><a href="./sidecar.html">Sidecar</a> data plane</dt>`.
  Link the page, not the word: a name collision ("Streaming Gateway" is not the `streaming`
  theme) is not a reference, and a wrong link costs more than a missing one.
- Leave the JSON-LD out. It is generated.
- `node scripts/kb.mjs validate <id>` at any point tells you what is still structurally wrong.

## 5. Wire the relationships — both sides

A relationship must be declared on **both** pages, and `make check` fails otherwise. The
`link` command does both sides in one step, with a per-side note:

```
node scripts/kb.mjs link <id> combines-with bulkhead --note "why, from this page's view" --note-back "why, from bulkhead's view"
```

Verbs are closed — see [site/vocab.html](../../../site/vocab.html). Directional verbs
(`variant-of`/`has-variant`) get the inverse written on the far side automatically.

Hazards carry a real `relationships` block like every other kind, so `kb.mjs link` writes
both sides of a `prevents-hazard`/`mitigated-by` edge (common when adding a principle that
guards against an anti-pattern, e.g. `single-responsibility` → `god-object`). The hazard's
`mitigation` block holds prose narrative only — never typed edges.

## 6. Metadata

```
node scripts/kb.mjs set <id> \
  --aliases '["real alternate names, or [] "]' \
  --tags '["from the closed vocabulary only"]' \
  --solves '["the symptom, in the words of someone who does not know this page yet"]'
```

Tags must be in `TAGS` (`scripts/lib/model.mjs`) — `make check` rejects anything else. Add a
new tag only if it will honestly apply to 3+ pages.

Optionally, real implementations — **only ones you are sure exist**:

```
node scripts/kb.mjs wild <id> --items '[{"id":"envoy","name":"Envoy","note":"one sentence"}]'
```

And, where the pattern has real operational content, the system-builder block (see the
anti-fabrication rule in the authoring contract — when unsure, omit):

```
node scripts/kb.mjs production <id> --knobs '[{"label":"…","note":"…"}]' \
  --signals '[…]' --failures '[…]' --checklist '["…"]'
```

## 7. Build and verify

```
make all && make check
```

Then confirm it actually landed, rather than assuming:

```
node scripts/kb.mjs get <id>
node scripts/kb.mjs related <id>          # both directions wired?
node scripts/kb.mjs find "<its symptom>"  # does it come back?
```

If `make check` complains about a one-way relationship, you edited one side and not the
other. If it complains about the path, the band/group and the folder disagree.
