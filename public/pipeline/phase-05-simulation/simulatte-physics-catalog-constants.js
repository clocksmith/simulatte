(function attachSimulattePhysicsCatalogconstants(root) {
  const scope = root.__SimulattePhysicsCatalogRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const TAU = Math.PI * 2;

    const FIELD_GRID = 52;

    Object.assign(scope, {
      TAU,
      FIELD_GRID,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
