export const state = {
  map: null,
  markers: [],
  polyline: null,
  hotspots: [],
  mode: "driving", // fixed to driving (car)
  apiKey: null,
  selected: new Set(), // indices of selected hotspots
  durationCache: new Map(),
  isComputing: false,
  showAllSegments: false,
  selectionOrder: [],
  // traffic settings
  useTraffic: true,
  trafficModel: "best_guess",
  departureTime: "now",
  // mock API settings
  useMockApi: false,
  mockDurations: new Map(),
  mockSpeedKmh: 38,
  mockLatencyMs: 150,
  // alternative route visualization
  altPolylines: [],
  // per-segment route polylines for tooltip binding
  segmentPolylines: [],
};