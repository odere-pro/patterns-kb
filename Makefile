# patterns — a static, build-less knowledge base. These targets are dev conveniences.
.DEFAULT_GOAL := help
SCRATCH ?= /private/tmp/claude-501/-Users-oleksandrderechei-git/535e9b5b-fd69-4d0b-96d9-1c964a7fdfc8/scratchpad

.PHONY: help serve check graph hub specs relations

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

serve: ## Serve site/ locally at http://localhost:8000
	@cd site && python3 -m http.server 8000

check: ## Verify graph + hub are in sync, no dangling links, relations match the graph
	@node scripts/build-graph.mjs --check
	@node scripts/build-hub.mjs --check
	@node scripts/check-links.mjs
	@node scripts/audit-relations.mjs

relations: ## Cross-check every page's rendered relationships against graph.json
	@node scripts/audit-relations.mjs

graph: ## Regenerate the relationship graph (site/assets/graph.json)
	@node scripts/build-graph.mjs

hub: ## Regenerate the hub (site/index.html) from the graph
	@node scripts/build-hub.mjs

specs: ## Regenerate per-page authoring specs into the scratchpad
	@node scripts/build-specs.mjs $(SCRATCH)
