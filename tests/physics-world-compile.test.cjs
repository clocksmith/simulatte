const {
  assert,
  crypto,
  fs,
  path,
  test,
  pathToFileURL,
  lab,
  intentEmbedder,
  semanticRagApi,
  graphSynthesis,
  dopplerIntent,
  intentForensics,
  root,
  loadEmbeddingIndex,
  indexedVector,
  indexedVectorByOrder,
  indexedCardVector,
  packedVectorsBase64,
  probeAwareVector,
  probeAwareEmbedProvider,
  testRerankProvider,
  manifestFacade,
  withIntentArtifactFetch,
  createPrototypeSpec,
  assertVisualIRCase,
} = require('./physics-lab-fixture.cjs');

test('classifier direct prompt rules do not inject broad scene priors over model evidence', () => {
  const diesel = lab.classifyIntentPrompt('a diesel generator powers a crane', {
    embeddingModel: { id: 'qwen-3-embedding-0-6b-q4k-ehf16-af32', dimensions: 1024 },
    embeddingBackend: 'test',
    embeddingPriors: [
      { primitiveId: 'motor-load', score: 0.91 },
      { primitiveId: 'rigid-body', score: 0.62 },
    ],
  });
  const waterWaves = lab.classifyIntentPrompt('water waves push a small boat near the shore', {
    embeddingModel: { id: 'qwen-3-embedding-0-6b-q4k-ehf16-af32', dimensions: 1024 },
    embeddingBackend: 'test',
    embeddingPriors: [
      { primitiveId: 'water', score: 0.93 },
      { primitiveId: 'buoyant-body', score: 0.68 },
    ],
  });
  const dieselIds = new Set(diesel.priors.map((row) => row.primitiveId));
  const waterWaveIds = new Set(waterWaves.priors.map((row) => row.primitiveId));

  assert.equal(dieselIds.has('solar-panel'), false);
  assert.equal(dieselIds.has('stator-slider'), false);
  assert.equal(waterWaveIds.has('acoustic-emitter'), false);
});

test('builder creates the solar magnetic perpetual motion machine from prompt', () => {
  const spec = lab.createSpecFromPrompt(
    'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun'
  );

  assert.equal(spec.templateId, 'custom-world');
  assert.equal(spec.intent.schema, 'simulatte.intent.v1');
  assert.equal(spec.name, 'Solar Magnetic Perpetual Motion Machine');
  assert.ok(spec.modules.includes('electromagnetism'));
  assert.ok(spec.modules.includes('solar'));
  assert.ok(spec.objects.some((object) => object.id === 'rotor-wheel'));
  assert.ok(spec.controls.some((control) => control[0] === 'sliderAmplitude'));
  assert.equal(spec.params.irradiance, 780);
  assert.equal(spec.params.sliderAmplitude, 0.42);
  assert.equal(spec.params.loadTorque, 0.16);
});

test('sampled examples resolve through intent before simulation spec', () => {
  const examples = lab.EXAMPLE_INTENTS
    .filter((_, index) => index % 32 === 0)
    .concat(lab.EXAMPLE_INTENTS.at(-1));
  for (const example of examples) {
    const intent = lab.createIntentFromPrompt(example.prompt);
    const spec = lab.resolveIntentToSpec(intent);

    assert.equal(intent.schema, 'simulatte.intent.v1');
    assert.equal(spec.intent.prompt, example.prompt);
    assert.ok(['custom-world', 'blank-world'].includes(spec.templateId));
  }
});

test('prompt shuffle examples are hand-written compact and broadly diverse', () => {
  const prompts = lab.EXAMPLE_INTENTS.map((example) => example.prompt);
  const ids = lab.EXAMPLE_INTENTS.map((example) => example.id);
  const promptWords = prompts.map((prompt) => prompt.split(/\s+/).filter(Boolean).length);
  const observedWordCounts = new Set(promptWords);
  const signatures = new Set(lab.EXAMPLE_INTENTS.map((example) => JSON.stringify(example.params || {})));
  const forbiddenLabels = ['W', 'X', 'Y', 'Z', 'P', 'Q', 'Forest fire', 'Watershed', 'City grid', 'Optics', 'Mag wheel'];
  const labels = lab.EXAMPLE_INTENTS.map((example) => example.label);

  assert.equal(lab.EXAMPLE_INTENTS.length, 256);
  assert.equal(lab.HANDWRITTEN_EXAMPLE_PROMPTS.length, 256);
  assert.equal(new Set(ids).size, 256);
  assert.equal(new Set(prompts).size, 256);
  assert.equal(Math.min(...promptWords), 1);
  assert.equal(Math.max(...promptWords), 16);
  for (let wordCount = 1; wordCount <= 16; wordCount += 1) {
    assert.equal(observedWordCounts.has(wordCount), true);
  }
  assert.ok(signatures.size >= 128);
  for (const label of forbiddenLabels) assert.equal(labels.includes(label), false);

  const promptCorpus = prompts.join('\n');
  for (const term of [
    'ferrofluid',
    'asteroid',
    'neutron',
    'photosynthesis',
    'mycorrhizal',
    'subway',
    'tokamak',
    'graphene',
    'permafrost',
    'microplastics',
    'WebGPU',
  ]) {
    assert.match(promptCorpus, new RegExp(term, 'i'));
  }

  const sampleSpecs = [
    'laser heats ferrofluid lens over copper coil',
    'subway passengers distribute across transfer platforms',
    'geothermal brine flashes into separator steam',
    'tokamak confines deuterium tritium plasma',
    'chromatin segregates inside dividing cell',
    'immersion coolant boils around GPU heatsinks',
  ].map((prompt) => {
    const example = lab.EXAMPLE_INTENTS.find((entry) => entry.prompt === prompt);
    return lab.createSpecFromPrompt(example.prompt, { params: example.params });
  });
  assert.ok(new Set(sampleSpecs.map((spec) => spec.renderProgram.rendererPlan.sceneKind)).size >= 4);
});

test('state labels follow compiled renderer scene identities', () => {
  const fire = lab.createSpecFromPrompt('wind pushes a dry pine fire', {
    allowPrototypeFallback: true,
  });
  const machine = lab.createSpecFromPrompt('solar magnetic wheel with sliding magnet', {
    allowPrototypeFallback: true,
  });

  assert.equal(fire.renderProgram.rendererPlan.sceneKind, 'fire');
  assert.equal(machine.renderProgram.rendererPlan.sceneKind, 'magnetic-machine');
  assert.equal(lab.stateLabel({}, fire), 'elemental reaction world');
  assert.equal(lab.stateLabel({}, machine), 'composed magnetic machine');
});

test('blank prompt resolves to empty construction plane intent', () => {
  const intent = lab.createIntentFromPrompt('');
  const spec = lab.resolveIntentToSpec(intent);

  assert.equal(spec.templateId, 'blank-world');
  assert.deepEqual(intent.domains, ['blank']);
  assert.equal(spec.modules.length, 0);
  assert.equal(spec.objects.length, 0);
});

test('blank keywords inside real prompts do not select blank intent', () => {
  const emptyGlass = lab.createSpecFromPrompt('an empty glass fills with water', {
    allowPrototypeFallback: true,
  });
  const scratchCastle = lab.createSpecFromPrompt('build a castle from scratch while wind cracks the gate', {
    allowPrototypeFallback: true,
  });

  assert.notEqual(emptyGlass.templateId, 'blank-world');
  assert.notEqual(scratchCastle.templateId, 'blank-world');
  assert.notDeepEqual(emptyGlass.intent.domains, ['blank']);
  assert.notDeepEqual(scratchCastle.intent.domains, ['blank']);
});

test('simulation specs export, import, and remix with lineage', () => {
  const spec = lab.createSpecFromPrompt('make a fluid vortex tank with turbulence and pressure');
  const matchingSpec = lab.createSpecFromPrompt('make a fluid vortex tank with turbulence and pressure');
  const restored = lab.deserializeSpec(lab.serializeSpec(spec));
  const remix = lab.remixSpec(restored, { name: 'Fluid Vortex Remix' });
  const matchingRemix = lab.remixSpec(restored, { name: 'Fluid Vortex Remix' });

  assert.equal(restored.templateId, 'custom-world');
  assert.ok(restored.modules.includes('fluid'));
  assert.equal(restored.name, spec.name);
  assert.equal(matchingSpec.id, spec.id);
  assert.equal(remix.templateId, 'custom-world');
  assert.equal(remix.remixOf, restored.id);
  assert.equal(remix.name, 'Fluid Vortex Remix');
  assert.equal(matchingRemix.id, remix.id);
  assert.deepEqual(matchingRemix.params, remix.params);
});

