const assert = require('node:assert/strict');
const test = require('node:test');

const lab = require('../public/js/simulatte-physics-lab.js');

test('builder creates the solar magnetic perpetual motion machine from prompt', () => {
  const spec = lab.createSpecFromPrompt(
    'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun'
  );

  assert.equal(spec.templateId, 'custom-world');
  assert.equal(spec.intent.schema, 'simulatte.intent.v1');
  assert.equal(spec.name, 'Solar Magnetic Perpetual Motion Machine');
  assert.ok(spec.modules.includes('electromagnetism'));
  assert.ok(spec.modules.includes('solar'));
  assert.ok(spec.objects.some((object) => object.id === 'rotor-wheel'));
  assert.ok(spec.controls.some((control) => control[0] === 'sliderAmplitude'));
  assert.equal(spec.params.irradiance, 780);
  assert.equal(spec.params.sliderAmplitude, 0.42);
  assert.equal(spec.params.loadTorque, 0.16);
});

test('examples resolve through intent before simulation spec', () => {
  for (const example of lab.EXAMPLE_INTENTS) {
    const intent = lab.createIntentFromPrompt(example.prompt);
    const spec = lab.resolveIntentToSpec(intent);

    assert.equal(intent.schema, 'simulatte.intent.v1');
    assert.equal(spec.intent.prompt, example.prompt);
    assert.ok(['custom-world', 'blank-world'].includes(spec.templateId));
  }
});

test('example seeds are unnamed prompt presets with distinct parameter values', () => {
  const visibleLabels = lab.EXAMPLE_INTENTS.map((example) => example.label);
  const forbiddenLabels = ['Forest fire', 'Watershed', 'City grid', 'Optics', 'Mag wheel'];
  const signatures = new Set(lab.EXAMPLE_INTENTS.map((example) => JSON.stringify(example.params || {})));
  const textSignatures = new Set(lab.EXAMPLE_INTENTS.map((example) => {
    const spec = lab.createSpecFromPrompt(example.prompt);
    return JSON.stringify(Object.fromEntries(Object.entries(spec.params).sort().slice(0, 12)));
  }));
  const rotor = lab.EXAMPLE_INTENTS.find((example) => example.id === 'magnetic-machine');
  const glass = lab.EXAMPLE_INTENTS.find((example) => example.id === 'prismatic-rail');
  const burn = lab.EXAMPLE_INTENTS.find((example) => example.id === 'dry-combustion');
  const service = lab.EXAMPLE_INTENTS.find((example) => example.id === 'service-loop');
  const rain = lab.EXAMPLE_INTENTS.find((example) => example.id === 'rain-cut');
  const matter = lab.EXAMPLE_INTENTS.find((example) => example.id === 'matter-tray');

  assert.deepEqual(visibleLabels, ['W', 'X', 'Y', 'Z', 'P', 'Q']);
  for (const label of forbiddenLabels) assert.equal(visibleLabels.includes(label), false);
  assert.ok(signatures.size >= 6);
  assert.ok(textSignatures.size >= 5);
  assert.equal(lab.createSpecFromPrompt(rotor.prompt).params.irradiance, 1040);
  assert.equal(lab.createSpecFromPrompt(burn.prompt).params.combustibility, 0.88);
  assert.equal(lab.createSpecFromPrompt(glass.prompt).params.refractiveIndex, 1.68);
  assert.equal(lab.createSpecFromPrompt(service.prompt).params.queueBacklog, 0.78);
  assert.equal(lab.createSpecFromPrompt(rain.prompt).params.erosionRate, 0.62);
  assert.equal(lab.createSpecFromPrompt(matter.prompt, { params: matter.params }).params.magnetization, 0.68);
});

test('blank prompt resolves to empty construction plane intent', () => {
  const intent = lab.createIntentFromPrompt('blank world');
  const spec = lab.resolveIntentToSpec(intent);

  assert.equal(spec.templateId, 'blank-world');
  assert.deepEqual(intent.domains, ['blank']);
  assert.equal(spec.modules.length, 0);
  assert.equal(spec.objects.length, 0);
});

