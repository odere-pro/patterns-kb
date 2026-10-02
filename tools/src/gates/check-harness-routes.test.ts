/**
 * The route gate over `.claude/`. What it defends is a fresh checkout: a
 * harness file that links a moved page, or sends a session to a folder only
 * its author's machine has, works for one person and fails everyone else. Each
 * case plants one such route on a harness the gate passes; the last block runs
 * it on the real harness.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { harnessTree, skillText } from '../lib/fixtures.js';
import { capture, expectFail, expectMisuse, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from '../lib/sandbox.js';
import { allows, bashAllows } from '../lib/permissions.js';
import {
  allowedCommands,
  allowProblems,
  commandProblems,
  harnessFiles,
  layerFiles,
  PROMPT_KEPT,
  spec,
  UNTRACKED,
  untrackedMentions,
  WRITES,
  untrackedProblems,
  withoutCodeSpans,
} from './check-harness-routes.js';
import { SETTINGS } from './check-harness.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

const findings = (err: string): string[] => err.split('\n').filter((l) => l.startsWith('[harness-routes] FAIL'));
const SKILL = '.claude/skills/widget/SKILL.md';
/** The widget skill with `extra` appended to its gap paragraph. */
const withLine = (extra: string): string => skillText('widget').replace('in one line.\n', `in one line.\n${extra}\n`);
/** Line 9 of the widget skill is the first line `withLine` adds. */
const ADDED = 9;

describe('a harness that routes', () => {
  it('passes, counting its files, links and named untracked paths', async () => {
    harnessTree(sb);
    sb.write('docs/page.md', '# Page\n');
    sb.write(SKILL, withLine('See [the page](../../../docs/page.md#top) and run `make tools-test` for tools/coverage/.'));
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.err).toBe('');
    expect(r.out).toBe(
      '[harness-routes] 4 harness files route to live paths: 1 links resolve, 1 untracked path names its command, ' +
        '1 named command is allowed or prompt-kept',
    );
  });

  it('with no .claude/ folder exits 0 and counts zero (self-check-C9)', async () => {
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[harness-routes] no .claude/ folder — 0 harness files checked');
  });
});

describe('links (self-check-C6)', () => {
  it('names the harness file, the line and the resolved path of a link to a missing page', async () => {
    harnessTree(sb);
    sb.write(SKILL, withLine('Read [the rules](../../../docs/page-rules.md?x=1#PAGE-001).'));
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([
      `[harness-routes] FAIL ${SKILL}:${ADDED}: dead link: (../../../docs/page-rules.md?x=1#PAGE-001) resolves to docs/page-rules.md, which does not exist`,
    ]);
  });

  it('resolves against the linking file, so a root-relative spelling from a skill is dead', async () => {
    harnessTree(sb);
    sb.write('docs/page.md', '# Page\n');
    sb.write(SKILL, withLine('Read [the page](../../docs/page.md).'));
    expectFail(await sb.run(spec), 'resolves to .claude/docs/page.md, which does not exist');
  });

  it('skips a scheme, mailto, a bare anchor, a fenced sample and a code span', async () => {
    harnessTree(sb);
    sb.write(
      SKILL,
      withLine(
        '[web](https://example.com/x) [mail](mailto:a@b.c) [here](#top) `[span](gone.md)`\n\n```markdown\n[fenced](gone.md)\n```',
      ),
    );
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('0 links resolve');
  });

  it('reads every markdown file in a skill’s folder, agents, rules and workflows; never hooks or a skill’s scripts', async () => {
    harnessTree(sb);
    sb.write('.claude/skills/widget/references/deep.md', '[gone](../../../../gone.md)\n');
    sb.write('.claude/skills/widget/run.mjs', '// [gone](gone.md) tmp/\n');
    sb.write('.claude/skills/loose.md', '[gone](gone.md)\n');
    sb.write('.claude/agents/nested/a.md', '[gone](gone.md)\n');
    sb.write('.claude/workflows/batch.mjs', '// see [gone](gone.md)\n');
    sb.write('.claude/hooks/notes.md', '[gone](gone.md)\n');
    sb.write('.claude/skills/widget/.draft.md', '[gone](gone.md)\n');
    expect(harnessFiles(sb.dir)).toEqual([
      '.claude/agents/claim-audit.md',
      '.claude/agents/gate-triage.md',
      '.claude/rules/widgets.md',
      '.claude/skills/widget/SKILL.md',
      '.claude/skills/widget/references/deep.md',
      '.claude/workflows/batch.mjs',
    ]);
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      '[harness-routes] FAIL .claude/skills/widget/references/deep.md:1: dead link: (../../../../gone.md) resolves to gone.md, which does not exist',
      '[harness-routes] FAIL .claude/workflows/batch.mjs:1: dead link: (gone.md) resolves to .claude/workflows/gone.md, which does not exist',
    ]);
  });
});

