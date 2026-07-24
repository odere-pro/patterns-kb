#!/usr/bin/env node
// structure.mjs — scaffold, track, and validate a site-extraction folder tree.
//
// Site-agnostic: it consumes a manifest (whatever site produced it) and manages the tree below.
// All site-specific reading rules live in a profile the agent follows — see SKILL.md. Nothing here
// names or knows about any particular website.
//
//   <root>/<group-slug>/<topic-slug>/<topic-slug>.meta.json   metadata + the page's TOC (facts)
//   <root>/<group-slug>/<topic-slug>/<topic-slug>.md          the raw factual extraction
//
// Filenames carry the topic slug on purpose: every file is self-describing and greppable, and the
// slug is taken faithfully from the source URL (not re-derived from a title) so capture stays lossless.
//
// Modes:
//   (build, default)  create folders, (re)write meta, scaffold any missing/stub extraction file
//   --status          report done vs pending — a loop's stop condition (exit 0 = done, 2 = pending)
//   --validate        quality gate ("gold out"): each topic complete, faithful, cited (exit 0 / 3)
//
// Usage:
//   node structure.mjs            --manifest <m.json> --root <dir> [--captured-at <ISO>] [--force]
//   node structure.mjs --status   --manifest <m.json> --root <dir> [--json]
//   node structure.mjs --validate --manifest <m.json> --root <dir> [--json]
//
// Dependency-free (Node built-ins only), mirroring scripts/kb.mjs house style — no npm, no deps.
// The script never calls Date.now(); pass --captured-at (or set capturedAt in the manifest).

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { argv, exit } from 'node:process'

const SCAFFOLD_MARK = '<!-- site-extract:scaffold -->' // present ⇒ extraction file is still an untouched stub
const MIN_BODY_CHARS = 200 // a filled extraction shorter than this is treated as too thin

function die(msg) {
  console.error(`structure.mjs: ${msg}`)
  exit(1)
}

const USAGE = `Usage:
  node structure.mjs            --manifest <m.json> --root <dir> [--captured-at <ISO>] [--force]
  node structure.mjs --status   --manifest <m.json> --root <dir> [--json]
  node structure.mjs --validate --manifest <m.json> --root <dir> [--json]

Build (default): create <root>/<group>/<topic>/<topic>.{meta.json,md} from a manifest. meta.json is
always rewritten; the .md is written only when missing or still a scaffold (unless --force).

--status: done (extraction filled) vs pending (missing / still a scaffold). Exit 0 done, 2 pending.
--validate: quality gate — each filled extraction must cover every TOC heading, cite its source, and
be non-trivial. Exit 0 when all pass, 3 when any issues (also reports still-pending topics).`

function parseArgs(args) {
  const out = { manifest: null, root: null, capturedAt: null, force: false, status: false, validate: false, json: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--manifest') out.manifest = args[++i]
    else if (a === '--root') out.root = args[++i]
    else if (a === '--captured-at') out.capturedAt = args[++i]
    else if (a === '--force' || a === '--force-notes') out.force = true
    else if (a === '--status') out.status = true
    else if (a === '--validate') out.validate = true
    else if (a === '--json') out.json = true
    else if (a === '-h' || a === '--help') out.help = true
    else die(`unknown argument: ${a}`)
  }
  return out
}

