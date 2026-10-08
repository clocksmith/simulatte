(function registerActivityRenderer(root) {
  const registry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js') : root.SimulattePhaseModuleRegistry;
  const scope = registry.family('webGpuRenderer');
  function scenePacketActivityPartData(data, parts, packet, state) {
    const contract = packet.activityBindings;
    if (!contract) return { data, receipt: null };
    const activity = state.activity;
    if (!activity || activity.programHash !== contract.programHash) throw new Error('Activity render state/program mismatch');
    const { origin, scale } = contract.projection;
    const project = point => [origin[0] + point[0] * scale, origin[1] - point[1] * scale];
    const byPart = new Map(contract.bindings.map(binding => [`${binding.entityId}:${binding.partId}`, binding]));
    const vector = new Float32Array(data), missing = contract.missingParticipantIds.slice();
    let applied = 0, liquidParts = 0;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i], binding = byPart.get(`${part.entityId}:${part.constructionPartId}`);
      if (!binding) continue;
      const offset = i * scope.GPU_OBJECT_PART_FLOATS;
      let center, size, rotation = 0;
      if (binding.kind === 'liquid-cell') {
        const object = activity.objects[binding.participantId];
        const cells = object?.liquid?.depthMeters.slice(binding.simulationCellStart, binding.simulationCellStart + binding.simulationCellCount);
        const depth = cells?.length === binding.simulationCellCount ? cells.reduce((s, h) => s + h, 0) / cells.length : NaN;
        if (!Number.isFinite(depth)) { missing.push(binding.participantId); continue; }
        const width = binding.container.widthMeters / binding.cellCount;
        const x = (binding.cellIndex + 0.5) * width - binding.container.widthMeters / 2;
        const y = (depth - binding.container.heightMeters) / 2, angle = object.rotation;
        center = project([object.position[0] + x * Math.cos(angle) - y * Math.sin(angle),
          object.position[1] + x * Math.sin(angle) + y * Math.cos(angle)]);
        size = [width * scale, depth * scale]; rotation = angle; liquidParts++;
      } else if (binding.kind === 'object') {
        const object = activity.objects[binding.participantId];
        if (!object) { missing.push(binding.participantId); continue; }
        const local = binding.localPart, radius = binding.radiusMeters;
        const width = binding.objectKind === 'seat' ? radius * 2.4 : radius * 2;
        const height = binding.objectKind === 'seat' ? binding.seatHeightMeters * 2 : radius * 2.6;
        const angle = object.rotation, dx = (local.center[0] - (binding.localAnchor?.[0] || 0)) * width, dy = -(local.center[1] - (binding.localAnchor?.[1] || 0)) * height;
        center = project([object.position[0] + dx * Math.cos(angle) - dy * Math.sin(angle),
          object.position[1] + dx * Math.sin(angle) + dy * Math.cos(angle)]);
        size = [local.size[0] * width * scale, local.size[1] * height * scale];
        rotation = angle + (local.rotation || 0);
      } else {
        const actor = activity.actors[binding.participantId];
        const a = actor?.joints[binding.joints[0]], b = actor?.joints[binding.joints[1]];
        if (!a || binding.kind === 'segment' && !b) { missing.push(binding.participantId); continue; }
        if (binding.kind === 'point') {
          center = project(a); size = [binding.widthMeters * scale, binding.widthMeters * scale];
        } else {
          const pa = project(a), pb = project(b);
          center = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
          size = [Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) + binding.widthMeters * scale * 0.5, binding.widthMeters * scale / 0.30];
          rotation = -Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
        }
      }
      vector[offset] = center[0]; vector[offset + 1] = center[1];
      vector[offset + 2] = size[0]; vector[offset + 3] = size[1]; vector[offset + 4] = rotation;
      vector[offset + 7] = 0; vector[offset + 20] = 0; vector[offset + 21] = 0;
      applied++;
    }
    return { data: vector, receipt: { schema: 'simulatte.activityVisualReceipt.v1', programHash: activity.programHash,
      time: activity.time, appliedPartCount: applied, expectedPartCount: contract.bindings.length,
      liquidPartCount: liquidParts,
      missingParticipantIds: [...new Set(missing)], consumed: applied === contract.bindings.length && !missing.length } };
  }
  registry.define('webGpuRenderer', 'simulatte-webgpu-renderer-activity.js', { scenePacketActivityPartData });
})(typeof globalThis !== 'undefined' ? globalThis : window);
