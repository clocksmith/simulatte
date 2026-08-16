const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const recordContract = require('../public/shared/contracts/world-improvement-record.js');
const sessionContract = require('../public/blank/app/prompt/world-improvement-session.js');
const reviewBridge = require('../public/blank/app/prompt/prompt-review-bridge.js');
const worldProof = require('../public/shared/contracts/world-proof.js');
const lab = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');

const rendererScope = globalThis.SimulattePhaseModuleRegistry.family('webGpuRenderer');
const NOW = '2026-08-16T12:00:00.000Z';

function phase7ForSpec(spec) {
  const canvas = { width: 640, height: 360 };
  const intentReceipt = lab.createIntentProofReceiptForSpec(spec, {
    buildId: 'improvement-test-build',
    runtimeId: 'improvement-test-runtime',
  });
  const semanticReceipt = lab.createSemanticProofReceiptForSpec(spec, {
    buildId: 'improvement-test-build',
    runtimeId: 'improvement-test-runtime',
  });
  const input = lab.createRenderExecutionInput(spec, { t: 0 }, canvas, {
    buildId: 'improvement-test-build',
    runtimeId: 'improvement-test-runtime',
    intentReceipt,
    semanticReceipt,
  });
  const renderData = rendererScope.compileSceneRenderData(input.sceneRenderPacket);
  renderData.requireLivePixelSamples = true;
  const plan = rendererScope.phase7PixelReadbackPlan(renderData, input.sceneRenderPacket, input, canvas);
  const pixelSamples = {
    schema: 'simulatte.phase7PixelSampleSet.v1',
    source: 'improvement-record-test',
    packetKey: renderData.packetKey,
    samples: plan.samples.map((sample) => ({ ...sample, rgba: [220, 40, 50, 255] })),
  };
  const phase7 = lab.runPhase7RenderExecution(input, null, canvas, {
    ...renderData,
    rendered: true,
    renderCount: 2,
    frameMs: 2,
    pixelSamples,
  });
  const binding = structuredClone(phase7.artifact.renderExecution.worldProofBinding);
  binding.declarations.interaction = false;
  phase7.artifact.renderExecution.worldProofBinding = binding;
  return phase7;
}

function sceneProof(verdict, nowIso = NOW) {
  return {
    schema: 'simulatte.sceneProof.v1',
    verdict,
    rendered: true,
    settledObligations: verdict === 'pass' ? [] : [{
      obligationId: 'visual:test-required-object',
      required: true,
      status: 'lost',
      reason: 'test-required object is not proven',
    }],
    summary: {
      obligationCount: verdict === 'pass' ? 0 : 1,
      preservedCount: 0,
      lostCount: verdict === 'pass' ? 0 : 1,
      unsupportedCount: 0,
      notProvenCount: 0,
      requiredLostIds: verdict === 'pass' ? [] : ['visual:test-required-object'],
      requiredUnsupportedIds: [],
      requiredNotProvenIds: [],
    },
    interactionProof: null,
    evidence: {},
    nowIso,
  };
}

function reportForSpec(spec, verdict, options = {}) {
  const phase7 = phase7ForSpec(spec);
  const binding = phase7.artifact.renderExecution.worldProofBinding;
  const proof = sceneProof(verdict, options.nowIso || NOW);
  const simulationReceipt = { schema: 'simulatte.simulationProofReceipt.v1', status: 'pass' };
  const semanticReceipt = phase7.artifact.renderExecution.semanticReceipt;
  const intentReceipt = phase7.artifact.renderExecution.intentReceipt;
  const replayOptions = {
    binding,
    sceneProof: proof,
    intentReceipt,
    semanticReceipt,
    simulationReceipt,
    deviceClass: 'webgpu:test-device',
  };
  const replayReceipt = options.replay === true
    ? worldProof.createReplayReceipt(worldProof.createReplayBaseline(replayOptions), replayOptions)
    : null;
  const aggregate = worldProof.createWorldProof({
    binding,
    sceneProof: proof,
    intentReceipt,
    semanticReceipt,
    simulationReceipt,
    replayReceipt,
    runtimeReceiptId: phase7.runtimeReceiptId,
    renderDataKey: phase7.artifact.renderExecution.renderDataKey,
    nowIso: options.nowIso || NOW,
  });
  return {
    final: true,
    phase7Output: phase7,
    phase8Output: {
      schema: 'simulatte.phase8.output.v1',
      artifact: {
        sceneProof: proof,
        worldProof: aggregate,
        compositionLedger: { schema: 'simulatte.compositionLedger.v1', obligations: [] },
      },
    },
  };
}

