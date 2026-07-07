(function attachSimulattePhysicsIRoperators(root) {
  const scope = root.__SimulattePhysicsIRRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const DOMAIN_KIND_BY_HINT = Object.freeze({
        fluid: 'fluid',
        thermal: 'field',
        phase: 'solid',
        solid: 'solid',
        fracture: 'solid',
        rigidBody: 'rigidBody',
        collision: 'rigidBody',
        rotationalMechanics: 'rigidBody',
        particles: 'particleSet',
        field: 'field',
        wave: 'field',
        oscillator: 'field',
        network: 'network',
        control: 'network',
        growth: 'field',
        terrain: 'solid',
        reaction: 'field',
        water: 'fluid',
        lake: 'fluid',
        pool: 'fluid',
        pond: 'fluid',
        river: 'fluid',
        ocean: 'fluid',
        beach: 'fluid',
      });

    Object.assign(scope, {
      DOMAIN_KIND_BY_HINT,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
