# Embedding diagrams in site pages

Rules specific to pages under `site/`. Everywhere else, plain ```` ```mermaid ```` fences.

## Markup

```html
<figure class="diagram">
  <pre class="mermaid">
flowchart TB
    A["Service"] -->|"call"| B[("Store")]
  </pre>
  <figcaption>One line naming the question this diagram answers.</figcaption>
</figure>
```

- Raw mermaid inside `<pre class="mermaid">` — no code fence, no fenced language tag.
- Always include the `<figcaption>`; it is where the diagram's one question lives.

## Constraints

- **Escape HTML entities in the source**: `&lt;&lt;interface&gt;&gt;` for `<<interface>>`,
  `&amp;` for `&`. The pre content is HTML first, mermaid second.
- **Vendored engine only** — `site/assets/vendor/mermaid.min.js` (v11.16.0), loaded
  per-page near the end with `assets/diagram.js`. Never add a CDN script; no npm anywhere
  (root CLAUDE.md hard rule).
- **No fills in `classDef`** — `diagram.js` themes diagrams from CSS variables and
  re-renders on theme change; a hardcoded fill breaks dark mode.
- **`securityLevel: "strict"`** — no `click` callbacks, no HTML in labels.

## Placement

Per [site/designs/CLAUDE.md](../../../../site/designs/CLAUDE.md):

- The `architecture` block carries the primary diagram — a `flowchart` for a distributed
  design, a `classDiagram` for a low-level kata. This is the L1 board.
- L2 zooms and L3 sequence/state diagrams belong in `deepdives`, one per deep dive.

## After editing

```
make check
node scripts/kb.mjs get <id> --block architecture
```

The hook runs `make check` on any edit under `site/`; read the page back through the
reader to confirm the block still extracts cleanly.
