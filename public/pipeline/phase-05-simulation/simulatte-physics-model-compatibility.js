(function attachSimulattePhysicsModelcompatibility(root) {
  const scope = root.__SimulattePhysicsModelRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const LEDGER_FAILURE_STATUSES = Object.freeze(new Set(['lost', 'failed', 'wrong-identity', 'not-proven']));

    const PHASE_CARRY_FORBIDDEN_FIELD_NAMES = Object.freeze([
        'activationCloud',
        'rankedPrimitives',
        'rankedCards',
        'rankedUniverseRows',
        'semanticRag',
        'physicsIR',
        'renderIR',
        'visualIR',
        'renderProgram',
      ]);

    const PHASE3_GENERIC_PROMPT_MATCH_VALUES = Object.freeze(new Set([
        'body',
        'component',
        'constraint',
        'entity',
        'field',
        'material',
        'math',
        'object',
        'physics',
        'process',
      ]));

    const PHASE_CONTRACTS = Object.freeze({
    	    1: phaseContract(1, PHASE_ZERO_INPUT_SCHEMA, ['runtimeContext', 'promptIngress', 'compositionLedger'], [
          'phase1-runtime-context',
          'model-ready',
          'model-probe',
          'cache-health',
          'runtime-ready',
        ], []),
    	    2: phaseContract(2, phaseOutputSchema(1), ['languageGraph', 'sceneLanguageGraph', 'queryPlan', 'compositionLedger', 'promptParse'], ['phase2-language-graph'], [
          'retrievalRows',
          'activationCloud',
          'groundedIntent',
          'renderIR',
          'visualIR',
          'renderProgram',
        ]),
    	    3: phaseContract(3, phaseOutputSchema(2), ['languageGraph', 'sceneLanguageGraph', 'queryPlan', 'retrievalRerankResult', 'activationCloud', 'compositionLedger'], ['phase3-retrieval-rerank', 'phase3-activation-fusion'], [
          'rawPrompt',
          'spec.intent',
          'groundedIntent',
          'physicsIR',
          'renderIR',
          'visualIR',
          'renderProgram',
        ]),
    	    4: phaseContract(4, phaseOutputSchema(3), ['activationCloud', 'groundedIntent', 'groundedSceneContract', 'compositionLedger'], ['phase4-grounded-intent'], [
          'rawPrompt',
          'rankedPrimitives',
          'rankedCards',
          'rankedUniverseRows',
          'semanticRag',
          'physicsIR',
          'renderIR',
          'visualIR',
          'renderProgram',
        ]),
    	    5: phaseContract(5, phaseOutputSchema(4), ['simulationCompile', 'compositionLedger'], ['phase5-simulation-compile'], [
          'rawPrompt',
          'retrievalRows',
          'activationCloudWithoutPhase4',
          'renderProgram',
          'visualIR',
        ]),
    	    6: phaseContract(6, phaseOutputSchema(5), ['visualCompile', 'compositionLedger'], ['phase6-visual-compile'], [
          'rawPrompt',
          'spec.intent',
          'retrievalRows',
          'activationCloud',
          'groundedIntentDirect',
          'renderProgram.visualIR',
        ]),
    	    7: phaseContract(7, phaseOutputSchema(6), ['renderExecution', 'compositionLedger'], ['phase7-webgpu-render'], [
          'rawPrompt',
          'promptParse',
          'spec.intent',
          'retrievalRows',
          'activationCloud',
          'groundedIntent',
          'renderIR',
          'visualIR',
          'renderProgram',
        ]),
    	    8: phaseContract(8, phaseOutputSchema(7), ['sceneProof', 'compositionLedger'], ['phase8-scene-proof'], [
          'rawPrompt',
          'promptParse',
          'spec.intent',
          'retrievalRows',
          'activationCloud',
          'groundedIntent',
          'renderIR',
          'visualIR',
          'renderProgram',
        ]),
      });

    Object.assign(scope, {
      LEDGER_FAILURE_STATUSES,
      PHASE_CARRY_FORBIDDEN_FIELD_NAMES,
      PHASE3_GENERIC_PROMPT_MATCH_VALUES,
      PHASE_CONTRACTS,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
