const assert = require('node:assert/strict');
const test = require('node:test');

const lab = require('../public/app/lab/simulatte-physics-lab.js');
const compositionGraph = require('../public/pipeline/phase-07-visual/simulatte-composition-graph.js');
const solverRegistry = require('../public/pipeline/phase-06-simulation/simulatte-solver-registry.js');
const advectionSolver = require('../public/pipeline/phase-06-simulation/solvers/simulatte-solver-advection.js');
const webgpuRenderer = require('../public/pipeline/phase-08-render/simulatte-webgpu-renderer.js');

test('prompt compiles through parse, universe graph, PhysicsIR, solver graph, and render IR', () => {
  const spec = lab.createSpecFromPrompt('lava spins a turbine near an ice castle wall');

  assert.equal(spec.promptParse.schema, 'simulatte.promptParse.v1');
  assert.equal(spec.universeGraph.schema, 'simulatte.universeGraph.v1');
  assert.equal(spec.physicsIR.schema, 'simulatte.physicalIR.v1');
  assert.equal(spec.validationReceipt.schema, 'simulatte.validationReceipt.v1');
  assert.equal(spec.solverGraph.schema, 'simulatte.solverGraph.v1');
  assert.equal(spec.renderIR.schema, 'simulatte.renderIR.v1');

  assert.ok(spec.universeGraph.nodes.some((node) => node.canonicalId === 'material.lava'));
  assert.ok(spec.universeGraph.nodes.some((node) => /turbine/.test(node.canonicalId)));
  assert.ok(spec.universeGraph.nodes.some((node) => node.canonicalId === 'material.ice'));
  assert.ok(spec.universeGraph.nodes.some((node) => node.canonicalId === 'structure.castle_wall'));
  assert.ok(spec.physicsIR.operators.some((operator) => operator.type === 'rotational_torque'));
  assert.ok(spec.physicsIR.operators.some((operator) => operator.type === 'heat_transfer'));
  assert.ok(spec.physicsIR.operators.some((operator) => operator.type === 'phase_transition'));
  assert.ok(spec.solverGraph.steps.some((step) => step.operatorType === 'rotational_torque'));
  assert.ok(spec.renderIR.objects.some((object) => object.glyph === 'turbine'));
  assert.ok(spec.renderIR.objects.some((object) => object.stateBindings.rotationRate));
  assert.equal(spec.renderProgram.provenance.compiler, 'simulatte.render-ir-to-render-program.v1');
  assert.equal(spec.renderIR.sceneHint, 'literal-composite');
  assert.equal(spec.renderProgram.rendererPlan.sceneKind, 'thermal-plume');
  assert.equal(spec.renderProgram.visualIR.sceneKind, spec.renderProgram.rendererPlan.sceneKind);
  assert.equal(spec.phaseArtifacts.phase1.schema, 'simulatte.phase1.output.v1');
  assert.equal(spec.phaseArtifacts.phase2.artifact.languageGraph.sourceText, 'lava spins a turbine near an ice castle wall');
  assert.equal(spec.phaseArtifacts.phase3.artifact.retrievalRerankResult.query, spec.phaseArtifacts.phase2.artifact.languageGraph.sourceText);
  assert.equal(spec.phaseArtifacts.phase6.schema, 'simulatte.phase6.output.v1');
  assert.equal(spec.phaseArtifacts.phase6.artifact.simulationCompile.renderIR.schema, 'simulatte.renderIR.v1');
  assert.equal(spec.phaseArtifacts.phase7.inputSchema, 'simulatte.phase6.output.v1');
  assert.equal(spec.phaseArtifacts.phase7.artifact.visualCompile.schema, 'simulatte.visualCompile.v1');
  const scenePacket = spec.renderProgram.visualIR.sceneRenderPacket;
  assert.equal(scenePacket.schema, 'simulatte.sceneRenderPacket.v1');
  assert.equal(spec.renderProgram.sceneRenderPacket, scenePacket);
  assert.equal(scenePacket.coordinateSystem.origin, 'top-left');
  assert.ok(scenePacket.entities.length >= 1);
  assert.ok(scenePacket.entities.every((entity) => Array.isArray(entity.transform.position)));
  assert.ok(scenePacket.entities.every((entity) => Array.isArray(entity.transform.scale)));
  assert.ok(scenePacket.entities.every((entity) => entity.geometry && entity.material && entity.animation && entity.collider));
  assert.equal(scenePacket.uniforms.schema, 'simulatte.sceneRenderPacketUniforms.v1');
  assert.equal(scenePacket.uniforms.source, 'sceneRenderPacket.renderCodes');
  assert.equal(scenePacket.uniforms.sceneId, 0);
  assert.equal(scenePacket.uniforms.sceneMix.length, 16);
  assert.equal(scenePacket.uniforms.visualLayers.length, 24);
  assert.equal(scenePacket.uniforms.atomUniforms.length, 24);
  assert.ok(scenePacket.entities.every((entity) => entity.renderCodes && entity.renderCodes.schema === 'simulatte.sceneRenderCodes.v1'));
  assert.ok(scenePacket.entities.every((entity) => Number(entity.renderCodes.layerCode) > 0));
  assert.ok(scenePacket.entities.every((entity) => Number(entity.renderPriority) > 0));
  assert.ok(scenePacket.passes.includes('entities'));
  assert.equal(spec.physicalSpec.executableSolverGraph.schema, 'simulatte.solverGraph.v1');
  assert.ok(spec.physicalSpec.stateChannels.some((channel) => channel.startsWith('angularVelocity:')));
});

