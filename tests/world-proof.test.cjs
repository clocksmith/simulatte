const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const worldProof = require('../public/shared/contracts/world-proof.js');
const lab = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');

const rendererScope = globalThis.SimulattePhaseModuleRegistry.family('webGpuRenderer');

function fixedStepState(spec, stepCount = 8, stepSeconds = 1 / 60) {
  let state = lab.createSimulationState(spec);
  for (let index = 0; index < stepCount; index += 1) {
    state = lab.stepSimulation(state, spec, stepSeconds);
  }
  return state;
}

function withElapsedTimeSafety(spec, maximum = 1, severity = 'block') {
  const candidate = JSON.parse(lab.serializeSpec(spec));
  candidate.safety = {
    schema: 'simulatte.worldSpecSafety.v1',
    status: 'declared',
    rules: [{
      schema: 'simulatte.worldSpecSafetyRule.v1',
      id: 'safety:elapsed-time-bound',
      description: 'Keep the proof trajectory within its elapsed-time bound',
      statePath: '/t',
      operator: 'between',
      minimum: 0,
      maximum,
      expected: null,
      tolerance: 1e-12,
      severity,
    }],
  };
  return lab.applyWorldSpecEdit(spec, candidate, {
    rationale: 'Declare a reproducible fixed-step safety bound',
  });
}

