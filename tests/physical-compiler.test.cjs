const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const lab = require('../public/blank/app/simulation/simulation-lab.js');
const compositionGraph = require('../public/blank/pipeline/phase-06-visual/simulatte-composition-graph.js');
const solverRegistry = require('../public/blank/pipeline/phase-05-simulation/simulatte-solver-registry.js');
const solverCompiler = require('../public/blank/pipeline/phase-05-simulation/simulatte-solver-compiler.js');
const advectionSolver = require('../public/blank/pipeline/phase-05-simulation/solvers/simulatte-solver-advection.js');
const depositionSolver = require('../public/blank/pipeline/phase-05-simulation/solvers/simulatte-solver-particle-deposition.js');
const webgpuRenderer = require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');
require('../public/blank/pipeline/phase-08-scene-proof/simulatte-scene-proof.js');
const universeParser = require('../public/blank/pipeline/phase-02-language/simulatte-universe-parser.js');
const grounderGraph = require('../public/blank/pipeline/phase-04-grounded-intent/simulatte-universe-grounder-graph.js');
require('../public/blank/pipeline/phase-03-retrieval/simulatte-intent-embedder.js');
const webgpuRendererScope = globalThis.__SimulatteWebGpuRendererRefactorScope;
const compositionGraphScope = globalThis.__SimulatteCompositionGraphRefactorScope;
const intentEmbedderScope = globalThis.__SimulatteIntentEmbedderRefactorScope;

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

test('prompt compile reports each real compiler task from zero through one hundred', () => {
  const events = [];
  lab.createSpecFromPrompt('dogs and cats swimming in a lake', {
    allowPrototypeFallback: true,
    onPhaseProgress(event) {
      events.push(event);
    },
  });

  const stages = ['language', 'retrieval-start', 'grounding', 'simulation', 'visual'];
  assert.deepEqual(events.map((event) => event.stage), stages.flatMap((stage) => [stage, stage]));
  for (const stage of stages) {
    const taskEvents = events.filter((event) => event.stage === stage);
    assert.deepEqual(taskEvents.map((event) => event.taskPercent), [0, 100]);
    assert.ok(taskEvents.every((event) => event.progressScope === 'task'));
  }
});

test('pixel proof samples spatial fields across their domain instead of only at center', () => {
  const field = {
    packetKind: 'field',
    domain: { kind: 'graph-field', bounds: [0.08, 0.12, 0.84, 0.76] },
  };
  const first = webgpuRendererScope.phase7DrawableSamplePoint(field, 0, 2);
  const second = webgpuRendererScope.phase7DrawableSamplePoint(field, 1, 2);
  const entity = webgpuRendererScope.phase7DrawableSamplePoint({
    packetKind: 'entity',
    domain: { kind: 'object', bounds: [0.08, 0.12, 0.84, 0.76] },
  }, 0, 1);

  assert.notDeepEqual(first, second);
  assert.notDeepEqual(first, { x: 0.5, y: 0.5 });
  assert.deepEqual(entity, { x: 0.5, y: 0.5 });
});

test('prompt compiles through parse, universe graph, PhysicsIR, solver graph, and render IR', () => {
  const spec = lab.createSpecFromPrompt('lava spins a turbine near an ice castle wall');

  assert.equal(spec.promptParse.schema, 'simulatte.promptParse.v1');
  assert.equal(spec.universeGraph.schema, 'simulatte.universeGraph.v1');
  assert.equal(spec.physicsIR.schema, 'simulatte.physicalIR.v1');
  assert.equal(spec.validationReceipt.schema, 'simulatte.validationReceipt.v1');
  assert.equal(spec.solverGraph.schema, 'simulatte.solverGraph.v1');
  assert.equal(spec.renderIR.schema, 'simulatte.renderIR.v1');

  assert.ok(spec.universeGraph.nodes.some((node) => /lava/.test(node.canonicalId)));
  assert.ok(spec.universeGraph.nodes.some((node) => /turbine/.test(node.canonicalId)));
  assert.ok(spec.universeGraph.nodes.some((node) => /(?:^|[.-])ice$/.test(node.canonicalId)));
  assert.ok(spec.universeGraph.nodes.some((node) => /castle[-_]wall$/.test(node.canonicalId)));
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

test('Phase 4 carries causal rule identity into connected lava heat and ice phase inference', () => {
  const spec = lab.createSpecFromPrompt('lava spins a turbine near an ice castle wall', {
    allowPrototypeFallback: true,
  });
  const upstream = spec.phaseArtifacts.phase3.artifact.activationCloud.groundingEvidence
    .universeGraphCandidates.intentBrief.causalGraph;
  const carried = spec.phaseArtifacts.phase4.artifact.groundedIntent.acceptedGraph.intentBrief.causalGraph;
  const projection = (rows) => rows.map((row) => ({
    id: row.id,
    ruleId: row.ruleId,
    sourceRef: row.sourceRef,
    targetRef: row.targetRef,
    evidence: row.evidence,
    derivedFromEdgeId: row.derivedFromEdgeId || '',
  }));
  const inferredEdges = spec.universeGraph.edges.filter((edge) => (
    edge.provenance?.inferenceMode === 'causal-rule-connected-proximity'
  ));
  const heat = inferredEdges.find((edge) => edge.operatorType === 'heat_transfer');
  const phase = inferredEdges.find((edge) => edge.operatorType === 'phase_transition');

  assert.deepEqual(projection(carried), projection(upstream));
  assert.equal(inferredEdges.length, 2);
  assert.deepEqual(heat.provenance.pathEdgeIds, ['edge1', 'edge2', 'edge3']);
  assert.equal(heat.provenance.causalRuleId, 'causal.lava-heats-rain');
  assert.equal(heat.provenance.targetEvidenceNodeId, 'material-ice');
  assert.equal(phase.provenance.causalRuleId, 'causal.heating-melts-ice');
  assert.equal(phase.provenance.derivedFromEdgeId, 'causal.lava-heats-rain.1');
  for (const type of ['heat_transfer', 'phase_transition']) {
    const operator = spec.physicsIR.operators.find((row) => row.type === type);
    assert.ok(operator);
    assert.equal(operator.receipt.sourceEdgeId,
      inferredEdges.find((edge) => edge.operatorType === type).id);
    assert.equal(operator.receipt.inferenceProvenance.causalRuleId,
      inferredEdges.find((edge) => edge.operatorType === type).provenance.causalRuleId);
  }

  const control = lab.createSpecFromPrompt('wooden stool near an ice wall', {
    allowPrototypeFallback: true,
  });
  assert.equal(control.universeGraph.edges.some((edge) => edge.inferred), false);
  assert.equal(control.physicsIR.operators.some((operator) => (
    ['heat_transfer', 'phase_transition'].includes(operator.type)
  )), false);
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
    relation.id === 'relation:entity-turbine:rotate:world' &&
    relation.kind === 'agent-action' &&
    relation.target === ''
  )));
  assert.ok(queryPlan.slots.every((slot) => (
    !String(slot.entryId || '').includes('medium:water') &&
    !(slot.queries || []).some((query) => /medium:water/.test(query.text || ''))
  )));
});

test('Phase 2 marks typed relations as local evidence instead of requesting model identity work', () => {
  const spec = lab.createSpecFromPrompt('an octopus holding a glass teapot', {
    allowPrototypeFallback: true,
  });
  const relationSlots = spec.phaseArtifacts.phase2.artifact.queryPlan.slots
    .filter((slot) => slot.slotRole === 'relation');
  const holding = relationSlots.find((slot) => slot.process === 'holding');
  const material = relationSlots.find((slot) => slot.process === 'material_assignment');

  assert.ok(holding);
  assert.ok(material);
  assert.ok(relationSlots.every((slot) => slot.modelEvidenceRequired === false));
  assert.ok(relationSlots.every((slot) => slot.localEvidenceReason === 'phase2-typed-relation'));
});

test('Phase 2 promotes only syntactic term participants to required canonical entities', () => {
  const cases = [
    ['purple violin on a wooden stool', 'violin', 'stool'],
    ['yellow excavator beside a glass greenhouse', 'excavator', 'greenhouse'],
    ['an octopus holding a teapot', 'octopus', 'teapot'],
  ];

  for (const [prompt, subjectLabel, objectLabel] of cases) {
    const phase2 = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true })
      .phaseArtifacts.phase2.artifact;
    const graph = phase2.sceneLanguageGraph;
    const participantLabels = [subjectLabel, objectLabel];
    for (const label of participantLabels) {
      const span = phase2.languageGraph.spans.find((row) => row.text === label);
      const identityId = `entity:${label}`;
      const identities = graph.entities.filter((row) => row.id === identityId);
      assert.equal(identities.length, 1, `${label} has one canonical entity identity`);
      assert.equal(identities[0].required, true);
      assert.deepEqual(identities[0].sourceSpanIds, [span.id]);
      assert.equal(graph.concepts.some((row) => row.sourceSpanIds.includes(span.id)), false);
      assert.ok(phase2.queryPlan.slots.some((slot) => (
        slot.entryId === identityId && slot.slotRole === 'object' && slot.required === true
      )));
    }
    assert.ok(graph.relations.some((relation) => (
      relation.from === `entity:${subjectLabel}` &&
      (relation.to === `entity:${objectLabel}` || relation.target === `entity:${objectLabel}`)
    )), `${prompt} relation uses the same canonical participant identities`);
  }

  const control = lab.createSpecFromPrompt('quiet amber texture behind atmosphere', {
    allowPrototypeFallback: true,
  }).phaseArtifacts.phase2.artifact.sceneLanguageGraph;
  assert.deepEqual(control.entities.map((row) => row.id), ['entity:texture', 'entity:atmosphere']);
  assert.deepEqual(control.concepts.map((row) => [row.id, row.required]), [
    ['concept:quiet', false],
    ['concept:amber', false],
  ]);
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
    relation.id === 'relation:entity-dog:swimming:environment-lake' &&
    relation.from === 'entity:dog' &&
    relation.target === 'environment:lake'
  )));

  const laboratory = universeParser.parsePrompt(
    'phase study in a generic lab with no qubits or quantum hardware'
  );
  const negatedIds = new Set(laboratory.spans
    .filter((span) => ['qubits', 'quantum', 'hardware'].includes(span.text))
    .map((span) => span.id));
  assert.ok(negatedIds.size === 3);
  assert.equal(laboratory.clauses.some((clause) => (
    negatedIds.has(clause.subjectSpanId) || negatedIds.has(clause.objectSpanId)
  )), false);
});

test('Phase 2 extends coordinated negation and promotes syntactic process terms', () => {
  const negated = lab.createSpecFromPrompt('phase study in a generic lab with no qubits or quantum hardware', {
    allowPrototypeFallback: true,
  }).phaseArtifacts.phase2.artifact;
  assert.equal(negated.queryPlan.slots.some((slot) => slot.entryId === 'concept:hardware'), false);

  for (const [prompt, process] of [
    ['gut microbiome colonies exchanging metabolites', 'exchanging'],
    ['warehouse fire and renderer layers soot', 'layers'],
    ['planetary rings shepherd moon', 'shepherd'],
  ]) {
    const parsed = universeParser.parsePrompt(prompt);
    assert.equal(parsed.spans.find((span) => span.text === process).kind, 'process');
    assert.ok(parsed.clauses.some((clause) => clause.verbSpanId === parsed.spans.find((span) => span.text === process).id));
  }

  const microbiome = universeParser.parsePrompt('gut microbiome colonies exchanging metabolites');
  assert.ok(microbiome.spans.some((span) => (
    span.text === 'gut microbiome colonies' && span.visualArchetype === 'microbiome'
  )));
  assert.equal(microbiome.spans.some((span) => span.text === 'gut microbiome'), false);
  assert.equal(microbiome.spans.some((span) => span.text === 'microbiome colonies'), false);
  const metabolites = microbiome.spans.find((span) => span.text === 'metabolites');
  assert.equal(metabolites.localGeometryGrammarId, 'object-grammar.particle-cloud');

  const pressuredMicrobiome = universeParser.parsePrompt(
    'gut microbiome colonies exchanging metabolites through intestinal folds under immune pressure'
  );
  assert.equal(pressuredMicrobiome.spans.some((span) => (
    span.kind === 'process' && span.text === 'folds'
  )), false);
  assert.equal(pressuredMicrobiome.spans.some((span) => (
    span.kind === 'term' && span.text === 'immune'
  )), false);
  assert.ok(pressuredMicrobiome.spans.some((span) => (
    span.kind === 'observable' && span.text === 'immune pressure'
  )));
  assert.equal(pressuredMicrobiome.clauses.some((clause) => (
    pressuredMicrobiome.spans.find((span) => span.id === clause.objectSpanId)?.text === 'immune'
  )), false);

  const pluralObject = universeParser.parsePrompt(
    'submarine city under a storm with turbines and glowing algae'
  );
  assert.equal(pluralObject.spans.find((span) => span.text === 'turbines').kind, 'entity');
});