test('simulation specs export, import, and remix with lineage', () => {
  const spec = lab.createSpecFromPrompt('make a fluid vortex tank with turbulence and pressure');
  const restored = lab.deserializeSpec(lab.serializeSpec(spec));
  const remix = lab.remixSpec(restored, { name: 'Fluid Vortex Remix' });

  assert.equal(restored.templateId, 'custom-world');
  assert.ok(restored.modules.includes('fluid'));
  assert.equal(restored.name, spec.name);
  assert.equal(remix.templateId, 'custom-world');
  assert.equal(remix.remixOf, restored.id);
  assert.equal(remix.name, 'Fluid Vortex Remix');
});

test('builder composes hybrid worlds from multiple physical domains', () => {
  const spec = lab.createSpecFromPrompt('build a solar magnetic wheel in turbulent cooling fluid with catalyst chemistry');

  assert.equal(spec.templateId, 'custom-world');
  assert.ok(spec.modules.includes('electromagnetism'));
  assert.ok(spec.modules.includes('fluid'));
  assert.ok(spec.modules.includes('chemistry'));
  assert.ok(spec.controls.some((control) => control[0] === 'vortexStrength'));
  assert.ok(spec.controls.some((control) => control[0] === 'catalyst'));
  assert.ok(spec.objects.some((object) => object.id === 'catalyst-front'));
});

test('free text resolves varied physical primitive families', () => {
  const spec = lab.createSpecFromPrompt(
    'make a prismatic laser beam through a lens with sound waves, sand, plasma, bubbles, and spring collisions'
  );
  const ids = new Set(spec.objects.map((object) => object.id));

  assert.equal(spec.intent.resolution.ranker, 'simulatte-local-tfidf-prototype-embedder.v1');
  assert.equal(spec.intent.classification.schema, 'simulatte.intentClassification.v1');
  assert.ok(spec.intent.classification.priors.length >= 8);
  assert.ok(spec.intent.conceptGraph.length >= 8);
  assert.ok(spec.modules.includes('optics'));
  assert.ok(spec.modules.includes('acoustics'));
  assert.ok(spec.modules.includes('granular'));
  assert.ok(spec.modules.includes('plasma'));
  assert.ok(spec.modules.includes('buoyancy'));
  assert.ok(spec.modules.includes('elasticity'));
  assert.ok(ids.has('optical-prism'));
  assert.ok(ids.has('acoustic-emitter'));
  assert.ok(ids.has('granular-bed'));
  assert.ok(ids.has('plasma-arc'));
  assert.ok(ids.has('buoyant-body'));
  assert.ok(ids.has('spring-constraint'));
});

test('world builder resolves broader component families for composed worlds', () => {
  const spec = lab.createSpecFromPrompt(
    'terrain erosion river with logistics nodes, market demand, queue backlog, noisy sensors, feedback control, infection front, phase change, and data recorder'
  );
  const ids = new Set(spec.objects.map((object) => object.id));

  assert.equal(spec.templateId, 'custom-world');
  assert.ok(spec.intent.components.length >= 12);
  assert.ok(spec.modules.includes('terrain'));
  assert.ok(spec.modules.includes('logistics'));
  assert.ok(spec.modules.includes('market'));
  assert.ok(spec.modules.includes('queue'));
  assert.ok(spec.modules.includes('signal'));
  assert.ok(spec.modules.includes('control'));
  assert.ok(spec.modules.includes('biology'));
  assert.ok(spec.modules.includes('phase-change'));
  assert.ok(ids.has('terrain-heightfield'));
  assert.ok(ids.has('erosion-channel'));
  assert.ok(ids.has('logistics-node'));
  assert.ok(ids.has('market-demand'));
  assert.ok(ids.has('queue-server'));
  assert.ok(ids.has('sensor-array'));
  assert.ok(ids.has('feedback-controller'));
  assert.ok(ids.has('infection-front'));
  assert.ok(ids.has('phase-change-material'));
  assert.ok(ids.has('data-recorder'));
  assert.ok(spec.controls.some((control) => control[0] === 'queueBacklog'));
  assert.ok(spec.controls.some((control) => control[0] === 'controlGain'));
});

