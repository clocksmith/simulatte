import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { doppler } from '../../doppler/src/index.js';
import { bootstrapNodeWebGPU } from '../../doppler/src/tooling/node-webgpu.js';
import { lockedEmbeddingModel } from './model-runtime-lock-utils.mjs';

const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const EMBEDDING_MODEL = lockedEmbeddingModel();
const MODEL_ID = EMBEDDING_MODEL.id;
const MODEL_DIR = process.env.SIMULATTE_EMBED_MODEL_DIR
  ? path.resolve(process.env.SIMULATTE_EMBED_MODEL_DIR)
  : '';
const MODEL_BASE_URL = MODEL_DIR ? '' : EMBEDDING_MODEL.defaultModelBaseUrl.replace(/\/+$/, '');
const OUT_PATH = process.env.SIMULATTE_SURFACE_CARD_INDEX_OUT
  ? path.resolve(process.env.SIMULATTE_SURFACE_CARD_INDEX_OUT)
  : path.join(ROOT, 'public/data/simulatte-embedder/surface-card-index-qwen-v1.json');
const INDEX_ID = process.env.SIMULATTE_SURFACE_CARD_INDEX_ID
  || 'simulatte-surface-card-qwen-3-embedding-0-6b-index-v1';
const CHILD_MODE = process.env.SIMULATTE_SURFACE_CARD_CHILD === '1';
const EMBEDDING_MODE = EMBEDDING_MODEL.indexEmbeddingMode;
const CHUNK_SIZE = Math.max(1, Number(process.env.SIMULATTE_SURFACE_CARD_CHUNK_SIZE || 240));
const EMBED_BATCH_SIZE = Math.max(
  1,
  Math.min(128, Number.parseInt(process.env.SIMULATTE_SURFACE_CARD_EMBED_BATCH_SIZE || '24', 10) || 24)
);

function stableStringify(value) {
  return JSON.stringify(sortStable(value), null, 2);
}

function sortStable(value) {
  if (Array.isArray(value)) return value.map(sortStable);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = sortStable(value[key]);
    return out;
  }, {});
}

function sha256HexBytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256HexText(text) {
  return sha256HexBytes(Buffer.from(String(text), 'utf8'));
}

function indexHash(index) {
  const stable = { ...index };
  delete stable.indexHash;
  return { alg: 'sha256', hex: sha256HexText(stableStringify(stable)) };
}

function surfaceCardEmbeddingText(doc) {
  const grounding = doc.grounding || {};
  return [
    `simulatte surface card ${doc.cardId}`,
    `type ${doc.type || ''}`,
    `labels ${(doc.labels || []).join(' ')}`,
    `classes ${(grounding.classes || []).join(' ')}`,
    `parts ${(grounding.parts || []).join(' ')}`,
    `shapes ${(grounding.shapes || []).join(' ')}`,
    `materials ${(grounding.materials || []).join(' ')}`,
    `behaviors ${(grounding.behaviors || []).join(' ')}`,
    `constraints ${(grounding.constraints || []).join(' ')}`,
    `ports ${(grounding.ports || []).join(' ')}`,
    `primitives ${(grounding.primitiveIds || []).join(' ')}`,
    `description ${doc.text || ''}`,
  ].join('\n').replace(/[ \t]+/g, ' ').trim();
}

async function loadModelManifest() {
  if (MODEL_BASE_URL) {
    const response = await fetch(`${MODEL_BASE_URL}/manifest.json`);
    if (!response.ok) throw new Error(`Failed to fetch model manifest: ${response.status}`);
    const manifestText = await response.text();
    return { manifestText, manifest: JSON.parse(manifestText) };
  }
  const manifestPath = path.join(MODEL_DIR, 'manifest.json');
  const manifestText = await fs.readFile(manifestPath, 'utf8');
  return { manifestText, manifest: JSON.parse(manifestText) };
}

function dopplerLoadSource(manifest) {
  if (MODEL_BASE_URL) return { url: MODEL_BASE_URL };
  return { manifest, baseUrl: MODEL_DIR };
}

function finiteFloat32Array(value, label) {
  const vector = value instanceof Float32Array ? value : null;
  if (!vector) throw new Error(`${label}: expected Float32Array`);
  for (let i = 0; i < vector.length; i += 1) {
    if (!Number.isFinite(vector[i])) {
      throw new Error(`${label}: non-finite value at dim ${i}`);
    }
  }
  return vector;
}

function expectedEmbeddingDim(manifest) {
  return Number(
    manifest?.inference?.output?.embeddingPostprocessor?.outputSize
    || manifest?.architecture?.hiddenSize
    || 0
  );
}