test('builder composes hybrid worlds from multiple physical domains', () => {
  const spec = lab.createSpecFromPrompt('build a solar magnetic wheel in turbulent cooling fluid with catalyst chemistry');

  assert.equal(spec.templateId, 'custom-world');
  assert.ok(spec.modules.includes('electromagnetism'));
  assert.ok(spec.modules.includes('fluid'));
  assert.ok(spec.modules.includes('chemistry'));
  assert.ok(spec.controls.some((control) => control[0] === 'vortexStrength'));
  assert.ok(spec.controls.some((control) => control[0] === 'catalyst'));
  assert.ok(spec.objects.some((object) => object.id === 'catalyst-front'));
});

test('free text resolves varied physical primitive families', () => {
  const spec = createPrototypeSpec(
    'make a prismatic laser beam through a lens with sound waves, sand, plasma, bubbles, and spring constraint collisions'
  );
  const ids = new Set(spec.objects.map((object) => object.id));

  assert.equal(spec.intent.resolution.ranker, 'simulatte-local-tfidf-prototype-embedder.v1');
  assert.equal(spec.intent.classification.schema, 'simulatte.intentClassification.v1');
  assert.ok(spec.intent.classification.priors.length >= 8);
  assert.ok(spec.intent.conceptGraph.length >= 8);
  assert.ok(spec.modules.includes('optics'));
  assert.ok(spec.modules.includes('acoustics'));
  assert.ok(spec.modules.includes('granular'));
  assert.ok(spec.modules.includes('plasma'));
  assert.ok(spec.modules.includes('buoyancy'));
  assert.ok(spec.modules.includes('elasticity'));
  assert.ok(ids.has('optical-prism'));
  assert.ok(ids.has('acoustic-emitter'));
  assert.ok(ids.has('granular-bed'));
  assert.ok(ids.has('plasma-arc'));
  assert.ok(ids.has('buoyant-body'));
  assert.ok(ids.has('spring-constraint'));
});

test('world builder resolves broader component families for composed worlds', () => {
  const spec = createPrototypeSpec(
    'terrain erosion river with logistics nodes, market demand, queue backlog, noisy sensors, feedback control, infection front, phase change, data recorder, and audit trace'
  );
  const ids = new Set(spec.objects.map((object) => object.id));

  assert.equal(spec.templateId, 'custom-world');
  assert.ok(spec.intent.components.length >= 12);
  assert.ok(spec.modules.includes('terrain'));
  assert.ok(spec.modules.includes('logistics'));
  assert.ok(spec.modules.includes('market'));
  assert.ok(spec.modules.includes('queue'));
  assert.ok(spec.modules.includes('signal'));
  assert.ok(spec.modules.includes('control'));
  assert.ok(spec.modules.includes('biology'));
  assert.ok(spec.modules.includes('phase-change'));
  assert.ok(ids.has('terrain-heightfield'));
  assert.ok(ids.has('erosion-channel'));
  assert.ok(ids.has('logistics-node'));
  assert.ok(ids.has('market-demand'));
  assert.ok(ids.has('queue-server'));
  assert.ok(ids.has('sensor-array'));
  assert.ok(ids.has('feedback-controller'));
  assert.ok(ids.has('infection-front'));
  assert.ok(ids.has('phase-change-material'));
  assert.ok(ids.has('data-recorder'));
  assert.ok(spec.controls.some((control) => control[0] === 'queueBacklog'));
  assert.ok(spec.controls.some((control) => control[0] === 'controlGain'));
});

test('layered catalog separates math, physics, material, component, composition, and scene libraries', () => {
  assert.deepEqual(lab.LAYER_STACK.map((layer) => layer.id), [
    'math',
    'physics',
    'material',
    'component',
    'composition',
    'scene',
  ]);
  assert.equal(lab.COMPILER_INPUT_PLANE.id, 'compiler');
  assert.ok(lab.COMPILER_INPUT_PLANE.targetLayers.includes('scene'));
  assert.equal(lab.MATH_PRIMITIVE_LIBRARY.length, 63);
  assert.equal(lab.PHYSICS_PRIMITIVE_LIBRARY.length, 65);
  assert.equal(lab.MATERIAL_PRIMITIVE_LIBRARY.length, 114);
  assert.equal(lab.COMPONENT_LIBRARY.length, 60);
  assert.equal(lab.COMPOSITION_LIBRARY.length, 34);
  assert.equal(lab.SCENE_LIBRARY.length, 26);
  assert.equal(lab.LAYERED_PRIMITIVES.length, 362);
  assert.equal(lab.PHYSICAL_PRIMITIVES.length, 420);
  assert.equal(lab.primitiveById('rigid-body').layer, 'physics');
  assert.equal(lab.primitiveById('soft-body').layer, 'physics');
  assert.equal(lab.primitiveById('bonding').layer, 'physics');
  assert.equal(lab.primitiveById('aerodynamics').layer, 'physics');
  assert.equal(lab.primitiveById('magnetohydrodynamics').layer, 'physics');
  assert.equal(lab.primitiveById('gold').layer, 'material');
  assert.equal(lab.primitiveById('dna').layer, 'material');
  assert.equal(lab.primitiveById('lava').layer, 'material');
  assert.equal(lab.primitiveById('blood').layer, 'material');
  assert.equal(lab.primitiveById('molecular-chain').layer, 'component');
  assert.equal(lab.primitiveById('heart-pump').layer, 'component');
  assert.equal(lab.primitiveById('drone-flight').layer, 'composition');
  assert.equal(lab.primitiveById('rocket-ascent').layer, 'composition');
  assert.equal(lab.primitiveById('reef-tank').layer, 'scene');
  assert.equal(lab.primitiveById('electronics-bench').layer, 'scene');
  assert.ok(lab.materialPropertiesForId('gold').conductivity > 0.8);
  assert.ok(lab.materialPropertiesForId('dna').moisture > 0.5);
  assert.ok(lab.materialPropertiesForId('blood').moisture > 0.9);
  assert.ok(lab.materialPropertiesForId('superconductor').conductivity > 0.9);
});

test('canonical layer recipes only compose the immediately lower layer', () => {
  const validation = lab.validateLayerAdjacency();

  assert.equal(validation.schema, 'simulatte.layerAdjacency.v1');
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
  assert.equal(lab.lowerLayerFor('scene'), 'composition');
  assert.equal(lab.lowerLayerFor('component'), 'material');
  assert.equal(lab.layerForId('water'), 'material');
  assert.equal(lab.layerForId('fluid-advection'), 'physics');
});

test('math layer stays neutral and leaves physical quantities to higher layers', () => {
  const forbidden = /\b(heat|pressure|density|velocity|force|moisture|charge|temperature|energy|mass|fuel)\b/i;
  const mathText = lab.MATH_PRIMITIVE_LIBRARY
    .map((primitive) => primitive.text)
    .join(' ');

  assert.doesNotMatch(mathText, forbidden);
  assert.ok(lab.MATH_PRIMITIVE_LIBRARY.some((primitive) => primitive.id === 'scalar-field'));
  assert.ok(lab.MATH_PRIMITIVE_LIBRARY.some((primitive) => primitive.id === 'vector-field'));
  assert.ok(lab.MATH_PRIMITIVE_LIBRARY.some((primitive) => primitive.id === 'signed-distance-field'));
  assert.ok(lab.MATH_PRIMITIVE_LIBRARY.some((primitive) => primitive.id === 'laplacian'));
  assert.ok(lab.PHYSICS_PRIMITIVE_LIBRARY.some((primitive) => primitive.id === 'pressure'));
  assert.ok(lab.PHYSICS_PRIMITIVE_LIBRARY.some((primitive) => primitive.id === 'heat-transfer'));
});

test('downloaded embedding priors steer retrieval, regimes, and solver plans', () => {
  const modelOptions = {
    embeddingPriors: [
      { primitiveId: 'mycelium', score: 0.98 },
      { primitiveId: 'membrane', score: 0.94 },
      { primitiveId: 'gel', score: 0.91 },
      { primitiveId: 'bacteria', score: 0.88 },
      { primitiveId: 'wave-source', score: 0.82 },
    ],
    embeddingModel: {
      id: 'qwen-3-embedding-0-6b-q4k-ehf16-af32',
      family: 'qwen3-embedding',
      dimensions: 1024,
      indexId: 'simulatte-primitive-qwen-3-embedding-0-6b-index-v1',
      reranker: 'simulatte.doppler-intent-reranker.v1',
    },
    embeddingBackend: 'webgpu',
    intentRerank: {
      schema: 'simulatte.intentRerank.v1',
      required: true,
      top: ['mycelium', 'membrane', 'gel'],
    },
  };
  const spec = lab.createSpecFromPrompt(
    'soft fungal membrane colony with gel diffusion and pressure waves',
    modelOptions
  );
  const ids = new Set(spec.objects.map((object) => object.id));
  const regimes = new Set(spec.renderProgram.objects.map((object) => object.visualRegime));
  const solverFamilies = new Set(spec.renderProgram.solverPlan.families);

  assert.equal(spec.intent.classification.model.id, 'simulatte-qwen-3-embedding-0-6b-q4k-ehf16-af32-intent-ranker.v1');
  assert.equal(spec.intent.classification.model.runtime.backend, 'webgpu');
  assert.equal(spec.intent.classification.model.runtime.indexId, 'simulatte-primitive-qwen-3-embedding-0-6b-index-v1');
  assert.equal(spec.intent.rerank.schema, 'simulatte.intentRerank.v1');
  assert.equal(spec.physicalSpec.receipt.rerank.required, true);
  assert.ok(ids.has('mycelium'));
  assert.ok(ids.has('membrane'));
  assert.ok(ids.has('gel'));
  assert.ok(regimes.has('biological'));
  assert.ok(regimes.has('soft'));
  assert.ok(solverFamilies.has('reaction-diffusion'));
  assert.ok(solverFamilies.has('wave-equation'));
  assert.equal(solverFamilies.has('growth-diffusion'), false);
  assert.ok(spec.phaseArtifacts.phase5.artifact.simulationCompile.physicsIR.operators.every((row) => (
    row.receipt?.schema === 'simulatte.solverChannelReceipt.v1'
  )));
  assert.equal(spec.renderProgram.visualIR.graphicsAtoms.mappings.some((row) => (
    row.id === 'visual.operator.biological-growth.v1'
  )), false);

  const inactive = lab.createSpecFromPrompt(
    'soft fungal membrane colony beside gel and a pressure gauge',
    modelOptions
  );
  assert.equal(inactive.phaseArtifacts.phase5.artifact.simulationCompile.physicsIR.operators.some((row) => (
    ['growth_decay', 'reaction_diffusion', 'wave_field'].includes(row.type)
  )), false);
});

