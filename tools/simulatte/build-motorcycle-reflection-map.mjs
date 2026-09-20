import fs from 'node:fs';
import crypto from 'node:crypto';
const sourcePath = 'public/data/simulatte/worlds/nyc-core-autonomy-v1.json';
const bytes = fs.readFileSync(sourcePath), world = JSON.parse(bytes), geometry = world.renderGeometry;
const origin = world.coordinateSystem.originWgs84;
const project = (longitude, latitude) => ({ x: (longitude - origin.longitude) * Math.cos(origin.latitude * Math.PI / 180) * 111320, y: (latitude - origin.latitude) * 110540 });
const a = project(-73.973, 40.705), b = project(-73.94, 40.745);
const overlaps = points => points?.length && Math.max(...points.map(p => p.x)) >= a.x && Math.min(...points.map(p => p.x)) <= b.x && Math.max(...points.map(p => p.y)) >= a.y && Math.min(...points.map(p => p.y)) <= b.y;
const streets = geometry.streets.filter(row => overlaps(row.geometry));
const buildings = geometry.buildings.filter(row => overlaps(row.footprint));
const map = { schema: 'simulatte.nycReflectionMap.v1', origin, bounds: { a, b }, streets, buildings,
  land: geometry.land.filter(row => overlaps(row.outerRing)),
  places: world.nodes.filter(row => row.landmark && row.position && row.position.x >= a.x && row.position.x <= b.x && row.position.y >= a.y && row.position.y <= b.y).map(row => ({ label: row.label, position: row.position })),
  provenance: { sourcePath, sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'), snapshot: '2026-07-13', sources: world.provenance,
    limitations: 'Rectangular study extent; incomplete source building coverage. Lane directions, traffic, acoustic materials and reflector behavior are assumptions.' } };
const target = 'public/simulatte/motorcycle-noise/nyc-map.json';
fs.writeFileSync(target, JSON.stringify(map));
console.log(`Packaged ${streets.length} streets and ${buildings.length} buildings into ${target}`);
