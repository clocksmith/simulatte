(function initSimulatteIntentEmbedderDependencies(root) {
  const moduleRegistry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js')
    : root.SimulattePhaseModuleRegistry;
  const scope = moduleRegistry.family('intentEmbedder');
  if (scope.initialized) return;
  const dependencyApi = typeof module === 'object' && module.exports
    ? require('../../app/runtime/require-runtime-dependency.js')
    : root.SimulatteRuntimeDependency;
  const deterministicValues = typeof module === 'object' && module.exports
    ? require('../../../shared/deterministic-values.js')
    : root.SimulatteDeterministicValues;
  dependencyApi.requireRuntimeDependency({
    root,
    moduleName: 'SimulatteIntentEmbedder',
    dependencyName: 'SimulatteDeterministicValues',
    value: deterministicValues,
  });

  moduleRegistry.define('intentEmbedder', 'simulatte-intent-embedder-dependencies.js', {
    root,
    ...deterministicValues,
    initialized: true,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