describe('untracked paths (self-check-C7, -C8)', () => {
  it('fails scratch space wherever it is named, beside any build command', async () => {
    harnessTree(sb);
    sb.write(SKILL, withLine('Keep notes in tmp/notes.md.\n\n```bash\nmake tools-test\n```'));
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      `[harness-routes] FAIL ${SKILL}:${ADDED}: points at tmp/, which is untracked by design and nothing makes — the route is dead on every checkout but its author's`,
    ]);
  });

  it('fails build output until the same file names its command, and naming it clears it', async () => {
    harnessTree(sb);
    sb.write(SKILL, withLine('The report is in tools/coverage/index.html.'));
    expect(findings((await sb.run(spec)).err)).toEqual([
      `[harness-routes] FAIL ${SKILL}:${ADDED}: points at tools/coverage/ without naming \`make tools-test\`, the command that makes it — say how to make the path exist before sending a session there`,
    ]);
    sb.write(SKILL, withLine('The report is in tools/coverage/index.html; `make tools-test` writes it.'));
    expectPass(await sb.run(spec));
  });

  it('gives one finding per prefix per file, at its first mention: one prefix five times is one, two are two', async () => {
    harnessTree(sb);
    sb.write(SKILL, withLine(Array.from({ length: 5 }, (_, i) => `tmp/a${i}`).join('\n')));
    expect(findings((await sb.run(spec)).err)).toHaveLength(1);
    sb.write(SKILL, withLine('tmp/a\nsite/dist/index.html\ntmp/b'));
    const r = findings((await sb.run(spec)).err);
    expect(r).toHaveLength(2);
    expect(r[0]).toContain(`${SKILL}:${ADDED}: points at tmp/`);
    expect(r[1]).toContain(`${SKILL}:${ADDED + 1}: points at site/dist/ without naming \`make site-build\``);
  });

  it('matches a prefix only as a path token: a word that only starts like one draws nothing', async () => {
    harnessTree(sb);
    sb.write(SKILL, withLine('mktemp/ my-tmp/ .tmp/ x/tmp/ _tmp/ tmpfile a.tmp/ 9tmp/'));
    expectPass(await sb.run(spec));
    expect([...untrackedMentions('(tmp/x) "tmp/y" `tmp/z`\n tmp/w').keys()]).toEqual(['tmp/']);
    expect(untrackedMentions('a\n`tmp/x`').get('tmp/')).toBe(2);
  });

  it('reads past a leading ./, so a route spelled from the current folder is the same route', async () => {
    harnessTree(sb);
    sb.write(SKILL, withLine('Write it to ./tmp/notes.md.'));
    expect(findings((await sb.run(spec)).err)).toEqual([
      `[harness-routes] FAIL ${SKILL}:${ADDED}: points at tmp/, which is untracked by design and nothing makes — the route is dead on every checkout but its author's`,
    ]);
    expect([...untrackedMentions('(./tmp/a) ./site/dist/x').keys()]).toEqual(['tmp/', 'site/dist/']);
    // Only at a token's start: a `./` inside a path, or after a dot, is not the current folder.
    expect([...untrackedMentions('x/./tmp/a ../tmp/b .../tmp/c')]).toEqual([]);
  });

  it('gives a tool’s own folder under tmp/ to its tool, not to tmp/', () => {
    expect([...untrackedMentions('tmp/kb-harvest/ledger.json and tmp/designs/x.md, tmp/site-extract/acme').keys()].sort()).toEqual([
      'tmp/designs/',
      'tmp/kb-harvest/',
      'tmp/site-extract/',
    ]);
    expect(untrackedProblems('root tmp/site-extract/acme; node .claude/skills/site-extract/structure.mjs builds it')).toEqual([]);
    expect(untrackedProblems('tmp/kb-harvest/ledger.json, written by node .claude/skills/kb-harvest/harvest.mjs')).toEqual([]);
    expect(untrackedProblems('tmp/kb-harvest/ledger.json')).toHaveLength(1);
  });

  it('pairs every row with a command or with none, and never two rows for one prefix', () => {
    const prefixes = UNTRACKED.map(([p]) => p);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect(UNTRACKED.find(([p]) => p === 'tmp/')?.[1]).toBeNull();
  });
});

