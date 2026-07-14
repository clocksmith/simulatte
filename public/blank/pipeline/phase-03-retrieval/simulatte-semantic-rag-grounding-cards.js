(function attachSimulatteSemanticRaggroundingcards(root) {
  const scope = root.__SimulatteSemanticRagRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const STOPS = new Set([
        'a', 'an', 'and', 'are', 'as', 'be', 'build', 'by', 'create', 'for', 'from',
        'in', 'into', 'is', 'make', 'of', 'on', 'or', 'simulate', 'simulation',
        'the', 'to', 'with', 'world', 'that', 'this', 'these', 'those', 'there',
        'more', 'very', 'exactly', 'like', 'should', 'use', 'using',
      ]);

    const VISUAL_RULES = Object.freeze([
        rule('fluid', ['water', 'river', 'flow', 'fluid', 'vortex', 'brine', 'mercury', 'air', 'wind', 'bubble', 'droplet']),
        rule('electrical', ['electric', 'charge', 'electron', 'ion', 'current', 'copper', 'silicon', 'circuit', 'qubit', 'quantum', 'microwave', 'resonator', 'readout']),
        rule('thermal', ['fire', 'flame', 'combustion', 'heat', 'thermal', 'smoke', 'plume', 'plasma', 'sun']),
        rule('optical', ['light', 'laser', 'lens', 'glass', 'prism', 'mirror', 'caustic', 'ray', 'spectrum']),
        rule('magnetic', ['magnet', 'magnetic', 'flux', 'field', 'rotor', 'wheel', 'motor', 'stator']),
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
        surfaceCard('entity.root-system', 'entity', ['tree root', 'root network', 'roots', 'mangrove roots', 'mangrove'], 'branching underground plant structure interacting with soil, moisture, and erosion', {
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
        surfaceCard('artifact.excavator', 'artifact', ['excavator', 'digger', 'backhoe'], 'tracked construction vehicle with cab, articulated boom, stick, bucket, hydraulic joints, and ground contact', {
          classHints: ['wheeled_vehicle', 'articulated_machine'], shapeHints: ['tracked_chassis', 'jointed_boom'],
          partHints: ['track', 'chassis', 'cab', 'boom', 'stick', 'bucket'], materialHints: ['metal', 'glass', 'rubber'],
          behaviorHints: ['jointed_motion', 'digging'], groundingIds: ['ground.wheeled-vehicle', 'ground.articulated-machine', 'ground.lifting-machine'],
        }),
        surfaceCard('artifact.gearbox', 'artifact', ['gearbox', 'gear train', 'clockwork'], 'interlocking rotating gears with teeth, torque transfer, and constraints', {
          classHints: ['rotating_mechanism'], shapeHints: ['gear_train'], partHints: ['gear', 'axle', 'housing'],
          materialHints: ['metal'], behaviorHints: ['torque_transfer'], groundingIds: ['ground.gear-train'],
        }),
        surfaceCard('artifact.pendulum-clock', 'artifact', ['pendulum clock', 'metronome', 'pendulum'], 'oscillating mass on constraint with gravity, damping, and periodic motion', {
          classHints: ['oscillator_machine'], shapeHints: ['pendulum'], partHints: ['bob', 'rod', 'pivot'],
          materialHints: ['metal', 'wood'], behaviorHints: ['oscillates'], groundingIds: ['ground.pendulum'],
        }),
        surfaceCard('artifact.robot', 'artifact', ['robot'], 'articulated machine with torso, head, sensor eyes, jointed arms, actuators, and an anchored base', {
          classHints: ['articulated_machine'], shapeHints: ['linked_rigid_bodies'],
          partHints: ['torso', 'head', 'sensor eyes', 'jointed arms', 'actuators', 'base'],
          materialHints: ['metal', 'plastic', 'glass'], behaviorHints: ['actuated_motion'],
          groundingIds: ['ground.articulated-machine'],
        }),
        surfaceCard('artifact.robot-arm', 'artifact', ['robot arm', 'robot arms', 'warehouse robot arms', 'manipulator', 'servo arm'], 'jointed machine with rigid links, actuators, constraints, and end effector', {
          classHints: ['articulated_machine'], shapeHints: ['linked_rigid_bodies'], partHints: ['joint', 'link', 'motor'],
          materialHints: ['metal', 'copper'], behaviorHints: ['actuated_motion'], groundingIds: ['ground.articulated-machine'],
        }),
        surfaceCard('artifact.robot-gripper', 'artifact', ['robot gripper', 'gripper', 'precision gripper'], 'articulated end effector with palm, opposing fingers, joints, contact pads, and torsion control', {
          classHints: ['articulated_machine'], shapeHints: ['articulated_gripper'], partHints: ['palm frame', 'opposing fingers', 'revolute joints', 'contact pads'],
          materialHints: ['metal', 'rubber'], behaviorHints: ['grasp', 'twist'], groundingIds: ['ground.articulated-machine'],
        }),
        surfaceCard('artifact.sample-holder', 'artifact', ['sample holder', 'protein sample holder', 'specimen holder'], 'constrained specimen mount with frame, sample cavity, clamps, and rotational contact', {
          classHints: ['instrument'], shapeHints: ['specimen_frame'], partHints: ['support frame', 'sample cavity', 'clamps', 'rotation axis'],
          materialHints: ['metal', 'glass'], affordanceHints: ['contains', 'constrains'], groundingIds: ['ground.container', 'ground.instrumented-bench'],
        }),
        surfaceCard('artifact.particle-collider', 'artifact', ['particle collider', 'collider'], 'ringed beam instrument with beam pipe, interaction vertex, detector shells, and calorimeter layers', {
          classHints: ['instrument'], shapeHints: ['concentric_detector'], partHints: ['beam pipe', 'interaction vertex', 'detector rings', 'calorimeter cells'],
          materialHints: ['metal', 'silicon'], behaviorHints: ['particle_collision'], groundingIds: ['ground.instrumented-bench'],
        }),
        surfaceCard('artifact.detector-slice', 'artifact', ['detector slice', 'calorimeter'], 'sectioned particle detector with concentric tracking layers, sensor cells, and readout bands', {
          classHints: ['instrument'], shapeHints: ['sectioned_detector'], partHints: ['tracking rings', 'sensor layers', 'calorimeter cells', 'readout panel'],
          materialHints: ['silicon', 'metal', 'glass'], behaviorHints: ['measurement'], groundingIds: ['ground.instrumented-bench'],
        }),
        surfaceCard('entity.muon-tracks', 'entity', ['muon tracks', 'particle tracks'], 'curved charged-particle trajectories crossing detector layers from a collision vertex', {
          classHints: ['particle_path'], shapeHints: ['curved_tracks'], partHints: ['collision vertex', 'track arcs', 'detector crossings'],
          materialHints: ['light'], behaviorHints: ['charged_particle_motion'], groundingIds: ['ground.instrumented-bench'],
        }),
        surfaceCard('artifact.conveyor', 'artifact', ['conveyor belt', 'conveyor belts', 'belt line'], 'moving belt carrying objects with friction, rollers, and transport flow', {
          classHints: ['transport_machine'], shapeHints: ['belt_loop'], partHints: ['belt', 'roller', 'motor'],
          materialHints: ['rubber', 'metal'], behaviorHints: ['moves_objects'], groundingIds: ['ground.conveyor'],
        }),
        surfaceCard('artifact.parcel', 'artifact', ['parcel', 'parcels', 'package', 'shipping box', 'carton'], 'sealed shipping carton with rigid faces, taped seam, label, contact base, and carried load', {
          classHints: ['package', 'container'], shapeHints: ['carton', 'rectangular_box'], partHints: ['carton body', 'top flap', 'tape seam', 'shipping label'],
          materialHints: ['cardboard', 'paper'], behaviorHints: ['carried', 'sorted', 'slides'], groundingIds: ['ground.rigid-machine', 'ground.container'],
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
        surfaceCard('entity.ocean-wave', 'entity', ['waves', 'ocean wave', 'water wave', 'sea wave', 'wave crest'], 'moving water surface with a crest, trough, foam line, propagation front, and coupled current', {
          classHints: ['fluid_surface'], shapeHints: ['wavefront', 'parallel_bands'],
          partHints: ['crest', 'trough', 'foam line', 'wavefront band'], materialHints: ['water', 'air'],
          behaviorHints: ['oscillation', 'wave_motion', 'fluid_flow'], groundingIds: ['ground.fluid-domain', 'ground.wave-event'],
        }),
        surfaceCard('entity.sea-ice', 'entity', ['sea ice', 'ice floe', 'pack ice', 'floating ice'], 'floating ice cover broken into plates with pressure ridges, crack seams, brine channels, and water contact', {
          classHints: ['cryosphere_surface'], shapeHints: ['plate_field', 'polygon_sheet'],
          partHints: ['ice floe plates', 'pressure ridge', 'crack seam', 'brine channel'],
          materialHints: ['ice', 'water', 'snow'], behaviorHints: ['fracture', 'floating', 'wave_response'],
          groundingIds: ['ground.ice-mass', 'ground.fluid-domain'],
        }),
        surfaceCard('environment.fjord', 'environment', ['fjord', 'glacial inlet', 'glacial bay'], 'narrow glacial water basin bounded by steep rock walls, shoreline, and a glacier mouth', {
          classHints: ['glacial_basin'], shapeHints: ['basin', 'corridor', 'cutaway'],
          partHints: ['water basin', 'cliff walls', 'shoreline', 'glacier mouth'],
          materialHints: ['water', 'rock', 'ice'], behaviorHints: ['containment', 'fluid_flow'],
          groundingIds: ['ground.fluid-domain', 'ground.granular-terrain'],
        }),
        surfaceCard('environment.tidal-channel', 'environment', ['tidal channels', 'tidal channel', 'estuary channel'], 'branching brackish water channels bounded by sediment banks and mangrove roots', {
          classHints: ['fluid_channel', 'estuary'], shapeHints: ['branching_flow_path', 'water_channel'],
          partHints: ['water channel', 'sediment bank', 'branch junction', 'surface ripple'],
          materialHints: ['brackish', 'water', 'sediment'], behaviorHints: ['fluid_flow', 'tidal_surge', 'sediment_transport'],
          groundingIds: ['ground.fluid-channel', 'ground.fluid-domain', 'ground.granular-terrain'],
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
        surfaceCard('environment.glacier', 'entity_class', ['glacier', 'ice sheet', 'iceberg'], 'slow moving ice mass with gravity creep, fracture, meltwater, and terrain erosion', {
          classHints: ['terrain', 'cryosphere_mass'], shapeHints: ['ice_mass', 'layered_wedge'],
          partHints: ['ice tongue', 'crevasse field', 'terminus', 'meltwater channel', 'bedrock contact'],
          materialHints: ['ice', 'water', 'rock'], behaviorHints: ['flowing', 'phase_change', 'erosion'], groundingIds: ['ground.ice-mass', 'ground.erosion-event'],
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
        surfaceCard('event.play-interaction', 'event', ['playing', 'play interaction', 'playing together'], 'articulated bodies move together through reciprocal approach, contact, chase, and pose changes', {
          eventHints: ['play_interaction'], groundingIds: ['ground.articulated-body', 'ground.collision-event'],
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
        surfaceCard('relation.above', 'relation', ['above', 'over', 'higher than'], 'vertical ordering relation where the subject stays visibly higher than the reference object', {
          relationHints: ['above'], groundingIds: ['ground.path-coupling'],
        }),
        surfaceCard('relation.beside', 'relation', ['beside', 'next to', 'alongside'], 'side-by-side spatial relation with separate silhouettes and a shared ground plane', {
          relationHints: ['beside'], groundingIds: ['ground.path-coupling'],
        }),
        surfaceCard('relation.on', 'relation', ['on', 'atop', 'resting on', 'supported by'], 'contact and support relation where one object rests visibly on another surface', {
          relationHints: ['on', 'support_contact'], groundingIds: ['ground.mechanical-joint'],
        }),
        surfaceCard('relation.with', 'relation', ['with', 'together with', 'interacting with'], 'co-interaction relation preserving both participants and their shared action', {
          relationHints: ['with', 'co_interaction'], groundingIds: ['ground.path-coupling'],
        }),
        surfaceCard('relation.holds', 'relation', ['holding', 'holds', 'grasping', 'carrying'], 'grasp relation joining an articulated limb or tool to a distinct held object', {
          relationHints: ['holding', 'grasp_contact'], groundingIds: ['ground.mechanical-joint', 'ground.force-coupling'],
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
        ...constructionTopologySurfaceCards(),
        ...UNIVERSE_SURFACE_CARDS,
      ]);

    Object.assign(scope, {
      STOPS,
      VISUAL_RULES,
      ASSEMBLY_RULES,
      UNIVERSE_SURFACE_CARDS,
      SEMANTIC_SURFACE_CARDS,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
