(function attachSimulatteIntentEmbedderModelCache(root) {
  const scope = root.__SimulatteIntentEmbedderRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const storageApiPromises = new Map();
    const deviceApiPromises = new Map();
    const sourceClosePromises = new WeakMap();

    async function resolveDopplerStorageApi(options = {}) {
      const direct = options.dopplerStorageModule || null;
      if (direct) return direct;
      const moduleUrl = String(options.storageModuleUrl || '').trim();
      if (!moduleUrl) {
        throw new Error('model runtime lock did not resolve a Doppler storage module URL');
      }
      if (!storageApiPromises.has(moduleUrl)) {
        storageApiPromises.set(moduleUrl, import(moduleUrl).catch((error) => {
          storageApiPromises.delete(moduleUrl);
          throw error;
        }));
      }
      return storageApiPromises.get(moduleUrl);
    }

    async function resolveDopplerDeviceApi(options = {}) {
      const direct = options.dopplerDeviceModule || null;
      if (direct) return direct;
      const moduleUrl = String(options.deviceModuleUrl || '').trim();
      if (!moduleUrl) {
        throw new Error('model runtime lock did not resolve a Doppler device module URL');
      }
      if (!deviceApiPromises.has(moduleUrl)) {
        deviceApiPromises.set(moduleUrl, import(moduleUrl).catch((error) => {
          deviceApiPromises.delete(moduleUrl);
          throw error;
        }));
      }
      return deviceApiPromises.get(moduleUrl);
    }

    async function prepareDopplerCachedModelSource(runtime, model, options = {}) {
      const manifest = runtime && runtime.manifest || {};
      const cachePolicy = manifest.cache || {};
      const modelId = String(model && model.id || '').trim();
      const modelBaseUrl = String(model && model.defaultModelBaseUrl || '').trim();
      if (!modelId || !modelBaseUrl) {
        throw new Error('persistent Doppler cache requires a pinned model id and base URL');
      }
      const storageApi = await resolveDopplerStorageApi({
        dopplerStorageModule: options.dopplerStorageModule,
        storageModuleUrl: manifest.runtime && manifest.runtime.storageModuleUrl,
      });
      const ensureModelCachedSource = storageApi && storageApi.ensureModelCachedSource;
      if (typeof ensureModelCachedSource !== 'function') {
        throw new Error('pinned Doppler storage module does not export ensureModelCachedSource()');
      }
      const progress = options.progress || null;
      const trace = Boolean(options.trace);
      const progressRange = options.progressRange || { start: 20, end: 42 };
      const resourceKind = options.resourceKind || 'model';
      const started = nowMs();
      emitRuntimeProgress(progress, trace, {
        source: 'doppler',
        stage: 'cache-read',
        percent: progressRange.start,
        message: `Opening verified OPFS cache for ${modelId}`,
        timing: 'start',
        traceId: options.traceId || '',
        modelId,
        modelBaseUrl,
        resourceKind,
        cachePrefetch: true,
        cacheMode: 'opfs',
        cacheBackends: cachePolicy.storage || ['Doppler', 'OPFS'],
      });
      const cache = await ensureModelCachedSource(
        modelId,
        modelBaseUrl,
        (event) => emitDopplerCacheProgress(event, {
          progress,
          trace,
          traceId: options.traceId || '',
          modelId,
          modelBaseUrl,
          resourceKind,
          progressRange,
          sourceSizeBytes: Number(model && model.source && model.source.sizeBytes || 0),
        }),
        { expectedManifestHash: model.manifestHash }
      );
      if (
        !cache
        || cache.storageBackend !== 'opfs'
        || !cache.storageContext
        || !cache.manifest
      ) {
        throw new Error(`persistent Doppler cache did not return a verified OPFS source for ${modelId}`);
      }
      const totalBytes = Number(cache.totalBytes || model && model.source && model.source.sizeBytes || 0);
      const receipt = {
        schema: 'simulatte.modelCacheReceipt.v1',
        modelId,
        owner: cachePolicy.owner || 'doppler',
        mode: 'opfs',
        strategy: cachePolicy.strategy || 'doppler-opfs-verified',
        namespace: cachePolicy.namespace || '',
        required: cachePolicy.requirePersistent === true,
        prefetched: true,
        verified: true,
        state: cache.cacheState || (cache.fromCache ? 'verified-hit' : 'imported'),
        fromCache: cache.fromCache === true,
        totalBytes,
        durationMs: elapsedMsSince(started),
      };
      emitRuntimeProgress(progress, trace, {
        source: 'doppler',
        stage: cache.fromCache ? 'cache-hit' : 'cache-ready',
        percent: progressRange.end,
        message: cache.fromCache
          ? `Verified OPFS cache hit for ${modelId}`
          : `Verified OPFS cache ready for ${modelId}`,
        timing: 'end',
        traceId: options.traceId || '',
        durationMs: receipt.durationMs,
        modelId,
        modelBaseUrl,
        resourceKind,
        completedBytes: totalBytes,
        totalBytes,
        cachePrefetch: true,
        cacheMode: 'opfs',
        cacheBackends: cachePolicy.storage || ['Doppler', 'OPFS'],
      });
      return {
        modelSource: dopplerModelSource(modelBaseUrl, cache),
        receipt,
        storageContext: cache.storageContext,
      };
    }

    function prefetchDopplerCachedModelSource(owner, key, runtime, model, options = {}) {
      const target = owner && typeof owner === 'object' ? owner : {};
      const promises = target.dopplerCachedSourcePromises || new Map();
      target.dopplerCachedSourcePromises = promises;
      if (!promises.has(key)) {
        const settled = prepareDopplerCachedModelSource(runtime, model, options)
          .then((value) => ({ value, error: null }), (error) => ({ value: null, error }));
        promises.set(key, settled);
      }
      return promises.get(key);
    }

    async function takeDopplerCachedModelSource(owner, key, runtime, model, options = {}) {
      const settled = await prefetchDopplerCachedModelSource(owner, key, runtime, model, options);
      if (owner && owner.dopplerCachedSourcePromises) owner.dopplerCachedSourcePromises.delete(key);
      if (settled.error) throw settled.error;
      return settled.value;
    }

    function prepareDopplerModelSources(owner, runtime, models = {}, options = {}) {
      if (owner.dopplerSourcePreparationPromise) return owner.dopplerSourcePreparationPromise;
      const roles = ['embedding', 'reranker'].filter((role) => models[role]);
      const started = nowMs();
      owner.dopplerModelPreparationReceipt = {
        schema: 'simulatte.dopplerModelPreparationReceipt.v1',
        policy: 'prepare-all-sources-then-load-embedding-before-reranker',
        sourceOrder: [],
        sourcePreparations: [],
        loadOrder: [],
      };
      owner.dopplerSourcePreparationPromise = (async () => {
        const sources = {};
        owner.dopplerPreparedModelSources = sources;
        for (const [index, role] of roles.entries()) {
          const queuedAt = nowMs();
          const roleOptions = options[role] || {};
          const receipt = owner.dopplerModelPreparationReceipt;
          receipt.sourceOrder.push(role);
          const row = {
            role,
            modelId: models[role].id || '',
            order: index + 1,
            queueWaitMs: Math.max(0, queuedAt - started),
            durationMs: 0,
            overlap: Number(owner.dopplerActiveSourcePreparations || 0) > 0,
            status: 'active',
          };
          receipt.sourcePreparations.push(row);
          owner.dopplerActiveSourcePreparations = Number(owner.dopplerActiveSourcePreparations || 0) + 1;
          try {
            sources[role] = await takeDopplerCachedModelSource(
              owner, role, runtime, models[role], roleOptions
            );
            row.status = 'ready';
          } catch (error) {
            row.status = 'failed';
            row.error = error instanceof Error ? error.message : String(error);
            if (error && typeof error === 'object') error.modelPreparationReceipt = receipt;
            throw error;
          } finally {
            row.durationMs = elapsedMsSince(queuedAt);
            owner.dopplerActiveSourcePreparations -= 1;
          }
          if (role === 'embedding') owner.embeddingCacheReceipt = sources[role].receipt;
          if (role === 'reranker') owner.rerankerCacheReceipt = sources[role].receipt;
        }
        return sources;
      })().catch((error) => {
        owner.dopplerSourcePreparationPromise = null;
        throw error;
      });
      return owner.dopplerSourcePreparationPromise;
    }

    function preparedDopplerModelSource(owner, role) {
      const source = owner && owner.dopplerPreparedModelSources && owner.dopplerPreparedModelSources[role];
      if (!source) throw new Error(`Doppler ${role} load started before the model-source preparation barrier`);
      return source;
    }

    function scheduleDopplerModelLoad(owner, role, modelId, load) {
      const queuedAt = nowMs();
      const previous = owner.dopplerModelLoadQueue || Promise.resolve();
      const task = previous.catch(() => {}).then(async () => {
        const started = nowMs();
        const loadOrder = owner.dopplerModelPreparationReceipt.loadOrder;
        const row = {
          role,
          modelId: modelId || '',
          order: loadOrder.length + 1,
          queueWaitMs: Math.max(0, started - queuedAt),
          durationMs: 0,
          overlap: Number(owner.dopplerActiveModelLoads || 0) > 0,
          status: 'active',
        };
        loadOrder.push(row);
        owner.dopplerActiveModelLoads = Number(owner.dopplerActiveModelLoads || 0) + 1;
        try {
          const value = await load();
          row.status = 'ready';
          return value;
        } catch (error) {
          row.status = 'failed';
          row.error = error instanceof Error ? error.message : String(error);
          throw error;
        } finally {
          row.durationMs = elapsedMsSince(started);
          owner.dopplerActiveModelLoads -= 1;
        }
      });
      owner.dopplerModelLoadQueue = task.then(() => undefined, () => undefined);
      return task;
    }

    function resetDopplerModelPreparation(owner) {
      owner.dopplerSourcePreparationPromise = null;
      owner.dopplerPreparedModelSources = null;
      owner.dopplerModelLoadQueue = null;
      owner.dopplerActiveSourcePreparations = 0;
      owner.dopplerActiveModelLoads = 0;
    }

    async function closePreparedDopplerModelSources(owner) {
      const sources = Object.values(owner.dopplerPreparedModelSources || {});
      await Promise.allSettled(sources.map((source) => closeDopplerCachedSource(source)));
    }

    async function releaseDopplerResources(owner) {
      const handles = [...new Set([
        owner.dopplerEmbedHandle,
        owner.dopplerRerankerHandle,
      ].filter(Boolean))];
      owner.dopplerEmbedHandle = null;
      owner.dopplerRerankerHandle = null;
      owner.activeDopplerModelRole = '';
      await Promise.allSettled(handles.map((handle) => (
        typeof handle.unload === 'function' ? handle.unload() : Promise.resolve()
      )));
      await closePreparedDopplerModelSources(owner);
      resetDopplerModelPreparation(owner);
    }

    function emitDopplerCacheProgress(event = {}, context = {}) {
      const range = context.progressRange || { start: 20, end: 42 };
      const fraction = Math.max(0, Math.min(1, Number(event.percent || 0) / 100));
      const rawStage = String(event.stage || 'cache-fill');
      const stage = rawStage === 'cache-hit'
        ? 'cache-hit'
        : rawStage === 'download-complete' || rawStage === 'cache-refresh'
          ? 'cache-ready'
          : rawStage === 'download-start' || rawStage === 'downloading' || rawStage === 'cache-invalidate'
            ? 'cache-fill'
            : 'cache-storage';
      const totalBytes = Number(event.totalBytes || context.sourceSizeBytes || 0);
      const completedBytes = Number(event.downloadedBytes || (stage === 'cache-hit' ? totalBytes : 0));
      emitRuntimeProgress(context.progress || null, Boolean(context.trace), {
        source: 'doppler',
        stage,
        percent: range.start + fraction * Math.max(0, range.end - range.start),
        message: event.message || `Preparing verified OPFS cache for ${context.modelId}`,
        traceId: context.traceId || '',
        modelId: context.modelId || '',
        modelBaseUrl: context.modelBaseUrl || '',
        resourceKind: context.resourceKind || 'model',
        completedBytes: Number.isFinite(completedBytes) ? completedBytes : 0,
        totalBytes: Number.isFinite(totalBytes) ? totalBytes : 0,
        completed: Number(event.completedShards || 0),
        total: Number(event.totalShards || 0),
        bytesPerSecond: Number(event.speed || 0),
        eta: String(event.eta || ''),
        operationId: Number(event.operationId || 0),
        queueDepth: Number(event.queueDepth || 0),
        queueWaitMs: Number(event.queueWaitMs || 0),
        cachePrefetch: true,
        cacheMode: 'opfs',
        rawEvent: event,
      });
    }

    async function closeDopplerCachedSource(cachedSource) {
      const storageContext = cachedSource && cachedSource.storageContext;
      const close = storageContext && storageContext.close;
      if (typeof close !== 'function') return;
      let closePromise = sourceClosePromises.get(storageContext);
      if (!closePromise) {
        closePromise = Promise.resolve()
          .then(() => close.call(storageContext))
          .catch(() => undefined);
        sourceClosePromises.set(storageContext, closePromise);
      }
      await closePromise;
    }

    async function disposeFailedDopplerLoad(handle, cachedSource) {
      if (handle && typeof handle.unload === 'function') {
        try {
          await handle.unload();
          return;
        } catch (_error) {
          // Fall through to the source-context cleanup.
        }
      }
      await closeDopplerCachedSource(cachedSource);
    }

    Object.assign(scope, {
      resolveDopplerStorageApi,
      resolveDopplerDeviceApi,
      prepareDopplerCachedModelSource,
      prefetchDopplerCachedModelSource,
      takeDopplerCachedModelSource,
      prepareDopplerModelSources,
      preparedDopplerModelSource,
      scheduleDopplerModelLoad,
      resetDopplerModelPreparation,
      closePreparedDopplerModelSources,
      releaseDopplerResources,
      emitDopplerCacheProgress,
      closeDopplerCachedSource,
      disposeFailedDopplerLoad,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
