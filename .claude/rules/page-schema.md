---
description: "What a built page must be: which elements carry facts, which are decoration, and what code a page may hold. A stub: the site data-layer gate states and enforces the rule."
paths: ["site/src/**", "site/astro.config.mjs"]
---

# Page schema (the built site)

**Question:** what must a built page be?

**Scope:** the files that shape a built page, `site/src/**` and `site/astro.config.mjs` — the
Astro workspace, which builds the site from the pages under `docs/`. Those source pages are
governed by [markdown-authoring.md](markdown-authoring.md), and no glob here matches one.

**Status:** a stub. Until the kit's page rule is copied in, the layer rule is stated in the
header of `tools/src/gates/check-site-absence.ts`, the site data-layer gate that enforces it
over every built page.
