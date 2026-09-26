(function attachCollectiveSolver(root, factory) {
  const topology = typeof module === 'object' && module.exports ? require('./cluster-topology.js') : root.SimulatteClusterTopology;
  const api = factory(topology);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteCollectiveSolver = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createCollectiveSolver(topologyApi) {
  // Synchronous store-and-forward rounds share each directed physical link.
  // This conservative network model is not a calibrated NCCL performance model.
  function planCollective({ topology, groups, bytes, algorithm, loss = 0 }) {
    if (!Number.isFinite(bytes) || bytes < 0 || !Number.isFinite(loss) || loss < 0 || loss >= 1 ||
      !['ring-allreduce', 'tree-allreduce', '2d-torus-all-to-all'].includes(algorithm)) throw Error('gpu_collective_invalid');
    const nodes = new Map(topology.gpus.map(g => [g.id, []]));
    if (nodes.size !== topology.gpus.length || nodes.size > 4096) throw Error('gpu_collective_nodes_invalid');
    const linkIds = new Set();
    for (const link of topology.links) {
      if (linkIds.has(link.id) || !nodes.has(link.sourceGpuId) || !nodes.has(link.targetGpuId) ||
        !(link.bandwidthGbps > 0) || !Number.isFinite(link.bandwidthGbps) ||
        !(link.latencySeconds >= 0) || !Number.isFinite(link.latencySeconds)) throw Error('gpu_collective_link_invalid');
      linkIds.add(link.id);
      for (const [from, to] of [[link.sourceGpuId, link.targetGpuId], [link.targetGpuId, link.sourceGpuId]]) {
        nodes.get(from).push({ from, to, id: link.id, key: `${link.id}:${from}`, bandwidth: link.bandwidthGbps * 1e9 / 8, latency: link.latencySeconds });
      }
    }
    const routes = new Map();
    function route(from, to) {
      const key = `${from}:${to}`;
      if (routes.has(key)) return routes.get(key);
      const queue = [from], previous = new Map([[from, null]]);
      for (let i = 0; i < queue.length && !previous.has(to); i++) {
        for (const edge of nodes.get(queue[i])) if (!previous.has(edge.to)) { previous.set(edge.to, edge); queue.push(edge.to); }
      }
      if (!previous.has(to)) throw Error(`gpu_collective_disconnected: ${from} -> ${to}`);
      const path = []; let cursor = to;
      while (cursor !== from) { const edge = previous.get(cursor); path.unshift(edge); cursor = edge.from; }
      routes.set(key, path); return path;
    }
    const schedules = groups.map(group => {
      if (!group.length || new Set(group).size !== group.length || group.some(id => !nodes.has(id))) throw Error('gpu_collective_group_invalid');
      const n = group.length, rounds = [];
      const transfer = (from, to, size) => ({ from: group[from], to: group[to], bytes: size });
      if (algorithm === 'tree-allreduce') {
        // Two complementary binary trees carry half the tensor each. Rotating
        // the second tree puts its internal ranks in the first tree's leaves.
        const trees = [0, Math.floor(n / 2)].map(shift => {
          const levels = [];
          for (let child = 1; child < n; child++) {
            const depth = Math.floor(Math.log2(child + 1)) - 1;
            (levels[depth] ||= []).push({...transfer((child + shift) % n,
              (Math.floor((child - 1) / 2) + shift) % n, bytes / 2), partition: shift === 0 ? 0 : 1});
          }
          const reduce = levels.reverse();
          return [...reduce, ...reduce.slice().reverse().map(round => round.map(t => ({...t, from:t.to, to:t.from})))];
        });
        for (let i = 0; i < trees[0].length; i++) rounds.push([...trees[0][i], ...trees[1][i]]);
      } else if (algorithm === 'ring-allreduce') {
        for (let step = 0; step < 2 * (n - 1); step++) rounds.push(group.map((_, i) => transfer(i, (i + 1) % n, bytes / n)));
      } else {
        // A logical rectangular torus uses row then column forwarding. Each
        // hop delivers one bucket and forwards the remaining destination buckets.
        // Physical paths still use the supplied graph and its shared capacities.
        let rows = Math.floor(Math.sqrt(n));
        while (n % rows) rows--;
        const cols = n / rows;
        for (let hop = 1; hop < cols; hop++) rounds.push(group.map((_, i) =>
          transfer(i, Math.floor(i / cols) * cols + (i + 1) % cols, bytes * (cols - hop) / cols)));
        for (let hop = 1; hop < rows; hop++) rounds.push(group.map((_, i) =>
          transfer(i, (i + cols) % n, bytes * (rows - hop) / rows)));
      }
      return rounds;
    });
    let durationMs = 0, logicalBytes = 0;
    const rounds = Array.from({ length: Math.max(0, ...schedules.map(s => s.length)) }, (_, index) => {
      const transfers = schedules.flatMap(s => s[index] || []).map(t => ({ ...t, path: route(t.from, t.to) }));
      const hops = Math.max(0, ...transfers.map(t => t.path.length)), links = new Map(), stages = []; let seconds = 0;
      for (let hop = 0; hop < hops; hop++) {
        const loads = new Map();
        for (const t of transfers) {
          const edge = t.path[hop]; if (!edge) continue;
          const amount = t.bytes / (1 - loss);
          const load = loads.get(edge.key) || { edge, bytes: 0 }; load.bytes += amount; loads.set(edge.key, load);
          const aggregate = links.get(edge.key) || { id: edge.id, from: edge.from, to: edge.to, bytes: 0, bandwidthBps: edge.bandwidth };
          aggregate.bytes += amount; links.set(edge.key, aggregate);
        }
        const hopSeconds = Math.max(0, ...[...loads.values()].map(load => load.bytes / load.edge.bandwidth + load.edge.latency));
        stages.push(Object.freeze({ startMs: seconds * 1000, durationMs: hopSeconds * 1000,
          links: Object.freeze([...loads.values()].map(({edge,bytes}) => Object.freeze({id:edge.id,from:edge.from,to:edge.to,bytes}))) }));
        seconds += hopSeconds;
      }
      const startMs = durationMs; durationMs += seconds * 1000;
      logicalBytes += transfers.reduce((sum, t) => sum + t.bytes, 0);
      return Object.freeze({ index, startMs, durationMs: seconds * 1000, stages: Object.freeze(stages),
        transfers: Object.freeze(transfers.map(({ path, ...t }) => Object.freeze({ ...t, linkIds: Object.freeze(path.map(e => e.id)) }))),
        links: Object.freeze([...links.values()].map(Object.freeze)) });
    });
    return Object.freeze({ schema: 'simulatte.collectivePlan.v1', algorithm, operation: algorithm === '2d-torus-all-to-all' ? 'all-to-all' : 'allreduce',
      routing: 'deterministic-shortest-hop', transport: 'synchronous-store-and-forward-full-duplex',
      lossModel: 'independent-retry-expected-bytes', durationMs, logicalBytes, rounds: Object.freeze(rounds) });
  }

  function solveCollectives({
    totalGpus = 256,
    tensorSizeGb = 14.2,
    algorithm = 'ring-allreduce',
    parallelism = { tensorParallel: 8, pipelineParallel: 4, dataParallel: 8 },
    nvlinkBandwidthGbps = 3600,
    infinibandBandwidthGbps = 800,
    stragglerThrottlePercent = 0,
    linkPacketDropRate = 0,
    gpuTdpW = 700,
    thermalClockFraction = 1,
    topology = null,
  } = {}) {
    const tensorSizeBytes = tensorSizeGb * 1e9;
    const tp = parallelism.tensorParallel, pp = parallelism.pipelineParallel, dp = parallelism.dataParallel;
    if (![totalGpus,tp,pp,dp].every(n=>Number.isInteger(n)&&n>0&&n<=4096) ||
      ![tensorSizeGb,nvlinkBandwidthGbps,infinibandBandwidthGbps].every(n=>Number.isFinite(n)&&n>0) ||
      !Number.isFinite(stragglerThrottlePercent)||stragglerThrottlePercent<0||stragglerThrottlePercent>95) throw Error('gpu_collective_inputs_invalid');
    const effectiveClusterGpus = tp * pp * dp;
    if (effectiveClusterGpus !== totalGpus) throw new Error('gpu_parallelism_must_match_cluster');

    // H100's 900 GB/s bidirectional aggregate is modeled as 450 GB/s per direction.
    const tpBandwidthBps = (nvlinkBandwidthGbps * 1e9) / 8;
    const tpTransferTimeSec = (2 * (tp - 1) / tp) * (tensorSizeBytes / (pp * dp)) / tpBandwidthBps;

    const network = topology || topologyApi.buildClusterTopology({ totalGpus, racks: Math.max(1, totalGpus / tp), gpusPerNode: tp, nvlinkBandwidthGbps, infinibandBandwidthGbps });
    if(network.gpus.length!==totalGpus)throw Error('gpu_collective_population_mismatch');
    const groups = [];
    for (let p = 0; p < pp; p++) for (let t = 0; t < tp; t++) {
      groups.push(Array.from({ length: dp }, (_, d) => network.gpus[(d * pp + p) * tp + t].id));
    }
    const communicationPlan = planCollective({ topology: network, groups, bytes: tensorSizeBytes / tp, algorithm, loss: linkPacketDropRate });
    const dpTransferTimeSec = communicationPlan.durationMs / 1000;

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
    if (!Number.isFinite(thermalClockFraction) || thermalClockFraction <= 0 || thermalClockFraction > 1) {
      throw new Error('gpu_thermal_clock_invalid');
    }
    const computeTimeWithBubblesSec = idealComputeTimeSec / ((1 - bubbleFraction) * thermalClockFraction);

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
    const modelFlopsUtilization = idealComputeTimeSec / totalStepTimeSec;
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
      stepTimeMs: totalStepTimeMs,
      computeTimeMs: computeTimeMs,
      commTimeMs: commTimeMs,
      bubbleFraction: bubbleFraction,
      stragglerDelayMs: (stragglerDelaySec * 1000),
      commOverheadPercent: commOverheadPercent,
      modelFlopsUtilization: (modelFlopsUtilization * 100),
      effectiveClusterTflops: effectiveClusterTflops,
      totalPeakClusterTflops,
      bandwidthBottleneck: dpTransferTimeSec > tpTransferTimeSec ? 'InfiniBand Inter-Rack' : 'NVLink Intra-Node',
      thermalClockFraction,
      communicationPlan,
      tensorTransferMs: tpTransferTimeSec * 1000,
    });
  }

  return Object.freeze({ solveCollectives, planCollective });
});
