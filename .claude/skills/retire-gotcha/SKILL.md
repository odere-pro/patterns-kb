---
name: retire-gotcha
description: "Move one entry out of the trap inbox, docs/inbox.md, into its real home — a gate or test, a comment, a numbered rule, a directory layer, the triage page or a guard row. Use when the inbox nears its cap of 20, a trap you are fixing is listed there, or someone asks what to do with an entry. Not for adding an entry or a trap with no home yet."
---

# Retire an inbox entry

The [trap inbox](../../../docs/inbox.md) is where a trap lands the day it bites, and an entry
should leave the day it gets a home. The leaving does not happen by itself: an inbox with a way
in and no way out only grows, and its entries end up repeating facts a gate or a rule already
holds, each copy going stale alone. The cap gate holds the page to 20 entries; this skill is how
one leaves.

1. **Read the entry as a claim.** Write the sentence that would have to become true for the
   trap to be impossible to spring: "a skill says a hook runs a check after each edit" becomes
   "no harness file claims a check the hook does not run". That sentence, not the entry's
   wording, picks the home. When it is already true — the code changed, or another change closed
   it — go to step 4.
2. **Pick the tier.** Walk the ladder under
   [When an entry leaves](../../../docs/inbox.md#when-an-entry-leaves) in order and stop at the
   first tier that honestly fits. Do not skip down because a lower tier is less work. A trap that
   fits no tier is two facts in one bullet: split it and route each half.
3. **Land the home, with what that tier owes.** A gate owes the five pieces
   [tools/CLAUDE.md](../../../tools/CLAUDE.md) lists, then `make gates`. A numbered rule owes a
   row with its own id and anchor. A layer line owes a displaced line when the layer is at its
   budget. A guard row owes a case in `tests/hooks/guard-commands.test.sh` proving the deny and
   the corrected form.
4. **Delete the entry in the same change.** Remove the whole bullet, continuation lines
   included. Never rewrite it in the past tense: git holds the history.
5. **Read the cap gate's summary line, not only its exit code.**

   ```bash
   make gate G=check-inbox
   ```

   It prints `N of 20 entries, the longest L lines`. The count must be one lower than before.
   A count of 0 on a page that still holds traps means they are written in a shape the gate
   cannot see.
6. **Name the move in the commit subject**: the trap and its new home ("stale hook claims
   become a route gate"), not "update inbox".

## Done means

- The entry is gone from `docs/inbox.md`, in the same commit as its new home.
- `make gate G=check-inbox` exits 0 and its count dropped by one.
- The home's own check passes: the new gate or test, `make gate G=check-claude-md` for a layer,
  `bash tests/run.sh` for a guard row.
- The commit subject names the trap and where it went.
