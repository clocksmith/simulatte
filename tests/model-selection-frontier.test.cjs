const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const HASH = 'a'.repeat(64);
const ENVIRONMENT = Object.freeze({
  deviceId: 'test-gpu',
  runtimeId: 'doppler-test',
  dtype: 'f16',
  cacheProtocolId: 'simulatte-model-selection-cache-v1',
});
const POPULATION_SCHEMAS = Object.freeze({
  classification: 'simulatte.sealedClassificationPopulation.v1',
  'embedding-retrieval': 'simulatte.sealedEmbeddingRetrievalPopulation.v1',
  reranking: 'simulatte.sealedRerankingPopulation.v1',
});
const HEAD_IDS = Object.freeze([
  'scene-domain',
  'span-entity-role',
  'relation',
  'material',
  'pose',
  'obligation-support',
]);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function environmentHash(environment = ENVIRONMENT) {
  return crypto.createHash('sha256').update(canonicalJson(environment)).digest('hex');
}

function quality(task, value = 0.95) {
  if (task === 'classification') {
    return {
      heads: HEAD_IDS.map((id) => ({
        id,
        macroF1: value,
        coverage: 0.95,
        selectiveRisk: 0.01,
        expectedCalibrationError: 0.02,
      })),
    };
  }
  if (task === 'embedding-retrieval') {
    return { recallAtK: value, hardNegativeAccuracy: 0.95, mustRefuseAccuracy: 0.99 };
  }
  return { ndcgAtK: value, winnerAccuracy: 0.95 };
}

function candidate(task, id, overrides = {}, kind = 'model') {
  const workloadSha256 = overrides.workloadSha256 || HASH;
  return {
    id,
    implementationId: `simulatte.candidate.${id}.v1`,
    kind,
    modelId: kind === 'model' ? `${id}-model` : null,
    deploymentEligible: overrides.deploymentEligible !== false,
    deploymentEvidence: overrides.deploymentEvidence || 'test deployment evidence',
    quality: overrides.quality || quality(task, overrides.primaryQuality || 0.95),
    performance: {
      downloadBytes: 100,
      peakMemoryBytes: 200,
      coldLoadMs: { samples: [30, 32, 31] },
      warmLatencyMs: { samples: Array.from({ length: 20 }, () => 4) },
      ...overrides.performance,
    },
    receipt: {
      path: `sealed/${id}.json`,
      sha256: HASH,
      environmentSha256: overrides.environmentSha256 || environmentHash(),
      workloadSha256,
      cacheProtocolId: ENVIRONMENT.cacheProtocolId,
      ...overrides.receipt,
    },
  };
}

test('v3 retrieval frontiers require a calibrated composite and gate delivered recall', async () => {
  const { evaluateModelSelectionFrontier } = await import('../tools/model-selection-frontier.mjs');
  const calibration = { path: 'calibration/retrieval.json', sha256: HASH };
  const disjointness = calibrationDisjointness('embedding-retrieval-held-out-v1', 100);
  const det = candidate('embedding-retrieval', 'det', { quality: retrievalV3Quality(0.7) }, 'deterministic');
  const neural = candidate('embedding-retrieval', 'neural', { quality: retrievalV3Quality(0.95) });
  const cascade = candidate('embedding-retrieval', 'cascade', {
    quality: retrievalV3Quality(0.96),
    receipt: { calibration, calibrationPromotionDisjointness: disjointness },
  });
  cascade.kind = 'composite';
  cascade.modelId = neural.modelId;
  cascade.components = { refusalGateCandidateId: det.id, recallCandidateId: neural.id };
  const evidence = trial('embedding-retrieval', [det, neural, cascade], { schema: 'simulatte.modelSelectionTrial.v3' });
  const report = evaluateModelSelectionFrontier(evidence);
  assert.equal(report.selectedCandidateId, 'cascade');

  cascade.quality.deliveredRecallAtK = 0.8;
  const rejected = evaluateModelSelectionFrontier(evidence);
  assert.ok(rejected.candidates.find((row) => row.id === 'cascade').qualityRejectionReasons.includes('deliveredRecallAtK'));

  delete cascade.receipt.calibration;
  assert.throws(() => evaluateModelSelectionFrontier(evidence), /calibration receipt path/);

  cascade.receipt.calibration = calibration;
  delete cascade.receipt.calibrationPromotionDisjointness;
  assert.throws(() => evaluateModelSelectionFrontier(evidence), /disjointness receipt/);
});

