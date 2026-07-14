(function attachNeuralPlaceResolver(root, factory) {
  const core = typeof module === 'object' && module.exports
    ? require('./neural-place-resolution-core.js')
    : root.SimulatteNeuralPlaceResolutionCore;
  const receipts = typeof module === 'object' && module.exports
    ? require('./canonical-receipts.js')
    : root.SimulatteAutonomyReceipts;
  const runtimeLog = typeof module === 'object' && module.exports
    ? require('./runtime-log.js')
    : root.SimulatteAutonomyRuntimeLog;
  const api = factory(root, core, receipts, runtimeLog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteNeuralPlaceResolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createNeuralPlaceResolverModule(root, core, receipts, runtimeLog) {
  function createPlaceResolver({ index, modelLock, dopplerModule = null, modelHandle = null, modelBaseUrl = '', onProgress = null }) {
    let decodedIndex = null;
    let handle = modelHandle;
    let state = 'idle';
    let initialization = null;
    let lastFailure = null;
    const executions = [];

    async function initialize() {
      if (state === 'ready') return receipt();
      if (initialization) return initialization;
      initialization = (async () => {
        state = 'validating';
        await validateAssets(index, modelLock);
        decodedIndex = core.decodeIndex(index);
        if (!handle) {
          state = 'loading';
          runtimeLog.info('place-model.load.started', {
            modelId: modelLock.embedding.id,
            bytes: modelLock.embedding.source.sizeBytes,
            indexId: index.id,
          });
          const dopplerApi = await resolveDopplerApi(modelLock, dopplerModule);
          const baseUrl = modelBaseUrl || modelLock.embedding.defaultModelBaseUrl;
          handle = await dopplerApi.load({ url: baseUrl }, {
            onProgress(event) {
              runtimeLog.info('place-model.load.progress', {
                modelId: modelLock.embedding.id,
                phase: event?.phase || null,
                percent: event?.percent ?? null,
              });
              if (typeof onProgress === 'function') onProgress(event);
            },
          });
        }
        if (typeof handle.embedBatch !== 'function') throw resolverError('embedding_capability_missing', 'Doppler model handle does not expose embedBatch()');
        state = 'ready';
        runtimeLog.info('place-model.ready', receipt());
        return receipt();
      })().catch((error) => {
        state = 'failed';
        lastFailure = runtimeLog.serializeError(error);
        runtimeLog.error('place-model.failed', lastFailure);
        throw error;
      }).finally(() => {
        initialization = null;
      });
      return initialization;
    }

    async function resolveMany(references) {
      const rows = references.map((reference, inputIndex) => {
        const queryText = core.extractPlaceQuery(reference.sourceText, reference.role);
        if (!queryText) return { inputIndex, reference, queryText, result: refusal('query_not_extracted', null) };
        const currentIndex = decodedIndex || core.decodeIndex(index);
        const eligible = reference.eligibleNodeIds?.length ? new Set(reference.eligibleNodeIds) : null;
        const documents = eligible ? currentIndex.documents.filter((row) => eligible.has(row.nodeId)) : currentIndex.documents;
        const typo = core.resolveExtendedTypo(queryText, documents);
        if (typo.outcome === 'resolve') {
          return {
            inputIndex,
            reference,
            queryText,
            result: {
              outcome: 'resolve',
              nodeId: typo.nodeId,
              evidence: {
                lane: 'extended_typo',
                queryText,
                policy: core.TYPO_POLICY,
                maximumDistance: typo.maximumDistance,
                distanceMargin: typo.distanceMargin,
                ranking: typo.ranking,
              },
            },
          };
        }
        return { inputIndex, reference, queryText, typo, result: null };
      });
      const neuralRows = rows.filter((row) => !row.result);
      if (neuralRows.length) {
        await initialize();
        const startedAt = now();
        const prefix = modelLock.runtime?.embeddingText?.queryPrefix || '';
        const suffix = modelLock.runtime?.embeddingText?.querySuffix || '';
        const outputs = await handle.embedBatch(neuralRows.map((row) => `${prefix}${row.queryText}${suffix}`), {
          useChatTemplate: false,
          embeddingMode: modelLock.runtime?.queryEmbeddingMode || modelLock.embedding.indexEmbeddingMode,
          __skipStateSnapshot: true,
        });
        if (!Array.isArray(outputs) || outputs.length !== neuralRows.length) throw resolverError('embedding_batch_invalid', `Expected ${neuralRows.length} embeddings, received ${outputs?.length || 0}`);
        neuralRows.forEach((row, outputIndex) => {
          const ranking = core.rankVector(outputs[outputIndex].embedding, decodedIndex, core.POLICY.maximumCandidates, row.reference.eligibleNodeIds);
          const decision = core.decideRanking(ranking);
          row.result = {
            outcome: decision.outcome,
            nodeId: decision.nodeId,
            evidence: {
              lane: 'qwen_embedding_cosine',
              queryText: row.queryText,
              modelId: modelLock.embedding.id,
              indexId: index.id,
              indexSha256: index.indexSha256,
              policy: core.POLICY,
              topSimilarity: decision.topSimilarity,
              margin: decision.margin,
              refusalReason: decision.refusalReason,
              ranking: decision.ranking,
              extendedTypo: row.typo,
            },
          };
        });
        executions.push({ queryCount: neuralRows.length, durationMs: round(now() - startedAt) });
      }
      return rows.sort((left, right) => left.inputIndex - right.inputIndex).map((row) => row.result);
    }

    async function unload() {
      if (handle && handle !== modelHandle && typeof handle.unload === 'function') await handle.unload();
      handle = modelHandle;
      state = modelHandle ? 'idle' : 'unloaded';
    }

    function receipt() {
      return {
        schema: 'simulatte.placeResolverReadiness.v1',
        state,
        ready: state === 'ready',
        lane: 'hybrid_lexical_extended_typo_qwen_embedding',
        modelId: modelLock.embedding.id,
        modelBytes: modelLock.embedding.source.sizeBytes,
        modelManifestSha256: modelLock.embedding.manifestHash.hex,
        indexId: index.id,
        indexSha256: index.indexSha256,
        executionCount: executions.length,
        queryCount: executions.reduce((sum, row) => sum + row.queryCount, 0),
        lastFailure,
        claimBoundary: 'Ready proves the pinned model and index loaded. A resolved reference remains bounded by the resolver policy and governed world; it is not a geocoder or a general place model.',
      };
    }

    return { id: 'hybrid-lexical-qwen-embedding-v1', initialize, receipt, resolveMany, unload };
  }

  async function validateAssets(index, modelLock) {
    if (modelLock?.schema !== 'simulatte.modelRuntimeLock.v1') throw resolverError('model_lock_invalid', 'Expected simulatte.modelRuntimeLock.v1');
    if (index?.model?.id !== modelLock.embedding?.id) throw resolverError('model_identity_mismatch', `Index model ${index?.model?.id || 'missing'} differs from lock ${modelLock.embedding?.id || 'missing'}`);
    if (index.model.manifestSha256 !== modelLock.embedding.manifestHash?.hex) throw resolverError('model_manifest_mismatch', 'Index model manifest hash differs from lock');
    if (index.embeddingDim !== modelLock.embedding.dimensions) throw resolverError('embedding_dimension_mismatch', 'Index dimensions differ from lock');
    const bytes = decodeBase64(index.embeddingsPackedBase64);
    const embeddingsSha256 = await receipts.sha256Hex(bytes);
    if (embeddingsSha256 !== index.embeddingsSha256) throw resolverError('embedding_bytes_mismatch', 'Packed place embeddings failed SHA-256 verification');
    const content = structuredClone(index);
    delete content.indexSha256;
    const indexSha256 = await receipts.sha256Hex(`${JSON.stringify(sortValue(content), null, 2)}`);
    if (indexSha256 !== index.indexSha256) throw resolverError('embedding_index_mismatch', 'Place embedding index content hash failed verification');
    return true;
  }

  async function resolveDopplerApi(modelLock, injected) {
    if (injected) return injected.doppler || injected.default || injected;
    const kernelPath = new URL(modelLock.doppler.kernelBasePath, documentBase()).toString().replace(/\/+$/, '');
    const existing = root.__DOPPLER_KERNEL_BASE_PATH__;
    if (existing && String(existing).replace(/\/+$/, '') !== kernelPath) throw resolverError('kernel_path_mismatch', 'Doppler kernel base path differs from the model lock');
    root.__DOPPLER_KERNEL_BASE_PATH__ = kernelPath;
    const moduleUrl = new URL(modelLock.doppler.moduleUrl, documentBase()).toString();
    try {
      const imported = await import(moduleUrl);
      return imported.doppler || imported.default || imported;
    } catch (error) {
      throw resolverError('doppler_import_failed', `Doppler import failed from ${moduleUrl}: ${error.message}`);
    }
  }

  function refusal(reason, evidence) {
    return { outcome: 'refuse', nodeId: null, evidence: { lane: 'hybrid', refusalReason: reason, ...(evidence || {}) } };
  }

  function decodeBase64(value) {
    if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(String(value || ''), 'base64'));
    const binary = atob(String(value || ''));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  function sortValue(value) {
    if (Array.isArray(value)) return value.map(sortValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  }

  function documentBase() {
    return typeof document !== 'undefined' && document.baseURI ? document.baseURI : 'http://localhost/';
  }

  function resolverError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyNeuralPlaceResolutionError';
    error.code = code;
    return error;
  }

  function now() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  }

  function round(value) {
    return Number(value.toFixed(3));
  }

  return { createPlaceResolver, validateAssets };
});
