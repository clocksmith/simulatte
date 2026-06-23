const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const jsDir = path.join(root, 'public', 'js');

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
  assert.doesNotMatch(renderer, /drawPrismaticParticleField/);
  assert.doesNotMatch(renderer, /function draw[A-Z][A-Za-z]+Shape/);
  assert.doesNotMatch(renderer, /drawFieldSplat/);
  assert.doesNotMatch(renderer, /\.fillText\(/);
  assert.doesNotMatch(renderer, /setLineDash/);
  assert.match(field, /const INSTANCE_STRIDE = 8/);
  assert.match(field, /function materialVisualClass/);
  assert.match(field, /@location\(6\) stretch/);
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
  assert.doesNotMatch(runtime, /DEFAULT_MODULE_URL = '\/doppler\/src\/index-browser\.js'/);
  assert.doesNotMatch(runtime, /http:|https:/);
  assert.match(oldRuntime, /\.\.\/\.\.\/vendor\/doppler\/src\/index-browser\.js/);
  assert.match(html, /simulatte-doppler-intent\.js/);
  assert.match(html, /__DOPPLER_KERNEL_BASE_PATH__/);
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
  assert.match(renderer, /splitCanvasSnake/);
  assert.match(renderer, /joinNearbyCanvasSnakes/);
  assert.match(renderer, /targetTail/);
  assert.match(renderer, /bitePulse/);
  assert.match(renderer, /canvasLoader\.setLoading\(loading, percent, stage\)/);
  assert.match(renderer, /runButton\.classList\.toggle\('is-loading', loading\)/);
  assert.match(renderer, /runButton\.setAttribute\('aria-busy'/);
});