function trial(task, candidates, overrides = {}) {
  const commitment = String(['classification', 'embedding-retrieval', 'reranking'].indexOf(task) + 1).repeat(64);
  return {
    schema: 'simulatte.modelSelectionTrial.v2',
    task,
    population: {
      schema: POPULATION_SCHEMAS[task],
      id: `${task}-held-out-v1`,
      kind: 'held-out',
      visibility: 'sealed',
      commitmentSha256: commitment,
      rowCount: 100,
      promotionEligible: true,
      contaminationStatus: 'unexposed',
      openingReceipt: { path: `sealed/${task}-opening.json`, sha256: HASH },
    },
    environment: ENVIRONMENT,
    workload: { id: `${task}-workload-v1`, sha256: HASH, k: task === 'embedding-retrieval' ? 2 : task === 'reranking' ? 4 : 1 },
    candidates,
    ...overrides,
  };
}

function retrievalV3Quality(value) {
  return {
    recallAtK: value,
    deliveredRecallAtK: value,
    hardNegativeAccuracy: value,
    mustRefuseAccuracy: 0.99,
    answerableAcceptance: value,
    refusalPrecision: 0.95,
  };
}

function calibrationDisjointness(promotionPopulationId, promotionRowCount) {
  return {
    schema: 'simulatte.calibrationPromotionDisjointnessReceipt.v1',
    calibrationPopulationId: 'calibration-v2',
    promotionPopulationId,
    fingerprintSchema: 'simulatte.modelSelectionRowFingerprint.v1',
    calibrationRowCount: 100,
    promotionRowCount,
    overlapCount: 0,
    calibrationFingerprintsSha256: HASH,
    promotionFingerprintsSha256: HASH,
  };
}

test('model frontiers choose the smallest Pareto candidate that clears every sealed quality gate', async () => {
  const { evaluateModelSelectionFrontier } = await import('../tools/model-selection-frontier.mjs');
  const report = evaluateModelSelectionFrontier(trial('classification', [
    candidate('classification', 'deterministic-control', {
      primaryQuality: 0.97,
      performance: {
        downloadBytes: 0,
        peakMemoryBytes: 1024,
        coldLoadMs: { samples: [0] },
        warmLatencyMs: { samples: Array.from({ length: 20 }, () => 0.2) },
      },
    }, 'deterministic'),
    candidate('classification', 'deberta-small', {
      primaryQuality: 0.98,
      performance: {
        downloadBytes: 120_000_000,
        peakMemoryBytes: 300_000_000,
        coldLoadMs: { samples: [1200] },
        warmLatencyMs: { samples: Array.from({ length: 20 }, () => 8) },
      },
    }),
    candidate('classification', 'larger-model', {
      primaryQuality: 0.97,
      performance: {
        downloadBytes: 500_000_000,
        peakMemoryBytes: 900_000_000,
        coldLoadMs: { samples: [5000] },
        warmLatencyMs: { samples: Array.from({ length: 20 }, () => 24) },
      },
    }),
  ]));

  assert.equal(report.selectedCandidateId, 'deterministic-control');
  assert.equal(report.promotionEligible, true);
  assert.equal(report.performanceContract.warmLatency.requiredStatistic, 'p95');
  assert.deepEqual(
    report.candidates.find((row) => row.id === 'larger-model').dominatedBy,
    ['deberta-small', 'deterministic-control']
  );
});

