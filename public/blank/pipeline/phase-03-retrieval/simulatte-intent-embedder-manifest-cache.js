(function attachSimulatteIntentEmbeddermanifestcache(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('intentEmbedder');

    if (typeof scope.managedRerankProvider !== 'function') {
      throw new Error('Doppler reranker runtime must load before the model-backed embedder');
    }
    const boundedHeadClassifier = root.SimulatteIntentEmbedderBoundedClassification;
    if (!boundedHeadClassifier) throw new Error('Phase 3 bounded classification runtime must load before the embedder');
    class ModelBackedIntentEmbedder {
        constructor(options = {}) {
          scope.assertPinnedRuntimeOptions(options);
          this.manifestUrl = options.manifestUrl || scope.DEFAULT_MANIFEST_URL;
          this.assetVersionQuery = scope.normalizeAssetVersionQuery(options.assetVersionQuery || scope.defaultAssetVersionQuery());
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
          this.traceEnabled = scope.traceEnabled(options);
          this.traceId = options.traceId || `intent-${Math.random().toString(36).slice(2, 9)}`;
          this.modelPromise = null;
          this.manifestPromise = null;
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
          this.classificationRouter = null;
          this.classificationRouterPolicyId = '';
          this.gpuPromise = null;
          this.dopplerDevicePromise = null;
          this.dopplerApiPromise = null;
          this.dopplerCachedSourcePromises = new Map();
        }

        async loadModel(options = {}) {
          const progress = scope.progressHandler(options, this.onProgress);
          const trace = this.traceEnabled || scope.traceEnabled(options);
          const emitLoadProgress = (stage, percent, message, extra = {}) => {
            scope.emitRuntimeProgress(progress, trace, {
              source: 'simulatte-intent-embedder',
              stage,
              percent,
              message,
              traceId: this.traceId,
              ...extra,
            });
          };
          if (!this.modelPromise) {
            const loadStarted = scope.nowMs();
            emitLoadProgress('manifest', 3, 'Loading intent manifest', {
              timing: 'start',
              manifestUrl: this.manifestUrl,
              firstLoad: true,
            });
            this.modelPromise = this.loadManifest()
              .then(async (manifest) => {
                emitLoadProgress('manifest', 6, 'Intent manifest ready', {
                  timing: 'end',
                  durationMs: scope.elapsedMsSince(loadStarted),
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
                  options.dopplerModelHandle || this.dopplerModelHandle || scope.globalModelHandle();
                const hasInjectedReranker = options.rerankProvider || options.rerankerProvider || this.rerankProvider ||
                  typeof globalThis !== 'undefined' && (globalThis.SimulatteDopplerReranker || globalThis.DopplerReranker);
                const runtimeConfig = manifest.runtime || {};
                if (!hasInjectedEmbedding && !this.dopplerApiPromise && runtimeConfig.moduleUrl) {
                  this.dopplerApiPromise = scope.resolveDopplerApi({
                    dopplerModule: options.dopplerModule || this.dopplerModule,
                    moduleUrl: runtimeConfig.moduleUrl,
                    kernelBasePath: runtimeConfig.kernelBasePath,
                  });
                  this.dopplerApiPromise.catch(() => { this.dopplerApiPromise = null; });
                }
                const eagerReranker = scope.rerankerConfig(manifest);
                const sourceModels = {
                  embedding: !hasInjectedEmbedding ? manifest.embedModel : null,
                  reranker: !hasInjectedReranker && eagerReranker.enabled && eagerReranker.required
                    ? eagerReranker.model : null,
                };
                const sourcePreparation = sourceModels.embedding || sourceModels.reranker
                  ? scope.prepareDopplerModelSources(this, prefetchRuntime, sourceModels, {
                    embedding: { ...prefetchOptions, progressRange: scope.EMBEDDING_CACHE_PROGRESS, resourceKind: 'embedding-model' },
                    reranker: { ...prefetchOptions, progressRange: scope.RERANKER_CACHE_PROGRESS, resourceKind: 'reranker-model' },
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
                const indexesStarted = scope.nowMs();
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
                    scope.fetchJson(scope.versionedAssetUrl(scope.resolveUrl(indexUrl, this.manifestUrl), this.assetVersionQuery), 'primitive embedding index', {
                      ...fetchTelemetry,
                      stage: 'index-fetch',
                      percent: 10,
                      resourceKind: 'primitive-index',
                      expectedHash: retrieval.artifactHash || retrieval.hash || null,
                    }),
                    cardIndexUrl
                      ? scope.fetchJson(scope.versionedAssetUrl(scope.resolveUrl(cardIndexUrl, this.manifestUrl), this.assetVersionQuery), 'surface card embedding index', {
                        ...fetchTelemetry,
                        stage: 'index-fetch',
                        percent: 12,
                        resourceKind: 'surface-card-index',
                        expectedHash: cardRetrieval.artifactHash || cardRetrieval.hash || null,
                      })
                    : Promise.resolve(null),
                  universeManifestUrl
                    ? scope.loadUniverseIndexes(
                      scope.versionedAssetUrl(scope.resolveUrl(universeManifestUrl, this.manifestUrl), this.assetVersionQuery),
                      { ...fetchTelemetry, assetVersionQuery: this.assetVersionQuery }
                    )
                    : Promise.resolve(null),
                ]);
                const runtime = scope.normalizeModelBackedRuntime(manifest, index, cardIndex, universe);
                const preparation = preparationBarrier ? await preparationBarrier : null;
                if (preparation && preparation.error) throw preparation.error;
                emitLoadProgress('indexes', 16, 'Embedding indexes ready', {
                  timing: 'end',
                  durationMs: scope.elapsedMsSince(indexesStarted),
                  primitiveDocuments: runtime.index && runtime.index.documentCount || 0,
                  surfaceCardDocuments: runtime.cardIndex && runtime.cardIndex.documentCount || 0,
                  universeDocuments: runtime.universe && runtime.universe.documentCount || 0,
                });
                const providerStarted = scope.nowMs();
                const providerOptions = {
                  ...options,
                  onProgress: progress,
                  traceEmbeddings: trace,
                };
                const provider = await this.resolveEmbedProvider(runtime, providerOptions);
                const probe = await scope.verifyPromptRuntimeProvider(runtime, provider, {
                  progress,
                  trace,
                  traceId: this.traceId,
                  nowIso: options.nowIso,
                });
                const rerankProvider = await this.resolveRerankProvider(runtime, provider, providerOptions);
                const rerankerProbe = await scope.verifyPromptRuntimeReranker(runtime, provider, {
                  progress,
                  trace,
                  traceId: this.traceId,
                  nowIso: options.nowIso,
                  rerankProvider,
                  dopplerModelHandle: options.dopplerModelHandle || this.dopplerModelHandle || scope.globalModelHandle(),
                });
                const receipt = scope.promptRuntimeReceipt(runtime, provider, {
                  durationMs: scope.elapsedMsSince(loadStarted),
                  firstLoad: true,
                  manifestUrl: this.manifestUrl,
                  providerLoadMs: scope.elapsedMsSince(providerStarted),
                  traceId: this.traceId,
                  probe,
                  rerankerProbe,
                  embeddingCache: this.embeddingCacheReceipt,
                  rerankerCache: this.rerankerCacheReceipt,
                  modelPreparation: this.dopplerModelPreparationReceipt,
                });
                runtime.promptRuntimeReranker = rerankerProbe;
                runtime.promptRuntimeReceipt = receipt;
                emitLoadProgress('runtime-ready', 96, 'Prompt runtime ready', scope.promptRuntimeReceiptProgress(receipt));
                return runtime;
              })
              .catch(async (error) => {
                await scope.releaseDopplerResources(this);
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
          if (!this.manifestPromise) {
            this.manifestPromise = this.loadManifestUncached().catch((error) => {
              this.manifestPromise = null;
              throw error;
            });
          }
          return this.manifestPromise;
        }

        async loadClassificationPolicy() {
          return scope.loadClassificationPolicy(this);
        }

        async loadManifestUncached() {
          return scope.loadIntentManifestUncached(this);
        }

        async rankPrompt(prompt, primitives, options = {}) {
          const promptText = String(prompt || '').trim();
          const progress = scope.progressHandler(options, this.onProgress);
          const trace = this.traceEnabled || scope.traceEnabled(options);
          const rankId = ++this.rankSerial;
          const rankStarted = scope.nowMs();
          if (!promptText) {
            return scope.blankResult(await this.loadModel(options));
          }
          scope.emitRuntimeProgress(progress, trace, {
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
          scope.emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'model',
            percent: 18,
            message: `Preparing local ${scope.modelLabel(runtime.manifest)}`,
            traceId: this.traceId,
            rankId,
            modelId: runtime.manifest && runtime.manifest.embedModel && runtime.manifest.embedModel.id || '',
            modelBaseUrl: runtime.manifest && runtime.manifest.embedModel && runtime.manifest.embedModel.defaultModelBaseUrl || '',
            candidateCount: candidates.length,
          });
          const providerStarted = scope.nowMs();
          const providerWasReady = this.providerReady;
          const provider = await this.resolveEmbedProvider(runtime, {
            ...options,
            onProgress: progress,
            traceEmbeddings: trace,
          });
          scope.emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'model-ready',
            percent: 80,
            message: 'Embedding provider ready',
            traceId: this.traceId,
            rankId,
            durationMs: scope.elapsedMsSince(providerStarted),
            backend: provider.backend || 'doppler-embedding',
            reuse: providerWasReady,
          });
          const embedStarted = scope.nowMs();
          scope.emitRuntimeProgress(progress, trace, {
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
          const queryVector = scope.validateQueryEmbedding(query, runtime.index);
          scope.emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'prompt-embed',
            percent: 84,
            message: 'Prompt embedding ready',
            timing: 'end',
            traceId: this.traceId,
            rankId,
            durationMs: scope.elapsedMsSince(embedStarted),
            backend: provider.backend || 'doppler-embedding',
            embeddingDim: queryVector.length,
          });
          const candidateVectors = scope.vectorsFor(runtime.index, candidates);
          await scope.ensureUniverseIndexes(runtime.universe, promptText, {
            queryPlan: options.queryPlan,
            telemetry: {
              progress,
              traceEnabled: trace,
              traceId: this.traceId,
              assetVersionQuery: this.assetVersionQuery,
            },
          });
          const rankVectorStarted = scope.nowMs();
          const gpuScores = await scope.rankWithOwnerGpu(this, runtime.index.embeddingDim, queryVector, candidateVectors);
          const scores = gpuScores || scope.rankCpu(queryVector, candidateVectors);
          const cardMatches = scope.rankSurfaceCards(runtime.cardIndex, queryVector, options);
          const universeMatches = scope.rankUniverseIndexes(runtime.universe, promptText, queryVector, options);
          scope.emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'rank',
            percent: 86,
            message: 'Primitive, surface, and universe scores ranked',
            traceId: this.traceId,
            rankId,
            durationMs: scope.elapsedMsSince(rankVectorStarted),
            rankBackend: gpuScores ? 'webgpu' : 'cpu',
            candidateCount: candidates.length,
            cardMatchCount: cardMatches.length,
            universeCandidateCount: universeMatches && universeMatches.candidates && universeMatches.candidates.length || 0,
          });
          const promptTermSet = new Set(scope.fallbackFeatureTokens(promptText));
          const nonRetrievableIds = new Set(candidates
            .filter((primitive) => primitive && primitive.isRetrievable === false)
            .map((primitive) => primitive.id));
          const basePriors = candidates
            .map((primitive, index) => {
              const prior = scope.primitivePriorFromScore(primitive, scores[index]);
              const symbolic = scope.symbolicPromptMatch(promptText, promptTermSet, primitive);
              return {
                ...prior,
                symbolicBoost: symbolic.score,
                matchedTerms: symbolic.terms,
              };
            })
            .filter((prior) => !nonRetrievableIds.has(prior.primitiveId))
            .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
          const languageEvidence = scope.spanLanguageEvidence(promptText, options);
          const boundedClassification = await boundedHeadClassifier.classify({
            state: this,
            promptText,
            languageEvidence,
            runtime,
            provider,
            sceneLanguageGraph: options.sceneLanguageGraph,
            classificationTierId: options.classificationTierId || null,
            calibration: options.classificationCalibration
              || runtime.promptRuntimeReceipt && runtime.promptRuntimeReceipt.classificationCalibration
              || null,
            validateEmbedding: (result) => scope.validateQueryEmbedding(result, runtime.index),
          });
          const activeRerankProvider = await this.resolveRerankProvider(runtime, provider, options);
          const previewRerank = scope.rerankPriors(basePriors, null, null, runtime, universeMatches);
          const previewSpanRetrieval = scope.emptySpanRetrieval([], scope.spanConfigFor(runtime, options, this.spanLevelEmbedding), 'prompt-preview');
          const previewEvidenceRows = scope.buildIntentEvidenceRows({
            basePriors,
            cardMatches,
            universeMatches,
            spanRetrieval: previewSpanRetrieval,
            semanticRag: null,
            dopplerIntent: null,
          });
          scope.emitIntentPreview(options, {
            model: scope.modelSummary(runtime, query, provider),
            backend: provider.backend || 'doppler-embedding',
            rankBackend: gpuScores ? 'webgpu' : 'cpu',
            priors: previewRerank.priors.slice(0, max),
            cardMatches,
            universeMatches,
            spanRetrieval: previewSpanRetrieval,
            rerank: previewRerank.receipt,
            semanticRag: null,
            dopplerIntent: null,
            evidenceRows: previewEvidenceRows,
            retrievalPhase: 'prompt-preview',
          });
          const spanRetrieval = await scope.rankPromptSpans({
            provider,
            runtime,
            candidates,
            candidateVectors,
            languageEvidence,
            options,
            embedCache: this.spanEmbeddingCache,
            instanceConfig: this.spanLevelEmbedding,
            rankGpu: (vector) => scope.rankWithOwnerGpu(this, runtime.index.embeddingDim, vector, candidateVectors),
            progress,
            traceEnabled: trace,
            traceId: this.traceId,
            rankId,
          });
          const slotRetrieval = await scope.rankQueryPlanSlots({
            provider,
            runtime,
            candidates,
            candidateVectors,
            promptVector: queryVector,
            queryPlan: options.queryPlan,
            promptText,
            options,
            rerankProvider: activeRerankProvider,
            rankGpu: (vector) => scope.rankWithOwnerGpu(this, runtime.index.embeddingDim, vector, candidateVectors),
            progress,
            traceEnabled: trace,
            traceId: this.traceId,
            rankId,
          });
          const fusedBasePriors = scope.fuseSpanPrimitiveScores(basePriors, spanRetrieval);
          const semanticRag = scope.createRag(promptText, candidates, fusedBasePriors, runtime.index, queryVector, options);
          const dopplerIntent = await scope.analyzeDopplerIntent(promptText, candidates, options);
          const rerank = await scope.rerankIntentPriors({
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
          const evidenceRows = scope.buildIntentEvidenceRows({
            basePriors: fusedBasePriors,
            cardMatches,
            universeMatches,
            spanRetrieval,
            slotRetrieval,
            semanticRag,
            dopplerIntent,
          });
          scope.emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'classification',
            percent: 96,
            message: 'Intent graph ranked',
            traceId: this.traceId,
            rankId,
            durationMs: scope.elapsedMsSince(rankStarted),
          });
          return {
            model: scope.modelSummary(runtime, query, provider),
            backend: provider.backend || 'doppler-embedding',
            rankBackend: gpuScores ? 'webgpu' : 'cpu',
            promptRuntimeReceipt: runtime.promptRuntimeReceipt || null,
            boundedClassification,
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
          const progress = scope.progressHandler(options, this.onProgress);
          const trace = this.traceEnabled || scope.traceEnabled(options);
          if (options.embedProvider) {
            const provider = scope.normalizeEmbedProvider(options.embedProvider, runtime, 'injected-provider');
            this.providerReady = true;
            scope.emitRuntimeProgress(progress, trace, {
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
            const provider = scope.normalizeEmbedProvider(this.embedProvider, runtime, 'configured-provider');
            this.providerReady = true;
            scope.emitRuntimeProgress(progress, trace, {
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
          const handle = options.dopplerModelHandle || this.dopplerModelHandle || scope.globalModelHandle();
          if (handle) {
            const provider = scope.providerFromModelHandle(handle, runtime, 'injected-doppler-model');
            this.providerReady = true;
            scope.emitRuntimeProgress(progress, trace, {
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
            scope.emitRuntimeProgress(progress, trace, {
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
          return scope.providerFromModelHandle(
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
            const started = scope.nowMs();
            const row = {
              status: 'active',
              durationMs: 0,
              reused: false,
            };
            if (this.dopplerModelPreparationReceipt) {
              this.dopplerModelPreparationReceipt.devicePreparation = row;
            }
            this.dopplerDevicePromise = scope.resolveDopplerDeviceApi({
              dopplerDeviceModule: options.dopplerDeviceModule || this.dopplerDeviceModule,
              deviceModuleUrl: runtimeConfig.deviceModuleUrl,
            }).then((deviceApi) => {
              if (!deviceApi || typeof deviceApi.initDevice !== 'function') {
                throw new Error('pinned Doppler device module does not export initDevice()');
              }
              return deviceApi.initDevice();
            }).then((device) => {
              row.status = 'ready';
              return device;
            }).catch((error) => {
              row.status = 'failed';
              row.error = error instanceof Error ? error.message : String(error);
              this.dopplerDevicePromise = null;
              throw error;
            }).finally(() => {
              row.durationMs = scope.elapsedMsSince(started);
            });
          } else if (
            this.dopplerModelPreparationReceipt &&
            !this.dopplerModelPreparationReceipt.devicePreparation
          ) {
            this.dopplerModelPreparationReceipt.devicePreparation = {
              status: 'ready',
              durationMs: 0,
              reused: true,
            };
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
          const progress = scope.progressHandler(options, this.onProgress);
          const trace = this.traceEnabled || scope.traceEnabled(options);
          const moduleUrl = runtime.manifest.runtime && runtime.manifest.runtime.moduleUrl;
          if (!moduleUrl) throw new Error('model runtime lock did not resolve a Doppler module URL');
          const moduleStarted = scope.nowMs();
          scope.emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'model-module',
            percent: 19,
            message: 'Loading Doppler browser runtime',
            timing: 'start',
            traceId: this.traceId,
            moduleUrl,
          });
          const api = await (this.dopplerApiPromise || scope.resolveDopplerApi({
            dopplerModule: options.dopplerModule || this.dopplerModule,
            moduleUrl,
            kernelBasePath: runtime.manifest.runtime && runtime.manifest.runtime.kernelBasePath,
          }));
          scope.emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'model-module',
            percent: 20,
            message: 'Doppler browser runtime ready',
            timing: 'end',
            traceId: this.traceId,
            durationMs: scope.elapsedMsSince(moduleStarted),
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
          const runtimeConfig = scope.cloneJsonValue(runtime.manifest.runtime && runtime.manifest.runtime.runtimeConfig);
          if (!runtimeConfig) {
            throw new Error('model-backed intent manifest missing Doppler runtimeConfig');
          }
          await this.ensureDopplerDevice(runtime, options);
          const cachedSource = scope.preparedDopplerModelSource(this, 'embedding');
          const dopplerStarted = scope.nowMs();
          scope.emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'model-load',
            percent: scope.EMBEDDING_LOAD_PROGRESS.start,
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
              scope.emitRuntimeProgress(progress, trace, scope.normalizeDopplerProgress(event, {
                traceId: this.traceId,
                modelBaseUrl,
                modelId: model.id || '',
                startedAtMs: dopplerStarted,
                progressStart: scope.EMBEDDING_LOAD_PROGRESS.start,
                progressEnd: scope.EMBEDDING_LOAD_PROGRESS.end,
                stagePrefix: 'model-load',
                resourceKind: 'embedding-model',
              }));
              if (typeof options.onModelProgress === 'function') options.onModelProgress(event);
            },
          };
          let handle;
          try {
            handle = await scope.scheduleDopplerModelLoad(
              this, 'embedding', model.id, () => load(cachedSource.modelSource, loadOptions)
            );
            scope.assertPinnedModelHandle(handle, model, 'embedding', modelBaseUrl);
          } catch (error) {
            await scope.disposeFailedDopplerLoad(handle, cachedSource);
            throw error;
          }
          this.activeDopplerModelRole = 'embedding';
          this.dopplerEmbedHandle = handle;
          this.dopplerEmbedModelBaseUrl = modelBaseUrl;
          scope.emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'model-ready',
            percent: scope.EMBEDDING_LOAD_PROGRESS.end,
            message: 'Doppler embedding model ready',
            timing: 'end',
            traceId: this.traceId,
            durationMs: scope.elapsedMsSince(dopplerStarted),
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
          const config = scope.rerankerConfig(runtime);
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
            !scope.globalModelHandle();
        }

        async resolveRerankProvider(runtime, provider, options = {}) {
          const explicit = options.rerankProvider || options.rerankerProvider;
          if (explicit) {
            this.rerankProvider = scope.normalizeRerankProvider(explicit, 'injected-rerank-provider');
            this.rerankerReady = true;
            return this.rerankProvider;
          }
          if (this.rerankProvider) {
            this.rerankerReady = true;
            return this.rerankProvider;
          }
          const providerCapability = scope.resolveRerankerCapability(provider, {});
          if (providerCapability) {
            this.rerankProvider = {
              backend: providerCapability.backend,
              rerank: providerCapability.rerank,
            };
            this.rerankerReady = true;
            return this.rerankProvider;
          }
          const config = scope.rerankerConfig(runtime);
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
                if (scope.rerankerRequired(runtime)) throw error;
                return null;
              });
          }
          return this.rerankerProviderPromise;
        }

        async loadDopplerRerankerModel(runtime, options = {}) {
          const config = scope.rerankerConfig(runtime);
          const model = config.model || {};
          const progress = scope.progressHandler(options, this.onProgress);
          const trace = this.traceEnabled || scope.traceEnabled(options);
          const moduleUrl = runtime.manifest.runtime && runtime.manifest.runtime.moduleUrl;
          if (!moduleUrl) throw new Error('model runtime lock did not resolve a Doppler module URL');
          const api = await (this.dopplerApiPromise || scope.resolveDopplerApi({
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
          const cachedSource = scope.preparedDopplerModelSource(this, 'reranker');
          const started = scope.nowMs();
          scope.emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'reranker-load',
            percent: scope.RERANKER_LOAD_PROGRESS.start,
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
              scope.emitRuntimeProgress(progress, trace, scope.normalizeDopplerProgress(event, {
                traceId: this.traceId,
                modelBaseUrl,
                modelId: model.id || '',
                startedAtMs: started,
                progressStart: scope.RERANKER_LOAD_PROGRESS.start,
                progressEnd: scope.RERANKER_LOAD_PROGRESS.end,
                stagePrefix: 'reranker-load',
                resourceKind: 'reranker-model',
              }));
            },
          };
          if (config.runtimeConfig) loadOptions.runtimeConfig = scope.cloneJsonValue(config.runtimeConfig);
          let handle;
          try {
            handle = await scope.scheduleDopplerModelLoad(
              this, 'reranker', model.id, () => load(cachedSource.modelSource, loadOptions)
            );
            scope.assertPinnedModelHandle(handle, model, 'reranker', modelBaseUrl);
          } catch (error) {
            await scope.disposeFailedDopplerLoad(handle, cachedSource);
            throw error;
          }
          this.activeDopplerModelRole = 'reranker';
          this.dopplerRerankerHandle = handle;
          this.dopplerRerankerModelBaseUrl = modelBaseUrl;
          scope.emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: 'reranker-ready',
            percent: scope.RERANKER_LOAD_PROGRESS.end,
            message: 'Doppler reranker ready',
            timing: 'end',
            traceId: this.traceId,
            durationMs: scope.elapsedMsSince(started),
            reranker: config.id,
            modelId: model.id || '',
            modelBaseUrl,
            artifactMode: 'verified-opfs',
            cachePrefetch: true,
            cacheMode: 'opfs',
          });
          return this.createDopplerRerankerProvider(runtime, config, options, handle, modelBaseUrl);
        }

        createDopplerRerankerProvider(runtime, config, options, handle, modelBaseUrl) {
          return scope.managedRerankProvider(this, runtime, config, options, handle, modelBaseUrl);
        }
      }

    root.SimulattePhaseModuleRegistry.define('intentEmbedder', 'simulatte-intent-embedder-manifest-cache.js', {
      ModelBackedIntentEmbedder,
    });

})(typeof globalThis !== 'undefined' ? globalThis : window);
