import { state } from "./state.js";

export function markerStyle(selected) {
  return {
    radius: 8,
    color: selected ? "#16a34a" : "#6b7280",
    fillColor: selected ? "#22c55e" : "#9ca3af",
    fillOpacity: 0.9,
    weight: 2,
    // Remove white stroke or halo
    opacity: 1,
  };
}

export function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function durationKey(aIdx, bIdx) {
  return `${aIdx}-${bIdx}`;
}

export function estimateDurationBetween(aIdx, bIdx, speedKmh) {
  const a = state.hotspots[aIdx];
  const b = state.hotspots[bIdx];
  const km = haversineDistanceKm(a.lat, a.lng, b.lat, b.lng);
  return (km / speedKmh) * 3600;
}