const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('candidate registry pins concrete task-specific implementations and blocks unported neural promotion', async () => {
  const { validateCandidateRegistry } = await import('../tools/samer/check-model-candidate-registry.mjs');
  const registry = readJson('tools/samer/model-candidate-registry.json');
  const lock = readJson('public/data/simulatte-embedder/model-runtime-lock.json');
  const report = validateCandidateRegistry(registry, lock, { root });

  assert.deepEqual(report.taskCandidateCounts, {
    classification: 8,
    'embedding-retrieval': 3,
    reranking: 4,
  });
  assert.equal(report.modelLockNumber, 11);
  const classification = registry.tasks.classification;
  assert.deepEqual(classification.map((row) => row.id), [
    'deterministic-tfidf-control',
    'multinomial-nb-tfidf-head',
    'linear-tfidf-head',
    'linear-svc-tfidf-head',
    'sgd-modified-huber-tfidf-head',
    'minilm-nli-classifier',
    'deberta-small-nli-classifier',
    'qwen3-embedding-classifier-control',
  ]);
  assert.equal(classification.find((row) => row.id === 'deberta-small-nli-classifier').mode, 'nli-classification');
  assert.ok(Object.values(registry.tasks).flat().filter((row) => row.kind === 'model').every((row) => row.deploymentEligible === false));
});

test('deterministic candidate process receives no gold and receipts no model execution', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-candidate-'));
  const input = path.join(directory, 'input.json');
  const output = path.join(directory, 'output.json');
  fs.writeFileSync(input, JSON.stringify({
    schema: 'simulatte.modelCandidateWorkload.v1',
    id: 'classification-smoke-v1',
    candidateId: 'deterministic-tfidf-control',
    task: 'classification',
    rows: [{
      id: 'row-1',
      headId: 'pose',
      text: 'three birds flying',
      span: 'flying',
      labels: [
        { id: 'flying', description: 'flying' },
        { id: 'standing', description: 'standing' },
        { id: 'abstain', description: 'abstain' },
      ],
      abstentionId: 'abstain',
      minimumConfidence: 0.2,
    }],
  }));
  const result = spawnSync('python3', [
    'tools/samer/model-candidate-runtime.py',
    '--input', input,
    '--out', output,
    '--mode', 'deterministic-classification',
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(receipt.kind, 'deterministic-rules');
  assert.deepEqual(receipt.model, { executed: false });
  assert.equal(receipt.modelId, null);
  assert.equal(receipt.rows[0].predictedLabel, 'flying');
  assert.equal(receipt.runtime.deviceId, 'cpu');
  fs.rmSync(directory, { recursive: true, force: true });
});

test('sealed sanitizer strips evaluator labels and scorer preserves task-specific metrics', async () => {
  const { sanitizedWorkload, scoreCandidatePredictions } = await import('../tools/samer/run-model-selection-trial.mjs');
  const jobs = readJson('tools/samer/classification-jobs-v1.json');
  const population = {
    schema: 'simulatte.sealedClassificationPopulation.v1',
    id: 'sealed-test',
    task: 'classification',
    rows: [{ id: 'row-1', headId: 'pose', input: { text: 'a bird flying' }, expectedLabel: 'flying' }],
  };
  const workload = sanitizedWorkload(population, 'classification', jobs, 'control');
  assert.equal(JSON.stringify(workload).includes('expectedLabel'), false);
  const quality = scoreCandidatePredictions(population, {
    schema: 'simulatte.modelCandidatePredictions.v1',
    task: 'classification',
    rows: [{ id: 'row-1', predictedLabel: 'flying', confidence: 1 }],
  }, 'classification', jobs);
  const pose = quality.heads.find((row) => row.id === 'pose');
  assert.equal(pose.coverage, 1);
  assert.equal(pose.selectiveRisk, 0);
});

test('candidate workload refuses hidden evaluator labels before execution', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'simulatte-candidate-leak-'));
  const input = path.join(directory, 'input.json');
  fs.writeFileSync(input, JSON.stringify({
    schema: 'simulatte.modelCandidateWorkload.v1',
    candidateId: 'bad',
    task: 'classification',
    rows: [{ id: 'row-1', expectedLabel: 'flying' }],
  }));
  const result = spawnSync('python3', [
    'tools/samer/model-candidate-runtime.py',
    '--input', input,
    '--mode', 'deterministic-classification',
  ], { cwd: root, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /contains evaluator-owned gold labels/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test('evaluator rejects non-finite candidate scores instead of sorting them', async () => {
  const { validatePredictionEnvelope } = await import('../tools/samer/run-model-selection-trial.mjs');
  assert.throws(() => validatePredictionEnvelope({
    schema: 'simulatte.modelCandidatePredictions.v1',
    task: 'reranking',
    rows: [{
      id: 'row-1',
      durationMs: 1,
      ranking: ['a', 'b'],
      scores: [{ id: 'a', score: Number.NaN }, { id: 'b', score: 0 }],
    }],
  }, 'reranking', [{ id: 'row-1' }]), /candidate score must be finite/);
});

test('sealed opening commands keep repository paths portable', async () => {
  const { receiptArgument } = await import('../tools/samer/run-model-selection-trial.mjs');
  assert.equal(
    receiptArgument(path.join(root, 'tools/samer/model-candidate-runtime.py')),
    'tools/samer/model-candidate-runtime.py'
  );
  assert.equal(receiptArgument('/tmp/outside-simulatte.json'), '/tmp/outside-simulatte.json');
  assert.equal(receiptArgument('Qwen/Qwen3-Reranker-0.6B'), 'Qwen/Qwen3-Reranker-0.6B');
});

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}
