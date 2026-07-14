const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const lab = require('../public/blank/app/simulation/simulation-lab.js');
const intentEmbedder = require('../public/blank/pipeline/phase-03-retrieval/simulatte-intent-embedder.js');
const semanticRagApi = require('../public/blank/pipeline/phase-03-retrieval/simulatte-semantic-rag.js');
const graphSynthesis = require('../public/blank/pipeline/phase-04-grounded-intent/simulatte-graph-synthesis.js');
const dopplerIntent = require('../public/blank/pipeline/phase-01-runtime/simulatte-doppler-intent.js');
const intentForensics = require('../public/blank/pipeline/phase-04-grounded-intent/simulatte-intent-forensics.js');
const root = path.resolve(__dirname, '..');
let embeddingFixture = null;

function loadEmbeddingIndex() {
  if (!embeddingFixture) {
    const manifestText = fs.readFileSync(path.join(root, 'public/data/simulatte-embedder/manifest.json'), 'utf8');
    const modelRuntimeLockText = fs.readFileSync(path.join(root, 'public/data/simulatte-embedder/model-runtime-lock.json'), 'utf8');
    const indexText = fs.readFileSync(path.join(root, 'public/data/simulatte-embedder/primitive-index-v2.json'), 'utf8');
    const surfaceIndexText = fs.readFileSync(path.join(root, 'public/data/simulatte-embedder/surface-card-index-qwen-v1.json'), 'utf8');
    const universeRoot = path.join(root, 'public/data/simulatte-universe');
    const universeManifest = JSON.parse(fs.readFileSync(path.join(universeRoot, 'manifest.json'), 'utf8'));
    embeddingFixture = {
      manifestText,
      modelRuntimeLockText,
      indexText,
      surfaceIndexText,
      index: JSON.parse(indexText),
      surfaceIndex: JSON.parse(surfaceIndexText),
      universeManifest,
      universeIndexes: Object.fromEntries(Object.entries(universeManifest.indexes).map(([name, config]) => [
        name,
        JSON.parse(fs.readFileSync(path.join(universeRoot, config.artifact.replace(/^\.\//, '')), 'utf8')),
      ])),
    };
  }
  return {
    ...embeddingFixture,
    // Tests intentionally alter manifest requirements. Keep that mutable request
    // contract isolated without reparsing the large immutable retrieval indexes.
    manifest: JSON.parse(embeddingFixture.manifestText),
    modelRuntimeLock: JSON.parse(embeddingFixture.modelRuntimeLockText),
  };
}

function indexedVector(index, primitiveId) {
  const order = index.documents.findIndex((doc) => doc.primitiveId === primitiveId);
  assert.notEqual(order, -1, `missing indexed primitive ${primitiveId}`);
  return indexedVectorByOrder(index, order);
}

function indexedVectorByOrder(index, order) {
  const packed = Buffer.from(index.embeddingsPackedBase64, 'base64');
  const values = new Float32Array(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength));
  const start = order * index.embeddingDim;
  return values.slice(start, start + index.embeddingDim);
}

function indexedCardVector(index, cardId) {
  const order = index.documents.findIndex((doc) => doc.cardId === cardId);
  assert.notEqual(order, -1, `missing indexed surface card ${cardId}`);
  const packed = Buffer.from(index.embeddingsPackedBase64, 'base64');
  const values = new Float32Array(packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength));
  const start = order * index.embeddingDim;
  return values.slice(start, start + index.embeddingDim);
}

function packedVectorsBase64(rows) {
  const values = new Float32Array(rows.flat());
  return Buffer.from(values.buffer, values.byteOffset, values.byteLength).toString('base64');
}

function probeAwareVector(index, text, targetVector) {
  const value = String(text || '').toLowerCase();
  if (!/prompt runtime probe/.test(value)) return targetVector;
  if (index.embeddingDim === 2) {
    if (/river|water|swimming|biological/.test(value)) return Float32Array.from([0, 1]);
    if (/queue|network|detector|readout/.test(value)) return Float32Array.from([0.6, 0.8]);
    return targetVector;
  }
  const ids = /river|water|swimming|biological/.test(value)
    ? ['river-erosion', 'water', 'fluid-advection']
    : /queue|network|detector|readout/.test(value)
      ? ['power-grid', 'traffic-system', 'sensor-array']
      : ['optics-bench', 'prism', 'lens'];
  for (const primitiveId of ids) {
    const order = index.documents.findIndex((doc) => doc.primitiveId === primitiveId);
    if (order >= 0) return indexedVectorByOrder(index, order);
  }
  return targetVector;
}

function probeAwareEmbedProvider({ index, targetVector, embedModelId, embedModelHash, onEmbed }) {
  return {
    async embed(args = {}) {
      if (typeof onEmbed === 'function') onEmbed(args);
      return {
        embedding: probeAwareVector(index, args.text, targetVector),
        embedModelId: embedModelId || index.embedModelId,
        embedModelHash: embedModelHash || index.embedModelHash,
      };
    },
  };
}

function testRerankProvider() {
  return {
    rerank(input = {}) {
      const candidates = input.candidates || [];
      const count = Math.max(1, candidates.length);
      return candidates.map((candidate, index) => ({
        primitiveId: candidate.primitiveId,
        score: Number((1 - index / count).toFixed(6)),
        rank: index,
      }));
    },
  };
}

function testDopplerStorageModule() {
  const calls = [];
  return {
    calls,
    async ensureModelCachedSource(modelId, modelBaseUrl, onProgress, options = {}) {
      calls.push({ modelId, modelBaseUrl, expectedManifestHash: options.expectedManifestHash });
      const manifestHash = typeof options.expectedManifestHash === 'string'
        ? options.expectedManifestHash
        : options.expectedManifestHash && options.expectedManifestHash.hex || '';
      const totalBytes = 1024;
      onProgress?.({
        stage: 'cache-hit',
        modelId,
        percent: 100,
        downloadedBytes: totalBytes,
        totalBytes,
      });
      return {
        cached: true,
        fromCache: true,
        cacheState: 'verified-hit',
        modelId,
        manifest: { modelId },
        manifestText: JSON.stringify({ modelId }),
        manifestHash,
        storageBackend: 'opfs',
        storageContext: { async close() {} },
        totalBytes,
      };
    },
  };
}

function testDopplerDeviceModule() {
  return {
    async initDevice() {
      return { label: 'shared-test-device' };
    },
  };
}

function manifestFacade(rawManifest, modelRuntimeLock) {
  const facade = {
    ...rawManifest,
    runtime: {
      ...(modelRuntimeLock.runtime || {}),
      runtimeConfig: modelRuntimeLock.embedding.runtimeConfig,
    },
    runtimeOrder: modelRuntimeLock.runtimeOrder,
    cache: modelRuntimeLock.cache,
  };
  Object.defineProperties(facade, {
    embedModel: {
      get: () => modelRuntimeLock.embedding,
    },
    reranker: {
      get: () => modelRuntimeLock.reranker,
      set: (value) => {
        modelRuntimeLock.reranker = value;
      },
    },
  });
  return facade;
}

async function withIntentArtifactFetch(run, options = {}) {
  const previousFetch = globalThis.fetch;
  const hadPreviousReranker = Object.hasOwn(globalThis, 'SimulatteDopplerReranker');
  const previousReranker = globalThis.SimulatteDopplerReranker;
  const rerankProvider = Object.hasOwn(options, 'rerankProvider') ? options.rerankProvider : testRerankProvider();
  if (rerankProvider == null) {
    delete globalThis.SimulatteDopplerReranker;
  } else {
    globalThis.SimulatteDopplerReranker = rerankProvider;
  }
  const {
    manifest: rawManifest,
    modelRuntimeLock,
    index,
    indexText,
    surfaceIndex,
    surfaceIndexText,
    universeManifest,
    universeIndexes,
  } = loadEmbeddingIndex();
  const manifest = manifestFacade(rawManifest, modelRuntimeLock);
  const serializedModelRuntimeLock = () => {
    const text = JSON.stringify(modelRuntimeLock);
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    rawManifest.modelRuntimeLock.artifactHash.hex = hash;
    universeManifest.modelRuntimeLock.artifactHash.hex = hash;
    return text;
  };
  globalThis.fetch = async (url) => {
    const value = String(url || '');
    if (value.includes('/simulatte-universe/manifest.json')) {
      return new Response(JSON.stringify(universeManifest), { status: 200 });
    }
    for (const [name, universeIndex] of Object.entries(universeIndexes)) {
      const artifact = universeManifest.indexes[name].artifact.replace(/^\.\//, '');
      if (value.endsWith(artifact)) {
        return new Response(JSON.stringify(universeIndex), { status: 200 });
      }
    }
    if (value.endsWith('/simulatte-embedder/manifest.json')) {
      serializedModelRuntimeLock();
      return new Response(JSON.stringify(rawManifest), { status: 200 });
    }
    if (value.endsWith('model-runtime-lock.json')) {
      return new Response(JSON.stringify(modelRuntimeLock), { status: 200 });
    }
    if (value.endsWith('primitive-index-v2.json')) {
      return new Response(indexText, { status: 200 });
    }
    if (value.endsWith('surface-card-index-qwen-v1.json')) {
      return new Response(surfaceIndexText, { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };
  try {
    return await run({
      manifest,
      rawManifest,
      modelRuntimeLock,
      index,
      surfaceIndex,
      universeManifest,
      universeIndexes,
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (hadPreviousReranker) {
      globalThis.SimulatteDopplerReranker = previousReranker;
    } else {
      delete globalThis.SimulatteDopplerReranker;
    }
  }
}

function createPrototypeSpec(prompt, overrides = {}) {
  return lab.createSpecFromPrompt(prompt, {
    ...overrides,
    allowPrototypeFallback: true,
  });
}

function assertVisualIRCase(prompt, expected) {
  const spec = createPrototypeSpec(prompt);
  const program = spec.renderProgram;
  const plan = program.rendererPlan;
  const ir = program.visualIR;

  assert.equal(ir.schema, 'simulatte.visualIR.v1');
  assert.equal(ir.sceneKind, expected.sceneKind);
  assert.equal(plan.sceneKind, expected.sceneKind);
  assert.equal(plan.visualRecipe.sceneKind, expected.sceneKind);
  assert.equal(plan.visualRecipe.source, 'handwritten-semantic-render-taxonomy.v1');
  assert.equal(ir.painterKind, expected.painterKind);
  assert.equal(ir.camera.mode, expected.camera);
  assert.equal(ir.camera.depth, 'layered');
  assert.notEqual(ir.sceneKind, 'generic');
  assert.notEqual(ir.sceneKind, 'literal-composite');
  assert.ok(ir.entities.length >= 1);
  assert.equal(new Set(ir.entities.map((entity) => entity.id)).size, ir.entities.length);
  assert.ok(ir.entities.every((entity) => entity.status === 'accepted'));
  assert.ok(ir.entities.every((entity) => entity.supportOnly !== true));
  assert.ok(ir.entities.every((entity) => entity.evidence.length >= 1));
  const packetEntities = program.sceneRenderPacket.entities || [];
  assert.equal(new Set(packetEntities.map((entity) => entity.id)).size, packetEntities.length);
  assert.ok(packetEntities.some((entity) => entity.geometry.coverage.realized));
  assert.ok(packetEntities.filter((entity) => entity.identity.directlyGrounded)
    .every((entity) => entity.geometry.coverage.realized));
  assert.ok(ir.materials.length >= 2);
  assert.ok(ir.fields.length >= 1);
  assert.ok(ir.processes.length >= 1);
  assert.ok(ir.receipts.length >= 5);
  assert.equal(ir.graphicsAtoms.schema, 'simulatte.graphicsAtomPlan.v1');
  assert.equal(ir.graphicsAtoms.compiler, 'simulatte.visualOperatorCompiler.v1');
  assert.equal(ir.graphicsAtoms.atlasId, 'simulatte-visual-operator-atlas-v1');
  assert.ok(ir.graphicsAtoms.mappings.length >= 1);
  assert.equal(ir.graphicsAtoms.uniforms.schema, 'simulatte.graphicsAtomUniforms.v1');
  assert.equal(ir.graphicsAtoms.uniforms.values.length, 24);
  assert.ok(ir.graphicsAtoms.wgslOperators.length >= 1);
  assert.ok(ir.graphicsAtoms.geometry.length >= 1);
  assert.ok(ir.graphicsAtoms.fields.length >= 1);
  assert.ok(ir.graphicsAtoms.materials.length >= 1);
  assert.ok(ir.graphicsAtoms.processes.length >= 1);
  assert.ok(ir.graphicsAtoms.motion.length >= 1);
  assert.ok(ir.graphicsAtoms.camera.length >= 1);
  assert.ok(ir.operators.some((operator) => operator.id === 'visual-operator-atlas'));
  assert.ok(ir.receipts.some((receipt) => receipt.id === 'receipt:graphics-atoms'));
  assert.ok(ir.entities.some((entity) => entity.evidence.length));
  for (const id of ['material-shaders', 'geometry-instances', 'field-overlays', 'process-motion', 'receipt-marks']) {
    assert.ok(ir.operators.some((operator) => operator.id === id), `${prompt} missing ${id}`);
  }
  assert.equal(program.provenance.visualIdentity.sceneKind, expected.sceneKind);
  assert.equal(spec.physicalSpec.receipt.visualIdentity.sceneKind, expected.sceneKind);
}


module.exports = {
  assert,
  crypto,
  fs,
  path,
  test,
  pathToFileURL,
  lab,
  intentEmbedder,
  semanticRagApi,
  graphSynthesis,
  dopplerIntent,
  intentForensics,
  root,
  loadEmbeddingIndex,
  indexedVector,
  indexedVectorByOrder,
  indexedCardVector,
  packedVectorsBase64,
  probeAwareVector,
  probeAwareEmbedProvider,
  testRerankProvider,
  testDopplerDeviceModule,
  testDopplerStorageModule,
  manifestFacade,
  withIntentArtifactFetch,
  createPrototypeSpec,
  assertVisualIRCase,
};
