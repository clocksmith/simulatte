(function attachSimulatteSceneInteraction(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('compositionGraph');

  function bindScenePacketInteractions(inputEntities = [], interactionIR = null) {
    const entities = (inputEntities || []).map((row) => ({
      ...row,
      collider: row.collider ? { ...row.collider } : null,
    }));
    if (!interactionIR || interactionIR.schema !== 'simulatte.interactionIR.v1') {
      return {
        entities,
        program: emptyInteractionProgram(),
      };
    }
    const mappings = [];
    const directedProjections = new Map(entities.filter((entity) => entity.stateBindings?.simulationType === 'directed_motion')
      .map((entity) => [entity.id, directedMotionProjection(entity, entities)]));
    for (const entity of entities) {
      const target = interactionTargetForEntity(entity, interactionIR.targets || []);
      if (!target || !entity.collider) continue;
      if (entity.stateBindings?.simulationType === 'directed_motion') {
        const projection = directedProjections.get(entity.id);
        const position = (target.initialPosition || []).map((value, axis) => projection.offset[axis] + value * projection.scale[axis]);
        const prior = entity.transform.position;
        entity.collider.bounds = entity.collider.bounds.map((value, axis) => axis < 2 ? value + position[axis] - prior[axis] : value);
        entity.transform = { ...entity.transform, position: [...position, prior[2]] };
      }
      const capabilities = (target.capabilities || []).slice();
      entity.collider = {
        ...entity.collider,
        targetId: target.id,
        capabilities,
        selectable: capabilities.includes('select'),
        draggable: capabilities.includes('drag'),
      };
      entity.interaction = {
        schema: 'simulatte.sceneInteractionBinding.v1',
        targetId: target.id,
        capabilities,
        sourceProgram: interactionIR.schema,
      };
      mappings.push({
        schema: 'simulatte.sceneInteractionTargetMap.v1',
        pickId: entity.collider.pickId || entity.id,
        packetEntityId: entity.id,
        targetId: target.id,
        physicalEntityId: target.entityId,
        capabilities,
        channels: { ...(target.channels || {}) },
        ...(entity.stateBindings?.simulationType === 'free_fall'
          ? { positionProjection: mechanicsPositionProjection(entity, target) }
          : entity.stateBindings?.simulationType === 'directed_motion'
            ? { positionProjection: directedProjections.get(entity.id) } : {}),
        initialPosition: (target.initialPosition || [0.5, 0.5]).slice(0, 2),
      });
    }
    return {
      entities,
      program: {
        schema: 'simulatte.sceneInteractionProgram.v1',
        compiler: 'simulatte.phase6.scene-interaction.compiler.v1',
        sourceProgramSchema: interactionIR.schema,
        sourceProgramContentHash: interactionIR.contentHash || '',
        coordinateSystem: interactionIR.coordinateSystem,
        commandOrdering: interactionIR.commandOrdering,
        actions: (interactionIR.actions || []).map(clone),
        bindings: (interactionIR.bindings || []).map(clone),
        mappings,
        targetCount: mappings.length,
        receipt: {
          schema: 'simulatte.sceneInteractionCompileReceipt.v1',
          phase: 6,
          sourceTargetCount: (interactionIR.targets || []).length,
          mappedTargetCount: mappings.length,
          unmappedTargetIds: (interactionIR.targets || [])
            .filter((target) => !mappings.some((row) => row.targetId === target.id))
            .map((target) => target.id),
        },
      },
    };
  }

  function directedMotionProjection(entity, entities) {
    const group = entities.filter((row) => row.physicalRef === entity.physicalRef);
    const centers = group.map((row) => row.transform.position);
    const center = [0, 1].map((axis) => centers.reduce((sum, row) => sum + row[axis], 0) / centers.length);
    const delta = entity.transform.position.slice(0, 2).map((value, axis) => value - center[axis]);
    return { space: 'normalized-solver-to-canvas', scale: [0.6, 0.6],
      offset: delta.map((value) => 0.2 + value) };
  }

  function mechanicsPositionProjection(entity, target) {
    const initial = target.initialPosition || [0.5, 0.5];
    const bounds = entity.collider.bounds;
    const center = [bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2];
    const scale = center.map((value, axis) => {
      const margin = Math.min(0.45, Number(bounds[axis + 2]) / 2 + 0.025);
      return Math.max(0.001, Math.min(
        (value - margin) / Math.max(0.001, initial[axis]),
        (1 - margin - value) / Math.max(0.001, 1 - initial[axis])
      ));
    });
    return { space: 'normalized-solver-to-canvas', scale,
      offset: center.map((value, axis) => value - initial[axis] * scale[axis]) };
  }

  function interactionTargetForEntity(entity = {}, targets = []) {
    const values = new Set([
      entity.id,
      entity.physicalRef,
      entity.semanticRef,
      entity.sourceGraphId,
      ...(entity.representedEntityIds || []),
      ...(entity.sourceIds || []),
    ].filter(Boolean).map(normalizeIdentity));
    return (targets || []).find((target) => [
      target.id,
      target.entityId,
      target.renderObjectId,
    ].filter(Boolean).some((value) => values.has(normalizeIdentity(value)))) || null;
  }

  function normalizeIdentity(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/^render:/, '')
      .replace(/^target:/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function emptyInteractionProgram() {
    return {
      schema: 'simulatte.sceneInteractionProgram.v1',
      compiler: 'simulatte.phase6.scene-interaction.compiler.v1',
      sourceProgramSchema: '',
      sourceProgramContentHash: '',
      coordinateSystem: 'normalized-canvas',
      commandOrdering: '',
      actions: [],
      bindings: [],
      mappings: [],
      targetCount: 0,
      receipt: {
        schema: 'simulatte.sceneInteractionCompileReceipt.v1',
        phase: 6,
        sourceTargetCount: 0,
        mappedTargetCount: 0,
        unmappedTargetIds: [],
      },
    };
  }

  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, row]) => [key, clone(row)]));
    }
    return value;
  }

  root.SimulattePhaseModuleRegistry.define(
    'compositionGraph',
    'simulatte-scene-interaction.js',
    {
      bindScenePacketInteractions,
      interactionTargetForEntity,
      emptyInteractionProgram,
    }
  );
})(typeof globalThis !== 'undefined' ? globalThis : window);
