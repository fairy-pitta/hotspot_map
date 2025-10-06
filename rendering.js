import { state } from "./state.js";
import { markerStyle, formatDuration } from "./utils.js";

export function initMap() {
  state.map = L.map("map").setView([1.3521, 103.8198], 11);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    subdomains: "abcd",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  }).addTo(state.map);
}

export function clearMap() {
  state.markers.forEach((m) => m.remove());
  state.markers = [];
  if (state.polyline) {
    state.polyline.remove();
    state.polyline = null;
  }
  if (state.durationLabelMarkers && state.durationLabelMarkers.length) {
    state.durationLabelMarkers.forEach((m) => m.remove());
    state.durationLabelMarkers = [];
  }
  if (state.altPolylines && state.altPolylines.length) {
    state.altPolylines.forEach((p) => p.remove());
    state.altPolylines = [];
  }
  if (state.altLabelMarkers && state.altLabelMarkers.length) {
    state.altLabelMarkers.forEach((m) => m.remove());
    state.altLabelMarkers = [];
  }
}

export function renderMarkers() {
  clearMap();
  if (!state.hotspots?.length) return;
  const bounds = [];
  state.hotspots.forEach((h, idx) => {
    const selected = state.selected.has(idx);
    const marker = L.circleMarker([h.lat, h.lng], markerStyle(selected)).addTo(state.map);
    marker.bindPopup(`<strong>${h.name}</strong>`);
    marker.on("click", () => toggleSelection(idx));
    state.markers.push(marker);
    bounds.push([h.lat, h.lng]);
  });
  if (bounds.length) {
    state.map.fitBounds(bounds, { padding: [20, 20] });
  }
}

export function drawRoute(order) {
  const latlngs = order.map((idx) => [state.hotspots[idx].lat, state.hotspots[idx].lng]);
  if (state.polyline) state.polyline.remove();
  state.polyline = L.polyline(latlngs, { color: "#2563eb", weight: 4 }).addTo(state.map);
  state.map.fitBounds(state.polyline.getBounds(), { padding: [30, 30] });
}

export function renderDurationLabels(orderGlobal, segments) {
  if (state.durationLabelMarkers.length) {
    state.durationLabelMarkers.forEach((m) => m.remove());
    state.durationLabelMarkers = [];
  }
  if (!state.showDurationLabels) return;
  for (let i = 0; i < orderGlobal.length - 1; i++) {
    const a = state.hotspots[orderGlobal[i]];
    const b = state.hotspots[orderGlobal[i + 1]];
    const mid = [(a.lat + b.lat) / 2, (a.lng + b.lng) / 2];
    const seg = segments[i];
    const text = isFinite(seg) ? formatDuration(seg) : "N/A";
    const icon = L.divIcon({ className: "duration-label", html: `<span>${text}</span>` });
    const marker = L.marker(mid, { icon, interactive: false }).addTo(state.map);
    state.durationLabelMarkers.push(marker);
  }
}

export function renderResultsSegments(orderGlobal, segments) {
  const summaryEl = document.getElementById("summary");
  const listEl = document.getElementById("orderList");
  listEl.innerHTML = "";
  let total = 0;
  for (let i = 0; i < orderGlobal.length - 1; i++) {
    const aGlobal = orderGlobal[i];
    const bGlobal = orderGlobal[i + 1];
    const seg = segments[i];
    total += isFinite(seg) ? seg : 0;
    const li = document.createElement("li");
    li.innerHTML = `<span class="gm-arrow" aria-hidden="true">↓</span> <span class="gm-seg">${state.hotspots[aGlobal].name} → ${state.hotspots[bGlobal].name}: ${isFinite(seg) ? formatDuration(seg) : "N/A"}</span>`;
    listEl.appendChild(li);
  }
  summaryEl.textContent = `Total time: ${formatDuration(total)} (mode: ${state.mode})`;
}

export function renderAlternativeSegments(segments) {
  if (state.altPolylines && state.altPolylines.length) {
    state.altPolylines.forEach((p) => p.remove());
    state.altPolylines = [];
  }
  if (state.altLabelMarkers && state.altLabelMarkers.length) {
    state.altLabelMarkers.forEach((m) => m.remove());
    state.altLabelMarkers = [];
  }
  // If checkbox is OFF, do not draw any dashed segments
  if (!state.showAllSegments) {
    return;
  }
  // Draw NxN dashed segments among selected hotspots
  const selectedIdx = Array.from(state.selected);
  for (let i = 0; i < selectedIdx.length; i++) {
    for (let j = i + 1; j < selectedIdx.length; j++) {
      const aIdx = selectedIdx[i];
      const bIdx = selectedIdx[j];
      const a = state.hotspots[aIdx];
      const b = state.hotspots[bIdx];
      if (!a || !b) continue;
      const latlngs = [[a.lat, a.lng], [b.lat, b.lng]];
      const poly = L.polyline(latlngs, {
        color: "#6b7280",
        weight: 2,
        opacity: 0.4,
        dashArray: "6, 6",
      }).addTo(state.map);
      state.altPolylines.push(poly);
      // no labels for NxN segments to reduce clutter
    }
  }
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
  if (state.selectionOrder.length >= 2 && endSel) {
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

    card.addEventListener("click", () => toggleSelection(idx));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleSelection(idx);
      }
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
  if (state.hotspots.length > 0) {
    startSel.value = "0";
    endSel.value = String(state.hotspots.length - 1);
  }
}