function renderedPhase7(prompt = 'a red ball') {
  const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
  const canvas = { width: 640, height: 360 };
  const intentReceipt = lab.createIntentProofReceiptForSpec(spec, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  const semanticReceipt = lab.createSemanticProofReceiptForSpec(spec, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  const input = lab.createRenderExecutionInput(spec, { t: 0 }, canvas, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
    intentReceipt,
    semanticReceipt,
  });
  const renderData = rendererScope.compileSceneRenderData(input.sceneRenderPacket);
  renderData.requireLivePixelSamples = true;
  const plan = rendererScope.phase7PixelReadbackPlan(
    renderData,
    input.sceneRenderPacket,
    input,
    canvas
  );
  const pixelSamples = {
    schema: 'simulatte.phase7PixelSampleSet.v1',
    source: 'world-proof-test-readback',
    packetKey: renderData.packetKey,
    samples: plan.samples.map((sample) => ({ ...sample, rgba: [220, 40, 50, 255] })),
  };
  return {
    spec,
    phase7: lab.runPhase7RenderExecution(input, null, canvas, {
      ...renderData,
      rendered: true,
      renderCount: 2,
      frameMs: 2,
      pixelSamples,
    }),
  };
}

function interactionExecution(prompt = 'a robot pushes a rolling metal wheel', delta = [0.2, -0.4]) {
  const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
  const target = spec.interactionIR.targets.find((row) => row.capabilities.includes('impulse'));
  assert.ok(target, 'interaction proof fixture requires an impulse-capable target');
  const state = lab.applyInteractionCommands(
    lab.createSimulationState(spec),
    spec.interactionIR,
    [
      { sequence: 1, actionId: 'select', targetId: target.id, point: [0.5, 0.5] },
      { sequence: 2, actionId: 'impulse', targetId: target.id, delta },
    ]
  );
  const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
  const phase7Receipt = rendererScope.phase7InteractionReceipt(
    { simulationState: state },
    {
      interactionVisualReceipt: {
        schema: 'simulatte.phase7InteractionVisualReceipt.v1',
        consumed: true,
      },
    },
    packet
  );
  const binding = worldProof.createWorldProofBinding(spec, {
    buildId: 'interaction-proof-test-build',
    runtimeId: 'interaction-proof-test-runtime',
  });
  const receipt = worldProof.createInteractionProofReceipt({ binding, phase7Receipt });
  return { spec, target, state, phase7Receipt, binding, receipt };
}

test('WorldProof binds all eight proof classes to the exact WorldSpec revision', () => {
  const { spec, phase7 } = renderedPhase7();
  const phase8 = lab.runPhase8SceneProof(phase7, { nowIso: '2026-08-15T00:00:00.000Z' });
  const proof = phase8.artifact.worldProof;

  assert.equal(proof.schema, worldProof.WORLD_PROOF_SCHEMA);
  assert.equal(proof.worldSpec.contentHash, spec.contentHash);
  assert.equal(proof.worldSpec.revision, spec.authorship.revision);
  assert.deepEqual(Object.keys(proof.proofClasses).sort(), [...worldProof.PROOF_CLASS_NAMES].sort());
  assert.equal(proof.proofClasses.intent.status, 'pass');
  assert.equal(proof.proofClasses.semantic.status, 'pass');
  assert.equal(proof.proofClasses.compilation.status, 'pass');
  assert.equal(proof.proofClasses.visual.status, phase8.artifact.sceneProof.verdict);
  assert.equal(proof.proofClasses.simulation.status, 'not-proven');
  assert.equal(proof.proofClasses.replay.status, 'not-proven');
  assert.equal(proof.verdict, 'not-proven');
  assert.equal(worldProof.validateWorldProof(proof), proof);
});

test('WorldProof does not convert a visual failure into another proof class', () => {
  const { phase7 } = renderedPhase7();
  phase7.artifact.renderExecution.rendered = false;
  const phase8 = lab.runPhase8SceneProof(phase7, { nowIso: '2026-08-15T00:00:00.000Z' });
  const proof = phase8.artifact.worldProof;

  assert.equal(proof.proofClasses.visual.status, 'not-proven');
  assert.equal(proof.proofClasses.intent.status, 'pass');
  assert.equal(proof.proofClasses.semantic.status, 'pass');
  assert.equal(proof.proofClasses.simulation.status, 'not-proven');
  assert.equal(proof.verdict, 'not-proven');
});

test('WorldProof passes only when every required proof class has its own receipt', () => {
  const { spec, phase7 } = renderedPhase7();
  const binding = phase7.artifact.renderExecution.worldProofBinding;
  binding.declarations.interaction = false;
  const sceneProof = lab.runPhase8SceneProof(phase7, {
    nowIso: '2026-08-15T00:00:00.000Z',
  }).artifact.sceneProof;
  const simulationReceipt = { schema: 'simulatte.simulationProofReceipt.v1', status: 'pass' };
  const semanticReceipt = lab.createSemanticProofReceiptForSpec(spec, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  const replayOptions = {
    binding,
    sceneProof,
    semanticReceipt,
    simulationReceipt,
    deviceClass: 'webgpu:test-device',
  };
  const replayReceipt = worldProof.createReplayReceipt(
    worldProof.createReplayBaseline(replayOptions),
    replayOptions
  );
  const proof = worldProof.createWorldProof({
    binding,
    sceneProof,
    intentReceipt: lab.createIntentProofReceiptForSpec(spec, {
      buildId: 'test-build',
      runtimeId: 'test-runtime',
    }),
    semanticReceipt,
    simulationReceipt,
    replayReceipt,
    runtimeReceiptId: phase7.runtimeReceiptId,
    renderDataKey: phase7.artifact.renderExecution.renderDataKey,
    nowIso: '2026-08-15T00:00:00.000Z',
  });

  assert.equal(proof.verdict, 'pass');
  assert.equal(proof.proofClasses.simulation.status, 'pass');
  assert.equal(proof.proofClasses.interaction.status, 'not-applicable');
  assert.equal(proof.proofClasses.safety.status, 'not-applicable');
  assert.equal(proof.proofClasses.replay.status, 'pass');
});

test('intent proof preserves exact counts, attributes, and negation as separate critical requirements', () => {
  const spec = lab.createSpecFromPrompt('3 red balls and no blue cubes', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });
  const requirements = spec.phaseArtifacts.phase2.artifact.intentRequirements;
  const settlement = spec.phaseArtifacts.phase4.artifact.intentSettlement;
  const receipt = lab.createIntentProofReceiptForSpec(spec, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });

  assert.equal(requirements.schema, worldProof.INTENT_REQUIREMENT_LEDGER_SCHEMA);
  assert.equal(requirements.semanticSpanCount, 5);
  assert.equal(requirements.coveredSemanticSpanCount, 5);
  assert.deepEqual(requirements.uncoveredSemanticSpanIds, []);
  assert.equal(requirements.criticalRequirementCount, 5);
  assert.ok(requirements.requirements.some((row) => (
    row.kind === 'quantity' && row.value === 3 && row.predicate === 'exact-count'
  )));
  assert.ok(requirements.requirements.some((row) => (
    row.kind === 'attribute' && row.label === 'red' && row.polarity === 'required'
  )));
  assert.ok(requirements.requirements.some((row) => (
    row.kind === 'concept' && row.label === 'cubes' && row.polarity === 'forbidden'
  )));
  assert.equal(settlement.schema, worldProof.INTENT_SETTLEMENT_LEDGER_SCHEMA);
  assert.equal(settlement.status, 'pass');
  assert.equal(settlement.acceptedCount, 5);
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.requirementLedgerHash, requirements.contentHash);
  assert.equal(receipt.settlementLedgerHash, settlement.contentHash);
  assert.equal(worldProof.validateIntentProofReceipt(receipt), receipt);
});

test('intent proof treats an unsupported concept and its relation as explicit refusals', () => {
  const spec = lab.createSpecFromPrompt('a red ball beside a qzxwplk', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });
  const receipt = lab.createIntentProofReceiptForSpec(spec, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  const refused = receipt.settlements.filter((row) => row.status === 'explicitly-refused');

  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.acceptedCount, 2);
  assert.equal(receipt.explicitRefusalCount, 2);
  assert.deepEqual(refused.map((row) => row.kind).sort(), ['entity', 'relation']);
  assert.ok(refused.every((row) => row.evidenceIds.length > 0));

  const phase4 = structuredClone(spec.phaseArtifacts.phase4.artifact);
  phase4.groundedSceneContract.unsupported =
    phase4.groundedIntent.acceptedGraph.unsupported.slice();
  phase4.groundedIntent.acceptedGraph.unsupported = [];
  phase4.groundedIntent.unsupported = [];
  const topLevelSettlement = worldProof.createIntentSettlementLedger(
    spec.phaseArtifacts.phase2.artifact.intentRequirements,
    phase4
  );
  assert.equal(topLevelSettlement.status, 'pass');
  assert.equal(topLevelSettlement.explicitRefusalCount, 2);
});

