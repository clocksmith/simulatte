const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const jsDir = path.join(root, 'public', 'js');
const catalog = require(path.join(jsDir, 'simulatte-physics-catalog.js'));

function jsFiles(dir) {
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(dir, name));
}

test('public javascript keeps lines below the repository ceiling', () => {
  for (const file of jsFiles(jsDir)) {
    const rel = path.relative(root, file);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      assert.ok(
        line.length <= 777,
        `${rel}:${index + 1} has ${line.length} characters`
      );
    });
  }
});

test('physics lab is split into catalog, model, renderer, and coordinator', () => {
  const expected = [
    'simulatte-physics-catalog.js',
    'simulatte-semantic-rag.js',
    'simulatte-doppler-intent.js',
    'simulatte-intent-embedder.js',
    'simulatte-intent-classifier.js',
    'simulatte-composition-graph.js',
    'simulatte-physics-model.js',
    'simulatte-physics-renderer.js',
    'simulatte-physics-lab.js',
  ];

  for (const name of expected) {
    assert.ok(fs.existsSync(path.join(jsDir, name)), `${name} should exist`);
  }

  const coordinatorLines = fs.readFileSync(
    path.join(jsDir, 'simulatte-physics-lab.js'),
    'utf8'
  ).split(/\r?\n/);
  assert.ok(coordinatorLines.length < 80);
});

test('procedural visual base exposes a broad prompt-addressed catalog', () => {
  assert.equal(catalog.PROCEDURAL_VISUAL_BASE.schema, 'simulatte.proceduralVisualBase.v1');
  assert.ok(catalog.PROCEDURAL_VISUAL_BASE.markFamilies.length >= 9);
  assert.ok(catalog.PROCEDURAL_VISUAL_BASE.textureFamilies.length >= 9);
  assert.ok(catalog.PROCEDURAL_VISUAL_BASE.layoutFamilies.length >= 8);
  assert.deepEqual(catalog.PROCEDURAL_VISUAL_BASE.tokenOrders, [1, 2, 3]);
  assert.ok(catalog.PROCEDURAL_VISUAL_BASE.addressableVariants > 1000000000);
  assert.equal(catalog.SEMANTIC_VISUAL_ATLAS.schema, 'simulatte.semanticVisualAtlas.v1');
  assert.ok(catalog.SEMANTIC_VISUAL_ATLAS.archetypeFamilies.length >= 24);
  assert.ok(catalog.SEMANTIC_VISUAL_ATLAS.materialFamilies.length >= 20);
  assert.ok(catalog.SEMANTIC_VISUAL_ATLAS.processFamilies.length >= 24);
  assert.ok(catalog.SEMANTIC_VISUAL_ATLAS.addressableVariants > 100000000000000);
});

