---
name: kb-design-problem
description: Write or review the "Understanding the problem" block of a patterns-kb design page — the interview that turns an underspecified task statement into requirements. Use when someone asks to "write the problem section", "frame the problem", "do the requirements interview", "add clarifying questions to a design", or says a design's problem block rambles or doesn't connect to its requirements. Also use to review, evaluate, critique, audit or grade an existing problem block, including when the ask names it by file path or URL fragment (`…/<page>.html#description`).
---

# Writing "Understanding the problem"

**The problem block is an interview, not an introduction.** Its job is to turn an
underspecified task statement into the requirements block that follows — every sentence
in it must land somewhere: in an FR, an NFR, or an explicit out-of-scope entry.

## The markup

```html
<section class="doc-section" id="description" aria-labelledby="h-problem" data-kb-block="description">
  <h2 class="doc-h" id="h-problem">Understanding the problem</h2>
  <div class="prose"> … </div>
</section>
```

The heading text is always **"Understanding the problem"**; the block id is `description`
— the unified opener every kind shares (base schema, 2026-08). The block is hand-edited
HTML; the PostToolUse hook checks structure, not content.

## Two forms — pick by how specified the task is

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

## The interview form contract

Open with one framing paragraph: what the task states, what it omits, and the promise
that each answer lands in a requirement below. Then one `<p>` per question:

```html
<p><strong>Q1 — How many flows a week?</strong><span class="subline">→ NFR: scale.</span>
Assumed, not given: ~100 a week, with headroom designed to 10k.
Confirm this first: every capacity decision below is priced against it.</p>
```

- **Question stem** in `<strong>`, numbered `Qn — …?`.
- **Exactly one routing tag, on its own line under the stem**, wrapped in
  `<span class="subline">`: `→ FR: label.`, `→ NFR: label.`, or `→ Out of scope.`
  (combinations join with `;`). The label is informal but must match a requirement the
  reader can find. The line reads in the stem's colour a notch down the type scale, so the
  eye takes question → where it lands → answer; trailing the answer with it made the tag
  the last thing on a four-line paragraph and the easiest thing to skip.
- **The subline is the page-wide idiom for a title's qualifier**, and it carries no `<br>`
  of its own: the class is `display: block`, so a break either side of it renders as an
  empty line. The same span carries the routing tag on a deep-dive heading, the store on
  an entity group and the scope clause on a requirements tier — see
  [kb-styles](../kb-styles/SKILL.md) for the five heading ranks it belongs to.
- **Answer in 1–2 sentences**, after the tag. A question whose answer needs more is two
  questions. When the answer is genuinely a list (what data is held, what is deliberately
  not built), the question `<p>` holds the stem and its tag alone and a short `<ul>`
  follows — nothing closes the entry after the list.
- **Mark invented numbers** with `Assumed, not given:` — an assumption stated
  as fact is a lie the reader can't audit.
- **Mark unresolved questions** with `(open)` after the closing `</strong>`, before the
  subline, and say who owes the answer. An honest open question beats a fabricated answer.
  Keep it outside the bold — a bolded `(open)` shouts louder than the question does.
- **No italics.** The arrow and the colon carry the routing tag; `<em>` on top of them is
  noise. `<strong>` on the question stem is fine — the no-formatting rule binds the
  requirements block, not this one.
- **It reads as a crisp Q&A, not an essay.** Question, answer, tag — nothing connective
  between entries, because prose that bridges two questions is prose the reader has to
  parse before finding the next one. Anything that is not a question or its answer
  belongs in the framing paragraph.

Good interview questions probe: volume and growth, one-shot vs ongoing obligation, what
data is held and under which rules, store vs pass through, push vs pull for results,
residency and failover, and what is deliberately not built. Ask what changes the design's
shape; skip what doesn't.

## The register — you are answering a stakeholder, not writing an essay

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

```html
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

## The bidirectional trace rule

- Every question routes to at least one FR, NFR, or out-of-scope entry.
- Every FR and NFR traces back to a question or to the task statement itself.
- No orphan answers, no unsourced requirements. If an answer routes nowhere, either the
  requirements block is missing an item or the question wasn't worth asking.

The requirements side of this contract lives in
[kb-design-requirements](../kb-design-requirements/SKILL.md) — apply the two skills
together when writing a page.

## Self-check

1. Does the framing paragraph say what the task omits and promise where answers land?
2. Is every answer 1–2 sentences (or a short list), with exactly one routing tag on its
   own `subline` span between the stem and the answer — and none left trailing an answer?
   `grep` the block for `<br>` — expect zero; the subline breaks its own lines.
3. Is every invented number marked "Assumed, not given", every unresolved question
   "(open)" — and is all of it plain text, with no `<em>` anywhere in the block?
4. Walk the trace both ways — every tag resolves to a requirement, every requirement has
   a source. This is the check that does the work.
5. Read only the first three words of each answer. Do you have the decision every time?
   Then scan the entries for *X rather than Y*, *not an A but a B* and mid-clause em-dash
   asides — more than one or two across the whole block is essay voice creeping back in.
6. Read each stem aloud as if a stakeholder asked it. A stem that answers nothing when
   answered ("what do we owe the client?") needs rewriting into one that does.
7. `make all && make check`, then `node scripts/kb.mjs get <id> --block description` — the
   reader output should read as a crisp Q&A, not an essay.
