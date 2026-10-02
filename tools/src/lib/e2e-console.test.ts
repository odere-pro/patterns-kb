/**
 * The console judgement behind the e2e fixture (tools/src/lib/e2e-console.ts).
 */

import { describe, expect, it } from 'vitest';

import { judgeConsole, type ExpectedConsole } from './e2e-console.js';

const LIST: readonly ExpectedConsole[] = [
  { name: 'missing-image', match: /status of 404/, flows: ['not-found'], reason: 'the flow asks for a page the host does not hold' },
];

describe('judgeConsole', () => {
  it('passes a flow that printed nothing and names nothing', () => {
    expect(judgeConsole('search', [], LIST)).toEqual({ unexpected: [], missing: [] });
  });

  it('names every message no entry of the flow covers, and an entry of another flow covers none', () => {
    expect(judgeConsole('search', ['Failed to load resource: the server responded with a status of 404'], LIST)).toEqual({
      unexpected: ['Failed to load resource: the server responded with a status of 404'],
      missing: [],
    });
  });

  it('accepts a named message in its flow, and names an entry the flow no longer prints', () => {
    expect(judgeConsole('not-found', ['x status of 404', 'Uncaught TypeError: y'], LIST)).toEqual({ unexpected: ['Uncaught TypeError: y'], missing: [] });
    expect(judgeConsole('not-found', [], LIST)).toEqual({ unexpected: [], missing: ['missing-image'] });
  });
});