test('component and scene prompts materialize lower-layer recipes', () => {
  const spec = lab.createSpecFromPrompt(
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall'
  );
  const ids = new Set(spec.objects.map((object) => object.id));

  assert.ok(ids.has('forest-fire'));
  assert.ok(ids.has('flame'));
  assert.ok(ids.has('combustion'));
  assert.ok(ids.has('heat-transfer'));
  assert.ok(ids.has('smoke'));
  assert.ok(ids.has('wood'));
  assert.ok(ids.has('water'));
  assert.ok(ids.has('rock-wall'));
  assert.ok(spec.modules.includes('composition'));
  assert.ok(spec.modules.includes('component'));
  assert.ok(spec.modules.includes('material'));
  assert.ok(spec.modules.includes('physics'));
  assert.ok(spec.modules.includes('fire'));
});

test('optics prompts are built from elemental materials and operators', () => {
  const spec = lab.createSpecFromPrompt(
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor'
  );
  const ids = new Set(spec.objects.map((object) => object.id));

  assert.ok(ids.has('optics-bench'));
  assert.ok(ids.has('sun-lamp'));
  assert.ok(ids.has('lens'));
  assert.ok(ids.has('mirror'));
  assert.ok(ids.has('prism'));
  assert.ok(ids.has('glass'));
  assert.ok(ids.has('optics'));
  assert.ok(ids.has('radiation'));
  assert.ok(spec.modules.includes('scene'));
  assert.ok(spec.modules.includes('composition'));
  assert.ok(spec.modules.includes('optics'));
  assert.ok(spec.modules.includes('glass'));
});

test('layer contracts attach material properties, interactions, ports, slots, layout, and readouts', () => {
  const spec = lab.createSpecFromPrompt(
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall'
  );
  const flame = spec.objects.find((object) => object.id === 'flame');
  const slots = spec.contract.recipeSlots['forest-fire'];

  assert.equal(spec.contract.schema, 'simulatte.layerContract.v1');
  assert.equal(spec.contract.adjacency.valid, true);
  assert.deepEqual(spec.contract.layerStack.map((layer) => layer.id), [
    'math',
    'physics',
    'material',
    'component',
    'composition',
    'scene',
  ]);
  assert.equal(spec.contract.compilerInputPlane.id, 'compiler');
  assert.equal(spec.contract.layerFocus, 'composition');
  assert.ok(spec.contract.topLevel.includes('forest-fire'));
  assert.equal(spec.contract.materials.water.moisture, 1);
  assert.ok(spec.contract.interactions.some((rule) => rule.id === 'water-suppresses-fire'));
  assert.ok(spec.contract.interactions.some((rule) => rule.id === 'dry-wood-burns'));
  assert.ok(slots.some((slot) => slot.slot === 'fuel bed' && slot.required));
  assert.ok(slots.some((slot) => slot.slot === 'moisture' && !slot.required));
  assert.ok(flame.ports.outputs.includes('heat'));
  assert.equal(spec.contract.layout.grammar, 'patch spread');
  assert.deepEqual(lab.readoutLabelsForSpec(spec), [
    'fuel load',
    'burn front',
    'smoke',
    'moisture',
    'wind',
    'containment',
  ]);
});

test('graph IR carries units, operators, conservation, temporal events, and explanation', () => {
  const spec = lab.createSpecFromPrompt(
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall'
  );
  const graph = spec.contract.graph;

  assert.equal(graph.schema, 'simulatte.physicalGraph.v1');
  assert.equal(graph.units.combustibility.dimension, 'probability');
  assert.equal(graph.units.heatTransfer.dimension, 'rate');
  assert.ok(graph.nodes.some((node) => node.id === 'flame' && node.nodeType === 'source'));
  assert.ok(graph.nodes.some((node) => node.id === 'flame' && Number.isFinite(node.state.temperature)));
  assert.ok(graph.edges.some((edge) => edge.type === 'transfersEnergy' || edge.type === 'constrains'));
  assert.ok(graph.operators.some((operator) => operator.id === 'combustion'));
  assert.ok(graph.operators.some((operator) => operator.id === 'advection'));
  assert.ok(graph.conservation.some((rule) => rule.id === 'combustion-mass-energy'));
  assert.ok(graph.temporal.some((event) => event.id === 'ignition'));
  assert.equal(graph.coverage.schema, 'simulatte.promptCoverage.v1');
  assert.equal(graph.quality.schema, 'simulatte.physicalQuality.v1');
  assert.equal(graph.validation.status, 'valid');
  assert.equal(graph.explanation.topIdentity, 'forest-fire');
  assert.ok(graph.explanation.expanded.includes('flame'));
  assert.ok(graph.explanation.interactions.includes('water-suppresses-fire'));
});

test('prompt worlds compile into Grid-like classifier composition graphs', () => {
  const fire = createPrototypeSpec(
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall'
  );
  const optics = createPrototypeSpec(
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor'
  );
  const city = createPrototypeSpec(
    'city grid routes traffic through a power grid and market queue with sensors, delays, and conservation ledger'
  );
  const staticCity = createPrototypeSpec(
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger'
  );
  const machine = createPrototypeSpec(
    'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun'
  );

  assert.equal(fire.physicalSpec.schema, 'simulatte.physicalSpec.v1');
  assert.equal(fire.compositionGraph.schema, 'simulatte.compositionGraph.v1');
  assert.equal(fire.renderProgram.schema, 'simulatte.renderProgram.v1');
  assert.ok(fire.intent.classification.priors.some((prior) => prior.primitiveId === 'forest-fire'));
  assert.ok(fire.compositionGraph.operators.some((operator) => operator.id === 'combustion'));
  assert.ok(fire.renderProgram.objects.some((object) => object.shape === 'flame-front'));
  assert.ok(fire.renderProgram.emitters.some((emitter) => emitter.kind === 'plume'));
  assert.ok(fire.renderProgram.solverPlan.families.includes('reaction-front'));
  assert.ok(optics.intent.classification.priors.some((prior) => prior.primitiveId === 'optics-bench'));
  assert.ok(optics.renderProgram.objects.some((object) => object.shape === 'prism'));
  assert.ok(optics.renderProgram.fields.some((field) => field.kind === 'optical-rays'));
  assert.ok(optics.renderProgram.provenance.visualRegimes.includes('optical'));
  assert.ok(city.intent.classification.priors.some((prior) => prior.primitiveId === 'city-grid'));
  assert.ok(city.renderProgram.objects.some((object) => object.shape === 'queue-node'));
  assert.ok(city.renderProgram.fields.some((field) => field.kind === 'network-flow'));
  assert.equal(staticCity.phaseArtifacts.phase4.artifact.groundedIntent.acceptedGraph.intentBrief
    .causalGraph.some((row) => row.ruleId === 'causal.arrivals-create-queue'), false);
  assert.equal(staticCity.phaseArtifacts.phase5.artifact.simulationCompile.physicsIR.operators
    .some((row) => row.type === 'network_flow'), false);
  assert.ok(machine.compositionGraph.nodes.some((node) => node.primitiveId === 'rotor-wheel'));
  assert.ok(machine.renderProgram.objects.some((object) => object.shape === 'wheel'));
  const magneticField = machine.physicsIR.operators.find((row) => (
    row.type === 'wave_field' &&
    row.receipt?.inferenceProvenance?.causalRuleId === 'causal.magnetic-slider-drives-machine-field'
  ));
  assert.ok(magneticField);
  assert.deepEqual(magneticField.receipt.consumedChannels, magneticField.reads);
  assert.deepEqual(magneticField.receipt.producedChannels, magneticField.writes);
  assert.ok(machine.renderProgram.visualIR.graphicsAtoms.mappings.some((row) => (
    row.id === 'visual.operator.electromagnetic-field.v1'
  )));
  assert.equal(machine.physicalSpec.executionSource, 'solverGraph');
  assert.ok(machine.physicalSpec.renderPasses.includes('wave-field-solve'));
});

