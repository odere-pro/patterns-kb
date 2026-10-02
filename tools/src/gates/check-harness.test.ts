/**
 * The shape gate over `.claude/`. What it defends is reachability: a skill no
 * description routes to, a verifier that can write, a hook that talks on input
 * it cannot read and a folder nothing checks each fail a session quietly. Every
 * case below is one of those, planted on a harness the gate passes; the last
 * block runs the gate on the real harness and recounts it by a plain walk.
 */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Gate, Registry } from '../gen/gen-gates.js';
import { allowlistJson, harnessTree, hookSettings, inboxTree, skillText, verifierText, writeHook } from '../lib/fixtures.js';
import { capture, expectFail, expectMisuse, expectPass, makeSandbox, REPO_ROOT, type Sandbox } from '../lib/sandbox.js';
import { drive, shellQuote } from '../run-gates.js';
import {
  ALLOWLIST,
  bodyLines,
  CLAUDE_DIRS,
  claudeDirs,
  closingProblem,
  DESCRIPTION_CAP,
  descriptionGap,
  descriptionLength,
  descriptionProblem,
  descriptionQuoting,
  DESCRIPTIONS_BUDGET,
  htmlCitations,
  rawFrontmatterValue,
  HOOK_LIMIT_S,
  hookLimits,
  replySection,
  SETTINGS,
  skillBody,
  spec,
  toolsOf,
  VERIFIER_TOOLS,
  wiredHooks,
  type ClaudeDir,
} from './check-harness.js';

let sb: Sandbox;
beforeEach(() => {
  sb = makeSandbox();
});
afterEach(() => sb.cleanup());

/** The finding lines a run printed. */
const findings = (err: string): string[] => err.split('\n').filter((l) => l.startsWith('[harness-shape] FAIL'));

const SKILL = '.claude/skills/widget/SKILL.md';
const CLAIM = '.claude/agents/claim-audit.md';
const TRIAGE = '.claude/agents/gate-triage.md';

describe('a harness in shape', () => {
  it('passes, counting every folder and file it held', async () => {
    harnessTree(sb);
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.err).toBe('');
    expect(r.out).toBe(
      `[harness-shape] 4 folders under .claude/, all listed; 1 skill (0 excused by ${ALLOWLIST}), 2 agents, 1 rule, 1 hook and 0 other files in shape`,
    );
  });

  it('with no .claude/ folder exits 0 and counts zero (self-check-C9)', async () => {
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toBe('[harness-shape] no .claude/ folder — 0 harness files checked');
    expect(claudeDirs(sb.dir)).toEqual([]);
    sb.write('.claude', 'a file, not a folder\n');
    expectPass(await sb.run(spec));
    expect(claudeDirs(sb.dir)).toEqual([]);
  });
});

describe('the folder list (self-check-C1)', () => {
  it('fails an unlisted folder holding a file, once, naming the folder; its row clears it', async () => {
    harnessTree(sb);
    sb.write('.claude/stray/notes.md', 'x\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([
      '[harness-shape] FAIL .claude/stray: a folder under .claude/ with no row in the folder list — add a row to CLAUDE_DIRS in tools/src/gates/check-harness.ts saying what its files are and what holds them, or move it out',
    ]);

    const dirs = CLAUDE_DIRS as Record<string, ClaudeDir>;
    dirs['stray'] = { type: null, entry: { ext: ['.md'] }, reads: [], heldBy: 'the test' };
    try {
      const listed = await sb.run(spec);
      expectPass(listed);
      expect(listed.out).toContain('5 folders under .claude/, all listed');
      expect(listed.out).toContain('1 hook and 1 other file in shape');
    } finally {
      delete dirs['stray'];
    }
  });

  it('skips a dot-prefixed folder or entry, which the OS parks there', async () => {
    harnessTree(sb);
    sb.write('.claude/.cache/x', 'x\n');
    sb.write('.claude/skills/.DS_Store', 'x\n');
    expectPass(await sb.run(spec));
  });

  it('never looks inside another session’s checkout', async () => {
    harnessTree(sb);
    sb.write('.claude/worktrees/other/.claude/skills/bad/SKILL.md', 'no frontmatter\n');
    sb.write('.claude/worktrees/stray-file.txt', 'x\n');
    expectPass(await sb.run(spec));
  });
});

describe('entry shapes (self-check-C4)', () => {
  it('fails a file where a skill folder belongs, and a skill folder with no SKILL.md', async () => {
    harnessTree(sb);
    sb.write('.claude/skills/loose.md', 'x\n');
    sb.write('.claude/skills/empty/notes.md', 'x\n');
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      '[harness-shape] FAIL .claude/skills/empty: a folder of .claude/skills/ with no SKILL.md — nothing here loads',
      '[harness-shape] FAIL .claude/skills/loose.md: an entry of .claude/skills/ is a folder holding SKILL.md, not a file',
    ]);
  });

  it('fails a SKILL.md that is a folder with one finding naming it, and exits 1, not 2', async () => {
    harnessTree(sb);
    sb.write('.claude/skills/odd/SKILL.md/notes.md', 'x\n');
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([
      '[harness-shape] FAIL .claude/skills/odd/SKILL.md: is a folder, not a file — a skill loads from one SKILL.md file',
    ]);
  });

  it('fails a folder in place of an agent, a rule or a workflow, naming the folder', async () => {
    harnessTree(sb);
    sb.write('.claude/agents/nested/a.md', 'x\n');
    sb.write('.claude/rules/nested/r.md', 'x\n');
    sb.write('.claude/workflows/nested/w.mjs', 'x\n');
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      '[harness-shape] FAIL .claude/agents/nested: an entry of .claude/agents/ is one .md file, not a folder',
      '[harness-shape] FAIL .claude/rules/nested: an entry of .claude/rules/ is one .md file, not a folder',
      '[harness-shape] FAIL .claude/workflows/nested: an entry of .claude/workflows/ is one .mjs file, not a folder',
    ]);
  });

  it('fails a file of an unlisted extension, and counts a workflow of its own as another file', async () => {
    harnessTree(sb);
    sb.write('.claude/rules/notes.txt', 'x\n');
    sb.write('.claude/workflows/batch.js', 'x\n');
    sb.write('.claude/workflows/batch.mjs', 'export {};\n');
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      '[harness-shape] FAIL .claude/rules/notes.txt: only .md files belong in .claude/rules/',
      '[harness-shape] FAIL .claude/workflows/batch.js: only .mjs files belong in .claude/workflows/',
    ]);
    sb.rm('.claude/rules/notes.txt');
    sb.rm('.claude/workflows/batch.js');
    const clean = await sb.run(spec);
    expectPass(clean);
    expect(clean.out).toContain('5 folders under .claude/, all listed');
    expect(clean.out).toContain('and 1 other file in shape');
  });
});

