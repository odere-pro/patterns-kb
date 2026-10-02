/**
 * The argument rules scripts/kb.mjs has always used: two boolean flags, every
 * other flag takes a value, a positional is neither.
 */

import { describe, expect, it } from 'vitest';

import { BOOL_FLAGS, parseArgs } from './args.js';

describe('parseArgs', () => {
  it('reads positionals around flags and their values', () => {
    const a = parseArgs(['get', 'circuit-breaker', '--block', 'usage', '--json', 'extra']);
    expect(a.positional).toEqual(['get', 'circuit-breaker', 'extra']);
    expect(a.opt('block')).toBe('usage');
    expect(a.flag('json')).toBe(true);
    expect(a.flag('diagrams')).toBe(false);
    expect(a.argv).toHaveLength(6);
  });

  it('never takes the word after a boolean flag as its value', () => {
    const a = parseArgs(['--diagrams', 'get', 'x']);
    expect(a.positional).toEqual(['get', 'x']);
    expect([...BOOL_FLAGS]).toEqual(['json', 'diagrams']);
  });

  it('answers null for a flag that is absent or given last with no value', () => {
    const a = parseArgs(['find', 'cache', '--tag']);
    expect(a.opt('tag')).toBeNull();
    expect(a.opt('band')).toBeNull();
    expect(a.positional).toEqual(['find', 'cache']);
  });
});
