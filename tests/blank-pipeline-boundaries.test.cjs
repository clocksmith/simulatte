const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
const runtime = require('../public/blank/app/prompt/prompt-controller-runtime.js');
const proof = require('../public/blank/pipeline/phase-08-scene-proof/simulatte-scene-proof.js');
const embedder = require('../public/blank/pipeline/phase-03-retrieval/simulatte-intent-embedder.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');
const scope = globalThis.SimulattePhaseModuleRegistry.family('physicsModel');
const Renderer = globalThis.SimulattePhaseModuleRegistry.family('webGpuRenderer').WebGpuRenderer;

function workerFixture() {
  const instances = [];
  class Worker {
    constructor() { this.events = {}; this.sent = []; instances.push(this); }
    addEventListener(type, fn) { this.events[type] = fn; }
    postMessage(data) { this.sent.push(data); }
    terminate() { this.terminated = true; }
  }
  const view = {
    Worker,
    location: { href: 'http://localhost/blank/', origin: 'http://localhost', search: '' },
    document: { baseURI: 'http://localhost/blank/', querySelector: () => null },
  };
  return { client: runtime.createIntentWorkerClient({ defaultView: view }), instances };
}

test('cancellation invalidates queued intent work, including before a worker starts', async () => {
  for (const startWorker of [false, true]) {
    const { client, instances } = workerFixture();
    const loaded = client.loadModel();
    const ranked = client.rankPrompt('abandoned cat', []);
    const outcomes = Promise.allSettled([loaded, ranked]);
    if (startWorker) await new Promise(setImmediate);
    client.cancel();
    for (const outcome of await outcomes) {
      assert.equal(outcome.status, 'rejected');
      assert.equal(outcome.reason.name, 'AbortError');
    }
    assert.equal(instances.length, startWorker ? 1 : 0);
    assert.ok(instances.every((worker) => worker.terminated));
    const fresh = client.rankPrompt('current dog', []);
    await new Promise(setImmediate);
    const worker = instances.at(-1);
    if (startWorker) {
      instances[0].events.error({ message: 'late error from cancelled worker' });
      instances[0].events.messageerror();
      assert.equal(worker.terminated, undefined);
    }
    assert.equal(worker.sent.at(-1).prompt, 'current dog');
    worker.events.message({ data: { type: 'simulatte:intent-worker:result', id: worker.sent.at(-1).id, ok: true, result: { current: true } } });
    assert.deepEqual(await fresh, { current: true });
    client.cancel();
  }
});

test('a crashed intent worker cannot retain queued requests or receive future work', async () => {
  const { client, instances } = workerFixture();
  const outcomes = Promise.allSettled([client.loadModel(), client.rankPrompt('cat', [])]);
  await new Promise(setImmediate);
  instances[0].events.error({ message: 'worker crashed' });
  assert.ok((await outcomes).every((row) => row.status === 'rejected'));
  await assert.rejects(client.loadModel(), /unavailable/);
  assert.equal(instances.length, 1);
  assert.equal(instances[0].terminated, true);
});

function compile(prompt) { return model.createSpecFromPrompt(prompt, { deterministicRuntime: true }); }

test('negation ends at a new clause without losing an affirmative count', () => {
  for (const prompt of ['no cats, only two dogs', 'no cats; two dogs', 'no cats but two dogs', 'no cats, two dogs']) {
    const spec = compile(prompt);
    const entities = spec.phaseArtifacts.phase2.artifact.sceneLanguageGraph.entities;
    assert.equal(entities.find((row) => row.id === 'entity:cat').negated, true);
    assert.equal(entities.find((row) => row.id === 'entity:dog').negated, false);
    const visible = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket.entities;
    assert.equal(visible.filter((row) => row.identity.type === 'cat').length, 0);
    assert.equal(visible.filter((row) => row.identity.type === 'dog').length, 2);
  }
  const entities = compile('no cats or dogs').phaseArtifacts.phase2.artifact.sceneLanguageGraph.entities;
  assert.ok(entities.every((row) => row.negated));
  const list = model.runPhase2LanguageGraph(model.runPhase1RuntimeGate('no cats, dogs, or mice', { deterministicRuntime: true }));
  assert.ok(list.artifact.sceneLanguageGraph.entities.every((row) => row.negated));
});

