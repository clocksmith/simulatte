(function initSimulatteCompositionGraphDependencies(root) {
  const moduleRegistry = typeof module === 'object' && module.exports
    ? require('../../app/runtime/phase-module-registry.js')
    : root.SimulattePhaseModuleRegistry;
  const scope = moduleRegistry.family('compositionGraph');
  if (scope.initialized) return;
  const dependencyApi = typeof module === 'object' && module.exports
      ? require('../../app/runtime/require-runtime-dependency.js')
      : root.SimulatteRuntimeDependency;
  const requireRuntimeDependency = dependencyApi.requireRuntimeDependency;
  const catalog = typeof module === 'object' && module.exports
      ? require('../phase-05-simulation/simulatte-physics-catalog.js')
      : root.SimulattePhysicsCatalog;
  const visualOperatorCompiler = typeof module === 'object' && module.exports
      ? require('./simulatte-visual-operator-compiler.js')
      : root.SimulatteVisualOperatorCompiler;
  const scenePacketContract = typeof module === 'object' && module.exports
      ? require('./simulatte-scene-packet-contract.js')
      : root.SimulatteScenePacketContract;
  const deterministicValues = typeof module === 'object' && module.exports
      ? require('../../../shared/deterministic-values.js')
      : root.SimulatteDeterministicValues;
  const positiveLanguage = typeof module === 'object' && module.exports
      ? require('../../../shared/language/positive-language.js')
      : root.SimulattePositiveLanguage;
  requireRuntimeDependency({
    root,
    moduleName: 'SimulatteCompositionGraph',
    dependencyName: 'SimulattePhysicsCatalog',
    value: catalog,
  });
  requireRuntimeDependency({
    root,
    moduleName: 'SimulatteCompositionGraph',
    dependencyName: 'SimulatteVisualOperatorCompiler',
    value: visualOperatorCompiler,
  });
  requireRuntimeDependency({
    root,
    moduleName: 'SimulatteCompositionGraph',
    dependencyName: 'SimulatteScenePacketContract',
    value: scenePacketContract,
  });
  requireRuntimeDependency({
    root,
    moduleName: 'SimulatteCompositionGraph',
    dependencyName: 'SimulatteDeterministicValues',
    value: deterministicValues,
  });
  requireRuntimeDependency({
    root,
    moduleName: 'SimulatteCompositionGraph',
    dependencyName: 'SimulattePositiveLanguage',
    value: positiveLanguage,
  });
  moduleRegistry.define('compositionGraph', 'simulatte-composition-graph-dependencies.js', {
    root,
    catalog,
    visualOperatorCompiler,
    ...scenePacketContract,
    ...deterministicValues,
    positiveLanguageText: (value) => positiveLanguage.positiveLanguageText(value, { lowercase: true }),
    initialized: true,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
