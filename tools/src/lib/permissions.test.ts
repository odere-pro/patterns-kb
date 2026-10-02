/**
 * Reading the commands a harness file names, and the allow list that covers
 * them. Each case is a way a command hides in markdown — a fence, a span, a
 * pipe, a comment, a placeholder — or a way an allow pattern matches.
 */

import { describe, expect, it } from 'vitest';

import {
  allows,
  bashAllows,
  commandOf,
  coverOf,
  namedCommands,
  pieces,
  quoteAfter,
  reachedWrite,
  startsWithWord,
} from './permissions.js';

/** The command text of one piece, or null. */
const cmdOf = (piece: string, anyProgram = false): string | null => commandOf(piece, anyProgram)?.cmd ?? null;
/** Each named command with its first line, in order. */
const lines = (text: string): [string, number][] => [...namedCommands(text)].map(([c, n]) => [c, n.line]);

describe('pieces', () => {
  it('cuts at &&, ||, ;, | and subshell parentheses, and keeps quoted text whole', () => {
    expect(pieces('make all && make check || true; ls | wc -l')).toEqual(['make all', 'make check', 'true', 'ls', 'wc -l']);
    expect(pieces("comm -13 <(sort -u a) b")).toEqual(['comm -13 <', 'sort -u a', 'b']);
    expect(pieces(`jq '.a | .b' f && grep "x;y" g`)).toEqual([`jq '.a | .b' f`, 'grep "x;y" g']);
  });

  it('drops a comment that starts a word, and keeps a # inside a word or quotes', () => {
    expect(pieces('make site-build   # claim-ok: lands later')).toEqual(['make site-build']);
    expect(pieces('# only a comment')).toEqual([]);
    expect(pieces("sed 's/.*#//' f")).toEqual(["sed 's/.*#//' f"]);
    expect(pieces('grep a#b f')).toEqual(['grep a#b f']);
  });
});

describe('commandOf', () => {
  it('reads a known program with its words, one space apart', () => {
    expect(commandOf('git   grep -n  x')).toEqual({ cmd: 'git grep -n x', cut: false, template: false });
    expect(cmdOf('$ make all')).toBe('make all');
  });

  it('reads past leading VAR=value words', () => {
    expect(cmdOf('T=check-json make tools-test')).toBe('make tools-test');
  });

  it('names nothing for prose, a lone program word or shell syntax and state', () => {
    expect(cmdOf('the pages')).toBeNull();
    expect(cmdOf('node')).toBeNull();
    expect(cmdOf('cd tools')).toBeNull();
    expect(cmdOf('export A=1', true)).toBeNull();
    expect(cmdOf('done', true)).toBeNull();
    expect(cmdOf('if [ -f x ]', true)).toBeNull();
    expect(cmdOf('')).toBeNull();
    expect(cmdOf('A=1')).toBeNull();
  });

  it('reads any first word as a program in a shell fence, but never a flag, quote or expansion', () => {
    expect(cmdOf('frobnicate x docs')).toBeNull();
    expect(cmdOf('rg foo docs')).toBe('rg foo docs');
    expect(cmdOf('frobnicate --all x', true)).toBe('frobnicate --all x');
    expect(cmdOf('./run.sh x', true)).toBe('./run.sh x');
    expect(cmdOf('--flag value', true)).toBeNull();
    expect(cmdOf('"$DIR"/x.sh a', true)).toBeNull();
    expect(cmdOf('$HOME/x a', true)).toBeNull();
  });

  it('reads the programs a span or unlabelled fence names beyond the first set', () => {
    for (const c of ['python tools/x.py', 'tsx tools/src/x.ts', 'perl -pi -e s/a/b/ f', 'tee docs/x.md', 'echo hi > f', 'diff a b', 'cut -d, -f1 x.csv']) {
      expect(cmdOf(c), c).toBe(c);
    }
  });

  it('cuts at the first placeholder word, and keeps a lone program word left before it', () => {
    expect(commandOf('node scripts/kb.mjs get <id> --level basic')).toEqual({ cmd: 'node scripts/kb.mjs get', cut: true, template: false });
    expect(commandOf('rm <file>')).toEqual({ cmd: 'rm', cut: true, template: false });
    expect(commandOf('grep … f')).toEqual({ cmd: 'grep', cut: true, template: false });
    expect(commandOf('grep ... f')).toEqual({ cmd: 'grep', cut: true, template: false });
    expect(cmdOf('<cmd> x')).toBeNull();
  });

  it('keeps the start of a word a placeholder sits inside, as a path template', () => {
    expect(commandOf('node scripts/<name>.mjs')).toEqual({ cmd: 'node scripts/', cut: true, template: true });
    expect(commandOf('make gate G=<stem>')).toEqual({ cmd: 'make gate G=', cut: true, template: true });
  });

  it('reads a bare < or > as a redirect, not a placeholder', () => {
    expect(commandOf('echo hi > out.txt')).toEqual({ cmd: 'echo hi > out.txt', cut: false, template: false });
    expect(cmdOf('comm -13 < a')).toBe('comm -13 < a');
  });
});

