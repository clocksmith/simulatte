(function attachSimulatteSolverRegistry(root, factory) {
  const solverModules = typeof module === 'object' && module.exports
    ? {
      advection: require('./solvers/simulatte-solver-advection.js'),
      constraints: require('./solvers/simulatte-solver-constraints.js'),
      fracture: require('./solvers/simulatte-solver-fracture-threshold.js'),
      growth: require('./solvers/simulatte-solver-growth-decay.js'),
      network: require('./solvers/simulatte-solver-network-control.js'),
      particles: require('./solvers/simulatte-solver-particles.js'),
      pressure: require('./solvers/simulatte-solver-pressure-flow-lite.js'),
      reaction: require('./solvers/simulatte-solver-reaction-diffusion.js'),
      rigid: require('./solvers/simulatte-solver-rigid-body-2d.js'),
      rotation: require('./solvers/simulatte-solver-rotational-mechanics.js'),
      thermal: require('./solvers/simulatte-solver-thermal.js'),
      wave: require('./solvers/simulatte-solver-wave-field.js'),
    }
    : {};
  const api = factory(root, solverModules);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteSolverRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSolverRegistryApi(root = {}, solverModules = {}) {
  const SOLVER_REGISTRY_SCHEMA = 'simulatte.solverRegistry.v1';
  const moduleApi = {
    advection: solverModules.advection || root.SimulatteAdvectionSolver,
    constraints: solverModules.constraints || root.SimulatteConstraintSolver,
    fracture: solverModules.fracture || root.SimulatteFractureThresholdSolver,
    growth: solverModules.growth || root.SimulatteGrowthDecaySolver,
    network: solverModules.network || root.SimulatteNetworkControlSolver,
    particles: solverModules.particles || root.SimulatteParticleSolver,
    pressure: solverModules.pressure || root.SimulattePressureFlowSolver,
    reaction: solverModules.reaction || root.SimulatteReactionDiffusionSolver,
    rigid: solverModules.rigid || root.SimulatteRigidBodySolver,
    rotation: solverModules.rotation || root.SimulatteRotationalMechanicsSolver,
    thermal: solverModules.thermal || root.SimulatteThermalSolver,
    wave: solverModules.wave || root.SimulatteWaveFieldSolver,
  };

  const SOLVER_OPERATORS = Object.freeze({
    heat_source: solver('thermal-source', ['heat_source'], ['temperature'], ['temperature'], 0.05, moduleStep('thermal')),
    heat_transfer: solver('thermal-transfer', ['heat_transfer'], ['temperature'], ['temperature'], 0.05, moduleStep('thermal')),
    advection: solver('advection-lite', ['advection'], ['flowVelocity'], ['flowVelocity', 'pressure'], 0.05, moduleStep('advection')),
    diffusion: solver('scalar-diffusion', ['diffusion'], [], [], 0.05, stepDiffusion),
    phase_transition: solver('phase-transition', ['phase_transition'], ['temperature'], ['liquidFraction'], 0.05, moduleStep('thermal')),
    rotational_torque: solver('rotational-mechanics', ['rotational_torque'], ['flowVelocity'], ['angularVelocity'], 0.05, moduleStep('rotation')),
    rigid_collision: solver('rigid-collision', ['rigid_collision'], [], ['stress', 'damage'], 0.05, moduleStep('rigid')),
    fracture_threshold: solver('fracture-threshold', ['fracture_threshold'], ['stress'], ['damage'], 0.05, moduleStep('fracture')),
    pressure_flow_lite: solver('pressure-flow-lite', ['pressure_flow_lite'], ['pressure'], ['flowVelocity'], 0.05, moduleStep('pressure')),
    wave_field: solver('wave-field', ['wave_field'], ['phase', 'amplitude'], ['phase', 'amplitude'], 0.05, moduleStep('wave')),
    reaction_diffusion: solver('reaction-diffusion-lite', ['reaction_diffusion'], ['reactionProgress'], ['reactionProgress'], 0.05, moduleStep('reaction')),
    network_flow: solver('network-flow', ['network_flow'], ['backlog', 'throughput'], ['backlog', 'throughput'], 0.05, moduleStep('network')),
    oscillator: solver('oscillator', ['oscillator'], ['phase', 'amplitude'], ['phase', 'amplitude'], 0.05, moduleStep('wave')),
    growth_decay: solver('growth-decay', ['growth_decay'], ['density', 'nutrient'], ['density', 'nutrient'], 0.05, moduleStep('growth')),
    derive_readout: solver('derived-readout', ['derive_readout'], [], [], 0.05, stepNoop),
  });

  function solver(id, operatorTypes, requiredFields, producedFields, stableDt, step) {
    return {
      id,
      operatorTypes,
      requiredFields,
      producedFields,
      stableDt,
      createState: () => ({}),
      step,
    };
  }

  function moduleStep(name) {
    const api = moduleApi[name] || {};
    if (typeof api.step === 'function') return api.step;
    return (context = {}) => {
      if (Array.isArray(context.events)) {
        context.events.push({
          type: 'missingSolverModule',
          module: name,
          operatorType: context.step && (context.step.operatorType || context.step.type) || '',
        });
      }
    };
  }

  function createSolverRegistry(extraOperators = {}) {
    return {
      schema: SOLVER_REGISTRY_SCHEMA,
      operators: { ...SOLVER_OPERATORS, ...extraOperators },
      operatorFor(type) {
        return this.operators[type] || null;
      },
      stepOperator(context) {
        const row = this.operatorFor(context.step.operatorType || context.step.type);
        if (!row) {
          context.events.push({ type: 'unsupportedOperator', operatorType: context.step.operatorType || context.step.type });
          return;
        }
        row.step(context);
      },
    };
  }

  function stepDiffusion({ channels, step, dt }) {
    for (const output of step.outputs || []) {
      const value = channels[output];
      if (typeof value === 'number') channels[output] = clamp(value + (0.5 - value) * dt * 0.18, 0, 2);
    }
  }

  function stepNoop() {}

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  return {
    SOLVER_REGISTRY_SCHEMA,
    SOLVER_OPERATORS,
    createSolverRegistry,
  };
});
