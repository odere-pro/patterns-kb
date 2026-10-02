import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GIT_REPO_VARS, scrubGitEnv } from './git-env';

const tmp: string[] = [];
const mkdir = (prefix: string): string => {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tmp.push(d);
  return d;
};
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('scrubGitEnv', () => {
  it('removes every repository and identity variable, keeps the rest, and names what it removed', () => {
    const env: NodeJS.ProcessEnv = { PATH: '/bin', GIT_DIR: '/x/.git', GIT_WORK_TREE: '/x', GIT_AUTHOR_NAME: 'Someone', GIT_EDITOR: 'vi' };
    expect(scrubGitEnv(env)).toEqual(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_AUTHOR_NAME']);
    expect(env).toEqual({ PATH: '/bin', GIT_EDITOR: 'vi' });
  });

  it('removes nothing from a clean environment', () => {
    const env: NodeJS.ProcessEnv = { PATH: '/bin' };
    expect(scrubGitEnv(env)).toEqual([]);
    expect(env).toEqual({ PATH: '/bin' });
  });

  it('left none of its variables in this suite’s own environment', () => {
    for (const name of GIT_REPO_VARS) expect(process.env[name], name).toBeUndefined();
  });

  it('keeps a sandbox’s git init and commit out of a repository the caller pointed git at', () => {
    const outer = mkdir('kb-git-env-outer-');
    const git = (cwd: string, env: NodeJS.ProcessEnv, ...args: string[]) => spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    const base = { ...process.env, GIT_CONFIG_NOSYSTEM: '1' };
    expect(git(outer, base, 'init', '-q', '-b', 'outer').status).toBe(0);
    const before = fs.readFileSync(path.join(outer, '.git', 'HEAD'), 'utf8');

    const leaked: NodeJS.ProcessEnv = { ...base, GIT_DIR: path.join(outer, '.git'), GIT_WORK_TREE: outer };
    scrubGitEnv(leaked);
    const sandbox = mkdir('kb-git-env-sandbox-');
    expect(git(sandbox, leaked, 'init', '-q', '-b', 'main').status).toBe(0);
    expect(git(sandbox, leaked, 'config', 'user.name', 'kb tests').status).toBe(0);

    expect(fs.readFileSync(path.join(outer, '.git', 'HEAD'), 'utf8')).toBe(before);
    expect(fs.readFileSync(path.join(outer, '.git', 'config'), 'utf8')).not.toContain('kb tests');
    expect(fs.existsSync(path.join(sandbox, '.git', 'HEAD'))).toBe(true);
  });
});
