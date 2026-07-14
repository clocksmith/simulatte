#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { doppler } from '../../../doppler/src/index.js';
import { bootstrapNodeWebGPU } from '../../../doppler/src/tooling/node-webgpu.js';
import {
  lockedEmbeddingModel,
  modelRuntimeLockHash,
  readModelRuntimeLock,
} from '../model-runtime-lock-utils.mjs';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const WORLD_PATH = 'public/data/autonomy/worlds/nyc-core-autonomy-v1.json';
const REGION_REGISTRY_PATH = 'public/data/autonomy/regions/nyc-core-v1.json';
const MODEL_LOCK_PATH = 'public/data/simulatte-embedder/model-runtime-lock.json';
const OUTPUT_PATH = 'public/data/autonomy/place-embedding-index-v1.json';
const INDEX_ID = 'nyc-core-place-embedding-index-v1';
const CONTENT_VERSION = 'nyc-core-place-embeddings-v1';
const DESCRIPTOR_POLICY = Object.freeze({
  id: 'governed-world-place-descriptor-v1',
  nearbyStreetRadiusM: 450,
  maximumNearbyStreetNames: 24,
  nearbyParkRadiusM: 550,
  maximumNearbyParkProperties: 3,
  coordinatePrecision: 5,
  sourceFields: [
    'governed_place_label',
    'governed_node_kind',
    'region_pack_identity',
    'world_coordinates',
    'nearby_compiled_osm_street_names',
    'nearby_nyc_parks_property_labels',
    'declared_circuit_aliases',
  ],
  excludedSources: ['place_resolution_diagnostic_probes', 'evaluation_gold_labels'],
});

