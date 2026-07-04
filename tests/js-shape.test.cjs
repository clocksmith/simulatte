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
    'simulatte-intent-worker.js',
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
    'simulatte-pipeline-worker.js',
    'simulatte-composition-graph.js',
    'simulatte-loading-canvas.js',
    'simulatte-physics-model.js',
    'simulatte-physics-renderer.js',
    'simulatte-physics-lab.js',
    'simulatte-review-bridge.js',
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
  assert.ok(
    position('simulatte-loading-canvas.js') < position('simulatte-webgpu-renderer.js'),
    'loading canvas should load before the WebGPU renderer'
  );
  assert.ok(
    position('simulatte-physics-lab.js') < position('simulatte-review-bridge.js'),
    'review bridge should load after the browser lab runtime'
  );
});

test('training mode streams prompt-output critiques over localhost', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const bridge = fs.readFileSync(path.join(jsDir, 'simulatte-review-bridge.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(jsDir, 'simulatte-physics-renderer.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'tools', 'simulatte-review-server.mjs'), 'utf8');

  assert.equal(pkg.scripts['review:server'], 'node tools/simulatte-review-server.mjs');
  assert.match(html, /simulatte-review-bridge\.js/);
  assert.match(bridge, /simulatte\.trainingMode\.enabled\.v1/);
  assert.match(bridge, /simulatte-training-reviews-v1/);
  assert.match(bridge, /indexedDB\.open\(DB_NAME, 1\)/);
  assert.match(bridge, /Export reviews/);
  assert.match(bridge, /PHASE_TARGETS/);
  assert.match(bridge, /phaseTarget\('final', 'Final', 1, 8\)/);
  for (const phase of ['1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8']) {
    assert.match(bridge, new RegExp(`phaseTarget\\('${phase}'`));
  }
  assert.match(bridge, /params\.get\('training'\)/);
  assert.match(bridge, /params\.get\('review'\)/);
  assert.match(bridge, /params\.get\('trainingServer'\)/);
  assert.match(bridge, /document\.addEventListener\('keydown'/);
  assert.match(bridge, /key === 't'/);
  assert.match(bridge, /TRAINING_LABELS/);
  assert.match(bridge, /Looks right/);
  assert.match(bridge, /Wrong scene/);
  assert.match(bridge, /Missing object/);
  assert.match(bridge, /Wrong material/);
  assert.match(bridge, /Too generic/);
  assert.match(bridge, /Bad motion/);
  assert.match(bridge, /Feedback note/);
  assert.match(bridge, /Type feedback here/);
  assert.match(bridge, /Save feedback as/);
  assert.match(bridge, /Feedback target/);
  assert.match(bridge, /Submit feedback for/);
  assert.match(bridge, /targetName\(target\)/);
  assert.match(bridge, /document\.querySelector\('#prompt-more-menu'\)/);
  assert.match(bridge, /if \(moreMenu\) moreMenu\.open = true/);
  assert.match(bridge, /await reviewStore\.put\(record, false\)/);
  assert.match(bridge, /syncQueuedRecords/);
  assert.match(bridge, /artifactSummary/);
  assert.match(bridge, /artifactHash/);
  assert.match(bridge, /phaseFrom/);
  assert.match(bridge, /phaseTo/);
  assert.match(bridge, /runId/);
  assert.match(bridge, /\/draft/);
  assert.match(bridge, /\/reviews/);
  assert.match(bridge, /mappingIds/);
  assert.match(bridge, /uniformSlots/);
  assert.match(bridge, /canvasHash/);
  assert.match(bridge, /fps: canvas && canvas\.dataset \? Number\(canvas\.dataset\.fps \|\| 0\) : 0/);
  assert.match(renderer, /getTrainingSnapshot/);
  assert.match(renderer, /simulatte\.trainingSnapshot\.v1/);
  assert.match(renderer, /syncTrainingSpecArtifacts/);
  assert.match(renderer, /storeTrainingArtifact\(run, 8, 'webgpu-ready'/);
  assert.match(server, /\/reviews\/latest/);
  assert.match(server, /\/summary/);
  assert.match(server, /summarizeReviews/);
  assert.match(server, /byPhase/);
  assert.match(server, /artifactSummary: compactJson/);
  assert.match(server, /fps: numberValue\(diagnostics\.fps, 0\)/);
  assert.match(server, /\/events/);
  assert.match(server, /Access-Control-Allow-Private-Network/);
  assert.match(server, /reviews\.jsonl/);
});

test('training launcher is shared by Codex and Claude skill surfaces', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const launcher = fs.readFileSync(path.join(root, 'tools', 'train.mjs'), 'utf8');
  const codexSkill = fs.readFileSync(path.join(root, '.agents', 'skills', 'train', 'SKILL.md'), 'utf8');
  const claudeSkill = fs.readFileSync(path.join(root, '.claude', 'skills', 'train', 'SKILL.md'), 'utf8');
  const claudeCommand = fs.readFileSync(path.join(root, '.claude', 'commands', 'train.md'), 'utf8');

  assert.equal(pkg.scripts.train, 'node tools/train.mjs');
  assert.match(launcher, /tools\/serve-local\.mjs/);
  assert.match(launcher, /tools\/simulatte-review-server\.mjs/);
  assert.match(launcher, /trainingServer/);
  assert.match(launcher, /open', \['-a', 'Google Chrome'/);
  assert.match(launcher, /--stop/);
  assert.match(launcher, /reviews\.jsonl/);
  assert.match(launcher, /browser fallback: local queue plus Export reviews/);
  assert.match(codexSkill, /^name: train/m);
  assert.match(codexSkill, /npm run train/);
  assert.match(codexSkill, /artifacts\/simulatte-human-reviews\/reviews\.jsonl/);
  assert.match(codexSkill, /saved locally in the browser first/);
  assert.match(claudeSkill, /^name: train/m);
  assert.match(claudeSkill, /npm run train/);
  assert.match(claudeSkill, /selected checkpoint/);
  assert.match(claudeCommand, /^description: Launch Simulatte training mode in Chrome/m);
  assert.match(claudeCommand, /npm run train -- \$ARGUMENTS/);
  assert.match(claudeCommand, /export JSONL/);
});

test('pipeline audit records phase scores, baselines, and regressions', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const scorer = fs.readFileSync(path.join(root, 'tools', 'audit-pipeline-score.mjs'), 'utf8');
  const summary = fs.readFileSync(path.join(root, 'tools', 'summarize-pipeline-audit.mjs'), 'utf8');
  const compare = fs.readFileSync(path.join(root, 'tools', 'compare-pipeline-audit.mjs'), 'utf8');

  assert.equal(pkg.scripts['audit:pipeline'], 'node tools/audit-pipeline-score.mjs');
  assert.equal(pkg.scripts['audit:pipeline:baseline'], 'node tools/audit-pipeline-score.mjs --write-baseline');
  assert.equal(pkg.scripts['audit:pipeline:summary'], 'node tools/summarize-pipeline-audit.mjs');
  assert.equal(pkg.scripts['audit:pipeline:compare'], 'node tools/compare-pipeline-audit.mjs');
  assert.match(scorer, /simulatte\.pipelineAuditRun\.v1/);
  assert.match(scorer, /phase-floor-76\.v1/);
  assert.match(scorer, /pipelineScore/);
  assert.match(scorer, /weakestPhase/);
  assert.match(scorer, /history\.jsonl/);
  assert.match(scorer, /baseline\.json/);
  assert.match(scorer, /scoreLanguageGraph/);
  assert.match(scorer, /scoreWebGpu/);
  assert.match(summary, /weakestPrompts/);
  assert.match(compare, /phaseDeltas/);
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

test('physics renderer is a browser coordinator, not a legacy Canvas2D painter library', () => {
  const renderer = fs.readFileSync(
    path.join(jsDir, 'simulatte-physics-renderer.js'),
    'utf8'
  );
  const lab = fs.readFileSync(
    path.join(jsDir, 'simulatte-physics-lab.js'),
    'utf8'
  );
  const auditTool = fs.readFileSync(
    path.join(root, 'tools', 'audit-intent-scene-screenshots.mjs'),
    'utf8'
  );

  assert.match(renderer, /function createBrowserLab/);
  assert.match(renderer, /function syncIntentRuntime/);
  assert.match(renderer, /function loadingPhaseFor/);
  assert.match(renderer, /if \(simulationVisible && webGpuRenderer\)/);
  assert.match(renderer, /webGpuRenderer\.render\(state, spec, now\)/);
  assert.match(renderer, /webGpuRenderer\.setSpec\(spec\)/);
  assert.doesNotMatch(renderer, /function drawSimulation/);
  assert.doesNotMatch(renderer, /function drawMaterialContinuumField/);
  assert.doesNotMatch(renderer, /function paint[A-Z][A-Za-z]+World/);
  assert.doesNotMatch(renderer, /function drawVisualIR[A-Za-z]+/);
  assert.doesNotMatch(renderer, /canvas\.getContext\('2d'\)/);
  assert.doesNotMatch(renderer, /drawPrismaticParticleField/);
  assert.doesNotMatch(renderer, /function draw[A-Z][A-Za-z]+Shape/);
  assert.doesNotMatch(renderer, /drawFieldSplat/);
  assert.doesNotMatch(renderer, /\.fillText\(/);
  assert.doesNotMatch(renderer, /setLineDash/);
});

test('prompt compilation has a worker boundary with main-thread fallback', () => {
  const renderer = fs.readFileSync(
    path.join(jsDir, 'simulatte-physics-renderer.js'),
    'utf8'
  );
  const worker = fs.readFileSync(
    path.join(jsDir, 'simulatte-pipeline-worker.js'),
    'utf8'
  );
  const intentWorker = fs.readFileSync(
    path.join(jsDir, 'simulatte-intent-worker.js'),
    'utf8'
  );

  assert.match(worker, /const SCRIPT_ORDER = Object\.freeze/);
  assert.match(worker, /importScripts\(\.\.\.SCRIPT_ORDER\)/);
  assert.match(worker, /simulatte-physics-model\.js/);
  assert.match(worker, /simulatte-visual-operator-compiler\.js/);
  assert.match(worker, /simulatte:pipeline-worker:compile/);
  assert.match(worker, /SimulattePhysicsModel\.createSpecFromPrompt/);
  assert.match(worker, /type: 'simulatte:pipeline-worker:result'/);
  assert.match(renderer, /const pipelineCompiler = createPipelineCompiler\(root\)/);
  assert.match(renderer, /function createPipelineCompiler\(root\)/);
  assert.match(renderer, /simulatte-pipeline-worker\.js/);
  assert.match(renderer, /new view\.Worker\(url\)/);
  assert.match(renderer, /function compilePromptSpec\(prompt, options, event = \{\}\)/);
  assert.match(renderer, /pipelineCompiler\.compile\(prompt, options\)/);
  assert.match(renderer, /worker compile fell back to main thread/);
  assert.match(renderer, /return createSpecFromPrompt\(prompt, options\)/);
  assert.match(renderer, /let compileSerial = 0/);
  assert.match(renderer, /token !== compileSerial/);
  assert.doesNotMatch(renderer, /Compiling preview simulation graph/);
  assert.match(renderer, /message: 'Building VisualIR'/);

  assert.match(intentWorker, /const SCRIPT_ORDER = Object\.freeze/);
  assert.match(intentWorker, /importScripts\(\.\.\.SCRIPT_ORDER\)/);
  assert.match(intentWorker, /simulatte-intent-embedder\.js/);
  assert.match(intentWorker, /simulatte:intent-worker:load/);
  assert.match(intentWorker, /simulatte:intent-worker:rank/);
  assert.match(intentWorker, /workerEmbedder\.rankPrompt/);
  assert.match(renderer, /const intentWorker = createIntentWorkerClient\(root, \(event\) => syncRuntime\(event\)\)/);
  assert.match(renderer, /const embedder = intentWorker \|\| mainThreadEmbedder/);
  assert.match(renderer, /function createIntentWorkerClient\(root, onProgress = null\)/);
  assert.match(renderer, /simulatte-intent-worker\.js/);
  assert.match(renderer, /worker\.postMessage\(\{\n\s+type,\n\s+id,\n\s+config,/);
  assert.match(renderer, /intentRuntimeBusy\(runtimeStatus\)/);
  assert.match(renderer, /function intentRuntimeBusy\(elements\)/);
});

test('home prompt shuffle stays consistent between HTML and catalog', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const catalog = fs.readFileSync(path.join(jsDir, 'simulatte-physics-catalog.js'), 'utf8');

  assert.match(html, /id="shuffle-prompt"/);
  assert.match(html, /Shuffle 256 examples/);
  assert.match(html, /id="prompt-more-menu"/);
  assert.match(html, /id="fps-readout"/);
  assert.match(html, /\.physics-fps/);
  assert.match(html, /grid-template-areas:\n\s+"prompt prompt"\n\s+"shuffle run";/);
  assert.match(html, /#shuffle-prompt \{\n\s+grid-area: shuffle;/);
  assert.match(html, /#build-lab \{\n\s+grid-area: run;/);
  assert.match(html, /class="builder-row"[\s\S]*id="build-prompt"[\s\S]*id="shuffle-prompt"[\s\S]*id="build-lab"/);
  assert.doesNotMatch(html, /id="prompt-more-menu"[\s\S]{0,500}id="shuffle-prompt"/);
  assert.doesNotMatch(html, /class="world-model-details"/);
  assert.doesNotMatch(html, /data-example-prompt=/);
  assert.match(html, /<textarea id="build-prompt"[^>]*placeholder="Describe a world to simulate"[^>]*><\/textarea>/);
  assert.doesNotMatch(html, /laser heats ferrofluid lens over copper coil<\/textarea>/);
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

test('physics loading uses a phase-reactive canvas Snake game instead of a card mosaic', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(jsDir, 'simulatte-physics-renderer.js'), 'utf8');

  assert.match(html, /--mosaic-pink/);
  assert.match(html, /--mosaic-lilac/);
  assert.doesNotMatch(html, /intent-runtime-mosaic/);
  assert.match(html, /id="physics-canvas"/);
  assert.match(html, /id="physics-canvas"[^>]*data-scene-visible="false"/);
  assert.match(html, /#physics-canvas\[data-scene-visible="false"\] \{[\s\S]*opacity: 0;[\s\S]*visibility: hidden;/);
  assert.match(html, /id="loading-canvas"/);
  assert.match(html, /#loading-canvas \{[\s\S]*position: fixed;[\s\S]*opacity: 0;[\s\S]*transition: opacity 160ms ease;/);
  assert.match(html, /#loading-canvas\.is-active \{\n\s+opacity: 1;/);
  assert.match(html, /simulatte-loading-canvas\.js/);
  assert.match(html, /simulatte-webgpu-renderer\.js/);
  assert.doesNotMatch(html, /simulatte-particle-field\.js/);
  assert.doesNotMatch(html, /simulatte-cinematic-renderer\.js/);
  assert.match(html, /repeating-linear-gradient/);
  assert.match(html, /@keyframes mosaic-drift/);
  assert.match(html, /@keyframes mosaic-sweep/);
  assert.doesNotMatch(html, /\.intent-runtime\[data-state="active"\] \.intent-runtime-track::after/);
  assert.match(html, /\.primary-action\.is-loading::after/);
  assert.doesNotMatch(renderer, /createCanvasSnakeLoader/);
  assert.doesNotMatch(renderer, /drawCanvasLoadingSnakes/);
  assert.match(renderer, /INTENT_PIPELINE_PHASES/);
  assert.match(renderer, /phaseRule\(1, 'prompt-runtime'/);
  assert.match(renderer, /phaseRule\(8, 'webgpu-ready'/);
  assert.match(renderer, /function loadingPhaseFor/);
  assert.match(renderer, /elements\.node\.dataset\.stage = phase\.id/);
  assert.match(renderer, /elements\.node\.dataset\.pipelineStep = String\(phase\.step\)/);
  assert.match(renderer, /waitForLoadingPaint/);
  assert.match(renderer, /canvasLoading = loading && event\.canvasLoading !== false/);
  assert.match(renderer, /dataset\.loadingVisual = canvasLoading \? 'snake' : loading \? 'simple' : 'idle'/);
  assert.match(renderer, /dataset\.canvasLoading = canvasLoading \? 'snake' : 'idle'/);
  assert.match(renderer, /SimulatteLoadingCanvas\.createController\(loadingCanvas/);
  assert.match(renderer, /elements\.loadingCanvas\.setLoading\(canvasLoading, percent, stage\)/);
  assert.doesNotMatch(renderer, /webGpuRenderer\.setLoading\(canvasLoading, percent, stage\)/);
  assert.match(renderer, /let simulationVisible = false/);
  assert.match(renderer, /function setSimulationCanvasVisible\(visible\)/);
  assert.match(renderer, /canvas\.dataset\.sceneVisible = simulationVisible \? 'true' : 'false'/);
  assert.match(renderer, /setSpec\(spec, \{ visible: false \}\)/);
  assert.match(renderer, /setSpec\(nextSpec, \{ visible: true \}\)/);
  assert.match(renderer, /SimulatteWebGpuRenderer\.create\(canvas/);
  assert.match(renderer, /const ctx = null/);
  assert.doesNotMatch(renderer, /canvas\.getContext\('2d'\)/);
  assert.doesNotMatch(html, /id="field-canvas"/);
  assert.doesNotMatch(renderer, /fieldCanvas/);
  assert.doesNotMatch(renderer, /requireWebGpu: Boolean\(webGpuRenderer\)/);
  const webgpuRenderer = fs.readFileSync(
    path.join(jsDir, 'simulatte-webgpu-renderer.js'),
    'utf8'
  );
  const loadingCanvas = fs.readFileSync(
    path.join(jsDir, 'simulatte-loading-canvas.js'),
    'utf8'
  );
  assert.match(webgpuRenderer, /new Float32Array\(104\)/);
  assert.match(webgpuRenderer, /this\.atomUniforms = graphicsAtomUniformVector\(spec\)/);
  assert.doesNotMatch(webgpuRenderer, /LOADING_CANVAS|resolveLoadingCanvas|SimulatteLoadingCanvas/);
  assert.doesNotMatch(webgpuRenderer, /loadingGrid\(uv, t, u\.loading\.y, u\.loading\.z\)/);
  assert.doesNotMatch(webgpuRenderer, /\$\{LOADING_CANVAS\.shader\}/);
  assert.doesNotMatch(webgpuRenderer, /function loadingStageCode/);
  assert.match(webgpuRenderer, /u\[12\] = 0/);
  assert.match(webgpuRenderer, /u\[13\] = 1/);
  assert.match(webgpuRenderer, /u\[14\] = 0/);
  assert.match(loadingCanvas, /function createController/);
  assert.match(loadingCanvas, /class SnakeLoadingCanvas/);
  assert.match(loadingCanvas, /requestAnimationFrame/);
  assert.match(loadingCanvas, /cancelAnimationFrame/);
  assert.match(loadingCanvas, /this\.canvas\.classList\.add\('is-active'\)/);
  assert.match(loadingCanvas, /this\.canvas\.classList\.remove\('is-active'\)/);
  assert.match(loadingCanvas, /this\.canvas\.hidden = true/);
  assert.match(loadingCanvas, /const FADE_MS = 160/);
  assert.match(loadingCanvas, /const MIN_SNAKES = 6/);
  assert.match(loadingCanvas, /const MAX_SNAKES = 10/);
  assert.match(loadingCanvas, /const SPLIT_LENGTH = 34/);
  assert.match(loadingCanvas, /const TOTAL_CELL_LIMIT = 230/);
  assert.match(loadingCanvas, /const TARGET_CELL_PX = 32/);
  assert.match(loadingCanvas, /const MIN_CELL_PX = 18/);
  assert.match(loadingCanvas, /const MAX_CELL_PX = 40/);
  assert.match(loadingCanvas, /const LOOP_TURN_BONUS = 5\.2/);
  assert.match(loadingCanvas, /const TRAIL_ORBIT_BONUS = 1\.7/);
  assert.match(loadingCanvas, /const PASTEL_RAINBOW = Object\.freeze/);
  assert.match(loadingCanvas, /'#ff6fa3'/);
  assert.match(loadingCanvas, /'#42cfff'/);
  assert.match(loadingCanvas, /'#c66bff'/);
  assert.match(loadingCanvas, /function fullPageBoard/);
  assert.match(loadingCanvas, /const shortAxisCells = Math\.max\(10, Math\.floor\(shortAxis \/ TARGET_CELL_PX\)\)/);
  assert.match(loadingCanvas, /Math\.max\(MIN_CELL_PX, Math\.min\(MAX_CELL_PX/);
  assert.match(loadingCanvas, /function drawGrid/);
  assert.match(loadingCanvas, /ctx\.fillStyle = '#f8f8f9'/);
  assert.match(loadingCanvas, /ctx\.strokeStyle = 'rgba\(198, 201, 207, 0\.62\)'/);
  assert.match(loadingCanvas, /function drawSnake/);
  assert.match(loadingCanvas, /ctx\.fillRect\(\n\s+part\.x \* cell \+ inset,/);
  assert.doesNotMatch(loadingCanvas, /function drawEyes|ctx\.arc|roundRect|const shade = \(x \+ y\) % 2/);
  assert.match(loadingCanvas, /advanceSwarm/);
  assert.match(loadingCanvas, /enforcePopulation/);
  assert.match(loadingCanvas, /chooseDirection/);
  assert.match(loadingCanvas, /turnBias: this\.rng\(\) < 0\.5 \? -1 : 1/);
  assert.match(loadingCanvas, /loopiness: 0\.72 \+ this\.rng\(\) \* 0\.38/);
  assert.match(loadingCanvas, /const preferredTurn = turnDirection\(current, snake\.turnBias \|\| 1\)/);
  assert.match(loadingCanvas, /LOOP_TURN_BONUS \* \(snake\.loopiness \|\| 0\.85\)/);
  assert.match(loadingCanvas, /ownTrailAdjacency\(target, snake\) \* TRAIL_ORBIT_BONUS/);
  assert.match(loadingCanvas, /function turnDirection/);
  assert.match(loadingCanvas, /function ownTrailAdjacency/);
  assert.match(loadingCanvas, /combineCollisionGroups/);
  assert.match(loadingCanvas, /plan\.actualTarget = target/);
  assert.match(loadingCanvas, /cellKey\(plan\.actualTarget \|\| plan\.target\)/);
  assert.match(loadingCanvas, /function combineSnakes/);
  assert.match(loadingCanvas, /function swizzleColors/);
  assert.match(loadingCanvas, /splitOversizedSnakes/);
  assert.match(loadingCanvas, /function shedCellsForSplit/);
  assert.match(loadingCanvas, /function alphaForCell/);
  assert.match(loadingCanvas, /1 - index \/ \(length - 1\) \* 0\.9/);
  assert.match(loadingCanvas, /function colorWithAlpha/);
  assert.match(loadingCanvas, /function directionFromCells/);
  assert.match(loadingCanvas, /return \{ x: dx, y: 0 \}/);
  assert.match(loadingCanvas, /return \{ x: 0, y: dy \}/);
  assert.match(loadingCanvas, /multi-snake-loading-canvas/);
  assert.doesNotMatch(loadingCanvas, /buildSnakePath|mixGreen|mixSnakeTone|#07170f|#061008|#ff3d1f|#ff321f|#e7ff40|108, 255, 126/);
  assert.doesNotMatch(html, /#7ac943|#356b20|#2bb8a6|rgba\(122, 201, 67|rgba\(105, 216, 187|rgba\(43, 184, 166/);
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
  assert.doesNotMatch(webgpuRenderer, /sceneGroup == 13\.0 \|\| sceneGroup == 15\.0 \|\| sceneGroup == 17\.0 \|\| sceneGroup == 29\.0/);
  assert.match(webgpuRenderer, /renderIR\.causalAffordances/);
  assert.match(webgpuRenderer, /visualIR\.causalAffordances/);
  assert.match(webgpuRenderer, /visualIR\.graphicsAtoms/);
  assert.match(webgpuRenderer, /graphicsAtoms\.languageSignals/);
  assert.match(webgpuRenderer, /ranked\.slice\(0, 10\)/);
  assert.match(renderer, /resolveWithEmbedding\(prompt, params, serial, true\)/);
  assert.match(renderer, /function warmIntentRuntime\(serial\)/);
  assert.match(renderer, /await embedder\.loadModel\(\)/);
  assert.doesNotMatch(renderer, /initialPrompt/);
  assert.doesNotMatch(renderer, /resolveWithEmbedding\(initialPrompt/);
  assert.match(renderer, /function skipInitialBuildForAudit/);
  assert.match(renderer, /auditNoInitial/);
  assert.match(renderer, /runButton\.classList\.toggle\('is-loading', loading\)/);
  assert.match(renderer, /runButton\.disabled = loading/);
  assert.match(renderer, /runButton\.setAttribute\('aria-disabled'/);
  assert.match(renderer, /runButton\.setAttribute\('aria-busy'/);
  assert.match(renderer, /createFpsMeter/);
  assert.match(renderer, /fpsMeter\.sample\(now, simulationVisible && webGpuRenderer\)/);
  assert.match(renderer, /canvas\.dataset\.fps = visible \? String\(fps\) : '0'/);
  assert.match(renderer, /fps < 24 \? 'low' : fps < 45 \? 'warn' : 'ok'/);
  assert.match(renderer, /const rawMessage = event\.detail \|\| event\.message \|\| stage/);
  assert.match(renderer, /runtimeLineText\(event, phase, stage, message, visiblePercent, indeterminate\)/);
  assert.match(renderer, /estimatedRuntimePercent/);
  assert.match(renderer, /visibleRuntimePercent/);
  assert.match(html, /--runtime-progress: 0%/);
  assert.match(html, /prompt-runtime-rainbow/);
  assert.match(html, /\.prompt-dock \.intent-runtime \{[\s\S]*border: 0;[\s\S]*background: transparent;[\s\S]*box-shadow: none;/);
  assert.doesNotMatch(renderer, /Math\.round\(percent\)/);
  assert.doesNotMatch(renderer, /runtimeDetailText/);
});

test('visual audit auto-judges prompt fidelity and motion with a rubric', () => {
  const tool = fs.readFileSync(
    path.join(root, 'tools', 'audit-intent-scene-screenshots.mjs'),
    'utf8'
  );
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.match(tool, /VISUAL_RUBRIC_SIGNALS/);
  assert.match(tool, /simulatte\.visualPromptRubric\.v1/);
  assert.match(tool, /expectedVisualSignals/);
  assert.match(tool, /visualRubricForResult/);
  assert.match(tool, /canvasFrameHashChanged/);
  assert.match(tool, /canvasFrameSampleHashChanged/);
  assert.match(tool, /dynamicMagnitude/);
  assert.match(tool, /representationQualityForResult/);
  assert.match(tool, /simulatte\.visualRepresentationQuality\.v1/);
  assert.match(tool, /representationFailures/);
  assert.match(tool, /averageRepresentationQuality/);
  assert.match(tool, /canvasFrameLumaMeanDelta/);
  assert.match(tool, /matchedSignals/);
  assert.match(tool, /missingSignals/);
  assert.match(tool, /--url URL/);
  assert.match(tool, /auditPageUrl/);
  assert.match(tool, /simulatte\.liveVisualAutoRating\.v1/);
  assert.match(tool, /autoRating/);
  assert.match(tool, /diversityTelemetryOnly: true/);
  assert.doesNotMatch(tool, /sceneDiversity \* 0\.14/);
  assert.doesNotMatch(tool, /screenshotDiversity \* 0\.08/);
  assert.doesNotMatch(tool, /canvasDiversity \* 0\.08/);
  assert.match(tool, /target: options\.url \? 'live-url' : 'local-public'/);
  assert.match(tool, /--intent-mode local\|model/);
  assert.match(tool, /intentMode !== 'model'/);
  assert.match(tool, /url\.searchParams\.set\('auditNoInitial', '1'\)/);
  assert.match(tool, /visualIRGraphicsUniformValues/);
  assert.match(tool, /visualIRGraphicsLanguageSignals/);
  assert.match(tool, /visual rubric failed/);
  assert.match(packageJson.scripts['audit:visual'], /audit-intent-scene-screenshots\.mjs/);
  assert.match(packageJson.scripts['audit:visual'], /--intent-mode model/);
  assert.match(packageJson.scripts['audit:visual:model'], /--intent-mode model/);
  assert.match(packageJson.scripts['eval:live'], /--url https:\/\/simulatte-world\.web\.app/);
  assert.match(packageJson.scripts['eval:live'], /--out artifacts\/live-visual-eval/);
  assert.equal(packageJson.scripts['eval:live:summary'], 'node tools/summarize-live-visual-eval.mjs artifacts/live-visual-eval/report.json');
  assert.match(packageJson.scripts['eval:live:model'], /--intent-mode model/);
  assert.match(packageJson.scripts['eval:live:model'], /--out artifacts\/live-model-visual-eval/);
  const summaryTool = fs.readFileSync(
    path.join(root, 'tools', 'summarize-live-visual-eval.mjs'),
    'utf8'
  );
  assert.match(summaryTool, /failingPrompts/);
  assert.match(summaryTool, /missingSignals/);
  assert.match(summaryTool, /representationFailures/);
  assert.match(summaryTool, /canvasLate/);
});

test('prompt dock minimizes to corners without drag placement', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

  assert.match(html, /width: min\(520px, calc\(100vw - 24px\)\);/);
  assert.match(html, /@media \(max-width: 820px\) \{[\s\S]*\.physics-panel \{[\s\S]*left: 50%;[\s\S]*right: auto;[\s\S]*width: min\(520px, calc\(100vw - 24px\)\);[\s\S]*transform: translateX\(-50%\);/);
  assert.doesNotMatch(html, /@media \(max-width: 820px\) \{[\s\S]*\.physics-panel \{[\s\S]*right: 10px;[\s\S]*width: auto;/);
  assert.match(html, /\.prompt-dock\[data-collapsed="true"\] \{/);
  assert.match(html, /\.prompt-dock\[data-dock-edge="top"\]\[data-collapsed="false"\] \{/);
  assert.match(html, /rgba\(255, 255, 255, 0\.38\)/);
  assert.match(html, /opacity: 0\.88;/);
  assert.match(html, /\[data-corner="top-left"\]/);
  assert.match(html, /\[data-corner="top-right"\]/);
  assert.match(html, /\[data-corner="bottom-left"\]/);
  assert.match(html, /\[data-corner="bottom-right"\]/);
  assert.match(html, /data-dock-corner="top-left"/);
  assert.match(html, /data-dock-corner="top-right"/);
  assert.match(html, /data-dock-corner="bottom-left"/);
  assert.match(html, /data-dock-corner="bottom-right"/);
  assert.match(html, /simulatte\.promptDock\.corner\.v1/);
  assert.match(html, /const cornerButtons = Array\.from\(document\.querySelectorAll\('\[data-dock-corner\]'\)\)/);
  assert.match(html, /const normalizeCorner = \(value\) => validCorners\.has\(value\) \? value : 'bottom-left'/);
  assert.match(html, /panel\.dataset\.corner = next/);
  assert.match(html, /panel\.dataset\.dockEdge = isTopCorner\(next\) \? 'top' : 'bottom'/);
  assert.match(html, /panel\.dispatchEvent\(new CustomEvent\('prompt-dock:collapsed'/);
  assert.doesNotMatch(html, /prompt-dock-handle/);
  assert.doesNotMatch(html, /promptDock\.position/);
  assert.doesNotMatch(html, /pointerdown|pointermove|pointerup|setPointerCapture|releasePointerCapture/);
  assert.doesNotMatch(html, /\.prompt-dock\.dragging/);
});

test('browser product exposes compiled world model receipts', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const lab = fs.readFileSync(path.join(jsDir, 'simulatte-physics-lab.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(jsDir, 'simulatte-physics-renderer.js'), 'utf8');
  const auditTool = fs.readFileSync(path.join(root, 'tools', 'audit-intent-scene-screenshots.mjs'), 'utf8');

  assert.match(html, /id="world-model-panel"/);
  assert.match(html, /id="world-model-chips"/);
  assert.match(html, /id="spec-preview"/);
  assert.match(renderer, /function syncWorldModelReceipt/);
  assert.match(renderer, /function worldModelSnapshot/);
  assert.match(renderer, /simulatte\.visibleWorldModelReceipt\.v1/);
  assert.match(renderer, /templateId: spec\.templateId/);
  assert.match(renderer, /rendererPlan: spec\.renderProgram\.rendererPlan/);
  assert.match(renderer, /visualIR: spec\.renderProgram\.visualIR/);
  assert.match(lab, /document\.readyState === 'loading'/);
  assert.match(lab, /startWhenReady\(\)/);
  assert.match(auditTool, /window\.SimulatteStartPhysicsLab\(\)/);
  assert.match(auditTool, /SimulattePhysicsLab\._browserLab/);
  assert.match(renderer, /languageSpans/);
  assert.match(renderer, /acceptedActivations/);
  assert.match(renderer, /graphicsAtoms/);
  assert.match(renderer, /wgslOperators/);
});

test('composition renderer diversity lives in compiled graph and WebGPU operators', () => {
  const renderer = fs.readFileSync(path.join(jsDir, 'simulatte-physics-renderer.js'), 'utf8');
  const graph = fs.readFileSync(path.join(jsDir, 'simulatte-composition-graph.js'), 'utf8');
  const registry = fs.readFileSync(path.join(jsDir, 'simulatte-render-registry.js'), 'utf8');
  const webgpuRenderer = fs.readFileSync(
    path.join(jsDir, 'simulatte-webgpu-renderer.js'),
    'utf8'
  );
  const loadingCanvas = fs.readFileSync(
    path.join(jsDir, 'simulatte-loading-canvas.js'),
    'utf8'
  );

  for (const token of [
    'atomStructuralScene',
    'atomOperatorOverlays',
    'atomThermalPlume',
    'atomFluidRibbons',
    'atomQuantumFringes',
    'atomStressCracks',
    'atomFeedbackArcs',
    'atomNetworkPressure',
    'cinematic3dScene',
    'loopPulse',
    'waterLane',
    'gasBubbles',
    'heatBreath',
    'muonTrackA',
    'fieldSweep',
    'calorimeterPulse',
    'thin-film',
    'sceneGroup == 33.0',
    'sceneGroup == 34.0',
    'surface-tension',
    'pressure wave',
  ]) {
    assert.match(webgpuRenderer, new RegExp(token));
  }
  assert.match(loadingCanvas, /SnakeLoadingCanvas/);
  for (const sceneKind of ['ferrofluid', 'thin-film', 'granular', 'thermal-plume']) {
    assert.match(graph, new RegExp(`sceneKind === '${sceneKind}'`));
  }
  assert.doesNotMatch(renderer, /isExpandedSceneKind\(sceneKind\)/);
  assert.doesNotMatch(renderer, /paintExpandedSceneWorld/);
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
    assert.match(webgpuRenderer, new RegExp(sceneKind));
  }
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
  assert.match(webgpuRenderer, /'thin-film': 34/);
  assert.match(webgpuRenderer, /fire: 33/);
  assert.match(webgpuRenderer, /'magnetic-machine': 4/);
  for (const sceneGroup of ['4.0', '6.0', '16.0', '17.0', '18.0', '19.0', '20.0', '21.0', '22.0', '33.0', '34.0']) {
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
  assert.match(graph, /function compositionPromptText/);
  assert.match(graph, /renderIR\.prompt/);
  assert.doesNotMatch(graph, /const promptText = '';/);
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
  const activationCloud = fs.readFileSync(path.join(jsDir, 'simulatte-activation-cloud.js'), 'utf8');
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
  assert.match(activationCloud, /LANGUAGE_VISUAL_SIGNAL_RULES/);
  assert.match(activationCloud, /language-evidence-visual-signal/);
  assert.match(visualOperatorCompiler, /function compiledIntentBriefText/);
  assert.match(visualOperatorCompiler, /languageSignals: compiledLanguageSignals\(context\)/);
});

test('intent runtime keeps one visible line and does not silently fallback locally', () => {
  const renderer = fs.readFileSync(path.join(jsDir, 'simulatte-physics-renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

  assert.match(renderer, /compactIntentRuntimeMessage/);
  assert.match(renderer, /runtimeLineText/);
  assert.match(renderer, /Runtime dtype mismatch/);
  assert.match(renderer, /embedModel\(Id\|Hash\) mismatch/);
  assert.match(renderer, /Intent model unavailable/);
  assert.match(renderer, /console\.error\('\[simulatte\.intent\] model-backed intent failed'/);
  assert.match(renderer, /function reportIntentFailure/);
  assert.doesNotMatch(renderer, /function resolveWithoutEmbedding/);
  assert.doesNotMatch(renderer, /Local graph ready/);
  assert.doesNotMatch(renderer, /using local graph fallback/);
  assert.doesNotMatch(renderer, /allowPrototypeFallback: true/);
  assert.doesNotMatch(renderer, /applyIntentResult\(preview/);
  assert.doesNotMatch(renderer, /onPreview: \(preview\) => \{\n\s+applyIntentResult/);
  assert.match(renderer, /elements\.node\.dataset\.detail = String\(line/);
  assert.match(renderer, /elements\.title\.textContent = line/);
  assert.match(renderer, /return `Loading embeddings \$\{percent\}%`/);
  assert.match(renderer, /return `Grounding intent \$\{percent\}%`/);
  assert.match(renderer, /return `Building VisualIR \$\{percent\}%`/);
  assert.match(renderer, /return `Rendering scene \$\{percent\}%`/);
  assert.match(renderer, /return 'Ready 100%'/);
  assert.match(html, /\.intent-runtime-percent,[\s\S]*\.intent-runtime-track,[\s\S]*\.intent-runtime-meta,[\s\S]*\.intent-runtime-detail \{\n\s+display: none;/);
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
