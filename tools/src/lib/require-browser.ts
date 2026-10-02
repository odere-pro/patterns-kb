/**
 * Whether a missing browser is a finding, read the same way by both browser
 * gates (check-site-axe, check-site-e2e).
 *
 * With no Chromium installed those gates open nothing and exit 0, which is
 * right on a laptop that has not run `make site-deps` and wrong on a runner
 * whose job is to open pages: it would pass by running nothing. A runner sets
 * KB_REQUIRE_BROWSER=1, and then the absence is a finding.
 */

/** The environment variable that turns a missing browser into a finding. */
export const REQUIRE_BROWSER = 'KB_REQUIRE_BROWSER';

/** Whether the environment demands a browser: only the exact value 1 does. */
export function browserRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[REQUIRE_BROWSER] === '1';
}
