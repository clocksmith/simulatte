const assert = require('node:assert');
const test = require('node:test');

const lab = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
const sceneProof = require('../public/blank/pipeline/phase-08-scene-proof/simulatte-scene-proof.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');

const rendererScope = globalThis.SimulattePhaseModuleRegistry.family('webGpuRenderer');

function renderedPhase7(prompt) {
  const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
  const canvas = { width: 640, height: 360 };
  const renderExecutionInput = lab.createRenderExecutionInput(spec, { t: 0 }, canvas);
  const renderData = rendererScope.compileSceneRenderData(renderExecutionInput.sceneRenderPacket);
  renderData.requireLivePixelSamples = true;
  const readbackPlan = rendererScope.phase7PixelReadbackPlan(
    renderData,
    renderExecutionInput.sceneRenderPacket,
    renderExecutionInput,
    canvas
  );
  assert.ok(readbackPlan, 'Phase 7 fixture creates a pixel-readback plan');
  assert.deepEqual(readbackPlan.unmatchedObligationIds, []);
  renderData.rendererConsumption.objectSubmissionConsumed = true;
  renderData.rendererConsumption.semanticCodesConsumed = true;
  renderData.rendererConsumption.objectPartCountConsumed = renderData.objectPartCount;
  const pixelSamples = {
    schema: 'simulatte.phase7PixelSampleSet.v1',
    source: 'webgpu-texture-copy-readback',
    packetKey: renderData.packetKey,
    readbackSerial: 1,
    samples: readbackPlan.samples.map((sample) => ({
      ...sample,
      rgba: [80, 160, 220, 255],
    })),
  };
  return lab.runPhase7RenderExecution(renderExecutionInput, null, canvas, {
    ...renderData,
    rendered: true,
    renderCount: 3,
    frameMs: 1.5,
    pixelSamples,
  });
}

test('scene proof settles every ledger obligation into a terminal status', () => {
  const phase7 = renderedPhase7('dogs and cats swimming in a lake');
  const phase8 = lab.runPhase8SceneProof(phase7);

  assert.equal(phase8.schema, 'simulatte.phase8.output.v2');
  assert.equal(phase8.phase, 8);
  assert.equal(phase8.inputSchema, 'simulatte.phase7.output.v2');
  assert.equal(lab.validatePhase8SceneProof(phase8), phase8);

  const proof = phase8.artifact.sceneProof;
  assert.equal(proof.schema, 'simulatte.sceneProof.v1');
  assert.equal(proof.rendered, true);
  assert.ok(proof.settledObligations.length >= 1);
  for (const row of proof.settledObligations) {
    assert.ok(sceneProof.SETTLED_STATUSES.includes(row.status), `${row.obligationId} has terminal status`);
    assert.ok(row.reason.length > 0);
  }
  assert.equal(
    proof.summary.obligationCount,
    proof.summary.preservedCount + proof.summary.lostCount +
      proof.summary.unsupportedCount + proof.summary.notProvenCount
  );

  const entityRows = proof.settledObligations.filter((row) => row.kind === 'entity');
  assert.ok(entityRows.some((row) => row.target === 'dog' && row.status === 'preserved'));
  assert.ok(entityRows.some((row) => row.target === 'cat' && row.status === 'preserved'));
  assert.notEqual(proof.verdict, 'not-proven');

  const ledger = phase8.artifact.compositionLedger;
  assert.equal(ledger.currentPhase, 8);
  assert.ok(ledger.phaseDeltas.some((row) => row.phase === 8 && row.receiptId === 'phase8-scene-proof'));
  assert.equal(phase8.receipts[0].id, 'phase8-scene-proof');
  assert.equal(phase8.receipts[0].verdict, proof.verdict);
});

