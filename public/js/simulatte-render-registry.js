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
    if (/lava|magma|volcano/.test(text)) return 'lava';
    if (/turbine|rotor|wheel/.test(text)) return 'turbine';
    if (/castle|wall|cathedral/.test(text)) return 'castle';
    if (/ice/.test(text)) return 'ice';
    if (/river|water|rain|flow/.test(text)) return 'fluid_path';
    if (/projectile|hammer/.test(text)) return 'projectile';
    if (/rocket/.test(text)) return 'rocket';
    if (/submarine/.test(text)) return 'submarine';
    if (/piano/.test(text)) return 'instrument';
    if (/storm|cloud|wind/.test(text)) return 'field';
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
    const text = `${domain.kind || ''} ${(domain.tags || []).join(' ')} ${domain.materialId || ''}`.toLowerCase();
    if (/lava|fire|thermal|phase/.test(text)) return 'thermal';
    if (/fluid|water|rain|wind/.test(text)) return 'fluid';
    if (/network|queue|control/.test(text)) return 'network';
    if (/wave|oscillator|acoustic/.test(text)) return 'wave';
    if (/growth|bio/.test(text)) return 'biology';
    if (/fracture|collision|rigid/.test(text)) return 'mechanical';
    if (/field|magnet|optic/.test(text)) return 'field';
    return 'material';
  }

  function sceneHintForObjects(objects = []) {
    const text = objects.map((object) => `${object.glyph} ${object.visualRegime} ${object.materialId}`).join(' ');
    if (/lava|thermal/.test(text) && /turbine/.test(text)) return 'literal-composite';
    if (/turbine|projectile|mechanical/.test(text)) return 'mechanical';
    if (/fluid/.test(text) && /castle|ice/.test(text)) return 'literal-composite';
    if (/network/.test(text)) return 'city';
    if (/wave/.test(text)) return 'acoustic';
    if (/biology/.test(text)) return 'biology';
    if (/thermal/.test(text)) return 'thermal-plume';
    if (/fluid/.test(text)) return 'watershed';
    return 'generic';
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