test('physics visuals use material continuum paths instead of generic glyph particles', () => {
  const renderer = fs.readFileSync(
    path.join(jsDir, 'simulatte-physics-renderer.js'),
    'utf8'
  );
  const field = fs.readFileSync(
    path.join(jsDir, 'simulatte-particle-field.js'),
    'utf8'
  );

  assert.match(renderer, /function drawMaterialContinuumField/);
  assert.match(renderer, /function drawThermalContinuum/);
  assert.match(renderer, /function drawFluidContinuum/);
  assert.match(renderer, /function drawOpticalContinuum/);
  assert.match(renderer, /function paintFireWorld/);
  assert.match(renderer, /function paintOpticsWorld/);
  assert.match(renderer, /function paintCityWorld/);
  assert.match(renderer, /function paintWatershedWorld/);
  assert.match(renderer, /function paintMagneticMachineWorld/);
  assert.match(renderer, /function paintMaterialTrayWorld/);
  assert.match(renderer, /function paintBiologyWorld/);
  assert.match(renderer, /function paintAcousticWorld/);
  assert.match(renderer, /function paintGenomeSceneBackground/);
  assert.match(renderer, /function drawGenomeTexture/);
  assert.match(renderer, /function drawPromptFingerprintTexture/);
  assert.match(renderer, /function drawPromptDnaMark/);
  assert.match(renderer, /function drawSemanticWorldLayers/);
  assert.match(renderer, /function drawSemanticArchetype/);
  assert.match(renderer, /function drawSemanticMaterialShader/);
  assert.match(renderer, /function drawSemanticProcessOverlay/);
  assert.match(renderer, /function objectExtentWithVisualGenome/);
  assert.match(renderer, /function drawCanvasTexture/);
  assert.match(renderer, /function drawObjectSilhouette/);
  assert.match(renderer, /function beginObjectSilhouettePath/);
  assert.match(renderer, /function drawObjectAccentDetails/);
  assert.match(renderer, /function drawThermalObjectMarks/);
  assert.match(renderer, /function drawFluidObjectMarks/);
  assert.match(renderer, /function drawGranularObjectMarks/);
  assert.match(renderer, /function drawMagneticObjectMarks/);
  assert.match(renderer, /Math\.max\(0\.42, alpha\)/);
  assert.doesNotMatch(renderer, /drawPrismaticParticleField/);
  assert.doesNotMatch(renderer, /function draw[A-Z][A-Za-z]+Shape/);
  assert.doesNotMatch(renderer, /drawFieldSplat/);
  assert.doesNotMatch(renderer, /\.fillText\(/);
  assert.doesNotMatch(renderer, /setLineDash/);
  assert.match(field, /const INSTANCE_STRIDE = 8/);
  assert.match(field, /function materialVisualClass/);
  assert.match(field, /@location\(6\) stretch/);
});

test('home prompt shuffle stays consistent between HTML and catalog', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const catalog = fs.readFileSync(path.join(jsDir, 'simulatte-physics-catalog.js'), 'utf8');

  assert.match(html, /id="shuffle-prompt"/);
  assert.match(html, /Shuffle 256 examples/);
  assert.doesNotMatch(html, /data-example-prompt=/);
  assert.match(html, /<textarea id="build-prompt"[^>]*>laser heats ferrofluid lens over copper coil<\/textarea>/);
  assert.match(catalog, /const HANDWRITTEN_EXAMPLE_PROMPTS = Object\.freeze/);
  assert.match(catalog, /const EXAMPLE_INTENTS = Object\.freeze\(HANDWRITTEN_EXAMPLE_PROMPTS\.map/);
  assert.match(catalog, /"supernova"/);
  assert.match(catalog, /"browser DOM elements orbit a growing selector ball"/);
  assert.doesNotMatch(catalog, /PROMPT_SHUFFLE_GROUPS|promptShuffleGroup|paramsForShufflePrompt/);
  assert.doesNotMatch(html, /aria-label="Seed W"|lava spins turbine into ice wall|projectile cracks glass tower/);
  assert.doesNotMatch(catalog, /id: 'lava-turbine'|id: 'fracture-tower'/);
});

test('Doppler residual intent has a strict static contract and no network dependency', () => {
  const runtime = fs.readFileSync(path.join(jsDir, 'simulatte-doppler-intent.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const oldRuntimePath = path.join(root, 'public', 'doppler', 'src', 'index-browser.js');
  const oldRuntime = fs.readFileSync(oldRuntimePath, 'utf8');

  assert.match(runtime, /simulatte\.dopplerIntentHints\.v1/);
  assert.match(runtime, /normalizeDopplerIntent/);
  assert.match(runtime, /strictPrompt/);
  assert.match(runtime, /importDopplerModule/);
  assert.match(runtime, /chatText/);
  assert.match(runtime, /DEFAULT_MODULE_URL = '\.\/vendor\/doppler\/src\/index-browser\.js'/);
  assert.match(runtime, /DEFAULT_KERNEL_BASE_PATH = '\.\/vendor\/doppler\/src\/gpu\/kernels'/);
  assert.match(runtime, /ensureDopplerKernelBasePath/);
  assert.match(runtime, /ensureDopplerKernelBasePath\(options\.dopplerKernelBasePath \|\| urlValue\('dopplerKernelBase'\)\);\n    const moduleApi = options\.dopplerModule \|\| globalDopplerModule\(\) \|\| await importDopplerModule\(options\);/);
  assert.doesNotMatch(runtime, /DEFAULT_MODULE_URL = '\/doppler\/src\/index-browser\.js'/);
  assert.doesNotMatch(runtime, /http:|https:/);
  assert.match(oldRuntime, /\.\.\/\.\.\/vendor\/doppler\/src\/index-browser\.js/);
  assert.match(html, /simulatte-doppler-intent\.js/);
  assert.match(html, /__DOPPLER_KERNEL_BASE_PATH__/);
});

test('vendored Doppler shader cache resolves kernels beside the loaded module', () => {
  const shaderCache = fs.readFileSync(
    path.join(root, 'public', 'vendor', 'doppler', 'src', 'gpu', 'kernels', 'shader-cache.js'),
    'utf8'
  );

  assert.ok(shaderCache.includes("new URL('.', import.meta.url)"));
  assert.equal(shaderCache.includes("return '/src/gpu/kernels'"), false);
  assert.equal(shaderCache.includes("return '/doppler/src/gpu/kernels'"), false);
});

test('physics loading uses a canvas snake board instead of a card mosaic', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(jsDir, 'simulatte-physics-renderer.js'), 'utf8');

  assert.match(html, /--mosaic-pink/);
  assert.match(html, /--mosaic-lilac/);
  assert.doesNotMatch(html, /intent-runtime-mosaic/);
  assert.match(html, /id="physics-canvas"/);
  assert.match(html, /repeating-linear-gradient/);
  assert.match(html, /@keyframes mosaic-drift/);
  assert.match(html, /@keyframes mosaic-sweep/);
  assert.doesNotMatch(html, /\.intent-runtime\[data-state="active"\] \.intent-runtime-track::after/);
  assert.match(html, /\.primary-action\.is-loading::after/);
  assert.match(renderer, /createCanvasSnakeLoader/);
  assert.match(renderer, /drawCanvasLoadingSnakes/);
  assert.match(renderer, /drawSnakeSignals/);
  assert.match(renderer, /drawRoundedSnakeCell/);
  assert.match(renderer, /splitCanvasSnake/);
  assert.match(renderer, /joinNearbyCanvasSnakes/);
  assert.match(renderer, /nearestSnakeHead/);
  assert.match(renderer, /retireCanvasSnake/);
  assert.match(renderer, /snakeSignals/);
  assert.match(renderer, /deathFade/);
  assert.match(renderer, /deathReason/);
  assert.match(renderer, /snakeDirFromCells/);
  assert.match(renderer, /branchCells = source\.cells\.slice\(splitIndex\)/);
  assert.match(renderer, /while \(activeCount < 4\)/);
  assert.doesNotMatch(renderer, /while \(activeCount < 10\)/);
  assert.doesNotMatch(renderer, /drawSnakeCollisionBursts/);
  assert.doesNotMatch(renderer, /drawCanvasSnakeHeadGlow/);
  assert.doesNotMatch(renderer, /collisionBursts/);
  assert.doesNotMatch(renderer, /particles: kind === 'join'/);
  assert.doesNotMatch(renderer, /secondaryHue/);
  assert.match(renderer, /targetTail/);
  assert.match(renderer, /targetSnakeId/);
  assert.match(renderer, /bitePulse/);
  assert.match(renderer, /joinPulse/);
  assert.match(renderer, /splitPulse/);
  assert.match(renderer, /waitForLoadingPaint/);
  assert.match(renderer, /canvasLoading = loading && event\.canvasLoading === true/);
  assert.match(renderer, /dataset\.loadingVisual = canvasLoading \? 'snake' : loading \? 'simple' : 'idle'/);
  assert.match(renderer, /canvasLoader\.setLoading\(canvasLoading, percent, stage\)/);
  assert.match(renderer, /resolveWithEmbedding\(prompt, params, serial, false\)/);
  assert.match(renderer, /resolveWithEmbedding\(initialPrompt, initialParams, buildSerial, true\)/);
  assert.match(renderer, /runButton\.classList\.toggle\('is-loading', loading\)/);
  assert.match(renderer, /runButton\.disabled = loading/);
  assert.match(renderer, /runButton\.setAttribute\('aria-disabled'/);
  assert.match(renderer, /runButton\.setAttribute\('aria-busy'/);
});

test('composition renderer has specific painters for diverse scene regimes', () => {
  const renderer = fs.readFileSync(path.join(jsDir, 'simulatte-physics-renderer.js'), 'utf8');
  const graph = fs.readFileSync(path.join(jsDir, 'simulatte-composition-graph.js'), 'utf8');

  for (const token of [
    'paintFerrofluidWorld',
    'drawFerrofluidSpikes',
    'paintThinFilmWorld',
    'drawInterferenceFilm',
    'paintGranularWorld',
    'drawGranularSieve',
    'paintThermalPlumeWorld',
    'drawThermalPlumeColumn',
    'paintMechanicalWorld',
    'drawMechanicalImpulseField',
    'paintLiteralCompositeWorld',
    'drawCompositeStressField',
    'drawLiteralRocket',
    'drawLiteralSubmarine',
    'drawLiteralVolcano',
    'drawLiteralLavaFlow',
    'drawLiteralInstrument',
    'drawLiteralCastle',
    'drawLiteralTower',
    'drawLiteralTurbine',
    'drawLiteralStorm',
    'drawLiteralPlantCluster',
    'visiblePlanObjectIds',
  ]) {
    assert.match(renderer, new RegExp(token));
  }
  for (const sceneKind of ['ferrofluid', 'thin-film', 'granular', 'thermal-plume']) {
    assert.match(graph, new RegExp(`sceneKind === '${sceneKind}'`));
  }
  for (const pass of ['coil-field', 'film-frame', 'bead-stream', 'cooling-fins']) {
    assert.match(graph, new RegExp(pass));
  }
  assert.match(graph, /simulatte\.visualGenome\.v1/);
  assert.match(graph, /simulatte\.promptVisualDna\.v1/);
  assert.match(graph, /simulatte\.semanticVisualPlan\.v1/);
  assert.match(graph, /function visualGenomeForComposition/);
  assert.match(graph, /function promptDnaForGenome/);
  assert.match(graph, /function semanticVisualsForGenome/);
  assert.match(graph, /deterministic-prompt-seeded/);
});

test('physics graph updates log intent and composition debug data by default', () => {
  const renderer = fs.readFileSync(path.join(jsDir, 'simulatte-physics-renderer.js'), 'utf8');

  assert.match(renderer, /logGraphDebug\(spec\)/);
  assert.match(renderer, /function logGraphDebug/);
  assert.match(renderer, /console\.groupCollapsed/);
  assert.match(renderer, /\[simulatte\.graph\]/);
  assert.match(renderer, /console\.log\('intent'/);
  assert.match(renderer, /console\.log\('compositionGraph'/);
  assert.match(renderer, /console\.log\('renderProgram'/);
  assert.match(renderer, /console\.log\('receipt'/);
  assert.match(renderer, /console\.table/);
});

test('intent runtime keeps visible errors short, logs diagnostics, and falls back locally', () => {
  const renderer = fs.readFileSync(path.join(jsDir, 'simulatte-physics-renderer.js'), 'utf8');

  assert.match(renderer, /compactIntentRuntimeMessage/);
  assert.match(renderer, /Runtime dtype mismatch/);
  assert.match(renderer, /embedModel\(Id\|Hash\) mismatch/);
  assert.match(renderer, /Intent model unavailable/);
  assert.match(renderer, /console\.error\('\[simulatte\.intent\] model-backed intent failed'/);
  assert.match(renderer, /function resolveWithoutEmbedding/);
  assert.match(renderer, /Local graph ready/);
  assert.match(renderer, /using local graph fallback/);
  assert.match(renderer, /allowPrototypeFallback: true/);
  assert.match(renderer, /elements\.node\.dataset\.detail = String\(message/);
  assert.match(renderer, /elements\.node\.title = String\(message/);
  assert.doesNotMatch(renderer, /elements\.node\.title = String\(rawMessage/);
});

test('composition shape inference does not classify catalog provenance as cats', () => {
  const graph = fs.readFileSync(path.join(jsDir, 'simulatte-composition-graph.js'), 'utf8');

  assert.ok(graph.includes('/\\b(mouse|gerbil|hamster|dog|cat|animal|organism)\\b/'));
  assert.doesNotMatch(graph, /\/mouse\|gerbil\|hamster\|dog\|cat\|animal\|organism\//);
});

test('Firebase hosting revalidates app shell and app JavaScript', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  const headers = config.hosting.headers;
  const noCacheSources = new Set(headers
    .filter((entry) => entry.headers.some((header) => (
      header.key === 'Cache-Control' && header.value === 'no-cache'
    )))
    .map((entry) => entry.source));

  assert.ok(noCacheSources.has('/'));
  assert.ok(noCacheSources.has('/index.html'));
  assert.ok(noCacheSources.has('/js/**'));
  assert.ok(noCacheSources.has('/simulatte-model-cache-sw.js'));
  assert.ok(noCacheSources.has('/vendor/doppler/**'));
});

test('model-backed intent retrieval uses a 1024d Qwen index', () => {
  const manifestPath = path.join(root, 'public', 'models', 'simulatte-embedder', 'manifest.json');
  const indexPath = path.join(root, 'public', 'models', 'simulatte-embedder', 'primitive-index-v2.json');
  const cardIndexPath = path.join(root, 'public', 'models', 'simulatte-embedder', 'surface-card-index-qwen-v1.json');
  const retiredCardIndexPath = path.join(root, 'public', 'models', 'simulatte-embedder', 'surface-card-index-v1.json');
  const retiredIndexPath = path.join(root, 'public', 'models', 'simulatte-embedder', 'primitive-index-v1.json');
  const retiredEncoderPath = path.join(root, 'public', 'models', 'simulatte-intent-embed-v1.json');
  const universeManifestPath = path.join(root, 'public', 'models', 'simulatte-universe', 'manifest.json');
  const runtime = fs.readFileSync(path.join(jsDir, 'simulatte-intent-embedder.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const cardIndex = JSON.parse(fs.readFileSync(cardIndexPath, 'utf8'));
  const universeManifest = JSON.parse(fs.readFileSync(universeManifestPath, 'utf8'));
  const packedBytes = Buffer.from(index.embeddingsPackedBase64, 'base64');
  const cardPackedBytes = Buffer.from(cardIndex.embeddingsPackedBase64, 'base64');

  assert.equal(manifest.schema, 'simulatte.modelBackedEmbedderManifest.v2');
  assert.equal(manifest.id, 'simulatte-qwen-3-5-0-8b-primitive-retrieval-v1');
  assert.equal(manifest.retrieval.kind, 'precomputed-primitive-index');
  assert.equal(manifest.retrieval.artifact, './primitive-index-v2.json');
  assert.equal(manifest.retrieval.dimensions, 1024);
  assert.equal(manifest.retrieval.rerank, 'mandatory');
  assert.equal(manifest.retrieval.cards.kind, 'precomputed-surface-card-index');
  assert.equal(manifest.retrieval.cards.artifact, './surface-card-index-qwen-v1.json');
  assert.equal(manifest.retrieval.cards.dimensions, 1024);
  assert.equal(manifest.retrieval.cards.rerank, 'mandatory');
  assert.equal(manifest.retrieval.universe.artifact, '../simulatte-universe/manifest.json');
  assert.equal(manifest.retrieval.universe.dimensions, 1024);
  assert.equal(manifest.embedModel.id, 'qwen-3-5-0-8b-q4k-ehaf16');
  assert.equal(manifest.embedModel.family, 'qwen3.5');
  assert.equal(manifest.embedModel.modelType, 'transformer');
  assert.equal(manifest.embedModel.dimensions, 1024);
  assert.match(manifest.embedModel.defaultModelBaseUrl, /^https:\/\/huggingface\.co\/Clocksmith\/rdrr\/resolve\//);
  assert.match(manifest.embedModel.defaultModelBaseUrl, /a6118fb24a8e6c4fe7527f1a3dc7b406e0a3ef10\/models\/qwen-3-5-0-8b-q4k-ehaf16$/);
  assert.doesNotMatch(manifest.embedModel.defaultModelBaseUrl, /models\/local/);
  assert.doesNotMatch(manifest.embedModel.defaultModelBaseUrl, /gemma/i);
  assert.equal(manifest.embedModel.source.kind, 'huggingface-rdrr');
  assert.equal(manifest.embedModel.source.sourceCheckpointId, 'Qwen/Qwen3.5-0.8B');
  assert.equal(manifest.runtime.moduleUrl, './vendor/doppler/src/index-browser.js');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.activationDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.mathDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.accumDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.outputDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.kvcache.kvDtype, 'f16');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.kvcache.layout, 'contiguous');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.kvcache.tiering.mode, 'off');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.kvcache.tiering.coldDtype, 'f16');
  assert.equal(manifest.cache.namespace, 'simulatte-qwen-3-5-0-8b-primitive-retrieval-v1');
  assert.equal(manifest.cache.prefetch, false);
  assert.equal(manifest.cache.worker, './simulatte-model-cache-sw.js');
  assert.equal(manifest.cache.requirePersistent, false);
  assert.equal(manifest.embedModel.manifestHash.hex, index.embedModelHash.hex);
  assert.equal(manifest.embedModel.manifestHash.hex, cardIndex.embedModelHash.hex);
  assert.equal(manifest.embedModel.manifestHash.hex, '595cb5f90e81d57470d86a94740c99a10f11204df8e85a8e4210bef77161a713');
  assert.equal(index.schema, 'simulatte.primitiveEmbeddingIndex.v2');
  assert.equal(index.id, 'simulatte-primitive-qwen-3-5-0-8b-index-v1');
  assert.equal(index.embedModelId, 'qwen-3-5-0-8b-q4k-ehaf16');
  assert.equal(index.embeddingDim, 1024);
  assert.equal(catalog.PHYSICAL_PRIMITIVES.length, 420);
  assert.equal(index.documents.length, catalog.PHYSICAL_PRIMITIVES.length);
  assert.equal(index.documentCount, catalog.PHYSICAL_PRIMITIVES.length);
  assert.equal(packedBytes.byteLength, index.documents.length * index.embeddingDim * 4);
  assert.equal(cardIndex.schema, 'simulatte.surfaceCardEmbeddingIndex.v1');
  assert.equal(cardIndex.id, 'simulatte-surface-card-qwen-3-5-0-8b-index-v1');
  assert.equal(cardIndex.embedModelId, 'qwen-3-5-0-8b-q4k-ehaf16');
  assert.equal(cardIndex.embeddingDim, 1024);
  assert.ok(cardIndex.documents.length >= 650);
  assert.equal(cardPackedBytes.byteLength, cardIndex.documents.length * cardIndex.embeddingDim * 4);
  assert.equal(universeManifest.embedModel.id, manifest.embedModel.id);
  assert.equal(universeManifest.embedModel.dimensions, manifest.embedModel.dimensions);
  assert.equal(universeManifest.embedModel.manifestHash.hex, manifest.embedModel.manifestHash.hex);
  assert.equal(Object.hasOwn(manifest, 'fallback'), false);
  assert.equal(fs.existsSync(retiredCardIndexPath), false);
  assert.equal(fs.existsSync(retiredIndexPath), false);
  assert.equal(fs.existsSync(retiredEncoderPath), false);
  assert.match(runtime, /navigator\.gpu/);
  assert.match(runtime, /runtimeConfig/);
  assert.match(runtime, /manifestUrl/);
  assert.match(runtime, /DEFAULT_DOPPLER_KERNEL_BASE_PATH = '\.\/vendor\/doppler\/src\/gpu\/kernels'/);
  assert.match(runtime, /dopplerKernelBasePath/);
  assert.match(runtime, /ensureDopplerKernelBasePath/);
  assert.match(runtime, /ensureDopplerKernelBasePath\(options\.kernelBasePath\);\n    const direct = options\.dopplerModule \|\| globalDopplerApi\(\);/);
  assert.match(runtime, /model-backed intent requires Doppler load/);
  assert.match(runtime, /primitive embedding index/);
  assert.match(runtime, /surface card embedding index/);
  assert.match(runtime, /rankSurfaceCards/);
  assert.match(runtime, /cardMatches/);
  assert.match(runtime, /ensureModelArtifactCache/);
  assert.match(runtime, /waitForCacheWorkerReady/);
  assert.match(runtime, /Promise\.race\(\[\n\s+navigator\.serviceWorker\.ready,/);
  assert.match(runtime, /intent model cache worker did not become ready/);
  assert.match(runtime, /model-backed intent manifest missing Doppler runtimeConfig/);
  assert.doesNotMatch(runtime, /EMBEDDINGGEMMA_RUNTIME_CONFIG/);
  assert.match(runtime, /simulatte-model-cache/);
  assert.match(runtime, /resolveUrl\(rawModuleUrl, location\.href\)/);
  assert.match(runtime, /embedModelHash mismatch/);
  assert.match(runtime, /simulatte\.intentRerank\.v1/);
  assert.doesNotMatch(runtime, /DEFAULT_EMBED_MODEL_ID|google-embeddinggemma-300m-q4k-ehf16-af32|EmbeddingGemma/);
  assert.doesNotMatch(runtime, /axis-token-query-encoder/);
  assert.doesNotMatch(runtime, /simulatte-intent-embed-v1/);
  assert.doesNotMatch(runtime, /candidates\.map\(\(primitive\) => embedText\(model, primitiveText/);
  assert.match(runtime, /GPUBufferUsage\.STORAGE/);

  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'public', 'simulatte-model-cache-sw.js'), 'utf8');
  assert.match(html, /id="intent-runtime"/);
  assert.match(html, /intent-runtime-fill/);
  assert.match(worker, /CACHE_PREFIX = 'simulatte-embedding-model-'/);
  assert.match(worker, /Content-Range/);
});

test('product path removed the parallel world planner and legacy compiler export', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const model = require('../public/js/simulatte-physics-model.js');

  assert.doesNotMatch(html, /simulatte-world-plan\.js/);
  assert.equal(Object.hasOwn(model, 'createLegacySpecFromPrompt'), false);
});
