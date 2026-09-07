const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const contracts = require('../public/blank/pipeline/simulatte-phase-contracts.js');
const runner = require('../public/blank/app/runtime/phase-runner.js');
const hash = `sha256:${'a'.repeat(64)}`;
const producer = { id: 'test-phase-transform', buildDigest: hash };
const request = { request: { kind: 'prompt', text: 'two cats' }, configuration: {}, authoredInputs: [], retryPolicy: null };
const policy = { schema: 'simulatte.phaseRunPolicy.v1', id: 'test-budget-v1', maxInputBytes: 10000, maxEvidenceBytes: 1000000,
  phases: Array.from({ length: 8 }, (_, i) => ({ phase: i + 1, maxDurationMs: 1000, maxArtifactBytes: 100000, maxResidentBytes: 1000 })) };
const invocationForPhase = phase => phase === 7
  ? { simulationSnapshot: { time: 0 }, frame: { index: 0, simulationTime: 0 }, viewport: { width: 390, height: 844 } } : {};
function output(phase) {
  const contract = contracts.phases[phase - 1];
  return contracts.createPhaseEnvelope({ phase, runtimeReceiptId: 'test-runtime',
    artifact: Object.fromEntries(contract.artifactKeys.map(key => [key, {}])),
    receipts: contract.receipts.map(id => ({ id, schema: 'simulatte.phaseReceipt.v1' })) });
}
function phases() {
  return Array.from({ length: 8 }, (_, i) => ({ phase: i + 1, resourceIds: [],
    validateInput: call => assert.equal(call.previous.phase || 0, i),
    validateOutput: value => contracts.assertPhaseEnvelope(value, i + 1), run: () => output(i + 1) }));
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

test('canonical integrity uses UTF-8 SHA-256 and rejects lossy serialization and handles', async () => {
  const value = { z: '🌕', a: { b: 2 } };
  const text = '{"a":{"b":2},"z":"🌕"}';
  assert.equal(contracts.canonicalJson(value), text);
  assert.equal(await contracts.artifactDigest(value), `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`);
  for (const invalid of [NaN, Infinity, undefined, () => 1, { value: undefined }, new Map(), new Date(), new Uint8Array(2), Array(2), { get value() { throw new Error('must not execute'); } }]) {
    assert.throws(() => contracts.canonicalJson(invalid), /serializable|value|accessor|handle/);
  }
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => contracts.canonicalJson(cycle), /cyclic/);
});

