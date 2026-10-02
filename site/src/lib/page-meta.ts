// The structured view of a page, in one place.
//
// Two components render it and they must never disagree: Head.astro emits it
// as <meta> tags plus a JSON-LD block (what a crawler or a machine reader
// reads), and PageMeta.astro shows the same object to a person behind the
// header button. tools/src/site/site-portable.ts then reads those tags back out
// of the built HTML into the manifest — so this module is the authored source
// and the manifest is its machine-readable echo (spec kb.pagedata.head).
import { lastModified } from './git-date';
import type { Status } from './site-types';

/** What `pageMeta` reads off an entry. Astro types the real thing wider. */
export interface MetaEntry {
  filePath?: string | undefined;
  data: {
    title: string;
    description: string;
    area: string;
    owner: string;
    tags?: string[] | undefined;
    status?: Status | undefined;
    aliases?: string[] | undefined;
    solves?: string[] | undefined;
  };
}

export interface PageMetaValues {
  title: string;
  description: string;
  area: string;
  status: Status;
  owner: string;
  tags: string[];
  /** Other names the page answers to, and the symptoms it answers: what search ranks by. */
  aliases: string[];
  solves: string[];
  modified: string | null;
}

/** Everything downstream keys off, read from one entry's frontmatter. */
export function pageMeta(entry: MetaEntry): PageMetaValues {
  const data = entry.data;
  return {
    title: data.title,
    description: data.description,
    area: data.area,
    status: data.status ?? 'stable',
    owner: data.owner,
    tags: Array.isArray(data.tags) ? data.tags : [],
    aliases: Array.isArray(data.aliases) ? data.aliases : [],
    solves: Array.isArray(data.solves) ? data.solves : [],
    modified: lastModified(entry.filePath),
  };
}

/** The schema.org TechArticle for a page (spec interfaces/built-page.md, the JSON-LD block). */
export function jsonLd(meta: PageMetaValues): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: meta.title,
    description: meta.description,
    ...(meta.tags.length > 0 ? { keywords: meta.tags.join(', ') } : {}),
    isPartOf: { '@type': 'Collection', name: meta.area },
    ...(meta.owner ? { author: { '@type': 'Person', name: meta.owner } } : {}),
    ...(meta.modified ? { dateModified: meta.modified } : {}),
  };
}

/** The JSON-LD block's text: no `<`, so a closing tag in a value cannot end the block. */
export function jsonLdText(meta: PageMetaValues): string {
  return JSON.stringify(jsonLd(meta)).replace(/</g, '\\u003c');
}

/**
 * The kb:* meta tags, as name/content pairs — emitted and displayed alike.
 * One element per alias and per `solves` phrase, never a joined list: a
 * phrase may hold a comma, and a tag never does. The search payload ranks by
 * both (tools/src/lib/search-score.ts), through the manifest.
 */
export function metaTags(meta: PageMetaValues): [string, string][] {
  return [
    ['kb:area', meta.area],
    ['kb:status', meta.status],
    ['kb:owner', meta.owner],
    ['kb:tags', meta.tags.join(',')],
    ...meta.aliases.map((a): [string, string] => ['kb:alias', a]),
    ...meta.solves.map((s): [string, string] => ['kb:solves', s]),
  ];
}
