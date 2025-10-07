import { state } from "./state.js";
import { markerStyle, formatDuration, estimateDurationBetween, durationKey } from "./utils.js";

export function initMap() {
  state.map = L.map("map").setView([1.3521, 103.8198], 11);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    subdomains: "abcd",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  }).addTo(state.map);
  // Create a dedicated pane for lines so they stay below markers
  const linePane = state.map.createPane("linePane");
  // Ensure this is below markerPane (default z-index 600) but above tiles
  linePane.style.zIndex = 500;
}

export function clearMap() {
  state.markers.forEach((m) => m.remove());
  state.markers = [];
  if (state.polyline) {
    state.polyline.remove();
    state.polyline = null;
  }
  if (state.altPolylines && state.altPolylines.length) {
    state.altPolylines.forEach((p) => p.remove());
    state.altPolylines = [];
  }
  if (state.segmentPolylines && state.segmentPolylines.length) {
    state.segmentPolylines.forEach((p) => p.remove());
    state.segmentPolylines = [];
  }
}

export function renderMarkers() {
  clearMap();
  if (!state.hotspots?.length) return;
  const bounds = [];
  state.hotspots.forEach((h, idx) => {
    const selected = state.selected.has(idx);
    const marker = L.circleMarker([h.lat, h.lng], { ...markerStyle(selected), pane: "markerPane" }).addTo(state.map);
    marker.bindPopup(`<strong>${h.name}</strong>`);
    marker.on("click", (e) => {
      // Prevent accidental selection changes when NxN alt lines are shown
      if (state.showAllSegments) {
        if (e && e.originalEvent && typeof e.originalEvent.preventDefault === "function") {
          e.originalEvent.preventDefault();
        }
        return;
      }
      toggleSelection(idx);
    });
    // Hover highlight for NxN alt lines
    marker.on("mouseover", () => {
      if (state.altPolylines && state.altPolylines.length) {
        highlightAltLinesForSpot(idx);
      }
    });
    marker.on("mouseout", () => {
      resetAltLinesStyle();
    });
    state.markers.push(marker);
    bounds.push([h.lat, h.lng]);
  });
  if (bounds.length) {
    state.map.fitBounds(bounds, { padding: [20, 20] });
  }
}

export function drawRoute(order) {
  const latlngs = [];
  for (const idx of order) {
    const spot = state.hotspots[idx];
    if (!spot || spot.lat == null || spot.lng == null) {
      // skip invalid indices to avoid runtime errors
      continue;
    }
    latlngs.push([spot.lat, spot.lng]);
  }
  if (!latlngs.length) return;
  if (state.polyline) state.polyline.remove();
  state.polyline = L.polyline(latlngs, { color: "#2563eb", weight: 4, pane: "linePane" }).addTo(state.map);
  state.map.fitBounds(state.polyline.getBounds(), { padding: [30, 30] });
}

// Bind tooltips to route segments (main route)
export function bindRouteTooltips(orderGlobal, segments) {
  // remove previous segment polylines
  if (state.segmentPolylines && state.segmentPolylines.length) {
    state.segmentPolylines.forEach((p) => p.remove());
    state.segmentPolylines = [];
  }
  for (let i = 0; i < orderGlobal.length - 1; i++) {
    const a = state.hotspots[orderGlobal[i]];
    const b = state.hotspots[orderGlobal[i + 1]];
    if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
      continue;
    }
    const latlngs = [[a.lat, a.lng], [b.lat, b.lng]];
    const segLine = L.polyline(latlngs, { color: "#2563eb", weight: 4, opacity: 0.75, pane: "linePane" }).addTo(state.map);
    const seg = segments[i];
    const text = isFinite(seg) ? formatDuration(seg) : "N/A";
    segLine.bindTooltip(text, { permanent: true, direction: "top", opacity: 0.95, className: "seg-tooltip" });
    state.segmentPolylines.push(segLine);
  }
}