function correctionFixture() {
  const initialSpec = lab.createSpecFromPrompt('a red ball', { allowPrototypeFallback: true });
  const candidate = JSON.parse(lab.serializeSpec(initialSpec));
  candidate.name = 'A corrected red ball';
  const successfulSpec = lab.applyWorldSpecEdit(initialSpec, candidate, {
    rationale: 'Correct the authored world after the failed visual obligation',
  });
  return {
    initialSpec,
    initialReport: reportForSpec(initialSpec, 'fail'),
    successfulSpec,
    successfulReport: reportForSpec(successfulSpec, 'pass', { replay: true }),
  };
}

test('improvement record binds the full failure-edit-success chain without claiming adjudication', () => {
  const fixture = correctionFixture();
  const boundary = recordContract.captureFailureBoundary(fixture.initialSpec, fixture.initialReport, {
    nowIso: NOW,
  });
  const record = recordContract.createWorldImprovementRecord({
    failureBoundary: boundary,
    successfulSpec: fixture.successfulSpec,
    successfulReport: fixture.successfulReport,
    nowIso: NOW,
  });

  assert.equal(recordContract.validateWorldImprovementRecord(record), record);
  assert.equal(record.status, 'successful-replay');
  assert.equal(record.failureBoundary.worldSpec.contentHash, fixture.initialSpec.contentHash);
  assert.equal(record.failureBoundary.compilerTrace.phases.length, 6);
  assert.equal(record.failureBoundary.execution.worldProof.verdict, 'fail');
  assert.equal(record.intervention.patches.length, 1);
  assert.equal(record.intervention.patches[0].authority, 'userOverride');
  assert.equal(record.successfulReplay.worldSpec.contentHash, fixture.successfulSpec.contentHash);
  assert.equal(record.successfulReplay.execution.worldProof.verdict, 'pass');
  assert.equal(record.successfulReplay.execution.worldProof.proofClasses.replay.status, 'pass');
  assert.equal(record.diagnosis.earliestObservableDivergence.proofClass, 'visual');
  assert.equal(record.diagnosis.causalAttribution.status, 'not-attributed');
  assert.equal(record.adjudication.status, 'pending');
  assert.equal(record.corpusDisposition, 'diagnostic-only');
  assert.equal(record.population.partition, 'unassigned');
  assert.equal(record.generalization.status, 'not-evaluated');
  assert.match(record.contentHash, /^fnv1a32:[0-9a-f]{8}$/);
  assert.equal(JSON.parse(recordContract.serializeWorldImprovementRecord(record)).contentHash, record.contentHash);
  assert.ok(Object.isFrozen(record));
  assert.ok(Object.isFrozen(record.failureBoundary.compilerTrace.phases[0].envelope));
});

test('human adjudication creates a new hash-bound corpus disposition and cannot be overwritten', () => {
  const fixture = correctionFixture();
  const pending = recordContract.createWorldImprovementRecord({
    failureBoundary: recordContract.captureFailureBoundary(fixture.initialSpec, fixture.initialReport, { nowIso: NOW }),
    successfulSpec: fixture.successfulSpec,
    successfulReport: fixture.successfulReport,
    nowIso: NOW,
  });
  const accepted = recordContract.adjudicateWorldImprovementRecord(pending, {
    id: 'review:local:1',
    status: 'accepted',
    reviewer: 'test-reviewer',
    reviewedAt: '2026-08-16T12:05:00.000Z',
    feedback: 'The corrected result is recognizable and faithful.',
    tags: ['looks right'],
    buildId: pending.successfulReplay.execution.buildId,
    artifactHash: 'artifact:phase-8:abc',
    screenshotHash: 'sha256:canvas-test',
    worldProofContentHash: pending.successfulReplay.execution.worldProof.contentHash,
  });

  assert.equal(accepted.adjudication.status, 'accepted');
  assert.equal(accepted.corpusDisposition, 'adjudicated-positive');
  assert.equal(accepted.adjudication.review.priorRecordContentHash, pending.contentHash);
  assert.notEqual(accepted.contentHash, pending.contentHash);
  assert.throws(
    () => recordContract.adjudicateWorldImprovementRecord(accepted, accepted.adjudication.review),
    /already settled/
  );
});

