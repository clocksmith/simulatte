(function initSimulatteScenarioEngineDependencies(root) {
  const scope = root.__SimulatteScenarioEngineRefactorScope = root.__SimulatteScenarioEngineRefactorScope || {};
  if (scope.initialized) return;

  scope.root = root;
  scope.initialized = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
