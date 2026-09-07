const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const contracts = require('../public/blank/pipeline/simulatte-phase-contracts.js');
const runner = require('../public/blank/app/runtime/phase-runner.js');
const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
const clients = require('../public/blank/app/prompt/prompt-controller-workers.js');
const workerSource = fs.readFileSync(path.join(__dirname, '../public/blank/app/workers/simulatte-pipeline-worker.js'), 'utf8');

function harness({ execute = true } = {}) {
  const workers = [];
  class Worker {
    constructor() {
      this.listeners = new Map();
      this.messages = [];
      this.terminated = false;
      workers.push(this);
      if (execute) {
        const context = { SimulattePhaseContracts: contracts, SimulattePhaseRunner: runner,
          SimulattePhysicsModel: model, AbortController,
          importScripts() {}, performance,
          SimulatteWorkerBootstrap: { createRuntimeLoader: () => ({ loadScripts() {} }),
            errorMessage: error => error.message },
          postMessage: data => queueMicrotask(() => this.emit('message', { data: structuredClone(data) })),
          addEventListener: (type, listener) => { if (type === 'message') this.dispatch = listener; },
        };
        vm.runInNewContext(workerSource, context);
      }
    }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    emit(type, event) { this.listeners.get(type)?.(event); }
    postMessage(data) {
      this.messages.push(structuredClone(data));
      if (execute) queueMicrotask(() => this.dispatch({ data: structuredClone(data) }));
    }
    terminate() { this.terminated = true; }
  }
  const document = { baseURI: 'https://test.invalid/blank/', querySelector: () => null };
  const client = clients.createPipelineCompiler({ defaultView: { Worker, document,
    location: { href: document.baseURI, origin: 'https://test.invalid' } } });
  return { client, workers };
}

const request = { request: { kind: 'prompt', text: 'two cats' },
  configuration: { deterministicRuntime: true }, authoredInputs: [], retryPolicy: null };
const call = () => ({ previous: contracts.createRequestEnvelope(request), invocation: {} });
const resources = () => ({ 'compiler-options': { deterministicRuntime: true } });

test('worker phase RPC and runner execute the same eight transformations with explicit graphics ownership', async () => {
  const { client, workers } = harness();
  const digest = await contracts.artifactDigest(request.configuration);
  const descriptor = id => ({ id, contentDigest: digest, capabilities: ['component-test'], residentBytes: 100 });
  const policy = { schema: 'simulatte.phaseRunPolicy.v1', id: 'worker-component-test',
    maxInputBytes: 10000, maxEvidenceBytes: 20000000,
    phases: Array.from({ length: 8 }, (_, i) => ({ phase: i + 1, maxDurationMs: 30000,
      maxArtifactBytes: 5000000, maxResidentBytes: 1000 })) };
  let rendered = 0;
  const instance = runner.create({ phases: runner.localPhaseAdapters(model, { workerResourceId: 'pipeline-worker' }),
    policy, producer: { id: 'worker-component-test', buildDigest: digest } });
  const outputs = await instance.run(request, {
    resources: {
      'compiler-options': { descriptor: { ...descriptor('compiler-options'), kind: 'artifact' }, handle: request.configuration },
      'pipeline-worker': { descriptor: descriptor('pipeline-worker'), handle: client },
      renderer: { descriptor: descriptor('renderer'), handle: { renderPhase(previous, invocation) {
        rendered += 1;
        return model.runPhase7RenderExecution(previous, invocation.simulationSnapshot, null, {});
      } } },
    },
    invocationForPhase: phase => phase === 7 ? { simulationSnapshot: { t: 0 },
      frame: { index: 0, simulationTime: 0 }, viewport: { width: 390, height: 844 } } : {},
  });
  assert.deepEqual(outputs.map(output => output.phase), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(workers[0].messages.map(message => message.phase), [1, 2, 3, 4, 5, 6, 8]);
  assert.equal(rendered, 1);
  const spec = model.projectWorldSpec(Object.fromEntries(outputs.slice(0, 6).map(output => [`phase${output.phase}`, output])));
  assert.equal(spec.contentHash, model.createSpecFromPrompt('two cats', request.configuration).contentHash);
  assert.notEqual(outputs[7].artifact.sceneProof.verdict, 'pass', 'component renderer supplies no browser pixels');
  client.cancel();
});

test('phase RPC rejects undeclared resources, malformed predecessors, invocation leaks and GPU execution', async () => {
  const { client } = harness();
  await assert.rejects(client.runPhase(1, call(), { ...resources(), secret: {} }), /declared dependencies/);
  await assert.rejects(client.runPhase(2, call(), {}), /expected/);
  await assert.rejects(client.runPhase(1, { ...call(), invocation: { hiddenPrompt: 'replace request' } }, resources()), /undeclared/);
  const malformed = call(); delete malformed.previous;
  malformed.previous = { schema: contracts.PHASE_ZERO_INPUT_SCHEMA, request: request.request, configuration: {} };
  await assert.rejects(client.runPhase(1, malformed, resources()), /Authored input references/);
  await assert.rejects(client.runPhase(1, call(), { 'compiler-options': { deterministicRuntime: false } }), /contradict request configuration/);
  await assert.rejects(client.runPhase(7, call(), {}), /graphics owner/);
  await assert.rejects(client.runPhase(1, call(), { 'compiler-options': { callback() {} } }), /serializable/);
  client.cancel();
});

test('cancelling a worker phase stops its worker and stale events cannot poison its replacement', async () => {
  const { client, workers } = harness({ execute: false });
  const controller = new AbortController();
  const pending = client.runPhase(1, call(), resources(), { signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  await rejected;
  assert.equal(workers[0].terminated, true);
  const replacement = client.runPhase(1, call(), resources());
  workers[0].emit('error', { message: 'obsolete worker error' });
  assert.equal(workers[1].terminated, false);
  workers[1].emit('message', { data: { type: 'simulatte:pipeline-worker:result',
    id: workers[1].messages[0].id, ok: true, output: { accepted: true } } });
  assert.deepEqual(await replacement, { accepted: true });
  client.cancel();
});

test('worker failure terminates the failed instance and rejects pending and future calls', async () => {
  const { client, workers } = harness({ execute: false });
  const pending = client.runPhase(1, call(), resources());
  const rejected = assert.rejects(pending, { code: 'SIMULATTE_PIPELINE_WORKER_UNAVAILABLE' });
  workers[0].emit('messageerror', {});
  await rejected;
  assert.equal(workers[0].terminated, true);
  await assert.rejects(client.compile('two cats', {}), { code: 'SIMULATTE_PIPELINE_WORKER_UNAVAILABLE' });
  assert.equal(workers.length, 1);
});

test('compatibility compile retains its WorldSpec result through the same worker protocol', async () => {
  const { client } = harness();
  const spec = await client.compile('two cats', request.configuration);
  assert.equal(spec.contentHash, model.createSpecFromPrompt('two cats', request.configuration).contentHash);
  client.cancel();
});
