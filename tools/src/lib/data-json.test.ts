/**
 * The data-file reader every data gate shares. What it defends is that a
 * broken file is one finding at the line the parser names, and that a line
 * reported for a record is the line the record really starts on — the scan is
 * checked against a pretty-printed file whose lines are known, a compact one,
 * and the real data files, where each record's line is found by a plain text
 * search that knows nothing about JSON.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GateSpec } from './gate.js';
import { dataDate, headDate, jsonLines, needDataObject, pointer, printData, readDataJson, type DataRead } from './data-json.js';
import { expectFail, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from './sandbox.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

/** A gate that only reads one file, so the reader can be run through the contract. */
function reading(rel: string, seen: DataRead[]): GateSpec {
  return {
    name: 'reader',
    usage: 'usage: reader',
    run(ctx) {
      seen.push(readDataJson(ctx, rel));
      return '[reader] read';
    },
  };
}

describe('readDataJson', () => {
  it('returns the value and the text of a file that parses', async () => {
    sb.write('docs/data/x.json', '{ "a": 1 }\n');
    const seen: DataRead[] = [];
    const r = await sb.run(reading('docs/data/x.json', seen));
    expectPass(r);
    expect(seen).toEqual([{ value: { a: 1 }, text: '{ "a": 1 }\n' }]);
  });

  it('answers missing, with no finding, for a file that is not there', async () => {
    const seen: DataRead[] = [];
    const r = await sb.run(reading('docs/data/x.json', seen));
    expectPass(r);
    expect(seen).toEqual(['missing']);
  });

  it('records one finding at the parser’s line for a file that does not parse', async () => {
    sb.write('docs/data/x.json', '{\n  "a": 1,\n  oops\n}\n');
    const seen: DataRead[] = [];
    const r = await sb.run(reading('docs/data/x.json', seen));
    expectFail(r);
    expect(seen).toEqual(['invalid']);
    const lines = r.err.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[reader\] FAIL docs\/data\/x\.json:3: is not valid JSON — /);
  });

  it('keeps the finding on one line when the parser quotes a text with a newline in it', async () => {
    sb.write('docs/data/x.json', 'not json\n');
    const r = await sb.run(reading('docs/data/x.json', []));
    expectFail(r);
    expect(r.err.split('\n')).toEqual([
      `[reader] FAIL docs/data/x.json: is not valid JSON — Unexpected token 'o', "not json " is not valid JSON`,
    ]);
  });
});

describe('pointer', () => {
  it('escapes ~ before / so a route key reads back as one segment', () => {
    expect(pointer()).toBe('');
    expect(pointer('relations', 12)).toBe('/relations/12');
    expect(pointer('notes', '/patterns/a~b.html', 'starting')).toBe('/notes/~1patterns~1a~0b.html/starting');
  });
});

describe('jsonLines', () => {
  it('puts every value of a pretty-printed file on the line it opens', () => {
    const text = [
      '{', //                                   1
      '  "version": 1,', //                     2
      '  "list": [', //                         3
      '    {', //                               4
      '      "a": "x\\"y",', //                 5
      '      "b": [],', //                      6
      '      "c": {}', //                       7
      '    },', //                              8
      '    true,', //                           9
      '    null', //                           10
      '  ],', //                               11
      '  "/odd~key": -1.5e3', //               12
      '}', //                                  13
    ].join('\r\n');
    const lines = jsonLines(text);
    expect(Object.fromEntries(lines)).toEqual({
      '': 1,
      '/version': 2,
      '/list': 3,
      '/list/0': 4,
      '/list/0/a': 5,
      '/list/0/b': 6,
      '/list/0/c': 7,
      '/list/1': 9,
      '/list/2': 10,
      [pointer('/odd~key')]: 12,
    });
  });

  it('reads a compact file, and a scalar on its own, as one line', () => {
    expect(Object.fromEntries(jsonLines('{"a":[1,"\\\\",{"b":2}],"c":"d"}'))).toEqual({
      '': 1,
      '/a': 1,
      '/a/0': 1,
      '/a/1': 1,
      '/a/2': 1,
      '/a/2/b': 1,
      '/c': 1,
    });
    expect(Object.fromEntries(jsonLines('\n\t42'))).toEqual({ '': 2 });
  });

  it('agrees with a plain text search on the real relations and learning-path files', () => {
    const rel = fs.readFileSync(path.join(REPO_ROOT, 'docs/data/relations.json'), 'utf8');
    const lines = jsonLines(rel);
    const records = (JSON.parse(rel) as { relations: unknown[] }).relations;
    const text = rel.split('\n');
    // A record opens on the line before its "a" key, whatever the indentation.
    const opens = text.flatMap((l, i) => (/^\s*"a": /.test(l) ? [i] : []));
    expect(opens).toHaveLength(records.length);
    records.forEach((_, n) => expect(lines.get(pointer('relations', n))).toBe(opens[n]));

    const lp = fs.readFileSync(path.join(REPO_ROOT, 'docs/data/learning-paths.json'), 'utf8');
    const lpLines = jsonLines(lp);
    const profiles = (JSON.parse(lp) as { profiles: { id: string; stages: string[] }[] }).profiles;
    const lpText = lp.split('\n');
    for (const [n, p] of profiles.entries()) {
      const at = lpLines.get(pointer('profiles', n, 'id')) as number;
      expect(lpText[at - 1]).toContain(JSON.stringify(p.id));
      for (const [k, stage] of p.stages.entries()) {
        expect(lpText[(lpLines.get(pointer('profiles', n, 'stages', k)) as number) - 1]).toContain(JSON.stringify(stage));
      }
    }
  });
});

