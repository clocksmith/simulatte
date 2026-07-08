const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const lab = require('../public/app/simulation/simulation-lab.js');
const intentEmbedder = require('../public/pipeline/phase-03-retrieval/simulatte-intent-embedder.js');
const semanticRagApi = require('../public/pipeline/phase-03-retrieval/simulatte-semantic-rag.js');
const graphSynthesis = require('../public/pipeline/phase-04-grounded-intent/simulatte-graph-synthesis.js');
const root = path.resolve(__dirname, '..');

function loadEmbeddingIndex() {
  const manifestText = fs.readFileSync(path.join(root, 'public/data/simulatte-embedder/manifest.json'), 'utf8');
  const indexText = fs.readFileSync(path.join(root, 'public/data/simulatte-embedder/primitive-index-v2.json'), 'utf8');
  const surfaceIndexText = fs.readFileSync(path.join(root, 'public/data/simulatte-embedder/surface-card-index-qwen-v1.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  const index = JSON.parse(indexText);
  const surfaceIndex = JSON.parse(surfaceIndexText);
  const universeRoot = path.join(root, 'public/data/simulatte-universe');
  const universeManifest = JSON.parse(fs.readFileSync(path.join(universeRoot, 'manifest.json'), 'utf8'));
  const universeIndexes = Object.fromEntries(Object.entries(universeManifest.indexes).map(([name, config]) => [
    name,
    JSON.parse(fs.readFileSync(path.join(universeRoot, config.artifact.replace(/^\.\//, '')), 'utf8')),
  ]));
  return { manifest, manifestText, index, indexText, surfaceIndex, surfaceIndexText, universeManifest, universeIndexes };
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
  const { manifest, manifestText, index, indexText, surfaceIndex, surfaceIndexText, universeManifest, universeIndexes } = loadEmbeddingIndex();
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
      return new Response(JSON.stringify(manifest), { status: 200 });
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
    return await run({ manifest, index, surfaceIndex, universeManifest, universeIndexes });
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
  assert.ok(ir.entities.length >= 5);
  assert.ok(ir.materials.length >= 2);
  assert.ok(ir.fields.length >= 1);
  assert.ok(ir.processes.length >= 4);
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

test('model-backed intent retrieval cosine-normalizes query and index vectors', async () => {
  const hash = {
    alg: 'sha256',
    hex: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  };
  const manifest = {
    schema: 'simulatte.modelBackedEmbedderManifest.v2',
    id: 'simulatte-synthetic-cosine-retrieval-v1',
    retrieval: {
      kind: 'precomputed-primitive-index',
      artifact: './synthetic-index.json',
      dimensions: 2,
      rerank: 'mandatory',
    },
    embedModel: {
      id: 'synthetic-mean-pooled-transformer',
      family: 'synthetic',
      modelType: 'transformer',
      dimensions: 2,
      defaultModelBaseUrl: 'https://simulatte.test/models/synthetic',
      manifestHash: hash,
    },
    runtime: {
      queryEmbeddingMode: 'mean',
      runtimeConfig: { inference: {} },
    },
    cache: {},
  };
  const index = {
    schema: 'simulatte.primitiveEmbeddingIndex.v2',
    id: 'simulatte-synthetic-cosine-index-v1',
    embedModelId: manifest.embedModel.id,
    embedModelHash: hash,
    embeddingDim: 2,
    documents: [
      { primitiveId: 'aligned' },
      { primitiveId: 'large-norm-off-axis' },
    ],
    embeddingsPackedBase64: packedVectorsBase64([
      [1, 0],
      [8, 6],
    ]),
  };
  const candidates = index.documents.map((doc) => ({
    id: doc.primitiveId,
    layer: 'physics',
    type: 'operator',
    domains: [],
  }));
  const previousFetch = globalThis.fetch;
  const previousRag = globalThis.SimulatteSemanticRag;
  const previousDopplerIntent = globalThis.SimulatteDopplerIntent;
  globalThis.SimulatteSemanticRag = null;
  globalThis.SimulatteDopplerIntent = null;
  globalThis.fetch = async (url) => {
    const value = String(url || '');
    if (value.endsWith('/manifest.json')) return new Response(JSON.stringify(manifest), { status: 200 });
    if (value.endsWith('/synthetic-index.json')) return new Response(JSON.stringify(index), { status: 200 });
    return new Response('not found', { status: 404 });
  };
  try {
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      embedProvider: probeAwareEmbedProvider({
        index,
        targetVector: Float32Array.from([4, 0]),
        embedModelId: manifest.embedModel.id,
        embedModelHash: hash,
      }),
    });
    const result = await embedder.rankPrompt('aligned vector', candidates, { max: 2 });
    const aligned = result.priors.find((prior) => prior.primitiveId === 'aligned');
    const offAxis = result.priors.find((prior) => prior.primitiveId === 'large-norm-off-axis');

    assert.equal(result.priors[0].primitiveId, 'aligned');
    assert.equal(aligned.modelScore, 1);
    assert.equal(offAxis.modelScore, 0.8);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.SimulatteSemanticRag = previousRag;
    globalThis.SimulatteDopplerIntent = previousDopplerIntent;
  }
});

test('model-backed intent embedder ranks primitives with Qwen provenance', async () => {
  await withIntentArtifactFetch(async ({ index }) => {
    const query = indexedVector(index, 'optics-bench');
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      embedProvider: probeAwareEmbedProvider({ index, targetVector: query }),
    });
    const result = await embedder.rankPrompt(
      'lab bench optics bench with sun lamp glass lens mirror prism and sensor',
      lab.PHYSICAL_PRIMITIVES,
      { max: 12 }
    );

    assert.equal(result.model.id, 'qwen-3-embedding-0-6b-q4k-ehf16-af32');
    assert.equal(result.model.dimensions, 1024);
    assert.equal(result.model.indexId, 'simulatte-primitive-qwen-3-embedding-0-6b-index-v1');
    assert.equal(result.model.surfaceCardIndexId, 'simulatte-surface-card-qwen-3-embedding-0-6b-index-v1');
    assert.ok(result.model.surfaceCardDocuments >= 650);
    assert.equal(result.model.universeIndexId, 'simulatte-universe-multi-index-v1');
    assert.ok(result.model.universeDocuments >= 20);
    assert.equal(result.model.reranker, 'simulatte.doppler-intent-reranker.v1');
    assert.equal(result.model.rerankerKind, 'doppler-reranker');
    assert.equal(result.model.rerankerPhase, 3);
    assert.equal(result.model.rerankerRequired, true);
    assert.equal(result.rerank.required, true);
    assert.equal(result.rerank.schema, 'simulatte.intentRerank.v1');
    assert.equal(result.rerank.phase, 3);
    assert.equal(result.rerank.phaseId, 'retrieval');
    assert.equal(result.rerank.rerankerMode, 'doppler-reranker');
    assert.equal(result.rerank.rerankerKind, 'doppler-reranker');
    assert.equal(result.rerank.rerankerPhase, 3);
    assert.equal(result.rerank.modelRequired, true);
    assert.equal(result.rerank.modelReady, true);
    assert.equal(result.rerank.fallbackMode, 'heuristic-fusion');
    assert.ok(result.rerank.scoreFields.includes('modelScore'));
    assert.ok(result.rerank.scoreFields.includes('dopplerScore'));
    assert.equal(result.priors[0].primitiveId, 'optics-bench');
    assert.ok(result.priors.some((prior) => prior.primitiveId === 'prism'));
    assert.ok(Array.isArray(result.cardMatches));
    assert.equal(result.universeMatches.schema, 'simulatte.universeMatches.v1');
    assert.ok(result.universeMatches.candidates.some((candidate) => candidate.indexName === 'concepts'));
  });
});

test('Phase 1 loadModel verifies the embedding provider before runtime ready', async () => {
  await withIntentArtifactFetch(async ({ index }) => {
    const query = indexedVector(index, 'optics-bench');
    const events = [];
    let embedCalls = 0;
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      onProgress: (event) => events.push(event),
      embedProvider: probeAwareEmbedProvider({
        index,
        targetVector: query,
        onEmbed: (args = {}) => {
          embedCalls += 1;
          assert.ok(String(args.text || '').trim(), 'Phase 1 probe should use non-empty text');
        },
      }),
    });

    const runtime = await embedder.loadModel();
    const readyIndex = events.findIndex((event) => event.stage === 'runtime-ready');
    const modelReadyIndex = events.findIndex((event) => event.stage === 'model-ready');
    const probeReadyIndex = events.findIndex((event) => event.stage === 'model-probe' && event.timing === 'end');
    const ready = events[readyIndex];

    assert.equal(embedCalls, 4);
    assert.ok(modelReadyIndex >= 0, 'Phase 1 should load the provider before readiness');
    assert.ok(probeReadyIndex > modelReadyIndex, 'Phase 1 should probe the provider after model-ready');
    assert.ok(readyIndex > probeReadyIndex, 'Phase 1 runtime-ready must follow provider probe');
    assert.equal(ready.providerReady, true);
    assert.equal(ready.noFallback, true);
    assert.equal(ready.promptRuntimeReceipt.schema, 'simulatte.promptRuntimeReceipt.v1');
    assert.equal(ready.promptRuntimeReceipt.providerBackend, 'configured-provider');
    assert.equal(ready.promptRuntimeReceipt.embeddingProbe, true);
    assert.equal(ready.promptRuntimeReceipt.embeddingDim, index.embeddingDim);
    assert.equal(ready.promptRuntimeReceipt.probeCount, 3);
    assert.equal(ready.promptRuntimeReceipt.probeIds.length, 3);
    assert.equal(ready.promptRuntimeReceipt.probeHashes.length, 3);
    assert.ok(ready.promptRuntimeReceipt.stabilitySimilarity >= 0.995);
    assert.ok(ready.promptRuntimeReceipt.maxDistinctProbeSimilarity < 0.9999);
    assert.equal(ready.promptRuntimeReceipt.distinctProbePairs, 3);
    assert.equal(ready.promptRuntimeReceipt.primitiveDocuments, index.documents.length);
    assert.equal(ready.promptRuntimeReceipt.reranker, 'simulatte.doppler-intent-reranker.v1');
    assert.equal(ready.promptRuntimeReceipt.rerankerKind, 'doppler-reranker');
    assert.equal(ready.promptRuntimeReceipt.rerankerPhase, 3);
    assert.equal(ready.promptRuntimeReceipt.rerankerRequired, true);
    assert.equal(ready.promptRuntimeReceipt.rerankerReady, true);
    assert.equal(ready.promptRuntimeReceipt.rerankerStatus, 'ready');
    assert.equal(ready.promptRuntimeReceipt.rerankerFallbackMode, 'heuristic-fusion');
    assert.equal(runtime.promptRuntimeReceipt.providerReady, true);
    assert.equal(runtime.promptRuntimeReceipt.noFallback, true);
  });
});

test('Phase 1 uses direct Doppler embed for single model-backed probes', async () => {
  await withIntentArtifactFetch(async ({ index }) => {
    const query = indexedVector(index, 'optics-bench');
    let batchCalls = 0;
    let embedCalls = 0;
    const handle = {
      modelId: index.embedModelId,
      manifest: { manifestHash: index.embedModelHash },
      async embed(prompt, options = {}) {
        assert.equal(options.embeddingMode, 'mean');
        assert.equal(options.useChatTemplate, false);
        assert.equal(options.__skipStateSnapshot, true);
        embedCalls += 1;
        return {
          embedding: probeAwareVector(index, prompt, query),
        };
      },
      async embedBatch() {
        batchCalls += 1;
        throw new Error('single probe embedding should not use embedBatch');
      },
    };
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      dopplerModelHandle: handle,
    });

    const runtime = await embedder.loadModel();

    assert.equal(batchCalls, 0);
    assert.equal(embedCalls, 4);
    assert.equal(runtime.promptRuntimeReceipt.providerBackend, 'injected-doppler-model');
    assert.equal(runtime.promptRuntimeReceipt.embeddingProbe, true);
    assert.ok(runtime.promptRuntimeReceipt.stabilitySimilarity >= 0.995);
  });
});

test('Phase 1 falls back to Doppler embedBatch when direct embed is unavailable', async () => {
  await withIntentArtifactFetch(async ({ index }) => {
    const query = indexedVector(index, 'optics-bench');
    let batchCalls = 0;
    const handle = {
      modelId: index.embedModelId,
      manifest: { manifestHash: index.embedModelHash },
      async embedBatch(prompts, options = {}) {
        assert.equal(prompts.length, 1);
        assert.equal(options.embeddingMode, 'mean');
        assert.equal(options.useChatTemplate, false);
        assert.equal(options.__skipStateSnapshot, true);
        batchCalls += prompts.length;
        return prompts.map((text) => ({
          embedding: probeAwareVector(index, text, query),
        }));
      },
    };
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      dopplerModelHandle: handle,
    });

    const runtime = await embedder.loadModel();

    assert.equal(batchCalls, 4);
    assert.equal(runtime.promptRuntimeReceipt.providerBackend, 'injected-doppler-model');
    assert.equal(runtime.promptRuntimeReceipt.embeddingProbe, true);
    assert.ok(runtime.promptRuntimeReceipt.stabilitySimilarity >= 0.995);
  });
});

test('Phase 1 loadModel does not report runtime ready when provider verification fails', async () => {
  await withIntentArtifactFetch(async () => {
    const events = [];
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      onProgress: (event) => events.push(event),
      embedProvider: {
        async embed() {
          throw new Error('phase1 probe blocked');
        },
      },
    });

    await assert.rejects(() => embedder.loadModel(), /phase1 probe blocked/);
    assert.ok(events.some((event) => event.stage === 'indexes'), 'Phase 1 should still fetch indexes before provider verification');
    assert.equal(events.some((event) => event.stage === 'runtime-ready'), false);
  });
});

test('Phase 1 loadModel rejects degenerate constant embedding providers', async () => {
  await withIntentArtifactFetch(async ({ index }) => {
    const events = [];
    const query = indexedVector(index, 'optics-bench');
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      onProgress: (event) => events.push(event),
      embedProvider: {
        async embed() {
          return {
            embedding: query,
            embedModelId: index.embedModelId,
            embedModelHash: index.embedModelHash,
          };
        },
      },
    });

    await assert.rejects(() => embedder.loadModel(), /degenerate probe embeddings/);
    assert.equal(events.some((event) => event.stage === 'runtime-ready'), false);
  });
});

test('Phase 1 rejects a manifest that requires an undeclared Doppler reranker model', async () => {
  await withIntentArtifactFetch(async ({ manifest, index }) => {
    manifest.reranker = {
      ...manifest.reranker,
      required: true,
      model: null,
    };
    const events = [];
    const query = indexedVector(index, 'optics-bench');
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      onProgress: (event) => events.push(event),
      embedProvider: probeAwareEmbedProvider({ index, targetVector: query }),
    });

    await assert.rejects(() => embedder.loadModel(), /required intent reranker must declare model\.id/);
    assert.equal(events.some((event) => event.stage === 'runtime-ready'), false);
  }, { rerankProvider: null });
});

