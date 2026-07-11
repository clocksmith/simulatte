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

test('molecular biology prompts do not admit robot visuals without robot evidence', () => {
  const spec = createPrototypeSpec(
    'protein folding energy minimization with chain geometry and bond constraints'
  );
  const mappingIds = spec.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);

  assert.ok(mappingIds.includes('visual.operator.biological-growth.v1'));
  assert.ok(!mappingIds.includes('visual.operator.robot-contact.v1'));
  assert.equal(spec.renderProgram.visualIR.sceneKind, 'molecular-biology');
});

test('microbiome evidence compiles a biological graphics basis', () => {
  const spec = createPrototypeSpec(
    'gut microbiome colonies exchanging metabolites through intestinal folds under immune sampling'
  );
  const atoms = spec.renderProgram.visualIR.graphicsAtoms;
  const mappingIds = atoms.mappings.map((row) => row.id);

  assert.equal(spec.renderProgram.visualIR.sceneKind, 'evolution-ecology');
  assert.ok(mappingIds.includes('visual.operator.biological-growth.v1'));
  assert.ok(atoms.uniforms.bySlot.biological > 0);
  assert.ok(atoms.wgslOperators.includes('atomBiologicalBranches'));
});

test('fermentation prompts compile to molecular biology with dough-specific visual atoms', () => {
  const spec = createPrototypeSpec(
    'sourdough fermentation gas bubbles growing through a dough matrix with gluten strands and acidity gradients'
  );
  const atoms = spec.renderProgram.visualIR.graphicsAtoms;
  const mappingIds = atoms.mappings.map((row) => row.id);
  const geometryIds = atoms.geometry.map((row) => row.id);
  const processIds = atoms.processes.map((row) => row.id);
  const motionIds = atoms.motion.map((row) => row.id);

  assert.equal(spec.renderIR.sceneHint, 'molecular-biology');
  assert.equal(spec.renderProgram.visualIR.sceneKind, 'molecular-biology');
  assert.ok(mappingIds.includes('visual.operator.fermentation-matrix.v1'));
  assert.ok(mappingIds.includes('visual.operator.chemical-diffusion.v1'));
  assert.ok(mappingIds.includes('visual.operator.biological-growth.v1'));
  assert.ok(geometryIds.includes('porous-dough-matrix'));
  assert.ok(geometryIds.includes('gluten-strand-network'));
  assert.ok(geometryIds.includes('fermentation-bubble-cell'));
  assert.ok(processIds.includes('microbial-fermentation'));
  assert.ok(processIds.includes('gas-pocket-growth'));
  assert.ok(motionIds.includes('bubble-expansion'));
  assert.ok(atoms.uniforms.bySlot.biological > 0);
  assert.ok(atoms.uniforms.bySlot.chemical > 0);
  assert.ok(atoms.uniforms.bySlot.fluid > 0);
  assert.ok(atoms.wgslOperators.includes('atomFermentationBubbles'));
});

test('thin-film prompts do not collapse into fermentation bubble visuals', () => {
  const spec = createPrototypeSpec(
    'soap thin film with air bubbles in wire loops and iridescent interference'
  );
  const atoms = spec.renderProgram.visualIR.graphicsAtoms;
  const mappingIds = atoms.mappings.map((row) => row.id);
  const geometryIds = atoms.geometry.map((row) => row.id);

  assert.equal(spec.renderProgram.visualIR.sceneKind, 'thin-film');
  assert.ok(mappingIds.includes('visual.operator.thin-film-interference.v1'));
  assert.ok(!mappingIds.includes('visual.operator.fermentation-matrix.v1'));
  assert.ok(geometryIds.includes('thin-film-sheet'));
  assert.ok(geometryIds.includes('wire-loop-frame'));
  assert.ok(atoms.uniforms.bySlot.optical > 0);
  assert.ok(atoms.uniforms.bySlot.phase > 0);
});

