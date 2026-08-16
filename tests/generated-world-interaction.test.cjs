const assert = require('node:assert/strict');
const test = require('node:test');

const lab = require('../public/blank/pipeline/phase-05-simulation/simulatte-physics-model.js');
require('../public/blank/pipeline/phase-07-render/simulatte-webgpu-renderer.js');
const registry = require('../public/blank/app/runtime/phase-module-registry.js');
const interactionRuntime = require('../public/blank/app/runtime/world-interaction-runtime.js');
const sceneProof = require('../public/blank/pipeline/phase-08-scene-proof/simulatte-scene-proof.js');
const worldProof = require('../public/shared/contracts/world-proof.js');

const renderer = registry.family('webGpuRenderer');
const PROMPT = 'a robot pushes a rolling metal wheel';

function compile() {
  return lab.createSpecFromPrompt(PROMPT, { allowPrototypeFallback: true });
}

function dynamicTarget(spec) {
  return spec.interactionIR.targets.find((row) => (
    row.capabilities.includes('drag') && row.capabilities.includes('impulse')
  ));
}

test('Phase 5 compiles device bindings, targets, and executable interaction kinematics', () => {
  const spec = compile();
  const phase5 = spec.phaseArtifacts.phase5.artifact.simulationCompile;
  const phase6 = spec.phaseArtifacts.phase6.artifact.visualCompile;

  assert.equal(spec.interactionIR.schema, 'simulatte.interactionIR.v1');
  assert.equal(phase5.interactionIR, spec.interactionIR);
  assert.ok(spec.interactionIR.targets.length >= 2);
  assert.ok(spec.interactionIR.bindings.some((row) => row.id === 'pointer-drag'));
  assert.ok(spec.interactionIR.bindings.some((row) => row.code === 'ArrowRight'));
  assert.ok(spec.interactionIR.bindings.some((row) => row.code === 'Space'));
  assert.ok(spec.solverGraph.steps.some((row) => (
    row.operatorType === 'interaction_kinematics' && row.stage === 'controls'
  )));
  assert.ok(spec.compositionGraph.operators.every((row) => row.id !== 'interaction_kinematics'));

  assert.equal(phase6.interactionProgram.schema, 'simulatte.sceneInteractionProgram.v1');
  assert.equal(phase6.interactionProgram.targetCount, spec.interactionIR.targets.length);
  for (const mapping of phase6.interactionProgram.mappings) {
    const entity = phase6.sceneRenderPacket.entities.find((row) => row.id === mapping.packetEntityId);
    assert.ok(entity);
    assert.equal(entity.collider.targetId, mapping.targetId);
    assert.deepEqual(entity.collider.capabilities, mapping.capabilities);
    assert.equal(entity.collider.selectable, true);
  }
});

test('pointer commands deterministically mutate solver channels before subsequent stepping', () => {
  const spec = compile();
  const target = dynamicTarget(spec);
  assert.ok(target);
  const commands = [
    { sequence: 3, actionId: 'drag', targetId: target.id, point: [0.76, 0.38], delta: [0.08, -0.04] },
    { sequence: 1, actionId: 'select', targetId: target.id, point: [0.68, 0.42] },
    { sequence: 2, actionId: 'grab', targetId: target.id, point: [0.68, 0.42] },
  ];
  const first = lab.applyInteractionCommands(lab.createSimulationState(spec), spec.interactionIR, commands);
  const second = lab.applyInteractionCommands(lab.createSimulationState(spec), spec.interactionIR, commands);

  assert.deepEqual(first.interaction, second.interaction);
  assert.deepEqual(first.solverState.channels, second.solverState.channels);
  assert.equal(first.interaction.appliedCommandCount, 3);
  assert.ok(first.interaction.modifiedChannels.length > 0);
  assert.ok(first.interaction.receipts.every((row) => row.status === 'applied'));
  assert.ok(first.interaction.receipts.every((row) => (
    row.beforeState.schema === lab.INTERACTION_TRANSITION_STATE_SCHEMA &&
    row.afterState.schema === lab.INTERACTION_TRANSITION_STATE_SCHEMA &&
    row.beforeStateHash !== row.afterStateHash
  )));

  const positionId = target.channels.position;
  const beforeStep = { ...first.solverState.channels[positionId] };
  const stepped = lab.stepSimulation(first, spec, 0.05);
  assert.notDeepEqual(stepped.solverState.channels[positionId], beforeStep);
  assert.ok(stepped.solverState.events.some((row) => row.type === 'interactionKinematics'));
});

test('InteractionIR and command replay survive spec serialization without state drift', () => {
  const spec = compile();
  const restored = lab.deserializeSpec(lab.serializeSpec(spec));
  const target = dynamicTarget(restored);
  const commands = [
    { sequence: 1, actionId: 'select', targetId: target.id, point: [0.44, 0.41] },
    { sequence: 2, actionId: 'impulse', targetId: target.id, delta: [0.25, -0.5] },
  ];
  const originalState = lab.applyInteractionCommands(
    lab.createSimulationState(spec),
    spec.interactionIR,
    commands
  );
  const restoredState = lab.applyInteractionCommands(
    lab.createSimulationState(restored),
    restored.interactionIR,
    commands
  );

  assert.deepEqual(restored.interactionIR, spec.interactionIR);
  assert.deepEqual(restoredState.interaction, originalState.interaction);
  assert.deepEqual(restoredState.solverState.channels, originalState.solverState.channels);
});

