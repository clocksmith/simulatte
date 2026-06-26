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

  function style(fill, stroke, alpha) {
    return { fill, stroke, alpha };
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
    if (/thin-film|thin film|soap|bubble|wire-loop|wire loop|surface_tension/.test(text)) {
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
    if (isStrongLiteralCompositeSignal(signal)) return 'literal-composite';
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

  function isMaterialTraySignal(signal) {
    if (signal.materials.size < 5) return false;
    return /tray|raw material|heat diffusion sample/.test(signal.text) && hasThermal(signal);
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
    sceneHintForObjects,
  };
});
