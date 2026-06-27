import path from 'node:path';
import {
  INDEX_DEFINITIONS,
  INDEX_BY_NAME,
  UNIVERSE_DIR,
  artifactPath,
  createManifest,
  mergeDocuments,
  normalizeAliases,
  normalizeIndex,
  readJson,
  readManifest,
  uniqueSorted,
  writeJson,
} from './simulatte-universe-utils.mjs';

const DEFAULT_DOCS = Object.freeze({
  concepts: [
    concept('concept.ferrofluid-lens', 'ferrofluid lens', 'optic.ferrofluid_lens', 'adaptiveOptic', ['fluid', 'magnetism', 'optics', 'thermal'], 'ferrofluid', ['magnetic_field', 'field_refraction', 'heat_transfer'], ['magnetic fluid lens', 'liquid optic', 'field-shaped lens']),
    concept('concept.copper-coil', 'copper coil', 'component.copper_coil', 'actuator', ['electromagnetism', 'thermal', 'control'], 'copper', ['magnetic_field', 'heat_transfer'], ['electromagnet coil', 'induction coil']),
    concept('concept.subway-grid', 'subway queue grid', 'system.subway_queue_grid', 'networkSystem', ['network', 'control', 'queue'], 'silicon', ['network_flow', 'controller_response'], ['transit queue', 'rerouting grid', 'power surge network']),
    concept('concept.brine-vent', 'undersea brine vent', 'environment.brine_vent', 'geophysicalFlow', ['fluid', 'thermal', 'pressure', 'phase'], 'brine', ['pressure_flow_lite', 'crystallization', 'heat_transfer'], ['hydrothermal vent', 'pressure brine', 'crystal vent']),
    concept('concept.acoustic-levitator', 'acoustic levitator', 'apparatus.acoustic_levitator', 'waveApparatus', ['wave', 'acoustic', 'particle', 'granular'], 'brass', ['wave_field', 'particle_sorting'], ['standing wave sorter', 'dust levitator', 'brass tube resonator']),
    concept('concept.thin-film-loop', 'thin film wire loop', 'surface.thin_film_loop', 'surfaceFilm', ['surface', 'optics', 'fracture', 'fluid'], 'thin-film', ['surface_tension', 'fracture_threshold', 'field_refraction'], ['soap film loop', 'laser bubble film', 'fracturing membrane']),
    concept('concept.mycelium-gel', 'mycelium nutrient gel', 'biofilm.mycelium_gel', 'biofilm', ['biology', 'diffusion', 'fluid', 'wave'], 'nutrient-gel', ['growth_decay', 'reaction_diffusion', 'wave_field'], ['fungal membrane', 'nutrient gel wave', 'mycelium pump']),
  ],
  materials: [
    material('material.ferrofluid', 'ferrofluid', 'ferrofluid', ['magnetic fluid'], { magnetization: 0.74, viscosity: 0.36, refractiveIndex: 1.67 }),
    material('material.copper', 'copper', 'copper', ['conductive coil metal'], { conductivity: 0.95, heatTransfer: 0.68 }),
    material('material.brine', 'pressure brine', 'brine', ['saline vent fluid'], { pressure: 0.86, viscosity: 0.58, crystallization: 0.72 }),
    material('material.brass-dust', 'brass dust', 'brass', ['resonator dust'], { granularFriction: 0.28, soundFrequency: 0.74 }),
    material('material.thin-film', 'thin film', 'thin-film', ['soap film', 'membrane film'], { surfaceTension: 0.86, opacity: 0.22, hardness: 0.18 }),
    material('material.nutrient-gel', 'nutrient gel', 'nutrient-gel', ['bio gel'], { moisture: 0.82, viscosity: 0.64, populationGrowth: 0.84 }),
    material('material.silicon', 'silicon control substrate', 'silicon', ['routing silicon'], { conductivity: 0.72, signalDelay: 0.26 }),
  ],
  processes: [
    processDoc('process.heat', 'heat', 'heat_transfer', ['heat_transfer'], ['laser heats', 'thermal drive', 'warms']),
    processDoc('process.reroute', 'reroute', 'network_control', ['network_flow', 'controller_response'], ['reroutes', 'queue rerouting', 'network surge']),
    processDoc('process.crystallize', 'crystallize', 'phase', ['crystallization', 'heat_transfer'], ['crystallizes', 'forms crystals', 'phase locks']),
    processDoc('process.levitate', 'levitate', 'wave_sorting', ['wave_field', 'particle_sorting'], ['levitates', 'standing wave', 'sorts dust']),
    processDoc('process.fracture-film', 'fracture film', 'surface_fracture', ['surface_tension', 'fracture_threshold'], ['bubbles fracture', 'film tears', 'ruptures']),
    processDoc('process.pump-growth', 'pump growth', 'growth_diffusion', ['growth_decay', 'reaction_diffusion'], ['pumps nutrient', 'mycelium waves', 'membrane grows']),
  ],
  relations: [
    relation('relation.field-coupling', 'field couples', 'fieldCoupling', ['magnetic_field', 'field_refraction'], ['magnetizes', 'focuses', 'refracts']),
    relation('relation.queue-routing', 'queue routes', 'networkFeedback', ['network_flow', 'controller_response'], ['reroutes', 'backs up', 'surges']),
    relation('relation.pressure-growth', 'pressure forms', 'phaseFlow', ['pressure_flow_lite', 'crystallization'], ['crystallizes', 'vents', 'pushes']),
    relation('relation.acoustic-sorting', 'acoustic sorts', 'waveParticleCoupling', ['wave_field', 'particle_sorting'], ['levitates', 'traps', 'sorts']),
    relation('relation.surface-rupture', 'surface ruptures', 'surfaceFailure', ['surface_tension', 'fracture_threshold'], ['fractures', 'tears', 'bubbles']),
    relation('relation.bio-pump', 'biofilm pumps', 'growthTransport', ['growth_decay', 'reaction_diffusion'], ['grows', 'diffuses', 'waves']),
  ],
  operators: [
    operator('operator.magnetic-field', 'magnetic field', 'magnetic_field', ['magnetism', 'fluid'], ['magnetization', 'fieldStrength'], ['magnet', 'magnetism', 'magnetic-core']),
    operator('operator.field-refraction', 'field refraction', 'field_refraction', ['optics', 'field'], ['refractiveIndex', 'irradiance'], ['lens', 'optical-prism', 'optics-bench']),
    operator('operator.field-reflection', 'field reflection', 'field_reflection', ['optics', 'field'], ['reflectance', 'irradiance'], ['mirror', 'optics-bench']),
    operator('operator.heat-transfer', 'heat transfer', 'heat_transfer', ['thermal', 'transport'], ['temperature', 'heatFlux'], ['heat-transfer', 'thermal-source', 'heater']),
    operator('operator.network-flow', 'network flow', 'network_flow', ['network', 'control'], ['backlog', 'throughput', 'signalDelay'], ['graph-network', 'queue-server', 'city-grid', 'traffic-system']),
    operator('operator.controller-response', 'controller response', 'controller_response', ['control', 'feedback'], ['setpoint', 'error', 'response'], ['controller', 'feedback-controller', 'state-machine']),
    operator('operator.pressure-flow', 'pressure flow', 'pressure_flow_lite', ['fluid', 'pressure'], ['pressure', 'flowVelocity'], ['pressure', 'pump', 'pipe', 'moving-fluid']),
    operator('operator.crystallization', 'crystallization', 'crystallization', ['phase', 'thermal'], ['temperature', 'crystalDensity'], ['crystallization', 'crystal-growth', 'nucleation']),
    operator('operator.wave-field', 'wave field', 'wave_field', ['wave', 'acoustic'], ['waveAmplitude', 'frequency'], ['wave-propagation', 'wave-source', 'acoustic-emitter', 'acoustic-propagation']),
    operator('operator.particle-sorting', 'particle sorting', 'particle_sorting', ['particle', 'granular'], ['particleDensity', 'sortingForce'], ['particle-set', 'granular-bed', 'powder-bed']),
    operator('operator.surface-tension', 'surface tension', 'surface_tension', ['surface', 'fluid'], ['curvature', 'filmThickness'], ['surface-tension', 'capillary-action', 'membrane']),
    operator('operator.fracture-threshold', 'fracture threshold', 'fracture_threshold', ['solid', 'fracture'], ['stress', 'damage'], ['fracture-mechanics', 'glass-pane', 'rock-wall']),
    operator('operator.growth-decay', 'growth decay', 'growth_decay', ['biology', 'growth'], ['density', 'nutrient'], ['growth-decay', 'population-field', 'biological-colony', 'mycelium']),
    operator('operator.reaction-diffusion', 'reaction diffusion', 'reaction_diffusion', ['biology', 'reaction', 'diffusion'], ['concentration', 'reactionRate'], ['diffusion', 'chemical-reaction', 'growth-decay']),
  ],
  shapes: [
    shape('shape.lens-disc', 'lens disc', 'disc', ['optics', 'surface'], ['lens', 'optics-bench'], ['convex', 'transparent', 'field-shaped']),
    shape('shape.coil-ring', 'coil ring', 'ring', ['magnetism', 'thermal'], ['copper', 'magnetic-core'], ['looped', 'conductive', 'actuator']),
    shape('shape.queue-grid', 'queue grid', 'grid', ['network', 'control'], ['city-grid', 'transit-map', 'graph-network'], ['station nodes', 'routing lines']),
    shape('shape.vent-column', 'vent column', 'column', ['fluid', 'pressure'], ['pipe', 'pressure', 'crystal-growth'], ['plume', 'stratified', 'seafloor']),
    shape('shape.resonator-tube', 'resonator tube', 'tube', ['wave', 'acoustic'], ['acoustic-emitter', 'wave-propagation'], ['standing waves', 'particle traps']),
    shape('shape.film-loop', 'film loop', 'loop', ['surface', 'fracture'], ['surface-tension', 'membrane'], ['thin membrane', 'iridescent boundary']),
    shape('shape.branching-membrane', 'branching membrane', 'branching-network', ['biology', 'diffusion'], ['mycelium', 'membrane', 'growth-decay'], ['hyphae', 'gel channels']),
  ],
  scenes: [
    scene('scene.ferrofluid-optics', 'ferrofluid optics bench', 'ferrofluid', ['optic.ferrofluid_lens', 'component.copper_coil'], ['shape.lens-disc', 'shape.coil-ring'], ['optics-bench', 'lens', 'magnet']),
    scene('scene.transit-surge', 'transit surge grid', 'city', ['system.subway_queue_grid'], ['shape.queue-grid'], ['city-grid', 'traffic-system', 'queue-server']),
    scene('scene.brine-crystal-vent', 'brine crystal vent', 'watershed', ['environment.brine_vent'], ['shape.vent-column'], ['brine', 'pressure', 'crystallization']),
    scene('scene.acoustic-dust-sorter', 'acoustic dust sorter', 'acoustic', ['apparatus.acoustic_levitator'], ['shape.resonator-tube'], ['acoustic-emitter', 'particle-set', 'wave-propagation']),
    scene('scene.thin-film-fracture', 'thin film fracture rig', 'thin-film', ['surface.thin_film_loop'], ['shape.film-loop'], ['surface-tension', 'membrane', 'fracture-mechanics']),
    scene('scene.mycelium-gel-pump', 'mycelium gel pump', 'biology', ['biofilm.mycelium_gel'], ['shape.branching-membrane'], ['mycelium', 'growth-decay', 'diffusion']),
  ],
  synonyms: [
    synonym('synonym.liquid-optic', 'liquid optic', 'optic.ferrofluid_lens', 'concept', ['fluid lens', 'adaptive lens']),
    synonym('synonym.induction-coil', 'induction coil', 'component.copper_coil', 'concept', ['electromagnet coil']),
    synonym('synonym.rerouting-grid', 'rerouting grid', 'system.subway_queue_grid', 'concept', ['transit queue', 'subway queue']),
    synonym('synonym.hydrothermal-vent', 'hydrothermal vent', 'environment.brine_vent', 'concept', ['pressure brine vent']),
    synonym('synonym.standing-wave-sorter', 'standing wave sorter', 'apparatus.acoustic_levitator', 'concept', ['acoustic levitator']),
    synonym('synonym.soap-film-loop', 'soap film loop', 'surface.thin_film_loop', 'concept', ['thin film loop']),
    synonym('synonym.fungal-membrane', 'fungal membrane', 'biofilm.mycelium_gel', 'concept', ['mycelium membrane']),
  ],
  analogs: [
    analog('analog.ferrofluid-lens', 'laser heats ferrofluid lens over copper coil', ['optic.ferrofluid_lens', 'component.copper_coil'], ['magnetic_field', 'field_refraction', 'heat_transfer']),
    analog('analog.subway-surge-grid', 'subway queue grid reroutes after power surge', ['system.subway_queue_grid'], ['network_flow', 'controller_response']),
    analog('analog.brine-vent', 'undersea vent crystallizes pressure brine', ['environment.brine_vent'], ['pressure_flow_lite', 'crystallization', 'heat_transfer']),
    analog('analog.acoustic-dust-levitator', 'acoustic levitator sorts dust in brass tube', ['apparatus.acoustic_levitator'], ['wave_field', 'particle_sorting']),
    analog('analog.thin-film-fracture', 'thin film laser bubbles fracture on wire loop', ['surface.thin_film_loop'], ['surface_tension', 'fracture_threshold', 'field_refraction']),
    analog('analog.mycelium-gel-pump', 'mycelium membrane pumps nutrient gel waves', ['biofilm.mycelium_gel'], ['growth_decay', 'reaction_diffusion', 'wave_field']),
  ],
});

