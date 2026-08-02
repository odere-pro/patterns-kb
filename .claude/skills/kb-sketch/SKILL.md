---
name: kb-sketch
description: Write or fix a code sketch anywhere in patterns-kb — the details.sketch markup, the closed data-kb-lang language set, the collapsed-by-default rule and its expand-all toggle, the vendored highlight.js grammars, and the hljs token colours. Use when someone says "the schema block isn't highlighted", "the code has no colours", "add a code sketch", "which language do I put on this sketch", "should this sketch be open or closed", "add a language to the sketch vocabulary", "re-vendor highlight.js", or reports code on a page rendering as flat text. Also use to review, evaluate, critique or audit an existing sketch — its language, its summary, its trimming — including when the ask names it by file path or URL fragment.
---

# Code sketches

A sketch is the smallest runnable-looking thing that proves a mechanism: a pattern's
`sketch` block, a design's entity schemas and API contracts, a deep dive's sample. It is one
component with four moving parts — markup, language, disclosure state, colour — and all four
live here.

## The markup

```html
<details class="sketch">
  <summary>schema — flow</summary>
<pre><code class="language-sql" data-kb-lang="sql">CREATE TABLE flow (
  id uuid PRIMARY KEY
);</code></pre>
</details>
```

Four rules, and each has a failure behind it:

- **No `open` attribute.** Sketches are collapsed by default — see below.
- **`class="language-x"` AND `data-kb-lang="x"`, the same `x`.** The class is what
  highlight.js reads; the attribute is what `make check` reads. Drop the attribute and the
  build fails; drop the class and the code silently renders in flat ink.
- **`<pre>` opens at column 0** and the code starts immediately after `<code …>`. `<pre>` is
  a raw-text element: indent it to match the surrounding HTML and that indentation is part of
  the code.
- **The `<summary>` names the thing**, not the block: `schema — flow`, `contract`,
  `worker loop`. Collapsed, the summary is all the reader has, so a summary that says
  "example" costs them a click to find out.

Escape `<`, `>` and `&` inside the code as `&lt;`, `&gt;` and `&amp;` — it is HTML, not a
fenced block.

## The language vocabulary is closed, and the highlighter is gated against it

`data-kb-lang` takes one of the nine ids in `SKETCH_LANGS`
([`scripts/lib/model.mjs`](../../../scripts/lib/model.mjs)):

| id | for |
|---|---|
| `typescript` | the corpus default — types the shapes without demanding a runtime |
| `http` | request/response exchanges, where the wire format is the thing being shown |
| `python` | patterns whose home is data or ML tooling |
| `sql` | schema and query sketches, where the mechanism lives in the database |
| `json` | a payload or config shape on its own |
| `javascript` | code that must run untyped, as shipped browser code does |
| `protobuf` | a schema definition where the contract, not the code, is the point |
| `lua` | embedded scripting, as a gateway or cache runs it |
| `text` | no highlighting — output, logs, anything that is not a language |

Two build gates hold the set closed from both ends:

- `audit-vocab.mjs` fails on a page using an id that is not in the set, **and** on a set
  member no page uses.
- `audit-highlight.mjs` fails on a set member the vendored highlighter has no grammar for.

That second gate exists because its absence shipped for the life of the corpus. The vendored
bundle was built "core + typescript only" and registered exactly one language, so
`hljs.highlight(src, {language: "sql"})` **threw** — highlight.js does not degrade to plain
text on an unknown language — and 122 sketches, including every data schema and every API
contract on a design page, rendered flat. Adding a tenth language means vendoring its grammar
in the same change:

```
# 1. add the entry to SKETCH_LANGS in scripts/lib/model.mjs
# 2. fetch its grammar into the vendored bundle
make highlight
# 3. and the gate goes green
make check
```

`make highlight` (`scripts/audit-highlight.mjs --online`) rebuilds only the half of
`site/assets/vendor/highlight.min.js` below the `kb: language grammars` marker. Everything
above it is a hand-built esbuild bundle of `lib/core` + `lib/languages/typescript` that cdnjs
does not publish, so it is preserved byte for byte and never regenerated.

## Collapsed by default, with an expand-all toggle

**Author no `open`.** A design's entities block runs to sixteen schemas and its interface
block to eleven contracts; expanded, they push the argument that owns the page off the
screen, and the reader scrolls past the prose to reach the next one. Collapsed, the block
reads as an index — which is what makes the `<summary>` rule above load-bearing.

The clicking cost is paid by a control, not by the markup. `site/assets/sketch.js` **injects**
one page-level toggle on any page carrying two or more sketches — `.sketch-toggle`, the same
fixed box as the theme and favourite toggles, but on the **left** edge, and the only thing
there. Its glyph is two stacked triangles rather than a chevron, because a lone `▾` is what
`.section-nav-btn` already means: `▲`over`▼` fuses into a **diamond** that opens, `▼`over`▲`
into an **hourglass** that closes. Nothing is authored for it on any page: the alternative was a markup sweep across
every pattern and design page for a control that is pure presentation.

