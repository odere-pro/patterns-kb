/**
 * The two files the search box and every page load by a name the build gives
 * them: the bundle `kb.js` and the payload `search-index.js`. The post-build
 * pass tools/src/site/site-assets.ts renames each to carry a hash of its
 * bytes (`kb.3fa9c1d2.js`), so a host may cache either for good. Anything that
 * names one of them reads it through this module, which accepts both spellings:
 * the plain one `astro dev` and a sandbox site serve, and the hashed one a build writes.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Hex digits of a file's hash kept in its name. */
export const HASH_LENGTH = 8;

const HASH = `(?:\\.[0-9a-f]{${String(HASH_LENGTH)}})?`;

/** The bundle's file name, plain or hashed. */
export const BUNDLE_FILE = new RegExp(`^kb${HASH}\\.js$`);
/** The bundle as a page's `src` ends: the name after any `./` and `../` steps. */
export const BUNDLE_SRC = new RegExp(`^(?:\\.{1,2}/)*kb${HASH}\\.js$`);
/** The payload's file name, plain or hashed. */
export const PAYLOAD_FILE_NAME = new RegExp(`^search-index${HASH}\\.js$`);

/** The first `HASH_LENGTH` hex digits of the SHA-256 of `content`. */
export function contentHash(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex').slice(0, HASH_LENGTH);
}

/** `kb.js` and `abc12345` make `kb.abc12345.js`: the hash goes before the extension. */
export function hashedName(file: string, hash: string): string {
  const ext = path.extname(file);
  return `${file.slice(0, file.length - ext.length)}.${hash}${ext}`;
}

/** The file in `dir` (not below it) whose name `name` matches, or null; the first by name when several do. */
export function findInDir(dir: string, name: RegExp): string | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const hit = entries.filter((e) => name.test(e)).sort()[0];
  return hit === undefined ? null : path.join(dir, hit);
}
