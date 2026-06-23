import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { doppler } from '../../doppler/src/index.js';
import { bootstrapNodeWebGPU } from '../../doppler/src/tooling/node-webgpu.js';

const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODEL_DIR = path.resolve(ROOT, '../doppler/models/local/google-embeddinggemma-300m-q4k-ehf16-af32');
const OUT_PATH = path.join(ROOT, 'public/models/simulatte-embedder/primitive-index-v2.json');
const MODEL_ID = 'google-embeddinggemma-300m-q4k-ehf16-af32';

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

function primitiveEmbeddingText(primitive) {
  const params = primitive.params && typeof primitive.params === 'object'
    ? Object.keys(primitive.params).sort().join(' ')
    : '';
  const controls = Array.isArray(primitive.controls) ? primitive.controls.join(' ') : '';
  return [
    `simulatte physical primitive ${primitive.id}`,
    `type ${primitive.type || ''}`,
    `layer ${primitive.layer || ''}`,
    `role ${primitive.role || ''}`,
    `domains ${(primitive.domains || []).join(' ')}`,
    `material ${primitive.material || ''}`,
    `visual regime ${primitive.visualRegime || ''}`,
    `assembly ${primitive.assembly || ''}`,
    `parameters ${params}`,
    `controls ${controls}`,
    `description ${primitive.text || ''}`,
    `recipe ${(primitive.recipe || []).join(' ')}`,
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

async function main() {
  const catalog = require('../public/js/simulatte-physics-catalog.js');
  const primitives = catalog.PHYSICAL_PRIMITIVES || [];
  if (!primitives.length) throw new Error('No Simulatte primitives found');

  const manifestPath = path.join(MODEL_DIR, 'manifest.json');
  const manifestText = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  const manifestHash = { alg: 'sha256', hex: sha256HexText(manifestText) };
  if (manifest.modelId !== MODEL_ID) {
    throw new Error(`Unexpected modelId ${manifest.modelId}; expected ${MODEL_ID}`);
  }

  const gpu = await bootstrapNodeWebGPU();
  if (!gpu.ok) {
    throw new Error(`Node WebGPU bootstrap failed for primitive index build: ${gpu.detail || gpu.provider || 'unavailable'}`);
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
    const createdAt = new Date().toISOString();
    const documents = primitives.map((primitive, order) => {
      const candidateText = primitiveEmbeddingText(primitive);
      return {
        primitiveId: primitive.id,
        order,
        type: primitive.type || '',
        layer: primitive.layer || '',
        domains: primitive.domains || [],
        textHash: { alg: 'sha256', hex: sha256HexText(candidateText) },
        candidateText,
      };
    });
    const prompts = documents.map((doc) => doc.candidateText);
    console.log(`embedding ${prompts.length} primitives`);
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
      const vector = finiteFloat32Array(output.embedding, documents[index].primitiveId);
      if (!embeddingDim) embeddingDim = vector.length;
      if (vector.length !== embeddingDim) {
        throw new Error(`Embedding dim changed for ${documents[index].primitiveId}: ${vector.length} !== ${embeddingDim}`);
      }
      return vector;
    });
    if (embeddingDim !== 768) {
      throw new Error(`Expected 768-d EmbeddingGemma vectors, got ${embeddingDim}`);
    }

    const packed = new Float32Array(vectors.length * embeddingDim);
    vectors.forEach((vector, index) => packed.set(vector, index * embeddingDim));
    const packedBytes = Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength);

    const index = {
      schema: 'simulatte.primitiveEmbeddingIndex.v2',
      id: 'simulatte-primitive-embeddinggemma-index-v1',
      createdAt,
      documentCount: documents.length,
      embeddingDim,
      embedModelId: manifest.modelId,
      embedModelHash: manifest.modelHash && typeof manifest.modelHash === 'object'
        ? manifest.modelHash
        : manifestHash,
      embedModelManifestHash: manifestHash,
      documents,
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
    await model.unload().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
