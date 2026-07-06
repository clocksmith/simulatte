import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const UNIVERSE_DIR = path.join(ROOT, 'public/data/simulatte-universe');

export const DEFAULT_EMBED_MODEL = Object.freeze({
  id: 'google-embeddinggemma-300m-q4k-ehf16-af32',
  dimensions: 768,
  manifestHash: {
    alg: 'sha256',
    hex: '9ac0f54f10fdeddfd67ea07661342713267d60ec57361e6e9d9d72e727407cd2',
  },
});

export const INDEX_DEFINITIONS = Object.freeze([
  {
    name: 'concepts',
    kind: 'concept-index',
    artifact: './concept-index-v1.json',
    schema: 'simulatte.universeConceptIndex.v1',
    id: 'simulatte-universe-concepts-v1',
  },
  {
    name: 'materials',
    kind: 'material-index',
    artifact: './material-index-v1.json',
    schema: 'simulatte.universeMaterialIndex.v1',
    id: 'simulatte-universe-materials-v1',
  },
  {
    name: 'processes',
    kind: 'process-index',
    artifact: './process-index-v1.json',
    schema: 'simulatte.universeProcessIndex.v1',
    id: 'simulatte-universe-processes-v1',
  },
  {
    name: 'relations',
    kind: 'relation-index',
    artifact: './relation-index-v1.json',
    schema: 'simulatte.universeRelationIndex.v1',
    id: 'simulatte-universe-relations-v1',
  },
  {
    name: 'operators',
    kind: 'operator-index',
    artifact: './operator-index-v1.json',
    schema: 'simulatte.universeOperatorIndex.v1',
    id: 'simulatte-universe-operators-v1',
  },
  {
    name: 'affordances',
    kind: 'affordance-index',
    artifact: './affordance-index-v1.json',
    schema: 'simulatte.universeAffordanceIndex.v1',
    id: 'simulatte-universe-affordances-v1',
  },
  {
    name: 'shapes',
    kind: 'shape-index',
    artifact: './shape-index-v1.json',
    schema: 'simulatte.universeShapeIndex.v1',
    id: 'simulatte-universe-shapes-v1',
  },
  {
    name: 'scenes',
    kind: 'scene-index',
    artifact: './scene-index-v1.json',
    schema: 'simulatte.universeSceneIndex.v1',
    id: 'simulatte-universe-scenes-v1',
  },
  {
    name: 'synonyms',
    kind: 'synonym-index',
    artifact: './synonym-index-v1.json',
    schema: 'simulatte.universeSynonymIndex.v1',
    id: 'simulatte-universe-synonyms-v1',
  },
  {
    name: 'analogs',
    kind: 'physical-analog-index',
    artifact: './physical-analog-index-v1.json',
    schema: 'simulatte.universePhysicalAnalogIndex.v1',
    id: 'simulatte-universe-analogs-v1',
  },
]);

export const INDEX_BY_NAME = Object.freeze(Object.fromEntries(
  INDEX_DEFINITIONS.map((definition) => [definition.name, definition])
));

export const REQUIRED_INDEX_NAMES = Object.freeze(INDEX_DEFINITIONS.map((definition) => definition.name));

export function stableStringify(value) {
  return `${JSON.stringify(sortStable(value), null, 2)}\n`;
}

export function sortStable(value) {
  if (Array.isArray(value)) return value.map(sortStable);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = sortStable(value[key]);
    return out;
  }, {});
}

export function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean).map((value) => String(value)))].sort();
}

export function normalizeAliases(values) {
  return uniqueSorted(values).filter((value) => value.trim());
}

export function artifactPath(artifact) {
  return path.join(UNIVERSE_DIR, String(artifact || '').replace(/^\.\//, ''));
}

export async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, stableStringify(value));
}

export async function readManifest() {
  return readJson(path.join(UNIVERSE_DIR, 'manifest.json'), null);
}

export function normalizeIndex(name, current = {}, documents = []) {
  const definition = INDEX_BY_NAME[name];
  if (!definition) throw new Error(`unknown universe index ${name}`);
  return {
    schema: definition.schema,
    id: current.id || definition.id,
    documents: sortDocuments(documents),
  };
}

export function sortDocuments(documents) {
  return [...(documents || [])].sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
}

export function mergeDocuments(existing = [], defaults = []) {
  const byId = new Map();
  for (const row of defaults || []) {
    if (row && row.id) byId.set(row.id, cloneJson(row));
  }
  for (const row of existing || []) {
    if (row && row.id) byId.set(row.id, cloneJson(row));
  }
  return sortDocuments([...byId.values()]);
}

