(function attachSimulatteIntentClassifier(root, factory) {
  function markMissingDependency(moduleName, dependencyName) {
    const state = root.SimulatteBoot = root.SimulatteBoot || { failedScripts: [] };
    state.missingDependencies = state.missingDependencies || [];
    state.missingDependencies.push({ moduleName, dependencyName });
    console.warn(`[simulatte.boot] ${moduleName} waiting for ${dependencyName}`);
  }

  const catalog = typeof module === 'object' && module.exports
    ? require('../phase-05-simulation/simulatte-physics-catalog.js')
    : root.SimulattePhysicsCatalog;
  if (!catalog) {
    markMissingDependency('SimulatteIntentClassifier', 'SimulattePhysicsCatalog');
    return;
  }
  const api = factory(catalog);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteIntentClassifier = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createIntentClassifier(catalog) {
  const {
    PHYSICAL_PRIMITIVES,
    buildIntentVector,
    clamp,
    explicitPrimitiveScore,
    isRetrievablePrimitive,
    meaningfulTokens,
    primitiveById,
    primitiveText,
    uniqueList,
    vectorScore,
    withPrimitiveDependencies,
  } = catalog;

  const INTENT_CLASSIFICATION_SCHEMA = 'simulatte.intentClassification.v1';
  const INTENT_MODEL_ID = 'simulatte-local-tfidf-prototype-embedder.v1';
  const DETERMINISTIC_CONTROL_ID = 'simulatte-local-tfidf-control.v1';
  const LAYER_PROFILES = Object.freeze([
    ['math', 'scalar vector matrix tensor field grid particle graph curve boundary unit kernel gradient divergence curl laplacian sampling interpolation invariant'],
    ['physics', 'gravity collision friction pressure diffusion radiation combustion magnetism optics erosion'],
    ['material', 'water air steam smoke fire ice oil sand soil rock metal glass wood rubber plastic fuel'],
    ['component', 'lamp flame river cloud pipe pump valve motor generator sensor controller wheel gear lens'],
    ['composition', 'machine system engine reactor bench grid forest fire supply chain traffic power market'],
    ['scene', 'lab city forest coastline warehouse marketplace transit map desert mountain factory world'],
  ]);
  const provider = makeEmbedProvider(PHYSICAL_PRIMITIVES.map(primitiveText));

  function makeEmbedProvider(corpus) {
    const idf = buildIdfMap(corpus);
    return {
      dimensions: idf.size,
      encode(text) {
        return applyIdf(buildIntentVector(text), idf);
      },
      score(a, b) {
        return vectorScore(a, b);
      },
    };
  }

  function buildIdfMap(documents) {
    const df = new Map();
    for (const document of documents || []) {
      const vector = buildIntentVector(document);
      for (const key of vector.keys()) {
        df.set(key, (df.get(key) || 0) + 1);
      }
    }
    const count = Math.max(1, (documents || []).length);
    const idf = new Map();
    for (const [key, value] of df) {
      idf.set(key, Math.log((count + 1) / (value + 1)) + 1);
    }
    return idf;
  }

  function applyIdf(vector, idf) {
    const out = new Map();
    for (const [key, value] of vector) {
      out.set(key, value * (idf.get(key) || 1));
    }
    return out;
  }

  function classifyIntentPrompt(promptText = '', options = {}) {
    const prompt = String(promptText || '').trim();
    const max = Number.isFinite(options.max) ? options.max : 36;
    if (!prompt || options.blankPromptIntent === true) {
      return blankClassification(prompt);
    }
    const modelBackedPriors = rankedFromEmbeddingPriors(options.embeddingPriors || []);
    if (modelBackedPriors.length && options.embeddingModel && options.embeddingModel.id) {
      let ranked = mergeSemanticRag(modelBackedPriors, options.semanticRag || null);
      ranked = applyPromptPriorRules(ranked, prompt);
      const selected = selectedPriors(ranked, max);
      const layerScores = layerScoreDistributionFromPriors(selected);
      const domainScores = aggregateDomainScores(selected);
      const top = selected[0] ? selected[0].score : 0;
      const next = selected[1] ? selected[1].score : 0;
      return {
        schema: INTENT_CLASSIFICATION_SCHEMA,
        model: classificationModel(options),
        query: prompt,
        priors: selected,
        layerScores,
        domainScores,
        layerFocus: topLayer(selected, layerScores),
        confidence: Number(clamp(top - next * 0.35, 0, 1).toFixed(4)),
      };
    }
    if (options.allowPrototypeFallback !== true && options.deterministicRuntime !== true) {
      throw new Error('classifyIntentPrompt requires model-backed embeddingPriors; set allowPrototypeFallback for dev-only lexical classification');
    }
    const intentVec = provider.encode(prompt);
    let ranked = PHYSICAL_PRIMITIVES
      .filter((primitive) => isRetrievablePrimitive(primitive))
      .map((primitive) => scorePrimitive(prompt, intentVec, primitive))
      .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
    ranked = mergeEmbeddingPriors(ranked, options.embeddingPriors || []);
    ranked = mergeSemanticRag(ranked, options.semanticRag || null);
    ranked = applyPromptPriorRules(ranked, prompt);
    const selected = selectedPriors(ranked, max);
    const layerScores = layerScoreDistribution(intentVec, selected);
    const domainScores = aggregateDomainScores(selected);
    const top = selected[0] ? selected[0].score : 0;
    const next = selected[1] ? selected[1].score : 0;
    return {
      schema: INTENT_CLASSIFICATION_SCHEMA,
      model: classificationModel(options),
      query: prompt,
      priors: selected,
      layerScores,
      domainScores,
      layerFocus: topLayer(selected, layerScores),
      confidence: Number(clamp(top - next * 0.35, 0, 1).toFixed(4)),
    };
  }

  function classificationModel(options = {}) {
    const runtime = options.embeddingModel && options.embeddingModel.id
      ? {
        id: options.embeddingModel.id,
        family: options.embeddingModel.family || 'browser-local-embedding',
        dimensions: options.embeddingModel.dimensions || 0,
        backend: options.embeddingBackend || 'unknown',
        indexId: options.embeddingModel.indexId || '',
        reranker: options.embeddingModel.reranker || '',
      }
      : null;
    if (!runtime) {
      return {
        id: options.deterministicRuntime === true ? DETERMINISTIC_CONTROL_ID : INTENT_MODEL_ID,
        family: options.deterministicRuntime === true ? 'local-deterministic-control' : 'local-embedding-prototype',
        encoder: 'tf-idf word ngram bigram cosine',
        corpusSize: PHYSICAL_PRIMITIVES.length,
        dimensions: provider.dimensions,
      };
    }
    const runtimeSlug = modelSlug(runtime.id);
    return {
      id: `simulatte-${runtimeSlug}-intent-ranker.v1`,
      family: 'browser-local-model-backed-embedding',
      encoder: `${runtime.id} primitive cosine + mandatory rerank`,
      corpusSize: PHYSICAL_PRIMITIVES.length,
      dimensions: runtime.dimensions,
      runtime,
    };
  }

  function modelSlug(value) {
    const slug = String(value || 'intent-model')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return slug || 'intent-model';
  }

  function mergeEmbeddingPriors(ranked, embeddingPriors) {
    if (!Array.isArray(embeddingPriors) || !embeddingPriors.length) return ranked;
    const byId = new Map((ranked || []).map((prior) => [prior.primitiveId, { ...prior }]));
    for (const modelPrior of embeddingPriors) {
      const primitiveId = modelPrior && modelPrior.primitiveId;
      const primitive = primitiveById(primitiveId);
      if (!isRetrievablePrimitive(primitive)) continue;
      const modelScore = clamp(Number(modelPrior.score || 0), 0, 1);
      const existing = byId.get(primitive.id) || primitivePrior(primitive);
      existing.modelScore = Number(modelScore.toFixed(4));
      existing.score = Number(clamp(Math.max(existing.score, modelScore * 0.92), 0, 1).toFixed(4));
      existing.semanticScore = Number(Math.max(existing.semanticScore || 0, modelScore).toFixed(4));
      byId.set(primitive.id, existing);
    }
    return Array.from(byId.values())
      .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
  }

  function rankedFromEmbeddingPriors(embeddingPriors) {
    if (!Array.isArray(embeddingPriors) || !embeddingPriors.length) return [];
    const byId = new Map();
    for (const modelPrior of embeddingPriors) {
      const primitiveId = modelPrior && modelPrior.primitiveId;
      const primitive = primitiveById(primitiveId);
      if (!isRetrievablePrimitive(primitive)) continue;
      const modelScore = clamp(Number(modelPrior.score || modelPrior.modelScore || 0), 0, 1);
      const prior = {
        primitiveId: primitive.id,
        layer: canonicalLayer(primitive.layer || primitive.type),
        rawLayer: primitive.layer || primitive.type || 'component',
        type: primitive.type,
        domains: primitive.domains || [],
        score: Number(modelScore.toFixed(4)),
        modelScore: Number(modelScore.toFixed(4)),
        semanticScore: Number(modelScore.toFixed(4)),
        symbolicBoost: Number(modelPrior.symbolicBoost || 0),
        matchedTerms: modelPrior.matchedTerms || [],
      };
      const existing = byId.get(primitive.id);
      if (!existing || prior.score > existing.score) byId.set(primitive.id, prior);
    }
    return Array.from(byId.values())
      .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
  }

  function mergeSemanticRag(ranked, semanticRag) {
    const docs = semanticRag && Array.isArray(semanticRag.retrieved) ? semanticRag.retrieved : [];
    if (!docs.length) return ranked;
    const byId = new Map((ranked || []).map((prior) => [prior.primitiveId, { ...prior }]));
    for (const doc of docs) {
      const primitive = primitiveById(doc.primitiveId);
      if (!isRetrievablePrimitive(primitive)) continue;
      const existing = byId.get(primitive.id) || primitivePrior(primitive);
      const ragScore = clamp(Number(doc.score || 0), 0, 1);
      existing.ragScore = Number(ragScore.toFixed(4));
      existing.matchedTerms = doc.matchedTerms || [];
      existing.score = Number(clamp(Math.max(existing.score, ragScore * 0.9), 0, 1).toFixed(4));
      existing.semanticScore = Number(Math.max(existing.semanticScore || 0, ragScore).toFixed(4));
      byId.set(primitive.id, existing);
    }
    return Array.from(byId.values())
      .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
  }

  function primitivePrior(primitive) {
    return {
      primitiveId: primitive.id,
      layer: canonicalLayer(primitive.layer || primitive.type),
      rawLayer: primitive.layer || primitive.type || 'component',
      type: primitive.type,
      domains: primitive.domains || [],
      score: 0,
      semanticScore: 0,
      symbolicBoost: 0,
    };
  }

  function applyPromptPriorRules(ranked, prompt) {
    const promptText = String(prompt || '').toLowerCase();
    const promptTerms = new Set(meaningfulTokens(promptText));
    const byId = new Map((ranked || []).map((prior) => [prior.primitiveId, { ...prior }]));
    const ensure = (primitiveId, score, matchedTerms = []) => {
      const primitive = primitiveById(primitiveId);
      if (!isRetrievablePrimitive(primitive)) return;
      const existing = byId.get(primitive.id) || primitivePrior(primitive);
      const nextScore = clamp(Math.max(Number(existing.score || 0), score), 0, 1);
      byId.set(primitive.id, {
        ...existing,
        score: Number(nextScore.toFixed(4)),
        semanticScore: Number(Math.max(existing.semanticScore || 0, nextScore).toFixed(4)),
        symbolicBoost: Number(Math.max(existing.symbolicBoost || 0, score).toFixed(4)),
        matchedTerms: uniqueList([...(existing.matchedTerms || []), ...matchedTerms]),
      });
    };
    for (const primitive of PHYSICAL_PRIMITIVES) {
      if (!isRetrievablePrimitive(primitive)) continue;
      const idPhrase = primitive.id.replace(/[-_]+/g, ' ');
      const idTerms = primitive.id.split(/[-_]+/).filter((term) => term.length > 2);
      if (
        promptText.includes(idPhrase) ||
        (idTerms.length > 1 && idTerms.every((term) => promptTerms.has(term)))
      ) {
        ensure(primitive.id, 0.74, idTerms);
      }
    }
    return Array.from(byId.values())
      .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
  }

  function blankClassification(prompt) {
    return {
      schema: INTENT_CLASSIFICATION_SCHEMA,
      model: {
        id: INTENT_MODEL_ID,
        family: 'local-embedding-prototype',
        encoder: 'tf-idf word ngram bigram cosine',
        corpusSize: PHYSICAL_PRIMITIVES.length,
        dimensions: provider.dimensions,
      },
      query: prompt,
      priors: [],
      layerScores: [],
      domainScores: [],
      layerFocus: 'blank',
      confidence: 1,
    };
  }

  function scorePrimitive(prompt, intentVec, primitive) {
    const candidateVec = provider.encode(primitiveText(primitive));
    const semanticScore = provider.score(intentVec, candidateVec);
    const symbolicBoost = explicitPrimitiveScore(prompt, primitive);
    const score = semanticScore * 0.82 + symbolicBoost * 0.18;
    return {
      primitiveId: primitive.id,
      layer: canonicalLayer(primitive.layer || primitive.type),
      rawLayer: primitive.layer || primitive.type || 'component',
      type: primitive.type,
      domains: primitive.domains || [],
      score: Number(score.toFixed(4)),
      semanticScore: Number(semanticScore.toFixed(4)),
      symbolicBoost: Number(symbolicBoost.toFixed(4)),
    };
  }

  function selectedPriors(ranked, max) {
    const topScore = ranked[0] ? ranked[0].score : 0;
    const threshold = Math.max(0.042, topScore * 0.26);
    const eligible = ranked.filter((prior) => prior.score >= threshold);
    const selected = [];
    const seen = new Set();
    const add = (prior) => {
      if (!prior || seen.has(prior.primitiveId) || selected.length >= max) return;
      selected.push(prior);
      seen.add(prior.primitiveId);
    };
    eligible.slice(0, Math.min(12, max)).forEach(add);
    const diversityKeys = new Set();
    for (const prior of selected) {
      for (const key of priorSelectionKeys(prior)) diversityKeys.add(key);
    }
    for (const prior of eligible) {
      if (selected.length >= max) break;
      const keys = priorSelectionKeys(prior);
      if (keys.some((key) => !diversityKeys.has(key))) {
        add(prior);
        for (const key of keys) diversityKeys.add(key);
      }
    }
    for (const prior of eligible) add(prior);
    return selected.sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
  }

  function priorSelectionKeys(prior) {
    return uniqueList([
      canonicalLayer(prior.layer),
      prior.type,
      ...(prior.domains || []).slice(0, 3),
    ]);
  }

  function canonicalLayer(layer) {
    const value = String(layer || 'component');
    if (['math', 'physics', 'material', 'component', 'composition', 'scene'].includes(value)) {
      return value;
    }
    if (['field', 'constraint'].includes(value)) return 'physics';
    if (['ledger', 'source-sink'].includes(value)) return 'math';
    return 'component';
  }

  function layerScoreDistribution(intentVec, priors) {
    const totals = new Map();
    for (const prior of priors || []) {
      const layer = canonicalLayer(prior.layer);
      totals.set(layer, (totals.get(layer) || 0) + prior.score * 0.62);
    }
    for (const [layer, text] of LAYER_PROFILES) {
      const score = provider.score(intentVec, provider.encode(text));
      totals.set(layer, (totals.get(layer) || 0) + score * 1.18);
    }
    return Array.from(totals.entries())
      .map(([id, score]) => ({ id, score: Number(score.toFixed(4)) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  }

  function layerScoreDistributionFromPriors(priors) {
    const totals = new Map();
    for (const prior of priors || []) {
      const layer = canonicalLayer(prior.layer);
      totals.set(layer, (totals.get(layer) || 0) + prior.score);
    }
    return Array.from(totals.entries())
      .map(([id, score]) => ({ id, score: Number(score.toFixed(4)) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  }

  function aggregateScores(priors, field) {
    const totals = new Map();
    for (const prior of priors || []) {
      const key = prior[field] || 'component';
      totals.set(key, (totals.get(key) || 0) + prior.score);
    }
    return Array.from(totals.entries())
      .map(([id, score]) => ({ id, score: Number(score.toFixed(4)) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  }

  function aggregateDomainScores(priors) {
    const totals = new Map();
    for (const prior of priors || []) {
      for (const domain of prior.domains || []) {
        totals.set(domain, (totals.get(domain) || 0) + prior.score);
      }
    }
    return Array.from(totals.entries())
      .map(([id, score]) => ({ id, score: Number(score.toFixed(4)) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, 16);
  }

  function topLayer(priors, layerScores) {
    const top = priors && priors[0];
    if (
      top &&
      top.score >= 0.42 &&
      ['scene', 'composition'].includes(top.layer)
    ) {
      return top.layer;
    }
    if (top && top.layer === 'component' && top.score >= 0.62) return 'component';
    const ordered = layerScores || [];
    const first = ordered.find((row) => row.id && row.id !== 'ledger');
    return first ? first.id : 'composition';
  }

  function rankPrimitivesForClassification(classification, options = {}) {
    const max = Number.isFinite(options.max) ? options.max : 40;
    const priors = classification.priors || [];
    const topScore = priors[0] ? Number(priors[0].score || 0) : 0;
    const promptTerms = new Set(meaningfulTokens(classification.query || ''));
    const expandable = priors.filter((prior) => priorCanExpand(prior, promptTerms, topScore));
    const priorsById = new Map(expandable.map((prior) => [prior.primitiveId, prior]));
    const ranked = expandable
      .map((prior) => primitiveById(prior.primitiveId))
      .filter(Boolean)
      .map((primitive) => ({ ...primitive, score: priorsById.get(primitive.id).score }));
    return withPrimitiveDependencies(ranked, classification.query)
      .map((primitive) => ({
        ...primitive,
        score: Number(Math.max(
          priorsById.get(primitive.id)?.score || 0,
          primitive.score || 0
        ).toFixed(4)),
      }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, max);
  }

  function priorCanExpand(prior, promptTerms, topScore) {
    const score = Number(prior && prior.score || 0);
    const layer = canonicalLayer(prior && prior.layer);
    if (score >= Math.max(0.24, topScore * 0.5)) return true;
    if (priorIdentityMatchesPrompt(prior, promptTerms)) return true;
    if (['scene', 'composition'].includes(layer)) return false;
    if (Number(prior && prior.symbolicBoost || 0) >= 0.09) return true;
    if (score >= Math.max(0.15, topScore * 0.28)) return true;
    const matchedTerms = prior && Array.isArray(prior.matchedTerms) ? prior.matchedTerms : [];
    return matchedTerms.some((term) => promptTerms.has(term));
  }

  function priorIdentityMatchesPrompt(prior, promptTerms) {
    if (!prior || !promptTerms || !promptTerms.size) return false;
    const generic = new Set([
      'component',
      'composition',
      'field',
      'material',
      'physics',
      'scene',
      'source',
      'system',
    ]);
    const terms = uniqueList([
      ...String(prior.primitiveId || '').split(/[-_]+/),
      ...(prior.domains || []).flatMap((domain) => String(domain || '').split(/[-_]+/)),
    ]).filter((term) => term.length > 2 && !generic.has(term));
    return terms.some((term) => promptTerms.has(term));
  }

  function classificationSummary(classification) {
    return {
      model: classification.model.id,
      confidence: classification.confidence,
      layerFocus: classification.layerFocus,
      priors: (classification.priors || []).slice(0, 10).map((prior) => prior.primitiveId),
      domains: uniqueList((classification.domainScores || []).slice(0, 8).map((row) => row.id)),
    };
  }

  return {
    INTENT_CLASSIFICATION_SCHEMA,
    INTENT_MODEL_ID,
    classificationSummary,
    classifyIntentPrompt,
    rankPrimitivesForClassification,
  };
});
