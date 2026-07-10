const assert = require('node:assert/strict');
const test = require('node:test');

const lab = require('../public/app/simulation/simulation-lab.js');

function compile(prompt) {
  return lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
}

function visualAxes(spec) {
  const genome = spec.renderProgram.rendererPlan.visualGenome;
  const packet = spec.renderProgram.visualIR.sceneRenderPacket;
  return {
    visualDialect: genome.visualDialect,
    compositionTopology: genome.compositionTopology,
    cameraArchetype: genome.cameraArchetype,
    scaleTier: genome.scaleTier,
    evidence: genome.evidence,
    packet: {
      visualDialect: packet.visualDialect,
      compositionTopology: packet.compositionTopology,
      cameraArchetype: packet.cameraArchetype,
      scaleTier: packet.scaleTier,
    },
    positions: packet.entities.map((row) => row.transform.position.slice(0, 2)),
  };
}

test('Phase 6 dialects separate evidence-distinct worlds inside one scene kind', () => {
  const conveyor = visualAxes(compile('warehouse robot arms sort parcels on conveyor belts'));
  const gripper = visualAxes(compile('robot gripper twists a protein sample holder without molecular folding'));

  assert.deepEqual(
    [conveyor.visualDialect, conveyor.compositionTopology, conveyor.cameraArchetype, conveyor.scaleTier],
    ['robotics-control/conveyor-logistics', 'conveyor', 'isometric-line', 'human']
  );
  assert.deepEqual(
    [gripper.visualDialect, gripper.compositionTopology, gripper.cameraArchetype, gripper.scaleTier],
    ['robotics-control/precision-gripper', 'specimen', 'lab-cutaway', 'microscopic']
  );
  assert.notDeepEqual(conveyor.positions, gripper.positions);
  assert.deepEqual(conveyor.packet, {
    visualDialect: conveyor.visualDialect,
    compositionTopology: conveyor.compositionTopology,
    cameraArchetype: conveyor.cameraArchetype,
    scaleTier: conveyor.scaleTier,
  });
  assert.deepEqual(gripper.packet, {
    visualDialect: gripper.visualDialect,
    compositionTopology: gripper.compositionTopology,
    cameraArchetype: gripper.cameraArchetype,
    scaleTier: gripper.scaleTier,
  });
  assert.ok(conveyor.evidence.matchedTerms.some((row) => row.term === 'conveyor' || row.term === 'parcel'));
  assert.ok(gripper.evidence.matchedTerms.some((row) => row.term === 'gripper'));
});

test('Phase 6 dialect receipts are deterministic and identify evidence sources', () => {
  const prompt = 'railway dispatch conflict resolution across signal blocks with delayed train agents and platform slots';
  const first = visualAxes(compile(prompt));
  const second = visualAxes(compile(prompt));

  assert.deepEqual(first, second);
  assert.equal(first.visualDialect, 'civic-market/transit-dispatch');
  assert.equal(first.compositionTopology, 'ladder');
  assert.equal(first.cameraArchetype, 'map-view');
  assert.equal(first.scaleTier, 'landscape');
  assert.equal(first.evidence.schema, 'simulatte.visualDialectEvidence.v1');
  assert.ok(first.evidence.objectIds.length > 0);
  assert.ok(first.evidence.matchedTerms.some((row) => row.term === 'railway'));
});

test('precision gripper retains its positive specimen and excludes negated folding', () => {
  const spec = compile('robot gripper twists a protein sample holder without molecular folding');
  const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
  const labels = packet.entities.map((row) => row.identity && row.identity.sourceLabel || '');
  const required = spec.phaseArtifacts.phase6.artifact.compositionLedger.obligations
    .filter((row) => row.required)
    .map((row) => [row.id, row.status]);

  assert.ok(labels.includes('protein sample holder'));
  assert.ok(!labels.some((label) => /without molecular folding|^folding$/i.test(label)));
  assert.deepEqual(required.find(([id]) => id === 'entity:protein-sample-holder'), ['entity:protein-sample-holder', 'preserved']);
  assert.equal(required.some(([id]) => /:folding:/.test(id)), false);
});

test('Phase 5 does not leak negated retrieval rows into the Phase 6 input', () => {
  const spec = compile('phase study in a generic lab with no qubits or quantum hardware');
  const phase4 = spec.phaseArtifacts.phase4.artifact.groundedIntent;
  const phase5 = spec.phaseArtifacts.phase5.artifact.simulationCompile;
  const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
  const text = JSON.stringify({
    phase4Components: phase4.components,
    phase5Objects: phase5.visualSource.objects,
    packetEntities: packet.entities,
  }).toLowerCase();

  assert.doesNotMatch(text, /\b(qubit|quantum)\b/);
  assert.ok(packet.entities.length > 0);
});

