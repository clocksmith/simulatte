(function attachSimulatteObjectRealization(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteObjectRealization = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createObjectRealizationApi() {
  const OBJECT_GRAMMAR_PART_REQUIREMENTS = Object.freeze({
    dog: ['body', 'head', 'leg', 'tail'],
    cat: ['body', 'head', 'leg', 'tail'],
    animal: ['body', 'head', 'leg'],
    person: ['head', 'torso', 'arm', ['leg', 'thigh']],
    tree: ['trunk', 'branch', 'crown'],
    flower: ['stem', 'petal', 'center'],
    building: ['shell', 'roof', 'door', 'window'],
    table: ['top', 'leg'],
    chair: ['back', 'seat', 'leg'],
    television: ['frame', 'screen', 'stand'],
    robot: ['base', 'arm', 'joint', 'gripper'],
    conveyor: ['belt', 'roller'],
    parcel: ['carton', 'top', 'tape', 'label'],
    galaxy: ['halo', 'spiral', 'core'],
    mountain: ['peak', 'snow'],
    'server-rack': ['cabinet', 'server', 'status'],
    train: ['locomotive', 'car', 'wheel', 'rail'],
    'rail-signal': ['post', 'signal', 'base'],
    'railway-platform': ['platform', 'track', 'canopy', 'support'],
    'data-center': ['facility', 'rack', 'cooling', 'status'],
  });

  function objectRealizationForScenePacket(packet = {}, renderedParts = null) {
    const hasSubmissionEvidence = Array.isArray(renderedParts);
    const submittedParts = hasSubmissionEvidence ? renderedParts : [];
    const rows = packetRows(packet, 'entities').map((row) => {
      const program = row && row.geometry && row.geometry.program || {};
      const coverage = row && row.geometry && row.geometry.coverage || {};
      const parts = Array.isArray(program.parts) ? program.parts : [];
      const scale = row && row.transform && row.transform.scale || [];
      const projectedArea = Number(
        (Number(scale[0] || 0) * Number(scale[1] || 0)).toFixed(5)
      );
      const submittedEntityParts = submittedParts.filter((part) => part.entityId === row.id);
      const expectedPartIds = new Set(parts.map((part) => part.id).filter(Boolean));
      const submittedSemanticPartIds = new Set(
        submittedEntityParts.map((part) => part.constructionPartId).filter(Boolean)
      );
      const submittedSemanticPartCount = Array.from(expectedPartIds)
        .filter((partId) => submittedSemanticPartIds.has(partId)).length;
      const submitted = hasSubmissionEvidence &&
        parts.length > 0 &&
        submittedSemanticPartCount === parts.length;
      const topologyVerified = objectTopologyVerified(program);
      const semanticFit = objectSemanticFit(program);
      const readable = projectedArea >= 0.008;
      const morphologyQuality = objectMorphologyQuality(program, parts);
      const submittedContours = new Set(submittedEntityParts
        .map((part) => part.contourProfile || part.primitive).filter(Boolean));
      const submittedSurfaces = new Set(submittedEntityParts
        .map((part) => part.surfacePattern).filter(Boolean));
      const submittedFeatures = new Set(submittedEntityParts
        .map((part) => part.visualFeatureClass).filter((value) => value && value !== 'generic'));
      const submittedAccents = new Set(submittedEntityParts
        .map((part) => part.accentPattern).filter(Boolean));
      const morphologySubmitted = !hasSubmissionEvidence || (
        submittedContours.size >= Math.min(2, morphologyQuality.contourProfileCount) &&
        submittedSurfaces.size >= Math.min(1, morphologyQuality.surfacePatternCount) &&
        submittedAccents.size >= Math.min(1, morphologyQuality.accentPatternCount) &&
        submittedFeatures.size >= Math.min(1, morphologyQuality.distinctiveFeatureCount)
      );
      const geometryRealized = program.literal === true &&
        topologyVerified &&
        semanticFit &&
        readable;
      const perceptualReady = geometryRealized &&
        morphologyQuality.pass === true &&
        morphologySubmitted;
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
          program.constructionReceipt && program.constructionReceipt.targetEntryId,
          ...(row.representedEntityIds || []),
        ].filter(Boolean),
        grammarId: program.grammarId || '',
        renderArchetype: program.visualArchetype || program.identityType || '',
        literal: program.literal === true,
        partCount: parts.length,
        submittedPartCount: submittedEntityParts.length,
        submittedSemanticPartCount,
        submissionEvidence: hasSubmissionEvidence,
        submitted,
        primitiveCount: Number(coverage.primitiveCount || new Set(
          parts.map((part) => part.primitive).filter(Boolean)
        ).size),
        projectedArea,
        topologyVerified,
        semanticFit,
        readable,
        geometryRealized,
        morphologyQuality,
        morphologySubmitted,
        submittedContourProfileCount: submittedContours.size,
        submittedSurfacePatternCount: submittedSurfaces.size,
        submittedAccentPatternCount: submittedAccents.size,
        submittedDistinctiveFeatureCount: submittedFeatures.size,
        perceptualReady,
        realized: perceptualReady && (!hasSubmissionEvidence || submitted),
        constructionSource: Boolean(program.constructionReceipt),
        modelEvaluatedConstruction: program.constructionReceipt &&
          program.constructionReceipt.modelEvaluated === true,
        rerankEvaluatedConstruction: program.constructionReceipt &&
          program.constructionReceipt.rerankEvaluated === true,
      };
    });
    const framing = packet && packet.receipts && packet.receipts.framing || {};
    return {
      schema: 'simulatte.objectRenderRealizationSummary.v1',
      entityCount: rows.length,
      realizedCount: rows.filter((row) => row.realized).length,
      literalCount: rows.filter((row) => row.literal).length,
      constructionProgramCount: rows.filter((row) => row.constructionSource).length,
      modelEvaluatedConstructionCount: rows.filter((row) => row.modelEvaluatedConstruction).length,
      topologyVerifiedCount: rows.filter((row) => row.topologyVerified).length,
      semanticFitCount: rows.filter((row) => row.semanticFit).length,
      readableCount: rows.filter((row) => row.readable).length,
      morphologyReadyCount: rows.filter((row) => row.morphologyQuality.pass).length,
      perceptualReadyCount: rows.filter((row) => row.perceptualReady).length,
      submittedCount: rows.filter((row) => row.submitted).length,
      submissionEvidence: hasSubmissionEvidence,
      projectedArea: Number(rows.reduce((sum, row) => sum + row.projectedArea, 0).toFixed(5)),
      framingPass: framing.pass === true,
      framing,
      unprovenEntityIds: rows.filter((row) => !row.realized).map((row) => row.entityId),
      rows,
    };
  }

  function objectTopologyVerified(program = {}) {
    const parts = Array.isArray(program.parts) ? program.parts : [];
    const ids = parts.map((part) => String(part.id || '').toLowerCase());
    const grammar = String(program.grammarId || '')
      .replace(/^object-grammar\./, '')
      .replace(/-sitting$/, '');
    const required = OBJECT_GRAMMAR_PART_REQUIREMENTS[grammar];
    if (required) {
      return required.every((token) => (
        (Array.isArray(token) ? token : [token])
          .some((candidate) => ids.some((id) => id.includes(candidate)))
      ));
    }
    if (program.source === 'phase6-data-owned-part-graph') return parts.length >= 2;
    return Boolean(program.constructionReceipt) &&
      parts.length >= 3 &&
      new Set(parts.map((part) => part.primitive).filter(Boolean)).size >= 2;
  }

  function objectSemanticFit(program = {}) {
    if (
      program.source === 'phase6-data-owned-part-graph' &&
      /^(?:category-catalog|identity-catalog|prompt-specialized)$/
        .test(String(program.selectionRole || ''))
    ) {
      return true;
    }
    const receipt = program.constructionReceipt || {};
    return receipt.topologyTargetFit === true &&
      receipt.targetIdentityBound === true &&
      (receipt.modelEvaluated === true || receipt.literalSlotMatch === true);
  }

  function objectMorphologyQuality(program = {}, parts = []) {
    const receipt = program.morphologyReceipt || {};
    if (receipt.schema === 'simulatte.objectMorphologyReceipt.v1') {
      return {
        schema: receipt.schema,
        pass: receipt.pass === true,
        specificityScore: Number(receipt.specificityScore || 0),
        contourProfileCount: (receipt.contourProfiles || []).length,
        surfacePatternCount: (receipt.surfacePatterns || []).length,
        accentPatternCount: (receipt.accentPatterns || []).length,
        dynamicAccentPartCount: Number(receipt.dynamicAccentPartCount || 0),
        distinctiveFeatureCount: Number(receipt.distinctivePartCount || 0),
      };
    }
    const contours = new Set(parts.map((part) => part.contourProfile || part.primitive).filter(Boolean));
    const surfaces = new Set(parts.map((part) => part.surfacePattern).filter(Boolean));
    return {
      schema: 'simulatte.objectMorphologyReceipt.legacy.v1',
      pass: parts.length >= 2,
      specificityScore: parts.length >= 2 ? 0.5 : 0,
      contourProfileCount: contours.size,
      surfacePatternCount: surfaces.size,
      accentPatternCount: 0,
      dynamicAccentPartCount: 0,
      distinctiveFeatureCount: parts.length,
    };
  }

  function packetRows(packet, key) {
    return packet && Array.isArray(packet[key]) ? packet[key] : [];
  }

  return Object.freeze({
    OBJECT_GRAMMAR_PART_REQUIREMENTS,
    objectRealizationForScenePacket,
    objectTopologyVerified,
    objectSemanticFit,
    objectMorphologyQuality,
  });
});
