const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const referenceApi = require('../public/simulatte/world/earth-virginia-datacenter-reference.js');
const sceneApi = require('../public/simulatte/world/recursive-world-scene.js');
const proofApi = require('../public/simulatte/world/recursive-world-proof.js');

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

test('recursive proof binds one causal execution and keeps absent evidence not proven', async () => {
  const reference = referenceApi.createReferenceWorld(loadInputs());
  const scene = sceneApi.compileScene(reference.worldSpec);
  await reference.coordinator.runUntil(3540);
  const baseline = reference.coordinator.observePorts();
  await reference.coordinator.runUntil(3900);
  const terminal = reference.coordinator.observePorts();
  const proof = proofApi.createProof({
    worldSpec: reference.worldSpec,
    scene,
    coordinatorSnapshot: reference.coordinator.snapshot(),
    ledger: reference.coordinator.getLedger(),
    baselineObservation: baseline,
    terminalObservation: terminal,
    replayResult: await reference.coordinator.replay(),
    residencyReceipts: [residencyReceipt(reference.worldSpec.contentHash)],
    workerParityReceipt: workerParityReceipt(reference.worldSpec.contentHash),
    buildId: 'test-build',
    runtimeId: 'simulatte.recursive-world-webgpu/v1',
    deviceClass: 'webgpu:test-device',
    qualificationLaneId: 'test-lane',
    browserMode: 'test',
  });
  assert.equal(proof.proofClasses.composition.status, 'pass');
  assert.equal(proof.proofClasses.simulation.status, 'pass');
  assert.equal(proof.proofClasses.replay.status, 'pass');
  assert.equal(proof.proofClasses.residency.status, 'pass');
  assert.equal(proof.proofClasses['worker-parity'].status, 'pass');
  assert.equal(proof.proofClasses.visual.status, 'not-proven');
  assert.equal(proof.proofClasses.performance.status, 'not-proven');
  assert.equal(proof.verdict, 'not-proven');
  assert.equal(proofApi.validateProof(proof), proof);
  const malformedStatus = JSON.parse(JSON.stringify(proof));
  malformedStatus.proofClasses.visual.status = 'bogus';
  malformedStatus.contentHash = sceneApi.contentHash(malformedStatus);
  assert.throws(() => proofApi.validateProof(malformedStatus), (error) => error.code === 'recursive_proof_class_status_invalid');
  const unexpectedAuthority = JSON.parse(JSON.stringify(proof));
  unexpectedAuthority.authority = 'self-declared';
  unexpectedAuthority.contentHash = sceneApi.contentHash(unexpectedAuthority);
  assert.throws(() => proofApi.validateProof(unexpectedAuthority), (error) => error.code === 'recursive_proof_keys_invalid');
  const inconsistentVerdict = JSON.parse(JSON.stringify(proof));
  inconsistentVerdict.verdict = 'pass';
  inconsistentVerdict.contentHash = sceneApi.contentHash(inconsistentVerdict);
  assert.throws(() => proofApi.validateProof(inconsistentVerdict), (error) => error.code === 'recursive_proof_verdict_inconsistent');

  const contradictoryCausalStatus = JSON.parse(JSON.stringify(proof));
  contradictoryCausalStatus.causalSettlements[0].terminalValue = contradictoryCausalStatus.causalSettlements[0].baselineValue + 1;
  contradictoryCausalStatus.contentHash = sceneApi.contentHash(contradictoryCausalStatus);
  assert.throws(
    () => proofApi.validateProof(contradictoryCausalStatus),
    (error) => error.code === 'recursive_proof_causal_verdict_inconsistent'
  );

  const contradictorySimulationStatus = JSON.parse(JSON.stringify(proof));
  contradictorySimulationStatus.causalSettlements[0].comparison = 'increases';
  contradictorySimulationStatus.causalSettlements[0].status = 'fail';
  contradictorySimulationStatus.contentHash = sceneApi.contentHash(contradictorySimulationStatus);
  assert.throws(
    () => proofApi.validateProof(contradictorySimulationStatus),
    (error) => error.code === 'recursive_proof_simulation_verdict_inconsistent'
  );

  const missingPassingEvidence = JSON.parse(JSON.stringify(proof));
  missingPassingEvidence.proofClasses.composition.evidence = [];
  missingPassingEvidence.contentHash = sceneApi.contentHash(missingPassingEvidence);
  assert.throws(
    () => proofApi.validateProof(missingPassingEvidence),
    (error) => error.code === 'recursive_proof_class_evidence_missing'
  );
});

function residencyReceipt(worldSpecContentHash) {
  const receipt = {
    schema: 'simulatte.recursive-residency-proof-receipt/v1',
    status: 'pass',
    worldSpecContentHash,
    buildId: 'test-build',
    runtimeId: 'simulatte.recursive-world-webgpu/v1',
    deviceClass: 'webgpu:test-device',
  };
  receipt.contentHash = sceneApi.contentHash(receipt);
  return receipt;
}

