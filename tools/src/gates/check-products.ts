/**
 * The product registry gate, offline half (KB extension; the HTML-era
 * `scripts/audit-products.mjs` without `--online`): docs/data/products.json
 * against the mapping tables of the capability pages under docs/capabilities/.
 *
 * The registry is the one place the site keeps an external URL, and nothing
 * else looks at those URLs, so three things fail:
 *
 *   an entry no mapping cell in its own provider's column says — nothing
 *   renders it, so nobody checks it; the finding says when the name appears
 *   only in another provider's column, because that entry would send a reader
 *   to the wrong cloud's documentation;
 *   a URL that is not https;
 *   a URL that points at a bare homepage rather than at documentation. A path
 *   past `/` satisfies the rule, and so does a documentation host
 *   (`docs.`, `doc.`, `learn.`, `nightlies.`, `*.readthedocs.io`), because
 *   many projects put their docs at the root of one.
 *
 * A cell fragment that names no registered product is a worklist, not a
 * finding — whether a fragment is a product name is a judgement — so the
 * summary counts them and `--worklist` lists them on stderr.
 *
 * Whether each URL still answers is the online half, `--online` (`make
 * products`): after the offline checks pass, every URL is fetched, a HEAD
 * first and a GET when the host refuses HEAD, redirects followed, a few at a
 * time, each with a time limit. An answer of 400 or above, or none, is a
 * finding naming the entry. It needs the network, so it never runs in `make
 * validate` or CI: vendors move pages without notice, and a gate that fails
 * on somebody else's outage would be switched off. Run it by hand before a
 * release, or after editing the registry.
 *
 * Usage: check-products [--worklist] [--online]
 */

import fs from 'node:fs';
import path from 'node:path';

import { main, type GateContext, type GateSpec } from '../lib/gate.js';
import { deriveElements, parseKb } from '../lib/kb-attrs.js';

export const SRC = 'docs/data/products.json';
export const PAGES = 'docs/capabilities';
/** The block a capability page keeps its cross-cloud table in. */
export const MAPPING = 'mapping';

