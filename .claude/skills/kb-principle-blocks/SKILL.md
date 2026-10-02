---
name: kb-principle-blocks
description: "Write or review any block of a principle page: description, rationale, applying, sketch, overreach. Use when someone says 'write the rationale block', 'how do you apply DRY in practice', 'add a sketch', 'write the overreach block', or a principle page preaches. Not for patterns that embody a principle (kb-pattern-blocks)."
---

# The blocks of a principle page

Eight blocks, fixed order, `sketch` and `selfcheck` optional:

```
description  explain  rationale  applying  sketch*  overreach  selfcheck*  relationships
```

`selfcheck` (optional) is three blockquotes, each one bold question of at most 25 words and an answer of at most 60 words that links a `#element-id` it rests on (KB-016).

`explain` is the **kb-explain** skill; `relationships` is **kb-edit** (a principle usually
`combines-with` a pattern that embodies it, or `prevents-hazard` an anti-pattern it guards
against; designs point back via `demonstrates`). This skill owns `description`,
`rationale`, `applying`, `sketch` and `overreach`.

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
stacks and no unpriced adjectives. Emphasis is `**bold**`; **no `*italic*` or `_italic_` emphasis in
`docs/**.md`**.

## The markup

Every block is a `## <heading>` with `<!--meta block=<name>-->` on the next line (KB-003,
KB-006). The headings are uniform across all 27 principle pages: "What it says", "Why it
helps", "Applying it", "Taken too far". Prose sits directly under it.

```markdown
## Taken too far
<!--meta block=overreach-->

…

…
```

The build issues the element ids (`mintIds`) from the markdown structure.

## description — state it exactly, then correct the popular misreading

One paragraph of at most 80 words ([KB-015](../../../docs/reference/page-rules.md#KB-015)),
in two moves; the second move may be one sentence.

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
function and call it — do not copy it", "generate, don't restate: build types from a
single schema". Not "be disciplined about duplication" — that is the maxim again, wearing
a checklist's clothes.

The closing rule of thumb compresses the list into one test the reader can run in the
moment: "whenever two things would otherwise have to change together, reach for a reference
over a copy". If the list does not compress, it is probably several principles.

The deeper items (generating from schemas, data denormalisation) come after the first.

## sketch (optional) — the maxim kept and broken, in a few lines

A principle may carry a `sketch` block when a few lines of code show the claim better than the
prose does: the same task written twice, once breaking the maxim and once keeping it, or the
one line where it stops paying. It sits between `applying` and `overreach`, under a heading of
the page's own ("In code"), with `<!--meta block=sketch-->` on the line under it, and holds
one captioned fence like a pattern's sketch. The language is `typescript`; the `go` fence is
for patterns of the concurrency area only. Trim to the mechanism, cut imports and set-up, and
never invent an API. Leave the block out when the principle has no code shape (KISS, YAGNI in
the large); a forced sketch restates the maxim as code. The fence rules are the **kb-sketch**
skill's.

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
  `solves` rule: 3 to 5 phrases, each one problem stated problem first, at most 20 words, short common words, specific to this page, never a product choice or the page's name. Write them with `node scripts/kb.mjs set <id> --solves '[…]'` (the writer refuses a longer phrase); full rule in [markdown-authoring.md](../../rules/markdown-authoring.md).

## Self-check

1. Is `description` one paragraph of at most 80 words, and does it name and correct the popular misreading?
2. Does `rationale` locate a concrete defect, rather than restating the maxim?
3. Is every `applying` item an imperative move at the grain of one decision, and does the
   list compress into a closing test?
4. Does `overreach` name a real failure of over-application with its price — not a
   use-judgment disclaimer?

## Done means

- The page holds no `*italic*` or `_italic_` emphasis.
- `make gen && make validate` exits 0.
