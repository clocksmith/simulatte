const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const lab = require('../public/app/simulation/simulation-lab.js');
const compositionGraph = require('../public/pipeline/phase-06-visual/simulatte-composition-graph.js');
const solverRegistry = require('../public/pipeline/phase-05-simulation/simulatte-solver-registry.js');
const advectionSolver = require('../public/pipeline/phase-05-simulation/solvers/simulatte-solver-advection.js');
const webgpuRenderer = require('../public/pipeline/phase-07-render/simulatte-webgpu-renderer.js');
const universeParser = require('../public/pipeline/phase-02-language/simulatte-universe-parser.js');

function runtimeSourceFromFile(file, seen = new Set()) {
  if (seen.has(file)) return '';
  seen.add(file);
  const source = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  const dependencies = [];
  const requirePattern = /require\(['"](\.\/[^'"]+\.js)['"]\)/g;
  let match;
  while ((match = requirePattern.exec(source))) {
    dependencies.push(path.resolve(dir, match[1]));
  }
  return [
    ...dependencies.map((dependency) => runtimeSourceFromFile(dependency, seen)),
    source,
  ].filter(Boolean).join('\n');
}

test('prompt compiles through parse, universe graph, PhysicsIR, solver graph, and render IR', () => {
  const spec = lab.createSpecFromPrompt('lava spins a turbine near an ice castle wall');

  assert.equal(spec.promptParse.schema, 'simulatte.promptParse.v1');
  assert.equal(spec.universeGraph.schema, 'simulatte.universeGraph.v1');
  assert.equal(spec.physicsIR.schema, 'simulatte.physicalIR.v1');
  assert.equal(spec.validationReceipt.schema, 'simulatte.validationReceipt.v1');
  assert.equal(spec.solverGraph.schema, 'simulatte.solverGraph.v1');
  assert.equal(spec.renderIR.schema, 'simulatte.renderIR.v1');

  assert.ok(spec.universeGraph.nodes.some((node) => node.canonicalId === 'material.lava'));
  assert.ok(spec.universeGraph.nodes.some((node) => /turbine/.test(node.canonicalId)));
  assert.ok(spec.universeGraph.nodes.some((node) => node.canonicalId === 'material.ice'));
  assert.ok(spec.universeGraph.nodes.some((node) => node.canonicalId === 'structure.castle_wall'));
  assert.ok(spec.physicsIR.operators.some((operator) => operator.type === 'rotational_torque'));
  assert.ok(spec.physicsIR.operators.some((operator) => operator.type === 'heat_transfer'));
  assert.ok(spec.physicsIR.operators.some((operator) => operator.type === 'phase_transition'));
  assert.ok(spec.solverGraph.steps.some((step) => step.operatorType === 'rotational_torque'));
  assert.ok(spec.renderIR.objects.some((object) => object.glyph === 'turbine'));
  assert.ok(spec.renderIR.objects.some((object) => object.stateBindings.rotationRate));
  assert.equal(spec.renderProgram.provenance.compiler, 'simulatte.render-ir-to-render-program.v1');
  assert.equal(spec.renderIR.sceneHint, 'literal-composite');
  assert.equal(spec.renderProgram.rendererPlan.sceneKind, 'thermal-plume');
  assert.equal(spec.renderProgram.visualIR.sceneKind, spec.renderProgram.rendererPlan.sceneKind);
  assert.equal(spec.phaseArtifacts.phase1.schema, 'simulatte.phase1.output.v1');
  assert.equal(spec.phaseArtifacts.phase2.artifact.languageGraph.sourceText, 'lava spins a turbine near an ice castle wall');
  assert.equal(spec.phaseArtifacts.phase3.artifact.retrievalRerankResult.query, spec.phaseArtifacts.phase2.artifact.languageGraph.sourceText);
  assert.equal(spec.phaseArtifacts.phase5.schema, 'simulatte.phase5.output.v2');
  assert.equal(spec.phaseArtifacts.phase5.artifact.simulationCompile.renderIR.schema, 'simulatte.renderIR.v1');
  assert.equal(spec.phaseArtifacts.phase6.inputSchema, 'simulatte.phase5.output.v2');
	  assert.equal(spec.phaseArtifacts.phase2.artifact.sceneLanguageGraph.schema, 'simulatte.sceneLanguageGraph.v1');
	  assert.equal(spec.phaseArtifacts.phase2.artifact.queryPlan.schema, 'simulatte.sceneQueryPlan.v1');
	  assert.equal(spec.phaseArtifacts.phase2.artifact.compositionLedger.schema, 'simulatte.sceneCompositionLedger.v1');
	  assert.equal(spec.phaseArtifacts.phase3.artifact.retrievalRerankResult.schema, 'simulatte.retrievalRerankResult.v2');
	  assert.equal(spec.phaseArtifacts.phase5.artifact.simulationCompile.schema, 'simulatte.simulationCompile.v2');
	  assert.equal(spec.phaseArtifacts.phase6.artifact.visualCompile.schema, 'simulatte.visualCompile.v2');
  assert.ok(spec.phaseArtifacts.phase6.artifact.visualCompile.renderInstances.length > 0);
  assert.ok(spec.phaseArtifacts.phase6.artifact.visualCompile.renderInstances.every((instance) => (
    instance.transform &&
    instance.geometry &&
    instance.material &&
    instance.animation &&
    instance.collider
  )));
  const scenePacket = spec.renderProgram.visualIR.sceneRenderPacket;
  assert.equal(scenePacket.schema, 'simulatte.sceneRenderPacket.v1');
  assert.equal(spec.renderProgram.sceneRenderPacket, scenePacket);
  assert.equal(scenePacket.coordinateSystem.origin, 'top-left');
  assert.ok(scenePacket.entities.length >= 1);
  assert.ok(scenePacket.entities.every((entity) => Array.isArray(entity.transform.position)));
  assert.ok(scenePacket.entities.every((entity) => Array.isArray(entity.transform.scale)));
  assert.ok(scenePacket.entities.every((entity) => entity.geometry && entity.material && entity.animation && entity.collider));
  assert.equal(scenePacket.uniforms.schema, 'simulatte.sceneRenderPacketUniforms.v1');
  assert.equal(scenePacket.uniforms.source, 'sceneRenderPacket.renderCodes');
  assert.equal(scenePacket.uniforms.sceneId, 0);
  assert.equal(scenePacket.uniforms.sceneMix.length, 16);
  assert.equal(scenePacket.uniforms.visualLayers.length, 24);
  assert.equal(scenePacket.uniforms.atomUniforms.length, 24);
  assert.ok(scenePacket.entities.every((entity) => entity.renderCodes && entity.renderCodes.schema === 'simulatte.sceneRenderCodes.v1'));
  assert.ok(scenePacket.entities.every((entity) => Number(entity.renderCodes.layerCode) > 0));
  assert.ok(scenePacket.entities.every((entity) => Number(entity.renderPriority) > 0));
  assert.ok(scenePacket.passes.includes('entities'));
  assert.equal(spec.physicalSpec.executableSolverGraph.schema, 'simulatte.solverGraph.v1');
  assert.ok(spec.physicalSpec.stateChannels.some((channel) => channel.startsWith('angularVelocity:')));
});

test('Phase 1 browser gate does not bypass model proof for prompt keywords', () => {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const previousWindow = globalThis.window;
  globalThis.window = {};
  try {
    assert.throws(
      () => lab.runPhase1RuntimeGate('an empty glass fills with water', {}),
      /Phase 1 runtime gate requires promptRuntimeReceipt/
    );
    assert.throws(
      () => lab.runPhase1RuntimeGate('build a castle from scratch', {}),
      /Phase 1 runtime gate requires promptRuntimeReceipt/
    );
    assert.doesNotThrow(() => lab.runPhase1RuntimeGate('', {}));
    assert.doesNotThrow(() => lab.runPhase1RuntimeGate('blank world', { allowPrototypeFallback: true }));
  } finally {
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }
});