test('layered catalog separates math, physics, material, component, composition, and scene libraries', () => {
  assert.equal(lab.MATH_PRIMITIVE_LIBRARY.length, 15);
  assert.equal(lab.PHYSICS_PRIMITIVE_LIBRARY.length, 18);
  assert.equal(lab.MATERIAL_PRIMITIVE_LIBRARY.length, 21);
  assert.equal(lab.COMPONENT_LIBRARY.length, 25);
  assert.equal(lab.COMPOSITION_LIBRARY.length, 14);
  assert.equal(lab.SCENE_LIBRARY.length, 12);
  assert.ok(lab.PHYSICAL_PRIMITIVES.length >= 100);
});

test('component and scene prompts materialize lower-layer recipes', () => {
  const spec = lab.createSpecFromPrompt(
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall'
  );
  const ids = new Set(spec.objects.map((object) => object.id));

  assert.ok(ids.has('forest-fire'));
  assert.ok(ids.has('flame'));
  assert.ok(ids.has('combustion'));
  assert.ok(ids.has('heat-transfer'));
  assert.ok(ids.has('smoke'));
  assert.ok(ids.has('wood'));
  assert.ok(ids.has('water'));
  assert.ok(ids.has('rock-wall'));
  assert.ok(spec.modules.includes('composition'));
  assert.ok(spec.modules.includes('component'));
  assert.ok(spec.modules.includes('material'));
  assert.ok(spec.modules.includes('physics'));
  assert.ok(spec.modules.includes('fire'));
});

test('optics prompts are built from elemental materials and operators', () => {
  const spec = lab.createSpecFromPrompt(
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor'
  );
  const ids = new Set(spec.objects.map((object) => object.id));

  assert.ok(ids.has('optics-bench'));
  assert.ok(ids.has('sun-lamp'));
  assert.ok(ids.has('lens'));
  assert.ok(ids.has('mirror'));
  assert.ok(ids.has('prism'));
  assert.ok(ids.has('glass'));
  assert.ok(ids.has('optics'));
  assert.ok(ids.has('light-source'));
  assert.ok(spec.modules.includes('scene'));
  assert.ok(spec.modules.includes('composition'));
  assert.ok(spec.modules.includes('optics'));
  assert.ok(spec.modules.includes('glass'));
});

test('layer contracts attach material properties, interactions, ports, slots, layout, and readouts', () => {
  const spec = lab.createSpecFromPrompt(
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall'
  );
  const flame = spec.objects.find((object) => object.id === 'flame');
  const slots = spec.contract.recipeSlots['forest-fire'];

  assert.equal(spec.contract.schema, 'simulatte.layerContract.v1');
  assert.equal(spec.contract.layerFocus, 'composition');
  assert.ok(spec.contract.topLevel.includes('forest-fire'));
  assert.equal(spec.contract.materials.water.moisture, 1);
  assert.ok(spec.contract.interactions.some((rule) => rule.id === 'water-suppresses-fire'));
  assert.ok(spec.contract.interactions.some((rule) => rule.id === 'dry-wood-burns'));
  assert.ok(slots.some((slot) => slot.slot === 'fuel bed' && slot.required));
  assert.ok(slots.some((slot) => slot.slot === 'moisture' && !slot.required));
  assert.ok(flame.ports.outputs.includes('heat'));
  assert.equal(spec.contract.layout.grammar, 'patch spread');
  assert.deepEqual(lab.readoutLabelsForSpec(spec), [
    'fuel load',
    'burn front',
    'smoke',
    'moisture',
    'wind',
    'containment',
  ]);
});

