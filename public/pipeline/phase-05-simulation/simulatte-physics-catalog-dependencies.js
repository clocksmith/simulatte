(function initSimulattePhysicsCatalogDependencies(root) {
  const scope = root.__SimulattePhysicsCatalogRefactorScope = root.__SimulattePhysicsCatalogRefactorScope || {};
  if (scope.initialized) return;

  scope.root = root;
  scope.initialized = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
