(function attachSimulatteIntentEmbedder(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteIntentEmbedder = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createIntentEmbedderApi() {
  const DEFAULT_MANIFEST_URL = './models/simulatte-embedder/manifest.json';
  const DEFAULT_DOPPLER_MODULE_URL = './vendor/doppler/src/index-browser.js';
  const DEFAULT_DOPPLER_KERNEL_BASE_PATH = './vendor/doppler/src/gpu/kernels';
  const CACHE_WORKER_READY_WAIT_MS = 2400;
  const DEFAULT_MODEL_OPFS_ROOT = 'simulatte-model-cache';
  const TRACE_URL_FLAGS = Object.freeze([
    'embeddingTrace',
    'embeddingTiming',
    'intentTrace',
    'modelTrace',
  ]);

  function create(options = {}) {
    return new ModelBackedIntentEmbedder(options);
  }

  class ModelBackedIntentEmbedder {
    constructor(options = {}) {
      this.manifestUrl = options.manifestUrl || DEFAULT_MANIFEST_URL;
      this.catalog = options.catalog || null;
      this.modelBaseUrl = options.modelBaseUrl || urlValue('embeddingModelBase') || urlValue('dopplerModelBase') || '';
      this.dopplerModuleUrl = options.dopplerModuleUrl || urlValue('dopplerModule') || '';
      this.dopplerKernelBasePath = options.dopplerKernelBasePath || urlValue('dopplerKernelBase') || '';
      this.onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
      this.embedProvider = options.embedProvider || null;
      this.dopplerModelHandle = options.dopplerModelHandle || null;
      this.dopplerModule = options.dopplerModule || null;
      this.runtimeConfig = options.runtimeConfig || null;
      this.spanLevelEmbedding = options.spanLevelEmbedding;
      this.spanEmbeddingCache = options.spanEmbeddingCache || new Map();
      this.traceEnabled = traceEnabled(options);
      this.traceId = options.traceId || `intent-${Math.random().toString(36).slice(2, 9)}`;
      this.modelPromise = null;
      this.providerPromise = null;
      this.providerReady = false;
      this.providerRequestCount = 0;
      this.rankSerial = 0;
      this.gpuPromise = null;
    }

    async loadModel() {
      if (!this.modelPromise) {
        const loadStarted = nowMs();
        this.emitProgress('manifest', 3, 'Loading intent manifest', {
          timing: 'start',
          traceId: this.traceId,
          manifestUrl: this.manifestUrl,
          firstLoad: true,
        });
        this.modelPromise = this.loadManifest()
          .then(async (manifest) => {
            this.emitProgress('manifest', 6, 'Intent manifest ready', {
              timing: 'end',
              durationMs: elapsedMsSince(loadStarted),
              traceId: this.traceId,
              modelId: manifest.embedModel && manifest.embedModel.id || '',
              modelBaseUrl: manifest.embedModel && manifest.embedModel.defaultModelBaseUrl || '',
              sourceSizeBytes: manifest.embedModel && manifest.embedModel.source && manifest.embedModel.source.sizeBytes || 0,
              cachePrefetch: Boolean(manifest.cache && manifest.cache.prefetch === true),
            });
            const retrieval = manifest.retrieval || {};
            const indexUrl = retrieval.artifact;
            if (!indexUrl) throw new Error('intent manifest missing retrieval artifact');
            const cardRetrieval = retrieval.cards || {};
            const cardIndexUrl = cardRetrieval.artifact || '';
            const universeRetrieval = retrieval.universe || {};
            const universeManifestUrl = universeRetrieval.artifact || '';
            const indexesStarted = nowMs();
            this.emitProgress('indexes', 8, 'Loading primitive, surface, and universe indexes', {
              timing: 'start',
              traceId: this.traceId,
            });
            const fetchTelemetry = {
              progress: this.onProgress,
              traceEnabled: this.traceEnabled,
              traceId: this.traceId,
            };
            const [index, cardIndex, universe] = await Promise.all([
              fetchJson(resolveUrl(indexUrl, this.manifestUrl), 'primitive embedding index', {
                ...fetchTelemetry,
                stage: 'index-fetch',
                percent: 10,
                resourceKind: 'primitive-index',
              }),
              cardIndexUrl
                ? fetchJson(resolveUrl(cardIndexUrl, this.manifestUrl), 'surface card embedding index', {
                  ...fetchTelemetry,
                  stage: 'index-fetch',
                  percent: 12,
                  resourceKind: 'surface-card-index',
                })
                : Promise.resolve(null),
              universeManifestUrl
                ? loadUniverseIndexes(resolveUrl(universeManifestUrl, this.manifestUrl), fetchTelemetry)
                : Promise.resolve(null),
            ]);
            const runtime = normalizeModelBackedRuntime(manifest, index, cardIndex, universe);
            this.emitProgress('indexes', 16, 'Embedding indexes ready', {
              timing: 'end',
              durationMs: elapsedMsSince(indexesStarted),
              traceId: this.traceId,
              primitiveDocuments: runtime.index && runtime.index.documentCount || 0,
              surfaceCardDocuments: runtime.cardIndex && runtime.cardIndex.documentCount || 0,
              universeDocuments: runtime.universe && runtime.universe.documentCount || 0,
            });
            this.emitProgress('runtime-ready', 17, 'Embedding runtime metadata ready', {
              durationMs: elapsedMsSince(loadStarted),
              traceId: this.traceId,
              firstLoad: true,
              modelId: manifest.embedModel && manifest.embedModel.id || '',
            });
            return runtime;
          });
      } else {
        this.emitProgress('indexes-reuse', 16, 'Embedding manifest and indexes already loaded', {
          traceId: this.traceId,
          reuse: true,
        });
      }
      return this.modelPromise;
    }

    emitProgress(stage, percent, message, extra = {}) {
      emitRuntimeProgress(this.onProgress, this.traceEnabled, {
        source: 'simulatte-intent-embedder',
        stage,
        percent,
        message,
        traceId: this.traceId,
        ...extra,
      });
    }

    async loadManifest() {
      const manifest = await fetchJson(this.manifestUrl, 'intent manifest', {
        progress: this.onProgress,
        traceEnabled: this.traceEnabled,
        traceId: this.traceId,
        stage: 'manifest-fetch',
        percent: 4,
        resourceKind: 'intent-manifest',
      });
      if (!manifest || manifest.schema !== 'simulatte.modelBackedEmbedderManifest.v2') {
        throw new Error('intent manifest schema mismatch; expected simulatte.modelBackedEmbedderManifest.v2');
      }
      if (!manifest.retrieval || manifest.retrieval.kind !== 'precomputed-primitive-index') {
        throw new Error('intent manifest retrieval must be a precomputed primitive index');
      }
      if (manifest.retrieval.rerank !== 'mandatory') {
        throw new Error('intent manifest must require rerank');
      }
      if (!manifest.embedModel || !manifest.embedModel.id) {
        throw new Error('intent manifest embedModel.id is required');
      }
      const dimensions = Number(manifest.embedModel.dimensions);
      if (!Number.isFinite(dimensions) || dimensions <= 0) {
        throw new Error('intent manifest embedModel.dimensions must be a positive number');
      }
      if (Number(manifest.retrieval.dimensions) !== dimensions) {
        throw new Error('intent manifest retrieval dimensions must match embedModel.dimensions');
      }
      if (manifest.retrieval.cards) {
        if (manifest.retrieval.cards.kind !== 'precomputed-surface-card-index') {
          throw new Error('intent manifest card retrieval must be a precomputed surface card index');
        }
        if (Number(manifest.retrieval.cards.dimensions) !== dimensions) {
          throw new Error('intent manifest card retrieval dimensions must match embedModel.dimensions');
        }
      }
      if (manifest.retrieval.universe && Number(manifest.retrieval.universe.dimensions) !== dimensions) {
        throw new Error('intent manifest universe retrieval dimensions must match embedModel.dimensions');
      }
      if (!manifest.embedModel.defaultModelBaseUrl) {
        throw new Error('intent manifest embedModel.defaultModelBaseUrl is required');
      }
      if (!hashHex(manifest.embedModel.manifestHash)) {
        throw new Error('intent manifest embedModel.manifestHash is required');
      }
      if (!manifest.runtime || !manifest.runtime.runtimeConfig) {
        throw new Error('intent manifest runtime.runtimeConfig is required');
      }
      return manifest;
    }

    async rankPrompt(prompt, primitives, options = {}) {
      const promptText = String(prompt || '').trim();
      const progress = progressHandler(options, this.onProgress);
      const trace = this.traceEnabled || traceEnabled(options);
      const rankId = ++this.rankSerial;
      const rankStarted = nowMs();
      if (!promptText) {
        return blankResult(await this.loadModel());
      }
      emitRuntimeProgress(progress, trace, {
        source: 'simulatte-intent-embedder',
        stage: 'retrieval-start',
        percent: 2,
        message: 'Starting embedding retrieval',
        traceId: this.traceId,
        rankId,
        promptChars: promptText.length,
      });
      const runtime = await this.loadModel();
      const candidates = Array.isArray(primitives) && primitives.length
        ? primitives
        : this.catalog && this.catalog.PHYSICAL_PRIMITIVES || [];
      const max = Number.isFinite(options.max) ? options.max : 36;
      emitRuntimeProgress(progress, trace, {
        source: 'simulatte-intent-embedder',
        stage: 'model',
        percent: 18,
        message: `Preparing local ${modelLabel(runtime.manifest)}`,
        traceId: this.traceId,
        rankId,
        modelId: runtime.manifest && runtime.manifest.embedModel && runtime.manifest.embedModel.id || '',
        modelBaseUrl: runtime.manifest && runtime.manifest.embedModel && runtime.manifest.embedModel.defaultModelBaseUrl || '',
        candidateCount: candidates.length,
      });
      const providerStarted = nowMs();
      const providerWasReady = this.providerReady;
      const provider = await this.resolveEmbedProvider(runtime, {
        ...options,
        onProgress: progress,
        traceEmbeddings: trace,
      });
      emitRuntimeProgress(progress, trace, {
        source: 'simulatte-intent-embedder',
        stage: 'model-ready',
        percent: 80,
        message: 'Embedding provider ready',
        traceId: this.traceId,
        rankId,
        durationMs: elapsedMsSince(providerStarted),
        backend: provider.backend || 'doppler-embedding',
        reuse: providerWasReady,
      });
      const embedStarted = nowMs();
      emitRuntimeProgress(progress, trace, {
        source: 'simulatte-intent-embedder',
        stage: 'prompt-embed',
        percent: 82,
        message: 'Embedding prompt',
        timing: 'start',
        traceId: this.traceId,
        rankId,
        backend: provider.backend || 'doppler-embedding',
        promptChars: promptText.length,
      });
      const query = await provider.embed({ text: promptText, nowIso: options.nowIso || new Date().toISOString() });
      const queryVector = validateQueryEmbedding(query, runtime.index);
      emitRuntimeProgress(progress, trace, {
        source: 'simulatte-intent-embedder',
        stage: 'prompt-embed',
        percent: 84,
        message: 'Prompt embedding ready',
        timing: 'end',
        traceId: this.traceId,
        rankId,
        durationMs: elapsedMsSince(embedStarted),
        backend: provider.backend || 'doppler-embedding',
        embeddingDim: queryVector.length,
      });
      const candidateVectors = vectorsFor(runtime.index, candidates);
      const rankVectorStarted = nowMs();
      const gpuScores = await this.tryRankWebGpu(runtime.index.embeddingDim, queryVector, candidateVectors);
      const scores = gpuScores || rankCpu(queryVector, candidateVectors);
      const cardMatches = rankSurfaceCards(runtime.cardIndex, queryVector, options);
      const universeMatches = rankUniverseIndexes(runtime.universe, promptText, queryVector, options);
      emitRuntimeProgress(progress, trace, {
        source: 'simulatte-intent-embedder',
        stage: 'rank',
        percent: 86,
        message: 'Primitive, surface, and universe scores ranked',
        traceId: this.traceId,
        rankId,
        durationMs: elapsedMsSince(rankVectorStarted),
        rankBackend: gpuScores ? 'webgpu' : 'cpu',
        candidateCount: candidates.length,
        cardMatchCount: cardMatches.length,
        universeCandidateCount: universeMatches && universeMatches.candidates && universeMatches.candidates.length || 0,
      });
      const promptTermSet = new Set(fallbackFeatureTokens(promptText));
      const basePriors = candidates
        .map((primitive, index) => {
          const prior = primitivePriorFromScore(primitive, scores[index]);
          const symbolic = symbolicPromptMatch(promptText, promptTermSet, primitive);
          return {
            ...prior,
            symbolicBoost: symbolic.score,
            matchedTerms: symbolic.terms,
          };
        })
        .filter((prior) => prior.primitiveId !== 'energy-ledger')
        .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
      const languageEvidence = spanLanguageEvidence(promptText, options);
      const previewRag = createRag(promptText, candidates, basePriors, runtime.index, queryVector);
      const previewRerank = rerankPriors(basePriors, previewRag, null, runtime, universeMatches);
      const previewSpanRetrieval = emptySpanRetrieval([], spanConfigFor(runtime, options, this.spanLevelEmbedding), 'prompt-preview');
      const previewEvidenceRows = buildIntentEvidenceRows({
        basePriors,
        cardMatches,
        universeMatches,
        spanRetrieval: previewSpanRetrieval,
        semanticRag: previewRag,
        dopplerIntent: null,
      });
      emitIntentPreview(options, {
        model: modelSummary(runtime, query, provider),
        backend: provider.backend || 'doppler-embedding',
        rankBackend: gpuScores ? 'webgpu' : 'cpu',
        priors: previewRerank.priors.slice(0, max),
        cardMatches,
        universeMatches,
        spanRetrieval: previewSpanRetrieval,
        rerank: previewRerank.receipt,
        semanticRag: previewRag,
        dopplerIntent: null,
        evidenceRows: previewEvidenceRows,
        retrievalPhase: 'prompt-preview',
      });
      const spanRetrieval = await rankPromptSpans({
        provider,
        runtime,
        candidates,
        candidateVectors,
        languageEvidence,
        options,
        embedCache: this.spanEmbeddingCache,
        instanceConfig: this.spanLevelEmbedding,
        rankGpu: (vector) => this.tryRankWebGpu(runtime.index.embeddingDim, vector, candidateVectors),
        progress,
        traceEnabled: trace,
        traceId: this.traceId,
        rankId,
      });
      const fusedBasePriors = fuseSpanPrimitiveScores(basePriors, spanRetrieval);
      const semanticRag = createRag(promptText, candidates, fusedBasePriors, runtime.index, queryVector);
      const dopplerIntent = await analyzeDopplerIntent(promptText, candidates, options);
      const rerank = rerankPriors(fusedBasePriors, semanticRag, dopplerIntent, runtime, universeMatches);
      const evidenceRows = buildIntentEvidenceRows({
        basePriors: fusedBasePriors,
        cardMatches,
        universeMatches,
        spanRetrieval,
        semanticRag,
        dopplerIntent,
      });
      emitRuntimeProgress(progress, trace, {
        source: 'simulatte-intent-embedder',
        stage: 'classification',
        percent: 96,
        message: 'Intent graph ranked',
        traceId: this.traceId,
        rankId,
        durationMs: elapsedMsSince(rankStarted),
      });
      return {
        model: modelSummary(runtime, query, provider),
        backend: provider.backend || 'doppler-embedding',
        rankBackend: gpuScores ? 'webgpu' : 'cpu',
        priors: rerank.priors.slice(0, max),
        cardMatches,
        universeMatches,
        spanRetrieval,
        rerank: rerank.receipt,
        semanticRag,
        dopplerIntent,
        evidenceRows,
        retrievalPhase: 'span-refined',
      };
    }

    async resolveEmbedProvider(runtime, options = {}) {
      const progress = progressHandler(options, this.onProgress);
      const trace = this.traceEnabled || traceEnabled(options);
      if (options.embedProvider) {
        emitRuntimeProgress(progress, trace, {
          source: 'simulatte-intent-embedder',
          stage: 'model-ready',
          percent: 78,
          message: 'Using injected embedding provider',
          traceId: this.traceId,
          backend: 'injected-provider',
        });
        return normalizeEmbedProvider(options.embedProvider, runtime, 'injected-provider');
      }
      if (this.embedProvider) {
        emitRuntimeProgress(progress, trace, {
          source: 'simulatte-intent-embedder',
          stage: 'model-ready',
          percent: 78,
          message: 'Using configured embedding provider',
          traceId: this.traceId,
          backend: 'configured-provider',
        });
        return normalizeEmbedProvider(this.embedProvider, runtime, 'configured-provider');
      }
      const handle = options.dopplerModelHandle || this.dopplerModelHandle || globalModelHandle();
      if (handle) {
        emitRuntimeProgress(progress, trace, {
          source: 'simulatte-intent-embedder',
          stage: 'model-ready',
          percent: 78,
          message: 'Using injected Doppler model handle',
          traceId: this.traceId,
          backend: 'injected-doppler-model',
        });
        return providerFromModelHandle(handle, runtime, 'injected-doppler-model');
      }
      this.providerRequestCount += 1;
      if (!this.providerPromise) {
        this.providerReady = false;
        this.providerPromise = this.loadDopplerModel(runtime, options)
          .then((provider) => {
            this.providerReady = true;
            return provider;
          });
      } else {
        emitRuntimeProgress(progress, trace, {
          source: 'simulatte-intent-embedder',
          stage: 'model-reuse',
          percent: this.providerReady ? 78 : 32,
          message: this.providerReady
            ? 'Reusing loaded embedding model'
            : 'Reusing in-flight embedding model load',
          traceId: this.traceId,
          reuse: true,
          providerReady: this.providerReady,
          providerRequestCount: this.providerRequestCount,
          backend: 'doppler-browser-load',
        });
      }
      return this.providerPromise;
    }

    async loadDopplerModel(runtime, options = {}) {
      const progress = progressHandler(options, this.onProgress);
      const trace = this.traceEnabled || traceEnabled(options);
      const moduleUrl = options.dopplerModuleUrl
        || this.dopplerModuleUrl
        || runtime.manifest.runtime && runtime.manifest.runtime.moduleUrl
        || DEFAULT_DOPPLER_MODULE_URL;
      const moduleStarted = nowMs();
      emitRuntimeProgress(progress, trace, {
        source: 'simulatte-intent-embedder',
        stage: 'model-module',
        percent: 19,
        message: 'Loading Doppler browser runtime',
        timing: 'start',
        traceId: this.traceId,
        moduleUrl,
      });
      const api = await resolveDopplerApi({
        dopplerModule: options.dopplerModule || this.dopplerModule,
        moduleUrl,
        kernelBasePath: options.dopplerKernelBasePath || this.dopplerKernelBasePath,
      });
      emitRuntimeProgress(progress, trace, {
        source: 'simulatte-intent-embedder',
        stage: 'model-module',
        percent: 20,
        message: 'Doppler browser runtime ready',
        timing: 'end',
        traceId: this.traceId,
        durationMs: elapsedMsSince(moduleStarted),
        moduleUrl,
      });
      const load = api && (api.load || api.doppler && api.doppler.load);
      if (typeof load !== 'function') {
        throw new Error(
          `model-backed intent requires Doppler load(); no loader found at ${moduleUrl}`
        );
      }
      const modelBaseUrl = options.modelBaseUrl || this.modelBaseUrl || runtime.manifest.embedModel.defaultModelBaseUrl;
      if (!modelBaseUrl) throw new Error('model-backed intent requires embed model base URL');
      emitRuntimeProgress(progress, trace, {
        source: 'simulatte-intent-embedder',
        stage: 'model-load',
        percent: 21,
        message: 'Preparing Doppler embedding model',
        traceId: this.traceId,
        artifactMode: 'manifest-directory',
        modelId: runtime.manifest && runtime.manifest.embedModel && runtime.manifest.embedModel.id || '',
        modelBaseUrl,
        sourceSizeBytes: runtime.manifest && runtime.manifest.embedModel &&
          runtime.manifest.embedModel.source && runtime.manifest.embedModel.source.sizeBytes || 0,
        cachePrefetch: Boolean(runtime.manifest && runtime.manifest.cache && runtime.manifest.cache.prefetch === true),
      });
      await ensureModelArtifactCache(runtime.manifest, modelBaseUrl, progress, trace);
      const runtimeConfig = cloneJsonValue(
        options.runtimeConfig
        || this.runtimeConfig
        || runtime.manifest.runtime && runtime.manifest.runtime.runtimeConfig
      );
      if (!runtimeConfig) {
        throw new Error('model-backed intent manifest missing Doppler runtimeConfig');
      }
      const dopplerStarted = nowMs();
      emitRuntimeProgress(progress, trace, {
        source: 'simulatte-intent-embedder',
        stage: 'model-load',
        percent: 68,
        message: 'Doppler loading embedding model files',
        timing: 'start',
        traceId: this.traceId,
        artifactMode: 'manifest-directory',
        modelBaseUrl,
      });
      const handle = await load({ url: modelBaseUrl }, {
        runtimeConfig,
        onProgress: (event) => {
          emitRuntimeProgress(progress, trace, normalizeDopplerProgress(event, {
            traceId: this.traceId,
            modelBaseUrl,
            modelId: runtime.manifest && runtime.manifest.embedModel && runtime.manifest.embedModel.id || '',
            startedAtMs: dopplerStarted,
          }));
          if (typeof options.onModelProgress === 'function') options.onModelProgress(event);
        },
      });
      emitRuntimeProgress(progress, trace, {
        source: 'simulatte-intent-embedder',
        stage: 'model-ready',
        percent: 79,
        message: 'Doppler embedding model ready',
        timing: 'end',
        traceId: this.traceId,
        durationMs: elapsedMsSince(dopplerStarted),
        artifactMode: 'manifest-directory',
        modelBaseUrl,
        backend: 'doppler-browser-load',
      });
      return providerFromModelHandle(handle, runtime, 'doppler-browser-load', modelBaseUrl);
    }

    async gpuDevice() {
      if (typeof navigator === 'undefined' || !navigator.gpu) return null;
      if (!this.gpuPromise) {
        this.gpuPromise = navigator.gpu
          .requestAdapter({ powerPreference: 'high-performance' })
          .then((adapter) => adapter ? adapter.requestDevice() : null)
          .catch(() => null);
      }
      return this.gpuPromise;
    }

    async tryRankWebGpu(dimensions, queryVector, candidateVectors) {
      const device = await this.gpuDevice();
      if (!device || !candidateVectors.length) return null;
      try {
        return await rankWebGpu(device, dimensions, queryVector, candidateVectors);
      } catch (_err) {
        return null;
      }
    }
  }

  async function fetchJson(url, label, telemetry = {}) {
    const started = nowMs();
    const progress = telemetry.progress || null;
    const trace = Boolean(telemetry.traceEnabled);
    emitRuntimeProgress(progress, trace, {
      source: 'simulatte-intent-embedder',
      stage: telemetry.stage || 'resource-fetch',
      percent: telemetry.percent || 0,
      message: `Fetching ${label}`,
      timing: 'start',
      traceId: telemetry.traceId || '',
      resourceKind: telemetry.resourceKind || label,
      resourceUrl: String(url || ''),
      cacheMode: 'force-cache',
    });
    const response = await fetch(url, { cache: 'force-cache' });
    const durationMs = elapsedMsSince(started);
    if (!response.ok) {
      emitRuntimeProgress(progress, trace, {
        source: 'simulatte-intent-embedder',
        stage: telemetry.stage || 'resource-fetch',
        percent: telemetry.percent || 0,
        message: `${label} fetch failed`,
        timing: 'error',
        traceId: telemetry.traceId || '',
        durationMs,
        resourceKind: telemetry.resourceKind || label,
        resourceUrl: String(url || ''),
        status: response.status,
        cacheMode: 'force-cache',
      });
      throw new Error(`${label} fetch failed: ${response.status}`);
    }
    const contentLength = Number(response.headers && response.headers.get('Content-Length') || 0);
    const value = await response.json();
    emitRuntimeProgress(progress, trace, {
      source: 'simulatte-intent-embedder',
      stage: telemetry.stage || 'resource-fetch',
      percent: telemetry.percent || 0,
      message: `${label} fetched`,
      timing: 'end',
      traceId: telemetry.traceId || '',
      durationMs,
      resourceKind: telemetry.resourceKind || label,
      resourceUrl: String(url || ''),
      status: response.status,
      byteLength: Number.isFinite(contentLength) ? contentLength : 0,
      cacheMode: 'force-cache',
    });
    return value;
  }

  function progressHandler(options = {}, fallback = null) {
    return typeof options.onProgress === 'function' ? options.onProgress : fallback;
  }

  function emitProgress(callback, event) {
    if (typeof callback !== 'function') return;
    callback({
      percent: clampProgress(event && event.percent),
      ...event,
    });
  }

  function emitRuntimeProgress(callback, trace, event) {
    const next = {
      timestamp: new Date().toISOString(),
      ...event,
    };
    emitProgress(callback, next);
    logEmbeddingTrace(trace, next);
  }

  function logEmbeddingTrace(enabled, event) {
    if (!enabled || typeof console === 'undefined' || typeof console.info !== 'function') return;
    const payload = { ...(event || {}) };
    delete payload.rawEvent;
    console.info('[simulatte.embedding]', payload.stage || 'event', payload);
  }

  function nowMs() {
    if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  function elapsedMsSince(started) {
    const delta = nowMs() - Number(started || 0);
    return Number(Math.max(0, delta).toFixed(1));
  }

  function clampProgress(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(100, parsed));
  }

  function traceEnabled(options = {}) {
    if (options.traceEmbeddings === true || options.debugTimings === true || options.logTimings === true) {
      return true;
    }
    return TRACE_URL_FLAGS.some((name) => truthyValue(urlValue(name)));
  }

  function truthyValue(value) {
    return /^(1|true|on|yes|debug|trace)$/i.test(String(value || '').trim());
  }

  function normalizeDopplerProgress(event = {}, context = {}) {
    const raw = Number(event.percent);
    const percent = Number.isFinite(raw)
      ? Math.max(68, Math.min(94, 68 + raw * 0.26))
      : 70;
    return {
      source: 'doppler',
      stage: event.phase || event.stage || 'model-load',
      percent,
      message: event.message || 'Loading intent model runtime',
      traceId: context.traceId || '',
      elapsedMs: Number.isFinite(context.startedAtMs) ? elapsedMsSince(context.startedAtMs) : undefined,
      artifactMode: 'manifest-directory',
      modelId: context.modelId || '',
      modelBaseUrl: context.modelBaseUrl || '',
      rawEvent: event,
    };
  }

  async function ensureModelArtifactCache(manifest, modelBaseUrl, onProgress, trace = false) {
    const cacheConfig = manifest && manifest.cache || {};
    const baseUrl = String(modelBaseUrl || '').replace(/\/+$/, '');
    if (cacheConfig.prefetch !== true) {
      emitRuntimeProgress(onProgress, trace, {
        source: 'simulatte-model-cache',
        stage: 'cache-skip',
        percent: 21,
        message: 'Model cache prefetch disabled; Doppler will load model files',
        artifactMode: 'manifest-directory',
        modelId: manifest && manifest.embedModel && manifest.embedModel.id || '',
        modelBaseUrl: baseUrl,
        cachePrefetch: false,
      });
      return;
    }
    if (!baseUrl) throw new Error(`${modelLabel(manifest)} cache requires model base URL`);
    const cacheContext = await openModelCacheContext(manifest, cacheConfig);
    if (!cacheContext.opfs && !cacheContext.cache) {
      if (cacheConfig.requirePersistent === true) {
        throw new Error(`${modelLabel(manifest)} cache requires OPFS or CacheStorage support`);
      }
      emitRuntimeProgress(onProgress, trace, {
        source: 'simulatte-model-cache',
        stage: 'cache-skip',
        percent: 21,
        message: 'Model cache prefetch unavailable in this browser context',
        artifactMode: 'manifest-directory',
        modelId: manifest && manifest.embedModel && manifest.embedModel.id || '',
        modelBaseUrl: baseUrl,
        cachePrefetch: true,
        cacheSkipReason: 'persistent-cache-unavailable',
      });
      return;
    }
    const cacheStarted = nowMs();
    emitRuntimeProgress(onProgress, trace, {
      source: 'simulatte-model-cache',
      stage: 'cache',
      percent: 20,
      message: 'Preparing model cache',
      timing: 'start',
      artifactMode: 'manifest-directory',
      modelId: manifest && manifest.embedModel && manifest.embedModel.id || '',
      modelBaseUrl: baseUrl,
      cachePrefetch: true,
      cacheBackends: cacheContext.backends,
      cacheStrategy: cacheContext.strategy,
    });
    await ensureCacheWorker(cacheConfig, onProgress, trace);
    const persistence = await requestPersistentStorage();
    emitRuntimeProgress(onProgress, trace, {
      source: 'simulatte-model-cache',
      stage: 'cache-storage',
      percent: 21,
      message: persistence ? 'Persistent model storage requested' : 'Persistent model storage unavailable',
      persisted: persistence,
      cacheBackends: cacheContext.backends,
    });
    const modelManifestUrl = `${baseUrl}/manifest.json`;
    const modelManifestText = await cachedTextArtifact(
      cacheContext,
      { path: 'manifest.json', url: modelManifestUrl, kind: 'manifest', size: 0 },
      `${modelLabel(manifest)} model manifest`,
      onProgress,
      trace
    );
    const modelManifest = JSON.parse(modelManifestText);
    const files = modelArtifactFiles(modelManifest, baseUrl);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let completedBytes = 0;
    for (const file of files) {
      const cached = await cachedModelArtifact(cacheContext, file);
      if (cached) {
        completedBytes += Math.max(file.size, cached.size || 0);
        emitModelCacheProgress(onProgress, trace, file, completedBytes, totalBytes, true, cached.backend);
        continue;
      }
      completedBytes += await cacheModelFile(cacheContext, file, completedBytes, totalBytes, onProgress, trace);
    }
    emitRuntimeProgress(onProgress, trace, {
      source: 'simulatte-model-cache',
      stage: 'cache-ready',
      percent: 68,
      message: `${modelLabel(manifest)} cached`,
      totalBytes,
      timing: 'end',
      durationMs: elapsedMsSince(cacheStarted),
      fileCount: files.length,
      artifactMode: 'manifest-directory',
      cacheBackends: cacheContext.backends,
    });
  }

  async function ensureCacheWorker(cacheConfig, onProgress = null, trace = false) {
    if (typeof window === 'undefined' || !navigator.serviceWorker) {
      emitRuntimeProgress(onProgress, trace, {
        source: 'simulatte-model-cache',
        stage: 'cache-worker',
        percent: 20,
        message: 'Model cache worker registration unavailable in this context',
        cacheWorker: 'unavailable',
      });
      return false;
    }
    const workerPath = cacheConfig.worker || './simulatte-model-cache-sw.js';
    const workerUrl = new URL(workerPath, window.location.href).toString();
    await navigator.serviceWorker.register(workerUrl);
    await waitForCacheWorkerReady(cacheConfig);
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve) => {
      const finish = () => {
        navigator.serviceWorker.removeEventListener('controllerchange', finish);
        resolve();
      };
      navigator.serviceWorker.addEventListener('controllerchange', finish, { once: true });
      setTimeout(finish, 2000);
    });
    if (!navigator.serviceWorker.controller && cacheConfig.requirePersistent === true) {
      throw new Error('intent model cache worker is not controlling this page; reload and retry');
    }
    emitRuntimeProgress(onProgress, trace, {
      source: 'simulatte-model-cache',
      stage: 'cache-worker',
      percent: 20,
      message: 'Model cache worker ready',
      cacheWorker: navigator.serviceWorker.controller ? 'controlling' : 'registered',
    });
    return true;
  }

  async function waitForCacheWorkerReady(cacheConfig = {}) {
    const configured = Number(cacheConfig.readyWaitMs);
    const waitMs = Number.isFinite(configured) && configured > 0
      ? configured
      : CACHE_WORKER_READY_WAIT_MS;
    let timer = null;
    try {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('intent model cache worker did not become ready')), waitMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function requestPersistentStorage() {
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') return false;
    try {
      return await navigator.storage.persist();
    } catch (_err) {
      return false;
    }
  }

  function modelCacheName(manifest) {
    const namespace = manifest.cache && manifest.cache.namespace
      ? String(manifest.cache.namespace)
      : 'simulatte-intent-model';
    const hash = hashHex(manifest.embedModel && manifest.embedModel.manifestHash).slice(0, 16) || 'model';
    return `simulatte-embedding-model-${namespace}-${hash}`;
  }

  async function openModelCacheContext(manifest, cacheConfig = {}) {
    const stores = new Set(normalizeCacheStores(cacheConfig.storage));
    const strategy = String(cacheConfig.strategy || '').toLowerCase() || 'cache-storage';
    const wantsOpfs = stores.has('opfs') || strategy.includes('opfs');
    const wantsCache = stores.has('cachestorage') || stores.has('cache-storage') ||
      cacheConfig.cacheStorageFallback !== false;
    const cacheName = modelCacheName(manifest);
    const opfs = wantsOpfs ? await openOpfsCache(cacheConfig, cacheName) : null;
    const cache = wantsCache && typeof caches !== 'undefined'
      ? await caches.open(cacheName).catch(() => null)
      : null;
    return {
      cacheName,
      opfs,
      cache,
      strategy,
      backends: [
        opfs ? 'opfs' : '',
        cache ? 'cache-storage' : '',
      ].filter(Boolean),
    };
  }

  function normalizeCacheStores(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item || '').toLowerCase().replace(/\s+/g, ''));
  }

  async function openOpfsCache(cacheConfig, cacheName) {
    if (!opfsAvailable()) return null;
    try {
      const root = await navigator.storage.getDirectory();
      const cacheRoot = await root.getDirectoryHandle(
        safeCacheSegment(cacheConfig.opfsRoot || DEFAULT_MODEL_OPFS_ROOT),
        { create: true }
      );
      const modelRoot = await cacheRoot.getDirectoryHandle(safeCacheSegment(cacheName), { create: true });
      return { dir: modelRoot, backend: 'opfs' };
    } catch (_err) {
      return null;
    }
  }

  function opfsAvailable() {
    return typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.getDirectory === 'function';
  }

  async function cachedTextArtifact(cacheContext, file, label, onProgress, trace) {
    const opfsHit = await readOpfsCachedFile(cacheContext.opfs, file);
    if (opfsHit) {
      emitModelCacheProgress(onProgress, trace, file, opfsHit.size, Math.max(file.size, opfsHit.size), true, 'opfs');
      return opfsHit.file.text();
    }
    const cached = cacheContext.cache ? await cacheContext.cache.match(file.url) : null;
    if (cached) return cached.clone().text();
    const response = await fetch(file.url, { cache: 'reload', mode: 'cors' });
    if (!response.ok) throw new Error(`${label} fetch failed: ${response.status}`);
    const text = await response.text();
    await writeTextArtifact(cacheContext, file, text);
    return text;
  }

  async function cachedModelArtifact(cacheContext, file) {
    const opfsHit = await readOpfsCachedFile(cacheContext.opfs, file);
    if (opfsHit && cachedFileComplete(file, opfsHit.size)) {
      return { backend: 'opfs', size: opfsHit.size };
    }
    if (!cacheContext.cache) return null;
    const response = await cacheContext.cache.match(file.url);
    if (!response) return null;
    const size = Number(response.headers.get('Content-Length') || file.size || 0);
    if (!cachedFileComplete(file, size)) return null;
    return { backend: 'cache-storage', size };
  }

  function cachedFileComplete(file, size) {
    const expected = Number(file && file.size || 0);
    if (!expected) return Number(size || 0) > 0;
    return Number(size || 0) >= expected;
  }

  async function writeTextArtifact(cacheContext, file, text) {
    if (cacheContext.opfs) {
      await writeOpfsBytes(cacheContext.opfs, file, new TextEncoder().encode(text));
      return;
    }
    if (!cacheContext.cache) return;
    await cacheContext.cache.put(file.url, new Response(text, {
      status: 200,
      headers: {
        'Content-Type': contentTypeForPath(file.path),
        'Content-Length': String(text.length),
        'X-Simulatte-Model-Cache': 'full-file',
      },
    }));
  }

  function modelArtifactFiles(modelManifest, baseUrl) {
    const files = [{ path: 'manifest.json', size: 0, kind: 'manifest' }];
    for (const shard of modelManifest.shards || []) {
      if (!shard || !shard.filename) continue;
      files.push({ path: shard.filename, size: Number(shard.size || 0), kind: 'weights' });
    }
    const tokenizer = modelManifest.tokenizer || {};
    if (tokenizer.file) files.push({ path: tokenizer.file, size: 0, kind: 'tokenizer' });
    if (tokenizer.sentencepieceModel) {
      files.push({ path: tokenizer.sentencepieceModel, size: 0, kind: 'tokenizer' });
    }
    if (modelManifest.tensorsFile) files.push({ path: modelManifest.tensorsFile, size: 0, kind: 'metadata' });
    return files.map((file) => ({
      ...file,
      url: `${baseUrl}/${String(file.path).replace(/^\/+/, '')}`,
    }));
  }

  async function cacheModelFile(cacheContext, file, completedBefore, totalBytes, onProgress, trace = false) {
    const started = nowMs();
    const plannedBackend = cacheContext.opfs ? 'opfs' : cacheContext.cache ? 'cache-storage' : 'network';
    emitModelCacheProgress(onProgress, trace, file, completedBefore, totalBytes, false, plannedBackend);
    const response = await fetch(file.url, { cache: 'reload', mode: 'cors' });
    if (!response.ok) throw new Error(`intent model fetch failed for ${file.path}: ${response.status}`);
    const opfsWritable = cacheContext.opfs
      ? await openOpfsWritable(cacheContext.opfs, file).catch(() => null)
      : null;
    const backend = opfsWritable ? 'opfs' : cacheContext.cache ? 'cache-storage' : plannedBackend;
    const headers = new Headers(response.headers);
    const expectedBytes = Number(file.size || headers.get('Content-Length') || 0);
    let received = 0;
    let body;
    if (opfsWritable && response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
          received += chunk.byteLength;
          await opfsWritable.write(chunk);
          emitModelCacheProgress(onProgress, trace, file, completedBefore + received, totalBytes, false, backend);
        }
      } finally {
        await opfsWritable.close();
      }
      body = null;
    } else if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
        chunks.push(chunk);
        received += chunk.byteLength;
        emitModelCacheProgress(onProgress, trace, file, completedBefore + received, totalBytes, false, backend);
      }
      body = concatChunks(chunks, received);
    } else {
      body = new Uint8Array(await response.arrayBuffer());
      received = body.byteLength;
    }
    if (body && opfsWritable) {
      try {
        await opfsWritable.write(body);
      } finally {
        await opfsWritable.close();
      }
    } else if (body && cacheContext.opfs) {
      await writeOpfsBytes(cacheContext.opfs, file, body);
    } else if (body && cacheContext.cache) {
      headers.set('X-Simulatte-Model-Cache', 'full-file');
      if (!headers.has('Content-Type')) headers.set('Content-Type', contentTypeForPath(file.path));
      if (!headers.has('Content-Length')) headers.set('Content-Length', String(body.byteLength));
      await cacheContext.cache.put(file.url, new Response(body, {
        status: 200,
        headers,
      }));
    } else if (!opfsWritable) {
      throw new Error(`intent model cache unavailable for ${file.path}`);
    }
    const storedBytes = body ? body.byteLength : received;
    emitRuntimeProgress(onProgress, trace, {
      source: 'simulatte-model-cache',
      stage: 'cache-file-ready',
      percent: 22 + (totalBytes > 0 ? (completedBefore + storedBytes) / totalBytes : 1) * 44,
      message: `Cached ${file.path}`,
      file: file.path,
      fileKind: file.kind,
      completedBytes: completedBefore + storedBytes,
      totalBytes,
      durationMs: elapsedMsSince(started),
      cacheMode: backend,
    });
    return Math.max(expectedBytes, storedBytes);
  }

  function emitModelCacheProgress(onProgress, trace, file, completedBytes, totalBytes, cached, backend = '') {
    const fraction = totalBytes > 0 ? completedBytes / totalBytes : 1;
    emitRuntimeProgress(onProgress, trace, {
      source: 'simulatte-model-cache',
      stage: cached ? 'cache-hit' : 'cache-fill',
      percent: 22 + Math.min(1, fraction) * 44,
      message: cached ? `Cached ${file.path}` : `Caching ${file.path}`,
      file: file.path,
      fileKind: file.kind,
      completedBytes,
      totalBytes,
      cacheMode: backend || (cached ? 'cache-storage' : 'reload'),
    });
  }

  async function readOpfsCachedFile(opfs, file) {
    if (!opfs) return null;
    try {
      const handle = await opfs.dir.getFileHandle(opfsCacheFileName(file.url, file.path));
      const stored = await handle.getFile();
      return { file: stored, size: stored.size };
    } catch (_err) {
      return null;
    }
  }

  async function openOpfsWritable(opfs, file) {
    if (!opfs) return null;
    const handle = await opfs.dir.getFileHandle(opfsCacheFileName(file.url, file.path), { create: true });
    return handle.createWritable();
  }

  async function writeOpfsBytes(opfs, file, bytes) {
    const writable = await openOpfsWritable(opfs, file);
    try {
      await writable.write(bytes);
    } finally {
      await writable.close();
    }
  }

  function opfsCacheFileName(url, path) {
    const rawName = String(path || url || 'artifact').split('/').filter(Boolean).pop() || 'artifact';
    return `${hashString(url)}-${safeCacheSegment(rawName)}`;
  }

  function safeCacheSegment(value) {
    const text = String(value || 'cache').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-|-$/g, '');
    return text || 'cache';
  }

  function concatChunks(chunks, total) {
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }

  function contentTypeForPath(path) {
    if (/\.json$/i.test(path)) return 'application/json';
    if (/\.model$/i.test(path)) return 'application/octet-stream';
    return 'application/octet-stream';
  }

  async function loadUniverseIndexes(manifestUrl, telemetry = {}) {
    const manifest = await fetchJson(manifestUrl, 'universe manifest', {
      ...telemetry,
      stage: 'index-fetch',
      percent: 13,
      resourceKind: 'universe-manifest',
    });
    if (!manifest || manifest.schema !== 'simulatte.universeManifest.v1') {
      throw new Error('universe manifest schema mismatch; expected simulatte.universeManifest.v1');
    }
    const entries = Object.entries(manifest.indexes || {});
    const indexes = {};
    await Promise.all(entries.map(async ([name, config]) => {
      if (!config || !config.artifact) throw new Error(`universe index ${name} missing artifact`);
      indexes[name] = await fetchJson(resolveUrl(config.artifact, manifestUrl), `universe ${name} index`, {
        ...telemetry,
        stage: 'index-fetch',
        percent: 14,
        resourceKind: `universe-${name}-index`,
      });
    }));
    return { manifest, indexes };
  }

  function normalizeModelBackedRuntime(manifest, index, cardIndex = null, universe = null) {
    const normalizedIndex = normalizePrimitiveIndex(index, manifest);
    return {
      manifest,
      index: normalizedIndex,
      cardIndex: normalizeSurfaceCardIndex(cardIndex, manifest, normalizedIndex),
      universe: normalizeUniverseIndexes(universe, manifest),
    };
  }

  function normalizeUniverseIndexes(universe, manifest) {
    if (!universe) return null;
    if (!universe.manifest || universe.manifest.schema !== 'simulatte.universeManifest.v1') {
      throw new Error('universe index package missing manifest');
    }
    if (
      universe.manifest.embedModel &&
      universe.manifest.embedModel.id &&
      universe.manifest.embedModel.id !== manifest.embedModel.id
    ) {
      throw new Error(`universe embedModel.id mismatch (${universe.manifest.embedModel.id} !== ${manifest.embedModel.id})`);
    }
    const indexes = {};
    let documentCount = 0;
    for (const [name, index] of Object.entries(universe.indexes || {})) {
      if (!index || !Array.isArray(index.documents)) {
        throw new Error(`universe index ${name} missing documents`);
      }
      const rawDocs = index.documents;
      const embeddingDim = Number(index.embeddingDim || 0);
      const packedEmbeddings = index.embeddingsPackedBase64 && Number.isFinite(embeddingDim) && embeddingDim > 0
        ? decodePackedEmbeddings(
          index.embeddingsPackedBase64,
          rawDocs.length,
          embeddingDim,
          `universe ${name} embedding index`
        )
        : null;
      const featureDim = Number(index.featureDim || 0);
      const packedFeatures = index.featurePackedBase64 && Number.isFinite(featureDim) && featureDim > 0
        ? decodePackedEmbeddings(
          index.featurePackedBase64,
          rawDocs.length,
          featureDim,
          `universe ${name} feature index`
        )
        : null;
      indexes[name] = {
        schema: index.schema || '',
        id: index.id || `simulatte-universe-${name}`,
        embedModelId: index.embedModelId || '',
        embeddingDim: packedEmbeddings ? embeddingDim : 0,
        featureModelId: index.featureModelId || '',
        featureDim: packedFeatures ? featureDim : 0,
        documents: rawDocs.map((doc, order) => {
          const embeddingOffset = order * embeddingDim;
          const featureOffset = order * featureDim;
          return {
            ...doc,
            order,
            indexName: name,
            vector: packedEmbeddings
              ? normalizeEmbeddingVector(
                packedEmbeddings.slice(embeddingOffset, embeddingOffset + embeddingDim),
                `universe ${name} ${doc.id || order}`
              )
              : null,
            featureVector: packedFeatures
              ? normalizeEmbeddingVector(
                packedFeatures.slice(featureOffset, featureOffset + featureDim),
                `universe ${name} feature ${doc.id || order}`
              )
              : null,
          };
        }),
      };
      documentCount += indexes[name].documents.length;
    }
    return {
      schema: universe.manifest.schema,
      id: universe.manifest.id || 'simulatte-universe',
      indexes,
      documentCount,
    };
  }

  function normalizePrimitiveIndex(index, manifest) {
    if (!index || index.schema !== 'simulatte.primitiveEmbeddingIndex.v2') {
      throw new Error('primitive embedding index schema mismatch; expected v2');
    }
    const embeddingDim = Number(index.embeddingDim);
    if (!Number.isFinite(embeddingDim) || embeddingDim <= 0 || Number(manifest.retrieval.dimensions) !== embeddingDim) {
      throw new Error('primitive embedding index dimensions mismatch');
    }
    if (index.embedModelId !== manifest.embedModel.id) {
      throw new Error(`primitive embedding index model mismatch (${index.embedModelId} !== ${manifest.embedModel.id})`);
    }
    const modelHash = hashHex(index.embedModelHash);
    const manifestHash = hashHex(manifest.embedModel.manifestHash);
    if (!modelHash || !manifestHash || modelHash !== manifestHash) {
      throw new Error('primitive embedding index embedModelHash must match manifest embedModel.manifestHash');
    }
    if (!Array.isArray(index.documents) || !index.documents.length) {
      throw new Error('primitive embedding index has no documents');
    }
    const packed = decodePackedEmbeddings(index.embeddingsPackedBase64, index.documents.length, embeddingDim);
    const documents = index.documents.map((doc, order) => {
      const primitiveId = String(doc.primitiveId || '');
      if (!primitiveId) throw new Error(`primitive embedding document missing primitiveId at ${order}`);
      const offset = order * embeddingDim;
      return {
        ...doc,
        order,
        vector: normalizeEmbeddingVector(packed.slice(offset, offset + embeddingDim), `primitive ${primitiveId}`),
      };
    });
    return {
      schema: index.schema,
      id: index.id || 'simulatte-primitive-model-index-v1',
      indexHash: index.indexHash || null,
      embedModelId: index.embedModelId,
      embedModelHash: index.embedModelHash,
      embedModelManifestHash: index.embedModelManifestHash || null,
      embeddingDim,
      documentCount: documents.length,
      documents,
      byId: new Map(documents.map((doc) => [doc.primitiveId, doc])),
    };
  }

  function normalizeSurfaceCardIndex(index, manifest, primitiveIndex) {
    if (!index) return null;
    if (index.schema !== 'simulatte.surfaceCardEmbeddingIndex.v1') {
      throw new Error('surface card embedding index schema mismatch; expected v1');
    }
    const embeddingDim = Number(index.embeddingDim);
    const expectedDim = Number(manifest.retrieval.cards && manifest.retrieval.cards.dimensions || primitiveIndex.embeddingDim);
    if (!Number.isFinite(embeddingDim) || embeddingDim <= 0 || embeddingDim !== expectedDim) {
      throw new Error('surface card embedding index dimensions mismatch');
    }
    if (index.embedModelId !== manifest.embedModel.id || index.embedModelId !== primitiveIndex.embedModelId) {
      throw new Error(`surface card embedding index model mismatch (${index.embedModelId} !== ${manifest.embedModel.id})`);
    }
    const modelHash = hashHex(index.embedModelHash);
    const manifestHash = hashHex(manifest.embedModel.manifestHash);
    if (!modelHash || !manifestHash || modelHash !== manifestHash) {
      throw new Error('surface card embedding index embedModelHash must match manifest embedModel.manifestHash');
    }
    if (!Array.isArray(index.documents) || !index.documents.length) {
      throw new Error('surface card embedding index has no documents');
    }
    const packed = decodePackedEmbeddings(index.embeddingsPackedBase64, index.documents.length, embeddingDim);
    const documents = index.documents.map((doc, order) => {
      const cardId = String(doc.cardId || '');
      if (!cardId) throw new Error(`surface card embedding document missing cardId at ${order}`);
      const offset = order * embeddingDim;
      return {
        ...doc,
        order,
        vector: normalizeEmbeddingVector(packed.slice(offset, offset + embeddingDim), `surface card ${cardId}`),
      };
    });
    return {
      schema: index.schema,
      id: index.id || 'simulatte-surface-card-model-index-v1',
      indexHash: index.indexHash || null,
      embedModelId: index.embedModelId,
      embedModelHash: index.embedModelHash,
      embedModelManifestHash: index.embedModelManifestHash || null,
      embeddingDim,
      documentCount: documents.length,
      documents,
      byId: new Map(documents.map((doc) => [doc.cardId, doc])),
    };
  }

  function decodePackedEmbeddings(base64, count, dimensions, label = 'primitive embedding index') {
    if (typeof base64 !== 'string' || !base64) {
      throw new Error(`${label} missing packed vectors`);
    }
    const bytes = base64ToBytes(base64);
    const expectedBytes = count * dimensions * 4;
    if (bytes.byteLength !== expectedBytes) {
      throw new Error(`${label} byte length mismatch (${bytes.byteLength} !== ${expectedBytes})`);
    }
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const values = new Float32Array(buffer);
    for (let i = 0; i < values.length; i += 1) {
      if (!Number.isFinite(values[i])) {
        throw new Error(`${label} has non-finite value at ${i}`);
      }
    }
    return values;
  }

  function normalizeEmbeddingVector(vector, label) {
    let normSq = 0;
    for (let i = 0; i < vector.length; i += 1) {
      const value = vector[i];
      if (!Number.isFinite(value)) throw new Error(`${label} embedding has non-finite value at ${i}`);
      normSq += value * value;
    }
    const norm = Math.sqrt(normSq);
    if (!Number.isFinite(norm) || norm <= 0) throw new Error(`${label} embedding has zero norm`);
    const out = new Float32Array(vector.length);
    for (let i = 0; i < vector.length; i += 1) out[i] = vector[i] / norm;
    return out;
  }

  function base64ToBytes(value) {
    if (typeof atob === 'function') {
      const raw = atob(value);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
      return bytes;
    }
    if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(value, 'base64'));
    throw new Error('base64 decoder unavailable');
  }

  function vectorsFor(index, candidates) {
    return candidates.map((primitive) => {
      const doc = index.byId.get(primitive.id);
      if (!doc) throw new Error(`primitive embedding missing for ${primitive.id}`);
      return doc.vector;
    });
  }

  function buildIntentEvidenceRows(payload = {}) {
    const rows = [];
    const add = (row, source) => {
      if (!row) return;
      const id = row.id || row.cardId || row.primitiveId || row.canonicalId || row.label || row.phrase;
      if (!id) return;
      rows.push({
        id: String(id),
        label: row.label || row.role || row.phrase || row.cardId || row.primitiveId || row.canonicalId || String(id),
        source: row.source || source,
        indexName: row.indexName || source,
        semanticType: row.semanticType || row.type || '',
        score: Number(row.score || row.modelScore || row.semanticScore || row.confidence || 0),
        aliases: row.aliases || row.labels || [],
        materialId: row.materialId || row.material || '',
        materialIds: row.materialIds || (row.materialId || row.material ? [row.materialId || row.material] : []),
        operatorHints: row.operatorHints || row.operatorTypes || row.operators || [],
        primitiveHints: row.primitiveHints || (row.primitiveId ? [row.primitiveId] : []),
        conceptIds: row.conceptIds || row.concepts || [],
        candidateText: row.candidateText || row.text || '',
        spanId: row.spanId || '',
        spanKind: row.spanKind || '',
        spanText: row.spanText || '',
        retrievalKind: row.retrievalKind || '',
        evidence: row.evidence || [String(id)],
      });
    };
    for (const row of payload.basePriors || []) add(row, 'embedding-primitive-prior');
    for (const row of payload.cardMatches || []) add(row, 'embedding-surface-card');
    for (const row of payload.universeMatches && payload.universeMatches.candidates || []) add(row, row.indexName || 'universe-index');
    for (const [indexName, matches] of Object.entries(payload.universeMatches && payload.universeMatches.byIndex || {})) {
      for (const row of matches || []) add(row, indexName);
    }
    for (const row of payload.semanticRag && payload.semanticRag.openComponents || []) add(row, 'semantic-rag-component');
    for (const row of payload.semanticRag && payload.semanticRag.surfaceRetrieved || []) add(row, 'semantic-rag-surface');
    for (const row of payload.dopplerIntent && payload.dopplerIntent.primitives || []) add(row, 'doppler-intent');
    for (const row of spanEvidenceRows(payload.spanRetrieval)) add(row, row.source || 'span-embedding-retrieval');
    const seen = new Set();
    return rows
      .filter((row) => {
        const key = `${row.id}:${row.source}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, 260);
  }

  function spanConfigFor(runtime, options = {}, instanceConfig = undefined) {
    const manifestConfig = runtime && runtime.manifest && runtime.manifest.retrieval && runtime.manifest.retrieval.spanLevel || {};
    const optionConfig = normalizeSpanOption(options.spanLevelEmbedding);
    const instance = normalizeSpanOption(instanceConfig);
    const merged = {
      enabled: true,
      mode: 'progressive-refinement',
      fullPromptFirst: true,
      batchEmbedding: true,
      cache: true,
      dedupe: true,
      maxSpans: 18,
      minChars: 3,
      maxChars: 180,
      includeKinds: ['predicate-frame', 'clause', 'verb-phrase', 'noun-phrase', 'modifier', 'quantity'],
      perSpanPrimitiveMax: 8,
      perSpanCardMax: 6,
      perSpanUniverseMax: 10,
      perSpanCandidateMax: 22,
      primitiveScoreFloor: 0.18,
      surfaceScoreFloor: 0.22,
      universeScoreFloor: 0.14,
      primitiveRankBackend: 'cpu',
      ...manifestConfig,
      ...instance,
      ...optionConfig,
    };
    const urlMode = urlValue('spanLevelEmbedding') || urlValue('spanEmbedding');
    if (/^(0|false|off|disabled|none)$/i.test(urlMode)) merged.enabled = false;
    if (/^(1|true|on|enabled)$/i.test(urlMode)) merged.enabled = true;
    const urlMax = Number(urlValue('spanMax') || urlValue('maxSpanEmbeddings'));
    if (Number.isFinite(urlMax) && urlMax >= 0) merged.maxSpans = urlMax;
    const urlPrimitiveMax = Number(urlValue('spanPrimitiveMax'));
    if (Number.isFinite(urlPrimitiveMax) && urlPrimitiveMax >= 0) merged.perSpanPrimitiveMax = urlPrimitiveMax;
    const urlCardMax = Number(urlValue('spanCardMax'));
    if (Number.isFinite(urlCardMax) && urlCardMax >= 0) merged.perSpanCardMax = urlCardMax;
    const urlUniverseMax = Number(urlValue('spanUniverseMax'));
    if (Number.isFinite(urlUniverseMax) && urlUniverseMax >= 0) merged.perSpanUniverseMax = urlUniverseMax;
    const rankBackend = String(urlValue('spanPrimitiveRankBackend') || merged.primitiveRankBackend || 'cpu').toLowerCase();
    merged.primitiveRankBackend = ['cpu', 'webgpu', 'auto'].includes(rankBackend) ? rankBackend : 'cpu';
    merged.maxSpans = boundedInteger(merged.maxSpans, 0, 80, 18);
    merged.minChars = boundedInteger(merged.minChars, 1, 64, 3);
    merged.maxChars = boundedInteger(merged.maxChars, merged.minChars, 512, 180);
    merged.perSpanPrimitiveMax = boundedInteger(merged.perSpanPrimitiveMax, 0, 64, 8);
    merged.perSpanCardMax = boundedInteger(merged.perSpanCardMax, 0, 64, 6);
    merged.perSpanUniverseMax = boundedInteger(merged.perSpanUniverseMax, 0, 80, 10);
    merged.perSpanCandidateMax = boundedInteger(merged.perSpanCandidateMax, 0, 160, 22);
    merged.primitiveScoreFloor = boundedNumber(merged.primitiveScoreFloor, 0, 1, 0.18);
    merged.surfaceScoreFloor = boundedNumber(merged.surfaceScoreFloor, 0, 1, 0.22);
    merged.universeScoreFloor = boundedNumber(merged.universeScoreFloor, 0, 1, 0.14);
    merged.includeKinds = normalizeStringList(merged.includeKinds);
    merged.enabled = Boolean(merged.enabled);
    merged.batchEmbedding = merged.batchEmbedding !== false;
    merged.cache = merged.cache !== false;
    merged.dedupe = merged.dedupe !== false;
    return merged;
  }

  function normalizeSpanOption(value) {
    if (value === true) return { enabled: true };
    if (value === false) return { enabled: false };
    if (value && typeof value === 'object') return value;
    return {};
  }

  function spanReceiptConfig(config = {}) {
    return {
      enabled: Boolean(config.enabled),
      mode: config.mode || '',
      fullPromptFirst: config.fullPromptFirst !== false,
      batchEmbedding: config.batchEmbedding !== false,
      cache: config.cache !== false,
      dedupe: config.dedupe !== false,
      maxSpans: Number(config.maxSpans || 0),
      minChars: Number(config.minChars || 0),
      maxChars: Number(config.maxChars || 0),
      includeKinds: normalizeStringList(config.includeKinds),
      perSpanPrimitiveMax: Number(config.perSpanPrimitiveMax || 0),
      perSpanCardMax: Number(config.perSpanCardMax || 0),
      perSpanUniverseMax: Number(config.perSpanUniverseMax || 0),
      perSpanCandidateMax: Number(config.perSpanCandidateMax || 0),
      primitiveScoreFloor: Number(config.primitiveScoreFloor || 0),
      surfaceScoreFloor: Number(config.surfaceScoreFloor || 0),
      universeScoreFloor: Number(config.universeScoreFloor || 0),
      primitiveRankBackend: config.primitiveRankBackend || 'cpu',
    };
  }

  function normalizeStringList(value) {
    if (!Array.isArray(value)) return [];
    return uniqueStrings(value.map((item) => String(item || '').trim()).filter(Boolean));
  }

  function boundedInteger(value, min, max, fallback) {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function boundedNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  async function embedSpanQueries(payload = {}) {
    const provider = payload.provider;
    const spans = payload.spans || [];
    const config = payload.config || {};
    const cache = config.cache && payload.cache && typeof payload.cache.get === 'function' ? payload.cache : null;
    const nowIso = payload.options && payload.options.nowIso || new Date().toISOString();
    const progress = payload.progress || null;
    const trace = Boolean(payload.traceEnabled);
    const traceId = payload.traceId || '';
    const rankId = payload.rankId || 0;
    const started = nowMs();
    const cacheKeyFor = (span) => [
      payload.runtime && payload.runtime.index && payload.runtime.index.embedModelHash || '',
      payload.runtime && payload.runtime.index && payload.runtime.index.embeddingDim || '',
      normalizeSpanText(span.text),
    ].join(':');
    const pending = [];
    const rows = spans.map((span) => {
      const cacheKey = cacheKeyFor(span);
      const cached = cache && cache.get(cacheKey);
      if (cached) return { span, query: cached, cacheHit: true };
      const row = { span, query: null, cacheHit: false, cacheKey };
      pending.push(row);
      return row;
    });
    const cacheHitCount = rows.length - pending.length;
    emitRuntimeProgress(progress, trace, {
      source: 'simulatte-intent-embedder',
      stage: 'span-cache',
      percent: 89,
      message: `Span embedding cache ${cacheHitCount}/${rows.length}`,
      traceId,
      rankId,
      spanCount: rows.length,
      cacheHitCount,
      cacheMissCount: pending.length,
      cacheEnabled: Boolean(cache),
      durationMs: elapsedMsSince(started),
    });
    if (!pending.length) return rows;
    const requestRows = pending.map((row) => ({
      text: row.span.text,
      nowIso,
      spanId: row.span.id,
      spanKind: row.span.kind,
    }));
    const embedStarted = nowMs();
    emitRuntimeProgress(progress, trace, {
      source: 'simulatte-intent-embedder',
      stage: 'span-embed',
      percent: 90,
      message: config.batchEmbedding
        ? `Embedding ${pending.length} uncached spans as a batch`
        : `Embedding ${pending.length} uncached spans`,
      timing: 'start',
      traceId,
      rankId,
      spanCount: rows.length,
      cacheMissCount: pending.length,
      batchEmbedding: Boolean(config.batchEmbedding),
    });
    const batchResult = config.batchEmbedding ? await embedSpanBatch(provider, requestRows) : null;
    if (batchResult && batchResult.length === pending.length) {
      pending.forEach((row, index) => {
        row.query = batchResult[index];
        if (cache) cache.set(row.cacheKey, row.query);
      });
      emitRuntimeProgress(progress, trace, {
        source: 'simulatte-intent-embedder',
        stage: 'span-embed',
        percent: 92,
        message: 'Span batch embeddings ready',
        timing: 'end',
        traceId,
        rankId,
        spanCount: rows.length,
        embeddedSpanCount: pending.length,
        cacheHitCount,
        cacheMissCount: pending.length,
        batchEmbedding: true,
        durationMs: elapsedMsSince(embedStarted),
      });
      return rows;
    }
    for (const row of pending) {
      row.query = await provider.embed({
        text: row.span.text,
        nowIso,
        spanId: row.span.id,
        spanKind: row.span.kind,
      });
      if (cache) cache.set(row.cacheKey, row.query);
    }
    emitRuntimeProgress(progress, trace, {
      source: 'simulatte-intent-embedder',
      stage: 'span-embed',
      percent: 92,
      message: 'Span embeddings ready',
      timing: 'end',
      traceId,
      rankId,
      spanCount: rows.length,
      embeddedSpanCount: pending.length,
      cacheHitCount,
      cacheMissCount: pending.length,
      batchEmbedding: false,
      durationMs: elapsedMsSince(embedStarted),
    });
    return rows;
  }

  async function embedSpanBatch(provider, requestRows) {
    if (!provider || !requestRows.length) return null;
    if (typeof provider.embedBatch === 'function') {
      return provider.embedBatch(requestRows);
    }
    if (typeof provider.embedMany === 'function') {
      return provider.embedMany(requestRows);
    }
    return null;
  }

  async function safeSpanGpuRank(rankGpu, vector) {
    if (typeof rankGpu !== 'function') return null;
    try {
      return await rankGpu(vector);
    } catch (_err) {
      return null;
    }
  }

  function emitIntentPreview(options, result) {
    if (!options || typeof options.onPreview !== 'function') return;
    try {
      options.onPreview(result);
    } catch (_err) {}
  }

  async function rankPromptSpans(payload = {}) {
    const runtime = payload.runtime;
    const provider = payload.provider;
    const candidates = payload.candidates || [];
    const candidateVectors = payload.candidateVectors || [];
    const config = spanConfigFor(runtime, payload.options || {}, payload.instanceConfig);
    const spans = usefulRetrievalSpans(payload.languageEvidence, config);
    const bySpan = [];
    if (!config.enabled || !spans.length || !runtime || !provider || typeof provider.embed !== 'function') {
      return emptySpanRetrieval(spans, config, config.enabled ? 'empty' : 'disabled');
    }
    const started = nowMs();
    emitRuntimeProgress(payload.progress, payload.traceEnabled, {
      source: 'simulatte-intent-embedder',
      stage: 'span-retrieval',
      percent: 88,
      message: `Embedding ${spans.length} language spans`,
      spanCount: spans.length,
      traceId: payload.traceId || '',
      rankId: payload.rankId || 0,
    });
    const queries = await embedSpanQueries({
      provider,
      runtime,
      spans,
      config,
      options: payload.options || {},
      cache: payload.embedCache,
      progress: payload.progress,
      traceEnabled: payload.traceEnabled,
      traceId: payload.traceId || '',
      rankId: payload.rankId || 0,
    });
    const rankStarted = nowMs();
    for (const item of queries) {
      if (!item || !item.span || !item.query) continue;
      const span = item.span;
      const vector = validateQueryEmbedding(item.query, runtime.index);
      const gpuScores = config.primitiveRankBackend === 'webgpu' || config.primitiveRankBackend === 'auto'
        ? await safeSpanGpuRank(payload.rankGpu, vector)
        : null;
      const scores = gpuScores || rankCpu(vector, candidateVectors);
      const primitiveMatches = candidates
        .map((primitive, index) => spanPrimitiveMatch(span, primitive, scores[index]))
        .filter((row) => row.score >= config.primitiveScoreFloor)
        .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId))
        .slice(0, config.perSpanPrimitiveMax);
      const cardMatches = rankSurfaceCards(runtime.cardIndex, vector, {
        ...payload.options,
        maxCards: config.perSpanCardMax,
        minCardScore: config.surfaceScoreFloor,
      }).slice(0, config.perSpanCardMax).map((row) => annotateSpanCandidate(row, span, 'span-surface-card'));
      const universeMatches = rankUniverseIndexes(runtime.universe, span.text, vector, {
        ...payload.options,
        maxUniverse: config.perSpanUniverseMax,
        minUniverseScore: config.universeScoreFloor,
      });
      bySpan.push({
        spanId: span.id,
        spanKind: span.kind,
        spanText: span.text,
        vectorHash: embeddingVectorHash(vector),
        cacheHit: Boolean(item.cacheHit),
        primitiveRankBackend: gpuScores ? 'webgpu' : 'cpu',
        candidates: [
          ...primitiveMatches,
          ...cardMatches,
          ...spanUniverseCandidates(universeMatches, span, config.perSpanUniverseMax),
        ].slice(0, config.perSpanCandidateMax),
      });
    }
    emitRuntimeProgress(payload.progress, payload.traceEnabled, {
      source: 'simulatte-intent-embedder',
      stage: 'span-rank',
      percent: 94,
      message: 'Span retrieval ranked',
      traceId: payload.traceId || '',
      rankId: payload.rankId || 0,
      durationMs: elapsedMsSince(rankStarted),
      spanCount: spans.length,
      embeddedSpanCount: bySpan.length,
      cachedSpanCount: bySpan.filter((row) => row.cacheHit).length,
    });
    const evidenceRows = spanEvidenceRows({ bySpan });
    return {
      schema: 'simulatte.spanEmbeddingRetrieval.v1',
      model: runtime.manifest && runtime.manifest.embedModel && runtime.manifest.embedModel.id || '',
      config: spanReceiptConfig(config),
      spanCount: spans.length,
      embeddedSpanCount: bySpan.length,
      cachedSpanCount: bySpan.filter((row) => row.cacheHit).length,
      durationMs: elapsedMsSince(started),
      bySpan,
      evidenceRows,
      candidateCount: bySpan.reduce((sum, row) => sum + row.candidates.length, 0),
    };
  }

  function emptySpanRetrieval(spans, config = null, reason = 'empty') {
    return {
      schema: 'simulatte.spanEmbeddingRetrieval.v1',
      model: '',
      disabledReason: reason,
      config: spanReceiptConfig(config || {}),
      spanCount: spans.length,
      embeddedSpanCount: 0,
      cachedSpanCount: 0,
      bySpan: [],
      evidenceRows: [],
      candidateCount: 0,
    };
  }

  function usefulRetrievalSpans(languageEvidence, config = {}) {
    const max = Number.isFinite(config.maxSpans) ? config.maxSpans : 18;
    const includeKinds = new Set(config.includeKinds || []);
    const rows = [];
    const priority = {
      'predicate-frame': 1,
      clause: 2,
      'verb-phrase': 3,
      'noun-phrase': 4,
      modifier: 5,
      quantity: 6,
      prompt: 7,
    };
    for (const span of languageEvidence && languageEvidence.spans || []) {
      const text = String(span.text || '').trim();
      const kind = span.kind || 'span';
      if (includeKinds.size && !includeKinds.has(kind)) continue;
      if (!text || text.length < config.minChars || text.length > config.maxChars) continue;
      if (span.kind === 'prompt' && rows.some((row) => row.kind !== 'prompt')) continue;
      rows.push({
        id: span.id,
        kind,
        text,
        sourceId: span.sourceId || '',
        priority: priority[kind] || 8,
      });
    }
    const prepared = config.dedupe === false ? rows : dedupeSpanRows(rows);
    return prepared
      .sort((a, b) => a.priority - b.priority || b.text.length - a.text.length || a.id.localeCompare(b.id))
      .slice(0, max);
  }

  function dedupeSpanRows(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = normalizeSpanText(row.text);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function spanPrimitiveMatch(span, primitive, rawScore) {
    const lexical = symbolicPromptMatch(span.text, new Set(fallbackFeatureTokens(span.text)), primitive);
    const score = clamp01(Number(rawScore || 0) * 0.82 + lexical.score * 0.22);
    return {
      id: `span:${span.id}:${primitive.id}`,
      primitiveId: primitive.id,
      label: primitive.role || primitive.id,
      source: 'span-embedding-primitive-prior',
      indexName: 'primitive-span',
      retrievalKind: 'span-primitive',
      spanId: span.id,
      spanKind: span.kind,
      spanText: span.text,
      score: Number(score.toFixed(4)),
      modelScore: Number(clamp01(rawScore).toFixed(4)),
      lexicalScore: Number(lexical.score.toFixed(4)),
      matchedTerms: lexical.terms,
      primitiveHints: [primitive.id],
      operatorHints: primitive.operatorHints || primitive.operators || [],
      candidateText: primitive.text || primitive.role || primitive.id,
      evidence: [`span:${span.id}`, primitive.id],
    };
  }

  function annotateSpanCandidate(row, span, source) {
    const baseId = row.id || row.cardId || row.primitiveId || row.canonicalId || row.label;
    return {
      ...row,
      id: `span:${span.id}:${baseId || source}`,
      source,
      indexName: `${row.indexName || source}-span`,
      retrievalKind: source,
      spanId: span.id,
      spanKind: span.kind,
      spanText: span.text,
      evidence: uniqueStrings([...(row.evidence || []), `span:${span.id}`]),
    };
  }

  function spanUniverseCandidates(universeMatches, span, maxRows = 12) {
    return (universeMatches && universeMatches.candidates || [])
      .slice(0, Math.max(0, Number(maxRows) || 0))
      .map((row) => annotateSpanCandidate(row, span, `span-${row.indexName || 'universe-index'}`));
  }

  function fuseSpanPrimitiveScores(priors, spanRetrieval) {
    const best = new Map();
    for (const span of spanRetrieval && spanRetrieval.bySpan || []) {
      for (const candidate of span.candidates || []) {
        const primitiveIds = uniqueStrings([
          candidate.primitiveId,
          ...(candidate.primitiveHints || []),
        ]);
        for (const primitiveId of primitiveIds) {
          const current = best.get(primitiveId) || { score: 0, spans: [] };
          const score = clamp01(Number(candidate.score || 0));
          if (score > current.score) current.score = score;
          current.spans.push({
            spanId: span.spanId,
            spanKind: span.spanKind,
            spanText: span.spanText,
            candidateId: candidate.id || candidate.primitiveId || '',
            score: Number(score.toFixed(4)),
          });
          best.set(primitiveId, current);
        }
      }
    }
    return (priors || []).map((prior) => {
      const support = best.get(prior.primitiveId);
      if (!support) return prior;
      const spanScore = Number(support.score.toFixed(4));
      return {
        ...prior,
        spanScore,
        spanEvidence: support.spans.slice(0, 6),
        score: Number(clamp01(Number(prior.score || 0) + spanScore * 0.18).toFixed(4)),
      };
    }).sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
  }

  function spanEvidenceRows(spanRetrieval) {
    const rows = [];
    for (const span of spanRetrieval && spanRetrieval.bySpan || []) {
      for (const candidate of span.candidates || []) {
        rows.push({
          ...candidate,
          spanId: candidate.spanId || span.spanId,
          spanKind: candidate.spanKind || span.spanKind,
          spanText: candidate.spanText || span.spanText,
        });
      }
    }
    return rows;
  }

  function spanLanguageEvidence(promptText, options = {}) {
    if (options.languageEvidence) return options.languageEvidence;
    const api = resolveLanguageEvidenceApi();
    if (api && typeof api.extractLanguageEvidence === 'function') {
      return api.extractLanguageEvidence(promptText);
    }
    return {
      schema: 'simulatte.languageEvidence.v1',
      rawText: promptText,
      normalizedText: promptText,
      spans: [{ id: 'span.001', kind: 'prompt', text: promptText }],
      predicateFrames: [],
      summary: { spanCount: 1 },
    };
  }

  function resolveLanguageEvidenceApi() {
    if (typeof globalThis !== 'undefined' && globalThis.SimulatteLanguageEvidence) {
      return globalThis.SimulatteLanguageEvidence;
    }
    if (typeof module === 'object' && module.exports && typeof require === 'function') {
      try {
        return require('./simulatte-language-evidence.js');
      } catch (_err) {}
    }
    return null;
  }

  function embeddingVectorHash(vector) {
    let hash = 2166136261;
    for (let i = 0; i < vector.length; i += Math.max(1, Math.floor(vector.length / 64))) {
      hash ^= Math.floor((Number(vector[i]) + 1) * 1000000);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function normalizeSpanText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function rankSurfaceCards(cardIndex, queryVector, options = {}) {
    if (!cardIndex) return [];
    const maxCards = Number.isFinite(options.maxCards) ? options.maxCards : 48;
    const minCardScore = Number.isFinite(options.minCardScore) ? options.minCardScore : 0.22;
    return cardIndex.documents
      .map((doc) => {
        const score = clamp01(dot(queryVector, doc.vector));
        return {
          cardId: doc.cardId,
          type: doc.type || '',
          labels: Array.isArray(doc.labels) ? doc.labels.slice(0, 5) : [],
          score: Number(score.toFixed(4)),
          modelScore: Number(score.toFixed(4)),
          semanticScore: Number(score.toFixed(4)),
          source: `${modelSlug(cardIndex.embedModelId)}-surface-card-index`,
          indexId: cardIndex.id,
          textHash: doc.textHash || null,
        };
      })
      .filter((match) => match.score >= minCardScore)
      .sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId))
      .slice(0, maxCards);
  }

  function rankUniverseIndexes(universe, promptText, queryVector, options = {}) {
    const empty = {
      schema: 'simulatte.universeMatches.v1',
      manifestId: universe && universe.id || '',
      candidates: [],
      byIndex: {},
    };
    if (!universe) return empty;
    const maxUniverse = Number.isFinite(options.maxUniverse) ? options.maxUniverse : 36;
    const minUniverseScore = Number.isFinite(options.minUniverseScore) ? options.minUniverseScore : 0.16;
    const tokens = promptTokens(promptText);
    if (!tokens.length && !queryVector) return empty;
    const featureQueries = new Map();
    const byIndex = {};
    const candidates = [];
    for (const [indexName, index] of Object.entries(universe.indexes || {})) {
      const featureQuery = featureQueryForIndex(index, promptText, featureQueries);
      const rows = (index.documents || [])
        .map((doc) => universeCandidateForDocument(doc, indexName, tokens, {
          featureQuery,
          queryVector,
        }))
        .filter((row) => row.score >= minUniverseScore || row.lexicalScore > 0)
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
        .slice(0, Math.max(4, Math.floor(maxUniverse / 2)));
      byIndex[indexName] = rows;
      candidates.push(...rows);
    }
    candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return {
      ...empty,
      candidates: candidates.slice(0, maxUniverse),
      byIndex,
    };
  }

  function featureQueryForIndex(index, promptText, cache) {
    if (!index || !index.featureDim) return null;
    const dim = Number(index.featureDim);
    if (!Number.isFinite(dim) || dim <= 0) return null;
    if (!cache.has(dim)) cache.set(dim, buildUniverseFeatureVector(promptText, dim));
    return cache.get(dim);
  }

  function universeCandidateForDocument(doc, indexName, tokens, ranking = {}) {
    const labels = universeLabels(doc).map((value) => String(value).toLowerCase());
    const haystack = labels.join(' ');
    const tokenHits = [];
    for (const token of tokens) {
      if (token.length > 2 && haystack.includes(token)) tokenHits.push(token);
    }
    const phraseHit = labels.some((label) => label && tokens.join(' ').includes(label));
    const lexicalScore = clamp01(tokenHits.length / Math.max(2, tokens.length) + (phraseHit ? 0.42 : 0));
    const modelScore = ranking.queryVector && doc.vector && ranking.queryVector.length === doc.vector.length
      ? clamp01(dot(ranking.queryVector, doc.vector))
      : 0;
    const featureScore = ranking.featureQuery && doc.featureVector && ranking.featureQuery.length === doc.featureVector.length
      ? clamp01(dot(ranking.featureQuery, doc.featureVector))
      : 0;
    const semanticScore = Math.max(modelScore, featureScore);
    const score = clamp01(Math.max(lexicalScore, semanticScore * 0.88 + lexicalScore * 0.18));
    const operatorHints = uniqueStrings([
      ...(doc.operatorHints || []),
      ...(doc.operatorTypes || []),
      ...(doc.operators || []),
      doc.operatorType,
      doc.process,
      doc.edgeType,
    ]);
    const materialIds = uniqueStrings([
      ...(doc.materialIds || []),
      doc.materialId,
    ]);
    const conceptIds = uniqueStrings([
      ...(doc.conceptIds || []),
      ...(doc.concepts || []),
      doc.canonicalId,
    ]);
    return {
      id: doc.id || `${indexName}:${doc.label || 'candidate'}`,
      indexName,
      label: doc.label || doc.id || '',
      aliases: Array.isArray(doc.aliases) ? doc.aliases.slice(0, 6) : [],
      canonicalId: doc.canonicalId || doc.id || '',
      semanticType: doc.semanticType || indexName.replace(/s$/, ''),
      domains: doc.domains || [],
      materialId: doc.materialId || '',
      materialIds,
      operatorHints,
      operatorTypes: operatorHints,
      primitiveHints: uniqueStrings(doc.primitiveHints || []),
      conceptIds,
      shapeHints: uniqueStrings([...(doc.shapeHints || []), ...(doc.shapeIds || [])]),
      sceneHints: uniqueStrings(doc.sceneHints || []),
      process: doc.process || '',
      edgeType: doc.edgeType || '',
      shapeKind: doc.shapeKind || '',
      sceneKind: doc.sceneKind || '',
      candidateText: doc.candidateText || '',
      score: Number(score.toFixed(4)),
      lexicalScore: Number(lexicalScore.toFixed(4)),
      semanticScore: Number(semanticScore.toFixed(4)),
      modelScore: Number(modelScore.toFixed(4)),
      featureScore: Number(featureScore.toFixed(4)),
      evidence: ['universe-index', indexName],
      rankSignals: {
        featureScore: Number(featureScore.toFixed(4)),
        lexicalScore: Number(lexicalScore.toFixed(4)),
        modelScore: Number(modelScore.toFixed(4)),
        phraseHit,
        tokenHits,
      },
    };
  }

  function universeLabels(doc) {
    return [
      doc.label,
      doc.id,
      doc.canonicalId,
      doc.semanticType,
      doc.materialId,
      doc.operatorType,
      doc.process,
      doc.edgeType,
      doc.shapeKind,
      doc.sceneKind,
      doc.candidateText,
      ...(doc.aliases || []),
      ...(doc.domains || []),
      ...(doc.operatorHints || []),
      ...(doc.operatorTypes || []),
      ...(doc.operators || []),
      ...(doc.primitiveHints || []),
      ...(doc.conceptIds || []),
      ...(doc.concepts || []),
      ...(doc.materialIds || []),
      ...(doc.shapeHints || []),
      ...(doc.shapeIds || []),
      ...(doc.sceneHints || []),
    ].filter(Boolean);
  }

  function uniqueStrings(values) {
    return Array.from(new Set((values || []).filter(Boolean).map((value) => String(value))));
  }

  function promptTokens(promptText) {
    return String(promptText || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  }

  function buildUniverseFeatureVector(text, dim) {
    const ragApi = typeof globalThis !== 'undefined' ? globalThis.SimulatteSemanticRag : null;
    if (ragApi && typeof ragApi.buildSemanticFeatureVector === 'function') {
      return ragApi.buildSemanticFeatureVector(text, dim);
    }
    return fallbackSemanticFeatureVector(text, dim);
  }

  function fallbackSemanticFeatureVector(text, dim) {
    const out = new Float32Array(dim);
    const roots = fallbackFeatureTokens(text);
    if (!roots.length) return out;
    for (const token of roots) {
      addFeature(out, `w:${token}`, 1);
      addCharNgrams(out, token);
    }
    for (let i = 0; i < roots.length - 1; i += 1) {
      addFeature(out, `b:${roots[i]}_${roots[i + 1]}`, 1.35);
    }
    return normalizeEmbeddingVector(out, 'universe query feature');
  }

  function fallbackFeatureTokens(text) {
    const stops = new Set([
      'a', 'an', 'and', 'are', 'as', 'be', 'build', 'by', 'create', 'for', 'from',
      'in', 'into', 'is', 'make', 'of', 'on', 'or', 'simulate', 'simulation',
      'the', 'to', 'with', 'world', 'that', 'this', 'these', 'those',
    ]);
    const out = [];
    const lower = String(text || '').toLowerCase();
    let match;
    const tokenRe = /[a-z0-9][a-z0-9'-]*/g;
    while ((match = tokenRe.exec(lower))) {
      const token = normalizeFeatureToken(match[0]);
      if (token && !stops.has(token)) out.push(token);
    }
    return uniqueStrings(out);
  }

  function normalizeFeatureToken(token) {
    let out = String(token || '').toLowerCase().replace(/'/g, '').replace(/[^a-z0-9-]/g, '');
    if (out.endsWith('ies') && out.length > 4) out = `${out.slice(0, -3)}y`;
    else if (/(ches|shes|xes|zes|sses)$/.test(out) && out.length > 5) out = out.slice(0, -2);
    else if (out.endsWith('s') && out.length > 3 && !/(ss|us|is)$/.test(out)) out = out.slice(0, -1);
    return out;
  }

  function addFeature(out, feature, value = 1) {
    const hash = hashString(feature);
    const sign = hash & 0x80000000 ? -1 : 1;
    out[hash % out.length] += value * sign;
  }

  function addCharNgrams(out, token) {
    const padded = `^${token}$`;
    for (let n = 3; n <= 4; n += 1) {
      if (padded.length < n) continue;
      for (let i = 0; i <= padded.length - n; i += 1) {
        addFeature(out, `c${n}:${padded.slice(i, i + n)}`, 0.42);
      }
    }
  }

  function hashString(str) {
    let hash = 2166136261;
    const value = String(str || '');
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function validateQueryEmbedding(result, index) {
    const embedding = result && result.embedding instanceof Float32Array
      ? result.embedding
      : null;
    if (!embedding) throw new Error('embedProvider.embed must return { embedding: Float32Array }');
    if (embedding.length !== index.embeddingDim) {
      throw new Error(`query embedding dim mismatch (${embedding.length} !== ${index.embeddingDim})`);
    }
    for (let i = 0; i < embedding.length; i += 1) {
      if (!Number.isFinite(embedding[i])) throw new Error(`query embedding has non-finite value at ${i}`);
    }
    if (String(result.embedModelId || '') !== index.embedModelId) {
      throw new Error(`query embedModelId mismatch (${result.embedModelId || ''} !== ${index.embedModelId})`);
    }
    const queryHash = hashHex(result.embedModelHash);
    const indexHash = hashHex(index.embedModelHash);
    if (!queryHash || queryHash !== indexHash) {
      throw new Error(`query embedModelHash mismatch (${queryHash || ''} !== ${indexHash})`);
    }
    return normalizeEmbeddingVector(embedding, 'query');
  }

  function normalizeEmbedProvider(provider, runtime, backend) {
    if (!provider || typeof provider.embed !== 'function') {
      throw new Error('embed provider must expose embed({ text })');
    }
    return {
      backend,
      embed: async (args) => {
        const result = await provider.embed(args);
        return withEmbeddingProvenance(result, runtime);
      },
      embedMany: async (rows) => {
        if (typeof provider.embedMany === 'function') {
          const results = await provider.embedMany(rows);
          return (results || []).map((result) => withEmbeddingProvenance(result, runtime));
        }
        if (typeof provider.embedBatch === 'function') {
          const results = await provider.embedBatch(rows);
          return (results || []).map((result) => withEmbeddingProvenance(result, runtime));
        }
        const results = [];
        for (const row of rows || []) {
          results.push(withEmbeddingProvenance(await provider.embed(row), runtime));
        }
        return results;
      },
    };
  }

  function providerFromModelHandle(handle, runtime, backend, modelBaseUrl = '') {
    if (!handle || (typeof handle.embed !== 'function' && !handle.advanced && typeof handle.prefillWithEmbedding !== 'function')) {
      throw new Error('Doppler model handle must expose embed() or prefillWithEmbedding()');
    }
    let queue = Promise.resolve();
    const run = async ({ text }) => {
      const prompt = String(text || '');
      if (!prompt) throw new Error('Doppler embed text required');
      let result = null;
      if (typeof handle.embed === 'function') {
        result = await handle.embed(prompt, {
          useChatTemplate: false,
          embeddingMode: 'mean',
          __skipStateSnapshot: true,
        });
      } else {
        const prefill = handle.advanced && handle.advanced.prefillWithEmbedding || handle.prefillWithEmbedding;
        result = await prefill.call(handle.advanced || handle, prompt, {
          useChatTemplate: false,
          embeddingMode: 'mean',
          __skipStateSnapshot: true,
        });
      }
      const provenance = modelHandleProvenance(handle, runtime, modelBaseUrl);
      return withEmbeddingProvenance({
        embedding: result && result.embedding,
        embedModelId: provenance.embedModelId,
        embedModelHash: provenance.embedModelHash,
        modelSource: {
          ...provenance.modelSource,
          sourceKind: backend,
          modelBaseUrl,
        },
      }, runtime);
    };
    return {
      backend,
      embed(args) {
        const next = queue.then(() => run(args), () => run(args));
        queue = next.then(() => undefined, () => undefined);
        return next;
      },
      async embedMany(rows) {
        const results = [];
        for (const row of rows || []) {
          results.push(await this.embed(row));
        }
        return results;
      },
    };
  }

  function modelHandleProvenance(handle, runtime, modelBaseUrl = '') {
    const handleManifest = handle && handle.manifest || {};
    const rawModelId = handle && (handle.modelId || handleManifest.modelId) || '';
    const rawHash = handleManifest.modelHash || handleManifest.manifestHash || handleManifest.hash || null;
    return normalizeEmbeddingModelProvenance(rawModelId, rawHash, runtime, modelBaseUrl);
  }

  function normalizeEmbeddingModelProvenance(rawModelId, rawHash, runtime, modelBaseUrl = '') {
    const expectedModel = runtime.manifest.embedModel;
    const expectedHash = expectedModel.manifestHash;
    const normalizedSource = normalizeModelSource(modelBaseUrl || rawModelId);
    const expectedSource = normalizeModelSource(expectedModel.defaultModelBaseUrl);
    const rawSourceMatches = normalizedSource && expectedSource && normalizedSource === expectedSource;
    const rawIdMatches = String(rawModelId || '') === expectedModel.id;
    const rawHashMatches = !rawHash || hashHex(rawHash) === hashHex(expectedHash);
    if (!rawHashMatches) {
      return {
        embedModelId: rawModelId,
        embedModelHash: rawHash,
        modelSource: { rawModelId, rawEmbedModelHash: rawHash },
      };
    }
    if (!rawModelId || rawSourceMatches || rawIdMatches || (rawHash && rawHashMatches)) {
      return {
        embedModelId: expectedModel.id,
        embedModelHash: expectedHash,
        modelSource: { rawModelId, rawEmbedModelHash: rawHash },
      };
    }
    return {
      embedModelId: rawModelId,
      embedModelHash: rawHash,
      modelSource: { rawModelId, rawEmbedModelHash: rawHash },
    };
  }

  function normalizeModelSource(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function modelLabel(manifest) {
    const model = manifest && manifest.embedModel || {};
    return String(model.family || model.id || 'intent model');
  }

  function modelSlug(value) {
    const slug = String(value || 'intent-model')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return slug || 'intent-model';
  }

  function rerankerId(runtime) {
    const modelId = runtime && runtime.index && runtime.index.embedModelId || '';
    return `simulatte.${modelSlug(modelId)}-reranker.v1`;
  }

  function withEmbeddingProvenance(result, runtime) {
    const rawModelId = result && result.embedModelId || '';
    const rawHash = result && result.embedModelHash || null;
    const provenance = normalizeEmbeddingModelProvenance(rawModelId, rawHash, runtime);
    const modelSource = {
      ...(result && result.modelSource || {}),
      ...provenance.modelSource,
    };
    return {
      embedding: result && result.embedding,
      embedModelId: provenance.embedModelId,
      embedModelHash: provenance.embedModelHash,
      modelSource,
    };
  }

  function cloneJsonValue(value) {
    if (value == null) return null;
    return JSON.parse(JSON.stringify(value));
  }

  async function resolveDopplerApi(options = {}) {
    ensureDopplerKernelBasePath(options.kernelBasePath);
    const direct = options.dopplerModule || globalDopplerApi();
    if (direct) return direct;
    const rawModuleUrl = options.moduleUrl || DEFAULT_DOPPLER_MODULE_URL;
    const moduleUrl = typeof location === 'undefined'
      ? rawModuleUrl
      : resolveUrl(rawModuleUrl, location.href);
    try {
      const mod = await import(moduleUrl);
      return mod.doppler || mod.default || mod;
    } catch (err) {
      throw new Error(`Doppler module import failed from ${moduleUrl}: ${err && err.message ? err.message : String(err)}`);
    }
  }

  function ensureDopplerKernelBasePath(rawKernelBasePath = '') {
    if (typeof globalThis === 'undefined') return;
    const existing = globalThis.__DOPPLER_KERNEL_BASE_PATH__;
    if (typeof existing === 'string' && existing.trim()) return;
    const rawPath = rawKernelBasePath || DEFAULT_DOPPLER_KERNEL_BASE_PATH;
    const resolvedPath = typeof location === 'undefined'
      ? rawPath
      : resolveUrl(rawPath, location.href);
    globalThis.__DOPPLER_KERNEL_BASE_PATH__ = resolvedPath.replace(/\/+$/, '');
  }

  function globalDopplerApi() {
    if (typeof globalThis === 'undefined') return null;
    return globalThis.doppler || globalThis.Doppler || globalThis.DopplerRuntime || null;
  }

  function globalModelHandle() {
    if (typeof globalThis === 'undefined') return null;
    return globalThis.SimulatteDopplerEmbedModel || globalThis.DopplerEmbeddingModel || null;
  }

  function modelSummary(runtime, query, provider) {
    return {
      id: runtime.index.embedModelId,
      family: runtime.manifest.embedModel.family || 'local-model',
      modelType: runtime.manifest.embedModel.modelType || 'embedding',
      manifestId: runtime.manifest.id,
      dimensions: runtime.index.embeddingDim,
      embedModelHash: runtime.index.embedModelHash,
      queryEmbeddingHash: query && query.queryEmbeddingHash || null,
      indexId: runtime.index.id,
      indexHash: runtime.index.indexHash,
      indexDocuments: runtime.index.documentCount,
      surfaceCardIndexId: runtime.cardIndex ? runtime.cardIndex.id : null,
      surfaceCardIndexHash: runtime.cardIndex ? runtime.cardIndex.indexHash : null,
      surfaceCardDocuments: runtime.cardIndex ? runtime.cardIndex.documentCount : 0,
      universeIndexId: runtime.universe ? runtime.universe.id : null,
      universeDocuments: runtime.universe ? runtime.universe.documentCount : 0,
      reranker: rerankerId(runtime),
      backend: provider && provider.backend || '',
    };
  }

  function blankResult(runtime) {
    return {
      model: {
        id: runtime.index.embedModelId,
        family: runtime.manifest.embedModel.family || 'local-model',
        dimensions: runtime.index.embeddingDim,
        indexId: runtime.index.id,
        indexDocuments: runtime.index.documentCount,
        surfaceCardIndexId: runtime.cardIndex ? runtime.cardIndex.id : null,
        surfaceCardDocuments: runtime.cardIndex ? runtime.cardIndex.documentCount : 0,
        universeIndexId: runtime.universe ? runtime.universe.id : null,
        universeDocuments: runtime.universe ? runtime.universe.documentCount : 0,
        reranker: rerankerId(runtime),
      },
      backend: 'blank',
      rankBackend: 'none',
      priors: [],
      cardMatches: [],
      universeMatches: rankUniverseIndexes(runtime.universe, '', null, {}),
      rerank: {
        schema: 'simulatte.intentRerank.v1',
        required: true,
        modelPriorCount: 0,
        ragDocumentCount: 0,
        dopplerPrimitiveCount: 0,
        top: [],
      },
      semanticRag: null,
      dopplerIntent: null,
      spanRetrieval: emptySpanRetrieval([], spanConfigFor(runtime, {}, null), 'blank'),
      evidenceRows: [],
      retrievalPhase: 'blank',
    };
  }

  function primitivePriorFromScore(primitive, rawScore) {
    const modelScore = clamp01(Number(rawScore || 0));
    return {
      primitiveId: primitive.id,
      layer: canonicalLayer(primitive.layer || primitive.type),
      rawLayer: primitive.layer || primitive.type || 'component',
      type: primitive.type,
      domains: primitive.domains || [],
      score: Number(modelScore.toFixed(4)),
      modelScore: Number(modelScore.toFixed(4)),
      semanticScore: Number(modelScore.toFixed(4)),
      symbolicBoost: 0,
    };
  }

  function createRag(prompt, candidates, priors, primitiveIndex, promptVector) {
    const ragApi = typeof globalThis !== 'undefined' ? globalThis.SimulatteSemanticRag : null;
    if (!ragApi || typeof ragApi.createSemanticRag !== 'function') return null;
    return ragApi.createSemanticRag(prompt, candidates, {
      modelPriors: priors,
      primitiveIndex,
      promptVector,
      maxDocuments: 72,
      maxOpenComponents: 12,
    });
  }

  async function analyzeDopplerIntent(prompt, candidates, options) {
    const api = options.dopplerIntentApi || (
      typeof globalThis !== 'undefined' ? globalThis.SimulatteDopplerIntent : null
    );
    if (!api || typeof api.analyzePrompt !== 'function') return null;
    try {
      return await api.analyzePrompt(prompt, candidates, options);
    } catch (err) {
      if (options.dopplerEnabled === true) {
        return {
          schema: 'simulatte.dopplerIntentHints.v1',
          source: 'doppler-unavailable',
          unavailable: true,
          reason: err && err.message ? err.message : String(err),
          primitives: [],
          regimes: [],
          operators: [],
          confidence: 0,
        };
      }
      return null;
    }
  }

  function rerankPriors(priors, semanticRag, dopplerIntent, runtime = null, universeMatches = null) {
    const byId = new Map((priors || []).map((prior) => [prior.primitiveId, {
      ...prior,
      modelScore: Number(prior.modelScore ?? prior.score ?? 0),
      ragScore: 0,
      dopplerScore: 0,
      universeScore: 0,
      universeEvidence: [],
      matchedTerms: [],
    }]));
    for (const doc of semanticRag && semanticRag.retrieved || []) {
      const existing = byId.get(doc.primitiveId);
      if (!existing) continue;
      const ragScore = Number(doc.score || 0);
      existing.ragScore = Number(ragScore.toFixed(4));
      existing.matchedTerms = uniqueStrings([...(existing.matchedTerms || []), ...(doc.matchedTerms || [])]);
      byId.set(doc.primitiveId, existing);
    }
    for (const hint of dopplerIntent && dopplerIntent.primitives || []) {
      const existing = byId.get(hint.primitiveId);
      if (!existing) continue;
      existing.dopplerScore = Number(Math.max(existing.dopplerScore || 0, hint.score || 0).toFixed(4));
      existing.dopplerReason = hint.reason || '';
      byId.set(hint.primitiveId, existing);
    }
    let universePrimitiveHintCount = 0;
    for (const candidate of universeMatches && universeMatches.candidates || []) {
      const hints = uniqueStrings(candidate.primitiveHints || []);
      for (const primitiveId of hints) {
        const existing = byId.get(primitiveId);
        if (!existing) continue;
        const universeScore = clamp01(Number(candidate.score || 0));
        existing.universeScore = Number(Math.max(existing.universeScore || 0, universeScore).toFixed(4));
        existing.universeEvidence = (existing.universeEvidence || []).concat([{
          id: candidate.id,
          indexName: candidate.indexName,
          label: candidate.label,
          score: Number(universeScore.toFixed(4)),
        }]).slice(0, 5);
        universePrimitiveHintCount += 1;
        byId.set(primitiveId, existing);
      }
    }
    const rows = Array.from(byId.values()).map((prior) => {
      const lexical = Math.min(1, (prior.matchedTerms || []).length / 5);
      const score = prior.modelScore * 0.58
        + prior.ragScore * 0.16
        + lexical * 0.03
        + prior.symbolicBoost * 0.16
        + prior.dopplerScore * 0.24
        + prior.universeScore * 0.12;
      return {
        ...prior,
        lexicalScore: Number(lexical.toFixed(4)),
        score: Number(Math.min(1, score).toFixed(4)),
      };
    }).sort((a, b) => (
      b.score - a.score ||
      b.modelScore - a.modelScore ||
      b.ragScore - a.ragScore ||
      a.primitiveId.localeCompare(b.primitiveId)
    ));
    return {
      priors: rows,
      receipt: {
        schema: 'simulatte.intentRerank.v1',
        required: true,
        model: runtime ? rerankerId(runtime) : 'simulatte.intent-model-reranker.v1',
        modelPriorCount: priors.length,
        ragDocumentCount: semanticRag && semanticRag.retrieved ? semanticRag.retrieved.length : 0,
        dopplerPrimitiveCount: dopplerIntent && dopplerIntent.primitives ? dopplerIntent.primitives.length : 0,
        universeCandidateCount: universeMatches && universeMatches.candidates ? universeMatches.candidates.length : 0,
        universePrimitiveHintCount,
        top: rows.slice(0, 12).map((row) => row.primitiveId),
      },
    };
  }

  function symbolicPromptMatch(promptText, promptTerms, primitive) {
    const prompt = ` ${String(promptText || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
    const idPhrase = String(primitive.id || '').toLowerCase().replace(/[-_]+/g, ' ').trim();
    const idTerms = fallbackFeatureTokens(String(primitive.id || '').replace(/[-_]+/g, ' '));
    const domainTerms = fallbackFeatureTokens((primitive.domains || []).join(' '));
    const textTerms = fallbackFeatureTokens([
      primitive.role || '',
      primitive.text || '',
      (primitive.recipe || []).join(' '),
    ].join(' '));
    const matched = [];
    let score = 0;
    if (idPhrase && idPhrase.length > 2 && prompt.includes(` ${idPhrase} `)) {
      score += 0.44;
      matched.push(idPhrase);
    }
    let idHits = 0;
    for (const term of idTerms) {
      if (promptTerms.has(term)) {
        idHits += 1;
        matched.push(term);
      }
    }
    score += Math.min(0.42, idHits * 0.22);
    let domainHits = 0;
    for (const term of domainTerms) {
      if (promptTerms.has(term)) {
        domainHits += 1;
        matched.push(term);
      }
    }
    score += Math.min(0.18, domainHits * 0.08);
    let textHits = 0;
    for (const term of textTerms) {
      if (promptTerms.has(term)) {
        textHits += 1;
        matched.push(term);
      }
    }
    score += Math.min(0.18, textHits * 0.035);
    return {
      score: Number(Math.min(0.76, score).toFixed(4)),
      terms: uniqueStrings(matched).slice(0, 10),
    };
  }

  function mergeRagScores(priors, semanticRag) {
    return rerankPriors(priors, semanticRag, null).priors
      .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
  }

  function rankCpu(queryVector, candidateVectors) {
    return candidateVectors.map((candidate) => dot(queryVector, candidate));
  }

  async function rankWebGpu(device, dimensions, queryVector, candidateVectors) {
    const count = candidateVectors.length;
    const queryData = new Float32Array(queryVector);
    const candidateData = new Float32Array(count * dimensions);
    candidateVectors.forEach((vector, index) => {
      candidateData.set(vector, index * dimensions);
    });
    const queryBuffer = gpuBuffer(device, queryData, GPUBufferUsage.STORAGE);
    const candidateBuffer = gpuBuffer(device, candidateData, GPUBufferUsage.STORAGE);
    const scoreBuffer = device.createBuffer({
      size: count * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const readBuffer = device.createBuffer({
      size: count * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const uniformData = new Uint32Array([dimensions, count]);
    const uniformBuffer = gpuBuffer(device, uniformData, GPUBufferUsage.UNIFORM);
    const shader = device.createShaderModule({ code: rankShader() });
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: shader, entryPoint: 'main' },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: queryBuffer } },
        { binding: 1, resource: { buffer: candidateBuffer } },
        { binding: 2, resource: { buffer: scoreBuffer } },
        { binding: 3, resource: { buffer: uniformBuffer } },
      ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(count / 64));
    pass.end();
    encoder.copyBufferToBuffer(scoreBuffer, 0, readBuffer, 0, count * 4);
    device.queue.submit([encoder.finish()]);
    await readBuffer.mapAsync(GPUMapMode.READ);
    const scores = new Float32Array(readBuffer.getMappedRange().slice(0));
    readBuffer.unmap();
    return Array.from(scores);
  }

  function gpuBuffer(device, data, usage) {
    const buffer = device.createBuffer({
      size: Math.max(4, Math.ceil(data.byteLength / 4) * 4),
      usage: usage | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  function rankShader() {
    return `
      struct Sizes {
        dimensions: u32,
        count: u32,
      };
      @group(0) @binding(0) var<storage, read> query: array<f32>;
      @group(0) @binding(1) var<storage, read> candidates: array<f32>;
      @group(0) @binding(2) var<storage, read_write> scores: array<f32>;
      @group(0) @binding(3) var<uniform> sizes: Sizes;
      @compute @workgroup_size(64)
      fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        let row = id.x;
        if (row >= sizes.count) { return; }
        var sum = 0.0;
        for (var i = 0u; i < sizes.dimensions; i = i + 1u) {
          sum = sum + query[i] * candidates[row * sizes.dimensions + i];
        }
        scores[row] = max(sum, 0.0);
      }
    `;
  }

  function dot(a, b) {
    let score = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) score += a[i] * b[i];
    return Math.max(0, score);
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

  function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }

  function hashHex(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.replace(/^sha256:/, '').toLowerCase();
    if (typeof value === 'object' && typeof value.hex === 'string') return value.hex.toLowerCase();
    return '';
  }

  function resolveUrl(path, base) {
    try {
      return new URL(path, new URL(base, location.href)).toString();
    } catch (_err) {
      return path;
    }
  }

  function urlValue(name) {
    try {
      return new URLSearchParams(globalThis.location && globalThis.location.search || '').get(name) || '';
    } catch (_err) {
      return '';
    }
  }

  return {
    create,
    mergeRagScores,
  };
});
