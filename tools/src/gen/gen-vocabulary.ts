/**
 * Render docs/reference/glossary.md whole from docs/data/glossary.json (spec:
 * kb.data.glossary, reference-page). The data file is the single source; the
 * page is a stamped, committed output, so it reads on GitHub with no build and
 * review sees a wording change as a diff.
 *
 * One block per term, anchored on its id, under the heading of its scope:
 * a Say line (the term and its also-fine words), a Don't say line carrying the
 * opt-out marker so the page passes the ban gate it documents (glossary-C8),
 * a Why line (the definition) and the owner with the related terms, linked by
 * id. Terms keep the data file's order within their scope. A glossary with a
 * fault the ban gate names renders nothing: the page is never built from data
 * that gate would refuse.
 *
 * Usage: gen-vocabulary            (rewrites docs/reference/glossary.md)
 *        gen-vocabulary --check    (exit 1 if the page is stale)
 */

import fs from 'node:fs';
import path from 'node:path';

import { dataFindings, MARKER } from '../gates/check-vocabulary.js';
import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { emit, fileStamp } from '../lib/generated.js';
import { escapeMdText } from '../lib/md-text.js';

export const SRC = 'docs/data/glossary.json';
export const OUT = 'docs/reference/glossary.md';
export const GENERATOR = 'tools/src/gen/gen-vocabulary.ts';
/** The repair a stale page names. */
export const FIX = 'make glossary';

interface Term {
  id: string;
  term: string;
  definition: string;
  aliases: string[];
  avoid: string[];
  scope: string;
  owner: string;
  see: string[];
}

interface Glossary {
  scopes: Record<string, string>;
  terms: Term[];
}

/** A table cell: the one character that can break one is the column divider. */
const cell = (s: string): string => s.replace(/\|/g, '\\|');

/** A scope's heading: its key, first letter raised. */
export const scopeTitle = (scope: string): string => scope.charAt(0).toUpperCase() + scope.slice(1);

const words = (xs: readonly string[]): string => xs.map((x) => escapeMdText(x)).join(' · ');

export function render(data: Glossary): string {
  const names = new Map(data.terms.map((t) => [t.id, t.term]));
  const banned = data.terms.reduce((n, t) => n + t.avoid.length, 0);
  const out: string[] = [
    '---',
    'title: Glossary',
    'description: One word per idea — the names the pages give their own parts, and the plain words the prose writes in place of the banned ones.',
    'area: reference',
    'owner: Oleksandr Derechei',
    'tags: [testing, readability]',
    'status: stable',
    `source: ${SRC}`,
    '---',
    '',
    fileStamp(GENERATOR, SRC),
    '',
    '# Glossary',
    '',
    `One word per idea, and one place to change it: ${String(data.terms.length)} terms, ${String(banned)} banned phrasings.`,
    '',
    `This page is built from [\`glossary.json\`](../data/glossary.json): to change a word, edit the data`,
    `file and run \`${FIX}\`. **Glossary reference in sync** fails when the page and the data disagree.`,
    '',
    "Every phrasing under **Don't say** fails **Vocabulary bans** on any prose line of any markdown file",
    'git lists — never inside code, a fence or a link target, nor in the `solves` and `aliases` a page',
    `keeps in other people's words. A line that must name one, as this page does, carries \`${MARKER}\`.`,
    '',
    '## Who decides a word',
    '',
    '| Scope | Who decides |',
    '| --- | --- |',
    ...Object.entries(data.scopes).map(([k, v]) => `| [${scopeTitle(k)}](#${k}) | ${cell(v)} |`),
    '',
  ];

  for (const scope of Object.keys(data.scopes)) {
    const terms = data.terms.filter((t) => t.scope === scope);
    if (terms.length === 0) continue;
    out.push(`## <a id="${scope}"></a>${scopeTitle(scope)}`, '');
    for (const t of terms) {
      out.push(`### <a id="${t.id}"></a>${escapeMdText(t.term)}`, '');
      out.push(t.aliases.length > 0 ? `- **Say:** ${escapeMdText(t.term)} — also fine: ${words(t.aliases)}` : `- **Say:** ${escapeMdText(t.term)}`);
      if (t.avoid.length > 0) out.push(`- **Don't say:** ${words(t.avoid)} ${MARKER}`);
      out.push(`- **Why:** ${t.definition}`);
      const see = t.see.map((id) => `[${escapeMdText(names.get(id) as string)}](#${id})`).join(' · ');
      out.push(see === '' ? `- **Owner:** ${t.owner}` : `- **Owner:** ${t.owner} · **See:** ${see}`);
      out.push('');
    }
  }

  out.push(
    '## Next steps',
    '',
    'When the vocabulary gate fails a line, the triage page says what to do.',
    '',
    '- [Triage a red gate](triage.md#vocabulary-bans) — what a banned-phrasing finding means and how to clear it.',
    '',
  );
  return `${out.join('\n')}`;
}

export const spec: GateSpec = {
  name: 'glossary-fresh',
  usage: 'usage: gen-vocabulary [--check]   (--check exits 1 if docs/reference/glossary.md is stale)',
  flags: ['--check'],
  run(ctx: GateContext): string {
    const src = path.join(ctx.root, SRC);
    if (!fs.existsSync(src)) {
      ctx.fail(SRC, 'is missing — the glossary page is rendered from it (restore it from git)');
      return '';
    }
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(src, 'utf8'));
    } catch {
      ctx.fail(SRC, 'is not valid JSON');
      return '';
    }
    const faults = dataFindings(data);
    if (faults.length > 0) {
      for (const what of faults) ctx.fail(SRC, what);
      return '';
    }
    const glossary = data as Glossary;
    const result = emit(ctx, {
      out: OUT,
      wanted: render(glossary),
      fixCommand: FIX,
      stamp: fileStamp(GENERATOR, SRC),
    });
    if (ctx.flags.has('--check')) return `[glossary-fresh] ${OUT} is in sync with ${SRC} (${String(glossary.terms.length)} terms)`;
    // The shape every generator's summary shares: `wrote <n> of <m> …`.
    if (result === 'wrote') return `[glossary-fresh] wrote 1 of 1 file: ${OUT} (${String(glossary.terms.length)} terms)`;
    if (result === 'skipped') return `[glossary-fresh] left ${OUT} alone: it does not carry this generator's stamp`;
    return `[glossary-fresh] wrote 0 of 1 file: ${OUT} already matches ${SRC}`;
  },
};

main(spec, import.meta.url);