export function renderResultsSegments(orderGlobal, segments) {
  const summaryEl = document.getElementById("summary");
  const listEl = document.getElementById("orderList");
  const rightbar = document.querySelector(".rightbar");
  // Toggle visibility: show only when there is a result
  if (!orderGlobal || orderGlobal.length === 0) {
    if (rightbar) rightbar.classList.add("hidden");
    listEl.innerHTML = "";
    summaryEl.innerHTML = "";
    return;
  } else {
    if (rightbar) rightbar.classList.remove("hidden");
  }
  listEl.innerHTML = "";
  listEl.classList.add("gm-simple");
  let total = 0;

  // Show the first spot once (no hyphen)
  if (orderGlobal && orderGlobal.length > 0) {
    const firstIdx = orderGlobal[0];
    const firstName = state.hotspots[firstIdx] && state.hotspots[firstIdx].name;
    if (firstName) {
      const liFirst = document.createElement("li");
      liFirst.className = "gm-row";
      liFirst.innerHTML = `<div class="gm-line">${firstName}</div>`;
      listEl.appendChild(liFirst);
    }
  }

  // For each segment, show a simple duration line (no arrows) and then the next spot once
  for (let i = 0; i < orderGlobal.length - 1; i++) {
    const bGlobal = orderGlobal[i + 1];
    const seg = segments[i];
    total += isFinite(seg) ? seg : 0;
    const toName = state.hotspots[bGlobal].name;
    const durText = isFinite(seg) ? formatDuration(seg) : "N/A";
    const li = document.createElement("li");
    li.className = "gm-row";
    li.innerHTML = `
      <div class="gm-segline"><span class="gm-duration">${durText}</span></div>
      <div class="gm-line">${toName}</div>
    `;
    listEl.appendChild(li);
  }
  summaryEl.innerHTML = `<div class="gm-summary-card"><span class="gm-summary-title">Total</span> <span class="gm-summary-duration">${formatDuration(total)}</span> <span class="gm-summary-mode">(mode: ${state.mode})</span></div>`;
}

export function renderAlternativeSegments(segments) {
  if (state.altPolylines && state.altPolylines.length) {
    state.altPolylines.forEach((p) => p.remove());
    state.altPolylines = [];
  }
  // alt label markers removed
  // If checkbox is OFF, do not draw any dashed segments
  if (!state.showAllSegments) {
    return;
  }
  // If segments provided (Greedy/Held-Karp alternatives), draw only those considered
  if (Array.isArray(segments) && segments.length > 0) {
    for (const seg of segments) {
      const aIdx = seg.from;
      const bIdx = seg.to;
      const a = state.hotspots[aIdx];
      const b = state.hotspots[bIdx];
      if (!a || !b) continue;
      const latlngs = [[a.lat, a.lng], [b.lat, b.lng]];
      const poly = L.polyline(latlngs, {
        color: "#6b7280",
        weight: 2,
        opacity: 0.5,
        dashArray: "6, 6",
        className: "gm-altline",
        pane: "linePane",
      }).addTo(state.map);
      poly.gmMeta = { aIdx, bIdx, base: { color: "#6b7280", weight: 2, opacity: 0.5, dashArray: "6, 6" } };
      // Hovering a dashed alt line should also trigger highlight for both endpoints
      poly.on("mouseover", () => {
        highlightAltLinesForSpots([aIdx, bIdx]);
      });
      poly.on("mouseout", () => {
        resetAltLinesStyle();
      });
      state.altPolylines.push(poly);
      const mid = [(a.lat + b.lat) / 2, (a.lng + b.lng) / 2];
      let sec = seg.durationSec;
      if (sec == null || !Number.isFinite(sec)) {
        const keyAB = durationKey(aIdx, bIdx);
        const keyBA = durationKey(bIdx, aIdx);
        sec = state.durationCache.get(keyAB);
        if (sec == null) sec = state.durationCache.get(keyBA);
        if (sec == null || !Number.isFinite(sec)) {
          const assumedSpeedKmh = 40;
          sec = estimateDurationBetween(aIdx, bIdx, assumedSpeedKmh);
        }
      }
      const text = Number.isFinite(sec) ? formatDuration(sec) : "N/A";
      poly.bindTooltip(text, { permanent: true, direction: "top", opacity: 0.9, className: "seg-tooltip alt" });
    }
    return;
  }
  // Otherwise, draw NxN dashed segments. If selection is empty, use all hotspots.
  const selectedIdx = Array.from(state.selected);
  const idxList = selectedIdx.length > 0 ? selectedIdx : state.hotspots.map((_, i) => i);
  for (let i = 0; i < idxList.length; i++) {
    for (let j = i + 1; j < idxList.length; j++) {
      const aIdx = idxList[i];
      const bIdx = idxList[j];
      const a = state.hotspots[aIdx];
      const b = state.hotspots[bIdx];
      if (!a || !b) continue;
      const latlngs = [[a.lat, a.lng], [b.lat, b.lng]];
      const poly = L.polyline(latlngs, {
        color: "#6b7280",
        weight: 2,
        opacity: 0.4,
        dashArray: "6, 6",
        className: "gm-altline",
        pane: "linePane",
      }).addTo(state.map);
      poly.gmMeta = { aIdx, bIdx, base: { color: "#6b7280", weight: 2, opacity: 0.4, dashArray: "6, 6" } };
      // Hovering a dashed alt line should also trigger highlight for both endpoints
      poly.on("mouseover", () => {
        highlightAltLinesForSpots([aIdx, bIdx]);
      });
      poly.on("mouseout", () => {
        resetAltLinesStyle();
      });
      state.altPolylines.push(poly);
      const mid = [(a.lat + b.lat) / 2, (a.lng + b.lng) / 2];
      const keyAB = durationKey(aIdx, bIdx);
      const keyBA = durationKey(bIdx, aIdx);
      let sec = state.durationCache.get(keyAB);
      if (sec == null) sec = state.durationCache.get(keyBA);
      if (sec == null || !Number.isFinite(sec)) {
        const assumedSpeedKmh = 40;
        sec = estimateDurationBetween(aIdx, bIdx, assumedSpeedKmh);
      }
      const text = Number.isFinite(sec) ? formatDuration(sec) : "N/A";
      poly.bindTooltip(text, { permanent: true, direction: "top", opacity: 0.9, className: "seg-tooltip alt" });
    }
  }
}

