(function attachSimulatteIntentWorker(root) {
  const SCRIPT_ORDER = Object.freeze([
    '../../pipeline/phase-06-simulation/simulatte-physics-catalog.js',
    '../../pipeline/phase-03-retrieval/simulatte-semantic-rag.js',
    '../../pipeline/phase-01-runtime/simulatte-doppler-intent.js',
    '../../pipeline/phase-02-language/simulatte-language-evidence.js',
    '../../pipeline/phase-03-retrieval/simulatte-intent-embedder.js',
  ]);

  let embedder = null;
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

  function createEmbedder(config = {}) {
    if (embedder) return embedder;
    if (loadError) throw loadError;
    if (typeof importScripts !== 'function') {
      loadError = new Error('Intent worker importScripts unavailable');
      throw loadError;
    }
    try {
      importScripts(...SCRIPT_ORDER);
      if (!root.SimulatteIntentEmbedder || typeof root.SimulatteIntentEmbedder.create !== 'function') {
        throw new Error('SimulatteIntentEmbedder unavailable in intent worker');
      }
      embedder = root.SimulatteIntentEmbedder.create({
        catalog: root.SimulattePhysicsCatalog,
        manifestUrl: config.manifestUrl || '../../data/simulatte-embedder/manifest.json',
        modelBaseUrl: config.modelBaseUrl || '',
        dopplerModuleUrl: config.dopplerModuleUrl || '../../vendor/doppler/src/index-browser.js',
        dopplerKernelBasePath: config.dopplerKernelBasePath || '../../vendor/doppler/src/gpu/kernels',
        runtimeConfig: config.runtimeConfig || null,
        spanLevelEmbedding: config.spanLevelEmbedding,
        traceEmbeddings: config.traceEmbeddings === true,
        onProgress: postProgress,
      });
      return embedder;
    } catch (error) {
      loadError = error;
      throw error;
    }
  }

  async function handleLoad(data = {}) {
    activeRequestId = data.id;
    try {
      const runtime = await createEmbedder(data.config || {}).loadModel();
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
