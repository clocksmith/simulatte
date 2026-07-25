(function initSimulatteSemanticRagDependencies(root) {
  const moduleRegistry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js')
    : root.SimulattePhaseModuleRegistry;
  const scope = moduleRegistry.family('semanticRag');
  if (scope.initialized) return;
  const dependencyApi = typeof module === 'object' && module.exports
      ? require('../../app/runtime/require-runtime-dependency.js')
      : root.SimulatteRuntimeDependency;
  const requireRuntimeDependency = dependencyApi.requireRuntimeDependency;
  const catalog = typeof module === 'object' && module.exports
      ? require('../phase-05-simulation/simulatte-physics-catalog.js')
      : root.SimulattePhysicsCatalog;
  const constructionSubstrate = typeof module === 'object' && module.exports
      ? require('../../../data/simulatte-construction-substrate.js')
      : root.SimulatteConstructionSubstrate;
  const deterministicValues = typeof module === 'object' && module.exports
      ? require('../../../shared/deterministic-values.js')
      : root.SimulatteDeterministicValues;
  requireRuntimeDependency({
    root,
    moduleName: 'SimulatteSemanticRag',
    dependencyName: 'SimulattePhysicsCatalog',
    value: catalog,
  });
  requireRuntimeDependency({
    root,
    moduleName: 'SimulatteSemanticRag',
    dependencyName: 'SimulatteConstructionSubstrate',
    value: constructionSubstrate,
  });
  requireRuntimeDependency({
    root,
    moduleName: 'SimulatteSemanticRag',
    dependencyName: 'SimulatteDeterministicValues',
    value: deterministicValues,
  });
  moduleRegistry.define('semanticRag', 'simulatte-semantic-rag-dependencies.js', {
    root,
    catalog,
    constructionSubstrate,
    ...deterministicValues,
    initialized: true,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