test('particle instrument VisualIR preserves causal affordance rows', () => {
  const spec = lab.createSpecFromPrompt(
    'particle collider muon tracks collision plume through a detector slice with field lines and calorimeter heat'
  );
  const visualIR = spec.renderProgram.visualIR;
  const causalReceipt = visualIR.receipts.find((row) => row.id === 'receipt:causal-affordances');

  assert.equal(spec.renderProgram.rendererPlan.sceneKind, 'particle-instrument');
  assert.ok(spec.renderIR.causalAffordances.length > 0);
  assert.ok(visualIR.causalAffordances.length > 0);
  assert.ok(causalReceipt.count > 0);
  assert.ok(visualIR.geometry.some((row) => (row.evidence || []).some((item) => item.startsWith('causal-affordance:'))));
  assert.ok(visualIR.sceneRenderPacket.effects.some((row) => row.layerSlot === 'causal-affordance'));
});

test('phase envelopes enforce neighboring compiler handoffs', () => {
  const spec = lab.createSpecFromPrompt('graph nodes route water sensors through a pump controller', {
    allowPrototypeFallback: true,
  });
  const phases = spec.phaseArtifacts;

  for (let phase = 1; phase <= 7; phase += 1) {
    const output = phases[`phase${phase}`];
    assert.equal(output.schema, `simulatte.phase${phase}.output.v1`);
    assert.equal(output.phase, phase);
    assert.equal(output.inputSchema, phase === 1 ? 'simulatte.phase0.input.v1' : `simulatte.phase${phase - 1}.output.v1`);
    assert.equal(typeof output.runtimeReceiptId, 'string');
    assert.ok(output.artifact && typeof output.artifact === 'object');
    assert.ok(Array.isArray(output.receipts));
  }

  assert.equal(phases.phase2.artifact.languageGraph.sourceText, 'graph nodes route water sensors through a pump controller');
  assert.equal(phases.phase3.artifact.retrievalRerankResult.query, phases.phase2.artifact.languageGraph.sourceText);
  assert.ok(!('rankedPrimitives' in phases.phase5.artifact.groundedIntent));
  assert.equal(phases.phase6.artifact.simulationCompile.physicsIR.schema, 'simulatte.physicalIR.v1');
  assert.equal(phases.phase7.artifact.visualCompile.sceneRenderPacket.schema, 'simulatte.sceneRenderPacket.v1');

  const renderExecutionInput = lab.createRenderExecutionInput(spec, { t: 0 }, {});
  assert.equal(renderExecutionInput.schema, 'simulatte.renderExecutionInput.v1');
  assert.equal(renderExecutionInput.inputSchema, 'simulatte.phase7.output.v1');
  assert.equal(renderExecutionInput.sceneRenderPacket, phases.phase7.artifact.visualCompile.sceneRenderPacket);
  assert.equal('prompt' in renderExecutionInput, false);
  assert.equal('intent' in renderExecutionInput, false);
  assert.equal('renderIR' in renderExecutionInput, false);
  assert.equal('visualIR' in renderExecutionInput, false);
  assert.equal('retrievalRerankResult' in renderExecutionInput, false);

  assert.equal(lab.validatePhase1RuntimeReady(phases.phase1), phases.phase1);
  assert.equal(lab.validatePhase7VisualCompile(phases.phase7), phases.phase7);
  assert.throws(
    () => lab.validatePhase2LanguageGraph({ ...phases.phase2, inputSchema: 'simulatte.phase0.input.v1' }),
    /Phase 2 validator expected inputSchema simulatte\.phase1\.output\.v1/
  );
  assert.throws(
    () => lab.validatePhase7VisualCompile({ ...phases.phase7, artifact: {} }),
    /Phase 7 validator missing artifact\.visualCompile/
  );
  assert.throws(
    () => lab.validatePhase4ActivationCloud({
      ...phases.phase4,
      artifact: {
        ...phases.phase4.artifact,
        visualIR: { schema: 'simulatte.visualIR.v1' },
      },
    }),
    /Phase 4 validator unexpected artifact\.visualIR/
  );
  assert.throws(
    () => lab.validatePhase3RetrievalRerank({
      ...phases.phase3,
      receipts: [],
    }),
    /Phase 3 validator missing receipt phase3-retrieval-rerank/
  );
  assert.throws(
    () => lab.validatePhase3RetrievalRerank(phases.phase2),
    /Phase 3 validator expected simulatte\.phase3\.output\.v1/
  );
  assert.throws(
    () => lab.runPhase4ActivationCloud(phases.phase2),
    /Phase 4 input expected simulatte\.phase3\.output\.v1/
  );
  assert.throws(
    () => lab.createRenderExecutionInput({
      schema: 'simulatte.visualCompile.v1',
      visualCompile: phases.phase7.artifact.visualCompile,
    }),
    /renderExecutionInput source expected simulatte\.phase7\.output\.v1/
  );
  const sideChannelPhase5 = lab.runPhase5GroundedIntent(
    lab.createPhaseEnvelope({
      phase: 4,
      inputSchema: 'simulatte.phase3.output.v1',
      runtimeReceiptId: phases.phase4.runtimeReceiptId,
      artifact: {
        languageGraph: phases.phase4.artifact.languageGraph,
        retrievalRerankResult: phases.phase4.artifact.retrievalRerankResult,
        activationCloud: { schema: 'simulatte.activationCloud.v1', groundingEvidence: null, weightedActivations: [] },
      },
      receipts: [{ id: 'phase4-activation-cloud', schema: 'simulatte.phaseReceipt.v1' }],
    }),
    {},
    { acceptedGraph: { nodes: [{ id: 'side-channel' }] } }
  );
  assert.equal(sideChannelPhase5.artifact.groundedIntent.acceptedGraph, null);

  const phase8 = lab.runPhase8RenderExecution(renderExecutionInput, null, null, {
    rendered: true,
    renderCount: 1,
    frameMs: 1.25,
  });
  assert.equal(phase8.schema, 'simulatte.phase8.output.v1');
  assert.equal(phase8.inputSchema, 'simulatte.phase7.output.v1');
  assert.equal(phase8.artifact.renderExecution.renderExecutionInputSchema, 'simulatte.renderExecutionInput.v1');
  assert.equal(phase8.artifact.renderExecution.sceneRenderPacketSchema, 'simulatte.sceneRenderPacket.v1');
  assert.equal(phase8.receipts[0].id, 'phase8-webgpu-render');
  assert.equal(lab.validatePhase8RenderExecution(phase8), phase8);
  assert.throws(
    () => lab.runPhase8RenderExecution({ ...renderExecutionInput, inputSchema: 'simulatte.phase6.output.v1' }),
    /Phase 8 input expected simulatte\.phase7\.output\.v1/
  );
  assert.throws(
    () => lab.runPhase8RenderExecution({ ...renderExecutionInput, sceneRenderPacket: null }),
    /Phase 8 input expected sceneRenderPacket simulatte\.sceneRenderPacket\.v1/
  );
});

