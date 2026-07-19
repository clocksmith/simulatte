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
  testDopplerDeviceModule,
  testDopplerStorageModule,
  manifestFacade,
  enableQualifiedReranker,
  withIntentArtifactFetch,
  createPrototypeSpec,
  assertVisualIRCase,
} = require('./physics-lab-fixture.cjs');
const languageLexicon = require('../public/data/simulatte-language-lexicon.js');

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
      moduleUrl: '../../vendor/doppler/src/index.js',
      deviceModuleUrl: '../../vendor/doppler/src/tooling-exports/device.js',
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
    classification: {
      schema: 'simulatte.classificationTierPolicy.v1',
      id: 'synthetic-classification-policy',
      phase: 3,
      artifact: {
        id: 'simulatte-browser-compact-classifiers-v1',
        path: '../simulatte-compact-classifiers.js',
        sha256: '0'.repeat(64),
        sizeBytes: 1,
      },
      execution: {
        defaultCompactCandidateId: 'multinomial-nb-tfidf-head',
        defaultCompactModelKey: 'multinomialNB',
        embeddingLabelCacheMaxEntries: 16,
      },
      routing: {
        order: ['multinomial-nb-tfidf-head', 'qwen3-embedding-classifier-control'],
      },
      tiers: [
        {
          id: 'multinomial-nb-tfidf-head',
          candidateId: 'multinomial-nb-tfidf-head',
          adapter: 'browser-compact',
          modelKey: 'multinomialNB',
          status: 'evaluation-only',
          availability: 'browser-ready',
          requiresConsent: false,
        },
        {
          id: 'qwen3-embedding-classifier-control',
          candidateId: 'qwen3-embedding-classifier-control',
          adapter: 'embedding-labels',
          providerId: 'qwen-embedding',
          modelId: 'synthetic-last-pooled-transformer',
          status: 'evaluation-only',
          availability: 'browser-ready',
          requiresConsent: true,
        },
      ],
      calibration: {
        acceptedPredictionsAllowed: false,
      },
    },
    reranker: {
      schema: 'simulatte.intentRerankerConfig.v1',
      id: 'synthetic-reranker',
      kind: 'doppler-reranker',
      phase: 3,
      enabled: true,
      required: true,
      loadInPhase1WhenRequired: true,
      qualification: {
        status: 'qualified',
        selectedCandidateId: 'synthetic-reranker-model',
        promotionEligible: true,
        evidencePath: 'synthetic-reranker-frontier.json',
        evidenceSha256: '0'.repeat(64),
        modelNotExecutedReason: 'not-executed-until-phase1',
      },
      maxCandidatesPerCall: 8,
      maxSlotCandidatesPerCall: 4,
      maxCandidateTermsPerDocument: 32,
      scoreCacheMaxEntries: 256,
      execution: {
        selectedTokenLogits: 'required',
        prefixKvReuse: 'required',
        statefulPrefixReuse: 'required',
      },
      conditionalActivation: {
        schema: 'simulatte.rerankSkipActivation.v1',
        status: 'required-not-present',
        promotionEligible: false,
        selectedRuleId: null,
        rules: [],
      },
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
      rerank: 'deterministic-until-qualified-model',
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

test('classification policy loads from the numbered lock without loading Qwen', async () => {
  await withIntentArtifactFetch(async ({ modelRuntimeLock }) => {
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
    });
    const result = await embedder.loadClassificationPolicy();

    assert.equal(result.lockNumber, modelRuntimeLock.number);
    assert.equal(result.policy.id, modelRuntimeLock.classification.id);
    assert.equal(result.artifactId, modelRuntimeLock.classification.artifact.id);
    assert.equal(result.modelDownloaded, false);
    assert.equal(embedder.modelPromise, null);
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
    enableQualifiedReranker(manifest);
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
    enableQualifiedReranker(manifest);
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
      dopplerDeviceModule: testDopplerDeviceModule(),
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
    assert.equal(result.model.reranker, null);
    assert.equal(result.model.rerankerCandidateId, 'simulatte.doppler-intent-reranker.v1');
    assert.equal(result.model.rerankerKind, 'doppler-reranker');
    assert.equal(result.model.rerankerPhase, 3);
    assert.equal(result.model.rerankerEnabled, false);
    assert.equal(result.model.rerankerRequired, false);
    assert.equal(result.model.rerankerQualificationStatus, 'blocked-no-qualified-candidate');
    assert.equal(result.rerank.required, false);
    assert.equal(result.rerank.schema, 'simulatte.intentRerank.v1');
    assert.equal(result.rerank.phase, 3);
    assert.equal(result.rerank.phaseId, 'retrieval');
    assert.equal(result.rerank.model, null);
    assert.equal(result.rerank.modelCandidateId, 'simulatte.doppler-intent-reranker.v1');
    assert.equal(result.rerank.rerankerMode, 'heuristic-fusion');
    assert.equal(result.rerank.rerankerKind, 'doppler-reranker');
    assert.equal(result.rerank.rerankerPhase, 3);
    assert.equal(result.rerank.modelRequired, false);
    assert.equal(result.rerank.modelReady, false);
    assert.equal(result.rerank.modelStatus, 'disabled');
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
    assert.equal(ready.promptRuntimeReceipt.reranker, '');
    assert.equal(ready.promptRuntimeReceipt.rerankerCandidateId, 'simulatte.doppler-intent-reranker.v1');
    assert.equal(ready.promptRuntimeReceipt.rerankerKind, 'doppler-reranker');
    assert.equal(ready.promptRuntimeReceipt.rerankerPhase, 3);
    assert.equal(ready.promptRuntimeReceipt.rerankerEnabled, false);
    assert.equal(ready.promptRuntimeReceipt.rerankerRequired, false);
    assert.equal(ready.promptRuntimeReceipt.rerankerReady, false);
    assert.equal(ready.promptRuntimeReceipt.rerankerStatus, 'disabled');
    assert.equal(ready.promptRuntimeReceipt.rerankerQualificationStatus, 'blocked-no-qualified-candidate');
    assert.equal(ready.promptRuntimeReceipt.rerankerModelExecuted, false);
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
    enableQualifiedReranker(manifest);
    manifest.reranker.model = null;
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
    enableQualifiedReranker(manifest);
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
      dopplerDeviceModule: testDopplerDeviceModule(),
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
    maxCandidateTermsPerDocument: 32,
    scoreCacheMaxEntries: 16,
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

test('Doppler reranker uses selected-token logits with one reusable token-exact KV prefix', async () => {
  const scope = globalThis.__SimulatteIntentEmbedderRefactorScope;
  let resetCount = 0;
  let prefixCount = 0;
  let prefixResetCount = 0;
  let prefixScoreCount = 0;
  let snapshotScoreCount = 0;
  let snapshotDestroyCount = 0;
  let sequenceLength = 0;
  const scoredInputLengths = [];
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
      tokenizeText(text) {
        return Array.from(text, (character) => character.charCodeAt(0));
      },
      async prefillKV(_prompt, options) {
        prefixCount += 1;
        sequenceLength = options.inputIds.length;
        return {
          cache: {
            destroy() {
              snapshotDestroyCount += 1;
            },
          },
          seqLen: options.inputIds.length,
          tokens: options.inputIds,
        };
      },
      resetToSeqLen(seqLen) {
        assert.ok(seqLen <= sequenceLength);
        sequenceLength = seqLen;
        prefixResetCount += 1;
      },
      async prefillWithTokenLogits(prompt, tokenIds, options) {
        assert.equal(prompt, '');
        assert.deepEqual(tokenIds, [1, 0]);
        const suffix = String.fromCharCode(...options.inputIds);
        const relevant = suffix.includes('optical match');
        scoredInputLengths.push(options.inputIds.length);
        sequenceLength += options.inputIds.length;
        prefixScoreCount += 1;
        return {
          tokenIds,
          logits: Float32Array.from(relevant ? [8, -1] : [-1, 8]),
          logitsByTokenId: relevant ? { 1: 8, 0: -1 } : { 1: -1, 0: 8 },
          phase: { selectedTokenCount: 2 },
        };
      },
      async prefillWithTokenLogitsFromKV() {
        snapshotScoreCount += 1;
        throw new Error('stateful prefix scoring should not clone a KV snapshot per candidate');
      },
    },
  };
  const embedder = new scope.ModelBackedIntentEmbedder();
  embedder.dopplerRerankerHandle = handle;
  const provider = embedder.createDopplerRerankerProvider({ index: null }, {
    id: 'selected-token-reranker',
    maxCandidatesPerCall: 3,
    maxSlotCandidatesPerCall: 2,
    maxCandidateTermsPerDocument: 32,
    scoreCacheMaxEntries: 16,
    execution: {
      selectedTokenLogits: 'required',
      prefixKvReuse: 'required',
    },
  }, {}, handle, 'https://simulatte.test/reranker');
  const request = {
    schema: 'simulatte.intentRerankInput.v1',
    prompt: 'rank these candidates',
    candidates: [
      { primitiveId: 'negative', candidateText: 'UNRELATED_GRAVITY' },
      { primitiveId: 'positive', candidateText: 'OPTICAL_MATCH' },
    ],
    onProgress: (row) => progressRows.push(row),
  };
  const rows = await provider.rerank(request);
  const reusedRows = await provider.rerank({
    ...request,
    candidates: [
      { primitiveId: 'second-negative', candidateText: 'UNRELATED_THERMAL_FLOW' },
      { primitiveId: 'second-positive', candidateText: 'SECOND_OPTICAL_MATCH' },
    ],
  });
  const cachedRows = await provider.rerank(request);

  assert.equal(rows[0].primitiveId, 'positive');
  assert.equal(rows[0].scoringPath, 'prefix-selected-token-logits');
  assert.ok(rows.every((row) => row.prefixTokenCount > 0));
  assert.equal(rows.filter((row) => row.prefixStateReused === false).length, 1);
  assert.equal(rows.filter((row) => row.prefixStateReused === true).length, 1);
  assert.ok(reusedRows.every((row) => row.prefixStateReused === true));
  assert.ok(cachedRows.every((row) => row.scoreCacheHit === true));
  assert.equal(prefixCount, 0);
  assert.equal(prefixScoreCount, 4);
  assert.equal(snapshotScoreCount, 0);
  assert.equal(snapshotDestroyCount, 0);
  assert.equal(prefixResetCount, 4);
  assert.equal(resetCount, 1);
  assert.ok(sequenceLength > 0);
  assert.ok(scoredInputLengths[0] > scoredInputLengths[1]);
  assert.deepEqual(progressRows.map((row) => row.completed), [1, 2, 1, 2, 1, 2]);
  const normalized = scope.normalizeRerankerRows(rows);
  assert.ok(normalized.every((row) => row.scoringPath === 'prefix-selected-token-logits'));
  const executionSummary = scope.rerankExecutionSummary(normalized);
  assert.deepEqual({
    scoringPaths: executionSummary.scoringPaths,
    selectedTokenLogitCount: executionSummary.selectedTokenLogitCount,
    selectedTokenExecutionCount: executionSummary.selectedTokenExecutionCount,
    prefixKvReuseCount: executionSummary.prefixKvReuseCount,
    prefixStateReuseCount: executionSummary.prefixStateReuseCount,
    scoreCacheHitCount: executionSummary.scoreCacheHitCount,
    minimumPrefixTokenCount: executionSummary.minimumPrefixTokenCount,
    maximumPrefixTokenCount: executionSummary.maximumPrefixTokenCount,
  }, {
    scoringPaths: ['prefix-selected-token-logits'],
    selectedTokenLogitCount: 2,
    selectedTokenExecutionCount: 2,
    prefixKvReuseCount: 2,
    prefixStateReuseCount: 1,
    scoreCacheHitCount: 0,
    minimumPrefixTokenCount: rows[0].prefixTokenCount,
    maximumPrefixTokenCount: rows[0].prefixTokenCount,
  });
  assert.ok(executionSummary.totalExecutionDurationMs >= 0);
  assert.ok(executionSummary.meanExecutionDurationMs >= 0);
  assert.ok(executionSummary.maximumExecutionDurationMs >= 0);
  assert.ok(executionSummary.prefixPreparationDurationMs >= 0);
  assert.ok(executionSummary.prefixTokenizationDurationMs >= 0);
  assert.ok(executionSummary.prefixResetDurationMs >= 0);
  assert.ok(executionSummary.prefixPrimingDurationMs >= 0);
  assert.ok(executionSummary.rerankCallDurationMs >= executionSummary.totalExecutionDurationMs);
  assert.ok(executionSummary.unattributedRerankDurationMs >= 0);
  assert.ok(normalized.every((row) => row.rerankCallDurationMs >= row.executionDurationMs));
  assert.equal(scope.rerankExecutionSummary(scope.normalizeRerankerRows(reusedRows)).prefixStateReuseCount, 2);
  assert.equal(scope.rerankExecutionSummary(scope.normalizeRerankerRows(cachedRows)).scoreCacheHitCount, 2);
});

test('bounded retrieval heaps preserve full-sort surface and universe ranking', () => {
  const scope = globalThis.__SimulatteIntentEmbedderRefactorScope;
  const query = Float32Array.from([0.8, 0.4, 0.2, 0.1]);
  const surfaceDocuments = Array.from({ length: 17 }, (_, index) => ({
    cardId: `card-${String(index).padStart(2, '0')}`,
    vector: Float32Array.from([index / 20, (17 - index) / 20, index % 3 / 4, 0.1]),
  }));
  const surfaceIndex = { id: 'surface-fixture', embedModelId: 'fixture', documents: surfaceDocuments };
  const expectedSurface = surfaceDocuments.map((doc) => {
    const score = scope.clamp01(scope.dot(query, doc.vector));
    return { cardId: doc.cardId, score: Number(score.toFixed(4)) };
  }).filter((row) => row.score >= 0.22)
    .sort((a, b) => b.score - a.score || a.cardId.localeCompare(b.cardId)).slice(0, 5);
  const actualSurface = scope.rankSurfaceCards(surfaceIndex, query, { maxCards: 5, minCardScore: 0.22 });
  assert.deepEqual(actualSurface.map(({ cardId, score }) => ({ cardId, score })), expectedSurface);

  const universeDocuments = Array.from({ length: 23 }, (_, index) => ({
    id: `concept-${String(index).padStart(2, '0')}`,
    label: index % 5 === 0 ? `airplane concept ${index}` : `unrelated concept ${index}`,
    featureVector: Float32Array.from([index / 24, (23 - index) / 24, index % 4 / 4, 0.25]),
  }));
  const universeIndex = { featureDim: 4, documents: universeDocuments };
  const prompt = 'airplane over trees';
  const tokens = scope.promptTokens(prompt);
  const ranking = {
    featureQuery: scope.featureQueryForIndex(universeIndex, prompt, new Map()),
    queryVector: query,
  };
  const expectedUniverse = universeDocuments.map((doc) => (
    scope.universeCandidateForDocument(doc, 'concepts', tokens, ranking)
  )).filter((row) => row.score >= 0.16 || row.lexicalScore > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 4);
  const actualUniverse = scope.rankUniverseIndexes({ id: 'universe-fixture', indexes: {
    concepts: universeIndex,
  } }, prompt, query, { maxUniverse: 8, minUniverseScore: 0.16 });
  assert.deepEqual(actualUniverse.byIndex.concepts, expectedUniverse);
});

test('required selected-token reranking fails closed on an incomplete Doppler handle', () => {
  const scope = globalThis.__SimulatteIntentEmbedderRefactorScope;
  assert.throws(() => scope.rerankProviderFromModelHandle({
    resetGenerationState() {},
    advanced: {
      async prefillWithLogits() {
        return { logits: Float32Array.from([0, 1]) };
      },
    },
  }, { index: null }, {
    id: 'incomplete-reranker',
    maxCandidatesPerCall: 1,
    maxSlotCandidatesPerCall: 1,
    maxCandidateTermsPerDocument: 32,
    scoreCacheMaxEntries: 16,
    execution: {
      selectedTokenLogits: 'required',
      prefixKvReuse: 'required',
    },
  }, 'test-reranker'), /requires selected-token logits/);
});

test('model-backed embedder captures its reranker factory when the ordered runtime modules load', () => {
  const scope = globalThis.__SimulatteIntentEmbedderRefactorScope;
  const factory = scope.rerankProviderFromModelHandle;
  const handle = { rerank: () => [] };
  const embedder = new scope.ModelBackedIntentEmbedder();
  delete scope.rerankProviderFromModelHandle;
  try {
    assert.doesNotThrow(() => embedder.createDopplerRerankerProvider(
      { index: null },
      { id: 'captured-factory-reranker' },
      {},
      handle,
      'https://simulatte.test/reranker'
    ));
  } finally {
    scope.rerankProviderFromModelHandle = factory;
  }
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

test('slot lexical evidence separates local identity from model construction work', () => {
  const scope = globalThis.__SimulatteIntentEmbedderRefactorScope;
  const slot = {
    slotId: 'slot.actor.cat',
    slotRole: 'actor',
    entryId: 'actor:cat',
    required: true,
    relationIds: [],
    queries: [{ text: 'cat feline' }],
  };
  assert.ok(scope.slotLexicalScore(slot, 'cat feline small mammal') > 0);
  assert.ok(scope.slotLexicalScore(slot, 'cats with articulated bodies') > 0);
  assert.equal(scope.slotLexicalScore(slot, 'caterpillar relation table dna strand'), 0);
  assert.equal(scope.slotCandidateLiteralMatch(slot, { candidateId: 'cat', label: 'cat' }), true);
  assert.equal(scope.slotCandidateLiteralMatch(slot, {
    candidateId: 'caterpillar',
    candidateText: 'cat-like motion',
  }), false);

  const runtime = {
    manifest: {
      reranker: {
        id: 'slot-reranker',
        maxCandidatesPerCall: 8,
        maxSlotCandidatesPerCall: 2,
        maxCandidateTermsPerDocument: 32,
        scoreCacheMaxEntries: 16,
      },
    },
  };
  const input = scope.buildSlotRerankInput({
    promptText: 'cats swim in a lake',
    slot,
    runtime,
    candidates: [
      { candidateId: 'constraint-graph', supportOnly: true, score: 0.9 },
      { candidateId: 'cat', candidateText: 'cat feline', score: 0.8 },
      { candidateId: 'tail', candidateText: 'other', score: 0.7 },
    ],
  });
  assert.deepEqual(input.candidates.map((row) => row.candidateId), ['cat']);
  assert.match(input.prompt, /Scene prompt: cats swim in a lake/);
  assert.match(input.prompt, /Required actor evidence: cat feline/);
  assert.equal(scope.slotRerankSkipReason(slot, [{ literalSlotMatch: true }]), 'literal-slot-identity');
  assert.equal(scope.slotRerankSkipReason(slot, [{
    candidateId: 'galaxy',
    candidateType: 'surface-card',
    literalSlotMatch: true,
    constructionEvidence: true,
    modelEvaluated: true,
    construction: {
      schema: 'simulatte.constructionEvidence.v1',
      sourceType: 'environment',
      partHints: [],
      shapeHints: ['spiral-field'],
    },
  }], true), 'exact-model-indexed-construction');
  assert.equal(scope.slotRerankSkipReason(slot, []), '');
  assert.equal(scope.slotUsesPromptOwnedLocalEvidence(slot), false);
  assert.equal(scope.slotUsesPromptOwnedLocalEvidence({
    ...slot,
    semanticClass: 'cat',
    visualArchetype: 'animal',
  }), false);
  assert.equal(scope.slotUsesPromptOwnedLocalEvidence({
    ...slot,
    semanticClass: 'cat',
    visualArchetype: 'cat',
    localGeometryGrammarId: 'object-grammar.cat',
  }), false);
  assert.equal(scope.slotHasPromptOwnedVisualIdentity({
    ...slot,
    localGeometryGrammarId: 'object-grammar.cat',
  }), true);
  assert.equal(scope.slotUsesPromptOwnedLocalEvidence({
    slotRole: 'action', entryId: 'action:swimming', required: true,
  }), true);
  assert.equal(scope.slotUsesPromptOwnedLocalEvidence({
    slotRole: 'concept', entryId: 'concept:renderer', required: false,
  }), true);
  const optionalConcept = scope.promptOwnedLocalSlotRow({
    slotId: 'slot.concept.renderer', slotRole: 'concept', entryId: 'concept:renderer', required: false,
  });
  assert.equal(optionalConcept.candidates[0].supportOnly, true);
  assert.equal(optionalConcept.candidates[0].identityEvidence, false);
  assert.equal(optionalConcept.receipt.modelStatus, 'not-run');
  assert.equal(scope.slotRerankSkipReason({ ...slot, required: false }, []), 'optional-slot-local-evidence');
  assert.equal(scope.phase3SupportLikePrimitiveId('population-field'), true);
  assert.equal(scope.phase3SupportLikePrimitiveId('relation-table'), true);
  const relationSlot = {
    slotId: 'slot.relation.cat_swimming_lake',
    slotRole: 'relation',
    entryId: 'relation:cat_swimming_lake',
    required: true,
    relationIds: ['cat_swimming_lake'],
    queries: [{ text: 'cat swimming lake' }],
  };
  const universeRows = scope.slotUniverseCandidates(relationSlot, {
    candidates: [
      { id: 'affordance.anemone', indexName: 'affordances', label: 'swimming', score: 0.9 },
      { id: 'operator.jumping', indexName: 'operators', label: 'jumping', score: 0.795, semanticScore: 0 },
      { id: 'relation.swimming', indexName: 'relations', label: 'swimming', score: 0.795, semanticScore: 0 },
    ],
  }, 3).sort(scope.slotCandidateSort);
  assert.equal(universeRows[0].candidateId, 'relation.swimming');
  assert.equal(universeRows[1].candidateId, 'operator.jumping');
  assert.equal(universeRows[2].candidateId, 'affordance.anemone');
  assert.equal(scope.slotUsesPromptOwnedLocalEvidence({
    ...relationSlot,
    predicate: 'holding',
    process: 'holding',
    modelEvidenceRequired: false,
  }), true);
  assert.equal(scope.slotUsesPromptOwnedLocalEvidence({
    ...relationSlot,
    predicate: '',
    process: '',
    modelEvidenceRequired: true,
  }), false);
  assert.match(scope.slotQueryText({
    slotRole: 'visual',
    entryId: 'visual:species-distinct-silhouettes',
  }, 'dogs and cats swimming in a lake'), /species-distinct-silhouette dog cat swimming lake/);
  const visualSlot = {
    slotRole: 'visual',
    budgets: { primitive: 0, surfaceCard: 4, universe: 2 },
    allowedCandidateTypes: ['visual-card', 'surface-card', 'render-operator'],
  };
  assert.equal(scope.slotCandidateBudget(visualSlot, 'primitive', 10), 0);
  assert.equal(scope.slotCandidateBudget(visualSlot, 'surfaceCard', 8), 4);
  assert.equal(scope.slotAllowsCandidateType(visualSlot, 'primitive'), false);
  assert.equal(scope.slotAllowsCandidateType(visualSlot, 'surface-card'), true);
});

test('data-owned local construction ids resolve to concrete Phase 6 grammars', () => {
  const grammars = globalThis.__SimulatteCompositionGraphRefactorScope.OBJECT_GEOMETRY_GRAMMARS;
  const rows = languageLexicon.ENTITY_PHRASES.filter(([, , metadata]) => metadata?.localGeometryGrammarId);

  assert.ok(rows.length > 0);
  for (const [phrase, , metadata] of rows) {
    const grammarId = metadata.localGeometryGrammarId.replace(/^object-grammar\./, '');
    assert.ok(grammars[grammarId], `${phrase} references missing Phase 6 grammar ${grammarId}`);
    assert.equal(grammars[grammarId].literal, true);
  }
});

test('reranker order stays inside the local evidence score band', () => {
  const scope = globalThis.__SimulatteIntentEmbedderRefactorScope;
  const local = [
    { primitiveId: 'a', score: 0.9, modelScore: 0.9 },
    { primitiveId: 'b', score: 0.85, modelScore: 0.85 },
    { primitiveId: 'c', score: 0.8, modelScore: 0.8 },
    { primitiveId: 'tail', score: 0.75, modelScore: 0.75 },
  ];
  const model = [
    { primitiveId: 'c', score: 0.99, rank: 0 },
    { primitiveId: 'b', score: 0.98, rank: 1 },
    { primitiveId: 'a', score: 0.97, rank: 2 },
  ];
  const rows = scope.applyModelRerank(local, model, model);
  assert.deepEqual(rows.map((row) => row.primitiveId), ['c', 'b', 'a', 'tail']);
  assert.deepEqual(rows.slice(0, 3).map((row) => row.score), [0.9, 0.85, 0.8]);
  assert.deepEqual(rows.slice(0, 3).map((row) => row.modelRerankScore), [0.99, 0.98, 0.97]);
  assert.equal(rows[3].score, 0.75);
});

test('reranker documents are compact and its score cache is bounded across queries', () => {
  const scope = globalThis.__SimulatteIntentEmbedderRefactorScope;
  const text = scope.compactRerankCandidateText(
    'simulatte surface card cat type entity labels cat feline materials biomass description cat feline agile mammal',
    5
  );
  assert.equal(text.split(' ').length, 5);
  assert.match(text, /cat/);
  assert.match(text, /feline/);
  assert.doesNotMatch(text, /simulatte|surface|label|description/);
  const cache = new Map();
  scope.writeRerankScoreCache(cache, 'query-a', { score: 1 }, 2);
  scope.writeRerankScoreCache(cache, 'query-b', { score: 2 }, 2);
  assert.equal(scope.readRerankScoreCache(cache, 'query-a').score, 1);
  scope.writeRerankScoreCache(cache, 'query-c', { score: 3 }, 2);
  assert.equal(cache.has('query-b'), false);
  assert.equal(cache.has('query-a'), true);
  assert.equal(cache.has('query-c'), true);
});

test('prompt reranking covers construction evidence before unrelated local-score candidates', () => {
  const scope = globalThis.__SimulatteIntentEmbedderRefactorScope;
  const priors = ['noise', 'soft-body', 'gravity', 'collision', 'radiation', 'friction']
    .map((primitiveId, index) => ({ primitiveId, score: 1 - index * 0.01 }));
  const selection = scope.selectEvidenceBackedRerankPriors(priors, {
    bySlot: [
      { constructionCandidates: [{ construction: { primitiveHints: ['soft-body', 'collision', 'friction'] } }] },
      { constructionCandidates: [{ construction: { primitiveHints: ['gravity', 'radiation'] } }] },
    ],
  }, 8);

  assert.equal(selection.mode, 'construction-evidence-round-robin');
  assert.equal(selection.candidateBudgetPolicy, 'one-per-construction-group-minimum-two');
  assert.equal(selection.evidenceCandidateCount, 2);
  assert.equal(selection.evidenceGroupCount, 2);
  assert.equal(selection.candidateBudget, 2);
  assert.deepEqual(selection.priors.map((row) => row.primitiveId), [
    'soft-body', 'gravity',
  ]);
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
      dopplerDeviceModule: testDopplerDeviceModule(),
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

test('Phase 1 prepares 9-shard and 14-shard sources before serialized Doppler loads', async () => {
  await withIntentArtifactFetch(async ({ manifest, index }) => {
    enableQualifiedReranker(manifest);
    const query = indexedVector(index, 'optics-bench');
    const sourceRoles = [];
    const loadRoles = [];
    let deviceInitCalls = 0;
    let activeSourcePreparations = 0;
    let sourcePreparationOverlap = false;
    let activeLoads = 0;
    let modelLoadOverlap = false;
    let releaseEmbeddingSource;
    let releaseRerankerSource;
    let releaseEmbeddingLoad;
    let embeddingSourceStarted;
    let rerankerSourceStarted;
    let embeddingLoadStarted;
    const embeddingSourceReady = new Promise((resolve) => { embeddingSourceStarted = resolve; });
    const rerankerSourceReady = new Promise((resolve) => { rerankerSourceStarted = resolve; });
    const embeddingLoadReady = new Promise((resolve) => { embeddingLoadStarted = resolve; });
    const storageModule = {
      async ensureModelCachedSource(modelId, modelBaseUrl, onProgress, options = {}) {
        const role = modelId === manifest.embedModel.id ? 'embedding' : 'reranker';
        const shardCount = role === 'embedding' ? 9 : 14;
        sourceRoles.push(`${role}:${shardCount}`);
        sourcePreparationOverlap ||= activeSourcePreparations > 0;
        activeSourcePreparations += 1;
        const release = await new Promise((resolve) => {
          if (role === 'embedding') {
            releaseEmbeddingSource = resolve;
            embeddingSourceStarted();
          } else {
            releaseRerankerSource = resolve;
            rerankerSourceStarted();
          }
        });
        activeSourcePreparations -= 1;
        const manifestHash = options.expectedManifestHash.hex || options.expectedManifestHash;
        onProgress?.({ stage: 'cache-hit', modelId, percent: 100, totalBytes: shardCount });
        return {
          cached: true,
          fromCache: true,
          cacheState: 'verified-hit',
          modelId,
          manifest: { modelId, shards: Array.from({ length: shardCount }, (_, index) => ({ index })) },
          manifestText: JSON.stringify({ modelId, shardCount }),
          manifestHash,
          storageBackend: 'opfs',
          storageContext: { async close() {} },
          totalBytes: shardCount,
          release,
        };
      },
    };
    const embeddingHandle = {
      modelId: manifest.embedModel.id,
      manifest: { manifestHash: manifest.embedModel.manifestHash },
      async embed(prompt) {
        return { embedding: probeAwareVector(index, prompt, query) };
      },
    };
    const rerankerHandle = {
      modelId: manifest.reranker.model.id,
      manifest: {
        manifestHash: manifest.reranker.model.manifestHash,
        inference: { rerank: { trueTokenId: 1, falseTokenId: 0 } },
      },
      rerank(input = {}) {
        return (input.candidates || []).map((candidate, order) => ({
          primitiveId: candidate.primitiveId,
          score: Number((1 - order * 0.1).toFixed(6)),
        }));
      },
    };
    const dopplerModule = {
      async load(model, options = {}) {
        const role = model.baseUrl === manifest.embedModel.defaultModelBaseUrl ? 'embedding' : 'reranker';
        loadRoles.push(`${role}:${options.isolatedLoader === true ? 'isolated' : 'shared'}`);
        modelLoadOverlap ||= activeLoads > 0;
        activeLoads += 1;
        if (role === 'embedding') {
          embeddingLoadStarted();
          await new Promise((resolve) => { releaseEmbeddingLoad = resolve; });
        }
        activeLoads -= 1;
        return role === 'embedding' ? embeddingHandle : rerankerHandle;
      },
    };
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      dopplerModule,
      dopplerDeviceModule: {
        async initDevice() {
          deviceInitCalls += 1;
          return { label: 'shared-test-device' };
        },
      },
      dopplerStorageModule: storageModule,
    });

    const loadPromise = embedder.loadModel();
    await embeddingSourceReady;
    assert.deepEqual(sourceRoles, ['embedding:9']);
    assert.deepEqual(loadRoles, []);
    releaseEmbeddingSource();
    await rerankerSourceReady;
    assert.deepEqual(sourceRoles, ['embedding:9', 'reranker:14']);
    assert.deepEqual(loadRoles, []);
    releaseRerankerSource();
    await embeddingLoadReady;
    assert.deepEqual(loadRoles, ['embedding:isolated']);
    releaseEmbeddingLoad();
    const runtime = await loadPromise;

    assert.deepEqual(loadRoles, ['embedding:isolated', 'reranker:isolated']);
    assert.equal(sourcePreparationOverlap, false);
    assert.equal(modelLoadOverlap, false);
    assert.equal(deviceInitCalls, 1);
    assert.equal(runtime.promptRuntimeReceipt.providerReady, true);
    assert.equal(runtime.promptRuntimeReceipt.rerankerReady, true);
    const receipt = runtime.promptRuntimeReceipt.modelPreparation;
    assert.equal(receipt.policy, 'prepare-all-sources-then-load-embedding-before-reranker');
    assert.deepEqual(receipt.sourceOrder, ['embedding', 'reranker']);
    assert.deepEqual(receipt.loadOrder.map((row) => row.role), ['embedding', 'reranker']);
    assert.ok([...receipt.sourcePreparations, ...receipt.loadOrder].every((row) => row.overlap === false));
    assert.ok([...receipt.sourcePreparations, ...receipt.loadOrder].every((row) => row.queueWaitMs >= 0));
  }, { rerankProvider: null });
});

test('Phase 1 preserves the preparation receipt when the second model source fails', async () => {
  await withIntentArtifactFetch(async ({ manifest }) => {
    enableQualifiedReranker(manifest);
    let loadCalls = 0;
    let embeddingContextCloseCalls = 0;
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      dopplerModule: { async load() { loadCalls += 1; } },
      dopplerDeviceModule: testDopplerDeviceModule(),
      dopplerStorageModule: {
        async ensureModelCachedSource(modelId, _modelBaseUrl, _onProgress, options = {}) {
          if (modelId === manifest.reranker.model.id) throw new Error('reranker source rejected');
          const manifestHash = options.expectedManifestHash.hex || options.expectedManifestHash;
          return {
            cached: true,
            fromCache: true,
            cacheState: 'verified-hit',
            modelId,
            manifest: { modelId, shards: Array.from({ length: 9 }, (_, index) => ({ index })) },
            manifestText: JSON.stringify({ modelId, shardCount: 9 }),
            manifestHash,
            storageBackend: 'opfs',
            storageContext: { async close() { embeddingContextCloseCalls += 1; } },
            totalBytes: 9,
          };
        },
      },
    });

    let rejectedError = null;
    await assert.rejects(async () => {
      try {
        await embedder.loadModel();
      } catch (error) {
        rejectedError = error;
        throw error;
      }
    }, /reranker source rejected/);
    assert.equal(loadCalls, 0);
    assert.equal(embeddingContextCloseCalls, 1);
    const receipt = rejectedError.modelPreparationReceipt || embedder.dopplerModelPreparationReceipt;
    assert.deepEqual(receipt.sourceOrder, ['embedding', 'reranker']);
    assert.deepEqual(receipt.sourcePreparations.map((row) => [row.role, row.status]), [
      ['embedding', 'ready'],
      ['reranker', 'failed'],
    ]);
    assert.deepEqual(receipt.loadOrder, []);
  }, { rerankProvider: null });
});

test('Phase 1 closes each prepared model source once when embedding load fails', async () => {
  await withIntentArtifactFetch(async ({ manifest }) => {
    enableQualifiedReranker(manifest);
    const closeCalls = new Map();
    let loadCalls = 0;
    const embedder = intentEmbedder.create({
      manifestUrl: 'https://simulatte.test/data/simulatte-embedder/manifest.json',
      dopplerModule: {
        async load() {
          loadCalls += 1;
          throw new Error('embedding load rejected');
        },
      },
      dopplerDeviceModule: testDopplerDeviceModule(),
      dopplerStorageModule: {
        async ensureModelCachedSource(modelId, _modelBaseUrl, _onProgress, options = {}) {
          const shardCount = modelId === manifest.embedModel.id ? 9 : 14;
          const manifestHash = options.expectedManifestHash.hex || options.expectedManifestHash;
          return {
            cached: true,
            fromCache: true,
            cacheState: 'verified-hit',
            modelId,
            manifest: { modelId, shards: Array.from({ length: shardCount }, (_, index) => ({ index })) },
            manifestText: JSON.stringify({ modelId, shardCount }),
            manifestHash,
            storageBackend: 'opfs',
            storageContext: {
              async close() {
                closeCalls.set(modelId, Number(closeCalls.get(modelId) || 0) + 1);
              },
            },
            totalBytes: shardCount,
          };
        },
      },
    });

    await assert.rejects(embedder.loadModel(), /embedding load rejected/);
    assert.equal(loadCalls, 1);
    assert.equal(closeCalls.get(manifest.embedModel.id), 1);
    assert.equal(closeCalls.get(manifest.reranker.model.id), 1);
  }, { rerankProvider: null });
});

test('Phase 1 keeps Doppler embedding resident while the reranker is loaded', async () => {
  await withIntentArtifactFetch(async ({ manifest, index }) => {
    enableQualifiedReranker(manifest);
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
      dopplerDeviceModule: testDopplerDeviceModule(),
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
    enableQualifiedReranker(manifest);
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

test('Phase 3 keeps known visual identities local and model-ranks unresolved construction', async () => {
  await withIntentArtifactFetch(async ({ manifest, index }) => {
    enableQualifiedReranker(manifest);
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
    const actionSlot = result.slotRetrieval.bySlot.find((row) => row.slotRole === 'action');
    const visualSlot = result.slotRetrieval.bySlot.find((row) => row.slotRole === 'visual');

    assert.equal(result.slotRetrieval.schema, 'simulatte.phase3SlotRetrieval.v1');
    assert.equal(result.slotRetrieval.queryPlanSchema, 'simulatte.sceneQueryPlan.v1');
    assert.ok(result.slotRetrieval.modelEvidenceSlotCount + result.slotRetrieval.localEvidenceSlotCount >=
      queryPlan.summary.requiredSlotCount);
    assert.equal(result.slotRetrieval.rerankCallCount, 0);
    assert.equal(result.slotRetrieval.rerankCandidateInputCount, 0);
    assert.equal(result.rerank.modelCandidateInputs.length, result.rerank.modelCandidateInputCount);
    assert.equal(result.rerank.modelCandidateOutputs.length, result.rerank.modelCandidateOutputCount);
    assert.ok(result.rerank.modelCandidateInputs.every((row) => row.primitiveId));
    assert.equal(dogSlot.candidates[0].candidateId, 'prompt.actor.dog');
    assert.equal(catSlot.candidates[0].candidateId, 'prompt.actor.cat');
    assert.equal(dogSlot.candidates[0].modelEvaluated, false);
    assert.equal(catSlot.candidates[0].modelEvaluated, false);
    assert.equal(dogSlot.receipt.skipReason, 'exact-construction-scored-by-prompt-embedding');
    assert.equal(catSlot.receipt.skipReason, 'exact-construction-scored-by-prompt-embedding');
    assert.equal(result.slotRetrieval.promptEmbeddingSlotCount, 2);
    assert.ok(dogSlot.constructionCandidates.length >= 1);
    assert.ok(catSlot.constructionCandidates.length >= 1);
    assert.ok(dogSlot.constructionCandidates.every((row) => row.modelEvaluated === true));
    assert.ok(catSlot.constructionCandidates.every((row) => row.modelEvaluated === true));
    assert.equal(actionSlot.acceptedCandidates[0].semanticType, 'action');
    assert.equal(actionSlot.acceptedCandidates[0].identityEvidence, false);
    assert.equal(Object.hasOwn(actionSlot.acceptedCandidates[0], 'modelScore'), false);
    assert.equal(actionSlot.receipt.modelReady, false);
    assert.equal(actionSlot.receipt.modelStatus, 'not-run');
    assert.equal(visualSlot.acceptedCandidates[0].semanticType, 'visual');
    assert.equal(visualSlot.acceptedCandidates[0].identityEvidence, false);
    assert.equal(Object.hasOwn(visualSlot.acceptedCandidates[0], 'modelScore'), false);
    assert.equal(visualSlot.receipt.skipReason, 'prompt-owned-local-identity');
    assert.ok(rerankInputs.some((input) => input.schema === 'simulatte.intentRerankInput.v1'));
    assert.equal(rerankInputs.some((input) => input.schema === 'simulatte.intentSlotRerankInput.v1'), false);
    assert.equal(rerankInputs.some((input) => input.slot && input.slot.slotId === 'slot.actor.dog'), false);
    assert.equal(rerankInputs.some((input) => input.slot && input.slot.slotId === 'slot.environment.lake'), false);
    assert.ok(embedTexts.some((text) => /dogs and cats swimming in a lake/.test(text)));
    assert.equal(embedTexts.some((text) => /species distinct silhouettes|wake ripples|partial submersion/.test(text)), false);
    assert.equal(embedTexts.some((text) => /Construct the required actor: dog/.test(text)), false);
    assert.equal(embedTexts.some((text) => /Construct the required environment: lake/.test(text)), false);
    assert.equal(dogSlot.primitiveRankBackend, 'prompt-embedding-surface-card-index');
    assert.ok(events.some((event) => event.stage === 'slot-retrieval'));
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
    assert.ok(groundedDogSlot.constructionCandidates.length >= 1);

    const phase4 = lab.runPhase4GroundedIntent(phase3);
    const acceptedGraph = phase4.artifact.groundedIntent.acceptedGraph;
    assert.ok(acceptedGraph.constructionReceipt.modelEvaluatedCount >= 2);
    assert.equal(acceptedGraph.constructionReceipt.rerankEvaluatedCount, 0);
    assert.deepEqual(acceptedGraph.nodes.map((row) => row.id).sort(), [
      'prompt-body-cat', 'prompt-body-dog', 'prompt-environment-lake',
    ]);
    assert.equal(acceptedGraph.nodes.some((row) => /^(?:visual|action|relation)$/.test(row.semanticType)), false);
    const phase5 = lab.runPhase5SimulationCompile(phase4);
    const phase6 = lab.runPhase6VisualCompile(phase5);
    const entities = phase6.artifact.visualCompile.sceneRenderPacket.entities;
    assert.equal(entities.length, 5);
    assert.equal(entities.filter((row) => row.identity.type === 'dog').length, 2);
    assert.equal(entities.filter((row) => row.identity.type === 'cat').length, 2);
    assert.ok(entities.find((row) => row.identity.type === 'dog').geometry.program.parts.some((row) => row.id === 'tail'));
    assert.equal(entities.find((row) => row.identity.type === 'lake').material.id, 'water');

    const unresolved = await embedder.rankPrompt('glorp', lab.PHYSICAL_PRIMITIVES, {
      max: 8,
      queryPlan: {
        schema: 'simulatte.sceneQueryPlan.v1',
        sourcePromptHash: 'fnv1a:glorp',
        slots: [{
          schema: 'simulatte.sceneQuerySlot.v1',
          slotId: 'slot.concept.glorp',
          slotRole: 'concept',
          entryId: 'concept:glorp',
          sourceLabel: 'glorp',
          semanticClass: 'generic',
          required: true,
          queries: [{ kind: 'semantic', text: 'glorp' }],
        }],
      },
    });
    const unresolvedSlot = unresolved.slotRetrieval.bySlot[0];
    assert.equal(unresolved.slotRetrieval.embeddedSlotCount, 1);
    assert.equal(unresolved.slotRetrieval.rerankCallCount, 1);
    assert.equal(unresolvedSlot.receipt.rerankerMode, 'doppler-reranker');
    assert.equal(unresolvedSlot.receipt.candidateInputs.length, unresolvedSlot.receipt.candidateInputCount);
    assert.equal(unresolvedSlot.receipt.candidateOutputs.length, unresolvedSlot.receipt.candidateOutputCount);
    assert.ok(rerankInputs.some((input) => input.slot && input.slot.slotId === 'slot.concept.glorp'));
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
