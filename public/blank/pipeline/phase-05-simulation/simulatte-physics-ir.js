(function attachSimulattePhysicsIR(root) {
  if (typeof module === 'object' && module.exports) {
    require('./simulatte-physics-ir-dependencies.js');
    require('./simulatte-physics-ir-constants.js');
    require('./simulatte-physics-ir-builder.js');
    require('./simulatte-physics-ir-domains.js');
    require('./simulatte-physics-ir-behaviors.js');
    require('./simulatte-physics-ir-operators.js');
  }
  const scope = root.__SimulattePhysicsIRRefactorScope = root.__SimulattePhysicsIRRefactorScope || {};
  if (scope.missingDependency) return;
  let api;
  with (scope) {
    api = {
    PHYSICAL_IR_SCHEMA,
    buildPhysicsIR,
  };
  }
  if (typeof module === 'object' && module.exports) {
      module.exports = api;
    }
  root.SimulattePhysicsIR = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
