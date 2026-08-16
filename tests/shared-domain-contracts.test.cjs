const assert = require('node:assert/strict');
const test = require('node:test');

const deterministicValues = require('../public/shared/deterministic-values.js');
const positiveLanguage = require('../public/shared/language/positive-language.js');
const streetNames = require('../public/shared/streets/street-name.js');
const tierRegistry = require('../public/simulatte/app/tier-registry.js');
const phaseContracts = require('../public/blank/pipeline/simulatte-phase-contracts.js');
const worldProofContract = require('../public/shared/contracts/world-proof.js');
const runViewModel = require('../public/blank/app/runtime/run-view-model.js');

function validPhaseEnvelope(phase, artifact, receiptFields = {}) {
  return phaseContracts.createPhaseEnvelope({
    phase,
    runtimeReceiptId: 'runtime:test',
    artifact,
    receipts: phaseContracts.PHASE_CONTRACTS[phase].receiptIds.map((id) => ({
      id,
      schema: 'simulatte.phaseReceipt.v1',
      ...(receiptFields[id] || {}),
    })),
  });
}

function createWorldProof(sceneProof, options = {}) {
  const requirementLedgerHash = 'fnv1a32:11111111';
  const settlementLedgerHash = 'fnv1a32:22222222';
  const provenanceLedgerHash = 'fnv1a32:33333333';
  const graphHash = 'fnv1a32:44444444';
  const binding = {
      schema: worldProofContract.WORLD_PROOF_BINDING_SCHEMA,
      worldSpec: {
        schema: 'simulatte.worldSpec.v1',
        id: 'world-spec:test',
        contentHash: 'fnv1a32:12345678',
        revision: 1,
        promptHash: 'fnv1a32:87654321',
        patchIds: [],
      },
      phases: [
        { phase: 2, schema: 'simulatte.phase2.output.v1' },
        { phase: 4, schema: 'simulatte.phase4.output.v2' },
        { phase: 5, schema: 'simulatte.phase5.output.v2' },
        { phase: 6, schema: 'simulatte.phase6.output.v2' },
      ],
      intent: {
        sourcePromptPresent: true,
        requirementLedgerHash,
        settlementLedgerHash,
        criticalRequirementCount: 1,
      },
      semantic: {
        provenanceLedgerHash,
        graphHash,
        bindingCount: 1,
        provenCount: 1,
        missingCount: 0,
        contractValid: true,
      },
      compilation: { validationPassed: true },
      declarations: {
        simulation: options.simulationRequired === true,
        interaction: false,
        safety: false,
      },
      replayIdentity: { requiredClasses: [] },
  };
  const settlement = {
    schema: 'simulatte.intentSettlement.v1',
    id: 'settlement:intent:entity:test',
    requirementId: 'intent:entity:test',
    kind: 'entity',
    label: 'test entity',
    critical: true,
    polarity: 'required',
    sourceSpanIds: ['span1'],
    status: 'accepted',
    evidenceIds: ['node:test'],
    reason: 'The test fixture retains its required entity',
  };
  const intentReceipt = {
    schema: worldProofContract.INTENT_PROOF_RECEIPT_SCHEMA,
    contentHash: '',
    status: 'pass',
    failureCode: '',
    reason: 'Every extracted critical requirement was accepted or explicitly refused',
    worldSpecContentHash: binding.worldSpec.contentHash,
    worldSpecRevision: binding.worldSpec.revision,
    promptHash: binding.worldSpec.promptHash,
    phase2Schema: 'simulatte.phase2.output.v1',
    phase4Schema: 'simulatte.phase4.output.v2',
    requirementLedgerHash,
    settlementLedgerHash,
    requirementCount: 1,
    criticalRequirementCount: 1,
    acceptedCount: 1,
    explicitRefusalCount: 0,
    unresolvedCount: 0,
    lostCount: 0,
    uncoveredSemanticSpanIds: [],
    settlements: [settlement],
  };
  intentReceipt.contentHash = worldProofContract.contentHash(intentReceipt);
  const semanticReceipt = {
    schema: worldProofContract.SEMANTIC_PROOF_RECEIPT_SCHEMA,
    contentHash: '',
    status: 'pass',
    failureCode: '',
    reason: 'Every accepted semantic fact retains source-bound provenance',
    worldSpecContentHash: binding.worldSpec.contentHash,
    worldSpecRevision: binding.worldSpec.revision,
    promptHash: binding.worldSpec.promptHash,
    phase2Schema: 'simulatte.phase2.output.v1',
    phase4Schema: 'simulatte.phase4.output.v2',
    requirementLedgerHash,
    provenanceLedgerHash,
    graphHash,
    bindingCount: 1,
    provenCount: 1,
    missingCount: 0,
    bindings: [{
      schema: worldProofContract.SEMANTIC_PROVENANCE_BINDING_SCHEMA,
      id: 'semantic:entity:test',
      kind: 'entity',
      targetId: 'node:test',
      targetPath: '/universeGraph/nodes/0',
      label: 'test entity',
      valueHash: 'fnv1a32:55555555',
      authority: 'prompt',
      sourceSpanIds: ['span1'],
      evidenceIds: ['node:test'],
      patchIds: [],
      status: 'proven',
      reason: 'The current semantic value retains source-bound grounding evidence',
    }],
  };
  semanticReceipt.contentHash = worldProofContract.contentHash(semanticReceipt);
  return worldProofContract.createWorldProof({
    binding,
    intentReceipt,
    semanticReceipt,
    sceneProof,
    simulationReceipt: options.simulationReceipt || null,
    nowIso: '2026-08-15T00:00:00.000Z',
  });
}

