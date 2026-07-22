(function attachTierApplicationLoader(root, factory) {
  const api = factory();
  root.SimulatteTierApplicationLoader = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createTierApplicationLoaderApi() {
  async function loadTierApplicationManifest(fetchFn = globalThis.fetch) {
    const url = '/data/simulatte/tier-application-manifest.json';
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`Failed to load tier application manifest: ${res.status}`);
    return res.json();
  }

  function resolveProfileForTier(manifest, tier, requestedProfileId = null) {
    const tierConfig = manifest.tiers?.[tier] || manifest.tiers?.['city'];
    if (!tierConfig) throw new Error(`Unknown scale tier ${tier}`);
    if (requestedProfileId) {
      const found = tierConfig.profiles.find((p) => p.id === requestedProfileId);
      if (found) return found;
    }
    const defaultProfile = tierConfig.profiles.find((p) => p.id === tierConfig.defaultProfileId);
    return defaultProfile || tierConfig.profiles[0];
  }

  return Object.freeze({
    loadTierApplicationManifest,
    resolveProfileForTier,
  });
});