test('unsupported target actions reject without inventing state changes', () => {
  const spec = compile();
  const target = spec.interactionIR.targets[0];
  const state = lab.createSimulationState(spec);
  const next = lab.applyInteractionCommands(state, spec.interactionIR, [{
    sequence: 1,
    actionId: 'adjust',
    targetId: target.id,
    value: 1,
  }]);
  const receipt = next.interaction.receipts[0];
  if (target.capabilities.includes('adjust')) {
    assert.equal(receipt.status, 'applied');
    assert.ok(receipt.changedChannels.length > 0);
  } else {
    assert.equal(receipt.status, 'rejected');
    assert.equal(receipt.reason, 'target lacks adjust');
    assert.deepEqual(next.solverState.channels, state.solverState.channels);
  }
});

test('Phase 7 hit testing and GPU feedback consume the final Phase 6 collider mapping', () => {
  const spec = compile();
  const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
  const target = dynamicTarget(spec);
  const mapping = packet.interactionProgram.mappings.find((row) => row.targetId === target.id);
  const entity = packet.entities.find((row) => row.id === mapping.packetEntityId);
  const bounds = entity.collider.bounds;
  const point = [bounds[0] + bounds[2] * 0.5, bounds[1] + bounds[3] * 0.5];
  const hit = renderer.scenePacketHitTest(packet, point);
  assert.equal(hit.hit, true);
  assert.equal(hit.targetId, target.id);
  assert.equal(hit.pickId, entity.collider.pickId);

  let state = lab.createSimulationState(spec);
  state = lab.applyInteractionCommands(state, spec.interactionIR, [
    { sequence: 1, actionId: 'select', targetId: target.id, point },
    { sequence: 2, actionId: 'grab', targetId: target.id, point },
    { sequence: 3, actionId: 'drag', targetId: target.id, point: [0.74, 0.36], delta: [0.06, -0.04] },
  ]);
  const renderData = renderer.compileSceneRenderData(packet, packet.sceneKind, 'interaction-test');
  const applied = renderer.scenePacketInteractionPartData(
    renderData.objectPartData,
    renderData.objectParts,
    packet,
    state
  );
  const targetIndexes = renderData.objectParts
    .map((part, index) => part.entityId === entity.id ? index : -1)
    .filter((index) => index >= 0);
  assert.ok(targetIndexes.length > 0);
  assert.equal(applied.receipt.consumed, true);
  assert.equal(applied.receipt.movedPartCount, targetIndexes.length);
  for (const index of targetIndexes) {
    const offset = index * renderer.GPU_OBJECT_PART_FLOATS;
    assert.equal(applied.data[offset + 37], 1, 'selected lane');
    assert.equal(applied.data[offset + 39], 1, 'active lane');
    assert.notEqual(applied.data[offset], renderData.objectPartData[offset], 'moved x lane');
  }
});

test('browser adapter maps pointer and keyboard events into one monotonic command queue', () => {
  const spec = compile();
  const program = spec.phaseArtifacts.phase6.artifact.visualCompile.interactionProgram;
  const target = dynamicTarget(spec);
  const commands = [];
  const canvas = fakeCanvas();
  const runtime = interactionRuntime.connect(canvas, {
    renderer: {
      pick() {
        return {
          schema: 'simulatte.phase7HitTestReceipt.v1',
          hit: true,
          targetId: target.id,
          capabilities: target.capabilities.slice(),
        };
      },
    },
    getProgram: () => program,
    enqueueCommand: (command) => commands.push(command),
  });

  canvas.dispatch('pointerdown', pointerEvent(20, 20, 7));
  canvas.dispatch('pointermove', pointerEvent(32, 14, 7));
  canvas.dispatch('pointerup', pointerEvent(32, 14, 7));
  canvas.dispatch('keydown', keyEvent('ArrowRight'));
  canvas.dispatch('keydown', keyEvent('Space'));

  assert.deepEqual(commands.map((row) => row.actionId), [
    'select', 'grab', 'drag', 'release', 'nudge', 'impulse',
  ]);
  assert.deepEqual(commands.map((row) => row.sequence), [1, 2, 3, 4, 5, 6]);
  assert.ok(commands.every((row) => row.schema === 'simulatte.interactionCommand.v1'));
  assert.equal(canvas.dataset.interactionSelectedTarget, target.id);
  runtime.reset();
  assert.equal(canvas.dataset.interactionSequence, '0');
  assert.equal(canvas.dataset.interactionSelectedTarget, '');
  canvas.dispatch('pointerdown', pointerEvent(20, 20, 8));
  assert.deepEqual(commands.slice(-2).map((row) => row.sequence), [1, 2]);
  runtime.destroy();
  assert.equal(canvas.dataset.interactionRuntime, '');
});