test('Phase 2 keeps comma-delimited fuel nouns out of the process ledger', () => {
  const prompt = 'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall';
  const parsed = universeParser.parsePrompt(prompt);
  const biomass = parsed.spans.find((span) => span.text === 'biomass');
  const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
  const phase2Ledger = spec.phaseArtifacts.phase2.artifact.compositionLedger;
  const combustionEdges = spec.universeGraph.edges.filter((edge) => edge.processId === 'combustion');

  assert.equal(biomass.kind, 'material');
  assert.equal(biomass.semanticRole, 'fuel-material');
  assert.equal(parsed.spans.some((span) => span.kind === 'process' && span.text === 'biomass'), false);
  assert.equal(parsed.clauses.some((clause) => clause.process === 'biomass'), false);
  assert.equal(phase2Ledger.obligations.some((row) => row.id === 'action:biomass'), false);
  assert.equal(spec.universeGraph.edges.some((edge) => edge.processId === 'biomass'), false);
  assert.equal(combustionEdges.length, 2);
  assert.ok(combustionEdges.every((edge) => (
    edge.type === 'combustion' &&
    edge.operatorType === 'combustion' &&
    edge.evidence.includes('phase4-grounded-combustion') &&
    edge.provenance?.sourcePhase === 4
  )));
});

test('Phase 4 activates combustion for each grounded fuel only when prompt-owned fire evidence exists', () => {
  const positive = lab.createSpecFromPrompt('forest fire with wood biomass and straw', {
    allowPrototypeFallback: true,
  });
  const combustionEdges = positive.universeGraph.edges.filter((edge) => edge.processId === 'combustion');
  const combustionOperators = positive.physicsIR.operators.filter((operator) => operator.type === 'combustion');
  const fuelSpanIds = new Set(positive.promptParse.spans
    .filter((span) => span.semanticRole === 'fuel-material')
    .map((span) => span.id));

  assert.equal(combustionEdges.length, fuelSpanIds.size);
  assert.equal(combustionOperators.length, fuelSpanIds.size);
  assert.deepEqual(new Set(combustionEdges.map((edge) => edge.provenance.fuelNodeId)),
    new Set(combustionOperators.map((operator) => operator.entityId)));

  for (const prompt of [
    'forest with wood biomass and straw',
    'wood biomass sample on a tray',
    'thermal lava and steam flow through rock',
    'wooden stool beside a fire',
    'straw robot in front of a flame',
  ]) {
    const control = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
    assert.equal(control.universeGraph.edges.some((edge) => edge.processId === 'combustion'), false, prompt);
    assert.equal(control.physicsIR.operators.some((operator) => operator.type === 'combustion'), false, prompt);
  }

  for (const prompt of ['wood burns in a fire', 'flame burns straw']) {
    const explicit = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
    const edges = explicit.universeGraph.edges.filter((row) => row.processId === 'combustion');
    const operators = explicit.physicsIR.operators.filter((row) => row.type === 'combustion');
    const edge = edges[0];
    assert.ok(edge, prompt);
    assert.equal(edges.length, 1, prompt);
    assert.equal(operators.length, 1, prompt);
    assert.equal(edge.type, 'combustion', prompt);
    assert.equal(edge.operatorType, 'combustion', prompt);
    assert.equal(edge.from, edge.provenance.fuelNodeId, prompt);
    assert.equal(edge.to, edge.provenance.fireNodeId, prompt);
    assert.equal(edge.provenance.relationMode, 'explicit-process-clause', prompt);
    assert.equal(edge.provenance.sourceVerbSpanId,
      explicit.promptParse.spans.find((span) => /burn/.test(span.text)).id, prompt);
  }
});

test('typed flow domains separate queue traffic from coolant transport', () => {
  const queue = lab.createSpecFromPrompt(
    'graph of nodes edges and flows through a queue network',
    { allowPrototypeFallback: true }
  );
  const dataCenter = lab.createSpecFromPrompt(
    'data center cooling loop where hot server racks increase coolant flow and controller throttles fan speed',
    { allowPrototypeFallback: true }
  );
  const airQuality = lab.createSpecFromPrompt(
    'air quality urban valley particulate dispersion through buildings',
    { allowPrototypeFallback: true }
  );
  const queueProcess = queue.promptParse.spans.find((span) => span.text === 'flows');
  const queueDomain = queue.physicsIR.domains.find((domain) => /queue-network/.test(domain.entityId));
  const coolantDomain = dataCenter.physicsIR.domains.find((domain) => /coolant-flow/.test(domain.entityId));

  assert.equal(queue.promptParse.spans.find((span) => span.text === 'nodes').kind, 'entity');
  assert.equal(queueProcess.kind, 'process');
  assert.equal(queueDomain.kind, 'network');
  assert.deepEqual(queue.physicsIR.operators.map((operator) => operator.type), ['network_flow']);
  assert.ok(queue.renderProgram.visualIR.graphicsAtoms.mappings.some((row) => (
    row.id === 'visual.operator.network-flow.v1'
  )));
  assert.equal(coolantDomain.kind, 'fluid');
  assert.ok(dataCenter.physicsIR.operators.some((operator) => (
    operator.type === 'advection' && operator.entityId === coolantDomain.entityId
  )));
  const networkOperators = dataCenter.physicsIR.operators.filter((operator) => operator.type === 'network_flow');
  assert.equal(networkOperators.length, 1);
  assert.equal(networkOperators[0].entityId,
    dataCenter.physicsIR.domains.find((domain) => /controller/.test(domain.entityId)).entityId);
  assert.ok(airQuality.physicsIR.operators.some((operator) => operator.type === 'advection'));
  assert.ok(airQuality.renderProgram.visualIR.graphicsAtoms.mappings.some((row) => (
    row.id === 'visual.operator.fluid-advection.v1'
  )));
});

test('typed optical rules activate executable lens and thin-film phase fields without noun shortcuts', () => {
  const optics = lab.createSpecFromPrompt(
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor',
    { allowPrototypeFallback: true }
  );
  const thinFilm = lab.createSpecFromPrompt(
    'soap thin film with air bubbles in wire loops and iridescent interference',
    { allowPrototypeFallback: true }
  );
  const mappings = (spec) => spec.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);

  assert.equal(optics.promptParse.spans.some((span) => (
    span.kind === 'process' && span.text === 'optics'
  )), false);
  assert.ok(optics.universeGraph.edges.some((edge) => (
    edge.operatorType === 'wave_field' && edge.provenance?.causalRuleId === 'causal.lens-refracts-beam'
  )));
  assert.ok(optics.physicsIR.operators.some((operator) => operator.type === 'wave_field'));
  assert.equal(optics.physicsIR.operators.find((operator) => operator.type === 'wave_field')
    .receipt.inferenceProvenance.causalRuleId, 'causal.lens-refracts-beam');
  assert.equal(optics.solverGraph.steps.find((step) => step.operatorType === 'wave_field')
    .receipt.inferenceProvenance.causalRuleId, 'causal.lens-refracts-beam');
  assert.ok(mappings(optics).includes('visual.operator.optical-ray.v1'));
  assert.ok(thinFilm.universeGraph.edges.some((edge) => (
    edge.operatorType === 'wave_field' &&
    edge.provenance?.causalRuleId === 'causal.thin-film-forms-interference'
  )));
  assert.ok(thinFilm.physicsIR.operators.some((operator) => operator.type === 'wave_field'));
  assert.equal(thinFilm.physicsIR.operators.find((operator) => operator.type === 'wave_field')
    .receipt.inferenceProvenance.causalRuleId, 'causal.thin-film-forms-interference');
  assert.equal(thinFilm.solverGraph.steps.find((step) => step.operatorType === 'wave_field')
    .receipt.inferenceProvenance.causalRuleId, 'causal.thin-film-forms-interference');
  assert.ok(mappings(thinFilm).includes('visual.operator.thin-film-interference.v1'));

  for (const prompt of [
    'soap bubbles in a wire basket',
    'soap thin film with air bubbles in wire loops',
    'wooden bench with a lamp and glass cup',
    'glass lens and wooden stool',
  ]) {
    const control = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
    assert.equal(control.physicsIR.operators.some((operator) => operator.type === 'wave_field'), false, prompt);
    assert.equal(mappings(control).some((id) => (
      ['visual.operator.optical-ray.v1', 'visual.operator.thin-film-interference.v1'].includes(id)
    )), false, prompt);
  }
  const meltingFilm = lab.createSpecFromPrompt('thin film melts ice', { allowPrototypeFallback: true });
  assert.ok(meltingFilm.physicsIR.operators.some((operator) => operator.type === 'phase_transition'));
  assert.equal(mappings(meltingFilm).includes('visual.operator.thin-film-interference.v1'), false);
});

test('particle measurement paths lower two receipt-bound readouts and reject noun co-occurrence', () => {
  const spec = lab.createSpecFromPrompt(
    'particle collider muon tracks through detector slice with calorimeter pulses',
    { allowPrototypeFallback: true }
  );
  const pulseSpan = spec.promptParse.spans.find((span) => span.text === 'calorimeter pulses');
  const causalEdges = spec.universeGraph.edges.filter((edge) => edge.operatorType === 'derive_readout');
  const operators = spec.physicsIR.operators.filter((operator) => operator.type === 'derive_readout');
  const steps = spec.solverGraph.steps.filter((step) => step.operatorType === 'derive_readout');
  const signalFields = spec.physicsIR.stateFields.filter((field) => field.name === 'signal');
  const ruleIds = new Set(causalEdges.map((edge) => edge.provenance?.causalRuleId));
  const mappingIds = spec.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);

  assert.equal(pulseSpan.kind, 'observable');
  assert.equal(pulseSpan.semanticRole, 'measurement-signal');
  assert.equal(pulseSpan.stateBinding, 'signal');
  assert.deepEqual(ruleIds, new Set([
    'causal.particle-track-produces-detector-readout',
    'causal.energy-deposition-produces-calorimeter-pulse',
  ]));
  assert.equal(causalEdges.length, 2);
  assert.equal(operators.length, 2);
  assert.equal(steps.length, 2);
  assert.equal(signalFields.length, 2);
  for (const edge of causalEdges) {
    assert.equal(edge.provenance.inferenceMode, 'causal-rule-direct-spatial');
    assert.equal(edge.provenance.pathEdgeIds.length, 1);
    const operator = operators.find((row) => row.receipt?.sourceEdgeId === edge.id);
    const step = steps.find((row) => row.receipt?.sourceEdgeId === edge.id);
    assert.ok(operator, `missing operator receipt for ${edge.id}`);
    assert.ok(step, `missing solver receipt for ${edge.id}`);
    assert.equal(operator.receipt.inferenceProvenance.causalRuleId, edge.provenance.causalRuleId);
    assert.deepEqual(step.receipt.producedChannels, operator.writes);
  }
  const initial = solverCompiler.createSolverState(spec.solverGraph);
  const stepped = solverCompiler.stepSolverState(initial, spec.solverGraph, 0.05);
  for (const field of signalFields) {
    assert.notEqual(stepped.channels[field.id], initial.channels[field.id]);
    assert.ok(stepped.channels[field.id] >= 0 && stepped.channels[field.id] <= 1);
  }
  assert.ok(mappingIds.includes('visual.operator.particle-track-detector.v1'));
  assert.ok(mappingIds.includes('visual.operator.instrument-readout.v1'));

  for (const prompt of [
    'muon tracks beside a detector slice',
    'particle sculpture beside a calorimeter',
    'muon tracks painted on a wall',
    'calorimeter on a lab bench',
  ]) {
    const control = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
    assert.equal(control.physicsIR.operators.some((row) => row.type === 'derive_readout'), false, prompt);
    assert.equal(control.solverGraph.steps.some((row) => row.operatorType === 'derive_readout'), false, prompt);
    assert.equal(control.renderProgram.visualIR.graphicsAtoms.mappings.some((row) => (
      ['visual.operator.particle-track-detector.v1', 'visual.operator.instrument-readout.v1'].includes(row.id)
    )), false, prompt);
  }
});

test('causal grounding policies admit direct clauses and reject disconnected noun pairs', () => {
  for (const [prompt, operatorType] of [
    ['laser heats metal', 'heat_transfer'],
    ['fire melts ice', 'phase_transition'],
  ]) {
    const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
    assert.ok(spec.universeGraph.edges.some((edge) => edge.processId === operatorType), prompt);
    assert.ok(spec.physicsIR.operators.some((operator) => operator.type === operatorType), prompt);
  }
  const laser = lab.createSpecFromPrompt('laser heats metal', { allowPrototypeFallback: true });
  const heatOperators = laser.physicsIR.operators.filter((operator) => operator.type === 'heat_transfer');
  assert.equal(heatOperators.length, 1);
  assert.deepEqual(heatOperators[0].reads, [
    'temperature:primitive-laser-a',
    'temperature:metal',
  ]);
  assert.deepEqual(heatOperators[0].writes, ['temperature:metal']);

  for (const [prompt, blockedTypes] of [
    ['laser beside metal', ['heat_transfer', 'phase_transition']],
    ['speaker, air', ['wave_field']],
  ]) {
    const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
    assert.equal(spec.physicsIR.operators.some((operator) => blockedTypes.includes(operator.type)), false, prompt);
  }
});

