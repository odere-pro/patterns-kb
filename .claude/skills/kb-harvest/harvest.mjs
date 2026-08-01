#!/usr/bin/env node
// kb-harvest/harvest.mjs — scaffold, track, and validate raw web-harvest captures.
//
// The harvest pipeline's state machine. It consumes a ledger (candidates discovered and
// curated by the agent — see SKILL.md) and manages the capture tree below. It performs
// NO network I/O: fetching, extraction and diagram re-drawing are the agent's job; this
// script only creates files and gates their quality.
//
//   <root>/captures/<source-id>/<slug>/<slug>.capture.json   machine facts (evidence, diagrams)
//   <root>/captures/<source-id>/<slug>/<slug>.md             the raw agnostic capture
//
// Only candidates with curated:true AND triage:"NEW" get capture files — EXISTS candidates
// are handed to kb-intake as bare URLs and never captured (see SKILL.md §3).
//
// Modes:
//   (scaffold, default)  create capture stubs for every curated NEW candidate
//   --status             done vs pending — a loop's stop condition (exit 0 = done, 2 = pending)
//   --validate           quality gate incl. the brand-leak lint (exit 0 pass / 2 pending / 3 issues)
//
// Usage:
//   node harvest.mjs            --ledger <l.json> [--root <dir>] [--captured-at <ISO>] [--force]
//   node harvest.mjs --status   --ledger <l.json> [--root <dir>] [--json]
//   node harvest.mjs --validate --ledger <l.json> [--root <dir>] [--json]
//
// Dependency-free (Node built-ins only), mirroring scripts/kb.mjs house style — no npm, no deps.
// The script never calls Date.now(); pass --captured-at (or set capturedAt in the ledger).

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { argv, exit } from 'node:process'

const SCAFFOLD_MARK = '<!-- kb-harvest:scaffold -->' // present ⇒ capture file is still an untouched stub
const MIN_BODY_CHARS = 200 // a filled capture shorter than this is treated as too thin

// The fixed capture sections, in order. Core sections must be non-empty; the rest may hold
// "None found." but the heading must exist (the scaffold provides all of them).
const SECTIONS = ['Intent', 'Mechanism', 'Variants', 'Tradeoffs', 'Applicability', 'Diagrams', 'Evidence', 'Related', 'Sources']
const CORE_SECTIONS = ['Intent', 'Mechanism', 'Tradeoffs', 'Applicability', 'Sources']
// Brand terms (from sources/*.json) may appear ONLY in these sections — anywhere else is a leak.
const BRAND_OK_SECTIONS = ['Evidence', 'Sources']

const HERE = dirname(fileURLToPath(import.meta.url))

function die(msg) {
  console.error(`harvest.mjs: ${msg}`)
  exit(1)
}

function findRepoRoot(start) {
  let dir = start
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, 'scripts', 'kb.mjs'))) return dir
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  die(`could not locate repo root walking up from ${start} (need scripts/kb.mjs)`)
}

const USAGE = `Usage:
  node harvest.mjs            --ledger <l.json> [--root <dir>] [--captured-at <ISO>] [--force]
  node harvest.mjs --status   --ledger <l.json> [--root <dir>] [--json]
  node harvest.mjs --validate --ledger <l.json> [--root <dir>] [--json]

Scaffold (default): create <root>/captures/<source-id>/<slug>/<slug>.{capture.json,md} for every
ledger candidate with curated:true and triage:"NEW". Filled files are preserved (unless --force).

--status: done (capture filled) vs pending (missing / still a scaffold). Exit 0 done, 2 pending.
--validate: quality gate — every filled capture must carry all sections, cite its source, hold
non-trivial content, balance its mermaid fences, and keep brand terms out of the body sections
(the brand-leak lint reads brandTerms from sources/*.json). Exit 0 pass / 2 pending / 3 issues.

--root defaults to <repo>/tmp/kb-harvest.`

function parseArgs(args) {
  const out = { ledger: null, root: null, capturedAt: null, force: false, status: false, validate: false, json: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--ledger') out.ledger = args[++i]
    else if (a === '--root') out.root = args[++i]
    else if (a === '--captured-at') out.capturedAt = args[++i]
    else if (a === '--force') out.force = true
    else if (a === '--status') out.status = true
    else if (a === '--validate') out.validate = true
    else if (a === '--json') out.json = true
    else if (a === '-h' || a === '--help') out.help = true
    else die(`unknown argument: ${a}`)
  }
  return out
}

function validateLedger(l) {
  if (!l || typeof l !== 'object') die('ledger is not an object')
  if (!Array.isArray(l.sources)) die('ledger.sources must be an array')
  l.sources.forEach((s, si) => {
    if (!s.id) die(`sources[${si}] needs an id`)
    if (!Array.isArray(s.candidates)) die(`sources[${si}].candidates must be an array`)
    s.candidates.forEach((c, ci) => {
      if (!c.slug) die(`sources[${si}].candidates[${ci}] needs a slug`)
      if (!c.url) die(`sources[${si}].candidates[${ci}] needs a url`)
    })
  })
}

