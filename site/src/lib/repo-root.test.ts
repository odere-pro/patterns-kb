/**
 * Finding the repository a build runs in: the nearest folder at or above the
 * working directory holding the structure file.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { repoRoot, STRUCTURE_FILE } from './repo-root';

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('repoRoot', () => {
  it('finds the root from a folder below it, and from the root itself', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-root-')));
    made.push(root);
    fs.mkdirSync(path.join(root, 'docs/data'), { recursive: true });
    fs.writeFileSync(path.join(root, STRUCTURE_FILE), '{}');
    fs.mkdirSync(path.join(root, 'site/src'), { recursive: true });
    expect(repoRoot(path.join(root, 'site/src'))).toBe(root);
    expect(repoRoot(root)).toBe(root);
  });

  it('finds the real repository from the working directory vitest runs in', () => {
    expect(fs.existsSync(path.join(repoRoot(), STRUCTURE_FILE))).toBe(true);
  });

  it('says so when no folder above holds the structure file', () => {
    const lone = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-lone-')));
    made.push(lone);
    expect(() => repoRoot(lone)).toThrow(`no ${STRUCTURE_FILE} at or above ${lone}`);
  });
});
