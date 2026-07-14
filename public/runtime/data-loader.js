(function attachAutonomyDataLoader(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/contract-validator.js')
    : root.SimulatteAutonomyContracts;
  const receipts = typeof module === 'object' && module.exports
    ? require('./canonical-receipts.js')
    : root.SimulatteAutonomyReceipts;
  const regions = typeof module === 'object' && module.exports
    ? require('../world/region-pack-merger.js')
    : root.SimulatteAutonomyRegionPacks;
  const runtimeLog = typeof module === 'object' && module.exports
    ? require('./runtime-log.js')
    : root.SimulatteAutonomyRuntimeLog;
  const api = factory(contracts, receipts, regions, runtimeLog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyDataLoader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyDataLoader(contracts, receipts, regions, runtimeLog) {
  async function loadAutonomyData(manifestUrl = '../data/autonomy/autonomy-manifest.json', fetchImpl = fetch) {
    const resolvedManifestUrl = new URL(manifestUrl, documentBase()).toString();
    runtimeLog.info('data.load.started', {
      manifestUrl: resolvedManifestUrl,
      cacheMode: 'no-cache',
    });
    const manifest = await fetchJson(resolvedManifestUrl, fetchImpl);
    runtimeLog.info('data.manifest.received', {
      url: resolvedManifestUrl,
      schema: manifest.value?.schema || null,
      id: manifest.value?.id || null,
      keys: manifest.value && typeof manifest.value === 'object' ? Object.keys(manifest.value).sort() : [],
      missionExampleCount: Array.isArray(manifest.value?.missionExamples) ? manifest.value.missionExamples.length : null,
      response: manifest.response,
    });
    contracts.validateManifest(manifest.value);
    runtimeLog.info('data.manifest.validated', {
      id: manifest.value.id,
      schema: manifest.value.schema,
      missionExampleCount: manifest.value.missionExamples.length,
    });
    const directKeys = ['policy', 'occurrenceCatalog', 'rerankerEvidence', 'regionRegistry', 'placeEmbeddingIndex', 'placeResolutionEvidence', 'modelRuntimeLock', 'accessibilityIndex', 'routeAmenityIndex', 'safetyHistoryIndex', 'curriculum', 'worldSnapshotRegistry', 'policyArenaEvidence'];
    const refs = await Promise.all(directKeys.map(async (key) => [key, await loadReference(manifest.value[key], resolvedManifestUrl, key, fetchImpl)]));
    const loaded = Object.fromEntries(refs);
    const embodimentRows = await Promise.all(manifest.value.embodiments.map(async (reference) => ({
      reference,
      loaded: await loadReference(reference, resolvedManifestUrl, `embodiment:${reference.id}`, fetchImpl),
    })));
    const defaultEmbodimentRow = embodimentRows.find((row) => row.reference.id === manifest.value.defaultEmbodimentId);
    if (!defaultEmbodimentRow) throw loadError('default_embodiment_missing', `Default embodiment ${manifest.value.defaultEmbodimentId} was not loaded`, { defaultEmbodimentId: manifest.value.defaultEmbodimentId });
    const registry = loaded.regionRegistry.value;
    contracts.validateRegionRegistry(registry);
    const packRows = await Promise.all(registry.packs.map(async (reference) => {
      const row = await loadReference(reference, loaded.regionRegistry.url, `regionPack:${reference.id}`, fetchImpl);
      contracts.validateRegionPack(row.value, registry);
      return row;
    }));
    const composition = regions.mergeRegionPacks(registry, packRows.map((row) => row.value));
    const worldHash = await receipts.sha256Hex(artifactText(composition.world));
    const featureCatalogHash = await receipts.sha256Hex(artifactText(composition.featureCatalog));
    assertCompositionHash('world', manifest.value.world.sha256, worldHash, composition.receipt);
    assertCompositionHash('featureCatalog', manifest.value.featureCatalog.sha256, featureCatalogHash, composition.receipt);
    contracts.validateFeatureCatalog(composition.featureCatalog);
    contracts.validateWorld(composition.world, composition.featureCatalog);
    contracts.validateOccurrenceCatalog(loaded.occurrenceCatalog.value, composition.world);
    contracts.validateRerankerEvidence(loaded.rerankerEvidence.value, composition.featureCatalog, {
      world: worldHash,
      featureCatalog: featureCatalogHash,
      embodiment: defaultEmbodimentRow.loaded.sha256,
      policy: loaded.policy.sha256,
    });
    contracts.validateModelRuntimeLock(loaded.modelRuntimeLock.value);
    contracts.validatePlaceEmbeddingIndex(loaded.placeEmbeddingIndex.value, loaded.modelRuntimeLock.value);
    contracts.validatePlaceResolutionEvidence(loaded.placeResolutionEvidence.value, loaded.placeEmbeddingIndex.value, loaded.modelRuntimeLock.value);
    contracts.validateAccessibilityIndex(loaded.accessibilityIndex.value, composition.world, worldHash);
    contracts.validateRouteAmenityIndex(loaded.routeAmenityIndex.value, composition.world, worldHash);
    contracts.validateSafetyHistoryIndex(loaded.safetyHistoryIndex.value, composition.world, worldHash);
    contracts.validateCurriculum(loaded.curriculum.value, composition.world);
    contracts.validateWorldSnapshotRegistry(loaded.worldSnapshotRegistry.value, composition.world);
    contracts.validatePolicyArenaEvidence(loaded.policyArenaEvidence.value);
    embodimentRows.forEach((row) => contracts.validateEmbodiment(row.loaded.value));
    contracts.validatePolicy(loaded.policy.value);
    const result = {
      schema: 'simulatte.autonomyLoadedData.v2',
      manifest: manifest.value,
      world: composition.world,
      embodiments: embodimentRows.map((row) => row.loaded.value),
      defaultEmbodiment: defaultEmbodimentRow.loaded.value,
      policy: loaded.policy.value,
      featureCatalog: composition.featureCatalog,
      occurrenceCatalog: loaded.occurrenceCatalog.value,
      rerankerEvidence: loaded.rerankerEvidence.value,
      placeEmbeddingIndex: loaded.placeEmbeddingIndex.value,
      placeResolutionEvidence: loaded.placeResolutionEvidence.value,
      modelRuntimeLock: loaded.modelRuntimeLock.value,
      accessibilityIndex: loaded.accessibilityIndex.value,
      routeAmenityIndex: loaded.routeAmenityIndex.value,
      safetyHistoryIndex: loaded.safetyHistoryIndex.value,
      curriculum: loaded.curriculum.value,
      worldSnapshotRegistry: loaded.worldSnapshotRegistry.value,
      policyArenaEvidence: loaded.policyArenaEvidence.value,
      regionRegistry: registry,
      regionPacks: packRows.map((row) => row.value),
      regionComposition: composition.receipt,
      receipt: {
        schema: 'simulatte.autonomyDataLoadReceipt.v2',
        manifestUrl: resolvedManifestUrl,
        assets: {
          ...Object.fromEntries(refs.map(([key, row]) => [key, assetReceipt(row)])),
          embodiments: embodimentRows.map((row) => assetReceipt(row.loaded)),
          world: { id: composition.world.id, sha256: worldHash, source: 'verified_region_composition' },
          featureCatalog: { id: composition.featureCatalog.id, sha256: featureCatalogHash, source: 'verified_region_composition' },
        },
        regionPacks: packRows.map(assetReceipt),
        regionComposition: structuredClone(composition.receipt),
        claimBoundary: manifest.value.claimBoundary,
      },
    };
    runtimeLog.info('data.load.ready', {
      manifestId: manifest.value.id,
      worldId: composition.world.id,
      worldSha256: worldHash,
      featureCatalogId: composition.featureCatalog.id,
      featureCatalogSha256: featureCatalogHash,
      embodimentIds: result.embodiments.map((row) => row.id),
      regionPackIds: result.regionPacks.map((row) => row.id),
      counts: {
        nodes: composition.world.nodes.length,
        segments: composition.world.segments.length,
        featureCards: composition.featureCatalog.cards.length,
      },
    });
    return result;
  }

  async function loadReference(reference, baseUrl, key, fetchImpl) {
    const url = new URL(reference.path, baseUrl).toString();
    const loaded = await fetchJson(url, fetchImpl);
    const actualHash = await receipts.sha256Hex(loaded.text);
    if (actualHash !== reference.sha256) {
      throw loadError('asset_hash_mismatch', `${key} ${url} expected ${reference.sha256}, received ${actualHash}`, {
        key, url, expectedSha256: reference.sha256, actualSha256: actualHash,
      });
    }
    if (loaded.value.id !== reference.id) {
      throw loadError('asset_identity_mismatch', `${key} expected ID ${reference.id}, received ${loaded.value.id || 'missing'}`, {
        key, expectedId: reference.id, actualId: loaded.value.id || null,
      });
    }
    return { ...loaded, url, sha256: actualHash };
  }

  function assertCompositionHash(key, expected, actual, receipt) {
    const registryExpected = key === 'world' ? receipt.expectedWorldSha256 : receipt.expectedFeatureCatalogSha256;
    if (expected !== registryExpected || actual !== expected) {
      throw loadError('region_composition_hash_mismatch', `${key} expected manifest and registry SHA-256 ${expected}, received registry ${registryExpected} and composition ${actual}`, {
        key, manifestSha256: expected, registrySha256: registryExpected, actualSha256: actual,
      });
    }
  }

  function artifactText(value) {
    return `${JSON.stringify(regions.sortValue(value), null, 2)}\n`;
  }

  function assetReceipt(row) {
    return { id: row.value.id, url: row.url, sha256: row.sha256 };
  }

  async function fetchJson(url, fetchImpl) {
    let response;
    try {
      response = await fetchImpl(url, { cache: 'no-cache' });
    } catch (error) {
      runtimeLog.error('data.asset.fetch.failed', {
        url,
        cacheMode: 'no-cache',
        error: runtimeLog.serializeError(error),
      });
      throw loadError('asset_fetch_failed', `${url} request failed: ${error.message}`, {
        url,
        status: null,
        cause: runtimeLog.serializeError(error),
      });
    }
    const responseMetadata = {
      status: response?.status || null,
      ok: Boolean(response?.ok),
      cacheMode: 'no-cache',
      cacheControl: responseHeader(response, 'cache-control'),
      etag: responseHeader(response, 'etag'),
      contentLength: responseHeader(response, 'content-length'),
    };
    runtimeLog.info('data.asset.fetch.completed', { url, ...responseMetadata });
    if (!response || !response.ok) {
      throw loadError('asset_fetch_failed', `${url} expected HTTP success, received ${response && response.status || 'no response'}`, { url, status: response && response.status || null, response: responseMetadata });
    }
    const text = await response.text();
    try {
      return { text, value: JSON.parse(text), response: responseMetadata };
    } catch (error) {
      throw loadError('asset_json_invalid', `${url} expected valid JSON, received ${error.message}`, { url });
    }
  }

  function responseHeader(response, name) {
    return response?.headers && typeof response.headers.get === 'function'
      ? response.headers.get(name)
      : null;
  }

  function documentBase() {
    if (typeof document !== 'undefined' && document.baseURI) return document.baseURI;
    return 'http://localhost/';
  }

  function loadError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyDataLoadError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { artifactText, loadAutonomyData, fetchJson, loadReference };
});
