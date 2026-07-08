(function attachSimulatteReviewBridgesync(root) {
  const scope = root.__SimulatteReviewBridgeRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    'use strict';

    const TRAINING_LABELS = Object.freeze([
        label('pass', 'looks right', 'Looks right', '1'),
      ]);

    const PHASE_TARGETS = Object.freeze([
        phaseTarget('final', 'Final', 1, 8),
        phaseTarget('1-2', '1->2', 1, 2),
        phaseTarget('1-3', '1->3', 1, 3),
        phaseTarget('1-4', '1->4', 1, 4),
        phaseTarget('1-5', '1->5', 1, 5),
        phaseTarget('1-6', '1->6', 1, 6),
        phaseTarget('1-7', '1->7', 1, 7),
        phaseTarget('1-8', '1->8', 1, 8),
      ]);

    const PHASE_NAMES = Object.freeze({
        2: 'Language graph',
        3: 'Embedding retrieval',
        4: 'Activation cloud',
        5: 'Grounded intent',
        6: 'Simulation compile',
        7: 'VisualIR compile',
        8: 'WebGPU ready',
      });

    const reviewStore = createReviewStore(root);

    let selectedPhaseId = storedPhaseId();

    Object.assign(scope, {
      TRAINING_LABELS,
      PHASE_TARGETS,
      PHASE_NAMES,
      reviewStore,
      selectedPhaseId,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