test('grounding cannot reintroduce excluded language spans or positive count obligations', () => {
  const phases = compile('no cats').phaseArtifacts;
  assert.equal(phases.phase3.artifact.queryPlan.slots.length, 0);
  assert.deepEqual(phases.phase4.artifact.groundedIntent.acceptedGraph.nodes, []);
  assert.deepEqual(phases.phase5.artifact.simulationCompile.renderIR.objects, []);
  assert.deepEqual(phases.phase6.artifact.visualCompile.sceneRenderPacket.entities, []);
  const obligations = phases.phase6.artifact.compositionLedger.obligations;
  assert.ok(obligations.some((row) => /absence-entity-cat/.test(row.id)));
  assert.ok(!obligations.some((row) => /count-cat/.test(row.id)));
});

test('retrieval carriers reject absent and mismatched provenance instead of stamping evidence', () => {
  const phase1 = model.runPhase1RuntimeGate('a cat', { deterministicRuntime: true });
  const evidence = { rankedPrimitives: [{ id: 'water', score: 0.9 }] };
  assert.throws(() => scope.withPhase1RetrievalEvidence(phase1, evidence), /sourcePromptHash is required/);
  assert.throws(() => scope.withPhase1RetrievalEvidence(phase1, { ...evidence, sourcePromptHash: scope.stableTextHash('a dog') }), /mismatch/);
  assert.throws(() => model.createSpecFromPrompt('a cat', { deterministicRuntime: true, embeddingPriors: evidence.rankedPrimitives }), /sourcePromptHash is required/);
  const bound = { ...evidence, sourcePromptHash: scope.stableTextHash('a cat') };
  const carrier = scope.withPhase1RetrievalEvidence(phase1, bound);
  assert.equal(scope.withPhase1RetrievalEvidence(carrier).artifact.runtimeContext.retrievalEvidence.sourcePromptHash, bound.sourcePromptHash);
  assert.equal(scope.withPhase1RetrievalEvidence(phase1, { ...evidence, promptHash: bound.sourcePromptHash }).artifact.runtimeContext.retrievalEvidence.sourcePromptHash, bound.sourcePromptHash);
  const phase3 = model.runPhase3Retrieval(model.runPhase2LanguageGraph(phase1), scope.runtimeContextFromPhase(carrier));
  assert.equal(phase3.phase, 3);
});

test('interactive playback uses the proof timestep independently of display frequency', () => {
  const spec = model.createSpec('magnetic-wheel');
  const states = [30, 60, 120].map((fps) => {
    const clock = model.createSimulationPlaybackClock(spec);
    let state = model.createSimulationState(spec);
    for (let frame = 0; frame < fps; frame += 1) state = clock.advance(state, spec, 1 / fps);
    return state;
  });
  assert.deepEqual(states[0], states[1]);
  assert.deepEqual(states[1], states[2]);
  assert.deepEqual(states[0], scope.runFixedStepSimulation(spec, { stepCount: 60, stepSeconds: 1 / 60 }));
  const clock = model.createSimulationPlaybackClock(spec);
  let state = model.createSimulationState(spec);
  state = clock.advance(state, spec, 2);
  state = clock.advance(state, spec, 0);
  assert.deepEqual(state, scope.runFixedStepSimulation(spec, { stepCount: 120, stepSeconds: 1 / 60 }));
  assert.throws(() => clock.advance(state, spec, NaN), /finite/);
});

test('retrieval producers reject stale query provenance before loading model artifacts', async () => {
  const client = embedder.create({ manifestUrl: 'https://unused.invalid/manifest.json' });
  for (const key of ['queryPlan', 'sceneLanguageGraph']) {
    await assert.rejects(client.rankPrompt('a cat', [], {
      [key]: { sourcePromptHash: scope.stableTextHash('a dog') },
    }), /sourcePromptHash does not match/);
  }
});

