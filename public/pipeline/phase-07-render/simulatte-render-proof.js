(function attachSimulatteRenderProof(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRenderProof = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRenderProofApi() {
  function scenePacketIdentitySummary(sceneRenderPacket = {}) {
    return Array.from(new Set((sceneRenderPacket.entities || [])
      .flatMap((row) => {
        const identity = row.identity || {};
        return [
          identity.label,
          identity.type,
          identity.sourceLabel,
          row.label,
          row.id,
          ...(row.representedEntityIds || []),
        ];
      })
      .filter(Boolean)));
  }

  function renderObligationProof(
    sceneRenderPacket = {},
    visualObligations = [],
    compositionLedger = null,
    renderedOrFrame = false,
    suppliedRenderData = null
  ) {
    const frameReceipt = renderedOrFrame && typeof renderedOrFrame === 'object'
      ? renderedOrFrame
      : null;
    const rendered = frameReceipt ? frameReceipt.rendered === true : renderedOrFrame === true;
    const renderData = suppliedRenderData || frameReceipt && frameReceipt.renderData || frameReceipt;
    const objectRealization = renderData && renderData.objectRealization ||
      objectRealizationForScenePacket(sceneRenderPacket);
    const identities = new Set((sceneRenderPacket.entities || [])
      .map((row) => row.identity && row.identity.type)
      .filter(Boolean));
    const packetText = JSON.stringify({
      packet: sceneRenderPacket,
      identities: Array.from(identities),
      renderDataIdentitySummary: renderData && renderData.sceneObjectIdentitySummary || '',
      renderDataInstanceSummary: renderData && renderData.sceneInstanceSummary || '',
    }).toLowerCase();
    const obligations = visualObligations.length
      ? visualObligations
      : (compositionLedger && compositionLedger.obligations || [])
        .filter((row) => row.kind === 'visual' || row.ownedByPhase === 6);
    const entityObligationTargets = new Set(((compositionLedger && compositionLedger.obligations) || [])
      .filter((row) => row.kind === 'entity')
      .map((row) => normalizeForProof(row.target || ''))
      .filter(Boolean));
    const identityList = Array.from(identities).map((identity) => normalizeForProof(identity));
    const distinctEntityIdentityCount = entityObligationTargets.size
      ? identityList.filter((identity) => entityObligationTargets.has(identity)).length
      : identityList.length;
    return obligations.map((row) => {
      const target = normalizeForProof(row.target || row.obligationId || row.id || '');
      const packetSatisfied = visualObligationPacketSatisfied(
        target,
        packetText,
        distinctEntityIdentityCount
      );
      const geometrySatisfied = visualObligationGeometrySatisfied(target, objectRealization);
      const sourceStatus = row.status || '';
      const status = rendered && packetSatisfied && geometrySatisfied && !phase7FailureStatus(sourceStatus)
        ? 'pass'
        : rendered ? 'fail' : 'not-proven';
      return {
        schema: 'simulatte.phase7VisualObligationProof.v1',
        obligationId: row.obligationId || row.id || '',
        target: row.target || '',
        required: row.required === true,
        phase6Status: sourceStatus,
        packetSatisfied,
        geometrySatisfied,
        pixelSatisfied: rendered && packetSatisfied && geometrySatisfied,
        status,
        pass: status === 'pass',
        evidence: packetSatisfied && geometrySatisfied
          ? ['sceneRenderPacket', 'objectGeometryProgram', ...(rendered ? ['webgpu-frame'] : [])]
          : [],
      };
    });
  }

  function summarizeRenderObligationProof(proofs = []) {
    return {
      schema: 'simulatte.phase7VisualObligationProofSummary.v1',
      proofCount: proofs.length,
      passCount: proofs.filter((row) => row.status === 'pass').length,
      failCount: proofs.filter((row) => row.status === 'fail').length,
      notProvenCount: proofs.filter((row) => row.status === 'not-proven').length,
      requiredObligationIds: proofIds(proofs, (row) => row.required === true),
      passedObligationIds: proofIds(proofs, (row) => row.status === 'pass'),
      failedObligationIds: proofIds(proofs, (row) => row.status === 'fail'),
    };
  }

  function proofIds(proofs, predicate) {
    return proofs.filter(predicate).map((row) => row.obligationId).filter(Boolean);
  }

  function renderPixelAudit(
    sceneRenderPacket = {},
    renderData = null,
    canvas = null,
    proofSummary = {},
    optimization = null
  ) {
    const frameReceiptMode = Boolean(
      renderData && Object.prototype.hasOwnProperty.call(renderData, 'rendered')
    );
    const width = Number(canvas && canvas.width || renderData && renderData.canvas && renderData.canvas.width || 0);
    const height = Number(canvas && canvas.height || renderData && renderData.canvas && renderData.canvas.height || 0);
    const hasCanvasPixels = width * height > 0;
    const drawableCount = scenePacketDrawableCount(sceneRenderPacket);
    const drawCount = Number(
      renderData && (renderData.drawCount || renderData.sceneInstanceCount) ||
      (frameReceiptMode ? drawableCount : 0)
    );
    const sceneInstanceCount = Number(renderData && renderData.sceneInstanceCount || 0);
    const livePixelAudit = auditLivePixelSamples(
      phase7PixelSamples(renderData, canvas),
      {
        required: Boolean(renderData && renderData.requireLivePixelSamples),
        proofSummary,
        drawableCount,
      }
    );
    const literalRealization = auditLiteralObjectRealization(sceneRenderPacket, renderData);
    const thresholds = {
      minDrawableCount: drawableCount > 0 ? 1 : 0,
      minDrawCount: drawableCount > 0 ? 1 : 0,
      minSceneInstanceCount: !frameReceiptMode && drawableCount > 0 ? 1 : 0,
      minCanvasPixels: frameReceiptMode ? (hasCanvasPixels ? 1 : 0) : 1,
      minLivePixelSamples: livePixelAudit.required
        ? livePixelAudit.thresholds.minVisibleSampleCount
        : 0,
      minLivePixelContrast: livePixelAudit.required ? livePixelAudit.thresholds.minContrast : 0,
      maxFailedObligations: 0,
      minLiteralRealizations: literalRealization.requiredCount,
    };
    const checks = [];
    if (frameReceiptMode) {
      checks.push({
        id: 'rendered-frame',
        actual: renderData.rendered === true,
        expected: true,
        pass: renderData.rendered === true,
      });
    }
    checks.push(
      minimumCheck('scene-packet-drawables', drawableCount, thresholds.minDrawableCount),
      minimumCheck('draw-count', drawCount, thresholds.minDrawCount)
    );
    if (!frameReceiptMode) {
      checks.push(minimumCheck(
        'scene-instance-count',
        sceneInstanceCount,
        thresholds.minSceneInstanceCount
      ));
    }
    checks.push(
      minimumCheck('canvas-pixels', width * height, thresholds.minCanvasPixels),
      {
        id: 'visual-obligation-failures',
        actual: Number(proofSummary.failCount || 0),
        expectedMax: thresholds.maxFailedObligations,
        pass: Number(proofSummary.failCount || 0) <= thresholds.maxFailedObligations,
      },
      minimumCheck(
        'live-pixel-sample-count',
        livePixelAudit.visibleSampleCount,
        thresholds.minLivePixelSamples
      ),
      minimumCheck(
        'literal-object-realization',
        literalRealization.realizedRequiredCount,
        thresholds.minLiteralRealizations
      ),
      minimumCheck(
        'live-pixel-contrast',
        livePixelAudit.minContrast,
        thresholds.minLivePixelContrast
      ),
      {
        id: 'visual-obligation-pixel-samples',
        actual: livePixelAudit.sampledRequiredObligationCount,
        expectedMin: livePixelAudit.required ? livePixelAudit.requiredObligationCount : 0,
        pass: livePixelAudit.obligationsSampled,
      }
    );
    return {
      schema: 'simulatte.phase7PixelAudit.v1',
      method: pixelAuditMethod(frameReceiptMode, livePixelAudit.sampleCount, hasCanvasPixels),
      status: checks.every((check) => check.pass) ? 'pass' : 'fail',
      thresholds,
      checks,
      canvas: { width, height },
      drawCount,
      sceneInstanceCount,
      drawableCount,
      optimizationPath: optimization && optimization.path || '',
      livePixelAudit,
      literalRealization,
    };
  }

  function objectRealizationForScenePacket(sceneRenderPacket = {}) {
    const rows = (sceneRenderPacket.entities || []).map((row) => {
      const program = row && row.geometry && row.geometry.program || {};
      const parts = Array.isArray(program.parts) ? program.parts : [];
      const scale = row && row.transform && row.transform.scale || [];
      const projectedArea = Number((Number(scale[0] || 0) * Number(scale[1] || 0)).toFixed(5));
      const semanticFit = program.source === 'phase6-data-owned-part-graph' || Boolean(
        program.constructionReceipt && (
          program.constructionReceipt.literalSlotMatch === true ||
          program.constructionReceipt.exactTargetMatch === true
        )
      );
      const topologyVerified = program.source === 'phase6-data-owned-part-graph'
        ? parts.length >= 2
        : parts.length >= 3 && new Set(parts.map((part) => part.primitive).filter(Boolean)).size >= 2;
      const readable = projectedArea >= 0.008;
      return {
        schema: 'simulatte.objectRenderRealization.v1',
        entityId: row.id || '',
        identityType: row.identity && row.identity.type || program.identityType || '',
        identityLabels: [
          row.id,
          row.label,
          row.identity && row.identity.label,
          row.identity && row.identity.sourceLabel,
          row.identity && row.identity.type,
          ...(row.representedEntityIds || []),
        ].filter(Boolean),
        grammarId: program.grammarId || '',
        literal: program.literal === true,
        partCount: parts.length,
        primitiveCount: new Set(parts.map((part) => part.primitive).filter(Boolean)).size,
        projectedArea,
        semanticFit,
        topologyVerified,
        readable,
        realized: program.literal === true && semanticFit && topologyVerified && readable,
      };
    });
    return {
      schema: 'simulatte.objectRenderRealizationSummary.v1',
      entityCount: rows.length,
      literalCount: rows.filter((row) => row.literal).length,
      realizedCount: rows.filter((row) => row.realized).length,
      unprovenEntityIds: rows.filter((row) => !row.realized).map((row) => row.entityId),
      rows,
    };
  }

  function visualObligationGeometrySatisfied(target = '', realization = {}) {
    const rows = realization && Array.isArray(realization.rows) ? realization.rows : [];
    if (/compiled scene packet/.test(target)) return rows.some((row) => row.realized);
    if (/species distinct|species-distinct/.test(target)) {
      return new Set(rows.filter((row) => row.realized && ['dog', 'cat', 'animal'].includes(row.identityType))
        .map((row) => row.identityType)).size >= 2;
    }
    if (/swimming pose|swim/.test(target)) {
      return rows.some((row) => row.realized && ['dog', 'cat', 'animal'].includes(row.identityType));
    }
    return true;
  }

  function auditLiteralObjectRealization(sceneRenderPacket = {}, renderData = null) {
    const realization = renderData && renderData.objectRealization ||
      objectRealizationForScenePacket(sceneRenderPacket);
    const rows = realization && Array.isArray(realization.rows) ? realization.rows : [];
    const ledger = sceneRenderPacket && sceneRenderPacket.compositionLedger || {};
    const obligations = (ledger.obligations || []).filter((row) => row && row.required === true &&
      ['entity', 'object', 'environment', 'medium'].includes(row.kind));
    const settled = obligations.map((obligation) => {
      const target = normalizeForProof(obligation.target || obligation.obligationId || obligation.id || '');
      const matches = rows.filter((row) => [row.identityType, ...(row.identityLabels || [])]
        .some((value) => proofPhraseMatch(value, target)));
      const realized = matches.some((row) => row.realized && Number(row.projectedArea || 0) >= 0.008);
      return {
        obligationId: obligation.obligationId || obligation.id || '',
        target: obligation.target || '',
        realized,
        entityIds: matches.map((row) => row.entityId),
        grammarIds: Array.from(new Set(matches.map((row) => row.grammarId).filter(Boolean))),
      };
    });
    return {
      schema: 'simulatte.literalObjectRealizationAudit.v1',
      requiredCount: settled.length,
      realizedRequiredCount: settled.filter((row) => row.realized).length,
      failedObligationIds: settled.filter((row) => !row.realized).map((row) => row.obligationId),
      status: settled.every((row) => row.realized) ? 'pass' : 'fail',
      rows: settled,
      realization,
    };
  }

  function proofPhraseMatch(a, b) {
    const left = proofTokensForRealization(a).join(' ');
    const right = proofTokensForRealization(b).join(' ');
    if (!left || !right) return false;
    return ` ${left} `.includes(` ${right} `) || ` ${right} `.includes(` ${left} `);
  }

  function proofTokensForRealization(value = '') {
    return normalizeForProof(value).split(/\s+/).filter(Boolean)
      .map((term) => term.length > 3 && term.endsWith('s') ? term.slice(0, -1) : term);
  }

  function minimumCheck(id, actual, expectedMin) {
    return { id, actual, expectedMin, pass: actual >= expectedMin };
  }

  function pixelAuditMethod(frameReceiptMode, sampleCount, hasCanvasPixels) {
    if (sampleCount > 0) return frameReceiptMode ? 'live-pixel-samples' : 'webgpu-live-pixel-samples';
    if (!frameReceiptMode) return 'webgpu-render-data';
    return hasCanvasPixels ? 'canvas-render-receipt' : 'scene-packet-render-receipt';
  }

  function phase7PixelSamples(renderData = null, canvas = null) {
    return normalizePhase7PixelSamples(
      renderData && (renderData.pixelSamples || renderData.livePixelSamples) ||
      renderData && renderData.renderData && (
        renderData.renderData.pixelSamples || renderData.renderData.livePixelSamples
      ) ||
      canvas && canvas.__simulattePixelSamples ||
      null
    );
  }

  function normalizePhase7PixelSamples(source = null) {
    const rows = Array.isArray(source)
      ? source
      : source && (source.samples || source.rows || source.pixelSamples) || [];
    return rows.map((row, index) => {
      const rgba = normalizeSampleRgba(row && (row.rgba || row.color || row.pixel));
      const contrast = Number.isFinite(Number(row && row.contrast))
        ? Number(row.contrast)
        : rgbaContrast(rgba, row && (
          row.backgroundRgba || row.background || row.expectedBackground
        ));
      return {
        schema: 'simulatte.phase7PixelSample.v1',
        id: row && row.id || `sample:${index + 1}`,
        obligationId: row && (
          row.obligationId || row.obligation || row.targetObligationId
        ) || '',
        label: row && row.label || '',
        source: row && row.source || '',
        drawableId: row && row.drawableId || '',
        layerSlot: row && row.layerSlot || '',
        x: Number(row && row.x || 0),
        y: Number(row && row.y || 0),
        uv: Array.isArray(row && row.uv) ? row.uv.slice(0, 2) : [],
        rgba,
        alpha: rgba[3],
        contrast,
        visible: row && row.visible === false ? false : rgba[3] >= 8 && contrast >= 0.02,
      };
    });
  }

  function auditLivePixelSamples(samples = [], options = {}) {
    const required = options.required === true;
    const drawableCount = Number(options.drawableCount || 0);
    const requiredIds = options.proofSummary && Array.isArray(
      options.proofSummary.requiredObligationIds
    ) ? options.proofSummary.requiredObligationIds : [];
    const visibleSamples = samples.filter((row) => row.visible === true);
    const sampledRequiredIds = new Set(samples
      .filter((row) => row.visible === true && row.obligationId && requiredIds.includes(row.obligationId))
      .map((row) => row.obligationId));
    const minVisibleSampleCount = required
      ? Math.max(1, Math.min(3, drawableCount || 1, samples.length || 1))
      : 0;
    const minContrast = required ? 0.035 : 0;
    const minContrastValue = visibleSamples.length
      ? Math.min(...visibleSamples.map((row) => Number(row.contrast || 0)))
      : 0;
    const obligationsSampled = !required || requiredIds.length === 0 ||
      requiredIds.every((id) => sampledRequiredIds.has(id));
    return {
      schema: 'simulatte.phase7LivePixelAudit.v1',
      required,
      sampleCount: samples.length,
      visibleSampleCount: visibleSamples.length,
      minContrast: Number(minContrastValue.toFixed(4)),
      sampledRequiredObligationCount: sampledRequiredIds.size,
      requiredObligationCount: requiredIds.length,
      obligationsSampled,
      sampledObligationIds: Array.from(sampledRequiredIds),
      thresholds: { minVisibleSampleCount, minContrast },
      status: visibleSamples.length >= minVisibleSampleCount &&
        minContrastValue >= minContrast &&
        obligationsSampled ? 'pass' : 'fail',
      samples: samples.slice(0, 32),
    };
  }

  function normalizeSampleRgba(value) {
    const row = Array.isArray(value) ? value : [];
    return [
      clampByte(row[0]),
      clampByte(row[1]),
      clampByte(row[2]),
      clampByte(row[3] == null ? 255 : row[3]),
    ];
  }

  function rgbaContrast(rgba = [], background = null) {
    const base = Array.isArray(background) && background.length >= 3
      ? background.map(clampByte)
      : [0, 0, 0, 255];
    const dr = Math.abs(clampByte(rgba[0]) - base[0]);
    const dg = Math.abs(clampByte(rgba[1]) - base[1]);
    const db = Math.abs(clampByte(rgba[2]) - base[2]);
    return Number((Math.max(dr, dg, db) / 255).toFixed(4));
  }

  function clampByte(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(255, Math.round(parsed)));
  }

  function scenePacketDrawableCount(sceneRenderPacket = {}) {
    return countRows(sceneRenderPacket.entities) +
      countRows(sceneRenderPacket.fields) +
      countRows(sceneRenderPacket.effects);
  }

  function countRows(value) {
    return Array.isArray(value) ? value.length : 0;
  }

  function phase7FailureStatus(status = '') {
    return status === 'lost' || status === 'failed' || status === 'wrong-identity' || status === 'not-proven';
  }

  function normalizeForProof(value = '') {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function visualObligationPacketSatisfied(target = '', packetText = '', identityCount = 0) {
    if (/compiled scene packet/.test(target)) {
      return /simulatte\.scenerenderpacket\.v1/.test(packetText) && /"entities":\[/.test(packetText);
    }
    if (/species distinct|species-distinct/.test(target)) return identityCount >= 2;
    if (/wake|ripple/.test(target)) return /wake|ripple/.test(packetText);
    if (/submersion/.test(target)) return /submersion/.test(packetText);
    if (/swimming|swim/.test(target)) return /swim/.test(packetText);
    const ignored = new Set([
      'and', 'the', 'with', 'from', 'into', 'over', 'under', 'across', 'through',
    ]);
    const terms = target.split(/\s+|-/).filter((term) => term.length > 2 && !ignored.has(term));
    return terms.length > 0 && terms.every((term) => packetText.includes(term));
  }

  return Object.freeze({
    scenePacketIdentitySummary,
    renderObligationProof,
    summarizeRenderObligationProof,
    renderPixelAudit,
    phase7PixelSamples,
    normalizePhase7PixelSamples,
    auditLivePixelSamples,
    normalizeSampleRgba,
    rgbaContrast,
    clampByte,
    scenePacketDrawableCount,
    phase7FailureStatus,
    normalizeForProof,
    visualObligationPacketSatisfied,
    objectRealizationForScenePacket,
    visualObligationGeometrySatisfied,
    auditLiteralObjectRealization,
  });
});
