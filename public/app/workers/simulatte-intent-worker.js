(function attachSimulatteIntentWorker(root) {
  const SCRIPT_ORDER = Object.freeze([
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-dependencies.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-constants.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-templates.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-primitive-data.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-materials.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-graph-data.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-examples.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog-graph-helpers.js',
    '../../pipeline/phase-05-simulation/simulatte-physics-catalog.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag-dependencies.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag-constants.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag-helpers.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag-surface-cards.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag-grounding-cards.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag-retrieval.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag.js',
    '../../pipeline/phase-01-runtime/simulatte-doppler-intent.js',
    '../../pipeline/phase-02-language/simulatte-language-evidence.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-embedder-dependencies.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-embedder-constants.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-embedder-model-lock.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-embedder-model-cache.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-embedder-runtime-class.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-embedder-runtime-probes.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-embedder-span-retrieval.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-embedder-slot-retrieval.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-embedder-rerank-runtime.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-embedder-manifest-cache.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-embedder-rerank.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-embedder-vectors.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-embedder-facade-support.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-embedder.js',
  ]);
  const WORKER_SEARCH = root && root.location && root.location.search || '';

  let embedder = null;
  let embedderConfigKey = '';
  let loadPromise = null;
  let loadedRuntime = null;
  let loadError = null;
  let activeRequestId = 0;

  function errorMessage(error) {
    if (!error) return 'Intent worker failed';
    return error && error.message ? error.message : String(error);
  }

  function post(type, id, payload = {}) {
    root.postMessage({
      type,
      id,
      ...payload,
    });
  }

  function postProgress(event) {
    if (!activeRequestId) return;
    post('simulatte:intent-worker:progress', activeRequestId, { event });
  }

  function stableConfigKey(config = {}) {
    return JSON.stringify(stableConfigValue(config || {}));
  }

  function stableConfigValue(value) {
    if (Array.isArray(value)) return value.map((entry) => stableConfigValue(entry));
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const next = value[key];
      if (next === undefined || typeof next === 'function') continue;
      out[key] = stableConfigValue(next);
    }
    return out;
  }

  function resetEmbedderForConfig(configKey) {
    embedder = null;
    embedderConfigKey = configKey;
    loadPromise = null;
    loadedRuntime = null;
    loadError = null;
  }

  function createEmbedder(config = {}) {
    const configKey = stableConfigKey(config);
    if (embedderConfigKey && embedderConfigKey !== configKey) {
      resetEmbedderForConfig(configKey);
    }
    if (!embedderConfigKey) embedderConfigKey = configKey;
    if (embedder) return embedder;
    if (loadError) throw loadError;
    if (typeof importScripts !== 'function') {
      loadError = new Error('Intent worker importScripts unavailable');
      throw loadError;
    }
    try {
      importScripts(...versionedScriptOrder());
      if (!root.SimulatteIntentEmbedder || typeof root.SimulatteIntentEmbedder.create !== 'function') {
        throw new Error('SimulatteIntentEmbedder unavailable in intent worker');
      }
      embedder = root.SimulatteIntentEmbedder.create({
        catalog: root.SimulattePhysicsCatalog,
        manifestUrl: config.manifestUrl || '../../data/simulatte-embedder/manifest.json',
        spanLevelEmbedding: config.spanLevelEmbedding,
        traceEmbeddings: config.traceEmbeddings === true,
        onProgress: postProgress,
      });
      return embedder;
    } catch (error) {
      loadError = error;
      embedder = null;
      loadPromise = null;
      loadedRuntime = null;
      throw error;
    }
  }

  async function ensureModelLoaded(config = {}, options = {}) {
    const workerEmbedder = createEmbedder(config);
    if (loadedRuntime) {
      postProgress({
        source: 'simulatte-intent-worker',
        stage: 'runtime-reuse',
        percent: 96,
        message: 'Prompt runtime already loaded in intent worker',
        reuse: true,
        providerReady: true,
      });
      return loadedRuntime;
    }
    if (!loadPromise) {
      loadPromise = workerEmbedder.loadModel({
        ...(options || {}),
        onProgress: postProgress,
      }).then((runtime) => {
        loadedRuntime = runtime;
        return runtime;
      }).catch((error) => {
        loadPromise = null;
        loadedRuntime = null;
        throw error;
      });
    } else {
      postProgress({
        source: 'simulatte-intent-worker',
        stage: 'runtime-reuse',
        percent: 32,
        message: 'Prompt runtime load already in flight in intent worker',
        reuse: true,
        providerReady: false,
      });
    }
    return loadPromise;
  }

  function versionedScriptOrder() {
    if (!WORKER_SEARCH || WORKER_SEARCH === '?') return SCRIPT_ORDER;
    const suffix = WORKER_SEARCH.startsWith('?') ? WORKER_SEARCH : `?${WORKER_SEARCH}`;
    return SCRIPT_ORDER.map((script) => `${script}${suffix}`);
  }

  async function handleLoad(data = {}) {
    activeRequestId = data.id;
    try {
      const runtime = await ensureModelLoaded(data.config || {}, data.options || {});
      post('simulatte:intent-worker:result', data.id, {
        ok: true,
        result: {
          ready: true,
          promptRuntimeReceipt: runtime && runtime.promptRuntimeReceipt || null,
        },
      });
    } catch (error) {
      post('simulatte:intent-worker:result', data.id, { ok: false, error: errorMessage(error) });
    } finally {
      if (activeRequestId === data.id) activeRequestId = 0;
    }
  }

  async function handleRank(data = {}) {
    activeRequestId = data.id;
    try {
      const workerEmbedder = createEmbedder(data.config || {});
      await ensureModelLoaded(data.config || {}, data.options || {});
      const catalog = root.SimulattePhysicsCatalog || {};
      const result = await workerEmbedder.rankPrompt(data.prompt || '', catalog.PHYSICAL_PRIMITIVES || [], {
        ...(data.options || {}),
        onProgress: postProgress,
        onPreview: (preview) => {
          post('simulatte:intent-worker:preview', data.id, { preview });
        },
      });
      post('simulatte:intent-worker:result', data.id, { ok: true, result });
    } catch (error) {
      post('simulatte:intent-worker:result', data.id, { ok: false, error: errorMessage(error) });
    } finally {
      if (activeRequestId === data.id) activeRequestId = 0;
    }
  }

  root.addEventListener('message', (event) => {
    const data = event && event.data || {};
    if (data.type === 'simulatte:intent-worker:load') {
      handleLoad(data);
      return;
    }
    if (data.type === 'simulatte:intent-worker:rank') {
      handleRank(data);
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : self);
