(function attachSimulatteIntentEmbedderModelLock(root) {
  const scope = root.__SimulatteIntentEmbedderRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const EMBEDDER_MANIFEST_SCHEMA = 'simulatte.modelBackedEmbedderManifest.v3';
    const MODEL_RUNTIME_LOCK_SCHEMA = 'simulatte.modelRuntimeLock.v1';

    async function resolvePinnedModelManifest(rawManifest, manifestUrl, telemetry = {}) {
        if (!rawManifest || rawManifest.schema !== EMBEDDER_MANIFEST_SCHEMA) {
          throw new Error(`intent manifest schema mismatch; expected ${EMBEDDER_MANIFEST_SCHEMA}`);
        }
        rejectInlineRuntimePins(rawManifest);
        const reference = rawManifest.modelRuntimeLock || {};
        const lockId = requiredText(reference.id, 'intent manifest modelRuntimeLock.id');
        const lockNumber = requiredLockNumber(reference.number, 'intent manifest modelRuntimeLock.number');
        const artifact = requiredText(reference.artifact, 'intent manifest modelRuntimeLock.artifact');
        const artifactHash = reference.artifactHash || null;
        if (!hashHex(artifactHash)) {
          throw new Error('intent manifest modelRuntimeLock.artifactHash is required');
        }
        const lockUrl = versionedAssetUrl(resolveUrl(artifact, manifestUrl), telemetry.assetVersionQuery);
        const lock = await fetchJson(lockUrl, 'model runtime lock', {
          ...telemetry,
          stage: 'lock-fetch',
          percent: 5,
          resourceKind: 'model-runtime-lock',
          expectedHash: artifactHash,
        });
        validateModelRuntimeLock(lock, lockId, lockNumber);
        const dimensions = Number(lock.embedding.dimensions);
        const manifest = clonePinnedValue(rawManifest);
        manifest.embedModel = clonePinnedValue(lock.embedding);
        manifest.reranker = clonePinnedValue(lock.reranker);
        manifest.runtime = {
          ...clonePinnedValue(lock.runtime),
          moduleUrl: resolveUrl(lock.doppler.moduleUrl, lockUrl),
          kernelBasePath: resolveUrl(lock.doppler.kernelBasePath, lockUrl),
          runtimeConfig: clonePinnedValue(lock.embedding.runtimeConfig),
        };
        manifest.runtimeOrder = clonePinnedValue(lock.runtimeOrder);
        manifest.cache = clonePinnedValue(lock.cache);
        manifest.retrieval = resolveRetrievalDimensions(manifest.retrieval, dimensions);
        manifest.modelRuntimeLock = {
          ...reference,
          artifactUrl: lockUrl,
          doppler: {
            package: lock.doppler.package.name,
            version: lock.doppler.package.version,
          },
        };
        return manifest;
      }

    function assertPinnedRuntimeOptions(options = {}) {
        const forbidden = [
          'modelBaseUrl',
          'rerankerModelBaseUrl',
          'dopplerModuleUrl',
          'dopplerKernelBasePath',
          'runtimeConfig',
        ];
        const overridden = forbidden.filter((key) => hasConfiguredValue(options[key]));
        if (overridden.length) {
          throw new Error(`model runtime lock forbids source overrides: ${overridden.join(', ')}`);
        }
      }

    function assertPinnedModelHandle(handle, expectedModel, label, modelBaseUrl = '') {
        const manifest = handle && handle.manifest || {};
        const rawModelId = String(handle && (handle.modelId || manifest.modelId) || '').trim();
        const rawHash = handle && handle.manifestHash || manifest.modelHash || manifest.manifestHash ||
          manifest.hash || manifest.meta && manifest.meta.hash || null;
        const expectedId = requiredText(expectedModel && expectedModel.id, `model runtime lock ${label}.id`);
        const expectedHash = hashHex(expectedModel && expectedModel.manifestHash);
        const expectedSource = normalizePinnedSource(expectedModel && expectedModel.defaultModelBaseUrl);
        const actualSource = normalizePinnedSource(modelBaseUrl);
        if (!expectedHash) throw new Error(`model runtime lock ${label}.manifestHash is required`);
        if (!rawHash || hashHex(rawHash) !== expectedHash) {
          throw new Error(`${label} model handle manifest hash does not match the model runtime lock`);
        }
        if (actualSource && actualSource !== expectedSource) {
          throw new Error(`${label} model source differs from the model runtime lock`);
        }
        if (rawModelId && rawModelId !== expectedId && normalizePinnedSource(rawModelId) !== expectedSource) {
          throw new Error(`${label} model handle id does not match the model runtime lock`);
        }
        return { rawModelId, rawHash };
      }

    function resolveRetrievalDimensions(retrieval = {}, dimensions) {
        if (!Number.isFinite(dimensions) || dimensions <= 0) {
          throw new Error('model runtime lock embedding.dimensions must be a positive number');
        }
        return {
          ...retrieval,
          dimensions,
          cards: retrieval.cards ? { ...retrieval.cards, dimensions } : null,
          universe: retrieval.universe ? { ...retrieval.universe, dimensions } : null,
        };
      }

    function validateModelRuntimeLock(lock, expectedId, expectedNumber) {
        if (!lock || lock.schema !== MODEL_RUNTIME_LOCK_SCHEMA) {
          throw new Error(`model runtime lock schema mismatch; expected ${MODEL_RUNTIME_LOCK_SCHEMA}`);
        }
        if (lock.id !== expectedId) {
          throw new Error(`model runtime lock id mismatch (${lock.id || 'missing'} !== ${expectedId})`);
        }
        if (Number(lock.number) !== expectedNumber) {
          throw new Error(`model runtime lock number mismatch (${lock.number || 'missing'} !== ${expectedNumber})`);
        }
        const doppler = lock.doppler || {};
        const packageInfo = doppler.package || {};
        requiredText(doppler.moduleUrl, 'model runtime lock doppler.moduleUrl');
        requiredText(doppler.kernelBasePath, 'model runtime lock doppler.kernelBasePath');
        requiredText(packageInfo.name, 'model runtime lock doppler.package.name');
        requiredText(packageInfo.version, 'model runtime lock doppler.package.version');
        requiredText(packageInfo.integrity, 'model runtime lock doppler.package.integrity');
        if (!Number.isInteger(Number(packageInfo.fileCount)) || Number(packageInfo.fileCount) < 1) {
          throw new Error('model runtime lock doppler.package.fileCount must be a positive integer');
        }
        validatePinnedModel(lock.embedding, 'embedding', true, lock.embedding && lock.embedding.conversion);
        const reranker = lock.reranker || {};
        if (reranker.schema !== 'simulatte.intentRerankerConfig.v1' || reranker.required !== true) {
          throw new Error('model runtime lock requires a required simulatte.intentRerankerConfig.v1 reranker');
        }
        requiredPositiveInteger(reranker.maxCandidatesPerCall, 'model runtime lock reranker.maxCandidatesPerCall');
        requiredPositiveInteger(reranker.maxSlotCandidatesPerCall, 'model runtime lock reranker.maxSlotCandidatesPerCall');
        validatePinnedModel(reranker.model, 'reranker', false, reranker.conversion);
        if (!reranker.runtimeConfig) throw new Error('model runtime lock reranker.runtimeConfig is required');
        validateLockedRuntime(lock.runtime, lock.runtimeOrder, lock.cache, lock.embedding);
      }

      function validatePinnedModel(model, label, requiresDimensions, conversion = null) {
        if (!model || !model.id || !model.defaultModelBaseUrl || !model.source || !hashHex(model.manifestHash)) {
          throw new Error(`model runtime lock ${label} model id, URL, source, and manifest hash are required`);
        }
        if (requiresDimensions && (!Number.isFinite(Number(model.dimensions)) || Number(model.dimensions) <= 0)) {
          throw new Error(`model runtime lock ${label}.dimensions must be a positive number`);
        }
        if (requiresDimensions) requiredText(model.indexEmbeddingMode, 'model runtime lock embedding.indexEmbeddingMode');
        const revision = requiredText(model.source.revision, `model runtime lock ${label}.source.revision`);
        const modelPath = requiredText(model.source.path, `model runtime lock ${label}.source.path`);
        if (!String(model.defaultModelBaseUrl).includes(`/resolve/${revision}/${modelPath}`)) {
          throw new Error(`model runtime lock ${label}.defaultModelBaseUrl must resolve the pinned revision and path`);
        }
        const conversionPin = conversion || {};
        requiredText(conversionPin.projectPath, `model runtime lock ${label}.conversion.projectPath`);
        if (!/^[0-9a-f]{64}$/i.test(String(conversionPin.sha256 || ''))) {
          throw new Error(`model runtime lock ${label}.conversion.sha256 must be a SHA-256 hex digest`);
        }
      }

    function validateLockedRuntime(runtime, runtimeOrder, cache, embedding) {
        const embeddingText = runtime && runtime.embeddingText || {};
        if (!runtime || !requiredText(runtime.queryEmbeddingMode, 'model runtime lock runtime.queryEmbeddingMode')) {
          throw new Error('model runtime lock runtime.queryEmbeddingMode is required');
        }
        if (runtime.queryEmbeddingMode !== embedding.indexEmbeddingMode) {
          throw new Error('model runtime lock query and index embedding modes must match');
        }
        if (!requiredText(embeddingText.schema, 'model runtime lock runtime.embeddingText.schema')) {
          throw new Error('model runtime lock runtime.embeddingText.schema is required');
        }
        if (runtime.requireModelBackedQuery !== true) {
          throw new Error('model runtime lock runtime.requireModelBackedQuery must be true');
        }
        if (!Array.isArray(runtimeOrder) || !runtimeOrder.length) {
          throw new Error('model runtime lock runtimeOrder must be a non-empty array');
        }
        if (!cache || !requiredText(cache.namespace, 'model runtime lock cache.namespace')) {
          throw new Error('model runtime lock cache.namespace is required');
        }
        if (!Array.isArray(cache.storage) || !cache.storage.length) {
          throw new Error('model runtime lock cache.storage must be a non-empty array');
        }
      }

    function rejectInlineRuntimePins(manifest = {}) {
        if (manifest.embedModel || manifest.reranker || manifest.runtime || manifest.runtimeOrder || manifest.cache) {
          throw new Error('intent manifest v3 must reference modelRuntimeLock instead of declaring model runtime policy inline');
        }
      }

    function requiredText(value, label) {
        const text = String(value || '').trim();
        if (!text) throw new Error(`${label} is required`);
        return text;
      }

    function requiredLockNumber(value, label) {
        const number = Number(value);
        if (!Number.isInteger(number) || number < 1) throw new Error(`${label} must be a positive integer`);
        return number;
    }

    function requiredPositiveInteger(value, label) {
        const number = Number(value);
        if (!Number.isInteger(number) || number < 1) throw new Error(`${label} must be a positive integer`);
        return number;
      }

    function hasConfiguredValue(value) {
        return value !== undefined && value !== null && String(value).trim() !== '';
      }

    function clonePinnedValue(value) {
        return JSON.parse(JSON.stringify(value));
      }

    function normalizePinnedSource(value) {
        return String(value || '').trim().replace(/\/+$/, '');
      }

    Object.assign(scope, {
      EMBEDDER_MANIFEST_SCHEMA,
      MODEL_RUNTIME_LOCK_SCHEMA,
      resolvePinnedModelManifest,
      assertPinnedRuntimeOptions,
      assertPinnedModelHandle,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