test('semantic provenance binds accepted entities, relations, properties, quantities, and negation', () => {
  const counted = lab.createSpecFromPrompt('3 red balls and no blue cubes', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });
  const related = lab.createSpecFromPrompt('an octopus holding a teapot', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });
  const countedLedger = counted.phaseArtifacts.phase4.artifact.semanticProvenance;
  const relatedLedger = related.phaseArtifacts.phase4.artifact.semanticProvenance;
  const provenanceByEntry = counted.phaseArtifacts.phase4.artifact
    .groundedSceneContract.provenanceByEntry;
  const receipt = lab.createSemanticProofReceiptForSpec(counted, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });

  assert.equal(countedLedger.schema, worldProof.SEMANTIC_PROVENANCE_LEDGER_SCHEMA);
  assert.equal(countedLedger.status, 'pass');
  assert.equal(countedLedger.bindingCount, countedLedger.provenCount);
  assert.equal(countedLedger.missingCount, 0);
  assert.deepEqual(
    [...new Set(countedLedger.bindings.map((row) => row.kind))].sort(),
    ['entity', 'negation', 'property', 'quantity']
  );
  assert.ok(relatedLedger.bindings.some((row) => row.kind === 'relation'));
  assert.ok([...countedLedger.bindings, ...relatedLedger.bindings].every((row) => (
    row.status === 'proven' &&
    (row.sourceSpanIds.length > 0 || row.evidenceIds.length > 0 || row.patchIds.length > 0)
  )));
  assert.ok(Object.values(provenanceByEntry).every((row) => (
    row.source && row.evidenceIds.length > 0
  )));
  assert.equal(receipt.schema, worldProof.SEMANTIC_PROOF_RECEIPT_SCHEMA);
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.provenanceLedgerHash, countedLedger.contentHash);
  assert.equal(receipt.graphHash, countedLedger.graphHash);
  assert.equal(worldProof.validateSemanticProofReceipt(receipt), receipt);
});

test('semantic provenance fails closed when accepted node or relation evidence is lost', () => {
  const spec = lab.createSpecFromPrompt('an octopus holding a teapot', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });
  const requirements = spec.phaseArtifacts.phase2.artifact.intentRequirements;
  const nodeLoss = structuredClone(spec.phaseArtifacts.phase4.artifact);
  const node = nodeLoss.groundedIntent.acceptedGraph.nodes[0];
  node.spanId = '';
  node.evidence = [];
  node.indexName = '';
  node.constructionProvenance = [];
  nodeLoss.groundedSceneContract.provenanceByEntry[node.id] = {
    source: '',
    evidenceIds: [],
  };
  const nodeLedger = worldProof.createSemanticProvenanceLedger(requirements, nodeLoss);
  assert.equal(nodeLedger.status, 'fail');
  assert.ok(nodeLedger.bindings.some((row) => row.kind === 'entity' && row.status === 'missing'));

  const relationLoss = structuredClone(spec.phaseArtifacts.phase4.artifact);
  const edge = relationLoss.groundedIntent.acceptedGraph.edges[0];
  edge.evidence = [];
  relationLoss.groundedSceneContract.acceptedRelations =
    relationLoss.groundedSceneContract.acceptedRelations.map((row) => (
      row.id === edge.id ? { ...row, evidenceIds: [] } : row
    ));
  const relationLedger = worldProof.createSemanticProvenanceLedger(requirements, relationLoss);
  assert.equal(relationLedger.status, 'fail');
  assert.ok(relationLedger.bindings.some((row) => row.kind === 'relation' && row.status === 'missing'));
});