test('scene proof fails closed when a required entity never rendered', () => {
  const phase7 = renderedPhase7('dogs and cats swimming in a lake');
  const strippedPacketSummary = (phase7.artifact.renderExecution.packetIdentitySummary || [])
    .filter((identity) => !/dog/i.test(identity));
  const tampered = {
    ...phase7,
    artifact: {
      ...phase7.artifact,
      renderExecution: {
        ...phase7.artifact.renderExecution,
        packetIdentitySummary: strippedPacketSummary,
        visualObligationProof: [],
      },
    },
  };
  const phase8 = lab.runPhase8SceneProof(tampered);
  const proof = phase8.artifact.sceneProof;
  const dogRow = proof.settledObligations.find((row) => row.kind === 'entity' && row.target === 'dog');
  assert.ok(dogRow, 'dog entity obligation settled');
  assert.equal(dogRow.status, 'lost');
  assert.equal(proof.verdict, 'fail');
  assert.ok(proof.summary.requiredLostIds.includes(dogRow.obligationId));
  assert.ok(phase8.artifact.compositionLedger.losses.some((row) => row.entryId === dogRow.obligationId));
});

test('scene proof never certifies a required unsupported obligation', () => {
  const phase7 = renderedPhase7('dogs and cats swimming in a lake');
  const unsupportedId = 'visual:unsupported-required-concept';
  const tampered = {
    ...phase7,
    artifact: {
      ...phase7.artifact,
      compositionLedger: {
        ...phase7.artifact.compositionLedger,
        obligations: [
          ...phase7.artifact.compositionLedger.obligations,
          {
            id: unsupportedId,
            kind: 'visual',
            target: 'unavailable concept',
            required: true,
            status: 'unsupported',
          },
        ],
      },
    },
  };

  const proof = lab.runPhase8SceneProof(tampered).artifact.sceneProof;
  const unsupported = proof.settledObligations.find((row) => row.obligationId === unsupportedId);

  assert.equal(unsupported.status, 'unsupported');
  assert.equal(proof.verdict, 'fail');
  assert.ok(proof.summary.requiredUnsupportedIds.includes(unsupportedId));
});

test('scene proof fails a required identity when its live pixel obligation fails', () => {
  const phase7 = renderedPhase7('dogs and cats swimming in a lake');
  const visual = phase7.artifact.renderExecution.visualObligationProof || [];
  const tampered = {
    ...phase7,
    artifact: {
      ...phase7.artifact,
      renderExecution: {
        ...phase7.artifact.renderExecution,
        visualObligationProof: [
          ...visual.filter((row) => row.obligationId !== 'entity:dog'),
          { obligationId: 'entity:dog', status: 'fail', required: true },
        ],
      },
    },
  };
  const proof = lab.runPhase8SceneProof(tampered).artifact.sceneProof;
  const dog = proof.settledObligations.find((row) => row.obligationId === 'entity:dog');

  assert.equal(dog.status, 'lost');
  assert.equal(dog.reason, 'required identity failed live pixel proof');
  assert.equal(proof.verdict, 'fail');
});

test('scene proof rejects literal pixels compiled from a topology that does not fit the target identity', () => {
  const spec = lab.createSpecFromPrompt('a red ball', { allowPrototypeFallback: true });
  const canvas = { width: 640, height: 360 };
  const input = lab.createRenderExecutionInput(spec, { t: 0 }, canvas);
  const ball = input.sceneRenderPacket.entities.find((row) => row.identity?.type === 'ball');
  assert.ok(ball, 'fixture compiles a ball entity');

  const program = ball.geometry.program;
  program.grammarId = 'object-grammar.constructive.resonant-instrument.balanced';
  program.constructionReceipt = {
    ...program.constructionReceipt,
    topologyId: 'resonant-instrument',
    topologySelectionMethod: 'evidence-score',
    topologyTargetFit: false,
  };
  program.constructionGraph = {
    ...program.constructionGraph,
    topologyId: 'resonant-instrument',
  };

  const renderData = rendererScope.compileSceneRenderData(input.sceneRenderPacket);
  renderData.requireLivePixelSamples = true;
  const readbackPlan = rendererScope.phase7PixelReadbackPlan(
    renderData,
    input.sceneRenderPacket,
    input,
    canvas
  );
  assert.ok(readbackPlan, 'tampered topology still reaches physical pixel sampling');
  const phase7 = lab.runPhase7RenderExecution(input, null, canvas, {
    ...renderData,
    rendered: true,
    renderCount: 1,
    pixelSamples: {
      schema: 'simulatte.phase7PixelSampleSet.v1',
      source: 'scene-proof-unrelated-topology-readback',
      packetKey: renderData.packetKey,
      samples: readbackPlan.samples.map((sample) => ({
        ...sample,
        rgba: [239, 51, 64, 255],
      })),
    },
  });
  const realization = phase7.artifact.renderExecution.objectRealization.rows
    .find((row) => row.identityType === 'ball');
  const proof = lab.runPhase8SceneProof(phase7).artifact.sceneProof;
  const topologyProof = proof.settledObligations.find((row) => (
    row.obligationId === 'visual:construction:surface-ball-1:topology'
  ));

  assert.equal(realization.topologyVerified, false);
  assert.equal(realization.semanticFit, false);
  assert.equal(realization.realized, false);
  assert.equal(topologyProof.status, 'lost');
  assert.equal(proof.verdict, 'fail');
});

