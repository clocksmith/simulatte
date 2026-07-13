(function attachSimulatteOperatorStage(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SimulatteOperatorStage = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createOperatorStageApi() {
  function stageForOperator(type) {
    if (type === 'heat_source') return 'sources';
    if ([
      'advection',
      'diffusion',
      'wave_field',
      'reaction_diffusion',
      'growth_decay',
      'network_flow',
      'particle_deposition',
      'fluid_locomotion',
      'wake_generation',
    ].includes(type)) {
      return 'fields';
    }
    if ([
      'heat_transfer',
      'rotational_torque',
      'phase_transition',
      'pressure_flow_lite',
      'buoyancy',
      'drag',
      'body_water_contact',
      'partial_submersion',
    ].includes(type)) {
      return 'couplings';
    }
    if (['rigid_collision', 'fracture_threshold'].includes(type)) return 'collisions';
    if (type === 'derive_readout') return 'derivedReadouts';
    return 'events';
  }

  return Object.freeze({ stageForOperator });
});
