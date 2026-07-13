(function attachSimulatteGraphSynthesisretrieval(root) {
  const scope = root.__SimulatteGraphSynthesisRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const STOPWORDS = new Set([
        'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'into',
        'is', 'it', 'of', 'on', 'or', 'the', 'to', 'with', 'within', 'another',
        'other', 'simulate', 'simulation', 'build', 'make', 'create', 'show',
      ]);

    const BASE_SURFACE_CARD_LIBRARY = Object.freeze([
        card('mouse', 'entity', ['mouse', 'small mouse'], {
          classes: ['small_mammal', 'rodent'],
          shapes: ['capsule', 'ellipsoid'],
          materials: ['soft_tissue', 'fur'],
          behaviors: ['running_gait'],
          ports: ['contact_feet', 'body_collision'],
          primitiveIds: ['soft-body', 'collision', 'friction', 'membrane', 'protein'],
          approximation: 'small_mammal',
        }, 'small rodent mammal soft body paws tail low mass running in wheel'),
        card('gerbil', 'entity', ['gerbil', 'small gerbil', 'desert rodent'], {
          classes: ['small_mammal', 'rodent'],
          shapes: ['capsule', 'ellipsoid'],
          materials: ['soft_tissue', 'fur'],
          behaviors: ['running_gait'],
          ports: ['contact_feet', 'body_collision'],
          primitiveIds: ['soft-body', 'collision', 'friction', 'membrane', 'protein'],
          approximation: 'small_mammal',
        }, 'small desert rodent mammal soft body paws low mass running gait'),
        card('hamster', 'entity', ['hamster', 'small hamster'], {
          classes: ['small_mammal', 'rodent'],
          shapes: ['capsule', 'ellipsoid'],
          materials: ['soft_tissue', 'fur'],
          behaviors: ['running_gait'],
          ports: ['contact_feet', 'body_collision'],
          primitiveIds: ['soft-body', 'collision', 'friction', 'membrane', 'protein'],
          approximation: 'small_mammal',
        }, 'small mammal rodent running wheel soft body gait paws'),
        card('small_mammal', 'entity_class', ['small mammal', 'rodent', 'small animal'], {
          shapes: ['capsule', 'ellipsoid'],
          materials: ['soft_tissue', 'fur'],
          behaviors: ['running_gait'],
          ports: ['contact_feet', 'body_collision'],
          primitiveIds: ['soft-body', 'collision', 'friction', 'membrane', 'protein'],
          abstract: true,
        }, 'small mammal animal rodent soft articulated body limbs gait contact feet'),
        card('bird', 'entity_class', ['bird', 'flying animal'], {
          shapes: ['capsule', 'sheet'],
          materials: ['soft_tissue', 'fabric'],
          behaviors: ['flapping', 'gliding'],
          primitiveIds: ['soft-body', 'fluid-advection', 'collision', 'air'],
          abstract: true,
        }, 'bird wings feathers flight lift air soft body'),
        card('fish', 'entity_class', ['fish', 'swimming animal'], {
          shapes: ['capsule', 'spline'],
          materials: ['soft_tissue', 'water'],
          behaviors: ['swimming', 'flowing'],
          primitiveIds: ['soft-body', 'fluid-advection', 'pressure', 'water'],
          abstract: true,
        }, 'fish swimming body water fins flow pressure'),
        card('insect', 'entity_class', ['insect', 'bug'], {
          shapes: ['capsule', 'particle_set'],
          materials: ['soft_tissue'],
          behaviors: ['walking', 'swarming'],
          primitiveIds: ['rigid-body', 'collision', 'friction', 'particle-set'],
          abstract: true,
        }, 'insect bug small articulated legs swarm contact'),
        card('tree', 'entity_class', ['tree', 'plant', 'branching tree'], {
          shapes: ['branching_network', 'terrain_anchor'],
          materials: ['wood', 'biomass'],
          behaviors: ['growth'],
          primitiveIds: ['wood', 'biomass', 'growth-decay', 'diffusion'],
          abstract: true,
        }, 'tree trunk branch leaves roots growth biomass wood'),
        card('building', 'entity_class', ['building', 'room', 'structure'], {
          shapes: ['box', 'shell'],
          materials: ['concrete', 'glass', 'metal'],
          primitiveIds: ['concrete', 'glass', 'metal', 'collision', 'rigid-body'],
          abstract: true,
        }, 'building structure room wall floor window rigid shell'),
        card('vehicle', 'entity_class', ['vehicle', 'car', 'cart'], {
          shapes: ['box', 'wheel_pair'],
          materials: ['metal', 'rubber', 'plastic'],
          behaviors: ['rolling', 'steering'],
          primitiveIds: ['rigid-body', 'wheel', 'friction', 'collision', 'metal', 'rubber'],
          abstract: true,
        }, 'vehicle rolling wheeled body axle road contact'),
        card('spacecraft', 'assembly', ['spaceship', 'spacecraft', 'rocket', 'satellite'], {
          classes: ['spacecraft'],
          shapes: ['rocket_body'],
          materials: ['metal', 'glass'],
          behaviors: ['orbiting', 'thrust'],
          ports: ['gravity_well', 'thrust_axis'],
          primitiveIds: ['rigid-body', 'gravity', 'radiation', 'metal', 'vector-field', 'energy-ledger'],
        }, 'spaceship spacecraft rocket satellite orbit thrust metal shell radiation gravity'),
        card('submarine', 'assembly', ['submarine', 'submersible'], {
          classes: ['submarine'],
          shapes: ['submarine_body'],
          materials: ['metal', 'glass'],
          behaviors: ['swimming', 'diving'],
          ports: ['pressure_hull', 'flow_axis'],
          primitiveIds: ['rigid-body', 'pressure', 'water', 'fluid-advection', 'metal'],
        }, 'submarine submersible underwater pressure hull flow ballast metal'),
        card('turbine', 'assembly', ['turbine', 'turbines', 'propeller', 'propellers', 'fan turbine', 'wind turbine'], {
          classes: ['turbine'],
          parts: ['hub', 'blades', 'shaft'],
          shapes: ['turbine'],
          materials: ['metal', 'copper'],
          behaviors: ['rotation', 'pumping'],
          primitiveIds: ['fan', 'motor', 'generator', 'metal', 'fluid-advection', 'energy-ledger'],
        }, 'turbine propeller fan blades rotating shaft flow generator motor'),
        card('piano', 'assembly', ['piano', 'keyboard'], {
          classes: ['instrument'],
          parts: ['keys', 'strings', 'soundboard'],
          shapes: ['instrument_body'],
          materials: ['wood', 'metal'],
          behaviors: ['acoustic_resonance'],
          primitiveIds: ['wave-source', 'oscillator', 'wood', 'metal', 'energy-ledger'],
        }, 'piano keyboard strings soundboard acoustic resonance wooden instrument'),
        card('castle', 'assembly', ['castle', 'ice castle', 'crystal tower', 'crystal towers', 'tower'], {
          classes: ['castle'],
          parts: ['wall', 'tower', 'facets'],
          shapes: ['castle', 'tower'],
          materials: ['ice', 'glass', 'quartz'],
          primitiveIds: ['ice', 'glass', 'crystal-lattice', 'collision', 'surface-boundary'],
        }, 'castle ice castle crystal tower faceted walls brittle transparent mineral'),
        card('hamster_wheel', 'assembly', ['hamster wheel', 'running wheel', 'exercise wheel'], {
          parts: ['rim', 'spokes', 'axle', 'support_frame', 'contact_track'],
          constraints: ['revolute_axle', 'bearing'],
          shapes: ['ring', 'track_loop'],
          materials: ['metal', 'plastic', 'rubber'],
          ports: ['inside_volume', 'contact_track', 'axle_torque'],
          primitiveIds: ['wheel', 'rigid-body', 'collision', 'friction', 'metal', 'rubber', 'constraint'],
        }, 'hamster wheel exercise wheel circular rim spokes axle support frame running track'),
        card('rotating_apparatus', 'assembly_class', ['rotating apparatus', 'rotating machine'], {
          parts: ['rim', 'axle', 'support_frame'],
          constraints: ['revolute_axle'],
          shapes: ['ring'],
          materials: ['metal', 'rubber'],
          ports: ['torque_in', 'torque_out', 'contact_surface'],
          primitiveIds: ['wheel', 'rigid-body', 'collision', 'friction', 'metal'],
          abstract: true,
        }, 'rotating apparatus wheel axle bearing rotor support track'),
        card('shopping_cart', 'assembly', ['shopping cart', 'cart'], {
          parts: ['basket', 'wheel_set', 'handle', 'frame'],
          constraints: ['axle', 'contact_surface'],
          primitiveIds: ['rigid-body', 'wheel', 'metal', 'friction', 'collision'],
        }, 'shopping cart basket wheels handle frame rolling collision'),
        card('bicycle', 'assembly', ['bicycle', 'bike'], {
          parts: ['wheel_set', 'frame', 'handlebar', 'chain'],
          constraints: ['axle', 'hinge'],
          primitiveIds: ['wheel', 'rigid-body', 'metal', 'rubber', 'friction'],
        }, 'bicycle bike two wheels frame chain steering rolling'),
        card('pipe_loop', 'assembly', ['pipe loop', 'water loop', 'cooling loop'], {
          parts: ['pipe', 'pump', 'valve', 'cooler'],
          constraints: ['fluid_boundary'],
          primitiveIds: ['pipe', 'pump', 'valve', 'cooler', 'water', 'fluid-advection', 'pressure'],
        }, 'pipe loop water cooling pump valve flow pressure'),
        card('lens_array', 'assembly', ['lens array', 'solar condenser', 'condenser'], {
          parts: ['lens', 'mirror', 'sun_lamp', 'absorber'],
          primitiveIds: ['lens', 'mirror', 'sun-lamp', 'glass', 'optics', 'radiation', 'heat-transfer'],
        }, 'solar condenser lens array mirror focus radiation heat absorber'),
        card('magnetic_rotor', 'assembly', ['magnetic rotor', 'rotor', 'magnetic wheel'], {
          parts: ['wheel', 'magnet', 'motor', 'sensor'],
          constraints: ['axle', 'bearing'],
          primitiveIds: ['wheel', 'magnet', 'motor', 'magnetized-metal', 'magnetism', 'rigid-body'],
        }, 'magnetic rotor wheel magnets motor axle torque field'),
        card('container', 'assembly_class', ['container', 'vessel', 'tank', 'cage'], {
          parts: ['shell', 'boundary', 'inside_volume'],
          constraints: ['containment', 'contact_surface'],
          primitiveIds: ['surface-boundary', 'collision', 'pressure', 'rigid-body'],
          abstract: true,
        }, 'container vessel cage tank shell boundary contains inside volume'),
        card('capsule', 'shape', ['capsule', 'rounded body'], {
          primitiveIds: ['rigid-body', 'soft-body', 'collision'],
        }, 'capsule rounded body cylinder with hemispherical ends collision shell'),
        card('ellipsoid', 'shape', ['ellipsoid', 'oval', 'head shape'], {
          primitiveIds: ['rigid-body', 'collision'],
        }, 'ellipsoid oval sphere stretched body head volume'),
        card('ring', 'shape', ['ring', 'rim', 'circle rim'], {
          primitiveIds: ['rigid-body', 'collision', 'constraint'],
        }, 'ring circular rim wheel hoop rotation'),
        card('track_loop', 'shape', ['track', 'running track', 'loop track'], {
          primitiveIds: ['surface-boundary', 'friction', 'collision'],
        }, 'loop track contact surface path ring interior running surface'),
        card('box', 'shape', ['box', 'rectangular body'], {
          primitiveIds: ['rigid-body', 'collision'],
        }, 'box cuboid rectangular rigid body volume'),
        card('tube', 'shape', ['tube', 'pipe shape'], {
          primitiveIds: ['pressure', 'fluid-advection', 'surface-boundary'],
        }, 'tube pipe cylinder hollow flow boundary'),
        card('sheet', 'shape', ['sheet', 'membrane sheet'], {
          primitiveIds: ['soft-body', 'membrane', 'surface-boundary'],
        }, 'sheet membrane cloth surface thin deforming'),
        card('branching_network', 'shape', ['branching network', 'roots', 'veins'], {
          primitiveIds: ['graph-network', 'growth-decay', 'fluid-advection'],
        }, 'branching network roots veins tree vascular graph'),
        card('terrain', 'shape', ['terrain', 'ground', 'landscape'], {
          primitiveIds: ['grid-heightfield', 'terrain-patch', 'soil', 'rock', 'sand'],
        }, 'terrain ground heightfield slope surface landscape'),
        card('soft_tissue', 'material', ['soft tissue', 'flesh', 'muscle'], {
          primitiveIds: ['protein', 'membrane', 'gel', 'soft-body'],
        }, 'soft tissue biological flesh muscle protein gel membrane'),
        card('fur', 'material', ['fur', 'hair'], {
          primitiveIds: ['protein', 'fabric', 'soft-body'],
        }, 'fur hair fibers soft biological insulation'),
        card('plastic', 'material', ['plastic', 'polymer'], {
          primitiveIds: ['plastic', 'collision', 'heat-transfer'],
        }, 'plastic polymer lightweight shell solid'),
        card('steel', 'material', ['steel', 'metal'], {
          primitiveIds: ['metal', 'collision', 'heat-transfer'],
        }, 'steel metal rigid conductor dense frame'),
        card('rubber_material', 'material', ['rubber', 'tire rubber'], {
          primitiveIds: ['rubber', 'friction', 'elasticity'],
        }, 'rubber tire elastic high friction damping'),
        card('glass_material', 'material', ['glass', 'transparent glass'], {
          materials: ['glass'],
          primitiveIds: ['glass', 'optics', 'collision'],
        }, 'glass transparent refractive brittle lens'),
        card('ferrofluid', 'material', ['ferrofluid', 'magnetic fluid'], {
          classes: ['magnetic_fluid'],
          shapes: ['fluid_volume'],
          materials: ['ferrofluid', 'metal', 'oil'],
          behaviors: ['magnetizes', 'spikes'],
          primitiveIds: ['magnetism', 'fluid-advection', 'magnetized-metal', 'particle-set'],
        }, 'ferrofluid magnetic liquid black spikes field responsive suspended metal particles'),
        card('lava_material', 'material', ['lava', 'magma'], {
          classes: ['molten_rock'],
          shapes: ['lava_flow'],
          materials: ['lava', 'rock', 'fire'],
          behaviors: ['flowing', 'heating'],
          primitiveIds: ['rock', 'fire', 'heat-transfer', 'fluid-advection', 'phase-change'],
        }, 'lava magma molten rock glowing hot flow thermal phase change'),
        card('algae', 'entity', ['algae', 'glowing algae'], {
          classes: ['plant_cluster'],
          shapes: ['colony_field'],
          materials: ['leaf', 'biomass'],
          behaviors: ['growth', 'glowing'],
          primitiveIds: ['leaf', 'biomass', 'growth-decay', 'radiation', 'diffusion'],
        }, 'algae glowing plant cluster photosynthesis green biomass growth light'),
        card('water_material', 'material', ['water', 'liquid water'], {
          primitiveIds: ['water', 'fluid-advection', 'pressure'],
        }, 'water liquid flow pressure cooling'),
        card('air_material', 'material', ['air', 'gas'], {
          primitiveIds: ['air', 'fluid-advection', 'pressure'],
        }, 'air gas wind atmosphere pressure flow'),
        card('axle', 'constraint', ['axle', 'revolute axle'], {
          primitiveIds: ['constraint', 'rigid-body', 'friction'],
        }, 'axle revolute joint bearing rotational constraint'),
        card('hinge', 'constraint', ['hinge', 'pivot'], {
          primitiveIds: ['constraint', 'rigid-body', 'friction'],
        }, 'hinge pivot joint one degree rotation'),
        card('spring', 'constraint', ['spring', 'elastic spring'], {
          primitiveIds: ['elasticity', 'constraint', 'oscillator'],
        }, 'spring elasticity compression restoring force oscillation'),
        card('containment', 'relation', ['inside', 'in', 'within', 'contains', 'containment'], {
          primitiveIds: ['surface-boundary', 'collision', 'constraint'],
        }, 'inside containment relation object within container boundary'),
        card('attached_to', 'relation', ['attached to', 'mounted on', 'fixed to'], {
          primitiveIds: ['constraint', 'rigid-body', 'collision'],
        }, 'attached mounted fixed support relation'),
        card('through', 'relation', ['through', 'passes through'], {
          primitiveIds: ['surface-boundary', 'fluid-advection', 'optics'],
        }, 'through passage path crosses boundary aperture'),
        card('pushes', 'relation', ['pushes', 'drives', 'forces'], {
          primitiveIds: ['vector', 'rigid-body', 'energy-ledger'],
        }, 'push force drive input relation'),
        card('running_gait', 'behavior', ['running', 'running gait', 'gait'], {
          primitiveIds: ['oscillator', 'friction', 'soft-body', 'energy-ledger'],
        }, 'running gait periodic foot contact drive force'),
        card('rolling', 'behavior', ['rolling', 'rolls'], {
          primitiveIds: ['rigid-body', 'friction', 'constraint'],
        }, 'rolling wheel contact angular velocity friction'),
        card('rotation', 'behavior', ['rotating', 'spinning', 'rotation'], {
          primitiveIds: ['rigid-body', 'constraint', 'oscillator'],
        }, 'rotation angular momentum spin torque'),
        card('pumping', 'behavior', ['pumping', 'pump'], {
          primitiveIds: ['pump', 'pressure', 'fluid-advection', 'energy-ledger'],
        }, 'pumping pressure source fluid flow'),
        card('flowing', 'behavior', ['flowing', 'flows'], {
          primitiveIds: ['fluid-advection', 'pressure', 'vector-field'],
        }, 'flowing fluid velocity pressure transport'),
        card('burning', 'behavior', ['burning', 'combustion', 'fire'], {
          primitiveIds: ['combustion', 'heat-transfer', 'radiation', 'smoke'],
        }, 'burning fire combustion heat smoke radiation'),
        card('heating', 'behavior', ['heating', 'heat'], {
          primitiveIds: ['heat-transfer', 'radiation', 'conservation-ledger'],
        }, 'heating temperature transfer radiation conduction'),
        card('cooling', 'behavior', ['cooling', 'cools'], {
          primitiveIds: ['cooler', 'heat-transfer', 'water', 'fluid-advection'],
        }, 'cooling heat sink water flow thermal'),
        card('growth', 'behavior', ['growing', 'growth'], {
          primitiveIds: ['growth-decay', 'diffusion', 'biomass'],
        }, 'growth biological biomass diffusion population'),
        card('collision_event', 'event', ['crash', 'crashes', 'collision', 'collides', 'impact'], {
          primitiveIds: ['collision', 'friction', 'rigid-body', 'energy-ledger'],
          physics: ['contact_manifold', 'impulse_response', 'restitution', 'damping'],
        }, 'collision crash impact contact impulse restitution damping'),
        card('falling_event', 'event', ['falling', 'falls', 'drop'], {
          primitiveIds: ['gravity', 'rigid-body', 'collision', 'energy-ledger'],
        }, 'falling gravity impact drop acceleration'),
        card('break_event', 'event', ['breaks', 'fractures', 'shatters'], {
          primitiveIds: ['collision', 'elasticity', 'threshold', 'rigid-body'],
        }, 'break fracture shatter threshold collision stress'),
        card('flow_event', 'event', ['flows into', 'pours into'], {
          primitiveIds: ['fluid-advection', 'pressure', 'surface-boundary'],
        }, 'flows into pours relation fluid transfer vessel'),
        card('heat_event', 'event', ['heats', 'warms', 'cools'], {
          primitiveIds: ['heat-transfer', 'radiation', 'conservation-ledger'],
        }, 'thermal event heat cool transfer energy'),
        card('desert_environment', 'environment', ['desert', 'dry test bench'], {
          primitiveIds: ['terrain-patch', 'sand', 'air', 'radiation'],
        }, 'desert dry sand terrain sunlight hot air test bench'),
        card('lab_environment', 'environment', ['lab bench', 'test bench', 'laboratory'], {
          primitiveIds: ['sensor', 'controller', 'rock-wall', 'data-recorder'],
        }, 'lab bench test bench measurement sensors instrumented surface'),
        card('city_environment', 'environment', ['city', 'street', 'grid'], {
          primitiveIds: ['controller', 'sensor', 'queue', 'graph-network'],
        }, 'city grid street network traffic queue signals'),
        card('forest_environment', 'environment', ['forest', 'woods'], {
          primitiveIds: ['wood', 'biomass', 'air', 'terrain-patch'],
        }, 'forest trees wood biomass terrain air'),
        card('watershed_environment', 'environment', ['watershed', 'river basin'], {
          primitiveIds: ['river', 'terrain-patch', 'water', 'erosion'],
        }, 'watershed river basin rain terrain erosion water'),
        card('volcano_environment', 'environment', ['volcano', 'volcanic cone'], {
          primitiveIds: ['rock', 'terrain-patch', 'fire', 'heat-transfer', 'pressure'],
        }, 'volcano volcanic cone mountain magma vent lava rock heat pressure'),
        card('storm_environment', 'environment', ['storm', 'rainstorm', 'hurricane'], {
          primitiveIds: ['air', 'water', 'pressure', 'fluid-advection', 'vector-field'],
        }, 'storm rain wind pressure cloud air water turbulent environment'),
        card('output_power_readout', 'readout', ['output power', 'power readout', 'watt meter'], {
          primitiveIds: ['energy-ledger', 'sensor'],
        }, 'output power readout watt meter energy ledger sensor'),
        card('heat_loss_readout', 'readout', ['heat loss', 'thermal loss'], {
          primitiveIds: ['heat-transfer', 'energy-ledger', 'sensor'],
        }, 'heat loss thermal loss energy readout'),
        card('collision_readout', 'readout', ['impact meter', 'collision readout'], {
          primitiveIds: ['collision', 'energy-ledger', 'sensor'],
        }, 'collision readout impulse impact energy meter'),
      ]);

    const SURFACE_CARD_LIBRARY = Object.freeze(mergeSurfaceLibraries(
        BASE_SURFACE_CARD_LIBRARY,
        importedSemanticSurfaceCards(semantic)
      ));

    Object.assign(scope, {
      STOPWORDS,
      BASE_SURFACE_CARD_LIBRARY,
      SURFACE_CARD_LIBRARY,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
