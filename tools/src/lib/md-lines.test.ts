/**
 * The one code reading and the one H1 rule every page gate shares
 * (page-shape-C2, C3; frontmatter-C9, C10), and the one blanking of what a
 * link reader skips (link-integrity-C1).
 */

import { describe, expect, it } from 'vitest';

import { blankFrontmatter, blankInline, firstH1, hasFrontmatter, indentOf, keyLine, linkableText, mdLines, outsideCode } from './md-lines.js';

const zones = (text: string): string => mdLines(text).map((l) => l.zone[0]).join('');

describe('mdLines', () => {
  it('places the block, the body and a fence', () => {
    const text = ['---', 'title: A', '---', '', '# A', '', '```bash', '# not a heading', '```', 'after'].join('\n');
    expect(zones(text)).toBe('fffbbbfffb');
    expect(mdLines(text)[4]).toEqual({ no: 5, text: '# A', zone: 'body' });
  });

  it('reads no block when line 1 is not a delimiter, and runs an unclosed block to the end', () => {
    expect(zones('# A\n---\nx\n')).toBe('bbb');
    expect(zones('---\ntitle: A\n# A\n')).toBe('fff');
  });

  it('closes a fence only on a run of its own character at least as long', () => {
    const text = ['````markdown', '```bash', '#### inside', '```', '````', '#### outside'].join('\n');
    expect(zones(text)).toBe('fffffb');
    expect(zones(['~~~', '```', '~~', '~~~~', 'x'].join('\n'))).toBe('ffffb');
  });

  it('does not close a fence on a run followed by text', () => {
    expect(zones(['```', '``` not a close', '```', 'x'].join('\n'))).toBe('fffb');
  });

  it('reads an indented fence, as a list item holds one, and runs an unclosed fence to the end', () => {
    expect(zones(['- item', '  ```sql', '  # comment', '  ```', 'x'].join('\n'))).toBe('bfffb');
    expect(zones(['```', '# a', '# b'].join('\n'))).toBe('fff');
  });

  it('reads a backtick run with a backtick in its info string as no fence', () => {
    expect(zones(['``` a ` b', '# heading'].join('\n'))).toBe('bb');
    expect(zones(['~~~ a ` b', '# inside'].join('\n'))).toBe('ff');
  });

  it('reads a four-space-indented backtick run outside a list as indented code, which opens no fence', () => {
    expect(zones(['Para.', '', '    ```', '', '#### real h4'].join('\n'))).toBe('bbcbb');
    expect(zones(['# T', '    ```', 'x'].join('\n'))).toBe('bcb');
    expect(zones(['```', 'x', '```', '    code', 'y'].join('\n'))).toBe('fffcb');
    expect(zones(['\t```', '    more', '', '    after a gap'].join('\n'))).toBe('ccbc');
  });

  it('reads a line indented four spaces under a paragraph as that paragraph, never as code', () => {
    expect(zones(['Para', '    ```', '#### h'].join('\n'))).toBe('bbb');
  });

  it('reads a fence at any depth inside a list item, and indented lines there as the item', () => {
    expect(zones(['- a', '', '    ```sql', '    # x', '    ```', '', '    more of a', 'b'].join('\n'))).toBe('bbfffbbb');
    expect(zones(['1. a', '   - b', '', '        nested deep'].join('\n'))).toBe('bbbb');
  });

  it('ends a list at an unindented line after a blank, or at a heading, and reads code after it again', () => {
    expect(zones(['- a', '', 'Para.', '', '    code'].join('\n'))).toBe('bbbbc');
    expect(zones(['- a', '## H', '    code'].join('\n'))).toBe('bbc');
    expect(zones(['- a', 'lazy', '', '    still a'].join('\n'))).toBe('bbbb');
    expect(zones(['- a', '```', 'x', '```', '', '    code'].join('\n'))).toBe('bfffbc');
  });

  it('reads CRLF as LF', () => {
    const text = '---\r\ntitle: A\r\n---\r\n# A\r\n';
    expect(zones(text)).toBe('fffb');
    expect(mdLines(text)[3]?.text).toBe('# A');
  });
});

describe('firstH1', () => {
  it('skips the block and a fenced # line, and trims the title', () => {
    const text = ['---', '# a YAML comment', '---', '```bash', '# a shell comment', '```', '   #   The title  ', '# Second'].join('\n');
    expect(firstH1(text)).toEqual({ no: 7, title: 'The title' });
  });

  it('reads no H1 in a four-space-indented line, an H2, or a page without one', () => {
    expect(firstH1('    # code\n## Two\n')).toBeNull();
    expect(firstH1('')).toBeNull();
  });
});

describe('the block helpers', () => {
  it('says whether a page opens with a block', () => {
    expect(hasFrontmatter('---\nx: 1\n---\n')).toBe(true);
    expect(hasFrontmatter('---\r\nx: 1\r\n---\r\n')).toBe(true);
    expect(hasFrontmatter('# A\n')).toBe(false);
    expect(hasFrontmatter('')).toBe(false);
  });

  it('locates a key inside the block only', () => {
    const lines = mdLines(['---', 'title: A', 'description: B', '---', 'description: not a key'].join('\n'));
    expect(keyLine(lines, 'description')).toBe(3);
    expect(keyLine(lines, 'owner')).toBe(0);
    expect(keyLine(mdLines('description: x\n'), 'description')).toBe(0);
  });

  it('blanks the block line for line', () => {
    expect(blankFrontmatter('---\ntitle: A\n---\n# A\n')).toBe('\n\n\n# A');
  });

  it('blanks the block, every fence line and every indented code line, line for line', () => {
    expect(outsideCode('---\na: [x](y)\n---\n# T\n```\n[f](g)\n```\nbody\n\n    [c](d)')).toBe('\n\n\n# T\n\n\n\nbody\n\n');
  });
});

describe('indentOf', () => {
  it('counts spaces, a tab reaching the next multiple of four', () => {
    expect(indentOf('x')).toBe(0);
    expect(indentOf('   x')).toBe(3);
    expect(indentOf('\tx')).toBe(4);
    expect(indentOf('  \tx')).toBe(4);
    expect(indentOf('    \t x')).toBe(9);
  });
});

describe('what a link reader skips', () => {
  it('blanks code spans and comments in place, keeping every offset and line', () => {
    const text = 'a `b` c ``d ` e`` f <!-- g\nh --> i `unclosed j\n\nk` l';
    const out = blankInline(text);
    expect(out).toHaveLength(text.length);
    expect(out).toBe(`a     c${' '.repeat(11)}f${' '.repeat(7)}\n${' '.repeat(6)}i \`unclosed j\n\nk\` l`);
    expect(blankInline('<!-- open')).toBe('<!-- open');
    expect(blankInline('`<!--` then [x](y.md) then `-->`')).toBe('       then [x](y.md) then      ');
  });

  it('blanks the block, code, code spans and comments together, line for line', () => {
    const text = ['---', 'a: [x](y.md)', '---', 'See `[c](c.md)` and [d](d.md).', '<!-- [e](e.md) -->', '', '    [f](f.md)', '```', '[g](g.md)', '```'].join('\n');
    const out = linkableText(text).split('\n');
    expect(out).toHaveLength(10);
    expect(out[3]).toBe(`See ${' '.repeat(11)} and [d](d.md).`);
    expect(out.filter((l) => l.includes(']('))).toEqual([out[3]]);
  });
});
