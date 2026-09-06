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

const lab = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
const support = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-ir-domains.js');
const rigid = require('../public/blank/pipeline/phase-05-simulation/solvers/simulatte-solver-rigid-body-2d.js');
const workers = require('../public/blank/app/prompt/prompt-controller-workers.js');
const progress = require('../public/blank/app/runtime/runtime-progress-state.js');
const phase7Proof = require('../public/blank/pipeline/phase-07-render/simulatte-render-proof.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');
const { phaseFamily } = require('./phase-module-fixture.cjs');
const renderer = phaseFamily('webGpuRenderer');
const compileBoundaryPrompt = (prompt) => lab.createSpecFromPrompt(prompt, {
  allowPrototypeFallback: true, deterministicRuntime: true, retrievalPhase: 'deterministic-local',
});
const packetFor = (spec) => spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;

test('falling reaches one real body and a gravity operator without a visible gravity object or fluid substitution', () => {
  const spec = compileBoundaryPrompt('a red ball falling under gravity');
  assert.equal(spec.physicsIR.entities.length, 1);
  assert.equal(spec.physicsIR.entities[0].semanticClass, 'ball');
  assert.ok(spec.solverGraph.steps.some((row) => row.operatorType === 'free_fall'));
  assert.ok(!spec.solverGraph.steps.some((row) => row.operatorType === 'advection'));
  const step = spec.solverGraph.steps.find((row) => row.operatorType === 'free_fall');
  assert.equal(step.integrator.scheme, 'constant_acceleration_v1');
  const entity = spec.physicsIR.entities[0];
  let state = lab.createSimulationState(spec);
  const start = state.solverState.channels[`position:${entity.id}`].y;
  for (let i = 0; i < 30; i += 1) state = lab.stepSimulation(state, spec, 1 / 60);
  const channels = state.solverState.channels;
  assert.ok(Math.abs(channels[`position:${entity.id}`].y - start - 9.81 * 0.5 ** 2 / 20) < 1e-8);
  assert.ok(Math.abs(channels[`velocity:${entity.id}`].y - 4.905) < 1e-8);
  assert.ok(state.solverState.executionReceipt.executedOperatorIds.includes(step.operatorId));
  const packet = packetFor(spec);
  const data = renderer.compileSceneRenderData(packet);
  const binding = packet.interactionProgram.mappings[0];
  assert.ok(binding.positionProjection);
  for (let i = 0; i < 600; i += 1) state = lab.stepSimulation(state, spec, 1 / 60);
  const projected = renderer.scenePacketInteractionPartData(data.objectPartData, data.objectParts, packet, state);
  data.objectParts.forEach((part, i) => {
    const centerY = projected.data[i * renderer.GPU_OBJECT_PART_FLOATS + 1];
    assert.ok(centerY - part.size[1] / 2 >= 0 && centerY + part.size[1] / 2 <= 1, part.id);
  });
  assert.ok(Math.abs(state.solverState.channels[`velocity:${entity.id}`].y) < 1e-8);
});

test('pendulum integration oscillates with bounded energy and the rendered rod connects pivot to bob', () => {
  const spec = compileBoundaryPrompt('a pendulum swinging under gravity');
  const op = spec.solverGraph.steps.find((row) => row.operatorType === 'pendulum');
  assert.equal(op.integrator.scheme, 'velocity_verlet_v1');
  const id = spec.physicsIR.entities[0].id;
  let state = lab.createSimulationState(spec);
  const energy = (s) => 0.5 * s.solverState.channels[`angularVelocity:${id}`] ** 2 +
    9.81 * (1 - Math.cos(s.solverState.channels[`angle:${id}`]));
  const initialEnergy = energy(state);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 600; i += 1) {
    state = lab.stepSimulation(state, spec, 1 / 60);
    const angle = state.solverState.channels[`angle:${id}`];
    min = Math.min(min, angle); max = Math.max(max, angle);
    assert.ok(Math.abs(energy(state) / initialEnergy - 1) < 0.002);
  }
  assert.ok(min < -0.5 && max > 0.5);
  const packet = packetFor(spec);
  assert.notEqual(packet.sceneKind, 'watershed');
  const data = renderer.compileSceneRenderData(packet);
  assert.equal(data.cameraState.perspective, 0);
  const moved = renderer.scenePacketInteractionPartData(data.objectPartData, data.objectParts, packet, state);
  const part = (id) => {
    const index = data.objectParts.findIndex((row) => row.id.endsWith(`:${id}`));
    assert.ok(index >= 0, id);
    const offset = index * renderer.GPU_OBJECT_PART_FLOATS;
    return { x: moved.data[offset], y: moved.data[offset + 1], angle: moved.data[offset + 4],
      length: moved.data[offset + 3] };
  };
  const pivot = part('pivot'), bob = part('bob'), rod = part('rod');
  assert.ok(Math.abs((pivot.x + bob.x) / 2 - rod.x) < 1e-6);
  assert.ok(Math.abs((pivot.y + bob.y) / 2 - rod.y) < 1e-6);
  assert.ok(Math.abs(Math.hypot(bob.x - pivot.x, bob.y - pivot.y) - rod.length) < 1e-6);
  assert.ok(Math.abs(Math.atan2(bob.x - pivot.x, bob.y - pivot.y) - rod.angle) < 1e-6);
});