describe('namedCommands', () => {
  it('reads shell fences and code spans, each command at the line of its first mention', () => {
    const text = [
      'Run `make all && make check` first.', // 1
      '```bash', // 2
      '# a comment line', // 3
      'make all', // 4
      'jq .a f | sort -u', // 5
      '```', // 6
      'Then `jq .a f` again.', // 7
    ].join('\n');
    expect(lines(text)).toEqual([
      ['make all', 1],
      ['make check', 1],
      ['jq .a f', 5],
      ['sort -u', 5],
    ]);
  });

  it('skips a fence of another language, and a code span inside any fence', () => {
    const text = ['```text', 'make all', '`sed -i x`', '```', '~~~js', 'node -e 1', '~~~', '```json', 'rm -rf x', '```'].join('\n');
    expect(namedCommands(text).size).toBe(0);
  });

  it('reads an unlabelled fence for known programs only, and a zsh fence as shell', () => {
    const bare = ['```', 'docs/', '  site/  tree line', 'git push origin main', 'frobnicate x y', '```'].join('\n');
    expect(lines(bare)).toEqual([['git push origin main', 4]]);
    expect(lines(['```zsh', 'frobnicate x y', '```'].join('\n'))).toEqual([['frobnicate x y', 2]]);
  });

  it('closes a fence only on its own marker, as long or longer', () => {
    const text = ['````sh', '```', 'make a', '````', 'make b'].join('\n');
    expect([...namedCommands(text).keys()]).toEqual(['make a']);
    expect([...namedCommands(['```console', '$ make x', '```'].join('\n')).keys()]).toEqual(['make x']);
    expect([...namedCommands(['```shell', 'make y', '~~~', '```'].join('\n')).keys()]).toEqual(['make y']);
  });

  it('reads no command in a heredoc body, a quote left open, or a line a backslash runs on into', () => {
    const text = [
      '```bash',
      "jq . <<'EOF'", // 2
      'rm -rf data-line',
      'EOF',
      "node --check x.mjs && node -e '", // 5
      'rm -rf in-script',
      "' done-quote",
      'make all \\', // 8
      '  rm -rf continued',
      'wc -l f', // 10
      '```',
    ].join('\n');
    expect(lines(text)).toEqual([
      ["jq . <<'EOF'", 2],
      ['node --check x.mjs', 5],
      ["node -e '", 5],
      ['make all', 8],
      ['wc -l f', 10],
    ]);
  });

  it('opens no quote on an unlabelled-fence line that names no program', () => {
    const text = ['```', "it's a tree", 'git push origin main', '```'].join('\n');
    expect(lines(text)).toEqual([['git push origin main', 3]]);
  });

  it('marks a command cut if any mention is cut', () => {
    const n = namedCommands('Run `rm x` or `rm <file>`.');
    expect(n.get('rm x')).toEqual({ line: 1, cut: false, template: false });
    expect(n.get('rm')).toEqual({ line: 1, cut: true, template: false });
    const both = namedCommands('`make all` then `make all <x>`');
    expect(both.get('make all')?.cut).toBe(true);
  });
});

