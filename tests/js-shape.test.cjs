const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const runtimeScriptManifest = require(path.join(publicDir, 'app', 'runtime-script-manifest.js'));
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
    path.join(publicDir, 'app'),
    path.join(publicDir, 'pipeline'),
    path.join(publicDir, 'workers'),
  ].flatMap((dir) => jsFiles(dir));
}

test('public javascript keeps lines below the repository ceiling', () => {
  const styleGuide = fs.readFileSync(path.join(root, 'STYLE_GUIDE.md'), 'utf8');

  assert.match(styleGuide, /JavaScript source files have a strict 999-line limit/);
  assert.match(styleGuide, /Split any JavaScript file before it reaches 1,000 lines/);

  for (const file of publicRuntimeJsFiles()) {
    const rel = path.relative(root, file);
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    assert.ok(
      lines.length <= 999,
      `${rel} has ${lines.length} lines`
    );
  }
});

test('runtime source is owned by app, pipeline, data, and worker directories', () => {
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
    'loading-canvas.js',
    'runtime-progress.js',
    'simulatte-physics-model.js',
    'prompt-controller.js',
    'simulation-lab.js',
    'prompt-review-bridge.js',
  ];

  for (const name of expected) {
    assert.ok(fs.existsSync(runtimeFile(name)), `${name} should exist`);
  }
  for (const retired of ['js', 'models', 'src']) {
    assert.equal(fs.existsSync(path.join(publicDir, retired)), false, `public/${retired} should be retired`);
  }

  const coordinatorLines = runtimeSource('simulation-lab.js').split(/\r?\n/);
  assert.ok(coordinatorLines.length < 80);
});

