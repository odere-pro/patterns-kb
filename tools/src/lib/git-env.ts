/**
 * Keeps the test suite's git away from the repository that runs it.
 *
 * Git reads `GIT_DIR`, `GIT_WORK_TREE` and their kin from the environment before
 * it looks at the working directory. A caller that exports them (a hook that
 * validates a staged extract, a by-hand run over a copied tree) hands them to
 * every process the suite spawns, and a sandbox's `git init`, `git config` and
 * `git commit` then act on that repository instead of the sandbox: its HEAD,
 * its branches, its local config and its index.
 *
 * `git commit` also hands its hooks the author and committer identity
 * (`GIT_AUTHOR_NAME` and the rest). Left in place, every sandbox commit made
 * under the pre-commit hook carries the real author, not the sandbox's
 * configured one, and a test that reads the author back sees a stranger.
 *
 * vitest loads this file first (`setupFiles` in vitest.config.ts), so the
 * variables are gone from `process.env` before any test spawns a child. It
 * does not touch anything else in the environment.
 *
 * Usage: `scrubGitEnv(env)` removes the variables from `env` and returns the
 * names it removed; importing the module scrubs `process.env` once.
 */

/** The variables that point git at another repository, or pin an identity over the sandbox's own config. */
export const GIT_REPO_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_CEILING_DIRECTORIES',
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_AUTHOR_DATE',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
  'GIT_COMMITTER_DATE',
] as const;

/** Removes every variable in GIT_REPO_VARS from `env`; returns the names it removed. */
export function scrubGitEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const removed: string[] = [];
  for (const name of GIT_REPO_VARS) {
    if (name in env) {
      delete env[name];
      removed.push(name);
    }
  }
  return removed;
}

scrubGitEnv();
