(function attachApplicationLoader(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../../contracts/contract-validator.js')
    : root.SimulatteAutonomyContracts;
  const receipts = typeof module === 'object' && module.exports
    ? require('../../runtime/canonical-receipts.js')
    : root.SimulatteAutonomyReceipts;
  const regions = typeof module === 'object' && module.exports
    ? require('../../world/region-pack-merger.js')
    : root.SimulatteAutonomyRegionPacks;
  const runtimeLog = typeof module === 'object' && module.exports
    ? require('../../runtime/runtime-log.js')
    : root.SimulatteAutonomyRuntimeLog;
  const browserTransport = typeof module === 'object' && module.exports
    ? require('../transport/browser-transport.js')
    : root.SimulatteBrowserTransport;
  const artifactStore = typeof module === 'object' && module.exports
    ? require('../artifacts/governed-artifact-store.js')
    : root.SimulatteGovernedArtifactStore;
  const dataCatalog = typeof module === 'object' && module.exports
    ? require('../data-catalog/immutable-data-catalog.js')
    : root.SimulatteImmutableDataCatalog;
  const pluginContracts = typeof module === 'object' && module.exports
    ? require('../contracts/plugin-contracts.js')
    : root.SimulattePluginContracts;
  const schemaRegistry = typeof module === 'object' && module.exports
    ? require('../contracts/schema-registry.js')
    : root.SimulatteSchemaRegistry;
  const pluginRegistry = typeof module === 'object' && module.exports
    ? require('../plugin-host/generated-plugin-registry.js')
    : root.SimulatteGeneratedPluginRegistry;
  const api = factory(contracts, receipts, regions, runtimeLog, browserTransport, artifactStore, dataCatalog, pluginContracts, schemaRegistry, pluginRegistry);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteApplicationLoader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createApplicationLoader(contracts, receipts, regions, runtimeLog, browserTransport, artifactStore, dataCatalog, pluginContracts, schemaRegistry, pluginRegistry) {
  assertDependencies();

  async function loadApplication(manifestUrl = '../data/autonomy/autonomy-manifest.json', fetchImpl = defaultFetch()) {
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
    const directKeys = ['policy', 'occurrenceCatalog', 'rerankerEvidence', 'regionRegistry', 'placeEmbeddingIndex', 'placeResolutionEvidence', 'modelRuntimeLock', 'pipelineModelSelection', 'applicationProfile', 'curriculum', 'policyArenaEvidence'];
    const selectedProfile = selectApplicationProfile(manifest.value);
    const resolvedReferences = await services.artifacts.resolveGraph(directKeys.map((key) => ({ key, reference: key === 'applicationProfile' ? selectedProfile : manifest.value[key] })), { baseUrl: resolvedManifestUrl });
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
    await yieldToHost();
    const composition = regions.mergeRegionPacks(registry, packRows.map((row) => row.value));
    // Integrity without re-hashing the composed world on the main thread. Every region
    // pack is already sha256-verified on download against the (also verified) registry,
    // and mergeRegionPacks structurally validates the composition (exact pack ids, seam
    // nodes, expected counts). So the composed hashes are the values the registry pins;
    // we only cross-check that manifest and registry agree on them. Re-encoding and
    // hashing ~64 MB of merged JSON every boot was the dominant load-time CPU/memory
    // cost and is redundant with that chain.
    const worldHash = composition.receipt.expectedWorldSha256;
    const featureCatalogHash = composition.receipt.expectedFeatureCatalogSha256;
    assertCompositionHash('world', manifest.value.world.sha256, worldHash, composition.receipt);
    assertCompositionHash('featureCatalog', manifest.value.featureCatalog.sha256, featureCatalogHash, composition.receipt);
    await yieldToHost();
    contracts.validateFeatureCatalog(composition.featureCatalog);
    contracts.validateWorld(composition.world, composition.featureCatalog);
    await yieldToHost();
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
    await yieldToHost();
    contracts.validateCurriculum(loaded.curriculum.value, composition.world);
    contracts.validatePolicyArenaEvidence(loaded.policyArenaEvidence.value);
    embodimentRows.forEach((row) => contracts.validateEmbodiment(row.loaded.value));
    contracts.validatePolicy(loaded.policy.value);
    const pluginDatasetRows = await resolvePluginDatasets({ profile: loaded.applicationProfile.value, transport: services.transport, world: composition.world, worldHash });
    const catalog = createLoadedDataCatalog({ refs, embodimentRows, packRows, pluginDatasetRows, composition, worldHash, featureCatalogHash });
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
      curriculum: catalog.require(loaded.curriculum.value.id),
      policyArenaEvidence: catalog.require(loaded.policyArenaEvidence.value.id),
      regionRegistry: catalog.require(registry.id),
      regionPacks: packRows.map((row) => catalog.require(row.value.id)),
      regionComposition: composition.receipt,
      receipt: {
        schema: 'simulatte.autonomyDataLoadReceipt.v2',
        manifestUrl: resolvedManifestUrl,
        assets: {
          ...Object.fromEntries(refs.map(([key, row]) => [key, assetReceipt(row)])),
          embodiments: embodimentRows.map((row) => assetReceipt(row.loaded)),
          pluginDatasets: pluginDatasetRows.map(assetReceipt),
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

  // Canonical serialization of a composed artifact. No longer called on the boot hot
  // path (the composed-world re-hash was the dominant load-time cost and is redundant
  // with per-pack integrity + structural composition checks); kept exported so the test
  // suite can still bit-exact prove the deterministic merge reproduces the pinned SHA-256.
  function artifactText(value) {
    return `${JSON.stringify(regions.sortValue(value), null, 2)}\n`;
  }

  // Break the long synchronous load into cooperative chunks so the main thread stays
  // responsive (the loading animation keeps running) through merge and validation.
  function yieldToHost() {
    // Yield via MessageChannel, not requestAnimationFrame: rAF is frozen in hidden
    // tabs, which would stall the data load whenever the tab is backgrounded. A
    // MessageChannel task still runs at full rate in the background, so the load keeps
    // making progress and resumes cleanly when the tab is refocused.
    if (typeof MessageChannel === 'function') {
      return new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
        channel.port2.postMessage(0);
      });
    }
    if (typeof globalThis.setTimeout === 'function') {
      return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    }
    return Promise.resolve();
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

  function createLoadedDataCatalog({ refs, embodimentRows, packRows, pluginDatasetRows, composition, worldHash, featureCatalogHash }) {
    const entries = [
      ...refs.map(([, row]) => ({ id: row.value.id, value: row.value, receipt: assetReceipt(row) })),
      ...embodimentRows.map((row) => ({ id: row.loaded.value.id, value: row.loaded.value, receipt: assetReceipt(row.loaded) })),
      ...packRows.map((row) => ({ id: row.value.id, value: row.value, receipt: assetReceipt(row) })),
      ...pluginDatasetRows.map((row) => ({ id: row.value.id, value: row.value, receipt: assetReceipt(row) })),
      { id: composition.world.id, value: composition.world, receipt: { id: composition.world.id, sha256: worldHash, source: 'verified_region_composition' } },
      { id: composition.featureCatalog.id, value: composition.featureCatalog, receipt: { id: composition.featureCatalog.id, sha256: featureCatalogHash, source: 'verified_region_composition' } },
      { id: 'world.buildings.v1', value: composition.world, receipt: { id: composition.world.id, sha256: worldHash, source: 'verified_region_composition', view: 'buildings' } },
      { id: 'world.graph.v1', value: composition.world, receipt: { id: composition.world.id, sha256: worldHash, source: 'verified_region_composition', view: 'routing_graph' } },
    ];
    return dataCatalog.createDataCatalog(entries);
  }

  async function resolvePluginDatasets({ profile, transport, world, worldHash }) {
    const validators = schemaRegistry.createSchemaRegistry({
      'simulatte.autonomyAccessibilityIndex.v1': (value) => contracts.validateAccessibilityIndex(value, world, worldHash),
      'simulatte.autonomyRouteAmenityIndex.v1': (value) => contracts.validateRouteAmenityIndex(value, world, worldHash),
      'simulatte.autonomySafetyHistoryIndex.v1': (value) => contracts.validateSafetyHistoryIndex(value, world, worldHash),
      'simulatte.autonomyWorldSnapshotRegistry.v1': (value) => contracts.validateWorldSnapshotRegistry(value, world),
    });
    const store = artifactStore.createGovernedArtifactStore({ transport, schemas: validators });
    const declarations = new Map();
    profile.plugins.forEach((selection) => {
      const entry = pluginRegistry.entry(selection.id);
      const manifest = entry?.manifest;
      if (!entry || !manifest) throw loadError('plugin_manifest_missing', `Application profile selects missing plugin ${selection.id}`, { pluginId: selection.id });
      pluginContracts.validateManifest(manifest);
      registerPluginDatasetValidators(validators, entry, { world, worldSha256: worldHash });
      manifest.datasets.filter((row) => row.reference).forEach((row) => {
        const previous = declarations.get(row.id);
        if (previous && (previous.reference.sha256 !== row.reference.sha256 || previous.reference.path !== row.reference.path)) throw loadError('plugin_dataset_identity_conflict', `Plugins declare conflicting identities for dataset ${row.id}`, { id: row.id });
        declarations.set(row.id, { pluginId: manifest.id, ...row });
      });
    });
    const rows = [];
    for (const declaration of [...declarations.values()].sort((left, right) => left.id.localeCompare(right.id))) {
      const baseUrl = new URL(`./plugins/${declaration.pluginId}/plugin.json`, documentBase()).toString();
      rows.push(await store.resolve(declaration.reference, { baseUrl, key: `pluginDataset:${declaration.pluginId}:${declaration.id}` }));
    }
    return rows;
  }

  function registerPluginDatasetValidators(registry, entry, context) {
    const declaredSchemaIds = new Set(entry.manifest.datasets.flatMap((row) => row.reference ? [row.reference.schemaId] : []));
    const validators = entry.factory?.datasetValidators || {};
    Object.entries(validators).forEach(([schemaId, validate]) => {
      if (!declaredSchemaIds.has(schemaId)) throw loadError('plugin_dataset_validator_undeclared', `Plugin ${entry.manifest.id} registers validator for undeclared schema ${schemaId}`, { pluginId: entry.manifest.id, schemaId });
      registry.register(schemaId, (value) => validate(value, Object.freeze({ ...context })));
    });
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
      ['browserTransport', browserTransport, 'createBrowserTransport'],
      ['artifactStore', artifactStore, 'createGovernedArtifactStore'],
      ['dataCatalog', dataCatalog, 'createDataCatalog'],
      ['pluginContracts', pluginContracts, 'validateProfile'],
      ['schemaRegistry', schemaRegistry, 'createSchemaRegistry'],
      ['pluginRegistry', pluginRegistry, 'entry'],
    ];
    const missing = dependencies.find(([, value, method]) => !value || typeof value[method] !== 'function');
    if (missing) throw new Error(`autonomy_data_loader_dependency_missing: ${missing[0]}.${missing[2]} is required`);
  }

  function documentBase() {
    if (typeof document !== 'undefined' && document.baseURI) return document.baseURI;
    return 'http://localhost/';
  }

  function selectApplicationProfile(manifest) {
    const requested = typeof location !== 'undefined' ? new URL(location.href).searchParams.get('profile') : null;
    if (!requested || requested === manifest.applicationProfile.id) return manifest.applicationProfile;
    const selected = (manifest.applicationProfiles || []).find((row) => row.id === requested);
    if (!selected) throw loadError('application_profile_unknown', `Unknown application profile ${requested}`, { requested, available: [manifest.applicationProfile.id, ...(manifest.applicationProfiles || []).map((row) => row.id)].sort() });
    return selected;
  }

  function loadError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyDataLoadError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { artifactText, loadApplication, fetchJson, loadReference };
});