export function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function createManifest(existing = {}) {
  return {
    schema: 'simulatte.universeManifest.v1',
    id: existing.id || 'simulatte-universe-multi-index-v1',
    embedModel: cloneJson(DEFAULT_EMBED_MODEL),
    indexes: Object.fromEntries(INDEX_DEFINITIONS.map((definition) => [
      definition.name,
      {
        kind: definition.kind,
        artifact: definition.artifact,
        documentSchema: definition.schema,
      },
    ])),
  };
}

export async function loadUniversePackage() {
  const manifest = await readManifest();
  if (!manifest) throw new Error('universe manifest missing');
  const indexes = {};
  for (const [name, config] of Object.entries(manifest.indexes || {})) {
    indexes[name] = await readJson(artifactPath(config.artifact));
  }
  return { manifest, indexes };
}

export function loadPrimitiveIds() {
  const catalog = require('../public/pipeline/phase-06-simulation/simulatte-physics-catalog.js');
  return new Set((catalog.PHYSICAL_PRIMITIVES || []).map((primitive) => primitive.id));
}

export function validateUniversePackage({ manifest, indexes }, options = {}) {
  const errors = [];
  const warnings = [];
  const primitiveIds = options.primitiveIds || loadPrimitiveIds();
  const requiredNames = new Set(REQUIRED_INDEX_NAMES);
  const actualNames = new Set(Object.keys(manifest && manifest.indexes || {}));

  if (!manifest || manifest.schema !== 'simulatte.universeManifest.v1') {
    errors.push('manifest.schema must be simulatte.universeManifest.v1');
  }
  if (!manifest || !manifest.id) errors.push('manifest.id is required');
  if (!manifest || !manifest.embedModel || manifest.embedModel.id !== DEFAULT_EMBED_MODEL.id) {
    errors.push(`manifest.embedModel.id must be ${DEFAULT_EMBED_MODEL.id}`);
  }
  if (Number(manifest && manifest.embedModel && manifest.embedModel.dimensions) !== DEFAULT_EMBED_MODEL.dimensions) {
    errors.push(`manifest.embedModel.dimensions must be ${DEFAULT_EMBED_MODEL.dimensions}`);
  }
  for (const name of requiredNames) {
    if (!actualNames.has(name)) errors.push(`manifest.indexes.${name} is required`);
  }

  const documentIds = new Map();
  const referenceKeys = new Set();
  const canonicalConcepts = new Set();
  const materialIds = new Set();
  const operatorTypes = new Set();
  const processIds = new Set();
  const edgeTypes = new Set();
  const shapeIds = new Set();
  const sceneIds = new Set();

  for (const definition of INDEX_DEFINITIONS) {
    const config = manifest && manifest.indexes && manifest.indexes[definition.name];
    if (!config) continue;
    if (config.kind !== definition.kind) {
      errors.push(`manifest.indexes.${definition.name}.kind must be ${definition.kind}`);
    }
    if (config.artifact !== definition.artifact) {
      errors.push(`manifest.indexes.${definition.name}.artifact must be ${definition.artifact}`);
    }
    if (config.documentSchema && config.documentSchema !== definition.schema) {
      errors.push(`manifest.indexes.${definition.name}.documentSchema must be ${definition.schema}`);
    }
    const index = indexes[definition.name];
    if (!index) {
      errors.push(`${definition.name} index missing`);
      continue;
    }
    if (index.schema !== definition.schema) {
      errors.push(`${definition.name}.schema must be ${definition.schema}`);
    }
    if (!index.id) errors.push(`${definition.name}.id is required`);
    if (!Array.isArray(index.documents)) {
      errors.push(`${definition.name}.documents must be an array`);
      continue;
    }
    index.documents.forEach((doc, order) => {
      validateDocumentBase(definition.name, doc, order, errors);
      if (!doc || !doc.id) return;
      if (documentIds.has(doc.id)) {
        errors.push(`duplicate document id ${doc.id} in ${definition.name}; first seen in ${documentIds.get(doc.id)}`);
      }
      documentIds.set(doc.id, definition.name);
      referenceKeys.add(doc.id);
      if (doc.canonicalId) {
        referenceKeys.add(doc.canonicalId);
        if (definition.name === 'concepts') canonicalConcepts.add(doc.canonicalId);
      }
      if (doc.materialId) {
        referenceKeys.add(doc.materialId);
        if (definition.name === 'materials') materialIds.add(doc.materialId);
      }
      if (doc.operatorType) {
        referenceKeys.add(doc.operatorType);
        if (definition.name === 'operators') operatorTypes.add(doc.operatorType);
      }
      if (doc.process) {
        referenceKeys.add(doc.process);
        if (definition.name === 'processes') processIds.add(doc.process);
      }
      if (doc.edgeType) {
        referenceKeys.add(doc.edgeType);
        if (definition.name === 'relations') edgeTypes.add(doc.edgeType);
      }
      if (definition.name === 'shapes') shapeIds.add(doc.id);
      if (definition.name === 'scenes') sceneIds.add(doc.id);
    });
  }

  validateConcepts(indexes.concepts, materialIds, operatorTypes, errors);
  validateHintIndex(indexes.processes, 'processes', operatorTypes, primitiveIds, errors);
  validateHintIndex(indexes.relations, 'relations', operatorTypes, primitiveIds, errors);
  validateHintIndex(indexes.operators, 'operators', operatorTypes, primitiveIds, errors);
  validateAffordances(indexes.affordances, {
    canonicalConcepts,
    materialIds,
    operatorTypes,
    primitiveIds,
    shapeIds,
    sceneIds,
  }, errors);
  validateShapes(indexes.shapes, primitiveIds, errors);
  validateScenes(indexes.scenes, {
    canonicalConcepts,
    primitiveIds,
    shapeIds,
  }, errors);
  validateSynonyms(indexes.synonyms, referenceKeys, errors);
  validateAnalogs(indexes.analogs, canonicalConcepts, operatorTypes, errors);
  validateCoverage(indexes, warnings);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    documentCount: [...Object.values(indexes || {})]
      .reduce((sum, index) => sum + (Array.isArray(index && index.documents) ? index.documents.length : 0), 0),
  };
}