test('Phase 1 loads Doppler reranker with f16 KV runtime contract', async () => {
  await withIntentArtifactFetch(async ({ manifest, index }) => {
    manifest.reranker = {
      ...manifest.reranker,
      required: true,
    };
    const query = indexedVector(index, 'optics-bench');
    const loadCalls = [];
    const dopplerModule = {
      async load(model, options = {}) {
        loadCalls.push({
          model,
          runtimeConfig: options.runtimeConfig,
        });
        return {
          modelId: manifest.reranker.model.id,
          manifest: {
            inference: {
              rerank: {
                trueTokenId: 1,
                falseTokenId: 0,
              },
            },
          },
          rerank(input = {}) {
            return {
              rows: (input.candidates || []).map((candidate, order) => ({
                primitiveId: candidate.primitiveId,
                score: Number((1 - order * 0.1).toFixed(6)),
              })),
            };
          },
        };
      },
    };
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      embedProvider: probeAwareEmbedProvider({ index, targetVector: query }),
      dopplerModule,
    });

    const runtime = await embedder.loadModel();

    assert.equal(loadCalls.length, 1);
    assert.deepEqual(Object.keys(loadCalls[0].model), ['url']);
    assert.match(loadCalls[0].model.url, /qwen-3-reranker-0-6b-q4k-ehf16-af32$/);
    assert.equal(loadCalls[0].runtimeConfig.inference.session.compute.defaults.activationDtype, 'f32');
    assert.equal(loadCalls[0].runtimeConfig.inference.session.compute.defaults.mathDtype, 'f32');
    assert.equal(loadCalls[0].runtimeConfig.inference.session.compute.defaults.accumDtype, 'f32');
    assert.equal(loadCalls[0].runtimeConfig.inference.session.compute.defaults.outputDtype, 'f32');
    assert.equal(loadCalls[0].runtimeConfig.inference.session.kvcache.kvDtype, 'f16');
    assert.equal(loadCalls[0].runtimeConfig.inference.session.kvcache.layout, 'contiguous');
    assert.equal(loadCalls[0].runtimeConfig.inference.session.kvcache.tiering.mode, 'off');
    assert.equal(loadCalls[0].runtimeConfig.inference.compute.rangeAwareSelectiveWidening.onTrigger, 'error');
    assert.equal(
      loadCalls[0].runtimeConfig.inference.session.kvcache.kvDtype,
      manifest.runtime.runtimeConfig.inference.session.kvcache.kvDtype
    );
    assert.equal(runtime.promptRuntimeReceipt.rerankerReady, true);
    assert.equal(runtime.promptRuntimeReceipt.rerankerStatus, 'ready');
    assert.equal(runtime.promptRuntimeReceipt.rerankerBackend, 'doppler-reranker-load');
  }, { rerankProvider: null });
});

test('Phase 1 loads Doppler embedding model by URL source only', async () => {
  await withIntentArtifactFetch(async ({ manifest, index }) => {
    const query = indexedVector(index, 'optics-bench');
    const events = [];
    const loadCalls = [];
    const dopplerModule = {
      async load(model, options = {}) {
        loadCalls.push({ model, runtimeConfig: options.runtimeConfig });
        return {
          modelId: manifest.embedModel.id,
          manifest: { manifestHash: manifest.embedModel.manifestHash },
          async embed(prompt) {
            return {
              embedding: probeAwareVector(index, prompt, query),
            };
          },
        };
      },
    };
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      dopplerModule,
      onProgress: (event) => events.push(event),
    });

    const runtime = await embedder.loadModel();

    assert.equal(loadCalls.length, 1);
    assert.deepEqual(Object.keys(loadCalls[0].model), ['url']);
    assert.equal(loadCalls[0].model.url, manifest.embedModel.defaultModelBaseUrl);
    assert.deepEqual(loadCalls[0].runtimeConfig, manifest.runtime.runtimeConfig);
    assert.equal(events.some((event) => event.source === 'simulatte-model-cache'), false);
    assert.equal(runtime.promptRuntimeReceipt.providerReady, true);
    assert.equal(runtime.promptRuntimeReceipt.providerBackend, 'doppler-browser-load');
    assert.equal(runtime.promptRuntimeReceipt.cachePrefetch, false);
    assert.equal(runtime.promptRuntimeReceipt.cacheMode, 'doppler-managed');
    assert.equal(runtime.promptRuntimeReceipt.cacheOwner, 'doppler');
  });
});

test('Phase 1 reacquires Doppler embedding after reranker model takes over GPU resources', async () => {
  await withIntentArtifactFetch(async ({ manifest, index }) => {
    const query = indexedVector(index, 'optics-bench');
    const loadRoles = [];
    let activeRole = '';
    let staleEmbeddingCalls = 0;
    const dopplerModule = {
      async load(model) {
        const url = String(model && model.url || '');
        if (url === manifest.embedModel.defaultModelBaseUrl) {
          activeRole = 'embedding';
          loadRoles.push('embedding');
          return {
            modelId: manifest.embedModel.id,
            manifest: { manifestHash: manifest.embedModel.manifestHash },
            async embed(prompt) {
              if (activeRole !== 'embedding') {
                staleEmbeddingCalls += 1;
                return { embedding: new Float32Array(index.embeddingDim) };
              }
              return { embedding: probeAwareVector(index, prompt, query) };
            },
          };
        }
        if (url === manifest.reranker.model.defaultModelBaseUrl) {
          activeRole = 'reranker';
          loadRoles.push('reranker');
          return {
            modelId: manifest.reranker.model.id,
            manifest: {
              inference: {
                rerank: {
                  trueTokenId: 1,
                  falseTokenId: 0,
                },
              },
            },
            rerank(input = {}) {
              return (input.candidates || []).map((candidate, order) => ({
                primitiveId: candidate.primitiveId,
                score: Number((1 - order * 0.1).toFixed(6)),
              }));
            },
          };
        }
        throw new Error(`unexpected Doppler model URL ${url}`);
      },
    };
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      dopplerModule,
    });

    const runtime = await embedder.loadModel();
    const result = await embedder.rankPrompt(
      'glass lens prism optics bench with a bright beam',
      lab.PHYSICAL_PRIMITIVES,
      { max: 8 }
    );

    assert.equal(runtime.promptRuntimeReceipt.providerReady, true);
    assert.equal(runtime.promptRuntimeReceipt.rerankerReady, true);
    assert.equal(result.model.id, manifest.embedModel.id);
    assert.equal(result.priors[0].primitiveId, 'optics-bench');
    assert.deepEqual(loadRoles.slice(0, 2), ['embedding', 'reranker']);
    assert.ok(loadRoles.indexOf('embedding', 2) >= 2);
    assert.equal(staleEmbeddingCalls, 0);
  }, { rerankProvider: null });
});

test('Doppler execution-v1 keeps Qwen reranker KV dtype aligned when f16 is not proven', async () => {
  const [{ compileExecutionV1 }, { EXECUTION_V1_SCHEMA_ID }] = await Promise.all([
    import(pathToFileURL(path.join(
      root,
      'public/vendor/doppler/src/inference/pipelines/text/execution-v1.js'
    )).href),
    import(pathToFileURL(path.join(
      root,
      'public/vendor/doppler/src/config/schema/index.js'
    )).href),
  ]);
  const conversion = JSON.parse(fs.readFileSync(
    path.join(
      root,
      'public/vendor/doppler/src/config/conversion/qwen3/qwen-3-reranker-0-6b-q4k-ehf16-af32.json'
    ),
    'utf8'
  ));
  const manifestInference = {
    schema: EXECUTION_V1_SCHEMA_ID,
    session: conversion.session,
    execution: conversion.execution,
    attention: conversion.inference.attention,
    layerPattern: conversion.inference.layerPattern,
  };
  const compiled = compileExecutionV1({
    manifestInference,
    modelId: 'qwen-3-reranker-0-6b-q4k-ehf16-af32',
    numLayers: 28,
    headDim: 128,
    useGPU: true,
    kernelPathPolicy: {
      mode: 'capability-aware',
      onIncompatible: 'remap',
      sourceScope: ['manifest'],
    },
  });
  const kernelPath = compiled.runtimeInferencePatch.kernelPath;
  const attentionSteps = [
    ...(kernelPath.decode.steps || []),
    ...(kernelPath.prefill.steps || []),
  ].filter((step) => String(step.kernel || '').startsWith('attention'));

  assert.equal(compiled.session.kvcache.kvDtype, 'f32');
  assert.equal(compiled.runtimeInferencePatch.session.kvcache.kvDtype, 'f32');
  assert.equal(kernelPath.kvDtype, 'f32');
  assert.ok(compiled.appliedTransforms.includes('widenToF32Activations'));
  assert.ok(attentionSteps.length > 0);
  for (const step of attentionSteps) {
    assert.doesNotMatch(step.kernel, /_f16/);
    assert.equal(step.precision.activationDtype, 'f32');
    assert.equal(step.precision.kvDtype, 'f32');
  }
});

test('Phase 3 uses Doppler reranker when the required capability is present', async () => {
  await withIntentArtifactFetch(async ({ manifest, index }) => {
    manifest.reranker = {
      ...manifest.reranker,
      required: true,
    };
    const query = indexedVector(index, 'optics-bench');
    let rerankCalls = 0;
    const provider = probeAwareEmbedProvider({ index, targetVector: query });
    provider.rerank = async (input) => {
      rerankCalls += 1;
      return {
        rows: (input.candidates || []).map((candidate, order) => ({
          primitiveId: candidate.primitiveId,
          score: candidate.primitiveId === 'prism' ? 1 : Math.max(0.05, 0.42 - order * 0.001),
        })),
      };
    };
    const events = [];
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      onProgress: (event) => events.push(event),
      embedProvider: provider,
    });
    const result = await embedder.rankPrompt(
      'lab bench optics bench with sun lamp glass lens mirror prism and sensor',
      lab.PHYSICAL_PRIMITIVES,
      { max: 8 }
    );
    const ready = events.find((event) => event.stage === 'runtime-ready');

    assert.ok(rerankCalls >= 3);
    assert.equal(ready.promptRuntimeReceipt.rerankerRequired, true);
    assert.equal(ready.promptRuntimeReceipt.rerankerReady, true);
    assert.equal(ready.promptRuntimeReceipt.rerankerStatus, 'ready');
    assert.equal(ready.promptRuntimeReceipt.rerankerProbeCount, 1);
    assert.equal(result.rerank.rerankerMode, 'doppler-reranker');
    assert.equal(result.rerank.modelReady, true);
    assert.equal(result.rerank.modelRequired, true);
    assert.equal(result.rerank.modelBackend, 'configured-provider');
    assert.equal(result.priors[0].primitiveId, 'prism');
  });
});

test('Phase 3 model-backed retrieval embeds and reranks typed scene slots', async () => {
  await withIntentArtifactFetch(async ({ manifest, index }) => {
    manifest.reranker = {
      ...manifest.reranker,
      required: true,
    };
    const prompt = 'dogs and cats swimming in a lake';
    const phase1 = lab.runPhase1RuntimeGate(prompt, { allowPrototypeFallback: true });
    const phase2 = lab.runPhase2LanguageGraph(phase1);
    const queryPlan = phase2.artifact.queryPlan;
    const embedTexts = [];
    const rerankInputs = [];
    const query = indexedVector(index, 'water');
    const provider = probeAwareEmbedProvider({
      index,
      targetVector: query,
      onEmbed: (args) => embedTexts.push(String(args.text || '')),
    });
    provider.rerank = async (input = {}) => {
      rerankInputs.push(input);
      return {
        rows: (input.candidates || []).map((candidate, order) => ({
          primitiveId: candidate.primitiveId,
          score: candidate.primitiveId === 'surface-dog-1' || candidate.primitiveId === 'surface-cat-1'
            ? 1
            : Math.max(0.05, 0.56 - order * 0.01),
        })),
      };
    };
    const events = [];
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      onProgress: (event) => events.push(event),
      embedProvider: provider,
    });

    const result = await embedder.rankPrompt(prompt, lab.PHYSICAL_PRIMITIVES, {
      max: 12,
      queryPlan,
    });
    const dogSlot = result.slotRetrieval.bySlot.find((row) => row.slotId === 'slot.actor.dog');
    const catSlot = result.slotRetrieval.bySlot.find((row) => row.slotId === 'slot.actor.cat');

    assert.equal(result.slotRetrieval.schema, 'simulatte.phase3SlotRetrieval.v1');
    assert.equal(result.slotRetrieval.queryPlanSchema, 'simulatte.sceneQueryPlan.v1');
    assert.ok(result.slotRetrieval.embeddedSlotCount >= queryPlan.summary.requiredSlotCount);
    assert.ok(result.slotRetrieval.rerankCallCount >= queryPlan.summary.requiredSlotCount);
    assert.ok(dogSlot.candidates.some((row) => /\bdog\b|surface-dog/.test(row.candidateId)));
    assert.ok(catSlot.candidates.some((row) => /\bcat\b|surface-cat/.test(row.candidateId)));
    assert.ok(rerankInputs.some((input) => input.schema === 'simulatte.intentSlotRerankInput.v1'));
    assert.ok(rerankInputs.some((input) => input.slot && input.slot.slotId === 'slot.actor.dog'));
    assert.ok(embedTexts.some((text) => /\bdog\b/.test(text)));
    assert.ok(embedTexts.every((text) => !/\b(?:actor|slot|required)\b/.test(text)));
    assert.ok(events.some((event) => event.stage === 'slot-retrieval'));
    assert.ok(events.some((event) => event.stage === 'slot-rank'));
    assert.ok(result.evidenceRows.some((row) => (
      row.retrievalKind === 'slot-retrieval' &&
      row.slotId === 'slot.actor.dog'
    )));
  });
});

test('Doppler model handles normalize URL provenance to the manifest model id', async () => {
  await withIntentArtifactFetch(async ({ manifest, index }) => {
    const query = indexedVector(index, 'optics-bench');
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      dopplerModelHandle: {
        modelId: manifest.embedModel.defaultModelBaseUrl,
        manifest: {
          manifestHash: manifest.embedModel.manifestHash,
        },
        async embed(prompt) {
          return { embedding: probeAwareVector(index, prompt, query) };
        },
      },
    });
    const result = await embedder.rankPrompt(
      'glass lens prism optics bench with a bright beam',
      lab.PHYSICAL_PRIMITIVES,
      { max: 8 }
    );

    assert.equal(result.model.id, 'qwen-3-embedding-0-6b-q4k-ehf16-af32');
    assert.equal(result.backend, 'injected-doppler-model');
    assert.equal(result.priors[0].primitiveId, 'optics-bench');
  });
});

