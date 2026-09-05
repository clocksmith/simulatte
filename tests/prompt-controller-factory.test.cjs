const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const promptDir = path.join(root, 'public', 'blank', 'app', 'prompt');
const runtimeManifest = require('../public/blank/app/runtime-script-manifest.js');

test('bounded classification loads before the model-backed embedder', () => {
  const bounded = 'pipeline/phase-03-retrieval/simulatte-intent-embedder-bounded-classification.js';
  const embedder = 'pipeline/phase-03-retrieval/simulatte-intent-embedder-manifest-cache.js';
  assert.ok(runtimeManifest.browser.indexOf(bounded) < runtimeManifest.browser.indexOf(embedder));
  assert.ok(runtimeManifest.intentWorker.indexOf(bounded) < runtimeManifest.intentWorker.indexOf(embedder));
});

test('prompt controller keeps its public CommonJS API', () => {
  const api = require(path.join(promptDir, 'prompt-controller.js'));
  const support = require(path.join(promptDir, 'prompt-controller-dependencies.js'));
  const workers = require(path.join(promptDir, 'prompt-controller-workers.js'));
  const training = require(path.join(promptDir, 'prompt-controller-training.js'));
  const runtime = require(path.join(promptDir, 'prompt-controller-runtime.js'));
  const compilerProof = require(path.join(promptDir, 'prompt-controller-compiler-proof.js'));
  const lab = require(path.join(promptDir, 'prompt-controller-lab-controller.js'));
  assert.deepEqual(Object.keys(api), ['createBrowserLab', 'start']);
  assert.deepEqual(Object.keys(lab), ['createBrowserLab']);
  assert.deepEqual(Object.keys(training), ['logGraphDebug', 'syncWorldModelReceipt']);
  assert.equal(typeof runtime.createIntentWorkerClient, 'function');
  assert.deepEqual(Object.keys(compilerProof), ['create']);
  assert.deepEqual(Object.keys(workers), [
    'createPipelineCompiler',
    'worldModelReceiptElements',
    'createTrainingRunState',
    'beginTrainingRun',
    'syncTrainingRuntime',
    'syncTrainingPreviewArtifacts',
    'syncTrainingRankArtifacts',
    'syncTrainingSpecArtifacts',
    'trainingSnapshot',
    'waitForLoadingPaint',
    'renderControls',
    'readSpecFromUi',
    'syncShuffleButton',
    'pickShuffleExample',
    'readPromptParams',
    'syncComponentStack',
    'syncReadoutLabels',
    'syncReadouts',
    'syncSpecPreview',
  ]);
  assert.equal('countRows' in support, false);
  assert.equal('worldModelSummary' in support, false);
  assert.equal(typeof api.createBrowserLab, 'function');
  assert.equal(api.start(), null);
});

test('prompt controller resolves root-hosted workers against Blank asset base', () => {
  const runtime = require(path.join(promptDir, 'prompt-controller-runtime.js'));
  const view = {
    document: {
      baseURI: 'https://create.simulatte.world/blank/',
      querySelector() {
        return null;
      },
    },
    location: {
      href: 'https://create.simulatte.world/',
      origin: 'https://create.simulatte.world',
    },
  };
  assert.equal(runtime.documentBaseUrl(view), 'https://create.simulatte.world/blank/');
  assert.equal(
    runtime.versionedLocalUrl('./app/workers/simulatte-intent-worker.js', view),
    'https://create.simulatte.world/blank/app/workers/simulatte-intent-worker.js'
  );
});