test('graph IR carries units, operators, conservation, temporal events, and explanation', () => {
  const spec = lab.createSpecFromPrompt(
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall'
  );
  const graph = spec.contract.graph;

  assert.equal(graph.schema, 'simulatte.graphIR.v1');
  assert.equal(graph.units.combustibility.dimension, 'probability');
  assert.equal(graph.units.heatTransfer.dimension, 'rate');
  assert.ok(graph.nodes.some((node) => node.id === 'flame' && Number.isFinite(node.state.temperature)));
  assert.ok(graph.edges.some((edge) => edge.channel === 'heat' || edge.channel === 'recipe'));
  assert.ok(graph.operators.some((operator) => operator.id === 'combustion'));
  assert.ok(graph.operators.some((operator) => operator.id === 'advection'));
  assert.ok(graph.conservation.some((rule) => rule.id === 'combustion-mass-energy'));
  assert.ok(graph.temporal.some((event) => event.id === 'ignition'));
  assert.equal(graph.validation.status, 'valid');
  assert.equal(graph.explanation.topIdentity, 'forest-fire');
  assert.ok(graph.explanation.expanded.includes('flame'));
  assert.ok(graph.explanation.interactions.includes('water-suppresses-fire'));
});

test('prompt worlds compile into Grid-like classifier composition graphs', () => {
  const fire = lab.createSpecFromPrompt(
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall'
  );
  const optics = lab.createSpecFromPrompt(
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor'
  );
  const city = lab.createSpecFromPrompt(
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger'
  );
  const machine = lab.createSpecFromPrompt(
    'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun'
  );

  assert.equal(fire.worldPlan, null);
  assert.equal(fire.compositionGraph.schema, 'simulatte.compositionGraph.v1');
  assert.equal(fire.renderProgram.schema, 'simulatte.renderProgram.v1');
  assert.ok(fire.intent.classification.priors.some((prior) => prior.primitiveId === 'forest-fire'));
  assert.ok(fire.compositionGraph.operators.some((operator) => operator.id === 'combustion'));
  assert.ok(fire.renderProgram.objects.some((object) => object.shape === 'flame-front'));
  assert.ok(fire.renderProgram.emitters.some((emitter) => emitter.kind === 'plume'));
  assert.ok(optics.intent.classification.priors.some((prior) => prior.primitiveId === 'optics-bench'));
  assert.ok(optics.renderProgram.objects.some((object) => object.shape === 'prism'));
  assert.ok(optics.renderProgram.fields.some((field) => field.kind === 'optical-rays'));
  assert.ok(city.intent.classification.priors.some((prior) => prior.primitiveId === 'city-grid'));
  assert.ok(city.renderProgram.objects.some((object) => object.shape === 'queue-node'));
  assert.ok(city.renderProgram.fields.some((field) => field.kind === 'network-flow'));
  assert.ok(machine.intent.classification.priors.some((prior) => prior.primitiveId === 'rotor-wheel'));
  assert.ok(machine.renderProgram.objects.some((object) => object.shape === 'wheel'));
  assert.ok(machine.renderProgram.fields.some((field) => field.kind === 'dipole'));
});

test('composition render programs do not collapse into one generic shape vocabulary', () => {
  const prompts = [
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall',
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor',
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger',
  ];
  const signatures = prompts.map((prompt) => {
    const spec = lab.createSpecFromPrompt(prompt);
    return new Set(spec.renderProgram.objects.map((object) => object.shape));
  });

  assert.ok(signatures[0].has('fuel-bed'));
  assert.ok(!signatures[0].has('prism'));
  assert.ok(signatures[1].has('prism'));
  assert.ok(!signatures[1].has('queue-node'));
  assert.ok(signatures[2].has('queue-node'));
  assert.ok(!signatures[2].has('flame-front'));
});

