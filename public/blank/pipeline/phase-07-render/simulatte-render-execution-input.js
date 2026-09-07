(function attachRenderExecutionInput(root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('../simulatte-phase-contracts.js') : root.SimulattePhaseContracts;
  const worldProof = typeof module === 'object' && module.exports
    ? require('../../../shared/contracts/world-proof.js') : root.SimulatteWorldProof;
  const api = factory(contracts, worldProof);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRenderExecutionInput = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRenderInputApi(contracts, worldProof) {
  if (!contracts || !worldProof) throw new Error('Render input requires phase and WorldProof contracts');
  const RENDER_EXECUTION_INPUT_SCHEMA = 'simulatte.renderExecutionInput.v1';

  function createRenderExecutionInput(source = {}, simulationState = null, canvas = null, options = {}) {
    const phase6Output = source?.phase === 6 ? source : source?.phaseArtifacts?.phase6;
    if (!phase6Output) throw new Error(`renderExecutionInput source expected ${contracts.phaseOutputSchema(6)}, received ${source?.schema || 'missing phase6 artifact'}`);
    contracts.assertPhaseEnvelope(phase6Output, 6, 'renderExecutionInput source');
    const visualCompile = phase6Output.artifact.visualCompile;
    if (!visualCompile?.sceneRenderPacket) throw new Error('renderExecutionInput source missing artifact.visualCompile.sceneRenderPacket');
    return {
      schema: RENDER_EXECUTION_INPUT_SCHEMA,
      inputSchema: contracts.phaseOutputSchema(6),
      runtimeReceiptId: phase6Output.runtimeReceiptId || source.runtimeReceiptId || 'runtime:unknown',
      sceneRenderPacket: visualCompile.sceneRenderPacket,
      renderInstances: Array.isArray(visualCompile.renderInstances) ? visualCompile.renderInstances : [],
      visualObligations: Array.isArray(visualCompile.visualObligations) ? visualCompile.visualObligations : [],
      compositionLedger: visualCompile.compositionLedger || phase6Output.artifact.compositionLedger || null,
      worldProofBinding: worldProof.createWorldProofBinding(source, options),
      replayBaseline: options.replayBaseline || null,
      intentReceipt: options.intentReceipt || null,
      semanticReceipt: options.semanticReceipt || null,
      compilerDeterminismReceipt: options.compilerDeterminismReceipt || null,
      simulationReproducibilityReceipt: options.simulationReproducibilityReceipt || null,
      safetyReceipt: options.safetyReceipt || null,
      simulationState,
      canvas,
    };
  }

  return Object.freeze({ RENDER_EXECUTION_INPUT_SCHEMA, createRenderExecutionInput });
});
