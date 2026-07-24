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

/* A design is a worked case study. The scaffold carries every block for the kind,
 * including the optional ones (estimation / interface / levels) so the author has the
 * full frame to fill and can delete any that don't apply. The `architecture` block
 * holds the primary mermaid diagram; `tradeoffs` reuses the pattern two-column shape so
 * build-pages stamps citable ids; `relationships` starts empty and is filled by
 * `kb.mjs link <id> demonstrates <pattern>`. */
const DESIGN_BLOCKS = () => [
  PROSE_SECTION("problem", "h-problem", "Understanding the problem", "problem"),
  `    <section class="doc-section" id="requirements" aria-labelledby="h-req" data-kb-block="requirements">
      <h2 class="doc-h" id="h-req">Requirements</h2>
      <div class="requirements">
        <div class="functional">
          <h3>Functional</h3>
          <ol>
            <li>TODO — what a user must be able to do.</li>
          </ol>
        </div>
        <div class="nonfunctional">
          <h3>Non-functional</h3>
          <ul>
            <li>TODO — scale, latency, availability, consistency the design must meet.</li>
          </ul>
        </div>
      </div>
    </section>`,
  PROSE_SECTION("estimation", "h-est", "Back-of-envelope", "estimation"),
  PROSE_SECTION("entities", "h-entities", "Core entities", "entities"),
  PROSE_SECTION("interface", "h-interface", "The interface", "interface"),
  `    <section class="doc-section" id="architecture" aria-labelledby="h-arch" data-kb-block="architecture">
      <h2 class="doc-h" id="h-arch">How the system is built</h2>
      <div class="prose">
        <p>TODO — walk the request and data flow, requirement by requirement.</p>
      </div>
      <figure class="diagram">
        <pre class="mermaid">
flowchart TB
    Client["Client"] --> API["TODO"]
        </pre>
        <figcaption>TODO — one sentence on what the diagram shows.</figcaption>
      </figure>
    </section>`,
  PROSE_SECTION("deepdives", "h-deep", "Deep dives", "deepdives"),
  `    <section class="doc-section" id="tradeoffs" aria-labelledby="h-trade" data-kb-block="tradeoffs">
      <h2 class="doc-h" id="h-trade">Limitations &amp; trade-offs</h2>
      <div class="tradeoffs">
        <div class="col pros">
          <h3>What it buys</h3>
          <ul>
            <li>TODO</li>
          </ul>
        </div>
        <div class="col cons">
          <h3>What it gives up</h3>
          <ul>
            <li>TODO</li>
          </ul>
        </div>
      </div>
    </section>`,
  PROSE_SECTION("levels", "h-levels", "What's expected at each level", "levels"),
  `    <section class="doc-section" id="relationships" aria-labelledby="h-rel" data-kb-block="relationships">
      <h2 class="doc-h" id="h-rel">Patterns it demonstrates</h2>
    </section>`,
].join("\n\n");

/* A principle is a maxim, not a mechanism: four prose blocks plus the standard (empty)
 * relationships section, which `kb.mjs link` fills. `overreach` is mandatory on purpose —
 * every principle has a way of being taken too far, and saying so is what keeps the KB
 * out of dogma. */
const PRINCIPLE_BLOCKS = () => [
  PROSE_SECTION("statement", "h-statement", "What it says", "statement"),
  PROSE_SECTION("rationale", "h-rationale", "Why it helps", "rationale"),
  PROSE_SECTION("applying", "h-applying", "Applying it", "applying"),
  PROSE_SECTION("overreach", "h-overreach", "Taken too far", "overreach"),
  `    <section class="doc-section" id="relationships" aria-labelledby="h-rel" data-kb-block="relationships">
      <h2 class="doc-h" id="h-rel">How it relates</h2>
    </section>`,
].join("\n\n");

export function pageSkeleton({ id, name, kind, band, group, order }) {
  const dir = folderFor({ kind, band, group });
  const p = "../".repeat(dir.split("/").length);
  const b = kind === "pattern" ? bandOf(band) : null;
  const lens = b?.kind === "lens";

  const bodyClass = kind === "pattern" ? (lens ? "doc lens" : "doc") : `doc ${kind}`;
  const kicker = kind === "pattern" ? (lens ? `Lens · ${b.label}` : b.label) : kind === "hazard" ? "Hazard" : kind === "principle" ? "Principle" : kind === "design" ? "Case study" : "Theme";
  const badge = kind === "pattern" ? b.short : kind === "hazard" ? "Hazard" : kind === "principle" ? "Principle" : kind === "design" ? "Design" : "Theme";
  const crumbAnchor = kind === "pattern" ? `#${b.anchor}` : kind === "hazard" ? "#hazards-h" : kind === "principle" ? "#principles-h" : kind === "design" ? "#design-cases-h" : "#themes-h";
  const crumbLabel = kind === "pattern" ? b.label : kind === "hazard" ? "Hazards" : kind === "principle" ? "Principles" : kind === "design" ? "Case studies" : "Themes";

  const blocks =
    kind === "pattern" ? PATTERN_BLOCKS() : kind === "hazard" ? HAZARD_BLOCKS() : kind === "principle" ? PRINCIPLE_BLOCKS() : kind === "design" ? DESIGN_BLOCKS() : THEME_BLOCKS();

  /* Designs may carry a small code sketch (an API shape, a low-level-design class), so
   * they load the highlighter too. */
  const patternScripts = (kind === "pattern" || kind === "design")
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