async function main() {
  const existingManifest = await readManifest();
  const manifest = createManifest(existingManifest || {});
  await writeJson(path.join(UNIVERSE_DIR, 'manifest.json'), manifest);

  for (const definition of INDEX_DEFINITIONS) {
    if (definition.name === 'affordances') continue;
    const current = await readJson(artifactPath(definition.artifact), {});
    const docs = mergeDocuments(current.documents || [], DEFAULT_DOCS[definition.name] || []);
    const index = normalizeIndex(definition.name, current, docs.map((doc) => normalizeDocument(definition.name, doc)));
    await writeJson(artifactPath(definition.artifact), index);
  }

  const affordanceDefinition = INDEX_BY_NAME.affordances;
  const affordances = await readJson(artifactPath(affordanceDefinition.artifact), null);
  if (!affordances) {
    await writeJson(artifactPath(affordanceDefinition.artifact), normalizeIndex('affordances', {}, []));
  }

  console.log(JSON.stringify({
    universeDir: UNIVERSE_DIR,
    manifest: 'manifest.json',
    indexes: INDEX_DEFINITIONS.map((definition) => definition.artifact.replace(/^\.\//, '')),
  }, null, 2));
}

function normalizeDocument(indexName, doc) {
  return {
    ...doc,
    aliases: normalizeAliases(doc.aliases || []),
    domains: uniqueSorted(doc.domains || []),
    operatorHints: uniqueSorted(doc.operatorHints || []),
    primitiveHints: uniqueSorted(doc.primitiveHints || []),
  };
}

function concept(id, label, canonicalId, semanticType, domains, materialId, operatorHints, aliases) {
  return { id, label, aliases, canonicalId, semanticType, domains, materialId, operatorHints };
}

function material(id, label, materialId, aliases, properties) {
  return { id, label, aliases, materialId, properties };
}

function processDoc(id, label, process, operatorHints, aliases) {
  return { id, label, aliases, process, operatorHints };
}

function relation(id, label, edgeType, operatorHints, aliases) {
  return { id, label, aliases, edgeType, operatorHints };
}

function operator(id, label, operatorType, domains, stateVariables, primitiveHints) {
  return { id, label, operatorType, domains, stateVariables, primitiveHints };
}

function shape(id, label, shapeKind, domains, primitiveHints, aliases) {
  return { id, label, aliases, shapeKind, domains, primitiveHints };
}

function scene(id, label, sceneKind, conceptIds, shapeIds, primitiveHints) {
  return { id, label, aliases: [], sceneKind, conceptIds, shapeIds, primitiveHints };
}

function synonym(id, label, targetId, targetKind, aliases) {
  return { id, label, aliases, targetId, targetKind };
}

function analog(id, label, concepts, operators) {
  return { id, label, concepts, operators };
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
