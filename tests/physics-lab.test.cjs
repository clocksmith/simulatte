const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const lab = require('../public/js/simulatte-physics-lab.js');
const intentEmbedder = require('../public/js/simulatte-intent-embedder.js');
const semanticRagApi = require('../public/js/simulatte-semantic-rag.js');
const graphSynthesis = require('../public/js/simulatte-graph-synthesis.js');
const root = path.resolve(__dirname, '..');

function loadEmbeddingIndex() {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, 'public/models/simulatte-embedder/manifest.json'),
    'utf8'
  ));
  const index = JSON.parse(fs.readFileSync(
    path.join(root, 'public/models/simulatte-embedder/primitive-index-v2.json'),
    'utf8'
  ));
  const surfaceIndex = JSON.parse(fs.readFileSync(
    path.join(root, 'public/models/simulatte-embedder/surface-card-index-v1.json'),
    'utf8'
  ));
  return { manifest, index, surfaceIndex };
}

function indexedVector(index, primitiveId) {
  const order = index.documents.findIndex((doc) => doc.primitiveId === primitiveId);
  assert.notEqual(order, -1, `missing indexed primitive ${primitiveId}`);
  const packed = Buffer.from(index.embeddingsPackedBase64, 'base64');
  const values = new Float32Array(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength));
  const start = order * index.embeddingDim;
  return values.slice(start, start + index.embeddingDim);
}

function indexedCardVector(index, cardId) {
  const order = index.documents.findIndex((doc) => doc.cardId === cardId);
  assert.notEqual(order, -1, `missing indexed surface card ${cardId}`);
  const packed = Buffer.from(index.embeddingsPackedBase64, 'base64');
  const values = new Float32Array(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength));
  const start = order * index.embeddingDim;
  return values.slice(start, start + index.embeddingDim);
}