function validateDocumentBase(indexName, doc, order, errors) {
  if (!doc || typeof doc !== 'object') {
    errors.push(`${indexName}.documents[${order}] must be an object`);
    return;
  }
  if (!/^[a-z]+[a-z0-9-]*\.[a-z0-9][a-z0-9._-]*$/.test(String(doc.id || ''))) {
    errors.push(`${indexName}.documents[${order}].id must be a stable dotted id`);
  }
  if (!String(doc.label || '').trim()) {
    errors.push(`${doc.id || `${indexName}[${order}]`}.label is required`);
  }
  if (doc.aliases != null && !Array.isArray(doc.aliases)) {
    errors.push(`${doc.id}.aliases must be an array when present`);
  }
  if (doc.domains != null && !Array.isArray(doc.domains)) {
    errors.push(`${doc.id}.domains must be an array when present`);
  }
}

function validateConcepts(index, materialIds, operatorTypes, errors) {
  for (const doc of index && index.documents || []) {
    if (!doc.canonicalId) errors.push(`${doc.id}.canonicalId is required`);
    if (!doc.semanticType) errors.push(`${doc.id}.semanticType is required`);
    if (doc.materialId && !materialIds.has(doc.materialId)) {
      errors.push(`${doc.id}.materialId references missing material ${doc.materialId}`);
    }
    for (const operator of doc.operatorHints || []) {
      if (!operatorTypes.has(operator)) errors.push(`${doc.id}.operatorHints references missing operator ${operator}`);
    }
  }
}

function validateHintIndex(index, indexName, operatorTypes, primitiveIds, errors) {
  for (const doc of index && index.documents || []) {
    for (const operator of doc.operatorHints || []) {
      if (!operatorTypes.has(operator)) errors.push(`${doc.id}.operatorHints references missing operator ${operator}`);
    }
    for (const primitiveId of doc.primitiveHints || []) {
      if (!primitiveIds.has(primitiveId)) errors.push(`${doc.id}.primitiveHints references missing primitive ${primitiveId}`);
    }
    if (indexName === 'operators' && !doc.operatorType) {
      errors.push(`${doc.id}.operatorType is required`);
    }
  }
}

function validateAffordances(index, refs, errors) {
  for (const doc of index && index.documents || []) {
    for (const conceptId of doc.conceptIds || []) {
      if (!refs.canonicalConcepts.has(conceptId)) errors.push(`${doc.id}.conceptIds references missing concept ${conceptId}`);
    }
    for (const materialId of doc.materialIds || []) {
      if (!refs.materialIds.has(materialId)) errors.push(`${doc.id}.materialIds references missing material ${materialId}`);
    }
    for (const operatorType of doc.operatorTypes || []) {
      if (!refs.operatorTypes.has(operatorType)) errors.push(`${doc.id}.operatorTypes references missing operator ${operatorType}`);
    }
    for (const primitiveId of doc.primitiveHints || []) {
      if (!refs.primitiveIds.has(primitiveId)) errors.push(`${doc.id}.primitiveHints references missing primitive ${primitiveId}`);
    }
    for (const shapeId of doc.shapeHints || []) {
      if (!refs.shapeIds.has(shapeId)) errors.push(`${doc.id}.shapeHints references missing shape ${shapeId}`);
    }
    for (const sceneId of doc.sceneHints || []) {
      if (!refs.sceneIds.has(sceneId)) errors.push(`${doc.id}.sceneHints references missing scene ${sceneId}`);
    }
  }
}

