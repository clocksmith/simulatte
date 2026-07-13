(function attachSimulatteVisualOperatorAtlas(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteVisualOperatorAtlas = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createVisualOperatorAtlasApi() {
  const VISUAL_OPERATOR_ATLAS_SCHEMA = 'simulatte.visualOperatorAtlas.v1';
  const GRAPHICS_ATOM_PLAN_SCHEMA = 'simulatte.graphicsAtomPlan.v1';
  const GRAPHICS_ATOM_UNIFORMS_SCHEMA = 'simulatte.graphicsAtomUniforms.v1';

  const VISUAL_ATOM_UNIFORM_SLOTS = Object.freeze([
    'thermal',
    'fluid',
    'stress',
    'feedback',
    'orbital',
    'electromagnetic',
    'optical',
    'quantum',
    'acoustic',
    'biological',
    'chemical',
    'network',
    'granular',
    'instrument',
    'combustion',
    'phase',
    'robotic',
    'measurement',
    'motion',
    'density',
    'emission',
    'constraint',
    'signal',
    'surface',
  ]);

  const VISUAL_OPERATOR_MAPPINGS = Object.freeze([
    mapping(
      'visual.operator.heat-transfer.v1',
      ['heat_transfer', 'thermal_gradient', 'temperature', 'cool', 'cools', 'cooled', 'cooling', 'heating', 'heat', 'thermal', 'lava', 'steam'],
      ['thermal-glow-gradient', 'surface-phase-boundary', 'volume-vapor-plume'],
      ['heatmap-isobands', 'thermal-vector-fan'],
      ['emissive-hot', 'transparent-vapor'],
      ['thermal-diffusion-front', 'phase-change-boundary'],
      ['buoyant-rise', 'heat-shimmer'],
      ['cutaway-section-depth', 'instrumented-lab-depth'],
      'Heat transfer becomes glow gradients, vapor volumes, phase edges, and thermal vectors.'
    ),
    mapping(
      'visual.operator.fluid-advection.v1',
      ['flow', 'water', 'river', 'ocean', 'fjord', 'meltwater', 'wind', 'coolant', 'airflow', 'velocity', 'microfluidic', 'dose', 'pump', 'channel', 'channels', 'droplet', 'release', 'meniscus', 'surge', 'tidal', 'brackish', 'swim', 'swims', 'swimming', 'underwater', 'pool'],
      ['ribbon-streamline', 'transparent-flow-tube', 'particle-tracer-swarm'],
      ['velocity-vector-field', 'pressure-band-field'],
      ['fluid-ripple', 'wet-refractive'],
      ['advective-transport', 'pressure-driven-flow'],
      ['stream-ribbons', 'tracer-particles'],
      ['topographic-cutaway-depth', 'instrumented-lab-depth'],
      'Fluid transport becomes stream ribbons, pressure bands, particles, and flow tubes.'
    ),
    mapping(
      'visual.operator.stress-fracture.v1',
      ['stress', 'strain', 'fracture', 'crack', 'collision', 'impact', 'load', 'buckling', 'constraint', 'constraints', 'bond', 'bridge', 'cable', 'cables', 'tension', 'resonance', 'vortex shedding'],
      ['sectioned-solid', 'crack-branch-network', 'constraint-contact-pad'],
      ['stress-contour-field', 'impulse-ring-field'],
      ['deformed-matte', 'fracture-edge'],
      ['threshold-fracture', 'contact-impulse'],
      ['deformation-pulse', 'crack-propagation'],
      ['cutaway-section-depth', 'dynamic-motion-depth'],
      'Mechanical stress becomes deformation, crack branches, contact pads, and strain contours.'
    ),
    mapping(
      'visual.operator.control-feedback.v1',
      ['control', 'controller', 'feedback', 'sensor', 'throttle', 'stabilize', 'regulate', 'loop'],
      ['controller-node', 'feedback-arc', 'sensor-probe'],
      ['state-error-field', 'setpoint-band'],
      ['signal-emissive', 'instrument-glass'],
      ['feedback-control', 'closed-loop-correction'],
      ['state-pulses', 'feedback-arcs'],
      ['instrumented-lab-depth', 'network-map-depth'],
      'Feedback control becomes sensors, setpoint bands, feedback arcs, and state pulses.'
    ),
    mapping(
      'visual.operator.orbital-gravity.v1',
      ['gravity', 'orbit', 'orbital', 'planet', 'moon', 'asteroid', 'rocket', 'space'],
      ['orbital-body', 'gravity-well-sheet', 'trajectory-arc'],
      ['gravity-contour-field', 'barycenter-marker-field'],
      ['astral-rim', 'dark-vacuum'],
      ['orbital-motion', 'gravitational-curvature'],
      ['trajectory-trails', 'barycenter-wobble'],
      ['orbital-depth', 'wide-system'],
      'Orbital mechanics becomes bodies, gravity wells, trails, and barycenter markers.'
    ),
    mapping(
      'visual.operator.electromagnetic-field.v1',
      ['magnetic', 'magnet', 'current', 'coil', 'charge', 'electric', 'voltage', 'plasma'],
      ['coil-loop', 'dipole-field-cage', 'charged-node'],
      ['vector-flux-lines', 'field-density-shell'],
      ['charged-trace', 'plasma-emissive'],
      ['field-advection', 'charge-transport'],
      ['flux-curling', 'spark-pulses'],
      ['instrumented-lab-depth', 'cutaway-section-depth'],
      'Electromagnetic systems become coils, flux lines, charged traces, and field shells.'
    ),
    mapping(
      'visual.operator.optical-ray.v1',
      ['light', 'sunlight', 'shadow', 'shadows', 'laser', 'lens', 'prism', 'mirror', 'photon', 'caustic', 'refraction', 'interference'],
      ['lens-stack', 'ray-cone', 'spectral-prism-slice'],
      ['phase-front-field', 'caustic-intensity-field'],
      ['transparent-caustic', 'spectral-emissive'],
      ['ray-refraction', 'interference-focus'],
      ['ray-sweep', 'phase-fringes'],
      ['instrumented-lab-depth', 'microscopic-cutaway-depth'],
      'Optics becomes ray cones, phase fronts, caustics, prisms, and spectral fringes.'
    ),
    mapping(
      'visual.operator.thin-film-interference.v1',
      ['thin film', 'thin-film', 'soap', 'soap film', 'wire loop', 'wire-loop', 'surface tension', 'iridescent', 'iridescence', 'interference', 'bubble', 'bubbles'],
      ['thin-film-sheet', 'wire-loop-frame', 'interference-bubble-cell'],
      ['phase-front-field', 'caustic-intensity-field'],
      ['transparent-caustic', 'spectral-emissive', 'wet-refractive'],
      ['thin-film-interference', 'surface-tension-relaxation'],
      ['iridescent-fringes', 'bubble-breathing'],
      ['microscopic-cutaway-depth', 'instrumented-lab-depth'],
      'Thin-film interference becomes wire-loop film sheets, iridescent phase bands, and surface-tension bubble motion.'
    ),
    mapping(
      'visual.operator.quantum-phase-readout.v1',
      ['qubit', 'quantum', 'microwave', 'resonator', 'phase', 'interference', 'superconducting'],
      ['superconducting-chip-plane', 'microwave-resonator-loop', 'phase-fringe-sheet'],
      ['probability-phase-field', 'microwave-standing-field'],
      ['cryogenic-metal', 'spectral-emissive'],
      ['quantum-readout', 'phase-interference'],
      ['phase-fringes', 'readout-pulse'],
      ['microscopic-cutaway-depth', 'instrumented-lab-depth'],
      'Quantum readout becomes resonator loops, phase fields, interference sheets, and pulses.'
    ),
    mapping(
      'visual.operator.acoustic-wave.v1',
      ['acoustic', 'sound', 'standing wave', 'standing waves', 'pressure wave', 'pressure waves', 'frequency', 'speaker', 'vibration', 'pressure ring', 'air pressure', 'levitator', 'waveguide', 'brass tube'],
      ['waveguide-tube', 'resonator-cavity', 'membrane-diaphragm'],
      ['pressure-ring-field', 'standing-node-field'],
      ['soft-pressure', 'instrument-glass'],
      ['wave-propagation', 'resonant-standing-wave'],
      ['pressure-rings', 'node-oscillation'],
      ['cutaway-section-depth', 'instrumented-lab-depth'],
      'Acoustics becomes pressure rings, resonator cavities, waveguides, and node motion.'
    ),
    mapping(
      'visual.operator.biological-growth.v1',
      ['biology', 'biological', 'biofilm', 'cell', 'protein', 'root', 'coral', 'algae', 'mycelium', 'membrane', 'microbe', 'microbiome', 'microbiota', 'bacteria', 'colony', 'colonies', 'intestinal', 'immune', 'metabolite', 'metabolites', 'yeast', 'ferment', 'fermentation', 'sourdough', 'dough', 'gluten', 'compost', 'greenhouse', 'nutrient', 'biomass', 'crop', 'plant', 'plants', 'flower', 'flowers', 'tree', 'trees', 'leaf', 'leaves', 'dog', 'dogs', 'cat', 'cats', 'animal', 'animals', 'mammal', 'mammals', 'mangrove', 'kelp', 'plankton'],
      ['branching-organic-network', 'membrane-sheet', 'cell-cluster'],
      ['nutrient-gradient-field', 'density-front-field'],
      ['fibrous-cellular', 'wet-biological'],
      ['growth-front', 'diffusion-limited-aggregation'],
      ['branch-expansion', 'cell-pulses'],
      ['microscopic-cutaway-depth', 'topographic-cutaway-depth'],
      'Biological change becomes branching networks, membranes, gradients, and growth fronts.'
    ),
    mapping(
      'visual.operator.fermentation-matrix.v1',
      ['ferment', 'fermentation', 'sourdough', 'yeast', 'dough', 'gluten', 'gas bubble', 'gas bubbles', 'bubble', 'bubbles', 'acidity', 'acid gradient', 'acidity gradient'],
      ['porous-dough-matrix', 'gluten-strand-network', 'fermentation-bubble-cell'],
      ['acidity-gradient-field', 'gas-pressure-pocket-field', 'nutrient-density-field'],
      ['viscoelastic-dough', 'wet-gluten-strands', 'carbon-dioxide-bubbles'],
      ['microbial-fermentation', 'gas-pocket-growth', 'acid-gradient-diffusion'],
      ['bubble-expansion', 'strand-deformation', 'slow-fermentation-pulses'],
      ['microscopic-cutaway-depth', 'macro-material-cross-section'],
      'Fermentation becomes porous dough, gluten strand matrices, expanding gas pockets, and acidity gradients.'
    ),
    mapping(
      'visual.operator.chemical-diffusion.v1',
      ['reaction', 'chemical', 'acid', 'acidic', 'acidity', 'crystal', 'concentration', 'electrolyte', 'solvent', 'catalyst', 'microfluidic', 'droplet', 'dose', 'fermentation'],
      ['reaction-vessel', 'diffusion-cloud-volume', 'crystal-facet-cluster'],
      ['concentration-isobands', 'reaction-front-field'],
      ['translucent-reagent', 'facet-crystal'],
      ['reaction-diffusion', 'crystallization-front'],
      ['concentration-pulse', 'facet-growth'],
      ['instrumented-lab-depth', 'microscopic-cutaway-depth'],
      'Chemical dynamics become vessels, concentration fields, reaction fronts, and crystals.'
    ),
    mapping(
      'visual.operator.network-flow.v1',
      ['network', 'queue', 'market', 'traffic', 'route', 'packet', 'server', 'parcel', 'zoning'],
      ['node-link-graph', 'parcel-grid', 'agent-token'],
      ['queue-pressure-field', 'constraint-overlay-field'],
      ['monitor-signal', 'map-surface'],
      ['routing-flow', 'constraint-propagation'],
      ['packet-pulses', 'agent-queue-motion'],
      ['network-map-depth', 'aerial-map-depth'],
      'Network systems become nodes, parcels, queue pressure, agents, and routing pulses.'
    ),
    mapping(
      'visual.operator.granular-erosion.v1',
      ['erosion', 'sediment', 'grain', 'sand', 'soil', 'avalanche', 'terrain', 'slope', 'mountain', 'mountains', 'mountaint', 'mountaints', 'dust', 'silo', 'explodes', 'explosion', 'powder', 'aerosol', 'granular', 'bead', 'beads', 'sieve', 'boulder', 'boulders'],
      ['heightfield-strata', 'grain-pile', 'erosion-channel'],
      ['slope-gradient-field', 'sediment-density-field'],
      ['granular-strata', 'wet-soil'],
      ['erosion-transport', 'settling-shear'],
      ['grain-settling', 'channel-cutting'],
      ['topographic-cutaway-depth', 'aerial-map-depth'],
      'Granular landscapes become strata, channel cuts, slope fields, and sediment motion.'
    ),
    mapping(
      'visual.operator.cryosphere-surface.v1',
      ['glacier', 'calving', 'iceberg', 'ice shelf', 'ice cliff', 'fjord', 'sea ice', 'cryosphere', 'meltwater', 'internal ocean wave', 'thermocline'],
      ['ice-cliff-shelf', 'calving-block-field', 'fjord-water-sheet'],
      ['cold-depth-field', 'fracture-plane-field'],
      ['ice-scattering', 'deep-water-glass'],
      ['calving-fracture', 'meltwater-mixing'],
      ['iceberg-drift', 'splash-plume'],
      ['topographic-cutaway-depth', 'wide-system'],
      'Cryosphere scenes become ice cliffs, calving blocks, fjord water, fracture planes, and drift.'
    ),
    mapping(
      'visual.operator.sport-trajectory.v1',
      ['skate', 'skateboard', 'rider', 'bowl', 'friction', 'centripetal', 'carve', 'carves', 'arc', 'trajectory', 'wheel', 'contact'],
      ['curved-bowl-surface', 'rider-trajectory-arc', 'wheel-contact-patch'],
      ['centripetal-vector-field', 'friction-loss-band'],
      ['concrete-bowl', 'rubber-contact'],
      ['rolling-contact', 'friction-dissipation'],
      ['carving-arc', 'wheel-skid-pulses'],
      ['dynamic-motion-depth', 'wide-system'],
      'Sport motion becomes curved bowls, rider trajectories, contact patches, and friction bands.'
    ),
    mapping(
      'visual.operator.instrument-readout.v1',
      ['detector', 'sensor', 'readout', 'instrument', 'probe', 'phototube', 'resonator', 'meter'],
      ['instrument-panel', 'probe-array', 'readout-strip'],
      ['measurement-sample-field', 'uncertainty-band-field'],
      ['clinical-glass', 'signal-emissive'],
      ['measurement-sampling', 'readout-integration'],
      ['scan-lines', 'measurement-pulses'],
      ['instrumented-lab-depth', 'microscopic-cutaway-depth'],
      'Instrumentation becomes probe arrays, readout strips, measurement bands, and pulses.'
    ),
    mapping(
      'visual.operator.particle-track-detector.v1',
      ['particle', 'collider', 'muon', 'muon track', 'muon tracks', 'detector slice', 'calorimeter', 'beamline', 'collision plume', 'track curvature'],
      ['detector-slice-stack', 'muon-track-ribbons', 'calorimeter-tile-array'],
      ['particle-track-field', 'collision-plume-field'],
      ['scintillator-glass', 'signal-emissive'],
      ['particle-collision-readout', 'track-curvature'],
      ['track-sweep', 'calorimeter-pulse'],
      ['microscopic-cutaway-depth', 'instrumented-lab-depth'],
      'Particle detectors become sliced calorimeters, curved muon tracks, collision plumes, and pulsing readout bands.'
    ),
    mapping(
      'visual.operator.thermal-combustion.v1',
      ['combustion', 'fire', 'flame', 'fuel', 'smoke', 'ember', 'ash', 'burn', 'explodes', 'explosion', 'dust', 'soot'],
      ['flame-front-volume', 'fuel-bed-surface', 'smoke-column'],
      ['reaction-heat-field', 'soot-density-field'],
      ['emissive-flame', 'charred-surface'],
      ['combustion-front', 'soot-transport'],
      ['ember-shear', 'smoke-rise'],
      ['cutaway-section-depth', 'dynamic-motion-depth'],
      'Combustion becomes flame fronts, fuel surfaces, soot fields, and ember motion.'
    ),
    mapping(
      'visual.operator.phase-transition.v1',
      ['phase', 'melt', 'melts', 'melting', 'freeze', 'freezes', 'freezing', 'crust', 'vaporize', 'vaporizes', 'vaporizing', 'condense', 'condenses', 'condensing', 'boil', 'boils', 'boiling', 'solidify', 'solidifies', 'solidifying'],
      ['phase-boundary-sheet', 'droplet-front', 'crystal-skin'],
      ['latent-heat-band', 'phase-fraction-field'],
      ['transparent-phase', 'emissive-boundary'],
      ['phase-front', 'latent-heat-exchange'],
      ['boundary-crawl', 'droplet-release'],
      ['cutaway-section-depth', 'instrumented-lab-depth'],
      'Phase transitions become moving boundaries, latent heat bands, droplets, and skins.'
    ),
    mapping(
      'visual.operator.robot-contact.v1',
      ['robot', 'robotic', 'gripper', 'servo', 'workcell', 'manipulator', 'pick and place', 'contact force'],
      ['robot-armature', 'contact-cone', 'workcell-grid'],
      ['force-cone-field', 'task-queue-field'],
      ['brushed-metal', 'monitor-signal'],
      ['servo-control', 'contact-force'],
      ['servo-arcs', 'pick-place-pulses'],
      ['instrumented-lab-depth', 'network-map-depth'],
      'Robotic work becomes armatures, force cones, workcells, queues, and servo pulses.'
    )
  ]);

  function mapping(
    id,
    matchTerms,
    geometryAtoms,
    fieldAtoms,
    materialAtoms,
    processAtoms,
    motionAtoms,
    cameraAtoms,
    receiptText
  ) {
    return Object.freeze({
      id,
      matchTerms,
      requires: requiredTermsForMapping(id, matchTerms),
      excludes: excludedTermsForMapping(id),
      minimumScore: minimumScoreForMapping(id),
      priority: priorityForMapping(id),
      uniformSlots: uniformSlotsForMapping(id),
      wgslOperators: wgslOperatorsForMapping(id),
      geometryAtoms,
      fieldAtoms,
      materialAtoms,
      processAtoms,
      motionAtoms,
      cameraAtoms,
      receiptText,
    });
  }

  function requiredTermsForMapping(id, matchTerms = []) {
    // Direct-evidence validation and atlas scoring must share one vocabulary.
    // Negation is enforced by the compiler against the evidence row itself;
    // maintaining a second synonym list here caused valid inflections and
    // domains to score an operator and then fail its proof gate.
    return Object.freeze([Object.freeze(Array.from(new Set(matchTerms.filter(Boolean))))]);
  }

  function excludedTermsForMapping(id) {
    const rules = {
      'visual.operator.network-flow.v1': ['photon-only', 'molecular-only', 'pure-orbit'],
      'visual.operator.fluid-advection.v1': ['vacuum-only', 'dry-network-only'],
      'visual.operator.fermentation-matrix.v1': ['thin film', 'thin-film', 'soap', 'soap film', 'wire loop', 'wire-loop', 'iridescent', 'iridescence'],
      'visual.operator.optical-ray.v1': ['opaque-market-only', 'soil-only'],
      'visual.operator.quantum-phase-readout.v1': ['macroscopic-traffic-only'],
      'visual.operator.robot-contact.v1': ['fluid-only', 'orbital-only'],
    };
    return Object.freeze(rules[id] || []);
  }

  function minimumScoreForMapping(id) {
    if (/instrument-readout/.test(id)) return 0.42;
    if (/quantum|robot|orbital|control-feedback/.test(id)) return 0.56;
    return 0.5;
  }

  function priorityForMapping(id) {
    if (/quantum|robot|control-feedback|sport-trajectory|cryosphere-surface|fermentation-matrix|thin-film-interference|particle-track-detector/.test(id)) return 1.18;
    if (/heat-transfer|fluid-advection|network-flow|phase-transition/.test(id)) return 1.1;
    if (/instrument-readout/.test(id)) return 0.92;
    return 1;
  }

  function uniformSlotsForMapping(id) {
    const slots = {
      'visual.operator.heat-transfer.v1': ['thermal', 'phase', 'emission', 'motion'],
      'visual.operator.fluid-advection.v1': ['fluid', 'motion', 'density', 'surface'],
      'visual.operator.stress-fracture.v1': ['stress', 'constraint', 'surface', 'motion'],
      'visual.operator.control-feedback.v1': ['feedback', 'signal', 'constraint'],
      'visual.operator.orbital-gravity.v1': ['orbital', 'motion', 'density', 'surface'],
      'visual.operator.electromagnetic-field.v1': ['electromagnetic', 'signal', 'emission', 'motion'],
      'visual.operator.optical-ray.v1': ['optical', 'emission', 'signal', 'surface'],
      'visual.operator.thin-film-interference.v1': ['phase', 'optical', 'surface', 'emission', 'motion'],
      'visual.operator.quantum-phase-readout.v1': ['quantum', 'phase', 'instrument', 'signal'],
      'visual.operator.acoustic-wave.v1': ['acoustic', 'motion', 'density', 'instrument'],
      'visual.operator.biological-growth.v1': ['biological', 'density', 'motion', 'surface'],
      'visual.operator.fermentation-matrix.v1': ['biological', 'chemical', 'fluid', 'density', 'motion', 'surface'],
      'visual.operator.chemical-diffusion.v1': ['chemical', 'density', 'phase', 'surface'],
      'visual.operator.network-flow.v1': ['network', 'constraint', 'signal', 'motion'],
      'visual.operator.granular-erosion.v1': ['granular', 'density', 'surface', 'motion'],
      'visual.operator.cryosphere-surface.v1': ['phase', 'fluid', 'stress', 'surface', 'motion'],
      'visual.operator.sport-trajectory.v1': ['motion', 'stress', 'constraint', 'surface'],
      'visual.operator.instrument-readout.v1': ['instrument', 'measurement', 'signal'],
      'visual.operator.particle-track-detector.v1': ['instrument', 'measurement', 'signal', 'emission', 'motion'],
      'visual.operator.thermal-combustion.v1': ['combustion', 'thermal', 'emission', 'density'],
      'visual.operator.phase-transition.v1': ['phase', 'surface', 'motion'],
      'visual.operator.robot-contact.v1': ['robotic', 'constraint', 'motion'],
    };
    return Object.freeze(slots[id] || ['instrument', 'measurement']);
  }

  function wgslOperatorsForMapping(id) {
    const operators = {
      'visual.operator.heat-transfer.v1': ['atomThermalPlume', 'atomPhaseBoundary'],
      'visual.operator.fluid-advection.v1': ['atomFluidRibbons', 'atomVectorFlow'],
      'visual.operator.stress-fracture.v1': ['atomStressCracks', 'atomConstraintPads'],
      'visual.operator.control-feedback.v1': ['atomFeedbackArcs', 'atomSignalPulses'],
      'visual.operator.orbital-gravity.v1': ['atomOrbitalTrails', 'atomGravityWell'],
      'visual.operator.electromagnetic-field.v1': ['atomFluxLines', 'atomChargeShell'],
      'visual.operator.optical-ray.v1': ['atomOpticalCaustics', 'atomRayCones'],
      'visual.operator.thin-film-interference.v1': ['atomOpticalCaustics', 'atomQuantumFringes'],
      'visual.operator.quantum-phase-readout.v1': ['atomQuantumFringes', 'atomReadoutPulse'],
      'visual.operator.acoustic-wave.v1': ['atomAcousticRings', 'atomStandingNodes'],
      'visual.operator.biological-growth.v1': ['atomBiologicalBranches', 'atomDensityFront'],
      'visual.operator.fermentation-matrix.v1': ['atomFermentationBubbles', 'atomGlutenStrands', 'atomAcidityGradient'],
      'visual.operator.chemical-diffusion.v1': ['atomChemicalClouds', 'atomReactionFront'],
      'visual.operator.network-flow.v1': ['atomNetworkPressure', 'atomPacketPulses'],
      'visual.operator.granular-erosion.v1': ['atomGranularStrata', 'atomSedimentMotion'],
      'visual.operator.cryosphere-surface.v1': ['atomPhaseBoundary', 'atomFluidRibbons', 'atomStressCracks'],
      'visual.operator.sport-trajectory.v1': ['atomConstraintPads', 'atomFeedbackArcs'],
      'visual.operator.instrument-readout.v1': ['atomInstrumentReadout', 'atomMeasurementBands'],
      'visual.operator.particle-track-detector.v1': ['atomInstrumentReadout', 'atomQuantumFringes', 'atomFeedbackArcs'],
      'visual.operator.thermal-combustion.v1': ['atomCombustionFront', 'atomSootColumn'],
      'visual.operator.phase-transition.v1': ['atomPhaseBoundary', 'atomLatentHeatBand'],
      'visual.operator.robot-contact.v1': ['atomRobotWorkcell', 'atomContactForces'],
    };
    return Object.freeze(operators[id] || ['atomInstrumentReadout']);
  }

  function compileVisualGraphicsAtoms(context = {}) {
    const text = contextText(context);
    const matched = VISUAL_OPERATOR_MAPPINGS
      .map((row, index) => ({ row, index, score: mappingScore(row, text, context) }))
      .filter((entry) => entry.score >= 0.5)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 6)
      .map((entry) => ({
        id: entry.row.id,
        score: Number(entry.score.toFixed(3)),
        matchedTerms: entry.row.matchTerms.filter((term) => text.includes(term)),
        receiptText: entry.row.receiptText,
      }));
    const source = matched.length ? matched : [fallbackMapping(context)];
    return {
      schema: GRAPHICS_ATOM_PLAN_SCHEMA,
      atlas: VISUAL_OPERATOR_ATLAS_SCHEMA,
      atlasId: 'simulatte-visual-operator-atlas-v1',
      source: 'handwritten-operator-graphics-basis',
      mappings: source,
      geometry: atomsForCategory(source, 'geometryAtoms', 'geometry'),
      fields: atomsForCategory(source, 'fieldAtoms', 'field'),
      materials: atomsForCategory(source, 'materialAtoms', 'material'),
      processes: atomsForCategory(source, 'processAtoms', 'process'),
      motion: atomsForCategory(source, 'motionAtoms', 'motion'),
      camera: atomsForCategory(source, 'cameraAtoms', 'camera'),
      receipts: source.map((row) => ({
        id: `receipt:${row.id}`,
        reason: row.receiptText,
        score: row.score,
        matchedTerms: row.matchedTerms || [],
      })),
      uniforms: emptyUniformPlan(),
      wgslOperators: uniqueStrings(source.flatMap((row) => {
        const atlasRow = VISUAL_OPERATOR_MAPPINGS.find((item) => item.id === row.id);
        return atlasRow && atlasRow.wgslOperators || [];
      })),
      rejections: [],
    };
  }

  function emptyUniformPlan() {
    return {
      schema: GRAPHICS_ATOM_UNIFORMS_SCHEMA,
      order: VISUAL_ATOM_UNIFORM_SLOTS.slice(),
      values: VISUAL_ATOM_UNIFORM_SLOTS.map(() => 0),
      bySlot: Object.fromEntries(VISUAL_ATOM_UNIFORM_SLOTS.map((slot) => [slot, 0])),
    };
  }

  function atomsForCategory(matched, key, category) {
    const byId = new Map();
    for (const match of matched || []) {
      const row = VISUAL_OPERATOR_MAPPINGS.find((item) => item.id === match.id);
      for (const atomId of row && row[key] || []) {
        if (!byId.has(atomId)) {
          byId.set(atomId, {
            id: atomId,
            category,
            label: labelize(atomId),
            sourceMappingIds: [],
            evidence: [],
          });
        }
        const atom = byId.get(atomId);
        atom.sourceMappingIds.push(match.id);
        atom.evidence.push(`mapping:${match.id}`);
      }
    }
    return Array.from(byId.values()).slice(0, 18);
  }

  function mappingScore(row, text, context) {
    let score = 0;
    for (const term of row.matchTerms || []) {
      if (text.includes(term)) score += term.includes('_') || term.includes('-') ? 0.32 : 0.22;
    }
    const sceneKind = String(context.sceneKind || '').toLowerCase();
    if (sceneKind && row.matchTerms.some((term) => sceneKind.includes(term))) score += 0.28;
    return score;
  }

  function fallbackMapping(context) {
    const sceneKind = String(context.sceneKind || 'compiled').toLowerCase();
    return {
      id: 'visual.operator.instrument-readout.v1',
      score: 0.2,
      matchedTerms: sceneKind ? [sceneKind] : [],
      receiptText: 'Fallback graphics basis records compiled state with probes and measurement pulses.',
    };
  }

  function contextText(context) {
    const objects = (context.objects || []).filter(isEvidenceObject);
    return [
      context.sceneKind,
      ...objects.map((object) => [
        object.id,
        object.shape,
        object.role,
        object.phrase,
        object.assembly,
        object.visualRegime,
      ].filter(Boolean).join(' ')),
      ...(context.fields || []).map((field) => [
        field.id,
        field.kind,
        field.channel,
        field.stateBinding,
        field.domainId,
      ].filter(Boolean).join(' ')),
      ...((context.solverPlan && context.solverPlan.steps) || []),
      ...((context.solverPlan && context.solverPlan.executableSteps) || []),
      ...((context.causalAffordances || []).map((row) => [
        row.id,
        row.causalRelationId,
        row.sceneKind,
        row.geometry,
        ...(row.shaderHints || []),
        ...(row.motionHints || []),
      ].filter(Boolean).join(' '))),
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function isEvidenceObject(object) {
    const source = String(object && object.source || '');
    if (!object || source === 'catalog') return false;
    return Boolean(source || object.phrase || object.semanticRef || object.physicalRef);
  }

  function labelize(value) {
    return String(value || '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function uniqueStrings(rows) {
    return Array.from(new Set((rows || []).filter(Boolean)));
  }

  return {
    GRAPHICS_ATOM_UNIFORMS_SCHEMA,
    GRAPHICS_ATOM_PLAN_SCHEMA,
    VISUAL_ATOM_UNIFORM_SLOTS,
    VISUAL_OPERATOR_ATLAS_SCHEMA,
    VISUAL_OPERATOR_MAPPINGS,
    compileVisualGraphicsAtoms,
  };
});