test('scene proof preserves negated identities only with bound semantic absence proof', () => {
  const phase7 = renderedPhase7('a dog but no cat');
  const absence = phase7.artifact.compositionLedger.obligations.find((row) => row.constraintKind === 'absence');
  assert.ok(absence, 'Phase 2 carries an absence obligation to Phase 7');
  const absenceId = absence.obligationId || absence.id;
  const settled = lab.runPhase8SceneProof(phase7).artifact.sceneProof;
  const cat = settled.settledObligations.find((row) => row.obligationId === absenceId);
  assert.equal(cat.status, 'preserved');
  assert.ok(cat.evidence.includes('visualObligationProof'));
  assert.equal(settled.verdict, 'pass');

  const tampered = {
    ...phase7,
    artifact: {
      ...phase7.artifact,
      renderExecution: {
        ...phase7.artifact.renderExecution,
        visualObligationProof: [
          ...(phase7.artifact.renderExecution.visualObligationProof || [])
            .filter((row) => row.obligationId !== absenceId),
          { obligationId: absenceId, status: 'fail', required: true },
        ],
      },
    },
  };
  const failed = lab.runPhase8SceneProof(tampered).artifact.sceneProof;
  assert.equal(failed.settledObligations.find((row) => row.obligationId === absenceId).status, 'lost');
  assert.equal(failed.verdict, 'fail');
});

test('scene proof never certifies a spatial relation from endpoints and Phase 6 layout alone', () => {
  const phase7 = renderedPhase7('a parcel on a conveyor belt');
  const relation = phase7.artifact.compositionLedger.obligations.find((row) => (
    row.kind === 'relation' && /^relation:spatial:/.test(row.obligationId || row.id || '')
  ));
  assert.ok(relation, 'spatial relation obligation exists');
  const relationId = relation.obligationId || relation.id;
  const withoutRelationProof = {
    ...phase7,
    artifact: {
      ...phase7.artifact,
      renderExecution: {
        ...phase7.artifact.renderExecution,
        visualObligationProof: (phase7.artifact.renderExecution.visualObligationProof || [])
          .filter((row) => row.obligationId !== relationId),
      },
    },
  };

  const proof = lab.runPhase8SceneProof(withoutRelationProof).artifact.sceneProof;
  const relationProof = proof.settledObligations.find((row) => row.obligationId === relationId);
  assert.equal(relationProof.status, 'not-proven');
  assert.equal(relationProof.reason, 'relation endpoint identities lack Phase 7 visual proof');
  assert.equal(proof.verdict, 'fail');
});

test('scene proof may settle a relation source only through its linked spatial Phase 7 proof', () => {
  const phase7 = renderedPhase7('a parcel on a conveyor belt');
  const sourceRelation = phase7.artifact.compositionLedger.obligations.find((row) => (
    row.kind === 'relation' && /:spatial-constraint:/.test(row.obligationId || row.id || '')
  ));
  const spatialRelation = phase7.artifact.compositionLedger.obligations.find((row) => (
    row.kind === 'relation' && /^relation:spatial:/.test(row.obligationId || row.id || '')
  ));
  assert.ok(sourceRelation && spatialRelation, 'linked relation obligations exist');
  const spatialId = spatialRelation.obligationId || spatialRelation.id;
  const sourceId = sourceRelation.obligationId || sourceRelation.id;
  const linkedProof = {
    ...phase7,
    artifact: {
      ...phase7.artifact,
      renderExecution: {
        ...phase7.artifact.renderExecution,
        visualObligationProof: [
          ...(phase7.artifact.renderExecution.visualObligationProof || [])
            .filter((row) => row.obligationId !== spatialId),
          { obligationId: spatialId, status: 'pass', required: true },
        ],
      },
    },
  };

  const proof = lab.runPhase8SceneProof(linkedProof).artifact.sceneProof;
  const sourceProof = proof.settledObligations.find((row) => row.obligationId === sourceId);
  assert.equal(sourceProof.status, 'preserved');
  assert.ok(sourceProof.evidence.includes('visualObligationProof'));
});