test('deterministic values preserve the two legacy FNV text encodings', () => {
  assert.equal(deterministicValues.fnv1a32('simulatte'), 2871554795);
  assert.equal(deterministicValues.fnv1a32CodePoints('simulatte'), 2871554795);
  assert.notEqual(
    deterministicValues.fnv1a32('world-🌎'),
    deterministicValues.fnv1a32CodePoints('world-🌎')
  );
  assert.equal(deterministicValues.round9(1 / 3), 0.333333333);
});

test('positive language removes negated phrases without erasing later clauses', () => {
  assert.equal(
    positiveLanguage.positiveLanguageText('A robot, without a crane, moves a parcel.', { lowercase: true }),
    'a robot, , moves a parcel.'
  );
  assert.equal(
    positiveLanguage.positiveLanguageText('No smoke but bright Steam', { lowercase: true }),
    'but bright steam'
  );
});

test('street and tier registries own canonical cross-surface mappings', () => {
  assert.equal(streetNames.normalizeStreetName('Main Avenue'), 'main av');
  assert.equal(streetNames.normalizeStreetWords('The Main Ave.', { omitArticles: true }).join(' '), 'main av');
  assert.equal(tierRegistry.tierDefinition('world').rendererMethod, 'drawWorld');
  assert.equal(tierRegistry.tierDefinition('city').canvasVisible, false);
  assert.deepEqual(tierRegistry.TIER_IDS, ['city', 'country', 'world', 'solar-system', 'star-chart']);
});

test('run view model projects one eight-phase status and receipt contract', () => {
  const view = runViewModel.project({
    runId: 'run-1',
    state: 'active',
    phase: { step: 4 },
    taskElapsedMs: 12.5,
  }, {
    inputIdentity: { sha256: 'input-hash' },
    outputIdentity: { id: 'grounding-output' },
    candidateCount: 7,
    loss: 0.125,
  });

  assert.equal(view.phases.length, 8);
  assert.deepEqual(view.phases.slice(0, 3).map((phase) => phase.status), ['passed', 'passed', 'passed']);
  assert.equal(view.phases[3].status, 'running');
  assert.equal(view.phases[3].inputIdentity, 'input-hash');
  assert.equal(view.phases[3].candidateCount, 7);
  assert.equal(Object.isFrozen(view.phases), true);
});