test('compiled render programs keep objects positioned inside the visible world', () => {
  const prompts = [
    'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun',
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall',
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor',
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger',
    'mountain watershed with river erosion, terrain patch, sand, soil, rock, water, and gravity',
  ];

  for (const prompt of prompts) {
    const spec = lab.createSpecFromPrompt(prompt);
    for (const object of spec.renderProgram.objects) {
      const center = renderObjectCenter(object);
      assert.ok(center.x >= 0.06 && center.x <= 0.94, `${object.id} x ${center.x}`);
      assert.ok(center.y >= 0.06 && center.y <= 0.94, `${object.id} y ${center.y}`);
    }
  }
});

test('solar magnetic machine places core mechanism parts in physical relation', () => {
  const spec = lab.createSpecFromPrompt(
    'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun'
  );
  const byId = Object.fromEntries(spec.renderProgram.objects.map((object) => [object.id, object]));
  const wheel = renderObjectCenter(byId['rotor-wheel']);
  const slider = renderObjectCenter(byId['stator-slider']);
  const panel = renderObjectCenter(byId['solar-panel']);
  const load = renderObjectCenter(byId['motor-load']);

  assert.ok(wheel.x > 0.42 && wheel.x < 0.58);
  assert.ok(wheel.y > 0.42 && wheel.y < 0.58);
  assert.ok(slider.x > wheel.x);
  assert.ok(panel.x < wheel.x && panel.y < wheel.y);
  assert.ok(load.x > wheel.x && load.y > wheel.y);
});

function renderObjectCenter(object) {
  assert.ok(object, 'render object missing');
  const pose = object.pose || {};
  if (Array.isArray(pose.points) && pose.points.length) {
    const sum = pose.points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
    return { x: sum[0] / pose.points.length, y: sum[1] / pose.points.length };
  }
  return { x: pose.x || 0.5, y: pose.y || 0.5 };
}

test('component state ownership is initialized and stepped by component id', () => {
  const spec = lab.createSpecFromPrompt(
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger'
  );
  const initial = lab.createSimulationState(spec);
  const next = lab.stepSimulation(initial, spec, 1 / 60);

  assert.ok(initial.componentStates['market-queue']);
  assert.ok(Number.isFinite(initial.componentStates['market-queue'].backlog));
  assert.ok(next.componentStates['market-queue'].backlog >= initial.componentStates['market-queue'].backlog);
  assert.ok(spec.contract.graph.operators.some((operator) => operator.id === 'queueService'));
  assert.ok(spec.contract.graph.conservation.some((rule) => rule.id === 'queue-inventory'));
});

test('graph validity reports repairs for invalid raw material and queue compositions', () => {
  const spec = lab.createSpecFromPrompt('rock served by queue');
  const validation = spec.contract.graph.validation;

  assert.equal(validation.status, 'repaired');
  assert.ok(validation.warnings.some((warning) => warning.includes('rock cannot be served')));
  assert.ok(validation.repairs.some((repair) => repair.includes('logistics-node')));
});

test('scene layout grammar and contextual gauges vary by requested world type', () => {
  const optics = lab.createSpecFromPrompt(
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor'
  );
  const watershed = lab.createSpecFromPrompt(
    'mountain watershed with river erosion, terrain patch, sand, soil, rock, water, and gravity'
  );
  const city = lab.createSpecFromPrompt(
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger'
  );

  assert.equal(optics.contract.layout.grammar, 'bench');
  assert.ok(optics.contract.interactions.some((rule) => rule.id === 'glass-refracts-light'));
  assert.ok(lab.readoutLabelsForSpec(optics).includes('refraction'));
  assert.equal(watershed.contract.layout.grammar, 'downhill channel');
  assert.ok(watershed.contract.interactions.some((rule) => rule.id === 'water-carries-erosion'));
  assert.ok(lab.readoutLabelsForSpec(watershed).includes('erosion rate'));
  assert.equal(city.contract.layout.grammar, 'orthogonal network');
  assert.ok(lab.readoutLabelsForSpec(city).includes('queue backlog'));
});

