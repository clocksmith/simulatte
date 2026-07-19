(function attachSimulatteConditionalReranking(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteConditionalReranking = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createConditionalRerankingApi() {
  const DECISION_SCHEMA = 'simulatte.conditionalRerankDecision.v1';

  function decide(payload = {}) {
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const config = payload.config || {};
    const signals = signalValues(candidates, payload);
    const base = {
      schema: DECISION_SCHEMA,
      candidateCount: candidates.length,
      signalValues: signals,
      modelExecuted: false,
      selectedRuleId: null,
    };
    if (config.enabled !== true) return Object.freeze({ ...base, action: 'deterministic', reason: 'reranker-disabled' });
    if (config.qualification && config.qualification.promotionEligible !== true) {
      return Object.freeze({ ...base, action: 'deterministic', reason: 'reranker-not-qualified' });
    }
    if (candidates.length < 2) return Object.freeze({ ...base, action: 'deterministic', reason: 'candidate-frontier-unambiguous' });
    const activation = payload.activationReceipt;
    if (!activation || activation.promotionEligible !== true || !activation.selectedRuleId) {
      return Object.freeze({ ...base, action: 'rerank', modelExecutionRequired: true, reason: 'no-qualified-skip-rule' });
    }
    const rule = (activation.rules || []).find((row) => row.id === activation.selectedRuleId);
    if (!rule || rule.qualityPass !== true) {
      return Object.freeze({ ...base, action: 'rerank', modelExecutionRequired: true, reason: 'selected-skip-rule-invalid' });
    }
    const thresholds = rule.thresholds || {};
    const skip = signals.lexicalMargin >= Number(thresholds.minimumLexicalMargin)
      && signals.embeddingMargin >= Number(thresholds.minimumEmbeddingMargin)
      && signals.entropy <= Number(thresholds.maximumEntropy)
      && signals.candidateDisagreement <= Number(thresholds.maximumCandidateDisagreement);
    return Object.freeze({
      ...base,
      action: skip ? 'deterministic' : 'rerank',
      reason: skip ? `sealed-calibrated-rule:${rule.id}` : 'ambiguous-frontier',
      modelExecutionRequired: !skip,
      selectedRuleId: rule.id,
    });
  }

  function signalValues(candidates, payload) {
    const lexicalScores = scoresFor(candidates, 'lexicalScore', 'score');
    const embeddingScores = scoresFor(candidates, 'modelScore', 'semanticScore');
    const lexicalWinner = winnerId(candidates, 'lexicalScore', 'score');
    const embeddingWinner = winnerId(candidates, 'modelScore', 'semanticScore');
    return Object.freeze({
      lexicalMargin: margin(lexicalScores),
      embeddingMargin: margin(embeddingScores),
      entropy: normalizedEntropy(embeddingScores.length ? embeddingScores : lexicalScores),
      candidateDisagreement: payload.candidateDisagreement != null
        ? clamp(Number(payload.candidateDisagreement))
        : lexicalWinner && embeddingWinner && lexicalWinner !== embeddingWinner ? 1 : 0,
    });
  }

  function scoresFor(candidates, primary, fallback) {
    return candidates.map((candidate) => Number(candidate[primary] ?? candidate[fallback] ?? 0))
      .filter(Number.isFinite)
      .sort((left, right) => right - left);
  }

  function winnerId(candidates, primary, fallback) {
    const winner = [...candidates].sort((left, right) => (
      Number(right[primary] ?? right[fallback] ?? 0) - Number(left[primary] ?? left[fallback] ?? 0)
      || String(left.primitiveId || left.id || '').localeCompare(String(right.primitiveId || right.id || ''))
    ))[0];
    return winner && (winner.primitiveId || winner.id) || '';
  }

  function margin(scores) {
    return round((scores[0] || 0) - (scores[1] || 0));
  }

  function normalizedEntropy(scores) {
    if (scores.length < 2) return 0;
    const exponentials = scores.map((value) => Math.exp(value));
    const total = exponentials.reduce((sum, value) => sum + value, 0) || 1;
    const entropy = exponentials.reduce((sum, value) => {
      const probability = value / total;
      return sum - probability * Math.log(probability || 1);
    }, 0);
    return round(entropy / Math.log(scores.length));
  }

  function clamp(value) {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  }

  function round(value) {
    return Number(Number(value || 0).toFixed(6));
  }

  return Object.freeze({ DECISION_SCHEMA, decide, signalValues });
});
