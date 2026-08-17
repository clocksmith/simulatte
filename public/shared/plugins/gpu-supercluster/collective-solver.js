(function attachCollectiveSolver(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCollectiveSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCollectiveSolver() {
  function solveCollectives({
    totalGpus = 256,
    tensorSizeGb = 14.2,
    algorithm = 'ring-allreduce',
    parallelism = { tensorParallel: 8, pipelineParallel: 4, dataParallel: 8 },
    nvlinkBandwidthGbps = 900,
    infinibandBandwidthGbps = 800,
    stragglerThrottlePercent = 0,
    linkPacketDropRate = 0,
    gpuTdpW = 700,
  } = {}) {
    const tensorSizeBytes = tensorSizeGb * 1e9;
    const tp = Math.max(1, parallelism.tensorParallel || 8);
    const pp = Math.max(1, parallelism.pipelineParallel || 4);
    const dp = Math.max(1, parallelism.dataParallel || 8);
    const effectiveClusterGpus = tp * pp * dp;

    // 1. Intra-Node Tensor Parallel Transfer Time (NVLink crossbar)
    const tpBandwidthBps = (nvlinkBandwidthGbps * 1e9) / 8;
    const tpTransferTimeSec = (2 * (tp - 1) / tp) * (tensorSizeBytes / (pp * dp)) / tpBandwidthBps;

    // 2. Inter-Node Data Parallel AllReduce Transfer Time (InfiniBand Spine-Leaf)
    const ibBandwidthBps = (infinibandBandwidthGbps * 1e9) / 8;
    let dpTransferTimeSec = 0;

    if (algorithm === 'tree-allreduce') {
      // Double-Binary Tree AllReduce: 2 * log2(dp) * alpha + 2 * (dp - 1)/dp * S / (2 * B)
      const treeLatencyAlpha = 2e-6; // 2 microseconds per hop
      const logSteps = Math.ceil(Math.log2(dp));
      dpTransferTimeSec = (2 * logSteps * treeLatencyAlpha) + ((2 * (dp - 1) / dp) * (tensorSizeBytes / tp) / ibBandwidthBps);
    } else if (algorithm === '2d-torus-all-to-all') {
      // 2D Torus: Split communication across row/col dimensions
      const dim = Math.sqrt(dp);
      dpTransferTimeSec = (4 * (dim - 1) / dim) * (tensorSizeBytes / tp) / ibBandwidthBps;
    } else {
      // Default: Ring-AllReduce: 2 * (dp - 1) / dp * S / B
      const ringHops = 2 * (dp - 1);
      const ringHopLatencyAlpha = 1.2e-6;
      dpTransferTimeSec = (ringHops * ringHopLatencyAlpha) + (2 * (dp - 1) / dp) * (tensorSizeBytes / tp) / ibBandwidthBps;
    }

    // Packet drop retransmission penalty
    if (linkPacketDropRate > 0) {
      const dropPenaltyMultiplier = 1 + (linkPacketDropRate * 4.5);
      dpTransferTimeSec *= dropPenaltyMultiplier;
    }

    // 3. Pipeline Bubble Delay Calculation
    // Bubble fraction F_bubble = (PP - 1) / (PP + numMicrobatches - 1)
    const numMicrobatches = Math.max(1, pp * 4);
    const bubbleFraction = (pp - 1) / (pp + numMicrobatches - 1);

    // 4. Compute Base Forward + Backward Pass Time
    // Peak theoretical compute for 256 H100s at FP8 (~1979 TFLOPS peak per GPU)
    const peakGpuTflopsFp8 = 1979;
    const totalPeakClusterTflops = totalGpus * peakGpuTflopsFp8;
    // Standard transformer step compute: ~1.7 PFLOPs per step
    const stepFlops = tensorSizeBytes * 120000;
    const idealComputeTimeSec = stepFlops / (totalPeakClusterTflops * 1e12);

    // Compute execution time with pipeline bubbles
    const computeTimeWithBubblesSec = idealComputeTimeSec * (1 + bubbleFraction);

    // 5. Tail-Latency Straggler Drag
    // In synchronous AllReduce, the slowest worker sets the step barrier
    let stragglerDelaySec = 0;
    if (stragglerThrottlePercent > 0) {
      const throttleFraction = Math.min(0.95, stragglerThrottlePercent / 100);
      const throttledComputeTime = computeTimeWithBubblesSec / (1 - throttleFraction);
      stragglerDelaySec = throttledComputeTime - computeTimeWithBubblesSec;
    }

    // Total Step Execution Time (ms)
    const totalStepTimeSec = computeTimeWithBubblesSec + tpTransferTimeSec + dpTransferTimeSec + stragglerDelaySec;
    const totalStepTimeMs = totalStepTimeSec * 1000;

    // Actual MFU (Model FLOPs Utilization) and effective TFLOPS
    const modelFlopsUtilization = Math.max(0.01, Math.min(0.85, idealComputeTimeSec / totalStepTimeSec));
    const effectiveClusterTflops = totalPeakClusterTflops * modelFlopsUtilization;

    // Communication vs Compute breakdown
    const commTimeMs = (tpTransferTimeSec + dpTransferTimeSec) * 1000;
    const computeTimeMs = computeTimeWithBubblesSec * 1000;
    const commOverheadPercent = (commTimeMs / (totalStepTimeMs || 1)) * 100;

    return Object.freeze({
      algorithm,
      totalGpus,
      parallelism: Object.freeze({ ...parallelism }),
      tensorSizeGb,
      stepTimeMs: Number(totalStepTimeMs.toFixed(2)),
      computeTimeMs: Number(computeTimeMs.toFixed(2)),
      commTimeMs: Number(commTimeMs.toFixed(2)),
      bubbleFraction: Number(bubbleFraction.toFixed(4)),
      stragglerDelayMs: Number((stragglerDelaySec * 1000).toFixed(2)),
      commOverheadPercent: Number(commOverheadPercent.toFixed(1)),
      modelFlopsUtilization: Number((modelFlopsUtilization * 100).toFixed(1)),
      effectiveClusterTflops: Number(effectiveClusterTflops.toFixed(1)),
      totalPeakClusterTflops,
      bandwidthBottleneck: dpTransferTimeSec > tpTransferTimeSec ? 'InfiniBand Inter-Rack' : 'NVLink Intra-Node',
    });
  }

  return Object.freeze({ solveCollectives });
});
