// The site's closed value lists as flat tuples, named once.
//
// The site's content schema (site/src/content.config.ts, through
// ./site-types.ts) builds its area and tag enums from these tuples, and two gates hold
// each to its single source, both ways: tools/src/gates/check-tags.ts holds TAGS
// to docs/data/tags.json, and tools/src/gates/check-site-structure.ts holds AREAS
// to docs/data/site-structure.json, in order. Adding a value is one edit here
// and one there, in the same change.
//
// Each tuple is one flat list of quoted ids, each id once: the gates read it as
// text (tupleLiteral in tools/src/lib/published.ts). A comment is skipped whole,
// so an id commented out is not a member; anything else in the list — a nested
// literal, a spread, a bare word — is a finding rather than a quiet miscount.

/**
 * Every area a page may carry, in the structure file's order: the closed area
 * list (spec: kb.content.frontmatter). A new area in
 * docs/data/site-structure.json changes this list in the same change.
 */
export const AREAS = [
  'patterns',
  'gof',
  'gof-creational',
  'gof-structural',
  'gof-behavioral',
  'gof-extra',
  'enterprise',
  'architecture',
  'distributed',
  'distributed-resilience',
  'distributed-routing',
  'distributed-scale',
  'distributed-coordination',
  'distributed-data',
  'concurrency',
  'messaging',
  'caching',
  'ddd',
  'functional',
  'testing',
  'security',
  'frontend',
  'ml',
  'hazards',
  'designs',
  'designs-foundational',
  'designs-intermediate',
  'designs-advanced',
  'themes',
  'themes-starting',
  'themes-shaping',
  'themes-data',
  'themes-scale',
  'themes-operating',
  'principles',
  'principles-craft',
  'principles-systems',
  'capabilities',
  'comparisons',
  'map',
  'reference',
] as const;
export type Area = (typeof AREAS)[number];

/**
 * Every tag a page may carry, in facet order — topics, then skills, then
 * languages (spec: kb.data.tags). The facets, definitions and which page class
 * may use each value are docs/data/tags.json, the single source.
 */
export const TAGS = [
  'anti-pattern',
  'api-design',
  'caching',
  'concurrency',
  'consistency',
  'coordination',
  'data-modeling',
  'domain-modeling',
  'event-driven',
  'integration',
  'low-level-design',
  'machine-learning',
  'messaging',
  'modularity',
  'observability',
  'operations',
  'partitioning',
  'performance',
  'persistence',
  'replication',
  'resilience',
  'routing',
  'scalability',
  'security',
  'testing',
  'transactions',
  'ui-architecture',
  'abstraction',
  'access-control',
  'asynchrony',
  'authentication',
  'availability',
  'backpressure',
  'batching',
  'boundaries',
  'code-smell',
  'composition',
  'data-access',
  'decoupling',
  'durability',
  'encapsulation',
  'error-handling',
  'extensibility',
  'immutability',
  'isolation',
  'latency',
  'lifecycle',
  'load-balancing',
  'maintainability',
  'polymorphism',
  'read-optimization',
  'readability',
  'resource-management',
  'separation-of-concerns',
  'state-management',
  'testability',
  'throughput',
  'transformation',
  'validation',
  'cloud',
  'edge',
] as const;
export type Tag = (typeof TAGS)[number];
