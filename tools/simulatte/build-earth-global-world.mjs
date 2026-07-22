#!/usr/bin/env node
// Builds the missing tier world artifact `earth-global-topology-v1` for the Planet scale.
// The maritime-trade-global plugin renders coordinate-native WGS84 output (presentation
// v3, `wgs84`), so this world is a governed descriptor: coordinate system, global bounds,
// port reference nodes, corridor lanes, and canal chokepoints — derived deterministically
// from the pinned maritime reference geography. Governed + content-hashed.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PORTS, CANALS, CORRIDORS, haversineKm, portsById } from './maritime-geo-reference.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '..', '..', 'public', 'data', 'simulatte', 'worlds', 'earth-global-topology-v1.json');

function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

function build() {
  const byId = portsById();
  const ports = PORTS.map(([id, name, unlocode, country, lat, lon, harborSize]) => ({
    id: `port:${id}`, name, unlocode, country, harborSize,
    position: { longitude: lon, latitude: lat }, kind: 'container_port',
  }));
  const canals = CANALS.map(([id, name, lat, lon, connects]) => ({
    id: `canal:${id}`, name, connects, position: { longitude: lon, latitude: lat }, kind: 'canal',
  }));
  const corridors = CORRIDORS.map(([fromId, toId, canalId], index) => {
    const from = byId.get(fromId);
    const to = byId.get(toId);
    return {
      id: `corridor:${fromId}-${toId}`, fromPortId: `port:${fromId}`, toPortId: `port:${toId}`,
      canalId: canalId ? `canal:${canalId}` : null,
      coordinates: [{ longitude: from.lon, latitude: from.lat }, { longitude: to.lon, latitude: to.lat }],
      distanceKm: Number(haversineKm(from, to).toFixed(1)),
    };
  });
  const world = {
    schema: 'simulatte.tierWorldModel.v1',
    id: 'earth-global-topology-v1',
    tier: 'world',
    label: 'Global maritime topology world',
    contentVersion: 'earth-global-topology-2026-v1',
    coordinateSystem: {
      kind: 'wgs84',
      referenceFrame: 'WGS84 geographic',
      units: 'degrees+km',
      positionTuple: ['longitudeDeg', 'latitudeDeg', 'altitudeKm'],
    },
    bounds: { minLon: -180, minLat: -90, maxLon: 180, maxLat: 90, cameraAltitudeKm: 22000 },
    ports,
    canals,
    corridors,
    datasets: {
      portRegistry: 'global-port-registry-wpi-v1',
      unlocode: 'global-location-codes-unlocode-v1',
      corridors: 'global-maritime-corridors-v1',
      canalServiceModels: 'global-canal-service-models-v1',
      cycloneTracks: 'ibtracs-v04r01-scenario-tracks-v1',
      portPerformance: 'container-port-performance-v1',
    },
    provenance: {
      compiler: 'tools/simulatte/build-earth-global-world.mjs',
      sourceKind: 'governed_maritime_topology_descriptor',
      snapshotDate: '2026-07-22',
      claimBoundary: 'Public reference ports (NGA WPI / UN/LOCODE) and a synthesised aggregate corridor network. Not observed AIS routes, carrier schedules, or a live canal-reservation system. A global presentation substrate for the maritime simulation.',
      sources: {
        ports: { authority: 'NGA World Port Index + UN/LOCODE (public reference)', kind: 'public_reference' },
        corridors: { authority: 'Synthesised aggregate trade-lane priors', kind: 'synthetic_from_public_priors' },
        canals: { authority: 'Published Suez/Panama transit statistics', kind: 'synthetic_from_public_priors' },
      },
    },
  };
  world.provenance.contentSha256 = createHash('sha256').update(stableStringify(world)).digest('hex');
  return world;
}

function main() {
  const world = build();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(world, null, 2)}\n`);
  process.stdout.write(`Wrote ${outPath}\n  ports=${world.ports.length} corridors=${world.corridors.length} canals=${world.canals.length} sha256=${world.provenance.contentSha256.slice(0, 12)}\n`);
}

main();
