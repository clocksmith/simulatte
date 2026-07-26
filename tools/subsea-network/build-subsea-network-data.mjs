#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SOURCE_PATH = resolve('tools/simulatte/data-sources/subsea-network/fcc-source-extract-v1.json');
const OUTPUT_DIRECTORY = resolve('public/data/subsea-network-global');
const extract = JSON.parse(await readFile(SOURCE_PATH, 'utf8'));
const retrievalDate = extract.retrievalDate;
const sourceById = Object.fromEntries(extract.sources.map((row) => [row.id, row]));
const selectedCableNames = Object.freeze([
  'AEConnect-1 Cable System',
  'Amitié',
  'Dunant',
  'Grace Hopper',
  'Havfrue',
  'MAREA',
]);
const licenseAliases = Object.freeze({
  'AEConnect Cable Network': 'AEConnect-1 Cable System',
});
const displayCoordinates = Object.freeze({
  Denmark: [8.0, 56.0],
  France: [-4.8, 48.4],
  Iceland: [-22.0, 64.0],
  Ireland: [-10.2, 52.1],
  Norway: [5.0, 60.0],
  Spain: [-9.2, 43.4],
  'United Kingdom': [-5.0, 50.5],
});
const usAnchors = Object.freeze([
  Object.freeze({ id: 'us-northeast', label: 'United States northeast gateway', coordinates: [-71.0, 41.0] }),
  Object.freeze({ id: 'us-mid-atlantic', label: 'United States mid-Atlantic gateway', coordinates: [-75.2, 37.1] }),
]);
const cableSpecs = Object.freeze({
  'AEConnect-1 Cable System': { id: 'aeconnect-1', originId: 'us-northeast', countries: ['Ireland', 'Iceland'], capacityGbps: 76000 },
  'Amitié': { id: 'amitie', originId: 'us-northeast', countries: ['France', 'United Kingdom'], capacityGbps: 92000 },
  'Dunant': { id: 'dunant', originId: 'us-mid-atlantic', countries: ['France'], capacityGbps: 84000 },
  'Grace Hopper': { id: 'grace-hopper', originId: 'us-northeast', countries: ['Spain', 'United Kingdom'], capacityGbps: 96000 },
  'Havfrue': { id: 'havfrue', originId: 'us-northeast', countries: ['Denmark', 'Ireland', 'Norway'], capacityGbps: 68000 },
  'MAREA': { id: 'marea', originId: 'us-mid-atlantic', countries: ['Spain'], capacityGbps: 178000 },
});

validateExtract();
await mkdir(OUTPUT_DIRECTORY, { recursive: true });

const cableRows = selectedCableNames.map((cableName) => {
  const license = extract.licenses.find((row) => row.cableName === cableName);
  const landingRows = extract.foreignLandingRows.filter(
    (row) => (licenseAliases[row.cableName] || row.cableName) === cableName
  );
  return {
    id: cableSpecs[cableName].id,
    label: cableName,
    currentLicenseNumber: license.currentLicenseNumber,
    originalFileNumber: license.originalFileNumber,
    region: license.region,
    foreignLandingCountries: landingRows.map((row) => row.foreignLandingPoint).sort(),
    sourceRows: [
      {
        documentId: license.sourceDocumentId,
        page: license.sourcePage,
        line: license.sourceLine,
        rowIdentity: license.id,
      },
      ...landingRows.map((row) => ({
        documentId: row.sourceDocumentId,
        page: row.sourcePage,
        line: row.sourceLine,
        rowIdentity: row.id,
      })),
    ],
    truth: truth('observed', 'historical', missing('Regulatory identity has no quantified uncertainty.')),
  };
});

const fccRegistry = {
  schema: 'simulatte.subseaFccCableRegistry.v1',
  id: 'subsea-fcc-cable-license-register-2025-v1',
  contentVersion: 'fcc-year-end-2025-and-capacity-2024',
  retrievalDate,
  license: extract.license,
  sources: extract.sources,
  cables: cableRows,
  publicCapacityEvidence: extract.publicCapacityRows.filter((row) => row.cableName === 'MAREA'),
  claimBoundary: 'Observed fields identify FCC regulatory records and named foreign landing countries only.',
};

