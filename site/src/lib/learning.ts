// Whether the tree carries the learning extension, and the `status` key the
// content schema holds each page to because of it (spec kb.learning.maturity,
// maturity-C3, and its "Absent when" line).
//
// With the extension, `status` is required and has no default: a page that
// leaves it out fails the build, and Astro's error names that page, so a draft
// can never pass for a finished page. Without it, the head's own rule holds
// (kb.pagedata.head): `status` is optional and reads `stable` when left out,
// which is what the head scenario head-O1 builds.
//
// The extension is there when either of its two data files is: the learning
// paths or the prerequisite graph.
import fs from 'node:fs';
import path from 'node:path';

import { z } from 'astro/zod';

import { STATUSES } from './site-types';

/** The files whose presence means the tree carries the learning extension, repo-relative. */
export const LEARNING_FILES = [
  'docs/data/learning-paths.json',
  'docs/data/prerequisites.json',
] as const;

/** Does the tree at `root` carry the learning extension? */
export function learningPresent(root: string): boolean {
  return LEARNING_FILES.some((f) => fs.existsSync(path.join(root, f)));
}

/** The schema of `status`: required with the extension, `stable` by default without it. */
export function statusSchema(learning: boolean) {
  const status = z.enum(STATUSES);
  return learning ? status : status.default('stable');
}
