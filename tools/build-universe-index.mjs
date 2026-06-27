import path from 'node:path';
import { createRequire } from 'node:module';
import {
  INDEX_DEFINITIONS,
  INDEX_BY_NAME,
  UNIVERSE_DIR,
  artifactPath,
  cloneJson,
  createManifest,
  mergeDocuments,
  normalizeAliases,
  normalizeIndex,
  readJson,
  readManifest,
  uniqueSorted,
  writeJson,
} from './simulatte-universe-utils.mjs';

const require = createRequire(import.meta.url);

const DEFAULT_DOCS = Object.freeze({
  concepts: [
    concept('concept.ferrofluid-lens', 'ferrofluid lens', 'optic.ferrofluid_lens', 'adaptiveOptic', ['fluid', 'magnetism', 'optics', 'thermal'], 'ferrofluid', ['magnetic_field', 'field_refraction', 'heat_transfer'], ['magnetic fluid lens', 'liquid optic', 'field-shaped lens']),
    concept('concept.copper-coil', 'copper coil', 'component.copper_coil', 'actuator', ['electromagnetism', 'thermal', 'control'], 'copper', ['magnetic_field', 'heat_transfer'], ['electromagnet coil', 'induction coil']),
    concept('concept.subway-grid', 'subway queue grid', 'system.subway_queue_grid', 'networkSystem', ['network', 'control', 'queue'], 'silicon', ['network_flow', 'controller_response'], ['transit queue', 'rerouting grid', 'power surge network']),
    concept('concept.brine-vent', 'undersea brine vent', 'environment.brine_vent', 'geophysicalFlow', ['fluid', 'thermal', 'pressure', 'phase'], 'brine', ['pressure_flow_lite', 'crystallization', 'heat_transfer'], ['hydrothermal vent', 'pressure brine', 'crystal vent']),
    concept('concept.acoustic-levitator', 'acoustic levitator', 'apparatus.acoustic_levitator', 'waveApparatus', ['wave', 'acoustic', 'particle', 'granular'], 'brass', ['wave_field', 'particle_sorting'], ['standing wave sorter', 'dust levitator', 'brass tube resonator']),
    concept('concept.thin-film-loop', 'thin film wire loop', 'surface.thin_film_loop', 'surfaceFilm', ['surface', 'optics', 'fracture', 'fluid'], 'thin-film', ['surface_tension', 'fracture_threshold', 'field_refraction'], ['soap film loop', 'laser bubble film', 'fracturing membrane']),
    concept('concept.mycelium-gel', 'mycelium nutrient gel', 'biofilm.mycelium_gel', 'biofilm', ['biology', 'diffusion', 'fluid', 'wave'], 'nutrient-gel', ['growth_decay', 'reaction_diffusion', 'wave_field'], ['fungal membrane', 'nutrient gel wave', 'mycelium pump']),
    concept('concept.ceramic-kiln', 'ceramic kiln', 'apparatus.ceramic_kiln', 'thermalKiln', ['thermal', 'material', 'fracture', 'phase'], 'porcelain', ['heat_transfer', 'fracture_threshold', 'sintering'], ['porcelain kiln', 'sintering kiln', 'humid ceramic chamber']),
    concept('concept.mirror-swarm', 'orbiting mirror swarm', 'orbital.mirror_swarm', 'opticalArray', ['optics', 'orbit', 'control', 'thermal'], 'glass', ['field_reflection', 'field_refraction', 'heat_transfer', 'solar_concentration'], ['heliostat swarm', 'mirror satellite swarm', 'sunlight focus array']),
    concept('concept.warehouse-robot-pallet', 'warehouse robot pallet jam', 'logistics.warehouse_robot_pallet', 'logisticsRobot', ['network', 'control', 'electrical', 'fluid'], 'battery-electrolyte', ['network_flow', 'controller_response', 'electrochemical_potential', 'leak_flow'], ['warehouse robots', 'battery pallet', 'leaking pallet jam']),
    concept('concept.molten-salt-foam-battery', 'molten salt graphite foam battery', 'electrochem.molten_salt_foam_battery', 'electrochemicalStack', ['electrical', 'thermal', 'fluid', 'material'], 'molten-salt', ['electrochemical_potential', 'heat_transfer', 'porous_flow'], ['graphite foam battery', 'molten salt cell', 'porous battery stack']),
  ],
  materials: [
    material('material.ferrofluid', 'ferrofluid', 'ferrofluid', ['magnetic fluid'], { magnetization: 0.74, viscosity: 0.36, refractiveIndex: 1.67 }),
    material('material.copper', 'copper', 'copper', ['conductive coil metal'], { conductivity: 0.95, heatTransfer: 0.68 }),
    material('material.brine', 'pressure brine', 'brine', ['saline vent fluid'], { pressure: 0.86, viscosity: 0.58, crystallization: 0.72 }),
    material('material.brass-dust', 'brass dust', 'brass', ['resonator dust'], { granularFriction: 0.28, soundFrequency: 0.74 }),
    material('material.thin-film', 'thin film', 'thin-film', ['soap film', 'membrane film'], { surfaceTension: 0.86, opacity: 0.22, hardness: 0.18 }),
    material('material.nutrient-gel', 'nutrient gel', 'nutrient-gel', ['bio gel'], { moisture: 0.82, viscosity: 0.64, populationGrowth: 0.84 }),
    material('material.silicon', 'silicon control substrate', 'silicon', ['routing silicon'], { conductivity: 0.72, signalDelay: 0.26 }),
    material('material.porcelain', 'cracked porcelain', 'porcelain', ['ceramic', 'kiln clay', 'sintered ceramic'], { hardness: 0.82, heatTransfer: 0.52, bondStrength: 0.46 }),
    material('material.graphite-foam', 'graphite foam', 'graphite-foam', ['porous carbon foam', 'foam stack'], { conductivity: 0.78, permeability: 0.66, density: 0.22 }),
    material('material.molten-salt', 'molten salt electrolyte', 'molten-salt', ['liquid salt', 'salt battery electrolyte'], { conductivity: 0.72, heatCapacity: 0.86, viscosity: 0.42 }),
    material('material.battery-electrolyte', 'leaking battery electrolyte', 'battery-electrolyte', ['battery leak', 'electrolyte spill'], { conductivity: 0.76, moisture: 0.82, reactionRate: 0.62 }),
  ],
  processes: [
    processDoc('process.heat', 'heat', 'heat_transfer', ['heat_transfer'], ['laser heats', 'thermal drive', 'warms']),
    processDoc('process.reroute', 'reroute', 'network_control', ['network_flow', 'controller_response'], ['reroutes', 'queue rerouting', 'network surge']),
    processDoc('process.crystallize', 'crystallize', 'phase', ['crystallization', 'heat_transfer'], ['crystallizes', 'forms crystals', 'phase locks']),
    processDoc('process.levitate', 'levitate', 'wave_sorting', ['wave_field', 'particle_sorting'], ['levitates', 'standing wave', 'sorts dust']),
    processDoc('process.fracture-film', 'fracture film', 'surface_fracture', ['surface_tension', 'fracture_threshold'], ['bubbles fracture', 'film tears', 'ruptures']),
    processDoc('process.pump-growth', 'pump growth', 'growth_diffusion', ['growth_decay', 'reaction_diffusion'], ['pumps nutrient', 'mycelium waves', 'membrane grows']),
    processDoc('process.sinter', 'sinter', 'thermal_sintering', ['heat_transfer', 'sintering'], ['sinters', 'kiln firing', 'ceramic densifies']),
    processDoc('process.focus-sunlight', 'focus sunlight', 'solar_concentration', ['field_reflection', 'solar_concentration'], ['focuses sunlight', 'concentrates solar light', 'heliostat aim']),
    processDoc('process.warehouse-jam', 'warehouse jam', 'network_congestion', ['network_flow', 'controller_response'], ['robots jam', 'pallet jam', 'logistics blockage']),
    processDoc('process.leak-electrolyte', 'leak electrolyte', 'leak_flow', ['pressure_flow_lite', 'electrochemical_potential'], ['leaking battery', 'electrolyte leak', 'spill flow']),
    processDoc('process.breathe-porous-stack', 'breathe porous stack', 'porous_exchange', ['porous_flow', 'electrochemical_potential'], ['breathes through foam', 'gas exchange', 'porous stack flow']),
  ],
  relations: [
    relation('relation.field-coupling', 'field couples', 'fieldCoupling', ['magnetic_field', 'field_refraction'], ['magnetizes', 'focuses', 'refracts']),
    relation('relation.queue-routing', 'queue routes', 'networkFeedback', ['network_flow', 'controller_response'], ['reroutes', 'backs up', 'surges']),
    relation('relation.pressure-growth', 'pressure forms', 'phaseFlow', ['pressure_flow_lite', 'crystallization'], ['crystallizes', 'vents', 'pushes']),
    relation('relation.acoustic-sorting', 'acoustic sorts', 'waveParticleCoupling', ['wave_field', 'particle_sorting'], ['levitates', 'traps', 'sorts']),
    relation('relation.surface-rupture', 'surface ruptures', 'surfaceFailure', ['surface_tension', 'fracture_threshold'], ['fractures', 'tears', 'bubbles']),
    relation('relation.bio-pump', 'biofilm pumps', 'growthTransport', ['growth_decay', 'reaction_diffusion'], ['grows', 'diffuses', 'waves']),
    relation('relation.kiln-sintering', 'kiln sinters ceramic', 'thermalMaterialTransform', ['heat_transfer', 'sintering'], ['kiln sinters', 'porcelain densifies', 'ceramic firing']),
    relation('relation.solar-concentration', 'mirror swarm focuses sunlight', 'opticalConcentration', ['field_reflection', 'solar_concentration'], ['mirror swarm focuses', 'sunlight on pond', 'orbital heliostat']),
    relation('relation.warehouse-jam', 'robots jam around pallet', 'networkCongestion', ['network_flow', 'controller_response'], ['robots jam', 'blocked pallet', 'warehouse congestion']),
    relation('relation.electrochemical-breathing', 'battery breathes through porous foam', 'porousElectrochemistry', ['porous_flow', 'electrochemical_potential'], ['breathes through graphite foam', 'molten salt circulates', 'porous electrode exchange']),
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
    operator('operator.sintering', 'sintering', 'sintering', ['thermal', 'material'], ['temperature', 'bondStrength', 'porosity'], ['heat-transfer', 'phase-change-material', 'ceramic']),
    operator('operator.solar-concentration', 'solar concentration', 'solar_concentration', ['optics', 'thermal'], ['irradiance', 'reflectance'], ['mirror', 'radiation', 'light-source']),
    operator('operator.leak-flow', 'leak flow', 'leak_flow', ['fluid', 'electrical'], ['pressure', 'flowVelocity', 'conductivity'], ['battery-electrolyte', 'moving-fluid']),
    operator('operator.porous-flow', 'porous flow', 'porous_flow', ['fluid', 'material'], ['permeability', 'pressure', 'flowVelocity'], ['porous-filter', 'foam', 'membrane']),
    operator('operator.electrochemical-potential', 'electrochemical potential', 'electrochemical_potential', ['electrical', 'chemical'], ['conductivity', 'voltage'], ['battery-electrolyte', 'battery-circuit']),
  ],
  shapes: [
    shape('shape.lens-disc', 'lens disc', 'disc', ['optics', 'surface'], ['lens', 'optics-bench'], ['convex', 'transparent', 'field-shaped']),
    shape('shape.coil-ring', 'coil ring', 'ring', ['magnetism', 'thermal'], ['copper', 'magnetic-core'], ['looped', 'conductive', 'actuator']),
    shape('shape.queue-grid', 'queue grid', 'grid', ['network', 'control'], ['city-grid', 'transit-map', 'graph-network'], ['station nodes', 'routing lines']),
    shape('shape.vent-column', 'vent column', 'column', ['fluid', 'pressure'], ['pipe', 'pressure', 'crystal-growth'], ['plume', 'stratified', 'seafloor']),
    shape('shape.resonator-tube', 'resonator tube', 'tube', ['wave', 'acoustic'], ['acoustic-emitter', 'wave-propagation'], ['standing waves', 'particle traps']),
    shape('shape.film-loop', 'film loop', 'loop', ['surface', 'fracture'], ['surface-tension', 'membrane'], ['thin membrane', 'iridescent boundary']),
    shape('shape.branching-membrane', 'branching membrane', 'branching-network', ['biology', 'diffusion'], ['mycelium', 'membrane', 'growth-decay'], ['hyphae', 'gel channels']),
    shape('shape.kiln-chamber', 'kiln chamber', 'chamber', ['thermal', 'material'], ['heater', 'phase-change-material'], ['ceramic chamber', 'brick shell']),
    shape('shape.mirror-swarm-array', 'mirror swarm array', 'array', ['optics', 'control'], ['mirror', 'light-source'], ['orbiting mirrors', 'heliostat facets']),
    shape('shape.pallet-stack', 'pallet stack', 'stack', ['network', 'electrical'], ['warehouse', 'battery'], ['warehouse pallet', 'blocked stack']),
    shape('shape.porous-cell-stack', 'porous cell stack', 'cell-stack', ['electrical', 'fluid'], ['battery-electrolyte', 'porous-filter'], ['graphite foam stack', 'electrochemical cells']),
  ],
  scenes: [
    scene('scene.ferrofluid-optics', 'ferrofluid optics bench', 'ferrofluid', ['optic.ferrofluid_lens', 'component.copper_coil'], ['shape.lens-disc', 'shape.coil-ring'], ['optics-bench', 'lens', 'magnet']),
    scene('scene.transit-surge', 'transit surge grid', 'city', ['system.subway_queue_grid'], ['shape.queue-grid'], ['city-grid', 'traffic-system', 'queue-server']),
    scene('scene.brine-crystal-vent', 'brine crystal vent', 'watershed', ['environment.brine_vent'], ['shape.vent-column'], ['brine', 'pressure', 'crystallization']),
    scene('scene.acoustic-dust-sorter', 'acoustic dust sorter', 'acoustic', ['apparatus.acoustic_levitator'], ['shape.resonator-tube'], ['acoustic-emitter', 'particle-set', 'wave-propagation']),
    scene('scene.thin-film-fracture', 'thin film fracture rig', 'thin-film', ['surface.thin_film_loop'], ['shape.film-loop'], ['surface-tension', 'membrane', 'fracture-mechanics']),
    scene('scene.mycelium-gel-pump', 'mycelium gel pump', 'biology', ['biofilm.mycelium_gel'], ['shape.branching-membrane'], ['mycelium', 'growth-decay', 'diffusion']),
    scene('scene.ceramic-kiln-sintering', 'ceramic kiln sintering chamber', 'material-tray', ['apparatus.ceramic_kiln'], ['shape.kiln-chamber'], ['heater', 'phase-change-material', 'fracture-mechanics']),
    scene('scene.orbital-mirror-pond', 'orbiting mirror swarm over algae pond', 'optics', ['orbital.mirror_swarm'], ['shape.mirror-swarm-array'], ['mirror', 'radiation', 'ecology-pond']),
    scene('scene.warehouse-battery-jam', 'warehouse robots around leaking battery pallet', 'city', ['logistics.warehouse_robot_pallet'], ['shape.pallet-stack'], ['warehouse', 'market-queue', 'battery-electrolyte']),
    scene('scene.molten-salt-foam-stack', 'molten salt graphite foam battery stack', 'material-tray', ['electrochem.molten_salt_foam_battery'], ['shape.porous-cell-stack'], ['battery-electrolyte', 'carbon', 'porous-filter']),
  ],
  synonyms: [
    synonym('synonym.liquid-optic', 'liquid optic', 'optic.ferrofluid_lens', 'concept', ['fluid lens', 'adaptive lens']),
    synonym('synonym.induction-coil', 'induction coil', 'component.copper_coil', 'concept', ['electromagnet coil']),
    synonym('synonym.rerouting-grid', 'rerouting grid', 'system.subway_queue_grid', 'concept', ['transit queue', 'subway queue']),
    synonym('synonym.hydrothermal-vent', 'hydrothermal vent', 'environment.brine_vent', 'concept', ['pressure brine vent']),
    synonym('synonym.standing-wave-sorter', 'standing wave sorter', 'apparatus.acoustic_levitator', 'concept', ['acoustic levitator']),
    synonym('synonym.soap-film-loop', 'soap film loop', 'surface.thin_film_loop', 'concept', ['thin film loop']),
    synonym('synonym.fungal-membrane', 'fungal membrane', 'biofilm.mycelium_gel', 'concept', ['mycelium membrane']),
    synonym('synonym.kiln-sintering', 'kiln sintering', 'apparatus.ceramic_kiln', 'concept', ['kiln', 'sinters', 'cracked porcelain']),
    synonym('synonym.mirror-swarm-sunlight', 'mirror swarm sunlight', 'orbital.mirror_swarm', 'concept', ['orbiting mirror swarm', 'focuses sunlight', 'solar mirror swarm']),
    synonym('synonym.warehouse-robot-jam', 'warehouse robot jam', 'logistics.warehouse_robot_pallet', 'concept', ['robots jam', 'leaking battery pallet', 'warehouse robots']),
    synonym('synonym.molten-salt-graphite-foam', 'molten salt graphite foam', 'electrochem.molten_salt_foam_battery', 'concept', ['molten salt', 'graphite foam', 'foam stack', 'breathes through foam']),
  ],
  analogs: [
    analog('analog.ferrofluid-lens', 'laser heats ferrofluid lens over copper coil', ['optic.ferrofluid_lens', 'component.copper_coil'], ['magnetic_field', 'field_refraction', 'heat_transfer']),
    analog('analog.subway-surge-grid', 'subway queue grid reroutes after power surge', ['system.subway_queue_grid'], ['network_flow', 'controller_response']),
    analog('analog.brine-vent', 'undersea vent crystallizes pressure brine', ['environment.brine_vent'], ['pressure_flow_lite', 'crystallization', 'heat_transfer']),
    analog('analog.acoustic-dust-levitator', 'acoustic levitator sorts dust in brass tube', ['apparatus.acoustic_levitator'], ['wave_field', 'particle_sorting']),
    analog('analog.thin-film-fracture', 'thin film laser bubbles fracture on wire loop', ['surface.thin_film_loop'], ['surface_tension', 'fracture_threshold', 'field_refraction']),
    analog('analog.mycelium-gel-pump', 'mycelium membrane pumps nutrient gel waves', ['biofilm.mycelium_gel'], ['growth_decay', 'reaction_diffusion', 'wave_field']),
    analog('analog.ceramic-kiln-sintering', 'ceramic kiln sinters cracked porcelain in humid air', ['apparatus.ceramic_kiln'], ['heat_transfer', 'sintering', 'fracture_threshold']),
    analog('analog.orbital-mirror-pond', 'orbiting mirror swarm focuses sunlight on algae pond', ['orbital.mirror_swarm'], ['field_reflection', 'solar_concentration', 'heat_transfer']),
    analog('analog.warehouse-battery-jam', 'warehouse robots jam around a leaking battery pallet', ['logistics.warehouse_robot_pallet'], ['network_flow', 'controller_response', 'leak_flow']),
    analog('analog.molten-salt-foam-battery', 'molten salt battery breathes through a graphite foam stack', ['electrochem.molten_salt_foam_battery'], ['electrochemical_potential', 'porous_flow', 'heat_transfer']),
  ],
});

