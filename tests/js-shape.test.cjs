const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const jsDir = path.join(root, 'public', 'js');
const catalog = require(path.join(jsDir, 'simulatte-physics-catalog.js'));
const visualOperatorAtlas = require(path.join(jsDir, 'simulatte-visual-operator-atlas.js'));
const visualOperatorCompiler = require(path.join(jsDir, 'simulatte-visual-operator-compiler.js'));

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
    'simulatte-intent-brief-schema.js',
    'simulatte-structured-intent-model.js',
    'simulatte-causal-physics-graph.js',
    'simulatte-assumption-ledger.js',
    'simulatte-causal-visual-affordances.js',
    'simulatte-visual-operator-atlas.js',
    'simulatte-visual-operator-compiler.js',
    'simulatte-language-evidence.js',
    'simulatte-activation-cloud.js',
    'simulatte-grounded-interpretation.js',
    'simulatte-intent-forensics.js',
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

test('intent forensics modules load before the physics model in the browser shell', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const scriptNames = Array.from(html.matchAll(/<script defer src="\.\/js\/([^"]+)"><\/script>/g))
    .map((match) => match[1]);
  const position = (name) => scriptNames.indexOf(name);

  for (const name of [
    'simulatte-intent-brief-schema.js',
    'simulatte-structured-intent-model.js',
    'simulatte-causal-physics-graph.js',
    'simulatte-assumption-ledger.js',
    'simulatte-causal-visual-affordances.js',
    'simulatte-intent-forensics.js',
  ]) {
    assert.notEqual(position(name), -1, `${name} should be loaded by index.html`);
    assert.ok(position(name) < position('simulatte-physics-model.js'), `${name} should load before model`);
  }
  assert.ok(
    position('simulatte-causal-visual-affordances.js') < position('simulatte-intent-forensics.js'),
    'causal visual affordances should load before intent forensics'
  );
  assert.ok(
    position('simulatte-language-evidence.js') < position('simulatte-intent-forensics.js'),
    'language evidence should load before intent forensics'
  );
  assert.ok(
    position('simulatte-activation-cloud.js') < position('simulatte-intent-forensics.js'),
    'activation cloud should load before intent forensics'
  );
  assert.ok(
    position('simulatte-grounded-interpretation.js') < position('simulatte-intent-forensics.js'),
    'grounded interpretation should load before intent forensics'
  );
  assert.ok(
    position('simulatte-visual-operator-atlas.js') < position('simulatte-composition-graph.js'),
    'visual operator atlas should load before composition graph'
  );
  assert.ok(
    position('simulatte-visual-operator-atlas.js') < position('simulatte-visual-operator-compiler.js'),
    'visual operator atlas should load before visual operator compiler'
  );
  assert.ok(
    position('simulatte-visual-operator-compiler.js') < position('simulatte-composition-graph.js'),
    'visual operator compiler should load before composition graph'
  );
});

test('causal affordances compile into first-class VisualIR rows', () => {
  const composition = fs.readFileSync(
    path.join(jsDir, 'simulatte-composition-graph.js'),
    'utf8'
  );
  const model = fs.readFileSync(
    path.join(jsDir, 'simulatte-physics-model.js'),
    'utf8'
  );

  assert.match(composition, /function visualGeometryForCausalAffordances/);
  assert.match(composition, /visualMotionForProcesses\(processRows, visualGenome, sceneKind, causalAffordances\)/);
  assert.match(composition, /function visualGraphicsAtomsForIR/);
  assert.match(composition, /function visualGeometryForGraphicsAtoms/);
  assert.match(composition, /visualOperatorCompiler\.compileVisualGraphicsAtoms/);
  assert.match(composition, /visual-operator-atlas/);
  assert.match(composition, /receipt:graphics-atoms/);
  assert.match(composition, /causal-affordance-program/);
  assert.match(composition, /receipt:causal-affordances/);
  assert.match(model, /causalAffordanceCount: intentBriefLedger\.causalAffordanceCount/);
});

