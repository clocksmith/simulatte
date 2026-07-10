const {
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
  testDopplerStorageModule,
  manifestFacade,
  withIntentArtifactFetch,
  createPrototypeSpec,
  assertVisualIRCase,
} = require('./physics-lab-fixture.cjs');

test('model-backed intent retrieval cosine-normalizes query and index vectors', async () => {
  const hash = {
    alg: 'sha256',
    hex: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  };
  const modelRuntimeLock = {
    schema: 'simulatte.modelRuntimeLock.v1',
    id: 'synthetic-runtime-lock',
    number: 1,
    doppler: {
      moduleUrl: '../../vendor/doppler/src/index-browser.js',
      storageModuleUrl: '../../vendor/doppler/src/tooling-exports/storage.js',
      kernelBasePath: '../../vendor/doppler/src/gpu/kernels',
      package: {
        name: 'doppler-gpu',
        version: '0.4.7',
        integrity: 'synthetic-integrity',
        fileCount: 1,
      },
    },
    embedding: {
      id: 'synthetic-last-pooled-transformer',
      family: 'synthetic',
      modelType: 'transformer',
      dimensions: 2,
      indexEmbeddingMode: 'last',
      defaultModelBaseUrl: 'https://simulatte.test/resolve/rev/models/synthetic',
      source: { revision: 'rev', path: 'models/synthetic' },
      manifestHash: hash,
      conversion: {
        projectPath: 'public/vendor/doppler/synthetic-embedding.json',
        sha256: '0000000000000000000000000000000000000000000000000000000000000000',
      },
      runtimeConfig: { inference: {} },
    },
    reranker: {
      schema: 'simulatte.intentRerankerConfig.v1',
      id: 'synthetic-reranker',
      kind: 'doppler-reranker',
      phase: 3,
      required: true,
      maxCandidatesPerCall: 8,
      maxSlotCandidatesPerCall: 4,
      model: {
        id: 'synthetic-reranker-model',
        defaultModelBaseUrl: 'https://simulatte.test/resolve/rev/models/synthetic-reranker',
        source: { revision: 'rev', path: 'models/synthetic-reranker' },
        manifestHash: hash,
      },
      conversion: {
        projectPath: 'public/vendor/doppler/synthetic-reranker.json',
        sha256: '0000000000000000000000000000000000000000000000000000000000000000',
      },
      runtimeConfig: { inference: {} },
    },
    runtimeOrder: ['doppler-browser-load'],
    runtime: {
      queryEmbeddingMode: 'last',
      embeddingText: {
        schema: 'simulatte.embeddingTextContract.v1',
      },
      requireModelBackedQuery: true,
    },
    cache: {
      storage: ['Doppler', 'OPFS'],
      namespace: 'synthetic-runtime-lock-1',
      owner: 'doppler',
      prefetch: true,
      strategy: 'doppler-opfs-verified',
      requirePersistent: true,
    },
  };
  const modelRuntimeLockText = JSON.stringify(modelRuntimeLock);
  const manifest = {
    schema: 'simulatte.modelBackedEmbedderManifest.v3',
    id: 'simulatte-synthetic-cosine-retrieval-v1',
    modelRuntimeLock: {
      id: modelRuntimeLock.id,
      number: modelRuntimeLock.number,
      artifact: './model-runtime-lock.json',
      artifactHash: {
        alg: 'sha256',
        hex: crypto.createHash('sha256').update(modelRuntimeLockText).digest('hex'),
      },
    },
    retrieval: {
      kind: 'precomputed-primitive-index',
      artifact: './synthetic-index.json',
      rerank: 'mandatory',
    },
  };
  const index = {
    schema: 'simulatte.primitiveEmbeddingIndex.v2',
    id: 'simulatte-synthetic-cosine-index-v1',
    embedModelId: modelRuntimeLock.embedding.id,
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
    if (value.includes('/model-runtime-lock.json')) return new Response(modelRuntimeLockText, { status: 200 });
    if (value.endsWith('/synthetic-index.json')) return new Response(JSON.stringify(index), { status: 200 });
    return new Response('not found', { status: 404 });
  };
  try {
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      embedProvider: probeAwareEmbedProvider({
        index,
        targetVector: Float32Array.from([4, 0]),
        embedModelId: modelRuntimeLock.embedding.id,
        embedModelHash: hash,
      }),
      rerankProvider: testRerankProvider(),
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

test('Phase 1 resolves only the selected numbered model runtime lock', async () => {
  await withIntentArtifactFetch(async ({ rawManifest, modelRuntimeLock }) => {
    rawManifest.modelRuntimeLock.number = modelRuntimeLock.number + 1;
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
    });

    await assert.rejects(() => embedder.loadModel(), /model runtime lock number mismatch/);
  });

  await withIntentArtifactFetch(async ({ rawManifest }) => {
    rawManifest.runtime = { queryEmbeddingMode: 'last' };
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
    });

    await assert.rejects(() => embedder.loadModel(), /must reference modelRuntimeLock instead of declaring model runtime policy inline/);
  });
});