async function main() {
  const existingManifest = await readManifest();
  const manifest = createManifest(existingManifest || {});
  manifest.generator = {
    schema: 'simulatte.semanticUniverseGenerator.v1',
    sources: [
      'simulatte-physics-catalog',
      'simulatte-semantic-surface-cards',
      'simulatte-grounding-basis-cards',
    ],
  };
  await writeJson(path.join(UNIVERSE_DIR, 'manifest.json'), manifest);

  const generatedDocs = generatedUniverseDocs();
  for (const definition of INDEX_DEFINITIONS) {
    if (definition.name === 'affordances') continue;
    const current = await readJson(artifactPath(definition.artifact), {});
    const handAuthored = (current.documents || []).filter((doc) => !doc.provenance || doc.provenance.generated !== true);
    const docs = mergeDocuments(handAuthored, [
      ...(DEFAULT_DOCS[definition.name] || []),
      ...(generatedDocs[definition.name] || []),
    ]);
    const index = normalizeIndex(definition.name, current, docs.map((doc) => normalizeDocument(definition.name, doc)));
    addSemanticFeatures(index);
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

function generatedUniverseDocs() {
  const catalog = require('../public/js/simulatte-physics-catalog.js');
  const ragApi = require('../public/js/simulatte-semantic-rag.js');
  const graphApi = require('../public/js/simulatte-graph-synthesis.js');
  const primitiveIds = new Set((catalog.PHYSICAL_PRIMITIVES || []).map((primitive) => primitive.id));
  const cards = [
    ...(ragApi.SEMANTIC_SURFACE_CARDS || []),
    ...(ragApi.GROUNDING_BASIS_CARDS || []),
    ...synthesisCardsForUniverse(graphApi.SURFACE_CARD_LIBRARY || []),
  ];
  const docs = {
    concepts: [],
    materials: [],
    processes: [],
    relations: [],
    operators: [],
    shapes: [],
    scenes: [],
    synonyms: [],
    analogs: [],
  };
  const operatorTypes = new Set();
  const materialIds = new Set();
  const shapeIds = new Set();

  for (const primitive of catalog.PHYSICAL_PRIMITIVES || []) {
    const row = conceptFromPrimitive(primitive);
    docs.concepts.push(row);
    if (primitive.layer === 'material') {
      docs.materials.push(materialFromPrimitive(primitive));
      materialIds.add(primitive.id);
    }
    if (['field', 'process', 'constraint'].includes(primitive.type) || primitive.layer === 'physics') {
      const operatorDoc = operatorFromPrimitive(primitive);
      docs.operators.push(operatorDoc);
      operatorTypes.add(operatorDoc.operatorType);
    }
    if (primitive.layer === 'scene') {
      const sceneDoc = sceneFromPrimitive(primitive);
      docs.scenes.push(sceneDoc);
    }
    if (['body', 'component', 'material', 'field', 'source', 'sink'].includes(primitive.type)) {
      const shapeDoc = shapeFromPrimitive(primitive);
      docs.shapes.push(shapeDoc);
      shapeIds.add(shapeDoc.id);
    }
    docs.synonyms.push(...synonymsForTarget(row.canonicalId, 'concept', primitiveAliases(primitive), `primitive-${primitive.id}`));
  }

  for (const [operatorId, registry] of Object.entries(catalog.OPERATOR_REGISTRY || {})) {
    const operatorType = normalizeOperatorType(operatorId);
    docs.operators.push(generated({
      id: `operator.${slug(operatorId)}`,
      label: labelFromId(operatorId),
      operatorType,
      domains: uniqueSorted([operatorId, ...(registry.inputs || []), ...(registry.outputs || [])]),
      stateVariables: uniqueSorted(registry.state || []),
      primitiveHints: primitiveHintsForText(`${operatorId} ${(registry.inputs || []).join(' ')} ${(registry.outputs || []).join(' ')}`, primitiveIds),
    }, 'operator-registry'));
    operatorTypes.add(operatorType);
  }

  for (const card of cards) {
    const conceptDoc = conceptFromCard(card, primitiveIds);
    docs.concepts.push(conceptDoc);
    docs.synonyms.push(...synonymsForTarget(conceptDoc.canonicalId, 'concept', card.labels || [], card.id));
    const materialHints = normalizeHints(card.materialHints || []);
    for (const hint of materialHints) {
      docs.materials.push(materialFromHint(hint));
      materialIds.add(materialIdForHint(hint));
    }
    for (const hint of normalizeHints([
      ...(card.behaviorHints || []),
      ...(card.affordanceHints || []),
      ...(card.eventHints || []),
    ])) {
      const operatorType = normalizeOperatorType(hint);
      operatorTypes.add(operatorType);
      docs.operators.push(operatorFromHint(hint, card, primitiveIds));
      docs.processes.push(processFromHint(hint, card, primitiveIds));
      docs.relations.push(relationFromHint(hint, card, primitiveIds));
    }
    for (const hint of normalizeHints(card.relationHints || [])) {
      const operatorType = normalizeOperatorType(hint);
      operatorTypes.add(operatorType);
      docs.operators.push(operatorFromHint(hint, card, primitiveIds));
      docs.relations.push(relationFromHint(hint, card, primitiveIds));
    }
    for (const hint of normalizeHints(card.shapeHints || [])) {
      const shapeDoc = shapeFromHint(hint, card, primitiveIds);
      docs.shapes.push(shapeDoc);
      shapeIds.add(shapeDoc.id);
    }
    if (card.type === 'environment' || card.type === 'scene') {
      docs.scenes.push(sceneFromCard(card, primitiveIds));
    }
  }

  for (const primitive of catalog.COMPOSITION_LIBRARY || []) {
    docs.scenes.push(sceneFromPrimitive(primitive));
  }

  for (const doc of docs.concepts) {
    const hints = normalizeHints(doc.operatorHints || []);
    for (const hint of hints) operatorTypes.add(hint);
  }
  for (const doc of docs.operators) operatorTypes.add(doc.operatorType);

  for (const doc of docs.concepts) {
    docs.analogs.push(analogFromConcept(doc));
  }

  return Object.fromEntries(Object.entries(docs).map(([name, rows]) => [
    name,
    uniqueRows(rows).map((doc) => finalizeGeneratedDoc(doc, name, {
      materialIds,
      operatorTypes,
      shapeIds,
      primitiveIds,
    })),
  ]));
}

function conceptFromPrimitive(primitive) {
  const canonicalId = `primitive.${primitive.id}`;
  return generated({
    id: `concept.primitive-${slug(primitive.id)}`,
    label: primitive.label || labelFromId(primitive.id),
    aliases: primitiveAliases(primitive),
    canonicalId,
    semanticType: `${primitive.layer || primitive.type || 'physical'}Primitive`,
    domains: uniqueSorted([primitive.layer, primitive.type, ...(primitive.domains || [])]),
    materialId: primitive.layer === 'material' ? primitive.id : primitive.material || '',
    operatorHints: operatorHintsForText(primitiveText(primitive)),
    primitiveHints: [primitive.id],
  }, 'physics-catalog');
}

function materialFromPrimitive(primitive) {
  return generated({
    id: `material.${slug(primitive.id)}`,
    label: primitive.label || labelFromId(primitive.id),
    aliases: primitiveAliases(primitive),
    materialId: primitive.id,
    properties: cloneJson(primitive.properties || {}),
    primitiveHints: [primitive.id],
  }, 'physics-catalog');
}

function operatorFromPrimitive(primitive) {
  return generated({
    id: `operator.primitive-${slug(primitive.id)}`,
    label: primitive.label || labelFromId(primitive.id),
    aliases: primitiveAliases(primitive),
    operatorType: normalizeOperatorType(primitive.id),
    domains: uniqueSorted([primitive.layer, primitive.type, ...(primitive.domains || [])]),
    stateVariables: uniqueSorted(primitive.controls || []),
    primitiveHints: [primitive.id],
  }, 'physics-catalog');
}

function shapeFromPrimitive(primitive) {
  return generated({
    id: `shape.primitive-${slug(primitive.id)}`,
    label: `${primitive.label || labelFromId(primitive.id)} form`,
    aliases: primitiveAliases(primitive),
    shapeKind: shapeKindForText(primitiveText(primitive)),
    domains: uniqueSorted([primitive.layer, primitive.type, ...(primitive.domains || [])]),
    primitiveHints: [primitive.id],
  }, 'physics-catalog');
}

function sceneFromPrimitive(primitive) {
  return generated({
    id: `scene.primitive-${slug(primitive.id)}`,
    label: primitive.label || labelFromId(primitive.id),
    aliases: primitiveAliases(primitive),
    sceneKind: sceneKindForText(primitiveText(primitive)),
    conceptIds: [`primitive.${primitive.id}`],
    shapeIds: [`shape.primitive-${slug(primitive.id)}`],
    primitiveHints: [primitive.id],
  }, 'physics-catalog');
}

function conceptFromCard(card, primitiveIds) {
  const label = (card.labels && card.labels[0]) || labelFromId(card.id);
  const materialHints = normalizeHints(card.materialHints || []);
  const operatorHints = normalizeHints([
    ...(card.behaviorHints || []),
    ...(card.affordanceHints || []),
    ...(card.eventHints || []),
    ...(card.relationHints || []),
  ]).map(normalizeOperatorType);
  return generated({
    id: `concept.card-${slug(card.id)}`,
    label,
    aliases: card.labels || [],
    canonicalId: card.id,
    semanticType: card.type || 'concept',
    domains: uniqueSorted([
      card.type,
      ...(card.classHints || []),
      ...(card.shapeHints || []),
      ...(card.scaleHints || []),
    ]),
    materialId: materialHints.length ? materialIdForHint(materialHints[0]) : '',
    operatorHints,
    primitiveHints: uniqueSorted([
      ...normalizeHints(card.primitiveHints || []),
      ...primitiveHintsForText(cardText(card), primitiveIds),
    ]),
  }, 'semantic-surface-card');
}

function materialFromHint(hint) {
  const materialId = materialIdForHint(hint);
  return generated({
    id: `material.${slug(materialId)}`,
    label: labelFromId(hint),
    aliases: [hint],
    materialId,
    properties: {},
    primitiveHints: [],
  }, 'semantic-surface-card');
}

function operatorFromHint(hint, card, primitiveIds) {
  const operatorType = normalizeOperatorType(hint);
  return generated({
    id: `operator.${slug(operatorType)}`,
    label: labelFromId(hint),
    aliases: [hint, ...(card.labels || []).slice(0, 2)],
    operatorType,
    domains: uniqueSorted([card.type, ...(card.classHints || []), ...(card.behaviorHints || [])]),
    stateVariables: [],
    primitiveHints: primitiveHintsForText(`${hint} ${cardText(card)}`, primitiveIds),
  }, 'semantic-surface-card');
}

function processFromHint(hint, card, primitiveIds) {
  const operatorType = normalizeOperatorType(hint);
  return generated({
    id: `process.${slug(operatorType)}`,
    label: labelFromId(hint),
    aliases: [hint, ...(card.labels || []).slice(0, 2)],
    process: operatorType,
    operatorHints: [operatorType],
    primitiveHints: primitiveHintsForText(`${hint} ${cardText(card)}`, primitiveIds),
  }, 'semantic-surface-card');
}

function relationFromHint(hint, card, primitiveIds) {
  const operatorType = normalizeOperatorType(hint);
  return generated({
    id: `relation.${slug(operatorType)}`,
    label: labelFromId(hint),
    aliases: [hint, ...(card.labels || []).slice(0, 2)],
    edgeType: operatorType,
    operatorHints: [operatorType],
    primitiveHints: primitiveHintsForText(`${hint} ${cardText(card)}`, primitiveIds),
  }, 'semantic-surface-card');
}

function shapeFromHint(hint, card, primitiveIds) {
  return generated({
    id: `shape.${slug(hint)}`,
    label: labelFromId(hint),
    aliases: [hint, ...(card.labels || []).slice(0, 2)],
    shapeKind: shapeKindForText(hint),
    domains: uniqueSorted([card.type, ...(card.classHints || [])]),
    primitiveHints: primitiveHintsForText(`${hint} ${cardText(card)}`, primitiveIds),
  }, 'semantic-surface-card');
}

function sceneFromCard(card, primitiveIds) {
  const label = (card.labels && card.labels[0]) || labelFromId(card.id);
  return generated({
    id: `scene.card-${slug(card.id)}`,
    label,
    aliases: card.labels || [],
    sceneKind: sceneKindForText(cardText(card)),
    conceptIds: [card.id],
    shapeIds: normalizeHints(card.shapeHints || []).map((hint) => `shape.${slug(hint)}`),
    primitiveHints: uniqueSorted([
      ...normalizeHints(card.primitiveHints || []),
      ...primitiveHintsForText(cardText(card), primitiveIds),
    ]),
  }, 'semantic-surface-card');
}

function synthesisCardsForUniverse(cards) {
  return (cards || []).map((card) => {
    const grounding = card.grounding || {};
    return {
      id: `synthesis.${card.id}`,
      type: card.type,
      labels: card.labels || [],
      description: card.text || '',
      classHints: grounding.classes || [],
      shapeHints: grounding.shapes || [],
      partHints: grounding.parts || [],
      materialHints: grounding.materials || [],
      behaviorHints: grounding.behaviors || [],
      affordanceHints: grounding.ports || [],
      relationHints: grounding.constraints || [],
      primitiveHints: grounding.primitiveIds || [],
    };
  });
}

function analogFromConcept(doc) {
  return generated({
    id: `analog.${slug(doc.canonicalId || doc.id)}`,
    label: doc.label,
    concepts: [doc.canonicalId],
    operators: normalizeHints(doc.operatorHints || []),
  }, doc.provenance && doc.provenance.source || 'generated-concept');
}

function synonymsForTarget(targetId, targetKind, aliases, source) {
  return normalizeAliases(aliases || []).map((alias) => generated({
    id: `synonym.${slug(`${targetKind}-${targetId}-${alias}`)}`,
    label: alias,
    aliases: [alias],
    targetId,
    targetKind,
  }, source));
}

function finalizeGeneratedDoc(doc, indexName, refs) {
  const next = { ...doc };
  if (indexName === 'concepts') {
    next.operatorHints = normalizeHints(next.operatorHints || []).filter((hint) => refs.operatorTypes.has(hint));
    if (next.materialId && !refs.materialIds.has(next.materialId)) next.materialId = '';
  }
  if (indexName === 'affordances') {
    next.operatorTypes = normalizeHints(next.operatorTypes || []).filter((hint) => refs.operatorTypes.has(hint));
    next.materialIds = normalizeHints(next.materialIds || []).filter((hint) => refs.materialIds.has(hint));
    next.primitiveHints = normalizeHints(next.primitiveHints || []).filter((hint) => refs.primitiveIds.has(hint));
    next.shapeHints = normalizeHints(next.shapeHints || []).filter((hint) => refs.shapeIds.has(hint));
  }
  if (['operators', 'processes', 'relations'].includes(indexName)) {
    next.operatorHints = normalizeHints(next.operatorHints || []).filter((hint) => refs.operatorTypes.has(hint));
    next.primitiveHints = normalizeHints(next.primitiveHints || []).filter((hint) => refs.primitiveIds.has(hint));
  }
  if (indexName === 'shapes') {
    next.primitiveHints = normalizeHints(next.primitiveHints || []).filter((hint) => refs.primitiveIds.has(hint));
  }
  if (indexName === 'scenes') {
    next.shapeIds = normalizeHints(next.shapeIds || []).filter((hint) => refs.shapeIds.has(hint));
    next.primitiveHints = normalizeHints(next.primitiveHints || []).filter((hint) => refs.primitiveIds.has(hint));
  }
  return next;
}

function addSemanticFeatures(index) {
  const ragApi = require('../public/js/simulatte-semantic-rag.js');
  const featureDim = Number(ragApi.FEATURE_DIM || 384);
  const packed = new Float32Array(index.documents.length * featureDim);
  index.documents = index.documents.map((doc, order) => {
    const candidateText = universeCandidateText(doc);
    const vector = ragApi.buildSemanticFeatureVector(candidateText, featureDim);
    packed.set(vector, order * featureDim);
    return { ...doc, candidateText };
  });
  index.featureModelId = 'simulatte-semantic-feature-v1';
  index.featureDim = featureDim;
  index.featurePackedBase64 = Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength).toString('base64');
}

function generated(doc, source) {
  return {
    ...doc,
    provenance: {
      schema: 'simulatte.universeDocProvenance.v1',
      generated: true,
      source,
    },
  };
}

function uniqueRows(rows) {
  const byId = new Map();
  for (const row of rows || []) {
    if (!row || !row.id) continue;
    const existing = byId.get(row.id);
    byId.set(row.id, existing ? mergeRow(existing, row) : row);
  }
  return [...byId.values()];
}

function mergeRow(a, b) {
  return {
    ...a,
    ...b,
    aliases: uniqueSorted([...(a.aliases || []), ...(b.aliases || [])]),
    domains: uniqueSorted([...(a.domains || []), ...(b.domains || [])]),
    operatorHints: uniqueSorted([...(a.operatorHints || []), ...(b.operatorHints || [])]),
    primitiveHints: uniqueSorted([...(a.primitiveHints || []), ...(b.primitiveHints || [])]),
    conceptIds: uniqueSorted([...(a.conceptIds || []), ...(b.conceptIds || [])]),
    shapeIds: uniqueSorted([...(a.shapeIds || []), ...(b.shapeIds || [])]),
    concepts: uniqueSorted([...(a.concepts || []), ...(b.concepts || [])]),
    operators: uniqueSorted([...(a.operators || []), ...(b.operators || [])]),
  };
}

function universeCandidateText(doc) {
  return [
    doc.id,
    doc.label,
    doc.canonicalId,
    doc.semanticType,
    doc.materialId,
    doc.operatorType,
    doc.process,
    doc.edgeType,
    doc.shapeKind,
    doc.sceneKind,
    ...(doc.aliases || []),
    ...(doc.domains || []),
    ...(doc.operatorHints || []),
    ...(doc.primitiveHints || []),
  ].filter(Boolean).join(' ');
}

function primitiveText(primitive) {
  return [
    primitive.id,
    primitive.label,
    primitive.type,
    primitive.layer,
    primitive.role,
    primitive.text,
    ...(primitive.domains || []),
    ...(primitive.recipe || []),
    ...(primitive.controls || []),
  ].filter(Boolean).join(' ');
}

function cardText(card) {
  return [
    card.id,
    card.type,
    ...(card.labels || []),
    card.description,
    ...(card.primitiveHints || []),
    ...(card.classHints || []),
    ...(card.shapeHints || []),
    ...(card.partHints || []),
    ...(card.materialHints || []),
    ...(card.behaviorHints || []),
    ...(card.affordanceHints || []),
    ...(card.relationHints || []),
    ...(card.eventHints || []),
    ...(card.scaleHints || []),
  ].filter(Boolean).join(' ');
}

function primitiveAliases(primitive) {
  return uniqueSorted([
    primitive.id,
    primitive.label,
    ...(String(primitive.text || '').split(/\s+/).filter((token) => token.length > 3).slice(0, 6)),
  ]);
}

function primitiveHintsForText(text, primitiveIds) {
  const haystack = ` ${String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const out = [];
  for (const id of primitiveIds) {
    const label = id.replace(/-/g, ' ');
    if (haystack.includes(` ${label} `) || haystack.includes(` ${id.toLowerCase()} `)) out.push(id);
    if (out.length >= 8) break;
  }
  return uniqueSorted(out);
}

function operatorHintsForText(text) {
  const lower = String(text || '').toLowerCase();
  const pairs = [
    ['magnetic_field', /magnet|dipole|flux/],
    ['field_refraction', /lens|prism|optic|laser|light|glass/],
    ['field_reflection', /mirror|reflect/],
    ['heat_transfer', /heat|thermal|temperature|sun|laser|cool/],
    ['network_flow', /network|queue|traffic|market|route|logistics/],
    ['controller_response', /controller|feedback|control|state machine/],
    ['pressure_flow_lite', /pressure|pipe|pump|flow|fluid|water|brine/],
    ['crystallization', /crystal|lattice|nucleation/],
    ['wave_field', /wave|acoustic|sound|resonance|oscillat/],
    ['particle_sorting', /particle|dust|granular|powder|sort/],
    ['surface_tension', /surface|film|membrane|bubble|capillary/],
    ['fracture_threshold', /fracture|crack|break|rupture|impact/],
    ['growth_decay', /growth|biology|cell|mycelium|plant|population/],
    ['reaction_diffusion', /reaction|diffusion|chemical|enzyme|catalyst/],
  ];
  return uniqueSorted(pairs.filter(([, pattern]) => pattern.test(lower)).map(([operatorType]) => operatorType));
}

function shapeKindForText(text) {
  const lower = String(text || '').toLowerCase();
  if (/grid|network|graph|queue|traffic/.test(lower)) return 'grid';
  if (/building|structure|room|warehouse|factory|house|apartment|office|school|hospital|stairwell|corridor|hallway|basement|garage|roof|shed|cabin|box|shell/.test(lower)) return 'building-shell';
  if (/ring|coil|loop|wheel|rotor|circle/.test(lower)) return 'ring';
  if (/tube|pipe|channel|vessel|column/.test(lower)) return 'tube';
  if (/branch|tree|root|mycelium|river/.test(lower)) return 'branching-network';
  if (/film|membrane|sheet|panel|surface/.test(lower)) return 'sheet';
  if (/lens|disc|disk|sphere|ball/.test(lower)) return 'disc';
  if (/wing|airfoil|bird/.test(lower)) return 'winged-body';
  if (/body|animal|human|mammal|robot/.test(lower)) return 'articulated-body';
  return 'body';
}

function sceneKindForText(text) {
  const lower = String(text || '').toLowerCase();
  if (/city|traffic|queue|market|warehouse|logistics|network/.test(lower)) return 'city';
  if (/acoustic|sound|wave|resonance|tube/.test(lower)) return 'acoustic';
  if (/biology|cell|mycelium|plant|animal|organism|growth|reef|algae/.test(lower)) return 'biology';
  if (/film|surface|membrane|bubble/.test(lower)) return 'thin-film';
  if (/magnet|coil|rotor|stator|motor/.test(lower)) return 'magnetic-machine';
  if (/lens|prism|mirror|optic|laser|light/.test(lower)) return 'optics';
  if (/river|water|terrain|erosion|brine|pressure|fluid/.test(lower)) return 'watershed';
  if (/fire|thermal|heat|plume|smoke/.test(lower)) return 'thermal-plume';
  if (/granular|sand|powder|grain/.test(lower)) return 'granular';
  return 'literal-composite';
}

function materialIdForHint(hint) {
  return String(hint || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'material';
}

function normalizeOperatorType(hint) {
  const normalized = String(hint || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'operator';
  const aliases = {
    fluid_flow: 'pressure_flow_lite',
    growth: 'growth_decay',
    pressure_flow: 'pressure_flow_lite',
  };
  return aliases[normalized] || normalized;
}

function normalizeHints(values) {
  return uniqueSorted(values || []).map((value) => String(value).trim()).filter(Boolean);
}

function labelFromId(value) {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'item';
}

function slug(value) {
  return String(value || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'item';
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