function validateShapes(index, primitiveIds, errors) {
  for (const doc of index && index.documents || []) {
    if (!doc.shapeKind) errors.push(`${doc.id}.shapeKind is required`);
    for (const primitiveId of doc.primitiveHints || []) {
      if (!primitiveIds.has(primitiveId)) errors.push(`${doc.id}.primitiveHints references missing primitive ${primitiveId}`);
    }
  }
}

function validateScenes(index, refs, errors) {
  for (const doc of index && index.documents || []) {
    if (!doc.sceneKind) errors.push(`${doc.id}.sceneKind is required`);
    for (const conceptId of doc.conceptIds || []) {
      if (!refs.canonicalConcepts.has(conceptId)) errors.push(`${doc.id}.conceptIds references missing concept ${conceptId}`);
    }
    for (const primitiveId of doc.primitiveHints || []) {
      if (!refs.primitiveIds.has(primitiveId)) errors.push(`${doc.id}.primitiveHints references missing primitive ${primitiveId}`);
    }
    for (const shapeId of doc.shapeIds || []) {
      if (!refs.shapeIds.has(shapeId)) errors.push(`${doc.id}.shapeIds references missing shape ${shapeId}`);
    }
  }
}

function validateSynonyms(index, referenceKeys, errors) {
  for (const doc of index && index.documents || []) {
    if (!doc.targetId) errors.push(`${doc.id}.targetId is required`);
    if (doc.targetId && !referenceKeys.has(doc.targetId)) {
      errors.push(`${doc.id}.targetId references missing target ${doc.targetId}`);
    }
    if (!doc.targetKind) errors.push(`${doc.id}.targetKind is required`);
  }
}

function validateAnalogs(index, canonicalConcepts, operatorTypes, errors) {
  for (const doc of index && index.documents || []) {
    for (const conceptId of doc.concepts || []) {
      if (!canonicalConcepts.has(conceptId)) errors.push(`${doc.id}.concepts references missing concept ${conceptId}`);
    }
    for (const operatorType of doc.operators || []) {
      if (!operatorTypes.has(operatorType)) errors.push(`${doc.id}.operators references missing operator ${operatorType}`);
    }
  }
}

function validateCoverage(indexes, warnings) {
  const counts = Object.fromEntries(Object.entries(indexes || {}).map(([name, index]) => [
    name,
    Array.isArray(index && index.documents) ? index.documents.length : 0,
  ]));
  for (const name of REQUIRED_INDEX_NAMES) {
    if (!counts[name]) warnings.push(`${name} has no documents`);
  }
}

export function lexicalUniverseMatches(indexes, prompt, options = {}) {
  const tokens = promptTokens(prompt);
  const maxPerIndex = Number.isFinite(options.maxPerIndex) ? options.maxPerIndex : 6;
  const byIndex = {};
  const candidates = [];
  for (const [indexName, index] of Object.entries(indexes || {})) {
    const rows = (index.documents || [])
      .map((doc) => scoreUniverseDocument(indexName, doc, tokens))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, maxPerIndex);
    byIndex[indexName] = rows;
    candidates.push(...rows);
  }
  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { prompt, tokens, candidates, byIndex };
}

function scoreUniverseDocument(indexName, doc, tokens) {
  const labels = [
    doc.id,
    doc.label,
    doc.canonicalId,
    doc.materialId,
    doc.operatorType,
    doc.process,
    doc.edgeType,
    doc.shapeKind,
    doc.sceneKind,
    ...(doc.aliases || []),
    ...(doc.domains || []),
  ].filter(Boolean).map((value) => String(value).toLowerCase());
  const haystack = labels.join(' ');
  let hits = 0;
  for (const token of tokens) {
    if (token.length > 2 && haystack.includes(token)) hits += 1;
  }
  const promptText = tokens.join(' ');
  const phraseHit = labels.some((label) => label.length > 4 && promptText.includes(label));
  const score = Math.max(0, Math.min(1, hits / Math.max(2, tokens.length) + (phraseHit ? 0.42 : 0)));
  return {
    id: doc.id,
    indexName,
    label: doc.label || doc.id,
    score: Number(score.toFixed(4)),
  };
}

function promptTokens(prompt) {
  return String(prompt || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