const landingCountries = [...new Set(cableRows.flatMap((row) => row.foreignLandingCountries))].sort();
const landingPoints = {
  schema: 'simulatte.subseaLandingPoints.v1',
  id: 'subsea-landing-points-governed-v1',
  contentVersion: '1.0.0',
  points: [
    ...usAnchors.map((row) => ({
      ...row,
      regionId: 'united-states',
      coordinateClassification: 'modeled-regional-display-anchor',
      evidenceRefs: [],
      truth: truth('modeled', 'snapshot', missing('Display anchor is not a landing-station location.')),
    })),
    ...landingCountries.map((country) => ({
      id: slug(country),
      label: country,
      regionId: slug(country),
      coordinates: displayCoordinates[country],
      coordinateClassification: 'modeled-country-display-anchor',
      evidenceRefs: cableRows.flatMap((cable) => cable.sourceRows
        .filter((row) => row.rowIdentity.endsWith(`:${slug(country)}`))
        .map((row) => row.rowIdentity)),
      truth: truth('derived', 'snapshot', missing('Country identity is observed; display coordinate is modeled.')),
    })),
  ],
  claimBoundary: 'Points are regional display anchors, not physical landing stations.',
};

const cableEdges = cableRows.flatMap((cable) => {
  const spec = cableSpecs[cable.label];
  return spec.countries.map((country, index) => ({
    id: `${spec.id}:${slug(country)}`,
    cableId: spec.id,
    fromLandingId: spec.originId,
    toLandingId: slug(country),
    isBidirectional: true,
    latencyMs: propagationLatency(
      landingPoints.points.find((row) => row.id === spec.originId).coordinates,
      displayCoordinates[country]
    ),
    coordinates: corridor(
      landingPoints.points.find((row) => row.id === spec.originId).coordinates,
      displayCoordinates[country],
      index
    ),
    evidenceRefs: cable.sourceRows.map((row) => row.rowIdentity),
    geometryClassification: 'modeled-representative-corridor',
    truth: truth('derived', 'snapshot', missing('Corridor is not a surveyed cable route.')),
  }));
});
const gatewayPairs = [
  ['ireland', 'united-kingdom'], ['united-kingdom', 'france'], ['france', 'spain'],
  ['ireland', 'iceland'], ['ireland', 'denmark'], ['denmark', 'norway'],
];
const gatewayEdges = gatewayPairs.map(([fromLandingId, toLandingId]) => ({
  id: `modeled-gateway:${fromLandingId}:${toLandingId}`,
  cableId: 'modeled-regional-gateway',
  fromLandingId,
  toLandingId,
  isBidirectional: true,
  latencyMs: propagationLatency(
    landingPoints.points.find((row) => row.id === fromLandingId).coordinates,
    landingPoints.points.find((row) => row.id === toLandingId).coordinates
  ),
  coordinates: corridor(
    landingPoints.points.find((row) => row.id === fromLandingId).coordinates,
    landingPoints.points.find((row) => row.id === toLandingId).coordinates,
    0
  ),
  evidenceRefs: [],
  geometryClassification: 'modeled-regional-gateway',
  truth: truth('scenario', 'forecast', missing('Terrestrial and regional gateway path is a scenario abstraction.')),
}));
const topology = {
  schema: 'simulatte.subseaCableTopology.v1',
  id: 'subsea-cable-corridors-modeled-v1',
  contentVersion: '1.0.0',
  nodeIds: landingPoints.points.map((row) => row.id),
  edges: [...cableEdges, ...gatewayEdges],
  claimBoundary: 'Cable association uses FCC identity; all route geometry and regional gateway connectivity are modeled.',
};

const capacities = {
  schema: 'simulatte.subseaCapacityScenarios.v1',
  id: 'subsea-capacity-scenarios-v1',
  contentVersion: '1.0.0',
  scenarios: [{
    id: 'modeled-atlantic-capacity-v1',
    edgeCapacities: [...cableEdges, ...gatewayEdges].map((edge) => ({
      edgeId: edge.id,
      capacityGbps: edge.cableId === 'modeled-regional-gateway'
        ? 125000
        : cableSpecs[cableRows.find((row) => row.id === edge.cableId).label].capacityGbps,
      origin: edge.cableId === 'marea' ? 'scenario-informed-by-published-capacity' : 'scenario',
      evidenceRefs: edge.cableId === 'marea' ? ['fcc-capacity:marea:2024'] : [],
    })),
    truth: truth('scenario', 'forecast', {
      kind: 'interval',
      value: { interpretation: 'scenario range, not a confidence interval', relativeRange: [-0.2, 0.2] },
    }),
  }],
  claimBoundary: 'Capacities are scenario inputs. MAREA uses a published value as its nominal scenario value but is not live.',
};

