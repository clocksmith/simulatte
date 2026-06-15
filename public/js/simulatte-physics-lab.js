(function attachSimulattePhysicsLab(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulattePhysicsLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createPhysicsLab() {
  const TAU = Math.PI * 2;
  const FIELD_GRID = 52;

  const TEMPLATE_LIBRARY = Object.freeze([
    {
      id: 'magnetic-wheel',
      name: 'Solar Magnetic Wheel',
      kind: 'newtonian-electromagnetic',
      description: 'Powered stator slider, rotor magnets, motor load, friction, and energy accounting.',
      modules: ['mechanics', 'electromagnetism', 'solar', 'control', 'energy-ledger'],
      objects: [
        { id: 'rotor-wheel', type: 'body', role: 'rotating wheel with alternating magnetic poles' },
        { id: 'stator-slider', type: 'actuator', role: 'solar-powered moving magnetic slider' },
        { id: 'solar-panel', type: 'source', role: 'bounded energy input' },
        { id: 'motor-load', type: 'sink', role: 'useful output load' },
      ],
      readouts: ['rpm', 'torque', 'solar', 'load', 'actuator', 'balance'],
      params: {
        irradiance: 780,
        panelArea: 0.42,
        panelEfficiency: 0.24,
        magneticStrength: 0.62,
        sliderPhase: 0.18,
        sliderAmplitude: 0.42,
        loadTorque: 0.16,
        friction: 0.045,
        wheelInertia: 0.72,
        actuatorEfficiency: 0.54,
      },
      controls: [
        ['irradiance', 'sun irradiance', 0, 1200, 10],
        ['magneticStrength', 'magnetic strength', 0, 1.5, 0.01],
        ['sliderPhase', 'slider phase', -0.5, 0.5, 0.01],
        ['sliderAmplitude', 'solar slider travel', 0, 1.1, 0.01],
        ['loadTorque', 'motor load', 0, 0.8, 0.01],
        ['friction', 'bearing friction', 0, 0.16, 0.002],
      ],
    },
    {
      id: 'fluid-vortex',
      name: 'Fluid Vortex Tank',
      kind: 'fluid-particles',
      description: 'A particle fluid tank with inlet flow, viscosity, obstacle wake, turbulence, and drag loss.',
      modules: ['mechanics', 'fluid', 'turbulence', 'obstacle', 'energy-ledger'],
      objects: [
        { id: 'inlet', type: 'source', role: 'flow input' },
        { id: 'fluid-particles', type: 'material', role: 'moving particle fluid' },
        { id: 'wake-obstacle', type: 'constraint', role: 'obstacle producing pressure and wake' },
      ],
      readouts: ['flow', 'pressure', 'vorticity', 'mixing', 'drag', 'age'],
      params: {
        inletFlow: 0.62,
        viscosity: 0.18,
        vortexStrength: 0.74,
        obstacleRadius: 0.16,
        turbulence: 0.22,
        gravity: 0.05,
      },
      controls: [
        ['inletFlow', 'inlet flow', 0, 1.4, 0.01],
        ['viscosity', 'viscosity', 0.01, 0.65, 0.01],
        ['vortexStrength', 'vortex strength', 0, 1.6, 0.01],
        ['obstacleRadius', 'obstacle radius', 0.04, 0.28, 0.01],
        ['turbulence', 'turbulence', 0, 0.85, 0.01],
        ['gravity', 'gravity bias', -0.4, 0.4, 0.01],
      ],
    },
    {
      id: 'reaction-diffusion',
      name: 'Reaction Diffusion Chemistry',
      kind: 'chemical-field',
      description: 'Gray-Scott-style reaction front with feed, kill, diffusion, catalyst, heat, and cooling.',
      modules: ['chemistry', 'diffusion', 'thermal', 'field', 'energy-ledger'],
      objects: [
        { id: 'reactant-a', type: 'material', role: 'feedstock field' },
        { id: 'reactant-b', type: 'material', role: 'reaction product field' },
        { id: 'catalyst-front', type: 'field', role: 'catalyzed reaction front' },
      ],
      readouts: ['conversion', 'heat', 'front', 'mass b', 'entropy', 'time'],
      params: {
        feedRate: 0.037,
        killRate: 0.061,
        diffusionA: 0.92,
        diffusionB: 0.48,
        catalyst: 0.64,
        cooling: 0.22,
      },
      controls: [
        ['feedRate', 'feed rate', 0.005, 0.08, 0.001],
        ['killRate', 'kill rate', 0.03, 0.09, 0.001],
        ['diffusionA', 'diffusion a', 0.2, 1.4, 0.01],
        ['diffusionB', 'diffusion b', 0.1, 0.9, 0.01],
        ['catalyst', 'catalyst', 0, 1.2, 0.01],
        ['cooling', 'cooling', 0, 0.8, 0.01],
      ],
    },
    {
      id: 'custom-world',
      name: 'Generated Physics World',
      kind: 'modular-physics',
      description: 'A composed world assembled from prompt-selected modules, objects, forces, materials, sources, and sinks.',
      modules: ['mechanics', 'field', 'energy-ledger'],
      objects: [
        { id: 'body-a', type: 'body', role: 'movable physical object' },
        { id: 'field-a', type: 'field', role: 'force field affecting motion' },
      ],
      readouts: ['energy', 'motion', 'field', 'matter', 'heat', 'stability'],
      params: {
        energyInput: 0.62,
        fieldStrength: 0.48,
        driveTiming: 0.5,
        flowRate: 0.2,
        viscosity: 0.18,
        reactionRate: 0.28,
        heatTransfer: 0.24,
        gravity: 0.06,
        damping: 0.08,
        complexity: 0.5,
      },
      controls: [
        ['energyInput', 'energy input', 0, 1.5, 0.01],
        ['fieldStrength', 'field strength', 0, 1.6, 0.01],
        ['driveTiming', 'drive timing', 0, 1, 0.01],
        ['flowRate', 'flow rate', 0, 1.4, 0.01],
        ['viscosity', 'viscosity', 0.01, 0.65, 0.01],
        ['reactionRate', 'reaction rate', 0, 1.2, 0.01],
        ['heatTransfer', 'heat transfer', 0, 1.2, 0.01],
        ['gravity', 'gravity', -0.5, 0.5, 0.01],
        ['damping', 'damping', 0, 0.35, 0.005],
        ['complexity', 'world complexity', 0, 1, 0.01],
      ],
    },
    {
      id: 'blank-world',
      name: 'Blank Construction Plane',
      kind: 'blank-construction',
      description: 'An empty simulation plane with no modules or objects until the builder prompt creates them.',
      modules: [],
      objects: [],
      readouts: ['modules', 'objects', 'forces', 'sources', 'sinks', 'canvas'],
      params: {
        guideDensity: 0.42,
        canvasScale: 0.62,
      },
      controls: [
        ['guideDensity', 'guide density', 0, 1, 0.01],
        ['canvasScale', 'canvas scale', 0.2, 1, 0.01],
      ],
    },
  ]);

  const CONTROL_LIBRARY = Object.freeze({
    irradiance: ['irradiance', 'sun irradiance', 0, 1200, 10],
    magneticStrength: ['magneticStrength', 'magnetic strength', 0, 1.5, 0.01],
    sliderPhase: ['sliderPhase', 'slider phase', -0.5, 0.5, 0.01],
    sliderAmplitude: ['sliderAmplitude', 'solar slider travel', 0, 1.1, 0.01],
    loadTorque: ['loadTorque', 'motor load', 0, 0.8, 0.01],
    friction: ['friction', 'bearing friction', 0, 0.16, 0.002],
    energyInput: ['energyInput', 'energy input', 0, 1.5, 0.01],
    fieldStrength: ['fieldStrength', 'field strength', 0, 1.6, 0.01],
    driveTiming: ['driveTiming', 'drive timing', 0, 1, 0.01],
    flowRate: ['flowRate', 'flow rate', 0, 1.4, 0.01],
    inletFlow: ['inletFlow', 'inlet flow', 0, 1.4, 0.01],
    viscosity: ['viscosity', 'viscosity', 0.01, 0.65, 0.01],
    vortexStrength: ['vortexStrength', 'vortex strength', 0, 1.6, 0.01],
    obstacleRadius: ['obstacleRadius', 'obstacle radius', 0.04, 0.28, 0.01],
    turbulence: ['turbulence', 'turbulence', 0, 0.85, 0.01],
    reactionRate: ['reactionRate', 'reaction rate', 0, 1.2, 0.01],
    feedRate: ['feedRate', 'feed rate', 0.005, 0.08, 0.001],
    killRate: ['killRate', 'kill rate', 0.03, 0.09, 0.001],
    diffusionA: ['diffusionA', 'diffusion a', 0.2, 1.4, 0.01],
    diffusionB: ['diffusionB', 'diffusion b', 0.1, 0.9, 0.01],
    catalyst: ['catalyst', 'catalyst', 0, 1.2, 0.01],
    cooling: ['cooling', 'cooling', 0, 0.8, 0.01],
    heatTransfer: ['heatTransfer', 'heat transfer', 0, 1.2, 0.01],
    gravity: ['gravity', 'gravity', -0.5, 0.5, 0.01],
    damping: ['damping', 'damping', 0, 0.35, 0.005],
    complexity: ['complexity', 'world complexity', 0, 1, 0.01],
    guideDensity: ['guideDensity', 'guide density', 0, 1, 0.01],
    canvasScale: ['canvasScale', 'canvas scale', 0.2, 1, 0.01],
  });

  const DEFAULT_PARAMS = Object.freeze({ ...TEMPLATE_LIBRARY[0].params });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clamp01(value) {
    return clamp(value, 0, 1);
  }

  function wrapAngle(angle) {
    const wrapped = angle % TAU;
    return wrapped < 0 ? wrapped + TAU : wrapped;
  }

  function shortestAngle(from, to) {
    let delta = wrapAngle(to) - wrapAngle(from);
    if (delta > Math.PI) delta -= TAU;
    if (delta < -Math.PI) delta += TAU;
    return delta;
  }

  function hashNoise(seed, index) {
    const x = Math.sin((seed + 1) * 12.9898 + (index + 1) * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function slugify(value) {
    return String(value || 'simulation')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 52) || 'simulation';
  }

  function templateById(templateId) {
    return TEMPLATE_LIBRARY.find((template) => template.id === templateId) || TEMPLATE_LIBRARY[0];
  }

  function normalizeControl(control) {
    if (Array.isArray(control)) return control;
    if (typeof control === 'string') return CONTROL_LIBRARY[control] || [control, labelize(control), 0, 1, 0.01];
    if (control && control.key) {
      return [
        control.key,
        control.label || labelize(control.key),
        Number(control.min ?? 0),
        Number(control.max ?? 1),
        Number(control.step ?? 0.01),
      ];
    }
    return ['value', 'value', 0, 1, 0.01];
  }

  function labelize(key) {
    return String(key || 'value')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]+/g, ' ')
      .toLowerCase();
  }

  function controlsForSpec(specOrTemplate) {
    return (specOrTemplate.controls || templateById(specOrTemplate.templateId || specOrTemplate.id).controls || [])
      .map(normalizeControl);
  }

  function controlsByKey(specOrTemplate) {
    return Object.fromEntries(controlsForSpec(specOrTemplate).map((control) => [control[0], control]));
  }

  function normalizeParams(template, params, controls = controlsForSpec(template)) {
    const controlsMap = Object.fromEntries(controls.map((control) => [control[0], control]));
    const base = { ...template.params, ...(params || {}) };
    return Object.fromEntries(Object.entries(base).map(([key, value]) => {
      const control = controlsMap[key];
      if (!control) return [key, Number(value)];
      return [key, clamp(Number(value), Number(control[2]), Number(control[3]))];
    }));
  }

  function normalizeObjects(objects, fallback = []) {
    const source = Array.isArray(objects) && objects.length ? objects : fallback;
    return source.map((object, index) => ({
      id: slugify(object.id || object.name || `object-${index + 1}`),
      type: String(object.type || 'body'),
      role: String(object.role || object.name || 'physical object'),
    }));
  }

  function uniqueList(values) {
    return Array.from(new Set((values || []).filter(Boolean).map((value) => String(value))));
  }

  function createSpec(templateId = 'magnetic-wheel', overrides = {}) {
    const template = templateById(templateId);
    const name = String(overrides.name || template.name).trim() || template.name;
    const controls = (overrides.controls || template.controls || []).map(normalizeControl);
    const modules = uniqueList(overrides.modules || template.modules || []);
    const objects = normalizeObjects(overrides.objects, template.objects || []);
    return {
      schema: 'simulatte.simulationSpec.v1',
      id: overrides.id || `${slugify(name)}-${Date.now().toString(36)}`,
      templateId: template.id,
      name,
      kind: template.kind,
      description: String(overrides.description || template.description),
      modules,
      objects,
      controls,
      params: normalizeParams(template, overrides.params, controls),
      createdAt: overrides.createdAt || new Date(0).toISOString(),
      remixOf: overrides.remixOf || '',
    };
  }

  function normalizeSpec(raw) {
    if (!raw || typeof raw !== 'object') return createSpec('magnetic-wheel');
    const template = templateById(raw.templateId);
    return createSpec(template.id, {
      id: raw.id || `${template.id}-${Date.now().toString(36)}`,
      name: raw.name || template.name,
      description: raw.description || template.description,
      modules: raw.modules || template.modules || [],
      objects: raw.objects || template.objects || [],
      controls: raw.controls || template.controls || [],
      params: raw.params || {},
      createdAt: raw.createdAt || new Date(0).toISOString(),
      remixOf: raw.remixOf || '',
    });
  }

  function createSpecFromPrompt(promptText = '') {
    const prompt = String(promptText || '').toLowerCase();
    const words = prompt.split(/[^a-z0-9]+/).filter(Boolean);
    const hasAny = (...terms) => terms.some((term) => prompt.includes(term));
    const title = titleFromPrompt(words);
    const modules = ['mechanics', 'field', 'energy-ledger'];
    const objects = [
      { id: 'body-a', type: 'body', role: 'movable body generated from prompt' },
      { id: 'field-a', type: 'field', role: 'force field generated from prompt' },
    ];
    const controls = ['energyInput', 'fieldStrength', 'damping', 'complexity'];
    const params = { ...templateById('custom-world').params };

    const addControls = (...keys) => {
      for (const key of keys) {
        if (!controls.includes(key)) controls.push(key);
      }
    };
    const addObjects = (...items) => {
      for (const item of items) objects.push(item);
    };
    const addModules = (...items) => {
      for (const item of items) {
        if (!modules.includes(item)) modules.push(item);
      }
    };

    if (hasAny('magnet', 'magnetic', 'perpetual', 'wheel', 'motor', 'rotor', 'slider', 'solar', 'sun')) {
      addModules('electromagnetism', 'solar', 'control', 'rotational-mechanics');
      addControls('irradiance', 'magneticStrength', 'sliderPhase', 'sliderAmplitude', 'loadTorque', 'friction', 'driveTiming');
      addObjects(
        { id: 'rotor-wheel', type: 'body', role: 'rotating wheel with alternating magnetic poles' },
        { id: 'stator-slider', type: 'actuator', role: 'sun-powered moving magnetic slider' },
        { id: 'solar-panel', type: 'source', role: 'bounded solar input' },
        { id: 'motor-load', type: 'sink', role: 'output load that prevents free energy accounting' }
      );
      Object.assign(params, {
        irradiance: hasAny('sun', 'solar') ? 780 : 520,
        magneticStrength: hasAny('strong', 'powerful') ? 0.9 : 0.62,
        sliderPhase: 0.18,
        sliderAmplitude: hasAny('moving', 'slider') ? 0.42 : 0.28,
        loadTorque: hasAny('perpetual', 'motor', 'load', 'generator') ? 0.16 : 0.08,
        friction: hasAny('low friction') ? 0.02 : 0.045,
        driveTiming: 0.48,
      });
    }
    if (hasAny('fluid', 'water', 'vortex', 'flow', 'turbulence', 'wake', 'pressure', 'smoke', 'air')) {
      addModules('fluid', 'turbulence', 'advection');
      addControls('flowRate', 'inletFlow', 'viscosity', 'vortexStrength', 'obstacleRadius', 'turbulence', 'gravity');
      addObjects(
        { id: 'flow-inlet', type: 'source', role: 'fluid or gas inlet' },
        { id: 'moving-fluid', type: 'material', role: 'advected particles' },
        { id: 'wake-obstacle', type: 'constraint', role: 'wake and pressure generator' }
      );
      Object.assign(params, {
        flowRate: hasAny('fast', 'high pressure') ? 0.9 : 0.45,
        inletFlow: hasAny('fast', 'high pressure') ? 0.9 : 0.62,
        viscosity: hasAny('thick', 'viscous') ? 0.36 : 0.18,
        vortexStrength: hasAny('vortex', 'swirl') ? 0.9 : 0.54,
        obstacleRadius: hasAny('large obstacle') ? 0.22 : 0.16,
        turbulence: hasAny('chaos', 'turbulence', 'storm') ? 0.42 : 0.22,
        gravity: hasAny('fall', 'gravity') ? 0.12 : 0.05,
      });
    }
    if (hasAny('chemistry', 'chemical', 'reaction', 'diffusion', 'catalyst', 'front', 'molecule', 'crystal')) {
      addModules('chemistry', 'diffusion', 'thermal');
      addControls('reactionRate', 'feedRate', 'killRate', 'diffusionA', 'diffusionB', 'catalyst', 'cooling', 'heatTransfer');
      addObjects(
        { id: 'reactant-a', type: 'material', role: 'feedstock field' },
        { id: 'reactant-b', type: 'material', role: 'reaction product field' },
        { id: 'catalyst-front', type: 'field', role: 'reaction and heat front' }
      );
      Object.assign(params, {
        reactionRate: hasAny('violent', 'fast') ? 0.72 : 0.34,
        feedRate: hasAny('feed', 'growth') ? 0.043 : 0.037,
        killRate: hasAny('decay', 'kill') ? 0.067 : 0.061,
        diffusionA: hasAny('fast') ? 1.08 : 0.92,
        diffusionB: hasAny('slow') ? 0.36 : 0.48,
        catalyst: hasAny('catalyst') ? 0.82 : 0.64,
        cooling: hasAny('hot', 'heat') ? 0.14 : 0.22,
        heatTransfer: hasAny('hot', 'heat') ? 0.58 : 0.24,
      });
    }
    if (hasAny('orbit', 'gravity', 'fall', 'pendulum', 'spring', 'collision', 'bounce')) {
      addModules('gravity', 'collision');
      addControls('gravity', 'damping', 'energyInput');
      addObjects(
        { id: 'gravity-source', type: 'field', role: 'gravity well or acceleration field' },
        { id: 'moving-mass', type: 'body', role: 'mass affected by gravity and collisions' }
      );
      params.gravity = hasAny('orbit') ? 0.18 : 0.24;
      params.damping = hasAny('bounce') ? 0.035 : 0.08;
    }

    const exactMachine = hasAny('perpetual') && hasAny('magnet', 'magnetic');
    return createSpec('custom-world', {
      name: exactMachine ? 'Solar Magnetic Perpetual Motion Machine' : title || 'Custom Physics World',
      description: `Generated from prompt: ${String(promptText || '').trim() || 'physical simulation'}`,
      modules,
      objects,
      controls,
      params,
    });
  }

  function titleFromPrompt(words) {
    const stop = new Set(['a', 'an', 'and', 'the', 'with', 'to', 'of', 'for', 'from', 'that', 'uses', 'use', 'build', 'make', 'create', 'simulate', 'simulation']);
    const keep = words.filter((word) => !stop.has(word)).slice(0, 6);
    if (!keep.length) return '';
    return keep.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  function remixSpec(inputSpec, overrides = {}) {
    const spec = normalizeSpec(inputSpec);
    const params = { ...spec.params };
    for (const [key, , min, max] of controlsForSpec(spec)) {
      const span = Number(max) - Number(min);
      const drift = span * (hashNoise(Date.now(), key.length + spec.id.length) - 0.5) * 0.12;
      params[key] = clamp(Number(params[key]) + drift, Number(min), Number(max));
    }
    return createSpec(spec.templateId, {
      ...spec,
      ...overrides,
      id: overrides.id || `${slugify(spec.name)}-remix-${Date.now().toString(36)}`,
      name: overrides.name || `${spec.name} Remix`,
      modules: overrides.modules || spec.modules,
      objects: overrides.objects || spec.objects,
      controls: overrides.controls || spec.controls,
      params: { ...params, ...(overrides.params || {}) },
      remixOf: spec.id,
    });
  }

  function serializeSpec(spec) {
    return JSON.stringify(normalizeSpec(spec), null, 2);
  }

  function deserializeSpec(text) {
    return normalizeSpec(JSON.parse(String(text || '{}')));
  }

  function createSimulationState(spec) {
    const normalized = normalizeSpec(spec);
    if (normalized.templateId === 'blank-world') return createBlankState(normalized);
    if (normalized.templateId === 'custom-world') return createCustomState(normalized);
    if (normalized.templateId === 'fluid-vortex') return createFluidState(normalized.params);
    if (normalized.templateId === 'reaction-diffusion') return createReactionState(normalized.params);
    return createState(normalized.params);
  }

  function stepSimulation(inputState, spec, dt) {
    const normalized = normalizeSpec(spec);
    if (normalized.templateId === 'blank-world') return stepBlankState(inputState, normalized, dt);
    if (normalized.templateId === 'custom-world') return stepCustomState(inputState, normalized, dt);
    if (normalized.templateId === 'fluid-vortex') return stepFluidState(inputState, normalized.params, dt);
    if (normalized.templateId === 'reaction-diffusion') return stepReactionState(inputState, normalized.params, dt);
    return stepState(inputState, normalized.params, dt);
  }

  function solarPower(params) {
    return Math.max(0, params.irradiance) * Math.max(0, params.panelArea) * clamp(params.panelEfficiency, 0, 1);
  }

  function magnetPosition(angle, radius) {
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  }

  function createState(params = {}) {
    const next = { ...DEFAULT_PARAMS, ...params };
    return {
      kind: 'magnetic-wheel',
      t: 0,
      theta: 0.12,
      omega: 0,
      sliderAngle: 0,
      sliderVelocity: 0,
      solarBufferJ: 0,
      solarInputJ: 0,
      actuatorWorkJ: 0,
      wheelWorkJ: 0,
      loadOutputJ: 0,
      frictionLossJ: 0,
      generatorLossJ: 0,
      lastTorque: 0,
      lastMagneticTorque: 0,
      lastActuatorPower: 0,
      lastSolarPower: solarPower(next),
      lastLoadPower: 0,
      params: next,
    };
  }

  function magneticTorque(state, params) {
    const wheelMagnets = 10;
    const wheelRadius = 1.0;
    const sliderRadius = 1.42;
    const stator = magnetPosition(state.sliderAngle, sliderRadius);
    let torque = 0;
    for (let i = 0; i < wheelMagnets; i += 1) {
      const pole = i % 2 === 0 ? 1 : -1;
      const angle = state.theta + (i / wheelMagnets) * TAU;
      const rotor = magnetPosition(angle, wheelRadius);
      const dx = rotor.x - stator.x;
      const dy = rotor.y - stator.y;
      const dist2 = Math.max(0.055, dx * dx + dy * dy);
      const tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
      const forceScale = params.magneticStrength * pole / (dist2 * Math.sqrt(dist2));
      const tangentialForce = (dx * tangent.x + dy * tangent.y) * forceScale;
      torque += tangentialForce * wheelRadius;
    }
    return clamp(torque, -2.8, 2.8);
  }

  function sliderTargetAngle(state, params) {
    const sunCycle = Math.sin(state.t * 0.42);
    const commutation = state.theta + params.sliderPhase * TAU;
    return wrapAngle(commutation + sunCycle * params.sliderAmplitude);
  }

  function stepState(inputState, inputParams, dtInput) {
    const params = { ...inputState.params, ...inputParams };
    const state = { ...inputState, params };
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    const sunPower = solarPower(params);
    state.solarInputJ += sunPower * dt;
    state.solarBufferJ += sunPower * dt;

    const target = sliderTargetAngle(state, params);
    const sliderError = shortestAngle(state.sliderAngle, target);
    const desiredVelocity = clamp(sliderError * 8, -3.6, 3.6);
    const velocityDelta = desiredVelocity - state.sliderVelocity;
    const actuatorPowerRequest = Math.abs(velocityDelta) * 9.5 + Math.abs(desiredVelocity) * 1.2;
    const actuatorPower = Math.min(state.solarBufferJ / dt, actuatorPowerRequest);
    const actuatorScale = actuatorPowerRequest > 0 ? actuatorPower / actuatorPowerRequest : 1;
    state.sliderVelocity += velocityDelta * actuatorScale * clamp(params.actuatorEfficiency, 0.05, 1);
    state.sliderVelocity *= 0.92;
    state.sliderAngle = wrapAngle(state.sliderAngle + state.sliderVelocity * dt);
    state.solarBufferJ = Math.max(0, state.solarBufferJ - actuatorPower * dt);
    state.actuatorWorkJ += actuatorPower * dt;

    let magTorque = magneticTorque(state, params);
    const predictedOmega = state.omega + (magTorque / Math.max(0.05, params.wheelInertia)) * dt;
    const fieldPowerRequest = Math.max(0, magTorque * predictedOmega) / clamp(params.actuatorEfficiency, 0.05, 1);
    const fieldPower = Math.min(state.solarBufferJ / dt, fieldPowerRequest);
    const fieldScale = fieldPowerRequest > 0 ? fieldPower / fieldPowerRequest : 1;
    magTorque *= fieldScale;
    state.solarBufferJ = Math.max(0, state.solarBufferJ - fieldPower * dt);
    state.actuatorWorkJ += fieldPower * dt;
    const loadTorque = Math.sign(state.omega || magTorque || 1) * Math.min(Math.abs(params.loadTorque), Math.abs(state.omega) * 0.18 + 0.08);
    const frictionTorque = state.omega * params.friction;
    const netTorque = magTorque - frictionTorque - loadTorque;
    const alpha = netTorque / Math.max(0.05, params.wheelInertia);
    state.omega += alpha * dt;
    state.omega *= 0.999;
    state.theta = wrapAngle(state.theta + state.omega * dt);

    const magneticPower = magTorque * state.omega;
    const loadPower = Math.max(0, loadTorque * state.omega);
    const frictionPower = Math.max(0, frictionTorque * state.omega);
    const generatorLoss = loadPower * 0.08;
    state.wheelWorkJ += magneticPower * dt;
    state.loadOutputJ += loadPower * dt;
    state.frictionLossJ += frictionPower * dt;
    state.generatorLossJ += generatorLoss * dt;
    state.t += dt;
    state.lastTorque = netTorque;
    state.lastMagneticTorque = magTorque;
    state.lastActuatorPower = actuatorPower + fieldPower;
    state.lastSolarPower = sunPower;
    state.lastLoadPower = loadPower;
    return state;
  }

  function kineticEnergy(state) {
    return 0.5 * state.params.wheelInertia * state.omega * state.omega;
  }

  function energyLedger(state) {
    const stored = kineticEnergy(state) + state.solarBufferJ;
    const spent = state.actuatorWorkJ + state.loadOutputJ + state.frictionLossJ + state.generatorLossJ + stored;
    return {
      solarInputJ: state.solarInputJ,
      actuatorWorkJ: state.actuatorWorkJ,
      wheelKineticJ: kineticEnergy(state),
      loadOutputJ: state.loadOutputJ,
      frictionLossJ: state.frictionLossJ,
      generatorLossJ: state.generatorLossJ,
      solarBufferJ: state.solarBufferJ,
      balanceErrorJ: state.solarInputJ - spent,
      rpm: state.omega * 60 / TAU,
      torqueNm: state.lastTorque,
      magneticTorqueNm: state.lastMagneticTorque,
      solarPowerW: state.lastSolarPower,
      actuatorPowerW: state.lastActuatorPower,
      loadPowerW: state.lastLoadPower,
    };
  }

  function createFluidState(params = {}) {
    const next = { ...templateById('fluid-vortex').params, ...params };
    const particles = Array.from({ length: 360 }, (_, index) => ({
      x: hashNoise(3, index),
      y: hashNoise(7, index),
      vx: 0,
      vy: 0,
      age: hashNoise(11, index),
    }));
    return {
      kind: 'fluid-vortex',
      t: 0,
      particles,
      pressure: 0,
      vorticity: 0,
      mixing: 0,
      dragLossJ: 0,
      flowInputJ: 0,
      params: next,
    };
  }

  function stepFluidState(inputState, inputParams, dtInput) {
    const params = { ...inputState.params, ...inputParams };
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    const state = {
      ...inputState,
      params,
      particles: inputState.particles.map((particle) => ({ ...particle })),
    };
    const obstacle = { x: 0.56, y: 0.52, r: params.obstacleRadius };
    let vorticity = 0;
    let pressure = 0;
    let mixing = 0;
    for (let i = 0; i < state.particles.length; i += 1) {
      const p = state.particles[i];
      const dx = p.x - obstacle.x;
      const dy = p.y - obstacle.y;
      const dist = Math.max(0.018, Math.hypot(dx, dy));
      const nx = dx / dist;
      const ny = dy / dist;
      const wake = Math.exp(-dist / Math.max(0.04, obstacle.r * 2.8));
      const swirl = params.vortexStrength * wake;
      const noise = (hashNoise(Math.floor(state.t * 30), i) - 0.5) * params.turbulence;
      p.vx += (params.inletFlow * 0.55 + -ny * swirl + noise) * dt;
      p.vy += (nx * swirl + params.gravity + noise * 0.35) * dt;
      p.vx *= 1 - params.viscosity * dt * 1.8;
      p.vy *= 1 - params.viscosity * dt * 1.8;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (dist < obstacle.r) {
        p.x = obstacle.x + nx * obstacle.r;
        p.y = obstacle.y + ny * obstacle.r;
        p.vx += nx * 0.4;
        p.vy += ny * 0.4;
        pressure += 1;
      }
      if (p.x > 1.04 || p.y < -0.04 || p.y > 1.04) {
        p.x = -0.03;
        p.y = hashNoise(i, Math.floor(state.t * 10));
        p.vx = params.inletFlow;
        p.vy = 0;
        p.age = 0;
      }
      if (p.x < -0.06) p.x = 1.03;
      p.age = clamp01(p.age + dt * 0.08);
      vorticity += Math.abs(p.vx * ny - p.vy * nx);
      mixing += p.age * (1 - Math.abs(p.y - 0.5) * 1.2);
    }
    const count = state.particles.length || 1;
    state.t += dt;
    state.vorticity = vorticity / count;
    state.pressure = pressure / count * 100;
    state.mixing = clamp01(mixing / count);
    state.flowInputJ += Math.max(0, params.inletFlow) * dt * 12;
    state.dragLossJ += state.vorticity * params.viscosity * dt * 7;
    return state;
  }

  function createReactionState(params = {}) {
    const next = { ...templateById('reaction-diffusion').params, ...params };
    const size = FIELD_GRID;
    const a = new Float32Array(size * size).fill(1);
    const b = new Float32Array(size * size);
    const heat = new Float32Array(size * size);
    const center = size / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dist = Math.hypot(x - center, y - center);
        if (dist < size * 0.12 || hashNoise(x, y) > 0.986) {
          const idx = y * size + x;
          b[idx] = 0.9;
          a[idx] = 0.25;
        }
      }
    }
    return {
      kind: 'reaction-diffusion',
      t: 0,
      size,
      a,
      b,
      heat,
      conversion: 0,
      front: 0,
      entropy: 0,
      params: next,
    };
  }

  function laplace(field, size, x, y) {
    const xm = (x + size - 1) % size;
    const xp = (x + 1) % size;
    const ym = (y + size - 1) % size;
    const yp = (y + 1) % size;
    const c = field[y * size + x];
    return (
      field[y * size + xm] +
      field[y * size + xp] +
      field[ym * size + x] +
      field[yp * size + x] -
      4 * c
    );
  }

  function stepReactionState(inputState, inputParams, dtInput) {
    const params = { ...inputState.params, ...inputParams };
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    const size = inputState.size || FIELD_GRID;
    const a = new Float32Array(inputState.a);
    const b = new Float32Array(inputState.b);
    const heat = new Float32Array(inputState.heat);
    const nextA = new Float32Array(a.length);
    const nextB = new Float32Array(b.length);
    const nextHeat = new Float32Array(heat.length);
    let massB = 0;
    let front = 0;
    let entropy = 0;
    const scale = dt * 8;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const idx = y * size + x;
        const av = a[idx];
        const bv = b[idx];
        const reaction = av * bv * bv * (0.75 + params.catalyst * 0.45);
        const da = params.diffusionA * laplace(a, size, x, y) - reaction + params.feedRate * (1 - av);
        const db = params.diffusionB * laplace(b, size, x, y) + reaction - (params.killRate + params.feedRate) * bv;
        const nvA = clamp(av + da * scale, 0, 1);
        const nvB = clamp(bv + db * scale, 0, 1);
        nextA[idx] = nvA;
        nextB[idx] = nvB;
        nextHeat[idx] = clamp(heat[idx] + reaction * scale * 0.22 - params.cooling * heat[idx] * dt, 0, 1);
        massB += nvB;
        front += Math.abs(nvB - bv);
        const local = clamp01(nvB);
        entropy += local > 0 && local < 1 ? -local * Math.log(local) : 0;
      }
    }
    const cells = size * size;
    return {
      kind: 'reaction-diffusion',
      t: inputState.t + dt,
      size,
      a: nextA,
      b: nextB,
      heat: nextHeat,
      conversion: massB / cells,
      front: front / cells,
      entropy: entropy / cells,
      params,
    };
  }

  function createBlankState(spec) {
    return {
      kind: 'blank-world',
      t: 0,
      params: { ...templateById('blank-world').params, ...spec.params },
      modules: [],
      objects: [],
    };
  }

  function stepBlankState(inputState, spec, dtInput) {
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    return {
      ...inputState,
      t: inputState.t + dt,
      params: { ...inputState.params, ...spec.params },
    };
  }

  function hasModule(specOrState, moduleName) {
    return (specOrState.modules || []).includes(moduleName);
  }

  function isMagneticMachine(spec) {
    return hasModule(spec, 'electromagnetism') &&
      (spec.objects || []).some((object) => /wheel|rotor|slider|magnet/i.test(`${object.id} ${object.role}`));
  }

  function createCustomParticles(spec) {
    const count = 120 + Math.round(clamp(spec.params.complexity ?? 0.5, 0, 1) * 220) + (spec.objects || []).length * 16;
    return Array.from({ length: count }, (_, index) => ({
      x: hashNoise(19, index),
      y: hashNoise(23, index),
      vx: (hashNoise(29, index) - 0.5) * 0.08,
      vy: (hashNoise(31, index) - 0.5) * 0.08,
      phase: hashNoise(37, index),
      kind: index % Math.max(1, (spec.objects || []).length),
    }));
  }

  function createCustomState(spec) {
    const params = { ...templateById('custom-world').params, ...spec.params };
    return {
      kind: 'custom-world',
      t: 0,
      params,
      modules: spec.modules,
      objects: spec.objects,
      particles: createCustomParticles({ ...spec, params }),
      machine: isMagneticMachine(spec) ? createState(params) : null,
      fluid: hasModule(spec, 'fluid') ? createFluidState({
        ...params,
        inletFlow: params.inletFlow ?? params.flowRate,
        vortexStrength: params.vortexStrength ?? params.fieldStrength,
      }) : null,
      reaction: hasModule(spec, 'chemistry') ? createReactionState(params) : null,
      energy: 0,
      motion: 0,
      field: 0,
      matter: 0,
      heat: 0,
      stability: 1,
    };
  }

  function stepCustomState(inputState, spec, dtInput) {
    const params = { ...inputState.params, ...spec.params };
    const dt = clamp(Number(dtInput || 0.016), 0.001, 0.05);
    const state = {
      ...inputState,
      params,
      modules: spec.modules,
      objects: spec.objects,
      particles: inputState.particles.map((particle) => ({ ...particle })),
    };
    if (state.machine) state.machine = stepState(state.machine, params, dt);
    if (state.fluid) {
      state.fluid = stepFluidState(state.fluid, {
        ...params,
        inletFlow: params.inletFlow ?? params.flowRate,
        vortexStrength: params.vortexStrength ?? params.fieldStrength,
      }, dt);
    }
    if (state.reaction) state.reaction = stepReactionState(state.reaction, params, dt);

    const field = (params.fieldStrength || 0) + (params.magneticStrength || 0) * 0.7 + (hasModule(spec, 'gravity') ? Math.abs(params.gravity || 0) : 0);
    const drive = (params.energyInput || 0) + solarPower({ ...DEFAULT_PARAMS, ...params }) / 900;
    const swirl = (params.turbulence || 0) + (params.vortexStrength || 0) * 0.28;
    const damping = clamp(params.damping ?? params.friction ?? 0.08, 0, 0.95);
    let motionSum = 0;
    for (let i = 0; i < state.particles.length; i += 1) {
      const p = state.particles[i];
      const cx = p.x - 0.5;
      const cy = p.y - 0.5;
      const radius = Math.max(0.03, Math.hypot(cx, cy));
      const tangentX = -cy / radius;
      const tangentY = cx / radius;
      const noise = hashNoise(Math.floor(state.t * 24), i) - 0.5;
      p.vx += (tangentX * field * 0.18 + drive * 0.04 + noise * swirl * 0.18) * dt;
      p.vy += (tangentY * field * 0.18 + (params.gravity || 0) * 0.34 + noise * swirl * 0.12) * dt;
      p.vx *= 1 - damping * dt * 2.4;
      p.vy *= 1 - damping * dt * 2.4;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -0.04) p.x = 1.04;
      if (p.x > 1.04) p.x = -0.04;
      if (p.y < -0.04) p.y = 1.04;
      if (p.y > 1.04) p.y = -0.04;
      motionSum += Math.hypot(p.vx, p.vy);
    }

    const machineLedger = state.machine ? energyLedger(state.machine) : null;
    const chemistryHeat = state.reaction ? maxField(state.reaction.heat) : 0;
    const fluidMotion = state.fluid ? state.fluid.vorticity : 0;
    state.t += dt;
    state.energy += drive * dt * 10;
    state.motion = motionSum / Math.max(1, state.particles.length) + (machineLedger ? Math.abs(machineLedger.rpm) / 80 : 0) + fluidMotion;
    state.field = field;
    state.matter = (state.fluid ? state.fluid.mixing : 0) + (state.reaction ? state.reaction.conversion : 0);
    state.heat = chemistryHeat + (params.heatTransfer || 0) * 0.12 + (machineLedger ? Math.max(0, machineLedger.actuatorPowerW) / 600 : 0);
    state.stability = clamp01(1 - Math.abs(field - drive) * 0.14 - swirl * 0.11 - chemistryHeat * 0.08);
    return state;
  }

  function formatMetric(value, digits = 1) {
    if (!Number.isFinite(value)) return '0';
    return value.toFixed(digits);
  }

  function readoutValues(state, spec) {
    if (spec.templateId === 'blank-world') {
      return {
        modules: '0',
        objects: '0',
        forces: '0',
        sources: '0',
        sinks: '0',
        canvas: formatMetric(state.params.canvasScale, 2),
      };
    }
    if (spec.templateId === 'custom-world') {
      return {
        energy: formatMetric(state.energy, 1),
        motion: formatMetric(state.motion * 100, 1),
        field: formatMetric(state.field, 2),
        matter: formatMetric(state.matter * 100, 0),
        heat: formatMetric(state.heat * 100, 0),
        stability: formatMetric(state.stability * 100, 0),
      };
    }
    if (spec.templateId === 'fluid-vortex') {
      return {
        flow: formatMetric(state.params.inletFlow, 2),
        pressure: formatMetric(state.pressure, 1),
        vorticity: formatMetric(state.vorticity, 2),
        mixing: formatMetric(state.mixing * 100, 0),
        drag: formatMetric(state.dragLossJ, 1),
        age: formatMetric(state.t, 1),
      };
    }
    if (spec.templateId === 'reaction-diffusion') {
      const massB = state.conversion * state.size * state.size;
      return {
        conversion: formatMetric(state.conversion * 100, 1),
        heat: formatMetric(maxField(state.heat) * 100, 0),
        front: formatMetric(state.front * 1000, 2),
        'mass b': formatMetric(massB, 0),
        entropy: formatMetric(state.entropy, 3),
        time: formatMetric(state.t, 1),
      };
    }
    const ledger = energyLedger(state);
    return {
      rpm: formatMetric(ledger.rpm, 1),
      torque: formatMetric(ledger.torqueNm, 2),
      solar: formatMetric(ledger.solarPowerW, 0),
      load: formatMetric(ledger.loadPowerW, 1),
      actuator: formatMetric(ledger.actuatorPowerW, 1),
      balance: formatMetric(ledger.balanceErrorJ, 2),
    };
  }

  function maxField(field) {
    let max = 0;
    for (const value of field || []) max = Math.max(max, value);
    return max;
  }

  function stateLabel(state, spec) {
    if (spec.templateId === 'blank-world') {
      return 'blank construction plane';
    }
    if (spec.templateId === 'custom-world') {
      if (hasModule(spec, 'chemistry') && hasModule(spec, 'fluid')) return 'composed fluid chemistry';
      if (hasModule(spec, 'electromagnetism') && hasModule(spec, 'solar')) return 'composed magnetic machine';
      if (hasModule(spec, 'fluid')) return 'composed flow world';
      if (hasModule(spec, 'chemistry')) return 'composed reaction world';
      return 'composed physics world';
    }
    if (spec.templateId === 'fluid-vortex') {
      return state.vorticity > 0.35 ? 'turbulent wake' : 'laminar drift';
    }
    if (spec.templateId === 'reaction-diffusion') {
      return state.front > 0.0004 ? 'reaction front active' : 'diffusing';
    }
    const ledger = energyLedger(state);
    return Math.abs(state.omega) < 0.05 && state.t > 2
      ? 'stalled'
      : ledger.loadPowerW > 0.2
        ? 'spinning under load'
        : 'seeking torque';
  }

  function createBrowserLab(root = document) {
    const canvas = root.getElementById('physics-canvas');
    if (!canvas) return null;
    const fieldCanvas = root.getElementById('field-canvas');
    const ctx = canvas.getContext('2d');
    const controlStack = root.getElementById('control-stack');
    const nameInput = root.getElementById('simulation-name');
    const promptInput = root.getElementById('build-prompt');
    const specPreview = root.getElementById('spec-preview');
    const templateButtons = Array.from(root.querySelectorAll('[data-template-id]'));
    const readouts = Array.from({ length: 6 }, (_, index) => ({
      label: root.getElementById(`readout-${index + 1}-label`),
      value: root.getElementById(`readout-${index + 1}`),
    }));
    const stateReadout = root.getElementById('lab-state');
    let spec = createSpec('magnetic-wheel');
    let state = createSimulationState(spec);
    const field = root.defaultView && root.defaultView.SimulatteParticleField && fieldCanvas
      ? root.defaultView.SimulatteParticleField.create(fieldCanvas, { count: 420 })
      : null;
    let last = performance.now();
    let paused = false;

    const setSpec = (nextSpec) => {
      spec = normalizeSpec(nextSpec);
      state = createSimulationState(spec);
      if (nameInput) nameInput.value = spec.name;
      renderControls(controlStack, spec);
      syncTemplateButtons(templateButtons, spec.templateId);
      syncReadoutLabels(readouts, spec);
      syncSpecPreview(specPreview, spec);
      last = performance.now();
    };

    templateButtons.forEach((button) => {
      button.addEventListener('click', () => setSpec(createSpec(button.dataset.templateId)));
    });
    root.getElementById('build-lab')?.addEventListener('click', () => {
      setSpec(createSpecFromPrompt(promptInput ? promptInput.value : ''));
    });
    root.getElementById('reset-lab')?.addEventListener('click', () => setSpec(spec));
    root.getElementById('pause-lab')?.addEventListener('click', () => {
      paused = !paused;
      root.getElementById('pause-lab').textContent = paused ? 'Resume' : 'Pause';
    });
    root.getElementById('remix-lab')?.addEventListener('click', () => setSpec(remixSpec(readSpecFromUi(spec, controlStack, nameInput))));
    root.getElementById('export-lab')?.addEventListener('click', async () => {
      const payload = serializeSpec(readSpecFromUi(spec, controlStack, nameInput));
      try {
        await navigator.clipboard.writeText(payload);
      } catch (_err) {
        window.prompt('Simulatte simulation spec:', payload);
      }
    });
    root.getElementById('import-lab')?.addEventListener('click', () => {
      const raw = window.prompt('Paste Simulatte simulation spec JSON:');
      if (!raw) return;
      try {
        setSpec(deserializeSpec(raw));
      } catch (_err) {
        if (stateReadout) stateReadout.textContent = 'import failed';
      }
    });

    function tick(now) {
      const dt = clamp((now - last) / 1000 || 0.016, 0.001, 0.05);
      last = now;
      resizeCanvas(canvas, ctx);
      if (field) {
        const box = canvas.getBoundingClientRect();
        field.resize(box.width, box.height, window.devicePixelRatio || 1);
      }
      spec = readSpecFromUi(spec, controlStack, nameInput);
      if (!paused) {
        const substeps = spec.templateId === 'reaction-diffusion' ? 2 : 3;
        for (let i = 0; i < substeps; i += 1) {
          state = stepSimulation(state, spec, dt / substeps);
        }
      }
      drawSimulation(ctx, canvas, state, spec);
      syncField(field, canvas, state, spec);
      syncReadouts(readouts, stateReadout, state, spec);
      syncSpecPreview(specPreview, spec);
      if (field) {
        if (fieldCanvas) fieldCanvas.style.opacity = spec.templateId === 'blank-world' ? '0' : '';
        if (spec.templateId !== 'blank-world') {
          field.step(dt);
          field.render();
        }
      }
      requestAnimationFrame(tick);
    }

    setSpec(spec);
    requestAnimationFrame(tick);
    return { getSpec: () => spec, getState: () => state, setSpec };
  }

  function renderControls(controlStack, spec) {
    if (!controlStack) return;
    controlStack.innerHTML = '';
    for (const [key, label, min, max, step] of controlsForSpec(spec)) {
      const wrapper = document.createElement('label');
      wrapper.className = 'physics-control';
      wrapper.setAttribute('for', `control-${key}`);
      const title = document.createElement('span');
      title.textContent = label;
      const input = document.createElement('input');
      input.id = `control-${key}`;
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(spec.params[key]);
      input.dataset.paramKey = key;
      wrapper.append(title, input);
      controlStack.appendChild(wrapper);
    }
  }

  function readSpecFromUi(spec, controlStack, nameInput) {
    const params = { ...spec.params };
    if (controlStack) {
      controlStack.querySelectorAll('[data-param-key]').forEach((input) => {
        params[input.dataset.paramKey] = Number(input.value);
      });
    }
    return normalizeSpec({
      ...spec,
      name: nameInput && nameInput.value ? nameInput.value : spec.name,
      params,
    });
  }

  function syncTemplateButtons(buttons, templateId) {
    buttons.forEach((button) => {
      const active = button.dataset.templateId === templateId;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.classList.toggle('is-active', active);
    });
  }

  function syncReadoutLabels(readouts, spec) {
    const labels = templateById(spec.templateId).readouts;
    readouts.forEach((readout, index) => {
      if (readout.label) readout.label.textContent = labels[index] || '-';
    });
  }

  function syncReadouts(readouts, stateReadout, state, spec) {
    const values = readoutValues(state, spec);
    const labels = templateById(spec.templateId).readouts;
    readouts.forEach((readout, index) => {
      const key = labels[index];
      if (readout.value) readout.value.textContent = values[key] || '0';
    });
    if (stateReadout) stateReadout.textContent = stateLabel(state, spec);
  }

  function syncSpecPreview(node, spec) {
    if (!node) return;
    node.textContent = JSON.stringify({
      schema: spec.schema,
      template: spec.templateId,
      name: spec.name,
      modules: spec.modules,
      objects: spec.objects,
      controls: controlsForSpec(spec).map((control) => control[0]),
      params: spec.params,
      remixOf: spec.remixOf || null,
    }, null, 2);
  }

  function resizeCanvas(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(box.width * dpr));
    const height = Math.max(280, Math.round(box.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function simulationGeometry(canvas, state) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const cx = width * 0.52;
    const cy = height * 0.52;
    const radius = Math.min(width, height) * 0.25;
    const statorRadius = radius * 1.42;
    const stator = {
      x: cx + Math.cos(state.sliderAngle || 0) * statorRadius,
      y: cy + Math.sin(state.sliderAngle || 0) * statorRadius,
    };
    return { width, height, cx, cy, radius, stator };
  }

  function syncField(field, canvas, state, spec) {
    if (!field) return;
    const geometry = simulationGeometry(canvas, state);
    if (spec.templateId === 'blank-world') {
      field.sync({ scenario: { id: spec.id, seed: 5 }, tick: 0, metrics: { load: 0, coverage: 100, trust: 100, stability: 100 } }, []);
      return;
    }
    if (spec.templateId === 'custom-world') {
      const width = geometry.width;
      const height = geometry.height;
      const markers = (spec.objects || []).slice(0, 6).map((object, index) => {
        const angle = (index / Math.max(1, spec.objects.length)) * TAU + state.t * 0.12;
        return {
          object: { id: object.id, kind: object.type === 'source' ? 'goal' : object.type === 'sink' ? 'shock' : 'resource', active: true },
          screen: {
            x: width * 0.52 + Math.cos(angle) * Math.min(width, height) * 0.26,
            y: height * 0.54 + Math.sin(angle) * Math.min(width, height) * 0.22,
          },
        };
      });
      field.sync(
        {
          scenario: { id: spec.id, seed: spec.modules.length * 31 },
          tick: state.t,
          metrics: {
            load: clamp(state.motion * 70, 0, 100),
            coverage: clamp(state.matter * 100, 0, 100),
            trust: clamp(state.stability * 100, 0, 100),
            stability: clamp(state.stability * 100 - state.heat * 8, 0, 100),
          },
        },
        markers
      );
      return;
    }
    if (spec.templateId === 'reaction-diffusion') {
      field.sync({ scenario: { id: spec.id, seed: 99 }, tick: state.t, metrics: { load: state.conversion * 100, coverage: 80, trust: 75, stability: 80 } }, []);
      return;
    }
    if (spec.templateId === 'fluid-vortex') {
      field.sync(
        { scenario: { id: spec.id, seed: 77 }, tick: state.t, metrics: { load: state.pressure, coverage: 70, trust: state.mixing * 100, stability: 80 } },
        [
          { object: { id: 'inlet', kind: 'goal', active: true }, screen: { x: geometry.width * 0.16, y: geometry.height * 0.52 } },
          { object: { id: 'obstacle', kind: 'shock', active: true }, screen: { x: geometry.width * 0.56, y: geometry.height * 0.52 } },
        ]
      );
      return;
    }
    const magnets = [];
    for (let i = 0; i < 10; i += 2) {
      const angle = state.theta + (i / 10) * TAU;
      magnets.push({
        object: { id: `rotor-${i}`, kind: i % 4 === 0 ? 'resource' : 'shock', active: true },
        screen: {
          x: geometry.cx + Math.cos(angle) * geometry.radius,
          y: geometry.cy + Math.sin(angle) * geometry.radius,
        },
      });
    }
    const ledger = energyLedger(state);
    field.sync(
      {
        scenario: { id: spec.id, seed: 42 },
        tick: state.t,
        metrics: {
          load: clamp(Math.abs(ledger.torqueNm) * 38, 0, 100),
          coverage: clamp(100 - Math.abs(ledger.balanceErrorJ) * 0.8, 0, 100),
          trust: clamp(70 + ledger.loadPowerW * 2 - ledger.actuatorPowerW * 0.08, 0, 100),
          stability: clamp(100 - Math.abs(ledger.balanceErrorJ) * 0.6, 0, 100),
        },
      },
      [{ object: { id: 'solar-slider', kind: 'goal', active: true }, screen: geometry.stator }, ...magnets]
    );
  }

  function drawSimulation(ctx, canvas, state, spec) {
    if (spec.templateId === 'blank-world') {
      drawBlankWorld(ctx, canvas, state);
    } else if (spec.templateId === 'custom-world') {
      drawCustomWorld(ctx, canvas, state, spec);
    } else if (spec.templateId === 'fluid-vortex') {
      drawFluid(ctx, canvas, state);
    } else if (spec.templateId === 'reaction-diffusion') {
      drawReaction(ctx, canvas, state);
    } else {
      drawMagnetic(ctx, canvas, state);
    }
  }

  function drawBlankWorld(ctx, canvas, state) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    clearScene(ctx, width, height);
    const scale = clamp(state.params.canvasScale || 0.62, 0.2, 1);
    const density = clamp(state.params.guideDensity || 0.42, 0, 1);
    const cx = width * 0.52;
    const cy = height * 0.52;
    const w = Math.min(width * 0.58, height * 0.72) * scale;
    const h = w * 0.62;

    ctx.save();
    ctx.strokeStyle = 'rgba(43, 137, 118, 0.18)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.34)';
    ctx.lineWidth = 1;
    ctx.setLineDash([9, 12]);
    roundedRect(ctx, cx - w / 2, cy - h / 2, w, h, 22);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    const slots = [
      ['module slot', cx - w * 0.28, cy - h * 0.16],
      ['object slot', cx + w * 0.24, cy - h * 0.1],
      ['force slot', cx - w * 0.04, cy + h * 0.22],
    ];
    ctx.font = '12px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    slots.forEach(([label, x, y], index) => {
      const radius = 40 + density * 26 + index * 4;
      ctx.strokeStyle = 'rgba(122, 201, 67, 0.18)';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.setLineDash(index === 1 ? [4, 9] : [7, 10]);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(23, 32, 29, 0.48)';
      ctx.fillText(label, x - 28, y + 4);
    });

    ctx.strokeStyle = 'rgba(43, 137, 118, 0.16)';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.42, cy);
    ctx.lineTo(cx + w * 0.42, cy);
    ctx.moveTo(cx, cy - h * 0.38);
    ctx.lineTo(cx, cy + h * 0.38);
    ctx.stroke();
    drawModuleChips(ctx, width, height, ['blank plane']);
    ctx.restore();
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function drawCustomWorld(ctx, canvas, state, spec) {
    if (state.machine) {
      drawMagnetic(ctx, canvas, state.machine);
      drawCustomParticleLayer(ctx, canvas, state, spec, 0.32);
      if (state.reaction) drawReactionLayer(ctx, canvas, state.reaction, 0.32);
      drawObjectLabels(ctx, canvas, spec);
      return;
    }
    if (state.fluid && !state.reaction) {
      drawFluid(ctx, canvas, state.fluid);
      drawCustomParticleLayer(ctx, canvas, state, spec, 0.2);
      drawObjectLabels(ctx, canvas, spec);
      return;
    }
    if (state.reaction && !state.fluid) {
      drawReaction(ctx, canvas, state.reaction);
      drawCustomParticleLayer(ctx, canvas, state, spec, 0.25);
      drawObjectLabels(ctx, canvas, spec);
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    clearScene(ctx, width, height);
    if (state.reaction) drawReactionLayer(ctx, canvas, state.reaction, 0.48);
    if (state.fluid) drawFluidLayer(ctx, canvas, state.fluid, 0.62);
    drawCustomParticleLayer(ctx, canvas, state, spec, 0.76);
    drawObjectLabels(ctx, canvas, spec);
  }

  function drawCustomParticleLayer(ctx, canvas, state, spec, alpha) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const colors = ['215, 255, 111', '107, 224, 195', '246, 200, 95', '255, 128, 111'];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      const speed = clamp(Math.hypot(p.vx, p.vy) * 12, 0, 1);
      const color = colors[p.kind % colors.length];
      ctx.fillStyle = `rgba(${color}, ${0.05 + speed * alpha})`;
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, 1.4 + speed * 5.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    drawModuleChips(ctx, width, height, spec.modules);
  }

  function drawModuleChips(ctx, width, height, modules) {
    ctx.save();
    ctx.font = '11px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    let x = 22;
    const y = 28;
    for (const moduleName of modules.slice(0, 7)) {
      const label = moduleName.replace(/-/g, ' ');
      const w = ctx.measureText(label).width + 14;
      ctx.strokeStyle = 'rgba(43, 137, 118, 0.22)';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
      ctx.strokeRect(x, y, w, 22);
      ctx.fillRect(x, y, w, 22);
      ctx.fillStyle = 'rgba(30, 94, 83, 0.78)';
      ctx.fillText(label, x + 7, y + 14);
      x += w + 7;
      if (x > width - 140) break;
    }
    ctx.restore();
  }

  function drawObjectLabels(ctx, canvas, spec) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const objects = (spec.objects || []).slice(0, 6);
    ctx.save();
    ctx.font = '11px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    objects.forEach((object, index) => {
      const angle = (index / Math.max(1, objects.length)) * TAU + 0.4;
      const x = width * 0.52 + Math.cos(angle) * Math.min(width, height) * 0.34;
      const y = height * 0.54 + Math.sin(angle) * Math.min(width, height) * 0.28;
      ctx.strokeStyle = 'rgba(243, 243, 236, 0.2)';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.58)';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(23, 32, 29, 0.58)';
      ctx.fillText(object.id.slice(0, 22), x + 8, y + 4);
    });
    ctx.restore();
  }

  function clearScene(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f8fbf6';
    ctx.fillRect(0, 0, width, height);
    drawGrid(ctx, width, height);
  }

  function drawGrid(ctx, width, height) {
    ctx.save();
    ctx.strokeStyle = 'rgba(39, 93, 79, 0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMagnetic(ctx, canvas, state) {
    const { width, height, cx, cy, radius, stator } = simulationGeometry(canvas, state);
    clearScene(ctx, width, height);
    drawMagneticField(ctx, cx, cy, radius, stator, state);
    drawWheel(ctx, cx, cy, radius, state);
    drawStator(ctx, cx, cy, radius, stator, state);
    drawEnergyBars(ctx, width, height, state);
  }

  function drawMagneticField(ctx, cx, cy, radius, stator, state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const count = 180;
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * TAU + state.t * 0.18;
      const ring = radius * (0.58 + (i % 9) * 0.072);
      const sx = cx + Math.cos(a + state.theta * 0.22) * ring;
      const sy = cy + Math.sin(a + state.theta * 0.22) * ring;
      const dx = stator.x - sx;
      const dy = stator.y - sy;
      const pull = clamp(1 / Math.max(1, Math.hypot(dx, dy) / radius), 0, 1);
      ctx.fillStyle = `rgba(43, 184, 166, ${0.028 + pull * 0.13})`;
      ctx.beginPath();
      ctx.arc(sx + dx * pull * 0.2, sy + dy * pull * 0.2, 1.2 + pull * 2.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWheel(ctx, cx, cy, radius, state) {
    ctx.save();
    ctx.strokeStyle = 'rgba(91, 143, 58, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.15, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 10; i += 1) {
      const a = state.theta + (i / 10) * TAU;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      ctx.strokeStyle = i % 2 === 0 ? '#7ac943' : '#e7725f';
      ctx.fillStyle = i % 2 === 0 ? 'rgba(122, 201, 67, 0.16)' : 'rgba(231, 114, 95, 0.16)';
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawStator(ctx, cx, cy, radius, stator, state) {
    const target = sliderTargetAngle(state, state.params);
    const targetPoint = {
      x: cx + Math.cos(target) * radius * 1.42,
      y: cy + Math.sin(target) * radius * 1.42,
    };
    ctx.save();
    ctx.strokeStyle = 'rgba(217, 164, 49, 0.42)';
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.42, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(217, 164, 49, 0.62)';
    ctx.beginPath();
    ctx.moveTo(stator.x, stator.y);
    ctx.lineTo(targetPoint.x, targetPoint.y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(217, 164, 49, 0.14)';
    ctx.strokeStyle = '#d9a431';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(stator.x, stator.y, 15, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawEnergyBars(ctx, width, height, state) {
    const ledger = energyLedger(state);
    const items = [
      ['solar in', ledger.solarInputJ, '#7ac943'],
      ['actuator', ledger.actuatorWorkJ, '#d9a431'],
      ['load out', ledger.loadOutputJ, '#2bb8a6'],
      ['losses', ledger.frictionLossJ + ledger.generatorLossJ, '#e7725f'],
    ];
    const max = Math.max(1, ...items.map((item) => item[1]));
    const x = 24;
    const y = height - 128;
    ctx.save();
    ctx.font = '11px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    items.forEach(([label, value, color], index) => {
      const yy = y + index * 27;
      ctx.fillStyle = 'rgba(23, 32, 29, 0.1)';
      ctx.fillRect(x, yy + 15, 180, 3);
      ctx.fillStyle = color;
      ctx.fillText(`${label} ${formatMetric(value, 1)}J`, x, yy);
      ctx.fillRect(x, yy + 15, 180 * clamp(value / max, 0, 1), 3);
    });
    ctx.restore();
  }

  function drawFluid(ctx, canvas, state) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    clearScene(ctx, width, height);
    drawFluidLayer(ctx, canvas, state, 1);
  }

  function drawFluidLayer(ctx, canvas, state, alpha = 1) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const obstacle = { x: width * 0.56, y: height * 0.52, r: Math.min(width, height) * state.params.obstacleRadius };
    ctx.save();
    const band = ctx.createLinearGradient(width * 0.08, 0, width * 0.92, 0);
    band.addColorStop(0, `rgba(43, 184, 166, ${0.2 * alpha})`);
    band.addColorStop(0.5, `rgba(111, 188, 229, ${0.14 * alpha})`);
    band.addColorStop(1, `rgba(122, 201, 67, ${0.08 * alpha})`);
    ctx.fillStyle = band;
    roundedRect(ctx, width * 0.1, height * 0.22, width * 0.78, height * 0.6, 28);
    ctx.fill();
    ctx.strokeStyle = `rgba(43, 137, 118, ${0.16 * alpha})`;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = `rgba(32, 154, 150, ${0.34 * alpha})`;
    ctx.lineWidth = 1.45;
    for (let i = 0; i < 14; i += 1) {
      const y = height * (0.26 + i * 0.043);
      ctx.beginPath();
      ctx.moveTo(width * 0.12, y);
      for (let x = width * 0.16; x <= width * 0.86; x += 42) {
        const wake = Math.sin(state.t * 2 + i * 0.9 + x * 0.018) * height * 0.022;
        ctx.lineTo(x, y + wake);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      const speed = clamp(Math.hypot(p.vx, p.vy), 0, 2);
      ctx.fillStyle = `rgba(${54 + speed * 42}, ${168 + p.age * 58}, 205, ${(0.18 + speed * 0.38) * alpha})`;
      ctx.beginPath();
      ctx.ellipse(p.x * width, p.y * height, 2 + speed * 4.8, 1.1 + speed * 2.2, Math.atan2(p.vy, p.vx), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);
    ctx.rotate(0.18);
    ctx.strokeStyle = `rgba(217, 164, 49, ${0.56 * alpha})`;
    ctx.fillStyle = `rgba(217, 164, 49, ${0.12 * alpha})`;
    ctx.lineWidth = 2;
    roundedRect(ctx, -obstacle.r * 0.42, -obstacle.r * 1.35, obstacle.r * 0.84, obstacle.r * 2.7, obstacle.r * 0.38);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(43, 184, 166, 0.58)';
    ctx.beginPath();
    ctx.moveTo(width * 0.08, height * 0.52);
    ctx.lineTo(width * 0.24, height * 0.52);
    ctx.stroke();
    ctx.fillStyle = 'rgba(43, 137, 118, 0.56)';
    ctx.font = '12px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('inlet', width * 0.09, height * 0.49);
    ctx.fillText('outlet', width * 0.81, height * 0.49);
  }

  function drawReaction(ctx, canvas, state) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    clearScene(ctx, width, height);
    drawReactionLayer(ctx, canvas, state, 1);
  }

  function drawReactionLayer(ctx, canvas, state, alpha = 1) {
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const size = state.size;
    const cell = Math.max(2, Math.min(width, height) * 0.78 / size);
    const left = width * 0.52 - (cell * size) / 2;
    const top = height * 0.52 - (cell * size) / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const idx = y * size + x;
        const b = state.b[idx];
        const heat = state.heat[idx];
        if (b < 0.025 && heat < 0.025) continue;
        ctx.fillStyle = `rgba(${Math.round(80 + heat * 175)}, ${Math.round(120 + b * 120)}, ${Math.round(80 + b * 170)}, ${(0.18 + Math.max(b, heat) * 0.72) * alpha})`;
        ctx.fillRect(left + x * cell, top + y * cell, cell + 0.4, cell + 0.4);
      }
    }
  }

  function start() {
    if (typeof document === 'undefined') return null;
    return createBrowserLab(document);
  }

  return {
    DEFAULT_PARAMS,
    TEMPLATE_LIBRARY,
    createSimulationState,
    createSpec,
    createSpecFromPrompt,
    createState,
    deserializeSpec,
    energyLedger,
    magneticTorque,
    normalizeSpec,
    readoutValues,
    remixSpec,
    serializeSpec,
    solarPower,
    start,
    stepSimulation,
    stepState,
  };
});

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.SimulattePhysicsLab.start();
  });
}
