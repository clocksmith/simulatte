(function initSimulatteCompositionGraphDependencies(root) {
  const scope = root.__SimulatteCompositionGraphRefactorScope = root.__SimulatteCompositionGraphRefactorScope || {};
  if (scope.initialized) return;
  function markMissingDependency(moduleName, dependencyName) {
      const state = root.SimulatteBoot = root.SimulatteBoot || { failedScripts: [] };
      state.missingDependencies = state.missingDependencies || [];
      state.missingDependencies.push({ moduleName, dependencyName });
      console.warn(`[simulatte.boot] ${moduleName} waiting for ${dependencyName}`);
    }
  const catalog = typeof module === 'object' && module.exports
      ? require('../phase-05-simulation/simulatte-physics-catalog.js')
      : root.SimulattePhysicsCatalog;
  const visualOperatorCompiler = typeof module === 'object' && module.exports
      ? require('./simulatte-visual-operator-compiler.js')
      : root.SimulatteVisualOperatorCompiler;
  if (!catalog) {
      markMissingDependency('SimulatteCompositionGraph', 'SimulattePhysicsCatalog');
      scope.missingDependency = true; return;
    }
  scope.root = root;
  scope.catalog = catalog;
  scope.visualOperatorCompiler = visualOperatorCompiler;
  scope.initialized = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