test('app product boundaries use loading prompt simulation and pipeline directories', () => {
  const retiredGameRoot = path.join(publicDir, 'app', 'game');
  const retiredShellRoot = path.join(publicDir, 'app', 'shell');
  const retiredExperienceRoot = path.join(publicDir, 'app', 'experience');
  const retiredBootRoot = path.join(publicDir, 'app', 'boot');
  const retiredStartRoot = path.join(publicDir, 'app', 'start');
  const retiredWorldSessionRoot = path.join(publicDir, 'app', 'world-session');
  const retiredViewRoot = path.join(publicDir, 'app', 'view');
  const retiredDrawingRoot = path.join(publicDir, 'app', 'drawing');
  const retiredUiRoot = path.join(publicDir, 'app', 'ui');
  const retiredLabRoot = path.join(publicDir, 'app', 'lab');
  const retiredSessionRoot = path.join(publicDir, 'app', 'session');
  const retiredControlsRoot = path.join(publicDir, 'app', 'controls');
  const retiredGraphicsRoot = path.join(publicDir, 'app', 'graphics');
  const retiredCompilerRoot = path.join(publicDir, 'compiler');
  const retiredRenderRoot = path.join(publicDir, 'app', 'render');
  const retiredUiRenderRoot = path.join(publicDir, 'app', 'ui', 'render');
  const loadingRoot = path.join(publicDir, 'app', 'loading');
  const runtimeRoot = path.join(publicDir, 'app', 'runtime');
  const promptRoot = path.join(publicDir, 'app', 'prompt');
  const simulationRoot = path.join(publicDir, 'app', 'simulation');
  const pipelineRoot = path.join(publicDir, 'pipeline');
  const appRoot = path.join(publicDir, 'app');
  const appMain = fs.readFileSync(path.join(appRoot, 'main.js'), 'utf8');
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

  assert.equal(fs.existsSync(retiredGameRoot), false, 'public/app/game should be retired');
  assert.equal(fs.existsSync(retiredShellRoot), false, 'public/app/shell should be retired');
  assert.equal(fs.existsSync(retiredExperienceRoot), false, 'public/app/experience should be retired');
  assert.equal(fs.existsSync(retiredBootRoot), false, 'public/app/boot should be retired');
  assert.equal(fs.existsSync(retiredStartRoot), false, 'public/app/start should be retired');
  assert.equal(fs.existsSync(retiredWorldSessionRoot), false, 'public/app/world-session should be retired');
  assert.equal(fs.existsSync(retiredViewRoot), false, 'public/app/view should be retired');
  assert.equal(fs.existsSync(retiredDrawingRoot), false, 'public/app/drawing should be retired');
  assert.equal(fs.existsSync(retiredUiRoot), false, 'public/app/ui should be retired');
  assert.equal(fs.existsSync(retiredLabRoot), false, 'public/app/lab should be retired');
  assert.equal(fs.existsSync(retiredSessionRoot), false, 'public/app/session should be retired');
  assert.equal(fs.existsSync(retiredControlsRoot), false, 'public/app/controls should be retired');
  assert.equal(fs.existsSync(retiredGraphicsRoot), false, 'public/app/graphics should be retired');
  assert.equal(fs.existsSync(retiredCompilerRoot), false, 'public/compiler should be retired');
  assert.equal(fs.existsSync(retiredRenderRoot), false, 'public/app/render should be retired');
  assert.equal(fs.existsSync(retiredUiRenderRoot), false, 'public/app/ui/render should be retired');
  assert.ok(fs.existsSync(path.join(appRoot, 'main.js')));
  assert.ok(fs.existsSync(path.join(appRoot, 'version-guard.js')));
  assert.ok(fs.existsSync(path.join(loadingRoot, 'loading-canvas.js')));
  assert.ok(fs.existsSync(path.join(runtimeRoot, 'runtime-progress.js')));
  assert.ok(fs.existsSync(path.join(promptRoot, 'prompt-controller.js')));
  assert.ok(fs.existsSync(path.join(promptRoot, 'prompt-review-bridge.js')));
  assert.ok(fs.existsSync(path.join(simulationRoot, 'simulation-lab.js')));
  assert.ok(fs.existsSync(path.join(pipelineRoot, 'phase-07-render', 'simulatte-webgpu-renderer.js')));
  assert.match(appMain, /runtimeManifest\.browser/);
  assert.ok(runtimeScriptManifest.browser.includes('app/prompt/prompt-controller.js'));
  assert.ok(runtimeScriptManifest.browser.includes('app/runtime/runtime-progress.js'));
  assert.ok(runtimeScriptManifest.browser.includes('app/simulation/simulation-lab.js'));
  assert.doesNotMatch(appMain, /from '\.\/render\//);
  assert.match(html, /src="\.\/app\/loading\/loading-canvas\.js\?v=[^"]+"/);
  assert.match(html, /src="\.\/app\/runtime\/runtime-progress\.js\?v=[^"]+"/);
  assert.match(html, /src="\.\/app\/prompt\/prompt-controller\.js\?v=[^"]+"/);
  assert.match(html, /src="\.\/app\/simulation\/simulation-lab\.js\?v=[^"]+"/);
  assert.match(html, /src="\.\/app\/prompt\/prompt-review-bridge\.js\?v=[^"]+"/);
  assert.match(html, /src="\.\/app\/main\.js\?v=[^"]+"/);
  assert.match(html, /src="\.\/app\/version-guard\.js\?v=[^"]+"/);
  assert.match(html, /src="\.\/pipeline\/phase-07-render\/simulatte-webgpu-renderer\.js\?v=[^"]+"/);
  const buildStamp = html.match(/<meta name="simulatte-build" content="([^"]+)">/)[1];
  const deferredScripts = Array.from(html.matchAll(/<script defer src="([^"]+)"><\/script>/g))
    .map((match) => match[1]);
  assert.ok(deferredScripts.length > 40);
  const deferredScriptPaths = deferredScripts.map((src) => src.replace(/^\.\//, '').replace(/\?v=.*$/, ''));
  assert.deepEqual(deferredScriptPaths, [
    'app/runtime-script-manifest.js',
    ...runtimeScriptManifest.browser,
    'app/main.js',
    'app/version-guard.js',
  ]);
  for (const relativePath of new Set([
    ...runtimeScriptManifest.browser,
    ...runtimeScriptManifest.pipelineWorker,
    ...runtimeScriptManifest.intentWorker,
  ])) {
    assert.ok(fs.existsSync(path.join(publicDir, relativePath)), `runtime script missing ${relativePath}`);
  }
  deferredScripts.forEach((src) => {
    assert.match(src, new RegExp(`\\?v=${buildStamp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  });
  assert.doesNotMatch(html, /src="\.\/app\/shell\//);
  assert.doesNotMatch(html, /src="\.\/app\/experience\//);
  assert.doesNotMatch(html, /src="\.\/app\/boot\//);
  assert.doesNotMatch(html, /src="\.\/app\/start\//);
  assert.doesNotMatch(html, /src="\.\/app\/world-session\//);
  assert.doesNotMatch(html, /src="\.\/app\/view\//);
  assert.doesNotMatch(html, /src="\.\/app\/ui\//);
  assert.doesNotMatch(html, /src="\.\/app\/lab\//);
  assert.doesNotMatch(html, /src="\.\/app\/session\//);
  assert.doesNotMatch(html, /src="\.\/app\/controls\//);
  assert.doesNotMatch(html, /src="\.\/app\/graphics\//);
  assert.doesNotMatch(html, /src="\.\/compiler\//);
});

test('phase contracts declare the strict eight-phase handoff', () => {
  const contractsPath = path.join(publicDir, 'pipeline', 'simulatte-phase-contracts.js');
  const contracts = require(contractsPath);

  assert.equal(contracts.schema, 'simulatte.phaseContracts.v1');
  assert.equal(contracts.envelope.schemaPattern, 'simulatte.phaseN.output.v2');
  assert.deepEqual(contracts.envelope.required, [
    'schema',
    'phase',
    'inputSchema',
    'runtimeReceiptId',
    'artifact',
    'receipts',
  ]);
  assert.equal(contracts.phases.length, 8);
  contracts.phases.forEach((phase, index) => {
    assert.equal(phase.phase, index + 1);
    const expectedVersion = index < 2 ? 1 : 2;
    assert.equal(phase.outputSchema, `simulatte.phase${index + 1}.output.v${expectedVersion}`);
    assert.ok(Array.isArray(phase.allowedInputs));
    assert.ok(Array.isArray(phase.receipts));
    assert.ok(Array.isArray(phase.forbiddenUpstreamReads));
  });
  assert.ok(contracts.phases[2].forbiddenUpstreamReads.includes('rawPrompt'));
  assert.ok(contracts.phases[2].artifactKeys.includes('retrievalRerankResult'));
  assert.ok(contracts.phases[2].artifactKeys.includes('activationCloud'));
  assert.ok(contracts.phases[2].receipts.includes('phase3-activation-fusion'));
  assert.ok(contracts.phases[3].forbiddenUpstreamReads.includes('rankedPrimitives'));
  assert.ok(contracts.phases[3].artifactKeys.includes('groundedSceneContract'));
  assert.ok(contracts.phases[5].artifactKeys.includes('visualCompile'));
  assert.ok(contracts.phases[6].artifactKeys.includes('renderExecution'));
  assert.ok(contracts.phases[6].forbiddenUpstreamReads.includes('renderIR'));
  assert.ok(contracts.phases[7].artifactKeys.includes('sceneProof'));
  assert.ok(contracts.phases[7].receipts.includes('phase8-scene-proof'));
});

test('intent forensics modules load before the physics model in the browser lab', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const scriptNames = Array.from(html.matchAll(/<script defer src="([^"]+)"><\/script>/g))
    .map((match) => path.basename(match[1].split('?')[0]));
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
    path.join(root, 'public', 'pipeline', 'phase-03-retrieval', 'simulatte-intent-embedder.js'),
    'utf8'
  );
  assert.ok(
    embedderFacade.indexOf('simulatte-intent-embedder-rerank-runtime.js')
      < embedderFacade.indexOf('simulatte-intent-embedder-manifest-cache.js'),
    'CommonJS embedder facade must load reranking before the embedder'
  );
  const legacyRerankSource = fs.readFileSync(
    path.join(root, 'public', 'pipeline', 'phase-03-retrieval', 'simulatte-intent-embedder-rerank.js'),
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

test('training mode streams prompt-output critiques over localhost', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const bridge = runtimeSource('prompt-review-bridge.js');
  const renderer = runtimeSource('prompt-controller.js');
  const server = fs.readFileSync(path.join(root, 'tools', 'simulatte-review-server.mjs'), 'utf8');

  assert.equal(pkg.scripts['review:server'], 'node tools/simulatte-review-server.mjs');
  assert.match(html, /prompt-review-bridge\.js/);
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
  assert.doesNotMatch(bridge, /Wrong scene/);
  assert.doesNotMatch(bridge, /Missing object/);
  assert.doesNotMatch(bridge, /Wrong material/);
  assert.doesNotMatch(bridge, /Too generic/);
  assert.doesNotMatch(bridge, /Bad motion/);
  assert.match(bridge, /simulatte-training-layer/);
  assert.match(bridge, /Training layer/);
  assert.match(bridge, /data-training-phase-grid/);
  assert.match(bridge, /data-training-artifact-json/);
  assert.match(bridge, /data-training-diagnostics/);
  assert.match(bridge, /Feedback/);
  assert.match(bridge, /Save feedback/);
  assert.doesNotMatch(bridge, /Expected output/);
  assert.doesNotMatch(bridge, /Fix note/);
  assert.doesNotMatch(bridge, /Save bug/);
  assert.doesNotMatch(bridge, /BUG_TYPES/);
  assert.doesNotMatch(bridge, /SEVERITIES/);
  assert.doesNotMatch(bridge, /phase_artifact_wrong/);
  assert.match(bridge, /Feedback target/);
  assert.match(bridge, /Submit feedback for/);
  assert.match(bridge, /targetName\(target\)/);
  assert.match(bridge, /document\.body\.append\(node\)/);
  assert.match(bridge, /toggleCollapsed/);
  assert.match(bridge, /await reviewStore\.put\(record, false\)/);
  assert.match(bridge, /syncQueuedRecords/);
  assert.match(bridge, /artifactSummary/);
  assert.match(bridge, /artifactHash/);
  assert.match(bridge, /phaseCards/);
  assert.match(bridge, /selectedArtifact/);
  assert.match(bridge, /feedback/);
  assert.doesNotMatch(bridge, /bugType/);
  assert.doesNotMatch(bridge, /severity/);
  assert.doesNotMatch(bridge, /fixHint/);
  assert.match(bridge, /phaseFrom/);
  assert.match(bridge, /phaseTo/);
  assert.match(bridge, /runId/);
  assert.match(bridge, /\/draft/);
  assert.match(bridge, /\/reviews/);
  assert.match(bridge, /\/summary/);
  assert.match(bridge, /EventSource/);
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
  assert.doesNotMatch(server, /byBugType/);
  assert.doesNotMatch(server, /bySeverity/);
  assert.doesNotMatch(server, /byPhaseBug/);
  assert.match(server, /artifactSummary: compactJson/);
  assert.match(server, /selectedArtifact: compactJson/);
  assert.match(server, /phaseCards: compactJson/);
  assert.match(server, /feedback: stringValue/);
  assert.doesNotMatch(server, /fixHint: stringValue/);
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
  const wrapper = fs.readFileSync(path.join(root, 'tools', 'audit-pipeline.mjs'), 'utf8');
  const scorer = fs.readFileSync(path.join(root, 'tools', 'audit-pipeline-score.mjs'), 'utf8');
  const summary = fs.readFileSync(path.join(root, 'tools', 'summarize-pipeline-audit.mjs'), 'utf8');
  const compare = fs.readFileSync(path.join(root, 'tools', 'compare-pipeline-audit.mjs'), 'utf8');

  assert.equal(
    pkg.scripts['audit:pipeline'],
    'node tools/audit-pipeline.mjs --intent-mode model --profile-dir artifacts/model-cache-profile'
  );
  assert.equal(pkg.scripts['audit:pipeline:local'], 'node tools/audit-pipeline.mjs --intent-mode local');
  assert.equal(pkg.scripts['audit:pipeline:score'], 'node tools/audit-pipeline-score.mjs');
  assert.equal(
    pkg.scripts['audit:pipeline:baseline'],
    'node tools/audit-pipeline.mjs --intent-mode model --profile-dir artifacts/model-cache-profile --write-baseline'
  );
  assert.equal(pkg.scripts['audit:pipeline:summary'], 'node tools/summarize-pipeline-audit.mjs');
  assert.equal(pkg.scripts['audit:pipeline:compare'], 'node tools/compare-pipeline-audit.mjs');
  assert.match(wrapper, /audit-intent-scene-screenshots\.mjs/);
  assert.match(wrapper, /audit-pipeline-score\.mjs/);
  assert.match(wrapper, /--live-report/);
  assert.match(wrapper, /function outputDirsFor/);
  assert.match(wrapper, /intentMode: 'model'/);
  assert.match(wrapper, /AUDIT_DIR, 'live-webgpu'/);
  assert.match(wrapper, /AUDIT_DIR, 'live-score'/);
  assert.match(wrapper, /function promptArgsFrom/);
  assert.match(wrapper, /\.\.\.extraPromptArgs/);
  assert.match(wrapper, /'dogs and cats swimming'/);
  assert.match(scorer, /simulatte\.pipelineAuditRun\.v1/);
  assert.match(scorer, /simulatte\.pipelineAuditArtifactIdentity\.v1/);
  assert.match(scorer, /strict-8-phase-scene-proof-v2/);
  assert.match(scorer, /function auditArtifactIdentity/);
  assert.match(scorer, /artifactKind/);
  assert.match(scorer, /compareGroup/);
  assert.match(scorer, /sourceLiveReport/);
  assert.match(scorer, /simulatte-pipeline-live-score-v1/);
  assert.match(scorer, /simulatte-pipeline-static-score-v1/);
  assert.match(scorer, /phase-floor-76\.v1/);
  assert.match(scorer, /pipelineScore/);
  assert.match(scorer, /weakestPhase/);
  assert.match(scorer, /history\.jsonl/);
  assert.match(scorer, /baseline\.json/);
  assert.match(scorer, /simulatte\.diversityPolicy\.v1/);
  assert.match(scorer, /requiredLiveProof/);
  assert.match(scorer, /process\.exitCode = 1/);
  assert.match(scorer, /scoreLanguageGraph/);
  assert.match(scorer, /scoreWebGpu/);
  assert.match(scorer, /const phaseArtifacts = spec && spec\.phaseArtifacts \|\| \{\}/);
  assert.match(scorer, /const phase2Artifact = phaseArtifacts\.phase2/);
  assert.match(scorer, /const retrievalRerankResult = phase3Artifact\.retrievalRerankResult/);
  assert.match(scorer, /const simulationCompile = phase5Artifact\.simulationCompile/);
  assert.match(scorer, /const visualCompile = phase6Artifact\.visualCompile/);
  assert.match(scorer, /const visualIR = visualCompile\.visualIR \|\| \{\}/);
  assert.match(scorer, /const scenePacket = context\.visualCompile && context\.visualCompile\.sceneRenderPacket \|\| \{\}/);
  assert.doesNotMatch(scorer, /visualCompile\.visualIR \|\| renderProgram\.visualIR/);
  assert.doesNotMatch(scorer, /renderProgram && renderProgram\.sceneRenderPacket/);
  assert.match(scorer, /compiled-static-live-webgpu-required/);
  assert.match(scorer, /liveProofRequired: true/);
  assert.match(scorer, /live WebGPU proof required; static VisualIR proxy capped/);
  assert.match(scorer, /renderInstanceCount/);
  assert.match(scorer, /sourceLinkedRenderInstanceCount/);
  assert.match(scorer, /sceneRenderPacketEntityCount/);
  assert.match(scorer, /sceneRenderPacketSpatialRatio/);
  assert.match(scorer, /sceneRenderPacketIdentityRatio/);
  assert.match(scorer, /liveSceneObjectIdentities/);
  assert.match(scorer, /shaderUsesSceneRenderPacket/);
  assert.match(scorer, /scenePacketAtomUniformVector/);
  assert.match(scorer, /rendererRejectsSemanticInference/);
  assert.match(scorer, /function liveRenderExecutionInputSchema/);
  assert.match(scorer, /function liveSceneRenderPacketInputSchema/);
  assert.match(scorer, /liveRenderExecutionInput/);
  assert.match(scorer, /liveSceneRenderPacketInput/);
  assert.match(scorer, /liveSceneRenderPacket/);
  assert.doesNotMatch(scorer, /graphicsAtomUniformVector/);
  assert.doesNotMatch(scorer, /composedSceneVector/);
  assert.match(summary, /artifact=\$\{artifactKind\}/);
  assert.match(summary, /compareGroup=\$\{compareGroup\}/);
  assert.match(summary, /phaseTaxonomy=\$\{phaseTaxonomyVersion\}/);
  assert.match(summary, /sourceLiveReport=\$\{sourceLiveReport/);
  assert.match(summary, /weakestPrompts/);
  assert.match(compare, /phaseDeltas/);
});

test('causal affordances compile into first-class VisualIR rows', () => {
  const composition = runtimeSource('simulatte-composition-graph.js');
  const model = runtimeSource('simulatte-physics-model.js');

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
  const atlasPath = path.join(root, 'public', 'data', 'simulatte-visual-cards', 'visual-operator-atlas-v1.json');
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
  const renderer = runtimeSource('prompt-controller.js');
  const runtimeProgress = runtimeSource('runtime-progress.js');
  const lab = runtimeSource('simulation-lab.js');
  const auditTool = fs.readFileSync(
    path.join(root, 'tools', 'audit-intent-scene-screenshots.mjs'),
    'utf8'
  );

  assert.match(renderer, /function createBrowserLab/);
  assert.match(renderer, /runtimeProgressApi\.connect\(root/);
  assert.match(renderer, /runtimeProgress\.publish/);
  assert.match(renderer, /runtimeProgress\.isBusy\(\)/);
  assert.match(runtimeProgress, /function reduceRuntimeProgress/);
  assert.match(runtimeProgress, /function phaseForStage/);
  assert.match(runtimeProgress, /function createRuntimeStripObserver/);
  assert.match(renderer, /if \(simulationVisible && webGpuRenderer\)/);
  assert.match(renderer, /let renderExecutionInput = null/);
  assert.match(renderer, /const refreshRenderExecutionInput = \(\) =>/);
  assert.match(renderer, /webGpuRenderer\.render\(input, now\)/);
  assert.match(renderer, /webGpuRenderer\.setRenderExecutionInput\(nextRenderExecutionInput\)/);
  assert.doesNotMatch(renderer, /webGpuRenderer\.render\(createRenderExecutionInput\(spec, state, canvas\), now\)/);
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
  const renderer = runtimeSource('prompt-controller.js');
  const worker = runtimeSource('simulatte-pipeline-worker.js');
  const intentWorker = runtimeSource('simulatte-intent-worker.js');

  assert.match(worker, /const SCRIPT_ORDER = Object\.freeze/);
  assert.match(worker, /const WORKER_SEARCH = root && root\.location && root\.location\.search \|\| ''/);
  assert.match(worker, /importScripts\(\.\.\.versionedScriptOrder\(\)\)/);
  assert.match(worker, /function versionedScriptOrder\(\)/);
  assert.match(worker, /runtimeManifest\.pipelineWorker/);
  assert.ok(runtimeScriptManifest.pipelineWorker.includes('pipeline/phase-05-simulation/simulatte-physics-model.js'));
  assert.ok(runtimeScriptManifest.pipelineWorker.includes('pipeline/phase-06-visual/simulatte-visual-operator-compiler.js'));
  assert.match(worker, /simulatte:pipeline-worker:compile/);
  assert.match(worker, /SimulattePhysicsModel\.createSpecFromPrompt/);
  assert.match(worker, /simulatte:pipeline-worker:progress/);
  assert.match(worker, /durationMs: taskPercent >= 100/);
  assert.match(worker, /type: 'simulatte:pipeline-worker:result'/);
  assert.match(renderer, /const pipelineCompiler = createPipelineCompiler\(root\)/);
  assert.match(renderer, /function createPipelineCompiler\(root\)/);
  assert.match(renderer, /simulatte-pipeline-worker\.js/);
  assert.match(renderer, /appendBuildVersion\(url, view\)/);
  assert.match(renderer, /new view\.Worker\(url\)/);
  assert.match(renderer, /function compilePromptSpec\(prompt, options, event = \{\}\)/);
  assert.match(renderer, /pipelineCompiler\.compile\(prompt, options, onPhaseProgress\)/);
  assert.match(renderer, /data\.type === 'simulatte:pipeline-worker:progress'/);
  assert.match(renderer, /worker compile fell back to main thread/);
  assert.match(renderer, /return createSpecFromPrompt\(prompt, \{ \.\.\.options, onPhaseProgress \}\)/);
  assert.match(renderer, /let compileSerial = 0/);
  assert.match(renderer, /token !== compileSerial/);
  assert.doesNotMatch(renderer, /Compiling preview simulation graph/);
  assert.match(renderer, /message: 'Parsing language'/);
  assert.doesNotMatch(renderer, /publishCompiledPhaseProgress/);
  assert.doesNotMatch(renderer, /stage: 'compile',\n\s+percent: 94/);

  assert.match(intentWorker, /const SCRIPT_ORDER = Object\.freeze/);
  assert.match(intentWorker, /const WORKER_SEARCH = root && root\.location && root\.location\.search \|\| ''/);
  assert.match(intentWorker, /importScripts\(\.\.\.versionedScriptOrder\(\)\)/);
  assert.match(intentWorker, /function versionedScriptOrder\(\)/);
  assert.match(intentWorker, /runtimeManifest\.intentWorker/);
  assert.ok(runtimeScriptManifest.intentWorker.includes('pipeline/phase-03-retrieval/simulatte-intent-embedder.js'));
  assert.match(intentWorker, /let embedderConfigKey = ''/);
  assert.match(intentWorker, /let loadPromise = null/);
  assert.match(intentWorker, /let loadedRuntime = null/);
  assert.match(intentWorker, /function stableConfigKey\(config = \{\}\)/);
  assert.match(intentWorker, /function ensureModelLoaded\(config = \{\}, options = \{\}\)/);
  assert.match(intentWorker, /simulatte:intent-worker:load/);
  assert.match(intentWorker, /const runtime = await ensureModelLoaded\(data\.config \|\| \{\}, data\.options \|\| \{\}\)/);
  assert.match(intentWorker, /promptRuntimeReceipt: runtime && runtime\.promptRuntimeReceipt \|\| null/);
  assert.match(intentWorker, /simulatte:intent-worker:rank/);
  assert.match(intentWorker, /await ensureModelLoaded\(data\.config \|\| \{\}, data\.options \|\| \{\}\)/);
  assert.match(intentWorker, /workerEmbedder\.rankPrompt/);
  assert.match(intentWorker, /\.\.\.\(data\.options \|\| \{\}\)/);
  assert.match(intentWorker, /traceEmbeddings: config\.traceEmbeddings === true/);
  assert.match(renderer, /const intentWorker = createIntentWorkerClient\(root, \(event\) => publishRuntime\(event\)\)/);
  assert.match(renderer, /let mainThreadEmbedder = null/);
  assert.match(renderer, /const createMainThreadEmbedder = \(\) =>/);
  assert.match(renderer, /const embedder = intentWorker \|\| createMainThreadEmbedder\(\)/);
  assert.match(renderer, /function createIntentWorkerClient\(root, onProgress = null\)/);
  assert.match(renderer, /simulatte-intent-worker\.js/);
  assert.match(renderer, /function appBuildVersion\(view\)/);
	  assert.match(renderer, /function versionedLocalUrl\(value, view\)/);
	  assert.match(renderer, /manifestUrl: absolute\('\.\/data\/simulatte-embedder\/manifest\.json'\)/);
		  assert.match(renderer, /retrievalQueryPlanForPrompt\(prompt, params, promptRuntimeReceipt\)/);
		  assert.match(renderer, /stage: 'scene-query-plan'/);
		  assert.match(renderer, /let activePromptRuntimeReceipt = null/);
		  assert.match(renderer, /async function ensurePromptRuntimeReceipt\(serial\)/);
		  assert.match(renderer, /queryPlan: retrievalQueryPlan\.queryPlan/);
	  assert.match(renderer, /sceneLanguageGraph: retrievalQueryPlan\.sceneLanguageGraph/);
	  assert.match(renderer, /slotRetrieval: result\.slotRetrieval/);
	  assert.match(renderer, /'queryPlan'/);
	  assert.match(renderer, /'sceneLanguageGraph'/);
	  assert.match(renderer, /worker\.postMessage\(\{\n\s+type,\n\s+id,\n\s+config,/);
  assert.match(renderer, /runtimeProgress\.isBusy\(\)/);
  assert.doesNotMatch(renderer, /function syncIntentRuntime/);
});

test('home prompt shuffle stays consistent between HTML and catalog', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const catalog = runtimeSource('simulatte-physics-catalog.js');

  assert.match(html, /id="shuffle-prompt"/);
  assert.match(html, /Shuffle 256 examples/);
  assert.match(html, /id="prompt-more-menu"/);
  assert.match(html, /id="fps-readout"/);
  assert.match(html, /\.physics-fps/);
  assert.match(html, /class="prompt-dock-head"[\s\S]{0,160}id="prompt-dock-toggle"/);
  assert.doesNotMatch(html, /<h1>Simulatte<\/h1>/);
  assert.match(html, /id="prompt-more-menu"[\s\S]*id="lab-state"[\s\S]*id="fps-readout"[\s\S]*id="world-model-panel"[\s\S]*id="spec-preview"/);
  assert.match(html, /\.prompt-dock \.builder-row \{\n\s+position: relative;\n\s+display: block;\n\s+width: 100%;\n\s+\}/);
  assert.match(html, /\.prompt-dock textarea \{[\s\S]*padding-bottom: 60px;[\s\S]*resize: vertical;/);
  assert.match(html, /\.prompt-dock \.builder-row button \{[\s\S]*position: absolute;[\s\S]*bottom: 10px;[\s\S]*width: min\(128px, calc\(50% - 16px\)\);/);
  assert.match(html, /#shuffle-prompt \{\n\s+left: 10px;\n\s+\}/);
  assert.match(html, /#build-lab \{\n\s+right: 10px;\n\s+\}/);
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

test('Doppler residual intent cannot select a model outside the numbered runtime lock', () => {
  const runtime = runtimeSource('simulatte-doppler-intent.js');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

  assert.match(runtime, /simulatte\.dopplerIntentHints\.v1/);
  assert.match(runtime, /normalizeDopplerIntent/);
  assert.match(runtime, /numbered model runtime lock owns all Doppler model execution/);
  assert.match(runtime, /assertNoModelExecutionOptions/);
  assert.doesNotMatch(runtime, /importDopplerModule|chatText|DEFAULT_MODULE_URL|DEFAULT_KERNEL_BASE_PATH/);
  assert.doesNotMatch(runtime, /urlValue|urlFlag|new URLSearchParams/);
  assert.doesNotMatch(runtime, /http:|https:/);
  assert.match(html, /simulatte-doppler-intent\.js/);
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
  const renderer = runtimeSource('prompt-controller.js');
  const runtimeProgress = runtimeSource('runtime-progress.js');

  assert.match(html, /--mosaic-pink/);
  assert.match(html, /--mosaic-lilac/);
  assert.doesNotMatch(html, /intent-runtime-mosaic/);
  assert.match(html, /id="physics-canvas"/);
  assert.match(html, /id="physics-canvas"[^>]*data-scene-visible="false"/);
  assert.match(html, /#physics-canvas\[data-scene-visible="false"\] \{[\s\S]*opacity: 0;[\s\S]*visibility: hidden;/);
  assert.match(html, /id="loading-canvas"/);
  assert.match(html, /#loading-canvas \{[\s\S]*position: fixed;[\s\S]*opacity: 0;[\s\S]*transition: opacity 160ms ease;/);
  assert.match(html, /#loading-canvas\.is-active \{\n\s+opacity: 1;/);
  assert.match(html, /loading-canvas\.js/);
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
  assert.match(runtimeProgress, /RUNTIME_PHASES = Object\.freeze/);
  assert.match(runtimeProgress, /phaseRule\(1, 'prompt-runtime', 'Prompt runtime', 30/);
  assert.match(runtimeProgress, /phaseRule\(8, 'webgpu-ready', 'WebGPU ready', 7/);
	  assert.match(runtimeProgress, /stageAlias\(\/model-probe\//);
	  assert.match(runtimeProgress, /stageAlias\(\/model-ready\//);
	  assert.match(runtimeProgress, /stageAlias\(\/reranker-ready\//);
	  assert.match(runtimeProgress, /stageAlias\(\/slot-retrieval\//);
	  assert.match(runtimeProgress, /stageAlias\(\/slot-rank\//);
	  assert.match(runtimeProgress, /stageAlias\(\/\^\(ready\|done\|complete\)\$\//);
  assert.match(runtimeProgress, /function passiveRuntimeProgressState/);
  assert.match(runtimeProgress, /function mergeRuntimeReceipt/);
  assert.match(runtimeProgress, /promptRuntime: compactObject\(event\.promptRuntimeReceipt \|\| null, 24\)/);
  assert.match(runtimeProgress, /node\.dataset\.promptRuntimeReceipt/);
  assert.match(runtimeProgress, /function phaseForStage/);
  assert.match(runtimeProgress, /node\.dataset\.stage = state\.phase\.id/);
  assert.match(runtimeProgress, /node\.dataset\.pipelineStep = String\(state\.phase\.step\)/);
  assert.match(renderer, /waitForLoadingPaint/);
  assert.match(runtimeProgress, /canvasLoading = loading && event\.canvasLoading !== false/);
  assert.match(runtimeProgress, /state\.canvasLoading \? 'snake' : state\.blocking \? 'simple' : 'idle'/);
  assert.match(runtimeProgress, /dataset\.canvasLoading = state\.canvasLoading \? 'snake' : 'idle'/);
  assert.match(renderer, /SimulatteLoadingCanvas\.createController\(loadingCanvas/);
  assert.match(runtimeProgress, /loadingCanvas\.setLoading\(state\.canvasLoading, state\.progress, state\.stage, \{/);
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
  const webgpuRenderer = runtimeSource('simulatte-webgpu-renderer.js');
  const loadingCanvas = runtimeSource('loading-canvas.js');
  assert.match(webgpuRenderer, /const SCENE_PACKET_OBJECT_SLOTS = 8/);
  assert.match(webgpuRenderer, /const SCENE_PACKET_FLOATS = SCENE_PACKET_OBJECT_SLOTS \* 12/);
  assert.match(webgpuRenderer, /const GPU_SCENE_INSTANCE_CAPACITY = 32/);
  assert.match(webgpuRenderer, /const GPU_SCENE_INSTANCE_FLOATS = 12/);
  assert.match(webgpuRenderer, /const GPU_OBJECT_PART_CAPACITY = 256/);
  assert.match(webgpuRenderer, /const GPU_OBJECT_PART_FLOATS = 16/);
  assert.match(webgpuRenderer, /const WEBGPU_OPTIONAL_FEATURES = Object\.freeze/);
  assert.match(webgpuRenderer, /const WEBGPU_OPTIONAL_FEATURES = Object\.freeze\(\[\]\)/);
  assert.match(webgpuRenderer, /const UNIFORM_FLOAT_COUNT = 144 \+ SCENE_PACKET_FLOATS/);
  assert.match(webgpuRenderer, /const RENDER_DATA_SCHEMA = 'simulatte\.phase7\.compactRenderData\.v1'/);
  assert.match(webgpuRenderer, /new Float32Array\(UNIFORM_FLOAT_COUNT\)/);
  assert.match(webgpuRenderer, /const WEBGPU_BACKGROUND_SHADER = `/);
  assert.match(webgpuRenderer, /code: WEBGPU_BACKGROUND_SHADER/);
  assert.match(webgpuRenderer, /entryPoint: 'backgroundVs'/);
  assert.match(webgpuRenderer, /entryPoint: 'backgroundFs'/);
  assert.match(webgpuRenderer, /const PIXEL_READBACK_BYTES_PER_ROW = 256/);
  assert.match(webgpuRenderer, /usage: canvasTextureUsage\(\)/);
  assert.match(webgpuRenderer, /GPUTextureUsage\.RENDER_ATTACHMENT \| GPUTextureUsage\.COPY_SRC/);
  assert.match(webgpuRenderer, /function phase7PixelReadbackPlan\(renderData = null, sceneRenderPacket = \{\}, renderExecutionInput = null, canvas = null\)/);
  assert.match(webgpuRenderer, /phase7RequiredVisualObligations\(renderExecutionInput, sceneRenderPacket\)/);
  assert.match(webgpuRenderer, /encoder\.copyTextureToBuffer/);
  assert.match(webgpuRenderer, /GPUBufferUsage\.COPY_DST \| GPUBufferUsage\.MAP_READ/);
  assert.match(webgpuRenderer, /readback\.buffer\.mapAsync\(GPUMapMode\.READ\)/);
  assert.match(webgpuRenderer, /source: 'webgpu-texture-copy-readback'/);
  assert.doesNotMatch(webgpuRenderer, /const WEBGPU_SCENE_PREPARE_SHADER = `/);
  assert.doesNotMatch(webgpuRenderer, /createComputePipeline/);
  assert.match(webgpuRenderer, /this\.objectPartBuffer = this\.device\.createBuffer/);
  assert.match(webgpuRenderer, /await this\.setupObjectPartPipeline\(\)/);
  assert.match(webgpuRenderer, /pass\.draw\(3, 1, 0, 0\)/);
  assert.match(webgpuRenderer, /pass\.draw\(6, this\.objectPartCount, 0, 0\)/);
  assert.match(webgpuRenderer, /const scenePacket = sceneRenderPacketFromExecutionInput\(renderExecutionInput\)/);
  assert.match(webgpuRenderer, /if \(this\.renderData && packet === this\.sceneRenderPacket\)/);
  assert.match(webgpuRenderer, /const packetKey = sceneRenderPacketRenderDataKey\(packet, sceneKind\)/);
  assert.match(webgpuRenderer, /if \(this\.renderData && packetKey === this\.sceneRenderPacketKey\)/);
  assert.match(webgpuRenderer, /this\.renderData = compileSceneRenderData\(packet, sceneKind, packetKey\)/);
  assert.match(webgpuRenderer, /this\.applyRenderData\(this\.renderData, scenePacket !== null\)/);
  assert.match(webgpuRenderer, /function compileSceneRenderData\(packet, sceneKind = '', packetKey = ''\)/);
  assert.doesNotMatch(webgpuRenderer, /function sceneKindFromSpec/);
  assert.match(webgpuRenderer, /this\.sceneId = renderData\.sceneId/);
  assert.match(webgpuRenderer, /this\.features = renderData\.features/);
  assert.match(webgpuRenderer, /this\.atomUniforms = renderData\.atomUniforms/);
  assert.match(webgpuRenderer, /this\.sceneMix = renderData\.sceneMix/);
  assert.match(webgpuRenderer, /this\.visualIrLayers = renderData\.visualIrLayers/);
  assert.match(webgpuRenderer, /this\.sceneObjectUniforms = renderData\.sceneObjectUniforms/);
  assert.match(webgpuRenderer, /this\.sceneInstanceData = renderData\.sceneInstanceData/);
  assert.match(webgpuRenderer, /this\.sceneInstanceCount = renderData\.sceneInstanceCount/);
  assert.match(webgpuRenderer, /this\.objectPartData = renderData\.objectPartData/);
  assert.match(webgpuRenderer, /this\.objectPartCount = renderData\.objectPartCount/);
  assert.match(webgpuRenderer, /canvas\.dataset\.sceneMix = sceneMixSummary\(this\.sceneMix\)/);
  assert.match(webgpuRenderer, /canvas\.dataset\.visualIrLayers = visualIrLayerSummary\(this\.visualIrLayers\)/);
  assert.match(webgpuRenderer, /canvas\.dataset\.webgpuOptimizationPath = this\.gpuScenePath/);
  assert.match(webgpuRenderer, /canvas\.dataset\.webgpuSceneInstanceCapacity = String\(GPU_SCENE_INSTANCE_CAPACITY\)/);
  assert.match(webgpuRenderer, /canvas\.dataset\.webgpuSceneInstanceCount = String\(renderData\.sceneInstanceCount\)/);
  assert.match(webgpuRenderer, /canvas\.dataset\.phase7Input = this\.renderExecutionInput/);
  assert.match(webgpuRenderer, /canvas\.dataset\.phase7SceneRenderPacketInput = hasScenePacket/);
  assert.match(webgpuRenderer, /canvas\.dataset\.phase7RenderData = renderData\.schema/);
  assert.match(webgpuRenderer, /canvas\.dataset\.phase7RenderDataKey = renderData\.packetKey/);
  assert.match(webgpuRenderer, /canvas\.dataset\.sceneRenderDrawCount = String\(renderData\.drawCount\)/);
  assert.match(webgpuRenderer, /canvas\.dataset\.renderExecutionInput = this\.renderExecutionInput/);
  assert.match(webgpuRenderer, /PHASE7_OUTPUT_SCHEMA = 'simulatte\.phase7\.output\.v2'/);
  assert.match(webgpuRenderer, /canvas\.dataset\.sceneRenderPacket = renderData\.summary/);
  assert.match(webgpuRenderer, /canvas\.dataset\.sceneObjectIdentities = renderData\.sceneObjectIdentitySummary/);
  assert.match(webgpuRenderer, /sceneMix0: vec4f/);
  assert.match(webgpuRenderer, /struct BackgroundUniforms/);
  assert.match(webgpuRenderer, /struct ObjectPart/);
  assert.match(webgpuRenderer, /@group\(0\) @binding\(1\) var<storage, read> objectParts: array<ObjectPart>/);
  assert.doesNotMatch(webgpuRenderer, /visibleSceneInstances|sceneStats: array<u32>/);
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
  assert.match(loadingCanvas, /const MIN_SNAKES = 2/);
  assert.match(loadingCanvas, /const MAX_SNAKES = 16/);
  assert.match(loadingCanvas, /const START_LENGTH = 8/);
  assert.match(loadingCanvas, /const MIN_SPAWN_LENGTH = 2/);
  assert.match(loadingCanvas, /const MAX_SNAKE_LENGTH = 64/);
  assert.match(loadingCanvas, /const TARGET_CELL_PX = 32/);
  assert.match(loadingCanvas, /const MIN_CELL_PX = 18/);
  assert.match(loadingCanvas, /const MAX_CELL_PX = 40/);
  assert.match(loadingCanvas, /const LOOP_TURN_BONUS = 5\.2/);
  assert.match(loadingCanvas, /const OPEN_AREA_BONUS = 0\.72/);
  assert.match(loadingCanvas, /const NOVEL_CELL_BONUS = 8\.2/);
  assert.match(loadingCanvas, /const VISITED_CELL_PENALTY = 9\.5/);
  assert.match(loadingCanvas, /const RECENT_TRAIL_PENALTY = 5\.4/);
  assert.match(loadingCanvas, /const VISITED_MEMORY_CELLS = 160/);
  assert.doesNotMatch(loadingCanvas, /CROSSABLE_BODY_PORTION|isCrossableTail/);
  assert.match(loadingCanvas, /const HEAD_TO_HEAD_COLLISION_SHARE = 0\.58/);
  assert.match(loadingCanvas, /const HEAD_TO_BODY_COLLISION_SHARE = 0\.46/);
  assert.match(loadingCanvas, /const HEAD_TO_HEAD_TARGET_BONUS = 13/);
  assert.match(loadingCanvas, /const HEAD_TO_BODY_TARGET_BONUS = 10/);
  assert.match(loadingCanvas, /const RECT_STRAIGHT_MIN = 3/);
  assert.match(loadingCanvas, /const RECT_STRAIGHT_MAX = 8/);
  assert.match(loadingCanvas, /const RECT_STRAIGHT_BONUS = 6\.4/);
  assert.match(loadingCanvas, /const RECT_TURN_BONUS = 2\.1/);
  assert.match(loadingCanvas, /const SPIRAL_SPAWN_ATTEMPTS = 180/);
  assert.match(loadingCanvas, /const STEP_MS = 260/);
  assert.match(loadingCanvas, /const MIN_SPEED_MULTIPLIER = 0\.5/);
  assert.match(loadingCanvas, /const MAX_SPEED_MULTIPLIER = 4/);
  assert.match(loadingCanvas, /const SEGMENT_FADE_MS = 180/);
  assert.match(loadingCanvas, /const SEGMENT_STAGGER_MS = 34/);
  assert.match(loadingCanvas, /const MIN_TAIL_ALPHA = 0\.3/);
  assert.match(loadingCanvas, /const GHOST_ALPHA = 0\.28/);
  assert.match(loadingCanvas, /const ROYGBIV_SPECTRUM = Object\.freeze/);
  assert.match(loadingCanvas, /'#ff9fbd'/);
  assert.match(loadingCanvas, /'#f6e899'/);
  assert.match(loadingCanvas, /'#bdeca1'/);
  assert.match(loadingCanvas, /'#9ee8cf'/);
  assert.match(loadingCanvas, /'#9bdcff'/);
  assert.match(loadingCanvas, /'#d7a8ff'/);
  assert.match(loadingCanvas, /pastel-rainbow-determinate/);
  assert.match(loadingCanvas, /pastel-rainbow-determinate-cell-sweep/);
  assert.match(loadingCanvas, /function fullPageBoard/);
  assert.match(loadingCanvas, /const shortAxisCells = Math\.max\(10, Math\.floor\(shortAxis \/ TARGET_CELL_PX\)\)/);
  assert.match(loadingCanvas, /Math\.max\(MIN_CELL_PX, Math\.min\(MAX_CELL_PX/);
  assert.match(loadingCanvas, /function spawnSpiralCellsAt/);
  assert.match(loadingCanvas, /walk = turnDirection\(walk, 1\)/);
  assert.match(loadingCanvas, /function drawGrid/);
  assert.match(loadingCanvas, /ctx\.createLinearGradient\(0, 0, width, height\)/);
  assert.match(loadingCanvas, /ctx\.strokeStyle = 'rgba\(132, 120, 154, 0\.18\)'/);
  assert.match(loadingCanvas, /function drawSnake/);
  assert.match(loadingCanvas, /function drawExitSnake/);
  assert.match(loadingCanvas, /segmentEnterAlpha\(snake, index, now\)/);
  assert.match(loadingCanvas, /segmentExitAlpha\(snake, index, cells\.length, now\)/);
  assert.match(loadingCanvas, /drawSnake\(ctx, this\.board, snake, now\)/);
  assert.match(loadingCanvas, /drawExitSnake\(ctx, this\.board, snake, now\)/);
  assert.match(loadingCanvas, /const motion = easeOutCubic\(progress\)/);
  assert.match(loadingCanvas, /const fade = easeInFastOut\(progress\)/);
  assert.match(loadingCanvas, /function drawTile/);
  assert.match(loadingCanvas, /ctx\.fillRect\(x, y, size, size\)/);
  assert.doesNotMatch(loadingCanvas, /function drawEyes|ctx\.arc|roundRect|const shade = \(x \+ y\) % 2/);
  assert.match(loadingCanvas, /advanceSwarm/);
  assert.match(loadingCanvas, /enforcePopulation/);
  assert.match(loadingCanvas, /exitSnakes/);
  assert.match(loadingCanvas, /queueExitSnake/);
  assert.match(loadingCanvas, /pruneExitSnakes/);
  assert.match(loadingCanvas, /targetDensity/);
  assert.match(loadingCanvas, /targetSpeedMultiplier/);
  assert.match(loadingCanvas, /targetStepMs/);
  assert.match(loadingCanvas, /targetSnakeCount/);
  assert.match(loadingCanvas, /targetSnakeLength/);
  assert.match(loadingCanvas, /spawnLength/);
  assert.match(loadingCanvas, /chooseDirection/);
  assert.match(loadingCanvas, /turnBias: this\.rng\(\) < 0\.5 \? -1 : 1/);
  assert.match(loadingCanvas, /loopiness: 0\.72 \+ this\.rng\(\) \* 0\.38/);
  assert.match(loadingCanvas, /straightRunLeft: rectangularRunLength\(this\.rng\)/);
  assert.match(loadingCanvas, /rectangularity: 0\.72 \+ this\.rng\(\) \* 0\.28/);
  assert.match(loadingCanvas, /const preferredTurn = turnDirection\(current, snake\.turnBias \|\| 1\)/);
  assert.match(loadingCanvas, /const turnBonus = straightRunLeft > 0 \? RECT_TURN_BONUS : LOOP_TURN_BONUS/);
  assert.match(loadingCanvas, /score \+= turnBonus \* \(snake\.loopiness \|\| 0\.85\)/);
  assert.match(loadingCanvas, /openAreaScore\(target, board, occupied\) \* OPEN_AREA_BONUS/);
  assert.match(loadingCanvas, /visitedCellScore\(target, snake\)/);
  assert.match(loadingCanvas, /ownTrailAdjacency\(target, snake\) \* RECENT_TRAIL_PENALTY/);
  assert.match(loadingCanvas, /function turnDirection/);
  assert.match(loadingCanvas, /function ownTrailAdjacency/);
  assert.match(loadingCanvas, /function openAreaScore/);
  assert.match(loadingCanvas, /function visitedCellScore/);
  assert.match(loadingCanvas, /function updateRectangularCadence/);
  assert.match(loadingCanvas, /function rectangularRunLength/);
  assert.match(loadingCanvas, /resolveCollisionPlans/);
  assert.match(loadingCanvas, /this\.resolveCollisionPlans\(plans, occupiedBefore, drawFromById\)/);
  assert.match(loadingCanvas, /plan\.actualTarget = target/);
  assert.match(loadingCanvas, /cellKey\(plan\.actualTarget \|\| plan\.target\)/);
  assert.match(loadingCanvas, /sameCell\(targetA, oldHeadB\) && sameCell\(targetB, oldHeadA\)/);
  assert.match(loadingCanvas, /oldOwner && oldOwner\.id !== plan\.snake\.id && oldOwner\.index === 0/);
  assert.match(loadingCanvas, /owner && headMergedIds\.has\(owner\.id\)/);
  assert.match(loadingCanvas, /function combineSnakes/);
  assert.match(loadingCanvas, /function absorbSnake/);
  assert.match(loadingCanvas, /function isDestructiveBodyCollision/);
  assert.match(loadingCanvas, /owner && owner\.id !== snakeId && owner\.index > 0/);
  assert.match(loadingCanvas, /if \(owner && owner\.id === snake\.id\) continue/);
  assert.match(loadingCanvas, /stalled: !direction/);
  assert.match(loadingCanvas, /const wantsHeadToHead = rng\(\) < HEAD_TO_HEAD_COLLISION_SHARE/);
  assert.match(loadingCanvas, /const wantsBodyMerge = rng\(\) < HEAD_TO_BODY_COLLISION_SHARE/);
  assert.match(loadingCanvas, /wantsHeadToHead \? HEAD_TO_HEAD_TARGET_BONUS/);
  assert.match(loadingCanvas, /wantsBodyMerge \? HEAD_TO_BODY_TARGET_BONUS : -3\.5/);
  assert.match(loadingCanvas, /function swizzleColors/);
  assert.match(loadingCanvas, /function visitedFromCells/);
  assert.match(loadingCanvas, /function markVisited/);
  assert.match(loadingCanvas, /function mergeVisited/);
  assert.doesNotMatch(loadingCanvas, /splitOversizedSnakes|function shedCellsForSplit|SPLIT_LENGTH|TOTAL_CELL_LIMIT/);
  assert.match(loadingCanvas, /function primeSnakeAnimation/);
  assert.match(loadingCanvas, /function lerpCell/);
  assert.match(loadingCanvas, /function easeInFastOut/);
  assert.match(loadingCanvas, /function easeOutCubic/);
  assert.match(loadingCanvas, /function alphaForCell/);
  assert.match(loadingCanvas, /1 - easeInFastOut\(age\) \* \(1 - MIN_TAIL_ALPHA\)/);
  assert.match(loadingCanvas, /function colorWithAlpha/);
  assert.match(loadingCanvas, /function directionFromCells/);
  assert.match(loadingCanvas, /return \{ x: dx, y: 0 \}/);
  assert.match(loadingCanvas, /return \{ x: 0, y: dy \}/);
  assert.match(loadingCanvas, /multi-snake-loading-canvas/);
  assert.doesNotMatch(loadingCanvas, /buildSnakePath|mixGreen|mixSnakeTone|#07170f|#061008|#ff3d1f|#ff321f|#e7ff40|108, 255, 126/);
  assert.doesNotMatch(html, /#7ac943|#356b20|#2bb8a6|rgba\(122, 201, 67|rgba\(105, 216, 187|rgba\(43, 184, 166/);
  assert.doesNotMatch(webgpuRenderer, /function visualTextFromSpec/);
  assert.doesNotMatch(webgpuRenderer, /function refineSceneKindFromText/);
  assert.doesNotMatch(webgpuRenderer, /function isCompiledSpecificScene/);
  assert.doesNotMatch(webgpuRenderer, /function graphicsAtomTextRows/);
  assert.doesNotMatch(webgpuRenderer, /function graphicsAtomFeatureVector/);
  assert.doesNotMatch(webgpuRenderer, /function graphicsAtomUniformVector/);
  assert.doesNotMatch(webgpuRenderer, /function composedSceneVector/);
  assert.doesNotMatch(webgpuRenderer, /function sceneMixEvidenceText/);
  assert.doesNotMatch(webgpuRenderer, /function addGraphicsAtomSceneMix/);
  assert.doesNotMatch(webgpuRenderer, /function addSceneTextMix/);
  assert.doesNotMatch(webgpuRenderer, /promptTextForSceneMix|suppressSceneMixFalsePositives/);
  assert.match(webgpuRenderer, /const VISUAL_IR_LAYER_SLOTS = Object\.freeze/);
  assert.match(webgpuRenderer, /function visualIrLayerVector/);
  assert.match(webgpuRenderer, /scenePacketUniformVector\(packet, 'visualLayers', VISUAL_IR_LAYER_SLOTS\.length\)/);
  assert.match(webgpuRenderer, /function sceneRenderPacketFromExecutionInput/);
  assert.match(webgpuRenderer, /function emptySceneRenderPacket/);
  assert.match(webgpuRenderer, /function scenePacketSceneId/);
  assert.match(webgpuRenderer, /function scenePacketAtomUniformVector/);
  assert.match(webgpuRenderer, /function scenePacketSceneMixVector/);
  assert.match(webgpuRenderer, /function scenePacketObjectUniformVector/);
  assert.match(webgpuRenderer, /function scenePacketIdentitySummary/);
  assert.match(webgpuRenderer, /function scenePacketSemanticCode/);
  assert.match(webgpuRenderer, /function addScenePacketLayers/);
  assert.match(webgpuRenderer, /const WEBGPU_BACKGROUND_SHADER = `/);
  assert.match(webgpuRenderer, /const WEBGPU_OBJECT_SHADER = `/);
  assert.doesNotMatch(webgpuRenderer, /function addVisualIrLayerEvidence/);
  assert.match(webgpuRenderer, /function compressVisualIrLayerVector/);
  assert.match(webgpuRenderer, /function visualIrLayerSummary/);
  assert.match(webgpuRenderer, /function sceneMixSummary/);
  assert.match(webgpuRenderer, /dominantAtomSlot/);
  assert.doesNotMatch(webgpuRenderer, /mergeFeatureVectors\(featureVector\(text\), graphicsAtomFeatureVector\(spec\)\)/);
  assert.doesNotMatch(webgpuRenderer, /renderProgram\.intentText|renderProgram\.prompt|rendererPlan\.intentText|renderIR\.prompt/);
  assert.match(webgpuRenderer, /fn backgroundSceneMix\(index: i32\) -> f32/);
  assert.match(webgpuRenderer, /fn objectPartMask\(local: vec2f, shape: f32\) -> f32/);
  assert.match(webgpuRenderer, /fn objectSpiral\(local: vec2f\) -> f32/);
  assert.match(webgpuRenderer, /fn objectWave\(local: vec2f\) -> f32/);
  assert.match(webgpuRenderer, /pass\.draw\(6, this\.objectPartCount, 0, 0\)/);
  assert.doesNotMatch(webgpuRenderer, /WEBGPU_SHADER_PARTS|sceneRenderPacketScene|atomStructuralScene/);
  assert.match(webgpuRenderer, /scenePacketUniformVector\(packet, 'visualLayers', VISUAL_IR_LAYER_SLOTS\.length\)/);
  assert.match(webgpuRenderer, /const codes = row\.renderCodes \|\| \{\}/);
  assert.match(webgpuRenderer, /this\.canvas\.dataset\.phase7Output = this\.phase7Output\.schema/);
  assert.match(webgpuRenderer, /scenePacketDrawableRows\(packet\)/);
  assert.match(webgpuRenderer, /function scenePacketInstanceStorageVectorFromDrawables/);
  assert.match(webgpuRenderer, /scenePacketUniformDrawables\(packet, sceneKind\)\.slice\(0, GPU_SCENE_INSTANCE_CAPACITY\)/);
  assert.match(webgpuRenderer, /sceneMix: scenePacketSceneMixVector\(packet, sceneKind\)/);
  assert.match(webgpuRenderer, /sceneObjectUniforms,/);
  assert.match(webgpuRenderer, /sceneInstanceData,/);
  assert.match(webgpuRenderer, /sceneInstanceSummary:/);
  assert.match(webgpuRenderer, /webgpuOptimizationReceipt\(\) \{/);
  assert.match(webgpuRenderer, /optimizationPath: optimization && optimization\.path/);
  assert.match(webgpuRenderer, /unsupportedNativeFeatures: WEBGPU_NATIVE_ONLY_FEATURES\.slice\(\)/);
  assert.match(webgpuRenderer, /translatedTechniques: WEBGPU_TRANSLATED_TECHNIQUES\.slice\(\)/);
  assert.match(webgpuRenderer, /seed: seedForScenePacket\(packet, spatialHash, summary\)/);
  assert.doesNotMatch(webgpuRenderer, /visualIR\.fields|visualIR\.processes|visualIR\.motion|visualIR\.causalAffordances|visualIR\.graphicsAtoms/);
  assert.doesNotMatch(webgpuRenderer, /graphicsAtoms\.languageSignals|ranked\.slice\(0, 10\)/);
  assert.match(renderer, /sceneMix: canvas && canvas\.dataset \? canvas\.dataset\.sceneMix/);
  assert.match(renderer, /resolveWithEmbedding\(prompt, params, serial, true\)/);
	  assert.match(renderer, /function warmIntentRuntime\(serial\)/);
	  assert.match(renderer, /await embedder\.loadModel\(\)/);
	  assert.match(renderer, /const promptRuntimeReceipt = loadedRuntime && loadedRuntime\.promptRuntimeReceipt \|\| null/);
	  assert.match(renderer, /activePromptRuntimeReceipt = promptRuntimeReceipt/);
	  assert.match(renderer, /createSpec\('blank-world', \{ params: initialParams \}\)/);
	  assert.match(renderer, /stage: 'runtime-ready'/);
  assert.match(renderer, /message: 'Prompt runtime ready'/);
  assert.doesNotMatch(renderer, /initialPrompt/);
  assert.doesNotMatch(renderer, /resolveWithEmbedding\(initialPrompt/);
  assert.match(renderer, /function skipInitialBuildForAudit/);
  assert.match(renderer, /auditNoInitial/);
  assert.match(runtimeProgress, /function createRunButtonObserver/);
  assert.match(runtimeProgress, /runButton\.classList\.toggle\('is-loading', loading\)/);
  assert.match(runtimeProgress, /runButton\.disabled = loading/);
  assert.match(runtimeProgress, /runButton\.setAttribute\('aria-disabled'/);
  assert.match(runtimeProgress, /runButton\.setAttribute\('aria-busy'/);
  assert.match(renderer, /createFpsMeter/);
  assert.match(renderer, /fpsMeter\.sample\(now, simulationVisible && webGpuRenderer\)/);
  assert.match(renderer, /canvas\.dataset\.fps = visible \? String\(fps\) : '0'/);
  assert.match(renderer, /fps < 24 \? 'low' : fps < 45 \? 'warn' : 'ok'/);
  assert.match(runtimeProgress, /function runtimeLineText/);
  assert.match(runtimeProgress, /return 'Prompt runtime ready 100%'/);
  assert.match(runtimeProgress, /function measuredFraction/);
  assert.match(runtimeProgress, /function weightedPercent/);
  assert.match(runtimeProgress, /function runtimeTaskProgressState/);
  assert.match(runtimeProgress, /function runtimeRunProgressState/);
  assert.match(runtimeProgress, /function recordRuntimeTaskDuration/);
  assert.match(runtimeProgress, /overallProgressBasis: 'observed-duration-forecast'/);
  assert.match(runtimeProgress, /completedBytes \/ totalBytes/);
  assert.match(renderer, /const onPhaseProgress = \(progressEvent = \{\}\) => publishRuntime/);
  assert.doesNotMatch(renderer, /publishCompiledPhaseProgress/);
  assert.match(renderer, /stage: 'render'/);
  assert.doesNotMatch(renderer, /stage: 'visual',\n\s+percent: 98/);
  assert.match(html, /--runtime-progress: 0%/);
  assert.match(html, /prompt-runtime-rainbow/);
  assert.match(html, /\.prompt-dock \.intent-runtime \{[\s\S]*border: 0;[\s\S]*background: transparent;[\s\S]*box-shadow: none;/);
  assert.doesNotMatch(runtimeProgress, /Math\.round\(percent\)/);
  assert.doesNotMatch(renderer, /runtimeDetailText/);
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
  assert.equal(seen[0].phase.id, 'activation-cloud');
  assert.equal(seen[0].progress, 50);
  assert.equal(seen[0].sourceProgress, 59);
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
    executionDurationMs: 779.25,
  });

  assert.equal(consoleRows.length, 2);
  assert.match(consoleRows[0][0], /candidate 1\/2/);
  assert.match(consoleRows[1][0], /candidate 2\/2/);
  assert.equal(consoleRows[1][1].detail, 'Reranking scene slot 2/8 candidate 2/2');
  assert.equal(consoleRows[1][1].reranker.candidateId, 'caterpillar');
  assert.equal(consoleRows[1][1].reranker.completed, 2);
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

test('visual audit auto-judges prompt fidelity and motion with a rubric', () => {
  const tool = fs.readFileSync(
    path.join(root, 'tools', 'audit-intent-scene-screenshots.mjs'),
    'utf8'
  );
  const runtimeWait = fs.readFileSync(
    path.join(root, 'tools', 'audit-runtime-wait.mjs'),
    'utf8'
  );
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.match(tool, /VISUAL_RUBRIC_SIGNALS/);
  assert.match(tool, /simulatte\.visualPromptRubric\.v1/);
  assert.match(tool, /expectedVisualSignals/);
  assert.match(tool, /positiveLanguageText\(prompt\)/);
  assert.match(tool, /const negated = new RegExp/);
  assert.match(tool, /visualRubricForResult/);
  assert.match(tool, /startStaticServer\(options\.profileDir \? options\.localPort : 0\)/);
  assert.match(tool, /runtimeProgressLogs: \(window\.__simulatteRuntimeProgressLogs/);
  assert.match(tool, /runtimePerformanceLogs: \(window\.__simulatteRuntimePerformanceLogs/);
  assert.match(tool, /const browserEvents = cdp\.diagnostics\(\)/);
  assert.match(tool, /function webGpuValidationFailures/);
  assert.match(tool, /Invalid CommandBuffer/);
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
  assert.match(tool, /--profile-dir DIR/);
  assert.match(tool, /profilePersistent/);
  assert.match(tool, /SimulatteIntentRuntimeHealth/);
  assert.match(tool, /__simulatteIntentRuntimeEvents/);
  assert.match(tool, /runtimeHealth/);
  assert.match(tool, /MODEL_RUNTIME_STALL_MS = 90000/);
  assert.match(tool, /waitForCondition.*audit-runtime-wait\.mjs/);
  assert.match(runtimeWait, /conditionProgressSignature/);
  assert.match(runtimeWait, /progress: value && value\.progress \|\| health\.progress \|\| ''/);
  assert.doesNotMatch(runtimeWait, /silenceBucket/);
  assert.doesNotMatch(runtimeWait, /displayLine:/);
  assert.match(tool, /run button ready for \$\{label\}`,[\s\S]*stallTimeoutMs: MODEL_RUNTIME_STALL_MS/);
  assert.match(tool, /visualIRRenderInstanceCount/);
  assert.match(tool, /phase7Input/);
  assert.match(tool, /phase7RenderExecutionInput/);
  assert.match(tool, /phase7SceneRenderPacketInput/);
  assert.match(tool, /phase7PixelReadback/);
  assert.match(tool, /phase7PixelProofStatus/);
  assert.match(tool, /phase7PixelVisibleSampleCount/);
  assert.match(tool, /phase7PixelSampledObligations/);
  assert.match(tool, /Phase 7 pixel readback is/);
  assert.match(tool, /Phase 7 renderExecutionInput dataset is/);
  assert.match(tool, /simulatte\.renderExecutionInput\.v1/);
	  assert.match(tool, /phaseArtifactSchemas/);
	  assert.match(tool, /EXPECTED_PHASE_OUTPUT_SCHEMAS/);
	  assert.match(tool, /simulatte-phase-contracts\.js/);
	  assert.doesNotMatch(tool, /phase3: 'simulatte\.phase3\.output\.v2'/);
	  assert.match(tool, /phase7Output/);
	  assert.match(tool, /phaseArtifactSchemas\.phase7 = canvas && canvas\.dataset \? canvas\.dataset\.phase7Output \|\| '' : ''/);
	  assert.match(tool, /sceneProofError/);
	  assert.match(tool, /Phase 8 output is/);
	  assert.match(tool, /Scene Proof verdict is/);
	  assert.match(tool, /const visualIR = phase6VisualCompile && phase6VisualCompile\.visualIR \|\| null/);
  assert.match(tool, /const sceneRenderPacket = phase6VisualCompile && phase6VisualCompile\.sceneRenderPacket \|\| null/);
  assert.doesNotMatch(tool, /program && program\.visualIR/);
  assert.doesNotMatch(tool, /program && program\.sceneRenderPacket/);
  assert.match(tool, /Phase 7 sceneRenderPacket input is/);
  assert.match(tool, /Phase 6 visualCompile sceneRenderPacket missing/);
  assert.match(tool, /simulatte\.sceneRenderPacket\.v1/);
  assert.match(tool, /sceneRenderPacket/);
  assert.match(tool, /sceneRenderSpatialHash/);
  assert.match(tool, /sceneObjectUniforms/);
  assert.match(tool, /sceneObjectIdentities/);
	  assert.match(tool, /visualIRSceneRenderPacketSchema/);
	  assert.match(tool, /visualIRSceneRenderPacketIdentities/);

  const main = fs.readFileSync(path.join(root, 'public', 'app', 'main.js'), 'utf8');
  assert.match(main, /runtimeManifest\.browser/);
  assert.ok(runtimeScriptManifest.browser.includes('pipeline/phase-08-scene-proof/simulatte-scene-proof.js'));
  assert.match(main, /'SimulatteSceneProof'/);
  assert.match(tool, /intentMode !== 'model'/);
  assert.match(tool, /if \(options\.intentMode !== 'model'\) \{\n\s+url\.searchParams\.set\('auditNoInitial', '1'\)/);
  assert.match(tool, /Simulatte UI ready[\s\S]*extendOnProgress: intentMode === 'model'[\s\S]*stallTimeoutMs: MODEL_RUNTIME_STALL_MS/);
  assert.match(tool, /visualIRGraphicsUniformValues/);
  assert.match(tool, /visualIRGraphicsLanguageSignals/);
  assert.match(tool, /visual rubric failed/);
  assert.match(packageJson.scripts['audit:visual'], /audit-intent-scene-screenshots\.mjs/);
  assert.match(packageJson.scripts['audit:visual'], /--intent-mode model/);
  assert.match(packageJson.scripts['audit:visual'], /--profile-dir artifacts\/model-cache-profile/);
  assert.match(packageJson.scripts['audit:visual:model'], /--intent-mode model/);
  assert.match(packageJson.scripts['audit:visual:model'], /--profile-dir artifacts\/model-cache-profile/);
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
  const lab = runtimeSource('simulation-lab.js');
  const renderer = runtimeSource('prompt-controller.js');
  const auditTool = fs.readFileSync(path.join(root, 'tools', 'audit-intent-scene-screenshots.mjs'), 'utf8');

  assert.match(html, /id="world-model-panel"/);
  assert.match(html, /id="world-model-chips"/);
  assert.match(html, /id="spec-preview"/);
  assert.match(html, /id="prompt-more-menu"[\s\S]*<section id="world-model-panel"[\s\S]*<pre id="spec-preview"/);
  assert.match(renderer, /function syncWorldModelReceipt/);
  assert.match(renderer, /function worldModelSnapshot/);
  assert.match(renderer, /simulatte\.visibleWorldModelReceipt\.v1/);
  assert.match(renderer, /templateId: spec\.templateId/);
  assert.match(renderer, /function renderProgramPreviewPlan/);
  assert.match(renderer, /function renderProgramPreviewVisualIR/);
  assert.match(renderer, /rendererPlan: renderProgramPreviewPlan\(spec\.renderProgram\.rendererPlan\)/);
  assert.match(renderer, /visualIR: renderProgramPreviewVisualIR\(spec\.renderProgram\.visualIR\)/);
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
  const renderer = runtimeSource('prompt-controller.js');
  const graph = runtimeSource('simulatte-composition-graph.js');
  const registry = runtimeSource('simulatte-render-registry.js');
  const webgpuRenderer = runtimeSource('simulatte-webgpu-renderer.js');
  const loadingCanvas = runtimeSource('loading-canvas.js');

  for (const token of [
    'WEBGPU_BACKGROUND_SHADER',
    'backgroundSceneMix',
    'backgroundVs',
    'backgroundFs',
    'WEBGPU_OBJECT_SHADER',
    'ObjectPart',
    'objectParts',
    'objectVs',
    'objectFs',
    'objectPartMask',
    'objectEllipse',
    'objectCapsule',
    'objectTriangle',
    'objectRing',
    'objectStar',
    'objectSpiral',
    'objectWave',
    'scenePacketObjectParts',
    'scenePacketObjectPartStorageVector',
    'scenePacketObjectRealization',
    'VISUAL_IR_LAYER_SLOTS',
    'visualIrLayerVector',
    'SCENE_MIX_SLOTS',
    'scenePacketUniformVector',
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
  assert.doesNotMatch(webgpuRenderer, /sceneGroup ==/);
  for (const pass of ['coil-field', 'film-frame', 'bead-stream', 'cooling-fins']) {
    assert.match(graph, new RegExp(pass));
  }
  assert.match(graph, /simulatte\.visualGenome\.v1/);
  assert.match(graph, /simulatte\.compiledVisualDna\.v1/);
  assert.match(graph, /simulatte\.semanticVisualPlan\.v1/);
  assert.match(graph, /simulatte\.sceneRenderPacketUniforms\.v1/);
  assert.match(graph, /simulatte\.sceneRenderCodes\.v1/);
  assert.match(graph, /function visualGenomeForComposition/);
  assert.match(graph, /function compiledDnaForGenome/);
  assert.match(graph, /function semanticVisualsForGenome/);
  assert.match(graph, /function compositionPromptText/);
  assert.match(graph, /renderIR\.prompt/);
  assert.doesNotMatch(graph, /const promptText = '';/);
  assert.match(graph, /deterministic-compiled-artifact-seeded/);
});

test('phase 8 renders compiled scene packets without semantic inference', () => {
  const webgpuRenderer = runtimeSource('simulatte-webgpu-renderer.js');
  const graph = runtimeSource('simulatte-composition-graph.js');

  const vectorBody = webgpuRenderer.match(/function visualIrLayerVector\(packet\) \{[\s\S]*?return compressVisualIrLayerVector\(vector\);\n\s*\}/);
  assert.ok(vectorBody, 'visualIrLayerVector should be parseable');
  assert.match(vectorBody[0], /scenePacketUniformVector\(packet, 'visualLayers', VISUAL_IR_LAYER_SLOTS\.length\)/);
  assert.match(vectorBody[0], /addScenePacketLayers\(vector, packet\)/);
  assert.doesNotMatch(vectorBody[0], /visualIR\.|renderIR\.|graphicsAtoms|renderProgram|visualTextFromSpec|Evidence/);
  assert.match(graph, /function scenePacketRenderCodes/);
  assert.match(graph, /schema: 'simulatte\.sceneRenderCodes\.v1'/);
  assert.match(graph, /schema: 'simulatte\.sceneRenderPacketUniforms\.v1'/);
  assert.match(graph, /source: 'sceneRenderPacket\.renderCodes'/);
  assert.match(webgpuRenderer, /row\.renderCodes \|\| \{\}/);
  assert.match(webgpuRenderer, /codes\.semanticCode/);
  assert.doesNotMatch(webgpuRenderer, /function visualTextFromSpec|function refineSceneKindFromText|function sceneKindFromSpec|function graphicsAtomFeatureVector|function composedSceneVector/);
  assert.doesNotMatch(webgpuRenderer, /color = sceneRenderPacketScene\(p, t, color\)/);
  assert.match(webgpuRenderer, /function scenePacketObjectParts/);
  assert.match(webgpuRenderer, /function scenePacketObjectPartStorageVector/);
  assert.match(webgpuRenderer, /const objectRealization = scenePacketObjectRealization\(packet\)/);
  assert.match(webgpuRenderer, /pass\.draw\(6, this\.objectPartCount, 0, 0\)/);
  assert.match(graph, /simulatte\.objectGeometryProgram\.v1/);

  const shaderBody = webgpuRenderer.match(/fn objectPartMask\(local: vec2f, shape: f32\) -> f32 \{[\s\S]*?return objectBox\(local, 0\.12\);\n\}/);
  assert.ok(shaderBody, 'objectPartMask should be parseable');
  for (const primitive of [
    'objectEllipse',
    'objectBox',
    'objectCapsule',
    'objectTriangle',
    'objectRing',
    'objectStar',
    'objectSpiral',
    'objectWave',
  ]) assert.match(shaderBody[0], new RegExp(primitive));
});

test('WebGPU scene ids and object-part contracts cover emitted visual artifacts', () => {
  const webgpuRenderer = runtimeSource('simulatte-webgpu-renderer.js');
  const sceneBlock = webgpuRenderer.match(/const SCENE_IDS = Object\.freeze\(\{([\s\S]*?)\n\s*\}\);/);
  assert.ok(sceneBlock, 'SCENE_IDS block should be parseable');
  const sceneIds = Object.fromEntries(
    Array.from(sceneBlock[1].matchAll(/['"]?([a-z0-9-]+)['"]?:\s*(\d+)/g))
      .map((match) => [match[1], Number(match[2])])
  );
  assert.ok(Object.keys(sceneIds).length >= 40);
  assert.equal(sceneIds.cryosphere, sceneIds['ocean-cryosphere']);
  assert.notEqual(sceneIds['material-tray'], sceneIds['chemistry-lab']);
  assert.notEqual(sceneIds['cultural-material'], sceneIds.granular);
  assert.match(webgpuRenderer, /fn backgroundSceneMix/);
  assert.match(webgpuRenderer, /const OBJECT_PART_SHAPE_CODES = Object\.freeze/);
  assert.match(webgpuRenderer, /pass\.draw\(6, this\.objectPartCount, 0, 0\)/);
  assert.doesNotMatch(webgpuRenderer, /sceneGroup ==|fn\s+atom[A-Za-z0-9_]+\s*\(/);
  assert.ok(visualOperatorAtlas.VISUAL_OPERATOR_MAPPINGS.every((row) => (
    Array.isArray(row.uniformSlots) && row.uniformSlots.length > 0
  )));
});

test('physics graph debug data is explicit and does not log every compiled world', () => {
  const renderer = runtimeSource('prompt-controller.js');

  assert.match(renderer, /logGraphDebug\(spec\)/);
  assert.match(renderer, /function graphDebugEnabled/);
  assert.match(renderer, /__SIMULATTE_GRAPH_DEBUG__ === true/);
  assert.match(renderer, /function logGraphDebug/);
  assert.match(renderer, /if \(!graphDebugEnabled\(\)/);
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

test('pipeline phases consume only neighboring compiled artifacts after intent grounding', () => {
  const model = runtimeSource('simulatte-physics-model.js');
  const physicsIR = runtimeSource('simulatte-physics-ir.js');
  const composition = runtimeSource('simulatte-composition-graph.js');
  const webgpu = runtimeSource('simulatte-webgpu-renderer.js');
  const visualOperatorCompiler = runtimeSource('simulatte-visual-operator-compiler.js');
  const activationCloud = runtimeSource('simulatte-activation-cloud.js');
  const physicsIRCall = model.match(/nextIR = buildPhysicsIR\(\{\s*universeGraph,[\s\S]*?\n\s*\}\);/);
  const directLanguageText = visualOperatorCompiler.match(/function directLanguageText\(context = \{\}\) \{[\s\S]*?\n  \}/);

  assert.ok(physicsIRCall, 'physics model should compile PhysicsIR through a visible call site');
  assert.match(physicsIRCall[0], /buildPhysicsIR\(\{\s*universeGraph,/);
  assert.doesNotMatch(physicsIRCall[0], /prompt,/);
  assert.doesNotMatch(physicsIRCall[0], /promptParse,/);
  assert.match(physicsIR, /const prompt = universeGraph\.prompt \|\| ''/);
  assert.doesNotMatch(physicsIR, /input\.prompt \|\| universeGraph\.prompt/);

  assert.match(model, /function createPhaseEnvelope/);
  assert.match(model, /schema: phaseOutputSchema\(phaseNumber\)/);
  const phaseContractsSource = fs.readFileSync(
    path.join(publicDir, 'pipeline', 'simulatte-phase-contracts.js'),
    'utf8'
  );
  assert.match(phaseContractsSource, /const PHASE_CONTRACTS = Object\.freeze/);
  assert.match(model, /missing artifact\.\$?\{?key/);
  assert.match(model, /unexpected artifact\.\$?\{?key/);
  assert.match(model, /contains forbidden upstream field/);
  assert.match(model, /function runPhase3Retrieval\(phase2Output, runtimeContext = \{\}\)/);
  assert.doesNotMatch(model, /function runPhase3Retrieval\(phase2Output, runtimeContext = \{\}, retrievalEvidence/);
	  assert.match(model, /const query = String\(languageGraph\.sourceText \|\| ''\)/);
	  assert.match(model, /SCENE_COMPOSITION_LEDGER_SCHEMA = 'simulatte\.sceneCompositionLedger\.v1'/);
	  assert.match(model, /SCENE_LANGUAGE_GRAPH_SCHEMA = 'simulatte\.sceneLanguageGraph\.v1'/);
	  assert.match(model, /SCENE_QUERY_PLAN_SCHEMA = 'simulatte\.sceneQueryPlan\.v1'/);
	  assert.match(model, /function retrievalGroundingEvidence\(\s*retrievalEvidence = \{\},\s*primitiveCuration = \{\},\s*typedEvidenceBuckets = null,\s*compositionLedger = null,/);
	  assert.match(model, /function phase3TypedEvidenceBuckets\(curation = \{\}, languageGraph = \{\}\)/);
	  assert.match(model, /function queryPlanFromSceneLanguageGraph\(sceneLanguageGraph = \{\}\)/);
		  assert.match(model, /function phase3SlotEvidence\(queryPlan = \{\}, typedEvidenceBuckets = \{\}, rankedCards = \[\], rankedUniverseRows = \[\], slotRetrieval = null\)/);
	  assert.match(model, /function phase3CompositionLedger\(\s*typedEvidenceBuckets = \{\},\s*languageGraph = \{\},\s*sourceLedger = null,/);
  assert.match(model, /const activationCloud = activationCloudFromPhase3Artifact\(artifact\)/);
  assert.match(model, /const groundingEvidence = retrievalRerankResult\.groundingEvidence \|\| \{\}/);
  assert.match(model, /function runPhase4GroundedIntent\(phase3Output, runtimeContext = \{\}\)/);
  assert.match(model, /const groundingEvidence = activationCloud\.groundingEvidence \|\| \{\}/);
  assert.match(model, /function runPhase5SimulationCompile\(phase4Output, runtimeContext = \{\}\)/);
  assert.doesNotMatch(model, /function runPhase4ActivationCloud\(phase3Output, runtimeContext = \{\}, activationEvidence/);
  assert.doesNotMatch(model, /function runPhase4GroundedIntent\(phase4Output, runtimeContext = \{\}, groundedEvidence/);
  assert.doesNotMatch(model, /function runPhase5SimulationCompile\(phase4Output, runtimeContext = \{\}, compiled/);
  assert.match(model, /function phase6InputFromSimulationCompile\(phase5Output\)/);
  assert.match(model, /function compilePhase6VisualProgram\(phase5Output, compositionGraph = null\)/);
  assert.doesNotMatch(model, /function createVisualCompileEnvelope\(phase5Output, compositionGraph = null, renderProgram/);
	  assert.match(model, /renderExecutionInput source expected/);
	  const renderProofSource = fs.readFileSync(
	    path.join(publicDir, 'pipeline', 'phase-07-render', 'simulatte-render-proof.js'),
	    'utf8'
	  );
	  assert.match(renderProofSource, /function renderObligationProof\(/);
	  assert.doesNotMatch(model, /function renderObligationProof\(/);
	  assert.doesNotMatch(model, /source && source\.visualCompile/);
  assert.match(model, /Phase 7 input expected sceneRenderPacket simulatte\.sceneRenderPacket\.v1/);
  assert.match(model, /buildCompositionGraph\(phase6Input\)/);
  assert.match(model, /compileCompositionToRenderProgram\(nextCompositionGraph, phase6Input\)/);
  assert.match(composition, /const conceptGraph = Array\.isArray\(universeGraph\.nodes\)/);
  assert.match(composition, /const brief = spec && spec\.renderIR && spec\.renderIR\.intentBriefReceipt/);
  assert.match(composition, /function visualObjectAcceptanceLedger/);
  assert.match(composition, /simulatte\.visualObjectAcceptanceLedger\.v1/);
  assert.match(composition, /simulatte\.renderInstance\.v1/);
  assert.match(composition, /function renderInstanceTransform/);
  assert.match(composition, /function renderInstanceGeometry/);
  assert.match(composition, /function renderInstanceMaterial/);
  assert.match(composition, /function renderInstanceAnimation/);
  assert.match(composition, /function renderInstanceCollider/);
  assert.match(composition, /function lowerSwimmingVisualObligations\(spec = \{\}, entities = \[\], sceneKind = ''\)/);
  assert.match(composition, /function swimmingAgentSpecies\(entity = \{\}\)/);
  assert.match(composition, /function swimmingEntityIdentityText\(entity = \{\}\)/);
  assert.match(composition, /function swimmingWaterEntityText\(entity = \{\}\)/);
  assert.match(composition, /if \(swimmingAgentSpecies\(entity\)\) return false/);
  assert.match(composition, /function wakeFieldRowsForSwimmingAgents\(agents = \[\]\)/);
  assert.match(composition, /function swimmingEffectRowsForAgents\(agents = \[\]\)/);
  assert.match(composition, /function lowerSwimmingAgentEntity\(entity = \{\}, index = 0, total = 1, sceneKind = ''\)/);
  assert.match(composition, /kind: 'agent'/);
  assert.match(composition, /visual:wake:\$\{visualSafeId\(entity\.id\)\}/);
  assert.match(composition, /visual:submersion:\$\{visualSafeId\(entity\.id\)\}/);
  assert.match(composition, /speciesSwimMaterialId\(species\)/);
  assert.match(composition, /supportObjects: objectLedger\.rejected/);
  assert.doesNotMatch(composition, /const intent = spec\.intent/);
  assert.doesNotMatch(composition, /intent\.conceptGraph/);
  assert.doesNotMatch(composition, /spec\.intent\.synthesis/);
  assert.doesNotMatch(composition, /spec\.intent\.prompt/);
  assert.doesNotMatch(composition, /spec\.intent\.intentBrief/);
  assert.doesNotMatch(composition, /spec\.prompt(?!Parse)/);
  assert.doesNotMatch(composition, /spec\.renderProgram/);

  assert.doesNotMatch(webgpu, /sceneRenderPacketFromSpec/);
  assert.match(webgpu, /function sceneRenderPacketFromExecutionInput/);
  assert.match(webgpu, /setRenderExecutionInput\(renderExecutionInput\)/);
  assert.match(webgpu, /simulatte\.renderExecutionInput\.v1/);
  assert.match(webgpu, /received bare simulatte\.sceneRenderPacket\.v1/);
  assert.match(webgpu, /Phase 7 expected inputSchema/);
  assert.doesNotMatch(webgpu, /return renderExecutionInput;/);
  assert.doesNotMatch(webgpu, /spec\.intent/);
  assert.doesNotMatch(webgpu, /renderProgram/);
  assert.doesNotMatch(webgpu, /renderIR/);
  assert.doesNotMatch(webgpu, /retrieval/);
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
  const renderer = runtimeSource('prompt-controller.js');
  const runtimeProgress = runtimeSource('runtime-progress.js');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

  assert.match(runtimeProgress, /function compactRuntimeMessage/);
  assert.match(runtimeProgress, /function runtimeLineText/);
  assert.match(runtimeProgress, /function runtimeTimingSuffix/);
  assert.match(renderer, /function intentTraceEnabled/);
  assert.match(runtimeProgress, /function logRuntimeProgress/);
  assert.match(renderer, /function unregisterLegacyModelCacheWorker/);
  assert.match(runtimeProgress, /function passiveEvent/);
  assert.match(runtimeProgress, /function createRuntimeHealthObserver/);
  assert.match(runtimeProgress, /SimulatteIntentRuntimeHealth/);
  assert.match(runtimeProgress, /__simulatteIntentRuntimeEvents/);
  assert.match(runtimeProgress, /node\.dataset\.health/);
  assert.match(runtimeProgress, /node\.dataset\.blocking/);
  assert.match(renderer, /traceEmbeddings: intentTraceEnabled\(root\.defaultView\)/);
  assert.match(renderer, /unregisterLegacyModelCacheWorker\(root\.defaultView\)/);
  assert.match(runtimeProgress, /cache-skip/);
  assert.match(runtimeProgress, /cache-read/);
  assert.match(runtimeProgress, /runtimeResourceSuffix/);
  assert.match(runtimeProgress, /model-reuse/);
	  assert.match(runtimeProgress, /prompt-embed/);
	  assert.match(runtimeProgress, /span-cache/);
	  assert.match(runtimeProgress, /slot-retrieval/);
	  assert.match(runtimeProgress, /embeddedSlotCount/);
	  assert.match(renderer, /function retrievalQueryPlanForPrompt/);
	  assert.match(runtimeProgress, /Runtime dtype mismatch/);
  assert.match(runtimeProgress, /embedModel\(Id\|Hash\) mismatch/);
  assert.match(runtimeProgress, /Intent model unavailable/);
  assert.match(renderer, /console\.error\('\[simulatte\.intent\] model-backed intent failed'/);
  assert.match(renderer, /function reportIntentFailure/);
  assert.doesNotMatch(renderer, /function resolveWithoutEmbedding/);
  assert.doesNotMatch(renderer, /Local graph ready/);
  assert.doesNotMatch(renderer, /using local graph fallback/);
	  assert.doesNotMatch(renderer, /createSpecFromPrompt\(prompt, \{[\s\S]{0,120}allowPrototypeFallback: true/);
  assert.doesNotMatch(renderer, /applyIntentResult\(preview/);
  assert.doesNotMatch(renderer, /onPreview: \(preview\) => \{\n\s+applyIntentResult/);
  assert.match(runtimeProgress, /node\.dataset\.detail = String\(state\.line/);
  assert.match(runtimeProgress, /node\.dataset\.subline = String\(subline/);
  assert.match(runtimeProgress, /node\.dataset\.byteText = String\(state\.byteText/);
  assert.match(runtimeProgress, /node\.dataset\.sourceText = String\(state\.sourceText/);
  assert.match(runtimeProgress, /node\.dataset\.loaderReceipt = state\.loaderReceipt/);
  assert.match(runtimeProgress, /node\.dataset\.heartbeat = heartbeatActive \? 'true' : 'false'/);
  assert.match(runtimeProgress, /node\.dataset\.activity = String\(state\.activity/);
  assert.match(runtimeProgress, /elements\.title\.textContent = titleLine/);
  assert.match(runtimeProgress, /elements\.stage\.textContent = subline \|\| state\.phase\.label/);
  assert.match(runtimeProgress, /LOADER_RECEIPT_SCHEMA = 'simulatte\.loaderPhaseReceipt\.v2'/);
  assert.match(runtimeProgress, /__simulatteLoaderPhaseReceipts/);
  assert.match(runtimeProgress, /__simulatteRuntimeProgressLogs/);
  assert.match(runtimeProgress, /__simulatteRuntimePerformanceLogs/);
  assert.match(runtimeProgress, /function runtimeByteProgressState/);
  assert.match(runtimeProgress, /function runtimeSublineText/);
  assert.match(runtimeProgress, /return `\$\{label\} \$\{percent\}%\$\{resource\}\$\{timing\}`/);
  assert.match(runtimeProgress, /'grounding\.intent', 'Grounding intent'/);
  assert.match(runtimeProgress, /'visual\.visual-ir', 'Building VisualIR'/);
  assert.match(runtimeProgress, /'render\.first-frame', 'Rendering scene'/);
  assert.match(runtimeProgress, /return 'Ready 100%'/);
  assert.match(html, /\.prompt-dock \.intent-runtime-percent \{[\s\S]*display: block;/);
  assert.match(html, /\.prompt-dock \.intent-runtime-track,[\s\S]*\.prompt-dock \.intent-runtime-meta \{\n\s+display: none;/);
  assert.match(html, /\.prompt-dock \.intent-runtime-detail \{[\s\S]*display: block;/);
  assert.match(html, /runtime-detail-heartbeat/);
  assert.match(html, /runtime-pastel-flow/);
  assert.match(html, /runtime-heartbeat-pulse/);
  assert.match(html, /data-heartbeat="true"/);
  assert.doesNotMatch(runtimeProgress, /node\.title = String\(state\.detail/);
});

test('composition shape inference does not classify catalog provenance as cats', () => {
  const graph = runtimeSource('simulatte-composition-graph.js');

  assert.ok(graph.includes('/\\b(mouse|gerbil|hamster|dog|cat|animal|organism)\\b/'));
  assert.doesNotMatch(graph, /\/mouse\|gerbil\|hamster\|dog\|cat\|animal\|organism\//);
});

test('Firebase hosting revalidates app lab and app JavaScript', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const deployCheck = fs.readFileSync(path.join(root, 'tools', 'check-deploy-surface.mjs'), 'utf8');
  const developmentSync = fs.readFileSync(path.join(root, 'tools', 'sync-doppler-development.mjs'), 'utf8');
  const modelLockUtils = fs.readFileSync(path.join(root, 'tools', 'model-runtime-lock-utils.mjs'), 'utf8');
  const headers = config.hosting.headers;
  assert.equal(config.hosting.predeploy, 'npm run check:deploy && npm run stamp:build');
  assert.equal(pkg.scripts['sync:doppler:development'], 'node tools/sync-doppler-development.mjs --write');
  assert.equal(pkg.scripts['check:doppler:development'], 'node tools/sync-doppler-development.mjs --check');
  assert.equal(pkg.scripts['sync:model-lock-references'], 'node tools/sync-model-runtime-lock-references.mjs --write');
  assert.equal(pkg.scripts['check:model-lock-references'], 'node tools/sync-model-runtime-lock-references.mjs --check');
  assert.equal(
    pkg.scripts['check:model-lock'],
    'npm run check:model-lock-references && node tools/check-model-runtime-lock.mjs && npm run check:doppler:development'
  );
  assert.equal(pkg.scripts['check:deploy'], 'npm run check:model-lock && node tools/check-deploy-surface.mjs');
  assert.match(deployCheck, /public\/vendor\/doppler/);
  assert.match(deployCheck, /readModelRuntimeLock/);
  assert.match(modelLockUtils, /model-runtime-lock\.json/);
  assert.match(deployCheck, /MODEL_RUNTIME_LOCK\.doppler/);
  assert.match(deployCheck, /npm', \[\n\s+'pack',/);
  assert.match(deployCheck, /vendor file contents differ from the published Doppler package/);
  assert.match(developmentSync, /sibling-git-archive/);
  assert.match(developmentSync, /git', \['archive'/);
  assert.match(developmentSync, /public', 'vendor', 'doppler'/);
  assert.match(developmentSync, /const sourceSha = WRITE \? siblingHead : development\.gitSha/);
  assert.match(developmentSync, /validating pinned lock/);
  assert.doesNotMatch(developmentSync, /fail\(`sibling HEAD/);
  assert.match(developmentSync, /packagePin\.integrity = entry\.integrity/);
  assert.match(developmentSync, /development\.gitSha = sourceSha/);
  assert.doesNotMatch(deployCheck, /git', \['status', '--porcelain=v1'/);
  const noCacheSources = new Set(headers
    .filter((entry) => entry.headers.some((header) => (
      header.key === 'Cache-Control' && header.value === 'no-cache'
    )))
    .map((entry) => entry.source));

  assert.ok(noCacheSources.has('/'));
  assert.ok(noCacheSources.has('/index.html'));
  assert.ok(noCacheSources.has('/app/**'));
  assert.ok(noCacheSources.has('/pipeline/**'));
  assert.ok(noCacheSources.has('/workers/**'));
  assert.equal(noCacheSources.has('/simulatte-model-cache-sw.js'), false);
  assert.ok(noCacheSources.has('/vendor/doppler/**'));
});

test('model-backed intent retrieval uses a 1024d Qwen index and required reranker', () => {
  const manifestPath = path.join(root, 'public', 'data', 'simulatte-embedder', 'manifest.json');
  const indexPath = path.join(root, 'public', 'data', 'simulatte-embedder', 'primitive-index-v2.json');
  const cardIndexPath = path.join(root, 'public', 'data', 'simulatte-embedder', 'surface-card-index-qwen-v1.json');
  const intentEvidencePath = path.join(root, 'public', 'data', 'simulatte-embedder', 'intent-evidence-contract-v1.json');
  const retiredEmbeddingGemmaCardIndexPath = path.join(root, 'public', 'data', 'simulatte-embedder', 'surface-card-index-embeddinggemma-v1.json');
  const retiredCardIndexPath = path.join(root, 'public', 'data', 'simulatte-embedder', 'surface-card-index-v1.json');
  const retiredIndexPath = path.join(root, 'public', 'data', 'simulatte-embedder', 'primitive-index-v1.json');
  const retiredEncoderPath = path.join(root, 'public', 'data', 'simulatte-intent-embed-v1.json');
  const universeManifestPath = path.join(root, 'public', 'data', 'simulatte-universe', 'manifest.json');
  const runtime = runtimeSource('simulatte-intent-embedder.js');
  const dopplerRuntime = fs.readFileSync(
    path.join(root, 'public', 'vendor', 'doppler', 'src', 'client', 'runtime', 'index.js'),
    'utf8'
  );
  const dopplerModelSource = fs.readFileSync(
    path.join(root, 'public', 'vendor', 'doppler', 'src', 'client', 'runtime', 'model-source.js'),
    'utf8'
  );
  const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const modelRuntimeLock = JSON.parse(fs.readFileSync(
    path.join(root, 'public', 'data', 'simulatte-embedder', 'model-runtime-lock.json'),
    'utf8'
  ));
  const manifest = {
    ...rawManifest,
    embedModel: modelRuntimeLock.embedding,
    reranker: modelRuntimeLock.reranker,
    retrieval: {
      ...rawManifest.retrieval,
      dimensions: modelRuntimeLock.embedding.dimensions,
      cards: { ...rawManifest.retrieval.cards, dimensions: modelRuntimeLock.embedding.dimensions },
      universe: { ...rawManifest.retrieval.universe, dimensions: modelRuntimeLock.embedding.dimensions },
    },
    runtime: {
      ...modelRuntimeLock.runtime,
      moduleUrl: modelRuntimeLock.doppler.moduleUrl,
      deviceModuleUrl: modelRuntimeLock.doppler.deviceModuleUrl,
      storageModuleUrl: modelRuntimeLock.doppler.storageModuleUrl,
      runtimeConfig: modelRuntimeLock.embedding.runtimeConfig,
    },
    runtimeOrder: modelRuntimeLock.runtimeOrder,
    cache: modelRuntimeLock.cache,
  };
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const cardIndex = JSON.parse(fs.readFileSync(cardIndexPath, 'utf8'));
  const rawUniverseManifest = JSON.parse(fs.readFileSync(universeManifestPath, 'utf8'));
  const universeManifest = { ...rawUniverseManifest, embedModel: modelRuntimeLock.embedding };
  const packedBytes = Buffer.from(index.embeddingsPackedBase64, 'base64');
  const cardPackedBytes = Buffer.from(cardIndex.embeddingsPackedBase64, 'base64');

  assert.equal(
    (runtime.match(/input\.onProgress\(\{ completed: 0, total: input\.candidates\.length \}\)/g) || []).length,
    2
  );

  assert.equal(manifest.schema, 'simulatte.modelBackedEmbedderManifest.v3');
  assert.equal(manifest.id, 'simulatte-model-backed-intent-retrieval-v1');
  assert.equal(rawManifest.modelRuntimeLock.id, modelRuntimeLock.id);
  assert.equal(rawManifest.modelRuntimeLock.number, modelRuntimeLock.number);
  assert.equal(modelRuntimeLock.schema, 'simulatte.modelRuntimeLock.v1');
  assert.equal(modelRuntimeLock.number, 6);
  assert.equal(Object.hasOwn(rawManifest, 'embedModel'), false);
  assert.equal(Object.hasOwn(rawManifest, 'reranker'), false);
	  assert.equal(Object.hasOwn(rawManifest, 'runtime'), false);
	  assert.equal(Object.hasOwn(rawManifest, 'runtimeOrder'), false);
	  assert.equal(Object.hasOwn(rawManifest, 'cache'), false);
	  assert.equal(manifest.retrieval.kind, 'precomputed-primitive-index');
	  assert.equal(manifest.retrieval.artifact, './primitive-index-v2.json');
	  assert.equal(manifest.retrieval.artifactHash.hex, '1053238b844833b5f157f9519fdbc3a2c6aaa4581b4fd134affd30a0158fd791');
	  assert.equal(manifest.retrieval.dimensions, 1024);
	  assert.equal(manifest.retrieval.rerank, 'mandatory');
	  assert.equal(manifest.retrieval.cards.kind, 'precomputed-surface-card-index');
	  assert.equal(manifest.retrieval.cards.artifact, './surface-card-index-qwen-v1.json');
	  assert.equal(manifest.retrieval.cards.artifactHash.hex, 'feddce7cfdff749402bbad7aa22f4be65a919d3c26c7bf3d43b8cd4e514c5b81');
	  assert.equal(manifest.retrieval.cards.dimensions, 1024);
	  assert.equal(manifest.retrieval.cards.rerank, 'mandatory');
	  assert.equal(
	    manifest.retrieval.intentEvidence.artifactHash.hex,
	    crypto.createHash('sha256').update(fs.readFileSync(intentEvidencePath)).digest('hex')
	  );
	  assert.equal(manifest.retrieval.slotLevel.schema, 'simulatte.slotLevelEmbeddingConfig.v1');
	  assert.equal(manifest.retrieval.slotLevel.mode, 'typed-scene-slot-embedding-rerank');
	  assert.equal(manifest.retrieval.slotLevel.primitiveRankBackend, 'auto');
	  assert.equal(manifest.retrieval.universe.artifact, '../simulatte-universe/manifest.json');
  assert.equal(manifest.retrieval.universe.dimensions, 1024);
  assert.equal(manifest.reranker.schema, 'simulatte.intentRerankerConfig.v1');
  assert.equal(manifest.reranker.id, 'simulatte.doppler-intent-reranker.v1');
  assert.equal(manifest.reranker.kind, 'doppler-reranker');
  assert.equal(manifest.reranker.phase, 3);
  assert.equal(manifest.reranker.executeInPhase, 3);
  assert.equal(manifest.reranker.enabled, true);
  assert.equal(manifest.reranker.required, true);
  assert.equal(manifest.reranker.loadInPhase1WhenRequired, true);
  assert.equal(manifest.reranker.inputSchema, 'simulatte.intentRerankInput.v1');
  assert.equal(manifest.reranker.outputSchema, 'simulatte.intentRerank.v1');
  assert.equal(manifest.reranker.maxCandidatesPerCall, 8);
  assert.equal(manifest.reranker.maxSlotCandidatesPerCall, 2);
  assert.equal(manifest.reranker.maxCandidateTermsPerDocument, 32);
  assert.equal(manifest.reranker.scoreCacheMaxEntries, 256);
  assert.equal(manifest.reranker.fallbackMode, 'heuristic-fusion');
  assert.equal(manifest.reranker.execution.selectedTokenLogits, 'required');
  assert.equal(manifest.reranker.execution.prefixKvReuse, 'required');
  assert.equal(manifest.reranker.execution.statefulPrefixReuse, 'required');
  assert.ok(manifest.reranker.candidateScope.includes('primitive'));
  assert.ok(manifest.reranker.candidateScope.includes('span'));
  assert.equal(manifest.reranker.model.id, 'qwen-3-reranker-0-6b-q4k-ehf16-af32');
  assert.equal(manifest.reranker.model.manifestHash.hex, '6b1eaca7f3fba2f78a7676a7912442877b85d6f01c083f62759b9c5dd6496a9e');
  assert.match(manifest.reranker.model.defaultModelBaseUrl, /f86fe245b9bbc275cd69af46b1d45d47ea685a55\/models\/qwen-3-reranker-0-6b-q4k-ehf16-af32$/);
  assert.equal(manifest.reranker.runtimeConfig.inference.session.compute.defaults.activationDtype, 'f32');
  assert.equal(manifest.reranker.runtimeConfig.inference.session.compute.defaults.mathDtype, 'f32');
  assert.equal(manifest.reranker.runtimeConfig.inference.session.compute.defaults.accumDtype, 'f32');
  assert.equal(manifest.reranker.runtimeConfig.inference.session.compute.defaults.outputDtype, 'f32');
  assert.equal(manifest.reranker.runtimeConfig.inference.session.kvcache.kvDtype, 'f16');
  assert.equal(manifest.reranker.runtimeConfig.inference.session.kvcache.layout, 'contiguous');
  assert.equal(manifest.reranker.runtimeConfig.inference.session.kvcache.tiering.mode, 'off');
  assert.equal(manifest.reranker.runtimeConfig.inference.compute.rangeAwareSelectiveWidening.enabled, true);
  assert.equal(manifest.reranker.runtimeConfig.inference.compute.rangeAwareSelectiveWidening.includeNonFinite, true);
  assert.equal(manifest.reranker.runtimeConfig.inference.compute.rangeAwareSelectiveWidening.absThreshold, 65500);
  assert.equal(manifest.reranker.runtimeConfig.inference.compute.rangeAwareSelectiveWidening.onTrigger, 'error');
  assert.equal(manifest.embedModel.id, 'qwen-3-embedding-0-6b-q4k-ehf16-af32');
  assert.equal(manifest.embedModel.family, 'qwen3-embedding');
  assert.equal(manifest.embedModel.modelType, 'embedding');
  assert.equal(manifest.embedModel.dimensions, 1024);
  assert.match(manifest.embedModel.defaultModelBaseUrl, /^https:\/\/huggingface\.co\/Clocksmith\/rdrr\/resolve\//);
  assert.match(manifest.embedModel.defaultModelBaseUrl, /049000f49325dca7db2ed2c9de2c8881bd0f4603\/models\/qwen-3-embedding-0-6b-q4k-ehf16-af32$/);
  assert.doesNotMatch(manifest.embedModel.defaultModelBaseUrl, /models\/local/);
  assert.equal(manifest.embedModel.source.kind, 'huggingface-rdrr');
  assert.equal(manifest.embedModel.source.sourceCheckpointId, 'Qwen/Qwen3-Embedding-0.6B');
  assert.equal(modelRuntimeLock.doppler.package.version, '0.4.8');
  assert.equal(modelRuntimeLock.doppler.development.kind, 'sibling-git-archive');
  assert.match(modelRuntimeLock.doppler.development.gitSha, /^[0-9a-f]{40}$/);
  assert.equal(manifest.runtime.moduleUrl, '../../vendor/doppler/src/index.js');
  assert.equal(manifest.runtime.deviceModuleUrl, '../../vendor/doppler/src/tooling-exports/device.js');
  assert.equal(manifest.runtime.storageModuleUrl, '../../vendor/doppler/src/tooling-exports/storage.js');
  assert.equal(manifest.runtime.queryEmbeddingMode, 'last');
  assert.equal(manifest.runtime.embeddingText.schema, 'simulatte.embeddingTextContract.v1');
  assert.match(manifest.runtime.embeddingText.queryPrefix, /^Instruct: Given a web search query/);
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.activationDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.mathDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.accumDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.compute.defaults.outputDtype, 'f32');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.kvcache.kvDtype, 'f16');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.kvcache.layout, 'contiguous');
  assert.equal(manifest.runtime.runtimeConfig.inference.session.kvcache.tiering.mode, 'off');
  const embeddingConversion = JSON.parse(fs.readFileSync(
    path.join(root, 'public', 'vendor', 'doppler', 'src', 'config', 'conversion', 'qwen3', 'qwen-3-embedding-0-6b-q4k-ehf16-af32.json'),
    'utf8'
  ));
  const rerankerConversion = JSON.parse(fs.readFileSync(
    path.join(root, 'public', 'vendor', 'doppler', 'src', 'config', 'conversion', 'qwen3', 'qwen-3-reranker-0-6b-q4k-ehf16-af32.json'),
    'utf8'
  ));
  assert.equal(
    manifest.runtime.runtimeConfig.inference.session.kvcache.kvDtype,
    embeddingConversion.session.kvcache.kvDtype
  );
  assert.equal(
    manifest.reranker.runtimeConfig.inference.session.kvcache.kvDtype,
    rerankerConversion.session.kvcache.kvDtype
  );
  assert.match(embeddingConversion.execution.kernels.attn_decode.kernel, /_f16kv\.wgsl$/);
  assert.match(embeddingConversion.execution.kernels.attn_stream.kernel, /_f16kv\.wgsl$/);
  assert.match(rerankerConversion.execution.kernels.attn_decode.kernel, /_f16kv\.wgsl$/);
  assert.match(rerankerConversion.execution.kernels.attn_stream.kernel, /_f16kv\.wgsl$/);
  assert.equal(manifest.cache.namespace, 'simulatte-doppler-qwen-runtime-lock-4');
  assert.equal(manifest.cache.owner, 'doppler');
  assert.equal(manifest.cache.prefetch, true);
  assert.equal(manifest.cache.strategy, 'doppler-opfs-verified');
  assert.equal(Object.hasOwn(manifest.cache, 'opfsRoot'), false);
  assert.ok(manifest.cache.storage.includes('Doppler'));
  assert.equal(manifest.cache.storage.includes('OPFS'), true);
  assert.equal(manifest.cache.storage.includes('CacheStorage'), false);
  assert.equal(manifest.cache.storage.includes('ServiceWorker'), false);
  assert.equal(Object.hasOwn(manifest.cache, 'worker'), false);
  assert.equal(manifest.cache.requirePersistent, true);
  assert.equal(manifest.embedModel.manifestHash.hex, index.embedModelHash.hex);
  assert.equal(manifest.embedModel.manifestHash.hex, cardIndex.embedModelHash.hex);
  assert.equal(manifest.embedModel.manifestHash.hex, 'aa8b96509f17ba0c949aee6891abd0459883d0c4be761f666242240a97e9d979');
  assert.equal(index.schema, 'simulatte.primitiveEmbeddingIndex.v2');
  assert.equal(index.id, 'simulatte-primitive-qwen-3-embedding-0-6b-index-v1');
  assert.equal(index.embedModelId, 'qwen-3-embedding-0-6b-q4k-ehf16-af32');
  assert.equal(index.embeddingDim, 1024);
  assert.equal(catalog.PHYSICAL_PRIMITIVES.length, 420);
  assert.equal(index.documents.length, catalog.PHYSICAL_PRIMITIVES.length);
  assert.equal(index.documentCount, catalog.PHYSICAL_PRIMITIVES.length);
  assert.equal(packedBytes.byteLength, index.documents.length * index.embeddingDim * 4);
  assert.equal(cardIndex.schema, 'simulatte.surfaceCardEmbeddingIndex.v1');
  assert.equal(cardIndex.id, 'simulatte-surface-card-qwen-3-embedding-0-6b-index-v1');
  assert.equal(cardIndex.embedModelId, 'qwen-3-embedding-0-6b-q4k-ehf16-af32');
  assert.equal(cardIndex.embeddingDim, 1024);
  assert.ok(cardIndex.documents.length >= 650);
  assert.equal(cardPackedBytes.byteLength, cardIndex.documents.length * cardIndex.embeddingDim * 4);
  assert.equal(universeManifest.embedModel.id, manifest.embedModel.id);
  assert.equal(universeManifest.embedModel.dimensions, manifest.embedModel.dimensions);
  assert.equal(universeManifest.embedModel.manifestHash.hex, manifest.embedModel.manifestHash.hex);
  assert.equal(rawUniverseManifest.modelRuntimeLock.id, modelRuntimeLock.id);
  assert.equal(rawUniverseManifest.modelRuntimeLock.number, modelRuntimeLock.number);
  assert.equal(Object.hasOwn(manifest, 'fallback'), false);
  assert.equal(fs.existsSync(retiredEmbeddingGemmaCardIndexPath), false);
  assert.equal(fs.existsSync(retiredCardIndexPath), false);
  assert.equal(fs.existsSync(retiredIndexPath), false);
  assert.equal(fs.existsSync(retiredEncoderPath), false);
  assert.match(runtime, /navigator\.gpu/);
  assert.match(runtime, /runtimeConfig/);
  assert.match(runtime, /manifestUrl/);
  assert.match(runtime, /MODEL_RUNTIME_LOCK_SCHEMA = 'simulatte\.modelRuntimeLock\.v1'/);
  assert.match(runtime, /model runtime lock forbids source overrides/);
  assert.match(runtime, /ensureDopplerKernelBasePath/);
  assert.match(runtime, /ensureDopplerKernelBasePath\(options\.kernelBasePath\);\n\s*const direct = options\.dopplerModule \|\| null;/);
  assert.match(runtime, /model-backed intent requires Doppler load/);
  assert.match(runtime, /primitive embedding index/);
  assert.match(runtime, /surface card embedding index/);
  assert.match(runtime, /rankSurfaceCards/);
  assert.match(runtime, /cardMatches/);
  assert.doesNotMatch(runtime, /ensureModelArtifactCache/);
  assert.match(runtime, /const rawProgress = Number\.isFinite\(rawPercent\) \? rawPercent : Number\(event\.progress\)/);
  assert.match(runtime, /EMBEDDING_CACHE_PROGRESS = Object\.freeze\(\{ start: 20, end: 42 \}\)/);
  assert.match(runtime, /EMBEDDING_LOAD_PROGRESS = Object\.freeze\(\{ start: 42, end: 72 \}\)/);
  assert.match(runtime, /RERANKER_CACHE_PROGRESS = Object\.freeze\(\{ start: 42, end: 72 \}\)/);
  assert.match(runtime, /RERANKER_LOAD_PROGRESS = Object\.freeze\(\{ start: 72, end: 93\.8 \}\)/);
  assert.match(runtime, /progressRange: EMBEDDING_CACHE_PROGRESS/);
  assert.match(runtime, /progressRange: RERANKER_CACHE_PROGRESS/);
  assert.match(runtime, /progressStart: EMBEDDING_LOAD_PROGRESS\.start/);
  assert.match(runtime, /progressEnd: EMBEDDING_LOAD_PROGRESS\.end/);
  assert.match(runtime, /stagePrefix: 'model-load'/);
  assert.match(runtime, /resourceKind: 'embedding-model'/);
  assert.match(runtime, /progressStart: RERANKER_LOAD_PROGRESS\.start/);
  assert.match(runtime, /progressEnd: RERANKER_LOAD_PROGRESS\.end/);
  assert.match(runtime, /stagePrefix: 'reranker-load'/);
  assert.match(runtime, /resourceKind: 'reranker-model'/);
  assert.match(runtime, /async loadModel\(options = \{\}\)/);
  assert.match(runtime, /PROMPT_RUNTIME_PROBES = Object\.freeze/);
  assert.match(runtime, /PROMPT_RUNTIME_STABILITY_THRESHOLD = 0\.995/);
  assert.match(runtime, /PROMPT_RUNTIME_DIVERSITY_THRESHOLD = 0\.9999/);
  assert.match(runtime, /verifyPromptRuntimeProvider/);
  assert.match(runtime, /verifyPromptRuntimeReranker/);
  assert.match(runtime, /rerankerConfig/);
  assert.match(runtime, /resolveRerankerCapability/);
  assert.match(runtime, /simulatte\.intentRerankerConfig\.v1/);
  assert.match(runtime, /simulatte\.intentRerankInput\.v1/);
  assert.match(runtime, /stage: 'model-rerank-probe'/);
  assert.match(runtime, /rerankerMode: 'heuristic-fusion'/);
  assert.match(runtime, /rerankerMode: 'doppler-reranker'/);
  assert.match(runtime, /promptRuntimeProbeDiversity/);
  assert.match(runtime, /embeddingVectorHash/);
  assert.match(runtime, /promptRuntimeReceipt/);
  assert.match(runtime, /simulatte\.promptRuntimeReceipt\.v1/);
  assert.match(runtime, /stage: 'model-probe'/);
  assert.match(runtime, /runtime\.promptRuntimeReceipt = receipt/);
  assert.match(runtime, /providerReady: true/);
  assert.match(runtime, /noFallback: true/);
  assert.match(runtime, /rerankerRequired: rerankerProbe\.required === true/);
  assert.match(runtime, /rerankerReady: rerankerProbe\.ready === true/);
  assert.match(runtime, /rerankerPhase: 3/);
  assert.match(runtime, /probeCount: probe\.probeCount \|\| 0/);
  assert.match(runtime, /stabilitySimilarity: probe\.stabilitySimilarity \|\| 0/);
  assert.match(runtime, /maxDistinctProbeSimilarity: probe\.maxDistinctProbeSimilarity \|\| 0/);
  assert.match(runtime, /degenerate probe embeddings/);
  assert.doesNotMatch(runtime, /Embedding runtime metadata ready/);
  assert.match(runtime, /TRACE_URL_FLAGS/);
  assert.match(runtime, /cacheMode: 'opfs'/);
  assert.doesNotMatch(runtime, /cache-skip/);
  assert.doesNotMatch(runtime, /openOpfsCache/);
  assert.doesNotMatch(runtime, /opfsCacheFileName/);
  assert.doesNotMatch(runtime, /createCachedModelStorageContext/);
  assert.doesNotMatch(runtime, /readCachedArtifactBytes/);
  assert.doesNotMatch(runtime, /streamCachedArtifactBytes/);
  assert.doesNotMatch(runtime, /Range: `bytes=\$\{resumeOffset\}-`/);
  assert.doesNotMatch(runtime, /createWritable\(\{ keepExistingData \}\)/);
  assert.match(runtime, /function dopplerModelSource/);
  assert.match(runtime, /prepareDopplerCachedModelSource/);
  assert.match(runtime, /ensureModelCachedSource/);
  assert.match(runtime, /load\(cachedSource\.modelSource, loadOptions\)/);
  assert.match(runtime, /if \(!cachedSource\) return \{ url: modelBaseUrl \}/);
  assert.match(runtime, /manifest: cachedSource\.manifest/);
  assert.match(runtime, /baseUrl: modelBaseUrl/);
  assert.match(runtime, /storageContext: cachedSource\.storageContext/);
  assert.match(runtime, /storageBaseUrl: modelBaseUrl/);
  assert.match(runtime, /storageManifest: cachedSource\.manifest/);
  assert.match(dopplerRuntime, /const providedStorageContext = loadSource\?\.storageContext \?\? loadSource\?\.storage/);
  assert.match(dopplerRuntime, /return providedStorageContext/);
  assert.match(dopplerRuntime, /nodeStorageContext \?\? resolveArtifactStorageContext\(loadSource\)/);
  assert.match(dopplerModelSource, /storageContext: model\.storageContext \|\| model\.storage \|\| null/);
  assert.match(dopplerModelSource, /storageContext: resolved\?\.storageContext \?\? resolved\?\.storage \?\? null/);
  assert.match(runtime, /rawStage === 'cache-hit'/);
  assert.match(runtime, /\? 'cache-fill'/);
  assert.match(runtime, /\? 'cache-ready'/);
  assert.doesNotMatch(runtime, /cached model artifact preflight failed/);
  assert.match(runtime, /model-reuse/);
  assert.match(runtime, /prompt-embed/);
  assert.match(runtime, /span-cache/);
  assert.match(runtime, /durationMs: elapsedMsSince/);
  assert.doesNotMatch(runtime, /waitForCacheWorkerReady/);
  assert.doesNotMatch(runtime, /navigator\.serviceWorker\.ready/);
  assert.doesNotMatch(runtime, /intent model cache worker did not become ready/);
  assert.match(runtime, /model-backed intent manifest missing Doppler runtimeConfig/);
  assert.doesNotMatch(runtime, /QWEN_RUNTIME_CONFIG/);
  assert.doesNotMatch(runtime, /simulatte-model-cache/);
  assert.match(runtime, /resolveUrl\(rawModuleUrl, location\.href\)/);
  assert.match(runtime, /embedModelHash mismatch/);
  assert.match(runtime, /simulatte\.intentRerank\.v1/);
  assert.doesNotMatch(runtime, /DEFAULT_EMBED_MODEL_ID|QWEN_RUNTIME_CONFIG/);
  assert.doesNotMatch(runtime, /axis-token-query-encoder/);
  assert.doesNotMatch(runtime, /simulatte-intent-embed-v1/);
  assert.doesNotMatch(runtime, /candidates\.map\(\(primitive\) => embedText\(model, primitiveText/);
  assert.match(runtime, /GPUBufferUsage\.STORAGE/);

  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const workerShimPath = path.join(root, 'public', 'simulatte-model-cache-sw.js');
  const workerPath = path.join(root, 'public', 'workers', 'simulatte-model-cache-sw.js');
  assert.match(html, /id="intent-runtime"/);
  assert.match(html, /intent-runtime-fill/);
  assert.equal(fs.existsSync(workerShimPath), false);
  assert.equal(fs.existsSync(workerPath), false);
});

test('product path removed the parallel world planner and legacy pipeline export', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const model = require('../public/pipeline/phase-05-simulation/simulatte-physics-model.js');

  assert.doesNotMatch(html, /simulatte-world-plan\.js/);
  assert.equal(Object.hasOwn(model, 'createLegacySpecFromPrompt'), false);
});

test('negation vocabulary is canonical in the universe parser with synced mirrors', () => {
  const parser = require(runtimeFile('simulatte-universe-parser.js'));
  const evidence = require(runtimeFile('simulatte-language-evidence.js'));
  const model = require(runtimeFile('simulatte-physics-model.js'));

  assert.ok(Array.isArray(parser.NEGATION_WORDS) && parser.NEGATION_WORDS.length >= 9);
  assert.equal(parser.NEGATION_RE.source, `\\b(?:${parser.NEGATION_WORDS.join('|')})\\b`);
  assert.equal(model.NEGATION_RE.source, parser.NEGATION_RE.source);

  for (const word of parser.NEGATION_WORDS) {
    assert.ok(evidence.NEGATIONS.includes(word), `language evidence negations include ${word}`);
  }
  assert.deepEqual(
    evidence.NEGATIONS.filter((word) => !parser.NEGATION_WORDS.includes(word)),
    ['avoid', 'exclude', 'except']
  );
});
