(function attachSimulatteIntentEmbedderUniverseLoader(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('intentEmbedder');
  const universeLoadQueues = new WeakMap();

  async function loadUniverseIndexes(manifestUrl, telemetry = {}) {
    const fetchReceipts = [];
    const manifest = await scope.fetchJson(manifestUrl, 'universe manifest', {
      ...telemetry,
      fetchReceipts,
      stage: 'index-fetch',
      percent: 13,
      resourceKind: 'universe-manifest',
    });
    if (!manifest || manifest.schema !== 'simulatte.universeManifest.v1') {
      throw new Error('universe manifest schema mismatch; expected simulatte.universeManifest.v1');
    }
    for (const [name, config] of Object.entries(manifest.indexes || {})) {
      if (!config || !config.artifact) throw new Error(`universe index ${name} missing artifact`);
    }
    return {
      manifest,
      indexes: {},
      manifestUrl,
      assetVersionQuery: telemetry.assetVersionQuery || '',
      fetchReceipts,
    };
  }

  function normalizeUniverseIndexes(universe, manifest) {
    if (!universe) return null;
    if (!universe.manifest || universe.manifest.schema !== 'simulatte.universeManifest.v1') {
      throw new Error('universe index package missing manifest');
    }
    const universeLock = universe.manifest.modelRuntimeLock || {};
    const runtimeLock = manifest.modelRuntimeLock || {};
    if (
      universeLock.id !== runtimeLock.id ||
      Number(universeLock.number) !== Number(runtimeLock.number) ||
      scope.hashHex(universeLock.artifactHash) !== scope.hashHex(runtimeLock.artifactHash)
    ) {
      throw new Error('universe modelRuntimeLock must match the resolved intent model runtime lock');
    }
    const indexes = {};
    let documentCount = 0;
    for (const [name, index] of Object.entries(universe.indexes || {})) {
      indexes[name] = normalizeUniverseIndex(name, index);
      documentCount += indexes[name].documents.length;
    }
    return {
      schema: universe.manifest.schema,
      id: universe.manifest.id || 'simulatte-universe',
      indexes,
      documentCount,
      manifestUrl: universe.manifestUrl || '',
      indexConfigs: { ...(universe.manifest.indexes || {}) },
      assetVersionQuery: universe.assetVersionQuery || '',
      loadReceipt: {
        schema: 'simulatte.universeIndexLoadReceipt.v1',
        requestedIndexNames: [],
        loadedIndexNames: Object.keys(indexes).sort(),
        transferredBytes: (universe.fetchReceipts || [])
          .reduce((sum, row) => sum + Number(row.byteLength || 0), 0),
        availableShardBytes: shardBytes(universe.manifest.indexes),
        loadedShardBytes: loadedShardBytes(universe.manifest.indexes, Object.keys(indexes)),
        deferredShardBytes: shardBytes(universe.manifest.indexes) -
          loadedShardBytes(universe.manifest.indexes, Object.keys(indexes)),
        fetches: sortedFetchReceipts(universe.fetchReceipts),
      },
    };
  }

  function normalizeUniverseIndex(name, index) {
    if (!index || !Array.isArray(index.documents)) {
      throw new Error(`universe index ${name} missing documents`);
    }
    const rawDocs = index.documents;
    const embeddingDim = Number(index.embeddingDim || 0);
    const packedEmbeddings = index.embeddingsPackedBase64 && Number.isFinite(embeddingDim) && embeddingDim > 0
      ? scope.decodePackedEmbeddings(
        index.embeddingsPackedBase64,
        rawDocs.length,
        embeddingDim,
        `universe ${name} embedding index`
      )
      : null;
    const featureDim = Number(index.featureDim || 0);
    const packedFeatures = index.featurePackedBase64 && Number.isFinite(featureDim) && featureDim > 0
      ? scope.decodePackedEmbeddings(
        index.featurePackedBase64,
        rawDocs.length,
        featureDim,
        `universe ${name} feature index`
      )
      : null;
    if (packedFeatures) {
      const featureModelId = String(index.featureModelId || '');
      const expectedFeatureModelId = scope.runtimeFeatureModelId();
      if (featureModelId !== expectedFeatureModelId) {
        throw new Error(
          `universe index ${name} featureModelId mismatch (${featureModelId || 'missing'} !== ${expectedFeatureModelId}); rebuild the index or align the runtime feature builder`
        );
      }
    }
    return {
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
            ? scope.normalizeEmbeddingVector(
              packedEmbeddings.slice(embeddingOffset, embeddingOffset + embeddingDim),
              `universe ${name} ${doc.id || order}`
            )
            : null,
          featureVector: packedFeatures
            ? scope.normalizeEmbeddingVector(
              packedFeatures.slice(featureOffset, featureOffset + featureDim),
              `universe ${name} feature ${doc.id || order}`
            )
            : null,
        };
      }),
    };
  }

  function universeIndexNamesForPrompt(promptText, options = {}) {
    const available = Object.keys(options.universe && options.universe.indexConfigs || {});
    const slots = Array.isArray(options.queryPlan && options.queryPlan.slots)
      ? options.queryPlan.slots
      : [];
    if (!slots.length) return available.sort();
    const roles = new Set(slots.map((slot) => String(slot.slotRole || '').toLowerCase()));
    const selected = new Set();
    if (roles.has('environment')) selected.add('scenes');
    if (['actor', 'object', 'part'].some((role) => roles.has(role))) {
      selected.add('shapes');
      selected.add('analogs');
    }
    if (roles.has('relation')) selected.add('relations');
    if (roles.has('material') || roles.has('medium')) selected.add('materials');
    if (roles.has('action') || roles.has('visual')) {
      selected.add('processes');
      selected.add('operators');
      selected.add('affordances');
    }
    if (roles.has('concept') || slots.some((slot) => slot.modelEvidenceRequired === true)) {
      selected.add('concepts');
      selected.add('synonyms');
    }
    if (!selected.size) selected.add('concepts');
    return [...selected].filter((name) => available.includes(name)).sort();
  }

  function ensureUniverseIndexes(universe, promptText, options = {}) {
    if (!universe) return Promise.resolve(null);
    const requested = universeIndexNamesForPrompt(promptText, { ...options, universe });
    const missing = requested.filter((name) => !universe.indexes[name]);
    if (!missing.length) return Promise.resolve(universe);
    const previous = universeLoadQueues.get(universe) || Promise.resolve();
    const next = previous.then(async () => {
      const stillMissing = missing.filter((name) => !universe.indexes[name]);
      if (!stillMissing.length) return universe;
      const started = scope.nowMs();
      const fetchReceipts = [];
      const rows = await Promise.all(stillMissing.map(async (name) => {
        const config = universe.indexConfigs[name];
        const raw = await scope.fetchJson(
          scope.versionedAssetUrl(
            scope.resolveUrl(config.artifact, universe.manifestUrl),
            universe.assetVersionQuery
          ),
          `universe ${name} index`,
          {
            ...options.telemetry,
            fetchReceipts,
            stage: 'index-fetch',
            percent: 84,
            progressEnd: 85,
            resourceKind: `universe-${name}-index`,
            expectedHash: config.artifactHash || config.hash || null,
          }
        );
        return [name, normalizeUniverseIndex(name, raw)];
      }));
      for (const [name, index] of rows) universe.indexes[name] = index;
      universe.documentCount = Object.values(universe.indexes)
        .reduce((sum, index) => sum + index.documents.length, 0);
      universe.loadReceipt = {
        schema: 'simulatte.universeIndexLoadReceipt.v1',
        requestedIndexNames: requested,
        loadedIndexNames: Object.keys(universe.indexes).sort(),
        transferredBytes: Number(universe.loadReceipt?.transferredBytes || 0) +
          fetchReceipts.reduce((sum, row) => sum + Number(row.byteLength || 0), 0),
        availableShardBytes: shardBytes(universe.indexConfigs),
        loadedShardBytes: loadedShardBytes(universe.indexConfigs, Object.keys(universe.indexes)),
        deferredShardBytes: shardBytes(universe.indexConfigs) -
          loadedShardBytes(universe.indexConfigs, Object.keys(universe.indexes)),
        durationMs: scope.elapsedMsSince(started),
        fetches: sortedFetchReceipts([
          ...(universe.loadReceipt?.fetches || []),
          ...fetchReceipts,
        ]),
      };
      return universe;
    });
    universeLoadQueues.set(universe, next.catch(() => undefined));
    return next;
  }

  function sortedFetchReceipts(receipts) {
    return [...(receipts || [])].sort((left, right) => (
      String(left.resourceKind || '').localeCompare(String(right.resourceKind || '')) ||
      String(left.resourceUrl || '').localeCompare(String(right.resourceUrl || ''))
    ));
  }

  function shardBytes(configs = {}) {
    return Object.values(configs || {})
      .reduce((sum, config) => sum + Number(config && config.artifactBytes || 0), 0);
  }

  function loadedShardBytes(configs = {}, loadedNames = []) {
    return loadedNames.reduce(
      (sum, name) => sum + Number(configs[name] && configs[name].artifactBytes || 0),
      0
    );
  }

  root.SimulattePhaseModuleRegistry.define(
    'intentEmbedder',
    'simulatte-intent-embedder-universe-loader.js',
    {
      ensureUniverseIndexes,
      loadUniverseIndexes,
      normalizeUniverseIndex,
      normalizeUniverseIndexes,
      universeIndexNamesForPrompt,
    }
  );
})(typeof globalThis !== 'undefined' ? globalThis : window);
