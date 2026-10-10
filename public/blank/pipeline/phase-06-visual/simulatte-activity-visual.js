(function registerActivityVisual(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('physicsModel');
  const visual = registry.family('compositionGraph');
  function activityPacketEntity(packet, id) {
    return packet.entities.find(entity => entity.id === id || entity.physicalRef === id
      || entity.sourceIds?.includes(id) || entity.representedEntityIds?.includes(id));
  }
  function supportGeometryBinding(source, object) {
    const top = source.parts.find(part => /^(top|surface|shelf)$/.test(part.id));
    if (!top || source.parts.some(part => Math.abs(Math.sin(2 * (part.rotation || 0))) > 1e-8)) {
      throw new Error('Activity support requires a declared top and orthogonal construction parts');
    }
    const bounds = part => {
      const angle=part.rotation || 0, c=Math.abs(Math.cos(angle)), s=Math.abs(Math.sin(angle));
      const halfX=(c*part.size[0]+s*part.size[1])/2, halfY=(s*part.size[0]+c*part.size[1])/2;
      return {left:part.center[0]-halfX,right:part.center[0]+halfX,
        top:part.center[1]-halfY,bottom:part.center[1]+halfY};
    };
    const rows=source.parts.map(bounds), anchorY=bounds(top).top;
    const width=Math.max(...rows.map(row=>row.right))-Math.min(...rows.map(row=>row.left));
    const height=Math.max(...rows.map(row=>row.bottom))-anchorY;
    if (!(width>0 && height>0)) throw new Error('Activity support has no bounded contact geometry');
    return {localAnchor:[top.center[0],anchorY],localScale:[object.radius*2/width,object.supportHeight/height]};
  }
  function bindActivityVisualProgram(visualProgram, program) {
    scope.validateActivityProgram(program);
    const packet = visualProgram.sceneRenderPacket;
    if (!packet) throw new Error('Activity visual binding requires scene packet');
    const bindings = [], missing = [];
    const findEntity = id => activityPacketEntity(packet, id);
    const h = Math.max(1.7, ...program.actors.map(actor => actor.height));
    const minX = Math.min(-0.7, ...program.actors.map(actor => actor.origin[0] - actor.height * 0.4));
    const maxX = Math.max(0.7, ...program.actors.map(actor => actor.origin[0] + actor.height * 0.4 +
      program.actions.filter(action => action.actorId === actor.id && action.action === 'walk')
        .reduce((sum, action) => sum + action.durationSeconds * actor.height * 0.2, 0)),
      ...program.objects.map(object => object.position[0] + object.radius));
    const scale = Math.min(0.78 / (maxX - minX), 0.70 / h);
    const projection = { schema: 'simulatte.activityProjection.v1', units: 'm', scale,
      origin: [0.11 - minX * scale, 0.85], yDirection: -1 };
    for (const actor of program.actors) {
      const entity = findEntity(actor.id);
      if (!entity) { missing.push(actor.id); continue; }
      const source = entity.geometry?.program;
      if (!source?.literal) { missing.push(actor.id); continue; }
      const head = source.parts.find(part => part.id === 'head') || source.parts[0];
      const torso = source.parts.find(part => part.id === 'torso') || source.parts[0];
      const arm = source.parts.find(part => /arm/.test(part.id)) || torso;
      const leg = source.parts.find(part => /leg/.test(part.id)) || torso;
      const parts = [];
      const add = (id, prototype, joints, width, kind = 'segment') => {
        parts.push({ ...prototype, id, constructionPartId: id, center: [0, 0], size: [0.2, 0.08], rotation: 0,
          primitive: kind === 'point' ? 'ellipse' : 'capsule', contourProfile: kind === 'point' ? 'ellipse' : 'capsule' });
        bindings.push({ entityId: entity.id, participantId: actor.id, partId: id, joints,
          widthMeters: actor.height * width, kind });
      };
      add('head', head, ['head'], 0.13, 'point');
      add('torso', torso, ['pelvis', 'neck'], 0.26);
      add('neck', head, ['neck', 'head'], 0.07);
      for (const side of ['left', 'right']) {
        add(`${side}-upper-arm`, arm, [`${side}-shoulder`, `${side}-elbow`], 0.055);
        add(`${side}-forearm`, arm, [`${side}-elbow`, `${side}-hand`], 0.045);
        add(`${side}-hand`, head, [`${side}-hand`], 0.045, 'point');
        add(`${side}-thigh`, leg, [`${side}-hip`, `${side}-knee`], 0.065);
        add(`${side}-shin`, leg, [`${side}-knee`, `${side}-foot`], 0.05);
      }
      entity.geometry.program = { ...source, parts, selectionRole: 'activity-skeleton',
        grammarId: source.grammarId, activityRigId: 'simulatte.planar-human.v1', source: 'phase5-declared-activity-skeleton',
        constructionGraph: null, constructionReceipt: null,
        pose: program.actions.some(action => action.actorId === actor.id && action.action === 'sit') ? 'sitting' : 'standing' };
      entity.geometry.program.morphologyReceipt = visual.objectMorphologyReceipt(parts, source.identityType, entity.geometry.program);
      entity.animation = { ...entity.animation, kind: 'static-pose', speed: 0, amplitude: 0 };
      entity.renderCodes.animationCode = 0;
    }
    for (const object of program.objects) {
      const entity = findEntity(object.id);
      if (!entity) { missing.push(object.id); continue; }
      const source = entity.geometry?.program;
      if (!source?.literal) { missing.push(object.id); continue; }
      if (object.liquidContainer && object.liquidContainer.fillFraction > 0) {
        source.parts = source.parts.filter(part => !part.id.startsWith('liquid-cell-'));
        const body = source.parts.find(part => part.id === 'body') || source.parts[0];
        source.parts = source.parts.map(part => part.id === 'body' ? { ...part, center: [0, 0], size: [1, 1] }
          : part.id === 'rim' ? { ...part, center: [0, -0.5], size: [1, 0.08] } : part);
        for (let cell = 0; cell < program.dynamics.liquidVisualCells; cell++) {
          const id = `liquid-cell-${cell}`;
          source.parts.push({ ...body, id, constructionPartId: id, primitive: 'rounded-box', contourProfile: 'rounded-box',
            center: [0, 0], size: [0.01, 0.01], rotation: 0, fill: '#2c87bb', opacity: 1,
            surfacePattern: 'solid', accentPattern: 'none', order: 3 });
          bindings.push({ entityId: entity.id, participantId: object.id, partId: id, kind: 'liquid-cell',
            cellIndex: cell, container: object.liquidContainer, cellCount: program.dynamics.liquidVisualCells,
            simulationCellStart: cell * program.dynamics.liquidCells / program.dynamics.liquidVisualCells,
            simulationCellCount: program.dynamics.liquidCells / program.dynamics.liquidVisualCells });
        }
        const solidParts = source.parts.filter(part => !part.id.startsWith('liquid-cell-'));
        source.morphologyReceipt = { ...visual.objectMorphologyReceipt(solidParts, source.identityType, source),
          geometryScope: 'solid-container', simulationStatePartIds: source.parts.filter(part => part.id.startsWith('liquid-cell-')).map(part => part.id) };
      }
      const supportGeometry=object.kind==='support' ? supportGeometryBinding(source,object) : null;
      for (const part of source.parts.filter(part => !part.id.startsWith('liquid-cell-'))) bindings.push({ entityId: entity.id, participantId: object.id,
        partId: part.constructionPartId || part.id, kind: 'object', localPart: part,
        localAnchor: ['seat','support'].includes(object.kind) ? (source.parts.find(part => /seat|surface/.test(part.id))?.center || [0, 0]) : [0, 0],
        ...(supportGeometry || {}),
        objectKind: object.kind, radiusMeters: object.radius, seatHeightMeters: object.kind==='support'?object.supportHeight:object.seatHeight });
      entity.animation = { ...entity.animation, kind: 'static-pose', speed: 0, amplitude: 0 };
      entity.renderCodes.animationCode = 0;
    }
    packet.activityProgram = program;
    packet.activityBindings = { schema: 'simulatte.activityVisualBindings.v1', programHash: program.contentHash,
      projection, bindings, missingParticipantIds: missing };
    packet.receipts.activity = { status: missing.length ? 'unsupported' : 'bound', missingParticipantIds: missing,
      programHash: program.contentHash, bindingCount: bindings.length };
    // This is a planar rig: depth warping would separate otherwise coincident contacts.
    packet.camera = { ...packet.camera, projection: 'orthographic' };
  }
  function bindActivityVisualLedger(ledger, program, packet) {
    const actions = program.actions;
    const obligations = ledger.obligations.map(row => {
      if (!['action', 'relation', 'visual','object'].includes(row.kind) || row.constraintKind === 'absence') return row;
      const reference=(program.identityBindings||[]).find(binding=>(ledger.entries.find(entry=>entry.id===row.id)?.sourceSpanIds||[]).includes(binding.sourceSpanId));
      const action = actions.find(action => {
        if(row.kind==='object')return reference&&action.objectId===reference.targetNodeId;
        const entry = [...(ledger.entries || []), ...(ledger.relations || [])].find(entry => entry.id === row.id);
        const spans = row.sourceSpanIds || entry?.sourceSpanIds || [];
        if (spans.includes(action.sourceEvidence.verbSpanId)) return true;
        if (action.action === 'sit' && row.kind === 'relation' && entry?.spatialRelation === 'on' &&
            spans.includes(action.actorSpanId) && spans.includes(action.objectSpanId)) return true;
        const pose = row.expectedPose || row.poseHint;
        return pose && (spans.includes(action.actorSpanId) || row.targetNodeId === action.actorId) &&
          (pose === 'sitting' && action.action === 'sit' || pose === 'grasp-hold' && ['hold', 'drink'].includes(action.action));
      });
      if (!action) return row;
      const actorBinding = { schema: 'simulatte.activityObligationBinding.v1', programHash: program.contentHash,
        actionId: action.id, participantIds: [action.actorId, action.objectId].filter(Boolean),
        packetEntityIds: [action.actorId, action.objectId].filter(Boolean).map(id => activityPacketEntity(packet, id)?.id).filter(Boolean) };
      return { ...row, ownedByPhase: 6, constraintKind: 'activity', status: 'preserved',
        activityBinding: actorBinding, visualEvidence: [...(row.visualEvidence || []), `activity-program:${program.contentHash}:${action.id}`] };
    });
    return { ...ledger, obligations };
  }
  function projectActivityVisualBindings(packet, entities, geometry, instances) {
    for (const entity of packet.entities) {
      const bindings = packet.activityBindings.bindings.filter(row => row.entityId === entity.id);
      if (!bindings.length) continue;
      const stateBinding = { schema: 'simulatte.activityGeometryBinding.v1',
        programHash: packet.activityBindings.programHash, participantId: bindings[0].participantId,
        projection: packet.activityBindings.projection, partBindings: bindings };
      const source = entities.find(row => row.id === entity.id);
      if (source) { source.activityBinding = stateBinding; source.pose = { ...source.pose, authority: 'phase5-activity-snapshot' }; }
      for (const row of geometry.filter(row => row.entityId === entity.id)) {
        row.activityBinding = stateBinding; row.program = entity.geometry.program;
      }
      for (const row of instances.filter(row => row.entityId === entity.id)) {
        row.activityBinding = stateBinding; row.geometry.program = entity.geometry.program;
        row.animation = entity.animation;
      }
    }
  }
  registry.define('compositionGraph', 'simulatte-activity-visual.js', { bindActivityVisualProgram, bindActivityVisualLedger, projectActivityVisualBindings });
})(typeof globalThis !== 'undefined' ? globalThis : window);