test('Phase 1 browser gate requires ready reranker when runtime receipt requires one', () => {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const previousWindow = globalThis.window;
  globalThis.window = {};
  const receipt = {
    id: 'runtime:test',
    modelId: 'qwen-3-embedding-0-6b-q4k-ehf16-af32',
    providerBackend: 'doppler-browser-load',
    providerReady: true,
    noFallback: true,
    embeddingProbe: true,
    rerankerRequired: true,
    rerankerReady: false,
  };
  try {
    assert.throws(
      () => lab.runPhase1RuntimeGate('dogs swimming in a lake', { promptRuntimeReceipt: receipt }),
      /Phase 1 runtime gate requires promptRuntimeReceipt/
    );
    assert.doesNotThrow(() => lab.runPhase1RuntimeGate('dogs swimming in a lake', {
      promptRuntimeReceipt: {
        ...receipt,
        rerankerReady: true,
      },
    }));
  } finally {
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }
});

test('Phase 2 preserves coordinated biological agents swimming inside water environments', () => {
  const bareSpec = lab.createSpecFromPrompt('dogs and cats swimming', {
    allowPrototypeFallback: true,
  });
  const bareLanguageGraph = bareSpec.phaseArtifacts.phase2.artifact.languageGraph;
  const bareImplicitRelations = bareLanguageGraph.relations.filter((relation) => (
    relation.relation === 'in' &&
    relation.targetText === 'water' &&
    relation.inferred === true &&
    relation.causalAffordance === 'agents-in-water'
  ));
  assert.equal(bareLanguageGraph.predicates.length, 2);
  assert.ok(bareLanguageGraph.predicates.every((predicate) => (
    predicate.process === 'swimming' &&
    predicate.subjectRole === 'biological-agent' &&
    predicate.objectRole === 'fluid-medium' &&
    predicate.spatialRelation === 'in' &&
    predicate.causalAffordance === 'agents-in-water' &&
    predicate.implicitObject === 'water'
  )));
  assert.equal(bareImplicitRelations.length, 2);

  const spec = lab.createSpecFromPrompt('dogs and cats swimming in a lake', {
    allowPrototypeFallback: true,
  });
  const languageGraph = spec.phaseArtifacts.phase2.artifact.languageGraph;
  const spanByText = Object.fromEntries(languageGraph.spans.map((span) => [span.text, span]));
  const predicateSubjects = new Set(languageGraph.predicates.map((predicate) => predicate.subjectSpanId));
  const agentLocationRelations = languageGraph.relations.filter((relation) => (
    relation.relation === 'in' &&
    relation.causalAffordance === 'agents-in-water'
  ));

  assert.equal(spanByText.dogs.kind, 'entity');
  assert.equal(spanByText.dogs.semanticRole, 'biological-agent');
  assert.equal(spanByText.cats.kind, 'entity');
  assert.equal(spanByText.cats.semanticRole, 'biological-agent');
  assert.equal(spanByText.swimming.kind, 'process');
  assert.equal(spanByText.lake.kind, 'environment');
  assert.equal(spanByText.lake.semanticRole, 'containing-environment');
  assert.equal(languageGraph.predicates.length, 2);
  assert.ok(predicateSubjects.has(spanByText.dogs.id));
  assert.ok(predicateSubjects.has(spanByText.cats.id));
  assert.ok(languageGraph.predicates.every((predicate) => (
    predicate.verbSpanId === spanByText.swimming.id &&
    predicate.objectSpanId === spanByText.lake.id &&
    predicate.process === 'swimming' &&
    predicate.subjectRole === 'biological-agent' &&
    predicate.objectRole === 'containing-environment' &&
    predicate.spatialRelation === 'in' &&
    predicate.causalAffordance === 'agents-in-water'
  )));
  assert.equal(agentLocationRelations.length, 2);
  assert.ok(languageGraph.relations.some((relation) => (
    relation.sourceSpanId === spanByText.swimming.id &&
    relation.targetSpanId === spanByText.lake.id &&
    relation.relation === 'occurs_in'
  )));
});

test('Phase 2 does not invent water targets for unrelated intransitive clauses', () => {
  const spec = lab.createSpecFromPrompt('the turbine spins', {
    allowPrototypeFallback: true,
  });
  const phase2 = spec.phaseArtifacts.phase2.artifact;
  const sceneGraph = phase2.sceneLanguageGraph;
  const queryPlan = phase2.queryPlan;

  assert.deepEqual(sceneGraph.mediums, []);
  assert.ok(sceneGraph.relations.some((relation) => (
    relation.id === 'relation:turbine:rotate:world' &&
    relation.kind === 'agent-action' &&
    relation.target === ''
  )));
  assert.ok(queryPlan.slots.every((slot) => (
    !String(slot.entryId || '').includes('medium:water') &&
    !(slot.queries || []).some((query) => /medium:water/.test(query.text || ''))
  )));
});

test('Phase 2 carries negation without creating required slots for negated entities', () => {
  const spec = lab.createSpecFromPrompt('dogs but no cats swimming in a lake', {
    allowPrototypeFallback: true,
  });
  const phase2 = spec.phaseArtifacts.phase2.artifact;
  const entityById = Object.fromEntries(phase2.sceneLanguageGraph.entities.map((entry) => [entry.id, entry]));
  const slotIds = new Set(phase2.queryPlan.slots.map((slot) => slot.slotId));

  assert.equal(entityById['entity:dog'].required, true);
  assert.equal(entityById['entity:dog'].negated, false);
  assert.equal(entityById['entity:cat'].required, false);
  assert.equal(entityById['entity:cat'].negated, true);
  assert.ok(slotIds.has('slot.actor.dog'));
  assert.equal(slotIds.has('slot.actor.cat'), false);
  assert.ok(phase2.sceneLanguageGraph.relations.some((relation) => (
    relation.id === 'relation:dog:swimming:lake' &&
    relation.from === 'entity:dog' &&
    relation.target === 'environment:lake'
  )));
});

test('Phase 2 phrase parser matches multi-word entities across whitespace', () => {
  const parsed = universeParser.parsePrompt('neutrino detector inside a water\n   tank');
  const spanTexts = new Set(parsed.spans.map((span) => span.text));

  assert.ok(spanTexts.has('neutrino detector'));
  assert.ok(spanTexts.has('water\n   tank'));
});