test('embed providers normalize default model URL provenance to the manifest model id', async () => {
  await withIntentArtifactFetch(async ({ manifest, index }) => {
    const query = indexedVector(index, 'optics-bench');
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      embedProvider: probeAwareEmbedProvider({
        index,
        targetVector: query,
        embedModelId: manifest.embedModel.defaultModelBaseUrl,
        embedModelHash: manifest.embedModel.manifestHash,
      }),
    });
    const result = await embedder.rankPrompt(
      'glass lens prism optics bench with a bright beam',
      lab.PHYSICAL_PRIMITIVES,
      { max: 8 }
    );

    assert.equal(result.model.id, 'qwen-3-embedding-0-6b-q4k-ehf16-af32');
    assert.equal(result.backend, 'configured-provider');
    assert.equal(result.priors[0].primitiveId, 'optics-bench');
  });
});

test('Qwen surface-card retrieval feeds typed graph synthesis', async () => {
  await withIntentArtifactFetch(async ({ index, surfaceIndex }) => {
    const query = indexedCardVector(surfaceIndex, 'lens');
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      embedProvider: probeAwareEmbedProvider({ index, targetVector: query }),
    });
    const prompt = 'laser heats ferrofluid lens over copper coil';
    const result = await embedder.rankPrompt(prompt, lab.PHYSICAL_PRIMITIVES, {
      max: 12,
      maxCards: 12,
    });
    const spec = lab.createSpecFromPrompt(prompt, {
      allowPrototypeFallback: true,
      embeddingPriors: result.priors,
      embeddingModel: result.model,
      embeddingBackend: result.rankBackend,
      intentRerank: result.rerank,
      semanticRag: result.semanticRag,
      dopplerIntent: result.dopplerIntent,
      cardMatches: result.cardMatches,
      universeMatches: result.universeMatches,
    });
    const synth = spec.intent.synthesis;

    assert.equal(result.cardMatches[0].cardId, 'lens');
    assert.equal(synth.schema, 'simulatte.embeddingGuidedGraphSynthesis.v1');
    assert.equal(synth.validation.valid, true);
    assert.ok(result.cardMatches.some((match) => match.cardId === 'laser'));
    assert.ok(synth.synthGraph.nodes.some((node) => node.cardId === 'lens'));
    assert.ok(synth.synthGraph.nodes.some((node) => node.cardId === 'laser'));
    assert.ok(synth.synthGraph.nodes.some((node) => node.cardId === 'ferrofluid'));
    assert.ok(spec.universeGraph.nodes.some((node) => (node.evidence || []).includes('universe-index')));
    assert.ok(spec.objects.some((object) => /lens|laser|ferrofluid/.test(object.id)));
    assert.equal(spec.physicalSpec.receipt.synthesis.valid, true);
  });
});

test('classifier direct prompt rules do not inject broad scene priors over model evidence', () => {
  const diesel = lab.classifyIntentPrompt('a diesel generator powers a crane', {
    embeddingModel: { id: 'qwen-3-embedding-0-6b-q4k-ehf16-af32', dimensions: 1024 },
    embeddingBackend: 'test',
    embeddingPriors: [
      { primitiveId: 'motor-load', score: 0.91 },
      { primitiveId: 'rigid-body', score: 0.62 },
    ],
  });
  const waterWaves = lab.classifyIntentPrompt('water waves push a small boat near the shore', {
    embeddingModel: { id: 'qwen-3-embedding-0-6b-q4k-ehf16-af32', dimensions: 1024 },
    embeddingBackend: 'test',
    embeddingPriors: [
      { primitiveId: 'water', score: 0.93 },
      { primitiveId: 'buoyant-body', score: 0.68 },
    ],
  });
  const dieselIds = new Set(diesel.priors.map((row) => row.primitiveId));
  const waterWaveIds = new Set(waterWaves.priors.map((row) => row.primitiveId));

  assert.equal(dieselIds.has('solar-panel'), false);
  assert.equal(dieselIds.has('stator-slider'), false);
  assert.equal(waterWaveIds.has('acoustic-emitter'), false);
});

test('builder creates the solar magnetic perpetual motion machine from prompt', () => {
  const spec = lab.createSpecFromPrompt(
    'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun'
  );

  assert.equal(spec.templateId, 'custom-world');
  assert.equal(spec.intent.schema, 'simulatte.intent.v1');
  assert.equal(spec.name, 'Solar Magnetic Perpetual Motion Machine');
  assert.ok(spec.modules.includes('electromagnetism'));
  assert.ok(spec.modules.includes('solar'));
  assert.ok(spec.objects.some((object) => object.id === 'rotor-wheel'));
  assert.ok(spec.controls.some((control) => control[0] === 'sliderAmplitude'));
  assert.equal(spec.params.irradiance, 780);
  assert.equal(spec.params.sliderAmplitude, 0.42);
  assert.equal(spec.params.loadTorque, 0.16);
});

test('sampled examples resolve through intent before simulation spec', () => {
  const examples = lab.EXAMPLE_INTENTS
    .filter((_, index) => index % 32 === 0)
    .concat(lab.EXAMPLE_INTENTS.at(-1));
  for (const example of examples) {
    const intent = lab.createIntentFromPrompt(example.prompt);
    const spec = lab.resolveIntentToSpec(intent);

    assert.equal(intent.schema, 'simulatte.intent.v1');
    assert.equal(spec.intent.prompt, example.prompt);
    assert.ok(['custom-world', 'blank-world'].includes(spec.templateId));
  }
});

test('prompt shuffle examples are hand-written compact and broadly diverse', () => {
  const prompts = lab.EXAMPLE_INTENTS.map((example) => example.prompt);
  const ids = lab.EXAMPLE_INTENTS.map((example) => example.id);
  const promptWords = prompts.map((prompt) => prompt.split(/\s+/).filter(Boolean).length);
  const observedWordCounts = new Set(promptWords);
  const signatures = new Set(lab.EXAMPLE_INTENTS.map((example) => JSON.stringify(example.params || {})));
  const forbiddenLabels = ['W', 'X', 'Y', 'Z', 'P', 'Q', 'Forest fire', 'Watershed', 'City grid', 'Optics', 'Mag wheel'];
  const labels = lab.EXAMPLE_INTENTS.map((example) => example.label);

  assert.equal(lab.EXAMPLE_INTENTS.length, 256);
  assert.equal(lab.HANDWRITTEN_EXAMPLE_PROMPTS.length, 256);
  assert.equal(new Set(ids).size, 256);
  assert.equal(new Set(prompts).size, 256);
  assert.equal(Math.min(...promptWords), 1);
  assert.equal(Math.max(...promptWords), 16);
  for (let wordCount = 1; wordCount <= 16; wordCount += 1) {
    assert.equal(observedWordCounts.has(wordCount), true);
  }
  assert.ok(signatures.size >= 128);
  for (const label of forbiddenLabels) assert.equal(labels.includes(label), false);

  const promptCorpus = prompts.join('\n');
  for (const term of [
    'ferrofluid',
    'asteroid',
    'neutron',
    'photosynthesis',
    'mycorrhizal',
    'subway',
    'tokamak',
    'graphene',
    'permafrost',
    'microplastics',
    'WebGPU',
  ]) {
    assert.match(promptCorpus, new RegExp(term, 'i'));
  }

  const sampleSpecs = [
    'laser heats ferrofluid lens over copper coil',
    'subway passengers distribute across transfer platforms',
    'geothermal brine flashes into separator steam',
    'tokamak confines deuterium tritium plasma',
    'chromatin segregates inside dividing cell',
    'immersion coolant boils around GPU heatsinks',
  ].map((prompt) => {
    const example = lab.EXAMPLE_INTENTS.find((entry) => entry.prompt === prompt);
    return lab.createSpecFromPrompt(example.prompt, { params: example.params });
  });
  assert.ok(new Set(sampleSpecs.map((spec) => spec.renderProgram.rendererPlan.sceneKind)).size >= 4);
});

test('state labels follow compiled renderer scene identities', () => {
  const fire = lab.createSpecFromPrompt('wind pushes a dry pine fire', {
    allowPrototypeFallback: true,
  });
  const machine = lab.createSpecFromPrompt('solar magnetic wheel with sliding magnet', {
    allowPrototypeFallback: true,
  });

  assert.equal(fire.renderProgram.rendererPlan.sceneKind, 'fire');
  assert.equal(machine.renderProgram.rendererPlan.sceneKind, 'magnetic-machine');
  assert.equal(lab.stateLabel({}, fire), 'elemental reaction world');
  assert.equal(lab.stateLabel({}, machine), 'composed magnetic machine');
});

test('blank prompt resolves to empty construction plane intent', () => {
  const intent = lab.createIntentFromPrompt('');
  const spec = lab.resolveIntentToSpec(intent);

  assert.equal(spec.templateId, 'blank-world');
  assert.deepEqual(intent.domains, ['blank']);
  assert.equal(spec.modules.length, 0);
  assert.equal(spec.objects.length, 0);
});

test('blank keywords inside real prompts do not select blank intent', () => {
  const emptyGlass = lab.createSpecFromPrompt('an empty glass fills with water', {
    allowPrototypeFallback: true,
  });
  const scratchCastle = lab.createSpecFromPrompt('build a castle from scratch while wind cracks the gate', {
    allowPrototypeFallback: true,
  });

  assert.notEqual(emptyGlass.templateId, 'blank-world');
  assert.notEqual(scratchCastle.templateId, 'blank-world');
  assert.notDeepEqual(emptyGlass.intent.domains, ['blank']);
  assert.notDeepEqual(scratchCastle.intent.domains, ['blank']);
});

test('simulation specs export, import, and remix with lineage', () => {
  const spec = lab.createSpecFromPrompt('make a fluid vortex tank with turbulence and pressure');
  const restored = lab.deserializeSpec(lab.serializeSpec(spec));
  const remix = lab.remixSpec(restored, { name: 'Fluid Vortex Remix' });

  assert.equal(restored.templateId, 'custom-world');
  assert.ok(restored.modules.includes('fluid'));
  assert.equal(restored.name, spec.name);
  assert.equal(remix.templateId, 'custom-world');
  assert.equal(remix.remixOf, restored.id);
  assert.equal(remix.name, 'Fluid Vortex Remix');
});

test('builder composes hybrid worlds from multiple physical domains', () => {
  const spec = lab.createSpecFromPrompt('build a solar magnetic wheel in turbulent cooling fluid with catalyst chemistry');

  assert.equal(spec.templateId, 'custom-world');
  assert.ok(spec.modules.includes('electromagnetism'));
  assert.ok(spec.modules.includes('fluid'));
  assert.ok(spec.modules.includes('chemistry'));
  assert.ok(spec.controls.some((control) => control[0] === 'vortexStrength'));
  assert.ok(spec.controls.some((control) => control[0] === 'catalyst'));
  assert.ok(spec.objects.some((object) => object.id === 'catalyst-front'));
});

test('free text resolves varied physical primitive families', () => {
  const spec = createPrototypeSpec(
    'make a prismatic laser beam through a lens with sound waves, sand, plasma, bubbles, and spring constraint collisions'
  );
  const ids = new Set(spec.objects.map((object) => object.id));

  assert.equal(spec.intent.resolution.ranker, 'simulatte-local-tfidf-prototype-embedder.v1');
  assert.equal(spec.intent.classification.schema, 'simulatte.intentClassification.v1');
  assert.ok(spec.intent.classification.priors.length >= 8);
  assert.ok(spec.intent.conceptGraph.length >= 8);
  assert.ok(spec.modules.includes('optics'));
  assert.ok(spec.modules.includes('acoustics'));
  assert.ok(spec.modules.includes('granular'));
  assert.ok(spec.modules.includes('plasma'));
  assert.ok(spec.modules.includes('buoyancy'));
  assert.ok(spec.modules.includes('elasticity'));
  assert.ok(ids.has('optical-prism'));
  assert.ok(ids.has('acoustic-emitter'));
  assert.ok(ids.has('granular-bed'));
  assert.ok(ids.has('plasma-arc'));
  assert.ok(ids.has('buoyant-body'));
  assert.ok(ids.has('spring-constraint'));
});

test('world builder resolves broader component families for composed worlds', () => {
  const spec = createPrototypeSpec(
    'terrain erosion river with logistics nodes, market demand, queue backlog, noisy sensors, feedback control, infection front, phase change, data recorder, and audit trace'
  );
  const ids = new Set(spec.objects.map((object) => object.id));

  assert.equal(spec.templateId, 'custom-world');
  assert.ok(spec.intent.components.length >= 12);
  assert.ok(spec.modules.includes('terrain'));
  assert.ok(spec.modules.includes('logistics'));
  assert.ok(spec.modules.includes('market'));
  assert.ok(spec.modules.includes('queue'));
  assert.ok(spec.modules.includes('signal'));
  assert.ok(spec.modules.includes('control'));
  assert.ok(spec.modules.includes('biology'));
  assert.ok(spec.modules.includes('phase-change'));
  assert.ok(ids.has('terrain-heightfield'));
  assert.ok(ids.has('erosion-channel'));
  assert.ok(ids.has('logistics-node'));
  assert.ok(ids.has('market-demand'));
  assert.ok(ids.has('queue-server'));
  assert.ok(ids.has('sensor-array'));
  assert.ok(ids.has('feedback-controller'));
  assert.ok(ids.has('infection-front'));
  assert.ok(ids.has('phase-change-material'));
  assert.ok(ids.has('data-recorder'));
  assert.ok(spec.controls.some((control) => control[0] === 'queueBacklog'));
  assert.ok(spec.controls.some((control) => control[0] === 'controlGain'));
});

