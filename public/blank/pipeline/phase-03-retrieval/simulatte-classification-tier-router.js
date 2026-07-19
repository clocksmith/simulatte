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
    const embeddingCache = new Map();
    const embeddingCacheMaxEntries = Number(policy.execution && policy.execution.embeddingLabelCacheMaxEntries);

    async function classify(request, options = {}) {
      requireText(request && request.headId, 'classification request headId');
      const attempts = [];
      const routeOrder = options.selectedTierId ? [options.selectedTierId] : policy.routing.order;
      for (const tierId of routeOrder) {
        const tier = tiersById.get(tierId);
        if (!tier) throw new Error(`Classification routing references unknown tier ${tierId}`);
        const availability = tierAvailability(tier, providers, options, request.headId);
        if (!availability.available) {
          attempts.push(attemptReceipt(tier, 'skipped', availability.reason));
          continue;
        }
        const result = await executeTier(tier, request, providers, options, embeddingCache, embeddingCacheMaxEntries);
        const calibrated = applyCalibration(result, tier, request.headId, options.calibration);
        attempts.push(attemptReceipt(tier, 'executed', calibrated.accepted ? null : calibrated.refusalReason, calibrated));
        if (calibrated.accepted) return routeReceipt(request, calibrated, attempts, tier.id);
      }
      return routeReceipt(request, abstentionResult(request), attempts, null);
    }

    async function classifyMany(requests, options = {}) {
      if (!Array.isArray(requests)) throw new Error('Classification requests must be an array');
      const routeOrder = options.selectedTierId ? [options.selectedTierId] : policy.routing.order;
      await prewarmEmbeddingTiers(requests, routeOrder, tiersById, providers, options, embeddingCache, embeddingCacheMaxEntries);
      const routes = await Promise.all(requests.map((request) => classify(request, options)));
      const results = routes.map((route) => compactResult(route.result));
      return Object.freeze({
        schema: 'simulatte.boundedHeadClassification.v1',
        status: results.some((result) => result.accepted) ? 'calibrated' : 'diagnostic-only',
        modelExecuted: routes.some(routeExecutedModel),
        candidateId: null,
        modelKey: null,
        artifactId: compactRuntime.artifact.id,
        calibrationId: options.calibration && options.calibration.id || null,
        requestCount: requests.length,
        acceptedCount: results.filter((result) => result.accepted).length,
        results: Object.freeze(results),
        routes: Object.freeze(routes),
      });
    }

    return Object.freeze({ policy, classify, classifyMany });
  }

  async function executeTier(tier, request, providers, options, embeddingCache, embeddingCacheMaxEntries) {
    if (tier.adapter === 'browser-compact') {
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
      return classifyWithEmbeddings(provider, tier, request, options, embeddingCache, embeddingCacheMaxEntries);
    }
    throw new Error(`Classification tier ${tier.id} adapter is unsupported: ${tier.adapter}`);
  }

  async function classifyWithEmbeddings(provider, tier, request, options, embeddingCache, embeddingCacheMaxEntries) {
    const head = compactRuntime.artifact.heads.find((row) => row.id === request.headId);
    if (!head) throw new Error(`Embedding classifier head is unknown: ${request.headId}`);
    const labels = head.labels.filter((label) => !head.scoredLabelsExclude.includes(label));
    const rows = [
      { text: String(request.text || ''), embeddingKind: 'query' },
      ...embeddingLabelRows(head, labels),
    ];
    const vectors = await embeddingVectors(provider, tier, rows, options, embeddingCache, embeddingCacheMaxEntries);
    if (vectors.length !== rows.length) throw new Error(`${tier.providerId} returned ${vectors.length}/${rows.length} embeddings`);
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
    if (tier.adapter !== 'browser-compact'
      && !calibrationFor(options.calibration, tier.candidateId, headId)
      && options.allowUncalibratedDiagnostics !== true) {
      return { available: false, reason: 'candidate-specific-calibration-required' };
    }
    if (tier.adapter === 'embedding-labels' && !String(options.embeddingIdentity || '').trim()) {
      return { available: false, reason: 'embedding-compatibility-identity-required' };
    }
    if (tier.adapter !== 'browser-compact' && !providers[tier.providerId]) {
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

  async function prewarmEmbeddingTiers(requests, routeOrder, tiersById, providers, options, cache, cacheMaxEntries) {
    for (const tierId of routeOrder) {
      const tier = tiersById.get(tierId);
      if (!tier || tier.adapter !== 'embedding-labels') continue;
      const eligibleRequests = requests.filter((request) => tierAvailability(tier, providers, options, request.headId).available);
      if (!eligibleRequests.length) continue;
      const rows = [];
      for (const request of eligibleRequests) {
        rows.push({ text: String(request.text || ''), embeddingKind: 'query' });
        const head = compactRuntime.artifact.heads.find((row) => row.id === request.headId);
        if (!head) throw new Error(`Embedding classifier head is unknown: ${request.headId}`);
        rows.push(...embeddingLabelRows(
          head,
          head.labels.filter((id) => !head.scoredLabelsExclude.includes(id))
        ));
      }
      await embeddingVectors(providers[tier.providerId], tier, rows, options, cache, cacheMaxEntries);
    }
  }

  async function embeddingVectors(provider, tier, rows, options, cache, cacheMaxEntries) {
    if (!provider || typeof provider.embedTexts !== 'function') {
      throw new Error('Embedding classification provider must expose embedTexts(rows)');
    }
    const identity = requireText(options.embeddingIdentity, 'embedding compatibility identity');
    const keys = rows.map((row) => embeddingCacheKey(identity, tier.modelId, row));
    const misses = [];
    const missKeys = [];
    const pendingKeys = new Set();
    keys.forEach((key, index) => {
      if (cache.has(key) || pendingKeys.has(key)) return;
      pendingKeys.add(key);
      misses.push(rows[index]);
      missKeys.push(key);
    });
    if (misses.length) {
      const outputs = await provider.embedTexts(misses, options);
      if (!Array.isArray(outputs) || outputs.length !== misses.length) {
        throw new Error(`${tier.providerId} returned ${outputs && outputs.length || 0}/${misses.length} embedding vectors`);
      }
      outputs.forEach((output, index) => {
        cache.set(missKeys[index], normalizeVector(output, `${tier.providerId}[${index}]`));
        while (cache.size > cacheMaxEntries) cache.delete(cache.keys().next().value);
      });
    }
    return keys.map((key) => cache.get(key));
  }

  function embeddingCacheKey(identity, modelId, row) {
    return `${identity}\u0000${modelId}\u0000${row.embeddingKind}\u0000${String(row.text || '').trim().toLowerCase()}`;
  }

  function embeddingLabelRows(head, labels) {
    const prototypes = new Map((head.labelPrototypes || []).map((row) => [row.id, row.text]));
    return labels.map((label) => ({
      text: requireText(prototypes.get(label), `${head.id}.${label} label prototype`),
      embeddingKind: 'document',
    }));
  }

  function normalizeVector(output, label) {
    const vector = output && output.embedding || output;
    if (!vector || typeof vector.length !== 'number' || vector.length < 1) throw new Error(`${label} returned no embedding vector`);
    const normalized = Float32Array.from(vector, Number);
    if (!normalized.every(Number.isFinite)) throw new Error(`${label} returned a non-finite embedding vector`);
    return normalized;
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

  function routeExecutedModel(route) {
    return (route.attempts || []).some((attempt) => attempt.result && attempt.result.modelExecuted === true);
  }

  function compactResult(result) {
    return Object.freeze({
      ...result,
      scores: Object.freeze((result.scores || []).slice(0, 5)),
    });
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
    if (!Number.isInteger(Number(policy.execution && policy.execution.embeddingLabelCacheMaxEntries))
      || Number(policy.execution.embeddingLabelCacheMaxEntries) < 1) {
      throw new Error('Classification tier policy requires a positive embeddingLabelCacheMaxEntries');
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
