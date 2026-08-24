(function attachSubseaMultiscaleModule(root, factory) {
  const model = typeof module === 'object' && module.exports
    ? require('./network-model.js')
    : root.SimulatteSubseaNetworkModel;
  const api = factory(model);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSubseaMultiscaleModule = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSubseaMultiscaleModuleApi(model) {
  const MODULE_ID = 'subsea-capacity';
  const OUTPUT_PORT_ID = 'subsea.mid-atlantic.delivered-gbps';
  const DEFAULT_DEMAND_IDS = Object.freeze([
    'demand-us-es-general',
    'demand-us-ie-essential',
  ]);

  function createSubseaCapacityModule({
    datasets,
    config,
    scenario,
    failureTimeSeconds = 3600,
    cadenceSeconds = 60,
    demandIds = DEFAULT_DEMAND_IDS,
  }) {
    if (!model?.runScenario) fail('subsea_multiscale_model_missing', 'Subsea network model is unavailable');
    const result = model.runScenario({ datasets, config, scenario });
    const healthy = result.snapshots.find((row) => row.status === 'healthy');
    const disrupted = result.snapshots.find((row) => row.id.endsWith(':snapshot-disrupted'));
    if (!healthy || !disrupted) fail('subsea_multiscale_snapshots_missing', 'Healthy and disrupted snapshots are required');
    const knownDemandIds = new Set(healthy.demands.map((row) => row.id));
    demandIds.forEach((id) => {
      if (!knownDemandIds.has(id)) fail('subsea_multiscale_demand_unknown', `Unknown governed demand ${id}`);
    });
    const baseline = summarize(healthy, demandIds, result);

    function stateAt(logicalTime) {
      if (logicalTime < failureTimeSeconds) return baseline;
      const elapsedMs = (logicalTime - failureTimeSeconds) * 1000;
      let selected = disrupted;
      if (elapsedMs > 0) {
        result.snapshots.slice(2).forEach((snapshot) => {
          if (snapshot.simulationTimeMs <= elapsedMs && snapshot.simulationTimeMs >= selected.simulationTimeMs) {
            selected = snapshot;
          }
        });
      }
      return summarize(selected, demandIds, result);
    }

    const descriptor = {
      id: MODULE_ID,
      implementationId: 'subsea-network-global.multiscale-capacity/v1',
      implementationHash: `scenario:${result.scenarioIdentity}`,
      clock: { kind: 'fixed', intervalSeconds: cadenceSeconds },
      lifecycle: {
        initialize() {
          return { ...baseline, logicalTime: 0 };
        },
        advance({ state, toTime }) {
          const next = { ...stateAt(toTime), logicalTime: toTime };
          const events = state.sourceSnapshotId === next.sourceSnapshotId ? [] : [{
            id: `subsea-capacity:${toTime}:${next.sourceSnapshotId}`,
            kind: 'subsea.capacity-snapshot-changed',
            logicalTime: toTime,
            sourceSnapshotId: next.sourceSnapshotId,
          }];
          return { state: next, events, diagnostics: [] };
        },
        emit({ state, logicalTime }) {
          return [{
            portId: OUTPUT_PORT_ID,
            value: state.deliveredGbps,
            timestamp: logicalTime,
            provenance: null,
          }];
        },
        checkpoint({ state }) {
          return { state };
        },
        restore({ checkpoint }) {
          return checkpoint.state;
        },
        aggregate() {
          fail('subsea_multiscale_fidelity_not_admitted', 'Subsea fidelity transitions belong to phase five');
        },
        refine() {
          fail('subsea_multiscale_fidelity_not_admitted', 'Subsea fidelity transitions belong to phase five');
        },
        dispose() {},
      },
    };
    return Object.freeze({
      descriptor: deepFreeze(descriptor),
      reference: deepFreeze({
        scenarioIdentity: result.scenarioIdentity,
        claimBoundary: result.claimBoundary,
        failureTimeSeconds,
        demandIds: [...demandIds],
        baseline,
        disrupted: summarize(disrupted, demandIds, result),
      }),
    });
  }

  function summarize(snapshot, demandIds, result) {
    const selected = snapshot.demands.filter((row) => demandIds.includes(row.id));
    const sum = (key) => selected.reduce((total, row) => total + row[key], 0);
    return deepFreeze({
      sourceRunId: result.id,
      sourceScenarioIdentity: result.scenarioIdentity,
      sourceSnapshotId: snapshot.id,
      sourceSnapshotStatus: snapshot.status,
      sourceSimulationTimeMs: snapshot.simulationTimeMs,
      allocationMatrixHash: snapshot.allocationReceipt.matrixHash,
      failureActive: snapshot.failedEdgeIds.length > 0,
      failedEdgeIds: [...snapshot.failedEdgeIds],
      requestedGbps: sum('requestedGbps'),
      deliveredGbps: sum('deliveredGbps'),
      droppedGbps: sum('droppedGbps'),
    });
  }

  function fail(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.name = 'SimulatteSubseaMultiscaleModuleError';
    error.code = code;
    throw error;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  return Object.freeze({
    DEFAULT_DEMAND_IDS,
    MODULE_ID,
    OUTPUT_PORT_ID,
    createSubseaCapacityModule,
  });
});