test('Phase 2 phrase parser matches multi-word entities across whitespace', () => {
  const parsed = universeParser.parsePrompt('neutrino detector inside a water\n   tank');
  const spanTexts = new Set(parsed.spans.map((span) => span.text));

  assert.ok(spanTexts.has('neutrino detector'));
  assert.ok(spanTexts.has('water\n   tank'));
});

test('Phase 2 spatial clauses use grounded nouns instead of nearby terms or nominal verbs', () => {
  const sourdough = universeParser.parsePrompt(
    'sourdough fermentation gas bubbles growing through a dough matrix with gluten strands'
  );
  const growing = sourdough.spans.find((span) => span.text === 'growing');
  const gasBubbles = sourdough.spans.find((span) => span.text === 'gas bubbles');
  const doughMatrix = sourdough.spans.find((span) => span.text === 'dough matrix');
  const glutenStrands = sourdough.spans.find((span) => span.text === 'gluten strands');
  const through = sourdough.clauses.find((clause) => clause.spatialRelation === 'through');
  const withRelation = sourdough.clauses.find((clause) => clause.spatialRelation === 'with');
  assert.equal(growing.kind, 'process');
  assert.equal(through.subjectSpanId, gasBubbles.id);
  assert.equal(through.verbSpanId, growing.id);
  assert.equal(through.objectSpanId, doughMatrix.id);
  assert.equal(withRelation.subjectSpanId, doughMatrix.id);
  assert.equal(withRelation.objectSpanId, glutenStrands.id);

  const zoning = universeParser.parsePrompt(
    'city zoning shadow allocation between building masses with sunlight volumes'
  );
  const cityZoning = zoning.spans.find((span) => span.text === 'city zoning');
  const buildingMasses = zoning.spans.find((span) => span.text === 'building masses');
  const between = zoning.clauses.find((clause) => clause.spatialRelation === 'between');
  assert.equal(between.subjectSpanId, cityZoning.id);
  assert.equal(between.objectSpanId, buildingMasses.id);

  const fire = universeParser.parsePrompt(
    'warehouse fire with smoke in concrete stairwell and renderer layers soot'
  );
  const spatialTargets = fire.clauses
    .filter((clause) => clause.spatialRelation === 'in')
    .map((clause) => fire.spans.find((span) => span.id === clause.objectSpanId)?.text);
  assert.deepEqual(spatialTargets, ['concrete stairwell']);

  const glacier = universeParser.parsePrompt('glacier calving into fjord with sea ice waves');
  const waveSpans = glacier.spans.filter((span) => span.text === 'waves');
  assert.deepEqual(waveSpans.map((span) => span.kind), ['entity']);

  const dataCenter = universeParser.parsePrompt(
    'edge data center server racks recirculating heat between cooling aisles'
  );
  const center = dataCenter.spans.find((span) => span.text === 'edge data center');
  const racks = dataCenter.spans.find((span) => span.text === 'server racks');
  const containment = dataCenter.clauses.find((clause) => (
    clause.subjectSpanId === racks.id && clause.objectSpanId === center.id &&
    /^data-owned-/.test(clause.relationSource || '')
  ));
  assert.equal(containment.subjectSpanId, racks.id);
  assert.equal(containment.objectSpanId, center.id);
  assert.equal(containment.spatialRelation, 'inside');
  const aisles = dataCenter.spans.find((span) => span.text === 'cooling aisles');
  assert.ok(dataCenter.clauses.some((clause) => (
    clause.relationSource === 'data-owned-container-class' &&
    clause.subjectSpanId === aisles.id && clause.objectSpanId === center.id &&
    clause.spatialRelation === 'inside'
  )));

  const controlledDataCenter = universeParser.parsePrompt(
    'edge data center server racks recirculating heat between cooling aisles under control feedback'
  );
  assert.ok(controlledDataCenter.spans.some((span) => (
    span.kind === 'observable' && span.text === 'control feedback'
  )));
  assert.equal(controlledDataCenter.spans.some((span) => span.text === 'control'), false);
  assert.equal(controlledDataCenter.spans.some((span) => (
    span.kind === 'process' && ['heat', 'cooling'].includes(span.text)
  )), false);
  assert.equal(controlledDataCenter.clauses.some((clause) => (
    clause.spatialRelation === 'under' &&
    controlledDataCenter.spans.find((span) => span.id === clause.objectSpanId)?.text === 'control'
  )), false);

  const adjacentObjects = universeParser.parsePrompt('dogs cats');
  assert.equal(
    adjacentObjects.clauses.some((clause) => clause.relationSource === 'data-owned-compound-containment'),
    false
  );
});

test('Phase 6 renders laboratories as workspaces rather than exterior buildings', () => {
  const packet = lab.createSpecFromPrompt('generic lab', { allowPrototypeFallback: true })
    .renderProgram.visualIR.sceneRenderPacket;
  const laboratory = packet.entities.find((row) => row.identity && row.identity.type === 'laboratory');
  assert.ok(laboratory);
  assert.equal(laboratory.geometry.program.grammarId, 'object-grammar.laboratory');
  assert.ok(laboratory.geometry.program.parts.some((part) => part.id === 'bench-top'));
  assert.ok(laboratory.geometry.program.parts.some((part) => part.id === 'microscope-lens'));
  assert.equal(laboratory.geometry.program.parts.some((part) => part.id === 'roof'), false);
});

test('Phase 6 solved boxes govern packet placement even when an object also owns a motion path', () => {
  const packet = lab.createSpecFromPrompt(
    'edge data center server racks recirculating heat between cooling aisles',
    { allowPrototypeFallback: true }
  ).renderProgram.visualIR.sceneRenderPacket;
  const center = packet.entities.find((row) => row.identity && row.identity.type === 'data-center');
  const racks = packet.entities.find((row) => row.identity && row.identity.type === 'server-racks');
  assert.ok(center);
  assert.ok(racks);
  assert.ok(Array.isArray(racks.transform.path));
  const centerBounds = center.geometry.bounds;
  const rackBounds = racks.geometry.bounds;
  assert.ok(rackBounds[0] >= centerBounds[0] - 0.001);
  assert.ok(rackBounds[1] >= centerBounds[1] - 0.001);
  assert.ok(rackBounds[0] + rackBounds[2] <= centerBounds[0] + centerBounds[2] + 0.001);
  assert.ok(rackBounds[1] + rackBounds[3] <= centerBounds[1] + centerBounds[3] + 0.001);
});

test('Phase 2 keeps an agentive participle attached across spatial furniture phrases', () => {
  const parsed = universeParser.parsePrompt(
    'a person sits in a chair at a table watching a tv inside a building with trees outside'
  );
  const watching = parsed.clauses.find((row) => row.predicate === 'watching');
  const subject = parsed.spans.find((row) => row.id === watching.subjectSpanId);
  const object = parsed.spans.find((row) => row.id === watching.objectSpanId);
  assert.equal(subject.entityClass, 'person');
  assert.equal(object.entityClass, 'television');
});

