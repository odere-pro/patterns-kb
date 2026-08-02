/* diagram.js — initialize the locally-vendored mermaid, themed from the active palette.
   Load AFTER vendor/mermaid.min.js. Renders every <pre class="mermaid"> / .mermaid block
   the reading-level lens currently shows, and re-renders with fresh palette values when
   the theme changes (toggle or OS) or the lens reveals more. */
(function () {
  "use strict";
  if (typeof mermaid === "undefined") return;

  var blocks = document.querySelectorAll(".mermaid");
  Array.prototype.forEach.call(blocks, function (el) {
    if (!el.dataset.src) el.dataset.src = el.textContent;
  });

  /* A block the lens hides has no box to measure, and mermaid renders it as its
     "Syntax error in text" placeholder instead of the diagram. Render only what is
     laid out; kb-lens-change renders the rest at the moment the lens reveals them. */
  function laidOut(el) {
    return el.getClientRects().length > 0;
  }

  function warn(e) {
    if (window.console) console.warn("mermaid render failed:", e);
  }

  /* diagram-zoom.js sizes its stage from the rendered SVG, which does not exist until
     mermaid.run resolves — and rerender() below throws every SVG away on a theme or lens
     change. Announcing the end of a render pass is deterministic; a MutationObserver over 628
     figures, or polling, is not. Fired on every path including the empty one, so a listener
     can read it as "the render cycle is over" rather than "something changed". */
  function announce() {
    document.dispatchEvent(new CustomEvent("kb-diagram-render"));
  }

  function render() {
    var css = getComputedStyle(document.documentElement);
    var v = function (name, fallback) {
      var got = css.getPropertyValue(name);
      return (got && got.trim()) || fallback;
    };

    var ink = v("--ink", "#14202E");
    var line = v("--line", "#C7D2DE");
    var accent = v("--accent", "#1D5FA8");
    var accentSoft = v("--accent-soft", "#E3ECF6");
    var paperRaised = v("--paper-raised", "#FFFFFF");
    var brass = v("--brass", "#8A6A1E");
    var brassSoft = v("--brass-soft", "#F2ECDA");

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      /* An erDiagram used to render at natural size (`er: { useMaxWidth: false }`) because
         scaling a dozen tables down to the container made the column text unreadable. That
         traded one failure for another: the schema became enormous and you lost your place
         scrolling around inside it. diagram-zoom.js answers both — every diagram now fits its
         column and zooms on demand — so ER goes back to fitting like every other kind. */
      themeVariables: {
        background: paperRaised,
        primaryColor: accentSoft,
        primaryBorderColor: accent,
        primaryTextColor: ink,
        secondaryColor: paperRaised,
        secondaryBorderColor: line,
        tertiaryColor: paperRaised,
        tertiaryBorderColor: line,
        /* Edges, arrowheads and signal lines are hairlines: derive them from --ink,
           not --ink-soft, or they wash out against the dark paper. */
        lineColor: ink,
        textColor: ink,
        titleColor: ink,
        mainBkg: accentSoft,
        nodeBorder: accent,
        clusterBkg: paperRaised,
        clusterBorder: line,
        edgeLabelBackground: paperRaised,
        actorTextColor: ink,
        signalColor: ink,
        signalTextColor: ink,
        /* mermaid leaves notes and activation bars unthemed — a fixed #fff5ad note and
           an activation bar shaded from the background. Both break in dark mode: the
           note glares, the bar disappears. Pin both to palette tokens. */
        noteBkgColor: brassSoft,
        noteBorderColor: brass,
        noteTextColor: ink,
        activationBkgColor: accentSoft,
        activationBorderColor: accent,
        sequenceNumberColor: paperRaised,
        /* An erDiagram zebra-stripes its attribute rows from two variables mermaid leaves
           at #ffffff and #f2f2f2 whatever the theme is, so against dark paper — where --ink
           is near-white — every other row rendered white-on-white and the schema looked
           half empty. Both stripes are pinned to the SAME token deliberately: the row text
           is --ink, and any second fill has to be legible against --ink in both themes at
           once, which an accent tint is not. Mermaid still draws the cell borders, so the
           rows stay separable without a fill carrying that job. */
        attributeBackgroundColorOdd: paperRaised,
        attributeBackgroundColorEven: paperRaised,
        /* An erDiagram's relationship labels sit on their own filled plate, and mermaid
           derives that fill from `labelBackground` rather than from edgeLabelBackground
           above — left unset it resolves light in both themes, so the label text vanished
           against it on dark paper. */
        labelBackground: paperRaised,
        fontSize: "14px"
      }
    });

    var pending = Array.prototype.filter.call(blocks, laidOut);
    if (!pending.length) { announce(); return; }

    try {
      var done = mermaid.run({ nodes: pending });
      if (done && done.then) done.then(announce, function (e) { warn(e); announce(); });
      else announce();
    } catch (e) {
      warn(e);
      announce();
    }
  }

  function rerender() {
    Array.prototype.forEach.call(blocks, function (el) {
      el.removeAttribute("data-processed");
      el.textContent = el.dataset.src;
    });
    render();
  }

  render();

  document.addEventListener("kb-theme-change", rerender);
  // The lens both reveals blocks that were never rendered and changes the width the
  // visible ones must lay out in, so it needs the same full pass as a theme change.
  document.addEventListener("kb-lens-change", rerender);
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", rerender);
  }
})();
