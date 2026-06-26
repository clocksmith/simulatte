import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { doppler } from '../../doppler/src/index.js';
import { bootstrapNodeWebGPU } from '../../doppler/src/tooling/node-webgpu.js';

const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DEFAULT_MODEL_ID = 'qwen-3-5-0-8b-q4k-ehaf16';
const MODEL_DIR = process.env.SIMULATTE_EMBED_MODEL_DIR
  ? path.resolve(process.env.SIMULATTE_EMBED_MODEL_DIR)
  : path.resolve(ROOT, `../doppler/models/local/${DEFAULT_MODEL_ID}`);
const OUT_PATH = path.join(ROOT, 'public/models/simulatte-embedder/surface-card-index-qwen-v1.json');
const MODEL_ID = process.env.SIMULATTE_EMBED_MODEL_ID || DEFAULT_MODEL_ID;
const INDEX_ID = process.env.SIMULATTE_SURFACE_CARD_INDEX_ID
  || 'simulatte-surface-card-qwen-3-5-0-8b-index-v1';
const CHILD_MODE = process.env.SIMULATTE_SURFACE_CARD_CHILD === '1';
const CHUNK_SIZE = Math.max(1, Number(process.env.SIMULATTE_SURFACE_CARD_CHUNK_SIZE || 240));

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

function configuredModelHash(fallbackHash) {
  const raw = String(process.env.SIMULATTE_EMBED_MODEL_HASH || '').trim().replace(/^sha256:/, '');
  if (!raw) return fallbackHash;
  if (!/^[a-f0-9]{64}$/i.test(raw)) {
    throw new Error('SIMULATTE_EMBED_MODEL_HASH must be a sha256 hex digest');
  }
  return { alg: 'sha256', hex: raw.toLowerCase() };
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
  const graphSynthesis = require('../public/js/simulatte-graph-synthesis.js');
  const cards = graphSynthesis.createSurfaceCardDocuments();
  if (!cards.length) throw new Error('No Simulatte surface cards found');

  const manifestPath = path.join(MODEL_DIR, 'manifest.json');
  const manifestText = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  const manifestHash = { alg: 'sha256', hex: sha256HexText(manifestText) };
  const embedModelHash = configuredModelHash(manifestHash);
  if (manifest.modelId !== MODEL_ID) {
    throw new Error(`Unexpected modelId ${manifest.modelId}; expected ${MODEL_ID}`);
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
  const model = await doppler.load({ manifest, baseUrl: MODEL_DIR }, {
    onProgress: (event) => {
      const phase = String(event?.phase || '');
      if (phase === 'ready' || phase === 'load') {
        console.log(`[model] ${phase} ${event?.percent ?? ''} ${event?.message ?? ''}`.trim());
      }
    },
  });

  try {
    const prompts = chunkDocuments.map((doc) => doc.candidateText);
    console.log(`embedding ${prompts.length} surface cards (${offset}-${offset + prompts.length - 1})`);
    const outputs = await model.embedBatch(prompts, {
      useChatTemplate: false,
      embeddingMode: 'mean',
      __skipStateSnapshot: true,
    });
    if (!Array.isArray(outputs) || outputs.length !== prompts.length) {
      throw new Error(`embedBatch returned ${outputs && outputs.length}; expected ${prompts.length}`);
    }

    let embeddingDim = 0;
    const vectors = outputs.map((output, index) => {
      const vector = finiteFloat32Array(output.embedding, chunkDocuments[index].cardId);
      if (!embeddingDim) embeddingDim = vector.length;
      if (vector.length !== embeddingDim) {
        throw new Error(`Embedding dim changed for ${chunkDocuments[index].cardId}: ${vector.length} !== ${embeddingDim}`);
      }
      return vector;
    });
    const expectedDim = expectedEmbeddingDim(manifest);
    if (expectedDim && embeddingDim !== expectedDim) {
      throw new Error(`Expected ${expectedDim}-d ${manifest.modelId} vectors, got ${embeddingDim}`);
    }

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