// Highlight alternative dashed lines connected to a specific hotspot (NxN view)
export function highlightAltLinesForSpot(spotIdx) {
  if (!state.altPolylines || state.altPolylines.length === 0) return;
  state.altPolylines.forEach((p) => {
    const meta = p.gmMeta;
    if (!meta) return;
    if (meta.aIdx === spotIdx || meta.bIdx === spotIdx) {
      p.setStyle({
        color: "#22c55e", // green accent color for highlight
        weight: Math.max((meta.base.weight ?? 2) + 3, 4),
        opacity: 1,
        dashArray: meta.base.dashArray,
      });
      const el = p._path;
      if (el) {
        el.classList.add("gm-altline-pop");
      }
      const tt = typeof p.getTooltip === "function" ? p.getTooltip() : (p._tooltip || null);
      if (tt && tt._container) {
        tt._container.classList.add("highlight");
        const ct = tt._container.querySelector(".leaflet-tooltip-content");
        if (ct) ct.classList.add("highlight");
      }
    } else {
      p.setStyle({
        color: meta.base.color,
        weight: meta.base.weight,
        opacity: Math.max(0.1, (meta.base.opacity ?? 0.5) * 0.25),
        dashArray: meta.base.dashArray,
      });
      const el2 = p._path;
      if (el2) {
        el2.classList.remove("gm-altline-pop");
      }
      const tt2 = typeof p.getTooltip === "function" ? p.getTooltip() : (p._tooltip || null);
      if (tt2 && tt2._container) {
        tt2._container.classList.remove("highlight");
        const ct2 = tt2._container.querySelector(".leaflet-tooltip-content");
        if (ct2) ct2.classList.remove("highlight");
      }
    }
  });
}

// Reset alternative dashed lines to their original style
export function resetAltLinesStyle() {
  if (!state.altPolylines || state.altPolylines.length === 0) return;
  state.altPolylines.forEach((p) => {
    const base = p.gmMeta?.base;
    if (base) {
      p.setStyle(base);
    }
    const el = p._path;
    if (el) {
      el.classList.remove("gm-altline-pop");
    }
    const tt = typeof p.getTooltip === "function" ? p.getTooltip() : (p._tooltip || null);
    if (tt && tt._container) {
      tt._container.classList.remove("highlight");
      const ct = tt._container.querySelector(".leaflet-tooltip-content");
      if (ct) ct.classList.remove("highlight");
    }
  });
}

