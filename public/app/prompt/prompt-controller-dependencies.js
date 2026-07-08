(function initSimulattePhysicsRendererDependencies(root) {
  const scope = root.__SimulattePhysicsRendererRefactorScope = root.__SimulattePhysicsRendererRefactorScope || {};
  if (scope.initialized) return;
  function markMissingDependency(moduleName, dependencyName) {
      const state = root.SimulatteBoot = root.SimulatteBoot || { failedScripts: [] };
      state.missingDependencies = state.missingDependencies || [];
      state.missingDependencies.push({ moduleName, dependencyName });
      console.warn(`[simulatte.boot] ${moduleName} waiting for ${dependencyName}`);
    }
  const model = typeof module === 'object' && module.exports
      ? require('../../pipeline/phase-05-simulation/simulatte-physics-model.js')
      : root.SimulattePhysicsModel;
  if (!model) {
      markMissingDependency('SimulattePhysicsRenderer', 'SimulattePhysicsModel');
      scope.missingDependency = true; return;
    }
  const runtimeProgress = typeof module === 'object' && module.exports
      ? require('../runtime/runtime-progress.js')
      : root.SimulatteRuntimeProgress;
  if (!runtimeProgress) {
      markMissingDependency('SimulattePhysicsRenderer', 'SimulatteRuntimeProgress');
      scope.missingDependency = true; return;
    }
  scope.root = root;
  scope.model = model;
  scope.runtimeProgressApi = runtimeProgress;
  scope.initialized = true;
})(typeof globalThis !== 'undefined' ? globalThis : window);