test('visual operator atlas exposes reusable graphics atoms for Layer 7', () => {
  const atlasPath = path.join(root, 'public', 'models', 'simulatte-visual-cards', 'visual-operator-atlas-v1.json');
  const atlasJson = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));

  assert.equal(visualOperatorAtlas.VISUAL_OPERATOR_ATLAS_SCHEMA, 'simulatte.visualOperatorAtlas.v1');
  assert.equal(visualOperatorCompiler.VISUAL_OPERATOR_COMPILER_SCHEMA, 'simulatte.visualOperatorCompiler.v1');
  assert.equal(atlasJson.schema, 'simulatte.visualOperatorAtlas.v1');
  assert.equal(atlasJson.compilerSchema, 'simulatte.visualOperatorCompiler.v1');
  assert.equal(atlasJson.uniformSchema, 'simulatte.graphicsAtomUniforms.v1');
  assert.equal(atlasJson.id, 'simulatte-visual-operator-atlas-v1');
  assert.equal(atlasJson.mappings.length, visualOperatorAtlas.VISUAL_OPERATOR_MAPPINGS.length);
  assert.ok(visualOperatorAtlas.VISUAL_OPERATOR_MAPPINGS.length >= 17);
  assert.equal(visualOperatorAtlas.VISUAL_ATOM_UNIFORM_SLOTS.length, 24);
  assert.equal(visualOperatorCompiler.VISUAL_ATOM_UNIFORM_SLOTS.length, 24);
  assert.ok(visualOperatorAtlas.VISUAL_OPERATOR_MAPPINGS.every((row) => row.requires.length >= 1));
  assert.ok(visualOperatorAtlas.VISUAL_OPERATOR_MAPPINGS.every((row) => row.minimumScore > 0));
  assert.ok(visualOperatorAtlas.VISUAL_OPERATOR_MAPPINGS.every((row) => row.priority > 0));
  assert.ok(visualOperatorAtlas.VISUAL_OPERATOR_MAPPINGS.every((row) => row.uniformSlots.length >= 2));
  assert.ok(visualOperatorAtlas.VISUAL_OPERATOR_MAPPINGS.every((row) => row.wgslOperators.length >= 1));
  assert.ok(atlasJson.mappings.every((row) => Array.isArray(row.requires) && row.requires.length >= 1));
  assert.ok(atlasJson.mappings.every((row) => Array.isArray(row.excludes)));
  assert.ok(atlasJson.mappings.every((row) => Number(row.minimumScore) > 0));
  assert.ok(atlasJson.mappings.every((row) => Number(row.priority) > 0));
  assert.ok(atlasJson.mappings.every((row) => row.uniformSlots.length >= 2));
  assert.ok(atlasJson.mappings.every((row) => row.wgslOperators.length >= 1));
  assert.ok(atlasJson.mappings.some((row) => row.id === 'visual.operator.heat-transfer.v1'));
  assert.ok(atlasJson.mappings.some((row) => row.id === 'visual.operator.fluid-advection.v1'));
  assert.ok(atlasJson.mappings.some((row) => row.id === 'visual.operator.control-feedback.v1'));
  assert.ok(atlasJson.mappings.some((row) => row.id === 'visual.operator.network-flow.v1'));
  assert.ok(atlasJson.mappings.some((row) => row.id === 'visual.operator.quantum-phase-readout.v1'));

  const plan = visualOperatorCompiler.compileVisualGraphicsAtoms({
    sceneKind: 'thermal-plume',
    solverPlan: { executableSteps: ['heat_transfer', 'advection'] },
    objects: [{ source: 'prompt-explicit', phrase: 'coolant airflow', role: 'coolant loop' }],
    fields: [{ kind: 'thermal' }, { kind: 'flow', channel: 'coolant' }],
    causalAffordances: [{ id: 'affordance.test', geometry: 'steam plume with coolant flow' }],
  });

  assert.equal(plan.schema, 'simulatte.graphicsAtomPlan.v1');
  assert.equal(plan.compiler, 'simulatte.visualOperatorCompiler.v1');
  assert.ok(plan.mappings.some((row) => row.id === 'visual.operator.heat-transfer.v1'));
  assert.ok(plan.mappings.some((row) => row.id === 'visual.operator.fluid-advection.v1'));
  assert.ok(plan.geometry.some((row) => row.id === 'volume-vapor-plume'));
  assert.ok(plan.fields.some((row) => row.id === 'velocity-vector-field'));
  assert.ok(plan.materials.some((row) => row.id === 'emissive-hot'));
  assert.ok(plan.motion.some((row) => row.id === 'stream-ribbons'));
  assert.equal(plan.uniforms.schema, 'simulatte.graphicsAtomUniforms.v1');
  assert.equal(plan.uniforms.values.length, 24);
  assert.ok(plan.uniforms.bySlot.thermal > 0);
  assert.ok(plan.uniforms.bySlot.fluid > 0);
  assert.ok(plan.wgslOperators.includes('atomThermalPlume'));
  assert.ok(plan.wgslOperators.includes('atomFluidRibbons'));
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
  assert.match(renderer, /function drawVisualFingerprintTexture/);
  assert.match(renderer, /function drawVisualDnaMark/);
  assert.match(renderer, /function drawSemanticWorldLayers/);
  assert.match(renderer, /function drawSemanticArchetype/);
  assert.match(renderer, /function drawSemanticMaterialShader/);
  assert.match(renderer, /function drawSemanticProcessOverlay/);
  assert.match(renderer, /function drawVisualIRProgram/);
  assert.match(renderer, /function drawVisualIRCameraField/);
  assert.match(renderer, /function drawVisualIRMaterialPass/);
  assert.match(renderer, /function drawVisualIRFieldPass/);
  assert.match(renderer, /function drawVisualIRGeometryPass/);
  assert.match(renderer, /function drawVisualIRProcessPass/);
  assert.match(renderer, /function drawVisualIRReceiptMarks/);
  assert.match(renderer, /function drawVisualIRParticleMaterial/);
  assert.match(renderer, /function drawVisualIRNetworkField/);
  assert.match(renderer, /function drawVisualIRInstrument/);
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
  assert.match(html, /simulatte-webgpu-renderer\.js/);
  assert.doesNotMatch(html, /simulatte-cinematic-renderer\.js/);
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
  assert.match(renderer, /while \(activeCount < 1\)/);
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
  assert.match(renderer, /webGpuRenderer\.setLoading\(canvasLoading, percent, stage\)/);
  assert.match(renderer, /SimulatteWebGpuRenderer\.create\(canvas/);
  assert.match(renderer, /const ctx = null/);
  assert.doesNotMatch(renderer, /canvas\.getContext\('2d'\)/);
  assert.match(renderer, /fieldCanvas\.dataset\.renderer = webGpuRenderer \? 'primary-webgpu-owned' : 'webgpu-required'/);
  assert.doesNotMatch(renderer, /requireWebGpu: Boolean\(webGpuRenderer\)/);
  const webgpuRenderer = fs.readFileSync(
    path.join(jsDir, 'simulatte-webgpu-renderer.js'),
    'utf8'
  );
  assert.match(webgpuRenderer, /new Float32Array\(104\)/);
  assert.match(webgpuRenderer, /this\.atomUniforms = graphicsAtomUniformVector\(spec\)/);
  assert.match(webgpuRenderer, /loadingWrapDistance/);
  assert.match(webgpuRenderer, /loadingSnakeMask/);
  assert.match(webgpuRenderer, /snakeA = loadingSnakeMask/);
  assert.match(webgpuRenderer, /snakeB = loadingSnakeMask/);
  assert.match(webgpuRenderer, /snakeC = loadingSnakeMask/);
  assert.match(webgpuRenderer, /snakeD = loadingSnakeMask/);
  assert.match(webgpuRenderer, /snakeHeads/);
  assert.match(webgpuRenderer, /crossingGlow/);
  assert.match(webgpuRenderer, /function visualTextFromSpec/);
  const visualTextBody = webgpuRenderer.match(/function visualTextFromSpec\(spec\) \{[\s\S]*?\n  \}/);
  assert.ok(visualTextBody, 'webgpu renderer should expose visualTextFromSpec');
  assert.doesNotMatch(visualTextBody[0], /renderProgram\.intentText/);
  assert.doesNotMatch(visualTextBody[0], /renderProgram\.prompt/);
  assert.doesNotMatch(visualTextBody[0], /rendererPlan\.intentText/);
  assert.doesNotMatch(visualTextBody[0], /renderIR\.prompt/);
  assert.match(webgpuRenderer, /function isCompiledSpecificScene/);
  assert.match(webgpuRenderer, /if \(isCompiledSpecificScene\(sceneKind\)\) return sceneKind;/);
  assert.match(webgpuRenderer, /function graphicsAtomTextRows/);
  assert.match(webgpuRenderer, /function graphicsAtomFeatureVector/);
  assert.match(webgpuRenderer, /function graphicsAtomUniformVector/);
  assert.match(webgpuRenderer, /function compressAtomUniformVector/);
  assert.match(webgpuRenderer, /dominantAtomSlot/);
  assert.match(webgpuRenderer, /mergeFeatureVectors\(featureVector\(text\), graphicsAtomFeatureVector\(spec\)\)/);
  assert.match(webgpuRenderer, /atomAt\(index: i32\)/);
  assert.match(webgpuRenderer, /atomStructuralScene/);
  assert.match(webgpuRenderer, /capsuleLine/);
  assert.match(webgpuRenderer, /rectMask/);
  assert.match(webgpuRenderer, /atomOperatorOverlays/);
  assert.match(webgpuRenderer, /atomThermalPlume/);
  assert.match(webgpuRenderer, /atomFluidRibbons/);
  assert.match(webgpuRenderer, /atomQuantumFringes/);
  assert.match(webgpuRenderer, /color = atomStructuralScene\(p, t, color\)/);
  assert.match(webgpuRenderer, /color = atomOperatorOverlays\(p, t, color\)/);
  assert.match(webgpuRenderer, /renderIR\.causalAffordances/);
  assert.match(webgpuRenderer, /visualIR\.causalAffordances/);
  assert.match(webgpuRenderer, /visualIR\.graphicsAtoms/);
  assert.match(renderer, /resolveWithEmbedding\(prompt, params, serial, false\)/);
  assert.match(renderer, /resolveWithEmbedding\(initialPrompt, initialParams, buildSerial, true\)/);
  assert.match(renderer, /runButton\.classList\.toggle\('is-loading', loading\)/);
  assert.match(renderer, /runButton\.disabled = loading/);
  assert.match(renderer, /runButton\.setAttribute\('aria-disabled'/);
  assert.match(renderer, /runButton\.setAttribute\('aria-busy'/);
  assert.match(renderer, /const rawMessage = event\.detail \|\| event\.message \|\| stage/);
  assert.match(renderer, /runtimeDetailText\(event, stage, rawMessage\)/);
});

test('collapsed prompt dock parks bottom left as translucent glass', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

  assert.match(html, /\.prompt-dock\[data-collapsed="true"\] \{/);
  assert.match(html, /left: 16px !important;/);
  assert.match(html, /bottom: 16px !important;/);
  assert.match(html, /top: auto !important;/);
  assert.match(html, /right: auto !important;/);
  assert.match(html, /transform: none !important;/);
  assert.match(html, /rgba\(255, 255, 255, 0\.38\)/);
  assert.match(html, /opacity: 0\.88;/);
  assert.match(html, /\.prompt-dock\[data-collapsed="true"\] \.prompt-dock-handle \{\n\s+display: none;/);
  assert.match(html, /const resetDockInlinePlacement = \(\) => \{/);
  assert.match(html, /panel\.dispatchEvent\(new CustomEvent\('prompt-dock:collapsed'/);
  assert.match(html, /const isCollapsed = \(\) => panel\.dataset\.collapsed === 'true'/);
  assert.match(html, /if \(isCollapsed\(\)\) return;/);
});

test('composition renderer has specific painters for diverse scene regimes', () => {
  const renderer = fs.readFileSync(path.join(jsDir, 'simulatte-physics-renderer.js'), 'utf8');
  const graph = fs.readFileSync(path.join(jsDir, 'simulatte-composition-graph.js'), 'utf8');
  const registry = fs.readFileSync(path.join(jsDir, 'simulatte-render-registry.js'), 'utf8');

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
    'paintExpandedSceneWorld',
    'drawExpandedInstrumentScene',
    'drawExpandedOrbitalScene',
    'drawExpandedNetworkScene',
    'drawExpandedMolecularScene',
    'drawExpandedTerrainScene',
    'drawExpandedLabScene',
    'drawExpandedWeatherScene',
    'drawExpandedOceanCryosphereScene',
    'drawExpandedGridEnergyScene',
    'drawExpandedRoboticsScene',
    'drawExpandedManufacturingScene',
    'drawExpandedQuantumScene',
    'drawExpandedAgroWasteScene',
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
  assert.match(renderer, /isExpandedSceneKind\(sceneKind\)/);
  assert.match(renderer, /structural-mechanics/);
  assert.match(registry, /structural-mechanics/);
  for (const sceneKind of [
    'weather-atmosphere',
    'ocean-cryosphere',
    'grid-energy',
    'robotics-control',
    'manufacturing-line',
    'quantum-instrument',
    'agro-waste-loop',
  ]) {
    assert.match(registry, new RegExp(sceneKind));
    assert.match(renderer, new RegExp(sceneKind));
  }
  const webgpuRenderer = fs.readFileSync(
    path.join(jsDir, 'simulatte-webgpu-renderer.js'),
    'utf8'
  );
  for (const sceneKind of [
    'weather-atmosphere',
    'ocean-cryosphere',
    'grid-energy',
    'robotics-control',
    'manufacturing-line',
    'quantum-instrument',
    'agro-waste-loop',
    'sport-motion',
    'cultural-material',
  ]) {
    assert.match(webgpuRenderer, new RegExp(sceneKind));
  }
  for (const sceneGroup of ['16.0', '17.0', '18.0', '19.0', '20.0', '21.0', '22.0']) {
    assert.match(webgpuRenderer, new RegExp(`sceneGroup == ${sceneGroup}`));
  }
  for (const pass of ['coil-field', 'film-frame', 'bead-stream', 'cooling-fins']) {
    assert.match(graph, new RegExp(pass));
  }
  assert.match(graph, /simulatte\.visualGenome\.v1/);
  assert.match(graph, /simulatte\.compiledVisualDna\.v1/);
  assert.match(graph, /simulatte\.semanticVisualPlan\.v1/);
  assert.match(graph, /function visualGenomeForComposition/);
  assert.match(graph, /function compiledDnaForGenome/);
  assert.match(graph, /function semanticVisualsForGenome/);
  assert.match(graph, /deterministic-compiled-artifact-seeded/);
});

test('physics graph updates log intent and composition debug data by default', () => {
  const renderer = fs.readFileSync(path.join(jsDir, 'simulatte-physics-renderer.js'), 'utf8');

  assert.match(renderer, /logGraphDebug\(spec\)/);
  assert.match(renderer, /function logGraphDebug/);
  assert.match(renderer, /console\.groupCollapsed/);
  assert.match(renderer, /\[simulatte\.graph\]/);
  assert.match(renderer, /console\.log\('intentReceipt'/);
  assert.match(renderer, /console\.log\('semanticRetrievalReceipt'/);
  assert.doesNotMatch(renderer, /console\.log\('intent'/);
  assert.match(renderer, /console\.log\('compositionGraph'/);
  assert.match(renderer, /console\.log\('renderProgram'/);
  assert.match(renderer, /console\.log\('receipt'/);
  assert.match(renderer, /console\.table/);
});

test('compiler phases consume only neighboring compiled artifacts after intent grounding', () => {
  const model = fs.readFileSync(path.join(jsDir, 'simulatte-physics-model.js'), 'utf8');
  const physicsIR = fs.readFileSync(path.join(jsDir, 'simulatte-physics-ir.js'), 'utf8');
  const composition = fs.readFileSync(path.join(jsDir, 'simulatte-composition-graph.js'), 'utf8');
  const webgpu = fs.readFileSync(path.join(jsDir, 'simulatte-webgpu-renderer.js'), 'utf8');
  const visualOperatorCompiler = fs.readFileSync(path.join(jsDir, 'simulatte-visual-operator-compiler.js'), 'utf8');
  const physicsIRCall = model.match(/nextIR = buildPhysicsIR\(\{[\s\S]*?\n      \}\);/);
  const directLanguageText = visualOperatorCompiler.match(/function directLanguageText\(context = \{\}\) \{[\s\S]*?\n  \}/);

  assert.ok(physicsIRCall, 'physics model should compile PhysicsIR through a visible call site');
  assert.match(physicsIRCall[0], /buildPhysicsIR\(\{\s*universeGraph,/);
  assert.doesNotMatch(physicsIRCall[0], /prompt,/);
  assert.doesNotMatch(physicsIRCall[0], /promptParse,/);
  assert.match(physicsIR, /const prompt = universeGraph\.prompt \|\| ''/);
  assert.doesNotMatch(physicsIR, /input\.prompt \|\| universeGraph\.prompt/);

  assert.match(composition, /const universeGraph = spec\.universeGraph \|\| \{\}/);
  assert.match(composition, /const conceptGraph = Array\.isArray\(universeGraph\.nodes\)/);
  assert.match(composition, /const brief = spec && spec\.renderIR && spec\.renderIR\.intentBriefReceipt/);
  assert.doesNotMatch(composition, /const intent = spec\.intent/);
  assert.doesNotMatch(composition, /intent\.conceptGraph/);
  assert.doesNotMatch(composition, /spec\.intent\.synthesis/);
  assert.doesNotMatch(composition, /spec\.intent\.prompt/);
  assert.doesNotMatch(composition, /spec\.intent\.intentBrief/);

  assert.doesNotMatch(webgpu, /spec\.intent/);
  assert.doesNotMatch(webgpu, /intent\.semanticRag|intent\.cardMatches|intent\.surfaceCards/);
  assert.ok(directLanguageText, 'visual operator compiler should expose directLanguageText');
  assert.doesNotMatch(directLanguageText[0], /physicsIR\.prompt/);
  assert.doesNotMatch(directLanguageText[0], /renderIR\.prompt/);
  assert.doesNotMatch(directLanguageText[0], /physicalSpec\.prompt/);
  assert.doesNotMatch(model, /spec\.intent && spec\.intent\.resolution/);
  assert.doesNotMatch(model, /spec\.intent && spec\.intent\.prompt/);
  assert.match(model, /function parameterHintTextForIntent/);
  assert.match(model, /applyCompiledParameterHints\(parameterHintTextForIntent\(intent, contract\), params, addControl\)/);
  assert.doesNotMatch(model, /applyPromptParameterHints\(intent\.prompt/);
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

test('model-backed intent retrieval uses a 768d EmbeddingGemma index', () => {
  const manifestPath = path.join(root, 'public', 'models', 'simulatte-embedder', 'manifest.json');
  const indexPath = path.join(root, 'public', 'models', 'simulatte-embedder', 'primitive-index-v2.json');
  const cardIndexPath = path.join(root, 'public', 'models', 'simulatte-embedder', 'surface-card-index-embeddinggemma-v1.json');
  const retiredQwenCardIndexPath = path.join(root, 'public', 'models', 'simulatte-embedder', 'surface-card-index-qwen-v1.json');
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
  assert.equal(manifest.id, 'simulatte-embeddinggemma-300m-primitive-retrieval-v1');
  assert.equal(manifest.retrieval.kind, 'precomputed-primitive-index');
  assert.equal(manifest.retrieval.artifact, './primitive-index-v2.json');
  assert.equal(manifest.retrieval.dimensions, 768);
  assert.equal(manifest.retrieval.rerank, 'mandatory');
  assert.equal(manifest.retrieval.cards.kind, 'precomputed-surface-card-index');
  assert.equal(manifest.retrieval.cards.artifact, './surface-card-index-embeddinggemma-v1.json');
  assert.equal(manifest.retrieval.cards.dimensions, 768);
  assert.equal(manifest.retrieval.cards.rerank, 'mandatory');
  assert.equal(manifest.retrieval.universe.artifact, '../simulatte-universe/manifest.json');
  assert.equal(manifest.retrieval.universe.dimensions, 768);
  assert.equal(manifest.embedModel.id, 'google-embeddinggemma-300m-q4k-ehf16-af32');
  assert.equal(manifest.embedModel.family, 'embeddinggemma');
  assert.equal(manifest.embedModel.modelType, 'embedding');
  assert.equal(manifest.embedModel.dimensions, 768);
  assert.match(manifest.embedModel.defaultModelBaseUrl, /^https:\/\/huggingface\.co\/Clocksmith\/rdrr\/resolve\//);
  assert.match(manifest.embedModel.defaultModelBaseUrl, /95f0b29ec73dea70394c6bcfa8407bc6796df6c9\/models\/google-embeddinggemma-300m-q4k-ehf16-af32$/);
  assert.doesNotMatch(manifest.embedModel.defaultModelBaseUrl, /models\/local/);
  assert.equal(manifest.embedModel.source.kind, 'huggingface-rdrr');
  assert.equal(manifest.embedModel.source.sourceCheckpointId, 'google/embeddinggemma-300m');
  assert.equal(manifest.runtime.moduleUrl, './vendor/doppler/src/index-browser.js');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.activationDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.mathDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.accumDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.outputDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.kvcache.kvDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.kvcache.layout, 'contiguous');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.kvcache.tiering.mode, 'off');
  assert.equal(manifest.cache.namespace, 'simulatte-embeddinggemma-300m-primitive-retrieval-v1');
  assert.equal(manifest.cache.prefetch, false);
  assert.equal(manifest.cache.worker, './simulatte-model-cache-sw.js');
  assert.equal(manifest.cache.requirePersistent, false);
  assert.equal(manifest.embedModel.manifestHash.hex, index.embedModelHash.hex);
  assert.equal(manifest.embedModel.manifestHash.hex, cardIndex.embedModelHash.hex);
  assert.equal(manifest.embedModel.manifestHash.hex, '9ac0f54f10fdeddfd67ea07661342713267d60ec57361e6e9d9d72e727407cd2');
  assert.equal(index.schema, 'simulatte.primitiveEmbeddingIndex.v2');
  assert.equal(index.id, 'simulatte-primitive-embeddinggemma-300m-index-v1');
  assert.equal(index.embedModelId, 'google-embeddinggemma-300m-q4k-ehf16-af32');
  assert.equal(index.embeddingDim, 768);
  assert.equal(catalog.PHYSICAL_PRIMITIVES.length, 420);
  assert.equal(index.documents.length, catalog.PHYSICAL_PRIMITIVES.length);
  assert.equal(index.documentCount, catalog.PHYSICAL_PRIMITIVES.length);
  assert.equal(packedBytes.byteLength, index.documents.length * index.embeddingDim * 4);
  assert.equal(cardIndex.schema, 'simulatte.surfaceCardEmbeddingIndex.v1');
  assert.equal(cardIndex.id, 'simulatte-surface-card-embeddinggemma-300m-index-v1');
  assert.equal(cardIndex.embedModelId, 'google-embeddinggemma-300m-q4k-ehf16-af32');
  assert.equal(cardIndex.embeddingDim, 768);
  assert.ok(cardIndex.documents.length >= 650);
  assert.equal(cardPackedBytes.byteLength, cardIndex.documents.length * cardIndex.embeddingDim * 4);
  assert.equal(universeManifest.embedModel.id, manifest.embedModel.id);
  assert.equal(universeManifest.embedModel.dimensions, manifest.embedModel.dimensions);
  assert.equal(universeManifest.embedModel.manifestHash.hex, manifest.embedModel.manifestHash.hex);
  assert.equal(Object.hasOwn(manifest, 'fallback'), false);
  assert.equal(fs.existsSync(retiredQwenCardIndexPath), false);
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
  assert.doesNotMatch(runtime, /QWEN_RUNTIME_CONFIG/);
  assert.match(runtime, /simulatte-model-cache/);
  assert.match(runtime, /resolveUrl\(rawModuleUrl, location\.href\)/);
  assert.match(runtime, /embedModelHash mismatch/);
  assert.match(runtime, /simulatte\.intentRerank\.v1/);
  assert.doesNotMatch(runtime, /DEFAULT_EMBED_MODEL_ID|qwen-3-5-0-8b-q4k-ehaf16|Qwen/);
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
