/**
 * The cap gate over `docs/inbox.md`. What it defends is an exit rule: a page
 * with a way in and no way out grows without a single deletion. Every case is
 * one of the ways that happens, and the last block runs the gate on the real
 * page, because a gate with full coverage and no contact with the file it
 * polices can match nothing there and stay green.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { inboxEntry, inboxPage } from '../lib/fixtures.js';
import { capture, expectFail, expectMisuse, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from '../lib/sandbox.js';
import { CAP, CONTRACT, FILE, MAX_LINES, scan, spec } from './check-inbox.js';

const HEADER = inboxPage();
/** Lines in HEADER, so a test can name the line a body line lands on. */
const HEADER_LINES = HEADER.split('\n').length - 1;
const entry = inboxEntry;

/** An entry of `lines` non-blank lines. */
const long = (lines: number): string =>
  `- **A trap that would not stop being explained.** Line 1.\n${Array.from({ length: lines - 1 }, (_, i) => `  Line ${i + 2}.\n`).join('')}\n`;

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

const write = (body: string): void => {
  sb.write(FILE, HEADER + body);
};

/** The finding lines a run printed. */
const findings = (err: string): string[] => err.split('\n').filter((l) => l.startsWith('[inbox-cap] FAIL'));

describe('trap-inbox-O2', () => {
  it('21 two-line entries, the fifth of 9 lines, then a plain bullet: three findings, stdout empty', async () => {
    const body = Array.from({ length: 21 }, (_, i) => (i === 4 ? long(9) : entry(i + 1))).join('') + '- a plain bullet\n';
    write(body);
    const fifth = HEADER_LINES + 1 + 4 * 3;
    const plain = (HEADER + body).split('\n').indexOf('- a plain bullet') + 1;

    const r = await sb.run(spec);
    expectFail(r);
    expect(r.out).toBe('');
    expect(findings(r.err)).toEqual([
      `[inbox-cap] FAIL ${FILE}:${plain}: a top-level bullet that does not open with a bold phrase — an entry states its trap first, in bold`,
      `[inbox-cap] FAIL ${FILE}: 21 entries, cap 20 — retire one before adding one, by the ladder under "When an entry leaves"`,
      `[inbox-cap] FAIL ${FILE}:${fifth}: entry is 9 lines, limit 8 — an entry this long is a fact that wants a home`,
    ]);
  });
});

describe('occupancy', () => {
  it('passes a page with the heading and no entries, reporting 0 of 20', async () => {
    write('None open.\n');
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe(`[inbox-cap] 0 of ${CAP} entries, the longest 0 lines`);
  });

  it('reports three entries, the longest 5 lines, as 3 of 20, longest 5', async () => {
    write(entry(1) + long(5) + entry(3));
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[inbox-cap] 3 of 20 entries, the longest 5 lines');
  });

  it('passes at exactly the cap', async () => {
    write(Array.from({ length: CAP }, (_, i) => entry(i + 1)).join(''));
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain(`${CAP} of ${CAP} entries`);
  });

  it('fails one over the cap, naming the count, the cap and the section', async () => {
    write(Array.from({ length: CAP + 1 }, (_, i) => entry(i + 1)).join(''));
    const r = await sb.run(spec);
    expectFail(r, `${CAP + 1} entries, cap ${CAP}`);
    expect(r.err).toContain('When an entry leaves');
  });
});

describe('entry length', () => {
  it('passes an entry of exactly 8 lines', async () => {
    write(long(MAX_LINES));
    expectPass(await sb.run(spec));
  });

  it('fails an entry of 9 lines at its bold phrase', async () => {
    write(entry(1) + long(MAX_LINES + 1));
    const r = await sb.run(spec);
    expectFail(r, `${FILE}:${HEADER_LINES + 4}: entry is 9 lines, limit 8`);
  });

  it('is not dodged by a blank line in the middle', async () => {
    write('- **Padded.** One.\n  Two.\n  Three.\n  Four.\n\n  Five.\n  Six.\n  Seven.\n  Eight.\n  Nine.\n');
    expectFail(await sb.run(spec), 'entry is 9 lines');
  });

  it('counts fenced lines toward the entry', async () => {
    // The bold line, the two fence lines and six inside: nine lines, of which
    // only the bold one is prose.
    write('- **A fix that is a command.** Run it:\n\n  ```bash\n  one\n  two\n  three\n  four\n  five\n  six\n  ```\n');
    expectFail(await sb.run(spec), 'entry is 9 lines');
  });
});

