(function attachSimulatteRenderRegistry(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.SimulatteRenderRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createRenderRegistryApi() {
  const RENDER_REGISTRY_SCHEMA = 'simulatte.renderRegistry.v1';

  const MATERIAL_STYLES = Object.freeze({
    air: style('#dff7ff', '#70b8d0', 0.18),
    biomass: style('#75b65c', '#315a32', 0.68),
    fire: style('#ff9857', '#c24a5b', 0.78),
    glass: style('#dff9ff', '#65b9df', 0.34),
    gold: style('#ffd760', '#a86b23', 0.86),
    ice: style('#def8ff', '#78bde2', 0.6),
    lava: style('#ff743a', '#7b2519', 0.9),
    membrane: style('#eadcff', '#9d82cc', 0.42),
    metal: style('#b8c2cc', '#5d6772', 0.76),
    rock: style('#928b80', '#4d4943', 0.84),
    sand: style('#d8ba76', '#936733', 0.76),
    silicon: style('#9db5ca', '#546b7d', 0.64),
    smoke: style('#adb3b8', '#687077', 0.28),
    water: style('#57b7e8', '#1f6a9a', 0.62),
    wood: style('#9b6236', '#56341d', 0.8),
  });

  const EXPANDED_SCENE_RULES = Object.freeze([
    sceneRule(
      'weather-atmosphere',
      /\b(supercell|thunderstorm|hail|cloud microphysics|monsoon|atmospheric river|jetstream|storm cell|rain band|convection)\b/,
      'watershed',
      'atmosphere',
      ['thermal', 'gravity', 'force-field'],
      ['clear', 'sky-volume', 'shear-bands', 'precipitation-fronts', 'pressure-readout']
    ),
    sceneRule(
      'ocean-cryosphere',
      /\b(glacier calving|fjord|sea ice|ice shelf|iceberg|internal ocean wave|internal ocean waves|kelp canopy|ocean mixing|plankton bloom|thermocline)\b/,
      'watershed',
      'ocean',
      ['gravity', 'thermal', 'force-field'],
      ['clear', 'water-column', 'ice-or-kelp-structure', 'mixing-fronts', 'salinity-ledger']
    ),
    sceneRule(
      'grid-energy',
      /\b(microgrid|battery inverter|inverter|transformer overload|substation|power flow|load shedding|frequency control|grid storage|voltage sag)\b/,
      'city',
      'energy-grid',
      ['network-flow', 'thermal', 'force-field'],
      ['clear', 'grid-topology', 'power-flow', 'thermal-hotspots', 'stability-ledger']
    ),
    sceneRule(
      'robotics-control',
      /\b(warehouse robot|warehouse robots|robot arm|robot arms|robotic gripper|robot gripper|servo gripper|servo loop|drone swarm|autopilot|path planner|pick and place|pick-and-place|mobile robot|robot sorts|robot sort|contact force workcell|robotic workcell)\b/,
      'mechanical',
      'robotics',
      ['force-field', 'network-flow'],
      ['clear', 'workspace-map', 'manipulator-poses', 'control-signals', 'task-ledger']
    ),
    sceneRule(
      'manufacturing-line',
      /\b(injection molding|steel tooling|assembly line|conveyor belt|conveyor belts|cnc|extruder|cooling die|factory line|pick station)\b/,
      'mechanical',
      'manufacturing',
      ['thermal', 'force-field', 'network-flow'],
      ['clear', 'machine-cells', 'material-flow', 'thermal-cycle', 'quality-readout']
    ),
    sceneRule(
      'quantum-instrument',
      /\b(qubit|quantum chip|phase readout|microwave resonator|superconducting circuit|ion trap|spin lattice|photonic chip|wavefunction|electron microscope)\b/,
      'optics',
      'quantum',
      ['optical-rays', 'dipole', 'force-field'],
      ['clear', 'chip-cutaway', 'phase-field', 'readout-cones', 'coherence-ledger']
    ),
    sceneRule(
      'agro-waste-loop',
      /\b(compost|greenhouse crop|greenhouse crops|anaerobic digester|organic waste|nutrient loop|crop rotation|fish farm|soil nutrients|algae bioreactor)\b/,
      'biology',
      'agro-loop',
      ['thermal', 'force-field', 'gravity'],
      ['clear', 'resource-loop', 'biomass-beds', 'oxygen-water-flow', 'yield-ledger']
    ),
    sceneRule(
      'particle-instrument',
      /\b(neutrino|muon|particle collider|calorimeter|phototube|detector slice|water tank detector|underground water tank|cherenkov|photon cone)\b/,
      'optics',
      'instrument',
      ['optical-rays', 'force-field'],
      ['clear', 'detector-volume', 'particle-tracks', 'sensor-array', 'event-readout']
    ),
    sceneRule(
      'molecular-biology',
      /\b(protein folding|protein fold|bond constraint|energy minimization|ribosome|enzyme|molecular chain|amino acid|ligand|molecule|fermentation|sourdough|gluten|dough matrix|yeast|microbial fermentation)\b/,
      'biology',
      'molecular',
      ['force-field', 'thermal'],
      ['clear', 'molecular-chain', 'energy-surface', 'bond-constraints', 'collapse-motion']
    ),
    sceneRule(
      'advanced-energy',
      /\b(fusion|stellarator|tokamak|plasma ribbon|nuclear waste|geologic repository|hydrogen electrolyzer|electrolyzer|fuel cell|molten salt|heat decay)\b/,
      'material-tray',
      'energy',
      ['thermal', 'dipole', 'force-field'],
      ['clear', 'containment-cutaway', 'field-cage', 'energy-flow', 'diagnostics']
    ),
    sceneRule(
      'digital-network',
      /\b(cyber|blockchain|mempool|recommendation|search|query|index|server|server rack|cooling aisle|compiler|database|tensor|packet|service graph|data center|edge data)\b/,
      'city',
      'digital',
      ['network-flow', 'force-field'],
      ['clear', 'service-topology', 'packet-flow', 'latency-ledger', 'hotspots']
    ),
    sceneRule(
      'civic-market',
      /\b(housing|power market|carbon credit|supply demand|bullwhip|transit priority|dispatch|policy|audit ledger|zoning|shadow allocation)\b/,
      'city',
      'civic',
      ['network-flow', 'force-field'],
      ['clear', 'civic-grid', 'agent-flow', 'constraint-ledger', 'outcomes']
    ),
    sceneRule(
      'chemistry-lab',
      /\b(chemical clock|belousov|polymer|epoxy|crosslink|electroplat|catalyst|ammonia|crystal nucleation|reaction dish|reaction vessel|microfluidic|droplet|droplets|channel junction)\b/,
      'material-tray',
      'chemistry',
      ['thermal', 'force-field'],
      ['clear', 'vessel-cutaway', 'reaction-front', 'phase-map', 'readouts']
    ),
    sceneRule(
      'cultural-material',
      /\b(museum preservation|archive preservation|pigment film|varnish aging|ceramic glaze|artwork aging|oil paint aging|paper humidity|conservation lab)\b/,
      'material-tray',
      'cultural-material',
      ['thermal', 'force-field'],
      ['clear', 'artifact-section', 'humidity-field', 'material-aging', 'conservation-ledger']
    ),
    sceneRule(
      'planetary-space',
      /\b(radio telescope|deep space|microwave|beamforming|probe|antenna|planet|asteroid|mars|venus|europa|titan|interstellar|dark matter|galaxy cluster|comet|black hole|singularity|orbital|orbiting mirror|planetary ring|planetary rings|shepherd moon|moon resonance|orbital resonance)\b/,
      'optics',
      'space',
      ['optical-rays', 'gravity', 'force-field'],
      ['clear', 'orbital-depth', 'instrument-rays', 'gravity-contours', 'tracklets']
    ),
    sceneRule(
      'venue-crowd',
      /\b(festival|stadium|restaurant|hotel|elevator|venue|crowd agents|fan agents|order queue|platform slots)\b/,
      'city',
      'crowd',
      ['network-flow', 'force-field'],
      ['clear', 'venue-plan', 'crowd-density', 'queue-pulses', 'service-nodes']
    ),
    sceneRule(
      'sport-motion',
      /\b(skate|skateboard|ski|surf|sailing|archery|fairground|mountain bike|rider agents|gait trials|walkway trials|curved bowl|friction loss)\b/,
      'mechanical',
      'motion',
      ['force-field', 'gravity'],
      ['clear', 'track-space', 'body-motion', 'constraint-arcs', 'impulse-trails']
    ),
    sceneRule(
      'structural-mechanics',
      /\b(bridge resonance|vortex shedding|wind vortex|bridge cable|bridge cables|structural mode|modal vibration|aeroelastic|flutter)\b/,
      'mechanical',
      'mechanical',
      ['force-field', 'gravity'],
      ['clear', 'structure-span', 'vortex-street', 'modal-deflection', 'stress-readout']
    ),
    sceneRule(
      'clinical-control',
      /\b(robot surgery|prosthetic|rehab|vaccine|hospital|clinical|patient|tissue mesh|sensor skin|muscle activation|bedflow|triage|blood pump)\b/,
      'biology',
      'clinical',
      ['force-field', 'network-flow'],
      ['clear', 'body-system', 'control-loop', 'sensor-field', 'risk-ledger']
    ),
    sceneRule(
      'evolution-ecology',
      /\b(population genetics|allele|succession|predator|prey|pollinator|fish school|bird flock|animal trail|crop|greenhouse|algae bioreactor|compost|landfill|recycling|microbiome|coral reef)\b/,
      'biology',
      'ecology',
      ['force-field', 'gravity'],
      ['clear', 'habitat-layers', 'population-flow', 'resource-gradient', 'feedbacks']
    ),
    sceneRule(
      'restoration-water',
      /\b(water treatment|peatland|oyster reef|desertification|restoration|rewetting|nitrification|living breakwater|mangrove|storm surge|aquifer)\b/,
      'watershed',
      'restoration',
      ['gravity', 'force-field'],
      ['clear', 'terrain-water', 'habitat-structures', 'attenuation-field', 'ledger']
    ),
    sceneRule(
      'hazard-atmosphere',
      /\b(earthquake|tsunami|hurricane|tornado|mine ventilation|tunnel boring|urban heat|noise pollution|light pollution|air quality|hazard|evacuation|jetstream|drought)\b/,
      'watershed',
      'hazard',
      ['gravity', 'thermal', 'force-field'],
      ['clear', 'hazard-map', 'fronts', 'exposure-field', 'damage-ledger']
    ),
  ]);

  function style(fill, stroke, alpha) {
    return { fill, stroke, alpha };
  }

  function sceneRule(id, pattern, painterKind, dominantRegime, fieldKinds, passOrder) {
    return { id, pattern, painterKind, dominantRegime, fieldKinds, passOrder };
  }

  function glyphForEntity(entity = {}, domain = {}) {
    const text = `${entity.label || ''} ${entity.canonicalId || ''} ${domain.kind || ''}`.toLowerCase();
    if (/volcano/.test(text)) return 'volcano';
    if (/lava|magma/.test(text)) return 'lava';
    if (/turbine|rotor|wheel/.test(text)) return 'turbine';
    if (/bridge|cable/.test(text)) return 'bridge';
    if (/tower/.test(text)) return 'tower';
    if (/castle|wall|cathedral/.test(text)) return 'castle';
    if (/ice/.test(text)) return 'ice';
    if (/lens/.test(text)) return 'lens';
    if (/prism/.test(text)) return 'prism';
    if (/mirror/.test(text)) return 'mirror';
    if (/glass|quartz/.test(text) && /field|optic|solid/.test(`${text} ${(domain.tags || []).join(' ')}`)) return 'lens';
    if (/fire|flame|combust/.test(text)) return 'flame';
    if (/smoke|plume/.test(text)) return 'smoke';
    if (/storm|cloud|wind/.test(text)) return 'storm';
    if (/swamp|wetland/.test(text)) return 'wetland';
    if (/river|water|rain|flow/.test(text)) return 'fluid_path';
    if (/projectile|hammer/.test(text)) return 'projectile';
    if (/rocket/.test(text)) return 'rocket';
    if (/submarine/.test(text)) return 'submarine';
    if (/piano/.test(text)) return 'instrument';
    if (/network|queue|traffic|city|market/.test(text)) return 'network';
    if (/algae|jellyfish|bio/.test(text)) return 'organism';
    if (domain.kind === 'field') return 'field';
    if (domain.kind === 'particleSet') return 'particle_cloud';
    return 'body';
  }

  function materialStyle(materialId = '') {
    return MATERIAL_STYLES[materialId] || MATERIAL_STYLES.metal;
  }

  function visualRegimeForDomain(domain = {}) {
    const text = [
      domain.kind,
      domain.materialId,
      ...(domain.tags || []),
      ...(domain.operatorHints || []),
    ].join(' ').toLowerCase();
    if (/surface|thin-film|surface_tension/.test(text)) return 'optical';
    if (/magnetism|magnetic_field|ferrofluid/.test(text)) return 'magnetic';
    if (/optics|field_refraction|field_reflection/.test(text)) return 'optical';
    if (/lava|fire|thermal|phase/.test(text)) return 'thermal';
    if (/fluid|water|rain|wind/.test(text)) return 'fluid';
    if (/network|queue|control/.test(text)) return 'network';
    if (/wave|oscillator|acoustic/.test(text)) return 'wave';
    if (/growth|bio/.test(text)) return 'biology';
    if (/fracture|collision|rigid/.test(text)) return 'mechanical';
    if (/field|magnet|optic/.test(text)) return 'field';
    return 'material';
  }

  function sceneHintForObjects(objects = [], physicsIR = {}, solverGraph = {}) {
    const signal = sceneSignals(objects, physicsIR, solverGraph);
    const text = signal.text;
    if (isStrongLiteralCompositeSignal(signal)) return 'literal-composite';
    const expanded = sceneHintForText(physicsIR.prompt || '');
    if (expanded) return expanded;
    if (hasRoboticsSignal(text)) return 'robotics-control';
    if (hasChemistryLabSignal(text)) return 'chemistry-lab';
    if (hasGranularCombustionSignal(text)) return 'granular';
    if (hasThinFilmSignal(text)) {
      return 'thin-film';
    }
    if (isMaterialTraySignal(signal)) return 'material-tray';
    if (/thermal plume|cooling|cooler|cooling-fin|smoke over cooling/.test(text) && hasThermal(signal)) {
      return 'thermal-plume';
    }
    if ((signal.glyphs.has('flame') || /process-fire|combustion|fuel|burn/.test(text)) &&
      (/reaction_diffusion|heat_source|burn/.test(text))) {
      return 'fire';
    }
    if (/lens|prism|mirror|optics|field_refraction|field_reflection|light_source|laser/.test(text)) {
      return 'optics';
    }
    if (/network|queue|traffic|market|network_flow|backlog|throughput/.test(text)) return 'city';
    if (/wheel|rotor|stator|slider|sliding|electromagnetism|magnetic_force|rotor-wheel/.test(text) && /magnet|magnetic/.test(text)) {
      return 'magnetic-machine';
    }
    if (/ferrofluid|magnetic_fluid|magnetizes|spikes|magnetic_field/.test(text)) return 'ferrofluid';
    if (/\b(terrain|erosion|sediment|river|rain|basalt|watershed|gravity)\b/.test(text)) return 'watershed';
    if (/acoustic|sound|wave_field|waveApparatus|resonance|amplitude/.test(text) &&
      !/biology|growth|mycelium|bacteria|membrane|protein|nutrient|biofilm|density/.test(text)) {
      return 'acoustic';
    }
    if (/granular|grain|bead|sieve|avalanche|powder/.test(text)) {
      return 'granular';
    }
    if (/growth_decay|reaction_diffusion|mycelium|bacteria|biofilm|fermentation|nutrient/.test(text)) {
      return 'biology';
    }
    if (/rigid_collision|fracture_threshold|rotational_torque|projectile|collision/.test(text) &&
      !/acoustic|sound|wave_field|waveApparatus|resonance|amplitude/.test(text)) {
      return 'mechanical';
    }
    if (/biology|growth|mycelium|bacteria|membrane|protein|nutrient|biofilm|density/.test(text)) {
      return 'biology';
    }
    if (/acoustic|sound|wave_field|waveApparatus|resonance|amplitude/.test(text)) return 'acoustic';
    if (signal.kinds.has('fluid') && signal.operators.has('advection')) return 'watershed';
    if (isLiteralCompositeSignal(signal)) return 'literal-composite';
    return 'generic';
  }

  function hasRoboticsSignal(text = '') {
    const positive = positiveLanguageText(text);
    return /\b(robot|robotic|gripper|servo|workcell|manipulator|pick-place|pick and place|contact force)\b/.test(positive) &&
      /\b(robot|robotic|gripper|servo|manipulator|workcell)\b/.test(positive);
  }

  function hasChemistryLabSignal(text = '') {
    return /\b(microfluidic|droplet|droplets|channel junction|meniscus|reagent|reaction vessel|catalyst|dose|insulin pump)\b/.test(text) &&
      !/\b(warehouse|traffic|market|orbit|planet|battery runaway|heat plume)\b/.test(text);
  }

  function hasGranularCombustionSignal(text = '') {
    if (/\b(rain|river|water|watershed|terrain|erosion|erodes|mountain|delta|channel)\b/.test(text) &&
      !/\b(dust|powder|silo|aerosol|explode|explodes|explosion)\b/.test(text)) {
      return false;
    }
    return /\b(grain|dust|powder|silo|aerosol|bead|sand|avalanche)\b/.test(text) &&
      /\b(explode|explodes|explosion|combust|burn|ignite|silo|avalanche|sieve|grain bed|bead stream)\b/.test(text);
  }

  function hasThinFilmSignal(text = '') {
    const positive = positiveLanguageText(text);
    return /\b(thin-film|thin film|soap|wire-loop|wire loop|surface_tension|iridescen)\b/.test(positive) ||
      (/\b(air bubble|air bubbles|bubble|bubbles)\b/.test(positive) &&
        /\b(soap|film|wire|loop|iridescen|surface tension|surface_tension)\b/.test(positive));
  }

  function sceneHintForText(value = '') {
    const text = positiveLanguageText(value);
    if (/\b(galaxy|galaxies|nebula|black hole|event horizon|planet|planets|moon|moons|star|stars|solar system)\b/.test(text)) {
      return 'planetary-space';
    }
    if (/\b(earthquake|tsunami|hurricane|tornado|wildfire|evacuation|air quality|hazard|mine ventilation|tunnel boring|urban heat|drought)\b/.test(text)) {
      return 'hazard-atmosphere';
    }
    // Compiled thermal primitives can carry a `fire` materialId, so a bare fire token is
    // ambiguous. A lava/magma/molten/steam scene is thermal-plume, not combustion; real
    // fire prompts (forest fire, dry pine, warehouse fire) carry none of those.
    if (/\b(fire|flame|burn|burning|combust|smoke plume)\b/.test(text) &&
      !/\b(lava|magma|molten|steam)\b/.test(text)) {
      return 'fire';
    }
    const row = EXPANDED_SCENE_RULES.find((rule) => rule.pattern.test(text));
    return row ? row.id : '';
  }

  function positiveLanguageText(value = '') {
    const word = "[a-z0-9]+(?:[-'][a-z0-9]+)*";
    const stop = '(?:and|with|while|where|when|because|but|however|though|although|unless|inside|outside|near|around|between|against|across|during|through|then|so)';
    const negated = new RegExp(`\\b(?:no|not|never|none|without|cannot|can't|wont|won't|avoid|exclude|except)\\b(?:\\s+(?:a|an|the|any))?(?:\\s+(?!\\b${stop}\\b)${word}){1,6}`, 'gi');
    return String(value || '').toLowerCase().replace(negated, ' ').replace(/\s+/g, ' ').trim();
  }

  function painterKindForScene(sceneKind = '') {
    const row = EXPANDED_SCENE_RULES.find((rule) => rule.id === sceneKind);
    if (row) return row.painterKind;
    if (sceneKind === 'generic' || sceneKind === 'literal-composite') return 'mechanical';
    return String(sceneKind || 'generic');
  }

  function recipeForScene(sceneKind = '') {
    const row = EXPANDED_SCENE_RULES.find((rule) => rule.id === sceneKind);
    if (!row) return null;
    return {
      schema: 'simulatte.renderRecipe.v1',
      source: 'handwritten-semantic-render-taxonomy.v1',
      sceneKind: row.id,
      painterKind: row.painterKind,
      dominantRegime: row.dominantRegime,
      fieldKinds: row.fieldKinds.slice(),
      passOrder: row.passOrder.slice(),
      camera: cameraForExpandedScene(row.id),
      layerPlan: layerPlanForExpandedScene(row.id),
      materialLanguage: materialLanguageForExpandedScene(row.id),
      motionGrammar: motionGrammarForExpandedScene(row.id),
    };
  }

  function cameraForExpandedScene(sceneKind) {
    if (/molecular/.test(sceneKind)) return 'microscopic-cutaway-depth';
    if (/quantum/.test(sceneKind)) return 'microscopic-cutaway-depth';
    if (/planetary|hazard|restoration|civic|digital|venue/.test(sceneKind)) return 'aerial-map-depth';
    if (/weather|ocean|grid/.test(sceneKind)) return 'aerial-map-depth';
    if (/clinical|chemistry|advanced|cultural/.test(sceneKind)) return 'cutaway-section-depth';
    if (/robotics|manufacturing/.test(sceneKind)) return 'instrumented-lab-depth';
    if (/sport|structural/.test(sceneKind)) return 'dynamic-motion-depth';
    return 'instrumented-lab-depth';
  }

  function layerPlanForExpandedScene(sceneKind) {
    if (/molecular/.test(sceneKind)) return ['energy-surface', 'chain-geometry', 'bond-constraints', 'collapse-motion', 'state-readouts'];
    if (/digital|civic|venue/.test(sceneKind)) return ['substrate-map', 'agent-nodes', 'routing-lines', 'queue-pressure', 'receipts'];
    if (/grid/.test(sceneKind)) return ['grid-map', 'power-nodes', 'load-flow', 'thermal-hotspots', 'stability-receipts'];
    if (/planetary/.test(sceneKind)) return ['deep-field', 'orbit-arcs', 'instrument-cones', 'gravity-rings', 'tracklets'];
    if (/weather/.test(sceneKind)) return ['sky-volume', 'wind-shear', 'cloud-cells', 'precipitation-fronts', 'pressure-readouts'];
    if (/ocean/.test(sceneKind)) return ['water-column', 'ice-or-kelp', 'mixing-layers', 'wave-energy', 'salt-heat-ledger'];
    if (/clinical|evolution/.test(sceneKind)) return ['tissue-or-habitat', 'organism-agents', 'diffusion-field', 'control-signals', 'risk-readouts'];
    if (/agro/.test(sceneKind)) return ['resource-beds', 'microbe-heat', 'oxygen-water-loop', 'crop-output', 'loss-ledger'];
    if (/robotics/.test(sceneKind)) return ['workspace', 'manipulator-links', 'path-plan', 'sensor-feedback', 'task-ledger'];
    if (/manufacturing/.test(sceneKind)) return ['machine-cells', 'tooling-cutaway', 'material-transfer', 'cooling-cycle', 'quality-readout'];
    if (/quantum/.test(sceneKind)) return ['chip-cutaway', 'phase-surface', 'control-lines', 'readout-resonator', 'coherence-ledger'];
    if (/restoration|hazard/.test(sceneKind)) return ['terrain-base', 'water-or-atmosphere', 'fronts', 'infrastructure', 'ledger'];
    if (/structural/.test(sceneKind)) return ['structure-span', 'vortex-street', 'mode-shape', 'stress-field', 'readouts'];
    if (/chemistry|advanced|cultural/.test(sceneKind)) return ['vessel-or-artifact', 'material-phases', 'reaction-fronts', 'sensors', 'loss-ledger'];
    return ['world-base', 'primary-objects', 'fields', 'motion', 'readouts'];
  }

  function materialLanguageForExpandedScene(sceneKind) {
    if (/molecular/.test(sceneKind)) return ['protein', 'bond', 'solvent', 'energy'];
    if (/quantum/.test(sceneKind)) return ['silicon', 'superconductor', 'microwave', 'phase'];
    if (/digital/.test(sceneKind)) return ['silicon', 'signal', 'heat', 'packet'];
    if (/grid/.test(sceneKind)) return ['copper', 'transformer oil', 'battery', 'load'];
    if (/civic|venue/.test(sceneKind)) return ['concrete', 'glass', 'agent', 'ledger'];
    if (/planetary/.test(sceneKind)) return ['vacuum', 'ice', 'rock', 'radiation'];
    if (/weather/.test(sceneKind)) return ['air', 'water vapor', 'ice', 'pressure'];
    if (/ocean/.test(sceneKind)) return ['saltwater', 'ice', 'kelp', 'sediment'];
    if (/robotics/.test(sceneKind)) return ['aluminum', 'sensor', 'rubber', 'signal'];
    if (/manufacturing/.test(sceneKind)) return ['steel', 'polymer', 'coolant', 'tooling'];
    if (/clinical/.test(sceneKind)) return ['tissue', 'sensor', 'fluid', 'polymer'];
    if (/agro/.test(sceneKind)) return ['biomass', 'compost', 'water', 'oxygen'];
    if (/evolution|restoration/.test(sceneKind)) return ['water', 'soil', 'biomass', 'microbe'];
    if (/hazard/.test(sceneKind)) return ['air', 'water', 'rock', 'exposure'];
    if (/structural/.test(sceneKind)) return ['steel', 'air', 'stress', 'vorticity'];
    if (/advanced/.test(sceneKind)) return ['plasma', 'metal', 'coolant', 'radiation'];
    if (/chemistry/.test(sceneKind)) return ['reagent', 'catalyst', 'solvent', 'heat'];
    if (/cultural/.test(sceneKind)) return ['pigment', 'paper', 'ceramic', 'humidity'];
    return ['material', 'field', 'constraint', 'motion'];
  }

  function motionGrammarForExpandedScene(sceneKind) {
    if (/molecular/.test(sceneKind)) return ['bond relaxation', 'energy descent', 'chain collapse'];
    if (/quantum/.test(sceneKind)) return ['phase sweep', 'readout pulse', 'coherence decay'];
    if (/digital/.test(sceneKind)) return ['packet pulses', 'latency waves', 'thermal throttling'];
    if (/grid/.test(sceneKind)) return ['load balancing', 'frequency correction', 'thermal overload'];
    if (/civic|venue/.test(sceneKind)) return ['agent flow', 'queue pressure', 'service balancing'];
    if (/planetary/.test(sceneKind)) return ['orbital arcs', 'beam sweeps', 'gravity sorting'];
    if (/weather/.test(sceneKind)) return ['shear advection', 'cloud growth', 'rain band propagation'];
    if (/ocean/.test(sceneKind)) return ['internal wave mixing', 'ice calving', 'salinity layering'];
    if (/robotics/.test(sceneKind)) return ['path planning', 'servo correction', 'gripper transfer'];
    if (/manufacturing/.test(sceneKind)) return ['material transfer', 'cooling cycle', 'quality drift'];
    if (/clinical/.test(sceneKind)) return ['control feedback', 'pulsed flow', 'sensor correction'];
    if (/evolution/.test(sceneKind)) return ['growth fronts', 'population drift', 'resource diffusion'];
    if (/agro/.test(sceneKind)) return ['microbial heating', 'oxygen cycling', 'biomass conversion'];
    if (/restoration/.test(sceneKind)) return ['water table rise', 'wave attenuation', 'sediment capture'];
    if (/hazard/.test(sceneKind)) return ['front propagation', 'exposure plumes', 'damage accumulation'];
    if (/structural/.test(sceneKind)) return ['vortex shedding', 'modal vibration', 'stress accumulation'];
    if (/advanced/.test(sceneKind)) return ['field confinement', 'heat decay', 'diagnostic sweep'];
    if (/chemistry/.test(sceneKind)) return ['reaction bands', 'phase separation', 'catalyst turnover'];
    if (/cultural/.test(sceneKind)) return ['humidity cycling', 'surface aging', 'crack growth'];
    return ['field motion', 'object coupling', 'readout pulses'];
  }

  function sceneSignals(objects = [], physicsIR = {}, solverGraph = {}) {
    const domains = physicsIR.domains || [];
    const entities = physicsIR.entities || [];
    const operators = unique([
      ...((physicsIR.operators || []).map((operator) => operator.type)),
      ...((solverGraph.steps || []).map((step) => step.operatorType)),
    ]);
    const fields = [
      ...((physicsIR.stateFields || []).map((field) => `${field.name} ${field.id}`)),
      ...Object.keys(solverGraph.channelMetadata || {}),
    ];
    const materials = new Set();
    const glyphs = new Set();
    const kinds = new Set();
    const chunks = [];
    for (const object of objects || []) {
      if (object.materialId) materials.add(object.materialId);
      if (object.glyph) glyphs.add(object.glyph);
      if (object.domainKind) kinds.add(object.domainKind);
      chunks.push([
        object.label,
        object.semanticRef,
        object.physicalRef,
        object.glyph,
        object.materialId,
        object.visualRegime,
        object.domainKind,
        ...(object.domainTags || []),
        ...(object.operatorHints || []),
        ...Object.keys(object.stateBindings || {}),
      ].join(' '));
    }
    for (const domain of domains) {
      if (domain.materialId) materials.add(domain.materialId);
      if (domain.kind) kinds.add(domain.kind);
      chunks.push([
        domain.entityId,
        domain.kind,
        domain.materialId,
        ...(domain.tags || []),
        ...(domain.operatorHints || []),
      ].join(' '));
    }
    for (const entity of entities) {
      if (entity.materialId) materials.add(entity.materialId);
      chunks.push([
        entity.label,
        entity.canonicalId,
        entity.semanticType,
        entity.materialId,
        ...(entity.domains || []),
        ...(entity.operatorHints || []),
      ].join(' '));
    }
    return {
      text: [...chunks, ...operators, ...fields].join(' ').toLowerCase(),
      materials,
      glyphs,
      kinds,
      operators: new Set(operators),
    };
  }

  function hasThermal(signal) {
    return /thermal|heat_source|heat_transfer|temperature|fire/.test(signal.text);
  }

  function materialEvidenceCount(signal) {
    // Count distinct material evidence from compiled materialIds plus material terms in
    // the scene text. Grounding may route some materials (air, metal) to relation or
    // semantic-open nodes that carry no materialId, so a domain-only count undercounts a
    // genuine materials tray; the text terms recover that evidence.
    const materials = new Set(signal.materials);
    for (const material of Object.keys(MATERIAL_STYLES)) {
      if (new RegExp(`\\b${material}\\b`).test(signal.text)) materials.add(material);
    }
    return materials.size;
  }

  function isMaterialTraySignal(signal) {
    if (!/tray|raw material|heat diffusion sample/.test(signal.text) || !hasThermal(signal)) return false;
    return materialEvidenceCount(signal) >= 5;
  }

  function isLiteralCompositeSignal(signal) {
    const literalGlyphs = ['lava', 'volcano', 'turbine', 'rocket', 'submarine', 'wetland', 'castle', 'ice', 'storm', 'instrument'];
    const count = literalGlyphs.filter((glyph) => signal.glyphs.has(glyph) || signal.text.includes(glyph)).length;
    return count >= 2 || /black-hole|singularity|swamp|hammer|gold|spaceship|spacecraft/.test(signal.text);
  }

  function isStrongLiteralCompositeSignal(signal) {
    return /lava|magma|volcano|black-hole|singularity|swamp|wetland|hammer|gold|spaceship|spacecraft|rocket|submarine|piano/.test(signal.text);
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  return {
    RENDER_REGISTRY_SCHEMA,
    MATERIAL_STYLES,
    glyphForEntity,
    materialStyle,
    visualRegimeForDomain,
    sceneHintForText,
    sceneHintForObjects,
    painterKindForScene,
    recipeForScene,
  };
});
