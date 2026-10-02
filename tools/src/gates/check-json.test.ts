/**
 * The JSON validity gate. Two things a shell pipeline could not do are what
 * this suite is really about: a finding that names the file and its line, and
 * a run that reports every bad file rather than the first. The data-file
 * header is the third: a single source that does not say what it is for is
 * one nobody knows how to edit.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { matcherOwners } from '../lib/fixtures.js';
import {
  expectFail,
  expectMisuse,
  expectPass,
  makeSandbox,
  PERMISSIONS_ENFORCED,
  REPO_ROOT,
  type Sandbox,
} from '../lib/sandbox.js';
import { DATA_DIR, errorLine, headerProblem, HEADER, isExcluded, spec, tidy } from './check-json.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

/** A data file's bytes, header first. */
const dataFile = (extra: Record<string, unknown> = {}): string =>
  `${JSON.stringify({ version: 1, updated: '2026-09-23', note: 'fixture', ...extra }, null, 2)}\n`;

describe('the scan set', () => {
  it('skips node_modules at any depth, the scratch space and the built site', () => {
    expect(isExcluded('node_modules/x/package.json')).toBe(true);
    expect(isExcluded('site/node_modules/x/package.json')).toBe(true);
    expect(isExcluded('tmp/scratch.json')).toBe(true);
    expect(isExcluded('site/dist/search-index.json')).toBe(true);
    expect(isExcluded('site/.astro/settings.json')).toBe(true);
  });

  it('does not skip a directory that merely starts with an excluded name', () => {
    // `tmpfiles/` is not `tmp/`, and `site/distribution.json` is not
    // `site/dist/`. A prefix match on the path, not on the segment, would
    // silently stop checking both.
    expect(isExcluded('site/distribution.json')).toBe(false);
    expect(isExcluded('tmpfiles/x.json')).toBe(false);
  });
});