test('model source overrides and residual text-model execution fail closed', async () => {
  assert.throws(() => intentEmbedder.create({
    manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
    modelBaseUrl: 'https://example.test/not-the-lock',
  }), /model runtime lock forbids source overrides/);

  await assert.rejects(
    () => dopplerIntent.analyzePrompt('a model-selected hint', [], { dopplerEnabled: true }),
    /numbered model runtime lock owns all Doppler model execution/
  );
});

test('Phase 4 receipts inherit the selected runtime lock number from Phase 1', () => {
  const { modelRuntimeLock } = loadEmbeddingIndex();
  const brief = intentForensics.buildIntentForensics({
    prompt: 'a copper coil heats a ferrofluid lens',
    embeddingModel: { id: modelRuntimeLock.embedding.id },
    intentRerank: { model: modelRuntimeLock.reranker.id },
    promptRuntimeReceipt: {
      modelId: modelRuntimeLock.embedding.id,
      reranker: modelRuntimeLock.reranker.id,
      modelRuntimeLock: {
        id: modelRuntimeLock.id,
        number: modelRuntimeLock.number,
      },
    },
  });

  assert.equal(brief.modelStack.modelRuntimeLockId, modelRuntimeLock.id);
  assert.equal(brief.modelStack.modelRuntimeLockNumber, modelRuntimeLock.number);
  assert.equal(brief.modelStack.retrieval, modelRuntimeLock.embedding.id);
  assert.equal(brief.modelStack.reranker, modelRuntimeLock.reranker.id);
});

