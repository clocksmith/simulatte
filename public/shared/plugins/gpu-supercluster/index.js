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

  function simulate(rawConfig = {}) {
    const topologyApi = dependency('SimulatteClusterTopology', './cluster-topology.js');
    const collectiveApi = dependency('SimulatteCollectiveSolver', './collective-solver.js');
    const thermalApi = dependency('SimulatteThermalModel', './thermal-model.js');
    const receiptApi = dependency('SimulatteClusterReceiptFactory', './receipt-factory.js');
    const presentationApi = dependency('SimulatteClusterPresentation', './presentation.js');
    const v4Api = dependency('SimulatteGpuSuperclusterV4', './v4-contribution.js');

    const config = {
      totalGpus: 256,
      racks: 32,
      nodesPerRack: 8,
      gpusPerNode: 8,
      parallelism: { tensorParallel: 8, pipelineParallel: 4, dataParallel: 8 },
      collectiveAlgorithm: 'ring-allreduce',
      tensorSizeGb: 14.2,
      nvlinkBandwidthGbps: 900,
      infinibandBandwidthGbps: 800,
      coolantInletTempC: 22,
      coolantFlowLpm: 120,
      ambientAirTempC: 24,
      gpuTdpW: 700,
      stragglerThrottlePercent: 0,
      linkPacketDropRate: 0,
      cduFlowDegradationPercent: 0,
      ...rawConfig,
    };
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

    const outcome = {
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
      createContribution: (step = 0) => v4Api.createContribution({ result: outcome, step }),
    };
    return Object.freeze(outcome);
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

    let activeScenario = scenario || null;
    let currentStep = 0;
    let current = simulate(configForScenario(activeConfig, activeScenario));

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
        config: current.config,
        result: current,
        progressive: { status: 'ready', step: 0, progress: 0 },
        lastAction: 'activated',
      });
    }

    function recompute(nextConfig = current.config) {
      current = simulate(nextConfig);
      return current;
    }

    function setScenario(nextScenario) {
      activeScenario = nextScenario || null;
      currentStep = 0;
      recompute(configForScenario(activeConfig, activeScenario));
      return Object.freeze({ status: 'ready', seed: current.receipt.seed });
    }

    function contributeV4() {
      return current.createContribution(currentStep);
    }

    function handleAction(actionId, context = {}) {
      if (actionId === 'scenario.run') return runPlayback(context);
      if (actionId === 'counterfactual.compare') return compareScenario();
      if (actionId === 'update-controls') {
        currentStep = 0;
        recompute({ ...current.config, ...(context.values || context.controls || {}) });
        return Object.freeze({ status: 'ready', currentStep, totalSteps: 4 });
      }
      return Object.freeze({ status: 'refused', reason: 'unknown_action', actionId });
    }

    function runPlayback(context) {
      const values = context.values || {};
      if (values.phase === 'start') {
        currentStep = 0;
        recompute({ ...configForScenario(activeConfig, context.scenario || activeScenario), ...controlValues(values) });
        return playbackResult();
      }
      if (values.phase === 'step') {
        if (currentStep >= 4) return playbackResult();
        currentStep += 1;
        return playbackResult();
      }
      return Object.freeze({ status: 'refused', reason: 'scenario_phase_invalid', phase: values.phase || null });
    }

    function playbackResult() {
      return Object.freeze({
        status: currentStep >= 4 ? 'settled' : 'running',
        currentStep,
        totalSteps: 4,
        simulationTimeMs: currentStep * 1000,
        receipt: current.receipt,
      });
    }

    function compareScenario() {
      const baseline = simulate(configForScenario(activeConfig, { id: 'gpt4-3d-parallelism' }));
      return Object.freeze({
        status: 'settled',
        comparisonId: `${PLUGIN_ID}:nominal-vs-degraded-cluster`,
        comparisonBranches: Object.freeze({
          baseline: comparisonBranch(baseline),
          intervention: comparisonBranch(current),
        }),
      });
    }

    function settle() {
      return Object.freeze({
        obligationResults: Object.freeze([]),
        stateIdentity: `${current.receipt.seed}:${currentStep}`,
        losses: Object.freeze([]),
      });
    }

    function view() {
      return Object.freeze({
        slot: 'inspector',
        title: 'Modeled GPU supercluster',
        rows: Object.freeze([
          Object.freeze({ label: 'Modeled GPUs', value: String(current.topology.totalGpus) }),
          Object.freeze({ label: 'Collective', value: current.collectives.algorithm }),
          Object.freeze({ label: 'Step time', value: `${current.collectives.stepTimeMs.toFixed(3)} ms` }),
          Object.freeze({ label: 'Peak temperature', value: `${current.thermals.peakJunctionTempC.toFixed(2)} C` }),
          Object.freeze({ label: 'Claim boundary', value: 'Scenario model only; no physical GPU or facility telemetry.' }),
        ]),
        actions: Object.freeze([]),
      });
    }

    return Object.freeze({
      id: PLUGIN_ID,
      capabilities: Object.freeze({
        'simulation.datacenter.ai-supercluster.v1': (input = {}) => simulate({ ...current.config, ...input }),
        'field.cluster-thermals.v1': (input = {}) => simulate({ ...current.config, ...input }).thermals,
      }),
      contributeV4,
      handleAction,
      setScenario,
      settle,
      view,
      dispose() {},
    });
  }

  function configForScenario(config, scenario) {
    const scenarioId = scenario?.id || scenario?.scenarioId || '';
    if (scenarioId === 'straggler-fault-injection') return { ...config, stragglerThrottlePercent: 50 };
    if (scenarioId === 'cdu-cooling-failure') return { ...config, cduFlowDegradationPercent: 50 };
    if (scenarioId === 'tree-allreduce-low-latency') return { ...config, collectiveAlgorithm: 'tree-allreduce' };
    return { ...config };
  }

  function controlValues(values) {
    const allowed = [
      'collectiveAlgorithm',
      'tensorSizeGb',
      'stragglerThrottlePercent',
      'coolantFlowLpm',
      'cduFlowDegradationPercent',
    ];
    return Object.fromEntries(allowed.flatMap((key) => values[key] === undefined ? [] : [[key, values[key]]]));
  }

  function comparisonBranch(result) {
    return Object.freeze({
      stepTimeMs: result.collectives.stepTimeMs,
      modelFlopsUtilization: result.collectives.modelFlopsUtilization,
      peakJunctionTempC: result.thermals.peakJunctionTempC,
      pue: result.thermals.pue,
    });
  }

  return Object.freeze({
    id: PLUGIN_ID,
    simulate,
    activate,
  });
});