// Highlight alternative dashed lines connected to any of given hotspots
export function highlightAltLinesForSpots(spotIdxs) {
  if (!state.altPolylines || state.altPolylines.length === 0) return;
  state.altPolylines.forEach((p) => {
    const meta = p.gmMeta;
    if (!meta) return;
    const related = spotIdxs.includes(meta.aIdx) || spotIdxs.includes(meta.bIdx);
    if (related) {
      p.setStyle({
        color: "#22c55e",
        weight: Math.max((meta.base.weight ?? 2) + 3, 4),
        opacity: 1,
        dashArray: meta.base.dashArray,
      });
      const el = p._path;
      if (el) {
        el.classList.add("gm-altline-pop");
      }
      const tt = typeof p.getTooltip === "function" ? p.getTooltip() : (p._tooltip || null);
      if (tt && tt._container) {
        tt._container.classList.add("highlight");
        const ct = tt._container.querySelector(".leaflet-tooltip-content");
        if (ct) ct.classList.add("highlight");
      }
    } else {
      p.setStyle({
        color: meta.base.color,
        weight: meta.base.weight,
        opacity: Math.max(0.1, (meta.base.opacity ?? 0.5) * 0.25),
        dashArray: meta.base.dashArray,
      });
      const el2 = p._path;
      if (el2) {
        el2.classList.remove("gm-altline-pop");
      }
      const tt2 = typeof p.getTooltip === "function" ? p.getTooltip() : (p._tooltip || null);
      if (tt2 && tt2._container) {
        tt2._container.classList.remove("highlight");
        const ct2 = tt2._container.querySelector(".leaflet-tooltip-content");
        if (ct2) ct2.classList.remove("highlight");
      }
    }
  });
}

export function toggleSelection(idx) {
  if (state.selected.has(idx)) {
    state.selected.delete(idx);
    // remove from selectionOrder
    const pos = state.selectionOrder.indexOf(idx);
    if (pos !== -1) state.selectionOrder.splice(pos, 1);
  } else {
    state.selected.add(idx);
    state.selectionOrder.push(idx);
  }
  // dynamic start/end update based on selection order
  const startSel = document.getElementById("startSelect");
  const endSel = document.getElementById("endSelect");
  if (state.selectionOrder.length >= 1 && startSel) {
    startSel.value = String(state.selectionOrder[0]);
  }
  if (state.selectionOrder.length >= 2 && endSel && endSel.value !== "ANYWHERE") {
    endSel.value = String(state.selectionOrder[state.selectionOrder.length - 1]);
  }
  const list = document.getElementById("hotspotList");
  const wrapper = list.children[idx];
  const card = wrapper ? wrapper.querySelector(".hotspot-card") : null;
  if (card) {
    card.classList.toggle("selected", state.selected.has(idx));
    card.setAttribute("aria-pressed", state.selected.has(idx) ? "true" : "false");
  }
  renderMarkers();
  // If NxN dashed segments are enabled, re-render them to reflect selection changes
  if (state.showAllSegments) {
    renderAlternativeSegments([]);
  }
}

export function renderHotspotSelection() {
  const list = document.getElementById("hotspotList");
  const startSel = document.getElementById("startSelect");
  const endSel = document.getElementById("endSelect");
  list.innerHTML = "";
  startSel.innerHTML = "";
  endSel.innerHTML = "";
  state.hotspots.forEach((h, idx) => {
    const wrapper = document.createElement("div");
    wrapper.className = "hotspot-item";

    const card = document.createElement("div");
    card.className = "hotspot-card" + (state.selected.has(idx) ? " selected" : "");
    card.textContent = h.name;
    card.title = h.name;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-pressed", state.selected.has(idx) ? "true" : "false");

    card.addEventListener("click", (ev) => {
      if (state.showAllSegments) {
        ev.preventDefault();
        return;
      }
      toggleSelection(idx);
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        if (state.showAllSegments) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        toggleSelection(idx);
      }
    });
    // Hover highlight from hotspot card as well
    card.addEventListener("mouseenter", () => {
      if (state.altPolylines && state.altPolylines.length) {
        highlightAltLinesForSpot(idx);
      }
    });
    card.addEventListener("mouseleave", () => {
      resetAltLinesStyle();
    });

    wrapper.appendChild(card);
    list.appendChild(wrapper);

    const opt1 = document.createElement("option");
    opt1.value = String(idx);
    opt1.textContent = h.name;
    startSel.appendChild(opt1);
  const opt2 = document.createElement("option");
  opt2.value = String(idx);
  opt2.textContent = h.name;
  endSel.appendChild(opt2);
  });
  // Add Anywhere option for End
  const optAnywhere = document.createElement("option");
  optAnywhere.value = "ANYWHERE";
  optAnywhere.textContent = "Anywhere";
  endSel.appendChild(optAnywhere);
  if (state.hotspots.length > 0) {
    startSel.value = "0";
    endSel.value = String(state.hotspots.length - 1);
  }
}