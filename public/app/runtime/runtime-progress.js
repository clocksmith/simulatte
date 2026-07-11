(function attachSimulatteRuntimeProgress(root) {
  if (typeof module === 'object' && module.exports) {
    require('./runtime-progress-dependencies.js');
    require('./runtime-progress-constants.js');
    require('./runtime-progress-controller.js');
    require('./runtime-progress-reducer.js');
    require('./runtime-progress-observers.js');
  }
  const scope = root.__SimulatteRuntimeProgressRefactorScope = root.__SimulatteRuntimeProgressRefactorScope || {};
  if (scope.missingDependency) return;
  let api;
  with (scope) {
    api = {
    EVENT_SCHEMA,
    STATE_SCHEMA,
    LOADER_RECEIPT_SCHEMA,
    PROGRESS_LOG_SCHEMA,
    RUNTIME_PHASES,
    connect,
    createController,
    createLoadingCanvasObserver,
    createRunButtonObserver,
    createRuntimeHealthObserver,
    createRuntimeStripObserver,
    initialState,
    reduceRuntimeProgress,
  };
  }
  if (typeof module === 'object' && module.exports) {
      module.exports = api;
    }
  root.SimulatteRuntimeProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
