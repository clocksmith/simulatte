const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const nodeTest = require('node:test');

const SELECTED_SHAPE_GROUP = process.env.SIMULATTE_SHAPE_TEST_GROUP;
const SHAPE_GROUPS = new Set(['architecture', 'model-data', 'runtime-progress', 'browser-render']);
if (!SHAPE_GROUPS.has(SELECTED_SHAPE_GROUP)) {
  throw new Error('JavaScript shape suite requires a focused SIMULATTE_SHAPE_TEST_GROUP');
}

function shapeTestGroup(name) {
  if (/runtime progress|runtime cache|runtime heartbeat|loader phase/i.test(name)) return 'runtime-progress';
  if (/visual audit|renderer|WebGPU|canvas|world model|composition|phase 8|physics graph|pipeline phases|prompt dock/i.test(name)) {
    return 'browser-render';
  }
  if (/model|Doppler|Firebase|negation|catalog|causal affordance|operator atlas|procedural visual|training|pipeline audit|worker|prompt compilation|home prompt/i.test(name)) {
    return 'model-data';
  }
  return 'architecture';
}

function test(name, ...args) {
  if (shapeTestGroup(name) !== SELECTED_SHAPE_GROUP) return undefined;
  return nodeTest(name, ...args);
}

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const runtimeScriptManifest = require(path.join(publicDir, 'blank', 'app', 'runtime-script-manifest.js'));
const moduleMapPath = path.join(root, 'tools', 'simulatte-module-map.json');
const moduleMap = JSON.parse(fs.readFileSync(moduleMapPath, 'utf8'));
const runtimeModuleByName = new Map();
for (const entry of moduleMap.entries) {
  const rel = entry.newPath.replace(/^public\//, '');
  runtimeModuleByName.set(path.basename(entry.oldPath), rel);
  runtimeModuleByName.set(path.basename(entry.newPath), rel);
}
const catalog = require(runtimeFile('simulatte-physics-catalog.js'));
const runtimeProgressApi = require(runtimeFile('runtime-progress.js'));
const visualOperatorAtlas = require(runtimeFile('simulatte-visual-operator-atlas.js'));
const visualOperatorCompiler = require(runtimeFile('simulatte-visual-operator-compiler.js'));

function jsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(file));
    else if (entry.name.endsWith('.js')) out.push(file);
  }
  return out;
}

function runtimeFile(name) {
  const rel = runtimeModuleByName.get(name);
  assert.ok(rel, `runtime module map missing ${name}`);
  return path.join(publicDir, rel);
}

function blankPageSource() {
  return [
    fs.readFileSync(path.join(publicDir, 'blank', 'index.html'), 'utf8'),
    fs.readFileSync(path.join(publicDir, 'blank', 'styles.css'), 'utf8'),
  ].join('\n');
}

function runtimeSource(name) {
  const file = runtimeFile(name);
  return runtimeSourceFromFile(file, new Set());
}

function runtimeSourceFromFile(file, seen) {
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
  ]
    .filter(Boolean)
    .join('\n');
}

function publicRuntimeJsFiles() {
  return [
    path.join(publicDir, 'blank', 'app'),
    path.join(publicDir, 'blank', 'pipeline'),
    path.join(publicDir, 'blank', 'app', 'workers'),
  ].flatMap((dir) => jsFiles(dir));
}

test('public javascript keeps lines below the repository ceiling', () => {
  for (const file of publicRuntimeJsFiles()) {
    const rel = path.relative(root, file);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    assert.ok(
      lines.length <= 999,
      `${rel} has ${lines.length} lines`
    );
  }
});

const REFACTOR_SCOPE_BASELINE = Object.freeze({
  withScopeFiles: 0,
  missingDependencyFiles: 0,
  scopeNames: Object.freeze([]),
});

test('phase modules reject every implicit refactor scope', () => {
  const files = [...new Set(publicRuntimeJsFiles())];
  const withScopeFiles = [];
  const missingDependencyFiles = [];
  const scopeNames = new Set();

  for (const file of files) {
    const rel = path.relative(root, file);
    const source = fs.readFileSync(file, 'utf8');
    if (source.includes('with (scope)')) withScopeFiles.push(rel);
    if (source.includes('missingDependency')) missingDependencyFiles.push(rel);
    for (const match of source.matchAll(/__Simulatte[A-Za-z]*RefactorScope/g)) {
      scopeNames.add(match[0]);
    }
  }

  assert.equal(withScopeFiles.length, REFACTOR_SCOPE_BASELINE.withScopeFiles);
  assert.equal(missingDependencyFiles.length, REFACTOR_SCOPE_BASELINE.missingDependencyFiles);
  for (const name of scopeNames) {
    assert.ok(
      REFACTOR_SCOPE_BASELINE.scopeNames.includes(name),
      `new refactor scope ${name} is not allowed; use an explicit factory with named dependencies`
    );
  }
});

test('phase shards never merge exports into a shared scope object', () => {
  const phaseFiles = jsFiles(path.join(publicDir, 'blank', 'pipeline'));
  for (const file of phaseFiles) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /Object\.assign\(scope,/);
  }
});

test('autonomy and shared surfaces stay free of refactor scope shards', () => {
  const dirs = [path.join(publicDir, 'simulatte'), path.join(publicDir, 'shared')]
    .filter((dir) => fs.existsSync(dir));

  for (const file of dirs.flatMap((dir) => jsFiles(dir))) {
    const rel = path.relative(root, file);
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(!source.includes('with (scope)'), `${rel} uses with (scope)`);
    assert.ok(!/__Simulatte[A-Za-z]*RefactorScope/.test(source), `${rel} registers a refactor scope`);
  }
});