Its position is the whole lesson. It shipped first as a chip inside the block, right-aligned
under the heading — which put it directly beneath the reading-level lens at the same edge,
where it read as more floating chrome and was reported missing twice while sitting in the DOM
the whole time. A control that competes with other chrome for the same corner is invisible;
alone on the opposite edge it is not. `.doc-wrap` reserves that column with the same
`padding-left` expression the right side already uses.

Two behaviours come with it:

- **Printing opens everything and puts it back.** A printed page has nothing to click, so
  `beforeprint` opens every sketch and `afterprint` restores the snapshot — the reader keeps
  whatever they had already opened.
- **State does not persist between visits.** `collapse.js`'s override store
  (`kb-collapse-v1`) covers the hub's `details[data-collapse]` only; sketches are per-visit.

## Colour comes from the palette, never from a hex

`site/assets/pattern.css` maps the `hljs-*` scopes onto the design tokens, so code themes
with light and dark automatically:

| token | scopes |
|---|---|
| `--accent` | `hljs-keyword`, `hljs-built_in`, `hljs-variable.language_` (`this`, `self`) |
| `--ok` | `hljs-string`, `hljs-regexp` |
| `--brass` | `hljs-number`, `hljs-literal`, `hljs-variable.constant_` |
| `--hazard` | `hljs-title`, `hljs-type`, `hljs-attribute` (an HTTP header name) |
| `--ink-soft` | `hljs-comment`, `hljs-punctuation`, `hljs-operator`, `hljs-meta` |
| `--ink` | `hljs-attr`, `hljs-property`, `hljs-subst` |

**The map is closed against what the corpus actually emits.** Add a rule only after the
tally below says something renders that scope — a stylesheet full of scopes no grammar
produces is indistinguishable from one missing the scope that matters. That is how
`hljs-attribute` was found unstyled while every API contract's headers sat in flat ink, and
how `hljs-subst` was found inheriting the string colour so `${…}` disappeared into the text
around it.

Run the tally after any grammar or CSS change — it highlights every sketch in the corpus with
the shipped bundle and counts the scopes:

```bash
node -e '
const fs=require("fs"), vm=require("vm");
const sb={console}; sb.window=sb; sb.self=sb; sb.globalThis=sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync("site/assets/vendor/highlight.min.js","utf8"),sb);
const h=sb.hljs, t={}; let n=0, fail=0;
const dec=s=>s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,"\"").replace(/&#39;/g,"\x27").replace(/&amp;/g,"&");
for(const f of require("child_process").execSync("grep -rl data-kb-lang site --include=*.html",{encoding:"utf8"}).trim().split("\n")){
  const re=/<code class="language-([a-z]+)" data-kb-lang="[a-z]+">([\s\S]*?)<\/code>/g, src=fs.readFileSync(f,"utf8"); let m;
  while((m=re.exec(src))){ n++;
    try{ (h.highlight(dec(m[2]),{language:m[1],ignoreIllegals:true}).value.match(/class="hljs-[a-z_]+[^"]*"/g)||[])
           .forEach(c=>{t[c.slice(7,-1)]=(t[c.slice(7,-1)]||0)+1;}); }
    catch(e){ fail++; console.log("FAIL",f,m[1],e.message); } } }
console.log(`sketches=${n} failures=${fail}`);
console.log(Object.entries(t).sort((a,b)=>b[1]-a[1]).map(([k,v])=>String(v).padStart(6)+"  "+k).join("\n"));'
```

`failures=0` is the bar. Anything else means a grammar is missing and `make check` should
already have said so.

## What belongs in a sketch

- **The smallest code that shows the mechanism working**, and nothing that shows it being
  set up. Imports, boilerplate, error handling that is not the point: cut.
- **Trim with `…`**, not with silence — `-- … name, timestamps …` tells the reader a column
  list was cut; deleting it tells them the table has four columns.
- **Comments carry the argument.** In a schema, the constraint's reason belongs beside it; in
  a contract, the annotation right of a header says what it is for. This is the one place in
  the corpus where a comment is doing the writing.
- **Never invent an API.** A named parameter, method or field in a sketch is a factual claim
  about a real system as much as anything in an "In the wild" block. When unsure, describe
  the shape generically rather than attributing it to a product.

## Where the rest of a sketch's context lives

A sketch inside a design's data or API block also answers to that block's own shape — how
entities are grouped, what an endpoint card carries — which is **kb-design-entities** and
**kb-design-interface**. A pattern's dedicated `sketch` block sits in the block order that
**kb-pattern-blocks** owns. The client script is **kb-site-ui**'s file and the stylesheet is
**kb-styles**'; this skill owns what they do for sketches specifically.
