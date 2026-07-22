#!/usr/bin/env node
// Builds the dedicated national world `us-food-network-v1` (TODO_PLUGINS §9, §13,
// roadmap Phase 1). The world supplies:
//   * a coordinateSystem.projection so the host geography port can project WGS84 to the
//     scene, letting food-recall-us present national geography without fake node IDs;
//   * state-centroid backdrop nodes and hub nodes;
//   * synthesised aggregate freight-corridor segments between hubs;
//   * national camera bounds.
// It is written as a governed artifact with an explicit synthetic claim boundary.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  NATIONAL_PROJECTION, STATE_CENTROIDS, HUB_CITIES, FREIGHT_CORRIDORS,
  projectPoint, haversineMeters,
} from './geo-reference.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const outPath = join(repoRoot, 'public', 'data', 'simulatte', 'worlds', 'us-food-network-v1.json');

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function build() {
  const nodes = [];
  const nodesById = new Map();

  // State-centroid backdrop nodes.
  Object.entries(STATE_CENTROIDS).forEach(([state, [latitude, longitude]]) => {
    const position = projectPoint({ longitude, latitude });
    const node = {
      id: `state-${state.toLowerCase()}`,
      kind: 'region_centroid',
      label: state,
      position,
      positionWgs84: { latitude, longitude },
    };
    nodes.push(node);
    nodesById.set(node.id, node);
  });

  // Hub nodes.
  HUB_CITIES.forEach((hub) => {
    const position = projectPoint({ longitude: hub.longitude, latitude: hub.latitude });
    const node = {
      id: hub.id,
      kind: 'distribution_hub',
      label: hub.label,
      position,
      positionWgs84: { latitude: hub.latitude, longitude: hub.longitude },
    };
    nodes.push(node);
    nodesById.set(node.id, node);
  });

  // Freight-corridor segments between hubs (bidirectional).
  const segments = [];
  FREIGHT_CORRIDORS.forEach(([fromId, toId], index) => {
    const from = nodesById.get(fromId);
    const to = nodesById.get(toId);
    if (!from || !to) throw new Error(`Freight corridor ${index} references missing hub ${fromId} -> ${toId}`);
    const lengthKm = Number((haversineMeters(from.positionWgs84, to.positionWgs84) / 1000).toFixed(4));
    ['tf', 'ft'].forEach((direction) => {
      const [head, tail] = direction === 'tf' ? [from, to] : [to, from];
      segments.push({
        id: `corridor-${String(index).padStart(3, '0')}-${direction}`,
        fromNodeId: head.id,
        toNodeId: tail.id,
        allowedModes: ['freight_truck'],
        laneType: 'freight_corridor',
        geometry: [{ x: head.position.x, y: head.position.y }, { x: tail.position.x, y: tail.position.y }],
        lengthM: lengthKm,
        provenanceKind: 'synthetic_aggregate',
      });
    });
  });

  const xs = nodes.map((node) => node.position.x);
  const ys = nodes.map((node) => node.position.y);
  const bounds = {
    minimumX: Math.min(...xs), maximumX: Math.max(...xs),
    minimumY: Math.min(...ys), maximumY: Math.max(...ys),
  };

  const world = {
    schema: 'simulatte.autonomyWorld.v1',
    id: 'us-food-network-v1',
    label: 'United States food-supply national world',
    contentVersion: 'us-food-network-2026-07-21',
    coordinateSystem: {
      kind: 'local_cartesian_meters',
      originLabel: `${NATIONAL_PROJECTION.originLatitude},${NATIONAL_PROJECTION.originLongitude}`,
      originWgs84: { latitude: NATIONAL_PROJECTION.originLatitude, longitude: NATIONAL_PROJECTION.originLongitude },
      projection: NATIONAL_PROJECTION,
      bounds,
    },
    nodes,
    segments,
    signals: [],
    actors: [],
    disruptions: [],
    circuits: [],
    renderGeometry: { nationalBounds: bounds, stateCentroidCount: Object.keys(STATE_CENTROIDS).length, hubCount: HUB_CITIES.length },
    scenario: {
      daylightMethod: 'not_applicable_national_aggregate',
      defaultMissionText: 'Run a national food-supply scenario.',
      cameraBounds: bounds,
    },
    provenance: {
      compiler: 'tools/food-recall-us/build-national-world.mjs',
      sourceId: 'us-food-network-synthetic-v1',
      sourceKind: 'synthetic_national_reference',
      snapshotDate: '2026-07-21',
      claimBoundary: 'State centroids and hub cities are public aggregate reference geography. Freight corridors are a synthesised aggregate network derived from published regional freight-flow priors, not observed commercial shipments. This world is a national presentation substrate, not a map of any real supply chain.',
      sources: {
        stateCentroids: { authority: 'US Census Bureau reference geography (approximate)', kind: 'public_reference' },
        hubs: { authority: 'Public metropolitan reference coordinates', kind: 'public_reference' },
        corridors: { authority: 'FHWA Freight Analysis Framework priors (aggregate)', kind: 'synthetic_from_public_priors' },
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
  process.stdout.write(`Wrote ${outPath}\n  nodes=${world.nodes.length} segments=${world.segments.length} sha256=${world.provenance.contentSha256.slice(0, 12)}\n`);
}

main();