test('scene proof settles a material relation through its linked Phase 7 material proof', () => {
  const phase7 = renderedPhase7('a glass greenhouse');
  const relation = phase7.artifact.compositionLedger.obligations.find((row) => (
    row.kind === 'relation' && (row.visualEvidence || []).some((value) => /^material-binding:/.test(value))
  ));
  assert.ok(relation, 'material relation obligation exists');
  const evidence = relation.visualEvidence.find((value) => /^material-binding:/.test(value));
  const [, entityId, material] = evidence.match(/^material-binding:([^:]+):(.+)$/);
  const propertyId = `visual:prompt-property-${entityId}-material-${material}`;
  const proof = lab.runPhase8SceneProof({
    ...phase7,
    artifact: {
      ...phase7.artifact,
      renderExecution: {
        ...phase7.artifact.renderExecution,
        visualObligationProof: [
          ...(phase7.artifact.renderExecution.visualObligationProof || [])
            .filter((row) => row.obligationId !== propertyId),
          { obligationId: propertyId, status: 'pass', required: true },
        ],
      },
    },
  }).artifact.sceneProof;
  const settled = proof.settledObligations.find((row) => row.obligationId === (relation.obligationId || relation.id));

  assert.equal(settled.status, 'preserved');
  assert.ok(settled.evidence.includes(evidence));
});

test('scene proof identity settlement requires whole-word identity evidence', () => {
  const phase7 = renderedPhase7('dogs and cats swimming in a lake');
  const summary = phase7.artifact.renderExecution.packetIdentitySummary || [];
  const tamperedWith = (packetIdentitySummary) => ({
    ...phase7,
    artifact: {
      ...phase7.artifact,
      renderExecution: {
        ...phase7.artifact.renderExecution,
        packetIdentitySummary,
        visualObligationProof: [],
      },
    },
  });

  const substringSummary = summary.map((identity) => String(identity).replace(/\bdogs?\b/gi, 'dogfish'));
  const substringProof = lab.runPhase8SceneProof(tamperedWith(substringSummary)).artifact.sceneProof;
  const substringDog = substringProof.settledObligations.find((row) => row.kind === 'entity' && row.target === 'dog');
  assert.ok(substringDog, 'dog entity obligation settled against dogfish identities');
  assert.equal(substringDog.status, 'lost');

  const pluralSummary = summary.map((identity) => String(identity).replace(/\bdog\b/gi, 'dogs'));
  const pluralProof = lab.runPhase8SceneProof(tamperedWith(pluralSummary)).artifact.sceneProof;
  const pluralDog = pluralProof.settledObligations.find((row) => row.kind === 'entity' && row.target === 'dog');
  assert.ok(pluralDog, 'dog entity obligation settled against plural identities');
  assert.equal(pluralDog.status, 'preserved');
});

test('scene proof reports not-proven without a rendered frame and rejects wrong inputs', () => {
  const spec = lab.createSpecFromPrompt('dogs and cats swimming in a lake', { allowPrototypeFallback: true });
  const renderExecutionInput = lab.createRenderExecutionInput(spec, { t: 0 }, { width: 8, height: 8 });
  const unrendered = lab.runPhase7RenderExecution(renderExecutionInput, null, null, {
    rendered: false,
    renderCount: 0,
  });
  const phase8 = lab.runPhase8SceneProof(unrendered);
  assert.equal(phase8.artifact.sceneProof.verdict, 'not-proven');
  assert.ok(phase8.artifact.sceneProof.settledObligations.every((row) => row.status === 'not-proven'));

  assert.throws(
    () => sceneProof.settleSceneProof(spec.phaseArtifacts.phase6),
    /Phase 8 input expected simulatte\.phase7\.output\.v2/
  );
	  assert.throws(
	    () => sceneProof.settleSceneProof(null),
	    /Phase 8 input expected simulatte\.phase7\.output\.v2/
	  );
});