test('Phase 1 refuses embedding and reranker handles with a nonlocked hash', async () => {
  await withIntentArtifactFetch(async ({ manifest, index }) => {
    const query = indexedVector(index, 'optics-bench');
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      dopplerModelHandle: {
        modelId: manifest.embedModel.id,
        manifest: {
          manifestHash: { alg: 'sha256', hex: '0'.repeat(64) },
        },
        async embed(prompt) {
          return { embedding: probeAwareVector(index, prompt, query) };
        },
      },
    });

    await assert.rejects(() => embedder.loadModel(), /embedding model handle manifest hash does not match the model runtime lock/);
  });

  await withIntentArtifactFetch(async ({ manifest, index }) => {
    const query = indexedVector(index, 'optics-bench');
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      embedProvider: probeAwareEmbedProvider({ index, targetVector: query }),
      dopplerModule: {
        async load() {
          return {
            modelId: manifest.reranker.model.id,
            manifest: {
              manifestHash: { alg: 'sha256', hex: '0'.repeat(64) },
              inference: { rerank: { trueTokenId: 1, falseTokenId: 0 } },
            },
            rerank(input = {}) {
              return (input.candidates || []).map((candidate) => ({
                primitiveId: candidate.primitiveId,
                score: 1,
              }));
            },
          };
        },
      },
      dopplerStorageModule: testDopplerStorageModule(),
    });

    await assert.rejects(() => embedder.loadModel(), /reranker model handle manifest hash does not match the model runtime lock/);
  }, { rerankProvider: null });
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
    assert.ok(result.priors.some((prior) => /prism/.test(prior.primitiveId)));
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
        assert.equal(options.embeddingMode, 'last');
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
        assert.equal(options.embeddingMode, 'last');
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

    await assert.rejects(() => embedder.loadModel(), /model runtime lock reranker model id, URL, source, and manifest hash are required/);
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
            manifestHash: manifest.reranker.model.manifestHash,
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
      dopplerStorageModule: testDopplerStorageModule(),
    });

    const runtime = await embedder.loadModel();

    assert.equal(loadCalls.length, 1);
    assert.deepEqual(Object.keys(loadCalls[0].model), [
      'manifest',
      'manifestText',
      'manifestHash',
      'baseUrl',
      'storageContext',
      'storageManifest',
      'storageBaseUrl',
    ]);
    assert.match(loadCalls[0].model.baseUrl, /qwen-3-reranker-0-6b-q4k-ehf16-af32$/);
    assert.equal(loadCalls[0].model.manifestHash, manifest.reranker.model.manifestHash.hex);
    assert.equal(typeof loadCalls[0].model.storageContext.close, 'function');
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

test('Doppler reranker fallback caps candidates and resets state around every prefill', async () => {
  const scope = globalThis.__SimulatteIntentEmbedderRefactorScope;
  let sequenceLength = 7;
  let resetCount = 0;
  let prefillCount = 0;
  const progressRows = [];
  const handle = {
    manifest: {
      inference: {
        rerank: {
          trueTokenId: 1,
          falseTokenId: 0,
          score: 'logit_difference',
        },
      },
    },
    resetGenerationState() {
      sequenceLength = 0;
      resetCount += 1;
    },
    advanced: {
      async prefillWithLogits(_prompt, options = {}) {
        assert.equal(sequenceLength, 0);
        assert.equal(options.__skipStateSnapshot, true);
        sequenceLength = 3;
        prefillCount += 1;
        return { logits: Float32Array.from([0.25, 0.75]) };
      },
    },
  };
  const provider = scope.rerankProviderFromModelHandle(handle, { index: null }, {
    id: 'controlled-reranker',
    maxCandidatesPerCall: 3,
    maxSlotCandidatesPerCall: 2,
  }, 'test-reranker');
  const rows = await provider.rerank({
    schema: 'simulatte.intentRerankInput.v1',
    prompt: 'rank these candidates',
    max: 8,
    candidates: Array.from({ length: 8 }, (_, index) => ({
      primitiveId: `candidate-${index}`,
      candidateText: `candidate document ${index}`,
    })),
    onProgress: (row) => progressRows.push(row),
  });

  assert.equal(rows.length, 3);
  assert.equal(prefillCount, 3);
  assert.equal(resetCount, 6);
  assert.equal(sequenceLength, 0);
  assert.deepEqual(progressRows.map((row) => row.completed), [1, 2, 3]);
});