test('Phase 3 separates literal swimming retrieval from generic support physics', () => {
  const spec = lab.createSpecFromPrompt('dogs and cats swimming in a lake', {
    allowPrototypeFallback: true,
  });
  const retrieval = spec.phaseArtifacts.phase3.artifact.retrievalRerankResult;
  const receipt = spec.phaseArtifacts.phase3.receipts[0];
  const candidateIds = new Set(retrieval.rankedPrimitives.map((row) => row.id || row.primitiveId));
  const supportIds = new Set(retrieval.supportPrimitives.map((row) => row.id || row.primitiveId));
  const buckets = retrieval.typedEvidenceBuckets.buckets;
  const ledgerIds = new Set(retrieval.compositionLedger.obligations.map((row) => row.id));
  const slotById = new Map(retrieval.slotEvidence.map((row) => [row.slotId, row]));
  const supportNoise = [
    'biomass',
    'collision',
    'elasticity',
    'friction',
    'gel',
    'membrane',
    'soft-body',
    'diffusion',
    'growth-decay',
  ];

  for (const id of ['surface-cat-1', 'surface-dog-1', 'lake', 'water', 'open-cats-swimming-1']) {
    assert.ok(candidateIds.has(id), `Phase 3 should keep literal candidate ${id}`);
  }
  for (const id of supportNoise) {
    assert.ok(!candidateIds.has(id), `Phase 3 should not rank support primitive ${id} as literal evidence`);
    assert.ok(supportIds.has(id), `Phase 3 should keep ${id} as support evidence`);
  }
  assert.ok(retrieval.rankedPrimitives.every((row) => row.retrievalRole === 'candidate' && row.supportOnly === false));
  assert.ok(retrieval.supportPrimitives.every((row) => row.retrievalRole === 'support' && row.supportOnly === true));
  assert.equal(retrieval.curation.mode, 'literal-candidates-support-separated');
  assert.ok(buckets.literalPromptObjects.some((row) => row.id === 'surface-dog-1'));
  assert.ok(buckets.literalPromptObjects.some((row) => row.id === 'surface-cat-1'));
  assert.ok(buckets.environmentEvidence.some((row) => row.id === 'lake'));
  assert.ok(buckets.materialMediumEvidence.some((row) => row.id === 'water'));
  assert.ok(buckets.actionEvidence.some((row) => row.id === 'action:swimming'));
  assert.equal(slotById.get('slot.actor.dog').status, 'preserved');
  assert.equal(slotById.get('slot.actor.cat').status, 'preserved');
  assert.equal(slotById.get('slot.relation.dog_swimming_lake').status, 'preserved');
  assert.equal(slotById.get('slot.relation.cat_swimming_lake').status, 'preserved');
  assert.equal(slotById.get('slot.visual.wake-ripples').status, 'pending');
  assert.deepEqual(retrieval.missingRequiredSlots, []);
  assert.ok(retrieval.acceptedCandidatesBySlot['slot.actor.dog'].some((row) => row.id === 'surface-dog-1'));
  assert.ok(retrieval.acceptedCandidatesBySlot['slot.actor.cat'].some((row) => row.id === 'surface-cat-1'));
  assert.ok(spec.phaseArtifacts.phase4.artifact.activationCloud.slotActivations.length > 0);
  assert.equal(
    spec.phaseArtifacts.phase4.artifact.groundedIntent.slotEvidence.length,
    retrieval.slotEvidence.length
  );
  assert.ok(ledgerIds.has('entity:dog'));
  assert.ok(ledgerIds.has('entity:cat'));
  assert.ok(ledgerIds.has('action:swimming'));
  assert.ok(ledgerIds.has('relation:dog:swimming:lake'));
  assert.ok(ledgerIds.has('relation:cat:swimming:lake'));
  assert.ok(ledgerIds.has('visual:wake-ripples'));
  assert.equal(receipt.primitiveCount, retrieval.rankedPrimitives.length);
  assert.equal(receipt.supportPrimitiveCount, retrieval.supportPrimitives.length);
  assert.ok(receipt.rawPrimitiveCount > receipt.primitiveCount);
});

test('Phase 3 strips Phase 4 conclusion fields from retrieval evidence side channels', () => {
  const spec = lab.createSpecFromPrompt('dogs swimming in a lake', {
    allowPrototypeFallback: true,
    phase3RetrievalEvidence: {
      schema: 'simulatte.phase3.retrievalEvidence.v1',
      rankedPrimitives: [
        { id: 'dog', label: 'dog', source: 'prompt-explicit', score: 1 },
      ],
      acceptedGraph: { nodes: [{ id: 'side-channel' }] },
      rejectedGraph: { rejected: [{ id: 'side-channel-rejected' }] },
      contract: { id: 'side-channel-contract' },
      assumptions: [{ id: 'side-channel-assumption' }],
      unsupported: [{ id: 'side-channel-unsupported' }],
    },
  });
  const groundingEvidence = spec.phaseArtifacts.phase3.artifact.retrievalRerankResult.groundingEvidence;

  assert.equal(groundingEvidence.acceptedGraph, null);
  assert.equal(groundingEvidence.rejectedGraph, null);
  assert.equal(groundingEvidence.contract, null);
  assert.deepEqual(groundingEvidence.assumptions, []);
  assert.deepEqual(groundingEvidence.unsupported, []);
  assert.ok(spec.phaseArtifacts.phase4.artifact.groundedIntent.acceptedGraph);
});

test('Phase 3 rejects stale slot retrieval from another prompt hash', () => {
  const prompt = 'dogs swimming in a lake';
  const phase1 = lab.runPhase1RuntimeGate(prompt, { allowPrototypeFallback: true });
  const phase2 = lab.runPhase2LanguageGraph(phase1);

  assert.throws(
    () => lab.runPhase3Retrieval(phase2, {
      retrievalEvidence: {
        slotRetrieval: {
          schema: 'simulatte.phase3SlotRetrieval.v1',
          sourcePromptHash: 'prompt:stale',
          bySlot: [],
        },
      },
    }),
    /Phase 3 slotRetrieval\.sourcePromptHash mismatch/
  );
});

test('Phase 3 rejects retrieval evidence whose top-level prompt hash is stale', () => {
  const prompt = 'dogs swimming in a lake';
  const phase1 = lab.runPhase1RuntimeGate(prompt, { allowPrototypeFallback: true });
  const phase2 = lab.runPhase2LanguageGraph(phase1);

  assert.throws(
    () => lab.runPhase3Retrieval(phase2, {
      retrievalEvidence: {
        schema: 'simulatte.phase3.retrievalEvidence.v1',
        sourcePromptHash: 'prompt:stale',
        rankedPrimitives: [
          { id: 'dog', label: 'dog', source: 'prompt-explicit', score: 1 },
        ],
      },
    }),
    /Phase 3 retrieval evidence prompt hash mismatch/
  );
});

test('Phase 5 physics obligations prove operators beyond the swimming vertical', () => {
  const spec = lab.createSpecFromPrompt('lava spins a turbine near an ice castle wall');
  const rows = spec.phaseArtifacts.phase5.artifact.simulationCompile.physicsObligations;
  assert.ok(Array.isArray(rows) && rows.length > 0);

  const rotate = rows.filter((row) => row.process === 'rotate');
  assert.ok(rotate.length >= 1, 'rotate obligations carry operator expectations');
  for (const row of rotate) {
    assert.deepEqual(row.expectedOperators, ['rotational_torque']);
    assert.deepEqual(row.satisfiedOperators, ['rotational_torque']);
    assert.equal(row.status, 'lowered');
  }

  const passthrough = rows.filter((row) => row.expectedOperators.length === 0);
  assert.ok(passthrough.every((row) => row.status !== 'unsupported'));

  const swimSpec = lab.createSpecFromPrompt('dogs and cats swimming in a lake', {
    allowPrototypeFallback: true,
  });
  const swimRows = swimSpec.phaseArtifacts.phase5.artifact.simulationCompile.physicsObligations;
  const swimming = swimRows.filter((row) => row.process === 'swimming');
  assert.ok(swimming.length >= 1, 'swimming obligations keep the behavior operator set');
  for (const row of swimming) {
    assert.deepEqual(row.expectedOperators, [
      'fluid_locomotion', 'buoyancy', 'drag', 'wake_generation', 'body_water_contact', 'partial_submersion',
    ]);
    assert.equal(row.status, 'lowered');
  }
});

