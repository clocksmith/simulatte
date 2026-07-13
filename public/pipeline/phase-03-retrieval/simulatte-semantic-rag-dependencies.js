(function initSimulatteSemanticRagDependencies(root) {
  const scope = root.__SimulatteSemanticRagRefactorScope = root.__SimulatteSemanticRagRefactorScope || {};
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
  const constructionSubstrate = typeof module === 'object' && module.exports
      ? require('../../data/simulatte-construction-substrate.js')
      : root.SimulatteConstructionSubstrate;
  if (!catalog) {
      markMissingDependency('SimulatteSemanticRag', 'SimulattePhysicsCatalog');
      scope.missingDependency = true; return;
  }
  if (!constructionSubstrate) {
      markMissingDependency('SimulatteSemanticRag', 'SimulatteConstructionSubstrate');
      scope.missingDependency = true; return;
    }
  scope.root = root;
  scope.catalog = catalog;
  scope.constructionSubstrate = constructionSubstrate;
  scope.initialized = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
