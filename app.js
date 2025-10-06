// Controller module for Hotspot Routing (ES Modules)
import { state } from "./state.js";
import { durationKey } from "./utils.js";
import { loadApiKeyFromEnv } from "./services.js";
import { computeGreedyRoute, buildFullDurationMatrix, heldKarpPathTSP } from "./algorithms.js";
import { initMap, renderHotspotSelection, renderMarkers, drawRoute, renderDurationLabels, renderResultsSegments, renderAlternativeSegments } from "./rendering.js";

async function loadHotspots() {
  try {
    const res = await fetch("hotspots.json");
    if (!res.ok) throw new Error("Failed to load hotspots.json");
    state.hotspots = await res.json();
    state.selected = new Set();
    renderMarkers();
    renderHotspotSelection();
    await loadApiKeyFromEnv();
  } catch (e) {
    alert("Error loading hotspots: " + e.message);
  }
}

async function computeRoute() {
  if (!state.hotspots?.length) {
    alert("Please load hotspots first.");
    return;
  }
  const selectedIdx = Array.from(state.selected);
  if (selectedIdx.length < 2) {
    alert("Please select at least two hotspots.");
    return;
  }
  const startIdx = Number(document.getElementById("startSelect").value);
  const endIdx = Number(document.getElementById("endSelect").value);

  state.isComputing = true;
  const btn = document.getElementById("computeBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "計算中...";
  }

  try {
    if (selectedIdx.length < 15) {
      const assumedSpeedKmh = 40;
      const matrix = await buildFullDurationMatrix(selectedIdx, assumedSpeedKmh);
      const orderGlobal = heldKarpPathTSP(matrix, selectedIdx, startIdx, endIdx);
      const segments = [];
      for (let i = 0; i < orderGlobal.length - 1; i++) {
        const a = orderGlobal[i];
        const b = orderGlobal[i + 1];
        let sec = state.durationCache.get(durationKey(a, b));
        if (sec == null) {
          const pA = selectedIdx.indexOf(a);
          const pB = selectedIdx.indexOf(b);
          sec = matrix[pA][pB];
        }
        segments.push(sec);
        state.durationCache.set(durationKey(a, b), sec);
      }
      drawRoute(orderGlobal);
      renderDurationLabels(orderGlobal, segments);
      renderResultsSegments(orderGlobal, segments);
      const alternativeSegments = [];
      for (let i = 0; i < orderGlobal.length - 1; i++) {
        const a = orderGlobal[i];
        const b = orderGlobal[i + 1];
        const pA = selectedIdx.indexOf(a);
        let bestC = null;
        let bestSec = Infinity;
        for (let j = 0; j < selectedIdx.length; j++) {
          const cIdx = selectedIdx[j];
          if (cIdx === a || cIdx === b) continue;
          const secC = matrix[pA][j];
          if (Number.isFinite(secC) && secC < bestSec) {
            bestSec = secC;
            bestC = cIdx;
          }
        }
        if (bestC != null) {
          alternativeSegments.push({ from: a, to: bestC, durationSec: bestSec });
        }
      }
      renderAlternativeSegments(alternativeSegments);
      return;
    }
    const { orderGlobal, segments, alternativeSegments } = await computeGreedyRoute(selectedIdx, startIdx, endIdx);
    drawRoute(orderGlobal);
    renderDurationLabels(orderGlobal, segments);
    renderResultsSegments(orderGlobal, segments);
    renderAlternativeSegments(alternativeSegments);
  } catch (e) {
    alert("Error computing route: " + e.message);
  } finally {
    state.isComputing = false;
    const btn2 = document.getElementById("computeBtn");
    if (btn2) {
      btn2.disabled = false;
      btn2.textContent = "Compute Route";
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initMap();
  loadHotspots();
  const btn = document.getElementById("computeBtn");
  if (btn) btn.addEventListener("click", computeRoute);
  const toggle = document.getElementById("toggleAllSegments");
  if (toggle) {
    toggle.addEventListener("change", (e) => {
      state.showAllSegments = e.target.checked;
      // re-render alternative segments according to toggle
      renderAlternativeSegments([]);
    });
  }
});