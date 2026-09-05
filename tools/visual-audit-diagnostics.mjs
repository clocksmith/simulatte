// In-page evidence projection. This reads bound artifacts; it never settles proof.
export function diagnosticsExpression(prompt) {
  return `(() => {
    const canvas = document.getElementById('physics-canvas');
    const fieldCanvas = document.getElementById('field-canvas');
    const runtime = document.getElementById('intent-runtime');
    const message = document.getElementById('intent-runtime-message');
    const runtimeHealth = window.SimulatteIntentRuntimeHealth || (() => {
      try { return runtime && runtime.dataset.health ? JSON.parse(runtime.dataset.health) : null; }
      catch (_err) { return null; }
    })();
    const preview = document.getElementById('spec-preview');
    const ctx = canvas && canvas.getContext('2d', { willReadFrequently: true });
    const width = canvas ? canvas.width : 0;
    const height = canvas ? canvas.height : 0;
    let hash = 2166136261;
    let samples = 0;
    let sum = 0;
    let sumSq = 0;
    let colored = 0;
    if (ctx && width && height) {
      const data = ctx.getImageData(0, 0, width, height).data;
      const yStep = Math.max(1, Math.floor(height / 72));
      const xStep = Math.max(1, Math.floor(width / 96));
      for (let y = 0; y < height; y += yStep) {
        for (let x = 0; x < width; x += xStep) {
          const offset = (y * width + x) * 4;
          const r = data[offset];
          const g = data[offset + 1];
          const b = data[offset + 2];
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          sum += luma;
          sumSq += luma * luma;
          if (Math.max(r, g, b) - Math.min(r, g, b) > 16) colored += 1;
          hash ^= r + (g << 8) + (b << 16) + samples;
          hash = Math.imul(hash, 16777619) >>> 0;
          samples += 1;
        }
      }
    }
    const mean = samples ? sum / samples : 0;
    const variance = samples ? Math.max(0, sumSq / samples - mean * mean) : 0;
    let parsed = null;
    let modelSpec = null;
    let browserSpec = null;
    const previewText = preview ? preview.textContent || '' : '';
    try { parsed = JSON.parse(previewText); } catch (_err) {}
    try {
      const browserLab = window.SimulattePhysicsLab && window.SimulattePhysicsLab._browserLab;
      browserSpec = browserLab && typeof browserLab.getSpec === 'function' ? browserLab.getSpec() : null;
    } catch (_err) {}
    try {
      if (!browserSpec && window.SimulattePhysicsModel && typeof window.SimulattePhysicsModel.createSpecFromPrompt === 'function') {
        modelSpec = window.SimulattePhysicsModel.createSpecFromPrompt(${JSON.stringify(prompt)}, { deterministicRuntime: true });
      }
    } catch (_err) {}
    const specForIntent = browserSpec || modelSpec || parsed || null;
    const phaseArtifacts = specForIntent && specForIntent.phaseArtifacts || {};
    const compiledPrompt = phaseArtifacts.phase2 && phaseArtifacts.phase2.artifact &&
      phaseArtifacts.phase2.artifact.languageGraph &&
      phaseArtifacts.phase2.artifact.languageGraph.sourceText || '';
    const compiledSourcePromptHash = phaseArtifacts.phase2 && phaseArtifacts.phase2.artifact &&
      phaseArtifacts.phase2.artifact.sceneLanguageGraph &&
      phaseArtifacts.phase2.artifact.sceneLanguageGraph.sourcePromptHash || '';
    const phase2IntentRequirementLedger = phaseArtifacts.phase2 && phaseArtifacts.phase2.artifact &&
      phaseArtifacts.phase2.artifact.intentRequirements || null;
    const phaseArtifactSchemas = Object.fromEntries(Array.from({ length: 6 }, (_, index) => {
      const key = 'phase' + (index + 1);
      return [key, phaseArtifacts[key] && phaseArtifacts[key].schema || ''];
    }));
    phaseArtifactSchemas.phase7 = canvas && canvas.dataset ? canvas.dataset.phase7Output || '' : '';
    const phase6VisualCompile = phaseArtifacts.phase6 &&
      phaseArtifacts.phase6.artifact &&
      phaseArtifacts.phase6.artifact.visualCompile || null;
    const phase1RuntimeContext = phaseArtifacts.phase1 &&
      phaseArtifacts.phase1.artifact &&
      phaseArtifacts.phase1.artifact.runtimeContext || {};
    const promptRuntimeReceipt = phase1RuntimeContext.promptRuntimeReceipt || {};
    const phase3Retrieval = phaseArtifacts.phase3 &&
      phaseArtifacts.phase3.artifact &&
      phaseArtifacts.phase3.artifact.retrievalRerankResult || {};
    const phase4AcceptedGraph = phaseArtifacts.phase4 &&
      phaseArtifacts.phase4.artifact &&
      phaseArtifacts.phase4.artifact.groundedIntent &&
      phaseArtifacts.phase4.artifact.groundedIntent.acceptedGraph || {};
    const phase5SimulationCompile = phaseArtifacts.phase5 &&
      phaseArtifacts.phase5.artifact &&
      phaseArtifacts.phase5.artifact.simulationCompile || {};
    const phase5PhysicsIR = phase5SimulationCompile.physicsIR || {};
    const phase5SolverGraph = phase5SimulationCompile.solverGraph || {};
    const phase5RenderIR = phase5SimulationCompile.renderIR || {};
    const phase3RerankReceipt = phase3Retrieval.rerankReceipt || {};
    const sourceRerankReceipt = phase3RerankReceipt.source || {};
    const slotRetrieval = phase3Retrieval.slotRetrieval || {};
    const promptRerankScoringPaths = sourceRerankReceipt.scoringPaths || [];
    const slotRerankScoringPaths = slotRetrieval.rerankScoringPaths || [];
    const rendererPlan = phase6VisualCompile && phase6VisualCompile.rendererPlan || null;
    const visualIR = phase6VisualCompile && phase6VisualCompile.visualIR || null;
    const sceneRenderPacket = phase6VisualCompile && phase6VisualCompile.sceneRenderPacket || null;
    const phase6CompositionLedger = phase6VisualCompile && phase6VisualCompile.compositionLedger || {};
    const graphicsAtoms = visualIR && visualIR.graphicsAtoms || {};
    const atomUniforms = graphicsAtoms && graphicsAtoms.uniforms || {};
    const intentBrief = specForIntent && specForIntent.intent && specForIntent.intent.intentBrief || null;
    const physicalReceipt = specForIntent && specForIntent.physicalSpec && specForIntent.physicalSpec.receipt || {};
    const rendererConsumption = (() => {
      try { return canvas && canvas.dataset.phase7RendererConsumption ? JSON.parse(canvas.dataset.phase7RendererConsumption) : null; }
      catch (_err) { return null; }
    })();
    const objectRealization = (() => {
      try { return canvas && canvas.dataset.webgpuObjectRealization ? JSON.parse(canvas.dataset.webgpuObjectRealization) : null; }
      catch (_err) { return null; }
    })();
    const phase7PixelSamples = (() => {
      const source = canvas && canvas.__simulattePixelSamples || null;
      const proof = window.SimulatteRenderProof;
      const rows = proof && typeof proof.normalizePhase7PixelSamples === 'function'
        ? proof.normalizePhase7PixelSamples(source)
        : source && Array.isArray(source.samples) ? source.samples : [];
      return rows.slice(0, 64).map((row) => ({
        id: row.id || '',
        obligationId: row.obligationId || '',
        drawableId: row.drawableId || '',
        constructionRole: row.constructionRole || '',
        constructionPartId: row.constructionPartId || '',
        rgba: Array.isArray(row.rgba) ? row.rgba.slice(0, 4) : [],
        contrast: Number(row.contrast || 0),
        visible: row.visible === true,
        x: Number(row.x || 0),
        y: Number(row.y || 0),
      }));
    })();
    const visualIRArrayCount = (key) => (
      visualIR && Array.isArray(visualIR[key]) ? visualIR[key].length : 0
    );
    const intentBriefArrayCount = (key) => (
      intentBrief && Array.isArray(intentBrief[key]) ? intentBrief[key].length : 0
    );
    const constructionAuditSummary = (row = {}) => {
      const hypotheses = Array.isArray(row.constructionHypotheses) ? row.constructionHypotheses : [];
      const selected = row.construction || hypotheses[0] || null;
      return {
        selectedTargetEntryId: selected && selected.targetEntryId || '',
        selectedSourceCardIds: selected && selected.sourceCardIds || [],
        hypothesisCount: hypotheses.length,
        hypotheses: hypotheses.map((hypothesis) => ({
          hypothesisId: hypothesis.hypothesisId || '',
          rank: Number(hypothesis.hypothesisRank || 0),
          targetEntryId: hypothesis.targetEntryId || '',
          sourceCardIds: hypothesis.sourceCardIds || [],
          candidateId: hypothesis.provenance && hypothesis.provenance.candidateId || '',
          modelEvaluated: hypothesis.provenance && hypothesis.provenance.modelEvaluated === true,
          rerankEvaluated: hypothesis.provenance && hypothesis.provenance.rerankEvaluated === true,
          literalSlotMatch: hypothesis.provenance && hypothesis.provenance.literalSlotMatch === true,
          exactTargetMatch: hypothesis.provenance && hypothesis.provenance.exactTargetMatch === true,
        })),
      };
    };
    const canonicalBrowserJson = (value) => {
      const sort = (item) => {
        if (Array.isArray(item)) return item.map(sort);
        if (!item || typeof item !== 'object') return item;
        return Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])]));
      };
      return JSON.stringify(sort(value));
    };
    return {
      buildId: document.querySelector('meta[name="simulatte-build"]')?.content || '',
      runtimeState: runtime ? runtime.dataset.state || '' : '',
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      renderInputSerial: Number(canvas && canvas.dataset && canvas.dataset.renderInputSerial || 0),
      compiledPrompt,
      compiledSourcePromptHash,
      phase2IntentRequirementLedger,
      sceneRenderPacketCanonicalJson: sceneRenderPacket ? canonicalBrowserJson(sceneRenderPacket) : '',
      runtimeStage: runtime ? runtime.dataset.stage || '' : '',
      runtimeLastStage: runtime ? runtime.dataset.lastStage || '' : '',
      runtimePipelineStep: runtime ? runtime.dataset.pipelineStep || '' : '',
      runtimeBlocking: runtime ? runtime.dataset.blocking || '' : '',
      runtimePassive: runtime ? runtime.dataset.passive || '' : '',
      runtimeDetail: runtime ? runtime.dataset.detail || '' : '',
      runtimeMessage: message ? message.textContent || '' : '',
      runtimeHealth,
      runtimeEvents: (window.__simulatteIntentRuntimeEvents || []).slice(-12),
      runtimeProgressLogs: (window.__simulatteRuntimeProgressLogs || []).slice(-2048),
      runtimePerformanceLogs: (window.__simulatteRuntimePerformanceLogs || []).slice(-120),
      runtimeModelId: runtime ? runtime.dataset.modelId || '' : '',
      runtimeCacheMode: runtime ? runtime.dataset.cacheMode || '' : '',
      runtimeCacheWorker: runtime ? runtime.dataset.cacheWorker || '' : '',
      runtimeCacheBackends: runtime ? runtime.dataset.cacheBackends || '' : '',
      runtimeResourceKind: runtime ? runtime.dataset.resourceKind || '' : '',
      runtimeResourceFile: runtime ? runtime.dataset.resourceFile || '' : '',
      runtimeCompletedBytes: runtime ? Number(runtime.dataset.completedBytes || 0) : 0,
      runtimeTotalBytes: runtime ? Number(runtime.dataset.totalBytes || 0) : 0,
      runtimeTraceId: runtime ? runtime.dataset.traceId || '' : '',
      runtimeRankId: runtime ? runtime.dataset.rankId || '' : '',
      runtimeReuse: runtime ? runtime.dataset.reuse || '' : '',
      runtimeProviderReady: runtime ? runtime.dataset.providerReady || '' : '',
      runtimeCacheHitCount: runtime ? Number(runtime.dataset.cacheHitCount || 0) : 0,
      runtimeCacheMissCount: runtime ? Number(runtime.dataset.cacheMissCount || 0) : 0,
      runtimeCachedSpanCount: runtime ? Number(runtime.dataset.cachedSpanCount || 0) : 0,
      phase1RuntimeMode: phase1RuntimeContext.runtimeMode || '',
      phase1DeterministicReady: phase1RuntimeContext.deterministicReady === true,
      phase1NoFallback: phase1RuntimeContext.noFallback === true,
      phase1RuntimeModelId: phase1RuntimeContext.modelId || '',
      modelExecutionReceipt: promptRuntimeReceipt.schema ? {
        schema: 'simulatte.modelExecutionAuditReceipt.v1',
        promptRuntimeSchema: promptRuntimeReceipt.schema || '',
        ready: promptRuntimeReceipt.ready === true,
        noFallback: promptRuntimeReceipt.noFallback === true,
        providerReady: promptRuntimeReceipt.providerReady === true,
        providerBackend: promptRuntimeReceipt.providerBackend || '',
        cachePrefetch: promptRuntimeReceipt.cachePrefetch === true,
        cacheMode: promptRuntimeReceipt.cacheMode || '',
        cacheVerified: promptRuntimeReceipt.cacheVerified === true,
        embeddingCacheState: promptRuntimeReceipt.embeddingCacheState || '',
        rerankerCacheState: promptRuntimeReceipt.rerankerCacheState || '',
        modelPreparation: promptRuntimeReceipt.modelPreparation || null,
        modelRuntimeLock: promptRuntimeReceipt.modelRuntimeLock || null,
        embeddingModelId: promptRuntimeReceipt.modelId || '',
        embeddingModelHash: promptRuntimeReceipt.modelHash || '',
        embeddingDim: Number(promptRuntimeReceipt.embeddingDim || 0),
        embeddingProbe: promptRuntimeReceipt.embeddingProbe === true,
        embeddingProbeCount: Number(promptRuntimeReceipt.probeCount || 0),
        embeddingProbeDim: Number(promptRuntimeReceipt.probeEmbeddingDim || 0),
        embeddingStabilitySimilarity: Number(promptRuntimeReceipt.stabilitySimilarity || 0),
        embeddingDistinctProbePairs: Number(promptRuntimeReceipt.distinctProbePairs || 0),
        runtimeLoadMs: Number(promptRuntimeReceipt.durationMs || 0),
        providerLoadMs: Number(promptRuntimeReceipt.providerLoadMs || 0),
        probeMs: Number(promptRuntimeReceipt.probeMs || 0),
        firstEmbeddingMs: Number(promptRuntimeReceipt.firstEmbeddingMs || 0),
        rerankerId: promptRuntimeReceipt.reranker || '',
        rerankerModelId: promptRuntimeReceipt.rerankerModelId || '',
        rerankerModelHash: promptRuntimeReceipt.rerankerModelHash || '',
        rerankerRequired: promptRuntimeReceipt.rerankerRequired === true,
        rerankerReady: promptRuntimeReceipt.rerankerReady === true,
        rerankerStatus: promptRuntimeReceipt.rerankerStatus || '',
        rerankerBackend: promptRuntimeReceipt.rerankerBackend || '',
        rerankerProbeCount: Number(promptRuntimeReceipt.rerankerProbeCount || 0),
        rerankerProbeCandidateCount: Number(promptRuntimeReceipt.rerankerProbeCandidateCount || 0),
        rerankerProbeOutputCount: Number(promptRuntimeReceipt.rerankerProbeOutputCount || 0),
        phase3Rerank: {
          schema: sourceRerankReceipt.schema || phase3RerankReceipt.sourceSchema || '',
          model: sourceRerankReceipt.model || phase3RerankReceipt.sourceModelId || '',
          modelReady: sourceRerankReceipt.modelReady === true,
          modelRequired: sourceRerankReceipt.modelRequired === true,
          modelStatus: sourceRerankReceipt.modelStatus || '',
          modelBackend: sourceRerankReceipt.modelBackend || phase3RerankReceipt.sourceBackend || '',
          candidateInputCount: Number(sourceRerankReceipt.modelCandidateInputCount || 0),
          candidateOutputCount: Number(sourceRerankReceipt.modelCandidateOutputCount || 0),
          candidateInputs: sourceRerankReceipt.modelCandidateInputs || [],
          candidateOutputs: sourceRerankReceipt.modelCandidateOutputs || [],
          candidateSelectionMode: sourceRerankReceipt.candidateSelectionMode || '',
          candidateBudgetPolicy: sourceRerankReceipt.candidateBudgetPolicy || '',
          evidenceCandidateCount: Number(sourceRerankReceipt.evidenceCandidateCount || 0),
          evidenceGroupCount: Number(sourceRerankReceipt.evidenceGroupCount || 0),
          adaptiveCandidateBudget: Number(sourceRerankReceipt.adaptiveCandidateBudget || 0),
          promptScoringPaths: promptRerankScoringPaths,
          promptSelectedTokenLogitCount: Number(sourceRerankReceipt.selectedTokenLogitCount || 0),
          promptSelectedTokenExecutionCount: Number(sourceRerankReceipt.selectedTokenExecutionCount || 0),
          promptScoreCacheHitCount: Number(sourceRerankReceipt.scoreCacheHitCount || 0),
          promptPrefixKvReuseCount: Number(sourceRerankReceipt.prefixKvReuseCount || 0),
          promptPrefixStateReuseCount: Number(sourceRerankReceipt.prefixStateReuseCount || 0),
          promptMinimumPrefixTokenCount: Number(sourceRerankReceipt.minimumPrefixTokenCount || 0),
          promptPrefixPreparationDurationMs: Number(sourceRerankReceipt.prefixPreparationDurationMs || 0),
          promptPrefixTokenizationDurationMs: Number(sourceRerankReceipt.prefixTokenizationDurationMs || 0),
          promptPrefixResetDurationMs: Number(sourceRerankReceipt.prefixResetDurationMs || 0),
          promptPrefixPrimingDurationMs: Number(sourceRerankReceipt.prefixPrimingDurationMs || 0),
          promptRerankCallDurationMs: Number(sourceRerankReceipt.rerankCallDurationMs || 0),
          promptUnattributedRerankDurationMs: Number(sourceRerankReceipt.unattributedRerankDurationMs || 0),
          promptTotalExecutionDurationMs: Number(sourceRerankReceipt.totalExecutionDurationMs || 0),
          promptMeanExecutionDurationMs: Number(sourceRerankReceipt.meanExecutionDurationMs || 0),
          promptMaximumExecutionDurationMs: Number(sourceRerankReceipt.maximumExecutionDurationMs || 0),
          slotRerankCallCount: Number(phase3RerankReceipt.slotRerankCallCount || slotRetrieval.rerankCallCount || 0),
          slotCandidateInputCount: Number(slotRetrieval.rerankCandidateInputCount || 0),
          slotCandidateOutputCount: Number(slotRetrieval.rerankCandidateOutputCount || 0),
          slotScoringPaths: slotRerankScoringPaths,
          slotSelectedTokenLogitCount: Number(slotRetrieval.selectedTokenLogitCount || 0),
          slotSelectedTokenExecutionCount: Number(slotRetrieval.selectedTokenExecutionCount || 0),
          slotScoreCacheHitCount: Number(slotRetrieval.scoreCacheHitCount || 0),
          slotPrefixKvReuseCount: Number(slotRetrieval.prefixKvReuseCount || 0),
          slotPrefixStateReuseCount: Number(slotRetrieval.prefixStateReuseCount || 0),
          slotMinimumPrefixTokenCount: Number(slotRetrieval.minimumPrefixTokenCount || 0),
          slotPrefixPreparationDurationMs: Number(slotRetrieval.prefixPreparationDurationMs || 0),
          slotPrefixTokenizationDurationMs: Number(slotRetrieval.prefixTokenizationDurationMs || 0),
          slotPrefixResetDurationMs: Number(slotRetrieval.prefixResetDurationMs || 0),
          slotPrefixPrimingDurationMs: Number(slotRetrieval.prefixPrimingDurationMs || 0),
          slotRerankCallDurationMs: Number(slotRetrieval.rerankCallDurationMs || 0),
          slotUnattributedRerankDurationMs: Number(slotRetrieval.unattributedRerankDurationMs || 0),
          slotTotalExecutionDurationMs: Number(slotRetrieval.totalExecutionDurationMs || 0),
          slotMaximumExecutionDurationMs: Number(slotRetrieval.maximumExecutionDurationMs || 0),
          scoringPaths: [...new Set([...promptRerankScoringPaths, ...slotRerankScoringPaths])].sort(),
          embeddedSlotCount: Number(phase3RerankReceipt.embeddedSlotCount || slotRetrieval.embeddedSlotCount || 0),
          promptEmbeddingSlotCount: Number(
            phase3RerankReceipt.promptEmbeddingSlotCount || slotRetrieval.promptEmbeddingSlotCount || 0
          ),
          modelEvidenceSlotCount: Number(
            phase3RerankReceipt.modelEvidenceSlotCount || slotRetrieval.modelEvidenceSlotCount || 0
          ),
          slotEmbeddingDurationMs: Number(
            phase3RerankReceipt.slotEmbeddingDurationMs || slotRetrieval.slotEmbeddingDurationMs || 0
          ),
        },
      } : null,
      phase3MissingRequiredSlots: (phase3Retrieval.missingRequiredSlots || []).map((row) => ({
        slotId: row.slotId || '',
        entryId: row.entryId || '',
        reason: row.reason || '',
      })),
      phase3SlotEvidence: (phase3Retrieval.slotEvidence || []).map((row) => ({
        slotId: row.slotId || '',
        entryId: row.entryId || '',
        status: row.status || '',
        acceptedCount: Number(row.acceptedCount || 0),
        acceptedCandidateIds: row.acceptedCandidateIds || [],
      })),
      phase3SlotCandidates: (slotRetrieval.bySlot || []).map((row) => ({
        slotId: row.slotId || '',
        slotRole: row.slotRole || '',
        required: row.required !== false,
        skipReason: row.receipt && row.receipt.skipReason || '',
        localGeometryGrammarId: row.receipt && row.receipt.localGeometryGrammarId || '',
        candidates: (row.candidates || []).slice(0, 8).map((candidate) => ({
          id: candidate.candidateId || candidate.primitiveId || candidate.id || '',
          type: candidate.candidateType || '',
          score: Number(candidate.score || 0),
          embeddingScore: Number(candidate.modelScore || 0),
          lexicalScore: Number(candidate.lexicalScore || 0),
          rerankScore: Number(candidate.modelRerankScore || 0),
          rerankRank: Number(candidate.modelRerankRank || 0),
          rerankRankScore: Number(candidate.modelRerankRankScore || 0),
          rerankBandScore: Number(candidate.modelRerankBandScore || 0),
          rerankEvaluated: candidate.modelRerankEvaluated === true,
          modelEvaluated: candidate.modelEvaluated === true,
          constructionEvidence: candidate.constructionEvidence === true,
          literalSlotMatch: candidate.literalSlotMatch === true,
          supportOnly: candidate.supportOnly === true,
          localGeometryGrammarId: candidate.localGeometryGrammarId || '',
        })),
      })),
      phase4AcceptedNodeIdentities: (phase4AcceptedGraph.nodes || []).map((row) => ({
        id: row.id || '',
        canonicalId: row.canonicalId || '',
        label: row.label || '',
        indexName: row.indexName || '',
        semanticType: row.semanticType || '',
        supportOnly: row.supportOnly === true,
        directlyGrounded: row.directlyGrounded === true,
        construction: constructionAuditSummary(row),
      })),
      phase4AcceptedEdges: (phase4AcceptedGraph.edges || []).map((row) => ({
        id: row.id || '',
        source: row.source || row.from || '',
        target: row.target || row.to || '',
        processId: row.processId || '',
        operatorType: row.operatorType || '',
        causalRuleId: row.provenance && row.provenance.causalRuleId || '',
        causal: row.causal === true,
      })),
      intentBriefCausalGraph: (intentBrief && intentBrief.causalGraph || []).map((row) => ({
        id: row.id || '',
        ruleId: row.ruleId || '',
        sourceRef: row.sourceRef || '',
        targetRef: row.targetRef || '',
        sourceLabel: row.sourceLabel || '',
        targetLabel: row.targetLabel || '',
        processId: row.processId || '',
        operatorType: row.operatorType || '',
        groundingPolicy: row.groundingPolicy || null,
        groundingPolicyEvidence: row.groundingPolicyEvidence || null,
      })),
      phase4Canonicalization: phase4AcceptedGraph.canonicalization || null,
      phase4ConstructionReceipt: phase4AcceptedGraph.constructionReceipt || null,
      phase4CandidateMatchReceipt: phase4AcceptedGraph.candidateMatchReceipt || null,
      phase5EntityIdentities: (phase5PhysicsIR.entities || []).map((row) => ({
        id: row.id || '',
        canonicalId: row.canonicalId || '',
        label: row.label || row.name || '',
        sourceKind: row.sourceKind || '',
        semanticType: row.semanticType || row.type || '',
        supportOnly: row.supportOnly === true,
        construction: constructionAuditSummary(row),
      })),
      phase5OperatorTypes: (phase5PhysicsIR.operators || []).map((row) => row.type || '').filter(Boolean),
      phase5SolverSteps: (phase5SolverGraph.steps || []).map((row) => ({
        id: row.id || '',
        operatorType: row.operatorType || '',
        solverId: row.solverId || '',
        reads: row.reads || row.inputs || [],
        writes: row.writes || row.outputs || [],
      })),
      phase5RenderIRObjects: (phase5RenderIR.objects || []).map((row) => ({
        id: row.id || '',
        label: row.label || '',
        semanticRef: row.semanticRef || '',
        physicalRef: row.physicalRef || '',
        directlyGrounded: row.directlyGrounded === true,
        glyph: row.glyph || '',
      })),
      phase6VisualAcceptance: (phase6VisualCompile && phase6VisualCompile.visualAcceptance || []).map((row) => ({
        id: row.id || '',
        sourceKind: row.sourceKind || '',
        phrase: row.phrase || '',
        status: row.status || '',
        reason: row.reason || '',
        promptGrounded: row.promptGrounded === true,
        supportOnly: row.supportOnly === true,
      })),
      phase6CompositionObligations: (phase6CompositionLedger.obligations || []).map((row) => ({
        id: row.id || row.obligationId || '',
        kind: row.kind || '',
        target: row.target || '',
        required: row.required === true,
        status: row.status || '',
        constraintKind: row.constraintKind || '',
        targetIdentity: row.targetIdentity || '',
        targetSemanticCode: Number(row.targetSemanticCode || 0),
        visualEvidence: row.visualEvidence || [],
      })),
      sceneRenderPacketSurfaceContacts: sceneRenderPacket && sceneRenderPacket.receipts &&
        sceneRenderPacket.receipts.framing && Array.isArray(sceneRenderPacket.receipts.framing.surfaceContacts)
        ? sceneRenderPacket.receipts.framing.surfaceContacts.map((row) => ({
          constraintId: row.constraintId || '',
          sourceId: row.sourceId || '',
          targetId: row.targetId || '',
          clearanceBefore: Number(row.clearanceBefore || 0),
          clearanceAfter: Number(row.clearanceAfter || 0),
        }))
        : [],
      sceneRenderPacketGraspContacts: sceneRenderPacket && sceneRenderPacket.receipts &&
        sceneRenderPacket.receipts.framing && Array.isArray(sceneRenderPacket.receipts.framing.graspContacts)
        ? sceneRenderPacket.receipts.framing.graspContacts.map((row) => ({
          constraintId: row.constraintId || '',
          sourceId: row.sourceId || '',
          targetId: row.targetId || '',
          sourcePartIds: row.sourcePartIds || [],
          targetPartId: row.targetPartId || '',
          endpointDistanceAfter: Number(row.endpointDistanceAfter || 0),
        }))
        : [],
      sceneRenderPacketIdentities: (sceneRenderPacket && sceneRenderPacket.entities || []).map((row) => ({
        id: row.id || '',
        label: row.label || '',
        type: row.identity && row.identity.type || '',
        sourceLabel: row.identity && row.identity.sourceLabel || '',
        semanticCode: Number(row.renderCodes && row.renderCodes.semanticCode || 0),
        layerSlot: row.layerSlot || '',
        animationKind: row.animation && row.animation.kind || '',
        animationSpeed: Number(row.animation && row.animation.speed || 0),
        animationAmplitude: Number(row.animation && row.animation.amplitude || 0),
        animationPhase: Number(row.animation && row.animation.phase || 0),
        grammarId: row.geometry && row.geometry.program && row.geometry.program.grammarId || '',
        literal: row.geometry && row.geometry.program && row.geometry.program.literal === true,
        unsupportedIdentity: row.geometry && row.geometry.program && row.geometry.program.unsupportedIdentity === true,
        partCount: row.geometry && row.geometry.program && Array.isArray(row.geometry.program.parts)
          ? row.geometry.program.parts.length : 0,
        propertyBindings: row.geometry && row.geometry.program && row.geometry.program.promptPropertyBindings || [],
      })),
      canvasWidth: width,
      canvasHeight: height,
      physicsCanvasRenderer: canvas && canvas.dataset ? canvas.dataset.renderer || '' : '',
      physicsCanvasRendererStatus: canvas && canvas.dataset ? canvas.dataset.rendererStatus || '' : '',
      physicsCanvasSceneKind: canvas && canvas.dataset ? canvas.dataset.sceneKind || '' : '',
      physicsCanvasSceneId: canvas && canvas.dataset ? canvas.dataset.sceneId || '' : '',
      physicsCanvasSceneMix: canvas && canvas.dataset ? canvas.dataset.sceneMix || '' : '',
      physicsCanvasSceneMixSlots: canvas && canvas.dataset ? canvas.dataset.sceneMixSlots || '' : '',
      phase7Input: canvas && canvas.dataset ? canvas.dataset.phase7Input || '' : '',
      phase7RenderExecutionInput: canvas && canvas.dataset
        ? canvas.dataset.phase7Input === 'simulatte.renderExecutionInput.v1'
          ? canvas.dataset.phase7Input
          : canvas.dataset.renderExecutionInput || ''
        : '',
      renderExecutionInput: canvas && canvas.dataset ? canvas.dataset.renderExecutionInput || '' : '',
      phase7SceneRenderPacketInput: canvas && canvas.dataset
        ? canvas.dataset.phase7SceneRenderPacketInput ||
          (canvas.dataset.phase7Input === 'simulatte.sceneRenderPacket.v1' ? canvas.dataset.phase7Input : '')
        : '',
      phase7Output: canvas && canvas.dataset ? canvas.dataset.phase7Output || '' : '',
      phase7OutputInput: canvas && canvas.dataset ? canvas.dataset.phase7OutputInput || '' : '',
      phase8Output: canvas && canvas.dataset ? canvas.dataset.phase8Output || '' : '',
      sceneProofVerdict: canvas && canvas.dataset ? canvas.dataset.sceneProofVerdict || '' : '',
      sceneProofError: canvas && canvas.dataset ? canvas.dataset.sceneProofError || '' : '',
      sceneProofLostCount: canvas && canvas.dataset ? canvas.dataset.sceneProofLostCount || '0' : '0',
      sceneProofNotProvenCount: canvas && canvas.dataset ? canvas.dataset.sceneProofNotProvenCount || '0' : '0',
      sceneProofRequiredLostIds: canvas && canvas.dataset ? canvas.dataset.sceneProofRequiredLostIds || '[]' : '[]',
      sceneProofRequiredNotProvenIds: canvas && canvas.dataset
        ? canvas.dataset.sceneProofRequiredNotProvenIds || '[]'
        : '[]',
      sceneProofRequiredFailures: canvas && canvas.dataset
        ? canvas.dataset.sceneProofRequiredFailures || '[]'
        : '[]',
      phase7RenderData: canvas && canvas.dataset ? canvas.dataset.phase7RenderData || '' : '',
      phase7RenderDataKey: canvas && canvas.dataset ? canvas.dataset.phase7RenderDataKey || '' : '',
      phase7RenderPath: canvas && canvas.dataset ? canvas.dataset.phase7RenderPath || '' : '',
      phase7RendererConsumption: rendererConsumption,
      webgpuObjectRealization: objectRealization,
      phase7CameraConsumed: rendererConsumption && rendererConsumption.cameraConsumed === true,
      phase7LightCountConsumed: Number(rendererConsumption && rendererConsumption.lightCountConsumed || 0),
      phase7MaterialCountConsumed: Number(rendererConsumption && rendererConsumption.materialCountConsumed || 0),
      phase7DepthEnabled: rendererConsumption && rendererConsumption.depthEnabled === true,
      phase7NormalShading: rendererConsumption && rendererConsumption.normalShading === true,
      phase7ConstructionProgramCount: Number(rendererConsumption && rendererConsumption.constructionProgramCount || 0),
      phase7ModelEvaluatedConstructionCount: Number(rendererConsumption && rendererConsumption.modelEvaluatedConstructionCount || 0),
      phase7InputVisualObligationCount: canvas && canvas.dataset
        ? Number(canvas.dataset.phase7InputVisualObligationCount || 0)
        : 0,
      phase7PixelReadback: canvas && canvas.dataset ? canvas.dataset.phase7PixelReadback || '' : '',
      phase7PixelReadbackMessage: canvas && canvas.dataset ? canvas.dataset.phase7PixelReadbackMessage || '' : '',
      phase7PixelReadbackPlan: canvas && canvas.dataset ? canvas.dataset.phase7PixelReadbackPlan || '' : '',
      phase7LivePixelSamplesRequired: canvas && canvas.dataset ? canvas.dataset.phase7LivePixelSamplesRequired || '' : '',
      phase7RequiredVisualObligationCount: canvas && canvas.dataset
        ? Number(canvas.dataset.phase7RequiredVisualObligationCount || 0)
        : 0,
      phase7PixelProofStatus: canvas && canvas.dataset ? canvas.dataset.phase7PixelProofStatus || '' : '',
      phase7PixelSampleCount: canvas && canvas.dataset ? Number(canvas.dataset.phase7PixelSampleCount || 0) : 0,
      phase7PixelVisibleSampleCount: canvas && canvas.dataset ? Number(canvas.dataset.phase7PixelVisibleSampleCount || 0) : 0,
      phase7PixelMinContrast: canvas && canvas.dataset ? Number(canvas.dataset.phase7PixelMinContrast || 0) : 0,
      phase7PixelSampledObligationCount: canvas && canvas.dataset ? Number(canvas.dataset.phase7PixelSampledObligationCount || 0) : 0,
      phase7SemanticAbsenceObligationCount: canvas && canvas.dataset ? Number(canvas.dataset.phase7SemanticAbsenceObligationCount || 0) : 0,
      phase7PixelSettledObligationCount: canvas && canvas.dataset ? Number(canvas.dataset.phase7PixelSettledObligationCount || 0) : 0,
      phase7PixelRequiredObligationCount: canvas && canvas.dataset ? Number(canvas.dataset.phase7PixelRequiredObligationCount || 0) : 0,
      phase7PixelSampledObligations: canvas && canvas.dataset ? canvas.dataset.phase7PixelSampledObligations || '' : '',
      phase7PixelSamples,
      webgpuOptimizationPath: canvas && canvas.dataset ? canvas.dataset.webgpuOptimizationPath || '' : '',
      webgpuFeatureFlags: canvas && canvas.dataset ? canvas.dataset.webgpuFeatureFlags || '' : '',
      webgpuSceneInstanceCapacity: canvas && canvas.dataset ? Number(canvas.dataset.webgpuSceneInstanceCapacity || 0) : 0,
      webgpuSceneInstanceCount: canvas && canvas.dataset ? Number(canvas.dataset.webgpuSceneInstanceCount || 0) : 0,
      webgpuStorageBytes: canvas && canvas.dataset ? Number(canvas.dataset.webgpuStorageBytes || 0) : 0,
      phaseArtifactSchemas,
      sceneRenderPacket: canvas && canvas.dataset ? canvas.dataset.sceneRenderPacket || '' : '',
      sceneRenderEntityCount: canvas && canvas.dataset ? Number(canvas.dataset.sceneRenderEntityCount || 0) : 0,
      sceneRenderFieldCount: canvas && canvas.dataset ? Number(canvas.dataset.sceneRenderFieldCount || 0) : 0,
      sceneRenderEffectCount: canvas && canvas.dataset ? Number(canvas.dataset.sceneRenderEffectCount || 0) : 0,
      sceneRenderSpatialHash: canvas && canvas.dataset ? canvas.dataset.sceneRenderSpatialHash || '' : '',
      sceneObjectUniforms: canvas && canvas.dataset ? canvas.dataset.sceneObjectUniforms || '' : '',
      sceneObjectIdentities: canvas && canvas.dataset ? canvas.dataset.sceneObjectIdentities || '' : '',
      sceneRenderPacketEntities: (sceneRenderPacket && sceneRenderPacket.entities || []).map((row) => ({
        id: row.id || '',
        label: row.label || '',
        identity: row.identity && row.identity.type || '',
        directlyGrounded: row.directlyGrounded === true,
        supportOnly: row.supportOnly === true,
        representedEntityIds: (row.representedEntityIds || []).slice(0, 12),
        position: row.transform && row.transform.position || [],
        scale: row.transform && row.transform.scale || [],
        grammarId: row.geometry && row.geometry.program && row.geometry.program.grammarId || '',
      })),
      physicsCanvasRenderCount: canvas && canvas.dataset ? canvas.dataset.renderCount || '' : '',
      physicsCanvasLastFrameMs: canvas && canvas.dataset ? canvas.dataset.lastFrameMs || '' : '',
      fieldCanvasRenderer: fieldCanvas && fieldCanvas.dataset ? fieldCanvas.dataset.renderer || '' : '',
      fieldCanvasRendererStatus: fieldCanvas && fieldCanvas.dataset ? fieldCanvas.dataset.rendererStatus || '' : '',
      canvasRect: canvas ? (() => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: Number(rect.x.toFixed(2)),
          y: Number(rect.y.toFixed(2)),
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2)),
        };
      })() : null,
      sampleCount: samples,
      sampleSource: samples ? 'canvas-2d' : 'none',
      lumaMean: Number(mean.toFixed(3)),
      lumaStd: Number(Math.sqrt(variance).toFixed(3)),
      coloredRatio: samples ? Number((colored / samples).toFixed(4)) : 0,
      canvasHash: (hash >>> 0).toString(16).padStart(8, '0'),
      specId: parsed && parsed.id || modelSpec && modelSpec.id || '',
      templateId: parsed && parsed.templateId || modelSpec && modelSpec.templateId || '',
      rendererSceneKind: rendererPlan && rendererPlan.sceneKind || '',
      visualIRSceneKind: visualIR && visualIR.sceneKind || '',
      visualIRCamera: visualIR && visualIR.camera && visualIR.camera.mode || '',
      visualIREntityCount: visualIRArrayCount('entities'),
      visualIRMaterialCount: visualIRArrayCount('materials'),
      visualIRFieldCount: visualIRArrayCount('fields'),
      visualIRProcessCount: visualIRArrayCount('processes'),
      visualIROperatorCount: visualIRArrayCount('operators'),
      visualIRRenderInstanceCount: visualIRArrayCount('renderInstances'),
      visualIRRejectedRowCount: visualIRArrayCount('rejectedRows'),
      visualIRReceiptCount: visualIRArrayCount('receipts'),
      visualIRCausalAffordanceCount: visualIRArrayCount('causalAffordances'),
      visualIRSceneRenderPacketSchema: sceneRenderPacket && sceneRenderPacket.schema || '',
      visualIRSceneRenderPacketCompiler: sceneRenderPacket && sceneRenderPacket.compiler || '',
      visualIREnvironmentProgram: sceneRenderPacket && sceneRenderPacket.environmentProgram &&
        sceneRenderPacket.environmentProgram.kind || '',
      visualIRSceneRenderPacketEntityCount: sceneRenderPacket && Array.isArray(sceneRenderPacket.entities)
        ? sceneRenderPacket.entities.length
        : 0,
      visualIRSceneRenderPacketFieldCount: sceneRenderPacket && Array.isArray(sceneRenderPacket.fields)
        ? sceneRenderPacket.fields.length
        : 0,
      visualIRSceneRenderPacketEffectCount: sceneRenderPacket && Array.isArray(sceneRenderPacket.effects)
        ? sceneRenderPacket.effects.length
        : 0,
      phase6VisualObligationCount: phase6VisualCompile && Array.isArray(phase6VisualCompile.visualObligations)
        ? phase6VisualCompile.visualObligations.length
        : 0,
      phase6VisualObligationIds: phase6VisualCompile && Array.isArray(phase6VisualCompile.visualObligations)
        ? phase6VisualCompile.visualObligations.map((row) => row.obligationId || row.id || '').filter(Boolean)
        : [],
      visualIRSceneRenderPacketLayers: sceneRenderPacket ? Array.from(new Set([
        ...((sceneRenderPacket.entities || []).map((row) => row.layerSlot)),
        ...((sceneRenderPacket.fields || []).map((row) => row.layerSlot)),
        ...((sceneRenderPacket.effects || []).map((row) => row.layerSlot)),
      ].filter(Boolean))).slice(0, 24) : [],
      visualIRSceneRenderPacketIdentities: sceneRenderPacket ? Array.from(new Set(
        (sceneRenderPacket.entities || [])
          .map((row) => row && row.identity && (row.identity.label || row.identity.type))
          .filter(Boolean)
      )).slice(0, 32) : [],
      visualIRAcceptedRenderInstances: (visualIR && Array.isArray(visualIR.renderInstances) ? visualIR.renderInstances : [])
        .filter((row) => row.status !== 'rejected')
        .length,
      visualIRRenderInstanceSlots: (visualIR && Array.isArray(visualIR.renderInstances) ? visualIR.renderInstances : [])
        .map((row) => row.layerSlot)
        .filter(Boolean)
        .slice(0, 24),
      visualIRRejectedRows: (visualIR && Array.isArray(visualIR.rejectedRows) ? visualIR.rejectedRows : [])
        .map((row) => ({
          id: row.id || '',
          sourceKind: row.sourceKind || '',
          reason: row.reason || '',
        }))
        .slice(0, 16),
      visualIRGraphicsAtomCount: ['geometry', 'fields', 'materials', 'processes', 'motion', 'camera']
        .reduce((sum, key) => sum + (Array.isArray(graphicsAtoms[key]) ? graphicsAtoms[key].length : 0), 0),
      visualIRGraphicsMappingIds: (graphicsAtoms.mappings || []).map((row) => row.id).slice(0, 12),
      visualIRGraphicsCompiler: graphicsAtoms.compiler || '',
      visualIRGraphicsUniformSlots: Object.entries(atomUniforms.bySlot || {})
        .filter((entry) => Number(entry[1]) > 0)
        .map((entry) => entry[0]),
      visualIRGraphicsUniformValues: Object.fromEntries(Object.entries(atomUniforms.bySlot || {})
        .filter((entry) => Number(entry[1]) > 0)
        .map((entry) => [entry[0], Number(Number(entry[1]).toFixed(3))])),
      visualIRGraphicsWgslOperators: (graphicsAtoms.wgslOperators || []).slice(0, 16),
      visualIRGraphicsLanguageSignals: (graphicsAtoms.languageSignals || []).map((row) => ({
        id: row.id || '',
        kind: row.kind || '',
        text: row.text || '',
        slots: row.slots || []
      })).slice(0, 24),
      intentBriefSchema: intentBrief && intentBrief.schema || '',
      intentBriefEvidenceCount: intentBriefArrayCount('retrievedEvidence'),
      intentBriefCausalEdgeCount: intentBriefArrayCount('causalGraph'),
      intentBriefAssumptionCount: intentBriefArrayCount('assumptions'),
      intentBriefUnsupportedCount: intentBriefArrayCount('unsupported'),
      intentBriefDegradedCount: intentBriefArrayCount('degradedTo'),
      physicalReceiptIntentEvidenceCount: physicalReceipt.intentEvidenceCount || 0,
      physicalReceiptCausalEdgeCount: physicalReceipt.causalEdgeCount || 0,
      physicalReceiptCausalAffordanceCount: physicalReceipt.causalAffordanceCount || 0,
      physicalReceiptAssumptionCount: physicalReceipt.assumptionCount || 0,
      physicalReceiptUnsupportedCount: physicalReceipt.unsupportedCount || 0,
      physicalReceiptDegradedCount: physicalReceipt.degradedCount || 0,
      intentBriefAffordanceCount: intentBrief &&
        intentBrief.visualIntent &&
        Array.isArray(intentBrief.visualIntent.affordances)
        ? intentBrief.visualIntent.affordances.length
        : 0,
      previewLength: previewText.length,
    };
  })()`;
}
