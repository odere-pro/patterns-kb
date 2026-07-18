#!/usr/bin/env node
// structure.mjs — turn a harvested Hello Interview manifest into a nested folder tree.
//
//   root/<accordion>/<topic>/meta.json   the structural facts + the "On This Page" TOC
//   root/<accordion>/<topic>/note.md     an original study note, scaffolded from the TOC headings
//
// Dependency-free (Node built-ins only), mirroring scripts/kb.mjs house style — no npm, no deps.
// Re-runnable and safe: it (re)writes meta.json every run, but only writes note.md when the file is
// absent or is still an untouched scaffold. An authored note is never clobbered.
//
// Usage:
//   node structure.mjs --manifest <manifest.json> --root <dir> [--captured-at <ISO8601>] [--force-notes]
//   node structure.mjs --status  --manifest <manifest.json> --root <dir> [--json]
//
// --status reports which topics are done (note.md authored) vs pending (missing or still a scaffold),
// giving a loop its termination condition: keep fetching until pending reaches 0.
//
// The manifest is the single source of truth the agent produces from the browser (see SKILL.md,
// Phases A + B). Shape is documented in meta.schema.json / manifest.example.json. In brief:
//
//   {
//     "source": "hellointerview.com/learn/system-design",
//     "accordions": [
//       { "name": "Core Concepts", "slug": "core-concepts",
//         "topics": [
//           { "slug": "caching", "title": "Caching",
//             "url": "https://www.hellointerview.com/learn/system-design/core-concepts/caching",
//             "date": "…", "access": "free", "hasVideo": true,
//             "toc": ["Where to Cache", "Cache Architectures", …],
//             "relatedBreakdowns": ["Ticketmaster", …] }
//         ] }
//     ]
//   }

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { argv, exit } from 'node:process'

const SCAFFOLD_MARK = '<!-- hi-extract:scaffold -->' // present ⇒ note.md is still an untouched stub

function parseArgs(args) {
  const out = { manifest: null, root: null, capturedAt: null, forceNotes: false, status: false, json: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--manifest') out.manifest = args[++i]
    else if (a === '--root') out.root = args[++i]
    else if (a === '--captured-at') out.capturedAt = args[++i]
    else if (a === '--force-notes') out.forceNotes = true
    else if (a === '--status') out.status = true
    else if (a === '--json') out.json = true
    else if (a === '-h' || a === '--help') out.help = true
    else die(`unknown argument: ${a}`)
  }
  return out
}

function die(msg) {
  console.error(`structure.mjs: ${msg}`)
  exit(1)
}

const USAGE = `Usage:
  node structure.mjs --manifest <manifest.json> --root <dir> [--captured-at <ISO>] [--force-notes]
  node structure.mjs --status --manifest <manifest.json> --root <dir> [--json]

Build mode (default): creates root/<accordion>/<topic>/{meta.json,note.md} from a harvested
manifest. meta.json is always rewritten; note.md is written only when missing or still a
scaffold (unless --force-notes). --captured-at stamps meta.json (default: leaves the manifest
value, or "unknown" — the script never calls Date.now itself).

Status mode (--status): reports done vs pending topics for a loop's termination condition.
A topic is "done" when its note.md exists and no longer carries the scaffold marker. Prints a
human summary, or a machine object with --json. Exit code is 0 when nothing is pending, else 2.`

