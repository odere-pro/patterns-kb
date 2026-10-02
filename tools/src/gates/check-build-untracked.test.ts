/**
 * The built-output gate. What matters here is that a forced `git add -f` of a built file is
 * caught from the index, and that a dropped `.gitignore` line is named by its text.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { expectFail, expectMisuse, expectPass, makeSandbox, type Sandbox } from '../lib/sandbox.js';
import { IGNORE_LINES, ruleFor, spec } from './check-build-untracked.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
  sb.write('.gitignore', `${IGNORE_LINES.join('\n')}\n`);
  sb.write('docs/a.md', '# a\n');
  sb.write('site/src/content/docs/index.mdx', '# home\n');
});
afterEach(() => sb.cleanup());

describe('the rules', () => {
  it('names the rule a built path breaks and lets a source path through', () => {
    expect(ruleFor('x.html')).toContain('.html');
    expect(ruleFor('site/dist/a.js')).toContain('site/dist/');
    expect(ruleFor('site/.astro/a.json')).toContain('site/.astro/');
    expect(ruleFor('site/coverage/a.json')).toContain('site/coverage/');
    expect(ruleFor('site/public/kb.js')).toContain('bundled');
    expect(ruleFor('site/src/content/docs/a/b.md')).toContain('mirror');
    expect(ruleFor('site/src/content/docs/index.mdx')).toBeNull();
    expect(ruleFor('site/src/content/docs/404.mdx')).toBeNull();
    expect(ruleFor('site/src/lib/a.ts')).toBeNull();
    expect(ruleFor('site/public/kb.json')).toBeNull();
  });
});

describe('the finding', () => {
  it('passes a tree that tracks no built output and says how many files it read', async () => {
    sb.git('add', '-A');
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('[build-untracked] 3 tracked files hold no built output');
  });

  it('fails a tracked file under site/dist/, naming the path and the rule', async () => {
    sb.write('site/dist/x.html', '<p>x</p>\n');
    sb.git('add', '-A', '-f');
    expectFail(await sb.run(spec), 'site/dist/x.html: is tracked, but');
  });

  it('ignores built output that is on disk but not tracked', async () => {
    sb.write('site/dist/x.html', '<p>x</p>\n');
    sb.git('add', 'docs/a.md');
    expectPass(await sb.run(spec));
  });

  it('fails an .gitignore that lacks a required line, and one that is missing', async () => {
    sb.write('.gitignore', IGNORE_LINES.filter((l) => l !== 'site/public/kb.js').join('\n'));
    expectFail(await sb.run(spec), '.gitignore: lacks the line site/public/kb.js');
    sb.rm('.gitignore');
    const r = await sb.run(spec);
    expectFail(r, 'lacks the line site/dist/');
    expect(r.err.match(/lacks the line/g)).toHaveLength(IGNORE_LINES.length);
  });
});

describe('misuse', () => {
  it('rejects an argument, since it takes none', async () => {
    expectMisuse(await sb.run(spec, ['--nope']));
    expectMisuse(await sb.run(spec, ['file']));
  });
});
