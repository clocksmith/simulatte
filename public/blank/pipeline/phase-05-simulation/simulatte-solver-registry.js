(function attachSimulatteSolverRegistry(root, factory) {
  const solverModules = typeof module === 'object' && module.exports
    ? {
      advection: require('./solvers/simulatte-solver-advection.js'),
      constraints: require('./solvers/simulatte-solver-constraints.js'),
      fracture: require('./solvers/simulatte-solver-fracture-threshold.js'),
      growth: require('./solvers/simulatte-solver-growth-decay.js'),
      network: require('./solvers/simulatte-solver-network-control.js'),
      deposition: require('./solvers/simulatte-solver-particle-deposition.js'),
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
    deposition: solverModules.deposition || root.SimulatteParticleDepositionSolver,
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
    particle_deposition: solver('particle-deposition', ['particle_deposition'], ['airborneDensity', 'depositedMass'], ['airborneDensity', 'depositedMass'], 0.05, moduleStep('deposition')),
    fluid_locomotion: solver('fluid-locomotion', ['fluid_locomotion'], ['swimPhase', 'strokeForce', 'velocity'], ['velocity', 'swimPhase', 'strokeForce'], 0.05, stepFluidLocomotion),
    buoyancy: solver('buoyancy', ['buoyancy'], ['submersion', 'buoyancy'], ['force', 'buoyancy'], 0.05, stepBuoyancy),
    drag: solver('drag', ['drag'], ['velocity', 'flowVelocity', 'viscosity'], ['velocity', 'drag'], 0.05, stepDrag),
    wake_generation: solver('wake-generation', ['wake_generation'], ['velocity', 'wake'], ['wake', 'flowVelocity'], 0.05, stepWakeGeneration),
    body_water_contact: solver('body-water-contact', ['body_water_contact'], ['position', 'submersion'], ['submersion'], 0.05, stepBodyWaterContact),
    partial_submersion: solver('partial-submersion', ['partial_submersion'], ['position', 'buoyancy', 'submersion'], ['submersion', 'buoyancy'], 0.05, stepPartialSubmersion),
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

  function stepFluidLocomotion({ channels, step, dt }) {
    const phaseKey = findChannel(step.outputs, 'swimPhase') || findChannel(step.inputs, 'swimPhase');
    const strokeKey = findChannel(step.outputs, 'strokeForce') || findChannel(step.inputs, 'strokeForce');
    const velocityKey = findChannel(step.outputs, 'velocity') || findChannel(step.inputs, 'velocity');
    const flowKey = findChannel(step.inputs, 'flowVelocity');
    const rate = Number(step.params && step.params.rate || 0.58);
    const phase = clamp(Number(channels[phaseKey] || 0) + dt * rate * Math.PI * 2, 0, Math.PI * 2);
    channels[phaseKey] = phase >= Math.PI * 2 ? phase - Math.PI * 2 : phase;
    channels[strokeKey] = clamp(0.42 + Math.sin(channels[phaseKey]) * 0.18, 0, 1);
    const flow = vectorValue(channels[flowKey]);
    const velocity = vectorValue(channels[velocityKey]);
    channels[velocityKey] = {
      x: clamp(velocity.x + (channels[strokeKey] * 0.32 - flow.x * 0.08) * dt, -4, 4),
      y: clamp(velocity.y + Math.cos(channels[phaseKey]) * 0.04 * dt, -4, 4),
    };
  }

  function stepBuoyancy({ channels, step, dt }) {
    const submersionKey = findChannel(step.inputs, 'submersion');
    const buoyancyKey = findChannel(step.outputs, 'buoyancy') || findChannel(step.inputs, 'buoyancy');
    const forceKey = findChannel(step.outputs, 'force');
    const submersion = clamp(Number(channels[submersionKey] || 0.58), 0, 1);
    const buoyancy = clamp((0.5 - Math.abs(0.58 - submersion)) + dt * 0.08, 0, 1);
    channels[buoyancyKey] = buoyancy;
    if (forceKey) {
      const force = vectorValue(channels[forceKey]);
      channels[forceKey] = { x: force.x, y: clamp(force.y - buoyancy * dt, -4, 4) };
    }
  }

  function stepDrag({ channels, step, dt }) {
    const velocityKey = findChannel(step.outputs, 'velocity') || findChannel(step.inputs, 'velocity');
    const dragKey = findChannel(step.outputs, 'drag') || findChannel(step.inputs, 'drag');
    const viscosityKey = findChannel(step.inputs, 'viscosity');
    const velocity = vectorValue(channels[velocityKey]);
    const viscosity = clamp(Number(channels[viscosityKey] || 0.18), 0, 1);
    const drag = clamp(Math.hypot(velocity.x, velocity.y) * (0.18 + viscosity), 0, 1);
    channels[dragKey] = drag;
    channels[velocityKey] = {
      x: velocity.x * (1 - drag * dt),
      y: velocity.y * (1 - drag * dt),
    };
  }

  function stepWakeGeneration({ channels, step, dt }) {
    const velocityKey = findChannel(step.inputs, 'velocity');
    const wakeOutputs = (step.outputs || []).filter((id) => /wake/.test(id));
    const flowKey = findChannel(step.outputs, 'flowVelocity');
    const velocity = vectorValue(channels[velocityKey]);
    const wake = clamp(Math.hypot(velocity.x, velocity.y) * 0.32, 0, 1);
    for (const key of wakeOutputs) channels[key] = clamp(Number(channels[key] || 0) + (wake - Number(channels[key] || 0)) * dt * 3, 0, 1);
    if (flowKey) {
      const flow = vectorValue(channels[flowKey]);
      channels[flowKey] = {
        x: clamp(flow.x + velocity.x * dt * 0.08, -4, 4),
        y: clamp(flow.y + velocity.y * dt * 0.04, -4, 4),
      };
    }
  }

  function stepBodyWaterContact({ channels, step, dt }) {
    const output = findChannel(step.outputs, 'submersion');
    if (!output) return;
    const current = Number(channels[output] || 0.58);
    channels[output] = clamp(current + (0.62 - current) * dt * 2, 0, 1);
  }

  function stepPartialSubmersion({ channels, step, dt }) {
    const submersionKey = findChannel(step.outputs, 'submersion') || findChannel(step.inputs, 'submersion');
    const buoyancyKey = findChannel(step.outputs, 'buoyancy') || findChannel(step.inputs, 'buoyancy');
    const submersion = clamp(Number(channels[submersionKey] || 0.58) + Math.sin(Number(channels.__t || 0) * 1.7) * dt * 0.04, 0.38, 0.82);
    channels[submersionKey] = submersion;
    channels[buoyancyKey] = clamp(1 - Math.abs(0.58 - submersion), 0, 1);
  }

  function findChannel(channels, name) {
    return (channels || []).find((id) => String(id || '').startsWith(`${name}:`)) || '';
  }

  function vectorValue(value) {
    if (value && typeof value === 'object') {
      return { x: Number(value.x || 0), y: Number(value.y || 0) };
    }
    return { x: 0, y: 0 };
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