test('prompt worlds choose distinct regime renderer identities', () => {
  const cases = [
    [
      'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall',
      'fire',
      'thermal',
    ],
    [
      'wind pushes a dry pine fire over a ridge',
      'fire',
      'thermal',
    ],
    [
      'thermal plume bends smoke over cooling fins',
      'thermal-plume',
      'thermal',
    ],
    [
      'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor',
      'optics',
      'optical',
    ],
    [
      'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger',
      'city',
      'network',
    ],
    [
      'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun',
      'magnetic-machine',
      'magnetic',
    ],
    [
      'ferrofluid spikes around copper coils under pulsing current',
      'ferrofluid',
      'magnetic',
    ],
    [
      'mountain watershed with river erosion, terrain patch, sand, soil, rock, water, and gravity',
      'watershed',
      'fluid',
    ],
    [
      'granular beads avalanche through a vibrating sieve',
      'granular',
      'granular',
    ],
    [
      'soap film colors stretch around air bubbles and wire loops',
      'thin-film',
      'optical',
    ],
    [
      'water air rock wood metal glass magnetized metal gravity heat diffusion sample tray',
      'material-tray',
      'material',
    ],
    [
      'biological colony with mycelium membrane bacteria growth diffusion and protein gel',
      'biology',
      'biological',
    ],
    [
      'acoustic pressure waves through brass tubes and water',
      'acoustic',
      'acoustic',
    ],
  ];

  for (const [prompt, sceneKind, dominantRegime] of cases) {
    const spec = createPrototypeSpec(prompt);

    assert.equal(spec.renderProgram.rendererPlan.schema, 'simulatte.rendererPlan.v1');
    assert.equal(spec.renderIR.sceneHint, sceneKind);
    assert.equal(spec.renderProgram.rendererPlan.sceneKind, sceneKind);
    assert.equal(spec.renderProgram.rendererPlan.dominantRegime, dominantRegime);
    assert.equal(spec.renderProgram.provenance.visualIdentity.sceneKind, sceneKind);
    assert.equal(spec.physicalSpec.receipt.visualIdentity.sceneKind, sceneKind);
    assert.match(spec.renderProgram.rendererPlan.renderer, new RegExp(`\\.${sceneKind}\\.v1$`));
    assert.ok(spec.renderProgram.rendererPlan.passOrder.length >= 4);
  }
});

test('VisualIR compiles hard natural language into structural render programs', () => {
  const cases = [
    [
      'neutrino detector in underground water tank with photon cones and phototube array',
      'particle-instrument',
      'optics',
      'instrumented-lab-depth',
    ],
    [
      'housing market pressure routes household agents across parcels under zoning constraints',
      'civic-market',
      'city',
      'aerial-map-depth',
    ],
    [
      'protein folding energy minimization with bond constraints and collapse motion',
      'molecular-biology',
      'biology',
      'microscopic-cutaway-depth',
    ],
    [
      'fusion stellarator plasma ribbon twisting inside coil cage',
      'advanced-energy',
      'material-tray',
      'cutaway-section-depth',
    ],
    [
      'mangrove roots buffering storm surge while sediment settles in brackish tidal channels',
      'restoration-water',
      'watershed',
      'aerial-map-depth',
    ],
    [
      'blockchain mempool packet routing through validator network',
      'digital-network',
      'city',
      'aerial-map-depth',
    ],
    [
      'ammonia synthesis catalyst bed reaction inside pressure vessel',
      'chemistry-lab',
      'material-tray',
      'cutaway-section-depth',
    ],
    [
      'hospital bedflow patient agents capacity balancing between ward units',
      'clinical-control',
      'biology',
      'cutaway-section-depth',
    ],
    [
      'planetary rings shepherd moon resonance sorting ice boulders',
      'planetary-space',
      'optics',
      'aerial-map-depth',
    ],
    [
      'air quality urban valley particulate dispersion through buildings',
      'hazard-atmosphere',
      'watershed',
      'aerial-map-depth',
    ],
  ];

  for (const [prompt, sceneKind, painterKind, camera] of cases) {
    assertVisualIRCase(prompt, { sceneKind, painterKind, camera });
  }

  const inactiveCases = [
    ['neutrino detector in an underground water tank with a phototube array', 'wave_field'],
    ['housing market beside parcels with household agents and zoning constraints', 'network_flow'],
    ['protein folding with bond constraints', 'wave_field'],
    ['blockchain mempool beside a validator network', 'network_flow'],
  ];
  for (const [prompt, operatorType] of inactiveCases) {
    const spec = createPrototypeSpec(prompt);
    assert.equal(spec.phaseArtifacts.phase5.artifact.simulationCompile.physicsIR.operators
      .some((row) => row.type === operatorType), false, prompt);
  }
});

test('prototype construction retrieval uses a bounded lexical index with honest receipts', () => {
  const prompt = 'robot with red eyes and bendable straw arms';
  const spec = createPrototypeSpec(prompt);
  const phase2 = spec.intent.phaseArtifacts.phase2.artifact;
  const retrieval = spec.intent.phaseArtifacts.phase3.artifact.retrievalRerankResult.slotRetrieval;
  const repeated = semanticRagApi.createPrototypeSlotRetrieval(phase2.queryPlan, prompt);
  const robotSlot = retrieval.bySlot.find((row) => row.slotId === 'slot.object.robot');
  const armSlot = retrieval.bySlot.find((row) => row.slotId === 'slot.part.arm');
  const robotNode = spec.universeGraph.nodes.find((row) => row.semanticClass === 'robot');

  assert.equal(retrieval.mode, 'prototype-lexical-construction-index');
  assert.equal(retrieval.model, '');
  assert.equal(retrieval.embeddedSlotCount, 0);
  assert.equal(retrieval.rerankCallCount, 0);
  assert.ok(retrieval.indexReceipt.postingVisits < retrieval.indexReceipt.cardCount);
  assert.ok(retrieval.indexReceipt.scoredCardCount < retrieval.indexReceipt.cardCount);
  assert.deepEqual(repeated, retrieval, 'the cached index preserves stable candidate order and receipts');
  assert.equal(robotSlot.candidates[0].candidateId, 'artifact.robot');
  assert.deepEqual(armSlot.candidates, [], 'single-token arm does not borrow the broader robot-arm family');
  assert.ok(robotSlot.candidates.every((row) => (
    row.modelEvaluated === false && row.modelRerankEvaluated === false && row.modelScore === null
  )));
  assert.equal(robotSlot.receipt.modelStatus, 'not-run');
  assert.equal(robotSlot.receipt.skipReason, 'explicit-prototype-lexical-control-lane');
  assert.ok(robotNode.construction.partHints.includes('revolute joints'));
  assert.deepEqual(robotNode.constructionProvenance.map((row) => ({
    modelScore: row.modelScore,
    modelRerankScore: row.modelRerankScore,
    modelEvaluated: row.modelEvaluated,
    rerankEvaluated: row.rerankEvaluated,
  })), [{
    modelScore: null,
    modelRerankScore: null,
    modelEvaluated: false,
    rerankEvaluated: false,
  }], 'Phase 4 preserves unevaluated construction evidence without fabricating model scores');
});

test('prototype lexical construction matches tokens rather than substrings', () => {
  const queryPlan = {
    schema: 'simulatte.sceneQueryPlan.v1',
    sourcePromptHash: 'fnv1a:test',
    slots: [{
      schema: 'simulatte.sceneQuerySlot.v1',
      slotId: 'slot.object.catalyst',
      slotRole: 'object',
      entryId: 'entity:catalyst',
      sourceLabel: 'catalyst',
      required: true,
      queries: [{ kind: 'lexical', text: 'catalyst' }],
    }],
  };
  const retrieval = semanticRagApi.createPrototypeSlotRetrieval(queryPlan, 'catalyst');
  const candidates = retrieval.bySlot[0].candidates;

  assert.equal(candidates.some((row) => row.candidateId === 'entity.cat'), false);
  assert.equal(candidates.some((row) => /\bcat\b/.test(row.label)), false);
});

