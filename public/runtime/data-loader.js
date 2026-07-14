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
  const api = factory(contracts, receipts, regions);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyDataLoader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyDataLoader(contracts, receipts, regions) {
  async function loadAutonomyData(manifestUrl = '../data/autonomy/autonomy-manifest.json', fetchImpl = fetch) {
    const resolvedManifestUrl = new URL(manifestUrl, documentBase()).toString();
    const manifest = await fetchJson(resolvedManifestUrl, fetchImpl);
    contracts.validateManifest(manifest.value);
    const directKeys = ['embodiment', 'policy', 'occurrenceCatalog', 'rerankerEvidence', 'regionRegistry'];
    const refs = await Promise.all(directKeys.map(async (key) => [key, await loadReference(manifest.value[key], resolvedManifestUrl, key, fetchImpl)]));
    const loaded = Object.fromEntries(refs);
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
      embodiment: loaded.embodiment.sha256,
      policy: loaded.policy.sha256,
    });
    contracts.validateEmbodiment(loaded.embodiment.value);
    contracts.validatePolicy(loaded.policy.value);
    return {
      schema: 'simulatte.autonomyLoadedData.v1',
      manifest: manifest.value,
      world: composition.world,
      embodiment: loaded.embodiment.value,
      policy: loaded.policy.value,
      featureCatalog: composition.featureCatalog,
      occurrenceCatalog: loaded.occurrenceCatalog.value,
      rerankerEvidence: loaded.rerankerEvidence.value,
      regionRegistry: registry,
      regionPacks: packRows.map((row) => row.value),
      regionComposition: composition.receipt,
      receipt: {
        schema: 'simulatte.autonomyDataLoadReceipt.v1',
        manifestUrl: resolvedManifestUrl,
        assets: {
          ...Object.fromEntries(refs.map(([key, row]) => [key, assetReceipt(row)])),
          world: { id: composition.world.id, sha256: worldHash, source: 'verified_region_composition' },
          featureCatalog: { id: composition.featureCatalog.id, sha256: featureCatalogHash, source: 'verified_region_composition' },
        },
        regionPacks: packRows.map(assetReceipt),
        regionComposition: structuredClone(composition.receipt),
        claimBoundary: manifest.value.claimBoundary,
      },
    };
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
    const response = await fetchImpl(url);
    if (!response || !response.ok) {
      throw loadError('asset_fetch_failed', `${url} expected HTTP success, received ${response && response.status || 'no response'}`, { url, status: response && response.status || null });
    }
    const text = await response.text();
    try {
      return { text, value: JSON.parse(text) };
    } catch (error) {
      throw loadError('asset_json_invalid', `${url} expected valid JSON, received ${error.message}`, { url });
    }
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