describe('skills (self-check-C3)', () => {
  const one = async (): Promise<string[]> => findings((await sb.run(spec)).err);

  it('names the skill whose description has neither a trigger nor a boundary, in one finding at its line', async () => {
    harnessTree(sb);
    sb.write(SKILL, skillText('widget', 'Does the widget job.'));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${SKILL}:3: its description says neither when to use it ("Use when …") nor what it is not for ("Not for …") — without a trigger nothing loads it`,
    ]);
  });

  it('names the missing half when a description has only one of them', async () => {
    harnessTree(sb);
    sb.write(SKILL, skillText('widget', 'Does the widget job. Use when a widget needs it.'));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${SKILL}:3: its description says when to use it but not what it is not for — add a "Not for …" boundary`,
    ]);
    sb.write(SKILL, skillText('widget', 'Does the widget job. Not for gadgets.'));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${SKILL}:3: its description says what it is not for but not when to use it — add a "Use when …" trigger`,
    ]);
  });

  it('fails a skill with no name, a name that is not its folder, or no description', async () => {
    harnessTree(sb);
    sb.write(SKILL, skillText('widget').replace('name: widget\n', ''));
    expect(await one()).toEqual([`[harness-shape] FAIL ${SKILL}: has no name in its frontmatter — a skill registers under its name`]);
    sb.write(SKILL, skillText('gadget'));
    expect(await one()).toEqual([`[harness-shape] FAIL ${SKILL}:2: declares name: gadget but lives in widget/ — the two must agree`]);
    sb.write(SKILL, skillText('widget').replace(/description: .*\n/, ''));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${SKILL}: has no description in its frontmatter — a skill loads when a task matches its description`,
    ]);
  });

  it('fails a body with no numbered steps and no "Done means" list, one finding each', async () => {
    harnessTree(sb);
    sb.write(SKILL, '---\nname: widget\ndescription: Use when needed. Not for gadgets.\n---\n\n# widget\n\nJust prose.\n');
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${SKILL}: has no numbered steps — write the procedure as numbered steps, one command or decision each`,
      `[harness-shape] FAIL ${SKILL}: does not end with a "Done means" list — close with conditions a reader can check`,
    ]);
  });

  it('fails a body that opens with a step, at that step’s line', async () => {
    harnessTree(sb);
    sb.write(SKILL, skillText('widget').replace('What goes wrong without it, in one line.\n\n', ''));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${SKILL}:8: opens with a step — state the gap first: what goes wrong without this skill`,
    ]);
  });

  it('fails "Done means" that is not last, or holds no list', async () => {
    harnessTree(sb);
    sb.write(SKILL, `${skillText('widget')}\n## Afterwards\n\nMore.\n`);
    expect(await one()).toEqual([`[harness-shape] FAIL ${SKILL}: "Done means" is not its last section — the done conditions close the skill`]);
    sb.write(SKILL, skillText('widget').replace('- The check passes.\n', 'The check passes.\n'));
    expect(await one()).toEqual([`[harness-shape] FAIL ${SKILL}: "Done means" holds no list — one checkable condition per item`]);
  });

  it('names a folded description as a value the frontmatter reader cannot take, not as a missing trigger', async () => {
    harnessTree(sb);
    sb.write(SKILL, skillText('widget', '>-\n  Does the widget job. Use when a widget needs it.\n  Not for gadgets.'));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${SKILL}:3: its description is a YAML block scalar (>-) — write it on one line: the repo's one frontmatter reader, scripts/fm-json.sh, takes single-line values`,
    ]);
  });

  it('reads a skill with no frontmatter as one with no name and no description', async () => {
    harnessTree(sb);
    sb.write(SKILL, '# widget\n\nNo frontmatter at all.\n');
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${SKILL}: has no name in its frontmatter — a skill registers under its name`,
      `[harness-shape] FAIL ${SKILL}: has no description in its frontmatter — a skill loads when a task matches its description`,
    ]);
  });
});

describe('description size (the harness listing budget)', () => {
  const one = async (): Promise<string[]> => findings((await sb.run(spec)).err);
  /** A quoted description of exactly `n` characters holding a trigger and a boundary. */
  const sized = (n: number): string => {
    const head = 'Use when needed. Not for gadgets. ';
    return `"${head}${'x'.repeat(n - head.length)}"`;
  };

  it('passes a description at the cap and fails one a character over, naming the count and the cap', async () => {
    harnessTree(sb);
    sb.write(SKILL, skillText('widget', sized(DESCRIPTION_CAP)));
    expect(await one()).toEqual([]);
    sb.write(SKILL, skillText('widget', sized(DESCRIPTION_CAP + 1)));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${SKILL}:3: its description is ${DESCRIPTION_CAP + 1} characters, over the cap of ${DESCRIPTION_CAP} — the harness lists descriptions from a shared budget and drops what does not fit; cut it to the job, a "Use when …" trigger and a "Not for …" boundary`,
    ]);
  });

  it('counts the value without its quotes', () => {
    expect(descriptionLength('abc')).toBe(3);
    expect(DESCRIPTION_CAP).toBe(350);
  });

  it('fails all the skills together over the budget, naming the total, and passes at it', async () => {
    harnessTree(sb);
    // 46 skills at the cap, plus the fixture's own, leave room for one more of a few hundred characters.
    for (let i = 0; i < 46; i += 1) sb.write(`.claude/skills/skill${i}/SKILL.md`, skillText(`skill${i}`, sized(DESCRIPTION_CAP)));
    const widget = (skillText('widget').match(/description: (.*)\n/)?.[1] as string).length;
    const room = DESCRIPTIONS_BUDGET - (46 * DESCRIPTION_CAP + widget);
    expect(room).toBeGreaterThan(100);
    expect(room).toBeLessThan(DESCRIPTION_CAP);

    sb.write('.claude/skills/extra/SKILL.md', skillText('extra', sized(room)));
    expect(await one()).toEqual([]);

    sb.write('.claude/skills/extra/SKILL.md', skillText('extra', sized(room + 1)));
    expect(await one()).toEqual([
      `[harness-shape] FAIL .claude/skills: the skill descriptions hold ${DESCRIPTIONS_BUDGET + 1} characters together, over the budget of ${DESCRIPTIONS_BUDGET} — the harness drops the descriptions past its listing budget, so those skills are never offered; shorten the longest`,
    ]);
  });
});