async function loadInputs() {
  const graphSynthesis = require('../public/pipeline/phase-04-grounded-intent/simulatte-graph-synthesis.js');
  const cards = graphSynthesis.createSurfaceCardDocuments();
  if (!cards.length) throw new Error('No Simulatte surface cards found');

  const { manifestText, manifest } = await loadModelManifest();
  const manifestHash = { alg: 'sha256', hex: sha256HexText(manifestText) };
  const embedModelHash = EMBEDDING_MODEL.manifestHash;
  if (manifest.modelId !== MODEL_ID) {
    throw new Error(`Unexpected modelId ${manifest.modelId}; expected ${MODEL_ID}`);
  }
  if (manifestHash.hex !== embedModelHash.hex) {
    throw new Error(`Unexpected ${MODEL_ID} manifest hash; expected ${embedModelHash.hex}`);
  }

  const documents = cards.map((doc, order) => {
    const candidateText = surfaceCardEmbeddingText(doc);
    return {
      cardId: doc.cardId,
      order,
      type: doc.type || '',
      labels: doc.labels || [],
      textHash: { alg: 'sha256', hex: sha256HexText(candidateText) },
      candidateText,
    };
  });

  return {
    graphSynthesis,
    manifest,
    manifestHash,
    embedModelHash,
    documents,
  };
}

async function main() {
  const inputs = await loadInputs();
  if (CHILD_MODE) {
    await writeChildChunk(inputs);
    process.exit(0);
    return;
  }

  await buildWithChildChunks(inputs);
}

async function writeChildChunk({ manifest, documents }) {
  const offset = Number(process.env.SIMULATTE_SURFACE_CARD_OFFSET || 0);
  const limit = Number(process.env.SIMULATTE_SURFACE_CARD_LIMIT || CHUNK_SIZE);
  const outPath = process.env.SIMULATTE_SURFACE_CARD_CHUNK_OUT;
  if (!outPath) throw new Error('SIMULATTE_SURFACE_CARD_CHUNK_OUT is required in child mode');
  const chunkDocuments = documents.slice(offset, offset + limit);
  if (!chunkDocuments.length) throw new Error(`No surface cards in chunk offset=${offset} limit=${limit}`);

  const gpu = await bootstrapNodeWebGPU();
  if (!gpu.ok) {
    throw new Error(`Node WebGPU bootstrap failed for surface-card index build: ${gpu.detail || gpu.provider || 'unavailable'}`);
  }

  console.log(`loading ${manifest.modelId}`);
  const model = await doppler.load(dopplerLoadSource(manifest), {
    onProgress: (event) => {
      const phase = String(event?.phase || '');
      if (phase === 'ready' || phase === 'load') {
        console.log(`[model] ${phase} ${event?.percent ?? ''} ${event?.message ?? ''}`.trim());
      }
    },
  });

  try {
    const { embeddingDim, vectors } = await embedDocumentsWithModel(
      model,
      manifest,
      chunkDocuments,
      `surface cards (${offset}-${offset + chunkDocuments.length - 1})`
    );

    const packed = new Float32Array(vectors.length * embeddingDim);
    vectors.forEach((vector, index) => packed.set(vector, index * embeddingDim));
    const packedBytes = Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength);
    await fs.writeFile(outPath, `${stableStringify({
      offset,
      documentCount: chunkDocuments.length,
      embeddingDim,
      documents: chunkDocuments,
      embeddingsPackedBase64: packedBytes.toString('base64'),
    })}\n`);
    console.log(`wrote ${outPath}`);
  } finally {
    await model.unload().catch(() => {});
  }
}

async function embedDocumentsWithModel(model, manifest, documents, label) {
  const prompts = documents.map((doc) => doc.candidateText);
  let embeddingDim = 0;
  const vectors = [];
  console.log(`embedding ${prompts.length} ${label} in batches of ${EMBED_BATCH_SIZE}`);
  for (let start = 0; start < prompts.length; start += EMBED_BATCH_SIZE) {
    const end = Math.min(start + EMBED_BATCH_SIZE, prompts.length);
    console.log(`embedding ${label} ${start + 1}-${end} of ${prompts.length}`);
    const outputs = await model.embedBatch(prompts.slice(start, end), {
      useChatTemplate: false,
      embeddingMode: EMBEDDING_MODE,
      __skipStateSnapshot: true,
    });
    if (!Array.isArray(outputs) || outputs.length !== end - start) {
      throw new Error(`embedBatch returned ${outputs && outputs.length}; expected ${end - start}`);
    }
    outputs.forEach((output, offset) => {
      const index = start + offset;
      const vector = finiteFloat32Array(output.embedding, documents[index].cardId);
      if (!embeddingDim) embeddingDim = vector.length;
      if (vector.length !== embeddingDim) {
        throw new Error(`Embedding dim changed for ${documents[index].cardId}: ${vector.length} !== ${embeddingDim}`);
      }
      vectors[index] = vector;
    });
  }
  const expectedDim = expectedEmbeddingDim(manifest);
  if (expectedDim && embeddingDim !== expectedDim) {
    throw new Error(`Expected ${expectedDim}-d ${manifest.modelId} vectors, got ${embeddingDim}`);
  }
  return { embeddingDim, vectors };
}

