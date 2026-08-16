(function attachSimulatteInteractionIR(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteInteractionIR = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createInteractionIRApi() {
  const INTERACTION_IR_SCHEMA = 'simulatte.interactionIR.v1';
  const INTERACTION_STATE_SCHEMA = 'simulatte.interactionState.v1';
  const INTERACTION_COMMAND_SCHEMA = 'simulatte.interactionCommand.v1';
  const INTERACTION_RECEIPT_SCHEMA = 'simulatte.interactionCommandReceipt.v1';
  const INTERACTION_TRANSITION_STATE_SCHEMA = 'simulatte.interactionTransitionState.v1';
  const INTERACTION_HASH_PREFIX = 'fnv1a32:';
  const MAX_RECEIPTS = 64;

  const ACTIONS = Object.freeze([
    action('select', 'select', 'select'),
    action('hover', 'hover', 'select'),
    action('clear-hover', 'clear-hover', ''),
    action('grab', 'grab', 'drag'),
    action('drag', 'drag', 'drag'),
    action('release', 'release', 'drag'),
    action('nudge', 'nudge', 'nudge'),
    action('impulse', 'impulse', 'impulse'),
    action('adjust', 'adjust', 'adjust'),
    action('activate', 'activate', 'activate'),
    action('clear-selection', 'clear-selection', ''),
  ]);

  const BINDINGS = Object.freeze([
    binding('pointer-hover', 'pointer', 'pointermove', 'hover'),
    binding('pointer-select', 'pointer', 'pointerdown', 'select', { button: 0 }),
    binding('pointer-grab', 'pointer', 'pointerdown', 'grab', { button: 0 }),
    binding('pointer-drag', 'pointer', 'pointerdrag', 'drag', { button: 0 }),
    binding('pointer-release', 'pointer', 'pointerup', 'release', { button: 0 }),
    binding('pointer-adjust', 'pointer', 'wheel', 'adjust'),
    binding('keyboard-left', 'keyboard', 'keydown', 'nudge', { code: 'ArrowLeft', vector: [-0.035, 0] }),
    binding('keyboard-right', 'keyboard', 'keydown', 'nudge', { code: 'ArrowRight', vector: [0.035, 0] }),
    binding('keyboard-up', 'keyboard', 'keydown', 'nudge', { code: 'ArrowUp', vector: [0, -0.035] }),
    binding('keyboard-down', 'keyboard', 'keydown', 'nudge', { code: 'ArrowDown', vector: [0, 0.035] }),
    binding('keyboard-impulse', 'keyboard', 'keydown', 'impulse', { code: 'Space', vector: [0, -0.7] }),
    binding('keyboard-activate', 'keyboard', 'keydown', 'activate', { code: 'Enter' }),
    binding('keyboard-clear', 'keyboard', 'keydown', 'clear-selection', { code: 'Escape' }),
  ]);

  function action(id, commandKind, requiredCapability) {
    return Object.freeze({
      schema: 'simulatte.interactionAction.v1',
      id,
      commandKind,
      requiredCapability,
    });
  }

  function binding(id, device, event, actionId, options = {}) {
    return Object.freeze({
      schema: 'simulatte.interactionBinding.v1',
      id,
      device,
      event,
      actionId,
      ...options,
    });
  }

  function compileInteractionIR(input = {}) {
    const physicsIR = input.physicsIR || {};
    const solverGraph = input.solverGraph || {};
    const renderIR = input.renderIR || {};
    const channelMetadata = solverGraph.channelMetadata || {};
    const renderObjects = Array.isArray(renderIR.objects) ? renderIR.objects : [];
    const targets = (physicsIR.entities || []).map((entity) => {
      const entityId = String(entity.id || '');
      const channels = channelsForEntity(entityId, channelMetadata);
      const fixed = interactionTargetFixed(entity);
      const capabilities = capabilitiesForChannels(channels, fixed);
      const renderObject = renderObjects.find((row) => row.physicalRef === entityId) || null;
      const initialPositionValue = channels.position && solverGraph.channels &&
        solverGraph.channels[channels.position];
      return {
        schema: 'simulatte.interactionTarget.v1',
        id: `target:${entityId}`,
        entityId,
        renderObjectId: renderObject && renderObject.id || '',
        label: String(entity.label || entityId),
        mobility: fixed ? 'fixed' : 'dynamic',
        capabilities,
        channels,
        initialPosition: initialPositionValue && typeof initialPositionValue === 'object'
          ? [finite(initialPositionValue.x, 0.5), finite(initialPositionValue.y, 0.5)]
          : [0.5, 0.5],
        evidence: unique([
          ...(entity.evidence || []),
          entity.sourceNodeId,
          renderObject && renderObject.semanticRef,
        ]),
      };
    }).filter((target) => target.entityId);
    const activeCapabilities = new Set(targets.flatMap((target) => target.capabilities));
    const actions = ACTIONS.filter((row) => (
      !row.requiredCapability || activeCapabilities.has(row.requiredCapability)
    )).map(clone);
    const actionIds = new Set(actions.map((row) => row.id));
    const bindings = BINDINGS.filter((row) => actionIds.has(row.actionId)).map(clone);
    const interactionIR = {
      schema: INTERACTION_IR_SCHEMA,
      contentHash: '',
      compiler: 'simulatte.phase5.interaction-ir.compiler.v1',
      coordinateSystem: 'normalized-canvas',
      commandOrdering: 'monotonic-sequence-then-arrival-order',
      targetSelection: 'phase6-collider-hit-test',
      targets,
      actions,
      bindings,
      receipt: {
        schema: 'simulatte.interactionCompileReceipt.v1',
        phase: 5,
        targetCount: targets.length,
        dynamicTargetCount: targets.filter((row) => row.capabilities.some((value) => value !== 'select')).length,
        actionCount: actions.length,
        bindingCount: bindings.length,
        supportedCapabilities: Array.from(activeCapabilities).sort(),
        complexity: `O(${targets.length}+${Object.keys(channelMetadata).length})`,
      },
    };
    interactionIR.contentHash = interactionProgramContentHash(interactionIR);
    validateInteractionIR(interactionIR);
    return interactionIR;
  }

  function channelsForEntity(entityId, metadata = {}) {
    const rows = Object.keys(metadata).filter((id) => id.endsWith(`:${entityId}`));
    const byName = {};
    for (const channelId of rows) {
      const row = metadata[channelId] || {};
      const name = String(row.name || channelId.split(':')[0]);
      if (!(name in byName)) byName[name] = channelId;
    }
    return {
      position: byName.position || '',
      velocity: byName.velocity || byName.flowVelocity || '',
      force: byName.force || '',
      angle: byName.angle || '',
      angularVelocity: byName.angularVelocity || '',
      torque: byName.torque || '',
      adjust: firstChannel(byName, [
        'amplitude', 'strokeForce', 'throughput', 'backlog', 'pressure',
        'temperature', 'charge', 'phase',
      ]),
    };
  }

  function firstChannel(byName, names) {
    for (const name of names) {
      if (byName[name]) return byName[name];
    }
    return '';
  }

  function capabilitiesForChannels(channels = {}, fixed = false) {
    const capabilities = ['select'];
    if (fixed) return capabilities;
    if (channels.position || channels.velocity || channels.force) capabilities.push('drag', 'nudge');
    if (channels.velocity || channels.force || channels.angularVelocity || channels.torque) capabilities.push('impulse');
    if (channels.adjust) capabilities.push('adjust', 'activate');
    return unique(capabilities);
  }

  function interactionTargetFixed(entity = {}) {
    const text = [
      entity.label,
      entity.semanticType,
      entity.semanticRole,
      entity.semanticClass,
      entity.visualArchetype,
      ...(entity.domains || []),
      ...(entity.shapeHints || []),
    ].filter(Boolean).join(' ').toLowerCase();
    return /\b(?:boundary|building|floor|ground|terrain|wall)\b/.test(text);
  }

  function validateInteractionIR(ir = {}) {
    if (ir.schema !== INTERACTION_IR_SCHEMA) {
      throw new Error(`InteractionIR expected ${INTERACTION_IR_SCHEMA}`);
    }
    if (ir.contentHash !== interactionProgramContentHash(ir)) {
      throw new Error('InteractionIR contentHash does not match its canonical program');
    }
    const actionIds = new Set((ir.actions || []).map((row) => row.id));
    const targetIds = new Set();
    for (const target of ir.targets || []) {
      if (!target.id || targetIds.has(target.id)) throw new Error(`InteractionIR duplicate target: ${target.id || 'missing'}`);
      targetIds.add(target.id);
      if (!Array.isArray(target.capabilities) || !target.capabilities.includes('select')) {
        throw new Error(`InteractionIR target ${target.id} must be selectable`);
      }
    }
    for (const row of ir.bindings || []) {
      if (!actionIds.has(row.actionId)) {
        throw new Error(`InteractionIR binding ${row.id} references missing action ${row.actionId}`);
      }
    }
    return ir;
  }

  function createInteractionState(interactionIR = null) {
    return {
      schema: INTERACTION_STATE_SCHEMA,
      programSchema: interactionIR && interactionIR.schema || '',
      version: 0,
      selectedTargetId: '',
      hoveredTargetId: '',
      grabbedTargetId: '',
      activeTargetId: '',
      pointer: [0.5, 0.5],
      visualPositions: {},
      visualChannelBaselines: {},
      commandCount: 0,
      appliedCommandCount: 0,
      rejectedCommandCount: 0,
      modifiedChannels: [],
      receipts: [],
      lastCommand: null,
    };
  }

  function withInteractionState(state = {}, interactionIR = null) {
    if (!interactionIR || interactionIR.schema !== INTERACTION_IR_SCHEMA) return state;
    if (state.interaction && state.interaction.schema === INTERACTION_STATE_SCHEMA) return state;
    return { ...state, interaction: createInteractionState(interactionIR) };
  }

  function createInteractionCommand(input = {}) {
    const point = vector(input.point, [0.5, 0.5]);
    const delta = vector(input.delta, [0, 0]);
    return {
      schema: INTERACTION_COMMAND_SCHEMA,
      sequence: Math.max(0, Math.floor(finite(input.sequence, 0))),
      actionId: String(input.actionId || ''),
      targetId: String(input.targetId || ''),
      source: String(input.source || 'runtime-input'),
      point: [clamp(point[0], 0, 1), clamp(point[1], 0, 1)],
      delta: [clamp(delta[0], -1, 1), clamp(delta[1], -1, 1)],
      value: clamp(finite(input.value, 0), -1, 1),
      bindingId: String(input.bindingId || ''),
    };
  }

  function applyInteractionCommands(state = {}, interactionIR = null, inputCommands = []) {
    if (!interactionIR || interactionIR.schema !== INTERACTION_IR_SCHEMA) return state;
    const commands = (inputCommands || []).map(createInteractionCommand)
      .sort((a, b) => a.sequence - b.sequence);
    if (!commands.length) return withInteractionState(state, interactionIR);
    const targets = new Map((interactionIR.targets || []).map((row) => [row.id, row]));
    let next = withInteractionState(state, interactionIR);
    next = {
      ...next,
      __interactionChannelsCloned: false,
      interaction: {
        ...next.interaction,
        visualPositions: { ...(next.interaction.visualPositions || {}) },
        visualChannelBaselines: { ...(next.interaction.visualChannelBaselines || {}) },
        modifiedChannels: (next.interaction.modifiedChannels || []).slice(),
        receipts: (next.interaction.receipts || []).slice(),
      },
    };
    for (const command of commands) next = applyCommand(next, interactionIR, targets, command);
    delete next.__interactionChannelsCloned;
    return next;
  }

  function applyCommand(state, interactionIR, targets, command) {
    const action = (interactionIR.actions || []).find((row) => row.id === command.actionId);
    const target = command.targetId ? targets.get(command.targetId) : null;
    const interaction = state.interaction;
    const beforeState = interactionTransitionState(state, target);
    interaction.commandCount += 1;
    let status = 'applied';
    let reason = '';
    let changedChannels = [];
    if (!action) {
      status = 'rejected';
      reason = 'unknown action';
    } else if (action.requiredCapability && (!target || !target.capabilities.includes(action.requiredCapability))) {
      status = 'rejected';
      reason = `target lacks ${action.requiredCapability}`;
    } else {
      const result = executeAction(state, target, command);
      state = result.state;
      changedChannels = result.changedChannels;
      reason = result.reason;
      if (result.applied !== true) status = 'rejected';
    }
    const nextInteraction = state.interaction;
    nextInteraction.version += 1;
    nextInteraction.pointer = command.point.slice();
    nextInteraction.lastCommand = clone(command);
    if (status === 'applied') {
      nextInteraction.appliedCommandCount += 1;
      if (['grab', 'drag', 'impulse', 'adjust', 'activate'].includes(command.actionId)) {
        nextInteraction.activeTargetId = command.targetId;
      } else if (command.actionId === 'release' || command.actionId === 'clear-selection') {
        nextInteraction.activeTargetId = '';
      }
    } else {
      nextInteraction.rejectedCommandCount += 1;
    }
    nextInteraction.modifiedChannels = unique([
      ...nextInteraction.modifiedChannels,
      ...changedChannels,
    ]).slice(-32);
    const afterState = interactionTransitionState(state, target);
    nextInteraction.receipts.push({
      schema: INTERACTION_RECEIPT_SCHEMA,
      sequence: command.sequence,
      actionId: command.actionId,
      targetId: command.targetId,
      bindingId: command.bindingId,
      status,
      reason,
      changedChannels,
      beforeState,
      afterState,
      beforeStateHash: interactionTransitionStateHash(beforeState),
      afterStateHash: interactionTransitionStateHash(afterState),
      point: command.point.slice(),
      delta: command.delta.slice(),
    });
    nextInteraction.receipts = nextInteraction.receipts.slice(-MAX_RECEIPTS);
    return state;
  }

  function executeAction(state, target, command) {
    const interaction = state.interaction;
    if (command.actionId === 'clear-selection') {
      interaction.selectedTargetId = '';
      interaction.hoveredTargetId = '';
      interaction.grabbedTargetId = '';
      interaction.activeTargetId = '';
      return result(state, [], 'selection cleared');
    }
    if (command.actionId === 'clear-hover') {
      interaction.hoveredTargetId = '';
      return result(state, [], 'hover cleared');
    }
    if (!target) return result(state, [], 'target unavailable', false);
    if (command.actionId === 'select') {
      interaction.selectedTargetId = target.id;
      return result(state, [], 'target selected');
    }
    if (command.actionId === 'hover') {
      interaction.hoveredTargetId = target.id;
      return result(state, [], 'target hovered');
    }
    if (command.actionId === 'grab') {
      interaction.selectedTargetId = target.id;
      interaction.grabbedTargetId = target.id;
      return result(state, [], 'target grabbed');
    }
    if (command.actionId === 'release') {
      interaction.grabbedTargetId = '';
      return result(state, [], 'target released');
    }
    const changedChannels = [];
    if (command.actionId === 'drag') {
      interaction.selectedTargetId = target.id;
      interaction.grabbedTargetId = target.id;
      interaction.visualPositions[target.id] = command.point.slice();
      setVectorChannel(state, target.channels.position, command.point, changedChannels);
      interaction.visualChannelBaselines[target.id] = channelPosition(state, target);
      addVectorChannel(state, target.channels.velocity, scaleVector(command.delta, 8), changedChannels, 6);
      addVectorChannel(state, target.channels.force, scaleVector(command.delta, 80), changedChannels, 240);
      addScalarChannel(state, target.channels.angularVelocity, command.delta[0] * 8, changedChannels, 18);
      addScalarChannel(state, target.channels.torque, command.delta[0] * 20, changedChannels, 80);
      return result(state, changedChannels, changedChannels.length ? 'drag changed simulation channels' : 'drag changed visual position');
    }
    if (command.actionId === 'nudge') {
      const current = currentPosition(state, target);
      const position = [
        clamp(current[0] + command.delta[0], 0, 1),
        clamp(current[1] + command.delta[1], 0, 1),
      ];
      setVectorChannel(state, target.channels.position, position, changedChannels);
      addVectorChannel(state, target.channels.velocity, scaleVector(command.delta, 5), changedChannels, 6);
      return result(state, changedChannels, changedChannels.length ? 'nudge changed simulation channels' : 'nudge changed visual position');
    }
    if (command.actionId === 'impulse') {
      const impulse = command.delta[0] || command.delta[1] ? command.delta : [0, -0.7];
      addVectorChannel(state, target.channels.velocity, scaleVector(impulse, 1.6), changedChannels, 8);
      addVectorChannel(state, target.channels.force, scaleVector(impulse, 60), changedChannels, 260);
      addScalarChannel(state, target.channels.angularVelocity, impulse[0] * 4 + 1.2, changedChannels, 20);
      addScalarChannel(state, target.channels.torque, impulse[0] * 16 + 3, changedChannels, 90);
      return result(state, changedChannels, 'impulse changed simulation channels', changedChannels.length > 0);
    }
    if (command.actionId === 'adjust' || command.actionId === 'activate') {
      const amount = command.actionId === 'activate' ? 0.12 : -command.value * 0.08;
      addScalarChannel(state, target.channels.adjust, amount, changedChannels, 1);
      return result(state, changedChannels, 'scalar control changed', changedChannels.length > 0);
    }
    return result(state, [], 'action has no executor', false);
  }

  function result(state, changedChannels, reason, applied = true) {
    return { state, changedChannels, reason, applied };
  }

  function currentPosition(state, target) {
    const visual = state.interaction.visualPositions[target.id];
    if (Array.isArray(visual)) return visual.slice(0, 2);
    const value = readChannel(state, target.channels.position);
    return value && typeof value === 'object'
      ? [finite(value.x, 0.5), finite(value.y, 0.5)]
      : [0.5, 0.5];
  }

  function channelPosition(state, target) {
    const value = readChannel(state, target.channels.position);
    return value && typeof value === 'object'
      ? [finite(value.x, 0.5), finite(value.y, 0.5)]
      : target.initialPosition.slice();
  }

  function setVectorChannel(state, channelId, value, changedChannels) {
    if (!channelId) return;
    const channels = writableChannels(state);
    channels[channelId] = { x: finite(value[0], 0), y: finite(value[1], 0) };
    changedChannels.push(channelId);
  }

  function addVectorChannel(state, channelId, delta, changedChannels, limit) {
    if (!channelId) return;
    const channels = writableChannels(state);
    const previous = channels[channelId] && typeof channels[channelId] === 'object'
      ? channels[channelId]
      : { x: 0, y: 0 };
    channels[channelId] = {
      x: clamp(finite(previous.x, 0) + delta[0], -limit, limit),
      y: clamp(finite(previous.y, 0) + delta[1], -limit, limit),
    };
    changedChannels.push(channelId);
  }

  function addScalarChannel(state, channelId, amount, changedChannels, limit) {
    if (!channelId) return;
    const channels = writableChannels(state);
    channels[channelId] = clamp(finite(channels[channelId], 0) + amount, -limit, limit);
    changedChannels.push(channelId);
  }

  function writableChannels(state) {
    if (!state.solverState) state.solverState = { kind: 'solver-state', channels: {} };
    if (!state.__interactionChannelsCloned) {
      state.solverState = {
        ...state.solverState,
        channels: { ...(state.solverState.channels || {}) },
      };
      state.__interactionChannelsCloned = true;
    }
    state.channelValues = state.solverState.channels;
    return state.solverState.channels;
  }

  function readChannel(state, channelId) {
    return channelId && state.solverState && state.solverState.channels
      ? state.solverState.channels[channelId]
      : undefined;
  }

  function interactionTransitionState(state = {}, target = null) {
    const interaction = state.interaction || {};
    const targetId = String(target && target.id || '');
    const channelIds = unique(Object.values(target && target.channels || {}))
      .map(String)
      .filter(Boolean)
      .sort();
    const visualPosition = targetId && interaction.visualPositions &&
      interaction.visualPositions[targetId];
    return {
      schema: INTERACTION_TRANSITION_STATE_SCHEMA,
      selectedTargetId: String(interaction.selectedTargetId || ''),
      hoveredTargetId: String(interaction.hoveredTargetId || ''),
      grabbedTargetId: String(interaction.grabbedTargetId || ''),
      activeTargetId: String(interaction.activeTargetId || ''),
      visualPosition: Array.isArray(visualPosition)
        ? visualPosition.slice(0, 2).map((value) => finite(value, 0))
        : null,
      channels: channelIds.map((id) => ({
        id,
        value: canonicalValue(readChannel(state, id) ?? null),
      })),
    };
  }

  function interactionProgramContentHash(interactionIR = {}) {
    const program = clone(interactionIR || {});
    delete program.contentHash;
    return hashCanonical(program);
  }

  function interactionTransitionStateHash(state = {}) {
    return hashCanonical(state);
  }

  function hashCanonical(value) {
    let hash = 0x811c9dc5;
    const bytes = new TextEncoder().encode(JSON.stringify(canonicalValue(value)));
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${INTERACTION_HASH_PREFIX}${hash.toString(16).padStart(8, '0')}`;
  }

  function canonicalValue(value) {
    if (Array.isArray(value)) return value.map(canonicalValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])])
      );
    }
    return value;
  }

  function scaleVector(value, scale) {
    return [finite(value[0], 0) * scale, finite(value[1], 0) * scale];
  }

  function vector(value, fallback) {
    return Array.isArray(value)
      ? [finite(value[0], fallback[0]), finite(value[1], fallback[1])]
      : fallback.slice();
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, row]) => [key, clone(row)]));
    }
    return value;
  }

  return {
    INTERACTION_IR_SCHEMA,
    INTERACTION_STATE_SCHEMA,
    INTERACTION_COMMAND_SCHEMA,
    INTERACTION_RECEIPT_SCHEMA,
    INTERACTION_TRANSITION_STATE_SCHEMA,
    ACTIONS,
    BINDINGS,
    compileInteractionIR,
    validateInteractionIR,
    createInteractionState,
    withInteractionState,
    createInteractionCommand,
    applyInteractionCommands,
    interactionProgramContentHash,
    interactionTransitionStateHash,
  };
});
