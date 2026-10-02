/**
 * The page block's lists hold together: the block is closed over exactly the
 * required, optional and KB keys, each once, and the exercise regime keeps
 * its own level list (spec: kb.content.frontmatter, value-lists).
 */

import { expect, it } from 'vitest';

import { DESCRIPTION_MAX, descriptionProblem, EXERCISE_KEYS, KB_KEYS, LEVELS, OPTIONAL, PAGE_KEYS, REQUIRED, STATUSES } from './page-block.js';

it('closes the page block over the required, optional and KB keys, each once', () => {
  expect(PAGE_KEYS).toEqual([...REQUIRED, ...OPTIONAL, ...KB_KEYS]);
  expect(new Set(PAGE_KEYS).size).toBe(PAGE_KEYS.length);
  expect(REQUIRED).toEqual(['title', 'description', 'area', 'owner', 'tags', 'status']);
});

it('lists the exercise levels easiest first and the statuses the maturity unit names', () => {
  expect(LEVELS).toEqual(['beginner', 'intermediate', 'advanced']);
  expect(STATUSES).toEqual(['draft', 'stable', 'deprecated']);
});

it('keeps the exercise block apart from the page block: no title, owner or status', () => {
  for (const k of ['title', 'owner', 'status']) expect(EXERCISE_KEYS as readonly string[]).not.toContain(k);
});

it('finds a block scalar and a description over 160 characters, quotes aside and an em dash counting once', () => {
  expect(descriptionProblem('>')).toBe('description is a block scalar — write it as one plain line so its length means something');
  expect(descriptionProblem('|-')).toMatch(/block scalar/);
  expect(descriptionProblem('a'.repeat(DESCRIPTION_MAX))).toBeNull();
  expect(descriptionProblem(`"${'a'.repeat(DESCRIPTION_MAX)}"`)).toBeNull();
  expect(descriptionProblem(`'${'—'.repeat(DESCRIPTION_MAX)}'`)).toBeNull();
  expect(descriptionProblem('a'.repeat(DESCRIPTION_MAX + 1))).toBe('description is 161 characters — 160 is where search results cut off');
  expect(descriptionProblem('"')).toBeNull();
  expect(descriptionProblem('')).toBeNull();
});
