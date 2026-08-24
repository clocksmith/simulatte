(function attachSimulationTaskOperations(root, factory) {
  const gpuApi = typeof module === 'object' && module.exports ? require('../../shared/plugins/gpu-supercluster/multiscale-modules.js') : root.SimulatteGpuMultiscaleModules;
  const api = factory(gpuApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteSimulationTaskOperations = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function createSimulationTaskOperations(gpuApi) {
  async function execute(task) {
    if (task.operation === 'subsea-capacity.advance/v1') return advanceSubsea(task);
    if (task.operation === 'gpu-supercluster.advance/v1') return advanceGpu(task);
    throw operationError('worker_operation_unknown', `Unknown operation ${task.operation}`);
  }
  function advanceSubsea(task) {
    const timeline = task.payload.timeline;
    let selected = timeline.baseline;
    if (task.toTime >= timeline.failureTimeSeconds) {
      selected = timeline.disrupted;
      const elapsedMs = (task.toTime - timeline.failureTimeSeconds) * 1000;
      if (elapsedMs > 0) {
        let selectedSimulationTimeMs = Number.NEGATIVE_INFINITY;
        timeline.recovery.forEach((row) => {
          if (row.simulationTimeMs <= elapsedMs && row.simulationTimeMs >= selectedSimulationTimeMs) {
            selected = row.state;
            selectedSimulationTimeMs = row.simulationTimeMs;
          }
        });
      }
    }
    const next = { ...selected, logicalTime: task.toTime };
    const events = task.state.sourceSnapshotId === next.sourceSnapshotId ? [] : [{ id: `subsea-capacity:${task.toTime}:${next.sourceSnapshotId}`, kind: 'subsea.capacity-snapshot-changed', logicalTime: task.toTime, sourceSnapshotId: next.sourceSnapshotId }];
    return { state: next, outputs: [{ portId: task.payload.outputPortId, value: next.deliveredGbps, timestamp: task.toTime, provenance: null }], events, diagnostics: [] };
  }
  async function advanceGpu(task) {
    const made = gpuApi.createDatacenterModules(task.payload.factory);
    const module = made.modules.find((row) => row.id === task.moduleId);
    if (!module || module.implementationId !== task.implementationId || module.implementationHash !== task.implementationHash) throw operationError('worker_implementation_mismatch', `Worker implementation mismatch for ${task.moduleId}`);
    const advanced = await module.lifecycle.advance({ moduleId: task.moduleId, fromTime: task.fromTime, toTime: task.toTime, state: task.state, inputs: task.inputs, controls: task.controls });
    const outputs = await module.lifecycle.emit({ moduleId: task.moduleId, logicalTime: task.toTime, state: advanced.state, inputs: task.inputs });
    return { state: advanced.state, outputs, events: advanced.events || [], diagnostics: advanced.diagnostics || [] };
  }
  function operationError(code, message) { const error = new Error(`${code}: ${message}`); error.code = code; return error; }
  return Object.freeze({ execute });
});