async function withIntentArtifactFetch(run) {
  const previousFetch = globalThis.fetch;
  const { manifest, index, surfaceIndex } = loadEmbeddingIndex();
  globalThis.fetch = async (url) => {
    const value = String(url || '');
    if (value.endsWith('manifest.json')) {
      return new Response(JSON.stringify(manifest), { status: 200 });
    }
    if (value.endsWith('primitive-index-v2.json')) {
      return new Response(JSON.stringify(index), { status: 200 });
    }
    if (value.endsWith('surface-card-index-v1.json')) {
      return new Response(JSON.stringify(surfaceIndex), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
  try {
    return await run({ manifest, index, surfaceIndex });
  } finally {
    globalThis.fetch = previousFetch;
  }
}

function createPrototypeSpec(prompt, overrides = {}) {
  return lab.createSpecFromPrompt(prompt, {
    ...overrides,
    allowPrototypeFallback: true,
  });
}

test('model-backed intent embedder ranks primitives with EmbeddingGemma provenance', async () => {
  await withIntentArtifactFetch(async ({ index }) => {
    const query = indexedVector(index, 'optics-bench');
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/models/simulatte-embedder/manifest.json',
      embedProvider: {
        async embed() {
          return {
            embedding: query,
            embedModelId: index.embedModelId,
            embedModelHash: index.embedModelHash,
          };
        },
      },
    });
    const result = await embedder.rankPrompt(
      'lab bench optics bench with sun lamp glass lens mirror prism and sensor',
      lab.PHYSICAL_PRIMITIVES,
      { max: 12 }
    );

    assert.equal(result.model.id, 'google-embeddinggemma-300m-q4k-ehf16-af32');
    assert.equal(result.model.dimensions, 768);
    assert.equal(result.model.indexId, 'simulatte-primitive-embeddinggemma-index-v1');
    assert.equal(result.model.surfaceCardIndexId, 'simulatte-surface-card-embeddinggemma-index-v1');
    assert.ok(result.model.surfaceCardDocuments >= 650);
    assert.equal(result.rerank.required, true);
    assert.equal(result.rerank.schema, 'simulatte.intentRerank.v1');
    assert.equal(result.priors[0].primitiveId, 'optics-bench');
    assert.ok(result.priors.some((prior) => prior.primitiveId === 'prism'));
    assert.ok(Array.isArray(result.cardMatches));
  });
});

test('EmbeddingGemma surface-card retrieval feeds typed graph synthesis', async () => {
  await withIntentArtifactFetch(async ({ index, surfaceIndex }) => {
    const query = indexedCardVector(surfaceIndex, 'hamster_wheel');
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/models/simulatte-embedder/manifest.json',
      embedProvider: {
        async embed() {
          return {
            embedding: query,
            embedModelId: index.embedModelId,
            embedModelHash: index.embedModelHash,
          };
        },
      },
    });
    const prompt = 'mouse in a hamster wheel crashing into another gerbil in a hamster wheel';
    const result = await embedder.rankPrompt(prompt, lab.PHYSICAL_PRIMITIVES, {
      max: 12,
      maxCards: 12,
    });
    const spec = lab.createSpecFromPrompt(prompt, {
      allowPrototypeFallback: true,
      embeddingPriors: result.priors,
      embeddingModel: result.model,
      embeddingBackend: result.rankBackend,
      intentRerank: result.rerank,
      semanticRag: result.semanticRag,
      dopplerIntent: result.dopplerIntent,
      cardMatches: result.cardMatches,
    });
    const synth = spec.intent.synthesis;

    assert.equal(result.cardMatches[0].cardId, 'hamster_wheel');
    assert.equal(synth.schema, 'simulatte.embeddingGuidedGraphSynthesis.v1');
    assert.equal(synth.validation.valid, true);
    assert.deepEqual(synth.synthGraph.nodes.map((node) => node.cardId), [
      'mouse',
      'hamster_wheel',
      'gerbil',
      'hamster_wheel',
    ]);
    assert.deepEqual(synth.synthGraph.relations.map((relation) => relation.participants), [
      ['mouse_a', 'hamster_wheel_a'],
      ['gerbil_a', 'hamster_wheel_b'],
    ]);
    assert.deepEqual(synth.synthGraph.events[0].participants, [
      'hamster_wheel_a',
      'hamster_wheel_b',
    ]);
    assert.equal(spec.objects.some((object) => object.id === 'wheel-a'), false);
    assert.ok(spec.objects.some((object) => object.id === 'collision-1'));
    assert.equal(spec.physicalSpec.receipt.synthesis.valid, true);
  });
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

test('examples resolve through intent before simulation spec', () => {
  for (const example of lab.EXAMPLE_INTENTS) {
    const intent = lab.createIntentFromPrompt(example.prompt);
    const spec = lab.resolveIntentToSpec(intent);

    assert.equal(intent.schema, 'simulatte.intent.v1');
    assert.equal(spec.intent.prompt, example.prompt);
    assert.ok(['custom-world', 'blank-world'].includes(spec.templateId));
  }
});

test('example seeds are unnamed prompt presets with distinct parameter values', () => {
  const visibleLabels = lab.EXAMPLE_INTENTS.map((example) => example.label);
  const forbiddenLabels = ['Forest fire', 'Watershed', 'City grid', 'Optics', 'Mag wheel'];
  const signatures = new Set(lab.EXAMPLE_INTENTS.map((example) => JSON.stringify(example.params || {})));
  const textSignatures = new Set(lab.EXAMPLE_INTENTS.map((example) => {
    const spec = lab.createSpecFromPrompt(example.prompt, { params: example.params });
    return JSON.stringify(Object.fromEntries(Object.entries(spec.params).sort().slice(0, 12)));
  }));
  const rotor = lab.EXAMPLE_INTENTS.find((example) => example.id === 'magnetic-machine');
  const glass = lab.EXAMPLE_INTENTS.find((example) => example.id === 'prismatic-rail');
  const burn = lab.EXAMPLE_INTENTS.find((example) => example.id === 'dry-combustion');
  const service = lab.EXAMPLE_INTENTS.find((example) => example.id === 'service-loop');
  const rain = lab.EXAMPLE_INTENTS.find((example) => example.id === 'rain-cut');
  const matter = lab.EXAMPLE_INTENTS.find((example) => example.id === 'matter-tray');

  assert.deepEqual(visibleLabels, ['W', 'X', 'Y', 'Z', 'P', 'Q']);
  for (const label of forbiddenLabels) assert.equal(visibleLabels.includes(label), false);
  for (const example of lab.EXAMPLE_INTENTS) {
    assert.ok(example.prompt.length <= 44, `${example.id} prompt should stay compact`);
  }
  assert.ok(signatures.size >= 6);
  assert.ok(textSignatures.size >= 5);
  assert.equal(lab.createSpecFromPrompt(rotor.prompt, { params: rotor.params }).params.irradiance, 1040);
  assert.equal(lab.createSpecFromPrompt(burn.prompt, { params: burn.params }).params.combustibility, 0.88);
  assert.equal(lab.createSpecFromPrompt(glass.prompt, { params: glass.params }).params.refractiveIndex, 1.68);
  assert.equal(lab.createSpecFromPrompt(service.prompt, { params: service.params }).params.queueBacklog, 0.78);
  assert.equal(lab.createSpecFromPrompt(rain.prompt, { params: rain.params }).params.erosionRate, 0.62);
  assert.equal(lab.createSpecFromPrompt(matter.prompt, { params: matter.params }).params.magnetization, 0.68);
});

test('blank prompt resolves to empty construction plane intent', () => {
  const intent = lab.createIntentFromPrompt('blank world');
  const spec = lab.resolveIntentToSpec(intent);

  assert.equal(spec.templateId, 'blank-world');
  assert.deepEqual(intent.domains, ['blank']);
  assert.equal(spec.modules.length, 0);
  assert.equal(spec.objects.length, 0);
});

test('simulation specs export, import, and remix with lineage', () => {
  const spec = lab.createSpecFromPrompt('make a fluid vortex tank with turbulence and pressure');
  const restored = lab.deserializeSpec(lab.serializeSpec(spec));
  const remix = lab.remixSpec(restored, { name: 'Fluid Vortex Remix' });

  assert.equal(restored.templateId, 'custom-world');
  assert.ok(restored.modules.includes('fluid'));
  assert.equal(restored.name, spec.name);
  assert.equal(remix.templateId, 'custom-world');
  assert.equal(remix.remixOf, restored.id);
  assert.equal(remix.name, 'Fluid Vortex Remix');
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
  assert.equal(lab.MATH_PRIMITIVE_LIBRARY.length, 53);
  assert.equal(lab.PHYSICS_PRIMITIVE_LIBRARY.length, 45);
  assert.equal(lab.MATERIAL_PRIMITIVE_LIBRARY.length, 88);
  assert.equal(lab.COMPONENT_LIBRARY.length, 40);
  assert.equal(lab.COMPOSITION_LIBRARY.length, 21);
  assert.equal(lab.SCENE_LIBRARY.length, 17);
  assert.equal(lab.LAYERED_PRIMITIVES.length, 264);
  assert.ok(lab.PHYSICAL_PRIMITIVES.length >= 320);
  assert.equal(lab.primitiveById('rigid-body').layer, 'physics');
  assert.equal(lab.primitiveById('soft-body').layer, 'physics');
  assert.equal(lab.primitiveById('bonding').layer, 'physics');
  assert.equal(lab.primitiveById('gold').layer, 'material');
  assert.equal(lab.primitiveById('dna').layer, 'material');
  assert.equal(lab.primitiveById('molecular-chain').layer, 'component');
  assert.ok(lab.materialPropertiesForId('gold').conductivity > 0.8);
  assert.ok(lab.materialPropertiesForId('dna').moisture > 0.5);
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
  const spec = lab.createSpecFromPrompt(
    'soft fungal membrane colony with gel diffusion and pressure waves',
    {
      embeddingPriors: [
        { primitiveId: 'mycelium', score: 0.98 },
        { primitiveId: 'membrane', score: 0.94 },
        { primitiveId: 'gel', score: 0.91 },
        { primitiveId: 'bacteria', score: 0.88 },
        { primitiveId: 'wave-source', score: 0.82 },
      ],
      embeddingModel: {
        id: 'google-embeddinggemma-300m-q4k-ehf16-af32',
        family: 'embeddinggemma',
        dimensions: 768,
        indexId: 'simulatte-primitive-embeddinggemma-index-v1',
        reranker: 'simulatte.embeddinggemma-reranker.v1',
      },
      embeddingBackend: 'webgpu',
      intentRerank: {
        schema: 'simulatte.intentRerank.v1',
        required: true,
        top: ['mycelium', 'membrane', 'gel'],
      },
    }
  );
  const ids = new Set(spec.objects.map((object) => object.id));
  const regimes = new Set(spec.renderProgram.objects.map((object) => object.visualRegime));
  const solverFamilies = new Set(spec.renderProgram.solverPlan.families);

  assert.equal(spec.intent.classification.model.id, 'simulatte-embeddinggemma-intent-ranker.v1');
  assert.equal(spec.intent.classification.model.runtime.backend, 'webgpu');
  assert.equal(spec.intent.classification.model.runtime.indexId, 'simulatte-primitive-embeddinggemma-index-v1');
  assert.equal(spec.intent.rerank.schema, 'simulatte.intentRerank.v1');
  assert.equal(spec.physicalSpec.receipt.rerank.required, true);
  assert.ok(ids.has('mycelium'));
  assert.ok(ids.has('membrane'));
  assert.ok(ids.has('gel'));
  assert.ok(regimes.has('biological'));
  assert.ok(regimes.has('soft'));
  assert.ok(solverFamilies.has('growth-diffusion'));
  assert.ok(solverFamilies.has('membrane-relaxation'));
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
  assert.ok(machine.intent.classification.priors.some((prior) => prior.primitiveId === 'rotor-wheel'));
  assert.ok(machine.renderProgram.objects.some((object) => object.shape === 'wheel'));
  assert.ok(machine.renderProgram.fields.some((field) => field.kind === 'dipole'));
  assert.ok(machine.physicalSpec.renderPasses.includes('magnetic-vector-field-solve'));
});

test('prompt worlds choose distinct regime renderer identities', () => {
  const cases = [
    [
      'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall',
      'fire',
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
      'mountain watershed with river erosion, terrain patch, sand, soil, rock, water, and gravity',
      'watershed',
      'fluid',
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
  ];

  for (const [prompt, sceneKind, dominantRegime] of cases) {
    const spec = createPrototypeSpec(prompt);

    assert.equal(spec.renderProgram.rendererPlan.schema, 'simulatte.rendererPlan.v1');
    assert.equal(spec.renderProgram.rendererPlan.sceneKind, sceneKind);
    assert.equal(spec.renderProgram.rendererPlan.dominantRegime, dominantRegime);
    assert.equal(spec.renderProgram.provenance.visualIdentity.sceneKind, sceneKind);
    assert.equal(spec.physicalSpec.receipt.visualIdentity.sceneKind, sceneKind);
    assert.match(spec.renderProgram.rendererPlan.renderer, new RegExp(`\\.${sceneKind}\\.v1$`));
  }
});

test('Doppler residual hints can steer the selected physical graph', () => {
  const spec = lab.createSpecFromPrompt('quiet demonstration plane', {
    dopplerIntent: {
      schema: 'simulatte.dopplerIntentHints.v1',
      source: 'doppler-test',
      model: { id: 'doppler-test-model', family: 'local-text-graph-delta' },
      primitives: [
        { primitiveId: 'optics-bench', score: 0.99, reason: 'local model inferred optical bench' },
        { primitiveId: 'prism', score: 0.96, reason: 'split beam requested by residual hint' },
      ],
      regimes: ['optical'],
      operators: ['refraction'],
    },
  });
  const ids = new Set(spec.objects.map((object) => object.id));
  const sources = new Set(spec.objects.map((object) => object.source));

  assert.equal(spec.intent.dopplerIntent.schema, 'simulatte.dopplerIntentHints.v1');
  assert.ok(ids.has('optics-bench'));
  assert.ok(ids.has('prism'));
  assert.ok(ids.has('lens'));
  assert.ok(sources.has('doppler-residual'));
  assert.equal(spec.renderProgram.rendererPlan.sceneKind, 'optics');
  assert.equal(spec.physicalSpec.receipt.doppler.model, 'doppler-test-model');
  assert.ok(spec.contract.doppler.primitives.includes('optics-bench'));
});

test('semantic RAG open components enter graph, solver plan, and render programs', () => {
  const spec = createPrototypeSpec(
    'glass lens focusing sunlight through water cooling into a magnetic rotor with protein gel membrane turbulence'
  );
  const openObjects = spec.objects.filter((object) => object.source === 'open-semantic-rag');
  const graphOpenNodes = spec.contract.graph.nodes.filter((node) => node.source === 'open-semantic-rag');
  const programOpenObjects = spec.renderProgram.objects.filter((object) => object.source === 'open-semantic-rag');
  const programSynthObjects = spec.renderProgram.objects.filter((object) => /^embedding-guided-synth/.test(object.source));
  const regimes = new Set(spec.renderProgram.provenance.visualRegimes);

  assert.equal(spec.intent.semanticRag.schema, 'simulatte.semanticRag.v1');
  assert.ok(spec.intent.semanticRag.retrieved.length >= 20);
  assert.ok(openObjects.length >= 4);
  assert.equal(graphOpenNodes.length, openObjects.length);
  assert.ok(programOpenObjects.length >= 1);
  assert.ok(programSynthObjects.length >= 2);
  assert.ok(programOpenObjects.every((object) => object.primitiveProgram));
  assert.ok(regimes.has('optical'));
  assert.ok(regimes.has('fluid'));
  assert.ok(regimes.has('magnetic'));
  assert.ok(spec.modules.includes('soft') || spec.modules.includes('biological'));
  assert.ok(openObjects.some((object) => /protein|gel|membrane/.test(`${object.id} ${object.phrase} ${object.material}`)));
  assert.ok(spec.physicalSpec.stateTextures.includes('rayBatch'));
  assert.ok(spec.physicalSpec.stateTextures.includes('velocity'));
  assert.ok(spec.physicalSpec.quality.score > 0.35);
});

test('semantic surface and grounding libraries cover broad natural language before grounding', () => {
  assert.ok(semanticRagApi.SEMANTIC_SURFACE_CARDS.length >= 600);
  assert.ok(semanticRagApi.GROUNDING_BASIS_CARDS.length >= 70);
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.length >= 650);
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'mouse'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'bridge'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'tornado'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'heart'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'asteroid'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'crop_plant'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'pump'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'fan'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'cup'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'dog'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'hammer'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'airport'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'black_hole'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'gold'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'fracturing'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'supports'));
  assert.ok(semanticRagApi.SEMANTIC_SURFACE_CARDS.every((card) => card.curation && card.curation.schema === 'simulatte.semanticCardCuration.v1'));
  assert.equal(
    semanticRagApi.SEMANTIC_SURFACE_CARDS
      .flatMap((card) => card.groundingIds || [])
      .filter((id) => id.startsWith('ground.'))
      .filter((id) => !semanticRagApi.GROUNDING_BASIS_CARDS.some((card) => card.id === id))
      .length,
    0
  );
});

