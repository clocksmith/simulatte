(function attachSimulattePhysicsModelPhase3Ledger(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('physicsModel');

  if (typeof scope.phaseCarryObject !== 'function' || typeof scope.normalizeForEvidence !== 'function') {
    throw new Error('Phase 3 ledger requires activation-fusion carry and normalization helpers');
  }

  function phase3SlotEvidenceStatus(slot = {}, acceptedCandidates = [], supportOnlyCandidates = []) {
    if (slot.slotRole === 'visual') return 'pending';
    if (acceptedCandidates.length > 0) {
      return slot.slotRole === 'medium' && slot.inferred === true ? 'expanded' : 'preserved';
    }
    if (supportOnlyCandidates.length > 0) return 'pending';
    return slot.required === false ? 'unsupported' : 'lost';
  }

  function phase3CandidateType(row = {}) {
    if (row.cardId || row.visualHints || row.shapeHints) return 'surface-card';
    if (row.canonicalId || row.conceptId) return 'universe-row';
    if (row.operatorType || row.operatorTypes) return 'operator';
    return 'primitive';
  }

  function phase3AcceptedCandidatesBySlot(slotEvidence = []) {
    return Object.fromEntries((slotEvidence || [])
      .filter((slot) => (slot.acceptedCandidates || []).length > 0)
      .map((slot) => [
        slot.slotId,
        (slot.acceptedCandidates || []).slice(),
      ]));
  }

  function phase3SupportOnlyCandidates(primitiveCuration = {}, slotEvidence = []) {
    return scope.uniqueById([
      ...(primitiveCuration.supportPrimitives || []).map((row) => scope.phase3EvidenceBucketRow(row)),
      ...(slotEvidence || []).flatMap((slot) => (slot.candidates || [])
        .filter((candidate) => candidate.supportOnly === true)
        .map((candidate) => ({
          id: candidate.candidateId,
          label: candidate.candidateText,
          slotId: slot.slotId,
          slotRole: slot.slotRole,
          supportOnly: true,
          reason: candidate.reason,
        }))),
    ]);
  }

  function phase3RejectedGenericCandidates(primitiveCuration = {}, typedEvidenceBuckets = {}) {
    const buckets = typedEvidenceBuckets.buckets || {};
    return scope.uniqueById([
      ...(primitiveCuration.rejectedSupportPrimitives || [])
        .filter(scope.phase3SupportRowIsGeneric)
        .map((row) => scope.phase3EvidenceBucketRow(row)),
      ...(buckets.rejectedGenericEvidence || []),
    ]);
  }

  function phase3MissingRequiredSlots(queryPlan = {}, acceptedCandidatesBySlot = {}) {
    return (queryPlan.slots || []).filter((slot) => {
      if (slot.required === false) return false;
      if (slot.slotRole === 'visual') return false;
      return !(acceptedCandidatesBySlot[slot.slotId] || []).length;
    }).map((slot) => scope.phaseCarryObject({
      schema: 'simulatte.phase3MissingRequiredSlot.v1',
      id: slot.slotId || slot.entryId || '',
      slotId: slot.slotId || '',
      slotRole: slot.slotRole || '',
      entryId: slot.entryId || '',
      required: true,
      status: slot.modelEvidenceRequired === true ? 'unsupported' : 'lost',
      reason: slot.modelEvidenceRequired === true
        ? 'required action slot had no model, index, or local capability evidence'
        : 'required retrieval slot had no literal candidate evidence',
    }));
  }

  function phase3RerankReceipt(sourceReceipt = null, queryPlan = {}, slotEvidence = [], missingRequiredSlots = [], slotRetrieval = null) {
    const hasModelSlotRetrieval = slotRetrieval && Number(
      slotRetrieval.modelEvidenceSlotCount || slotRetrieval.embeddedSlotCount || 0
    ) > 0;
    return scope.phaseCarryObject({
      schema: 'simulatte.phase3SlotAwareRerankReceipt.v1',
      sourceSchema: sourceReceipt && sourceReceipt.schema || '',
      sourceBackend: sourceReceipt && (sourceReceipt.backend || sourceReceipt.modelBackend) || '',
      sourceModelId: sourceReceipt && (sourceReceipt.modelId || sourceReceipt.rerankerModelId) || '',
      mode: hasModelSlotRetrieval ? 'model-slot-aware-rerank' : 'slot-aware-retrieval-gate',
      queryPlanSchema: queryPlan.schema || '',
      slotRetrievalSchema: slotRetrieval && slotRetrieval.schema || '',
      embeddedSlotCount: slotRetrieval && Number(slotRetrieval.embeddedSlotCount || 0) || 0,
      promptEmbeddingSlotCount: slotRetrieval && Number(slotRetrieval.promptEmbeddingSlotCount || 0) || 0,
      modelEvidenceSlotCount: slotRetrieval && Number(slotRetrieval.modelEvidenceSlotCount || 0) || 0,
      slotEmbeddingDurationMs: slotRetrieval && Number(slotRetrieval.slotEmbeddingDurationMs || 0) || 0,
      slotRerankCallCount: slotRetrieval && Number(slotRetrieval.rerankCallCount || 0) || 0,
      slotRetrievalCandidateCount: slotRetrieval && Number(slotRetrieval.candidateCount || 0) || 0,
      slotCount: slotEvidence.length,
      requiredSlotCount: queryPlan.summary && queryPlan.summary.requiredSlotCount || 0,
      satisfiedSlotCount: (slotEvidence || []).filter((row) => row.acceptedCount > 0).length,
      supportOnlySlotCount: (slotEvidence || [])
        .filter((row) => row.acceptedCount === 0 && row.supportOnlyCount > 0).length,
      missingRequiredSlotCount: missingRequiredSlots.length,
      missingRequiredSlotIds: missingRequiredSlots.map((row) => row.slotId).filter(Boolean),
      source: sourceReceipt || null,
    });
  }

  function phase3CompositionLedger(
    typedEvidenceBuckets = {},
    languageGraph = {},
    sourceLedger = null,
    queryPlan = {},
    acceptedCandidatesBySlot = {},
    missingRequiredSlots = []
  ) {
    const buckets = typedEvidenceBuckets.buckets || {};
    const sourceObligations = sourceLedger && Array.isArray(sourceLedger.obligations) ? sourceLedger.obligations : [];
    const obligations = sourceObligations.map((row) => ({
      ...row,
      status: phase3ObligationStatus(row, acceptedCandidatesBySlot, missingRequiredSlots),
      phase: 3,
      receiptId: 'phase3-retrieval-rerank',
    }));
    const add = (row) => obligations.push(scope.phaseCarryObject(row));
    const bucketRowsBySlotRole = {
      actor: buckets.literalPromptObjects || [],
      object: buckets.literalPromptObjects || [],
      part: buckets.literalPromptObjects || [],
      action: buckets.actionEvidence || [],
      environment: buckets.environmentEvidence || [],
      medium: buckets.materialMediumEvidence || [],
    };
    const slotKindByRole = {
      actor: 'entity',
      object: 'entity',
      part: 'part',
      action: 'action',
      environment: 'environment',
      medium: 'medium',
    };
    for (const slot of queryPlan.slots || []) {
      const kind = slotKindByRole[slot.slotRole || ''];
      if (!kind || !slot.entryId) continue;
      const target = String(slot.entryId).replace(/^[a-z]+:/, '');
      if (!target) continue;
      const evidenceRows = scope.phase3FilterRowsForEntry(bucketRowsBySlotRole[slot.slotRole] || [], slot.entryId);
      const accepted = (acceptedCandidatesBySlot[slot.slotId] || []).length > 0;
      const row = {
        id: slot.entryId,
        kind,
        required: slot.required !== false,
        target,
        sourceEvidenceIds: evidenceRows.map((item) => item.id).filter(Boolean).slice(0, 6),
        status: accepted || evidenceRows.length ? 'preserved' : 'pending',
        phase: 3,
      };
      if (kind === 'medium') {
        row.inferred = slot.inferred === true ||
          !scope.phase3PhraseInPrompt(target.replace(/-/g, ' '), languageGraph.sourceText || '');
        if (accepted || evidenceRows.length) row.status = 'expanded';
      }
      add(row);
    }
    const hasCarriedRelationObligations = sourceObligations.some((row) => row.kind === 'relation');
    if (!hasCarriedRelationObligations) {
      for (const predicate of languageGraph.predicates || []) {
        if (!predicate.process || predicate.negated === true) continue;
        const subject = phase3SpanTextById(languageGraph, predicate.subjectSpanId);
        if (!subject) continue;
        const subjectTarget = scope.normalizeForEvidence(subject).replace(/\s+/g, '-');
        const objectText = phase3SpanTextById(languageGraph, predicate.objectSpanId) ||
          predicate.objectText ||
          predicate.implicitObject ||
          '';
        const objectTarget = scope.normalizeForEvidence(objectText).replace(/\s+/g, '-');
        add({
          id: `relation:${subjectTarget}:${predicate.process}:${objectTarget || 'world'}`,
          kind: 'relation',
          required: true,
          subject: subjectTarget,
          action: predicate.process,
          object: objectTarget,
          spatialRelation: predicate.spatialRelation || '',
          causalAffordance: predicate.causalAffordance || '',
          status: 'preserved',
          phase: 3,
        });
      }
    }
    for (const slot of queryPlan.slots || []) {
      if (slot.slotRole !== 'visual' || !slot.entryId) continue;
      add({
        id: slot.entryId,
        kind: 'visual',
        required: slot.required !== false,
        target: String(slot.entryId).replace(/^visual:/, ''),
        status: 'pending',
        phase: 3,
      });
    }
    const losses = (missingRequiredSlots || []).filter((slot) => slot.status !== 'unsupported').map((slot) => ({
      id: `loss:${slot.slotId}`,
      phase: 3,
      entryId: slot.entryId || '',
      reason: slot.reason || 'required slot missing',
      sourceReceiptId: 'phase3-retrieval-rerank',
      nextRequiredAction: 'add slot evidence or mark unsupported',
    }));
    return scope.normalizeCompositionLedger(sourceLedger || {}, {
      sourcePhase: sourceLedger && sourceLedger.sourcePhase || 2,
      currentPhase: 3,
      obligations: scope.uniqueById(obligations),
      phaseDeltas: [
        ...(queryPlan.slots || []).map((slot) => ({
          phase: 3,
          entryId: slot.entryId || '',
          operation: phase3SlotDeltaOperation(slot, acceptedCandidatesBySlot, missingRequiredSlots),
          receiptId: 'phase3-retrieval-rerank',
        })),
        ...sourceObligations.filter((row) => row.constraintKind === 'absence').map((row) => ({
          phase: 3,
          entryId: row.id || '',
          operation: 'preserved',
          receiptId: 'phase3-negation-carry',
        })),
      ],
      losses,
      unsupported: (missingRequiredSlots || []).filter((slot) => slot.status === 'unsupported').map((slot) => ({
        id: `unsupported:${slot.entryId || slot.slotId}`,
        entryId: slot.entryId || '',
        reason: slot.reason,
        source: 'phase3-retrieval-rerank',
        status: 'unsupported',
      })),
    });
  }

  function phase3ObligationStatus(row = {}, acceptedCandidatesBySlot = {}, missingRequiredSlots = []) {
    if (row.status === 'pending' || row.kind === 'visual') return row.status || 'pending';
    const missing = (missingRequiredSlots || []).find((slot) => slot.entryId === row.id);
    if (missing) return missing.status === 'unsupported' ? 'unsupported' : 'lost';
    const suffix = row.id ? row.id.replace(/^[a-z]+:/, '') : '';
    const slotId = Object.keys(acceptedCandidatesBySlot || {}).find((key) => key.endsWith(suffix));
    if (slotId && (acceptedCandidatesBySlot[slotId] || []).length) return 'preserved';
    return row.status || 'preserved';
  }

  function phase3SlotDeltaOperation(slot = {}, acceptedCandidatesBySlot = {}, missingRequiredSlots = []) {
    if ((acceptedCandidatesBySlot[slot.slotId] || []).length) return 'preserved';
    const missing = (missingRequiredSlots || []).find((row) => row.slotId === slot.slotId);
    if (missing) return missing.status === 'unsupported' ? 'unsupported' : 'lost';
    return 'carried';
  }

  function phase3SpanTextById(languageGraph = {}, id = '') {
    const span = (languageGraph.spans || []).find((row) => row.id === id);
    return span && span.text || '';
  }

  root.SimulattePhaseModuleRegistry.define('physicsModel', 'simulatte-physics-model-phase3-ledger.js', {
    phase3SlotEvidenceStatus,
    phase3CandidateType,
    phase3AcceptedCandidatesBySlot,
    phase3SupportOnlyCandidates,
    phase3RejectedGenericCandidates,
    phase3MissingRequiredSlots,
    phase3RerankReceipt,
    phase3CompositionLedger,
    phase3ObligationStatus,
    phase3SlotDeltaOperation,
    phase3SpanTextById,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
