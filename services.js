import { state } from "./state.js";

export function buildDistanceMatrixUrl(origins, destinations, apiKey) {
  const base = "https://api.distancematrix.ai/maps/api/distancematrix/json";
  const originsParam = origins.map((o) => `${o.lat},${o.lng}`).join("|");
  const destinationsParam = destinations.map((d) => `${d.lat},${d.lng}`).join("|");
  const params = new URLSearchParams({
    origins: originsParam,
    destinations: destinationsParam,
    key: apiKey,
    mode: state.mode,
  });
  if (state.useTraffic && state.mode === "driving") {
    params.set("departure_time", state.departureTime === "now" ? "now" : String(state.departureTime));
    params.set("traffic_model", state.trafficModel || "best_guess");
  }
  return `${base}?${params.toString()}`;
}

export async function fetchDurationsFromOrigin(originIdx, candidateIdxs) {
  const origin = state.hotspots[originIdx];
  const destinations = candidateIdxs.map((i) => state.hotspots[i]);
  const url = buildDistanceMatrixUrl([origin], destinations, state.apiKey);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API request failed: ${res.status}`);
  const data = await res.json();
  if (data.status !== "OK") throw new Error(`API returned error: ${data.status}`);
  const row = data.rows[0]?.elements || [];
  const result = new Map();
  for (let i = 0; i < destinations.length; i++) {
    const el = row[i];
    if (el?.status === "OK") {
      const sec = state.useTraffic && el.duration_in_traffic?.value != null
        ? el.duration_in_traffic.value
        : (el.duration?.value ?? Infinity);
      result.set(candidateIdxs[i], sec);
      state.durationCache.set(`${originIdx}-${candidateIdxs[i]}`, sec);
    }
  }
  return result;
}

export async function loadApiKeyFromEnv() {
  try {
    const res = await fetch("/.env");
    if (!res.ok) throw new Error(".env not accessible in this environment");
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    const kv = {};
    for (const line of lines) {
      const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
      if (m) kv[m[1]] = m[2].trim();
    }
    state.apiKey = kv["DISTANCEMATRIX_FAST_APPLICATION"] || kv["DISTANCEMATRIX_ACCURATE_APPLICATION"] || null;
  } catch (e) {
    console.warn("Failed to read .env:", e.message);
    state.apiKey = null;
  }
}