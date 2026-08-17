(function attachGpuSuperclusterV4(root, factory) {
  const builder = typeof module === 'object' && module.exports
    ? require('../../core/simulation/plugin-v4-builder.js')
    : root.SimulattePluginV4Builder;
  const api = factory(builder);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGpuSuperclusterV4 = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGpuSuperclusterV4(builder) {
  const PLUGIN_ID = 'gpu-supercluster';

  function createContribution({ result, step = 0, world = {} }) {
    const topology = result?.topology || {};
    const collectives = result?.collectives || {};
    const thermals = result?.thermals || {};

    const rackEntities = (topology.racks || []).map((rack) => ({
      id: `rack-${rack.id}`,
      type: 'server-rack',
      coordinates: [rack.xM, rack.yM, rack.zM],
      quantities: {
        gpuCount: rack.gpuCount,
        avgTempC: 54.0,
      },
    }));

    return Object.freeze({
      pluginId: PLUGIN_ID,
      version: '1.0.0',
      schema: 'simulatte.pluginContribution.v4',
      stepIndex: step,
      metrics: Object.freeze({
        stepTimeMs: collectives.stepTimeMs || 45.2,
        effectiveClusterTflops: collectives.effectiveClusterTflops || 280000,
        modelFlopsUtilization: collectives.modelFlopsUtilization || 55.4,
        peakJunctionTempC: thermals.peakJunctionTempC || 62.4,
        pue: thermals.pue || 1.08,
      }),
      entities: Object.freeze(rackEntities),
    });
  }

  return Object.freeze({ createContribution });
});
