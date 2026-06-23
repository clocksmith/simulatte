(function attachSimulatteSemanticRag(root, factory) {
  const catalog = typeof module === 'object' && module.exports
    ? require('./simulatte-physics-catalog.js')
    : root.SimulattePhysicsCatalog;
  const api = factory(catalog);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteSemanticRag = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createSemanticRagApi(catalog) {
  const {
    PHYSICAL_PRIMITIVES,
    TOKEN_SYNONYMS,
    clamp,
    hashNoise,
    primitiveText,
    uniqueList,
  } = catalog;

  const SEMANTIC_RAG_SCHEMA = 'simulatte.semanticRag.v1';
  const SYNTH_GRAPH_SCHEMA = 'simulatte.synthGraph.v1';
  const FEATURE_DIM = 384;
  const TOKEN_RE = /[a-z0-9][a-z0-9'-]*/g;
  const STOPS = new Set([
    'a', 'an', 'and', 'are', 'as', 'be', 'build', 'by', 'create', 'for', 'from',
    'in', 'into', 'is', 'make', 'of', 'on', 'or', 'simulate', 'simulation',
    'the', 'to', 'with', 'world', 'that', 'this', 'these', 'those', 'there',
    'more', 'very', 'exactly', 'like', 'should', 'use', 'using',
  ]);
  const VISUAL_RULES = Object.freeze([
    rule('fluid', ['water', 'river', 'flow', 'fluid', 'vortex', 'brine', 'mercury', 'air', 'wind', 'bubble', 'droplet']),
    rule('thermal', ['fire', 'flame', 'combustion', 'heat', 'thermal', 'smoke', 'plume', 'plasma', 'sun']),
    rule('optical', ['light', 'laser', 'lens', 'glass', 'prism', 'mirror', 'caustic', 'ray', 'spectrum']),
    rule('magnetic', ['magnet', 'magnetic', 'flux', 'field', 'rotor', 'wheel', 'motor', 'stator']),
    rule('electrical', ['electric', 'charge', 'electron', 'ion', 'current', 'copper', 'silicon', 'circuit']),
    rule('granular', ['sand', 'soil', 'rock', 'grain', 'erosion', 'sediment', 'terrain', 'clay']),
    rule('biological', ['bacteria', 'cell', 'colony', 'mycelium', 'fungal', 'leaf', 'protein', 'growth']),
    rule('soft', ['membrane', 'gel', 'foam', 'fabric', 'elastic', 'tension', 'soft']),
    rule('acoustic', ['sound', 'acoustic', 'wave', 'resonance', 'pressure']),
    rule('phase', ['phase', 'melt', 'freeze', 'steam', 'ice', 'boil', 'transition']),
    rule('atomic', ['atom', 'atomic', 'molecule', 'lattice', 'crystal', 'bond', 'carbon']),
    rule('network', ['queue', 'market', 'traffic', 'logistics', 'network', 'node', 'ledger']),
  ]);
  const ASSEMBLY_RULES = Object.freeze([
    rule('source', ['sun', 'lamp', 'laser', 'inlet', 'emitter', 'heater', 'battery', 'generator']),
    rule('field', ['field', 'flux', 'gravity', 'electric', 'magnetic', 'wind', 'pressure']),
    rule('flow', ['flow', 'river', 'stream', 'channel', 'pipe', 'plume', 'wake', 'vortex']),
    rule('optic', ['lens', 'prism', 'mirror', 'glass', 'caustic', 'beam', 'ray']),
    rule('mechanism', ['wheel', 'rotor', 'gear', 'slider', 'motor', 'spring', 'pump', 'valve']),
    rule('material', ['water', 'sand', 'rock', 'metal', 'wood', 'glass', 'gel', 'foam', 'membrane']),
    rule('colony', ['cell', 'bacteria', 'colony', 'mycelium', 'fungal', 'protein', 'leaf']),
    rule('network', ['queue', 'node', 'traffic', 'market', 'logistics', 'sensor', 'controller']),
    rule('reaction', ['reaction', 'reactor', 'combustion', 'diffusion', 'phase', 'catalyst']),
  ]);
  const UNIVERSE_SURFACE_CARDS = Object.freeze(universeSurfaceCards());
  const SEMANTIC_SURFACE_CARDS = Object.freeze([
    surfaceCard('entity.mouse', 'entity', ['mouse', 'field mouse', 'small rodent'], 'small mammal with soft body, paws, gait, whiskers, and low mass', {
      classHints: ['small_mammal', 'rodent'], shapeHints: ['soft_articulated_body'], materialHints: ['soft_tissue', 'fur'],
      behaviorHints: ['running_gait', 'frictional_feet'], scaleHints: ['small'], groundingIds: ['ground.small-mammal-body'],
    }),
    surfaceCard('entity.gerbil', 'entity', ['gerbil', 'desert rodent', 'small burrowing rodent'], 'small mammal similar to a mouse, with running gait and soft biological body', {
      classHints: ['small_mammal', 'rodent'], shapeHints: ['soft_articulated_body'], materialHints: ['soft_tissue', 'fur'],
      behaviorHints: ['running_gait', 'frictional_feet'], scaleHints: ['small'], groundingIds: ['ground.small-mammal-body'],
    }),
    surfaceCard('entity.small-mammal', 'entity', ['hamster', 'rat', 'squirrel', 'rabbit', 'small mammal'], 'small land animal with soft body, limbs, gait, and contact feet', {
      classHints: ['small_mammal'], shapeHints: ['soft_articulated_body'], materialHints: ['soft_tissue', 'fur'],
      behaviorHints: ['gait_force', 'body_collision'], scaleHints: ['small'], groundingIds: ['ground.small-mammal-body'],
    }),
    surfaceCard('entity.large-mammal', 'entity', ['horse', 'cow', 'deer', 'large mammal'], 'large soft articulated land body with limbs, inertia, frictional feet, and gait', {
      classHints: ['large_mammal'], shapeHints: ['articulated_body'], materialHints: ['soft_tissue'],
      behaviorHints: ['gait_force', 'body_collision'], scaleHints: ['large'], groundingIds: ['ground.large-mammal-body'],
    }),
    surfaceCard('entity.human', 'entity', ['person', 'human', 'runner', 'worker'], 'upright articulated soft body with limbs, hands, feet, and active gait', {
      classHints: ['human_body'], shapeHints: ['articulated_body'], materialHints: ['soft_tissue'],
      behaviorHints: ['gait_force', 'pushes', 'carries'], scaleHints: ['human'], groundingIds: ['ground.articulated-body'],
    }),
    surfaceCard('entity.bird', 'entity', ['bird', 'sparrow', 'eagle', 'winged animal'], 'light biological body with wings, lift, flapping, and collision shell', {
      classHints: ['bird'], shapeHints: ['winged_body'], materialHints: ['soft_tissue', 'feather'],
      behaviorHints: ['flapping_lift', 'gliding'], scaleHints: ['small'], groundingIds: ['ground.winged-body'],
    }),
    surfaceCard('entity.fish', 'entity', ['fish', 'salmon', 'shark', 'swimmer'], 'streamlined biological body moving through fluid with fins and drag', {
      classHints: ['fish'], shapeHints: ['streamlined_body'], materialHints: ['soft_tissue'],
      behaviorHints: ['swimming', 'fluid_drag'], scaleHints: ['medium'], groundingIds: ['ground.swimmer-body'],
    }),
    surfaceCard('entity.insect', 'entity', ['ant', 'bee', 'beetle', 'insect'], 'tiny articulated body with legs, shell, swarm behavior, and contact feet', {
      classHints: ['insect'], shapeHints: ['segmented_body'], materialHints: ['biomass'],
      behaviorHints: ['walking_gait', 'swarm'], scaleHints: ['tiny'], groundingIds: ['ground.segmented-body'],
    }),
    surfaceCard('entity.reptile', 'entity', ['snake', 'lizard', 'turtle', 'reptile'], 'cold blooded body with slither, crawl, shell, or low gait contact behavior', {
      classHints: ['reptile'], shapeHints: ['elongated_body'], materialHints: ['soft_tissue', 'shell'],
      behaviorHints: ['slither', 'crawl'], scaleHints: ['medium'], groundingIds: ['ground.articulated-body'],
    }),
    surfaceCard('entity.marine-mammal', 'entity', ['whale', 'dolphin', 'seal'], 'large swimming biological body with buoyancy and fluid drag', {
      classHints: ['marine_mammal'], shapeHints: ['streamlined_body'], materialHints: ['soft_tissue'],
      behaviorHints: ['swimming', 'buoyancy'], scaleHints: ['large'], groundingIds: ['ground.swimmer-body'],
    }),
    surfaceCard('entity.tree', 'entity', ['tree', 'trunk', 'branch canopy'], 'rooted plant with trunk, branches, leaves, bending, moisture, and growth', {
      classHints: ['plant'], shapeHints: ['branching_structure'], materialHints: ['wood', 'leaf', 'biomass'],
      behaviorHints: ['growth', 'wind_bending'], scaleHints: ['large'], groundingIds: ['ground.plant-body'],
    }),
    surfaceCard('entity.root-system', 'entity', ['tree root', 'root network', 'roots'], 'branching underground plant structure interacting with soil, moisture, and erosion', {
      classHints: ['plant_root'], shapeHints: ['branching_network'], materialHints: ['wood', 'biomass', 'soil'],
      behaviorHints: ['growth', 'anchoring', 'water_uptake'], groundingIds: ['ground.branching-network'],
    }),
    surfaceCard('entity.flower', 'entity', ['flower', 'petal', 'blossom'], 'soft plant structure with petals, stem, growth, and light response', {
      classHints: ['plant'], shapeHints: ['radial_soft_structure'], materialHints: ['leaf', 'biomass'],
      behaviorHints: ['growth', 'light_response'], groundingIds: ['ground.plant-body'],
    }),
    surfaceCard('entity.crop-plant', 'entity', ['tomato plant', 'tomato plants', 'crop plant', 'plant', 'plants', 'seedling'], 'cultivated plant with stem, leaves, fruit mass, irrigation, sunlight response, and growth', {
      classHints: ['plant', 'managed_ecosystem'], shapeHints: ['branching_structure'], materialHints: ['leaf', 'biomass', 'water'],
      behaviorHints: ['growth', 'light_response', 'water_uptake'], scaleHints: ['small'], groundingIds: ['ground.plant-body', 'ground.fluid-channel'],
    }),
    surfaceCard('entity.mushroom', 'entity', ['mushroom', 'fungus', 'mycelium fruit'], 'fungal body connected to mycelium with growth and diffusion', {
      classHints: ['fungus'], shapeHints: ['soft_cap_stem'], materialHints: ['mycelium', 'biomass'],
      behaviorHints: ['growth', 'diffusion'], groundingIds: ['ground.biological-colony'],
    }),
    surfaceCard('entity.coral', 'entity', ['coral', 'reef coral'], 'branching marine colony with mineral skeleton, fluid flow, and growth', {
      classHints: ['colony'], shapeHints: ['branching_structure'], materialHints: ['biomass', 'rock'],
      behaviorHints: ['growth', 'fluid_filtering'], groundingIds: ['ground.biological-colony'],
    }),

    surfaceCard('artifact.hamster-wheel', 'artifact', ['hamster wheel', 'running wheel', 'exercise wheel'], 'rotating apparatus with circular rim, axle, support frame, track, and containment', {
      classHints: ['rotating_apparatus', 'animal_exercise_wheel'], shapeHints: ['circular_rim', 'axle'], partHints: ['rim', 'spokes', 'axle', 'support_frame', 'track'],
      materialHints: ['metal', 'plastic', 'rubber'], affordanceHints: ['contains', 'rotates', 'supports_running'], groundingIds: ['ground.rotating-apparatus', 'ground.containment'],
    }),
    surfaceCard('artifact.wheel', 'artifact', ['wheel', 'cart wheel', 'rim'], 'rotating circular body with rim, hub, axle, contact track, and inertia', {
      classHints: ['rotating_apparatus'], shapeHints: ['circular_rim'], partHints: ['rim', 'hub', 'axle'],
      materialHints: ['metal', 'rubber'], affordanceHints: ['rotates', 'rolls'], groundingIds: ['ground.rotating-apparatus'],
    }),
    surfaceCard('artifact.bicycle', 'artifact', ['bicycle', 'bike'], 'two wheeled vehicle with frame, wheels, chain drive, rider contact, and rolling friction', {
      classHints: ['wheeled_vehicle'], shapeHints: ['frame_with_wheels'], partHints: ['wheel', 'frame', 'chain', 'handlebar'],
      materialHints: ['metal', 'rubber'], affordanceHints: ['rolls', 'steers'], groundingIds: ['ground.wheeled-vehicle'],
    }),
    surfaceCard('artifact.car', 'artifact', ['car', 'automobile', 'truck', 'bus'], 'wheeled vehicle with chassis, wheels, engine, suspension, friction, and collision shell', {
      classHints: ['wheeled_vehicle'], shapeHints: ['rigid_chassis'], partHints: ['wheel', 'chassis', 'motor'],
      materialHints: ['metal', 'rubber', 'glass'], affordanceHints: ['rolls', 'collides'], groundingIds: ['ground.wheeled-vehicle'],
    }),
    surfaceCard('artifact.train', 'artifact', ['train', 'railcar', 'locomotive'], 'constrained wheeled vehicle on rails with cars, coupling, inertia, and line motion', {
      classHints: ['rail_vehicle'], shapeHints: ['linked_bodies'], partHints: ['wheel', 'track', 'coupler'],
      materialHints: ['metal'], affordanceHints: ['moves_on_track'], groundingIds: ['ground.constrained-vehicle'],
    }),
    surfaceCard('artifact.aircraft', 'artifact', ['airplane', 'drone', 'glider', 'aircraft'], 'flying vehicle with wings, lift, drag, thrust, and rigid body motion', {
      classHints: ['flying_vehicle'], shapeHints: ['winged_body'], materialHints: ['metal', 'plastic'],
      behaviorHints: ['lift', 'drag', 'thrust'], groundingIds: ['ground.winged-body', 'ground.rigid-machine'],
    }),
    surfaceCard('artifact.boat', 'artifact', ['boat', 'ship', 'raft', 'submarine'], 'floating or submerged vessel with hull, buoyancy, drag, and propulsion', {
      classHints: ['vessel'], shapeHints: ['hull'], materialHints: ['metal', 'wood', 'water'],
      behaviorHints: ['buoyancy', 'fluid_drag'], groundingIds: ['ground.floating-vessel'],
    }),
    surfaceCard('artifact.shopping-cart', 'artifact', ['shopping cart', 'cart', 'trolley'], 'wire basket on caster wheels with rolling contact, load, and collision frame', {
      classHints: ['wheeled_vehicle', 'container'], shapeHints: ['basket_frame'], partHints: ['wheel', 'frame', 'basket'],
      materialHints: ['metal', 'rubber'], affordanceHints: ['contains', 'rolls'], groundingIds: ['ground.wheeled-vehicle', 'ground.container'],
    }),
    surfaceCard('artifact.crane', 'artifact', ['crane', 'hoist', 'winch'], 'lifting machine with boom, cable, pulley, load, and tension constraints', {
      classHints: ['lifting_machine'], shapeHints: ['boom_cable'], partHints: ['pulley', 'cable', 'load'],
      materialHints: ['metal'], behaviorHints: ['lifts', 'tension'], groundingIds: ['ground.lifting-machine'],
    }),
    surfaceCard('artifact.gearbox', 'artifact', ['gearbox', 'gear train', 'clockwork'], 'interlocking rotating gears with teeth, torque transfer, and constraints', {
      classHints: ['rotating_mechanism'], shapeHints: ['gear_train'], partHints: ['gear', 'axle', 'housing'],
      materialHints: ['metal'], behaviorHints: ['torque_transfer'], groundingIds: ['ground.gear-train'],
    }),
    surfaceCard('artifact.pendulum-clock', 'artifact', ['pendulum clock', 'metronome', 'pendulum'], 'oscillating mass on constraint with gravity, damping, and periodic motion', {
      classHints: ['oscillator_machine'], shapeHints: ['pendulum'], partHints: ['bob', 'rod', 'pivot'],
      materialHints: ['metal', 'wood'], behaviorHints: ['oscillates'], groundingIds: ['ground.pendulum'],
    }),
    surfaceCard('artifact.robot-arm', 'artifact', ['robot arm', 'manipulator', 'servo arm'], 'jointed machine with rigid links, actuators, constraints, and end effector', {
      classHints: ['articulated_machine'], shapeHints: ['linked_rigid_bodies'], partHints: ['joint', 'link', 'motor'],
      materialHints: ['metal', 'copper'], behaviorHints: ['actuated_motion'], groundingIds: ['ground.articulated-machine'],
    }),
    surfaceCard('artifact.conveyor', 'artifact', ['conveyor belt', 'belt line'], 'moving belt carrying objects with friction, rollers, and transport flow', {
      classHints: ['transport_machine'], shapeHints: ['belt_loop'], partHints: ['belt', 'roller', 'motor'],
      materialHints: ['rubber', 'metal'], behaviorHints: ['moves_objects'], groundingIds: ['ground.conveyor'],
    }),
    surfaceCard('artifact.pipe-network', 'artifact', ['pipe network', 'plumbing', 'water pipe', 'irrigation pipe', 'irrigation pipes'], 'connected pipes, valves, pumps, pressure, and fluid flow paths', {
      classHints: ['fluid_network'], shapeHints: ['connected_channels'], partHints: ['pipe', 'valve', 'pump'],
      materialHints: ['metal', 'water'], behaviorHints: ['fluid_flow'], groundingIds: ['ground.fluid-network'],
    }),
    surfaceCard('artifact.pump', 'artifact', ['pump', 'water pump', 'pressure pump'], 'pressure source moving fluid through pipes, valves, and vessels', {
      classHints: ['fluid_machine'], shapeHints: ['vessel_loop'], partHints: ['impeller', 'inlet', 'outlet', 'motor'],
      materialHints: ['metal', 'water', 'rubber'], behaviorHints: ['pressure_flow'], groundingIds: ['ground.fluid-network', 'ground.rigid-machine'],
    }),
    surfaceCard('artifact.espresso-machine', 'artifact', ['espresso machine', 'coffee machine'], 'heated pressure machine with water, pump, valve, grounds, and extraction flow', {
      classHints: ['thermal_fluid_machine'], shapeHints: ['vessel_loop'], partHints: ['heater', 'pump', 'valve', 'filter'],
      materialHints: ['metal', 'water', 'biomass'], behaviorHints: ['pressure_flow', 'heat_exchange'], groundingIds: ['ground.thermal-fluid-machine'],
    }),
    surfaceCard('artifact.washing-machine', 'artifact', ['washing machine', 'washer', 'dryer drum'], 'rotating drum with water, fabric, motor, damping, and fluid agitation', {
      classHints: ['rotating_fluid_machine'], shapeHints: ['drum'], partHints: ['wheel', 'motor', 'water', 'fabric'],
      materialHints: ['metal', 'water', 'fabric'], behaviorHints: ['rotates', 'fluid_agitation'], groundingIds: ['ground.rotating-apparatus', 'ground.fluid-vessel'],
    }),
    surfaceCard('artifact.refrigerator', 'artifact', ['refrigerator', 'freezer', 'heat pump'], 'insulated thermal machine with compressor loop, heat exchange, and phase change', {
      classHints: ['thermal_machine'], shapeHints: ['box_loop'], materialHints: ['metal', 'air'],
      behaviorHints: ['heat_exchange', 'phase_change'], groundingIds: ['ground.thermal-machine'],
    }),
    surfaceCard('artifact.solar-panel', 'artifact', ['solar panel', 'photovoltaic panel'], 'flat silicon energy source converting sunlight to electrical output', {
      classHints: ['energy_source'], shapeHints: ['flat_panel'], materialHints: ['silicon', 'glass', 'metal'],
      behaviorHints: ['radiation_to_energy'], groundingIds: ['ground.radiation-source', 'ground.electrical-machine'],
    }),
    surfaceCard('artifact.battery-pack', 'artifact', ['battery pack', 'battery', 'cell stack'], 'stored electrochemical energy source with terminals, current, heat, and balance', {
      classHints: ['energy_storage'], shapeHints: ['cell_stack'], materialHints: ['copper', 'brine', 'metal'],
      behaviorHints: ['charge_flow', 'heat_loss'], groundingIds: ['ground.electrical-machine', 'ground.energy-storage'],
    }),
    surfaceCard('artifact.circuit-board', 'artifact', ['circuit board', 'pcb', 'microchip'], 'electrical network with traces, components, current, delay, and heat', {
      classHints: ['electrical_network'], shapeHints: ['graph_network'], materialHints: ['copper', 'silicon', 'plastic'],
      behaviorHints: ['current_flow', 'signal_delay'], groundingIds: ['ground.electrical-network'],
    }),
    surfaceCard('artifact.laser', 'artifact', ['laser', 'beam emitter'], 'coherent light source with beam, optics, intensity, and heat', {
      classHints: ['light_source'], shapeHints: ['beam_source'], materialHints: ['glass', 'metal'],
      behaviorHints: ['emits_light'], groundingIds: ['ground.optical-source'],
    }),
    surfaceCard('artifact.prism', 'artifact', ['prism', 'triangular glass', 'spectral splitter'], 'transparent optical body splitting light by refraction', {
      classHints: ['optical_element'], shapeHints: ['triangular_prism'], materialHints: ['glass'],
      behaviorHints: ['refracts', 'splits_light'], groundingIds: ['ground.optical-element'],
    }),
    surfaceCard('artifact.lens', 'artifact', ['lens', 'glass lens', 'magnifier'], 'curved transparent optical surface focusing light and caustics', {
      classHints: ['optical_element'], shapeHints: ['curved_lens'], materialHints: ['glass'],
      behaviorHints: ['focuses_light'], groundingIds: ['ground.optical-element'],
    }),
    surfaceCard('artifact.magnet', 'artifact', ['magnet', 'bar magnet', 'electromagnet'], 'magnetic field source with poles, attraction, repulsion, and force', {
      classHints: ['field_source'], shapeHints: ['dipole'], materialHints: ['magnetized-metal', 'copper'],
      behaviorHints: ['magnetic_force'], groundingIds: ['ground.magnetic-source'],
    }),
    surfaceCard('artifact.ball', 'artifact', ['ball', 'marble', 'sphere'], 'round rigid or elastic body that rolls, bounces, collides, and spins', {
      classHints: ['rolling_body'], shapeHints: ['sphere'], materialHints: ['rubber', 'metal', 'glass'],
      behaviorHints: ['rolls', 'bounces'], groundingIds: ['ground.rolling-body'],
    }),
    surfaceCard('artifact.dominoes', 'artifact', ['dominoes', 'falling blocks'], 'chain of rigid blocks with impact, tipping, and sequential collision', {
      classHints: ['rigid_chain'], shapeHints: ['block_chain'], materialHints: ['plastic', 'wood'],
      behaviorHints: ['topples', 'collides'], groundingIds: ['ground.rigid-chain', 'ground.collision-event'],
    }),
    surfaceCard('artifact.rope', 'artifact', ['rope', 'cable', 'string'], 'flexible tensile body with length constraint, tension, sag, and damping', {
      classHints: ['flexible_constraint'], shapeHints: ['curve'], materialHints: ['fabric', 'rubber'],
      behaviorHints: ['tension', 'sag'], groundingIds: ['ground.flexible-cable'],
    }),
    surfaceCard('artifact.balloon', 'artifact', ['balloon', 'inflatable bladder'], 'elastic membrane containing gas with pressure, buoyancy, and rupture behavior', {
      classHints: ['pressure_membrane'], shapeHints: ['inflated_membrane'], materialHints: ['rubber', 'air'],
      affordanceHints: ['contains'], behaviorHints: ['pressure', 'buoyancy'], groundingIds: ['ground.pressure-membrane', 'ground.containment'],
    }),
    surfaceCard('artifact.umbrella', 'artifact', ['umbrella', 'canopy'], 'membrane canopy with ribs, wind load, rain deflection, and hinge structure', {
      classHints: ['membrane_structure'], shapeHints: ['radial_canopy'], materialHints: ['fabric', 'metal'],
      behaviorHints: ['blocks_flow', 'wind_bending'], groundingIds: ['ground.membrane-structure'],
    }),
    surfaceCard('artifact.fan', 'artifact', ['fan', 'blower', 'ventilation fan'], 'rotating blade apparatus moving air with motor torque, pressure, and flow', {
      classHints: ['rotating_apparatus', 'fluid_machine'], shapeHints: ['rotor'], partHints: ['blades', 'hub', 'motor', 'guard'],
      materialHints: ['metal', 'plastic', 'air'], behaviorHints: ['rotation', 'fluid_flow'], groundingIds: ['ground.rotating-apparatus', 'ground.fluid-domain'],
    }),
    surfaceCard('artifact.cup', 'artifact', ['glass cup', 'cup', 'beaker', 'mug'], 'small open container holding liquid with wall boundary, glass or ceramic material, and contact surface', {
      classHints: ['container'], shapeHints: ['vessel'], partHints: ['wall', 'rim', 'interior_volume'],
      materialHints: ['glass', 'water'], affordanceHints: ['contains'], groundingIds: ['ground.container', 'ground.containment'],
    }),

    surfaceCard('environment.desert', 'environment', ['desert', 'sand dune', 'arid test bench'], 'dry sandy environment with sun, heat, granular terrain, and wind', {
      classHints: ['environment'], materialHints: ['sand', 'air'], behaviorHints: ['radiation', 'wind'], groundingIds: ['ground.granular-terrain', 'ground.radiation-source'],
    }),
    surfaceCard('environment.forest', 'environment', ['forest', 'woods', 'jungle'], 'dense plant environment with wood, biomass, air, moisture, and growth', {
      classHints: ['environment'], materialHints: ['wood', 'leaf', 'biomass', 'air'], behaviorHints: ['growth', 'combustion'], groundingIds: ['ground.plant-body', 'ground.biological-colony'],
    }),
    surfaceCard('environment.ocean', 'environment', ['ocean', 'sea', 'wave tank'], 'large water environment with waves, currents, buoyancy, and pressure', {
      classHints: ['environment'], materialHints: ['water', 'air'], behaviorHints: ['wave_motion', 'fluid_flow'], groundingIds: ['ground.fluid-domain'],
    }),
    surfaceCard('environment.river', 'environment', ['river', 'stream', 'creek'], 'flowing water channel carrying sediment through terrain', {
      classHints: ['fluid_channel'], materialHints: ['water', 'soil', 'rock', 'sand'], behaviorHints: ['fluid_flow', 'erosion'], groundingIds: ['ground.fluid-channel'],
    }),
    surfaceCard('environment.mountain', 'environment', ['mountain', 'slope', 'cliff'], 'steep terrain with rock, gravity, erosion, and weather exposure', {
      classHints: ['terrain'], materialHints: ['rock', 'soil', 'ice'], behaviorHints: ['gravity', 'erosion'], groundingIds: ['ground.granular-terrain'],
    }),
    surfaceCard('environment.city', 'environment', ['city', 'street grid', 'intersection'], 'built network of roads, queues, buildings, signals, and moving agents', {
      classHints: ['urban_network'], shapeHints: ['graph_network'], materialHints: ['concrete', 'metal', 'glass'],
      behaviorHints: ['traffic_flow', 'queueing'], groundingIds: ['ground.network-system'],
    }),
    surfaceCard('environment.factory', 'environment', ['factory', 'workshop', 'machine room'], 'machine environment with conveyors, motors, power, sensors, and control loops', {
      classHints: ['machine_environment'], materialHints: ['metal', 'concrete'], behaviorHints: ['control_loop', 'energy_flow'], groundingIds: ['ground.machine-line'],
    }),
    surfaceCard('environment.kitchen', 'environment', ['kitchen', 'countertop'], 'domestic workspace with heat, water, containers, appliances, and food materials', {
      classHints: ['workspace'], materialHints: ['water', 'metal', 'biomass'], behaviorHints: ['heat_exchange', 'fluid_flow'], groundingIds: ['ground.thermal-fluid-machine'],
    }),
    surfaceCard('environment.space', 'environment', ['space', 'orbit', 'moon surface'], 'low atmosphere environment with gravity wells, radiation, and orbital motion', {
      classHints: ['space_environment'], materialHints: ['rock'], behaviorHints: ['orbital_motion', 'radiation'], groundingIds: ['ground.celestial-body'],
    }),
    surfaceCard('environment.lab', 'environment', ['laboratory', 'lab bench', 'test bench'], 'instrumented scene with source, sample, sensor, controller, and readouts', {
      classHints: ['instrumented_environment'], materialHints: ['glass', 'metal'], behaviorHints: ['measurement'], groundingIds: ['ground.instrumented-bench'],
    }),
    surfaceCard('environment.tornado', 'environment', ['tornado', 'vortex storm', 'funnel cloud'], 'rotating atmospheric vortex with pressure gradient, debris, wind shear, and ground contact', {
      classHints: ['weather_vortex'], shapeHints: ['vortex_column'], materialHints: ['air', 'water'], behaviorHints: ['rotation', 'pressure_drop', 'debris_flow'], groundingIds: ['ground.weather-vortex'],
    }),
    surfaceCard('environment.hurricane', 'environment', ['hurricane', 'cyclone', 'typhoon'], 'large rotating storm system with ocean heat, wind field, rain bands, and pressure eye', {
      classHints: ['weather_system'], shapeHints: ['spiral_field'], materialHints: ['air', 'water'], behaviorHints: ['rotation', 'rainfall', 'pressure_drop'], groundingIds: ['ground.weather-vortex', 'ground.fluid-domain'],
    }),
    surfaceCard('environment.rainstorm', 'environment', ['rainstorm', 'rain', 'downpour'], 'falling water droplets through air with runoff, splash, and terrain coupling', {
      classHints: ['weather_system'], shapeHints: ['particle_field'], materialHints: ['water', 'air'], behaviorHints: ['falling', 'fluid_flow'], groundingIds: ['ground.fluid-domain', 'ground.erosion-event'],
    }),
    surfaceCard('environment.lightning', 'environment', ['lightning', 'electric storm', 'bolt'], 'branching electrical discharge through air with heat, plasma, light, and shock', {
      classHints: ['electrical_discharge'], shapeHints: ['branching_arc'], materialHints: ['air', 'fire-plasma'], behaviorHints: ['charge_flow', 'heat_exchange'], groundingIds: ['ground.electrical-discharge'],
    }),
    surfaceCard('environment.glacier', 'environment', ['glacier', 'ice sheet', 'iceberg'], 'slow moving ice mass with gravity creep, fracture, meltwater, and terrain erosion', {
      classHints: ['terrain'], shapeHints: ['ice_mass'], materialHints: ['ice', 'water', 'rock'], behaviorHints: ['flowing', 'phase_change', 'erosion'], groundingIds: ['ground.ice-mass', 'ground.erosion-event'],
    }),
    surfaceCard('environment.avalanche', 'environment', ['avalanche', 'landslide', 'rockslide'], 'granular mass failure flowing downhill with gravity, collision, entrainment, and deposition', {
      classHints: ['granular_flow'], shapeHints: ['flowing_mass'], materialHints: ['snow', 'rock', 'soil'], behaviorHints: ['falling', 'flowing', 'collision'], groundingIds: ['ground.granular-flow', 'ground.collision-event'],
    }),
    surfaceCard('environment.volcano', 'environment', ['volcano', 'eruption', 'lava vent'], 'geologic heat source ejecting lava, ash, gas, pressure, and granular debris', {
      classHints: ['geologic_source'], shapeHints: ['cone_vent'], materialHints: ['rock', 'fire-plasma', 'smoke'], behaviorHints: ['pressure_release', 'heat_exchange', 'flowing'], groundingIds: ['ground.volcanic-system'],
    }),
    surfaceCard('environment.cave', 'environment', ['cave', 'cavern', 'tunnel'], 'enclosed rock void with boundary surfaces, air, dripping water, and acoustic reflection', {
      classHints: ['enclosure'], shapeHints: ['hollow_boundary'], materialHints: ['rock', 'air', 'water'], behaviorHints: ['containment', 'echo'], groundingIds: ['ground.container', 'ground.wave-event'],
    }),
    surfaceCard('environment.farm', 'environment', ['farm', 'field', 'crop field'], 'managed plant environment with soil, irrigation, sunlight, growth, and harvest flow', {
      classHints: ['managed_ecosystem'], shapeHints: ['field_rows'], materialHints: ['soil', 'water', 'leaf', 'biomass'], behaviorHints: ['growth', 'fluid_flow'], groundingIds: ['ground.plant-body', 'ground.fluid-channel'],
    }),
    surfaceCard('environment.greenhouse', 'environment', ['greenhouse', 'glass house'], 'enclosed plant system with transparent glass, heat trapping, irrigation, and growth', {
      classHints: ['managed_ecosystem', 'enclosure'], shapeHints: ['transparent_shell'], materialHints: ['glass', 'air', 'water', 'leaf'], behaviorHints: ['heat_exchange', 'growth'], groundingIds: ['ground.optical-element', 'ground.plant-body', 'ground.thermal-machine'],
    }),
    surfaceCard('environment.warehouse', 'environment', ['warehouse', 'distribution center'], 'storage and logistics environment with queues, conveyors, inventory, workers, and vehicles', {
      classHints: ['operations_network'], shapeHints: ['graph_network'], materialHints: ['concrete', 'metal'], behaviorHints: ['queueing', 'transport'], groundingIds: ['ground.network-system', 'ground.machine-line'],
    }),
    surfaceCard('environment.hospital', 'environment', ['hospital', 'clinic', 'triage room'], 'service system with patient queues, rooms, staff, sensors, and resource constraints', {
      classHints: ['service_network'], shapeHints: ['graph_network'], materialHints: ['concrete', 'silicon'], behaviorHints: ['queueing', 'measurement'], groundingIds: ['ground.network-system', 'ground.instrumented-bench'],
    }),

    surfaceCard('artifact.bridge', 'artifact', ['bridge', 'suspension bridge', 'beam bridge'], 'load-bearing structure spanning gap with supports, tension, compression, wind, and vibration', {
      classHints: ['structure'], shapeHints: ['span_structure'], partHints: ['deck', 'support', 'cable', 'pier'], materialHints: ['metal', 'concrete'], behaviorHints: ['load_transfer', 'vibration'], groundingIds: ['ground.structural-span', 'ground.wave-event'],
    }),
    surfaceCard('artifact.dam', 'artifact', ['dam', 'levee', 'spillway'], 'barrier controlling water head, pressure, overflow, erosion, and structural load', {
      classHints: ['hydraulic_structure'], shapeHints: ['barrier'], partHints: ['wall', 'spillway', 'reservoir'], materialHints: ['concrete', 'water', 'rock'], behaviorHints: ['pressure', 'fluid_flow'], groundingIds: ['ground.fluid-vessel', 'ground.structural-span'],
    }),
    surfaceCard('artifact.elevator', 'artifact', ['elevator', 'lift car'], 'vertical transport apparatus with car, cable, counterweight, motor, guide rails, and queue', {
      classHints: ['transport_machine'], shapeHints: ['guided_car'], partHints: ['car', 'cable', 'motor', 'rail'], materialHints: ['metal', 'copper'], behaviorHints: ['lifting', 'queueing'], groundingIds: ['ground.lifting-machine', 'ground.network-system'],
    }),
    surfaceCard('artifact.escalator', 'artifact', ['escalator', 'moving stairs'], 'looping stair conveyor carrying bodies with motor, steps, handrail, and contact friction', {
      classHints: ['transport_machine'], shapeHints: ['belt_loop'], partHints: ['steps', 'motor', 'handrail'], materialHints: ['metal', 'rubber'], behaviorHints: ['moves_objects'], groundingIds: ['ground.conveyor', 'ground.lifting-machine'],
    }),
    surfaceCard('artifact.door', 'artifact', ['door', 'gate', 'hatch'], 'rotating or sliding boundary with hinge, latch, opening, containment, and collision', {
      classHints: ['moving_boundary'], shapeHints: ['panel'], partHints: ['hinge', 'panel', 'latch'], materialHints: ['wood', 'metal', 'glass'], behaviorHints: ['rotation', 'containment'], groundingIds: ['ground.mechanical-joint', 'ground.containment'],
    }),
    surfaceCard('artifact.rocket', 'artifact', ['rocket', 'missile', 'launch vehicle'], 'propelled body with thrust, fuel, exhaust plume, drag, and guidance', {
      classHints: ['flying_vehicle'], shapeHints: ['streamlined_body'], partHints: ['engine', 'fuel tank', 'body'], materialHints: ['metal', 'fuel'], behaviorHints: ['thrust', 'combustion', 'fluid_drag'], groundingIds: ['ground.rigid-machine', 'ground.combustion-event', 'ground.winged-body'],
    }),
    surfaceCard('artifact.satellite', 'artifact', ['satellite', 'spacecraft'], 'orbital machine with solar panels, antenna, attitude control, radiation, and gravity path', {
      classHints: ['space_machine'], shapeHints: ['rigid_body'], partHints: ['panel', 'antenna', 'body'], materialHints: ['metal', 'silicon', 'glass'], behaviorHints: ['orbital_motion', 'radiation_to_energy'], groundingIds: ['ground.celestial-body', 'ground.electrical-machine'],
    }),
    surfaceCard('artifact.wind-turbine', 'artifact', ['wind turbine', 'turbine tower'], 'rotating blades converting air flow to shaft torque and electrical output', {
      classHints: ['energy_machine'], shapeHints: ['rotor'], partHints: ['blade', 'hub', 'tower', 'generator'], materialHints: ['metal', 'air'], behaviorHints: ['rotation', 'fluid_drag'], groundingIds: ['ground.rotating-apparatus', 'ground.electrical-machine'],
    }),
    surfaceCard('artifact.water-wheel', 'artifact', ['water wheel', 'mill wheel'], 'rotating wheel driven by flowing water with paddles, axle, torque, and load', {
      classHints: ['energy_machine', 'rotating_apparatus'], shapeHints: ['circular_rim'], partHints: ['paddle', 'rim', 'axle'], materialHints: ['wood', 'metal', 'water'], behaviorHints: ['rotation', 'fluid_flow'], groundingIds: ['ground.rotating-apparatus', 'ground.fluid-channel'],
    }),
    surfaceCard('artifact.microscope', 'artifact', ['microscope', 'optical microscope'], 'instrument with lenses, light source, sample stage, focus control, and sensor/readout', {
      classHints: ['instrument'], shapeHints: ['optical_column'], partHints: ['lens', 'stage', 'light', 'sensor'], materialHints: ['glass', 'metal'], behaviorHints: ['focuses_light', 'measurement'], groundingIds: ['ground.optical-element', 'ground.instrumented-bench'],
    }),
    surfaceCard('artifact.telescope', 'artifact', ['telescope', 'observatory scope'], 'long optical instrument collecting light through mirrors or lenses onto a sensor', {
      classHints: ['instrument'], shapeHints: ['optical_tube'], partHints: ['lens', 'mirror', 'sensor'], materialHints: ['glass', 'metal'], behaviorHints: ['focuses_light'], groundingIds: ['ground.optical-element', 'ground.instrumented-bench'],
    }),
    surfaceCard('artifact.antenna', 'artifact', ['antenna', 'radio dish', 'receiver'], 'electromagnetic receiver or emitter with field coupling, signal, delay, and noise', {
      classHints: ['electrical_network'], shapeHints: ['dish_or_wire'], partHints: ['receiver', 'feed', 'signal path'], materialHints: ['metal', 'copper'], behaviorHints: ['current_flow', 'signal_delay'], groundingIds: ['ground.electrical-network'],
    }),
    surfaceCard('artifact.musical-instrument', 'artifact', ['guitar', 'violin', 'drum', 'musical instrument'], 'acoustic object with vibrating body, strings or membrane, resonance, and damping', {
      classHints: ['acoustic_device'], shapeHints: ['resonant_body'], partHints: ['string', 'membrane', 'body'], materialHints: ['wood', 'metal', 'fabric'], behaviorHints: ['vibration', 'resonance'], groundingIds: ['ground.wave-event'],
    }),
    surfaceCard('artifact.book', 'artifact', ['book', 'stack of pages', 'paper'], 'layered flexible sheets with bending, friction, contact, and page turning', {
      classHints: ['layered_material'], shapeHints: ['sheet_stack'], partHints: ['pages', 'spine', 'cover'], materialHints: ['fabric', 'wood'], behaviorHints: ['bending', 'friction'], groundingIds: ['ground.membrane-structure', 'ground.flexible-cable'],
    }),

    surfaceCard('entity.cell', 'entity', ['cell', 'living cell', 'microbe'], 'microscopic biological membrane volume with diffusion, chemistry, growth, and division', {
      classHints: ['cell'], shapeHints: ['membrane_volume'], materialHints: ['membrane', 'protein', 'gel'], behaviorHints: ['growth', 'diffusion'], groundingIds: ['ground.biological-colony', 'ground.pressure-membrane'],
    }),
    surfaceCard('entity.neuron', 'entity', ['neuron', 'nerve cell'], 'branching excitable cell with signal propagation, delay, thresholds, and chemical exchange', {
      classHints: ['cell'], shapeHints: ['branching_network'], materialHints: ['membrane', 'protein'], behaviorHints: ['signal_delay', 'threshold'], groundingIds: ['ground.branching-network', 'ground.electrical-network'],
    }),
    surfaceCard('entity.heart', 'entity', ['heart', 'beating heart'], 'pulsing biological pump with chambers, valves, pressure, fluid flow, and rhythmic contraction', {
      classHints: ['biological_pump'], shapeHints: ['chambered_membrane'], partHints: ['chamber', 'valve', 'vessel'], materialHints: ['soft_tissue', 'water'], behaviorHints: ['pumping', 'oscillation'], groundingIds: ['ground.pressure-membrane', 'ground.fluid-network'],
    }),
    surfaceCard('entity.lung', 'entity', ['lung', 'air sac', 'breathing system'], 'branching elastic air exchange system with pressure, diffusion, and rhythmic volume change', {
      classHints: ['biological_pump'], shapeHints: ['branching_network'], materialHints: ['membrane', 'air'], behaviorHints: ['pressure', 'diffusion', 'oscillation'], groundingIds: ['ground.branching-network', 'ground.pressure-membrane'],
    }),
    surfaceCard('entity.blood-vessel', 'entity', ['blood vessel', 'vein', 'artery'], 'elastic fluid channel with pressure, flow, branching, and soft boundary', {
      classHints: ['fluid_channel'], shapeHints: ['tube_network'], materialHints: ['membrane', 'water'], behaviorHints: ['fluid_flow', 'pressure'], groundingIds: ['ground.fluid-network', 'ground.pressure-membrane'],
    }),

    surfaceCard('celestial.sun', 'environment', ['sun', 'star'], 'radiating plasma body with heat, light, gravity, and energy flux', {
      classHints: ['celestial_body'], shapeHints: ['sphere'], materialHints: ['fire-plasma'], behaviorHints: ['radiation', 'gravity'], groundingIds: ['ground.celestial-body', 'ground.radiation-source'],
    }),
    surfaceCard('celestial.planet', 'environment', ['planet', 'moon', 'world'], 'large rocky or fluid body with gravity, terrain, atmosphere, and orbital path', {
      classHints: ['celestial_body'], shapeHints: ['sphere'], materialHints: ['rock', 'air', 'water'], behaviorHints: ['gravity', 'orbital_motion'], groundingIds: ['ground.celestial-body', 'ground.granular-terrain'],
    }),
    surfaceCard('celestial.asteroid', 'environment', ['asteroid', 'meteor', 'comet'], 'small celestial rock or ice body with impact, orbit, fragmentation, and thermal effects', {
      classHints: ['celestial_body'], shapeHints: ['irregular_body'], materialHints: ['rock', 'ice'], behaviorHints: ['orbital_motion', 'collision'], groundingIds: ['ground.celestial-body', 'ground.collision-event'],
    }),

    surfaceCard('event.collision', 'event', ['collision', 'crash', 'crashing', 'impact', 'hit', 'smash'], 'contact event transferring momentum through impulse, friction, restitution, and damping', {
      eventHints: ['collision'], relationHints: ['collides_with'], groundingIds: ['ground.collision-event'],
    }),
    surfaceCard('event.roll', 'event', ['rolling', 'rolls', 'roll'], 'wheel or sphere motion with contact, friction, angular momentum, and translation', {
      eventHints: ['rolling'], groundingIds: ['ground.rolling-motion'],
    }),
    surfaceCard('event.spin', 'event', ['spinning', 'rotating', 'rotation', 'turning'], 'angular motion around an axis with inertia, torque, damping, and constraint', {
      eventHints: ['rotation'], groundingIds: ['ground.rotating-apparatus'],
    }),
    surfaceCard('event.flow', 'event', ['flowing', 'flow', 'pouring', 'streaming'], 'matter moves through channel or domain under pressure and advection', {
      eventHints: ['flow'], groundingIds: ['ground.fluid-domain'],
    }),
    surfaceCard('event.heat', 'event', ['heating', 'cooling', 'melting', 'boiling'], 'thermal exchange, diffusion, phase threshold, and heat loss', {
      eventHints: ['heat_exchange'], groundingIds: ['ground.thermal-machine'],
    }),
    surfaceCard('event.burn', 'event', ['burning', 'fire', 'combustion', 'ignition'], 'fuel, oxygen, heat, flame, smoke, and conservation accounting', {
      eventHints: ['combustion'], groundingIds: ['ground.combustion-event'],
    }),
    surfaceCard('event.focus-light', 'event', ['focusing light', 'bending light', 'refraction', 'reflection'], 'optical event moving rays through surfaces and media', {
      eventHints: ['optics'], groundingIds: ['ground.optical-element'],
    }),
    surfaceCard('event.magnetic-force', 'event', ['magnetic attraction', 'magnetic repulsion', 'magnetic torque'], 'field force event coupling magnetic sources and moving bodies', {
      eventHints: ['magnetic_force'], groundingIds: ['ground.magnetic-source'],
    }),
    surfaceCard('event.growth', 'event', ['growing', 'growth', 'spreading colony'], 'biological or network expansion over substrate with diffusion and limits', {
      eventHints: ['growth'], groundingIds: ['ground.biological-colony'],
    }),
    surfaceCard('event.erosion', 'event', ['erosion', 'weathering', 'sediment transport'], 'flow removes and transports granular material through terrain', {
      eventHints: ['erosion'], groundingIds: ['ground.erosion-event'],
    }),
    surfaceCard('event.queue', 'event', ['queue', 'waiting line', 'backlog', 'traffic jam'], 'arrival and service process with inventory, delay, throughput, and loss', {
      eventHints: ['queueing'], groundingIds: ['ground.network-system'],
    }),
    surfaceCard('event.wave', 'event', ['wave', 'sound wave', 'vibration', 'resonance'], 'oscillatory disturbance with amplitude, frequency, damping, and propagation', {
      eventHints: ['wave'], groundingIds: ['ground.wave-event'],
    }),
    surfaceCard('event.explosion', 'event', ['explosion', 'blast', 'burst'], 'rapid pressure and heat release with shock, impulse, fragments, and expansion', {
      eventHints: ['blast'], groundingIds: ['ground.pressure-event', 'ground.collision-event'],
    }),

    surfaceCard('relation.inside', 'relation', ['inside', 'in', 'within', 'contained in'], 'containment relation between object and enclosure or apparatus', {
      relationHints: ['inside'], groundingIds: ['ground.containment'],
    }),
    surfaceCard('relation.attached', 'relation', ['attached to', 'connected to', 'hinged to', 'mounted on'], 'constraint relation between parts, joints, supports, or ports', {
      relationHints: ['attached_to'], groundingIds: ['ground.mechanical-joint'],
    }),
    surfaceCard('relation.through', 'relation', ['through', 'across', 'along'], 'path relation moving flow, light, force, or agents through a medium or channel', {
      relationHints: ['through'], groundingIds: ['ground.path-coupling'],
    }),
    surfaceCard('relation.around', 'relation', ['around', 'orbiting', 'circling'], 'curved path relation with center, radius, rotation, or containment', {
      relationHints: ['around'], groundingIds: ['ground.orbital-motion'],
    }),
    surfaceCard('relation.pushes', 'relation', ['pushes', 'pulls', 'drives', 'powers'], 'force or energy relation where source drives target motion', {
      relationHints: ['drives'], groundingIds: ['ground.force-coupling'],
    }),
    ...UNIVERSE_SURFACE_CARDS,
  ]);

  const GROUNDING_BASIS_CARDS = Object.freeze([
    basisCard('ground.small-mammal-body', 'class', 'small mammal soft body with limb contact gait and fur', {
      parts: ['torso capsule', 'head ellipsoid', 'limb contact points', 'soft collision shell'],
      materials: ['biomass', 'gel', 'membrane'], physics: ['soft-body', 'collision', 'friction'],
      math: ['particle-set', 'constraint', 'time-step'], primitives: ['soft-body', 'collision', 'friction', 'biomass', 'gel', 'membrane'],
      ports: ['contact_feet', 'body_collision', 'gait_force'],
    }),
    basisCard('ground.large-mammal-body', 'class', 'large articulated soft body with higher mass and gait force', {
      parts: ['torso capsule', 'limb links', 'feet contacts', 'collision shell'],
      materials: ['biomass', 'membrane'], physics: ['soft-body', 'rigid-body', 'collision', 'friction'],
      math: ['particle-set', 'matrix-tensor', 'constraint'], primitives: ['soft-body', 'rigid-body', 'collision', 'friction', 'biomass', 'membrane'],
      ports: ['contact_feet', 'body_collision', 'gait_force'],
    }),
    basisCard('ground.articulated-body', 'class', 'articulated biological body approximated as soft capsules and contact points', {
      parts: ['capsule chain', 'joint constraints', 'contact points'],
      materials: ['biomass', 'gel', 'membrane'], physics: ['soft-body', 'collision', 'friction', 'elasticity'],
      math: ['particle-set', 'constraint', 'oscillator'], primitives: ['soft-body', 'collision', 'friction', 'elasticity', 'biomass', 'gel', 'membrane'],
      ports: ['contact_points', 'body_collision', 'actuation'],
    }),
    basisCard('ground.winged-body', 'class', 'winged moving body with lift, drag, soft or rigid shell', {
      parts: ['body capsule', 'wing surfaces', 'tail surface'],
      materials: ['biomass', 'air'], physics: ['rigid-body', 'fluid-advection', 'pressure', 'collision'],
      math: ['vector-field', 'surface-boundary', 'time-step'], primitives: ['rigid-body', 'fluid-advection', 'pressure', 'collision', 'air', 'biomass'],
      ports: ['lift', 'drag', 'thrust'],
    }),
    basisCard('ground.swimmer-body', 'class', 'streamlined body interacting with fluid through buoyancy and drag', {
      parts: ['streamlined capsule', 'fin surfaces', 'fluid boundary'],
      materials: ['biomass', 'water'], physics: ['fluid-advection', 'buoyancy', 'collision', 'friction'],
      math: ['vector-field', 'surface-boundary'], primitives: ['fluid-advection', 'buoyancy', 'collision', 'friction', 'water', 'biomass'],
      ports: ['fluid_drag', 'buoyancy', 'thrust'],
    }),
    basisCard('ground.segmented-body', 'class', 'segmented tiny body with many contact legs and swarm behavior', {
      parts: ['segments', 'leg contacts', 'collision shell'],
      materials: ['biomass'], physics: ['rigid-body', 'collision', 'friction', 'growth-decay'],
      math: ['particle-set', 'graph-network'], primitives: ['rigid-body', 'collision', 'friction', 'growth-decay', 'biomass'],
      ports: ['contact_legs', 'swarm'],
    }),
    basisCard('ground.plant-body', 'class', 'rooted plant body with branching structure, biomass, moisture, and growth', {
      parts: ['root', 'stem', 'branch', 'leaf surfaces'],
      materials: ['wood', 'leaf', 'biomass', 'soil'], physics: ['growth-decay', 'diffusion', 'elasticity'],
      math: ['graph-network', 'scalar-field'], primitives: ['wood', 'leaf', 'biomass', 'soil', 'growth-decay', 'diffusion', 'elasticity'],
      ports: ['light_in', 'water_in', 'biomass_growth'],
    }),
    basisCard('ground.branching-network', 'class', 'branching graph network embedded in matter or terrain', {
      parts: ['branch nodes', 'branch edges', 'growth tips'],
      materials: ['biomass', 'soil'], physics: ['growth-decay', 'diffusion', 'friction'],
      math: ['graph-network', 'particle-set'], primitives: ['graph-network', 'growth-decay', 'diffusion', 'biomass', 'soil'],
      ports: ['growth_front', 'flow_exchange'],
    }),
    basisCard('ground.biological-colony', 'class', 'population or fungal colony over substrate with diffusion and growth', {
      parts: ['population field', 'nutrient field', 'boundary'],
      materials: ['bacteria', 'mycelium', 'protein', 'gel'], physics: ['growth-decay', 'diffusion', 'chemical-reaction'],
      math: ['scalar-field', 'graph-network'], primitives: ['bacteria', 'mycelium', 'protein', 'gel', 'growth-decay', 'diffusion', 'chemical-reaction'],
      ports: ['nutrient_in', 'population_out'],
    }),
    basisCard('ground.rotating-apparatus', 'component', 'rotating apparatus built from circular body, axle, support, track, and inertia', {
      parts: ['rim', 'hub', 'spokes', 'axle', 'support frame', 'contact track'],
      materials: ['metal', 'rubber', 'plastic'], physics: ['rigid-body', 'collision', 'friction', 'elasticity'],
      math: ['vector', 'matrix-tensor', 'constraint', 'oscillator'], primitives: ['wheel', 'gear', 'metal', 'rubber', 'rigid-body', 'collision', 'friction', 'conservation-ledger', 'energy-ledger'],
      ports: ['torque_in', 'rotation_out', 'contact_track'],
    }),
    basisCard('ground.wheeled-vehicle', 'component', 'vehicle with chassis, wheels, rolling friction, and collision shell', {
      parts: ['chassis', 'wheels', 'axles', 'contact patches'],
      materials: ['metal', 'rubber', 'glass'], physics: ['rigid-body', 'collision', 'friction'],
      math: ['matrix-tensor', 'constraint'], primitives: ['wheel', 'metal', 'rubber', 'glass', 'rigid-body', 'collision', 'friction', 'energy-ledger'],
      ports: ['drive_force', 'rolling_contact', 'body_collision'],
    }),
    basisCard('ground.constrained-vehicle', 'component', 'vehicle constrained to track or rail with coupled rigid bodies', {
      parts: ['body cars', 'track constraint', 'wheel pairs', 'couplers'],
      materials: ['metal'], physics: ['rigid-body', 'collision', 'friction', 'constraint'],
      math: ['curve-path', 'constraint'], primitives: ['wheel', 'metal', 'rigid-body', 'collision', 'friction', 'constraint', 'curve-path'],
      ports: ['track_path', 'drive_force'],
    }),
    basisCard('ground.rigid-machine', 'component', 'rigid machine frame with motors, links, forces, and energy accounting', {
      parts: ['frame', 'motor', 'load path', 'sensor'],
      materials: ['metal', 'copper', 'plastic'], physics: ['rigid-body', 'collision', 'friction', 'electromagnetism'],
      math: ['matrix-tensor', 'conservation-ledger'], primitives: ['metal', 'copper', 'rigid-body', 'collision', 'friction', 'electromagnetism', 'energy-ledger'],
      ports: ['energy_in', 'force_out', 'sensor_out'],
    }),
    basisCard('ground.articulated-machine', 'component', 'linked rigid machine with joints, motors, and controlled motion', {
      parts: ['rigid links', 'revolute joints', 'actuators', 'end effector'],
      materials: ['metal', 'copper'], physics: ['rigid-body', 'collision', 'friction', 'electromagnetism'],
      math: ['constraint', 'matrix-tensor'], primitives: ['rigid-body', 'collision', 'friction', 'electromagnetism', 'metal', 'copper', 'controller', 'sensor'],
      ports: ['joint_force', 'control_signal'],
    }),
    basisCard('ground.gear-train', 'component', 'interlocked rotating gears exchanging torque through constraints', {
      parts: ['gear', 'tooth contact', 'axle', 'housing'],
      materials: ['metal', 'plastic'], physics: ['rigid-body', 'collision', 'friction'],
      math: ['constraint', 'oscillator'], primitives: ['gear', 'wheel', 'metal', 'plastic', 'rigid-body', 'collision', 'friction'],
      ports: ['torque_in', 'torque_out'],
    }),
    basisCard('ground.pendulum', 'component', 'mass constrained by pivot with gravity, angular motion, and damping', {
      parts: ['pivot', 'rod', 'mass bob'],
      materials: ['metal', 'wood'], physics: ['gravity', 'rigid-body', 'friction'],
      math: ['oscillator', 'constraint'], primitives: ['gravity', 'rigid-body', 'friction', 'oscillator', 'constraint', 'metal', 'wood'],
      ports: ['pivot', 'angle'],
    }),
    basisCard('ground.conveyor', 'component', 'moving belt and rollers transporting objects by friction', {
      parts: ['belt loop', 'rollers', 'motor', 'load surface'],
      materials: ['rubber', 'metal'], physics: ['rigid-body', 'friction', 'collision', 'electromagnetism'],
      math: ['curve-path', 'constraint'], primitives: ['rubber', 'metal', 'motor', 'wheel', 'friction', 'collision', 'rigid-body'],
      ports: ['load_in', 'load_out', 'drive'],
    }),
    basisCard('ground.lifting-machine', 'component', 'boom, pulley, cable, load, and tensile constraint system', {
      parts: ['boom', 'pulley', 'cable', 'load'],
      materials: ['metal', 'fabric'], physics: ['rigid-body', 'gravity', 'friction', 'elasticity'],
      math: ['constraint', 'curve-path'], primitives: ['metal', 'fabric', 'rigid-body', 'gravity', 'friction', 'elasticity', 'constraint'],
      ports: ['load', 'tension'],
    }),
    basisCard('ground.flexible-cable', 'component', 'flexible tensile curve with tension, sag, and contact', {
      parts: ['curve body', 'anchors', 'contact points'],
      materials: ['fabric', 'rubber'], physics: ['soft-body', 'elasticity', 'friction'],
      math: ['curve-path', 'constraint'], primitives: ['fabric', 'rubber', 'soft-body', 'elasticity', 'friction', 'curve-path'],
      ports: ['anchor_a', 'anchor_b', 'tension'],
    }),
    basisCard('ground.container', 'component', 'container with boundary surface, contents, collision, and mass ledger', {
      parts: ['wall boundary', 'interior volume', 'opening'],
      materials: ['metal', 'plastic', 'glass'], physics: ['collision', 'pressure', 'friction'],
      math: ['surface-boundary', 'source-sink'], primitives: ['collision', 'pressure', 'surface-boundary', 'metal', 'plastic', 'glass'],
      ports: ['contents', 'opening'],
    }),
    basisCard('ground.containment', 'relation', 'containment relation reduced to boundary, interior volume, and contact constraints', {
      parts: ['inner object', 'container boundary', 'contact manifold'],
      materials: [], physics: ['collision', 'friction'], math: ['surface-boundary', 'constraint'],
      primitives: ['collision', 'friction', 'surface-boundary', 'constraint'],
      ports: ['inside', 'boundary'],
    }),
    basisCard('ground.fluid-domain', 'component', 'fluid domain with pressure, velocity, advection, buoyancy, and surface boundary', {
      parts: ['fluid volume', 'boundary', 'velocity field'],
      materials: ['water', 'air'], physics: ['pressure', 'fluid-advection', 'buoyancy', 'friction'],
      math: ['vector-field', 'scalar-field', 'surface-boundary'], primitives: ['water', 'air', 'pressure', 'fluid-advection', 'buoyancy', 'friction'],
      ports: ['flow_in', 'flow_out', 'pressure'],
    }),
    basisCard('ground.fluid-channel', 'component', 'channelized flow through terrain or pipe with erosion and pressure', {
      parts: ['channel path', 'fluid', 'bank boundary'],
      materials: ['water', 'soil', 'rock', 'sand'], physics: ['fluid-advection', 'pressure', 'erosion', 'friction'],
      math: ['curve-path', 'grid-heightfield'], primitives: ['water', 'soil', 'rock', 'sand', 'fluid-advection', 'pressure', 'erosion', 'friction', 'river'],
      ports: ['source', 'sink', 'sediment'],
    }),
    basisCard('ground.fluid-network', 'component', 'pipe-valve-pump graph carrying fluid pressure and flow', {
      parts: ['pipe', 'valve', 'pump', 'junctions'],
      materials: ['metal', 'water', 'rubber'], physics: ['pressure', 'fluid-advection', 'friction'],
      math: ['graph-network', 'source-sink'], primitives: ['pipe', 'valve', 'pump', 'water', 'metal', 'pressure', 'fluid-advection', 'friction'],
      ports: ['flow_in', 'flow_out', 'control'],
    }),
    basisCard('ground.fluid-vessel', 'component', 'closed vessel or drum containing fluid with pressure and wall contact', {
      parts: ['wall', 'fluid volume', 'opening'],
      materials: ['metal', 'water', 'air'], physics: ['pressure', 'fluid-advection', 'collision'],
      math: ['surface-boundary', 'scalar-field'], primitives: ['water', 'air', 'metal', 'pressure', 'fluid-advection', 'collision', 'surface-boundary'],
      ports: ['fluid', 'wall'],
    }),
    basisCard('ground.floating-vessel', 'component', 'hull interacting with water by buoyancy, drag, and propulsion', {
      parts: ['hull', 'waterline', 'propulsion'],
      materials: ['metal', 'wood', 'water'], physics: ['buoyancy', 'fluid-advection', 'friction', 'collision'],
      math: ['surface-boundary', 'vector-field'], primitives: ['metal', 'wood', 'water', 'buoyancy', 'fluid-advection', 'friction', 'collision'],
      ports: ['buoyancy', 'drag', 'thrust'],
    }),
    basisCard('ground.thermal-machine', 'component', 'thermal system with heat source, sink, phase change, and loss ledger', {
      parts: ['hot side', 'cold side', 'thermal boundary'],
      materials: ['metal', 'air', 'water'], physics: ['heat-transfer', 'phase-change', 'pressure'],
      math: ['scalar-field', 'conservation-ledger'], primitives: ['heater', 'cooler', 'metal', 'air', 'water', 'heat-transfer', 'phase-change', 'energy-ledger'],
      ports: ['heat_in', 'heat_out'],
    }),
    basisCard('ground.thermal-fluid-machine', 'component', 'machine coupling pump, heater, valve, vessel, and flowing fluid', {
      parts: ['heater', 'pump', 'valve', 'fluid loop', 'sensor'],
      materials: ['metal', 'water', 'copper'], physics: ['pressure', 'fluid-advection', 'heat-transfer'],
      math: ['graph-network', 'conservation-ledger'], primitives: ['heater', 'pump', 'valve', 'pipe', 'sensor', 'water', 'metal', 'pressure', 'fluid-advection', 'heat-transfer'],
      ports: ['energy_in', 'flow_out', 'temperature'],
    }),
    basisCard('ground.optical-element', 'component', 'optical element with transparent surface, ray propagation, refraction, and absorption', {
      parts: ['surface', 'medium', 'ray ports'],
      materials: ['glass'], physics: ['optics', 'radiation', 'heat-transfer'],
      math: ['vector-field', 'sampling', 'surface-boundary'], primitives: ['glass', 'lens', 'prism', 'mirror', 'optics', 'radiation'],
      ports: ['light_in', 'light_out'],
    }),
    basisCard('ground.optical-source', 'component', 'light source with radiance, beam direction, and optical port', {
      parts: ['emitter', 'beam field'],
      materials: ['glass', 'metal'], physics: ['radiation', 'optics', 'heat-transfer'],
      math: ['vector-field', 'source-sink'], primitives: ['sun-lamp', 'light-source', 'radiation', 'optics', 'glass', 'metal'],
      ports: ['light_out', 'heat_out'],
    }),
    basisCard('ground.radiation-source', 'component', 'radiation source for sun, lamp, star, or heat emission', {
      parts: ['emitter', 'radiation field'],
      materials: ['fire-plasma', 'light'], physics: ['radiation', 'heat-transfer'],
      math: ['vector-field', 'source-sink'], primitives: ['radiation', 'sun-lamp', 'light-source', 'heat-transfer', 'energy-ledger'],
      ports: ['radiation_out'],
    }),
    basisCard('ground.magnetic-source', 'component', 'magnetic source with dipole field and force coupling', {
      parts: ['magnetic core', 'field region'],
      materials: ['magnetized-metal', 'copper'], physics: ['magnetism', 'electromagnetism', 'collision'],
      math: ['vector-field', 'curl'], primitives: ['magnet', 'magnetized-metal', 'magnetism', 'electromagnetism', 'copper'],
      ports: ['field_out', 'force_out'],
    }),
    basisCard('ground.electrical-machine', 'component', 'electrical machine or source with conductor, field, load, and heat loss', {
      parts: ['conductor', 'load', 'field path'],
      materials: ['copper', 'silicon', 'metal'], physics: ['electromagnetism', 'heat-transfer'],
      math: ['graph-network', 'conservation-ledger'], primitives: ['copper', 'silicon', 'metal', 'electromagnetism', 'heat-transfer', 'energy-ledger'],
      ports: ['current', 'voltage', 'heat'],
    }),
    basisCard('ground.electrical-network', 'component', 'electrical graph with nodes, traces, signals, current, delay, and heat', {
      parts: ['nodes', 'traces', 'loads', 'sensors'],
      materials: ['copper', 'silicon', 'plastic'], physics: ['electromagnetism', 'heat-transfer'],
      math: ['graph-network', 'delay'], primitives: ['graph-network', 'copper', 'silicon', 'electromagnetism', 'heat-transfer', 'delay-buffer', 'sensor'],
      ports: ['signal_in', 'signal_out', 'heat'],
    }),
    basisCard('ground.energy-storage', 'component', 'stored energy reservoir with charge, discharge, heat, and conservation ledger', {
      parts: ['cell', 'terminal', 'ledger'],
      materials: ['brine', 'copper', 'metal'], physics: ['chemical-reaction', 'electromagnetism', 'heat-transfer'],
      math: ['conservation-ledger'], primitives: ['battery', 'brine', 'copper', 'chemical-reaction', 'electromagnetism', 'energy-ledger'],
      ports: ['energy_in', 'energy_out'],
    }),
    basisCard('ground.granular-terrain', 'component', 'granular or rocky terrain with heightfield, slope, friction, and erosion', {
      parts: ['heightfield', 'grains', 'boundary'],
      materials: ['sand', 'soil', 'rock', 'clay'], physics: ['erosion', 'friction', 'collision', 'gravity'],
      math: ['grid-heightfield', 'gradient'], primitives: ['terrain-patch', 'sand', 'soil', 'rock', 'clay', 'erosion', 'friction', 'collision', 'gravity'],
      ports: ['slope', 'sediment', 'contact'],
    }),
    basisCard('ground.weather-vortex', 'component', 'rotating atmospheric vortex with pressure, advection, particles, and debris contact', {
      parts: ['pressure core', 'spiral velocity field', 'debris particles'],
      materials: ['air', 'water', 'soil'], physics: ['pressure', 'fluid-advection', 'friction', 'collision'],
      math: ['vector-field', 'curl', 'particle-set'], primitives: ['air', 'water', 'soil', 'pressure', 'fluid-advection', 'friction', 'collision', 'wind-field-component'],
      ports: ['inflow', 'rotation', 'debris'],
    }),
    basisCard('ground.electrical-discharge', 'event', 'branching electric discharge through gas with heat, plasma, and shock pressure', {
      parts: ['arc path', 'charge source', 'heated channel'],
      materials: ['air', 'fire-plasma'], physics: ['electromagnetism', 'heat-transfer', 'pressure', 'radiation'],
      math: ['graph-network', 'vector-field'], primitives: ['air', 'fire-plasma', 'electromagnetism', 'heat-transfer', 'pressure', 'radiation', 'plasma-arc'],
      ports: ['charge', 'arc', 'heat'],
    }),
    basisCard('ground.ice-mass', 'component', 'solid ice mass with phase change, gravity creep, fracture, and meltwater flow', {
      parts: ['ice body', 'meltwater path', 'contact bed'],
      materials: ['ice', 'water', 'rock'], physics: ['phase-change', 'gravity', 'friction', 'fluid-advection'],
      math: ['grid-heightfield', 'time-step'], primitives: ['ice', 'water', 'rock', 'phase-change', 'gravity', 'friction', 'fluid-advection'],
      ports: ['meltwater', 'slope', 'contact'],
    }),
    basisCard('ground.granular-flow', 'event', 'granular mass flow downhill with gravity, contact, friction, and deposition', {
      parts: ['moving grains', 'slope field', 'deposit fan'],
      materials: ['sand', 'soil', 'rock'], physics: ['gravity', 'collision', 'friction', 'erosion'],
      math: ['particle-set', 'grid-heightfield'], primitives: ['sand', 'soil', 'rock', 'gravity', 'collision', 'friction', 'erosion', 'terrain-patch'],
      ports: ['slope', 'flow_front'],
    }),
    basisCard('ground.volcanic-system', 'component', 'geologic pressure and heat source with lava flow, ash, and gas plume', {
      parts: ['vent', 'lava flow', 'ash plume', 'rock cone'],
      materials: ['rock', 'fire-plasma', 'smoke'], physics: ['heat-transfer', 'pressure', 'fluid-advection', 'phase-change'],
      math: ['source-sink', 'scalar-field'], primitives: ['rock', 'fire-plasma', 'smoke', 'heat-transfer', 'pressure', 'fluid-advection', 'phase-change', 'plasma-arc'],
      ports: ['heat', 'gas', 'lava_flow'],
    }),
    basisCard('ground.structural-span', 'component', 'load-bearing span with supports, compression, tension, wind, and vibration', {
      parts: ['span', 'support', 'cable', 'load path'],
      materials: ['metal', 'concrete'], physics: ['rigid-body', 'elasticity', 'friction', 'collision'],
      math: ['constraint', 'oscillator', 'matrix-tensor'], primitives: ['metal', 'concrete', 'rigid-body', 'elasticity', 'friction', 'collision', 'constraint', 'oscillator'],
      ports: ['load', 'support', 'vibration'],
    }),
    basisCard('ground.network-system', 'composition', 'network system with nodes, edges, queue service, demand, and delay', {
      parts: ['nodes', 'edges', 'queues', 'sensors'],
      materials: ['silicon', 'metal'], physics: ['queueService'],
      math: ['graph-network', 'queue', 'delay'], primitives: ['graph-network', 'queue', 'queue-server', 'network-link', 'market-demand', 'sensor-array', 'controller', 'data-recorder'],
      ports: ['arrival', 'service', 'throughput'],
    }),
    basisCard('ground.machine-line', 'composition', 'machine line of motors, conveyors, sensors, controllers, and ledgered energy', {
      parts: ['machine nodes', 'conveyor', 'sensors', 'controller'],
      materials: ['metal', 'rubber', 'copper'], physics: ['rigid-body', 'electromagnetism', 'friction'],
      math: ['graph-network', 'conservation-ledger'], primitives: ['motor', 'controller', 'sensor', 'wheel', 'metal', 'rubber', 'copper', 'energy-ledger'],
      ports: ['energy', 'material_flow', 'control'],
    }),
    basisCard('ground.instrumented-bench', 'scene', 'instrumented test bench with source, sample, sensor, controller, and readout ledger', {
      parts: ['source', 'sample', 'sensor', 'controller', 'data recorder'],
      materials: ['glass', 'metal'], physics: ['radiation', 'collision', 'heat-transfer'],
      math: ['sampling', 'conservation-ledger'], primitives: ['sensor', 'controller', 'data-recorder', 'source-sink', 'energy-ledger'],
      ports: ['source', 'sample', 'measurement'],
    }),
    basisCard('ground.celestial-body', 'scene', 'celestial or orbital body with gravity, radiation, rock, and motion path', {
      parts: ['body', 'orbit path', 'radiation field'],
      materials: ['rock', 'fire-plasma'], physics: ['gravity', 'radiation', 'rigid-body'],
      math: ['curve-path', 'vector-field'], primitives: ['gravity', 'radiation', 'rigid-body', 'rock', 'curve-path', 'energy-ledger'],
      ports: ['gravity_well', 'radiation'],
    }),
    basisCard('ground.collision-event', 'event', 'contact event reduced to manifold, impulse, friction, restitution, damping, and energy ledger', {
      parts: ['contact manifold', 'normal impulse', 'tangent friction', 'energy ledger'],
      materials: [], physics: ['collision', 'friction', 'rigid-body', 'soft-body'],
      math: ['surface-boundary', 'constraint', 'time-step'], primitives: ['collision', 'friction', 'rigid-body', 'soft-body', 'surface-boundary', 'constraint', 'energy-ledger', 'conservation-ledger'],
      ports: ['body_a', 'body_b', 'impulse'],
    }),
    basisCard('ground.rolling-motion', 'event', 'rolling event with circular body, contact patch, angular velocity, and friction', {
      parts: ['contact patch', 'angular velocity', 'translation'],
      materials: ['rubber', 'metal'], physics: ['rigid-body', 'friction', 'collision'],
      math: ['vector', 'matrix-tensor'], primitives: ['wheel', 'rigid-body', 'friction', 'collision', 'rubber', 'metal'],
      ports: ['ground_contact', 'motion'],
    }),
    basisCard('ground.rolling-body', 'component', 'round body with spin, bounce, contact patch, inertia, and friction', {
      parts: ['sphere body', 'contact patch', 'spin axis'],
      materials: ['rubber', 'metal', 'glass'], physics: ['rigid-body', 'collision', 'friction', 'elasticity'],
      math: ['vector', 'matrix-tensor', 'time-step'], primitives: ['rigid-body', 'collision', 'friction', 'elasticity', 'rubber', 'metal', 'glass'],
      ports: ['spin', 'bounce', 'contact'],
    }),
    basisCard('ground.combustion-event', 'event', 'combustion event with fuel, oxygen, flame, smoke, heat, and mass-energy ledger', {
      parts: ['fuel bed', 'flame front', 'smoke plume'],
      materials: ['wood', 'fuel', 'air', 'smoke', 'fire-plasma'], physics: ['combustion', 'heat-transfer', 'fluid-advection'],
      math: ['scalar-field', 'conservation-ledger'], primitives: ['wood', 'fuel', 'air', 'smoke', 'fire-plasma', 'combustion', 'heat-transfer', 'fluid-advection', 'energy-ledger'],
      ports: ['fuel', 'air', 'heat'],
    }),
    basisCard('ground.erosion-event', 'event', 'erosion event with water flow, sediment, slope, and changing terrain heightfield', {
      parts: ['flow path', 'sediment field', 'terrain heightfield'],
      materials: ['water', 'sand', 'soil', 'rock'], physics: ['fluid-advection', 'erosion', 'gravity'],
      math: ['grid-heightfield', 'vector-field'], primitives: ['water', 'sand', 'soil', 'rock', 'fluid-advection', 'erosion', 'gravity', 'terrain-patch'],
      ports: ['flow', 'sediment'],
    }),
    basisCard('ground.wave-event', 'event', 'wave or vibration event with oscillator, pressure, propagation, and damping', {
      parts: ['source', 'medium', 'wavefront'],
      materials: ['air', 'water', 'metal'], physics: ['pressure', 'elasticity', 'friction'],
      math: ['oscillator', 'scalar-field', 'time-step'], primitives: ['wave-source', 'acoustic-emitter', 'pressure', 'elasticity', 'friction', 'air', 'water'],
      ports: ['wave_source', 'medium'],
    }),
    basisCard('ground.pressure-event', 'event', 'rapid pressure event with expanding field, impulse, and damping', {
      parts: ['pressure source', 'shock front', 'affected bodies'],
      materials: ['air', 'fire-plasma'], physics: ['pressure', 'fluid-advection', 'collision', 'heat-transfer'],
      math: ['scalar-field', 'vector-field'], primitives: ['pressure', 'fluid-advection', 'collision', 'heat-transfer', 'air', 'fire-plasma'],
      ports: ['pressure_out'],
    }),
    basisCard('ground.mechanical-joint', 'relation', 'mechanical attachment reduced to constraint, pivot, support, and force transfer', {
      parts: ['joint constraint', 'support', 'attached bodies'],
      materials: ['metal'], physics: ['rigid-body', 'collision', 'friction'],
      math: ['constraint', 'matrix-tensor'], primitives: ['constraint', 'rigid-body', 'collision', 'friction', 'metal'],
      ports: ['body_a', 'body_b'],
    }),
    basisCard('ground.path-coupling', 'relation', 'path relation that sends light, fluid, body, or signal through a curve or channel', {
      parts: ['path', 'moving quantity', 'boundary'],
      materials: [], physics: ['fluid-advection', 'optics', 'friction'],
      math: ['curve-path', 'source-sink'], primitives: ['curve-path', 'source-sink', 'fluid-advection', 'optics', 'friction'],
      ports: ['path_in', 'path_out'],
    }),
    basisCard('ground.force-coupling', 'relation', 'force relation where source acts on target through contact, field, or actuator', {
      parts: ['source body', 'target body', 'force channel'],
      materials: [], physics: ['rigid-body', 'collision', 'magnetism', 'friction'],
      math: ['vector', 'constraint'], primitives: ['rigid-body', 'collision', 'magnetism', 'friction', 'vector'],
      ports: ['source', 'target', 'force'],
    }),
    basisCard('ground.orbital-motion', 'relation', 'curved or orbital motion around center with gravity or angular constraint', {
      parts: ['center', 'orbit path', 'moving body'],
      materials: [], physics: ['gravity', 'rigid-body'],
      math: ['curve-path', 'oscillator'], primitives: ['gravity', 'rigid-body', 'curve-path', 'oscillator'],
      ports: ['center', 'body'],
    }),
    basisCard('ground.pressure-membrane', 'component', 'elastic membrane enclosing gas or fluid pressure', {
      parts: ['membrane shell', 'interior pressure', 'neck/opening'],
      materials: ['rubber', 'air'], physics: ['soft-body', 'pressure', 'elasticity', 'collision'],
      math: ['surface-boundary', 'constraint'], primitives: ['rubber', 'air', 'soft-body', 'pressure', 'elasticity', 'collision'],
      ports: ['pressure', 'boundary'],
    }),
    basisCard('ground.membrane-structure', 'component', 'fabric or membrane structure with supports, wind load, and deflection', {
      parts: ['membrane surface', 'ribs', 'supports'],
      materials: ['fabric', 'metal', 'air'], physics: ['soft-body', 'elasticity', 'fluid-advection'],
      math: ['surface-boundary', 'vector-field'], primitives: ['fabric', 'metal', 'air', 'soft-body', 'elasticity', 'fluid-advection'],
      ports: ['wind', 'support'],
    }),
    basisCard('ground.rigid-chain', 'component', 'chain of rigid blocks with sequential contact and tipping', {
      parts: ['rigid blocks', 'contact sequence', 'floor'],
      materials: ['wood', 'plastic'], physics: ['rigid-body', 'collision', 'friction', 'gravity'],
      math: ['particle-set', 'constraint'], primitives: ['wood', 'plastic', 'rigid-body', 'collision', 'friction', 'gravity'],
      ports: ['first_contact', 'chain_motion'],
    }),
    basisCard('ground.biological-tissue', 'class', 'organ or tissue reduced to soft matter, membranes, flow, and reaction fields', {
      parts: ['soft volume', 'membrane boundary', 'fiber constraints', 'diffusion field'],
      materials: ['protein', 'gel', 'membrane', 'biomass'], physics: ['soft-body', 'diffusion', 'elasticity', 'chemical-reaction'],
      math: ['scalar-field', 'particle-set', 'constraint'], primitives: ['protein', 'gel', 'membrane', 'biomass', 'soft-body', 'diffusion', 'elasticity', 'chemical-reaction'],
      ports: ['diffusion', 'contact', 'deformation'],
    }),
    basisCard('ground.household-object', 'component', 'household object reduced to rigid shell, contact, containment, heat, or flow', {
      parts: ['body shell', 'support surface', 'ports or openings', 'contact patches'],
      materials: ['metal', 'plastic', 'ceramic', 'glass'], physics: ['rigid-body', 'collision', 'friction', 'heat-transfer'],
      math: ['surface-boundary', 'constraint'], primitives: ['metal', 'plastic', 'glass', 'rigid-body', 'collision', 'friction', 'heat-transfer', 'surface-boundary'],
      ports: ['support', 'contents', 'heat', 'flow'],
    }),
    basisCard('ground.infrastructure-system', 'composition', 'built infrastructure reduced to structures, service networks, loads, flows, and ledgers', {
      parts: ['structure', 'network edges', 'service nodes', 'load paths', 'sensors'],
      materials: ['concrete', 'metal', 'glass', 'silicon'], physics: ['rigid-body', 'friction', 'fluid-advection', 'electromagnetism'],
      math: ['graph-network', 'queue', 'conservation-ledger'], primitives: ['concrete', 'metal', 'glass', 'graph-network', 'queue', 'network-link', 'controller', 'sensor', 'energy-ledger'],
      ports: ['load', 'flow', 'service', 'measurement'],
    }),
    basisCard('ground.play-physics', 'component', 'sport or play object lowered to contact, elasticity, rotation, drag, and constraints', {
      parts: ['body', 'contact surface', 'elastic region', 'path constraint'],
      materials: ['rubber', 'wood', 'fabric', 'air'], physics: ['rigid-body', 'collision', 'friction', 'elasticity'],
      math: ['oscillator', 'constraint', 'curve-path'], primitives: ['rubber', 'wood', 'fabric', 'air', 'rigid-body', 'collision', 'friction', 'elasticity', 'oscillator'],
      ports: ['contact', 'motion', 'impact'],
    }),
    basisCard('ground.natural-environment', 'scene', 'natural environment reduced to terrain, atmosphere, water, materials, growth, and weather', {
      parts: ['terrain field', 'air volume', 'water paths', 'material patches', 'growth fields'],
      materials: ['soil', 'rock', 'sand', 'water', 'air', 'biomass'], physics: ['fluid-advection', 'erosion', 'gravity', 'growth-decay'],
      math: ['grid-heightfield', 'vector-field', 'scalar-field'], primitives: ['terrain-patch', 'soil', 'rock', 'sand', 'water', 'air', 'fluid-advection', 'erosion', 'growth-decay', 'gravity'],
      ports: ['terrain', 'weather', 'water', 'ecology'],
    }),
    basisCard('ground.operations-scene', 'scene', 'built operations scene reduced to spaces, agents, queues, vehicles, sensors, and service flows', {
      parts: ['spaces', 'routes', 'queues', 'service nodes', 'measurement points'],
      materials: ['concrete', 'metal', 'glass', 'silicon'], physics: ['queueService', 'collision', 'friction'],
      math: ['graph-network', 'queue', 'delay'], primitives: ['graph-network', 'queue', 'queue-server', 'network-link', 'sensor-array', 'controller', 'data-recorder'],
      ports: ['arrival', 'service', 'traffic', 'readout'],
    }),
    basisCard('ground.space-phenomenon', 'scene', 'space phenomenon reduced to gravity, radiation, plasma, orbit paths, rock, and fields', {
      parts: ['gravity well', 'orbit path', 'radiation field', 'body or plasma region'],
      materials: ['rock', 'fire-plasma', 'ice'], physics: ['gravity', 'radiation', 'magnetism', 'collision'],
      math: ['curve-path', 'vector-field', 'source-sink'], primitives: ['gravity', 'radiation', 'magnetism', 'rock', 'fire-plasma', 'ice', 'curve-path', 'energy-ledger'],
      ports: ['orbit', 'radiation', 'field'],
    }),
    basisCard('ground.material-sample', 'material', 'recognized material reduced to phase, density, contact, heat, chemistry, and field response', {
      parts: ['sample body', 'surface boundary', 'property field'],
      materials: ['metal', 'rock', 'plastic', 'water', 'air'], physics: ['collision', 'heat-transfer', 'phase-change', 'chemical-reaction'],
      math: ['surface-boundary', 'scalar-field'], primitives: ['metal', 'rock', 'plastic', 'water', 'air', 'collision', 'heat-transfer', 'phase-change', 'chemical-reaction'],
      ports: ['contact', 'heat', 'reaction'],
    }),
    basisCard('ground.generic-event', 'event', 'generic process lowered through event operators for state, force, field, flow, or wave change', {
      parts: ['participants', 'state field', 'coupling operator', 'ledger'],
      materials: [], physics: ['collision', 'friction', 'heat-transfer', 'phase-change', 'fluid-advection'],
      math: ['time-step', 'scalar-field', 'vector-field', 'conservation-ledger'], primitives: ['collision', 'friction', 'heat-transfer', 'phase-change', 'fluid-advection', 'pressure', 'elasticity', 'energy-ledger'],
      ports: ['participant_a', 'participant_b', 'state_change'],
    }),
    basisCard('ground.generic-relation', 'relation', 'generic relation lowered to spatial, support, path, field, thermal, or force coupling', {
      parts: ['source', 'target', 'coupling path', 'constraint'],
      materials: [], physics: ['collision', 'friction', 'rigid-body', 'heat-transfer', 'optics'],
      math: ['constraint', 'curve-path', 'source-sink'], primitives: ['constraint', 'curve-path', 'source-sink', 'collision', 'friction', 'rigid-body', 'heat-transfer', 'optics'],
      ports: ['source', 'target', 'coupling'],
    }),
  ]);

  function rule(id, words) {
    return { id, words: new Set(words) };
  }

  function curatedUniverseSurfaceCards() {
    const rows = [
      ['entity.dog', 'entity', ['dog', 'canine'], 'medium mammal with articulated soft body, gait, paws, tail, and collision shell', { classHints: ['medium_mammal'], shapeHints: ['articulated_body'], materialHints: ['soft_tissue', 'fur'], behaviorHints: ['gait_force'], groundingIds: ['ground.articulated-body'] }],
      ['entity.cat', 'entity', ['cat', 'feline'], 'small agile mammal with soft body, paws, tail, jumping, and frictional contact', { classHints: ['small_mammal'], shapeHints: ['articulated_body'], materialHints: ['soft_tissue', 'fur'], behaviorHints: ['gait_force', 'jumping'], groundingIds: ['ground.small-mammal-body'] }],
      ['entity.frog', 'entity', ['frog', 'toad'], 'small amphibian with soft body, jumping limbs, wet skin, and water interaction', { classHints: ['amphibian'], shapeHints: ['articulated_body'], materialHints: ['soft_tissue', 'water'], behaviorHints: ['jumping', 'swimming'], groundingIds: ['ground.articulated-body', 'ground.swimmer-body'] }],
      ['entity.spider', 'entity', ['spider', 'arachnid'], 'tiny multi-leg articulated body with contact feet, silk strand, and crawling gait', { classHints: ['arachnid'], shapeHints: ['segmented_body'], materialHints: ['biomass'], behaviorHints: ['walking_gait'], groundingIds: ['ground.segmented-body', 'ground.flexible-cable'] }],
      ['entity.elephant', 'entity', ['elephant'], 'large mammal with heavy soft body, trunk, gait force, high mass, and ground contact', { classHints: ['large_mammal'], shapeHints: ['articulated_body'], materialHints: ['soft_tissue'], behaviorHints: ['gait_force'], groundingIds: ['ground.large-mammal-body'] }],
      ['artifact.chair', 'artifact', ['chair', 'stool', 'seat'], 'load-bearing furniture with legs, seat surface, rigid frame, and contact supports', { classHints: ['structure'], shapeHints: ['frame'], partHints: ['legs', 'seat', 'back'], materialHints: ['wood', 'metal'], groundingIds: ['ground.structural-span'] }],
      ['artifact.table', 'artifact', ['table', 'desk', 'bench'], 'flat supported surface with legs, load path, contact, and rigid body frame', { classHints: ['structure'], shapeHints: ['flat_panel'], partHints: ['top', 'legs'], materialHints: ['wood', 'metal'], groundingIds: ['ground.structural-span'] }],
      ['artifact.ladder', 'artifact', ['ladder', 'stairs'], 'climbable rigid structure with rungs, supports, gravity load, and contact friction', { classHints: ['structure'], shapeHints: ['span_structure'], partHints: ['rungs', 'rails'], materialHints: ['metal', 'wood'], groundingIds: ['ground.structural-span'] }],
      ['artifact.cage', 'artifact', ['cage', 'enclosure', 'pen'], 'open boundary container with bars, interior volume, collision, and containment', { classHints: ['container'], shapeHints: ['hollow_boundary'], partHints: ['bars', 'door', 'frame'], materialHints: ['metal'], affordanceHints: ['contains'], groundingIds: ['ground.container', 'ground.containment'] }],
      ['artifact.camera', 'artifact', ['camera', 'sensor camera'], 'optical sensor with lens, aperture, image plane, signal path, and measurement readout', { classHints: ['instrument'], shapeHints: ['optical_column'], partHints: ['lens', 'sensor', 'body'], materialHints: ['glass', 'silicon', 'metal'], behaviorHints: ['measurement'], groundingIds: ['ground.optical-element', 'ground.instrumented-bench'] }],
      ['artifact.screen', 'artifact', ['screen', 'display', 'monitor'], 'flat light-emitting panel with pixels, signal input, heat, and glass surface', { classHints: ['electrical_network'], shapeHints: ['flat_panel'], materialHints: ['glass', 'silicon', 'plastic'], behaviorHints: ['emits_light'], groundingIds: ['ground.electrical-network', 'ground.optical-source'] }],
      ['artifact.speaker', 'artifact', ['speaker', 'loudspeaker'], 'acoustic actuator with vibrating membrane, coil, magnet, air pressure, and damping', { classHints: ['acoustic_device'], shapeHints: ['membrane_volume'], partHints: ['coil', 'cone', 'magnet'], materialHints: ['fabric', 'copper', 'magnetized-metal'], behaviorHints: ['vibration'], groundingIds: ['ground.wave-event', 'ground.electrical-machine'] }],
      ['artifact.stove', 'artifact', ['stove', 'burner', 'hot plate'], 'thermal source with heating surface, fuel or electric input, heat transfer, and cookware contact', { classHints: ['thermal_machine'], shapeHints: ['flat_panel'], partHints: ['heater', 'surface'], materialHints: ['metal', 'fire-plasma'], behaviorHints: ['heat_exchange'], groundingIds: ['ground.thermal-machine'] }],
      ['artifact.kettle', 'artifact', ['kettle', 'teapot'], 'heated vessel containing water with pressure, phase change, steam, and handle', { classHints: ['thermal_fluid_machine', 'container'], shapeHints: ['vessel'], partHints: ['wall', 'spout', 'handle'], materialHints: ['metal', 'water', 'air'], behaviorHints: ['heat_exchange', 'phase_change'], groundingIds: ['ground.thermal-fluid-machine', 'ground.container'] }],
      ['artifact.faucet', 'artifact', ['faucet', 'tap', 'spigot'], 'valved water outlet controlling flow from pipe to open air or vessel', { classHints: ['fluid_network'], shapeHints: ['connected_channels'], partHints: ['valve', 'outlet'], materialHints: ['metal', 'water'], behaviorHints: ['fluid_flow'], groundingIds: ['ground.fluid-network'] }],
      ['artifact.hammer', 'artifact', ['hammer', 'mallet'], 'hand tool with handle and impact head transferring impulse through collision', { classHints: ['tool'], shapeHints: ['rigid_body'], partHints: ['handle', 'head'], materialHints: ['metal', 'wood'], behaviorHints: ['collides'], groundingIds: ['ground.rigid-machine', 'ground.collision-event'] }],
      ['artifact.drill', 'artifact', ['drill', 'power drill'], 'rotating tool with motor, bit, torque, contact friction, and material removal', { classHints: ['rotating_mechanism', 'tool'], shapeHints: ['rotor'], partHints: ['motor', 'bit', 'body'], materialHints: ['metal', 'plastic'], behaviorHints: ['rotation'], groundingIds: ['ground.rotating-apparatus', 'ground.rigid-machine'] }],
      ['artifact.saw', 'artifact', ['saw', 'blade'], 'cutting tool with blade teeth, friction, vibration, and contact with material', { classHints: ['tool'], shapeHints: ['sheet'], partHints: ['blade', 'teeth'], materialHints: ['metal'], behaviorHints: ['vibration'], groundingIds: ['ground.wave-event', 'ground.rigid-machine'] }],
      ['artifact.parachute', 'artifact', ['parachute'], 'fabric canopy producing drag, lift, ropes, and damped descent through air', { classHints: ['membrane_structure'], shapeHints: ['radial_canopy'], materialHints: ['fabric', 'air'], behaviorHints: ['drag'], groundingIds: ['ground.membrane-structure', 'ground.flexible-cable'] }],
      ['artifact.sailboat', 'artifact', ['sailboat', 'sail'], 'floating vessel with sail membrane, wind force, hull buoyancy, and rudder control', { classHints: ['vessel'], shapeHints: ['hull'], partHints: ['sail', 'hull', 'rudder'], materialHints: ['fabric', 'wood', 'water', 'air'], behaviorHints: ['fluid_drag'], groundingIds: ['ground.floating-vessel', 'ground.membrane-structure'] }],
      ['artifact.skateboard', 'artifact', ['skateboard', 'scooter'], 'small wheeled platform with deck, wheels, axle trucks, rolling contact, and rider load', { classHints: ['wheeled_vehicle'], shapeHints: ['flat_panel'], partHints: ['deck', 'wheel', 'axle'], materialHints: ['wood', 'rubber', 'metal'], behaviorHints: ['rolls'], groundingIds: ['ground.wheeled-vehicle'] }],
      ['environment.beach', 'environment', ['beach', 'shoreline', 'coast'], 'sand-water-air boundary with waves, granular slope, runoff, and wind', { classHints: ['terrain'], shapeHints: ['heightfield'], materialHints: ['sand', 'water', 'air'], behaviorHints: ['wave_motion', 'erosion'], groundingIds: ['ground.fluid-channel', 'ground.granular-terrain'] }],
      ['environment.swamp', 'environment', ['swamp', 'marsh', 'wetland'], 'shallow water and soil ecosystem with plants, mud, diffusion, and slow flow', { classHints: ['managed_ecosystem'], shapeHints: ['fluid_volume'], materialHints: ['water', 'soil', 'leaf', 'biomass'], behaviorHints: ['fluid_flow', 'growth'], groundingIds: ['ground.fluid-domain', 'ground.plant-body'] }],
      ['environment.tundra', 'environment', ['tundra', 'frozen plain'], 'cold terrain with ice, soil, wind, phase change, and sparse plant growth', { classHints: ['terrain'], shapeHints: ['heightfield'], materialHints: ['ice', 'soil', 'air'], behaviorHints: ['phase_change', 'wind'], groundingIds: ['ground.ice-mass', 'ground.granular-terrain'] }],
      ['environment.subway', 'environment', ['subway', 'train station', 'platform'], 'rail network environment with trains, passenger queues, signals, tunnels, and platform edges', { classHints: ['operations_network'], shapeHints: ['graph_network'], materialHints: ['concrete', 'metal', 'air'], behaviorHints: ['queueing', 'traffic_flow'], groundingIds: ['ground.network-system', 'ground.constrained-vehicle'] }],
      ['environment.office', 'environment', ['office', 'meeting room'], 'indoor workspace with tables, chairs, screens, people, lights, and ventilation', { classHints: ['workspace'], shapeHints: ['room'], materialHints: ['concrete', 'glass', 'air'], behaviorHints: ['measurement'], groundingIds: ['ground.instrumented-bench'] }],
      ['environment.classroom', 'environment', ['classroom', 'lecture hall'], 'room with desks, board, people, acoustic speech, lights, and queues of attention', { classHints: ['workspace'], shapeHints: ['room'], materialHints: ['wood', 'glass', 'air'], behaviorHints: ['wave', 'measurement'], groundingIds: ['ground.instrumented-bench', 'ground.wave-event'] }],
      ['environment.bathroom', 'environment', ['bathroom', 'shower room'], 'wet indoor room with drains, faucet flow, steam, surfaces, and containment', { classHints: ['workspace'], shapeHints: ['room'], materialHints: ['water', 'glass', 'air'], behaviorHints: ['fluid_flow', 'phase_change'], groundingIds: ['ground.fluid-network', 'ground.thermal-fluid-machine'] }],
      ['event.jump', 'event', ['jumping', 'jump', 'leaping'], 'impulse-driven body motion against gravity with takeoff, flight arc, and landing collision', { eventHints: ['jumping'], groundingIds: ['ground.collision-event', 'ground.force-coupling'] }],
      ['event.cut', 'event', ['cutting', 'slicing', 'shearing'], 'contact event separating material through blade, friction, threshold, and deformation', { eventHints: ['cutting'], groundingIds: ['ground.collision-event'] }],
      ['event.stir', 'event', ['stirring', 'mixing', 'agitating'], 'rotating tool drives fluid or granular material into vortices and diffusion', { eventHints: ['mixing'], groundingIds: ['ground.fluid-domain', 'ground.rotating-apparatus'] }],
      ['event.inflate', 'event', ['inflating', 'inflation', 'deflating'], 'pressure changes inside membrane or vessel with elastic boundary response', { eventHints: ['pressure'], groundingIds: ['ground.pressure-membrane', 'ground.pressure-event'] }],
    ];
    return rows.map((row) => surfaceCard(row[0], row[1], row[2], row[3], row[4]));
  }

  function createSemanticRag(promptText = '', primitives = PHYSICAL_PRIMITIVES, options = {}) {
    const prompt = String(promptText || '').trim();
    const indexDocs = indexedPrimitiveDocs(options.primitiveIndex);
    const promptVector = options.promptVector
      ? Float32Array.from(options.promptVector)
      : buildSemanticFeatureVector(prompt);
    const featureDim = promptVector.length || FEATURE_DIM;
    const candidateDocs = (primitives || []).map((primitive, index) => {
      const indexed = indexDocs.get(primitive.id);
      return indexed ? primitiveDocFromIndex(primitive, indexed, index) : primitiveDoc(primitive, index, featureDim);
    });
    const surfaceDocs = SEMANTIC_SURFACE_CARDS.map((card, index) => semanticCardDoc(card, index, 'semantic-surface', featureDim));
    const groundingDocs = GROUNDING_BASIS_CARDS.map((card, index) => semanticCardDoc(card, index, 'grounding-basis', featureDim));
    const modelPriors = new Map((options.modelPriors || []).map((prior) => [prior.primitiveId, prior]));
    const retrieved = candidateDocs
      .map((doc) => scoreDocument(promptVector, prompt, doc, modelPriors.get(doc.primitiveId)))
      .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId))
      .slice(0, Number.isFinite(options.maxDocuments) ? options.maxDocuments : 60);
    const surfaceRetrieved = surfaceDocs
      .map((doc) => scoreSemanticCard(promptVector, prompt, doc))
      .filter((doc) => doc.score > 0.08 || doc.directMatch)
      .sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId))
      .slice(0, Number.isFinite(options.maxSurfaceDocuments) ? options.maxSurfaceDocuments : 72);
    const groundingRetrieved = groundingDocs
      .map((doc) => scoreSemanticCard(promptVector, prompt, doc))
      .filter((doc) => doc.score > 0.06 || doc.directMatch)
      .sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId))
      .slice(0, Number.isFinite(options.maxGroundingDocuments) ? options.maxGroundingDocuments : 64);
    const synthGraph = synthesizeSurfaceGraph(prompt, primitives || PHYSICAL_PRIMITIVES, {
      surfaceRetrieved,
      groundingRetrieved,
      primitiveRetrieved: retrieved,
      maxNodes: Number.isFinite(options.maxSynthNodes) ? options.maxSynthNodes : 18,
    });
    const openLimit = Number.isFinite(options.maxOpenComponents) ? options.maxOpenComponents : 12;
    const openComponents = mergeOpenComponents(
      synthGraph.openComponents,
      extractOpenComponents(prompt, retrieved),
      openLimit
    );
    const domains = dominantDomains(retrieved, openComponents);
    return {
      schema: SEMANTIC_RAG_SCHEMA,
      model: {
        id: 'simulatte-grid-style-semantic-rag.v1',
        family: indexDocs.size ? 'shipped-index-open-primitive-rag' : 'hashed-embedding-open-primitive-rag',
        featureDim,
        indexId: options.primitiveIndex && options.primitiveIndex.id || '',
        surfaceIndex: 'simulatte-semantic-surface-cards.v1',
        groundingIndex: 'simulatte-grounding-basis-cards.v1',
        source: indexDocs.size ? 'shipped primitive embedding index plus semantic surface cards' : 'prompt text plus primitive and surface documents',
      },
      prompt,
      retrieved,
      surfaceRetrieved,
      groundingRetrieved,
      synthGraph,
      openComponents,
      domains,
      explanation: {
        dominantDomains: domains.slice(0, 6),
        openPhrases: openComponents.map((component) => component.phrase),
        retrievalHeads: retrieved.slice(0, 12).map((doc) => doc.primitiveId),
        surfaceHeads: surfaceRetrieved.slice(0, 12).map((doc) => doc.cardId),
        groundingHeads: groundingRetrieved.slice(0, 12).map((doc) => doc.cardId),
        synthNodes: synthGraph.nodes.map((node) => node.id),
      },
    };
  }

  function surfaceCard(id, type, labels, description, hints = {}) {
    const normalizedLabels = uniqueList(labels || []);
    return Object.freeze({
      id,
      type,
      labels: normalizedLabels,
      description: String(description || ''),
      classHints: uniqueList(hints.classHints || []),
      shapeHints: uniqueList(hints.shapeHints || []),
      partHints: uniqueList(hints.partHints || []),
      materialHints: uniqueList(hints.materialHints || []),
      behaviorHints: uniqueList(hints.behaviorHints || []),
      affordanceHints: uniqueList(hints.affordanceHints || []),
      relationHints: uniqueList(hints.relationHints || []),
      eventHints: uniqueList(hints.eventHints || []),
      scaleHints: uniqueList(hints.scaleHints || []),
      groundingIds: uniqueList(hints.groundingIds || []),
      curation: cardCuration(id, type, normalizedLabels, hints),
    });
  }

  function basisCard(id, type, description, spec = {}) {
    return Object.freeze({
      id,
      type,
      labels: uniqueList([id.replace(/^ground\./, '').replace(/-/g, ' '), ...(spec.labels || [])]),
      description: String(description || ''),
      parts: uniqueList(spec.parts || []),
      materials: uniqueList(spec.materials || []),
      physics: uniqueList(spec.physics || []),
      math: uniqueList(spec.math || []),
      primitives: uniqueList(spec.primitives || []),
      ports: uniqueList(spec.ports || []),
    });
  }

  function universeSurfaceCards() {
    return uniqueSurfaceCards([
      ...curatedUniverseSurfaceCards(),
      ...surfacePack('entity', 'entity', [
        'cat', 'dog', 'wolf', 'fox', 'bear', 'elephant', 'giraffe', 'zebra',
        'kangaroo', 'koala', 'panda', 'goat', 'sheep', 'pig', 'camel', 'llama',
        'monkey', 'gorilla', 'chimpanzee', 'otter', 'beaver', 'bat', 'mole',
        'hedgehog', 'donkey', 'alpaca', 'bison', 'moose', 'antelope', 'leopard',
        'tiger', 'lion', 'cheetah', 'hyena', 'hippopotamus', 'rhinoceros',
      ], {
        description: 'land mammal with soft body, limbs, gait, contact, inertia, and collision response',
        classHints: ['mammal'], shapeHints: ['articulated_body'], materialHints: ['soft_tissue', 'fur'],
        behaviorHints: ['gait_force', 'body_collision'], scaleHints: ['medium'],
        groundingIds: ['ground.articulated-body'],
      }),
      ...surfacePack('entity', 'entity', [
        'owl', 'hawk', 'falcon', 'raven', 'crow', 'goose', 'duck', 'swan',
        'penguin', 'chicken', 'turkey', 'ostrich', 'hummingbird', 'parrot',
        'flamingo', 'pelican', 'seagull', 'albatross', 'woodpecker', 'crane bird',
      ], {
        description: 'bird body with wings, feathers, lift, drag, gait or swimming contact',
        classHints: ['bird'], shapeHints: ['winged_body'], materialHints: ['soft_tissue', 'feather'],
        behaviorHints: ['flapping_lift', 'gliding', 'body_collision'],
        groundingIds: ['ground.winged-body'],
      }),
      ...surfacePack('entity', 'entity', [
        'octopus', 'squid', 'jellyfish', 'crab', 'lobster', 'shrimp', 'clam',
        'oyster', 'mussel', 'sea urchin', 'starfish', 'eel', 'ray', 'seahorse',
        'coral polyp', 'anemone', 'plankton', 'krill', 'barnacle', 'snail',
      ], {
        description: 'aquatic body or marine organism interacting with water, buoyancy, drag, and soft contact',
        classHints: ['aquatic_organism'], shapeHints: ['streamlined_body'], materialHints: ['soft_tissue', 'water'],
        behaviorHints: ['swimming', 'buoyancy', 'fluid_drag'], groundingIds: ['ground.swimmer-body'],
      }),
      ...surfacePack('entity', 'entity', [
        'butterfly', 'moth', 'dragonfly', 'mosquito', 'termite', 'grasshopper',
        'cricket', 'wasp', 'fly', 'ladybug', 'caterpillar', 'centipede',
        'millipede', 'spider', 'scorpion', 'tick', 'mite', 'firefly',
      ], {
        description: 'small segmented arthropod body with legs, swarm motion, contact, and tiny scale',
        classHints: ['arthropod'], shapeHints: ['segmented_body'], materialHints: ['biomass'],
        behaviorHints: ['walking_gait', 'swarm', 'body_collision'], scaleHints: ['tiny'],
        groundingIds: ['ground.segmented-body'],
      }),
      ...surfacePack('entity', 'entity', [
        'crocodile', 'alligator', 'frog', 'toad', 'salamander', 'newt', 'gecko',
        'iguana', 'chameleon', 'tortoise', 'sea turtle', 'python', 'cobra',
        'boa', 'newt larva',
      ], {
        description: 'reptile or amphibian body with crawling, swimming, slithering, soft contact, and shell options',
        classHints: ['reptile_amphibian'], shapeHints: ['elongated_body'], materialHints: ['soft_tissue'],
        behaviorHints: ['crawl', 'slither', 'swimming'], groundingIds: ['ground.articulated-body'],
      }),
      ...surfacePack('entity', 'entity', [
        'grass', 'fern', 'moss', 'algae', 'kelp', 'vine', 'bamboo', 'cactus',
        'palm tree', 'oak tree', 'pine tree', 'willow tree', 'maple tree',
        'bush', 'shrub', 'reed', 'seaweed', 'lichen', 'crop row', 'orchid',
        'rose', 'sunflower', 'corn stalk', 'wheat stalk', 'rice plant',
      ], {
        description: 'plant structure with roots, stems, leaves, light response, moisture, and growth',
        classHints: ['plant'], shapeHints: ['branching_structure'], materialHints: ['leaf', 'wood', 'biomass'],
        behaviorHints: ['growth', 'light_response', 'water_uptake'], groundingIds: ['ground.plant-body'],
      }),
      ...surfacePack('entity', 'entity', [
        'bone', 'skeleton', 'muscle', 'tendon', 'ligament', 'skin', 'eye',
        'ear', 'brain', 'nerve', 'stomach', 'intestine', 'kidney', 'liver',
        'tooth', 'spine', 'rib cage', 'skull', 'joint cartilage',
      ], {
        description: 'biological tissue or organ approximated by soft matter, membranes, constraints, and chemistry',
        classHints: ['biological_tissue'], shapeHints: ['soft_articulated_body'], materialHints: ['protein', 'membrane', 'gel'],
        behaviorHints: ['diffusion', 'elasticity', 'body_collision'], groundingIds: ['ground.biological-tissue'],
      }),
      ...surfacePack('entity', 'entity', [
        'virus', 'bacterium', 'yeast', 'amoeba', 'protozoa', 'spore', 'biofilm',
        'enzyme', 'dna strand', 'rna strand', 'protein complex', 'lipid vesicle',
        'organelle', 'mitochondrion', 'chloroplast',
      ], {
        description: 'microscopic biological entity with diffusion, reaction, membrane, growth, or replication behavior',
        classHints: ['microbiology'], shapeHints: ['membrane_volume'], materialHints: ['protein', 'membrane', 'gel'],
        behaviorHints: ['diffusion', 'chemical_reaction', 'growth'], groundingIds: ['ground.biological-colony'],
      }),

      ...surfacePack('artifact', 'artifact', [
        'hammer', 'screwdriver', 'wrench', 'saw', 'drill', 'nail', 'screw',
        'pliers', 'shovel', 'rake', 'scissors', 'knife', 'axe', 'chisel',
        'file tool', 'clamp', 'vise', 'tongs', 'crowbar', 'level tool',
        'measuring tape', 'paint brush', 'roller brush', 'bucket',
      ], {
        description: 'hand tool or work object with rigid body, handle, contact, force transfer, and friction',
        classHints: ['hand_tool'], shapeHints: ['rigid_tool'], materialHints: ['metal', 'wood', 'plastic'],
        behaviorHints: ['pushes', 'attached_to', 'body_collision'], groundingIds: ['ground.rigid-machine'],
      }),
      ...surfacePack('artifact', 'artifact', [
        'table', 'chair', 'bed', 'sofa', 'cabinet', 'shelf', 'desk', 'bench',
        'sink', 'toilet', 'bathtub', 'shower', 'faucet', 'stove', 'oven',
        'microwave', 'toaster', 'blender', 'kettle', 'lamp', 'vacuum cleaner',
        'air conditioner', 'radiator', 'humidifier', 'dehumidifier',
      ], {
        description: 'household fixture or appliance with structure, containment, heat, flow, or rigid contact',
        classHints: ['household_object'], shapeHints: ['rigid_body'], materialHints: ['metal', 'plastic', 'ceramic'],
        behaviorHints: ['body_collision', 'heat_exchange', 'fluid_flow'], groundingIds: ['ground.household-object'],
      }),
      ...surfacePack('artifact', 'artifact', [
        'engine', 'piston', 'compressor', 'hydraulic press', 'lathe', 'milling machine',
        'cnc machine', '3d printer', 'printer', 'camera', 'projector', 'speaker',
        'microphone', 'servo motor', 'stepper motor', 'gear motor', 'bearing',
        'flywheel', 'clutch', 'brake', 'coupling', 'gear rack', 'linear actuator',
        'solenoid', 'relay', 'switch', 'valve manifold', 'heat exchanger',
      ], {
        description: 'machine component with rigid frame, actuation, energy flow, sensors, heat, and constraints',
        classHints: ['machine_component'], shapeHints: ['rigid_machine'], materialHints: ['metal', 'copper', 'plastic'],
        behaviorHints: ['actuated_motion', 'heat_loss', 'control_loop'], groundingIds: ['ground.rigid-machine'],
      }),
      ...surfacePack('artifact', 'artifact', [
        'house', 'skyscraper', 'tower', 'tunnel', 'road', 'railway track',
        'runway', 'dock', 'pier', 'fence', 'retaining wall', 'roof', 'window',
        'staircase', 'ramp', 'sidewalk', 'parking lot', 'subway tunnel',
        'water tower', 'pipeline', 'transmission line', 'transformer', 'server rack',
        'data center', 'cell tower', 'wind farm', 'solar farm', 'sewage plant',
        'water treatment plant', 'power plant', 'substation',
      ], {
        description: 'built infrastructure with structures, networks, loads, flows, services, and constraints',
        classHints: ['infrastructure'], shapeHints: ['structural_network'], materialHints: ['concrete', 'metal', 'glass'],
        behaviorHints: ['load_transfer', 'queueing', 'energy_flow'], groundingIds: ['ground.infrastructure-system'],
      }),
      ...surfacePack('artifact', 'artifact', [
        'centrifuge', 'spectrometer', 'incubator', 'reactor vessel', 'furnace',
        'crucible', 'lab flask', 'test tube', 'petri dish', 'pipette',
        'bunsen burner', 'vacuum chamber', 'pressure chamber', 'wind tunnel',
        'wave tank', 'oscilloscope', 'multimeter', 'scale balance',
        'calorimeter', 'autoclave', 'chromatograph', 'particle detector',
      ], {
        description: 'scientific instrument with sample, source, sensor, chamber, measurement, and readout',
        classHints: ['instrument'], shapeHints: ['instrumented_body'], materialHints: ['glass', 'metal', 'silicon'],
        behaviorHints: ['measurement', 'heat_exchange', 'pressure'], groundingIds: ['ground.instrumented-bench'],
      }),
      ...surfacePack('artifact', 'artifact', [
        'skateboard', 'roller skate', 'ski', 'sled', 'surfboard', 'parachute',
        'swing', 'seesaw', 'trampoline', 'playground slide', 'zipline',
        'soccer ball', 'basketball', 'tennis racket', 'baseball bat',
        'hockey stick', 'bow and arrow', 'boomerang', 'kite', 'yo-yo',
      ], {
        description: 'play or sport object with contact, elasticity, drag, rotation, collision, and constraints',
        classHints: ['play_object'], shapeHints: ['rigid_or_elastic_body'], materialHints: ['rubber', 'wood', 'fabric'],
        behaviorHints: ['rolling', 'bounces', 'vibration'], groundingIds: ['ground.play-physics'],
      }),

      ...surfacePack('environment', 'environment', [
        'tundra', 'savanna', 'grassland', 'swamp', 'wetland', 'mangrove',
        'coral reef', 'canyon', 'valley', 'delta', 'beach', 'island',
        'lagoon', 'estuary', 'oasis', 'mesa', 'plateau', 'badlands',
        'karst', 'geyser field', 'hot spring', 'salt flat', 'dune field',
        'kelp forest', 'deep sea vent', 'ice cave', 'lava tube',
      ], {
        description: 'natural environment with terrain, water, air, weather, material fields, and ecological coupling',
        classHints: ['natural_environment'], shapeHints: ['terrain_field'], materialHints: ['soil', 'rock', 'water', 'air'],
        behaviorHints: ['fluid_flow', 'erosion', 'growth'], groundingIds: ['ground.natural-environment'],
      }),
      ...surfacePack('environment', 'environment', [
        'airport', 'harbor', 'railway station', 'subway station', 'school',
        'office', 'stadium', 'mall', 'museum', 'theater', 'restaurant',
        'hotel', 'apartment building', 'construction site', 'mine', 'quarry',
        'oil rig', 'refinery', 'shipyard', 'farmyard', 'green roof',
        'parking garage', 'traffic intersection', 'roundabout',
      ], {
        description: 'built scene with structures, agents, queues, service flows, vehicles, sensors, and ledgers',
        classHints: ['built_environment'], shapeHints: ['operations_network'], materialHints: ['concrete', 'metal', 'glass'],
        behaviorHints: ['queueing', 'transport', 'measurement'], groundingIds: ['ground.operations-scene'],
      }),
      ...surfacePack('environment', 'environment', [
        'nebula', 'galaxy', 'black hole', 'asteroid belt', 'comet tail',
        'ring system', 'space station', 'orbital debris field', 'pulsar',
        'accretion disk', 'solar flare', 'magnetosphere', 'lunar crater',
        'martian valley', 'icy moon ocean',
      ], {
        description: 'space environment with gravity, radiation, plasma, orbital paths, fields, and impacts',
        classHints: ['space_environment'], shapeHints: ['orbital_field'], materialHints: ['rock', 'fire-plasma', 'ice'],
        behaviorHints: ['orbital_motion', 'radiation', 'collision'], groundingIds: ['ground.space-phenomenon'],
      }),

      ...surfacePack('material', 'material', [
        'gold', 'silver', 'aluminum', 'iron', 'titanium', 'nickel', 'zinc',
        'lead', 'tin', 'platinum', 'brass', 'bronze', 'stainless steel',
        'graphene', 'diamond', 'quartz', 'granite', 'basalt', 'limestone',
        'marble', 'slate', 'obsidian', 'ceramic', 'porcelain', 'asphalt',
        'paper', 'cardboard', 'wax', 'leather', 'cotton', 'wool', 'nylon',
        'polyethylene', 'resin', 'epoxy', 'salt', 'sugar', 'acid', 'base',
        'methane', 'hydrogen', 'oxygen', 'nitrogen', 'carbon dioxide',
        'helium', 'ammonia', 'gasoline', 'diesel', 'ethanol',
      ], {
        description: 'material sample recognized by class, phase, conductivity, density, chemistry, and contact behavior',
        classHints: ['material_sample'], shapeHints: ['sample_body'], materialHints: ['metal', 'rock', 'plastic'],
        behaviorHints: ['heat_exchange', 'chemical_reaction', 'body_collision'], groundingIds: ['ground.material-sample'],
      }),

      ...surfacePack('event', 'event', [
        'evaporating', 'condensing', 'freezing', 'melting', 'sublimating',
        'dissolving', 'crystallizing', 'precipitating', 'fermenting', 'corroding',
        'rusting', 'charging', 'discharging', 'short circuit', 'buckling',
        'fracturing', 'tearing', 'stretching', 'compressing', 'absorbing',
        'scattering', 'diffracting', 'interfering', 'reflecting', 'refracting',
        'diffusing', 'mixing', 'settling', 'filtering', 'separating',
        'orbiting', 'falling', 'sliding', 'toppling', 'bouncing', 'oscillating',
        'resonating', 'pulsing', 'exploding', 'imploding',
      ], {
        description: 'physical process event lowered to phase, chemical, mechanical, optical, electrical, or wave operators',
        eventHints: ['physical_process'], behaviorHints: ['state_change'], groundingIds: ['ground.generic-event'],
      }),
      ...surfacePack('relation', 'relation', [
        'above', 'below', 'beside', 'between', 'surrounding', 'supports',
        'rests on', 'hangs from', 'leans against', 'nested in', 'coupled to',
        'feeds into', 'drains into', 'heats up', 'cools down', 'charges',
        'discharges into', 'orbits', 'reflects off', 'refracts through',
        'absorbs into', 'scatters from', 'sticks to', 'slides along',
      ], {
        description: 'spatial or causal relation lowered to support, path, force, field, thermal, or optical coupling',
        relationHints: ['coupled'], groundingIds: ['ground.generic-relation'],
      }),
    ]);
  }

  function surfacePack(namespace, type, entries, shared) {
    return entries.map((entry) => {
      const labels = Array.isArray(entry) ? entry : [entry];
      const head = String(labels[0] || '').trim();
      const id = `${namespace}.${slug(head)}`;
      const entryHints = type === 'material'
        ? {
            ...shared,
            materialHints: uniqueList([...(shared.materialHints || []), slug(head)]),
          }
        : shared;
      return surfaceCard(id, type, labels, `${head}: ${shared.description}`, entryHints);
    });
  }

  function uniqueSurfaceCards(cards) {
    const byId = new Map();
    for (const card of cards || []) {
      if (!card || !card.id || byId.has(card.id)) continue;
      byId.set(card.id, card);
    }
    return Array.from(byId.values());
  }

  function primitiveDoc(primitive, index, dim = FEATURE_DIM) {
    const text = [
      primitive.id,
      primitive.layer,
      primitive.type,
      primitive.role,
      (primitive.domains || []).join(' '),
      primitiveText ? primitiveText(primitive) : '',
      (primitive.recipe || []).join(' '),
      (primitive.controls || []).join(' '),
    ].join(' ');
    return {
      primitiveId: primitive.id,
      layer: primitive.layer || primitive.type || 'component',
      type: primitive.type || 'component',
      domains: primitive.domains || [],
      text,
      vector: buildSemanticFeatureVector(text, dim),
      index,
    };
  }

  function indexedPrimitiveDocs(index) {
    const docs = index && Array.isArray(index.documents) ? index.documents : [];
    return new Map(docs.map((doc) => [doc.primitiveId, doc]));
  }

  function primitiveDocFromIndex(primitive, indexed, index) {
    const text = [
      primitive.id,
      primitive.layer,
      primitive.type,
      primitive.role,
      (primitive.domains || []).join(' '),
      primitiveText ? primitiveText(primitive) : '',
      (primitive.recipe || []).join(' '),
      (primitive.controls || []).join(' '),
    ].join(' ');
    return {
      primitiveId: primitive.id,
      layer: primitive.layer || primitive.type || 'component',
      type: primitive.type || 'component',
      domains: primitive.domains || [],
      text,
      vector: Float32Array.from(indexed.vector || []),
      index,
      indexed: true,
      textHash: indexed.textHash || '',
    };
  }

  function semanticCardDoc(card, index, kind, dim = FEATURE_DIM) {
    const text = semanticCardText(card);
    return {
      cardId: card.id,
      kind,
      type: card.type,
      labels: card.labels || [],
      domains: domainsForCard(card),
      text,
      vector: buildSemanticFeatureVector(text, dim),
      index,
      card,
    };
  }

  function semanticCardText(card) {
    return [
      card.id,
      card.type,
      (card.labels || []).join(' '),
      card.description,
      (card.classHints || []).join(' '),
      (card.shapeHints || []).join(' '),
      (card.partHints || []).join(' '),
      (card.materialHints || []).join(' '),
      (card.behaviorHints || []).join(' '),
      (card.affordanceHints || []).join(' '),
      (card.relationHints || []).join(' '),
      (card.eventHints || []).join(' '),
      (card.scaleHints || []).join(' '),
      (card.groundingIds || []).join(' '),
      (card.parts || []).join(' '),
      (card.materials || []).join(' '),
      (card.physics || []).join(' '),
      (card.math || []).join(' '),
      (card.primitives || []).join(' '),
      (card.ports || []).join(' '),
    ].join(' ');
  }

  function scoreDocument(promptVector, prompt, doc, modelPrior = null) {
    const semantic = cosineDense(promptVector, doc.vector);
    const lexical = lexicalOverlap(prompt, doc.text);
    const modelScore = modelPrior ? Number(modelPrior.score || 0) : 0;
    const score = semantic * 0.48 + lexical * 0.22 + modelScore * 0.3;
    return {
      primitiveId: doc.primitiveId,
      layer: doc.layer,
      type: doc.type,
      domains: doc.domains,
      score: Number(clamp(score, 0, 1).toFixed(4)),
      semanticScore: Number(clamp(semantic, 0, 1).toFixed(4)),
      lexicalScore: Number(clamp(lexical, 0, 1).toFixed(4)),
      modelScore: Number(clamp(modelScore, 0, 1).toFixed(4)),
      matchedTerms: matchedTerms(prompt, doc.text).slice(0, 8),
      source: 'primitive-document',
    };
  }

  function scoreSemanticCard(promptVector, prompt, doc) {
    const semantic = cosineDense(promptVector, doc.vector);
    const lexical = lexicalOverlap(prompt, doc.text);
    const direct = directLabelMatch(prompt, doc.labels);
    const curation = doc.card && doc.card.curation || cardCuration(doc.cardId, doc.type, doc.labels, {});
    const typeFit = promptTypeFit(prompt, doc.type);
    const score = semantic * 0.28 + lexical * 0.28 + direct * 0.34 + curation.priority * 0.08 + typeFit * 0.02;
    return {
      cardId: doc.cardId,
      kind: doc.kind,
      type: doc.type,
      labels: doc.labels,
      domains: doc.domains,
      score: Number(clamp(score, 0, 1).toFixed(4)),
      semanticScore: Number(clamp(semantic, 0, 1).toFixed(4)),
      lexicalScore: Number(clamp(lexical, 0, 1).toFixed(4)),
      directScore: Number(clamp(direct, 0, 1).toFixed(4)),
      directMatch: direct > 0,
      curation,
      typeFit: Number(typeFit.toFixed(4)),
      matchedTerms: matchedTerms(prompt, doc.text).slice(0, 10),
      source: doc.kind,
      card: doc.card,
    };
  }

  function synthesizeSurfaceGraph(prompt, primitives, context) {
    const primitiveIds = new Set((primitives || []).map((primitive) => primitive.id));
    const basisById = new Map(GROUNDING_BASIS_CARDS.map((card) => [card.id, card]));
    const directMatches = directSurfaceMatches(prompt);
    const retrievedMatches = (context.surfaceRetrieved || [])
      .filter((doc) => shouldUseRetrievedSurfaceNode(doc, directMatches))
      .slice(0, 12)
      .map((doc, index) => ({
        card: doc.card,
        phrase: doc.labels[0] || doc.cardId,
        index: 100000 + index,
        end: 100000 + index,
        score: doc.score,
        source: 'semantic-retrieval',
      }));
    const matches = stableSurfaceMatches([...directMatches, ...retrievedMatches], context.maxNodes || 18);
    const nodes = materializeSurfaceNodes(matches);
    const relationCards = [
      ...directMatches.filter((match) => match.card.type === 'relation'),
      ...(context.surfaceRetrieved || []).filter((doc) => doc.type === 'relation' && doc.score >= 0.24).map((doc) => ({
        card: doc.card,
        phrase: doc.labels[0] || doc.cardId,
        index: 100000,
        end: 100000,
        score: doc.score,
        source: 'semantic-retrieval',
      })),
    ];
    const eventCards = [
      ...directMatches.filter((match) => match.card.type === 'event'),
      ...(context.surfaceRetrieved || []).filter((doc) => doc.type === 'event' && doc.score >= 0.24).map((doc) => ({
        card: doc.card,
        phrase: doc.labels[0] || doc.cardId,
        index: 100000,
        end: 100000,
        score: doc.score,
        source: 'semantic-retrieval',
      })),
    ];
    const relations = synthesizeRelations(prompt, nodes, relationCards);
    const events = synthesizeEvents(prompt, nodes, eventCards);
    const grounding = groundSurfaceGraph(nodes, relations, events, primitiveIds, basisById);
    return {
      schema: SYNTH_GRAPH_SCHEMA,
      compiler: 'simulatte.embedding-guided-symbolic-graph-synth.v1',
      prompt,
      nodes,
      relations,
      events,
      groundedPrimitives: grounding.groundedPrimitives,
      openComponents: grounding.openComponents,
      validation: {
        status: grounding.unresolved.length ? 'repaired' : 'valid',
        groundedNodeCount: nodes.length,
        groundedPrimitiveCount: grounding.groundedPrimitives.length,
        unresolved: grounding.unresolved,
      },
    };
  }

  function directSurfaceMatches(prompt) {
    const lower = String(prompt || '').toLowerCase();
    const matches = [];
    for (const card of SEMANTIC_SURFACE_CARDS) {
      const labels = (card.labels || []).slice().sort((a, b) => b.length - a.length || a.localeCompare(b));
      for (const label of labels) {
        const normalized = String(label || '').toLowerCase().trim();
        if (!normalized) continue;
        const specificity = labelSpecificity(normalized);
        if (specificity < 0.18) continue;
        const pattern = new RegExp(`\\b${escapeRegExp(normalized).replace(/\\s+/g, '\\s+')}\\b`, 'g');
        let match;
        while ((match = pattern.exec(lower))) {
          matches.push({
            card,
            phrase: match[0],
            index: match.index,
            end: match.index + match[0].length,
            score: Number((0.7 + specificity * 0.26 + (card.curation ? card.curation.priority : 0) * 0.04).toFixed(4)),
            source: 'direct-surface-label',
          });
        }
      }
    }
    return matches.sort((a, b) => a.index - b.index || b.phrase.length - a.phrase.length);
  }

  function stableSurfaceMatches(matches, maxNodes) {
    const nodeMatches = matches.filter((match) => !['relation', 'event'].includes(match.card.type));
    const directIds = new Set(nodeMatches
      .filter((match) => match.source === 'direct-surface-label')
      .map((match) => match.card.id));
    const occupied = [];
    const out = [];
    for (const match of nodeMatches.slice().sort(surfaceMatchOrder)) {
      if (match.source !== 'direct-surface-label' && directIds.has(match.card.id)) continue;
      const duplicate = out.some((item) => item.card.id === match.card.id && (
        Math.abs(item.index - match.index) < 2 || match.source !== 'direct-surface-label'
      ));
      if (duplicate) continue;
      const overlap = occupied.some((span) => match.index < span.end && match.end > span.index && match.phrase.length < span.length);
      if (overlap) continue;
      occupied.push({ index: match.index, end: match.end, length: match.phrase.length });
      out.push(match);
      if (out.length >= maxNodes) break;
    }
    return out.sort((a, b) => a.index - b.index || a.card.id.localeCompare(b.card.id));
  }

  function shouldUseRetrievedSurfaceNode(doc, directMatches) {
    if (['relation', 'event'].includes(doc.type)) return false;
    if (directMatches.some((match) => match.card.id === doc.cardId)) return false;
    const curation = doc.curation || doc.card && doc.card.curation || cardCuration(doc.cardId, doc.type, doc.labels, {});
    const floor = curation.generic ? 0.42 : 0.31;
    if ((doc.score || 0) < floor) return false;
    if (!doc.directMatch && curation.specificity < 0.42 && (doc.lexicalScore || 0) < 0.18) return false;
    return true;
  }

  function surfaceMatchOrder(a, b) {
    const directDelta = (b.source === 'direct-surface-label') - (a.source === 'direct-surface-label');
    if (directDelta) return directDelta;
    const aPriority = a.card.curation ? a.card.curation.priority : 0.5;
    const bPriority = b.card.curation ? b.card.curation.priority : 0.5;
    return b.score - a.score
      || bPriority - aPriority
      || b.phrase.length - a.phrase.length
      || a.index - b.index
      || a.card.id.localeCompare(b.card.id);
  }

  function materializeSurfaceNodes(matches) {
    const counts = new Map();
    return matches.map((match) => {
      const base = slug(match.card.labels[0] || match.card.id.split('.').pop());
      const next = (counts.get(base) || 0) + 1;
      counts.set(base, next);
      return {
        id: `${base}_${next}`,
        cardId: match.card.id,
        label: match.card.labels[0] || base,
        type: match.card.type,
        sourceSpan: { text: match.phrase, index: match.index, end: match.end },
        score: Number(match.score || 0.5),
        source: match.source,
        classHints: match.card.classHints || [],
        shapeHints: match.card.shapeHints || [],
        partHints: match.card.partHints || [],
        materialHints: match.card.materialHints || [],
        behaviorHints: match.card.behaviorHints || [],
        affordanceHints: match.card.affordanceHints || [],
        scaleHints: match.card.scaleHints || [],
        groundingIds: match.card.groundingIds || [],
        slots: {
          class: (match.card.classHints || [])[0] || '',
          shape: (match.card.shapeHints || [])[0] || '',
          scale: (match.card.scaleHints || [])[0] || '',
          materials: (match.card.materialHints || []).slice(0, 4),
          behaviors: (match.card.behaviorHints || []).slice(0, 5),
          parts: (match.card.partHints || []).slice(0, 8),
        },
      };
    });
  }

  function synthesizeRelations(prompt, nodes, relationCards) {
    const relations = [];
    const relationHints = uniqueList(relationCards.flatMap((match) => match.card.relationHints || []));
    const promptLower = String(prompt || '').toLowerCase();
    if (relationHints.includes('inside') || /\b(in|inside|within|contained in)\b/.test(promptLower)) {
      for (const entity of nodes.filter((node) => node.type === 'entity')) {
        const container = nearestContainer(entity, nodes);
        if (container) {
          relations.push({
            id: `rel_${entity.id}_inside_${container.id}`,
            type: 'inside',
            from: entity.id,
            to: container.id,
            groundingIds: ['ground.containment'],
            score: 0.88,
          });
        }
      }
    }
    if (relationHints.includes('attached_to') || /\b(attached|connected|hinged|mounted)\b/.test(promptLower)) {
      const pair = nearestPair(nodes);
      if (pair) relations.push(relation('attached_to', pair[0], pair[1], ['ground.mechanical-joint'], 0.68));
    }
    if (relationHints.includes('through') || /\b(through|across|along)\b/.test(promptLower)) {
      const pair = nearestPair(nodes);
      if (pair) relations.push(relation('through', pair[0], pair[1], ['ground.path-coupling'], 0.64));
    }
    if (relationHints.includes('drives') || /\b(pushes|pulls|drives|powers)\b/.test(promptLower)) {
      const pair = nearestPair(nodes);
      if (pair) relations.push(relation('drives', pair[0], pair[1], ['ground.force-coupling'], 0.7));
    }
    return uniqueRelations(relations);
  }

  function relation(type, from, to, groundingIds, score) {
    return {
      id: `rel_${from.id}_${type}_${to.id}`,
      type,
      from: from.id,
      to: to.id,
      groundingIds,
      score,
    };
  }

  function synthesizeEvents(prompt, nodes, eventCards) {
    const hints = uniqueList(eventCards.flatMap((match) => match.card.eventHints || []));
    const promptLower = String(prompt || '').toLowerCase();
    const events = [];
    if (hints.includes('collision') || /\b(crash|crashes|crashing|collision|collide|collides|impact|hit|smash)\b/.test(promptLower)) {
      const participants = collisionParticipants(nodes);
      if (participants.length >= 2) {
        events.push({
          id: 'event_collision_1',
          type: 'collision',
          participants: participants.slice(0, 2).map((node) => node.id),
          groundingIds: ['ground.collision-event'],
          physics: ['rigid-body', 'soft-body', 'collision', 'friction', 'energy-ledger'],
          score: 0.94,
        });
      }
    }
    if (hints.includes('flow') || /\b(flow|flowing|pour|stream|river|pipe)\b/.test(promptLower)) events.push(eventFor('flow', nodes, ['ground.fluid-domain']));
    if (hints.includes('heat_exchange') || /\b(heat|cool|melt|boil|freeze|thermal)\b/.test(promptLower)) events.push(eventFor('heat_exchange', nodes, ['ground.thermal-machine']));
    if (hints.includes('combustion') || /\b(fire|burn|flame|combust|ignite)\b/.test(promptLower)) events.push(eventFor('combustion', nodes, ['ground.combustion-event']));
    if (hints.includes('optics') || /\b(light|lens|laser|prism|reflect|refract|focus)\b/.test(promptLower)) events.push(eventFor('optics', nodes, ['ground.optical-element']));
    if (hints.includes('magnetic_force') || /\b(magnet|magnetic|electromagnet)\b/.test(promptLower)) events.push(eventFor('magnetic_force', nodes, ['ground.magnetic-source']));
    if (hints.includes('growth') || /\b(grow|growth|colony|spread)\b/.test(promptLower)) events.push(eventFor('growth', nodes, ['ground.biological-colony']));
    if (hints.includes('erosion') || /\b(erosion|erode|sediment|weathering)\b/.test(promptLower)) events.push(eventFor('erosion', nodes, ['ground.erosion-event']));
    return events.filter(Boolean);
  }

  function eventFor(type, nodes, groundingIds) {
    return {
      id: `event_${type}_1`,
      type,
      participants: nodes.slice(0, 4).map((node) => node.id),
      groundingIds,
      physics: [],
      score: 0.62,
    };
  }

  function groundSurfaceGraph(nodes, relations, events, primitiveIds, basisById) {
    const primitiveScores = new Map();
    const evidenceByPrimitive = new Map();
    const unresolved = [];
    const addPrimitive = (primitiveId, score, evidence) => {
      if (!primitiveIds.has(primitiveId)) {
        unresolved.push(`${evidence.id || evidence.source || 'grounding'} -> missing primitive ${primitiveId}`);
        return;
      }
      primitiveScores.set(primitiveId, Math.max(primitiveScores.get(primitiveId) || 0, score));
      const rows = evidenceByPrimitive.get(primitiveId) || [];
      rows.push(evidence);
      evidenceByPrimitive.set(primitiveId, rows);
    };
    const expand = (groundingIds, score, evidence) => {
      for (const id of groundingIds || []) {
        if (primitiveIds.has(id)) {
          addPrimitive(id, score, evidence);
          continue;
        }
        const basis = basisById.get(id);
        if (!basis) {
          unresolved.push(`${evidence.id || evidence.source || 'grounding'} -> missing basis ${id}`);
          continue;
        }
        for (const primitiveId of basis.primitives || []) addPrimitive(primitiveId, score, { ...evidence, basisId: basis.id });
      }
    };
    for (const node of nodes) expand(node.groundingIds, 0.72 + Math.min(0.18, node.score * 0.12), {
      id: node.id,
      cardId: node.cardId,
      source: 'surface-node',
      phrase: node.sourceSpan.text,
    });
    for (const relationRow of relations) expand(relationRow.groundingIds, 0.66, {
      id: relationRow.id,
      source: 'surface-relation',
      phrase: relationRow.type,
    });
    for (const eventRow of events) expand(eventRow.groundingIds, 0.78, {
      id: eventRow.id,
      source: 'surface-event',
      phrase: eventRow.type,
    });
    const groundedPrimitives = Array.from(primitiveScores.entries())
      .map(([primitiveId, score]) => ({
        primitiveId,
        score: Number(score.toFixed(4)),
        source: 'semantic-surface-grounding',
        evidence: (evidenceByPrimitive.get(primitiveId) || []).slice(0, 6),
      }))
      .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId));
    const openComponents = nodes.map((node, index) => surfaceOpenComponent(node, index, relations, events, basisById));
    return { groundedPrimitives, openComponents, unresolved: uniqueList(unresolved).slice(0, 12) };
  }

  function surfaceOpenComponent(node, index, relations, events, basisById) {
    const phrase = node.sourceSpan.text || node.label;
    const visualRegime = visualRegimeForSurfaceNode(node);
    const assembly = assemblyForSurfaceNode(node);
    const material = node.materialHints[0] || materialForText(phrase, visualRegime);
    const basisIds = node.groundingIds.filter((id) => basisById.has(id));
    const basisParts = uniqueList(basisIds.flatMap((id) => (basisById.get(id).parts || []))).slice(0, 10);
    const id = `surface-${slug(node.id)}`;
    return {
      id,
      type: assembly,
      role: `generated ${node.type} ${node.label}: ${node.classHints.join(' ') || phrase}`,
      layer: 'component',
      domains: domainsForSurfaceNode(node, visualRegime),
      material,
      visualRegime,
      assembly,
      phrase,
      params: {
        ...paramsForVisual(visualRegime, assembly, index),
        semanticScale: scaleValue(node.scaleHints[0]),
        relationCount: relations.filter((relationRow) => relationRow.from === node.id || relationRow.to === node.id).length,
        eventCount: events.filter((eventRow) => (eventRow.participants || []).includes(node.id)).length,
      },
      controls: controlsForVisual(visualRegime, assembly),
      score: Number((0.66 + Math.min(0.18, node.score * 0.12)).toFixed(4)),
      source: 'semantic-surface-grounder',
      index: node.sourceSpan.index,
      cardId: node.cardId,
      grounding: {
        schema: 'simulatte.surfaceGrounding.v1',
        basisIds,
        parts: basisParts,
        slots: node.slots,
      },
      primitiveProgram: buildPrimitiveProgram({
        id,
        phrase,
        visualRegime,
        assembly,
        material,
        seed: index + node.sourceSpan.index,
      }),
    };
  }

  function mergeOpenComponents(primary, secondary, limit) {
    const out = [];
    const seen = new Set();
    for (const component of [...(primary || []), ...(secondary || [])]) {
      if (!component || !component.id || seen.has(component.id)) continue;
      seen.add(component.id);
      out.push(component);
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || Number(a.index || 0) - Number(b.index || 0));
  }

  function nearestContainer(entity, nodes) {
    const candidates = nodes.filter((node) => node.id !== entity.id && (
      node.affordanceHints.includes('contains') ||
      node.classHints.includes('container') ||
      node.classHints.includes('rotating_apparatus') ||
      node.groundingIds.includes('ground.containment')
    ));
    if (!candidates.length) return null;
    return candidates
      .map((node) => ({ node, distance: Math.abs((node.sourceSpan.index || 0) - (entity.sourceSpan.index || 0)) }))
      .sort((a, b) => a.distance - b.distance || a.node.id.localeCompare(b.node.id))[0].node;
  }

  function nearestPair(nodes) {
    if (nodes.length < 2) return null;
    const sorted = nodes.slice().sort((a, b) => a.sourceSpan.index - b.sourceSpan.index);
    return [sorted[0], sorted[1]];
  }

  function collisionParticipants(nodes) {
    const apparatus = nodes.filter((node) => (
      node.classHints.includes('rotating_apparatus') ||
      node.classHints.includes('wheeled_vehicle') ||
      node.groundingIds.includes('ground.rotating-apparatus')
    ));
    if (apparatus.length >= 2) return apparatus;
    const bodies = nodes.filter((node) => node.type === 'entity' || node.groundingIds.some((id) => /body|vehicle|apparatus/.test(id)));
    return bodies.length >= 2 ? bodies : nodes;
  }

  function uniqueRelations(relations) {
    const seen = new Set();
    return relations.filter((relationRow) => {
      const key = `${relationRow.type}:${relationRow.from}:${relationRow.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function visualRegimeForSurfaceNode(node) {
    const text = [
      node.label,
      node.classHints.join(' '),
      node.materialHints.join(' '),
      node.behaviorHints.join(' '),
      node.groundingIds.join(' '),
    ].join(' ');
    const visual = visualRegimeForText(text);
    if (visual !== 'generic') return visual;
    if (node.type === 'entity' && (node.classHints.includes('small_mammal') || node.classHints.includes('plant'))) return 'biological';
    if (node.classHints.some((item) => /vehicle|machine|apparatus|rotating/.test(item))) return 'magnetic';
    if (node.classHints.some((item) => /environment|terrain/.test(item))) return 'granular';
    return 'generic';
  }

  function assemblyForSurfaceNode(node) {
    if (node.type === 'environment') return 'field';
    if (node.type === 'event') return 'reaction';
    if (node.type === 'relation') return 'constraint';
    if (node.classHints.some((item) => /network|queue/.test(item))) return 'network';
    if (node.classHints.some((item) => /machine|vehicle|apparatus|wheel|rotating/.test(item))) return 'mechanism';
    if (node.classHints.some((item) => /fluid|vessel|channel/.test(item))) return 'flow';
    return 'material';
  }

  function domainsForSurfaceNode(node, visual) {
    return uniqueList([
      visual,
      node.type,
      ...node.classHints.map((item) => item.replace(/_/g, '-')),
      ...node.materialHints,
      ...node.behaviorHints.map((item) => item.replace(/_/g, '-')),
    ].filter(Boolean));
  }

  function domainsForCard(card) {
    return uniqueList([
      card.type,
      ...((card.classHints || []).map((item) => item.replace(/_/g, '-'))),
      ...((card.materialHints || []).map((item) => item.replace(/_/g, '-'))),
      ...((card.behaviorHints || []).map((item) => item.replace(/_/g, '-'))),
      ...((card.eventHints || []).map((item) => item.replace(/_/g, '-'))),
      ...((card.relationHints || []).map((item) => item.replace(/_/g, '-'))),
      ...((card.physics || []).map((item) => item.replace(/_/g, '-'))),
    ].filter(Boolean));
  }

  function cardCuration(id, type, labels = [], hints = {}) {
    const labelScores = (labels || []).map(labelSpecificity);
    const specificity = labelScores.length ? Math.max(...labelScores) : 0.35;
    const primarySpecificity = labels.length ? labelSpecificity(labels[0]) : specificity;
    const groundingDepth = uniqueList([
      ...(hints.classHints || []),
      ...(hints.shapeHints || []),
      ...(hints.partHints || []),
      ...(hints.materialHints || []),
      ...(hints.behaviorHints || []),
      ...(hints.affordanceHints || []),
      ...(hints.relationHints || []),
      ...(hints.eventHints || []),
      ...(hints.groundingIds || []),
    ]).length;
    const generic = primarySpecificity < 0.42 || /\b(class|system|thing|object|world|field)\b/.test(String(id || ''));
    const groundingScore = clamp(groundingDepth / 12, 0, 1);
    const typeWeight = type === 'relation' || type === 'event' ? 0.74 : type === 'environment' ? 0.8 : 0.88;
    const priority = clamp(specificity * 0.58 + groundingScore * 0.3 + typeWeight * 0.12 - (generic ? 0.14 : 0), 0, 1);
    return Object.freeze({
      schema: 'simulatte.semanticCardCuration.v1',
      specificity: Number(specificity.toFixed(4)),
      primarySpecificity: Number(primarySpecificity.toFixed(4)),
      groundingDepth,
      generic,
      priority: Number(priority.toFixed(4)),
    });
  }

  function labelSpecificity(label) {
    const value = String(label || '').toLowerCase().trim();
    if (!value) return 0;
    const genericLabels = new Set(['in', 'on', 'at', 'to', 'with', 'world', 'field', 'plant', 'plants', 'wheel', 'rim', 'cell', 'sun']);
    if (genericLabels.has(value)) return 0.16;
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length >= 3) return 0.96;
    if (words.length === 2) return 0.82;
    if (value.length >= 9) return 0.74;
    if (value.length >= 5) return 0.58;
    if (value.length >= 3) return 0.52;
    return 0.28;
  }

  function promptTypeFit(prompt, type) {
    const lower = String(prompt || '').toLowerCase();
    if (type === 'event') return /\b(crash|collid|impact|flow|heat|cool|burn|grow|erod|wave|explode|spin|roll)\b/.test(lower) ? 1 : 0;
    if (type === 'relation') return /\b(inside|within|through|across|around|attached|connected|push|pull|drive|power)\b/.test(lower) ? 1 : 0;
    if (type === 'environment') return /\b(in|near|at|inside|environment|storm|forest|city|lab|desert|ocean|space|room|field)\b/.test(lower) ? 0.7 : 0;
    return 0.5;
  }

  function directLabelMatch(prompt, labels = []) {
    const lower = String(prompt || '').toLowerCase();
    let best = 0;
    for (const label of labels || []) {
      const normalized = String(label || '').toLowerCase().trim();
      if (!normalized) continue;
      const pattern = new RegExp(`\\b${escapeRegExp(normalized).replace(/\\s+/g, '\\s+')}\\b`);
      if (pattern.test(lower)) best = Math.max(best, Math.min(1, 0.52 + labelSpecificity(normalized) * 0.38));
    }
    return best;
  }

  function scaleValue(scale) {
    const values = { tiny: 0.18, small: 0.32, medium: 0.5, human: 0.58, large: 0.78 };
    return values[scale] || 0.5;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function extractOpenComponents(prompt, retrieved) {
    const tokens = tokensWithPositions(prompt);
    const phrases = [];
    for (let i = 0; i < tokens.length; i += 1) {
      for (let width = 3; width >= 1; width -= 1) {
        const span = tokens.slice(i, i + width);
        if (span.length !== width || span.some((token) => STOPS.has(token.root))) continue;
        const phrase = span.map((token) => token.value).join(' ');
        const classified = classifyOpenPhrase(phrase, retrieved);
        if (!classified) continue;
        phrases.push({ phrase, index: tokens[i].index, ...classified });
        i += width - 1;
        break;
      }
    }
    const seen = new Set();
    return phrases
      .filter((item) => {
        const key = `${item.assembly}:${item.phrase}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item, index) => openComponent(item, index))
      .sort((a, b) => b.score - a.score || a.index - b.index);
  }

  function classifyOpenPhrase(phrase, retrieved) {
    const roots = tokens(phrase);
    if (!roots.length) return null;
    const visual = visualRegimeForText(phrase);
    const assembly = assemblyForText(phrase);
    const domainBoost = retrieved.some((doc) => (doc.domains || []).includes(visual));
    const head = roots[roots.length - 1];
    if (!domainBoost && assembly === 'sample' && roots.length < 2 && !knownPhysicalToken(head)) return null;
    return {
      assembly,
      visualRegime: visual,
      domains: domainsForVisual(visual, phrase),
      material: materialForText(phrase, visual),
      layer: layerForAssembly(assembly, visual),
      score: Number((0.48 + Math.min(0.28, roots.length * 0.07) + (domainBoost ? 0.12 : 0)).toFixed(4)),
    };
  }

  function openComponent(item, index) {
    const id = `open-${slug(item.phrase)}-${index + 1}`;
    const controls = controlsForVisual(item.visualRegime, item.assembly);
    return {
      id,
      type: item.assembly,
      role: `prompt-derived ${item.visualRegime} primitive: ${item.phrase}`,
      layer: item.layer,
      domains: item.domains,
      material: item.material,
      visualRegime: item.visualRegime,
      assembly: item.assembly,
      phrase: item.phrase,
      params: paramsForVisual(item.visualRegime, item.assembly, index),
      controls,
      score: item.score,
      source: 'open-semantic-rag',
      index: item.index,
      primitiveProgram: buildPrimitiveProgram({
        id,
        phrase: item.phrase,
        visualRegime: item.visualRegime,
        assembly: item.assembly,
        material: item.material,
        seed: index + item.index,
      }),
    };
  }

  function buildPrimitiveProgram(input) {
    const seed = hashString(`${input.assembly}:${input.phrase}:${input.seed || 0}`);
    const visual = input.visualRegime || visualRegimeForText(input.phrase);
    const parts = programPartsForVisual(visual, input.assembly, seed);
    return {
      schema: 'simulatte.primitiveProgram.v1',
      source: 'grid-style-open-semantic-program',
      shapeKey: `sp_${seed.toString(16).padStart(8, '0')}`,
      phrase: input.phrase,
      assembly: input.assembly,
      visualRegime: visual,
      material: input.material || materialForText(input.phrase, visual),
      parts,
      provenance: {
        promptPhrase: input.phrase,
        tokenHash: seed >>> 0,
      },
    };
  }

  function programPartsForVisual(visual, assembly, seed) {
    const wobble = (seed % 5) * 0.03;
    const common = [{ kind: 'field-line', count: 4 + (seed % 5), alpha: 0.08 + wobble }];
    if (visual === 'fluid') return [
      { kind: 'stream', count: 8, alpha: 0.14, drift: 0.42 },
      { kind: 'droplet', count: 32, alpha: 0.12, drift: 0.58 },
      { kind: 'ripple', count: 7, alpha: 0.1 },
    ];
    if (visual === 'thermal') return [
      { kind: 'plume', count: 14, alpha: 0.13, drift: 0.74 },
      { kind: 'spark', count: 28, alpha: 0.18, drift: 0.8 },
      { kind: 'field-line', count: 5, alpha: 0.06 },
    ];
    if (visual === 'optical') return [
      { kind: 'spectral-ray', count: 9, alpha: 0.22, drift: 0.2 },
      { kind: 'caustic', count: 8, alpha: 0.12 },
      { kind: 'particle', count: 18, alpha: 0.09 },
    ];
    if (visual === 'magnetic') return [
      { kind: 'flux-loop', count: 12, alpha: 0.12 },
      { kind: 'ring', count: assembly === 'mechanism' ? 8 : 5, alpha: 0.1 },
      { kind: 'particle', count: 20, alpha: 0.1 },
    ];
    if (visual === 'electrical') return [
      { kind: 'arc', count: 10, alpha: 0.15 },
      { kind: 'pulse', count: 16, alpha: 0.13 },
      { kind: 'spectral-ray', count: 5, alpha: 0.1 },
    ];
    if (visual === 'biological') return [
      { kind: 'branch', count: 11, alpha: 0.14, drift: 0.22 },
      { kind: 'cell', count: 24, alpha: 0.1 },
      { kind: 'membrane', count: 5, alpha: 0.08 },
    ];
    if (visual === 'soft') return [
      { kind: 'membrane', count: 10, alpha: 0.13 },
      { kind: 'ripple', count: 8, alpha: 0.09 },
      { kind: 'droplet', count: 18, alpha: 0.07 },
    ];
    if (visual === 'granular') return [
      { kind: 'strata', count: 9, alpha: 0.12 },
      { kind: 'grain', count: 42, alpha: 0.1 },
      { kind: 'stream', count: 4, alpha: 0.06 },
    ];
    if (visual === 'atomic') return [
      { kind: 'orbital', count: 8, alpha: 0.14 },
      { kind: 'lattice', count: 28, alpha: 0.1 },
      { kind: 'particle', count: 20, alpha: 0.1 },
    ];
    if (visual === 'acoustic') return [
      { kind: 'wavefront', count: 12, alpha: 0.11 },
      { kind: 'ripple', count: 8, alpha: 0.09 },
      { kind: 'pulse', count: 10, alpha: 0.08 },
    ];
    if (visual === 'phase') return [
      { kind: 'phase-band', count: 9, alpha: 0.12 },
      { kind: 'droplet', count: 16, alpha: 0.08 },
      { kind: 'membrane', count: 5, alpha: 0.08 },
    ];
    if (visual === 'network') return [
      { kind: 'network-thread', count: 12, alpha: 0.12 },
      { kind: 'pulse', count: 18, alpha: 0.1 },
      { kind: 'particle', count: 14, alpha: 0.08 },
    ];
    return common.concat([{ kind: 'particle', count: 18, alpha: 0.08 }]);
  }

  function buildSemanticFeatureVector(text, dim = FEATURE_DIM) {
    const out = new Float32Array(dim);
    const roots = tokens(text);
    for (const token of roots) {
      addFeature(out, `w:${token}`, 1);
      addCharNgrams(out, token);
    }
    for (let i = 0; i < roots.length - 1; i += 1) {
      addFeature(out, `b:${roots[i]}_${roots[i + 1]}`, 1.35);
    }
    return normalizeDense(out);
  }

  function tokens(text) {
    const out = [];
    const lower = String(text || '').toLowerCase();
    let match;
    while ((match = TOKEN_RE.exec(lower))) {
      const token = normalizeToken(match[0]);
      if (!token || STOPS.has(token)) continue;
      out.push(token);
      const syn = TOKEN_SYNONYMS && TOKEN_SYNONYMS[token];
      if (Array.isArray(syn)) for (const item of syn) out.push(normalizeToken(item));
    }
    return uniqueList(out);
  }

  function tokensWithPositions(text) {
    const out = [];
    const lower = String(text || '').toLowerCase();
    let match;
    while ((match = TOKEN_RE.exec(lower))) {
      const value = match[0].replace(/'/g, '');
      const root = normalizeToken(value);
      if (!root) continue;
      out.push({ value, root, index: match.index, end: match.index + match[0].length });
    }
    return out;
  }

  function visualRegimeForText(text) {
    const roots = new Set(tokens(text));
    for (const item of VISUAL_RULES) {
      if ([...roots].some((token) => item.words.has(token))) return item.id;
    }
    return 'generic';
  }

  function assemblyForText(text) {
    const roots = new Set(tokens(text));
    for (const item of ASSEMBLY_RULES) {
      if ([...roots].some((token) => item.words.has(token) || token.endsWith(item.id))) return item.id;
    }
    return 'sample';
  }

  function materialForText(text, visual) {
    const lower = String(text || '').toLowerCase();
    const pairs = [
      ['brine', /brine/], ['mercury', /mercury/], ['copper', /copper/],
      ['silicon', /silicon/], ['carbon', /carbon|graphite/], ['gel', /gel/],
      ['foam', /foam|bubble/], ['membrane', /membrane/], ['glass', /glass|lens|prism/],
      ['water', /water|river|flow|droplet/], ['fire', /fire|flame|combust|plasma|heat/],
      ['magnet', /magnet|flux/], ['metal', /metal|wheel|rotor|motor/],
      ['sand', /sand|grain|sediment/], ['soil', /soil|terrain/], ['rock', /rock|crystal/],
      ['wood', /wood|biomass/], ['bacteria', /bacteria|cell|colony/], ['mycelium', /mycelium|fungal/],
    ];
    for (const [material, pattern] of pairs) if (pattern.test(lower)) return material;
    const defaults = {
      fluid: 'water',
      thermal: 'fire',
      optical: 'glass',
      magnetic: 'magnet',
      electrical: 'copper',
      granular: 'sand',
      biological: 'bacteria',
      soft: 'membrane',
      atomic: 'carbon',
    };
    return defaults[visual] || 'light';
  }

  function domainsForVisual(visual, text) {
    const domains = [visual];
    const lower = String(text || '').toLowerCase();
    if (/heat|sun|thermal|fire/.test(lower)) domains.push('thermal');
    if (/water|flow|river|fluid/.test(lower)) domains.push('fluid');
    if (/magnet|motor|wheel|rotor/.test(lower)) domains.push('mechanics', 'electromagnetism');
    if (/lens|light|prism|glass/.test(lower)) domains.push('optics');
    if (/cell|bacteria|growth|fungal/.test(lower)) domains.push('biology');
    if (/logistics|supply|warehouse|transport/.test(lower)) domains.push('logistics');
    if (/market|demand|queue|backlog|traffic/.test(lower)) domains.push('queue', 'operations');
    if (/sensor|feedback|control|controller/.test(lower)) domains.push('control', 'signal');
    if (/data|audit|trace|ledger/.test(lower)) domains.push('data', 'audit');
    return uniqueList(domains.filter(Boolean));
  }

  function layerForAssembly(assembly, visual) {
    if (assembly === 'material' || ['soft', 'granular', 'atomic'].includes(visual)) return 'material';
    if (assembly === 'field' || ['magnetic', 'electrical', 'acoustic'].includes(visual)) return 'physics';
    if (assembly === 'network') return 'math';
    return 'component';
  }

  function controlsForVisual(visual, assembly) {
    const controls = {
      fluid: ['flowRate', 'viscosity', 'pressure'],
      thermal: ['heatTransfer', 'combustibility', 'thermalFlux'],
      optical: ['lightIntensity', 'refractiveIndex', 'opacity'],
      magnetic: ['magneticStrength', 'fieldStrength', 'driveTiming'],
      electrical: ['electricField', 'charge', 'conductivity'],
      granular: ['granularFriction', 'terrainSlope', 'erosionRate'],
      biological: ['populationGrowth', 'infectionRate', 'diffusionA'],
      soft: ['membraneTension', 'pressure', 'damping'],
      acoustic: ['soundFrequency', 'waveAmplitude', 'pressure'],
      phase: ['phaseThreshold', 'latentHeat', 'heatTransfer'],
      atomic: ['atomicMass', 'bondStrength', 'ionization'],
      network: ['queueBacklog', 'serviceRate', 'networkLatency'],
    };
    return uniqueList([...(controls[visual] || []), ...(assembly === 'source' ? ['energyInput'] : [])]);
  }

  function paramsForVisual(visual, assembly, index) {
    const n = hashNoise(index + 31, String(visual).length + String(assembly).length);
    const base = { complexity: 0.42 + n * 0.22 };
    if (visual === 'fluid') return { ...base, flowRate: 0.36 + n * 0.48, viscosity: 0.08 + n * 0.3 };
    if (visual === 'thermal') return { ...base, heatTransfer: 0.42 + n * 0.44, combustibility: 0.34 + n * 0.5 };
    if (visual === 'optical') return { ...base, lightIntensity: 0.52 + n * 0.42, refractiveIndex: 1.18 + n * 0.58 };
    if (visual === 'magnetic') return { ...base, magneticStrength: 0.46 + n * 0.62, fieldStrength: 0.38 + n * 0.44 };
    if (visual === 'electrical') return { ...base, charge: -0.4 + n * 0.9, electricField: 0.32 + n * 0.52 };
    if (visual === 'granular') return { ...base, granularFriction: 0.28 + n * 0.5, erosionRate: 0.18 + n * 0.44 };
    if (visual === 'biological') return { ...base, populationGrowth: 0.24 + n * 0.56, infectionRate: 0.08 + n * 0.42 };
    if (visual === 'soft') return { ...base, membraneTension: 0.28 + n * 0.64, pressure: 0.22 + n * 0.52 };
    if (visual === 'acoustic') return { ...base, soundFrequency: 0.16 + n * 0.9, waveAmplitude: 0.16 + n * 0.68 };
    if (visual === 'phase') return { ...base, phaseThreshold: 0.28 + n * 0.54, latentHeat: 0.22 + n * 0.56 };
    if (visual === 'atomic') return { ...base, atomicMass: 8 + Math.round(n * 80), bondStrength: 0.26 + n * 0.62 };
    return base;
  }

  function dominantDomains(retrieved, openComponents) {
    const totals = new Map();
    for (const doc of retrieved || []) for (const domain of doc.domains || []) {
      totals.set(domain, (totals.get(domain) || 0) + doc.score);
    }
    for (const component of openComponents || []) for (const domain of component.domains || []) {
      totals.set(domain, (totals.get(domain) || 0) + component.score);
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id, score]) => ({ id, score: Number(score.toFixed(4)) }))
      .slice(0, 18);
  }

  function matchedTerms(a, b) {
    const bTokens = new Set(tokens(b));
    return tokens(a).filter((token) => bTokens.has(token));
  }

  function lexicalOverlap(a, b) {
    const query = tokens(a);
    if (!query.length) return 0;
    const doc = new Set(tokens(b));
    return query.filter((token) => doc.has(token)).length / query.length;
  }

  function knownPhysicalToken(token) {
    return VISUAL_RULES.some((item) => item.words.has(token)) || ASSEMBLY_RULES.some((item) => item.words.has(token));
  }

  function addFeature(out, feature, value = 1) {
    const hash = hashString(feature);
    const sign = hash & 0x80000000 ? -1 : 1;
    out[hash % out.length] += value * sign;
  }

  function addCharNgrams(out, token) {
    const padded = `^${token}$`;
    for (let n = 3; n <= 4; n += 1) {
      if (padded.length < n) continue;
      for (let i = 0; i <= padded.length - n; i += 1) {
        addFeature(out, `c${n}:${padded.slice(i, i + n)}`, 0.42);
      }
    }
  }

  function normalizeDense(out) {
    let norm = 0;
    for (let i = 0; i < out.length; i += 1) norm += out[i] * out[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < out.length; i += 1) out[i] /= norm;
    return out;
  }

  function cosineDense(a, b) {
    let score = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) score += a[i] * b[i];
    return Math.max(0, score);
  }

  function normalizeToken(token) {
    let out = String(token || '').toLowerCase().replace(/'/g, '').replace(/[^a-z0-9-]/g, '');
    if (out.endsWith('ies') && out.length > 4) out = `${out.slice(0, -3)}y`;
    else if (/(ches|shes|xes|zes|sses)$/.test(out) && out.length > 5) out = out.slice(0, -2);
    else if (out.endsWith('s') && out.length > 3 && !/(ss|us|is)$/.test(out)) out = out.slice(0, -1);
    return out;
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < String(str).length; i += 1) {
      h ^= String(str).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function slug(value) {
    return String(value || 'primitive')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'primitive';
  }

  return {
    FEATURE_DIM,
    GROUNDING_BASIS_CARDS,
    SEMANTIC_RAG_SCHEMA,
    SEMANTIC_SURFACE_CARDS,
    SYNTH_GRAPH_SCHEMA,
    buildPrimitiveProgram,
    buildSemanticFeatureVector,
    createSemanticRag,
  };
});