test('all eight outputs bind exact predecessors, invocation, dependencies, producer and revision', async () => {
  const published = [];
  const instance = runner.create({ phases: phases(), policy, producer, onPublish: value => published.push(value) });
  const outputs = await instance.run(request, { invocationForPhase });
  assert.deepEqual(outputs.map(p => p.phase), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(published, outputs);
  let previous = contracts.createRequestEnvelope(request);
  for (const value of outputs) {
    const call = { previous, invocation: invocationForPhase(value.phase) };
    const expected = { producer, dependencies: [], revision: 1 };
    await contracts.validateBoundOutput(value, call, expected);
    assert.ok(Object.isFrozen(value.artifact));
    const forged = structuredClone(value); forged.artifact[contracts.phases[value.phase - 1].artifactKeys[0]].tampered = true;
    await assert.rejects(contracts.validateBoundOutput(forged, call, expected), /artifactDigest mismatch/);
    await assert.rejects(contracts.validateBoundOutput(value, call, { ...expected, revision: 2 }), /Stale/);
    await assert.rejects(contracts.validateBoundOutput(value, call, { ...expected, producer: { ...producer, id: 'different' } }), /producerDigest/);
    previous = value;
  }
  const call = { previous: outputs[5], invocation: { ...invocationForPhase(7), viewport: { width: 1440, height: 1000 } } };
  await assert.rejects(contracts.validateBoundOutput(outputs[6], call, { producer, dependencies: [], revision: 1 }), /invocationDigest/);
  const wrongPrevious = structuredClone(outputs[5]); wrongPrevious.receipts.push({ schema: 'simulatte.phaseReceipt.v1', id: 'extra' });
  await assert.rejects(contracts.validateBoundOutput(outputs[6], { previous: wrongPrevious, invocation: invocationForPhase(7) }, { producer, dependencies: [], revision: 1 }), /predecessorDigest/);
});

test('superseded work cannot publish and releases a resource only after actual completion', async () => {
  const entered = deferred(), finish = deferred();
  const rows = phases(); let released = false; let useSlow = true;
  rows[0].resourceIds = ['model'];
  rows[0].run = async () => { if (useSlow) { entered.resolve(); await finish.promise; } return output(1); };
  const publications = [];
  const instance = runner.create({ phases: rows, policy, producer, onPublish: out => publications.push(out.binding.revision) });
  const resources = { model: { descriptor: { id: 'model', contentDigest: hash, capabilities: ['generate'], residentBytes: 100 }, handle: {}, acquire: async () => () => { released = true; } } };
  const obsolete = instance.run(request, { resources, invocationForPhase });
  const rejected = assert.rejects(obsolete, { name: 'AbortError' });
  await entered.promise;
  instance.cancel();
  await rejected;
  assert.equal(released, false);
  assert.deepEqual(publications, []);
  finish.resolve(); await new Promise(setImmediate);
  assert.equal(released, true);
  useSlow = false;
  await instance.run(request, { resources, invocationForPhase });
  assert.equal(publications.length, 8);
  assert.ok(publications.every(value => value === 3));
});

test('budgets, invalid phase order and undeclared invocation fail before publication', async () => {
  assert.throws(() => runner.create({ phases: phases().reverse(), policy, producer }), /order/);
  for (const [budget, options, pattern] of [
    [{ ...policy, maxInputBytes: 1 }, { invocationForPhase }, /input byte budget/],
    [{ ...policy, maxEvidenceBytes: 1 }, { invocationForPhase }, /Evidence storage budget/],
    [policy, { invocationForPhase: () => ({ rawPrompt: 'secret side channel' }) }, /undeclared/],
    [{ ...policy, phases: policy.phases.map(p => ({ ...p, maxArtifactBytes: 1 })) }, { invocationForPhase }, /artifact budget/],
  ]) {
    const publications = [];
    const instance = runner.create({ phases: phases(), policy: budget, producer, onPublish: value => publications.push(value) });
    await assert.rejects(instance.run(request, options), pattern);
    assert.deepEqual(publications, []);
  }
});

test('a timed-out attempt cannot publish after a successful retry', async () => {
  const finish = deferred(); const rows = phases(); let blocked = true;
  rows[0].run = async () => { if (blocked) await finish.promise; return output(1); };
  const published = [];
  const instance = runner.create({ phases: rows, policy: { ...policy, phases: policy.phases.map(p => ({ ...p, maxDurationMs: 30 })) }, producer, onPublish: value => published.push(value.binding.revision) });
  await assert.rejects(instance.run(request, { invocationForPhase }), /deadline/);
  blocked = false;
  await instance.run(request, { invocationForPhase });
  finish.resolve(); await new Promise(setImmediate);
  assert.deepEqual(published, Array(8).fill(2));
});

test('disposed and externally cancelled runs never execute phases', async () => {
  const rows = phases(); rows[0].run = () => { throw new Error('should not execute'); };
  const instance = runner.create({ phases: rows, policy, producer });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(instance.run(request, { signal: controller.signal }), { name: 'AbortError' });
  instance.dispose();
  await assert.rejects(instance.run(request), /disposed/);
});

test('invalid dependencies fail before acquisition or model execution', async () => {
  const rows = phases(); rows[0].resourceIds = ['model'];
  rows[0].run = () => { throw new Error('should not execute'); };
  const instance = runner.create({ phases: rows, policy, producer });
  const resources = { model: { descriptor: { id: 'model', contentDigest: 'forged', residentBytes: 10, capabilities: ['generate'] }, handle: {}, acquire() { throw new Error('should not acquire'); } } };
  await assert.rejects(instance.run(request, { resources, invocationForPhase }), /SHA-256/);
});

test('current local compilation has immutable serializable phase artifacts without runtime retrieval feedback', async () => {
  const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
  const compiled = model.createSpecFromPrompt(request.request.text, { deterministicRuntime: true });
  assert.equal(Object.hasOwn(compiled.phaseArtifacts.phase1.artifact.runtimeContext, 'retrievalEvidence'), false);
  let previous = contracts.createRequestEnvelope(request);
  for (const value of Object.values(compiled.phaseArtifacts)) {
    const call = { previous, invocation: {} };
    const expected = { producer, dependencies: [], revision: 1 };
    previous = await contracts.bindPhaseOutput(value, call, expected);
    await contracts.validateBoundOutput(previous, call, expected);
  }
});

test('local adapters execute actual transformations in order and retain missing pixel evidence as unproven', async () => {
  const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
  const options = { deterministicRuntime: true };
  const contentDigest = await contracts.artifactDigest(options);
  const actualPolicy = { ...policy, maxEvidenceBytes: 10000000,
    phases: policy.phases.map(p => ({ ...p, maxArtifactBytes: 3000000, maxDurationMs: 30000 })) };
  const instance = runner.create({ phases: runner.localPhaseAdapters(model), policy: actualPolicy, producer });
  const outputs = await instance.run({ ...request, configuration: options }, { invocationForPhase,
    resources: {
      'compiler-options': { descriptor: { id: 'compiler-options', contentDigest, capabilities: ['local-compile'], residentBytes: 100 }, handle: options },
      renderer: { descriptor: { id: 'renderer', contentDigest: hash, capabilities: ['diagnostic-only'], residentBytes: 100 },
        handle: { renderPhase: (previous, invocation) => model.runPhase7RenderExecution(previous, invocation.simulationSnapshot, null, {}) } },
    },
  });
  assert.deepEqual(outputs.map(output => output.phase), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.notEqual(outputs[7].artifact.sceneProof.verdict, 'pass');
  assert.equal(outputs[5].artifact.visualCompile.sceneRenderPacket.entities.filter(row => row.identity.type === 'cat').length, 2);
});

test('WorldSpec normalization preserves the accepted bound visual artifact across worker transfer', async () => {
  const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
  const spec = model.createSpecFromPrompt('two cats', { deterministicRuntime: true });
  const expected = { producer, dependencies: [], revision: 1 };
  let previous = contracts.createRequestEnvelope({ ...request, request: { kind: 'prompt', text: 'two cats' } });
  for (let phase = 1; phase <= 6; phase += 1) {
    const key = `phase${phase}`;
    spec.phaseArtifacts[key] = await contracts.bindPhaseOutput(spec.phaseArtifacts[key], { previous, invocation: {} }, expected);
    previous = spec.phaseArtifacts[key];
  }
  const call = { previous: spec.phaseArtifacts.phase5, invocation: {} };
  const received = structuredClone(spec);
  const accepted = received.phaseArtifacts.phase6;
  const normalized = model.normalizeSpec(received);
  assert.deepEqual(normalized.phaseArtifacts, spec.phaseArtifacts);
  assert.deepEqual(normalized.phaseArtifacts.phase6, accepted);
  await contracts.validateBoundOutput(normalized.phaseArtifacts.phase6, call, expected);
  assert.equal(normalized.contentHash, spec.contentHash);
  assert.deepEqual(normalized.renderProgram, spec.renderProgram);
  assert.deepEqual(normalized.compositionGraph, spec.compositionGraph);
});

test('WorldSpec normalization refuses contradictory accepted visual artifacts instead of recompiling them', () => {
  const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
  const spec = model.createSpecFromPrompt('two cats', { deterministicRuntime: true });
  const contradictory = structuredClone(spec);
  contradictory.renderProgram = structuredClone(contradictory.renderProgram);
  contradictory.renderProgram.sceneRenderPacket.entities.pop();
  assert.throws(() => model.normalizeSpec(contradictory), /visual program.*Phase 6/);
});

test('synchronous compatibility assembly consumes the same Phase 4 and Phase 5 outputs as forward execution', () => {
  const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
  const options = { deterministicRuntime: true };
  const prompt = 'two cats';
  const compiled = model.createSpecFromPrompt(prompt, options);
  const phase1 = model.runPhase1RuntimeGate(prompt, options);
  const phase2 = model.runPhase2LanguageGraph(phase1);
  const phase3 = model.retrieveIntentCandidates(phase2, model.runtimeContextFromOptions(options), options).phase3Output;
  const phase4 = model.runPhase4GroundedIntent(phase3);
  const phase5 = model.runPhase5SimulationCompile(phase4);
  assert.deepEqual(compiled.phaseArtifacts.phase4, phase4);
  assert.deepEqual(compiled.phaseArtifacts.phase5, phase5);
  assert.deepEqual(compiled.universeGraph, phase4.artifact.groundedIntent.acceptedGraph);
});

test('compiled water state channels retain their entity owner through serializable phase artifacts', () => {
  const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
  const spec = model.createSpecFromPrompt('water flows through a pipe', { deterministicRuntime: true });
  assert.ok(spec.physicsIR.stateFields.length > 0);
  const domains = new Map(spec.physicsIR.domains.map(domain => [domain.id, domain]));
  for (const field of spec.physicsIR.stateFields) {
    assert.equal(field.entityId, domains.get(field.domainId).entityId);
    assert.equal(spec.solverGraph.channelMetadata[field.id].entityId, field.entityId);
  }
  for (const output of Object.values(spec.phaseArtifacts)) contracts.immutableArtifact(output);
});

test('invocation acquisition obeys cancellation and the phase deadline', async () => {
  const entered = deferred(), finish = deferred();
  const rows = phases(); let executed = 0;
  rows[0].run = () => { executed += 1; return output(1); };
  let suppliedSignal;
  const instance = runner.create({ phases: rows, policy, producer });
  const pending = instance.run(request, { invocationForPhase: async (_phase, _previous, signal) => {
    suppliedSignal = signal; entered.resolve(); await finish.promise; return {};
  } });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await entered.promise;
  instance.cancel();
  await rejected;
  assert.equal(suppliedSignal.aborted, true);
  finish.resolve(); await new Promise(setImmediate);
  assert.equal(executed, 0);
  const timed = runner.create({ phases: rows, policy: { ...policy, phases: policy.phases.map(p => ({ ...p, maxDurationMs: 30 })) }, producer });
  await assert.rejects(timed.run(request, { invocationForPhase: () => new Promise(() => {}) }), /deadline/);
  assert.equal(executed, 0);
});

test('resource selection and immutable assets cannot change while a run waits', async () => {
  const entered = deferred(), finish = deferred();
  const rows = phases(); rows[0].resourceIds = ['asset']; rows[1].resourceIds = ['asset'];
  const asset = { value: 'original' };
  const resources = { asset: { descriptor: { id: 'asset', kind: 'artifact', contentDigest: await contracts.artifactDigest(asset), capabilities: ['test'], residentBytes: 10 }, handle: asset,
    acquire: async () => () => { released += 1; } } };
  let released = 0;
  rows[0].run = (call, handles) => { assert.deepEqual(handles.asset, { value: 'original' }); return output(1); };
  rows[1].run = (call, handles) => { assert.deepEqual(handles.asset, { value: 'original' }); return output(2); };
  const instance = runner.create({ phases: rows, policy, producer });
  const pending = instance.run(request, { resources, invocationForPhase: async phase => {
    if (phase === 1) { entered.resolve(); await finish.promise; }
    return invocationForPhase(phase);
  } });
  await entered.promise;
  asset.value = 'mutated';
  resources.asset = { ...resources.asset, handle: { value: 'replacement' }, acquire() { throw new Error('replacement must not execute'); } };
  finish.resolve();
  await pending;
  assert.equal(released, 2);
  await assert.rejects(instance.run(request, { resources, invocationForPhase }), /Artifact content identity mismatch/);
});

test('integrity rejects array metadata and non-enumerable artifact fields', () => {
  const array = [1]; array.extra = 'silently lost';
  const hidden = {}; Object.defineProperty(hidden, 'secret', { value: 1 });
  assert.throws(() => contracts.canonicalJson(array), /extra field/);
  assert.throws(() => contracts.canonicalJson(hidden), /hidden/);
});

test('binding snapshots receipts and metadata and detects tampering outside artifact payloads', async () => {
  const value = output(1);
  value.receipts[0].ready = true;
  const call = { previous: contracts.createRequestEnvelope(request), invocation: {} };
  const expected = { producer, dependencies: [], revision: 1 };
  const pending = contracts.bindPhaseOutput(value, call, expected);
  value.receipts[0].ready = false;
  value.runtimeReceiptId = 'changed-during-hash';
  const bound = await pending;
  assert.equal(bound.runtimeReceiptId, 'test-runtime');
  assert.equal(bound.receipts[0].ready, true);
  for (const mutate of [out => {out.receipts[0].ready = false;}, out => {out.runtimeReceiptId = 'forged-runtime';}]) {
    const forged = structuredClone(bound); mutate(forged);
    await assert.rejects(contracts.validateBoundOutput(forged, call, expected), /envelopeDigest mismatch/);
  }
  const legacy = structuredClone(bound);
  legacy.binding.schema = 'simulatte.phaseBinding.v1'; delete legacy.binding.envelopeDigest;
  assert.doesNotThrow(() => contracts.legacyPhaseProjection(legacy));
  await assert.rejects(contracts.validateBoundOutput(legacy, call, expected), /explicit rebind/);
});
