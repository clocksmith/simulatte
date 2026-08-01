(function attachApplicationLoader(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../../../shared/contracts/contract-validator.js')
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
  const pluginPaths = typeof module === 'object' && module.exports
    ? require('../plugin-host/plugin-asset-paths.js')
    : root.SimulattePluginAssetPaths;
  const loadContext = typeof module === 'object' && module.exports
    ? require('./application-load-context.js')
    : root.SimulatteApplicationLoadContext;
  const api = factory(contracts, receipts, regions, runtimeLog, browserTransport, artifactStore, dataCatalog, pluginContracts, schemaRegistry, pluginRegistry, pluginPaths, loadContext);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteApplicationLoader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createApplicationLoader(contracts, receipts, regions, runtimeLog, browserTransport, artifactStore, dataCatalog, pluginContracts, schemaRegistry, pluginRegistry, pluginPaths, loadContext) {
  assertDependencies();

  async function loadApplication(
    manifestUrl = '../data/simulatte/autonomy-manifest.json',
    fetchImpl = defaultFetch(),
    { requestedProfileId = null, deferRenderGeometry = false } = {}
  ) {
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
    const directKeys = ['policy', 'occurrenceCatalog', 'rerankerEvidence', 'regionRegistry', 'placeEmbeddingIndex', 'placeResolutionEvidence', 'modelRuntimeLock', 'pipelineModelSelection', 'applicationProfile', 'safetyHistoryIndex', 'curriculum', 'policyArenaEvidence'];
    const selectedProfile = selectApplicationProfile(manifest.value, requestedProfileId);
    const resolvedReferences = await services.artifacts.resolveGraph(directKeys.map((key) => ({ key, reference: key === 'applicationProfile' ? selectedProfile : manifest.value[key] })), { baseUrl: resolvedManifestUrl });
    const refs = [...resolvedReferences.entries()];
    const loaded = Object.fromEntries(refs);
    pluginContracts.validateProfile(loaded.applicationProfile.value);
    const pluginOwnsWorldDetail = loaded.applicationProfile.value.experience?.worldDetail === 'plugin-owned';
    const embodimentRows = await Promise.all(manifest.value.embodiments.map(async (reference) => ({
      reference,
      loaded: await services.artifacts.resolve(reference, { baseUrl: resolvedManifestUrl, key: `embodiment:${reference.id}` }),
    })));
    const defaultEmbodimentRow = embodimentRows.find((row) => row.reference.id === manifest.value.defaultEmbodimentId);
    if (!defaultEmbodimentRow) throw loadError('default_embodiment_missing', `Default embodiment ${manifest.value.defaultEmbodimentId} was not loaded`, { defaultEmbodimentId: manifest.value.defaultEmbodimentId });
    const registry = loaded.regionRegistry.value;
    contracts.validateRegionRegistry(registry);
    const packRows = pluginOwnsWorldDetail ? [] : await Promise.all(registry.packs.map(async (reference) => {
      const row = await services.artifacts.resolve(reference, { baseUrl: loaded.regionRegistry.url, key: `regionPack:${reference.id}` });
      contracts.validateRegionPack(row.value, registry);
      return row;
    }));
    const initialGeometry = deferRenderGeometry || pluginOwnsWorldDetail
      ? null
      : await resolveRegionGeometry(registry, loaded.regionRegistry.url, services);
    await yieldToHost();
    const composition = pluginOwnsWorldDetail
      ? createProfileOwnedWorldContext(registry, loaded.applicationProfile.value)
      : regions.mergeRegionPacks(
        registry,
        packRows.map((row) => row.value),
        initialGeometry && initialGeometry.geometryByPackId
      );
    // Integrity without re-hashing the composed world on the main thread. Every region
    // pack is already sha256-verified on download against the (also verified) registry,
    // and mergeRegionPacks structurally validates the composition (exact pack ids, seam
    // nodes, expected counts). So the composed hashes are the values the registry pins;
    // we only cross-check that manifest and registry agree on them. Re-encoding and
    // hashing ~64 MB of merged JSON every boot was the dominant load-time CPU/memory
    // cost and is redundant with that chain.
    const worldHash = pluginOwnsWorldDetail ? null : composition.receipt.expectedWorldSha256;
    const featureCatalogHash = pluginOwnsWorldDetail ? null : composition.receipt.expectedFeatureCatalogSha256;
    if (!pluginOwnsWorldDetail) {
      assertCompositionHash('world', manifest.value.world.sha256, worldHash, composition.receipt);
      assertCompositionHash('featureCatalog', manifest.value.featureCatalog.sha256, featureCatalogHash, composition.receipt);
    }
    await yieldToHost();
    if (!pluginOwnsWorldDetail) {
      contracts.validateFeatureCatalog(composition.featureCatalog);
      if (!deferRenderGeometry) contracts.validateWorld(composition.world, composition.featureCatalog);
    }
    await yieldToHost();
    if (!pluginOwnsWorldDetail) {
      contracts.validateOccurrenceCatalog(loaded.occurrenceCatalog.value, composition.world);
      contracts.validateRerankerEvidence(loaded.rerankerEvidence.value, composition.featureCatalog, {
        world: worldHash,
        featureCatalog: featureCatalogHash,
        embodiment: defaultEmbodimentRow.loaded.sha256,
        policy: loaded.policy.sha256,
      });
    }
    contracts.validateModelRuntimeLock(loaded.modelRuntimeLock.value);
    validatePipelineModelSelection(loaded.pipelineModelSelection.value, loaded.modelRuntimeLock.value);
    if (!pluginOwnsWorldDetail) {
      contracts.validateSafetyHistoryIndex(
        loaded.safetyHistoryIndex.value,
        composition.world,
        worldHash
      );
    }
    contracts.validatePlaceEmbeddingIndex(loaded.placeEmbeddingIndex.value, loaded.modelRuntimeLock.value);
    contracts.validatePlaceResolutionEvidence(loaded.placeResolutionEvidence.value, loaded.placeEmbeddingIndex.value, loaded.modelRuntimeLock.value);
    await yieldToHost();
    if (!pluginOwnsWorldDetail) contracts.validateCurriculum(loaded.curriculum.value, composition.world);
    contracts.validatePolicyArenaEvidence(loaded.policyArenaEvidence.value);
    embodimentRows.forEach((row) => contracts.validateEmbodiment(row.loaded.value));
    contracts.validatePolicy(loaded.policy.value);
    const pluginDatasetBundle = await resolvePluginDatasets({ profile: loaded.applicationProfile.value, transport: services.transport, world: composition.world, worldHash });
    const pluginDatasetRows = pluginDatasetBundle.rows;
    const catalog = createLoadedDataCatalog({
      refs,
      embodimentRows,
      packRows,
      pluginDatasetRows,
      pluginDatasetShardLoader: pluginDatasetBundle.loadShard,
      composition,
      worldHash,
      featureCatalogHash,
      exposeCoreWorldViews: !pluginOwnsWorldDetail,
    });
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
      safetyHistoryIndex: catalog.require(loaded.safetyHistoryIndex.value.id),
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
          regionGeometry: initialGeometry ? initialGeometry.rows.map(assetReceipt) : [],
          world: {
            id: composition.world.id,
            sha256: worldHash,
            expectedSha256: pluginOwnsWorldDetail ? manifest.value.world.sha256 : undefined,
            source: pluginOwnsWorldDetail
              ? 'profile_declared_plugin_owned_context'
              : initialGeometry ? 'verified_region_composition' : 'verified_region_routing_composition',
          },
          featureCatalog: {
            id: composition.featureCatalog.id,
            sha256: featureCatalogHash,
            expectedSha256: pluginOwnsWorldDetail ? manifest.value.featureCatalog.sha256 : undefined,
            source: pluginOwnsWorldDetail ? 'profile_declared_not_consumed' : 'verified_region_composition',
          },
        },
        regionPacks: packRows.map(assetReceipt),
        regionComposition: structuredClone(composition.receipt),
        renderGeometryStatus: pluginOwnsWorldDetail ? 'plugin-owned' : initialGeometry ? 'ready' : 'deferred',
        routingStatus: pluginOwnsWorldDetail ? 'not-consumed' : 'ready',
        claimBoundary: manifest.value.claimBoundary,
      },
    };
    if (deferRenderGeometry && !pluginOwnsWorldDetail) {
      let geometryHydrationPromise = null;
      Object.defineProperty(result, 'loadRenderGeometry', {
        enumerable: false,
        value() {
          if (!geometryHydrationPromise) {
            geometryHydrationPromise = hydrateRenderGeometry({
              result,
              registry,
              regionRegistryUrl: loaded.regionRegistry.url,
              services,
              refs,
              embodimentRows,
              packRows,
              pluginDatasetRows,
              pluginDatasetShardLoader: pluginDatasetBundle.loadShard,
              worldHash,
              featureCatalogHash,
            });
          }
          return geometryHydrationPromise;
        },
      });
    }
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
      renderGeometryStatus: pluginOwnsWorldDetail ? 'plugin-owned' : initialGeometry ? 'ready' : 'deferred',
      routingStatus: pluginOwnsWorldDetail ? 'not-consumed' : 'ready',
    });
    return result;
  }

  async function resolveRegionGeometry(registry, regionRegistryUrl, services) {
    const rows = await Promise.all(registry.packs.map((reference) => services.artifacts.resolve(
      {
        id: reference.id,
        path: reference.geometry.path,
        sha256: reference.geometry.sha256,
        schemaId: reference.geometry.schemaId || null,
      },
      {
        baseUrl: regionRegistryUrl,
        key: `regionGeometry:${reference.id}`,
      }
    )));
    return {
      rows,
      geometryByPackId: Object.fromEntries(rows.map((row) => [
        row.value.id,
        row.value.renderGeometry,
      ])),
    };
  }

  async function hydrateRenderGeometry({
    result,
    registry,
    regionRegistryUrl,
    services,
    refs,
    embodimentRows,
    packRows,
    pluginDatasetRows,
    pluginDatasetShardLoader,
    worldHash,
    featureCatalogHash,
  }) {
    const startedAt = performanceNow();
    const geometry = await resolveRegionGeometry(registry, regionRegistryUrl, services);
    await yieldToHost();
    const composition = regions.mergeRegionPacks(
      registry,
      packRows.map((row) => row.value),
      geometry.geometryByPackId
    );
    contracts.validateWorld(composition.world, composition.featureCatalog);
    const catalog = createLoadedDataCatalog({
      refs,
      embodimentRows,
      packRows,
      pluginDatasetRows,
      pluginDatasetShardLoader,
      composition,
      worldHash,
      featureCatalogHash,
    });
    Object.assign(result, {
      dataCatalog: catalog,
      world: catalog.require(composition.world.id),
      featureCatalog: catalog.require(composition.featureCatalog.id),
      regionComposition: composition.receipt,
      receipt: {
        ...result.receipt,
        assets: {
          ...result.receipt.assets,
          regionGeometry: geometry.rows.map(assetReceipt),
          world: {
            ...result.receipt.assets.world,
            source: 'verified_region_composition',
          },
        },
        regionComposition: structuredClone(composition.receipt),
        renderGeometryStatus: 'ready',
        renderGeometryLoadMs: performanceNow() - startedAt,
      },
    });
    runtimeLog.info('data.render_geometry.ready', {
      manifestId: result.manifest.id,
      packIds: registry.composition.defaultPackIds,
      transferredAssets: geometry.rows.length,
      durationMs: result.receipt.renderGeometryLoadMs,
      counts: Object.fromEntries(
        ['land', 'parks', 'streets', 'buildings', 'bikeFacilities']
          .map((key) => [key, result.world.renderGeometry[key].length])
      ),
    });
    return result;
  }

  function performanceNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
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
    return loadContext.createDataServices({ fetchImpl, transportApi: browserTransport, artifactStoreApi: artifactStore });
  }

  function createLoadedDataCatalog({
    refs,
    embodimentRows,
    packRows,
    pluginDatasetRows,
    pluginDatasetShardLoader = null,
    composition,
    worldHash,
    featureCatalogHash,
    exposeCoreWorldViews = true,
  }) {
    const entries = [
      ...refs.map(([, row]) => ({ id: row.value.id, value: row.value, receipt: assetReceipt(row) })),
      ...embodimentRows.map((row) => ({ id: row.loaded.value.id, value: row.loaded.value, receipt: assetReceipt(row.loaded) })),
      ...packRows.map((row) => ({ id: row.value.id, value: row.value, receipt: assetReceipt(row) })),
      ...pluginDatasetRows.map((row) => ({ id: row.value.id, value: row.value, receipt: assetReceipt(row) })),
      { id: composition.world.id, value: composition.world, receipt: { id: composition.world.id, sha256: worldHash, source: exposeCoreWorldViews ? 'verified_region_composition' : 'profile_declared_plugin_owned_context' } },
      { id: composition.featureCatalog.id, value: composition.featureCatalog, receipt: { id: composition.featureCatalog.id, sha256: featureCatalogHash, source: exposeCoreWorldViews ? 'verified_region_composition' : 'profile_declared_not_consumed' } },
      ...(exposeCoreWorldViews ? [
        { id: 'world.buildings.v1', value: composition.world, receipt: { id: composition.world.id, sha256: worldHash, source: 'verified_region_composition', view: 'buildings' } },
        { id: 'world.graph.v1', value: composition.world, receipt: { id: composition.world.id, sha256: worldHash, source: 'verified_region_composition', view: 'routing_graph' } },
      ] : []),
    ];
    return dataCatalog.createDataCatalog(entries, { loadShard: pluginDatasetShardLoader });
  }

  function createProfileOwnedWorldContext(registry, profile) {
    const worldTemplate = structuredClone(registry.worldTemplate);
    const featureTemplate = structuredClone(registry.featureCatalogTemplate);
    const contextId = `${profile.id}:plugin-owned-world-context:v1`;
    const featureContextId = `${profile.id}:plugin-owned-feature-context:v1`;
    const world = {
      ...worldTemplate,
      id: contextId,
      label: `${profile.label} plugin-owned world context`,
      contentVersion: contextId,
      provenance: {
        sourceKind: 'profile_owned_world_context',
        sourceId: profile.id,
        snapshotDate: worldTemplate.provenance?.snapshotDate || null,
        claimBoundary: 'This artifact supplies only the governed coordinate frame for a plugin-owned presentation. It contains no City routing graph, building view, live conditions, or evidence for plugin-rendered claims.',
      },
      circuits: [], nodes: [], segments: [], signals: [], actors: [], disruptions: [],
      scenario: {
        schema: worldTemplate.scenario.schema,
        timeZone: worldTemplate.scenario.timeZone,
        defaultStartLocalMinutes: worldTemplate.scenario.defaultStartLocalMinutes,
        defaultRoute: {
          algorithm: 'profile_owned_no_core_route',
          distanceM: 0,
          nodeIds: [],
          segmentIds: [],
        },
        liveConditionsUsed: false,
        modeledAssumptions: [],
      },
      renderGeometry: {
        schema: worldTemplate.renderGeometry.schema,
        coordinateSystem: worldTemplate.renderGeometry.coordinateSystem,
        claimBoundary: 'No core render geometry is loaded. Visible world detail must come from the selected plugin with its own evidence bindings.',
        land: [], parks: [], streets: [], buildings: [], bikeFacilities: [],
      },
    };
    const featureCatalog = {
      ...featureTemplate,
      id: featureContextId,
      contentVersion: featureContextId,
      cards: [],
      index: {
        ...featureTemplate.index,
        cardCount: 0,
        tokenToCardIds: {},
        kindToCardIds: {},
      },
      provenance: {
        sourceKind: 'profile_declared_not_consumed',
        sourceId: profile.id,
        worldId: contextId,
        claimBoundary: 'The core feature catalog is not consumed by this plugin-owned experience.',
      },
    };
    return {
      world,
      featureCatalog,
      receipt: {
        schema: 'simulatte.profileOwnedWorldContextReceipt.v1',
        id: `${profile.id}:profile-owned-world-context-receipt:v1`,
        profileId: profile.id,
        registryId: registry.id,
        cityId: registry.city.id,
        packIds: [],
        seamNodeIds: [],
        duplicateNodeCount: 0,
        routingStatus: 'not-consumed',
        renderDetailOwner: 'plugin',
        expectedCoreWorldSha256: registry.composition.worldSha256,
        expectedCoreFeatureCatalogSha256: registry.composition.featureCatalogSha256,
      },
    };
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
      const baseUrl = new URL('plugin.json', pluginPaths.pluginBaseFromDocument(documentBase(), declaration.pluginId)).toString();
      rows.push(await store.resolve(declaration.reference, { baseUrl, key: `pluginDataset:${declaration.pluginId}:${declaration.id}` }));
    }
    return {
      rows,
      loadShard: createShardLoader(store),
    };
  }

  function createShardLoader(store) {
    return async ({ datasetId, parentReceipt, shard }) => {
      const startedAt = performanceNow();
      const loaded = await store.resolve({
        id: shard.id,
        path: shard.path,
        sha256: shard.sha256,
      }, {
        baseUrl: parentReceipt?.url,
        key: `pluginDatasetShard:${datasetId}:${shard.id}`,
      });
      return {
        value: loaded.value,
        sha256: loaded.sha256,
        receipt: {
          ...(loaded.receipt || {}),
          url: loaded.url,
          loadDurationMs: Math.round(Math.max(0, performanceNow() - startedAt) * 1000) / 1000,
          transferredBytes: typeof loaded.text === 'string' ? shard.byteCount : 0,
          retainedBytesEstimate: shard.byteCount,
          cacheMode: typeof loaded.text === 'string' ? 'network' : 'verified-content-cache',
        },
      };
    };
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
    return loadContext.defaultFetch();
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
      ['pluginAssetPaths', pluginPaths, 'pluginBaseFromDocument'],
      ['loadContext', loadContext, 'createDataServices'],
    ];
    loadContext.assertDependencies(dependencies, (message) => new Error(`autonomy_data_loader_dependency_missing: ${message}`));
  }

  function documentBase() {
    return loadContext.documentBase();
  }

  function selectApplicationProfile(manifest, requestedProfileId = null) {
    const requested = requestedProfileId || null;
    if (!requested || requested === manifest.applicationProfile.id) return manifest.applicationProfile;
    const selected = (manifest.applicationProfiles || []).find((row) => row.id === requested);
    if (!selected) throw loadError('application_profile_unknown', `Unknown application profile ${requested}`, { requested, available: [manifest.applicationProfile.id, ...(manifest.applicationProfiles || []).map((row) => row.id)].sort() });
    return selected;
  }

  function loadError(code, message, evidence) {
    return loadContext.createLoadError('AutonomyDataLoadError', code, message, evidence);
  }

  return { artifactText, loadApplication, fetchJson, loadReference };
});