test('contrastive top-k reranking retains local scores for unevaluated candidates', () => {
  const scope = globalThis.__SimulatteIntentEmbedderRefactorScope;
  const localPriors = [
    { primitiveId: 'evaluated', score: 0.9, modelScore: 0.9 },
    { primitiveId: 'literal-tail', score: 0.8, modelScore: 0.8 },
  ];
  const reranked = scope.applyModelRerank(
    localPriors,
    [{ primitiveId: 'evaluated', score: 0.7, rank: 0 }],
    [{ primitiveId: 'evaluated' }]
  );
  const literalTail = reranked.find((row) => row.primitiveId === 'literal-tail');
  assert.equal(literalTail.score, 0.8);
  assert.equal(literalTail.modelRerankEvaluated, false);
  assert.match(literalTail.modelRerankReason, /outside model top-k/);

  const localSlots = [
    { candidateId: 'evaluated-slot', score: 0.9 },
    { candidateId: 'literal-slot-tail', score: 0.75 },
  ];
  const rerankedSlots = scope.applySlotModelRerank(
    localSlots,
    [{ primitiveId: 'evaluated-slot', score: 0.7, rank: 0 }],
    [{ primitiveId: 'evaluated-slot' }]
  );
  const slotTail = rerankedSlots.find((row) => row.candidateId === 'literal-slot-tail');
  assert.equal(slotTail.score, 0.75);
  assert.equal(slotTail.modelRerankEvaluated, false);
  assert.match(slotTail.modelRerankReason, /outside model top-k/);
});

test('Phase 1 loads Doppler embedding from the verified cached manifest source', async () => {
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
      dopplerStorageModule: testDopplerStorageModule(),
      onProgress: (event) => events.push(event),
    });

    const runtime = await embedder.loadModel();

    assert.equal(loadCalls.length, 1);
    assert.deepEqual(Object.keys(loadCalls[0].model), [
      'manifest',
      'manifestText',
      'manifestHash',
      'baseUrl',
      'storageContext',
      'storageManifest',
      'storageBaseUrl',
    ]);
    assert.equal(loadCalls[0].model.baseUrl, manifest.embedModel.defaultModelBaseUrl);
    assert.equal(loadCalls[0].model.manifestHash, manifest.embedModel.manifestHash.hex);
    assert.equal(typeof loadCalls[0].model.storageContext.close, 'function');
    assert.deepEqual(loadCalls[0].runtimeConfig, manifest.runtime.runtimeConfig);
    assert.equal(events.some((event) => event.source === 'simulatte-model-cache'), false);
    assert.equal(runtime.promptRuntimeReceipt.providerReady, true);
    assert.equal(runtime.promptRuntimeReceipt.providerBackend, 'doppler-browser-load');
    assert.equal(runtime.promptRuntimeReceipt.cachePrefetch, true);
    assert.equal(runtime.promptRuntimeReceipt.cacheMode, 'opfs');
    assert.equal(runtime.promptRuntimeReceipt.cacheOwner, 'doppler');
    assert.equal(runtime.promptRuntimeReceipt.cacheVerified, true);
    assert.equal(runtime.promptRuntimeReceipt.embeddingCacheState, 'verified-hit');
  });
});

test('Phase 1 overlaps required Doppler embedding and reranker loads', async () => {
  await withIntentArtifactFetch(async ({ manifest, index }) => {
    const query = indexedVector(index, 'optics-bench');
    const loadRoles = [];
    let embeddingResolved = false;
    let rerankerStartedBeforeEmbeddingResolved = false;
    let releaseEmbedding = null;
    let releaseReranker = null;
    let resolveBothStarted = null;
    const bothStarted = new Promise((resolve) => {
      resolveBothStarted = resolve;
    });
    const markStarted = () => {
      if (loadRoles.length === 2) resolveBothStarted();
    };
    const dopplerModule = {
      async load(model, options = {}) {
        const url = String(model && (model.baseUrl || model.url) || '');
        if (url === manifest.embedModel.defaultModelBaseUrl) {
          loadRoles.push(`embedding:${options.isolatedLoader === true ? 'isolated' : 'shared'}`);
          markStarted();
          return new Promise((resolve) => {
            releaseEmbedding = () => {
              embeddingResolved = true;
              resolve({
                modelId: manifest.embedModel.id,
                manifest: { manifestHash: manifest.embedModel.manifestHash },
                async embed(prompt) {
                  return { embedding: probeAwareVector(index, prompt, query) };
                },
              });
            };
          });
        }
        if (url === manifest.reranker.model.defaultModelBaseUrl) {
          rerankerStartedBeforeEmbeddingResolved = !embeddingResolved;
          loadRoles.push(`reranker:${options.isolatedLoader === true ? 'isolated' : 'shared'}`);
          markStarted();
          return new Promise((resolve) => {
            releaseReranker = () => resolve({
              modelId: manifest.reranker.model.id,
              manifest: {
                manifestHash: manifest.reranker.model.manifestHash,
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
            });
          });
        }
        throw new Error(`unexpected Doppler model URL ${url}`);
      },
    };
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      dopplerModule,
      dopplerStorageModule: testDopplerStorageModule(),
    });

    const loadPromise = embedder.loadModel();
    await bothStarted;

    assert.deepEqual(loadRoles.sort(), ['embedding:isolated', 'reranker:isolated']);
    assert.equal(embeddingResolved, false);
    assert.equal(rerankerStartedBeforeEmbeddingResolved, true);
    releaseEmbedding();
    releaseReranker();
    const runtime = await loadPromise;

    assert.equal(runtime.promptRuntimeReceipt.providerReady, true);
    assert.equal(runtime.promptRuntimeReceipt.rerankerReady, true);
  }, { rerankProvider: null });
});

