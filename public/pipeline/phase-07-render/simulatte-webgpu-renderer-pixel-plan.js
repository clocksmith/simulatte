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
      if (part.primitive === 'ring') {
        const angle = Number(part.rotation || 0);
        const depthScale = 1 + (Number(camera.focalDepth || 0.5) - depth) * Number(camera.perspective || 0);
        const offset = Number(part.size && part.size[0] || 0) * 0.68 * depthScale * zoom;
        x += Math.cos(angle) * offset;
        y += Math.sin(angle) * offset;
      }
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

    function phase7PixelReadbackPlan(renderData = null, sceneRenderPacket = {}, renderExecutionInput = null, canvas = null) {
      if (!renderData || renderData.requireLivePixelSamples !== true) return null;
      if (renderData.pixelSamples || renderData.livePixelReadbackFailed === true) return null;
      const hasCurrentSamples = renderData.livePixelSamples &&
        renderData.livePixelSamples.packetKey === renderData.packetKey;
      if (hasCurrentSamples && renderData.livePixelSamplesStatus === 'pass') return null;
      if (hasCurrentSamples && Number(renderData.livePixelReadbackAttemptCount || 0) >= 3) return null;
      const width = Number(canvas && canvas.width || 0);
      const height = Number(canvas && canvas.height || 0);
      if (!width || !height) return null;
      const obligations = phase7RequiredVisualObligations(renderExecutionInput, sceneRenderPacket);
      if (!obligations.length) return null;
      const requiredSampleCount = obligations.reduce((total, obligation) => (
        total + Math.max(1, Number(obligation.expectedCount || 1))
      ), 0);
      if (requiredSampleCount > PHASE7_PIXEL_READBACK_SAMPLE_LIMIT) {
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
        : scenePacketUniformDrawables(sceneRenderPacket, renderData.sceneKind || '')
          .slice(0, GPU_SCENE_INSTANCE_CAPACITY);
      const samples = [];
      const unmatchedObligationIds = [];
      for (const obligation of obligations) {
        const expectedSamples = Math.max(1, Number(obligation.expectedCount || 1));
        const before = samples.length;
        if (obligation.constraintKind === 'environment' || obligation.targetIdentity === 'sunset') {
          samples.push(pixelSampleForEnvironmentObligation(obligation, width, height));
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
      const matched = drawablesForPixelObligation(drawables, obligation).slice(0, expectedSamples);
      if (obligation.constraintKind === 'construction-part') {
        const projectedParts = phase7ProjectedObjectPartPoints(
          renderData,
          obligation,
          Number(renderData.pixelReadbackTimeMs || 0) * 0.001
        ).slice(0, expectedSamples);
        const drawable = matched[0];
        for (const projected of projectedParts) {
          const sample = drawable && pixelSampleForDrawable(
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
        const sample = pixelSampleForDrawable(
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
      sample.x = clampInt(Math.round(projected.x * (width - 1)), 0, width - 1);
      sample.y = clampInt(Math.round(projected.y * (height - 1)), 0, height - 1);
      sample.uv = [Number(projected.x.toFixed(5)), Number(projected.y.toFixed(5))];
      sample.constructionRole = projected.part && projected.part.constructionRole || '';
      sample.constructionPartId = projected.part && projected.part.constructionPartId || '';
      sample.expectedSampleCount = Number(obligation.expectedCount || 1);
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
          row.ownedByPhase === 6 ||
          /^visual:/.test(id)
        ));
      });
    }

    function drawablesForPixelObligation(drawables = [], obligation = {}) {
      const obligationText = normalizeForProof([
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
      const targetEntityId = normalizeForProof(obligation.targetEntityId || '');
      const targetIdentity = normalizeForProof(obligation.targetIdentity || obligation.target || '');
      const rowId = normalizeForProof(row.id || '');
      const representedIds = (row.representedEntityIds || []).map(normalizeForProof);
      const identityValues = [
        row.label,
        row.identity && row.identity.label,
        row.identity && row.identity.sourceLabel,
        row.identity && row.identity.type,
        ...representedIds,
      ].map(normalizeForProof).filter(Boolean);
      const rowText = normalizeForProof(JSON.stringify({
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

    Object.assign(scope, {
      phase7ProjectedObjectPartPoints,
      phase7ProjectedObjectPartPoint,
      phase7PixelReadbackPlan,
      phase7RequiredVisualObligationIds,
      phase7RequiredVisualObligations,
      drawablesForPixelObligation,
      pixelObligationDrawableScore,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