test('expanded universe vocabulary composes through generated cards', () => {
  const spec = createPrototypeSpec(
    'gold hammer supports glass in a swamp while fracturing near a black hole'
  );
  const synthesis = spec.intent.synthesis;
  const selectedIds = new Set(synthesis.retrieval.selected.map((match) => match.cardId));
  const nodeIds = new Set(synthesis.synthGraph.nodes.map((node) => node.cardId));
  const relationIds = new Set(synthesis.synthGraph.relations.map((relation) => relation.cardId));
  const eventIds = new Set(synthesis.synthGraph.events.map((event) => event.cardId));
  const environmentIds = new Set(synthesis.synthGraph.environment.map((environment) => environment.id));

  assert.equal(synthesis.validation.valid, true);
  assert.ok(selectedIds.has('gold'));
  assert.ok(selectedIds.has('hammer'));
  assert.ok(selectedIds.has('fracturing'));
  assert.ok(selectedIds.has('supports'));
  assert.ok(nodeIds.has('gold'));
  assert.ok(nodeIds.has('hammer'));
  assert.ok(relationIds.has('supports'));
  assert.ok(eventIds.has('fracturing'));
  assert.ok(environmentIds.has('swamp'));
  assert.ok(environmentIds.has('black_hole'));
  assert.ok(synthesis.groundedGraph.primitiveIds.some((entry) => entry.id === 'gold'));
  assert.ok(synthesis.groundedGraph.primitiveIds.some((entry) => entry.id === 'energy-ledger'));
});