test('prototype concrete noun slots preserve exact construction graphs for syntactic participants', () => {
  const cases = [
    ['violin on stool', 'entity:violin', 'construction.resonant-instrument', 'resonant-instrument', ''],
    ['violin on stool', 'entity:stool', 'construction.stool', 'stool', ''],
    ['octopus holding teapot', 'entity:octopus', 'entity.octopus', 'cephalopod', ''],
    ['octopus holding teapot', 'entity:teapot', 'construction.teapot', 'teapot', ''],
  ];

  for (const [prompt, entryId, candidateId, topologyId, establishedGrammarId] of cases) {
    const spec = createPrototypeSpec(prompt);
    const retrieval = spec.intent.phaseArtifacts.phase3.artifact.retrievalRerankResult.slotRetrieval;
    const slot = retrieval.bySlot.find((row) => row.entryId === entryId);
    assert.ok(slot, `${entryId} has a construction retrieval row`);
    assert.equal(slot.candidates[0].candidateId, candidateId);
    assert.equal(slot.candidates[0].literalSlotMatch, true);
    assert.equal(slot.candidates[0].modelEvaluated, false);
    assert.equal(slot.candidates[0].modelScore, null);
    const programs = spec.renderProgram.sceneRenderPacket.entities
      .map((entity) => entity.geometry && entity.geometry.program)
      .filter(Boolean);
    if (topologyId) {
      const program = programs.find((row) => row.constructionReceipt?.topologyId === topologyId);
      assert.ok(program, `${entryId} compiles the ${topologyId} construction topology`);
      assert.equal(program.constructionReceipt.literalSlotMatch, true);
      assert.equal(program.constructionReceipt.exactTargetMatch, true);
      assert.equal(program.constructionReceipt.modelEvaluated, false);
    } else {
      assert.ok(programs.some((row) => row.grammarId === establishedGrammarId));
    }
  }
});

test('generated relation phrases remain support evidence instead of visible entities', () => {
  const spec = createPrototypeSpec('yellow excavator beside a glass greenhouse');
  const retrieval = spec.intent.phaseArtifacts.phase3.artifact.retrievalRerankResult;
  const relationPrimitive = retrieval.supportPrimitives.find((row) => row.id === 'open-excavator-beside-1');
  const visibleIds = spec.renderProgram.sceneRenderPacket.entities.map((row) => row.id);

  assert.ok(relationPrimitive);
  assert.equal(relationPrimitive.supportOnly, true);
  assert.equal(relationPrimitive.matchKind, 'open-association-support');
  assert.equal(visibleIds.includes('open-excavator-beside-1'), false);
  assert.equal(visibleIds.some((id) => id.includes('open-excavator-beside')), false);
});

test('direct prompt objects outrank inferred scene tags and remain peer-scale beside one another', () => {
  const violin = createPrototypeSpec('purple violin on a wooden stool');
  const excavator = createPrototypeSpec('yellow excavator beside a glass greenhouse');
  const octopus = createPrototypeSpec('an octopus holding a teapot');

  assert.equal(violin.renderProgram.rendererPlan.sceneKind, 'acoustic');
  assert.equal(excavator.renderProgram.rendererPlan.sceneKind, 'mechanical');
  assert.equal(octopus.renderProgram.rendererPlan.sceneKind, 'biology');

  const violinPacket = violin.renderProgram.sceneRenderPacket;
  assert.equal(violinPacket.fields.length, 0, 'static object relations do not invent state fields');
  assert.equal(violinPacket.effects.length, 0, 'static object relations do not invent process effects');
  assert.equal(violin.renderProgram.visualIR.graphicsAtoms.mappings.length, 0,
    'an instrument identity alone does not invent a measurement readout');
  const violinContact = violinPacket.receipts.framing.surfaceContacts.find((row) => (
    row.sourceId === 'prompt-body-violin' && row.targetId === 'prompt-body-stool'
  ));
  assert.ok(violinContact, 'the on relation compiles a realized surface-contact receipt');
  assert.ok(violinContact.clearanceAfter >= -0.005 && violinContact.clearanceAfter <= -0.003,
    'visible violin geometry rests inside the visible stool edge without a rasterized gap');
  assert.equal(violinContact.contactInset, 0.004);
  const violinProgram = violinPacket.entities.find((row) => row.identity.type === 'violin').geometry.program;
  const violinParts = new Map(violinProgram.parts.map((part) => [part.id, part]));
  assert.ok(['upper-bout', 'waist', 'lower-bout', 'neck', 'bridge', 'soundhole-left', 'soundhole-right']
    .every((partId) => violinParts.has(partId)), 'the instrument topology names its recognizable silhouette parts');
  assert.equal(violinProgram.parts.filter((part) => /^string-\d+$/.test(part.id)).length, 4);
  assert.ok(violinParts.get('upper-bout').center[1] < violinParts.get('lower-bout').center[1]);
  assert.ok(violinParts.get('upper-bout').size[0] < violinParts.get('lower-bout').size[0]);
  assert.ok(violinParts.get('neck').center[1] < violinParts.get('upper-bout').center[1]);
  const stoolProgram = violinPacket.entities.find((row) => row.label === 'stool').geometry.program;
  assert.ok(stoolProgram.parts.some((part) => part.id === 'seat'));
  assert.equal(stoolProgram.parts.filter((part) => /^leg-\d+$/.test(part.id)).length, 4);

  const pair = excavator.renderProgram.sceneRenderPacket.entities;
  const widths = pair.map((row) => row.transform.scale[0]);
  assert.ok(Math.max(...widths) / Math.min(...widths) < 1.35,
    'beside prompt entities are not resized from inferred environment tags');
  const excavatorProgram = pair.find((row) => row.identity.type === 'excavator').geometry.program;
  const yellowParts = excavatorProgram.parts.filter((part) => part.fill === '#f4d03f');
  assert.ok(yellowParts.some((part) => part.constructionRole === 'core'));
  assert.ok(yellowParts.some((part) => part.constructionRole === 'appendage'));
  assert.ok(excavatorProgram.parts.filter((part) => part.constructionRole === 'path')
    .every((part) => part.fill !== '#f4d03f'), 'tracks retain material contrast');
  const boom = excavatorProgram.parts.filter((part) => part.constructionRole === 'appendage');
  const bucket = excavatorProgram.parts.find((part) => part.constructionRole === 'panel');
  assert.ok(boom[0].rotation > 0 && boom[1].rotation < 0, 'boom links form an articulated elbow');
  assert.ok(bucket && bucket.rotation > boom[1].rotation, 'bucket follows the boom endpoint orientation');

  const octopusPacket = octopus.renderProgram.sceneRenderPacket;
  const grasp = octopusPacket.receipts.framing.graspContacts.find((row) => (
    row.constraintId === 'relation:entity-octopus:holding:entity-teapot'
  ));
  assert.ok(grasp, 'holding compiles a visible part-to-part grasp receipt');
  assert.equal(grasp.targetPartId, 'handle');
  assert.equal(grasp.sourcePartIds.length, 2);
  assert.ok(grasp.endpointDistanceAfter <= 0.005);
  const teapotProgram = octopusPacket.entities.find((row) => row.identity.type === 'teapot').geometry.program;
  const teapotParts = new Map(teapotProgram.parts.map((part) => [part.id, part]));
  const potBody = teapotParts.get('pot-body');
  const spout = teapotParts.get('spout');
  const handle = teapotParts.get('handle');
  assert.ok(spout.center[0] + spout.size[0] * 0.5 < potBody.center[0] + potBody.size[0] * 0.5);
  assert.ok(spout.center[0] - spout.size[0] * 0.5 < potBody.center[0] - potBody.size[0] * 0.5);
  assert.ok(handle.center[0] + handle.size[0] * 0.5 > potBody.center[0] + potBody.size[0] * 0.5);
  const octopusProgram = octopusPacket.entities.find((row) => row.identity.type === 'octopus').geometry.program;
  const tentacles = octopusProgram.parts.filter((part) => /^tentacle-\d+$/.test(part.id));
  assert.equal(tentacles.length, 8);
  const freeTentacles = tentacles.filter((part) => !part.interactionConstraintIds?.includes(grasp.constraintId));
  const tentacleAngles = freeTentacles.map((part) => part.rotation).sort((left, right) => left - right);
  assert.ok(tentacleAngles.at(-1) - tentacleAngles[0] > Math.PI * 0.85, 'eight tentacles span a readable fan');
  assert.ok(tentacleAngles.slice(1).every((angle, index) => angle - tentacleAngles[index] > 0.3),
    'neighboring tentacles remain visually separated');
  assert.ok(freeTentacles.every((part) => part.size[0] / part.size[1] >= 6), 'tentacles read as limbs, not body blobs');
  assert.deepEqual(tentacles.filter((part) => part.interactionConstraintIds?.includes(grasp.constraintId))
    .map((part) => part.id).sort(), grasp.sourcePartIds.slice().sort());
});