test('Phase 5 and 7 lower swimming into behavior physics and preserve dog cat identities', () => {
  const spec = lab.createSpecFromPrompt('dogs and cats swimming in a lake', {
    allowPrototypeFallback: true,
  });
  const simulationCompile = spec.phaseArtifacts.phase5.artifact.simulationCompile;
  const visualCompile = spec.phaseArtifacts.phase6.artifact.visualCompile;
  const operatorTypes = new Set(simulationCompile.physicsIR.operators.map((row) => row.type));
  const solverTypes = new Set(simulationCompile.solverGraph.steps.map((row) => row.operatorType));
  const behaviorRelations = simulationCompile.physicsIR.behaviorRelations || [];
  const renderBehaviors = simulationCompile.renderIR.objects
    .filter((row) => row.behavior && row.behavior.processes.includes('swimming'));
  const sceneEntities = visualCompile.sceneRenderPacket.entities;
  const sceneFields = visualCompile.sceneRenderPacket.fields;
  const sceneEffects = visualCompile.sceneRenderPacket.effects;
  const entityById = new Map(sceneEntities.map((row) => [row.id, row]));
  const identityById = new Map(sceneEntities.map((row) => [row.id, row.identity && row.identity.type]));
  const primitiveById = new Map(sceneEntities.map((row) => [row.id, row.geometry && row.geometry.primitive]));
  const visualLedger = visualCompile.compositionLedger || {};
  const obligationById = new Map((visualLedger.obligations || []).map((row) => [row.id, row]));
  const lostObligations = (visualLedger.obligations || []).filter((row) => row.status === 'lost');
  const dogEntity = entityById.get('surface-dog-1');
  const catEntity = entityById.get('surface-cat-1');
  const synthesizedDogEntity = entityById.get('dog-a');
  const synthesizedCatEntity = entityById.get('cat-a');
  const dogWake = sceneFields.find((row) => row.id === 'visual:wake:surface-dog-1');
  const catWake = sceneFields.find((row) => row.id === 'visual:wake:surface-cat-1');
  const dogSubmersion = sceneEffects.find((row) => row.id === 'visual:submersion:surface-dog-1');
  const catSubmersion = sceneEffects.find((row) => row.id === 'visual:submersion:surface-cat-1');
  const dogSwimPose = sceneEffects.find((row) => row.id === 'visual:swim-pose:surface-dog-1');
  const catSwimPose = sceneEffects.find((row) => row.id === 'visual:swim-pose:surface-cat-1');

  for (const type of [
    'fluid_locomotion',
    'buoyancy',
    'drag',
    'wake_generation',
    'body_water_contact',
    'partial_submersion',
  ]) {
    assert.ok(operatorTypes.has(type), `Phase 5 should emit ${type}`);
    assert.ok(solverTypes.has(type), `solver graph should keep ${type}`);
  }
  assert.equal(behaviorRelations.length, 2);
  assert.ok(behaviorRelations.some((row) => row.agentEntityId === 'semantic-surface-dog-1'));
  assert.ok(behaviorRelations.some((row) => row.agentEntityId === 'semantic-surface-cat-1'));
  assert.ok(renderBehaviors.some((row) => row.physicalRef === 'semantic-surface-dog-1'));
  assert.ok(renderBehaviors.some((row) => row.physicalRef === 'semantic-surface-cat-1'));
  assert.ok(simulationCompile.renderIR.objects.some((row) => row.stateBindings && row.stateBindings.submersion));
  assert.equal(identityById.get('surface-dog-1'), 'dog');
  assert.equal(identityById.get('surface-cat-1'), 'cat');
  assert.equal(identityById.get('dog-a'), 'dog');
  assert.equal(identityById.get('cat-a'), 'cat');
  assert.equal(primitiveById.get('surface-dog-1'), 'dog-body');
  assert.equal(primitiveById.get('surface-cat-1'), 'cat-body');
  assert.equal(primitiveById.get('dog-a'), 'dog-body');
  assert.equal(primitiveById.get('cat-a'), 'cat-body');
  assert.equal(dogEntity.material.id, 'dog-swim-fur');
  assert.equal(catEntity.material.id, 'cat-swim-fur');
  assert.equal(synthesizedDogEntity.material.id, 'dog-swim-fur');
  assert.equal(synthesizedCatEntity.material.id, 'cat-swim-fur');
  assert.notEqual(dogEntity.material.id, catEntity.material.id);
  assert.equal(dogEntity.layerSlot, 'biological-agent');
  assert.equal(catEntity.layerSlot, 'biological-agent');
  assert.equal(synthesizedDogEntity.layerSlot, 'biological-agent');
  assert.equal(synthesizedCatEntity.layerSlot, 'biological-agent');
  assert.equal(dogEntity.animation.kind, 'swim-cycle');
  assert.equal(catEntity.animation.kind, 'swim-cycle');
  assert.equal(synthesizedDogEntity.animation.kind, 'swim-cycle');
  assert.equal(synthesizedCatEntity.animation.kind, 'swim-cycle');
  assert.equal(dogEntity.renderCodes.semanticCode, 1);
  assert.equal(catEntity.renderCodes.semanticCode, 2);
  assert.equal(synthesizedDogEntity.renderCodes.semanticCode, 1);
  assert.equal(synthesizedCatEntity.renderCodes.semanticCode, 2);
  assert.equal(dogEntity.renderCodes.animationCode, 1);
  assert.equal(catEntity.renderCodes.animationCode, 1);
  assert.equal(dogEntity.visualTraits.species, 'dog');
  assert.equal(catEntity.visualTraits.species, 'cat');
  assert.equal(dogEntity.visualTraits.waterlineMask, true);
  assert.equal(catEntity.visualTraits.waterlineMask, true);
  assert.ok(dogEntity.geometry.constraints.includes('species-distinct-silhouette'));
  assert.ok(catEntity.geometry.constraints.includes('species-distinct-silhouette'));
  assert.ok(dogEntity.geometry.constraints.includes('partial-submersion'));
  assert.ok(catEntity.geometry.constraints.includes('partial-submersion'));
  assert.ok(dogEntity.transform.position[1] >= 0.54 && dogEntity.transform.position[1] <= 0.74);
  assert.ok(catEntity.transform.position[1] >= 0.54 && catEntity.transform.position[1] <= 0.74);
  assert.equal(dogWake.layerSlot, 'flow-field');
  assert.equal(catWake.layerSlot, 'flow-field');
  assert.equal(dogWake.material.id, 'wake-ripple');
  assert.equal(catWake.material.id, 'wake-ripple');
  assert.ok(dogWake.evidence.includes('agent:surface-dog-1'));
  assert.ok(catWake.evidence.includes('agent:surface-cat-1'));
  assert.equal(dogSubmersion.layerSlot, 'process-pulse');
  assert.equal(catSubmersion.layerSlot, 'process-pulse');
  assert.equal(dogSubmersion.domain.kind, 'submersion-band');
  assert.equal(catSubmersion.domain.kind, 'submersion-band');
  assert.equal(dogSubmersion.material.id, 'submersion-mask');
  assert.equal(catSubmersion.material.id, 'submersion-mask');
  assert.ok(dogSubmersion.affects.includes('surface-dog-1'));
  assert.ok(catSubmersion.affects.includes('surface-cat-1'));
  assert.equal(dogSwimPose.animation.kind, 'swim-cycle');
  assert.equal(catSwimPose.animation.kind, 'swim-cycle');
  assert.ok((obligationById.get('visual:species-distinct-silhouettes').visualEvidence || []).includes('material:dog-swim-fur'));
  assert.ok((obligationById.get('visual:species-distinct-silhouettes').visualEvidence || []).includes('material:cat-swim-fur'));
  assert.ok(!(obligationById.get('visual:species-distinct-silhouettes').visualEvidence || []).includes('material:water'));
  assert.ok(!(obligationById.get('visual:species-distinct-silhouettes').visualEvidence || []).includes('material:light'));
  assert.ok(!(obligationById.get('visual:swimming-pose').visualEvidence || []).some((row) => row.startsWith('instance:geometry:')));
  assert.ok((obligationById.get('visual:wake-ripples').visualEvidence || []).includes('visual:wake:surface-dog-1'));
  assert.ok((obligationById.get('visual:wake-ripples').visualEvidence || []).includes('visual:wake:dog-a'));
  assert.ok((obligationById.get('visual:partial-submersion').visualEvidence || []).includes('visual:submersion:surface-cat-1'));
  assert.ok((obligationById.get('visual:partial-submersion').visualEvidence || []).includes('visual:submersion:cat-a'));
  assert.ok(sceneEntities.some((row) => row.identity.type === 'water' && /lake|water/.test(row.id)));
  assert.ok(sceneEntities.some((row) => row.animation && row.animation.kind === 'swim-cycle'));
  assert.deepEqual(lostObligations.map((row) => row.id), []);
  assert.equal(visualCompile.sceneRenderPacket.receipts.compositionLedger.failedCount, 0);
  assert.equal(spec.phaseArtifacts.phase6.receipts[0].lostObligations, 0);
});

