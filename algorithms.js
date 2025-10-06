import { state } from "./state.js";
import { haversineDistanceKm, estimateDurationBetween, durationKey } from "./utils.js";
import { fetchDurationsFromOrigin } from "./services.js";

export function nearestNeighbor(durations, startIdx = 0) {
  const n = durations.length;
  const visited = Array(n).fill(false);
  const order = [startIdx];
  visited[startIdx] = true;
  for (let step = 1; step < n; step++) {
    const last = order[order.length - 1];
    let next = -1;
    let best = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && durations[last][j] < best) {
        best = durations[last][j];
        next = j;
      }
    }
    if (next === -1) break;
    visited[next] = true;
    order.push(next);
  }
  return order;
}

export function twoOpt(order, durations) {
  const n = order.length;
  let improved = true;
  function pathCost(ord) {
    let c = 0;
    for (let i = 0; i < ord.length - 1; i++) {
      c += durations[ord[i]][ord[i + 1]];
    }
    return c;
  }
  let bestOrder = order.slice();
  let bestCost = pathCost(bestOrder);
  while (improved) {
    improved = false;
    for (let i = 1; i < n - 2; i++) {
      for (let k = i + 1; k < n - 1; k++) {
        const newOrder = bestOrder.slice();
        newOrder.splice(i, k - i + 1, ...bestOrder.slice(i, k + 1).reverse());
        const newCost = pathCost(newOrder);
        if (newCost < bestCost) {
          bestOrder = newOrder;
          bestCost = newCost;
          improved = true;
        }
      }
    }
  }
  return bestOrder;
}

export async function computeGreedyRoute(selectedIdx, startIdx, endIdx) {
  if (!selectedIdx.includes(startIdx) || !selectedIdx.includes(endIdx)) {
    throw new Error("Start and End must be within selected hotspots.");
  }
  if (!state.apiKey) {
    throw new Error("API key not available. In development, ensure .env is accessible. For production, requests will go via Cloudflare Workers.");
  }
  const assumedSpeedKmh = 40; // fallback
  const remaining = new Set(selectedIdx);
  const orderGlobal = [startIdx];
  remaining.delete(startIdx);
  remaining.delete(endIdx);
  const alternativeSegments = [];
  while (remaining.size > 0) {
    const curr = orderGlobal[orderGlobal.length - 1];
    const candidatesArr = Array.from(remaining);
    candidatesArr.sort((i1, i2) => {
      const h1 = haversineDistanceKm(
        state.hotspots[curr].lat,
        state.hotspots[curr].lng,
        state.hotspots[i1].lat,
        state.hotspots[i1].lng
      );
      const h2 = haversineDistanceKm(
        state.hotspots[curr].lat,
        state.hotspots[curr].lng,
        state.hotspots[i2].lat,
        state.hotspots[i2].lng
      );
      return h1 - h2;
    });
    const k = 3;
    const topK = candidatesArr.slice(0, Math.min(k, candidatesArr.length));
    let durationsMap;
    try {
      durationsMap = await fetchDurationsFromOrigin(curr, topK);
    } catch (e) {
      durationsMap = new Map(
        topK.map((i) => [
          i,
          (haversineDistanceKm(
            state.hotspots[curr].lat,
            state.hotspots[curr].lng,
            state.hotspots[i].lat,
            state.hotspots[i].lng
          ) /
            assumedSpeedKmh) * 3600,
        ])
      );
    }
    const sortedByDur = topK
      .slice()
      .sort((a, b) => (durationsMap.get(a) ?? Infinity) - (durationsMap.get(b) ?? Infinity));
    const altCount = Math.min(2, sortedByDur.length);
    const r = Math.min(2, sortedByDur.length);
    const k2 = 3;
    let bestNext = sortedByDur[0];
    let bestScore = durationsMap.get(bestNext) ?? Infinity;
    for (let t = 0; t < r; t++) {
      const cand = sortedByDur[t];
      const remainingAfter = Array.from(remaining).filter((x) => x !== cand);
      if (remainingAfter.length === 0) {
        const score = durationsMap.get(cand) ?? Infinity;
        if (score < bestScore) {
          bestScore = score;
          bestNext = cand;
        }
        continue;
      }
      remainingAfter.sort((i1, i2) => {
        const h1 = haversineDistanceKm(
          state.hotspots[cand].lat,
          state.hotspots[cand].lng,
          state.hotspots[i1].lat,
          state.hotspots[i1].lng
        );
        const h2 = haversineDistanceKm(
          state.hotspots[cand].lat,
          state.hotspots[cand].lng,
          state.hotspots[i2].lat,
          state.hotspots[i2].lng
        );
        return h1 - h2;
      });
      const topK2 = remainingAfter.slice(0, Math.min(k2, remainingAfter.length));
      let secondMap;
      try {
        secondMap = await fetchDurationsFromOrigin(cand, topK2);
      } catch (e) {
        secondMap = new Map(
          topK2.map((i) => [
            i,
            (haversineDistanceKm(
              state.hotspots[cand].lat,
              state.hotspots[cand].lng,
              state.hotspots[i].lat,
              state.hotspots[i].lng
            ) /
              assumedSpeedKmh) * 3600,
          ])
        );
      }
      const minSecond = topK2.reduce((min, j) => Math.min(min, secondMap.get(j) ?? Infinity), Infinity);
      const score = (durationsMap.get(cand) ?? Infinity) + minSecond;
      if (score < bestScore) {
        bestScore = score;
        bestNext = cand;
      }
    }
    orderGlobal.push(bestNext);
    remaining.delete(bestNext);
    const altCandidates = sortedByDur.slice(0, altCount).filter((c) => c !== bestNext);
    for (const c of altCandidates) {
      const dsec = durationsMap.get(c);
      if (Number.isFinite(dsec)) {
        alternativeSegments.push({ from: curr, to: c, durationSec: dsec });
      }
    }
  }
  orderGlobal.push(endIdx);
  const segments = [];
  for (let i = 0; i < orderGlobal.length - 1; i++) {
    const a = orderGlobal[i];
    const b = orderGlobal[i + 1];
    let sec = state.durationCache.get(durationKey(a, b));
    if (sec == null) {
      try {
        const map = await fetchDurationsFromOrigin(a, [b]);
        sec = map.get(b);
      } catch (e) {
        sec = estimateDurationBetween(a, b, assumedSpeedKmh);
      }
      state.durationCache.set(durationKey(a, b), sec);
    }
    segments.push(sec);
  }
  return { orderGlobal, segments, alternativeSegments };
}

