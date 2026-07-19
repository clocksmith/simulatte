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
  const cooperativeContracts = typeof module === 'object' && module.exports
    ? require('../contracts/cooperative-contracts.js')
    : root.SimulatteCooperativeContracts;
  const browserTransport = typeof module === 'object' && module.exports
    ? require('../platform/transport/browser-transport.js')
    : root.SimulatteBrowserTransport;
  const artifactStore = typeof module === 'object' && module.exports
    ? require('../platform/artifacts/governed-artifact-store.js')
    : root.SimulatteGovernedArtifactStore;
  const dataCatalog = typeof module === 'object' && module.exports
    ? require('../platform/data-catalog/immutable-data-catalog.js')
    : root.SimulatteImmutableDataCatalog;
  const pluginContracts = typeof module === 'object' && module.exports
    ? require('../platform/contracts/plugin-contracts.js')
    : root.SimulattePluginContracts;
  const api = factory(contracts, receipts, regions, runtimeLog, cooperativeContracts, browserTransport, artifactStore, dataCatalog, pluginContracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyDataLoader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyDataLoader(contracts, receipts, regions, runtimeLog, cooperativeContracts, browserTransport, artifactStore, dataCatalog, pluginContracts) {
  assertDependencies();

  async function loadAutonomyData(manifestUrl = '../data/autonomy/autonomy-manifest.json', fetchImpl = defaultFetch()) {
    const resolvedManifestUrl = new URL(manifestUrl, documentBase()).toString();
    const services = createDataServices(fetchImpl);
    runtimeLog.info('data.load.started', {
      manifestUrl: resolvedManifestUrl,
      cacheMode: 'no-cache',
    });
    const manifest = await services.artifacts.readJson(resolvedManifestUrl);
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
    const directKeys = ['policy', 'occurrenceCatalog', 'rerankerEvidence', 'regionRegistry', 'placeEmbeddingIndex', 'placeResolutionEvidence', 'modelRuntimeLock', 'pipelineModelSelection', 'applicationProfile', 'accessibilityIndex', 'routeAmenityIndex', 'safetyHistoryIndex', 'curriculum', 'worldSnapshotRegistry', 'policyArenaEvidence', 'cooperativeScenario'];
    const resolvedReferences = await services.artifacts.resolveGraph(directKeys.map((key) => ({ key, reference: manifest.value[key] })), { baseUrl: resolvedManifestUrl });
    const refs = [...resolvedReferences.entries()];
    const loaded = Object.fromEntries(refs);
    const embodimentRows = await Promise.all(manifest.value.embodiments.map(async (reference) => ({
      reference,
      loaded: await services.artifacts.resolve(reference, { baseUrl: resolvedManifestUrl, key: `embodiment:${reference.id}` }),
    })));
    const defaultEmbodimentRow = embodimentRows.find((row) => row.reference.id === manifest.value.defaultEmbodimentId);
    if (!defaultEmbodimentRow) throw loadError('default_embodiment_missing', `Default embodiment ${manifest.value.defaultEmbodimentId} was not loaded`, { defaultEmbodimentId: manifest.value.defaultEmbodimentId });
    const registry = loaded.regionRegistry.value;
    contracts.validateRegionRegistry(registry);
    const packRows = await Promise.all(registry.packs.map(async (reference) => {
      const row = await services.artifacts.resolve(reference, { baseUrl: loaded.regionRegistry.url, key: `regionPack:${reference.id}` });
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
    validatePipelineModelSelection(loaded.pipelineModelSelection.value, loaded.modelRuntimeLock.value);
    pluginContracts.validateProfile(loaded.applicationProfile.value);
    contracts.validatePlaceEmbeddingIndex(loaded.placeEmbeddingIndex.value, loaded.modelRuntimeLock.value);
    contracts.validatePlaceResolutionEvidence(loaded.placeResolutionEvidence.value, loaded.placeEmbeddingIndex.value, loaded.modelRuntimeLock.value);
    contracts.validateAccessibilityIndex(loaded.accessibilityIndex.value, composition.world, worldHash);
    contracts.validateRouteAmenityIndex(loaded.routeAmenityIndex.value, composition.world, worldHash);
    contracts.validateSafetyHistoryIndex(loaded.safetyHistoryIndex.value, composition.world, worldHash);
    contracts.validateCurriculum(loaded.curriculum.value, composition.world);
    contracts.validateWorldSnapshotRegistry(loaded.worldSnapshotRegistry.value, composition.world);
    contracts.validatePolicyArenaEvidence(loaded.policyArenaEvidence.value);
    cooperativeContracts.validateScenario(loaded.cooperativeScenario.value);
    embodimentRows.forEach((row) => contracts.validateEmbodiment(row.loaded.value));
    contracts.validatePolicy(loaded.policy.value);
    const catalog = createLoadedDataCatalog({ refs, embodimentRows, packRows, composition, worldHash, featureCatalogHash });
    const result = {
      schema: 'simulatte.autonomyLoadedData.v2',
      manifest: manifest.value,
      dataCatalog: catalog,
      world: catalog.require(composition.world.id),
      embodiments: embodimentRows.map((row) => catalog.require(row.loaded.value.id)),
      defaultEmbodiment: catalog.require(defaultEmbodimentRow.loaded.value.id),
      policy: catalog.require(loaded.policy.value.id),
      featureCatalog: catalog.require(composition.featureCatalog.id),
      occurrenceCatalog: catalog.require(loaded.occurrenceCatalog.value.id),
      rerankerEvidence: catalog.require(loaded.rerankerEvidence.value.id),
      placeEmbeddingIndex: catalog.require(loaded.placeEmbeddingIndex.value.id),
      placeResolutionEvidence: catalog.require(loaded.placeResolutionEvidence.value.id),
      modelRuntimeLock: catalog.require(loaded.modelRuntimeLock.value.id),
      pipelineModelSelection: catalog.require(loaded.pipelineModelSelection.value.id),
      applicationProfile: catalog.require(loaded.applicationProfile.value.id),
      accessibilityIndex: catalog.require(loaded.accessibilityIndex.value.id),
      routeAmenityIndex: catalog.require(loaded.routeAmenityIndex.value.id),
      safetyHistoryIndex: catalog.require(loaded.safetyHistoryIndex.value.id),
      curriculum: catalog.require(loaded.curriculum.value.id),
      worldSnapshotRegistry: catalog.require(loaded.worldSnapshotRegistry.value.id),
      policyArenaEvidence: catalog.require(loaded.policyArenaEvidence.value.id),
      cooperativeScenario: catalog.require(loaded.cooperativeScenario.value.id),
      regionRegistry: catalog.require(registry.id),
      regionPacks: packRows.map((row) => catalog.require(row.value.id)),
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
    return createDataServices(fetchImpl).artifacts.resolve(reference, { baseUrl, key });
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
    return createDataServices(fetchImpl).artifacts.readJson(url);
  }

  function createDataServices(fetchImpl = defaultFetch()) {
    const transport = browserTransport.createBrowserTransport({ fetchImpl });
    return Object.freeze({
      transport,
      artifacts: artifactStore.createGovernedArtifactStore({ transport }),
    });
  }

  function createLoadedDataCatalog({ refs, embodimentRows, packRows, composition, worldHash, featureCatalogHash }) {
    const entries = [
      ...refs.map(([, row]) => ({ id: row.value.id, value: row.value, receipt: assetReceipt(row) })),
      ...embodimentRows.map((row) => ({ id: row.loaded.value.id, value: row.loaded.value, receipt: assetReceipt(row.loaded) })),
      ...packRows.map((row) => ({ id: row.value.id, value: row.value, receipt: assetReceipt(row) })),
      { id: composition.world.id, value: composition.world, receipt: { id: composition.world.id, sha256: worldHash, source: 'verified_region_composition' } },
      { id: composition.featureCatalog.id, value: composition.featureCatalog, receipt: { id: composition.featureCatalog.id, sha256: featureCatalogHash, source: 'verified_region_composition' } },
      { id: 'world.buildings.v1', value: composition.world, receipt: { id: composition.world.id, sha256: worldHash, source: 'verified_region_composition', view: 'buildings' } },
      { id: 'world.graph.v1', value: composition.world, receipt: { id: composition.world.id, sha256: worldHash, source: 'verified_region_composition', view: 'routing_graph' } },
    ];
    return dataCatalog.createDataCatalog(entries);
  }

  function defaultFetch() {
    return typeof fetch === 'function' ? fetch.bind(globalThis) : null;
  }

  function validatePipelineModelSelection(config, modelRuntimeLock) {
    if (!config || config.schema !== 'simulatte.pipelineModelSelection.v1') {
      throw loadError('pipeline_model_selection_invalid', `Expected simulatte.pipelineModelSelection.v1, received ${config?.schema || 'missing'}`, null);
    }
    if (config.modelRuntimeLock?.id !== modelRuntimeLock.id || Number(config.modelRuntimeLock?.number) !== Number(modelRuntimeLock.number)) {
      throw loadError('pipeline_model_selection_lock_mismatch', `Expected ${modelRuntimeLock.id} #${modelRuntimeLock.number}, received ${config.modelRuntimeLock?.id || 'missing'} #${config.modelRuntimeLock?.number || 'missing'}`, null);
    }
  }

  function assertDependencies() {
    const dependencies = [
      ['contracts', contracts, 'validateManifest'],
      ['receipts', receipts, 'sha256Hex'],
      ['regions', regions, 'mergeRegionPacks'],
      ['runtimeLog', runtimeLog, 'info'],
      ['cooperativeContracts', cooperativeContracts, 'validateScenario'],
      ['browserTransport', browserTransport, 'createBrowserTransport'],
      ['artifactStore', artifactStore, 'createGovernedArtifactStore'],
      ['dataCatalog', dataCatalog, 'createDataCatalog'],
      ['pluginContracts', pluginContracts, 'validateProfile'],
    ];
    const missing = dependencies.find(([, value, method]) => !value || typeof value[method] !== 'function');
    if (missing) throw new Error(`autonomy_data_loader_dependency_missing: ${missing[0]}.${missing[2]} is required`);
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
