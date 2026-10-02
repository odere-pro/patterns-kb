/**
 * The product registry gate, offline half: every entry used by its own
 * provider's column of a capability mapping table, every URL https and
 * pointing at documentation.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { capture, expectFail, expectMisuse, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from '../lib/sandbox.js';
import { answerOf, entryLine, FETCH_AT_ONCE, mentions, PAGES, pooled, spec, SRC, urlProblem } from './check-products.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => {
  vi.unstubAllGlobals();
  sb.cleanup();
});

const COLUMNS = ['aws', 'azure', 'google', 'oss'];

function registry(products: Record<string, Record<string, string>>, columns: unknown = COLUMNS): string {
  return `${JSON.stringify({ version: 1, updated: '2026-09-24', note: 'n', columns, products }, null, 2)}\n`;
}

/** A capability page whose mapping table has the given body rows (five cells each). */
function page(rows: string[][]): string {
  return [
    '---',
    'title: Storage',
    '---',
    '',
    '# Storage',
    '',
    '## Other table',
    '',
    '<!--meta block=choosing-->',
    '',
    '| A | B | C | D | E |',
    '| --- | --- | --- | --- | --- |',
    '| x | Amazon Glacier | x | x | x |',
    '',
    '## Across clouds',
    '',
    '<!--meta block=mapping-->',
    '',
    '| Capability | AWS | Azure | Google Cloud | Open source |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    '',
  ].join('\n');
}

const GOOD = {
  aws: { 'Amazon S3': 'https://docs.aws.amazon.com/s3/', S3: 'https://docs.aws.amazon.com/s3/' },
  azure: { 'Blob Storage': 'https://learn.microsoft.com/azure/storage/blobs/' },
  google: { 'Cloud Storage': 'https://cloud.google.com/storage/docs' },
  oss: { MinIO: 'https://min.io/docs/minio/linux/index.html' },
};

function tree(products: Record<string, Record<string, string>> = GOOD): void {
  sb.write(SRC, registry(products));
  sb.write(
    `${PAGES}/storage.md`,
    page([
      ['Object store', 'Amazon S3', 'Blob Storage', 'Cloud Storage', 'MinIO, Ceph'],
      ['Archive tier', 'S3 Glacier', 'Blob Storage archive tier', 'no first-party equivalent', 'no direct open-source equivalent'],
    ]),
  );
}

