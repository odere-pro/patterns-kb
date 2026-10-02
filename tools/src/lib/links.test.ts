/**
 * The link-reading convention: which targets count and where they resolve.
 */

import fs from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { inlineLinks, isExternal, linkTargets, onDiskExactly, resolveTarget, splitTarget } from './links.js';
import { makeSandbox } from './sandbox.js';

describe('linkTargets', () => {
  it('reads every inline link, several to a line, and drops a quoted title', () => {
    expect(linkTargets('See [a](a.md) and [b](../b.md "the b page"), then [c](c.json).')).toEqual([
      'a.md',
      '../b.md',
      'c.json',
    ]);
  });

  it('reads links inside a table cell', () => {
    expect(linkTargets('| [x](x.md) · [y](y.md) | when |')).toEqual(['x.md', 'y.md']);
  });

  it('reads nothing from text with no link', () => {
    expect(linkTargets('Plain [brackets] and (parentheses).')).toEqual([]);
  });
});

describe('resolveTarget', () => {
  it('resolves against the linking file’s folder', () => {
    expect(resolveTarget('docs/CLAUDE.md', '../tools/CLAUDE.md')).toBe('tools/CLAUDE.md');
    expect(resolveTarget('CLAUDE.md', 'docs/inbox.md')).toBe('docs/inbox.md');
  });

  it('drops the anchor and the query', () => {
    expect(resolveTarget('CLAUDE.md', '.claude/rules/x.md#the-separation')).toBe('.claude/rules/x.md');
    expect(resolveTarget('docs/a.md', 'b.md?plain=1')).toBe('docs/b.md');
  });

  it('is not the repository’s for a scheme, a protocol-relative address, a bare anchor or nothing', () => {
    expect(resolveTarget('CLAUDE.md', 'https://example.com/x.md')).toBeNull();
    expect(resolveTarget('CLAUDE.md', 'mailto:a@b.c')).toBeNull();
    expect(resolveTarget('CLAUDE.md', '//cdn.example.com/x.js')).toBeNull();
    expect(resolveTarget('CLAUDE.md', '#frag')).toBeNull();
    expect(resolveTarget('CLAUDE.md', '')).toBeNull();
    expect(resolveTarget('CLAUDE.md', '?q=1')).toBeNull();
  });
});

describe('inlineLinks', () => {
  it('reads each link with its label, its target and where its target starts', () => {
    const text = 'See [a](a.md) and ![pic](p.png).';
    expect(inlineLinks(text)).toEqual([
      { target: 'a.md', label: 'a', image: false, at: text.indexOf('](a.md') },
      { target: 'p.png', label: 'pic', image: true, at: text.indexOf('](p.png') },
    ]);
  });

  it('finds the opening bracket past nested and escaped brackets', () => {
    expect(inlineLinks('[![logo](l.png)](home.md)').map((l) => l.label)).toEqual(['logo', '![logo](l.png)']);
    expect(inlineLinks('[a [b] c](x.md)')[0]?.label).toBe('a [b] c');
    expect(inlineLinks('[a \\] b](x.md)')[0]?.label).toBe('a \\] b');
  });

  it('reads a label wrapped onto the next line, never across a blank one', () => {
    expect(inlineLinks('[two\nlines](x.md)')[0]?.label).toBe('two\nlines');
    const orphan = inlineLinks('[before\n\nafter](x.md)')[0];
    expect(orphan?.label).toBe('');
    expect(orphan?.target).toBe('x.md');
  });

  it('has an empty label when nothing opens it', () => {
    expect(inlineLinks('stray](x.md)')).toEqual([{ target: 'x.md', label: '', image: false, at: 5 }]);
  });
});

describe('isExternal', () => {
  it('names the schemes and addresses that are somebody else’s', () => {
    for (const t of ['', 'http://a.b', 'HTTPS://a.b/c.md', 'mailto:a@b.c', 'tel:+1', 'data:text/plain,x', 'javascript:void(0)', '//cdn.example.com/x.js', 'vscode://file/x', 'git+ssh://h/r']) {
      expect(isExternal(t), t).toBe(true);
    }
  });

  it('keeps every other target, a bare word-colon included', () => {
    for (const t of ['docs:page.md', 'a.md', '../b.md#x', '#frag', '/route', 'C:/x.md']) expect(isExternal(t), t).toBe(false);
  });
});

describe('splitTarget', () => {
  it('splits the fragment off and drops the query', () => {
    expect(splitTarget('a.md#x')).toEqual({ path: 'a.md', fragment: 'x' });
    expect(splitTarget('a.md?plain=1#x')).toEqual({ path: 'a.md', fragment: 'x' });
    expect(splitTarget('a.md?plain=1')).toEqual({ path: 'a.md', fragment: null });
    expect(splitTarget('#only')).toEqual({ path: '', fragment: 'only' });
    expect(splitTarget('a.md#')).toEqual({ path: 'a.md', fragment: '' });
  });
});

describe('onDiskExactly', () => {
  it('finds a file or a folder only with the case it is written in', () => {
    const sb = makeSandbox();
    try {
      sb.write('docs/reference/page-rules.md', '# Rules\n');
      const there = onDiskExactly(sb.dir);
      for (const p of ['docs/reference/page-rules.md', 'docs/reference/', 'docs', './docs/./reference', '', '.']) expect(there(p), p).toBe(true);
      for (const p of ['docs/reference/Page-Rules.md', 'Docs/reference/page-rules.md', 'docs/reference/page-rules.md/x', 'docs/nope.md', '../docs', 'docs/../../x']) expect(there(p), p).toBe(false);
    } finally {
      sb.cleanup();
    }
  });

  it('reads each folder once per check function', () => {
    const sb = makeSandbox();
    try {
      sb.write('a/b.md', '# B\n');
      sb.write('a/c.md', '# C\n');
      const spy = vi.spyOn(fs, 'readdirSync');
      const there = onDiskExactly(sb.dir);
      expect([there('a/b.md'), there('a/c.md'), there('a/d.md')]).toEqual([true, true, false]);
      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    } finally {
      sb.cleanup();
    }
  });
});