test('solver graph evolves typed finite channels for coupled lava turbine ice prompt', () => {
  const spec = lab.createSpecFromPrompt('lava spins a turbine near an ice castle wall');
  let state = lab.createSimulationState(spec);
  const angularKey = Object.keys(state.solverState.channels).find((key) => key.startsWith('angularVelocity:'));
  const iceKey = Object.keys(state.solverState.channels).find((key) => key.startsWith('liquidFraction:material-ice'));
  assert.ok(angularKey);
  assert.ok(iceKey);
  const startAngular = Number(state.solverState.channels[angularKey]);
  const startIce = Number(state.solverState.channels[iceKey]);

  for (let step = 0; step < 24; step += 1) {
    state = lab.stepSimulation(state, spec, 0.016);
  }

  assert.ok(Number.isFinite(state.solverState.channels[angularKey]));
  assert.ok(Number.isFinite(state.solverState.channels[iceKey]));
  assert.ok(state.solverState.channels[angularKey] > startAngular);
  assert.ok(state.solverState.channels[iceKey] >= startIce);
  assert.ok(state.solverState.summary.motion > 0);
});

test('unsupported and unresolved concepts are preserved in validation receipt', () => {
  const spec = lab.createSpecFromPrompt('magnetic castle soul trades entropy with a river');

  assert.equal(spec.validationReceipt.schema, 'simulatte.validationReceipt.v1');
  assert.ok(spec.validationReceipt.unresolved.some((row) => /soul/.test(row.promptSpan)));
  assert.ok(
    spec.validationReceipt.unsupported.length > 0 ||
    spec.validationReceipt.approximate.length > 0 ||
    spec.validationReceipt.unresolved.length > 0
  );
});

