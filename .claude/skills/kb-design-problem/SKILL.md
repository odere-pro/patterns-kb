---
name: kb-design-problem
description: "Write or review the \"Understanding the problem\" block of a design page: the interview that turns an underspecified task into requirements. Use when asked to \"write the problem section\", \"frame the problem\", \"add clarifying questions\", or to review it. Not for the requirements block (kb-design-requirements) or a proposal with no page yet (grill-me)."
---

# Writing "Understanding the problem"

**The problem block is an interview, not an introduction.** Its job is to turn an
underspecified task statement into the requirements block that follows — every sentence
in it must land somewhere: in an FR, an NFR, or an explicit out-of-scope entry.

## The markup

```markdown
## Understanding the problem
<!--meta block=description-->

The task states … These questions close those gaps; each answer lands in a requirement below.

**Q1 — How many flows a week?** → NFR: scale. Assumed, not given: …
```

**The block is capped at one paragraph of at most 80 words**
([KB-015](../../../docs/reference/page-rules.md#KB-015)). The light form fits; the interview
form's numbered Q&A does not, so a design written that way waits in the `description` ratchet
of `docs/data/allow/kb-shape.json` until its questions move to the `requirements` block, which
the owner decides page by page. A new design is never listed: write the light form.

The heading text is always **"Understanding the problem"**; the block is `description`
— the unified opener every kind shares (base schema, 2026-08), named by the
`<!--meta block=description-->` fact on the line under the heading (KB-003, KB-006). The
block is hand-written markdown in the page under `docs/designs/`; the `kb-shape` gate in
`make validate` checks its structure, not its content.

Design pages carry `solves` in their frontmatter like a pattern: 3 to 5 phrases, each one problem, problem first, at most 20 words, in short common words, specific to this page, never a product choice or the page's own name. Write it with `node scripts/kb.mjs set <id> --solves '[…]'`. Full rule: [markdown-authoring.md](../../rules/markdown-authoring.md#field-rules).

## 1. Choose the form — pick by how specified the task is

**Light form** — one dense paragraph (the corpus default, used by most designs). Use it
when the task statement already carries its numbers and boundaries, and the paragraph
only has to restate the ask, name the load-bearing constraint, and set the stakes.

**Interview form** — a numbered Q&A (see `persona-identification`). Use it when the task
statement is underspecified — no volumes, no jurisdictions, no data rules — and the
design's shape depends on answers nobody gave. The questions *are* the work: they show
what a strong candidate asks before drawing boxes.

The light form's paragraph is dense because it is compressed, not because it is run-on:
three or four sentences, one concept each, opening with the ask rather than with
scene-setting or history. Address the reader in second person, and let every claim carry
its consequence — the constraint, then what it costs the design.

## 2. Write the interview form, if that's the form chosen

Open with one framing paragraph: what the task states, what it omits, and the promise
that each answer lands in a requirement below. Then one paragraph per question, on one
line:

```markdown
**Q1 — How many flows a week?** → NFR: scale. Assumed, not given: ~100 a week, with headroom designed to 10k. Confirm this first: every capacity decision below is priced against it.
```

- **Question stem** in bold, numbered `Qn — …?`.
- **Exactly one routing tag, straight after the stem**, before the answer:
  `→ FR: label.`, `→ NFR: label.`, or `→ Out of scope.` (combinations join with `;`). The
  label is informal but must match a requirement the reader can find. Placed between stem
  and answer, the eye takes question → where it lands → answer; trailing the answer with
  it made the tag the last thing on a four-line paragraph and the easiest thing to skip.
- **The arrow is the page-wide idiom for a title's routing qualifier**: the same
  `→ NFR: …` follows a deep-dive heading and a sizing item's bold title. No hard break
  (a line ending in a backslash) either side of it — the tag runs on in the same line.
- **Answer in 1–2 sentences**, after the tag. A question whose answer needs more is two
  questions. When the answer is genuinely a list (what data is held, what is deliberately
  not built), the question paragraph holds the stem and its tag alone and a short `-` list
  follows — nothing closes the entry after the list.
- **Mark invented numbers** with `Assumed, not given:` — an assumption stated
  as fact is a lie the reader can't audit.
- **Mark unresolved questions** with `(open)` after the closing `**`, before the tag, and
  say who owes the answer. An honest open question beats a fabricated answer. Keep it
  outside the bold — a bolded `(open)` shouts louder than the question does.
- **No italics.** The arrow and the colon carry the routing tag; `*…*` or `_…_` on top of
  them is noise. Bold on the question stem is fine — the no-formatting rule binds the
  requirements block, not this one.
- **It reads as a crisp Q&A, not an essay.** Question, answer, tag — nothing connective
  between entries, because prose that bridges two questions is prose the reader has to
  parse before finding the next one. Anything that is not a question or its answer
  belongs in the framing paragraph.

Good interview questions probe: volume and growth, one-shot vs ongoing obligation, what
data is held and under which rules, store vs pass through, push vs pull for results,
residency and failover, and what is deliberately not built. Ask what changes the design's
shape; skip what doesn't.

## 3. Write in the stakeholder register, not the essay register

**This block is a conversation, and the other party is not an engineer.** They state a
worry in their own words; you give them the decision and the one reason behind it. Write
what you would actually say out loud in that room. Everywhere else on a design page you
argue; here you answer.

Three rules carry it:

- **The answer is the first word.** "No." "Several, and the verdict waits for the
  slowest." "Residency yes, failover no." A reader who stops after the first three words
  should still have the decision. An answer that opens by restating the question, or by
  setting up the consideration, has buried it.
- **One plain sentence of reason, then stop.** Say what goes wrong without the decision,
  in the stakeholder's terms — money, a complaint, an auditor, a person who left. Not
  the mechanism; the mechanism is the deep dives' job.
- **No balancing constructions.** *X rather than Y*, *not an A but a B*, an em-dash aside
  folded into the middle of a clause — each reads as considered and costs the reader a
  parse. One of them per entry is a flourish, three in a row is a tic. Say the thing
  flatly and let the flatness do the work.

```text
<!-- no  --> An honest refusal, not a slower yes. A flow accepted into a backlog the
             system cannot drain turns a visible failure into an invisible one — the
             client hears about it from their own customer, not from us — so the
             published contract states the refusal up front, with a retry hint attached.

<!-- yes --> No. A flow we accept but cannot get to looks fine to the client until their
             own customer complains. We turn it away, say when to retry, and put that
             refusal in the contract.
```

Same decision, same reason, half the parsing. The tell that you are drifting back into
essay voice: the entry ends on a construction (`… rather than an absence of an event`)
instead of on a fact.

**The question stem takes the same treatment.** Ask it the way the stakeholder would.
"When the queue is hours deep, what do we owe the client?" is a rhetorical framing of
"We are hours behind. Do we still take new requests?" — and only the second one has an
answer. A stem that cannot be answered yes/no or with a number is usually a stem that is
performing rather than asking.

## 4. Trace it both ways

- Every question routes to at least one FR, NFR, or out-of-scope entry.
- Every FR and NFR traces back to a question or to the task statement itself.
- No orphan answers, no unsourced requirements. If an answer routes nowhere, either the
  requirements block is missing an item or the question wasn't worth asking.

The requirements side of this contract lives in
[kb-design-requirements](../kb-design-requirements/SKILL.md) — apply the two skills
together when writing a page.

## 5. Self-check the draft

- Does the framing paragraph say what the task omits and promise where answers land?
- Walk the trace both ways — every tag resolves to a requirement, every requirement has
  a source. This is the check that does the work.
- Read only the first three words of each answer. Do you have the decision every time?
  Then scan the entries for *X rather than Y*, *not an A but a B* and mid-clause em-dash
  asides — more than one or two across the whole block is essay voice creeping back in.
- Read each stem aloud as if a stakeholder asked it. A stem that answers nothing when
  answered ("what do we owe the client?") needs rewriting into one that does.
- Run `node scripts/kb.mjs get <id> --block description` and confirm it reads as a crisp
  Q&A, not an essay.

## Done means

- Every question carries exactly one routing tag, straight after its bold stem and before
  the answer, with none left trailing an answer.
- The block holds no hard break (a line ending in a backslash) and no `*italic*` or
  `_italic_` emphasis.
- Every invented number is marked "Assumed, not given" and every unresolved question is
  marked "(open)".
- `make gen && make validate` exits 0.
