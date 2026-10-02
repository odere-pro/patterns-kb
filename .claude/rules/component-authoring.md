---
description: "What shape a site component must have: its folder, its one bundle entry, its one stylesheet and its nested layer. A stub: the site-component skill carries the steps, and the gates hold what they can."
paths: ["site/src/components/**"]
---

# Component authoring (the built site)

**Question:** what shape must a component have?

**Scope:** `site/src/components/**`, the Astro workspace's components, which build the site
from the pages under `docs/`.

**Status:** a stub. The shape a component folder takes, and how it is wired in, are the
[site-component](../skills/site-component/SKILL.md) skill's steps. The layer gate holds the
nested layer every component folder carries
([context layering](../../docs/concepts/context-layering.md)); the `site-tokens` and
`site-hooks` gates hold its colours and its behaviour hooks.