describe('check-products', () => {
  it('passes a registry every column uses, counting entries and the worklist', async () => {
    tree();
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe(
      '[products] 5 product entries across 4 providers, each used by its own column in 1 capability pages; 1 cell fragments name no entry (--worklist lists them)',
    );
  });

  it('lists the fragments no entry names with --worklist, still exiting 0', async () => {
    tree();
    const r = await sb.run(spec, ['--worklist']);
    expectPass(r);
    expect(r.err.split('\n')).toEqual(['[products] unregistered — oss: Ceph']);
  });

  it('fails a dead entry and one filed under the wrong provider, at its line in the registry', async () => {
    tree({ ...GOOD, aws: { ...GOOD.aws, 'Amazon EFS': 'https://docs.aws.amazon.com/efs/' }, google: { ...GOOD.google, 'Blob Storage': 'https://learn.microsoft.com/azure/storage/blobs/' } });
    const r = await sb.run(spec);
    expectFail(r);
    const text = sb.read(SRC);
    expect(r.err.split('\n')).toEqual([
      `[products] FAIL ${SRC}:${String(entryLine(text, 'aws', 'Amazon EFS'))}: aws "Amazon EFS" is registered but no mapping cell in its column says it — nothing renders this URL; delete it`,
      `[products] FAIL ${SRC}:${String(entryLine(text, 'google', 'Blob Storage'))}: google "Blob Storage" appears only in the azure column — it would send readers to the wrong provider's docs; move it`,
    ]);
  });

  it('fails a URL that is not https or is a bare homepage', async () => {
    tree({ ...GOOD, aws: { 'Amazon S3': 'http://docs.aws.amazon.com/s3/' }, oss: { MinIO: 'https://min.io/' } });
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('aws "Amazon S3" is not https: http://docs.aws.amazon.com/s3/');
    expect(r.err).toContain('oss "MinIO" points at a bare homepage rather than documentation: https://min.io/');
  });

  it('names a registry that is missing, not JSON, or the wrong shape', async () => {
    sb.write(`${PAGES}/storage.md`, page([]));
    expectFail(await sb.run(spec), `[products] FAIL ${SRC}: is missing`);
    sb.write(SRC, '{ nope');
    expectFail(await sb.run(spec), `[products] FAIL ${SRC}: is not valid JSON`);
    sb.write(SRC, 'null');
    expectFail(await sb.run(spec), '`columns` is missing or is not a list of provider ids');
    sb.write(SRC, registry({}, ['aws', 7]));
    expectFail(await sb.run(spec), '`columns` is missing or is not a list of provider ids');
    sb.write(SRC, `${JSON.stringify({ columns: COLUMNS, products: [] })}\n`);
    expectFail(await sb.run(spec), '`products` is missing or is not an object keyed by provider');
    sb.write(SRC, registry({ gcp: {}, aws: { S3: 7 } as unknown as Record<string, string>, azure: [] as unknown as Record<string, string> }));
    const shape = await sb.run(spec);
    expectFail(shape);
    expect(shape.err.split('\n')).toEqual([
      `[products] FAIL ${SRC}: products has provider "gcp", which is not one of the columns`,
      `[products] FAIL ${SRC}: products "aws" is not an object of name to URL`,
      `[products] FAIL ${SRC}: products "azure" is not an object of name to URL`,
    ]);
  });

  it('fails when there is no capability page to hold the registry to', async () => {
    sb.write(SRC, registry(GOOD));
    expectFail(await sb.run(spec), `[products] FAIL: no capability page under ${PAGES}/`);
    sb.write(`${PAGES}/notes.txt`, 'not a page\n');
    expectFail(await sb.run(spec), `no capability page under ${PAGES}/`);
  });

  it('reads no cell past the registry\'s last column, so a row with an extra cell names nothing more', async () => {
    tree();
    sb.write(
      `${PAGES}/storage.md`,
      page([
        ['Object store', 'Amazon S3', 'Blob Storage', 'Cloud Storage', 'MinIO', 'Amazon Glacier'],
        ['Archive tier', 'S3', 'Blob Storage', 'Cloud Storage', 'MinIO'],
      ]),
    );
    const r = await sb.run(spec, ['--worklist']);
    expectPass(r);
    expect(r.err).not.toContain('Amazon Glacier');
  });

  it('treats a provider the registry omits as holding no entries', async () => {
    tree({ aws: GOOD.aws });
    expectPass(await sb.run(spec));
  });

  it('is misuse to pass an unknown flag', async () => {
    tree();
    expectMisuse(await sb.run(spec, ['--nope']));
  });
});