test('Phase 1 keeps Doppler embedding resident while the reranker is loaded', async () => {
  await withIntentArtifactFetch(async ({ manifest, index }) => {
    const query = indexedVector(index, 'optics-bench');
    const loadRoles = [];
    let activeRole = '';
    let staleEmbeddingCalls = 0;
    const dopplerModule = {
      async load(model, options = {}) {
        const url = String(model && (model.baseUrl || model.url) || '');
        const isolated = options.isolatedLoader === true;
        if (url === manifest.embedModel.defaultModelBaseUrl) {
          if (!isolated) activeRole = 'embedding';
          loadRoles.push(`embedding:${isolated ? 'isolated' : 'shared'}`);
          return {
            modelId: manifest.embedModel.id,
            manifest: { manifestHash: manifest.embedModel.manifestHash },
            async embed(prompt) {
              if (!isolated && activeRole !== 'embedding') {
                staleEmbeddingCalls += 1;
                return { embedding: new Float32Array(index.embeddingDim) };
              }
              return { embedding: probeAwareVector(index, prompt, query) };
            },
          };
        }
        if (url === manifest.reranker.model.defaultModelBaseUrl) {
          if (!isolated) activeRole = 'reranker';
          loadRoles.push(`reranker:${isolated ? 'isolated' : 'shared'}`);
          return {
            modelId: manifest.reranker.model.id,
            manifest: {
              manifestHash: manifest.reranker.model.manifestHash,
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
      dopplerStorageModule: testDopplerStorageModule(),
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
    assert.ok(loadRoles.includes('embedding:isolated'));
    assert.ok(loadRoles.includes('reranker:isolated'));
    assert.equal(loadRoles.filter((role) => role.startsWith('embedding:')).length, 1);
    assert.equal(staleEmbeddingCalls, 0);
  }, { rerankProvider: null });
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

    assert.ok(rerankCalls >= 2);
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

    const phase3 = lab.runPhase3Retrieval(phase2, { retrievalEvidence: result });
    const phase3Slots = phase3.artifact.retrievalRerankResult.slotEvidence;
    const groundedDogSlot = phase3Slots.find((row) => row.slotId === 'slot.actor.dog');
    const groundedCatSlot = phase3Slots.find((row) => row.slotId === 'slot.actor.cat');
    assert.ok(groundedDogSlot.acceptedCandidates.some((row) => (
      row.source === 'prompt-typed-slot' && row.candidateText === 'dog'
    )));
    assert.ok(groundedCatSlot.acceptedCandidates.some((row) => (
      row.source === 'prompt-typed-slot' && row.candidateText === 'cat'
    )));
    assert.ok(groundedDogSlot.acceptedCandidates.every((row) => (
      /\bdog\b|surface-dog/.test(`${row.candidateId} ${row.candidateText}`)
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