/** What a mapping cell says that is not a product: the worklist leaves these out. */
const NOT_A_PRODUCT =
  /^(no (direct|first-party)|nothing\b|instance type$|VM size$|machine type$|subnet\b|route tables$|user-defined routes$|routes$|security group$|network security group$|firewall rules$|network ACL$)/i;

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Does `cell` say `name` whole — not inside a longer word? The site build links by the same rule. */
export function mentions(cell: string, name: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRe(name)}(?![A-Za-z0-9])`).test(cell);
}

/** Why a URL is not a documentation link, or null when it is one. */
export function urlProblem(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `has an unparseable URL: ${url}`;
  }
  if (parsed.protocol !== 'https:') return `is not https: ${url}`;
  const hasPath = parsed.pathname.replace(/\/+$/, '') !== '';
  const docsHost = /^(docs|doc|learn|nightlies)\./.test(parsed.hostname) || /\.readthedocs\.io$/.test(parsed.hostname);
  return hasPath || docsHost ? null : `points at a bare homepage rather than documentation: ${url}`;
}

/** How long one URL may take to answer, in milliseconds. */
export const FETCH_TIMEOUT = 15_000;

/** How many URLs are fetched at once: few, so no vendor sees a burst. */
export const FETCH_AT_ONCE = 6;

/** A HEAD answer that means the host takes no HEAD, so a GET decides. */
const NO_HEAD = new Set([403, 405, 501]);

/**
 * What one URL answers: its final status after redirects, or the reason it
 * gave none. A host that refuses HEAD is asked again with GET.
 */
export async function answerOf(url: string, fetchImpl: typeof fetch = fetch): Promise<{ status: number } | { error: string }> {
  const ask = async (method: 'HEAD' | 'GET'): Promise<number> => {
    const res = await fetchImpl(url, { method, redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (method === 'GET') await res.body?.cancel();
    return res.status;
  };
  try {
    const head = await ask('HEAD');
    return { status: NO_HEAD.has(head) ? await ask('GET') : head };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Run `work` over `items`, at most `limit` at a time, keeping their order in the results. */
export async function pooled<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await work(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return out;
}

/** The line of a product's entry in the registry text, when it can be found. */
export function entryLine(text: string, provider: string, name: string): number | undefined {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim().startsWith(`${JSON.stringify(provider)}: {`));
  if (start === -1) return undefined;
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = (lines[i] as string).trim();
    if (l.startsWith('}')) return undefined;
    if (l.startsWith(`${JSON.stringify(name)}:`)) return i + 1;
  }
  return undefined;
}

interface Registry {
  readonly columns: readonly string[];
  readonly products: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** The registry, or null after one finding naming what is wrong with its shape. */
function readRegistry(ctx: GateContext): { reg: Registry; text: string } | null {
  const abs = path.join(ctx.root, SRC);
  if (!fs.existsSync(abs)) {
    ctx.fail(SRC, 'is missing — the vendor documentation links are read from it (restore it from git)');
    return null;
  }
  const text = fs.readFileSync(abs, 'utf8');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    ctx.fail(SRC, 'is not valid JSON');
    return null;
  }
  const d = (data ?? {}) as Record<string, unknown>;
  const columns = d['columns'];
  const products = d['products'];
  if (!Array.isArray(columns) || !columns.every((c) => typeof c === 'string')) {
    ctx.fail(SRC, '`columns` is missing or is not a list of provider ids');
    return null;
  }
  if (products === null || typeof products !== 'object' || Array.isArray(products)) {
    ctx.fail(SRC, '`products` is missing or is not an object keyed by provider');
    return null;
  }
  let ok = true;
  for (const [provider, names] of Object.entries(products as Record<string, unknown>)) {
    const entries = names !== null && typeof names === 'object' && !Array.isArray(names) ? Object.values(names) : null;
    if (!columns.includes(provider)) {
      ctx.fail(SRC, `products has provider "${provider}", which is not one of the columns`);
      ok = false;
    } else if (entries === null || !entries.every((u) => typeof u === 'string')) {
      ctx.fail(SRC, `products "${provider}" is not an object of name to URL`);
      ok = false;
    }
  }
  return ok ? { reg: { columns: columns as string[], products: products as Registry['products'] }, text } : null;
}

/** Every mapping cell, by provider column, from every capability page. */
function cellsByProvider(ctx: GateContext, columns: readonly string[]): { said: Map<string, string[]>; pages: number } {
  const said = new Map<string, string[]>(columns.map((c) => [c, []]));
  const dir = path.join(ctx.root, PAGES);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');
    for (const row of deriveElements(parseKb(body).tree)) {
      if (row.kind !== 'row' || row.block !== MAPPING || row.header === true) continue;
      // Cell 0 is the capability; the rest follow the registry's columns, in order.
      row.text.split(' | ').slice(1).forEach((cell, i) => {
        const provider = columns[i];
        if (provider !== undefined) (said.get(provider) as string[]).push(cell.trim());
      });
    }
  }
  return { said, pages: files.length };
}

export const spec: GateSpec = {
  name: 'products',
  usage:
    'usage: check-products [--worklist] [--online]   (--worklist lists the mapping-cell fragments no entry names; ' +
    '--online fetches every URL, which make products runs)',
  flags: ['--worklist', '--online'],
  async run(ctx: GateContext): Promise<string> {
    const read = readRegistry(ctx);
    if (read === null) return '';
    const { reg, text } = read;
    const { said, pages } = cellsByProvider(ctx, reg.columns);
    if (pages === 0) {
      ctx.failLine(`no capability page under ${PAGES}/ — the registry has nothing to be held to`);
      return '';
    }

    let entries = 0;
    for (const provider of reg.columns) {
      for (const [name, url] of Object.entries(reg.products[provider] ?? {})) {
        entries += 1;
        const line = entryLine(text, provider, name);
        const here = (said.get(provider) as string[]).some((cell) => mentions(cell, name));
        if (!here) {
          const elsewhere = reg.columns.filter((p) => p !== provider && (said.get(p) as string[]).some((cell) => mentions(cell, name)));
          ctx.fail(
            SRC,
            elsewhere.length > 0
              ? `${provider} "${name}" appears only in the ${elsewhere.join(', ')} column — it would send readers to the wrong provider's docs; move it`
              : `${provider} "${name}" is registered but no mapping cell in its column says it — nothing renders this URL; delete it`,
            line,
          );
        }
        const problem = urlProblem(url);
        if (problem !== null) ctx.fail(SRC, `${provider} "${name}" ${problem}`, line);
      }
    }

    // The worklist: fragments no entry names, which render as plain text.
    const unregistered = new Set<string>();
    for (const provider of reg.columns) {
      const names = Object.keys(reg.products[provider] ?? {});
      for (const cell of said.get(provider) as string[]) {
        for (const raw of cell.split(/[,;]\s*/)) {
          const frag = raw.trim();
          if (frag.length < 3 || NOT_A_PRODUCT.test(frag)) continue;
          if (!names.some((n) => mentions(frag, n))) unregistered.add(`${provider}: ${frag}`);
        }
      }
    }
    if (ctx.flags.has('--worklist')) for (const u of [...unregistered].sort()) ctx.note(`unregistered — ${u}`);

    const offline =
      `[products] ${String(entries)} product entries across ${String(reg.columns.length)} providers, each used by its own column ` +
      `in ${String(pages)} capability pages; ${String(unregistered.size)} cell fragments name no entry (--worklist lists them)`;
    if (!ctx.flags.has('--online') || ctx.findings > 0) return offline;

    // One fetch per distinct URL: two names can share a page.
    const urls = [...new Set(reg.columns.flatMap((p) => Object.values(reg.products[p] ?? {})))];
    const answers = new Map(urls.map((u, i) => [u, i]));
    const got = await pooled(urls, FETCH_AT_ONCE, (u) => answerOf(u));
    for (const provider of reg.columns) {
      for (const [name, url] of Object.entries(reg.products[provider] ?? {})) {
        const a = got[answers.get(url) as number] as Awaited<ReturnType<typeof answerOf>>;
        const line = entryLine(text, provider, name);
        if ('error' in a) ctx.fail(SRC, `${provider} "${name}" ${url} did not answer (${a.error}) — fetch it by hand; fix or drop the entry if it is gone`, line);
        else if (a.status >= 400) ctx.fail(SRC, `${provider} "${name}" ${url} answers ${String(a.status)} — find the page it moved to, or drop the entry`, line);
      }
    }
    return `${offline}; ${String(urls.length)} URLs fetched, every one answering`;
  },
};

main(spec, import.meta.url);