export async function buildFullDurationMatrix(selectedIdx, assumedSpeedKmh = 40) {
  const m = selectedIdx.length;
  const matrix = Array.from({ length: m }, () => Array(m).fill(Infinity));
  for (let i = 0; i < m; i++) {
    const origin = selectedIdx[i];
    const dests = selectedIdx.filter((_, j) => j !== i);
    let durationsMap;
    try {
      durationsMap = await fetchDurationsFromOrigin(origin, dests);
    } catch (e) {
      durationsMap = new Map();
    }
    for (let j = 0; j < m; j++) {
      if (i === j) {
        matrix[i][j] = 0;
        continue;
      }
      const destIdx = selectedIdx[j];
      let sec = durationsMap.get(destIdx);
      if (sec == null || !Number.isFinite(sec)) {
        sec = estimateDurationBetween(origin, destIdx, assumedSpeedKmh);
      }
      matrix[i][j] = sec;
      state.durationCache.set(durationKey(origin, destIdx), sec);
    }
  }
  return matrix;
}

export function heldKarpPathTSP(matrix, selectedIdx, startIdx, endIdx) {
  const m = selectedIdx.length;
  const startPos = selectedIdx.indexOf(startIdx);
  const endPos = selectedIdx.indexOf(endIdx);
  const intermediates = [];
  for (let p = 0; p < m; p++) {
    if (p !== startPos && p !== endPos) intermediates.push(p);
  }
  const L = intermediates.length;
  if (L === 0) {
    return [startIdx, endIdx];
  }
  const size = 1 << L;
  const dp = Array.from({ length: size }, () => Array(L).fill(Infinity));
  const prev = Array.from({ length: size }, () => Array(L).fill(-1));
  for (let t = 0; t < L; t++) {
    const posT = intermediates[t];
    dp[1 << t][t] = matrix[startPos][posT];
    prev[1 << t][t] = -1;
  }
  for (let mask = 0; mask < size; mask++) {
    for (let last = 0; last < L; last++) {
      if ((mask & (1 << last)) === 0) continue;
      const cost = dp[mask][last];
      if (!Number.isFinite(cost)) continue;
      for (let nxt = 0; nxt < L; nxt++) {
        if (mask & (1 << nxt)) continue;
        const posLast = intermediates[last];
        const posNxt = intermediates[nxt];
        const newMask = mask | (1 << nxt);
        const newCost = cost + matrix[posLast][posNxt];
        if (newCost < dp[newMask][nxt]) {
          dp[newMask][nxt] = newCost;
          prev[newMask][nxt] = last;
        }
      }
    }
  }
  let bestCost = Infinity;
  let bestLast = -1;
  const fullMask = size - 1;
  for (let last = 0; last < L; last++) {
    const posLast = intermediates[last];
    const cost = dp[fullMask][last];
    if (!Number.isFinite(cost)) continue;
    const total = cost + matrix[posLast][endPos];
    if (total < bestCost) {
      bestCost = total;
      bestLast = last;
    }
  }
  const orderPos = [];
  let mask = fullMask;
  let curr = bestLast;
  while (curr !== -1) {
    orderPos.push(intermediates[curr]);
    const p = prev[mask][curr];
    mask &= ~(1 << curr);
    curr = p;
  }
  orderPos.reverse();
  const orderGlobal = [startIdx, ...orderPos.map((p) => selectedIdx[p]), endIdx];
  return orderGlobal;
}