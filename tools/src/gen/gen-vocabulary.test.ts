/**
 * The glossary reference page: rendered whole from the data file, stamped,
 * every Don't say line opted out of the ban it documents (spec:
 * kb.data.glossary, reference-page, glossary-C8).
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ALLOWLIST, spec as banGate } from '../gates/check-vocabulary.js';
import { allowlistJson } from '../lib/fixtures.js';
import { fileStamp } from '../lib/generated.js';
import { capture, expectFail, expectMisuse, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from '../lib/sandbox.js';
import { FIX, GENERATOR, OUT, render, scopeTitle, spec, SRC } from './gen-vocabulary.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

const TERMS = [
  { id: 'kind-pattern', term: 'pattern', definition: 'A reusable solution; see `kb:kind`.', aliases: [], avoid: [], scope: 'kinds', owner: 'O', see: ['prop-kind'] },
  { id: 'prop-kind', term: 'kb:kind', definition: 'Which kind.', aliases: [], avoid: [], scope: 'properties', owner: 'O', see: ['kind-pattern'] },
  { id: 'word-issue', term: 'issue', definition: 'Hands out a new id.', aliases: ['generate', 'a_b'], avoid: ['mint', 'minted'], scope: 'house', owner: 'O', see: [] },
];
const SCOPES = { kinds: 'The model | decides.', empty: 'Nothing here yet.', properties: 'The page decides.', house: 'The owner decides.' };

function tree(terms: unknown[] = TERMS): void {
  sb.write(SRC, `${JSON.stringify({ version: 1, updated: '2026-09-24', note: 'n', scopes: SCOPES, terms }, null, 2)}\n`);
}

describe('gen-vocabulary', () => {
  it('writes the page, then finds it fresh; a second run changes no byte', async () => {
    tree();
    const wrote = await sb.run(spec);
    expectPass(wrote);
    expect(wrote.out).toBe(`[glossary-fresh] wrote 1 of 1 file: ${OUT} (3 terms)`);
    const first = sb.read(OUT);
    const again = await sb.run(spec);
    expect(again.out).toBe(`[glossary-fresh] wrote 0 of 1 file: ${OUT} already matches ${SRC}`);
    expect(sb.read(OUT)).toBe(first);
    const check = await sb.run(spec, ['--check']);
    expectPass(check);
    expect(check.out).toBe(`[glossary-fresh] ${OUT} is in sync with ${SRC} (3 terms)`);
  });

  it('renders one anchored block per term under its scope, Say, Don\'t say with the marker, Why, owner and linked see', () => {
    const page = render({ scopes: SCOPES, terms: TERMS });
    expect(page).toContain(fileStamp(GENERATOR, SRC));
    expect(page).toContain('| [Kinds](#kinds) | The model \\| decides. |');
    expect(page).not.toContain('## <a id="empty"></a>');
    expect(page).toContain(
      [
        '### <a id="word-issue"></a>issue',
        '',
        '- **Say:** issue — also fine: generate · a\\_b',
        "- **Don't say:** mint · minted <!-- vocab-ok -->",
        '- **Why:** Hands out a new id.',
        '- **Owner:** O',
        '',
      ].join('\n'),
    );
    expect(page).toContain('- **Say:** pattern\n- **Why:** A reusable solution; see `kb:kind`.\n- **Owner:** O · **See:** [kb:kind](#prop-kind)\n');
    expect(page).toContain('One word per idea, and one place to change it: 3 terms, 2 banned phrasings.');
    expect(page.endsWith('how to clear it.\n')).toBe(true);
    expect(scopeTitle('house')).toBe('House');
  });

  it('passes the ban gate it documents (glossary-C8)', async () => {
    tree();
    expectPass(await sb.run(spec));
    sb.write(ALLOWLIST, allowlistJson());
    const r = await sb.run(banGate, [OUT]);
    expectPass(r);
  });

  it('--check names a hand edit STALE with the repair, and changes nothing', async () => {
    tree();
    expectPass(await sb.run(spec));
    sb.write(OUT, `${sb.read(OUT)}hand-typed\n`);
    const before = sb.snapshot();
    const r = await sb.run(spec, ['--check']);
    expectFail(r, `[glossary-fresh] FAIL: ${OUT} is STALE — run: ${FIX}`);
    expect(sb.snapshot()).toEqual(before);
  });

  it('leaves a hand-written page at the output path alone', async () => {
    tree();
    sb.write(OUT, '# Mine\n');
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe(`[glossary-fresh] left ${OUT} alone: it does not carry this generator's stamp`);
    expect(sb.read(OUT)).toBe('# Mine\n');
  });

  it('renders nothing from a missing, unparseable or faulty data file', async () => {
    expectFail(await sb.run(spec), `[glossary-fresh] FAIL ${SRC}: is missing`);
    sb.write(SRC, '{ nope');
    expectFail(await sb.run(spec), `[glossary-fresh] FAIL ${SRC}: is not valid JSON`);
    tree([{ ...TERMS[0], see: ['ghost'] }]);
    expectFail(await sb.run(spec), `[glossary-fresh] FAIL ${SRC}: term kind-pattern: see names "ghost", which is no term`);
    expect(sb.exists(OUT)).toBe(false);
  });

  it('is misuse to pass an unknown flag, and writes nothing', async () => {
    tree();
    expectMisuse(await sb.run(spec, ['--nope']));
    expect(sb.exists(OUT)).toBe(false);
  });
});

describe('the real tree', () => {
  it('finds docs/reference/glossary.md in sync, counting the terms in the data file', async () => {
    const data = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, SRC), 'utf8')) as { terms: unknown[] };
    const r = await capture(spec, ['--check'], REPO_ROOT);
    expectPass(r);
    expect(r.out).toBe(`[glossary-fresh] ${OUT} is in sync with ${SRC} (${String(data.terms.length)} terms)`);
  });
});
