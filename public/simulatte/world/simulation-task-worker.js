(function bootSimulationTaskWorker() {
  let operations;
  let subscribe;
  let send;
  if (typeof module === 'object' && module.exports) {
    operations = require('./simulation-task-operations.js');
    const { parentPort } = require('node:worker_threads');
    subscribe = (handler) => parentPort.on('message', handler);
    send = (message, transferables) => parentPort.postMessage(message, transferables);
  } else {
    importScripts('../../shared/plugins/gpu-supercluster/collective-solver.js', '../../shared/plugins/gpu-supercluster/thermal-model.js', '../../shared/plugins/gpu-supercluster/multiscale-modules.js', './simulation-task-operations.js');
    operations = self.SimulatteSimulationTaskOperations;
    subscribe = (handler) => self.addEventListener('message', (event) => handler(event.data));
    send = (message, transferables) => self.postMessage(message, transferables);
  }
  const cancelled = new Set();
  subscribe(async (message) => {
    if (message?.schema === 'simulatte.workerTaskCancel/v1') { cancelled.add(message.taskId); return; }
    if (message?.schema !== 'simulatte.workerTaskRequest/v1') return;
    const task = message.task;
    try {
      const result = await operations.execute(task);
      if (cancelled.delete(task.id)) return;
      send(
        { schema: 'simulatte.workerTaskResponse/v1', taskId: task.id, ok: true, result },
        collectTransferables(result),
      );
    } catch (error) {
      send({ schema: 'simulatte.workerTaskResponse/v1', taskId: task.id, ok: false, error: { code: error.code || 'worker_task_failed', message: error.message } });
    }
  });
  function collectTransferables(value, output = [], seen = new Set()) {
    if (!value || typeof value !== 'object') return output;
    if (value instanceof ArrayBuffer) {
      if (!seen.has(value)) { seen.add(value); output.push(value); }
      return output;
    }
    if (ArrayBuffer.isView(value)) {
      if (value.buffer instanceof ArrayBuffer && !seen.has(value.buffer)) { seen.add(value.buffer); output.push(value.buffer); }
      return output;
    }
    Object.values(value).forEach((child) => collectTransferables(child, output, seen));
    return output;
  }
})();