// Iterate the candidates that own capture files: curated AND triaged NEW.
function* eachCapture(l, root) {
  for (const source of l.sources) {
    for (const c of source.candidates) {
      if (!c.curated || c.triage !== 'NEW') continue
      const dir = join(root, 'captures', source.id, c.slug)
      yield {
        source,
        c,
        dir,
        jsonPath: join(dir, `${c.slug}.capture.json`),
        bodyPath: join(dir, `${c.slug}.md`),
        ref: `${source.id}/${c.slug}`,
      }
    }
  }
}

function isScaffold(path) {
  if (!existsSync(path)) return true
  return readFileSync(path, 'utf8').includes(SCAFFOLD_MARK)
}

// Machine half of a capture — fixed key order, evidence/diagrams start empty and are
// filled by the agent during capture (so scaffold never overwrites an existing file).
function buildCaptureJson(source, c, capturedAt) {
  return {
    slug: c.slug,
    title: c.title ?? c.slug,
    sourceId: source.id,
    sourceUrls: [c.url],
    hop: typeof c.hop === 'number' ? c.hop : 0,
    capturedAt,
    triage: 'NEW',
    evidence: [],
    diagrams: [],
  }
}

function buildScaffold(source, c) {
  const L = []
  L.push(SCAFFOLD_MARK)
  L.push(`# ${c.title ?? c.slug} — raw capture`)
  L.push('')
  L.push(`> Source: ${c.url}`)
  L.push(`> Source id: ${source.id} · Hop: ${typeof c.hop === 'number' ? c.hop : 0} · Triage: NEW`)
  L.push('>')
  L.push('> RAW, VENDOR-AGNOSTIC capture to hand to kb-intake. Facts, not the source’s prose —')
  L.push('> no 8-word run of source text survives. Product/brand names live ONLY under Evidence')
  L.push('> and Sources; body sections speak capability language. Every diagram is re-drawn as')
  L.push('> mermaid, never copied. Delete this marker once filled (protects re-runs).')
  L.push('')
  for (const h of SECTIONS) {
    L.push(`## ${h}`)
    L.push('')
    if (h === 'Sources') L.push(`- ${c.url}`)
    L.push('')
  }
  return L.join('\n')
}

function runScaffold(l, root, capturedAt, force) {
  const s = { candidates: 0, jsonWritten: 0, scaffolded: 0, preserved: 0 }
  for (const { source, c, dir, jsonPath, bodyPath } of eachCapture(l, root)) {
    s.candidates++
    mkdirSync(dir, { recursive: true })
    // capture.json is agent-filled after capture (evidence, diagrams) — never clobber it.
    if (force || !existsSync(jsonPath)) {
      writeFileSync(jsonPath, JSON.stringify(buildCaptureJson(source, c, capturedAt ?? l.capturedAt ?? 'unknown'), null, 2) + '\n')
      s.jsonWritten++
    }
    if (force || isScaffold(bodyPath)) {
      writeFileSync(bodyPath, buildScaffold(source, c) + '\n')
      s.scaffolded++
    } else {
      s.preserved++
    }
  }
  console.log(
    `harvest.mjs: ${s.candidates} curated NEW candidates → ${s.jsonWritten} capture.json written, ` +
      `${s.scaffolded} stubs scaffolded, ${s.preserved} filled captures preserved.`,
  )
  console.log(`Root: ${root}`)
}

function runStatus(l, root, asJson) {
  const done = []
  const pending = []
  for (const { c, bodyPath, ref } of eachCapture(l, root)) {
    if (existsSync(bodyPath) && !isScaffold(bodyPath)) done.push(ref)
    else pending.push({ ref, title: c.title ?? c.slug, url: c.url })
  }
  const total = done.length + pending.length
  if (asJson) {
    console.log(JSON.stringify({ total, done: done.length, pending: pending.length, pendingCandidates: pending }, null, 2))
  } else {
    console.log(`status: ${done.length}/${total} done, ${pending.length} pending.`)
    if (pending.length) for (const p of pending) console.log(`  - ${p.ref}  (${p.url})`)
    else console.log('All captures filled. Loop can stop.')
  }
  exit(pending.length === 0 ? 0 : 2)
}

