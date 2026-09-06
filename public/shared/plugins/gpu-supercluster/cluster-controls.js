(function attachClusterControls(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteClusterControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createClusterControls() {
  function normalizeControls(rawControls = {}) {
    const bounded = (key, fallback, min, max) => {
      const value = rawControls[key] === undefined ? fallback : Number(rawControls[key]);
      if (!Number.isFinite(value) || rawControls[key] === null || rawControls[key] === '') {
        throw new Error(`gpu_control_invalid: ${key}`);
      }
      return Math.max(min, Math.min(max, value));
    };
    return Object.freeze({
      collectiveAlgorithm: ['ring-allreduce', 'tree-allreduce', '2d-torus-all-to-all'].includes(rawControls.collectiveAlgorithm)
        ? rawControls.collectiveAlgorithm
        : 'ring-allreduce',
      tensorSizeGb: bounded('tensorSizeGb', 14.2, 0.1, 1000),
      stragglerThrottlePercent: bounded('stragglerThrottlePercent', 0, 0, 95),
      coolantFlowLpm: bounded('coolantFlowLpm', 120, 10, 1000),
      linkPacketDropRate: bounded('linkPacketDropRate', 0, 0, 0.5),
      cduFlowDegradationPercent: bounded('cduFlowDegradationPercent', 0, 0, 90),
      activeParallelism: Object.freeze({
        tensorParallel: Number(rawControls.tensorParallel || 8),
        pipelineParallel: Number(rawControls.pipelineParallel || 4),
        dataParallel: Number(rawControls.dataParallel || 8),
      }),
    });
  }

  return Object.freeze({ normalizeControls });
});
