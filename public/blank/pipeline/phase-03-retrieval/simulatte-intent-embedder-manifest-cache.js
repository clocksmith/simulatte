(function attachSimulatteIntentEmbeddermanifestcache(root) {
  const scope = root.__SimulatteIntentEmbedderRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const createRerankProviderFromHandle = scope.rerankProviderFromModelHandle;
    if (typeof createRerankProviderFromHandle !== 'function') {
      throw new Error('Doppler reranker runtime must load before the model-backed embedder');
    }
    class ModelBackedIntentEmbedder {
        constructor(options = {}) {
          assertPinnedRuntimeOptions(options);
          this.manifestUrl = options.manifestUrl || DEFAULT_MANIFEST_URL;
          this.assetVersionQuery = normalizeAssetVersionQuery(options.assetVersionQuery || defaultAssetVersionQuery());
          this.catalog = options.catalog || null;
          this.onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
          this.embedProvider = options.embedProvider || null;
          this.rerankProvider = options.rerankProvider || options.rerankerProvider || null;
          this.dopplerModelHandle = options.dopplerModelHandle || null;
          this.dopplerModule = options.dopplerModule || null;
          this.dopplerDeviceModule = options.dopplerDeviceModule || null;
          this.dopplerStorageModule = options.dopplerStorageModule || null;
          this.spanLevelEmbedding = options.spanLevelEmbedding;
          this.spanEmbeddingCache = options.spanEmbeddingCache || new Map();
          this.traceEnabled = traceEnabled(options);
          this.traceId = options.traceId || `intent-${Math.random().toString(36).slice(2, 9)}`;
          this.modelPromise = null;
          this.providerPromise = null;
          this.rerankerProviderPromise = null;
          this.providerReady = false;
          this.rerankerReady = false;
          this.activeDopplerModelRole = '';
          this.dopplerEmbedHandle = null;
          this.dopplerEmbedModelBaseUrl = '';
          this.dopplerRerankerHandle = null;
          this.dopplerRerankerModelBaseUrl = '';
          this.embeddingCacheReceipt = null;
          this.rerankerCacheReceipt = null;
          this.providerRequestCount = 0;
          this.rankSerial = 0;
          this.gpuPromise = null;
          this.dopplerDevicePromise = null;
          this.dopplerApiPromise = null;
          this.dopplerCachedSourcePromises = new Map();
        }

        async loadModel(options = {}) {
          const progress = progressHandler(options, this.onProgress);
          const trace = this.traceEnabled || traceEnabled(options);
          const emitLoadProgress = (stage, percent, message, extra = {}) => {
            emitRuntimeProgress(progress, trace, {
              source: 'simulatte-intent-embedder',
              stage,
              percent,
              message,
              traceId: this.traceId,
              ...extra,
            });
          };
          if (!this.modelPromise) {
            const loadStarted = nowMs();
            emitLoadProgress('manifest', 3, 'Loading intent manifest', {
              timing: 'start',
              manifestUrl: this.manifestUrl,
              firstLoad: true,
            });
            this.modelPromise = this.loadManifest()
              .then(async (manifest) => {
                emitLoadProgress('manifest', 6, 'Intent manifest ready', {
                  timing: 'end',
                  durationMs: elapsedMsSince(loadStarted),
                  modelId: manifest.embedModel && manifest.embedModel.id || '',
                  modelBaseUrl: manifest.embedModel && manifest.embedModel.defaultModelBaseUrl || '',
                  sourceSizeBytes: manifest.embedModel && manifest.embedModel.source && manifest.embedModel.source.sizeBytes || 0,
                  cachePrefetch: manifest.cache && manifest.cache.prefetch === true,
                  cacheMode: manifest.cache && manifest.cache.storage && manifest.cache.storage.includes('OPFS')
                    ? 'opfs'
                    : '',
                });
                const prefetchRuntime = { manifest };
                const prefetchOptions = {
                  dopplerStorageModule: options.dopplerStorageModule || this.dopplerStorageModule,
                  progress,
                  trace,
                  traceId: this.traceId,
                };
                const hasInjectedEmbedding = options.embedProvider || this.embedProvider ||
                  options.dopplerModelHandle || this.dopplerModelHandle || globalModelHandle();
                const hasInjectedReranker = options.rerankProvider || options.rerankerProvider || this.rerankProvider ||
                  typeof globalThis !== 'undefined' && (globalThis.SimulatteDopplerReranker || globalThis.DopplerReranker);
                const runtimeConfig = manifest.runtime || {};
                if (!hasInjectedEmbedding && !this.dopplerApiPromise && runtimeConfig.moduleUrl) {
                  this.dopplerApiPromise = resolveDopplerApi({
                    dopplerModule: options.dopplerModule || this.dopplerModule,
                    moduleUrl: runtimeConfig.moduleUrl,
                    kernelBasePath: runtimeConfig.kernelBasePath,
                  });
                  this.dopplerApiPromise.catch(() => { this.dopplerApiPromise = null; });
                }
                const eagerReranker = rerankerConfig(manifest);
                const sourceModels = {
                  embedding: !hasInjectedEmbedding ? manifest.embedModel : null,
                  reranker: !hasInjectedReranker && eagerReranker.enabled && eagerReranker.required
                    ? eagerReranker.model : null,
                };
                const sourcePreparation = sourceModels.embedding || sourceModels.reranker
                  ? prepareDopplerModelSources(this, prefetchRuntime, sourceModels, {
                    embedding: { ...prefetchOptions, progressRange: EMBEDDING_CACHE_PROGRESS, resourceKind: 'embedding-model' },
                    reranker: { ...prefetchOptions, progressRange: RERANKER_CACHE_PROGRESS, resourceKind: 'reranker-model' },
                  })
                  : null;
                const devicePreparation = sourcePreparation ? this.ensureDopplerDevice(prefetchRuntime, options) : null;
                const preparationBarrier = sourcePreparation
                  ? Promise.all([sourcePreparation, devicePreparation]).then(
                    () => ({ error: null }), (error) => ({ error })
                  )
                  : null;
                const retrieval = manifest.retrieval || {};
                const indexUrl = retrieval.artifact;
                if (!indexUrl) throw new Error('intent manifest missing retrieval artifact');
                const cardRetrieval = retrieval.cards || {};
                const cardIndexUrl = cardRetrieval.artifact || '';
                const universeRetrieval = retrieval.universe || {};
                const universeManifestUrl = universeRetrieval.artifact || '';
                const indexesStarted = nowMs();
                emitLoadProgress('indexes', 8, 'Loading primitive, surface, and universe indexes', {
                  timing: 'start',
                });
                const fetchTelemetry = {
                  progress,
                  traceEnabled: trace,
                  traceId: this.traceId,
                  assetVersionQuery: this.assetVersionQuery,
                };
                const [index, cardIndex, universe] = await Promise.all([
    	              fetchJson(versionedAssetUrl(resolveUrl(indexUrl, this.manifestUrl), this.assetVersionQuery), 'primitive embedding index', {
    	                ...fetchTelemetry,
    	                stage: 'index-fetch',
    	                percent: 10,
    	                resourceKind: 'primitive-index',
    	                expectedHash: retrieval.artifactHash || retrieval.hash || null,
    	              }),
    	              cardIndexUrl
    	                ? fetchJson(versionedAssetUrl(resolveUrl(cardIndexUrl, this.manifestUrl), this.assetVersionQuery), 'surface card embedding index', {
    	                  ...fetchTelemetry,
    	                  stage: 'index-fetch',
    	                  percent: 12,
    	                  resourceKind: 'surface-card-index',
    	                  expectedHash: cardRetrieval.artifactHash || cardRetrieval.hash || null,
    	                })
                    : Promise.resolve(null),
                  universeManifestUrl
                    ? loadUniverseIndexes(versionedAssetUrl(resolveUrl(universeManifestUrl, this.manifestUrl), this.assetVersionQuery), fetchTelemetry)
                    : Promise.resolve(null),
                ]);
                const runtime = normalizeModelBackedRuntime(manifest, index, cardIndex, universe);
                const preparation = preparationBarrier ? await preparationBarrier : null;
                if (preparation && preparation.error) throw preparation.error;
                emitLoadProgress('indexes', 16, 'Embedding indexes ready', {
                  timing: 'end',
                  durationMs: elapsedMsSince(indexesStarted),
                  primitiveDocuments: runtime.index && runtime.index.documentCount || 0,
                  surfaceCardDocuments: runtime.cardIndex && runtime.cardIndex.documentCount || 0,
                  universeDocuments: runtime.universe && runtime.universe.documentCount || 0,
                });
                const providerStarted = nowMs();
                const providerOptions = {
                  ...options,
                  onProgress: progress,
                  traceEmbeddings: trace,
                };
                const provider = await this.resolveEmbedProvider(runtime, providerOptions);
                const probe = await verifyPromptRuntimeProvider(runtime, provider, {
                  progress,
                  trace,
                  traceId: this.traceId,
                  nowIso: options.nowIso,
                });
                const rerankProvider = await this.resolveRerankProvider(runtime, provider, providerOptions);
                const rerankerProbe = await verifyPromptRuntimeReranker(runtime, provider, {
                  progress,
                  trace,
                  traceId: this.traceId,
                  nowIso: options.nowIso,
                  rerankProvider,
                  dopplerModelHandle: options.dopplerModelHandle || this.dopplerModelHandle || globalModelHandle(),
                });
                const receipt = promptRuntimeReceipt(runtime, provider, {
                  durationMs: elapsedMsSince(loadStarted),
                  firstLoad: true,
                  manifestUrl: this.manifestUrl,
                  providerLoadMs: elapsedMsSince(providerStarted),
                  traceId: this.traceId,
                  probe,
                  rerankerProbe,
                  embeddingCache: this.embeddingCacheReceipt,
                  rerankerCache: this.rerankerCacheReceipt,
                  modelPreparation: this.dopplerModelPreparationReceipt,
                });
                runtime.promptRuntimeReranker = rerankerProbe;
                runtime.promptRuntimeReceipt = receipt;
                emitLoadProgress('runtime-ready', 96, 'Prompt runtime ready', promptRuntimeReceiptProgress(receipt));
                return runtime;
              })
              .catch(async (error) => {
                await this.releaseDopplerHandles();
                this.modelPromise = null;
                this.providerReady = false;
                throw error;
              });
          } else {
            emitLoadProgress('runtime-reuse', this.providerReady ? 96 : 32, this.providerReady
              ? 'Prompt runtime already loaded'
              : 'Prompt runtime load already in flight', {
              reuse: true,
              providerReady: this.providerReady,
            });
          }
          return this.modelPromise;
        }

        async loadManifest() {
          const rawManifest = await fetchJson(versionedAssetUrl(this.manifestUrl, this.assetVersionQuery), 'intent manifest', {
            progress: this.onProgress,
            traceEnabled: this.traceEnabled,
            traceId: this.traceId,
            stage: 'manifest-fetch',
            percent: 4,
            resourceKind: 'intent-manifest',
          });
          const manifest = await resolvePinnedModelManifest(rawManifest, this.manifestUrl, {
            progress: this.onProgress,
            traceEnabled: this.traceEnabled,
            traceId: this.traceId,
            assetVersionQuery: this.assetVersionQuery,
          });
          if (!manifest.retrieval || manifest.retrieval.kind !== 'precomputed-primitive-index') {
            throw new Error('intent manifest retrieval must be a precomputed primitive index');
          }
          if (manifest.retrieval.rerank !== 'mandatory') {
            throw new Error('intent manifest must require rerank');
          }
          const reranker = rerankerConfig(manifest);
          if (reranker.enabled && reranker.schema !== 'simulatte.intentRerankerConfig.v1') {
            throw new Error('intent manifest reranker schema mismatch; expected simulatte.intentRerankerConfig.v1');
          }
          if (reranker.enabled && reranker.phase !== 3) {
            throw new Error('intent manifest reranker.phase must be 3');
          }
          if (reranker.enabled && reranker.executeInPhase !== 3) {
            throw new Error('intent manifest reranker.executeInPhase must be 3');
          }
          if (reranker.enabled && reranker.inputSchema !== 'simulatte.intentRerankInput.v1') {
            throw new Error('intent manifest reranker.inputSchema must be simulatte.intentRerankInput.v1');
          }
          if (reranker.enabled && reranker.outputSchema !== 'simulatte.intentRerank.v1') {
            throw new Error('intent manifest reranker.outputSchema must be simulatte.intentRerank.v1');
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
          if (!manifest.runtime.queryEmbeddingMode) {
            throw new Error('intent manifest runtime.queryEmbeddingMode is required');
          }
          const embeddingText = manifest.runtime.embeddingText || {};
          if (embeddingText.schema && embeddingText.schema !== 'simulatte.embeddingTextContract.v1') {
            throw new Error('intent manifest runtime.embeddingText.schema must be simulatte.embeddingTextContract.v1');
          }
          if (embeddingText.queryPrefix != null && typeof embeddingText.queryPrefix !== 'string') {
            throw new Error('intent manifest runtime.embeddingText.queryPrefix must be a string');
          }
          if (embeddingText.documentPrefix != null && typeof embeddingText.documentPrefix !== 'string') {
            throw new Error('intent manifest runtime.embeddingText.documentPrefix must be a string');
          }
          if (reranker.enabled && reranker.required && reranker.loadInPhase1WhenRequired !== false) {
            const model = reranker.model || {};
            if (!model.id || !model.defaultModelBaseUrl || !hashHex(model.manifestHash)) {
              throw new Error('required intent reranker must declare model.id, defaultModelBaseUrl, and manifestHash');
            }
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
            return blankResult(await this.loadModel(options));
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
          const runtime = await this.loadModel(options);
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
          const nonRetrievableIds = new Set(candidates
            .filter((primitive) => primitive && primitive.isRetrievable === false)
            .map((primitive) => primitive.id));
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
            .filter((prior) => !nonRetrievableIds.has(prior.primitiveId))
            .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
          const languageEvidence = spanLanguageEvidence(promptText, options);
          const previewRag = createRag(promptText, candidates, basePriors, runtime.index, queryVector, options);
          const activeRerankProvider = await this.resolveRerankProvider(runtime, provider, options);
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
          const slotRetrieval = await rankQueryPlanSlots({
            provider,
            runtime,
            candidates,
            candidateVectors,
            promptVector: queryVector,
            queryPlan: options.queryPlan,
            promptText,
            options,
            rerankProvider: activeRerankProvider,
            rankGpu: (vector) => this.tryRankWebGpu(runtime.index.embeddingDim, vector, candidateVectors),
            progress,
            traceEnabled: trace,
            traceId: this.traceId,
            rankId,
          });
          const fusedBasePriors = fuseSpanPrimitiveScores(basePriors, spanRetrieval);
          const semanticRag = createRag(promptText, candidates, fusedBasePriors, runtime.index, queryVector, options);
          const dopplerIntent = await analyzeDopplerIntent(promptText, candidates, options);
          const rerank = await rerankIntentPriors({
            priors: fusedBasePriors,
            semanticRag,
            dopplerIntent,
            slotRetrieval,
            runtime,
            universeMatches,
            provider,
            rerankProvider: activeRerankProvider,
            promptText,
            phaseLabel: 'span-refined',
            progress,
            trace,
            traceId: this.traceId,
            rankId,
          });
          const evidenceRows = buildIntentEvidenceRows({
            basePriors: fusedBasePriors,
            cardMatches,
            universeMatches,
            spanRetrieval,
            slotRetrieval,
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
            promptRuntimeReceipt: runtime.promptRuntimeReceipt || null,
            priors: rerank.priors.slice(0, max),
            cardMatches,
            universeMatches,
            spanRetrieval,
            slotRetrieval,
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
            const provider = normalizeEmbedProvider(options.embedProvider, runtime, 'injected-provider');
            this.providerReady = true;
            emitRuntimeProgress(progress, trace, {
              source: 'simulatte-intent-embedder',
              stage: 'model-ready',
              percent: 78,
              message: 'Using injected embedding provider',
              traceId: this.traceId,
              backend: 'injected-provider',
              providerReady: true,
              modelId: runtime.index && runtime.index.embedModelId || '',
              embeddingDim: runtime.index && runtime.index.embeddingDim || 0,
            });
            return provider;
          }
          if (this.embedProvider) {
            const provider = normalizeEmbedProvider(this.embedProvider, runtime, 'configured-provider');
            this.providerReady = true;
            emitRuntimeProgress(progress, trace, {
              source: 'simulatte-intent-embedder',
              stage: 'model-ready',
              percent: 78,
              message: 'Using configured embedding provider',
              traceId: this.traceId,
              backend: 'configured-provider',
              providerReady: true,
              modelId: runtime.index && runtime.index.embedModelId || '',
              embeddingDim: runtime.index && runtime.index.embeddingDim || 0,
            });
            return provider;
          }
          const handle = options.dopplerModelHandle || this.dopplerModelHandle || globalModelHandle();
          if (handle) {
            const provider = providerFromModelHandle(handle, runtime, 'injected-doppler-model');
            this.providerReady = true;
            emitRuntimeProgress(progress, trace, {
              source: 'simulatte-intent-embedder',
              stage: 'model-ready',
              percent: 78,
              message: 'Using injected Doppler model handle',
              traceId: this.traceId,
              backend: 'injected-doppler-model',
              providerReady: true,
              modelId: runtime.index && runtime.index.embedModelId || '',
              embeddingDim: runtime.index && runtime.index.embeddingDim || 0,
            });
            return provider;
          }
          this.providerRequestCount += 1;
          if (!this.providerPromise) {
            this.providerReady = false;
            this.providerPromise = this.loadDopplerModel(runtime, options)
              .then((provider) => {
                this.providerReady = true;
                return provider;
              })
              .catch((error) => {
                this.providerReady = false;
                this.providerPromise = null;
                throw error;
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
          const loaded = await this.loadDopplerEmbeddingHandle(runtime, options);
          return providerFromModelHandle(
            loaded.handle,
            runtime,
            'doppler-browser-load',
            loaded.modelBaseUrl,
            (reloadOptions = {}) => this.ensureDopplerEmbeddingHandle(runtime, options, reloadOptions)
          );
        }

        async ensureDopplerDevice(runtime, options = {}) {
          if (!this.dopplerDevicePromise) {
            const runtimeConfig = runtime.manifest.runtime || {};
            this.dopplerDevicePromise = resolveDopplerDeviceApi({
              dopplerDeviceModule: options.dopplerDeviceModule || this.dopplerDeviceModule,
              deviceModuleUrl: runtimeConfig.deviceModuleUrl,
            }).then((deviceApi) => {
              if (!deviceApi || typeof deviceApi.initDevice !== 'function') {
                throw new Error('pinned Doppler device module does not export initDevice()');
              }
              return deviceApi.initDevice();
            }).catch((error) => {
              this.dopplerDevicePromise = null;
              throw error;
            });
          }
          return this.dopplerDevicePromise;
        }

        async ensureDopplerEmbeddingHandle(runtime, options = {}, reloadOptions = {}) {
          if (reloadOptions.force !== true && this.dopplerEmbedHandle) {
            return this.dopplerEmbedHandle;
          }
          const loaded = await this.loadDopplerEmbeddingHandle(runtime, options);
          return loaded.handle;
        }

        async loadDopplerEmbeddingHandle(runtime, options = {}) {
          const progress = progressHandler(options, this.onProgress);
          const trace = this.traceEnabled || traceEnabled(options);
          const moduleUrl = runtime.manifest.runtime && runtime.manifest.runtime.moduleUrl;
          if (!moduleUrl) throw new Error('model runtime lock did not resolve a Doppler module URL');
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
          const api = await (this.dopplerApiPromise || resolveDopplerApi({
            dopplerModule: options.dopplerModule || this.dopplerModule,
            moduleUrl,
            kernelBasePath: runtime.manifest.runtime && runtime.manifest.runtime.kernelBasePath,
          }));
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
          const model = runtime.manifest.embedModel || {};
          const modelBaseUrl = model.defaultModelBaseUrl;
          if (!modelBaseUrl) throw new Error('model-backed intent requires embed model base URL');
          const runtimeConfig = cloneJsonValue(runtime.manifest.runtime && runtime.manifest.runtime.runtimeConfig);
          if (!runtimeConfig) {
            throw new Error('model-backed intent manifest missing Doppler runtimeConfig');
          }
          await this.ensureDopplerDevice(runtime, options);
          const cachedSource = preparedDopplerModelSource(this, 'embedding');
          const dopplerStarted = nowMs();
          emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'model-load',
            percent: EMBEDDING_LOAD_PROGRESS.start,
            message: 'Doppler loading embedding model files',
            timing: 'start',
            traceId: this.traceId,
            artifactMode: 'verified-opfs',
            modelBaseUrl,
            cachePrefetch: true,
            cacheMode: 'opfs',
          });
          const loadOptions = {
            isolatedLoader: true,
            runtimeConfig,
            onProgress: (event) => {
              emitRuntimeProgress(progress, trace, normalizeDopplerProgress(event, {
                traceId: this.traceId,
                modelBaseUrl,
                modelId: model.id || '',
                startedAtMs: dopplerStarted,
                progressStart: EMBEDDING_LOAD_PROGRESS.start,
                progressEnd: EMBEDDING_LOAD_PROGRESS.end,
                stagePrefix: 'model-load',
                resourceKind: 'embedding-model',
              }));
              if (typeof options.onModelProgress === 'function') options.onModelProgress(event);
            },
          };
          let handle;
          try {
            handle = await scheduleDopplerModelLoad(
              this, 'embedding', model.id, () => load(cachedSource.modelSource, loadOptions)
            );
            assertPinnedModelHandle(handle, model, 'embedding', modelBaseUrl);
          } catch (error) {
            await disposeFailedDopplerLoad(handle, cachedSource);
            throw error;
          }
          this.activeDopplerModelRole = 'embedding';
          this.dopplerEmbedHandle = handle;
          this.dopplerEmbedModelBaseUrl = modelBaseUrl;
          emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'model-ready',
            percent: EMBEDDING_LOAD_PROGRESS.end,
            message: 'Doppler embedding model ready',
            timing: 'end',
            traceId: this.traceId,
            durationMs: elapsedMsSince(dopplerStarted),
            artifactMode: 'verified-opfs',
            modelBaseUrl,
            backend: 'doppler-browser-load',
            providerReady: true,
            cachePrefetch: true,
            cacheMode: 'opfs',
            modelId: model.id || '',
            embeddingDim: runtime.index && runtime.index.embeddingDim || 0,
          });
          return { handle, modelBaseUrl };
        }

        shouldStartPhase1RerankerLoad(runtime, options = {}) {
          const config = rerankerConfig(runtime);
          if (!config.enabled || !config.required || !config.model || config.loadInPhase1WhenRequired === false) {
            return false;
          }
          return !options.rerankProvider &&
            !options.rerankerProvider &&
            !this.rerankProvider &&
            !options.embedProvider &&
            !this.embedProvider &&
            !options.dopplerModelHandle &&
            !this.dopplerModelHandle &&
            !globalModelHandle();
        }

        async resolveRerankProvider(runtime, provider, options = {}) {
          const explicit = options.rerankProvider || options.rerankerProvider;
          if (explicit) {
            this.rerankProvider = normalizeRerankProvider(explicit, 'injected-rerank-provider');
            this.rerankerReady = true;
            return this.rerankProvider;
          }
          if (this.rerankProvider) {
            this.rerankerReady = true;
            return this.rerankProvider;
          }
          const providerCapability = resolveRerankerCapability(provider, {});
          if (providerCapability) {
            this.rerankProvider = {
              backend: providerCapability.backend,
              rerank: providerCapability.rerank,
            };
            this.rerankerReady = true;
            return this.rerankProvider;
          }
          const config = rerankerConfig(runtime);
          if (!config.enabled || !config.model || config.loadInPhase1WhenRequired === false) {
            this.rerankerReady = false;
            return null;
          }
          if (!this.rerankerProviderPromise) {
            this.rerankerReady = false;
            this.rerankerProviderPromise = this.loadDopplerRerankerModel(runtime, options)
              .then((rerankProvider) => {
                this.rerankProvider = rerankProvider;
                this.rerankerReady = true;
                return rerankProvider;
              })
              .catch((error) => {
                this.rerankerReady = false;
                this.rerankerProviderPromise = null;
                if (rerankerRequired(runtime)) throw error;
                return null;
              });
          }
          return this.rerankerProviderPromise;
        }

        async loadDopplerRerankerModel(runtime, options = {}) {
          const config = rerankerConfig(runtime);
          const model = config.model || {};
          const progress = progressHandler(options, this.onProgress);
          const trace = this.traceEnabled || traceEnabled(options);
          const moduleUrl = runtime.manifest.runtime && runtime.manifest.runtime.moduleUrl;
          if (!moduleUrl) throw new Error('model runtime lock did not resolve a Doppler module URL');
          const api = await (this.dopplerApiPromise || resolveDopplerApi({
            dopplerModule: options.dopplerModule || this.dopplerModule,
            moduleUrl,
            kernelBasePath: runtime.manifest.runtime && runtime.manifest.runtime.kernelBasePath,
          }));
          const load = api && (api.load || api.doppler && api.doppler.load);
          if (typeof load !== 'function') {
            throw new Error(`model-backed intent requires Doppler load() for reranker; no loader found at ${moduleUrl}`);
          }
          const modelBaseUrl = model.defaultModelBaseUrl;
          if (!modelBaseUrl) throw new Error(`intent reranker ${config.id} requires model.defaultModelBaseUrl`);
          await this.ensureDopplerDevice(runtime, options);
          const cachedSource = preparedDopplerModelSource(this, 'reranker');
          const started = nowMs();
          emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'reranker-load',
            percent: RERANKER_LOAD_PROGRESS.start,
            message: 'Doppler loading reranker from verified OPFS cache',
            timing: 'start',
            traceId: this.traceId,
            reranker: config.id,
            modelId: model.id || '',
            modelBaseUrl,
            artifactMode: 'verified-opfs',
            cachePrefetch: true,
            cacheMode: 'opfs',
          });
          const loadOptions = {
            isolatedLoader: true,
            onProgress: (event) => {
              emitRuntimeProgress(progress, trace, normalizeDopplerProgress(event, {
                traceId: this.traceId,
                modelBaseUrl,
                modelId: model.id || '',
                startedAtMs: started,
                progressStart: RERANKER_LOAD_PROGRESS.start,
                progressEnd: RERANKER_LOAD_PROGRESS.end,
                stagePrefix: 'reranker-load',
                resourceKind: 'reranker-model',
              }));
            },
          };
          if (config.runtimeConfig) loadOptions.runtimeConfig = cloneJsonValue(config.runtimeConfig);
          let handle;
          try {
            handle = await scheduleDopplerModelLoad(
              this, 'reranker', model.id, () => load(cachedSource.modelSource, loadOptions)
            );
            assertPinnedModelHandle(handle, model, 'reranker', modelBaseUrl);
          } catch (error) {
            await disposeFailedDopplerLoad(handle, cachedSource);
            throw error;
          }
          this.activeDopplerModelRole = 'reranker';
          this.dopplerRerankerHandle = handle;
          this.dopplerRerankerModelBaseUrl = modelBaseUrl;
          emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'reranker-ready',
            percent: RERANKER_LOAD_PROGRESS.end,
            message: 'Doppler reranker ready',
            timing: 'end',
            traceId: this.traceId,
            durationMs: elapsedMsSince(started),
            reranker: config.id,
            modelId: model.id || '',
            modelBaseUrl,
            artifactMode: 'verified-opfs',
            cachePrefetch: true,
            cacheMode: 'opfs',
          });
          return this.createDopplerRerankerProvider(runtime, config, options, handle, modelBaseUrl);
        }

        async releaseDopplerHandles() {
          const handles = [...new Set([
            this.dopplerEmbedHandle,
            this.dopplerRerankerHandle,
          ].filter(Boolean))];
          this.dopplerEmbedHandle = null;
          this.dopplerRerankerHandle = null;
          this.activeDopplerModelRole = '';
          await Promise.allSettled(handles.map((handle) => (
            typeof handle.unload === 'function' ? handle.unload() : Promise.resolve()
          )));
          await closePreparedDopplerModelSources(this);
          resetDopplerModelPreparation(this);
        }

        createDopplerRerankerProvider(runtime, config, options, handle, modelBaseUrl) {
          let activeHandle = handle;
          let activeProvider = createRerankProviderFromHandle(
            activeHandle,
            runtime,
            config,
            'doppler-reranker-load',
            modelBaseUrl
          );
          return {
            backend: 'doppler-reranker-load',
            rerank: async (input) => {
              if (!this.dopplerRerankerHandle) {
                const reloaded = await this.loadDopplerRerankerModel(runtime, options);
                return reloaded.rerank(input);
              }
              if (this.dopplerRerankerHandle !== activeHandle) {
                activeHandle = this.dopplerRerankerHandle;
                activeProvider = createRerankProviderFromHandle(
                  activeHandle,
                  runtime,
                  config,
                  'doppler-reranker-load',
                  this.dopplerRerankerModelBaseUrl || modelBaseUrl
                );
              }
              return activeProvider.rerank(input);
            },
          };
        }

        async gpuDevice() {
          if (this.dopplerDevicePromise) {
            return this.dopplerDevicePromise;
          }
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

    Object.assign(scope, {
      ModelBackedIntentEmbedder,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