test('invalid mechanics cannot silently generate non-finite or energy-creating state', () => {
  for (const params of [{ massKg: 0 }, { lengthMeters: -1 }, { acceleration: NaN }, { restitution: 1.2 }]) {
    assert.throws(() => rigid.step({ step: { operatorType: 'pendulum', params }, dt: 0.01 }), /Mechanics|mechanics/);
  }
});

test('autonomous solver frames refresh the uploaded parts without an interaction, and absent execution cannot prove motion', () => {
  const spec = compileBoundaryPrompt('a red ball falling under gravity');
  const packet = packetFor(spec);
  const data = renderer.compileSceneRenderData(packet);
  const host = Object.create(renderer.WebGpuRenderer.prototype);
  Object.assign(host, { baseObjectPartData: data.objectPartData, baseObjectParts: data.objectParts,
    sceneRenderPacket: packet, renderData: data, canvas: { dataset: {} } });
  const before = lab.createSimulationState(spec);
  host.updateInteractionVisualState(before);
  const initial = host.objectPartData.slice();
  let state = before;
  for (let i = 0; i < 20; i += 1) state = lab.stepSimulation(state, spec, 1 / 60);
  assert.equal(state.interaction.version, before.interaction.version);
  host.updateInteractionVisualState(state);
  assert.notDeepEqual(host.objectPartData, initial);
  const advanced = host.objectPartData.slice();
  host.updateInteractionVisualState(state);
  assert.deepEqual(host.objectPartData, advanced, 'same-frame update must not compound displacement');
  host.updateInteractionVisualState(before);
  assert.deepEqual(host.objectPartData, initial, 'fresh solver state restores initial geometry');
  const input = lab.createRenderExecutionInput(spec, state, { width: 640, height: 360 });
  const action = input.visualObligations.find((row) => row.simulationBinding);
  assert.ok(action);
  const result = phase7Proof.renderObligationProof(packet, [action], input.compositionLedger, true, data)[0];
  assert.equal(result.geometrySatisfied, false);
  assert.equal(result.simulationProof.consumed, false);
  assert.equal(result.status, 'fail');
});