test('layered catalog separates math, physics, material, component, composition, and scene libraries', () => {
  assert.deepEqual(lab.LAYER_STACK.map((layer) => layer.id), [
    'math',
    'physics',
    'material',
    'component',
    'composition',
    'scene',
  ]);
  assert.equal(lab.COMPILER_INPUT_PLANE.id, 'compiler');
  assert.ok(lab.COMPILER_INPUT_PLANE.targetLayers.includes('scene'));
  assert.equal(lab.MATH_PRIMITIVE_LIBRARY.length, 63);
  assert.equal(lab.PHYSICS_PRIMITIVE_LIBRARY.length, 65);
  assert.equal(lab.MATERIAL_PRIMITIVE_LIBRARY.length, 114);
  assert.equal(lab.COMPONENT_LIBRARY.length, 60);
  assert.equal(lab.COMPOSITION_LIBRARY.length, 34);
  assert.equal(lab.SCENE_LIBRARY.length, 26);
  assert.equal(lab.LAYERED_PRIMITIVES.length, 362);
  assert.equal(lab.PHYSICAL_PRIMITIVES.length, 420);
  assert.equal(lab.primitiveById('rigid-body').layer, 'physics');
  assert.equal(lab.primitiveById('soft-body').layer, 'physics');
  assert.equal(lab.primitiveById('bonding').layer, 'physics');
  assert.equal(lab.primitiveById('aerodynamics').layer, 'physics');
  assert.equal(lab.primitiveById('magnetohydrodynamics').layer, 'physics');
  assert.equal(lab.primitiveById('gold').layer, 'material');
  assert.equal(lab.primitiveById('dna').layer, 'material');
  assert.equal(lab.primitiveById('lava').layer, 'material');
  assert.equal(lab.primitiveById('blood').layer, 'material');
  assert.equal(lab.primitiveById('molecular-chain').layer, 'component');
  assert.equal(lab.primitiveById('heart-pump').layer, 'component');
  assert.equal(lab.primitiveById('drone-flight').layer, 'composition');
  assert.equal(lab.primitiveById('rocket-ascent').layer, 'composition');
  assert.equal(lab.primitiveById('reef-tank').layer, 'scene');
  assert.equal(lab.primitiveById('electronics-bench').layer, 'scene');
  assert.ok(lab.materialPropertiesForId('gold').conductivity > 0.8);
  assert.ok(lab.materialPropertiesForId('dna').moisture > 0.5);
  assert.ok(lab.materialPropertiesForId('blood').moisture > 0.9);
  assert.ok(lab.materialPropertiesForId('superconductor').conductivity > 0.9);
});

test('canonical layer recipes only compose the immediately lower layer', () => {
  const validation = lab.validateLayerAdjacency();

  assert.equal(validation.schema, 'simulatte.layerAdjacency.v1');
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
  assert.equal(lab.lowerLayerFor('scene'), 'composition');
  assert.equal(lab.lowerLayerFor('component'), 'material');
  assert.equal(lab.layerForId('water'), 'material');
  assert.equal(lab.layerForId('fluid-advection'), 'physics');
});

test('math layer stays neutral and leaves physical quantities to higher layers', () => {
  const forbidden = /\b(heat|pressure|density|velocity|force|moisture|charge|temperature|energy|mass|fuel)\b/i;
  const mathText = lab.MATH_PRIMITIVE_LIBRARY
    .map((primitive) => primitive.text)
    .join(' ');

  assert.doesNotMatch(mathText, forbidden);
  assert.ok(lab.MATH_PRIMITIVE_LIBRARY.some((primitive) => primitive.id === 'scalar-field'));
  assert.ok(lab.MATH_PRIMITIVE_LIBRARY.some((primitive) => primitive.id === 'vector-field'));
  assert.ok(lab.MATH_PRIMITIVE_LIBRARY.some((primitive) => primitive.id === 'signed-distance-field'));
  assert.ok(lab.MATH_PRIMITIVE_LIBRARY.some((primitive) => primitive.id === 'laplacian'));
  assert.ok(lab.PHYSICS_PRIMITIVE_LIBRARY.some((primitive) => primitive.id === 'pressure'));
  assert.ok(lab.PHYSICS_PRIMITIVE_LIBRARY.some((primitive) => primitive.id === 'heat-transfer'));
});

test('downloaded embedding priors steer retrieval, regimes, and solver plans', () => {
  const spec = lab.createSpecFromPrompt(
    'soft fungal membrane colony with gel diffusion and pressure waves',
    {
      embeddingPriors: [
        { primitiveId: 'mycelium', score: 0.98 },
        { primitiveId: 'membrane', score: 0.94 },
        { primitiveId: 'gel', score: 0.91 },
        { primitiveId: 'bacteria', score: 0.88 },
        { primitiveId: 'wave-source', score: 0.82 },
      ],
      embeddingModel: {
        id: 'qwen-3-embedding-0-6b-q4k-ehf16-af32',
        family: 'qwen3-embedding',
        dimensions: 1024,
        indexId: 'simulatte-primitive-qwen-3-embedding-0-6b-index-v1',
        reranker: 'simulatte.doppler-intent-reranker.v1',
      },
      embeddingBackend: 'webgpu',
      intentRerank: {
        schema: 'simulatte.intentRerank.v1',
        required: true,
        top: ['mycelium', 'membrane', 'gel'],
      },
    }
  );
  const ids = new Set(spec.objects.map((object) => object.id));
  const regimes = new Set(spec.renderProgram.objects.map((object) => object.visualRegime));
  const solverFamilies = new Set(spec.renderProgram.solverPlan.families);

  assert.equal(spec.intent.classification.model.id, 'simulatte-qwen-3-embedding-0-6b-q4k-ehf16-af32-intent-ranker.v1');
  assert.equal(spec.intent.classification.model.runtime.backend, 'webgpu');
  assert.equal(spec.intent.classification.model.runtime.indexId, 'simulatte-primitive-qwen-3-embedding-0-6b-index-v1');
  assert.equal(spec.intent.rerank.schema, 'simulatte.intentRerank.v1');
  assert.equal(spec.physicalSpec.receipt.rerank.required, true);
  assert.ok(ids.has('mycelium'));
  assert.ok(ids.has('membrane'));
  assert.ok(ids.has('gel'));
  assert.ok(regimes.has('biological'));
  assert.ok(regimes.has('soft'));
  assert.ok(solverFamilies.has('growth-diffusion'));
  assert.ok(solverFamilies.has('membrane-relaxation'));
});

test('component and scene prompts materialize lower-layer recipes', () => {
  const spec = lab.createSpecFromPrompt(
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall'
  );
  const ids = new Set(spec.objects.map((object) => object.id));

  assert.ok(ids.has('forest-fire'));
  assert.ok(ids.has('flame'));
  assert.ok(ids.has('combustion'));
  assert.ok(ids.has('heat-transfer'));
  assert.ok(ids.has('smoke'));
  assert.ok(ids.has('wood'));
  assert.ok(ids.has('water'));
  assert.ok(ids.has('rock-wall'));
  assert.ok(spec.modules.includes('composition'));
  assert.ok(spec.modules.includes('component'));
  assert.ok(spec.modules.includes('material'));
  assert.ok(spec.modules.includes('physics'));
  assert.ok(spec.modules.includes('fire'));
});

test('optics prompts are built from elemental materials and operators', () => {
  const spec = lab.createSpecFromPrompt(
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor'
  );
  const ids = new Set(spec.objects.map((object) => object.id));

  assert.ok(ids.has('optics-bench'));
  assert.ok(ids.has('sun-lamp'));
  assert.ok(ids.has('lens'));
  assert.ok(ids.has('mirror'));
  assert.ok(ids.has('prism'));
  assert.ok(ids.has('glass'));
  assert.ok(ids.has('optics'));
  assert.ok(ids.has('radiation'));
  assert.ok(spec.modules.includes('scene'));
  assert.ok(spec.modules.includes('composition'));
  assert.ok(spec.modules.includes('optics'));
  assert.ok(spec.modules.includes('glass'));
});

test('layer contracts attach material properties, interactions, ports, slots, layout, and readouts', () => {
  const spec = lab.createSpecFromPrompt(
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall'
  );
  const flame = spec.objects.find((object) => object.id === 'flame');
  const slots = spec.contract.recipeSlots['forest-fire'];

  assert.equal(spec.contract.schema, 'simulatte.layerContract.v1');
  assert.equal(spec.contract.adjacency.valid, true);
  assert.deepEqual(spec.contract.layerStack.map((layer) => layer.id), [
    'math',
    'physics',
    'material',
    'component',
    'composition',
    'scene',
  ]);
  assert.equal(spec.contract.compilerInputPlane.id, 'compiler');
  assert.equal(spec.contract.layerFocus, 'composition');
  assert.ok(spec.contract.topLevel.includes('forest-fire'));
  assert.equal(spec.contract.materials.water.moisture, 1);
  assert.ok(spec.contract.interactions.some((rule) => rule.id === 'water-suppresses-fire'));
  assert.ok(spec.contract.interactions.some((rule) => rule.id === 'dry-wood-burns'));
  assert.ok(slots.some((slot) => slot.slot === 'fuel bed' && slot.required));
  assert.ok(slots.some((slot) => slot.slot === 'moisture' && !slot.required));
  assert.ok(flame.ports.outputs.includes('heat'));
  assert.equal(spec.contract.layout.grammar, 'patch spread');
  assert.deepEqual(lab.readoutLabelsForSpec(spec), [
    'fuel load',
    'burn front',
    'smoke',
    'moisture',
    'wind',
    'containment',
  ]);
});

test('graph IR carries units, operators, conservation, temporal events, and explanation', () => {
  const spec = lab.createSpecFromPrompt(
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall'
  );
  const graph = spec.contract.graph;

  assert.equal(graph.schema, 'simulatte.physicalGraph.v1');
  assert.equal(graph.units.combustibility.dimension, 'probability');
  assert.equal(graph.units.heatTransfer.dimension, 'rate');
  assert.ok(graph.nodes.some((node) => node.id === 'flame' && node.nodeType === 'source'));
  assert.ok(graph.nodes.some((node) => node.id === 'flame' && Number.isFinite(node.state.temperature)));
  assert.ok(graph.edges.some((edge) => edge.type === 'transfersEnergy' || edge.type === 'constrains'));
  assert.ok(graph.operators.some((operator) => operator.id === 'combustion'));
  assert.ok(graph.operators.some((operator) => operator.id === 'advection'));
  assert.ok(graph.conservation.some((rule) => rule.id === 'combustion-mass-energy'));
  assert.ok(graph.temporal.some((event) => event.id === 'ignition'));
  assert.equal(graph.coverage.schema, 'simulatte.promptCoverage.v1');
  assert.equal(graph.quality.schema, 'simulatte.physicalQuality.v1');
  assert.equal(graph.validation.status, 'valid');
  assert.equal(graph.explanation.topIdentity, 'forest-fire');
  assert.ok(graph.explanation.expanded.includes('flame'));
  assert.ok(graph.explanation.interactions.includes('water-suppresses-fire'));
});

test('prompt worlds compile into Grid-like classifier composition graphs', () => {
  const fire = createPrototypeSpec(
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall'
  );
  const optics = createPrototypeSpec(
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor'
  );
  const city = createPrototypeSpec(
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger'
  );
  const machine = createPrototypeSpec(
    'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun'
  );

  assert.equal(fire.physicalSpec.schema, 'simulatte.physicalSpec.v1');
  assert.equal(fire.compositionGraph.schema, 'simulatte.compositionGraph.v1');
  assert.equal(fire.renderProgram.schema, 'simulatte.renderProgram.v1');
  assert.ok(fire.intent.classification.priors.some((prior) => prior.primitiveId === 'forest-fire'));
  assert.ok(fire.compositionGraph.operators.some((operator) => operator.id === 'combustion'));
  assert.ok(fire.renderProgram.objects.some((object) => object.shape === 'flame-front'));
  assert.ok(fire.renderProgram.emitters.some((emitter) => emitter.kind === 'plume'));
  assert.ok(fire.renderProgram.solverPlan.families.includes('reaction-front'));
  assert.ok(optics.intent.classification.priors.some((prior) => prior.primitiveId === 'optics-bench'));
  assert.ok(optics.renderProgram.objects.some((object) => object.shape === 'prism'));
  assert.ok(optics.renderProgram.fields.some((field) => field.kind === 'optical-rays'));
  assert.ok(optics.renderProgram.provenance.visualRegimes.includes('optical'));
  assert.ok(city.intent.classification.priors.some((prior) => prior.primitiveId === 'city-grid'));
  assert.ok(city.renderProgram.objects.some((object) => object.shape === 'queue-node'));
  assert.ok(city.renderProgram.fields.some((field) => field.kind === 'network-flow'));
  assert.ok(machine.compositionGraph.nodes.some((node) => node.primitiveId === 'rotor-wheel'));
  assert.ok(machine.renderProgram.objects.some((object) => object.shape === 'wheel'));
  assert.ok(machine.renderProgram.fields.some((field) => field.kind === 'dipole'));
  assert.equal(machine.physicalSpec.executionSource, 'solverGraph');
  assert.ok(machine.physicalSpec.visualPassHints.includes('magnetic-vector-field-solve'));
});

test('prompt worlds choose distinct regime renderer identities', () => {
  const cases = [
    [
      'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall',
      'fire',
      'thermal',
    ],
    [
      'wind pushes a dry pine fire over a ridge',
      'fire',
      'thermal',
    ],
    [
      'thermal plume bends smoke over cooling fins',
      'thermal-plume',
      'thermal',
    ],
    [
      'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor',
      'optics',
      'optical',
    ],
    [
      'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger',
      'city',
      'network',
    ],
    [
      'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun',
      'magnetic-machine',
      'magnetic',
    ],
    [
      'ferrofluid spikes around copper coils under pulsing current',
      'ferrofluid',
      'magnetic',
    ],
    [
      'mountain watershed with river erosion, terrain patch, sand, soil, rock, water, and gravity',
      'watershed',
      'fluid',
    ],
    [
      'granular beads avalanche through a vibrating sieve',
      'granular',
      'granular',
    ],
    [
      'soap film colors stretch around air bubbles and wire loops',
      'thin-film',
      'optical',
    ],
    [
      'water air rock wood metal glass magnetized metal gravity heat diffusion sample tray',
      'material-tray',
      'material',
    ],
    [
      'biological colony with mycelium membrane bacteria growth diffusion and protein gel',
      'biology',
      'biological',
    ],
    [
      'acoustic pressure waves through brass tubes and water',
      'acoustic',
      'acoustic',
    ],
  ];

  for (const [prompt, sceneKind, dominantRegime] of cases) {
    const spec = createPrototypeSpec(prompt);

    assert.equal(spec.renderProgram.rendererPlan.schema, 'simulatte.rendererPlan.v1');
    assert.equal(spec.renderIR.sceneHint, sceneKind);
    assert.equal(spec.renderProgram.rendererPlan.sceneKind, sceneKind);
    assert.equal(spec.renderProgram.rendererPlan.dominantRegime, dominantRegime);
    assert.equal(spec.renderProgram.provenance.visualIdentity.sceneKind, sceneKind);
    assert.equal(spec.physicalSpec.receipt.visualIdentity.sceneKind, sceneKind);
    assert.match(spec.renderProgram.rendererPlan.renderer, new RegExp(`\\.${sceneKind}\\.v1$`));
    assert.ok(spec.renderProgram.rendererPlan.passOrder.length >= 4);
  }
});

