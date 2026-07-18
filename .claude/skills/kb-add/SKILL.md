---
name: kb-add
description: Add a new pattern, hazard, theme or principle page to patterns-kb. Use when someone wants to document a pattern, hazard, theme, or design principle (SOLID, DRY, KISS, YAGNI, …) the KB does not cover yet, promote one of the stub neighbours (monostate, reverse-proxy, service-mesh, token-bucket, sticky-session, stateless-service) into a real page, or asks how to add to this knowledge base.
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

Also check the stub neighbours — six ids are referenced by other pages but have no page of
their own (`node -e "console.log(require('./site/assets/graph.json').stubNeighbors)"`).
Promoting one is the easiest kind of addition: the links pointing at it already exist and
will light up the moment the page does.

## 2. Decide where it goes

Band and group decide the folder, and the path is checked against them. Ask which altitude
it works at (an object? one app? a whole system? a network?) or which lens it is
(concurrency, messaging, caching, ddd, functional, testing, security). See `BANDS` in
`scripts/lib/model.mjs`.

## 3. Scaffold it

```
node scripts/kb.mjs new <id> --kind pattern --band <band> [--group <group>] --name "Name" --order <n>
```

`--kind` is one of `pattern|hazard|theme|principle`. Only `pattern` needs a `--band`; hazards,
themes and principles are flat (their band/group is just the kind). This writes a structurally
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

One exception: a **hazard has no `relationships` block**, so `kb.mjs link` cannot write the
hazard side of a `prevents-hazard`/`mitigated-by` edge (common when adding a principle that
guards against an anti-pattern, e.g. `single-responsibility` → `god-object`). Run `link` to
write the principle side, then hand-add the inverse `mitigated-by` rel-item inside the
hazard's `mitigation` block's `.rel-list` (copy the shape of an existing item there).

## 6. Metadata

```
node scripts/kb.mjs set <id> \
  --aliases '["real alternate names, or [] "]' \
  --tags '["from the closed vocabulary only"]' \
  --solves '["the symptom, in the words of someone who does not know this pattern yet"]'
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
