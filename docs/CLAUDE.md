# Working in docs/

The knowledge base: the pages in the kind folders (`patterns/`, `hazards/`, `themes/`,
`principles/`, `designs/`, `capabilities/`, `comparisons/`) and the single sources in `data/`,
all edited by hand or through `node scripts/kb.mjs`. Generated, and never edited: the marked
blocks inside a page (relationships, tour, fluency, from `data/relations.json` and
`data/learning-paths.json`), `data/prerequisites.json`, the reference pages that carry a
stamp (`reference/gates.md`, `glossary.md`, `tags.md`, `prerequisites.md`,
`search-synonyms.md`) and the generated blocks in [triage.md](reference/triage.md) and the
[docs map](README.md). `make gen` rebuilds all of them. Also hand-written: the other pages in `reference/`, the pages the root layer
routes to in `concepts/`, the [records](records/) and the [trap inbox](inbox.md).

## Conventions

- **A data file opens with `version`, `updated` and `note`.** The note names what reads the
  file and the command to run after an edit; commit the file with whatever that command
  rewrote.
- **An allowlist is `data/allow/<gate>.json`**: entries of `name`, `match` and `reason`, plus
  `owner` and `since` when one excuses a failure. It ships empty unless the
  [plan](../plans/harness-optimize.md) records a deviation that needs one; its gate fails an
  entry that excuses nothing.
- **A page opens with frontmatter**: `title`, `description`, `area`, `owner`,
  `tags`, `status`, in the [dialect](../tools/src/lib/dialect.md) the rules cite; a page
  has its row in `data/site-structure.json`, which `kb.mjs new` writes.
- **An inbox entry follows [inbox.md](inbox.md)**, which states its shape.
- **A dated record is `records/YYYY-MM-DD-<subject>.md`**, opens with its H1 and no
  frontmatter, and gets its map row in the same change; it keeps what was true that day, so
  the claim gate skips it.

## Don't

- **Don't hand-edit generated output.** A marked block or a stamped file changes through its
  data file and `make gen`; the `*-fresh` gates fail a hand edit, and the stamp names the
  source.
- **Don't quote a block's start or end marker literally** in a page, even in a code span: the
  block's generator then treats the page as holding that block.
- **Don't move a page without its row.** Its `area:` and its row in `data/site-structure.json`
  change together, with its `learning-paths.json` stages (the kb-move skill).