test('classification refuses an aggregate win when one concrete head misses abstention or accuracy floors', async () => {
  const { evaluateModelSelectionFrontier } = await import('../tools/model-selection-frontier.mjs');
  const weakControlQuality = quality('classification', 0.99);
  const relation = weakControlQuality.heads.find((row) => row.id === 'relation');
  relation.macroF1 = 0.7;
  relation.expectedCalibrationError = 0.2;
  const report = evaluateModelSelectionFrontier(trial('classification', [
    candidate('classification', 'deterministic-control', {
      quality: weakControlQuality,
      performance: { downloadBytes: 0 },
    }, 'deterministic'),
    candidate('classification', 'deberta-small', { primaryQuality: 0.98 }),
  ]));

  const control = report.candidates.find((row) => row.id === 'deterministic-control');
  assert.equal(control.clearsQualityGate, false);
  assert.deepEqual(control.qualityRejectionReasons, ['relation:macroF1', 'relation:expectedCalibrationError']);
  assert.equal(report.selectedCandidateId, 'deberta-small');
});

test('required frontiers keep classification retrieval and reranking on separate sealed populations', async () => {
  const { evaluateRequiredModelFrontiers } = await import('../tools/model-selection-frontier.mjs');
  const tasks = ['classification', 'embedding-retrieval', 'reranking'];
  const trials = tasks.map((task) => trial(task, [
    candidate(task, `${task}-control`, {}, 'deterministic'),
    candidate(task, `${task}-model`, { primaryQuality: 0.97, performance: { downloadBytes: 50_000_000 } }),
  ]));
  const report = evaluateRequiredModelFrontiers(trials);

  assert.equal(report.frontiers.length, 3);
  assert.equal(report.promotionEligible, true);
  assert.deepEqual(Object.keys(report.selectedCandidates).sort(), tasks.sort());

  trials[1].population.id = trials[0].population.id;
  assert.throws(() => evaluateRequiredModelFrontiers(trials), /separate held-out population identities/);
  trials[1].population.id = 'embedding-retrieval-held-out-v1';
  trials[1].population.commitmentSha256 = trials[0].population.commitmentSha256;
  assert.throws(() => evaluateRequiredModelFrontiers(trials), /separate held-out population commitments/);
});

test('model frontiers reject exposed diagnostics incomparable environments and short latency samples', async () => {
  const { evaluateModelSelectionFrontier } = await import('../tools/model-selection-frontier.mjs');
  const exposed = trial('reranking', [
    candidate('reranking', 'control', {}, 'deterministic'),
    candidate('reranking', 'candidate'),
  ]);
  exposed.population.kind = 'public-diagnostic';
  exposed.population.visibility = 'public';
  exposed.population.promotionEligible = false;
  assert.throws(() => evaluateModelSelectionFrontier(exposed), /population kind must be held-out/);

  const mismatched = trial('embedding-retrieval', [
    candidate('embedding-retrieval', 'control', {}, 'deterministic'),
    candidate('embedding-retrieval', 'candidate', { environmentSha256: 'b'.repeat(64) }),
  ]);
  assert.throws(() => evaluateModelSelectionFrontier(mismatched), /environment hash differs/);

  const short = trial('reranking', [
    candidate('reranking', 'control', {}, 'deterministic'),
    candidate('reranking', 'candidate', { performance: { warmLatencyMs: { samples: [1, 2] } } }),
  ]);
  assert.throws(() => evaluateModelSelectionFrontier(short), /requires at least 20 measured samples/);
});

test('warm latency selection uses measured p95 rather than a favorable average', async () => {
  const { evaluateModelSelectionFrontier } = await import('../tools/model-selection-frontier.mjs');
  const spiky = Array.from({ length: 18 }, () => 1).concat(40, 40);
  const steady = Array.from({ length: 20 }, () => 5);
  const report = evaluateModelSelectionFrontier(trial('reranking', [
    candidate('reranking', 'control', {
      performance: { downloadBytes: 0, peakMemoryBytes: 100, coldLoadMs: { samples: [0] }, warmLatencyMs: { samples: steady } },
    }, 'deterministic'),
    candidate('reranking', 'spiky', {
      performance: { downloadBytes: 0, peakMemoryBytes: 100, coldLoadMs: { samples: [0] }, warmLatencyMs: { samples: spiky } },
    }),
  ]));

  assert.equal(report.candidates.find((row) => row.id === 'spiky').performance.warmLatencyMs.p95, 40);
  assert.equal(report.candidates.find((row) => row.id === 'spiky').performance.warmLatencyMs.selectionStatistic, 'p95');
  assert.equal(report.selectedCandidateId, 'control');
});

