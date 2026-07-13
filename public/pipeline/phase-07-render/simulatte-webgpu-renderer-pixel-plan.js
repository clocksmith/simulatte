(function attachSimulatteWebGpuRendererPixelPlan(root) {
  const scope = root.__SimulatteWebGpuRendererRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    function phase7ProjectedObjectPartPoints(renderData = {}, obligation = {}, time = 0) {
      const target = normalizeForProof(obligation.targetIdentity || obligation.target || '');
      const entityId = String(obligation.targetEntityId || '');
      const role = normalizeForProof(obligation.expectedPartRole || '');
      const candidates = (renderData.objectParts || []).filter((part) => {
        const entityMatches = entityId
          ? String(part.entityId || '') === entityId || String(part.entityId || '').startsWith(`${entityId}:instance:`)
          : true;
        const identityMatches = target ? (
          normalizeForProof(part.id).includes(target) ||
          normalizeForProof(part.identityType).includes(target)
        ) : true;
        const roleMatches = role ? normalizeForProof(part.constructionRole) === role : true;
        return entityMatches && identityMatches && roleMatches;
      }).sort((a, b) => (
        Number(a.constructionRoleIndex || 0) - Number(b.constructionRoleIndex || 0) ||
        Number(b.size && b.size[0] || 0) * Number(b.size && b.size[1] || 0) -
        Number(a.size && a.size[0] || 0) * Number(a.size && a.size[1] || 0)
      ));
      return candidates.map((part) => ({ ...phase7ProjectedPartPoint(part, renderData.cameraState, time), part }));
    }

    function phase7ProjectedObjectPartPoint(renderData = {}, obligation = {}, time = 0) {
      return phase7ProjectedObjectPartPoints(renderData, obligation, time)[0] || null;
    }

    function phase7ProjectedPartPoint(part = {}, camera = {}, time = 0) {
      const zoom = Number(camera.zoom || 1);
      const depth = Number(part.depth || 0.5);
      let x = (Number(part.center && part.center[0] || 0.5) * 2 - 1) * zoom;
      let y = (1 - Number(part.center && part.center[1] || 0.5) * 2) * zoom;
      x += (Number(camera.focalDepth || 0.5) - depth) * Number(camera.tilt || 0);
      const phase = Math.fround(Number(part.variantCode || 0)) * 6.28318;
      const motion = Number(part.animationCode || 0);
      if (motion > 0.75) {
        if (motion < 1.5) { x += Math.sin(time * 1.4 + phase) * 0.07; y += Math.cos(time * 2.1 + phase) * 0.028; }
        else if (motion < 2.5) { x += Math.sin(time * 0.9 + phase) * 0.045; y += Math.cos(time * 1.3 + phase) * 0.018; }
        else if (motion < 3.5) { x += Math.sin(time * 1.6 + phase) * 0.032; y += Math.cos(time * 1.1 + phase) * 0.014; }
        else if (motion < 4.5) y += Math.sin(time * 1.2 + phase) * 0.01;
        else if (motion < 5.5) x += ((time * 0.035 + Math.fround(Number(part.variantCode || 0))) % 1) * 0.02 - 0.01;
        else if (motion < 6.5) y += Math.sin(time * 0.72 + phase) * 0.024;
        else if (motion < 7.5) { x += Math.sin(time * 0.74 + phase) * 0.012; y += Math.sin(time * 1.05 + phase) * 0.028; }
        else if (motion < 8.5) { x += Math.cos(time * 0.42 + phase) * 0.026; y += Math.sin(time * 0.42 + phase) * 0.026; }
        else if (motion > 9.5 && motion < 10.5) { x += Math.cos(time * 0.72 + phase) * 0.065; y += Math.sin(time * 1.14 + phase) * 0.022; }
        else y += Math.sin(time * 0.5 + phase) * 0.004;
      }
      if (Math.abs(Number(part.semanticCode || 0) - 16) < 0.5) x += Math.sin(time * 0.7 + phase) * 0.012;
      if (Math.abs(Number(part.semanticCode || 0) - 23) < 0.5) {
        x += Math.cos(time * 0.38 + phase) * 0.022;
        y += Math.sin(time * 0.38 + phase) * 0.022;
      }
      return { x: clamp01((x + 1) * 0.5), y: clamp01((1 - y) * 0.5) };
    }

    Object.assign(scope, {
      phase7ProjectedObjectPartPoints,
      phase7ProjectedObjectPartPoint,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