test('Phase 8 distinguishes causal interaction proof from unexercised and dropped feedback', () => {
  const spec = compile();
  const target = dynamicTarget(spec);
  const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
  const binding = worldProof.createWorldProofBinding(spec, {
    buildId: 'interaction-test-build',
    runtimeId: 'interaction-test-runtime',
  });
  const state = lab.applyInteractionCommands(
    lab.createSimulationState(spec),
    spec.interactionIR,
    [
      { sequence: 1, actionId: 'select', targetId: target.id, point: [0.5, 0.5] },
      { sequence: 2, actionId: 'impulse', targetId: target.id, delta: [0.2, -0.4] },
    ]
  );
  const base = renderer.phase7InteractionReceipt(
    { simulationState: state },
    {
      interactionVisualReceipt: {
        schema: 'simulatte.phase7InteractionVisualReceipt.v1',
        consumed: true,
      },
    },
    packet
  );
  const passing = sceneProof.settleInteractionReceipt(base, binding);
  assert.equal(passing.status, 'pass');
  assert.equal(passing.interactionProgramHash, spec.interactionIR.contentHash);
  assert.equal(passing.provenTransitionCount, 2);
  assert.equal(sceneProof.settleInteractionReceipt({
    ...base,
    visualStateConsumed: false,
  }, binding).status, 'fail');
  const unexercised = renderer.phase7InteractionReceipt(
    { simulationState: lab.createSimulationState(spec) },
    null,
    packet
  );
  assert.equal(
    sceneProof.settleInteractionReceipt(unexercised, binding).status,
    'not-proven'
  );

  const phase7Output = {
    schema: 'simulatte.phase7.output.v2',
    phase: 7,
    inputSchema: 'simulatte.phase6.output.v2',
    runtimeReceiptId: 'runtime:test',
    artifact: {
      renderExecution: {
        schema: 'simulatte.renderExecution.v2',
        rendered: true,
        renderCount: 1,
        worldProofBinding: binding,
        packetIdentitySummary: [],
        visualObligationProof: [],
        interactionReceipt: base,
      },
      compositionLedger: { obligations: [], entries: [] },
    },
    receipts: [],
  };
  const settled = sceneProof.settleSceneProof(
    phase7Output,
    { nowIso: '2026-01-01T00:00:00.000Z' }
  );
  assert.equal(settled.artifact.sceneProof.interactionProof.status, 'pass');
  assert.equal(settled.artifact.sceneProof.verdict, 'pass');
  assert.equal(settled.receipts[0].interactionChangedChannelCount, base.changedChannelCount);

  const dropped = sceneProof.settleSceneProof({
    ...phase7Output,
    artifact: {
      ...phase7Output.artifact,
      renderExecution: {
        ...phase7Output.artifact.renderExecution,
        interactionReceipt: { ...base, visualStateConsumed: false },
      },
    },
  }, { nowIso: '2026-01-01T00:00:00.000Z' });
  assert.equal(dropped.artifact.sceneProof.interactionProof.status, 'fail');
  assert.equal(dropped.artifact.sceneProof.verdict, 'fail');
});

test('broad generated worlds map every physical packet entity without generic helper targets', () => {
  const prompts = [
    'two dogs swim through a lake current',
    'a glass robot rotates a metal gear',
    'a hammer strikes an ice wall',
    'a turbine spins in a lava river',
  ];
  for (const prompt of prompts) {
    const spec = lab.createSpecFromPrompt(prompt, { allowPrototypeFallback: true });
    const packet = spec.phaseArtifacts.phase6.artifact.visualCompile.sceneRenderPacket;
    const mappings = packet.interactionProgram.mappings;
    const physicalEntities = packet.entities.filter((row) => row.physicalRef);
    assert.ok(mappings.length > 0, prompt);
    for (const entity of physicalEntities) {
      assert.ok(entity.collider.targetId, `${prompt}: ${entity.id}`);
      assert.ok(mappings.some((row) => row.targetId === entity.collider.targetId));
    }
    assert.ok(mappings.every((row) => !/support|helper/.test(row.targetId)));
  }
});

function fakeCanvas() {
  const listeners = new Map();
  return {
    dataset: {},
    tabIndex: -1,
    addEventListener(type, listener) {
      const rows = listeners.get(type) || [];
      rows.push(listener);
      listeners.set(type, rows);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter((row) => row !== listener));
    },
    dispatch(type, event) {
      for (const listener of listeners.get(type) || []) listener(event);
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 100, height: 100 };
    },
    focus() {},
    setPointerCapture() {},
    releasePointerCapture() {},
  };
}

function pointerEvent(clientX, clientY, pointerId) {
  return {
    type: 'pointer',
    clientX,
    clientY,
    pointerId,
    button: 0,
    preventDefault() {},
  };
}

function keyEvent(code) {
  return {
    type: 'keydown',
    code,
    preventDefault() {},
  };
}