function workerParityReceipt(worldSpecContentHash) {
  const receipt = {
    schema: 'simulatte.recursive-worker-parity-receipt/v1',
    status: 'pass',
    worldSpecContentHash,
    buildId: 'test-build',
    runtimeId: 'simulatte.recursive-world-webgpu/v1',
    deviceClass: 'webgpu:test-device',
  };
  receipt.contentHash = sceneApi.contentHash(receipt);
  return receipt;
}

test('recursive proof fails a reversed causal outcome and rejects hash tampering', async () => {
  const reference = referenceApi.createReferenceWorld(loadInputs());
  const scene = sceneApi.compileScene(reference.worldSpec);
  await reference.coordinator.runUntil(3540);
  const baseline = reference.coordinator.observePorts();
  await reference.coordinator.runUntil(3900);
  const terminal = reference.coordinator.observePorts();
  const proof = proofApi.createProof({
    worldSpec: reference.worldSpec,
    scene,
    coordinatorSnapshot: reference.coordinator.snapshot(),
    ledger: reference.coordinator.getLedger(),
    baselineObservation: terminal,
    terminalObservation: terminal,
    replayResult: await reference.coordinator.replay(),
    buildId: 'test-build',
    runtimeId: 'test-runtime',
    deviceClass: 'test-device',
    qualificationLaneId: 'test-lane',
    browserMode: 'test',
  });
  assert.equal(proof.proofClasses.simulation.status, 'fail');
  assert.equal(proof.verdict, 'fail');
  const tampered = JSON.parse(JSON.stringify(proof));
  tampered.buildId = 'tampered-build';
  assert.throws(() => proofApi.validateProof(tampered), (error) => error.code === 'recursive_proof_hash_invalid');
});

test('performance proof requires compositor, CPU, and completed GPU work within one budget', async () => {
  const reference = referenceApi.createReferenceWorld(loadInputs());
  const scene = sceneApi.compileScene(reference.worldSpec);
  await reference.coordinator.runUntil(3540);
  const baseline = reference.coordinator.observePorts();
  await reference.coordinator.runUntil(3900);
  const terminal = reference.coordinator.observePorts();
  const makeReceipt = (gpuP95, overrides = {}) => {
    const receipt = {
      schema: 'simulatte.recursive-render-performance-receipt/v2',
      status: 'pass',
      worldSpecContentHash: reference.worldSpec.contentHash,
      sceneContentHash: scene.contentHash,
      buildId: 'test-build',
      runtimeId: 'test-runtime',
      deviceClass: 'test-device',
      qualificationLaneId: 'test-120-lane',
      browserMode: 'test',
      targetFramesPerSecond: 120,
      frameBudgetMilliseconds: 1000 / 120,
      sampleCount: 240,
      compositorSampleCount: 240,
      cpuSampleCount: 240,
      gpuCompletionSampleCount: 240,
      medianFrameMilliseconds: 4,
      p95FrameMilliseconds: Math.max(5, gpuP95),
      compositorMedianFrameMilliseconds: 4,
      compositorP95FrameMilliseconds: 5,
      cpuMedianFrameMilliseconds: 1,
      cpuP95FrameMilliseconds: 2,
      gpuCompletionMedianMilliseconds: 2,
      gpuCompletionP95Milliseconds: gpuP95,
      gpuCompletionMethod: 'GPUQueue.onSubmittedWorkDone',
      refreshEstimateHz: 250,
      population: 'test',
      claimBoundary: 'test',
      ...overrides,
    };
    receipt.contentHash = sceneApi.contentHash(receipt);
    return receipt;
  };
  const replayResult = await reference.coordinator.replay();
  const create = (performanceReceipt) => proofApi.createProof({
    worldSpec: reference.worldSpec,
    scene,
    coordinatorSnapshot: reference.coordinator.snapshot(),
    ledger: reference.coordinator.getLedger(),
    baselineObservation: baseline,
    terminalObservation: terminal,
    replayResult,
    performanceReceipt,
    buildId: 'test-build',
    runtimeId: 'test-runtime',
    deviceClass: 'test-device',
    qualificationLaneId: 'test-120-lane',
    browserMode: 'test',
  });
  assert.equal(create(makeReceipt(3)).proofClasses.performance.status, 'pass');
  assert.equal(create(makeReceipt(3, { cpuMedianFrameMilliseconds: 0 })).proofClasses.performance.status, 'pass');
  assert.equal(create(makeReceipt(9)).proofClasses.performance.status, 'fail');
  assert.equal(create(makeReceipt(3, { qualificationLaneId: 'substituted-lane' })).proofClasses.performance.status, 'fail');
  assert.equal(create(makeReceipt(3, { medianFrameMilliseconds: null })).proofClasses.performance.status, 'fail');
});

test('published recursive proof schema names every independent proof class', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/shared/contracts/recursive-world-proof.schema.json'), 'utf8'));
  assert.equal(schema.properties.schema.const, proofApi.PROOF_SCHEMA);
  assert.deepEqual(schema.properties.proofClasses.required, proofApi.CLASSES);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.proofClass.allOf[0].then.properties.evidence.minItems, 1);
});