describe('description quoting (strict YAML)', () => {
  const one = async (): Promise<string[]> => findings((await sb.run(spec)).err);
  const BAD = 'Does the job: fast. Use when needed. Not for gadgets.';

  it('fails an unquoted skill description holding a colon and a space, at its line', async () => {
    harnessTree(sb);
    sb.write(SKILL, skillText('widget', BAD));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${SKILL}:3: its description is not a quoted string and contains ": " — strict YAML reads that as a nested mapping; wrap the whole value in double quotes`,
    ]);
  });

  it('passes the same text double-quoted, a colon without a space, and a colon inside single quotes', async () => {
    harnessTree(sb);
    sb.write(SKILL, skillText('widget', `"${BAD}"`));
    expect(await one()).toEqual([]);
    sb.write(SKILL, skillText('widget', 'Does the job:fast. Use when needed. Not for gadgets.'));
    expect(await one()).toEqual([]);
    sb.write(SKILL, skillText('widget', `'${BAD}'`));
    expect(await one()).toEqual([]);
  });

  it('holds an agent description to the same rule', async () => {
    harnessTree(sb);
    sb.write(CLAIM, verifierText('claim-audit').replace(/description: ".*"\n/, `description: ${BAD}\n`));
    const got = await one();
    expect(got).toHaveLength(1);
    expect(got[0]).toContain(`${CLAIM}:3: its description is not a quoted string and contains ": "`);
  });

  it('descriptionQuoting and rawFrontmatterValue read the value as written', () => {
    expect(descriptionQuoting('a: b')).not.toBeNull();
    expect(descriptionQuoting('"a: b"')).toBeNull();
    expect(descriptionQuoting('>-')).toBeNull();
    expect(descriptionQuoting('plain words')).toBeNull();
    expect(descriptionQuoting(null)).toBeNull();
    expect(rawFrontmatterValue('---\nname: x\ndescription:  "a: b" \n---\ndescription: no\n', 'description')).toBe('"a: b"');
    expect(rawFrontmatterValue('---\nname: x\n---\n', 'description')).toBeNull();
    expect(rawFrontmatterValue('no frontmatter\n', 'description')).toBeNull();
  });
});

describe('page citations (.md#, not .html#)', () => {
  const one = async (): Promise<string[]> => findings((await sb.run(spec)).err);
  const withBody = (line: string): string => skillText('widget').replace('What goes wrong without it, in one line.', line);

  it('fails a skill body citing <page>.html#<id>, at the line, naming the token', async () => {
    harnessTree(sb);
    sb.write(SKILL, withBody('Cite `patterns/caching/cache-aside.html#usage` for the claim.'));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${SKILL}:8: cites patterns/caching/cache-aside.html#usage — a page is markdown now, so cite an element as <page>.md#<id>; only a site/… path or a file:// URL may name a built .html page`,
    ]);
  });

  it('fails an agent body citing .html#, and passes the .md form', async () => {
    harnessTree(sb);
    sb.write(CLAIM, `${verifierText('claim-audit')}\nCite hazards/cache-stampede.html#causes.\n`);
    const got = await one();
    expect(got).toHaveLength(1);
    expect(got[0]).toContain(`${CLAIM}:`);
    expect(got[0]).toContain('cites hazards/cache-stampede.html#causes');
    sb.write(CLAIM, `${verifierText('claim-audit')}\nCite hazards/cache-stampede.md#causes.\n`);
    expect(await one()).toEqual([]);
  });

  it('passes a site/ path and a file:// URL, which name built pages, and a fenced example', async () => {
    harnessTree(sb);
    sb.write(SKILL, withBody('Hand over site/dist/patterns/x.html#usage or file:///repo/site/dist/x.html#usage.\n\n```\nold/x.html#a\n```'));
    expect(await one()).toEqual([]);
  });

  it('passes an .html path with no fragment, which a description of a built-page input may name', async () => {
    harnessTree(sb);
    sb.write(SKILL, skillText('widget', '"Review a `site/dist/**.html` URL. Use when handed one. Not for gadgets."'));
    expect(await one()).toEqual([]);
    sb.write(SKILL, withBody('Read site/dist/<page>.html with the browser.'));
    expect(await one()).toEqual([]);
  });

  it('htmlCitations lists each token with its line, skipping the exempt forms and the frontmatter', () => {
    const text = '---\nname: x\ndescription: "see a.html#b"\n---\nA: p/q.html#r and site/x.html#y\nB: file://x/z.html#w\n';
    expect(htmlCitations(text)).toEqual([{ token: 'p/q.html#r', line: 5 }]);
  });
});

