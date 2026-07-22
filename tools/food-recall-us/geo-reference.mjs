// Shared, pinned geographic reference for the food-recall-us national world and the
// synthetic facility network. All coordinates are public, aggregate reference points
// (state centroids and major distribution-hub cities), never observed commercial
// facility locations. Used by build-national-world.mjs and build-synthetic-facility-network.mjs.

export const NATIONAL_PROJECTION = Object.freeze({
  kind: 'equirectangular',
  originLongitude: -98.5795,
  originLatitude: 39.8283,
  referenceLatitude: 39.8283,
  // Planar units are kilometres, so the continental extent stays renderable (~5000 units).
  metersPerUnit: 1000,
  yAxis: 'north-up',
});

// Approximate population-weighted state centroids (public reference geography).
export const STATE_CENTROIDS = Object.freeze({
  AL: [32.8, -86.8], AK: [63.6, -152.5], AZ: [34.2, -111.7], AR: [34.9, -92.4],
  CA: [37.2, -119.4], CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5],
  DC: [38.9, -77.0], FL: [28.6, -82.4], GA: [32.6, -83.4], HI: [20.3, -156.4],
  ID: [44.4, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3], IA: [42.0, -93.5],
  KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.0, -92.0], ME: [45.4, -69.2],
  MD: [39.0, -76.8], MA: [42.3, -71.8], MI: [44.3, -85.4], MN: [46.3, -94.3],
  MS: [32.7, -89.7], MO: [38.4, -92.5], MT: [47.0, -109.6], NE: [41.5, -99.8],
  NV: [39.3, -116.6], NH: [43.7, -71.6], NJ: [40.1, -74.7], NM: [34.4, -106.1],
  NY: [42.9, -75.5], NC: [35.5, -79.4], ND: [47.4, -100.5], OH: [40.3, -82.8],
  OK: [35.6, -97.5], OR: [44.0, -120.5], PA: [40.9, -77.8], RI: [41.7, -71.5],
  SC: [33.9, -80.9], SD: [44.4, -100.2], TN: [35.9, -86.4], TX: [31.5, -99.3],
  UT: [39.3, -111.7], VT: [44.0, -72.7], VA: [37.5, -78.9], WA: [47.4, -120.4],
  WV: [38.6, -80.6], WI: [44.6, -89.9], WY: [43.0, -107.5],
});

// Major distribution-hub cities used to synthesise freight corridors. [lat, lon].
export const HUB_CITIES = Object.freeze([
  { id: 'hub-salinas-ca', label: 'Salinas Valley, CA', state: 'CA', latitude: 36.677, longitude: -121.655, role: 'produce_origin' },
  { id: 'hub-los-angeles-ca', label: 'Los Angeles, CA', state: 'CA', latitude: 34.05, longitude: -118.25, role: 'distribution' },
  { id: 'hub-yuma-az', label: 'Yuma, AZ', state: 'AZ', latitude: 32.69, longitude: -114.63, role: 'produce_origin' },
  { id: 'hub-dallas-tx', label: 'Dallas, TX', state: 'TX', latitude: 32.78, longitude: -96.8, role: 'distribution' },
  { id: 'hub-chicago-il', label: 'Chicago, IL', state: 'IL', latitude: 41.85, longitude: -87.65, role: 'distribution' },
  { id: 'hub-atlanta-ga', label: 'Atlanta, GA', state: 'GA', latitude: 33.75, longitude: -84.39, role: 'distribution' },
  { id: 'hub-denver-co', label: 'Denver, CO', state: 'CO', latitude: 39.74, longitude: -104.99, role: 'distribution' },
  { id: 'hub-kansas-city-mo', label: 'Kansas City, MO', state: 'MO', latitude: 39.1, longitude: -94.58, role: 'distribution' },
  { id: 'hub-newyork-ny', label: 'New York, NY', state: 'NY', latitude: 40.71, longitude: -74.0, role: 'consumer' },
  { id: 'hub-philadelphia-pa', label: 'Philadelphia, PA', state: 'PA', latitude: 39.95, longitude: -75.16, role: 'consumer' },
  { id: 'hub-miami-fl', label: 'Miami, FL', state: 'FL', latitude: 25.76, longitude: -80.19, role: 'consumer' },
  { id: 'hub-seattle-wa', label: 'Seattle, WA', state: 'WA', latitude: 47.61, longitude: -122.33, role: 'consumer' },
]);

// Directed freight corridors between hubs (origin -> destination). A synthesised
// aggregate network derived from published regional freight-flow priors, never observed
// company shipments.
export const FREIGHT_CORRIDORS = Object.freeze([
  ['hub-salinas-ca', 'hub-los-angeles-ca'],
  ['hub-salinas-ca', 'hub-denver-co'],
  ['hub-yuma-az', 'hub-los-angeles-ca'],
  ['hub-los-angeles-ca', 'hub-dallas-tx'],
  ['hub-denver-co', 'hub-kansas-city-mo'],
  ['hub-kansas-city-mo', 'hub-chicago-il'],
  ['hub-dallas-tx', 'hub-atlanta-ga'],
  ['hub-chicago-il', 'hub-newyork-ny'],
  ['hub-chicago-il', 'hub-philadelphia-pa'],
  ['hub-atlanta-ga', 'hub-miami-fl'],
  ['hub-atlanta-ga', 'hub-philadelphia-pa'],
  ['hub-los-angeles-ca', 'hub-seattle-wa'],
  ['hub-denver-co', 'hub-chicago-il'],
  ['hub-kansas-city-mo', 'hub-dallas-tx'],
]);

const EARTH_METERS_PER_DEGREE_LAT = 111320;

export function projectPoint({ longitude, latitude }, projection = NATIONAL_PROJECTION) {
  const metersPerDegLat = EARTH_METERS_PER_DEGREE_LAT;
  const metersPerDegLon = EARTH_METERS_PER_DEGREE_LAT * Math.cos((projection.referenceLatitude * Math.PI) / 180);
  const yScale = projection.yAxis === 'south-up' ? -1 : 1;
  return {
    x: Number((((longitude - projection.originLongitude) * metersPerDegLon) / projection.metersPerUnit).toFixed(4)),
    y: Number(((yScale * (latitude - projection.originLatitude) * metersPerDegLat) / projection.metersPerUnit).toFixed(4)),
  };
}

export function haversineMeters(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
