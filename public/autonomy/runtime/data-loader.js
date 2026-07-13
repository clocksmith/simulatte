(function attachAutonomyDataLoader(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../contracts/contract-validator.js')
    : root.SimulatteAutonomyContracts;
  const receipts = typeof module === 'object' && module.exports
    ? require('./canonical-receipts.js')
    : root.SimulatteAutonomyReceipts;
  const api = factory(contracts, receipts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteAutonomyDataLoader = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAutonomyDataLoader(contracts, receipts) {
  async function loadAutonomyData(manifestUrl = '../data/autonomy/autonomy-manifest.json', fetchImpl = fetch) {
    const resolvedManifestUrl = new URL(manifestUrl, documentBase()).toString();
    const manifest = await fetchJson(resolvedManifestUrl, fetchImpl);
    contracts.validateManifest(manifest.value);
    const refs = await Promise.all(['world', 'embodiment', 'policy', 'featureCatalog', 'occurrenceCatalog', 'rerankerEvidence'].map(async (key) => {
      const reference = manifest.value[key];
      const url = new URL(reference.path, resolvedManifestUrl).toString();
      const loaded = await fetchJson(url, fetchImpl);
      const actualHash = await receipts.sha256Hex(loaded.text);
      if (actualHash !== reference.sha256) {
        throw loadError('asset_hash_mismatch', `${key} ${url} expected ${reference.sha256}, received ${actualHash}`, {
          key,
          url,
          expectedSha256: reference.sha256,
          actualSha256: actualHash,
        });
      }
      if (loaded.value.id !== reference.id) {
        throw loadError('asset_identity_mismatch', `${key} expected ID ${reference.id}, received ${loaded.value.id || 'missing'}`, {
          key,
          expectedId: reference.id,
          actualId: loaded.value.id || null,
        });
      }
      return [key, { ...loaded, url, sha256: actualHash }];
    }));
    const loaded = Object.fromEntries(refs);
    contracts.validateFeatureCatalog(loaded.featureCatalog.value);
    contracts.validateWorld(loaded.world.value, loaded.featureCatalog.value);
    contracts.validateOccurrenceCatalog(loaded.occurrenceCatalog.value, loaded.world.value);
    contracts.validateRerankerEvidence(loaded.rerankerEvidence.value, loaded.featureCatalog.value, {
      world: loaded.world.sha256,
      featureCatalog: loaded.featureCatalog.sha256,
      embodiment: loaded.embodiment.sha256,
      policy: loaded.policy.sha256,
    });
    contracts.validateEmbodiment(loaded.embodiment.value);
    contracts.validatePolicy(loaded.policy.value);
    return {
      schema: 'simulatte.autonomyLoadedData.v1',
      manifest: manifest.value,
      world: loaded.world.value,
      embodiment: loaded.embodiment.value,
      policy: loaded.policy.value,
      featureCatalog: loaded.featureCatalog.value,
      occurrenceCatalog: loaded.occurrenceCatalog.value,
      rerankerEvidence: loaded.rerankerEvidence.value,
      receipt: {
        schema: 'simulatte.autonomyDataLoadReceipt.v1',
        manifestUrl: resolvedManifestUrl,
        assets: Object.fromEntries(refs.map(([key, row]) => [key, { id: row.value.id, url: row.url, sha256: row.sha256 }])),
        claimBoundary: manifest.value.claimBoundary,
      },
    };
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
    return 'http://localhost/autonomy/';
  }

  function loadError(code, message, evidence) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'AutonomyDataLoadError';
    error.code = code;
    error.evidence = evidence;
    return error;
  }

  return { loadAutonomyData, fetchJson };
});