describe('named commands (self-check-C10)', () => {
  const uncovered = (cmd: string): string =>
    `names \`${cmd}\`, which no permissions.allow entry in ${SETTINGS} covers and PROMPT_KEPT does not list — ` +
    'a session that follows it stops on a permission prompt; allow it, or keep the prompt with a reason in ' +
    'PROMPT_KEPT in tools/src/gates/check-harness-routes.ts';

  it('fails a command on neither list, once per file at its first line; an allow entry clears it', async () => {
    harnessTree(sb);
    sb.write(SKILL, withLine('Run `wc -l build` first.\n\n```bash\nmake all && wc -l build\n```'));
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([`[harness-routes] FAIL ${SKILL}:${ADDED}: ${uncovered('wc -l build')}`]);
    sb.write(SETTINGS, JSON.stringify({ permissions: { allow: ['Bash(make:*)', 'Bash(wc -l build)'] } }));
    const ok = await sb.run(spec);
    expectPass(ok);
    expect(ok.out).toContain('2 named commands are allowed or prompt-kept');
  });

  it('passes a command a prompt-kept prefix covers, whatever follows the prefix', async () => {
    harnessTree(sb);
    sb.write(SKILL, withLine("Print it with `node -e 'console.log(1)'`, then `sed -n 1p f`."));
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('2 named commands are allowed or prompt-kept');
  });

  it('allows nothing when settings.json is missing or not JSON', async () => {
    harnessTree(sb);
    sb.write(SKILL, withLine('Run `make all`.'));
    sb.write(SETTINGS, '{ not json');
    expect(findings((await sb.run(spec)).err)).toEqual([`[harness-routes] FAIL ${SKILL}:${ADDED}: ${uncovered('make all')}`]);
    fs.rmSync(path.join(sb.dir, SETTINGS));
    expect(allowedCommands(sb.dir)).toEqual([]);
    expect(commandProblems('`make all`', [])).toHaveLength(1);
  });

  it('reads no command from prose, a placeholder-only span or a fence of another language', async () => {
    harnessTree(sb);
    sb.write(SKILL, withLine('Remove the old folder by hand, run `<cmd> --all`.\n\n```text\nrm -rf x\n```\n\n```json\nrm -rf y\n```'));
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('0 named commands are allowed or prompt-kept');
  });

  it('reads an unlabelled fence, a zsh fence and any program a shell fence names, but not a heredoc body', async () => {
    harnessTree(sb);
    const planted = [
      '```', // 9
      'git push origin main', // 10
      '```',
      '',
      '```zsh', // 13
      'rm -rf docs', // 14
      '```',
      '',
      '```bash', // 17
      'diff a.txt b.txt', // 18
      'echo hi > out.txt', // 19
      'tee out2.txt < a.txt', // 20
      "jq . <<'EOF'", // 21
      'rm -rf data-line',
      'EOF',
      'make all',
      '```',
    ].join('\n');
    sb.write(SKILL, withLine(planted));
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual(
      [
        [ADDED + 1, 'git push origin main'],
        [ADDED + 5, 'rm -rf docs'],
        [ADDED + 9, 'diff a.txt b.txt'],
        [ADDED + 10, 'echo hi > out.txt'],
        [ADDED + 11, 'tee out2.txt < a.txt'],
        [ADDED + 12, "jq . <<'EOF'"],
      ].map(([n, c]) => `[harness-routes] FAIL ${SKILL}:${n}: ${uncovered(c as string)}`),
    );
  });

  it('checks a lone program left before a placeholder, as rm …', async () => {
    harnessTree(sb);
    sb.write(SKILL, withLine('Run `rm <file>` and `curl <url>`, then `make <target>`.'));
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([
      `[harness-routes] FAIL ${SKILL}:${ADDED}: ${uncovered('rm …')}`,
      `[harness-routes] FAIL ${SKILL}:${ADDED}: ${uncovered('curl …')}`,
    ]);
  });

  it('never lets an exact entry cover a command cut at a placeholder', async () => {
    harnessTree(sb);
    sb.write(SETTINGS, JSON.stringify({ permissions: { allow: ['Bash(make:*)', 'Bash(node tools/x.mjs)'] } }));
    sb.write(SKILL, withLine('Run `node tools/x.mjs`, or one case with `node tools/x.mjs <case> -v`.'));
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([`[harness-routes] FAIL ${SKILL}:${ADDED}: ${uncovered('node tools/x.mjs …')}`]);
    sb.write(SETTINGS, JSON.stringify({ permissions: { allow: ['Bash(make:*)', 'Bash(node tools/x.mjs:*)'] } }));
    expectPass(await sb.run(spec));
  });

  it('passes a path template only when an allow entry is one of its family', async () => {
    harnessTree(sb);
    sb.write(SKILL, withLine('Run `node scripts/<name>.mjs`.'));
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([`[harness-routes] FAIL ${SKILL}:${ADDED}: ${uncovered('node scripts/…')}`]);
    sb.write(SETTINGS, JSON.stringify({ permissions: { allow: ['Bash(make:*)', 'Bash(node scripts/kb.mjs:*)'] } }));
    expectPass(await sb.run(spec));
  });

  it('reads the commands a CLAUDE.md layer names, at the root and in a folder', async () => {
    harnessTree(sb);
    sb.write('CLAUDE.md', '# Root\n\nRun `make all`.\n');
    sb.write('tests/CLAUDE.md', '# Tests\n\n```bash\nrm -rf fixtures\n```\n');
    expect(layerFiles(sb.dir)).toEqual(['CLAUDE.md', 'tests/CLAUDE.md']);
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([`[harness-routes] FAIL tests/CLAUDE.md:4: ${uncovered('rm -rf fixtures')}`]);
  });

  it('fails an allow entry that lets a write run with no prompt, once per entry', async () => {
    harnessTree(sb);
    const allow = ['Bash(make:*)', 'Bash(git add:*)', 'Bash(git status:*)', 'Bash(rm:*)', 'Bash(git:*)', 'Bash(curl https://x)', 'Bash(sed -i docs:*)'];
    sb.write(SETTINGS, JSON.stringify({ permissions: { allow } }));
    const r = await sb.run(spec);
    expectFail(r);
    const f = findings(r.err);
    expect(f).toHaveLength(4);
    expect(f.every((l) => l.startsWith(`[harness-routes] FAIL ${SETTINGS}: permissions.allow holds Bash(`))).toBe(true);
    expect(f.map((l) => /holds Bash\((.+?)\), which lets `([^`]+)`/.exec(l)?.slice(1))).toEqual([
      ['rm:*', 'rm'],
      ['git:*', 'git commit'],
      ['curl https://x', 'curl'],
      ['sed -i docs:*', 'sed'],
    ]);
  });

  it('keeps each prefix once, each with a reason', () => {
    const prefixes = PROMPT_KEPT.map(([p]) => p);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const [prefix, reason] of PROMPT_KEPT) expect(reason.trim(), prefix).not.toBe('');
  });

  it('holds the owner’s allow list in the real settings, and no command it leaves out', () => {
    const allowed = bashAllows(JSON.parse(fs.readFileSync(path.join(REPO_ROOT, SETTINGS), 'utf8')));
    const owner = [
      'node --check:*',
      'node --test:*',
      'bash tests/run.sh',
      'node .claude/skills/kb-harvest/harvest.mjs:*',
      'node .claude/skills/site-extract/structure.mjs:*',
      'node .claude/skills/kb-fact-check/eval-check.mjs:*',
      'node .claude/skills/kb-fact-check/merge-staged.mjs:*',
      'node .claude/skills/kb-fact-check/rollup.mjs:*',
      'jq:*',
      'comm:*',
      'sort:*',
      'wc:*',
      'ls:*',
      'grep:*',
      'find:*',
      'git grep:*',
      'git blame:*',
      'mkdir -p tmp/designs/',
    ];
    const kept = [
      'make:*',
      'node scripts/kb.mjs:*',
      'node .claude/skills/kb-fact-check/fetch.mjs:*',
      'git status:*',
      'git diff:*',
      'git log:*',
      'git show:*',
      'git add:*',
    ];
    // The whole list, not a subset: an entry nobody agreed to fails here.
    expect([...allowed].sort()).toEqual([...kept, ...owner].sort());
    expect(allowProblems(allowed)).toEqual([]);
    const left = ['sed -i s/a/b/ f', 'node -e 1', 'git mv a b', 'git config x y', 'gh issue create', 'gh api x'];
    const writes = ['rm -rf x', 'cp a b', 'mv a b', 'git commit -m x', 'git push origin', 'curl https://x', 'tee f'];
    for (const cmd of [...left, ...writes]) {
      expect(allowed.filter((p) => allows(p, cmd)), cmd).toEqual([]);
    }
    for (const cmd of left) expect(PROMPT_KEPT.some(([k]) => cmd.startsWith(`${k} `)), cmd).toBe(true);
    for (const cmd of writes) expect(WRITES.some((w) => cmd === w || cmd.startsWith(`${w} `)), cmd).toBe(true);
  });

  it('lists every prompt-kept prefix, with its reason, in the concept page a reader opens', () => {
    const doc = fs.readFileSync(path.join(REPO_ROOT, 'docs/concepts/working-in-this-repo.md'), 'utf8');
    const section = doc.split('\n## Commands that keep their prompt\n')[1]?.split('\n## ')[0] ?? '';
    const rows = section.split('\n').filter((l) => /^\| `/.test(l));
    expect(rows.map((l) => /^\| `([^`]+)`/.exec(l)?.[1])).toEqual(PROMPT_KEPT.map(([p]) => p));
  });
});

describe('withoutCodeSpans', () => {
  it('blanks a span to spaces, keeping every offset', () => {
    expect(withoutCodeSpans('a `b` c')).toBe('a     c');
    expect(withoutCodeSpans('`open\nclose`')).toBe('`open\nclose`');
  });
});

describe('misuse', () => {
  it('takes no argument, flag or path, and writes nothing', async () => {
    harnessTree(sb);
    const before = sb.snapshot();
    expectMisuse(await sb.run(spec, ['--nope']));
    expectMisuse(await sb.run(spec, [SKILL]));
    expectMisuse(await sb.run(spec, ['--fix']));
    expect(sb.snapshot()).toEqual(before);
  });
});

describe('the real harness', () => {
  it('passes where it really runs, reading every harness file a plain walk finds (self-check-C9)', async () => {
    const walk = (rel: string): string[] =>
      fs.readdirSync(path.join(REPO_ROOT, rel), { withFileTypes: true }).flatMap((e) => {
        const child = `${rel}/${e.name}`;
        if (e.isDirectory()) return walk(child);
        return child.endsWith('.md') ? [child] : [];
      });
    const skills = fs
      .readdirSync(path.join(REPO_ROOT, '.claude/skills'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap((e) => walk(`.claude/skills/${e.name}`));
    const flat = (dir: string, ext: string): string[] =>
      fs.readdirSync(path.join(REPO_ROOT, dir)).filter((f) => f.endsWith(ext)).map((f) => `${dir}/${f}`);
    const expected = [...skills, ...flat('.claude/agents', '.md'), ...flat('.claude/rules', '.md'), ...flat('.claude/workflows', '.mjs')];
    expect(harnessFiles(REPO_ROOT)).toEqual(expected.sort());

    const r = await capture(spec, [], REPO_ROOT);
    expect(r.err).toBe('');
    expectPass(r);
    expect(r.out).toMatch(new RegExp(`^\\[harness-routes\\] ${expected.length} harness files route to live paths: [1-9]\\d* links resolve`));
    expect(r.out).toMatch(/, [1-9]\d* named commands are allowed or prompt-kept$/);
  });
});
