/**
 * The search-synonyms reference page: rendered whole from the data file,
 * stamped, never built from a table the synonyms gate refuses.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fileStamp } from '../lib/generated.js';
import { capture, expectFail, expectMisuse, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from '../lib/sandbox.js';
import { docsTree } from '../site/site-fixtures.js';
import { FIX, GENERATOR, OUT, render, spec, SRC } from './gen-search-synonyms.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

function table(curated: Record<string, string[]> = { cache: ['caching'] }, expansions: Record<string, string[]> = { lag: ['performance'] }): void {
  docsTree(sb);
  sb.write(SRC, `${JSON.stringify({ version: 1, updated: '2026-09-30', note: 'n', curated, expansions, expansionMeta: { entries: Object.keys(expansions).length } }, null, 2)}\n`);
}

describe('gen-search-synonyms', () => {
  it('writes the page, then finds it fresh; a second run changes no byte', async () => {
    table();
    const wrote = await sb.run(spec);
    expectPass(wrote);
    expect(wrote.out).toBe(`[search-synonyms-fresh] wrote 1 of 1 file: ${OUT} (1 curated, 1 expansions)`);
    const page = sb.read(OUT);
    expect(page).toContain(fileStamp(GENERATOR, SRC));
    expect(page).toContain('| `cache` | `caching` |');
    expect(page).toContain('| `lag` | `performance` |');
    const again = await sb.run(spec);
    expect(again.out).toBe(`[search-synonyms-fresh] wrote 0 of 1 file: ${OUT} already matches ${SRC}`);
    expect(sb.read(OUT)).toBe(page);
    const check = await sb.run(spec, ['--check']);
    expectPass(check);
    expect(check.out).toBe(`[search-synonyms-fresh] ${OUT} is in sync with ${SRC} (1 curated, 1 expansions)`);
  });

  it('fails a stale page under --check, naming the repair, and writes nothing', async () => {
    table();
    await sb.run(spec);
    table({ cache: ['caching'] }, { lag: ['performance'], stale: ['caching'] });
    const before = sb.read(OUT);
    const r = await sb.run(spec, ['--check']);
    expectFail(r, FIX);
    expect(sb.read(OUT)).toBe(before);
  });

  it('renders nothing from a table that breaks a rule, naming each fault', async () => {
    table({ cache: ['caching'] }, { lag: ['nowhere'] });
    const r = await sb.run(spec);
    expectFail(r, `${SRC}: expansions "lag": "nowhere" is in no page's declared facts`);
    expect(sb.exists(OUT)).toBe(false);
  });

  it('fails a missing or unreadable table, leaves a page it did not stamp alone, and exits 2 on an unknown flag', async () => {
    docsTree(sb);
    expectFail(await sb.run(spec), `${SRC}: is missing`);
    sb.write(SRC, '{nope');
    expectFail(await sb.run(spec), `${SRC}: is not valid JSON`);
    table();
    sb.write(OUT, '# By hand\n');
    const left = await sb.run(spec);
    expect(left.out).toBe(`[search-synonyms-fresh] left ${OUT} alone: it does not carry this generator's stamp`);
    expect(sb.read(OUT)).toBe('# By hand\n');
    expectMisuse(await sb.run(spec, ['--nope']));
  });

  it('keeps curated in the file’s order and every word in a code span', () => {
    const page = render({ curated: { slow: ['latency'], fast: ['speed', 'quick'] }, expansions: {} });
    expect(page.indexOf('`slow`')).toBeLessThan(page.indexOf('`fast`'));
    expect(page).toContain('| `fast` | `speed` · `quick` |');
  });

  it('holds the committed page in sync with the real table (real tree)', async () => {
    expectPass(await capture(spec, ['--check'], REPO_ROOT));
  });
});