test('VisualIR compiles hard natural language into structural render programs', () => {
  const cases = [
    [
      'neutrino detector in underground water tank with photon cones and phototube array',
      'particle-instrument',
      'optics',
      'instrumented-lab-depth',
    ],
    [
      'housing market pressure across parcels with household agents and zoning constraints',
      'civic-market',
      'city',
      'aerial-map-depth',
    ],
    [
      'protein folding energy minimization with bond constraints and collapse motion',
      'molecular-biology',
      'biology',
      'microscopic-cutaway-depth',
    ],
    [
      'fusion stellarator plasma ribbon twisting inside coil cage',
      'advanced-energy',
      'material-tray',
      'cutaway-section-depth',
    ],
    [
      'mangrove roots buffering storm surge while sediment settles in brackish tidal channels',
      'restoration-water',
      'watershed',
      'aerial-map-depth',
    ],
    [
      'blockchain mempool packet routing through validator network',
      'digital-network',
      'city',
      'aerial-map-depth',
    ],
    [
      'ammonia synthesis catalyst bed reaction inside pressure vessel',
      'chemistry-lab',
      'material-tray',
      'cutaway-section-depth',
    ],
    [
      'hospital bedflow patient agents capacity balancing between ward units',
      'clinical-control',
      'biology',
      'cutaway-section-depth',
    ],
    [
      'planetary rings shepherd moon resonance sorting ice boulders',
      'planetary-space',
      'optics',
      'aerial-map-depth',
    ],
    [
      'air quality urban valley particulate dispersion through buildings',
      'hazard-atmosphere',
      'watershed',
      'aerial-map-depth',
    ],
  ];

  for (const [prompt, sceneKind, painterKind, camera] of cases) {
    assertVisualIRCase(prompt, { sceneKind, painterKind, camera });
  }
});

test('compiled-artifact visual genomes diversify close and broad worlds', () => {
  const prompts = [
    'fire',
    'building fire',
    'glass lens focusing sunlight through water',
    'city market queue traffic network',
    'ferrofluid spikes around copper coils under pulsing current',
    'granular beads avalanche through a vibrating sieve',
  ];
  const specs = prompts.map((prompt) => createPrototypeSpec(prompt));
  const genomes = specs.map((spec) => spec.renderProgram.visualGenome);
  const genomeIds = new Set(genomes.map((genome) => genome.id));
  const fireGenome = genomes[0];
  const buildingFireGenome = genomes[1];

  assert.equal(genomeIds.size, prompts.length);
  assert.equal(fireGenome.schema, 'simulatte.visualGenome.v1');
  assert.equal(fireGenome.source, 'compiled-artifact-seeded-procedural');
  assert.equal(specs[0].renderProgram.rendererPlan.sceneKind, specs[1].renderProgram.rendererPlan.sceneKind);
  assert.equal(specs[0].physicalSpec.receipt.visualGenome.id, fireGenome.id);
  assert.equal(specs[1].physicalSpec.receipt.visualGenome.id, buildingFireGenome.id);
  assert.notEqual(fireGenome.id, buildingFireGenome.id);
  assert.ok(fireGenome.motifs.includes('ember-shear'));
  assert.ok(!fireGenome.motifs.includes('architectural-grid'));
  assert.ok(!fireGenome.motifs.includes('caustic-ribs'));
  assert.ok(!fireGenome.motifs.includes('flow-contours'));
  assert.ok(buildingFireGenome.motifs.includes('ember-shear'));
  assert.ok(buildingFireGenome.motifs.includes('architectural-grid'));
  assert.notDeepEqual(fireGenome.palette, buildingFireGenome.palette);
  assert.notDeepEqual(fireGenome.morphology, buildingFireGenome.morphology);
});

test('expanded prompt regimes do not collapse into literal or broad renderer fallbacks', () => {
  const cases = [
    [
      'lava heats rain into steam while wind bends ash over a basalt delta',
      'thermal-plume',
    ],
    [
      'planetary rings shear around a shepherd moon with icy particle density waves',
      'planetary-space',
    ],
    [
      'edge data center server racks recirculating heat between cooling aisles under controller limits',
      'digital-network',
    ],
    [
      'protein folding energy minimization in a crowded solvent',
      'molecular-biology',
    ],
    [
      'housing market pressure across parcels with zoning constraints',
      'civic-market',
    ],
    [
      'neutrino detector in underground water tank with photon cones',
      'particle-instrument',
    ],
    [
      'forest fire jumping a road under wind shear',
      'fire',
    ],
    [
      'microfluidic droplets split at a glass channel junction',
      'chemistry-lab',
    ],
    [
      'bridge resonance under wind vortex shedding',
      'structural-mechanics',
    ],
    [
      'coral reef bleaching under warm acidic water',
      'evolution-ecology',
    ],
  ];
  const specs = cases.map(([prompt]) => createPrototypeSpec(prompt));
  const scenes = new Set();
  let expandedRecipeCount = 0;

  specs.forEach((spec, index) => {
    const [, sceneKind] = cases[index];
    const plan = spec.renderProgram.rendererPlan;
    const visualIR = spec.renderProgram.visualIR;
    scenes.add(plan.sceneKind);
    if (plan.visualRecipe) expandedRecipeCount += 1;
    assert.equal(plan.sceneKind, sceneKind);
    assert.equal(visualIR.sceneKind, sceneKind);
    assert.notEqual(plan.sceneKind, 'literal-composite');
    assert.notEqual(plan.sceneKind, 'generic');
    assert.equal(spec.physicalSpec.receipt.visualIdentity.sceneKind, sceneKind);
  });

  assert.ok(scenes.size >= 9);
  assert.ok(expandedRecipeCount >= 7);
});

test('hand-authored coverage probes span major simulation regimes', () => {
  const cases = [
    ['supercell thunderstorm grows hail under wind shear', 'weather-atmosphere'],
    ['glacier calving into fjord with sea ice waves', 'ocean-cryosphere'],
    ['earthquake fault rupture sends waves through soft basin', 'hazard-atmosphere'],
    ['internal ocean waves mix plankton under kelp canopy', 'ocean-cryosphere'],
    ['microgrid battery inverter stabilizes transformer overload', 'grid-energy'],
    ['warehouse robot arms sort parcels on conveyor belts', 'robotics-control'],
    ['injection molding line cools plastic through steel tooling', 'manufacturing-line'],
    ['qubit chip phase readout through microwave resonator', 'quantum-instrument'],
    ['compost heat oxygen water loop feeds greenhouse crops', 'agro-waste-loop'],
    ['tornado debris plume crosses highway evacuation map', 'hazard-atmosphere'],
    ['blood pump control loop stabilizes patient flow', 'clinical-control'],
    ['museum pigment film ages under humidity cycling', 'cultural-material'],
    ['skateboard rider pumps a curved bowl with friction loss', 'sport-motion'],
    ['stadium crowd agents queue through gates after rain', 'venue-crowd'],
    ['neutrino detector in underground water tank with photon cones', 'particle-instrument'],
    ['planetary rings shear around a shepherd moon', 'planetary-space'],
    ['protein folding energy minimization in crowded solvent', 'molecular-biology'],
    ['housing market pressure across parcels with zoning constraints', 'civic-market'],
    ['edge data center server racks recirculate heat', 'digital-network'],
    ['microfluidic droplets split at a glass channel junction', 'chemistry-lab'],
    ['bridge resonance under wind vortex shedding', 'structural-mechanics'],
    ['mangrove roots buffer storm surge and sediment', 'restoration-water'],
    ['coral reef bleaching under warm acidic water', 'evolution-ecology'],
    ['violin body resonance drives air pressure waves', 'acoustic'],
    ['glass lens focuses laser caustics through prism', 'optics'],
    ['granular beads avalanche through a vibrating sieve', 'granular'],
    ['soap film colors stretch around air bubbles', 'thin-film'],
    ['ferrofluid spikes around copper coils under pulsing current', 'ferrofluid'],
    ['forest fire jumps a road under wind shear', 'fire'],
    ['rain erodes a mountain watershed into sediment channels', 'watershed'],
  ];
  const scenes = new Set();
  const cameras = new Set();
  let expandedRecipeCount = 0;

  for (const [prompt, sceneKind] of cases) {
    const spec = createPrototypeSpec(prompt);
    const plan = spec.renderProgram.rendererPlan;
    const visualIR = spec.renderProgram.visualIR;
    const scenePacket = visualIR.sceneRenderPacket;
    scenes.add(plan.sceneKind);
    cameras.add(visualIR.camera.mode);
    if (plan.visualRecipe) expandedRecipeCount += 1;
    assert.equal(plan.sceneKind, sceneKind, prompt);
    assert.equal(visualIR.sceneKind, sceneKind, prompt);
    assert.equal(scenePacket.schema, 'simulatte.sceneRenderPacket.v1', prompt);
    assert.equal(scenePacket.sceneKind, sceneKind, prompt);
    assert.ok(scenePacket.entities.length >= 1, prompt);
    assert.ok(scenePacket.entities.every((entity) => Array.isArray(entity.transform.position)), prompt);
    assert.ok(scenePacket.entities.every((entity) => entity.geometry && entity.material && entity.animation && entity.collider), prompt);
    assert.ok(scenePacket.passes.includes('entities'), prompt);
    assert.equal(spec.physicalSpec.receipt.visualIdentity.sceneKind, sceneKind, prompt);
    assert.notEqual(plan.sceneKind, 'generic', prompt);
    assert.notEqual(plan.sceneKind, 'literal-composite', prompt);
  }

  assert.ok(scenes.size >= 27);
  assert.ok(cameras.size >= 5);
  assert.ok(expandedRecipeCount >= 23);
});

test('compiled visual DNA differentiates related language-grounded worlds', () => {
  const prompts = [
    'moss',
    'moss turbine',
    'moss turbine glass',
    'moss turbine stone',
    'quartz turbine glass',
  ];
  const genomes = prompts.map((prompt) => createPrototypeSpec(prompt).renderProgram.visualGenome);
  const dnaRows = genomes.map((genome) => genome.visualDna);
  const dnaHashes = new Set(dnaRows.map((dna) => dna.hash));
  const markSignatures = new Set(dnaRows.map((dna) => (
    dna.ngrams.map((row) => `${row.n}:${row.index}:${row.mark}:${row.hue}`).join('|')
  )));

  assert.equal(dnaHashes.size, prompts.length);
  assert.equal(markSignatures.size, prompts.length);
  assert.ok(dnaRows.every((dna) => dna.schema === 'simulatte.compiledVisualDna.v1'));
  assert.ok(dnaRows.every((dna) => dna.tokenCount >= 1));
  assert.ok(dnaRows.every((dna) => dna.ngrams.some((row) => row.n === 1)));
  assert.equal(dnaRows[2].catalog, 'simulatte.proceduralVisualBase.v1');
});

test('semantic visual atlas maps prompts to distinct archetype material and process layers', () => {
  const prompts = [
    'fire',
    'building fire',
    'battery leak warehouse robots',
    'orbiting mirror algae pond',
    'acoustic levitator dust brass tube',
    'moss turbine glass',
  ];
  const specs = prompts.map((prompt) => createPrototypeSpec(prompt));
  const visuals = specs.map((spec) => spec.renderProgram.visualGenome.semanticVisuals);
  const signatures = new Set(visuals.map((visual) => visual.signature));
  const families = (visual, key) => new Set((visual[key] || []).map((row) => row.family));
  const overlays = (visual) => new Set(visual.overlays || []);
  const fire = visuals[0];
  const buildingFire = visuals[1];
  const battery = visuals[2];
  const orbitPond = visuals[3];
  const acoustic = visuals[4];
  const mossTurbine = visuals[5];

  assert.equal(signatures.size, prompts.length);
  for (const visual of visuals) {
    assert.equal(visual.schema, 'simulatte.semanticVisualPlan.v1');
    assert.equal(visual.atlas, 'simulatte.semanticVisualAtlas.v1');
    assert.ok(visual.quality.coverage >= 0.75);
    assert.ok(visual.quality.layerCount >= 2);
  }
  assert.ok(families(fire, 'materials').has('thermal'));
  assert.ok(families(fire, 'processes').has('burn'));
  assert.ok(!families(fire, 'archetypes').has('architecture'));
  assert.ok(families(buildingFire, 'archetypes').has('architecture'));
  assert.ok(families(buildingFire, 'materials').has('concrete'));
  assert.ok(families(battery, 'archetypes').has('civic'));
  assert.ok(families(battery, 'archetypes').has('electronics'));
  assert.ok(families(battery, 'materials').has('electric'));
  assert.ok(families(battery, 'processes').has('leak'));
  assert.ok(families(orbitPond, 'archetypes').has('astronomy'));
  assert.ok(families(orbitPond, 'archetypes').has('biology'));
  assert.ok(families(orbitPond, 'processes').has('orbit'));
  assert.ok(families(acoustic, 'archetypes').has('acoustics'));
  assert.ok(families(acoustic, 'processes').has('levitate'));
  assert.ok(families(acoustic, 'processes').has('sort'));
  assert.ok(families(mossTurbine, 'archetypes').has('mechanics'));
  assert.ok(families(mossTurbine, 'processes').has('rotate'));
  assert.ok(overlays(mossTurbine).has('rotation-trails'));
});

