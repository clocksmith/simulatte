(function attachDatasetValidators(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGpuSuperclusterValidators = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createDatasetValidators() {
  function validateWorldDataset(world) {
    if (!world || typeof world !== 'object') return false;
    if (world.tier !== 'datacenter') return false;
    if (!Array.isArray(world.racks) || world.racks.length === 0) return false;
    return true;
  }

  function validateConfig(config) {
    if (!config || typeof config !== 'object') return false;
    if (config.schema !== 'simulatte.plugin.gpuSuperclusterConfig.v1') return false;
    if (!Number.isFinite(config.totalGpus) || config.totalGpus <= 0) return false;
    return true;
  }

  return Object.freeze({ validateWorldDataset, validateConfig });
});
