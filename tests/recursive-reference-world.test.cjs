const assert = require('node:assert/strict');
const test = require('node:test');

const contracts = require('../public/shared/contracts/multiscale-contracts.js');
const worldSpecApi = require('../public/shared/contracts/world-spec.js');
const referenceApi = require('../public/simulatte/world/earth-virginia-datacenter-reference.js');

function loadInputs() {
  const load = (name) => require(`../public/data/subsea-network-global/${name}.json`);
  return {
    datasets: {
      fcc: load('fcc-cable-license-register-2025-v1'),
      landings: load('landing-points-governed-v1'),
      topology: load('cable-corridors-modeled-v1'),
      capacities: load('capacity-scenarios-v1'),
      demands: load('demand-scenarios-v1'),
      repairs: load('repair-resources-v1'),
      governance: load('model-governance-v1'),
      provenance: load('provenance-registry-v1'),
    },
    subseaConfig: require('../public/shared/plugins/subsea-network-global/default-config.json'),
    gpuConfig: require('../public/shared/plugins/gpu-supercluster/default-config.json'),
  };
}

test('reference WorldSpec binds recursive scopes, typed ports, explicit frames, and exact module implementations', () => {
  const reference = referenceApi.createReferenceWorld(loadInputs());
  assert.equal(worldSpecApi.validateWorldSpec(reference.worldSpec), reference.worldSpec);
  assert.equal(contracts.validateWorldComposition(reference.worldSpec.compositionGraph), reference.worldSpec.compositionGraph);
  assert.deepEqual(reference.worldSpec.modules, [
    'subsea-capacity',
    'virginia-wan-gateway',
    'datacenter-training-scheduler',
    'gpu-cluster',
  ]);
  assert.equal(reference.worldSpec.compositionGraph.scopes.length, 5);
  assert.equal(reference.worldSpec.compositionGraph.frames.length, 6);
  assert.equal(reference.worldSpec.compositionGraph.frameAdapters.length, 1);
  assert.deepEqual(reference.worldSpec.compositionGraph.scopes.map((scope) => [scope.id, scope.childScopeIds]), [
    ['earth', ['virginia-datacenter']],
    ['virginia-datacenter', ['virginia-rack-01']],
    ['virginia-rack-01', ['virginia-node-0001']],
    ['virginia-node-0001', ['virginia-gpu-0001']],
    ['virginia-gpu-0001', []],
  ]);
  assert.equal(reference.worldSpec.compositionGraph.couplingPlan.edges.length, 4);
  assert.deepEqual(reference.worldSpec.renderProgram.stateBindings.map((binding) => binding.sourcePortId), [
    'subsea.mid-atlantic.delivered-gbps',
    'virginia-wan.available-gbps',
    'datacenter-scheduler.throughput-steps-per-hour',
    'gpu-cluster.it-power-kw',
    'gpu-cluster.facility-power-kw',
    'gpu-cluster.peak-junction-temperature-c',
  ]);
  assert.match(reference.worldSpec.contentHash, /^fnv1a32:[0-9a-f]{8}$/);
});

test('declared MAREA failure propagates through WAN, scheduler, power, and thermal state', async () => {
  const reference = referenceApi.createReferenceWorld(loadInputs());
  const coordinator = reference.coordinator;
  await coordinator.runUntil(3540);
  const baseline = await coordinator.checkpoint('before-marea-failure');
  await coordinator.runUntil(3900);
  const affected = await coordinator.checkpoint('after-causal-settlement');

  assert.equal(baseline.states['subsea-capacity'].failureActive, false);
  assert.equal(affected.states['subsea-capacity'].failureActive, true);
  assert.ok(affected.states['subsea-capacity'].deliveredGbps < baseline.states['subsea-capacity'].deliveredGbps);
  assert.ok(affected.states['virginia-wan-gateway'].availableGbps < baseline.states['virginia-wan-gateway'].availableGbps);
  assert.ok(affected.states['datacenter-training-scheduler'].throughputStepsPerHour < baseline.states['datacenter-training-scheduler'].throughputStepsPerHour);
  assert.ok(affected.states['datacenter-training-scheduler'].queueDepthSteps > baseline.states['datacenter-training-scheduler'].queueDepthSteps);
  assert.ok(affected.states['gpu-cluster'].totalItPowerKw < baseline.states['gpu-cluster'].totalItPowerKw);
  assert.ok(affected.states['gpu-cluster'].peakJunctionTempC < baseline.states['gpu-cluster'].peakJunctionTempC);
  assert.equal(affected.states['subsea-capacity'].sourceScenarioIdentity, reference.reference.subsea.scenarioIdentity);
  const observed = coordinator.observePorts();
  assert.equal(observed.records['subsea.mid-atlantic.delivered-gbps'].value, affected.states['subsea-capacity'].deliveredGbps);
  assert.equal(observed.records['virginia-wan.available-gbps'].value, affected.states['virginia-wan-gateway'].availableGbps);
  assert.equal(observed.records['datacenter-scheduler.throughput-steps-per-hour'].value, affected.states['datacenter-training-scheduler'].throughputStepsPerHour);
  assert.equal(observed.records['gpu-cluster.it-power-kw'].value, affected.states['gpu-cluster'].totalItPowerKw);
  assert.equal(observed.records['gpu-cluster.peak-junction-temperature-c'].value, affected.states['gpu-cluster'].peakJunctionTempC);
});

test('reference causal execution and WorldSpec identities reproduce exactly', async () => {
  const left = referenceApi.createReferenceWorld(loadInputs());
  const right = referenceApi.createReferenceWorld(loadInputs());
  await left.coordinator.runUntil(3900);
  await right.coordinator.runUntil(3900);
  assert.equal(left.worldSpec.contentHash, right.worldSpec.contentHash);
  assert.deepEqual(left.coordinator.getLedger(), right.coordinator.getLedger());
  assert.deepEqual(await left.coordinator.replay(), { status: 'match', rounds: 65, terminalTime: 3900 });
});

test('reference world rejects ungoverned demand identities before execution', () => {
  const subseaApi = require('../public/shared/plugins/subsea-network-global/multiscale-module.js');
  const inputs = loadInputs();
  assert.throws(() => subseaApi.createSubseaCapacityModule({
    datasets: inputs.datasets,
    config: inputs.subseaConfig,
    scenario: {
      scenarioId: 'atlantic-single-cut',
      capacityScenarioId: 'modeled-atlantic-capacity-v1',
      repairScenarioId: 'atlantic-repair-resources-v1',
      failedResourceIds: ['marea:spain'],
      excludedLandingIds: [],
      allocationPolicyId: 'proportional-fair',
      repairPolicyId: 'unmet-demand-first',
      repairResourceCount: 2,
      essentialServiceWeight: 3,
      seed: 'subsea-atlantic-001',
    },
    demandIds: ['unregistered-virginia-demand'],
  }), (error) => error.code === 'subsea_multiscale_demand_unknown');
});