describe('skillBody', () => {
  const body = (s: string): ReturnType<typeof skillBody> => skillBody(`---\nname: x\n---\n${s}`);

  it('counts numbered headings and top-level numbered items as steps, from the first one', () => {
    expect(body('# x\n\nThe gap.\n\n## 1. First\n\n## 2) Second\n\n3. Third\n\n## Done means\n\n- ok\n')).toEqual({
      steps: 3,
      firstStep: 8,
      gap: true,
      done: 'ok',
    });
  });

  it('does not count a numbered H1, an indented item, a fenced line or a condition under "Done means"', () => {
    expect(body('# 1. Title\n\nThe gap.\n\n   1. indented\n\n```\n1. fenced\n```\n\n## Done means\n\n1. a condition\n## 2. after done\n')).toEqual({
      steps: 0,
      firstStep: null,
      gap: true,
      done: 'not-last',
    });
  });

  it('takes "Done means" at level two or three only', () => {
    expect(body('Gap.\n\n1. Step.\n\n### Done means\n\n* ok\n').done).toBe('ok');
    expect(body('Gap.\n\n1. Step.\n\n# Done means\n\n- ok\n').done).toBe('missing');
    expect(body('Gap.\n\n1. Step.\n\n#### Done means\n\n- ok\n').done).toBe('missing');
  });

  it('blanks the frontmatter only when it closes', () => {
    expect(bodyLines('---\nname: x\n---\nbody')).toEqual(['', '', '', 'body']);
    expect(bodyLines('---\nname: x\nbody')).toEqual(['---', 'name: x', 'body']);
    expect(bodyLines('body')).toEqual(['body']);
  });
});

describe('descriptionGap', () => {
  it('needs "Use when" as written and "not for" in any case', () => {
    expect(descriptionGap('Use when x. Not for y.')).toBeNull();
    expect(descriptionGap('Use when x, and not for y.')).toBeNull();
    expect(descriptionGap('use when x. Not for y.')).toMatch(/not when to use it/);
    expect(descriptionGap('Use whenever x. Not for y.')).toMatch(/not when to use it/);
  });

  it('descriptionProblem names every block-scalar marker, and otherwise defers to the gap', () => {
    for (const marker of ['|', '>', '|-', '>-', '>+', '|2', ' >- ']) {
      expect(descriptionProblem(marker), marker).toMatch(/^its description is a YAML block scalar \([|>][-+\d]*\) — write it on one line/);
    }
    expect(descriptionProblem('Use when x. Not for y.')).toBeNull();
    expect(descriptionProblem('> quoted, then Use when x. Not for y.')).toBeNull();
    expect(descriptionProblem('Does x.')).toBe(descriptionGap('Does x.'));
  });
});