test('semantic curation prefers specific prompt objects over generic neighbors', () => {
  const animalRig = semanticRagApi.createSemanticRag(
    'mouse in a hamster wheel crashing into another gerbil in a hamster wheel',
    lab.PHYSICAL_PRIMITIVES,
    { maxSurfaceDocuments: 12, maxSynthNodes: 10 }
  );
  const greenhouse = semanticRagApi.createSemanticRag(
    'greenhouse with tomato plants, irrigation pipes, sunlight, and a fan',
    lab.PHYSICAL_PRIMITIVES,
    { maxSurfaceDocuments: 12, maxSynthNodes: 10 }
  );
  const animalNodeIds = animalRig.synthGraph.nodes.map((node) => node.cardId);
  const greenhouseNodeIds = new Set(greenhouse.synthGraph.nodes.map((node) => node.cardId));
  const wheelCard = animalRig.surfaceRetrieved.find((doc) => doc.cardId === 'artifact.wheel');

  assert.deepEqual(animalNodeIds, [
    'entity.mouse',
    'artifact.hamster-wheel',
    'entity.gerbil',
    'artifact.hamster-wheel',
  ]);
  assert.ok(wheelCard);
  assert.equal(wheelCard.curation.generic, true);
  assert.equal(animalNodeIds.includes('artifact.wheel'), false);
  assert.ok(greenhouseNodeIds.has('environment.greenhouse'));
  assert.ok(greenhouseNodeIds.has('entity.crop-plant'));
  assert.ok(greenhouseNodeIds.has('artifact.pipe-network'));
  assert.ok(greenhouseNodeIds.has('artifact.fan'));
});