async function buildWithChildChunks({ graphSynthesis, documents, embedModelHash }) {
  const createdAt = new Date().toISOString();
  const chunkDir = await fs.mkdtemp(path.join(os.tmpdir(), 'simulatte-surface-cards-'));
  const chunks = [];
  try {
    for (let offset = 0; offset < documents.length; offset += CHUNK_SIZE) {
      const limit = Math.min(CHUNK_SIZE, documents.length - offset);
      const chunkPath = path.join(chunkDir, `surface-cards-${offset}.json`);
      await runChildChunk(offset, limit, chunkPath);
      chunks.push(JSON.parse(await fs.readFile(chunkPath, 'utf8')));
    }
    const embeddingDim = chunks[0] ? Number(chunks[0].embeddingDim) : 0;
    if (!embeddingDim) throw new Error('No surface-card chunks were generated');
    const packed = new Float32Array(documents.length * embeddingDim);
    const mergedDocuments = [];
    for (const chunk of chunks) {
      if (Number(chunk.embeddingDim) !== embeddingDim) {
        throw new Error(`Surface-card chunk dim mismatch (${chunk.embeddingDim} !== ${embeddingDim})`);
      }
      const chunkDocuments = chunk.documents || [];
      const vectors = base64ToFloat32(chunk.embeddingsPackedBase64);
      if (vectors.length !== chunkDocuments.length * embeddingDim) {
        throw new Error(`Surface-card chunk byte length mismatch at offset ${chunk.offset}`);
      }
      mergedDocuments.push(...chunkDocuments);
      packed.set(vectors, Number(chunk.offset) * embeddingDim);
    }
    if (mergedDocuments.length !== documents.length) {
      throw new Error(`Surface-card chunk document count mismatch (${mergedDocuments.length} !== ${documents.length})`);
    }
    for (let i = 0; i < mergedDocuments.length; i += 1) {
      if (mergedDocuments[i].order !== i || mergedDocuments[i].cardId !== documents[i].cardId) {
        throw new Error(`Surface-card chunk order mismatch at ${i}`);
      }
    }
    const packedBytes = Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength);

    const index = {
      schema: graphSynthesis.CARD_INDEX_SCHEMA,
      id: INDEX_ID,
      createdAt,
      documentCount: mergedDocuments.length,
      embeddingDim,
      embedModelId: MODEL_ID,
      embedModelHash,
      embedModelManifestHash: embedModelHash,
      documents: mergedDocuments,
      embeddingsPackedBase64: packedBytes.toString('base64'),
    };
    index.indexHash = indexHash(index);

    await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
    await fs.writeFile(OUT_PATH, `${stableStringify(index)}\n`);
    console.log(`wrote ${OUT_PATH}`);
    console.log(JSON.stringify({
      documents: documents.length,
      embeddingDim,
      embedModelId: index.embedModelId,
      embedModelHash: index.embedModelHash,
      indexHash: index.indexHash,
      bytes: Buffer.byteLength(stableStringify(index)),
    }, null, 2));
  } finally {
    await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => {});
  }
}

function base64ToFloat32(base64) {
  const bytes = Buffer.from(String(base64 || ''), 'base64');
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function runChildChunk(offset, limit, chunkPath) {
  return new Promise((resolve, reject) => {
    console.log(`building surface-card chunk offset=${offset} limit=${limit}`);
    const child = spawn(process.execPath, [new URL(import.meta.url).pathname], {
      cwd: ROOT,
      env: {
        ...process.env,
        SIMULATTE_SURFACE_CARD_CHILD: '1',
        SIMULATTE_SURFACE_CARD_OFFSET: String(offset),
        SIMULATTE_SURFACE_CARD_LIMIT: String(limit),
        SIMULATTE_SURFACE_CARD_CHUNK_OUT: chunkPath,
      },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`surface-card chunk offset=${offset} failed with ${signal || code}`));
    });
  });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