function parseArgs(argv) {
  const options = { check: false, outputPath: OUTPUT_PATH, modelDirectory: process.env.SIMULATTE_EMBED_MODEL_DIR || '' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') options.check = true;
    else if (argument === '--out') options.outputPath = String(argv[++index] || '');
    else if (argument === '--model-dir') options.modelDirectory = String(argv[++index] || '');
    else throw new Error(`unknown argument: ${argument}`);
  }
  if (!options.outputPath) throw new Error('--out expected a path');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputs = await loadInputs();
  const documents = buildPlaceDocuments(inputs.world, inputs.regionRegistry);
  if (options.check) {
    const index = JSON.parse(await fs.readFile(resolvePath(options.outputPath), 'utf8'));
    validateIndex(index, inputs, documents);
    console.log(`PLACE-EMBEDDINGS check=pass index=${index.id} documents=${index.documentCount} dimensions=${index.embeddingDim}`);
    return;
  }
  const index = await compileIndex(inputs, documents, options);
  const outputPath = resolvePath(options.outputPath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${stableStringify(index)}\n`);
  console.log(`PLACE-EMBEDDINGS build=pass index=${index.id} documents=${index.documentCount} dimensions=${index.embeddingDim} output=${path.relative(ROOT, outputPath)}`);
}

async function loadInputs() {
  const [worldText, regionRegistryText, generatorBytes] = await Promise.all([
    fs.readFile(resolvePath(WORLD_PATH), 'utf8'),
    fs.readFile(resolvePath(REGION_REGISTRY_PATH), 'utf8'),
    fs.readFile(fileURLToPath(import.meta.url)),
  ]);
  const modelLock = readModelRuntimeLock();
  const embeddingModel = lockedEmbeddingModel();
  return {
    world: JSON.parse(worldText),
    regionRegistry: JSON.parse(regionRegistryText),
    modelLock,
    embeddingModel,
    identities: {
      world: identity(WORLD_PATH, JSON.parse(worldText).id, Buffer.from(worldText)),
      regionRegistry: identity(REGION_REGISTRY_PATH, JSON.parse(regionRegistryText).id, Buffer.from(regionRegistryText)),
      modelRuntimeLock: {
        path: MODEL_LOCK_PATH,
        id: modelLock.id,
        number: modelLock.number,
        sha256: modelRuntimeLockHash(),
      },
      generator: {
        path: path.relative(ROOT, fileURLToPath(import.meta.url)),
        sha256: sha256Hex(generatorBytes),
      },
    },
  };
}

function buildPlaceDocuments(world, regionRegistry) {
  const nodeById = new Map(world.nodes.map((node) => [node.id, node]));
  return [...regionRegistry.placeIndex]
    .sort((left, right) => left.label.localeCompare(right.label) || left.nodeId.localeCompare(right.nodeId))
    .map((place, order) => {
      const node = nodeById.get(place.nodeId);
      if (!node) throw new Error(`place ${place.id} references missing node ${place.nodeId}`);
      const nearbyStreets = nearestStreetNames(node.position, world.renderGeometry?.streets || []);
      const nearbyParks = nearestParkProperties(node.position, world.renderGeometry?.parks || []);
      const circuitAliases = nearbyCircuitAliases(node.position, world.circuits || [], nodeById);
      const sourceEvidence = {
        node: {
          id: node.id,
          kind: node.kind,
          position: node.position,
          positionWgs84: node.positionWgs84,
          landmarkSource: node.landmark?.source || null,
        },
        regionPackIds: [...place.packIds].sort(),
        nearbyStreets,
        nearbyParks,
        circuitAliases,
      };
      const candidateText = placeDescriptorText(place, sourceEvidence);
      return {
        order,
        placeId: place.id,
        nodeId: place.nodeId,
        label: place.label,
        candidateText,
        textSha256: sha256Hex(Buffer.from(candidateText, 'utf8')),
        sourceEvidence,
      };
    });
}

function placeDescriptorText(place, evidence) {
  const latitude = Number(evidence.node.positionWgs84?.latitude).toFixed(DESCRIPTOR_POLICY.coordinatePrecision);
  const longitude = Number(evidence.node.positionWgs84?.longitude).toFixed(DESCRIPTOR_POLICY.coordinatePrecision);
  const regions = evidence.regionPackIds.map(humanizeId).join(', ');
  const streets = evidence.nearbyStreets.map((row) => row.name).join(', ');
  const parks = evidence.nearbyParks.map((row) => `${row.label} (${row.propertyId})`).join(', ');
  return [
    'NYC navigation place',
    `name: ${place.label}`,
    `kind: ${evidence.node.kind}`,
    `region packs: ${regions || 'none'}`,
    `coordinates: ${latitude}, ${longitude}`,
    `nearby named streets: ${streets || 'none'}`,
    `nearby NYC Parks properties: ${parks || 'none'}`,
    `declared circuit aliases: ${evidence.circuitAliases.join(', ') || 'none'}`,
  ].join('\n');
}

function nearestStreetNames(position, streets) {
  const byName = new Map();
  for (const street of streets) {
    const name = String(street.name || '').trim();
    if (!name || name === 'Unnamed street') continue;
    const distanceM = distanceToPolyline(position, street.geometry || []);
    if (distanceM > DESCRIPTOR_POLICY.nearbyStreetRadiusM) continue;
    const current = byName.get(name);
    if (!current || distanceM < current.distanceM) {
      byName.set(name, {
        name,
        distanceM: round(distanceM),
        sourceWayId: String(street.sourceWayId || ''),
      });
    }
  }
  return [...byName.values()]
    .sort((left, right) => left.distanceM - right.distanceM || left.name.localeCompare(right.name))
    .slice(0, DESCRIPTOR_POLICY.maximumNearbyStreetNames);
}

function nearestParkProperties(position, parks) {
  const byProperty = new Map();
  for (const park of parks) {
    const distanceM = distanceToPolyline(position, park.outerRing || []);
    if (distanceM > DESCRIPTOR_POLICY.nearbyParkRadiusM) continue;
    const propertyId = String(park.source?.propertyId || '');
    if (!propertyId) continue;
    const row = {
      label: park.label,
      propertyId,
      distanceM: round(distanceM),
      geometryWgs84Sha256: park.source.geometryWgs84Sha256,
    };
    const current = byProperty.get(propertyId);
    if (!current || row.distanceM < current.distanceM) byProperty.set(propertyId, row);
  }
  return [...byProperty.values()]
    .sort((left, right) => left.distanceM - right.distanceM || left.propertyId.localeCompare(right.propertyId))
    .slice(0, DESCRIPTOR_POLICY.maximumNearbyParkProperties);
}

function nearbyCircuitAliases(position, circuits, nodeById) {
  const aliases = new Set();
  for (const circuit of circuits) {
    const points = circuit.nodeIds.map((id) => nodeById.get(id)?.position).filter(Boolean);
    if (distanceToPolyline(position, points) > DESCRIPTOR_POLICY.nearbyParkRadiusM) continue;
    aliases.add(circuit.label);
    (circuit.aliases || []).forEach((alias) => aliases.add(alias));
  }
  return [...aliases].sort();
}

async function compileIndex(inputs, documents, options) {
  const modelDirectory = options.modelDirectory ? path.resolve(options.modelDirectory) : '';
  const modelBaseUrl = modelDirectory ? '' : inputs.embeddingModel.defaultModelBaseUrl.replace(/\/+$/, '');
  const { manifest, manifestText } = await loadModelManifest(modelDirectory, modelBaseUrl);
  const manifestSha256 = sha256Hex(Buffer.from(manifestText, 'utf8'));
  if (manifest.modelId !== inputs.embeddingModel.id) {
    throw new Error(`embedding manifest expected modelId ${inputs.embeddingModel.id}, received ${manifest.modelId}`);
  }
  if (manifestSha256 !== inputs.embeddingModel.manifestHash.hex) {
    throw new Error(`embedding manifest expected SHA-256 ${inputs.embeddingModel.manifestHash.hex}, received ${manifestSha256}`);
  }
  const gpu = await bootstrapNodeWebGPU();
  if (!gpu.ok) throw new Error(`Node WebGPU unavailable: ${gpu.detail || gpu.provider || 'unknown'}`);
  const modelSource = modelDirectory ? { manifest, baseUrl: modelDirectory } : { url: modelBaseUrl };
  const model = await doppler.load(modelSource, {
    onProgress(event) {
      if (event?.phase === 'ready' || event?.phase === 'load') {
        console.log(`PLACE-EMBEDDINGS model=${manifest.modelId} phase=${event.phase} percent=${event.percent ?? ''}`.trim());
      }
    },
  });
  try {
    const outputs = await model.embedBatch(documents.map((row) => row.candidateText), {
      useChatTemplate: false,
      embeddingMode: inputs.embeddingModel.indexEmbeddingMode,
      __skipStateSnapshot: true,
    });
    if (!Array.isArray(outputs) || outputs.length !== documents.length) {
      throw new Error(`embedBatch expected ${documents.length} outputs, received ${outputs?.length || 0}`);
    }
    const vectors = outputs.map((output, index) => normalizeVector(output.embedding, documents[index].placeId));
    const embeddingDim = vectors[0]?.length || 0;
    if (embeddingDim !== inputs.embeddingModel.dimensions) {
      throw new Error(`embedding dimension expected ${inputs.embeddingModel.dimensions}, received ${embeddingDim}`);
    }
    if (vectors.some((vector) => vector.length !== embeddingDim)) throw new Error('embedding dimensions changed between place rows');
    const packedBytes = encodeFloat32LittleEndian(vectors, embeddingDim);
    const index = {
      schema: 'simulatte.autonomyPlaceEmbeddingIndex.v1',
      id: INDEX_ID,
      contentVersion: CONTENT_VERSION,
      documentCount: documents.length,
      embeddingDim,
      encoding: 'float32_little_endian_base64',
      normalization: 'l2_unit',
      model: {
        id: inputs.embeddingModel.id,
        family: inputs.embeddingModel.family,
        manifestSha256,
        sourceCheckpointId: inputs.embeddingModel.source.sourceCheckpointId,
        sourceRevision: inputs.embeddingModel.source.revision,
        embeddingMode: inputs.embeddingModel.indexEmbeddingMode,
      },
      descriptorPolicy: DESCRIPTOR_POLICY,
      descriptorPolicySha256: sha256Hex(Buffer.from(stableStringify(DESCRIPTOR_POLICY), 'utf8')),
      identities: inputs.identities,
      documents,
      embeddingsPackedBase64: packedBytes.toString('base64'),
      embeddingsSha256: sha256Hex(packedBytes),
      reproduction: {
        command: 'node tools/autonomy/compile-place-embeddings.mjs',
        runtime: 'pinned_doppler_node_webgpu',
      },
      claimBoundary: 'This index embeds uniformly generated descriptors from pinned governed world artifacts. It contains no diagnostic probe text and does not establish resolver quality or promotion eligibility.',
    };
    index.indexSha256 = indexHash(index);
    return index;
  } finally {
    await model.unload().catch(() => {});
  }
}

function validateIndex(index, inputs, expectedDocuments) {
  if (index.schema !== 'simulatte.autonomyPlaceEmbeddingIndex.v1') throw new Error(`unexpected index schema ${index.schema}`);
  if (index.id !== INDEX_ID || index.contentVersion !== CONTENT_VERSION) throw new Error(`unexpected index identity ${index.id} ${index.contentVersion}`);
  if (index.model?.id !== inputs.embeddingModel.id) throw new Error(`index model expected ${inputs.embeddingModel.id}, received ${index.model?.id}`);
  if (index.model?.manifestSha256 !== inputs.embeddingModel.manifestHash.hex) throw new Error('index model manifest hash differs from lock');
  if (index.embeddingDim !== inputs.embeddingModel.dimensions) throw new Error(`index dimensions expected ${inputs.embeddingModel.dimensions}, received ${index.embeddingDim}`);
  if (index.documentCount !== expectedDocuments.length) throw new Error(`index expected ${expectedDocuments.length} documents, received ${index.documentCount}`);
  if (stableStringify(index.documents) !== stableStringify(expectedDocuments)) throw new Error('index documents differ from governed descriptor inputs');
  for (const [key, expected] of Object.entries(inputs.identities)) {
    if (stableStringify(index.identities?.[key]) !== stableStringify(expected)) throw new Error(`index identity ${key} differs from source`);
  }
  if (index.descriptorPolicySha256 !== sha256Hex(Buffer.from(stableStringify(DESCRIPTOR_POLICY), 'utf8'))) throw new Error('descriptor policy hash mismatch');
  const packedBytes = Buffer.from(String(index.embeddingsPackedBase64 || ''), 'base64');
  if (packedBytes.length !== index.documentCount * index.embeddingDim * 4) throw new Error('packed embedding byte length mismatch');
  if (index.embeddingsSha256 !== sha256Hex(packedBytes)) throw new Error('packed embedding hash mismatch');
  const vectors = decodeFloat32LittleEndian(packedBytes, index.embeddingDim);
  vectors.forEach((vector, vectorIndex) => {
    if (!vector.every(Number.isFinite)) throw new Error(`non-finite embedding in document ${vectorIndex}`);
    const norm = Math.hypot(...vector);
    if (Math.abs(norm - 1) > 1e-5) throw new Error(`embedding ${vectorIndex} expected unit norm, received ${norm}`);
  });
  if (index.indexSha256 !== indexHash(index)) throw new Error('index content hash mismatch');
  return index;
}

async function loadModelManifest(modelDirectory, modelBaseUrl) {
  if (modelDirectory) {
    const manifestText = await fs.readFile(path.join(modelDirectory, 'manifest.json'), 'utf8');
    return { manifestText, manifest: JSON.parse(manifestText) };
  }
  const response = await fetch(`${modelBaseUrl}/manifest.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`embedding manifest request failed with HTTP ${response.status}`);
  const manifestText = await response.text();
  return { manifestText, manifest: JSON.parse(manifestText) };
}

