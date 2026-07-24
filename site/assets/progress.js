/* progress.js — shared "practiced" tracking for the hub and every pattern page.
   One localStorage store keyed by data-id, so a toggle anywhere is reflected everywhere.
   Hub chips use input.chip-box; individual pages use input.practice-box. */
(function () {
  "use strict";
  var STORAGE_KEY = "elevation-map-progress-v1";

  var state = {};
  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {}; }
  catch (e) { state = {}; }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  var boxes = Array.prototype.slice.call(
    document.querySelectorAll("input.chip-box[data-id], input.practice-box[data-id]")
  );

  function doneTarget(cb) {
    return cb.closest(".chip") || cb.closest(".practice");
  }

  // Hub-only counters (absent on individual pages — guarded).
  function render() {
    var groupTotals = {}, bandTotals = {}, done = 0, total = 0;
    boxes.forEach(function (cb) {
      if (!cb.classList.contains("chip-box")) return; // only hub chips feed counts
      var g = cb.getAttribute("data-group");
      var b = cb.getAttribute("data-band");
      if (g) { (groupTotals[g] = groupTotals[g] || { d: 0, t: 0 }).t++; }
      if (b) { (bandTotals[b] = bandTotals[b] || { d: 0, t: 0 }).t++; }
      total++;
      if (cb.checked) { done++; if (g) groupTotals[g].d++; if (b) bandTotals[b].d++; }
    });
    Object.keys(groupTotals).forEach(function (g) {
      document.querySelectorAll('[data-count-group="' + g + '"]').forEach(function (el) {
        el.textContent = groupTotals[g].d + "/" + groupTotals[g].t;
      });
    });
    Object.keys(bandTotals).forEach(function (b) {
      document.querySelectorAll('[data-count-band="' + b + '"]').forEach(function (el) {
        el.textContent = bandTotals[b].d + "/" + bandTotals[b].t;
      });
    });
    var gp = document.getElementById("global-progress");
    if (gp) gp.textContent = done + " / " + total + " practiced";
  }

  boxes.forEach(function (cb) {
    var id = cb.getAttribute("data-id");
    var tgt = doneTarget(cb);
    if (state[id]) { cb.checked = true; if (tgt) tgt.classList.add("is-done"); }
    cb.addEventListener("change", function () {
      state[id] = cb.checked;
      persist();
      if (tgt) tgt.classList.toggle("is-done", cb.checked);
      render();
    });
  });

  render();

  var reset = document.getElementById("reset-btn");
  if (reset) {
    reset.addEventListener("click", function () {
      state = {};
      persist();
      boxes.forEach(function (cb) {
        cb.checked = false;
        var tgt = doneTarget(cb);
        if (tgt) tgt.classList.remove("is-done");
      });
      render();
    });
  }
})();
