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
    for (const entity of entities) {
      const target = interactionTargetForEntity(entity, interactionIR.targets || []);
      if (!target || !entity.collider) continue;
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
        initialPosition: (target.initialPosition || [0.5, 0.5]).slice(0, 2),
      });
    }
    return {
      entities,
      program: {
        schema: 'simulatte.sceneInteractionProgram.v1',
        compiler: 'simulatte.phase6.scene-interaction.compiler.v1',
        sourceProgramSchema: interactionIR.schema,
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
