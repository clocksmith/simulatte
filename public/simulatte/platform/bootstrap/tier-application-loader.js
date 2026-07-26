(function attachTierApplicationLoader(root, factory) {
  const browserTransport = typeof module === 'object' && module.exports ? require('../transport/browser-transport.js') : root.SimulatteBrowserTransport;
  const artifactStore = typeof module === 'object' && module.exports ? require('../artifacts/governed-artifact-store.js') : root.SimulatteGovernedArtifactStore;
  const dataCatalog = typeof module === 'object' && module.exports ? require('../data-catalog/immutable-data-catalog.js') : root.SimulatteImmutableDataCatalog;
  const pluginContracts = typeof module === 'object' && module.exports ? require('../contracts/plugin-contracts.js') : root.SimulattePluginContracts;
  const schemaRegistry = typeof module === 'object' && module.exports ? require('../contracts/schema-registry.js') : root.SimulatteSchemaRegistry;
  const pluginRegistry = typeof module === 'object' && module.exports ? require('../plugin-host/generated-plugin-registry.js') : (root.SimulatteGeneratedPluginRegistry || root.SimulattePluginRegistry);
  const pluginPaths = typeof module === 'object' && module.exports ? require('../plugin-host/plugin-asset-paths.js') : root.SimulattePluginAssetPaths;
  const receipts = typeof module === 'object' && module.exports ? require('../../runtime/canonical-receipts.js') : root.SimulatteAutonomyReceipts;
  const loadContext = typeof module === 'object' && module.exports ? require('./application-load-context.js') : root.SimulatteApplicationLoadContext;
  const api = factory(browserTransport, artifactStore, dataCatalog, pluginContracts, schemaRegistry, pluginRegistry, pluginPaths, receipts, loadContext);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteTierApplicationLoader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createTierApplicationLoader(transportApi, artifactStoreApi, dataCatalogApi, contracts, schemaRegistryApi, registry, pluginPaths, receipts, loadContext) {
  const DEFAULT_MANIFEST = './data/simulatte/tier-application-manifest.json';

  async function loadTierApplication({ tier, requestedProfileId = null, manifestUrl = DEFAULT_MANIFEST, fetchImpl = defaultFetch() } = {}) {
    assertDependencies();
    if (typeof tier !== 'string' || !tier) throw loadError('tier_missing', 'Tier application load expected a tier');
    const resolvedManifestUrl = new URL(manifestUrl, documentBase()).toString();
    const services = loadContext.createDataServices({ fetchImpl, transportApi, artifactStoreApi });
    const transport = services.transport;
    const untypedStore = services.artifacts;
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
    if (profile.worldModelId !== profileEntry.world.id) throw loadError('tier_world_identity_mismatch', `Profile ${profile.id} selects ${profile.worldModelId}, profile manifest selects ${profileEntry.world.id}`, { profileId: profile.id });
    const worldLoaded = await readPinnedJson(untypedStore, profileEntry.world, resolvedManifestUrl, `world:${profileEntry.world.id}`);
    if (worldLoaded.value?.id !== profileEntry.world.id) throw loadError('tier_world_id_invalid', `World expected ${profileEntry.world.id}, received ${worldLoaded.value?.id || 'missing'}`, null);

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
    if (!value || value.schema !== 'simulatte.tierApplicationManifest.v3' || !value.tiers || typeof value.tiers !== 'object' || Array.isArray(value.tiers)) throw loadError('tier_manifest_invalid', 'Expected simulatte.tierApplicationManifest.v3', null);
    exactKeys(value, ['generatedAt', 'id', 'schema', 'tiers'], 'tier_manifest_keys_invalid', 'Tier application manifest');
    if (typeof value.id !== 'string' || !value.id || typeof value.generatedAt !== 'string' || !value.generatedAt) throw loadError('tier_manifest_identity_invalid', 'Tier application manifest expected non-empty id and generatedAt', null);
    Object.entries(value.tiers).forEach(([tier, row]) => {
      if (!row || typeof row.defaultProfileId !== 'string' || !row.defaultProfileId || !Array.isArray(row.profiles) || !row.profiles.length) throw loadError('tier_manifest_row_invalid', `Tier ${tier} is incomplete`, { tier });
      if (Object.hasOwn(row, 'world')) throw loadError('tier_manifest_mixed_version', `Tier ${tier} retains a v2 tier-level world`, { tier });
      exactKeys(row, ['defaultProfileId', 'profiles'], 'tier_manifest_row_keys_invalid', `Tier ${tier}`);
      const ids = new Set();
      row.profiles.forEach((profile) => {
        exactKeys(profile, ['id', 'path', 'sha256', 'world'], 'tier_profile_reference_keys_invalid', `Tier ${tier} profile`);
        validateReference(profile, `Tier ${tier} profile`);
        if (!profile.world) throw loadError('tier_profile_world_missing', `Tier ${tier} profile ${profile.id} has no world reference`, { tier, profileId: profile.id });
        exactKeys(profile.world, ['id', 'path', 'sha256'], 'tier_world_reference_keys_invalid', `Tier ${tier} profile ${profile.id} world`);
        validateReference(profile.world, `Tier ${tier} profile ${profile.id} world`);
        if (ids.has(profile.id)) throw loadError('tier_profile_duplicate', `Tier ${tier} duplicates profile ${profile.id}`, { tier, profileId: profile.id });
        ids.add(profile.id);
      });
      if (!ids.has(row.defaultProfileId)) throw loadError('tier_default_profile_missing', `Tier ${tier} default profile ${row.defaultProfileId} is not declared`, { tier, defaultProfileId: row.defaultProfileId });
    });
    return value;
  }
  function validateReference(row, label) { if (!row || typeof row.id !== 'string' || !row.id || typeof row.path !== 'string' || !row.path || !/^[a-f0-9]{64}$/.test(row.sha256 || '')) throw loadError('tier_reference_invalid', `${label} expected non-empty id, path, and SHA-256`, row); }
  function exactKeys(value, expected, code, label) {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
      throw loadError(code, `${label} keys do not match manifest v3`, { actual, expected: wanted });
    }
  }
  function assertDependencies() { const rows = [['transport',transportApi,'createBrowserTransport'],['artifactStore',artifactStoreApi,'createGovernedArtifactStore'],['dataCatalog',dataCatalogApi,'createDataCatalog'],['contracts',contracts,'validateProfile'],['schemaRegistry',schemaRegistryApi,'createSchemaRegistry'],['registry',registry,'entry'],['paths',pluginPaths,'pluginBaseFromDocument'],['receipts',receipts,'sha256Hex'],['loadContext',loadContext,'createDataServices']]; loadContext.assertDependencies(rows, (message) => loadError('tier_loader_dependency_missing', message, null)); }
  function defaultFetch() { return loadContext.defaultFetch(); }
  function documentBase() { return loadContext.documentBase(); }
  function loadError(code, message, evidence) { return loadContext.createLoadError('SimulatteTierLoadError', code, message, evidence); }
  return Object.freeze({ DEFAULT_MANIFEST, loadTierApplication, resolveProfileForTier, validateTierManifest });
});
