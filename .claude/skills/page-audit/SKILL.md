---
name: page-audit
description: "Read one built Astro page as a machine reader does — data layer, wrappers, what sits before the knowledge region — measure its knowledge share and route each finding to the markup behind it. Use when site markup changes, a component is added, or someone asks what an agent sees on a page. Not for how it looks (site-audit) or docs/ pages (kb.mjs)."
---

# Audit a built page

A gate proves a page breaks no rule, not that it is worth reading: markup can pass every check
and still spend most of its bytes saying nothing. This audit reads the built page as text,
never renders it, and asks eight questions in a fixed order. It applies to the Astro site, built
from `docs/` into `site/dist/`; what a built page must be is
[page-schema.md](../../rules/page-schema.md).

1. **Build first.** A stale `site/dist/` audits the last change, not this one.

   ```bash
   make site-build
   ```

2. **Pick the pages.** The page the change touched. For a structural change — a layout
   override, a generator upgrade, the post-build pass — three: the root page, a hub, and a deep
   page with code and a diagram, because they render through different templates.
3. **Read the markup top to bottom and answer the eight questions in this order**, writing each
   answer down:
   1. Is the data layer there: the `article[data-page]` block directly inside the knowledge
      region, its facts matching the `kb:` metas and the JSON-LD, and a `data-page-head` title
      block on every page but the root?
   2. Is every wrapper above the article either decoration (classed, no facts) or a data block
      (bare `data-*`, no class)?
   3. Is everything before the knowledge region inside a `data-kb-skip` subtree?
   4. Does nothing inside the article carry `data-kb-skip`?
   5. Does a named class or a `data-kb-*` hook say what each element is?
   6. Is inline code absent: no unnamed script body, no `on*=` attribute, no `style=` beyond
      custom properties?
   7. Do the JSON-LD `headline` and `description` match the H1 and the intro?
   8. Is element text on its own line, welded to a tag only where a browser cares?
4. **Measure the knowledge share**: the bytes from the knowledge region's opening tag to the
   end of the page, against the page's total.

   ```bash
   wc -c < site/dist/<page>.html
   grep -bo '<div[^>]*sl-markdown-content' site/dist/<page>.html | head -n 1
   ```

   The first line is the total; the offset the second prints is where the knowledge starts.
   The share is a trend across changes, not a pass mark: report it and set no threshold.
5. **Route each finding** to the markup that emits it: a component's markup to that component;
   chrome whose root nothing here owns to a layout-neutral wrapper carrying `data-kb-skip`;
   markup the generator writes to the post-build pass; welded text to the formatter. Each ends
   fixed there, or reported with the reason it stays.
6. **Close on the gates**: rebuild, which runs the site gates (the absence gate among them from
   P7), then the whole set.

   ```bash
   make site-build
   make validate
   ```

## Done means

- Every question in step 3 has a written answer for every page read.
- The share is reported with both byte counts and no threshold.
- Every finding is fixed in the owner its route names, or reported with its reason.
- `make site-build` and `make validate` exit 0.
