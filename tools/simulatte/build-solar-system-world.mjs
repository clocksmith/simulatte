#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const EPHEMERIS_PATH = path.join(
  ROOT,
  'public/data/orbital-transfer-planner/jpl-horizons-heliocentric-vectors-v1.json',
);
const OUTPUT_PATH = path.join(
  ROOT,
  'public/data/simulatte/worlds/solar-system-ephemeris-v2.json',
);

main();

function main() {
  const sourceText = fs.readFileSync(EPHEMERIS_PATH, 'utf8');
  const ephemeris = JSON.parse(sourceText);
  validateEphemeris(ephemeris);

  const ephemerisSha256 = sha256(sourceText);
  const bodies = Object.entries(ephemeris.bodies)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, body]) => summarizeBody(id, body));

  const maximumObservedAu = Math.max(
    1,
    ...Object.values(ephemeris.bodies).flatMap((body) =>
      body.vectors.map((row) => Math.hypot(...row.positionAu)),
    ),
  );
  const extentAu = round(maximumObservedAu * 1.1, 6);
  const epochEnd = addDays(
    ephemeris.epochStart,
    (ephemeris.epochCount - 1) * ephemeris.stepDays,
  );
  const observed = ephemeris.sourceKind === 'observed_jpl_horizons_vectors';
  const snapshotDate =
    ephemeris.provenance?.retrievedAt?.slice(0, 10) ||
    ephemeris.epochStart.slice(0, 10);

  const world = {
    schema: 'simulatte.tierWorldModel.v1',
    id: 'solar-system-ephemeris-v2',
    tier: 'solar-system',
    label: 'Solar System heliocentric ephemeris world',
    contentVersion: `solar-system-${ephemeris.epochStart.slice(0, 10)}-${ephemerisSha256.slice(0, 12)}-v2`,
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
      cameraDistanceAu: round(extentAu * 1.4, 6),
    },
    bodies,
    datasets: {
      ephemeris: ephemeris.id,
      gravitationalConstants: 'solar.system.gm-constants-de440.v1',
      depots: 'orbital.depots.v1',
    },
    provenance: {
      compiler: 'tools/simulatte/build-solar-system-world.mjs',
      derivedFrom: ephemeris.id,
      sourceDatasetSha256: ephemerisSha256,
      sourceKind: observed
        ? 'governed_observed_ephemeris_descriptor'
        : 'governed_synthetic_ephemeris_descriptor',
      snapshotDate,
      claimBoundary: observed
        ? 'A governed descriptor of a pinned JPL Horizons heliocentric vector snapshot. It is a mission-design presentation substrate, not spacecraft navigation, flight dynamics, or an operational ephemeris service.'
        : 'A governed descriptor of a synthetic orbital fixture. It must not be represented as observed JPL Horizons data.',
    },
  };
  world.provenance.contentSha256 = sha256(stableStringify(world));

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  atomicWrite(OUTPUT_PATH, `${JSON.stringify(world, null, 2)}\n`);
  process.stdout.write(
    `SOLAR-WORLD status=written bodies=${bodies.length} extentAu=${extentAu} source=${world.provenance.sourceKind} sha256=${world.provenance.contentSha256}\n`,
  );
}

function summarizeBody(id, body) {
  if (!Array.isArray(body.vectors) || body.vectors.length < 2) {
    throw new Error(`Ephemeris body ${id} has no usable vectors`);
  }
  const radii = body.vectors.map((row) => Math.hypot(...row.positionAu)).sort((a, b) => a - b);
  const midpoint = Math.floor(radii.length / 2);
  const medianAu = radii.length % 2
    ? radii[midpoint]
    : (radii[midpoint - 1] + radii[midpoint]) / 2;

  return {
    id,
    name: body.name || id,
    referenceRadiusAu: round(medianAu, 9),
    minimumRadiusAu: round(radii[0], 9),
    maximumRadiusAu: round(radii.at(-1), 9),
    radiusAu: Number.isFinite(body.radiusAu) ? body.radiusAu : null,
    periodDays: Number.isFinite(body.periodDays) ? body.periodDays : null,
    color: body.color || '#d8e1ec',
    kind: id === 'sun' ? 'star' : id === 'moon' ? 'moon' : 'planet',
  };
}

function validateEphemeris(value) {
  if (
    value?.schema !== 'simulatte.jplHorizonsHeliocentricVectors.v1' ||
    value?.id !== 'jpl.horizons.heliocentric-vectors.v1' ||
    !Number.isFinite(Date.parse(value.epochStart)) ||
    !(value.stepDays > 0) ||
    !Number.isInteger(value.epochCount) ||
    value.epochCount < 2 ||
    !value.bodies ||
    typeof value.bodies !== 'object'
  ) {
    throw new Error('Invalid orbital ephemeris dataset');
  }

  for (const required of ['sun', 'earth', 'moon', 'mars']) {
    if (!value.bodies[required]) throw new Error(`Ephemeris is missing ${required}`);
  }
  for (const [id, body] of Object.entries(value.bodies)) {
    if (body.vectors.length !== value.epochCount) {
      throw new Error(
        `Ephemeris body ${id} has ${body.vectors.length} vectors; expected ${value.epochCount}`,
      );
    }
  }
}

function addDays(start, days) {
  return new Date(Date.parse(start) + days * 86_400_000).toISOString();
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function atomicWrite(target, content) {
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, target);
}

function round(value, digits) {
  return Number(value.toFixed(digits));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
