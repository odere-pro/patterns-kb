/* diagram.js — initialize the locally-vendored mermaid, themed from the active palette.
   Load AFTER vendor/mermaid.min.js. Renders every <pre class="mermaid"> / .mermaid block. */
(function () {
  "use strict";
  if (typeof mermaid === "undefined") return;

  var css = getComputedStyle(document.documentElement);
  var v = function (name, fallback) {
    var got = css.getPropertyValue(name);
    return (got && got.trim()) || fallback;
  };

  var ink = v("--ink", "#14202E");
  var inkSoft = v("--ink-soft", "#51606F");
  var line = v("--line", "#C7D2DE");
  var accent = v("--accent", "#1D5FA8");
  var accentSoft = v("--accent-soft", "#E3ECF6");
  var paperRaised = v("--paper-raised", "#FFFFFF");

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    themeVariables: {
      background: paperRaised,
      primaryColor: accentSoft,
      primaryBorderColor: accent,
      primaryTextColor: ink,
      secondaryColor: paperRaised,
      secondaryBorderColor: line,
      tertiaryColor: paperRaised,
      tertiaryBorderColor: line,
      lineColor: inkSoft,
      textColor: ink,
      mainBkg: accentSoft,
      nodeBorder: accent,
      clusterBkg: paperRaised,
      clusterBorder: line,
      edgeLabelBackground: paperRaised,
      fontSize: "14px"
    }
  });

  try {
    mermaid.run({ querySelector: ".mermaid" });
  } catch (e) {
    if (window.console) console.warn("mermaid render failed:", e);
  }
})();
