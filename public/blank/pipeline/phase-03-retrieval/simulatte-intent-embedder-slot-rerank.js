(function attachSimulatteIntentEmbedderSlotRerank(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('intentEmbedder');

  async function rerankSlotCandidates(payload = {}) {
    const rows = payload.candidates || [];
    const config = scope.rerankerConfig(payload.runtime);
    const capability = scope.resolveRerankerCapability(payload.provider, {
      rerankProvider: payload.rerankProvider,
      dopplerModelHandle: null,
    });
    const required = scope.rerankerRequired(payload.runtime);
    if (!rows.length || !config.enabled || !capability) {
      if (required && config.enabled && !capability) {
        throw new Error(`intent manifest requires Doppler reranker ${config.id}, but no slot rerank capability is available`);
      }
      return {
        candidates: rows,
        rerankCall: false,
        receipt: {
          schema: 'simulatte.phase3SlotRerankReceipt.v1',
          rerankerMode: config.enabled ? 'heuristic-slot-ranking' : 'disabled',
          modelReady: false,
          modelRequired: required,
          modelStatus: config.enabled ? 'not-available' : 'disabled',
          candidateInputCount: rows.length,
          candidateOutputCount: rows.length,
        },
      };
    }
    const skipReason = slotRerankSkipReason(payload.slot, rows, payload.constructionMode === true);
    if (skipReason) {
      return {
        candidates: rows,
        rerankCall: false,
        receipt: {
          schema: 'simulatte.phase3SlotRerankReceipt.v1',
          rerankerMode: 'local-evidence-ranking',
          model: config.id,
          rerankerKind: config.kind,
          modelReady: true,
          modelRequired: required,
          modelStatus: 'skipped',
          modelBackend: capability.backend,
          skipReason,
          candidateInputCount: 0,
          candidateOutputCount: 0,
          localCandidateCount: rows.length,
        },
      };
    }
    try {
      const input = buildSlotRerankInput({
        promptText: payload.promptText,
        slot: payload.slot,
        candidates: rows,
        runtime: payload.runtime,
      });
      input.onProgress = (row = {}) => scope.emitRuntimeProgress(payload.progress, payload.traceEnabled, {
        source: 'simulatte-intent-embedder',
        stage: 'slot-model-rerank',
        percent: 94.1 + (Number(payload.slotIndex || 0) + 0.5) /
          Math.max(1, Number(payload.slotCount || 1)) * 1.3,
        message: `${row.scoreCacheHit === true ? 'Reusing score for' : 'Reranking'} scene slot ` +
          `${Number(payload.slotIndex || 0) + 1}/${Number(payload.slotCount || 1)} candidate ` +
          `${row.completed || 0}/${row.total || 0}`,
        traceId: payload.traceId || '',
        rankId: payload.rankId || 0,
        slotId: payload.slot && payload.slot.slotId || '',
        candidateId: row.candidateId || '',
        completed: row.completed || 0,
        total: row.total || 0,
        candidateCount: row.total || 0,
        scoreCacheHit: row.scoreCacheHit === true,
        promptTokenCount: row.promptTokenCount || 0,
        prefixTokenCount: row.prefixTokenCount || 0,
        prefixStateReused: row.prefixStateReused === true,
        prefixPreparationDurationMs: row.prefixPreparationDurationMs || 0,
        prefixTokenizationDurationMs: row.prefixTokenizationDurationMs || 0,
        prefixResetDurationMs: row.prefixResetDurationMs || 0,
        prefixPrimingDurationMs: row.prefixPrimingDurationMs || 0,
        executionDurationMs: row.executionDurationMs || 0,
      });
      input.onProgress({ completed: 0, total: input.candidates.length });
      const result = await capability.rerank(input);
      const modelRows = scope.normalizeRerankerRows(result);
      if (!modelRows.length) throw new Error(`Doppler reranker ${config.id} returned no slot candidates`);
      return {
        candidates: applySlotModelRerank(rows, modelRows, input.candidates),
        rerankCall: true,
        receipt: {
          schema: 'simulatte.phase3SlotRerankReceipt.v1',
          rerankerMode: 'doppler-reranker',
          model: config.id,
          rerankerKind: config.kind,
          modelReady: true,
          modelRequired: required,
          modelStatus: 'ready',
          modelBackend: capability.backend,
          candidateInputCount: input.candidates.length,
          candidateOutputCount: modelRows.length,
          candidateInputs: input.candidates.map((row) => ({
            candidateId: row.candidateId || row.primitiveId,
            order: row.order,
            candidateType: row.candidateType,
            localScore: row.score,
            lexicalScore: row.lexicalScore,
          })),
          candidateOutputs: modelRows.map((row) => ({
            candidateId: row.primitiveId,
            rank: row.rank,
            score: row.score,
            scoringPath: row.scoringPath,
            executionDurationMs: row.executionDurationMs,
          })),
          ...scope.rerankExecutionSummary(modelRows),
        },
      };
    } catch (err) {
      if (required) throw err;
      return {
        candidates: rows,
        rerankCall: false,
        receipt: {
          schema: 'simulatte.phase3SlotRerankReceipt.v1',
          rerankerMode: 'heuristic-slot-ranking',
          modelReady: false,
          modelRequired: false,
          modelStatus: 'fallback',
          modelBackend: capability.backend,
          fallbackReason: err && err.message ? err.message : String(err),
          candidateInputCount: rows.length,
          candidateOutputCount: rows.length,
        },
      };
    }
  }

  function buildSlotRerankInput({ promptText, slot, candidates, runtime }) {
    const config = scope.rerankerConfig(runtime);
    const constructionRows = scope.constructionCandidatesForSlot(
      slot, candidates, config.maxSlotCandidatesPerCall
    );
    const selectedCandidates = (constructionRows.length ? constructionRows : candidates || [])
      .slice(0, config.maxSlotCandidatesPerCall)
      .filter((candidate) => candidate.supportOnly !== true);
    return {
      schema: 'simulatte.intentSlotRerankInput.v1',
      phase: 3,
      phaseId: 'retrieval',
      stage: scope.slotNeedsModelConstructionEvidence(slot) ? 'construction-hypothesis-rerank' : 'typed-slot-retrieval',
      reranker: scope.rerankerId(runtime),
      prompt: slotRerankQuery(promptText, slot),
      slot: {
        slotId: slot && slot.slotId || '',
        slotRole: slot && slot.slotRole || '',
        entryId: slot && slot.entryId || '',
        required: !slot || slot.required !== false,
        queries: slot && slot.queries || [],
        relationIds: slot && slot.relationIds || [],
        constructionMode: scope.slotNeedsModelConstructionEvidence(slot),
      },
      candidates: selectedCandidates.map((candidate, order) => ({
        primitiveId: candidate.candidateId || candidate.primitiveId || candidate.id,
        candidateId: candidate.candidateId || candidate.primitiveId || candidate.id,
        order,
        candidateType: candidate.candidateType || '',
        slotRole: candidate.slotRole || '',
        label: candidate.label || '',
        score: Number(candidate.score || 0),
        modelScore: Number(candidate.modelScore || 0),
        lexicalScore: Number(candidate.lexicalScore || 0),
        supportOnly: candidate.supportOnly === true,
        candidateText: candidate.candidateText || '',
        construction: candidate.construction || null,
      })),
      max: Math.max(1, selectedCandidates.length),
    };
  }

  function slotRerankQuery(promptText = '', slot = {}) {
    const role = String(slot && slot.slotRole || 'scene').trim();
    const target = scope.slotQueryText(slot);
    return [
      `Scene prompt: ${String(promptText || '').trim()}`,
      `Required ${role} evidence: ${target}`,
    ].filter((line) => !line.endsWith(': ')).join('\n');
  }

  function slotRerankSkipReason(slot = {}, candidates = [], constructionMode = false) {
    if (constructionMode) {
      if (scope.exactConstructionCandidate(slot, candidates)) return 'exact-model-indexed-construction';
      const constructionRows = scope.constructionCandidatesForSlot(slot, candidates, 3);
      if (constructionRows.length === 1 && constructionRows[0].construction.targetIdentityBound === true) {
        return 'data-owned-target-construction';
      }
      return constructionRows.length ? '' : 'no-construction-hypothesis';
    }
    if (slot && slot.required === false) return 'optional-slot-local-evidence';
    if ((candidates || []).some((candidate) => candidate.literalSlotMatch === true)) {
      return 'literal-slot-identity';
    }
    if (scope.slotUsesPromptOwnedLocalEvidence(slot)) return 'prompt-owned-slot-local-evidence';
    return '';
  }

  function applySlotModelRerank(localRows, modelRows, evaluatedRows = modelRows) {
    return scope.applyRankBandRerank(localRows, modelRows, evaluatedRows, scope.slotCandidateSort);
  }

  root.SimulattePhaseModuleRegistry.define('intentEmbedder', 'simulatte-intent-embedder-slot-rerank.js', {
    rerankSlotCandidates,
    buildSlotRerankInput,
    slotRerankQuery,
    slotRerankSkipReason,
    applySlotModelRerank,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