test('particle instrument VisualIR preserves causal affordance rows', () => {
  const spec = lab.createSpecFromPrompt(
    'particle collider muon tracks collision plume through a detector slice with field lines and calorimeter heat'
  );
  const visualIR = spec.renderProgram.visualIR;
  const causalReceipt = visualIR.receipts.find((row) => row.id === 'receipt:causal-affordances');

  assert.equal(spec.renderProgram.rendererPlan.sceneKind, 'particle-instrument');
  assert.ok(spec.renderIR.causalAffordances.length > 0);
  assert.ok(visualIR.causalAffordances.length > 0);
  assert.ok(causalReceipt.count > 0);
  assert.ok(visualIR.geometry.some((row) => (row.evidence || []).some((item) => item.startsWith('causal-affordance:'))));
  assert.ok(visualIR.sceneRenderPacket.effects.some((row) => row.layerSlot === 'causal-affordance'));
});

test('phase envelopes enforce neighboring pipeline handoffs', () => {
  const spec = lab.createSpecFromPrompt('graph nodes route water sensors through a pump controller', {
    allowPrototypeFallback: true,
  });
  const phases = spec.phaseArtifacts;

  for (let phase = 1; phase <= 6; phase += 1) {
    const output = phases[`phase${phase}`];
    const version = phase < 3 ? 1 : 2;
    const inputVersion = phase - 1 < 3 ? 1 : 2;
    assert.equal(output.schema, `simulatte.phase${phase}.output.v${version}`);
    assert.equal(output.phase, phase);
    assert.equal(output.inputSchema, phase === 1 ? 'simulatte.phase0.input.v1' : `simulatte.phase${phase - 1}.output.v${inputVersion}`);
    assert.equal(typeof output.runtimeReceiptId, 'string');
    assert.ok(output.artifact && typeof output.artifact === 'object');
    assert.ok(Array.isArray(output.receipts));
  }

  assert.equal(phases.phase2.artifact.languageGraph.sourceText, 'graph nodes route water sensors through a pump controller');
  assert.equal(phases.phase3.artifact.retrievalRerankResult.query, phases.phase2.artifact.languageGraph.sourceText);
  assert.ok(!('rankedPrimitives' in phases.phase4.artifact.groundedIntent));
  assert.equal(phases.phase5.artifact.simulationCompile.physicsIR.schema, 'simulatte.physicalIR.v1');
  assert.equal(phases.phase6.artifact.visualCompile.sceneRenderPacket.schema, 'simulatte.sceneRenderPacket.v1');

  const renderExecutionInput = lab.createRenderExecutionInput(spec, { t: 0 }, {});
  assert.equal(renderExecutionInput.schema, 'simulatte.renderExecutionInput.v1');
  assert.equal(renderExecutionInput.inputSchema, 'simulatte.phase6.output.v2');
  assert.equal(renderExecutionInput.sceneRenderPacket, phases.phase6.artifact.visualCompile.sceneRenderPacket);
  assert.equal(renderExecutionInput.compositionLedger.schema, 'simulatte.sceneCompositionLedger.v1');
  assert.ok(Array.isArray(renderExecutionInput.visualObligations));

  const directPhase6Input = lab.createRenderExecutionInput(phases.phase6, { t: 1 }, {});
  assert.equal(directPhase6Input.schema, 'simulatte.renderExecutionInput.v1');
  assert.equal(directPhase6Input.inputSchema, 'simulatte.phase6.output.v2');
  assert.equal(directPhase6Input.sceneRenderPacket, phases.phase6.artifact.visualCompile.sceneRenderPacket);
  assert.equal('prompt' in renderExecutionInput, false);
  assert.equal('intent' in renderExecutionInput, false);
  assert.equal('renderIR' in renderExecutionInput, false);
  assert.equal('visualIR' in renderExecutionInput, false);
  assert.equal('retrievalRerankResult' in renderExecutionInput, false);

  assert.equal(lab.validatePhase1RuntimeReady(phases.phase1), phases.phase1);
  assert.equal(lab.validatePhase6VisualCompile(phases.phase6), phases.phase6);
  assert.throws(
    () => lab.validatePhase2LanguageGraph({ ...phases.phase2, inputSchema: 'simulatte.phase0.input.v1' }),
    /Phase 2 validator expected inputSchema simulatte\.phase1\.output\.v1/
  );
  assert.throws(
    () => lab.validatePhase6VisualCompile({ ...phases.phase6, artifact: {} }),
    /Phase 6 validator missing artifact\.visualCompile/
  );
  assert.throws(
    () => lab.validatePhase4GroundedIntent({
      ...phases.phase4,
      artifact: {
        ...phases.phase4.artifact,
        visualIR: { schema: 'simulatte.visualIR.v1' },
      },
    }),
    /Phase 4 validator unexpected artifact\.visualIR/
  );
  assert.throws(
    () => lab.validatePhase3RetrievalRerank({
      ...phases.phase3,
      receipts: [],
    }),
    /Phase 3 validator missing receipt phase3-retrieval-rerank/
  );
  assert.throws(
    () => lab.validatePhase3RetrievalRerank(phases.phase2),
    /Phase 3 validator expected simulatte\.phase3\.output\.v2/
  );
  assert.throws(
    () => lab.runPhase4GroundedIntent(phases.phase2),
    /Phase 4 input expected simulatte\.phase3\.output\.v2/
  );
  assert.throws(
	    () => lab.createRenderExecutionInput({
	      schema: 'simulatte.visualCompile.v2',
	      visualCompile: phases.phase6.artifact.visualCompile,
	    }),
    /renderExecutionInput source expected simulatte\.phase6\.output\.v2/
  );
  const sideChannelPhase3 = lab.runPhase4GroundedIntent(
    lab.createPhaseEnvelope({
      phase: 3,
      inputSchema: 'simulatte.phase2.output.v1',
      runtimeReceiptId: phases.phase3.runtimeReceiptId,
	      artifact: {
	        languageGraph: phases.phase3.artifact.languageGraph,
	        sceneLanguageGraph: phases.phase3.artifact.sceneLanguageGraph,
	        queryPlan: phases.phase3.artifact.queryPlan,
	        retrievalRerankResult: phases.phase3.artifact.retrievalRerankResult,
	        activationCloud: { schema: 'simulatte.activationCloud.v2', groundingEvidence: null, weightedActivations: [] },
	        compositionLedger: phases.phase3.artifact.compositionLedger,
	      },
      receipts: [
        { id: 'phase3-retrieval-rerank', schema: 'simulatte.phaseReceipt.v1' },
        { id: 'phase3-activation-fusion', schema: 'simulatte.phaseReceipt.v1' },
      ],
    }),
    {},
    { acceptedGraph: { nodes: [{ id: 'side-channel' }] } }
  );
  assert.equal(sideChannelPhase3.artifact.groundedIntent.acceptedGraph, null);

  const phase7 = lab.runPhase7RenderExecution(renderExecutionInput, null, null, {
    rendered: true,
    renderCount: 1,
    frameMs: 1.25,
  });
  assert.equal(phase7.schema, 'simulatte.phase7.output.v2');
  assert.equal(phase7.inputSchema, 'simulatte.phase6.output.v2');
	  assert.equal(phase7.artifact.renderExecution.renderExecutionInputSchema, 'simulatte.renderExecutionInput.v1');
	  assert.equal(phase7.artifact.renderExecution.sceneRenderPacketSchema, 'simulatte.sceneRenderPacket.v1');
		  assert.equal(phase7.artifact.renderExecution.schema, 'simulatte.renderExecution.v2');
		  assert.ok(Array.isArray(phase7.artifact.renderExecution.packetIdentitySummary));
		  assert.ok(Array.isArray(phase7.artifact.renderExecution.visualObligationProof));
		  assert.equal(
		    phase7.artifact.renderExecution.visualObligationProofSummary.schema,
		    'simulatte.phase7VisualObligationProofSummary.v1'
		  );
		  assert.equal(phase7.artifact.renderExecution.pixelAudit.schema, 'simulatte.phase7PixelAudit.v1');
		  assert.equal(phase7.artifact.renderExecution.pixelAudit.status, 'pass');
		  assert.equal(phase7.artifact.compositionLedger.schema, 'simulatte.sceneCompositionLedger.v1');
		  assert.equal(phase7.receipts[0].id, 'phase7-webgpu-render');
		  assert.equal(phase7.receipts[0].pixelAuditStatus, 'pass');
  assert.equal(lab.validatePhase7RenderExecution(phase7), phase7);
  assert.throws(
    () => lab.runPhase7RenderExecution({ ...renderExecutionInput, inputSchema: 'simulatte.phase5.output.v2' }),
    /Phase 7 input expected simulatte\.phase6\.output\.v2/
  );
  assert.throws(
    () => lab.runPhase7RenderExecution({ ...renderExecutionInput, sceneRenderPacket: null }),
    /Phase 7 input expected sceneRenderPacket simulatte\.sceneRenderPacket\.v1/
	  );
	});