test('Phase 3 treats a synthesized context phrase as support, not object identity', () => {
  const prompt = 'warehouse fire with smoke';
  const spans = [{ id: 'span.fire', text: 'fire', kind: 'entity' }];
  const modelScope = globalThis.__SimulattePhysicsModelRefactorScope;
  const decision = modelScope.phase3PrimitiveCandidateDecision({
    id: 'rocket-a',
    role: 'rocket',
    phrase: 'fire',
    source: 'embedding-guided-synth-node',
    score: 0.99,
    type: 'assembly',
  }, prompt, spans, [], []);
  const primitiveDecision = modelScope.phase3PrimitiveCandidateDecision({
    id: 'rigid-body',
    role: 'rigid body',
    phrase: 'rocket',
    source: 'embedding-guided-graph-synthesis',
    score: 0.99,
    type: 'physics',
  }, 'rocket launch', [{ id: 'span.rocket', text: 'rocket', kind: 'entity' }], [], []);

  assert.deepEqual(decision, {
    role: 'support',
    matchKind: 'synth-association-support',
    reason: 'synthesized row identity lacks prompt evidence',
  });
  assert.deepEqual(primitiveDecision, {
    role: 'support',
    matchKind: 'synth-primitive-support',
    reason: 'synthesized primitive is implementation support',
  });
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

  for (const id of ['surface-cat-1', 'surface-dog-1', 'lake', 'water']) {
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
  assert.equal(slotById.get('slot.relation.entity-dog_swimming_environment-lake').status, 'preserved');
  assert.equal(slotById.get('slot.relation.entity-cat_swimming_environment-lake').status, 'preserved');
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
  assert.ok(ledgerIds.has('relation:entity-dog:swimming:environment-lake'));
  assert.ok(ledgerIds.has('relation:entity-cat:swimming:environment-lake'));
  assert.ok(ledgerIds.has('visual:wake-ripples'));
  assert.equal(receipt.primitiveCount, retrieval.rankedPrimitives.length);
  assert.equal(receipt.supportPrimitiveCount, retrieval.supportPrimitives.length);
  assert.ok(receipt.rawPrimitiveCount > receipt.primitiveCount);
});

test('qubit readout grounds the typed instrument relation without phase-change or machine-family leakage', () => {
  const spec = lab.createSpecFromPrompt('qubit chip phase readout through microwave resonator', {
    allowPrototypeFallback: true,
  });
  const phase2 = spec.phaseArtifacts.phase2.artifact;
  const phase3 = spec.phaseArtifacts.phase3.artifact.retrievalRerankResult;
  const phase4 = spec.phaseArtifacts.phase4.artifact.groundedIntent;
  const predicates = phase2.languageGraph.predicates || [];
  const spanById = new Map(phase2.languageGraph.spans.map((row) => [row.id, row.text]));
  const candidateIds = new Set((phase3.rankedPrimitives || []).map((row) => row.id || row.primitiveId));
  const groundedText = JSON.stringify((phase4.components || []).filter((row) => row.supportOnly !== true)).toLowerCase();
  const operatorTypes = spec.phaseArtifacts.phase5.artifact.simulationCompile.physicsIR.operators.map((row) => row.type);

  assert.ok(predicates.some((row) => (
    row.process === 'measurement' &&
    /readout/.test(spanById.get(row.verbSpanId) || '') &&
    /qubit chip/.test(spanById.get(row.subjectSpanId) || '') &&
    /microwave resonator/.test(spanById.get(row.objectSpanId) || '') &&
    row.spatialRelation === 'through'
  )));
  assert.ok(Array.from(candidateIds).some((id) => /qubit/.test(id)), 'Phase 3 should keep qubit identity evidence');
  assert.ok(Array.from(candidateIds).some((id) => /microwave-resonator|resonator/.test(id)), 'Phase 3 should keep resonator identity evidence');
  for (const id of [
    'stator-slider',
    'rotor-wheel',
    'solar-panel',
    'motor-load',
    'phase-change-material',
    'phase-change',
    'surface-microwave-1',
  ]) {
    assert.equal(candidateIds.has(id), false, `Phase 3 should reject false literal candidate ${id}`);
  }
  assert.doesNotMatch(groundedText, /stator|rotor|solar panel|motor load|phase change material|household microwave|surface-microwave/);
  assert.ok(operatorTypes.includes('derive_readout'));
  assert.equal(operatorTypes.includes('phase_transition'), false);
  assert.equal(operatorTypes.includes('heat_source'), false);
});

test('Phase 6 applies accepted orbital process motion to every affected prompt entity', () => {
  const spec = lab.createSpecFromPrompt(
    'planetary rings shepherd moon resonance sorting ice boulders into density waves and orbital gaps',
    { allowPrototypeFallback: true }
  );
  const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
  const entitiesByLabel = new Map(packet.entities.map((row) => [row.label, row]));

  for (const label of [
    'planetary rings',
    'shepherd moon',
    'ice boulders',
    'density waves',
    'orbital gaps',
  ]) {
    const entity = entitiesByLabel.get(label);
    assert.ok(entity, `missing planetary render entity ${label}`);
    assert.match(entity.animation.kind, /^(?:phase-propagating-arcs|orbital-drift)$/);
    assert.ok(entity.animation.affects.includes(entity.id));
  }
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

test('grounding rejects associative generated identities lacking prompt evidence', () => {
  const spec = lab.createSpecFromPrompt(
    'water air rock wood metal glass magnetized metal gravity heat diffusion sample tray'
  );
  const graphText = spec.universeGraph.nodes.map((node) => `${node.canonicalId} ${node.id}`).join(' ');
  assert.ok(!/forest/.test(graphText), 'no forest identity for a prompt without forest language');
  assert.ok(spec.universeGraph.nodes.some((node) => /(?:^|\.)material\.wood$/.test(node.canonicalId)));
  assert.ok(spec.universeGraph.nodes.some((node) => /sample[-_]tray$/.test(node.canonicalId || '')));
  assert.equal(spec.renderIR.sceneHint, 'material-tray');
  assert.ok(spec.universeGraph.rejected.some((row) => /identity lacks prompt evidence/.test(row.reason || '')));
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

test('metabolite exchange and soot layering lower into executable behavior evidence', () => {
  const exchange = lab.createSpecFromPrompt(
    'gut microbiome colonies exchanging metabolites through intestinal folds under immune sampling',
    { allowPrototypeFallback: true }
  );
  const layering = lab.createSpecFromPrompt(
    'warehouse fire with smoke in concrete stairwell and renderer layers soot',
    { allowPrototypeFallback: true }
  );
  const exchangeCompile = exchange.phaseArtifacts.phase5.artifact.simulationCompile;
  const layeringCompile = layering.phaseArtifacts.phase5.artifact.simulationCompile;
  const layeringTypes = new Set(layeringCompile.physicsIR.operators.map((row) => row.type));
  const layeringSolverTypes = new Set(layeringCompile.solverGraph.steps.map((row) => row.operatorType));
  const exchangeLost = exchange.phaseArtifacts.phase6.artifact.visualCompile.compositionLedger.obligations
    .filter((row) => row.status === 'lost').map((row) => row.id);
  const layeringLost = layering.phaseArtifacts.phase6.artifact.visualCompile.compositionLedger.obligations
    .filter((row) => row.status === 'lost').map((row) => row.id);

  assert.ok(exchangeCompile.physicsIR.behaviorRelations.some((row) => (
    row.process === 'diffusion' && row.evidence.includes('action:exchanging')
  )));
  assert.equal(exchangeLost.includes('action:exchanging'), false);
  assert.equal(exchangeLost.includes('relation:entity-microbiome-colonies:exchanging:medium-metabolites'), false);
  for (const identityType of ['gut-microbiome-colonies', 'intestinal-folds']) {
    const program = exchange.renderProgram.sceneRenderPacket.entities
      .find((row) => row.identity.type === identityType).geometry.program;
    const fields = program.parts.filter((row) => row.constructionRole === 'field');
    const foreground = program.parts.filter((row) => row.constructionRole !== 'field');
    assert.ok(fields.length > 0 && foreground.length > 0);
    assert.ok(fields.every((row) => row.opacity === 0.2));
    assert.ok(Math.max(...fields.map((row) => row.order)) < Math.min(...foreground.map((row) => row.order)));
  }
  assert.ok(layeringTypes.has('particle_deposition'));
  assert.ok(layeringSolverTypes.has('particle_deposition'));
  assert.equal(layeringLost.includes('action:layers'), false);
  assert.equal(layeringLost.includes('relation:entity-concrete-stairwell:layers:medium-soot-deposit'), false);
  assert.equal(layering.universeGraph.nodes.some((row) => /renderer/.test(row.id)), false);
  assert.equal(layeringCompile.physicsIR.entities.some((row) => /renderer/.test(row.id)), false);
  const layeringEntities = layering.renderProgram.sceneRenderPacket.entities;
  assert.equal(layeringEntities.some((row) => /renderer/.test(row.id)), false);
  assert.equal(layeringEntities.find((row) => row.identity.type === 'warehouse').geometry.program.grammarId,
    'object-grammar.warehouse');
  assert.equal(layeringEntities.find((row) => row.identity.type === 'fire-front').geometry.program.grammarId,
    'object-grammar.fire-front');
  const soot = layeringEntities.find((row) => row.identity.type === 'soot-deposit');
  assert.equal(soot.geometry.program.grammarId, 'object-grammar.soot-deposit');
  assert.ok(soot.layoutRelationRoles.includes('coating:source'));
  const stairwell = layeringEntities.find((row) => row.identity.type === 'concrete-stairwell');
  assert.ok(stairwell.layoutRelationRoles.includes('coating:target'));
  assert.ok(stairwell.layoutRelationRoles.includes('inside:source'));

  const channels = { 'airborneDensity:soot': 0.8, 'depositedMass:soot': 0.2 };
  depositionSolver.step({
    channels,
    dt: 0.5,
    step: {
      inputs: ['airborneDensity:soot', 'depositedMass:soot'],
      outputs: ['airborneDensity:soot', 'depositedMass:soot'],
      params: { rate: 0.5 },
    },
  });
  assert.ok(channels['airborneDensity:soot'] < 0.8);
  assert.ok(channels['depositedMass:soot'] > 0.2);
  assert.equal(Number((channels['airborneDensity:soot'] + channels['depositedMass:soot']).toFixed(6)), 1);
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
  const visualLedger = visualCompile.compositionLedger || {};
  const obligationById = new Map((visualLedger.obligations || []).map((row) => [row.id, row]));
  const lostObligations = (visualLedger.obligations || []).filter((row) => row.status === 'lost');
  const dogEntity = sceneEntities.find((row) => row.identity && row.identity.type === 'dog');
  const catEntity = sceneEntities.find((row) => row.identity && row.identity.type === 'cat');
  const waterEntity = sceneEntities.find((row) => row.identity && row.identity.type === 'water');
  const dogWake = sceneFields.find((row) => row.id === `visual:wake:${dogEntity.id}`);
  const catWake = sceneFields.find((row) => row.id === `visual:wake:${catEntity.id}`);
  const dogSubmersion = sceneEffects.find((row) => row.id === `visual:submersion:${dogEntity.id}`);
  const catSubmersion = sceneEffects.find((row) => row.id === `visual:submersion:${catEntity.id}`);
  const dogSwimPose = sceneEffects.find((row) => row.id === `visual:swim-pose:${dogEntity.id}`);
  const catSwimPose = sceneEffects.find((row) => row.id === `visual:swim-pose:${catEntity.id}`);

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
  assert.ok(behaviorRelations.some((row) => row.agentEntityId === 'prompt-body-dog'));
  assert.ok(behaviorRelations.some((row) => row.agentEntityId === 'prompt-body-cat'));
  assert.ok(renderBehaviors.some((row) => row.physicalRef === 'prompt-body-dog'));
  assert.ok(renderBehaviors.some((row) => row.physicalRef === 'prompt-body-cat'));
  assert.ok(simulationCompile.renderIR.objects.some((row) => row.stateBindings && row.stateBindings.submersion));
  assert.equal(dogEntity.identity.type, 'dog');
  assert.equal(catEntity.identity.type, 'cat');
  assert.equal(dogEntity.geometry.primitive, 'dog-body');
  assert.equal(catEntity.geometry.primitive, 'cat-body');
  assert.equal(sceneEntities.filter((row) => row.identity && row.identity.type === 'dog').length, 1);
  assert.equal(sceneEntities.filter((row) => row.identity && row.identity.type === 'cat').length, 1);
  assert.equal(dogEntity.material.id, 'dog-swim-fur');
  assert.equal(catEntity.material.id, 'cat-swim-fur');
  assert.notEqual(dogEntity.material.id, catEntity.material.id);
  assert.equal(dogEntity.layerSlot, 'biological-agent');
  assert.equal(catEntity.layerSlot, 'biological-agent');
  assert.equal(dogEntity.animation.kind, 'swim-cycle');
  assert.equal(catEntity.animation.kind, 'swim-cycle');
  assert.equal(dogEntity.renderCodes.semanticCode, 1);
  assert.equal(catEntity.renderCodes.semanticCode, 2);
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
  const waterBounds = waterEntity.geometry.bounds;
  for (const animal of [dogEntity, catEntity]) {
    assert.ok(animal.transform.position[0] >= waterBounds[0]);
    assert.ok(animal.transform.position[0] <= waterBounds[0] + waterBounds[2]);
    assert.ok(animal.transform.position[1] >= waterBounds[1]);
    assert.ok(animal.transform.position[1] <= waterBounds[1] + waterBounds[3]);
  }
  assert.equal(visualCompile.sceneRenderPacket.receipts.framing.pass, true);
  assert.equal(dogWake.layerSlot, 'flow-field');
  assert.equal(catWake.layerSlot, 'flow-field');
  assert.equal(dogWake.material.id, 'wake-ripple');
  assert.equal(catWake.material.id, 'wake-ripple');
  assert.ok(dogWake.evidence.includes(`agent:${dogEntity.id}`));
  assert.ok(catWake.evidence.includes(`agent:${catEntity.id}`));
  assert.equal(dogSubmersion.layerSlot, 'process-pulse');
  assert.equal(catSubmersion.layerSlot, 'process-pulse');
  assert.equal(dogSubmersion.domain.kind, 'submersion-band');
  assert.equal(catSubmersion.domain.kind, 'submersion-band');
  assert.equal(dogSubmersion.material.id, 'submersion-mask');
  assert.equal(catSubmersion.material.id, 'submersion-mask');
  assert.ok(dogSubmersion.affects.includes(dogEntity.id));
  assert.ok(catSubmersion.affects.includes(catEntity.id));
  assert.equal(dogSwimPose.animation.kind, 'swim-cycle');
  assert.equal(catSwimPose.animation.kind, 'swim-cycle');
  assert.ok((obligationById.get('visual:species-distinct-silhouettes').visualEvidence || []).includes('material:dog-swim-fur'));
  assert.ok((obligationById.get('visual:species-distinct-silhouettes').visualEvidence || []).includes('material:cat-swim-fur'));
  assert.ok(!(obligationById.get('visual:species-distinct-silhouettes').visualEvidence || []).includes('material:water'));
  assert.ok(!(obligationById.get('visual:species-distinct-silhouettes').visualEvidence || []).includes('material:light'));
  assert.ok(!(obligationById.get('visual:swimming-pose').visualEvidence || []).some((row) => row.startsWith('instance:geometry:')));
  assert.ok((obligationById.get('visual:wake-ripples').visualEvidence || []).includes(`visual:wake:${dogEntity.id}`));
  assert.ok((obligationById.get('visual:partial-submersion').visualEvidence || []).includes(`visual:submersion:${catEntity.id}`));
  assert.ok(sceneEntities.some((row) => row.identity.type === 'lake' && row.layerSlot === 'water-volume'));
  assert.equal(obligationById.get('medium:water').status, 'preserved');
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
  const visualCompile = spec.phaseArtifacts.phase6.artifact.visualCompile;
  const causalReceipt = visualIR.receipts.find((row) => row.id === 'receipt:causal-affordances');

  assert.equal(spec.renderProgram.rendererPlan.sceneKind, 'particle-instrument');
  assert.ok(spec.renderIR.causalAffordances.length > 0);
  assert.ok(visualIR.causalAffordances.length > 0);
  assert.ok(causalReceipt.count > 0);
  assert.ok(visualIR.geometry.some((row) => (row.evidence || []).some((item) => item.startsWith('causal-affordance:'))));
  assert.ok(visualIR.sceneRenderPacket.effects.some((row) => row.layerSlot === 'causal-affordance'));
  const requiredObligations = visualCompile.compositionLedger.obligations.filter((row) => row.required);
  assert.deepEqual(requiredObligations.filter((row) => row.status !== 'preserved'), []);
  const sourceLabels = visualCompile.sceneRenderPacket.entities.map((row) => row.identity.sourceLabel);
  for (const label of ['particle collider', 'muon tracks', 'detector slice', 'calorimeter']) {
    assert.ok(sourceLabels.some((value) => value.includes(label)), `missing scene identity for ${label}`);
  }
});

test('Phase 4 reserves bounded grounding evidence for prompt-owned typed identities', () => {
  const prompt = 'particle collider muon tracks collision plume through a detector slice with field lines and calorimeter heat';
  const rankedUniverseRows = Array.from({ length: 400 }, (_, index) => ({
    id: `noise-${index}`,
    candidateId: `noise-${index}`,
    canonicalId: `noise.${index}`,
    label: `unrelated candidate ${index}`,
    score: 1 - index / 1000,
  }));
  const spec = lab.createSpecFromPrompt(prompt, {
    allowPrototypeFallback: true,
    phase3RetrievalEvidence: { rankedUniverseRows },
  });
  const canonicalIds = new Set(spec.universeGraph.nodes.map((row) => row.canonicalId));
  const requiredObligations = spec.phaseArtifacts.phase6.artifact.visualCompile.compositionLedger.obligations
    .filter((row) => row.required);

  for (const id of [
    'prompt.body.particle-collider',
    'prompt.body.muon-tracks',
    'prompt.body.detector-slice',
    'prompt.body.calorimeter',
  ]) {
    assert.ok(canonicalIds.has(id), `missing bounded grounding identity ${id}`);
  }
  assert.deepEqual(requiredObligations.filter((row) => row.status !== 'preserved'), []);
});

test('Phase 4 exact construction evidence outranks unrelated reranker confidence', () => {
  const nodes = [{
    id: 'prompt-body-sea-ice',
    canonicalId: 'prompt.body.sea-ice',
    label: 'Sea Ice',
    sourceLabel: 'sea ice',
    directlyGrounded: true,
  }];
  const receipt = grounderGraph.attachConstructionEvidence(nodes, [{
    entryId: 'entity:sea-ice',
    constructionCandidates: [
      {
        candidateId: 'sea_turtle',
        label: 'sea turtle',
        score: 0.99,
        modelRerankEvaluated: true,
        modelRerankRank: 0,
        constructionEvidence: true,
        construction: { sourceLabel: 'sea turtle', partHints: ['shell', 'flippers'] },
      },
      {
        candidateId: 'entity.sea-ice',
        label: 'sea ice',
        score: 0.88,
        literalSlotMatch: true,
        constructionEvidence: true,
        construction: { sourceLabel: 'sea ice', partHints: ['ice floe plates', 'pressure ridge'] },
      },
    ],
  }]);
  assert.equal(receipt.attachedCount, 1);
  assert.deepEqual(nodes[0].construction.sourceLabels, ['sea ice']);
  assert.deepEqual(nodes[0].construction.partHints, ['ice floe plates', 'pressure ridge']);
  assert.equal(nodes[0].constructionProvenance[0].candidateId, 'entity.sea-ice');
  assert.equal(nodes[0].constructionProvenance[0].literalSlotMatch, true);
  assert.equal(nodes[0].constructionProvenance[0].targetIdentityBound, true);
  assert.equal(nodes[0].constructionHypotheses.length, 1);
});

test('Phase 4 attaches an analogous candidate to the exact prompt target node', () => {
  const nodes = [
    {
      id: 'prompt-body-qubit-chip',
      canonicalId: 'prompt.body.qubit-chip',
      label: 'Qubit Chip',
      directlyGrounded: true,
    },
    {
      id: 'prompt-body-microwave-resonator',
      canonicalId: 'prompt.body.microwave-resonator',
      label: 'Microwave Resonator',
      directlyGrounded: true,
    },
    {
      id: 'analog-microwave',
      canonicalId: 'artifact.microwave',
      label: 'Microwave',
    },
  ];
  const receipt = grounderGraph.attachConstructionEvidence(nodes, [{
    slotId: 'slot.object.microwave_resonator',
    entryId: 'entity:microwave-resonator',
    constructionCandidates: [{
      candidateId: 'microwave',
      label: 'microwave',
      modelEvaluated: true,
      constructionEvidence: true,
      construction: {
        schema: 'simulatte.constructionEvidence.v1',
        targetEntryId: 'entity:microwave-resonator',
        sourceCardId: 'artifact.microwave',
        sourceLabel: 'microwave',
        partHints: ['cavity', 'signal path', 'readout'],
      },
    }],
  }]);

  assert.equal(receipt.attachedCount, 1);
  assert.equal(nodes[0].construction, undefined);
  assert.equal(nodes[2].construction, undefined);
  assert.equal(nodes[1].construction.targetEntryId, 'entity:microwave-resonator');
  assert.equal(nodes[1].constructionProvenance[0].targetIdentityBound, true);
});

test('exact construction families exclude unrelated embedding neighbours through Phase 6', () => {
  const slot = { slotRole: 'concept', entryId: 'concept:excavator' };
  const construction = (id, literal, exact) => ({
    candidateId: id,
    label: id.replaceAll('_', ' '),
    labels: id === 'heavy_equipment' ? ['heavy equipment', 'excavator'] : ['celestial system', 'planet'],
    literalSlotMatch: literal,
    modelEvaluated: true,
    constructionEvidence: true,
    construction: {
      schema: 'simulatte.constructionProgramInput.v1',
      hypothesisId: `construction:excavator:${id}`,
      hypothesisRank: literal ? 1 : 2,
      targetEntryId: 'concept:excavator',
      sourceType: 'construction-topology',
      sourceCardIds: [id],
      sourceLabels: [id.replaceAll('_', ' ')],
      sourcePartHints: id === 'heavy_equipment'
        ? ['core', 'head', 'path', 'appendage', 'joint', 'panel']
        : ['core', 'path', 'field', 'detail'],
      partHints: id === 'heavy_equipment'
        ? ['core', 'head', 'path', 'appendage', 'joint', 'panel']
        : ['core', 'path', 'field', 'detail'],
      provenance: {
        candidateId: id,
        modelEvaluated: true,
        literalSlotMatch: literal,
        exactTargetMatch: exact,
      },
    },
  });
  const heavy = construction('heavy_equipment', true, true);
  const celestial = construction('celestial_system', false, false);
  const phase3 = intentEmbedderScope.constructionCandidatesForSlot(slot, [celestial, heavy], 3);
  assert.deepEqual(phase3.map((row) => row.candidateId), ['heavy_equipment']);

  const program = compositionGraphScope.objectGeometryProgramForIdentity({
    type: 'excavator', sourceLabel: 'excavator', directlyGrounded: true,
  }, {}, {
    id: 'heavy-equipment',
    sourceLabel: 'excavator',
    directlyGrounded: true,
    construction: celestial.construction,
    constructionHypotheses: [celestial.construction, heavy.construction],
    constructionProvenance: [celestial.construction.provenance, heavy.construction.provenance],
  }, 'material-surface');
  assert.match(program.grammarId, /heavy-equipment/);
  assert.equal(program.constructionReceipt.exactTargetMatch, true);
  assert.equal(program.constructionReceipt.topologySelectionMethod, 'exact-target-cue');
  assert.equal(program.constructionReceipt.topologyTargetFit, true);
});

test('unknown object retrieval reserves an embedding-ranked construction topology inside the fixed card budget', () => {
  const documents = Array.from({ length: 6 }, (_, index) => ({
    cardId: `surface.synthetic-${index}`,
    type: 'artifact',
    labels: [`synthetic ${index}`],
    candidateText: `synthetic artifact ${index}`,
    vector: [1 - index * 0.02, 0],
  }));
  documents.push({
    cardId: 'construction.resonant-cavity',
    type: 'construction-topology',
    labels: ['resonant cavity'],
    candidateText: 'reusable cavity part graph',
    vector: [0.72, 0],
  });
  const rows = intentEmbedderScope.rankSurfaceCardsForSlot(
    { id: 'test-card-index', embedModelId: 'test-model', documents },
    { slotRole: 'object', entryId: 'entity:unseen-apparatus' },
    [1, 0],
    { perSlotCardMax: 4, surfaceScoreFloor: 0.1 }
  );

  assert.equal(rows.length, 4);
  const topology = rows.find((row) => row.candidateId === 'construction.resonant-cavity');
  assert.ok(topology);
  assert.equal(topology.retrievalReservation, 'construction-topology');
  assert.equal(topology.constructionEvidence, true);
});

test('construction retrieval admits physical part graphs and rejects process or visual-effect rows', () => {
  const slot = { slotRole: 'object', entryId: 'entity:unseen-machine' };
  const physical = intentEmbedderScope.constructionForCandidate(slot, {
    cardId: 'construction.rail-vehicle',
    type: 'construction-topology',
    modelScore: 0.8,
  });
  assert.equal(physical.sourceCardId, 'construction.rail-vehicle');
  assert.ok(physical.partHints.includes('3 core'));
  assert.equal(intentEmbedderScope.constructionForCandidate(slot, {
    cardId: 'event.growth', type: 'event', partHints: ['fake body'], modelScore: 0.99,
  }), null);
  assert.equal(intentEmbedderScope.slotNeedsModelConstructionEvidence({
    slotRole: 'object', semanticClass: 'visual-effect',
  }), false);
  assert.equal(intentEmbedderScope.slotNeedsModelConstructionEvidence({
    slotRole: 'concept', semanticClass: 'control-process',
  }), false);
});

test('Phase 4 attaches construction to the slot target instead of a material context span', () => {
  const nodes = [
    {
      id: 'material-glass',
      spanId: 'span-glass',
      canonicalId: 'material.glass',
      label: 'Glass',
      aliases: ['glass', 'greenhouse'],
      directlyGrounded: true,
    },
    {
      id: 'architectural-enclosure',
      spanId: 'span-greenhouse',
      canonicalId: 'architectural_enclosure',
      label: 'Greenhouse',
      directlyGrounded: true,
    },
  ];
  const construction = {
    schema: 'simulatte.constructionEvidence.v1',
    targetEntryId: 'concept:greenhouse',
    sourceCardId: 'construction.architectural-enclosure',
    sourceLabel: 'architectural enclosure',
    partHints: ['core', 'panel', 'opening', 'support'],
  };
  const receipt = grounderGraph.attachConstructionEvidence(nodes, [{
    slotId: 'slot.concept.greenhouse',
    entryId: 'concept:greenhouse',
    sourceSpanIds: ['span-glass'],
    constructionCandidates: [{
      candidateId: 'architectural_enclosure',
      labels: ['architectural enclosure', 'greenhouse'],
      literalSlotMatch: true,
      modelEvaluated: true,
      constructionEvidence: true,
      construction,
    }],
  }]);
  assert.equal(receipt.attachedCount, 1);
  assert.equal(nodes[0].construction, undefined);
  assert.deepEqual(nodes[1].construction.sourceCardIds, ['construction.architectural-enclosure']);
});

test('Phase 6 lowers unmatched typed physics entities for expanded scene kinds', () => {
  const prompt = 'particle collider muon tracks collision plume through a detector slice with field lines and calorimeter heat';
  const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
  const sparseGraph = {
    ...spec.compositionGraph,
    nodes: spec.compositionGraph.nodes.filter((row) => (
      row.source === 'catalog' || /^embedding-guided-synth/.test(row.source || '')
    )),
  };
  const program = lab.compileCompositionToRenderProgram(sparseGraph, {
    ...spec,
    compositionGraph: sparseGraph,
  });
  const semanticRefs = new Set(program.objects.map((row) => row.semanticRef).filter(Boolean));

  for (const id of [
    'prompt.body.particle-collider',
    'prompt.body.muon-tracks',
    'prompt.body.detector-slice',
    'prompt.body.calorimeter',
  ]) {
    assert.ok(semanticRefs.has(id), `missing expanded-scene render identity ${id}`);
  }
});

test('common-world and celestial nouns survive grounding as literal object geometry', () => {
  const cases = [
    {
      prompt: 'a person sits in a chair at a table watching a tv inside a building with trees outside',
      identities: ['person', 'chair', 'table', 'television', 'building', 'tree'],
      grounded: ['person', 'chair', 'table', 'television', 'building', 'tree'],
    },
    {
      prompt: 'a spiral galaxy with stars and planets orbiting a black hole',
      identities: ['galaxy', 'star', 'planet', 'black-hole'],
      grounded: ['galaxy', 'sun', 'planet', 'black-hole'],
      sceneKind: 'planetary-space',
    },
    {
      prompt: 'a bicycle beside a sofa and a floor lamp',
      identities: ['bicycle', 'sofa', 'lamp'],
      grounded: ['bicycle', 'sofa', 'lamp'],
      sceneKind: 'mechanical',
    },
    {
      prompt: 'an airplane flies over a bridge and a road',
      identities: ['airplane', 'bridge', 'road'],
      grounded: ['airplane', 'bridge', 'road'],
      sceneKind: 'mechanical',
    },
    {
      prompt: 'a boat floats on a river under a cloud',
      identities: ['boat', 'river', 'cloud'],
      grounded: ['boat', 'river', 'cloud'],
      sceneKind: 'watershed',
    },
  ];

  for (const { prompt, identities, grounded, sceneKind } of cases) {
    const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
    const acceptedIds = (spec.phaseArtifacts.phase4.artifact.groundedIntent.acceptedGraph.nodes || [])
      .map((row) => row.id);
    const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
    const packetTypes = new Set(packet.entities.map((row) => row.identity.type));
    const renderData = webgpuRendererScope.compileSceneRenderData(packet, packet.sceneKind, 'literal-object-test');

    for (const term of grounded) {
      assert.ok(acceptedIds.some((id) => id.includes(term)), `${prompt} should ground ${term}`);
    }
    for (const identity of identities) {
      assert.ok(packetTypes.has(identity), `${prompt} should compile ${identity} into Phase 6`);
      const entities = packet.entities.filter((row) => row.identity.type === identity);
      assert.ok(entities.every((row) => row.geometry.program.literal === true));
      assert.ok(entities.every((row) => row.geometry.program.grammarId.startsWith(`object-grammar.${identity}`)));
      assert.ok(renderData.objectRealization.rows.some((row) => (
        row.identityType === identity && row.realized === true
      )), `${prompt} should realize ${identity} in Phase 7`);
    }
    assert.ok(renderData.objectPartCount > identities.length);
    assert.equal(renderData.objectPartData.length, 256 * 20);
    if (identities.includes('person')) {
      const person = packet.entities.find((row) => row.identity.type === 'person');
      const personObject = spec.renderProgram.objects.find((row) => row.id === 'prompt-body-person');
      const chairObject = spec.renderProgram.objects.find((row) => row.id === 'chair-a');
      const tableObject = spec.renderProgram.objects.find((row) => row.id === 'table-a');
      const treeObject = spec.renderProgram.objects.find((row) => row.id === 'prompt-body-tree');
      const buildingObject = spec.renderProgram.objects.find((row) => row.id === 'language-building-span7');
      const compositionRelations = spec.compositionGraph.relations.map((relation) => (
        `${relation.from}:${relation.channel}:${relation.to}`
      ));
      assert.equal(person.geometry.program.pose, 'sitting');
      assert.equal(person.geometry.program.grammarId, 'object-grammar.person-sitting');
      assert.ok(personObject.layoutConstraints.includes('relation:entity-person:measurement:entity-television'));
      assert.ok(chairObject.pose.w < 0.2, 'sitting does not inflate a chair into a containment volume');
      assert.ok(Math.abs(personObject.pose.x - chairObject.pose.x) < 0.12);
      assert.ok(Math.abs(personObject.pose.y - chairObject.pose.y) < 0.08);
      assert.ok(Math.abs(chairObject.pose.y - tableObject.pose.y) < 0.08);
      assert.ok(Math.abs(chairObject.pose.x - tableObject.pose.x) < 0.24);
      assert.ok(Math.abs(treeObject.pose.x - buildingObject.pose.x) >=
        (treeObject.pose.w + buildingObject.pose.w) * 0.5);
      assert.ok(compositionRelations.includes('human-a:in:chair-a'));
      assert.ok(compositionRelations.includes('human-a:watching:screen-a'));
      assert.ok(compositionRelations.includes('chair-a:at:table-a'));
      assert.ok(compositionRelations.includes('screen-a:inside:language-building-span7'));
    }
    if (identities.includes('galaxy')) {
      assert.ok(!packet.entities.some((row) => row.identity.type === 'instrument'));
    }
    if (identities.includes('airplane')) {
      assert.equal(packet.entities.find((row) => row.identity.type === 'airplane').animation.kind, 'flight-path');
      assert.equal(packet.entities.find((row) => row.identity.type === 'airplane').layerSlot, 'material-surface');
      assert.equal(packet.entities.find((row) => row.identity.type === 'road').animation.kind, 'static-pose');
      assert.equal(packet.entities.find((row) => row.identity.type === 'road').layerSlot, 'material-surface');
    }
    assert.deepEqual(spec.renderProgram.visualIR.compositionLedger.losses, []);
    if (sceneKind) assert.equal(packet.sceneKind, sceneKind);
  }
});

test('Phase 7 reports submitted object parts and preserves canonical identity aliases beyond 32 rows', () => {
  const spec = lab.createSpecFromPrompt(
    'planetary rings shepherd moon resonance sorting ice boulders into density waves and orbital gaps',
    { allowPrototypeFallback: true }
  );
  const packet = spec.renderProgram.visualIR.sceneRenderPacket;
  const renderData = webgpuRendererScope.compileSceneRenderData(packet, packet.sceneKind, 'capacity-proof');
  const audit = globalThis.SimulatteRenderProof.renderPixelAudit(
    packet,
    renderData,
    { width: 1280, height: 720 },
    { failCount: 0 },
    null
  );

  assert.ok(renderData.semanticDrawableCount > 32);
  assert.equal(renderData.drawables.length, renderData.semanticDrawableCount);
  assert.ok(renderData.objectPartCount > 32);
  assert.equal(renderData.sceneInstanceCapacity, 256);
  assert.equal(renderData.sceneInstanceCount, renderData.objectPartCount);
  assert.equal(renderData.drawCount, renderData.objectPartCount + 1);
  assert.equal(Object.hasOwn(renderData, 'sceneInstanceData'), false);
  assert.ok(renderData.objectRealization.rows.every((row) => row.submitted === true));
  assert.equal(audit.literalRealization.status, 'pass');
  assert.equal(audit.literalRealization.failedObligationIds.length, 0);
  assert.equal(audit.literalRealization.rows.find((row) => row.obligationId === 'entity:moon').realized, true);
});

test('part-scoped properties bind robot eyes and articulated straw arms into one object graph', () => {
  const spec = lab.createSpecFromPrompt('robot with red eyes and bendable straw arms', {
    allowPrototypeFallback: true,
  });
  const robotNode = spec.universeGraph.nodes.find((row) => row.semanticClass === 'robot');
  const eyePart = robotNode.partGraph.find((row) => row.semanticClass === 'eye');
  const armPart = robotNode.partGraph.find((row) => row.semanticClass === 'arm');
  const packet = spec.renderProgram.sceneRenderPacket;
  const robotRows = packet.entities.filter((row) => row.identity.type === 'robot');

  assert.ok(robotNode);
  assert.equal(spec.physicsIR.entities.length, 1, 'owned parts do not become separate physics objects');
  assert.equal(eyePart.properties.find((row) => row.kind === 'color').value, '#ef3340');
  assert.equal(armPart.materialId, 'straw');
  assert.equal(armPart.properties.find((row) => row.kind === 'articulation').value, 'segmented-flexible');
  assert.equal(robotRows.length, 1, 'owned parts do not leak into separate packet entities');
  const program = robotRows[0].geometry.program;
  assert.equal(program.grammarId, 'object-grammar.robot-character');
  assert.equal(program.constructionSelectionReceipt.strategy, 'prompt-obligation-coverage');
  assert.ok(program.constructionSelectionReceipt.candidates.length <= 5);
  assert.ok(program.constructionSelectionReceipt.candidates.some((row) => (
    row.grammarId.startsWith('object-grammar.constructive.articulated-machine.')
  )));
  const eyes = program.parts.filter((row) => row.id.includes('eye'));
  const arms = program.parts.filter((row) => row.id.includes('arm'));
  assert.equal(eyes.length, 2);
  assert.ok(eyes.every((row) => row.fill === '#ef3340' && row.emissive === 0.82));
  assert.ok(arms.length >= 4);
  assert.ok(arms.every((row) => (
    row.fill === '#d8bd72' && row.texture === 'fibrous' &&
    row.articulation === 'segmented-flexible'
  )));
  const objectParts = webgpuRendererScope.scenePacketObjectParts(packet);
  assert.ok(objectParts.filter((row) => row.id.includes(':eye-'))
    .every((row) => row.emissive === 0.82 && row.metallic === 0.04));
  assert.ok(objectParts.filter((row) => row.id.includes('-arm-'))
    .every((row) => row.roughness === 0.82 && row.metallic === 0.04));
  const promptObligations = spec.renderProgram.visualIR.compositionLedger.obligations
    .filter((row) => row.id.startsWith('visual:prompt-'));
  assert.ok(promptObligations.length >= 3);
  assert.ok(promptObligations.every((row) => row.status === 'preserved'));
  const phase7 = lab.runPhase7RenderExecution(lab.createRenderExecutionInput(spec), null, null, {
    rendered: true,
    renderCount: 1,
    drawCount: objectParts.length,
  });
  assert.ok(phase7.artifact.renderExecution.visualObligationProof
    .filter((row) => row.obligationId.startsWith('visual:prompt-'))
    .every((row) => row.status === 'pass'));
});

test('cardinality pose spatial color and environment contracts lower into one rendered scene', () => {
  const spec = lab.createSpecFromPrompt('4 birds flying over a black castle with orange sunset', {
    allowPrototypeFallback: true,
  });
  const packet = spec.renderProgram.sceneRenderPacket;
  const birds = packet.entities.filter((row) => row.identity.type === 'bird');
  const castle = packet.entities.find((row) => row.identity.type === 'castle');
  const birdQuantity = spec.promptParse.quantities.find((row) => row.targetSpanId);

  assert.equal(birdQuantity.value, 4);
  assert.equal(spec.physicsIR.entities.find((row) => row.semanticClass === 'bird').cardinality, 4);
  assert.equal(birds.length, 4);
  assert.deepEqual(birds.map((row) => row.cardinalityReceipt.instanceIndex), [1, 2, 3, 4]);
  assert.ok(birds.every((row) => row.cardinalityReceipt.instanceCount === 4));
  assert.ok(birds.every((row) => row.geometry.program.grammarId === 'object-grammar.bird-flying'));
  assert.ok(birds.every((row) => row.geometry.program.pose === 'flight-extended'));
  assert.ok(birds.every((row) => (
    row.geometry.program.parts.some((part) => part.id === 'wing-left') &&
    row.geometry.program.parts.some((part) => part.id === 'wing-right')
  )));
  assert.ok(birds.every((row) => row.transform.position[1] < castle.transform.position[1]));
  assert.equal(castle.geometry.program.grammarId, 'object-grammar.castle');
  assert.ok(castle.geometry.program.parts.every((row) => row.fill === '#111318'));
  assert.equal(packet.environmentProgram.kind, 'sunset');
  assert.equal(packet.environmentProgram.color, '#f47b20');
  assert.equal(packet.lights[0].id, 'sunset-key');
  assert.deepEqual(packet.lights[0].direction, [-0.62, -0.3, 0.72]);
  const promptObligations = spec.renderProgram.visualIR.compositionLedger.obligations
    .filter((row) => row.id.startsWith('visual:prompt-'));
  assert.ok(promptObligations.some((row) => row.constraintKind === 'count' && row.expectedCount === 4));
  assert.ok(promptObligations.some((row) => row.constraintKind === 'environment'));
  assert.ok(promptObligations.every((row) => row.status === 'preserved'));
  assert.equal(
    spec.renderProgram.visualIR.compositionLedger.obligations.find((row) => row.id === 'environment:sunset').status,
    'preserved'
  );
  const phase7 = lab.runPhase7RenderExecution(lab.createRenderExecutionInput(spec), null, null, {
    rendered: true,
    renderCount: 1,
    drawCount: webgpuRendererScope.scenePacketObjectParts(packet).length,
  });
  assert.ok(phase7.artifact.renderExecution.visualObligationProof
    .filter((row) => row.obligationId.startsWith('visual:prompt-'))
    .every((row) => row.status === 'pass'));
  assert.equal(phase7.artifact.renderExecution.environmentProgram.kind, 'sunset');
  assert.equal(phase7.artifact.renderExecution.pixelAudit.literalRealization.status, 'pass');
  assert.equal(globalThis.SimulatteSceneProof.settleSceneProof(phase7).artifact.sceneProof.verdict, 'pass');
  assert.equal(webgpuRendererScope.promptPixelColorSatisfied([220, 58, 56, 255], '#ef3340'), true);
  assert.equal(webgpuRendererScope.promptPixelColorSatisfied([20, 21, 25, 255], '#111318'), true);
  assert.equal(webgpuRendererScope.promptPixelColorSatisfied([230, 112, 34, 255], '#f47b20'), true);
});

test('Phase 6 solves typed spatial constraints and canonicalizes visual concepts', () => {
  const objects = [
    { id: 'subject-a', semanticRef: 'prompt.body.subject', sourceLabel: 'subject', directlyGrounded: true },
    { id: 'target-a', semanticRef: 'prompt.body.target', sourceLabel: 'target', directlyGrounded: true },
  ];
  const solve = (spatialRelation) => compositionGraphScope.constraintLayoutObjects(
    objects,
    'mechanical',
    {
      renderIR: {
        compositionLedger: {
          relations: [{
            id: `relation:spatial:entity-subject:${spatialRelation}:entity-target`,
            kind: 'spatial-constraint',
            spatialRelation,
            from: 'prompt-body-subject',
            to: 'prompt-body-target',
          }],
        },
      },
    },
    { compositionTopology: 'field-map' }
  );
  const above = solve('above');
  const below = solve('below');
  const beside = solve('beside');
  assert.ok(above.find((row) => row.id === 'subject-a').pose.y < above.find((row) => row.id === 'target-a').pose.y);
  assert.ok(below.find((row) => row.id === 'subject-a').pose.y > below.find((row) => row.id === 'target-a').pose.y);
  const besideSubject = beside.find((row) => row.id === 'subject-a').pose;
  const besideTarget = beside.find((row) => row.id === 'target-a').pose;
  assert.ok(Math.abs(besideSubject.x - besideTarget.x) >= (besideSubject.w + besideTarget.w) * 0.5);
  assert.ok(above.every((row) => row.layoutReceipt.relationCount === 1));
  const through = solve('through');
  const throughSubject = through.find((row) => row.id === 'subject-a').pose;
  const throughTarget = through.find((row) => row.id === 'target-a').pose;
  assert.ok(throughTarget.w > throughSubject.w);
  assert.ok(throughTarget.h > throughSubject.h);
  assert.ok(throughSubject.z < throughTarget.z);

  const matrixWithNetwork = compositionGraphScope.constraintLayoutObjects([
    {
      id: 'matrix', semanticRef: 'prompt.body.dough-matrix', sourceLabel: 'dough matrix', directlyGrounded: true,
      construction: { targetEntryId: 'entity:dough-matrix', sourceCardIds: ['construction.porous-matrix'] },
    },
    {
      id: 'network', semanticRef: 'prompt.body.gluten-strands', sourceLabel: 'gluten strands', directlyGrounded: true,
      construction: { targetEntryId: 'entity:gluten-strands', sourceCardIds: ['construction.fiber-network'] },
    },
  ], 'molecular-biology', {
    renderIR: {
      compositionLedger: {
        relations: [{
          id: 'relation:spatial:entity-dough-matrix:with:entity-gluten-strands',
          kind: 'spatial-constraint',
          spatialRelation: 'with',
          from: 'prompt-body-dough-matrix',
          to: 'prompt-body-gluten-strands',
        }],
      },
    },
  }, { compositionTopology: 'specimen' });
  const matrixPose = matrixWithNetwork.find((row) => row.id === 'matrix').pose;
  const networkPose = matrixWithNetwork.find((row) => row.id === 'network').pose;
  assert.ok(Math.abs(networkPose.x - matrixPose.x) <= (matrixPose.w - networkPose.w) * 0.5 + 0.025);
  assert.ok(Math.abs(networkPose.y - matrixPose.y) <= (matrixPose.h - networkPose.h) * 0.5 + 0.025);
  assert.ok(networkPose.z < matrixPose.z);

  const priorityLayout = compositionGraphScope.constraintLayoutObjects([
    ...objects,
    { id: 'generated-meter', sourceLabel: 'meter', directlyGrounded: false, construction: { partHints: ['panel', 'sensor'] } },
  ], 'mechanical', {}, { compositionTopology: 'field-map' });
  assert.ok(
    priorityLayout.find((row) => row.id === 'generated-meter').pose.w <
      priorityLayout.find((row) => row.id === 'subject-a').pose.w
  );

  const holding = compositionGraphScope.constraintLayoutObjects(objects, 'biology', {
    renderIR: {
      compositionLedger: {
        relations: [{
          id: 'relation:entity-subject:holding:entity-target',
          kind: 'agent-action-location',
          from: 'prompt-body-subject',
          target: 'prompt-body-target',
          predicate: 'holding',
          process: 'holding',
        }],
      },
    },
  }, { compositionTopology: 'specimen' });
  const holder = holding.find((row) => row.id === 'subject-a').pose;
  const held = holding.find((row) => row.id === 'target-a').pose;
  const holdingOverlap = (holder.w + held.w) * 0.5 - Math.abs(holder.x - held.x);
  assert.ok(holdingOverlap >= 0);
  assert.ok(holdingOverlap <= Math.min(holder.w, held.w) * 0.12);
  assert.ok(Math.abs(holder.y - held.y) < (holder.h + held.h) * 0.5);
  assert.ok(held.z < (holder.z || 0), 'held objects are layered in front of the holder');
  assert.ok(holding.every((row) => row.layoutReceipt.relationCount === 1));

  const canonical = compositionGraphScope.canonicalVisualObjects([
    { id: 'prompt-person', semanticRef: 'prompt.body.person', sourceLabel: 'person', directlyGrounded: true },
    { id: 'generated-human', sourceLabel: 'person', aliases: ['human'], directlyGrounded: true },
  ]);
  assert.equal(canonical.length, 1);
  assert.ok(canonical[0].sourceIds.includes('generated-human'));

  const visualEffect = compositionGraphScope.canonicalVisualObjects([
    {
      id: 'render-fire', semanticRef: 'prompt.body.fire-front', source: 'render-ir',
      sourceLabel: 'fire', directlyGrounded: true, shape: 'body', material: 'metal', visualRegime: 'material',
    },
    {
      id: 'generated-fire', semanticRef: 'prompt.body.fire-front', source: 'open-semantic-rag',
      sourceLabel: 'fire', directlyGrounded: true, shape: 'flame-front', material: 'fire', visualRegime: 'thermal',
    },
  ]);
  assert.equal(visualEffect.length, 1);
  assert.ok(visualEffect[0].sourceIds.includes('generated-fire'));
  assert.equal(visualEffect[0].shape, 'flame-front');
  assert.equal(visualEffect[0].material, 'fire');
  assert.equal(visualEffect[0].visualRegime, 'thermal');

  const nominalWave = compositionGraphScope.canonicalVisualObjects([
    {
      id: 'wave-event',
      kind: 'event',
      source: 'embedding-guided-synth-event',
      semanticRef: 'prompt.body.waves',
      physicalRef: 'prompt-body-waves',
      sourceLabel: 'waves',
      directlyGrounded: true,
      construction: { id: 'wave-parts' },
    },
    {
      id: 'render-waves',
      kind: 'body',
      source: 'render-ir',
      semanticRef: 'prompt.body.waves',
      physicalRef: 'prompt-body-waves',
      sourceLabel: 'waves',
      directlyGrounded: true,
    },
  ]);
  assert.equal(nominalWave.length, 1);
  assert.equal(nominalWave[0].id, 'render-waves');
  assert.equal(nominalWave[0].source, 'render-ir');
  assert.equal(nominalWave[0].construction.id, 'wave-parts');

  const exactConstruction = {
    schema: 'simulatte.constructionProgramInput.v1',
    hypothesisId: 'construction:greenhouse:1',
    hypothesisRank: 1,
    targetEntryId: 'concept:greenhouse',
    sourceCardIds: ['architectural_enclosure'],
    partHints: ['core', 'panel', 'opening', 'support'],
    provenance: {
      candidateId: 'architectural_enclosure',
      modelEvaluated: true,
      literalSlotMatch: true,
      exactTargetMatch: true,
    },
  };
  const mergedConstruction = compositionGraphScope.canonicalVisualObjects([
    {
      id: 'greenhouse',
      physicalRef: 'architectural-enclosure',
      source: 'semantic-surface-grounder',
      sourceLabel: 'greenhouse',
      directlyGrounded: true,
      constructionHypotheses: [],
      constructionProvenance: [],
    },
    {
      id: 'render-architectural-enclosure',
      physicalRef: 'architectural-enclosure',
      source: 'render-ir',
      sourceLabel: 'greenhouse',
      directlyGrounded: true,
      construction: exactConstruction,
      constructionHypotheses: [exactConstruction],
      constructionProvenance: [exactConstruction.provenance],
    },
  ]);
  assert.equal(mergedConstruction.length, 1);
  assert.equal(mergedConstruction[0].construction.sourceCardIds[0], 'architectural_enclosure');
  assert.equal(mergedConstruction[0].constructionHypotheses.length, 1);
  assert.equal(mergedConstruction[0].constructionProvenance[0].exactTargetMatch, true);

  const renderAnchors = compositionGraphScope.unmatchedRenderIRObjects([
    {
      id: 'wave-event',
      kind: 'event',
      source: 'embedding-guided-synth-event',
      physicalRef: 'prompt-body-waves',
    },
  ], [
    {
      id: 'render-waves',
      kind: 'body',
      source: 'render-ir',
      physicalRef: 'prompt-body-waves',
      role: 'waves',
      directlyGrounded: true,
    },
  ]);
  assert.equal(renderAnchors.length, 1);
  assert.equal(renderAnchors[0].id, 'render-waves');
});

test('prompt-owned identities override an incorrect network render layer', () => {
  for (const identityType of ['airplane', 'road']) {
    const identity = compositionGraphScope.scenePacketEntityIdentity({
      id: `surface-${identityType}-1`,
      label: identityType,
      sourceLabel: identityType,
      directlyGrounded: true,
      semanticClass: identityType === 'airplane' ? 'vehicle' : 'surface',
      visualArchetype: identityType,
      semanticRef: `prompt.body.${identityType}`,
    }, { primitive: 'network-flow' }, 'network-flow');
    assert.equal(identity.type, identityType);
    assert.equal(identity.visualArchetype, identityType);
  }
  assert.equal(compositionGraphScope.directSceneKindForRenderIR({
    sceneHint: 'city',
    objects: [{
      label: 'airplane',
      sourceLabel: 'airplane',
      directlyGrounded: true,
      visualArchetype: 'airplane',
      semanticRef: 'prompt.body.airplane',
    }],
  }, {}), 'mechanical');
  assert.equal(compositionGraphScope.promptOwnedLayerSlotForEntity({
    directlyGrounded: true,
    visualArchetype: 'airplane',
    sourceLabel: 'airplane',
    material: 'water',
  }), 'material-surface');
  assert.equal(compositionGraphScope.promptOwnedLayerSlotForEntity({
    directlyGrounded: true,
    visualArchetype: 'road',
    sourceLabel: 'road',
    material: 'water',
  }), 'material-surface');
});

test('prompt-owned scientific identities require construction evidence before claiming literal geometry', () => {
  const placeholder = compositionGraphScope.objectGeometryProgramForIdentity({
    type: 'particle-collider',
    sourceLabel: 'particle collider',
    directlyGrounded: true,
  }, { primitive: 'track-line' }, {
    id: 'prompt-object-particle-collider',
    directlyGrounded: true,
    semanticClass: 'instrument',
    semanticRef: 'prompt.body.particle-collider',
  }, 'track-line');
  const program = compositionGraphScope.objectGeometryProgramForIdentity({
    type: 'particle-collider',
    sourceLabel: 'particle collider',
    directlyGrounded: true,
  }, { primitive: 'track-line' }, {
    id: 'prompt-object-particle-collider',
    directlyGrounded: true,
    semanticClass: 'instrument',
    semanticRef: 'prompt.body.particle-collider',
    constructionHypotheses: [{
      schema: 'simulatte.constructionProgramInput.v1',
      hypothesisId: 'construction:particle-collider:1',
      targetEntryId: 'object:particle-collider',
      sourceCardIds: ['particle-collider'],
      sourceLabels: ['particle collider'],
      basisIds: ['ground.instrumented-bench'],
      partHints: ['detector shell', 'beam path', 'sensor array', 'readout panel'],
      shapeHints: ['instrument'],
      materialHints: ['metal'],
    }],
    constructionProvenance: [{
      candidateId: 'particle-collider',
      modelEvaluated: true,
      rerankEvaluated: true,
      exactTargetMatch: true,
    }],
  }, 'track-line');
  const support = compositionGraphScope.objectGeometryProgramForIdentity({ type: 'helper' }, {}, {
    id: 'solver-helper',
  }, 'material-surface');

  assert.equal(placeholder.literal, false);
  assert.equal(placeholder.unsupportedIdentity, true);
  assert.equal(program.literal, true);
  assert.match(program.grammarId, /^object-grammar\.constructive\./);
  assert.equal(program.selectionRole, 'model-construction');
  assert.equal(program.constructionReceipt.modelEvaluated, true);
  assert.equal(program.constructionReceipt.rerankEvaluated, true);
  assert.ok(program.parts.length >= 3);
  assert.equal(support.literal, false);
  assert.equal(webgpuRendererScope.scenePacketAnimationCode('phase-propagating-arcs'), 8);
  assert.equal(webgpuRendererScope.scenePacketAnimationCode('impulse-and-contact-ghosts'), 3);
});

test('construction support failures apply only to required identities without a literal representative', () => {
  const unsupported = (id, type) => ({
    id,
    label: type,
    identity: { type, label: type },
    geometry: { program: { literal: false, unsupportedIdentity: true, grammarId: `unsupported.${type}` } },
  });
  const literal = (id, type) => ({
    id,
    label: type,
    identity: { type, label: type },
    geometry: { program: { literal: true, unsupportedIdentity: false, grammarId: `literal.${type}` } },
  });
  const packet = {
    entities: [
      unsupported('aux-soot', 'soot'),
      unsupported('missing-resonator', 'microwave-resonator'),
      unsupported('duplicate-fire', 'fire'),
      literal('rendered-fire', 'forest-fire'),
    ],
  };
  const ledger = {
    obligations: [
      { id: 'entity:microwave-resonator', kind: 'entity', target: 'microwave-resonator', required: true },
      { id: 'entity:fire', kind: 'entity', target: 'fire', required: true },
    ],
  };
  const obligations = compositionGraphScope.constructionVisualObligationsForScenePacket(packet, ledger);

  assert.deepEqual(obligations.map((row) => row.id), [
    'visual:construction:missing-resonator:support',
  ]);
  assert.equal(obligations[0].status, 'lost');
});

test('overlapping aliases canonicalize once while distinct prompt identities keep evidence-owned grammars', () => {
  const microbiome = lab.createSpecFromPrompt(
    'gut microbiome colonies exchanging metabolites through intestinal folds under immune sampling',
    { allowPrototypeFallback: true }
  );
  const microbiomeNodes = microbiome.universeGraph.nodes
    .filter((row) => /^prompt\.body\.gut-microbiome-colonies$/.test(row.canonicalId || ''));
  assert.deepEqual(
    microbiomeNodes.map((row) => row.canonicalId).sort(),
    ['prompt.body.gut-microbiome-colonies']
  );

  const cases = [
    ['edge data center server racks recirculating heat between cooling aisles', 'server-racks', 'object-grammar.server-rack'],
    ['warehouse fire with smoke in concrete stairwell', 'concrete-stairwell', 'object-grammar.stairwell'],
    ['warehouse robot arms sort parcels on conveyor belts', 'warehouse-robot-arms', 'object-grammar.robot'],
    ['warehouse robot arms sort parcels on conveyor belts', 'conveyor-belts', 'object-grammar.conveyor'],
    ['warehouse robot arms sort parcels on conveyor belts', 'parcel', 'object-grammar.parcel'],
  ];
  for (const [prompt, identityType, grammarId] of cases) {
    const packet = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true })
      .renderProgram.visualIR.sceneRenderPacket;
    const entity = packet.entities.find((row) => row.identity && row.identity.type === identityType);
    assert.ok(entity, `${identityType} remains an exact packet identity`);
    assert.equal(entity.geometry.program.identityType, identityType);
    assert.equal(entity.geometry.program.grammarId, grammarId);
    assert.equal(entity.geometry.program.literal, true);
  }
});

test('scene framing makes literal objects readable without changing relation geometry', () => {
  const dogPacket = lab.createSpecFromPrompt('dogs', { allowPrototypeFallback: true })
    .renderProgram.sceneRenderPacket;
  const dog = dogPacket.entities.find((row) => row.identity.type === 'dog');
  const dogParts = new Map(dog.geometry.program.parts.map((part) => [part.id, part]));
  const flowerPacket = lab.createSpecFromPrompt('flowers', { allowPrototypeFallback: true })
    .renderProgram.sceneRenderPacket;
  const flower = flowerPacket.entities.find((row) => row.identity.type === 'flower');
  const flowerParts = new Map(flower.geometry.program.parts.map((part) => [part.id, part]));
  const warehousePacket = lab.createSpecFromPrompt(
    'warehouse robot arms sort parcels on conveyor belts',
    { allowPrototypeFallback: true }
  ).renderProgram.sceneRenderPacket;
  const parcel = warehousePacket.entities.find((row) => row.identity.type === 'parcel');
  const conveyor = warehousePacket.entities.find((row) => row.geometry.program.grammarId === 'object-grammar.conveyor');

  assert.equal(dog.geometry.program.grammarId, 'object-grammar.dog');
  assert.ok(dog.transform.scale[0] * dog.transform.scale[1] >= 0.12);
  assert.ok(Math.abs(dog.transform.position[0] - 0.5) <= 0.01);
  assert.ok(Math.abs(dog.transform.position[1] - 0.48) <= 0.01);
  assert.equal(dog.transform.rotation[2], 0);
  assert.ok(Math.abs(dogParts.get('front-leg').rotation) <= 0.1);
  assert.ok(Math.abs(dogParts.get('back-leg').rotation) <= 0.1);
  assert.ok(dogParts.has('nose'));
  assert.equal(flowerParts.get('stem').rotation, 0);
  assert.equal([...flowerParts.keys()].filter((id) => id.startsWith('petal')).length, 5);
  assert.ok(flowerParts.has('leaf-left'));
  assert.ok(flowerParts.has('leaf-right'));
  assert.equal(dogPacket.receipts.framing.pass, true);
  assert.equal(flowerPacket.receipts.framing.pass, true);
  assert.equal(warehousePacket.receipts.framing.pass, true);
  assert.ok(parcel.transform.position[0] >= conveyor.geometry.bounds[0]);
  assert.ok(parcel.transform.position[0] <= conveyor.geometry.bounds[0] + conveyor.geometry.bounds[2]);
  assert.ok(parcel.transform.position[1] <= conveyor.transform.position[1]);
});

test('phase envelopes enforce neighboring pipeline handoffs', () => {
  const spec = lab.createSpecFromPrompt('dogs and cats swimming in a lake', {
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

  assert.equal(phases.phase2.artifact.languageGraph.sourceText, 'dogs and cats swimming in a lake');
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
  const iceEntity = spec.physicsIR.entities.find((row) => row.materialId === 'ice');
  const iceKey = iceEntity && `liquidFraction:${iceEntity.id}`;
  assert.ok(angularKey);
  assert.ok(iceKey && Object.hasOwn(state.solverState.channels, iceKey));
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

test('combustion solver consumes bounded fuel and conserves product plus smoke mass', () => {
  const spec = lab.createSpecFromPrompt('forest fire with wood biomass and straw', {
    allowPrototypeFallback: true,
  });
  const steps = spec.solverGraph.steps.filter((step) => step.operatorType === 'combustion');
  let state = lab.createSimulationState(spec);
  const before = structuredClone(state.solverState.channels);

  assert.equal(steps.length, 3);
  assert.ok(spec.compositionGraph.operators.every((operator) => operator.id === 'combustion'));
  assert.ok(spec.renderProgram.solverPlan.families.includes('reaction-front'));
  assert.ok(spec.renderProgram.visualIR.graphicsAtoms.mappings.some((row) => (
    row.id === 'visual.operator.thermal-combustion.v1'
  )));

  for (let index = 0; index < 40; index += 1) state = lab.stepSimulation(state, spec, 0.016);
  for (const step of steps) {
    const receipt = step.receipt;
    const fuelId = receipt.consumedChannels[0];
    const productId = receipt.producedChannels.find((id) => id.startsWith('product:'));
    const smokeId = receipt.producedChannels.find((id) => id.startsWith('smoke:'));
    const temperatureId = receipt.producedChannels.find((id) => id.startsWith('temperature:'));
    const afterFuel = state.solverState.channels[fuelId];
    const afterProduct = state.solverState.channels[productId];
    const afterSmoke = state.solverState.channels[smokeId];
    const fuelLoss = before[fuelId] - afterFuel;
    const productGain = afterProduct - before[productId];
    const smokeGain = afterSmoke - before[smokeId];

    assert.equal(receipt.schema, 'simulatte.solverChannelReceipt.v1');
    assert.match(receipt.sourceEdgeId, /^grounded-combustion:/);
    assert.ok(receipt.evidence.includes('phase4-grounded-combustion'));
    assert.ok([afterFuel, afterProduct, afterSmoke].every((value) => value >= 0 && value <= 1));
    assert.ok(state.solverState.channels[temperatureId] >= before[temperatureId]);
    assert.ok(fuelLoss > 0 && productGain > 0 && smokeGain > 0);
    assert.ok(Math.abs(fuelLoss - productGain - smokeGain) < 1e-10);
  }
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
      assert.equal(canvas.dataset.renderInputSerial, '1');
      assert.equal(canvas.dataset.phase7Input, 'simulatte.renderExecutionInput.v1');
      assert.equal(canvas.dataset.renderExecutionInput, 'simulatte.renderExecutionInput.v1');
      assert.equal(canvas.dataset.phase7SceneRenderPacketInput, 'simulatte.sceneRenderPacket.v1');
      assert.equal(canvas.dataset.phase7RenderData, 'simulatte.phase7.compactRenderData.v1');
      assert.equal(canvas.dataset.phase7RenderPath, 'depth-lit-storage-object-parts-with-uniform-fallback');
      assert.match(canvas.dataset.sceneRenderPacket || '', /simulatte\.sceneRenderPacket\.v1/);
      assert.ok(Number(canvas.dataset.sceneRenderEntityCount) > 0, `${prompt} should report packet entity count`);
      assert.ok(Number(canvas.dataset.sceneRenderDrawCount) > 0, `${prompt} should compile compact draw rows`);
      assert.equal(canvas.dataset.webgpuSceneInstanceCapacity, '256');
      assert.equal(renderer.renderData.sceneInstanceCapacity, 256);
      assert.equal(renderer.renderData.sceneInstanceCount, renderer.renderData.objectPartCount);
      assert.equal(renderer.renderData.drawCount, renderer.renderData.objectPartCount + 1);
      assert.equal(renderer.renderData.drawCount, Number(canvas.dataset.sceneRenderDrawCount));
      assert.equal(renderer.renderData.sceneInstanceCount, Number(canvas.dataset.webgpuSceneInstanceCount));
      assert.match(canvas.dataset.sceneRenderSpatialHash || '', /^[0-9a-f]{8}$/);
      assert.match(canvas.dataset.phase7RenderDataKey || '', /^[a-z0-9-]+:\d+:\d+:\d+:[0-9a-f]{8}$/);
      assert.match(canvas.dataset.sceneObjectUniforms || '', /@/, `${prompt} should pack scene object uniforms`);
      assert.match(canvas.dataset.sceneObjectIdentities || '', /@/, `${prompt} should report packed scene object identities`);
      assert.equal(renderer.renderData.drawCount, Number(canvas.dataset.sceneRenderDrawCount));
      const renderData = renderer.renderData;
      const renderDataKey = canvas.dataset.phase7RenderDataKey;
      renderer.setRenderExecutionInput(lab.createRenderExecutionInput(spec, { fields: { heat: 0.7 } }, canvas));
      assert.equal(canvas.dataset.renderInputSerial, '2');
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
  const renderPipelineDescriptors = [];
  const writeBufferCalls = [];
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
    createRenderPipeline: (descriptor) => {
      renderPipelineDescriptors.push(descriptor);
      return {};
    },
    createBindGroup: () => ({}),
    createTexture: () => ({ createView: () => ({}), destroy: () => {} }),
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
      copyTextureToBuffer: (source, destination) => {
        copyCalls.push({ ...destination, origin: source.origin });
        destination.buffer.data.set(readbackRgba, destination.offset || 0);
      },
      finish: () => ({}),
    }),
    queue: {
      writeBuffer: (buffer, offset, data) => {
        writeBufferCalls.push({ bufferBytes: buffer.data.length, offset, dataBytes: data.byteLength });
        assert.ok(offset + data.byteLength <= buffer.data.length, 'GPU write must fit its destination buffer');
      },
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
        getPreferredCanvasFormat: () => 'bgra8unorm',
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
    assert.equal(renderPipelineDescriptors.length, 2);
    assert.ok(renderPipelineDescriptors.every((descriptor) => descriptor.depthStencil?.format === 'depth24plus'));
    assert.equal(configureDescriptor.usage & GPUTextureUsage.COPY_SRC, GPUTextureUsage.COPY_SRC);

    const spec = lab.createSpecFromPrompt('dogs and cats swimming in a lake', {
      allowPrototypeFallback: true,
    });
    const renderExecutionInput = lab.createRenderExecutionInput(spec, { t: 0 }, canvas);
    renderer.setRenderExecutionInput(renderExecutionInput);
    assert.equal(renderer.renderData.requireLivePixelSamples, true);
    assert.equal(renderer.render(renderExecutionInput, 16), true);
    assert.ok(writeBufferCalls.length >= 3);
    assert.equal(renderer.phase7Output.artifact.renderExecution.rendererConsumption.cameraConsumed, true);
    assert.ok(renderer.phase7Output.artifact.renderExecution.rendererConsumption.lightCountConsumed > 0);
    assert.ok(renderer.phase7Output.artifact.renderExecution.rendererConsumption.materialCountConsumed > 0);
    assert.equal(renderer.phase7Output.artifact.renderExecution.rendererConsumption.depthEnabled, true);
    assert.equal(renderer.phase7Output.artifact.renderExecution.rendererConsumption.normalShading, true);
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
    assert.equal(
      copyCalls[0].origin.y,
      renderer.renderData.livePixelSamples.samples[0].y
    );

    readbackRgba = [218, 134, 44, 255];
    assert.equal(renderer.render(renderExecutionInput, 32), true);
    await renderer.pendingPixelReadbackPromise;
    const audit = renderer.phase7Output.artifact.renderExecution.pixelAudit;
    const sampledIds = audit.livePixelAudit.sampledObligationIds;

    assert.equal(audit.status, 'pass', JSON.stringify(audit.checks));
    assert.equal(audit.method, 'webgpu-live-pixel-samples');
    assert.equal(audit.livePixelAudit.required, true);
    assert.ok(sampledIds.includes('visual:wake-ripples'));
    assert.ok(sampledIds.includes('visual:partial-submersion'));
    assert.equal(canvas.dataset.phase7PixelReadback, 'pass');
    assert.equal(canvas.dataset.phase7PixelProofStatus, 'pass');
    assert.equal(renderer.lastPixelReadbackReceipt.status, 'pass');
    assert.deepEqual(renderer.renderData.livePixelSamples.samples[0].rgba, [44, 134, 218, 255]);
    assert.equal(renderer.phase8Output.artifact.sceneProof.verdict, 'pass');
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
  assert.equal(registry.operatorFor('particle_deposition').step, depositionSolver.step);
});

test('primitive retrieval uses catalog retrievability policy without hardcoded exclusions', () => {
  assert.equal(lab.isRetrievablePrimitive('energy-ledger'), false);
  assert.ok(!lab.rankPhysicalPrimitives('energy ledger conservation accounting', { max: 32 })
    .some((primitive) => primitive.id === 'energy-ledger'));

  const catalogSource = runtimeSourceFromFile(
    path.join(__dirname, '..', 'public', 'blank', 'pipeline', 'phase-05-simulation', 'simulatte-physics-catalog.js')
  );
  assert.doesNotMatch(catalogSource, /primitive\.id !== 'energy-ledger'/);
  assert.match(catalogSource, /\.filter\(\(primitive\) => isRetrievablePrimitive\(primitive\)\)/);
});
