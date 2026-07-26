(function attachSubseaNetworkModel(root, factory) {
  const pathApi = typeof module === 'object' && module.exports
    ? require('./path-catalog.js')
    : root.SimulatteSubseaPathCatalog;
  const solverApi = typeof module === 'object' && module.exports
    ? require('./allocation-solver.js')
    : root.SimulatteSubseaAllocationSolver;
  const repairApi = typeof module === 'object' && module.exports
    ? require('./repair-engine.js')
    : root.SimulatteSubseaRepairEngine;
  const demandApi = typeof module === 'object' && module.exports
    ? require('./demand-model.js')
    : root.SimulatteSubseaDemandModel;
  const metricsApi = typeof module === 'object' && module.exports
    ? require('./metrics.js')
    : root.SimulatteSubseaMetrics;
  const api = factory(pathApi, solverApi, repairApi, demandApi, metricsApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSubseaNetworkModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSubseaNetworkModel(
  pathApi,
  solverApi,
  repairApi,
  demandApi,
  metricsApi
) {
  const HOUR_MS = 3600000;

  function runScenario({ datasets, config, scenario, policyOverrides = {}, ensembleMode = false }) {
    validateDependencies();
    const demandScenario = datasets.demands.scenarios.find((row) => row.id === scenario.scenarioId);
    if (!demandScenario) throw modelError('subsea_scenario_unknown', scenario.scenarioId);
    const capacityScenario = datasets.capacities.scenarios.find(
      (row) => row.id === (scenario.capacityScenarioId || demandScenario.capacityScenarioId)
    );
    const repairScenario = datasets.repairs.scenarios.find(
      (row) => row.id === (scenario.repairScenarioId || demandScenario.repairScenarioId)
    );
    if (!capacityScenario || !repairScenario) throw modelError('subsea_scenario_dataset_missing', scenario.scenarioId);
    const seed = scenario.seed;
    const allocationPolicyId = policyOverrides.allocationPolicyId || scenario.allocationPolicyId || config.allocationPolicyId;
    const repairPolicyId = policyOverrides.repairPolicyId || scenario.repairPolicyId || config.repairPolicyId;
    const failedResourceIds = normalizeFailures(
      scenario.failedResourceIds || demandScenario.failedResourceIds,
      datasets.topology.edges
    );
    const excludedLandingIds = scenario.excludedLandingIds || config.jurisdictionExclusions;
    const demands = demandApi.materializeDemands({
      scenario: demandScenario,
      seed,
      essentialServiceWeight: scenario.essentialServiceWeight || config.essentialServiceWeight,
      ensembleMode,
    });
    const baseEdges = materializeEdges(datasets.topology.edges, capacityScenario);
    const failedEdgeIds = edgeIdsForFailures(failedResourceIds, baseEdges);
    const initial = allocate({
      edges: baseEdges,
      demands,
      failedEdgeIds,
      excludedLandingIds,
      allocationPolicyId,
      config,
    });
    const unmetByEdge = burdenByFailedEdge(failedEdgeIds, initial.allocation.demands);
    const repairReceipt = repairApi.buildRepairTimeline({
      failedResourceIds,
      edges: baseEdges,
      points: datasets.landings.points,
      repairScenario,
      repairPolicyId,
      repairResourceCount: scenario.repairResourceCount || config.repairResourceCount,
      seed,
      unmetByEdge,
    });
    const events = [];
    appendEvent(events, 'scenario.initialized', 0, [], { scenarioId: scenario.scenarioId });
    appendEvent(events, 'demand.window-opened', 0, [events.at(-1).id], { demandIds: demands.map((row) => row.id) });
    appendEvent(events, 'failure.applied', 0, [events[0].id], { failedResourceIds, failedEdgeIds });
    appendAllocationEvents(events, initial, 0, events.at(-1).id);
    repairReceipt.events.forEach((row) => events.push({
      ...row,
      causationIds: row.causationIds.length ? row.causationIds : [events[2].id],
    }));
    const snapshots = [snapshot({
      id: `${scenario.scenarioId}:snapshot-0`,
      simulationTimeMs: 0,
      status: 'disrupted',
      allocationResult: initial,
      failedEdgeIds,
      repairedTargetIds: [],
      eventIds: events.filter((row) => row.simulationTimeMs === 0).map((row) => row.id),
    })];
    const restoredEdgeIds = new Set();
    repairReceipt.restorations.forEach((restoration, index) => {
      restoration.edgeIds.forEach((edgeId) => restoredEdgeIds.add(edgeId));
      const activeFailedEdgeIds = failedEdgeIds.filter((edgeId) => !restoredEdgeIds.has(edgeId));
      const next = allocate({
        edges: baseEdges,
        demands,
        failedEdgeIds: activeFailedEdgeIds,
        excludedLandingIds,
        allocationPolicyId,
        config,
      });
      appendEvent(events, 'allocation.recomputed', restoration.simulationTimeMs, [
        events.find((row) => row.kind === 'repair.capacity-restored' && row.targetId === restoration.targetId)?.id,
      ].filter(Boolean), {
        policyId: allocationPolicyId,
        pathCatalogHash: next.pathCatalog.catalogHash,
        allocationMatrixHash: next.receipt.matrixHash,
      });
      snapshots.push(snapshot({
        id: `${scenario.scenarioId}:snapshot-${index + 1}`,
        simulationTimeMs: restoration.simulationTimeMs,
        status: activeFailedEdgeIds.length ? 'repairing' : 'restored',
        allocationResult: next,
        failedEdgeIds: activeFailedEdgeIds,
        repairedTargetIds: repairReceipt.restorations.slice(0, index + 1).map((row) => row.targetId),
        eventIds: events.filter((row) => row.simulationTimeMs <= restoration.simulationTimeMs).map((row) => row.id),
      }));
    });
    const terminalTimeMs = Math.min(
      config.durationHours * HOUR_MS,
      Math.max(config.stepMinutes * 60000, snapshots.at(-1).simulationTimeMs)
    );
    appendEvent(events, 'scenario.terminal', terminalTimeMs, [events.at(-1).id], {
      terminalSnapshotId: snapshots.at(-1).id,
    });
    const finalSnapshot = {
      ...snapshots.at(-1),
      id: `${scenario.scenarioId}:snapshot-terminal`,
      simulationTimeMs: terminalTimeMs,
      status: 'settled',
      eventIds: events.map((row) => row.id),
    };
    snapshots.push(finalSnapshot);
    const orderedEvents = events.sort(compareEvent).map((row, sequence) => ({ ...row, sequence }));
    const configurationIdentity = {
      profileId: 'subsea-network-global-v1',
      worldModelId: 'earth-global-topology-v1',
      scenarioId: scenario.scenarioId,
      demandScenarioId: scenario.scenarioId,
      capacityScenarioId: capacityScenario.id,
      repairScenarioId: repairScenario.id,
      seed,
      allocationPolicyId,
      repairPolicyId,
      failedResourceIds,
      excludedLandingIds,
      essentialServiceWeight: scenario.essentialServiceWeight || config.essentialServiceWeight,
      repairResourceCount: scenario.repairResourceCount || config.repairResourceCount,
      pathLimitPerCommodity: config.pathLimitPerCommodity,
      solver: config.solver,
      ensembleSize: scenario.ensembleSize || config.ensembleSize,
      startInstant: config.startInstant,
    };
    return deepFreeze({
      schema: 'simulatte.subseaNetworkRun.v1',
      id: `subsea:${scenario.scenarioId}:${pathApi.stableHash(configurationIdentity)}`,
      scenarioIdentity: pathApi.stableHash(configurationIdentity),
      configurationIdentity,
      scenarioId: scenario.scenarioId,
      seed,
      allocationPolicyId,
      repairPolicyId,
      failedResourceIds,
      excludedLandingIds,
      demands,
      baseEdges,
      pathCatalogReceipts: snapshots.map((row) => row.pathCatalogReceipt),
      allocationReceipts: snapshots.map((row) => row.allocationReceipt),
      repairReceipt,
      events: orderedEvents,
      snapshots,
      metrics: finalSnapshot.metrics,
      claimBoundary: 'Comparative modeled service distribution under declared topology, demand, capacity, failure, and repair assumptions.',
    });
  }

  function runEnsemble({ datasets, config, scenario }) {
    const ensembleSize = scenario.ensembleSize || config.ensembleSize;
    const seedSet = config.ensembleSeeds.slice(0, ensembleSize);
    const runs = seedSet.map((seed) => runScenario({
      datasets,
      config,
      scenario: { ...scenario, seed },
      ensembleMode: true,
    }));
    return deepFreeze({
      schema: 'simulatte.plugin.subseaEnsembleReceipt.v1',
      scenarioId: scenario.scenarioId,
      seedSet,
      summary: metricsApi.summarizeEnsemble(runs),
      runIdentities: runs.map((row) => row.scenarioIdentity),
      terminalMetrics: runs.map((row) => ({ seed: row.seed, metrics: row.metrics })),
    });
  }

  function allocate({ edges, demands, failedEdgeIds, excludedLandingIds, allocationPolicyId, config }) {
    const failed = new Set(failedEdgeIds);
    const activeEdges = edges.map((edge) => ({
      ...edge,
      failureState: failed.has(edge.id) ? 'failed' : 'available',
      availableGbps: failed.has(edge.id) ? 0 : edge.capacityGbps,
    }));
    const pathCatalog = pathApi.buildPathCatalog({
      edges: activeEdges,
      demands,
      failedEdgeIds,
      excludedLandingIds,
      pathLimitPerCommodity: config.pathLimitPerCommodity,
    });
    const solved = solverApi.solveAllocation({
      edges: activeEdges,
      demands,
      pathCatalog,
      policyId: allocationPolicyId,
      solver: config.solver,
    });
    return { ...solved, pathCatalog };
  }

  function materializeEdges(edges, capacityScenario) {
    const capacities = new Map(capacityScenario.edgeCapacities.map((row) => [row.edgeId, row]));
    return edges.map((edge) => {
      const capacity = capacities.get(edge.id);
      if (!capacity) throw modelError('subsea_edge_capacity_missing', edge.id);
      return {
        ...edge,
        capacityGbps: capacity.capacityGbps,
        capacityOrigin: capacity.origin,
        capacityEvidenceRefs: capacity.evidenceRefs,
      };
    });
  }

  function normalizeFailures(ids, edges) {
    const unique = [...new Set(ids)].sort();
    unique.forEach((id) => {
      if (id.startsWith('landing:')) {
        const landingId = id.slice('landing:'.length);
        if (!edges.some((row) => row.fromLandingId === landingId || row.toLandingId === landingId)) {
          throw modelError('subsea_landing_failure_unknown', id);
        }
      } else if (!edges.some((row) => row.id === id)) {
        throw modelError('subsea_edge_failure_unknown', id);
      }
    });
    return unique;
  }

  function edgeIdsForFailures(failures, edges) {
    const ids = new Set();
    failures.forEach((failure) => {
      if (failure.startsWith('landing:')) {
        const landingId = failure.slice('landing:'.length);
        edges.filter((row) => row.fromLandingId === landingId || row.toLandingId === landingId)
          .forEach((row) => ids.add(row.id));
      } else ids.add(failure);
    });
    return [...ids].sort();
  }

  function burdenByFailedEdge(failedEdgeIds, demands) {
    const totalDropped = demands.reduce((sum, row) => sum + row.droppedGbps, 0);
    return Object.fromEntries(failedEdgeIds.map((edgeId, index) => [
      edgeId,
      totalDropped / Math.max(1, failedEdgeIds.length) + failedEdgeIds.length - index,
    ]));
  }

  function appendAllocationEvents(events, result, timeMs, causeId) {
    appendEvent(events, 'allocation.paths-built', timeMs, [causeId], {
      pathCount: result.pathCatalog.paths.length,
      catalogHash: result.pathCatalog.catalogHash,
    });
    appendEvent(events, 'allocation.solved', timeMs, [events.at(-1).id], {
      policyId: result.receipt.policyId,
      objectiveValue: result.receipt.objectiveValue,
      matrixHash: result.receipt.matrixHash,
    });
    result.allocation.edges.filter((row) => row.utilizationRatio >= 0.999999).forEach((edge) => {
      appendEvent(events, 'capacity.bottlenecked', timeMs, [events.at(-1).id], {
        edgeId: edge.id,
        loadGbps: edge.loadGbps,
        capacityGbps: edge.availableGbps,
      });
    });
    result.allocation.demands.filter((row) => row.droppedGbps > 0).forEach((demand) => {
      appendEvent(events, 'demand.partially-served', timeMs, [events.find((row) => row.kind === 'allocation.solved').id], {
        demandId: demand.id,
        requestedGbps: demand.requestedGbps,
        deliveredGbps: demand.deliveredGbps,
        droppedGbps: demand.droppedGbps,
      });
    });
  }

  function appendEvent(events, kind, simulationTimeMs, causationIds, payload) {
    events.push({
      id: `subsea:event:${events.length}:${kind}`,
      kind,
      simulationTimeMs,
      causationIds,
      payload,
    });
  }

  function snapshot({ id, simulationTimeMs, status, allocationResult, failedEdgeIds, repairedTargetIds, eventIds }) {
    const restorationHours = simulationTimeMs / HOUR_MS;
    return {
      schema: 'simulatte.subseaNetworkState.v1',
      id,
      simulationTimeMs,
      status,
      edges: allocationResult.allocation.edges,
      demands: allocationResult.allocation.demands,
      pathFlows: allocationResult.allocation.pathFlows,
      failedEdgeIds,
      repairedTargetIds,
      metrics: metricsApi.computeMetrics(allocationResult.allocation, restorationHours),
      eventIds,
      pathCatalogReceipt: allocationResult.pathCatalog,
      allocationReceipt: allocationResult.receipt,
    };
  }

  function compareEvent(left, right) {
    return left.simulationTimeMs - right.simulationTimeMs;
  }

  function validateDependencies() {
    if (!pathApi?.buildPathCatalog || !solverApi?.solveAllocation || !repairApi?.buildRepairTimeline
      || !demandApi?.materializeDemands || !metricsApi?.computeMetrics) {
      throw modelError('subsea_model_dependency_missing', 'Subsea model dependencies are incomplete');
    }
  }

  function modelError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteSubseaModelError';
    error.code = code;
    return error;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({ runScenario, runEnsemble });
});