test('embedding-guided graph synthesis composes unseen animal wheel collision scenes', () => {
  const prompt = 'mouse in a hamster wheel crashing into another gerbil in a hamster wheel';
  const spec = createPrototypeSpec(prompt);
  const synthesis = spec.intent.synthesis;
  const objectIds = new Set(spec.objects.map((object) => object.id));
  const renderIds = spec.renderProgram.objects.map((object) => object.id);
  const primitiveIds = new Set(synthesis.groundedGraph.primitiveIds.map((entry) => entry.id));

  assert.equal(synthesis.schema, 'simulatte.embeddingGuidedGraphSynthesis.v1');
  assert.equal(synthesis.validation.valid, true);
  assert.deepEqual(synthesis.synthGraph.nodes.map((node) => [node.id, node.cardId, node.nodeType]), [
    ['mouse_a', 'mouse', 'entity'],
    ['hamster_wheel_a', 'hamster_wheel', 'assembly'],
    ['gerbil_a', 'gerbil', 'entity'],
    ['hamster_wheel_b', 'hamster_wheel', 'assembly'],
  ]);
  assert.deepEqual(synthesis.synthGraph.relations.map((relation) => [relation.type, relation.participants]), [
    ['inside', ['mouse_a', 'hamster_wheel_a']],
    ['inside', ['gerbil_a', 'hamster_wheel_b']],
  ]);
  assert.deepEqual(synthesis.synthGraph.events.map((event) => [event.type, event.participants]), [
    ['collision', ['hamster_wheel_a', 'hamster_wheel_b']],
  ]);
  for (const id of ['soft-body', 'wheel', 'collision', 'friction', 'energy-ledger']) {
    assert.ok(primitiveIds.has(id), `missing grounded primitive ${id}`);
  }
  for (const id of ['mouse-a', 'hamster-wheel-a', 'gerbil-a', 'hamster-wheel-b', 'collision-1']) {
    assert.ok(objectIds.has(id), `missing synthesized object ${id}`);
  }
  assert.deepEqual(renderIds.slice(0, 5), [
    'mouse-a',
    'hamster-wheel-a',
    'gerbil-a',
    'hamster-wheel-b',
    'collision-1',
  ]);
  assert.equal(spec.renderProgram.rendererPlan.sceneKind, 'mechanical');
  assert.ok(spec.renderProgram.solverPlan.families.includes('constraint-dynamics'));
});

