# patterns/gof

**I · Objects & Classes** — Gang of Four, 1994 — the 23 patterns everything else stands on, plus a few essentials the book missed

This band is subdivided; the pages live one level down, in `creational/`, `structural/`, `behavioral/`, `extra/`.
Each subfolder has its own CLAUDE.md.

A page belongs to exactly one subfolder, resolved from its `data-kb-group` by
`folderFor()`, and `make check` fails if the two disagree. The mapping is not always
one-to-one: a group carrying a `dir` alias in `BANDS` renders as its own hub subsection
while sharing another group's directory, so a subfolder here may hold two groups. See the
root CLAUDE.md for the data contract.
