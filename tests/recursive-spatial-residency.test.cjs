const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const referenceApi = require('../public/simulatte/world/earth-virginia-datacenter-reference.js');

function bytes(value) { return new TextEncoder().encode(JSON.stringify(value)); }
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function payload(id, scopeId, parentRepresentationId, value, fidelityRank = 0) {
  const body = bytes(value);
  return {
    schema: 'simulatte.recursiveRenderPayload/v1',
    id,
    scopeId,
    parentRepresentationId,
    fidelityLevelId: `${scopeId}:visual-${fidelityRank}`,
    fidelityRank,
    url: `memory://${id}`,
    sha256: sha(body),
    cpuBytesEstimate: body.byteLength,
    gpuBytesEstimate: 20,
    body,
  };
}

function loadInputs() {
  const load = (name) => require(`../public/data/subsea-network-global/${name}.json`);
  return {
    datasets: {
      fcc: load('fcc-cable-license-register-2025-v1'), landings: load('landing-points-governed-v1'), topology: load('cable-corridors-modeled-v1'),
      capacities: load('capacity-scenarios-v1'), demands: load('demand-scenarios-v1'), repairs: load('repair-resources-v1'),
      governance: load('model-governance-v1'), provenance: load('provenance-registry-v1'),
    },
    subseaConfig: require('../public/shared/plugins/subsea-network-global/default-config.json'),
    gpuConfig: require('../public/shared/plugins/gpu-supercluster/default-config.json'),
  };
}

function createSpatial(reference, rows, overrides = {}) {
  const byUrl = new Map(rows.map((row) => [row.url, row.body]));
  return reference.createSpatialResidency({
    representations: rows.map(({ body, ...row }) => row),
    tileOptions: {
      fetchBytes: async (url) => byUrl.get(url),
      hashBytes: async (value) => sha(value),
      upload: async (decoded, entry) => ({ resource: decoded, gpuBytes: rows.find((row) => row.id === entry.id).gpuBytesEstimate }),
      maximumCpuBytes: 1024,
      maximumGpuBytes: 1024,
      now: (() => { let value = 0; return () => ++value; })(),
      ...overrides,
    },
  });
}

test('child representations atomically replace a pinned parent within final-state budgets', async () => {
  const reference = referenceApi.createReferenceWorld(loadInputs());
  const parent = payload('earth-subsea-network-aggregate', 'earth', null, { id: 'earth' });
  const rack = payload('virginia-rack-detail', 'virginia-datacenter', parent.id, { id: 'rack' }, 2);
  const facility = payload('virginia-datacenter-aggregate', 'virginia-datacenter', parent.id, { id: 'facility' }, 1);
  const spatial = createSpatial(reference, [parent, rack, facility], { maximumGpuBytes: 40 });
  spatial.seedRepresentations([{ representationId: parent.id, decoded: { id: 'earth' }, resource: { id: 'earth' }, cpuBytes: parent.body.byteLength, gpuBytes: 30 }], { pinIds: [parent.id] });
  const receipt = await spatial.requestRepresentations([facility.id, rack.id], { replaceIds: [parent.id], reason: 'camera-enter-datacenter' });
  assert.equal(receipt.activeStatePreservedUntilActivation, true);
  assert.deepEqual(receipt.replacedRepresentationIds, [parent.id]);
  assert.equal(spatial.snapshot().representationStates[parent.id], 'absent');
  assert.equal(spatial.snapshot().representationStates[facility.id], 'resident');
  assert.equal(spatial.snapshot().representationStates[rack.id], 'resident');
});

test('failed child staging preserves the active parent representation', async () => {
  const reference = referenceApi.createReferenceWorld(loadInputs());
  const parent = payload('earth-subsea-network-aggregate', 'earth', null, { id: 'earth' });
  const child = payload('virginia-datacenter-aggregate', 'virginia-datacenter', parent.id, { id: 'facility' }, 1);
  const spatial = createSpatial(reference, [parent, child], { hashBytes: async () => '0'.repeat(64) });
  spatial.seedRepresentations([{ representationId: parent.id, decoded: { id: 'earth' }, resource: { id: 'earth' }, cpuBytes: parent.body.byteLength, gpuBytes: 20 }], { pinIds: [parent.id] });
  await assert.rejects(spatial.requestRepresentations([child.id], { replaceIds: [parent.id] }), (error) => error.code === 'tile_hash_mismatch');
  assert.equal(spatial.activeResource(parent.id).id, 'earth');
  assert.equal(spatial.snapshot().representationStates[parent.id], 'pinned');
  assert.equal(spatial.snapshot().representationStates[child.id], 'absent');
});

test('predictive prefetch uses stable priority order and respects pins during eviction', async () => {
  const reference = referenceApi.createReferenceWorld(loadInputs());
  const earth = payload('earth-subsea-network-aggregate', 'earth', null, { id: 'earth' });
  const facility = payload('virginia-datacenter-aggregate', 'virginia-datacenter', earth.id, { id: 'facility' }, 1);
  const rack = payload('virginia-rack-detail', 'virginia-datacenter', facility.id, { id: 'rack' }, 2);
  const spatial = createSpatial(reference, [earth, facility, rack]);
  const receipt = await spatial.prefetch([
    { representationId: rack.id, priority: 1 },
    { representationId: earth.id, priority: 3 },
    { representationId: facility.id, priority: 2 },
  ], { pinIds: [earth.id] });
  assert.deepEqual(receipt.representationIds, [earth.id, facility.id, rack.id]);
  assert.equal(spatial.snapshot().representationStates[earth.id], 'pinned');
  assert.throws(() => spatial.evictRepresentation(earth.id), (error) => error.code === 'tile_remove_pinned');
  spatial.unpin(earth.id);
  assert.equal(spatial.evictRepresentation(earth.id), true);
});

test('spatial loading and eviction cannot alter causal simulation execution', async () => {
  const reference = referenceApi.createReferenceWorld(loadInputs());
  const control = referenceApi.createReferenceWorld(loadInputs());
  const earth = payload('earth-subsea-network-aggregate', 'earth', null, { id: 'earth' });
  const facility = payload('virginia-datacenter-aggregate', 'virginia-datacenter', earth.id, { id: 'facility' }, 1);
  const spatial = createSpatial(reference, [earth, facility]);
  await reference.simulationResidency.runUntil(3540);
  await control.simulationResidency.runUntil(3540);
  await spatial.requestRepresentations([earth.id]);
  await spatial.requestRepresentations([facility.id], { replaceIds: [earth.id] });
  spatial.evictRepresentation(facility.id);
  await reference.simulationResidency.runUntil(3900);
  await control.simulationResidency.runUntil(3900);
  assert.deepEqual(reference.simulationResidency.getCoordinator().getLedger(), control.simulationResidency.getCoordinator().getLedger());
  assert.equal(spatial.snapshot().simulationResidencyObservation.coordinator.logicalTime, 3900);
  assert.equal(spatial.snapshot().representationStates[facility.id], 'absent');
});
