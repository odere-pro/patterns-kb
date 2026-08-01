# patterns/distributed

**IV · Network** — Keeping many services reliable, fast, and consistent across a network

This band is subdivided; the pages live one level down, in `resilience/`, `routing/`, `coordination/`.
Each subfolder has its own CLAUDE.md.

A page belongs to exactly one subfolder, resolved from its `data-kb-group` by
`folderFor()`, and `make check` fails if the two disagree. The mapping is not always
one-to-one: a group carrying a `dir` alias in `BANDS` renders as its own hub subsection
while sharing another group's directory, so a subfolder here may hold two groups. See the
root CLAUDE.md for the data contract.
