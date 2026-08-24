const assert = require('node:assert/strict');
const test = require('node:test');

const contracts = require('../public/shared/contracts/multiscale-contracts.js');
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

test('offscreen interest never suspends a causally required simulation scope', async () => {
  const { simulationResidency } = referenceApi.createReferenceWorld(loadInputs());
  simulationResidency.setInterest({ scopeId: 'virginia-datacenter', visible: false, authority: 'reference-camera' });
  await simulationResidency.runUntil(3900);
  const snapshot = simulationResidency.snapshot();
  assert.equal(snapshot.scopes['virginia-datacenter'].state, 'active');
  assert.equal(snapshot.scopes['virginia-datacenter'].causallyRequired, true);
  assert.equal(snapshot.coordinator.moduleActive['gpu-cluster'], true);
  assert.equal(snapshot.coordinator.logicalTime, 3900);
});

test('causal scopes reject suspension until an authorized horizon releases them', async () => {
  const { simulationResidency } = referenceApi.createReferenceWorld(loadInputs());
  await simulationResidency.runUntil(3900);
  await assert.rejects(
    simulationResidency.checkpointScope({ scopeId: 'virginia-datacenter', checkpointId: 'premature', authority: 'reference-operator' }),
    (error) => error.code === 'simulation_residency_causal_suspend_forbidden'
  );
  simulationResidency.setCausalRequirement({ scopeId: 'virginia-datacenter', required: false, authority: 'reference-operator', horizon: 'after-causal-settlement@3900' });
  const checkpoint = await simulationResidency.checkpointScope({ scopeId: 'virginia-datacenter', checkpointId: 'settled-datacenter', authority: 'reference-operator' });
  assert.equal(contracts.validateScopeCheckpoint(checkpoint), checkpoint);
  assert.equal(simulationResidency.snapshot().coordinator.moduleActive['gpu-cluster'], false);
  const transition = await simulationResidency.restoreScope({ scopeId: 'virginia-datacenter', checkpointId: 'settled-datacenter', authority: 'reference-operator' });
  assert.equal(contracts.validateFidelityTransition(transition), transition);
  assert.equal(transition.continuityClaim, 'exact');
  const after = (await simulationResidency.getCoordinator().checkpoint('restored')).states;
  checkpoint.moduleStates.forEach((row) => assert.deepEqual(after[row.moduleInstanceId], row.state));
});

test('checkpointed detail cannot silently rejoin after another scope advances', async () => {
  const { simulationResidency } = referenceApi.createReferenceWorld(loadInputs());
  await simulationResidency.runUntil(3900);
  simulationResidency.setCausalRequirement({ scopeId: 'virginia-datacenter', required: false, authority: 'reference-operator', horizon: 'after-causal-settlement@3900' });
  await simulationResidency.checkpointScope({ scopeId: 'virginia-datacenter', checkpointId: 'stale-datacenter', authority: 'reference-operator' });
  await simulationResidency.runUntil(3960);
  await assert.rejects(
    simulationResidency.restoreScope({ scopeId: 'virginia-datacenter', checkpointId: 'stale-datacenter', authority: 'reference-operator' }),
    (error) => error.code === 'simulation_residency_checkpoint_rejoin_requires_branch'
  );
  assert.equal(simulationResidency.snapshot().coordinator.moduleActive['subsea-capacity'], true);
});

test('lossy datacenter aggregation and refinement create a qualified execution branch', async () => {
  const { simulationResidency } = referenceApi.createReferenceWorld(loadInputs());
  await simulationResidency.runUntil(3900);
  const coarsen = await simulationResidency.aggregateScope({
    scopeId: 'virginia-datacenter',
    targetFidelityLevelId: 'virginia-datacenter:facility-aggregate',
    authority: 'reference-operator',
  });
  assert.equal(coarsen.method, 'coarsen');
  assert.equal(coarsen.continuityClaim, 'lossy');
  const aggregate = await simulationResidency.getCoordinator().checkpoint('aggregate-state');
  assert.equal(aggregate.states['gpu-cluster'].fidelity, 'aggregate');
  assert.equal('racks' in aggregate.states['gpu-cluster'].thermalState, false);

  const refine = await simulationResidency.refineScope({
    scopeId: 'virginia-datacenter',
    targetFidelityLevelId: 'virginia-datacenter:declared-detail',
    authority: 'reference-operator',
    branchId: 'qualified-rack-refinement-001',
  });
  assert.equal(refine.method, 'qualified-sampling');
  assert.equal(refine.continuityClaim, 'qualified-branch');
  assert.equal(simulationResidency.snapshot().coordinator.branchId, 'qualified-rack-refinement-001');
  const detailed = await simulationResidency.getCoordinator().checkpoint('refined-state');
  assert.equal(detailed.states['gpu-cluster'].fidelity, 'detail');
  assert.equal(detailed.states['gpu-cluster'].thermalState.racks.length, detailed.states['gpu-cluster'].thermalState.racksCount);
  assert.ok(simulationResidency.getLedger().some((row) => row.kind === 'scope-refining'));
});

test('residency mutation is rejected while the coordinator is advancing', async () => {
  const { simulationResidency } = referenceApi.createReferenceWorld(loadInputs());
  const running = simulationResidency.runUntil(60);
  await assert.rejects(
    simulationResidency.aggregateScope({ scopeId: 'virginia-datacenter', targetFidelityLevelId: 'virginia-datacenter:facility-aggregate', authority: 'reference-operator' }),
    (error) => error.code === 'simulation_residency_boundary_unsafe'
  );
  await running;
});