test('particle instrument prompts get track and detector graphics atoms', () => {
  const spec = createPrototypeSpec(
    'particle collider muon tracks through detector slice with calorimeter pulses'
  );
  const atoms = spec.renderProgram.visualIR.graphicsAtoms;
  const mappingIds = atoms.mappings.map((row) => row.id);
  const geometryIds = atoms.geometry.map((row) => row.id);

  assert.equal(spec.renderProgram.visualIR.sceneKind, 'particle-instrument');
  assert.ok(mappingIds.includes('visual.operator.particle-track-detector.v1'));
  assert.ok(mappingIds.includes('visual.operator.instrument-readout.v1'));
  assert.ok(geometryIds.includes('detector-slice-stack'));
  assert.ok(geometryIds.includes('muon-track-ribbons'));
  assert.ok(atoms.uniforms.bySlot.instrument > 0);
  assert.ok(atoms.uniforms.bySlot.measurement > 0);
});

test('acoustic dust levitation stays acoustic instead of collapsing into granular scene routing', () => {
  const spec = createPrototypeSpec(
    'acoustic levitator dust brass tube standing pressure waves'
  );
  const atoms = spec.renderProgram.visualIR.graphicsAtoms;
  const mappingIds = atoms.mappings.map((row) => row.id);

  assert.equal(spec.renderIR.sceneHint, 'acoustic');
  assert.equal(spec.renderProgram.visualIR.sceneKind, 'acoustic');
  assert.ok(mappingIds.includes('visual.operator.acoustic-wave.v1'));
  assert.ok(atoms.uniforms.bySlot.acoustic > atoms.uniforms.bySlot.granular);
  assert.ok(atoms.wgslOperators.includes('atomAcousticRings'));
});

test('bridge resonance prompts carry structural stress graphics atoms', () => {
  const spec = createPrototypeSpec(
    'bridge resonance under wind vortex shedding with cable tension'
  );
  const atoms = spec.renderProgram.visualIR.graphicsAtoms;
  const mappingIds = atoms.mappings.map((row) => row.id);

  assert.equal(spec.renderProgram.visualIR.sceneKind, 'structural-mechanics');
  assert.ok(mappingIds.includes('visual.operator.stress-fracture.v1'));
  assert.ok(mappingIds.includes('visual.operator.fluid-advection.v1'));
  assert.ok(atoms.uniforms.bySlot.stress > 0);
  assert.ok(atoms.uniforms.bySlot.constraint > 0);
  assert.ok(atoms.wgslOperators.includes('atomStressCracks'));
});

test('visual routing avoids weather, hazard, and material scene false positives', () => {
  const weather = createPrototypeSpec(
    'supercell thunderstorm grows hail under wind shear'
  );
  const weatherMappings = weather.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);
  assert.equal(weather.renderProgram.visualIR.sceneKind, 'weather-atmosphere');
  assert.ok(weatherMappings.includes('visual.operator.fluid-advection.v1'));
  assert.ok(!weatherMappings.includes('visual.operator.biological-growth.v1'));

  const agro = createPrototypeSpec(
    'compost feeds greenhouse nutrient loop with organic waste'
  );
  const agroMappings = agro.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);
  assert.equal(agro.renderProgram.visualIR.sceneKind, 'agro-waste-loop');
  assert.ok(agroMappings.includes('visual.operator.biological-growth.v1'));
  assert.ok(agro.renderProgram.visualIR.graphicsAtoms.uniforms.bySlot.biological > 0);

  const hazard = createPrototypeSpec(
    'hurricane evacuation traffic under storm surge'
  );
  assert.equal(hazard.renderProgram.visualIR.sceneKind, 'hazard-atmosphere');
  assert.notEqual(hazard.renderProgram.visualIR.sceneKind, 'restoration-water');

  const materialTray = createPrototypeSpec(
    'sample tray of water air rock wood metal under force fields'
  );
  assert.equal(materialTray.renderProgram.visualIR.sceneKind, 'material-tray');

  const cultural = createPrototypeSpec(
    'museum preservation pigment film humidity aging'
  );
  assert.equal(cultural.renderProgram.visualIR.sceneKind, 'cultural-material');
});

