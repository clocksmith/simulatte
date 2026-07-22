(function attachTierApplicationLoader(root, factory) {
  const browserTransport = typeof module === 'object' && module.exports ? require('../transport/browser-transport.js') : root.SimulatteBrowserTransport;
  const artifactStore = typeof module === 'object' && module.exports ? require('../artifacts/governed-artifact-store.js') : root.SimulatteGovernedArtifactStore;
  const dataCatalog = typeof module === 'object' && module.exports ? require('../data-catalog/immutable-data-catalog.js') : root.SimulatteImmutableDataCatalog;
  const pluginContracts = typeof module === 'object' && module.exports ? require('../contracts/plugin-contracts.js') : root.SimulattePluginContracts;
  const schemaRegistry = typeof module === 'object' && module.exports ? require('../contracts/schema-registry.js') : root.SimulatteSchemaRegistry;
  const pluginRegistry = typeof module === 'object' && module.exports ? require('../plugin-host/generated-plugin-registry.js') : (root.SimulatteGeneratedPluginRegistry || root.SimulattePluginRegistry);
  const pluginPaths = typeof module === 'object' && module.exports ? require('../plugin-host/plugin-asset-paths.js') : root.SimulattePluginAssetPaths;
  const receipts = typeof module === 'object' && module.exports ? require('../../runtime/canonical-receipts.js') : root.SimulatteAutonomyReceipts;
  const api = factory(browserTransport, artifactStore, dataCatalog, pluginContracts, schemaRegistry, pluginRegistry, pluginPaths, receipts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteTierApplicationLoader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createTierApplicationLoader(transportApi, artifactStoreApi, dataCatalogApi, contracts, schemaRegistryApi, registry, pluginPaths, receipts) {
  const DEFAULT_MANIFEST = './data/simulatte/tier-application-manifest.json';

  async function loadTierApplication({ tier, requestedProfileId = null, manifestUrl = DEFAULT_MANIFEST, fetchImpl = defaultFetch() } = {}) {
    assertDependencies();
    if (typeof tier !== 'string' || !tier) throw loadError('tier_missing', 'Tier application load expected a tier');
    const resolvedManifestUrl = new URL(manifestUrl, documentBase()).toString();
    const transport = transportApi.createBrowserTransport({ fetchImpl });
    const untypedStore = artifactStoreApi.createGovernedArtifactStore({ transport });
    const manifestLoaded = await untypedStore.readJson(resolvedManifestUrl);
    const manifest = validateTierManifest(manifestLoaded.value);
    const tierRow = manifest.tiers[tier];
    if (!tierRow) throw loadError('tier_unknown', `Tier ${tier} is not declared`, { tier, available: Object.keys(manifest.tiers).sort() });
    const profileEntry = selectProfileEntry(tierRow, requestedProfileId);
    const profileLoaded = await readPinnedJson(untypedStore, profileEntry, resolvedManifestUrl, `profile:${profileEntry.id}`);
    const profile = contracts.validateProfile(profileLoaded.value);
    if (profile.id !== profileEntry.id) throw loadError('tier_profile_id_invalid', `Profile expected ${profileEntry.id}, received ${profile.id || 'missing'}`, { expected: profileEntry.id, actual: profile.id || null });
    if (profile.schema !== 'simulatte.applicationProfile.v3') throw loadError('tier_profile_version_invalid', `Tier ${tier} expected applicationProfile.v3, received ${profile.schema}`, { profileId: profile.id });
    if (profile.tier !== tier) throw loadError('tier_profile_mismatch', `Profile ${profile.id} declares tier ${profile.tier}, expected ${tier}`, { profileId: profile.id, tier });
    if (profile.worldModelId !== tierRow.world.id) throw loadError('tier_world_identity_mismatch', `Profile ${profile.id} selects ${profile.worldModelId}, tier manifest selects ${tierRow.world.id}`, { profileId: profile.id });
    const worldLoaded = await readPinnedJson(untypedStore, tierRow.world, resolvedManifestUrl, `world:${tierRow.world.id}`);
    if (worldLoaded.value?.id !== tierRow.world.id) throw loadError('tier_world_id_invalid', `World expected ${tierRow.world.id}, received ${worldLoaded.value?.id || 'missing'}`, null);

    const validators = schemaRegistryApi.createSchemaRegistry();
    const selectedPluginRows = profile.plugins.map((selection) => {
      const entry = registry.entry(selection.id);
      if (!entry) throw loadError('tier_plugin_missing', `Profile ${profile.id} selects missing plugin ${selection.id}`, { pluginId: selection.id });
      contracts.validateManifest(entry.manifest);
      if (entry.manifest.sdkVersion < 2) throw loadError('tier_plugin_sdk_invalid', `Tier plugin ${selection.id} must use SDK v2`, { pluginId: selection.id, sdkVersion: entry.manifest.sdkVersion });
      registerDatasetValidators(validators, entry);
      return { selection, entry };
    });
    const governedStore = artifactStoreApi.createGovernedArtifactStore({ transport, schemas: validators });
    const declarations = new Map();
    selectedPluginRows.forEach(({ entry }) => entry.manifest.datasets.filter((row) => row.reference).forEach((declaration) => {
      const previous = declarations.get(declaration.id);
      if (previous && (previous.reference.sha256 !== declaration.reference.sha256 || previous.reference.path !== declaration.reference.path)) {
        throw loadError('tier_dataset_identity_conflict', `Plugins declare conflicting identities for ${declaration.id}`, { id: declaration.id });
      }
      declarations.set(declaration.id, { pluginId: entry.manifest.id, ...declaration });
    }));
    const datasetRows = [];
    for (const declaration of [...declarations.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      const baseUrl = new URL('plugin.json', pluginPaths.pluginBaseFromDocument(documentBase(), declaration.pluginId)).toString();
      datasetRows.push(await governedStore.resolve(declaration.reference, { baseUrl, key: `tierDataset:${declaration.pluginId}:${declaration.id}` }));
    }
    const catalog = dataCatalogApi.createDataCatalog([
      { id: profile.id, value: profile, receipt: profileLoaded.receipt },
      { id: worldLoaded.value.id, value: worldLoaded.value, receipt: worldLoaded.receipt },
      ...datasetRows.map((row) => ({ id: row.value.id, value: row.value, receipt: row.receipt || { id: row.value.id, sha256: row.sha256, url: row.url } })),
    ]);
    return Object.freeze({
      schema: 'simulatte.tierLoadedApplication.v1', tier, manifest, tierRow,
      profileEntries: Object.freeze(tierRow.profiles.map((row) => Object.freeze({ ...row }))),
      applicationProfile: profile, world: worldLoaded.value, dataCatalog: catalog,
      artifactStore: governedStore,
      registryBaseUrl: pluginPaths.sharedRootUrl(documentBase()),
      receipt: Object.freeze({
        schema: 'simulatte.tierApplicationLoadReceipt.v1', tier, manifestUrl: resolvedManifestUrl,
        profile: profileLoaded.receipt, world: worldLoaded.receipt,
        datasets: Object.freeze(datasetRows.map((row) => row.receipt || { id: row.value.id, sha256: row.sha256, url: row.url })),
      }),
    });
  }

  function resolveProfileForTier(manifest, tier, requestedProfileId = null) {
    const row = validateTierManifest(manifest).tiers[tier];
    if (!row) throw loadError('tier_unknown', `Tier ${tier} is not declared`, { tier });
    return selectProfileEntry(row, requestedProfileId);
  }

  function selectProfileEntry(tierRow, requestedProfileId) {
    const wanted = requestedProfileId || tierRow.defaultProfileId;
    const entry = tierRow.profiles.find((row) => row.id === wanted);
    if (!entry) throw loadError('tier_profile_unknown', `Profile ${wanted} is not available for tier`, { requestedProfileId: wanted, available: tierRow.profiles.map((row) => row.id) });
    return entry;
  }

  async function readPinnedJson(store, reference, baseUrl, key) {
    const url = new URL(reference.path, baseUrl).toString();
    const loaded = await store.readJson(url);
    const actualSha256 = await receipts.sha256Hex(loaded.text);
    if (reference.sha256 && actualSha256 !== reference.sha256) throw loadError('tier_asset_hash_mismatch', `${key} expected ${reference.sha256}, received ${actualSha256}`, { key, url, expectedSha256: reference.sha256, actualSha256 });
    return Object.freeze({ ...loaded, sha256: actualSha256, receipt: Object.freeze({ schema: 'simulatte.tierAssetReceipt.v1', id: reference.id, url, sha256: actualSha256 }) });
  }

  function registerDatasetValidators(validators, entry) {
    const declaredSchemaIds = new Set(entry.manifest.datasets.flatMap((row) => row.reference ? [row.reference.schemaId] : []));
    const pluginValidators = entry.factory?.datasetValidators || {};
    declaredSchemaIds.forEach((schemaId) => {
      const validate = pluginValidators[schemaId];
      if (typeof validate !== 'function') throw loadError('tier_dataset_validator_missing', `Plugin ${entry.manifest.id} must register validator ${schemaId}`, { pluginId: entry.manifest.id, schemaId });
      if (!validators.ids().includes(schemaId)) validators.register(schemaId, validate);
    });
    Object.keys(pluginValidators).forEach((schemaId) => {
      if (!declaredSchemaIds.has(schemaId)) throw loadError('tier_dataset_validator_undeclared', `Plugin ${entry.manifest.id} registers undeclared validator ${schemaId}`, { pluginId: entry.manifest.id, schemaId });
    });
  }

  function validateTierManifest(value) {
    if (!value || value.schema !== 'simulatte.tierApplicationManifest.v2' || !value.tiers || typeof value.tiers !== 'object') throw loadError('tier_manifest_invalid', 'Expected simulatte.tierApplicationManifest.v2', null);
    Object.entries(value.tiers).forEach(([tier, row]) => {
      if (!row || typeof row.defaultProfileId !== 'string' || !Array.isArray(row.profiles) || !row.profiles.length || !row.world) throw loadError('tier_manifest_row_invalid', `Tier ${tier} is incomplete`, { tier });
      validateReference(row.world, `Tier ${tier} world`);
      row.profiles.forEach((profile) => validateReference(profile, `Tier ${tier} profile`));
    });
    return value;
  }
  function validateReference(row, label) { if (!row || typeof row.id !== 'string' || typeof row.path !== 'string' || (row.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(row.sha256))) throw loadError('tier_reference_invalid', `${label} expected id, path, and optional SHA-256`, row); }
  function assertDependencies() { const rows = [['transport',transportApi,'createBrowserTransport'],['artifactStore',artifactStoreApi,'createGovernedArtifactStore'],['dataCatalog',dataCatalogApi,'createDataCatalog'],['contracts',contracts,'validateProfile'],['schemaRegistry',schemaRegistryApi,'createSchemaRegistry'],['registry',registry,'entry'],['paths',pluginPaths,'pluginBaseFromDocument'],['receipts',receipts,'sha256Hex']]; const missing=rows.find(([,value,method])=>!value||typeof value[method]!=='function'); if(missing) throw loadError('tier_loader_dependency_missing', `${missing[0]}.${missing[2]} is required`, null); }
  function defaultFetch() { return typeof fetch === 'function' ? fetch.bind(globalThis) : null; }
  function documentBase() { return typeof document !== 'undefined' && document.baseURI ? document.baseURI : 'http://localhost/'; }
  function loadError(code, message, evidence) { const error = new Error(`${code}: ${message}`); error.name = 'SimulatteTierLoadError'; error.code = code; error.evidence = evidence; return error; }
  return Object.freeze({ DEFAULT_MANIFEST, loadTierApplication, resolveProfileForTier, validateTierManifest });
});