function normalizeVector(value, label) {
  if (!(value instanceof Float32Array)) throw new Error(`${label} embedding expected Float32Array`);
  const norm = Math.hypot(...value);
  if (!Number.isFinite(norm) || norm <= 0) throw new Error(`${label} embedding has invalid norm ${norm}`);
  return Float32Array.from(value, (row) => row / norm);
}

function encodeFloat32LittleEndian(vectors, dimensions) {
  const bytes = Buffer.alloc(vectors.length * dimensions * 4);
  vectors.forEach((vector, vectorIndex) => {
    vector.forEach((value, dimension) => bytes.writeFloatLE(value, (vectorIndex * dimensions + dimension) * 4));
  });
  return bytes;
}

function decodeFloat32LittleEndian(bytes, dimensions) {
  const vectorCount = bytes.length / (dimensions * 4);
  return Array.from({ length: vectorCount }, (_, vectorIndex) => Float32Array.from(
    { length: dimensions },
    (_, dimension) => bytes.readFloatLE((vectorIndex * dimensions + dimension) * 4)
  ));
}

function distanceToPolyline(point, points) {
  if (!points.length) return Infinity;
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y);
  let minimum = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    minimum = Math.min(minimum, pointSegmentDistance(point, points[index - 1], points[index]));
  }
  return minimum;
}

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const denominator = dx * dx + dy * dy;
  if (!denominator) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator));
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}

function identity(filePath, id, bytes) {
  return { path: filePath, id, sha256: sha256Hex(bytes) };
}

function indexHash(index) {
  const content = { ...index };
  delete content.indexSha256;
  return sha256Hex(Buffer.from(stableStringify(content), 'utf8'));
}

function stableStringify(value) {
  return JSON.stringify(sortValue(value), null, 2);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function sha256Hex(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function resolvePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
}

function humanizeId(value) {
  return String(value || '').replace(/-v\d+$/, '').replace(/-/g, ' ');
}

function round(value) {
  return Number(value.toFixed(3));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
  });
}

export {
  DESCRIPTOR_POLICY,
  buildPlaceDocuments,
  decodeFloat32LittleEndian,
  distanceToPolyline,
  encodeFloat32LittleEndian,
  placeDescriptorText,
  validateIndex,
};