test('Phase 7 live pixel proof gates required visual obligation samples', () => {
  const spec = lab.createSpecFromPrompt('dogs and cats swimming in a lake', {
    allowPrototypeFallback: true,
  });
  const renderExecutionInput = lab.createRenderExecutionInput(spec, { t: 0 }, {});
  const canvas = { width: 640, height: 360 };
  const missingSamples = lab.runPhase7RenderExecution(renderExecutionInput, null, canvas, {
    rendered: true,
    renderCount: 1,
    drawCount: 12,
    requireLivePixelSamples: true,
  });
  const missingAudit = missingSamples.artifact.renderExecution.pixelAudit;
  const requiredIds = missingSamples
    .artifact
    .renderExecution
    .visualObligationProofSummary
    .requiredObligationIds;

  assert.equal(missingAudit.status, 'fail');
  assert.equal(missingAudit.livePixelAudit.required, true);
  assert.equal(missingAudit.livePixelAudit.visibleSampleCount, 0);
  assert.ok(missingAudit.checks.some((row) => row.id === 'live-pixel-sample-count' && row.pass === false));
  assert.ok(requiredIds.includes('visual:wake-ripples'));
  assert.ok(requiredIds.includes('visual:partial-submersion'));

  const pixelSamples = requiredIds.map((obligationId, index) => ({
    id: `pixel:${obligationId}`,
    obligationId,
    rgba: [40 + index * 10, 130, 220, 255],
    backgroundRgba: [0, 0, 0, 255],
  }));
  const proven = lab.runPhase7RenderExecution(renderExecutionInput, null, canvas, {
    rendered: true,
    renderCount: 1,
    drawCount: 12,
    requireLivePixelSamples: true,
    pixelSamples,
  });
  const provenAudit = proven.artifact.renderExecution.pixelAudit;

  assert.equal(provenAudit.status, 'pass');
  assert.equal(provenAudit.method, 'live-pixel-samples');
  assert.equal(provenAudit.livePixelAudit.sampledRequiredObligationCount, requiredIds.length);
  assert.equal(provenAudit.livePixelAudit.obligationsSampled, true);
  assert.equal(proven.receipts[0].pixelAuditStatus, 'pass');
});

test('solver graph evolves typed finite channels for coupled lava turbine ice prompt', () => {
  const spec = lab.createSpecFromPrompt('lava spins a turbine near an ice castle wall');
  let state = lab.createSimulationState(spec);
  const angularKey = Object.keys(state.solverState.channels).find((key) => key.startsWith('angularVelocity:'));
  const iceKey = Object.keys(state.solverState.channels).find((key) => key.startsWith('liquidFraction:material-ice'));
  assert.ok(angularKey);
  assert.ok(iceKey);
  const startAngular = Number(state.solverState.channels[angularKey]);
  const startIce = Number(state.solverState.channels[iceKey]);

  for (let step = 0; step < 24; step += 1) {
    state = lab.stepSimulation(state, spec, 0.016);
  }

  assert.ok(Number.isFinite(state.solverState.channels[angularKey]));
  assert.ok(Number.isFinite(state.solverState.channels[iceKey]));
  assert.ok(state.solverState.channels[angularKey] > startAngular);
  assert.ok(state.solverState.channels[iceKey] >= startIce);
  assert.ok(state.solverState.summary.motion > 0);
});

test('unsupported and unresolved concepts are preserved in validation receipt', () => {
  const spec = lab.createSpecFromPrompt('magnetic castle soul trades entropy with a river');

  assert.equal(spec.validationReceipt.schema, 'simulatte.validationReceipt.v1');
  assert.ok(spec.validationReceipt.unresolved.some((row) => /soul/.test(row.promptSpan)));
  assert.ok(
    spec.validationReceipt.unsupported.length > 0 ||
    spec.validationReceipt.approximate.length > 0 ||
    spec.validationReceipt.unresolved.length > 0
  );
});

test('legacy custom specs migrate to pipeline artifacts during normalization', () => {
  const legacy = {
    schema: 'simulatte.simulationSpec.v1',
    templateId: 'custom-world',
    name: 'Legacy Lava Turbine',
    description: 'legacy export without pipeline artifacts',
    modules: ['fluid', 'thermal'],
    objects: [
      { id: 'lava', type: 'fluid', role: 'lava', domains: ['fluid', 'thermal'], material: 'lava' },
      { id: 'turbine', type: 'machine', role: 'turbine', domains: ['rigidBody', 'rotationalMechanics'], material: 'metal' },
    ],
    controls: [],
    params: { flowRate: 0.7, heatTransfer: 0.6 },
    intent: lab.createIntentFromPrompt('lava spins turbine'),
  };
  const spec = lab.normalizeSpec(legacy);

  assert.equal(spec.physicsIR.schema, 'simulatte.physicalIR.v1');
  assert.equal(spec.solverGraph.schema, 'simulatte.solverGraph.v1');
  assert.equal(spec.renderProgram.provenance.compiler, 'simulatte.render-ir-to-render-program.v1');
  assert.equal(spec.renderProgram.provenance.renderIR, 'simulatte.renderIR.v1');
  assert.equal(spec.renderProgram.provenance.solverGraph, 'simulatte.solverGraph.v1');
});

test('generic RenderIR scene fallback uses prompt evidence for visual routing', () => {
  const cases = [
    ['forest fire with flame smoke and wind through pine fuel', 'fire', 'thermal'],
    ['lab bench optics with glass lens mirror prism and laser sensor', 'optics', 'optical-rays'],
    ['city market queue traffic network with sensor delays', 'city', 'network-flow'],
    ['rain erodes a mountain watershed into sediment channels', 'watershed', 'gravity'],
  ];

  for (const [prompt, sceneKind, fieldKind] of cases) {
    const program = compositionGraph.compileCompositionToRenderProgram({
      schema: compositionGraph.COMPOSITION_SCHEMA,
      graphId: `generic-${sceneKind}`,
      intentText: '',
      nodes: [],
      relations: [],
      operators: [],
    }, {
      id: `generic-${sceneKind}`,
      params: {},
      renderIR: {
        schema: 'simulatte.renderIR.v1',
        sceneHint: 'generic',
        prompt,
        objects: [],
        fields: [],
      },
      solverGraph: {
        schema: 'simulatte.solverGraph.v1',
        steps: [],
        channels: {},
      },
      physicsIR: { schema: 'simulatte.physicalIR.v1', prompt },
    });

    assert.equal(program.rendererPlan.sceneKind, sceneKind);
    assert.equal(program.visualIR.sceneKind, sceneKind);
    assert.ok(program.fields.some((field) => field.kind === fieldKind));
  }
});

