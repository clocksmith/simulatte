(function attachGpuSuperclusterPlugin(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePluginGpuSupercluster = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGpuSuperclusterPlugin(root) {
  const PLUGIN_ID = 'gpu-supercluster';

  function dependency(globalName, path) {
    const value = typeof module === 'object' && module.exports ? require(path) : root[globalName];
    if (!value) throw new Error(`gpu_supercluster_dependency_missing: ${globalName}`);
    return value;
  }

  function simulate(config = {}) {
    const topologyApi = dependency('SimulatteClusterTopology', './cluster-topology.js');
    const collectiveApi = dependency('SimulatteCollectiveSolver', './collective-solver.js');
    const thermalApi = dependency('SimulatteThermalModel', './thermal-model.js');
    const receiptApi = dependency('SimulatteClusterReceiptFactory', './receipt-factory.js');
    const presentationApi = dependency('SimulatteClusterPresentation', './presentation.js');
    const v4Api = dependency('SimulatteGpuSuperclusterV4', './v4-contribution.js');

    const topology = topologyApi.buildClusterTopology(config);
    const collectives = collectiveApi.solveCollectives({
      totalGpus: config.totalGpus || 256,
      tensorSizeGb: config.tensorSizeGb || 14.2,
      algorithm: config.collectiveAlgorithm || 'ring-allreduce',
      parallelism: config.parallelism || { tensorParallel: 8, pipelineParallel: 4, dataParallel: 8 },
      nvlinkBandwidthGbps: config.nvlinkBandwidthGbps || 900,
      infinibandBandwidthGbps: config.infinibandBandwidthGbps || 800,
      stragglerThrottlePercent: config.stragglerThrottlePercent || 0,
      linkPacketDropRate: config.linkPacketDropRate || 0,
      gpuTdpW: config.gpuTdpW || 700,
    });

    const thermals = thermalApi.solveThermals({
      totalGpus: config.totalGpus || 256,
      racksCount: config.racks || 32,
      gpuTdpW: config.gpuTdpW || 700,
      coolantInletTempC: config.coolantInletTempC || 22.0,
      coolantFlowLpm: config.coolantFlowLpm || 120.0,
      ambientAirTempC: config.ambientAirTempC || 24.0,
      cduFlowDegradationPercent: config.cduFlowDegradationPercent || 0,
      activeMfuFraction: (collectives.modelFlopsUtilization || 55) / 100,
    });

    const receipt = receiptApi.createClusterReceipt({
      config,
      topology,
      collectives,
      thermals,
    });

    return Object.freeze({
      config: Object.freeze({ ...config }),
      topology,
      collectives,
      thermals,
      receipt,
      createSemanticPresentation: (progressiveState = {}) => presentationApi.createSemanticPresentation({
        config,
        topology,
        collectives,
        thermals,
        progressiveState,
      }),
      createContribution: (step = 0, world = {}) => v4Api.createContribution({
        result: { topology, collectives, thermals },
        step,
        world,
      }),
    });
  }

  async function activate({ sdk, config, profile, scenario } = {}) {
    const activeConfig = {
      totalGpus: 256,
      racks: 32,
      nodesPerRack: 8,
      gpusPerNode: 8,
      parallelism: { tensorParallel: 8, pipelineParallel: 4, dataParallel: 8 },
      collectiveAlgorithm: 'ring-allreduce',
      tensorSizeGb: 14.2,
      nvlinkBandwidthGbps: 900,
      infinibandBandwidthGbps: 800,
      coolantInletTempC: 22.0,
      coolantFlowLpm: 120.0,
      ambientAirTempC: 24.0,
      gpuTdpW: 700,
      stragglerThrottlePercent: 0,
      linkPacketDropRate: 0.0,
      cduFlowDegradationPercent: 0,
      ...(config || {}),
    };

    let current = simulate(activeConfig);

    function reduce(state = {}, action = {}) {
      if (action.type === 'update-controls') {
        const nextConfig = { ...state.config, ...(action.controls || {}) };
        current = simulate(nextConfig);
        return {
          ...state,
          config: nextConfig,
          result: current,
          lastAction: 'update-controls',
        };
      }
      return state;
    }

    if (sdk && sdk.state) {
      sdk.state.register(reduce, {
        config: activeConfig,
        result: current,
        progressive: { progress: 0 },
        lastAction: 'activated',
      });
    }

    return current;
  }

  return Object.freeze({
    id: PLUGIN_ID,
    simulate,
    activate,
  });
});