test('WorldProof rejects tampered, rebound, or stale semantic receipts', () => {
  const source = lab.createSpecFromPrompt('a red ball', { allowPrototypeFallback: true });
  const other = lab.createSpecFromPrompt('a blue cube', { allowPrototypeFallback: true });
  const sourceReceipt = lab.createSemanticProofReceiptForSpec(source, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  const rebound = worldProof.createWorldProof({
    binding: worldProof.createWorldProofBinding(other, {
      buildId: 'test-build',
      runtimeId: 'test-runtime',
    }),
    semanticReceipt: sourceReceipt,
    sceneProof: { verdict: 'pass', settledObligations: [], interactionProof: null },
    simulationReceipt: { status: 'pass' },
    nowIso: '2026-08-15T00:00:00.000Z',
  });
  assert.equal(rebound.proofClasses.semantic.status, 'fail');

  const tampered = structuredClone(sourceReceipt);
  tampered.provenCount -= 1;
  assert.throws(
    () => worldProof.validateSemanticProofReceipt(tampered),
    /counts do not close|Content hash does not match/
  );

  const staleSpec = structuredClone(source);
  const node = staleSpec.phaseArtifacts.phase4.artifact.groundedIntent.acceptedGraph.nodes[0];
  staleSpec.phaseArtifacts.phase4.artifact.groundedSceneContract.provenanceByEntry[node.id] = {
    source: '',
    evidenceIds: [],
  };
  const staleBinding = worldProof.createWorldProofBinding(staleSpec, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  assert.equal(staleBinding.semantic.contractValid, false);
  const stale = worldProof.createWorldProof({
    binding: staleBinding,
    semanticReceipt: sourceReceipt,
    sceneProof: { verdict: 'pass', settledObligations: [], interactionProof: null },
    simulationReceipt: { status: 'pass' },
    nowIso: '2026-08-15T00:00:00.000Z',
  });
  assert.equal(stale.proofClasses.semantic.status, 'fail');
});

test('interaction proof binds declared actions to recomputable before and after state', () => {
  const { spec, target, binding, receipt } = interactionExecution();

  assert.equal(binding.interaction.contractValid, true);
  assert.equal(binding.interaction.contentHash, spec.interactionIR.contentHash);
  assert.equal(receipt.schema, worldProof.INTERACTION_PROOF_RECEIPT_SCHEMA);
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.worldSpecContentHash, spec.contentHash);
  assert.equal(receipt.interactionProgramHash, spec.interactionIR.contentHash);
  assert.equal(receipt.provenTransitionCount, 2);
  assert.ok(receipt.executedActionIds.includes('impulse'));
  assert.ok(receipt.executedTargetIds.includes(target.id));
  assert.ok(receipt.changedChannelIds.length > 0);
  assert.ok(receipt.transitions.every((row) => row.stateChanged && row.valid));
  assert.equal(worldProof.validateInteractionProofReceipt(receipt), receipt);
});

test('WorldProof rejects fabricated, tampered, or rebound interaction proof', () => {
  const { binding, receipt } = interactionExecution();
  const scene = {
    verdict: 'pass',
    settledObligations: [],
    interactionProof: {
      schema: 'simulatte.phase8InteractionProof.v1',
      status: 'pass',
      commandCount: 1,
      changedChannelCount: 1,
    },
  };
  assert.throws(
    () => worldProof.createWorldProof({ binding, sceneProof: scene }),
    /Unexpected interaction-proof schema|Unknown field/
  );

  const tampered = structuredClone(receipt);
  tampered.transitions[0].afterState.selectedTargetId = 'target:forged';
  assert.throws(
    () => worldProof.validateInteractionProofReceipt(tampered),
    /Transition state hash mismatch|contentHash/
  );

  const other = interactionExecution('a glass robot pushes a spinning copper gear');
  const rebound = worldProof.createWorldProof({
    binding: other.binding,
    sceneProof: {
      verdict: 'pass',
      settledObligations: [],
      interactionProof: receipt,
    },
  });
  assert.equal(rebound.proofClasses.interaction.status, 'fail');
  assert.ok(rebound.criticalFailures.some((row) => row.class === 'interaction'));
});

test('replay proof detects a changed interaction transition trace', () => {
  const baselineRun = interactionExecution(undefined, [0.2, -0.4]);
  const changedRun = interactionExecution(undefined, [-0.3, 0.15]);
  const baseOptions = {
    binding: baselineRun.binding,
    interactionProofReceipt: baselineRun.receipt,
    deviceClass: 'webgpu:test-device',
  };
  const baseline = worldProof.createReplayBaseline(baseOptions);
  const receipt = worldProof.createReplayReceipt(baseline, {
    ...baseOptions,
    interactionProofReceipt: changedRun.receipt,
  });

  assert.notEqual(baseline.outcomes.interaction.transitionHash, changedRun.receipt.transitionHash);
  assert.equal(receipt.outcomesMatch, false);
  assert.equal(receipt.status, 'fail');
});

test('replay proof compares an externally bound execution identity', () => {
  const { spec } = renderedPhase7();
  const binding = worldProof.createWorldProofBinding(spec, {
    buildId: 'external-execution-build',
    runtimeId: 'external-execution-runtime',
  });
  binding.replayIdentity.requiredClasses = ['replay-identified'];
  const baseOptions = {
    binding,
    deviceClass: 'canvas2d:test-browser',
    executionReceipt: {
      schema: 'simulatte.profileReplayExecutionIdentity.v1',
      status: 'pass',
      contentHash: 'a'.repeat(64),
      profileId: 'profile-a',
      scenarioId: 'scenario-a',
      scenarioSeed: 'seed-a',
    },
  };
  const baseline = worldProof.createReplayBaseline(baseOptions);
  const matching = worldProof.createReplayReceipt(baseline, baseOptions);
  const divergent = worldProof.createReplayReceipt(baseline, {
    ...baseOptions,
    executionReceipt: { ...baseOptions.executionReceipt, contentHash: 'b'.repeat(64) },
  });
  assert.equal(matching.status, 'pass');
  assert.equal(matching.outcomesMatch, true);
  assert.equal(divergent.status, 'fail');
  assert.equal(divergent.outcomesMatch, false);
});

test('intent settlement fails a dropped critical requirement and retains unresolved as not-proven', () => {
  const spec = lab.createSpecFromPrompt('an octopus holding a teapot', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });
  const requirements = spec.phaseArtifacts.phase2.artifact.intentRequirements;
  const phase4 = structuredClone(spec.phaseArtifacts.phase4.artifact);
  const teapot = phase4.groundedIntent.acceptedGraph.nodes.find((row) => row.spanId === 'span3');
  phase4.groundedIntent.acceptedGraph.nodes = phase4.groundedIntent.acceptedGraph.nodes
    .filter((row) => row !== teapot && row.id !== teapot.id);
  phase4.groundedIntent.acceptedGraph.edges = [];
  phase4.groundedIntent.acceptedGraph.unsupported = [];
  phase4.groundedIntent.rejectedGraph = {
    schema: 'simulatte.rejectedGroundedGraph.v1',
    rejected: [],
    unresolved: [],
  };
  const lost = worldProof.createIntentSettlementLedger(requirements, phase4);
  assert.equal(lost.status, 'fail');
  assert.ok(lost.lostCount >= 2);
  assert.ok(lost.settlements.some((row) => row.label === 'teapot' && row.status === 'lost'));

  phase4.groundedIntent.acceptedGraph.edges = structuredClone(
    spec.phaseArtifacts.phase4.artifact.groundedIntent.acceptedGraph.edges
  );
  phase4.groundedIntent.rejectedGraph.unresolved.push({
    spanId: 'span3',
    text: 'teapot',
    reason: 'grounding remains ambiguous',
  });
  const unresolved = worldProof.createIntentSettlementLedger(requirements, phase4);
  assert.equal(unresolved.status, 'not-proven');
  assert.ok(unresolved.unresolvedCount >= 2);
  assert.equal(unresolved.lostCount, 0);
});

