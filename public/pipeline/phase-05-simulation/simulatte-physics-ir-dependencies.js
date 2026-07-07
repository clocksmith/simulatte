(function initSimulattePhysicsIRDependencies(root) {
  const scope = root.__SimulattePhysicsIRRefactorScope = root.__SimulattePhysicsIRRefactorScope || {};
  if (scope.initialized) return;
  const catalog = typeof module === 'object' && module.exports
      ? require('./simulatte-physics-catalog.js')
      : root.SimulattePhysicsCatalog;
  scope.root = root;
  scope.catalog = catalog || {};
  scope.initialized = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