test('run view model retains per-phase artifacts through render and proof settlement', () => {
  const initial = runViewModel.project({
    runId: 'run-2',
    state: 'active',
    phase: { step: 3 },
  }, { phaseStep: 3, taskPercent: 100, durationMs: 8.5 });
  const compiled = runViewModel.recordSpec(initial, {
    phaseArtifacts: {
      phase1: {
        ...validPhaseEnvelope(1, {
          runtimeContext: {},
          promptIngress: {},
          compositionLedger: {},
        }),
      },
      phase3: {
        ...validPhaseEnvelope(3, {
          languageGraph: {},
          sceneLanguageGraph: {},
          queryPlan: {},
          intentRequirements: {},
          retrievalRerankResult: {},
          activationCloud: {},
          compositionLedger: {},
        }, {
          'phase3-retrieval-rerank': { activationCount: 64, missingRequiredSlots: 2 },
        }),
      },
    },
  });
  const sceneProof = {
    schema: 'simulatte.sceneProof.v1',
    verdict: 'pass',
    summary: { requiredCount: 6, lostCount: 0, notProvenCount: 0 },
    settledObligations: [],
  };
  const settled = runViewModel.recordSceneProof(compiled, {
    durationMs: 2.5,
    phase7Output: validPhaseEnvelope(7, {
      renderExecution: {
        rendered: true,
        renderCount: 1,
        frameMs: 1.25,
        pixelAudit: { status: 'pass' },
      },
      compositionLedger: {},
    }, {
      'phase7-webgpu-render': { sceneInstanceCount: 12, failedObligations: 0, unprovenObligations: 0 },
    }),
    phase8Output: validPhaseEnvelope(8, {
      sceneProof,
      worldProof: createWorldProof(sceneProof),
      compositionLedger: {},
    }),
  });

  assert.equal(settled.phases[2].outputIdentity, 'simulatte.phase3.output.v2');
  assert.equal(settled.phases[2].candidateCount, 64);
  assert.equal(settled.phases[2].loss, 2);
  assert.equal(settled.phases[6].durationMs, 1.25);
  assert.equal(settled.phases[7].status, 'passed');
  assert.equal(settled.phases[7].durationMs, 2.5);
  assert.equal(settled.receipt.phases[7].candidateCount, 4);
  assert.equal(settled.status, 'ready');
  assert.equal(settled.phases[7].inputIdentity, 'fnv1a32:12345678');
  assert.match(settled.phases[7].outputIdentity, /^fnv1a32:/);
});

test('run view model does not report completion from visual proof alone', () => {
  const sceneProof = {
    schema: 'simulatte.sceneProof.v1',
    verdict: 'pass',
    summary: { requiredCount: 1, lostCount: 0, notProvenCount: 0 },
    settledObligations: [],
  };
  const proof = createWorldProof(sceneProof, { simulationRequired: true });
  assert.equal(proof.verdict, 'not-proven');

  const settled = runViewModel.recordSceneProof(runViewModel.createViewModel('run-3'), {
    phase7Output: validPhaseEnvelope(7, {
      renderExecution: {
        rendered: true,
        renderCount: 1,
        pixelAudit: { status: 'pass' },
      },
      compositionLedger: {},
    }, {
      'phase7-webgpu-render': { failedObligations: 0, unprovenObligations: 0 },
    }),
    phase8Output: validPhaseEnvelope(8, {
      sceneProof,
      worldProof: proof,
      compositionLedger: {},
    }),
  });

  assert.equal(settled.phases[6].status, 'passed');
  assert.equal(settled.phases[7].status, 'not-proven');
  assert.equal(settled.phases[7].loss, 1);
  assert.equal(settled.status, 'not-proven');
});
