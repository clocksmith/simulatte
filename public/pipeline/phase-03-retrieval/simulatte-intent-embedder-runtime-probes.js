(function attachSimulatteIntentEmbedderruntimeprobes(root) {
  const scope = root.__SimulatteIntentEmbedderRefactorScope;
  if (!scope || scope.missingDependency) return;
  with (scope) {
    async function fetchJson(url, label, telemetry = {}) {
        const started = nowMs();
        const progress = telemetry.progress || null;
        const trace = Boolean(telemetry.traceEnabled);
        const startPercent = Number.isFinite(Number(telemetry.percent)) ? Number(telemetry.percent) : 0;
        const endPercent = Number.isFinite(Number(telemetry.progressEnd))
          ? Number(telemetry.progressEnd)
          : Math.min(99, startPercent + 1);
        emitRuntimeProgress(progress, trace, {
          source: 'simulatte-intent-embedder',
          stage: telemetry.stage || 'resource-fetch',
          percent: startPercent,
          message: `Fetching ${label}`,
          timing: 'start',
          traceId: telemetry.traceId || '',
          resourceKind: telemetry.resourceKind || label,
          resourceUrl: String(url || ''),
          cacheMode: 'force-cache',
        });
        const response = await fetch(url, { cache: 'force-cache' });
        const durationMs = elapsedMsSince(started);
        if (!response.ok) {
          emitRuntimeProgress(progress, trace, {
            source: 'simulatte-intent-embedder',
            stage: telemetry.stage || 'resource-fetch',
            percent: startPercent,
            message: `${label} fetch failed`,
            timing: 'error',
            traceId: telemetry.traceId || '',
            durationMs,
            resourceKind: telemetry.resourceKind || label,
            resourceUrl: String(url || ''),
            status: response.status,
            cacheMode: 'force-cache',
          });
          throw new Error(`${label} fetch failed: ${response.status}`);
        }
    	    const body = await readJsonResponseWithProgress(response, label, {
    	      ...telemetry,
    	      startPercent,
    	      endPercent,
          progress,
          trace,
    	      resourceUrl: String(url || ''),
    	    });
    	    const verifiedHash = await assertJsonResourceHash(label, url, body.bytes, telemetry);
    	    emitRuntimeProgress(progress, trace, {
          source: 'simulatte-intent-embedder',
          stage: telemetry.stage || 'resource-fetch',
          percent: endPercent,
          message: `${label} fetched`,
          timing: 'end',
          traceId: telemetry.traceId || '',
          durationMs,
          resourceKind: telemetry.resourceKind || label,
          resourceUrl: String(url || ''),
          status: response.status,
          byteLength: body.byteLength,
          completedBytes: body.byteLength,
    	      totalBytes: body.totalBytes,
    	      verifiedHash,
    	      cacheMode: 'force-cache',
    	    });
    	    return body.value;
    	  }

    async function assertJsonResourceHash(label, url, bytes, telemetry = {}) {
    	    const expectedHash = telemetry.expectedHash || telemetry.hash || telemetry.integrity || null;
    	    if (!artifactHashHex(expectedHash)) return '';
    	    return assertArtifactBytesHash({
    	      path: String(url || label || 'json-resource'),
    	      hash: expectedHash,
    	      hashAlgorithm: artifactHashAlgorithm(expectedHash) || telemetry.hashAlgorithm || 'sha256',
    	    }, bytes);
    	  }

    async function readJsonResponseWithProgress(response, label, telemetry = {}) {
        const contentLength = Number(response.headers && response.headers.get('Content-Length') || 0);
        if (response.body && typeof response.body.getReader === 'function') {
          const reader = response.body.getReader();
          const chunks = [];
          let received = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
              chunks.push(chunk);
              received += chunk.byteLength;
              emitFetchJsonProgress(label, telemetry, received, contentLength);
            }
          } finally {
            if (reader.releaseLock) reader.releaseLock();
          }
          const bytes = concatChunks(chunks, received);
    	      return {
    	        value: JSON.parse(new TextDecoder().decode(bytes)),
    	        bytes,
    	        byteLength: bytes.byteLength,
    	        totalBytes: contentLength || bytes.byteLength,
    	      };
    	    }
    	    const text = await response.text();
    	    const bytes = new TextEncoder().encode(text);
    	    const byteLength = bytes.byteLength;
    	    emitFetchJsonProgress(label, telemetry, byteLength, contentLength || byteLength);
    	    return {
    	      value: JSON.parse(text),
    	      bytes,
    	      byteLength,
    	      totalBytes: contentLength || byteLength,
    	    };
      }

    function emitFetchJsonProgress(label, telemetry = {}, completedBytes = 0, totalBytes = 0) {
        const progress = telemetry.progress || null;
        if (typeof progress !== 'function') return;
        const trace = Boolean(telemetry.trace);
        const start = Number(telemetry.startPercent || 0);
        const end = Number.isFinite(Number(telemetry.endPercent)) ? Number(telemetry.endPercent) : start;
        const fraction = totalBytes > 0 ? Math.max(0, Math.min(1, completedBytes / totalBytes)) : 0;
        emitRuntimeProgress(progress, trace, {
          source: 'simulatte-intent-embedder',
          stage: telemetry.stage || 'resource-fetch',
          percent: start + fraction * Math.max(0, end - start),
          message: `Fetching ${label}`,
          traceId: telemetry.traceId || '',
          resourceKind: telemetry.resourceKind || label,
          resourceUrl: String(telemetry.resourceUrl || ''),
          completedBytes,
          totalBytes,
          cacheMode: 'force-cache',
        });
      }

    function progressHandler(options = {}, fallback = null) {
        return typeof options.onProgress === 'function' ? options.onProgress : fallback;
      }

    function emitProgress(callback, event) {
        if (typeof callback !== 'function') return;
        callback({
          percent: clampProgress(event && event.percent),
          ...event,
        });
      }

    function emitRuntimeProgress(callback, trace, event) {
        const next = {
          timestamp: new Date().toISOString(),
          ...event,
        };
        emitProgress(callback, next);
        logEmbeddingTrace(trace, next);
      }

    function logEmbeddingTrace(enabled, event) {
        if (!enabled || typeof console === 'undefined' || typeof console.info !== 'function') return;
        const payload = { ...(event || {}) };
        delete payload.rawEvent;
        console.info('[simulatte.embedding]', payload.stage || 'event', payload);
      }

    function nowMs() {
        if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
          return performance.now();
        }
        return Date.now();
      }

    function elapsedMsSince(started) {
        const delta = nowMs() - Number(started || 0);
        return Number(Math.max(0, delta).toFixed(1));
      }

    function clampProgress(value) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return 0;
        return Math.max(0, Math.min(100, parsed));
      }

    function traceEnabled(options = {}) {
        if (options.traceEmbeddings === true || options.debugTimings === true || options.logTimings === true) {
          return true;
        }
        return TRACE_URL_FLAGS.some((name) => truthyValue(urlValue(name)));
      }

    function truthyValue(value) {
        return /^(1|true|on|yes|debug|trace)$/i.test(String(value || '').trim());
      }

    function normalizeDopplerProgress(event = {}, context = {}) {
        const rawPercent = Number(event.percent);
        const rawProgress = Number.isFinite(rawPercent) ? rawPercent : Number(event.progress);
        const fraction = Number.isFinite(rawProgress)
          ? Math.max(0, Math.min(1, rawProgress > 1 ? rawProgress / 100 : rawProgress))
          : null;
        const progressStart = Number.isFinite(Number(context.progressStart)) ? Number(context.progressStart) : 68;
        const progressEnd = Number.isFinite(Number(context.progressEnd)) ? Number(context.progressEnd) : 94;
        const percent = fraction !== null
          ? Math.max(progressStart, Math.min(progressEnd, progressStart + fraction * (progressEnd - progressStart)))
          : progressStart;
        const rawStage = event.phase || event.stage || 'model-load';
        const stage = context.stagePrefix ? `${context.stagePrefix}-${rawStage}` : rawStage;
        const shard = Number(event.shard);
        const totalShards = Number(event.totalShards);
        const layer = Number(event.layer);
        const totalLayers = Number(event.total);
        const file = Number.isFinite(shard) && shard > 0 && Number.isFinite(totalShards) && totalShards > 0
          ? `shard-${shard}-of-${totalShards}`
          : Number.isFinite(layer) && layer > 0 && Number.isFinite(totalLayers) && totalLayers > 0
            ? `layer-${layer}-of-${totalLayers}`
            : '';
        const bytesLoaded = Number(event.bytesLoaded);
        const totalBytes = Number(event.totalBytes);
        return {
          source: 'doppler',
          stage,
          percent,
          message: event.message || 'Loading intent model runtime',
          traceId: context.traceId || '',
          elapsedMs: Number.isFinite(context.startedAtMs) ? elapsedMsSince(context.startedAtMs) : undefined,
          artifactMode: 'manifest-directory',
          modelId: context.modelId || '',
          modelBaseUrl: context.modelBaseUrl || '',
          resourceKind: context.resourceKind || rawStage || 'doppler-model',
          file,
          completedBytes: Number.isFinite(bytesLoaded) ? bytesLoaded : 0,
          totalBytes: Number.isFinite(totalBytes) ? totalBytes : 0,
          completed: Number.isFinite(shard) && Number.isFinite(totalShards) && totalShards > 0
            ? shard
            : Number.isFinite(layer) && Number.isFinite(totalLayers) && totalLayers > 0
              ? layer
              : undefined,
          total: Number.isFinite(totalShards) && totalShards > 0
            ? totalShards
            : Number.isFinite(totalLayers) && totalLayers > 0
              ? totalLayers
              : undefined,
          rawEvent: event,
        };
      }

    function dopplerModelSource(modelBaseUrl) {
        return { url: modelBaseUrl };
      }

    function artifactHashAlgorithm(value) {
        if (!value) return '';
        if (typeof value === 'object') {
          return value.alg || value.algorithm || value.hashAlgorithm || '';
        }
        const text = String(value || '').trim().toLowerCase();
        const match = text.match(/^([a-z0-9_-]+):/);
        return match ? match[1] : '';
      }

    function normalizeArtifactHashAlgorithm(value, fallback = 'sha256') {
        const raw = String(value || fallback || '').trim().toLowerCase().replace(/[-_]/g, '');
        if (!raw) return '';
        if (raw === 'sha256') return 'sha256';
        if (raw === 'blake3') return 'blake3';
        throw new Error(`unsupported model artifact hash algorithm: ${value || fallback}`);
      }

    function artifactHashHex(value) {
        if (!value) return '';
        if (typeof value === 'object') {
          return artifactHashHex(value.hex || value.hash || value.digest || value.blake3 || value.sha256);
        }
        const text = String(value || '').trim().toLowerCase();
        if (!text) return '';
        const prefixed = text.match(/^[a-z0-9_-]+:([a-f0-9]+)$/i);
        return prefixed ? prefixed[1].toLowerCase() : text;
      }

    function artifactHashMismatchError(file, expected, actual) {
        const error = new Error(`cached model artifact hash mismatch for ${file.path}: expected=${expected} got=${actual || ''}`);
        error.code = 'SIMULATTE_MODEL_CACHE_HASH_MISMATCH';
        error.expectedHash = expected;
        error.actualHash = actual || '';
        error.artifactPath = file && file.path || '';
        return error;
      }

    async function assertArtifactBytesHash(file, bytes) {
        const hasher = await createArtifactHasher(file);
        updateArtifactHasher(hasher, bytes);
        return assertArtifactHasherHash(file, hasher);
      }

    async function assertArtifactHasherHash(file, hasher) {
        if (!hasher) return '';
        const expected = artifactHashHex(file && file.hash);
        const actual = await finalizeArtifactHasherHex(hasher);
        if (expected && actual !== expected) throw artifactHashMismatchError(file, expected, actual);
        return actual;
      }

    async function createArtifactHasher(file) {
        if (!artifactHashHex(file && file.hash)) return null;
        const algorithm = normalizeArtifactHashAlgorithm(file.hashAlgorithm || artifactHashAlgorithm(file.hash) || 'sha256');
        if (algorithm === 'blake3') {
          const blake3 = await loadBlake3Module();
          return {
            algorithm,
            blake3: blake3.createHasher(),
          };
        }
        if (algorithm === 'sha256') {
          return {
            algorithm,
            nodeHash: createNodeSha256Hash(),
            chunks: [],
            totalBytes: 0,
          };
        }
        throw new Error(`unsupported model artifact hash algorithm: ${algorithm}`);
      }

    function updateArtifactHasher(hasher, chunk) {
        if (!hasher || !chunk) return;
        const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        if (hasher.algorithm === 'blake3') {
          hasher.blake3.update(bytes);
          return;
        }
        if (hasher.nodeHash) {
          hasher.nodeHash.update(bytes);
          return;
        }
        hasher.chunks.push(bytes.slice());
        hasher.totalBytes += bytes.byteLength;
      }

    async function finalizeArtifactHasherHex(hasher) {
        if (hasher.algorithm === 'blake3') return bytesToHex(hasher.blake3.finalize());
        if (hasher.nodeHash) return hasher.nodeHash.digest('hex');
        const subtle = globalThis.crypto && globalThis.crypto.subtle;
        if (!subtle || typeof subtle.digest !== 'function') {
          throw new Error('SHA-256 model artifact verification requires crypto.subtle or node:crypto');
        }
        const digest = await subtle.digest('SHA-256', concatChunks(hasher.chunks, hasher.totalBytes));
        return bytesToHex(new Uint8Array(digest));
      }

    function createNodeSha256Hash() {
        try {
          if (typeof require === 'function') {
            return require('node:crypto').createHash('sha256');
          }
        } catch (_err) {
          return null;
        }
        return null;
      }

    async function loadBlake3Module() {
        if (globalThis.blake3 && typeof globalThis.blake3.createHasher === 'function') {
          return globalThis.blake3;
        }
        if (!blake3ModulePromise) {
          blake3ModulePromise = import(blake3ModuleUrl()).then((mod) => {
            if (!mod || typeof mod.createHasher !== 'function') {
              throw new Error('BLAKE3 model artifact verifier failed to load');
            }
            return mod;
          });
        }
        return blake3ModulePromise;
      }

    function blake3ModuleUrl() {
        if (typeof location !== 'undefined' && location.href) {
          return resolveUrl('./vendor/doppler/src/storage/blake3.js', location.href);
        }
        if (typeof require === 'function' && typeof __dirname !== 'undefined') {
          const path = require('node:path');
          const { pathToFileURL } = require('node:url');
          return pathToFileURL(path.resolve(__dirname, '../../vendor/doppler/src/storage/blake3.js')).href;
        }
        throw new Error('BLAKE3 model artifact verifier cannot resolve Doppler storage module');
      }

    function bytesToHex(bytes) {
        let out = '';
        for (let i = 0; i < bytes.length; i += 1) {
          out += bytes[i].toString(16).padStart(2, '0');
        }
        return out;
      }

    function concatChunks(chunks, total) {
        const out = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          out.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return out;
      }

    async function loadUniverseIndexes(manifestUrl, telemetry = {}) {
        const manifest = await fetchJson(manifestUrl, 'universe manifest', {
          ...telemetry,
          stage: 'index-fetch',
          percent: 13,
          resourceKind: 'universe-manifest',
        });
        if (!manifest || manifest.schema !== 'simulatte.universeManifest.v1') {
          throw new Error('universe manifest schema mismatch; expected simulatte.universeManifest.v1');
        }
        const entries = Object.entries(manifest.indexes || {});
        const indexes = {};
        await Promise.all(entries.map(async ([name, config]) => {
          if (!config || !config.artifact) throw new Error(`universe index ${name} missing artifact`);
    	      indexes[name] = await fetchJson(versionedAssetUrl(resolveUrl(config.artifact, manifestUrl), telemetry.assetVersionQuery), `universe ${name} index`, {
    	        ...telemetry,
    	        stage: 'index-fetch',
    	        percent: 14,
    	        resourceKind: `universe-${name}-index`,
    	        expectedHash: config.artifactHash || config.hash || null,
    	      });
        }));
        return { manifest, indexes };
      }

    function normalizeModelBackedRuntime(manifest, index, cardIndex = null, universe = null) {
        const normalizedIndex = normalizePrimitiveIndex(index, manifest);
        return {
          manifest,
          index: normalizedIndex,
          cardIndex: normalizeSurfaceCardIndex(cardIndex, manifest, normalizedIndex),
          universe: normalizeUniverseIndexes(universe, manifest),
          reranker: rerankerConfig(manifest),
        };
      }

    function normalizeUniverseIndexes(universe, manifest) {
        if (!universe) return null;
        if (!universe.manifest || universe.manifest.schema !== 'simulatte.universeManifest.v1') {
          throw new Error('universe index package missing manifest');
        }
        const universeLock = universe.manifest.modelRuntimeLock || {};
        const runtimeLock = manifest.modelRuntimeLock || {};
        if (
          universeLock.id !== runtimeLock.id ||
          Number(universeLock.number) !== Number(runtimeLock.number) ||
          hashHex(universeLock.artifactHash) !== hashHex(runtimeLock.artifactHash)
        ) {
          throw new Error('universe modelRuntimeLock must match the resolved intent model runtime lock');
        }
        const indexes = {};
        let documentCount = 0;
        for (const [name, index] of Object.entries(universe.indexes || {})) {
          if (!index || !Array.isArray(index.documents)) {
            throw new Error(`universe index ${name} missing documents`);
          }
          const rawDocs = index.documents;
          const embeddingDim = Number(index.embeddingDim || 0);
          const packedEmbeddings = index.embeddingsPackedBase64 && Number.isFinite(embeddingDim) && embeddingDim > 0
            ? decodePackedEmbeddings(
              index.embeddingsPackedBase64,
              rawDocs.length,
              embeddingDim,
              `universe ${name} embedding index`
            )
            : null;
          const featureDim = Number(index.featureDim || 0);
          const packedFeatures = index.featurePackedBase64 && Number.isFinite(featureDim) && featureDim > 0
            ? decodePackedEmbeddings(
              index.featurePackedBase64,
              rawDocs.length,
              featureDim,
              `universe ${name} feature index`
            )
            : null;
          if (packedFeatures) {
            const featureModelId = String(index.featureModelId || '');
            const expectedFeatureModelId = runtimeFeatureModelId();
            if (featureModelId !== expectedFeatureModelId) {
              throw new Error(
                `universe index ${name} featureModelId mismatch (${featureModelId || 'missing'} !== ${expectedFeatureModelId}); rebuild the index or align the runtime feature builder`
              );
            }
          }
          indexes[name] = {
            schema: index.schema || '',
            id: index.id || `simulatte-universe-${name}`,
            embedModelId: index.embedModelId || '',
            embeddingDim: packedEmbeddings ? embeddingDim : 0,
            featureModelId: index.featureModelId || '',
            featureDim: packedFeatures ? featureDim : 0,
            documents: rawDocs.map((doc, order) => {
              const embeddingOffset = order * embeddingDim;
              const featureOffset = order * featureDim;
              return {
                ...doc,
                order,
                indexName: name,
                vector: packedEmbeddings
                  ? normalizeEmbeddingVector(
                    packedEmbeddings.slice(embeddingOffset, embeddingOffset + embeddingDim),
                    `universe ${name} ${doc.id || order}`
                  )
                  : null,
                featureVector: packedFeatures
                  ? normalizeEmbeddingVector(
                    packedFeatures.slice(featureOffset, featureOffset + featureDim),
                    `universe ${name} feature ${doc.id || order}`
                  )
                  : null,
              };
            }),
          };
          documentCount += indexes[name].documents.length;
        }
        return {
          schema: universe.manifest.schema,
          id: universe.manifest.id || 'simulatte-universe',
          indexes,
          documentCount,
        };
      }

    function normalizePrimitiveIndex(index, manifest) {
        if (!index || index.schema !== 'simulatte.primitiveEmbeddingIndex.v2') {
          throw new Error('primitive embedding index schema mismatch; expected v2');
        }
        const embeddingDim = Number(index.embeddingDim);
        if (!Number.isFinite(embeddingDim) || embeddingDim <= 0 || Number(manifest.retrieval.dimensions) !== embeddingDim) {
          throw new Error('primitive embedding index dimensions mismatch');
        }
        if (index.embedModelId !== manifest.embedModel.id) {
          throw new Error(`primitive embedding index model mismatch (${index.embedModelId} !== ${manifest.embedModel.id})`);
        }
        const modelHash = hashHex(index.embedModelHash);
        const manifestHash = hashHex(manifest.embedModel.manifestHash);
        if (!modelHash || !manifestHash || modelHash !== manifestHash) {
          throw new Error('primitive embedding index embedModelHash must match manifest embedModel.manifestHash');
        }
        if (!Array.isArray(index.documents) || !index.documents.length) {
          throw new Error('primitive embedding index has no documents');
        }
        const packed = decodePackedEmbeddings(index.embeddingsPackedBase64, index.documents.length, embeddingDim);
        const documents = index.documents.map((doc, order) => {
          const primitiveId = String(doc.primitiveId || '');
          if (!primitiveId) throw new Error(`primitive embedding document missing primitiveId at ${order}`);
          const offset = order * embeddingDim;
          return {
            ...doc,
            order,
            vector: normalizeEmbeddingVector(packed.slice(offset, offset + embeddingDim), `primitive ${primitiveId}`),
          };
        });
        return {
          schema: index.schema,
          id: index.id || 'simulatte-primitive-model-index-v1',
          indexHash: index.indexHash || null,
          embedModelId: index.embedModelId,
          embedModelHash: index.embedModelHash,
          embedModelManifestHash: index.embedModelManifestHash || null,
          embeddingDim,
          documentCount: documents.length,
          documents,
          byId: new Map(documents.map((doc) => [doc.primitiveId, doc])),
        };
      }

    function normalizeSurfaceCardIndex(index, manifest, primitiveIndex) {
        if (!index) return null;
        if (index.schema !== 'simulatte.surfaceCardEmbeddingIndex.v1') {
          throw new Error('surface card embedding index schema mismatch; expected v1');
        }
        const embeddingDim = Number(index.embeddingDim);
        const expectedDim = Number(manifest.retrieval.cards && manifest.retrieval.cards.dimensions || primitiveIndex.embeddingDim);
        if (!Number.isFinite(embeddingDim) || embeddingDim <= 0 || embeddingDim !== expectedDim) {
          throw new Error('surface card embedding index dimensions mismatch');
        }
        if (index.embedModelId !== manifest.embedModel.id || index.embedModelId !== primitiveIndex.embedModelId) {
          throw new Error(`surface card embedding index model mismatch (${index.embedModelId} !== ${manifest.embedModel.id})`);
        }
        const modelHash = hashHex(index.embedModelHash);
        const manifestHash = hashHex(manifest.embedModel.manifestHash);
        if (!modelHash || !manifestHash || modelHash !== manifestHash) {
          throw new Error('surface card embedding index embedModelHash must match manifest embedModel.manifestHash');
        }
        if (!Array.isArray(index.documents) || !index.documents.length) {
          throw new Error('surface card embedding index has no documents');
        }
        const packed = decodePackedEmbeddings(index.embeddingsPackedBase64, index.documents.length, embeddingDim);
        const documents = index.documents.map((doc, order) => {
          const cardId = String(doc.cardId || '');
          if (!cardId) throw new Error(`surface card embedding document missing cardId at ${order}`);
          const offset = order * embeddingDim;
          return {
            ...doc,
            order,
            vector: normalizeEmbeddingVector(packed.slice(offset, offset + embeddingDim), `surface card ${cardId}`),
          };
        });
        return {
          schema: index.schema,
          id: index.id || 'simulatte-surface-card-model-index-v1',
          indexHash: index.indexHash || null,
          embedModelId: index.embedModelId,
          embedModelHash: index.embedModelHash,
          embedModelManifestHash: index.embedModelManifestHash || null,
          embeddingDim,
          documentCount: documents.length,
          documents,
          byId: new Map(documents.map((doc) => [doc.cardId, doc])),
        };
      }

    function decodePackedEmbeddings(base64, count, dimensions, label = 'primitive embedding index') {
        if (typeof base64 !== 'string' || !base64) {
          throw new Error(`${label} missing packed vectors`);
        }
        const bytes = base64ToBytes(base64);
        const expectedBytes = count * dimensions * 4;
        if (bytes.byteLength !== expectedBytes) {
          throw new Error(`${label} byte length mismatch (${bytes.byteLength} !== ${expectedBytes})`);
        }
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const values = new Float32Array(buffer);
        for (let i = 0; i < values.length; i += 1) {
          if (!Number.isFinite(values[i])) {
            throw new Error(`${label} has non-finite value at ${i}`);
          }
        }
        return values;
      }

    function normalizeEmbeddingVector(vector, label) {
        let normSq = 0;
        for (let i = 0; i < vector.length; i += 1) {
          const value = vector[i];
          if (!Number.isFinite(value)) throw new Error(`${label} embedding has non-finite value at ${i}`);
          normSq += value * value;
        }
        const norm = Math.sqrt(normSq);
        if (!Number.isFinite(norm) || norm <= 0) throw new Error(`${label} embedding has zero norm`);
        const out = new Float32Array(vector.length);
        for (let i = 0; i < vector.length; i += 1) out[i] = vector[i] / norm;
        return out;
      }

    function base64ToBytes(value) {
        if (typeof atob === 'function') {
          const raw = atob(value);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
          return bytes;
        }
        if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(value, 'base64'));
        throw new Error('base64 decoder unavailable');
      }

    function vectorsFor(index, candidates) {
        return candidates.map((primitive) => {
          const doc = index.byId.get(primitive.id);
          if (!doc) throw new Error(`primitive embedding missing for ${primitive.id}`);
          return doc.vector;
        });
      }

    function buildIntentEvidenceRows(payload = {}) {
        const rows = [];
        const add = (row, source) => {
          if (!row) return;
          const id = row.id || row.cardId || row.primitiveId || row.canonicalId || row.label || row.phrase;
          if (!id) return;
          rows.push({
            id: String(id),
            label: row.label || row.role || row.phrase || row.cardId || row.primitiveId || row.canonicalId || String(id),
            source: row.source || source,
            indexName: row.indexName || source,
            semanticType: row.semanticType || row.type || '',
            score: Number(row.score || row.modelScore || row.semanticScore || row.confidence || 0),
            aliases: row.aliases || row.labels || [],
            materialId: row.materialId || row.material || '',
            materialIds: row.materialIds || (row.materialId || row.material ? [row.materialId || row.material] : []),
            operatorHints: row.operatorHints || row.operatorTypes || row.operators || [],
            primitiveHints: row.primitiveHints || (row.primitiveId ? [row.primitiveId] : []),
            conceptIds: row.conceptIds || row.concepts || [],
            candidateText: row.candidateText || row.text || '',
    	        spanId: row.spanId || '',
    	        spanKind: row.spanKind || '',
    	        spanText: row.spanText || '',
    	        slotId: row.slotId || '',
    	        slotRole: row.slotRole || '',
    	        entryId: row.entryId || '',
    	        retrievalKind: row.retrievalKind || '',
    	        evidence: row.evidence || [String(id)],
          });
        };
        for (const row of payload.basePriors || []) add(row, 'embedding-primitive-prior');
        for (const row of payload.cardMatches || []) add(row, 'embedding-surface-card');
        for (const row of payload.universeMatches && payload.universeMatches.candidates || []) add(row, row.indexName || 'universe-index');
        for (const [indexName, matches] of Object.entries(payload.universeMatches && payload.universeMatches.byIndex || {})) {
          for (const row of matches || []) add(row, indexName);
        }
        for (const row of payload.semanticRag && payload.semanticRag.openComponents || []) add(row, 'semantic-rag-component');
        for (const row of payload.semanticRag && payload.semanticRag.surfaceRetrieved || []) add(row, 'semantic-rag-surface');
        for (const row of payload.dopplerIntent && payload.dopplerIntent.primitives || []) add(row, 'doppler-intent');
        for (const row of spanEvidenceRows(payload.spanRetrieval)) add(row, row.source || 'span-embedding-retrieval');
    	    for (const row of slotRetrievalEvidenceRows(payload.slotRetrieval)) add(row, row.source || 'slot-embedding-retrieval');
    	    const seen = new Set();
    	    const sortedRows = rows
    	      .filter((row) => {
    	        const key = `${row.id}:${row.source}`;
    	        if (seen.has(key)) return false;
    	        seen.add(key);
    	        return true;
    	      })
    	      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    	    const slotRows = sortedRows.filter((row) => row.retrievalKind === 'slot-retrieval');
    	    const otherRows = sortedRows.filter((row) => row.retrievalKind !== 'slot-retrieval');
    	    return [...slotRows, ...otherRows].slice(0, 260);
    	  }

    function spanConfigFor(runtime, options = {}, instanceConfig = undefined) {
        const manifestConfig = runtime && runtime.manifest && runtime.manifest.retrieval && runtime.manifest.retrieval.spanLevel || {};
        const optionConfig = normalizeSpanOption(options.spanLevelEmbedding);
        const instance = normalizeSpanOption(instanceConfig);
        const merged = {
          enabled: true,
          mode: 'progressive-refinement',
          fullPromptFirst: true,
          batchEmbedding: true,
          cache: true,
          dedupe: true,
          maxSpans: 18,
          minChars: 3,
          maxChars: 180,
          includeKinds: ['predicate-frame', 'clause', 'verb-phrase', 'noun-phrase', 'modifier', 'quantity'],
          perSpanPrimitiveMax: 8,
          perSpanCardMax: 6,
          perSpanUniverseMax: 10,
          perSpanCandidateMax: 22,
          primitiveScoreFloor: 0.18,
          surfaceScoreFloor: 0.22,
          universeScoreFloor: 0.14,
          primitiveRankBackend: 'cpu',
          ...manifestConfig,
          ...instance,
          ...optionConfig,
        };
        const urlMode = urlValue('spanLevelEmbedding') || urlValue('spanEmbedding');
        if (/^(0|false|off|disabled|none)$/i.test(urlMode)) merged.enabled = false;
        if (/^(1|true|on|enabled)$/i.test(urlMode)) merged.enabled = true;
        const urlMax = Number(urlValue('spanMax') || urlValue('maxSpanEmbeddings'));
        if (Number.isFinite(urlMax) && urlMax >= 0) merged.maxSpans = urlMax;
        const urlPrimitiveMax = Number(urlValue('spanPrimitiveMax'));
        if (Number.isFinite(urlPrimitiveMax) && urlPrimitiveMax >= 0) merged.perSpanPrimitiveMax = urlPrimitiveMax;
        const urlCardMax = Number(urlValue('spanCardMax'));
        if (Number.isFinite(urlCardMax) && urlCardMax >= 0) merged.perSpanCardMax = urlCardMax;
        const urlUniverseMax = Number(urlValue('spanUniverseMax'));
        if (Number.isFinite(urlUniverseMax) && urlUniverseMax >= 0) merged.perSpanUniverseMax = urlUniverseMax;
        const rankBackend = String(urlValue('spanPrimitiveRankBackend') || merged.primitiveRankBackend || 'cpu').toLowerCase();
        merged.primitiveRankBackend = ['cpu', 'webgpu', 'auto'].includes(rankBackend) ? rankBackend : 'cpu';
        merged.maxSpans = boundedInteger(merged.maxSpans, 0, 80, 18);
        merged.minChars = boundedInteger(merged.minChars, 1, 64, 3);
        merged.maxChars = boundedInteger(merged.maxChars, merged.minChars, 512, 180);
        merged.perSpanPrimitiveMax = boundedInteger(merged.perSpanPrimitiveMax, 0, 64, 8);
        merged.perSpanCardMax = boundedInteger(merged.perSpanCardMax, 0, 64, 6);
        merged.perSpanUniverseMax = boundedInteger(merged.perSpanUniverseMax, 0, 80, 10);
        merged.perSpanCandidateMax = boundedInteger(merged.perSpanCandidateMax, 0, 160, 22);
        merged.primitiveScoreFloor = boundedNumber(merged.primitiveScoreFloor, 0, 1, 0.18);
        merged.surfaceScoreFloor = boundedNumber(merged.surfaceScoreFloor, 0, 1, 0.22);
        merged.universeScoreFloor = boundedNumber(merged.universeScoreFloor, 0, 1, 0.14);
        merged.includeKinds = normalizeStringList(merged.includeKinds);
        merged.enabled = Boolean(merged.enabled);
        merged.batchEmbedding = merged.batchEmbedding !== false;
        merged.cache = merged.cache !== false;
        merged.dedupe = merged.dedupe !== false;
        return merged;
      }

    function normalizeSpanOption(value) {
        if (value === true) return { enabled: true };
        if (value === false) return { enabled: false };
        if (value && typeof value === 'object') return value;
        return {};
      }

    Object.assign(scope, {
      fetchJson,
      assertJsonResourceHash,
      readJsonResponseWithProgress,
      emitFetchJsonProgress,
      progressHandler,
      emitProgress,
      emitRuntimeProgress,
      logEmbeddingTrace,
      nowMs,
      elapsedMsSince,
      clampProgress,
      traceEnabled,
      truthyValue,
      normalizeDopplerProgress,
      dopplerModelSource,
      artifactHashAlgorithm,
      normalizeArtifactHashAlgorithm,
      artifactHashHex,
      artifactHashMismatchError,
      assertArtifactBytesHash,
      assertArtifactHasherHash,
      createArtifactHasher,
      updateArtifactHasher,
      finalizeArtifactHasherHex,
      createNodeSha256Hash,
      loadBlake3Module,
      blake3ModuleUrl,
      bytesToHex,
      concatChunks,
      loadUniverseIndexes,
      normalizeModelBackedRuntime,
      normalizeUniverseIndexes,
      normalizePrimitiveIndex,
      normalizeSurfaceCardIndex,
      decodePackedEmbeddings,
      normalizeEmbeddingVector,
      base64ToBytes,
      vectorsFor,
      buildIntentEvidenceRows,
      spanConfigFor,
      normalizeSpanOption,
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