test('improvement session captures a failure once and emits only after a later exact replay passes', () => {
  const fixture = correctionFixture();
  const emitted = [];
  const session = sessionContract.create({ onRecord: (record) => emitted.push(record) });

  assert.equal(session.observeProof(fixture.initialSpec, fixture.initialReport), null);
  assert.equal(session.getFailureBoundary().worldSpec.contentHash, fixture.initialSpec.contentHash);
  assert.equal(session.observeProof(fixture.initialSpec, fixture.initialReport), null);
  assert.equal(session.getRecords().length, 0);
  const record = session.observeProof(fixture.successfulSpec, fixture.successfulReport);
  assert.equal(record.successfulReplay.worldSpec.contentHash, fixture.successfulSpec.contentHash);
  assert.equal(session.getCurrentRecord(), record);
  assert.equal(session.getRecords().length, 1);
  assert.deepEqual(emitted, [record]);
});

test('final-phase training review binds human adjudication to the successful correction record', async () => {
  const fixture = correctionFixture();
  const pending = recordContract.createWorldImprovementRecord({
    failureBoundary: recordContract.captureFailureBoundary(fixture.initialSpec, fixture.initialReport, { nowIso: NOW }),
    successfulSpec: fixture.successfulSpec,
    successfulReport: fixture.successfulReport,
    nowIso: NOW,
  });
  const previousDocument = globalThis.document;
  const previousLab = globalThis.SimulattePhysicsLab;
  const canvas = {
    dataset: {
      renderCount: '4',
      fps: '60',
      rendererStatus: 'WebGPU renderer ready',
    },
    toDataURL: () => 'data:image/png;base64,dGVzdC1jYW52YXM=',
  };
  globalThis.document = {
    getElementById(id) {
      if (id === 'physics-canvas') return canvas;
      if (id === 'build-prompt') return { value: pending.brief.prompt };
      return null;
    },
    querySelector(selector) {
      return selector === 'meta[name="simulatte-build"]'
        ? { content: pending.successfulReplay.execution.buildId }
        : null;
    },
  };
  globalThis.SimulattePhysicsLab = {
    _browserLab: {
      getSpec: () => fixture.successfulSpec,
      getTrainingSnapshot: () => ({
        schema: 'simulatte.trainingSnapshot.v1',
        runId: 'training-run:improvement:1',
        prompt: pending.brief.prompt,
        phase: { step: 8, label: 'Proof' },
        artifacts: {
          '1->8': {
            schema: 'simulatte.trainingPhaseArtifact.v1',
            phaseFrom: 1,
            phaseTo: 8,
            phaseId: 'final',
            phaseLabel: 'Final',
            input: { prompt: pending.brief.prompt },
            output: { worldProofContentHash: pending.successfulReplay.execution.worldProof.contentHash },
            summary: 'Final replay passed',
          },
        },
        improvementRecord: pending,
      }),
    },
  };
  try {
    const review = await reviewBridge.collectRecord('pass', ['looks right']);
    assert.equal(review.schema, 'simulatte.trainingReview.v1');
    assert.equal(review.corpusDisposition, 'adjudicated-positive');
    assert.equal(review.improvementRecord.adjudication.status, 'accepted');
    assert.equal(review.improvementRecord.adjudication.review.id, review.id);
    assert.equal(
      review.improvementRecord.adjudication.review.worldProofContentHash,
      pending.successfulReplay.execution.worldProof.contentHash
    );
    assert.equal(review.improvementRecord.adjudication.review.buildId, pending.successfulReplay.execution.buildId);
    assert.ok(review.improvementRecord.adjudication.review.screenshotHash);
  } finally {
    globalThis.document = previousDocument;
    globalThis.SimulattePhysicsLab = previousLab;
  }
});

test('improvement record schema is restrictive and delegates exact WorldSpec and WorldProof validation', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(
    __dirname,
    '../public/shared/contracts/world-improvement-record.schema.json'
  ), 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, recordContract.WORLD_IMPROVEMENT_RECORD_SCHEMA);
  assert.equal(schema.$defs.worldSpecSnapshot.properties.program.$ref, 'world-spec.schema.json');
  assert.equal(schema.$defs.execution.properties.worldProof.$ref, 'world-proof.schema.json');
  assert.equal(schema.$defs.population.properties.partition.const, 'unassigned');
});