test('legacy custom specs migrate to compiler artifacts during normalization', () => {
  const legacy = {
    schema: 'simulatte.simulationSpec.v1',
    templateId: 'custom-world',
    name: 'Legacy Lava Turbine',
    description: 'legacy export without compiler artifacts',
    modules: ['fluid', 'thermal'],
    objects: [
      { id: 'lava', type: 'fluid', role: 'lava', domains: ['fluid', 'thermal'], material: 'lava' },
      { id: 'turbine', type: 'machine', role: 'turbine', domains: ['rigidBody', 'rotationalMechanics'], material: 'metal' },
    ],
    controls: [],
    params: { flowRate: 0.7, heatTransfer: 0.6 },
    intent: lab.createIntentFromPrompt('lava spins turbine'),
  };
  const spec = lab.normalizeSpec(legacy);

  assert.equal(spec.physicsIR.schema, 'simulatte.physicalIR.v1');
  assert.equal(spec.solverGraph.schema, 'simulatte.solverGraph.v1');
  assert.equal(spec.renderProgram.provenance.compiler, 'simulatte.render-ir-to-render-program.v1');
  assert.equal(spec.renderProgram.provenance.renderIR, 'simulatte.renderIR.v1');
  assert.equal(spec.renderProgram.provenance.solverGraph, 'simulatte.solverGraph.v1');
});

