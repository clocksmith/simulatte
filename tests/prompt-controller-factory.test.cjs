const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const promptDir = path.join(root, 'public', 'blank', 'app', 'prompt');

test('prompt controller keeps its public CommonJS API', () => {
  const api = require(path.join(promptDir, 'prompt-controller.js'));
  const support = require(path.join(promptDir, 'prompt-controller-dependencies.js'));
  const workers = require(path.join(promptDir, 'prompt-controller-workers.js'));
  const training = require(path.join(promptDir, 'prompt-controller-training.js'));
  const lab = require(path.join(promptDir, 'prompt-controller-lab-controller.js'));
  assert.deepEqual(Object.keys(api), ['createBrowserLab', 'start']);
  assert.deepEqual(Object.keys(lab), ['createBrowserLab']);
  assert.deepEqual(Object.keys(training), ['logGraphDebug', 'syncWorldModelReceipt']);
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

test('prompt controller browser layers publish the API in manifest order', () => {
  const context = vm.createContext({
    SimulattePromptControllerSupport: require(path.join(promptDir, 'prompt-controller-dependencies.js')),
    SimulatteConstructionSearch: require(path.join(promptDir, 'prompt-controller-construction-search.js')),
  });
  for (const file of [
    'prompt-controller-workers.js',
    'prompt-controller-training.js',
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
