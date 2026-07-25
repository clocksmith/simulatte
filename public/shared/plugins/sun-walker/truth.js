(function attachSunWalkerTruth(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSunWalkerTruth = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSunWalkerTruth() {
  const ORIGINS = Object.freeze(['observed', 'derived', 'modeled', 'simulated', 'scenario']);
  const TEMPORAL_STATUSES = Object.freeze(['historical', 'snapshot', 'forecast', 'live']);
  const UNCERTAINTY_KINDS = Object.freeze(['interval', 'distribution', 'confidence', 'missing']);

  function truth({ origin, temporalStatus, uncertainty }) {
    if (!ORIGINS.includes(origin)) throw truthError('truth_origin_invalid', origin);
    if (!TEMPORAL_STATUSES.includes(temporalStatus)) throw truthError('truth_temporal_status_invalid', temporalStatus);
    if (!uncertainty || !UNCERTAINTY_KINDS.includes(uncertainty.kind) || !Object.hasOwn(uncertainty, 'value')) {
      throw truthError('truth_uncertainty_invalid', uncertainty?.kind || 'missing');
    }
    return deepFreeze({ origin, temporalStatus, uncertainty: structuredClone(uncertainty) });
  }

  function evidenceRef({ id, kind, truth: classification, sourceRowIds = [], datasetHash = null, transformationIds = [] }) {
    if (!id || !kind || !classification) throw truthError('evidence_reference_invalid', id || 'missing');
    return deepFreeze({
      schema: 'simulatte.evidenceReference.v4',
      id,
      kind,
      truth: classification,
      sourceRowIds: [...new Set(sourceRowIds)].sort(),
      datasetHash,
      transformationIds: [...new Set(transformationIds)].sort(),
    });
  }

  function stableId(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function deepFreeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.values(value).forEach((row) => deepFreeze(row, seen));
    return Object.freeze(value);
  }

  function truthError(code, received) {
    const error = new Error(`${code}: received ${received}`);
    error.name = 'SunWalkerTruthError';
    error.code = code;
    return error;
  }

  return Object.freeze({ deepFreeze, evidenceRef, stableId, truth });
});
