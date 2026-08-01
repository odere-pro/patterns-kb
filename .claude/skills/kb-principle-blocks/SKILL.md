---
name: kb-principle-blocks
description: Write or review any block of a patterns-kb principle page — description, rationale, applying, overreach. Use when someone asks to "write the rationale block", "why does this principle help", "how do you apply DRY/KISS/SOLID in practice", "write the overreach block", "how does this maxim fail when taken too far", "document a design principle", or says a principle page preaches instead of arguing. Also use to review, evaluate, critique, audit or grade an existing rationale, applying or overreach block, including when the ask names it by file path or URL fragment (`…/<principle>.html#rationale`, `#applying`, `#overreach`).
---

# The blocks of a principle page

Six blocks, fixed order, no optional ones:

```
description  explain  rationale  applying  overreach  relationships
```

`explain` is the **kb-explain** skill; `relationships` is **kb-edit** (a principle usually
`combines-with` a pattern that embodies it, or `prevents-hazard` an anti-pattern it guards
against; designs point back via `demonstrates`). This skill owns `description`,
`rationale`, `applying` and `overreach`.

**A principle is a maxim, not a mechanism.** There is nothing to build and no topology to
draw, so the whole page is an argument — and `overreach` is the block that keeps it honest.
A maxim with no stated limit is advice nobody can argue with, which is why the block is
mandatory.

Read before you write — the block, never the file:

```
node scripts/kb.mjs get <id> --block <name>
node scripts/kb.mjs get dry                   # the exemplar, whole
```

Register rules for all of it: second person, active voice, imperative for advice; one
concept per sentence, 2–3 per paragraph; every claim carries its consequence; no hedging
stacks and no unpriced adjectives. Emphasis is `<strong>`; **`<em>` and `<i>` are not in the
vocabulary**.

## The markup

Every block is a `<section class="doc-section">` carrying its `data-kb-block`, an
`aria-labelledby` and an `<h2 class="doc-h">`. The headings are uniform across all 25
principle pages: "What it says", "Why it helps", "Applying it", "Taken too far". Prose sits
in a `<div class="prose">`.

```html
<section class="doc-section" id="overreach" aria-labelledby="h-overreach" data-kb-block="overreach">
  <h2 class="doc-h" id="h-overreach">Taken too far</h2>
  <div class="prose">
    <p id="overreach-p-1">…</p>
    <p id="overreach-p-2" data-kb-level="advanced">…</p>
  </div>
</section>
```

Element ids are minted by `make all` — write the prose, run the build, then tag with
`kb.mjs level`. At least one element per block stays untagged.

## description — state it exactly, then correct the popular misreading

Two paragraphs.

1. **The principle, stated precisely**, with its origin where the origin disambiguates —
   "Coined by Andy Hunt and Dave Thomas in The Pragmatic Programmer". Then the common
   misremembering, named as such: DRY is "often misremembered as never write the same code
   twice — but its subject is knowledge, not text".
2. **What the principle is actually about**, drawn as the line between a true instance and
   a look-alike: two lines that happen to match are not the target; two places encoding
   one fact are.

The misreading paragraph is doing the page's hardest work. Most readers arrive already
"knowing" the principle; the description's job is to replace the slogan with the claim.

## rationale — the mechanism behind the maxim

Two paragraphs, and the shape is failure-first:

1. **What goes wrong without it**, as a concrete failure with a located defect: change the
   tax rate in one constant and forget the other, and "the defect is not in either copy but
   in the gap between them, which is exactly where no test is looking".
2. **Why honouring it removes that failure class** — not softens, removes: "there is
   nowhere for the copies to drift, so a change is correct by construction". Close with why
   this matters over a system's life, not just on day one.

Never restate the maxim as its own justification. "DRY helps because repetition is bad" is
circular; the rationale names the mechanism — the unguarded gap, the invisible coupling —
that the maxim exists to close.

## applying — the grain of a decision someone actually makes

A short lead, a list of 4–6 items, and usually a closing rule of thumb. Each item is a
**move**, imperative, at the grain of one decision: "extract shared logic into a named
function and call it — do not copy it", "derive, don't restate: generate types from a
single schema". Not "be disciplined about duplication" — that is the maxim again, wearing
a checklist's clothes.

The closing rule of thumb compresses the list into one test the reader can run in the
moment: "whenever two things would otherwise have to change together, reach for a reference
over a copy". If the list does not compress, it is probably several principles.

The deeper items (deriving from schemas, data denormalisation) carry
`data-kb-level="advanced"`; the first item never does.

## overreach — mandatory, honest, and the block that earns trust

Two or three paragraphs. The shape:

1. **The false positive** — what looks like a violation but is not, and what merging or
   "fixing" it costs: two blocks that look identical but exist for different reasons are
   not duplication, and merging them "couples two things that will need to change apart".
   Name the failure (the wrong abstraction) and cite the known authority where one exists
   (Sandi Metz on duplication versus the wrong abstraction).
2. **The counter-heuristic** — how to stay on the right side: tolerate a thing twice,
   unify on the third occurrence; check the shared code answers to one reason for change.
3. **The second-order cost** of over-application, priced honestly: a maze of tiny helpers
   can be harder to follow than a little honest repetition.

This block argues **against** the page's own subject, and that is the point. A principle
page whose overreach is a token "of course, use judgment" has not been written yet.

## Worked example

`dry` is the exemplar. Read it whole before writing a new principle:

```
node scripts/kb.mjs get dry
node scripts/kb.mjs get dry --block overreach
node scripts/kb.mjs get dry --level basic     # the short page, end to end
```

Its shape in one line each: description states the maxim and kills the "never write the
same code twice" misreading; rationale locates the defect in the gap between two copies;
applying gives four moves and compresses them into the change-together test; overreach
prices the wrong abstraction and hands the reader the rule-of-three.

## What these blocks are not

- `rationale` is not `description` again with more words. The description says what the
  principle claims; the rationale says why the claim holds.
- `applying` is not a pattern catalogue. When a move is a pattern the KB has, link it once
  and move on — the mechanism lives on the pattern's page.
- `overreach` is not a disclaimer. "Don't overdo it" protects the author; naming the wrong
  abstraction and its cost protects the reader.
- A principle carries `solves` like a pattern — symptom phrases someone types before they
  know the maxim's name ("adding a new export format means editing a giant switch
  statement"), never the maxim itself.

## Self-check

1. Every list has at least one **untagged** item, or the block renders empty at basic and
   `make check` fails.
2. Does `description` name and correct the popular misreading?
3. Does `rationale` locate a concrete defect, rather than restating the maxim?
4. Is every `applying` item an imperative move at the grain of one decision, and does the
   list compress into a closing test?
5. Does `overreach` name a real failure of over-application with its price — not a
   use-judgment disclaimer?
6. `grep -n '<em>\|<i>'` on the page — nothing.
7. `node scripts/report-lens.mjs --kind principle` — the page sits in its 350–550 word
   basic band.
8. `make all && make check`.
