(function attachSimulatteDopplerIntent(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteDopplerIntent = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createDopplerIntentApi() {
  const DOPPLER_INTENT_SCHEMA = 'simulatte.dopplerIntentHints.v1';
  const DEFAULT_MODULE_URL = './vendor/doppler/src/index-browser.js';
  const DEFAULT_KERNEL_BASE_PATH = './vendor/doppler/src/gpu/kernels';

  function normalizeDopplerIntent(input, primitives = []) {
    if (!input || typeof input !== 'object') return null;
    if (input.unavailable) {
      return {
        schema: DOPPLER_INTENT_SCHEMA,
        source: input.source || 'doppler-unavailable',
        unavailable: true,
        reason: String(input.reason || 'Doppler intent model unavailable'),
        model: normalizeModel(input.model),
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
      source: input.source || 'doppler-residual-intent',
      model: normalizeModel(input.model),
      primitives: primitiveHints.sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId)),
      regimes,
      operators,
      confidence: clamp(Number(input.confidence || primitiveHints[0]?.score || 0.72), 0, 1),
    };
  }

  async function analyzePrompt(prompt, primitives = [], options = {}) {
    if (options.dopplerIntent || options.dopplerHints) {
      return normalizeDopplerIntent(options.dopplerIntent || options.dopplerHints, primitives);
    }
    const analyzer = options.dopplerAnalyzer;
    if (typeof analyzer === 'function') {
      const result = await analyzer(String(prompt || ''), primitives, options);
      return normalizeDopplerIntent(result, primitives);
    }
    const enabled = options.dopplerEnabled === true || urlFlag('doppler');
    if (!enabled) return null;
    const moduleApi = options.dopplerModule || globalDopplerModule() || await importDopplerModule(options);
    if (!moduleApi) return unavailable('Doppler module is not available', options);
    const raw = await runDopplerText(moduleApi, strictPrompt(prompt, primitives, options), {
      model: normalizeModelOption(options.dopplerModel || urlValue('dopplerModel')),
      responseFormat: 'json',
      temperature: 0,
      maxTokens: 420,
    });
    return normalizeDopplerIntent(parseJsonPayload(raw), primitives);
  }

  function normalizeModel(model) {
    if (model && typeof model === 'object') {
      return {
        id: model.id || 'doppler-local-residual-intent',
        family: model.family || 'local-text-graph-delta',
        backend: model.backend || model.runtime || '',
      };
    }
    return {
      id: 'doppler-local-residual-intent',
      family: 'local-text-graph-delta',
      backend: '',
    };
  }

  function strictPrompt(prompt, primitives, options) {
    const candidates = (primitives || []).slice(0, Number(options.maxCandidates || 80)).map((primitive) => ({
      id: primitive.id,
      type: primitive.type,
      domains: primitive.domains || [],
      text: primitive.text || primitive.role || '',
    }));
    return JSON.stringify({
      task: 'select physical primitive ids, visual regimes, and operators for a runnable Simulatte graph',
      schema: DOPPLER_INTENT_SCHEMA,
      prompt: String(prompt || ''),
      allowedPrimitiveIds: candidates.map((candidate) => candidate.id),
      candidates,
      output: {
        schema: DOPPLER_INTENT_SCHEMA,
        primitives: [{ primitiveId: 'id from allowedPrimitiveIds', score: 0.0, reason: 'short evidence' }],
        regimes: ['thermal|optical|fluid|magnetic|network|biological|granular|soft'],
        operators: ['combustion|refraction|advection|magnetism|queueService|erosion'],
      },
    });
  }

  async function importDopplerModule(options = {}) {
    const moduleUrl = options.dopplerModuleUrl || urlValue('dopplerModule') || DEFAULT_MODULE_URL;
    try {
      ensureDopplerKernelBasePath(options.dopplerKernelBasePath || urlValue('dopplerKernelBase'));
      const mod = await import(moduleUrl);
      return mod.doppler || mod.default || mod;
    } catch (_err) {
      return null;
    }
  }

  function ensureDopplerKernelBasePath(rawKernelBasePath = '') {
    if (typeof globalThis === 'undefined') return;
    const existing = globalThis.__DOPPLER_KERNEL_BASE_PATH__;
    if (typeof existing === 'string' && existing.trim()) return;
    const rawPath = rawKernelBasePath || DEFAULT_KERNEL_BASE_PATH;
    const resolvedPath = typeof location === 'undefined'
      ? rawPath
      : new URL(rawPath, location.href).toString();
    globalThis.__DOPPLER_KERNEL_BASE_PATH__ = resolvedPath.replace(/\/+$/, '');
  }

  async function runDopplerText(doppler, prompt, options = {}) {
    if (typeof doppler.chatText === 'function') {
      const response = await doppler.chatText([
        { role: 'system', content: 'You are a strict JSON physical simulation intent parser.' },
        { role: 'user', content: prompt },
      ], options);
      return typeof response === 'string' ? response : String(response && response.content || '');
    }
    if (typeof doppler.text === 'function') return doppler.text(prompt, options);
    if (typeof doppler.generate === 'function') return doppler.generate(prompt, options);
    throw new Error('Doppler module did not expose text, chatText, or generate');
  }

  function normalizeModelOption(model) {
    if (!model) return null;
    if (typeof model === 'object') return model;
    const value = String(model).trim();
    if (!value) return null;
    if (/^(file:|\/)/.test(value)) return { url: value };
    return { id: value };
  }

  function unavailable(reason, options = {}) {
    return normalizeDopplerIntent({
      unavailable: true,
      reason,
      model: normalizeModelOption(options.dopplerModel || urlValue('dopplerModel')),
    });
  }

  function parseJsonPayload(raw) {
    if (raw && typeof raw === 'object') return raw;
    const text = String(raw || '').trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_err) {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch (_inner) {
        return null;
      }
    }
  }

  function globalDopplerModule() {
    if (typeof globalThis === 'undefined') return null;
    return globalThis.Doppler || globalThis.DopplerRuntime || null;
  }

  function urlFlag(name) {
    try {
      return new URLSearchParams(globalThis.location && globalThis.location.search || '').get(name) === '1';
    } catch (_err) {
      return false;
    }
  }

  function urlValue(name) {
    try {
      return new URLSearchParams(globalThis.location && globalThis.location.search || '').get(name) || '';
    } catch (_err) {
      return '';
    }
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