test('runtime source is owned by app, pipeline, data, and worker directories', () => {
  for (const retired of ['js', 'models', 'src']) {
    assert.equal(fs.existsSync(path.join(publicDir, retired)), false, `public/${retired} should be retired`);
  }
});

test('app product boundaries use loading prompt simulation and pipeline directories', () => {
  for (const retired of [
    'blank/app/game',
    'blank/app/shell',
    'blank/app/experience',
    'blank/app/boot',
    'blank/app/start',
    'blank/app/world-session',
    'blank/app/view',
    'blank/app/drawing',
    'blank/app/ui',
    'blank/app/lab',
    'blank/app/session',
    'blank/app/controls',
    'blank/app/graphics',
    'compiler',
    'blank/app/render',
  ]) {
    assert.equal(fs.existsSync(path.join(publicDir, retired)), false, `public/${retired} should be retired`);
  }
  for (const relativePath of new Set([
    ...runtimeScriptManifest.browser,
    ...runtimeScriptManifest.pipelineWorker,
    ...runtimeScriptManifest.intentWorker,
  ])) {
    assert.ok(fs.existsSync(path.join(publicDir, 'blank', relativePath)), `runtime script missing ${relativePath}`);
  }
});

test('phase contracts declare the strict eight-phase handoff', () => {
  const contractsPath = path.join(publicDir, 'blank', 'pipeline', 'simulatte-phase-contracts.js');
  const contracts = require(contractsPath);

  assert.equal(contracts.phases.length, 8);
  contracts.phases.forEach((phase, index) => {
    assert.equal(phase.phase, index + 1);
    assert.ok(Array.isArray(phase.allowedInputs));
    assert.ok(Array.isArray(phase.receipts));
    assert.ok(Array.isArray(phase.forbiddenUpstreamReads));
  });
  assert.ok(contracts.phases[2].forbiddenUpstreamReads.includes('rawPrompt'));
  assert.ok(contracts.phases[3].forbiddenUpstreamReads.includes('rankedPrimitives'));
  assert.ok(contracts.phases[6].forbiddenUpstreamReads.includes('renderIR'));
});

test('intent forensics modules load before the physics model in the browser lab', () => {
  const html = blankPageSource();
  const scriptNames = Array.from(html.matchAll(/<script defer src="([^"]+)"><\/script>/g))
    .map((match) => path.basename(match[1].split('?')[0]));
  const position = (name) => scriptNames.indexOf(name);

  for (const name of [
    'simulatte-intent-brief-schema.js',
    'simulatte-structured-intent-rules.js',
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
    position('loading-canvas.js') < position('simulatte-webgpu-renderer.js'),
    'loading canvas should load before the WebGPU renderer'
  );
  assert.ok(
    position('simulation-lab.js') < position('prompt-review-bridge.js'),
    'review bridge should load after the browser lab runtime'
  );
});

test('selected-token reranker runtime loads before the model-backed embedder class captures it', () => {
  for (const [name, scripts] of [
    ['browser', runtimeScriptManifest.browser],
    ['intent worker', runtimeScriptManifest.intentWorker],
  ]) {
    const runtimePosition = scripts.indexOf('pipeline/phase-03-retrieval/simulatte-intent-embedder-rerank-runtime.js');
    const embedderPosition = scripts.indexOf('pipeline/phase-03-retrieval/simulatte-intent-embedder-manifest-cache.js');
    assert.notEqual(runtimePosition, -1, `${name} must load the reranker runtime`);
    assert.notEqual(embedderPosition, -1, `${name} must load the model-backed embedder`);
    assert.ok(runtimePosition < embedderPosition, `${name} must load reranking before the embedder`);
  }
  const embedderFacade = fs.readFileSync(
    path.join(root, 'public', 'blank', 'pipeline', 'phase-03-retrieval', 'simulatte-intent-embedder.js'),
    'utf8'
  );
  assert.ok(
    embedderFacade.indexOf('simulatte-intent-embedder-rerank-runtime.js')
      < embedderFacade.indexOf('simulatte-intent-embedder-manifest-cache.js'),
    'CommonJS embedder facade must load reranking before the embedder'
  );
  const legacyRerankSource = fs.readFileSync(
    path.join(root, 'public', 'blank', 'pipeline', 'phase-03-retrieval', 'simulatte-intent-embedder-rerank.js'),
    'utf8'
  );
  for (const symbol of [
    'rerankProviderFromModelHandle',
    'rerankerInputCandidateLimit',
    'resetRerankerHandle',
    'rerankScoringConfig',
    'formatRerankPrompt',
    'rerankCandidateText',
    'sigmoid',
  ]) {
    assert.doesNotMatch(legacyRerankSource, new RegExp(`\\b${symbol}\\b`), `${symbol} has one runtime owner`);
  }
});

test('visual operator atlas exposes reusable graphics atoms for Layer 7', () => {
  const atlasPath = path.join(root, 'public', 'data', 'simulatte-visual-cards', 'visual-operator-atlas-v1.json');
  const atlasJson = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));

  assert.ok(visualOperatorAtlas.VISUAL_OPERATOR_MAPPINGS.every((row) => row.requires.length >= 1));
  assert.ok(visualOperatorAtlas.VISUAL_OPERATOR_MAPPINGS.every((row) => (
    JSON.stringify(row.requires[0]) === JSON.stringify(row.matchTerms)
  )), 'visual operator scoring and direct-evidence gates share one canonical vocabulary');
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
  assert.equal(plan.uniforms.values.length, visualOperatorAtlas.VISUAL_ATOM_UNIFORM_SLOTS.length);
  assert.ok(plan.uniforms.bySlot.thermal > 0);
  assert.ok(plan.uniforms.bySlot.fluid > 0);
  assert.ok(plan.wgslOperators.includes('atomThermalPlume'));
  assert.ok(plan.wgslOperators.includes('atomFluidRibbons'));

  const feedbackPlan = visualOperatorCompiler.compileVisualGraphicsAtoms({
    sceneKind: 'digital-network',
    solverPlan: { executableSteps: ['network_flow'] },
    objects: [{ source: 'prompt-explicit', phrase: 'controller limits', role: 'controller' }],
    fields: [],
    causalAffordances: [],
  });
  assert.ok(feedbackPlan.mappings.some((row) => row.id === 'visual.operator.control-feedback.v1'));
  assert.ok(feedbackPlan.uniforms.bySlot.feedback > 0);
});