test('visual operator atlas maps grounded physics to distinct graphics atom plans', () => {
  const cases = [
    [
      'data center cooling loop where hot server racks increase coolant flow and controller throttles fan speed',
      ['visual.operator.control-feedback.v1', 'visual.operator.fluid-advection.v1', 'visual.operator.heat-transfer.v1'],
      ['controller-node', 'ribbon-streamline', 'thermal-glow-gradient'],
      ['feedback', 'fluid', 'thermal'],
    ],
    [
      'injection molding line cools plastic through steel tooling',
      ['visual.operator.heat-transfer.v1'],
      ['thermal-glow-gradient'],
      ['thermal', 'phase'],
    ],
    [
      'housing market pressure across parcels with zoning constraints and household agents',
      ['visual.operator.network-flow.v1'],
      ['node-link-graph', 'parcel-grid'],
      ['network', 'constraint'],
    ],
    [
      'qubit chip phase readout through microwave resonator with interference fringes',
      ['visual.operator.quantum-phase-readout.v1', 'visual.operator.instrument-readout.v1'],
      ['superconducting-chip-plane', 'phase-fringe-sheet', 'instrument-panel'],
      ['quantum', 'instrument'],
    ],
    [
      'lava spins a turbine near an ice castle wall',
      ['visual.operator.heat-transfer.v1', 'visual.operator.phase-transition.v1'],
      ['thermal-glow-gradient', 'volume-vapor-plume', 'phase-boundary-sheet'],
      ['thermal', 'phase'],
    ],
    [
      'robot sorts parcels with servo gripper contact force in warehouse queue',
      ['visual.operator.robot-contact.v1', 'visual.operator.network-flow.v1'],
      ['robot-armature', 'contact-cone', 'node-link-graph'],
      ['robotic', 'network'],
    ],
    [
      'glacier calving into fjord with internal ocean waves and iceberg collisions',
      ['visual.operator.cryosphere-surface.v1', 'visual.operator.fluid-advection.v1'],
      ['ice-cliff-shelf', 'calving-block-field', 'ribbon-streamline'],
      ['phase', 'fluid', 'surface'],
    ],
    [
      'skateboard rider carves a bowl with friction loss and centripetal arcs',
      ['visual.operator.sport-trajectory.v1'],
      ['curved-bowl-surface', 'rider-trajectory-arc', 'wheel-contact-patch'],
      ['motion', 'stress', 'constraint'],
    ],
    [
      'sourdough fermentation gas bubbles growing through a dough matrix with gluten strands and acidity gradients',
      ['visual.operator.fermentation-matrix.v1', 'visual.operator.chemical-diffusion.v1', 'visual.operator.biological-growth.v1'],
      ['porous-dough-matrix', 'gluten-strand-network', 'fermentation-bubble-cell'],
      ['biological', 'chemical', 'fluid', 'motion', 'density'],
    ],
    [
      'soap thin film with air bubbles in wire loops and iridescent interference',
      ['visual.operator.thin-film-interference.v1'],
      ['thin-film-sheet', 'wire-loop-frame', 'interference-bubble-cell'],
      ['optical', 'phase', 'surface'],
    ],
    [
      'particle collider muon tracks through detector slice with calorimeter pulses',
      ['visual.operator.particle-track-detector.v1', 'visual.operator.instrument-readout.v1'],
      ['detector-slice-stack', 'muon-track-ribbons', 'calorimeter-tile-array'],
      ['instrument', 'measurement', 'signal'],
    ],
    [
      'acoustic levitator dust brass tube standing pressure waves',
      ['visual.operator.acoustic-wave.v1'],
      ['waveguide-tube', 'resonator-cavity', 'membrane-diaphragm'],
      ['acoustic', 'motion', 'instrument'],
    ],
    [
      'bridge resonance under wind vortex shedding with cable tension',
      ['visual.operator.stress-fracture.v1', 'visual.operator.fluid-advection.v1'],
      ['sectioned-solid', 'crack-branch-network', 'ribbon-streamline'],
      ['stress', 'fluid', 'constraint'],
    ],
  ];
  const signatures = new Set();

  for (const [prompt, expectedMappings, expectedGeometry, expectedSlots] of cases) {
    const spec = createPrototypeSpec(prompt);
    const atoms = spec.renderProgram.visualIR.graphicsAtoms;
    const mappingIds = atoms.mappings.map((row) => row.id);
    const geometryIds = atoms.geometry.map((row) => row.id);
    const bySlot = atoms.uniforms.bySlot || {};
    const signature = [
      ...mappingIds,
      ...geometryIds,
      ...atoms.fields.map((row) => row.id),
      ...atoms.motion.map((row) => row.id),
      ...Object.entries(bySlot).filter((entry) => entry[1] > 0).map((entry) => entry[0]),
    ].join('|');

    assert.equal(atoms.schema, 'simulatte.graphicsAtomPlan.v1');
    assert.equal(atoms.compiler, 'simulatte.visualOperatorCompiler.v1');
    assert.equal(atoms.source, 'handwritten-operator-graphics-basis');
    assert.ok(atoms.languageSignals.length > 0, `${prompt} missing span-backed language signals`);
    assert.equal(atoms.uniforms.schema, 'simulatte.graphicsAtomUniforms.v1');
    assert.equal(atoms.uniforms.values.length, 24);
    assert.ok(atoms.wgslOperators.length >= expectedMappings.length);
    expectedMappings.forEach((id) => {
      assert.ok(mappingIds.includes(id), `${prompt} missing mapping ${id}`);
    });
    expectedGeometry.forEach((id) => {
      assert.ok(geometryIds.includes(id), `${prompt} missing geometry atom ${id}`);
    });
    expectedSlots.forEach((slot) => {
      assert.ok(bySlot[slot] > 0, `${prompt} missing uniform slot ${slot}`);
    });
    assert.ok(spec.renderProgram.visualIR.receipts.some((row) => row.id === 'receipt:graphics-atoms'));
    signatures.add(signature);
  }

  assert.equal(signatures.size, cases.length);
});

test('molecular biology prompts do not admit robot visuals without robot evidence', () => {
  const spec = createPrototypeSpec(
    'protein folding energy minimization with chain geometry and bond constraints'
  );
  const mappingIds = spec.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);

  assert.ok(mappingIds.includes('visual.operator.biological-growth.v1'));
  assert.ok(!mappingIds.includes('visual.operator.robot-contact.v1'));
  assert.equal(spec.renderProgram.visualIR.sceneKind, 'molecular-biology');
});

test('fermentation prompts compile to molecular biology with dough-specific visual atoms', () => {
  const spec = createPrototypeSpec(
    'sourdough fermentation gas bubbles growing through a dough matrix with gluten strands and acidity gradients'
  );
  const atoms = spec.renderProgram.visualIR.graphicsAtoms;
  const mappingIds = atoms.mappings.map((row) => row.id);
  const geometryIds = atoms.geometry.map((row) => row.id);
  const processIds = atoms.processes.map((row) => row.id);
  const motionIds = atoms.motion.map((row) => row.id);

  assert.equal(spec.renderIR.sceneHint, 'molecular-biology');
  assert.equal(spec.renderProgram.visualIR.sceneKind, 'molecular-biology');
  assert.ok(mappingIds.includes('visual.operator.fermentation-matrix.v1'));
  assert.ok(mappingIds.includes('visual.operator.chemical-diffusion.v1'));
  assert.ok(mappingIds.includes('visual.operator.biological-growth.v1'));
  assert.ok(geometryIds.includes('porous-dough-matrix'));
  assert.ok(geometryIds.includes('gluten-strand-network'));
  assert.ok(geometryIds.includes('fermentation-bubble-cell'));
  assert.ok(processIds.includes('microbial-fermentation'));
  assert.ok(processIds.includes('gas-pocket-growth'));
  assert.ok(motionIds.includes('bubble-expansion'));
  assert.ok(atoms.uniforms.bySlot.biological > 0);
  assert.ok(atoms.uniforms.bySlot.chemical > 0);
  assert.ok(atoms.uniforms.bySlot.fluid > 0);
  assert.ok(atoms.wgslOperators.includes('atomFermentationBubbles'));
});

test('thin-film prompts do not collapse into fermentation bubble visuals', () => {
  const spec = createPrototypeSpec(
    'soap thin film with air bubbles in wire loops and iridescent interference'
  );
  const atoms = spec.renderProgram.visualIR.graphicsAtoms;
  const mappingIds = atoms.mappings.map((row) => row.id);
  const geometryIds = atoms.geometry.map((row) => row.id);

  assert.equal(spec.renderProgram.visualIR.sceneKind, 'thin-film');
  assert.ok(mappingIds.includes('visual.operator.thin-film-interference.v1'));
  assert.ok(!mappingIds.includes('visual.operator.fermentation-matrix.v1'));
  assert.ok(geometryIds.includes('thin-film-sheet'));
  assert.ok(geometryIds.includes('wire-loop-frame'));
  assert.ok(atoms.uniforms.bySlot.optical > 0);
  assert.ok(atoms.uniforms.bySlot.phase > 0);
});

test('particle instrument prompts get track and detector graphics atoms', () => {
  const spec = createPrototypeSpec(
    'particle collider muon tracks through detector slice with calorimeter pulses'
  );
  const atoms = spec.renderProgram.visualIR.graphicsAtoms;
  const mappingIds = atoms.mappings.map((row) => row.id);
  const geometryIds = atoms.geometry.map((row) => row.id);

  assert.equal(spec.renderProgram.visualIR.sceneKind, 'particle-instrument');
  assert.ok(mappingIds.includes('visual.operator.particle-track-detector.v1'));
  assert.ok(mappingIds.includes('visual.operator.instrument-readout.v1'));
  assert.ok(geometryIds.includes('detector-slice-stack'));
  assert.ok(geometryIds.includes('muon-track-ribbons'));
  assert.ok(atoms.uniforms.bySlot.instrument > 0);
  assert.ok(atoms.uniforms.bySlot.measurement > 0);
});

test('acoustic dust levitation stays acoustic instead of collapsing into granular scene routing', () => {
  const spec = createPrototypeSpec(
    'acoustic levitator dust brass tube standing pressure waves'
  );
  const atoms = spec.renderProgram.visualIR.graphicsAtoms;
  const mappingIds = atoms.mappings.map((row) => row.id);

  assert.equal(spec.renderIR.sceneHint, 'acoustic');
  assert.equal(spec.renderProgram.visualIR.sceneKind, 'acoustic');
  assert.ok(mappingIds.includes('visual.operator.acoustic-wave.v1'));
  assert.ok(atoms.uniforms.bySlot.acoustic > atoms.uniforms.bySlot.granular);
  assert.ok(atoms.wgslOperators.includes('atomAcousticRings'));
});

test('bridge resonance prompts carry structural stress graphics atoms', () => {
  const spec = createPrototypeSpec(
    'bridge resonance under wind vortex shedding with cable tension'
  );
  const atoms = spec.renderProgram.visualIR.graphicsAtoms;
  const mappingIds = atoms.mappings.map((row) => row.id);

  assert.equal(spec.renderProgram.visualIR.sceneKind, 'structural-mechanics');
  assert.ok(mappingIds.includes('visual.operator.stress-fracture.v1'));
  assert.ok(mappingIds.includes('visual.operator.fluid-advection.v1'));
  assert.ok(atoms.uniforms.bySlot.stress > 0);
  assert.ok(atoms.uniforms.bySlot.constraint > 0);
  assert.ok(atoms.wgslOperators.includes('atomStressCracks'));
});

test('visual routing avoids weather, hazard, and material scene false positives', () => {
  const weather = createPrototypeSpec(
    'supercell thunderstorm grows hail under wind shear'
  );
  const weatherMappings = weather.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);
  assert.equal(weather.renderProgram.visualIR.sceneKind, 'weather-atmosphere');
  assert.ok(weatherMappings.includes('visual.operator.fluid-advection.v1'));
  assert.ok(!weatherMappings.includes('visual.operator.biological-growth.v1'));

  const agro = createPrototypeSpec(
    'compost feeds greenhouse nutrient loop with organic waste'
  );
  const agroMappings = agro.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);
  assert.equal(agro.renderProgram.visualIR.sceneKind, 'agro-waste-loop');
  assert.ok(agroMappings.includes('visual.operator.biological-growth.v1'));
  assert.ok(agro.renderProgram.visualIR.graphicsAtoms.uniforms.bySlot.biological > 0);

  const hazard = createPrototypeSpec(
    'hurricane evacuation traffic under storm surge'
  );
  assert.equal(hazard.renderProgram.visualIR.sceneKind, 'hazard-atmosphere');
  assert.notEqual(hazard.renderProgram.visualIR.sceneKind, 'restoration-water');

  const materialTray = createPrototypeSpec(
    'sample tray of water air rock wood metal under force fields'
  );
  assert.equal(materialTray.renderProgram.visualIR.sceneKind, 'material-tray');

  const cultural = createPrototypeSpec(
    'museum preservation pigment film humidity aging'
  );
  assert.equal(cultural.renderProgram.visualIR.sceneKind, 'cultural-material');
});

test('warehouse language does not unlock robot visuals without robot evidence', () => {
  const warehouseFire = createPrototypeSpec(
    'warehouse fire with smoke in concrete stairwell and renderer layers soot'
  );
  const parcelSorting = createPrototypeSpec(
    'sorts parcels in a warehouse queue with conveyor belts'
  );
  const robotWarehouse = createPrototypeSpec(
    'robot arm sorts packages in a warehouse with force sensors and feedback'
  );
  const fireMappings = warehouseFire.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);
  const parcelMappings = parcelSorting.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);
  const robotMappings = robotWarehouse.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);

  assert.ok(fireMappings.includes('visual.operator.thermal-combustion.v1'));
  assert.ok(!fireMappings.includes('visual.operator.robot-contact.v1'));
  assert.ok(parcelMappings.includes('visual.operator.network-flow.v1'));
  assert.ok(!parcelMappings.includes('visual.operator.robot-contact.v1'));
  assert.notEqual(parcelSorting.renderProgram.visualIR.sceneKind, 'robotics-control');
  assert.ok(robotMappings.includes('visual.operator.robot-contact.v1'));
  assert.ok(robotWarehouse.renderProgram.visualIR.graphicsAtoms.languageSignals.length > 0);
});

test('negated visual operator language does not satisfy positive graphics requirements', () => {
  const protein = createPrototypeSpec(
    'protein folding in water with no robot arm'
  );
  const phase = createPrototypeSpec(
    'phase study in a generic lab with no qubits or quantum hardware'
  );
  const proteinMappings = protein.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);
  const phaseMappings = phase.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);
  const phaseSignals = phase.renderProgram.visualIR.graphicsAtoms.languageSignals.map((row) => row.text).join(' ');

  assert.equal(protein.renderProgram.visualIR.sceneKind, 'molecular-biology');
  assert.ok(proteinMappings.includes('visual.operator.biological-growth.v1'));
  assert.ok(!proteinMappings.includes('visual.operator.robot-contact.v1'));
  assert.ok(phaseMappings.includes('visual.operator.phase-transition.v1'));
  assert.ok(!phaseMappings.includes('visual.operator.quantum-phase-readout.v1'));
  assert.doesNotMatch(phaseSignals, /\b(qubit|quantum)\b/);
});

test('Doppler residual hints can steer the selected physical graph', () => {
  const spec = lab.createSpecFromPrompt('quiet demonstration plane', {
    dopplerIntent: {
      schema: 'simulatte.dopplerIntentHints.v1',
      source: 'doppler-test',
      model: { id: 'doppler-test-model', family: 'local-text-graph-delta' },
      primitives: [
        { primitiveId: 'optics-bench', score: 0.99, reason: 'local model inferred optical bench' },
        { primitiveId: 'prism', score: 0.96, reason: 'split beam requested by residual hint' },
      ],
      regimes: ['optical'],
      operators: ['refraction'],
    },
  });
  const ids = new Set(spec.objects.map((object) => object.id));
  const sources = new Set(spec.objects.map((object) => object.source));

  assert.equal(spec.intent.dopplerIntent.schema, 'simulatte.dopplerIntentHints.v1');
  assert.ok(ids.has('optics-bench'));
  assert.ok(ids.has('prism'));
  assert.ok(ids.has('lens'));
  assert.ok(sources.has('doppler-residual'));
  assert.equal(spec.renderProgram.rendererPlan.sceneKind, 'optics');
  assert.equal(spec.physicalSpec.receipt.doppler.model, 'doppler-test-model');
  assert.ok(spec.contract.doppler.primitives.includes('optics-bench'));
});