describe('agents (skills-and-agents-C4, -C5, -C9)', () => {
  const one = async (): Promise<string[]> => findings((await sb.run(spec)).err);
  const agent = (fm: string, body = '# a\n\n## What you return\n\nOne line.\n'): string => `---\n${fm}\n---\n\n${body}`;
  const helper = '.claude/agents/helper.md';
  const good = 'name: helper\ndescription: "Helps. Use when help is needed. Not for harm."\ntools: ["Read", "Bash"]';

  it('passes a working agent with any tools and a reply section, and a tools list written as a string', async () => {
    harnessTree(sb);
    sb.write(helper, agent(good));
    expectPass(await sb.run(spec));
    sb.write(helper, agent(good.replace('tools: ["Read", "Bash"]', 'tools: Read, Bash')));
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain('3 agents');
  });

  it('fails an agent with no name, a name not its file, no description, or a description with a gap', async () => {
    harnessTree(sb);
    sb.write(helper, agent(good.replace('name: helper\n', '')));
    expect(await one()).toEqual([`[harness-shape] FAIL ${helper}: has no name in its frontmatter — an agent is launched by its name`]);
    sb.write(helper, agent(good.replace('name: helper', 'name: aide')));
    expect(await one()).toEqual([`[harness-shape] FAIL ${helper}:2: declares name: aide but the file is helper.md — the two must agree`]);
    sb.write(helper, agent(good.replace(/description: .*\n/, '')));
    expect(await one()).toEqual([`[harness-shape] FAIL ${helper}: has no description in its frontmatter — say when to launch it and when not`]);
    sb.write(helper, agent(good.replace(' Not for harm.', '')));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${helper}:3: its description says when to use it but not what it is not for — add a "Not for …" boundary`,
    ]);
  });

  it('fails an agent with no tools list, or no reply section', async () => {
    harnessTree(sb);
    sb.write(helper, agent(good.replace('\ntools: ["Read", "Bash"]', '')));
    expect(await one()).toEqual([`[harness-shape] FAIL ${helper}: declares no tools list — name every tool it may use, and no more`]);
    sb.write(helper, agent(good, '# a\n\n## Method\n\nSteps.\n\n# Reply\n\nA level-one heading is the title, not a section.\n\n#### Returns\n\nToo deep.\n'));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${helper}: states no reply shape — give it a section headed as its reply ("## Reply") holding the fixed shape its caller re-checks`,
    ]);
  });

  it('skills-and-agents-O1: the claim verifier holds exactly Read, Glob and Grep; a shell tool is one finding naming it', async () => {
    harnessTree(sb);
    sb.copyRepo(CLAIM, TRIAGE);
    const clean = await sb.run(spec);
    expectPass(clean);

    // The fixture tree the verifier is handed, read back in review: a build
    // file with one target, a page naming a target it lacks on line 3 and an
    // existing path on line 5.
    sb.write('Makefile', 'build:\n\t@true\n');
    sb.write('docs/page.md', '# A page\n\nRun `make deploy` to ship.\n\nThe gate lives in `Makefile`.\n');
    const page = sb.read('docs/page.md').split('\n');
    expect(page[2]).toContain('make deploy');
    expect(sb.read('Makefile')).not.toMatch(/^deploy:/m);
    expect(sb.exists((page[4] as string).match(/`([^`]+)`/)?.[1] as string)).toBe(true);
    // The reply that fixture earns fits the shape the definition states.
    const reply = [
      'docs/page.md:3 — "make deploy" — Makefile:1 defines only build — stale',
      'checked: 2 claims on docs/page.md',
      'untestable: none',
    ];
    const shape = replySection(sb.read(CLAIM)) as string;
    expect(shape).toContain('<page>:<line> — "<claim>" — <what the tree says, citing file:line> — wrong | incomplete | stale');
    expect(reply[0]).toMatch(/^[^:]+:\d+ — "[^"]+" — .+ — (wrong|incomplete|stale)$/);
    expect(reply.slice(1)).toEqual(['checked: 2 claims on docs/page.md', 'untestable: none']);
    expectPass(await sb.run(spec));

    sb.write(CLAIM, sb.read(CLAIM).replace('tools: ["Read", "Glob", "Grep"]', 'tools: ["Read", "Glob", "Grep", "Bash"]'));
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([
      `[harness-shape] FAIL ${CLAIM}:4: the claim verifier declares Read, Glob, Grep, Bash — a verifier holds exactly ${VERIFIER_TOOLS.join(', ')}, so no run can change the tree it reports on`,
    ]);
  });

  it('skills-and-agents-O3: the triage agent states its five answers; deleting that reply is one finding naming it', async () => {
    harnessTree(sb);
    sb.copyRepo(CLAIM, TRIAGE);
    const text = sb.read(TRIAGE);

    // The fixture: the driver's own failure block for a registered gate — the
    // real inbox-cap row, run over an inbox of 21 entries. The driver spawns a
    // row's local_command, so that one field runs this checkout's program by
    // absolute path; every field the block prints is the row's own.
    const real = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/data/gates.json'), 'utf8')) as Registry;
    const row = real.gates.find((g) => g.id === 'inbox-cap') as Gate;
    const program = `node_modules/.bin/tsx ${shellQuote(path.join(REPO_ROOT, 'tools/src/gates/check-inbox.ts'))}`;
    sb.linkRepo('node_modules');
    sb.write('.gitignore', 'node_modules\n');
    sb.write('docs/data/gates.json', `${JSON.stringify({ ...real, gates: [{ ...row, local_command: program }] }, null, 2)}\n`);
    inboxTree(sb, 21);
    const err: string[] = [];
    expect(await drive([], { out: () => undefined, err: (l) => err.push(l) }, sb.dir)).toBe(1);
    const opens = err.findIndex((l) => l.startsWith(`── ${row.name} `));
    const block = err.slice(opens + 1, err.findIndex((l, i) => i > opens && l.startsWith('   more:')) + 1);
    expect(block[0]).toMatch(/^\[inbox-cap\] FAIL docs\/inbox\.md: 21 entries, cap 20/);
    expect(block.slice(-3)).toEqual([`   repro: ${row.command}`, `   fix:   ${row.fix}`, `   more:  ${row.runbook}`]);

    // Read back against the row: the answers that fixture earns, in the shape the definition states.
    const answers = {
      gate: /^\[([\w-]+)\] FAIL /.exec(block[0] as string)?.[1],
      repro: (block.at(-3) as string).replace(/^ {3}repro: /, ''),
      fix: (block.at(-2) as string).replace(/^ {3}fix: {3}/, ''),
      runbook: (block.at(-1) as string).replace(/^ {3}more: {2}/, ''),
    };
    expect(answers).toEqual({ gate: row.id, repro: row.command, fix: row.fix, runbook: row.runbook });
    expect(answers.repro).toBe('make gate G=check-inbox');
    const reply = replySection(text) as string;
    for (const answer of ['**Gate**', '**Protects**', '**Why it is red**', '**Repro**', '**Fix**']) expect(reply).toContain(answer);
    expect(reply).toContain("the driver's run of that one gate alone");
    expect(reply).toContain("the row's `command`");
    expectPass(await sb.run(spec));

    const start = text.indexOf('## Reply');
    sb.write(TRIAGE, text.slice(0, start) + text.slice(text.indexOf('## Boundaries')));
    const r = await sb.run(spec);
    expectFail(r);
    expect(findings(r.err)).toEqual([
      `[harness-shape] FAIL ${TRIAGE}: states no reply shape — give it a section headed as its reply ("## Reply") holding the fixed shape its caller re-checks`,
    ]);
  });

  it('fails a verifier missing a tool, or whose reply section lost part of its shape', async () => {
    harnessTree(sb);
    sb.write(TRIAGE, verifierText('gate-triage').replace('tools: ["Read", "Glob", "Grep"]', 'tools: ["Read", "Grep"]'));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${TRIAGE}:4: the triage agent declares Read, Grep — a verifier holds exactly Read, Glob, Grep, so no run can change the tree it reports on`,
    ]);
    sb.write(TRIAGE, verifierText('gate-triage'));
    sb.write(CLAIM, verifierText('claim-audit').replace('untestable: ', 'unsure: '));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${CLAIM}: its reply section does not close on "checked: <n> claims on <page>" then "untestable:", one line each`,
    ]);
  });

  it('holds the claim verifier’s finding line: the page line, the claim, the tree line it cites and the severity (skills-and-agents-C5)', async () => {
    harnessTree(sb);
    sb.copyRepo(CLAIM, TRIAGE);
    const real = sb.read(CLAIM);
    const line = '<page>:<line> — "<claim>" — <what the tree says, citing file:line> — wrong | incomplete | stale';
    expect(real).toContain(line);
    expectPass(await sb.run(spec));

    sb.write(CLAIM, real.replace(line, 'wrong | incomplete | stale'));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${CLAIM}: its reply section lacks the shape the claim verifier states: "<page>:<line> — "<claim>" —", "citing file:line", "— wrong | incomplete | stale"`,
    ]);
    sb.write(CLAIM, real.replace(line, '<page>:<line> — "<claim>" — <what the tree says> — wrong | incomplete | stale'));
    expect(await one()).toEqual([`[harness-shape] FAIL ${CLAIM}: its reply section lacks the shape the claim verifier states: "citing file:line"`]);
  });

  it('holds the claim verifier to exactly two closing lines and nothing after them (skills-and-agents-C5)', async () => {
    harnessTree(sb);
    sb.copyRepo(CLAIM, TRIAGE);
    const real = sb.read(CLAIM);
    const closing = 'untestable: <the claims you could not decide, or "none">\n';
    expect(real).toContain(closing);

    sb.write(CLAIM, real.replace(closing, `${closing}summary: <anything else you noticed>\n`));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${CLAIM}: its reply section puts a line after "checked: <n> claims on <page>" then "untestable:" — the reply ends on those, with nothing after them`,
    ]);
    sb.write(CLAIM, real.replace(/Then exactly\s+two closing lines, and nothing after them:/, 'Then close:'));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${CLAIM}: its reply section lacks the shape the claim verifier states: "exactly two closing lines"`,
    ]);
  });

  it('closingProblem reads the closing lines in order, on consecutive lines, with only a fence close or a blank after', () => {
    const closing = ['checked: ', 'untestable: '];
    expect(closingProblem('a\nchecked: 2\nuntestable: none', closing)).toBeNull();
    expect(closingProblem('checked: 2\nuntestable: none\n\nMore prose.', closing)).toBeNull();
    expect(closingProblem('```text\n  checked: 2\n  untestable: none\n```\n', closing)).toBeNull();
    expect(closingProblem('untestable: none', closing)).toMatch(/does not close on "checked:" then "untestable:"/);
    expect(closingProblem('checked: 2\nsummary: x\nuntestable: none', closing)).toMatch(/does not close on/);
    expect(closingProblem('checked: 2', closing)).toMatch(/does not close on/);
    expect(closingProblem('checked: 2\nuntestable: none\nsummary: x', closing)).toMatch(/puts a line after/);
  });

  it('fails a harness missing either verifier', async () => {
    harnessTree(sb);
    sb.rm(CLAIM);
    sb.rm(TRIAGE);
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${CLAIM}: is missing — the claim verifier is one of the two read-only verifiers every harness keeps`,
      `[harness-shape] FAIL ${TRIAGE}: is missing — the triage agent is one of the two read-only verifiers every harness keeps`,
    ]);
  });
});

describe('toolsOf and replySection', () => {
  it('reads a list, a string or nothing', () => {
    expect(toolsOf(['Read', ' Grep '])).toEqual(['Read', 'Grep']);
    expect(toolsOf('Read, , Glob')).toEqual(['Read', 'Glob']);
    expect(toolsOf(undefined)).toEqual([]);
  });

  it('reads the reply section down to the next heading at its level, fences included', () => {
    const text = '# a\n\n### Output you return\n\n```text\n## not a heading\n```\n#### Detail\n\nstill in\n\n### Next\n\nout\n';
    expect(replySection(text)).toBe('\n```text\n## not a heading\n```\n#### Detail\n\nstill in\n');
  });
});