const demands = {
  schema: 'simulatte.subseaDemandScenarios.v1',
  id: 'subsea-demand-scenarios-v1',
  contentVersion: '1.0.0',
  categories: [
    { id: 'essential', label: 'Essential services', defaultWeight: 3 },
    { id: 'general', label: 'General modeled demand', defaultWeight: 1 },
  ],
  scenarios: [
    demandScenario('atlantic-single-cut', ['marea:spain'], baseDemands()),
    demandScenario('landing-station-loss', ['landing:united-kingdom'], baseDemands(1.08)),
    demandScenario('dual-regional-disruption', ['marea:spain', 'amitie:united-kingdom'], baseDemands(1.22)),
    demandScenario('repair-priority', ['marea:spain', 'havfrue:ireland'], baseDemands(1.12)),
  ],
  truth: truth('scenario', 'forecast', {
    kind: 'distribution',
    value: { interpretation: 'declared demand ensemble variance', calibrationStatus: 'not_calibrated_to_current_traffic' },
  }),
  claimBoundary: 'Demand units are synthetic commodities and never current internet traffic.',
};

const repairResources = {
  schema: 'simulatte.subseaRepairResources.v1',
  id: 'subsea-repair-resources-v1',
  contentVersion: '1.0.0',
  scenarios: [{
    id: 'atlantic-repair-resources-v1',
    resources: [
      { id: 'repair-resource-west', startLandingId: 'us-northeast', speedKph: 22, spareCableKm: 120, spliceKits: 4 },
      { id: 'repair-resource-east', startLandingId: 'ireland', speedKph: 20, spareCableKm: 90, spliceKits: 3 },
    ],
    repairDurationHours: 36,
    spareCablePerRepairKm: 8,
    spliceKitsPerRepair: 1,
    attemptFailureProbability: 0.12,
  }],
  truth: truth('scenario', 'forecast', {
    kind: 'distribution',
    value: { source: 'declared deterministic seed stream', calibrationStatus: 'not_operationally_calibrated' },
  }),
};

const governance = {
  schema: 'simulatte.subseaModelGovernance.v1',
  id: 'subsea-model-governance-v1',
  contentVersion: '1.0.0',
  algorithms: [
    { id: 'bounded-simple-path-v1', owner: 'path-catalog.js', guarantee: 'loop-free deterministic candidate paths' },
    { id: 'path-flow-simplex-v1', owner: 'allocation-solver.js', guarantee: 'capacity and demand constrained linear allocation' },
    { id: 'proportional-fair-frank-wolfe-v1', owner: 'allocation-solver.js', guarantee: 'feasible concave-utility allocation with reported gap' },
    { id: 'repair-discrete-event-v1', owner: 'repair-engine.js', guarantee: 'inventory-conserving deterministic event queue' },
  ],
  omissions: [
    'current traffic matrices', 'authoritative private capacities', 'terrestrial routing',
    'commercial contracts', 'cybersecurity behavior', 'operational repair readiness',
    'burial depth', 'fault localization error', 'weather accessibility',
  ],
  prohibitedClaims: ['current traffic', 'live capacity', 'authoritative outage', 'actual restoration time'],
};

const provenance = {
  schema: 'simulatte.subseaProvenanceRegistry.v1',
  id: 'subsea-provenance-registry-v1',
  contentVersion: '1.0.0',
  sources: extract.sources.map((row) => ({
    ...row,
    retrievalDate,
    license: extract.license,
  })),
  transformations: [
    {
      id: 'fcc-pdf-to-source-extract-v1',
      generatedBy: 'tools/subsea-network/fetch-fcc-license-register.mjs',
      parentSourceIds: extract.sources.map((row) => row.id),
    },
    {
      id: 'subsea-governed-scenario-build-v1',
      generatedBy: 'tools/subsea-network/build-subsea-network-data.mjs',
      parentSourceIds: extract.sources.map((row) => row.id),
    },
  ],
  truthAxes: {
    origin: ['observed', 'derived', 'modeled', 'simulated', 'scenario'],
    temporalStatus: ['historical', 'snapshot', 'forecast'],
    uncertainty: ['interval', 'distribution', 'missing'],
  },
};

