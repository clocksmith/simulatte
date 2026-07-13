(function attachSimulatteSemanticRaghelpers(root) {
  const scope = root.__SimulatteSemanticRagRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    const LOCAL_PRIMITIVE_DOC_CACHE = new Map();
    const LOCAL_PRIMITIVE_DOC_CACHE_LIMIT = 4096;
    const SEMANTIC_CARD_DOC_CACHE = new WeakMap();
    const SEMANTIC_CARD_TEXT_CACHE = new WeakMap();

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
          ['artifact.screen', 'artifact', ['screen', 'display', 'monitor', 'television', 'tv'], 'flat light-emitting panel with pixels, signal input, heat, and glass surface', { classHints: ['electrical_network'], shapeHints: ['flat_panel'], partHints: ['screen', 'frame', 'stand'], materialHints: ['glass', 'silicon', 'plastic'], behaviorHints: ['emits_light'], groundingIds: ['ground.electrical-network', 'ground.optical-source'] }],
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
        const modelPromptVector = options.promptVector
          ? Float32Array.from(options.promptVector)
          : null;
        const localPromptVector = buildSemanticFeatureVector(prompt);
        const featureDim = localPromptVector.length || FEATURE_DIM;
        const candidateDocs = (primitives || []).map((primitive, index) => {
          const indexed = indexDocs.get(primitive.id);
          return indexed ? primitiveDocFromIndex(primitive, indexed, index) : primitiveDoc(primitive, index, featureDim);
        });
        const surfaceDocs = SEMANTIC_SURFACE_CARDS.map((card, index) => semanticCardDoc(card, index, 'semantic-surface', featureDim));
        const groundingDocs = GROUNDING_BASIS_CARDS.map((card, index) => semanticCardDoc(card, index, 'grounding-basis', featureDim));
        const modelPriors = new Map((options.modelPriors || []).map((prior) => [prior.primitiveId, prior]));
        const retrieved = candidateDocs
          .map((doc) => scoreDocument({ modelPromptVector, localPromptVector }, prompt, doc, modelPriors.get(doc.primitiveId)))
          .sort((a, b) => b.score - a.score || a.primitiveId.localeCompare(b.primitiveId))
          .slice(0, Number.isFinite(options.maxDocuments) ? options.maxDocuments : 60);
        const typedSpans = Array.isArray(options.typedSpans) ? options.typedSpans : [];
        const surfaceRetrieved = surfaceDocs
          .map((doc) => scoreSemanticCard(localPromptVector, prompt, doc))
          .filter((doc) => surfaceCardAlignsWithTypedSpans(prompt, doc.labels, typedSpans))
          .filter((doc) => doc.score > 0.08 || doc.directMatch)
          .sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId))
          .slice(0, Number.isFinite(options.maxSurfaceDocuments) ? options.maxSurfaceDocuments : 72);
        const groundingRetrieved = groundingDocs
          .map((doc) => scoreSemanticCard(localPromptVector, prompt, doc))
          .filter((doc) => doc.score > 0.06 || doc.directMatch)
          .sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId))
          .slice(0, Number.isFinite(options.maxGroundingDocuments) ? options.maxGroundingDocuments : 64);
        const synthGraph = synthesizeSurfaceGraph(prompt, primitives || PHYSICAL_PRIMITIVES, {
          surfaceRetrieved,
          groundingRetrieved,
          primitiveRetrieved: retrieved,
          maxNodes: Number.isFinite(options.maxSynthNodes) ? options.maxSynthNodes : 18,
          typedSpans,
        });
        const openLimit = Number.isFinite(options.maxOpenComponents) ? options.maxOpenComponents : 12;
        const openComponents = mergeOpenComponents(
          synthGraph.openComponents,
          extractOpenComponents(prompt, retrieved, typedSpans, options.suppressObservableOpenComponents === true),
          openLimit
        );
        const domains = dominantDomains(retrieved, openComponents);
        return {
          schema: SEMANTIC_RAG_SCHEMA,
          model: {
            id: 'simulatte-grid-style-semantic-rag.v1',
            family: indexDocs.size ? 'shipped-index-open-primitive-rag' : 'hashed-embedding-open-primitive-rag',
            featureDim,
            queryVectorSpace: modelPromptVector ? MODEL_VECTOR_SPACE : LOCAL_VECTOR_SPACE,
            localVectorSpace: LOCAL_VECTOR_SPACE,
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

    function constructionTopologySurfaceCards() {
        const topologies = constructionSubstrate.CONSTRUCTION_TOPOLOGIES || [];
        return topologies.map((topology) => surfaceCard(
          `construction.${topology.id}`,
          'construction-topology',
          uniqueList([topology.id.replace(/-/g, ' '), ...(topology.cues || [])]),
          `reusable part graph with ${(topology.nodes || []).reduce((sum, row) => sum + Number(row.count || 0), 0)} typed parts and ${(topology.edges || []).length} spatial constraints`,
          {
            classHints: ['construction_topology', topology.id],
            shapeHints: [topology.id],
            partHints: (topology.nodes || []).map((row) => `${row.count} ${row.roleId}`),
            relationHints: (topology.edges || []).slice(),
            groundingIds: (topology.basisIds || []).slice(),
          }
        ));
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
        const cacheKey = `${dim}\u0000${text}`;
        const cached = LOCAL_PRIMITIVE_DOC_CACHE.get(cacheKey);
        if (cached) return { ...cached, index };
        const row = {
          primitiveId: primitive.id,
          layer: primitive.layer || primitive.type || 'component',
          type: primitive.type || 'component',
          domains: primitive.domains || [],
          text,
          vector: buildSemanticFeatureVector(text, dim),
          vectorSpace: LOCAL_VECTOR_SPACE,
        };
        if (LOCAL_PRIMITIVE_DOC_CACHE.size >= LOCAL_PRIMITIVE_DOC_CACHE_LIMIT) {
          LOCAL_PRIMITIVE_DOC_CACHE.delete(LOCAL_PRIMITIVE_DOC_CACHE.keys().next().value);
        }
        LOCAL_PRIMITIVE_DOC_CACHE.set(cacheKey, row);
        return { ...row, index };
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
          vector: indexed.vector instanceof Float32Array
            ? indexed.vector
            : Float32Array.from(indexed.vector || []),
          vectorSpace: MODEL_VECTOR_SPACE,
          indexed: true,
          textHash: indexed.textHash || '',
          index,
        };
      }

    function semanticCardDoc(card, index, kind, dim = FEATURE_DIM) {
        const cacheKey = `${kind}:${dim}`;
        const variants = SEMANTIC_CARD_DOC_CACHE.get(card) || new Map();
        let cached = variants.get(cacheKey);
        if (cached) return { ...cached, index };
        const text = semanticCardText(card);
        cached = {
          cardId: card.id,
          kind,
          type: card.type,
          labels: card.labels || [],
          domains: domainsForCard(card),
          text,
          vector: buildSemanticFeatureVector(text, dim),
          vectorSpace: LOCAL_VECTOR_SPACE,
          card,
        };
        variants.set(cacheKey, cached);
        SEMANTIC_CARD_DOC_CACHE.set(card, variants);
        return { ...cached, index };
      }

    function semanticCardText(card) {
        const cached = SEMANTIC_CARD_TEXT_CACHE.get(card);
        if (cached) return cached;
        const text = [
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
        SEMANTIC_CARD_TEXT_CACHE.set(card, text);
        return text;
      }

    function scoreDocument(vectors = {}, prompt, doc, modelPrior = null) {
        const usesModelVector = doc.vectorSpace === MODEL_VECTOR_SPACE &&
          vectors.modelPromptVector &&
          doc.vector &&
          vectors.modelPromptVector.length === doc.vector.length;
        const usesLocalVector = doc.vectorSpace === LOCAL_VECTOR_SPACE &&
          vectors.localPromptVector &&
          doc.vector &&
          vectors.localPromptVector.length === doc.vector.length;
        const semantic = usesModelVector ? cosineDense(vectors.modelPromptVector, doc.vector) : 0;
        const localFeature = usesLocalVector ? cosineDense(vectors.localPromptVector, doc.vector) : 0;
        const lexical = lexicalOverlap(prompt, doc.text);
        const modelScore = modelPrior ? Number(modelPrior.score || 0) : 0;
        const score = usesModelVector
          ? semantic * 0.48 + lexical * 0.22 + modelScore * 0.3
          : localFeature * 0.16 + lexical * 0.44 + modelScore * 0.4;
        return {
          primitiveId: doc.primitiveId,
          layer: doc.layer,
          type: doc.type,
          domains: doc.domains,
          score: Number(clamp(score, 0, 1).toFixed(4)),
          semanticScore: Number(clamp(semantic, 0, 1).toFixed(4)),
          featureScore: Number(clamp(localFeature, 0, 1).toFixed(4)),
          semanticVectorSpace: usesModelVector ? MODEL_VECTOR_SPACE : '',
          featureVectorSpace: usesLocalVector ? LOCAL_VECTOR_SPACE : '',
          lexicalScore: Number(clamp(lexical, 0, 1).toFixed(4)),
          modelScore: Number(clamp(modelScore, 0, 1).toFixed(4)),
          matchedTerms: matchedTerms(prompt, doc.text).slice(0, 8),
          source: 'primitive-document',
        };
      }

    function scoreSemanticCard(localPromptVector, prompt, doc) {
        const feature = localPromptVector && doc.vector && localPromptVector.length === doc.vector.length
          ? cosineDense(localPromptVector, doc.vector)
          : 0;
        const lexical = lexicalOverlap(prompt, doc.text);
        const direct = directLabelMatch(prompt, doc.labels);
        const curation = doc.card && doc.card.curation || cardCuration(doc.cardId, doc.type, doc.labels, {});
        const typeFit = promptTypeFit(prompt, doc.type);
        const score = feature * 0.18 + lexical * 0.36 + direct * 0.36 + curation.priority * 0.08 + typeFit * 0.02;
        return {
          cardId: doc.cardId,
          kind: doc.kind,
          type: doc.type,
          labels: doc.labels,
          domains: doc.domains,
          score: Number(clamp(score, 0, 1).toFixed(4)),
          semanticScore: 0,
          featureScore: Number(clamp(feature, 0, 1).toFixed(4)),
          semanticVectorSpace: '',
          featureVectorSpace: LOCAL_VECTOR_SPACE,
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
        const directMatches = directSurfaceMatches(prompt, context.typedSpans || []);
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

    function directSurfaceMatches(prompt, typedSpans = []) {
        const lower = String(prompt || '').toLowerCase();
        const matches = [];
        for (const card of SEMANTIC_SURFACE_CARDS) {
          const labels = (card.labels || []).slice().sort((a, b) => b.length - a.length || a.localeCompare(b));
          for (const label of labels) {
            const normalized = String(label || '').toLowerCase().trim();
            if (!normalized) continue;
            const specificity = labelSpecificity(normalized);
            if (specificity < 0.18) continue;
            for (const match of labelOccurrences(lower, normalized)) {
              if (!surfaceOccurrenceAlignsWithTypedSpans(match, typedSpans)) continue;
              matches.push({
                card,
                phrase: match.text,
                index: match.index,
                end: match.end,
                score: Number((0.7 + specificity * 0.26 + (card.curation ? card.curation.priority : 0) * 0.04).toFixed(4)),
                source: 'direct-surface-label',
              });
            }
          }
        }
        return matches.sort((a, b) => a.index - b.index || b.phrase.length - a.phrase.length);
      }

    function surfaceCardAlignsWithTypedSpans(prompt, labels = [], typedSpans = []) {
        if (!typedSpans.length) return true;
        const occurrences = (labels || []).flatMap((label) => labelOccurrences(prompt, label));
        if (!occurrences.length) return true;
        return occurrences.some((match) => surfaceOccurrenceAlignsWithTypedSpans(match, typedSpans));
      }

    function surfaceOccurrenceAlignsWithTypedSpans(match, typedSpans = []) {
        const overlaps = (typedSpans || []).filter((span) => (
          Number.isFinite(span.start) &&
          Number.isFinite(span.end) &&
          match.index < span.end &&
          match.end > span.start
        ));
        if (!overlaps.length) return true;
        return overlaps.some((span) => (
          match.index === span.start && match.end === span.end
        ) || (
          match.index >= span.start && match.end === span.end
        ));
      }

    function stableSurfaceMatches(matches, maxNodes) {
        const nodeMatches = matches.filter((match) => (
          !['relation', 'event', 'construction-topology'].includes(match.card.type)
        ));
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
        if (['relation', 'event', 'construction-topology'].includes(doc.type)) return false;
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

    Object.assign(scope, {
      rule,
      curatedUniverseSurfaceCards,
      createSemanticRag,
      surfaceCard,
      basisCard,
      universeSurfaceCards,
      constructionTopologySurfaceCards,
      surfacePack,
      uniqueSurfaceCards,
      primitiveDoc,
      indexedPrimitiveDocs,
      primitiveDocFromIndex,
      semanticCardDoc,
      semanticCardText,
      scoreDocument,
      scoreSemanticCard,
      synthesizeSurfaceGraph,
      directSurfaceMatches,
      stableSurfaceMatches,
      shouldUseRetrievedSurfaceNode,
      surfaceMatchOrder,
      materializeSurfaceNodes,
      synthesizeRelations,
      relation,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
