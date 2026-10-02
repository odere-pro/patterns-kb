/**
 * The fast diagram gate over `docs/**.md`. It defends one thing: a diagram
 * mermaid cannot parse never reaches the site build unnoticed. The cases run
 * the gate end to end in a sandbox, pin how a fence is found (indented under a
 * list, tildes, an unclosed fence, a fence of another language) and where a
 * finding lands, and the last case runs it over the real tree with a count of
 * its own.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe as group, expect, it } from 'vitest';

import { gitFiles } from '../lib/exec.js';
import { capture, expectFail, expectMisuse, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from '../lib/sandbox.js';
import { describe, fencesOf, NAME, SCOPE, spec } from './check-mermaid.js';

/** The real tree is 390-odd pages: on a loaded machine one run outlasts the suite's default. */
const REAL_TREE_TIMEOUT = 180_000;

const GOOD = '```mermaid caption="A flow."\nflowchart LR\n  a --> b\n```\n';
const BROKEN = '```mermaid\nflowchart LR\n  a -->\n```\n';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

const findings = (err: string): string[] => err.split('\n').filter((l) => l.startsWith(`[${NAME}] FAIL`));

group('fencesOf', () => {
  it('finds a mermaid fence by its info word and skips other languages', () => {
    const text = '# T\n\n```ts\nconst a = 1;\n```\n\n' + GOOD;
    expect(fencesOf(text)).toEqual([{ line: 8, source: 'flowchart LR\n  a --> b' }]);
  });

  it('takes the fence indent off each line of a fence under a list item', () => {
    const text = '- item\n\n  ```mermaid\n  flowchart TB\n    x --> y\n  ```\n';
    expect(fencesOf(text)).toEqual([{ line: 4, source: 'flowchart TB\n  x --> y' }]);
  });

  it('reads tilde fences, a longer closing run, and a fence left open to the end', () => {
    const text = '~~~mermaid\nflowchart LR\n  a --> b\n~~~~\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n';
    expect(fencesOf(text)).toEqual([
      { line: 2, source: 'flowchart LR\n  a --> b' },
      { line: 7, source: 'sequenceDiagram\n  A->>B: hi' },
    ]);
  });

  it('does not take a word that only starts with mermaid, or a fence in the frontmatter', () => {
    expect(fencesOf('```mermaidish\nflowchart LR\n```\n')).toEqual([]);
    expect(fencesOf('---\ntitle: x\n---\n\nno fence\n')).toEqual([]);
  });

  it('reads two fences back to back, the second opening on the line after the first closes', () => {
    const text = '```mermaid\nflowchart LR\n  a --> b\n```\n```mermaid\nflowchart LR\n  c --> d\n```\n';
    expect(fencesOf(text).map((f) => f.line)).toEqual([2, 6]);
  });
});

group('describe', () => {
  it("keeps mermaid's first line and the diagram line it names", () => {
    expect(describe(new Error('Parse error on line 3:\n...a -->\n----^'))).toEqual({ what: 'Parse error on line 3:', at: 3 });
  });

  it('keeps a message with no line, and a thrown value that is no Error', () => {
    expect(describe(new Error('No diagram type detected'))).toEqual({ what: 'No diagram type detected', at: null });
    expect(describe('')).toEqual({ what: 'mermaid gave no message', at: null });
  });
});

group('the gate', () => {
  it('passes a tree whose diagrams all parse, class and state diagrams included', async () => {
    sb.write('docs/a.md', `# A\n\n${GOOD}`);
    sb.write('docs/b/c.md', '# C\n\n```mermaid\nclassDiagram\n  class A\n  A <|-- B\n```\n\n```mermaid\nstateDiagram-v2\n  [*] --> Open\n```\n');
    sb.write('docs/d.md', '# D\n\nNo diagrams.\n');
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe(`[${NAME}] 3 mermaid diagram(s) in 2 of 3 markdown file(s) parse`);
  });

  it('fails a broken diagram at the file line mermaid blames, stdout empty', async () => {
    sb.write('docs/a.md', `# A\n\n${GOOD}\n${BROKEN}`);
    const r = await sb.run(spec);
    expectFail(r);
    expect(r.out).toBe('');
    // The broken fence opens on line 8; mermaid blames its line 3, which is file line 11.
    expect(findings(r.err)).toEqual([`[${NAME}] FAIL docs/a.md:11: diagram does not parse — Parse error on line 3:`]);
  });

  it('fails a class diagram whose labels break the grammar, which DOMPurify reaches first without a window', async () => {
    sb.write('docs/a.md', '```mermaid\nclassDiagram\n  class A {{{ ]\n```\n');
    expectFail(await sb.run(spec), 'docs/a.md:');
  });

  it('fails a fence with no diagram type at its first line', async () => {
    sb.write('docs/a.md', '# A\n\n```mermaid\nnot a diagram\n```\n');
    expectFail(await sb.run(spec), 'docs/a.md:4: diagram does not parse — No diagram type detected');
  });

  it('checks only the files it is handed, and ignores markdown outside docs/ otherwise', async () => {
    sb.write('docs/a.md', BROKEN);
    sb.write('notes/b.md', BROKEN);
    expectFail(await sb.run(spec, ['notes/b.md']), 'notes/b.md:');
    const whole = await sb.run(spec);
    expectFail(whole);
    expect(findings(whole.err)).toHaveLength(1);
  });

  it('is misuse to name a file that is not there, or an unknown flag', async () => {
    expectMisuse(await sb.run(spec, ['docs/missing.md']));
    expectMisuse(await sb.run(spec, ['--nope']));
  });
});

it(
  'holds the real tree, counting its diagrams by a walk of its own',
  async () => {
    const files = gitFiles(REPO_ROOT, SCOPE).filter((f) => fs.existsSync(path.join(REPO_ROOT, f)));
    let fences = 0;
    for (const f of files) {
      fences += (fs.readFileSync(path.join(REPO_ROOT, f), 'utf8').match(/^[ \t]*(?:`{3,}|~{3,})mermaid\b/gm) ?? []).length;
    }
    const r = await capture(spec, [], REPO_ROOT);
    expectPass(r);
    expect(r.out).toMatch(new RegExp(`^\\[${NAME}\\] ${String(fences)} mermaid diagram\\(s\\) in \\d+ of ${String(files.length)} markdown file\\(s\\) parse$`));
  },
  REAL_TREE_TIMEOUT,
);