test('semantic RAG open components enter graph, solver plan, and render programs', () => {
  const spec = createPrototypeSpec(
    'glass lens focusing sunlight through water cooling into a magnetic rotor with protein gel membrane turbulence'
  );
  const openObjects = spec.objects.filter((object) => object.source === 'open-semantic-rag');
  const graphOpenNodes = spec.contract.graph.nodes.filter((node) => node.source === 'open-semantic-rag');
  const programOpenObjects = spec.renderProgram.objects.filter((object) => object.source === 'open-semantic-rag');
  const programSynthObjects = spec.renderProgram.objects.filter((object) => /^embedding-guided-synth/.test(object.source));
  const regimes = new Set(spec.renderProgram.provenance.visualRegimes);

  assert.equal(spec.intent.semanticRag.schema, 'simulatte.semanticRag.v1');
  assert.ok(spec.intent.semanticRag.retrieved.length >= 20);
  assert.ok(openObjects.length >= 4);
  assert.equal(graphOpenNodes.length, openObjects.length);
  assert.ok(programOpenObjects.length >= 1);
  assert.ok(programSynthObjects.length >= 2);
  assert.ok(programOpenObjects.every((object) => object.primitiveProgram));
  assert.ok(regimes.has('optical'));
  assert.ok(regimes.has('fluid'));
  assert.ok(regimes.has('magnetic'));
  assert.ok(spec.modules.includes('soft') || spec.modules.includes('biological'));
  assert.ok(openObjects.some((object) => /protein|gel|membrane/.test(`${object.id} ${object.phrase} ${object.material}`)));
  assert.equal(spec.physicalSpec.executionSource, 'solverGraph');
  assert.ok(spec.physicalSpec.visualStateHints.includes('rayBatch'));
  assert.ok(spec.physicalSpec.visualStateHints.includes('velocity'));
  assert.ok(spec.physicalSpec.quality.score > 0.35);
});

test('semantic surface and grounding libraries cover broad natural language before grounding', () => {
  assert.ok(semanticRagApi.SEMANTIC_SURFACE_CARDS.length >= 600);
  assert.ok(semanticRagApi.GROUNDING_BASIS_CARDS.length >= 70);
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.length >= 650);
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'mouse'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'bridge'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'tornado'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'heart'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'asteroid'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'crop_plant'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'pump'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'fan'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'cup'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'dog'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'hammer'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'airport'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'black_hole'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'gold'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'spacecraft'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'submarine'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'turbine'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'piano'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'castle'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'lava_material'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'algae'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'volcano_environment'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'storm_environment'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'fracturing'));
  assert.ok(graphSynthesis.SURFACE_CARD_LIBRARY.some((card) => card.id === 'supports'));
  assert.ok(semanticRagApi.SEMANTIC_SURFACE_CARDS.every((card) => card.curation && card.curation.schema === 'simulatte.semanticCardCuration.v1'));
  assert.equal(
    semanticRagApi.SEMANTIC_SURFACE_CARDS
      .flatMap((card) => card.groundingIds || [])
      .filter((id) => id.startsWith('ground.'))
      .filter((id) => !semanticRagApi.GROUNDING_BASIS_CARDS.some((card) => card.id === id))
      .length,
    0
  );
});

test('expanded universe vocabulary composes through generated cards', () => {
  const spec = createPrototypeSpec(
    'gold hammer supports glass in a swamp while fracturing near a black hole'
  );
  const synthesis = spec.intent.synthesis;
  const selectedIds = new Set(synthesis.retrieval.selected.map((match) => match.cardId));
  const nodeIds = new Set(synthesis.synthGraph.nodes.map((node) => node.cardId));
  const relationIds = new Set(synthesis.synthGraph.relations.map((relation) => relation.cardId));
  const eventIds = new Set(synthesis.synthGraph.events.map((event) => event.cardId));
  const environmentIds = new Set(synthesis.synthGraph.environment.map((environment) => environment.id));

  assert.equal(synthesis.validation.valid, true);
  assert.ok(selectedIds.has('gold'));
  assert.ok(selectedIds.has('hammer'));
  assert.ok(selectedIds.has('fracturing'));
  assert.ok(selectedIds.has('supports'));
  assert.ok(nodeIds.has('gold'));
  assert.ok(nodeIds.has('hammer'));
  assert.ok(relationIds.has('supports'));
  assert.ok(eventIds.has('fracturing'));
  assert.ok(environmentIds.has('swamp'));
  assert.ok(environmentIds.has('black_hole'));
  assert.ok(synthesis.groundedGraph.primitiveIds.some((entry) => entry.id === 'gold'));
  assert.ok(synthesis.groundedGraph.primitiveIds.some((entry) => entry.id === 'energy-ledger'));
});

test('semantic curation prefers specific prompt objects over generic neighbors', () => {
  const animalRig = semanticRagApi.createSemanticRag(
    'mouse in a hamster wheel crashing into another gerbil in a hamster wheel',
    lab.PHYSICAL_PRIMITIVES,
    { maxSurfaceDocuments: 12, maxSynthNodes: 10 }
  );
  const greenhouse = semanticRagApi.createSemanticRag(
    'greenhouse with tomato plants, irrigation pipes, sunlight, and a fan',
    lab.PHYSICAL_PRIMITIVES,
    { maxSurfaceDocuments: 12, maxSynthNodes: 10 }
  );
  const animalNodeIds = animalRig.synthGraph.nodes.map((node) => node.cardId);
  const greenhouseNodeIds = new Set(greenhouse.synthGraph.nodes.map((node) => node.cardId));
  const wheelCard = animalRig.surfaceRetrieved.find((doc) => doc.cardId === 'artifact.wheel');

  assert.deepEqual(animalNodeIds, [
    'entity.mouse',
    'artifact.hamster-wheel',
    'entity.gerbil',
    'artifact.hamster-wheel',
  ]);
  assert.ok(wheelCard);
  assert.equal(wheelCard.curation.generic, true);
  assert.equal(animalNodeIds.includes('artifact.wheel'), false);
  assert.ok(greenhouseNodeIds.has('environment.greenhouse'));
  assert.ok(greenhouseNodeIds.has('entity.crop-plant'));
  assert.ok(greenhouseNodeIds.has('artifact.pipe-network'));
  assert.ok(greenhouseNodeIds.has('artifact.fan'));
});

test('semantic RAG does not dot model query vectors against local hashed feature vectors', () => {
  const { index } = loadEmbeddingIndex();
  const promptVector = indexedVector(index, 'water');
  const primitiveIndex = {
    id: 'test-normalized-qwen-index',
    documents: [
      { primitiveId: 'water', vector: Array.from(promptVector) },
    ],
  };
  const rag = semanticRagApi.createSemanticRag(
    'dogs and cats swimming in water',
    lab.PHYSICAL_PRIMITIVES,
    {
      primitiveIndex,
      promptVector,
      maxDocuments: 16,
      maxSurfaceDocuments: 12,
    }
  );
  const modelRows = rag.retrieved.filter((row) => row.semanticVectorSpace === 'qwen-model-embedding');
  const surfaceRows = rag.surfaceRetrieved.filter((row) => row.featureVectorSpace === 'simulatte-local-hashed-features');

  assert.ok(modelRows.length > 0);
  assert.ok(surfaceRows.length > 0);
  assert.ok(surfaceRows.every((row) => row.semanticScore === 0));
  assert.ok(surfaceRows.every((row) => row.featureScore >= 0));
});

test('literal training review prompts survive semantic grounding into render objects', () => {
  const animalRag = semanticRagApi.createSemanticRag(
    'dogs and cats swimming',
    lab.PHYSICAL_PRIMITIVES,
    { maxSurfaceDocuments: 12, maxSynthNodes: 10 }
  );
  const animalCardIds = animalRag.synthGraph.nodes.map((node) => node.cardId);
  assert.deepEqual(animalCardIds.slice(0, 2), ['entity.dog', 'entity.cat']);

  const dogs = createPrototypeSpec('dogs');
  const flowers = createPrototypeSpec('flowers');
  const mountains = createPrototypeSpec('trees and mountaints');
  const swimming = createPrototypeSpec('dogs and cats swimming');

  const dogObjects = Object.fromEntries(dogs.renderProgram.objects.map((object) => [object.id, object]));
  const flowerObjects = Object.fromEntries(flowers.renderProgram.objects.map((object) => [object.id, object]));
  const mountainObjects = Object.fromEntries(mountains.renderProgram.objects.map((object) => [object.id, object]));
  const swimmingObjects = Object.fromEntries(swimming.renderProgram.objects.map((object) => [object.id, object]));
  const mappingIds = (spec) => spec.renderProgram.visualIR.graphicsAtoms.mappings.map((row) => row.id);
  const catalogCount = (spec) => spec.renderProgram.objects.filter((object) => object.source === 'catalog').length;
  const geometryKinds = (spec) => spec.physicsIR.entities.map((entity) => entity.geometryRef && entity.geometryRef.kind);

  assert.equal(dogObjects['dog-a'].shape, 'animal-body');
  assert.equal(dogObjects['surface-dog-1'].shape, 'animal-body');
  assert.ok(geometryKinds(dogs).includes('animal-body'));
  assert.equal(dogs.renderProgram.rendererPlan.sceneKind, 'biology');
  assert.ok(mappingIds(dogs).includes('visual.operator.biological-growth.v1'));
  assert.ok(!mappingIds(dogs).includes('visual.operator.instrument-readout.v1'));
  assert.ok(catalogCount(dogs) <= 6);
  assert.ok(!dogs.renderProgram.solverPlan.families.includes('fracture-threshold'));
  assert.equal(flowerObjects['flower-a'].shape, 'fuel-bed');
  assert.equal(flowerObjects['surface-flower-1'].shape, 'fuel-bed');
  assert.ok(geometryKinds(flowers).includes('botanical-cluster'));
  assert.equal(flowers.renderProgram.rendererPlan.sceneKind, 'biology');
  assert.ok(mappingIds(flowers).includes('visual.operator.biological-growth.v1'));
  assert.ok(!mappingIds(flowers).includes('visual.operator.instrument-readout.v1'));
  assert.ok(catalogCount(flowers) <= 6);
  const flowerPacketIdentities = flowers.renderProgram.sceneRenderPacket.entities.map((entity) => entity.identity);
  assert.ok(flowerPacketIdentities.some((identity) => identity.type === 'plant'));
  assert.ok(flowerPacketIdentities.every((identity) => identity.renderClass !== 'water-volume'));
  assert.equal(mountainObjects['tree-a'].shape, 'fuel-bed');
  assert.equal(mountainObjects['environment-mountain'].role, 'mountain');
  assert.equal(mountainObjects['surface-mountain-1'].phrase, 'mountaints');
  assert.equal(mountains.renderProgram.rendererPlan.sceneKind, 'watershed');
  assert.ok(mappingIds(mountains).includes('visual.operator.granular-erosion.v1'));
  assert.ok(mappingIds(mountains).includes('visual.operator.biological-growth.v1'));
  assert.ok(!mappingIds(mountains).includes('visual.operator.instrument-readout.v1'));
  assert.equal(swimmingObjects['dog-a'].shape, 'animal-body');
  assert.equal(swimmingObjects['cat-a'].shape, 'animal-body');
  assert.equal(swimmingObjects.water.shape, 'pool');
  const swimmingIdentities = new Set(
    swimming.renderProgram.visualIR.sceneRenderPacket.entities
      .map((entity) => entity.identity && entity.identity.type)
      .filter(Boolean)
  );
  assert.ok(swimmingIdentities.has('dog'));
  assert.ok(swimmingIdentities.has('cat'));
  assert.ok(swimmingIdentities.has('water'));
  assert.ok(geometryKinds(swimming).every((kind) => kind && kind !== 'body'));
  assert.equal(swimmingObjects['fluid-advection'].source, 'prompt-family');
  assert.equal(swimming.renderProgram.rendererPlan.sceneKind, 'watershed');
  assert.ok(mappingIds(swimming).includes('visual.operator.biological-growth.v1'));
  assert.ok(mappingIds(swimming).includes('visual.operator.fluid-advection.v1'));
  assert.ok(!mappingIds(swimming).includes('visual.operator.instrument-readout.v1'));
  assert.equal(catalogCount(swimming), 0);
});

test('embedding-guided graph synthesis composes unseen animal wheel collision scenes', () => {
  const prompt = 'mouse in a hamster wheel crashing into another gerbil in a hamster wheel';
  const spec = createPrototypeSpec(prompt);
  const synthesis = spec.intent.synthesis;
  const objectIds = new Set(spec.objects.map((object) => object.id));
  const renderIds = spec.renderProgram.objects.map((object) => object.id);
  const primitiveIds = new Set(synthesis.groundedGraph.primitiveIds.map((entry) => entry.id));

  assert.equal(synthesis.schema, 'simulatte.embeddingGuidedGraphSynthesis.v1');
  assert.equal(synthesis.validation.valid, true);
  assert.deepEqual(synthesis.synthGraph.nodes.map((node) => [node.id, node.cardId, node.nodeType]), [
    ['mouse_a', 'mouse', 'entity'],
    ['hamster_wheel_a', 'hamster_wheel', 'assembly'],
    ['gerbil_a', 'gerbil', 'entity'],
    ['hamster_wheel_b', 'hamster_wheel', 'assembly'],
  ]);
  assert.deepEqual(synthesis.synthGraph.relations.map((relation) => [relation.type, relation.participants]), [
    ['inside', ['mouse_a', 'hamster_wheel_a']],
    ['inside', ['gerbil_a', 'hamster_wheel_b']],
  ]);
  assert.deepEqual(synthesis.synthGraph.events.map((event) => [event.type, event.participants]), [
    ['collision', ['hamster_wheel_a', 'hamster_wheel_b']],
  ]);
  for (const id of ['soft-body', 'wheel', 'collision', 'friction', 'energy-ledger']) {
    assert.ok(primitiveIds.has(id), `missing grounded primitive ${id}`);
  }
  for (const id of ['mouse-a', 'hamster-wheel-a', 'gerbil-a', 'hamster-wheel-b', 'collision-1']) {
    assert.ok(objectIds.has(id), `missing synthesized object ${id}`);
  }
  assert.deepEqual(renderIds.slice(0, 5), [
    'mouse-a',
    'hamster-wheel-a',
    'gerbil-a',
    'hamster-wheel-b',
    'collision-1',
  ]);
  assert.equal(spec.renderProgram.rendererPlan.sceneKind, 'mechanical');
  assert.ok(spec.renderProgram.solverPlan.families.includes('constraint-dynamics'));
});

test('composition render programs do not collapse into one generic shape vocabulary', () => {
  const prompts = [
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall',
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor',
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger',
  ];
  const signatures = prompts.map((prompt) => {
    const spec = lab.createSpecFromPrompt(prompt);
    return new Set(spec.renderProgram.objects.map((object) => object.shape));
  });

  assert.ok(signatures[0].has('fuel-bed'));
  assert.ok(!signatures[0].has('prism'));
  assert.ok(signatures[1].has('prism'));
  assert.ok(!signatures[1].has('queue-node'));
  assert.ok(signatures[2].has('queue-node'));
  assert.ok(!signatures[2].has('flame-front'));
});