test('composition render programs do not collapse into one generic shape vocabulary', () => {
  const prompts = [
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall',
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor',
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger',
  ];
  const signatures = prompts.map((prompt) => {
    const spec = lab.createSpecFromPrompt(prompt);
    return new Set(spec.renderProgram.objects.map((object) => object.shape));
  });

  assert.ok(signatures[0].has('fuel-bed'));
  assert.ok(!signatures[0].has('prism'));
  assert.ok(signatures[1].has('prism'));
  assert.ok(!signatures[1].has('queue-node'));
  assert.ok(signatures[2].has('queue-node'));
  assert.ok(!signatures[2].has('flame-front'));
});

test('compiled render programs keep objects positioned inside the visible world', () => {
  const prompts = [
    'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun',
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall',
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor',
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger',
    'mountain watershed with river erosion, terrain patch, sand, soil, rock, water, and gravity',
  ];

  for (const prompt of prompts) {
    const spec = lab.createSpecFromPrompt(prompt);
    for (const object of spec.renderProgram.objects) {
      const center = renderObjectCenter(object);
      assert.ok(center.x >= 0.06 && center.x <= 0.94, `${object.id} x ${center.x}`);
      assert.ok(center.y >= 0.06 && center.y <= 0.94, `${object.id} y ${center.y}`);
    }
  }
});