test('scene proof normalizes browser renderer identity summary receipts', () => {
  const phase7 = renderedPhase7('dogs and cats swimming in a lake');
  const browserShaped = {
    ...phase7,
    artifact: {
      ...phase7.artifact,
      renderExecution: {
        ...phase7.artifact.renderExecution,
        packetIdentitySummary: {
          schema: 'simulatte.browserPacketIdentitySummary.v1',
          identities: phase7.artifact.renderExecution.packetIdentitySummary.map((identity) => ({
            label: identity,
          })),
        },
      },
    },
  };
  const phase8 = sceneProof.settleSceneProof(browserShaped);

  assert.equal(phase8.schema, 'simulatte.phase8.output.v2');
  assert.ok(Array.isArray(phase8.artifact.sceneProof.evidence.packetIdentitySummary));
  assert.ok(phase8.artifact.sceneProof.evidence.packetIdentitySummary.includes('dog'));
});

test('scene proof requires Phase 7 to consume a compiled environment atmosphere', () => {
  const phase7 = renderedPhase7('a dog in a forest');
  const withAtmosphereConsumption = (atmosphereConsumed) => ({
    ...phase7,
    artifact: {
      ...phase7.artifact,
      renderExecution: {
        ...phase7.artifact.renderExecution,
        environmentProgram: { kind: 'forest' },
        atmosphereProgram: {
          schema: 'simulatte.sceneAtmosphereProgram.v1',
          dominantSlot: 'biological',
          layerCount: 1,
        },
        rendererConsumption: {
          ...(phase7.artifact.renderExecution.rendererConsumption || {}),
          atmosphereConsumed,
        },
      },
    },
  });

  const missing = lab.runPhase8SceneProof(withAtmosphereConsumption(false)).artifact.sceneProof;
  const missingForest = missing.settledObligations.find((row) => row.obligationId === 'environment:forest');
  assert.equal(missingForest.status, 'lost');
  assert.match(missingForest.reason, /atmosphere was not consumed/);

  const consumed = lab.runPhase8SceneProof(withAtmosphereConsumption(true)).artifact.sceneProof;
  const consumedForest = consumed.settledObligations.find((row) => row.obligationId === 'environment:forest');
  assert.equal(consumedForest.status, 'preserved');
  assert.ok(consumedForest.evidence.includes('sceneAtmosphereProgram'));
});

test('every compiled scene carries a concrete Phase 6 pixel obligation', () => {
  const phase7 = renderedPhase7('flowers');
  const visual = phase7.artifact.renderExecution.visualObligationProof || [];
  const phase8 = lab.runPhase8SceneProof(phase7).artifact.sceneProof;

  assert.ok(visual.some((row) => row.obligationId === 'visual:compiled-scene-packet' && row.status === 'pass'));
  assert.equal(phase8.verdict, 'pass');
});

test('scene proof selects realized exact compound geometry after generic support rows', () => {
  const phase7 = renderedPhase7('warehouse robot arms sort parcels on conveyor belts');
  const realization = phase7.artifact.renderExecution.objectRealization;
  assert.ok(realization.rows.findIndex((row) => row.identityType === 'structure') <
    realization.rows.findIndex((row) => row.identityType === 'warehouse-robot-arms'));

  const proof = sceneProof.settleSceneProof(phase7).artifact.sceneProof;
  for (const target of ['warehouse-robot-arms', 'conveyor-belts']) {
    const row = proof.settledObligations.find((entry) => entry.target === target);
    assert.ok(row, `${target} obligation exists`);
    assert.equal(row.status, 'preserved');
    assert.equal(row.reason, 'identity has a rendered literal geometry program');
  }
  assert.equal(proof.verdict, 'fail');
});
