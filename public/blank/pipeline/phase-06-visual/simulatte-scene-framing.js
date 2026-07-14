(function attachSimulatteSceneFraming(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const SCENE_FRAME_BOUNDS = Object.freeze([0.1, 0.12, 0.8, 0.72]);

    function frameScenePacketEntities(entities = []) {
      const graspLayout = enforcePacketGraspContacts(
        enforcePacketContainment((entities || []).filter(Boolean))
      );
      const contactLayout = enforcePacketSurfaceContacts(
        graspLayout.entities
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
          graspContacts: graspLayout.contacts,
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

    function enforcePacketGraspContacts(entities = []) {
      const rows = entities.slice();
      const contacts = [];
      const constraintIds = uniqueList(rows.flatMap((row) => row.layoutConstraints || []));
      for (const constraintId of constraintIds) {
        const members = rows.filter((row) => (row.layoutConstraints || []).includes(constraintId));
        const holder = members.find((row) => (row.layoutRelationRoles || []).includes('holding:source'));
        const held = members.find((row) => (row.layoutRelationRoles || []).includes('holding:target'));
        if (!holder || !held || holder === held) continue;
        const holderScale = holder.transform && holder.transform.scale || [0.16, 0.14, 1];
        const heldScale = held.transform && held.transform.scale || [0.16, 0.14, 1];
        const heldScaleFactor = Math.min(1,
          Number(holderScale[0] || 0.16) * 0.58 / Math.max(0.001, Number(heldScale[0] || 0.16)),
          Number(holderScale[1] || 0.14) * 0.62 / Math.max(0.001, Number(heldScale[1] || 0.14)));
        heldScale[0] *= heldScaleFactor;
        heldScale[1] *= heldScaleFactor;
        const holderProgram = holder.geometry && holder.geometry.program;
        const heldProgram = held.geometry && held.geometry.program;
        const targetPart = sceneGraspTargetPart(heldProgram && heldProgram.parts || []);
        if (!holderProgram || !targetPart) continue;
        const corePart = sceneGraspCorePart(holderProgram.parts || []);
        if (!corePart) continue;
        const coreProjection = sceneEntityPartProjection(holder, corePart);
        const targetProjection = sceneEntityPartProjection(held, targetPart);
        const targetCenter = sceneGraspTargetAnchor(targetPart, targetProjection, coreProjection);
        const sourceParts = sceneGraspSourceParts(holder, holderProgram.parts || [], targetCenter).slice(0, 2);
        if (!sourceParts.length) continue;
        const vector = [targetCenter[0] - coreProjection.center[0], targetCenter[1] - coreProjection.center[1]];
        const distance = Math.max(0.001, Math.hypot(vector[0], vector[1]));
        const direction = [vector[0] / distance, vector[1] / distance];
        const perpendicular = [-direction[1], direction[0]];
        const coreRadius = Math.max(0.018, Math.min(coreProjection.size[0], coreProjection.size[1]) * 0.32);
        const replacements = new Map();
        const endpointDistances = [];
        sourceParts.forEach((part, index) => {
          const lane = index - (sourceParts.length - 1) * 0.5;
          const sourceOffset = lane * Math.max(0.009, coreProjection.size[1] * 0.16);
          const targetOffset = lane * Math.max(0.008, targetProjection.size[1] * 0.22);
          const start = [
            coreProjection.center[0] + direction[0] * coreRadius + perpendicular[0] * sourceOffset,
            coreProjection.center[1] + direction[1] * coreRadius + perpendicular[1] * sourceOffset,
          ];
          const end = [
            targetCenter[0] + perpendicular[0] * targetOffset,
            targetCenter[1] + perpendicular[1] * targetOffset,
          ];
          const targetDepthPosition = Number(held.transform && held.transform.position && held.transform.position[2] || 0);
          const replacement = sceneGraspSegmentPart(holder, part, start, end, constraintId, targetDepthPosition);
          replacements.set(part.id, replacement);
          const projected = sceneEntityPartProjection(holder, replacement);
          const endpoint = sceneSegmentEndpoint(projected, end);
          endpointDistances.push(Math.hypot(endpoint[0] - end[0], endpoint[1] - end[1]));
        });
        holder.geometry = {
          ...holder.geometry,
          program: {
            ...holderProgram,
            parts: holderProgram.parts.map((part) => replacements.get(part.id) || part),
          },
        };
        contacts.push({
          constraintId,
          sourceId: holder.id,
          targetId: held.id,
          sourcePartIds: sourceParts.map((part) => part.id),
          targetPartId: targetPart.id,
          endpointDistanceAfter: Number(Math.max(...endpointDistances).toFixed(5)),
        });
      }
      return { entities: rows, contacts };
    }

    function sceneGraspTargetPart(parts = []) {
      const named = parts.find((part) => /(?:^|[-_])(handle|grip|loop)(?:$|[-_])/.test(String(part.id || part.sourceHint || '').toLowerCase()));
      if (named) return named;
      const ring = parts.find((part) => part.primitive === 'ring' && part.constructionRole === 'appendage');
      return ring || parts.slice().sort((a, b) => scenePartArea(b) - scenePartArea(a))[0] || null;
    }

    function sceneGraspTargetAnchor(part = {}, target = {}, source = {}) {
      if (part.primitive !== 'ring') return target.center;
      const vector = [source.center[0] - target.center[0], source.center[1] - target.center[1]];
      const radii = [Math.max(0.004, target.size[0] * 0.43), Math.max(0.004, target.size[1] * 0.43)];
      const divisor = Math.max(0.001, Math.hypot(vector[0] / radii[0], vector[1] / radii[1]));
      return [target.center[0] + vector[0] / divisor, target.center[1] + vector[1] / divisor];
    }

    function sceneGraspSourceParts(entity = {}, parts = [], targetCenter = [0.5, 0.5]) {
      return parts.filter((part) => (
        /(?:hand|gripper|tentacle|arm|appendage)/.test(String(`${part.id || ''} ${part.sourceHint || ''} ${part.constructionRole || ''}`).toLowerCase())
      )).sort((a, b) => {
        const aCenter = sceneEntityPartProjection(entity, a).center;
        const bCenter = sceneEntityPartProjection(entity, b).center;
        return Math.hypot(aCenter[0] - targetCenter[0], aCenter[1] - targetCenter[1]) -
          Math.hypot(bCenter[0] - targetCenter[0], bCenter[1] - targetCenter[1]);
      });
    }

    function sceneGraspCorePart(parts = []) {
      const cores = parts.filter((part) => /^(?:core|head)$/.test(String(part.constructionRole || '')));
      return (cores.length ? cores : parts).slice().sort((a, b) => scenePartArea(b) - scenePartArea(a))[0] || null;
    }

    function sceneGraspSegmentPart(entity = {}, part = {}, start = [0, 0], end = [0, 0], constraintId = '', targetDepthPosition = 0) {
      const transform = entity.transform || {};
      const scale = transform.scale || [0.16, 0.14, 1];
      const parentRotation = Number(transform.rotation && transform.rotation[2] || 0);
      const center = sceneEntityLocalPoint(entity, [(start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5]);
      const length = Math.max(0.012, Math.hypot(end[0] - start[0], end[1] - start[1]));
      return {
        ...part,
        center,
        size: [Math.min(1.4, length / Math.max(0.001, Number(scale[0] || 0.16))), Number(part.size && part.size[1] || 0.08)],
        rotation: -Math.atan2(end[1] - start[1], end[0] - start[0]) - parentRotation,
        interactionDepthPosition: targetDepthPosition - 0.08,
        interactionConstraintIds: uniqueList([...(part.interactionConstraintIds || []), constraintId]),
      };
    }

    function sceneEntityLocalPoint(entity = {}, point = [0, 0]) {
      const transform = entity.transform || {};
      const position = transform.position || [0.5, 0.5, 0];
      const scale = transform.scale || [0.16, 0.14, 1];
      const rotation = Number(transform.rotation && transform.rotation[2] || 0);
      const dx = point[0] - Number(position[0] || 0.5);
      const dy = point[1] - Number(position[1] || 0.5);
      return [
        (dx * Math.cos(rotation) + dy * Math.sin(rotation)) / Math.max(0.001, Number(scale[0] || 0.16)),
        (-dx * Math.sin(rotation) + dy * Math.cos(rotation)) / Math.max(0.001, Number(scale[1] || 0.14)),
      ];
    }

    function sceneSegmentEndpoint(projection = {}, target = [0, 0]) {
      const direction = [Math.cos(projection.rotation), -Math.sin(projection.rotation)];
      const endpoints = [-1, 1].map((sign) => [
        projection.center[0] + direction[0] * projection.size[0] * 0.5 * sign,
        projection.center[1] + direction[1] * projection.size[0] * 0.5 * sign,
      ]);
      return endpoints.sort((a, b) => Math.hypot(a[0] - target[0], a[1] - target[1]) -
        Math.hypot(b[0] - target[0], b[1] - target[1]))[0];
    }

    function scenePartArea(part = {}) {
      return Number(part.size && part.size[0] || 0) * Number(part.size && part.size[1] || 0);
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
        const before = sceneEntitySupportBounds(source);
        const support = sceneEntitySupportBounds(target);
        const clearanceBefore = support[1] - (before[1] + before[3]);
        const clearance = -0.004;
        source.transform.position[1] += clearanceBefore - clearance;
        const after = sceneEntitySupportBounds(source);
        contacts.push({
          constraintId,
          sourceId: source.id,
          targetId: target.id,
          clearanceBefore: Number(clearanceBefore.toFixed(5)),
          clearanceAfter: Number((support[1] - (after[1] + after[3])).toFixed(5)),
          contactInset: Number(Math.abs(clearance).toFixed(5)),
        });
      }
      return { entities: rows, contacts };
    }

    function sceneEntityVisibleBounds(entity = {}) {
      const parts = entity.geometry && entity.geometry.program && entity.geometry.program.parts || [];
      if (!parts.length) return framedSceneEntityBounds(entity.transform || {});
      const partBounds = parts.map((part) => sceneEntityPartProjection(entity, part).bounds);
      const left = Math.min(...partBounds.map((row) => row[0]));
      const top = Math.min(...partBounds.map((row) => row[1]));
      const right = Math.max(...partBounds.map((row) => row[2]));
      const bottom = Math.max(...partBounds.map((row) => row[3]));
      return [left, top, right - left, bottom - top];
    }

    function sceneEntitySupportBounds(entity = {}) {
      const program = entity.geometry && entity.geometry.program;
      const structural = (program && program.parts || []).filter((part) => (
        /^(?:core|head|support|panel|joint)$/.test(String(part.constructionRole || ''))
      ));
      if (!structural.length) return sceneEntityVisibleBounds(entity);
      const projected = structural.map((part) => sceneEntityPartProjection(entity, part).bounds);
      const left = Math.min(...projected.map((row) => row[0]));
      const top = Math.min(...projected.map((row) => row[1]));
      const right = Math.max(...projected.map((row) => row[2]));
      const bottom = Math.max(...projected.map((row) => row[3]));
      return [left, top, right - left, bottom - top];
    }

    function sceneEntityPartProjection(entity = {}, part = {}) {
      const transform = entity.transform || {};
      const position = transform.position || [0.5, 0.5, 0];
      const scale = transform.scale || [0.16, 0.14, 1];
      const parentRotation = Number(transform.rotation && transform.rotation[2] || 0);
      const localCenter = part.center || [0, 0];
      const dx = Number(localCenter[0] || 0) * Number(scale[0] || 0.16);
      const dy = Number(localCenter[1] || 0) * Number(scale[1] || 0.14);
      const center = [
        Number(position[0] || 0.5) + dx * Math.cos(parentRotation) - dy * Math.sin(parentRotation),
        Number(position[1] || 0.5) + dx * Math.sin(parentRotation) + dy * Math.cos(parentRotation),
      ];
      const localRotation = Number(part.rotation || 0);
      const localCosine = Math.cos(localRotation);
      const localSine = Math.sin(localRotation);
      const scaleX = Number(scale[0] || 0.16);
      const scaleY = Number(scale[1] || 0.14);
      const size = [
        Number(part.size && part.size[0] || 0.1) * Math.hypot(localCosine * scaleX, localSine * scaleY),
        Number(part.size && part.size[1] || 0.1) * Math.hypot(localSine * scaleX, localCosine * scaleY),
      ];
      const rotation = parentRotation + Math.atan2(localSine * scaleY, localCosine * scaleX);
      const cosine = Math.abs(Math.cos(rotation));
      const sine = Math.abs(Math.sin(rotation));
      const halfWidth = (cosine * size[0] + sine * size[1]) * 0.5;
      const halfHeight = (sine * size[0] + cosine * size[1]) * 0.5;
      return {
        center,
        size,
        rotation,
        bounds: [center[0] - halfWidth, center[1] - halfHeight, center[0] + halfWidth, center[1] + halfHeight],
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
      const bounds = rows.map((row) => sceneEntityVisibleBounds(row));
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
      enforcePacketGraspContacts,
      sceneEntityVisibleBounds,
      sceneEntityPartProjection,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
