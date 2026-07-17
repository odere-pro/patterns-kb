# patterns — a static, build-less knowledge base. These targets are dev conveniences.
.DEFAULT_GOAL := help

.PHONY: help serve check all graph pages vocab hub graph-page relations

all: ## Regenerate every derived artifact from the pages
	@node scripts/build.mjs
	@node scripts/build-pages.mjs
	@node scripts/build-vocab.mjs
	@node scripts/build-hub.mjs
	@node scripts/build-graph-page.mjs

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

serve: ## Serve site/ locally at http://localhost:8000
	@cd site && python3 -m http.server 8000

check: ## Verify every generated artifact is in sync, no dangling links, relations match
	@node scripts/build.mjs --check
	@node scripts/build-pages.mjs --check
	@node scripts/build-vocab.mjs --check
	@node scripts/build-hub.mjs --check
	@node scripts/build-graph-page.mjs --check
	@node scripts/check-links.mjs
	@node scripts/audit-relations.mjs

relations: ## Cross-check every page's rendered relationships against graph.json
	@node scripts/audit-relations.mjs

graph: ## Derive the relationship graph from the pages (site/assets/graph.json)
	@node scripts/build.mjs

pages: ## Refresh the generated regions inside each page (JSON-LD, element ids)
	@node scripts/build-pages.mjs

vocab: ## Regenerate the ontology page (site/vocab.html)
	@node scripts/build-vocab.mjs

hub: ## Regenerate the hub (site/index.html) from the graph
	@node scripts/build-hub.mjs

graph-page: ## Regenerate the relationship overview (site/map/graph.html)
	@node scripts/build-graph-page.mjs