test('WebGPU phase 8 layer summary follows compiled VisualIR structures', () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { gpu: {} },
    configurable: true,
  });
  try {
    const cases = [
      {
        prompt: 'dogs and cats swimming in water',
        expected: ['biological-agent', 'water-volume'],
        rejected: ['detector-geometry', 'node-graph', 'readout-panel', 'track-line', 'organic-matrix'],
        sceneMixExpected: ['water', 'biological'],
        sceneMixRejected: ['network', 'optical', 'instrument'],
      },
      {
        prompt: 'particle collider detector with muon tracks and calorimeter readouts',
        expected: ['detector-geometry', 'track-line', 'readout-panel'],
        rejected: ['water-volume', 'node-graph', 'organic-matrix'],
        sceneMixExpected: ['instrument'],
        sceneMixRejected: ['biological', 'network'],
      },
      {
        prompt: 'graph of nodes edges and flows through a queue network',
        expected: ['node-graph', 'network-flow'],
        rejected: ['detector-geometry', 'water-volume', 'track-line', 'particle-swarm'],
        sceneMixExpected: ['network'],
        sceneMixRejected: ['biological', 'instrument'],
      },
      {
        prompt: 'sourdough fermentation with gluten matrix and gas bubbles',
        expected: ['organic-matrix', 'bubble-volume', 'causal-affordance', 'chemical-front'],
        rejected: ['detector-geometry', 'node-graph', 'robot-armature'],
        sceneMixExpected: ['biological', 'chemical', 'water'],
        sceneMixRejected: ['network', 'instrument'],
      },
    ];

    for (const { prompt, expected, rejected, sceneMixExpected, sceneMixRejected } of cases) {
      const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
      const packet = spec.renderProgram.visualIR.sceneRenderPacket;
      assert.equal(packet.schema, 'simulatte.sceneRenderPacket.v1', `${prompt} should compile a scene render packet`);
      assert.ok(packet.entities.length > 0, `${prompt} should compile packet entities`);
      assert.ok(packet.entities.every((entity) => Array.isArray(entity.transform.position)), `${prompt} packet entities need positions`);
      assert.ok(packet.entities.every((entity) => Array.isArray(entity.transform.scale)), `${prompt} packet entities need scale`);
      assert.ok(packet.entities.every((entity) => entity.identity && entity.identity.type && entity.identity.category), `${prompt} packet entities need semantic identities`);
      const packetLayers = new Set([
        ...packet.entities.map((row) => row.layerSlot),
        ...packet.fields.map((row) => row.layerSlot),
        ...packet.effects.map((row) => row.layerSlot),
      ]);
      for (const token of expected) assert.ok(packetLayers.has(token), `${prompt} packet should include ${token}`);
      const canvas = {
        dataset: {},
        getContext() {
          return {};
        },
      };
      const renderer = webgpuRenderer.create(canvas);
      assert.ok(renderer, `expected fake WebGPU renderer for ${prompt}`);
      assert.throws(
        () => renderer.setRenderExecutionInput(packet),
        /Phase 7 expected simulatte\.renderExecutionInput\.v1, received bare simulatte\.sceneRenderPacket\.v1/
      );
      assert.throws(
        () => renderer.setRenderExecutionInput(spec.renderProgram),
        /Phase 7 expected simulatte\.renderExecutionInput\.v1/
      );
      assert.throws(
        () => lab.runPhase7RenderExecution(spec.renderProgram),
        /Phase 7 input expected/
      );
      assert.throws(
        () => renderer.setRenderExecutionInput({
          ...lab.createRenderExecutionInput(spec, null, canvas),
          inputSchema: 'simulatte.phase5.output.v2',
        }),
        /Phase 7 expected inputSchema simulatte\.phase6\.output\.v2/
      );
      renderer.setRenderExecutionInput(lab.createRenderExecutionInput(spec, null, canvas));
      assert.equal(canvas.dataset.phase7Input, 'simulatte.renderExecutionInput.v1');
      assert.equal(canvas.dataset.renderExecutionInput, 'simulatte.renderExecutionInput.v1');
      assert.equal(canvas.dataset.phase7SceneRenderPacketInput, 'simulatte.sceneRenderPacket.v1');
      assert.equal(canvas.dataset.phase7RenderData, 'simulatte.phase7.compactRenderData.v1');
      assert.equal(canvas.dataset.phase7RenderPath, 'storage-scene-instances-with-uniform-fallback');
      assert.match(canvas.dataset.sceneRenderPacket || '', /simulatte\.sceneRenderPacket\.v1/);
      assert.ok(Number(canvas.dataset.sceneRenderEntityCount) > 0, `${prompt} should report packet entity count`);
      assert.ok(Number(canvas.dataset.sceneRenderDrawCount) > 0, `${prompt} should compile compact draw rows`);
      assert.equal(canvas.dataset.webgpuSceneInstanceCapacity, '32');
      assert.equal(renderer.renderData.sceneInstanceCapacity, 32);
      assert.equal(renderer.renderData.sceneInstanceCount, Number(canvas.dataset.sceneRenderDrawCount));
      assert.equal(renderer.renderData.sceneInstanceCount, Number(canvas.dataset.webgpuSceneInstanceCount));
      assert.match(canvas.dataset.sceneRenderSpatialHash || '', /^[0-9a-f]{8}$/);
      assert.match(canvas.dataset.phase7RenderDataKey || '', /^[a-z0-9-]+:\d+:\d+:\d+:[0-9a-f]{8}$/);
      assert.match(canvas.dataset.sceneObjectUniforms || '', /@/, `${prompt} should pack scene object uniforms`);
      assert.match(canvas.dataset.sceneObjectIdentities || '', /@/, `${prompt} should report packed scene object identities`);
      assert.equal(renderer.renderData.drawCount, Number(canvas.dataset.sceneRenderDrawCount));
      const renderData = renderer.renderData;
      const renderDataKey = canvas.dataset.phase7RenderDataKey;
      renderer.setRenderExecutionInput(lab.createRenderExecutionInput(spec, { fields: { heat: 0.7 } }, canvas));
      assert.equal(renderer.renderData, renderData, `${prompt} should reuse compact render data when only simulation state changes`);
      assert.equal(canvas.dataset.phase7RenderDataKey, renderDataKey);
      assert.equal(renderer.renderExecutionInput.simulationState.fields.heat, 0.7);
      const summary = canvas.dataset.visualIrLayers || '';
      for (const token of expected) assert.match(summary, new RegExp(`${token}:`), `${prompt} should include ${token}`);
      for (const token of rejected) assert.doesNotMatch(summary, new RegExp(`${token}:`), `${prompt} should not include ${token}`);
      const sceneMix = canvas.dataset.sceneMix || '';
      for (const token of sceneMixExpected || []) assert.match(sceneMix, new RegExp(`${token}:`), `${prompt} scene mix should include ${token}`);
      for (const token of sceneMixRejected || []) assert.doesNotMatch(sceneMix, new RegExp(`${token}:`), `${prompt} scene mix should not include ${token}`);
      if (/graph|queue|network/.test(prompt)) {
        const networkEntities = packet.entities.filter((entity) => (
          entity.layerSlot === 'node-graph' || entity.layerSlot === 'network-flow'
        ));
        assert.ok(networkEntities.length > 0, `${prompt} should compile network entities`);
        assert.ok(
          networkEntities.every((entity) => entity.identity.category === 'network'),
          `${prompt} network packet entities should keep network identity`
        );
        assert.ok(
          networkEntities.every((entity) => entity.identity.type !== 'water'),
          `${prompt} network packet entities should not be typed as water`
        );
        assert.ok(
          networkEntities.every((entity) => entity.material.kind !== 'fluid' && entity.material.id !== 'water'),
          `${prompt} network packet entities should not use water/fluid materials`
        );
      }
    }
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
});

