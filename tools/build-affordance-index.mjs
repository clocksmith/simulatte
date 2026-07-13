import {
  INDEX_BY_NAME,
  artifactPath,
  loadPrimitiveIds,
  mergeDocuments,
  normalizeIndex,
  readJson,
  uniqueSorted,
  writeJson,
} from './simulatte-universe-utils.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

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
  const refs = await loadReferenceSets(concepts);
  const derived = (concepts.documents || []).map(deriveAffordance);
  const merged = mergeDocuments(derived, existing.documents || [])
    .map((row) => sanitizeAffordance(row, refs));
  const index = normalizeIndex('affordances', existing, merged);
  addSemanticFeatures(index);
  await writeJson(
    artifactPath(INDEX_BY_NAME.affordances.artifact),
    index
  );
  console.log(JSON.stringify({
    affordances: index.documents.length,
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
  const primitiveHints = uniqueSorted([
    ...(concept.primitiveHints || []),
    ...operatorTypes.flatMap((operator) => OPERATOR_PRIMITIVES[operator] || []),
  ]);
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
    provenance: {
      schema: 'simulatte.universeDocProvenance.v1',
      generated: true,
      source: 'concept-index',
    },
    unsupportedPolicy: 'preserve-semantic-node',
  };
}

async function loadReferenceSets(concepts) {
  const [materials, operators, shapes, scenes] = await Promise.all([
    readIndex('materials'),
    readIndex('operators'),
    readIndex('shapes'),
    readIndex('scenes'),
  ]);
  const materialIds = new Set((materials.documents || []).map((row) => row.materialId).filter(Boolean));
  const operatorTypes = new Set((operators.documents || []).map((row) => row.operatorType).filter(Boolean));
  const shapeIds = new Set((shapes.documents || []).map((row) => row.id).filter(Boolean));
  const sceneIds = new Set((scenes.documents || []).map((row) => row.id).filter(Boolean));
  return {
    canonicalConcepts: new Set((concepts.documents || []).map((row) => row.canonicalId).filter(Boolean)),
    materialIds,
    operatorTypes,
    primitiveIds: loadPrimitiveIds(),
    sceneIds,
    shapeIds,
  };
}

function sanitizeAffordance(row, refs) {
  return {
    ...row,
    aliases: uniqueSorted(row.aliases || []),
    domains: uniqueSorted(row.domains || []),
    conceptIds: uniqueSorted(row.conceptIds || []).filter((id) => refs.canonicalConcepts.has(id)),
    materialIds: uniqueSorted(row.materialIds || [])
      .map((id) => canonicalMaterialId(id, refs.materialIds))
      .filter(Boolean),
    operatorTypes: uniqueSorted(row.operatorTypes || [])
      .map((id) => canonicalOperatorType(id, refs.operatorTypes))
      .filter(Boolean),
    primitiveHints: uniqueSorted(row.primitiveHints || []).filter((id) => refs.primitiveIds.has(id)),
    sceneHints: uniqueSorted(row.sceneHints || []).filter((id) => refs.sceneIds.has(id)),
    shapeHints: uniqueSorted(row.shapeHints || []).filter((id) => refs.shapeIds.has(id)),
  };
}

function canonicalMaterialId(value, materialIds) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const candidates = [
    raw,
    raw.replace(/_/g, '-'),
    raw.replace(/-/g, '_'),
  ];
  return candidates.find((candidate) => materialIds.has(candidate)) || '';
}

function canonicalOperatorType(value, operatorTypes) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const aliases = {
    fluid_flow: 'pressure_flow_lite',
    growth: 'growth_decay',
    pressure_flow: 'pressure_flow_lite',
  };
  const candidates = [
    raw,
    normalized,
    aliases[normalized],
  ].filter(Boolean);
  return candidates.find((candidate) => operatorTypes.has(candidate)) || '';
}

function addSemanticFeatures(index) {
  const ragApi = require('../public/blank/pipeline/phase-03-retrieval/simulatte-semantic-rag.js');
  const featureDim = Number(ragApi.FEATURE_DIM || 384);
  const packed = new Float32Array(index.documents.length * featureDim);
  index.documents = index.documents.map((doc, order) => {
    const candidateText = affordanceCandidateText(doc);
    const vector = ragApi.buildSemanticFeatureVector(candidateText, featureDim);
    packed.set(vector, order * featureDim);
    return { ...doc, candidateText };
  });
  index.featureModelId = 'simulatte-semantic-feature-v1';
  index.featureDim = featureDim;
  index.featurePackedBase64 = Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength).toString('base64');
}

function affordanceCandidateText(doc) {
  return [
    doc.id,
    doc.label,
    ...(doc.aliases || []),
    ...(doc.domains || []),
    ...(doc.conceptIds || []),
    ...(doc.materialIds || []),
    ...(doc.operatorTypes || []),
    ...(doc.primitiveHints || []),
    ...(doc.shapeHints || []),
    ...(doc.sceneHints || []),
  ].filter(Boolean).join(' ');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