test('building fire keeps a structural building mixed with fire visuals', () => {
  const fire = lab.createSpecFromPrompt('fire');
  const buildingFire = lab.createSpecFromPrompt('building fire');
  const warehouseFire = lab.createSpecFromPrompt('warehouse fire with smoke in concrete stairwell');
  const buildingObjects = buildingFire.renderProgram.objects.filter((object) => object.shape === 'building');
  const warehouseObjects = warehouseFire.renderProgram.objects.filter((object) => object.shape === 'building');
  const fireShapes = new Set(fire.renderProgram.objects.map((object) => object.shape));
  const buildingFireShapes = new Set(buildingFire.renderProgram.objects.map((object) => object.shape));

  assert.equal(buildingFire.promptParse.spans.some((span) => span.text === 'building'), true);
  assert.ok(buildingObjects.length >= 1);
  assert.ok(warehouseFire.promptParse.spans.some((span) => span.text === 'warehouse'));
  assert.ok(warehouseFire.promptParse.spans.some((span) => span.text === 'stairwell'));
  assert.ok(warehouseObjects.length >= 1);
  assert.ok(buildingFire.renderProgram.objects.some((object) => object.shape === 'flame-front'));
  assert.ok(warehouseFire.renderProgram.objects.some((object) => object.shape === 'flame-front'));
  assert.ok(!fireShapes.has('building'));
  assert.ok(buildingFireShapes.has('building'));
  assert.notDeepEqual([...buildingFireShapes].sort(), [...fireShapes].sort());
});

test('render programs keep prompt nouns literal and avoid unrelated scene fields', () => {
  const thinFilm = lab.createSpecFromPrompt('soap thin film with air bubbles in wire loops');
  const animalRig = lab.createSpecFromPrompt('mouse in a wheel crashes into a wall');
  const mixedScene = lab.createSpecFromPrompt(
    'gold hammer supports glass in a swamp while fracturing near a black hole'
  );
  const city = lab.createSpecFromPrompt('city market queue traffic network');
  const watershed = lab.createSpecFromPrompt('rain erodes a mountain watershed into sediment channels');
  const ferrofluid = lab.createSpecFromPrompt('ferrofluid with copper coil and pulsing current');

  const thinById = Object.fromEntries(thinFilm.renderProgram.objects.map((object) => [object.id, object]));
  const rigById = Object.fromEntries(animalRig.renderProgram.objects.map((object) => [object.id, object]));
  const mixedById = Object.fromEntries(mixedScene.renderProgram.objects.map((object) => [object.id, object]));

  assert.equal(thinById['open-soap-thin-film-1'].shape, 'film');
  assert.equal(thinById['open-air-bubbles-2'].shape, 'bubble');
  assert.equal(thinById['open-wire-loops-3'].shape, 'wire-loop');
  assert.equal(rigById['mouse-a'].shape, 'animal-body');
  assert.equal(rigById['wheel-a'].shape, 'wheel');
  assert.ok(Math.abs(rigById['mouse-a'].pose.x - rigById['wheel-a'].pose.x) < 0.03);
  assert.ok(rigById.collision.pose.x > rigById['wheel-a'].pose.x);
  assert.equal(mixedById['gold-a'].shape, 'bar');
  assert.equal(mixedById['gold-a'].material, 'gold');
  assert.equal(mixedById['hammer-a'].shape, 'hammer');
  assert.equal(mixedById['glass-material-a'].shape, 'lens');
  assert.equal(mixedById['glass-material-a'].material, 'glass');
  assert.equal(mixedById['environment-swamp'].shape, 'wetland');
  assert.equal(mixedById['environment-black-hole'].shape, 'singularity');
  assert.equal(mixedScene.renderProgram.rendererPlan.sceneKind, 'planetary-space');
  assert.equal(ferrofluid.renderProgram.objects.find((object) => object.id === 'ferrofluid-a').shape, 'pool');
  assert.equal(ferrofluid.renderProgram.objects.find((object) => object.id === 'ferrofluid-a').material, 'ferrofluid');
  assert.deepEqual(city.renderProgram.fields.map((field) => field.kind), ['network-flow']);
  assert.deepEqual(watershed.renderProgram.fields.map((field) => field.kind), ['flow', 'gravity']);
  assert.deepEqual(ferrofluid.renderProgram.fields.map((field) => field.kind), ['dipole']);
  assert.deepEqual(thinFilm.renderProgram.fields.map((field) => field.kind), ['optical-rays']);
});

test('expanded universe prompts preserve specific generated simulation objects', () => {
  const cosmic = lab.createSpecFromPrompt(
    'spaceship orbiting a volcano while crystal towers melt lava into a river'
  );
  const acousticCastle = lab.createSpecFromPrompt(
    'quantum piano bends laser light through an ice castle'
  );
  const undersea = lab.createSpecFromPrompt(
    'submarine city under a storm with turbines and glowing algae'
  );
  const lavaBridge = lab.createSpecFromPrompt(
    'clockwork bridge over lava with mirrors and falling sand'
  );

  const cosmicShapes = new Set(cosmic.renderProgram.objects.map((object) => object.shape));
  const acousticShapes = new Set(acousticCastle.renderProgram.objects.map((object) => object.shape));
  const underseaShapes = new Set(undersea.renderProgram.objects.map((object) => object.shape));
  const bridgeById = Object.fromEntries(lavaBridge.renderProgram.objects.map((object) => [object.id, object]));

  assert.equal(cosmic.renderProgram.rendererPlan.sceneKind, 'thermal-plume');
  assert.ok(cosmicShapes.has('rocket'));
  assert.ok(cosmicShapes.has('volcano'));
  assert.ok(cosmicShapes.has('tower'));
  assert.ok(cosmicShapes.has('lava-flow'));
  assert.ok(acousticShapes.has('instrument'));
  assert.ok(acousticShapes.has('castle'));
  assert.ok(acousticShapes.has('lens'));
  assert.ok(underseaShapes.has('submarine'));
  assert.ok(underseaShapes.has('storm'));
  assert.ok(underseaShapes.has('turbine'));
  assert.ok(underseaShapes.has('plant-cluster'));
  assert.equal(bridgeById['gearbox-a'].shape, 'wheel');
  assert.equal(bridgeById['bridge-a'].shape, 'bridge');
  assert.equal(bridgeById['lava-material-a'].shape, 'lava-flow');
  assert.ok(undersea.renderProgram.solverPlan.families.includes('growth-diffusion'));
  assert.ok(cosmic.renderProgram.solverPlan.families.includes('phase-boundary'));
});

test('compiled render programs keep objects positioned inside the visible world', () => {
  const prompts = [
    'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun',
    'forest fire with wood biomass, flame, smoke, wind field, water, and rock wall',
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor',
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger',
    'mountain watershed with river erosion, terrain patch, sand, soil, rock, water, and gravity',
    'thermal plume bends smoke over cooling fins',
    'ferrofluid spikes around copper coils under pulsing current',
    'granular beads avalanche through a vibrating sieve',
    'soap film colors stretch around air bubbles and wire loops',
  ];

  for (const prompt of prompts) {
    const spec = lab.createSpecFromPrompt(prompt);
    for (const object of spec.renderProgram.objects) {
      const center = renderObjectCenter(object);
      assert.ok(center.x >= 0.06 && center.x <= 0.94, `${object.id} x ${center.x}`);
      assert.ok(center.y >= 0.06 && center.y <= 0.94, `${object.id} y ${center.y}`);
    }
  }
});

test('solar magnetic machine places core mechanism parts in physical relation', () => {
  const spec = lab.createSpecFromPrompt(
    'build a solar magnetic perpetual motion machine with a moving magnetic slider powered by the sun'
  );
  const byId = Object.fromEntries(spec.renderProgram.objects.map((object) => [object.id, object]));
  const wheel = renderObjectCenter(byId['rotor-wheel']);
  const slider = renderObjectCenter(byId['stator-slider']);
  const panel = renderObjectCenter(byId['solar-panel']);
  const load = renderObjectCenter(byId['motor-load']);

  assert.ok(wheel.x > 0.42 && wheel.x < 0.58);
  assert.ok(wheel.y > 0.42 && wheel.y < 0.58);
  assert.ok(slider.x > wheel.x);
  assert.ok(panel.x < wheel.x && panel.y < wheel.y);
  assert.ok(load.x > wheel.x && load.y > wheel.y);
});

function renderObjectCenter(object) {
  assert.ok(object, 'render object missing');
  const pose = object.pose || {};
  if (Array.isArray(pose.points) && pose.points.length) {
    const sum = pose.points.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
    return { x: sum[0] / pose.points.length, y: sum[1] / pose.points.length };
  }
  return { x: pose.x || 0.5, y: pose.y || 0.5 };
}

test('component state ownership is initialized and stepped by component id', () => {
  const spec = lab.createSpecFromPrompt(
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger'
  );
  const initial = lab.createSimulationState(spec);
  const next = lab.stepSimulation(initial, spec, 1 / 60);

  assert.ok(initial.componentStates['market-queue']);
  assert.ok(Number.isFinite(initial.componentStates['market-queue'].backlog));
  assert.ok(next.componentStates['market-queue'].backlog >= initial.componentStates['market-queue'].backlog);
  assert.ok(spec.contract.graph.operators.some((operator) => operator.id === 'queueService'));
  assert.ok(spec.contract.graph.conservation.some((rule) => rule.id === 'queue-inventory'));
});

test('graph validity reports repairs for invalid raw material and queue compositions', () => {
  const spec = lab.createSpecFromPrompt('rock served by queue');
  const validation = spec.contract.graph.validation;

  assert.equal(validation.status, 'repaired');
  assert.ok(validation.warnings.some((warning) => warning.includes('rock cannot be served')));
  assert.ok(validation.repairs.some((repair) => repair.includes('logistics-node')));
});

test('scene layout grammar and contextual gauges vary by requested world type', () => {
  const optics = lab.createSpecFromPrompt(
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor'
  );
  const watershed = lab.createSpecFromPrompt(
    'mountain watershed with river erosion, terrain patch, sand, soil, rock, water, and gravity'
  );
  const city = lab.createSpecFromPrompt(
    'city grid with traffic system, power grid, market queue, sensors, delays, and conservation ledger'
  );

  assert.equal(optics.contract.layout.grammar, 'bench');
  assert.ok(optics.contract.interactions.some((rule) => rule.id === 'glass-refracts-light'));
  assert.ok(lab.readoutLabelsForSpec(optics).includes('refraction'));
  assert.equal(watershed.contract.layout.grammar, 'downhill channel');
  assert.ok(watershed.contract.interactions.some((rule) => rule.id === 'water-carries-erosion'));
  assert.ok(lab.readoutLabelsForSpec(watershed).includes('erosion rate'));
  assert.equal(city.contract.layout.grammar, 'orthogonal network');
  assert.ok(lab.readoutLabelsForSpec(city).includes('queue backlog'));
});

test('layer contracts survive spec export and import', () => {
  const spec = lab.createSpecFromPrompt(
    'lab bench optics bench with sun lamp, glass lens, mirror, prism, and sensor'
  );
  const restored = lab.deserializeSpec(lab.serializeSpec(spec));
  const lens = restored.objects.find((object) => object.id === 'lens');

  assert.equal(restored.contract.schema, 'simulatte.layerContract.v1');
  assert.deepEqual(restored.contract.readouts, spec.contract.readouts);
  assert.equal(restored.contract.materials.glass.refractiveIndex, 1.52);
  assert.equal(lens.geometry.shape, 'surface');
  assert.ok(lens.ports.outputs.includes('light'));
});

test('blank world is an empty construction plane, not a machine seed', () => {
  const spec = lab.createSpec('blank-world');
  const state = lab.stepSimulation(lab.createSimulationState(spec), spec, 1 / 60);
  const readouts = lab.readoutValues(state, spec);

  assert.equal(spec.templateId, 'blank-world');
  assert.equal(spec.modules.length, 0);
  assert.equal(spec.objects.length, 0);
  assert.deepEqual(Object.keys(readouts), ['modules', 'objects', 'forces', 'sources', 'sinks', 'canvas']);
  for (const value of Object.values(readouts)) {
    assert.ok(Number.isFinite(Number(value)), `blank readout ${value} should be finite`);
  }
});

test('flow seed remains visually and structurally separate from machine seed', () => {
  const flow = lab.createSpec('fluid-vortex');
  const machine = lab.createSpec('magnetic-wheel');

  assert.equal(flow.templateId, 'fluid-vortex');
  assert.ok(flow.modules.includes('fluid'));
  assert.ok(flow.objects.some((object) => object.id === 'fluid-particles'));
  assert.ok(!flow.modules.includes('electromagnetism'));
  assert.ok(machine.modules.includes('electromagnetism'));
});

test('all built-in templates step with finite readouts', () => {
  for (const template of lab.TEMPLATE_LIBRARY) {
    const spec = lab.createSpec(template.id);
    let state = lab.createSimulationState(spec);
    for (let i = 0; i < 120; i += 1) {
      state = lab.stepSimulation(state, spec, 1 / 60);
    }
    const readouts = lab.readoutValues(state, spec);
    assert.equal(Object.keys(readouts).length, template.readouts.length);
    for (const value of Object.values(readouts)) {
      assert.ok(Number.isFinite(Number(value)), `${template.id} readout ${value} should be finite`);
    }
  }
});

test('solar magnetic wheel advances with finite physical state', () => {
  let state = lab.createState();
  for (let i = 0; i < 240; i += 1) {
    state = lab.stepState(state, state.params, 1 / 60);
  }
  const ledger = lab.energyLedger(state);

  assert.ok(Number.isFinite(state.theta));
  assert.ok(Number.isFinite(state.omega));
  assert.ok(Number.isFinite(ledger.rpm));
  assert.ok(ledger.solarInputJ > 0);
  assert.ok(ledger.actuatorWorkJ >= 0);
  assert.ok(ledger.frictionLossJ >= 0);
});

test('zero sun prevents hidden actuator energy injection', () => {
  let state = lab.createState({ irradiance: 0, magneticStrength: 1.2, sliderAmplitude: 1 });
  for (let i = 0; i < 180; i += 1) {
    state = lab.stepState(state, state.params, 1 / 60);
  }
  const ledger = lab.energyLedger(state);

  assert.equal(ledger.solarInputJ, 0);
  assert.equal(ledger.actuatorWorkJ, 0);
  assert.equal(ledger.solarBufferJ, 0);
});

test('load output remains bounded by tracked input and stored motion', () => {
  let state = lab.createState({ irradiance: 900, loadTorque: 0.24 });
  for (let i = 0; i < 360; i += 1) {
    state = lab.stepState(state, state.params, 1 / 60);
  }
  const ledger = lab.energyLedger(state);
  const accountedEnergy =
    ledger.actuatorWorkJ +
    ledger.wheelKineticJ +
    ledger.frictionLossJ +
    ledger.generatorLossJ +
    ledger.solarBufferJ;

  assert.ok(ledger.loadOutputJ <= ledger.solarInputJ + accountedEnergy + 1e-6);
});
