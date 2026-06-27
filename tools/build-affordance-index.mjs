import {
  INDEX_BY_NAME,
  artifactPath,
  mergeDocuments,
  normalizeIndex,
  readJson,
  uniqueSorted,
  writeJson,
} from './simulatte-universe-utils.mjs';

const OPERATOR_PRIMITIVES = Object.freeze({
  magnetic_field: ['magnet', 'magnetism', 'magnetic-core'],
  field_refraction: ['lens', 'optical-prism', 'optics-bench'],
  field_reflection: ['mirror', 'optics-bench'],
  heat_transfer: ['heat-transfer', 'thermal-source', 'heater'],
  network_flow: ['graph-network', 'queue-server', 'city-grid', 'traffic-system'],
  controller_response: ['controller', 'feedback-controller', 'state-machine'],
  pressure_flow_lite: ['pressure', 'pump', 'pipe', 'moving-fluid'],
  crystallization: ['crystallization', 'crystal-growth', 'nucleation'],
  wave_field: ['wave-propagation', 'wave-source', 'acoustic-emitter', 'acoustic-propagation'],
  particle_sorting: ['particle-set', 'granular-bed', 'powder-bed'],
  surface_tension: ['surface-tension', 'capillary-action', 'membrane'],
  fracture_threshold: ['fracture-mechanics', 'glass-pane', 'rock-wall'],
  growth_decay: ['growth-decay', 'population-field', 'biological-colony', 'mycelium'],
  reaction_diffusion: ['diffusion', 'chemical-reaction', 'growth-decay'],
});

const DOMAIN_SHAPES = Object.freeze({
  acoustic: ['shape.resonator-tube'],
  biology: ['shape.branching-membrane'],
  control: ['shape.queue-grid'],
  diffusion: ['shape.branching-membrane'],
  fluid: ['shape.vent-column', 'shape.film-loop'],
  fracture: ['shape.film-loop'],
  granular: ['shape.resonator-tube'],
  magnetism: ['shape.coil-ring'],
  network: ['shape.queue-grid'],
  optics: ['shape.lens-disc'],
  phase: ['shape.vent-column'],
  pressure: ['shape.vent-column'],
  queue: ['shape.queue-grid'],
  surface: ['shape.film-loop'],
  thermal: ['shape.coil-ring', 'shape.vent-column'],
  wave: ['shape.resonator-tube'],
});

const DOMAIN_SCENES = Object.freeze({
  acoustic: ['scene.acoustic-dust-sorter'],
  biology: ['scene.mycelium-gel-pump'],
  diffusion: ['scene.mycelium-gel-pump'],
  fluid: ['scene.brine-crystal-vent'],
  fracture: ['scene.thin-film-fracture'],
  granular: ['scene.acoustic-dust-sorter'],
  magnetism: ['scene.ferrofluid-optics'],
  network: ['scene.transit-surge'],
  optics: ['scene.ferrofluid-optics'],
  phase: ['scene.brine-crystal-vent'],
  pressure: ['scene.brine-crystal-vent'],
  queue: ['scene.transit-surge'],
  surface: ['scene.thin-film-fracture'],
  thermal: ['scene.ferrofluid-optics', 'scene.brine-crystal-vent'],
  wave: ['scene.acoustic-dust-sorter', 'scene.mycelium-gel-pump'],
});

async function main() {
  const concepts = await readIndex('concepts');
  const existing = await readIndex('affordances');
  const derived = (concepts.documents || []).map(deriveAffordance);
  const merged = mergeDocuments(existing.documents || [], derived);
  await writeJson(
    artifactPath(INDEX_BY_NAME.affordances.artifact),
    normalizeIndex('affordances', existing, merged)
  );
  console.log(JSON.stringify({
    affordances: merged.length,
    artifact: INDEX_BY_NAME.affordances.artifact,
  }, null, 2));
}

async function readIndex(name) {
  const definition = INDEX_BY_NAME[name];
  return readJson(artifactPath(definition.artifact), {
    schema: definition.schema,
    id: definition.id,
    documents: [],
  });
}

function deriveAffordance(concept) {
  const operatorTypes = uniqueSorted(concept.operatorHints || []);
  const domains = uniqueSorted(concept.domains || []);
  const primitiveHints = uniqueSorted(operatorTypes.flatMap((operator) => OPERATOR_PRIMITIVES[operator] || []));
  const shapeHints = uniqueSorted(domains.flatMap((domain) => DOMAIN_SHAPES[domain] || []));
  const sceneHints = uniqueSorted(domains.flatMap((domain) => DOMAIN_SCENES[domain] || []));
  return {
    id: `affordance.${String(concept.canonicalId || concept.id).replace(/^[^.]+\./, '').replace(/[._]+/g, '-')}`,
    label: `${concept.label} affordances`,
    aliases: uniqueSorted([concept.label, ...(concept.aliases || [])]),
    domains,
    conceptIds: concept.canonicalId ? [concept.canonicalId] : [],
    materialIds: concept.materialId ? [concept.materialId] : [],
    operatorTypes,
    primitiveHints,
    shapeHints,
    sceneHints,
    unsupportedPolicy: 'preserve-semantic-node',
  };
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