// kebab-case a label into a filesystem-safe slug, matching the URL-slug style the site uses.
function slugify(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function validateManifest(m) {
  if (!m || typeof m !== 'object') die('manifest is not an object')
  if (!Array.isArray(m.accordions)) die('manifest.accordions must be an array')
  m.accordions.forEach((acc, ai) => {
    if (!acc.name && !acc.slug) die(`accordions[${ai}] needs a name or slug`)
    if (!Array.isArray(acc.topics)) die(`accordions[${ai}].topics must be an array`)
    acc.topics.forEach((t, ti) => {
      if (!t.url) die(`accordions[${ai}].topics[${ti}] needs a url`)
      if (!t.title && !t.slug) die(`accordions[${ai}].topics[${ti}] needs a title or slug`)
    })
  })
}

// The metadata record written to disk — the "facts + helpers" half of the deliverable.
function buildMeta(accordion, topic, capturedAt) {
  const access = topic.access === 'premium' ? 'premium' : 'free'
  return {
    accordion: accordion.name ?? accordion.slug,
    accordionSlug: accordion.slug ?? slugify(accordion.name),
    topic: topic.title ?? topic.slug,
    slug: topic.slug ?? slugify(topic.title),
    title: topic.title ?? topic.slug,
    url: topic.url,
    date: topic.date ?? null, // "Updated …" / "Published …" line, verbatim
    access, // free | premium — from "Purchase Premium to Keep Reading" / sidebar lock
    hasVideo: Boolean(topic.hasVideo),
    toc: Array.isArray(topic.toc) ? topic.toc : [], // the right-sidebar "On This Page" list
    relatedBreakdowns: Array.isArray(topic.relatedBreakdowns) ? topic.relatedBreakdowns : [],
    capturedAt: topic.capturedAt ?? capturedAt ?? 'unknown',
  }
}

// A note.md stub: front-matter-ish header + one blank ## section per TOC heading, ready to fill
// with ORIGINAL prose. The SCAFFOLD_MARK lets a re-run know the file is still untouched.
function buildNoteScaffold(meta) {
  const lines = []
  lines.push(SCAFFOLD_MARK)
  lines.push(`# ${meta.title}`)
  lines.push('')
  lines.push(`> Source skeleton: ${meta.url}`)
  lines.push(`> Access: ${meta.access}${meta.date ? ` · ${meta.date}` : ''}`)
  lines.push('>')
  lines.push('> Write ORIGINAL notes below — no paragraph-length reproduction of the source.')
  lines.push('> Delete this scaffold marker once you start; it protects the file from re-runs.')
  lines.push('')
  if (meta.relatedBreakdowns.length) {
    lines.push(`_Related problem breakdowns: ${meta.relatedBreakdowns.join(', ')}_`)
    lines.push('')
  }
  if (meta.toc.length) {
    for (const heading of meta.toc) {
      lines.push(`## ${heading}`)
      lines.push('')
      lines.push('')
    }
  } else {
    lines.push('## Notes')
    lines.push('')
    lines.push('')
  }
  return lines.join('\n')
}

function noteIsScaffold(path) {
  if (!existsSync(path)) return true
  const body = readFileSync(path, 'utf8')
  return body.includes(SCAFFOLD_MARK)
}

// --status: report progress so a loop knows when to stop. A topic is "done" once its note.md
// exists and no longer carries the scaffold marker (i.e. someone wrote real notes into it).
function runStatus(manifest, root, asJson) {
  const done = []
  const pending = []
  for (const accordion of manifest.accordions) {
    const accSlug = accordion.slug ?? slugify(accordion.name)
    for (const topic of accordion.topics) {
      const topicSlug = topic.slug ?? slugify(topic.title)
      const notePath = join(root, accSlug, topicSlug, 'note.md')
      const ref = `${accSlug}/${topicSlug}`
      if (existsSync(notePath) && !readFileSync(notePath, 'utf8').includes(SCAFFOLD_MARK)) {
        done.push(ref)
      } else {
        pending.push({ ref, accordion: accordion.name ?? accSlug, topic: topic.title ?? topicSlug, url: topic.url })
      }
    }
  }
  const total = done.length + pending.length
  if (asJson) {
    console.log(JSON.stringify({ total, done: done.length, pending: pending.length, pendingTopics: pending }, null, 2))
  } else {
    console.log(`status: ${done.length}/${total} done, ${pending.length} pending.`)
    if (pending.length) {
      console.log('pending:')
      for (const p of pending) console.log(`  - ${p.ref}  (${p.url})`)
    } else {
      console.log('All topics fetched. Loop can stop.')
    }
  }
  exit(pending.length === 0 ? 0 : 2)
}

function main() {
  const args = parseArgs(argv.slice(2))
  if (args.help) {
    console.log(USAGE)
    return
  }
  if (!args.manifest) die('missing --manifest')
  if (!args.root) die('missing --root')

  let manifest
  try {
    manifest = JSON.parse(readFileSync(args.manifest, 'utf8'))
  } catch (e) {
    die(`cannot read/parse manifest: ${e.message}`)
  }
  validateManifest(manifest)

  if (args.status) return runStatus(manifest, args.root, args.json)

  const summary = { accordions: 0, topics: 0, metaWritten: 0, notesScaffolded: 0, notesSkipped: 0 }

  for (const accordion of manifest.accordions) {
    const accSlug = accordion.slug ?? slugify(accordion.name)
    summary.accordions++
    for (const topic of accordion.topics) {
      summary.topics++
      const topicSlug = topic.slug ?? slugify(topic.title)
      const dir = join(args.root, accSlug, topicSlug)
      mkdirSync(dir, { recursive: true })

      const meta = buildMeta(accordion, topic, args.capturedAt)
      writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
      summary.metaWritten++

      const notePath = join(dir, 'note.md')
      if (args.forceNotes || noteIsScaffold(notePath)) {
        writeFileSync(notePath, buildNoteScaffold(meta) + '\n')
        summary.notesScaffolded++
      } else {
        summary.notesSkipped++ // authored note — left untouched
      }
    }
  }

  console.log(
    `structure.mjs: ${summary.accordions} accordions, ${summary.topics} topics → ` +
      `${summary.metaWritten} meta.json written, ${summary.notesScaffolded} note.md scaffolded, ` +
      `${summary.notesSkipped} authored notes preserved.`,
  )
  console.log(`Root: ${args.root}`)
}

main()
