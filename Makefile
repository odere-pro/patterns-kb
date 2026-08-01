# patterns — a static, build-less knowledge base. These targets are dev conveniences.
.DEFAULT_GOAL := help

.PHONY: help serve check test all all-impl graph pages vocab hub graph-page claude relations kb

# Serialised against other sessions: six of the builders below read back what build.mjs
# writes, so two concurrent `make all` runs interleave into a hub built from one graph and
# a graph built from another — with every file complete and every builder exiting 0.
# See scripts/with-lock.mjs. Single-builder targets (graph, hub, …) stay unlocked.
all: ## Regenerate every derived artifact from the pages
	@node scripts/with-lock.mjs $(MAKE) --no-print-directory all-impl

all-impl:
	@node scripts/build.mjs
	@node scripts/build-pages.mjs
	@node scripts/build-vocab.mjs
	@node scripts/build-hub.mjs
	@node scripts/build-graph-page.mjs
	@node scripts/build-stack-page.mjs
	@node scripts/build-claude.mjs

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

kb: ## Read the KB without burning context — make kb ARGS='find slow dependency'
	@node scripts/kb.mjs $(ARGS)

serve: ## Serve site/ locally at http://localhost:8000
	@cd site && python3 -m http.server 8000

check: ## Verify generated artifacts are in sync, no dangling links, diagrams parse, relations match
	@node scripts/build.mjs --check
	@node scripts/build-pages.mjs --check
	@node scripts/build-vocab.mjs --check
	@node scripts/build-hub.mjs --check
	@node scripts/build-graph-page.mjs --check
	@node scripts/build-stack-page.mjs --check
	@node scripts/build-claude.mjs --check
	@node scripts/check-links.mjs
	@node scripts/check-mermaid.mjs
	@node scripts/audit-relations.mjs
	@node scripts/audit-vocab.mjs

test: ## Smoke-test the builders/checkers against the fixture corpus (scripts/test/)
	@node --test scripts/test/*.test.mjs

relations: ## Cross-check every page's rendered relationships against graph.json
	@node scripts/audit-relations.mjs

diagrams: ## Parse every mermaid diagram with the vendored engine that renders it
	@node scripts/check-mermaid.mjs

diagrams-file: ## Parse the mermaid fences in one markdown file — make diagrams-file FILE=tmp/designs/x.md
	@node scripts/check-mermaid-file.mjs $(FILE)

graph: ## Derive the relationship graph from the pages (site/assets/graph.json)
	@node scripts/build.mjs

pages: ## Refresh the generated regions inside each page (JSON-LD, element ids)
	@node scripts/build-pages.mjs

vocab: ## Regenerate the ontology page (site/vocab.html)
	@node scripts/build-vocab.mjs

claude: ## Regenerate the per-folder CLAUDE.md briefings
	@node scripts/build-claude.mjs

hub: ## Regenerate the hub (site/index.html) from the graph
	@node scripts/build-hub.mjs

graph-page: ## Regenerate the relationship overview (site/map/graph.html)
	@node scripts/build-graph-page.mjs
