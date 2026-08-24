(function attachWorkerTaskPool(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteWorkerTaskPool = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createWorkerTaskPoolApi() {
  function createWorkerTaskPool({ workerUrl, WorkerClass = globalThis.Worker, size = 1, taskTimeoutMs = 30000 } = {}) {
    if (typeof WorkerClass !== 'function') throw taskError('worker_pool_unavailable', 'Worker constructor is required');
    if (!workerUrl) throw taskError('worker_url_missing', 'Worker URL is required');
    if (!Number.isInteger(size) || size < 1) throw taskError('worker_pool_size_invalid', 'Worker count must be positive');
    const workers = [];
    const queue = [];
    const pending = new Map();
    const events = [];
    let sequence = 0;
    let disposed = false;

    for (let index = 0; index < size; index += 1) workers.push(createSlot(index));

    function createSlot(index) {
      const worker = new WorkerClass(workerUrl);
      const slot = { index, worker, taskId: null, failed: false };
      const message = (value) => handleMessage(slot, value?.data === undefined ? value : value.data);
      const failure = (error) => { if (!slot.failed) handleFailure(slot, error); };
      if (typeof worker.addEventListener === 'function') {
        worker.addEventListener('message', message);
        worker.addEventListener('error', failure);
      } else {
        worker.on('message', message);
        worker.on('error', failure);
        worker.on('exit', (code) => { if (!disposed && !slot.failed) failure(taskError('worker_exited', `Worker ${index} exited unexpectedly with ${code}`)); });
      }
      return slot;
    }

    function execute(task) {
      if (disposed) return Promise.reject(taskError('worker_pool_disposed', 'Worker pool is disposed'));
      try {
        validateTask(task);
      } catch (error) {
        return Promise.reject(error);
      }
      const retained = structuredClone(task);
      const taskId = retained.id;
      if (pending.has(taskId) || queue.some((row) => row.task.id === taskId)) return Promise.reject(taskError('worker_task_duplicate', `Duplicate task ${taskId}`));
      return new Promise((resolve, reject) => {
        queue.push({ task: retained, resolve, reject });
        events.push({ sequence: ++sequence, phase: 'queued', taskId });
        dispatch();
      });
    }

    function dispatch() {
      workers.filter((slot) => slot.taskId === null).forEach((slot) => {
        const row = queue.shift();
        if (!row) return;
        slot.taskId = row.task.id;
        const timeout = setTimeout(() => rejectTask(slot, taskError('worker_task_timeout', `Task ${row.task.id} exceeded ${taskTimeoutMs} ms`)), taskTimeoutMs);
        pending.set(row.task.id, { ...row, slot, timeout });
        events.push({ sequence: ++sequence, phase: 'dispatched', taskId: row.task.id, workerIndex: slot.index });
        slot.worker.postMessage(
          { schema: 'simulatte.workerTaskRequest/v1', task: row.task },
          collectTransferables(row.task),
        );
      });
    }

    function handleMessage(slot, message) {
      if (message?.schema !== 'simulatte.workerTaskResponse/v1') return;
      if (message.taskId !== slot.taskId) {
        events.push({ sequence: ++sequence, phase: 'stale-reply-rejected', taskId: message.taskId || null, workerIndex: slot.index });
        return;
      }
      const row = pending.get(message.taskId);
      if (!row) return;
      clearTimeout(row.timeout);
      pending.delete(message.taskId);
      slot.taskId = null;
      if (message.ok) {
        events.push({ sequence: ++sequence, phase: 'completed', taskId: message.taskId, workerIndex: slot.index });
        row.resolve(structuredClone(message.result));
      } else {
        const error = taskError(message.error?.code || 'worker_task_failed', message.error?.message || `Task ${message.taskId} failed`);
        events.push({ sequence: ++sequence, phase: 'failed', taskId: message.taskId, workerIndex: slot.index, code: error.code });
        row.reject(error);
      }
      dispatch();
    }

    function handleFailure(slot, error) {
      if (disposed || slot.failed) return;
      slot.failed = true;
      const failure = taskError('worker_crashed', error?.message || `Worker ${slot.index} crashed`);
      if (slot.taskId !== null) rejectTask(slot, failure, false);
      else events.push({ sequence: ++sequence, phase: 'failed', taskId: null, workerIndex: slot.index, code: failure.code });
      try { slot.worker.terminate(); } catch {}
      try {
        workers[slot.index] = createSlot(slot.index);
        events.push({ sequence: ++sequence, phase: 'worker-replaced', taskId: null, workerIndex: slot.index });
        dispatch();
      } catch (replacementError) {
        const unavailable = taskError('worker_pool_unavailable', replacementError?.message || `Worker ${slot.index} could not be replaced`);
        queue.splice(0).forEach((row) => row.reject(unavailable));
      }
    }

    function rejectTask(slot, error, dispatchAfter = true) {
      const row = pending.get(slot.taskId);
      if (!row) return;
      clearTimeout(row.timeout);
      pending.delete(slot.taskId);
      events.push({ sequence: ++sequence, phase: 'failed', taskId: slot.taskId, workerIndex: slot.index, code: error.code });
      slot.taskId = null;
      row.reject(error);
      if (dispatchAfter) dispatch();
    }

    function cancel(taskId) {
      const queuedIndex = queue.findIndex((row) => row.task.id === taskId);
      if (queuedIndex >= 0) {
        const [row] = queue.splice(queuedIndex, 1);
        row.reject(taskError('worker_task_cancelled', `Task ${taskId} was cancelled`));
        return true;
      }
      const row = pending.get(taskId);
      if (!row) return false;
      row.slot.worker.postMessage({ schema: 'simulatte.workerTaskCancel/v1', taskId });
      rejectTask(row.slot, taskError('worker_task_cancelled', `Task ${taskId} was cancelled`));
      return true;
    }

    async function dispose() {
      disposed = true;
      queue.splice(0).forEach((row) => row.reject(taskError('worker_pool_disposed', 'Worker pool is disposed')));
      pending.forEach((row) => { clearTimeout(row.timeout); row.reject(taskError('worker_pool_disposed', 'Worker pool is disposed')); });
      pending.clear();
      await Promise.all(workers.map((slot) => slot.worker.terminate()));
    }

    function snapshot() {
      return Object.freeze({ schema: 'simulatte.workerTaskPoolSnapshot/v1', size, queuedTaskIds: queue.map((row) => row.task.id), activeTaskIds: [...pending.keys()].sort(), events: structuredClone(events) });
    }

    return Object.freeze({ cancel, dispose, execute, snapshot });
  }

  function validateTask(task) {
    if (!task || task.schema !== 'simulatte.simulationWorkerTask/v1') throw taskError('worker_task_schema_invalid', 'Simulation worker task v1 is required');
    ['id', 'moduleId', 'implementationId', 'implementationHash', 'operation', 'branchId'].forEach((key) => {
      if (typeof task[key] !== 'string' || !task[key]) throw taskError('worker_task_identity_invalid', `Task ${key} is required`);
    });
    if (!Number.isFinite(task.fromTime) || !Number.isFinite(task.toTime) || task.toTime < task.fromTime) throw taskError('worker_task_interval_invalid', 'Task logical interval is invalid');
    rejectFunctions(task, '$');
    structuredClone(task);
  }

  function rejectFunctions(value, path) {
    if (typeof value === 'function') throw taskError('worker_task_not_serializable', `Function at ${path}`);
    if (!value || typeof value !== 'object') return;
    Object.entries(value).forEach(([key, child]) => rejectFunctions(child, `${path}.${key}`));
  }
  function collectTransferables(value, output = [], seen = new Set()) {
    if (!value || typeof value !== 'object') return output;
    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
      if (!seen.has(value)) { seen.add(value); output.push(value); }
      return output;
    }
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) {
      if (value.buffer instanceof ArrayBuffer && !seen.has(value.buffer)) { seen.add(value.buffer); output.push(value.buffer); }
      return output;
    }
    Object.values(value).forEach((child) => collectTransferables(child, output, seen));
    return output;
  }
  function taskError(code, message) { const error = new Error(`${code}: ${message}`); error.name = 'SimulatteWorkerTaskError'; error.code = code; return error; }
  return Object.freeze({ collectTransferables, createWorkerTaskPool, taskError, validateTask });
});
