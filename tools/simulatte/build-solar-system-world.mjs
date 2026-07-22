#!/usr/bin/env node
// Builds the missing tier world artifact `solar-system-ephemeris-v2` for the Solar System
// scale. The orbital-transfer-planner plugin renders coordinate-native heliocentric AU
// output (presentation v3, `heliocentric-ecliptic-au`), so this world is a governed
// descriptor — coordinate system, epoch window, AU camera bounds, and body reference
// markers — derived deterministically from the pinned JPL Horizons vector dataset it
// shares, not a nodes/segments graph. Governed + content-hashed like the national world.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const ephemerisPath = join(repoRoot, 'public', 'data', 'orbital-transfer-planner', 'jpl-horizons-heliocentric-vectors-v1.json');
const outPath = join(repoRoot, 'public', 'data', 'simulatte', 'worlds', 'solar-system-ephemeris-v2.json');

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

function addDays(isoStart, days) {
  return new Date(Date.parse(isoStart) + days * 86400000).toISOString();
}

function build() {
  const ephemeris = JSON.parse(readFileSync(ephemerisPath, 'utf8'));
  const bodies = Object.entries(ephemeris.bodies).map(([id, body]) => ({
    id,
    name: body.name,
    semiMajorAu: body.semiMajorAu,
    radiusAu: body.radiusAu,
    periodDays: body.periodDays,
    color: body.color,
    kind: id === 'sun' ? 'star' : id === 'moon' ? 'moon' : 'planet',
  }));
  const maxOrbitAu = Math.max(...bodies.map((b) => b.semiMajorAu));
  const extentAu = Number((maxOrbitAu * 1.1).toFixed(3));
  const epochEnd = addDays(ephemeris.epochStart, (ephemeris.epochCount - 1) * ephemeris.stepDays);

  const world = {
    schema: 'simulatte.tierWorldModel.v1',
    id: 'solar-system-ephemeris-v2',
    tier: 'solar-system',
    label: 'Solar System heliocentric ephemeris world',
    contentVersion: 'solar-system-ephemeris-2030-v2',
    coordinateSystem: {
      kind: 'heliocentric-ecliptic-au',
      referenceFrame: 'ICRF/J2000 ecliptic',
      originBody: 'sun',
      units: 'AU',
      positionTuple: ['xAu', 'yAu', 'zAu'],
    },
    epoch: {
      start: ephemeris.epochStart,
      end: epochEnd,
      stepDays: ephemeris.stepDays,
      epochCount: ephemeris.epochCount,
    },
    bounds: {
      minAu: [-extentAu, -extentAu, -extentAu],
      maxAu: [extentAu, extentAu, extentAu],
      cameraDistanceAu: Number((extentAu * 1.4).toFixed(3)),
    },
    bodies,
    datasets: {
      ephemeris: 'jpl-horizons-heliocentric-vectors-v1',
      gravitationalConstants: 'gm-constants-de440-v1',
      depots: 'orbital-depots-v1',
    },
    provenance: {
      compiler: 'tools/simulatte/build-solar-system-world.mjs',
      derivedFrom: ephemeris.id || 'jpl-horizons-heliocentric-vectors-v1',
      sourceKind: 'governed_ephemeris_descriptor',
      snapshotDate: '2026-07-21',
      claimBoundary: 'A governed descriptor of the pinned JPL Horizons heliocentric vector snapshot: coordinate frame, epoch window, AU camera bounds, and body reference orbits. It is a mission-design presentation substrate, not spacecraft navigation, flight dynamics, or an operational ephemeris service.',
    },
  };
  world.provenance.contentSha256 = createHash('sha256').update(stableStringify(world)).digest('hex');
  return world;
}

function main() {
  const world = build();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(world, null, 2)}\n`);
  process.stdout.write(`Wrote ${outPath}\n  bodies=${world.bodies.length} extentAu=${world.bounds.maxAu[0]} epoch=${world.epoch.start}..${world.epoch.end} sha256=${world.provenance.contentSha256.slice(0, 12)}\n`);
}

main();
