(function attachSimulatteRenderProofRelations(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRenderProofRelations = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRenderProofRelationsModule() {
  function createRelationProofApi({ normalizeForProof, promptProofEntityMatches } = {}) {
    if (typeof normalizeForProof !== 'function' || typeof promptProofEntityMatches !== 'function') {
      throw new Error('SimulatteRenderProofRelations requires proof identity helpers');
    }

    function visualRelationObligation(obligation = {}) {
      const id = String(obligation.obligationId || obligation.id || '');
        return obligation.required === true && obligation.kind === 'relation' && (
          /^relation:spatial:/.test(id) ||
        /^relation:[^:]+:(?:hold|holds|holding|grasp|grasps|grasping|carry|carries|carrying|clutch|clutches|clutching):/.test(id) ||
        dynamicVisualRelationEvidenceIds(obligation).length > 0
      );
    }

    function dynamicVisualRelationEvidenceIds(obligation = {}) {
      return Array.from(new Set((obligation.visualEvidence || [])
        .map((value) => String(value || '').match(/^phase6:(?:process|field):(.+)$/))
        .filter(Boolean)
        .map((match) => normalizeForProof(match[1]))));
    }

    function dynamicVisualRelationObligation(obligation = {}) {
      return obligation.required === true && obligation.kind === 'relation' &&
        dynamicVisualRelationEvidenceIds(obligation).length > 0;
    }

    function dynamicVisualRelationRows(obligation = {}, sceneRenderPacket = {}) {
      const ids = new Set(dynamicVisualRelationEvidenceIds(obligation));
      return [...(sceneRenderPacket.fields || []), ...(sceneRenderPacket.effects || [])].filter((row) => {
        const candidates = [row.id, row.sourceGraphId, row.semanticRef].map(normalizeForProof).filter(Boolean);
        return candidates.some((candidate) => ids.has(candidate));
      });
    }

    function visualRelationParts(obligation = {}) {
      const id = String(obligation.obligationId || obligation.id || '');
      const match = id.match(/:(?:entity|environment|medium)-([^:]+):([^:]+):(?:(?:entity|environment|medium)-([^:]+)|(world))$/);
      return match ? {
        sourceIdentity: normalizeForProof(match[1]),
        relation: normalizeForProof(match[2]),
        targetIdentity: normalizeForProof(match[3] || match[4]),
      } : null;
    }

    function relationVisualObligationPacketSatisfied(obligation = {}, sceneRenderPacket = {}) {
      if (!visualRelationObligation(obligation)) return null;
      const parts = visualRelationParts(obligation);
      if (!parts) return false;
      const id = obligation.obligationId || obligation.id || '';
      const ledgerRows = sceneRenderPacket.compositionLedger && sceneRenderPacket.compositionLedger.obligations || [];
      const preserved = ledgerRows.some((row) => row.id === id && row.status === 'preserved');
      const source = (sceneRenderPacket.entities || []).some((row) => (
        promptProofEntityMatches(row, parts.sourceIdentity)
      ));
      const target = parts.targetIdentity === 'world' || (sceneRenderPacket.entities || []).some((row) => (
        promptProofEntityMatches(row, parts.targetIdentity)
      ));
      if (!preserved || !source || !target) return false;
      if (dynamicVisualRelationObligation(obligation)) {
        return dynamicVisualRelationRows(obligation, sceneRenderPacket).length > 0;
      }
      if (/^(?:on|onto|seated on|supports)$/.test(parts.relation)) {
        return relationSurfaceContacts(sceneRenderPacket).some((row) => (
          row.constraintId === id && Number(row.clearanceAfter) >= -0.02 && Number(row.clearanceAfter) <= 0.012
        ));
      }
      if (/^(?:hold|holds|holding|grasp|grasps|grasping|carry|carries|carrying|clutch|clutches|clutching)$/.test(parts.relation)) {
        return relationGraspContacts(sceneRenderPacket).some((row) => (
          row.constraintId === id && (row.sourcePartIds || []).length > 0 && row.targetPartId &&
          Number(row.endpointDistanceAfter) <= 0.015
        ));
      }
      return true;
    }

    function relationVisualObligationGeometrySatisfied(obligation = {}, sceneRenderPacket = {}, renderData = null) {
      if (!visualRelationObligation(obligation)) return null;
      if (dynamicVisualRelationObligation(obligation)) {
        return dynamicVisualRelationRows(obligation, sceneRenderPacket).length > 0;
      }
      const parts = visualRelationParts(obligation);
      if (!parts || !renderData || !Array.isArray(renderData.objectParts)) return false;
      const sourceIds = relationEntityIds(sceneRenderPacket, parts.sourceIdentity);
      const targetIds = relationEntityIds(sceneRenderPacket, parts.targetIdentity);
      const sourceBounds = relationObjectBounds(renderData, sourceIds);
      const targetBounds = relationObjectBounds(renderData, targetIds);
      if (!sourceBounds || !targetBounds) return false;
      if (/^(?:in|inside|into|within)$/.test(parts.relation)) {
        const tolerance = 0.035;
        return sourceBounds.left >= targetBounds.left - tolerance &&
          sourceBounds.right <= targetBounds.right + tolerance &&
          sourceBounds.top >= targetBounds.top - tolerance &&
          sourceBounds.bottom <= targetBounds.bottom + tolerance;
      }
      if (/^(?:above|over)$/.test(parts.relation)) {
        return sourceBounds.centerY < targetBounds.centerY && sourceBounds.bottom <= targetBounds.centerY;
      }
      if (/^(?:below|under)$/.test(parts.relation)) {
        return sourceBounds.centerY > targetBounds.centerY && sourceBounds.top >= targetBounds.centerY;
      }
      if (/^(?:between)$/.test(parts.relation)) {
        const targetParts = relationObjectPartBounds(renderData, targetIds);
        const horizontal = targetParts.some((row) => row.centerX < sourceBounds.left - 0.006) &&
          targetParts.some((row) => row.centerX > sourceBounds.right + 0.006);
        const vertical = targetParts.some((row) => row.centerY < sourceBounds.top - 0.006) &&
          targetParts.some((row) => row.centerY > sourceBounds.bottom + 0.006);
        return horizontal || vertical;
      }
      if (/^(?:beside|near)$/.test(parts.relation)) {
        const horizontal = Math.abs(sourceBounds.centerX - targetBounds.centerX);
        const vertical = Math.abs(sourceBounds.centerY - targetBounds.centerY);
        return horizontal >= Math.min(sourceBounds.width, targetBounds.width) * 0.35 && vertical <= 0.42;
      }
      if (/^(?:with)$/.test(parts.relation)) {
        return Math.hypot(
          sourceBounds.centerX - targetBounds.centerX,
          sourceBounds.centerY - targetBounds.centerY
        ) <= 0.42;
      }
      if (/^(?:through)$/.test(parts.relation)) {
        const overlapWidth = Math.max(0, Math.min(sourceBounds.right, targetBounds.right) -
          Math.max(sourceBounds.left, targetBounds.left));
        const overlapHeight = Math.max(0, Math.min(sourceBounds.bottom, targetBounds.bottom) -
          Math.max(sourceBounds.top, targetBounds.top));
        const sourceArea = Math.max(0.0001, sourceBounds.width * sourceBounds.height);
        const centerInside = sourceBounds.centerX >= targetBounds.left && sourceBounds.centerX <= targetBounds.right &&
          sourceBounds.centerY >= targetBounds.top && sourceBounds.centerY <= targetBounds.bottom;
        return centerInside && overlapWidth * overlapHeight >= sourceArea * 0.55;
      }
      if (/^(?:on|onto|seated on|supports)$/.test(parts.relation)) {
        const gap = targetBounds.top - sourceBounds.bottom;
        const overlap = Math.min(sourceBounds.right, targetBounds.right) -
          Math.max(sourceBounds.left, targetBounds.left);
        return gap >= -0.025 && gap <= 0.018 && overlap >= Math.min(sourceBounds.width, targetBounds.width) * 0.08;
      }
      if (/^(?:hold|holds|holding|grasp|grasps|grasping|carry|carries|carrying|clutch|clutches|clutching)$/.test(parts.relation)) {
        return relationGraspContacts(sceneRenderPacket).some((row) => (
          row.constraintId === (obligation.obligationId || obligation.id) &&
          Number(row.endpointDistanceAfter) <= 0.015
        ));
      }
      return false;
    }

    function relationVisualObligationGeometryReceipt(obligation = {}, sceneRenderPacket = {}, renderData = null) {
      if (!visualRelationObligation(obligation)) return null;
      if (dynamicVisualRelationObligation(obligation)) {
        const rows = dynamicVisualRelationRows(obligation, sceneRenderPacket);
        return {
          schema: 'simulatte.phase7RelationGeometryProof.v1',
          relation: visualRelationParts(obligation)?.relation || '',
          dynamicEvidenceIds: rows.map((row) => row.id).filter(Boolean),
          satisfied: rows.length > 0,
        };
      }
      const parts = visualRelationParts(obligation);
      if (!parts || !renderData || !Array.isArray(renderData.objectParts)) return {
        schema: 'simulatte.phase7RelationGeometryProof.v1', status: 'missing-render-data',
      };
      const sourceIds = relationEntityIds(sceneRenderPacket, parts.sourceIdentity);
      const targetIds = relationEntityIds(sceneRenderPacket, parts.targetIdentity);
      const sourceBounds = relationObjectBounds(renderData, sourceIds);
      const targetBounds = relationObjectBounds(renderData, targetIds);
      return {
        schema: 'simulatte.phase7RelationGeometryProof.v1',
        relation: parts.relation,
        sourceEntityIds: Array.from(sourceIds),
        targetEntityIds: Array.from(targetIds),
        sourceBounds: compactRelationBounds(sourceBounds),
        targetBounds: compactRelationBounds(targetBounds),
        satisfied: relationVisualObligationGeometrySatisfied(obligation, sceneRenderPacket, renderData) === true,
      };
    }

    function compactRelationBounds(bounds = null) {
      if (!bounds) return null;
      return Object.fromEntries(['left', 'top', 'right', 'bottom', 'width', 'height', 'centerX', 'centerY']
        .map((key) => [key, Number(Number(bounds[key] || 0).toFixed(5))]));
    }

    function relationEntityIds(sceneRenderPacket = {}, identity = '') {
      return new Set((sceneRenderPacket.entities || []).filter((row) => (
        promptProofEntityMatches(row, identity)
      )).map((row) => row.id));
    }

    function relationObjectBounds(renderData = {}, entityIds = new Set()) {
      const bounds = relationObjectPartBounds(renderData, entityIds);
      if (!bounds.length) return null;
      const left = Math.min(...bounds.map((row) => row.left));
      const top = Math.min(...bounds.map((row) => row.top));
      const right = Math.max(...bounds.map((row) => row.right));
      const bottom = Math.max(...bounds.map((row) => row.bottom));
      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
        centerX: (left + right) * 0.5,
        centerY: (top + bottom) * 0.5,
      };
    }

    function relationObjectPartBounds(renderData = {}, entityIds = new Set()) {
      return (renderData.objectParts || []).filter((row) => entityIds.has(row.entityId))
        .map((row) => relationPartBounds(row, renderData.cameraState || {}));
    }

    function relationPartBounds(part = {}, camera = {}) {
      const zoom = Number(camera.zoom || 1);
      const focalDepth = Number(camera.focalDepth || 0.5);
      const depth = Number(part.depth || 0.5);
      const depthScale = 1 + (focalDepth - depth) * Number(camera.perspective || 0);
      const angle = Number(part.rotation || 0);
      const cosine = Math.abs(Math.cos(angle));
      const sine = Math.abs(Math.sin(angle));
      const width = Number(part.size && part.size[0] || 0) * depthScale * zoom;
      const height = Number(part.size && part.size[1] || 0) * depthScale * zoom;
      const halfWidth = (cosine * width + sine * height) * 0.5;
      const halfHeight = (sine * width + cosine * height) * 0.5;
      const motionMargin = Number(part.animationAmplitude || 0) * 0.5;
      const centerX = 0.5 + ((Number(part.center && part.center[0] || 0.5) * 2 - 1) * zoom +
        (focalDepth - depth) * Number(camera.tilt || 0)) * 0.5;
      const centerY = 0.5 + (Number(part.center && part.center[1] || 0.5) - 0.5) * zoom;
      return {
        left: centerX - halfWidth - motionMargin,
        top: centerY - halfHeight - motionMargin,
        right: centerX + halfWidth + motionMargin,
        bottom: centerY + halfHeight + motionMargin,
        centerX,
        centerY,
      };
    }

    function relationSurfaceContacts(sceneRenderPacket = {}) {
      return sceneRenderPacket.receipts && sceneRenderPacket.receipts.framing &&
        sceneRenderPacket.receipts.framing.surfaceContacts || [];
    }

    function relationGraspContacts(sceneRenderPacket = {}) {
      return sceneRenderPacket.receipts && sceneRenderPacket.receipts.framing &&
        sceneRenderPacket.receipts.framing.graspContacts || [];
    }

    return Object.freeze({
      dynamicVisualRelationObligation,
      relationVisualObligationGeometryReceipt,
      relationVisualObligationGeometrySatisfied,
      relationVisualObligationPacketSatisfied,
      visualRelationObligation,
    });
  }

  return Object.freeze({ createRelationProofApi });
});