describe('needDataObject', () => {
  function needing(rel: string, seen: unknown[]): GateSpec {
    return {
      name: 'needer',
      usage: 'usage: needer',
      run(ctx) {
        seen.push(needDataObject(ctx, rel, 'the page is built from it'));
        return '[needer] read';
      },
    };
  }

  it('returns an object, and names a file that is missing, not JSON or not an object', async () => {
    const seen: unknown[] = [];
    sb.write('docs/data/ok.json', '{ "a": 1 }\n');
    expectPass(await sb.run(needing('docs/data/ok.json', seen)));
    let r = await sb.run(needing('docs/data/gone.json', seen));
    expectFail(r, '[needer] FAIL docs/data/gone.json: is missing — the page is built from it');
    sb.write('docs/data/list.json', '[1]\n');
    r = await sb.run(needing('docs/data/list.json', seen));
    expect(r.err).toBe('[needer] FAIL docs/data/list.json: is not a JSON object');
    sb.write('docs/data/bad.json', '{\n');
    r = await sb.run(needing('docs/data/bad.json', seen));
    expectFail(r, '[needer] FAIL docs/data/bad.json');
    expect(seen).toEqual([{ a: 1 }, null, null, null]);
  });
});

describe('printData', () => {
  it('indents by two, keeps a list of scalars on one line, and reads back unchanged', () => {
    const value = { version: 1, list: ['a', 'b'], none: [], empty: {}, rows: [{ id: 'x', tags: [], n: null }, 3] };
    const text = printData(value);
    expect(text).toBe(
      [
        '{',
        '  "version": 1,',
        '  "list": ["a", "b"],',
        '  "none": [],',
        '  "empty": {},',
        '  "rows": [',
        '    {',
        '      "id": "x",',
        '      "tags": [],',
        '      "n": null',
        '    },',
        '    3',
        '  ]',
        '}',
        '',
      ].join('\n'),
    );
    expect(JSON.parse(text)).toEqual(value);
    expect(printData('x')).toBe('"x"\n');
  });
});

describe('headDate and dataDate', () => {
  const print = (updated: string): string => printData({ version: 1, updated, note: 'n', records: ['a'] });
  const head = (): string => sb.git('log', '-1', '--format=%cs', 'HEAD').stdout.trim();

  it('headDate reads the committer date of HEAD, and answers null before the first commit', () => {
    expect(headDate(sb.dir)).toBeNull();
    sb.write('a.txt', 'a\n');
    sb.commit('first');
    expect(headDate(sb.dir)).toBe(head());
    expect(head()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('dataDate keeps the date on disk while every other byte matches, and otherwise takes HEAD’s', () => {
    // No commit yet: a file that would change has nothing to be dated by.
    expect(dataDate(sb.dir, 'd.json', print)).toBeNull();
    sb.write('a.txt', 'a\n');
    sb.commit('first');
    expect(dataDate(sb.dir, 'd.json', print)).toBe(head());

    sb.write('d.json', print('2020-01-02'));
    expect(dataDate(sb.dir, 'd.json', print)).toBe('2020-01-02');

    sb.write('d.json', print('2020-01-02').replace('"a"', '"b"'));
    expect(dataDate(sb.dir, 'd.json', print)).toBe(head());

    sb.write('d.json', '{"updated": "2020-01-02"}\n');
    expect(dataDate(sb.dir, 'd.json', print)).toBe(head());
  });
});