test('visual compilation ignores raw prompt substitutions in a fixed typed simulation artifact', () => {
  const phase5 = compile('a cat').phaseArtifacts.phase5;
  const expected = model.runPhase6VisualCompile(phase5);
  for (const prompt of ['a cat swimming underwater', 'a cat in a galaxy', 'no cats']) {
    const replacement = structuredClone(phase5);
    replacement.artifact.simulationCompile.renderIR.prompt = prompt;
    assert.deepEqual(model.runPhase6VisualCompile(replacement), expected);
  }
});

test('stale readback failures clean their buffer without changing the active scene', () => {
  for (const [packetKey, generation] of [['old-scene', 1], ['new-scene', 1]]) {
    let destroyed = false;
    const renderer = {
      renderData: { packetKey: 'new-scene', livePixelSamplesStatus: 'pass' },
      pixelReadbackGeneration: 2,
      canvas: { dataset: {} }, errorLog: [],
      refreshPhase7Output() { throw new Error('stale failure refreshed current proof'); },
    };
    Renderer.prototype.recordPixelReadbackFailure.call(renderer, {
      packetKey, generation, buffer: { destroy() { destroyed = true; } },
    }, new Error('old mapping failed'));
    assert.equal(destroyed, true);
    assert.equal(renderer.renderData.livePixelSamplesStatus, 'pass');
    assert.deepEqual(renderer.canvas.dataset, {});
    assert.deepEqual(renderer.errorLog, []);
  }
});

test('a current readback failure still marks current proof failed', () => {
  const renderer = {
    renderData: { packetKey: 'scene', livePixelSamplesStatus: 'pass' },
    pixelReadbackGeneration: 2, canvas: { dataset: {} }, errorLog: [],
    refreshPhase7Output() { this.refreshed = true; },
  };
  Renderer.prototype.recordPixelReadbackFailure.call(renderer, {
    packetKey: 'scene', generation: 2, plan: { samples: [] },
  }, new Error('current mapping failed'));
  assert.equal(renderer.renderData.livePixelSamplesStatus, 'fail');
  assert.equal(renderer.refreshed, true);
});

test('unchanged geometry cannot cache unexercised or failed simulation evidence', () => {
  const spec = compile('yellow excavator beside a glass greenhouse');
  const canvas = { width: 640, height: 480, dataset: {} };
  const state = model.createSimulationState(spec);
  const input = model.createRenderExecutionInput(spec, state, canvas, { buildId: 'test' });
  const renderer = {
    renderExecutionInput: input, sceneRenderPacket: input.sceneRenderPacket, canvas,
    renderData: globalThis.SimulattePhaseModuleRegistry.family('webGpuRenderer').compileSceneRenderData(input.sceneRenderPacket),
    webgpuOptimizationReceipt() { return {}; },
    settleSceneProof() { this.settlements = (this.settlements || 0) + 1; },
  };
  const refresh = () => Renderer.prototype.refreshPhase7Output.call(renderer, 3, 16);
  assert.equal(refresh().artifact.renderExecution.simulationReceipt.status, 'not-exercised');
  input.simulationState = model.stepSimulation(state, spec, 1 / 60);
  assert.equal(refresh().artifact.renderExecution.simulationReceipt.status, 'pass');
  const executed = refresh();
  assert.equal(renderer.settlements, 2);
  input.simulationState = { ...input.simulationState, solverState: { ...input.simulationState.solverState,
    executionReceipt: { ...input.simulationState.solverState.executionReceipt, status: 'fail', finiteChannels: false },
  } };
  assert.equal(refresh().artifact.renderExecution.simulationReceipt.status, 'fail');
  assert.equal(executed.artifact.renderExecution.simulationReceipt.status, 'pass');
  assert.equal(renderer.settlements, 3);
});

test('passing visual flags cannot erase a carried lost obligation', () => {
  const output = proof.settleSceneProof({
    schema: 'simulatte.phase7.output.v2', phase: 7,
    artifact: {
      renderExecution: { rendered: true, renderCount: 1, pixelAudit: { status: 'fail' }, visualObligationProof: [{ obligationId: 'visual:cat', status: 'pass' }] },
      compositionLedger: { obligations: [{ id: 'visual:cat', kind: 'visual', required: true, status: 'lost' }] },
    },
  });
  assert.equal(output.artifact.sceneProof.settledObligations[0].status, 'lost');
  assert.equal(output.artifact.sceneProof.verdict, 'fail');
});
