/**
 * maturity-C3: with the learning extension the schema's `status` has no
 * default, so a page without one fails; without the extension it reads
 * `stable`, as the head's own rule (head-O1) asks.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LEARNING_FILES, learningPresent, statusSchema } from './learning';
import { repoRoot } from './repo-root';

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const tree = (files: readonly string[]): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-learning-'));
  made.push(root);
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), '{}');
  }
  return root;
};

describe('learningPresent', () => {
  it('is true when either learning file is there, false when neither is', () => {
    expect(learningPresent(tree([]))).toBe(false);
    for (const f of LEARNING_FILES) expect(learningPresent(tree([f])), f).toBe(true);
  });

  it('is true for the real tree', () => {
    expect(learningPresent(repoRoot())).toBe(true);
  });
});

describe('maturity-C3', () => {
  it('maturity-C3: with the learning extension, `status` has no default — a page without one fails; each declared value passes unchanged', () => {
    const schema = statusSchema(true);
    expect(schema.safeParse(undefined).success).toBe(false);
    expect(schema.safeParse('finished').success).toBe(false);
    for (const s of ['draft', 'stable', 'deprecated']) expect(schema.parse(s)).toBe(s);
  });

  it('without the extension, a missing `status` reads stable (head-O1) and a declared one stays', () => {
    const schema = statusSchema(false);
    expect(schema.parse(undefined)).toBe('stable');
    expect(schema.parse('draft')).toBe('draft');
    expect(schema.safeParse('finished').success).toBe(false);
  });
});