test('topology evidence becomes a visible graphics atom', () => {
  const molding = compile('injection molding line cools plastic through steel tooling');
  const lava = compile('lava spins a turbine near an ice castle wall');
  const geometryIds = (spec) => spec.renderProgram.visualIR.graphicsAtoms.geometry.map((row) => row.id);

  assert.ok(geometryIds(molding).includes('composition-topology-specimen'));
  assert.ok(geometryIds(lava).includes('composition-topology-stack'));
  assert.notDeepEqual(geometryIds(molding), geometryIds(lava));
});

test('watershed scenes retain an animal-swim dialect when the evidence names animals', () => {
  const swimming = visualAxes(compile('dogs and cats swimming'));
  const terrain = visualAxes(compile('trees and mountaints'));

  assert.deepEqual(
    [swimming.visualDialect, swimming.compositionTopology, swimming.cameraArchetype],
    ['watershed/animal-swim', 'field-map', 'wide-establishing']
  );
  assert.deepEqual(
    [terrain.visualDialect, terrain.compositionTopology, terrain.cameraArchetype],
    ['watershed/basin', 'basin', 'aerial-map']
  );
  assert.notDeepEqual(swimming.positions, terrain.positions);
});

test('diversity diagnostics ignore generated variant codes', async () => {
  const diversity = await import('../tools/audit-pipeline-diversity.mjs');
  const contextForVariant = (variantCode) => ({
    prompt: 'same compiled evidence',
    visualIR: { sceneKind: 'robotics-control' },
    visualCompile: {
      sceneRenderPacket: {
        sceneKind: 'robotics-control',
        entities: [{
          id: 'arm',
          layerSlot: 'robot-armature',
          transform: { position: [0.5, 0.5], scale: [0.2, 0.2] },
          animation: { kind: 'contact-pulse' },
          identity: { type: 'robot', category: 'machine', renderClass: 'robot-armature' },
          renderCodes: { variantCode },
        }],
      },
    },
    physicsIR: { operators: [{ type: 'contact_force' }], behaviorRelations: [{ process: 'impact' }] },
  });
  const left = diversity.diversitySignatureForContext(contextForVariant(0.01));
  const right = diversity.diversitySignatureForContext(contextForVariant(0.99));
  const audit = diversity.scoreDiversity([
    { prompt: 'left', diversitySignature: left },
    { prompt: 'right', diversitySignature: right },
  ]);

  assert.equal(Object.hasOwn(left, 'variantCode'), false);
  assert.equal(Object.hasOwn(left.genome, 'semanticSignature'), false);
  assert.equal(audit.minPairwiseDistance, 0);
});

test('closest-pair diagnostics preserve grounding provenance without affecting compilation', async () => {
  const diversity = await import('../tools/audit-pipeline-diversity.mjs');
  const contextFor = (term, candidateId, componentId) => ({
    prompt: term,
    languageEvidence: { spans: [{ text: term, kind: 'entity' }] },
    retrievalRows: [{ id: candidateId, phrase: term, retrievalRole: 'candidate' }],
    groundedIntent: { components: [{ id: componentId, phrase: term, retrievalRole: 'candidate' }] },
  });
  const parcels = diversity.diversitySignatureForContext(contextFor('parcels', 'surface-parcel', 'grounded-parcel'));
  const specimen = diversity.diversitySignatureForContext(contextFor('protein sample', 'surface-specimen', 'grounded-specimen'));
  const audit = diversity.scoreDiversity([
    { prompt: 'missing signature' },
    { prompt: 'parcels', diversitySignature: parcels },
    { prompt: 'protein sample', diversitySignature: specimen },
  ]);
  const diagnostic = audit.closestPairs[0].groundingDiagnostic;

  assert.equal(audit.closestPairs[0].promptA, 'parcels');
  assert.equal(audit.closestPairs[0].promptB, 'protein sample');
  assert.equal(diagnostic.schema, 'simulatte.diversityGroundingCollisionDiagnostic.v1');
  assert.equal(diagnostic.auditOnly, true);
  assert.deepEqual(diagnostic.phase2.leftOnly, ['parcels']);
  assert.deepEqual(diagnostic.phase2.rightOnly, ['protein sample']);
  assert.deepEqual(diagnostic.phase3.leftOnly, ['parcels']);
  assert.deepEqual(diagnostic.phase4.rightOnly, ['protein sample']);
  assert.equal(diagnostic.nextInspection, 'phase6-dialect-or-rendering');
});