test('a quality winner cannot promote until its exact deployment implementation has parity evidence', async () => {
  const { evaluateModelSelectionFrontier } = await import('../tools/model-selection-frontier.mjs');
  const report = evaluateModelSelectionFrontier(trial('embedding-retrieval', [
    candidate('embedding-retrieval', 'control', { primaryQuality: 0.7 }, 'deterministic'),
    candidate('embedding-retrieval', 'compact-winner', {
      deploymentEligible: false,
      deploymentEvidence: 'source-model screening only',
      performance: { downloadBytes: 20 },
    }),
  ]));

  assert.equal(report.selectedCandidateId, 'compact-winner');
  assert.equal(report.promotionCandidateId, null);
  assert.equal(report.promotionEligible, false);
  assert.deepEqual(report.rejectionReasons, ['smallest sufficient candidate lacks exact deployment parity evidence']);
});

test('policy and schema own separate task quality and comparable performance contracts', () => {
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'tools/samer/model-selection-policy.json'), 'utf8'));
  const jobs = JSON.parse(fs.readFileSync(path.join(root, 'tools/samer/classification-jobs-v1.json'), 'utf8'));
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'tools/samer/model-selection-trial.schema.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.equal(policy.schema, 'simulatte.modelSelectionPolicy.v2');
  assert.deepEqual(policy.requiredTasks.map((row) => row.id), ['classification', 'embedding-retrieval', 'reranking']);
  assert.deepEqual(policy.requiredTasks[1].requiredQualityMetrics, [
    'recallAtK',
    'deliveredRecallAtK',
    'hardNegativeAccuracy',
    'mustRefuseAccuracy',
    'answerableAcceptance',
    'refusalPrecision',
  ]);
  assert.equal(policy.requiredTasks[1].evaluationK, 2);
  assert.deepEqual(policy.requiredTasks[2].requiredQualityMetrics, ['ndcgAtK', 'winnerAccuracy']);
  assert.equal(policy.requiredTasks[2].evaluationK, 4);
  assert.deepEqual(jobs.jobs.map((row) => row.id), HEAD_IDS);
  assert.ok(jobs.jobs.every((row) => row.labels.includes('abstain') && row.qualityFloor.minimumMacroF1 > 0));
  assert.equal(policy.performanceContract.warmLatency.requiredStatistic, 'p95');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.population.properties.visibility.const, 'sealed');
  assert.equal(pkg.scripts['evaluate:model-frontiers'], 'node tools/model-selection-frontier.mjs');
  assert.equal(pkg.scripts['check:model-populations'], 'node tools/samer/commit-model-selection-populations.mjs');
});

test('classification retrieval and reranking retain distinct single-use commitments and opening receipts', () => {
  const tasks = ['classification', 'embedding-retrieval', 'reranking'];
  const commitments = tasks.map((task) => JSON.parse(fs.readFileSync(
    path.join(root, `tools/samer/${task}-population-v1.commitment.json`),
    'utf8'
  )));

  assert.deepEqual(commitments.map((row) => row.task), tasks);
  assert.equal(new Set(commitments.map((row) => row.id)).size, 3);
  assert.equal(new Set(commitments.map((row) => row.populationSha256)).size, 3);
  assert.ok(commitments.every((row) => row.visibility === 'sealed'));
  assert.ok(commitments.every((row) => row.contaminationStatus === 'opened-for-one-time-evaluation'));
  assert.ok(commitments.every((row) => row.rowCount >= 60));
  assert.ok(commitments.every((row) => row.openings.length === 1));
  assert.ok(commitments.every((row) => fs.existsSync(path.join(root, row.openings[0].path))));
});
