// The shapes and closed value lists the site's own code passes around, named
// once. The enforcing side is src/content.config.ts: its zod schema builds its
// enums from these tuples, so a value added here is one edit both the writing
// side (zod) and the reading side (these types) see.
//
// The area and tag lists are not restated here: they are the flat AREAS and
// TAGS tuples in ./types.ts, which the structure and tags gates hold to
// docs/data/site-structure.json and docs/data/tags.json, both ways.
import { AREAS as AREA_TUPLE, TAGS } from './types';

/** A page's lifecycle; required with the learning extension, `stable` when undeclared without it (./learning.ts). */
export const STATUSES = ['draft', 'stable', 'deprecated'] as const;
export type Status = (typeof STATUSES)[number];

/** Every area id, in the structure file's order. */
export const AREAS = AREA_TUPLE;

/** Every tag id the tag file lists, in facet order. */
export const TAG_IDS = TAGS;

/**
 * The frontmatter every page in the docs collection carries, as a component
 * reads it. Starlight's own optional keys are not repeated here.
 */
export interface PageFrontmatter {
  title: string;
  description: string;
  area: string;
  owner: string;
  tags: string[];
  status?: Status;
  source?: string;
}

/** One entry on a hub page, as tools/src/site/gen-site-hubs.ts assembles it. */
export interface HubPage {
  href: string;
  title: string;
  description: string;
  status?: Status;
  /** A page's slug, for its favourite and practiced toggles; absent on a nested area's entry. */
  slug?: string;
  /** Its tags, which the hub's facet filter reads. */
  tags?: string[];
  /** The page's own `favourite` answer. */
  favourite?: boolean;
  /** Old anchor ids a home card answers for (../lib/atlas.ts); cards only. */
  anchors?: string[];
  /** How many pages the card's area holds, in the kind's word (`216 patterns`); cards only (./counts.ts). */
  count?: string;
}

/** A labelled group of hub entries; the unlabelled one leads. */
export interface HubGroup {
  label?: string;
  pages: HubPage[];
}
