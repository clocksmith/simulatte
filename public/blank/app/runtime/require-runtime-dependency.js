(function attachSimulatteRuntimeDependency(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteRuntimeDependency = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRuntimeDependencyApi() {
  function requireRuntimeDependency({ root, moduleName, dependencyName, value }) {
    if (value) return value;
    const state = root.SimulatteBoot = root.SimulatteBoot || { failedScripts: [] };
    state.missingDependencies = state.missingDependencies || [];
    state.missingDependencies.push({ moduleName, dependencyName });
    const error = new Error(`${moduleName} requires ${dependencyName}`);
    error.code = 'SIMULATTE_MISSING_RUNTIME_DEPENDENCY';
    error.moduleName = moduleName;
    error.dependencyName = dependencyName;
    throw error;
  }

  return Object.freeze({ requireRuntimeDependency });
});