test('solar magnetic machine places core mechanism parts in physical relation', () => {
  const spec = lab.createSpecFromPrompt(
    'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun'
  );
  const byId = Object.fromEntries(spec.renderProgram.objects.map((object) => [object.id, object]));
  const wheel = renderObjectCenter(byId['rotor-wheel']);
  const slider = renderObjectCenter(byId['stator-slider']);
  const panel = renderObjectCenter(byId['solar-panel']);
  const load = renderObjectCenter(byId['motor-load']);

  assert.ok(wheel.x > 0.42 && wheel.x < 0.58);
  assert.ok(wheel.y > 0.42 && wheel.y < 0.58);
  assert.ok(slider.x > wheel.x);
  assert.ok(panel.x < wheel.x && panel.y < wheel.y);
  assert.ok(load.x > wheel.x && load.y > wheel.y);
});

function renderObjectCenter(object) {
  assert.ok(object, 'render object missing');
  const pose = object.pose || {};
  if (Array.isArray(pose.points) && pose.points.length) {
    const sum = pose.points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
    return { x: sum[0] / pose.points.length, y: sum[1] / pose.points.length };
  }
  return { x: pose.x || 0.5, y: pose.y || 0.5 };
}

test('component state ownership is initialized and stepped by component id', () => {
  const spec = lab.createSpecFromPrompt(
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger'
  );
  const initial = lab.createSimulationState(spec);
  const next = lab.stepSimulation(initial, spec, 1 / 60);

  assert.ok(initial.componentStates['market-queue']);
  assert.ok(Number.isFinite(initial.componentStates['market-queue'].backlog));
  assert.ok(next.componentStates['market-queue'].backlog >= initial.componentStates['market-queue'].backlog);
  assert.ok(spec.contract.graph.operators.some((operator) => operator.id === 'queueService'));
  assert.ok(spec.contract.graph.conservation.some((rule) => rule.id === 'queue-inventory'));
});

test('graph validity reports repairs for invalid raw material and queue compositions', () => {
  const spec = lab.createSpecFromPrompt('rock served by queue');
  const validation = spec.contract.graph.validation;

  assert.equal(validation.status, 'repaired');
  assert.ok(validation.warnings.some((warning) => warning.includes('rock cannot be served')));
  assert.ok(validation.repairs.some((repair) => repair.includes('logistics-node')));
});

test('scene layout grammar and contextual gauges vary by requested world type', () => {
  const optics = lab.createSpecFromPrompt(
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor'
  );
  const watershed = lab.createSpecFromPrompt(
    'mountain watershed with river erosion, terrain patch, sand, soil, rock, water, and gravity'
  );
  const city = lab.createSpecFromPrompt(
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger'
  );

  assert.equal(optics.contract.layout.grammar, 'bench');
  assert.ok(optics.contract.interactions.some((rule) => rule.id === 'glass-refracts-light'));
  assert.ok(lab.readoutLabelsForSpec(optics).includes('refraction'));
  assert.equal(watershed.contract.layout.grammar, 'downhill channel');
  assert.ok(watershed.contract.interactions.some((rule) => rule.id === 'water-carries-erosion'));
  assert.ok(lab.readoutLabelsForSpec(watershed).includes('erosion rate'));
  assert.equal(city.contract.layout.grammar, 'orthogonal network');
  assert.ok(lab.readoutLabelsForSpec(city).includes('queue backlog'));
});

