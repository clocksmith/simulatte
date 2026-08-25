const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const contracts = require('../public/shared/contracts/multiscale-contracts.js');
const root = path.join(__dirname, '..');
const SHA = `sha256:${'a'.repeat(64)}`;

function frame(id, parentFrameId = null) {
  return {
    schema: contracts.SCHEMAS.frame,
    id,
    axes: [
      { id: 'x', unit: 'm', direction: 'positive' },
      { id: 'y', unit: 'm', direction: 'positive' },
      { id: 'z', unit: 'm', direction: 'positive' },
    ],
    handedness: 'right',
    origin: { kind: 'absolute', values: [0, 0, 0], referenceFrameId: null },
    epoch: null,
    precision: 0.001,
    bounds: { minimum: [-100000, -100000, -100000], maximum: [100000, 100000, 100000] },
    transformToParent: parentFrameId === null ? null : {
      parentFrameId,
      translation: [0, 0, 0],
      rotationQuaternion: [0, 0, 0, 1],
      scale: 1,
    },
  };
}

function scope(id, parentScopeId, coordinateFrameId, childScopeIds, moduleInstanceIds) {
  return {
    schema: contracts.SCHEMAS.scope,
    id,
    parentScopeId,
    coordinateFrameId,
    spatialBounds: { kind: 'axis-aligned-box', minimum: [-10, -10, -10], maximum: [10, 10, 10] },
    temporalDomain: { startTime: 0, endTime: 86400, timeUnit: 's' },
    childScopeIds,
    moduleInstanceIds,
    stateOwnerModuleIds: [...moduleInstanceIds],
    availableFidelityLevels: [{ id: 'aggregate', modelId: `${id}:aggregate`, rank: 0 }, { id: 'detail', modelId: `${id}:detail`, rank: 1 }],
    simulationResidencyPolicy: { allowedStates: ['aggregate', 'active', 'refining'], defaultState: 'active' },
    spatialResidencyPolicy: { allowedStates: ['absent', 'staged', 'resident'], defaultState: 'resident' },
    renderRepresentationIds: [`render:${id}`],
    controlIds: [],
    proofObligationIds: [`proof:${id}`],
  };
}

function port(id, moduleInstanceId, direction) {
  return {
    schema: contracts.SCHEMAS.port,
    id,
    moduleInstanceId,
    direction,
    kind: 'sampled-state',
    quantity: 'available-network-capacity',
    dataSchemaId: 'simulatte.scalar.v1',
    shape: [],
    unit: 'Gbit/s',
    dimension: 'information/time',
    coordinateFrameId: null,
    cadence: { kind: 'fixed', intervalSeconds: 3600 },
    timestampSemantics: 'interval-end',
    latencySeconds: 0,
    interpolationPolicy: 'hold',
    aggregationPolicy: 'minimum',
    uncertainty: { kind: 'none', unit: null, confidenceLevel: null },
    provenanceRequired: true,
    determinismClass: 'exact',
    authority: 'subsea-network',
    validRange: { minimum: 0, maximum: null },
    missingDataBehavior: 'reject',
    backpressurePolicy: 'block',
  };
}

function edge(id, sourcePortId, destinationPortId, convergencePolicyId = null) {
  return {
    id,
    sourcePortId,
    destinationPortId,
    adapterId: null,
    communicationCadence: { kind: 'fixed', intervalSeconds: 3600 },
    delaySeconds: 0,
    initializationRule: 'require-initial-value',
    samplingPolicy: 'exact',
    errorPolicy: 'stop',
    convergencePolicyId,
    proofObligationIds: [`proof:${id}`],
  };
}

function fixture() {
  const frames = [frame('earth-frame'), frame('datacenter-frame', 'earth-frame')];
  const scopes = [
    scope('earth', null, 'earth-frame', ['virginia-datacenter'], ['subsea']),
    scope('virginia-datacenter', 'earth', 'datacenter-frame', [], ['wan']),
  ];
  const ports = [port('subsea.deliveredGbps', 'subsea', 'output'), port('wan.availableGbps', 'wan', 'input')];
  const couplingPlan = {
    schema: contracts.SCHEMAS.coupling,
    id: 'earth-datacenter-coupling',
    edges: [edge('subsea-to-wan', 'subsea.deliveredGbps', 'wan.availableGbps')],
    coupledSolvers: [],
  };
  return { frames, frameAdapters: [], scopes, ports, couplingPlan };
}

