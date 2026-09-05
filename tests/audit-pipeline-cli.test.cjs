const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const canonicalReport = path.join(
  root,
  'artifacts',
  'simulatte-pipeline-audit',
  'live-webgpu',
  'report.json'
);

test('pipeline audit help is read-only and documents its supported options', () => {
  const existedBefore = fs.existsSync(canonicalReport);
  const result = spawnSync(process.execPath, ['tools/audit-pipeline.mjs', '--help'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^usage: node tools\/audit-pipeline\.mjs/m);
  assert.match(result.stdout, /--intent-mode local\|model/);
  assert.equal(fs.existsSync(canonicalReport), existedBefore);
});

test('pipeline audit stages browser evidence before promoting the canonical directory', () => {
  const source = fs.readFileSync(path.join(root, 'tools', 'audit-pipeline.mjs'), 'utf8');

  assert.match(source, /liveStagingDir/);
  assert.match(source, /promoteDirectory\(liveStagingDir, outputDirs\.live\)/);
  assert.doesNotMatch(source, /'--out', outputDirs\.live/);
});

test('model audit selects the optional embedding lane instead of only granting consent', () => {
  const source = fs.readFileSync(
    path.join(root, 'tools', 'visual-audit-page.mjs'),
    'utf8'
  );

  assert.match(source, /MODEL_SELECTION_STORAGE_KEY/);
  assert.match(source, /'open-vocabulary-retrieval': 'qwen-embedding-retrieval'/);
  assert.match(source, /localStorage\.setItem\(\$\{JSON\.stringify\(MODEL_SELECTION_STORAGE_KEY\)\}/);
  assert.match(source, /neuralModelConsent\.summarizeLock\(MODEL_RUNTIME_LOCK\)/);
  assert.match(source, /retrieval\.value === 'qwen-embedding-retrieval'/);
});

test('causal phase diagnosis documents the required four-lane artifact substitution inputs', () => {
  const result = spawnSync(process.execPath, ['tools/causal-phase-diagnosis.mjs', '--help'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--failure-run FILE/);
  assert.match(result.stdout, /--known-good FILE/);
  assert.match(result.stdout, /--candidate-runner MODULE/);
  assert.match(result.stdout, /--reference-runner MODULE/);

  const comparison = fs.readFileSync(path.join(root, 'tools', 'compare-pipeline-audit.mjs'), 'utf8');
  assert.match(comparison, /causalOwnership=not-proven/);
  assert.match(comparison, /audit:pipeline:diagnose/);
});