describe('the finding', () => {
  it('passes a tree of valid JSON and says how much it read', async () => {
    sb.write('a.json', '{"a": 1}\n');
    sb.write('nested/b.json', '[1, 2, 3]\n');
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[json-sanity] 2 JSON files parse; 0 data files open with their source header');
  });

  it('names the file AND the line — the whole reason this is not a jq pipeline', async () => {
    sb.write('good.json', '{"a": 1}\n');
    sb.write('bad.json', '{\n  "a": 1,\n  oops\n}\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toMatch(/^\[json-sanity\] FAIL bad\.json:3: is not valid JSON/);
  });

  it('reports every bad file, not the first — one run, every finding', async () => {
    sb.write('one.json', '{oops');
    sb.write('two.json', '[1,');
    sb.write('three.json', '{"fine": true}');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('one.json');
    expect(r.err).toContain('two.json');
    expect(r.err).not.toContain('three.json');
  });

  it('ignores an excluded tree even when the file in it is broken', async () => {
    sb.write('ok.json', '{}');
    sb.write('tmp/broken.json', '{oops');
    sb.write('node_modules/pkg/broken.json', '{oops');
    const r = await sb.run(spec);
    expectPass(r);
  });

  it('ignores a gitignored file', async () => {
    sb.write('.gitignore', 'coverage/\n');
    sb.write('ok.json', '{}');
    sb.write('coverage/broken.json', '{oops');
    expectPass(await sb.run(spec));
  });

  it('fails loudly when the tree holds no JSON at all — that is a wrong scan set', async () => {
    sb.write('README.md', '# nothing\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toContain('the scan set is wrong');
  });

});

describe('a data file owes its source header', () => {
  it('passes a data file that opens with version, updated and note', async () => {
    sb.write(`${DATA_DIR}gates.json`, dataFile({ gates: [] }));
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('1 data files open with their source header');
  });

  it('holds the three keys in the order the header names them', () => {
    expect(HEADER).toEqual(['version', 'updated', 'note']);
    expect(headerProblem({ updated: '2026-09-23', version: 1, note: 'x' })).toContain(
      'opens with updated, version, note',
    );
    expect(headerProblem({ gates: [], version: 1, updated: '2026-09-23', note: 'x' })).toContain(
      'opens with gates, version, updated',
    );
    expect(headerProblem({})).toContain('opens with no keys');
  });

  it('types each key: an integer version, a real date, a non-empty note', () => {
    expect(headerProblem({ version: '1', updated: '2026-09-23', note: 'x' })).toBe('version is not an integer');
    expect(headerProblem({ version: 1.5, updated: '2026-09-23', note: 'x' })).toBe('version is not an integer');
    expect(headerProblem({ version: 1, updated: 'yesterday', note: 'x' })).toBe(
      'updated is not a year-month-day date',
    );
    expect(headerProblem({ version: 1, updated: '2026-13-45', note: 'x' })).toBe(
      'updated is not a year-month-day date',
    );
    expect(headerProblem({ version: 1, updated: '2026-09-23', note: '  ' })).toContain('note is empty');
    expect(headerProblem({ version: 1, updated: '2026-09-23', note: 'x' })).toBeNull();
  });

  it('refuses an array or a scalar as a data file', () => {
    expect(headerProblem([1, 2])).toContain('is not a JSON object');
    expect(headerProblem(3)).toContain('is not a JSON object');
    expect(headerProblem(null)).toContain('is not a JSON object');
  });

  it('reports a headerless data file on its first line, and leaves other JSON alone', async () => {
    sb.write(`${DATA_DIR}allow/x.json`, '{"entries": []}\n');
    sb.write('package.json', '{"name": "x"}\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toBe(
      '[json-sanity] FAIL docs/data/allow/x.json:1: opens with entries — a data file opens with version, updated, note, in that order, before any data',
    );
  });
});

describe('named files', () => {
  it('checks only what it was given', async () => {
    sb.write('named.json', '{"a": 1}');
    sb.write('other.json', '{oops');
    const r = await sb.run(spec, ['named.json']);
    expectPass(r);
    expect(r.out).toContain('1 JSON files parse');
  });

  it('drops a named path that is not JSON rather than complaining about it', async () => {
    // `make validate-changed` matches on a coarse glob and hands over what it
    // matched; a `.md` in that list is the caller being generous, not wrong.
    sb.write('page.md', '# hi\n');
    sb.write('a.json', '{}');
    const r = await sb.run(spec, ['page.md', 'a.json']);
    expectPass(r);
    expect(r.out).toContain('1 JSON files parse');
  });

  it('is misuse, not a finding, when a named file does not exist', async () => {
    sb.write('a.json', '{}');
    const r = await sb.run(spec, ['nope.json']);
    expectMisuse(r);
    expect(r.out).toBe('');
  });

  it('skips a named path that is not a regular file, a FIFO included, silently', async () => {
    // `existsSync` cannot tell a file from a directory or a FIFO. A directory
    // would fail the read anyway; a FIFO would not fail, it would wait for a
    // writer forever. A writer waits here, so a read the stat guard failed to
    // stop comes back as a third parsed file instead of hanging the run.
    sb.mkdir('folder.json');
    const fifo = path.join(sb.dir, 'pipe.json');
    expect(spawnSync('mkfifo', [fifo]).status).toBe(0);
    const writer = spawn('sh', ['-c', `printf '{}' > '${fifo}'`]);
    sb.write('a.json', '{}');
    try {
      const r = await sb.run(spec, ['folder.json', 'pipe.json', 'a.json']);
      expectPass(r);
      expect(r.out).toContain('1 JSON files parse');
    } finally {
      writer.kill();
    }
  });

  // Root ignores file modes, so the permission failure this test needs cannot be produced.
  it.skipIf(!PERMISSIONS_ENFORCED)('skips a file it cannot read, rather than crashing the whole run', async () => {
    // A file can pass `statSync().isFile()` and still fail the read that
    // follows it — permission denied is the ordinary, reproducible case, but
    // the guard is for anything a stat cannot see coming.
    const abs = sb.write('locked.json', '{"a": 1}');
    fs.chmodSync(abs, 0o000);
    sb.write('a.json', '{}');
    try {
      const r = await sb.run(spec, ['locked.json', 'a.json']);
      expectPass(r);
      expect(r.out).toContain('1 JSON files parse');
    } finally {
      fs.chmodSync(abs, 0o644);
    }
  });

  it('rejects --fix: a broken JSON file has no one right repair', async () => {
    sb.write('a.json', '{}');
    expectMisuse(await sb.run(spec, ['--fix']));
  });

  it('rejects an unknown flag before it reads anything', async () => {
    sb.write('a.json', '{oops');
    const r = await sb.run(spec, ['--nope']);
    expectMisuse(r);
    expect(r.err).not.toContain('a.json');
  });
});

describe('reading V8 back', () => {
  it('takes the line the runtime offers', () => {
    expect(errorLine('Unexpected token o (line 3 column 1)', 'x')).toBe(3);
  });

  it('derives the line from a byte position when that is all there is', () => {
    const text = 'a\nb\nc';
    expect(errorLine('Unexpected token at position 4', text)).toBe(3);
  });

  it('gives up rather than guessing when the message carries neither', () => {
    expect(errorLine('something went wrong', 'x')).toBeUndefined();
  });

  it('strips the position clause the line number already carries', () => {
    expect(tidy('Unexpected token o in JSON at position 42')).toBe('Unexpected token o');
  });
});

describe('oracle scenarios', () => {
  it('contract-O1: a registered gate is one line when clean, two matched findings for two planted files', async () => {
    sb.write('docs/data/gates.json', dataFile({ gates: [] }));
    sb.write('a.json', '{"a": 1}\n');
    const clean = await sb.run(spec);
    expectPass(clean);
    expect(clean.out.split('\n')).toHaveLength(1);

    sb.write('one.json', '{\n  "a": 1,\n  oops\n}\n');
    sb.write('sub/two.json', '[1,');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.out).toBe('');
    const findings = r.err.split('\n');
    expect(findings).toHaveLength(2);
    for (const line of findings) {
      expect(line).toMatch(/^\[json-sanity\] FAIL (one\.json|sub\/two\.json)(:\d+)?: /);
      expect(matcherOwners(line)).toHaveLength(1);
    }
  });

  it('source-file-O1: a committed line-3 error and an uncommitted truncated file, nothing about the valid one', async () => {
    sb.write('valid.json', '{"ok": true}\n');
    sb.write('broken.json', '{\n  "a": 1,\n  oops\n}\n');
    sb.commit('two committed files');
    sb.write('fresh.json', '{"cut": [1, 2');

    const r = await sb.run(spec);
    expectFail(r);
    const findings = r.err.split('\n');
    expect(findings).toHaveLength(2);
    expect(findings.some((l) => l.startsWith('[json-sanity] FAIL broken.json:3: '))).toBe(true);
    expect(findings.some((l) => l.startsWith('[json-sanity] FAIL fresh.json'))).toBe(true);
    expect(r.err).not.toContain('valid.json');
  });
});

describe('the real tree', () => {
  it('parses every JSON file this repository holds, counting them by its own rule', async () => {
    // testing-C4: the count is recounted here without the gate's code — git's
    // own listing of tracked and not-ignored files, filtered by the three
    // excluded trees and node_modules at any depth, written out again.
    const listed = spawnSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.json'],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    ).stdout;
    const real = [...new Set(listed.split('\0').filter((f) => f !== ''))].filter(
      (f) =>
        !/(^|\/)node_modules\//.test(f) &&
        !/^(tmp|site\/dist|site\/\.astro)\//.test(f) &&
        fs.existsSync(path.join(REPO_ROOT, f)),
    );
    const data = real.filter((f) => f.startsWith('docs/data/'));
    // Copied, not read in place: the case reads the real files and writes only
    // its sandbox (testing-C1).
    sb.write('.gitignore', fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8'));
    for (const f of real) sb.copyRepo(f);

    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe(
      `[json-sanity] ${real.length} JSON files parse; ${data.length} data files open with their source header`,
    );
    expect(real.length).toBeGreaterThan(10);
  });
});
