(function attachSimulatteGraphSynthesis(root, factory) {
  const semantic = typeof module === 'object' && module.exports
    ? require('./simulatte-semantic-rag.js')
    : root.SimulatteSemanticRag;
  const api = factory(semantic);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteGraphSynthesis = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createGraphSynthesisApi(semantic = {}) {
  const WORLD_INTENT_SCHEMA = 'simulatte.worldIntent.v1';
  const SYNTH_GRAPH_SCHEMA = 'simulatte.synthGraph.v1';
  const GROUNDED_GRAPH_SCHEMA = 'simulatte.groundedGraph.v1';
  const SYNTHESIS_SCHEMA = 'simulatte.embeddingGuidedGraphSynthesis.v1';
  const SURFACE_CARD_SCHEMA = 'simulatte.surfaceCard.v1';
  const CARD_INDEX_SCHEMA = 'simulatte.surfaceCardEmbeddingIndex.v1';
  const SYNTH_MODEL_ID = 'simulatte.embedding-guided-graph-synthesis.v1';

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

  function synthesizeWorldIntent(promptText = '', context = {}, catalog = {}) {
    const prompt = String(promptText || '').trim();
    const spans = extractSpans(prompt);
    const retrieval = retrieveSurfaceCards(prompt, spans, context);
    const nodes = buildNodes(prompt, retrieval);
    const relations = buildRelations(prompt, nodes, retrieval);
    const events = buildEvents(prompt, nodes, retrieval);
    const readouts = buildReadouts(retrieval);
    const environment = buildEnvironment(retrieval);
    const worldIntent = {
      schema: WORLD_INTENT_SCHEMA,
      entities: nodes.filter((node) => node.nodeType === 'entity'),
      assemblies: nodes.filter((node) => node.nodeType === 'assembly'),
      environment,
      relations,
      events,
      readouts,
    };
    const synthGraph = {
      schema: SYNTH_GRAPH_SCHEMA,
      prompt,
      nodes,
      relations,
      events,
      environment,
      readouts,
    };
    const groundedGraph = groundSynthGraph(synthGraph, retrieval, catalog);
    const validation = validateGroundedGraph(synthGraph, groundedGraph, catalog);
    return {
      schema: SYNTHESIS_SCHEMA,
      model: {
        id: SYNTH_MODEL_ID,
        retriever: 'google-embeddinggemma-300m-q4k-ehf16-af32',
        planner: 'deterministic-typed-card-graph-search',
        grounder: 'simulatte-card-expansion-grounder.v1',
      },
      prompt,
      spans,
      retrieval,
      worldIntent,
      synthGraph,
      groundedGraph,
      validation,
    };
  }

  function groundedPrimitiveRows(synthesis, catalog = {}) {
    const ids = synthesis && synthesis.groundedGraph && synthesis.groundedGraph.primitiveIds || [];
    const primitiveById = typeof catalog.primitiveById === 'function' ? catalog.primitiveById : () => null;
    const rows = ids
      .map((entry) => {
        const id = typeof entry === 'string' ? entry : entry.id;
        const primitive = primitiveById(id);
        if (!primitive) return null;
        return {
          ...primitive,
          score: Number((entry.score || 0.72).toFixed ? entry.score.toFixed(4) : entry.score || 0.72),
          source: 'embedding-guided-graph-synthesis',
          phrase: entry.reason || 'grounded from surface card synthesis',
        };
      })
      .filter(Boolean);
    if (typeof catalog.withPrimitiveDependencies === 'function') {
      return catalog.withPrimitiveDependencies(rows, synthesis.prompt || '');
    }
    return rows;
  }

  function createSurfaceCardDocuments(cards = SURFACE_CARD_LIBRARY) {
    return cards.map((item, order) => ({
      cardId: item.id,
      type: item.type,
      order,
      labels: item.labels.slice(),
      text: cardText(item),
      grounding: item.grounding,
    }));
  }

  function retrieveSurfaceCards(prompt, spans, context) {
    const embeddingMatches = new Map();
    const semanticMatches = context.semanticRag && Array.isArray(context.semanticRag.surfaceRetrieved)
      ? context.semanticRag.surfaceRetrieved
      : [];
    for (const match of [
      ...(context.cardMatches || []),
      ...(context.surfaceCardMatches || []),
      ...semanticMatches,
    ]) {
      const cardId = normalizeIncomingCardId(match.cardId || match.id || '');
      if (!cardId) continue;
      const existing = embeddingMatches.get(cardId);
      const score = clamp01(Number(match.score || match.modelScore || match.semanticScore || 0));
      if (!existing || score > existing.score) {
        embeddingMatches.set(cardId, { ...match, cardId, score });
      }
    }
    const spanMatches = spans.map((span) => {
      const expectedType = expectedTypeForSpan(span.text);
      const matches = SURFACE_CARD_LIBRARY
        .map((item) => {
          const lexicalScore = scoreCardForSpan(span.text, item);
          const embedded = embeddingMatches.get(item.id);
          const typeBoost = expectedType && typeFits(item.type, expectedType) ? 0.1 : 0;
          const score = Math.max(lexicalScore, embedded ? embedded.score * 0.94 : 0) + typeBoost;
          if (score <= 0.12) return null;
          return {
            cardId: item.id,
            type: item.type,
            labels: item.labels.slice(0, 4),
            span: span.text,
            score: Number(clamp01(score).toFixed(4)),
            lexicalScore: Number(lexicalScore.toFixed(4)),
            embeddingScore: embedded ? Number(embedded.score.toFixed(4)) : 0,
            source: embedded ? 'embedding+surface-card' : 'surface-card',
            grounding: item.grounding,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId))
        .slice(0, 8);
      return { span: span.text, kind: span.kind, start: span.start, matches };
    }).filter((row) => row.matches.length);

    const selected = [];
    const selectedIds = new Set();
    for (const row of spanMatches) {
      for (const match of row.matches.slice(0, 3)) {
        if (selectedIds.has(match.cardId)) continue;
        if (match.score < 0.42 && match.lexicalScore < 0.5 && match.embeddingScore < 0.46) continue;
        selectedIds.add(match.cardId);
        selected.push(match);
      }
    }
    for (const embedded of Array.from(embeddingMatches.values()).sort((a, b) => b.score - a.score)) {
      if (selectedIds.has(embedded.cardId) || embedded.score < 0.5) continue;
      const item = cardById(embedded.cardId);
      if (!item) continue;
      selectedIds.add(item.id);
      selected.push({
        cardId: item.id,
        type: item.type,
        labels: item.labels.slice(0, 4),
        span: 'whole prompt',
        score: Number(embedded.score.toFixed(4)),
        lexicalScore: 0,
        embeddingScore: Number(embedded.score.toFixed(4)),
        source: 'embedding-surface-card',
        grounding: item.grounding,
      });
    }

    const selectedFiltered = selected
      .sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId))
      .filter((match) => !isCoveredSelectedMatch(prompt, match));

    return {
      schema: 'simulatte.surfaceCardRetrieval.v1',
      spans: spanMatches,
      selected: selectedFiltered.slice(0, 32),
    };
  }

  function buildNodes(prompt, retrieval) {
    const selected = retrieval.selected || [];
    const nodeCards = selected
      .map((match) => ({ match, card: cardById(match.cardId) }))
      .filter((row) => row.card && ['entity', 'entity_class', 'assembly', 'assembly_class', 'material'].includes(row.card.type));
    const hasSpecificEntity = nodeCards.some((row) => row.card.type === 'entity');
    const hasSpecificAssembly = nodeCards.some((row) => row.card.type === 'assembly');
    const observedNodeTypes = new Set(nodeCards
      .filter((row) => occurrencesForCard(prompt, row.card).length)
      .map((row) => nodeTypeForCard(row.card)));
    const embeddingOnlyUsed = { entity: 0, assembly: 0 };
    const nodes = [];
    for (const { match, card: item } of nodeCards) {
      if (item.grounding.abstract && item.type === 'entity_class' && hasSpecificEntity) continue;
      if (item.grounding.abstract && item.type === 'assembly_class' && hasSpecificAssembly) continue;
      const occurrences = occurrencesForCard(prompt, item);
      const nodeType = nodeTypeForCard(item);
      if (!occurrences.length) {
        if (!shouldUseEmbeddingOnlyNode(match, nodeType, observedNodeTypes, embeddingOnlyUsed)) continue;
        embeddingOnlyUsed[nodeType] += 1;
      }
      const count = Math.max(occurrences.length, shouldDuplicateFromPrompt(prompt, item) ? 2 : 1);
      for (let i = 0; i < count; i += 1) {
        const suffix = count > 1 ? String.fromCharCode(97 + i) : 'a';
        nodes.push({
          id: `${item.id}_${suffix}`,
          cardId: item.id,
          label: item.labels[0],
          nodeType,
          class: first(item.grounding.classes) || item.id,
          morphology: {
            shapes: array(item.grounding.shapes),
            parts: array(item.grounding.parts),
            scale: scaleForCard(item),
          },
          materials: array(item.grounding.materials),
          behaviors: array(item.grounding.behaviors),
          constraints: array(item.grounding.constraints),
          ports: array(item.grounding.ports),
          positionHint: occurrences[i] !== undefined ? occurrences[i] : prompt.length + nodes.length,
          match: {
            span: match.span,
            score: match.score,
            source: match.source,
          },
        });
      }
    }
    return nodes.sort((a, b) => a.positionHint - b.positionHint || a.id.localeCompare(b.id));
  }

  function nodeTypeForCard(item) {
    return item && String(item.type || '').includes('assembly') ? 'assembly' : 'entity';
  }

  function shouldUseEmbeddingOnlyNode(match, nodeType, observedNodeTypes, embeddingOnlyUsed) {
    if (!(match.embeddingScore >= 0.78 && String(match.source || '').includes('embedding'))) return false;
    if (observedNodeTypes.has(nodeType)) return false;
    return (embeddingOnlyUsed[nodeType] || 0) < 1;
  }

  function buildRelations(prompt, nodes, retrieval) {
    const relations = [];
    const handledCardIds = new Set();
    if (/\b(in|inside|within|contains|containment)\b/i.test(prompt)) {
      const entities = nodes.filter((node) => node.nodeType === 'entity');
      const assemblies = nodes.filter((node) => node.nodeType === 'assembly');
      for (let i = 0; i < Math.min(entities.length, assemblies.length); i += 1) {
        relations.push({
          id: `containment_${i + 1}`,
          type: 'inside',
          participants: [entities[i].id, assemblies[i].id],
          cardId: 'containment',
          physics: ['surface-boundary', 'collision', 'constraint'],
        });
      }
      handledCardIds.add('containment');
      handledCardIds.add('inside');
    }
    for (const match of retrieval.selected || []) {
      if (match.cardId !== 'attached_to' && match.cardId !== 'through' && match.cardId !== 'pushes') continue;
      const item = cardById(match.cardId);
      if (!item) continue;
      handledCardIds.add(item.id);
      relations.push({
        id: `${item.id}_${relations.length + 1}`,
        type: item.id,
        participants: nodes.slice(0, 2).map((node) => node.id),
        cardId: item.id,
        physics: array(item.grounding.primitiveIds),
      });
    }
    for (const match of retrieval.selected || []) {
      if (handledCardIds.has(match.cardId)) continue;
      if (match.type !== 'relation') continue;
      const item = cardById(match.cardId);
      if (!item) continue;
      relations.push({
        id: `${item.id}_${relations.length + 1}`,
        type: item.id,
        participants: nodes.slice(0, 2).map((node) => node.id),
        cardId: item.id,
        physics: array(item.grounding.primitiveIds),
      });
      handledCardIds.add(item.id);
    }
    return uniqueRelations(relations);
  }

  function uniqueRelations(relations) {
    const seen = new Set();
    return (relations || []).filter((relation) => {
      const key = `${relation.type}:${(relation.participants || []).join('>')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function buildEvents(prompt, nodes, retrieval) {
    const events = [];
    const handledCardIds = new Set();
    const wantsCollision = /\b(crash(?:es|ing|ed)?|collision|collid(?:e|es|ing|ed)|impact(?:s|ing|ed)?|hits?|hitting|smash(?:es|ing|ed)?)\b/i.test(prompt)
      || retrieval.selected.some((match) => match.cardId === 'collision_event' || (
        match.cardId === 'collision' && match.type === 'event'
      ));
    if (wantsCollision) {
      const assemblies = nodes.filter((node) => node.nodeType === 'assembly');
      const participants = assemblies.length >= 2 ? assemblies : nodes;
      events.push({
        id: 'collision_1',
        type: 'collision',
        cardId: 'collision_event',
        participants: participants.slice(0, 2).map((node) => node.id),
        physics: ['rigid-body', 'collision', 'friction', 'impulse_response', 'damping'],
      });
      handledCardIds.add('collision_event');
      handledCardIds.add('collision');
    }
    for (const match of retrieval.selected || []) {
      if (!['falling_event', 'break_event', 'flow_event', 'heat_event'].includes(match.cardId)) continue;
      const item = cardById(match.cardId);
      if (!item) continue;
      handledCardIds.add(item.id);
      events.push({
        id: `${item.id}_${events.length + 1}`,
        type: item.id.replace(/_event$/, ''),
        cardId: item.id,
        participants: nodes.slice(0, 2).map((node) => node.id),
        physics: array(item.grounding.primitiveIds),
      });
    }
    for (const match of retrieval.selected || []) {
      if (handledCardIds.has(match.cardId)) continue;
      if (match.type !== 'event') continue;
      const item = cardById(match.cardId);
      if (!item) continue;
      events.push({
        id: `${item.id}_${events.length + 1}`,
        type: item.id,
        cardId: item.id,
        participants: nodes.slice(0, 2).map((node) => node.id),
        physics: array(item.grounding.primitiveIds),
      });
      handledCardIds.add(item.id);
    }
    return events;
  }

  function buildReadouts(retrieval) {
    return (retrieval.selected || [])
      .filter((match) => match.type === 'readout')
      .map((match) => ({ id: match.cardId, label: first(match.labels), source: match.source }));
  }

  function buildEnvironment(retrieval) {
    return (retrieval.selected || [])
      .filter((match) => match.type === 'environment')
      .map((match) => ({ id: match.cardId, label: first(match.labels), source: match.source }));
  }

  function groundSynthGraph(synthGraph, retrieval, catalog) {
    const primitiveScores = new Map();
    const components = [];
    const primitiveExists = typeof catalog.primitiveById === 'function'
      ? (id) => Boolean(catalog.primitiveById(id))
      : () => true;
    const addPrimitive = (id, score, reason) => {
      if (!id) return;
      if (!primitiveExists(id)) return;
      const existing = primitiveScores.get(id);
      if (!existing || score > existing.score) {
        primitiveScores.set(id, { id, score: clamp01(score), reason });
      }
    };
    for (const node of synthGraph.nodes) {
      const item = cardById(node.cardId);
      if (!item) continue;
      const score = node.match && node.match.score || 0.68;
      for (const id of item.grounding.primitiveIds || []) addPrimitive(id, score, node.label);
      components.push({
        nodeId: node.id,
        cardId: item.id,
        label: node.label,
        parts: array(item.grounding.parts),
        shapes: array(item.grounding.shapes),
        materials: array(item.grounding.materials),
        behaviors: array(item.grounding.behaviors),
        constraints: array(item.grounding.constraints),
        ports: array(item.grounding.ports),
      });
    }
    for (const relation of synthGraph.relations) {
      const item = cardById(relation.cardId);
      for (const id of item && item.grounding.primitiveIds || relation.physics || []) {
        addPrimitive(id, 0.74, relation.type);
      }
    }
    for (const event of synthGraph.events) {
      const item = cardById(event.cardId);
      for (const id of item && item.grounding.primitiveIds || event.physics || []) {
        addPrimitive(id, 0.82, event.type);
      }
    }
    for (const env of synthGraph.environment) {
      const item = cardById(env.id);
      for (const id of item && item.grounding.primitiveIds || []) addPrimitive(id, 0.58, env.label);
    }
    for (const readout of synthGraph.readouts) {
      const item = cardById(readout.id);
      for (const id of item && item.grounding.primitiveIds || []) addPrimitive(id, 0.62, readout.label);
    }
    return {
      schema: GROUNDED_GRAPH_SCHEMA,
      primitiveIds: Array.from(primitiveScores.values())
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)),
      components,
      relations: synthGraph.relations,
      events: synthGraph.events,
      retrievalTop: (retrieval.selected || []).slice(0, 12).map((match) => ({
        cardId: match.cardId,
        type: match.type,
        score: match.score,
        source: match.source,
      })),
    };
  }

  function validateGroundedGraph(synthGraph, groundedGraph, catalog = {}) {
    const nodeIds = new Set((synthGraph.nodes || []).map((node) => node.id));
    const errors = [];
    const warnings = [];
    const repairs = [];
    if (!synthGraph.nodes.length) errors.push('no typed nodes synthesized');
    if (!groundedGraph.primitiveIds.length) errors.push('no grounded primitives emitted');
    for (const relation of synthGraph.relations || []) {
      for (const participant of relation.participants || []) {
        if (!nodeIds.has(participant)) errors.push(`relation ${relation.id} references missing ${participant}`);
      }
    }
    for (const event of synthGraph.events || []) {
      for (const participant of event.participants || []) {
        if (!nodeIds.has(participant)) errors.push(`event ${event.id} references missing ${participant}`);
      }
    }
    const primitiveById = typeof catalog.primitiveById === 'function' ? catalog.primitiveById : null;
    if (primitiveById) {
      for (const entry of groundedGraph.primitiveIds) {
        if (!primitiveById(entry.id)) errors.push(`missing primitive ${entry.id}`);
      }
    }
    for (const component of groundedGraph.components || []) {
      const item = cardById(component.cardId);
      if (item && item.grounding.approximation) {
        warnings.push(`${item.id} grounded as ${item.grounding.approximation} variant`);
      }
      if (component.ports.includes('body_collision') && !hasPrimitive(groundedGraph, 'collision')) {
        repairs.push(`added default collision shell for ${component.nodeId}`);
      }
    }
    if ((synthGraph.events || []).some((event) => event.type === 'collision') && !hasPrimitive(groundedGraph, 'energy-ledger')) {
      repairs.push('added energy ledger for collision event');
    }
    return {
      schema: 'simulatte.synthGraphValidation.v1',
      valid: errors.length === 0,
      checked: {
        nodes: synthGraph.nodes.length,
        relations: synthGraph.relations.length,
        events: synthGraph.events.length,
        primitives: groundedGraph.primitiveIds.length,
      },
      repairs: uniqueList(repairs),
      warnings: uniqueList(warnings),
      errors,
    };
  }

  function extractSpans(promptText) {
    const prompt = String(promptText || '').toLowerCase();
    const spans = [];
    const add = (text, start, kind = 'span') => {
      const clean = String(text || '').replace(/\s+/g, ' ').trim();
      if (!clean || STOPWORDS.has(clean)) return;
      if (spans.some((span) => span.text === clean && span.start === start)) return;
      spans.push({ text: clean, start: Math.max(0, start || 0), kind });
    };
    for (const item of SURFACE_CARD_LIBRARY) {
      for (const label of item.labels) {
        const pattern = new RegExp(`\\b${escapeRegExp(label)}\\b`, 'gi');
        let match;
        while ((match = pattern.exec(prompt))) add(match[0], match.index, item.type);
      }
    }
    const words = prompt.split(/[^a-z0-9]+/).filter(Boolean);
    for (let i = 0; i < words.length; i += 1) {
      for (let n = 3; n >= 1; n -= 1) {
        const slice = words.slice(i, i + n);
        if (slice.length !== n || slice.every((word) => STOPWORDS.has(word))) continue;
        add(slice.join(' '), prompt.indexOf(slice.join(' ')), 'ngram');
      }
    }
    add(prompt, 0, 'prompt');
    return spans.sort((a, b) => a.start - b.start || b.text.length - a.text.length).slice(0, 72);
  }

  function scoreCardForSpan(spanText, item) {
    const span = String(spanText || '').toLowerCase();
    if (!span) return 0;
    const labelScore = item.labels.reduce((score, label) => {
      const text = label.toLowerCase();
      if (span === text) return Math.max(score, 0.98);
      if (span.includes(text) || text.includes(span)) return Math.max(score, 0.72);
      return score;
    }, 0);
    const spanTokens = tokenSet(span);
    const cardTokens = tokenSet(cardText(item));
    const overlap = Array.from(spanTokens).filter((token) => cardTokens.has(token)).length;
    const denom = Math.max(1, Math.min(spanTokens.size, 8));
    if (spanTokens.size === 1 && !labelScore) return overlap ? 0.18 : 0;
    return Math.max(labelScore, overlap / denom);
  }

  function expectedTypeForSpan(span) {
    if (/\b(crash|collide|impact|fall|break|flow|heat|cool|burn)\b/i.test(span)) return 'event';
    if (/\b(inside|within|contains|attached|through|push|pull|drive)\b/i.test(span)) return 'relation';
    if (/\b(wheel|loop|machine|apparatus|cart|bike|container|tank)\b/i.test(span)) return 'assembly';
    if (/\b(desert|lab|bench|city|forest|watershed)\b/i.test(span)) return 'environment';
    if (/\b(readout|meter|power|loss)\b/i.test(span)) return 'readout';
    return '';
  }

  function typeFits(cardType, expected) {
    if (!expected) return true;
    if (cardType === expected) return true;
    return expected === 'assembly' && cardType === 'assembly_class'
      || expected === 'entity' && cardType === 'entity_class';
  }

  function occurrencesForCard(prompt, item) {
    return uniqueList(rawOccurrencesForCard(prompt, item)
      .filter((occurrence) => !isEmbeddedSurfacePhrase(
        String(prompt || '').toLowerCase(),
        item,
        occurrence.label,
        occurrence.start
      ))
      .map((occurrence) => occurrence.start))
      .sort((a, b) => a - b);
  }

  function rawOccurrencesForCard(prompt, item) {
    const occurrences = [];
    const lower = String(prompt || '').toLowerCase();
    for (const label of item.labels || []) {
      const pattern = new RegExp(`\\b${escapeRegExp(label)}\\b`, 'gi');
      let match;
      while ((match = pattern.exec(lower))) {
        occurrences.push({
          start: match.index,
          end: match.index + String(label || '').length,
          label: String(label || '').toLowerCase(),
        });
      }
    }
    return occurrences.sort((a, b) => a.start - b.start || b.end - a.end);
  }

  function isCoveredSelectedMatch(prompt, match) {
    const item = cardById(match.cardId);
    if (!item) return false;
    if (match.embeddingScore >= 0.66 && String(match.source || '').includes('embedding')) return false;
    const raw = rawOccurrencesForCard(prompt, item);
    const exposed = occurrencesForCard(prompt, item);
    if (raw.length && !exposed.length) return true;
    return !raw.length && match.lexicalScore >= 0.5 && match.embeddingScore < 0.46;
  }

  function isEmbeddedSurfacePhrase(prompt, item, label, start) {
    const labelText = String(label || '').toLowerCase();
    if (!labelText) return false;
    return SURFACE_CARD_LIBRARY.some((candidate) => {
      if (candidate.id === item.id) return false;
      return candidate.labels.some((label) => {
        const candidateText = String(label || '').toLowerCase();
        if (candidateText.length <= labelText.length || !candidateText.includes(labelText)) return false;
        let index = prompt.indexOf(candidateText, Math.max(0, start - candidateText.length));
        while (index !== -1 && index <= start) {
          const end = index + candidateText.length;
          if (start >= index && start + labelText.length <= end) return true;
          index = prompt.indexOf(candidateText, index + 1);
        }
        return false;
      });
    });
  }

  function shouldDuplicateFromPrompt(prompt, item) {
    if (!/\b(another|two|second|pair)\b/i.test(prompt)) return false;
    return item.type === 'assembly' && /\bwheel|cart|vehicle|apparatus\b/i.test(item.labels.join(' '));
  }

  function hasPrimitive(groundedGraph, id) {
    return (groundedGraph.primitiveIds || []).some((entry) => entry.id === id);
  }

  function card(id, type, labels, grounding, text) {
    const normalizedLabels = uniqueList([id.replace(/_/g, ' '), ...(labels || [])]);
    return Object.freeze({
      schema: SURFACE_CARD_SCHEMA,
      id,
      type,
      labels: normalizedLabels,
      grounding: freezeGrounding(grounding || {}),
      text: String(text || ''),
    });
  }

  function mergeSurfaceLibraries(baseCards, importedCards) {
    const byId = new Map();
    for (const item of [...baseCards, ...importedCards]) {
      if (!item || !item.id || byId.has(item.id)) continue;
      byId.set(item.id, item);
    }
    return Array.from(byId.values());
  }

  function importedSemanticSurfaceCards(semanticApi = {}) {
    const surfaceCards = Array.isArray(semanticApi.SEMANTIC_SURFACE_CARDS)
      ? semanticApi.SEMANTIC_SURFACE_CARDS
      : [];
    const basisCards = Array.isArray(semanticApi.GROUNDING_BASIS_CARDS)
      ? semanticApi.GROUNDING_BASIS_CARDS
      : [];
    const basisById = new Map(basisCards.map((item) => [item.id, item]));
    return surfaceCards.map((item) => {
      const id = normalizeIncomingCardId(item.id);
      const type = synthesisTypeForSemanticType(item.type);
      const grounding = {
        classes: item.classHints || [],
        shapes: item.shapeHints || [],
        parts: item.partHints || [],
        materials: normalizeSemanticMaterials(item.materialHints || []),
        behaviors: item.behaviorHints || item.eventHints || [],
        constraints: item.relationHints || [],
        ports: uniqueList([
          ...(item.affordanceHints || []),
          ...(item.relationHints || []),
          ...(item.eventHints || []),
        ]),
        primitiveIds: primitiveIdsForSemanticCard(item, basisById),
        approximation: first(item.classHints) || '',
        abstract: ['entity_class', 'assembly_class'].includes(type),
      };
      return card(
        id,
        type,
        item.labels || [id.replace(/_/g, ' ')],
        grounding,
        [
          item.description,
          (item.classHints || []).join(' '),
          (item.shapeHints || []).join(' '),
          (item.partHints || []).join(' '),
          (item.materialHints || []).join(' '),
          (item.behaviorHints || []).join(' '),
          (item.eventHints || []).join(' '),
          (item.relationHints || []).join(' '),
        ].join(' ')
      );
    });
  }

  function synthesisTypeForSemanticType(type) {
    if (type === 'artifact') return 'assembly';
    if (type === 'material') return 'entity';
    if (type === 'process') return 'behavior';
    return type || 'entity';
  }

  function normalizeIncomingCardId(value) {
    return String(value || '')
      .replace(/^[a-z]+(?:-[a-z]+)*\./, '')
      .replace(/-/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function normalizeSemanticMaterials(values) {
    return uniqueList((values || []).map((value) => {
      if (value === 'soft_tissue' || value === 'fur' || value === 'feather' || value === 'shell') return 'biomass';
      return value;
    }));
  }

  function primitiveIdsForSemanticCard(item, basisById) {
    const ids = [];
    for (const material of normalizeSemanticMaterials(item.materialHints || [])) ids.push(material);
    for (const groundingId of item.groundingIds || []) {
      if (/^(math|physics|material|component|composition|scene)\./.test(groundingId)) {
        ids.push(groundingId.split('.').pop());
        continue;
      }
      const basis = basisById.get(groundingId);
      if (basis) ids.push(...(basis.primitives || []));
    }
    return uniqueList(ids);
  }

  function freezeGrounding(value) {
    const out = {};
    for (const [key, raw] of Object.entries(value || {})) {
      out[key] = Array.isArray(raw) ? Object.freeze(raw.slice()) : raw;
    }
    return Object.freeze(out);
  }

  function cardById(id) {
    return SURFACE_CARD_LIBRARY.find((item) => item.id === id) || null;
  }

  function cardText(item) {
    const grounding = item.grounding || {};
    return [
      item.id,
      item.type,
      item.labels.join(' '),
      item.text,
      array(grounding.classes).join(' '),
      array(grounding.parts).join(' '),
      array(grounding.shapes).join(' '),
      array(grounding.materials).join(' '),
      array(grounding.behaviors).join(' '),
      array(grounding.constraints).join(' '),
      array(grounding.ports).join(' '),
      array(grounding.primitiveIds).join(' '),
    ].join(' ').replace(/\s+/g, ' ').trim();
  }

  function tokenSet(text) {
    return new Set(String(text || '').toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token && !STOPWORDS.has(token)));
  }

  function scaleForCard(item) {
    const text = cardText(item);
    if (/\bsmall|mouse|gerbil|hamster|insect\b/i.test(text)) return 'small';
    if (/\bbuilding|planet|city|forest|watershed\b/i.test(text)) return 'large';
    return 'nominal';
  }

  function first(values) {
    const list = array(values);
    return list.length ? list[0] : '';
  }

  function array(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function uniqueList(values) {
    return Array.from(new Set((values || []).filter((value) => value !== undefined && value !== null)));
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return {
    CARD_INDEX_SCHEMA,
    GROUNDED_GRAPH_SCHEMA,
    SURFACE_CARD_LIBRARY,
    SURFACE_CARD_SCHEMA,
    SYNTHESIS_SCHEMA,
    SYNTH_GRAPH_SCHEMA,
    SYNTH_MODEL_ID,
    WORLD_INTENT_SCHEMA,
    cardText,
    createSurfaceCardDocuments,
    extractSpans,
    groundedPrimitiveRows,
    retrieveSurfaceCards,
    synthesizeWorldIntent,
    validateGroundedGraph,
  };
});
