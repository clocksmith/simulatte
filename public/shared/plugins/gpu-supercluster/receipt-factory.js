(function attachReceiptFactory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteClusterReceiptFactory = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createReceiptFactory() {
  function createClusterReceipt({
    config = {},
    topology = {},
    collectives = {},
    thermals = {},
  } = {}) {
    return Object.freeze({
      schema: 'simulatte.gpuSuperclusterReceipt.v1',
      seed: config.seed || 'supercluster-gpt-001',
      cluster: Object.freeze({
        totalGpus: topology.totalGpus || 256,
        racksCount: topology.racksCount || 32,
        interconnect: Object.freeze({
          nvlinkCount: topology.nvlinkCount || 0,
          infinibandCount: topology.infinibandCount || 0,
        }),
      }),
      metrics: Object.freeze({
        stepTimeMs: collectives.stepTimeMs,
        computeTimeMs: collectives.computeTimeMs,
        commTimeMs: collectives.commTimeMs,
        commOverheadPercent: collectives.commOverheadPercent,
        modelFlopsUtilization: collectives.modelFlopsUtilization,
        effectiveClusterTflops: collectives.effectiveClusterTflops,
        peakJunctionTempC: thermals.peakJunctionTempC,
        totalItPowerKw: thermals.totalItPowerKw,
        pue: thermals.pue,
        throttledGpuCount: thermals.throttledGpuCount,
      }),
      modelReceipts: Object.freeze([
        Object.freeze({
          modelId: 'distributed-collective-ring-tree-v1',
          parameterSourceIds: Object.freeze(['datacenter.supercluster.topology.v1']),
          omissionIds: Object.freeze(['pcie-host-memory-dma-simplified', 'dram-refresh-jitter-unmodeled']),
          truth: Object.freeze({
            origin: 'modeled',
            temporalStatus: 'forecast',
            uncertainty: Object.freeze({
              kind: 'interval',
              value: Object.freeze({
                stepTimeMs: Object.freeze([collectives.stepTimeMs * 0.95, collectives.stepTimeMs * 1.05]),
              }),
            }),
          }),
        }),
        Object.freeze({
          modelId: 'direct-to-chip-liquid-cooling-ode-v1',
          parameterSourceIds: Object.freeze(['facility.cooling.cdu-distribution.v1']),
          truth: Object.freeze({
            origin: 'modeled',
            temporalStatus: 'forecast',
            uncertainty: Object.freeze({
              kind: 'interval',
              value: Object.freeze({
                peakTempC: Object.freeze([thermals.peakJunctionTempC - 2.0, thermals.peakJunctionTempC + 2.0]),
              }),
            }),
          }),
        }),
      ]),
      claimBoundary: 'Deterministic 256-GPU cluster simulation modeling intra-node NVLink, inter-rack 800G InfiniBand AllReduce collectives, direct-to-chip liquid cooling thermodynamics, and thermal throttling.',
    });
  }

  return Object.freeze({ createClusterReceipt });
});