test('prompt-owned scene evidence outranks an unrelated residual optics fallback', () => {
  const scope = globalThis.__SimulatteCompositionGraphRefactorScope;
  const renderIR = {
    prompt: 'an octopus holding a teapot',
    sceneHint: 'optics',
    objects: [{
      label: 'Octopus',
      semanticRef: 'prompt.body.octopus',
      physicalRef: 'prompt-body-octopus',
      directlyGrounded: true,
    }],
    fields: [],
  };
  const residual = [{ source: 'doppler-residual', visualRegime: 'optical refraction' }];

  assert.equal(scope.sceneKindForRenderIR(renderIR, { steps: [] }, {}, residual, {
    name: 'Optics laboratory',
  }), 'biology', 'a derived spec name cannot re-enter the direct-prompt evidence lane');
  assert.equal(scope.sceneKindForRenderIR(renderIR, { steps: [] }, {}, [], {}), 'biology',
    'an incompatible scene hint cannot overrule directly grounded prompt objects without a residual row');
  assert.equal(scope.directSceneKindForText('octopus viewed through a prism'), 'optics');
});

test('counted instances remain individually readable and constructive parts stay in local bounds', () => {
  const counted = createPrototypeSpec('3 dogs playing with 7 people');
  const entities = counted.renderProgram.sceneRenderPacket.entities;
  for (const identityType of ['dog', 'person']) {
    const rows = entities.filter((row) => row.identity.type === identityType);
    for (let left = 0; left < rows.length; left += 1) {
      for (let right = left + 1; right < rows.length; right += 1) {
        const a = rows[left].transform;
        const b = rows[right].transform;
        const separated = Math.abs(a.position[0] - b.position[0]) >= (a.scale[0] + b.scale[0]) * 0.5 ||
          Math.abs(a.position[1] - b.position[1]) >= (a.scale[1] + b.scale[1]) * 0.5;
        assert.equal(separated, true, `${identityType} instances ${left + 1} and ${right + 1} do not overlap`);
      }
    }
  }

  const excavator = createPrototypeSpec('yellow excavator beside a glass greenhouse')
    .renderProgram.sceneRenderPacket.entities.find((row) => row.identity.type === 'excavator');
  for (const part of excavator.geometry.program.parts) {
    const rotation = Number(part.rotation || 0);
    const halfWidth = (Math.abs(Math.cos(rotation)) * part.size[0] +
      Math.abs(Math.sin(rotation)) * part.size[1]) * 0.5;
    const halfHeight = (Math.abs(Math.sin(rotation)) * part.size[0] +
      Math.abs(Math.cos(rotation)) * part.size[1]) * 0.5;
    assert.ok(Math.abs(part.center[0]) + halfWidth <= 0.471);
    assert.ok(Math.abs(part.center[1]) + halfHeight <= 0.471);
  }
});

test('production retrieval never invokes the prototype lexical construction lane', () => {
  const prompt = 'airplane flying over trees';
  const phase1 = lab.runPhase1RuntimeGate(prompt, { allowPrototypeFallback: true });
  const phase2 = lab.runPhase2LanguageGraph(phase1);
  const phase3 = lab.runPhase3Retrieval(phase2, {
    runtimeReceiptId: 'runtime:production-boundary-test',
    runtimeMode: 'unproven',
    retrievalEvidence: { sourcePromptHash: phase2.artifact.queryPlan.sourcePromptHash },
  });
  const result = phase3.artifact.retrievalRerankResult;

  assert.equal(result.slotRetrieval, null);
  assert.equal(result.slotEvidence.flatMap((row) => row.constructionCandidates).length, 0);
});

test('compiled-artifact visual genomes diversify close and broad worlds', () => {
  const prompts = [
    'fire',
    'building fire',
    'glass lens focusing sunlight through water',
    'city market queue traffic network',
    'ferrofluid spikes around copper coils under pulsing current',
    'granular beads avalanche through a vibrating sieve',
  ];
  const specs = prompts.map((prompt) => createPrototypeSpec(prompt));
  const genomes = specs.map((spec) => spec.renderProgram.visualGenome);
  const genomeIds = new Set(genomes.map((genome) => genome.id));
  const fireGenome = genomes[0];
  const buildingFireGenome = genomes[1];

  assert.equal(genomeIds.size, prompts.length);
  assert.equal(fireGenome.schema, 'simulatte.visualGenome.v1');
  assert.equal(fireGenome.source, 'compiled-artifact-seeded-procedural');
  assert.equal(specs[0].renderProgram.rendererPlan.sceneKind, specs[1].renderProgram.rendererPlan.sceneKind);
  assert.equal(specs[0].physicalSpec.receipt.visualGenome.id, fireGenome.id);
  assert.equal(specs[1].physicalSpec.receipt.visualGenome.id, buildingFireGenome.id);
  assert.notEqual(fireGenome.id, buildingFireGenome.id);
  assert.ok(fireGenome.motifs.includes('ember-shear'));
  assert.ok(!fireGenome.motifs.includes('architectural-grid'));
  assert.ok(!fireGenome.motifs.includes('caustic-ribs'));
  assert.ok(!fireGenome.motifs.includes('flow-contours'));
  assert.ok(buildingFireGenome.motifs.includes('ember-shear'));
  assert.ok(buildingFireGenome.motifs.includes('architectural-grid'));
  assert.notDeepEqual(fireGenome.palette, buildingFireGenome.palette);
  assert.notDeepEqual(fireGenome.morphology, buildingFireGenome.morphology);

  const railway = createPrototypeSpec('railway dispatch conflict resolution across signal blocks with delayed train agents and platform slots');
  const zoning = createPrototypeSpec('city zoning shadow allocation between building masses with sunlight volumes and pedestrian comfort');
  assert.equal(railway.renderProgram.visualIR.sceneKind, zoning.renderProgram.visualIR.sceneKind);
  assert.ok(railway.physicsIR.operators.some((row) => row.type === 'network_flow'));
  assert.ok(railway.renderProgram.visualIR.graphicsAtoms.mappings
    .some((row) => row.id === 'visual.operator.network-flow.v1'));
  assert.ok(railway.renderProgram.visualGenome.motifs.includes('track-ladder'));
  assert.ok(zoning.renderProgram.visualGenome.motifs.includes('parcel-zoning-grid'));
  assert.notDeepEqual(railway.renderProgram.visualGenome.motifs, zoning.renderProgram.visualGenome.motifs);
  assert.notDeepEqual(railway.renderProgram.visualGenome.palette, zoning.renderProgram.visualGenome.palette);

  const dogs = createPrototypeSpec('dogs');
  const flowers = createPrototypeSpec('flowers');
  assert.equal(dogs.renderProgram.visualIR.sceneKind, flowers.renderProgram.visualIR.sceneKind);
  assert.ok(dogs.renderProgram.visualGenome.motifs.includes('animal-gait-cells'));
  assert.ok(flowers.renderProgram.visualGenome.motifs.includes('petal-radial-growth'));
  assert.notEqual(dogs.renderProgram.visualGenome.morphology.layoutMode, flowers.renderProgram.visualGenome.morphology.layoutMode);
  assert.notDeepEqual(dogs.renderProgram.visualGenome.palette, flowers.renderProgram.visualGenome.palette);
});

test('expanded prompt regimes do not collapse into literal or broad renderer fallbacks', () => {
  const cases = [
    [
      'lava heats rain into steam while wind bends ash over a basalt delta',
      'thermal-plume',
    ],
    [
      'planetary rings shear around a shepherd moon with icy particle density waves',
      'planetary-space',
    ],
    [
      'edge data center server racks recirculating heat between cooling aisles under controller limits',
      'digital-network',
    ],
    [
      'protein folding energy minimization in a crowded solvent',
      'molecular-biology',
    ],
    [
      'housing market pressure across parcels with zoning constraints',
      'civic-market',
    ],
    [
      'neutrino detector in underground water tank with photon cones',
      'particle-instrument',
    ],
    [
      'forest fire jumping a road under wind shear',
      'fire',
    ],
    [
      'microfluidic droplets split at a glass channel junction',
      'chemistry-lab',
    ],
    [
      'bridge resonance under wind vortex shedding',
      'structural-mechanics',
    ],
    [
      'coral reef bleaching under warm acidic water',
      'evolution-ecology',
    ],
  ];
  const specs = cases.map(([prompt]) => createPrototypeSpec(prompt));
  const scenes = new Set();
  let expandedRecipeCount = 0;

  specs.forEach((spec, index) => {
    const [, sceneKind] = cases[index];
    const plan = spec.renderProgram.rendererPlan;
    const visualIR = spec.renderProgram.visualIR;
    scenes.add(plan.sceneKind);
    if (plan.visualRecipe) expandedRecipeCount += 1;
    assert.equal(plan.sceneKind, sceneKind);
    assert.equal(visualIR.sceneKind, sceneKind);
    assert.notEqual(plan.sceneKind, 'literal-composite');
    assert.notEqual(plan.sceneKind, 'generic');
    assert.equal(spec.physicalSpec.receipt.visualIdentity.sceneKind, sceneKind);
  });

  assert.ok(scenes.size >= 9);
  assert.ok(expandedRecipeCount >= 7);
});

