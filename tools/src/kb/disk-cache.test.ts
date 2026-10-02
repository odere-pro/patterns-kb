/**
 * The on-disk cache behind `find` and `backlinks`. What it must never do is
 * hand back a value for text it was not worked out from, so the cases pin the
 * key to the bytes, the facet to the key, and every way the file can be
 * missing, foreign or unwritable to "work it out again".
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { rmTree } from '../lib/sandbox.js';
import { CACHE_FILE, CACHE_VERSION, DiskCache, keyOf, MAX_ENTRIES } from './disk-cache.js';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-disk-cache-'));
  fs.mkdirSync(path.join(root, 'node_modules'));
});
afterEach(() => rmTree(root));

const file = (): string => path.join(root, CACHE_FILE);
const counter = (): { calls: number; make: () => string[] } => {
  const c = { calls: 0, make: (): string[] => [`value ${String((c.calls += 1))}`] };
  return c;
};

describe('keyOf', () => {
  it('changes with the text and with the facet', () => {
    expect(keyOf('a', 'lines@all')).not.toBe(keyOf('b', 'lines@all'));
    expect(keyOf('a', 'lines@all')).not.toBe(keyOf('a', 'links'));
    expect(keyOf('a', 'links')).toBe(keyOf('a', 'links'));
  });
});

describe('DiskCache', () => {
  it('works a value out once, saves it, and a second run reads it back without working it out', () => {
    const c = counter();
    const first = new DiskCache(root);
    expect(first.get('page text', 'links', c.make)).toEqual(['value 1']);
    expect(first.get('page text', 'links', c.make)).toEqual(['value 1']);
    first.save();
    expect(JSON.parse(fs.readFileSync(file(), 'utf8'))).toMatchObject({ version: CACHE_VERSION });

    const second = new DiskCache(root);
    expect(second.get('page text', 'links', c.make)).toEqual(['value 1']);
    expect(c.calls).toBe(1);
  });

  it('works the value out again for edited text', () => {
    const c = counter();
    const a = new DiskCache(root);
    a.get('before', 'links', c.make);
    a.save();
    expect(new DiskCache(root).get('after', 'links', c.make)).toEqual(['value 2']);
  });

  it('keeps no file for a root with no node_modules, and still answers', () => {
    fs.rmdirSync(path.join(root, 'node_modules'));
    const c = counter();
    const d = new DiskCache(root);
    expect(d.file).toBeNull();
    expect(d.get('t', 'links', c.make)).toEqual(['value 1']);
    d.save();
    expect(fs.existsSync(path.join(root, 'node_modules'))).toBe(false);
  });

  it('reads a file that does not parse, or has another version, as empty', () => {
    const c = counter();
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), 'not json');
    expect(new DiskCache(root).get('t', 'links', c.make)).toEqual(['value 1']);
    fs.writeFileSync(file(), JSON.stringify({ version: CACHE_VERSION + 1, entries: { [keyOf('t', 'links')]: ['stale'] } }));
    expect(new DiskCache(root).get('t', 'links', c.make)).toEqual(['value 2']);
    fs.writeFileSync(file(), JSON.stringify({ version: CACHE_VERSION, entries: null }));
    expect(new DiskCache(root).get('t', 'links', c.make)).toEqual(['value 3']);
  });

  it('writes nothing when a run added nothing, and nothing before a run read anything', () => {
    new DiskCache(root).save();
    expect(fs.existsSync(file())).toBe(false);
    const c = counter();
    const a = new DiskCache(root);
    a.get('t', 'links', c.make);
    a.save();
    const at = fs.statSync(file()).mtimeMs;
    const b = new DiskCache(root);
    b.get('t', 'links', c.make);
    b.save();
    expect(fs.statSync(file()).mtimeMs).toBe(at);
  });

  it('past the limit, keeps only what its own run used', () => {
    const entries = Object.fromEntries(Array.from({ length: MAX_ENTRIES }, (_, i) => [keyOf(`old ${String(i)}`, 'links'), [i]]));
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify({ version: CACHE_VERSION, entries }));
    const c = counter();
    const d = new DiskCache(root);
    d.get('old 7', 'links', c.make);
    d.get('new', 'links', c.make);
    d.save();
    expect(Object.keys((JSON.parse(fs.readFileSync(file(), 'utf8')) as { entries: object }).entries).sort()).toEqual(
      [keyOf('old 7', 'links'), keyOf('new', 'links')].sort(),
    );
  });

  it('swallows a write that fails and leaves no temp file behind', () => {
    // A directory where the file should be: the rename fails.
    fs.mkdirSync(file(), { recursive: true });
    const c = counter();
    const d = new DiskCache(root);
    d.get('t', 'links', c.make);
    expect(() => {
      d.save();
    }).not.toThrow();
    expect(fs.readdirSync(path.dirname(file())).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});
