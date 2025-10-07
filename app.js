// Controller module for Hotspot Routing (ES Modules)
import { state } from "./state.js";
import { durationKey } from "./utils.js";
import { loadApiKeyFromEnv, seedMockDurationsForSelection } from "./services.js";
import { computeGreedyRoute, buildFullDurationMatrix, heldKarpPathTSP } from "./algorithms.js";
import { initMap, renderHotspotSelection, renderMarkers, drawRoute, renderResultsSegments, renderAlternativeSegments, bindRouteTooltips } from "./rendering.js";

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
  const endVal = document.getElementById("endSelect").value;
  const endIsAnywhere = endVal === "ANYWHERE";
  const endIdx = endIsAnywhere ? null : Number(endVal);

  // Validate start/end are among selected when required
  if (!selectedIdx.includes(startIdx)) {
    alert("Start must be among selected hotspots.");
    return;
  }
  if (!endIsAnywhere && !selectedIdx.includes(endIdx)) {
    alert("End must be among selected hotspots or set to Anywhere.");
    return;
  }

  state.isComputing = true;
  const btn = document.getElementById("computeBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Computing...";
  }

  try {
    if (selectedIdx.length <= 20) {
      const assumedSpeedKmh = 40;
      if (state.useMockApi) {
        seedMockDurationsForSelection(selectedIdx);
      }
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
      bindRouteTooltips(orderGlobal, segments);
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
      // Auto-open results on mobile
      const rightbar = document.querySelector(".rightbar");
      if (window.innerWidth <= 768 && rightbar) {
        rightbar.classList.add("open");
        rightbar.classList.remove("hidden");
        const overlay = document.getElementById("overlay");
        if (overlay) overlay.classList.add("show");
        const resultsToggle = document.getElementById("resultsToggle");
        if (resultsToggle) resultsToggle.setAttribute("aria-expanded", "true");
      }
      return;
    }
    if (state.useMockApi) {
      seedMockDurationsForSelection(selectedIdx);
    }
    const { orderGlobal, segments, alternativeSegments } = await computeGreedyRoute(selectedIdx, startIdx, endIdx);
    drawRoute(orderGlobal);
    bindRouteTooltips(orderGlobal, segments);
    // duration labels removed; tooltips will be handled inside rendering
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
  const headerCompute = document.getElementById("headerCompute");
  if (headerCompute) {
    headerCompute.addEventListener("click", () => {
      computeRoute();
    });
  }
  const toggle = document.getElementById("toggleAllSegments");
  if (toggle) {
    toggle.addEventListener("change", (e) => {
      state.showAllSegments = e.target.checked;
      // re-render alternative segments according to toggle
      renderAlternativeSegments([]);
    });
  }
  // duration label toggle removed
  const mockToggle = document.getElementById("toggleMockApi");
  if (mockToggle) {
    mockToggle.checked = state.useMockApi;
    mockToggle.addEventListener("change", (e) => {
      state.useMockApi = e.target.checked;
      // Clear cached durations when switching modes to avoid confusion
      state.durationCache.clear();
    });
  }
  // Mobile toggles: sidebar drawer and results bottom sheet
  const menuToggle = document.getElementById("menuToggle");
  const resultsToggle = document.getElementById("resultsToggle");
  const sidebar = document.querySelector(".sidebar");
  const rightbar = document.querySelector(".rightbar");
  const overlay = document.getElementById("overlay");
  function closeAllPanels() {
    if (sidebar) sidebar.classList.remove("open");
    if (rightbar) rightbar.classList.remove("open");
    if (overlay) overlay.classList.remove("show");
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
    if (resultsToggle) resultsToggle.setAttribute("aria-expanded", "false");
  }
  function openSidebar() {
    if (!sidebar) return;
    sidebar.classList.add("open");
    if (overlay) overlay.classList.add("show");
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "true");
  }
  function openResults() {
    if (!rightbar) return;
    rightbar.classList.add("open");
    rightbar.classList.remove("hidden");
    if (overlay) overlay.classList.add("show");
    if (resultsToggle) resultsToggle.setAttribute("aria-expanded", "true");
  }
  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      const isOpen = sidebar && sidebar.classList.contains("open");
      if (isOpen) {
        closeAllPanels();
      } else {
        openSidebar();
      }
    });
  }
  if (resultsToggle) {
    resultsToggle.addEventListener("click", () => {
      const isOpen = rightbar && rightbar.classList.contains("open");
      if (isOpen) {
        closeAllPanels();
      } else {
        openResults();
      }
    });
  }
  if (overlay) {
    overlay.addEventListener("click", () => {
      closeAllPanels();
    });
  }
  // Mobile FAB compute button
  // remove mapFabCompute button handler
  // (deleted)
});