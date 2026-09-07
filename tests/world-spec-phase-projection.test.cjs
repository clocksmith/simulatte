const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
const contracts = require('../public/blank/pipeline/simulatte-phase-contracts.js');
const runner = require('../public/blank/app/runtime/phase-runner.js');

test('part candidates preserve optional quantities without publishing undefined fields', () => {
  const spec = model.createSpecFromPrompt('robot with red eyes and bendable straw arms', {
    deterministicRuntime: true,
  });
  const candidate = spec.phaseArtifacts.phase3.artifact.retrievalRerankResult.worldSpecCandidate;
  const robot = candidate.intent.universeGraph.nodes.find(row => row.semanticClass === 'robot');
  assert.ok(robot.partGraph.length >= 2);
  for (const part of robot.partGraph) {
    assert.ok(!Object.hasOwn(part, 'cardinality') || Number.isFinite(part.cardinality));
  }
  for (const phase of Object.values(spec.phaseArtifacts)) contracts.immutableArtifact(phase);
  const rendered = spec.renderProgram.sceneRenderPacket.entities.find(row => row.identity.type === 'robot');
  const eyes = rendered.geometry.program.parts.filter(row => row.id.includes('eye'));
  assert.equal(eyes.length, 2);
  assert.ok(eyes.every(row => row.fill === '#ef3340'));
});

test('explicit local intent resolution applies new parameter overrides without mutating the accepted intent', () => {
  const intent = model.createIntentFromPrompt('two cats', { deterministicRuntime: true, params: { gravity: 0.1 } });
  const before = contracts.canonicalJson(intent);
  const resolved = model.resolveIntentToSpec(intent, { deterministicRuntime: true, params: { gravity: 0.2 } });
  assert.equal(resolved.params.gravity, 0.2);
  assert.equal(resolved.phaseArtifacts.phase4.artifact.groundedIntent.worldSpecInput.params.gravity, 0.2);
  assert.equal(model.projectWorldSpec(resolved.phaseArtifacts).params.gravity, 0.2);
  assert.equal(contracts.canonicalJson(intent), before);
});

test('WorldSpec projection preserves blank and composed authoring fields, accepted physics and visuals', () => {
  for (const prompt of ['', 'two cats', 'water flows through a pipe']) {
    const spec = model.createSpecFromPrompt(prompt, { deterministicRuntime: true, params: { gravity: 0.2 } });
    const before = contracts.canonicalJson(spec.phaseArtifacts);
    const projected = model.projectWorldSpec(contracts.immutableArtifact(spec.phaseArtifacts));
    assert.equal(projected.contentHash, spec.contentHash);
    for (const field of ['objects', 'params', 'controls', 'modules', 'contract', 'source', 'authorship',
      'physicalSpec', 'physicsIR', 'solverGraph', 'renderIR', 'interactionIR', 'renderProgram', 'compositionGraph']) {
      assert.deepEqual(projected[field], spec[field], `${prompt || 'blank'}: ${field}`);
    }
    assert.equal(contracts.canonicalJson(spec.phaseArtifacts), before);
    assert.equal(projected.params.gravity, 0.2);
    assert.deepEqual(spec.phaseArtifacts.phase5.artifact.simulationCompile.controls, spec.controls);
    assert.deepEqual(spec.phaseArtifacts.phase5.artifact.simulationCompile.visualSource.params, spec.params);
    for (const [id, , min, max] of projected.controls) {
      assert.ok(Object.hasOwn(projected.params, id), `${id}: control has no authored value`);
      assert.ok(Number.isFinite(projected.params[id]) && projected.params[id] >= min && projected.params[id] <= max);
    }
  }
});

test('actual runner outputs project a WorldSpec without changing accepted bindings', async () => {
  const options = { deterministicRuntime: true };
  const contentDigest = await contracts.artifactDigest(options);
  const producer = { id: 'projection-test', buildDigest: contentDigest };
  const policy = { schema: 'simulatte.phaseRunPolicy.v1', id: 'projection-component-test',
    maxInputBytes: 10000, maxEvidenceBytes: 20000000,
    phases: Array.from({ length: 8 }, (_, i) => ({ phase: i + 1, maxDurationMs: 30000,
      maxArtifactBytes: 5000000, maxResidentBytes: 1000 })) };
  const published = {};
  let spec;
  const instance = runner.create({ phases: runner.localPhaseAdapters(model), policy, producer,
    onPublish(output) {
      published[`phase${output.phase}`] = output;
      if (output.phase === 6) spec = model.projectWorldSpec(published);
    },
  });
  const outputs = await instance.run({ request: { kind: 'prompt', text: 'two cats' },
    configuration: options, authoredInputs: [], retryPolicy: null }, {
    invocationForPhase: phase => phase === 7 ? { simulationSnapshot: { time: 0 },
      frame: { index: 0, simulationTime: 0 }, viewport: { width: 390, height: 844 } } : {},
    resources: {
      'compiler-options': { descriptor: { id: 'compiler-options', kind: 'artifact', contentDigest,
        capabilities: ['local-compile'], residentBytes: 100 }, handle: options },
      renderer: { descriptor: { id: 'renderer', contentDigest, capabilities: ['diagnostic-only'], residentBytes: 100 },
        handle: { renderPhase: (previous, invocation) => model.runPhase7RenderExecution(previous, invocation.simulationSnapshot, null, {}) } },
    },
  });
  const compatible = model.createSpecFromPrompt('two cats', options);
  assert.equal(spec.contentHash, compatible.contentHash);
  assert.deepEqual(spec.renderProgram, compatible.renderProgram);
  assert.deepEqual(Object.keys(spec.phaseArtifacts), ['phase1', 'phase2', 'phase3', 'phase4', 'phase5', 'phase6']);
  for (let index = 0; index < 6; index += 1) assert.deepEqual(spec.phaseArtifacts[`phase${index + 1}`], outputs[index]);
  assert.notEqual(outputs[7].artifact.sceneProof.verdict, 'pass', 'diagnostic render cannot prove browser pixels');
  const mismatched = structuredClone(spec.phaseArtifacts);
  mismatched.phase5.binding.revision += 1;
  assert.throws(() => model.projectWorldSpec(mismatched), /another request or revision/);
});

test('WorldSpec projection rejects mixed requests and incomplete or contradictory authoring inputs', () => {
  const spec = model.createSpecFromPrompt('two cats', { deterministicRuntime: true });
  const other = model.createSpecFromPrompt('three cats', { deterministicRuntime: true });
  for (let phase = 1; phase <= 6; phase += 1) {
    assert.throws(() => model.projectWorldSpec({ ...spec.phaseArtifacts,
      [`phase${phase}`]: other.phaseArtifacts[`phase${phase}`] }), /another request or revision/);
  }
  for (const [mutate, pattern] of [
    [input => { delete input.objects; }, /declared authoring fields/],
    [input => { input.objects.push({ ...input.objects[0] }); }, /distinct typed identities/],
    [input => { input.params.damping = Infinity; }, /finite numbers/],
    [input => { input.params.damping = 20; }, /violates its control/],
    [input => { input.templateId = 'unadmitted-template'; }, /not admitted/],
  ]) {
    const phases = structuredClone(spec.phaseArtifacts);
    mutate(phases.phase4.artifact.groundedIntent.worldSpecInput);
    assert.throws(() => model.projectWorldSpec(phases), pattern);
  }
  const channels = structuredClone(spec.phaseArtifacts);
  channels.phase5.artifact.simulationCompile.stateChannels.push('unbound-channel');
  assert.throws(() => model.projectWorldSpec(channels), /state channels contradict/);
});
