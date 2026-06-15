(function attachSimulatteIntentClassifier(root, factory) {
  const catalog = typeof module === 'object' && module.exports
    ? require('./simulatte-physics-catalog.js')
    : root.SimulattePhysicsCatalog;
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
    primitiveById,
    primitiveText,
    uniqueList,
    vectorScore,
    withPrimitiveDependencies,
  } = catalog;

  const INTENT_CLASSIFICATION_SCHEMA = 'simulatte.intentClassification.v1';
  const INTENT_MODEL_ID = 'simulatte-local-tfidf-prototype-embedder.v1';
  const LAYER_PROFILES = Object.freeze([
    ['math', 'scalar vector graph network queue threshold delay constraint source sink ledger'],
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
    if (!prompt || /\b(blank|empty|scratch)\b/i.test(prompt)) {
      return blankClassification(prompt);
    }
    const intentVec = provider.encode(prompt);
    const ranked = PHYSICAL_PRIMITIVES
      .filter((primitive) => primitive.id !== 'energy-ledger')
      .map((primitive) => scorePrimitive(prompt, intentVec, primitive))
      .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
    const selected = selectedPriors(ranked, max);
    const layerScores = layerScoreDistribution(intentVec, selected);
    const domainScores = aggregateDomainScores(selected);
    const top = selected[0] ? selected[0].score : 0;
    const next = selected[1] ? selected[1].score : 0;
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
      priors: selected,
      layerScores,
      domainScores,
      layerFocus: topLayer(selected, layerScores),
      confidence: Number(clamp(top - next * 0.35, 0, 1).toFixed(4)),
    };
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
    return ranked
      .filter((prior) => prior.score >= threshold)
      .slice(0, max);
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
    const priorsById = new Map((classification.priors || []).map((prior) => [prior.primitiveId, prior]));
    const ranked = (classification.priors || [])
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
