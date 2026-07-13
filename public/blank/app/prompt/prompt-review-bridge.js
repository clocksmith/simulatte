(function attachSimulatteReviewBridge(root) {
  if (typeof module === 'object' && module.exports) {
    require('./prompt-review-bridge-dependencies.js');
    require('./prompt-review-bridge-state.js');
    require('./prompt-review-bridge-panel.js');
    require('./prompt-review-bridge-feedback.js');
    require('./prompt-review-bridge-sync.js');
  }
  const scope = root.__SimulatteReviewBridgeRefactorScope = root.__SimulatteReviewBridgeRefactorScope || {};
  if (scope.missingDependency) return;
  let api;
  with (scope) {
    api = {
    start,
    enable,
    disable,
    toggle,
    collectRecord,
    exportReviews,
    syncQueuedRecords,
  };
  }
  root.SimulatteReviewBridge = api;
  if (typeof document !== 'undefined') {
      document.addEventListener('DOMContentLoaded', () => api.start());
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
