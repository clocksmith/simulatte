(function attachSimulattePhysicsRenderer(root) {
  if (typeof module === 'object' && module.exports) {
    require('./prompt-controller-dependencies.js');
    require('./prompt-controller-model-bindings.js');
    require('./prompt-controller-construction-search.js');
    require('./prompt-controller-lab-controller.js');
    require('./prompt-controller-workers.js');
    require('./prompt-controller-training.js');
  }
  const scope = root.__SimulattePhysicsRendererRefactorScope = root.__SimulattePhysicsRendererRefactorScope || {};
  if (scope.missingDependency) return;
  let api;
  with (scope) {
    api = {
    createBrowserLab,
    start,
  };
  }
  if (typeof module === 'object' && module.exports) {
      module.exports = api;
    }
  root.SimulattePhysicsRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