test('layer contracts survive spec export and import', () => {
  const spec = lab.createSpecFromPrompt(
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor'
  );
  const restored = lab.deserializeSpec(lab.serializeSpec(spec));
  const lens = restored.objects.find((object) => object.id === 'lens');

  assert.equal(restored.contract.schema, 'simulatte.layerContract.v1');
  assert.deepEqual(restored.contract.readouts, spec.contract.readouts);
  assert.equal(restored.contract.materials.glass.refractiveIndex, 1.52);
  assert.equal(lens.geometry.shape, 'surface');
  assert.ok(lens.ports.outputs.includes('light'));
});

test('blank world is an empty construction plane, not a machine seed', () => {
  const spec = lab.createSpec('blank-world');
  const state = lab.stepSimulation(lab.createSimulationState(spec), spec, 1 / 60);
  const readouts = lab.readoutValues(state, spec);

  assert.equal(spec.templateId, 'blank-world');
  assert.equal(spec.modules.length, 0);
  assert.equal(spec.objects.length, 0);
  assert.deepEqual(Object.keys(readouts), ['modules', 'objects', 'forces', 'sources', 'sinks', 'canvas']);
  for (const value of Object.values(readouts)) {
    assert.ok(Number.isFinite(Number(value)), `blank readout ${value} should be finite`);
  }
});

test('flow seed remains visually and structurally separate from machine seed', () => {
  const flow = lab.createSpec('fluid-vortex');
  const machine = lab.createSpec('magnetic-wheel');

  assert.equal(flow.templateId, 'fluid-vortex');
  assert.ok(flow.modules.includes('fluid'));
  assert.ok(flow.objects.some((object) => object.id === 'fluid-particles'));
  assert.ok(!flow.modules.includes('electromagnetism'));
  assert.ok(machine.modules.includes('electromagnetism'));
});

test('all built-in templates step with finite readouts', () => {
  for (const template of lab.TEMPLATE_LIBRARY) {
    const spec = lab.createSpec(template.id);
    let state = lab.createSimulationState(spec);
    for (let i = 0; i < 120; i += 1) {
      state = lab.stepSimulation(state, spec, 1 / 60);
    }
    const readouts = lab.readoutValues(state, spec);
    assert.equal(Object.keys(readouts).length, template.readouts.length);
    for (const value of Object.values(readouts)) {
      assert.ok(Number.isFinite(Number(value)), `${template.id} readout ${value} should be finite`);
    }
  }
});

test('solar magnetic wheel advances with finite physical state', () => {
  let state = lab.createState();
  for (let i = 0; i < 240; i += 1) {
    state = lab.stepState(state, state.params, 1 / 60);
  }
  const ledger = lab.energyLedger(state);

  assert.ok(Number.isFinite(state.theta));
  assert.ok(Number.isFinite(state.omega));
  assert.ok(Number.isFinite(ledger.rpm));
  assert.ok(ledger.solarInputJ > 0);
  assert.ok(ledger.actuatorWorkJ >= 0);
  assert.ok(ledger.frictionLossJ >= 0);
});

test('zero sun prevents hidden actuator energy injection', () => {
  let state = lab.createState({ irradiance: 0, magneticStrength: 1.2, sliderAmplitude: 1 });
  for (let i = 0; i < 180; i += 1) {
    state = lab.stepState(state, state.params, 1 / 60);
  }
  const ledger = lab.energyLedger(state);

  assert.equal(ledger.solarInputJ, 0);
  assert.equal(ledger.actuatorWorkJ, 0);
  assert.equal(ledger.solarBufferJ, 0);
});

test('load output remains bounded by tracked input and stored motion', () => {
  let state = lab.createState({ irradiance: 900, loadTorque: 0.24 });
  for (let i = 0; i < 360; i += 1) {
    state = lab.stepState(state, state.params, 1 / 60);
  }
  const ledger = lab.energyLedger(state);
  const accountedEnergy =
    ledger.actuatorWorkJ +
    ledger.wheelKineticJ +
    ledger.frictionLossJ +
    ledger.generatorLossJ +
    ledger.solarBufferJ;

  assert.ok(ledger.loadOutputJ <= ledger.solarInputJ + accountedEnergy + 1e-6);
});
