/**
 * The kb.mjs command surface: every command once, `register` retired, the
 * usage printed from the one list.
 */

import { describe, expect, it } from 'vitest';

import { CLI_COMMANDS, CLI_GLOBAL_FLAGS, RETIRED, USAGE_HEADER, usageText } from './spec.js';

describe('the command surface', () => {
  it('carries each command once, in reading-then-writing order, and retires register and level', () => {
    const names = CLI_COMMANDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(['find', 'get', 'brief', 'related', 'backlinks', 'refs', 'ls', 'validate', 'set', 'wild', 'production', 'explain', 'link', 'unlink', 'new']);
    expect(CLI_COMMANDS.find((c) => c.name === 'link')?.flags.map((f) => f.flag)).toEqual(expect.arrayContaining(['--group "…"', '--group-back "…"']));
    expect(Object.keys(RETIRED)).toEqual(['register', 'level']);
    expect(CLI_GLOBAL_FLAGS.map((f) => f.flag)).toEqual(['--json', '--diagrams']);
  });

  it('prints the usage: reading first, then writing, then the global flags', () => {
    const text = usageText(USAGE_HEADER);
    expect(text.startsWith(USAGE_HEADER)).toBe(true);
    expect(text.indexOf('Reading:')).toBeLessThan(text.indexOf('Writing'));
    expect(text).toContain('  kb.mjs ls [--band <b>] [--kind <k>]');
    expect(text).toContain('      --block <b>  just that block');
    expect(text).toContain('\n  --json      structured output instead of text');
    expect(text).not.toContain('register');
  });

  it('prints no header when none is given', () => {
    expect(usageText().startsWith('Reading:')).toBe(true);
  });
});
