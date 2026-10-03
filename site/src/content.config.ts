/**
 * The Starlight content collection, and the frontmatter every page is held to
 * (spec interfaces/page-frontmatter.md).
 *
 * `area`, `tags` and `status` are closed lists from ./lib/site-types.ts,
 * so a page naming a value that does not exist fails the build — naming the
 * file and the key — rather than rendering a category nothing else knows about
 * (spec site-O2). Counts and order (two to five tags, one topic first) and the
 * description's length are the frontmatter and tag gates' to decide; the
 * schema checks only that each value exists.
 */
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

import { learningPresent, statusSchema } from './lib/learning';
import { repoRoot } from './lib/repo-root';
import { AREAS, TAG_IDS } from './lib/site-types';

const singleLine = z
  .string()
  .min(1)
  .refine((value) => !value.includes('\n'), { message: 'description must be a single line' });

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        description: singleLine,
        area: z.enum(AREAS),
        owner: z.string().min(1),
        tags: z.array(z.enum(TAG_IDS)).max(5),
        // Required, with no default, when the tree carries the learning
        // extension (maturity-C3): a page without one fails the build, named.
        // The hub, map and home pages write `status: stable`. Without the
        // extension it reads `stable` when left out (head-O1). ./lib/learning.ts.
        status: statusSchema(learningPresent(repoRoot())),
        // The page's source when it is generated: the generator of a hub.
        source: z.string().optional(),
        // KB extension keys, each with its own KB rule (docs/reference/page-rules.md).
        aliases: z.array(z.string()).optional(),
        solves: z.array(z.string()).optional(),
        favourite: z.boolean().optional(),
      }),
    }),
  }),
};
