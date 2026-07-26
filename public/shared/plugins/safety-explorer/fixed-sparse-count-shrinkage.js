(function attachFixedSparseCountShrinkage(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteFixedSparseCountShrinkage = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createFixedSparseCountShrinkage() {
  const METHOD_ID = 'fixed-sparse-count-shrinkage-v1';
  const DEFAULT_PARAMETERS = Object.freeze({
    k: 4,
    weights: Object.freeze({ crash: 1, injury: 3, fatality: 10 }),
  });

  function parameters(input = {}) {
    return Object.freeze({
      k: nonnegative(input.k, DEFAULT_PARAMETERS.k),
      weights: Object.freeze({
        crash: nonnegative(input.weights?.crash, DEFAULT_PARAMETERS.weights.crash),
        injury: nonnegative(input.weights?.injury, DEFAULT_PARAMETERS.weights.injury),
        fatality: nonnegative(input.weights?.fatality, DEFAULT_PARAMETERS.weights.fatality),
      }),
    });
  }

  function severityTotal(row, weights = DEFAULT_PARAMETERS.weights) {
    if (!row) return 0;
    return (row.crashCount || 0) * weights.crash
      + (row.injuryCount || 0) * weights.injury
      + (row.fatalityCount || 0) * weights.fatality;
  }

  function corpusMean(rows, weights = DEFAULT_PARAMETERS.weights) {
    if (!Array.isArray(rows) || !rows.length) return 0;
    return rows.reduce((sum, row) => sum + severityTotal(row, weights), 0) / rows.length;
  }

  function estimate(row, options = {}) {
    const selected = parameters(options);
    const mean = Number.isFinite(options.corpusMean)
      ? Number(options.corpusMean)
      : 0;
    const count = row?.crashCount || 0;
    if (!row || count === 0) return null;
    const raw = severityTotal(row, selected.weights);
    return ((count * raw) + selected.k * mean) / (count + selected.k);
  }

  function evidenceCoverage(row, k = DEFAULT_PARAMETERS.k) {
    const count = row?.crashCount || 0;
    return count > 0 ? count / (count + nonnegative(k, DEFAULT_PARAMETERS.k)) : 0;
  }

  function observation(row, index) {
    if (!row || (row.crashCount || 0) === 0) {
      return freeze({
        observationStatus: row ? 'zero_observation' : 'no_joined_observation',
        exposureStatus: 'unknown',
        matchStatus: row ? 'joined_zero_observation' : 'no_history_row',
        crashCount: row?.crashCount || 0,
        injuryCount: row?.injuryCount || 0,
        fatalityCount: row?.fatalityCount || 0,
        collisionIds: (row?.collisionIds || []).slice(),
        maximumJoinDistanceM: row?.maximumJoinDistanceM ?? null,
        periodStart: index.source.periodStart,
        periodEndExclusive: index.source.periodEndExclusive,
      });
    }
    return freeze({
      observationStatus: 'reported_history',
      exposureStatus: 'unknown',
      matchStatus: 'joined_to_physical_segment',
      crashCount: row.crashCount,
      injuryCount: row.injuryCount,
      fatalityCount: row.fatalityCount,
      pedestrianInjuryCount: row.pedestrianInjuryCount || 0,
      cyclistInjuryCount: row.cyclistInjuryCount || 0,
      motoristInjuryCount: row.motoristInjuryCount || 0,
      collisionIds: (row.collisionIds || []).slice(),
      maximumJoinDistanceM: row.maximumJoinDistanceM ?? null,
      periodStart: index.source.periodStart,
      periodEndExclusive: index.source.periodEndExclusive,
    });
  }

  function sensitivity(row, rows, options = {}) {
    const selected = parameters(options);
    const mean = corpusMean(rows, selected.weights);
    const kValues = [...new Set([0, 2, selected.k, 8, 16])].sort((a, b) => a - b);
    return freeze({
      method: METHOD_ID,
      k: kValues.map((k) => ({
        k,
        value: estimate(row, { ...selected, k, corpusMean: mean }),
      })),
      severityWeights: [
        { id: 'configured', weights: selected.weights, value: estimate(row, { ...selected, corpusMean: mean }) },
        { id: 'source-index', weights: { crash: 1, injury: 4, fatality: 25 }, value: estimate(row, { k: selected.k, weights: { crash: 1, injury: 4, fatality: 25 }, corpusMean: corpusMean(rows, { crash: 1, injury: 4, fatality: 25 }) }) },
      ],
      joinRadius: [15, 25, 35].map((radiusM) => ({
        radiusM,
        status: !row
          ? 'unknown'
          : row.maximumJoinDistanceM <= radiusM
            ? 'all_current_matches_within_radius'
            : 'rejoin_required_for_exact_result',
      })),
    });
  }

  function methodReceipt(rows, options = {}) {
    const selected = parameters(options);
    const mean = corpusMean(rows, selected.weights);
    return freeze({
      schema: 'simulatte.fixedSparseCountShrinkageReceipt.v1',
      id: METHOD_ID,
      name: 'fixed sparse-count shrinkage',
      formula: '(n * (crashWeight*crashes + injuryWeight*injuries + fatalityWeight*fatalities) + K * corpusMean) / (n + K)',
      countDefinition: 'n = reported crash count on the joined physical segment',
      k: selected.k,
      corpusMean: Number(mean.toFixed(8)),
      severityWeights: selected.weights,
      exposureDenominator: null,
      calibrationStatus: 'fixed_not_calibrated',
      claimBoundary: 'This stabilizes sparse reported counts. It is not empirical Bayes, exposure-normalized risk, a forecast, or evidence that zero observations mean safety.',
    });
  }

  function nonnegative(value, fallback) {
    return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }

  return Object.freeze({
    DEFAULT_PARAMETERS,
    METHOD_ID,
    corpusMean,
    estimate,
    evidenceCoverage,
    methodReceipt,
    observation,
    parameters,
    sensitivity,
    severityTotal,
  });
});
