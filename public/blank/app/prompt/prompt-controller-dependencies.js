(function attachSimulattePromptControllerSupport(root) {
  const model = typeof module === 'object' && module.exports
    ? require('../../pipeline/phase-05-simulation/simulatte-physics-model.js')
    : root.SimulattePhysicsModel;
  const runtimeProgressApi = typeof module === 'object' && module.exports
    ? require('../runtime/runtime-progress.js')
    : root.SimulatteRuntimeProgress;
  if (!model || !runtimeProgressApi) {
    throw new Error('SimulattePromptControllerSupport requires physics model and runtime progress');
  }
  const {
    EXAMPLE_INTENTS,
    clamp,
    controlsForSpec,
    createRenderExecutionInput,
    createSimulationState,
    createSpec,
    createSpecFromPrompt,
    deserializeSpec,
    normalizeSpec,
    readoutLabelsForSpec,
    readoutValues,
    remixSpec,
    serializeSpec,
    stateLabel,
    stepSimulation,
  } = model;

  function countRows(rows) {
    return Array.isArray(rows) ? rows.length : 0;
  }

  function worldModelSummary(prompt, sceneKind, counts) {
    const source = String(prompt || '').trim() || 'blank construction plane';
    const compact = source.length > 84 ? `${source.slice(0, 81).trim()}...` : source;
    const evidence = counts.graphNodes || counts.visualEntities || counts.graphicsAtomRows
      ? `${counts.graphNodes} nodes, ${counts.visualEntities} visual entities, ${counts.graphicsAtomRows} atoms`
      : 'awaiting compiled evidence';
    return `${compact} -> ${sceneKind || 'world'} | ${evidence}`;
  }

  function worldModelSnapshot(spec = {}) {
    const intentBrief = spec.intent && spec.intent.intentBrief || {};
    const universeBrief = spec.universeGraph && spec.universeGraph.intentBrief || {};
    const physicalReceipt = spec.physicalSpec && spec.physicalSpec.receipt || {};
    const receiptBrief = physicalReceipt.intentBrief || {};
    const renderReceipt = spec.renderIR && spec.renderIR.intentBriefReceipt || {};
    const compactBrief = renderReceipt.schema ? renderReceipt : receiptBrief;
    const visualIR = spec.renderProgram && spec.renderProgram.visualIR || {};
    const graphicsAtoms = visualIR.graphicsAtoms || {};
    const prompt = spec.renderIR && spec.renderIR.prompt ||
      spec.universeGraph && spec.universeGraph.prompt || spec.name || '';
    const sceneKind = visualIR.sceneKind ||
      spec.renderProgram && spec.renderProgram.rendererPlan && spec.renderProgram.rendererPlan.sceneKind ||
      spec.renderIR && spec.renderIR.sceneHint || spec.templateId || 'blank-world';
    const languageSpans = countRows(intentBrief.languageEvidence && intentBrief.languageEvidence.spans) ||
      countRows(universeBrief.languageEvidence && universeBrief.languageEvidence.spans) ||
      countRows(compactBrief.languageSpans);
    const acceptedActivations = countRows(intentBrief.groundedInterpretation && intentBrief.groundedInterpretation.acceptedActivations) ||
      countRows(universeBrief.groundedInterpretation && universeBrief.groundedInterpretation.acceptedActivations) ||
      countRows(compactBrief.acceptedActivations);
    const graphNodes = countRows(spec.universeGraph && spec.universeGraph.nodes);
    const graphEdges = countRows(spec.universeGraph && spec.universeGraph.edges);
    const physicsOperators = countRows(spec.physicsIR && spec.physicsIR.operators);
    const visualEntities = countRows(visualIR.entities);
    const visualProcesses = countRows(visualIR.processes);
    const graphicsAtomRows = [
      'mappings', 'geometry', 'fields', 'materials', 'processes', 'motion', 'camera', 'languageSignals',
    ].reduce((sum, key) => sum + countRows(graphicsAtoms[key]), 0);
    const assumptions = countRows(intentBrief.assumptions) || countRows(universeBrief.assumptions) ||
      Number(physicalReceipt.assumptionCount || 0);
    const unsupported = countRows(intentBrief.unsupported) + countRows(intentBrief.degradedTo) ||
      countRows(universeBrief.unsupported) + countRows(universeBrief.degradedTo) ||
      Number(physicalReceipt.unsupportedCount || 0) + Number(physicalReceipt.degradedCount || 0);
    return {
      schema: 'simulatte.visibleWorldModelReceipt.v1',
      template: spec.templateId || '',
      prompt,
      sceneKind,
      summary: worldModelSummary(prompt, sceneKind, { graphNodes, graphEdges, visualEntities, graphicsAtomRows }),
      languageSpans,
      acceptedActivations,
      graphNodes,
      graphEdges,
      physicsOperators,
      solverSteps: countRows(spec.solverGraph && spec.solverGraph.steps),
      visualEntities,
      visualProcesses,
      graphicsAtoms: graphicsAtomRows,
      mappings: countRows(graphicsAtoms.mappings),
      wgslOperators: countRows(graphicsAtoms.wgslOperators),
      assumptions,
      unsupported,
      receipts: {
        intentBrief: intentBrief.schema || universeBrief.schema || compactBrief.schema || '',
        universeGraph: spec.universeGraph && spec.universeGraph.schema || '',
        physicsIR: spec.physicsIR && spec.physicsIR.schema || '',
        solverGraph: spec.solverGraph && spec.solverGraph.schema || '',
        visualIR: visualIR.schema || '',
        graphicsAtoms: graphicsAtoms.schema || '',
      },
    };
  }

  const api = Object.freeze({
    model,
    runtimeProgressApi,
    EXAMPLE_INTENTS,
    clamp,
    controlsForSpec,
    createRenderExecutionInput,
    createSimulationState,
    createSpec,
    createSpecFromPrompt,
    deserializeSpec,
    normalizeSpec,
    readoutLabelsForSpec,
    readoutValues,
    remixSpec,
    serializeSpec,
    stateLabel,
    stepSimulation,
    worldModelSnapshot,
  });
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulattePromptControllerSupport = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