test('WorldProof rejects tampered or rebound intent receipts', () => {
  const source = lab.createSpecFromPrompt('a red ball', { allowPrototypeFallback: true });
  const other = lab.createSpecFromPrompt('a blue cube', { allowPrototypeFallback: true });
  const binding = worldProof.createWorldProofBinding(other, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  const receipt = lab.createIntentProofReceiptForSpec(source, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  const rebound = worldProof.createWorldProof({
    binding,
    intentReceipt: receipt,
    sceneProof: { verdict: 'pass', settledObligations: [], interactionProof: null },
    simulationReceipt: { status: 'pass' },
    nowIso: '2026-08-15T00:00:00.000Z',
  });
  assert.equal(rebound.proofClasses.intent.status, 'fail');

  const tampered = structuredClone(receipt);
  tampered.acceptedCount += 1;
  assert.throws(
    () => worldProof.validateIntentProofReceipt(tampered),
    /counts do not close|Content hash does not match/
  );

  const wrongPhaseSchema = structuredClone(receipt);
  wrongPhaseSchema.phase2Schema = 'simulatte.phase2.output.v0';
  wrongPhaseSchema.contentHash = worldProof.contentHash(wrongPhaseSchema);
  assert.throws(
    () => worldProof.validateIntentProofReceipt(wrongPhaseSchema),
    /canonical phase schemas/
  );

  const alteredBinding = worldProof.createWorldProofBinding(source, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  alteredBinding.phases.find((row) => row.phase === 2).schema =
    'simulatte.phase2.output.v0';
  const phaseRebound = worldProof.createWorldProof({
    binding: alteredBinding,
    intentReceipt: receipt,
    sceneProof: { verdict: 'pass', settledObligations: [], interactionProof: null },
    simulationReceipt: { status: 'pass' },
    nowIso: '2026-08-15T00:00:00.000Z',
  });
  assert.equal(phaseRebound.proofClasses.intent.status, 'fail');
});

test('WorldProof content hash rejects mutated verdicts', () => {
  const { phase7 } = renderedPhase7();
  const proof = lab.runPhase8SceneProof(phase7, {
    nowIso: '2026-08-15T00:00:00.000Z',
  }).artifact.worldProof;
  const tampered = JSON.parse(JSON.stringify(proof));
  tampered.proofClasses.visual.status = 'fail';
  assert.throws(
    () => worldProof.validateWorldProof(tampered),
    /contentHash does not match canonical content/
  );
});

test('live solver execution settles simulation proof without borrowing render evidence', () => {
  const spec = lab.createSpecFromPrompt('a red ball', { allowPrototypeFallback: true });
  let state = lab.createSimulationState(spec);
  state = lab.stepSimulation(state, spec, 1 / 60);
  assert.equal(state.solverState.executionReceipt.status, 'pass');
  assert.ok(state.solverState.executionReceipt.operatorInvocationCount > 0);
  assert.deepEqual(state.solverState.executionReceipt.missingOperatorIds, []);
  assert.equal(state.solverState.executionReceipt.finiteChannels, true);

  const canvas = { width: 640, height: 360 };
  const input = lab.createRenderExecutionInput(spec, state, canvas, { buildId: 'test-build' });
  const renderData = rendererScope.compileSceneRenderData(input.sceneRenderPacket);
  renderData.requireLivePixelSamples = true;
  const phase7 = lab.runPhase7RenderExecution(input, null, canvas, {
    ...renderData,
    rendered: true,
    renderCount: 1,
    pixelSamples: {
      schema: 'simulatte.phase7PixelSampleSet.v1',
      source: 'world-proof-live-solver-test',
      packetKey: renderData.packetKey,
      samples: rendererScope.phase7PixelReadbackPlan(
        renderData,
        input.sceneRenderPacket,
        input,
        canvas
      ).samples.map((sample) => ({ ...sample, rgba: [220, 40, 50, 255] })),
    },
  });
  const proof = lab.runPhase8SceneProof(phase7).artifact.worldProof;
  assert.equal(proof.proofClasses.simulation.status, 'pass');
  assert.ok(!proof.criticalFailures.some((row) => row.class === 'simulation'));
});

test('replay proof compares identified semantic, behavioral, and visual outcomes', () => {
  const { phase7 } = renderedPhase7();
  const binding = phase7.artifact.renderExecution.worldProofBinding;
  const scene = lab.runPhase8SceneProof(phase7, {
    nowIso: '2026-08-15T00:00:00.000Z',
  }).artifact.sceneProof;
  const simulationReceipt = {
    schema: 'simulatte.solverExecutionReceipt.v1',
    status: 'pass',
    executedOperatorIds: ['operator:a'],
    missingOperatorIds: [],
    finiteChannels: true,
  };
  const interactionReceipt = {
    schema: 'simulatte.phase7InteractionReceipt.v1',
    status: 'executed',
    appliedCommandCount: 1,
    changedChannels: ['position:ball'],
    visualStateConsumed: true,
  };
  const options = {
    binding,
    sceneProof: scene,
    simulationReceipt,
    interactionReceipt,
    deviceClass: 'webgpu:test-device',
  };
  const baseline = worldProof.createReplayBaseline(options);
  const passing = worldProof.createReplayReceipt(baseline, options);
  assert.equal(passing.status, 'pass');
  assert.equal(passing.identityMatches, true);
  assert.equal(passing.outcomesMatch, true);
  assert.equal(passing.identityComplete, true);
  assert.deepEqual(passing.requiredClasses, ['replay-identified']);
  assert.equal(passing.classStatuses['replay-identified'], 'pass');

  const divergent = worldProof.createReplayReceipt(baseline, {
    ...options,
    simulationReceipt: { ...simulationReceipt, missingOperatorIds: ['operator:a'] },
  });
  assert.equal(divergent.status, 'fail');
  assert.equal(divergent.identityMatches, true);
  assert.equal(divergent.outcomesMatch, false);
});

test('compiler determinism binds an independent compile to the pre-edit baseline', () => {
  const original = lab.createSpecFromPrompt('a red ball', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });
  const candidate = JSON.parse(JSON.stringify(original));
  candidate.params.energyInput = 1.4;
  const edited = lab.applyWorldSpecEdit(original, candidate, {
    rationale: 'Retain a user override while proving the compiler baseline',
  });
  const binding = worldProof.createWorldProofBinding(edited, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  const compilerReceipt = worldProof.createCompilerDeterminismReceipt({
    binding,
    recompiledSpec: original,
    independentExecution: true,
  });
  const simulationReproducibilityReceipt =
    lab.createSimulationReproducibilityReceiptForSpec(edited, {
      buildId: 'test-build',
      runtimeId: 'test-runtime',
    });
  const options = {
    binding,
    sceneProof: { verdict: 'pass', settledObligations: [] },
    simulationReceipt: { status: 'pass', executedOperatorIds: [], missingOperatorIds: [], finiteChannels: true },
    interactionReceipt: { status: 'executed', appliedCommandCount: 0, changedChannels: [], visualStateConsumed: true },
    compilerDeterminismReceipt: compilerReceipt,
    simulationReproducibilityReceipt,
    deviceClass: 'webgpu:test-device',
  };
  const replayReceipt = worldProof.createReplayReceipt(
    worldProof.createReplayBaseline(options),
    options
  );

  assert.equal(compilerReceipt.status, 'pass');
  assert.equal(compilerReceipt.authoredWorldSpecContentHash, edited.contentHash);
  assert.equal(compilerReceipt.baselineContentHash, original.contentHash);
  assert.equal(compilerReceipt.recompiledContentHash, original.contentHash);
  assert.equal(compilerReceipt.inputMatches, true);
  assert.equal(compilerReceipt.outputMatches, true);
  assert.equal(replayReceipt.classStatuses['compiler-deterministic'], 'pass');
  assert.equal(replayReceipt.classStatuses['simulation-reproducible'], 'pass');
  assert.equal(replayReceipt.classStatuses['replay-identified'], 'pass');
  assert.equal(replayReceipt.status, 'pass');
});

test('simulation reproducibility compares independent fixed-step state within declared tolerance', () => {
  const spec = lab.createSpecFromPrompt('a red ball', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });
  const binding = worldProof.createWorldProofBinding(spec, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  const receipt = lab.createSimulationReproducibilityReceiptForSpec(spec, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  const options = {
    binding,
    simulationReproducibilityReceipt: receipt,
    deviceClass: 'webgpu:test-device',
  };
  const replay = worldProof.createReplayReceipt(worldProof.createReplayBaseline(options), options);

  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.independentExecution, true);
  assert.equal(receipt.stepCount, 8);
  assert.equal(receipt.stepSeconds, 1 / 60);
  assert.equal(receipt.tolerance, 1e-9);
  assert.equal(receipt.baselineStateHash, receipt.replayStateHash);
  assert.equal(receipt.maxAbsoluteDelta, 0);
  assert.equal(replay.classStatuses['simulation-reproducible'], 'pass');

  const baselineState = fixedStepState(spec);
  const divergentState = structuredClone(baselineState);
  divergentState.solverState.channels[Object.keys(divergentState.solverState.channels)[0]] = 999;
  const failed = worldProof.createSimulationReproducibilityReceipt({
    binding,
    baselineState,
    replayState: divergentState,
    independentExecution: true,
  });
  const failedReplay = worldProof.createReplayReceipt(
    worldProof.createReplayBaseline({ ...options, simulationReproducibilityReceipt: failed }),
    { ...options, simulationReproducibilityReceipt: failed }
  );

  assert.equal(failed.status, 'fail');
  assert.equal(failed.failureCode, 'simulation-state-mismatch');
  assert.ok(failed.mismatchPaths.length > 0);
  assert.equal(failedReplay.classStatuses['simulation-reproducible'], 'fail');
  assert.ok(failedReplay.failedRequiredClasses.includes('simulation-reproducible'));

  const missing = worldProof.createSimulationReproducibilityReceipt({
    binding,
    baselineState: null,
    replayState: null,
    independentExecution: true,
  });
  assert.equal(missing.status, 'fail');
  assert.equal(missing.failureCode, 'simulation-state-missing');
});

test('declared safety gates evaluate every fixed-step checkpoint twice', () => {
  const original = lab.createSpecFromPrompt('a red ball', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });
  const spec = withElapsedTimeSafety(original, 1);
  const receipt = lab.createSafetyProofReceiptForSpec(spec, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });

  assert.equal(receipt.schema, worldProof.SAFETY_PROOF_RECEIPT_SCHEMA);
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.independentExecution, true);
  assert.equal(receipt.baselineDecision, 'allow');
  assert.equal(receipt.replayDecision, 'allow');
  assert.equal(receipt.decisionsMatch, true);
  assert.equal(receipt.stepCount, 8);
  assert.equal(receipt.checkpointCount, 9);
  assert.equal(receipt.ruleCount, 1);
  assert.equal(receipt.ruleResults[0].evaluationCount, 9);
  assert.equal(receipt.ruleResults[0].violationCount, 0);
  assert.equal(receipt.baselineTraceHash, receipt.replayTraceHash);
  assert.match(receipt.rulesHash, /^fnv1a32:/);
  assert.equal(worldProof.validateSafetyProofReceipt(receipt), receipt);

  const tampered = structuredClone(receipt);
  tampered.ruleResults[0].violationCount = 1;
  assert.throws(
    () => worldProof.validateSafetyProofReceipt(tampered),
    /status does not match|trace hash does not match/
  );
});