test('hand-authored coverage probes span major simulation regimes', () => {
  const cases = [
    ['supercell thunderstorm grows hail under wind shear', 'weather-atmosphere'],
    ['glacier calving into fjord with sea ice waves', 'ocean-cryosphere'],
    ['earthquake fault rupture sends waves through soft basin', 'hazard-atmosphere'],
    ['internal ocean waves mix plankton under kelp canopy', 'ocean-cryosphere'],
    ['microgrid battery inverter stabilizes transformer overload', 'grid-energy'],
    ['warehouse robot arms sort parcels on conveyor belts', 'robotics-control'],
    ['injection molding line cools plastic through steel tooling', 'manufacturing-line'],
    ['qubit chip phase readout through microwave resonator', 'quantum-instrument'],
    ['compost heat oxygen water loop feeds greenhouse crops', 'agro-waste-loop'],
    ['tornado debris plume crosses highway evacuation map', 'hazard-atmosphere'],
    ['blood pump control loop stabilizes patient flow', 'clinical-control'],
    ['museum pigment film ages under humidity cycling', 'cultural-material'],
    ['skateboard rider pumps a curved bowl with friction loss', 'sport-motion'],
    ['stadium crowd agents queue through gates after rain', 'venue-crowd'],
    ['neutrino detector in underground water tank with photon cones', 'particle-instrument'],
    ['planetary rings shear around a shepherd moon', 'planetary-space'],
    ['protein folding energy minimization in crowded solvent', 'molecular-biology'],
    ['housing market pressure across parcels with zoning constraints', 'civic-market'],
    ['edge data center server racks recirculate heat', 'digital-network'],
    ['microfluidic droplets split at a glass channel junction', 'chemistry-lab'],
    ['bridge resonance under wind vortex shedding', 'structural-mechanics'],
    ['mangrove roots buffer storm surge and sediment', 'restoration-water'],
    ['coral reef bleaching under warm acidic water', 'evolution-ecology'],
    ['violin body resonance drives air pressure waves', 'acoustic'],
    ['glass lens focuses laser caustics through prism', 'optics'],
    ['granular beads avalanche through a vibrating sieve', 'granular'],
    ['soap film colors stretch around air bubbles', 'thin-film'],
    ['ferrofluid spikes around copper coils under pulsing current', 'ferrofluid'],
    ['forest fire jumps a road under wind shear', 'fire'],
    ['rain erodes a mountain watershed into sediment channels', 'watershed'],
  ];
  const scenes = new Set();
  const cameras = new Set();
  let expandedRecipeCount = 0;

  for (const [prompt, sceneKind] of cases) {
    const spec = createPrototypeSpec(prompt);
    const plan = spec.renderProgram.rendererPlan;
    const visualIR = spec.renderProgram.visualIR;
    const scenePacket = visualIR.sceneRenderPacket;
    scenes.add(plan.sceneKind);
    cameras.add(visualIR.camera.mode);
    if (plan.visualRecipe) expandedRecipeCount += 1;
    assert.equal(plan.sceneKind, sceneKind, prompt);
    assert.equal(visualIR.sceneKind, sceneKind, prompt);
    assert.equal(scenePacket.schema, 'simulatte.sceneRenderPacket.v1', prompt);
    assert.equal(scenePacket.sceneKind, sceneKind, prompt);
    assert.ok(scenePacket.entities.length >= 1, prompt);
    assert.ok(scenePacket.entities.every((entity) => Array.isArray(entity.transform.position)), prompt);
    assert.ok(scenePacket.entities.every((entity) => entity.geometry && entity.material && entity.animation && entity.collider), prompt);
    assert.ok(scenePacket.passes.includes('entities'), prompt);
    assert.equal(spec.physicalSpec.receipt.visualIdentity.sceneKind, sceneKind, prompt);
    assert.notEqual(plan.sceneKind, 'generic', prompt);
    assert.notEqual(plan.sceneKind, 'literal-composite', prompt);
  }

  assert.ok(scenes.size >= 27);
  assert.ok(cameras.size >= 5);
  assert.ok(expandedRecipeCount >= 23);
});

test('compiled visual DNA differentiates related language-grounded worlds', () => {
  const prompts = [
    'moss',
    'moss turbine',
    'moss turbine glass',
    'moss turbine stone',
    'quartz turbine glass',
  ];
  const genomes = prompts.map((prompt) => createPrototypeSpec(prompt).renderProgram.visualGenome);
  const dnaRows = genomes.map((genome) => genome.visualDna);
  const dnaHashes = new Set(dnaRows.map((dna) => dna.hash));
  const markSignatures = new Set(dnaRows.map((dna) => (
    dna.ngrams.map((row) => `${row.n}:${row.index}:${row.mark}:${row.hue}`).join('|')
  )));

  assert.equal(dnaHashes.size, prompts.length);
  assert.equal(markSignatures.size, prompts.length);
  assert.ok(dnaRows.every((dna) => dna.schema === 'simulatte.compiledVisualDna.v1'));
  assert.ok(dnaRows.every((dna) => dna.tokenCount >= 1));
  assert.ok(dnaRows.every((dna) => dna.ngrams.some((row) => row.n === 1)));
  assert.equal(dnaRows[2].catalog, 'simulatte.proceduralVisualBase.v1');
});

test('semantic visual atlas maps prompts to distinct archetype material and process layers', () => {
  const prompts = [
    'fire',
    'building fire',
    'battery leak warehouse robots',
    'orbiting mirror algae pond',
    'acoustic levitator dust brass tube',
    'moss turbine glass',
  ];
  const specs = prompts.map((prompt) => createPrototypeSpec(prompt));
  const visuals = specs.map((spec) => spec.renderProgram.visualGenome.semanticVisuals);
  const signatures = new Set(visuals.map((visual) => visual.signature));
  const families = (visual, key) => new Set((visual[key] || []).map((row) => row.family));
  const overlays = (visual) => new Set(visual.overlays || []);
  const fire = visuals[0];
  const buildingFire = visuals[1];
  const battery = visuals[2];
  const orbitPond = visuals[3];
  const acoustic = visuals[4];
  const mossTurbine = visuals[5];

  assert.equal(signatures.size, prompts.length);
  for (const visual of visuals) {
    assert.equal(visual.schema, 'simulatte.semanticVisualPlan.v1');
    assert.equal(visual.atlas, 'simulatte.semanticVisualAtlas.v1');
    assert.ok(visual.quality.coverage >= 0.75);
    assert.ok(visual.quality.layerCount >= 2);
  }
  assert.ok(families(fire, 'materials').has('thermal'));
  assert.ok(families(fire, 'processes').has('burn'));
  assert.ok(!families(fire, 'archetypes').has('architecture'));
  assert.ok(families(buildingFire, 'archetypes').has('architecture'));
  assert.ok(families(buildingFire, 'materials').has('concrete'));
  assert.ok(families(battery, 'archetypes').has('civic'));
  assert.ok(families(battery, 'archetypes').has('electronics'));
  assert.ok(families(battery, 'materials').has('electric'));
  assert.ok(families(battery, 'processes').has('leak'));
  assert.ok(families(orbitPond, 'archetypes').has('astronomy'));
  assert.ok(families(orbitPond, 'archetypes').has('biology'));
  assert.ok(families(orbitPond, 'processes').has('orbit'));
  assert.ok(families(acoustic, 'archetypes').has('acoustics'));
  assert.ok(families(acoustic, 'processes').has('levitate'));
  assert.ok(families(acoustic, 'processes').has('sort'));
  assert.ok(families(mossTurbine, 'archetypes').has('mechanics'));
  assert.ok(families(mossTurbine, 'processes').has('rotate'));
  assert.ok(overlays(mossTurbine).has('rotation-trails'));
});

