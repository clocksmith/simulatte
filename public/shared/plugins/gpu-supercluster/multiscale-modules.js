(function attachGpuMultiscaleModules(root, factory) {
  const collective = typeof module === 'object' && module.exports
    ? require('./collective-solver.js')
    : root.SimulatteCollectiveSolver;
  const thermal = typeof module === 'object' && module.exports
    ? require('./thermal-model.js')
    : root.SimulatteThermalModel;
  const api = factory(collective, thermal);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteGpuMultiscaleModules = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGpuMultiscaleModulesApi(collective, thermal) {
  const IDS = Object.freeze({
    gatewayModule: 'virginia-wan-gateway',
    schedulerModule: 'datacenter-training-scheduler',
    clusterModule: 'gpu-cluster',
    gatewayInput: 'virginia-wan.delivered-gbps',
    gatewayOutput: 'virginia-wan.available-gbps',
    schedulerInput: 'datacenter-scheduler.available-wan-gbps',
    schedulerRunnableOutput: 'datacenter-scheduler.runnable-fraction',
    schedulerThroughputOutput: 'datacenter-scheduler.throughput-steps-per-hour',
    clusterRunnableInput: 'gpu-cluster.runnable-fraction',
    clusterThroughputInput: 'gpu-cluster.scheduled-throughput-steps-per-hour',
    clusterPowerOutput: 'gpu-cluster.it-power-kw',
    clusterFacilityPowerOutput: 'gpu-cluster.facility-power-kw',
    clusterTemperatureOutput: 'gpu-cluster.peak-junction-temperature-c',
  });

  function createDatacenterModules({
    config,
    baselineDeliveredGbps,
    contractedCapacityGbps = 400,
    cadenceSeconds = 60,
    arrivalUtilization = 0.98,
  }) {
    if (!collective?.solveCollectives || !thermal?.solveThermals) {
      fail('gpu_multiscale_solver_missing', 'Collective and thermal solvers are required');
    }
    requirePositive(baselineDeliveredGbps, 'baselineDeliveredGbps');
    requirePositive(contractedCapacityGbps, 'contractedCapacityGbps');
    const baselineCollectives = solveCollectives(config);
    const maximumStepsPerHour = 3600000 / baselineCollectives.stepTimeMs;
    const arrivalStepsPerHour = maximumStepsPerHour * arrivalUtilization;
    const baselineCluster = solveCluster(config, baselineCollectives, 1, maximumStepsPerHour);
    const workerFactory = { config, baselineDeliveredGbps, contractedCapacityGbps, cadenceSeconds, arrivalUtilization };

    const gateway = descriptor(IDS.gatewayModule, 'gpu-supercluster.wan-gateway/v1', cadenceSeconds, {
      initialize: () => gatewayState(baselineDeliveredGbps, baselineDeliveredGbps, contractedCapacityGbps, 0),
      advance: ({ toTime, inputs }) => ({
        state: gatewayState(inputs[IDS.gatewayInput].value, baselineDeliveredGbps, contractedCapacityGbps, toTime),
        events: [],
        diagnostics: [],
      }),
      emit: ({ state, logicalTime }) => [output(IDS.gatewayOutput, state.availableGbps, logicalTime)],
    }, workerFactory);

    const scheduler = descriptor(IDS.schedulerModule, 'gpu-supercluster.training-scheduler/v1', cadenceSeconds, {
      initialize: () => schedulerState(contractedCapacityGbps, contractedCapacityGbps, maximumStepsPerHour, arrivalStepsPerHour, 0, 0),
      advance: ({ state, fromTime, toTime, inputs }) => ({
        state: schedulerState(
          inputs[IDS.schedulerInput].value,
          contractedCapacityGbps,
          maximumStepsPerHour,
          arrivalStepsPerHour,
          state.queueDepthSteps,
          toTime,
          (toTime - fromTime) / 3600
        ),
        events: [],
        diagnostics: [],
      }),
      emit: ({ state, logicalTime }) => [
        output(IDS.schedulerRunnableOutput, state.runnableFraction, logicalTime),
        output(IDS.schedulerThroughputOutput, state.throughputStepsPerHour, logicalTime),
      ],
    }, workerFactory);

    const cluster = descriptor(IDS.clusterModule, 'gpu-supercluster.capacity-bound-cluster/v1', cadenceSeconds, {
      initialize: () => ({ ...baselineCluster, fidelity: 'detail', logicalTime: 0 }),
      advance: ({ state, toTime, inputs }) => {
        const next = {
          ...solveCluster(
            config,
            baselineCollectives,
            inputs[IDS.clusterRunnableInput].value,
            inputs[IDS.clusterThroughputInput].value
          ),
          fidelity: 'detail',
          logicalTime: toTime,
        };
        return { state: state?.fidelity === 'aggregate' ? aggregateClusterState(next) : next, events: [], diagnostics: [] };
      },
      emit: ({ state, logicalTime }) => [
        output(IDS.clusterPowerOutput, state.totalItPowerKw, logicalTime),
        output(IDS.clusterFacilityPowerOutput, state.totalFacilityPowerKw, logicalTime),
        output(IDS.clusterTemperatureOutput, state.peakJunctionTempC, logicalTime),
      ],
      aggregate: ({ state }) => aggregateClusterState(state),
      refine: ({ state, request }) => refineClusterState(state, request),
    }, workerFactory);

    return Object.freeze({
      modules: Object.freeze([gateway, scheduler, cluster]),
      reference: deepFreeze({
        baselineDeliveredGbps,
        contractedCapacityGbps,
        maximumStepsPerHour,
        arrivalStepsPerHour,
        baselineCluster,
      }),
    });
  }

  function descriptor(id, implementationId, intervalSeconds, operations, workerFactory) {
    const lifecycle = {
      initialize: operations.initialize,
      advance: operations.advance,
      emit: operations.emit,
      checkpoint({ state }) {
        return { state };
      },
      restore({ checkpoint }) {
        return checkpoint.state;
      },
      aggregate({ state, request }) {
        return operations.aggregate ? operations.aggregate({ state, request }) : state;
      },
      refine({ state, request }) {
        return operations.refine ? operations.refine({ state, request }) : state;
      },
      dispose() {},
    };
    return deepFreeze({
      id,
      implementationId,
      implementationHash: `fnv1a32:${stableHash(implementationId)}`,
      clock: { kind: 'fixed', intervalSeconds },
      createWorkerTask(context) {
        return { schema: 'simulatte.simulationWorkerTask/v1', ...context, operation: 'gpu-supercluster.advance/v1', payload: { factory: workerFactory } };
      },
      lifecycle,
    });
  }

  function gatewayState(deliveredGbps, baselineDeliveredGbps, contractedCapacityGbps, logicalTime) {
    const serviceRatio = clamp(deliveredGbps / baselineDeliveredGbps, 0, 1);
    return deepFreeze({
      logicalTime,
      deliveredGbps,
      baselineDeliveredGbps,
      contractedCapacityGbps,
      serviceRatio,
      availableGbps: contractedCapacityGbps * serviceRatio,
      mappingIdentity: 'atlantic-mid-atlantic-to-virginia-contract-share/v1',
    });
  }

  function schedulerState(availableGbps, requiredGbps, maximumStepsPerHour, arrivalStepsPerHour, priorQueue, logicalTime, elapsedHours = 0) {
    const runnableFraction = clamp(availableGbps / requiredGbps, 0, 1);
    const throughputStepsPerHour = maximumStepsPerHour * runnableFraction;
    const queueDepthSteps = Math.max(0, priorQueue + (arrivalStepsPerHour - throughputStepsPerHour) * elapsedHours);
    return deepFreeze({
      logicalTime,
      availableGbps,
      requiredGbps,
      runnableFraction,
      throughputStepsPerHour,
      arrivalStepsPerHour,
      queueDepthSteps,
      policyIdentity: 'wan-gated-training-scheduler/v1',
    });
  }

  function solveCollectives(config) {
    return collective.solveCollectives({
      totalGpus: config.totalGpus,
      tensorSizeGb: config.tensorSizeGb,
      algorithm: config.collectiveAlgorithm,
      parallelism: config.parallelism,
      nvlinkBandwidthGbps: config.nvlinkBandwidthGbps,
      infinibandBandwidthGbps: config.infinibandBandwidthGbps,
      stragglerThrottlePercent: config.stragglerThrottlePercent,
      linkPacketDropRate: config.linkPacketDropRate,
      gpuTdpW: config.gpuTdpW,
    });
  }

  function solveCluster(config, collectives, runnableFraction, scheduledThroughputStepsPerHour) {
    const activeMfuFraction = (collectives.modelFlopsUtilization / 100) * clamp(runnableFraction, 0, 1);
    const scheduledDutyCycle = clamp(runnableFraction, 0, 1);
    const idleGpuPowerW = config.gpuTdpW * 0.1;
    const scheduledGpuPowerW = config.gpuTdpW * Math.max(0.2, collectives.modelFlopsUtilization / 100);
    const intervalAverageGpuPowerW = idleGpuPowerW
      + (scheduledGpuPowerW - idleGpuPowerW) * scheduledDutyCycle;
    const thermals = thermal.solveThermals({
      totalGpus: config.totalGpus,
      racksCount: config.racks,
      gpuTdpW: intervalAverageGpuPowerW,
      coolantInletTempC: config.coolantInletTempC,
      coolantFlowLpm: config.coolantFlowLpm,
      ambientAirTempC: config.ambientAirTempC,
      cduFlowDegradationPercent: config.cduFlowDegradationPercent,
      activeMfuFraction: 1,
    });
    return deepFreeze({
      runnableFraction,
      scheduledDutyCycle,
      scheduledThroughputStepsPerHour,
      baseStepTimeMs: collectives.stepTimeMs,
      baseModelFlopsUtilization: collectives.modelFlopsUtilization,
      effectiveModelFlopsUtilization: activeMfuFraction * 100,
      idleGpuPowerW,
      scheduledGpuPowerW,
      intervalAverageGpuPowerW,
      powerAdapterIdentity: 'scheduled-duty-cycle-power-adapter/v1',
      totalItPowerKw: thermals.totalItPowerKw,
      totalFacilityPowerKw: thermals.totalFacilityPowerKw,
      peakJunctionTempC: thermals.peakJunctionTempC,
      throttledGpuCount: thermals.throttledGpuCount,
      thermalState: thermals,
    });
  }

  function aggregateClusterState(state) {
    if (state.fidelity === 'aggregate') return state;
    const { racks = [], ...thermalAggregate } = state.thermalState;
    return deepFreeze({
      ...state,
      fidelity: 'aggregate',
      thermalState: thermalAggregate,
      discardedDetail: {
        kind: 'rack-thermal-array',
        count: racks.length,
        sourceHash: `fnv1a32:${stableHash(JSON.stringify(racks))}`,
      },
    });
  }

  function refineClusterState(state, request) {
    if (request?.method !== 'qualified-sampling' || !request.branchId) {
      fail('gpu_multiscale_refinement_unqualified', 'Aggregate refinement requires a named qualified-sampling branch');
    }
    if (state.fidelity !== 'aggregate') fail('gpu_multiscale_refinement_source_invalid', 'Only aggregate cluster state can be refined');
    const racksCount = state.thermalState.racksCount;
    const rackPowerKw = state.thermalState.totalItPowerKw / racksCount;
    const throttled = state.thermalState.throttledGpuCount > 0;
    const racks = Array.from({ length: racksCount }, (_, rackIndex) => ({
      rackIndex,
      avgTempC: state.thermalState.peakJunctionTempC,
      coolantInletC: state.thermalState.coolantInletTempC,
      coolantOutletC: state.thermalState.coolantOutletTempC,
      powerDrawKw: rackPowerKw,
      isThrottled: throttled,
    }));
    const { discardedDetail, ...withoutDiscarded } = state;
    return deepFreeze({
      ...withoutDiscarded,
      fidelity: 'detail',
      thermalState: { ...state.thermalState, racks },
      refinement: {
        method: 'qualified-sampling',
        branchId: request.branchId,
        sourceAggregateHash: discardedDetail?.sourceHash || null,
      },
    });
  }

  function output(portId, value, timestamp) {
    return { portId, value, timestamp, provenance: null };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function stableHash(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function requirePositive(value, label) {
    if (!Number.isFinite(value) || value <= 0) fail('gpu_multiscale_value_invalid', `${label} must be positive`);
  }

  function fail(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteGpuMultiscaleModuleError';
    error.code = code;
    throw error;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ IDS, createDatacenterModules });
});
