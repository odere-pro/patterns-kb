/**
 * The closed value lists the content schema builds its enums from. The areas
 * and tags come from the tuples in ./types.ts, which the structure and tags
 * gates hold to the data files; these assert the schema reads those tuples.
 */
import { describe, expect, it } from 'vitest';

import { AREAS, STATUSES, TAG_IDS } from './site-types';
import { AREAS as AREA_TUPLE, TAGS } from './types';

describe('site-types', () => {
  it('holds the three statuses, in order', () => {
    expect(STATUSES).toEqual(['draft', 'stable', 'deprecated']);
  });

  it('takes every area id and every tag id from the tuples in ./types.ts', () => {
    expect(AREAS).toBe(AREA_TUPLE);
    expect(TAG_IDS).toBe(TAGS);
    expect(AREAS[0]).toBe('patterns');
    expect(AREAS).toContain('distributed-resilience');
    expect(new Set(AREAS).size).toBe(AREAS.length);
    expect(TAG_IDS).toContain('resilience');
  });
});