describe('shape', () => {
  it('fails every top-level bullet with no bold phrase, each at its line', async () => {
    write(`${entry(1)}- loose one\n* loose two\n`);
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toHaveLength(2);
    expect(r.err).toContain(`${FILE}:${HEADER_LINES + 4}:`);
    expect(r.err).toContain(`${FILE}:${HEADER_LINES + 5}:`);
  });

  it('leaves an indented bullet to the entry it belongs to', async () => {
    write('- **Two sub-points.** Then:\n  - the first\n  - the second\n');
    expectPass(await sb.run(spec));
  });

  it('counts a top-level bullet indented one to three spaces, as CommonMark does', async () => {
    write(`## More traps\n\n${Array.from({ length: CAP + 1 }, (_, i) => ` - **Trap ${i + 1}.** Do the other thing.\n`).join('')}  - a plain bullet\n`);
    const r = await sb.run(spec);
    expectFail(r, `${CAP + 1} entries, cap ${CAP}`);
    expect(r.err).toContain(`${FILE}:${HEADER_LINES + 3 + CAP + 1}: a top-level bullet that does not open with a bold phrase`);
    expect(scan(' - **One.** a\n    - its sub-point\n  - **Two.** b\n').entries.map((e) => e.line)).toEqual([1, 3]);
  });

  it('ends an entry at an indented heading only when it sits outside the entry’s text', () => {
    expect(scan('- **One.** a\n  ## inside the item\n  b\n').entries).toEqual([{ line: 1, length: 3 }]);
    expect(scan('- **One.** a\n ## outside\nprose\n').entries).toEqual([{ line: 1, length: 1 }]);
    expect(scan('  ## A heading\n - **One.** a\n').entries).toEqual([{ line: 2, length: 1 }]);
  });

  it('gives an item with no text on its marker line the width of the marker and one space', () => {
    expect(scan('- \n  - a sub-point\n').loose).toEqual([1]);
  });

  it('ends an item at text indented less than its own after a blank line, so the next bullet is top-level again', () => {
    const s = scan('- **One.** a\n\nprose between\n\n  - loose\n');
    expect(s.entries).toEqual([{ line: 1, length: 3 }]);
    expect(s.loose).toEqual([5]);
  });

  it('fails a numbered item outside the exit-ladder section, bold or not, at its line', async () => {
    write('1. **A trap as a numbered item.** Escapes the cap.\n2) another\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([
      `[inbox-cap] FAIL ${FILE}:${HEADER_LINES + 1}: a numbered item outside "When an entry leaves" — an entry is a bullet, and only the exit ladder is numbered`,
      `[inbox-cap] FAIL ${FILE}:${HEADER_LINES + 2}: a numbered item outside "When an entry leaves" — an entry is a bullet, and only the exit ladder is numbered`,
    ]);
  });

  it('reads neither a fenced dash line nor a fenced hash line as structure', async () => {
    write('Prose before any entry.\n\n```bash\n# not a heading\n- not a bullet\n```\n');
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('0 of 20');
  });

  it('passes traps written as subheadings at zero entries — only the summary line reveals them', async () => {
    write('### A trap as a heading\n\nIts explanation.\n\n### Another\n\nMore.\n');
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('0 of 20');
  });
});

describe('the contract', () => {
  it('fails once when the "When an entry leaves" line is gone', async () => {
    sb.write(FILE, (HEADER + entry(1)).replace(`${CONTRACT}\n`, ''));
    const r = await sb.run(spec);
    expectFail(r, "the page's contract");
    expect(findings(r.err)).toHaveLength(1);
  });

  it('does not take a longer heading for the contract', async () => {
    sb.write(FILE, (HEADER + entry(1)).replace(`${CONTRACT}\n`, `${CONTRACT} early\n`));
    expectFail(await sb.run(spec), "the page's contract");
  });
});

describe('misuse and a missing page', () => {
  it('takes no argument, flag or path', async () => {
    write(entry(1));
    const before = sb.snapshot();
    expectMisuse(await sb.run(spec, ['--nope']));
    expectMisuse(await sb.run(spec, ['docs/inbox.md']));
    expectMisuse(await sb.run(spec, ['--fix']));
    expect(sb.snapshot()).toEqual(before);
  });

  it('names the missing page as a finding rather than passing vacuously', async () => {
    const r = await sb.run(spec);
    expectFail(r, `[inbox-cap] FAIL ${FILE}: is missing`);
  });
});

describe('scan', () => {
  it('ends an entry at a heading, so prose under the next heading is not counted', () => {
    const s = scan('- **One.** a\n  b\n## Next\n\nplain prose\nmore prose\n');
    expect(s.entries).toEqual([{ line: 1, length: 2 }]);
    expect(s.loose).toEqual([]);
  });
});

describe('the real docs/inbox.md', () => {
  /**
   * A deliberately dumber count: every line under Open traps that opens,
   * after up to three spaces, with a bullet or number and a bold phrase.
   */
  const openTraps = (text: string): string[] => {
    const lines = text.split('\n');
    const at = lines.indexOf('## Open traps');
    expect(at).toBeGreaterThanOrEqual(0);
    const rest = lines.slice(at + 1);
    const end = rest.findIndex((l) => l.startsWith('## '));
    return (end === -1 ? rest : rest.slice(0, end)).filter((l) => /^ {0,3}(?:[-*+]|\d+[.)])\s+\*\*/.test(l));
  };

  it('counts the same entries a plain line match finds, and passes where it really runs', async () => {
    const text = fs.readFileSync(path.join(REPO_ROOT, FILE), 'utf8');
    const counted = openTraps(text).length;
    expect(scan(text).entries).toHaveLength(counted);
    const r = await capture(spec, [], REPO_ROOT);
    expect(r.err).toBe('');
    expectPass(r);
    expect(r.out).toContain(`${counted} of ${CAP} entries`);
  });

  it('states the six tiers once, in the "When an entry leaves" section', () => {
    const text = fs.readFileSync(path.join(REPO_ROOT, FILE), 'utf8');
    const lines = text.split('\n');
    const at = lines.indexOf(CONTRACT);
    const rest = lines.slice(at + 1);
    const section = rest.slice(0, rest.findIndex((l) => l.startsWith('## ')));
    const tiers = section.filter((l) => /^\d+\. \*\*/.test(l)).map((l) => Number(/^(\d+)/.exec(l)?.[1]));
    expect(tiers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(lines.filter((l) => /^\d+\. \*\*/.test(l))).toHaveLength(6);
  });
});