test('generic RenderIR scene fallback uses prompt evidence for visual routing', () => {
  const cases = [
    ['forest fire with flame smoke and wind through pine fuel', 'fire', 'thermal'],
    ['lab bench optics with glass lens mirror prism and laser sensor', 'optics', 'optical-rays'],
    ['city market queue traffic network with sensor delays', 'city', 'network-flow'],
    ['rain erodes a mountain watershed into sediment channels', 'watershed', 'gravity'],
  ];

  for (const [prompt, sceneKind, fieldKind] of cases) {
    const program = compositionGraph.compileCompositionToRenderProgram({
      schema: compositionGraph.COMPOSITION_SCHEMA,
      graphId: `generic-${sceneKind}`,
      intentText: '',
      nodes: [],
      relations: [],
      operators: [],
    }, {
      id: `generic-${sceneKind}`,
      params: {},
      renderIR: {
        schema: 'simulatte.renderIR.v1',
        sceneHint: 'generic',
        prompt,
        objects: [],
        fields: [],
      },
      solverGraph: {
        schema: 'simulatte.solverGraph.v1',
        steps: [],
        channels: {},
      },
      physicsIR: { schema: 'simulatte.physicalIR.v1', prompt },
    });

    assert.equal(program.rendererPlan.sceneKind, sceneKind);
    assert.equal(program.visualIR.sceneKind, sceneKind);
    assert.ok(program.fields.some((field) => field.kind === fieldKind));
  }
});

