const assert = require('node:assert/strict');
const test = require('node:test');

const HASH = 'a'.repeat(64);

test('conditional reranking selects only a sealed skip rule that preserves winner accuracy', async () => {
  const { evaluateRerankSkipFrontier } = await import('../tools/samer/evaluate-rerank-skip-frontier.mjs');
  const rows = Array.from({ length: 60 }, (_, index) => {
    const safe = index < 30;
    return {
      id: `row-${index}`,
      candidateCount: 6,
      expectedWinnerId: 'winner',
      controlWinnerId: safe ? 'winner' : 'wrong',
      modelWinnerId: 'winner',
      signals: safe
        ? { lexicalMargin: 0.9, embeddingMargin: 0.85, entropy: 0.05, candidateDisagreement: 0 }
        : { lexicalMargin: 0.1, embeddingMargin: 0.15, entropy: 0.8, candidateDisagreement: 1 },
    };
  });
  const report = evaluateRerankSkipFrontier({
    schema: 'simulatte.conditionalRerankingTrial.v1',
    population: {
      schema: 'simulatte.sealedRerankingDecisionPopulation.v1',
      visibility: 'sealed',
      contaminationStatus: 'unexposed',
      commitmentSha256: HASH,
    },
    rows,
    rules: [
      {
        id: 'calibrated-safe',
        thresholds: {
          minimumLexicalMargin: 0.8,
          minimumEmbeddingMargin: 0.8,
          maximumEntropy: 0.1,
          maximumCandidateDisagreement: 0,
        },
      },
      {
        id: 'aggressive',
        thresholds: {
          minimumLexicalMargin: 0,
          minimumEmbeddingMargin: 0,
          maximumEntropy: 1,
          maximumCandidateDisagreement: 1,
        },
      },
    ],
  });

  assert.equal(report.selectedRuleId, 'calibrated-safe');
  assert.equal(report.promotionEligible, true);
  const selected = report.rules.find((row) => row.id === 'calibrated-safe');
  assert.equal(selected.modelSkipRate, 0.5);
  assert.equal(selected.winnerAccuracy, 1);
  assert.equal(selected.decisions[0].modelExecuted, false);
  assert.equal(selected.decisions[0].modelNotExecutedReason, 'sealed-calibrated-rule:calibrated-safe');
  assert.equal(report.rules.find((row) => row.id === 'aggressive').qualityPass, false);
});

test('conditional reranking rejects public calibration populations', async () => {
  const { evaluateRerankSkipFrontier } = await import('../tools/samer/evaluate-rerank-skip-frontier.mjs');
  assert.throws(() => evaluateRerankSkipFrontier({
    schema: 'simulatte.conditionalRerankingTrial.v1',
    population: {
      schema: 'simulatte.sealedRerankingDecisionPopulation.v1',
      visibility: 'public',
      contaminationStatus: 'exposed',
      commitmentSha256: HASH,
    },
    rows: [],
    rules: [],
  }), /requires an unexposed sealed population/);
});

test('structured intent has an independent extraction and Phase 8 coverage gate', async () => {
  const { evaluateStructuredIntentTrial } = await import('../tools/samer/evaluate-structured-intent.mjs');
  const row = {
    id: 'birds-castle',
    expected: {
      entities: [
        { id: 'birds', role: 'actor', count: 4 },
        { id: 'castle', role: 'object', count: 1 },
      ],
      relations: [{ source: 'birds', type: 'above', target: 'castle' }],
      unsupportedConcepts: ['historically accurate architecture'],
      phase8Obligations: ['count-birds', 'birds-above-castle'],
    },
    actual: {
      entities: [
        { id: 'birds', role: 'actor', count: 4 },
        { id: 'castle', role: 'object', count: 1 },
      ],
      relations: [{ source: 'birds', type: 'above', target: 'castle' }],
      unsupportedConcepts: ['historically accurate architecture'],
      schemaValid: true,
      phase8CoveredObligations: ['count-birds', 'birds-above-castle'],
    },
  };
  const base = {
    schema: 'simulatte.structuredIntentTrial.v1',
    population: {
      schema: 'simulatte.sealedStructuredIntentPopulation.v1',
      visibility: 'sealed',
      contaminationStatus: 'unexposed',
      commitmentSha256: HASH,
    },
    candidate: { id: 'extractor', implementationId: 'simulatte.extractor.v1' },
    rows: [row],
  };
  const pass = evaluateStructuredIntentTrial(base);
  assert.equal(pass.promotionEligible, true);
  assert.deepEqual(pass.failedMetrics, []);

  const failed = structuredClone(base);
  failed.rows[0].actual.relations = [];
  failed.rows[0].actual.phase8CoveredObligations = ['count-birds'];
  const report = evaluateStructuredIntentTrial(failed);
  assert.equal(report.promotionEligible, false);
  assert.deepEqual(report.failedMetrics, ['relationPreservation', 'phase8ObligationCoverage']);
});
