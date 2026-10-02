# Working in scripts/

Three files every other part of the repo calls by path, so they stay here while the programs
live under [tools/](../tools/CLAUDE.md).

- [kb.mjs](kb.mjs): the reader and writer over the knowledge base, your interface to it. A
  thin launcher: the program is `tools/src/kb/cli.ts`, its command surface
  `tools/src/kb/spec.ts`. `node scripts/kb.mjs` alone prints every command and flag.
- [fm-json.sh](fm-json.sh) and [lib-frontmatter.sh](lib-frontmatter.sh): THE one frontmatter
  parser. Every gate, generator and kb.mjs reads a page's frontmatter through it
  (`tools/src/lib/frontmatter.ts` is the door on the TypeScript side).

```bash
node scripts/kb.mjs validate --file docs/hazards/deadlock.md   # one page's shape
KB_ROOT=<tree> node scripts/kb.mjs ls                         # another tree
```

## Conventions

- **kb.mjs needs the tools workspace.** Without `node_modules` it says to run
  `make install` and exits 2.
- **`KB_ROOT` points kb.mjs at another tree**, as the tests do.
- **A new kb.mjs command is one entry in `tools/src/kb/spec.ts`**, with its handler in
  `cli.ts` or `write.ts` and a test beside it.

## Don't

- **Don't add a program here.** A gate or a generator is TypeScript under
  [tools/](../tools/CLAUDE.md), with a registry row.
- **Don't write a second frontmatter parser.** Read through `fm-json.sh`, or its door.
- **Don't move kb.mjs.** Every skill, agent and layer names this path.