test('object shader does not use the WGSL reserved word active as an identifier', () => {
  const objectShader = fs.readFileSync(
    path.join(publicDir, 'blank/pipeline/phase-07-render/simulatte-webgpu-renderer-object-shader.js'),
    'utf8'
  );
  assert.doesNotMatch(objectShader, /\blet active\b/);
});

test('Doppler residual intent cannot select a model outside the numbered runtime lock', () => {
  const runtime = runtimeSource('simulatte-doppler-intent.js');

  assert.doesNotMatch(runtime, /importDopplerModule|chatText|DEFAULT_MODULE_URL|DEFAULT_KERNEL_BASE_PATH/);
  assert.doesNotMatch(runtime, /urlValue|urlFlag|new URLSearchParams/);
  assert.doesNotMatch(runtime, /http:|https:/);
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

test('runtime progress bus reduces granular producer events into one observable state', () => {
  const frames = [];
  const seen = [];
  const controller = runtimeProgressApi.createController({
    view: {
      requestAnimationFrame(callback) {
        frames.push(callback);
        return frames.length;
      },
      location: { search: '' },
      console: { info() {} },
    },
  });
  controller.subscribe((state) => seen.push(state), { replay: false });

  const cacheState = controller.publish({
    source: 'simulatte-model-cache',
    state: 'active',
    stage: 'cache-fill',
    completedBytes: 50,
    totalBytes: 100,
    canvasLoading: true,
  });
  controller.publish({
    state: 'active',
    stage: 'span-embed',
    embeddedSpanCount: 2,
    spanCount: 4,
  });

  assert.equal(frames.length, 1);
  assert.equal(seen.length, 0);
  assert.equal(cacheState.schema, 'simulatte.runtimeProgressState.v2');
  assert.equal(cacheState.phase.id, 'prompt-runtime');
  assert.equal(cacheState.progress, 50);
  assert.equal(cacheState.sourceProgress, 15);
  assert.equal(cacheState.overallProgress, 0);
  assert.equal(cacheState.progressBasis, 'measured-work');
  assert.equal(cacheState.line, 'Downloading model weights 50% - network - 50 B / 100 B');
  assert.equal(cacheState.label, 'Downloading model weights');
  assert.equal(cacheState.subline, 'network - 50 B / 100 B - 45s estimated remaining');
  assert.equal(cacheState.byteText, '50 B / 100 B');
  assert.equal(cacheState.sourceText, 'network');
  assert.equal(cacheState.byteProgress, 'known');
  assert.equal(cacheState.loaderReceipt.schema, 'simulatte.loaderPhaseReceipt.v2');
  assert.equal(cacheState.loaderReceipt.status, 'active');
  assert.equal(cacheState.loaderReceipt.percentStart, 0);
  assert.equal(cacheState.loaderReceipt.percentEnd, 50);
  assert.equal(cacheState.loaderReceipt.completedBytes, 50);
  assert.equal(cacheState.loaderReceipt.totalBytes, 100);
  controller.flush();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].phase.id, 'retrieval');
  assert.equal(seen[0].progress, 50);
  assert.equal(seen[0].sourceProgress, 49);
  assert.equal(seen[0].line, 'Embedding prompt spans 50%');
});

