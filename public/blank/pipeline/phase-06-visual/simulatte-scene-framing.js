(function attachSimulatteSceneFraming(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const SCENE_FRAME_BOUNDS = Object.freeze([0.1, 0.12, 0.8, 0.72]);

    function frameScenePacketEntities(entities = []) {
      const contactLayout = enforcePacketSurfaceContacts(
        enforcePacketContainment((entities || []).filter(Boolean))
      );
      const rows = contactLayout.entities;
      if (!rows.length) return { entities: [], receipt: emptySceneFramingReceipt() };
      const sourceBounds = sceneEntityGroupBounds(rows);
      const targetCenter = [
        SCENE_FRAME_BOUNDS[0] + SCENE_FRAME_BOUNDS[2] * 0.5,
        SCENE_FRAME_BOUNDS[1] + SCENE_FRAME_BOUNDS[3] * 0.5,
      ];
      const sourceCenter = [
        sourceBounds[0] + sourceBounds[2] * 0.5,
        sourceBounds[1] + sourceBounds[3] * 0.5,
      ];
      const maxUpscale = rows.length === 1 ? 2.6 : rows.length === 2 ? 1.8 : 1.45;
      const scaleFactor = Math.min(
        SCENE_FRAME_BOUNDS[2] / Math.max(0.01, sourceBounds[2]),
        SCENE_FRAME_BOUNDS[3] / Math.max(0.01, sourceBounds[3]),
        maxUpscale
      );
      const framed = rows.map((row) => frameSceneEntity(row, sourceCenter, targetCenter, scaleFactor));
      const framedBounds = sceneEntityGroupBounds(framed);
      const projectedArea = framed.reduce((sum, row) => {
        const scale = row.transform && row.transform.scale || [];
        return sum + Number(scale[0] || 0) * Number(scale[1] || 0);
      }, 0);
      const readableCount = framed.filter((row) => {
        const scale = row.transform && row.transform.scale || [];
        return Number(scale[0] || 0) * Number(scale[1] || 0) >= 0.008;
      }).length;
      const centerOffset = Math.hypot(
        framedBounds[0] + framedBounds[2] * 0.5 - targetCenter[0],
        framedBounds[1] + framedBounds[3] * 0.5 - targetCenter[1]
      );
      const minimumArea = Math.min(0.16, 0.045 * framed.length);
      return {
        entities: framed,
        receipt: {
          schema: 'simulatte.sceneFramingReceipt.v1',
          method: 'group-bounds-fit',
          sourceBounds,
          framedBounds,
          targetBounds: SCENE_FRAME_BOUNDS.slice(),
          scaleFactor: Number(scaleFactor.toFixed(5)),
          projectedArea: Number(projectedArea.toFixed(5)),
          minimumProjectedArea: minimumArea,
          centerOffset: Number(centerOffset.toFixed(5)),
          entityCount: framed.length,
          readableCount,
          surfaceContacts: contactLayout.contacts,
          pass: readableCount === framed.length && projectedArea >= minimumArea && centerOffset <= 0.025,
        },
      };
    }

    function enforcePacketContainment(entities = []) {
      const rows = entities.map((row) => ({
        ...row,
        transform: {
          ...(row.transform || {}),
          position: (row.transform && row.transform.position || [0.5, 0.5, 0]).slice(),
          scale: (row.transform && row.transform.scale || [0.16, 0.14, 1]).slice(),
        },
      }));
      const constraintIds = uniqueList(rows.flatMap((row) => row.layoutConstraints || []));
      for (const constraintId of constraintIds) {
        const members = rows.filter((row) => (row.layoutConstraints || []).includes(constraintId));
        const inner = members.find((row) => (row.layoutRelationRoles || []).some((role) => (
          /^(?:in|inside|into|within):source$/.test(role)
        )));
        const outer = members.find((row) => (row.layoutRelationRoles || []).some((role) => (
          /^(?:in|inside|into|within):target$/.test(role)
        )));
        if (!inner || !outer || inner === outer) continue;
        const margin = 0.012;
        const innerScale = inner.transform.scale;
        const outerScale = outer.transform.scale;
        outerScale[0] = Math.min(0.88, Math.max(outerScale[0], innerScale[0] + margin * 2));
        outerScale[1] = Math.min(0.82, Math.max(outerScale[1], innerScale[1] + margin * 2));
        innerScale[0] = Math.min(innerScale[0], outerScale[0] - margin * 2);
        innerScale[1] = Math.min(innerScale[1], outerScale[1] - margin * 2);
        const innerPosition = inner.transform.position;
        const outerPosition = outer.transform.position;
        innerPosition[0] = clamp(
          innerPosition[0],
          outerPosition[0] - outerScale[0] * 0.5 + innerScale[0] * 0.5 + margin,
          outerPosition[0] + outerScale[0] * 0.5 - innerScale[0] * 0.5 - margin
        );
        innerPosition[1] = clamp(
          innerPosition[1],
          outerPosition[1] - outerScale[1] * 0.5 + innerScale[1] * 0.5 + margin,
          outerPosition[1] + outerScale[1] * 0.5 - innerScale[1] * 0.5 - margin
        );
      }
      return rows;
    }

    function enforcePacketSurfaceContacts(entities = []) {
      const rows = entities.slice();
      const contacts = [];
      const constraintIds = uniqueList(rows.flatMap((row) => row.layoutConstraints || []));
      for (const constraintId of constraintIds) {
        const members = rows.filter((row) => (row.layoutConstraints || []).includes(constraintId));
        const source = members.find((row) => (row.layoutRelationRoles || []).some((role) => (
          /^(?:on|onto|seated-on):source$/.test(role) || role === 'supports:target'
        )));
        const target = members.find((row) => (row.layoutRelationRoles || []).some((role) => (
          /^(?:on|onto|seated-on):target$/.test(role) || role === 'supports:source'
        )));
        if (!source || !target || source === target) continue;
        const before = sceneEntityVisibleBounds(source);
        const support = sceneEntityVisibleBounds(target);
        const clearanceBefore = support[1] - (before[1] + before[3]);
        const clearance = 0.004;
        source.transform.position[1] += clearanceBefore - clearance;
        const after = sceneEntityVisibleBounds(source);
        contacts.push({
          constraintId,
          sourceId: source.id,
          targetId: target.id,
          clearanceBefore: Number(clearanceBefore.toFixed(5)),
          clearanceAfter: Number((support[1] - (after[1] + after[3])).toFixed(5)),
        });
      }
      return { entities: rows, contacts };
    }

    function sceneEntityVisibleBounds(entity = {}) {
      const transform = entity.transform || {};
      const position = transform.position || [0.5, 0.5, 0];
      const scale = transform.scale || [0.16, 0.14, 1];
      const parts = entity.geometry && entity.geometry.program && entity.geometry.program.parts || [];
      if (!parts.length) return framedSceneEntityBounds(transform);
      const partBounds = parts.map((part) => {
        const center = part.center || [0, 0];
        const size = part.size || [0.1, 0.1];
        const cosine = Math.abs(Math.cos(Number(part.rotation || 0)));
        const sine = Math.abs(Math.sin(Number(part.rotation || 0)));
        const halfWidth = (cosine * Number(size[0] || 0) + sine * Number(size[1] || 0)) * 0.5;
        const halfHeight = (sine * Number(size[0] || 0) + cosine * Number(size[1] || 0)) * 0.5;
        return [Number(center[0] || 0) - halfWidth, Number(center[1] || 0) - halfHeight,
          Number(center[0] || 0) + halfWidth, Number(center[1] || 0) + halfHeight];
      });
      const left = Math.min(...partBounds.map((row) => row[0]));
      const top = Math.min(...partBounds.map((row) => row[1]));
      const right = Math.max(...partBounds.map((row) => row[2]));
      const bottom = Math.max(...partBounds.map((row) => row[3]));
      return [position[0] + left * scale[0], position[1] + top * scale[1],
        (right - left) * scale[0], (bottom - top) * scale[1]];
    }

    function frameSceneEntity(row = {}, sourceCenter = [0.5, 0.5], targetCenter = [0.5, 0.48], factor = 1) {
      const transform = row.transform || {};
      const position = Array.isArray(transform.position) ? transform.position : [0.5, 0.5, 0];
      const scale = Array.isArray(transform.scale) ? transform.scale : [0.16, 0.14, 1];
      const framedTransform = {
        ...transform,
        position: [
          clamp(targetCenter[0] + (Number(position[0] || 0.5) - sourceCenter[0]) * factor, 0.02, 0.98),
          clamp(targetCenter[1] + (Number(position[1] || 0.5) - sourceCenter[1]) * factor, 0.02, 0.98),
          Number(position[2] || 0),
        ],
        scale: [
          clamp(Number(scale[0] || 0.16) * factor, 0.04, 0.88),
          clamp(Number(scale[1] || 0.14) * factor, 0.04, 0.82),
          Number(scale[2] || 1),
        ],
      };
      const bounds = framedSceneEntityBounds(framedTransform);
      return {
        ...row,
        transform: framedTransform,
        geometry: row.geometry ? { ...row.geometry, bounds } : row.geometry,
        collider: row.collider ? { ...row.collider, bounds } : row.collider,
      };
    }

    function sceneEntityGroupBounds(rows = []) {
      const bounds = rows.map((row) => framedSceneEntityBounds(row.transform || {}));
      const left = Math.min(...bounds.map((row) => row[0]));
      const top = Math.min(...bounds.map((row) => row[1]));
      const right = Math.max(...bounds.map((row) => row[0] + row[2]));
      const bottom = Math.max(...bounds.map((row) => row[1] + row[3]));
      return [left, top, right - left, bottom - top].map((value) => Number(value.toFixed(5)));
    }

    function framedSceneEntityBounds(transform = {}) {
      const position = transform.position || [0.5, 0.5, 0];
      const scale = transform.scale || [0.16, 0.14, 1];
      return [
        clamp(Number(position[0] || 0.5) - Number(scale[0] || 0.16) * 0.5, 0, 1),
        clamp(Number(position[1] || 0.5) - Number(scale[1] || 0.14) * 0.5, 0, 1),
        clamp(Number(scale[0] || 0.16), 0.01, 1),
        clamp(Number(scale[1] || 0.14), 0.01, 1),
      ];
    }

    function emptySceneFramingReceipt() {
      return {
        schema: 'simulatte.sceneFramingReceipt.v1',
        method: 'group-bounds-fit',
        entityCount: 0,
        readableCount: 0,
        projectedArea: 0,
        minimumProjectedArea: 0,
        centerOffset: 0,
        pass: true,
      };
    }

    Object.assign(scope, {
      SCENE_FRAME_BOUNDS,
      frameScenePacketEntities,
      sceneEntityGroupBounds,
      enforcePacketContainment,
      enforcePacketSurfaceContacts,
      sceneEntityVisibleBounds,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
