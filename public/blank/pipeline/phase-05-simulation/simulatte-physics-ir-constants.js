(function attachSimulattePhysicsIRconstants(root) {
  const scope = root.__SimulattePhysicsIRRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const PHYSICAL_IR_SCHEMA = 'simulatte.physicalIR.v1';

    const SCENE_COMPOSITION_LEDGER_SCHEMA = 'simulatte.sceneCompositionLedger.v1';

    const TAU = Math.PI * 2;

    const {
        clamp = (value, min, max) => Math.max(min, Math.min(max, value)),
        clamp01 = (value) => Math.max(0, Math.min(1, value)),
        slugify = defaultSlugify,
        uniqueList = unique,
      } = catalog;

    Object.assign(scope, {
      PHYSICAL_IR_SCHEMA,
      SCENE_COMPOSITION_LEDGER_SCHEMA,
      TAU,
      clamp,
      clamp01,
      slugify,
      uniqueList,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