describe('--online (make products)', () => {
  /** A network where each URL answers the status `answers` gives it, or throws. */
  function network(answers: (url: string, method: string) => number | Error): string[] {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: { method: string }) => {
      asked.push(`${init.method} ${url}`);
      const a = answers(url, init.method);
      if (a instanceof Error) throw a;
      return new Response(init.method === 'GET' ? 'page' : null, { status: a });
    });
    return asked;
  }

  it('fetches each distinct URL once and passes when every one answers', async () => {
    tree();
    const asked = network(() => 200);
    const r = await sb.run(spec, ['--online']);
    expectPass(r);
    expect(r.out).toMatch(/; 4 URLs fetched, every one answering$/);
    expect(asked.filter((a) => a.includes('docs.aws.amazon.com/s3/'))).toEqual(['HEAD https://docs.aws.amazon.com/s3/']);
  });

  it('asks again with GET where HEAD is refused, and names a dead page and a silent host', async () => {
    tree();
    const asked = network((url, method) => {
      if (url.includes('learn.microsoft.com')) return method === 'HEAD' ? 405 : 200;
      if (url.includes('cloud.google.com')) return 404;
      if (url.includes('min.io')) return new Error('getaddrinfo ENOTFOUND min.io');
      return 200;
    });
    const r = await sb.run(spec, ['--online']);
    expectFail(r);
    expect(asked).toContain('GET https://learn.microsoft.com/azure/storage/blobs/');
    expect(r.err).toContain('google "Cloud Storage" https://cloud.google.com/storage/docs answers 404 — find the page it moved to, or drop the entry');
    expect(r.err).toContain('oss "MinIO" https://min.io/docs/minio/linux/index.html did not answer (getaddrinfo ENOTFOUND min.io)');
    expect(r.err).not.toContain('learn.microsoft.com');
  });

  it('reads a provider column with no entries as nothing to fetch', async () => {
    const { oss: _oss, ...rest } = GOOD;
    tree(rest);
    network(() => 200);
    const r = await sb.run(spec, ['--online']);
    expectPass(r);
    expect(r.out).toMatch(/; 3 URLs fetched, every one answering$/);
  });

  it('fetches nothing when the offline half already failed', async () => {
    tree();
    sb.write(SRC, registry({ ...GOOD, oss: { MinIO: 'http://min.io/docs/' } }));
    const asked = network(() => 200);
    expectFail(await sb.run(spec, ['--online']));
    expect(asked).toEqual([]);
  });

  it('reports a thrown value that is not an Error as it is', async () => {
    const fake = (async () => {
      throw 'offline';
    }) as unknown as typeof fetch;
    expect(await answerOf('https://x.test/a', fake)).toEqual({ error: 'offline' });
  });

  it('runs a few at a time and keeps the order', async () => {
    let running = 0;
    let most = 0;
    const out = await pooled([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], FETCH_AT_ONCE, async (n) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 1));
      running -= 1;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
    expect(most).toBe(FETCH_AT_ONCE);
    expect(await pooled([], 3, async (n: number) => n)).toEqual([]);
  });
});

describe('the helpers', () => {
  it('match a name whole, never inside a longer word', () => {
    expect(mentions('SQS FIFO queues', 'SQS')).toBe(true);
    expect(mentions('AWS Batch', 'Batch')).toBe(true);
    expect(mentions('Batching', 'Batch')).toBe(false);
    expect(mentions('Cloud Bigtable', 'Bigtable')).toBe(true);
  });

  it('accept a docs host at its root, and name an unparseable URL', () => {
    expect(urlProblem('https://docs.nats.io/')).toBeNull();
    expect(urlProblem('https://kafka.readthedocs.io')).toBeNull();
    expect(urlProblem('not a url')).toBe('has an unparseable URL: not a url');
  });

  it('find an entry\'s line only inside its own provider', () => {
    const text = registry({ aws: { S3: 'https://x.test/a' }, azure: {} });
    expect(entryLine(text, 'aws', 'S3')).toBe(text.split('\n').findIndex((l) => l.includes('"S3"')) + 1);
    expect(entryLine(text, 'azure', 'S3')).toBeUndefined();
    expect(entryLine(text, 'google', 'S3')).toBeUndefined();
    expect(entryLine('"aws": {\n  "X": "y"\n', 'aws', 'S3')).toBeUndefined();
  });
});

describe('the real tree', () => {
  it('passes, counting the registry entries and the capability pages by its own walk', async () => {
    const reg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, SRC), 'utf8')) as { products: Record<string, Record<string, string>> };
    const entries = Object.values(reg.products).reduce((n, p) => n + Object.keys(p).length, 0);
    const pages = fs.readdirSync(path.join(REPO_ROOT, PAGES)).filter((f) => f.endsWith('.md')).length;
    const r = await capture(spec, [], REPO_ROOT);
    expectPass(r);
    expect(r.out).toMatch(
      new RegExp(`^\\[products\\] ${String(entries)} product entries across 4 providers, each used by its own column in ${String(pages)} capability pages; \\d+ cell fragments name no entry`),
    );
  });
});