test('visual operator atlas maps grounded physics to distinct graphics atom plans', () => {
  const cases = [
    [
      'data center cooling loop where hot server racks increase coolant flow and controller throttles fan speed',
      ['visual.operator.control-feedback.v1', 'visual.operator.fluid-advection.v1', 'visual.operator.heat-transfer.v1'],
      ['controller-node', 'ribbon-streamline', 'thermal-glow-gradient'],
      ['feedback', 'fluid', 'thermal'],
    ],
    [
      'injection molding line cools plastic through steel tooling',
      ['visual.operator.heat-transfer.v1'],
      ['thermal-glow-gradient'],
      ['thermal', 'phase'],
    ],
    [
      'housing market pressure routes household agents across parcels under zoning constraints',
      ['visual.operator.network-flow.v1'],
      ['node-link-graph', 'parcel-grid'],
      ['network', 'constraint'],
    ],
    [
      'qubit chip phase readout through microwave resonator with interference fringes',
      ['visual.operator.quantum-phase-readout.v1', 'visual.operator.instrument-readout.v1'],
      ['superconducting-chip-plane', 'phase-fringe-sheet', 'instrument-panel'],
      ['quantum', 'instrument'],
    ],
    [
      'lava spins a turbine near an ice castle wall',
      ['visual.operator.heat-transfer.v1', 'visual.operator.phase-transition.v1'],
      ['thermal-glow-gradient', 'volume-vapor-plume', 'phase-boundary-sheet'],
      ['thermal', 'phase'],
    ],
    [
      'robot sorts parcels with servo gripper contact force in warehouse queue',
      ['visual.operator.robot-contact.v1', 'visual.operator.network-flow.v1'],
      ['robot-armature', 'contact-cone', 'node-link-graph'],
      ['robotic', 'network'],
    ],
    [
      'glacier calving into fjord with internal ocean waves and iceberg collisions',
      ['visual.operator.cryosphere-surface.v1'],
      ['ice-cliff-shelf', 'calving-block-field'],
      ['phase', 'fluid', 'surface'],
    ],
    [
      'skateboard rider carves a bowl with friction loss and centripetal arcs',
      ['visual.operator.sport-trajectory.v1'],
      ['curved-bowl-surface', 'rider-trajectory-arc', 'wheel-contact-patch'],
      ['motion', 'stress', 'constraint'],
    ],
    [
      'sourdough fermentation gas bubbles growing through a dough matrix with gluten strands and acidity gradients',
      ['visual.operator.fermentation-matrix.v1', 'visual.operator.chemical-diffusion.v1', 'visual.operator.biological-growth.v1'],
      ['porous-dough-matrix', 'gluten-strand-network', 'fermentation-bubble-cell'],
      ['biological', 'chemical', 'fluid', 'motion', 'density'],
    ],
    [
      'soap thin film with air bubbles in wire loops and iridescent interference',
      ['visual.operator.thin-film-interference.v1'],
      ['thin-film-sheet', 'wire-loop-frame', 'interference-bubble-cell'],
      ['optical', 'phase', 'surface'],
    ],
    [
      'particle collider muon tracks through detector slice with calorimeter pulses',
      ['visual.operator.particle-track-detector.v1', 'visual.operator.instrument-readout.v1'],
      ['detector-slice-stack', 'muon-track-ribbons', 'calorimeter-tile-array'],
      ['instrument', 'measurement', 'signal'],
    ],
    [
      'acoustic levitator dust brass tube standing pressure waves',
      ['visual.operator.acoustic-wave.v1'],
      ['waveguide-tube', 'resonator-cavity', 'membrane-diaphragm'],
      ['acoustic', 'motion', 'instrument'],
    ],
    [
      'bridge resonance under wind vortex shedding with cable tension',
      ['visual.operator.structural-stress.v1'],
      ['bridge-mode-deck', 'cable-tension-lines', 'anchor-load-pads'],
      ['stress', 'motion', 'constraint'],
    ],
  ];
  const signatures = new Set();

  for (const [prompt, expectedMappings, expectedGeometry, expectedSlots] of cases) {
    const spec = createPrototypeSpec(prompt);
    const atoms = spec.renderProgram.visualIR.graphicsAtoms;
    const mappingIds = atoms.mappings.map((row) => row.id);
    const geometryIds = atoms.geometry.map((row) => row.id);
    const bySlot = atoms.uniforms.bySlot || {};
    const signature = [
      ...mappingIds,
      ...geometryIds,
      ...atoms.fields.map((row) => row.id),
      ...atoms.motion.map((row) => row.id),
      ...Object.entries(bySlot).filter((entry) => entry[1] > 0).map((entry) => entry[0]),
    ].join('|');

    assert.equal(atoms.schema, 'simulatte.graphicsAtomPlan.v1');
    assert.equal(atoms.compiler, 'simulatte.visualOperatorCompiler.v1');
    assert.equal(atoms.source, 'handwritten-operator-graphics-basis');
    assert.ok(atoms.languageSignals.length > 0, `${prompt} missing span-backed language signals`);
    assert.equal(atoms.uniforms.schema, 'simulatte.graphicsAtomUniforms.v1');
    assert.equal(atoms.uniforms.values.length, 24);
    assert.ok(atoms.wgslOperators.length >= expectedMappings.length);
    expectedMappings.forEach((id) => {
      assert.ok(mappingIds.includes(id), `${prompt} missing mapping ${id}`);
    });
    expectedGeometry.forEach((id) => {
      assert.ok(geometryIds.includes(id), `${prompt} missing geometry atom ${id}`);
    });
    expectedSlots.forEach((slot) => {
      assert.ok(bySlot[slot] > 0, `${prompt} missing uniform slot ${slot}`);
    });
    assert.ok(spec.renderProgram.visualIR.receipts.some((row) => row.id === 'receipt:graphics-atoms'));
    signatures.add(signature);
  }

  assert.equal(signatures.size, cases.length);
});

test('evidence-qualified motion keeps rigid rotation out of the fluid solver path', () => {
  const prompt = 'skateboard rider carves a bowl with friction loss and centripetal arcs';
  const spec = createPrototypeSpec(prompt);
  const operator = spec.physicsIR.operators.find((row) => row.type === 'rotational_torque');
  const fieldNames = spec.physicsIR.stateFields.map((row) => row.name);

  assert.ok(operator);
  assert.deepEqual(operator.reads.map((id) => id.split(':')[0]), [
    'velocity', 'angle', 'angularVelocity', 'friction',
  ]);
  assert.deepEqual(operator.writes.map((id) => id.split(':')[0]), [
    'angle', 'angularVelocity', 'angularMomentum',
  ]);
  assert.equal(fieldNames.includes('flowVelocity'), false);
  assert.equal(fieldNames.includes('viscosity'), false);
  assert.deepEqual(operator.receipt.consumedChannels, operator.reads);
  assert.deepEqual(operator.receipt.producedChannels, operator.writes);
  assert.equal(spec.validationReceipt.unsupported.length, 0);

  let state = lab.createSimulationState(spec);
  const angularVelocityId = operator.writes.find((id) => id.startsWith('angularVelocity:'));
  const angularMomentumId = operator.writes.find((id) => id.startsWith('angularMomentum:'));
  const initialAngularVelocity = state.solverState.channels[angularVelocityId];
  for (let index = 0; index < 24; index += 1) state = lab.stepSimulation(state, spec, 0.016);
  assert.ok(state.solverState.channels[angularVelocityId] > initialAngularVelocity);
  assert.ok(state.solverState.channels[angularMomentumId] > 0);
});

test('causal visual mechanisms stay inactive without their qualifying prompt evidence', () => {
  const glacier = createPrototypeSpec('glacier beside ocean');
  assert.equal(glacier.universeGraph.edges.some((row) => (
    row.provenance?.causalRuleId === 'causal.warming-calves-glacier'
  )), false);
  assert.equal(glacier.physicsIR.operators.some((row) => row.type === 'phase_transition'), false);

  const robot = createPrototypeSpec('robot sorts parcels in warehouse queue');
  assert.ok(robot.physicsIR.operators.some((row) => row.type === 'network_flow'));
  assert.equal(robot.physicsIR.operators.some((row) => row.type === 'rigid_collision'), false);
  assert.equal(robot.renderProgram.visualIR.graphicsAtoms.mappings.some((row) => (
    row.id === 'visual.operator.robot-contact.v1'
  )), false);

  const skateboard = createPrototypeSpec('skateboard rider beside a bowl with friction');
  assert.equal(skateboard.physicsIR.operators.some((row) => row.type === 'rotational_torque'), false);
  assert.equal(skateboard.renderProgram.visualIR.graphicsAtoms.mappings.some((row) => (
    row.id === 'visual.operator.sport-trajectory.v1'
  )), false);

  const magneticMachine = createPrototypeSpec('magnetic slider beside a machine');
  assert.equal(magneticMachine.physicsIR.operators.some((row) => row.type === 'wave_field'), false);
  assert.equal(magneticMachine.renderProgram.visualIR.graphicsAtoms.mappings.some((row) => (
    row.id === 'visual.operator.electromagnetic-field.v1'
  )), false);
});

test('solver-channel receipts match executable reads and writes for corrected prompt families', () => {
  const prompts = [
    'soft fungal membrane colony with gel diffusion and pressure waves',
    'housing market pressure routes household agents across parcels under zoning constraints',
    'robot sorts parcels with servo gripper contact force in warehouse queue',
    'glacier calving into fjord with internal ocean waves and iceberg collisions',
    'skateboard rider carves a bowl with friction loss and centripetal arcs',
    'protein folding energy minimization with bond constraints and collapse motion',
    'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun',
  ];

  for (const prompt of prompts) {
    const spec = createPrototypeSpec(prompt);
    assert.ok(spec.physicsIR.operators.length > 0, `${prompt} missing executable operators`);
    for (const operator of spec.physicsIR.operators) {
      assert.equal(operator.receipt?.schema, 'simulatte.solverChannelReceipt.v1', prompt);
      assert.deepEqual(operator.receipt.consumedChannels, operator.reads, prompt);
      assert.deepEqual(operator.receipt.producedChannels, operator.writes, prompt);
    }
    assert.equal(spec.validationReceipt.unsupported.some((row) => (
      /missing (?:input|output)|operator is not registered|operator domain is missing/.test(row.reason || '')
    )), false, prompt);
  }
});
