/**
 * What kb.mjs works out from one page's text, kept on disk between runs.
 *
 * `find` scores every page's prose and `backlinks` reads every page's links,
 * and both start by parsing the page's markdown: about 1.5 s for the corpus,
 * when the answer itself costs a tenth of that. Each value here is a pure
 * function of one page's bytes and a facet name (`lines@basic`, `links`), so
 * it is filed under a hash of those bytes: an edited page misses and is worked
 * out again, and nothing can be stale, whatever wrote the file and whenever.
 *
 * The file lives in `node_modules/.cache/kb/derived.json` under the root, the
 * folder installed tooling keeps its caches in and git ignores. A root with no
 * `node_modules` (a test sandbox, a fresh clone before `make install`) gets no
 * file and works out every value each run. A write goes through a temp file
 * and a rename, so a reader never sees half a file, and two runs saving at
 * once each leave a whole one. A file that does not parse, or has another
 * version, is read as empty.
 *
 * It only grows while runs add values. On save, once it holds more than
 * `MAX_ENTRIES`, it keeps only what this run used: the next full run fills the
 * rest again.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** The file, relative to the root. */
export const CACHE_FILE = 'node_modules/.cache/kb/derived.json';

/** Bumped whenever a facet's shape changes, so an older file is read as empty. */
export const CACHE_VERSION = 1;

/** Past this many values, a save keeps only the ones its run used. */
export const MAX_ENTRIES = 4000;

interface CacheFile {
  readonly version: number;
  readonly entries: Record<string, unknown>;
}

/** The key one value is filed under: the text's hash and the facet. */
export function keyOf(text: string, facet: string): string {
  return `${createHash('sha256').update(text).digest('hex').slice(0, 32)}|${facet}`;
}

export class DiskCache {
  /** The file's absolute path, or null when the root keeps no cache. */
  readonly file: string | null;
  #entries: Map<string, unknown> | null = null;
  readonly #used = new Set<string>();
  #dirty = false;

  constructor(root: string) {
    this.file = fs.existsSync(path.join(root, 'node_modules')) ? path.join(root, CACHE_FILE) : null;
  }

  #load(): Map<string, unknown> {
    if (this.#entries !== null) return this.#entries;
    let entries: Record<string, unknown> = {};
    if (this.file !== null) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<CacheFile>;
        if (parsed.version === CACHE_VERSION && typeof parsed.entries === 'object' && parsed.entries !== null) entries = parsed.entries;
      } catch {
        // No file yet, or one that does not parse: start empty.
      }
    }
    this.#entries = new Map(Object.entries(entries));
    return this.#entries;
  }

  /** The value for this text and facet: from the file when it holds one, else `make`'s. */
  get<T>(text: string, facet: string, make: () => T): T {
    const entries = this.#load();
    const key = keyOf(text, facet);
    this.#used.add(key);
    if (entries.has(key)) return entries.get(key) as T;
    const v = make();
    entries.set(key, v);
    this.#dirty = true;
    return v;
  }

  /** Write the file when this run added a value. Never throws: a cache that cannot be written is only slower. */
  save(): void {
    if (this.file === null || !this.#dirty || this.#entries === null) return;
    let entries = [...this.#entries];
    if (entries.length > MAX_ENTRIES) entries = entries.filter(([k]) => this.#used.has(k));
    const tmp = `${this.file}.${String(process.pid)}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify({ version: CACHE_VERSION, entries: Object.fromEntries(entries) }));
      fs.renameSync(tmp, this.file);
      this.#dirty = false;
    } catch {
      fs.rmSync(tmp, { force: true });
    }
  }
}
