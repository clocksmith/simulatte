const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { Worker } = require('node:worker_threads');

const poolApi = require('../public/shared/core/simulation/worker-task-pool.js');
const referenceApi = require('../public/simulatte/world/earth-virginia-datacenter-reference.js');

function loadInputs(executionAdapter = null) {
  const load = (name) => require(`../public/data/subsea-network-global/${name}.json`);
  return { datasets: { fcc: load('fcc-cable-license-register-2025-v1'), landings: load('landing-points-governed-v1'), topology: load('cable-corridors-modeled-v1'), capacities: load('capacity-scenarios-v1'), demands: load('demand-scenarios-v1'), repairs: load('repair-resources-v1'), governance: load('model-governance-v1'), provenance: load('provenance-registry-v1') }, subseaConfig: require('../public/shared/plugins/subsea-network-global/default-config.json'), gpuConfig: require('../public/shared/plugins/gpu-supercluster/default-config.json'), executionAdapter };
}

function controlledWorkers() {
  const instances = [];
  class ControlledWorker {
    constructor() {
      this.handlers = { error: [], exit: [], message: [] };
      this.messages = [];
      this.terminated = false;
      instances.push(this);
    }
    on(kind, handler) { this.handlers[kind].push(handler); }
    postMessage(message, transferables = []) { this.messages.push({ message, transferables }); }
    emit(kind, value) { this.handlers[kind].forEach((handler) => handler(value)); }
    terminate() { this.terminated = true; return Promise.resolve(); }
  }
  return { ControlledWorker, instances };
}

function task(id, payload = {}) {
  return { schema: 'simulatte.simulationWorkerTask/v1', id, moduleId: 'test-module', implementationId: 'test/v1', implementationHash: 'hash:test', operation: 'test.advance/v1', branchId: 'main', fromTime: 0, toTime: 1, payload };
}

test('real worker execution reproduces every serial reference exchange', async () => {
  const pool = poolApi.createWorkerTaskPool({ WorkerClass: Worker, workerUrl: path.resolve(__dirname, '../public/simulatte/world/simulation-task-worker.js'), size: 2 });
  try {
    const serial = referenceApi.createReferenceWorld(loadInputs());
    const worker = referenceApi.createReferenceWorld(loadInputs(pool));
    await serial.coordinator.runUntil(3900);
    await worker.coordinator.runUntil(3900);
    assert.deepEqual(worker.coordinator.getLedger(), serial.coordinator.getLedger());
    assert.ok(pool.snapshot().events.some((row) => row.phase === 'completed'));
    assert.deepEqual(await worker.coordinator.replay(), { status: 'match', rounds: 65, terminalTime: 3900 });
  } finally {
    await pool.dispose();
  }
});

test('worker task protocol rejects functions before dispatch', async () => {
  const pool = poolApi.createWorkerTaskPool({ WorkerClass: Worker, workerUrl: path.resolve(__dirname, '../public/simulatte/world/simulation-task-worker.js') });
  try {
    await assert.rejects(pool.execute({ schema: 'simulatte.simulationWorkerTask/v1', id: 'bad', moduleId: 'm', implementationId: 'i', implementationHash: 'h', operation: 'x', branchId: 'main', fromTime: 0, toTime: 1, payload: { closure() {} } }), (error) => error.code === 'worker_task_not_serializable');
  } finally {
    await pool.dispose();
  }
});

test('worker task pool transfers buffers, cancels work, and rejects stale replies', async () => {
  const { ControlledWorker, instances } = controlledWorkers();
  const pool = poolApi.createWorkerTaskPool({ WorkerClass: ControlledWorker, workerUrl: 'controlled-worker.js' });
  try {
    const pending = pool.execute(task('cancelled', { bytes: new Uint8Array([1, 2, 3]) }));
    assert.equal(instances[0].messages[0].transferables.length, 1);
    assert.equal(pool.cancel('cancelled'), true);
    await assert.rejects(pending, (error) => error.code === 'worker_task_cancelled');
    instances[0].emit('message', { schema: 'simulatte.workerTaskResponse/v1', taskId: 'cancelled', ok: true, result: {} });
    assert.ok(pool.snapshot().events.some((row) => row.phase === 'stale-reply-rejected' && row.taskId === 'cancelled'));
  } finally {
    await pool.dispose();
  }
});

test('worker task pool replaces a crashed worker before dispatching later work', async () => {
  const { ControlledWorker, instances } = controlledWorkers();
  const pool = poolApi.createWorkerTaskPool({ WorkerClass: ControlledWorker, workerUrl: 'controlled-worker.js' });
  try {
    const failed = pool.execute(task('crashed'));
    instances[0].emit('error', new Error('controlled crash'));
    await assert.rejects(failed, (error) => error.code === 'worker_crashed');
    assert.equal(instances.length, 2);
    assert.equal(instances[0].terminated, true);
    const recovered = pool.execute(task('recovered'));
    instances[1].emit('message', { schema: 'simulatte.workerTaskResponse/v1', taskId: 'recovered', ok: true, result: { value: 7 } });
    assert.deepEqual(await recovered, { value: 7 });
    assert.ok(pool.snapshot().events.some((row) => row.phase === 'worker-replaced'));
  } finally {
    await pool.dispose();
  }
});
