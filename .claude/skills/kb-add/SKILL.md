---
name: kb-add
description: Add a new pattern, hazard or theme page to patterns-kb. Use when someone wants to document a pattern the KB does not cover yet, promote one of the stub neighbours (monostate, reverse-proxy, service-mesh, token-bucket, sticky-session, stateless-service) into a real page, or asks how to add to this knowledge base.
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

## 3. Copy an exemplar

```
node scripts/kb.mjs get circuit-breaker          # pattern
node scripts/kb.mjs get cap-theorem              # theme
node scripts/kb.mjs get god-object               # hazard
```

Then read the real file for its markup, once, to copy the shape:
`site/patterns/distributed/resilience/circuit-breaker.html`. This is the **one** time
opening a `.html` is right.

## 4. Write it

- All blocks for its kind, in order (see the rules file). No missing, no extra.
- `data-kb-id` must equal the filename; `data-kb-band`/`-group` must match the folder.
- `data-kb-order` — pattern order is **editorial, not alphabetical**. It drives the hub and
  prev/next. Insert where it belongs pedagogically, and renumber the pages after it in the
  same band.
- `data-kb-essence` — the terse hub-chip line, distinct from the longer `.doc-essence`
  sentence on the page. Both exist.
- Leave the JSON-LD out. It is generated.

## 5. Wire the relationships — both sides

This is the step that gets forgotten. A relationship must be declared on **both** pages, and
`make check` fails otherwise. So adding a page means editing its neighbours too.

```html
<div class="rel-item" data-kb-rel="combines-with" data-kb-to="bulkhead">
  <a href="./bulkhead.html">Bulkhead</a><span class="rel-note">why they relate</span>
</div>
```

Each side may phrase its note from its own perspective. Only the edge and type must agree.
Verbs are closed — see [site/vocab.html](../../../site/vocab.html).

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
