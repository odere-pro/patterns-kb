/** The browser requirement: only the exact value 1 turns a missing browser into a finding. */

import { describe, expect, it } from 'vitest';

import { browserRequired, REQUIRE_BROWSER } from './require-browser.js';

describe('browserRequired', () => {
  it('is true for 1 and false for anything else, including unset', () => {
    expect(REQUIRE_BROWSER).toBe('KB_REQUIRE_BROWSER');
    expect(browserRequired({ [REQUIRE_BROWSER]: '1' })).toBe(true);
    for (const v of ['0', '', 'true', ' 1']) expect(browserRequired({ [REQUIRE_BROWSER]: v })).toBe(false);
    expect(browserRequired({})).toBe(false);
  });

  it('reads the process environment by default', () => {
    expect(typeof browserRequired()).toBe('boolean');
  });
});