describe('quoteAfter', () => {
  it('carries a quote across lines, and ignores one in a comment', () => {
    expect(quoteAfter("a 'b", null)).toBe("'");
    expect(quoteAfter("c' d", "'")).toBeNull();
    expect(quoteAfter("x # don't", null)).toBeNull();
    expect(quoteAfter('"a" \'b\'', null)).toBeNull();
  });
});

describe('reachedWrite', () => {
  it('finds the write an entry starts with, or one its wildcard reaches', () => {
    const writes = ['rm', 'git push', 'node -e'];
    expect(reachedWrite('rm -rf build', writes)).toBe('rm');
    expect(reachedWrite('git push:*', writes)).toBe('git push');
    expect(reachedWrite('git:*', writes)).toBe('git push');
    expect(reachedWrite('node:*', writes)).toBe('node -e');
    expect(reachedWrite('git', writes)).toBeNull();
    expect(reachedWrite('git status:*', writes)).toBeNull();
    expect(reachedWrite('node --check:*', writes)).toBeNull();
    expect(reachedWrite('rmdir:*', writes)).toBeNull();
  });
});

describe('bashAllows', () => {
  it('keeps the Bash patterns of permissions.allow, parentheses stripped', () => {
    const settings = { permissions: { allow: ['Bash(make:*)', 'Read(docs/**)', 3, 'Bash(bash tests/run.sh)'] } };
    expect(bashAllows(settings)).toEqual(['make:*', 'bash tests/run.sh']);
  });

  it('reads none from settings with no allow list', () => {
    expect(bashAllows(null)).toEqual([]);
    expect(bashAllows({})).toEqual([]);
    expect(bashAllows({ permissions: { allow: 'Bash(make:*)' } })).toEqual([]);
  });
});

describe('allows, startsWithWord and coverOf', () => {
  it('matches x:* as the word x, x followed by a space, or a path under x', () => {
    expect(allows('make:*', 'make')).toBe(true);
    expect(allows('make:*', 'make all')).toBe(true);
    expect(allows('make:*', 'makeover')).toBe(false);
    expect(allows('mkdir -p tmp/designs:*', 'mkdir -p tmp/designs/x')).toBe(true);
    expect(startsWithWord('git grep -n', 'git grep')).toBe(true);
    expect(startsWithWord('git grepx', 'git grep')).toBe(false);
  });

  it('matches an exact pattern only exactly', () => {
    expect(allows('bash tests/run.sh', 'bash tests/run.sh')).toBe(true);
    expect(allows('bash tests/run.sh', 'bash tests/run.sh hooks')).toBe(false);
  });

  it('never covers a command cut at a placeholder with an exact pattern', () => {
    const cut = { cut: true, template: false };
    expect(allows('bash tests/run.sh', 'bash tests/run.sh', cut)).toBe(false);
    expect(allows('bash tests/run.sh:*', 'bash tests/run.sh', cut)).toBe(true);
    expect(coverOf('bash tests/run.sh', ['bash tests/run.sh'], [], cut)).toBeNull();
  });

  it('covers a path template when a pattern is one of its family', () => {
    const t = { cut: true, template: true };
    expect(allows('node scripts/kb.mjs:*', 'node scripts/', t)).toBe(true);
    expect(allows('node scripts/check-links.mjs', 'node scripts/', t)).toBe(true);
    expect(allows('make:*', 'make gate G=', t)).toBe(true);
    expect(allows('node .claude/skills/x.mjs:*', 'node scripts/', t)).toBe(false);
  });

  it('names the allow entry that covers a command, else the kept prefix, else null', () => {
    expect(coverOf('make all', ['make:*'], ['make'])).toBe('Bash(make:*)');
    expect(coverOf('sed -i x f', ['make:*'], ['sed'])).toBe('sed');
    expect(coverOf('rm -rf x', ['make:*'], ['sed'])).toBeNull();
  });
});
