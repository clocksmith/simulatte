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

test('page dispatch executes and retains eight bound phases through the existing worker', async () => {
  const dispatch = require('../public/blank/app/prompt/prompt-controller-phase-dispatch.js');
  const policy = require('../public/data/create-phase-run-policy.json');
  const { client } = harness();
  const events = [];
  const producer = { id: 'page-dispatch-test', buildDigest: await contracts.artifactDigest({ fixture: 'page-dispatch' }) };
  const instance = dispatch.create({ model, worker: client, configuration: { ...policy, producer },
    renderer: { renderPhase: (previous, invocation) => model.runPhase7RenderExecution(previous, invocation.simulationSnapshot.state, null, {}) },
    reconcileProgram: async program => program,
    invocationForProgram: async (program, previous, signal, authored, replay) => {
      const state = replay ? await model.replaySimulationState(program, replay, signal) : model.createSimulationState(program);
      return model.createRenderInvocation(program, state, { index: replay ? replay.totalSteps : 0, simulationTime: state.t },
        { width: 640, height: 480 }, { ...(authored ? { phase6Output: previous } : {}), replayBaseline: replay?.baseline || null });
    },
    publishRuntime: event => events.push(event.phaseStep),
  });
  try {
    const prompt = 'a red ball beside a qzxwplk';
    const program = await instance.compile(prompt, { deterministicRuntime: true });
    const record = instance.getLatest();
    assert.equal(record.status, 'completed');
    assert.equal(record.attempts.length, 1);
    assert.deepEqual(record.attempts[0].outputs.map(output => output.phase), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(events, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(program.contentHash, model.createSpecFromPrompt(prompt, { deterministicRuntime: true, compilerLane: 'pipeline-worker' }).contentHash);
    assert.ok(program.physicsIR.receipt.unresolved.some(row => row.promptSpan === 'qzxwplk'));
    assert.ok(program.physicsIR.receipt.exact.every(row => row.canonicalId !== 'unresolved.qzxwplk'));
    assert.notEqual(record.attempts[0].outputs[7].artifact.sceneProof.verdict, 'pass', 'diagnostic component renderer cannot prove pixels');
    assert.ok(Object.isFrozen(record.attempts[0].outputs[0]));
    assert.equal(model.createIntentProofReceiptForSpec(program).failureCode, '');
    assert.equal(model.createSemanticProofReceiptForSpec(program).status, 'pass');
    const invalidSchema = structuredClone(program);
    invalidSchema.phaseArtifacts.phase4.schema = 'simulatte.phase4.output.v99';
    assert.equal(model.createIntentProofReceiptForSpec(invalidSchema).status, 'fail');
    assert.equal(model.createSemanticProofReceiptForSpec(invalidSchema).status, 'fail');
    const invalidLedger = structuredClone(program);
    invalidLedger.phaseArtifacts.phase2.artifact.intentRequirements.requirements[0].label = 'unbound replacement';
    assert.equal(model.createIntentProofReceiptForSpec(invalidLedger).status, 'fail');
    assert.equal(model.createSemanticProofReceiptForSpec(invalidLedger).status, 'fail');
    const candidate = JSON.parse(model.serializeSpec(program));
    const colored = candidate.universeGraph.nodes.find(row => row.properties?.some(property => property.kind === 'color'));
    colored.properties.find(property => property.kind === 'color').value = '#00aa44';
    const compatibleEdit = model.applyWorldSpecEdit(program, candidate, { rationale: 'Explicit synchronous local edit' });
    assert.equal(model.projectWorldSpec(compatibleEdit.phaseArtifacts).contentHash, compatibleEdit.contentHash);
    for (const phase of Object.values(compatibleEdit.phaseArtifacts)) assert.equal(phase.binding, undefined);
    assert.deepEqual(compatibleEdit.phaseArtifacts.phase4.receipts.find(row => row.id === 'local-authored-source').sourceBinding,
      program.phaseArtifacts.phase4.binding);
    const edited = model.recordWorldSpecEdit(program, candidate, { rationale: 'Make the ball green' });
    const recompiled = await instance.executeProgram(edited, { recompile: true });
    const editRun = instance.getLatest();
    assert.deepEqual(editRun.attempts[0].outputs.map(output => output.phase), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(recompiled.authorship, edited.authorship);
    assert.equal(model.projectWorldSpec(recompiled.phaseArtifacts).contentHash, recompiled.contentHash);
    for (const phase of [2, 3]) {
      const receipt = editRun.attempts[0].outputs[phase - 1].receipts.find(row => row.id === 'authored-phase-replay');
      assert.equal(receipt.interpreted, false);
      assert.equal(receipt.mode, 'authored-artifact-replay');
    }
    for (const phase of [4, 5, 6]) {
      assert.equal(editRun.attempts[0].outputs[phase - 1].receipts.find(row => row.id === 'authored-phase-replay').mode, 'authored-recompile');
    }
    const imported = model.deserializeSpec(model.serializeSpec(recompiled, { retainPhaseSources: true }));
    const replayed = await instance.executeProgram(imported);
    assert.equal(replayed.contentHash, recompiled.contentHash);
    assert.equal(replayed.universeGraph.nodes.find(row => row.id === colored.id).properties.find(row => row.kind === 'color').value, '#00aa44');
    let replayState = model.stepSimulation(model.createSimulationState(replayed), replayed, replayed.source.compilerConfig.simulationProof.stepSeconds);
    replayState = model.applyInteractionCommands(replayState, replayed.interactionIR, [{ sequence: 1, actionId: 'impulse',
      targetId: replayed.interactionIR.targets.find(row => row.capabilities.includes('impulse')).id, delta: [0.2, -0.3], value: 0.7 }]);
    const proof = require('../public/shared/contracts/world-proof.js');
    const replayBaseline = proof.createReplayBaseline({ binding: proof.createWorldProofBinding(replayed) });
    const executed = await instance.executeProgram(replayed, { replayState, replayBaseline });
    const execution = instance.getLatest();
    assert.equal(executed.contentHash, replayed.contentHash);
    assert.deepEqual(execution.attempts[0].outputs.map(row => row.phase), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(execution.attempts[0].request.request.kind, 'world-spec');
    const replayInput = execution.attempts[0].request.configuration.executionReplay;
    assert.equal(replayInput.commands[0].step, 1);
    assert.equal(replayInput.commands[0].command.value, 0.7);
    assert.equal(execution.attempts[0].outputs[1].receipts.find(row => row.id === 'authored-phase-replay').interpreted, false);
  } finally { instance.dispose(); client.cancel(); }
});

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

test('authored worker phases preserve admitted artifacts without fresh interpretation or retrieval', async () => {
  const { client, workers } = harness();
  const spec = model.createSpecFromPrompt('a red ball', { deterministicRuntime: true });
  const source = await model.createAuthoredPhaseResources(spec);
  const descriptor = { contentDigest: await contracts.artifactDigest({ fixture: 'authored-replay' }),
    capabilities: ['component-test'], residentBytes: 100 };
  const policy = { schema: 'simulatte.phaseRunPolicy.v1', id: 'authored-replay-test',
    maxInputBytes: 10000, maxEvidenceBytes: 20000000,
    phases: Array.from({ length: 8 }, (_, i) => ({ phase: i + 1, maxDurationMs: 30000,
      maxArtifactBytes: 5000000, maxResidentBytes: 10000000 })) };
  const outputs = [];
  const instance = runner.create({ phases: runner.localPhaseAdapters(model, { sourceMode: 'authored', workerResourceId: 'worker' }),
    policy, producer: { id: 'authored-worker-test', buildDigest: descriptor.contentDigest }, onPublish: output => outputs.push(output) });
  const original = contracts.canonicalJson(source.worldSpec);
  try {
    await instance.run(source.request, { resources: { ...source.resources,
      worker: { descriptor: { ...descriptor, id: 'worker' }, handle: client },
      renderer: { descriptor: { ...descriptor, id: 'renderer' }, handle: {
        renderPhase: (previous, invocation) => model.runPhase7RenderExecution(previous, invocation.simulationSnapshot.state, null, {}),
      } },
    }, invocationForPhase: (phase, previous) => phase === 7
      ? model.createRenderInvocation(source.worldSpec, { t: 0 }, { index: 0, simulationTime: 0 },
        { width: 300, height: 200 }, { phase6Output: previous }) : {} });
    assert.deepEqual(outputs.map(row => row.phase), [1, 2, 3, 4, 5, 6, 7, 8]);
    for (let phase = 2; phase <= 6; phase++) {
      const expected = { ...spec.phaseArtifacts[`phase${phase}`].artifact };
      if (Object.hasOwn(expected, 'runtimeContext')) expected.runtimeContext = outputs[phase - 2].artifact.runtimeContext;
      assert.deepEqual(outputs[phase - 1].artifact, expected);
      const receipt = outputs[phase - 1].receipts.find(row => row.id === 'authored-phase-replay');
      assert.equal(receipt.mode, 'authored-artifact-replay');
      assert.equal(receipt.interpreted, false);
    }
    assert.equal(contracts.canonicalJson(source.worldSpec), original);
    assert.ok(workers[0].messages.every(message => message.sourceMode === 'authored'));
    const restored = model.deserializeSpec(model.serializeSpec(source.worldSpec, { retainPhaseSources: true }));
    assert.equal(restored.contentHash, spec.contentHash);
    await model.createAuthoredPhaseResources(restored);
  } finally { instance.dispose(); client.cancel(); }
});

test('authored replay rejects changed provenance, cross-world sources and ignored authoring', async () => {
  const { client } = harness();
  const first = await model.createAuthoredPhaseResources(model.createSpecFromPrompt('two cats', { deterministicRuntime: true }));
  const second = await model.createAuthoredPhaseResources(model.createSpecFromPrompt('three cats', { deterministicRuntime: true }));
  const initialCall = { previous: first.request, invocation: {} };
  const handles = ids => Object.fromEntries(ids.map(id => [id, first.resources[id].handle]));
  try {
    await assert.rejects(client.runPhase(1, initialCall, handles(['compiler-options'])), /source mode/);
    await assert.rejects(client.runPhase(1, initialCall, { ...handles(['compiler-options']),
      'authored-phase-1': second.resources['authored-phase-1'].handle }, { sourceMode: 'authored' }), /provenance/);
    const phase1 = await client.runPhase(1, initialCall, handles(['compiler-options', 'authored-phase-1']), { sourceMode: 'authored' });
    await assert.rejects(client.runPhase(2, { previous: phase1, invocation: {} },
      { 'authored-phase-2': second.resources['authored-phase-2'].handle }, { sourceMode: 'authored' }), /provenance/);
    const corrupted = structuredClone(first.resources['authored-phase-2'].handle);
    corrupted.output.artifact.promptParse = {};
    await assert.rejects(client.runPhase(2, { previous: phase1, invocation: {} },
      { 'authored-phase-2': corrupted }, { sourceMode: 'authored' }), /digest mismatch/);
    await assert.rejects(client.runPhase(2, { previous: phase1, invocation: {} },
      { ...handles(['authored-phase-2']), 'authored-phase-3': first.resources['authored-phase-3'].handle },
      { sourceMode: 'authored' }), /declared dependencies/);
  } finally { client.cancel(); }
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

test('page reconciliation starts an explicit authored request and cancellation cannot replay a late decision', async () => {
  const dispatch = require('../public/blank/app/prompt/prompt-controller-phase-dispatch.js');
  const policy = require('../public/data/create-phase-run-policy.json');
  const { client } = harness();
  let decide;
  let waiting;
  let needsDecision = true;
  let draws = 0;
  const decisionStarted = () => new Promise(resolve => { waiting = resolve; });
  const instance = dispatch.create({ model, worker: client,
    configuration: { ...policy, producer: { id: 'decision-test', buildDigest: await contracts.artifactDigest({ fixture: 'decision' }) } },
    renderer: { renderPhase(previous, invocation) {
      draws += 1;
      return model.runPhase7RenderExecution(previous, invocation.simulationSnapshot.state, null, {});
    } },
    requiresReconciliation: () => needsDecision,
    reconcileProgram: program => { waiting(program); return new Promise(resolve => { decide = resolve; }); },
    invocationForProgram: (program, previous, _signal, authored) => model.createRenderInvocation(program,
      model.createSimulationState(program), { index: 0, simulationTime: 0 }, { width: 640, height: 480 },
      authored ? { phase6Output: previous } : {}),
  });
  try {
    const firstDecision = decisionStarted();
    const first = instance.compile('a red ball', { deterministicRuntime: true });
    const cancelled = assert.rejects(first, { name: 'AbortError' });
    const candidate = await firstDecision;
    assert.equal(instance.getLatest().status, 'awaiting-reconciliation');
    assert.equal(instance.getLatest().attempts[0].outputs.length, 6);
    assert.equal(draws, 0);
    instance.cancel();
    await cancelled;
    assert.equal(instance.getLatest().status, 'cancelled');
    const obsoleteDecision = decide;
    const nextDecision = decisionStarted();
    const second = instance.compile('a blue ball', { deterministicRuntime: true });
    const accepted = await nextDecision;
    obsoleteDecision(candidate);
    decide(accepted);
    const result = await second;
    const receipt = instance.getLatest();
    assert.equal(receipt.status, 'completed');
    assert.equal(result.source.prompt, 'a blue ball');
    assert.deepEqual(receipt.attempts.map(row => row.outputs.length), [6, 8]);
    assert.equal(receipt.attempts[1].sourceMode, 'authored');
    assert.equal(receipt.attempts[1].request.retryPolicy.previousPhase6Digest,
      await contracts.artifactDigest(receipt.attempts[0].outputs[5]));
    assert.equal(draws, 1, 'only the accepted current program is drawn');
  } finally { instance.dispose(); client.cancel(); }
});

test('page cancellation settles pending ingress and malformed options retain their failure', async () => {
  const dispatch = require('../public/blank/app/prompt/prompt-controller-phase-dispatch.js');
  const instance = dispatch.create({ model, configuration: new Promise(() => {}), invocationForProgram() {} });
  try {
    const pending = instance.compile('two cats', {});
    const cancelled = assert.rejects(pending, { name: 'AbortError' });
    instance.cancel();
    await cancelled;
    assert.equal(instance.getLatest().status, 'cancelled');
    assert.deepEqual(instance.getLatest().attempts, []);
    await assert.rejects(instance.compile('two cats', { invalid: undefined }), /serializable finite value/);
    assert.equal(instance.getLatest().status, 'failed');
    assert.match(instance.getLatest().error.message, /invalid/);
  } finally { instance.dispose(); }
});


test('construction retries retain failure identities and preserve edits before the replacement draws', async () => {
  const dispatch = require('../public/blank/app/prompt/prompt-controller-phase-dispatch.js');
  const search = require('../public/blank/app/prompt/prompt-controller-construction-search.js');
  const reconciliation = require('../public/shared/contracts/world-spec-reconciliation.js');
  const { client } = harness();
  const drawn = [];
  let decisions = 0;
  const instance = dispatch.create({ model, worker: client,
    configuration: { ...require('../public/data/create-phase-run-policy.json'),
      producer: { id: 'retry-test', buildDigest: await contracts.artifactDigest({ fixture: 'retry' }) } },
    renderer: { renderPhase(previous, invocation) {
      drawn.push(previous);
      return model.runPhase7RenderExecution(previous, invocation.simulationSnapshot.state, null, {});
    } },
    reconcileProgram(candidate, _signal, authored) {
      decisions++;
      return reconciliation.applyDecision(authored, candidate, 'preserve-overrides', { decidedBy: 'fixture-user' }).worldSpec;
    },
    invocationForProgram: (program, previous, _signal, authored) => model.createRenderInvocation(program,
      model.createSimulationState(program), { index: 0, simulationTime: 0 }, { width: 640, height: 480 },
      authored ? { phase6Output: previous } : {}),
  });
  try {
    const original = await instance.compile('a red cat', { deterministicRuntime: true });
    const draft = JSON.parse(model.serializeSpec(original));
    const cat = draft.universeGraph.nodes.find(row => row.properties?.some(p => p.kind === 'color'));
    cat.properties.find(p => p.kind === 'color').value = '#00aa44';
    const edited = await instance.executeProgram(model.recordWorldSpecEdit(original, draft,
      { rationale: 'Keep the cat green' }), { recompile: true });
    const packet = edited.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
    const phase7Output = model.runPhase7RenderExecution(edited.phaseArtifacts.phase6, model.createSimulationState(edited), null, {});
    phase7Output.artifact.renderExecution.worldProofBinding = require('../public/shared/contracts/world-proof.js').createWorldProofBinding(edited);
    const phase8Output = model.runPhase8SceneProof(phase7Output);
    const obligation = phase8Output.artifact.compositionLedger.obligations.find(row => row.id === 'entity:cat');
    obligation.status = 'lost';
    phase8Output.artifact.sceneProof = { verdict: 'fail', evidence: { pixelAuditStatus: 'fail' },
      settledObligations: [{ obligationId: 'entity:cat', status: 'lost', required: true }] };
    const report = { final: true, packetKey: 'cat:retry-fixture', sceneRenderPacket: packet, phase7Output, phase8Output };
    const decision = search.observeConstructionSceneProof(report, edited, search.createConstructionSearchState());
    assert.equal(decision.action, 'retry');
    const before = await contracts.artifactDigest(edited);
    const drawCount = drawn.length;
    const next = await instance.retryConstruction(edited, decision, report);
    const record = instance.getLatest();
    assert.equal(record.status, 'completed');
    assert.deepEqual(record.attempts.map(row => row.outputs.length), [6, 8]);
    assert.equal(decisions, 1);
    assert.equal(drawn.length, drawCount + 1, 'unreconciled prompt candidate must not draw');
    assert.equal(next.universeGraph.nodes.find(row => row.id === cat.id).properties.find(p => p.kind === 'color').value, '#00aa44');
    assert.equal(await contracts.artifactDigest(edited), before);
    assert.equal(record.attempts[0].request.retryPolicy.previousWorldSpecDigest, before);
    assert.equal(record.attempts[0].request.retryPolicy.failureEvidenceDigest, await contracts.artifactDigest(phase8Output));
    assert.deepEqual(record.attempts[1].request.retryPolicy.constructionRetry, record.attempts[0].request.retryPolicy);
    assert.deepEqual(next.source.compilerConfig.constructionApproach, decision.nextApproach);
    assert.equal(model.projectWorldSpec(next.phaseArtifacts).contentHash, next.contentHash);
    assert.notEqual(next.phaseArtifacts.phase5.binding.predecessorDigest, edited.phaseArtifacts.phase5.binding.predecessorDigest);
    const wrongReport = structuredClone(report);
    wrongReport.phase7Output.artifact.renderExecution.worldProofBinding.worldSpec.contentHash = original.contentHash;
    await assert.rejects(instance.retryConstruction(edited, decision, wrongReport), /does not bind/);
    assert.equal(instance.getLatest().status, 'failed');
    assert.equal(drawn.length, drawCount + 1);
    const exhausted = structuredClone(decision);
    exhausted.state.maxAttempts = exhausted.state.attempts.length;
    await assert.rejects(instance.retryConstruction(edited, exhausted, report), /attempt budget/);
    const cancelled = instance.retryConstruction(edited, decision, report);
    instance.cancel('fixture cancellation');
    await assert.rejects(cancelled, /cancellation/);
    assert.equal(instance.getLatest().status, 'cancelled');
    assert.equal(drawn.length, drawCount + 1);
    const original7 = model.runPhase7RenderExecution(original.phaseArtifacts.phase6, model.createSimulationState(original), null, {});
    original7.artifact.renderExecution.worldProofBinding = require('../public/shared/contracts/world-proof.js').createWorldProofBinding(original);
    const original8 = model.runPhase8SceneProof(original7);
    original8.artifact.sceneProof = structuredClone(phase8Output.artifact.sceneProof);
    const originalReport = { ...report, phase7Output: original7, phase8Output: original8,
      sceneRenderPacket: original.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket };
    const originalDecision = search.observeConstructionSceneProof(originalReport, original, search.createConstructionSearchState());
    const retried = await instance.retryConstruction(original, originalDecision, originalReport);
    assert.deepEqual(instance.getLatest().attempts.map(row => row.outputs.length), [8]);
    assert.equal(decisions, 1);
    assert.deepEqual(retried.source.compilerConfig.constructionApproach, originalDecision.nextApproach);
    const retainedFailure = originalDecision.attempt.evidence.phase8Output;
    original8.artifact.sceneProof.verdict = 'pass';
    assert.equal(retainedFailure.artifact.sceneProof.verdict, 'fail');
    assert.ok(Object.isFrozen(retainedFailure.artifact.sceneProof));
  } finally { instance.dispose(); client.cancel(); }
});