test('warehouse language does not unlock robot visuals without robot evidence', () => {
  const warehouseFire = createPrototypeSpec(
    'warehouse fire with smoke in concrete stairwell and renderer layers soot'
  );
  const parcelSorting = createPrototypeSpec(
    'sorts parcels in a warehouse queue with conveyor belts'
  );
  const robotWarehouse = createPrototypeSpec(
    'robot arm sorts packages in a warehouse with force sensors and feedback'
  );
  const fireMappings = warehouseFire.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);
  const parcelMappings = parcelSorting.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);
  const robotMappings = robotWarehouse.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);

  assert.equal(warehouseFire.renderProgram.visualIR.sceneKind, 'fire');
  assert.ok(fireMappings.includes('visual.operator.thermal-combustion.v1'));
  assert.ok(!fireMappings.includes('visual.operator.robot-contact.v1'));
  assert.ok(parcelMappings.includes('visual.operator.network-flow.v1'));
  assert.ok(!parcelMappings.includes('visual.operator.robot-contact.v1'));
  assert.notEqual(parcelSorting.renderProgram.visualIR.sceneKind, 'robotics-control');
  assert.ok(robotMappings.includes('visual.operator.robot-contact.v1'));
  assert.ok(robotWarehouse.renderProgram.visualIR.graphicsAtoms.languageSignals.length > 0);
});

test('negated visual operator language does not satisfy positive graphics requirements', () => {
  const protein = createPrototypeSpec(
    'protein folding in water with no robot arm'
  );
  const phase = createPrototypeSpec(
    'phase study in a generic lab with no qubits or quantum hardware'
  );
  const proteinMappings = protein.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);
  const phaseMappings = phase.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);
  const phaseSignals = phase.renderProgram.visualIR.graphicsAtoms.languageSignals.map((row) => row.text).join(' ');

  assert.equal(protein.renderProgram.visualIR.sceneKind, 'molecular-biology');
  assert.ok(proteinMappings.includes('visual.operator.biological-growth.v1'));
  assert.ok(!proteinMappings.includes('visual.operator.robot-contact.v1'));
  assert.ok(phaseMappings.includes('visual.operator.phase-transition.v1'));
  assert.ok(!phaseMappings.includes('visual.operator.quantum-phase-readout.v1'));
  assert.doesNotMatch(phaseSignals, /\b(qubit|quantum)\b/);
});