test('a blocking safety violation fails independently of simulation and visual proof', () => {
  const original = lab.createSpecFromPrompt('a red ball', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });
  const spec = withElapsedTimeSafety(original, 0.01);
  const receipt = lab.createSafetyProofReceiptForSpec(spec, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  const binding = worldProof.createWorldProofBinding(spec, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  const proof = worldProof.createWorldProof({
    binding,
    sceneProof: { verdict: 'pass', settledObligations: [], interactionProof: null },
    intentReceipt: lab.createIntentProofReceiptForSpec(spec, {
      buildId: 'test-build',
      runtimeId: 'test-runtime',
    }),
    semanticReceipt: lab.createSemanticProofReceiptForSpec(spec, {
      buildId: 'test-build',
      runtimeId: 'test-runtime',
    }),
    simulationReceipt: { status: 'pass' },
    safetyReceipt: receipt,
    nowIso: '2026-08-15T00:00:00.000Z',
  });

  assert.equal(receipt.status, 'fail');
  assert.equal(receipt.failureCode, 'safety-rule-violation');
  assert.equal(receipt.baselineDecision, 'block');
  assert.deepEqual(receipt.violationRuleIds, ['safety:elapsed-time-bound']);
  assert.ok(receipt.ruleResults[0].violationCount > 0);
  assert.equal(proof.proofClasses.safety.status, 'fail');
  assert.ok(proof.criticalFailures.some((row) => row.class === 'safety'));
});

test('a warning safety violation remains visible without blocking execution', () => {
  const original = lab.createSpecFromPrompt('a red ball', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });
  const spec = withElapsedTimeSafety(original, 0.01, 'warn');
  const receipt = lab.createSafetyProofReceiptForSpec(spec, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });

  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.baselineDecision, 'allow');
  assert.deepEqual(receipt.warningRuleIds, ['safety:elapsed-time-bound']);
  assert.deepEqual(receipt.violationRuleIds, []);
  assert.equal(receipt.ruleResults[0].status, 'warn');
  assert.ok(receipt.ruleResults[0].violationCount > 0);
});