test('intent runtime keeps visible errors short and logs diagnostics', () => {
  const renderer = fs.readFileSync(path.join(jsDir, 'simulatte-physics-renderer.js'), 'utf8');

  assert.match(renderer, /compactIntentRuntimeMessage/);
  assert.match(renderer, /Runtime dtype mismatch/);
  assert.match(renderer, /embedModel\(Id\|Hash\) mismatch/);
  assert.match(renderer, /Intent model unavailable/);
  assert.match(renderer, /console\.error\('\[simulatte\.intent\] model-backed intent failed'/);
  assert.match(renderer, /elements\.node\.dataset\.detail = String\(message/);
  assert.match(renderer, /elements\.node\.title = String\(message/);
  assert.doesNotMatch(renderer, /elements\.node\.title = String\(rawMessage/);
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
});

test('model-backed intent retrieval uses a 768d EmbeddingGemma index', () => {
  const manifestPath = path.join(root, 'public', 'models', 'simulatte-embedder', 'manifest.json');
  const indexPath = path.join(root, 'public', 'models', 'simulatte-embedder', 'primitive-index-v2.json');
  const cardIndexPath = path.join(root, 'public', 'models', 'simulatte-embedder', 'surface-card-index-v1.json');
  const retiredIndexPath = path.join(root, 'public', 'models', 'simulatte-embedder', 'primitive-index-v1.json');
  const retiredEncoderPath = path.join(root, 'public', 'models', 'simulatte-intent-embed-v1.json');
  const runtime = fs.readFileSync(path.join(jsDir, 'simulatte-intent-embedder.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const cardIndex = JSON.parse(fs.readFileSync(cardIndexPath, 'utf8'));
  const packedBytes = Buffer.from(index.embeddingsPackedBase64, 'base64');
  const cardPackedBytes = Buffer.from(cardIndex.embeddingsPackedBase64, 'base64');

  assert.equal(manifest.schema, 'simulatte.modelBackedEmbedderManifest.v2');
  assert.equal(manifest.retrieval.kind, 'precomputed-primitive-index');
  assert.equal(manifest.retrieval.artifact, './primitive-index-v2.json');
  assert.equal(manifest.retrieval.dimensions, 768);
  assert.equal(manifest.retrieval.rerank, 'mandatory');
  assert.equal(manifest.retrieval.cards.kind, 'precomputed-surface-card-index');
  assert.equal(manifest.retrieval.cards.artifact, './surface-card-index-v1.json');
  assert.equal(manifest.retrieval.cards.dimensions, 768);
  assert.equal(manifest.retrieval.cards.rerank, 'mandatory');
  assert.equal(manifest.embedModel.id, 'google-embeddinggemma-300m-q4k-ehf16-af32');
  assert.match(manifest.embedModel.defaultModelBaseUrl, /^https:\/\/huggingface\.co\/Clocksmith\/rdrr\/resolve\//);
  assert.doesNotMatch(manifest.embedModel.defaultModelBaseUrl, /models\/local/);
  assert.equal(manifest.embedModel.source.kind, 'huggingface-rdrr');
  assert.equal(manifest.runtime.moduleUrl, './vendor/doppler/src/index-browser.js');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.activationDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.mathDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.accumDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.outputDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.kvcache.kvDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.kvcache.layout, 'contiguous');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.kvcache.tiering.mode, 'off');
  assert.equal(manifest.cache.prefetch, true);
  assert.equal(manifest.cache.worker, './simulatte-model-cache-sw.js');
  assert.equal(manifest.cache.requirePersistent, true);
  assert.equal(manifest.embedModel.manifestHash.hex, index.embedModelHash.hex);
  assert.equal(manifest.embedModel.manifestHash.hex, cardIndex.embedModelHash.hex);
  assert.equal(index.schema, 'simulatte.primitiveEmbeddingIndex.v2');
  assert.equal(index.embedModelId, 'google-embeddinggemma-300m-q4k-ehf16-af32');
  assert.equal(index.embeddingDim, 768);
  assert.ok(index.documents.length >= 320);
  assert.equal(packedBytes.byteLength, index.documents.length * index.embeddingDim * 4);
  assert.equal(cardIndex.schema, 'simulatte.surfaceCardEmbeddingIndex.v1');
  assert.equal(cardIndex.embedModelId, 'google-embeddinggemma-300m-q4k-ehf16-af32');
  assert.equal(cardIndex.embeddingDim, 768);
  assert.ok(cardIndex.documents.length >= 650);
  assert.ok(cardIndex.documents.some((doc) => doc.cardId === 'hamster_wheel'));
  assert.equal(cardPackedBytes.byteLength, cardIndex.documents.length * cardIndex.embeddingDim * 4);
  assert.equal(Object.hasOwn(manifest, 'fallback'), false);
  assert.equal(fs.existsSync(retiredIndexPath), false);
  assert.equal(fs.existsSync(retiredEncoderPath), false);
  assert.match(runtime, /navigator\.gpu/);
  assert.match(runtime, /runtimeConfig/);
  assert.match(runtime, /manifestUrl/);
  assert.match(runtime, /DEFAULT_DOPPLER_KERNEL_BASE_PATH = '\.\/vendor\/doppler\/src\/gpu\/kernels'/);
  assert.match(runtime, /dopplerKernelBasePath/);
  assert.match(runtime, /ensureDopplerKernelBasePath/);
  assert.match(runtime, /model-backed intent requires Doppler load/);
  assert.match(runtime, /primitive embedding index/);
  assert.match(runtime, /surface card embedding index/);
  assert.match(runtime, /rankSurfaceCards/);
  assert.match(runtime, /cardMatches/);
  assert.match(runtime, /ensureModelArtifactCache/);
  assert.match(runtime, /model-backed intent manifest missing Doppler runtimeConfig/);
  assert.doesNotMatch(runtime, /EMBEDDINGGEMMA_RUNTIME_CONFIG/);
  assert.match(runtime, /simulatte-model-cache/);
  assert.match(runtime, /resolveUrl\(rawModuleUrl, location\.href\)/);
  assert.match(runtime, /embedModelHash mismatch/);
  assert.match(runtime, /simulatte\.intentRerank\.v1/);
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