test('WebGPU phase 8 layer summary follows compiled VisualIR structures', () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { gpu: {} },
    configurable: true,
  });
  try {
    const cases = [
      {
        prompt: 'dogs and cats swimming in water',
        expected: ['biological-agent', 'water-volume'],
        rejected: ['detector-geometry', 'node-graph', 'readout-panel', 'track-line', 'organic-matrix'],
        sceneMixExpected: ['water', 'biological'],
        sceneMixRejected: ['network', 'optical', 'instrument'],
      },
      {
        prompt: 'particle collider detector with muon tracks and calorimeter readouts',
        expected: ['detector-geometry', 'track-line', 'readout-panel'],
        rejected: ['water-volume', 'node-graph', 'organic-matrix'],
        sceneMixExpected: ['instrument'],
        sceneMixRejected: ['biological', 'network'],
      },
      {
        prompt: 'graph of nodes edges and flows through a queue network',
        expected: ['node-graph', 'network-flow'],
        rejected: ['detector-geometry', 'water-volume', 'track-line', 'particle-swarm'],
        sceneMixExpected: ['network'],
        sceneMixRejected: ['biological', 'instrument'],
      },
      {
        prompt: 'sourdough fermentation with gluten matrix and gas bubbles',
        expected: ['organic-matrix', 'bubble-volume', 'causal-affordance', 'chemical-front'],
        rejected: ['detector-geometry', 'node-graph', 'robot-armature'],
        sceneMixExpected: ['biological', 'chemical', 'water'],
        sceneMixRejected: ['network', 'instrument'],
      },
    ];

    for (const { prompt, expected, rejected, sceneMixExpected, sceneMixRejected } of cases) {
      const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
      const packet = spec.renderProgram.visualIR.sceneRenderPacket;
      assert.equal(packet.schema, 'simulatte.sceneRenderPacket.v1', `${prompt} should compile a scene render packet`);
      assert.ok(packet.entities.length > 0, `${prompt} should compile packet entities`);
      assert.ok(packet.entities.every((entity) => Array.isArray(entity.transform.position)), `${prompt} packet entities need positions`);
      assert.ok(packet.entities.every((entity) => Array.isArray(entity.transform.scale)), `${prompt} packet entities need scale`);
      assert.ok(packet.entities.every((entity) => entity.identity && entity.identity.type && entity.identity.category), `${prompt} packet entities need semantic identities`);
      const packetLayers = new Set([
        ...packet.entities.map((row) => row.layerSlot),
        ...packet.fields.map((row) => row.layerSlot),
        ...packet.effects.map((row) => row.layerSlot),
      ]);
      for (const token of expected) assert.ok(packetLayers.has(token), `${prompt} packet should include ${token}`);
      const canvas = {
        dataset: {},
        getContext() {
          return {};
        },
      };
      const renderer = webgpuRenderer.create(canvas);
      assert.ok(renderer, `expected fake WebGPU renderer for ${prompt}`);
      assert.throws(
        () => renderer.setRenderExecutionInput(packet),
        /Phase 8 expected simulatte\.renderExecutionInput\.v1, received bare simulatte\.sceneRenderPacket\.v1/
      );
      assert.throws(
        () => renderer.setRenderExecutionInput({
          ...lab.createRenderExecutionInput(spec, null, canvas),
          inputSchema: 'simulatte.phase6.output.v1',
        }),
        /Phase 8 expected inputSchema simulatte\.phase7\.output\.v1/
      );
      renderer.setRenderExecutionInput(lab.createRenderExecutionInput(spec, null, canvas));
      assert.equal(canvas.dataset.phase8Input, 'simulatte.sceneRenderPacket.v1');
      assert.equal(canvas.dataset.renderExecutionInput, 'simulatte.renderExecutionInput.v1');
      assert.match(canvas.dataset.sceneRenderPacket || '', /simulatte\.sceneRenderPacket\.v1/);
      assert.ok(Number(canvas.dataset.sceneRenderEntityCount) > 0, `${prompt} should report packet entity count`);
      assert.match(canvas.dataset.sceneRenderSpatialHash || '', /^[0-9a-f]{8}$/);
      assert.match(canvas.dataset.sceneObjectUniforms || '', /@/, `${prompt} should pack scene object uniforms`);
      assert.match(canvas.dataset.sceneObjectIdentities || '', /@/, `${prompt} should report packed scene object identities`);
      const summary = canvas.dataset.visualIrLayers || '';
      for (const token of expected) assert.match(summary, new RegExp(`${token}:`), `${prompt} should include ${token}`);
      for (const token of rejected) assert.doesNotMatch(summary, new RegExp(`${token}:`), `${prompt} should not include ${token}`);
      const sceneMix = canvas.dataset.sceneMix || '';
      for (const token of sceneMixExpected || []) assert.match(sceneMix, new RegExp(`${token}:`), `${prompt} scene mix should include ${token}`);
      for (const token of sceneMixRejected || []) assert.doesNotMatch(sceneMix, new RegExp(`${token}:`), `${prompt} scene mix should not include ${token}`);
      if (/graph|queue|network/.test(prompt)) {
        const networkEntities = packet.entities.filter((entity) => (
          entity.layerSlot === 'node-graph' || entity.layerSlot === 'network-flow'
        ));
        assert.ok(networkEntities.length > 0, `${prompt} should compile network entities`);
        assert.ok(
          networkEntities.every((entity) => entity.identity.category === 'network'),
          `${prompt} network packet entities should keep network identity`
        );
        assert.ok(
          networkEntities.every((entity) => entity.identity.type !== 'water'),
          `${prompt} network packet entities should not be typed as water`
        );
        assert.ok(
          networkEntities.every((entity) => entity.material.kind !== 'fluid' && entity.material.id !== 'water'),
          `${prompt} network packet entities should not use water/fluid materials`
        );
      }
    }
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
  }
});

test('solver registry delegates executable operator steps to solver modules', () => {
  const registry = solverRegistry.createSolverRegistry();
  const operator = registry.operatorFor('advection');

  assert.equal(typeof advectionSolver.step, 'function');
  assert.equal(operator.step, advectionSolver.step);
});
