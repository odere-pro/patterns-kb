/**
 * Vitest for the tools workspace: the gates, the generators and the driver.
 *
 * The timeout is a decision, not a default: a gate test drives real processes
 * in a throwaway checkout, which is slower than a unit test.
 *
 * Coverage floors are a ratchet (spec: kb.gates.testing, coverage-ratchet).
 * Each is the value `make tools-test` measured, rounded down, minus one point
 * of slack: v8's attribution moves slightly between Node releases, and a floor
 * that flakes gets deleted. Raise a floor when you raise coverage; never lower
 * one to land a change, and never by excluding a file.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Loaded before any test: drops GIT_DIR and its kin, so a sandbox's git
    // never acts on the repository of whoever started the run.
    setupFiles: ['src/lib/git-env.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The suite's own scaffolding — the throwaway checkout and the shared
      // fixtures — measures the tests, not the code. That is the whole licence.
      exclude: ['src/**/*.test.ts', 'src/lib/sandbox.ts', 'src/lib/fixtures.ts'],
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'coverage',
      // Measured 2026-09-24 after the P2 merge's coverage pass (Node 24.20,
      // twice, the same both times): 99.94 / 99.77 / 99.90 / 99.96. Each floor
      // is the measurement rounded down, which keeps it within one point of
      // what the suite achieves (spec kb.gates.testing, testing-C8). The
      // tests-vitest gate fails the run below any of these, pointing at this
      // file.
      thresholds: {
        statements: 99,
        branches: 99,
        functions: 99,
        lines: 99,
      },
    },
  },
});
