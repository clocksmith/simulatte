(function attachSimulatteSceneFraming(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const SCENE_FRAME_BOUNDS = Object.freeze([0.1, 0.12, 0.8, 0.72]);

    function frameScenePacketEntities(entities = []) {
      const rows = (entities || []).filter(Boolean);
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
          pass: readableCount === framed.length && projectedArea >= minimumArea && centerOffset <= 0.025,
        },
      };
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
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