test('WorldProof rejects untyped or rebound safety receipts', () => {
  const original = lab.createSpecFromPrompt('a red ball', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });
  const spec = withElapsedTimeSafety(original, 1);
  const binding = worldProof.createWorldProofBinding(spec, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  const receipt = lab.createSafetyProofReceiptForSpec(spec, {
    buildId: 'other-build',
    runtimeId: 'test-runtime',
  });
  const rebound = worldProof.createWorldProof({
    binding,
    sceneProof: { verdict: 'pass', settledObligations: [], interactionProof: null },
    simulationReceipt: { status: 'pass' },
    safetyReceipt: receipt,
    nowIso: '2026-08-15T00:00:00.000Z',
  });
  assert.equal(rebound.proofClasses.safety.status, 'fail');

  assert.throws(
    () => worldProof.createWorldProof({
      binding,
      sceneProof: { verdict: 'pass', settledObligations: [], interactionProof: null },
      simulationReceipt: { status: 'pass' },
      safetyReceipt: { status: 'pass' },
      nowIso: '2026-08-15T00:00:00.000Z',
    }),
    /Unknown field status|Missing field schema/
  );
});

test('compiler determinism fails on different inputs, output, lane, or build binding', () => {
  const expected = lab.createSpecFromPrompt('a red ball', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });
  const divergent = lab.createSpecFromPrompt('a blue cube', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });
  const binding = worldProof.createWorldProofBinding(expected, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  const receipt = worldProof.createCompilerDeterminismReceipt({
    binding,
    recompiledSpec: divergent,
    independentExecution: true,
  });
  const options = {
    binding,
    compilerDeterminismReceipt: receipt,
    deviceClass: 'webgpu:test-device',
  };
  const replay = worldProof.createReplayReceipt(worldProof.createReplayBaseline(options), options);

  assert.equal(receipt.status, 'fail');
  assert.equal(receipt.failureCode, 'compiler-input-mismatch');
  assert.equal(replay.classStatuses['compiler-deterministic'], 'fail');
  assert.deepEqual(replay.failedRequiredClasses, ['compiler-deterministic']);
  assert.equal(replay.status, 'fail');

  const otherBuild = JSON.parse(JSON.stringify(binding));
  otherBuild.replayIdentity.buildId = 'other-build';
  const rebound = worldProof.createReplayReceipt(
    worldProof.createReplayBaseline({ ...options, binding: otherBuild }),
    { ...options, binding: otherBuild }
  );
  assert.equal(rebound.classStatuses['compiler-deterministic'], 'fail');
});