const outputs = new Map([
  ['fcc-cable-license-register-2025-v1.json', fccRegistry],
  ['landing-points-governed-v1.json', landingPoints],
  ['cable-corridors-modeled-v1.json', topology],
  ['capacity-scenarios-v1.json', capacities],
  ['demand-scenarios-v1.json', demands],
  ['repair-resources-v1.json', repairResources],
  ['model-governance-v1.json', governance],
  ['provenance-registry-v1.json', provenance],
]);
for (const [fileName, payload] of outputs) {
  await writeJson(resolve(OUTPUT_DIRECTORY, fileName), payload);
}
const artifacts = [];
for (const [fileName, payload] of outputs) {
  const bytes = `${JSON.stringify(payload, null, 2)}\n`;
  artifacts.push({
    id: payload.id,
    path: `./${fileName}`,
    schemaId: payload.schema,
    sha256: sha256(bytes),
  });
}
await writeJson(resolve(OUTPUT_DIRECTORY, 'dataset-manifest.json'), {
  schema: 'simulatte.subseaDatasetManifest.v1',
  id: 'subsea-network-global-datasets-v1',
  contentVersion: '1.0.0',
  generatedBy: 'tools/subsea-network/build-subsea-network-data.mjs',
  artifacts,
});
process.stdout.write(`Generated ${outputs.size} governed Subsea datasets and one dataset manifest.\n`);

function validateExtract() {
  if (extract.schema !== 'simulatte.subseaFccSourceExtract.v1') throw new Error('subsea_source_extract_schema_invalid');
  for (const cableName of selectedCableNames) {
    if (!extract.licenses.some((row) => row.cableName === cableName)) {
      throw new Error(`subsea_license_identity_missing: ${cableName}`);
    }
    const hasLanding = extract.foreignLandingRows.some(
      (row) => (licenseAliases[row.cableName] || row.cableName) === cableName
    );
    if (!hasLanding) throw new Error(`subsea_foreign_landing_identity_missing: ${cableName}`);
  }
  if (!sourceById['fcc-license-register-2025'] || !sourceById['fcc-circuit-capacity-2024']) {
    throw new Error('subsea_required_fcc_source_missing');
  }
}

function demandScenario(id, failedResourceIds, rows) {
  return {
    id,
    capacityScenarioId: 'modeled-atlantic-capacity-v1',
    repairScenarioId: 'atlantic-repair-resources-v1',
    failedResourceIds,
    demands: rows,
  };
}

function baseDemands(multiplier = 1) {
  return [
    ['demand-us-fr-essential', 'us-northeast', 'france', 'essential', 58000, 3],
    ['demand-us-es-general', 'us-mid-atlantic', 'spain', 'general', 94000, 1],
    ['demand-us-uk-general', 'us-northeast', 'united-kingdom', 'general', 72000, 1],
    ['demand-us-ie-essential', 'us-mid-atlantic', 'ireland', 'essential', 38000, 3],
    ['demand-es-us-general', 'spain', 'us-northeast', 'general', 52000, 1],
  ].map(([id, originLandingId, destinationLandingId, categoryId, requestedGbps, weight]) => ({
    id,
    originLandingId,
    destinationLandingId,
    categoryId,
    requestedGbps: Math.round(requestedGbps * multiplier),
    weight,
  }));
}

function propagationLatency(left, right) {
  return Number((greatCircleKm(left, right) / 204000 * 1000).toFixed(3));
}

function greatCircleKm(left, right) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const lat1 = radians(left[1]);
  const lat2 = radians(right[1]);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(right[0] - left[0]);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function corridor(left, right, bendIndex) {
  const midpoint = [
    (left[0] + right[0]) / 2,
    (left[1] + right[1]) / 2 + (bendIndex - 0.5) * 2.5,
  ];
  return [left, midpoint, right].map((row) => row.map((value) => Number(value.toFixed(4))));
}

function truth(origin, temporalStatus, uncertainty) {
  return { origin, temporalStatus, uncertainty };
}

function missing(reason) {
  return { kind: 'missing', value: { reason } };
}

function slug(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function writeJson(path, payload) {
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
}