test('provided residual hints can steer the selected physical graph without naming a model', () => {
  const spec = lab.createSpecFromPrompt('quiet demonstration plane', {
    dopplerIntent: {
      schema: 'simulatte.dopplerIntentHints.v1',
      source: 'provided-intent-hints',
      primitives: [
        { primitiveId: 'optics-bench', score: 0.99, reason: 'provided optical bench receipt' },
        { primitiveId: 'prism', score: 0.96, reason: 'provided beam-split receipt' },
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
  assert.equal(spec.physicalSpec.receipt.doppler.model, '');
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
  assert.equal(spec.physicalSpec.executionSource, 'solverGraph');
  assert.ok(spec.physicalSpec.visualStateHints.includes('rayBatch'));
  assert.ok(spec.physicalSpec.visualStateHints.includes('velocity'));
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
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'spacecraft'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'submarine'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'turbine'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'piano'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'castle'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'lava_material'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'algae'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'volcano_environment'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'storm_environment'));
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

test('semantic RAG does not dot model query vectors against local hashed feature vectors', () => {
  const { index } = loadEmbeddingIndex();
  const promptVector = indexedVector(index, 'water');
  const primitiveIndex = {
    id: 'test-normalized-qwen-index',
    documents: [
      { primitiveId: 'water', vector: Array.from(promptVector) },
    ],
  };
  const rag = semanticRagApi.createSemanticRag(
    'dogs and cats swimming in water',
    lab.PHYSICAL_PRIMITIVES,
    {
      primitiveIndex,
      promptVector,
      maxDocuments: 16,
      maxSurfaceDocuments: 12,
    }
  );
  const modelRows = rag.retrieved.filter((row) => row.semanticVectorSpace === 'qwen-model-embedding');
  const surfaceRows = rag.surfaceRetrieved.filter((row) => row.featureVectorSpace === 'simulatte-local-hashed-features');

  assert.ok(modelRows.length > 0);
  assert.ok(surfaceRows.length > 0);
  assert.ok(surfaceRows.every((row) => row.semanticScore === 0));
  assert.ok(surfaceRows.every((row) => row.featureScore >= 0));
});

test('literal training review prompts survive semantic grounding into render objects', () => {
  const animalRag = semanticRagApi.createSemanticRag(
    'dogs and cats swimming',
    lab.PHYSICAL_PRIMITIVES,
    { maxSurfaceDocuments: 12, maxSynthNodes: 10 }
  );
  const animalCardIds = animalRag.synthGraph.nodes.map((node) => node.cardId);
  assert.deepEqual(animalCardIds.slice(0, 2), ['entity.dog', 'entity.cat']);

  const dogs = createPrototypeSpec('dogs');
  const flowers = createPrototypeSpec('flowers');
  const mountains = createPrototypeSpec('trees and mountaints');
  const swimming = createPrototypeSpec('dogs and cats swimming');

  const dogObjects = Object.fromEntries(dogs.renderProgram.objects.map((object) => [object.id, object]));
  const flowerObjects = Object.fromEntries(flowers.renderProgram.objects.map((object) => [object.id, object]));
  const mountainObjects = Object.fromEntries(mountains.renderProgram.objects.map((object) => [object.id, object]));
  const swimmingObjects = Object.fromEntries(swimming.renderProgram.objects.map((object) => [object.id, object]));
  const mappingIds = (spec) => spec.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);
  const catalogCount = (spec) => spec.renderProgram.objects.filter((object) => object.source === 'catalog').length;
  const geometryKinds = (spec) => spec.physicsIR.entities.map((entity) => entity.geometryRef && entity.geometryRef.kind);

  assert.equal(dogObjects['dog-a'].shape, 'animal-body');
  assert.equal(dogObjects['surface-dog-1'].shape, 'animal-body');
  assert.ok(geometryKinds(dogs).includes('animal-body'));
  assert.equal(dogs.renderProgram.rendererPlan.sceneKind, 'biology');
  assert.ok(mappingIds(dogs).includes('visual.operator.biological-growth.v1'));
  assert.ok(!mappingIds(dogs).includes('visual.operator.instrument-readout.v1'));
  assert.ok(catalogCount(dogs) <= 6);
  assert.ok(!dogs.renderProgram.solverPlan.families.includes('fracture-threshold'));
  assert.equal(flowerObjects['flower-a'].shape, 'fuel-bed');
  assert.equal(flowerObjects['surface-flower-1'].shape, 'fuel-bed');
  assert.ok(geometryKinds(flowers).includes('botanical-cluster'));
  assert.equal(flowers.renderProgram.rendererPlan.sceneKind, 'biology');
  assert.ok(mappingIds(flowers).includes('visual.operator.biological-growth.v1'));
  assert.ok(!mappingIds(flowers).includes('visual.operator.instrument-readout.v1'));
  assert.ok(catalogCount(flowers) <= 6);
  const flowerPacketIdentities = flowers.renderProgram.sceneRenderPacket.entities.map((entity) => entity.identity);
  assert.ok(flowerPacketIdentities.some((identity) => identity.type === 'flower'));
  assert.ok(flowerPacketIdentities.every((identity) => identity.renderClass !== 'water-volume'));
  assert.equal(mountainObjects['tree-a'].shape, 'fuel-bed');
  assert.equal(mountainObjects['environment-mountain'].role, 'mountain');
  assert.equal(mountainObjects['surface-mountain-1'].phrase, 'mountaints');
  assert.equal(mountains.renderProgram.rendererPlan.sceneKind, 'watershed');
  assert.ok(mappingIds(mountains).includes('visual.operator.granular-erosion.v1'));
  assert.ok(mappingIds(mountains).includes('visual.operator.biological-growth.v1'));
  assert.ok(!mappingIds(mountains).includes('visual.operator.instrument-readout.v1'));
  assert.equal(swimmingObjects['dog-a'].shape, 'animal-body');
  assert.equal(swimmingObjects['cat-a'].shape, 'animal-body');
  assert.equal(swimmingObjects.water.shape, 'pool');
  const swimmingIdentities = new Set(
    swimming.renderProgram.visualIR.sceneRenderPacket.entities
      .map((entity) => entity.identity && entity.identity.type)
      .filter(Boolean)
  );
  assert.ok(swimmingIdentities.has('dog'));
  assert.ok(swimmingIdentities.has('cat'));
  assert.ok(swimmingIdentities.has('water'));
  assert.ok(geometryKinds(swimming).every((kind) => kind && kind !== 'body'));
  assert.equal(swimmingObjects['fluid-advection'].source, 'prompt-family');
  assert.equal(swimming.renderProgram.rendererPlan.sceneKind, 'watershed');
  assert.ok(mappingIds(swimming).includes('visual.operator.biological-growth.v1'));
  assert.ok(mappingIds(swimming).includes('visual.operator.fluid-advection.v1'));
  assert.ok(!mappingIds(swimming).includes('visual.operator.instrument-readout.v1'));
  assert.equal(catalogCount(swimming), 0);
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

test('building fire keeps a structural building mixed with fire visuals', () => {
  const fire = lab.createSpecFromPrompt('fire');
  const buildingFire = lab.createSpecFromPrompt('building fire');
  const warehouseFire = lab.createSpecFromPrompt('warehouse fire with smoke in concrete stairwell');
  const buildingObjects = buildingFire.renderProgram.objects.filter((object) => object.shape === 'building');
  const warehouseObjects = warehouseFire.renderProgram.objects.filter((object) => object.shape === 'building');
  const fireShapes = new Set(fire.renderProgram.objects.map((object) => object.shape));
  const buildingFireShapes = new Set(buildingFire.renderProgram.objects.map((object) => object.shape));

  assert.equal(buildingFire.promptParse.spans.some((span) => span.text === 'building'), true);
  assert.ok(buildingObjects.length >= 1);
  assert.ok(warehouseFire.promptParse.spans.some((span) => span.text === 'warehouse'));
  assert.ok(warehouseFire.promptParse.spans.some((span) => /\bstairwell\b/.test(span.text)));
  assert.ok(warehouseObjects.length >= 1);
  assert.ok(buildingFire.renderProgram.objects.some((object) => object.shape === 'flame-front'));
  assert.ok(warehouseFire.renderProgram.objects.some((object) => object.shape === 'flame-front'));
  assert.ok(!fireShapes.has('building'));
  assert.ok(buildingFireShapes.has('building'));
  assert.notDeepEqual([...buildingFireShapes].sort(), [...fireShapes].sort());
});

test('render programs keep prompt nouns literal and avoid unrelated scene fields', () => {
  const thinFilm = lab.createSpecFromPrompt('soap thin film with air bubbles in wire loops');
  const animalRig = lab.createSpecFromPrompt('mouse in a wheel crashes into a wall');
  const mixedScene = lab.createSpecFromPrompt(
    'gold hammer supports glass in a swamp while fracturing near a black hole'
  );
  const city = lab.createSpecFromPrompt('city market queue traffic network');
  const watershed = lab.createSpecFromPrompt('rain erodes a mountain watershed into sediment channels');
  const ferrofluid = lab.createSpecFromPrompt('ferrofluid with copper coil and pulsing current');

  const thinById = Object.fromEntries(thinFilm.renderProgram.objects.map((object) => [object.id, object]));
  const rigById = Object.fromEntries(animalRig.renderProgram.objects.map((object) => [object.id, object]));
  const mixedById = Object.fromEntries(mixedScene.renderProgram.objects.map((object) => [object.id, object]));

  assert.equal(thinById['open-soap-thin-film-1'].shape, 'film');
  assert.equal(thinById['open-air-bubbles-2'].shape, 'bubble');
  assert.equal(thinById['open-wire-loops-3'].shape, 'wire-loop');
  assert.equal(rigById['mouse-a'].shape, 'animal-body');
  assert.equal(rigById['wheel-a'].shape, 'wheel');
  assert.ok(Math.abs(rigById['mouse-a'].pose.x - rigById['wheel-a'].pose.x) < 0.03);
  assert.ok(rigById.collision.pose.x > rigById['wheel-a'].pose.x);
  assert.equal(mixedById['gold-a'].shape, 'bar');
  assert.equal(mixedById['gold-a'].material, 'gold');
  assert.equal(mixedById['hammer-a'].shape, 'hammer');
  assert.equal(mixedById['glass-material-a'].shape, 'lens');
  assert.equal(mixedById['glass-material-a'].material, 'glass');
  assert.equal(mixedById['environment-swamp'].shape, 'wetland');
  assert.equal(mixedById['environment-black-hole'].shape, 'singularity');
  assert.equal(mixedScene.renderProgram.rendererPlan.sceneKind, 'planetary-space');
  assert.equal(ferrofluid.renderProgram.objects.find((object) => object.id === 'ferrofluid-a').shape, 'pool');
  assert.equal(ferrofluid.renderProgram.objects.find((object) => object.id === 'ferrofluid-a').material, 'ferrofluid');
  assert.deepEqual(city.renderProgram.fields.map((field) => field.kind), ['network-flow']);
  assert.deepEqual([...watershed.renderProgram.fields.map((field) => field.kind)].sort(), ['flow', 'gravity']);
  assert.deepEqual(ferrofluid.renderProgram.fields.map((field) => field.kind), ['dipole']);
  assert.deepEqual(thinFilm.renderProgram.fields.map((field) => field.kind), ['optical-rays']);
});

test('expanded universe prompts preserve specific generated simulation objects', () => {
  const cosmic = lab.createSpecFromPrompt(
    'spaceship orbiting a volcano while crystal towers melt lava into a river'
  );
  const acousticCastle = lab.createSpecFromPrompt(
    'quantum piano bends laser light through an ice castle'
  );
  const undersea = lab.createSpecFromPrompt(
    'submarine city under a storm with turbines and glowing algae'
  );
  const lavaBridge = lab.createSpecFromPrompt(
    'clockwork bridge over lava with mirrors and falling sand'
  );

  const cosmicShapes = new Set(cosmic.renderProgram.objects.map((object) => object.shape));
  const acousticShapes = new Set(acousticCastle.renderProgram.objects.map((object) => object.shape));
  const underseaShapes = new Set(undersea.renderProgram.objects.map((object) => object.shape));
  const bridgeById = Object.fromEntries(lavaBridge.renderProgram.objects.map((object) => [object.id, object]));

  assert.equal(cosmic.renderProgram.rendererPlan.sceneKind, 'thermal-plume');
  assert.ok(cosmicShapes.has('rocket'));
  assert.ok(cosmicShapes.has('volcano'));
  assert.ok(cosmicShapes.has('tower'));
  assert.ok(cosmicShapes.has('lava-flow'));
  assert.ok(acousticShapes.has('instrument'));
  assert.ok(acousticShapes.has('castle'));
  assert.ok(acousticShapes.has('lens'));
  assert.ok(underseaShapes.has('submarine'));
  assert.ok(underseaShapes.has('storm'));
  assert.ok(underseaShapes.has('turbine'));
  assert.ok(underseaShapes.has('plant-cluster'));
  assert.equal(bridgeById['gearbox-a'].shape, 'wheel');
  assert.equal(bridgeById['bridge-a'].shape, 'bridge');
  assert.equal(bridgeById['lava-material-a'].shape, 'lava-flow');
  assert.ok(undersea.renderProgram.solverPlan.families.includes('growth-diffusion'));
  assert.ok(cosmic.renderProgram.solverPlan.families.includes('phase-boundary'));
});

test('compiled render programs keep objects positioned inside the visible world', () => {
  const prompts = [
    'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun',
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall',
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor',
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger',
    'mountain watershed with river erosion, terrain patch, sand, soil, rock, water, and gravity',
    'thermal plume bends smoke over cooling fins',
    'ferrofluid spikes around copper coils under pulsing current',
    'granular beads avalanche through a vibrating sieve',
    'soap film colors stretch around air bubbles and wire loops',
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
