(function initSimulattePhysicsCatalogDependencies(root) {
  const moduleRegistry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js')
    : root.SimulattePhaseModuleRegistry;
  const scope = moduleRegistry.family('physicsCatalog');
  if (scope.initialized) return;

  moduleRegistry.define('physicsCatalog', 'simulatte-physics-catalog-dependencies.js', {
    root,
    initialized: true,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