// kebab-case a label into a filesystem-safe slug (fallback only; prefer the URL's real slug).
function slugify(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Prefer the last path segment of the URL as the authoritative slug — lossless vs. re-slugifying a title.
function topicSlug(topic) {
  if (topic.slug) return topic.slug
  if (topic.url) {
    try {
      const seg = new URL(topic.url).pathname.split('/').filter(Boolean).pop()
      if (seg) return seg
    } catch {
      /* fall through */
    }
  }
  return slugify(topic.title)
}

function validateManifest(m) {
  if (!m || typeof m !== 'object') die('manifest is not an object')
  if (!Array.isArray(m.groups)) die('manifest.groups must be an array')
  m.groups.forEach((g, gi) => {
    if (!g.name && !g.slug) die(`groups[${gi}] needs a name or slug`)
    if (!Array.isArray(g.topics)) die(`groups[${gi}].topics must be an array`)
    g.topics.forEach((t, ti) => {
      if (!t.url) die(`groups[${gi}].topics[${ti}] needs a url`)
      if (!t.title && !t.slug) die(`groups[${gi}].topics[${ti}] needs a title or slug`)
    })
  })
}

// Metadata record — facts only. Order preserves the source's sidebar sequence (a detail that matters).
function buildMeta(m, group, topic, order, capturedAt) {
  return {
    site: m.site ?? null,
    group: group.name ?? group.slug,
    groupSlug: group.slug ?? slugify(group.name),
    order,
    topic: topic.title ?? topic.slug,
    slug: topicSlug(topic),
    title: topic.title ?? topic.slug,
    url: topic.url,
    date: topic.date ?? null,
    access: topic.access === 'gated' ? 'gated' : 'open', // open = fully readable; gated = paywalled/partial
    hasVideo: Boolean(topic.hasVideo),
    toc: Array.isArray(topic.toc) ? topic.toc : [],
    related: Array.isArray(topic.related) ? topic.related : [],
    capturedAt: topic.capturedAt ?? capturedAt ?? 'unknown',
  }
}

// A stub extraction file: header with source citation + one blank ## per TOC heading, ready to fill
// with the RAW factual capture. The SCAFFOLD_MARK lets a re-run know it's still untouched.
function buildScaffold(meta) {
  const L = []
  L.push(SCAFFOLD_MARK)
  L.push(`# ${meta.title} — raw extraction`)
  L.push('')
  L.push(`> Source: ${meta.url}`)
  L.push(`> Group: ${meta.group} · Access: ${meta.access}${meta.date ? ` · ${meta.date}` : ''}`)
  L.push('>')
  L.push('> RAW DATA to transform into an original page. Capture facts, specs, numbers, API names,')
  L.push('> code, and the outline under each heading — in neutral form, NOT the source’s prose/phrasing.')
  L.push('> Skip comments and video. Delete this marker once filled (protects re-runs).')
  L.push('')
  if (meta.related.length) {
    L.push(`_Related on page: ${meta.related.join(', ')}_`)
    L.push('')
  }
  for (const h of meta.toc.length ? meta.toc : ['Notes']) {
    L.push(`## ${h}`)
    L.push('')
    L.push('')
  }
  return L.join('\n')
}

// Paths for a topic. Filenames carry the slug so they are self-describing.
function topicPaths(root, meta) {
  const dir = join(root, meta.groupSlug, meta.slug)
  return { dir, meta: join(dir, `${meta.slug}.meta.json`), body: join(dir, `${meta.slug}.md`) }
}

function isScaffold(path) {
  if (!existsSync(path)) return true
  return readFileSync(path, 'utf8').includes(SCAFFOLD_MARK)
}

// Iterate manifest → yield {group, topic, meta, paths} with order assigned per group.
function* eachTopic(m, root, capturedAt) {
  for (const group of m.groups) {
    let order = 0
    for (const topic of group.topics) {
      order++
      const meta = buildMeta(m, group, topic, order, capturedAt)
      yield { group, topic, meta, paths: topicPaths(root, meta) }
    }
  }
}

function runBuild(m, root, capturedAt, force) {
  const s = { groups: m.groups.length, topics: 0, meta: 0, scaffolded: 0, preserved: 0 }
  for (const { meta, paths } of eachTopic(m, root, capturedAt)) {
    s.topics++
    mkdirSync(paths.dir, { recursive: true })
    writeFileSync(paths.meta, JSON.stringify(meta, null, 2) + '\n')
    s.meta++
    if (force || isScaffold(paths.body)) {
      writeFileSync(paths.body, buildScaffold(meta) + '\n')
      s.scaffolded++
    } else {
      s.preserved++
    }
  }
  console.log(
    `structure.mjs: ${s.groups} groups, ${s.topics} topics → ${s.meta} meta written, ` +
      `${s.scaffolded} extraction stubs scaffolded, ${s.preserved} filled extractions preserved.`,
  )
  console.log(`Root: ${root}`)
}

function runStatus(m, root, asJson) {
  const done = []
  const pending = []
  for (const { meta, paths } of eachTopic(m, root, null)) {
    const ref = `${meta.groupSlug}/${meta.slug}`
    if (existsSync(paths.body) && !isScaffold(paths.body)) done.push(ref)
    else pending.push({ ref, group: meta.group, topic: meta.title, url: meta.url })
  }
  const total = done.length + pending.length
  if (asJson) {
    console.log(JSON.stringify({ total, done: done.length, pending: pending.length, pendingTopics: pending }, null, 2))
  } else {
    console.log(`status: ${done.length}/${total} done, ${pending.length} pending.`)
    if (pending.length) for (const p of pending) console.log(`  - ${p.ref}  (${p.url})`)
    else console.log('All topics fetched. Loop can stop.')
  }
  exit(pending.length === 0 ? 0 : 2)
}

// Quality gate — "gold out". A filled extraction must: cite its source, cover every TOC heading,
// and carry non-trivial content. Faithfulness (right slug/order/group) comes from the manifest+build.
function runValidate(m, root, asJson) {
  const results = []
  for (const { meta, paths } of eachTopic(m, root, null)) {
    const ref = `${meta.groupSlug}/${meta.slug}`
    const issues = []

    if (!existsSync(paths.meta)) issues.push('missing meta.json')
    if (!existsSync(paths.body)) {
      issues.push('missing extraction file')
      results.push({ ref, state: 'pending', issues })
      continue
    }
    const body = readFileSync(paths.body, 'utf8')
    if (body.includes(SCAFFOLD_MARK)) {
      results.push({ ref, state: 'pending', issues: ['still a scaffold (not captured yet)'] })
      continue
    }

    // source citation present?
    if (!body.includes('> Source:') && (!meta.url || !body.includes(meta.url))) {
      issues.push('no source citation')
    }
    // every TOC heading present as a markdown heading (any level 2–6), case-insensitive?
    const headings = new Set(
      [...body.matchAll(/^#{2,6}\s+(.+?)\s*$/gm)].map((x) => x[1].trim().toLowerCase()),
    )
    const missing = (meta.toc || []).filter((h) => !headings.has(String(h).trim().toLowerCase()))
    if (missing.length) issues.push(`missing sections: ${missing.map((h) => `"${h}"`).join(', ')}`)
    // non-trivial content (strip comment + quote lines)?
    const bodyLen = body
      .split('\n')
      .filter((l) => !l.startsWith('>') && !l.startsWith('<!--') && l.trim())
      .join('\n').length
    if (bodyLen < MIN_BODY_CHARS) issues.push(`content too thin (${bodyLen} chars)`)

    results.push({ ref, state: issues.length ? 'issues' : 'ok', issues })
  }

  const ok = results.filter((r) => r.state === 'ok')
  const pending = results.filter((r) => r.state === 'pending')
  const bad = results.filter((r) => r.state === 'issues')
  if (asJson) {
    console.log(JSON.stringify({ total: results.length, ok: ok.length, pending: pending.length, issues: bad, pendingTopics: pending }, null, 2))
  } else {
    console.log(`validate: ${ok.length}/${results.length} ok, ${pending.length} pending, ${bad.length} with issues.`)
    for (const r of bad) console.log(`  ✗ ${r.ref}: ${r.issues.join('; ')}`)
    for (const r of pending) console.log(`  … ${r.ref}: ${r.issues.join('; ')}`)
    if (!bad.length && !pending.length) console.log('All extractions pass. Gold out. ✓')
  }
  exit(bad.length ? 3 : pending.length ? 2 : 0)
}

function main() {
  const args = parseArgs(argv.slice(2))
  if (args.help) return console.log(USAGE)
  if (!args.manifest) die('missing --manifest')
  if (!args.root) die('missing --root')

  let m
  try {
    m = JSON.parse(readFileSync(args.manifest, 'utf8'))
  } catch (e) {
    die(`cannot read/parse manifest: ${e.message}`)
  }
  validateManifest(m)

  if (args.status) return runStatus(m, args.root, args.json)
  if (args.validate) return runValidate(m, args.root, args.json)
  return runBuild(m, args.root, args.capturedAt, args.force)
}

main()