describe('rules', () => {
  it('reports what lib/rules.ts finds wrong with a rule', async () => {
    harnessTree(sb);
    sb.write('.claude/rules/widgets.md', '---\npaths: ["widgets/**"]\n---\n\n# Widgets\n');
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      '[harness-shape] FAIL .claude/rules/widgets.md: has no description — say what the rule holds and when it applies',
    ]);
  });
});

describe('hooks (self-check-C5)', () => {
  const one = async (): Promise<string[]> => findings((await sb.run(spec)).err);
  const HOOK = '.claude/hooks/quiet.sh';

  it('fails a hook that is not executable, and runs nothing', async () => {
    harnessTree(sb);
    fs.chmodSync(path.join(sb.dir, HOOK), 0o644);
    expect(await one()).toEqual([`[harness-shape] FAIL ${HOOK}: is not executable — the runtime runs a hook by its path; chmod +x it`]);
  });

  it('fails a hook that exits non-zero, or prints, on an empty or garbage payload', async () => {
    harnessTree(sb);
    writeHook(sb, 'quiet.sh', '#!/usr/bin/env bash\ninput="$(cat)"\n[ -n "$input" ] && exit 3\nexit 0\n');
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${HOOK}: exits 3 on a non-JSON payload — a hook always exits 0, whatever it is handed`,
    ]);
    writeHook(sb, 'quiet.sh', '#!/usr/bin/env bash\ncat > /dev/null\necho "{\\"decision\\":\\"block\\"}"\n');
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${HOOK}: prints on an empty payload — a hook decides nothing on input it cannot read`,
      `[harness-shape] FAIL ${HOOK}: prints on a non-JSON payload — a hook decides nothing on input it cannot read`,
    ]);
  });

  it('runs a hook with the project folder set, from the root', async () => {
    harnessTree(sb);
    writeHook(sb, 'quiet.sh', '#!/usr/bin/env bash\ncat > /dev/null\n[ "$CLAUDE_PROJECT_DIR" = "$PWD" ] || echo wrong\n');
    expectPass(await sb.run(spec));
  });

  it('fails a hook that outlasts its wired timeout, once per payload', async () => {
    harnessTree(sb);
    writeHook(sb, 'quiet.sh', '#!/usr/bin/env bash\ncat > /dev/null\nsleep 5\nexit 0\n');
    const settings = JSON.parse(hookSettings()) as { hooks: { PostToolUse: { hooks: { timeout?: number }[] }[] } };
    (settings.hooks.PostToolUse[0]?.hooks[0] as { timeout?: number }).timeout = 1;
    sb.write(SETTINGS, `${JSON.stringify(settings)}\n`);
    const started = Date.now();
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${HOOK}: does not finish on an empty payload within 1 s — the runtime kills it there; a hook answers input it cannot read at once`,
      `[harness-shape] FAIL ${HOOK}: does not finish on a non-JSON payload within 1 s — the runtime kills it there; a hook answers input it cannot read at once`,
    ]);
    expect(Date.now() - started).toBeLessThan(4500);
  });

  it('hookLimits takes the smallest wired timeout, never above the gate’s own limit', () => {
    expect([...hookLimits(undefined)]).toEqual([]);
    expect([...hookLimits(null)]).toEqual([]);
    expect([...hookLimits({ hooks: [] })]).toEqual([]);
    const settings = {
      hooks: {
        A: 'not a list',
        B: [
          null,
          { hooks: 'x' },
          {
            hooks: [
              null,
              { command: 1, timeout: 1 },
              { command: '.claude/hooks/none.sh' },
              { command: '.claude/hooks/none.sh', timeout: 'soon' },
              { command: '.claude/hooks/none.sh', timeout: 0 },
              { command: '.claude/hooks/a.sh', timeout: 5 },
              { command: '.claude/hooks/big.sh', timeout: 600 },
            ],
          },
        ],
        C: [{ hooks: [{ command: '.claude/hooks/a.sh', timeout: 3 }] }],
      },
    };
    expect(Object.fromEntries(hookLimits(settings))).toEqual({ '.claude/hooks/a.sh': 3, '.claude/hooks/big.sh': HOOK_LIMIT_S });
  });

  it('fails a hook that cannot be run at all', async () => {
    harnessTree(sb);
    writeHook(sb, 'quiet.sh', '#!/nonexistent/interpreter\n');
    const r = await one();
    expect(r).toHaveLength(2);
    expect(r[0]).toMatch(new RegExp(`^\\[harness-shape\\] FAIL ${HOOK}: cannot be run on an empty payload: `));
  });

  it('holds the wiring both ways', async () => {
    harnessTree(sb);
    writeHook(sb, 'loud.sh');
    sb.write(SETTINGS, hookSettings(['quiet.sh', 'gone.sh']));
    expect(await one()).toEqual([
      `[harness-shape] FAIL ${SETTINGS}: wires .claude/hooks/gone.sh, which is not a hook in .claude/hooks/`,
      '[harness-shape] FAIL .claude/hooks/loud.sh: is wired to no event in .claude/settings.json — a hook nothing runs is dead code',
    ]);
  });

  it('fails hooks with no settings file, and a settings file that is not JSON', async () => {
    harnessTree(sb);
    sb.rm(SETTINGS);
    expect(await one()).toEqual([`[harness-shape] FAIL ${SETTINGS}: is missing — every hook under .claude/hooks/ is wired to its event here`]);
    sb.write(SETTINGS, '{ not json');
    expect(await one()).toEqual([`[harness-shape] FAIL ${SETTINGS}: is not valid JSON`]);
  });

  it('needs no settings file when there is no hook, and holds one that is there', async () => {
    harnessTree(sb);
    sb.rm('.claude/hooks');
    sb.rm(SETTINGS);
    expectPass(await sb.run(spec));
    sb.write(SETTINGS, hookSettings(['gone.sh']));
    expect(await one()).toEqual([`[harness-shape] FAIL ${SETTINGS}: wires .claude/hooks/gone.sh, which is not a hook in .claude/hooks/`]);
  });

  it('wiredHooks reads only well-formed hook commands naming a hook file', () => {
    expect([...wiredHooks(null)]).toEqual([]);
    expect([...wiredHooks({})]).toEqual([]);
    expect([...wiredHooks({ hooks: null })]).toEqual([]);
    expect([...wiredHooks({ hooks: [] })]).toEqual([]);
    const settings = {
      hooks: {
        A: 'not a list',
        B: [null, { hooks: 'x' }, { hooks: [null, { command: 1 }, { command: 'echo hi' }, { command: 'bash .claude/hooks/a.sh && .claude/hooks/b.sh' }] }],
        C: [{ hooks: [{ command: '.claude/hooks/a.sh' }] }],
      },
    };
    expect([...wiredHooks(settings)].sort()).toEqual(['.claude/hooks/a.sh', '.claude/hooks/b.sh']);
  });
});

describe('the allowlist', () => {
  const entry = { name: 'widget', match: SKILL, reason: 'reshaped in the next batch', owner: 'Oleksandr Derechei', since: '2026-09-24' };

  it('excuses a named skill’s description and body findings, and counts it', async () => {
    harnessTree(sb);
    sb.write(SKILL, '---\nname: widget\ndescription: Does things.\n---\n\n# widget\n\nProse only.\n');
    sb.write(ALLOWLIST, allowlistJson([entry]));
    const r = await sb.run(spec);
    expectPass(r);
    expect(r.out).toContain(`1 skill (1 excused by ${ALLOWLIST})`);
  });

  it('never excuses a missing name', async () => {
    harnessTree(sb);
    sb.write(SKILL, '---\ndescription: Does things.\n---\n\n# widget\n');
    sb.write(ALLOWLIST, allowlistJson([entry]));
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([`[harness-shape] FAIL ${SKILL}: has no name in its frontmatter — a skill registers under its name`]);
  });

  it('fails an entry that excuses nothing, once the skill is in shape', async () => {
    harnessTree(sb);
    sb.write(ALLOWLIST, allowlistJson([entry]));
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      `[harness-shape] FAIL ${ALLOWLIST}: entry "widget" excuses nothing — ${SKILL} is in shape or gone; delete the entry`,
    ]);
  });

  it('withholds a malformed list whole, so its skill’s findings stand', async () => {
    harnessTree(sb);
    sb.write(SKILL, skillText('widget', 'Does things.'));
    sb.write(ALLOWLIST, allowlistJson([{ ...entry, reason: ' ' }]));
    const r = await sb.run(spec);
    expect(findings(r.err)).toEqual([
      `[harness-shape] FAIL ${ALLOWLIST}: entry "widget" has an empty reason — say why the skill keeps its old shape, and which change reshapes it`,
      `[harness-shape] FAIL ${SKILL}:3: its description says neither when to use it ("Use when …") nor what it is not for ("Not for …") — without a trigger nothing loads it`,
    ]);
  });

  it('fails a missing list', async () => {
    harnessTree(sb);
    sb.rm(ALLOWLIST);
    expectFail(await sb.run(spec), `${ALLOWLIST}: is missing — the harness-shape gate reads the skills it excuses from here`);
  });
});

describe('misuse', () => {
  it('takes no argument, flag or path, and writes nothing', async () => {
    harnessTree(sb);
    const before = sb.snapshot();
    expectMisuse(await sb.run(spec, ['--nope']));
    expectMisuse(await sb.run(spec, ['.claude']));
    expectMisuse(await sb.run(spec, ['--fix']));
    expect(sb.snapshot()).toEqual(before);
  });
});

describe('the real harness', () => {
  /** A plainer count: every folder under .claude/skills/ holding a SKILL.md, every .md agent, rule and .sh hook. */
  const count = (dir: string, keep: (name: string) => boolean): number =>
    fs.readdirSync(path.join(REPO_ROOT, '.claude', dir)).filter(keep).length;

  it('passes where it really runs, counting above zero what a plain walk counts (self-check-C9)', async () => {
    const skills = count('skills', (n) => fs.existsSync(path.join(REPO_ROOT, '.claude/skills', n, 'SKILL.md')));
    const agents = count('agents', (n) => n.endsWith('.md'));
    const rules = count('rules', (n) => n.endsWith('.md'));
    const hooks = count('hooks', (n) => n.endsWith('.sh'));
    const excused = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ALLOWLIST), 'utf8')) as { entries: unknown[] }).entries.length;
    const r = await capture(spec, [], REPO_ROOT);
    expect(r.err).toBe('');
    expectPass(r);
    expect(skills).toBeGreaterThan(0);
    expect(r.out).toContain(`${skills} skills (${excused} excused by ${ALLOWLIST}), ${agents} agents, ${rules} rules, ${hooks} hooks`);
  });

  it('keeps every hook’s executable bit set', () => {
    for (const f of fs.readdirSync(path.join(REPO_ROOT, '.claude/hooks'))) {
      expect(fs.statSync(path.join(REPO_ROOT, '.claude/hooks', f)).mode & 0o111, f).not.toBe(0);
    }
  });

  it('lists every folder under .claude/ in the one list both gates read (self-check-C2)', () => {
    const present = fs
      .readdirSync(path.join(REPO_ROOT, '.claude'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name);
    for (const name of present) expect(Object.keys(CLAUDE_DIRS), name).toContain(name);
    const routes = fs.readFileSync(path.join(REPO_ROOT, 'tools/src/gates/check-harness-routes.ts'), 'utf8');
    expect(routes).toContain("import { CLAUDE, CLAUDE_DIRS, claudeDirs } from './check-harness.js';");
    expect(routes).not.toMatch(/\bagents:\s*\{/);
  });

  it('keeps the truth sweep on one fixed cadence whose only step calls the sweep skill by name (truth-sweep-C8)', () => {
    const wf = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/docs-sweep.yml'), 'utf8');
    expect(wf.match(/^\s*- cron: /gm)).toHaveLength(1);
    expect(wf.match(/^\s*- name: /gm)).toHaveLength(1);
    expect(wf).toContain('docs-sweep skill');
    expect(fs.existsSync(path.join(REPO_ROOT, '.claude/skills/docs-sweep/SKILL.md'))).toBe(true);
  });
});
