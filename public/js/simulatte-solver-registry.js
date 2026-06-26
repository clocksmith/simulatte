(function attachSimulatteSolverRegistry(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteSolverRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSolverRegistryApi() {
  const SOLVER_REGISTRY_SCHEMA = 'simulatte.solverRegistry.v1';

  const SOLVER_OPERATORS = Object.freeze({
    heat_source: solver('thermal-source', ['heat_source'], ['temperature'], ['temperature'], 0.05, stepHeatSource),
    heat_transfer: solver('thermal-transfer', ['heat_transfer'], ['temperature'], ['temperature'], 0.05, stepHeatTransfer),
    advection: solver('advection-lite', ['advection'], ['flowVelocity'], ['flowVelocity', 'pressure'], 0.05, stepAdvection),
    diffusion: solver('scalar-diffusion', ['diffusion'], [], [], 0.05, stepDiffusion),
    phase_transition: solver('phase-transition', ['phase_transition'], ['temperature'], ['liquidFraction'], 0.05, stepPhaseTransition),
    rotational_torque: solver('rotational-mechanics', ['rotational_torque'], ['flowVelocity'], ['angularVelocity'], 0.05, stepRotationalTorque),
    rigid_collision: solver('rigid-collision', ['rigid_collision'], [], ['stress', 'damage'], 0.05, stepRigidCollision),
    fracture_threshold: solver('fracture-threshold', ['fracture_threshold'], ['stress'], ['damage'], 0.05, stepFractureThreshold),
    pressure_flow_lite: solver('pressure-flow-lite', ['pressure_flow_lite'], ['pressure'], ['flowVelocity'], 0.05, stepPressureFlowLite),
    wave_field: solver('wave-field', ['wave_field'], ['phase', 'amplitude'], ['phase', 'amplitude'], 0.05, stepWaveField),
    reaction_diffusion: solver('reaction-diffusion-lite', ['reaction_diffusion'], ['reactionProgress'], ['reactionProgress'], 0.05, stepReactionDiffusion),
    network_flow: solver('network-flow', ['network_flow'], ['backlog', 'throughput'], ['backlog', 'throughput'], 0.05, stepNetworkFlow),
    oscillator: solver('oscillator', ['oscillator'], ['phase', 'amplitude'], ['phase', 'amplitude'], 0.05, stepOscillator),
    growth_decay: solver('growth-decay', ['growth_decay'], ['density', 'nutrient'], ['density', 'nutrient'], 0.05, stepGrowthDecay),
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

  function stepHeatSource({ channels, step, dt }) {
    const out = firstOutput(step, 'temperature');
    if (!out) return;
    const current = scalar(channels[out], 0.4);
    const strength = finite(step.params && step.params.strength, 0.5);
    channels[out] = clamp(current + strength * dt * 0.42, 0, 2);
  }

  function stepHeatTransfer({ channels, step, dt }) {
    const sourceId = firstInput(step, 'temperature');
    const targetId = lastOutput(step, 'temperature');
    if (!sourceId || !targetId) return;
    const source = scalar(channels[sourceId], 0.4);
    const target = scalar(channels[targetId], 0.3);
    const rate = finite(step.params && step.params.rate, 0.35);
    channels[targetId] = clamp(target + (source - target) * rate * dt, 0, 2);
  }

  function stepAdvection({ channels, step, dt }) {
    const flowId = firstOutput(step, 'flowVelocity') || firstInput(step, 'flowVelocity');
    if (!flowId) return;
    const flow = vector(channels[flowId], { x: 0.4, y: 0 });
    const rate = finite(step.params && step.params.rate, 0.5);
    const viscosityId = firstInput(step, 'viscosity');
    const viscosity = viscosityId ? scalar(channels[viscosityId], 0.25) : 0.25;
    const pulse = Math.sin((channels.__t || 0) * 1.7 + rate) * 0.018;
    flow.x = clamp(flow.x + (rate - viscosity * 0.18) * dt * 0.4 + pulse, -4, 4);
    flow.y = clamp(flow.y + Math.cos((channels.__t || 0) * 1.3) * dt * 0.08, -4, 4);
    channels[flowId] = flow;
    const pressureId = firstOutput(step, 'pressure');
    if (pressureId) channels[pressureId] = clamp(Math.hypot(flow.x, flow.y) * (1 + viscosity), 0, 2);
  }

  function stepDiffusion({ channels, step, dt }) {
    for (const output of step.outputs || []) {
      const value = channels[output];
      if (typeof value === 'number') channels[output] = clamp(value + (0.5 - value) * dt * 0.18, 0, 2);
    }
  }

  function stepPhaseTransition({ channels, step, dt }) {
    const temperatureId = firstInput(step, 'temperature');
    const phaseId = firstOutput(step, 'liquidFraction');
    if (!temperatureId || !phaseId) return;
    const temperature = scalar(channels[temperatureId], 0.2);
    const phase = scalar(channels[phaseId], 0);
    const threshold = finite(step.params && step.params.threshold, 0.32);
    const rate = finite(step.params && step.params.rate, 0.45);
    const delta = temperature > threshold
      ? (temperature - threshold) * rate * dt
      : -(threshold - temperature) * rate * dt * 0.2;
    channels[phaseId] = clamp(phase + delta, 0, 1);
  }

  function stepRotationalTorque({ channels, step, dt }) {
    const flowId = firstInput(step, 'flowVelocity');
    const angularId = firstOutput(step, 'angularVelocity');
    const angleId = firstOutput(step, 'angle');
    const torqueId = firstOutput(step, 'torque');
    if (!angularId) return;
    const flow = vector(channels[flowId], { x: 0.2, y: 0 });
    const speed = Math.hypot(flow.x, flow.y);
    const viscosityId = firstInput(step, 'viscosity');
    const viscosity = viscosityId ? scalar(channels[viscosityId], 0.25) : 0.25;
    const coupling = finite(step.params && step.params.coupling, 0.6);
    const previous = scalar(channels[angularId], 0);
    const torque = speed * coupling * (1.15 - Math.min(0.95, viscosity)) - previous * 0.12;
    const angular = clamp(previous + torque * dt * 4.4, -24, 24);
    channels[angularId] = angular;
    if (angleId) channels[angleId] = scalar(channels[angleId], 0) + angular * dt;
    if (torqueId) channels[torqueId] = torque;
  }

  function stepRigidCollision({ channels, step, dt }) {
    const stressId = firstOutput(step, 'stress');
    const damageId = firstOutput(step, 'damage');
    const impulse = finite(step.params && step.params.impulse, 0.5);
    if (stressId) channels[stressId] = clamp(scalar(channels[stressId], 0) + impulse * dt * 0.9, 0, 2);
    if (damageId) channels[damageId] = clamp(scalar(channels[damageId], 0) + impulse * dt * 0.22, 0, 1);
  }

  function stepFractureThreshold({ channels, step, dt }) {
    const stressId = firstInput(step, 'stress');
    const damageId = firstOutput(step, 'damage');
    if (!damageId) return;
    const stress = scalar(channels[stressId], 0);
    const temperatureId = firstInput(step, 'temperature');
    const temperature = temperatureId ? scalar(channels[temperatureId], 0.3) : 0.3;
    const threshold = finite(step.params && step.params.threshold, 0.6);
    const overload = Math.max(0, stress + Math.max(0, temperature - 0.8) * 0.5 - threshold);
    channels[damageId] = clamp(scalar(channels[damageId], 0) + overload * dt * 0.5, 0, 1);
  }

  function stepPressureFlowLite({ channels, step, dt }) {
    const pressureId = firstInput(step, 'pressure');
    const flowId = firstOutput(step, 'flowVelocity');
    if (!pressureId || !flowId) return;
    const pressure = scalar(channels[pressureId], 0.3);
    const flow = vector(channels[flowId], { x: 0, y: 0 });
    flow.x = clamp(flow.x + pressure * dt * 0.35, -4, 4);
    flow.y = clamp(flow.y + Math.sin((channels.__t || 0) * 0.7) * dt * 0.05, -4, 4);
    channels[flowId] = flow;
  }

  function stepWaveField({ channels, step, dt }) {
    stepOscillator({ channels, step, dt, frequencyScale: 1.4 });
  }

  function stepReactionDiffusion({ channels, step, dt }) {
    const out = firstOutput(step, 'reactionProgress') || firstInput(step, 'reactionProgress');
    if (!out) return;
    const rate = finite(step.params && step.params.rate, 0.4);
    const value = scalar(channels[out], 0);
    channels[out] = clamp(value + value * (1 - value) * rate * dt + 0.01 * dt, 0, 1);
  }

  function stepNetworkFlow({ channels, step, dt }) {
    const backlogId = firstOutput(step, 'backlog') || firstInput(step, 'backlog');
    const throughputId = firstOutput(step, 'throughput') || firstInput(step, 'throughput');
    const delayId = firstInput(step, 'signalDelay');
    if (!backlogId || !throughputId) return;
    const demand = finite(step.params && step.params.demand, 0.45);
    const delay = delayId ? scalar(channels[delayId], 0.2) : 0.2;
    const throughput = clamp(scalar(channels[throughputId], 0.4) + (demand - delay) * dt * 0.16, 0, 1);
    const backlog = clamp(scalar(channels[backlogId], 0.2) + (demand - throughput) * dt * 0.32, 0, 1);
    channels[throughputId] = throughput;
    channels[backlogId] = backlog;
  }

  function stepOscillator({ channels, step, dt, frequencyScale = 1 }) {
    const phaseId = firstOutput(step, 'phase') || firstInput(step, 'phase');
    const amplitudeId = firstOutput(step, 'amplitude') || firstInput(step, 'amplitude');
    const frequency = finite(step.params && step.params.frequency, 0.7) * frequencyScale;
    if (phaseId) channels[phaseId] = scalar(channels[phaseId], 0) + frequency * dt * Math.PI * 2;
    if (amplitudeId) {
      const phase = phaseId ? scalar(channels[phaseId], 0) : channels.__t || 0;
      channels[amplitudeId] = clamp(scalar(channels[amplitudeId], 0.4) + Math.sin(phase) * dt * 0.05, 0, 1);
    }
  }

  function stepGrowthDecay({ channels, step, dt }) {
    const densityId = firstOutput(step, 'density') || firstInput(step, 'density');
    const nutrientId = firstOutput(step, 'nutrient') || firstInput(step, 'nutrient');
    if (!densityId || !nutrientId) return;
    const density = scalar(channels[densityId], 0.25);
    const nutrient = scalar(channels[nutrientId], 0.5);
    const rate = finite(step.params && step.params.rate, 0.25);
    const growth = density * nutrient * rate * dt;
    channels[densityId] = clamp(density + growth - density * dt * 0.025, 0, 1);
    channels[nutrientId] = clamp(nutrient - growth * 0.7 + dt * 0.01, 0, 1);
  }

  function stepNoop() {}

  function firstInput(step, prefix) {
    return firstMatching(step.inputs || step.reads || [], prefix);
  }

  function firstOutput(step, prefix) {
    return firstMatching(step.outputs || step.writes || [], prefix);
  }

  function lastOutput(step, prefix) {
    const values = (step.outputs || step.writes || []).filter((id) => id.startsWith(`${prefix}:`));
    return values[values.length - 1] || '';
  }

  function firstMatching(values, prefix) {
    return (values || []).find((id) => id.startsWith(`${prefix}:`)) || '';
  }

  function vector(value, fallback) {
    if (value && typeof value === 'object') return { x: finite(value.x, fallback.x), y: finite(value.y, fallback.y) };
    return { ...fallback };
  }

  function scalar(value, fallback) {
    return finite(value, fallback);
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  return {
    SOLVER_REGISTRY_SCHEMA,
    SOLVER_OPERATORS,
    createSolverRegistry,
  };
});
