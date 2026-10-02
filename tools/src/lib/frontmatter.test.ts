/**
 * The frontmatter door has two halves that must agree byte for byte: the one
 * parser (scripts/fm-json.sh over scripts/lib-frontmatter.sh) and the one
 * printer. Every assertion below runs the real shell script, so a regression in
 * either half — or a TypeScript shortcut around the script — turns this red.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { run } from './exec.js';
import {
  FM_JSON,
  frontmatter,
  frontmatterMany,
  listOf,
  SOLVES_MAX_WORDS,
  solvesWords,
  printFrontmatter,
  yamlInlineList,
  yamlScalar,
  type FmEntry,
} from './frontmatter.js';

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-fm-'));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(name: string, text: string): string {
  fs.writeFileSync(path.join(dir, name), text);
  return name;
}

const PAGE = [
  '---',
  'title: Circuit Breaker',
  'description: "Stops calling a service that\'s already failing, fast: on purpose"',
  'level: advanced',
  'tags: [resilience, isolation, latency]',
  'aliases: []',
  'solves: ["my thread pool is exhausted, and every request hangs", "one call: then all of them", bare item]',
  'status: stable',
  'title: a second title is ignored',
  '---',
  '',
  '# Circuit Breaker',
  '',
  'status: not a field, it is body text',
  '',
].join('\n');

describe('frontmatter — one file', () => {
  it('prints declared fields in file order, one layer of quotes stripped', () => {
    const f = write('page.md', PAGE);
    expect(frontmatter(dir, f)).toEqual({
      title: 'Circuit Breaker',
      description: "Stops calling a service that's already failing, fast: on purpose",
      level: 'advanced',
      tags: '[resilience, isolation, latency]',
      aliases: '[]',
      solves: '["my thread pool is exhausted, and every request hangs", "one call: then all of them", bare item]',
      status: 'stable',
    });
    expect(Object.keys(frontmatter(dir, f))).toEqual(['title', 'description', 'level', 'tags', 'aliases', 'solves', 'status']);
  });

  it('splits inline lists in the shell, commas and colons safe inside quotes', () => {
    const f = write('page.md', PAGE);
    const fm = frontmatter(dir, f, { lists: true });
    expect(fm['solves']).toEqual(['my thread pool is exhausted, and every request hangs', 'one call: then all of them', 'bare item']);
    expect(fm['tags']).toEqual(['resilience', 'isolation', 'latency']);
    expect(fm['aliases']).toEqual([]);
    expect(fm['title']).toBe('Circuit Breaker');
    expect(listOf(fm['tags'])).toEqual(['resilience', 'isolation', 'latency']);
    expect(listOf(fm['title'])).toBeNull();
    expect(listOf(undefined)).toBeNull();
  });

  it('keeps quotes with raw, and returns only the fields asked for', () => {
    const f = write('page.md', PAGE);
    expect(frontmatter(dir, f, { raw: true, fields: ['description', 'missing'] })).toEqual({
      description: '"Stops calling a service that\'s already failing, fast: on purpose"',
    });
    expect(frontmatter(dir, f, { lists: true, fields: ['tags'] })).toEqual({ tags: ['resilience', 'isolation', 'latency'] });
  });

  it('reads a block list as the empty string, which listOf calls not-a-list', () => {
    const f = write('block.md', '---\ntags:\n  - a\n  - b\ntitle: T\n---\n');
    const fm = frontmatter(dir, f, { lists: true });
    expect(fm).toEqual({ tags: '', title: 'T' });
    expect(listOf(fm['tags'])).toBeNull();
  });

  it('honours the two double-quote escapes and the single-quote doubling', () => {
    const f = write('esc.md', [
      '---',
      'a: "He said \\"hi\\" and left \\\\ here"',
      "b: 'it''s'",
      'c: "unterminated',
      'd: "x" y "z"',
      'e:',
      'f: ["say \\"no\\", twice", \'o\'\'clock\', "", ]',
      'g: ["open, b]',
      '---',
    ].join('\n'));
    expect(frontmatter(dir, f)).toEqual({
      a: 'He said "hi" and left \\ here',
      b: "it's",
      c: '"unterminated',
      d: '"x" y "z"',
      e: '',
      f: '["say \\"no\\", twice", \'o\'\'clock\', "", ]',
      g: '["open, b]',
    });
    const lists = frontmatter(dir, f, { lists: true });
    expect(lists['f']).toEqual(['say "no", twice', "o'clock", '']);
    expect(lists['g']).toBe('["open, b]');
  });

  it('reads CRLF like LF, and a file with no block as {}', () => {
    const f = write('crlf.md', '---\r\ntitle: "T, crlf"\r\ntags: [a, b]\r\n---\r\nbody\r\n');
    expect(frontmatter(dir, f, { lists: true })).toEqual({ title: 'T, crlf', tags: ['a', 'b'] });
    expect(frontmatter(dir, write('none.md', '# no block\n\n---\ntitle: x\n---\n'))).toEqual({});
    expect(frontmatter(dir, write('empty.md', ''))).toEqual({});
  });

  it('refuses misuse with exit 2 and nothing on stdout', () => {
    write('page.md', PAGE);
    for (const args of [['--bogus', 'page.md'], [], ['missing.md'], ['page.md', 'bad field'], ['--raw', '--lists', 'page.md']]) {
      const r = run('bash', [FM_JSON, ...args], dir);
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.stdout).toBe('');
    }
    expect(run('bash', [FM_JSON, '--help'], dir).status).toBe(0);
    expect(() => frontmatter(dir, 'missing.md')).toThrow('no such readable file');
    expect(() => frontmatter(dir, 'page.md', { raw: true, lists: true } as never)).toThrow('exclusive');
  });

  it('names the bare exit code when the parser fails without a word on stderr', () => {
    // `set -e -o pipefail` can carry a nonzero status out of the script from a
    // pipeline stage that never wrote to stderr — a crashed `awk` (killed, not
    // erroring in its own words) is the honest way to reach that, not a stub.
    // `run` inherits `process.env` when it is given no `env` of its own, so
    // shadowing `awk` on `PATH` for the one call reaches the same spawn this
    // module makes, no code path bypassed.
    const f = write('page.md', PAGE);
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-fm-bin-'));
    fs.writeFileSync(path.join(bin, 'awk'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const savedPath = process.env['PATH'];
    process.env['PATH'] = `${bin}:${savedPath ?? ''}`;
    try {
      expect(() => frontmatter(dir, f)).toThrow(/^fm-json\.sh .*: exit 1$/);
    } finally {
      process.env['PATH'] = savedPath;
      fs.rmSync(bin, { recursive: true, force: true });
    }
  });
});

describe('frontmatterMany — one spawn for a batch', () => {
  it('keys every path as given, in order, {} for a file with no block', () => {
    const a = write('a.md', PAGE);
    const b = write('b.md', 'no block\n');
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    const c = write('sub/c.md', '---\ntitle: C\nsolves: ["x, y: z"]\n---\n');
    const got = frontmatterMany(dir, [c, a, b], { lists: true });
    expect([...got.keys()]).toEqual([c, a, b]);
    expect(got.get(b)).toEqual({});
    expect(got.get(c)).toEqual({ title: 'C', solves: ['x, y: z'] });
    expect(got.get(a)?.['tags']).toEqual(['resilience', 'isolation', 'latency']);
    expect(frontmatterMany(dir, [c]).get(c)).toEqual({ title: 'C', solves: '["x, y: z"]' });
    expect(frontmatterMany(dir, []).size).toBe(0);
  });

  it('answers the same as the one-file call for every file', () => {
    const files = ['a.md', 'crlf.md', 'esc.md', 'block.md'].filter((f) => fs.existsSync(path.join(dir, f)));
    const many = frontmatterMany(dir, files, { lists: true });
    for (const f of files) expect(many.get(f)).toEqual(frontmatter(dir, f, { lists: true }));
  });

  it('refuses a batch holding an unreadable path', () => {
    write('a.md', PAGE);
    expect(() => frontmatterMany(dir, ['a.md', 'nope.md'])).toThrow('no such readable file: nope.md');
  });
});

describe('the printer', () => {
  it.each([
    ['Circuit Breaker', 'Circuit Breaker'],
    ["Stops calling a service that's already failing", "Stops calling a service that's already failing"],
    ['one, two', '"one, two"'],
    ['key: value', '"key: value"'],
    ['has # hash', '"has # hash"'],
    ['He said "hi"', '"He said \\"hi\\""'],
    ['back\\slash', '"back\\\\slash"'],
    ['- leading dash', '"- leading dash"'],
    ["'quoted'", '"\'quoted\'"'],
    ['true', '"true"'],
    ['No', '"No"'],
    ['1984', '"1984"'],
    ['', '""'],
    [' padded', '" padded"'],
    ['Persona Identification & Sanction Check (V2)', 'Persona Identification & Sanction Check (V2)'],
  ])('writes %j as %s', (value, printed) => {
    expect(yamlScalar(value)).toBe(printed);
  });

  it('refuses a multi-line value', () => {
    expect(() => yamlScalar('a\nb')).toThrow('one line');
    expect(() => printFrontmatter([['bad key', 'x']])).toThrow('not a frontmatter key');
  });

  it('prints inline lists and a whole block', () => {
    expect(yamlInlineList(['a', 'b, c', 'd: e'])).toBe('[a, "b, c", "d: e"]');
    expect(yamlInlineList([])).toBe('[]');
    const entries: FmEntry[] = [
      ['title', 'Circuit Breaker'],
      ['tags', ['resilience', 'isolation']],
      ['favourite', true],
    ];
    expect(printFrontmatter(entries)).toBe('---\ntitle: Circuit Breaker\ntags: [resilience, isolation]\nfavourite: true\n---\n');
  });

  it('prints only what the parser reads back unchanged', () => {
    const tricky = [
      'Circuit Breaker',
      "Stops calling a service that's already failing — so callers fail fast",
      'a, b',
      'x: y',
      'He said "no", then: \\ left',
      "'single'",
      '[not a list]',
      '{braces}',
      '- dash',
      '# hash',
      'true',
      '0.5',
      '',
      'trailing ',
      'Ünïcödé — “curly” quotes',
    ];
    const entries: FmEntry[] = tricky.map((v, i) => [`k${i}`, v]);
    entries.push(['list', tricky], ['empty', []], ['flag', true]);
    const f = write('round.md', `${printFrontmatter(entries)}\n# Body\n`);
    const back = frontmatter(dir, f, { lists: true });
    tricky.forEach((v, i) => expect(back[`k${i}`], v).toBe(v));
    expect(back['list']).toEqual(tricky);
    expect(back['empty']).toEqual([]);
    expect(back['flag']).toBe('true');
    expect(frontmatter(dir, f)['k1']).toBe(tricky[1]);
  });
});

describe('solvesWords', () => {
  it('counts the words of a phrase, whatever the white space between them', () => {
    expect(solvesWords('  my thread pool\tis   exhausted ')).toBe(5);
    expect(solvesWords('')).toBe(0);
    expect(SOLVES_MAX_WORDS).toBe(20);
  });
});
