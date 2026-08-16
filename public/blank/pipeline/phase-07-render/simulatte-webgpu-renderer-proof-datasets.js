(function attachSimulatteWebGpuRendererProofDatasets(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('webGpuRenderer');

  function syncWorldProofDatasets(canvas, worldProof = null) {
    const intentProof = worldProof && worldProof.evidence &&
      worldProof.evidence.intentReceipt || null;
    const semanticProof = worldProof && worldProof.evidence &&
      worldProof.evidence.semanticReceipt || null;
    const compilerProof = worldProof && worldProof.evidence &&
      worldProof.evidence.compilerDeterminismReceipt || null;
    const simulationProof = worldProof && worldProof.evidence &&
      worldProof.evidence.simulationReproducibilityReceipt || null;
    const interactionProof = worldProof && worldProof.evidence &&
      worldProof.evidence.interactionProof || null;
    const safetyProof = worldProof && worldProof.evidence &&
      worldProof.evidence.safetyReceipt || null;
    canvas.dataset.worldProofVerdict = worldProof && worldProof.verdict || 'not-bound';
    canvas.dataset.worldProofContentHash = worldProof && worldProof.contentHash || '';
    canvas.dataset.worldProofWorldSpecHash = worldProof && worldProof.worldSpec.contentHash || '';
    canvas.dataset.worldProofCriticalFailures = JSON.stringify(
      worldProof && worldProof.criticalFailures || []
    );
    canvas.dataset.worldProofClassStatuses = JSON.stringify(
      Object.fromEntries(Object.entries(worldProof && worldProof.proofClasses || {})
        .map(([name, row]) => [name, row.status]))
    );
    canvas.dataset.intentProofStatus = intentProof && intentProof.status || 'not-proven';
    canvas.dataset.intentProofRequirementHash = intentProof && intentProof.requirementLedgerHash || '';
    canvas.dataset.intentProofSettlementHash = intentProof && intentProof.settlementLedgerHash || '';
    canvas.dataset.intentProofAcceptedCount = String(intentProof && intentProof.acceptedCount || 0);
    canvas.dataset.intentProofRefusalCount = String(intentProof && intentProof.explicitRefusalCount || 0);
    canvas.dataset.intentProofUnresolvedCount = String(intentProof && intentProof.unresolvedCount || 0);
    canvas.dataset.intentProofLostCount = String(intentProof && intentProof.lostCount || 0);
    canvas.dataset.semanticProofStatus = semanticProof && semanticProof.status || 'not-proven';
    canvas.dataset.semanticProofLedgerHash = semanticProof && semanticProof.provenanceLedgerHash || '';
    canvas.dataset.semanticProofGraphHash = semanticProof && semanticProof.graphHash || '';
    canvas.dataset.semanticProofBindingCount = String(semanticProof && semanticProof.bindingCount || 0);
    canvas.dataset.semanticProofProvenCount = String(semanticProof && semanticProof.provenCount || 0);
    canvas.dataset.semanticProofMissingCount = String(semanticProof && semanticProof.missingCount || 0);
    canvas.dataset.compilerDeterminismStatus = compilerProof && compilerProof.status || 'not-proven';
    canvas.dataset.compilerDeterminismInputHash = compilerProof && compilerProof.compilerInputHash || '';
    canvas.dataset.compilerDeterminismBaselineHash = compilerProof && compilerProof.baselineContentHash || '';
    canvas.dataset.compilerDeterminismRecompiledHash = compilerProof && compilerProof.recompiledContentHash || '';
    canvas.dataset.compilerDeterminismLane = compilerProof && compilerProof.compilerLane || '';
    canvas.dataset.simulationReproducibilityStatus = simulationProof && simulationProof.status || 'not-proven';
    canvas.dataset.simulationReproducibilityBaselineHash = simulationProof && simulationProof.baselineStateHash || '';
    canvas.dataset.simulationReproducibilityReplayHash = simulationProof && simulationProof.replayStateHash || '';
    canvas.dataset.simulationReproducibilityMaxDelta = String(simulationProof && simulationProof.maxAbsoluteDelta || 0);
    canvas.dataset.interactionProofStatus = interactionProof && interactionProof.status || 'not-proven';
    canvas.dataset.interactionProofContentHash = interactionProof && interactionProof.contentHash || '';
    canvas.dataset.interactionProofProgramHash = interactionProof && interactionProof.interactionProgramHash || '';
    canvas.dataset.interactionProofTransitionHash = interactionProof && interactionProof.transitionHash || '';
    canvas.dataset.interactionProofProvenTransitionCount = String(
      interactionProof && interactionProof.provenTransitionCount || 0
    );
    canvas.dataset.interactionProofInvalidTransitionCount = String(
      interactionProof && interactionProof.invalidTransitionCount || 0
    );
    canvas.dataset.interactionProofChangedChannelCount = String(
      interactionProof && interactionProof.changedChannelIds &&
      interactionProof.changedChannelIds.length || 0
    );
    canvas.dataset.safetyProofStatus = safetyProof && safetyProof.status || 'not-proven';
    canvas.dataset.safetyProofDecision = safetyProof && safetyProof.baselineDecision || '';
    canvas.dataset.safetyProofRulesHash = safetyProof && safetyProof.rulesHash || '';
    canvas.dataset.safetyProofBaselineHash = safetyProof && safetyProof.baselineTraceHash || '';
    canvas.dataset.safetyProofReplayHash = safetyProof && safetyProof.replayTraceHash || '';
  }

  function resetWorldProofDatasets(canvas) {
    canvas.dataset.worldProofVerdict = 'error';
    canvas.dataset.worldProofContentHash = '';
    canvas.dataset.worldProofWorldSpecHash = '';
    canvas.dataset.worldProofCriticalFailures = '[]';
    canvas.dataset.worldProofClassStatuses = '{}';
    canvas.dataset.intentProofStatus = 'error';
    canvas.dataset.intentProofRequirementHash = '';
    canvas.dataset.intentProofSettlementHash = '';
    canvas.dataset.intentProofAcceptedCount = '';
    canvas.dataset.intentProofRefusalCount = '';
    canvas.dataset.intentProofUnresolvedCount = '';
    canvas.dataset.intentProofLostCount = '';
    canvas.dataset.semanticProofStatus = 'error';
    canvas.dataset.semanticProofLedgerHash = '';
    canvas.dataset.semanticProofGraphHash = '';
    canvas.dataset.semanticProofBindingCount = '';
    canvas.dataset.semanticProofProvenCount = '';
    canvas.dataset.semanticProofMissingCount = '';
    canvas.dataset.compilerDeterminismStatus = 'error';
    canvas.dataset.compilerDeterminismInputHash = '';
    canvas.dataset.compilerDeterminismBaselineHash = '';
    canvas.dataset.compilerDeterminismRecompiledHash = '';
    canvas.dataset.compilerDeterminismLane = '';
    canvas.dataset.simulationReproducibilityStatus = 'error';
    canvas.dataset.simulationReproducibilityBaselineHash = '';
    canvas.dataset.simulationReproducibilityReplayHash = '';
    canvas.dataset.simulationReproducibilityMaxDelta = '';
    canvas.dataset.interactionProofStatus = 'error';
    canvas.dataset.interactionProofContentHash = '';
    canvas.dataset.interactionProofProgramHash = '';
    canvas.dataset.interactionProofTransitionHash = '';
    canvas.dataset.interactionProofProvenTransitionCount = '';
    canvas.dataset.interactionProofInvalidTransitionCount = '';
    canvas.dataset.interactionProofChangedChannelCount = '';
    canvas.dataset.safetyProofStatus = 'error';
    canvas.dataset.safetyProofDecision = '';
    canvas.dataset.safetyProofRulesHash = '';
    canvas.dataset.safetyProofBaselineHash = '';
    canvas.dataset.safetyProofReplayHash = '';
  }

  root.SimulattePhaseModuleRegistry.define(
    'webGpuRenderer',
    'simulatte-webgpu-renderer-proof-datasets.js',
    { syncWorldProofDatasets, resetWorldProofDatasets }
  );
})(typeof globalThis !== 'undefined' ? globalThis : window);
