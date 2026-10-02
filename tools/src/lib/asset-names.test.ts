/**
 * The names the build gives the bundle and the search payload
 * (tools/src/lib/asset-names.ts).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BUNDLE_FILE, BUNDLE_SRC, contentHash, findInDir, hashedName, PAYLOAD_FILE_NAME } from './asset-names.js';

describe('asset names', () => {
  it('takes the plain and the hashed spelling of each file, and nothing else', () => {
    for (const ok of ['kb.js', 'kb.3fa9c1d2.js']) expect(BUNDLE_FILE.test(ok)).toBe(true);
    for (const bad of ['kb.3FA9C1D2.js', 'kb.3fa9c1.js', 'kb.json', 'xkb.js']) expect(BUNDLE_FILE.test(bad), bad).toBe(false);
    for (const ok of ['search-index.js', 'search-index.0a1b2c3d.js']) expect(PAYLOAD_FILE_NAME.test(ok)).toBe(true);
    expect(PAYLOAD_FILE_NAME.test('search-index.json')).toBe(false);
  });

  it('reads the bundle from a page src at any depth', () => {
    expect(BUNDLE_SRC.test('../../kb.3fa9c1d2.js')).toBe(true);
    expect(BUNDLE_SRC.test('./kb.js')).toBe(true);
    expect(BUNDLE_SRC.test('https://x/kb.js')).toBe(false);
  });

  it('hashes bytes to eight hex digits and puts the hash before the extension', () => {
    expect(contentHash('a')).toMatch(/^[0-9a-f]{8}$/);
    expect(contentHash('a')).toBe(contentHash(Buffer.from('a')));
    expect(contentHash('a')).not.toBe(contentHash('b'));
    expect(hashedName('kb.js', 'abc12345')).toBe('kb.abc12345.js');
  });

  it('finds a file in a folder by name pattern, or null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-names-'));
    try {
      fs.writeFileSync(path.join(dir, 'kb.abc12345.js'), '');
      expect(findInDir(dir, BUNDLE_FILE)).toBe(path.join(dir, 'kb.abc12345.js'));
      expect(findInDir(dir, PAYLOAD_FILE_NAME)).toBeNull();
      expect(findInDir(path.join(dir, 'none'), BUNDLE_FILE)).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
