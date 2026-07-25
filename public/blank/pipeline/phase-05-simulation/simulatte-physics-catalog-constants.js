(function attachSimulattePhysicsCatalogconstants(root) {
  const scope = root.SimulattePhaseModuleRegistry.family('physicsCatalog');

    const TAU = Math.PI * 2;

    const FIELD_GRID = 52;

    root.SimulattePhaseModuleRegistry.define('physicsCatalog', 'simulatte-physics-catalog-constants.js', {
      TAU,
      FIELD_GRID,
    });

})(typeof globalThis !== 'undefined' ? globalThis : window);
