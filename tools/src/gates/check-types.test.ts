/**
 * The type-check wrapper: tsc's diagnostics, read back into the contract's
 * shapes. The compiler is the real one; the project it compiles is a fixture,
 * except in the last case, which compiles a copy of the real workspace.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { matcherOwners, typesProject } from '../lib/fixtures.js';
import {
  expectFail,
  expectMisuse,
  expectPass,
  makeSandbox,
  REPO_ROOT,
  type Sandbox,
} from '../lib/sandbox.js';
import { parseDiagnostics, PROJECT, spec, WORKSPACE } from './check-types.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
  typesProject(sb);
});
afterEach(() => sb.cleanup());

describe('the gate', () => {
  it('passes a project that compiles, counting the files it read', async () => {
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[typecheck] 1 files under tools/ type-check');
  });

  it('reports each type error on its file and line, one matched finding apiece', async () => {
    sb.write('tools/src/a.ts', "export const answer: number = 'forty-two';\n");
    sb.write('tools/src/deep/b.ts', 'export const b = 1;\nexport const c: string = b;\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.out).toBe('');
    const findings = r.err.split('\n');
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatch(/^\[typecheck\] FAIL tools\/src\/a\.ts:1: TS2322 /);
    expect(findings[1]).toMatch(/^\[typecheck\] FAIL tools\/src\/deep\/b\.ts:2: TS2322 /);
    for (const line of findings) expect(matcherOwners(line)).toEqual(['kb-gate-line']);
  });

  it('points a bad compiler option at the tsconfig that holds it', async () => {
    sb.write(PROJECT, '{ "compilerOptions": { "noSuchOption": true }, "include": ["src/**/*.ts"] }\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toMatch(/^\[typecheck\] FAIL tools\/tsconfig\.json:1: TS5023 /);
  });

  it('reports a diagnostic about no file without inventing one', async () => {
    sb.write(PROJECT, '{ "compilerOptions": { "types": [] }, "include": ["nowhere/**/*.ts"] }\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.err).toMatch(/^\[typecheck\] FAIL: TS18003 No inputs were found/);
    expect(matcherOwners(r.err)).toEqual([]);
  });

  it('names a missing project instead of compiling nothing', async () => {
    sb.rm(PROJECT);
    expectFail(await sb.run(spec), `[typecheck] FAIL ${PROJECT}: is missing`);
  });

  it('says so when tsc exits without a diagnostic it can parse', async () => {
    // tsc's own `#!/usr/bin/env node` shebang is what actually runs it, so a
    // `node` shadowed ahead of the real one on PATH stands in for a compiler
    // that crashed before writing a single formatted diagnostic — `run`
    // inherits `process.env` when given no `env` of its own, so the shim
    // reaches the same spawn this gate makes, no code path bypassed.
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-tsc-bin-'));
    fs.writeFileSync(path.join(bin, 'node'), '#!/bin/sh\necho "internal error: something exploded" >&2\nexit 9\n', {
      mode: 0o755,
    });
    const savedPath = process.env['PATH'];
    process.env['PATH'] = `${bin}:${savedPath ?? ''}`;
    try {
      const r = await sb.run(spec);
      expectFail(r);
      expect(r.err).toBe('[typecheck] FAIL: tsc exited 9 and named no diagnostic — its last line: internal error: something exploded');
    } finally {
      process.env['PATH'] = savedPath;
      fs.rmSync(bin, { recursive: true, force: true });
    }
  });
});

describe('misuse', () => {
  it('takes no arguments, and no --fix', async () => {
    expectMisuse(await sb.run(spec, ['--nope']));
    expectMisuse(await sb.run(spec, ['tools/src/a.ts']));
    expectMisuse(await sb.run(spec, ['--fix']));
  });
});

describe('parseDiagnostics', () => {
  it('reads a located diagnostic and a global one, and drops continuation lines', () => {
    const out = [
      "src/a.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      "  The expected type comes from property 'x'.",
      'error TS6053: File not found.',
      '/abs/node_modules/typescript/lib/lib.es5.d.ts',
    ].join('\n');
    expect(parseDiagnostics(out)).toEqual([
      { file: 'src/a.ts', line: 3, code: 'TS2322', message: "Type 'string' is not assignable to type 'number'." },
      { file: null, line: null, code: 'TS6053', message: 'File not found.' },
    ]);
  });

  it('keeps a path that holds parentheses of its own', () => {
    expect(parseDiagnostics('src/(group)/a.ts(1,1): error TS1005: x')[0]?.file).toBe('src/(group)/a.ts');
  });
});

describe('the real tree', () => {
  it('compiles a copy of the real workspace, counting its files by its own rule', async () => {
    // testing-C4: the project's own files are recounted here from what its
    // tsconfig includes — every `.ts` under src and e2e, plus vitest.config.ts.
    const walk = (dir: string): string[] =>
      fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      );
    const own = [`${WORKSPACE}/src`, `${WORKSPACE}/e2e`].flatMap(walk).filter((f) => f.endsWith('.ts')).length + 1;
    const include = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, PROJECT), 'utf8')) as { include: string[] })
      .include;
    expect(include).toEqual(['src/**/*.ts', 'e2e/**/*.ts', 'vitest.config.ts']);

    sb.rm('tools');
    sb.copyRepo('tools/src', 'tools/e2e', PROJECT, 'tools/vitest.config.ts', 'tools/package.json');
    sb.linkRepo('node_modules');
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe(`[typecheck] ${own} files under tools/ type-check`);
  });
});
