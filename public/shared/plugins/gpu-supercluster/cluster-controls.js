(function attachClusterControls(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteClusterControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createClusterControls() {
  function normalizeControls(rawControls = {}) {
    return Object.freeze({
      collectiveAlgorithm: ['ring-allreduce', 'tree-allreduce', '2d-torus-all-to-all'].includes(rawControls.collectiveAlgorithm)
        ? rawControls.collectiveAlgorithm
        : 'ring-allreduce',
      tensorSizeGb: Number(rawControls.tensorSizeGb || 14.2),
      stragglerThrottlePercent: Math.max(0, Math.min(95, Number(rawControls.stragglerThrottlePercent || 0))),
      coolantFlowLpm: Math.max(10, Math.min(1000, Number(rawControls.coolantFlowLpm || 120))),
      linkPacketDropRate: Math.max(0, Math.min(0.5, Number(rawControls.linkPacketDropRate || 0))),
      cduFlowDegradationPercent: Math.max(0, Math.min(90, Number(rawControls.cduFlowDegradationPercent || 0))),
      activeParallelism: Object.freeze({
        tensorParallel: Number(rawControls.tensorParallel || 8),
        pipelineParallel: Number(rawControls.pipelineParallel || 4),
        dataParallel: Number(rawControls.dataParallel || 8),
      }),
    });
  }

  return Object.freeze({ normalizeControls });
});
