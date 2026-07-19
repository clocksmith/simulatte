(function attachSimulatteCompactClassifierRuntime(root, factory) {
  const artifact = typeof module === 'object' && module.exports
    ? require('../../../data/simulatte-compact-classifiers.js')
    : root.SimulatteCompactClassifierArtifact;
  if (!artifact) throw new Error('Simulatte compact classifier artifact is required');
  const api = factory(artifact);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCompactClassifierRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCompactClassifierRuntime(artifact) {
  const ARTIFACT_SCHEMA = 'simulatte.browserCompactClassifierArtifact.v1';
  const RESULT_SCHEMA = 'simulatte.compactClassificationResult.v1';
  const MODEL_KEYS = Object.freeze([
    'multinomialNB',
    'complementNB',
    'linearSVC',
    'logisticRegression',
    'sgdModifiedHuber',
    'nbSvmLogistic',
  ]);
  if (artifact.schema !== ARTIFACT_SCHEMA) {
    throw new Error(`Compact classifier expected ${ARTIFACT_SCHEMA}, received ${artifact.schema || 'missing'}`);
  }
  const headsById = new Map(artifact.heads.map((head) => [head.id, head]));

  function classify(headId, text, options = {}) {
    const head = headsById.get(headId);
    if (!head) throw new Error(`Compact classifier head is unknown: ${headId}`);
    const modelKey = options.modelKey || 'linearSVC';
    if (!MODEL_KEYS.includes(modelKey)) throw new Error(`Compact classifier model is unsupported: ${modelKey}`);
    const model = head.models[modelKey];
    const vector = vectorize(text, head.vectorizer);
    const rawScores = scoreRows(vector, model.coefficients, model.intercepts);
    const probabilities = scoreProbabilities(rawScores, model.scoreKind);
    const scores = model.classes.map((id, index) => ({
      id,
      score: round(probabilities[index]),
      rawScore: round(rawScores[index]),
    })).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    const top = scores[0] || { id: head.abstention.label, score: 0, rawScore: 0 };
    const next = scores[1] || { score: 0, rawScore: 0 };
    const minimumConfidence = Number(options.minimumConfidence ?? head.abstention.minimumConfidence);
    const minimumMargin = Number(options.minimumMargin ?? 0);
    const margin = round(top.score - next.score);
    const hasCalibration = options.calibration && options.calibration.status === 'calibrated';
    const accepted = Boolean(hasCalibration && top.score >= minimumConfidence && margin >= minimumMargin);
    return Object.freeze({
      schema: RESULT_SCHEMA,
      headId,
      inputUnit: head.inputUnit,
      input: String(text || ''),
      modelId: model.id,
      modelKey,
      modelExecuted: true,
      qualificationStatus: model.qualification.status,
      calibrationStatus: hasCalibration ? 'calibrated' : 'missing',
      predictedLabel: accepted ? top.id : head.abstention.label,
      candidateLabel: top.id,
      confidence: top.score,
      margin,
      accepted,
      refusalReason: accepted ? null : hasCalibration ? 'below-calibrated-acceptance-floor' : 'candidate-specific-calibration-required',
      scores: Object.freeze(scores),
      featureCount: vector.size,
    });
  }

  function classifyRequests(requests, options = {}) {
    if (!Array.isArray(requests)) throw new Error('Compact classifier requests must be an array');
    return Object.freeze(requests.map((request) => classify(
      request.headId,
      request.text,
      {
        ...options,
        calibration: options.calibrations && options.calibrations[request.headId] || options.calibration,
      }
    )));
  }

  function vectorize(text, config) {
    const tokens = String(text || '').toLowerCase().match(/[a-z0-9]{2,}/g) || [];
    const terms = [...tokens];
    for (let index = 0; index + 1 < tokens.length; index += 1) {
      terms.push(`${tokens[index]} ${tokens[index + 1]}`);
    }
    const counts = new Map();
    for (const term of terms) counts.set(term, (counts.get(term) || 0) + 1);
    const vocabulary = new Map(config.vocabulary.map((term, index) => [term, index]));
    const vector = new Map();
    let normSquared = 0;
    for (const [term, count] of counts) {
      const index = vocabulary.get(term);
      if (index == null) continue;
      const tf = config.sublinearTf ? 1 + Math.log(count) : count;
      const value = tf * Number(config.idf[index] || 1);
      vector.set(index, value);
      normSquared += value * value;
    }
    const norm = Math.sqrt(normSquared);
    if (norm > 0) {
      for (const [index, value] of vector) vector.set(index, value / norm);
    }
    return vector;
  }

  function scoreRows(vector, coefficients, intercepts) {
    return coefficients.map((row, rowIndex) => {
      let score = Number(intercepts[rowIndex] || 0);
      for (const [column, value] of vector) score += value * Number(row[column] || 0);
      return score;
    });
  }

  function centerScores(scores) {
    const mean = scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length);
    return scores.map((value) => value - mean);
  }

  function scoreProbabilities(scores, scoreKind) {
    if (scoreKind === 'modified-huber-decision') {
      const clipped = scores.map((value) => Math.max(0, Math.min(1, (value + 1) / 2)));
      const total = clipped.reduce((sum, value) => sum + value, 0);
      return total ? clipped.map((value) => value / total) : clipped.map(() => 1 / Math.max(1, clipped.length));
    }
    if (scoreKind === 'decision-function') return softmax(centerScores(scores));
    return softmax(scores);
  }

  function softmax(values) {
    const maximum = Math.max(...values, 0);
    const exponentials = values.map((value) => Math.exp(value - maximum));
    const total = exponentials.reduce((sum, value) => sum + value, 0) || 1;
    return exponentials.map((value) => value / total);
  }

  function round(value) {
    return Number(Number(value || 0).toFixed(6));
  }

  return Object.freeze({
    ARTIFACT_SCHEMA,
    RESULT_SCHEMA,
    MODEL_KEYS,
    artifact,
    classify,
    classifyRequests,
  });
});
