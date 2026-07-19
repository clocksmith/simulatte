(function attachSimulatteClassificationTierRouter(root, factory) {
  const compactRuntime = typeof module === 'object' && module.exports
    ? require('./simulatte-compact-classifier-runtime.js')
    : root.SimulatteCompactClassifierRuntime;
  if (!compactRuntime) throw new Error('Simulatte compact classifier runtime is required');
  const api = factory(compactRuntime);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteClassificationTierRouter = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createClassificationTierRouterApi(compactRuntime) {
  const POLICY_SCHEMA = 'simulatte.classificationTierPolicy.v1';
  const ROUTE_SCHEMA = 'simulatte.classificationTierRoute.v1';

  function createRouter(policy, providers = {}) {
    validatePolicy(policy);
    const tiersById = new Map(policy.tiers.map((tier) => [tier.id, tier]));

    async function classify(request, options = {}) {
      requireText(request && request.headId, 'classification request headId');
      const attempts = [];
      for (const tierId of policy.routing.order) {
        const tier = tiersById.get(tierId);
        if (!tier) throw new Error(`Classification routing references unknown tier ${tierId}`);
        const availability = tierAvailability(tier, providers, options, request.headId);
        if (!availability.available) {
          attempts.push(attemptReceipt(tier, 'skipped', availability.reason));
          continue;
        }
        const result = await executeTier(tier, request, providers, options);
        const calibrated = applyCalibration(result, tier, request.headId, options.calibration);
        attempts.push(attemptReceipt(tier, 'executed', calibrated.accepted ? null : calibrated.refusalReason, calibrated));
        if (calibrated.accepted) return routeReceipt(request, calibrated, attempts, tier.id);
      }
      return routeReceipt(request, abstentionResult(request), attempts, null);
    }

    return Object.freeze({ policy, classify });
  }

  async function executeTier(tier, request, providers, options) {
    if (tier.adapter === 'browser-linear') {
      return compactRuntime.classify(request.headId, request.text, {
        modelKey: tier.modelKey,
        calibration: calibrationFor(options.calibration, tier.candidateId, request.headId),
      });
    }
    const provider = providers[tier.providerId];
    if (!provider) throw new Error(`Classification tier ${tier.id} provider ${tier.providerId} is unavailable`);
    if (tier.adapter === 'sequence-classifier') {
      if (typeof provider.classify !== 'function') throw new Error(`${tier.providerId} must expose classify()`);
      return normalizeProviderResult(await provider.classify(request), tier, request);
    }
    if (tier.adapter === 'embedding-labels') {
      return classifyWithEmbeddings(provider, tier, request, options);
    }
    throw new Error(`Classification tier ${tier.id} adapter is unsupported: ${tier.adapter}`);
  }

  async function classifyWithEmbeddings(provider, tier, request, options) {
    const head = compactRuntime.artifact.heads.find((row) => row.id === request.headId);
    if (!head) throw new Error(`Embedding classifier head is unknown: ${request.headId}`);
    const labels = head.labels.filter((label) => !head.scoredLabelsExclude.includes(label));
    const texts = [String(request.text || ''), ...labels.map((label) => label.replaceAll('-', ' '))];
    const vectors = await embedTexts(provider, texts, options);
    if (vectors.length !== texts.length) throw new Error(`${tier.providerId} returned ${vectors.length}/${texts.length} embeddings`);
    const scores = labels.map((id, index) => ({
      id,
      score: cosine(vectors[0], vectors[index + 1]),
    })).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    const top = scores[0] || { id: head.abstention.label, score: 0 };
    const next = scores[1] || { score: 0 };
    return {
      schema: compactRuntime.RESULT_SCHEMA,
      headId: request.headId,
      inputUnit: head.inputUnit,
      input: String(request.text || ''),
      modelId: tier.modelId,
      modelExecuted: true,
      qualificationStatus: tier.status,
      candidateLabel: top.id,
      confidence: round(top.score),
      margin: round(top.score - next.score),
      scores,
    };
  }

  function applyCalibration(result, tier, headId, calibration) {
    const rule = calibrationFor(calibration, tier.candidateId, headId);
    const top = result.scores && result.scores[0] || { id: result.candidateLabel, score: result.confidence || 0 };
    const accepted = Boolean(
      rule
      && rule.status === 'calibrated'
      && Number(result.confidence) >= Number(rule.minimumConfidence)
      && Number(result.margin || 0) >= Number(rule.minimumMargin || 0)
    );
    return Object.freeze({
      ...result,
      predictedLabel: accepted ? top.id : 'abstain',
      accepted,
      calibrationStatus: rule ? rule.status : 'missing',
      refusalReason: accepted ? null : rule ? 'below-calibrated-acceptance-floor' : 'candidate-specific-calibration-required',
    });
  }

  function calibrationFor(calibration, candidateId, headId) {
    const candidate = calibration && calibration.candidates && calibration.candidates[candidateId];
    const head = candidate && candidate.heads && candidate.heads[headId];
    if (!candidate || candidate.eligible !== true || !head || head.clearsCalibrationGate !== true) return null;
    return {
      status: 'calibrated',
      minimumConfidence: Number(head.minimumConfidence),
      minimumMargin: Number(head.minimumMargin || 0),
      calibrationId: calibration.id,
    };
  }

  function tierAvailability(tier, providers, options, headId) {
    if (tier.status === 'disabled') return { available: false, reason: 'tier-disabled' };
    if (tier.availability !== 'browser-ready') return { available: false, reason: tier.availability || 'tier-unavailable' };
    if (tier.status === 'evaluation-only' && options.allowEvaluation !== true) {
      return { available: false, reason: 'evaluation-tier-not-enabled' };
    }
    if (tier.requiresConsent && options.modelConsent !== true) return { available: false, reason: 'model-consent-required' };
    if (tier.adapter !== 'browser-linear'
      && !calibrationFor(options.calibration, tier.candidateId, headId)
      && options.allowUncalibratedDiagnostics !== true) {
      return { available: false, reason: 'candidate-specific-calibration-required' };
    }
    if (tier.adapter !== 'browser-linear' && !providers[tier.providerId]) {
      return { available: false, reason: 'provider-unavailable' };
    }
    return { available: true, reason: null };
  }

  function normalizeProviderResult(result, tier, request) {
    if (!result || !Array.isArray(result.scores) || !result.scores.length) {
      throw new Error(`Classification provider ${tier.providerId} returned no scores for ${request.headId}`);
    }
    const scores = [...result.scores]
      .map((row) => ({ id: requireText(row.id, 'provider score id'), score: Number(row.score || 0) }))
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    return {
      schema: compactRuntime.RESULT_SCHEMA,
      headId: request.headId,
      input: String(request.text || ''),
      modelId: tier.modelId,
      modelExecuted: true,
      qualificationStatus: tier.status,
      candidateLabel: scores[0].id,
      confidence: round(scores[0].score),
      margin: round(scores[0].score - (scores[1] && scores[1].score || 0)),
      scores,
    };
  }

  async function embedTexts(provider, texts, options) {
    if (typeof provider.embedBatch === 'function') return provider.embedBatch(texts, options);
    if (typeof provider.embed !== 'function') throw new Error('Embedding classification provider must expose embed() or embedBatch()');
    return Promise.all(texts.map((text) => provider.embed(text, options)));
  }

  function routeReceipt(request, result, attempts, selectedTierId) {
    return Object.freeze({
      schema: ROUTE_SCHEMA,
      headId: request.headId,
      requestId: request.id || '',
      selectedTierId,
      accepted: result.accepted === true,
      result,
      attempts: Object.freeze(attempts),
    });
  }

  function attemptReceipt(tier, status, reason, result = null) {
    return Object.freeze({ tierId: tier.id, candidateId: tier.candidateId, status, reason, result });
  }

  function abstentionResult(request) {
    return Object.freeze({
      schema: compactRuntime.RESULT_SCHEMA,
      headId: request.headId,
      input: String(request.text || ''),
      modelExecuted: false,
      predictedLabel: 'abstain',
      candidateLabel: null,
      confidence: 0,
      margin: 0,
      accepted: false,
      refusalReason: 'no-qualified-tier-accepted',
      scores: Object.freeze([]),
    });
  }

  function cosine(left, right) {
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    const length = Math.min(left && left.length || 0, right && right.length || 0);
    for (let index = 0; index < length; index += 1) {
      const a = Number(left[index] || 0);
      const b = Number(right[index] || 0);
      dot += a * b;
      leftNorm += a * a;
      rightNorm += b * b;
    }
    const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
    return denominator ? dot / denominator : 0;
  }

  function validatePolicy(policy) {
    if (!policy || policy.schema !== POLICY_SCHEMA) throw new Error(`Classification tier policy expected ${POLICY_SCHEMA}`);
    if (!Array.isArray(policy.tiers) || !policy.tiers.length) throw new Error('Classification tier policy requires tiers');
    if (!Array.isArray(policy.routing && policy.routing.order) || !policy.routing.order.length) {
      throw new Error('Classification tier policy requires routing.order');
    }
  }

  function requireText(value, label) {
    const text = String(value || '').trim();
    if (!text) throw new Error(`${label} is required`);
    return text;
  }

  function round(value) {
    return Number(Number(value || 0).toFixed(6));
  }

  return Object.freeze({ POLICY_SCHEMA, ROUTE_SCHEMA, createRouter });
});