test('qualified absence preserves positive mentions, including reversed clause order', () => {
  for (const prompt of ['two red balls and no blue balls', 'no blue balls and two red balls']) {
    const spec = compileBoundaryPrompt(prompt);
    const entries = spec.phaseArtifacts.phase2.artifact.compositionLedger.entries;
    assert.ok(entries.length > 0);
    assert.equal(new Set(entries.map((row) => row.id)).size, entries.length);
    const packet = packetFor(spec);
    const balls = packet.entities.filter((row) => row.identity.type === 'ball');
    assert.equal(balls.length, 2, prompt);
    assert.ok(balls.every((row) => row.properties.some((property) => property.kind === 'color' && property.value === '#ef3340')));
    const input = lab.createRenderExecutionInput(spec, lab.createSimulationState(spec), { width: 640, height: 360 });
    const absence = input.visualObligations.find((row) => row.constraintKind === 'absence');
    assert.equal(absence.targetIdentity, 'ball');
    assert.deepEqual(absence.expectedProperties.map((row) => row.value), ['#3688d8']);
    const data = renderer.compileSceneRenderData(packet);
    data.rendererConsumption.objectSubmissionConsumed = true;
    data.rendererConsumption.semanticCodesConsumed = true;
    data.rendererConsumption.objectPartCountConsumed = data.objectPartCount;
    data.requireLivePixelSamples = true;
    // Synthetic submission/readback fixture; this is not hardware evidence.
    data.pixelSamples = { schema: 'simulatte.phase7PixelSampleSet.v1', source: 'webgpu-texture-copy-readback',
      packetKey: data.packetKey, readbackSerial: 1, samples: [{ id: 'fixture', rgba: [200, 35, 45, 255] }] };
    const inspect = () => phase7Proof.renderObligationProof(packet, [absence], input.compositionLedger, true, data)[0];
    assert.equal(inspect().status, 'pass');
    data.objectPartData[8] = 0.21;
    data.objectPartData[9] = 0.53;
    data.objectPartData[10] = 0.85;
    assert.equal(inspect().status, 'fail', 'mismatched uploaded color must fail');
    data.pixelSamples.packetKey += ':stale';
    assert.equal(inspect().status, 'fail', 'stale readback must fail');
  }
});

test('Phase 5 retains adverse status and only associates operators with their own obligations', () => {
  const rows = ['unsupported', 'lost', 'failed', 'refused', 'explicitly-refused', 'negated'].map((status) =>
    ({ id: `action:${status}`, kind: 'action', status }));
  const ledger = { obligations: [...rows, { id: 'action:falling', kind: 'action', status: 'supported' },
    { id: 'action:swimming', kind: 'action', status: 'pending' }] };
  const lowered = support.lowerCompositionLedgerForPhysics(ledger, [
    ...rows.map((row) => ({ process: row.id.slice(7), operators: ['fake'], status: 'lowered' })),
    { process: 'falling', operators: ['free_fall'], status: 'lowered' },
  ]);
  assert.deepEqual(lowered.obligations.slice(0, rows.length), rows);
  assert.deepEqual(lowered.obligations.at(-2).loweredTo, ['free_fall']);
  assert.equal(lowered.obligations.at(-1).status, 'pending');
  assert.equal(lowered.currentPhase, 5);
});

test('training exposes exact adjacent envelopes, detached snapshots, and discards previous run proof', () => {
  const spec = compileBoundaryPrompt('two red balls and no blue balls');
  const run = workers.createTrainingRunState();
  workers.beginTrainingRun(run, spec.prompt, {}, 1);
  const snapshot = workers.trainingSnapshot(run, spec);
  for (let phase = 1; phase <= 6; phase += 1) {
    const row = snapshot.artifacts[`1->${phase}`];
    assert.deepEqual(row.output, spec.phaseArtifacts[`phase${phase}`]);
    assert.deepEqual(row.input, phase === 1 ? null : spec.phaseArtifacts[`phase${phase - 1}`]);
  }
  snapshot.artifacts['1->2'].output.artifact.languageGraph.sourceText = 'tampered';
  assert.notEqual(workers.trainingSnapshot(run, spec).artifacts['1->2'].output.artifact.languageGraph.sourceText, 'tampered');
  run.sceneProofReport = { phase7Output: { artifact: { renderExecution: { worldProofBinding: {
    worldSpec: { contentHash: 'wrong-run' },
  } } } }, phase8Output: { phase: 8 } };
  assert.equal(workers.trainingSnapshot(run, spec).artifacts['1->8'], undefined);
  workers.beginTrainingRun(run, 'another prompt', {}, 2);
  assert.deepEqual(run.artifacts, {});
  assert.equal(run.sceneProofReport, null);
});

test('progress assigns all proof events to Phase 8 and keeps the failing phase', () => {
  for (const stage of ['construction-proof', 'compiler-proof', 'scene-proof']) {
    for (const state of ['active', 'ready', 'error']) {
      const event = { stage, state };
      assert.equal(progress.phaseForStage(progress.canonicalStage(event), event).step, 8);
    }
  }
  const event = { stage: 'simulation.compile', state: 'error' };
  assert.equal(progress.phaseForStage(progress.canonicalStage(event), event).step, 5);
});
