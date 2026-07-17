/* template.mjs — the page skeleton behind `kb.mjs new`.
 *
 * Produces a structurally valid page: every mandatory block for the kind, in order,
 * with TODO placeholder prose. It passes `kb.mjs validate --file` on day one; the
 * author replaces the TODOs, wires relationships (kb.mjs link), writes metadata
 * (kb.mjs set), then runs `make all && make check`.
 */
import { band as bandOf, esc, folderFor } from "./model.mjs";

const PATTERN_BLOCKS = () => `    <section class="doc-section" id="description" aria-labelledby="h-desc" data-kb-block="description">
      <h2 class="doc-h" id="h-desc">What it is</h2>
      <div class="prose">
        <p>TODO — what it is, and the force it resolves.</p>
      </div>
    </section>

    <section class="doc-section" id="structure" aria-labelledby="h-structure" data-kb-block="structure">
      <h2 class="doc-h" id="h-structure">How it works</h2>
      <figure class="diagram">
        <pre class="mermaid">
flowchart LR
    A["TODO"] --> B["TODO"]
        </pre>
        <figcaption>TODO — one sentence on what the diagram shows.</figcaption>
      </figure>
    </section>

    <section class="doc-section" id="variations" aria-labelledby="h-var" data-kb-block="variations">
      <h2 class="doc-h" id="h-var">Variations</h2>
      <dl class="variations">
        <dt>TODO variation</dt>
        <dd>TODO — how it differs and when you'd pick it.</dd>
      </dl>
    </section>

    <section class="doc-section" id="tradeoffs" aria-labelledby="h-trade" data-kb-block="tradeoffs">
      <h2 class="doc-h" id="h-trade">Trade-offs</h2>
      <div class="tradeoffs">
        <div class="col pros">
          <h3>Pros</h3>
          <ul>
            <li>TODO</li>
          </ul>
        </div>
        <div class="col cons">
          <h3>Cons</h3>
          <ul>
            <li>TODO</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="doc-section" id="usage" aria-labelledby="h-usage" data-kb-block="usage">
      <h2 class="doc-h" id="h-usage">When to use it</h2>
      <div class="usage">
        <div class="when">
          <h3>Reach for it when</h3>
          <ul>
            <li>TODO</li>
          </ul>
        </div>
        <div class="avoid">
          <h3>Avoid when</h3>
          <ul>
            <li>TODO</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="doc-section" id="sketch" aria-labelledby="h-sketch" data-kb-block="sketch">
      <h2 class="doc-h" id="h-sketch">Code sketch</h2>
      <details class="sketch">
        <summary>TypeScript — TODO one-line description</summary>
<pre><code class="language-typescript" data-kb-lang="typescript">// TODO — a minimal, runnable illustration of the mechanism.
</code></pre>
      </details>
    </section>

    <section class="doc-section" id="relationships" aria-labelledby="h-rel" data-kb-block="relationships">
      <h2 class="doc-h" id="h-rel">How it relates</h2>
    </section>`;

const PROSE_SECTION = (id, anchor, heading, block) => `    <section class="doc-section" id="${id}" aria-labelledby="${anchor}" data-kb-block="${block}">
      <h2 class="doc-h" id="${anchor}">${heading}</h2>
      <div class="prose">
        <p>TODO.</p>
      </div>
    </section>`;

const HAZARD_BLOCKS = () => [
  PROSE_SECTION("description", "h-desc", "What it is", "description"),
  PROSE_SECTION("causes", "h-causes", "How it happens", "causes"),
  PROSE_SECTION("cost", "h-cost", "What it costs", "cost"),
  PROSE_SECTION("mitigation", "h-mitigation", "Getting out", "mitigation"),
].join("\n\n");

const THEME_BLOCKS = () => [
  PROSE_SECTION("framing", "h-framing", "The question", "framing"),
  PROSE_SECTION("tradespace", "h-tradespace", "The tradespace", "tradespace"),
  `    <section class="doc-section" id="tour" aria-labelledby="h-tour" data-kb-block="tour">
      <h2 class="doc-h" id="h-tour">The tour</h2>
      <div class="tour">
      </div>
    </section>`,
  PROSE_SECTION("decide", "h-decide", "How to decide", "decide"),
  PROSE_SECTION("siblings", "h-siblings", "Sibling themes", "siblings"),
].join("\n\n");

export function pageSkeleton({ id, name, kind, band, group, order }) {
  const dir = folderFor({ kind, band, group });
  const p = "../".repeat(dir.split("/").length);
  const b = kind === "pattern" ? bandOf(band) : null;
  const lens = b?.kind === "lens";

  const bodyClass = kind === "pattern" ? (lens ? "doc lens" : "doc") : `doc ${kind}`;
  const kicker = kind === "pattern" ? (lens ? `Lens · ${b.label}` : b.label) : kind === "hazard" ? "Hazard" : "Theme";
  const badge = kind === "pattern" ? b.short : kind === "hazard" ? "Hazard" : "Theme";
  const crumbAnchor = kind === "pattern" ? `#${b.anchor}` : kind === "hazard" ? "#hazards-h" : "#themes-h";
  const crumbLabel = kind === "pattern" ? b.label : kind === "hazard" ? "Hazards" : "Themes";

  const blocks =
    kind === "pattern" ? PATTERN_BLOCKS() : kind === "hazard" ? HAZARD_BLOCKS() : THEME_BLOCKS();

  const patternScripts = kind === "pattern"
    ? `\n  <script src="${p}assets/vendor/highlight.min.js"></script>\n  <script src="${p}assets/sketch.js"></script>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)} · Patterns</title>
  <meta name="description" content="${esc(name)} — TODO.">
  <link rel="stylesheet" href="${p}assets/tokens.css">
  <link rel="stylesheet" href="${p}assets/pattern.css">
  <script src="${p}assets/theme.js"></script>
</head>
<body class="${bodyClass}">
  <main class="doc-wrap" data-kb-id="${id}" data-kb-kind="${kind}" data-kb-band="${band}" data-kb-group="${group}" data-kb-essence="TODO — the terse one-liner" data-kb-order="${order}">

    <nav class="crumb" aria-label="Breadcrumb">
      <a href="${p}index.html">Map</a>
      <span class="sep">▸</span>
      <a href="${p}index.html${crumbAnchor}">${esc(crumbLabel)}</a>
      <span class="sep">▸</span>
      <span aria-current="page">${esc(name)}</span>
    </nav>

    <header class="doc-head">
      <p class="doc-kicker">${esc(kicker)}</p>
      <h1 class="doc-title">${esc(name)}</h1>
      <p class="doc-essence">TODO — the longer definition sentence.</p>
      <div class="doc-metarow">
        <span class="badge">${esc(badge)}</span>
        <label class="practice" title="Mark as practiced (saved in your browser)">
          <input type="checkbox" class="practice-box" data-id="${id}">
          Practiced
        </label>
      </div>
    </header>

${blocks}

    <nav class="docnav" aria-label="Pattern navigation">
      <a class="prev" href="${p}index.html${crumbAnchor}">← ${esc(crumbLabel)}</a>
      <a class="up" href="${p}index.html">↑ The Map</a>
      <a class="next" href="${p}index.html${crumbAnchor}">${esc(crumbLabel)} →</a>
    </nav>
  </main>

  <script src="${p}assets/vendor/mermaid.min.js"></script>
  <script src="${p}assets/diagram.js"></script>
  <script src="${p}assets/progress.js"></script>${patternScripts}
</body>
</html>
`;
}
