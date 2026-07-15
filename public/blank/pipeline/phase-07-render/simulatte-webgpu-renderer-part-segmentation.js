(function attachSimulatteWebGpuRendererPartSegmentation(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function scenePacketConstructionParts(program = {}) {
      const parts = Array.isArray(program.parts) ? program.parts : [];
      if (program.constructionReceipt?.topologyId !== 'cephalopod') return parts;
      const core = parts.find((part) => part.constructionRole === 'core') || { center: [0, 0] };
      let tentacleIndex = 0;
      return parts.flatMap((part) => {
        if (part.primitive !== 'capsule' || !/^tentacle-\d+$/.test(String(part.id || ''))) return [part];
        const segments = cephalopodTentacleSegments(part, core, tentacleIndex);
        tentacleIndex += 1;
        return segments;
      });
    }

    function cephalopodTentacleSegments(part = {}, core = {}, index = 0) {
      const center = vector2(part.center);
      const coreCenter = vector2(core.center);
      const length = Math.max(0.08, Number(part.size?.[0] || 0.4));
      const thickness = Math.max(0.025, Number(part.size?.[1] || 0.06));
      const rotation = Number(part.rotation || 0);
      const axis = [Math.cos(rotation) * length * 0.5, -Math.sin(rotation) * length * 0.5];
      const endpoints = [subtract2(center, axis), add2(center, axis)];
      const [rootPoint, tipPoint] = distance2(endpoints[0], coreCenter) <= distance2(endpoints[1], coreCenter)
        ? endpoints : endpoints.slice().reverse();
      const middle = [(rootPoint[0] + tipPoint[0]) * 0.5, (rootPoint[1] + tipPoint[1]) * 0.5];
      const constrained = Array.isArray(part.interactionConstraintIds) && part.interactionConstraintIds.length > 0;
      const bend = constrained ? 0 : (index < 4 ? -0.3 : 0.3);
      const distalVector = rotate2(subtract2(tipPoint, middle), bend);
      const curvedTip = add2(middle, distalVector);
      return [
        segmentPart(part, `${part.id}-proximal`, rootPoint, middle, thickness, 0),
        segmentPart(part, `${part.id}-distal`, middle, curvedTip, thickness * 0.78, 1),
      ];
    }

    function segmentPart(part, id, start, end, thickness, segmentOrder) {
      const vector = subtract2(end, start);
      return {
        ...part,
        id,
        constructionPartId: part.constructionPartId || part.id || '',
        constructionSegment: segmentOrder === 0 ? 'proximal' : 'distal',
        center: [(start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5],
        size: [Math.max(0.04, Math.hypot(vector[0], vector[1]) * 1.08), thickness],
        rotation: -Math.atan2(vector[1], vector[0]),
        order: Number(part.order || 0) + segmentOrder * 0.0001,
      };
    }

    function vector2(value) {
      return [Number(value?.[0] || 0), Number(value?.[1] || 0)];
    }

    function add2(left, right) {
      return [left[0] + right[0], left[1] + right[1]];
    }

    function subtract2(left, right) {
      return [left[0] - right[0], left[1] - right[1]];
    }

    function rotate2(vector, angle) {
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      return [vector[0] * cosine - vector[1] * sine, vector[0] * sine + vector[1] * cosine];
    }

    function distance2(left, right) {
      return Math.hypot(left[0] - right[0], left[1] - right[1]);
    }

    Object.assign(scope, {
      scenePacketConstructionParts,
      cephalopodTentacleSegments,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
