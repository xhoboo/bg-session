// Approximate centroids for each region in the location catalog (migration
// 0020). The map plots sessions at this REGION level only — never the exact
// address (which is RLS-protected and only shown to confirmed participants), so
// nothing private is ever exposed on the map.
//
// New regions added later via the admin tool won't have coordinates here and
// are simply skipped on the map (they still work everywhere else); add them
// below when introduced.
export const REGION_COORDS = {
  'Jakarta Pusat': [-6.1864, 106.8340],
  'Jakarta Utara': [-6.1380, 106.8630],
  'Jakarta Barat': [-6.1680, 106.7580],
  'Jakarta Selatan': [-6.2610, 106.8100],
  'Jakarta Timur': [-6.2250, 106.9000],
  Bogor: [-6.5950, 106.8160],
  Depok: [-6.4020, 106.7940],
  Tangerang: [-6.2500, 106.6300],
  Bekasi: [-6.2380, 106.9750],
  Bandung: [-6.9170, 107.6190],
  Yogyakarta: [-7.7970, 110.3700],
  Surabaya: [-7.2570, 112.7520],
}

// Fallback view (Jabodetabek) used only when no plotted session has coordinates.
export const DEFAULT_CENTER = [-6.3, 106.83]
export const DEFAULT_ZOOM = 9
