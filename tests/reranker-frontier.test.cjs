const assert = require('node:assert/strict');
const test = require('node:test');

function auditReport() {
  return {
    schema: 'simulatte.intentSceneScreenshotAudit.v1',
    createdAt: '2026-07-13T00:00:00.000Z',
    intentMode: 'model',
    results: [
      result('alpha prompt', ['a', 'b', 'c'], ['c', 'a', 'b'], [10, 20, 30]),
      result('beta prompt', ['d', 'e'], ['d', 'e'], [40, 50]),
    ],
  };
}

function result(prompt, inputIds, rankedIds, durations) {
  return {
    prompt,
    modelExecutionReceipt: {
      rerankerModelId: 'reranker-model',
      rerankerModelHash: 'manifest-hash',
      modelRuntimeLock: { number: 6 },
      phase3Rerank: {
        model: 'reranker-contract',
        modelReady: true,
        candidateSelectionMode: 'local-score-top-k',
        candidateBudgetPolicy: 'model-lock-decision-frontier',
        candidateInputs: inputIds.map((primitiveId, order) => ({
          primitiveId,
          order,
          localScore: 1 - order / 10,
        })),
        candidateOutputs: rankedIds.map((primitiveId, rank) => ({
          primitiveId,
          rank,
          score: 1 - rank / 10,
          executionDurationMs: durations[inputIds.indexOf(primitiveId)],
        })),
      },
    },
  };
}

test('reranker frontier measures work savings without calling replay a quality proof', async () => {
  const { benchmarkRerankerFrontier } = await import('../tools/benchmark-reranker-frontier.mjs');
  const report = benchmarkRerankerFrontier(auditReport(), {
    sourcePath: 'artifacts/source/report.json',
    sourceSha256: 'abc123',
  });

  assert.equal(report.schema, 'simulatte.rerankerFrontierBenchmark.v1');
  assert.equal(report.promptCount, 2);
  assert.equal(report.fullCandidateCount, 5);
  assert.equal(report.fullExecutionDurationMs, 150);
  assert.deepEqual(report.model, {
    id: 'reranker-model',
    manifestHash: 'manifest-hash',
    runtimeLockNumber: 6,
  });
  assert.equal(report.promotionEligible, false);
  assert.equal(report.promotionBlockers.length, 2);

  const k1 = report.frontiers.find((row) => row.k === 1);
  assert.equal(k1.evaluatedCandidateCount, 2);
  assert.equal(k1.estimatedExecutionDurationMs, 50);
  assert.equal(k1.fullWinnerRetentionCount, 1);
  assert.deepEqual(k1.changedPrompts, [{
    prompt: 'alpha prompt',
    fullWinner: 'c',
    frontierWinner: 'a',
    fullWinnerInputOrder: 2,
    selectionMode: 'local-score-top-k',
  }]);

  const k3 = report.frontiers.find((row) => row.k === 3);
  assert.equal(k3.evaluatedCandidateCount, 5);
  assert.equal(k3.estimatedDurationSavingsMs, 0);
  assert.equal(k3.fullWinnerRetentionRate, 1);
});

test('reranker frontier fails closed when input and output identities cannot join', async () => {
  const { benchmarkRerankerFrontier } = await import('../tools/benchmark-reranker-frontier.mjs');
  const report = auditReport();
  report.results[0].modelExecutionReceipt.phase3Rerank.candidateOutputs.pop();
  assert.throws(
    () => benchmarkRerankerFrontier(report),
    /mismatched inputs and outputs/
  );
});