test('WebGPU phase 8 reads back obligation pixels from the rendered texture', async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousGpuBufferUsage = Object.getOwnPropertyDescriptor(globalThis, 'GPUBufferUsage');
  const previousGpuShaderStage = Object.getOwnPropertyDescriptor(globalThis, 'GPUShaderStage');
  const previousGpuTextureUsage = Object.getOwnPropertyDescriptor(globalThis, 'GPUTextureUsage');
  const previousGpuMapMode = Object.getOwnPropertyDescriptor(globalThis, 'GPUMapMode');
  const copyCalls = [];
  let readbackRgba = [250, 250, 255, 255];
  let configureDescriptor = null;

  function restore(name, descriptor) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }

  function fakeBuffer(size) {
    const data = new Uint8Array(size);
    return {
      data,
      mapAsync: async () => {},
      getMappedRange: () => data.buffer,
      unmap: () => {},
      destroy: () => {},
    };
  }

  const fakeDevice = {
    lost: new Promise(() => {}),
    addEventListener: () => {},
    pushErrorScope: () => {},
    popErrorScope: async () => null,
    createBuffer: ({ size }) => fakeBuffer(size),
    createBindGroupLayout: () => ({}),
    createShaderModule: () => ({}),
    createPipelineLayout: () => ({}),
    createRenderPipeline: () => ({}),
    createBindGroup: () => ({}),
    createComputePipeline: () => ({}),
    createCommandEncoder: () => ({
      beginComputePass: () => ({
        setPipeline: () => {},
        setBindGroup: () => {},
        dispatchWorkgroups: () => {},
        end: () => {},
      }),
      beginRenderPass: () => ({
        setPipeline: () => {},
        setBindGroup: () => {},
        drawIndirect: () => {},
        draw: () => {},
        end: () => {},
      }),
      copyTextureToBuffer: (_source, destination) => {
        copyCalls.push(destination);
        destination.buffer.data.set(readbackRgba, destination.offset || 0);
      },
      finish: () => ({}),
    }),
    queue: {
      writeBuffer: () => {},
      submit: () => {},
      onSubmittedWorkDone: async () => {},
    },
  };

  Object.defineProperty(globalThis, 'GPUBufferUsage', {
    value: { UNIFORM: 1, COPY_DST: 2, STORAGE: 4, COPY_SRC: 8, INDIRECT: 16, MAP_READ: 32 },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'GPUShaderStage', {
    value: { FRAGMENT: 1, COMPUTE: 2 },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'GPUTextureUsage', {
    value: { COPY_SRC: 1, RENDER_ATTACHMENT: 16 },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'GPUMapMode', {
    value: { READ: 1 },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    value: { devicePixelRatio: 1 },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      gpu: {
        getPreferredCanvasFormat: () => 'rgba8unorm',
        requestAdapter: async () => ({
          features: new Set(),
          requestDevice: async () => fakeDevice,
        }),
      },
    },
    configurable: true,
  });

  try {
    const context = {
      configure(descriptor) {
        configureDescriptor = descriptor;
      },
      getCurrentTexture: () => ({
        createView: () => ({}),
      }),
    };
    const canvas = {
      dataset: {},
      width: 640,
      height: 360,
      getBoundingClientRect: () => ({ width: 640, height: 360 }),
      getContext: () => context,
    };
    const renderer = webgpuRenderer.create(canvas);
    assert.ok(renderer);
    await renderer.initPromise;
    assert.equal(renderer.isReady(), true);
    assert.equal(configureDescriptor.usage & GPUTextureUsage.COPY_SRC, GPUTextureUsage.COPY_SRC);

    const spec = lab.createSpecFromPrompt('dogs and cats swimming in a lake', {
      allowPrototypeFallback: true,
    });
    const renderExecutionInput = lab.createRenderExecutionInput(spec, { t: 0 }, canvas);
    renderer.setRenderExecutionInput(renderExecutionInput);
    assert.equal(renderer.renderData.requireLivePixelSamples, true);
    assert.equal(renderer.render(renderExecutionInput, 16), true);
    assert.ok(copyCalls.length > 0);
    assert.ok(copyCalls.every((call) => call.bytesPerRow === 256));
    assert.equal(renderer.phase7Output.artifact.renderExecution.pixelAudit.status, 'fail');

    await renderer.pendingPixelReadbackPromise;
    const failedAudit = renderer.phase7Output.artifact.renderExecution.pixelAudit;

    assert.equal(failedAudit.status, 'fail');
    assert.equal(failedAudit.method, 'webgpu-live-pixel-samples');
    assert.equal(failedAudit.livePixelAudit.required, true);
    assert.equal(failedAudit.livePixelAudit.visibleSampleCount, 0);
    assert.equal(canvas.dataset.phase7PixelReadback, 'pass');
    assert.equal(canvas.dataset.phase7PixelProofStatus, 'fail');
    assert.equal(renderer.renderData.livePixelSamplesStatus, 'fail');

    readbackRgba = [44, 134, 218, 255];
    assert.equal(renderer.render(renderExecutionInput, 32), true);
    await renderer.pendingPixelReadbackPromise;
    const audit = renderer.phase7Output.artifact.renderExecution.pixelAudit;
    const sampledIds = audit.livePixelAudit.sampledObligationIds;

    assert.equal(audit.status, 'pass');
    assert.equal(audit.method, 'webgpu-live-pixel-samples');
    assert.equal(audit.livePixelAudit.required, true);
    assert.ok(sampledIds.includes('visual:wake-ripples'));
    assert.ok(sampledIds.includes('visual:partial-submersion'));
    assert.equal(canvas.dataset.phase7PixelReadback, 'pass');
    assert.equal(canvas.dataset.phase7PixelProofStatus, 'pass');
    assert.equal(renderer.lastPixelReadbackReceipt.status, 'pass');
  } finally {
    restore('navigator', previousNavigator);
    restore('window', previousWindow);
    restore('GPUBufferUsage', previousGpuBufferUsage);
    restore('GPUShaderStage', previousGpuShaderStage);
    restore('GPUTextureUsage', previousGpuTextureUsage);
    restore('GPUMapMode', previousGpuMapMode);
  }
});

test('solver registry delegates executable operator steps to solver modules', () => {
  const registry = solverRegistry.createSolverRegistry();
  const operator = registry.operatorFor('advection');

  assert.equal(typeof advectionSolver.step, 'function');
  assert.equal(operator.step, advectionSolver.step);
});

test('primitive retrieval uses catalog retrievability policy without hardcoded exclusions', () => {
  assert.equal(lab.isRetrievablePrimitive('energy-ledger'), false);
  assert.ok(!lab.rankPhysicalPrimitives('energy ledger conservation accounting', { max: 32 })
    .some((primitive) => primitive.id === 'energy-ledger'));

  const catalogSource = runtimeSourceFromFile(
    path.join(__dirname, '..', 'public', 'pipeline', 'phase-05-simulation', 'simulatte-physics-catalog.js')
  );
  assert.doesNotMatch(catalogSource, /primitive\.id !== 'energy-ledger'/);
  assert.match(catalogSource, /\.filter\(\(primitive\) => isRetrievablePrimitive\(primitive\)\)/);
});
