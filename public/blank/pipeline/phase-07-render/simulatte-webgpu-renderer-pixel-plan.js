(function attachSimulatteWebGpuRendererPixelPlan(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('webGpuRenderer');
    const PHASE7_COLOR_PROPERTY_SAMPLE_LIMIT = 4;

    function phase7ProjectedObjectPartPoints(renderData = {}, obligation = {}, time = 0) {
      const target = scope.normalizeForProof(obligation.targetIdentity || obligation.target || '');
      const entityId = String(obligation.targetEntityId || '');
      const role = scope.normalizeForProof(obligation.expectedPartRole || '');
      let candidates = (renderData.objectParts || []).filter((part) => {
        const entityMatches = entityId
          ? String(part.entityId || '') === entityId || String(part.entityId || '').startsWith(`${entityId}:instance:`)
          : true;
        const identityMatches = target ? (
          scope.normalizeForProof(part.id).includes(target) ||
          scope.normalizeForProof(part.identityType).includes(target)
        ) : true;
        const roleMatches = role ? scope.normalizeForProof(part.constructionRole) === role : true;
        return entityMatches && identityMatches && roleMatches;
      });
      const expectedColor = phase7ExpectedColor(obligation.expectedValue);
      if (expectedColor) {
        const colorBound = candidates.filter((part) => phase7PartColorDistance(part.fill, expectedColor) <= 0.08);
        if (colorBound.length) candidates = colorBound;
      }
      candidates.sort((a, b) => (
        Number(b.size && b.size[0] || 0) * Number(b.size && b.size[1] || 0) -
        Number(a.size && a.size[0] || 0) * Number(a.size && a.size[1] || 0) ||
        Number(a.depth || 0.5) - Number(b.depth || 0.5) ||
        Number(a.constructionRoleIndex || 0) - Number(b.constructionRoleIndex || 0)
      ));
      return candidates.map((part) => ({ ...phase7ProjectedPartPoint(part, renderData.cameraState, time), part }));
    }

    function phase7ExpectedColor(value = '') {
      const match = String(value || '').match(/^#([a-f0-9]{6})$/i);
      if (!match) return null;
      return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255);
    }

    function phase7PartColorDistance(value = [], expected = []) {
      if (!Array.isArray(value) || value.length < 3 || !Array.isArray(expected) || expected.length < 3) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.sqrt(value.slice(0, 3).reduce((sum, channel, index) => (
        sum + (Number(channel || 0) - Number(expected[index] || 0)) ** 2
      ), 0));
    }

    function phase7ProjectedObjectPartPoint(renderData = {}, obligation = {}, time = 0) {
      return phase7ProjectedObjectPartPoints(renderData, obligation, time)[0] || null;
    }

    function phase7ProjectedPartPoint(part = {}, camera = {}, time = 0) {
      const zoom = Number(camera.zoom || 1);
      const depth = Number(part.depth || 0.5);
      let x = (Number(part.center && part.center[0] || 0.5) * 2 - 1) * zoom;
      let y = (1 - Number(part.center && part.center[1] || 0.5) * 2) * zoom;
      if (part.primitive === 'ring') {
        const angle = Number(part.rotation || 0);
        const depthScale = 1 + (Number(camera.focalDepth || 0.5) - depth) * Number(camera.perspective || 0);
        const offset = Number(part.size && part.size[0] || 0) * 0.68 * depthScale * zoom;
        x += Math.cos(angle) * offset;
        y += Math.sin(angle) * offset;
      }
      x += (Number(camera.focalDepth || 0.5) - depth) * Number(camera.tilt || 0);
      const phase = Number(part.animationPhase || 0) * 6.28318;
      const motion = Number(part.animationCode || 0);
      const amplitude = Number(part.animationAmplitude || 0);
      const motionTime = time * Number(part.animationSpeed || 0);
      if (motion > 0.75 && amplitude > 0 && Number(part.animationSpeed || 0) > 0) {
        if (motion < 1.5) { x += Math.sin(motionTime * 1.4 + phase) * amplitude; y += Math.cos(motionTime * 2.1 + phase) * amplitude * 0.4; }
        else if (motion < 2.5) { x += Math.sin(motionTime * 0.9 + phase) * amplitude; y += Math.cos(motionTime * 1.3 + phase) * amplitude * 0.4; }
        else if (motion < 3.5) { x += Math.sin(motionTime * 1.6 + phase) * amplitude; y += Math.cos(motionTime * 1.1 + phase) * amplitude * 0.44; }
        else if (motion < 4.5) y += Math.sin(motionTime * 1.2 + phase) * amplitude * 0.3;
        else if (motion < 5.5) x += (((motionTime * 0.35 + Number(part.animationPhase || 0)) % 1) * 2 - 1) * amplitude;
        else if (motion < 6.5) y += Math.sin(motionTime * 0.72 + phase) * amplitude;
        else if (motion < 7.5) { x += Math.sin(motionTime * 0.74 + phase) * amplitude * 0.42; y += Math.sin(motionTime * 1.05 + phase) * amplitude; }
        else if (motion < 8.5) { x += Math.cos(motionTime * 0.42 + phase) * amplitude; y += Math.sin(motionTime * 0.42 + phase) * amplitude; }
        else if (motion < 9.5) { x += Math.sin(motionTime * 1.2 + phase) * amplitude; y += Math.cos(motionTime * 1.6 + phase) * amplitude * 0.65; }
        else if (motion < 10.5) { x += Math.cos(motionTime * 0.72 + phase) * amplitude; y += Math.sin(motionTime * 1.14 + phase) * amplitude * 0.34; }
        else y += Math.sin(motionTime * 0.5 + phase) * amplitude * 0.25;
      }
      if (Math.abs(Number(part.semanticCode || 0) - 16) < 0.5) x += Math.sin(time * 0.7 + phase) * 0.012;
      if (Math.abs(Number(part.semanticCode || 0) - 23) < 0.5) {
        x += Math.cos(time * 0.38 + phase) * 0.022;
        y += Math.sin(time * 0.38 + phase) * 0.022;
      }
      return { x: scope.clamp01((x + 1) * 0.5), y: scope.clamp01((1 - y) * 0.5) };
    }

    function phase7PixelReadbackPlan(renderData = null, sceneRenderPacket = {}, renderExecutionInput = null, canvas = null) {
      if (!renderData || renderData.requireLivePixelSamples !== true) return null;
      if (renderData.livePixelReadbackFailed === true) return null;
      const suppliedBinding = scope.phase7PixelSampleSetValidation(
        sceneRenderPacket,
        renderData,
        renderData.pixelSamples || null
      );
      if (suppliedBinding.valid) return null;
      const liveBinding = scope.phase7PixelSampleSetValidation(
        sceneRenderPacket,
        renderData,
        renderData.livePixelSamples || null
      );
      const hasCurrentSamples = liveBinding.valid;
      if (hasCurrentSamples && renderData.livePixelSamplesStatus === 'pass') return null;
      if (hasCurrentSamples && Number(renderData.livePixelReadbackAttemptCount || 0) >= 3) return null;
      const width = Number(canvas && canvas.width || 0);
      const height = Number(canvas && canvas.height || 0);
      if (!width || !height) return null;
      const obligations = phase7RequiredVisualObligations(renderExecutionInput, sceneRenderPacket);
      if (!obligations.length) return null;
      const requiredSampleCount = obligations.reduce((total, obligation) => (
        total + phase7ObligationPixelSampleCount(obligation, renderData)
      ), 0);
      if (requiredSampleCount > scope.PHASE7_PIXEL_READBACK_SAMPLE_LIMIT) {
        return phase7UnrenderablePixelPlan(
          renderData,
          width,
          height,
          obligations,
          requiredSampleCount,
          'sample-capacity-exceeded'
        );
      }
      const drawables = Array.isArray(renderData.drawables) && renderData.drawables.length
        ? renderData.drawables
        : scope.scenePacketUniformDrawables(sceneRenderPacket, renderData.sceneKind || '');
      const samples = [];
      const unmatchedObligationIds = [];
      for (const obligation of obligations) {
        const expectedSamples = phase7ObligationPixelSampleCount(obligation, renderData);
        const before = samples.length;
        if (obligation.constraintKind === 'environment' || obligation.targetIdentity === 'sunset') {
          samples.push(scope.pixelSampleForEnvironmentObligation(obligation, width, height));
        } else if (obligation.constraintKind === 'absence' || (
          obligation.constraintKind === 'count' && Number(obligation.expectedCount) === 0
        )) {
          // RGBA readback cannot identify an absent semantic target; leave it unproven.
        } else {
          appendPixelSamplesForObligation(
            samples,
            drawables,
            renderData,
            obligation,
            expectedSamples,
            width,
            height
          );
        }
        if (samples.length - before < expectedSamples) {
          unmatchedObligationIds.push(obligation.obligationId || obligation.id || 'unknown');
        }
      }
      if (!samples.length && obligations.some(phase7SemanticAbsenceObligation)) {
        samples.push(phase7SemanticAbsenceFrameBindingSample(width, height));
      }
      return {
        schema: 'simulatte.phase7PixelReadbackPlan.v1',
        status: samples.length ? 'ready' : 'unresolved-obligations',
        packetKey: renderData.packetKey,
        canvas: { width, height },
        requiredObligationCount: obligations.length,
        requiredSampleCount,
        sampleCount: samples.length,
        unmatchedObligationIds,
        samples,
      };
    }

    function appendPixelSamplesForObligation(
      samples,
      drawables,
      renderData,
      obligation,
      expectedSamples,
      width,
      height
    ) {
      if (phase7VisualRelationObligation(obligation)) {
        appendRelationPixelSamples(samples, drawables, renderData, obligation, expectedSamples, width, height);
        return;
      }
      const matched = drawablesForPixelObligation(drawables, obligation).slice(0, expectedSamples);
      if (phase7ExpectedColor(obligation.expectedValue)) {
        const drawable = matched[0];
        const projectedParts = uniqueProjectedConstructionParts(phase7ProjectedObjectPartPoints(
          renderData,
          { ...obligation, targetEntityId: drawable && drawable.id || obligation.targetEntityId },
          Number(renderData.pixelReadbackTimeMs || 0) * 0.001
        )).slice(0, expectedSamples);
        for (const projected of projectedParts) {
          const sample = drawable && scope.pixelSampleForDrawable(
            drawable,
            obligation,
            width,
            height,
            samples.length,
            drawables.length
          );
          if (!sample) continue;
          applyProjectedPixelSample(sample, projected, width, height, obligation);
          samples.push(sample);
        }
        return;
      }
      if (obligation.constraintKind === 'construction-part') {
        const projectedParts = uniqueProjectedConstructionParts(phase7ProjectedObjectPartPoints(
          renderData,
          obligation,
          Number(renderData.pixelReadbackTimeMs || 0) * 0.001
        )).slice(0, expectedSamples);
        const drawable = matched[0];
        for (const projected of projectedParts) {
          const sample = drawable && scope.pixelSampleForDrawable(
            drawable,
            obligation,
            width,
            height,
            samples.length,
            drawables.length
          );
          if (!sample) continue;
          applyProjectedPixelSample(sample, projected, width, height, obligation);
          samples.push(sample);
        }
        return;
      }
      for (const drawable of matched) {
        const sample = scope.pixelSampleForDrawable(
          drawable,
          obligation,
          width,
          height,
          samples.length,
          drawables.length
        );
        const projected = phase7ProjectedObjectPartPoint(
          renderData,
          { ...obligation, targetEntityId: drawable.id || obligation.targetEntityId },
          Number(renderData.pixelReadbackTimeMs || 0) * 0.001
        );
        if (sample && projected) applyProjectedPixelSample(sample, projected, width, height, obligation);
        if (sample) samples.push(sample);
      }
    }

    function uniqueProjectedConstructionParts(rows = []) {
      const seen = new Set();
      return rows.filter((row) => {
        const key = String(row.part?.constructionPartId || row.part?.id || '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function phase7UnrenderablePixelPlan(
      renderData,
      width,
      height,
      obligations,
      requiredSampleCount,
      status
    ) {
      return {
        schema: 'simulatte.phase7PixelReadbackPlan.v1',
        status,
        packetKey: renderData.packetKey,
        canvas: { width, height },
        requiredObligationCount: obligations.length,
        requiredSampleCount,
        sampleCount: 0,
        unmatchedObligationIds: obligations.map((row) => row.obligationId || row.id || 'unknown'),
        samples: [],
      };
    }

    function applyProjectedPixelSample(sample, projected, width, height, obligation = {}) {
      sample.x = scope.clampInt(Math.round(projected.x * (width - 1)), 0, width - 1);
      sample.y = scope.clampInt(Math.round(projected.y * (height - 1)), 0, height - 1);
      sample.uv = [Number(projected.x.toFixed(5)), Number(projected.y.toFixed(5))];
      sample.constructionRole = projected.part && projected.part.constructionRole || '';
      sample.constructionPartId = projected.part && projected.part.constructionPartId || '';
      sample.expectedSampleCount = phase7ObligationPixelSampleCount(obligation);
    }

    function phase7RequiredVisualObligationIds(renderExecutionInput = null, sceneRenderPacket = {}) {
      return phase7RequiredVisualObligations(renderExecutionInput, sceneRenderPacket)
        .map((row) => row.obligationId || row.id || '')
        .filter(Boolean);
    }

    function phase7RequiredVisualObligations(renderExecutionInput = null, sceneRenderPacket = {}) {
      const direct = renderExecutionInput && Array.isArray(renderExecutionInput.visualObligations)
        ? renderExecutionInput.visualObligations
        : [];
      const ledger = renderExecutionInput && renderExecutionInput.compositionLedger ||
        sceneRenderPacket && sceneRenderPacket.compositionLedger ||
        null;
      const ledgerRows = ledger && Array.isArray(ledger.obligations) ? ledger.obligations : [];
      const directIds = new Set(direct.map((row) => row && (row.obligationId || row.id)).filter(Boolean));
      const seenIds = new Set();
      return [
        ...direct,
        ...ledgerRows.filter((row) => !directIds.has(row && (row.obligationId || row.id))),
      ].filter((row) => {
        const id = row && (row.obligationId || row.id) || '';
        return row && row.required === true && (directIds.has(id) || (
          row.kind === 'visual' ||
          row.kind === 'entity' ||
          row.kind === 'object' ||
          row.kind === 'environment' ||
          row.kind === 'medium' ||
          phase7VisualRelationObligation(row) ||
          row.ownedByPhase === 6 ||
          /^visual:/.test(id)
        ));
      }).filter((row) => {
        const id = row && (row.obligationId || row.id) || '';
        if (!id || seenIds.has(id)) return !id;
        seenIds.add(id);
        return true;
      });
    }

    function phase7ObligationPixelSampleCount(obligation = {}, renderData = null) {
      if (phase7SemanticAbsenceObligation(obligation)) return 0;
      if (phase7ExpectedColor(obligation.expectedValue)) {
        const candidateCount = phase7ProjectedObjectPartPoints(
          renderData || {}, obligation, Number(renderData && renderData.pixelReadbackTimeMs || 0) * 0.001
        ).length;
        return Math.max(1, Math.min(PHASE7_COLOR_PROPERTY_SAMPLE_LIMIT, candidateCount || 1));
      }
      return phase7VisualRelationObligation(obligation)
        ? phase7DynamicRelationObligation(obligation) ? 1 : 2
        : Math.max(1, Number(obligation.expectedCount || 1));
    }

    function phase7SemanticAbsenceObligation(obligation = {}) {
      return obligation.constraintKind === 'absence' || (
        obligation.constraintKind === 'count' && Number(obligation.expectedCount) === 0
      );
    }

    function phase7SemanticAbsenceFrameBindingSample(width, height) {
      const x = Math.max(0, Math.floor(width / 2));
      const y = Math.max(0, Math.floor(height / 2));
      return {
        schema: 'simulatte.phase7PixelReadbackSample.v1',
        id: 'gpu:semantic-absence-frame-binding:1',
        obligationId: '',
        label: 'semantic absence frame binding',
        source: 'phase7-semantic-absence-detector-frame-binding',
        drawableId: '',
        x,
        y,
        uv: [Number((x / Math.max(1, width - 1)).toFixed(5)), Number((y / Math.max(1, height - 1)).toFixed(5))],
      };
    }

    function phase7VisualRelationObligation(obligation = {}) {
      const id = String(obligation.obligationId || obligation.id || '');
      return obligation.required === true && obligation.kind === 'relation' && (
        /^relation:spatial:/.test(id) ||
        /^relation:[^:]+:(?:hold|holds|holding|grasp|grasps|grasping|carry|carries|carrying|clutch|clutches|clutching):/.test(id) ||
        phase7DynamicRelationEvidenceIds(obligation).length > 0
      );
    }

    function phase7DynamicRelationEvidenceIds(obligation = {}) {
      return Array.from(new Set((obligation.visualEvidence || [])
        .map((value) => String(value || '').match(/^phase6:(?:process|field):(.+)$/))
        .filter(Boolean)
        .map((match) => scope.normalizeForProof(match[1]))));
    }

    function phase7DynamicRelationObligation(obligation = {}) {
      return obligation.required === true && obligation.kind === 'relation' &&
        phase7DynamicRelationEvidenceIds(obligation).length > 0;
    }

    function phase7VisualRelationIdentities(obligation = {}) {
      const id = String(obligation.obligationId || obligation.id || '');
      const match = id.match(/:(?:entity|environment|medium)-([^:]+):[^:]+:(?:entity|environment|medium)-([^:]+)$/);
      return match ? [scope.normalizeForProof(match[1]), scope.normalizeForProof(match[2])] : [];
    }

    function appendRelationPixelSamples(samples, drawables, renderData, obligation, expectedSamples, width, height) {
      const initialSampleCount = samples.length;
      const dynamicEvidenceIds = phase7DynamicRelationEvidenceIds(obligation);
      if (dynamicEvidenceIds.length) {
        const sampledDrawableIds = new Set();
        for (const evidenceId of dynamicEvidenceIds) {
          const drawable = drawables.find((row) => pixelDrawableMatchesEvidenceId(row, evidenceId));
          if (!drawable || sampledDrawableIds.has(drawable.id)) continue;
          sampledDrawableIds.add(drawable.id);
          const sample = scope.pixelSampleForDrawable(
            drawable,
            obligation,
            width,
            height,
            samples.length,
            drawables.length
          );
          if (sample) samples.push(sample);
          if (samples.length - initialSampleCount >= expectedSamples) break;
        }
        return;
      }
      for (const identity of phase7VisualRelationIdentities(obligation)) {
        const drawable = drawables.find((row) => pixelDrawableMatchesIdentity(row, identity));
        if (!drawable) continue;
        const sample = scope.pixelSampleForDrawable(
          drawable,
          obligation,
          width,
          height,
          samples.length,
          drawables.length
        );
        const projected = phase7ProjectedObjectPartPoint(
          renderData,
          { ...obligation, targetEntityId: drawable.id || '', targetIdentity: identity },
          Number(renderData.pixelReadbackTimeMs || 0) * 0.001
        );
        if (sample && projected) applyProjectedPixelSample(sample, projected, width, height, obligation);
        if (sample) samples.push(sample);
        if (samples.length - initialSampleCount >= expectedSamples) break;
      }
    }

    function pixelDrawableMatchesIdentity(row = {}, identity = '') {
      const values = [
        row.id,
        row.label,
        row.identity && row.identity.type,
        row.identity && row.identity.label,
        row.identity && row.identity.sourceLabel,
        ...(row.representedEntityIds || []),
      ].map(scope.normalizeForProof).filter(Boolean);
      return values.some((value) => value === identity || value.includes(identity) || identity.includes(value));
    }

    function pixelDrawableMatchesEvidenceId(row = {}, evidenceId = '') {
      const expected = scope.normalizeForProof(evidenceId);
      return [row.id, row.sourceGraphId]
        .map(scope.normalizeForProof)
        .filter(Boolean)
        .some((value) => value === expected);
    }

    function drawablesForPixelObligation(drawables = [], obligation = {}) {
      const obligationText = scope.normalizeForProof([
        obligation.obligationId,
        obligation.id,
        obligation.target,
        obligation.description,
      ].filter(Boolean).join(' '));
      return drawables.map((row, index) => ({
        row,
        index,
        score: pixelObligationDrawableScore(row, obligationText, obligation),
      })).filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((entry) => entry.row);
    }

    function pixelObligationDrawableScore(row = {}, obligationText = '', obligation = {}) {
      const targetEntityId = scope.normalizeForProof(obligation.targetEntityId || '');
      const targetIdentity = scope.normalizeForProof(obligation.targetIdentity || obligation.target || '');
      const rowId = scope.normalizeForProof(row.id || '');
      const representedIds = (row.representedEntityIds || []).map(scope.normalizeForProof);
      const actionOwnerIds = obligation.sourceKind === 'action'
        ? Array.from(new Set([...(obligation.evidence || []), ...(obligation.visualEvidence || [])]
          .map((value) => String(value || '').match(/^phase6:entity:(.+)$/))
          .filter(Boolean).map((match) => scope.normalizeForProof(match[1]))))
        : [];
      const actionOwnerMatch = actionOwnerIds.some((id) => (
        rowId === id || rowId.startsWith(`${id} instance`) || representedIds.includes(id)
      ));
      if (actionOwnerIds.length && !actionOwnerMatch) return 0;
      const identityValues = [
        row.label,
        row.identity && row.identity.label,
        row.identity && row.identity.sourceLabel,
        row.identity && row.identity.type,
        ...representedIds,
      ].map(scope.normalizeForProof).filter(Boolean);
      const rowText = scope.normalizeForProof(JSON.stringify({
        id: row.id,
        label: row.label,
        layerSlot: row.layerSlot,
        packetKind: row.packetKind,
        sourceGraphId: row.sourceGraphId,
        identity: row.identity,
        geometry: row.geometry,
        domain: row.domain,
        animation: row.animation,
        material: row.material,
        renderCodes: row.renderCodes,
      }));
      let score = 0;
      if (actionOwnerMatch) score += 120;
      if (targetEntityId && rowId === targetEntityId) score += 100;
      if (targetEntityId && representedIds.includes(targetEntityId)) score += 60;
      if (targetIdentity && rowId === targetIdentity) score += 40;
      if (targetIdentity && identityValues.includes(targetIdentity)) score += 80;
      if (/species distinct|species distinct silhouettes/.test(obligationText)) {
        if (/\bdog\b/.test(rowText)) score += 12;
        if (/\bcat\b/.test(rowText)) score += 12;
        if (/biological agent/.test(rowText)) score += 3;
      }
      if (/swimming pose|swim/.test(obligationText)) {
        if (/swim cycle|swimming agent|swim pose/.test(rowText)) score += 12;
        if (/biological agent/.test(rowText)) score += 2;
      }
      if (/wake|ripple/.test(obligationText)) {
        if (/wake|ripple|flow field/.test(rowText)) score += 12;
        if (/water volume/.test(rowText)) score += 2;
      }
      if (/partial submersion|submersion|waterline/.test(obligationText)) {
        if (/submersion|waterline/.test(rowText)) score += 12;
        if (/biological agent|water volume/.test(rowText)) score += 2;
      }
      const terms = obligationText.split(/\s+/).filter((term) => term.length > 3);
      for (const term of terms) {
        if (rowText.includes(term)) score += 1;
      }
      if (row.packetKind === 'entity') score += 0.2;
      return score;
    }

    root.SimulattePhaseModuleRegistry.define('webGpuRenderer', 'simulatte-webgpu-renderer-pixel-plan.js', {
      phase7ProjectedObjectPartPoints,
      phase7ProjectedObjectPartPoint,
      phase7PixelReadbackPlan,
      phase7RequiredVisualObligationIds,
      phase7RequiredVisualObligations,
      phase7ObligationPixelSampleCount,
      phase7VisualRelationObligation,
      phase7VisualRelationIdentities,
      drawablesForPixelObligation,
      pixelObligationDrawableScore,
    });

})(typeof globalThis !== 'undefined' ? globalThis : window);
