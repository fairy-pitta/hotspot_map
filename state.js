export const state = {
  map: null,
  markers: [],
  polyline: null,
  hotspots: [],
  mode: "driving", // fixed to driving (car)
  apiKey: null,
  selected: new Set(), // indices of selected hotspots
  durationLabelMarkers: [],
  durationCache: new Map(),
  isComputing: false,
  showDurationLabels: true,
  showAllSegments: false,
  selectionOrder: [],
  // traffic settings
  useTraffic: true,
  trafficModel: "best_guess",
  departureTime: "now",
  // alternative route visualization
  altPolylines: [],
  altLabelMarkers: [],
};