test('runtime progress logs every visible transition as a benchmarkable receipt', () => {
  const consoleRows = [];
  const view = {
    __simulatteNow: 1000,
    requestAnimationFrame() {
      return 1;
    },
    location: { search: '' },
    console: {
      info(...args) {
        consoleRows.push(args);
      },
    },
  };
  const controller = runtimeProgressApi.createController({ view });

  controller.publish({
    runId: 'timed-run',
    state: 'active',
    stage: 'cache-fill',
    message: 'Caching embedding model',
    percent: 20,
    completedBytes: 100,
    totalBytes: 400,
    resourceKind: 'embedding-model',
    cacheMode: 'opfs',
    timestamp: 1000,
  });
  controller.publish({
    runId: 'timed-run',
    stage: 'cache-storage',
    message: 'Passive cache detail',
    nonBlocking: true,
    timestamp: 1200,
  });
  controller.publish({
    runId: 'timed-run',
    state: 'active',
    stage: 'model-load',
    message: 'Loading embedding model',
    percent: 70,
    completedBytes: 400,
    totalBytes: 400,
    resourceKind: 'embedding-model',
    cacheMode: 'opfs',
    operationId: 2,
    queueDepth: 2,
    queueWaitMs: 700,
    timestamp: 2000,
  });

  assert.equal(consoleRows.length, 2);
  assert.match(consoleRows[0][0], /^\[Simulatte\]\[Progress\] #1 /);
  assert.equal(consoleRows[0][1].schema, 'simulatte.runtimeProgressLog.v2');
  assert.equal(consoleRows[0][1].runId, 'timed-run');
  assert.equal(consoleRows[0][1].stage, 'runtime.cache.file');
  assert.equal(consoleRows[0][1].runElapsedMs, 0);
  assert.equal(consoleRows[1][1].sequence, 2);
  assert.equal(consoleRows[1][1].transitionMs, 1000);
  assert.equal(consoleRows[1][1].runElapsedMs, 1000);
  assert.equal(consoleRows[1][1].resource.completedBytes, 400);
  assert.equal(consoleRows[1][1].resource.totalBytes, 400);
  assert.equal(consoleRows[1][1].resource.operationId, 2);
  assert.equal(consoleRows[1][1].resource.queueDepth, 2);
  assert.equal(consoleRows[1][1].timing.queueWaitMs, 700);
  assert.equal(controller.logs().length, 2);
  assert.equal(view.__simulatteRuntimeProgressLogs.length, 2);
});

test('runtime progress logs detailed reranker updates even when the visible line is unchanged', () => {
  const consoleRows = [];
  const view = {
    requestAnimationFrame() {
      return 1;
    },
    location: { search: '' },
    console: { info(...args) { consoleRows.push(args); } },
  };
  const controller = runtimeProgressApi.createController({ view });
  const base = {
    runId: 'rerank-run',
    state: 'active',
    stage: 'slot-model-rerank',
    percent: 96,
    slotId: 'slot.actor.cat',
    total: 2,
    candidateCount: 2,
  };
  controller.publish({
    ...base,
    message: 'Reranking scene slot 2/8 candidate 1/2',
    candidateId: 'cat',
    completed: 1,
    promptTokenCount: 93,
    prefixTokenCount: 70,
    executionDurationMs: 812.5,
  });
  controller.publish({
    ...base,
    message: 'Reranking scene slot 2/8 candidate 2/2',
    candidateId: 'caterpillar',
    completed: 2,
    promptTokenCount: 91,
    prefixTokenCount: 70,
    prefixPreparationDurationMs: 2.75,
    prefixTokenizationDurationMs: 2.5,
    prefixResetDurationMs: 0.25,
    prefixPrimingDurationMs: 720.5,
    executionDurationMs: 779.25,
  });

  assert.equal(consoleRows.length, 2);
  assert.match(consoleRows[0][0], /candidate 1\/2/);
  assert.match(consoleRows[1][0], /candidate 2\/2/);
  assert.equal(consoleRows[1][1].detail, 'Reranking scene slot 2/8 candidate 2/2');
  assert.equal(consoleRows[1][1].reranker.candidateId, 'caterpillar');
  assert.equal(consoleRows[1][1].reranker.completed, 2);
  assert.equal(consoleRows[1][1].reranker.prefixPreparationDurationMs, 2.75);
  assert.equal(consoleRows[1][1].reranker.prefixTokenizationDurationMs, 2.5);
  assert.equal(consoleRows[1][1].reranker.prefixResetDurationMs, 0.25);
  assert.equal(consoleRows[1][1].reranker.prefixPrimingDurationMs, 720.5);
  assert.equal(consoleRows[1][1].reranker.executionDurationMs, 779.25);
});

test('runtime progress keeps passive cache receipts out of the visible run line', () => {
  const controller = runtimeProgressApi.createController({
    view: {
      requestAnimationFrame(callback) {
        return setTimeout(callback, 0);
      },
      location: { search: '' },
      console: { info() {} },
    },
  });

  const active = controller.publish({
    state: 'active',
    stage: 'prompt-embed',
    percent: 82,
    message: 'Embedding prompt',
    canvasLoading: true,
  });
  const passiveDuringRun = controller.publish({
    source: 'simulatte-model-cache',
    stage: 'cache-storage',
    message: 'Persistent model storage requested',
    nonBlocking: true,
    canvasLoading: false,
    cacheBackends: ['opfs'],
  });

  assert.equal(passiveDuringRun.state, 'active');
  assert.equal(passiveDuringRun.blocking, true);
  assert.equal(passiveDuringRun.canvasLoading, true);
  assert.equal(passiveDuringRun.stage, active.stage);
  assert.equal(passiveDuringRun.line, active.line);
  assert.equal(passiveDuringRun.resource.cacheBackends, 'opfs');

  const ready = controller.publish({
    state: 'ready',
    stage: 'ready',
    percent: 100,
    message: 'Ready',
    canvasLoading: false,
  });
  const passiveAfterReady = controller.publish({
    source: 'simulatte-model-cache',
    stage: 'cache-storage',
    message: 'Persistent model storage requested',
    nonBlocking: true,
    canvasLoading: false,
    durationMs: 42,
  });

  assert.equal(ready.line, 'Ready 100%');
  assert.equal(passiveAfterReady.state, 'ready');
  assert.equal(passiveAfterReady.stage, ready.stage);
  assert.equal(passiveAfterReady.progress, 100);
  assert.equal(passiveAfterReady.line, 'Ready 100%');
  assert.equal(passiveAfterReady.timing.durationMs, 42);
});

test('runtime progress ignores late active events for a completed run', () => {
  const controller = runtimeProgressApi.createController({
    view: {
      requestAnimationFrame(callback) {
        return setTimeout(callback, 0);
      },
      location: { search: '' },
      console: { info() {} },
    },
  });

  controller.publish({
    runId: 'run-a',
    state: 'active',
    stage: 'prompt-embed',
    percent: 82,
    message: 'Embedding prompt',
    canvasLoading: true,
  });
  const ready = controller.publish({
    runId: 'run-a',
    state: 'ready',
    stage: 'ready',
    percent: 100,
    message: 'Ready',
    canvasLoading: false,
  });
  const late = controller.publish({
    runId: 'run-a',
    state: 'active',
    stage: 'model-load',
    percent: 75,
    message: 'Loading embeddings',
    canvasLoading: true,
  });
  const nextRun = controller.publish({
    runId: 'run-b',
    state: 'active',
    stage: 'manifest',
    percent: 1,
    message: 'Loading embeddings',
    canvasLoading: true,
  });

  assert.equal(ready.state, 'ready');
  assert.equal(late.state, 'ready');
  assert.equal(late.progress, 100);
  assert.equal(late.blocking, false);
  assert.equal(nextRun.state, 'active');
  assert.equal(nextRun.runId, 'run-b');
  assert.equal(nextRun.blocking, true);
});

test('runtime progress uses measured task work separately from legacy run percent', () => {
  const controller = runtimeProgressApi.createController({
    view: {
      requestAnimationFrame(callback) {
        return setTimeout(callback, 0);
      },
      location: { search: '' },
      console: { info() {} },
    },
  });

  const state = controller.publish({
    source: 'simulatte-model-cache',
    state: 'active',
    stage: 'cache-fill',
    percent: 66,
    file: 'shard_00001.bin',
    completedBytes: 50,
    totalBytes: 100,
    canvasLoading: true,
  });

  assert.equal(state.phase.id, 'prompt-runtime');
  assert.equal(state.progress, 50);
  assert.equal(state.sourceProgress, 66);
  assert.equal(state.line, 'Downloading model weights 50% - network - shard_00001.bin - 50 B / 100 B');
  assert.equal(state.subline, 'network - shard_00001.bin - 50 B / 100 B - 45s estimated remaining');
});

test('runtime progress resets for a transitional task while source progress stays monotonic', () => {
  const controller = runtimeProgressApi.createController({
    view: {
      requestAnimationFrame(callback) {
        return setTimeout(callback, 0);
      },
      location: { search: '' },
      console: { info() {} },
    },
  });

  controller.publish({
    runId: 'run-a',
    state: 'active',
    stage: 'model-load',
    percent: 94,
    canvasLoading: true,
  });
  const rerankerCache = controller.publish({
    runId: 'run-a',
    state: 'active',
    stage: 'cache-fill',
    percent: 24,
    file: 'reranker-shard.bin',
    completedBytes: 10,
    totalBytes: 100,
    canvasLoading: true,
  });
  const nextRun = controller.publish({
    runId: 'run-b',
    state: 'active',
    stage: 'manifest',
    percent: 1,
    canvasLoading: true,
  });

  assert.equal(rerankerCache.progress, 10);
  assert.equal(rerankerCache.sourceProgress, 94);
  assert.equal(rerankerCache.line, 'Downloading reranker model 10% - network - reranker-shard.bin - 10 B / 100 B');
  assert.equal(rerankerCache.label, 'Downloading reranker model');
  assert.equal(
    rerankerCache.subline,
    'network - reranker-shard.bin - 10 B / 100 B - 45s estimated remaining'
  );
  assert.equal(nextRun.progress, 0);
  assert.equal(nextRun.sourceProgress, 1);
});

test('runtime progress learns task duration and still starts the next task at zero', () => {
  const controller = runtimeProgressApi.createController({
    view: {
      requestAnimationFrame() {
        return 1;
      },
      location: { search: '' },
      console: { info() {} },
    },
  });

  controller.publish({
    runId: 'profile-a',
    state: 'active',
    stage: 'model-load',
    percent: 70,
    timestamp: 1000,
  });
  const visual = controller.publish({
    runId: 'profile-a',
    state: 'active',
    stage: 'visual',
    percent: 96,
    timestamp: 3000,
  });
  controller.publish({
    runId: 'profile-a',
    state: 'ready',
    stage: 'ready',
    percent: 100,
    timestamp: 3500,
  });

  assert.equal(visual.progress, 0);
  assert.equal(controller.timingProfile().tasks['runtime.model.load'].averageDurationMs, 2000);

  const nextStart = controller.publish({
    runId: 'profile-b',
    state: 'active',
    stage: 'model-load',
    percent: 70,
    timestamp: 4000,
  });
  const nextUpdate = controller.publish({
    runId: 'profile-b',
    state: 'active',
    stage: 'model-load',
    percent: 70,
    timestamp: 5000,
  });

  assert.equal(nextStart.progress, 0);
  assert.equal(nextStart.taskExpectedDurationMs, 2000);
  assert.equal(nextUpdate.progress, 50);
  assert.equal(nextUpdate.taskElapsedMs, 1000);
  const firstModelReceipt = controller.receipts().find((receipt) => (
    receipt.runId === 'profile-a' && receipt.stage === 'runtime.model.load'
  ));
  assert.equal(firstModelReceipt.percentStart, 0);
  assert.equal(firstModelReceipt.percentEnd, 100);
});

test('runtime cache hit completes the cache-read task instead of creating a task at one hundred', () => {
  const controller = runtimeProgressApi.createController({
    view: {
      requestAnimationFrame() {
        return 1;
      },
      location: { search: '' },
      console: { info() {} },
    },
  });
  const start = controller.publish({
    runId: 'cache-run',
    state: 'active',
    stage: 'cache-read',
    resourceKind: 'embedding-model',
    timestamp: 1000,
  });
  const hit = controller.publish({
    runId: 'cache-run',
    state: 'active',
    stage: 'cache-hit',
    resourceKind: 'embedding-model',
    completedBytes: 400,
    totalBytes: 400,
    timestamp: 1100,
  });

  assert.equal(start.progress, 0);
  assert.equal(hit.progress, 100);
  assert.equal(start.taskKey, 'runtime.cache.read:embedding-model');
  assert.equal(hit.taskKey, start.taskKey);
  assert.equal(controller.receipts().length, 1);
  assert.equal(controller.receipts()[0].percentStart, 0);
});

test('runtime progress heartbeat advances elapsed-time task progress', () => {
  const scheduled = [];
  const frames = [];
  const view = {
    __simulatteNow: 1000,
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    setTimeout(callback, delay) {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    clearTimeout() {},
    location: { search: '' },
    console: { info() {} },
  };
  const controller = runtimeProgressApi.createController({ view });
  controller.publish({
    state: 'active',
    stage: 'cache-fill',
    percent: 30,
    canvasLoading: true,
    timestamp: 1000,
  });
  controller.flush();

  assert.equal(scheduled[0].delay, 900);
  view.__simulatteNow = 2600;
  scheduled[0].callback();

  const state = controller.state();
  assert.equal(state.progress, 4);
  assert.equal(state.sourceProgress, 30);
  assert.equal(state.progressBasis, 'elapsed-time-forecast');
  assert.equal(state.taskElapsedMs, 1600);
  assert.equal(state.line, 'Downloading model weights 4% - network');
  assert.equal(state.heartbeatLine, 'Still downloading model weights 4% - network');
  assert.equal(state.displayLine, 'Still downloading model weights 4% - network');
  assert.equal(state.byteProgress, 'unknown');
  assert.equal(state.silenceMs, 1600);
  assert.equal(controller.performanceLogs().some((row) => row.kind === 'heartbeat-handler'), true);

  const node = {
    dataset: {},
    style: { setProperty() {} },
    ownerDocument: { documentElement: { dataset: {} } },
  };
  const title = {};
  const percent = {};
  const fill = { style: {} };
  runtimeProgressApi.createRuntimeStripObserver({ node, title, percent, fill })(state);

  assert.equal(node.dataset.heartbeat, 'true');
  assert.equal(node.dataset.activity, 'downloading model weights');
  assert.equal(node.dataset.byteProgress, 'unknown');
  assert.equal(title.textContent, 'Still downloading model weights 4% - network');
  assert.equal(percent.textContent, '4%');
  assert.match(node.dataset.subline, /^network - 1\.6s elapsed,/);
  assert.equal(node.dataset.taskProgress, '4');
  assert.equal(node.dataset.sourceProgress, '30');
  assert.equal(node.dataset.loaderReceipt.includes('simulatte.loaderPhaseReceipt.v2'), true);
});

test('runtime progress emits loader phase receipts with completion and duration', () => {
  const controller = runtimeProgressApi.createController({
    view: {
      requestAnimationFrame(callback) {
        return setTimeout(callback, 0);
      },
      location: { search: '' },
      console: { info() {} },
    },
  });

  controller.publish({
    runId: 'run-a',
    state: 'active',
    stage: 'cache-fill',
    percent: 44,
    resourceKind: 'embedding-model',
    file: 'embedding.safetensors',
    completedBytes: 312 * 1024 * 1024,
    totalBytes: 1200 * 1024 * 1024,
    cacheMode: 'reload',
    canvasLoading: true,
    timestamp: 1000,
  });
  controller.publish({
    runId: 'run-a',
    state: 'active',
    stage: 'model-load',
    percent: 72,
    resourceKind: 'embedding-model',
    canvasLoading: true,
    timestamp: 1800,
  });
  controller.publish({
    runId: 'run-a',
    state: 'ready',
    stage: 'ready',
    percent: 100,
    canvasLoading: false,
    timestamp: 2600,
  });

  const receipts = controller.receipts();
  assert.equal(receipts[0].schema, 'simulatte.loaderPhaseReceipt.v2');
  assert.equal(receipts[0].label, 'Downloading embedding model');
  assert.equal(receipts[0].status, 'complete');
  assert.equal(receipts[0].durationMs, 800);
  assert.equal(receipts[0].percentStart, 0);
  assert.equal(receipts[0].percentEnd, 100);
  assert.equal(receipts[0].completedBytes, 312 * 1024 * 1024);
  assert.equal(receipts[0].totalBytes, 1200 * 1024 * 1024);
  assert.equal(receipts[0].sourceText, 'network');
  assert.equal(receipts[0].byteText, '312 MB / 1.2 GB');
  assert.equal(receipts[1].label, 'Loading embedding model');
  assert.equal(receipts[1].status, 'complete');
  assert.equal(receipts[1].durationMs, 800);
  assert.equal(receipts[2].status, 'complete');
});

test('WebGPU scene ids and object-part contracts cover emitted visual artifacts', () => {
  const { SCENE_IDS: sceneIds } = require(path.join(
    publicDir,
    'blank',
    'pipeline',
    'phase-06-visual',
    'simulatte-scene-packet-contract.js'
  ));
  assert.equal(sceneIds.cryosphere, sceneIds['ocean-cryosphere']);
  assert.notEqual(sceneIds['material-tray'], sceneIds['chemistry-lab']);
  assert.notEqual(sceneIds['cultural-material'], sceneIds.granular);
});

test('pipeline phases consume only neighboring compiled artifacts after intent grounding', () => {
  const model = runtimeSource('simulatte-physics-model.js');
  const physicsIR = runtimeSource('simulatte-physics-ir.js');
  const composition = runtimeSource('simulatte-composition-graph.js');
  const webgpu = runtimeSource('simulatte-webgpu-renderer.js');
  const visualOperatorCompiler = runtimeSource('simulatte-visual-operator-compiler.js');

  assert.doesNotMatch(physicsIR, /input\.prompt \|\| universeGraph\.prompt/);
  assert.doesNotMatch(model, /function createRenderExecutionInput\(/);
  assert.doesNotMatch(model, /function renderObligationProof\(/);
  assert.doesNotMatch(composition, /\b(?:universeGraph|promptParse|physicsIR)\b/);
  assert.doesNotMatch(composition, /const intent = spec\.intent/);
  assert.doesNotMatch(composition, /intent\.conceptGraph/);
  assert.doesNotMatch(composition, /spec\.intent\.synthesis/);
  assert.doesNotMatch(composition, /spec\.intent\.prompt/);
  assert.doesNotMatch(composition, /spec\.intent\.intentBrief/);
  assert.doesNotMatch(composition, /spec\.prompt(?!Parse)/);
  assert.doesNotMatch(composition, /spec\.renderProgram/);

  assert.doesNotMatch(webgpu, /spec\.intent/);
  assert.doesNotMatch(webgpu, /renderProgram/);
  assert.doesNotMatch(webgpu, /renderIR/);
  assert.doesNotMatch(webgpu, /retrieval/);
  assert.doesNotMatch(webgpu, /intent\.semanticRag|intent\.cardMatches|intent\.surfaceCards/);
  assert.doesNotMatch(visualOperatorCompiler, /physicsIR\.prompt|renderIR\.prompt|physicalSpec\.prompt/);
  assert.doesNotMatch(model, /spec\.intent && spec\.intent\.resolution/);
  assert.doesNotMatch(model, /spec\.intent && spec\.intent\.prompt/);
  assert.doesNotMatch(model, /applyPromptParameterHints\(intent\.prompt/);
});

test('composition shape inference does not classify catalog provenance as cats', () => {
  const graph = runtimeSource('simulatte-composition-graph.js');

  assert.ok(graph.includes('/\\b(mouse|gerbil|hamster|dog|cat|animal|organism)\\b/'));
  assert.doesNotMatch(graph, /\/mouse\|gerbil\|hamster\|dog\|cat\|animal\|organism\//);
});

test('model-backed intent retrieval indexes bind to the runtime lock and keep the unqualified reranker disabled', () => {
  const manifestPath = path.join(root, 'public', 'data', 'simulatte-embedder', 'manifest.json');
  const indexPath = path.join(root, 'public', 'data', 'simulatte-embedder', 'primitive-index-v2.json');
  const cardIndexPath = path.join(root, 'public', 'data', 'simulatte-embedder', 'surface-card-index-qwen-v1.json');
  const intentEvidencePath = path.join(root, 'public', 'data', 'simulatte-embedder', 'intent-evidence-contract-v1.json');
  const retiredEmbeddingGemmaCardIndexPath = path.join(root, 'public', 'data', 'simulatte-embedder', 'surface-card-index-embeddinggemma-v1.json');
  const retiredCardIndexPath = path.join(root, 'public', 'data', 'simulatte-embedder', 'surface-card-index-v1.json');
  const retiredIndexPath = path.join(root, 'public', 'data', 'simulatte-embedder', 'primitive-index-v1.json');
  const retiredEncoderPath = path.join(root, 'public', 'data', 'simulatte-intent-embed-v1.json');
  const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const modelRuntimeLock = JSON.parse(fs.readFileSync(
    path.join(root, 'public', 'data', 'simulatte-embedder', 'model-runtime-lock.json'),
    'utf8'
  ));
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const cardIndex = JSON.parse(fs.readFileSync(cardIndexPath, 'utf8'));
  const packedBytes = Buffer.from(index.embeddingsPackedBase64, 'base64');
  const cardPackedBytes = Buffer.from(cardIndex.embeddingsPackedBase64, 'base64');
  const embedding = modelRuntimeLock.embedding;
  const reranker = modelRuntimeLock.reranker;

  assert.equal(Object.hasOwn(rawManifest, 'embedModel'), false);
  assert.equal(Object.hasOwn(rawManifest, 'reranker'), false);
  assert.equal(Object.hasOwn(rawManifest, 'runtime'), false);
  assert.equal(Object.hasOwn(rawManifest, 'runtimeOrder'), false);
  assert.equal(Object.hasOwn(rawManifest, 'cache'), false);
  assert.equal(Object.hasOwn(rawManifest, 'fallback'), false);
  assert.equal(
    rawManifest.retrieval.artifactHash.hex,
    crypto.createHash('sha256').update(fs.readFileSync(indexPath)).digest('hex')
  );
  assert.equal(
    rawManifest.retrieval.cards.artifactHash.hex,
    crypto.createHash('sha256').update(fs.readFileSync(cardIndexPath)).digest('hex')
  );
  assert.equal(
    rawManifest.retrieval.intentEvidence.artifactHash.hex,
    crypto.createHash('sha256').update(fs.readFileSync(intentEvidencePath)).digest('hex')
  );
  if (reranker.qualification.promotionEligible !== true) {
    assert.equal(reranker.enabled, false);
    assert.equal(reranker.required, false);
  }

  const embeddingConversion = JSON.parse(fs.readFileSync(
    path.join(root, 'public', 'vendor', 'doppler', 'src', 'config', 'conversion', 'qwen3', 'qwen-3-embedding-0-6b-q4k-ehf16-af32.json'),
    'utf8'
  ));
  const rerankerConversion = JSON.parse(fs.readFileSync(
    path.join(root, 'public', 'vendor', 'doppler', 'src', 'config', 'conversion', 'qwen3', 'qwen-3-reranker-0-6b-q4k-ehf16-af32.json'),
    'utf8'
  ));
  assert.equal(
    embedding.runtimeConfig.inference.session.kvcache.kvDtype,
    embeddingConversion.session.kvcache.kvDtype
  );
  assert.equal(
    reranker.runtimeConfig.inference.session.kvcache.kvDtype,
    rerankerConversion.session.kvcache.kvDtype
  );
  assert.equal(embedding.manifestHash.hex, index.embedModelHash.hex);
  assert.equal(embedding.manifestHash.hex, cardIndex.embedModelHash.hex);
  assert.equal(index.embeddingDim, embedding.dimensions);
  assert.equal(index.documents.length, catalog.PHYSICAL_PRIMITIVES.length);
  assert.equal(index.documentCount, catalog.PHYSICAL_PRIMITIVES.length);
  assert.equal(packedBytes.byteLength, index.documents.length * index.embeddingDim * 4);
  assert.equal(cardIndex.embeddingDim, embedding.dimensions);
  assert.equal(cardPackedBytes.byteLength, cardIndex.documents.length * cardIndex.embeddingDim * 4);
  assert.equal(fs.existsSync(retiredEmbeddingGemmaCardIndexPath), false);
  assert.equal(fs.existsSync(retiredCardIndexPath), false);
  assert.equal(fs.existsSync(retiredIndexPath), false);
  assert.equal(fs.existsSync(retiredEncoderPath), false);

  const workerShimPath = path.join(root, 'public', 'simulatte-model-cache-sw.js');
  const workerPath = path.join(root, 'public', 'workers', 'simulatte-model-cache-sw.js');
  assert.equal(fs.existsSync(workerShimPath), false);
  assert.equal(fs.existsSync(workerPath), false);
});

test('model slot reranking stays in its own loaded Phase 3 retrieval shard', () => {
  const span = fs.readFileSync(path.join(
    root, 'public', 'blank', 'pipeline', 'phase-03-retrieval', 'simulatte-intent-embedder-span-retrieval.js'
  ), 'utf8');
  const rerank = fs.readFileSync(path.join(
    root, 'public', 'blank', 'pipeline', 'phase-03-retrieval', 'simulatte-intent-embedder-slot-rerank.js'
  ), 'utf8');
  const scripts = runtimeScriptManifest.browser;
  const slotIndex = scripts.indexOf('pipeline/phase-03-retrieval/simulatte-intent-embedder-slot-retrieval.js');
  const rerankIndex = scripts.indexOf('pipeline/phase-03-retrieval/simulatte-intent-embedder-slot-rerank.js');
  const cacheIndex = scripts.indexOf('pipeline/phase-03-retrieval/simulatte-intent-embedder-manifest-cache.js');

  assert.ok(slotIndex >= 0 && rerankIndex > slotIndex && cacheIndex > rerankIndex);
  assert.doesNotMatch(span, /function rerankSlotCandidates/);
  assert.match(rerank, /function rerankSlotCandidates/);
});

test('Phase 6 composition accepts semantic authority only from its Phase 5 render boundary', () => {
  const phase6Root = path.join(root, 'public', 'blank', 'pipeline', 'phase-06-visual');
  const sources = fs.readdirSync(phase6Root)
    .filter((file) => file.endsWith('.js'))
    .map((file) => fs.readFileSync(path.join(phase6Root, file), 'utf8'))
    .join('\n');

  assert.doesNotMatch(sources, /\b(?:universeGraph|promptParse|physicsIR)\b/);
});

test('pipeline phases load Phase 3 retrieval boundary checks before retrieval work', () => {
  const boundary = 'pipeline/phase-05-simulation/simulatte-physics-model-phase-retrieval-boundary.js';
  const retrieval = 'pipeline/phase-05-simulation/simulatte-physics-model-phase-retrieval.js';
  const model = fs.readFileSync(path.join(
    root, 'public', 'blank', 'pipeline', 'phase-05-simulation', 'simulatte-physics-model.js'
  ), 'utf8');

  assert.ok(runtimeScriptManifest.browser.indexOf(boundary) >= 0);
  assert.ok(runtimeScriptManifest.browser.indexOf(boundary) < runtimeScriptManifest.browser.indexOf(retrieval));
  assert.match(model, /require\('\.\/simulatte-physics-model-phase-retrieval-boundary\.js'\);/);
  assert.match(model, /require\('\.\/simulatte-physics-model-phase-retrieval\.js'\);/);
});

test('product path removed the parallel world planner and legacy pipeline export', () => {
  const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');

  assert.equal(Object.hasOwn(model, 'createLegacySpecFromPrompt'), false);
});
