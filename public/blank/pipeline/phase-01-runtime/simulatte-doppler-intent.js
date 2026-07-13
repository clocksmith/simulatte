(function attachSimulatteDopplerIntent(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteDopplerIntent = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createDopplerIntentApi() {
  const DOPPLER_INTENT_SCHEMA = 'simulatte.dopplerIntentHints.v1';
  const PINNED_RUNTIME_ONLY_REASON = 'numbered model runtime lock owns all Doppler model execution';

  function normalizeDopplerIntent(input, primitives = []) {
    if (!input || typeof input !== 'object') return null;
    if (input.unavailable) {
      return {
        schema: DOPPLER_INTENT_SCHEMA,
        source: input.source || 'provided-intent-hints',
        unavailable: true,
        reason: String(input.reason || 'Intent hints are unavailable'),
        primitives: [],
        regimes: [],
        operators: [],
        confidence: 0,
      };
    }
    const knownIds = new Set((primitives || []).map((primitive) => primitive && primitive.id).filter(Boolean));
    const rawHints = input.primitives || input.priors || input.hints || [];
    const primitiveHints = [];
    const seen = new Set();
    for (const hint of rawHints) {
      const primitiveId = String(hint && (hint.primitiveId || hint.id) || '').trim();
      if (!primitiveId || seen.has(primitiveId)) continue;
      if (knownIds.size && !knownIds.has(primitiveId)) continue;
      seen.add(primitiveId);
      primitiveHints.push({
        primitiveId,
        score: clamp(Number(hint.score ?? hint.confidence ?? 0.82), 0, 1),
        reason: String(hint.reason || hint.phrase || ''),
      });
    }
    const regimes = uniqueList(input.regimes || input.visualRegimes || []);
    const operators = uniqueList(input.operators || input.operatorIds || []);
    if (!primitiveHints.length && !regimes.length && !operators.length) return null;
    return {
      schema: DOPPLER_INTENT_SCHEMA,
      source: input.source || 'provided-intent-hints',
      primitives: primitiveHints.sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId)),
      regimes,
      operators,
      confidence: clamp(Number(input.confidence || primitiveHints[0]?.score || 0.72), 0, 1),
    };
  }

  async function analyzePrompt(_prompt, primitives = [], options = {}) {
    assertNoModelExecutionOptions(options);
    return normalizeDopplerIntent(options.dopplerIntent || options.dopplerHints, primitives);
  }

  function assertNoModelExecutionOptions(options = {}) {
    const forbidden = [
      'dopplerAnalyzer',
      'dopplerModel',
      'dopplerModule',
      'dopplerModuleUrl',
      'dopplerKernelBasePath',
    ];
    const configured = forbidden.filter((key) => hasConfiguredValue(options[key]));
    if (options.dopplerEnabled === true) configured.push('dopplerEnabled');
    if (configured.length) {
      throw new Error(`${PINNED_RUNTIME_ONLY_REASON}; unsupported options: ${configured.join(', ')}`);
    }
  }

  function hasConfiguredValue(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  }

  function uniqueList(values) {
    return Array.from(new Set((values || []).filter(Boolean).map((value) => String(value))));
  }

  return {
    DOPPLER_INTENT_SCHEMA,
    analyzePrompt,
    normalizeDopplerIntent,
  };
});
