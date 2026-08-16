(function attachSimulatteWebGpuRendererInteraction(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('webGpuRenderer');

  function scenePacketPointerPoint(canvas, clientX, clientY) {
    const rect = canvas && typeof canvas.getBoundingClientRect === 'function'
      ? canvas.getBoundingClientRect()
      : { left: 0, top: 0, width: 1, height: 1 };
    return [
      scope.clamp01((Number(clientX || 0) - Number(rect.left || 0)) / Math.max(1, Number(rect.width || 1))),
      scope.clamp01((Number(clientY || 0) - Number(rect.top || 0)) / Math.max(1, Number(rect.height || 1))),
    ];
  }

  function scenePacketHitTest(packet = {}, point = [0.5, 0.5], simulationState = null) {
    const program = packet.interactionProgram || {};
    const mappingByEntityId = new Map((program.mappings || []).map((row) => [row.packetEntityId, row]));
    const candidates = (packet.entities || []).map((entity) => {
      const collider = entity && entity.collider || null;
      const mapping = mappingByEntityId.get(entity && entity.id) || null;
      if (!collider || collider.selectable !== true || !mapping) return null;
      const adjustedCollider = interactionAdjustedCollider(
        collider,
        mapping,
        simulationState
      );
      const hit = colliderContainsPoint(adjustedCollider, entity, point);
      if (!hit) return null;
      return {
        entity,
        collider: adjustedCollider,
        mapping,
        area: colliderArea(collider),
        depth: Number(entity.transform && entity.transform.position && entity.transform.position[2] || 0.5),
        drawOrder: Number(entity.drawOrder || 0),
      };
    }).filter(Boolean).sort((a, b) => (
      a.depth - b.depth ||
      b.drawOrder - a.drawOrder ||
      a.area - b.area ||
      String(a.entity.id || '').localeCompare(String(b.entity.id || ''))
    ));
    const selected = candidates[0] || null;
    return {
      schema: 'simulatte.phase7HitTestReceipt.v1',
      phase: 7,
      point: [scope.clamp01(point[0]), scope.clamp01(point[1])],
      hit: Boolean(selected),
      pickId: selected && (selected.collider.pickId || selected.entity.id) || '',
      packetEntityId: selected && selected.entity.id || '',
      targetId: selected && selected.mapping.targetId || '',
      capabilities: selected && selected.mapping.capabilities.slice() || [],
      candidateCount: candidates.length,
      algorithm: 'bounded-analytic-collider-hit-test',
    };
  }

  function interactionAdjustedCollider(collider = {}, mapping = null, simulationState = null) {
    const interaction = simulationState && simulationState.interaction || null;
    const visualPosition = interaction && interactionPositionForTarget(
      interaction,
      mapping,
      simulationState,
      collider
    );
    if (!Array.isArray(visualPosition) || visualPosition.length < 2 || !Array.isArray(collider.bounds)) {
      return collider;
    }
    const bounds = collider.bounds.slice(0, 4);
    bounds[0] = Math.max(0, Math.min(
      1 - Number(bounds[2] || 0),
      Number(visualPosition[0]) - Number(bounds[2] || 0) * 0.5
    ));
    bounds[1] = Math.max(0, Math.min(
      1 - Number(bounds[3] || 0),
      Number(visualPosition[1]) - Number(bounds[3] || 0) * 0.5
    ));
    return { ...collider, bounds };
  }

  function colliderContainsPoint(collider = {}, entity = {}, point = [0.5, 0.5]) {
    const bounds = Array.isArray(collider.bounds) ? collider.bounds : entity.geometry && entity.geometry.bounds;
    if (!Array.isArray(bounds) || bounds.length < 4) return false;
    const x = Number(point[0]);
    const y = Number(point[1]);
    const left = Number(bounds[0]);
    const top = Number(bounds[1]);
    const width = Math.max(0.001, Number(bounds[2]));
    const height = Math.max(0.001, Number(bounds[3]));
    if (x < left || x > left + width || y < top || y > top + height) return false;
    if (collider.kind !== 'ellipse') return true;
    const nx = (x - left) / width * 2 - 1;
    const ny = (y - top) / height * 2 - 1;
    return nx * nx + ny * ny <= 1;
  }

  function colliderArea(collider = {}) {
    const bounds = Array.isArray(collider.bounds) ? collider.bounds : [];
    return Math.max(0, Number(bounds[2] || 0)) * Math.max(0, Number(bounds[3] || 0));
  }

  function scenePacketInteractionPartData(baseData, parts = [], packet = {}, simulationState = {}) {
    const vector = new Float32Array(baseData || 0);
    const interaction = simulationState && simulationState.interaction || null;
    const entities = new Map((packet.entities || []).map((row) => [row.id, row]));
    if (!interaction || interaction.schema !== 'simulatte.interactionState.v1') {
      return {
        data: vector,
        receipt: emptyInteractionVisualReceipt(packet),
      };
    }
    let highlightedPartCount = 0;
    let movedPartCount = 0;
    (parts || []).slice(0, scope.GPU_OBJECT_PART_CAPACITY).forEach((part, index) => {
      const entity = entities.get(part.entityId) || null;
      const targetId = entity && entity.collider && entity.collider.targetId || '';
      if (!targetId) return;
      const mapping = packet.interactionProgram && (packet.interactionProgram.mappings || [])
        .find((row) => row.targetId === targetId);
      const offset = index * scope.GPU_OBJECT_PART_FLOATS;
      const visualPosition = interactionPositionForTarget(
        interaction,
        mapping,
        simulationState,
        entity && entity.collider
      );
      if (Array.isArray(visualPosition) && visualPosition.length >= 2) {
        const bounds = entity.collider.bounds || [0.45, 0.45, 0.1, 0.1];
        const sourceCenter = [
          Number(bounds[0] || 0) + Number(bounds[2] || 0) * 0.5,
          Number(bounds[1] || 0) + Number(bounds[3] || 0) * 0.5,
        ];
        vector[offset] = scope.clamp01(Number(baseData[offset] || 0.5) + Number(visualPosition[0]) - sourceCenter[0]);
        vector[offset + 1] = scope.clamp01(Number(baseData[offset + 1] || 0.5) + Number(visualPosition[1]) - sourceCenter[1]);
        movedPartCount += 1;
      }
      const selected = interaction.selectedTargetId === targetId ? 1 : 0;
      const hovered = interaction.hoveredTargetId === targetId ? 1 : 0;
      const active = interaction.grabbedTargetId === targetId || interaction.activeTargetId === targetId ? 1 : 0;
      vector[offset + 37] = selected;
      vector[offset + 38] = hovered;
      vector[offset + 39] = active;
      if (selected || hovered || active) highlightedPartCount += 1;
    });
    return {
      data: vector,
      receipt: {
        schema: 'simulatte.phase7InteractionVisualReceipt.v1',
        phase: 7,
        programSchema: packet.interactionProgram && packet.interactionProgram.schema || '',
        interactionVersion: Number(interaction.version || 0),
        selectedTargetId: interaction.selectedTargetId || '',
        hoveredTargetId: interaction.hoveredTargetId || '',
        activeTargetId: interaction.grabbedTargetId || interaction.activeTargetId || '',
        highlightedPartCount,
        movedPartCount,
        consumed: highlightedPartCount > 0 || movedPartCount > 0,
      },
    };
  }

  function interactionPositionForTarget(interaction = {}, mapping = null, simulationState = {}, collider = null) {
    if (!mapping || !collider || !Array.isArray(collider.bounds)) return null;
    const channels = mapping.channels || {};
    const current = channels.position && simulationState.solverState &&
      simulationState.solverState.channels &&
      simulationState.solverState.channels[channels.position];
    const currentPosition = current && typeof current === 'object'
      ? [Number(current.x), Number(current.y)]
      : null;
    const visual = interaction.visualPositions && interaction.visualPositions[mapping.targetId];
    const baseline = interaction.visualChannelBaselines &&
      interaction.visualChannelBaselines[mapping.targetId];
    if (Array.isArray(visual)) {
      if (!currentPosition || !Array.isArray(baseline)) return visual.slice(0, 2);
      return [
        Number(visual[0]) + currentPosition[0] - Number(baseline[0]),
        Number(visual[1]) + currentPosition[1] - Number(baseline[1]),
      ];
    }
    if (!currentPosition || !Array.isArray(mapping.initialPosition)) return null;
    const bounds = collider.bounds;
    const center = [
      Number(bounds[0] || 0) + Number(bounds[2] || 0) * 0.5,
      Number(bounds[1] || 0) + Number(bounds[3] || 0) * 0.5,
    ];
    const delta = [
      currentPosition[0] - Number(mapping.initialPosition[0]),
      currentPosition[1] - Number(mapping.initialPosition[1]),
    ];
    if (Math.abs(delta[0]) < 0.000001 && Math.abs(delta[1]) < 0.000001) return null;
    return [center[0] + delta[0], center[1] + delta[1]];
  }

  function phase7InteractionReceipt(renderExecutionInput = null, renderData = null, packet = {}) {
    const interaction = renderExecutionInput && renderExecutionInput.simulationState &&
      renderExecutionInput.simulationState.interaction || null;
    const visual = renderData && renderData.interactionVisualReceipt || emptyInteractionVisualReceipt(packet);
    if (!interaction || interaction.schema !== 'simulatte.interactionState.v1') {
      return {
        schema: 'simulatte.phase7InteractionReceipt.v1',
        status: 'not-configured',
        programSchema: packet.interactionProgram && packet.interactionProgram.schema || '',
        sourceProgramSchema: packet.interactionProgram &&
          packet.interactionProgram.sourceProgramSchema || '',
        sourceProgramContentHash: packet.interactionProgram &&
          packet.interactionProgram.sourceProgramContentHash || '',
        commandCount: 0,
        appliedCommandCount: 0,
        rejectedCommandCount: 0,
        changedChannelCount: 0,
        visualStateConsumed: false,
        visual,
      };
    }
    const changedChannels = (interaction.modifiedChannels || []).slice(0, 32);
    const appliedCommandCount = Number(interaction.appliedCommandCount || 0);
    const physicalActionExecuted = (interaction.receipts || []).some((row) => (
      row.status === 'applied' && Array.isArray(row.changedChannels) && row.changedChannels.length > 0
    ));
    return {
      schema: 'simulatte.phase7InteractionReceipt.v1',
      status: appliedCommandCount > 0 ? 'executed' : 'not-exercised',
      programSchema: packet.interactionProgram && packet.interactionProgram.schema || '',
      sourceProgramSchema: packet.interactionProgram &&
        packet.interactionProgram.sourceProgramSchema || '',
      sourceProgramContentHash: packet.interactionProgram &&
        packet.interactionProgram.sourceProgramContentHash || '',
      sourceStateSchema: interaction.schema,
      interactionVersion: Number(interaction.version || 0),
      commandCount: Number(interaction.commandCount || 0),
      appliedCommandCount,
      rejectedCommandCount: Number(interaction.rejectedCommandCount || 0),
      changedChannels,
      changedChannelCount: changedChannels.length,
      physicalActionExecuted,
      selectedTargetId: interaction.selectedTargetId || '',
      activeTargetId: interaction.grabbedTargetId || interaction.activeTargetId || '',
      visualStateConsumed: visual.consumed === true,
      visual,
      hitTest: renderData && renderData.hitTestReceipt || null,
      lastCommand: interaction.lastCommand ? { ...interaction.lastCommand } : null,
      commandReceipts: (interaction.receipts || []).slice(-16).map((row) => ({ ...row })),
    };
  }

  function emptyInteractionVisualReceipt(packet = {}) {
    return {
      schema: 'simulatte.phase7InteractionVisualReceipt.v1',
      phase: 7,
      programSchema: packet.interactionProgram && packet.interactionProgram.schema || '',
      interactionVersion: 0,
      selectedTargetId: '',
      hoveredTargetId: '',
      activeTargetId: '',
      highlightedPartCount: 0,
      movedPartCount: 0,
      consumed: false,
    };
  }

  root.SimulattePhaseModuleRegistry.define(
    'webGpuRenderer',
    'simulatte-webgpu-renderer-interaction.js',
    {
      scenePacketPointerPoint,
      scenePacketHitTest,
      colliderContainsPoint,
      interactionAdjustedCollider,
      scenePacketInteractionPartData,
      interactionPositionForTarget,
      phase7InteractionReceipt,
      emptyInteractionVisualReceipt,
    }
  );
})(typeof globalThis !== 'undefined' ? globalThis : window);
