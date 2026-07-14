(function attachSimulatteIntentEmbedderrerank(root) {
  const scope = root.__SimulatteIntentEmbedderRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function cloneJsonValue(value) {
        if (value == null) return null;
        return JSON.parse(JSON.stringify(value));
      }

    async function resolveDopplerApi(options = {}) {
        ensureDopplerKernelBasePath(options.kernelBasePath);
        const direct = options.dopplerModule || null;
        if (direct) return direct;
        const rawModuleUrl = options.moduleUrl;
        if (!rawModuleUrl) throw new Error('model runtime lock did not provide a Doppler module URL');
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
        const rawPath = rawKernelBasePath;
        if (!rawPath) throw new Error('model runtime lock did not provide a Doppler kernel base path');
        const resolvedPath = typeof location === 'undefined'
          ? rawPath
          : resolveUrl(rawPath, location.href);
        const existing = globalThis.__DOPPLER_KERNEL_BASE_PATH__;
        if (typeof existing === 'string' && existing.trim()) {
          if (existing.replace(/\/+$/, '') !== resolvedPath.replace(/\/+$/, '')) {
            throw new Error('Doppler kernel base path differs from the model runtime lock');
          }
          return;
        }
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

    async function verifyPromptRuntimeProvider(runtime, provider, options = {}) {
        const started = nowMs();
        const probes = PROMPT_RUNTIME_PROBES;
        emitRuntimeProgress(options.progress || null, Boolean(options.trace), {
          source: 'simulatte-intent-embedder',
          stage: 'model-probe',
          percent: 94,
          message: 'Verifying embedding provider',
          timing: 'start',
          traceId: options.traceId || '',
          backend: provider && provider.backend || '',
          modelId: runtime.index && runtime.index.embedModelId || '',
          probeCount: probes.length,
        });
        const rows = [];
        for (let i = 0; i < probes.length; i += 1) {
          const probe = probes[i];
          const result = await provider.embed({
            text: probe.text,
            nowIso: options.nowIso || new Date().toISOString(),
          });
          const vector = validateQueryEmbedding(result, runtime.index);
          rows.push({
            id: probe.id,
            text: probe.text,
            embeddingDim: vector.length,
            vector,
            hash: embeddingVectorHash(vector),
          });
          emitRuntimeProgress(options.progress || null, Boolean(options.trace), {
            source: 'simulatte-intent-embedder',
            stage: 'model-probe',
            percent: 94 + (i + 1) / Math.max(1, probes.length) * 0.6,
            message: `Embedding probe ${i + 1}/${probes.length} verified`,
            traceId: options.traceId || '',
            backend: provider && provider.backend || '',
            modelId: runtime.index && runtime.index.embedModelId || '',
            embeddingDim: vector.length,
            probeId: probe.id,
          });
        }
        const repeatResult = await provider.embed({
          text: probes[0].text,
          nowIso: options.nowIso || new Date().toISOString(),
        });
        const repeatVector = validateQueryEmbedding(repeatResult, runtime.index);
        const stabilitySimilarity = unclampedDot(rows[0].vector, repeatVector);
        if (stabilitySimilarity < PROMPT_RUNTIME_STABILITY_THRESHOLD) {
          throw new Error(`prompt runtime embedding probe is unstable (${stabilitySimilarity.toFixed(6)} < ${PROMPT_RUNTIME_STABILITY_THRESHOLD})`);
        }
        const diversity = promptRuntimeProbeDiversity(rows.map((row) => row.vector));
        if (diversity.maxSimilarity > PROMPT_RUNTIME_DIVERSITY_THRESHOLD) {
          throw new Error(`prompt runtime embedding provider returned degenerate probe embeddings (${diversity.maxSimilarity.toFixed(6)} > ${PROMPT_RUNTIME_DIVERSITY_THRESHOLD})`);
        }
        const probe = {
          ok: true,
          durationMs: elapsedMsSince(started),
          embeddingDim: rows[0] ? rows[0].embeddingDim : runtime.index.embeddingDim,
          probeCount: rows.length,
          probeIds: rows.map((row) => row.id),
          probeHashes: rows.map((row) => row.hash),
          repeatedProbeId: probes[0] && probes[0].id || '',
          stabilitySimilarity: Number(stabilitySimilarity.toFixed(6)),
          stabilityThreshold: PROMPT_RUNTIME_STABILITY_THRESHOLD,
          maxDistinctProbeSimilarity: Number(diversity.maxSimilarity.toFixed(6)),
          diversityThreshold: PROMPT_RUNTIME_DIVERSITY_THRESHOLD,
          distinctProbePairs: diversity.pairCount,
        };
        emitRuntimeProgress(options.progress || null, Boolean(options.trace), {
          source: 'simulatte-intent-embedder',
          stage: 'model-probe',
          percent: 95,
          message: 'Embedding provider verified',
          timing: 'end',
          traceId: options.traceId || '',
          backend: provider && provider.backend || '',
          providerReady: true,
          modelId: runtime.index && runtime.index.embedModelId || '',
          embeddingDim: probe.embeddingDim,
          probeCount: probe.probeCount,
          stabilitySimilarity: probe.stabilitySimilarity,
          maxDistinctProbeSimilarity: probe.maxDistinctProbeSimilarity,
          durationMs: probe.durationMs,
        });
        return probe;
      }

    async function verifyPromptRuntimeReranker(runtime, provider, options = {}) {
        const config = rerankerConfig(runtime);
        const required = rerankerRequired(runtime);
        const capability = resolveRerankerCapability(provider, options);
        const base = {
          schema: 'simulatte.promptRuntimeRerankerReceipt.v1',
          phase: 1,
          phaseId: 'prompt-runtime',
          rerankerPhase: 3,
          id: config.id,
          kind: config.kind,
          enabled: config.enabled === true,
          required,
          ready: false,
          backend: capability ? capability.backend : '',
          inputSchema: config.inputSchema,
          outputSchema: config.outputSchema,
          fallbackMode: config.fallbackMode,
          probeCount: 0,
          probeCandidateCount: 0,
          probeOutputCount: 0,
        };
        if (!config.enabled) {
          return { ...base, status: 'disabled' };
        }
        if (!required) {
          return {
            ...base,
            status: capability ? 'available-unprobed' : 'not-required',
          };
        }
        if (!capability) {
          throw new Error(`intent manifest requires Doppler reranker ${config.id}, but no rerank capability is available`);
        }
        const started = nowMs();
        emitRuntimeProgress(options.progress || null, Boolean(options.trace), {
          source: 'simulatte-intent-embedder',
          stage: 'model-rerank-probe',
          percent: 95.2,
          message: 'Verifying Doppler reranker',
          timing: 'start',
          traceId: options.traceId || '',
          backend: capability.backend,
          reranker: config.id,
          rerankerPhase: 3,
        });
        const input = rerankerProbeInput(options.nowIso);
        const result = await capability.rerank(input);
        const rows = normalizeRerankerRows(result);
        if (!rows.length) {
          throw new Error(`intent manifest requires Doppler reranker ${config.id}, but the probe returned no ranked candidates`);
        }
        emitRuntimeProgress(options.progress || null, Boolean(options.trace), {
          source: 'simulatte-intent-embedder',
          stage: 'model-rerank-probe',
          percent: 95.8,
          message: 'Doppler reranker verified',
          timing: 'end',
          traceId: options.traceId || '',
          backend: capability.backend,
          reranker: config.id,
          rerankerPhase: 3,
          durationMs: elapsedMsSince(started),
          probeCandidateCount: input.candidates.length,
          probeOutputCount: rows.length,
        });
        return {
          ...base,
          ready: true,
          status: 'ready',
          durationMs: elapsedMsSince(started),
          probeCount: 1,
          probeCandidateCount: input.candidates.length,
          probeOutputCount: rows.length,
        };
      }

    function rerankerProbeInput(nowIso) {
        return {
          schema: 'simulatte.intentRerankInput.v1',
          phase: 3,
          phaseId: 'retrieval',
          stage: 'phase1-reranker-probe',
          prompt: 'optics detector water biological agents reranker probe',
          nowIso: nowIso || new Date().toISOString(),
          candidates: [
            { primitiveId: 'sensor-array', score: 0.92, modelScore: 0.92, layer: 'component', type: 'detector' },
          ],
          context: {
            semanticRag: [],
            dopplerIntent: [],
            universeMatches: [],
          },
          max: 3,
        };
      }

    function resolveRerankerCapability(provider, options = {}) {
        const direct = options.rerankProvider || options.rerankerProvider;
        const directBackend = direct && direct.backend || 'injected-rerank-provider';
        const globalReranker = typeof globalThis !== 'undefined'
          ? globalThis.SimulatteDopplerReranker || globalThis.DopplerReranker || null
          : null;
        const candidates = [
          { backend: directBackend, target: direct },
          { backend: provider && provider.backend || 'embedding-provider', target: provider },
          { backend: 'injected-doppler-model', target: options.dopplerModelHandle },
          { backend: 'injected-doppler-model-advanced', target: options.dopplerModelHandle && options.dopplerModelHandle.advanced },
          { backend: 'global-doppler-reranker', target: globalReranker },
        ];
        for (const candidate of candidates) {
          const rerank = rerankFunctionForTarget(candidate.target);
          if (rerank) {
            return {
              backend: candidate.backend,
              rerank,
            };
          }
        }
        return null;
      }

    function promptRuntimeProbeDiversity(vectors) {
        let maxSimilarity = 0;
        let pairCount = 0;
        for (let i = 0; i < vectors.length; i += 1) {
          for (let j = i + 1; j < vectors.length; j += 1) {
            maxSimilarity = Math.max(maxSimilarity, unclampedDot(vectors[i], vectors[j]));
            pairCount += 1;
          }
        }
        return { maxSimilarity, pairCount };
      }

    function unclampedDot(a, b) {
        let score = 0;
        for (let i = 0; i < Math.min(a && a.length || 0, b && b.length || 0); i += 1) {
          score += a[i] * b[i];
        }
        return score;
      }

    function embeddingVectorHash(vector) {
        let hash = 2166136261;
        for (let i = 0; i < vector.length; i += 1) {
          const value = Math.round(Number(vector[i] || 0) * 1000000);
          hash ^= value & 0xff;
          hash = Math.imul(hash, 16777619);
          hash ^= value >>> 8 & 0xff;
          hash = Math.imul(hash, 16777619);
          hash ^= value >>> 16 & 0xff;
          hash = Math.imul(hash, 16777619);
          hash ^= value >>> 24 & 0xff;
          hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
      }

    function promptRuntimeReceipt(runtime, provider, details = {}) {
        const manifest = runtime.manifest || {};
        const embedModel = manifest.embedModel || {};
        const probe = details.probe || {};
        const rerankerProbe = details.rerankerProbe || {};
        const reranker = rerankerConfig(runtime);
        const embeddingCache = details.embeddingCache || null;
        const rerankerCache = details.rerankerCache || null;
        const cacheReceipts = [embeddingCache, rerankerCache].filter(Boolean);
        const cacheModes = [...new Set(cacheReceipts.map((receipt) => receipt.mode).filter(Boolean))];
        const cacheOwners = [...new Set(cacheReceipts.map((receipt) => receipt.owner).filter(Boolean))];
        return {
          schema: 'simulatte.promptRuntimeReceipt.v1',
          phase: 1,
          phaseId: 'prompt-runtime',
          ready: true,
          noFallback: true,
          providerReady: true,
          providerBackend: provider && provider.backend || '',
          manifestId: manifest.id || '',
          manifestUrl: details.manifestUrl || '',
          modelRuntimeLock: {
            id: manifest.modelRuntimeLock && manifest.modelRuntimeLock.id || '',
            number: Number(manifest.modelRuntimeLock && manifest.modelRuntimeLock.number || 0),
            artifactHash: hashHex(manifest.modelRuntimeLock && manifest.modelRuntimeLock.artifactHash),
          },
          modelId: runtime.index && runtime.index.embedModelId || embedModel.id || '',
          modelBaseUrl: embedModel.defaultModelBaseUrl || '',
          modelHash: hashHex(embedModel.manifestHash) || hashHex(runtime.index && runtime.index.embedModelHash),
          embeddingDim: runtime.index && runtime.index.embeddingDim || probe.embeddingDim || 0,
          primitiveIndexId: runtime.index && runtime.index.id || '',
          primitiveIndexHash: runtime.index && runtime.index.indexHash || '',
          primitiveDocuments: runtime.index && runtime.index.documentCount || 0,
          surfaceCardIndexId: runtime.cardIndex ? runtime.cardIndex.id : '',
          surfaceCardIndexHash: runtime.cardIndex ? runtime.cardIndex.indexHash : '',
          surfaceCardDocuments: runtime.cardIndex ? runtime.cardIndex.documentCount : 0,
          universeIndexId: runtime.universe ? runtime.universe.id : '',
          universeDocuments: runtime.universe ? runtime.universe.documentCount : 0,
          reranker: reranker.id,
          rerankerModelId: reranker.model && reranker.model.id || '',
          rerankerModelHash: hashHex(reranker.model && reranker.model.manifestHash),
          rerankerKind: reranker.kind,
          rerankerPhase: 3,
          rerankerRequired: rerankerProbe.required === true,
          rerankerReady: rerankerProbe.ready === true,
          rerankerStatus: rerankerProbe.status || '',
          rerankerBackend: rerankerProbe.backend || '',
          rerankerInputSchema: reranker.inputSchema,
          rerankerOutputSchema: reranker.outputSchema,
          rerankerFallbackMode: reranker.fallbackMode,
          rerankerProbeCount: rerankerProbe.probeCount || 0,
          rerankerProbeCandidateCount: rerankerProbe.probeCandidateCount || 0,
          rerankerProbeOutputCount: rerankerProbe.probeOutputCount || 0,
          cachePrefetch: cacheReceipts.some((receipt) => receipt.prefetched === true),
          cacheMode: cacheModes.join(',') || 'external-provider',
          cacheOwner: cacheOwners.join(',') || 'external',
          cacheState: cacheReceipts.map((receipt) => receipt.state).filter(Boolean).join(','),
          cacheBackends: cacheReceipts.length ? ['Doppler', 'OPFS'] : [],
          cacheVerified: cacheReceipts.length > 0 && cacheReceipts.every((receipt) => receipt.verified === true),
          embeddingCacheState: embeddingCache && embeddingCache.state || '',
          rerankerCacheState: rerankerCache && rerankerCache.state || '',
          cachedModelBytes: cacheReceipts.reduce((sum, receipt) => sum + Number(receipt.totalBytes || 0), 0),
          modelPreparation: details.modelPreparation || null,
          embeddingProbe: probe.ok === true,
          probeEmbeddingDim: probe.embeddingDim || 0,
          probeCount: probe.probeCount || 0,
          probeIds: probe.probeIds || [],
          probeHashes: probe.probeHashes || [],
          repeatedProbeId: probe.repeatedProbeId || '',
          stabilitySimilarity: probe.stabilitySimilarity || 0,
          stabilityThreshold: probe.stabilityThreshold || PROMPT_RUNTIME_STABILITY_THRESHOLD,
          maxDistinctProbeSimilarity: probe.maxDistinctProbeSimilarity || 0,
          diversityThreshold: probe.diversityThreshold || PROMPT_RUNTIME_DIVERSITY_THRESHOLD,
          distinctProbePairs: probe.distinctProbePairs || 0,
          durationMs: Number(details.durationMs || 0),
          providerLoadMs: Number(details.providerLoadMs || 0),
          probeMs: Number(probe.durationMs || 0),
          firstLoad: details.firstLoad === true,
          traceId: details.traceId || '',
          timestamp: new Date().toISOString(),
        };
      }

    function promptRuntimeReceiptProgress(receipt) {
        return {
          promptRuntimeReceipt: receipt,
          providerReady: receipt.providerReady === true,
          noFallback: receipt.noFallback === true,
          backend: receipt.providerBackend || '',
          modelId: receipt.modelId || '',
          modelBaseUrl: receipt.modelBaseUrl || '',
          embeddingDim: receipt.embeddingDim || 0,
          primitiveDocuments: receipt.primitiveDocuments || 0,
          surfaceCardDocuments: receipt.surfaceCardDocuments || 0,
          universeDocuments: receipt.universeDocuments || 0,
          indexId: receipt.primitiveIndexId || '',
          indexHash: receipt.primitiveIndexHash || '',
          manifestId: receipt.manifestId || '',
          manifestUrl: receipt.manifestUrl || '',
          modelHash: receipt.modelHash || '',
          probeCount: receipt.probeCount || 0,
          stabilitySimilarity: receipt.stabilitySimilarity || 0,
          maxDistinctProbeSimilarity: receipt.maxDistinctProbeSimilarity || 0,
          reranker: receipt.reranker || '',
          rerankerRequired: receipt.rerankerRequired === true,
          rerankerReady: receipt.rerankerReady === true,
          rerankerStatus: receipt.rerankerStatus || '',
          rerankerPhase: receipt.rerankerPhase || 3,
          durationMs: receipt.durationMs || 0,
        };
      }

    function modelSummary(runtime, query, provider) {
        const reranker = rerankerConfig(runtime);
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
          reranker: reranker.id,
          rerankerKind: reranker.kind,
          rerankerPhase: 3,
          rerankerRequired: reranker.required === true,
          rerankerFallbackMode: reranker.fallbackMode,
          backend: provider && provider.backend || '',
        };
      }

    function blankResult(runtime) {
        const reranker = rerankerConfig(runtime);
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
            reranker: reranker.id,
            rerankerKind: reranker.kind,
            rerankerPhase: 3,
            rerankerRequired: reranker.required === true,
            rerankerFallbackMode: reranker.fallbackMode,
          },
          backend: 'blank',
          rankBackend: 'none',
          promptRuntimeReceipt: runtime.promptRuntimeReceipt || null,
          priors: [],
          cardMatches: [],
          universeMatches: rankUniverseIndexes(runtime.universe, '', null, {}),
          rerank: {
            schema: 'simulatte.intentRerank.v1',
            phase: 3,
            phaseId: 'retrieval',
            stage: 'blank',
            required: true,
            model: reranker.id,
            rerankerKind: reranker.kind,
            rerankerPhase: 3,
            rerankerMode: 'heuristic-fusion',
            modelRequired: rerankerRequired(runtime),
            modelReady: false,
            modelStatus: 'blank',
            fallbackMode: reranker.fallbackMode,
            candidateInputCount: 0,
            candidateOutputCount: 0,
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
          role: primitive.role || '',
          candidateText: primitive.text || primitive.role || primitive.id,
        };
      }

    function createRag(prompt, candidates, priors, primitiveIndex, promptVector, options = {}) {
        const ragApi = typeof globalThis !== 'undefined' ? globalThis.SimulatteSemanticRag : null;
        if (!ragApi || typeof ragApi.createSemanticRag !== 'function') return null;
        return ragApi.createSemanticRag(prompt, candidates, {
          modelPriors: priors,
          primitiveIndex,
          promptVector,
          typedSpans: options.sceneLanguageGraph && options.sceneLanguageGraph.spans || [],
          suppressObservableOpenComponents: Boolean(options.sceneLanguageGraph &&
            (options.sceneLanguageGraph.actions || []).some((row) => row.semanticClass === 'measurement')),
          maxDocuments: 72,
          maxOpenComponents: 12,
        });
      }

    async function analyzeDopplerIntent(prompt, candidates, options) {
        const api = typeof globalThis !== 'undefined' ? globalThis.SimulatteDopplerIntent : null;
        if (!api || typeof api.analyzePrompt !== 'function') return null;
        return api.analyzePrompt(prompt, candidates, options);
      }

    async function rerankIntentPriors({
        priors,
        semanticRag,
        dopplerIntent,
        slotRetrieval,
        runtime,
        universeMatches,
        provider,
        rerankProvider,
        promptText,
        phaseLabel,
        progress,
        trace,
        traceId,
        rankId,
      }) {
        const local = rerankPriors(priors, semanticRag, dopplerIntent, runtime, universeMatches);
        const config = rerankerConfig(runtime);
        const capability = resolveRerankerCapability(provider, {
          rerankProvider,
          dopplerModelHandle: null,
        });
        const required = rerankerRequired(runtime);
        if (!config.enabled || !capability) {
          if (required) {
            throw new Error(`intent manifest requires Doppler reranker ${config.id}, but no rerank capability is available`);
          }
          return {
            priors: local.priors,
            receipt: {
              ...local.receipt,
              stage: phaseLabel || local.receipt.stage,
              rerankerMode: 'heuristic-fusion',
              modelReady: false,
              modelBackend: '',
              modelRequired: required,
              modelStatus: config.enabled ? 'not-available' : 'disabled',
            },
          };
        }
        try {
          const input = buildRerankInput({
            promptText,
            priors: local.priors,
            semanticRag,
            dopplerIntent,
            slotRetrieval,
            universeMatches,
            runtime,
            phaseLabel,
          });
          if (typeof progress === 'function') {
            input.onProgress = (row = {}) => emitRuntimeProgress(progress, trace === true, {
              source: 'simulatte-intent-embedder',
              stage: 'model-rerank',
              percent: 95.6,
              message: row.scoreCacheHit === true
                ? `Reusing reranker score ${row.completed || 0}/${row.total || 0}`
                : `Reranking candidate ${row.completed || 0}/${row.total || 0}`,
              traceId: traceId || '',
              rankId: rankId || 0,
              candidateId: row.candidateId || '',
              completed: row.completed || 0,
              total: row.total || 0,
              candidateCount: row.total || 0,
              scoreCacheHit: row.scoreCacheHit === true,
              promptTokenCount: row.promptTokenCount || 0,
              prefixTokenCount: row.prefixTokenCount || 0,
              prefixStateReused: row.prefixStateReused === true,
              prefixPreparationDurationMs: row.prefixPreparationDurationMs || 0,
              prefixTokenizationDurationMs: row.prefixTokenizationDurationMs || 0,
              prefixResetDurationMs: row.prefixResetDurationMs || 0,
              prefixPrimingDurationMs: row.prefixPrimingDurationMs || 0,
              executionDurationMs: row.executionDurationMs || 0,
            });
            input.onProgress({ completed: 0, total: input.candidates.length });
          }
          const result = await capability.rerank(input);
          const modelRows = normalizeRerankerRows(result);
          if (!modelRows.length) {
            throw new Error(`Doppler reranker ${config.id} returned no ranked candidates`);
          }
          const rows = applyModelRerank(local.priors, modelRows, input.candidates);
          return {
            priors: rows,
            receipt: {
              ...local.receipt,
              stage: phaseLabel || local.receipt.stage,
              model: config.id,
              rerankerModelId: config.model && config.model.id || '',
              rerankerModelHash: hashHex(config.model && config.model.manifestHash),
              rerankerKind: config.kind,
              rerankerMode: 'doppler-reranker',
              modelReady: true,
              modelRequired: required,
              modelStatus: 'ready',
              modelBackend: capability.backend,
              modelCandidateInputCount: input.candidates.length,
              modelCandidateOutputCount: modelRows.length,
              candidateSelectionMode: input.selection.mode,
              candidateBudgetPolicy: input.selection.candidateBudgetPolicy,
              evidenceCandidateCount: input.selection.evidenceCandidateCount,
              evidenceGroupCount: input.selection.evidenceGroupCount,
              adaptiveCandidateBudget: input.selection.candidateBudget,
              modelCandidateInputs: input.candidates.map((row) => ({
                primitiveId: row.primitiveId,
                order: row.order,
                layer: row.layer,
                localScore: row.score,
                lexicalScore: row.lexicalScore,
              })),
              modelCandidateOutputs: modelRows.map((row) => ({
                primitiveId: row.primitiveId,
                rank: row.rank,
                score: row.score,
                scoringPath: row.scoringPath,
                executionDurationMs: row.executionDurationMs,
              })),
              ...rerankExecutionSummary(modelRows),
              top: rows.slice(0, 12).map((row) => row.primitiveId),
            },
          };
        } catch (err) {
          if (required) throw err;
          return {
            priors: local.priors,
            receipt: {
              ...local.receipt,
              stage: phaseLabel || local.receipt.stage,
              rerankerMode: 'heuristic-fusion',
              modelReady: false,
              modelRequired: false,
              modelStatus: 'fallback',
              modelBackend: capability.backend,
              fallbackReason: err && err.message ? err.message : String(err),
            },
          };
        }
      }

    function buildRerankInput({
        promptText,
        priors,
        semanticRag,
        dopplerIntent,
        slotRetrieval,
        universeMatches,
        runtime,
        phaseLabel,
      }) {
        const config = rerankerConfig(runtime);
        const limit = config.maxCandidatesPerCall;
        const selection = selectEvidenceBackedRerankPriors(priors, slotRetrieval, limit);
        const selectedPriors = selection.priors;
        return {
          schema: 'simulatte.intentRerankInput.v1',
          phase: 3,
          phaseId: 'retrieval',
          stage: phaseLabel || 'span-refined',
          reranker: rerankerId(runtime),
          selection: {
            mode: selection.mode,
            candidateBudgetPolicy: selection.candidateBudgetPolicy,
            evidenceCandidateCount: selection.evidenceCandidateCount,
            evidenceGroupCount: selection.evidenceGroupCount,
            candidateBudget: selection.candidateBudget,
          },
          prompt: String(promptText || ''),
          candidates: selectedPriors.map((prior, order) => ({
            primitiveId: prior.primitiveId,
            order,
            layer: prior.layer || prior.rawLayer || '',
            type: prior.type || '',
            domains: prior.domains || [],
            score: Number(prior.score || 0),
            modelScore: Number(prior.modelScore || 0),
            ragScore: Number(prior.ragScore || 0),
            symbolicBoost: Number(prior.symbolicBoost || 0),
            dopplerScore: Number(prior.dopplerScore || 0),
            universeScore: Number(prior.universeScore || 0),
            lexicalScore: Number(prior.lexicalScore || 0),
            matchedTerms: prior.matchedTerms || [],
            candidateText: prior.candidateText || '',
          })),
          context: {
            semanticRag: (semanticRag && semanticRag.retrieved || []).slice(0, 48).map((doc) => ({
              primitiveId: doc.primitiveId,
              score: Number(doc.score || 0),
              matchedTerms: doc.matchedTerms || [],
            })),
            dopplerIntent: (dopplerIntent && dopplerIntent.primitives || []).slice(0, 48).map((hint) => ({
              primitiveId: hint.primitiveId,
              score: Number(hint.score || 0),
              reason: hint.reason || '',
            })),
            universeMatches: (universeMatches && universeMatches.candidates || []).slice(0, 48).map((candidate) => ({
              id: candidate.id,
              indexName: candidate.indexName,
              label: candidate.label,
              score: Number(candidate.score || 0),
              primitiveHints: candidate.primitiveHints || [],
            })),
          },
          max: Math.max(1, selectedPriors.length),
        };
      }

    function selectEvidenceBackedRerankPriors(priors = [], slotRetrieval = null, limit = 0) {
      const maximum = Math.max(0, Number(limit || 0));
      const byId = new Map(priors.map((row) => [row.primitiveId, row]));
      const groups = (slotRetrieval && slotRetrieval.bySlot || []).map((slot) => uniqueStrings(
        (slot.constructionCandidates || []).flatMap((candidate) => (
          candidate.construction && candidate.construction.primitiveHints || []
        ))
      ).filter((id) => byId.has(id))).filter((group) => group.length);
      const candidateBudget = groups.length
        ? Math.min(maximum, Math.max(2, groups.length))
        : maximum;
      const evidenceIds = [];
      const seen = new Set();
      const depth = Math.max(0, ...groups.map((group) => group.length));
      for (let index = 0; index < depth && evidenceIds.length < candidateBudget; index += 1) {
        for (const group of groups) {
          const id = group[index];
          if (!id || seen.has(id)) continue;
          seen.add(id);
          evidenceIds.push(id);
          if (evidenceIds.length >= candidateBudget) break;
        }
      }
      const selected = evidenceIds.map((id) => byId.get(id));
      for (const prior of priors) {
        if (selected.length >= candidateBudget) break;
        if (seen.has(prior.primitiveId)) continue;
        seen.add(prior.primitiveId);
        selected.push(prior);
      }
      return {
        priors: selected,
        mode: evidenceIds.length ? 'construction-evidence-round-robin' : 'local-score-top-k',
        candidateBudgetPolicy: evidenceIds.length
          ? 'one-per-construction-group-minimum-two'
          : 'model-lock-decision-frontier',
        evidenceCandidateCount: evidenceIds.length,
        evidenceGroupCount: groups.length,
        candidateBudget,
      };
    }

    Object.assign(scope, {
      cloneJsonValue,
      resolveDopplerApi,
      ensureDopplerKernelBasePath,
      globalDopplerApi,
      globalModelHandle,
      verifyPromptRuntimeProvider,
      verifyPromptRuntimeReranker,
      rerankerProbeInput,
      resolveRerankerCapability,
      promptRuntimeProbeDiversity,
      unclampedDot,
      embeddingVectorHash,
      promptRuntimeReceipt,
      promptRuntimeReceiptProgress,
      modelSummary,
      blankResult,
      primitivePriorFromScore,
      createRag,
      analyzeDopplerIntent,
      rerankIntentPriors,
      buildRerankInput,
      selectEvidenceBackedRerankPriors,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