test('compiler proof coordinator performs a separate compile and rejects stale receipts', async () => {
  const compilerProofApi = require(path.join(promptDir, 'prompt-controller-compiler-proof.js'));
  const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
  const proofContract = require('../public/shared/contracts/world-proof.js');
  const spec = model.createSpecFromPrompt('a red ball', {
    deterministicRuntime: true,
    compilerLane: 'pipeline-worker',
    retrievalPhase: 'deterministic-local',
  });
  const binding = proofContract.createWorldProofBinding(spec, {
    buildId: 'test-build',
    runtimeId: 'test-runtime',
  });
  let compileCalls = 0;
  let cancelCalls = 0;
  const coordinator = compilerProofApi.create({}, {
    createPipelineCompiler: () => ({
      compile(prompt, compilerConfig) {
        compileCalls += 1;
        return Promise.resolve(model.createSpecFromPrompt(prompt, compilerConfig));
      },
      cancel() {
        cancelCalls += 1;
      },
    }),
    createSpecFromPrompt: model.createSpecFromPrompt,
  });

  const receipt = await coordinator.verify(spec, binding);
  assert.equal(compileCalls, 1);
  assert.equal(cancelCalls, 1);
  assert.equal(receipt.status, 'pass');
  assert.equal(coordinator.receiptFor(spec), receipt);
  coordinator.invalidate();
  assert.equal(coordinator.receiptFor(spec), null);
});

test('prompt controller browser layers publish the API in manifest order', () => {
  const context = vm.createContext({
    SimulattePromptControllerSupport: require(path.join(promptDir, 'prompt-controller-dependencies.js')),
    SimulatteConstructionSearch: require(path.join(promptDir, 'prompt-controller-construction-search.js')),
    SimulattePromptControllerRuntime: require(path.join(promptDir, 'prompt-controller-runtime.js')),
    SimulatteNeuralModelConsent: require('../public/neural-model-consent.js'),
    SimulatteModelSelection: require('../public/model-selection.js'),
    SimulatteRunViewModel: require('../public/blank/app/runtime/run-view-model.js'),
    SimulatteWorldProof: require('../public/shared/contracts/world-proof.js'),
    SimulatteInputSource: require('../public/shared/contracts/input-source.js'),
    SimulatteWorldSpecReconciliation: require('../public/shared/contracts/world-spec-reconciliation.js'),
    SimulatteWorldImprovementRecord: require('../public/shared/contracts/world-improvement-record.js'),
  });
  const editorSharedPath = '../shared/design/program-editor.js';
  assert.ok(runtimeManifest.browser.indexOf(editorSharedPath) >= 0);
  assert.ok(runtimeManifest.browser.indexOf(editorSharedPath) <
    runtimeManifest.browser.indexOf('app/prompt/world-spec-editor.js'));
  vm.runInContext(fs.readFileSync(path.join(root, 'public/blank', editorSharedPath), 'utf8'), context);
  for (const file of [
    'prompt-controller-runtime.js',
    'prompt-controller-workers.js',
    'prompt-controller-training.js',
    'prompt-model-selection.js',
    'world-spec-editor.js',
    'world-spec-reconciliation-controller.js',
    'prompt-controller-compiler-proof.js',
    'world-improvement-session.js',
    'prompt-proof-session.js',
    'prompt-controller-lab-controller.js',
    'prompt-controller.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(promptDir, file), 'utf8'), context);
  }
  assert.equal(typeof context.SimulattePhysicsRenderer.createBrowserLab, 'function');
  assert.equal(context.SimulattePhysicsRenderer.start(), null);
});

test('prompt controller browser layers reject missing dependencies', () => {
  for (const file of [
    'prompt-controller-dependencies.js',
    'prompt-controller-workers.js',
    'prompt-controller-training.js',
    'prompt-model-selection.js',
    'world-spec-reconciliation-controller.js',
    'prompt-controller-compiler-proof.js',
    'world-improvement-session.js',
    'prompt-controller-lab-controller.js',
    'prompt-controller.js',
  ]) {
    assert.throws(
      () => vm.runInNewContext(fs.readFileSync(path.join(promptDir, file), 'utf8'), {}),
      /requires/,
      `${file} must reject missing dependencies`
    );
  }
});