test('declared determinism classes without a proving receipt remain not-proven', () => {
  const { phase7 } = renderedPhase7();
  const binding = phase7.artifact.renderExecution.worldProofBinding;
  binding.replayIdentity.requiredClasses = ['compiler-deterministic', 'replay-identified'];
  const sceneProof = lab.runPhase8SceneProof(phase7, {
    nowIso: '2026-08-15T00:00:00.000Z',
  }).artifact.sceneProof;
  const options = {
    binding,
    sceneProof,
    simulationReceipt: { schema: 'simulatte.solverExecutionReceipt.v1', status: 'pass' },
    deviceClass: 'webgpu:test-device',
  };
  const receipt = worldProof.createReplayReceipt(worldProof.createReplayBaseline(options), options);
  const proof = worldProof.createWorldProof({
    ...options,
    replayReceipt: receipt,
    nowIso: '2026-08-15T00:00:00.000Z',
  });

  assert.equal(receipt.status, 'not-proven');
  assert.equal(receipt.classStatuses['compiler-deterministic'], 'not-proven');
  assert.deepEqual(receipt.unsupportedRequiredClasses, ['compiler-deterministic']);
  assert.equal(proof.proofClasses.replay.status, 'not-proven');
  assert.equal(proof.verdict, 'not-proven');
});

test('published WorldProof schema names the canonical contract', () => {
  const schema = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../public/shared/contracts/world-proof.schema.json'),
    'utf8'
  ));
  assert.equal(schema.properties.schema.const, worldProof.WORLD_PROOF_SCHEMA);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.proofClasses.required.sort(),
    [...worldProof.PROOF_CLASS_NAMES].sort());
  assert.equal(
    schema.$defs.intentProofReceipt.properties.schema.const,
    worldProof.INTENT_PROOF_RECEIPT_SCHEMA
  );
  assert.equal(
    schema.$defs.semanticProofReceipt.properties.schema.const,
    worldProof.SEMANTIC_PROOF_RECEIPT_SCHEMA
  );
  assert.equal(
    schema.$defs.compilerDeterminismReceipt.properties.schema.const,
    worldProof.COMPILER_DETERMINISM_RECEIPT_SCHEMA
  );
  assert.equal(
    schema.$defs.simulationReproducibilityReceipt.properties.schema.const,
    worldProof.SIMULATION_REPRODUCIBILITY_RECEIPT_SCHEMA
  );
  assert.equal(
    schema.$defs.interactionProofReceipt.properties.schema.const,
    worldProof.INTERACTION_PROOF_RECEIPT_SCHEMA
  );
  assert.equal(
    schema.$defs.safetyProofReceipt.properties.schema.const,
    worldProof.SAFETY_PROOF_RECEIPT_SCHEMA
  );
});