// Union of brandTerms across every committed source profile — the leak vocabulary.
function loadBrandTerms() {
  const dir = join(HERE, 'sources')
  const terms = new Set()
  if (!existsSync(dir)) return terms
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue
    try {
      const p = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      for (const t of p.brandTerms ?? []) terms.add(t)
    } catch {
      /* a broken profile fails loudly elsewhere; the lint just skips it */
    }
  }
  return terms
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Split a capture body into { sectionName → text } keyed by its ## headings.
function splitSections(body) {
  const map = new Map()
  let current = null
  const buf = []
  const flush = () => {
    if (current !== null) map.set(current, buf.join('\n'))
    buf.length = 0
  }
  for (const line of body.split('\n')) {
    const m = line.match(/^##\s+(.+?)\s*$/)
    if (m) {
      flush()
      current = m[1]
    } else if (current !== null) {
      buf.push(line)
    }
  }
  flush()
  return map
}

// Quality gate — "gold out". A filled capture must: carry every fixed section (core ones
// non-empty), cite its source, be non-trivial, balance its mermaid fences, keep its
// capture.json coherent, and pass the brand-leak lint.
function runValidate(l, root, asJson) {
  const brandTerms = [...loadBrandTerms()].map((t) => ({ term: t, re: new RegExp(`\\b${escapeRegExp(t)}\\b`, 'i') }))
  const results = []
  for (const { c, jsonPath, bodyPath, ref } of eachCapture(l, root)) {
    const issues = []

    if (!existsSync(bodyPath)) {
      results.push({ ref, state: 'pending', issues: ['missing capture file'] })
      continue
    }
    const body = readFileSync(bodyPath, 'utf8')
    if (body.includes(SCAFFOLD_MARK)) {
      results.push({ ref, state: 'pending', issues: ['still a scaffold (not captured yet)'] })
      continue
    }

    // capture.json present and coherent?
    if (!existsSync(jsonPath)) {
      issues.push('missing capture.json')
    } else {
      try {
        const cap = JSON.parse(readFileSync(jsonPath, 'utf8'))
        for (const k of ['slug', 'title', 'sourceId', 'sourceUrls', 'hop', 'capturedAt', 'triage', 'evidence', 'diagrams']) {
          if (!(k in cap)) issues.push(`capture.json missing key "${k}"`)
        }
        if (cap.slug && cap.slug !== c.slug) issues.push(`capture.json slug "${cap.slug}" ≠ ledger slug "${c.slug}"`)
        if (Array.isArray(cap.evidence)) {
          cap.evidence.forEach((e, i) => {
            if (!e || !e.id || !e.name) issues.push(`evidence[${i}] needs id and name`)
          })
        }
      } catch (e) {
        issues.push(`capture.json unparsable: ${e.message}`)
      }
    }

    // source citation present?
    if (!body.includes('> Source:') && !body.includes(c.url)) issues.push('no source citation')

    // every fixed section present, core sections non-empty?
    const sections = splitSections(body)
    for (const h of SECTIONS) {
      if (!sections.has(h)) issues.push(`missing section "## ${h}"`)
      else if (CORE_SECTIONS.includes(h) && !sections.get(h).trim()) issues.push(`empty core section "## ${h}"`)
    }

    // balanced code fences (a dangling \`\`\`mermaid swallows the rest of the file)?
    const fences = body.split('\n').filter((ln) => ln.trimStart().startsWith('```')).length
    if (fences % 2 !== 0) issues.push(`unbalanced code fences (${fences} fence lines)`)

    // non-trivial content (strip comment + quote lines)?
    const bodyLen = body
      .split('\n')
      .filter((ln) => !ln.startsWith('>') && !ln.startsWith('<!--') && ln.trim())
      .join('\n').length
    if (bodyLen < MIN_BODY_CHARS) issues.push(`content too thin (${bodyLen} chars)`)

    // brand-leak lint: brand terms may appear only under Evidence / Sources.
    for (const [name, text] of sections) {
      if (BRAND_OK_SECTIONS.includes(name)) continue
      for (const { term, re } of brandTerms) {
        if (re.test(text)) issues.push(`brand leak: "${term}" in "## ${name}" — move to Evidence, use capability language`)
      }
    }

    results.push({ ref, state: issues.length ? 'issues' : 'ok', issues })
  }

  const ok = results.filter((r) => r.state === 'ok')
  const pending = results.filter((r) => r.state === 'pending')
  const bad = results.filter((r) => r.state === 'issues')
  if (asJson) {
    console.log(JSON.stringify({ total: results.length, ok: ok.length, pending: pending.length, issues: bad, pendingCandidates: pending }, null, 2))
  } else {
    console.log(`validate: ${ok.length}/${results.length} ok, ${pending.length} pending, ${bad.length} with issues.`)
    for (const r of bad) console.log(`  ✗ ${r.ref}: ${r.issues.join('; ')}`)
    for (const r of pending) console.log(`  … ${r.ref}: ${r.issues.join('; ')}`)
    if (!bad.length && !pending.length) console.log('All captures pass. Gold out. ✓')
  }
  exit(bad.length ? 3 : pending.length ? 2 : 0)
}

function main() {
  const args = parseArgs(argv.slice(2))
  if (args.help) return console.log(USAGE)
  if (!args.ledger) die('missing --ledger')
  const root = args.root ?? join(findRepoRoot(HERE), 'tmp', 'kb-harvest')

  let l
  try {
    l = JSON.parse(readFileSync(args.ledger, 'utf8'))
  } catch (e) {
    die(`cannot read/parse ledger: ${e.message}`)
  }
  validateLedger(l)

  if (args.status) return runStatus(l, root, args.json)
  if (args.validate) return runValidate(l, root, args.json)
  return runScaffold(l, root, args.capturedAt, args.force)
}

main()