test('layer contracts survive spec export and import', () => {
  const spec = lab.createSpecFromPrompt(
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor'
  );
  const restored = lab.deserializeSpec(lab.serializeSpec(spec));
  const lens = restored.objects.find((object) => object.id === 'lens');

  assert.equal(restored.contract.schema, 'simulatte.layerContract.v1');
  assert.deepEqual(restored.contract.readouts, spec.contract.readouts);
  assert.equal(restored.contract.materials.glass.refractiveIndex, 1.52);
  assert.equal(lens.geometry.shape, 'surface');
  assert.ok(lens.ports.outputs.includes('light'));
});

test('blank world is an empty construction plane, not a machine seed', () => {
  const spec = lab.createSpec('blank-world');
  const state = lab.stepSimulation(lab.createSimulationState(spec), spec, 1 / 60);
  const readouts = lab.readoutValues(state, spec);

  assert.equal(spec.templateId, 'blank-world');
  assert.equal(spec.modules.length, 0);
  assert.equal(spec.objects.length, 0);
  assert.deepEqual(Object.keys(readouts), ['modules', 'objects', 'forces', 'sources', 'sinks', 'canvas']);
  for (const value of Object.values(readouts)) {
    assert.ok(Number.isFinite(Number(value)), `blank readout ${value} should be finite`);
  }
});

test('flow seed remains visually and structurally separate from machine seed', () => {
  const flow = lab.createSpec('fluid-vortex');
  const machine = lab.createSpec('magnetic-wheel');

  assert.equal(flow.templateId, 'fluid-vortex');
  assert.ok(flow.modules.includes('fluid'));
  assert.ok(flow.objects.some((object) => object.id === 'fluid-particles'));
  assert.ok(!flow.modules.includes('electromagnetism'));
  assert.ok(machine.modules.includes('electromagnetism'));
});

test('all built-in templates step with finite readouts', () => {
  for (const template of lab.TEMPLATE_LIBRARY) {
    const spec = lab.createSpec(template.id);
    let state = lab.createSimulationState(spec);
    for (let i = 0; i < 120; i += 1) {
      state = lab.stepSimulation(state, spec, 1 / 60);
    }
    const readouts = lab.readoutValues(state, spec);
    assert.equal(Object.keys(readouts).length, template.readouts.length);
    for (const value of Object.values(readouts)) {
      assert.ok(Number.isFinite(Number(value)), `${template.id} readout ${value} should be finite`);
    }
  }
});

test('solar magnetic wheel advances with finite physical state', () => {
  let state = lab.createState();
  for (let i = 0; i < 240; i += 1) {
    state = lab.stepState(state, state.params, 1 / 60);
  }
  const ledger = lab.energyLedger(state);

  assert.ok(Number.isFinite(state.theta));
  assert.ok(Number.isFinite(state.omega));
  assert.ok(Number.isFinite(ledger.rpm));
  assert.ok(ledger.solarInputJ > 0);
  assert.ok(ledger.actuatorWorkJ >= 0);
  assert.ok(ledger.frictionLossJ >= 0);
});

test('zero sun prevents hidden actuator energy injection', () => {
  let state = lab.createState({ irradiance: 0, magneticStrength: 1.2, sliderAmplitude: 1 });
  for (let i = 0; i < 180; i += 1) {
    state = lab.stepState(state, state.params, 1 / 60);
  }
  const ledger = lab.energyLedger(state);

  assert.equal(ledger.solarInputJ, 0);
  assert.equal(ledger.actuatorWorkJ, 0);
  assert.equal(ledger.solarBufferJ, 0);
});

test('load output remains bounded by tracked input and stored motion', () => {
  let state = lab.createState({ irradiance: 900, loadTorque: 0.24 });
  for (let i = 0; i < 360; i += 1) {
    state = lab.stepState(state, state.params, 1 / 60);
  }
  const ledger = lab.energyLedger(state);
  const accountedEnergy =
    ledger.actuatorWorkJ +
    ledger.wheelKineticJ +
    ledger.frictionLossJ +
    ledger.generatorLossJ +
    ledger.solarBufferJ;

  assert.ok(ledger.loadOutputJ <= ledger.solarInputJ + accountedEnergy + 1e-6);
});
