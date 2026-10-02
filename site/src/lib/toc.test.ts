import { describe, expect, it } from 'vitest';

import { entryCount, worthShowing } from './toc';

describe('worthShowing', () => {
  it('drops an outline of one entry, a hub’s lone Overview', () => {
    expect(worthShowing([{ children: [] }])).toBe(false);
    expect(worthShowing([])).toBe(false);
  });

  it('counts nested entries, so one entry with a child is two', () => {
    expect(entryCount([{ children: [{}] }])).toBe(2);
    expect(worthShowing([{ children: [{}] }])).toBe(true);
    expect(worthShowing([{}, {}])).toBe(true);
  });
});