test('six canonical multiscale schemas are strict versioned public contracts', () => {
  const names = ['recursive-world-scope', 'coordinate-frame', 'simulation-port', 'coupling-plan', 'scope-checkpoint', 'fidelity-transition'];
  names.forEach((name) => {
    const schema = JSON.parse(fs.readFileSync(path.join(root, `public/shared/contracts/${name}.schema.json`), 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.additionalProperties, false);
    assert.match(schema.$id, new RegExp(`${name}\\.schema\\.json$`));
  });
});

test('one Earth scope can contain one datacenter through explicit frames, ports, and coupling', () => {
  const value = fixture();
  assert.equal(contracts.validateWorldComposition(value), value);
});

test('WGS84 coordinates round trip through an explicit bidirectional ECEF adapter', () => {
  const adapter = {
    id: 'wgs84-ecef-v1',
    sourceFrameId: 'earth-wgs84',
    destinationFrameId: 'earth-ecef',
    method: 'wgs84-ecef',
    direction: 'bidirectional',
    parameters: { semiMajorAxisMeters: 6378137, inverseFlattening: 298.257223563 },
    authority: 'test',
  };
  assert.equal(contracts.validateCoordinateFrameAdapter(adapter, { frameIds: new Set(['earth-wgs84', 'earth-ecef']) }), adapter);
  const source = [39.0438, -77.4874, 100];
  const ecef = contracts.transformCoordinate(adapter, source);
  const restored = contracts.transformCoordinate(adapter, ecef, 'reverse');
  assert.ok(Math.abs(restored[0] - source[0]) < 1e-8);
  assert.ok(Math.abs(restored[1] - source[1]) < 1e-8);
  assert.ok(Math.abs(restored[2] - source[2]) < 0.001);
  for (const latitude of [-90, 90]) {
    const pole = [latitude, 0, 25];
    const poleRestored = contracts.transformCoordinate(adapter, contracts.transformCoordinate(adapter, pole), 'reverse');
    assert.ok(Math.abs(poleRestored[0] - pole[0]) < 1e-10);
    assert.equal(poleRestored[1], 0);
    assert.ok(Math.abs(poleRestored[2] - pole[2]) < 0.000001);
  }
});

test('unit mismatch requires a named adapter', () => {
  const value = fixture();
  value.ports[1].unit = 'MB/s';
  assert.throws(() => contracts.validateWorldComposition(value), /named adapter for unit/);
  value.couplingPlan.edges[0].adapterId = 'gbit-to-megabyte-per-second';
  assert.equal(contracts.validateWorldComposition(value), value);
});

test('missing coordinate frames and frame cycles fail closed', () => {
  const value = fixture();
  value.scopes[1].coordinateFrameId = 'missing-frame';
  assert.throws(() => contracts.validateWorldComposition(value), /known coordinate frame/);
  const cyclic = fixture();
  cyclic.frames[0].transformToParent = { parentFrameId: 'datacenter-frame', translation: [0, 0, 0], rotationQuaternion: [0, 0, 0, 1], scale: 1 };
  assert.throws(() => contracts.validateWorldComposition(cyclic), /acyclic parent chain/);
});

test('sampled state cannot hide an ambiguous event clock', () => {
  const value = port('bad-clock', 'scheduler', 'input');
  value.cadence = { kind: 'event', intervalSeconds: null };
  assert.throws(() => contracts.validateSimulationPort(value), /fixed for sampled-state port/);
});

test('zero-delay feedback requires a named coupled solver covering the cycle', () => {
  const value = fixture();
  const returnOutput = port('wan.requestedGbps', 'wan', 'output');
  const returnInput = port('subsea.requestedGbps', 'subsea', 'input');
  value.ports.push(returnOutput, returnInput);
  value.couplingPlan.edges.push(edge('wan-to-subsea', returnOutput.id, returnInput.id));
  assert.throws(() => contracts.validateWorldComposition(value), /declared solver covering zero-delay cycle/);
  value.couplingPlan.edges.forEach((row) => { row.convergencePolicyId = 'network-demand-fixed-point'; });
  value.couplingPlan.coupledSolvers.push({ id: 'network-demand-fixed-point', edgeIds: ['subsea-to-wan', 'wan-to-subsea'], algorithm: 'gauss-seidel', tolerance: 0.001, maximumIterations: 32 });
  assert.equal(contracts.validateWorldComposition(value), value);
});

test('checkpoint requires reconstructible state and unique module identities', () => {
  const checkpoint = {
    schema: contracts.SCHEMAS.checkpoint,
    id: 'checkpoint:earth:1',
    contentHash: SHA,
    worldSpecContentHash: 'fnv1a32:12345678',
    scopeId: 'earth',
    logicalTime: 3600,
    compatibilityVersion: '1.0.0',
    sourceCheckpointId: null,
    moduleImplementations: [{ moduleInstanceId: 'subsea', implementationId: 'subsea-v1', implementationHash: SHA, determinismClass: 'exact' }],
    moduleStates: [{ moduleInstanceId: 'subsea', stateHash: SHA, state: { deliveredGbps: 1200 } }],
    reconstructionReferences: [],
    pendingEvents: [],
    portBuffers: [{ portId: 'subsea.deliveredGbps', valueHash: SHA, timestamp: 3600, value: 1200 }],
    couplingState: {},
    fidelityLevels: [{ scopeId: 'earth', fidelityLevelId: 'detail' }],
    omittedScopes: [{ scopeId: 'virginia-datacenter', policy: 'exact-checkpoint', referenceId: 'checkpoint:dc:1' }],
  };
  assert.equal(contracts.validateScopeCheckpoint(checkpoint), checkpoint);
  checkpoint.moduleStates.push({ ...checkpoint.moduleStates[0] });
  assert.throws(() => contracts.validateScopeCheckpoint(checkpoint), /unique moduleInstanceId/);
});

test('fidelity transitions cannot claim exact continuity after discarding information', () => {
  const transition = {
    schema: contracts.SCHEMAS.fidelity,
    id: 'transition:rack:detail-to-aggregate',
    scopeId: 'rack-1',
    logicalTime: 10,
    sourceModelId: 'rack-detail',
    targetModelId: 'rack-aggregate',
    sourceStateHash: SHA,
    method: 'coarsen',
    transformationId: 'rack-sum-v1',
    preservedQuantities: ['power-watts'],
    discardedInformation: ['per-gpu-temperature'],
    errorBounds: [{ quantity: 'temperature-kelvin', absolute: 2, relative: null }],
    initializationMethod: 'conservative-aggregation',
    causalFrontier: ['scheduler'],
    resultStateHash: SHA,
    continuityClaim: 'lossy',
    branchId: null,
  };
  assert.equal(contracts.validateFidelityTransition(transition), transition);
  transition.method = 'exact-checkpoint';
  transition.continuityClaim = 'exact';
  assert.throws(() => contracts.validateFidelityTransition(transition), /exact transition without discarded information/);
});
