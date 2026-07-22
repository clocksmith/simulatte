// Pinned public reference geography for the maritime-trade-global tier (TODO spec §A).
// Major container ports (public coordinates + UN/LOCODE), major trade corridors, and the
// two principal ship canals. These are public aggregate reference points, never observed
// vessel positions or carrier schedules. Shared by the data generator, the world builder,
// and the corridor builder.

// [id, name, unlocode, country, lat, lon, harborSize]
export const PORTS = Object.freeze([
  ['cnsha', 'Shanghai', 'CNSHA', 'CN', 31.23, 121.47, 'L'],
  ['sgsin', 'Singapore', 'SGSIN', 'SG', 1.29, 103.85, 'L'],
  ['cnngb', 'Ningbo-Zhoushan', 'CNNGB', 'CN', 29.87, 121.55, 'L'],
  ['cnszn', 'Shenzhen', 'CNSZN', 'CN', 22.54, 114.06, 'L'],
  ['krpus', 'Busan', 'KRPUS', 'KR', 35.10, 129.04, 'L'],
  ['cntao', 'Qingdao', 'CNTAO', 'CN', 36.07, 120.38, 'L'],
  ['hkhkg', 'Hong Kong', 'HKHKG', 'HK', 22.30, 114.17, 'L'],
  ['nlrtm', 'Rotterdam', 'NLRTM', 'NL', 51.95, 4.14, 'L'],
  ['uslax', 'Los Angeles', 'USLAX', 'US', 33.74, -118.27, 'L'],
  ['uslgb', 'Long Beach', 'USLGB', 'US', 33.75, -118.19, 'L'],
  ['beanr', 'Antwerp', 'BEANR', 'BE', 51.26, 4.40, 'L'],
  ['deham', 'Hamburg', 'DEHAM', 'DE', 53.53, 9.93, 'M'],
  ['usnyc', 'New York/New Jersey', 'USNYC', 'US', 40.67, -74.04, 'L'],
  ['aejea', 'Jebel Ali (Dubai)', 'AEJEA', 'AE', 25.01, 55.06, 'L'],
  ['mytpp', 'Tanjung Pelepas', 'MYTPP', 'MY', 1.36, 103.55, 'M'],
  ['twkhh', 'Kaohsiung', 'TWKHH', 'TW', 22.61, 120.28, 'M'],
  ['lkcmb', 'Colombo', 'LKCMB', 'LK', 6.94, 79.84, 'M'],
  ['esvlc', 'Valencia', 'ESVLC', 'ES', 39.44, -0.32, 'M'],
  ['grpir', 'Piraeus', 'GRPIR', 'GR', 37.94, 23.64, 'M'],
  ['brssz', 'Santos', 'BRSSZ', 'BR', -23.96, -46.33, 'M'],
  ['ussav', 'Savannah', 'USSAV', 'US', 32.08, -81.09, 'M'],
  ['jptyo', 'Tokyo', 'JPTYO', 'JP', 35.62, 139.78, 'M'],
  ['phmnl', 'Manila', 'PHMNL', 'PH', 14.60, 120.97, 'M'],
  ['zadur', 'Durban', 'ZADUR', 'ZA', -29.87, 31.03, 'M'],
]);

// Principal ship canals (queue/service chokepoints). [id, name, lat, lon, connects]
export const CANALS = Object.freeze([
  ['suez', 'Suez Canal', 30.60, 32.34, 'Mediterranean-Red Sea'],
  ['panama', 'Panama Canal', 9.08, -79.68, 'Atlantic-Pacific'],
]);

// Directed corridor lanes between real ports; the third element tags the canal a lane
// transits (for canal queue/service modeling), or null for open-ocean lanes.
// [fromPortId, toPortId, canalId|null]
export const CORRIDORS = Object.freeze([
  ['cnsha', 'sgsin', null], ['sgsin', 'lkcmb', null], ['lkcmb', 'aejea', null],
  ['aejea', 'grpir', 'suez'], ['sgsin', 'nlrtm', 'suez'], ['sgsin', 'grpir', 'suez'],
  ['grpir', 'esvlc', null], ['esvlc', 'nlrtm', null], ['nlrtm', 'beanr', null],
  ['nlrtm', 'deham', null], ['nlrtm', 'usnyc', null], ['usnyc', 'ussav', null],
  ['cnsha', 'uslax', null], ['cnngb', 'uslgb', null], ['krpus', 'uslax', null],
  ['jptyo', 'uslax', null], ['cnsha', 'krpus', null], ['cnsha', 'cnngb', null],
  ['cnszn', 'hkhkg', null], ['hkhkg', 'sgsin', null], ['twkhh', 'cnsha', null],
  ['phmnl', 'hkhkg', null], ['mytpp', 'sgsin', null], ['cntao', 'krpus', null],
  ['uslgb', 'usnyc', 'panama'], ['ussav', 'uslax', 'panama'], ['brssz', 'uslgb', 'panama'],
  ['brssz', 'usnyc', null], ['zadur', 'sgsin', null], ['zadur', 'nlrtm', null],
]);

export function haversineKm(a, b) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function portsById() {
  const map = new Map();
  PORTS.forEach(([id, name, unlocode, country, lat, lon, harborSize]) => map.set(id, { id, name, unlocode, country, lat, lon, harborSize }));
  CANALS.forEach(([id, name, lat, lon]) => map.set(id, { id, name, lat, lon, kind: 'canal' }));
  return map;
}
