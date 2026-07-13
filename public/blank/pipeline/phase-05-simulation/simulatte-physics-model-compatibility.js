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

    Object.assign(scope, {
      LEDGER_FAILURE_STATUSES,
      PHASE_CARRY_FORBIDDEN_FIELD_NAMES,
      PHASE3_GENERIC_PROMPT_MATCH_VALUES,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
